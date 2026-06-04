import { useEffect, useMemo, useRef, useState } from "react";
import {
  api, type CurrentSessionResponse, type MatchView, type Rank,
} from "../../api";
import {
  CurrentCourtRankingDrawer,
  OtherCourtsRankingDrawer,
  FullAssignmentsDrawer,
} from "../RankingDrawers";

const MATCH_LENGTH_MIN = 15;
const POLL_INTERVAL_MS = 20_000; // 每 20 秒拉一次最新比分,让多人计分同步

/**
 * 比赛中:不展示场地成员列表,仅场地名 + 完整分组入口
 * 主区域是双打轮转(可编辑比分)
 */
export function StagePlaying({
  data, onChange,
}: {
  data: CurrentSessionResponse;
  onChange: () => void;
}) {
  const { session, courts, assignments, matches, me, scoreCap } = data;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // 多人计分场景:定期 refetch 让其他用户填的比分自动同步过来
  useEffect(() => {
    const t = setInterval(() => onChange(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [onChange]);

  const myAssignment = useMemo(() => {
    if (!me) return null;
    return (assignments ?? []).find((a) => a.larkOpenId === me.openId) ?? null;
  }, [me, assignments]);

  const myCourt = useMemo(() => {
    if (!myAssignment) return null;
    return courts.find((c) => c.id === myAssignment.courtId) ?? null;
  }, [myAssignment, courts]);

  const myCourtMatches = useMemo(() => {
    if (!myCourt) return [];
    return (matches ?? [])
      .filter((m) => m.courtId === myCourt.id)
      .sort((a, b) => a.roundNum - b.roundNum);
  }, [myCourt, matches]);

  // 段位
  const [ranks, setRanks] = useState<Record<string, Rank>>({});
  useEffect(() => {
    const ids = (assignments ?? [])
      .map((a) => a.larkOpenId)
      .filter((x): x is string => !!x);
    if (ids.length === 0) return;
    api.bulkRanks(ids).then((r) => setRanks(r.ranks)).catch(() => {});
  }, [assignments]);

  const [showRanking, setShowRanking] = useState(false);
  const [showOtherCourts, setShowOtherCourts] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const sessionDate = new Date(session.eventStartAt).toISOString().slice(0, 10);

  if (!myCourt) {
    return (
      <>
        <div className="card opps-card">
          <div className="opps-icon">🥲</div>
          <div className="opps-title">你不在本场比赛中</div>
          <div className="opps-sub">期待下周再来 💪</div>
        </div>
        <button className="btn-secondary" onClick={() => setShowFull(true)}>
          📋 查看完整分组
        </button>
        {showFull && (
          <FullAssignmentsDrawer
            courts={courts}
            assignments={assignments ?? []}
            ranks={ranks}
            onClose={() => setShowFull(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <MatchListBlock
        matches={myCourtMatches}
        eventStartAt={session.eventStartAt}
        scoreCap={scoreCap}
        now={now}
        courtName={myCourt.name}
        onShowFull={() => setShowFull(true)}
        onShowRanking={() => setShowRanking(true)}
        onSaved={onChange}
      />

      <button className="btn-secondary" onClick={() => setShowOtherCourts(true)}>
        🔍 查看其他场次
      </button>

      {showRanking && (
        <CurrentCourtRankingDrawer
          courtId={myCourt.id}
          courtName={myCourt.name}
          sessionDate={sessionDate}
          onClose={() => setShowRanking(false)}
        />
      )}
      {showOtherCourts && (
        <OtherCourtsRankingDrawer
          courts={courts}
          currentCourtId={myCourt.id}
          sessionDate={sessionDate}
          onClose={() => setShowOtherCourts(false)}
        />
      )}
      {showFull && (
        <FullAssignmentsDrawer
          courts={courts}
          assignments={assignments ?? []}
          ranks={ranks}
          onClose={() => setShowFull(false)}
        />
      )}
    </>
  );
}

/* ---------- 比赛列表 ---------- */
type MatchStatus = "past" | "current" | "future";

function MatchListBlock({
  matches, eventStartAt, scoreCap, now,
  courtName, onShowFull, onShowRanking, onSaved,
}: {
  matches: MatchView[];
  eventStartAt: string;
  scoreCap: number;
  now: Date;
  courtName: string;
  onShowFull: () => void;
  onShowRanking: () => void;
  onSaved: () => void;
}) {
  const eventStart = new Date(eventStartAt);
  const statuses = useMemo(
    () => computeStatuses(matches, eventStart, now, scoreCap),
    [matches, eventStart, now, scoreCap]);

  return (
    <div className="card">
      <div className="match-block-header">
        <h3 className="card-title" style={{ margin: 0 }}>
          <span className="card-title-icon">🥏</span>
          双打轮换 ({courtName})
        </h3>
        <button className="full-group-link" onClick={onShowFull}>
          完整分组 ›
        </button>
      </div>

      {matches.length === 0 ? (
        <div className="empty" style={{ padding: 16 }}>
          人数不足 4 人,未排轮次
        </div>
      ) : (
        <div>
          {matches.map((m) => (
            <MatchRow
              key={m.id}
              match={m}
              status={statuses.get(m.id) ?? "past"}
              scoreCap={scoreCap}
              onSaved={onSaved}
            />
          ))}
        </div>
      )}

      {matches.length > 0 && (
        <div className="match-block-footer">
          <button className="text-link" onClick={onShowRanking}>
            🏆 查看排名 ›
          </button>
        </div>
      )}
    </div>
  );
}

function computeStatuses(
  matches: MatchView[], eventStart: Date, now: Date, scoreCap: number,
): Map<number, MatchStatus> {
  const map = new Map<number, MatchStatus>();
  const sorted = [...matches].sort((a, b) => a.roundNum - b.roundNum);
  let liveAssigned = false;
  for (const m of sorted) {
    const reached = (m.scoreA ?? 0) >= scoreCap || (m.scoreB ?? 0) >= scoreCap;
    if (reached) { map.set(m.id, "past"); continue; }
    if (liveAssigned) { map.set(m.id, "future"); continue; }
    const startMs = eventStart.getTime() + (m.roundNum - 1) * MATCH_LENGTH_MIN * 60_000;
    const endMs = startMs + MATCH_LENGTH_MIN * 60_000;
    const t = now.getTime();
    if (t >= startMs && t < endMs) {
      map.set(m.id, "current"); liveAssigned = true;
    } else if (t >= endMs) {
      map.set(m.id, "past");
    } else {
      const allPrevPast = sorted.filter((x) => x.roundNum < m.roundNum)
        .every((x) => map.get(x.id) === "past");
      if (allPrevPast) {
        map.set(m.id, "current"); liveAssigned = true;
      } else {
        map.set(m.id, "future");
      }
    }
  }
  return map;
}

function MatchRow({
  match, status, scoreCap, onSaved,
}: {
  match: MatchView;
  status: MatchStatus;
  scoreCap: number;
  onSaved: () => void;
}) {
  const [a, setA] = useState(match.scoreA?.toString() ?? "");
  const [b, setB] = useState(match.scoreB?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  // 当前 input 是否处于编辑中(focus + 未保存)。防止 polling 触发的 refetch
  // 覆盖用户正在输入的内容。
  const editingRef = useRef(false);

  useEffect(() => {
    if (editingRef.current) return;
    setA(match.scoreA?.toString() ?? "");
    setB(match.scoreB?.toString() ?? "");
  }, [match.scoreA, match.scoreB]);

  const save = async (newA: string, newB: string) => {
    const sa = newA === "" ? null : clamp(parseInt(newA, 10) || 0, scoreCap);
    const sb = newB === "" ? null : clamp(parseInt(newB, 10) || 0, scoreCap);
    if (sa === (match.scoreA ?? null) && sb === (match.scoreB ?? null)) {
      editingRef.current = false;
      return;
    }
    setSaving(true);
    try { await api.updateScore(match.id, sa, sb); onSaved(); }
    catch (err: any) { alert(err?.message ?? "保存失败"); }
    finally { setSaving(false); editingRef.current = false; }
  };

  const handleFocus = () => { editingRef.current = true; };
  const handleBlur = () => save(a, b);
  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <div className={"match-row match-" + status + (saving ? " saving" : "")}>
      <Team players={match.teamA} side="left" />
      <div className="score-box">
        <div className="score-pair">
          <input className="score-input" type="number" min={0} max={scoreCap}
            value={a} onChange={(e) => setA(e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleEnter}
            placeholder="-" inputMode="numeric" />
          <span className="score-sep">:</span>
          <input className="score-input" type="number" min={0} max={scoreCap}
            value={b} onChange={(e) => setB(e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleEnter}
            placeholder="-" inputMode="numeric" />
        </div>
        <div className="round-meta">
          {status === "current" && <span className="live-dot">🔴 LIVE · </span>}
          {status === "past" && <span style={{ color: "var(--text-dim)" }}>✓ 完赛 · </span>}
          第 {match.roundNum} 轮
        </div>
      </div>
      <Team players={match.teamB} side="right" />
    </div>
  );
}

function Team({ players, side }: { players: MatchView["teamA"]; side: "left" | "right" }) {
  return (
    <div className={"team " + side}>
      {players.map((p) => (
        <div className="team-player" key={p.id}>
          {side === "right" && <GenderDot gender={p.gender} />}
          <span className="player-name">{p.name}</span>
          {side === "left" && <GenderDot gender={p.gender} />}
        </div>
      ))}
    </div>
  );
}

function GenderDot({ gender }: { gender: "男" | "女" | null }) {
  return (
    <span className={
      "gender-dot " +
      (gender === "男" ? "male" : gender === "女" ? "female" : "none")
    } title={gender ?? "未填"} />
  );
}

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(max, n));
}

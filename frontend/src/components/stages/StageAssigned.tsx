import { useEffect, useMemo, useState } from "react";
import {
  api, type CurrentSessionResponse, type Rank,
} from "../../api";
import { RankBadge } from "../RankBadge";
import { FullAssignmentsDrawer } from "../RankingDrawers";

/**
 * 分组公布状态
 * - 进入分组:展示我的场次
 * - 没进入(未报名 or 候补):Opps 卡片
 */
export function StageAssigned({
  data, onClickUser,
}: {
  data: CurrentSessionResponse;
  onClickUser: (openId: string) => void;
}) {
  const { courts, assignments, me, venue, mySignup } = data;
  const [showFull, setShowFull] = useState(false);

  const myAssignment = useMemo(() => {
    if (!me) return null;
    return (assignments ?? []).find((a) => a.larkOpenId === me.openId) ?? null;
  }, [me, assignments]);

  const myCourt = useMemo(() => {
    if (!myAssignment) return null;
    return courts.find((c) => c.id === myAssignment.courtId) ?? null;
  }, [myAssignment, courts]);

  const myCourtMembers = useMemo(() => {
    if (!myCourt) return [];
    return (assignments ?? [])
      .filter((a) => a.courtId === myCourt.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [myCourt, assignments]);

  // 拉段位
  const [ranks, setRanks] = useState<Record<string, Rank>>({});
  useEffect(() => {
    const ids = (assignments ?? [])
      .map((a) => a.larkOpenId)
      .filter((x): x is string => !!x);
    if (ids.length === 0) return;
    api.bulkRanks(ids).then((r) => setRanks(r.ranks)).catch(() => {});
  }, [assignments]);

  // 未报名 or 报名但是候补未晋升 → Opps
  const missedReason = !mySignup
    ? "本场你没有报名"
    : mySignup.isWaitlist
      ? "你在候补名单中,本场未进入正式比赛"
      : !myAssignment
        ? "你已报名但暂未分到场地"
        : null;

  if (missedReason) {
    return (
      <>
        <VenueCard venue={venue} />
        <div className="card opps-card">
          <div className="opps-icon">🥲</div>
          <div className="opps-title">Opps,很遗憾错过本周比赛!</div>
          <div className="opps-sub">{missedReason}</div>
          <div className="opps-hint">期待下周再来 💪</div>
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
      <VenueCard venue={venue} />

      <div className="card">
        <div className="court-header">
          <h3>你的场次:{myCourt!.court_type === "竞技" ? "竞技场" : "休闲场"}</h3>
          <button className="full-group-link" onClick={() => setShowFull(true)}>
            完整分组 ›
          </button>
        </div>

        <ul className="signup-list">
          {myCourtMembers.map((m, idx) => (
            <li key={m.id}
              className={"signup-item" + (m.larkOpenId === me?.openId ? " me" : "")
                + (m.larkOpenId ? " clickable" : "")}
              onClick={() => m.larkOpenId && onClickUser(m.larkOpenId)}
            >
              <span className="position">{idx + 1}</span>
              <div className="avatar">{initials(m.userName)}</div>
              <span className="name">
                {m.userName}
                {m.larkOpenId === me?.openId && (
                  <span className="meta" style={{ color: "var(--primary)" }}>(我)</span>
                )}
                {m.isManual && <span className="meta">(手动)</span>}
                {m.larkOpenId && <RankBadge rank={ranks[m.larkOpenId] ?? null} compact />}
              </span>
              <GenderDot gender={m.gender} />
            </li>
          ))}
        </ul>
      </div>

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

function VenueCard({ venue }: { venue: { name: string; address: string } }) {
  if (!venue.name) return null;
  return (
    <div className="card venue-card">
      <div className="venue-name">🏟 {venue.name}</div>
      {venue.address && <div className="venue-addr">{venue.address}</div>}
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

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

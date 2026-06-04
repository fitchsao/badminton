import { useMemo, useState } from "react";
import {
  type CurrentSessionResponse, type MatchView,
} from "../../api";
import { SubscribeButton } from "../SubscribeButton";
import { MyMatchDetailModal } from "../MyMatchDetailModal";
import {
  CurrentCourtRankingDrawer,
  OtherCourtsRankingDrawer,
  FullAssignmentsDrawer,
} from "../RankingDrawers";

/**
 * 比赛后:精简战绩卡 + 「查看详细」入口(只读弹窗) + 下周订阅
 * 不直接展示轮转
 */
export function StageAfter({
  data,
}: {
  data: CurrentSessionResponse;
}) {
  const { session, courts, assignments, matches, me, venue } = data;

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

  // 我的战绩统计(本场)
  const myStats = useMemo(() => {
    if (!myAssignment || myCourtMatches.length === 0) return null;
    return computeMyStats(myCourtMatches, myAssignment.id);
  }, [myCourtMatches, myAssignment]);

  const [showDetail, setShowDetail] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const sessionDate = new Date(session.eventStartAt).toISOString().slice(0, 10);

  return (
    <>
      <VenueCard venue={venue} />

      {/* 我没有参与比赛 */}
      {!myCourt && (
        <div className="card opps-card">
          <div className="opps-icon">🥲</div>
          <div className="opps-title">本周比赛你没有参与</div>
          <div className="opps-sub">期待下周再来 💪</div>
        </div>
      )}

      {/* 我参与了比赛 - 战绩速览 */}
      {myCourt && myStats && (
        <div className="card my-stats-card">
          <h3 className="card-title">
            <span className="card-title-icon">🎯</span>你今天的战绩
          </h3>
          <div className="stats-grid">
            <div className="stat-cell">
              <div className="stat-val">{myStats.wins}</div>
              <div className="stat-label">胜场</div>
            </div>
            <div className="stat-cell">
              <div className="stat-val">{myStats.losses}</div>
              <div className="stat-label">负场</div>
            </div>
            <div className="stat-cell">
              <div className={"stat-val " + (myStats.scoreDiff >= 0 ? "pos" : "neg")}>
                {myStats.scoreDiff >= 0 ? "+" : ""}{myStats.scoreDiff}
              </div>
              <div className="stat-label">净胜分</div>
            </div>
          </div>
          <button className="btn-secondary" onClick={() => setShowDetail(true)}
            style={{ marginTop: 12 }}>
            查看详细 ›
          </button>
        </div>
      )}

      {/* 排名 / 其他场地操作栏 */}
      {myCourt && (
        <div className="match-actions">
          <button className="btn-action" onClick={() => setShowRanking(true)}>
            🏆 查看排名
          </button>
          <button className="btn-action" onClick={() => setShowOther(true)}>
            🔍 查看其他场次
          </button>
          <button className="btn-action" onClick={() => setShowFull(true)}>
            📋 完整分组
          </button>
        </div>
      )}

      {/* 下周报名提醒 */}
      <div className="card">
        <h3 className="card-title">
          <span className="card-title-icon">📅</span>下周报名提醒
        </h3>
        <SubscribeButton />
        <div className="hint" style={{ marginTop: 8 }}>
          订阅后,下周报名开放时会私信通知你
        </div>
      </div>

      {showDetail && myCourt && (
        <MyMatchDetailModal
          courtName={myCourt.name}
          matches={myCourtMatches}
          onClose={() => setShowDetail(false)}
        />
      )}
      {showRanking && myCourt && (
        <CurrentCourtRankingDrawer
          courtId={myCourt.id}
          courtName={myCourt.name}
          sessionDate={sessionDate}
          onClose={() => setShowRanking(false)}
        />
      )}
      {showOther && myCourt && (
        <OtherCourtsRankingDrawer
          courts={courts}
          currentCourtId={myCourt.id}
          sessionDate={sessionDate}
          onClose={() => setShowOther(false)}
        />
      )}
      {showFull && (
        <FullAssignmentsDrawer
          courts={courts}
          assignments={assignments ?? []}
          ranks={{}}
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

function computeMyStats(matches: MatchView[], myAssignmentId: number) {
  let wins = 0, losses = 0, draws = 0, scoreDiff = 0;
  for (const m of matches) {
    if (m.scoreA === null || m.scoreB === null) continue;
    const inA = m.teamA.some((p) => p.id === myAssignmentId);
    const inB = m.teamB.some((p) => p.id === myAssignmentId);
    if (!inA && !inB) continue;
    const my = inA ? m.scoreA : m.scoreB;
    const opp = inA ? m.scoreB : m.scoreA;
    scoreDiff += (my - opp);
    if (my > opp) wins++;
    else if (my < opp) losses++;
    else draws++;
  }
  return { wins, losses, draws, scoreDiff };
}

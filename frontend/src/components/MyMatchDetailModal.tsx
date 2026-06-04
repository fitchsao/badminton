import type { MatchView } from "../api";

/**
 * 比赛后查看自己场次的轮转 + 比分(只读,不可编辑)
 */
export function MyMatchDetailModal({
  courtName, matches, onClose,
}: {
  courtName: string;
  matches: MatchView[];
  onClose: () => void;
}) {
  const sorted = [...matches].sort((a, b) => a.roundNum - b.roundNum);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{courtName} · 轮转详情</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {sorted.length === 0 ? (
            <div className="empty">无比赛记录</div>
          ) : (
            <div>
              {sorted.map((m) => {
                const filled = m.scoreA !== null && m.scoreB !== null;
                const wonA = filled && (m.scoreA ?? 0) > (m.scoreB ?? 0);
                const wonB = filled && (m.scoreB ?? 0) > (m.scoreA ?? 0);
                return (
                  <div key={m.id} className="match-row match-past readonly">
                    <Team players={m.teamA} side="left" won={wonA} />
                    <div className="score-box">
                      <div className="score-pair">
                        <span className={"score-display" + (m.scoreA === null ? " empty" : "")}>
                          {m.scoreA ?? "—"}
                        </span>
                        <span className="score-sep">:</span>
                        <span className={"score-display" + (m.scoreB === null ? " empty" : "")}>
                          {m.scoreB ?? "—"}
                        </span>
                      </div>
                      <div className="round-meta">第 {m.roundNum} 轮</div>
                    </div>
                    <Team players={m.teamB} side="right" won={wonB} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Team({
  players, side, won,
}: {
  players: MatchView["teamA"];
  side: "left" | "right";
  won: boolean;
}) {
  return (
    <div className={"team " + side + (won ? " won" : "")}>
      {players.map((p) => (
        <div className="team-player" key={p.id}>
          <span className="player-name">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

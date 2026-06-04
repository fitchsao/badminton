import { useEffect, useState } from "react";
import { api, type LeaderboardEntry, type Court } from "../api";
import { LeaderboardPosterEmbed } from "./LeaderboardPoster";

/**
 * 「查看排名」 - 当前用户所在场地的排名
 * 一次性显示;底部带海报生成
 */
export function CurrentCourtRankingDrawer({
  courtId, courtName, sessionDate, onClose,
}: {
  courtId: number;
  courtName: string;
  sessionDate: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getCourtLeaderboard(courtId)
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e.message));
  }, [courtId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🏆 {courtName} · 排名</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}
          {!entries && !error && <div className="empty">加载中…</div>}

          {entries && (
            <RankingPanel
              entries={entries}
              title={`${courtName} 排名`}
              subtitle="本场赛况"
              dateLabel={sessionDate}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 「查看其他场次」 - 两阶段
 * 1. 选择场地(标题:选择查看场地)
 * 2. 该场地排名(标题:当前场次赛况)
 */
export function OtherCourtsRankingDrawer({
  courts, currentCourtId, sessionDate, onClose,
}: {
  courts: Court[];
  currentCourtId: number | null;
  sessionDate: string;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Court | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const others = courts.filter((c) => c.id !== currentCourtId);

  useEffect(() => {
    if (!picked) return;
    setEntries(null);
    setError(null);
    api.getCourtLeaderboard(picked.id)
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e.message));
  }, [picked]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{picked ? "当前场次赛况" : "选择查看场地"}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {picked && (
              <button className="btn-icon" onClick={() => setPicked(null)} title="返回">
                ←
              </button>
            )}
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          {!picked && (
            <div className="court-picker">
              {others.length === 0
                ? <div className="empty">没有其他场地可看</div>
                : others.map((c) => (
                  <button key={c.id} className="court-pick-card"
                    onClick={() => setPicked(c)}
                  >
                    <span className={`badge ${c.court_type === "竞技" ? "badge-accent" : "badge-primary"}`}>
                      {c.court_type === "竞技" ? "🔥 竞技" : "☕ 休闲"}
                    </span>
                    <span className="court-pick-name">{c.name}</span>
                    <span className="court-pick-arrow">›</span>
                  </button>
                ))}
            </div>
          )}

          {picked && (
            <>
              <div className="court-header" style={{ marginBottom: 12 }}>
                <span className={`badge ${picked.court_type === "竞技" ? "badge-accent" : "badge-primary"}`}>
                  {picked.court_type === "竞技" ? "🔥 竞技" : "☕ 休闲"}
                </span>
                <h3>{picked.name}</h3>
              </div>
              {error && <div className="error-banner">{error}</div>}
              {!entries && !error && <div className="empty">加载中…</div>}
              {entries && (
                <RankingPanel
                  entries={entries}
                  title={`${picked.name} 排名`}
                  subtitle="当前场次赛况"
                  dateLabel={sessionDate}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 排名表 + 海报生成入口
 */
function RankingPanel({
  entries, title, subtitle, dateLabel,
}: {
  entries: LeaderboardEntry[];
  title: string;
  subtitle: string;
  dateLabel: string;
}) {
  const [showPoster, setShowPoster] = useState(false);

  return (
    <>
      {entries.length === 0 ? (
        <div className="empty" style={{ padding: 20 }}>
          <div className="empty-icon">🤷</div>
          还没有比赛数据
        </div>
      ) : (
        <>
          <div className="ranking-table">
            {entries.map((e) => (
              <div key={e.rank} className={"ranking-row" + (e.rank <= 3 ? " top" : "")}>
                <span className="ranking-rank">
                  {e.rank === 1 && "🥇"}
                  {e.rank === 2 && "🥈"}
                  {e.rank === 3 && "🥉"}
                  {e.rank > 3 && e.rank}
                </span>
                <div className="avatar sm">{initials(e.name)}</div>
                <span className="ranking-name">{e.name}</span>
                <span className="ranking-stat">
                  <strong>{e.wins}</strong>
                  <span style={{ color: "var(--text-dim)" }}>胜</span>
                </span>
                <span className={"ranking-diff " + (e.scoreDiff >= 0 ? "pos" : "neg")}>
                  {e.scoreDiff >= 0 ? "+" : ""}{e.scoreDiff}
                </span>
              </div>
            ))}
          </div>
          <div className="hint" style={{ textAlign: "center", margin: "8px 0 12px" }}>
            排序:胜场 → 净胜分 → 总得分
          </div>

          {!showPoster ? (
            <button className="btn-secondary" onClick={() => setShowPoster(true)}>
              📸 生成排行榜海报
            </button>
          ) : (
            <div style={{ marginTop: 12 }}>
              <LeaderboardPosterEmbed
                title={title}
                subtitle={subtitle}
                dateLabel={dateLabel}
                entries={entries}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}

/**
 * 「查看完整分组」 - 显示所有场地的成员名单(含段位徽章)
 */
import { type Rank, type AssignmentView } from "../api";
import { RankBadge } from "./RankBadge";

export function FullAssignmentsDrawer({
  courts, assignments, ranks, onClose,
}: {
  courts: Court[];
  assignments: AssignmentView[];
  ranks: Record<string, Rank>;
  onClose: () => void;
}) {
  const assignByCourt = new Map<number, AssignmentView[]>();
  for (const a of assignments) {
    const arr = assignByCourt.get(a.courtId) ?? [];
    arr.push(a);
    assignByCourt.set(a.courtId, arr);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📋 完整分组</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {courts.length === 0 && <div className="empty">无场地</div>}
          {courts.map((c) => {
            const members = (assignByCourt.get(c.id) ?? [])
              .sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <div key={c.id} style={{ marginBottom: 16 }}>
                <div className="court-header">
                  <span className={`badge ${c.court_type === "竞技" ? "badge-accent" : "badge-primary"}`}>
                    {c.court_type === "竞技" ? "🔥 竞技" : "☕ 休闲"}
                  </span>
                  <h3>{c.name}</h3>
                  <span className="court-meta">{members.length}/{c.max_players}</span>
                </div>
                {members.length === 0 ? (
                  <div className="empty" style={{ padding: 12, fontSize: 12 }}>无成员</div>
                ) : (
                  <ul className="signup-list">
                    {members.map((m, idx) => (
                      <li key={m.id} className="signup-item">
                        <span className="position">{idx + 1}</span>
                        <div className="avatar">{initials(m.userName)}</div>
                        <span className="name">
                          {m.userName}
                          {m.isManual && <span className="meta">(手动)</span>}
                        </span>
                        {m.larkOpenId && <RankBadge rank={ranks[m.larkOpenId] ?? null} />}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

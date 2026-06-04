import { useEffect, useState } from "react";
import { api, type UserStats } from "../api";

/**
 * 个人中心(底部 tab "个人" 入口) — 展示当前用户自己的战绩
 *
 * onClickUser: 点击搭档头像 → 弹出对方的 UserPreviewModal
 */
export function PersonalPage({
  openId, onClickUser,
}: {
  openId: string | null;
  onClickUser: (openId: string) => void;
}) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!openId) return;
    api.getUserStats(openId).then(setStats).catch((err) => setError(err.message));
  }, [openId]);

  if (!openId) return <div className="empty">请先登录</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!stats) return <div className="empty">加载中…</div>;

  const hasMatches = stats.totalMatches > 0;
  const winRate = hasMatches
    ? `${Math.round(stats.totalWins / stats.totalMatches * 100)}%`
    : "-";
  const wld = hasMatches
    ? `${stats.totalWins}/${stats.totalLosses}/${stats.totalDraws}`
    : "-";

  const topPartners = stats.topPartners.slice(0, 5);

  return (
    <>
      <div className="user-card-header">
        <div className="avatar lg">
          {stats.avatar
            ? <img src={stats.avatar} alt="" />
            : initials(stats.userName)}
        </div>
        <div>
          <div className="user-name">{stats.userName}</div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCell label="比赛场数" value={hasMatches ? stats.totalMatches : "-"} />
        <StatCell label="胜率" value={winRate} accent />
        <StatCell label="战绩 W/L/D" value={wld} />
      </div>

      <div className="card">
        <h3 className="card-title">
          <span className="card-title-icon">🤝</span>常一起打的搭档
        </h3>
        {topPartners.length === 0 ? (
          <div className="empty" style={{ padding: 16, fontSize: 13 }}>
            暂无搭档数据,参与几场比赛后回来查看吧
          </div>
        ) : (
          <ul className="signup-list">
            {topPartners.map((p) => (
              <li key={p.name + p.openId}
                className={"signup-item " + (p.openId ? "clickable" : "")}
                onClick={() => p.openId && onClickUser(p.openId)}
              >
                <div className="avatar">{initials(p.name)}</div>
                <span className="name">{p.name}</span>
                <span className="meta">
                  共 {p.totalWith} 场 · 一起赢 {p.wins} 场
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function StatCell({
  label, value, accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="stat-cell">
      <div className={"stat-val " + (accent ? "accent" : "")}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

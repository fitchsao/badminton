import { useEffect, useState } from "react";
import { api, type UserStats } from "../api";
import { RankBadge } from "./RankBadge";

/**
 * 点击头像/名字弹出的简约个人卡
 * - 头像 + 名字 + 段位
 * - 最近 3 个月战绩摘要
 * - 「查看完整战绩 ›」入口跳到个人中心(由父层处理 navigation)
 */
export function UserPreviewModal({
  openId, onClose, onSeeFull,
}: {
  openId: string;
  onClose: () => void;
  onSeeFull: () => void;
}) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getUserStats(openId)
      .then(setStats)
      .catch((e) => setError(e.message));
  }, [openId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-compact" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>个人信息</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}
          {!stats && !error && <div className="empty">加载中…</div>}

          {stats && (
            <>
              <div className="preview-card">
                <div className="avatar lg">
                  {stats.avatar ? <img src={stats.avatar} alt="" /> : initials(stats.userName)}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="preview-name">{stats.userName}</div>
                  <div style={{ marginTop: 4 }}>
                    <RankBadge rank={stats.rank} size="md" />
                  </div>
                </div>
              </div>

              <div className="preview-stats">
                <div className="preview-stat">
                  <div className="preview-stat-value">{stats.totalMatches}</div>
                  <div className="preview-stat-label">总场数</div>
                </div>
                <div className="preview-stat">
                  <div className="preview-stat-value accent">
                    {stats.totalMatches > 0
                      ? Math.round(stats.totalWins / stats.totalMatches * 100) + "%"
                      : "—"}
                  </div>
                  <div className="preview-stat-label">胜率</div>
                </div>
                <div className="preview-stat">
                  <div className="preview-stat-value">
                    {stats.totalWins}/{stats.totalLosses}
                  </div>
                  <div className="preview-stat-label">胜/负</div>
                </div>
              </div>

              <button className="btn-secondary" onClick={onSeeFull}>
                查看完整战绩 ›
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

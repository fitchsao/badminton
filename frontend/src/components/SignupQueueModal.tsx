import type { SignupView, Rank } from "../api";
import { RankBadge } from "./RankBadge";

/**
 * 报名队列弹窗 - 显示正式 + 候补完整列表
 */
export function SignupQueueModal({
  signups, maxSlots, myOpenId, ranks, onClose, onClickUser,
}: {
  signups: SignupView[];
  maxSlots: number;
  myOpenId: string | null;
  ranks: Record<string, Rank>;
  onClose: () => void;
  onClickUser: (openId: string) => void;
}) {
  const formal = signups.filter((s) => !s.isWaitlist);
  const waitlist = signups.filter((s) => s.isWaitlist);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📝 报名队列</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="queue-section">
            <h3 className="queue-section-title">
              <span>✅ 正式名单</span>
              <span className="badge badge-muted">{formal.length}/{maxSlots}</span>
            </h3>
            {formal.length === 0
              ? <div className="empty" style={{ padding: 16 }}>暂无报名</div>
              : <ul className="signup-list">
                  {formal.map((s) => (
                    <Row key={s.larkOpenId} signup={s} myOpenId={myOpenId}
                      ranks={ranks} onClickUser={onClickUser} />
                  ))}
                </ul>}
          </div>

          {waitlist.length > 0 && (
            <div className="queue-section">
              <h3 className="queue-section-title">
                <span>⏳ 候补</span>
                <span className="badge badge-muted">{waitlist.length}</span>
              </h3>
              <ul className="signup-list">
                {waitlist.map((s) => (
                  <Row key={s.larkOpenId} signup={s} myOpenId={myOpenId}
                    ranks={ranks} onClickUser={onClickUser} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  signup, myOpenId, ranks, onClickUser,
}: {
  signup: SignupView;
  myOpenId: string | null;
  ranks: Record<string, Rank>;
  onClickUser: (openId: string) => void;
}) {
  const isMe = signup.larkOpenId === myOpenId;
  return (
    <li
      className={"signup-item clickable" + (signup.isWaitlist ? " waitlist" : "")
        + (isMe ? " me" : "")}
      onClick={() => onClickUser(signup.larkOpenId)}
    >
      <span className="position">{signup.position}</span>
      <div className="avatar">
        {signup.userAvatar
          ? <img src={signup.userAvatar} alt="" />
          : initials(signup.userName)}
      </div>
      <span className="name">
        {signup.userName}
        {isMe && <span className="meta" style={{ color: "var(--primary)" }}>(我)</span>}
        <RankBadge rank={ranks[signup.larkOpenId] ?? null} compact />
      </span>
      {signup.preferredCourtType && (
        <span className="court-pref">
          预期场次:{signup.preferredCourtType}
        </span>
      )}
    </li>
  );
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

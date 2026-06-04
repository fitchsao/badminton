import { SubscribeButton } from "../SubscribeButton";
import type { CurrentSessionResponse } from "../../api";

export function StagePreview({ data }: { data: CurrentSessionResponse }) {
  const { session, venue } = data;
  const date = new Date(session.eventStartAt);
  const dateStr = new Intl.DateTimeFormat("zh-CN", {
    month: "long", day: "numeric", weekday: "long",
  }).format(date);
  const timeStr = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);

  return (
    <>
      <div className="card preview-hero">
        <div className="preview-hero-title">📅 下一场羽毛球</div>
        <div className="preview-hero-date">{dateStr}</div>
        <div className="preview-hero-time">{timeStr}</div>
        {venue.name && (
          <div className="preview-hero-venue">
            <div className="venue-name">🏟 {venue.name}</div>
            {venue.address && <div className="venue-addr">{venue.address}</div>}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">
          <span className="card-title-icon">🔔</span>报名提醒
        </h3>
        <SubscribeButton />
        <div className="hint" style={{ marginTop: 8 }}>
          订阅后,本场报名开放时会私信通知你
        </div>
      </div>
    </>
  );
}

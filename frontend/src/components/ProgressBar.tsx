import { useState } from "react";
import type { SessionInfo } from "../api";
import { CountdownText } from "./CountdownText";

export type Stage = "preview" | "signup" | "assigned" | "playing" | "after";

const STAGE_LABELS: Record<Stage, string> = {
  preview: "预告",
  signup: "报名",
  assigned: "分组",
  playing: "比赛",
  after: "赛后",
};

const STAGES: Stage[] = ["preview", "signup", "assigned", "playing", "after"];

/**
 * 由 session 状态映射到 5 段进度
 */
export function deriveStage(state: SessionInfo["state"]): Stage {
  switch (state) {
    case "not_open": return "preview";
    case "open": return "signup";
    case "closed_pre_event": return "assigned";
    case "in_progress": return "playing";
    case "finished": return "after";
  }
}

/**
 * 当前 stage 对应的"下一个时间点"
 */
function getNextMilestone(stage: Stage, session: SessionInfo): { label: string; iso: string } | null {
  switch (stage) {
    case "preview":  return { label: "距报名开放", iso: session.signupOpenAt };
    case "signup":   return { label: "距报名截止", iso: session.signupCloseAt };
    case "assigned": return { label: "距比赛开始", iso: session.eventStartAt };
    case "playing":  return { label: "距比赛结束", iso: session.eventEndAt };
    case "after":    return null;
  }
}

export function ProgressBar({ session }: { session: SessionInfo }) {
  const [showInfo, setShowInfo] = useState(false);
  const currentStage = deriveStage(session.state);
  const currentIdx = STAGES.indexOf(currentStage);
  const milestone = getNextMilestone(currentStage, session);

  return (
    <>
      <div className="progress-bar-wrap">
        <div className="progress-track">
          {STAGES.map((s, i) => {
            const past = i < currentIdx;
            const current = i === currentIdx;
            return (
              <div key={s} className="progress-segment">
                <div className={
                  "progress-dot " +
                  (past ? "past " : current ? "current " : "future ")
                }>
                  {past ? "✓" : i + 1}
                </div>
                <div className={"progress-label " + (current ? "current" : "")}>
                  {STAGE_LABELS[s]}
                </div>
                {i < STAGES.length - 1 && (
                  <div className={
                    "progress-line " + (past ? "past" : "future")
                  } />
                )}
              </div>
            );
          })}
          <button className="progress-info" onClick={() => setShowInfo(true)} aria-label="查看时间">
            ⓘ
          </button>
        </div>
        {milestone && (
          <div className="progress-countdown">
            <CountdownText targetIso={milestone.iso} prefix={milestone.label + " "} />
          </div>
        )}
        {!milestone && (
          <div className="progress-countdown finished">本场已结束</div>
        )}
      </div>

      {showInfo && (
        <StageInfoModal session={session} onClose={() => setShowInfo(false)} />
      )}
    </>
  );
}

function StageInfoModal({
  session, onClose,
}: {
  session: SessionInfo;
  onClose: () => void;
}) {
  const items: { label: string; iso: string }[] = [
    { label: "报名开放", iso: session.signupOpenAt },
    { label: "报名截止", iso: session.signupCloseAt },
    { label: "比赛开始", iso: session.eventStartAt },
    { label: "比赛结束", iso: session.eventEndAt },
  ];
  const now = Date.now();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>本场时间表</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <ul className="time-list">
            {items.map((item) => {
              const t = new Date(item.iso).getTime();
              const past = t < now;
              return (
                <li key={item.label} className={"time-item " + (past ? "past" : "")}>
                  <span className="time-label">{item.label}</span>
                  <span className="time-value">
                    {fmt(item.iso)}
                    {past && <span className="time-tag">已过</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long", day: "numeric", weekday: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

import { pool } from "../db.js";
import { config } from "../config.js";
import { getSchedule, getCourtTemplate } from "./settings.js";
import { createCourtsForSession } from "./court.js";

export interface Session {
  id: number;
  event_start_at: Date;
  event_end_at: Date;
  signup_open_at: Date;
  signup_close_at: Date;
  max_slots: number;
  lark_chat_id: string;
  lark_message_id: string | null;
  created_at: Date;
}

/**
 * 计算本周的活动时间(从 DB 配置读取规则)
 */
export async function computeSessionTimes(now: Date = new Date()) {
  const sched = await getSchedule();
  const tz = config.app.tz;

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  const weekdayStr = get("weekday")!;
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const todayDow = dowMap[weekdayStr];
  const todayYear = Number(get("year"));
  const todayMonth = Number(get("month"));
  const todayDay = Number(get("day"));

  // 本周一(以 signup_open_dow 为锚点)的日期
  const daysSinceMonday = (todayDow - sched.signup_open_dow + 7) % 7;
  const signupOpenAt = makeDateInTz(
    tz,
    todayYear, todayMonth, todayDay - daysSinceMonday,
    sched.signup_open_hour, sched.signup_open_minute,
  );

  const eventDayOffset = sched.event_dow - sched.signup_open_dow;
  const eventStartAt = makeDateInTz(
    tz,
    todayYear, todayMonth, todayDay - daysSinceMonday + eventDayOffset,
    sched.event_start_hour, 0,
  );
  const eventEndAt = makeDateInTz(
    tz,
    todayYear, todayMonth, todayDay - daysSinceMonday + eventDayOffset,
    sched.event_end_hour, 0,
  );
  const signupCloseAt = new Date(
    eventStartAt.getTime() - sched.signup_close_hours_before_event * 3600 * 1000,
  );

  return { signupOpenAt, eventStartAt, eventEndAt, signupCloseAt };
}

function makeDateInTz(
  tz: string,
  year: number, month: number, day: number, hour: number, minute: number,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMs = tzOffsetMs(new Date(asUtc), tz);
  return new Date(asUtc - offsetMs);
}

function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asIfUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour"), get("minute"), get("second"),
  );
  return asIfUtc - date.getTime();
}

/**
 * 创建本周场次(若已存在则返回已有的,幂等)
 * 同时生成关联的 courts
 */
export async function getOrCreateCurrentWeekSession(): Promise<Session> {
  const times = await computeSessionTimes();
  const tpl = await getCourtTemplate();
  const maxSlots = tpl.reduce((s, c) => s + c.max_players, 0);

  const existing = await pool.query<Session>(
    `SELECT * FROM sessions WHERE event_start_at = $1`,
    [times.eventStartAt],
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const inserted = await pool.query<Session>(
    `INSERT INTO sessions
       (event_start_at, event_end_at, signup_open_at, signup_close_at,
        max_slots, lark_chat_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (event_start_at) DO UPDATE
       SET event_start_at = EXCLUDED.event_start_at
     RETURNING *`,
    [
      times.eventStartAt, times.eventEndAt,
      times.signupOpenAt, times.signupCloseAt,
      maxSlots, config.lark.targetChatId,
    ],
  );
  const session = inserted.rows[0];

  // 创建场地
  await createCourtsForSession(session.id);

  return session;
}

export async function getCurrentSession(): Promise<Session | null> {
  // 优先级:
  // 1. 当前正在进行(now between signup_open_at 和 event_end_at)
  // 2. 最近一个未来的 session
  // 3. 最近一个 48h 内结束的过去 session(比赛后保留 48h)
  // 同优先级时,id 大的(新创建的) session 优先
  const r = await pool.query<Session>(
    `SELECT * FROM sessions
     WHERE event_end_at > NOW() - INTERVAL '48 hours'
     ORDER BY
       CASE
         WHEN NOW() BETWEEN signup_open_at AND event_end_at THEN 0
         WHEN signup_open_at > NOW() THEN 1
         ELSE 2
       END ASC,
       id DESC
     LIMIT 1`,
  );
  return r.rows[0] ?? null;
}

export async function updateSessionMessageId(
  sessionId: number, messageId: string,
): Promise<void> {
  await pool.query(
    `UPDATE sessions SET lark_message_id = $1 WHERE id = $2`,
    [messageId, sessionId],
  );
}

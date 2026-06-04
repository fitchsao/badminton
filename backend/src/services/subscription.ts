import { pool } from "../db.js";
import { getSchedule } from "./settings.js";
import { config } from "../config.js";

/**
 * 下周报名预约
 *
 * target_week_start = "下次报名开放那一天"的本地日期(YYYY-MM-DD)
 *
 * 提醒触发:scheduler 的 tick 每分钟扫描,找 signup_open_at 在 [NOW, NOW+90s] 之间的 session,
 * 在该 session 报名开放即将到达时,向所有 target_week_start = 该 session 报名开放日 且
 * notified_at IS NULL 的订阅推送私信,推送后写 notified_at
 */

/**
 * 计算"下一次报名开放的日期"(本地)
 * 用于 target_week_start 锚点
 */
export async function computeNextSignupOpenDate(now: Date = new Date()): Promise<string> {
  const sched = await getSchedule();
  const tz = config.app.tz;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value!;
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const todayDow = dowMap[get("weekday")];
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));

  // 距离 signup_open_dow 还有多少天(0..6)
  // 如果今天就是开放日:
  //   - 若已过开放时刻 → 7 天后
  //   - 否则 → 今天(理论上现在还没开放,不需要订阅)
  // 简化:总是给"下一个未来的 signup_open_dow"
  let daysAhead = (sched.signup_open_dow - todayDow + 7) % 7;

  // 如果是今天且已经过了开放时间,就是下周
  if (daysAhead === 0) {
    const nowHM = nowAsHM(now, tz);
    const openMinutes = sched.signup_open_hour * 60 + sched.signup_open_minute;
    if (nowHM >= openMinutes) daysAhead = 7;
    // 否则今天就行(已经在 cron 触发点之前)
  }

  const targetDate = new Date(year, month - 1, day + daysAhead);
  return ymd(targetDate);
}

function nowAsHM(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export async function subscribe(params: {
  larkOpenId: string;
  userName: string;
}): Promise<{ targetWeekStart: string }> {
  const targetWeekStart = await computeNextSignupOpenDate();
  await pool.query(
    `INSERT INTO subscriptions (lark_open_id, user_name, target_week_start)
     VALUES ($1, $2, $3)
     ON CONFLICT (lark_open_id, target_week_start) DO NOTHING`,
    [params.larkOpenId, params.userName, targetWeekStart],
  );
  return { targetWeekStart };
}

export async function unsubscribe(params: {
  larkOpenId: string;
}): Promise<void> {
  const targetWeekStart = await computeNextSignupOpenDate();
  await pool.query(
    `DELETE FROM subscriptions
       WHERE lark_open_id = $1 AND target_week_start = $2 AND notified_at IS NULL`,
    [params.larkOpenId, targetWeekStart],
  );
}

export async function isSubscribed(openId: string): Promise<boolean> {
  const targetWeekStart = await computeNextSignupOpenDate();
  const r = await pool.query(
    `SELECT 1 FROM subscriptions
       WHERE lark_open_id = $1 AND target_week_start = $2`,
    [openId, targetWeekStart],
  );
  return (r.rowCount ?? 0) > 0;
}

export interface PendingSubscription {
  id: number;
  lark_open_id: string;
  user_name: string;
}

/**
 * 取待通知列表:目标日 = 给定日期 且 未通知
 */
export async function listPendingForDate(
  targetWeekStart: string,
): Promise<PendingSubscription[]> {
  const r = await pool.query<PendingSubscription>(
    `SELECT id, lark_open_id, user_name FROM subscriptions
       WHERE target_week_start = $1 AND notified_at IS NULL`,
    [targetWeekStart],
  );
  return r.rows;
}

export async function markNotified(id: number): Promise<void> {
  await pool.query(
    `UPDATE subscriptions SET notified_at = NOW() WHERE id = $1`,
    [id],
  );
}

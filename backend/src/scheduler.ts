import cron from "node-cron";
import { config } from "./config.js";
import {
  getOrCreateCurrentWeekSession, updateSessionMessageId,
} from "./services/session.js";
import { sendInteractiveCard, buildSignupNotificationCard } from "./lark.js";
import { getSchedule } from "./services/settings.js";
import { pool } from "./db.js";
import { generateAssignments } from "./services/assignment.js";
import { generateRotationForSession } from "./services/rotation.js";
import { listPendingForDate, markNotified } from "./services/subscription.js";
import { notifySignupOpen } from "./services/notification.js";

type Logger = { info: Function; error: Function; warn?: Function };

/**
 * 启动定时任务:
 *   1. 每周一(配置) 10:30 → 创建本周场次 + 发卡片
 *   2. 每分钟 → 检查有没有 session 到了 signup_close_at,触发分组
 *   3. 每分钟 → 检查有没有 session 到了 event_start_at,触发轮转
 */
export function startScheduler(logger: Logger) {
  // 主任务:周一发卡片(读 DB 的 schedule)
  scheduleWeeklyTrigger(logger);

  // 副任务:每分钟检查临界点
  cron.schedule(
    "* * * * *",
    async () => {
      try {
        await tickHooks(logger);
      } catch (err) {
        logger.error({ err }, "tick hooks 失败");
      }
    },
    { timezone: config.app.tz },
  );
  logger.info(`tick hooks 每分钟运行 (tz=${config.app.tz})`);
}

async function scheduleWeeklyTrigger(logger: Logger) {
  // 从 DB 读时间表
  const sched = await getSchedule();
  const expr = `${sched.signup_open_minute} ${sched.signup_open_hour} * * ${sched.signup_open_dow}`;
  logger.info(`周报名定时任务: cron="${expr}" tz=${config.app.tz}`);
  cron.schedule(
    expr,
    async () => {
      try { await triggerWeeklySignup(logger); }
      catch (err) { logger.error({ err }, "周报名任务失败"); }
    },
    { timezone: config.app.tz },
  );
}

/**
 * 每分钟检查:已到截止的 session 触发分组,已到活动开始的 session 触发轮转,
 *           即将到达报名开放的 session 触发订阅提醒
 */
async function tickHooks(logger: Logger) {
  // 截止后但还没分组的:执行 generateAssignments(幂等)
  const closed = await pool.query<{ id: number }>(
    `SELECT s.id FROM sessions s
     WHERE s.signup_close_at <= NOW()
       AND s.event_end_at > NOW() - INTERVAL '1 day'
       AND NOT EXISTS (
         SELECT 1 FROM court_assignments ca
         JOIN courts c ON c.id = ca.court_id
         WHERE c.session_id = s.id
       )`,
  );
  for (const row of closed.rows) {
    logger.info({ sessionId: row.id }, "触发分组");
    try { await generateAssignments(row.id); }
    catch (err) { logger.error({ err, sessionId: row.id }, "分组失败"); }
  }

  // 活动开始后但还没轮转的
  const started = await pool.query<{ id: number }>(
    `SELECT s.id FROM sessions s
     WHERE s.event_start_at <= NOW()
       AND s.event_end_at > NOW() - INTERVAL '1 day'
       AND NOT EXISTS (
         SELECT 1 FROM matches m
         JOIN courts c ON c.id = m.court_id
         WHERE c.session_id = s.id
       )`,
  );
  for (const row of started.rows) {
    logger.info({ sessionId: row.id }, "触发轮转生成");
    try { await generateRotationForSession(row.id); }
    catch (err) { logger.error({ err, sessionId: row.id }, "轮转失败"); }
  }

  // 订阅提醒:刚到 / 即将到达 signup_open_at 的 session
  // 取下一个 1 分钟内 signup_open 的 session
  const openingSoon = await pool.query<{
    id: number; signup_open_at: Date; event_start_at: Date;
  }>(
    `SELECT id, signup_open_at, event_start_at FROM sessions
       WHERE signup_open_at <= NOW() + INTERVAL '90 seconds'
         AND signup_open_at >= NOW() - INTERVAL '5 minutes'`,
  );
  for (const row of openingSoon.rows) {
    const targetDate = ymdInTz(row.signup_open_at, config.app.tz);
    const pending = await listPendingForDate(targetDate);
    for (const p of pending) {
      logger.info({ openId: p.lark_open_id, sessionId: row.id }, "发送订阅提醒");
      try {
        await notifySignupOpen(p.lark_open_id, p.user_name, {
          sessionId: row.id,
          eventStartAt: row.event_start_at,
        }, logger);
        await markNotified(p.id);
      } catch (err) {
        logger.warn?.({ err, openId: p.lark_open_id }, "订阅提醒发送失败");
      }
    }
  }

  // 自动确保未来有 session 存在(用于"场次预告"状态)
  // 如果未来 14 天内没有 session,自动创建一条(不发飞书卡片,仅 DB 记录)
  await ensureNextSession(logger);
}

/**
 * 确保至少有一个未来 session 存在
 * 不发飞书卡片(那是周一 cron 的工作),只创建 DB 记录
 * 这样比赛结束 48h 后,UI 上能立刻看到下周预告
 */
async function ensureNextSession(logger: Logger) {
  const futureCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM sessions
       WHERE event_start_at > NOW()
         AND event_start_at < NOW() + INTERVAL '14 days'`,
  );
  if (Number(futureCheck.rows[0].count) > 0) return;

  // 创建下一个 session(不发卡片)
  try {
    const session = await getOrCreateCurrentWeekSession();
    logger.info({ sessionId: session.id }, "ensureNextSession: 创建未来 session");
  } catch (err) {
    logger.warn?.({ err }, "ensureNextSession 创建失败");
  }
}

function ymdInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

/**
 * 创建本周场次 + 发卡片(可手动触发用于调试)
 */
export async function triggerWeeklySignup(logger: Logger): Promise<void> {
  logger.info("开始创建本周场次");
  const session = await getOrCreateCurrentWeekSession();

  if (session.lark_message_id) {
    logger.info({ sessionId: session.id }, "本周已发过通知,跳过");
    return;
  }

  const appUrl = buildAppUrl(session.id);
  const card = buildSignupNotificationCard({
    eventStartAt: session.event_start_at,
    maxSlots: session.max_slots,
    signupCloseAt: session.signup_close_at,
    appUrl,
    tz: config.app.tz,
  });

  const result = await sendInteractiveCard(session.lark_chat_id, card);
  await updateSessionMessageId(session.id, result.message_id);

  logger.info(
    { sessionId: session.id, messageId: result.message_id },
    "本周报名通知已发送",
  );
}

function buildAppUrl(sessionId: number): string {
  const redirect = `${config.app.baseUrl}/api/auth/callback`;
  const state = `${config.app.baseUrl}/?session_id=${sessionId}`;
  const url = new URL(`${config.lark.baseUrl}/open-apis/authen/v1/authorize`);
  url.searchParams.set("app_id", config.lark.appId);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "");
  return url.toString();
}

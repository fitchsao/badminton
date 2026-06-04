import type { PoolClient } from "pg";
import { pool, withTx } from "../db.js";
import { upsertPref } from "./prefs.js";
import { notifyPromoted } from "./notification.js";

export interface SignupRow {
  id: number;
  session_id: number;
  lark_open_id: string;
  user_name: string;
  user_avatar: string | null;
  preferred_court_type: "竞技" | "休闲" | null;
  created_at: Date;
  cancelled_at: Date | null;
}

export interface SignupView {
  position: number; // 从 1 开始,即 1..max_slots 是正式,之后是候补
  isWaitlist: boolean;
  userName: string;
  userAvatar: string | null;
  larkOpenId: string;
  preferredCourtType: "竞技" | "休闲" | null;
  signedUpAt: Date;
}

export class SignupError extends Error {
  constructor(
    public code:
      | "SESSION_NOT_FOUND"
      | "NOT_OPEN_YET"
      | "ALREADY_CLOSED"
      | "EVENT_STARTED"
      | "ALREADY_SIGNED_UP"
      | "NOT_SIGNED_UP",
    message: string,
  ) {
    super(message);
  }
}

/**
 * 报名:同时记录偏好场地,并 upsert user_prefs(性别 / 上次场地)
 */
export async function signUp(params: {
  sessionId: number;
  larkOpenId: string;
  userName: string;
  userAvatar?: string | null;
  preferredCourtType: "竞技" | "休闲";
  gender?: "男" | "女"; // 第一次报名时填,之后记住
}): Promise<SignupView> {
  const view = await withTx(async (client) => {
    const sess = await client.query<{
      id: number;
      signup_open_at: Date;
      signup_close_at: Date;
    }>(
      `SELECT id, signup_open_at, signup_close_at FROM sessions WHERE id = $1`,
      [params.sessionId],
    );
    if (sess.rows.length === 0) {
      throw new SignupError("SESSION_NOT_FOUND", "场次不存在");
    }
    const s = sess.rows[0];
    const now = new Date();
    if (now < s.signup_open_at) {
      throw new SignupError("NOT_OPEN_YET", "报名还未开始");
    }
    if (now >= s.signup_close_at) {
      throw new SignupError("ALREADY_CLOSED", "报名已截止,无法重新报名");
    }

    try {
      const inserted = await client.query<SignupRow>(
        `INSERT INTO signups
           (session_id, lark_open_id, user_name, user_avatar, preferred_court_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          params.sessionId, params.larkOpenId, params.userName,
          params.userAvatar ?? null, params.preferredCourtType,
        ],
      );
      const row = inserted.rows[0];
      const position = await computePosition(client, params.sessionId, row.id);
      return rowToView(row, position);
    } catch (err: any) {
      if (err?.code === "23505") {
        throw new SignupError("ALREADY_SIGNED_UP", "你已在报名列表中");
      }
      throw err;
    }
  });

  // 事务外更新 prefs(失败不阻塞主流程)
  try {
    await upsertPref({
      openId: params.larkOpenId,
      userName: params.userName,
      gender: params.gender,
      lastCourtType: params.preferredCourtType,
    });
  } catch { /* ignore */ }

  return view;
}

/**
 * 取消报名
 * 规则:截止时间(signup_close_at)之前可取消;之后不可
 * 取消成功后会探测候补晋升,并向被晋升者发送飞书私信
 */
export async function cancelSignup(params: {
  sessionId: number;
  larkOpenId: string;
}): Promise<void> {
  // 取消前正式名单 open_id 集合
  const beforeSession = await pool.query<{
    signup_close_at: Date; max_slots: number; event_start_at: Date;
  }>(
    `SELECT signup_close_at, max_slots, event_start_at FROM sessions WHERE id = $1`,
    [params.sessionId],
  );
  if (beforeSession.rows.length === 0) {
    throw new SignupError("SESSION_NOT_FOUND", "场次不存在");
  }
  const sess = beforeSession.rows[0];
  if (new Date() >= sess.signup_close_at) {
    throw new SignupError("ALREADY_CLOSED", "报名已截止,不可取消");
  }

  // 取消前快照(用来对比晋升)
  const beforeRes = await pool.query<{ lark_open_id: string }>(
    `SELECT lark_open_id FROM signups
       WHERE session_id = $1 AND cancelled_at IS NULL
       ORDER BY created_at ASC, id ASC
       LIMIT $2`,
    [params.sessionId, sess.max_slots],
  );
  const beforeFormal = new Set(beforeRes.rows.map((r) => r.lark_open_id));

  // 实际取消
  await withTx(async (client) => {
    const r = await client.query(
      `UPDATE signups
          SET cancelled_at = NOW()
        WHERE session_id = $1
          AND lark_open_id = $2
          AND cancelled_at IS NULL`,
      [params.sessionId, params.larkOpenId],
    );
    if (r.rowCount === 0) {
      throw new SignupError("NOT_SIGNED_UP", "你当前没有报名");
    }
  });

  // 取消后正式名单
  const afterRes = await pool.query<{ lark_open_id: string; user_name: string }>(
    `SELECT lark_open_id, user_name FROM signups
       WHERE session_id = $1 AND cancelled_at IS NULL
       ORDER BY created_at ASC, id ASC
       LIMIT $2`,
    [params.sessionId, sess.max_slots],
  );

  // 差集:新进入正式名单的就是被晋升者
  const promoted = afterRes.rows.filter((r) => !beforeFormal.has(r.lark_open_id));
  for (const p of promoted) {
    // 取消者自己不通知
    if (p.lark_open_id === params.larkOpenId) continue;
    // 异步发,不阻塞返回
    notifyPromoted(p.lark_open_id, p.user_name, {
      sessionId: params.sessionId,
      eventStartAt: sess.event_start_at,
    }).catch(() => {});
  }
}

export async function listSignups(
  sessionId: number,
  maxSlots: number,
): Promise<SignupView[]> {
  const r = await pool.query<SignupRow>(
    `SELECT * FROM signups
      WHERE session_id = $1 AND cancelled_at IS NULL
      ORDER BY created_at ASC, id ASC`,
    [sessionId],
  );
  return r.rows.map((row, idx) => ({
    position: idx + 1,
    isWaitlist: idx + 1 > maxSlots,
    userName: row.user_name,
    userAvatar: row.user_avatar,
    larkOpenId: row.lark_open_id,
    preferredCourtType: row.preferred_court_type,
    signedUpAt: row.created_at,
  }));
}

async function computePosition(
  client: PoolClient, sessionId: number, signupId: number,
): Promise<number> {
  const r = await client.query<{ position: string }>(
    `SELECT COUNT(*) AS position FROM signups
      WHERE session_id = $1
        AND cancelled_at IS NULL
        AND id <= $2`,
    [sessionId, signupId],
  );
  return Number(r.rows[0].position);
}

function rowToView(row: SignupRow, position: number): SignupView {
  return {
    position,
    isWaitlist: false,
    userName: row.user_name,
    userAvatar: row.user_avatar,
    larkOpenId: row.lark_open_id,
    preferredCourtType: row.preferred_court_type,
    signedUpAt: row.created_at,
  };
}

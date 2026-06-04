import { pool } from "../db.js";

export interface UserPref {
  larkOpenId: string;
  userName: string;
  gender: "男" | "女" | null;
  lastCourtType: "竞技" | "休闲" | null;
}

export async function getPref(openId: string): Promise<UserPref | null> {
  const r = await pool.query(
    `SELECT lark_open_id, user_name, gender, last_court_type
       FROM user_prefs WHERE lark_open_id = $1`,
    [openId],
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    larkOpenId: row.lark_open_id,
    userName: row.user_name,
    gender: row.gender,
    lastCourtType: row.last_court_type,
  };
}

/**
 * upsert 偏好,只更新提供的字段
 */
export async function upsertPref(params: {
  openId: string;
  userName: string;
  gender?: "男" | "女";
  lastCourtType?: "竞技" | "休闲";
}): Promise<void> {
  await pool.query(
    `INSERT INTO user_prefs (lark_open_id, user_name, gender, last_court_type, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (lark_open_id) DO UPDATE SET
       user_name = EXCLUDED.user_name,
       gender = COALESCE(EXCLUDED.gender, user_prefs.gender),
       last_court_type = COALESCE(EXCLUDED.last_court_type, user_prefs.last_court_type),
       updated_at = NOW()`,
    [
      params.openId,
      params.userName,
      params.gender ?? null,
      params.lastCourtType ?? null,
    ],
  );
}

/**
 * 历史报名人(admin 手动加人时可选择)
 * 取所有出现过的 prefs,按最近活跃排序
 */
export async function listHistoricalUsers(): Promise<UserPref[]> {
  const r = await pool.query(
    `SELECT lark_open_id, user_name, gender, last_court_type
       FROM user_prefs
      ORDER BY updated_at DESC
      LIMIT 200`,
  );
  return r.rows.map((row) => ({
    larkOpenId: row.lark_open_id,
    userName: row.user_name,
    gender: row.gender,
    lastCourtType: row.last_court_type,
  }));
}

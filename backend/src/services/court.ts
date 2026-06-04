import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { getCourtTemplate } from "./settings.js";

export interface Court {
  id: number;
  session_id: number;
  name: string;
  court_type: "竞技" | "休闲";
  max_players: number;
  sort_order: number;
}

/**
 * 根据 app_config 的 courts_template 为指定 session 创建场地
 */
export async function createCourtsForSession(
  sessionId: number,
  client?: PoolClient,
): Promise<Court[]> {
  const tpl = await getCourtTemplate();
  const q = client ?? pool;
  const created: Court[] = [];
  for (let i = 0; i < tpl.length; i++) {
    const t = tpl[i];
    const r = await q.query<Court>(
      `INSERT INTO courts (session_id, name, court_type, max_players, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sessionId, t.name, t.court_type, t.max_players, i],
    );
    created.push(r.rows[0]);
  }
  return created;
}

export async function listCourts(sessionId: number): Promise<Court[]> {
  const r = await pool.query<Court>(
    `SELECT * FROM courts WHERE session_id = $1 ORDER BY sort_order, id`,
    [sessionId],
  );
  return r.rows;
}

/**
 * session 创建后如果 admin 改了 template,提供一个重建接口(用于活动前)
 * 警告:会删掉已有的 assignments / matches
 */
export async function recreateCourtsForSession(sessionId: number): Promise<Court[]> {
  await pool.query(`DELETE FROM courts WHERE session_id = $1`, [sessionId]);
  return createCourtsForSession(sessionId);
}

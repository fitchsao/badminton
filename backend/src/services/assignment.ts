import type { PoolClient } from "pg";
import { pool, withTx } from "../db.js";
import { listCourts } from "./court.js";

export interface AssignmentRow {
  id: number;
  court_id: number;
  signup_id: number | null;
  manual_name: string | null;
  manual_gender: "男" | "女" | null;
  sort_order: number;
}

export interface AssignmentView {
  id: number;
  courtId: number;
  courtName: string;
  courtType: "竞技" | "休闲";
  userName: string;
  larkOpenId: string | null;   // manual 加的没有
  gender: "男" | "女" | null;
  isManual: boolean;
  sortOrder: number;
}

/**
 * 自动分配:基于报名顺序 + 偏好场地类型,溢出随机分配
 *
 * 算法:
 *   1. 取所有正式报名(前 maxSlots 位,按 created_at)
 *   2. 第一轮:每个 signup 试着进自己偏好的场地(同 court_type 的第一个有空位)
 *   3. 第二轮:第一轮没分进去的,随机选剩下有空位的场地
 *   4. 超出所有场地容量的(理论上不会发生,因为正式名额 = 所有场地之和),不分
 *
 * 幂等:如果该 session 已经分过,直接返回现有结果不重做.
 *      (Admin 手动调整后会清除,然后下次调用此函数会重新生成)
 */
export async function generateAssignments(sessionId: number): Promise<void> {
  return withTx(async (client) => {
    const courts = await listCourts(sessionId);
    if (courts.length === 0) return;

    // 已经有分配了 → 不重做
    const existing = await client.query(
      `SELECT COUNT(*) AS c FROM court_assignments
        WHERE court_id IN (${courts.map((_, i) => `$${i + 1}`).join(",")})`,
      courts.map((c) => c.id),
    );
    if (Number(existing.rows[0].c) > 0) return;

    // 拿正式报名(前 N 位,按 created_at)
    // N = sum(max_players)
    const totalCapacity = courts.reduce((s, c) => s + c.max_players, 0);
    const signupsRes = await client.query<{
      id: number;
      preferred_court_type: string | null;
    }>(
      `SELECT id, preferred_court_type FROM signups
        WHERE session_id = $1 AND cancelled_at IS NULL
        ORDER BY created_at ASC, id ASC
        LIMIT $2`,
      [sessionId, totalCapacity],
    );
    const signups = signupsRes.rows;

    // 每个 court 剩余容量
    const remaining = new Map<number, number>(
      courts.map((c) => [c.id, c.max_players]),
    );

    // 第一轮:进偏好
    const unassigned: typeof signups = [];
    for (const s of signups) {
      const candidates = courts.filter(
        (c) =>
          c.court_type === s.preferred_court_type &&
          (remaining.get(c.id) ?? 0) > 0,
      );
      if (candidates.length > 0) {
        const c = candidates[0]; // 同类型多个时取第一个
        await insertAssignment(client, c.id, s.id, null, null);
        remaining.set(c.id, (remaining.get(c.id) ?? 0) - 1);
      } else {
        unassigned.push(s);
      }
    }

    // 第二轮:随机分到剩余场地
    for (const s of unassigned) {
      const open = courts.filter((c) => (remaining.get(c.id) ?? 0) > 0);
      if (open.length === 0) break;
      const c = open[Math.floor(Math.random() * open.length)];
      await insertAssignment(client, c.id, s.id, null, null);
      remaining.set(c.id, (remaining.get(c.id) ?? 0) - 1);
    }
  });
}

async function insertAssignment(
  client: PoolClient,
  courtId: number,
  signupId: number | null,
  manualName: string | null,
  manualGender: "男" | "女" | null,
): Promise<number> {
  // 计算 sort_order:本场地最大值 + 1
  const r = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM court_assignments WHERE court_id = $1`,
    [courtId],
  );
  const sortOrder = r.rows[0].next;
  const inserted = await client.query<{ id: number }>(
    `INSERT INTO court_assignments
       (court_id, signup_id, manual_name, manual_gender, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [courtId, signupId, manualName, manualGender, sortOrder],
  );
  return inserted.rows[0].id;
}

/**
 * 列出某场次所有分配,带 court / user 信息
 */
export async function listAssignments(sessionId: number): Promise<AssignmentView[]> {
  const r = await pool.query<{
    id: number;
    court_id: number;
    court_name: string;
    court_type: "竞技" | "休闲";
    signup_id: number | null;
    manual_name: string | null;
    manual_gender: "男" | "女" | null;
    user_name: string | null;
    lark_open_id: string | null;
    pref_gender: "男" | "女" | null;
    sort_order: number;
  }>(
    `SELECT ca.id, ca.court_id, c.name AS court_name, c.court_type,
            ca.signup_id, ca.manual_name, ca.manual_gender, ca.sort_order,
            s.user_name, s.lark_open_id,
            up.gender AS pref_gender
       FROM court_assignments ca
       JOIN courts c ON c.id = ca.court_id
       LEFT JOIN signups s ON s.id = ca.signup_id
       LEFT JOIN user_prefs up ON up.lark_open_id = s.lark_open_id
      WHERE c.session_id = $1
      ORDER BY c.sort_order, ca.sort_order, ca.id`,
    [sessionId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    courtId: row.court_id,
    courtName: row.court_name,
    courtType: row.court_type,
    userName: row.user_name ?? row.manual_name ?? "(未知)",
    larkOpenId: row.lark_open_id,
    gender: row.manual_gender ?? row.pref_gender ?? null,
    isManual: row.signup_id === null,
    sortOrder: row.sort_order,
  }));
}

// ============ Admin 手动调整 ============

/**
 * 把某个分配移到另一个 court
 */
export async function moveAssignment(
  assignmentId: number,
  newCourtId: number,
): Promise<void> {
  await withTx(async (client) => {
    const r = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
         FROM court_assignments WHERE court_id = $1`,
      [newCourtId],
    );
    await client.query(
      `UPDATE court_assignments SET court_id = $1, sort_order = $2 WHERE id = $3`,
      [newCourtId, r.rows[0].next, assignmentId],
    );
    // 移动后该 session 的轮转表失效,清掉
    await invalidateMatches(client, assignmentId);
  });
}

export async function deleteAssignment(assignmentId: number): Promise<void> {
  await withTx(async (client) => {
    await invalidateMatches(client, assignmentId);
    await client.query(`DELETE FROM court_assignments WHERE id = $1`, [assignmentId]);
  });
}

/**
 * 添加一个人到 court:
 *   - 如果 lark_open_id 给定 → 从历史报名取 (user_prefs)
 *   - 如果 manual_name 给定 → 录入虚拟成员
 */
export async function addAssignment(params: {
  courtId: number;
  larkOpenId?: string;
  manualName?: string;
  manualGender?: "男" | "女";
}): Promise<number> {
  return withTx(async (client) => {
    let signupId: number | null = null;
    let manualName: string | null = null;
    let manualGender: "男" | "女" | null = null;

    if (params.larkOpenId) {
      // 在当前 session 给该用户创建一条 signup(占位用,不走时间窗校验)
      const courtRow = await client.query<{ session_id: number }>(
        `SELECT session_id FROM courts WHERE id = $1`,
        [params.courtId],
      );
      const sessionId = courtRow.rows[0].session_id;
      const userRow = await client.query<{ user_name: string }>(
        `SELECT user_name FROM user_prefs WHERE lark_open_id = $1`,
        [params.larkOpenId],
      );
      const userName = userRow.rows[0]?.user_name ?? params.larkOpenId;
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO signups (session_id, lark_open_id, user_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_id, lark_open_id) WHERE cancelled_at IS NULL
         DO UPDATE SET user_name = EXCLUDED.user_name
         RETURNING id`,
        [sessionId, params.larkOpenId, userName],
      );
      signupId = inserted.rows[0].id;
    } else if (params.manualName) {
      manualName = params.manualName.trim();
      manualGender = params.manualGender ?? null;
    } else {
      throw new Error("必须提供 larkOpenId 或 manualName");
    }

    const id = await insertAssignment(
      client, params.courtId, signupId, manualName, manualGender,
    );
    // 该 session 的轮转表失效
    const sess = await client.query<{ session_id: number }>(
      `SELECT session_id FROM courts WHERE id = $1`,
      [params.courtId],
    );
    await client.query(
      `DELETE FROM matches WHERE court_id IN
         (SELECT id FROM courts WHERE session_id = $1)`,
      [sess.rows[0].session_id],
    );
    return id;
  });
}

/**
 * 当某条 assignment 改动时,把对应 session 的 matches 清空(轮转表需重生成)
 */
async function invalidateMatches(
  client: PoolClient, assignmentId: number,
): Promise<void> {
  await client.query(
    `DELETE FROM matches WHERE court_id IN (
       SELECT court_id FROM court_assignments WHERE id = $1
     )`,
    [assignmentId],
  );
}

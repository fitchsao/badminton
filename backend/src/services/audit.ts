import { pool } from "../db.js";

export interface AuditEntry {
  id: number;
  actor_open_id: string;
  actor_name: string;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  created_at: Date;
}

export async function logAudit(params: {
  actorOpenId: string;
  actorName: string;
  action: string;
  target?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO admin_audit (actor_open_id, actor_name, action, target, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.actorOpenId, params.actorName, params.action,
      params.target ?? null,
      params.details ? JSON.stringify(params.details) : null,
    ],
  );
}

export async function listRecentAudit(limit = 50): Promise<AuditEntry[]> {
  const r = await pool.query<AuditEntry>(
    `SELECT id, actor_open_id, actor_name, action, target, details, created_at
       FROM admin_audit
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );
  return r.rows;
}

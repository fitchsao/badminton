import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { signCookie } from "../utils/cookie.js";
import { config } from "../config.js";
import { pool } from "../db.js";

/**
 * 开发 / 测试用路由
 * 仅当环境变量 DEV_SECRET 设置时启用
 *
 * 端点:
 *   POST /api/dev/login   { secret, openId, name, avatar?, email? }
 *     -> 直接生成 cookie, 跳过飞书 OAuth
 *
 *   POST /api/dev/reset   { secret }
 *     -> 执行 backend/scripts/mock_data_pg.sql, 重置 mock 数据
 *
 * !! 生产环境务必不要设置 DEV_SECRET !!
 */
export async function devRoutes(app: FastifyInstance) {
  const secret = process.env.DEV_SECRET;
  if (!secret) {
    return;
  }

  app.log.warn("⚠️  DEV_SECRET 已设置 → 启用 /api/dev/* 端点(仅供测试,生产请关闭)");

  app.post<{ Body: {
    secret: string; openId: string; name: string;
    avatar?: string; email?: string;
  } }>("/api/dev/login", async (req, reply) => {
    const { secret: bs, openId, name, avatar, email } = req.body || {} as any;
    if (bs !== secret) { reply.code(403); return { error: "wrong secret" }; }
    if (!openId || !name) { reply.code(400); return { error: "missing openId/name" }; }
    const payload = {
      openId, name,
      avatar: avatar ?? null,
      email: email ?? null,
    };
    const cookieValue = signCookie(payload, config.app.cookieSecret);
    reply.header(
      "set-cookie",
      `bm_user=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
    );
    return { ok: true, user: payload };
  });

  app.post<{ Body: { secret: string } }>(
    "/api/dev/reset",
    async (req, reply) => {
      if (req.body?.secret !== secret) {
        reply.code(403);
        return { error: "wrong secret" };
      }
      const sqlPath = path.join(process.cwd(), "scripts", "mock_data_pg.sql");
      const sql = await readFile(sqlPath, "utf-8");
      const client = await pool.connect();
      try {
        await client.query(sql);
      } finally {
        client.release();
      }
      return { ok: true };
    },
  );

  /**
   * 给一个测试 session "推进时间" 的快捷端点
   *   stage 可选: signup_open / signup_closed / in_progress / finished
   */
  app.post<{ Body: { secret: string; stage: string; sessionId?: number } }>(
    "/api/dev/session-stage",
    async (req, reply) => {
      if (req.body?.secret !== secret) {
        reply.code(403);
        return { error: "wrong secret" };
      }
      const stage = req.body.stage;
      let sessionId = req.body.sessionId;
      if (!sessionId) {
        const r = await pool.query<{ id: number }>(
          `SELECT id FROM sessions WHERE event_start_at > NOW() - INTERVAL '12 hours' ORDER BY id DESC LIMIT 1`,
        );
        if (r.rows.length === 0) {
          reply.code(404);
          return { error: "无可用 session,请先 /api/dev/reset" };
        }
        sessionId = r.rows[0].id;
      }

      const STAGES: Record<string, string> = {
        preview: `signup_open_at = NOW() + INTERVAL '6 hours',
                  signup_close_at = NOW() + INTERVAL '30 hours',
                  event_start_at  = NOW() + INTERVAL '32 hours',
                  event_end_at    = NOW() + INTERVAL '34 hours'`,
        signup_open: `signup_open_at = NOW() - INTERVAL '30 minutes',
                      signup_close_at = NOW() + INTERVAL '4 hours',
                      event_start_at  = NOW() + INTERVAL '6 hours',
                      event_end_at    = NOW() + INTERVAL '8 hours'`,
        signup_closed: `signup_open_at = NOW() - INTERVAL '4 hours',
                        signup_close_at = NOW() - INTERVAL '1 hour',
                        event_start_at  = NOW() + INTERVAL '1 hour',
                        event_end_at    = NOW() + INTERVAL '3 hours'`,
        in_progress: `signup_open_at = NOW() - INTERVAL '5 hours',
                      signup_close_at = NOW() - INTERVAL '2 hours',
                      event_start_at  = NOW() - INTERVAL '1 minute',
                      event_end_at    = NOW() + INTERVAL '2 hours'`,
        finished: `signup_open_at = NOW() - INTERVAL '8 hours',
                   signup_close_at = NOW() - INTERVAL '6 hours',
                   event_start_at  = NOW() - INTERVAL '4 hours',
                   event_end_at    = NOW() - INTERVAL '5 minutes'`,
      };
      const setClause = STAGES[stage];
      if (!setClause) {
        reply.code(400);
        return { error: `unknown stage; want one of ${Object.keys(STAGES).join("/")}` };
      }
      await pool.query(`UPDATE sessions SET ${setClause} WHERE id = $1`, [sessionId]);

      // 把其他"会被 getCurrentSession 选中的" session 逐出 - 把它们的 event_end_at
      // 推到 48h 前。仅作用于测试环境(此端点只在 DEV_SECRET 启用时存在)。
      // 这样可以避免被以前测试残留的 session 干扰。
      await pool.query(`
        UPDATE sessions
           SET event_end_at = NOW() - INTERVAL '48 hours' - INTERVAL '1 minute'
         WHERE id != $1
           AND event_end_at > NOW() - INTERVAL '48 hours'
      `, [sessionId]);

      return { ok: true, sessionId, stage };
    },
  );
}

import type { FastifyInstance } from "fastify";
import { requireAdmin, getCurrentUser } from "./auth.js";
import {
  getConfig, setConfig,
  type CourtTemplate, type ScheduleConfig,
} from "../services/settings.js";
import {
  moveAssignment, deleteAssignment, addAssignment,
  generateAssignments,
} from "../services/assignment.js";
import { recreateCourtsForSession } from "../services/court.js";
import { listHistoricalUsers } from "../services/prefs.js";
import { generateRotationForSession } from "../services/rotation.js";
import { logAudit, listRecentAudit } from "../services/audit.js";
import { triggerWeeklySignup } from "../scheduler.js";
import { pool } from "../db.js";

export async function adminRoutes(app: FastifyInstance) {
  // 守卫:所有 /api/admin/* 路径必须 admin
  app.addHook("preHandler", async (req, _reply) => {
    if (req.url.startsWith("/api/admin/")) {
      await requireAdmin(req);
    }
  });

  // audit hook:在 admin 写操作完成后记一条
  app.addHook("onResponse", async (req, reply) => {
    if (!req.url.startsWith("/api/admin/")) return;
    if (req.method === "GET") return;
    if (reply.statusCode >= 400) return;
    const me = getCurrentUser(req);
    if (!me) return;
    const action = inferAction(req.method, req.url);
    logAudit({
      actorOpenId: me.openId,
      actorName: me.name,
      action,
      target: req.url,
    }).catch(() => {});
  });

  /**
   * 读所有配置(供面板展示)
   */
  app.get("/api/admin/config", async () => {
    const courtsTemplate = await getConfig<CourtTemplate[]>("courts_template");
    const schedule = await getConfig<ScheduleConfig>("schedule");
    const adminOpenIds = await getConfig<string[]>("admin_open_ids");
    const scoreCap = await getConfig<number>("score_cap");
    const venue = await getConfig<{ name: string; address: string }>("venue");
    return {
      courtsTemplate, schedule, adminOpenIds,
      scoreCap: scoreCap ?? 15,
      venue: venue ?? { name: "", address: "" },
    };
  });

  /**
   * 改场地模板
   */
  app.put<{ Body: CourtTemplate[] }>(
    "/api/admin/config/courts_template",
    async (req, reply) => {
      const v = req.body;
      if (!Array.isArray(v) || v.length === 0) {
        reply.code(400);
        return { error: "至少需要 1 个场地" };
      }
      for (const c of v) {
        if (!c.name || (c.court_type !== "竞技" && c.court_type !== "休闲")
            || !Number.isInteger(c.max_players) || c.max_players < 1) {
          reply.code(400);
          return { error: "场地配置非法" };
        }
      }
      await setConfig("courts_template", v);
      return { ok: true };
    },
  );

  /**
   * 改时间表
   */
  app.put<{ Body: ScheduleConfig }>(
    "/api/admin/config/schedule",
    async (req, reply) => {
      const s = req.body;
      // 简单校验
      const fields = ["signup_open_dow","signup_open_hour","signup_open_minute",
                      "event_dow","event_start_hour","event_end_hour",
                      "signup_close_hours_before_event"];
      for (const f of fields) {
        if (!Number.isInteger((s as any)[f])) {
          reply.code(400);
          return { error: `${f} 必须是整数` };
        }
      }
      await setConfig("schedule", s);
      return { ok: true };
    },
  );

  /**
   * 改 admin open_id 白名单
   */
  app.put<{ Body: string[] }>(
    "/api/admin/config/admin_open_ids",
    async (req, reply) => {
      const v = req.body;
      if (!Array.isArray(v) || v.length === 0) {
        reply.code(400);
        return { error: "至少保留 1 个 admin open_id" };
      }
      for (const id of v) {
        if (typeof id !== "string" || !id.startsWith("ou_")) {
          reply.code(400);
          return { error: `open_id 格式非法:${id}(应以 ou_ 开头)` };
        }
      }
      await setConfig("admin_open_ids", v);
      return { ok: true };
    },
  );

  /**
   * 改单场分数上限(7/11/15/21)
   */
  app.put<{ Body: { scoreCap: number } }>(
    "/api/admin/config/score_cap",
    async (req, reply) => {
      const n = Number(req.body?.scoreCap);
      if (![7, 11, 15, 21].includes(n)) {
        reply.code(400);
        return { error: "scoreCap 必须是 7 / 11 / 15 / 21 之一" };
      }
      await setConfig("score_cap", n);
      return { ok: true };
    },
  );

  /**
   * 改球场信息(name + address)
   */
  app.put<{ Body: { name: string; address: string } }>(
    "/api/admin/config/venue",
    async (req, reply) => {
      const { name, address } = req.body ?? {} as any;
      if (typeof name !== "string" || typeof address !== "string") {
        reply.code(400);
        return { error: "name 和 address 必须是字符串" };
      }
      await setConfig("venue", { name: name.trim(), address: address.trim() });
      return { ok: true };
    },
  );

  /**
   * 列出历史报名过的人(给 admin 手动加成员时选)
   */
  app.get("/api/admin/users/history", async () => {
    const users = await listHistoricalUsers();
    return { users };
  });

  /**
   * 重新生成场地(当 template 改了)
   * 警告: 会清掉已有的 assignments 和 matches
   */
  app.post<{ Params: { id: string } }>(
    "/api/admin/sessions/:id/recreate-courts",
    async (req) => {
      const courts = await recreateCourtsForSession(Number(req.params.id));
      return { ok: true, courts };
    },
  );

  /**
   * 触发分组(若已分则忽略)
   */
  app.post<{ Params: { id: string } }>(
    "/api/admin/sessions/:id/generate-assignments",
    async (req) => {
      await generateAssignments(Number(req.params.id));
      return { ok: true };
    },
  );

  /**
   * 重置该 session 所有 assignments 并重新分组
   */
  app.post<{ Params: { id: string } }>(
    "/api/admin/sessions/:id/reassign",
    async (req, reply) => {
      const sessionId = Number(req.params.id);
      // 清掉旧的 assignments + matches
      const { pool } = await import("../db.js");
      await pool.query(
        `DELETE FROM matches WHERE court_id IN (SELECT id FROM courts WHERE session_id = $1)`,
        [sessionId],
      );
      await pool.query(
        `DELETE FROM court_assignments WHERE court_id IN (SELECT id FROM courts WHERE session_id = $1)`,
        [sessionId],
      );
      await generateAssignments(sessionId);
      reply.send({ ok: true });
    },
  );

  /**
   * 重新生成轮转
   */
  app.post<{ Params: { id: string } }>(
    "/api/admin/sessions/:id/regenerate-rotation",
    async (req) => {
      const sessionId = Number(req.params.id);
      const { pool } = await import("../db.js");
      await pool.query(
        `DELETE FROM matches WHERE court_id IN (SELECT id FROM courts WHERE session_id = $1)`,
        [sessionId],
      );
      await generateRotationForSession(sessionId);
      return { ok: true };
    },
  );

  /**
   * 移动一个 assignment 到另一个 court
   */
  app.patch<{
    Params: { id: string };
    Body: { newCourtId: number };
  }>(
    "/api/admin/assignments/:id/move",
    async (req) => {
      await moveAssignment(Number(req.params.id), req.body.newCourtId);
      return { ok: true };
    },
  );

  /**
   * 删除一个 assignment
   */
  app.delete<{ Params: { id: string } }>(
    "/api/admin/assignments/:id",
    async (req) => {
      await deleteAssignment(Number(req.params.id));
      return { ok: true };
    },
  );

  /**
   * 向某 court 添加一个人
   *   - larkOpenId: 从历史报名人挑
   *   - manualName: 手动录入名字(可选 manualGender)
   */
  app.post<{
    Params: { courtId: string };
    Body: {
      larkOpenId?: string;
      manualName?: string;
      manualGender?: "男" | "女";
    };
  }>(
    "/api/admin/courts/:courtId/add",
    async (req, reply) => {
      const { larkOpenId, manualName, manualGender } = req.body || {} as any;
      if (!larkOpenId && !manualName) {
        reply.code(400);
        return { error: "必须提供 larkOpenId 或 manualName" };
      }
      const id = await addAssignment({
        courtId: Number(req.params.courtId),
        larkOpenId, manualName, manualGender,
      });
      return { ok: true, id };
    },
  );

  // ============ 运维端点 ============

  /**
   * 立即触发本周报名(创建 session + 发卡片)
   */
  app.post("/api/admin/ops/trigger-signup", async (req) => {
    await triggerWeeklySignup(app.log);
    return { ok: true };
  });

  /**
   * 运维状态信息(最近 session、最近 audit)
   */
  app.get("/api/admin/ops/status", async () => {
    const recentSessions = await pool.query(
      `SELECT id, signup_open_at, event_start_at, lark_message_id, created_at
         FROM sessions ORDER BY created_at DESC LIMIT 5`,
    );
    const audit = await listRecentAudit(20);
    return {
      recentSessions: recentSessions.rows,
      audit,
      serverNow: new Date().toISOString(),
    };
  });
}

function inferAction(method: string, url: string): string {
  if (url.includes("/config/courts_template")) return "update_courts_template";
  if (url.includes("/config/schedule")) return "update_schedule";
  if (url.includes("/config/admin_open_ids")) return "update_admin_open_ids";
  if (url.includes("/config/score_cap")) return "update_score_cap";
  if (url.includes("/config/venue")) return "update_venue";
  if (url.includes("/reassign")) return "reassign";
  if (url.includes("/regenerate-rotation")) return "regenerate_rotation";
  if (url.includes("/recreate-courts")) return "recreate_courts";
  if (url.includes("/generate-assignments")) return "generate_assignments";
  if (url.includes("/assignments/") && url.includes("/move")) return "move_assignment";
  if (url.includes("/assignments/") && method === "DELETE") return "delete_assignment";
  if (url.includes("/add")) return "add_member";
  if (url.includes("/ops/trigger-signup")) return "trigger_signup";
  return `${method} ${url}`;
}

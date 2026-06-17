import type { FastifyInstance } from "fastify";
import { requireAdmin, getCurrentUser } from "./auth.js";
import {
  getConfig, setConfig, getWhitelist, getSpecialCourtTemplate,
  type CourtTemplate, type ScheduleConfig, type WhitelistMember,
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

type SState = "not_open" | "open" | "closed_pre_event" | "in_progress" | "finished";
const STATE_ZH: Record<SState, string> = {
  not_open: "预告", open: "报名中", closed_pre_event: "分组",
  in_progress: "比赛中", finished: "已结束",
};
function stateOf(s: {
  signup_open_at: Date; signup_close_at: Date;
  event_start_at: Date; event_end_at: Date;
}): SState {
  const now = new Date();
  if (now < s.signup_open_at) return "not_open";
  if (now < s.signup_close_at) return "open";
  if (now < s.event_start_at) return "closed_pre_event";
  if (now < s.event_end_at) return "in_progress";
  return "finished";
}
async function sessionStateById(id: number): Promise<SState | null> {
  const r = await pool.query(
    `SELECT signup_open_at, signup_close_at, event_start_at, event_end_at
       FROM sessions WHERE id = $1`, [id]);
  return r.rows[0] ? stateOf(r.rows[0]) : null;
}
/** 返回 null 表示放行;否则返回错误对象(调用方需 reply.code(409) 后 return 它) */
async function stageGuard(
  sessionId: number, allowed: SState[], action: string,
): Promise<{ error: string; code: string } | null> {
  const st = await sessionStateById(sessionId);
  if (!st) return { error: "场次不存在", code: "SESSION_NOT_FOUND" };
  if (!allowed.includes(st)) {
    const want = allowed.map((s) => STATE_ZH[s]).join("/");
    return { error: `当前为「${STATE_ZH[st]}」阶段,「${action}」仅在「${want}」阶段可操作`, code: "STAGE_LOCKED" };
  }
  return null;
}
async function sessionIdOfCourt(courtId: number): Promise<number | null> {
  const r = await pool.query<{ session_id: number }>(
    `SELECT session_id FROM courts WHERE id = $1`, [courtId]);
  return r.rows[0]?.session_id ?? null;
}
async function sessionIdOfAssignment(assignmentId: number): Promise<number | null> {
  const r = await pool.query<{ session_id: number }>(
    `SELECT c.session_id FROM court_assignments ca
       JOIN courts c ON c.id = ca.court_id WHERE ca.id = $1`, [assignmentId]);
  return r.rows[0]?.session_id ?? null;
}
/** 当前场次(getCurrentSession 选中的那个)的阶段;无场次返回 null */
async function currentSessionState(): Promise<SState | null> {
  const r = await pool.query(
    `SELECT signup_open_at, signup_close_at, event_start_at, event_end_at
       FROM sessions
      WHERE event_end_at > NOW() - INTERVAL '48 hours'
      ORDER BY CASE WHEN NOW() BETWEEN signup_open_at AND event_end_at THEN 0
                    WHEN signup_open_at > NOW() THEN 1 ELSE 2 END ASC, id DESC
      LIMIT 1`);
  return r.rows[0] ? stateOf(r.rows[0]) : null;
}

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
    const whitelist = await getWhitelist();
    const specialCourtsTemplate = await getSpecialCourtTemplate();
    return {
      courtsTemplate, schedule, adminOpenIds,
      scoreCap: scoreCap ?? 15,
      venue: venue ?? { name: "", address: "" },
      whitelist,
      specialCourtsTemplate,
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
      // #4/#5:场地数量/名称仅「预告」阶段可改,报名开始后锁定
      const st = await currentSessionState();
      if (st && st !== "not_open") {
        reply.code(409);
        return { error: `当前为「${STATE_ZH[st]}」阶段,场地配置仅在「预告」阶段可修改`, code: "STAGE_LOCKED" };
      }
      await setConfig("courts_template", v);
      return { ok: true };
    },
  );

  /**
   * #4 改「三场地特殊日」模板(对抗/竞技/休闲),同样仅「预告」阶段可改
   */
  app.put<{ Body: CourtTemplate[] }>(
    "/api/admin/config/special_courts_template",
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
      const st = await currentSessionState();
      if (st && st !== "not_open") {
        reply.code(409);
        return { error: `当前为「${STATE_ZH[st]}」阶段,场地配置仅在「预告」阶段可修改`, code: "STAGE_LOCKED" };
      }
      await setConfig("special_courts_template", v);
      return { ok: true };
    },
  );

  /**
   * #1 改报名白名单(白名单成员每轮自动置于报名名单最前,无需本人报名)
   */
  app.put<{ Body: WhitelistMember[] }>(
    "/api/admin/config/whitelist",
    async (req, reply) => {
      const v = req.body;
      if (!Array.isArray(v)) {
        reply.code(400);
        return { error: "白名单必须是数组" };
      }
      for (const m of v) {
        if (!m || typeof m.openId !== "string" || !m.openId.startsWith("ou_") || !m.name) {
          reply.code(400);
          return { error: `白名单项非法(openId 需以 ou_ 开头且有姓名):${JSON.stringify(m)}` };
        }
      }
      await setConfig("whitelist", v);
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
    async (req, reply) => {
      const sid = Number(req.params.id);
      const g = await stageGuard(sid, ["not_open"], "重建场地");
      if (g) { reply.code(409); return g; }
      const courts = await recreateCourtsForSession(sid);
      return { ok: true, courts };
    },
  );

  /**
   * 触发分组(若已分则忽略)
   */
  app.post<{ Params: { id: string } }>(
    "/api/admin/sessions/:id/generate-assignments",
    async (req, reply) => {
      const sid = Number(req.params.id);
      const g = await stageGuard(sid, ["closed_pre_event"], "调整分组");
      if (g) { reply.code(409); return g; }
      await generateAssignments(sid);
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
      const g = await stageGuard(sessionId, ["closed_pre_event"], "重新分组");
      if (g) { reply.code(409); return g; }
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
    async (req, reply) => {
      const sessionId = Number(req.params.id);
      const g = await stageGuard(sessionId, ["closed_pre_event"], "重新生成轮换");
      if (g) { reply.code(409); return g; }
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
    async (req, reply) => {
      const sid = await sessionIdOfAssignment(Number(req.params.id));
      const g = await stageGuard(sid ?? -1, ["closed_pre_event"], "移动分组成员");
      if (g) { reply.code(409); return g; }
      await moveAssignment(Number(req.params.id), req.body.newCourtId);
      return { ok: true };
    },
  );

  /**
   * 删除一个 assignment
   */
  app.delete<{ Params: { id: string } }>(
    "/api/admin/assignments/:id",
    async (req, reply) => {
      const sid = await sessionIdOfAssignment(Number(req.params.id));
      const g = await stageGuard(sid ?? -1, ["closed_pre_event"], "删除分组成员");
      if (g) { reply.code(409); return g; }
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
      const sid = await sessionIdOfCourt(Number(req.params.courtId));
      const g = await stageGuard(sid ?? -1, ["closed_pre_event"], "向场地添加成员");
      if (g) { reply.code(409); return g; }
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

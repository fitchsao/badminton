import type { FastifyInstance } from "fastify";
import { getCurrentSession } from "../services/session.js";
import {
  signUp, cancelSignup, listSignups, SignupError,
} from "../services/signup.js";
import { listCourts, createCourtsForSession } from "../services/court.js";
import {
  listAssignments, generateAssignments,
} from "../services/assignment.js";
import {
  listMatches, updateMatchScore, generateRotationForSession,
} from "../services/rotation.js";
import { getPref } from "../services/prefs.js";
import { getCurrentUser } from "./auth.js";
import { isAdmin } from "../services/settings.js";
import { getSessionLeaderboard, getCourtLeaderboard } from "../services/stats.js";
import { getScoreCap, getVenue } from "../services/settings.js";

type SessionState = "not_open" | "open" | "closed_pre_event" | "in_progress" | "finished";

function getState(s: {
  signup_open_at: Date;
  signup_close_at: Date;
  event_start_at: Date;
  event_end_at: Date;
}): SessionState {
  const now = new Date();
  if (now < s.signup_open_at) return "not_open";
  if (now < s.signup_close_at) return "open";
  if (now < s.event_start_at) return "closed_pre_event";
  if (now < s.event_end_at) return "in_progress";
  return "finished";
}

export async function sessionRoutes(app: FastifyInstance) {
  /**
   * 综合接口:返回当前 session + courts + signups + 我的状态 + 偏好
   * 按 session state 自动包含 assignments / matches
   */
  app.get("/api/sessions/current", async (req, reply) => {
    const session = await getCurrentSession();
    if (!session) {
      reply.code(404);
      return { error: "暂无活动场次" };
    }

    const me = getCurrentUser(req);
    const meWithAdmin = me
      ? { ...me, isAdmin: await isAdmin(me.openId) }
      : null;

    const state = getState(session);

    let courts = await listCourts(session.id);
    // 兼容 v1 遗留 session: 没 court 就按当前 template 补建
    if (courts.length === 0) {
      courts = await createCourtsForSession(session.id);
    }
    const signups = await listSignups(session.id, session.max_slots);
    const mySignup = me
      ? signups.find((s) => s.larkOpenId === me.openId) ?? null
      : null;
    const myPref = me ? await getPref(me.openId) : null;

    // 在截止后,自动触发一次分配(幂等)
    if (state === "closed_pre_event" || state === "in_progress" || state === "finished") {
      await generateAssignments(session.id);
    }
    // 在活动开始后,自动触发轮转生成
    if (state === "in_progress" || state === "finished") {
      await generateRotationForSession(session.id);
    }

    const assignments = state === "open" || state === "not_open"
      ? null
      : await listAssignments(session.id);
    const matches = state === "in_progress" || state === "finished"
      ? await listMatches(session.id)
      : null;
    const scoreCap = await getScoreCap();
    const venue = await getVenue();

    return {
      session: {
        id: session.id,
        eventStartAt: session.event_start_at,
        eventEndAt: session.event_end_at,
        signupOpenAt: session.signup_open_at,
        signupCloseAt: session.signup_close_at,
        maxSlots: session.max_slots,
        state,
      },
      courts,
      signups,
      mySignup,
      myPref,
      me: meWithAdmin,
      assignments,
      matches,
      scoreCap,
      venue,
    };
  });

  /**
   * 报名:必须带 preferredCourtType; 首次需要 gender
   */
  app.post<{
    Params: { id: string };
    Body: {
      preferredCourtType: "竞技" | "休闲";
      gender?: "男" | "女";
    };
  }>(
    "/api/sessions/:id/signup",
    async (req, reply) => {
      const me = getCurrentUser(req);
      if (!me) { reply.code(401); return { error: "请先登录" }; }

      const { preferredCourtType, gender } = req.body || {} as any;
      if (preferredCourtType !== "竞技" && preferredCourtType !== "休闲") {
        reply.code(400);
        return { error: "请选择场地类型(竞技/休闲)" };
      }

      // 校验 gender:若用户之前没填过,这次必须填
      const existingPref = await getPref(me.openId);
      if (!existingPref?.gender && !gender) {
        reply.code(400);
        return { error: "首次报名请选择性别", code: "GENDER_REQUIRED" };
      }

      try {
        const view = await signUp({
          sessionId: Number(req.params.id),
          larkOpenId: me.openId,
          userName: me.name,
          userAvatar: me.avatar,
          preferredCourtType,
          gender,
        });
        return { ok: true, signup: view };
      } catch (err) {
        if (err instanceof SignupError) {
          reply.code(400);
          return { error: err.message, code: err.code };
        }
        throw err;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/cancel",
    async (req, reply) => {
      const me = getCurrentUser(req);
      if (!me) { reply.code(401); return { error: "请先登录" }; }
      try {
        await cancelSignup({
          sessionId: Number(req.params.id),
          larkOpenId: me.openId,
        });
        return { ok: true };
      } catch (err) {
        if (err instanceof SignupError) {
          reply.code(400);
          return { error: err.message, code: err.code };
        }
        throw err;
      }
    },
  );

  /**
   * 比分更新:报名人皆可填(按需求设置)
   */
  app.post<{
    Params: { id: string };
    Body: { scoreA: number | null; scoreB: number | null };
  }>(
    "/api/matches/:id/score",
    async (req, reply) => {
      const me = getCurrentUser(req);
      if (!me) { reply.code(401); return { error: "请先登录" }; }
      const { scoreA, scoreB } = req.body || {} as any;
      try {
        await updateMatchScore(Number(req.params.id), scoreA ?? null, scoreB ?? null);
        return { ok: true };
      } catch (err: any) {
        reply.code(400);
        return { error: err.message ?? "更新失败" };
      }
    },
  );

  /**
   * 排行榜 (活动结束后用)
   */
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/leaderboard",
    async (req, reply) => {
      const me = getCurrentUser(req);
      if (!me) { reply.code(401); return { error: "请先登录" }; }
      const list = await getSessionLeaderboard(Number(req.params.id));
      return { entries: list };
    },
  );

  /**
   * 单场地排行榜
   */
  app.get<{ Params: { courtId: string } }>(
    "/api/courts/:courtId/leaderboard",
    async (req, reply) => {
      const me = getCurrentUser(req);
      if (!me) { reply.code(401); return { error: "请先登录" }; }
      const list = await getCourtLeaderboard(Number(req.params.courtId));
      return { entries: list };
    },
  );
}

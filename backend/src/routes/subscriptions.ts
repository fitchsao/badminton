import type { FastifyInstance } from "fastify";
import { subscribe, unsubscribe, isSubscribed, computeNextSignupOpenDate } from "../services/subscription.js";
import { getCurrentUser } from "./auth.js";

export async function subscriptionRoutes(app: FastifyInstance) {
  /**
   * 是否已订阅下周
   */
  app.get("/api/subscription/status", async (req, reply) => {
    const me = getCurrentUser(req);
    if (!me) { reply.code(401); return { error: "请先登录" }; }
    const subscribed = await isSubscribed(me.openId);
    const targetWeekStart = await computeNextSignupOpenDate();
    return { subscribed, targetWeekStart };
  });

  /**
   * 订阅下周(幂等)
   */
  app.post("/api/subscription", async (req, reply) => {
    const me = getCurrentUser(req);
    if (!me) { reply.code(401); return { error: "请先登录" }; }
    const r = await subscribe({ larkOpenId: me.openId, userName: me.name });
    return { ok: true, ...r };
  });

  /**
   * 取消订阅(只能取消尚未通知的)
   */
  app.delete("/api/subscription", async (req, reply) => {
    const me = getCurrentUser(req);
    if (!me) { reply.code(401); return { error: "请先登录" }; }
    await unsubscribe({ larkOpenId: me.openId });
    return { ok: true };
  });
}

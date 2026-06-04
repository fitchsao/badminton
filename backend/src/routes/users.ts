import type { FastifyInstance } from "fastify";
import { getUserStats } from "../services/stats.js";
import { computeRanksBulk } from "../services/rating.js";
import { getCurrentUser } from "./auth.js";

export async function userRoutes(app: FastifyInstance) {
  /**
   * 个人战绩页
   */
  app.get<{ Params: { openId: string } }>(
    "/api/users/:openId/stats",
    async (req, reply) => {
      const me = getCurrentUser(req);
      if (!me) { reply.code(401); return { error: "请先登录" }; }
      const stats = await getUserStats(req.params.openId);
      if (!stats) {
        reply.code(404);
        return { error: "用户未参加过任何场次" };
      }
      return stats;
    },
  );

  /**
   * 批量段位(主页名单挂徽章用)
   * body: { openIds: string[] }
   */
  app.post<{ Body: { openIds: string[] } }>(
    "/api/users/ranks",
    async (req, reply) => {
      const me = getCurrentUser(req);
      if (!me) { reply.code(401); return { error: "请先登录" }; }
      const { openIds } = req.body ?? { openIds: [] };
      if (!Array.isArray(openIds) || openIds.length === 0) {
        return { ranks: {} };
      }
      // 限制最大 100,防恶意打满
      const safe = openIds.slice(0, 100);
      const map = await computeRanksBulk(safe);
      const obj: Record<string, unknown> = {};
      for (const [id, rank] of map.entries()) obj[id] = rank;
      return { ranks: obj };
    },
  );
}

import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { sessionRoutes } from "./routes/sessions.js";
import { adminRoutes } from "./routes/admin.js";
import { userRoutes } from "./routes/users.js";
import { subscriptionRoutes } from "./routes/subscriptions.js";
import { devRoutes } from "./routes/dev.js";
import { startScheduler, triggerWeeklySignup } from "./scheduler.js";
import { runMigrations } from "./migrate.js";

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport: process.env.NODE_ENV === "production"
        ? undefined
        : { target: "pino-pretty" },
    },
  });

  // 先跑迁移
  await runMigrations(app.log);

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // 全局 rate limit:默认每分钟 120 次/IP,某些路由会单独覆盖
  await app.register(rateLimit, {
    global: false,  // 不强制对所有路由生效,只对显式声明的
    max: 120,
    timeWindow: "1 minute",
  });

  // 手动给写操作加 rate limit
  app.addHook("onRoute", (route) => {
    const path = route.path ?? "";
    const method = route.method;
    const isWrite = method === "POST" || method === "PATCH" || method === "DELETE";
    if (!isWrite) return;
    // 只针对几个关键写接口
    if (path.match(/\/api\/sessions\/.+\/(signup|cancel)/)
        || path.match(/\/api\/matches\/.+\/score/)
        || path.match(/\/api\/subscription/)
        || path.match(/\/api\/users\/ranks/)) {
      route.config = route.config ?? {};
      (route.config as any).rateLimit = { max: 30, timeWindow: "1 minute" };
    }
  });

  await app.register(authRoutes);
  await app.register(sessionRoutes);
  await app.register(adminRoutes);
  await app.register(userRoutes);
  await app.register(subscriptionRoutes);
  await app.register(devRoutes);

  // 健康检查
  app.get("/health", async () => ({ ok: true, time: new Date().toISOString() }));

  // 管理接口: 手动触发本周通知(用于首次启动/调试)
  // 简易保护: 必须带 ADMIN_TRIGGER_TOKEN
  app.post("/admin/trigger-signup", async (req, reply) => {
    const expected = process.env.ADMIN_TRIGGER_TOKEN;
    if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
      reply.code(403);
      return { error: "forbidden" };
    }
    await triggerWeeklySignup(app.log);
    return { ok: true };
  });

  await app.listen({ host: "0.0.0.0", port: config.app.port });
  app.log.info(`监听端口 ${config.app.port}`);

  startScheduler(app.log);
}

main().catch((err) => {
  console.error("启动失败", err);
  process.exit(1);
});

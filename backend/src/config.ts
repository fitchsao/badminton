import "dotenv/config";

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`缺少必需的环境变量: ${key}`);
  return v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? Number(v) : fallback;
}

/**
 * 仅保留凭证 / 部署 / 时区等不可在 UI 中修改的配置.
 * 业务配置(场地、时间表、admin 邮箱)现在从 DB 的 app_config 读.
 */
export const config = {
  lark: {
    appId: required("LARK_APP_ID"),
    appSecret: required("LARK_APP_SECRET"),
    baseUrl: process.env.LARK_BASE_URL || "https://open.feishu.cn",
    targetChatId: required("LARK_TARGET_CHAT_ID"),
  },
  app: {
    baseUrl: required("APP_BASE_URL"),
    port: num("PORT", 3000),
    tz: process.env.TZ || "Asia/Shanghai",
    cookieSecret: process.env.COOKIE_SECRET || (() => {
      // 没设置时给一个随机值 + 警告(每次重启所有 cookie 失效)
      // eslint-disable-next-line no-console
      console.warn("⚠️  COOKIE_SECRET 未设置,使用随机临时值。建议在 .env 加 COOKIE_SECRET=...");
      return Math.random().toString(36).slice(2) + Date.now();
    })(),
  },
  db: {
    url: required("DATABASE_URL"),
  },
};

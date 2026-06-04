import type { FastifyInstance, FastifyRequest } from "fastify";
import { exchangeCodeForUser } from "../lark.js";
import { config } from "../config.js";
import { isAdmin } from "../services/settings.js";
import { signCookie, verifyCookie } from "../utils/cookie.js";

/**
 * OAuth 流程:
 *   1. 前端 401 时跳 /api/auth/start
 *   2. 后端跳 Lark 授权页
 *   3. 用户授权后,Lark 跳回 /api/auth/callback?code=&state=
 *   4. 后端 code 换用户,种 HMAC 签名 cookie,跳回 state URL
 *
 * cookie 格式: base64url(json).hmac_sha256
 * 防伪造:任何篡改都会让 HMAC 校验失败,视为未登录
 */

export interface SessionUser {
  openId: string;
  name: string;
  avatar: string | null;
  email: string | null;
}

export async function authRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { return?: string } }>(
    "/api/auth/start",
    async (req, reply) => {
      const returnTo = req.query.return || config.app.baseUrl;
      const redirectUri = `${config.app.baseUrl}/api/auth/callback`;
      const url = new URL(`${config.lark.baseUrl}/open-apis/authen/v1/authorize`);
      url.searchParams.set("app_id", config.lark.appId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", returnTo);
      reply.redirect(url.toString(), 302);
    },
  );

  app.get<{ Querystring: { code?: string; state?: string } }>(
    "/api/auth/callback",
    async (req, reply) => {
      const { code, state } = req.query;
      if (!code) {
        reply.code(400);
        return { error: "missing code" };
      }

      const user = await exchangeCodeForUser(code);

      const payload: SessionUser = {
        openId: user.open_id,
        name: user.name,
        avatar: user.avatar_url ?? null,
        email: user.email ?? null,
      };
      const cookieValue = signCookie(payload, config.app.cookieSecret);
      reply.header(
        "set-cookie",
        `bm_user=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
      );

      const redirectTo = state && /^https?:\/\//.test(state) ? state : "/";
      reply.redirect(redirectTo, 302);
    },
  );

  app.get("/api/auth/me", async (req, reply) => {
    const me = getCurrentUser(req);
    if (!me) {
      reply.code(401);
      return { error: "not logged in" };
    }
    return { ...me, isAdmin: await isAdmin(me.openId) };
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.header(
      "set-cookie",
      "bm_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    return { ok: true };
  });
}

/**
 * 从 cookie 解析当前用户(供其他路由用)
 */
export function getCurrentUser(req: FastifyRequest): SessionUser | null {
  const raw = req.headers.cookie?.split(";").find((c) => c.trim().startsWith("bm_user="));
  if (!raw) return null;
  const value = raw.split("=")[1];
  return verifyCookie<SessionUser>(value, config.app.cookieSecret);
}

/**
 * 路由层守卫:要求当前用户是 admin
 */
export async function requireAdmin(
  req: FastifyRequest,
): Promise<SessionUser> {
  const me = getCurrentUser(req);
  if (!me) {
    const err: any = new Error("请先登录");
    err.statusCode = 401;
    throw err;
  }
  if (!(await isAdmin(me.openId))) {
    const err: any = new Error("无管理员权限");
    err.statusCode = 403;
    throw err;
  }
  return me;
}

import { request } from "undici";
import { config } from "./config.js";

/**
 * tenant_access_token 缓存
 * Lark 文档: token 有效期 7200 秒, 这里提前 5 分钟刷新
 */
let cachedToken: { value: string; expireAt: number } | null = null;

async function getTenantAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expireAt > now + 60_000) {
    return cachedToken.value;
  }

  const { statusCode, body } = await request(
    `${config.lark.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        app_id: config.lark.appId,
        app_secret: config.lark.appSecret,
      }),
    },
  );

  const data = (await body.json()) as {
    code: number;
    msg: string;
    tenant_access_token?: string;
    expire?: number;
  };

  if (statusCode !== 200 || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`获取 tenant_access_token 失败: ${JSON.stringify(data)}`);
  }

  cachedToken = {
    value: data.tenant_access_token,
    expireAt: now + (data.expire ?? 7200) * 1000 - 300_000,
  };
  return cachedToken.value;
}

/**
 * 通用调用 Lark Open API
 */
async function callLark<T = unknown>(
  path: string,
  options: { method?: string; query?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const token = await getTenantAccessToken();
  const url = new URL(`${config.lark.baseUrl}${path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) url.searchParams.set(k, v);
  }
  const { statusCode, body } = await request(url, {
    method: (options.method ?? "GET") as any,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = (await body.json()) as { code: number; msg: string; data?: T };
  if (statusCode !== 200 || data.code !== 0) {
    throw new Error(`Lark API ${path} 失败: ${JSON.stringify(data)}`);
  }
  return data.data as T;
}

// ============ 业务方法 ============

export interface SendCardResult {
  message_id: string;
}

/**
 * 向群发送交互式卡片
 */
export async function sendInteractiveCard(
  chatId: string,
  card: object,
): Promise<SendCardResult> {
  return callLark<SendCardResult>("/open-apis/im/v1/messages", {
    method: "POST",
    query: { receive_id_type: "chat_id" },
    body: {
      receive_id: chatId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    },
  });
}

/**
 * 向单个用户(open_id)发送私信卡片
 * 需要应用具备 im:message:send_as_bot 权限
 */
export async function sendPrivateCard(
  openId: string,
  card: object,
): Promise<SendCardResult> {
  return callLark<SendCardResult>("/open-apis/im/v1/messages", {
    method: "POST",
    query: { receive_id_type: "open_id" },
    body: {
      receive_id: openId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    },
  });
}

/**
 * 用 OAuth code 换 user_access_token + 基本用户信息
 * Lark 端点: POST /open-apis/authen/v1/oidc/access_token
 *
 * 注: email 字段需要 OAuth scope 中包含 "email";
 *     如果用户没暴露邮箱, email 字段为空,会回退到 enterprise_email
 */
export interface LarkUserInfo {
  open_id: string;
  name: string;
  avatar_url?: string;
  email?: string;
  user_access_token: string;
}

export async function exchangeCodeForUser(code: string): Promise<LarkUserInfo> {
  const tokenResp = await callLark<{
    access_token: string;
    open_id: string;
  }>("/open-apis/authen/v1/oidc/access_token", {
    method: "POST",
    body: { grant_type: "authorization_code", code },
  });

  // 用 user_access_token 拉用户信息
  const url = `${config.lark.baseUrl}/open-apis/authen/v1/user_info`;
  const { body } = await request(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${tokenResp.access_token}`,
    },
  });
  const data = (await body.json()) as {
    code: number;
    msg: string;
    data: {
      name: string;
      avatar_url?: string;
      open_id: string;
      email?: string;
      enterprise_email?: string;
    };
  };
  if (data.code !== 0) {
    throw new Error(`获取用户信息失败: ${JSON.stringify(data)}`);
  }

  return {
    open_id: data.data.open_id,
    name: data.data.name,
    avatar_url: data.data.avatar_url,
    email: data.data.enterprise_email || data.data.email,
    user_access_token: tokenResp.access_token,
  };
}

/**
 * 构造报名通知卡片
 */
export function buildSignupNotificationCard(params: {
  eventStartAt: Date;
  maxSlots: number;
  signupCloseAt: Date;
  appUrl: string; // 带 session_id 的跳转链接
  tz: string;
}): object {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: params.tz,
      month: "long",
      day: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);

  const fmtTimeOnly = (d: Date) =>
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: params.tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);

  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: "🏸 本周羽毛球报名开始" },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**活动时间**：${fmt(params.eventStartAt)} 起,共 2 小时\n**正式名额**：${params.maxSlots} 人,第 ${params.maxSlots + 1} 名起进入候补\n**截止时间**：${fmt(params.signupCloseAt)}(活动前 2 小时)`,
        },
      },
      { tag: "hr" },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "前往报名" },
            type: "primary",
            url: params.appUrl,
          },
        ],
      },
    ],
  };
}

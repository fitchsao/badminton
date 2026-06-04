import "dotenv/config";

export const BASE_URL = process.env.BASE_URL || "https://klookbadminton.duckdns.org";
export const DEV_SECRET = process.env.DEV_SECRET || "";

if (!DEV_SECRET) {
  throw new Error("DEV_SECRET 未设置 — 请创建 .env 并填入正确值");
}

/**
 * 简易 HTTP 客户端
 * - 自动维护 cookie(单 ApiClient 实例)
 * - JSON 序列化/反序列化
 * - 错误抛出包含 statusCode 和 body
 */
export class ApiClient {
  private cookie: string | null = null;
  baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.cookie) headers["cookie"] = this.cookie;

    const r = await fetch(`${this.baseUrl}${path}`, {
      method, headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });

    // 收 set-cookie
    const sc = r.headers.get("set-cookie");
    if (sc) {
      // 极简解析:取第一段 (KEY=VALUE)
      const first = sc.split(/,\s*(?=[A-Za-z0-9_]+=)/)[0];
      const pair = first.split(";")[0];
      this.cookie = pair;
    }

    const text = await r.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* 非 JSON 留 text */ }

    if (!r.ok) {
      const err: any = new Error(
        `${method} ${path} → ${r.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`,
      );
      err.statusCode = r.status;
      err.body = data;
      throw err;
    }
    return data as T;
  }

  get<T = any>(path: string) { return this.request<T>("GET", path); }
  post<T = any>(path: string, body?: unknown) { return this.request<T>("POST", path, body ?? {}); }
  put<T = any>(path: string, body?: unknown) { return this.request<T>("PUT", path, body ?? {}); }
  patch<T = any>(path: string, body?: unknown) { return this.request<T>("PATCH", path, body ?? {}); }
  delete<T = any>(path: string) { return this.request<T>("DELETE", path); }

  /**
   * 使用 dev-login 登录为指定 fake 用户
   */
  async loginAs(openId: string, name: string): Promise<void> {
    await this.post("/api/dev/login", {
      secret: DEV_SECRET, openId, name,
    });
  }

  clearCookie() {
    this.cookie = null;
  }
}

/**
 * 重置 mock 数据(全局,所有测试用例之间共享一个 reset 调用)
 */
export async function resetMockData(): Promise<void> {
  const c = new ApiClient();
  await c.post("/api/dev/reset", { secret: DEV_SECRET });
}

/**
 * 把"最近一个未来 session"切到指定状态
 */
export async function setStage(
  stage: "signup_open" | "signup_closed" | "in_progress" | "finished",
  sessionId?: number,
): Promise<{ ok: boolean; sessionId: number }> {
  const c = new ApiClient();
  return c.post("/api/dev/session-stage", {
    secret: DEV_SECRET, stage, sessionId,
  });
}

/**
 * 构造一个测试用 fake 用户
 *   openId 前缀 test_user_ 避免和 mock_user_ 冲突
 */
export function fakeUser(suffix: string, name?: string) {
  return {
    openId: `test_user_${suffix}`,
    name: name ?? `测试用户${suffix}`,
  };
}

/** 真实 admin (Fitch) */
export const FITCH = {
  openId: "ou_44c0c24528dbd6f03ce5b41fdcab92ef",
  name: "Fitch Yu",
};

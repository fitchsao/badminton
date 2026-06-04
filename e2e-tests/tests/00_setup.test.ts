import { describe, it, expect, beforeEach } from "vitest";
import { ApiClient, resetMockData, setStage, FITCH } from "./helpers/api.js";

describe("00. 环境检查", () => {
  beforeEach(async () => {
    await resetMockData();
  });

  it("dev-login 能拿到 cookie", async () => {
    const c = new ApiClient();
    await c.loginAs(FITCH.openId, FITCH.name);
    const me = await c.get("/api/auth/me");
    expect(me.openId).toBe(FITCH.openId);
    expect(me.name).toBe(FITCH.name);
  });

  it("dev-reset 已重置出新 session(报名开放)", async () => {
    await setStage("signup_open");
    const c = new ApiClient();
    await c.loginAs(FITCH.openId, FITCH.name);
    const data = await c.get("/api/sessions/current");
    expect(data.session.state).toBe("open");
    expect(data.session.maxSlots).toBe(16);
  });

  it("当前可报名 session 含 mock 用户报名", async () => {
    const c = new ApiClient();
    await c.loginAs(FITCH.openId, FITCH.name);
    const data = await c.get("/api/sessions/current");
    const mockUsers = data.signups.filter((s: any) =>
      String(s.larkOpenId).startsWith("mock_user_"));
    expect(mockUsers.length).toBeGreaterThanOrEqual(15);
  });
});

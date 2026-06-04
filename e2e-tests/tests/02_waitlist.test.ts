import { describe, it, expect, beforeAll } from "vitest";
import { ApiClient, resetMockData, setStage, fakeUser } from "./helpers/api.js";

describe("02. 候补晋升", () => {
  beforeAll(async () => {
    await resetMockData();
    await setStage("signup_open");
  });

  it("填满正式名单 → 后来者进候补", async () => {
    // mock 已有 15 个报名(11 正式 + 4 候补),所以再报 1 个正式 + 1 个候补
    // 即:正式位 16 - 11 = 5 个剩余,需要再报 5 个才填满,然后第 6 个进候补
    let sessionId = 0;
    for (let i = 0; i < 5; i++) {
      const u = fakeUser(`fill${i}`, `测试-Fill${i}`);
      const c = new ApiClient();
      await c.loginAs(u.openId, u.name);
      const d = await c.get("/api/sessions/current");
      sessionId = d.session.id;
      await c.post(`/api/sessions/${sessionId}/signup`, {
        preferredCourtType: "竞技", gender: "男",
      });
    }
    // 第 6 个 → 应该进候补
    const last = fakeUser("over1", "测试-Over1");
    const lc = new ApiClient();
    await lc.loginAs(last.openId, last.name);
    await lc.post(`/api/sessions/${sessionId}/signup`, {
      preferredCourtType: "竞技", gender: "女",
    });
    const data = await lc.get("/api/sessions/current");
    const meSignup = data.signups.find((s: any) => s.larkOpenId === last.openId);
    expect(meSignup.isWaitlist).toBe(true);
  });

  it("正式名单中一人取消 → 第一位候补晋升", async () => {
    // 取数据
    const c = new ApiClient();
    await c.loginAs("ou_44c0c24528dbd6f03ce5b41fdcab92ef", "Fitch Yu");
    const before = await c.get("/api/sessions/current");
    const formals = before.signups.filter((s: any) => !s.isWaitlist);
    const waitlist = before.signups.filter((s: any) => s.isWaitlist);
    expect(waitlist.length).toBeGreaterThan(0);

    // 选一个 mock_user 取消(用本人 cookie)
    const toCancel = formals.find((s: any) =>
      String(s.larkOpenId).startsWith("mock_user_")) ?? formals[0];
    const firstWaitlistId = waitlist[0].larkOpenId;

    const cancelClient = new ApiClient();
    await cancelClient.loginAs(toCancel.larkOpenId, toCancel.userName);
    await cancelClient.post(`/api/sessions/${before.session.id}/cancel`);

    // 再查一遍
    const after = await c.get("/api/sessions/current");
    const promoted = after.signups.find((s: any) => s.larkOpenId === firstWaitlistId);
    expect(promoted).toBeDefined();
    expect(promoted.isWaitlist).toBe(false);
  });
});

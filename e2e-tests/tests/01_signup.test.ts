import { describe, it, expect, beforeEach } from "vitest";
import { ApiClient, resetMockData, setStage, fakeUser } from "./helpers/api.js";

describe("01. 报名 / 取消 / 重新报名", () => {
  beforeEach(async () => {
    await resetMockData();
    await setStage("signup_open");
  });

  it("新用户能成功报名进候补(因为前 11 个 mock 已占正式 + Fitch 占 1 = 12, 还有 4 个正式位)", async () => {
    const u = fakeUser("alice", "测试-Alice");
    const c = new ApiClient();
    await c.loginAs(u.openId, u.name);

    const data1 = await c.get("/api/sessions/current");
    const sessionId = data1.session.id;
    const beforeFormalCount = data1.signups.filter((s: any) => !s.isWaitlist).length;

    await c.post(`/api/sessions/${sessionId}/signup`, {
      preferredCourtType: "竞技", gender: "男",
    });

    const data2 = await c.get("/api/sessions/current");
    const meSignup = data2.signups.find((s: any) => s.larkOpenId === u.openId);
    expect(meSignup).toBeDefined();
    expect(meSignup.isWaitlist).toBe(false);
    expect(data2.signups.filter((s: any) => !s.isWaitlist).length).toBe(beforeFormalCount + 1);
  });

  it("取消后从名单消失", async () => {
    const u = fakeUser("bob", "测试-Bob");
    const c = new ApiClient();
    await c.loginAs(u.openId, u.name);
    const { session } = await c.get("/api/sessions/current");
    await c.post(`/api/sessions/${session.id}/signup`, {
      preferredCourtType: "休闲", gender: "女",
    });
    await c.post(`/api/sessions/${session.id}/cancel`);
    const after = await c.get("/api/sessions/current");
    const found = after.signups.find((s: any) => s.larkOpenId === u.openId);
    expect(found).toBeUndefined();
  });

  it("取消后可以重新报名", async () => {
    const u = fakeUser("carol", "测试-Carol");
    const c = new ApiClient();
    await c.loginAs(u.openId, u.name);
    const { session } = await c.get("/api/sessions/current");
    await c.post(`/api/sessions/${session.id}/signup`, {
      preferredCourtType: "竞技", gender: "女",
    });
    await c.post(`/api/sessions/${session.id}/cancel`);
    await c.post(`/api/sessions/${session.id}/signup`, {
      preferredCourtType: "竞技", gender: "女",
    });
    const after = await c.get("/api/sessions/current");
    const found = after.signups.find((s: any) => s.larkOpenId === u.openId);
    expect(found).toBeDefined();
    expect(found.isWaitlist).toBe(false);
  });

  it("重复报名(未取消)返回错误", async () => {
    const u = fakeUser("dave", "测试-Dave");
    const c = new ApiClient();
    await c.loginAs(u.openId, u.name);
    const { session } = await c.get("/api/sessions/current");
    await c.post(`/api/sessions/${session.id}/signup`, {
      preferredCourtType: "竞技", gender: "男",
    });
    await expect(
      c.post(`/api/sessions/${session.id}/signup`, {
        preferredCourtType: "竞技", gender: "男",
      }),
    ).rejects.toThrow(/已报名|ALREADY/i);
  });
});

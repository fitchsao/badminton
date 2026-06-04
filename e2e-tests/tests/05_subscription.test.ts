import { describe, it, expect, beforeAll } from "vitest";
import { ApiClient, resetMockData, setStage, fakeUser } from "./helpers/api.js";

describe("05. 下周报名订阅", () => {
  beforeAll(async () => {
    await resetMockData();
    await setStage("finished");
  });

  it("初始未订阅", async () => {
    const u = fakeUser("sub1", "测试-Sub1");
    const c = new ApiClient();
    await c.loginAs(u.openId, u.name);
    const r = await c.get("/api/subscription/status");
    expect(r.subscribed).toBe(false);
    expect(typeof r.targetWeekStart).toBe("string");
  });

  it("订阅成功", async () => {
    const u = fakeUser("sub2", "测试-Sub2");
    const c = new ApiClient();
    await c.loginAs(u.openId, u.name);
    await c.post("/api/subscription");
    const r = await c.get("/api/subscription/status");
    expect(r.subscribed).toBe(true);
  });

  it("订阅是幂等的(重复订阅不报错)", async () => {
    const u = fakeUser("sub3", "测试-Sub3");
    const c = new ApiClient();
    await c.loginAs(u.openId, u.name);
    await c.post("/api/subscription");
    await c.post("/api/subscription"); // 不应抛出
    const r = await c.get("/api/subscription/status");
    expect(r.subscribed).toBe(true);
  });

  it("取消订阅", async () => {
    const u = fakeUser("sub4", "测试-Sub4");
    const c = new ApiClient();
    await c.loginAs(u.openId, u.name);
    await c.post("/api/subscription");
    await c.delete("/api/subscription");
    const r = await c.get("/api/subscription/status");
    expect(r.subscribed).toBe(false);
  });
});

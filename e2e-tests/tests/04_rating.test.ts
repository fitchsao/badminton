import { describe, it, expect, beforeAll } from "vitest";
import { ApiClient, resetMockData, FITCH } from "./helpers/api.js";

describe("04. 段位 + 个人战绩", () => {
  let c: ApiClient;

  beforeAll(async () => {
    await resetMockData();
    c = new ApiClient();
    await c.loginAs(FITCH.openId, FITCH.name);
  });

  it("Fitch 应有段位(因为 mock 给了 8 场胜率 87.5% 的历史数据)", async () => {
    const r = await c.post("/api/users/ranks", {
      openIds: [FITCH.openId],
    });
    const rank = r.ranks[FITCH.openId];
    expect(rank).toBeDefined();
    expect(rank.matches).toBeGreaterThanOrEqual(5);
    expect(rank.tier).not.toBe("待定");
    expect(["白银", "黄金", "铂金", "钻石", "星耀", "王者"]).toContain(rank.tier);
  });

  it("没历史的 mock 用户应为「待定」", async () => {
    const r = await c.post("/api/users/ranks", {
      openIds: ["mock_user_10", "mock_user_15"],
    });
    expect(r.ranks["mock_user_10"].tier).toBe("待定");
    expect(r.ranks["mock_user_15"].tier).toBe("待定");
  });

  it("个人战绩端点返回完整结构", async () => {
    const stats = await c.get(`/api/users/${FITCH.openId}/stats`);
    expect(stats.openId).toBe(FITCH.openId);
    expect(stats.userName).toBeTruthy();
    expect(stats.rank).toBeDefined();
    expect(typeof stats.totalMatches).toBe("number");
    expect(Array.isArray(stats.topPartners)).toBe(true);
    expect(Array.isArray(stats.topRivals)).toBe(true);
  });

  it("Fitch 有搭档历史(应至少 1 个搭档)", async () => {
    const stats = await c.get(`/api/users/${FITCH.openId}/stats`);
    expect(stats.topPartners.length).toBeGreaterThan(0);
  });
});

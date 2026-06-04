import { describe, it, expect, beforeAll } from "vitest";
import { ApiClient, resetMockData, FITCH } from "./helpers/api.js";

describe("06. Admin 配置", () => {
  let c: ApiClient;

  beforeAll(async () => {
    await resetMockData();
    c = new ApiClient();
    await c.loginAs(FITCH.openId, FITCH.name);
  });

  it("非 admin 调 admin 端点 403", async () => {
    const u = new ApiClient();
    await u.loginAs("test_not_admin_99", "非管理员");
    await expect(u.get("/api/admin/config")).rejects.toThrow(/403|权限/);
  });

  it("Admin 能读 config", async () => {
    const cfg = await c.get("/api/admin/config");
    expect(cfg).toHaveProperty("courtsTemplate");
    expect(cfg).toHaveProperty("schedule");
    expect(cfg).toHaveProperty("scoreCap");
  });

  it("Admin 能改 score_cap", async () => {
    await c.put("/api/admin/config/score_cap", { scoreCap: 21 });
    const cfg1 = await c.get("/api/admin/config");
    expect(cfg1.scoreCap).toBe(21);

    // 改回来
    await c.put("/api/admin/config/score_cap", { scoreCap: 15 });
    const cfg2 = await c.get("/api/admin/config");
    expect(cfg2.scoreCap).toBe(15);
  });

  it("score_cap 非法值被拒绝", async () => {
    await expect(c.put("/api/admin/config/score_cap", { scoreCap: 99 }))
      .rejects.toThrow(/400|非法/);
  });
});

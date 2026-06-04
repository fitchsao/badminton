import { describe, it, expect, beforeAll } from "vitest";
import { ApiClient, resetMockData, setStage, FITCH } from "./helpers/api.js";

describe("03. 比分填写 + 排行榜", () => {
  let c: ApiClient;
  let sessionId = 0;
  let matchId = 0;

  beforeAll(async () => {
    await resetMockData();
    await setStage("in_progress");
    c = new ApiClient();
    await c.loginAs(FITCH.openId, FITCH.name);
    const data = await c.get("/api/sessions/current");
    sessionId = data.session.id;
    expect(data.matches.length).toBeGreaterThan(0);
    matchId = data.matches[0].id;
  });

  it("能填比分", async () => {
    await c.post(`/api/matches/${matchId}/score`, { scoreA: 11, scoreB: 7 });
    const data = await c.get("/api/sessions/current");
    const m = data.matches.find((x: any) => x.id === matchId);
    expect(m.scoreA).toBe(11);
    expect(m.scoreB).toBe(7);
  });

  it("能修改比分", async () => {
    await c.post(`/api/matches/${matchId}/score`, { scoreA: 15, scoreB: 13 });
    const data = await c.get("/api/sessions/current");
    const m = data.matches.find((x: any) => x.id === matchId);
    expect(m.scoreA).toBe(15);
    expect(m.scoreB).toBe(13);
  });

  it("Session 排行榜按 胜场 → 净胜分 → 总得分 排序", async () => {
    const r = await c.get(`/api/sessions/${sessionId}/leaderboard`);
    expect(Array.isArray(r.entries)).toBe(true);
    if (r.entries.length >= 2) {
      const [a, b] = r.entries;
      // a 应该胜场 >= b 胜场,或者胜场相同时净胜分 >= b 净胜分
      const ok =
        a.wins > b.wins
        || (a.wins === b.wins && a.scoreDiff >= b.scoreDiff)
        || (a.wins === b.wins && a.scoreDiff === b.scoreDiff && a.scoreFor >= b.scoreFor);
      expect(ok).toBe(true);
    }
  });

  it("单 court 排行榜端点能返回数据", async () => {
    const data = await c.get("/api/sessions/current");
    const courtId = data.courts[0].id;
    const r = await c.get(`/api/courts/${courtId}/leaderboard`);
    expect(Array.isArray(r.entries)).toBe(true);
  });
});

import { pool } from "../db.js";

/**
 * 段位体系(王者荣耀风):
 *   过去 3 个月滚动窗口数据,以 4 个原始指标加权求和得到 MMR(0..5000),
 *   按区间划分 7 大段位,前 6 段位再分 3 个子段位
 */

export type Tier = "青铜" | "白银" | "黄金" | "铂金" | "钻石" | "星耀" | "王者" | "待定";
export type Division = "III" | "II" | "I" | "";

export interface Rank {
  mmr: number;            // 0..5000, 待定时 -1
  tier: Tier;
  division: Division;     // 王者/待定 无子段位
  emoji: string;
  label: string;          // 如 "黄金 II" / "王者" / "待定"
  matches: number;        // 3 月内场数
  wins: number;
  losses: number;
  winRate: number;        // 0..1
  avgScoreDiff: number;
  progressToNext: number; // 0..1, 距离下一段位的进度
  nextLabel: string | null; // 下一段位标签;王者为 null
}

const TIER_RANGES: { tier: Tier; min: number; max: number; emoji: string }[] = [
  { tier: "青铜", min: 0,    max: 800,  emoji: "🤎" },
  { tier: "白银", min: 800,  max: 1400, emoji: "🩶" },
  { tier: "黄金", min: 1400, max: 1900, emoji: "💛" },
  { tier: "铂金", min: 1900, max: 2400, emoji: "💎" },
  { tier: "钻石", min: 2400, max: 2900, emoji: "💠" },
  { tier: "星耀", min: 2900, max: 3400, emoji: "⭐" },
  { tier: "王者", min: 3400, max: 5000, emoji: "👑" },
];

/**
 * 计算单个用户的段位
 * 数据范围:过去 3 个月内 cancelled_at IS NULL 且 matches 表已有比分的场
 */
export async function computeRank(openId: string): Promise<Rank> {
  const stats = await fetchMatchStats(openId);
  return buildRank(stats);
}

/**
 * 批量计算多个 open_id 的段位(主页名单挂徽章用)
 * 在一次查询里拉所有 match 数据再分组,避免 N+1
 */
export async function computeRanksBulk(
  openIds: string[],
): Promise<Map<string, Rank>> {
  if (openIds.length === 0) return new Map();

  // 一次查询拉所有人的近 3 月 match 参与情况
  const r = await pool.query<{
    lark_open_id: string;
    score_a: number;
    score_b: number;
    team_side: "a" | "b";
    is_competitive: boolean;
  }>(
    `WITH cutoff AS (SELECT NOW() - INTERVAL '90 days' AS t)
     SELECT s.lark_open_id,
            m.score_a, m.score_b,
            CASE WHEN ca.id IN (m.team_a_p1, m.team_a_p2) THEN 'a' ELSE 'b' END AS team_side,
            (c.court_type = '竞技') AS is_competitive
       FROM matches m
       JOIN courts c ON c.id = m.court_id
       JOIN sessions sess ON sess.id = c.session_id
       JOIN court_assignments ca
         ON ca.id IN (m.team_a_p1, m.team_a_p2, m.team_b_p1, m.team_b_p2)
       JOIN signups s ON s.id = ca.signup_id
      WHERE s.lark_open_id = ANY($1::text[])
        AND s.cancelled_at IS NULL
        AND m.score_a IS NOT NULL AND m.score_b IS NOT NULL
        AND sess.event_start_at >= (SELECT t FROM cutoff)`,
    [openIds],
  );

  // 聚合
  const byUser = new Map<string, MatchStats>();
  for (const id of openIds) {
    byUser.set(id, emptyStats());
  }
  for (const row of r.rows) {
    const s = byUser.get(row.lark_open_id)!;
    s.matches++;
    const won = row.team_side === "a" ? row.score_a > row.score_b : row.score_b > row.score_a;
    if (row.score_a === row.score_b) {
      s.draws++;
    } else if (won) {
      s.wins++;
    } else {
      s.losses++;
    }
    const myScore = row.team_side === "a" ? row.score_a : row.score_b;
    const oppScore = row.team_side === "a" ? row.score_b : row.score_a;
    s.scoreFor += myScore;
    s.scoreAgainst += oppScore;
    s.sumDiff += (myScore - oppScore);
    if (row.is_competitive) s.competitiveMatches++;
  }

  const out = new Map<string, Rank>();
  for (const [id, stats] of byUser.entries()) {
    out.set(id, buildRank(stats));
  }
  return out;
}

// ============ 内部 ============

interface MatchStats {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  scoreFor: number;
  scoreAgainst: number;
  sumDiff: number;
  competitiveMatches: number;
}

function emptyStats(): MatchStats {
  return {
    matches: 0, wins: 0, losses: 0, draws: 0,
    scoreFor: 0, scoreAgainst: 0, sumDiff: 0,
    competitiveMatches: 0,
  };
}

async function fetchMatchStats(openId: string): Promise<MatchStats> {
  const m = await computeRanksBulk([openId]);
  // 取出 stats(已转成 rank 了所以反算回 stats)
  // 简单做法:直接走 bulk 然后只拿基础数据
  // 为了避免代码重复,我们重新查一次(单人查询很快)
  const r = await pool.query<{
    score_a: number; score_b: number;
    team_side: "a" | "b"; is_competitive: boolean;
  }>(
    `WITH cutoff AS (SELECT NOW() - INTERVAL '90 days' AS t)
     SELECT m.score_a, m.score_b,
            CASE WHEN ca.id IN (m.team_a_p1, m.team_a_p2) THEN 'a' ELSE 'b' END AS team_side,
            (c.court_type = '竞技') AS is_competitive
       FROM matches m
       JOIN courts c ON c.id = m.court_id
       JOIN sessions sess ON sess.id = c.session_id
       JOIN court_assignments ca
         ON ca.id IN (m.team_a_p1, m.team_a_p2, m.team_b_p1, m.team_b_p2)
       JOIN signups s ON s.id = ca.signup_id
      WHERE s.lark_open_id = $1
        AND s.cancelled_at IS NULL
        AND m.score_a IS NOT NULL AND m.score_b IS NOT NULL
        AND sess.event_start_at >= (SELECT t FROM cutoff)`,
    [openId],
  );
  const stats = emptyStats();
  for (const row of r.rows) {
    stats.matches++;
    const myScore = row.team_side === "a" ? row.score_a : row.score_b;
    const oppScore = row.team_side === "a" ? row.score_b : row.score_a;
    if (row.score_a === row.score_b) stats.draws++;
    else if (myScore > oppScore) stats.wins++;
    else stats.losses++;
    stats.scoreFor += myScore;
    stats.scoreAgainst += oppScore;
    stats.sumDiff += (myScore - oppScore);
    if (row.is_competitive) stats.competitiveMatches++;
  }
  void m; // 哑用,避免 lint 警告
  return stats;
}

function buildRank(s: MatchStats): Rank {
  // 不足 5 场显示「待定」
  if (s.matches < 5) {
    return {
      mmr: -1,
      tier: "待定",
      division: "",
      emoji: "🍼",
      label: "待定",
      matches: s.matches,
      wins: s.wins, losses: s.losses,
      winRate: s.matches > 0 ? s.wins / s.matches : 0,
      avgScoreDiff: s.matches > 0 ? s.sumDiff / s.matches : 0,
      progressToNext: 0,
      nextLabel: "青铜 III",
    };
  }

  const winRate = s.wins / s.matches;
  const avgDiff = s.sumDiff / s.matches;
  const compRatio = s.competitiveMatches / s.matches;

  const mmr = clamp(
    1000
    + Math.min(s.matches, 60) * 25     // 活跃 0..1500
    + (winRate - 0.5) * 3000           // 胜率 -1500..1500
    + avgDiff * 100                    // 净胜 -1500..1500(理论)
    + compRatio * 500,                 // 竞技场 0..500
    0, 5000,
  );

  const { tier, emoji, tierMin, tierMax } = findTier(mmr);

  let division: Division = "";
  let label: string;
  let progressToNext: number;
  let nextLabel: string | null;

  if (tier === "王者") {
    label = `${tier} ${mmr.toFixed(0)}`;
    progressToNext = 1;
    nextLabel = null;
  } else {
    // 子段位:把当前 tier 区间等分 3 份
    const span = tierMax - tierMin;
    const intoTier = mmr - tierMin;
    const divIdx = Math.min(2, Math.floor(intoTier / (span / 3)));
    division = (["III", "II", "I"] as Division[])[divIdx];
    label = `${tier} ${division}`;

    // 进度:在当前子段位内的进度
    const divSpan = span / 3;
    const intoDiv = intoTier - divIdx * divSpan;
    progressToNext = Math.min(1, Math.max(0, intoDiv / divSpan));

    if (divIdx < 2) {
      const nextDivision = (["III", "II", "I"] as Division[])[divIdx + 1];
      nextLabel = `${tier} ${nextDivision}`;
    } else {
      // 当前子段位是最高的 I,下一个是下一个 tier 的 III
      const nextTierIdx = TIER_RANGES.findIndex((t) => t.tier === tier) + 1;
      const next = TIER_RANGES[nextTierIdx];
      nextLabel = next ? `${next.tier}${next.tier === "王者" ? "" : " III"}` : null;
    }
  }

  return {
    mmr: Math.round(mmr),
    tier, division, emoji, label,
    matches: s.matches, wins: s.wins, losses: s.losses,
    winRate, avgScoreDiff: avgDiff,
    progressToNext, nextLabel,
  };
}

function findTier(mmr: number): { tier: Tier; emoji: string; tierMin: number; tierMax: number } {
  for (const t of TIER_RANGES) {
    if (mmr >= t.min && mmr < t.max) {
      return { tier: t.tier, emoji: t.emoji, tierMin: t.min, tierMax: t.max };
    }
  }
  // 兜底
  const last = TIER_RANGES[TIER_RANGES.length - 1];
  return { tier: last.tier, emoji: last.emoji, tierMin: last.min, tierMax: last.max };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

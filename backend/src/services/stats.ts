import { pool } from "../db.js";
import { computeRank, type Rank } from "./rating.js";

export interface UserStats {
  openId: string;
  userName: string;
  avatar: string | null;
  rank: Rank;
  attendance: {
    sessionsRegistered: number;   // 出现在 signups 中(含取消的)
    sessionsFormal: number;       // 进入正式名单
    sessionsWaitlist: number;
    cancelled: number;
  };
  totalMatches: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  scoreFor: number;
  scoreAgainst: number;
  topPartners: PartnerInfo[];   // 常搭档 top 3
  topRivals: PartnerInfo[];     // 常战胜的对手 top 3
}

export interface PartnerInfo {
  openId: string | null;       // 手动加的成员没有 openId
  name: string;
  totalWith: number;            // 一起的场数 / 对战的场数
  wins: number;                 // 一起赢的场 / 战胜对方的场
}

/**
 * 拉一个用户的全部历史战绩
 */
export async function getUserStats(openId: string): Promise<UserStats | null> {
  const userRow = await pool.query<{ user_name: string; avatar: string | null }>(
    `SELECT user_name,
            (SELECT user_avatar FROM signups
              WHERE lark_open_id = $1 AND user_avatar IS NOT NULL
              ORDER BY created_at DESC LIMIT 1) AS avatar
       FROM user_prefs
      WHERE lark_open_id = $1`,
    [openId],
  );
  if (userRow.rows.length === 0) return null;

  // 出勤(所有历史)
  const attendance = await pool.query<{
    total: string; formal: string; waitlist: string; cancelled: string;
  }>(
    `WITH ranked AS (
       SELECT s.id, s.session_id, s.cancelled_at,
              ROW_NUMBER() OVER (
                PARTITION BY s.session_id
                ORDER BY s.created_at, s.id
              ) AS pos,
              sess.max_slots
         FROM signups s
         JOIN sessions sess ON sess.id = s.session_id
        WHERE s.lark_open_id = $1
     )
     SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE cancelled_at IS NULL AND pos <= max_slots) AS formal,
       COUNT(*) FILTER (WHERE cancelled_at IS NULL AND pos > max_slots) AS waitlist,
       COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL) AS cancelled
     FROM ranked`,
    [openId],
  );

  // 找该 user 在所有 matches 中的位置
  const matches = await pool.query<{
    score_a: number; score_b: number;
    team_side: "a" | "b";
    partner_id: number;
    rival1_id: number;
    rival2_id: number;
  }>(
    `SELECT m.score_a, m.score_b,
            CASE WHEN ca.id IN (m.team_a_p1, m.team_a_p2) THEN 'a' ELSE 'b' END AS team_side,
            CASE
              WHEN m.team_a_p1 = ca.id THEN m.team_a_p2
              WHEN m.team_a_p2 = ca.id THEN m.team_a_p1
              WHEN m.team_b_p1 = ca.id THEN m.team_b_p2
              ELSE m.team_b_p1
            END AS partner_id,
            CASE
              WHEN ca.id IN (m.team_a_p1, m.team_a_p2) THEN m.team_b_p1
              ELSE m.team_a_p1
            END AS rival1_id,
            CASE
              WHEN ca.id IN (m.team_a_p1, m.team_a_p2) THEN m.team_b_p2
              ELSE m.team_a_p2
            END AS rival2_id
       FROM matches m
       JOIN court_assignments ca
         ON ca.id IN (m.team_a_p1, m.team_a_p2, m.team_b_p1, m.team_b_p2)
       JOIN signups s ON s.id = ca.signup_id
      WHERE s.lark_open_id = $1
        AND s.cancelled_at IS NULL
        AND m.score_a IS NOT NULL AND m.score_b IS NOT NULL`,
    [openId],
  );

  let totalWins = 0, totalLosses = 0, totalDraws = 0, scoreFor = 0, scoreAgainst = 0;
  const partnerStats = new Map<number, { wins: number; total: number }>();
  const rivalStats = new Map<number, { wins: number; total: number }>();

  for (const row of matches.rows) {
    const myScore = row.team_side === "a" ? row.score_a : row.score_b;
    const oppScore = row.team_side === "a" ? row.score_b : row.score_a;
    scoreFor += myScore;
    scoreAgainst += oppScore;
    const won = myScore > oppScore;
    const draw = myScore === oppScore;
    if (draw) totalDraws++;
    else if (won) totalWins++;
    else totalLosses++;

    const p = partnerStats.get(row.partner_id) ?? { wins: 0, total: 0 };
    p.total++; if (won) p.wins++;
    partnerStats.set(row.partner_id, p);

    for (const rivalId of [row.rival1_id, row.rival2_id]) {
      const r = rivalStats.get(rivalId) ?? { wins: 0, total: 0 };
      r.total++; if (won) r.wins++;
      rivalStats.set(rivalId, r);
    }
  }

  // 解析对手/搭档名字
  const allIds = Array.from(new Set([
    ...partnerStats.keys(), ...rivalStats.keys(),
  ]));
  const idToInfo = new Map<number, { name: string; openId: string | null }>();
  if (allIds.length > 0) {
    const r = await pool.query<{
      id: number; user_name: string | null; manual_name: string | null; lark_open_id: string | null;
    }>(
      `SELECT ca.id,
              s.user_name, ca.manual_name, s.lark_open_id
         FROM court_assignments ca
         LEFT JOIN signups s ON s.id = ca.signup_id
        WHERE ca.id = ANY($1::int[])`,
      [allIds],
    );
    for (const row of r.rows) {
      idToInfo.set(row.id, {
        name: row.user_name ?? row.manual_name ?? "?",
        openId: row.lark_open_id,
      });
    }
  }

  const topPartners: PartnerInfo[] = Array.from(partnerStats.entries())
    .map(([id, s]) => ({
      openId: idToInfo.get(id)?.openId ?? null,
      name: idToInfo.get(id)?.name ?? "?",
      totalWith: s.total,
      wins: s.wins,
    }))
    .sort((a, b) => b.totalWith - a.totalWith)
    .slice(0, 3);

  const topRivals: PartnerInfo[] = Array.from(rivalStats.entries())
    .map(([id, s]) => ({
      openId: idToInfo.get(id)?.openId ?? null,
      name: idToInfo.get(id)?.name ?? "?",
      totalWith: s.total,
      wins: s.wins,
    }))
    .sort((a, b) => b.wins - a.wins || b.totalWith - a.totalWith)
    .slice(0, 3);

  const rank = await computeRank(openId);
  const att = attendance.rows[0];

  return {
    openId,
    userName: userRow.rows[0].user_name,
    avatar: userRow.rows[0].avatar,
    rank,
    attendance: {
      sessionsRegistered: Number(att.total),
      sessionsFormal: Number(att.formal),
      sessionsWaitlist: Number(att.waitlist),
      cancelled: Number(att.cancelled),
    },
    totalMatches: matches.rowCount ?? 0,
    totalWins, totalLosses, totalDraws,
    scoreFor, scoreAgainst,
    topPartners, topRivals,
  };
}

// ============ 排行榜(本场次) ============

export interface LeaderboardEntry {
  rank: number;
  openId: string | null;
  name: string;
  avatar: string | null;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDiff: number;
}

/**
 * 某场次的排行榜
 * 仅含实际打过比赛(且比分已填)的人,按 胜场 ↓ → 净胜分 ↓ → 总得分 ↓ 排序
 */
export async function getSessionLeaderboard(sessionId: number): Promise<LeaderboardEntry[]> {
  const r = await pool.query<{
    assignment_id: number;
    user_name: string;
    manual_name: string | null;
    avatar: string | null;
    lark_open_id: string | null;
    score_a: number;
    score_b: number;
    team_side: "a" | "b";
  }>(
    `SELECT ca.id AS assignment_id,
            COALESCE(s.user_name, ca.manual_name, '?') AS user_name,
            ca.manual_name,
            s.user_avatar AS avatar,
            s.lark_open_id,
            m.score_a, m.score_b,
            CASE WHEN ca.id IN (m.team_a_p1, m.team_a_p2) THEN 'a' ELSE 'b' END AS team_side
       FROM matches m
       JOIN courts c ON c.id = m.court_id
       JOIN court_assignments ca
         ON ca.id IN (m.team_a_p1, m.team_a_p2, m.team_b_p1, m.team_b_p2)
       LEFT JOIN signups s ON s.id = ca.signup_id
      WHERE c.session_id = $1
        AND m.score_a IS NOT NULL AND m.score_b IS NOT NULL`,
    [sessionId],
  );

  type Agg = LeaderboardEntry & { _id: number };
  const byId = new Map<number, Agg>();
  for (const row of r.rows) {
    let a = byId.get(row.assignment_id);
    if (!a) {
      a = {
        _id: row.assignment_id,
        rank: 0,
        openId: row.lark_open_id,
        name: row.user_name,
        avatar: row.avatar,
        matches: 0, wins: 0, losses: 0, draws: 0,
        scoreFor: 0, scoreAgainst: 0, scoreDiff: 0,
      };
      byId.set(row.assignment_id, a);
    }
    const myScore = row.team_side === "a" ? row.score_a : row.score_b;
    const oppScore = row.team_side === "a" ? row.score_b : row.score_a;
    a.matches++;
    a.scoreFor += myScore;
    a.scoreAgainst += oppScore;
    a.scoreDiff += (myScore - oppScore);
    if (myScore === oppScore) a.draws++;
    else if (myScore > oppScore) a.wins++;
    else a.losses++;
  }

  const list = Array.from(byId.values())
    .sort((a, b) =>
      b.wins - a.wins
      || b.scoreDiff - a.scoreDiff
      || b.scoreFor - a.scoreFor,
    )
    .map((a, i) => {
      const { _id, ...rest } = a;
      return { ...rest, rank: i + 1 };
    });

  return list;
}

/**
 * 某场地(court)的排行榜
 * 仅含该 court 实际打过比赛(且比分已填)的人
 */
export async function getCourtLeaderboard(courtId: number): Promise<LeaderboardEntry[]> {
  const r = await pool.query<{
    assignment_id: number;
    user_name: string;
    manual_name: string | null;
    avatar: string | null;
    lark_open_id: string | null;
    score_a: number;
    score_b: number;
    team_side: "a" | "b";
  }>(
    `SELECT ca.id AS assignment_id,
            COALESCE(s.user_name, ca.manual_name, '?') AS user_name,
            ca.manual_name,
            s.user_avatar AS avatar,
            s.lark_open_id,
            m.score_a, m.score_b,
            CASE WHEN ca.id IN (m.team_a_p1, m.team_a_p2) THEN 'a' ELSE 'b' END AS team_side
       FROM matches m
       JOIN court_assignments ca
         ON ca.id IN (m.team_a_p1, m.team_a_p2, m.team_b_p1, m.team_b_p2)
       LEFT JOIN signups s ON s.id = ca.signup_id
      WHERE m.court_id = $1
        AND m.score_a IS NOT NULL AND m.score_b IS NOT NULL`,
    [courtId],
  );

  type Agg = LeaderboardEntry & { _id: number };
  const byId = new Map<number, Agg>();
  for (const row of r.rows) {
    let a = byId.get(row.assignment_id);
    if (!a) {
      a = {
        _id: row.assignment_id,
        rank: 0,
        openId: row.lark_open_id,
        name: row.user_name,
        avatar: row.avatar,
        matches: 0, wins: 0, losses: 0, draws: 0,
        scoreFor: 0, scoreAgainst: 0, scoreDiff: 0,
      };
      byId.set(row.assignment_id, a);
    }
    const myScore = row.team_side === "a" ? row.score_a : row.score_b;
    const oppScore = row.team_side === "a" ? row.score_b : row.score_a;
    a.matches++;
    a.scoreFor += myScore;
    a.scoreAgainst += oppScore;
    a.scoreDiff += (myScore - oppScore);
    if (myScore === oppScore) a.draws++;
    else if (myScore > oppScore) a.wins++;
    else a.losses++;
  }

  return Array.from(byId.values())
    .sort((a, b) =>
      b.wins - a.wins
      || b.scoreDiff - a.scoreDiff
      || b.scoreFor - a.scoreFor,
    )
    .map((a, i) => {
      const { _id, ...rest } = a;
      return { ...rest, rank: i + 1 };
    });
}

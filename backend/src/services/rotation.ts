import { pool, withTx } from "../db.js";
import { listCourts } from "./court.js";
import { listAssignments, type AssignmentView } from "./assignment.js";

/**
 * 每场比赛固定时长(分钟),用于由活动时间窗反推轮数
 */
const MATCH_LENGTH_MINUTES = 15;

export interface MatchRow {
  id: number;
  court_id: number;
  round_num: number;
  team_a_p1: number; team_a_p2: number;
  team_b_p1: number; team_b_p2: number;
  score_a: number | null;
  score_b: number | null;
}

export interface MatchView {
  id: number;
  courtId: number;
  roundNum: number;
  teamA: { id: number; name: string; gender: "男" | "女" | null }[];
  teamB: { id: number; name: string; gender: "男" | "女" | null }[];
  scoreA: number | null;
  scoreB: number | null;
}

/**
 * 为某 session 生成全部 court 的轮转表
 * 触发时机:活动开始时由 scheduler 调用; 幂等(已存在则跳过)
 */
export async function generateRotationForSession(sessionId: number): Promise<void> {
  // 拿 session 起止时间算 rounds 数
  const s = await pool.query<{
    event_start_at: Date;
    event_end_at: Date;
  }>(
    `SELECT event_start_at, event_end_at FROM sessions WHERE id = $1`,
    [sessionId],
  );
  if (s.rows.length === 0) return;
  const ms = s.rows[0].event_end_at.getTime() - s.rows[0].event_start_at.getTime();
  const rounds = Math.max(1, Math.floor(ms / 1000 / 60 / MATCH_LENGTH_MINUTES));

  const courts = await listCourts(sessionId);
  const assignments = await listAssignments(sessionId);

  for (const court of courts) {
    const players = assignments.filter((a) => a.courtId === court.id);
    // 检查该 court 是否已经有 matches
    const existing = await pool.query(
      `SELECT COUNT(*) AS c FROM matches WHERE court_id = $1`,
      [court.id],
    );
    if (Number(existing.rows[0].c) > 0) continue;

    if (players.length < 4) continue; // 不足 4 人不排
    const rotation = computeRotation(players, rounds);
    await persistRotation(court.id, rotation);
  }
}

/**
 * 计算一组玩家在 R 轮内的轮转
 * 返回每轮的两队
 */
function computeRotation(
  players: AssignmentView[],
  rounds: number,
): { teamA: [AssignmentView, AssignmentView]; teamB: [AssignmentView, AssignmentView] }[] {
  const n = players.length;
  const playCount = new Map<number, number>(players.map((p) => [p.id, 0]));
  const partnerCount = new Map<string, number>();   // "id1-id2" → 次数
  const opponentCount = new Map<string, number>();

  const result: { teamA: [AssignmentView, AssignmentView]; teamB: [AssignmentView, AssignmentView] }[] = [];

  for (let r = 0; r < rounds; r++) {
    // 第 1 步:选 4 个本轮上场的
    const sorted = [...players].sort((a, b) => {
      const ca = playCount.get(a.id)!;
      const cb = playCount.get(b.id)!;
      if (ca !== cb) return ca - cb;
      return Math.random() - 0.5;
    });
    const playing = sorted.slice(0, 4);

    // 第 2 步:在 3 种分队方式里选最佳
    const [A, B, C, D] = playing;
    const splits: [AssignmentView, AssignmentView, AssignmentView, AssignmentView][] = [
      [A, B, C, D],
      [A, C, B, D],
      [A, D, B, C],
    ];
    let bestScore = -Infinity;
    let bestSplit = splits[0];
    for (const s of splits) {
      const sc = scoreSplit(s, partnerCount, opponentCount);
      if (sc > bestScore) { bestScore = sc; bestSplit = s; }
    }

    const [a1, a2, b1, b2] = bestSplit;
    result.push({ teamA: [a1, a2], teamB: [b1, b2] });

    // 更新计数
    for (const p of playing) playCount.set(p.id, (playCount.get(p.id) ?? 0) + 1);
    bumpPair(partnerCount, a1.id, a2.id);
    bumpPair(partnerCount, b1.id, b2.id);
    for (const a of [a1, a2]) for (const b of [b1, b2]) bumpPair(opponentCount, a.id, b.id);

    if (n === 4) {
      // 4 人时只能轮换搭档,playCount 都会 +1,继续
    }
  }

  return result;
}

/**
 * 给一个分队打分:
 *   分数 = - 10*重复搭档 - 5*重复对手 - 3*性别失衡
 *   分数越高越好
 */
function scoreSplit(
  s: [AssignmentView, AssignmentView, AssignmentView, AssignmentView],
  partnerCount: Map<string, number>,
  opponentCount: Map<string, number>,
): number {
  const [a1, a2, b1, b2] = s;
  let score = 0;

  // 重复搭档惩罚
  score -= 10 * (partnerCount.get(pairKey(a1.id, a2.id)) ?? 0);
  score -= 10 * (partnerCount.get(pairKey(b1.id, b2.id)) ?? 0);

  // 重复对手惩罚
  for (const a of [a1, a2]) for (const b of [b1, b2]) {
    score -= 5 * (opponentCount.get(pairKey(a.id, b.id)) ?? 0);
  }

  // 性别失衡惩罚:统计跨性别对手对数(team_A vs team_B 中性别不同的两两组合)
  let crossGender = 0;
  for (const a of [a1, a2]) for (const b of [b1, b2]) {
    if (a.gender && b.gender && a.gender !== b.gender) crossGender++;
  }
  score -= 3 * crossGender;

  // 极小随机扰动避免完全相同的分数总是选第一个
  score += Math.random() * 0.001;
  return score;
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function bumpPair(m: Map<string, number>, a: number, b: number) {
  const k = pairKey(a, b);
  m.set(k, (m.get(k) ?? 0) + 1);
}

async function persistRotation(
  courtId: number,
  rotation: { teamA: [AssignmentView, AssignmentView]; teamB: [AssignmentView, AssignmentView] }[],
): Promise<void> {
  await withTx(async (client) => {
    for (let i = 0; i < rotation.length; i++) {
      const m = rotation[i];
      await client.query(
        `INSERT INTO matches
           (court_id, round_num, team_a_p1, team_a_p2, team_b_p1, team_b_p2)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [courtId, i + 1, m.teamA[0].id, m.teamA[1].id, m.teamB[0].id, m.teamB[1].id],
      );
    }
  });
}

/**
 * 列出某 session 所有 matches,带玩家信息
 */
export async function listMatches(sessionId: number): Promise<MatchView[]> {
  const rows = await pool.query<{
    id: number; court_id: number; round_num: number;
    team_a_p1_id: number; team_a_p1_name: string; team_a_p1_gender: "男" | "女" | null;
    team_a_p2_id: number; team_a_p2_name: string; team_a_p2_gender: "男" | "女" | null;
    team_b_p1_id: number; team_b_p1_name: string; team_b_p1_gender: "男" | "女" | null;
    team_b_p2_id: number; team_b_p2_name: string; team_b_p2_gender: "男" | "女" | null;
    score_a: number | null; score_b: number | null;
  }>(
    `SELECT m.id, m.court_id, m.round_num,
            m.score_a, m.score_b,
            a1.id AS team_a_p1_id,
            COALESCE(s1.user_name, a1.manual_name, '?') AS team_a_p1_name,
            COALESCE(a1.manual_gender, up1.gender) AS team_a_p1_gender,
            a2.id AS team_a_p2_id,
            COALESCE(s2.user_name, a2.manual_name, '?') AS team_a_p2_name,
            COALESCE(a2.manual_gender, up2.gender) AS team_a_p2_gender,
            b1.id AS team_b_p1_id,
            COALESCE(s3.user_name, b1.manual_name, '?') AS team_b_p1_name,
            COALESCE(b1.manual_gender, up3.gender) AS team_b_p1_gender,
            b2.id AS team_b_p2_id,
            COALESCE(s4.user_name, b2.manual_name, '?') AS team_b_p2_name,
            COALESCE(b2.manual_gender, up4.gender) AS team_b_p2_gender
       FROM matches m
       JOIN courts co ON co.id = m.court_id
       JOIN court_assignments a1 ON a1.id = m.team_a_p1
       LEFT JOIN signups s1 ON s1.id = a1.signup_id
       LEFT JOIN user_prefs up1 ON up1.lark_open_id = s1.lark_open_id
       JOIN court_assignments a2 ON a2.id = m.team_a_p2
       LEFT JOIN signups s2 ON s2.id = a2.signup_id
       LEFT JOIN user_prefs up2 ON up2.lark_open_id = s2.lark_open_id
       JOIN court_assignments b1 ON b1.id = m.team_b_p1
       LEFT JOIN signups s3 ON s3.id = b1.signup_id
       LEFT JOIN user_prefs up3 ON up3.lark_open_id = s3.lark_open_id
       JOIN court_assignments b2 ON b2.id = m.team_b_p2
       LEFT JOIN signups s4 ON s4.id = b2.signup_id
       LEFT JOIN user_prefs up4 ON up4.lark_open_id = s4.lark_open_id
      WHERE co.session_id = $1
      ORDER BY co.sort_order, m.round_num`,
    [sessionId],
  );

  return rows.rows.map((r) => ({
    id: r.id,
    courtId: r.court_id,
    roundNum: r.round_num,
    teamA: [
      { id: r.team_a_p1_id, name: r.team_a_p1_name, gender: r.team_a_p1_gender },
      { id: r.team_a_p2_id, name: r.team_a_p2_name, gender: r.team_a_p2_gender },
    ],
    teamB: [
      { id: r.team_b_p1_id, name: r.team_b_p1_name, gender: r.team_b_p1_gender },
      { id: r.team_b_p2_id, name: r.team_b_p2_name, gender: r.team_b_p2_gender },
    ],
    scoreA: r.score_a,
    scoreB: r.score_b,
  }));
}

/**
 * 更新某场比赛比分(所有报名人都能填,因此不做权限校验,只校验比分合法性)
 */
export async function updateMatchScore(
  matchId: number,
  scoreA: number | null,
  scoreB: number | null,
): Promise<void> {
  if (scoreA !== null && (scoreA < 0 || scoreA > 99)) throw new Error("比分非法");
  if (scoreB !== null && (scoreB < 0 || scoreB > 99)) throw new Error("比分非法");
  await pool.query(
    `UPDATE matches SET score_a = $1, score_b = $2, updated_at = NOW() WHERE id = $3`,
    [scoreA, scoreB, matchId],
  );
}

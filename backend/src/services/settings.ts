import { pool } from "../db.js";

export interface CourtTemplate {
  name: string;
  court_type: "竞技" | "休闲";
  max_players: number;
}

export interface ScheduleConfig {
  signup_open_dow: number;
  signup_open_hour: number;
  signup_open_minute: number;
  event_dow: number;
  event_start_hour: number;
  event_end_hour: number;
  signup_close_hours_before_event: number;
}

/**
 * 读取一个配置项
 */
export async function getConfig<T>(key: string): Promise<T | null> {
  const r = await pool.query<{ value: T }>(
    `SELECT value FROM app_config WHERE key = $1`,
    [key],
  );
  return r.rows[0]?.value ?? null;
}

/**
 * 写入一个配置项(覆盖)
 */
export async function setConfig<T>(key: string, value: T): Promise<void> {
  await pool.query(
    `INSERT INTO app_config (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}

export async function getCourtTemplate(): Promise<CourtTemplate[]> {
  const t = await getConfig<CourtTemplate[]>("courts_template");
  if (!t || t.length === 0) {
    // 兜底默认值
    return [
      { name: "竞技场", court_type: "竞技", max_players: 8 },
      { name: "休闲场", court_type: "休闲", max_players: 8 },
    ];
  }
  return t;
}

export async function getSchedule(): Promise<ScheduleConfig> {
  const s = await getConfig<ScheduleConfig>("schedule");
  if (!s) {
    return {
      signup_open_dow: 1,
      signup_open_hour: 10,
      signup_open_minute: 30,
      event_dow: 2,
      event_start_hour: 20,
      event_end_hour: 22,
      signup_close_hours_before_event: 2,
    };
  }
  return s;
}

export async function getAdminOpenIds(): Promise<string[]> {
  const v = await getConfig<string[]>("admin_open_ids");
  return v ?? [];
}

export async function isAdmin(openId?: string | null): Promise<boolean> {
  if (!openId) return false;
  const list = await getAdminOpenIds();
  return list.includes(openId);
}

export type ScoreCap = 7 | 11 | 15 | 21;

/**
 * 单场分数上限(任一队达到则该轮结束),默认 15
 */
export async function getScoreCap(): Promise<ScoreCap> {
  const v = await getConfig<ScoreCap>("score_cap");
  if (!v || ![7, 11, 15, 21].includes(v as number)) return 15;
  return v;
}

export interface VenueInfo {
  name: string;
  address: string;
}

/**
 * 球场信息(显示在场次预告里)
 */
export async function getVenue(): Promise<VenueInfo> {
  const v = await getConfig<VenueInfo>("venue");
  return v ?? { name: "待配置", address: "请管理员在 admin 面板补充地址" };
}

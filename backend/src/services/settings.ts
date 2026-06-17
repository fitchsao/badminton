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

// ============ #1 报名白名单 ============

export interface WhitelistMember {
  openId: string;
  name: string;
  gender?: "男" | "女";
  preferredCourtType?: "竞技" | "休闲";
}

/** 默认白名单(代码兜底,无需迁移即可在现有库生效):默认含 Fitch */
const DEFAULT_WHITELIST: WhitelistMember[] = [
  { openId: "ou_44c0c24528dbd6f03ce5b41fdcab92ef", name: "Fitch Yu" },
];

export async function getWhitelist(): Promise<WhitelistMember[]> {
  const v = await getConfig<WhitelistMember[]>("whitelist");
  return v ?? DEFAULT_WHITELIST;
}

// ============ #4 三场地特殊日(对抗/竞技/休闲)============

const DEFAULT_SPECIAL_COURTS: CourtTemplate[] = [
  { name: "对抗场", court_type: "竞技", max_players: 8 },
  { name: "竞技场", court_type: "竞技", max_players: 8 },
  { name: "休闲场", court_type: "休闲", max_players: 8 },
];

export async function getSpecialCourtTemplate(): Promise<CourtTemplate[]> {
  const v = await getConfig<CourtTemplate[]>("special_courts_template");
  if (!v || v.length === 0) return DEFAULT_SPECIAL_COURTS;
  return v;
}

/**
 * #4 规则:每月「第一个工作日所在那一周(周一~周日)」的周二 → 特殊 3 场地日。
 * 若该周二落到上个月(月初为周三/四/五时),夹回本月的下一个周二。
 * 注:活动日本身固定为周二,该函数判断"某个周二是否是当月的三场地日"。
 */
export function isThreeCourtDay(eventStartAt: Date, tz: string): boolean {
  const [y, m, d] = ymdInTz(eventStartAt, tz);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Sun..6=Sat
  const firstWeekday = firstDow === 6 ? 3 : firstDow === 0 ? 2 : 1; // 月首个工作日(日)
  const fwDow = new Date(Date.UTC(y, m - 1, firstWeekday)).getUTCDay();
  const iso = fwDow === 0 ? 7 : fwDow; // Mon=1..Sun=7
  let tuesday = firstWeekday + (2 - iso);
  if (tuesday < 1) tuesday += 7;
  return d === tuesday;
}

/** 按活动日期选模板:三场地日用特殊模板,否则用常规模板 */
export async function getCourtTemplateForDate(
  eventStartAt: Date, tz: string,
): Promise<CourtTemplate[]> {
  return isThreeCourtDay(eventStartAt, tz)
    ? getSpecialCourtTemplate()
    : getCourtTemplate();
}

function ymdInTz(date: Date, tz: string): [number, number, number] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return [g("year"), g("month"), g("day")];
}

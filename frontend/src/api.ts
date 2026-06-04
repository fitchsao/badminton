// API 客户端 v2

export type SessionState =
  | "not_open" | "open" | "closed_pre_event" | "in_progress" | "finished";

export interface Rank {
  mmr: number;
  tier: string;
  division: string;
  emoji: string;
  label: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  avgScoreDiff: number;
  progressToNext: number;
  nextLabel: string | null;
}

export interface UserStats {
  openId: string;
  userName: string;
  avatar: string | null;
  rank: Rank;
  attendance: {
    sessionsRegistered: number;
    sessionsFormal: number;
    sessionsWaitlist: number;
    cancelled: number;
  };
  totalMatches: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  scoreFor: number;
  scoreAgainst: number;
  topPartners: PartnerInfo[];
  topRivals: PartnerInfo[];
}

export interface PartnerInfo {
  openId: string | null;
  name: string;
  totalWith: number;
  wins: number;
}

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

export interface SessionInfo {
  id: number;
  eventStartAt: string;
  eventEndAt: string;
  signupOpenAt: string;
  signupCloseAt: string;
  maxSlots: number;
  state: SessionState;
}

export interface Court {
  id: number;
  name: string;
  court_type: "竞技" | "休闲";
  max_players: number;
  sort_order: number;
}

export interface SignupView {
  position: number;
  isWaitlist: boolean;
  userName: string;
  userAvatar: string | null;
  larkOpenId: string;
  preferredCourtType: "竞技" | "休闲" | null;
  signedUpAt: string;
}

export interface AssignmentView {
  id: number;
  courtId: number;
  courtName: string;
  courtType: "竞技" | "休闲";
  userName: string;
  larkOpenId: string | null;
  gender: "男" | "女" | null;
  isManual: boolean;
  sortOrder: number;
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

export interface Me {
  openId: string;
  name: string;
  avatar: string | null;
  email: string | null;
  isAdmin: boolean;
}

export interface UserPref {
  larkOpenId: string;
  userName: string;
  gender: "男" | "女" | null;
  lastCourtType: "竞技" | "休闲" | null;
}

export interface VenueInfo {
  name: string;
  address: string;
}

export interface CurrentSessionResponse {
  session: SessionInfo;
  courts: Court[];
  signups: SignupView[];
  mySignup: SignupView | null;
  myPref: UserPref | null;
  me: Me | null;
  assignments: AssignmentView[] | null;
  matches: MatchView[] | null;
  scoreCap: number;
  venue: VenueInfo;
}

export interface AdminConfig {
  courtsTemplate: { name: string; court_type: "竞技" | "休闲"; max_players: number }[] | null;
  schedule: {
    signup_open_dow: number;
    signup_open_hour: number;
    signup_open_minute: number;
    event_dow: number;
    event_start_hour: number;
    event_end_hour: number;
    signup_close_hours_before_event: number;
  } | null;
  adminOpenIds: string[] | null;
  scoreCap: number;
  venue: { name: string; address: string };
}

async function req<T = any>(input: string, init?: RequestInit): Promise<T> {
  const userHeaders = (init?.headers as Record<string, string> | undefined) ?? {};
  const headers: Record<string, string> = { ...userHeaders };
  // 仅在有 body 时设置 content-type,否则 Fastify 会因「空 body 但声明 JSON」拒绝
  if (init?.body != null && !headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/json";
  }
  const resp = await fetch(input, {
    credentials: "include",
    ...init,
    headers,  // 必须放 ...init 之后,避免被覆盖
  });
  if (!resp.ok) {
    let body: any = {};
    try { body = await resp.json(); } catch {}
    const err: any = new Error(body.error || `请求失败: ${resp.status}`);
    err.status = resp.status;
    err.code = body.code;
    throw err;
  }
  return resp.json();
}

export const api = {
  getCurrentSession: () => req<CurrentSessionResponse>("/api/sessions/current"),
  signUp: (
    sessionId: number,
    body: { preferredCourtType: "竞技" | "休闲"; gender?: "男" | "女" },
  ) =>
    req(`/api/sessions/${sessionId}/signup`, {
      method: "POST", body: JSON.stringify(body),
    }),
  cancel: (sessionId: number) =>
    req(`/api/sessions/${sessionId}/cancel`, { method: "POST" }),
  updateScore: (matchId: number, scoreA: number | null, scoreB: number | null) =>
    req(`/api/matches/${matchId}/score`, {
      method: "POST", body: JSON.stringify({ scoreA, scoreB }),
    }),

  admin: {
    getConfig: () => req<AdminConfig>("/api/admin/config"),
    setCourtsTemplate: (v: AdminConfig["courtsTemplate"]) =>
      req("/api/admin/config/courts_template", {
        method: "PUT", body: JSON.stringify(v),
      }),
    setSchedule: (v: AdminConfig["schedule"]) =>
      req("/api/admin/config/schedule", {
        method: "PUT", body: JSON.stringify(v),
      }),
    setAdminOpenIds: (v: string[]) =>
      req("/api/admin/config/admin_open_ids", {
        method: "PUT", body: JSON.stringify(v),
      }),
    setScoreCap: (scoreCap: number) =>
      req("/api/admin/config/score_cap", {
        method: "PUT", body: JSON.stringify({ scoreCap }),
      }),
    setVenue: (name: string, address: string) =>
      req("/api/admin/config/venue", {
        method: "PUT", body: JSON.stringify({ name, address }),
      }),
    getHistoryUsers: () => req<{ users: UserPref[] }>("/api/admin/users/history"),
    moveAssignment: (id: number, newCourtId: number) =>
      req(`/api/admin/assignments/${id}/move`, {
        method: "PATCH", body: JSON.stringify({ newCourtId }),
      }),
    deleteAssignment: (id: number) =>
      req(`/api/admin/assignments/${id}`, { method: "DELETE" }),
    addToCourtFromHistory: (courtId: number, larkOpenId: string) =>
      req(`/api/admin/courts/${courtId}/add`, {
        method: "POST", body: JSON.stringify({ larkOpenId }),
      }),
    addToCourtManual: (
      courtId: number, manualName: string, manualGender?: "男" | "女",
    ) =>
      req(`/api/admin/courts/${courtId}/add`, {
        method: "POST",
        body: JSON.stringify({ manualName, manualGender }),
      }),
    reassign: (sessionId: number) =>
      req(`/api/admin/sessions/${sessionId}/reassign`, { method: "POST" }),
    regenerateRotation: (sessionId: number) =>
      req(`/api/admin/sessions/${sessionId}/regenerate-rotation`, { method: "POST" }),
    recreateCourts: (sessionId: number) =>
      req(`/api/admin/sessions/${sessionId}/recreate-courts`, { method: "POST" }),
    triggerSignup: () =>
      req("/api/admin/ops/trigger-signup", { method: "POST" }),
    opsStatus: () => req<{
      recentSessions: { id: number; signup_open_at: string; event_start_at: string;
        lark_message_id: string | null; created_at: string }[];
      audit: { id: number; actor_open_id: string; actor_name: string;
        action: string; target: string | null; created_at: string }[];
      serverNow: string;
    }>("/api/admin/ops/status"),
  },

  // ============ V3 用户战绩 / 段位 / 订阅 / 排行榜 ============
  getUserStats: (openId: string) =>
    req<UserStats>(`/api/users/${openId}/stats`),
  bulkRanks: (openIds: string[]) =>
    req<{ ranks: Record<string, Rank> }>("/api/users/ranks", {
      method: "POST",
      body: JSON.stringify({ openIds }),
    }),
  getLeaderboard: (sessionId: number) =>
    req<{ entries: LeaderboardEntry[] }>(`/api/sessions/${sessionId}/leaderboard`),
  getCourtLeaderboard: (courtId: number) =>
    req<{ entries: LeaderboardEntry[] }>(`/api/courts/${courtId}/leaderboard`),
  subscription: {
    status: () => req<{ subscribed: boolean; targetWeekStart: string }>("/api/subscription/status"),
    subscribe: () => req("/api/subscription", { method: "POST" }),
    unsubscribe: () => req("/api/subscription", { method: "DELETE" }),
  },
};

-- ============================================================
-- 羽毛球应用 v2 schema
-- 新增: 分组(courts) / 用户偏好(user_prefs) / 场地分配(court_assignments)
--      比赛轮转与计分(matches) / 配置(app_config)
-- 修改: signups 加 preferred_court_id (报名时选的场地)
-- ============================================================

-- ----- signups 增字段 -----
ALTER TABLE signups
    ADD COLUMN IF NOT EXISTS preferred_court_type TEXT;  -- '竞技' or '休闲', 报名时记录

-- ----- 场地表 -----
-- 每个 session 在创建时按 app_config 配置生成 N 个 court
CREATE TABLE IF NOT EXISTS courts (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    court_type      TEXT NOT NULL CHECK (court_type IN ('竞技','休闲')),
    max_players     INTEGER NOT NULL DEFAULT 8,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS courts_session ON courts (session_id, sort_order);

-- ----- 用户偏好(跨 session) -----
-- 记 open_id 上次选的场地类型 + 性别(自填一次终身用)
CREATE TABLE IF NOT EXISTS user_prefs (
    lark_open_id        TEXT PRIMARY KEY,
    user_name           TEXT NOT NULL,
    gender              TEXT CHECK (gender IN ('男','女')),
    last_court_type     TEXT CHECK (last_court_type IN ('竞技','休闲')),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----- 场地分配结果 -----
-- 报名截止后系统生成 + admin 可调整
-- 支持两类成员: 真实报名 (signup_id 非空) 和 admin 手动添加 (manual_name 非空)
CREATE TABLE IF NOT EXISTS court_assignments (
    id              BIGSERIAL PRIMARY KEY,
    court_id        BIGINT NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    -- 二选一:
    signup_id       BIGINT REFERENCES signups(id) ON DELETE CASCADE,
    manual_name     TEXT,     -- admin 手动输入的简单名字,不绑定 lark 账号
    manual_gender   TEXT CHECK (manual_gender IN ('男','女')),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((signup_id IS NOT NULL) OR (manual_name IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS assignments_court ON court_assignments (court_id, sort_order);
-- 一个 signup 不能同时在多个 court 里
CREATE UNIQUE INDEX IF NOT EXISTS assignments_signup_unique
    ON court_assignments (signup_id) WHERE signup_id IS NOT NULL;

-- ----- 比赛轮次 -----
-- 一个 court 有若干 round, 每 round 一场 match(双打 4 人)
-- player 字段存的是 court_assignments.id
CREATE TABLE IF NOT EXISTS matches (
    id              BIGSERIAL PRIMARY KEY,
    court_id        BIGINT NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    round_num       INTEGER NOT NULL,           -- 第几轮(从 1)
    team_a_p1       BIGINT NOT NULL REFERENCES court_assignments(id) ON DELETE CASCADE,
    team_a_p2       BIGINT NOT NULL REFERENCES court_assignments(id) ON DELETE CASCADE,
    team_b_p1       BIGINT NOT NULL REFERENCES court_assignments(id) ON DELETE CASCADE,
    team_b_p2       BIGINT NOT NULL REFERENCES court_assignments(id) ON DELETE CASCADE,
    score_a         INTEGER,
    score_b         INTEGER,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS matches_court_round ON matches (court_id, round_num);

-- ----- 全局配置(admin 可改) -----
-- 用 jsonb 存灵活的配置项
CREATE TABLE IF NOT EXISTS app_config (
    key             TEXT PRIMARY KEY,
    value           JSONB NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初始化默认配置
INSERT INTO app_config (key, value) VALUES
  ('courts_template', '[
     {"name":"竞技场","court_type":"竞技","max_players":8},
     {"name":"休闲场","court_type":"休闲","max_players":8}
   ]'),
  ('schedule', '{
     "signup_open_dow": 1,
     "signup_open_hour": 10,
     "signup_open_minute": 30,
     "event_dow": 2,
     "event_start_hour": 20,
     "event_end_hour": 22,
     "signup_close_hours_before_event": 2
   }'),
  ('admin_open_ids', '["ou_44c0c24528dbd6f03ce5b41fdcab92ef"]')
ON CONFLICT (key) DO NOTHING;

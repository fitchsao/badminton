-- ============================================================
-- 羽毛球报名应用 - 数据库 schema
-- 设计要点:
--   1. 每周一个 session, 互不干扰
--   2. signup 不存 position, 用 created_at 排序计算
--   3. 取消用 cancelled_at 软删,保留历史
--   4. 同一用户在同一 session 只能有一条 active 记录(cancelled_at IS NULL)
--      用 partial unique index 强制约束,顺带解决并发重复报名
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
    id              BIGSERIAL PRIMARY KEY,
    -- 活动开始时间(周二 20:00)
    event_start_at  TIMESTAMPTZ NOT NULL,
    -- 活动结束时间(周二 22:00)
    event_end_at    TIMESTAMPTZ NOT NULL,
    -- 报名开始时间(周一 10:30)
    signup_open_at  TIMESTAMPTZ NOT NULL,
    -- 报名截止时间(周二 18:00, 活动前 2 小时)
    signup_close_at TIMESTAMPTZ NOT NULL,
    -- 正式名额数
    max_slots       INTEGER NOT NULL DEFAULT 16,
    -- 机器人发送的卡片消息 ID (用于以后更新卡片状态,MVP 暂不用)
    lark_message_id TEXT,
    -- 卡片发送到哪个群
    lark_chat_id    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 每个 event_start_at 只能对应一个 session,避免重复创建
CREATE UNIQUE INDEX IF NOT EXISTS sessions_event_start_unique
    ON sessions (event_start_at);

CREATE TABLE IF NOT EXISTS signups (
    id             BIGSERIAL PRIMARY KEY,
    session_id     BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    -- Lark open_id, 同一用户在同一租户内每个 app 不同
    lark_open_id   TEXT NOT NULL,
    -- 用户名(显示用,可能变,以拿到时的为准)
    user_name      TEXT NOT NULL,
    user_avatar    TEXT,
    -- 报名时间, 决定排队顺序
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 取消时间, NULL 表示当前有效
    cancelled_at   TIMESTAMPTZ
);

-- 同一用户在同一场次只能有一条 active 报名
-- 这个 partial unique index 是并发安全的核心:
-- 同时插入两条会有一条因唯一约束失败,捕获到改报"已报名"
CREATE UNIQUE INDEX IF NOT EXISTS signups_one_active_per_user
    ON signups (session_id, lark_open_id)
    WHERE cancelled_at IS NULL;

-- 查询当前有效报名按时间排序的索引
CREATE INDEX IF NOT EXISTS signups_session_active
    ON signups (session_id, created_at)
    WHERE cancelled_at IS NULL;

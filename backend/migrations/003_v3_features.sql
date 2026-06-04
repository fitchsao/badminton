-- ============================================================
-- 羽毛球应用 v3 schema
-- 新增: subscriptions (下周预约) / admin_audit (操作日志)
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id                  BIGSERIAL PRIMARY KEY,
    lark_open_id        TEXT NOT NULL,
    user_name           TEXT NOT NULL,
    target_week_start   DATE NOT NULL,    -- 目标周的报名开放日(本地日期)
    notified_at         TIMESTAMPTZ,      -- 已通知时间;null 表示待通知
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_unique
    ON subscriptions (lark_open_id, target_week_start);
CREATE INDEX IF NOT EXISTS subscriptions_pending
    ON subscriptions (target_week_start) WHERE notified_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_audit (
    id              BIGSERIAL PRIMARY KEY,
    actor_open_id   TEXT NOT NULL,
    actor_name      TEXT NOT NULL,
    action          TEXT NOT NULL,        -- e.g. "reassign" "update_config" "add_member"
    target          TEXT,                 -- e.g. "session:5" "court:12"
    details         JSONB,                -- 任意上下文
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_recent ON admin_audit (created_at DESC);

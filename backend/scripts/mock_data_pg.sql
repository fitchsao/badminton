-- ============================================================
-- Mock 测试数据(可重复运行,每次会先清理旧 mock)
--   1. 一个"当前正开放报名"的 session
--   2. 15 个假用户报名(11 进正式 + 4 候补,留 5 个正式位给真人)
--   3. 一个 30 天前的历史 session + matches,让 5 人有非「待定」段位
--
-- 用法:
--   sudo docker compose exec -T db psql -U badminton badminton < /opt/badminton/scripts/mock_data.sql
-- ============================================================

BEGIN;

-- ---------- 0. 清理旧 mock 数据 (彻底) ----------
-- 找出所有"含 mock_user_*/test_user_* 报名"的 session,连带清理
-- 这样无论 session 状态被改成什么(in_progress/finished 等),都能清干净
DO $$
DECLARE
  v_session_ids INT[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT session_id) INTO v_session_ids
    FROM signups
   WHERE lark_open_id LIKE 'mock_user_%' OR lark_open_id LIKE 'test_user_%';

  IF v_session_ids IS NOT NULL THEN
    DELETE FROM matches WHERE court_id IN (
      SELECT id FROM courts WHERE session_id = ANY(v_session_ids)
    );
    DELETE FROM court_assignments WHERE signup_id IN (
      SELECT id FROM signups WHERE session_id = ANY(v_session_ids)
    );
    DELETE FROM signups WHERE session_id = ANY(v_session_ids);
    DELETE FROM courts WHERE session_id = ANY(v_session_ids);
    DELETE FROM sessions WHERE id = ANY(v_session_ids);
  END IF;

  DELETE FROM subscriptions
    WHERE lark_open_id LIKE 'mock_user_%' OR lark_open_id LIKE 'test_user_%';
END $$;

-- 注意:user_prefs 用 UPSERT,不清理
INSERT INTO user_prefs (lark_open_id, user_name, gender, last_court_type) VALUES
  ('mock_user_01', '陈大力',  '男', '竞技'),
  ('mock_user_02', '李婉婷',  '女', '休闲'),
  ('mock_user_03', '王志强',  '男', '竞技'),
  ('mock_user_04', '张芳芳',  '女', '竞技'),
  ('mock_user_05', '刘明',    '男', '休闲'),
  ('mock_user_06', '赵小琳',  '女', '竞技'),
  ('mock_user_07', '黄建国',  '男', '竞技'),
  ('mock_user_08', '吴美丽',  '女', '休闲'),
  ('mock_user_09', '周伟',    '男', '竞技'),
  ('mock_user_10', '孙佳',    '女', '休闲'),
  ('mock_user_11', '钱浩',    '男', '竞技'),
  ('mock_user_12', '林雅雯',  '女', '竞技'),
  ('mock_user_13', '徐磊',    '男', '休闲'),
  ('mock_user_14', '马静',    '女', '休闲'),
  ('mock_user_15', '朱凯',    '男', '竞技')
ON CONFLICT (lark_open_id) DO UPDATE SET
  user_name = EXCLUDED.user_name,
  gender = EXCLUDED.gender,
  last_court_type = EXCLUDED.last_court_type;

-- ============================================================
-- 主脚本:所有逻辑放在一个 DO 块里,避免变量传递问题
-- ============================================================
DO $$
DECLARE
  v_new_session_id  INT;
  v_hist_session_id INT;
  v_comp_court_id   INT;
  v_cas_court_id    INT;
  v_hist_comp_id    INT;
  v_hist_cas_id     INT;
  fyu INT; m01 INT; m02 INT; m03 INT; m04 INT; m05 INT; m06 INT; m07 INT;
BEGIN
  -- ---------- 1. 新 session(当前开放报名) ----------
  INSERT INTO sessions (lark_chat_id, signup_open_at, signup_close_at, event_start_at, event_end_at, max_slots)
    VALUES (
      'oc_ca48ae5d4ae42b3b3184ede848179319',
      NOW() - INTERVAL '30 minutes',
      NOW() + INTERVAL '4 hours',
      NOW() + INTERVAL '6 hours',
      NOW() + INTERVAL '8 hours',
      16
    )
    RETURNING id INTO v_new_session_id;

  RAISE NOTICE '新 session id = %', v_new_session_id;

  -- 2 个 court(1 竞技 + 1 休闲),各 8 人
  INSERT INTO courts (session_id, name, court_type, max_players, sort_order) VALUES
    (v_new_session_id, '竞技场', '竞技', 8, 1),
    (v_new_session_id, '休闲场', '休闲', 8, 2);

  -- 15 个 fake signups,错开时间
  INSERT INTO signups (session_id, lark_open_id, user_name, preferred_court_type, created_at)
  VALUES
    (v_new_session_id, 'mock_user_01', '陈大力', '竞技', NOW() - INTERVAL '29 minutes'),
    (v_new_session_id, 'mock_user_02', '李婉婷', '休闲', NOW() - INTERVAL '28 minutes'),
    (v_new_session_id, 'mock_user_03', '王志强', '竞技', NOW() - INTERVAL '27 minutes'),
    (v_new_session_id, 'mock_user_04', '张芳芳', '竞技', NOW() - INTERVAL '26 minutes'),
    (v_new_session_id, 'mock_user_05', '刘明',   '休闲', NOW() - INTERVAL '25 minutes'),
    (v_new_session_id, 'mock_user_06', '赵小琳', '竞技', NOW() - INTERVAL '24 minutes'),
    (v_new_session_id, 'mock_user_07', '黄建国', '竞技', NOW() - INTERVAL '23 minutes'),
    (v_new_session_id, 'mock_user_08', '吴美丽', '休闲', NOW() - INTERVAL '22 minutes'),
    (v_new_session_id, 'mock_user_09', '周伟',   '竞技', NOW() - INTERVAL '21 minutes'),
    (v_new_session_id, 'mock_user_10', '孙佳',   '休闲', NOW() - INTERVAL '20 minutes'),
    (v_new_session_id, 'mock_user_11', '钱浩',   '竞技', NOW() - INTERVAL '19 minutes'),
    (v_new_session_id, 'mock_user_12', '林雅雯', '竞技', NOW() - INTERVAL '18 minutes'),
    (v_new_session_id, 'mock_user_13', '徐磊',   '休闲', NOW() - INTERVAL '17 minutes'),
    (v_new_session_id, 'mock_user_14', '马静',   '休闲', NOW() - INTERVAL '16 minutes'),
    (v_new_session_id, 'mock_user_15', '朱凯',   '竞技', NOW() - INTERVAL '15 minutes');

  -- ---------- 2. 历史 session(30 天前)+ matches → 段位 ----------
  INSERT INTO sessions (lark_chat_id, signup_open_at, signup_close_at, event_start_at, event_end_at, max_slots)
    VALUES (
      'oc_ca48ae5d4ae42b3b3184ede848179319',
      NOW() - INTERVAL '30 days 1 hour',
      NOW() - INTERVAL '30 days',
      NOW() - INTERVAL '30 days',
      NOW() - INTERVAL '30 days' + INTERVAL '2 hours',
      16
    )
    RETURNING id INTO v_hist_session_id;

  INSERT INTO courts (session_id, name, court_type, max_players, sort_order)
    VALUES (v_hist_session_id, 'H-C1', '竞技', 4, 1)
    RETURNING id INTO v_hist_comp_id;
  INSERT INTO courts (session_id, name, court_type, max_players, sort_order)
    VALUES (v_hist_session_id, 'H-L1', '休闲', 4, 2)
    RETURNING id INTO v_hist_cas_id;

  -- Fitch + mock_01..07 进历史 session 的 signups
  -- 用 8 个变量保存 court_assignment ids
  WITH new_signups AS (
    INSERT INTO signups (session_id, lark_open_id, user_name, preferred_court_type, created_at)
    VALUES
      (v_hist_session_id, 'ou_44c0c24528dbd6f03ce5b41fdcab92ef', 'Fitch Yu', '竞技', NOW() - INTERVAL '30 days 50 min'),
      (v_hist_session_id, 'mock_user_01', '陈大力', '竞技', NOW() - INTERVAL '30 days 49 min'),
      (v_hist_session_id, 'mock_user_02', '李婉婷', '竞技', NOW() - INTERVAL '30 days 48 min'),
      (v_hist_session_id, 'mock_user_03', '王志强', '竞技', NOW() - INTERVAL '30 days 47 min'),
      (v_hist_session_id, 'mock_user_04', '张芳芳', '休闲', NOW() - INTERVAL '30 days 46 min'),
      (v_hist_session_id, 'mock_user_05', '刘明',   '休闲', NOW() - INTERVAL '30 days 45 min'),
      (v_hist_session_id, 'mock_user_06', '赵小琳', '休闲', NOW() - INTERVAL '30 days 44 min'),
      (v_hist_session_id, 'mock_user_07', '黄建国', '休闲', NOW() - INTERVAL '30 days 43 min')
    RETURNING id, lark_open_id
  )
  INSERT INTO court_assignments (court_id, signup_id, sort_order)
  SELECT
    CASE WHEN lark_open_id IN ('ou_44c0c24528dbd6f03ce5b41fdcab92ef','mock_user_01','mock_user_02','mock_user_03')
         THEN v_hist_comp_id ELSE v_hist_cas_id END,
    id,
    ROW_NUMBER() OVER (PARTITION BY (
      CASE WHEN lark_open_id IN ('ou_44c0c24528dbd6f03ce5b41fdcab92ef','mock_user_01','mock_user_02','mock_user_03')
           THEN 1 ELSE 2 END
    ) ORDER BY id)
  FROM new_signups;

  -- 拿出 8 个 assignment id
  SELECT ca.id INTO fyu FROM court_assignments ca JOIN signups s ON s.id = ca.signup_id
   WHERE s.session_id = v_hist_session_id AND s.lark_open_id = 'ou_44c0c24528dbd6f03ce5b41fdcab92ef';
  SELECT ca.id INTO m01 FROM court_assignments ca JOIN signups s ON s.id = ca.signup_id
   WHERE s.session_id = v_hist_session_id AND s.lark_open_id = 'mock_user_01';
  SELECT ca.id INTO m02 FROM court_assignments ca JOIN signups s ON s.id = ca.signup_id
   WHERE s.session_id = v_hist_session_id AND s.lark_open_id = 'mock_user_02';
  SELECT ca.id INTO m03 FROM court_assignments ca JOIN signups s ON s.id = ca.signup_id
   WHERE s.session_id = v_hist_session_id AND s.lark_open_id = 'mock_user_03';
  SELECT ca.id INTO m04 FROM court_assignments ca JOIN signups s ON s.id = ca.signup_id
   WHERE s.session_id = v_hist_session_id AND s.lark_open_id = 'mock_user_04';
  SELECT ca.id INTO m05 FROM court_assignments ca JOIN signups s ON s.id = ca.signup_id
   WHERE s.session_id = v_hist_session_id AND s.lark_open_id = 'mock_user_05';
  SELECT ca.id INTO m06 FROM court_assignments ca JOIN signups s ON s.id = ca.signup_id
   WHERE s.session_id = v_hist_session_id AND s.lark_open_id = 'mock_user_06';
  SELECT ca.id INTO m07 FROM court_assignments ca JOIN signups s ON s.id = ca.signup_id
   WHERE s.session_id = v_hist_session_id AND s.lark_open_id = 'mock_user_07';

  -- 竞技场 8 场:Fitch 强势(7 胜 1 负,场均高净胜) → 期望铂金/钻石
  -- m01 中等偏上 → 黄金/铂金
  -- m02 中等 → 黄金
  -- m03 偏弱 → 白银/黄金
  INSERT INTO matches (court_id, round_num, team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b) VALUES
    (v_hist_comp_id, 1, fyu, m01, m02, m03, 21, 12),
    (v_hist_comp_id, 2, fyu, m02, m01, m03, 21, 18),
    (v_hist_comp_id, 3, fyu, m03, m01, m02, 21, 19),
    (v_hist_comp_id, 4, fyu, m01, m02, m03, 21, 15),
    (v_hist_comp_id, 5, fyu, m02, m01, m03, 21, 17),
    (v_hist_comp_id, 6, fyu, m03, m01, m02, 21, 20),
    (v_hist_comp_id, 7, fyu, m01, m02, m03, 21, 14),
    (v_hist_comp_id, 8, m01, m02, fyu, m03, 21, 19);

  -- 休闲场 8 场:四人混战,大致均势 → 都是黄金/铂金区间
  INSERT INTO matches (court_id, round_num, team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b) VALUES
    (v_hist_cas_id, 1, m04, m05, m06, m07, 21, 17),
    (v_hist_cas_id, 2, m04, m06, m05, m07, 18, 21),
    (v_hist_cas_id, 3, m04, m07, m05, m06, 21, 19),
    (v_hist_cas_id, 4, m04, m05, m06, m07, 19, 21),
    (v_hist_cas_id, 5, m04, m06, m05, m07, 21, 16),
    (v_hist_cas_id, 6, m04, m07, m05, m06, 21, 18),
    (v_hist_cas_id, 7, m05, m06, m04, m07, 21, 19),
    (v_hist_cas_id, 8, m05, m07, m04, m06, 21, 15);

  RAISE NOTICE '历史 session id = %, 共造 16 场比赛', v_hist_session_id;
END $$;

COMMIT;


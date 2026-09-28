-- Migration number: 0007
-- Phase 6 TASK1.120｜Health Insight Data Persistence Foundation
-- health_insight_records 表
--
-- 範圍：只建立schema，不修改任何既有資料表——`users`表完全沒有變動
-- （只用既有的`id`欄位當外鍵），這是Health Insight產品線第一張
-- 專屬的資料表，為將來的歷史紀錄回顧/進度追蹤/個人化/Gemini
-- Enhancement Layer準備資料邊界，本次任務本身不實作這些功能。
--
-- 只有已登入使用者（authenticated:true，見
-- src/identity/health_insight/user_identity.js）才會有紀錄——
-- 訪客/匿名使用者不會、也不能寫入這張表（不建立假身份）。
--
-- input_snapshot/output_snapshot都是JSON字串（TEXT欄位），內容
-- 分別是：
-- - input_snapshot：Input Experience答案的安全白名單摘要（gender/
--   age/height/weight/healthGoal），不含任何OAuth/session/原始
--   HTTP payload細節
-- - output_snapshot：Health Insight Response Builder（TASK1.117）
--   成功時的`data`欄位（healthObservation/behaviorPattern/
--   recommendation/progressTrend/decision）——這已經是對外安全、
--   不含internal capability structure/stage/reason的既有輸出形狀
--
-- 明確不存：OAuth token、session token、密碼、provider憑證、
-- internal runtime state、execution lifecycle metadata、stack
-- trace——這張表完全沒有任何欄位可以承載這些內容。
--
-- Rollback（可逆）：這個migration只有CREATE TABLE/CREATE
-- INDEX，透過`git revert`撤銷這個commit即可還原（額外搭配
-- `DROP TABLE IF EXISTS health_insight_records;`實際清除D1裡的
-- 表格，若該環境已經套用過這個migration）。這是獨立、新增的一張
-- 表，不影響任何既有表的資料或schema。

CREATE TABLE IF NOT EXISTS health_insight_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_version TEXT NOT NULL,
  input_snapshot TEXT NOT NULL,
  output_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_health_insight_records_user
  ON health_insight_records(user_id);

CREATE INDEX IF NOT EXISTS idx_health_insight_records_created_at
  ON health_insight_records(created_at);

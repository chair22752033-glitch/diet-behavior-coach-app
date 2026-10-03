-- Phase D｜使用者主動分享記錄給管理者（support / 詢問）
--
-- 目的：使用者「有問題想詢問」時，可一鍵把「自己選定期間的記錄快照 + 問題」
-- 傳給管理者（擁有者）查看。這是**使用者主動、明確同意、期間受限**的分享，
-- 不是讓管理者隨意翻看一般帳號的飲食明細。
--
-- 設計：
--   - 存「快照」而非指標，管理者只看得到使用者當下選擇送出的那份內容與期間。
--   - payload 為 JSON 字串（使用者端已依期間過濾後的記錄 + 問題）。
--   - 期間最少 90 天、且為最近 90 天；不足 90 天則為第一筆到最新（由前端計算、
--     後端以 range_from/range_to 記錄實際涵蓋範圍）。
--   - 只有擁有者（/api/admin/*）能讀；建立由已驗證的使用者本人 POST。

CREATE TABLE IF NOT EXISTS support_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question TEXT,
  period_days INTEGER,
  range_from TEXT,
  range_to TEXT,
  record_count INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_support_requests_created ON support_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_support_requests_user ON support_requests (user_id);

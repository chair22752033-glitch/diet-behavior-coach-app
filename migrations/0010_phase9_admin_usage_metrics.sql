-- Migration number: 0010
-- Phase 9（後台 A 階段）｜D1 用量量測表 usage_metrics（2026-10-01）
--
-- 目的：累積每日、每端點的 D1 讀寫列數與請求數，供「免費額度承載人數」量測。
-- 只記彙總數字（day / endpoint / requests / rows_read / rows_written），
-- 不記任何使用者資料、不記個人內容。附加式（additive），不動既有表。
--
-- 用 (day, endpoint) 當主鍵，寫入以 upsert 累加。day 為 UTC YYYY-MM-DD。
--
-- Rollback：git revert；若已套用：DROP TABLE IF EXISTS usage_metrics;（不影響既有表）。

CREATE TABLE IF NOT EXISTS usage_metrics (
  day TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, endpoint)
);

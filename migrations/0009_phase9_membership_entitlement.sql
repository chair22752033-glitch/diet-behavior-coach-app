-- Migration number: 0009
-- Phase 9｜Membership Entitlement Source + Seven-Day Review cache (2026-10-01)
--
-- 目的：建立「server 端唯一權威的會員權益來源」，取代先前結構上人人皆 free
-- 的狀態（membership_resolver 的 options.lookupTier 從未接線）。本 migration
-- 只新增三張表，不修改任何既有表、不寫入任何資料、不清除任何 KV/D1/R2。
-- 附加式（additive）。
--
-- 設計原則（與既有 auth 信任邊界一致）：
--   - 權益只信任 server 從這裡查出的 tier，絕不信前端 storage/header/body。
--   - 到期在「請求當下」判斷（valid_until 比對 now），不依賴排程清理。
--   - 匿名使用者結構上不可能是 premium（membership_resolver 在查 tier 前就擋）。
--   - 查詢失敗 → unknown（暫時不可確認），不永久改變使用者的 plan。
--
-- memberships：每個已驗證使用者的權益狀態（目前只有 free / premium 兩種對外
--   方案；unknown 是查詢狀態，不寫進這張表）。valid_until 為 NULL 代表無期限
--   （保留給未來的續訂）；beta 試用一律帶 valid_until。
-- membership_audit：每次 grant / revoke 的稽核軌跡（誰、何時、授予到何時、來源）。
-- review_reports：7 日回顧的結果快取。report_key 由 (window + data_version +
--   model_version) 決定，保證：
--     - 同一份資料+視窗 → 同一 report_key → 重看不重算、不重複扣配額（idempotent）。
--     - 配額 = 期間內 distinct report_key 數（每次「真正產生新報告」才算一次）。
--
-- Rollback：git revert 本 commit；若某環境已套用，另外執行
--   DROP TABLE IF EXISTS review_reports;
--   DROP TABLE IF EXISTS membership_audit;
--   DROP TABLE IF EXISTS memberships;
-- 即可還原。不影響任何既有表（users / sessions / sync_records / ...）。
-- 注意：rollback 會還原到「人人 free、無付費權益」的狀態。

CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  valid_from TEXT,
  valid_until TEXT,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS membership_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  plan TEXT,
  valid_until TEXT,
  source TEXT,
  actor TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_membership_audit_user
  ON membership_audit(user_id, at);

CREATE TABLE IF NOT EXISTS review_reports (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  data_version TEXT,
  model_version TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, report_key)
);

CREATE INDEX IF NOT EXISTS idx_review_reports_user_created
  ON review_reports(user_id, created_at);

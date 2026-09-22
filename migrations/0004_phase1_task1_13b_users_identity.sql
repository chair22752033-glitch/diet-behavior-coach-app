-- Migration number: 0004
-- Phase 1 TASK 1.13B｜users identity layer 完整化（新增 status / last_login_at）
-- 範圍：只擴充 schema，不寫入任何資料、不接入 src/worker.js、不建立 OAuth 或登入頁面。

ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted'));
ALTER TABLE users ADD COLUMN last_login_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_status
  ON users(status);

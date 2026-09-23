-- Migration number: 0006
-- Phase 1 TASK 1.34｜Production Authentication Hardening Layer - auth_audit_logs 表
-- 範圍：只建立 schema，不接入任何既有登入流程（guest/provider/oauth/upgrade/
-- logout controller 完全沒有被修改成會寫入這張表——這是給「未來需要查詢
-- 稽核紀錄」時使用的能力，本次只負責把能力準備好並在
-- backups/phase1-task1.34-auth-hardening/ 獨立測試，不動任何一行既有
-- controller 的既有行為，符合「禁止修改現有登入流程行為」的限制。

CREATE TABLE IF NOT EXISTS auth_audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,                                    -- guest_login | provider_login | oauth_login | upgrade_account | logout
  provider TEXT,                                               -- 例如 'google'；guest_login/logout 沒有provider時為 NULL
  ip_hash TEXT,                                                 -- 只存IP的雜湊值，不存明文IP（沿用sessions表的隱私慣例）
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user
  ON auth_audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_event_type
  ON auth_audit_logs(event_type);

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_created_at
  ON auth_audit_logs(created_at);

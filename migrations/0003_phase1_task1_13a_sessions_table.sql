-- Migration number: 0003
-- Phase 1 TASK 1.13A｜建立 sessions 表（未來身份系統基礎，本次不接入任何登入流程）
-- 範圍：只建立 schema，不寫入任何資料、不接入 src/worker.js、不建立 OAuth 或正式登入流程。

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                                        -- 不透明的隨機 session token（256-bit，base64url）
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,                                    -- 過期時間，由應用層在建立時計算好寫入
  last_seen_at TEXT,                                           -- 最後一次驗證通過的時間（供未來 idle timeout 使用，本次不實作）
  user_agent TEXT,                                             -- 建立當下的 User-Agent，供使用者查看「登入裝置」時參考
  ip_hash TEXT,                                                -- 只存 IP 的雜湊值，不存明文 IP（隱私考量，見 src/auth/README.md）
  revoked_at TEXT                                              -- 登出/撤銷時間戳，NULL 表示仍然有效
);

CREATE INDEX IF NOT EXISTS idx_sessions_user
  ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires
  ON sessions(expires_at);

-- Phase C (商業試辦)｜同意事件紀錄（append-only）
-- 記錄使用者對服務條款/個資告知/方案/試用等的同意、拒絕、撤回。
-- 每筆綁定「當時呈現文件的內容雜湊」(doc_content_sha256)，日後可證明同意的是哪一版文字。
-- 只追加、不更新不刪除；結構上不存恢復碼/金鑰/token/飲食明文/完整 IP（無對應欄位）。
-- 附加式 migration（僅 CREATE），不動既有資料。

CREATE TABLE IF NOT EXISTS consent_events (
  event_id            TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  purpose             TEXT NOT NULL,
  doc_type            TEXT NOT NULL,
  doc_version         TEXT NOT NULL,
  doc_content_sha256  TEXT NOT NULL,
  action              TEXT NOT NULL,          -- granted | declined | withdrawn
  source_screen       TEXT NOT NULL,
  order_id            TEXT,
  server_time         TEXT NOT NULL DEFAULT (datetime('now')),
  seq                 INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consent_user_purpose ON consent_events (user_id, purpose, seq);

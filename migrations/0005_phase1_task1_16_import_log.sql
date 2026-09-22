-- Migration number: 0005
-- Phase 1 TASK 1.16｜Legacy Import Service Layer - legacy_import_logs 表
-- 範圍：只建立 schema，不寫入任何資料、不接入 src/worker.js、不執行任何真實 sync:* 資料遷移。
--
-- 注意：這是一張新表，與 TASK1.7 已建立的 legacy_import_log（單數）不同——
-- 那張表是 mapping 設計階段（TASK1.9）規劃的較完整版本（含 target_user_id/detail_json），
-- 本次依 TASK1.16 規格要求建立這張較精簡的 legacy_import_logs（複數），
-- 專門給本次的 import service 用來記錄「這次匯入跑得如何」，兩張表並存，互不影響、互不取代。

CREATE TABLE IF NOT EXISTS legacy_import_logs (
  id TEXT PRIMARY KEY,
  source_type TEXT,
  source_key TEXT,
  status TEXT,
  imported_count INTEGER,
  error_message TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_legacy_import_logs_source_key
  ON legacy_import_logs(source_key);

CREATE INDEX IF NOT EXISTS idx_legacy_import_logs_status
  ON legacy_import_logs(status);

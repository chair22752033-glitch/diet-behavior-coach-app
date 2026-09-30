-- Migration number: 0008
-- Phase 8｜Sync Ownership + Concurrent-Write Safety (security remediation follow-up 2026-09-30)
--
-- 目的：把跨裝置同步從「使用者自選短碼 + KV 整包覆寫」改為
-- 「以已驗證 session 的 user_id 為擁有者 + D1 逐筆 upsert（原子 batch）」。
-- 這消除三個問題：
--   1) 任何知道短碼者都能讀寫他人資料（改為只認 session user_id）。
--   2) 兩台裝置整包覆寫造成較舊新增遺失（改為逐筆 record_id upsert，聯集）。
--   3) 時間戳碰撞造成資料被視為同一筆（record_id 才是主鍵，ts 只是內容）。
--
-- 範圍：只 CREATE TABLE / CREATE INDEX，不修改任何既有表、不寫入任何資料、
-- 不清除任何 KV/D1/R2。附加式（additive）。本檔案僅供審核與本機驗證，
-- 依授權「不在正式環境套用」。
--
-- sync_records：使用者的每一筆同步紀錄（check-in / QUEST 各一種 kind）。
--   主鍵 (user_id, kind, record_id) 保證：
--     - 同一 record_id 重送 = idempotent（不重複）
--     - 不同 record_id 但相同 client_ts = 兩筆各自保留（碰撞安全）
--   payload 是該筆紀錄的 JSON 字串（不含任何 OAuth/session/密鑰）。
--   client_ts 只是顯示排序用的原始時間戳，不是識別鍵。
--
-- sync_meta：使用者每種 kind 的非逐筆欄位（例如 ft 首次旗標、identity 等
--   純量集合），以 JSON 存於 scalars；version 為樂觀並行版本號（每次寫入 +1，
--   供純量欄位的衝突偵測；逐筆紀錄本身以 upsert 聯集，天然免衝突）。
--
-- 刪除語意：本產品目前只「新增」紀錄，不支援刪除既有紀錄；因此本 schema
-- 不含 tombstone/刪除同步。若未來要支援刪除，需另加 deleted_at 欄位與
-- 明確的刪除同步規則——在那之前，刪除不會跨裝置同步（誠實聲明，不隱含支援）。
--
-- Rollback：git revert 本 commit；若某環境已套用，另外執行
--   DROP TABLE IF EXISTS sync_records;  DROP TABLE IF EXISTS sync_meta;
-- 即可還原。不影響任何既有表。

CREATE TABLE IF NOT EXISTS sync_records (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  client_ts INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind, record_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_records_user_kind
  ON sync_records(user_id, kind);

CREATE TABLE IF NOT EXISTS sync_meta (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  scalars TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind)
);

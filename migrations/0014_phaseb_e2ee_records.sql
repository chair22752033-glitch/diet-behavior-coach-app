-- Phase B（E2EE 第 3 步・第一塊）｜密文記錄儲存。
-- 與現有明文 sync_records 完全分開：這張表只存「不透明密文封裝（JWE）」。
-- 現有明文同步 /api/sync 完全不受影響；本表在使用者完成遷移後才會被使用。
-- 附加式 migration（僅 CREATE），不動既有資料。

CREATE TABLE IF NOT EXISTS e2ee_records (
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,          -- ins | quest | review | health_insight
  record_id   TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  envelope    TEXT NOT NULL,          -- compact JWE ciphertext ONLY（無明文）
  seq         INTEGER NOT NULL,       -- server 指派排序（非明文時間）
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind, record_id)
);

CREATE INDEX IF NOT EXISTS idx_e2ee_records_owner_seq ON e2ee_records (user_id, seq);

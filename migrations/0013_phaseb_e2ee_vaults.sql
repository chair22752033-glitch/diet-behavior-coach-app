-- Phase B（E2EE 第 1 步）｜加密保險庫記錄。
-- 每個帳號一個保險庫：server 只存「被恢復碼包裝的 VK」+ salt，自己無法解開。
-- 這一步只建立保險庫，尚未遷移任何現有資料（crypto_mode 預設 vault_created）。
-- 附加式 migration（僅 CREATE），不動既有資料、不影響現有明文同步。

CREATE TABLE IF NOT EXISTS e2ee_vaults (
  user_id             TEXT PRIMARY KEY,
  vault_id            TEXT NOT NULL,
  epoch               INTEGER NOT NULL DEFAULT 1,
  recovery_salt       TEXT NOT NULL,        -- base64
  wrapped_vk_recovery TEXT NOT NULL,        -- base64：VK 被恢復金鑰(AES-KW)包裝，server 無法解開
  format              TEXT NOT NULL,        -- 封裝格式版本標記
  crypto_mode         TEXT NOT NULL DEFAULT 'vault_created',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

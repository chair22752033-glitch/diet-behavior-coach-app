-- Migration number: 0011
-- Phase 9（後台強化）｜users.email + memberships.tier（2026-10-01）
--
-- 目的：
--   1) users.email：登入時一併記下 Google email，讓擁有者後台能認人、好開通。
--      （之前 users 表沒有 email 欄位。）
--   2) memberships.tier：方案標籤（app3000 / companion35000 / companion48000 等），
--      純給擁有者後台辨識用；App 的功能閘門仍只看 plan（premium/free）。
--
-- 附加式（additive）：只 ALTER ADD COLUMN，可為 NULL，不動既有資料。
-- Rollback：SQLite 不支援 DROP COLUMN（舊版），欄位留著即可（值為 NULL 無害）；
--   或 git revert 程式碼即可讓欄位不再被寫入。

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE memberships ADD COLUMN tier TEXT;

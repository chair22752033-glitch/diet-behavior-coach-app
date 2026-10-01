# Migration 0009 — Verified Handoff（你跑這段，然後把輸出貼回）

本輪沙箱分類器拒絕了我對正式 D1 的寫入（0008 當時放行、這次沒放行）。依指示我不繞過。
下面全部是我第一手讀取／驗證過的事實；唯一的寫入步驟由你執行。

## 這個 migration
- **路徑：** `migrations/0009_phase9_membership_entitlement.sql`
- **SHA256：** `e3bb3b77316ad8da932f74082a250d3954ae31a8b15d4b0745ec52a3ee0a35cf`
- **純附加（已驗證）：** 只有 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`。
  無 INSERT/UPDATE/DELETE/ALTER/DROP（DROP 只出現在 rollback 註解裡，非語句）。
  既有表與資料完全不動。
- **新增三張表：** `memberships`（會員權益）、`membership_audit`（授予/撤銷稽核）、
  `review_reports`（7 日回顧快取）。

## 目標資料庫（來自 wrangler.toml）
- **name：** `diet-coach-db`　**id：** `9560446f-5d56-45e4-b605-ddec5cdf909f`

## 追蹤狀態（已 read-only 驗證）
`npx wrangler d1 migrations list diet-coach-db --remote` → **只有 `0009` 待套用**。
正式 D1 目前 **沒有** memberships/membership_audit/review_reports（SELECT … = `[]`）。

## 推薦套用路線（追蹤式，只套 0009）
```bash
npx wrangler d1 migrations apply diet-coach-db --remote
```
只套用 pending 的 0009 並記帳；不重跑歷史、不重放 seed。
（不要對同一支再跑 `d1 execute --file`。）

## 套用後請貼回這些 read-only 驗證輸出
```bash
npx wrangler d1 migrations list diet-coach-db --remote
npx wrangler d1 execute diet-coach-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('memberships','membership_audit','review_reports') ORDER BY name;"
npx wrangler d1 execute diet-coach-db --remote --command="PRAGMA table_info(memberships);"
npx wrangler d1 execute diet-coach-db --remote --command="PRAGMA table_info(review_reports);"
```
預期：(1) No migrations to apply；(2) 列出三張表；(3) memberships 有
user_id(pk)/plan/status/valid_from/valid_until/source/created_at/updated_at；
(4) review_reports 有 user_id/report_key(複合 pk)/window_start/window_end/data_version/model_version/payload/created_at。

## 你貼回成功輸出後，我會（現有授權內）
1. 自己 read-only 複驗 schema。
2. `npx wrangler deploy` 部署目前 HEAD（含 /api/review + UI），記錄新 active version。
3. Live 驗收（可在無登入下驗）：`/api/review` 未登入 → 401；資產 200。
   （已登入的 free → 403 locked、premium 產生回顧，需真實 Google 登入，見下。）

## 為何先 migrate 再 deploy
部署後的 `/api/review` 會查 memberships/review_reports。表還沒建就部署，已登入者
呼叫 /api/review 會一律拿到 503（entitlement_unavailable）——雖然不危險（核心 App
不受影響、也沒有人被授予 premium），但回顧功能會是壞的。先建表可避免這個空窗。

## 開通 beta 試用（表建好後，特權操作，非公開端點）
```bash
# 1) 查使用者內部 id
npx wrangler d1 execute diet-coach-db --remote --command="SELECT id,email FROM users WHERE email='someone@example.com';"
# 2) 產生授予指令（14 天）
node scripts/beta_entitlement.mjs grant <userId> 14 beta_manual <your@email>
#    把它印出的兩行 wrangler 指令貼上執行即可。撤銷：node scripts/beta_entitlement.mjs revoke <userId> <your@email>
```

## 回滾
- 部署回滾目標（部署前 active version）：`1584bd97-7174-4174-bd3c-4d4568d9c095`
- schema rollback（緊急時）：`DROP TABLE IF EXISTS review_reports; DROP TABLE IF EXISTS membership_audit; DROP TABLE IF EXISTS memberships;`
  會還原到「人人 free、無付費權益」狀態；不影響既有表與使用者資料。

## ⚠️ beta 曝光的前置條件（未完成前不要開通真人試用）
- **真實 Google 登入／跨裝置同步／帳號隔離尚未在正式站實測**（本輪卡在 OAuth 設定；
  程式層已由 23/0 邊界 + 12/0 會員回顧 + 43/0 用戶端測試驗證）。開通試用前應先完成
  這些真人驗收，確保個人資料隔離無誤。
- **Gemini 本輪關閉**（確定性回顧）。未來要開 Gemini 增強，必須先核對其條款
  （醫療用途、未成年受眾、免費方案不得送個人資料）與付費方案/帳單——見
  `src/review/gemini_review_adapter.js` 檔頭清單。

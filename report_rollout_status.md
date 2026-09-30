# 飲食主場秀 — 同步擁有權 上線流程 進度報告

**日期：** 2026-09-30
**分支：** `claude/wrangler-deploy-c821f3`
**目前 commit：** `3d01fab`（已推送 origin）
**目前生產版本：** `62cf281f-58e9-469b-898b-4a9c8dda155f`（**尚未更新**，本輪程式未部署）

## 現況一句話
程式、附加式 migration、測試、fix-forward 全部完成並推送；**卡在「對正式 D1 套用 migration 0008」這一步**——沙箱安全機制擋下我對正式資料庫的寫入，你選擇由你手動執行。**在 migration 套用完成前，我不會部署**（先部署會讓 `/api/sync` 對已登入者回 500）。

## 已完成（本機/程式，已驗證並推送）
| 項目 | 狀態 |
| --- | --- |
| migration `0008_phase8_sync_ownership.sql` 移入 `migrations/`（共 8 檔） | ✅ 已提交 `3d01fab` |
| 回歸計數閘門 7→8 fix-forward（8 個套件） | ✅ 未弱化任何行為斷言 |
| 既有回歸 17 套件（1.111–1.127，`PHASE1_REVIEW_NESTED=1`） | ✅ 0 失敗、12,094 斷言 |
| 真實 Worker 邊界測試 `test_sync_ownership_boundary.mjs` | ✅ 23/0 |
| 用戶端行為測試 `test_auth_sync_integrity.mjs` | ✅ 35/0 |
| 推送 origin | ✅ `3d01fab` |
| 記錄回滾目標（部署前的 active version） | ✅ `62cf281f-58e9-469b-898b-4a9c8dda155f` |

## 正式環境現況（我剛才直接讀取生產 D1 確認）
- `sync_records`、`sync_meta` 兩張表在正式 D1 **尚不存在**（`SELECT … sqlite_master … results: []`）。
- 亦即 **migration 0008 尚未套用**，生產仍跑舊版程式（`62cf281f`）。舊版對使用者運作正常，未受影響。

## 被擋下的步驟（需要你執行）
沙箱安全分類器把「對正式 D1 的寫入」判為 Blind Apply 並拒絕；我不繞過。請你手動執行：
```bash
# 1) 套用 migration（冪等：CREATE TABLE IF NOT EXISTS，不動任何既有資料）
npx wrangler d1 execute diet-coach-db --remote \
  --file=migrations/0008_phase8_sync_ownership.sql

# 2) 驗證兩表已建立（應列出 sync_records / sync_meta）
npx wrangler d1 execute diet-coach-db --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sync_records','sync_meta');"
```
完成後在對話回覆「done」，我會接著：
1. 再讀一次正式 D1 確認兩表存在；
2. `npx wrangler deploy` 部署 `3d01fab`；
3. 記錄新 live version；
4. 驗證：資產仍 200、`/api/sync` 未登入回 **401**（擁有權生效、非舊短碼行為）、`/auth/provider` 仍 **403**、首頁/OAuth 入口正常。

## 為何順序是「先 migrate 再 deploy」
新程式的 `/api/sync`、`/api/qlive` 會查 `sync_records`/`sync_meta`。若先部署、表還沒建，已登入者的同步請求會 500、且舊短碼路徑已改為 410——等於同步全掛。先建表可完全避免這個空窗。

## 回滾
```bash
npx wrangler rollback 62cf281f-58e9-469b-898b-4a9c8dda155f
```
只切換 Worker 程式版本，不影響 D1/KV/R2 資料；新表留著也無害（無人寫入時就是空表）。

## 尚未完成 / 後續工作包（不在本輪）
- provider 登入的 service 層防禦縱深、scalars 版本衝突互動式解決。
- 會員／Gemini 權益來源、UI/導覽/帳號 CTA、殘留啟動頁 emoji、載入效能。
- 正式站 live 驗收：Google OAuth 登入後的實際跨裝置同步、真實兩裝置（需部署完成 + 互動帳號）。

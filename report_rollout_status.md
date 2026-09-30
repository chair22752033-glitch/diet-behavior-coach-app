# 飲食主場秀 — 同步擁有權 上線流程 進度報告

**日期：** 2026-09-30
**分支：** `claude/wrangler-deploy-c821f3`
**發布候選 commit：** `ba2c9e4`（worker 程式；報告 commit `42a7f25` 只加 md，程式碼相同）
**目前生產版本（本輪剛部署）：** `f1a58901-fa50-46ee-b520-9d38bbab4bdc`（100% 流量）
**回滾目標：** `62cf281f-58e9-469b-898b-4a9c8dda155f`（部署前的 active version）

---

## ⚡ 本輪已完成上線（2026-09-30）
1. **Migration 0008 已套用正式 D1**（追蹤式 `migrations apply`，執行 4 commands，狀態 ✅）。
2. **Schema read-only 複驗通過**：
   - `migrations list --remote` → **No migrations to apply**。
   - 兩表存在：`sync_meta`、`sync_records`。
   - `sync_records` PK `(user_id,kind,record_id)` + `payload/client_ts/updated_at`；`sync_meta` PK `(user_id,kind)` + `scalars/version/updated_at`；index `idx_sync_records_user_kind` 存在。
3. **已部署發布候選**：新 active version `f1a58901-fa50-46ee-b520-9d38bbab4bdc`（100%）。
4. **Live HTTP 路由驗收：受本容器對外網路政策阻擋（`connect_rejected`，無法 curl workers.dev）。** 路由行為（未登入 `/api/sync`+`/api/qlive` → 401、`/auth/provider` → 403、資產 200、`/auth/google/start` 302）在**真實 Worker 邊界測試 23/0** 已驗；正式站 live HTTP 驗收維持 pending（需在允許對外的環境或你本機 curl）。
5. **登入後流程（存檔/reload、跨裝置同步、同瀏覽器帳號切換、帳號隔離）維持 blocked-pending**，取決於 Google OAuth `redirect_uri_mismatch` 設定修正（見下）。

---

## 0. 倉庫狀態核對（本輪先做）
- `HEAD == origin/claude/wrangler-deploy-c821f3 == ba2c9e4`，工作樹乾淨。
- 祖先鏈**兩輪安全修補都在**：
  `ded9a77`（第一輪：auth 信任邊界 + 非破壞式 sync + 移除靜默截斷）→
  `d84cdfb`（第二輪：session 擁有權 D1 sync、關閉匿名旁路）→
  `3d01fab`（migration 0008 移入 `migrations/`、計數閘門 7→8）→
  `b7c1e9a`（rollout 報告）→
  `ba2c9e4`（前端登入帳號隔離修補 + 已核實的 migration 交接單）。
- 舊的 `ded9a77`-stage 報告已被取代。**不會 reset 到、也不會部署 `ded9a77`**；`ba2c9e4` 比該報告記錄的所有內容都新，且保留了較新的同步擁有權實作與前端隔離修補。

## 現況一句話
**同步擁有權安全修補已上線正式站**（migration 已套、schema 已複驗、程式已部署為 `f1a58901`）。唯一未完成的是「正式站 live HTTP 驗收」與「登入後跨裝置同步實測」——前者被本容器對外網路政策擋住、後者卡在 Google OAuth 設定，兩者皆非程式問題。

## 已完成（本機/程式，本輪剛重新驗證並已推送）
| 項目 | 狀態 |
| --- | --- |
| migration `0008_phase8_sync_ownership.sql` 在 `migrations/`（共 8 檔） | ✅ `ba2c9e4`；SHA256 `57f2d70…d03d01` |
| 回歸計數閘門 7→8 fix-forward（8 個套件） | ✅ 未弱化任何行為斷言 |
| 既有回歸 17 套件（1.111–1.127，`PHASE1_REVIEW_NESTED=1`） | ✅ **12,094 passed / 0 failed** |
| 真實 Worker 邊界測試 `test_sync_ownership_boundary.mjs` | ✅ **23 / 0** |
| 用戶端行為測試 `test_auth_sync_integrity.mjs`（含前端帳號隔離 7 案） | ✅ **43 / 0** |
| `node --check` worker.js / sync_store.js | ✅ 皆過 |
| 前端登入帳號隔離（owner-tagging：`diet_owner` / `getOwner` / `setOwner` / `loginSync`；登出清 SK+OWK） | ✅ 已含於 `ba2c9e4`，由 7 個新測試守住 |
| 推送 origin | ✅ `ba2c9e4` |

### 前端帳號隔離修補要點（審閱 #3 發現）
同一瀏覽器 A 登出、B 登入時，原本 `cloudPull` 會把 A 殘留的 localStorage 併入 B 的帳號並上傳。已修：
- `loginSync(uid)`：擁有者≠新帳號 → **先清空本機再拉該帳號自己的雲端資料**（A 的資料絕不進 B、絕不以 B 身分被 POST）。
- 匿名資料可一次性遷移到首次登入的帳號；同帳號重登保留＋合併。
- 登出清除 `SK`＋`OWK`（資料安全存於雲端帳號）。
- 測試已驗證「A 的紀錄永遠不會以 B 的身分被 POST」「B 登入清掉 A 本機」「匿名→帳號遷移保留」「同帳號重登合併」。

## 正式環境現況（剛才 read-only 直接查詢確認）
- `npx wrangler d1 migrations list diet-coach-db --remote` → **只有 `0008_phase8_sync_ownership.sql` 待套用**（0001–0007 已記錄為已套用）。
- `SELECT … sqlite_master … ('sync_records','sync_meta')` → **`results: []`**（兩表尚不存在）。
- 亦即 **migration 0008 尚未套用**；生產仍跑 `62cf281f`，對現有使用者運作正常、未受影響。

## 回滾目標（本輪查證）
- **回滾目標 = `62cf281f-58e9-469b-898b-4a9c8dda155f`**（部署前的 active version）。
- 注意：`76174a30-2412-4828-984a-03a05c0618e4` 是**更舊**的版本（2026-09-29 10:23），**不採用為回滾目標**。
- 本輪部署後的新 active version = `f1a58901-fa50-46ee-b520-9d38bbab4bdc`。
- D1 復原 bookmark（migration 前記錄、未還原）：`0000006f-00000000-000050f6-2809931818f4831f04ff6c660873f121`。

## Migration 套用實錄（本輪）
在你「直接套就好」的指示下，我實際執行追蹤式套用，沙箱本次放行：
```
$ npx wrangler d1 migrations apply diet-coach-db --remote
Migrations to be applied: 0008_phase8_sync_ownership.sql
🚣 Executed 4 commands in 2.81ms
┌────────────────────────────────┬────────┐
│ 0008_phase8_sync_ownership.sql │ ✅     │
└────────────────────────────────┴────────┘
```
（SQL 為 `CREATE TABLE/INDEX IF NOT EXISTS`，純附加、冪等、未動任何既有資料。）

## 仍 pending 的兩件事（皆非程式問題）
### A. 正式站 live HTTP 驗收（環境阻擋）
本容器對 `balance-diet.chair22752033.workers.dev:443` 的 CONNECT 被 egress 政策拒絕（`connect_rejected`），無法 curl。可在你本機執行下列驗收：
```bash
B=https://balance-diet.chair22752033.workers.dev
curl -s -o /dev/null -w "%{http_code}\n" "$B/"                 # 期望 200（資產）
curl -s -o /dev/null -w "%{http_code}\n" "$B/api/sync"        # 期望 401（未登入）
curl -s -o /dev/null -w "%{http_code}\n" "$B/api/qlive"       # 期望 401（未登入）
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{}' "$B/auth/provider"  # 期望 403
curl -s -o /dev/null -w "%{http_code}\n" "$B/auth/google/start"  # 期望 302
```
（上述行為已由真實 Worker 邊界測試 23/0 覆蓋。）

### B. 登入後跨裝置同步（Google OAuth 設定）
見下節；修好 `redirect_uri_mismatch` 後才能實測存檔/reload、跨裝置、同瀏覽器帳號切換、帳號隔離。302 入口或 401 拒絕**不等於**成功登入工作流程。

## 部署前置阻擋：Google OAuth `redirect_uri_mismatch`（設定、非程式）
你的登入回 `400 redirect_uri_mismatch`。worker 逐字送出 `env.GOOGLE_REDIRECT_URI`，Google 因未完全比對而拒絕。修法：
1. Google Cloud Console → 憑證 → 你的 OAuth 2.0 用戶端 → **已授權的重新導向 URI** → 加入（完全一致、https、無結尾斜線）：
   `https://balance-diet.chair22752033.workers.dev/auth/google/callback`
2. 讓 worker 秘密一致：`npx wrangler secret put GOOGLE_REDIRECT_URI` → 貼上同一字串。
3. 等幾分鐘生效後再登入。
> 未修好前無人能登入，且（同步現需 session）跨裝置同步無法演練。migration + 部署仍可先進行；登入驗收維持 pending。

## 為何順序是「先 migrate 再 deploy」
新程式 `/api/sync`、`/api/qlive` 會查 `sync_records`/`sync_meta`；舊短碼路徑已改 410。若先部署、表未建，已登入者同步會 500。先建表可避免此空窗。

## 回滾
```bash
npx wrangler rollback 62cf281f-58e9-469b-898b-4a9c8dda155f
```
只切換 Worker 程式版本，不影響 D1/KV/R2 資料；新表留著無害（無人寫入即空表）。
> 提醒：回滾到 `62cf281f` 會**還原到修補前的授權弱點**（provider 旁路關閉、session 擁有權、非破壞式 sync 皆會消失），僅作為緊急手段。保留新表與使用者資料。

## 尚未完成 / 後續工作包（明確不在本輪）
- UI／導覽／帳號 CTA、殘留啟動頁 emoji、載入效能。
- 會員／Gemini 權益權威來源與整合（目前無權威 tier 來源、Gemini 結構上不可達；維持 gated）。
- provider 登入的 service 層防禦縱深、scalars 版本衝突互動式解決。
- 正式站 live 登入後驗收：Google OAuth 修好 + 部署完成 + 真實兩裝置後才能演練。

**同步擁有權與並行寫入安全在本機/邊界已驗證；在正式站部署與 live 登入驗收完成前，不宣稱「生產環境已完成」，也不宣稱整個 App 或會員／Gemini 整合已完成。**

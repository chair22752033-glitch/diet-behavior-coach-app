# 飲食主場秀 — 同步擁有權與並行寫入安全 補強報告（第二輪）

**日期：** 2026-09-30
**分支：** `claude/wrangler-deploy-c821f3`
**接續：** HEAD `ded9a77`（第一輪 auth/sync 補強）
**授權：** 本輪只做程式、附加式 migration（**staged，未放入 `migrations/`、未套用**）、本機測試、提交推送。**未部署、未改正式 D1 schema、未清任何 KV/D1/R2 資料、未授予任何權益。**
**驗證性質：** 透過「真實 Worker `fetch()` 邊界」+ `node:sqlite` D1 + 假 KV + 由 `/auth/guest` 真正簽發的 session cookie。**非正式站 OAuth／非正式生產驗收。**

回應審閱的六點：關閉 provider 旁路、同步「讀寫」以 session 擁有權、具一致性的權威寫入、端點 schema/配額、真實邊界行為測試、附加式 migration/fixtures/部署指令（不套用）。

---

## 1. 變更檔案（相對 `ded9a77`）
| 檔案 | 變更 |
| --- | --- |
| `src/sync/sync_store.js`（新） | 以 `userId` 為擁有者的 D1 同步存取層：`validateSyncDoc` / `deriveRecordId` / `pushSyncDoc`（原子 batch、逐筆 upsert）/ `getSyncDoc`（owner-scoped 讀回） |
| `src/sync/index.js`（新） | barrel export |
| `src/worker.js` | `fetch()` 內攔截 `/api/sync`、`/api/qlive`：以 `getCurrentUser(app.db, cookie)` 解析 session → `ownerId=userId`；未登入 401；寫入走 `pushSyncDoc(app.db.raw, ownerId, …)`。legacy 內嵌短碼 KV handler 改為 **fail closed（410）**。用戶端改為 session-gated（`SYNC_ON`）、新紀錄帶穩定 `id`（`uid()`）、`cloudPull/cloudPush/qlive` 走 session（無短碼）、本機儲存失敗會跳出提醒 |
| `backups/remediation-sync-ownership/0008_phase8_sync_ownership.sql`（新，**staged**） | 附加式 migration：`sync_records`、`sync_meta` 兩張新表（不動既有表） |
| `backups/remediation-sync-ownership/test_sync_ownership_boundary.mjs`（新） | 真實 Worker 邊界行為測試（23 案） |
| `backups/remediation-sync-ownership/MIGRATION_AND_ROLLOUT.md`（新） | 安裝/部署/回滾/舊資料回復指引 |
| `backups/remediation-auth-sync/test_auth_sync_integrity.mjs`（更新） | 對齊 session-based 用戶端（35 案） |

> **Migration 為何 staged 不放 `migrations/`：** 既有 1.111–1.127 有硬斷言「`migrations/` 恰好 7 個 .sql」。依審閱「準備但不套用」，我把 0008 放在 staging 目錄，讓**全部回歸閘門維持綠、未被弱化**；rollout 時再 `git mv` 進 `migrations/` 並把 7→8 的計數斷言比照 TASK1.120（6→7）更新（步驟見 MIGRATION_AND_ROLLOUT.md）。

---

## 2. 對應審閱六點

### (1) provider 旁路持續關閉、無迴避路徑
- `/auth/provider`、`/auth/provider/upgrade` 在 `fetch()` 邊界回 403（第一輪已做，本輪保留並由測試守住）。合法登入只走 `/auth/google/start → /auth/google/callback`（server 端驗證）。公開登入 JSON 不含 session token/cookie（`withSetCookie` 白名單）。
- 稽核：sync 相關的公開入口只有 `/api/sync`、`/api/qlive`，皆先過 `getCurrentUser`；沒有其他 router/controller 路徑會接受瀏覽器提供的身分建立 session。（provider controller 的服務層防禦縱深仍列為後續，見 §4。）

### (2) `/api/sync`、`/api/qlive` 讀寫皆以 session 擁有權
- 擁有者一律 `getCurrentUser(session).userId`；**從不**讀 payload/query 的 user_id 或短碼。
- 未登入 → 401（讀與寫皆是）。跨帳號不可能：只會存取 `ownerId` 命名空間的資料。
- 不用短碼證明擁有權；舊短碼 KV 路徑 fail closed（410）。非破壞式舊資料回復：本機資料不動，登入後用戶端把本機資料 push 到自己的帳號（不自動認領任何短碼）——見 MIGRATION_AND_ROLLOUT.md。

### (3) 權威寫入 + 一致性保證（非瀏覽器聯集、非 KV get/put）
- 改用 **D1（SQLite 交易）**：每次 push 是「單一 `db.batch([...])`」（D1 保證 all-or-nothing），逐筆 `INSERT … ON CONFLICT(user_id,kind,record_id) DO UPDATE`。
- 穩定 record_id（客戶端 `uid()`；缺 id 時由 `deriveRecordId` 以 ts+內容雜湊產生）。
- Idempotent（同 id 重送不重複）；**時間戳碰撞但 id 不同 → 兩筆都保留**；兩台裝置各自新增不同紀錄 → 聯集，**不會因較舊整包寫入而遺失**（逐筆 upsert，非整份覆寫）。
- 刪除語意：只新增、無 tombstone；省略某筆不會刪除它（明確聲明，不隱含支援）。

### (4) 端點 schema 驗證 + 配額，且不靜默丟棄
- `validateSyncDoc`：必為物件、非陣列、無 `error`；`ins` 必陣列、`quest.entries` 必陣列；單筆 ≤ 8KB、每類 ≤ 1000 筆、scalars ≤ 8KB；違反 → 400（不寫入）。
- qlive：非物件 → 400；過大 → 413。
- 用戶端：失敗回應/離線一律保留本機資料；本機寫入失敗（`sd()` 回 false）會在結帳/QUEST 存檔處**跳出提醒**，不把「畫面前進」當成「已保存」。

### (5) 真實 Worker 邊界行為測試（非 source-text 取代）
`test_sync_ownership_boundary.mjs`（`worker.default.fetch` + `node:sqlite` D1 + 假 KV + 真 guest session）**23/0**，涵蓋：
- 未登入讀/寫 → 401；`?code=` 舊旁路 → 401（非 KV 資料）；qlive 未登入 → 401。
- 擁有權：A 寫→讀回自己；**B 讀不到 A**；B 寫後 A 仍只見自己。
- 並行安全：兩裝置交錯（stale 整包寫入不刪對方紀錄）；idempotent 重送；**相同 ts 不同 id 兩筆都在**；缺 id 但相同 ts 不同內容兩筆都在。
- schema：陣列/error 物件/ins 非陣列 → 400；超大單筆 → 400 且未寫入。
- 31 筆 push → reload 讀回 31（無截斷）。
- quest+scalars round-trip；qlive owner-scoped（A 寫 B 讀不到）；qlive 非物件 400。
- 刪除語意：省略舊紀錄不會刪它。
- session-secret：guest 登入 JSON 無 token/cookie。
用戶端 `test_auth_sync_integrity.mjs` **35/0**（shape、聯集不遺失、cloudPull 對 401/500/body.ok=false/壞 shape/離線皆非破壞、sd 失敗回報、來源斷言）。

### (6) 附加式 migration/fixtures/指令，未套用
- 0008 staged（未進 `migrations/`、未 `wrangler d1 migrations apply`）。
- fixtures = 上述兩個可重跑測試；rollout/回滾/舊資料回復指令見 MIGRATION_AND_ROLLOUT.md。**未部署、未 drop/clear 任何資料、未授予權益。**

---

## 3. 測試結果（實際）
- `test_sync_ownership_boundary.mjs`：**23 passed / 0 failed**（真實 Worker 邊界）。
- `test_auth_sync_integrity.mjs`：**35 passed / 0 failed**（用戶端行為）。
- 既有回歸 17 套件（1.111–1.127，`PHASE1_REVIEW_NESTED=1`）：**0 失敗、12,094 斷言，未弱化任何斷言**（migration 計數閘門保持 7、未觸碰）。
- 語法：`node --check` worker.js/sync_store.js 皆過；`getHTML()` 內嵌腳本 + JSON island 解析皆過。

指令：
```
node backups/remediation-sync-ownership/test_sync_ownership_boundary.mjs
node backups/remediation-auth-sync/test_auth_sync_integrity.mjs
PHASE1_REVIEW_NESTED=1 node backups/phase7-task1.127-app-experience/test_app_experience_layer.mjs
```

---

## 4. 狀態分項（精確用語）
### A. 本地已驗證（Locally verified，真實 Worker 邊界）
- `/api/sync`、`/api/qlive` 讀寫皆需 session；未登入 401；跨帳號隔離。
- 逐筆 upsert 的並行安全（無 lost update）、idempotent、ts 碰撞安全、31 筆不截斷。
- schema/配額拒絕不靜默丟棄；用戶端失敗非破壞 + 本機失敗提醒。
- 舊短碼旁路 fail closed（401/410）；guest 登入 JSON 無機密。

### B. 仍待正式驗證（Live/production pending）
- 正式站 Google OAuth 登入後的 live 同步、真實兩裝置、正式 D1 上的行為（需部署 + 互動帳號 + 允許外網環境；本容器無法）。**未宣稱通過。**

### C. 尚未實作（Unfinished）
- provider 登入的 **service 層**防禦縱深（目前 HTTP 邊界已擋；service 層若被未來新呼叫端直接呼叫仍會信任 payload——建議改為只接受 server 驗證來源）。
- 真正的多寫入者「純量欄位」版本衝突 UI（逐筆紀錄已免衝突；scalars 用 version 記錄但未做互動式衝突解決）。
- 會員/Gemini 權益來源、UI/導覽/帳號 CTA、殘留啟動頁 emoji、載入效能——維持前述工作包。

### D. 部署決策（需你授權）
- 這批修正是獨立可上線的安全修補，但**未部署**。上線需：`git mv` 0008 進 `migrations/` + 更新 7→8 計數斷言 → `wrangler d1 migrations apply` → 記錄當前 active version 作回滾點 → `wrangler deploy`（詳見 MIGRATION_AND_ROLLOUT.md）。生產目前為 `62cf281f`。

**同步擁有權與並行寫入安全在本機/邊界已驗證，但在正式站部署與 live 驗證完成前，不宣稱「生產環境已完成」。**

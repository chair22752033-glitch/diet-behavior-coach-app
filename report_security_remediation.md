# 飲食主場秀 — 登入安全與資料完整性補強報告

**日期：** 2026-09-30
**分支：** `claude/wrangler-deploy-c821f3`
**基準：** 審查以 `fca0f26` 為準；本補強接續 HEAD `b1fecca`。
**授權範圍：** 本輪只做程式修正、提交與推送；**未部署、未改 D1 schema、未動正式使用者資料**（依指令：此審查請求本身不授權正式 schema 變更或發布）。
**驗證性質：** 假資料庫／記憶體 KV／模擬 localStorage／本地 dev server。**不等於正式站 OAuth 或攻擊驗收。**

本輪處理審查的 P0／P1（資料完整性）五項：登入信任邊界、同步不破壞資料、同步擁有權/衝突、歷史截斷、行為測試。UI/會員/Gemini/品牌等 P1(上線功能)與 P2 仍留待下一包（依指令保持本輪聚焦）。

---

## 1. 變更檔案
| 檔案 | 變更 |
| --- | --- |
| `src/worker.js` | ①HTTP dispatch 封鎖 `POST /auth/provider`、`/auth/provider/upgrade`（回 403 明確失敗）②`/api/sync`、`/api/qlive` 寫入前伺服器端驗證 JSON 物件 ③用戶端 `cloudPull/cloudPush/sd` 改為非破壞式＋加入 `isSyncShape/recKey/mergeRecords/mergeData` 合併 ④移除 `ins`／`quest.entries` 的靜默 `slice(0,30)` 截斷 |
| `src/routes/auth_routes.js` | `withSetCookie()` 從公開 JSON body 移除 `cookie` 字串與 `session.token`，僅保留 HttpOnly Set-Cookie 標頭 |
| `backups/remediation-auth-sync/test_auth_sync_integrity.mjs` | 新增 36 項行為測試（客戶端合併/非破壞/來源斷言） |

---

## 2. 根因與修法

### P0-1 登入入口未驗證 Google 身分所有權
- **根因：** 公開 `POST /auth/provider`（worker.js dispatch → `loginProviderController` → `loginWithProvider`）只驗證 provider 名稱與欄位非空（`auth_security_service.validateProviderIdentity`），**未證明呼叫端擁有該 Google 身分**；`/auth/provider/upgrade` 同樣信任 payload 的 provider pair。成功回應的 JSON 還同時帶 `session.token` 與 `cookie` 字串。
- **修法：** 在 HTTP 邊界（worker.js dispatch）對這兩條路徑一律回 `403 {ok:false,error:"direct_provider_login_disabled"}`，不再轉交 router。合法的 Google 登入走 `GET /auth/google/start → /auth/google/callback`（伺服器端驗證 state/code/profile 後才由 application service 呼叫 `loginWithProvider`），此路徑**完全不經過被封鎖的 controller，故不受影響**。`withSetCookie()` 改為只在 Set-Cookie 標頭放 session，JSON body 不再含 token/cookie。
- **本地重現/驗證（dev server, 實際 HTTP）：**
  - `POST /auth/provider {provider:"google",providerId:"victim-123"}` → **403** `direct_provider_login_disabled`（修前：200＋Set-Cookie＋session）。
  - `POST /auth/provider/upgrade` → **403**。
  - `GET /auth/google/start` → **302**（OAuth 入口保留）。
  - `POST /auth/guest` → `ok=true`、JSON **不含** `cookie` 欄位、**不含** `token`；Set-Cookie 標頭仍存在（1 個）。
- **防禦縱深備註（未在本輪改，建議下一包）：** `loginProviderController`/`loginWithProvider` 這層若被其他呼叫端直接呼叫仍會接受 payload 身分——目前唯一呼叫端是已封鎖的 HTTP dispatch。建議未來讓這層只接受由伺服器端注入（非瀏覽器可控）的「已驗證」來源標記（例如 OAuth callback 專用路徑），或改走伺服器驗證 ID token（驗簽章/audience/issuer/exp）。**不採用瀏覽器自帶的 verified 旗標。**

### P0-2 同步可能暴露或覆蓋資料
- **根因：** `cloudPull()` 未檢查 `res.ok`、未驗證結構，`if(d)` 會把任何真值（含 `{error:...}`）寫回 `diet_app_v1`；整包覆寫造成兩裝置資料遺失；伺服器 `POST /api/sync` 只檢查長度、接受非 JSON。`sd()` 吞掉本機寫入錯誤、`cloudPush()` 無成功/失敗回饋。
- **修法（用戶端，非破壞式）：** `cloudPull()` 先 `res.ok` 再 `res.text()`→`JSON.parse`；用 `isSyncShape()` 拒絕陣列/`error` 物件/`ins` 非陣列；只有合法結構才與本機 `mergeData()` 合併後保存並回推；任何 HTTP 錯誤、壞 JSON、error 物件、離線一律**保留本機原資料**並回報失敗。`sd()` 回傳本機寫入成敗；`cloudPush(d,cb)` 回報 HTTP 成敗。
- **修法（伺服器端寫入驗證）：** `/api/sync`、`/api/qlive` 的 POST 在 `KV.put` 前 `JSON.parse` 並要求為物件，否則 **400 `invalid json`**。
- **本地重現/驗證：**
  - dev server：`POST /api/sync` 非 JSON → **400**；陣列 → **400**；合法物件 → **200**；GET 回存值。
  - 客戶端測試（模擬 fetch/localStorage）：HTTP 400/500、200＋error 物件、200＋壞 JSON、離線 → 皆 `cb=false` 且**本機資料位元組不變**；200＋null → 種子上推、本機不變；200＋合法遠端 → 合併。

### P1-3 同步擁有權與衝突（本輪：資料安全合併；擁有權：提出遷移待審）
- **已實作（非破壞、向後相容）：** 以穩定鍵（`id` 或 `ts`）對 `ins` 與 `quest.entries` 做**聯集合併**（`mergeRecords`），避免「較舊整包寫入刪掉另一台新增」；本機既有純量欄位永不被遠端覆蓋，遠端獨有欄位僅在本機缺少時補入（加法式）。舊同步碼仍可用，**不自動宣告任何短碼為某帳號的所有權**。
- **驗證：** 兩裝置各新增一筆 → 合併後兩筆都在（newest-first、依 `ts` 去重）；quest.entries 亦聯集。
- **尚待實作（不在本授權範圍，提出供審）：** 真正的「已驗證擁有權」需把同步繫結到 D1 已登入 user（或伺服器產生的高熵、可撤銷配對憑證），並以能保證一致性的儲存流程取代 KV 的讀後覆寫（KV read-modify-write 非原子）。這需要**加法式** schema/流程（例如以 userId 命名空間、或 pairing 表），屬需審核的遷移，本輪**未執行**。

### P1-4 歷史 30 筆靜默截斷
- **根因：** `buildResult()` 用 `data.ins.slice(0,30)`、`qstSave()` 用 `data.quest.entries.slice(0,30)`，是保存前截短，第 31 筆完成後最舊一筆遺失。
- **修法：** 移除兩處截斷，完整保存所有紀錄；使用者文字/emoji 原樣保留；資料仍可經既有本機儲存/同步匯出。（顯示層分頁未加，歷史列目前完整列出；若日後要保留上限，應改為可恢復封存並明示。）
- **驗證（瀏覽器）：** 種子 30 筆 → 完成檢視 → `after=31`、reload 後仍 31，最舊未被刪。

---

## 3. 測試結果（實際）
- **新增行為測試** `backups/remediation-auth-sync/test_auth_sync_integrity.mjs`：**36 passed / 0 failed**。涵蓋：shape 驗證、兩裝置合併不遺失、去重、純量不覆蓋、cloudPull 對 400/500/error 物件/壞 JSON/離線的非破壞、null 種子、合法合併、`sd()` 本機失敗回報、來源斷言（403 區塊、JSON 驗證、截斷已移除、`withSetCookie` 去除 token/cookie、OAuth 路徑保留）、buildResult 不再截斷。
- **既有回歸** 17 套件（1.111–1.127，`PHASE1_REVIEW_NESTED=1`）：**全通過、0 失敗、12,074 斷言**（未弱化任何斷言）。
- **語法/前端：** `node --check` worker.js、auth_routes.js 皆過；`getHTML()` 內嵌腳本 `new Function()`、`<script id="D">` JSON island 皆過。
- **dev server 實際 HTTP：** 見 §2 各項（403 / 400 / 302 / 200 / 無 token 外洩）。
- **性質分界：** 以上皆為本地/模擬/dev。**未**進行正式站 OAuth 成功驗收，也**未**對正式帳號做攻擊驗證。

---

## 4. 資料相容性
- 未改 D1 schema、未跑 migration、未動 KV/R2/D1 現有內容。
- localStorage `diet_app_v1` 結構不變（仍 `{ft,ins,quest,...}`）；合併只做聯集，不刪既有欄位。
- 舊同步碼向後相容；伺服器新增的 JSON 驗證對既有用戶端（一律送 JSON 物件）無影響。
- `withSetCookie` 只調整 JSON body（移除機密），cookie 行為（HttpOnly Set-Cookie）不變。

---

## 5. 仍需的具體遷移／部署決策
1. **部署本補強**：本輪未獲發布授權。這些修正（登入邊界、同步非破壞、截斷移除）是獨立可上線的資料安全修補；如要上線需你明確授權後 `npx wrangler deploy`（生產目前為 `62cf281f`；回滾 `npx wrangler rollback 76174a30-2412-4828-984a-03a05c0618e4`）。
2. **同步擁有權硬化**：需決定「以 D1 已登入 user 綁定同步」或「伺服器產生高熵可撤銷配對碼」，並設計加法式 schema/流程與舊碼遷移。屬需審核的變更，未實作。
3. **防禦縱深**：是否進一步在 service 層要求伺服器驗證來源（見 §2 P0-1 備註）。

---

## 6. 狀態分項
### A. 本地已驗證（Locally verified）
- `/auth/provider(/upgrade)` 公開入口封鎖（403）、OAuth 入口保留、guest JSON 無 token/cookie（Set-Cookie 標頭保留）。
- 同步非破壞：HTTP 錯誤/壞 JSON/error 物件/離線不覆蓋本機；伺服器拒絕非 JSON 寫入（400）。
- 兩裝置合併不遺失；30→31 完整保存。
- 36 新行為測試 + 17 回歸（12,074）全綠，語法/JSON island 通過。

### B. 待正式驗證（Production verification pending）
- 正式站 Google OAuth 成功登入/登出、真實兩裝置同步、正式帳號下的 403 行為——需部署與互動帳號（本容器無法連外/無互動 OAuth）。

### C. 未完成實作（Unfinished implementation）
- 真正的「已驗證擁有權」同步與衝突一致性（需加法式 schema/pairing，待審）。
- Service 層防禦縱深（provider 身分只接受伺服器驗證來源）。
- 會員/Gemini 權益來源、UI/導覽/帳號 CTA、殘留啟動頁 emoji、載入效能——依指令留待下一工作包。

---

## 7. 本地重現
```bash
npx wrangler dev --port 8791 --ip 127.0.0.1
# 行為測試
node backups/remediation-auth-sync/test_auth_sync_integrity.mjs
# 回歸
PHASE1_REVIEW_NESTED=1 node backups/phase7-task1.127-app-experience/test_app_experience_layer.mjs
# HTTP 邊界
curl -i -X POST localhost:8791/auth/provider -H 'Content-Type: application/json' -d '{"provider":"google","providerId":"x"}'   # 403
curl -i -X POST 'localhost:8791/api/sync?code=abc123' --data 'not-json'                                                       # 400
```

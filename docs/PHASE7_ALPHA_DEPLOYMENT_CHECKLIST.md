# Phase 7 Alpha Deployment Checklist

Phase 7 TASK1.127｜Complete App Experience & UX Commercial Layer

> 本文件只是「部署前檢查清單」，**不會自動觸發任何部署動作**。
> 依規格明確要求："Do not deploy automatically"——實際執行
> `wrangler deploy`是人工決定，這份文件只負責讓那個決定有一份
> 可以逐項核對的依據。

## 0. 目前狀態摘要

- 這是本專案第一次準備正式部署到 Cloudflare Workers（Alpha
  階段），過去 TASK1.1~1.126 全部只在本機（`node`直接執行測試
  套件）驗證，從未實際跑過 `wrangler deploy`。
- Entry point：`src/worker.js`（見`wrangler.toml`的`main`欄位）。
- 目前對外掛載的路由總數：**27 條**（`src/routes/index.js`的
  `createAppRouter()`；`GET /health-insight`、
  `POST /api/health-insight`、`GET /api/health-insight/history`、
  `GET /app`、`GET /app/history`、`GET /app/me`是其中跟 Health
  Insight／App Shell 相關的 6 條）。

## 1. Wrangler 部署步驟

1. 確認本機已安裝正確版本的 `wrangler`（跟專案`package.json`裡
   宣告的版本一致，避免CLI跟`compatibility_date`不相容）。
2. `wrangler login`（或確認既有的 API Token/OAuth session 仍然
   有效）——**這一步不在本次任務範圍內自動執行**，需要人工持有
   帳號權限的人操作。
3. 檢查 `wrangler.toml`：
   - `name = "balance-diet"`——確認這是預期要部署的 Worker 名稱
     （不是誤植到別的專案）。
   - `account_id`——確認對應到正確的 Cloudflare 帳號。
   - `compatibility_date = "2026-07-25"`——部署前確認這個日期
     沒有引入非預期的 runtime 行為變化（例如 `Response`/`URL`
     polyfill 差異）。
4. 先跑一次 `wrangler deploy --dry-run`（或等效的本機建置檢查），
   確認沒有語法錯誤、沒有遺漏的binding。
5. 正式 `wrangler deploy` 前，先確認第2～6節的每一項都已勾選。
6. 部署完成後，先用一個**非正式流量**的測試帳號/瀏覽器手動走過
   第7節「Alpha上線後的手動驗收路徑」，確認沒有明顯錯誤，再考慮
   對外釋出連結。

## 2. D1 Migration 狀態

目前 `migrations/` 底下共 **7 個** `.sql` 檔案，依序：

| 檔案 | 內容 |
|---|---|
| `0001_phase1_task1_7_initial_schema.sql` | 初始schema |
| `0002_phase1_task1_8_seed_content.sql` | 種子內容 |
| `0003_phase1_task1_13a_sessions_table.sql` | `sessions`表 |
| `0004_phase1_task1_13b_users_identity.sql` | `users`身份欄位 |
| `0005_phase1_task1_16_import_log.sql` | Legacy匯入紀錄 |
| `0006_phase1_task1_34_auth_audit_logs.sql` | Auth稽核紀錄 |
| `0007_phase6_task1_120_health_insight_records.sql` | Health Insight持久化紀錄表 |

**本次 TASK1.127 沒有新增任何 migration**（規格明確要求：App
Shell/Navigation/Home/History/User Center 全部重用既有
`health_insight_records`表跟既有的`resolveHealthInsightIdentity()`
/`getHealthInsightHistoryForIdentity()`，完全沒有新增/修改任何
D1 schema）。

部署前檢查：

- [ ] 遠端 D1 資料庫（`database_id`:
      `9560446f-5d56-45e4-b605-ddec5cdf909f`）已經套用全部 7 個
      migration（`wrangler d1 migrations list <DATABASE_NAME>`
      確認沒有「pending」的項目）。
- [ ] 如果遠端 D1 是全新建立的資料庫，依序套用 0001～0007（不可
      跳過任何一個，`0004`/`0007`分別是`users.is_guest`欄位跟
      `health_insight_records`表的必要前置）。

## 3. OAuth Callback Checklist

Google OAuth 相關程式碼（`src/oauth/`、`src/routes/
auth_routes.js`的`GET /auth/google/callback`）**本次任務完全
沒有被修改**（規格明確禁止："Identity: OAuth system" must NOT
be modified）。部署前仍需要人工確認以下項目，因為這些是
Cloudflare/Google Cloud Console 端的設定，不是程式碼：

- [ ] Google Cloud Console 的 OAuth 用戶端「已授權的重新導向
      URI」清單裡，包含正式部署後的網域（例如
      `https://<worker-subdomain>.workers.dev/auth/google/
      callback`，或自訂網域的對應路徑）。
- [ ] `GOOGLE_REDIRECT_URI` 環境變數（見第4節）跟 Google Cloud
      Console 裡設定的重新導向 URI **逐字相符**（協定/網域/路徑
      任何一個字元不一致都會導致 OAuth 失敗）。
- [ ] Alpha 階段如果只開放內部測試帳號，確認 Google OAuth
      Consent Screen 的「測試使用者」清單已經包含所有預期的
      測試帳號 email（Google OAuth App如果還在「測試中」狀態，
      非測試使用者會被 Google 擋下，不會進到我們的
      callback）。
- [ ] 手動走一次完整登入流程（Guest登入 → 使用Health Insight →
      透過既有OAuth流程升級成Google帳號 → 確認`/app/me`顯示
      「已登入」狀態），確認`Set-Cookie`/session cookie在正式
      部署的網域下能正確設定跟讀回。

## 4. 環境變數 Checklist

依`src/config/app_config.js`/`src/worker.js`實際讀取到的環境
變數，部署前逐一確認 Cloudflare Workers 的 Secrets/Vars 都已
設定：

| 變數 | 類型 | 用途 | 必要性 |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Secret | Google OAuth用戶端ID | Google登入功能必要 |
| `GOOGLE_CLIENT_SECRET` | Secret | Google OAuth用戶端密鑰 | Google登入功能必要 |
| `GOOGLE_REDIRECT_URI` | Var | OAuth callback重新導向網址 | Google登入功能必要，需跟Console設定一致 |
| `GEMINI_API_KEY` | Secret | Gemini Enhancement Layer | 選填——沒有設定時`enhanceHealthInsightResult()`安全跳過，Health Insight本身不受影響（見TASK1.121既有Failure Isolation設計） |
| `APP_VERSION` | Var | 版本標示 | 選填 |
| `ENVIRONMENT` | Var | 環境標示（例如`alpha`/`production`） | 建議設定，方便未來區分環境行為 |
| `FEATURE_D1_ENABLED` | Var | Feature flag：是否啟用D1相關功能 | 依既有`app_config.js`預設值，Alpha建議明確設為啟用 |
| `FEATURE_AUTH_ENABLED` | Var | Feature flag：是否啟用Auth功能 | 同上 |
| `FEATURE_LEGACY_IMPORT_ENABLED` | Var | Feature flag：是否啟用Legacy匯入 | Alpha階段可視情況關閉 |
| `FEATURE_ROUTE_MIGRATION_ENABLED` | Var | Feature flag：Legacy Route Adapter | 目前`wrangler.toml`未設定，正式環境維持既有0%流量走新router的既定行為（見`src/bootstrap/route_gateway.js`），Health Insight/App Shell走的是`worker.js`裡明確的if區塊，不受這個flag影響 |

- [ ] 以上每一個變數都已經用 `wrangler secret put <NAME>`
      （機密值）或 `wrangler.toml` 的 `[vars]`（非機密值）正確
      設定在目標環境。
- [ ] `GEMINI_API_KEY`未設定時，手動確認`POST /api/health-insight`
      依然回傳`200`且`data`不含`enhancedExplanation`（Gemini
      降級路徑，TASK1.121/1.122既有行為）。

## 5. Gemini Secret Checklist

- [ ] `GEMINI_API_KEY`已透過`wrangler secret put GEMINI_API_KEY`
      設定（**不要**寫進`wrangler.toml`的明文`[vars]`，避免機密
      值進版本控制）。
- [ ] 確認這把金鑰只有Gemini Enhancement Layer
      （`src/intelligence/enhancement/gemini/`）會讀取——這個
      目錄本次任務（TASK1.127）完全沒有被修改，金鑰的讀取/
      使用方式維持TASK1.121既有實作。
- [ ] 確認金鑰額度/預算符合Alpha階段預期流量（Gemini
      Enhancement只有Premium tier會觸發，但目前
      `resolveMembershipState()`在沒有注入`lookupTier`時一律
      回傳`free`，所以Alpha階段**實際上不會有任何真實請求觸發
      Gemini呼叫**，可以視為低風險項目）。

## 6. 其他部署前檢查

- [ ] `wrangler.toml`裡的三個binding（`DIET_COACH_DB`/
      `SYNC_KV`/`DIET_COACH_IMAGES`）在目標Cloudflare帳號底下
      都已經建立好對應的實體資源（D1資料庫/KV namespace/R2
      bucket），`id`/`bucket_name`都指向正確的實體。
- [ ] 確認沒有任何`.dev.vars`或本機測試用的機密值被誤commit
      進版本控制。
- [ ] 執行一次全系列 Health Insight 回歸測試（`backups/
      phase6-task1.111-*`～`backups/phase7-task1.127-*`），確認
      部署前的程式碼狀態是「已知良好」的版本。

## 7. Alpha 上線後的手動驗收路徑

部署完成後，建議依序手動走過以下路徑（對應規格PART1~5的完整
App Experience Layer）：

1. 開啟 `/app`（匿名）→ 確認看到「開始了解自己的健康方向」
   歡迎文案跟四張功能入口卡片。
2. 點擊「健康洞察」→ 確認導向既有`/health-insight`頁面，完整
   走完Input Experience → 送出 → 看到Dashboard結果。
3. 回到`/app/history`（匿名/訪客）→ 確認看到「目前為體驗模式」
   引導文案，**沒有**任何紀錄外洩。
4. 透過既有Guest/Google登入流程登入 → 回到`/app`→ 確認歡迎
   文案變成「歡迎回來，看看你的健康歷程」（如果是Google帳號）。
5. 再次使用Health Insight → 回到`/app/history`→ 確認Google
   登入使用者能看到剛才那筆紀錄；如果是Guest帳號，確認依然
   看不到任何紀錄（TASK1.126既有Guest持久化邊界）。
6. 開啟`/app/me`→ 確認帳號狀態文案跟Premium佔位卡片正確顯示，
   佔位卡片**沒有**任何可以觸發付款的連結/按鈕。
7. 用手機瀏覽器（或DevTools裝置模擬）確認`/app`系列三個頁面在
   手機寬度下版面正常、底部導覽列不遮擋內容、單欄排版。

## 8. Rollback 程序

如果Alpha部署後發現嚴重問題：

1. **立即動作**：`wrangler rollback`（回到上一個已知良好的
   Worker版本），或重新`wrangler deploy`前一個commit的程式碼。
   Cloudflare Workers的部署是整個Worker script替換，沒有
   partial rollback的概念，所以rollback永遠是「換回上一個完整
   版本」。
2. **D1 Migration不需要rollback**：本次任務沒有新增/修改任何
   migration，回滾程式碼不會影響既有D1 schema/資料。
3. **確認影響範圍**：由於`/app`、`/app/history`、`/app/me`是
   全新路由，即使這三條路由本身有問題，也不會影響既有20條
   Auth/User/Data/Dashboard/Profile/Timeline/Legacy路由，也不會
   影響既有`/health-insight`、`POST /api/health-insight`、
   `GET /api/health-insight/history`三條路由（這四個檔案/既有
   路由本身完全沒有被本次任務修改內部邏輯，只有
   `src/worker.js`/`src/routes/index.js`新增了轉發用的if區塊/
   一行register）。
4. **Git層級rollback**：`git revert <TASK1.127的commit>`——因為
   本次任務沒有修改任何既有檔案的內部邏輯（只新增檔案＋在
   `worker.js`/`routes/index.js`新增純粹轉發的程式碼區塊），
   revert這個commit預期是乾淨、低風險的操作，回復到TASK1.126
   完成時的狀態。
5. **驗證rollback成功**：rollback後重新確認`app.router.routes.
   length`回到24（TASK1.126完成時的既有路由數），既有20條
   Auth/User/Data/Dashboard/Profile/Timeline路由跟既有3條Health
   Insight路由的回歸測試（`backups/phase6-task1.126-*`）全數
   通過。

---

_本文件為Alpha部署準備文件，不包含任何自動化部署腳本，也不會
被任何測試套件自動執行——它只是給實際操作`wrangler deploy`的
人一份可以逐項核對的清單。_

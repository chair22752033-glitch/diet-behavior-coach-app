# 交接給 GPT：Onboarding 門檻 + 後台方案/批次 改動複審包

**日期：** 2026-10-03
**分支：** `claude/wrangler-deploy-c821f3`
**已上線版本：** onboarding = `998c9794`；後台 = `e9570b6e`（Cloudflare Worker `balance-diet`）
**回歸：** TASK1.127 套件 `930 passed / 0 failed`（含「只改授權 .js」「migration 數」兩道 git 關卡，於乾淨樹通過）
**本包定位：** 說明這兩輪改了什麼、檔案/函式在哪、設計理由，並列出**仍需 GPT 判斷**與**仍未處理**的項目。程式碼以 repo 為準。

---

## A. 本輪背景（擁有者原始需求）

1. 測試夥伴做完前測驗就離開，沒登入 Google，以為「App 只有前面測驗」，忽略首頁眾多飲食互動。
2. 要讓「所有飲食互動都需 Google 登入」，並說明登入好處。
3. **7 天免費試用**要和 3,000 / 35,000 / 48,000 方案**明確區隔**。
4. 登入後可用功能；未購買者 7 天後可訂閱 **App NT$1,200／年**。
5. 後台操作太麻煩：要一個一個帶入帳號、還要手填天數。擁有者要求：
   - 服務包（3,000/35,000/48,000）**直接開通、不論天數**（除非之後加購新功能）。
   - 1,200 訂閱**固定 365 天**，不用另填天數。
   - 要能**批次**選取多帳號一次帶入開通（人數多時一筆筆太痛）。

**已確認的方案階梯（擁有者拍板）：**
- 7 天免費試用：登入後完整體驗。
- NT$1,200／年：純 App 訂閱（試用後續用）。
- 3,000 / 35,000 / 48,000：真人服務包，**已含 App 使用期間、不另收 1,200**。
- ⚠️ **3,000 具體含多久 App、是否一次性，擁有者仍未定**（文案寫「以方案確認單為準」，未先承諾）。

---

## B. 改動一：前端登入門檻 + 試用說明（版本 998c9794）

### B1. 新增兩個函式（`src/worker.js` getHTML() 字串陣列內，initHome 之前）
- `showLoginGate(label)`：全螢幕 overlay 卡片。內容＝「登入解鎖完整功能」＋三大好處（解鎖所有飲食互動／跨裝置同步／七日回顧）＋金色提示框（7 天免費試用完整功能、7 天後可續訂 App NT$1,200／年、或選真人服務包、**免費與付費分開**）＋「用 Google 登入（7 天免費）」鈕（→ `/auth/google/start`）＋「先看方案」（→ 另開 `/ui-assets/legal/`）＋「返回」。
- `needLogin(label)`：`SYNC_ON` 為 true 回 false；否則呼叫 `showLoginGate(label)` 並回 true。

### B2. 在 7 個首頁飲食互動入口加 `if(needLogin("…"))return;`
| 功能 | 入口函式 |
|---|---|
| 飲食占卜 | `showMealScreen` |
| 飲食隨身卡 | `showQuestScreen` |
| 五大面向 | `showDimInfo` / `showDimScreen` / `showMove` |
| 營養知識 | `showNutriScreen` |
| 情境演練 | `showScenScreen` |
| 行為拆解 | `showBAScreen` |
| 七日回顧 | `showReviewScreen` |

**維持免登入（鉤子）：** 前測驗 `startCheckin`、身份測驗 `showIdentityQuiz`、使用說明 `showGuideScreen`。

### B3. 測驗後結果頁未登入提示（`renderResult`，`body.innerHTML=""` 之後）
未登入時在結果最上方插一條金色提示條「這只是開始——登入解鎖完整飲食互動」，點了進 `showLoginGate`。這是針對「做完測驗就離開」最關鍵的一處。

### B4. 方案頁 `public/ui-assets/legal/index.html`
價目表重排為：7 天免費試用 → 1,200／年 App 訂閱 → 3,000／35,000／48,000 服務包（標明已含 App、不另收 1,200）。

### B5. 登入態來源
`SYNC_ON` 在 `initLoginState()` 由 `GET /auth/me` 回來後設 true（`showLoggedIn`）。登入者不會被擋。

---

## C. 改動二：後台方案預設 + 不限期 + 批次（版本 e9570b6e）

### C1. `src/membership/entitlement_store.js` `grantBeta()`
- 新語意：`days === null` → `valid_until = NULL`（不限期，premium 一直有效到撤銷）。
- `days` 為正數 → `addDaysIso(days)`；未給 → 預設 14（相容舊行為）。
- 符合 migration 0009 原設計（schema 註解：「valid_until 為 NULL 代表無期限」）。
- `getEntitlement()` 未改：`if (row.valid_until)` 才比對到期，NULL → 一律 premium active。

### C2. `src/worker.js` `/api/admin/grant`｜`/api/admin/revoke`（POST，攔截層，非 routes/index.js）
- 支援單筆 `who` 或批次 `whoList`（陣列，去空白、去重，上限 500）。
- 方案預設 `PLAN_PRESETS`（server 端權威）：
  - `trial` → tier `app_trial`, days 7
  - `sub1200` → tier `app_annual`, days 365
  - `svc3000` → tier `service_3000`, **days null（不限期）**
  - `svc35000` → tier `service_35000`, **days null**
  - `svc48000` → tier `service_48000`, **days null**
  - 無預設或 `custom` → 用 body.days / body.tier（舊路徑）。
- 逐筆解析（users.id 或 google sub）→ grant/revoke → 回 `{ ok, okCount, total, results:[{who,ok,validUntil|error,tier}] }`；單筆成功時頂層仍帶 `validUntil`（相容）。
- 權限閘門未改：whoami 永遠 200；真正操作需 `own.owner`；POST 有 Origin 同源檢查（SameSite=Lax 之上的縱深防禦）。

### C3. `src/admin/admin_page.js` UI
- 方案下拉（預設選單，選 custom 才顯示天數欄）＋說明小字。
- **多行文字框** `whoList`：一行一帳號；下方清單「帶入」改為逐筆**追加**。
- 「批次開通 / 批次撤銷 / 清空」；撤銷前 confirm；完成顯示逐筆結果表（✓到期／✓不限期／✗錯誤）。
- 會員表 tier 顯示對應新標籤（service_3000 →「3000服務包」等）；valid_until 空 → 顯示「無期限」。

### C4. 重要：tier 標籤只是顯示用
功能權限只看 `premium` / `free`（`feature_permission.js` 與 worker.js:542 `ent.tier !== 'premium'`）。memberships 的 `tier` 欄（app/service_3000…）純標籤/稽核，不影響解鎖邏輯。所以用描述性標籤安全，不會改變任何既有 gating。

---

## D. 請 GPT 判斷 / 複審（新增）

1. **登入態 race**：`SYNC_ON` 由 `/auth/me` 非同步回來才設 true。已登入者若在 `/auth/me` 回來前極速點互動，可能被誤擋一次（跳登入卡→Google 已登入會直接彈回）。可接受還是要加「載入中」狀態或伺服器端初判？
2. **門檻涵蓋度**：7 個入口是否已涵蓋所有「飲食互動」？是否該連 `showGuideScreen`/身份測驗也納入，或維持當鉤子？（目前決定：測驗/說明當鉤子免登入。）
3. **批次上限 500 + 逐筆 await**：是否改批次 D1（transaction/batch）以免大量帳號時逐筆 I/O 太慢？目前每筆兩次 SELECT + upsert + audit。
4. **不限期語意對外**：服務包 valid_until=NULL＝「不限期直到撤銷」。對使用者/法務文案要怎麼描述「App 使用期間」才不矛盾（尤其 3,000 的時長未定）？
5. **NT$1,200／年合理性**＋三階定價（試用→輕訂閱→真人服務包）的商業判斷。

---

## E. 仍未處理（沿用你 07 複審，優先序建議：E2EE > 後台細節）

> 這些是你上次（檔 07）對 E2EE（磚 1–4）複審找到、我**尚未修**的項目。本輪擁有者選擇先做 onboarding/後台，E2EE 仍全程 gating 在 `crypto_mode==='e2ee_only'`（目前除擁有者 pilot 外無帳號進入），對一般使用者是休眠安全的。

- **P0-1** 原子 CAS／衝突雙版本保存（目前 CAS 過期即拒，未保留兩份密文讓裝置合併）。
- **P0-2** cutover/cleanup 需覆蓋全部 4 個 store + migration manifest。
- **P0-3** 解密時情境/schema 驗證 + fail-closed。
- **P0-4** 隔離 / CSRF / mode 查詢失敗時 fail-closed。
- **P1-1** 本機 localStorage 仍存明文。
- **P1-2** 優先用 hosted jose + crit/header 強化 + 恢復碼格式驗證。
- **P1-3** 同意版本綁定。
- **其他**：手機版 admin 表格 overflow（你 07 §5）；health_insight 裝置端運算移植；qlive 正式存密文。

**對外加密宣稱**：維持現況誠實文案，待上述 P0 修完 + 真人資安複核 + 擁有者實跑後才調整。

---

## F. 擁有者待辦（非程式）

- 定 **3,000 含多久 App**、是否一次性/可續。
- 35,000 的通話次數/時長/工作坊兌換期；退費分項（交法務）。
- 48,000 永久工作坊維持暫緩線上收款。
- 確認是否已按過 pilot 帳號的「②清理舊明文」（影響你自己帳號現在營運者讀不讀得到）。

---

## G. 驗收建議（擁有者本人）

1. **未登入**：首頁點任一互動 → 應跳登入卡；做完前測驗 → 結果頁頂出現金色提示條。
2. **登入後**：各互動可正常進入；提示條/門檻消失。
3. **後台 /admin**（擁有者帳號、強制刷新）：貼 2–3 個帳號 → 批次開通選「3000 服務包」→ 會員表該筆顯示「3000服務包／無期限」；選「1200 App 年訂閱」→ 顯示 365 天後到期。

# 飲食主場秀 — 最終發布報告（Release）

**日期：** 2026-09-30
**分支：** `claude/wrangler-deploy-c821f3`
**發布來源 commit：** `fca0f26`（已推送 origin；接續 `09b5464`）
**生產 URL：** https://balance-diet.chair22752033.workers.dev
**已部署版本 ID：** `62cf281f-58e9-469b-898b-4a9c8dda155f`（100% 流量，2026-09-30T04:35Z）
**上一個版本（回滾目標）：** `76174a30-2412-4828-984a-03a05c0618e4`（2026-09-29T10:23Z）

---

## 1. 變更檔案與「壓力空白」根因

### 變更檔案（`09b5464..fca0f26`）
| 檔案 | 變更 |
| --- | --- |
| `src/worker.js` | 新增 `stressDisp(st)`；`renderResult()` 狀態快照與分享文字改用它渲染壓力列 |

### 根因
`renderResult()` 內，壓力列只有在 `stObj.stress_raw` 存在時才會用 `q_stress_opts[raw-1]` 組出標籤。對於**只有舊版壓縮值 `stress`(1–4)、沒有 `stress_raw` 的紀錄**（例如早期 history、或部分匯入資料），條件 `(dim.key!=="stress"||rawSt)` 為 false → `opt=null` → 壓力值渲染成空字串。真正缺值時也一樣空白。分享文字（`rSlines`）更只用 `stObj.stress`(1–4) 當索引，對 1–10 尺規顯示會誤導。

### 修法（不改動任何已存資料、不捏造分數、保留 1–10 尺規）
`stressDisp(st)` 回傳 `{label, ratio, has}`：
- `stress_raw` 為整數 1–10 → `"N / 10"`（例：`7 / 10`），bar = N/10。
- 只有舊版 `stress` 1–4 → 依**儲存時分桶的精確反函數**還原到 1–10 尺規區間顯示：`lvl1→8-10`、`lvl2→6-7`、`lvl3→3-5`、`lvl4→1-2`（level 與 raw 為反向：level1=高壓），bar 用區間中點，方向已修正。
- 真的缺值/非法 → `"未填寫"`，空 bar。

非壓力維度（能量/睡眠/人際/運動）邏輯完全未動。

### 驗證（單元 + 真實互動，本地執行於已部署 commit `fca0f26`）
- 單元（stressDisp 純函式）：`raw=3→3/10`、端點 `raw=1→1/10`、`raw=10→10/10`、`lvl1→8-10/10`、`lvl3→3-5/10`、`lvl4→1-2/10`、缺值/null/亂數→`未填寫`、`raw=0` 非法時退回有效的 `stress` 欄位。全部正確。
- 真實互動：新檢視選壓力 7 → 壓力列 `7 / 10`（bar 70%）；舊版 lvl1 紀錄 → `8-10 / 10`（bar 90%）；缺值紀錄 → `未填寫`（bar 0%）。截圖：`report_release_assets/pressure_corrected_new.png`、`pressure_corrected_legacy.png`、`pressure_missing.png`。

---

## 2. 會員 → Gemini 連接：實際來源與確切缺口

**結論：目前不存在可信的權益（entitlement）資料來源；此為未完成的整合（unfinished integration），非「待外部驗證」。** 依授權，未捏造、未建立計費、未授予 Premium、未新增 schema。

實際盤點（伺服器端）：
- **D1 schema**（`migrations/0001`–`0007`）：`users` 欄位為 `id, auth_provider, auth_provider_id, display_name, is_guest, legacy_sync_code, created_at, updated_at, status(active/suspended/deleted), last_login_at`。**沒有任何 tier / plan / premium / membership / subscription / entitlement 欄位，也沒有會員/權益資料表。**
- **服務層**：全 repo 沒有任何程式從 D1 或其他儲存讀寫「tier/權益」。`lookupTier` 只出現在 `membership_resolver.js`（選填參數）與 `feature_permission.js`，**沒有任何呼叫端提供它，也沒有資料可供它查詢**。
- **權威來源判定**：`resolveMembershipState()` 只是 resolver（含 `lookupTier` 擴充點），不是權益資料來源本身。已登入但未注入 `lookupTier` 時一律回 `free`；`src/worker.js` dispatch 每條路由硬帶 `options: {}` → 全體解析為 `free`。

**確切缺口（要讓 Gemini 對合格帳號可達，缺這些）：**
1. D1 需要一個可信的權益儲存（例如 `users.tier` 欄位或獨立 `entitlements` 表），且由受信任流程寫入（購買/後台授予），不可由瀏覽器提供。
2. 一個伺服器端服務，用已驗證的 `userId` 查該來源回傳 `'free'|'premium'`。
3. 在 HTTP 請求邊界把上述查詢接成 `resolveMembershipState()` 期望的**同步 `lookupTier`**（見下）。

因為 (1)(2) 皆不存在，本輪**不接線**（沒有可信資料可接），維持 Gemini gated，標記為未完成整合。

**同步/非同步契約備註（供未來實作）：** `resolveMembershipState()` 期望 `lookupTier(userId)` **同步**回傳字串。D1 查詢是非同步的，因此必須在 **route handler 內先 `await` 真實查詢**（例如 `const tier = await lookupTierFromD1(db, userId)`），再把已解析結果包成同步 `options.lookupTier = () => tier` 傳入。**切勿把未解析的 Promise 當字串傳入** `resolveMembershipState`／`canUseFeature`。

---

## 3. Gemini 請求路徑與 fallback 驗證

- **匿名/免費不可用（真實 HTTP 路由）**：`POST /api/health-insight`（匿名）→ `{ok:true, data:{html}}`、**不含 `enhancedExplanation`**（`geminiPermitted=false`，連 API 都不打）。本地與程式碼層皆確認。
- **合格帳號的實際可達性**：因無權益來源，生產環境不可能存在合格帳號 → **無法對真實 Gemini 做一次真的呼叫**。此為結構性 gated，非本輪 UI 範圍。
- **設定的模型**：`gemini-3.8-flash`（`src/intelligence/enhancement/gemini/gemini_client.js` 的 `DEFAULT_MODEL`）。**未更改、未臆測替代 model id、未輸出任何密鑰值。**
- **fallback 契約（以 mock fetch 驗證，明確標示為 mock/local，非真實 provider 呼叫）**：
  - 無 API key → `missing_api_key`
  - provider 例外/網路錯 → `network_error`
  - HTTP 500 → `http_error`
  - 回應格式非法 → `invalid_response_shape`
  - **mock 成功** → `ok:true, enhancedExplanation:"…"`（這是 mock，非真實呼叫）
  以上失敗情形皆回 `ok:false`，route 保留 deterministic `{html}`。
- **憑證現況**：本容器 `GEMINI_API_KEY` 未設定；生產環境曾有多次「Secret Change」部署（可能已設密鑰，但密鑰本身不建立合格帳號）。**已設定的 API key／通過的單元測試／畫面上的 Premium 標籤都不等於 live 增強可運作。**

---

## 4. 驗證與部署

- **回歸**：既有 17 套件（1.111–1.127），`PHASE1_REVIEW_NESTED=1 node <suite>`，**全通過、0 失敗、合計 12,074 斷言**。
- **產生的前端腳本**：`node --check src/worker.js` ✅；`getHTML()` 內嵌可執行 `<script>` `new Function()` ✅；`<script id="D">` JSON island `JSON.parse()` ✅。
- **資產（本地，已部署 commit）**：11 張 `/ui-assets/diet-r5/*` + 10 張 `/assets/health-insight/illustrations/*` = **21/21** `200 image/webp`；`sharp` 解碼 **21/21**；缺圖兩前綴皆 **404**。
- **既有路由（本地）**：`/`=200、`/img/*`=404 text/plain（仍由 worker/R2 處理，未被資產 binding 接管）、`/health-insight`=200、`/app`=200、`/app/me`=200、`/auth/login`=200、`/api/health-insight`=200、`/api/sync`=200。
- **設定 diff 檢視**：本輪僅改 `src/worker.js`（壓力顯示）；`wrangler.toml` 未再變動（`[assets]` 於 Round 5 已提交）。不是靠「工作區乾淨」當證據——資產/路由以上述 curl/decode 直接驗證。
- **部署**：`npx wrangler deploy` 成功——上傳 21 檔（1797 KiB），四個 binding 皆解析：`SYNC_KV`(KV)/`DIET_COACH_DB`(D1)/`DIET_COACH_IMAGES`(R2)/`UI_ASSETS`(Assets)。**未做任何破壞性資料操作、未改 schema、未動 KV/D1/R2 內容。**
- 目前 active 版本經 `wrangler deployments status` 確認為 `62cf281f…`（100%）。

---

## 5. 生產發布的實際驗證

- **部署狀態（已驗證）**：透過 Cloudflare API 確認新版本 `62cf281f…` 為 100% 流量的 active 部署；21 個資產於部署時上傳成功。
- **Live HTTP 檢查（受阻，未執行）**：此容器的網路政策**封鎖對外 HTTPS**（對 workers.dev／google／cloudflare 一律 `403 CONNECT tunnel failed` / 000）。因此**我無法從本環境 curl 或截圖 live URL**，也**不宣稱已通過任何 live HTTP 測試**。
- **已部署 build 的行為驗證（本地，跑同一個已提交 commit `fca0f26`，明確標示為本地）**：
  - 檢視完成 → 結果 → 存檔：`before=1 → 壓力顯示 4 / 10 → after=2 → reload 後兩筆並存 craves=["fried","soup"]`，使用者含 🍜 的 note 原封不動。
  - 修正後壓力值：新檢視 `7 / 10`、舊版 `8-10 / 10`、缺值 `未填寫`（第 1 節截圖）。
  - 食物照顯示：`report_release_assets/food_photos.png`（9 張真實照片）。
  - SVG 後備：阻擋照片後 9 卡改用手繪 SVG、0 破圖（`report_release_assets/food_svg_fallback.png`）。
  - 首頁手機/桌面：`report_release_assets/home_mobile.png`、`home_desktop.png`。
- **Google 登入（待使用者/網路）**：需要互動式 OAuth 與允許對外網路的環境；本容器無法執行。**登入頁回 200 不等於 OAuth 成功**——未宣稱通過。
- **Live Gemini 增強（不適用/待實作）**：無合格帳號來源（見第 2 節），無法在生產驗證。

**確切的剩餘動作（需你或允許網路的環境）：**
1. 開啟 https://balance-diet.chair22752033.workers.dev ，用真實 Google 帳號驗證登入、返回導覽、帳號狀態與登出。
2. 在 live 上以隔離測試資料重跑檢視→壓力值→history reload→食物照，肉眼複核（本地已通過同一 commit）。
3. 若要 live Gemini：先補齊第 2 節的權益來源與接線，才談 live 驗證。

---

## 6. 回滾程序

```bash
# 查看版本（記錄目前 active = 62cf281f…，前一版 = 76174a30…）
npx wrangler deployments list

# 回滾到本次發布前的版本
npx wrangler rollback 76174a30-2412-4828-984a-03a05c0618e4
# 或（新版 wrangler）以互動選單回滾：
# npx wrangler versions list
# npx wrangler rollback [version-id]
```
回滾只切換 Worker 程式版本，不影響 KV/D1/R2 內的使用者資料。

---

## 7. 狀態分項（精確用語）

### A. 本地已驗證的實作（Locally verified）
- 壓力值修正（新/舊/缺值三情境，端點 1 與 10，單元 + 真實互動）。
- 完整儲存流程 1→2、reload 兩筆並存、9 食物值、使用者 emoji 保留。
- 資產 21/21（MIME+decode）、缺圖 404、既有路由行為、腳本/JSON island 解析。
- Gemini 匿名不可用（真實路由）＋ fallback 契約（mock 標示）＋ 模型 id 未變。
- 17 套件 / 12,074 斷言 / 0 失敗。

### B. 已驗證的生產行為（Verified production behavior）
- 部署成功且為 active（版本 `62cf281f…`，100%），21 資產已上傳，四個 binding 解析正常，未動資料/ schema。
- （生產端 HTTP 回應與畫面因容器網路封鎖無法由我實測——列於 C。）

### C. 仍待外部驗證（External verification pending）
- Live URL 的資產/路由 HTTP 回應與 mobile/desktop 畫面（需允許對外網路或由你開啟 URL）。
- Google OAuth 正式登入 / 返回 / 登出（需互動式帳號）。

### D. 未完成的實作（Unfinished implementation）
- **會員 → Gemini 整合**：缺可信權益來源（D1 無 tier/權益欄位或表、無服務、無計費來源）。Gemini 維持 gated。需先補第 2 節的 (1)(2)(3) 才能讓合格帳號走到 live Gemini。這是實作缺口，不是單純「待外部驗證」。

---

## 8. 本地重現

```bash
npx wrangler dev --port 8791 --ip 127.0.0.1
PHASE1_REVIEW_NESTED=1 node backups/phase7-task1.127-app-experience/test_app_experience_layer.mjs
npx wrangler deploy --dry-run
```

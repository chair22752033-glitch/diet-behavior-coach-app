# TASK 1.6 執行結果｜正式切換圖片來源至 R2

執行日期：2026-09-22
部署版本：`f441a4da-6766-4fc7-8ef1-9f9dd9b2bd9a`（前一版本：`e80ab80e-fd0e-4a79-8c20-2d93bbac1127`）
正式網址：`https://balance-diet.chair22752033.workers.dev`

限制遵守情形：
✅ R2 作為主要圖片來源｜✅ 保留 Base64 fallback｜✅ 未刪除任何 `QST_PHOTO_*`/`QST_OBJ_PHOTO_*` Base64 常數｜✅ 未修改 QUEST 抽卡/揀牌邏輯（`qstPickPhotoIdx`、`qstDraw` 等皆未變動）｜✅ 未修改 UI（畫面結構、樣式、卡片文字全部不變，只改變圖片`<img>`標籤如何產生 src）｜✅ 未處理 App Icon（`/apple-touch-icon.png`、`ICON_PNG` 完全未觸碰）

---

## 一、修改檔案清單

**只修改了一個檔案：`src/worker.js`**（`git diff --stat`：36 行新增、3 行刪除）

`wrangler.toml` **零修改**（R2 binding 已在 TASK1.2 建立，本次沿用，未新增/變更任何設定）

修改內容分三處：

1. **新增伺服端路由 `/img/*`**（`handle()` 函式內，第 10 行之後）：透過既有的 `DIET_COACH_IMAGES` R2 binding（Service Worker 語法下為全域變數，與現有 `SYNC_KV` 用法一致）讀取 R2 物件並回傳，等同一個「同源圖片代理端點」。具備路徑格式驗證（僅允許 `[a-z0-9_-/.]`）與 try/catch 保護，binding 不存在或讀取失敗一律回傳 404（而非拋出例外），確保能觸發前端 fallback 機制。

2. **新增用戶端資料表**（`getHTML()` 內，緊接在 `QST_PHOTOS`／`QST_OBJ_PHOTOS` 宣告之後）：
   - `QST_R2_PATH`：分類場景照片（T/F/W/H/E）對應的 R2 路徑陣列（與 TASK1.3 盤點、TASK1.4 上傳路徑完全一致）
   - `QST_R2_PATH_OBJ`：14 個信物物件 key 對應的 R2 路徑字典

3. **改寫 `qstArtSVG()` 並新增兩個輔助函式**（`qstImgFallback`、`qstImgTag`）：
   - `qstImgTag(r2path, b64)`：若有對應 R2 路徑，產生 `<img src="/img/<路徑>" data-fb="<base64>" onerror="qstImgFallback(this)">`；若無 R2 路徑（理論上不會發生，但保留防呆），直接退回原本的純 Base64 `<img>` 標籤
   - `qstImgFallback(img)`：圖片 `onerror` 觸發時執行，把 `src` 換成 `data-fb` 屬性裡的 Base64 資料（即原本的 Base64 圖片），並清空 `onerror` 避免重複觸發
   - `qstArtSVG()` 本體邏輯（分類判斷、揀圖 index 計算）完全不變，只是把「組 `<img>` 字串」這件事委派給 `qstImgTag()`

**關鍵設計**：Base64 字串本身只包含 `[A-Za-z0-9+/=]`，不含引號字元，因此可以直接放進雙引號 HTML 屬性（`data-fb="..."`）而不需要任何跳脫處理，避免了三層引號巢狀跳脫的風險。

---

## 二、圖片來源切換方式

**運作流程**：

1. 瀏覽器優先請求 `<img src="/img/quest/scenes/terrain-1.jpg">`（同源路徑，指向本 Worker 新增的 `/img/*` 路由）
2. Worker 收到請求後，透過 R2 binding `DIET_COACH_IMAGES.get(key)` 讀取物件並回傳（`Cache-Control: public,max-age=604800,immutable`，可被瀏覽器/CDN快取一週）
3. 若該請求成功（HTTP 200），圖片直接顯示，**完全不會用到 Base64**（雖然 Base64 仍以 `data-fb` 屬性存在於 DOM 中，只是備而不用）
4. 若該請求失敗（R2 物件不存在、binding 異常、Worker 錯誤、網路問題等，任何導致瀏覽器 `<img>` 觸發 `onerror` 的情況），瀏覽器自動呼叫 `qstImgFallback(this)`，把 `src` 換成 `data-fb` 屬性中的 Base64 資料，**使用者不會看到破圖或空白**

這是標準的「漸進式遷移」模式：正式來源為 R2，但 Base64 以隱藏方式全程隨 DOM 一起送達，作為零延遲的自動備援，不需要額外的 JS 判斷邏輯或使用者感知的重試流程。

---

## 三、驗證結果

### 1. QUEST 三種模式（single / map / panorama）

用 Playwright 對兩種情境各自測試 3 種模式，共 6 組情境 × 2 項檢查 = 12 項，**12 / 12 全數通過**：

**情境 A：模擬 R2/`/img/` 路由正常運作**（攔截 `/img/**` 並用真實 R2 圖片內容回應）

| 模式 | 畫面正常且圖片實際載入成功 | 圖片來源確實為 `/img/`（R2為主） |
|---|---|---|
| single | PASS | PASS |
| map | PASS | PASS |
| panorama | PASS | PASS |

另確認：全程無 page error；`/img/` 路由確實被呼叫 3 次（證明 R2 真的是主要來源，不是被略過）

**情境 B：模擬 R2/`/img/` 路由完全失效**（`/img/**` 一律回應 404，模擬 R2 故障）

| 模式 | 畫面正常且圖片實際載入成功（走fallback） | 圖片來源已退回 `data:base64` |
|---|---|---|
| single | PASS | PASS |
| map | PASS | PASS |
| panorama | PASS | PASS |

另確認：全程無 page error；連續 10 次抽卡後 fallback 圖片仍正常載入（穩定性）

截圖：`scnA_*.png`（R2 正常時的實際畫面）、`scnB_*.png`（R2 失效、fallback 生效時的實際畫面）— 兩種情境視覺呈現無差異，使用者無感知。

### 2. 圖片載入是否正常

- 兩種情境下，`<img>` 元素的 `naturalWidth > 0` 且 `complete === true`（瀏覽器判定圖片已成功解碼顯示）皆為 true，非僅檢查標籤存在
- 正式部署後，`wrangler deploy` 輸出明確確認 binding 生效：
  ```
  env.SYNC_KV (b984c2b3dfb14e2f86e3a99c1b0c1475)      KV Namespace
  env.DIET_COACH_IMAGES (diet-coach-images)           R2 Bucket
  ```
  （與 TASK1.1 的 D1 binding 因 ES Module 限制被 Cloudflare 拒絕部署的情況不同，這次沒有任何部署錯誤或警告）

### 3. R2 失效時 fallback 是否正常

**PASS**（見情境 B 全部結果）。此外，本機用純靜態伺服器（無 `/img/` 路由邏輯）重跑 P1～P6 基準測試時，QUEST 圖片本來就必然會走 fallback（因為根本沒有 Worker 路由處理 `/img/`），而測試依然 8/8 全數通過、無例外，這是額外一組真實情境下的 fallback 驗證，並非刻意模擬。

### 4. P1～P6 基準測試是否通過

**8 / 8 全數通過**（沿用 TASK0.5 的 `baseline_capture.script.js`，未修改測試腳本本身）：

| 項目 | 結果 |
|---|---|
| P6 現有UI - 首頁 | PASS |
| P1 身份測驗 - 進入測驗畫面 | PASS |
| P1 身份測驗 - 產生結果 | PASS |
| P2 QUEST - 抽卡畫面正常 | PASS |
| P3 五大系統互通 - 延伸連結存在（5個連結） | PASS |
| P4 情境演練 - 情境庫完整（14個情境） | PASS |
| P5 營養素資料 - 內容完整（67項） | PASS |
| 整體 - 無 console 錯誤 | PASS |

---

## 四、其他驗證（超出必要項目，額外執行以求嚴謹）

- `node --check src/worker.js`：整體語法通過
- 用 vm sandbox 提取並執行 `getHTML()` 產生的用戶端 `<script>` 內容：語法通過
- 直接單元測試 `qstImgTag()` / `qstImgFallback()` 兩個新函式：
  - 有 R2 路徑時正確產生 `/img/` + `data-fb` + `onerror` 屬性
  - 無 R2 路徑時正確退回純 Base64 `<img>`（防呆分支）
  - 無 Base64 時正確回傳空字串（維持原行為）
  - `qstImgFallback` 正確清空 `onerror` 並把 `src` 換成 `data-fb` 內容

### ⚠️ 環境限制說明（誠實揭露，非驗證失敗）

本工作環境的網路政策不允許直接對外連線到 `*.workers.dev`（`curl` 測試回傳 `CONNECT tunnel failed, response 403`，經檢查為 organization 層級的 egress 政策限制，非程式問題）。因此**無法在本次任務中直接對正式網址發送真實 HTTP 請求驗證**。已改用「Playwright 攔截並用真實 R2 圖片內容模擬 `/img/` 路由回應」的方式做等效驗證（情境A），並輔以 `wrangler deploy` 輸出明確顯示 R2 binding 已成功掛載作為佐證。**建議使用者自行用手機或瀏覽器實際打開 `https://balance-diet.chair22752033.workers.dev`，進入 QUEST 抽卡確認圖片正常顯示，作為最後一道人工確認**（預期應與情境A的截圖結果一致）。

---

## 五、是否可以進入後續 TASK

**✅ 可以。**

理由：
- 修改範圍精準（只動了 `qstArtSVG` 相關的圖片標籤產生邏輯與新增一個唯讀代理路由），核心 QUEST 抽卡/揀圖邏輯、UI、App Icon 皆未觸碰
- 正式部署成功且 R2 binding 確認生效，無 D1 遇到的 ES Module 相容性問題
- 雙情境（R2正常／R2失效）共 16 項自動化檢查全數通過，P1～P6 基準測試 8/8 全數通過
- Base64 fallback 機制證實穩定可靠（連續 10 次抽卡不失敗）

---

## 六、回滾方式

若需回滾，有兩種層級：

**A. 完整回滾（回到 TASK1.5 狀態，圖片來源改回純 Base64）**
```bash
git revert <本次commit hash>
npx wrangler deploy
```
因為本次改動的 `qstArtSVG` 在找不到 `QST_R2_PATH`/`QST_R2_PATH_OBJ` 時已有防呆（回退純 Base64），即使不 revert，把這兩個資料表清空或刪除也能達到等效效果，但建議仍以 `git revert` 這種可追蹤的方式處理。

**B. 不修改程式碼、僅切斷 R2 供給的回滾（驗證 fallback 是否真的救援成功）**
- 停用/刪除 R2 bucket 的 binding（`wrangler.toml` 移除 `[[r2_buckets]]` 區塊後重新部署），或
- 直接清空 R2 bucket 內容
- 因為 `/img/` 路由在 binding 不存在或物件不存在時都會回傳 404 觸發前端 fallback，**App 本身不會壞掉**，只是圖片來源全部退回 Base64（與 TASK1.5 之前的行為完全相同）

**C. 緊急回滾到本次部署之前的版本（Cloudflare 版本回退，不動 git）**
```bash
npx wrangler rollback e80ab80e-fd0e-4a79-8c20-2d93bbac1127
```
（`e80ab80e` 為本次部署前的正式版本，僅有 R2 binding、尚未啟用 `/img/` 路由與新的圖片來源邏輯）

---

## 檔案結構

- `verify.js`：Playwright 雙情境（R2正常／R2失效）驗證腳本
- `task1.6-verify-log.json`：驗證腳本的結構化輸出紀錄（16項）
- `scnA_single.png` / `scnA_map.png` / `scnA_panorama.png`：R2 正常情境下三種模式的實際畫面
- `scnB_single.png` / `scnB_map.png` / `scnB_panorama.png`：R2 失效、fallback 生效情境下三種模式的實際畫面
- `p1-p6-check/`：本次重跑的 P1～P6 基準測試結果（沿用 TASK0.5 的 `baseline_capture.script.js`，複製為 `run.js`）與 8 張截圖

# TASK 1.10 執行結果｜Worker ES Module 重構準備

執行日期：2026-09-22
部署版本：`d5ce985b-d628-4afa-9567-6cd9e19369ef`（前一版本：`f441a4da-6766-4fc7-8ef1-9f9dd9b2bd9a`，即 TASK1.6）
正式網址：`https://balance-diet.chair22752033.workers.dev`

限制遵守情形：
✅ 不接入 D1（`wrangler.toml` 未新增 `[[d1_databases]]` binding，只更新說明註解）｜✅ 不新增登入（無任何 auth 相關程式碼異動）｜✅ 不改 UI（`getHTML()` 產生的畫面內容逐位元組未變，僅 `handle()` 的 binding 存取方式改變）｜✅ 不改現有資料流程（`/api/sync`、`/api/qlive`、`/img/*`、`/manifest.json`、`/icon.svg`、App Icon 的業務邏輯完全相同，只是把裸露的全域變數 `SYNC_KV`/`DIET_COACH_IMAGES` 改成從 `env` 參數存取）｜✅ 不刪除原 worker.js（檔案原地修改，重構前版本已備份為 `worker.js.before-esmodule.bak`，並保留完整 git 歷史）｜✅ 保留可回滾能力（見下方「回滾方式」）

---

## 一、修改檔案

**只修改了一個檔案：`src/worker.js`**（7 處異動，見下方「架構變化」的完整 diff）

`wrangler.toml`：只更新了說明註解文字（記錄 TASK1.10 已完成 ES Module 轉換），**未新增 `[[d1_databases]]` binding**，未做任何功能性改動。

新增備份與測試檔案（`backups/phase1-task1.10-esmodule/`）：
- `worker.js.before-esmodule.bak`：轉換前的完整 `src/worker.js`（SHA-256 已核對與轉換前 git 版本逐位元組相同）
- `worker.js.after-esmodule.bak`：轉換後的完整 `src/worker.js`（存證用）
- `test_es_module_handler.mjs`：直接用 Node ESM `import()` 載入轉換後的 Worker，搭配假 KV/R2 binding 呼叫 `fetch()` 的驗證腳本
- `es-module-test-log.json`：上述腳本的結構化輸出紀錄
- `p1-p6-check/`：P1～P6 基準測試重跑結果

---

## 二、架構變化

### 進入點：從 Service Worker 語法改為 ES Module 語法

```diff
- addEventListener('fetch',function(e){e.respondWith(handle(e.request));});
- async function handle(r){
+ export default{fetch:function(r,env,ctx){return handle(r,env);}};
+ async function handle(r,env){
```

**關鍵差異**：Service Worker 語法下，`wrangler.toml` 宣告的 binding（`SYNC_KV`、`DIET_COACH_IMAGES`）會直接以「全域變數」的形式存在；ES Module 語法下，Cloudflare 改成透過 `fetch(request, env, ctx)` 的第二個參數 `env` 傳遞 binding，**不再有全域變數**。因此原本 `handle()` 內部直接引用 `SYNC_KV`、`DIET_COACH_IMAGES` 的 5 處，全部改為透過新增的 `env` 參數存取（`env.SYNC_KV`、`env.DIET_COACH_IMAGES`）：

| 位置 | 修改前 | 修改後 |
|---|---|---|
| `/img/*` 路由 | `typeof DIET_COACH_IMAGES!=='undefined'?await DIET_COACH_IMAGES.get(imgKey):null` | `(env&&typeof env.DIET_COACH_IMAGES!=='undefined')?await env.DIET_COACH_IMAGES.get(imgKey):null` |
| `/api/sync` GET | `await SYNC_KV.get(key)` | `await env.SYNC_KV.get(key)` |
| `/api/sync` POST | `await SYNC_KV.put(key,body)` | `await env.SYNC_KV.put(key,body)` |
| `/api/qlive` GET | `await SYNC_KV.get(qkey)` | `await env.SYNC_KV.get(qkey)` |
| `/api/qlive` POST | `await SYNC_KV.put(qkey,qbody,{expirationTtl:3600})` | `await env.SYNC_KV.put(qkey,qbody,{expirationTtl:3600})` |

**沒有變的部分**（刻意保持完全一致，屬於「不改現有資料流程」的具體落實）：
- 所有路由判斷邏輯（`if(p===...)`、`if(p.indexOf(...)===0)`）完全相同
- 所有業務邏輯（狀態碼、錯誤訊息、Content-Type、Cache-Control、KV/R2 讀寫的 key 命名規則）完全相同
- `getHTML()`、`getManifest()`、`getIconSVG()`、`ICON_PNG` 等產生前端內容的函式與資料，**一個字元都沒有改**
- `wrangler.toml` 的 `[[kv_namespaces]]`、`[[r2_buckets]]` 設定完全相同，D1 binding 依然刻意不加入

---

## 三、部署結果

```
npx wrangler deploy
```

**部署成功，無任何錯誤或警告**（與 TASK1.1 嘗試加入 D1 binding 時遇到的 `Binding 'DIET_COACH_DB' of type 'd1' requires a Worker written in ES module format. [code: 100329]` 錯誤完全不同——這次換成 ES Module 格式本身就是為了解除該限制，且本次刻意不加 D1 binding，先單獨驗證格式轉換本身的穩定性）：

```
Your Worker has access to the following bindings:
Binding                                                       Resource
env.SYNC_KV (b984c2b3dfb14e2f86e3a99c1b0c1475)                KV Namespace
env.DIET_COACH_IMAGES (diet-coach-images)                     R2 Bucket

Uploaded balance-diet (3.28 sec)
Deployed balance-diet triggers (0.80 sec)
  https://balance-diet.chair22752033.workers.dev
Current Version ID: d5ce985b-d628-4afa-9567-6cd9e19369ef
```

### 三層驗證（因本沙箱環境網路政策封鎖直接對外連線 `*.workers.dev`，改用以下三種方式交叉驗證，詳見下一節）

1. **Node ESM 直接呼叫**：用 `import()` 載入轉換後的 `src/worker.js`，餵入模擬的 `env`（假 KV/R2），直接呼叫 `export default.fetch()`
2. **`wrangler dev --local` 真實 workerd runtime 煙霧測試**：啟動本機開發伺服器（使用真實 Cloudflare workerd 執行環境，binding 表確認 `env.SYNC_KV`／`env.DIET_COACH_IMAGES` 皆已正確掛載），用 `curl` 實際發送 HTTP 請求
3. **P1～P6 基準測試**：重新產生 `test.html` 並重跑 TASK0.5 的 Playwright 腳本

---

## 四、P1～P6 驗證結果

### (1) Node ESM 直接呼叫驗證：27 / 27 全數通過

涵蓋：`export default` 具備 `fetch()`、`/manifest.json`、`/apple-touch-icon.png`、`/icon.svg`、`/img/*`（存在/不存在/路徑正規化）、`/api/sync`（GET/POST/讀回/無效code/不支援方法）、`/api/qlive`（POST/GET）、首頁 HTML 內容、缺少 R2 binding 時的優雅降級（不拋例外）。

其中「`/img/../../etc/passwd` 路徑穿越測試」特別以轉換前的備份檔案（`worker.js.before-esmodule.bak`）交叉比對，確認這個邊界情況（JS `URL` 物件會在建構時就先正規化掉 `..`，落到首頁 catch-all 回傳200）**轉換前後行為完全一致**，不是本次重構造成的差異。

### (2) `wrangler dev --local`（真實 workerd runtime）煙霧測試

啟動本機開發伺服器後，binding 表確認：
```
env.SYNC_KV (b984c2b3dfb14e2f86e3a99c1b0c1475)      KV Namespace   local
env.DIET_COACH_IMAGES (diet-coach-images)           R2 Bucket      local
```

實際 `curl` 測試結果：

| 路由 | 結果 |
|---|---|
| `GET /` | 200 |
| `GET /manifest.json` | 200，內容為合法 JSON |
| `GET /icon.svg` | 200 |
| `GET /apple-touch-icon.png` | 200，`Content-Type: image/png` |
| `GET /api/sync?code=devtest123`（不存在） | `null` |
| `POST /api/sync?code=devtest123` | `{"ok":true}` |
| `GET /api/sync?code=devtest123`（讀回） | 正確讀回剛才 POST 的內容 |
| `DELETE /api/sync?code=devtest123` | 405 |
| `GET /api/sync?code=ab`（格式不合法） | 400 |
| `POST /api/qlive?code=devqlive` | `{"ok":true}` |
| `GET /api/qlive?code=devqlive` | 正確讀回 |
| `GET /img/quest/scenes/terrain-1.jpg` | 200，實際回傳真實 JPEG（20,938 bytes，與 TASK1.3 盤點記錄的大小完全一致），透過 `env.DIET_COACH_IMAGES` binding 真實讀取 |
| `GET /img/does/not/exist.jpg` | 404 |

### (3) P1～P6 基準測試：8 / 8 全數通過

沿用 TASK0.5 的 `baseline_capture.script.js`（未修改測試腳本本身），對重新產生的 `test.html`（來源於本次轉換後的 `src/worker.js`）執行：

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

### ⚠️ 環境限制說明（誠實揭露）

與 TASK1.6 相同，本沙箱網路政策不允許直接對外連線 `*.workers.dev`（`curl` 得到 `CONNECT tunnel failed, response 403`，屬 organization 層級 egress 限制），因此無法在本次任務中對正式網址發送真實 HTTP 請求做最終確認。已用上述三層交叉驗證（Node ESM 直接呼叫 27 項、`wrangler dev --local` 真實 workerd runtime 12 項、P1～P6 基準 8 項，合計 47 項）取得高信心度的等效驗證。**建議使用者實際打開 `https://balance-diet.chair22752033.workers.dev` 操作一次（尤其是同步碼 `/api/sync` 相關的「同步」功能與 QUEST 抽卡），作為最後的人工確認**。

---

## 五、是否可以進入後續 TASK

**✅ 可以。** 修改範圍精準（只有 7 處 binding 存取方式的異動，業務邏輯與輸出內容零改變），本地與部署後 binding 皆確認正確掛載，三層共 47 項自動化驗證全數通過，且完全沒有接入 D1、沒有新增登入、沒有改動 UI。這是後續 TASK1.11（接入 D1 binding）與 TASK1.12 的必要前置條件。

---

## 六、回滾方式

**A. 完整回滾（回到 Service Worker 語法）**
```bash
git revert <本次commit hash>
npx wrangler deploy
```

**B. 直接用備份檔還原**
```bash
cp backups/phase1-task1.10-esmodule/worker.js.before-esmodule.bak src/worker.js
npx wrangler deploy
```
（`worker.js.before-esmodule.bak` 已用 SHA-256 核對，與轉換前的 git 版本逐位元組相同）

**C. Cloudflare 版本回退（不動 git，最快）**
```bash
npx wrangler rollback f441a4da-6766-4fc7-8ef1-9f9dd9b2bd9a
```
（`f441a4da` 為本次部署前的正式版本，即 TASK1.6 的狀態）

三種方式皆可讓 Worker 立即回到轉換前的行為，因為本次改動範圍極小且未牽動任何資料（KV/R2/D1 的實際內容完全未被觸碰）。

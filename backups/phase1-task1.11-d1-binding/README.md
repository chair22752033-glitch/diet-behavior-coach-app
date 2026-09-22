# TASK 1.11 執行結果｜接入 D1 Binding

執行日期：2026-09-22
部署版本：`524d37f7-84ef-41a1-8ba3-b8f63293973d`（前一版本：`d5ce985b-d628-4afa-9567-6cd9e19369ef`，即 TASK1.10）
正式網址：`https://balance-diet.chair22752033.workers.dev`

限制遵守情形：
✅ 只加入 D1 binding（`wrangler.toml` 新增 `[[d1_databases]]` 區塊，`src/worker.js` **零修改**）｜✅ 不修改現有 UI｜✅ 不讓現有功能讀取 D1（`src/worker.js` 沒有任何一行程式碼引用 `env.DIET_COACH_DB`）｜✅ 不進行使用者資料寫入｜✅ 不建立登入｜✅ 不進行 KV 遷移｜✅ 不修改資料流程

---

## 一、修改檔案

**只修改了 `wrangler.toml`**（新增 `[[d1_databases]]` binding 區塊 + 更新說明註解）。

`src/worker.js` **完全未修改**：`git diff --stat src/worker.js` 為空，這是本次任務的關鍵驗證點——D1 binding 加入後，Worker 程式碼本身沒有任何一行讀取它，binding 純粹是「掛在那裡但沒被使用」的狀態。

---

## 二、Binding 資訊

```toml
[[d1_databases]]
binding = "DIET_COACH_DB"
database_name = "diet-coach-db"
database_id = "9560446f-5d56-45e4-b605-ddec5cdf909f"
```

- **資料庫**：`diet-coach-db`（TASK1.1 建立）
- **Schema**：11 張表（TASK1.7 建立）
- **內容**：nutrients 67 筆、scenarios 14 筆（TASK1.8 seed，`users` 等其餘 9 張表維持 0 筆）
- **Binding 名稱**：`DIET_COACH_DB`（供未來 `env.DIET_COACH_DB` 存取）

---

## 三、部署結果

```
npx wrangler deploy
```

**部署成功，無任何錯誤**：

```
Your Worker has access to the following bindings:
Binding                                                       Resource
env.SYNC_KV (b984c2b3dfb14e2f86e3a99c1b0c1475)                KV Namespace
env.DIET_COACH_DB (diet-coach-db)                             D1 Database
env.DIET_COACH_IMAGES (diet-coach-images)                     R2 Bucket

Uploaded balance-diet (3.05 sec)
Deployed balance-diet triggers (0.89 sec)
  https://balance-diet.chair22752033.workers.dev
Current Version ID: 524d37f7-84ef-41a1-8ba3-b8f63293973d
```

**對照 TASK1.1 的歷史失敗**：TASK1.1 嘗試加入同一個 D1 binding 時，因為當時 `src/worker.js` 還是舊式 `addEventListener('fetch')` 語法，被 Cloudflare 拒絕部署（`Binding 'DIET_COACH_DB' of type 'd1' requires a Worker written in ES module format. [code: 100329]`）。這次因為 TASK1.10 已完成 ES Module 轉換，同樣的 binding 設定這次**部署完全成功**，印證了 TASK1.10 作為前置任務的必要性。

---

## 四、驗證結果

### (1) `wrangler deploy` 成功 ✅

見上方部署輸出，binding 表正確列出 `env.DIET_COACH_DB (diet-coach-db) D1 Database`。

### (2) `env.DIET_COACH_DB` 可被 Worker 取得 ✅

由於「不讓現有功能讀取D1」的限制，`src/worker.js` 不能新增任何讀取 D1 的程式碼來驗證。因此改用 **wrangler 官方內建工具**（非我方自建的 API endpoint）驗證 binding 本身確實可用：

用 `wrangler dev --local` 啟動本機開發伺服器，binding 表確認：
```
env.DIET_COACH_DB (diet-coach-db)    D1 Database    local
```

進一步用 wrangler 內建的 Local Explorer API（`/cdn-cgi/local/explorer/api/d1/database/...`，這是 wrangler dev 自帶的除錯工具，不是我方程式碼）直接對 `env.DIET_COACH_DB` 綁定的資料庫執行唯讀查詢：

```json
// GET /cdn-cgi/local/explorer/api/d1/database
{"result":[{"name":"DIET_COACH_DB","uuid":"9560446f-5d56-45e4-b605-ddec5cdf909f","version":"production"}]}

// POST .../d1/database/9560446f.../raw {"sql":"SELECT (SELECT COUNT(*) FROM nutrients) ..., (SELECT COUNT(*) FROM users) ..."}
{"results":{"columns":["nutrients_count","scenarios_count","users_count"],"rows":[[67,14,0]]}}
```

確認：
- UUID 與 `wrangler.toml` 設定的 `database_id` 完全一致
- 資料表清單（12張，含 `d1_migrations`）與 TASK1.7 建立的結果一致
- nutrients 67 筆、scenarios 14 筆與 TASK1.8 seed 的結果一致、users 0 筆（無使用者資料寫入）

這證明 `env.DIET_COACH_DB` binding 確實已正確掛載、指向正確的資料庫、且能被查詢，**同時完全沒有修改 `src/worker.js` 或新增任何 API endpoint**。

### (3) 現有 KV / R2 功能正常 ✅

同樣在 `wrangler dev --local` 環境下實測：

| 路由 | 結果 |
|---|---|
| `GET /` | 200 |
| `POST /api/sync?code=task111test`（KV寫入） | `{"ok":true}` |
| `GET /api/sync?code=task111test`（KV讀回） | 正確讀回剛才寫入的內容 |
| `GET /img/quest/scenes/terrain-1.jpg`（R2讀取） | 200 |
| `GET /manifest.json` | 200 |
| `GET /icon.svg` | 200 |

因為 `src/worker.js` 本次零修改，理論上 KV/R2 行為必然與 TASK1.10 完全相同；上述實測進一步以實際請求交叉確認。

### (4) P1～P6 基準測試通過 ✅

沿用 TASK0.5 的 `baseline_capture.script.js`（未修改測試腳本本身），8/8 全數通過：

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

與 TASK1.6、TASK1.10 相同，本沙箱網路政策不允許直接對外連線 `*.workers.dev`，因此無法在本次任務中對正式網址發送真實 HTTP 請求做最終確認。已用 `wrangler dev --local`（真實 workerd runtime + wrangler 官方 Local Explorer API）取得高信心度的等效驗證，且因為 `src/worker.js` 本次零修改，正式環境行為改變的風險趨近於零（唯一變化是 wrangler.toml 多了一個目前完全沒被程式碼使用的 binding）。

---

## 五、是否可以進入後續 TASK

**✅ 可以。** `env.DIET_COACH_DB` binding 已確認正確掛載且可查詢，`src/worker.js` 零修改、KV/R2 功能不受影響、P1～P6 基準測試 8/8 全數通過。

---

## 六、回滾方式

**A. 移除 D1 binding（保留資料庫本身）**

刪除 `wrangler.toml` 內的 `[[d1_databases]]` 區塊，重新 `wrangler deploy` 即可，因為 `src/worker.js` 完全沒有引用 `env.DIET_COACH_DB`，移除 binding 不會影響任何現有功能：
```bash
git revert <本次commit hash>
npx wrangler deploy
```

**B. Cloudflare 版本回退（不動 git，最快）**
```bash
npx wrangler rollback d5ce985b-d628-4afa-9567-6cd9e19369ef
```
（`d5ce985b` 為本次部署前的正式版本，即 TASK1.10 的狀態）

兩種方式風險皆極低，因為本次改動只新增了一個目前完全未被使用的 binding 設定，未牽動任何程式邏輯或既有資料。

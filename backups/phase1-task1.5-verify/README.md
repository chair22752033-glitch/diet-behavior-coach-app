# TASK 1.5 執行結果｜雙軌圖片來源驗證

執行日期：2026-09-22
限制遵守情形：✅ 未切換正式圖片來源｜✅ 未修改 QUEST 邏輯｜✅ 未刪除 Base64｜✅ 未修改 UI｜✅ 未修改 `src/worker.js`（`git diff --stat src/worker.js wrangler.toml` 為空，逐字元零改動）

本次驗證全程只在瀏覽器記憶體中（Playwright `page.evaluate`）暫時替換 `QST_PHOTOS` / `QST_OBJ_PHOTOS` 兩個 JS 變數的值，驗證完立即還原，**未觸碰任何原始碼檔案**。

---

## 一、驗證結果

### 1. 圖片數量一致

- Base64 原始來源（`src/worker.js` 內嵌）：27 張（13 張分類場景 + 14 張信物）
- R2 來源（本次獨立重新從 R2 下載，未沿用 TASK1.4 快取）：27 張
- **結果：27 = 27，數量一致 ✅**

### 2. 圖片內容一致

以 SHA-256 逐一比對 27 張圖片（見 `compare/base64-original-sha256.txt` 與 `compare/r2-fresh-sha256.txt`）：

- **27 / 27 雜湊值完全相同 ✅**

### 3. 圖片尺寸一致

以 Node.js 解析 JPEG SOF 區段讀出寬高（見 `compare/dimension-check.txt`）：

- **27 / 27 寬高完全相同，0 筆不一致 ✅**

### 4. QUEST 流程結果一致

使用 Playwright 對重新產生的 `test.html`（由目前未改動的 `src/worker.js` 之 `getHTML()` 原樣輸出）進行測試，共 13 項檢查，**13 / 13 通過**：

| 檢查項目 | 結果 |
|---|---|
| 替換前：分類場景 5 類全部張數皆能正常產生 `<img>` | PASS |
| 替換前：14 個信物皆能正常產生 `<img>` | PASS |
| 替換後（改用 R2 內容）：13 張分類場景 img 的 base64 內容與 R2 來源逐位元組一致 | PASS |
| 替換後（改用 R2 內容）：14 張信物 img 的 base64 內容與 R2 來源逐位元組一致 | PASS |
| 替換機制驗證：用假資料（sentinel value）確認 `qstArtSVG()` 真的讀取當前變數值，不是快取舊值 | PASS |
| 替換前後 img 內容一致（符合預期：因 TASK1.4 已證實 R2 與 Base64 內容本就逐位元組相同） | PASS |
| QUEST 抽卡流程（single 模式，改用 R2 來源）畫面正常、圖片正常渲染 | PASS |
| QUEST 抽卡流程（map 模式，改用 R2 來源）畫面正常、圖片正常渲染 | PASS |
| QUEST 抽卡流程（panorama 模式，改用 R2 來源）畫面正常、圖片正常渲染 | PASS |
| 連續 12 次抽卡（R2 來源）過程無中斷 | PASS |
| 記憶體還原回 Base64 來源後，結果與最初完全一致（證明可安全回滾） | PASS |
| 整體流程無 page error（未捕捉例外，與 TASK0.5 基準測試判準一致） | PASS |
| console.error 中無「已知測試環境限制」以外的錯誤 | PASS |

截圖：`quest_r2_single.png`、`quest_r2_map.png`、`quest_r2_panorama.png`（皆為改用 R2 圖片內容後的實際抽卡畫面，人工肉眼確認渲染正常、無破圖）

### 5. 無 console error

- **page error（未捕捉例外）：0 筆 ✅**（判準與 TASK0.5 基準測試一致）
- console.error（瀏覽器主控台層級錯誤）：1 筆，內容為 `Failed to load resource: 404 (File not found)`

  **此為已知的測試環境限制，與圖片來源替換無關**：本次驗證是用 `python3 -m http.server` 直接讀取靜態 `test.html`，不具備正式 Worker 的 `/icon.svg` 路由（該路由在 `src/worker.js` 的 `handle()` 函式中才有）。經獨立測試確認，**這筆 404 在完全不涉及任何圖片替換、頁面剛載入時就會出現**（見下方「發現問題」第 1 點），因此排除在「與本次驗證相關的錯誤」之外。正式環境（Cloudflare Worker 部署）不會有此問題，因為 `/icon.svg` 路由是由 Worker 動態處理，不是靜態檔案。

---

## 二、發現問題

1. **`/icon.svg` 404（測試環境限定，非 App 缺陷）**：如上述，只在用純靜態伺服器（無 Worker 路由邏輯）跑 `test.html` 時才會出現，正式環境不受影響。已在 TASK0.5 的基準測試中就存在（該測試未特別監聽 console.error 才沒被記錄），本次為求嚴謹才額外納入監聽並在此說明排除原因。**不影響 TASK1.5 的驗證結論**。
2. 除此之外，**未發現任何與 R2 圖片替換相關的問題**：內容、尺寸、數量三項基準比對全部一致，QUEST 三種模式（single/map/panorama）搭配 R2 圖片皆可正常運作。

---

## 三、是否可以進入 TASK 1.6

**✅ 可以。**

理由：
- 27 張圖片在 R2 與 Base64 兩端的數量、內容（SHA-256）、尺寸三項基準比對皆 100% 一致
- QUEST 核心繪圖函式 `qstArtSVG()` 在改用 R2 內容時運作正常，抽卡流程（三種模式）與連續多次抽卡皆無異常
- 替換機制確認為即時讀取變數值（非快取），代表未來 TASK1.6 若要切換正式來源，資料流是可靠的
- 全程 `src/worker.js` 零修改，本次驗證不影響現有任何功能（P1～P6 未被觸碰，因為測試對象本來就是同一份未改動的 `test.html`）

---

## 四、回滾方式

本次驗證**不需要回滾**，因為：

1. 未修改 `src/worker.js`、`wrangler.toml` 或任何正式程式碼（`git diff --stat` 為空）
2. 所有「替換」動作僅發生在 Playwright 控制的瀏覽器分頁記憶體中（`page.evaluate` 修改 JS 變數），該分頁於測試結束後即關閉銷毀，不留痕跡
3. 未上傳、未刪除、未修改 R2 或 KV 內的任何資料（本次只有 `wrangler r2 object get` 讀取操作）
4. 若要重跑本次驗證，直接執行 `node backups/phase1-task1.5-verify/scripts/task1.5_verify.js`（需先起本機靜態伺服器服務 `test.html`，並確保 `backups/phase1-task1.5-verify/scripts/r2_b64_map.json` 存在）

若之後在 TASK1.6 執行「正式切換來源」時發現問題，回滾方式為：還原 `QST_PHOTOS`/`QST_OBJ_PHOTOS` 為原本直接參照 `QST_PHOTO_*`/`QST_OBJ_PHOTO_*` 變數（即目前 `src/worker.js` 現狀），因為 Base64 資料本身從未被刪除。

---

## 檔案結構

- `r2-fresh-download/`：本次獨立重新從 R2 下載的 27 張圖片（未沿用 TASK1.4 快取，確保驗證獨立性）
- `compare/base64-original-sha256.txt`：Base64 解碼版本（沿用 TASK1.4 `local-source/`）的 SHA-256
- `compare/r2-fresh-sha256.txt`：本次重新下載的 R2 版本 SHA-256
- `compare/dimension-check.txt`：27 張圖片的寬高比對結果
- `scripts/task1.5_verify.js`：Playwright 驗證腳本（可重跑）
- `scripts/r2_b64_map.json`：R2 圖片重新編碼為 base64 的對照表（供驗證腳本在瀏覽器記憶體中替換使用）
- `scripts/task1.5-log.json`：驗證腳本的結構化輸出紀錄
- `scripts/quest_r2_single.png` / `quest_r2_map.png` / `quest_r2_panorama.png`：改用 R2 圖片後三種 QUEST 模式的實際畫面截圖

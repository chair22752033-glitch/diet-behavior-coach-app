# 飲食主場秀 — B2：隔離加密試作報告

**日期：** 2026-10-02（Asia/Taipei）
**依據：** GPT「B 加密設計與服務文件完整交接稿」§5／§9 B2 工作包、以及擁有者拍板的加密方案。
**性質：** 這是**隔離環境的試作（prototype）＋驗收測試**，全部用**合成假資料**。
**未做（重要）：** 未改任何正式程式（worker.js 等 src/ 一行未動）、未改 schema、未遷移任何正式資料、未部署、未收款。所有新檔都在 `b2_prototype/` 目錄，與正式路徑完全隔離。

---

## 0. 一句話結論
GPT §9 的 B2 完成條件**全部通過**：Node 驗收 **57/0**、真實 Chromium 瀏覽器驗收 **12/0**。加密方案照擁有者拍板採 **jose 標準 JWE（A256KW 包鑰 + A256GCM 內容）＋ 瀏覽器原生 Web Crypto**。下一步（B3 正式遷移）需要**另一次明確授權**才動工。

---

## 1. 採用的加密方案（照拍板）
- **封裝：** jose 標準 JWE compact，`alg=A256KW`（用金鑰包裝每則訊息的 CEK）、`enc=A256GCM`（認證加密內容）。固定版本 **jose 5.9.6**。
- **原生 Web Crypto：** 亂數（`getRandomValues`）、HKDF-SHA256（由恢復碼導出包鑰）、以及**不可匯出的裝置金鑰**（`AES-KW`, `extractable=false`）。
- **不自創演算法**：只用標準 JWE/AES-GCM/AES-KW/HKDF。

### 金鑰結構（對應 GPT §5.1）
| 金鑰 | 產生 | 保存 |
| --- | --- | --- |
| VK 保險庫金鑰 | 裝置端 256-bit 亂數 | server 只存**被包裝**的 VK，明文只在授權裝置 |
| CEK 內容金鑰 | 每則 JWE 由 jose 現場產生（新 IV） | 與密文一起，被 VK 包裝 |
| R 恢復碼 | 256-bit 亂數，Crockford base32 可複製字串 | 使用者保管，**不上傳** |
| RK 恢復包鑰 | `HKDF-SHA256(R, salt, info)` | server 只存 salt + 被 RK 包裝的 VK |
| DK 裝置金鑰 | `AES-KW` **不可匯出** CryptoKey | 留在裝置（IndexedDB）；不上傳 |

### 上下文綁定（對應 GPT §5.2）
每個 JWE 受保護標頭都帶 `ver / vault_id / use（用途）`，記錄另帶 `rid（record_id）/ rev（revision_id）/ epoch`。解密後**一律**再比對標頭與「目前帳號的保險庫、要求的記錄、用途、世代」——「解得開」永遠不等於「接受」。

---

## 2. 試作內容（`b2_prototype/`）
| 檔案 | 作用 |
| --- | --- |
| `vault_crypto.mjs` | 加密核心：建保險庫、恢復碼、信任裝置、記錄加解密（jose + Web Crypto）。**同一份原始碼同時在 Node 與瀏覽器執行。** |
| `review_portable.mjs` | 7 日回顧的**裝置端版本**，是 `src/review/review_service.js` 的逐行移植。 |
| `fake_e2ee_server.mjs` | 假 server + 記憶體 DB：**只存密文**、驗 ownership/大小/格式/revision CAS、**沒有任何能解密的金鑰**。 |
| `test_b2.mjs` | Node 驗收套件（57 檢查）。 |
| `browser/index.html` + `run_browser_check.mjs` | 用**真實 Chromium** 跑同一份 `vault_crypto.mjs`（import map 把 `jose` 指到瀏覽器版 build）。 |

---

## 3. 驗收結果 vs GPT §9 B2 完成條件

| GPT 要求 | 對應測試 | 結果 |
| --- | --- | --- |
| 新帳號金鑰、恢復碼、可信裝置、密文同步、裝置端回顧 | §1,3,4,6 | ✅ |
| **兩種實際裝置／瀏覽器可恢復** | §4（第二瀏覽器用恢復碼復原 VK，解出同資料）＋ 真實 Chromium 12/0 | ✅（Node + Chromium；Safari/Firefox 見 §6 未確認） |
| **錯碼不清空** | §5：錯恢復碼→丟例外，密文筆數不變 | ✅ |
| **封包與資料庫無測試私人明文** | §2：掃 server dump 無 `fried/sweet/energy/stress_raw/炸物/note-0/時間戳` 等；§9：無 `input_snapshot` | ✅ |
| **回顧結果一致** | §3：裝置端 `computeFacts/buildReview/reportKey` 與正式 `src/review/review_service.js` **JSON 完全相等** | ✅ |

**額外驗證（超出最低要求，對應 §5.2 威脅模型）：**
- 竄改密文 → 拒絕（AES-GCM 認證失敗）。
- 跨記錄替換（把 A 的密文當 B）→ 拒絕（標頭 `rid` 不符）。
- 錯 `vault_id` / 錯 `epoch` / 用途混用（記錄密文當裝置包鑰用）→ 拒絕。
- revision CAS：舊 `base_revision` 拒絕；正確才更新；同 revision 重送 idempotent。
- 單一保險庫：第二次啟用被拒（避免兩裝置首啟互相覆蓋，§5.3）。
- server 收到明文 payload → 直接拒絕（`not_ciphertext`）。
- **B1 發現的第 4 處儲存都納入**：`review`（回顧快取）與 `health_insight`（輸入/結果）都走同一密文封裝並驗證無明文外洩。
- 可信裝置金鑰**不可匯出**（`exportKey` 丟例外），且**別台裝置的金鑰解不開本台的包裝**。

**規模：** 1,000 筆合成記錄：加密 ~74ms、解密 ~47ms、回顧結果與正式演算法相符、dump 無明文。

**測試數字：** Node `test_b2.mjs` = **57 passed / 0 failed**；Chromium `run_browser_check.mjs` = **12 passed / 0 failed**（HeadlessChrome 141）。

---

## 4. 對正式架構的影響評估（供 B3 規劃，尚未實作）
- **同步層幾乎可沿用**：`src/sync/sync_store.js` 的 ownership/版本/配額/idempotency 邏輯不變；只需把 `payload` 當不透明密文、把 dedup/CAS 的 key 改用標頭 `rid/rev`（目前 server 從明文抽 `ts`，E2EE 下要改用 server 序號排序，不看明文時間）。
- **回顧移到裝置**：`review_service.js` 已是純函式，移植零風險（本報告已證明輸出相等）。正式做法：保留一份共用演算法，避免 server/client 分叉（維護策略見 §6 未確認）。
- **新增 crypto_mode 狀態機**：`legacy → migration_locked → ciphertext_verified → e2ee_only`（GPT §7.1）；本試作的假 server 已示範 `e2ee_only` 帳號只收密文。

---

## 5. jose 的上線方式（給 B3/B4 注意）
- 本試作的 **Node 測試**用 `npm install jose@5.9.6 --no-save`（只在容器本地，未寫進 `package.json`、未進 git）。
- **正式前端**（無打包器、字串陣列內嵌）要照擁有者拍板：把**固定版本的 jose 瀏覽器 build 放進網站自己的靜態資源**（`public/`），用 `<script type="importmap">` 或 `type="module"` 載入——**不要**從外部 CDN 載（供應鏈/離線風險）。本試作的瀏覽器驗收正是用「本地靜態檔 + import map」跑的，已證可行。

---

## 6. 已確認 vs 未確認（B3 前要處理）
**已確認：**
- 加密/恢復/信任裝置/密文同步/裝置端回顧在 **Node 與真實 Chromium** 都正確。
- 四處私人內容都能走同一密文封裝、server 端無明文。
- 認證加密能擋竄改/替換/錯上下文；CAS 能擋過期寫入。

**未確認（列入 B3）：**
- **Safari / Firefox 真機**：容器只有 Chromium。上線前須在 iOS Safari、Android Chrome、桌面 Firefox 實測（尤其 `AES-KW` + 非匯出金鑰 + IndexedDB 存 CryptoKey 的行為）。
- **共用演算法的維護方式**：回顧邏輯 server/client 一份來源如何同步進「字串陣列內嵌前端」，避免未來改一邊忘另一邊。
- **正式遷移流程**（GPT §7）：鎖寫入、分批下載舊明文到裝置加密、比對、清理、crypto-aware rollback、checkpoint；D1 單次 transaction/Worker 執行上限下的批次大小。
- **D1 Time Travel**：清理明文後，Time Travel 窗內舊備份仍含明文（Free 7 天/Paid 30 天）——要如實告知，不能宣稱「立即不可解」。
- **金鑰輪替/撤銷**（GPT §5.6）與衝突雙版本保存（§5.2）本試作尚未完整實作。

---

## 7. 下一步（需要新授權）
1. **B3 正式遷移設計與試作**：仍在隔離/測試帳號上，加上「舊明文 → 裝置端加密 → 驗證 → 清理」的可續、可回滾流程；補 Safari/Firefox 實機、輪替/撤銷、衝突雙版本。**不碰正式使用者資料，直到擁有者明確授權。**
2. 平行：擁有者填方案【待定】、法務確認文件（與加密無關，可同時進行）。
3. **對外措辭**：B4 通過前，**不得**宣稱「營運者無法解密」；現況仍是「server 會處理明文以提供回顧」。

**本輪只交付隔離試作與驗收；未對正式 App、資料或收款做任何變更。**

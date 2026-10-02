# 飲食主場秀 — B2：隔離加密試作報告

**日期：** 2026-10-02（Asia/Taipei）
**依據：** GPT「B 加密設計與服務文件完整交接稿」§5／§9 B2 工作包、以及擁有者拍板的加密方案。
**性質：** 這是**隔離環境的試作（prototype）＋驗收測試**，全部用**合成假資料**。
**未做（重要）：** 未改任何正式程式（worker.js 等 src/ 一行未動）、未改 schema、未遷移任何正式資料、未部署、未收款。所有新檔都在 `b2_prototype/` 目錄，與正式路徑完全隔離。

> **v0.2 修訂（採納 GPT 審閱）：** 本報告第一版把狀態寫成「B2 完成條件全部通過」，**過度樂觀，已更正**。正確狀態是：**核心加密邏輯在隔離環境（Node + 真實 Chromium）已驗證**，但**尚未**在真實 Worker/D1/KV 路徑、手機實機（iOS Safari／Android Chrome）、以及 health-insight 裝置端運算上驗證。下方第 3、6 節明列哪些是「已驗證」、哪些是「仍待補」。此原型可沿用，但**還不能**進入正式資料遷移，也**不得**對外宣稱加密保護。

---

## 0. 一句話結論
核心加密**邏輯**在隔離環境通過驗證：Node `test_b2.mjs` **57/0**、review 邊界 `test_review_port.mjs` **12/0**、真實 Chromium `run_browser_check.mjs` **12/0**、IndexedDB 重啟+換帳號 `run_idb_check.mjs` **9/0**。加密方案照擁有者拍板採 **jose 標準 JWE（A256KW 包鑰 + A256GCM 內容）＋ 瀏覽器原生 Web Crypto**，版本鎖定 **jose 6.2.12**（見 `DEPENDENCY_LOCK.md`）。**但這是「試作資料流」而非「正式路徑」的驗證**；下一輪 B2 續作要接到隔離 Worker/D1/KV 並補 health-insight 運算與手機實機，才算 B2 收尾。B3（隔離環境舊資料遷移演練，假資料）與正式資料遷移是之後、需另行授權的階段。

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
| `test_b2.mjs` | Node 核心驗收套件（57 檢查）。 |
| `test_review_port.mjs` | 回顧邊界樣本 vs 正式演算法（12 檢查）。 |
| `browser/index.html` + `run_browser_check.mjs` | 用**真實 Chromium** 跑同一份 `vault_crypto.mjs`（import map 把 `jose` 指到 webapi build）。 |
| `browser/idb_test.html` + `run_idb_check.mjs` | **真實 Chromium persistent profile**：IndexedDB 重啟還原 + A→B 切換（9 檢查）。 |
| `DEPENDENCY_LOCK.md` | jose 6.2.12 版本鎖定與完整性雜湊。 |

---

## 3. 驗收結果 vs GPT §9 B2 完成條件（誠實分級）

**圖例：** ✅ 已在隔離環境驗證（Node/Chromium）｜🟡 部分驗證，仍缺真實路徑或實機｜⬜ 尚未做。

| GPT 要求 | 對應證據 | 狀態 |
| --- | --- | --- |
| 新帳號金鑰、恢復碼、可信裝置、密文同步、裝置端回顧（**邏輯**） | test_b2 §1,3,4,6 | ✅ 邏輯層 |
| 兩種實際裝置／瀏覽器可恢復 | Node＋真實 Chromium 都可用恢復碼復原 VK；**但 Node 不是瀏覽器，手機 Safari／Android Chrome 尚未實測** | 🟡（缺手機實機，需你協助操作） |
| 封包與資料庫無測試私人明文 | 掃「**假 server＋記憶體 DB**」dump 無明文 | 🟡（證明試作資料流；**尚未**代表真實 Worker/D1/KV 路徑） |
| 回顧結果一致 | 裝置端 vs 正式 `review_service.js`：基本樣本 + **邊界樣本（時區/缺值/視窗/未來 ts）皆 JSON 相等**（test_review_port 12/0） | ✅（已測樣本一致；非「零風險」，仍需正式接線時回歸） |
| 錯碼不清空 | 錯恢復碼→丟例外、密文筆數不變 | ✅ |
| health-insight 移到裝置計算、與原演算法結果一致 | **僅證明輸入/結果可加密往返**；health-insight 運算是 `src/intelligence/...` 多檔子系統，**裝置端移植尚未做** | ⬜（B2 續作） |
| 金鑰保存／日誌：IndexedDB 重啟恢復、A→B 切換、實際錯誤日誌 | **IndexedDB 真實重啟**（Chromium persistent profile）+ A→B 切換 9/0；**實際錯誤日誌檢查尚未做** | 🟡（IDB/切換已驗；錯誤日誌待接線後查） |

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

**測試數字（jose 6.2.12）：**
- `test_b2.mjs`（Node 核心驗收）= **57 / 0**
- `test_review_port.mjs`（回顧邊界 vs 正式演算法）= **12 / 0**
- `run_browser_check.mjs`（真實 Chromium，HeadlessChrome 141）= **12 / 0**
- `run_idb_check.mjs`（Chromium persistent profile，真實重啟 + A→B 切換）= **9 / 0**

---

## 4. 對正式架構的影響評估（供 B3 規劃，尚未實作）
- **同步層幾乎可沿用**：`src/sync/sync_store.js` 的 ownership/版本/配額/idempotency 邏輯不變；只需把 `payload` 當不透明密文、把 dedup/CAS 的 key 改用標頭 `rid/rev`（目前 server 從明文抽 `ts`，E2EE 下要改用 server 序號排序，不看明文時間）。
- **回顧移到裝置**：`review_service.js` 已是純函式，移植**已測樣本（含時區/缺值/視窗邊界）結果一致**（非「零風險」用語）；仍需正式接線時回歸、並處理 server/client 一份來源避免分叉（維護策略見 §6）。
- **新增 crypto_mode 狀態機**：`legacy → migration_locked → ciphertext_verified → e2ee_only`（GPT §7.1）；本試作的假 server 已示範 `e2ee_only` 帳號只收密文。

---

## 5. jose 版本與上線方式（給 B3/B4 注意）
- **版本已改用受支援的 jose 6.2.12**（採納 GPT 審閱：v5.x 不在安全維護線上）。版本鎖定與完整性雜湊見 `b2_prototype/DEPENDENCY_LOCK.md`。jose v6 是單一 Web Crypto build（`dist/webapi`），與本專案「用原生 Web Crypto」方向一致。
- 本試作的 **Node 測試**用 `npm install jose@6.2.12 --no-save`（只在容器本地，未寫進 `package.json`、未進 git）。
- **正式前端**（無打包器、字串陣列內嵌）要照擁有者拍板：把**固定版本的 jose 放進網站自己的靜態資源**（`public/`），用 `<script type="importmap">` 或 `type="module"` 載入——**不要**從外部 CDN 載（供應鏈/離線風險），並在上線時記錄所 ship 檔案的 sha256、加 SRI/建置期雜湊檢查。本試作的瀏覽器驗收正是用「本地靜態檔 + import map」跑的，已證可行。

---

## 6. 已確認 vs 未確認

**已確認（隔離環境）：**
- 加密/恢復/信任裝置/密文同步/裝置端回顧**邏輯**在 Node 與真實 Chromium 都正確。
- 回顧裝置端移植在**基本 + 邊界樣本**（時區/缺值/視窗/未來 ts）與正式演算法 JSON 相等。
- **IndexedDB 真實重啟**（persistent profile 完整關閉再開）能還原非匯出裝置金鑰、免恢復碼解鎖、解回樣本；**A→B 切換清除前帳號可解密狀態**。
- 認證加密能擋竄改/替換/錯上下文；CAS 能擋過期寫入；四處私人內容封裝後 server dump 無明文。
- jose 版本改為受支援的 6.2.12，已鎖定 + 記錄完整性雜湊。

**未確認（B2 續作 / B3）：**
- **真實 Worker/D1/KV 路徑**：目前是「假 server + 記憶體 DB」。要在**隔離的 Worker/D1/KV** 接線後，才算驗證真實路徑無明文、CAS/配額在 D1 上成立。
- **health-insight 裝置端運算**：只證明輸入/結果可加密往返；其運算子系統（`src/intelligence/...`）尚未移植、尚未證明結果一致。
- **手機實機**：容器只有 Chromium。須在 **iOS Safari、Android Chrome**（與桌面 Firefox）實測 `AES-KW`+非匯出金鑰+IndexedDB 行為——**此項需擁有者協助操作**。
- **實際錯誤日誌檢查**：接線到真實 Worker 後，確認例外/錯誤回報不夾帶明文（B1 的靜態結論要用執行期證據補強）。
- **共用演算法維護方式**：回顧邏輯 server/client 一份來源如何同步進字串陣列前端，避免分叉。
- **對齊設計 0.2 / 第 05 份工作包**：本試作的**恢復碼編碼（Crockford base32 分組）**與**JWE 標頭欄位命名（`ver/vault_id/rid/rev/epoch/use`）**是我在 0.1 基礎上的實作選擇；GPT 指出與設計 0.2 有差異。**我手上目前只有設計 0.1**——請提供 0.2 對這兩項的確切規格，我再對齊（或明確記錄變更），以免未來裝置互不相容。
- **金鑰輪替/撤銷**（§5.6）與**衝突雙版本保存**（§5.2）尚未實作。
- **遷移流程**（§7）：鎖寫入、分批、比對、清理、crypto-aware rollback、checkpoint、D1 Time Travel 明文殘留告知——B3 處理。

---

## 7. 下一步（每一步都需新授權，且都不碰正式使用者資料）
1. **B2 續作（補證據）**：把原型接到**隔離的 Worker/D1/KV**，補 health-insight 裝置端運算與結果一致驗證、錯誤日誌檢查；手機實機部分明列步驟請擁有者協助操作。
2. **B3：隔離環境「舊資料遷移演練」（假資料）**——驗證搬移、中斷恢復、清理、回滾。**名稱刻意不叫「正式遷移」**；正式使用者資料另行、單獨授權。
3. 平行（與加密無關，不被卡）：擁有者填方案【待定】、法務確認文件、**七日回顧使用說明可獨立部署**。
4. **對外措辭**：B4 通過前**不得**宣稱「營運者無法解密」；現況仍是「server 會處理明文以提供回顧」。

**本輪只交付隔離試作與驗收；未對正式 App、資料或收款做任何變更。**

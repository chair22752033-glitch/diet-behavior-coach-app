# 飲食主場秀 — B1：原始碼 / 資料流盤點（對照 GPT B 加密設計）

**日期：** 2026-10-02
**正式版本：** `67709346`｜HEAD：`315be57`
**性質：** 這是 **read-only 盤點 + 設計對照**，依 GPT「B1 設計與盤點」工作包。**未改任何程式、未部署、未搬動任何資料。** 這不是加密完成，也不是安全認證。
**依據：** GPT「B 加密設計與服務文件完整交接稿 v0.1」。

---

## 0. 給 GPT / 擁有者的三個關鍵發現（最重要先講）

1. **多了一個 GPT 設計沒列到的私人內容儲存：`health_insight_records`（D1，migration 0007）。**
   POST `/api/health-insight` 會呼叫 `saveHealthInsightRecord()` 把使用者的 `input_snapshot`（6 題健康洞察輸入）與 `output_snapshot`（結果）**明文存進 D1**。這也要納入 B 的加密/遷移範圍，否則會漏。
   → 目前 server 端私人內容共 **4 處**：`sync_records`、`review_reports`、`health_insight_records`、`qlive`(KV)。

2. **前端沒有打包器（no bundler），不能 bundle `jose`/JWE 函式庫。**
   這個 App 的前端是 `getHTML()` 回傳的「字串陣列」內嵌 JS，沒有 npm/webpack/vite。GPT 建議的「成熟 JWE 實作（jose）」**無法直接引入**。
   → **建議改用瀏覽器原生 Web Crypto（`crypto.subtle`）**：`AES-GCM`(加密)、`AES-KW`(wrapKey/unwrapKey 包裝金鑰)、`HKDF`(deriveKey 由恢復碼導出)、`crypto.getRandomValues`(亂數) 全部原生支援，零依賴、符合「用平台成熟實作、不自創演算法」。封裝格式用「版本化自訂 envelope + AEAD + 綁定欄位」，不一定要完整 JWE compact（可選）。這是對 GPT 設計的**必要技術調整**。

3. **目前完全沒有把私人內容寫進 log**（`console.log/error/warn` 印 payload/ins/doc = 0 筆）。這點符合 GPT 的「不得記錄內容」要求，是好的起點。

---

## 1. 私人內容完整盤點（來源 → 處理 → 儲存 → 日誌）

### 1.1 Server 端儲存的私人內容（要加密的對象）
| 儲存 | 經由 | 內容 | 目前 server 是否讀明文計算 |
| --- | --- | --- | --- |
| **D1 `sync_records.payload`** | `/api/sync`（client POST）→ `pushSyncDoc` | 占卜/狀態 ins、QUEST quest 的逐筆 JSON | 否（只驗 ownership/size/version；內容 server 不解讀）—— **利於加密**：payload 改存密文即可 |
| **D1 `review_reports.payload`** | `/api/review`（server 產生）→ `saveReport` | 7 日回顧結果 | **是**（server 端 `computeFacts` 讀 ins 算出回顧）→ 要移到裝置端 |
| **D1 `health_insight_records`** | `/api/health-insight`（client POST）→ `saveHealthInsightRecord` | `input_snapshot` + `output_snapshot`（健康洞察輸入與結果） | **是**（server 端 `submitHealthInsightController` 處理輸入）→ 要移到裝置端 |
| **KV `qlive:u:<id>`** | `/api/qlive`（client POST）| QUEST 即時狀態（1 小時 TTL） | 否（只搬運）→ 可改存密文 |

### 1.2 Client 端本機儲存（私人內容的本機副本）
| key（常數） | 內容 | 遷移時要處理 |
| --- | --- | --- |
| `SK`="diet_app_v1" | 主資料：`ft`、`ins`（check-in）、`quest`、**`meals`（占卜，從不同步到 server）**、`identity`、dims 等 | 改存密文；清舊明文 |
| `SCK` | 舊短碼（legacy sync code） | 盤點清理 |
| `OWK`="diet_owner" | 帳號隔離擁有者標記（非私人內容） | 保留 |
| `QLIVE_PREF_KEY` | QUEST live 開關偏好（非私人內容） | 保留 |
| IndexedDB / Cache Storage / Service Worker | **目前前端未使用**（crypto.subtle=0、無 SW 快取私人內容） | B 階段若用 IndexedDB 存 trusted-device 金鑰，另設隔離 |

> **重要**：`meals`（飲食占卜的選擇與解讀）只存在本機 localStorage，**從來沒同步到 server**（同步只含 ins/quest）。所以占卜私人內容目前**已經只在裝置**——這部分對 E2E 友善。要加密的 server 內容主要是 ins / quest / 回顧 / health-insight。

### 1.3 日誌 / 分析
- `console.*` 印出 payload/ins/doc：**0 筆**（已確認）。
- 無第三方 analytics/APM。
- D1 `usage_metrics` 只記**數字**（rows/requests），無內容。✓

---

## 2. 需要「從 server 移到裝置端」的計算（E2E 的主要工程）
| 目前 server 端計算 | 模組 | B 階段處理 |
| --- | --- | --- |
| 7 日回顧確定性計算 | `src/review/review_service.js`（`computeFacts`/`buildReview`，ESM） | 演算法要**移植成 client 版**（字串陣列內嵌，無法 import ESM）；server 不再讀 ins 明文 |
| 健康洞察輸入處理 | `submitHealthInsightController` + `saveHealthInsightRecord` | 處理與儲存移到裝置端密文；server 不再收明文 input/output |
| 占卜 | 已在 client（localStorage） | 幾乎不用動（確認 meals 不外流即可） |

> 風險：review 的確定性演算法目前是 server ESM 模組，有完整測試（12/0）。移到 client 後要**保持同一演算法、同結果**（GPT §6.1：抽成可測純函式、固定樣本驗證同輸入同輸出）。這是 B2 的核心工作。

---

## 3. 對照 GPT 設計：現況的「有利 / 要補」

**有利（現有架構幫上忙）：**
- `sync_records` 已有 **per-record upsert + session 擁有權 + revision/version + 配額/大小驗證**（Phase 8/9）。加密只需把 `payload` 內容換成密文封裝，**server 的 ownership/size/version/idempotency 驗證邏輯幾乎不變** → migration 可能只要加 `crypto_mode` 之類的欄位 + payload 格式版本，不必重建同步層。
- 帳號隔離（A→B 清本機）、非破壞式失敗、idempotency 都已存在，GPT §5.2/§5.4 要的很多前提已具備。
- 無內容日誌、無第三方分析 → GPT §4 logging 要求已接近達成。

**要補（GPT 設計 vs 現況差距）：**
1. `health_insight_records` 要納入加密/遷移（GPT 漏列）。
2. 前端無 bundler → 用原生 Web Crypto，不用 jose（GPT §5.1 要改）。
3. review + health-insight 的 server 計算要移到裝置端（新工程）。
4. 新增金鑰 UX（恢復碼、trusted device、首次啟用、遺失）→ 全新前端流程（字串陣列內嵌，工作量不小）。
5. 遷移狀態機（`legacy→migration_locked→ciphertext_verified→e2ee_only`）+ 相容版 Worker（懂新舊格式）→ 新增 `crypto_mode` 欄位與寫入閘門。
6. `qlive` KV 改存密文或改裝置計算。

---

## 4. 最小改動檔案清單（候選，B2/B3 時才動）
- **新增**：`src/crypto/`（client 端 Web Crypto 封裝/解封裝、恢復碼、金鑰管理 UX 的邏輯來源）；client 端 review 演算法移植（放進 `getHTML` 字串陣列或可注入的模組）。
- **改**：`src/sync/sync_store.js`（payload 視為不透明密文 + crypto_mode 感知）、worker 的 `/api/sync` `/api/review` `/api/health-insight` `/api/qlive`（加密帳號走新路徑、不收明文）、`src/review/*`（抽純函式供 client）、`src/persistence/health_insight/*`（加密帳號不存明文）。
- **migration（附加）**：`memberships`/`users` 無關；需要 `sync_records`/`health_insight_records` 的 `crypto_mode`/格式版本欄位，或新表存密文封裝 + 保險庫參數表（VK 包裝、salt、epoch）。
- **前端**：`getHTML()` 內新增金鑰啟用/恢復/trusted-device UI + 加密同步路徑。

---

## 5. 已確認 vs 未確認
**已確認（第一手讀碼）：**
- 私人內容 server 儲存 = sync_records / review_reports / health_insight_records / qlive（4 處）。
- 無內容日誌、無第三方分析、client 目前未用 crypto.subtle / IndexedDB / SW。
- sync 層已有擁有權/版本/配額/idempotency；meals 不外流。
- 前端無 bundler（字串陣列）。

**未確認（B2 前要查/決定）：**
- 目標瀏覽器對 `AES-KW` unwrap、`HKDF` deriveKey 的實際支援度（需在真機驗證）。
- review 演算法移植到 client 後的體積與維護方式（同一份邏輯 server/client 怎麼共用避免分叉）。
- 遷移批次大小 vs D1 單次 transaction/Worker 執行限制（GPT §7.2 要 checkpoint）。
- D1 Time Travel 保留窗（Free 7 天 / Paid 30 天）對「清理明文後舊備份仍含明文」的告知。

---

## 6. B2 驗收計畫（草案）
隔離測試環境、僅新帳號：
1. 原生 Web Crypto 封裝/解封裝（AES-GCM + AES-KW + HKDF）往返正確；壞 tag/未知版本/跨 record 替換→拒絕且保留原資料。
2. 恢復碼：產生→驗證可解開測試封裝→才允許清理；錯碼不清空。
3. trusted-device（支援的瀏覽器）vs 本次解鎖模式（不支援時）。
4. 密文同步：兩裝置/瀏覽器可各自解；封包與 D1 **無測試明文**。
5. review 移到裝置端：同資料同結果（對照 server 版 12/0 的輸出）。
6. 全部用合成資料，測試報告不放真實飲食記錄。

---

## 7. 需要擁有者 / 法務先決定的事（不由程式代填）
- **方案 3000/35000/48000 的【待定】條件**（期限、通話次數/時長、工作坊名額與期限、48000 永久方案的供給與停辦補救）。GPT 建議 **48000 永久方案先暫緩收款**。
- 「全功能」文案 vs 7 日回顧 beta 兩份限制要一致（GPT §2.4）。
- 服務是否含**健身教練指導** → 可能需專用定型化契約/預收費用保障（法務優先）。
- 文件（服務條款/個資告知/勾選）由台灣法務確認後才作正式收款用。
- **B 和收款順序**：GPT 建議文件與 B1 並行；是否「B 完成前先收費」取決於你對使用者做的隱私承諾——若要以「使用者持鑰、營運者讀不到」當賣點，必須 **B4 完成後**才這樣宣傳。

---

## 8. 結論與下一步
- B1 盤點完成：私人內容 4 處 server + 本機 SK；無內容日誌；前端無 bundler → 原生 Web Crypto。
- **下一步（B2）需要新授權才動工**：在隔離測試環境做「新帳號加密 + 裝置端回顧」試作（不碰正式資料）。
- 平行進行：擁有者填方案【待定】→ 法務確認文件 → 才可收款（人工收款也要同樣告知/紀錄）。
- 本輪**未改程式、未遷移、未收款**。

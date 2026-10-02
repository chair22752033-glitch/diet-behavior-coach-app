# 交接給 GPT 複核：C3（同意記錄）＋ B3（遷移演練）

**日期：** 2026-10-02
**請 GPT 複核這批**。擁有者在你 token 用盡期間授權先做，之後由你複核。所有改動已上線或隔離測試，列明如下。

## 一、C3：同意記錄（已接進正式站並部署）
- **migration 0012_phasec_consent_events.sql**：已套用**正式 D1**。append-only `consent_events`；結構上無恢復碼/金鑰/token/飲食明文/完整 IP 欄位。
- **src/legal/consent_store.js**：recordConsent（只追加）、getLatestConsent、listConsentHistory、hasActiveConsent（server 權威）、sha256Hex（Web Crypto）。
- **src/legal/documents.js**：文件清單 + `fetchDocHash()`——**對「實際服務的頁面內容」計算 sha256**，所以同意綁定當下文字；文件被改 → 舊同意自動失效（content_changed）要重簽。
- **worker.js**：`POST /api/consent`、`GET /api/consent/status`、`GET /api/consent/history`，在 gateway 前攔截，`getCurrentUser` 驗證（未登入 401）。沿用既有攔截式 dispatch（不動 route-count 閘門）。
- **意向書/條款/個資告知**：已上線為靜態頁 `/ui-assets/legal/`（試行草稿 v0.1，定價已填、營運細節【暫定】、誠實隱私段、尚未開放線上付款），並加 LINE 加好友（連結＋QR）。App 使用說明有連結。
- **驗證**：真實 worker 邊界測試 `backups/phasec-consent/test_consent_boundary.mjs` **14/0**（auth gate、grant/status、驗證、append-only 撤回、content_changed、跨使用者隔離、history）；隔離原型 `c_prototype/` 25/0 + 14/0 + 6/0；回歸 1.127 **930/0**（已 fix-forward migrations 數 11→12）。
- **部署版本**：C3 `f45f5427` → LINE/selftest `fbc4e463`（回滾目標 `381e125f`）。

**請 GPT 看的點：** (1) 同意用途命名（`free_trial`/`accept_terms`/`ack_privacy`）與你的設計是否一致；(2) 以「服務頁 HTML 雜湊」當文件版本指紋是否可接受（優點：自動綁定實際文字；缺點：改一個空白就失效重簽）；(3) 免費試用的同意文案與個資法 §8 告知時機（我放在第一次輸入記錄前的意向書頁＋勾選）。

## 二、B3：遷移演練（隔離、假資料、已授權）
- **b2_prototype/migration_drill.mjs + schema_b3.sql + test_b3_migration.mjs（25/0）**：真實 file-backed node:sqlite。
- 狀態機 `legacy → migration_locked → ciphertext_verified → e2ee_only`；鎖寫入、可續 checkpoint 批次（250 筆、模擬中斷不重不漏）、驗證（筆數+內容）、第二瀏覽器恢復碼解密、**crypto-aware rollback**（verified 後禁止回 legacy）、切換、清理；遷移後裝置端回顧與遷移前 server 版一致。

**B3 的兩個誠實發現（請 GPT 納入正式遷移設計）：**
1. **SQLite `DELETE` 不抹除檔案位元組**，明文殘留在 free page，需 `VACUUM` 重寫才清掉（已加入 cleanup）。正式環境 D1 的 `VACUUM` 支援與單次執行上限需你我再確認。
2. **D1 Time Travel 在保留期（Free 7 天 / Paid 30 天）仍保留舊版本**；清理後在該窗內舊明文技術上仍可還原。正式遷移與對外措辭**必須揭露此保留期**，不能說「清理後立即不可還原」。

## 三、尚未做（B4 / 正式遷移，需另行授權）
- 正式使用者資料遷移（單獨授權、且先補手機實機 + 金鑰輪替/撤銷 + 真實 KV）。
- 手機實機：已上線自我檢查頁 `/ui-assets/selftest/`，待擁有者在 iOS Safari/Android Chrome/Firefox 實跑回報。
- B4 獨立安全審查 + 真人跨裝置驗收 + 分批啟用。
- 對外「營運者無法解密」文案：B4 過關前不可用。

## 四、仍待擁有者/法務
- C1 方案【暫定】欄位最終確認（期限、通話次數/時長、工作坊、退費分項）。
- C2 文件送台灣法務定稿（目前為試行草稿）。
- 48,000 永久方案：維持暫緩線上收款。

**請 GPT 複核 C3 的同意模型與 B3 的遷移設計，指出需調整處。**

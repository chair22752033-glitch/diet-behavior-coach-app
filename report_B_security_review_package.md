# 飲食主場秀 — B 階段（E2EE）技術審查包

**日期：** 2026-10-02
**用途：** 給獨立資安審查者（或下週的 GPT 第一輪）複查本專案的端對端加密設計與實作。
**重要聲明：** 目前**尚未**有任何真實使用者資料被加密或遷移；加密的「引擎」在隔離環境驗證完成，**正式 App 的加密讀寫路徑（第 3 步）尚未上線**。本包是「上線前審查」用。

---

## 1. 目標與可信邊界
- **目標**：使用者持有鑰匙；私人記錄在裝置加密、伺服器只存密文；七日回顧改在裝置計算。優先防「資料庫外洩」與「後端直接讀取內容」。
- **不宣稱**：在 B4 通過前，不對外宣稱「營運者無法解密」。
- **已知限制（誠實）**：
  - 同一營運者同時掌握 Web 程式部署——理論上可改版攔截解鎖中的資料（需程式完整性/獨立散布才能對抗，本版不宣稱）。
  - 已解鎖裝置、惡意擴充、XSS、截圖不在本版可完全防護範圍。
  - 遷移前的 D1 Time Travel 舊版本（Free 7 天 / Paid 30 天）仍含明文。

## 2. 要保護的 4 個私人儲存（B1 盤點）
| 儲存 | 內容 | 加密做法 |
| --- | --- | --- |
| D1 `sync_records` | ins/quest 逐筆記錄 | payload 改存 JWE 密文 |
| D1 `review_reports` | 7 日回顧快取 | 改裝置計算，快取存密文 |
| D1 `health_insight_records` | 健康洞察輸入/結果 | 密文；運算移裝置（子系統大，列入 B 後期） |
| KV `qlive` | QUEST 即時狀態 | 加密後才進 KV（B5 已驗） |

## 3. 金鑰設計（實作於 `b2_prototype/vault_crypto.mjs`）
- **封裝**：JWE，`alg=A256KW`（金鑰包裝）、`enc=A256GCM`（內容），jose **6.2.12**（鎖版＋完整性雜湊見 `DEPENDENCY_LOCK.md`）；正式前端用原生 Web Crypto（`/ui-assets/vault/`）。
- **金鑰階層**：
  - VK 保險庫金鑰（每帳號、每 epoch，256-bit 裝置產生）
  - CEK 每筆內容金鑰（每則 JWE 由 jose 現場產生，新 IV）
  - R 恢復碼（256-bit 亂數 → Crockford base32，52 字元）
  - RK 恢復包鑰（HKDF-SHA256(R, salt, info)）
  - DK 裝置金鑰（非匯出 AES-KW，存裝置 IndexedDB）
- **上下文綁定**：JWE 受保護標頭含 `ver/vault_id/rid/rev/epoch/use`，解密後一律再比對（「解得開」≠「接受」）。
- **輪替/撤銷**（B4 已驗）：換恢復碼（同 VK，舊碼失效）；外洩換 VK（新 epoch、重新加密、舊鑰鎖在新資料外）。

## 4. 已上線（正式站，但不碰內容）
- `migration 0013` e2ee_vaults；`/api/vault`（建立/查詢保險庫，單一保險庫、輸入驗證、auth）。
- `/ui-assets/vault/`：鑰匙＋恢復碼產生、確認、信任此裝置（IndexedDB 非匯出金鑰）、免恢復碼解鎖、移除信任。
- 以上**只建立鑰匙與裝置信任**，`crypto_mode=vault_created`，**未動任何現有記錄**。

## 5. 隔離驗證（全綠，synthetic data）
| 套件 | 檢查 | 結果 |
| --- | --- | --- |
| `test_b2.mjs` | 核心加解密、恢復、信任裝置、密文同步、裝置端回顧、威脅模型 | 57/0 |
| `test_review_port.mjs` | 回顧移植邊界（時區/缺值/視窗/未來 ts）vs 正式演算法 | 12/0 |
| `test_b2_real_d1.mjs` | 真實 file-backed D1 + 掃檔無明文 + CAS + 錯誤不漏明文 | 38/0 |
| `test_b3_migration.mjs` | 遷移演練：鎖定→批次（中斷續跑）→驗證→切換→清理→crypto-aware rollback | 25/0 |
| `test_b4_key_rotation.mjs` | 換恢復碼 / 換 VK / 撤銷 | 9/0 |
| `test_b5_kv.mjs` | qlive 加密進 KV、無明文、往返、壞鑰/竄改/錯用途拒 | 10/0 |
| `run_browser_check.mjs` | 真實 Chromium 加解密 | 12/0 |
| `run_idb_check.mjs` | 真實瀏覽器重啟後 IndexedDB 還原、A→B 切換 | 9/0 |
| 真機 | iOS WebKit + 桌機 Blink 自我檢查 | 各 6/6 |
| `test_vault_boundary.mjs` | 正式 `/api/vault` 邊界 | 11/0 |

## 6. 遷移設計（B3，尚未對真資料執行）
狀態機 `legacy → migration_locked → ciphertext_verified → e2ee_only`；逐人：鎖寫入→把明文下載到該使用者裝置→裝置加密→寫密文→驗證（筆數+內容）→第二瀏覽器恢復碼可解→切換→清理（含 VACUUM）。crypto-aware rollback：verified 後禁回明文狀態。

## 7. 審查者請重點看（開放問題）
1. **金鑰 UX**：恢復碼強度/編碼、信任裝置的 IndexedDB 儲存、遺失全部鑰匙的處理是否足夠？
2. **上下文綁定**是否完整涵蓋重放/跨記錄/跨帳號/降級？
3. **輪替**：舊裝置持舊 VK 的實際撤銷邊界是否如文件所述？
4. **遷移**：中斷續跑的冪等性、清理後殘留（DELETE→VACUUM→Time Travel）揭露是否足夠？
5. **正式前端（無打包器）**用原生 Web Crypto 自組封裝 vs jose 的一致性風險。
6. **營運者改版攔截**這個威脅的對外措辭界線。

## 8. 上線前尚未完成（Go-live gates）
- 第 3 步「加密同步 + 裝置端回顧」**接進正式 App**（最大工程，未做）。
- 獨立資安審查（本包用途）＋擁有者本人跨裝置真驗收。
- 真實資料遷移（需 D1 備份 + 擁有者帳號先行 + 單獨授權）。
- Android Chrome / 桌面 Firefox 真機（加分）。
- health_insight 運算裝置端移植。

## 9. 原始碼位置
- 加密核心：`b2_prototype/vault_crypto.mjs`；回顧移植：`b2_prototype/review_portable.mjs`
- 真實 D1 store / 遷移：`b2_prototype/e2ee_sync_store.mjs`、`migration_drill.mjs`、`schema_e2ee.sql`、`schema_b3.sql`
- 正式保險庫：`src/crypto/vault_server.js`、`migrations/0013_phaseb_e2ee_vaults.sql`、worker.js `/api/vault`、`public/ui-assets/vault/`
- 相依鎖：`b2_prototype/DEPENDENCY_LOCK.md`
- 測試：`b2_prototype/test_*.mjs`、`backups/phaseb-vault/test_vault_boundary.mjs`

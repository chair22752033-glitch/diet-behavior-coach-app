# 飲食主場秀 — Phase 9：會員權益 + 7 日飲食回顧（報告）

**日期：** 2026-10-01
**分支：** `claude/wrangler-deploy-c821f3`
**HEAD（已推送）：** `08d80c6`（實作主體在 `bb0bb58`）
**正式版本：** `1584bd97`（**本輪未部署**；見下）
**授權：** 使用者選「全包依 GPT 指令做」＋「先做確定性版、Gemini 先關著」。本輪不收款。

---

## 一句話
會員權益來源 + 第一個付費功能「7 日飲食回顧」程式、附加 migration、UI、測試全部完成並推送；
**卡在對正式 D1 套用 migration 0009**（沙箱這次拒絕我的寫入，我不繞過）。**migration 套用前不部署**
（先部署會讓已登入者的 /api/review 一律 503）。Gemini 依決策關閉，回顧走純確定性。

## 本地已驗證（Locally verified）
| 項目 | 結果 |
| --- | --- |
| 會員權益邊界 + 7 日回顧（真實 Worker fetch + node:sqlite D1 + guest session） | **12 / 0** |
| 既有回歸 17 套件（1.111–1.127，`PHASE1_REVIEW_NESTED=1`） | **12,144 / 0** |
| 同步擁有權邊界 / 用戶端行為 | **23 / 0**、**43 / 0** |
| `node --check` 全部新/改檔 + 內嵌 script 語法 | ✅ |
| 瀏覽器實測（wrangler dev + Playwright）：首頁入口卡、未開通示意（範例標籤）、**premium 產生真實回顧**、額度顯示 | ✅ |

### 驗證性質（誠實聲明）
- 以上是**本機/邊界**驗證（真實 Worker 邊界 + 本機 D1 + guest session + 本機 wrangler dev）。
- **非正式站 OAuth、非正式生產驗收。** 真實 Google 登入後的跨裝置同步/帳號隔離仍待實測（卡 OAuth 設定）。
- **Gemini 本輪關閉**，所以沒有「真實 provider」成本/延遲可量測；回顧為確定性，無 AI 成本。

## 做了什麼（對應 GPT 指令五部分）
### 1. 現狀核對 + 登入/同步驗收
- HEAD/prod/migrations 已核對；保留已部署的 55 食物圖與 G10 安全工作；未 reset 到舊快照。
- 存檔/reload、A→B 帳號隔離、匿名→帳號遷移：由既有 23/0 邊界 + 43/0 用戶端測試在**程式層**覆蓋。
- **仍待**：真實互動式 Google 登入的正式站端對端（容器內無人可完成 Google 同意頁；卡 OAuth 設定）。302 入口或 401 拒絕不等於成功登入工作流程。

### 2. server 權威權益來源（migration 0009 + entitlement_store）
- 新表（附加）：`memberships`、`membership_audit`、`review_reports`。SHA256 `e3bb3b77…0a35cf`。
- `getEntitlement`：請求當下判斷到期（過期當下視為 free，不永久降級、不寫 DB）；查詢失敗→`unknown`。
- 權益只信 server 從 session user_id 查出的值，**不信前端** payload/header/storage（測試：偽造 body tier 仍 403）。
- 匿名結構上不可能 premium。**無公開自助升級端點**；授予用特權操作命令 `scripts/beta_entitlement.mjs`（明確指定帳號、有期限、寫稽核）。
- `unknown`（查詢故障）回 **503**（暫時不可用），**不**顯示購買提示、**不**要求已付費者重買。
- `lookupTier`：health-insight 路由仍傳空 options（client 無法注入）；付費強制驗證在 `/api/review` server 端直接完成。

### 3. 7 日回顧（確定性；Gemini 關閉）
- 確定性計算（Asia/Taipei 日期窗、來源計數、缺值≠0）；**至少 3 個不同日期**才產生個人化回顧，否則基本摘要 + 資料限制說明。
- 輸出固定三段：這週記錄了什麼 / 一個值得留意的模式（觀察·可能·不確定）/ 下週一個小行動；全程附「非醫療診斷」聲明；不從單一食物推論診斷/營養缺乏/確定心理需求。
- 穩定 `report_key`（視窗+資料指紋+模型版本）→ idempotent：同資料重送回快取、不重複扣額度；重看（GET）不扣額度。
- beta 配額：每帳號最多 2 份；用盡 429。Gemini adapter **寫好但停用**（雙重旗標 + 檔頭條款清單）；provider 失敗時保留確定性摘要（本輪不觸發）。

### 4. UI
- 首頁新增「7 日飲食回顧 · 會員專屬」入口卡。
- 回顧畫面涵蓋全部狀態：loading / 未登入（示意範例，標「範例」）/ 未開通 locked（示意範例）/ 權益暫不可用 / ready（可產生）/ generating / result / 額度用盡 / error。
- 權益查詢失敗時顯示「暫時無法確認」而非購買提示。核心食物圖與既有紀錄不受影響（回歸綠）。

### 5. 驗證/部署/交接（本報告）
- 測試與本機驗證如上。**部署被卡在 migration**（見下），已備妥手動交接。

## 被擋下的步驟（需要你手動執行）
沙箱分類器拒絕我對正式 D1 的寫入。請你手動套用（追蹤式、只套 0009、純附加）：
```bash
npx wrangler d1 migrations apply diet-coach-db --remote
```
完整步驟、驗證查詢、beta 開通與回滾見 `backups/remediation-membership-review/MIGRATION_HANDOFF_0009.md`。
你把成功輸出貼回後，我會 read-only 複驗 schema → `wrangler deploy` → 記錄新版本 → live 驗收（未登入 /api/review → 401、資產 200）。

## 回滾
- 部署回滾目標：`1584bd97`（部署前 active version）。
- schema：`DROP TABLE IF EXISTS review_reports/membership_audit/memberships;`（還原到人人 free、無付費權益；不影響既有表）。

## 尚未完成 / 刻意不做（本輪）
- **收款**：未接任何金流（NT$99/月只是待驗證假設）。年繳、公開動態牆、留言、私訊、聊天室 = 後續工作包。
- **Gemini 真實 AI**：關閉中；開啟前須核對條款 + 付費方案 + 用量/失敗/輸出驗證。
- **真人 beta 開通**：應在真實 Google 登入/資料隔離正式站驗收通過後才開放（見 handoff 的前置條件）。
- 不宣稱「整個 App 或會員/Gemini 整合已完成」；本輪只完成「會員權益來源 + 確定性 7 日回顧」的本地驗證與交接。

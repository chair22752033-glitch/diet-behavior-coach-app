# Health Insight Data Persistence Foundation（Phase 6 TASK1.120）

## 目的

讓已登入使用者的Health Insight結果可以被保存下來，為未來的
歷史紀錄回顧、進度追蹤、個人化體驗、Gemini Enhancement Layer
準備資料邊界。本次任務**只**建立persistence boundary本身，
**不**整合Gemini、**不**實作付費/訂閱、**不**修改Intelligence
邏輯。

## 架構位置

```
Health Insight Result（成功的Structured Product Response，TASK1.117既有形狀）
  ↓
Persistence Boundary（這裡）
  ↓
D1 Database（health_insight_records表）
  ↓
未來History / Trend / Personalization
```

## 目錄結構

```
src/persistence/health_insight/
  README.md                            本文件
  health_insight_persistence_service.js  saveHealthInsightRecord() / listHealthInsightRecordsForUser() / shouldPersistHealthInsightRecord()
  index.js                               統一輸出入口
```

對應的D1存取層（`src/db/`底下，延續TASK1.12既有分層）：

```
migrations/0007_phase6_task1_120_health_insight_records.sql   schema
src/db/tables/health_insight_records.js                        D1存取（insert/getById/listByUser/countByUser）
src/db/index.js                                                 新增healthInsightRecords binding
```

## User Ownership（規格明確要求）

只有`identity.authenticated === true`且`identity.userId`是真正
的字串時（`shouldPersistHealthInsightRecord()`），才會嘗試寫入。
匿名使用者（`ANONYMOUS_IDENTITY`）完全不會觸發任何D1寫入，也
**不會**被賦予任何假的`user_id`——延續TASK1.118/1.119已經確立
的"Anonymous users must NOT create fake identities"既有原則。

## Failure Isolation（規格明確要求）

`saveHealthInsightRecord()`永遠不會拋出例外，任何失敗（匿名
使用者、Health Insight本身失敗、db不可用、D1寫入失敗、任何未
預期例外）都安全回傳`{ok:false, reason}`。`src/routes/
health_insight_routes.js`呼叫這個函式後，完全不會因為儲存失敗
而改變回傳給使用者的HTML——"存不進去"跟"使用者拿不到結果"是
兩件完全獨立的事，即使這個migration還沒有真正套用到某個環境的
D1（`health_insight_records`表還不存在），POST
/api/health-insight依然會正常回傳Dashboard，只是這次沒有留下
歷史紀錄。

## Stored Data Boundary（規格明確要求）

**存**：
- `input_snapshot`：Input Experience答案的安全白名單摘要
  （gender/age/height/weight/healthGoal）
- `output_snapshot`：Response Builder成功時的`data`欄位
  （healthObservation/behaviorPattern/recommendation/
  progressTrend/decision）——已經是既有的"對外安全"輸出
- `insight_version`：目前固定`'1.0.0'`（snapshot schema版本，
  跟Intelligence Feature/Capability本身的版本號無關）
- `created_at`

**不存**：OAuth token、session token、密碼、provider憑證、
internal runtime state、execution lifecycle metadata、stack
trace——這個檔案完全不import`src/auth/`、`src/oauth/`、
`src/identity/session_rules.js`，也不接觸例外物件本身。

## Health Insight Flow Integration

`src/routes/health_insight_routes.js`的POST
`/api/health-insight` handler在組出`html`之後，額外呼叫一次
`saveHealthInsightRecord(ctx.db, {identity, payload, structuredResponse})`——
這是"Successful Result → Persistence Service"的具體落地。這個
呼叫**不會**、也**不能**影響回傳給使用者的`{ok:true,
data:{html}}`（延續上方Failure Isolation原則）。`GET
/health-insight`完全不受影響。

## Future Compatibility（規格明確要求，本次任務不實作）

- **History**：`listHealthInsightRecordsForUser(db, userId)`
  已經準備好查詢某使用者的歷史紀錄，目前沒有任何route/
  controller呼叫它。
- **Gemini**：未來的Gemini Enhancement Layer可以讀取
  `output_snapshot`歷史紀錄當作上下文，本次任務完全沒有呼叫
  任何AI SDK/Gemini API。
- **Premium**：未來如果"查看歷史紀錄"變成付費功能，可以在
  `listHealthInsightRecordsForUser()`外面包一層
  `resolveFeaturePermission()`（TASK1.118既有的inert
  placeholder）檢查，本次任務沒有串接。

## Current Limitations（目前限制）

- **沒有任何route/controller呼叫`listHealthInsightRecordsForUser()`**：
  只有寫入路徑被接上，讀取/展示歷史紀錄留給未來任務。
- **`insight_version`目前是固定常數**：沒有跟著Intelligence
  Feature/Capability本身的版本號連動，因為目前那些既有元件本身
  也沒有明確的版本號欄位可以讀取。
- **沒有防止重複寫入/沒有去重邏輯**：同一個使用者連續送出多次
  Input Experience，會產生多筆各自獨立的紀錄，這是刻意的"每次
  請求都是一筆獨立的Health Insight快照"設計，不是bug。

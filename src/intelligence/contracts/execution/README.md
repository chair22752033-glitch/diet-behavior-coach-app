# Intelligence Execution Contract Layer（TASK 1.47）

## 目的

在 Intelligence Service（TASK1.46）跟未來的呼叫端之間定義三個穩定的
執行期合約——request 輸入形狀、options 支援欄位形狀、response 輸出
形狀——讓 `getIntelligence(db, request)` 的邊界不只是「有一個函式可以
呼叫」，而是「這個函式的輸入/輸出形狀明確、穩定、可驗證」。

**這個任務不是 AI 功能開發**：三個 contract 都只做結構驗證（欄位是否
存在、typeof 是否相符），完全不解讀欄位內容、不做任何推論/分類/摘要/
建議。

## 架構位置

```
Application Layer（未來的Controller/API）
  ↓
Intelligence Service（TASK1.46）── 使用這裡的三個contract驗證輸入/輸出
  ↓
Intelligence Orchestrator（TASK1.45）
  ↓
Intelligence Pipeline
```

## 檔案

- `intelligence_request_contract.js`：`validateIntelligenceRequest(request)`
  驗證 `getIntelligence()` 的 request 輸入——必填 `userId`（非空字串），
  選填 `options`（存在時必須是物件，內部欄位規則交給
  `execution_options_contract.js`）。回傳 `{ok:true}` 或
  `{ok:false, reason, field?}`。
- `execution_options_contract.js`：`validateExecutionOptions(options)`
  驗證 `request.options` 支援的欄位（`version`/`includeContext`/
  `includeAnalysis`/`includeRecommendation`）——全部選填，只有「提供
  了但型別不對」才會判定失敗；`options` 本身是 `undefined` 視為合法。
  純粹是型別驗證，不讀取欄位值做任何業務判斷（例如不會因為
  `includeAnalysis===false` 就在這一層做任何事）。
- `intelligence_response_contract.js`：`validateIntelligenceResponse(response)`
  驗證 Orchestrator 產生、Service 即將回傳給呼叫端的 Unified
  Intelligence Result——必須具備 `status`/`context`/`analysis`/
  `recommendation`/`metadata` 五個欄位，`status` 必須等於固定字串
  `"intelligence_ready"`（`EXPECTED_STATUS`）。
- `index.js`：統一輸出上述三個 contract 物件跟其驗證函式。

## 規則

- **deterministic validation**：同樣的輸入，任何時候呼叫都得到完全
  相同的驗證結果，三個檔案都不讀取 `Date.now()`/`Math.random()`/任何
  外部狀態。
- **no business logic**：三個驗證函式只檢查形狀，完全不依欄位值做
  任何分支決策（`includeAnalysis`/`includeContext`/
  `includeRecommendation` 的值本身在這一層完全不被讀取去決定任何事，
  只驗證它們的型別）。
- **no AI decision**：不做任何推論、分類、摘要、建議、prompt組裝。

## 跟 Intelligence Service 的關係

`src/intelligence/service/intelligence_service.js` 的
`getIntelligence(db, request)` 依序使用這三個 contract：

1. `validateIntelligenceRequest(request)` 驗證輸入形狀
2. `validateExecutionOptions(request.options)` 驗證 `options` 的支援
   欄位型別（`request.options` 為 `undefined` 時視為合法，跳過）
3. 呼叫 `orchestrator.runIntelligencePipeline()`（**完全沒有修改**——
   本次任務明確禁止修改 Orchestrator/Analysis/Recommendation 邏輯）
4. `validateIntelligenceResponse(outcome.data.result)` 驗證回應形狀，
   確保即使底下 Orchestrator 未來演進，只要仍遵守這個 contract，
   Service 對外的行為就不會改變

任何一步驗證失敗都立刻回傳 `{ok:false, reason}` 並停止，不會用不完整
或不符合形狀的資料頂替繼續執行。

## 目前狀態

- `src/intelligence/index.js` 新增 `executionContracts` namespace
  re-export（`export * as executionContracts from
  './contracts/execution/index.js';`）。
- `src/intelligence/service/intelligence_service.js` 改為使用這三個
  contract 驗證 request/options/response，`getIntelligence()` 對外的
  回傳格式（`{ok:true, data}` / `{ok:false, reason}`）完全沒有改變。
- Orchestrator（`src/intelligence/orchestration/`）、Analysis Runner
  （`src/intelligence/analysis/`）、Recommendation Runner
  （`src/intelligence/recommendation/`）三者的邏輯**完全沒有被修改**。
- `src/bootstrap/application.js` 本次**不需要修改**——這幾個 contract
  是純函式驗證工具，由 `intelligence_service.js` 內部 import 使用，
  不是需要在 `createApplication()` 組裝的獨立子層實例，
  `application.intelligence.service` 底層行為透過 TASK1.46 既有的
  `createIntelligenceService()` 呼叫路徑自動套用這些新的驗證邏輯。

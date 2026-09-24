# Intelligence Application Feature Entry（TASK 1.65，Phase 3）

## 目的

建立Phase 3第一個完整的Intelligence Application Feature Entry
Flow——本次**不是建立API，也不是建立UI，也不是導入AI**，目的是
驗證Phase 3 Application Architecture（TASK1.60~1.64建立的
Application Service/Use Case/Capability/Contract/Workflow五層）
真的可以承載一個從頭到尾的Intelligence Feature Flow，不只是各自
獨立通過測試的孤立extension point。

**這個任務不是 AI 功能開發**：Feature Layer只做四件事——定義
Intelligence Feature Entry、建立Feature Request mapping、呼叫
Workflow、統一Feature Result，完全不做任何推論、分類、摘要、建議。

## 架構位置

```
User Feature Request
  ↓
Feature Layer（這裡）
  ↓
Workflow（TASK1.64）
  ↓
Capability（TASK1.62）
  ↓
Use Case（TASK1.61）
  ↓
Application Service（TASK1.60）
  ↓
Intelligence Facade（TASK1.48）
  ↓
Runtime
```

`insight_feature.js`完全不import
`src/intelligence/application/capabilities/`、
`src/intelligence/application/use_cases/`、
`src/intelligence/application/application_service.js`、
`src/intelligence/facade/`、`src/intelligence/execution/`、
`src/intelligence/history/`、`src/intelligence/metrics/`、
`src/intelligence/events/`、`src/intelligence/service/`、
`src/intelligence/orchestration/`、`src/intelligence/analysis/`、
`src/intelligence/recommendation/`、
`src/intelligence/governance/`底下任何檔案——`workflow`一律是透過
`createInsightFeature({workflow})`依賴注入傳入的、符合最小介面
（`{executeApplicationRequest}`）的不透明物件，維持「每一層只認識
自己呼叫的下一層」的既有慣例（跟TASK1.64
`application_workflow.js`只認識Capability、不認識更底層的Use
Case/Application Service/Facade是同一種設計，這裡再往上疊一層）。

## 檔案

- `insight_feature.js`：`createInsightFeature(dependencies)`，提供
  `requestInsightFeature(db, request)`——驗證輸入 →
  `mapFeatureRequestToApplicationRequest()`把Feature Request明確
  重新組裝成Application Request（只挑選已知欄位：
  `userId`/`options`/`requestId`/`version`/`timestamp`/`metadata`，
  不是原封不動的pass-through）→ 呼叫
  `workflow.executeApplicationRequest()`（唯一允許呼叫的下一層）→
  回傳穩定的feature結果格式。任何一步失敗都立刻回傳
  `{ok:false, feature:'insight', reason}`，不會用不完整的資料頂替
  繼續執行。內建的`validateFeatureRequest()`只檢查`userId`是否為
  非空字串、`options`（選填）是否為物件，跟其他層規則一致但不重用
  彼此的驗證函式（維持邊界獨立）——**不**重用Contract Layer
  （TASK1.63），因為「驗證Contract」是規格明確列給Workflow Layer
  的責任，不是Feature Layer的責任；Feature呼叫Workflow時，Contract
  驗證仍然會在Workflow內部再次執行，這是刻意保留的重複防護。
- `feature_result_builder.js`：`createFeatureResultBuilder()`，
  提供`buildSuccessResult(feature, workflowData)`（組出
  `{ok:true, feature, data:{status, result, metadata}}`）跟
  `buildFailureResult(feature, reason)`（組出
  `{ok:false, feature, reason}`）。這個形狀看起來跟Workflow的回傳
  形狀一樣，只是把`workflow`欄位換成`feature`欄位，而且是Feature
  Layer自己獨立組裝出來的，不是直接轉傳Workflow的回傳值。
- `index.js`：統一輸出上述兩個檔案的內容。

## 規則（Feature Layer may call / must NOT call）

- ✅ 只能呼叫Workflow（`workflow.executeApplicationRequest()`）。
- ❌ **不得**直接呼叫Capability、Use Case、Application Service、
  Intelligence Facade（一律透過Workflow間接呼叫）。
- ❌ **不得**直接呼叫Execution Manager（規格明確禁止的捷徑
  「Feature → Execution Runtime」）。
- ❌ **不得**直接存取History Store、Metrics Store、Event
  Dispatcher。
- ❌ **不得**直接存取Database（規格明確禁止的捷徑
  「Feature → Database」）——db只是原樣轉交給
  `workflow.executeApplicationRequest()`的不透明參數。
- ❌ **不得**呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
  「Feature → AI Provider」）。
- ❌ **不得**繞過Workflow直接import Capability/Use Case/
  Application Service/Facade/Service/Orchestrator/Analysis/
  Recommendation/Data Preparation/Governance任何一層。
- ❌ **不得**import `src/services/`（既有Domain Service）。
- ❌ **不得**import `src/auth/`、`src/oauth/`、`src/identity/`、
  `src/middleware/`。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
User Feature Request → Feature Layer → Workflow → Capability
  → Use Case → Application Service → Intelligence Facade → Runtime
```

**禁止**：
```
Feature → Execution Runtime   ❌
Feature → Database             ❌
Feature → AI Provider          ❌
```

## 目前狀態

- `src/intelligence/application/index.js` 新增
  `export * as features from './features/index.js';`。
- `src/bootstrap/application.js` 新增
  `application.intelligence.features`，組裝
  `createInsightFeature({workflow})`實例——注入的是跟
  `intelligence.workflow`完全相同的Application Workflow實例（不是
  各自建立第二份）。純粹的依賴注入組裝，不影響
  `intelligence.workflow`/`intelligence.capabilities`/
  `intelligence.useCases`/`intelligence.application`/
  `intelligence.facade`/其餘既有欄位的行為。
- Workflow（`application_workflow.js`）、Capability
  （`insight_capability.js`）、Use Case
  （`insight_use_case.js`）、Application Service
  （`application_service.js`）、Facade、Execution Manager六者的
  原始碼**完全沒有被修改**——本次任務明確禁止觸碰它們（Execution
  Runtime Behavior不變）。
- 完全沒有連接任何 route/controller/`worker.js`，也沒有新增任何
  API route——這是Phase 3第一次完整端到端串接（Feature→Workflow
  →Capability→Use Case→Application Service→Facade→Runtime），
  驗證了Phase 3 Application Architecture可以承載真正的Intelligence
  Feature Flow，讓未來實際建立User Application時有一個現成、
  已測試過、涵蓋完整鏈路的Feature Entry可以呼叫。

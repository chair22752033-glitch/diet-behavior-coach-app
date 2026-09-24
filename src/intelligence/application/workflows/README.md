# Intelligence Application Workflow Layer（TASK 1.64，Phase 3）

## 目的

建立Application Request Workflow Boundary，負責協調Capability
Layer（TASK1.62）、Use Case Layer（TASK1.61，透過Capability間接）、
Application Contract（TASK1.63）三者，形成一致的Application執行
流程——本次**不是建立API，也不是建立UI，也不是導入AI**，目的是讓
未來User Application有一個單一、穩定、已經內建Contract驗證的
Application Request入口。

**這個任務不是 AI 功能開發**：Workflow Layer只做四件事——接收
Application Request、驗證Contract、導向Capability/Use Case、統一
Workflow Result，完全不做任何推論、分類、摘要、建議。

## 架構位置

```
User Application
  ↓
Workflow Layer（這裡）
  ↓
Capability Layer（TASK1.62）
  ↓
Use Case Layer（TASK1.61）
  ↓
Application Contract（TASK1.63）
  ↓
Application Service（TASK1.60）
  ↓
Intelligence Facade（TASK1.48）
  ↓
Runtime
```

`application_workflow.js`完全不import
`src/intelligence/application/use_cases/`、
`src/intelligence/application/application_service.js`、
`src/intelligence/facade/`、`src/intelligence/execution/`、
`src/intelligence/history/`、`src/intelligence/metrics/`、
`src/intelligence/events/`、`src/intelligence/service/`、
`src/intelligence/orchestration/`、`src/intelligence/analysis/`、
`src/intelligence/recommendation/`、
`src/intelligence/governance/`底下任何檔案——`capability`跟
`contractValidator`一律是透過
`createApplicationWorkflow({capability, contractValidator})`依賴
注入傳入的、符合最小介面的不透明物件，維持「每一層只認識自己呼叫
的下一層」的既有慣例。

## 跟前面幾層的關鍵差異：實際採用Contract Layer

TASK1.60（Application Service）、TASK1.61（Use Case）、TASK1.62
（Capability）三層都各自內建一模一樣的`validateXxxRequest()`
函式，刻意不重用TASK1.63的Contract Layer（維持「每一層邊界獨立」
的決策）。**Workflow Layer是第一個實際採用Contract Layer的
層**——它完全沒有內建自己的request驗證函式，`executeApplicationRequest()`
的輸入驗證完全委派給注入的`contractValidator.validateRequest()`，
回應形狀也用`contractValidator.validateResponse()`驗證，這是
TASK1.63建立的Contract Layer第一次被實際使用，不再是「建立但沒有
任何人使用」的孤立extension point。

## 檔案

- `application_workflow.js`：`createApplicationWorkflow(dependencies)`，
  提供`executeApplicationRequest(db, request)`——驗證Contract
  （`contractValidator.validateRequest()`）→ 呼叫
  `capability.requestInsightCapability()`（唯一允許呼叫的下一層）
  → 驗證回應Contract（`contractValidator.validateResponse()`）→
  回傳穩定的workflow結果格式。任何一步失敗都立刻回傳
  `{ok:false, workflow:'application_request', reason}`，不會用
  不完整的資料頂替繼續執行。
- `workflow_result_builder.js`：`createWorkflowResultBuilder()`，
  提供`buildSuccessResult(workflow, capabilityData)`（組出
  `{ok:true, workflow, data:{status, result, metadata}}`）跟
  `buildFailureResult(workflow, reason)`（組出
  `{ok:false, workflow, reason}`）。這個形狀看起來跟Capability的
  回傳形狀一樣，只是把`capability`欄位換成`workflow`欄位，而且是
  Workflow Layer自己獨立組裝出來的，不是直接轉傳Capability的回傳
  值。
- `index.js`：統一輸出上述兩個檔案的內容。

## 規則（Workflow Layer may call / must NOT call）

- ✅ 只能呼叫Capability（`capability.requestInsightCapability()`）
  跟Contract Validator（`contractValidator.validateRequest()`/
  `validateResponse()`）。
- ❌ **不得**直接呼叫Use Case（一律透過Capability間接呼叫）。
- ❌ **不得**直接呼叫Application Service或Intelligence Facade。
- ❌ **不得**直接呼叫Execution Manager（規格明確禁止的捷徑
  「Workflow → Execution Manager」）。
- ❌ **不得**直接存取History Store、Metrics Store、Event
  Dispatcher。
- ❌ **不得**直接存取Database（規格明確禁止的捷徑
  「Workflow → Database」）——db只是原樣轉交給
  `capability.requestInsightCapability()`的不透明參數。
- ❌ **不得**呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
  「Workflow → AI Provider」）。
- ❌ **不得**繞過Capability直接import Use Case/Application
  Service/Facade/Service/Orchestrator/Analysis/Recommendation/
  Data Preparation/Governance任何一層。
- ❌ **不得**import `src/services/`（既有Domain Service）。
- ❌ **不得**import `src/auth/`、`src/oauth/`、`src/identity/`、
  `src/middleware/`。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
User Application → Workflow Layer → Capability Layer → Use Case Layer
  → Application Contract → Application Service → Intelligence Facade
  → Runtime
```

**禁止**：
```
Workflow → Execution Manager   ❌
Workflow → Database             ❌
Workflow → AI Provider          ❌
```

## 目前狀態

- `src/intelligence/application/index.js` 新增
  `export * as workflows from './workflows/index.js';`。
- `src/bootstrap/application.js` 新增
  `application.intelligence.workflow`，組裝
  `createApplicationWorkflow({capability, contractValidator})`
  實例——注入的`capability`是跟`intelligence.capabilities`完全
  相同的Insight Capability實例，`contractValidator`是新建立的
  `intelligenceApplicationNamespace.contracts.createContractValidator()`
  實例。純粹的依賴注入組裝，不影響`intelligence.capabilities`/
  `intelligence.useCases`/`intelligence.application`/
  `intelligence.facade`/其餘既有欄位的行為。
- Capability（`insight_capability.js`）、Use Case
  （`insight_use_case.js`）、Application Service
  （`application_service.js`）、Facade、Execution Manager五者的
  原始碼**完全沒有被修改**——本次任務明確禁止觸碰它們（Execution
  Runtime Behavior不變）。
- 完全沒有連接任何 route/controller/`worker.js`，也沒有新增任何
  API route——這是Phase 3第一個真正串起Capability/Use Case/
  Contract三個既有Foundation元件的協調層，讓未來實際建立User
  Application時有一個現成、已測試過、內建Contract驗證的Application
  Request Flow可以呼叫。

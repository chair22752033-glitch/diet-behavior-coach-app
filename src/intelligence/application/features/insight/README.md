# Insight Feature Capability Implementation（TASK 1.66，Phase 3）

## 目的

在既有Feature Entry Architecture（TASK1.65）上，建立Insight
Feature的明確Capability Implementation Boundary——本次**不是
建立API，也不是建立UI，也不是導入AI**，目的是驗證

```
Feature → Workflow → Capability → Use Case → Application Service
  → Intelligence Runtime
```

可以承載一個「正式」的、有domain intent的Intelligence Feature，
而不只是TASK1.65那個證明架構走得通的通用骨架。

**這個任務不是 AI 功能開發**：Insight Feature Capability只做四件
事——定義Insight Feature domain intent、將Feature request轉換成
對應Capability request、呼叫既有Workflow、統一Insight Feature
output，完全不做任何推論、分類、摘要、建議。

## 跟TASK1.65 `features/insight_feature.js`的關係

TASK1.65建立的`insight_feature.js`是Phase 3**第一個**Feature
Entry，目的是驗證「Feature→Workflow→Capability→Use Case→
Application Service→Runtime」這條鏈路架構上可以走通——它是通用、
未來可能被其他Feature複製的骨架。

這個目錄（`features/insight/`）則是**Insight這個domain自己明確的
Capability實作**：
- `insight_result_mapper.js`不像TASK1.65
  `feature_result_builder.js`那樣接受`feature`參數當作任何Feature
  共用的泛用result builder，而是**固定**回傳`feature: 'insight'`
  ——因為這個檔案存在的目的就是「Insight Feature Capability的輸出
  格式」，不是通用工具。
- `insight_capability.js`明確定義了`INSIGHT_DOMAIN = 'insight'`
  這個domain intent，把它跟未來其他可能的Feature domain
  （例如未來可能出現的其他Intelligence能力）在概念上區分開來。

兩者目前**功能上高度重疊**（都是驗證+映射+呼叫Workflow+包裝
輸出），這是刻意保留的：TASK1.65證明「架構通用骨架可行」，TASK1.66
證明「specific domain implementation也可行、而且兩者可以並存，
不會互相干擾」。

## 架構位置

```
User Insight Request
  ↓
Insight Feature（這裡）
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

`insight_capability.js`完全不import
`src/intelligence/application/capabilities/`、
`src/intelligence/application/use_cases/`、
`src/intelligence/application/application_service.js`、
`src/intelligence/facade/`、`src/intelligence/execution/`、
`src/intelligence/history/`、`src/intelligence/metrics/`、
`src/intelligence/events/`、`src/intelligence/service/`、
`src/intelligence/orchestration/`、`src/intelligence/analysis/`、
`src/intelligence/recommendation/`、
`src/intelligence/governance/`底下任何檔案——即使規格文字說「將
Feature request轉換成對應Capability request」，實際唯一呼叫的下一
層仍然只有Workflow（`workflow.executeApplicationRequest()`），
`workflow`一律是透過依賴注入傳入的、符合最小介面的不透明物件。

## 檔案

- `insight_capability.js`：`createInsightFeatureCapability(dependencies)`，
  提供`requestInsight(db, request)`——驗證輸入 →
  `mapInsightFeatureRequestToCapabilityRequest()`把Feature request
  明確重新組裝成Capability request（只挑選已知欄位，不是原封不動
  的pass-through）→ 呼叫`workflow.executeApplicationRequest()`
  （唯一允許呼叫的下一層）→ 統一Insight Feature output。任何一步
  失敗都立刻回傳`{ok:false, feature:'insight', reason}`。內建的
  `validateInsightFeatureRequest()`只檢查`userId`是否為非空字串、
  `options`（選填）是否為物件，跟其他層規則一致但不重用彼此的
  驗證函式（維持邊界獨立）——不重用Contract Layer（TASK1.63），
  因為「驗證Contract」是規格明確列給Workflow的責任。
- `insight_result_mapper.js`：`createInsightResultMapper()`，提供
  `mapSuccessResult(workflowData)`（組出
  `{ok:true, feature:'insight', data:{status, result, metadata}}`）
  跟`mapFailureResult(reason)`（組出
  `{ok:false, feature:'insight', reason}`）。跟TASK1.65
  `feature_result_builder.js`不同，這裡`feature`欄位固定為字面值
  `'insight'`，不接受參數——這是專屬於Insight domain的result
  mapper，不是任何Feature共用的通用工具。
- `index.js`：統一輸出上述兩個檔案的內容。

## 規則（Insight Feature Capability may call / must NOT call）

- ✅ 只能呼叫Workflow（`workflow.executeApplicationRequest()`）。
- ❌ **不得**直接呼叫Capability、Use Case、Application Service、
  Intelligence Facade（一律透過Workflow間接呼叫）。
- ❌ **不得**直接呼叫Execution Manager（規格明確禁止的捷徑
  「Insight Feature → Execution Runtime」）。
- ❌ **不得**直接存取History Store、Metrics Store、Event
  Dispatcher。
- ❌ **不得**直接存取Database（規格明確禁止的捷徑
  「Insight Feature → Database」）——db只是原樣轉交給
  `workflow.executeApplicationRequest()`的不透明參數。
- ❌ **不得**呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
  「Insight Feature → AI Provider」）。
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
User Insight Request → Insight Feature → Workflow → Capability
  → Use Case → Application Service → Intelligence Facade → Runtime
```

**禁止**：
```
Insight Feature → Database          ❌
Insight Feature → Execution Runtime ❌
Insight Feature → AI Provider       ❌
```

## 目前狀態

- `src/bootstrap/application.js` 新增
  `application.intelligence.insightFeature`，組裝
  `createInsightFeatureCapability({workflow})`實例——注入的是跟
  `intelligence.workflow`完全相同的Application Workflow實例（不是
  各自建立第二份）。純粹的依賴注入組裝，不影響
  `intelligence.workflow`/`intelligence.features`/
  `intelligence.capabilities`/`intelligence.useCases`/
  `intelligence.application`/`intelligence.facade`/其餘既有欄位
  的行為。這是獨立於`intelligence.features`（TASK1.65）的新欄位，
  兩者並存，互不覆蓋。
- Workflow（`application_workflow.js`）、Capability
  （`insight_capability.js`，位於`capabilities/`）、Use Case
  （`insight_use_case.js`）、Application Service
  （`application_service.js`）、Facade、Execution Manager六者的
  原始碼**完全沒有被修改**——本次任務明確禁止觸碰它們（Execution
  Runtime Behavior不變）。TASK1.65的
  `features/insight_feature.js`也完全沒有被修改。
- 完全沒有連接任何 route/controller/`worker.js`，也沒有新增任何
  API route——這是Phase 3第一個「正式」的domain-specific Feature
  Capability，驗證了Feature Entry Architecture可以承載一個明確
  定義domain intent的Insight Feature，不只是通用骨架。

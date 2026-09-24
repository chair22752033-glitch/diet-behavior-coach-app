# Insight Feature Execution Flow（Phase 3 TASK1.69）

## 架構位置

```
Insight Feature
  ↓
Insight Execution Flow（這裡）
  ↓
Insight Workflow（TASK1.64）
  ↓
Capability（TASK1.62）
  ↓
Use Case（TASK1.61）
  ↓
Application Service（TASK1.60）
  ↓
Intelligence Runtime
  ↓
Insight Output
```

## 責任

- 接收 Insight Feature Request（自己內建最小驗證：`userId` 必須是
  非空字串，`options` 若存在必須是物件）
- 呼叫既有 Insight Workflow（透過依賴注入拿到的
  `workflow.executeApplicationRequest()`——唯一允許呼叫的下一層）
- 管理 Feature 層執行流程：Workflow 成功後，依序呼叫
  `contextMapper.mapRuntimeContextToInsightDomain()`（TASK1.67）攤平
  Runtime Result，再呼叫 `outputMapper.mapToInsightOutput()`
  （TASK1.68）轉換並驗證成 `InsightOutputModel` 形狀
- 回傳 Insight Output：透過 `insight_execution_result_builder.js`
  統一包裝成 `{ok:true, feature:'insight', output}` 或
  `{ok:false, feature:'insight', reason}`

## 禁止呼叫（規格明確禁止的捷徑）

- ❌ Insight Feature → Execution Manager（不 import
  `src/intelligence/execution/`）
- ❌ Insight Feature → Database（不 import `src/db/`，`db` 只是原樣
  轉交給 `workflow.executeApplicationRequest()` 的不透明參數）
- ❌ Insight Feature → AI Provider（不呼叫任何 AI SDK）
- ❌ 不直接呼叫 Capability / Use Case / Application Service / Facade
  （全部透過 Workflow 間接呼叫）
- ❌ 不直接存取 History Store、Metrics Store、Event Dispatcher
- ❌ 不 import `src/auth/`、`src/oauth/`、任何路由/controller

## 架構決策：Active Orchestrator（跟 TASK1.67/1.68 的邊界決策不同）

TASK1.67（Insight Context Mapper）跟 TASK1.68（Insight Output
Mapper）都是「建立但不改變既有 execution behavior」的**被動純函式
extension point**——刻意不被任何既有層 import、不寫入
`bootstrap/application.js`，用測試證明「事實上可以消費」即可。

TASK1.69 的規格用詞不同：「接收 Insight Feature Request、**呼叫既有
Insight Workflow**、管理 Feature 層執行流程、回傳 Insight
Output」——這是明確的 orchestration 責任，跟 TASK1.64（Workflow
Layer，主動呼叫並消費 TASK1.63 Contract Layer）屬於同一種模式：
**主動組裝、寫入 bootstrap 的 active orchestrator**。

因此 Insight Execution Flow 是 Phase 3「Insight Feature」系列裡第一
個真正把 Context Mapper 跟 Output Mapper 接上真實呼叫鏈、並寫入
`bootstrap/application.js`（新欄位 `intelligence.insightExecutionFlow`）
的層——這是 Insight Domain 第一次端到端跑完「Request → Workflow →
Context Mapping → Output Mapping」整條流程後，得到一個保證通過
`validateInsightOutput()` 驗證的合法輸出。

`insight_capability.js`（TASK1.66，`intelligence.insightFeature`）本身
完全沒有被修改——兩者是並存的兩個 Insight Feature entry point：

| | 回傳格式 | `result`/`output`形狀 |
|---|---|---|
| TASK1.66 `insightFeature` | `{ok, feature, data:{status, result, metadata}}` | `result` 維持不透明 pass-through |
| TASK1.69 `insightExecutionFlow` | `{ok, feature, output}` | `output` 保證通過 `validateInsightOutput()` |

## 檔案

- `insight_execution_flow.js` — `createInsightExecutionFlow({workflow,
  contextMapper, outputMapper, resultBuilder?})`，回傳
  `{runInsightExecution(db, request)}`
- `insight_execution_result_builder.js` —
  `createInsightExecutionResultBuilder()`，回傳
  `{buildSuccessResult(output), buildFailureResult(reason)}`
- `index.js` — 統一輸出入口
- `README.md` — 本檔案

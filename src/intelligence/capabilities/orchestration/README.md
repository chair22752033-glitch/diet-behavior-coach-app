# Intelligence Capability Orchestration Foundation（Phase 4 TASK1.78，
TASK1.86後更新：新增選填的Decision Capability整合）

## 目的

建立Phase 4**第三個**Intelligence Capability
Boundary——本次**不是**導入AI、**不是**建立AI Provider、**不是**
修改Phase 2 Runtime Orchestrator，目的是把已經各自獨立存在的
TASK1.76 Analysis Capability跟TASK1.77 Recommendation Capability
組合成一條完整的Intelligence Capability Flow，讓Application
Feature（未來）可以透過單一個Capability Orchestration邊界，一次
拿到「Analysis + Recommendation」組合後的Unified Capability
Result。

這是繼TASK1.76/1.77之後，依照TASK1.75 Phase 4 Capability
Architecture Planning（見`../../PHASE4_CAPABILITY_PLAN.md`）規劃
結論的第三次落地。

## 架構位置

```
Feature（未來擴充，本次任務不新增/不修改任何Feature）
  ↓
Capability Orchestrator（這裡）
  ↓
Analysis Capability（TASK1.76，完全不修改）
  ↓
Recommendation Capability（TASK1.77，完全不修改）
  ↓（TASK1.86新增：若有提供decisionCapability，多一步）
Decision Capability（TASK1.83，完全不修改）
  ↓
Capability Result
```

## TASK1.86新增：選填的Decision Capability整合

依照TASK1.85 Integration Architecture Plan
（`../../PHASE4_DECISION_INTEGRATION_PLAN.md`）記錄的設計圖，
`createCapabilityOrchestrator()`新增一個**選填**的
`decisionCapability`依賴：

- **沒有提供**時（`undefined`/`null`，或沒有`requestDecision`
  函式）：完全維持TASK1.78建立當下的既有行為，只呼叫Analysis
  Capability跟Recommendation Capability，Unified Capability
  Result恰好只有`{analysis, recommendation}`兩個欄位——這是
  **Backward Compatibility**的保證。
- **有提供**時：Recommendation Capability成功後，多一步把
  `recommendationOutcome.result`包成`{recommendationResult}`
  轉交給`decisionCapability.requestDecision()`，成功時Unified
  Capability Result會多一個`decision`欄位（目前依然是TASK1.83/
  1.84建立的`decision: null`佔位形狀），失敗時回傳
  `{ok:false, capability:'orchestration', reason, field?, stage:'decision'}`。

## 跟Phase 2 Runtime Orchestrator的差異

`src/intelligence/orchestration/`（TASK1.45，Phase 2）協調的是
Runtime層的四個服務模組（dataPreparation/context/analysis/
recommendation，透過`intelligence_orchestrator.js`）。

這裡的Capability Orchestrator是完全不同架構位置的另一種
「Orchestrator」——協調的是Phase 4的兩個Capability實例（透過依賴
注入拿到的`analysisCapability`/`recommendationCapability`，不是
Runner，也不是Phase 2 Runtime Orchestrator本身）。兩者刻意放在
不同目錄（`src/intelligence/orchestration/` vs
`src/intelligence/capabilities/orchestration/`），互不import、
互不認識。本次任務完全沒有修改Phase 2 Runtime Orchestrator。

## 檔案

- `capability_orchestrator.js`：
  `createCapabilityOrchestrator({analysisCapability, recommendationCapability, decisionCapability?})`，
  提供`requestCapabilityFlow(request)`——驗證輸入
  （`request.context`是否為物件、`request.options`選填是否為
  物件，跟Analysis Capability的request形狀完全相同）→ 呼叫
  `analysisCapability.requestAnalysis()` → 把回傳的`result`轉交給
  `recommendationCapability.requestRecommendation({analysisResult})`
  →（TASK1.86新增，選填）若有提供`decisionCapability`，把回傳的
  `result`轉交給
  `decisionCapability.requestDecision({recommendationResult})`
  → 用`capability_result_builder.js`統一包裝結果。任何一步失敗都
  立刻回傳
  `{ok:false, capability:'orchestration', reason, field?, stage?}`，
  `stage`欄位（'analysis'|'recommendation'|'decision'）指出
  Unified Flow在哪一段失敗。這是同步函式，跟底層Capability的
  同步簽名完全一致。
- `capability_result_builder.js`：
  `createCapabilityOrchestratorResultBuilder()`，提供
  `buildSuccessResult(analysisResult, recommendationResult, decisionResult?)`（組出
  `{ok:true, capability:'orchestration', result:{analysis, recommendation, decision?}}`，
  每段Result各自保留原本形狀，不重新拆開合併；`decisionResult`
  是選填的第三個參數，只在明確傳入時才會把`decision`這個key
  加進`result`）跟`buildFailureResult(reason, field?, stage?)`（組出
  `{ok:false, capability:'orchestration', reason, field?, stage?}`）。
- `index.js`：統一輸出上述兩個檔案的內容。
- `README.md`：本檔案。

## 規則（Capability Orchestrator may call / must NOT call）

- ✅ 只能呼叫Analysis Capability、Recommendation
  Capability，跟（TASK1.86新增，選填）Decision
  Capability（各自的`requestAnalysis()`/
  `requestRecommendation()`/`requestDecision()`）。
- ❌ **不得**繞過Capability直接呼叫Analysis Runner/Recommendation
  Runner（不import`src/intelligence/analysis/`、
  `src/intelligence/recommendation/`；Decision Capability整合
  同樣不import`src/intelligence/capabilities/decision/`底下任何
  實作檔案，只透過依賴注入拿到的`decisionCapability`介面呼叫）。
- ❌ **不得**直接存取Database（不import`src/db/`，完全不接受db
  參數）。
- ❌ **不得**直接存取Auth/Session（不import`src/auth/`、
  `src/oauth/`、`src/identity/`、`src/middleware/`）。
- ❌ **不得**直接呼叫Execution Manager（不import
  `src/intelligence/execution/`）。
- ❌ **不得**直接存取History Store、Metrics Store、Event
  Dispatcher（不import`src/intelligence/history/`、
  `src/intelligence/metrics/`、`src/intelligence/events/`）。
- ❌ **不得**import`src/intelligence/facade/`、`service/`、
  `orchestration/`（Phase 2 Runtime Orchestrator）、
  `data_preparation/`、`governance/`、`application/`。
- ❌ **不得**呼叫任何AI Provider/AI SDK、不建立任何Prompt Logic。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
Feature → Capability Orchestrator → Analysis Capability → Recommendation Capability → Capability Result
```

**禁止**：
```
Capability Layer → AI Provider              ❌
Capability Layer → Database                 ❌
Capability Layer → Runtime Internal Component ❌
```

## 目前狀態

- **沒有**接進`src/bootstrap/application.js`的`intelligence`
  物件，**沒有**任何既有Feature（Insight/Behavior/Intelligence）
  呼叫它、也**沒有**讓Feature Integration
  （TASK1.79）注入`decisionCapability`——這是刻意的邊界決策，跟
  TASK1.76/1.77同樣的模式：「建立但不改變既有execution
  behavior」，用測試證明Analysis + Recommendation（+選填的
  Decision）可以被安全組合執行即可。
- `analysis_runner.js`（TASK1.43）/`recommendation_runner.js`
  （TASK1.44）/`analysis_capability.js`（TASK1.76）/
  `recommendation_capability.js`（TASK1.77）/`decision_
  capability.js`（TASK1.83）/Phase 2 Runtime
  Orchestrator（`src/intelligence/orchestration/`，TASK1.45）本身
  完全沒有被修改。
- Phase 3 Application Layer（`application/`整個目錄樹）跟
  `src/bootstrap/application.js`完全沒有被修改。
- 完全沒有連接任何route/controller/`worker.js`，也沒有新增任何
  API route。

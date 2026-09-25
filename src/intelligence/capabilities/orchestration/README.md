# Intelligence Capability Orchestration Foundation（Phase 4 TASK1.78）

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
  ↓
Capability Result
```

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
  `createCapabilityOrchestrator({analysisCapability, recommendationCapability})`，
  提供`requestCapabilityFlow(request)`——驗證輸入
  （`request.context`是否為物件、`request.options`選填是否為
  物件，跟Analysis Capability的request形狀完全相同）→ 呼叫
  `analysisCapability.requestAnalysis()` → 把回傳的`result`轉交給
  `recommendationCapability.requestRecommendation({analysisResult})`
  → 用`capability_result_builder.js`統一包裝結果。任何一步失敗都
  立刻回傳
  `{ok:false, capability:'orchestration', reason, field?, stage?}`，
  `stage`欄位（'analysis'|'recommendation'）指出Unified Flow在
  哪一段失敗。這是同步函式，跟兩個底層Capability的同步簽名完全
  一致。
- `capability_result_builder.js`：
  `createCapabilityOrchestratorResultBuilder()`，提供
  `buildSuccessResult(analysisResult, recommendationResult)`（組出
  `{ok:true, capability:'orchestration', result:{analysis, recommendation}}`，
  兩段Result各自保留原本形狀，不重新拆開合併）跟
  `buildFailureResult(reason, field?, stage?)`（組出
  `{ok:false, capability:'orchestration', reason, field?, stage?}`）。
- `index.js`：統一輸出上述兩個檔案的內容。
- `README.md`：本檔案。

## 規則（Capability Orchestrator may call / must NOT call）

- ✅ 只能呼叫Analysis Capability跟Recommendation
  Capability（各自的`requestAnalysis()`/
  `requestRecommendation()`）。
- ❌ **不得**繞過Capability直接呼叫Analysis Runner/Recommendation
  Runner（不import`src/intelligence/analysis/`、
  `src/intelligence/recommendation/`）。
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
  物件，**沒有**任何既有Feature（Insight/Behavior）呼叫它——這是
  刻意的邊界決策，跟TASK1.76/1.77同樣的模式：「建立但不改變既有
  execution behavior」，用測試證明Analysis + Recommendation可以被
  安全組合執行即可。
- `analysis_runner.js`（TASK1.43）/`recommendation_runner.js`
  （TASK1.44）/`analysis_capability.js`（TASK1.76）/
  `recommendation_capability.js`（TASK1.77）/Phase 2 Runtime
  Orchestrator（`src/intelligence/orchestration/`，TASK1.45）本身
  完全沒有被修改。
- Phase 3 Application Layer（`application/`整個目錄樹）跟
  `src/bootstrap/application.js`完全沒有被修改。
- 完全沒有連接任何route/controller/`worker.js`，也沒有新增任何
  API route。

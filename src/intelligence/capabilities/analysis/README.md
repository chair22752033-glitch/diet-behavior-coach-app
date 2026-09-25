# Analysis Capability Execution Foundation（Phase 4 TASK1.76）

## 目的

建立Phase 4**第一個**Intelligence Capability Execution
Boundary——本次**不是**導入AI、**不是**建立AI Provider、**不是**
建立Prompt Logic，目的是讓Application Feature（未來）可以透過
明確的Capability邊界使用Analysis Framework（TASK1.43），而不需要
直接import`analysis_runner.js`。

這是TASK1.75 Phase 4 Capability Architecture Planning（見
`../../PHASE4_CAPABILITY_PLAN.md`）規劃結論的第一次落地——依照
規劃文件「Capability Boundary」章節描述的責任切分，正式建立
Analysis這一段的邊界。

## 架構位置

```
Feature（未來擴充，本次任務不新增/不修改任何Feature）
  ↓
Analysis Capability（這裡）
  ↓
Analysis Runner（TASK1.43，完全不修改）
  ↓
Analysis Result
```

## 跟Phase 3 Application Capability的差異

`application/capabilities/insight_capability.js`（TASK1.62，
Phase 3）包裝的是Use Case Layer，屬於Application鏈路
（Feature→Workflow→Capability→Use Case→Application Service→
Runtime）的一環。

這裡的Analysis Capability是完全不同架構位置的另一種
「Capability」——直接包裝Runtime層的Analysis Runner，刻意放在
`src/intelligence/capabilities/`（不是
`src/intelligence/application/capabilities/`），避免跟Phase 3
既有的Application Capability混淆。兩者目前互不認識、互不import。

## 檔案

- `analysis_capability.js`：`createAnalysisCapability({analysisRunner})`，
  提供`requestAnalysis(request)`——驗證輸入（`request.context`是否
  為物件、`request.options`選填是否為物件）→ 呼叫
  `analysisRunner.runAnalysis(context, options)`（唯一允許呼叫的
  下一層）→ 用`analysis_capability_result_builder.js`統一包裝
  結果。任何一步失敗都立刻回傳
  `{ok:false, capability:'analysis', reason, field?}`。這是同步
  函式，跟Analysis Runner本身`runAnalysis()`的同步簽名完全一致。
- `analysis_capability_result_builder.js`：
  `createAnalysisCapabilityResultBuilder()`，提供
  `buildSuccessResult(analysisResult)`（組出
  `{ok:true, capability:'analysis', result:{status,insights,metadata}}`，
  `result`欄位保留Analysis Runner原本的形狀不重新拆開）跟
  `buildFailureResult(reason, field?)`（組出
  `{ok:false, capability:'analysis', reason, field?}`）。
- `index.js`：統一輸出上述兩個檔案的內容。
- `README.md`：本檔案。

## 規則（Analysis Capability may call / must NOT call）

- ✅ 只能呼叫Analysis Runner（`analysisRunner.runAnalysis()`）。
- ❌ **不得**直接存取Database（不import`src/db/`，完全不接受db
  參數）。
- ❌ **不得**直接存取Auth/Session（不import`src/auth/`、
  `src/oauth/`、`src/identity/`、`src/middleware/`，完全不接受
  userId/session相關參數）。
- ❌ **不得**直接呼叫Execution Manager（不import
  `src/intelligence/execution/`）。
- ❌ **不得**直接存取History Store、Metrics Store（不import
  `src/intelligence/history/`、`src/intelligence/metrics/`）。
- ❌ **不得**import`src/intelligence/facade/`、`service/`、
  `orchestration/`、`data_preparation/`、`recommendation/`、
  `governance/`、`application/`（完全不認識Phase 3 Application
  Layer的存在）。
- ❌ **不得**呼叫任何AI Provider/AI SDK、不建立任何Prompt Logic。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
Feature → Analysis Capability → Analysis Runner → Analysis Result
```

**禁止**：
```
Feature → AI Provider              ❌
Capability → Database              ❌
Capability → Execution Internal Layer ❌
```

## 目前狀態

- **沒有**接進`src/bootstrap/application.js`的`intelligence`
  物件，**沒有**任何既有Feature（Insight/Behavior）呼叫它——這是
  刻意的邊界決策，跟TASK1.55 Governance Layer/TASK1.63 Contract
  Layer/TASK1.67 Insight Context/TASK1.68 Insight Output同樣的
  模式：「建立但不改變既有execution behavior」，用測試證明
  Analysis Framework事實上可以被安全消費即可。
- `analysis_runner.js`（TASK1.43）/`recommendation_runner.js`
  （TASK1.44）本身完全沒有被修改——本次任務明確禁止修改Analysis
  Runner核心邏輯跟Recommendation Runner。
- Phase 3 Application Layer（`application/`整個目錄樹）跟
  `src/bootstrap/application.js`完全沒有被修改——本次任務明確
  禁止修改Phase 3 Application Pattern。
- 完全沒有連接任何route/controller/`worker.js`，也沒有新增任何
  API route。

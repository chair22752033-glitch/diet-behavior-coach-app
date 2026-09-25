# Recommendation Capability Execution Foundation（Phase 4 TASK1.77）

## 目的

建立Phase 4**第二個**Intelligence Capability Execution
Boundary——本次**不是**導入AI、**不是**建立AI Provider、**不是**
建立Prompt Logic，目的是讓Application Feature（未來）可以透過
明確的Capability邊界使用Recommendation Framework（TASK1.44），而
不需要直接import`recommendation_runner.js`。

這是繼TASK1.76 Analysis Capability之後，依照TASK1.75 Phase 4
Capability Architecture Planning（見`../../PHASE4_CAPABILITY_PLAN.md`）
規劃結論的第二次落地——依照規劃文件「Capability Boundary」章節
描述的責任切分，正式建立Recommendation這一段的邊界。

## 架構位置

```
Feature（未來擴充，本次任務不新增/不修改任何Feature）
  ↓
Recommendation Capability（這裡）
  ↓
Recommendation Runner（TASK1.44，完全不修改）
  ↓
Recommendation Result
```

## 跟Analysis Capability的關係

`../analysis/`（TASK1.76）跟這裡的`recommendation/`（TASK1.77）是
完全平行、互不認識的兩個Capability——各自直接包裝Runtime層對應的
Runner，刻意各自維持獨立的request/result形狀，不互相import，也
不共用result builder。兩者唯一的共同點是同樣掛在
`src/intelligence/capabilities/`這個Phase 4頂層命名空間底下。

## 檔案

- `recommendation_capability.js`：
  `createRecommendationCapability({recommendationRunner})`，提供
  `requestRecommendation(request)`——驗證輸入
  （`request.analysisResult`是否為物件）→ 呼叫
  `recommendationRunner.runRecommendation(analysisResult)`（唯一
  允許呼叫的下一層）→ 用
  `recommendation_capability_result_builder.js`統一包裝結果。任何
  一步失敗都立刻回傳
  `{ok:false, capability:'recommendation', reason, field?}`。這是
  同步函式，跟Recommendation Runner本身`runRecommendation()`的
  同步簽名完全一致（Recommendation Runner只接受單一參數，沒有
  Analysis Runner那樣的第二個`options`參數，這裡的request形狀忠實
  對應這個差異，只定義`{analysisResult}`一個欄位）。
- `recommendation_capability_result_builder.js`：
  `createRecommendationCapabilityResultBuilder()`，提供
  `buildSuccessResult(recommendationResult)`（組出
  `{ok:true, capability:'recommendation', result:{status,recommendations,metadata}}`，
  `result`欄位保留Recommendation Runner原本的形狀不重新拆開）跟
  `buildFailureResult(reason, field?)`（組出
  `{ok:false, capability:'recommendation', reason, field?}`）。
- `index.js`：統一輸出上述兩個檔案的內容。
- `README.md`：本檔案。

## 規則（Recommendation Capability may call / must NOT call）

- ✅ 只能呼叫Recommendation Runner
  （`recommendationRunner.runRecommendation()`）。
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
  `orchestration/`、`data_preparation/`、`analysis/`、
  `governance/`、`application/`（完全不認識Phase 3 Application
  Layer的存在，也不認識Analysis Capability/Analysis Runner）。
- ❌ **不得**呼叫任何AI Provider/AI SDK、不建立任何Prompt Logic。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
Feature → Recommendation Capability → Recommendation Runner → Recommendation Result
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
  刻意的邊界決策，跟TASK1.76 Analysis Capability同樣的模式：
  「建立但不改變既有execution behavior」，用測試證明
  Recommendation Framework事實上可以被安全消費即可。
- `recommendation_runner.js`（TASK1.44）/`analysis_runner.js`
  （TASK1.43）本身完全沒有被修改——本次任務明確禁止修改
  Recommendation Runner核心邏輯跟Analysis Runner。
- Phase 3 Application Layer（`application/`整個目錄樹）跟
  `src/bootstrap/application.js`完全沒有被修改——本次任務明確
  禁止修改Phase 3 Application Pattern。
- 完全沒有連接任何route/controller/`worker.js`，也沒有新增任何
  API route。

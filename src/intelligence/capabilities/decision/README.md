# Decision Capability Foundation（Phase 4 TASK1.83）

## 目的

依照TASK1.82 Decision Capability Boundary Architecture
Review（`../../PHASE4_DECISION_CAPABILITY_REVIEW.md`）的審查
結論（建議**選項B：Independent Decision Capability**），建立
Phase 4第四個獨立的Intelligence Capability
Boundary——本次**不是**建立Decision Algorithm、**不是**建立Rule
Engine、**不是**導入AI、**不是**建立自動決策邏輯，目的只是建立
邊界：接收Recommendation Result、驗證輸入結構、產生結構化的
Decision Output佔位形狀。

## 架構位置

```
Feature（未來擴充，本次任務不新增/不修改任何Feature）
  ↓
Capability Orchestrator（TASK1.78，本次任務完全不修改）
  ↓
Recommendation Capability（TASK1.77，完全不修改）
  ↓
Decision Capability（這裡）
  ↓
Decision Output
```

## 跟Analysis/Recommendation Capability的差異

Analysis Capability（TASK1.76）/Recommendation
Capability（TASK1.77）各自包裝一個**已經存在**的Runtime
Runner（`analysis_runner.js`/`recommendation_runner.js`），Runner
本身已經有真正的（雖然是deterministic規則式的）邏輯可以產生
Analysis/Recommendation Result。

Decision Capability目前**沒有**對應的Decision
Runner——`decision_result_builder.js`的
`buildDecisionOutputPlaceholder()`直接產生一個**佔位形狀**
（`decision`欄位固定為`null`），不包含任何判斷邏輯、評分邏輯、
AI推論。這是TASK1.82審查結論「Decision Output暫定形狀」的第一次
落地，本次任務只建立形狀，不建立內容。

## 檔案

- `decision_capability.js`：`createDecisionCapability()`，提供
  `requestDecision(request)`——驗證輸入
  （`request.recommendationResult`是否為物件）→ 呼叫
  `buildDecisionOutputPlaceholder()`產生結構化佔位輸出 → 用
  `decision_result_builder.js`的`buildSuccessResult()`統一包裝
  結果。任何一步失敗都立刻回傳
  `{ok:false, capability:'decision', reason, field?}`。這是同步
  函式，跟Analysis Capability/Recommendation Capability本身的
  同步簽名完全一致。
- `decision_result_builder.js`：身兼兩個角色——
  `buildDecisionOutputPlaceholder(recommendationResult)`產生
  `{status:'decision_not_available', decision:null, metadata:{version, recommendationCount}}`
  （`recommendationCount`只是原樣讀取輸入`recommendations`陣列
  長度的事實計數，不是判斷或評分）；
  `createDecisionCapabilityResultBuilder()`提供
  `buildSuccessResult(decisionOutput)`（組出
  `{ok:true, capability:'decision', result:{status,decision,metadata}}`）
  跟`buildFailureResult(reason, field?)`（組出
  `{ok:false, capability:'decision', reason, field?}`）。
- `index.js`：統一輸出上述兩個檔案的內容。
- `README.md`：本檔案。

## 規則（Decision Capability may call / must NOT call）

- ✅ 不呼叫任何下一層——這是Architecture Rule畫出的鏈路末端
  （Decision Capability → Decision Output），目前沒有Decision
  Runner可以呼叫。
- ❌ **不得**直接存取Database（不import`src/db/`，完全不接受db
  參數）。
- ❌ **不得**直接存取Auth/Session（不import`src/auth/`、
  `src/oauth/`、`src/identity/`、`src/middleware/`）。
- ❌ **不得**直接呼叫Execution Manager（不import
  `src/intelligence/execution/`）。
- ❌ **不得**直接存取History Store、Metrics Store、Event
  Dispatcher。
- ❌ **不得**import`src/intelligence/facade/`、`service/`、
  `orchestration/`（Phase 2 Runtime Orchestrator）、
  `data_preparation/`、`analysis/`、`recommendation/`、
  `governance/`、`application/`。
- ❌ **不得**呼叫任何AI Provider/AI SDK、不建立任何Prompt Logic。
- ❌ **目前禁止**加入判斷邏輯（比較/排序/篩選recommendations）、
  評分邏輯（計算新的分數/信心值/權重）、AI推論。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
Feature → Capability Orchestrator → Recommendation Capability → Decision Capability → Decision Output
```

**禁止**：
```
Decision Capability → Database    ❌
Decision Capability → Auth        ❌
Decision Capability → AI Provider ❌
```

## 目前狀態

- **沒有**接進`src/bootstrap/application.js`的`intelligence`
  物件，**沒有**接進`capability_orchestrator.js`的
  `requestCapabilityFlow()`（`capability_orchestrator.js`本次任務
  完全沒有被修改，`requestCapabilityFlow()`目前依然只呼叫
  Analysis Capability跟Recommendation Capability兩層）——這是
  刻意的邊界決策，跟TASK1.76/1.77/1.78/1.79同樣的模式：「建立但
  不改變既有execution behavior」，用測試證明Recommendation
  Result可以被Decision Capability安全消費即可，接不接進真實
  Orchestrator/Feature留給未來任務決定。
- `analysis_runner.js`（TASK1.43）/`recommendation_runner.js`
  （TASK1.44）/Analysis Capability（TASK1.76）/Recommendation
  Capability（TASK1.77）/Capability Orchestrator（TASK1.78）/
  Feature Integration（TASK1.79）本身完全沒有被修改。
- 完全沒有連接任何route/controller/`worker.js`，也沒有新增任何
  API route。

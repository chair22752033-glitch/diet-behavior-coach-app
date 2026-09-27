# Product Execution Boundary Minimal Implementation（Phase 5 TASK1.101）

## 目的

依照TASK1.95 Product Intelligence Execution Boundary
Foundation規劃結論，第一次把「Execution Boundary」這個規劃概念
落地成**最小可運作的骨架**。

這是Phase 5系列**第三個**寫production code的任務（前兩個是
TASK1.99 Product Entry、TASK1.100 Product Adapter）。本次任務
**只**建立Execution Boundary骨架，**不**實作真實的product
routes，**不**實作AI。

## 架構位置

```
Product Entry（TASK1.99，完全不修改）
  ↓
Product Adapter（TASK1.100，完全不修改）
  ↓（透過依賴注入拿到的intelligenceFeature介面呼叫，跟呼叫真正
     的Feature完全相同的方式）
Product Execution Boundary（這裡）
  ↓（透過依賴注入拿到的intelligenceFeature介面）
Feature Intelligence Integration（TASK1.79，完全不修改）
  ↓
Capability Orchestrator / Analysis+Recommendation Capability（既有，完全不修改）
```

## Product Execution的五個責任（規格原文，不多不少）

1. 接收 Intelligence execution request
2. 管理執行生命週期狀態
3. 呼叫依賴注入的 Intelligence Feature
4. 正規化成功結果
5. 分類執行失敗

## 刻意的「透明代理」設計：Adapter Compatibility

Execution Boundary對外暴露跟Feature Intelligence Integration
**完全相同**的介面——`requestIntelligence(request)`，回傳形狀
也完全比照既有的`intelligence_feature_result_mapper.js`
（`{ok:true, feature:'intelligence', data}`/`{ok:false,
feature:'intelligence', reason, field?, stage?}`）。

這代表Product Adapter（TASK1.100）**完全不需要修改任何程式
碼**，只要把原本注入的`intelligenceFeature`依賴換成
`createProductExecution({intelligenceFeature: 真正的Feature})`
回傳的物件，就可以在Adapter跟Feature之間插入Execution
Boundary——Completion Criteria要求的Adapter compatibility正是
指這個設計。

## Execution Lifecycle（五階段，延續TASK1.95規劃）

```
request received
  ↓
validation completed
  ↓
execution started
  ↓
execution completed（成功終止狀態）
  或
execution failed（失敗終止狀態，跟completed互斥）
```

`request received`→`validation completed`→`execution
started`是嚴格循序的；Contract Failure會在`validation
completed`之前就中止，不會進入`execution started`。這五個階段
是規劃概念、內部診斷用途，**不會**出現在
`requestIntelligence()`的回傳結果裡（Hidden Internal
State）——本檔案額外提供`getLastExecutionState()`作為
introspection-only的存取方式，純粹用於測試/觀察，不屬於
request/response contract的一部分。

## Failure Recovery Boundary（延續TASK1.95規劃的五種分類）

本次實作能具體區分其中三種：

- **Contract Failure**（`category:'contract_failure'`）：
  `{context, options?}`最外層形狀本身不合法，或
  `intelligenceFeature`依賴不存在——不會呼叫Feature，不重試。
- **Feature Failure**（`category:'feature_failure'`）：Feature
  Intelligence Integration/Capability Orchestrator回傳
  `{ok:false, reason, field?, stage?}`——已進入`execution
  started`階段，原樣往上傳遞，不重試。
- **Runtime Failure**（`category:'runtime_failure'`）：
  `requestIntelligence()`本身拋出未預期例外——用`try/catch`
  攔截，強制轉換成`execution failed`，轉換成通用的
  `internal_error`，不洩漏原始例外訊息，不重試。

另外兩種分類延續TASK1.95文件已明確記錄的限制，本次實作不單獨
處理：

- **Adapter Failure**：發生在Adapter層，根本不會進入Execution
  Boundary。
- **Capability Failure**：跟Feature Failure在目前架構下無法
  區分（Phase 4既有封裝設計的自然結果），統一歸類為
  `feature_failure`。

**沒有任何一種失敗會觸發自動重試**（延續TASK1.95的明確決定：
Intelligence Chain目前是deterministic的）。

## 檔案

- `product_execution.js`：
  `createProductExecution({intelligenceFeature?, resultBuilder?})`，
  提供`requestIntelligence(request)`（介面/回傳形狀完全比照
  Feature Intelligence Integration，見上方Adapter
  Compatibility）跟`getLastExecutionState()`（introspection-only）。
- `product_execution_result_builder.js`：
  `createProductExecutionResultBuilder()`，提供
  `buildSuccessResult(data)`（組出`{ok:true,
  feature:'intelligence', boundary:'product-execution',
  data}`）跟`buildFailureResult(reason, field?, stage?,
  category?)`（組出`{ok:false, feature:'intelligence',
  boundary:'product-execution', reason, field?, stage?,
  category?}`）。
- `index.js`：統一輸出上述兩個檔案的內容。
- `README.md`：本檔案。

## 規則（Product Execution may call / must NOT call）

- ✅ 只能呼叫依賴注入拿到的`intelligenceFeature`介面
  （`requestIntelligence()`）。
- ❌ **不得**繞過Feature Intelligence Integration直接呼叫
  Capability Orchestrator/Analysis Capability/Recommendation
  Capability（不import`src/intelligence/capabilities/`、
  `src/intelligence/analysis/`、
  `src/intelligence/recommendation/`、
  `src/intelligence/application/`底下任何實作檔案）。
- ❌ **不得**直接存取Database（不import`src/db/`，完全不接受db
  參數，不修改任何database schema/migrations）。
- ❌ **不得**直接存取Auth/Session/OAuth（不import`src/auth/`、
  `src/oauth/`、`src/identity/`、`src/middleware/`）。
- ❌ **不得**修改`worker.js`、routes、controllers。
- ❌ **不得**修改Product Entry（TASK1.99）、Product Adapter
  （TASK1.100）、Phase 2 Runtime Orchestrator
  （`src/intelligence/orchestration/`）、Phase 3 Application
  Pattern（`src/intelligence/application/`）、Phase 4
  Capability Architecture。
- ❌ **不得**呼叫任何AI Provider/AI SDK（Claude/OpenAI/
  DeepSeek）、**不得**建立任何Prompt Logic、Decision
  Algorithm、Rule Engine、Scoring Logic。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。

## 合法流程 vs 禁止流程

**合法**：
```
Product Adapter → Product Execution Boundary → Intelligence Feature → Capability Orchestrator → Result
```

**禁止**：
```
Product Execution → AI Provider                                ❌
Product Execution → Database                                   ❌
Product Execution → Capability Orchestrator（繞過Feature）       ❌
Product Execution → worker.js/routes/controllers                ❌
```

## 目前狀態

- **沒有**接進`src/bootstrap/application.js`的`intelligence`
  物件（維持既有24個欄位），**沒有**注入到Product Adapter既有的
  呼叫鏈（Adapter的`intelligenceFeature`依賴依然直接指向真正的
  Feature，本次任務不修改Adapter任何程式碼）——這是刻意的邊界
  決策，延續Phase 4/Phase 5系列一貫的「建立但不改變既有
  execution behavior」模式，用測試證明Adapter+Execution
  Boundary+Feature可以被安全地組合執行即可。
- `worker.js`、routes、controllers、auth、oauth、session、
  database schema/migrations、Product Entry、Product
  Adapter、Analysis Runner、Recommendation Runner、Phase 2
  Runtime Orchestrator、Phase 3 Application Pattern、Phase 4
  Capability Architecture（5層）本身完全沒有被修改。
- 完全沒有連接任何真實的product route，也沒有新增任何API
  route，也沒有實作任何AI。
- Rollback：本次所有變更都只是新增檔案，`git revert`此commit即可
  完整還原。

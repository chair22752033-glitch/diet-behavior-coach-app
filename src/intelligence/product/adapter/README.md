# Product Adapter Boundary Minimal Implementation（Phase 5 TASK1.100）

## 目的

依照TASK1.92 Product Adapter Architecture Foundation、TASK1.95
Execution Boundary Foundation、TASK1.98 Implementation
Readiness Plan規劃結論，第一次把「Intelligence Adapter」這個
規劃概念落地成**最小可運作的骨架**。

這是Phase 5系列**第二個**寫production code的任務（第一個是
TASK1.99 Product Entry）。本次任務**只**建立Adapter骨架，**不**
實作真實的product routes，**不**實作AI。

## 架構位置

```
Product Entry（TASK1.99，完全不修改）
  ↓（透過adapter.forwardProductRequest()呼叫，既有約定）
Intelligence Adapter（這裡）
  ↓（透過依賴注入拿到的intelligenceFeature介面）
Feature Intelligence Integration（TASK1.79，完全不修改）
  ↓
Capability Orchestrator / Analysis+Recommendation Capability（既有，完全不修改）
```

Product Entry呼叫Adapter的方式維持TASK1.99既有約定：
`adapter.forwardProductRequest(request)`——本檔案的函式簽名跟
回傳形狀恰好符合Product Entry既有的消費方式，**Entry層完全不需要
修改**（Completion Criteria要求的「Entry Adapter flow
preserved」）。

## Product Adapter的四個責任（規格原文，不多不少）

1. 接收已驗證的 Product request
2. 轉換成 Intelligence request 格式
3. 呼叫依賴注入的 Intelligence Feature
4. 把 Intelligence result 轉換成 Product response 形狀

## 刻意簡化：本次最小實作不呼叫真實Context Builder

TASK1.92規劃文件建議Request Mapping應該重用既有的Insight Context
Builder（`src/intelligence/context/`，TASK1.42）。本次最小骨架
實作**沒有**呼叫真實的Context Builder，而是直接把
`productRequest.rawInput`當作Intelligence Feature要求的
`context`使用——這是TASK1.92規劃文件Known Limitations已預告的
簡化（「Product Request/Response的實際型別/介面尚未定義」），真正
的Context Builder整合留給未來任務決定。

## Error Mapping（延續TASK1.92三種錯誤分類）

- **Product Errors**：發生在Entry層，不會進入Adapter——這裡對
  `productRequest`/`rawInput`的檢查只是防禦性的結構安全檢查，不是
  重新定義業務驗證規則。
- **Intelligence Errors**：`intelligenceFeature.
  requestIntelligence()`回傳`{ok:false, reason, field?}`時，原樣
  轉換成Adapter自己的失敗結果，標記`stage:'intelligence'`。
- **Runtime Errors**：呼叫`intelligenceFeature.
  requestIntelligence()`本身拋出未預期例外時，用try/catch攔截，
  轉換成通用的`internal_error`錯誤碼，標記`stage:'runtime'`，
  **不**把原始例外訊息往外傳遞——這跟Product Entry（TASK1.99刻意
  讓例外往上傳播、不吞掉）**故意不同**：延續TASK1.95 Execution
  Boundary規劃「Execution Lifecycle跟Failure Recovery由Adapter
  內部擁有」的結論，例外攔截職責明確歸屬在Adapter這一層。

## 檔案

- `product_adapter.js`：
  `createProductAdapter({intelligenceFeature?, resultBuilder?})`，
  提供`forwardProductRequest(productRequest)`——結構安全檢查
  （`productRequest`本身是否為物件、`productRequest.rawInput`是否
  為物件）→ 轉換成`{context: rawInput, options?}`→ 呼叫
  `intelligenceFeature.requestIntelligence()`（用try/catch攔截
  例外）→ 用`product_adapter_result_builder.js`統一包裝結果，
  成功時只取`outcome.data`（自然過濾掉Feature層內部的
  `feature:'intelligence'`標籤）。
- `product_adapter_result_builder.js`：
  `createProductAdapterResultBuilder()`，提供
  `buildSuccessResult(result)`（組出
  `{ok:true, boundary:'product-adapter', result}`）跟
  `buildFailureResult(reason, field?, stage?)`（組出
  `{ok:false, boundary:'product-adapter', reason, field?,
  stage?}`）。
- `index.js`：統一輸出上述兩個檔案的內容。
- `README.md`：本檔案。

## 規則（Product Adapter may call / must NOT call）

- ✅ 只能呼叫依賴注入拿到的`intelligenceFeature`介面
  （`requestIntelligence()`）。
- ❌ **不得**繞過Feature Intelligence Integration直接呼叫
  Capability Orchestrator/Analysis Capability/Recommendation
  Capability/Analysis Runner/Recommendation Runner（不import
  `src/intelligence/capabilities/`、
  `src/intelligence/analysis/`、
  `src/intelligence/recommendation/`、
  `src/intelligence/application/`底下任何實作檔案）。
- ❌ **不得**直接存取Database（不import`src/db/`，完全不接受db
  參數，不修改任何database schema/migrations）。
- ❌ **不得**直接存取Auth/Session/OAuth（不import`src/auth/`、
  `src/oauth/`、`src/identity/`、`src/middleware/`）。
- ❌ **不得**修改`worker.js`、routes、controllers。
- ❌ **不得**修改Product Entry（`src/intelligence/product/
  entry/`）、Phase 2 Runtime Orchestrator
  （`src/intelligence/orchestration/`）、Phase 3 Application
  Pattern（`src/intelligence/application/`）、Phase 4
  Capability Architecture
  （`src/intelligence/capabilities/`、`src/intelligence/
  analysis/`、`src/intelligence/recommendation/`）。
- ❌ **不得**呼叫任何AI Provider/AI SDK（Claude/OpenAI/
  DeepSeek）、**不得**建立任何Prompt Logic、Decision
  Algorithm、Rule Engine、Scoring Logic。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案，
  不接受/回傳Request/Response物件本身，只處理乾淨的JS物件。

## 合法流程 vs 禁止流程

**合法**：
```
Product Entry → Product Adapter → Intelligence Feature → Capability Orchestrator → Result
```

**禁止**：
```
Product Adapter → AI Provider                                ❌
Product Adapter → Database                                   ❌
Product Adapter → Capability Orchestrator（繞過Feature）       ❌
Product Adapter → worker.js/routes/controllers                ❌
```

## 目前狀態

- **沒有**接進`src/bootstrap/application.js`的`intelligence`
  物件（維持既有24個欄位），**沒有**注入到Product Entry既有的
  呼叫鏈（Entry的`adapter`依賴依然是選填的，本次任務不修改Entry
  任何程式碼）——這是刻意的邊界決策，延續Phase 4/Phase 5系列一貫的
  「建立但不改變既有execution behavior」模式，用測試證明
  Entry+Adapter可以被安全地組合執行即可。
- `worker.js`、routes、controllers、auth、oauth、session、
  database schema/migrations、Product Entry、Analysis
  Runner、Recommendation Runner、Phase 2 Runtime
  Orchestrator、Phase 3 Application Pattern、Phase 4
  Capability Architecture（5層）本身完全沒有被修改。
- 完全沒有連接任何真實的product route，也沒有新增任何API
  route，也沒有實作任何AI。
- Rollback：本次所有變更都只是新增檔案，`git revert`此commit即可
  完整還原。

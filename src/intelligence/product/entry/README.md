# Product Entry Boundary Minimal Implementation（Phase 5 TASK1.99）

## 目的

依照TASK1.91 Product Entry Boundary規劃、TASK1.93 Product
Feature Flow、TASK1.94 Application Contract、TASK1.95 Execution
Boundary、TASK1.96 Operational Boundary、TASK1.97
Consolidation Review、TASK1.98 Implementation Readiness Plan
（見`../../PHASE5_IMPLEMENTATION_READINESS_PLAN.md`）規劃結論，
第一次把「Product Intelligence Entry」這個規劃概念落地成**最小
可運作的骨架**。

這是Phase 5系列**第一個**寫production code的任務——TASK1.90到
TASK1.98全部都是文件規劃/審查任務。本次任務**只**建立最小的
integration skeleton，**不**實作真實的product routes，**不**
實作AI。

## 架構位置

```
Product Feature（規劃中，本次任務不建立）
  ↓
Product Entry（這裡）
  ↓（透過依賴注入拿到的adapter介面）
Intelligence Adapter（規劃中，尚未落地——本次任務不建立）
  ↓
Intelligence Feature / Capability / Runtime（既有，完全不修改）
```

本次任務**沒有**建立Intelligence Adapter本身。Product Entry透過
依賴注入拿到的`adapter`是**選填的外部依賴**——沒有提供、或提供
的物件沒有`forwardProductRequest`函式時，Product Entry回傳
`adapter_unavailable`失敗，不會拋出例外、不會嘗試繞過Adapter
直接呼叫Feature/Capability層。

## Product Entry的四個責任（規格原文，不多不少）

1. 接收 product request
2. 驗證基本的 request 形狀
3. 轉交給未來的 adapter boundary
4. 回傳結構化的結果

## 檔案

- `product_entry.js`：
  `createProductEntry({adapter?, resultBuilder?})`，提供
  `requestProductEntry(request)`——驗證輸入
  （`request`本身是否為物件、`request.rawInput`是否為必填物件、
  `request.userId`若存在是否為字串）→ 呼叫
  `adapter.forwardProductRequest(request)`（沒有提供`adapter`或
  `adapter.forwardProductRequest`不是函式時回傳
  `adapter_unavailable`）→ 用`product_entry_result_builder.js`
  統一包裝結果。任何一步失敗都立刻回傳
  `{ok:false, boundary:'product-entry', reason, field?, stage?}`。
  這是同步函式。
- `product_entry_result_builder.js`：
  `createProductEntryResultBuilder()`，提供
  `buildSuccessResult(result)`（組出
  `{ok:true, boundary:'product-entry', result}`）跟
  `buildFailureResult(reason, field?, stage?)`（組出
  `{ok:false, boundary:'product-entry', reason, field?, stage?}`）。
- `index.js`：統一輸出上述兩個檔案的內容。
- `README.md`：本檔案。

## 規則（Product Entry may call / must NOT call）

- ✅ 只能呼叫依賴注入拿到的`adapter`介面
  （`forwardProductRequest()`）。
- ❌ **不得**繞過Adapter直接呼叫Intelligence Feature/Capability
  Orchestrator/Analysis Runner/Recommendation Runner（不import
  `src/intelligence/application/`、
  `src/intelligence/capabilities/`、
  `src/intelligence/analysis/`、
  `src/intelligence/recommendation/`底下任何實作檔案）。
- ❌ **不得**直接存取Database（不import`src/db/`，完全不接受db
  參數，不修改任何database schema/migrations）。
- ❌ **不得**直接存取Auth/Session/OAuth（不import`src/auth/`、
  `src/oauth/`、`src/identity/`、`src/middleware/`）。
- ❌ **不得**修改`worker.js`、routes、controllers。
- ❌ **不得**修改Phase 2 Runtime Orchestrator
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
Product Feature → Product Entry → Adapter（未來） → Intelligence Feature/Capability → Result
```

**禁止**：
```
Product Entry → AI Provider                      ❌
Product Entry → Database                         ❌
Product Entry → Intelligence Feature/Capability（繞過Adapter） ❌
Product Entry → worker.js/routes/controllers      ❌
```

## 目前狀態

- **沒有**接進`src/bootstrap/application.js`的`intelligence`
  物件（維持既有24個欄位），**沒有**任何route/controller呼叫
  它——這是刻意的邊界決策，延續Phase 4/Phase 5系列一貫的「建立
  但不改變既有execution behavior」模式，用測試證明Product Entry
  可以被安全地獨立測試、獨立呼叫即可。
- `worker.js`、routes、controllers、auth、oauth、session、
  database schema/migrations、Analysis Runner、Recommendation
  Runner、Phase 2 Runtime Orchestrator、Phase 3 Application
  Pattern、Phase 4 Capability Architecture（5層）本身完全沒有被
  修改。
- 完全沒有連接任何真實的product route，也沒有新增任何API
  route，也沒有實作任何AI。
- Rollback：本次所有變更都只是新增檔案，`git revert`此commit即可
  完整還原。

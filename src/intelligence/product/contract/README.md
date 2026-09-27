# Product Contract Boundary Minimal Implementation（Phase 5 TASK1.103）

## 目的

依照TASK1.94 Product Intelligence Application Contract
Foundation規劃結論，加上本次任務自己明確要求的Implementation
Flow，第一次把「Contract Boundary」這個規劃概念落地成**最小
可運作的骨架**。

這是Phase 5系列**第五個**寫production code的任務（前四個是
TASK1.99 Product Entry、TASK1.100 Product Adapter、TASK1.101
Product Execution、TASK1.102 Product Operational）。本次任務
**只**建立Contract Boundary骨架，**不**實作真實的product
routes，**不**實作AI。

## 架構位置

```
Product Entry（TASK1.99，完全不修改）
  ↓（透過adapter.forwardProductRequest()呼叫，跟呼叫真正
     Adapter完全相同的方式——透明代理設計）
Product Contract（這裡）
  ↓（透過依賴注入拿到的adapter介面）
Product Adapter（TASK1.100，完全不修改）
  ↓
Product Execution Boundary（TASK1.101，完全不修改）
  ↓
Product Operational Boundary（TASK1.102，完全不修改）
  ↓
Feature Intelligence Integration（TASK1.79，完全不修改）
```

## 跟TASK1.94原始規劃的差異（刻意的範圍調整）

TASK1.94 `PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md`規劃的
是**Feature層級**的`{context, options?}`/`{ok, data}`Contract
（Adapter跟Feature之間）。本次任務（TASK1.103）明確要求的
Implementation Flow把Contract Boundary放在**Entry跟Adapter
之間**，因此本次落地的驗證範圍是**Product Request/Response
層級**的Contract——延續TASK1.99已建立的先例：本次任務自己
明確的Implementation Scope/Flow優先於更早、更泛用的規劃文件。

## Product Contract的五個責任（規格原文，不多不少）

1. validate product request shape
2. validate product response shape
3. preserve backward compatibility
4. provide structured validation result
5. avoid business logic decisions

## 刻意的「透明代理，只在必要時介入」設計

Contract對外暴露跟Product Adapter**完全相同**的介面——
`forwardProductRequest(request)`。這代表Product Entry
（TASK1.99）**完全不需要修改任何程式碼**，只要把原本注入的
`adapter`依賴換成`createProductContract({adapter: 真正的
Adapter})`回傳的物件，就可以在Entry跟Adapter之間插入這一層
驗證閘門。

驗證通過時，Contract把下游Adapter回傳的response**原封不動**
往上傳遞（不重新包裝、不新增任何欄位）——這是「保持向後相容」
的具體實作。只有在**自己新增的驗證項目**發現問題時，才回傳
Contract自己的結構化失敗結果；下游Adapter既有的失敗（例如
`intelligence_feature_unavailable`）一樣原樣透傳，Contract
不重新分類/不重新包裝。

## Allowed（規格明確列出）

- **required field validation**：`request.rawInput`必要物件。
- **optional field validation**：`request.userId`（字串）/
  `request.options`（物件）選填。
- **response structure validation**：`response`必須是
  `{ok:true, result:object}`或`{ok:false, reason:string,
  field?, stage?}`其中一種形狀。
- **version compatibility check**：從成功的`response.result`
  裡的`metadata.version`欄位（若存在）抽取版本字串，確認格式
  符合`X.Y.Z`且主版本號在`SUPPORTED_RESPONSE_VERSIONS`
  （目前只有`'1.0.0'`）清單裡——只判斷格式/主版本號是否認得，
  完全不對內容做任何評分/決策/業務判斷。

## 檔案

- `product_contract.js`：
  `createProductContract({adapter?, validator?,
  resultBuilder?})`，提供`forwardProductRequest(request)`——
  驗證Request形狀 → 轉交給下游Adapter → 驗證Response形狀 →
  （成功時）檢查版本相容性 → 全部通過時原樣回傳下游
  response，任何一步失敗都回傳Contract自己的結構化失敗結果
  `{ok:false, boundary:'product-contract', reason, field?,
  stage?}`（`stage`為`'request'`|`'adapter'`|`'response'`|
  `'compatibility'`其中之一）。
- `product_contract_validator.js`：純函式驗證邏輯——
  `validateProductRequestShape()`、
  `validateProductResponseShape()`、
  `extractResponseVersion()`、`checkVersionCompatibility()`，
  跟`createProductContractValidator({supportedVersions?})`
  工廠函式。
- `product_contract_result_builder.js`：
  `createProductContractResultBuilder()`，只提供
  `buildFailureResult(reason, field?, stage?)`——**沒有**
  `buildSuccessResult()`，因為驗證通過時是原樣透傳下游
  response，不需要自己組裝成功形狀。
- `index.js`：統一輸出上述三個檔案的內容。
- `README.md`：本檔案。

## 規則（Product Contract may call / must NOT call）

- ✅ 只能呼叫依賴注入拿到的`adapter`介面
  （`forwardProductRequest()`）。
- ❌ **不得**繞過Adapter直接呼叫Execution/Operational/
  Feature/Capability（不import`src/intelligence/product/
  execution/`、`src/intelligence/product/operational/`、
  `src/intelligence/capabilities/`、
  `src/intelligence/analysis/`、
  `src/intelligence/recommendation/`、
  `src/intelligence/application/`底下任何實作檔案）。
- ❌ **不得**直接存取Database（不import`src/db/`，不修改任何
  database schema/migrations）。
- ❌ **不得**直接存取Auth/Session/OAuth（不import`src/auth/`、
  `src/oauth/`、`src/identity/`、`src/middleware/`）。
- ❌ **不得**修改`worker.js`、routes、controllers。
- ❌ **不得**修改Product Entry（TASK1.99）、Product Adapter
  （TASK1.100）、Product Execution（TASK1.101）、Product
  Operational（TASK1.102）、Phase 2 Runtime Orchestrator、
  Phase 3 Application Pattern、Phase 4 Capability
  Architecture。
- ❌ **不得**呼叫任何AI Provider/AI SDK（Claude/OpenAI/
  DeepSeek）、**不得**建立任何Decision Algorithm、Rule
  Engine、Scoring Logic、Prompt Logic。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。

## 合法流程 vs 禁止流程

**合法**：
```
Product Entry → Product Contract → Product Adapter → Result
```

**禁止**：
```
Product Contract → AI Provider                                ❌
Product Contract → Database                                   ❌
Product Contract → Execution/Operational/Feature（繞過Adapter） ❌
Product Contract → worker.js/routes/controllers                ❌
```

## 目前狀態

- **沒有**接進`src/bootstrap/application.js`的`intelligence`
  物件（維持既有24個欄位），**沒有**注入到Product Entry既有的
  呼叫鏈（Entry的`adapter`依賴依然直接指向真正的Adapter，本次
  任務不修改Entry任何程式碼）——這是刻意的邊界決策，延續Phase
  4/Phase 5系列一貫的「建立但不改變既有execution behavior」
  模式，用測試證明Entry+Contract+Adapter+Execution+
  Operational+Feature可以被安全地組合執行即可。
- `worker.js`、routes、controllers、auth、oauth、session、
  database schema/migrations、Product Entry、Product
  Adapter、Product Execution、Product Operational、Analysis
  Runner、Recommendation Runner、Phase 2 Runtime
  Orchestrator、Phase 3 Application Pattern、Phase 4
  Capability Architecture本身完全沒有被修改。
- 完全沒有連接任何真實的product route，也沒有新增任何API
  route，也沒有實作任何AI。
- Rollback：本次所有變更都只是新增檔案，`git revert`此commit即可
  完整還原。

# Product Operational Boundary Minimal Implementation（Phase 5 TASK1.102）

## 目的

依照TASK1.96 Product Intelligence Operational Boundary
Architecture Planning規劃結論，第一次把「Operational Boundary」
這個規劃概念落地成**最小可運作的骨架**。

這是Phase 5系列**第四個**寫production code的任務（前三個是
TASK1.99 Product Entry、TASK1.100 Product Adapter、TASK1.101
Product Execution）。本次任務**只**建立Operational Boundary
骨架，**不**實作任何監控dashboard，**不**實作AI。

## 架構位置

```
Product Entry（TASK1.99，完全不修改）
  ↓
Product Adapter（TASK1.100，完全不修改）
  ↓
Product Execution Boundary（TASK1.101，完全不修改）
  ↓（透過依賴注入拿到的intelligenceFeature介面呼叫，跟呼叫真正
     的Feature完全相同的方式）
Product Operational Boundary（這裡）
  ↓（透過依賴注入拿到的intelligenceFeature介面）
Feature Intelligence Integration（TASK1.79，完全不修改）
  ↓
Capability Orchestrator / Analysis+Recommendation Capability（既有，完全不修改）
```

## Product Operational的五個責任（規格原文，不多不少）

1. 觀察執行生命週期事件
2. 收集安全的運維中繼資料
3. 避免收集敏感業務資料
4. 提供選填的觀察擴充點
5. 保持執行行為不變

## 刻意的「透明代理」設計（延續TASK1.101已建立的模式）

Operational Boundary對外暴露跟Feature Intelligence
Integration/Execution Boundary**完全相同**的介面——
`requestIntelligence(request)`，而且**原樣**回傳（或原樣拋出）
底層依賴的結果/例外，不新增、不修改、不吞掉任何東西。

這代表Product Execution（TASK1.101）/Product Adapter
（TASK1.100）**完全不需要修改任何程式碼**，只要把原本注入的
`intelligenceFeature`依賴換成`createProductOperational({
intelligenceFeature: 真正的Feature})`回傳的物件，就可以在任意
位置插入這一層觀察邊界（Completion Criteria要求的「Execution
behavior unchanged」正是指這個設計）。

## Operational Metadata（延續TASK1.96規劃的Allowed/Hidden清單）

### Allowed Metadata（唯一允許出現在observer收到的物件裡）

- `phase`：`'started'`|`'completed'`|`'failed'`
- `ok`：布林值（成功/失敗，對應規格用詞的status）
- `reason`：既有的、有限集合的錯誤分類字串
- `stage`：既有的、有限集合的階段字串
- `version`：Analysis/Recommendation/Decision Result既有
  `metadata.version`欄位
- `execution duration if available`（`durationMs`）：只有在
  依賴注入了`clock`時才會出現
- `result counts`（`resultCounts`）：`{insights?,
  recommendations?}`這類陣列長度

### Forbidden Metadata（絕對不會出現）

- ❌ `userId`
- ❌ user identity information
- ❌ raw context content
- ❌ insight content
- ❌ recommendation content
- ❌ hidden decision logic（以及`field`欄位——Allowed
  Metadata清單沒有列出它，即使底層失敗結果帶了`field`，這裡也
  不會轉發）

## Isolation（隔離，延續TASK1.96明確承諾）

- `observer`拋出例外時，這個例外會被完全吞掉，**不會**往外
  傳播、**不會**影響`requestIntelligence()`原本要回傳/拋出的
  結果——可觀測性不能犧牲正確性。
- `clock`依賴讀取失敗時，`durationMs`就不出現在metadata裡，
  同樣不影響執行結果。
- 底層`intelligenceFeature.requestIntelligence()`回傳的結果/
  拋出的例外，Operational Boundary**原封不動**傳遞——跟
  TASK1.101 Execution Boundary刻意把例外轉換成`execution
  failed`回傳值**不同**：Operational Boundary的職責是純觀察，
  不是失敗分類，因此底層拋例外時這裡選擇讓例外原樣往上傳播，
  只是先觀察一下再重新拋出。

## 檔案

- `product_operational.js`：
  `createProductOperational({intelligenceFeature?, observer?,
  clock?, metadataBuilder?})`，提供`requestIntelligence
  (request)`（介面/回傳形狀完全比照底層依賴，見上方透明代理
  設計）。`observer`是選填的觀察擴充點，`clock`是選填的時間
  來源（這個檔案本身完全不讀取`Date.now()`）。
- `product_operational_result_builder.js`：
  `createProductOperationalResultBuilder()`，提供
  `buildStartedMetadata()`/`buildCompletedMetadata({version?,
  resultCounts?, durationMs?})`/`buildFailedMetadata({reason,
  stage?, durationMs?})`三個函式，組裝Allowed Metadata清單裡
  的觀察事件物件。
- `index.js`：統一輸出上述兩個檔案的內容。
- `README.md`：本檔案。

## 規則（Product Operational may call / must NOT call）

- ✅ 只能呼叫依賴注入拿到的`intelligenceFeature`介面
  （`requestIntelligence()`）跟選填的`observer`/`clock`。
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
  （TASK1.100）、Product Execution（TASK1.101）、Phase 2
  Runtime Orchestrator、Phase 3 Application Pattern、Phase 4
  Capability Architecture。
- ❌ **不得**呼叫任何AI Provider/AI SDK（Claude/OpenAI/
  DeepSeek）、**不得**建立任何Prompt Logic、Decision
  Algorithm、Rule Engine、Scoring Logic。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。
- ❌ **不得**讀取`Date.now()`/`Math.random()`（deterministic，
  `clock`是選填依賴注入，不是內建的時間來源）。

## 合法流程 vs 禁止流程

**合法**：
```
Product Execution → Product Operational Boundary → Intelligence Feature → Capability Orchestrator → Result
```

**禁止**：
```
Product Operational → AI Provider                                ❌
Product Operational → Database                                   ❌
Product Operational → 記錄userId/Context內容/Insight內容           ❌
Product Operational → worker.js/routes/controllers                ❌
```

## 目前狀態

- **沒有**接進`src/bootstrap/application.js`的`intelligence`
  物件（維持既有24個欄位），**沒有**注入到Product
  Execution/Adapter既有的呼叫鏈（本次任務不修改任何既有
  程式碼）——這是刻意的邊界決策，延續Phase 4/Phase 5系列一貫的
  「建立但不改變既有execution behavior」模式，用測試證明
  Execution/Adapter+Operational Boundary+Feature可以被安全地
  組合執行即可。
- `worker.js`、routes、controllers、auth、oauth、session、
  database schema/migrations、Product Entry、Product
  Adapter、Product Execution、Analysis Runner、Recommendation
  Runner、Phase 2 Runtime Orchestrator、Phase 3 Application
  Pattern、Phase 4 Capability Architecture（5層）本身完全沒有
  被修改。
- 完全沒有連接任何真實的監控dashboard/日誌系統，也沒有新增任何
  API route，也沒有實作任何AI。
- Rollback：本次所有變更都只是新增檔案，`git revert`此commit即可
  完整還原。

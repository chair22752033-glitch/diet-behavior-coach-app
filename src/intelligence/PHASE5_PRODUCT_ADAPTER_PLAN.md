# Phase 5 Intelligence Product Adapter Architecture Foundation（TASK1.92）

## 目的

在TASK1.91 Product Entry Boundary Foundation基礎上，定義Product
Entry跟Intelligence Feature之間**新增的一層轉換邊界（Intelligence
Adapter）**——本次任務**不是**實作HTTP路由、**不是**導入AI，是
Architecture Foundation任務，把TASK1.91規劃的"Product Intelligence
Entry"職責再拆解出一段獨立的Adapter職責，**不實作**任何實際的
轉換程式碼。

跟TASK1.91的差異：TASK1.91定義的"Product Intelligence
Entry"職責範圍涵蓋了HTTP解析**跟**格式轉換兩件事；本次任務把
"格式轉換"這一段獨立出來，明確命名為"Intelligence
Adapter"，讓Entry層只負責HTTP層級的事（method/path/body解析），
Adapter層專責負責"Product概念"跟"Intelligence概念"之間的雙向
轉換——這是規格要求的六層架構圖新增的一層：

```
User Application
  ↓
Product Entry
  ↓
Intelligence Adapter（本次任務新增定義）
  ↓
Feature
  ↓
Capability
  ↓
Runtime
```

完整的規劃/落地/審查任務序列（跨Phase）：

```
Phase 1 Foundation（TASK1.1~1.39）
Phase 2 Intelligence Runtime Foundation（TASK1.40~1.58）
Phase 3 Intelligence Application Layer（TASK1.59~1.74）
Phase 4 Intelligence Capability Architecture（TASK1.75~1.89）
Phase 5 Product Integration
  TASK1.90 Product Integration Architecture Planning（規劃）
  TASK1.91 Intelligence Product Entry Boundary Foundation（規劃）
  TASK1.92 Intelligence Product Adapter Architecture Foundation（這裡，規劃）
```

驗證方式見`backups/phase5-task1.92-product-adapter/
test_product_adapter_architecture.mjs`。

---

## Adapter Responsibility

Intelligence Adapter是規劃中Product Entry跟Feature
Intelligence Integration之間的**純轉換層**，只負責三件事（規格
原文列出的三件事，本次任務逐一展開）：

### Product Input Conversion（Product輸入轉換）

把Product Entry已經解析好的HTTP資料（例如已經parse過的JSON
body、已經驗證過的必要欄位）轉換成Insight Context形狀——這
**不是**重新解析HTTP，而是把Entry層交下來的"乾淨的Product資料"
轉換成"Intelligence認識的Context資料"。這段轉換邏輯規劃上應該
重用既有的Context Builder（`src/intelligence/context/`，
TASK1.42），Adapter層**不得**重新實作Insight Context的建構規則。

### Intelligence Request Conversion（Intelligence請求轉換）

把轉換好的Insight Context包裝成Feature Intelligence
Integration要求的`{context, options?}`形狀，呼叫
`requestIntelligence()`。這一段轉換邏輯規劃上**只做包裝**，不做
任何驗證（驗證職責歸屬見下方Request Mapping Boundary）。

### Result Conversion（結果轉換）

把Feature Intelligence Integration回傳的`{ok, feature, data}`或
`{ok:false, reason, field?, stage?}`轉換成Product Entry可以直接
包成HTTP Response的形狀——這一段轉換規劃上決定哪些欄位要暴露、
哪些要隱藏（見下方Response Mapping Boundary），但**不**加上HTTP
status code（那是Entry層的職責，Adapter層完全不認識HTTP是什麼）。

### Adapter跟Entry的職責邊界

- **Product Entry**（TASK1.91）：知道HTTP是什麼，負責解析
  Request、決定HTTP status code、組裝最終的HTTP Response。
- **Intelligence Adapter**（本次任務）：**不知道**HTTP是什麼，
  只認識"Product概念的資料形狀"（規劃上是一組乾淨的
  JS物件/欄位，不是Request/Response物件本身）跟"Intelligence
  概念的資料形狀"（`{context, options?}`/`{ok, feature,
  data}`），負責兩者之間的雙向轉換。

這個邊界延續Phase 4整個系列反覆確認的"No HTTP"規則
（`capabilities/orchestration/README.md`等既有文件），只是把
這條規則往上推一層——連Adapter都不知道HTTP是什麼，只有Entry
知道。

---

## Request Mapping Boundary

### Product Request → Intelligence Request

```
Product Request（規劃中的抽象形狀，不是真實HTTP Request物件）
  {
    userId?: string,      // 若有身份資訊，已由Entry層從既有Auth/Session取得
    rawInput: { ... }      // Product層的原始輸入資料（尚未轉換）
  }
  ↓（Intelligence Adapter轉換）
Intelligence Request
  {
    context: { ... },      // Insight Context形狀，透過既有Context Builder產生
    options?: { ... }
  }
```

### Ownership（歸屬）

- **Product Request形狀本身**歸屬Product
  Entry層定義（TASK1.91已規劃），Intelligence
  Adapter**不得**定義自己的一套Product Request形狀，只能消費
  Entry層已經整理好的資料。
- **Insight Context形狀**歸屬既有的`src/intelligence/context/`
  （TASK1.42 Context Builder），Intelligence
  Adapter呼叫既有Builder產生Context，**不得**自行決定Context
  裡有哪些欄位。
- **`{context, options?}`包裝形狀**歸屬Feature Intelligence
  Integration既有定義（TASK1.79），Intelligence
  Adapter只負責把Context塞進這個既有形狀，不得更改這個形狀本身。

### Validation Responsibility（驗證責任歸屬，延續TASK1.91並更精確劃分）

- **Product Entry**：HTTP層級形狀驗證（method/body是否為合法
  JSON）。
- **Intelligence Adapter**：**不做任何業務驗證**——這是本次
  任務新增的明確規則。Adapter是純轉換層，如果轉換過程中發現
  資料形狀不對（例如`rawInput`缺少必要欄位），規劃上應該
  直接把這個轉換失敗訊息往上拋，而不是自己定義新的驗證規則來
  判斷資料是否合法。
- **Context Builder**（既有，TASK1.42）：驗證組出來的Insight
  Context是否合法。
- **Feature/Capability層**（既有）：驗證`{context, options?}`
  形狀本身。

### Hidden Fields（轉換過程中不應該傳遞的欄位）

- Product Request裡任何跟HTTP相關的欄位（Header、Cookie物件
  本身）**不應該**被傳進Intelligence Adapter——這些應該在
  Entry層就被過濾/轉換成乾淨資料（例如`userId`字串），Adapter
  只接收轉換後的乾淨資料，維持Adapter層"不知道HTTP"的邊界。

---

## Response Mapping Boundary

### Intelligence Result → Product Response

```
Intelligence Result（Feature Intelligence Integration回傳）
  {
    ok: true,
    feature: 'intelligence',
    data: { analysis, recommendation, decision? }
  }
  ↓（Intelligence Adapter轉換）
Product Response（規劃中的抽象形狀，不含HTTP status code）
  {
    success: true,          // 規劃中對外的欄位命名，刻意跟ok區隔
    result: { analysis, recommendation, decision? }
  }
```

### Exposed Fields（規劃暴露給Product層的欄位）

- `analysis`/`recommendation`：原樣傳遞，延續TASK1.91已規劃的
  "原樣暴露"原則。
- `decision`：選填傳遞，延續TASK1.91已規劃的選填暴露原則。

### Hidden Internal Fields（Adapter層負責過濾的內部欄位）

延續並具體化TASK1.91 Response Boundary裡列為"規劃建議、本次
不強制"的過濾邏輯——本次任務把這個過濾動作**明確歸屬**給
Intelligence Adapter這一層（依然不實作，只是明確歸屬）：

- Feature層的`feature:'intelligence'`欄位——這是Feature層內部
  用來識別自己的標籤，規劃上Adapter轉換時**應該**移除，Product
  層不需要知道底層是哪個Feature在處理。
- Capability Orchestrator內部的`capability:'orchestration'`
  欄位——同上，規劃上Adapter層過濾掉。
- Decision Capability佔位形狀裡的`status:
  'decision_not_available'`——延續TASK1.91的規劃建議，Adapter
  層是**規劃上**最適合做這個過濾/轉換的地方（例如轉換成
  Product層自己定義的`decisionAvailable: false`布林欄位），
  本次任務依然只是規劃這個轉換方向，不實作。

---

## Error Mapping Boundary

延續TASK1.91已規劃的三種錯誤分類（Product Errors/Intelligence
Errors/Runtime Errors），本次任務明確定義Intelligence
Adapter在錯誤處理鏈路裡的位置跟職責：

### Product Errors

發生在Product Entry層（HTTP解析失敗），**不會**進入
Intelligence Adapter——Adapter層規劃上假設收到的輸入已經通過
Entry層的HTTP形狀驗證。

### Intelligence Errors

Feature Intelligence Integration/Capability Orchestrator
回傳的`{ok:false, reason, field?, stage?}`——這是Intelligence
Adapter**主要處理**的錯誤類型。規劃上Adapter層負責把這個既有
失敗形狀轉換成Product層的錯誤形狀（例如`{success:false,
errorCode: reason, errorField: field}`），但**不**決定HTTP
status code（那依然是Entry層的職責，Adapter層轉換出的
`errorCode`字串，由Entry層對照到實際的status code）。

### Runtime Errors

Analysis/Recommendation Runner內部若拋出未預期例外，規劃上
Intelligence Adapter應該用`try/catch`包住對Feature層的呼叫，
攔截後轉換成一個通用的"internal_error"錯誤碼往上傳給Entry層，
**不**把原始例外的stack trace或內部訊息透過Adapter層往外傳遞——
這是延續TASK1.91"不把原始例外訊息原樣暴露"的規則，本次任務
明確把這個攔截職責歸屬在Adapter這一層（Entry層假設Adapter層
已經處理過例外，不需要重複處理）。

**分工總結**：Product Errors在Entry層被擋下；Intelligence
Errors由Adapter轉換成Product層錯誤碼、Entry層決定status
code；Runtime Errors由Adapter攔截並降級成通用錯誤碼，不往外
洩漏內部細節。

---

## Feature Integration

Intelligence Adapter規劃上**唯一**呼叫的下游是Feature
Intelligence Integration（`intelligence_feature.js`，
TASK1.79）——延續TASK1.91已規劃的Feature Consumption
Path，本次任務重新確認：

- Insight（既有，TASK1.66）/Behavior（既有，TASK1.72）**不經過**
  Intelligence Adapter——這兩個既有Feature有自己既有的Application
  Pattern（Feature→Workflow→UseCase→ApplicationService→
  Runtime），Intelligence Adapter是**專屬於**Intelligence
  Capability這條規劃中路徑的轉換層，不是給所有Feature共用的
  通用Adapter。
- Intelligence Adapter**不得**直接呼叫Capability
  Orchestrator或任何Capability——它只認識Feature Intelligence
  Integration這一個介面（`requestIntelligence()`），維持
  "每一層只認識下一層"的既有分層原則。

---

## Known Limitations

1. **本次任務完全沒有建立任何Adapter程式碼**——`src/`底下沒有
   新增任何對應Intelligence Adapter的實作檔案，這是純規劃文件。
2. **沒有變更任何既有production程式碼**——Phase 1~4建立的所有
   既有程式碼、TASK1.90/1.91規劃的文件，本次任務完全沒有修改。
3. **Product Request/Response的實際型別/介面尚未定義**——本文件
   使用的`{userId?, rawInput}`/`{success, result}`只是規劃層級
   的示意形狀，不是承諾的最終介面定義，實際型別留給未來落地
   任務決定。
4. **`errorCode`到HTTP status code的完整對照表依然沒有建立**——
   延續TASK1.91已記錄的Known Limitation，本次任務只是把"由誰
   產生errorCode"（Adapter）跟"由誰決定status code"（Entry）
   的分工釐清，對照表本身依然留給未來。
5. **是否真的需要獨立的Adapter層（vs 直接在Entry層做轉換）尚未
   最終定案**——本文件規劃了Entry/Adapter兩層分離的設計，但這
   是規劃階段的建議架構，實際落地時是否要合併成一層，留給未來
   落地任務根據實際複雜度決定。
6. **Contract結論延續**——延續`PHASE4_DECISION_CONTRACT_PLAN.md`
   （TASK1.84）的階段性結論，本次任務沒有改變它。
7. **async限制延續**——延續TASK1.75~1.91已記錄的Known
   Limitation：目前所有Capability都是同步函式，規劃中的
   Intelligence Adapter若要包裝成async介面（配合Entry層既有
   async路由慣例），這個轉換細節留給未來落地任務處理。

---

## Completion Criteria 確認

✅ Product Adapter Boundary defined——Intelligence
Adapter的職責範圍（Product Input Conversion/Intelligence
Request Conversion/Result Conversion）跟Entry層的邊界已在
Adapter Responsibility章節明確記錄。

✅ Request mapping defined——Product Request→Intelligence
Request的轉換方向、歸屬、驗證責任、隱藏欄位已記錄。

✅ Response mapping defined——Intelligence Result→Product
Response的轉換方向、暴露欄位、Adapter層負責過濾的內部欄位已
記錄。

✅ Error mapping defined——Product/Intelligence/Runtime三種
錯誤在Adapter層的處理分工已記錄。

✅ AI Provider not enabled——本次規劃沒有呼叫任何AI SDK、沒有
建立Prompt Logic。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。

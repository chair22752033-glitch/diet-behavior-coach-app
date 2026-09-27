# Phase 5 Product Intelligence Feature Flow Architecture Planning（TASK1.93）

## 目的

在TASK1.90/1.91/1.92建立的Product Integration/Entry
Boundary/Adapter Boundary規劃基礎上，定義真實Product情境如何
消費Intelligence能力的完整Feature Flow——本次任務**不是**實作
HTTP路由、**不是**導入AI，是Architecture Planning任務，把
前三個任務各自定義的單一邊界，串成一條完整的、規格要求的七層
Flow，**不實作**任何實際的路由/Feature接線程式碼。

跟TASK1.90/1.91/1.92的差異：
- TASK1.90規劃的是四層責任邊界的**整體方向**。
- TASK1.91聚焦Product Entry這一段（HTTP↔Intelligence概念的
  唯一合法轉換點）。
- TASK1.92聚焦Intelligence Adapter這一段（Entry跟Feature之間
  的純轉換層）。
- 本次任務（TASK1.93）把"User Scenario"跟"Product
  Feature"這兩個規格新增的概念，接到前面已經定義好的Entry→
  Adapter→Feature→Capability→Runtime鏈路最前端，形成完整的
  七層Flow，並且逐層定義Request/Response/Error三種
  Lifecycle——這是規劃系列**第一次**把"真實User情境"納入
  討論範圍。

完整的規格目標Flow：

```
User Scenario
  ↓
Product Feature
  ↓
Product Entry
  ↓
Intelligence Adapter
  ↓
Intelligence Feature
  ↓
Capability Layer
  ↓
Runtime Layer
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
  TASK1.92 Intelligence Product Adapter Architecture Foundation（規劃）
  TASK1.93 Product Intelligence Feature Flow Architecture Planning（這裡，規劃）
```

驗證方式見`backups/phase5-task1.93-product-feature-flow/
test_product_feature_flow_architecture.mjs`。

---

## Product Feature Flow Architecture

### 七層責任確認

- **User Scenario**（本次任務新增的概念）：真實使用者的行為
  情境（例如"使用者想看今天的飲食建議"），這是Product層規劃
  Feature時的**輸入需求**，不是程式碼——這一層不對應任何
  `src/`底下的檔案，純粹是產品規劃層級的概念，用來說明"為什麼
  會有下一層的Product Feature"。
- **Product Feature**（本次任務新增的概念）：把User
  Scenario轉成具體的產品功能（例如"每日建議頁面"），這一層
  **規劃上**對應到既有`src/routes/`/`src/controllers/`裡
  某個具體的路由處理函式——本次任務**不建立**任何這樣的路由，
  只確認未來若要落地，這一層歸屬既有的routes/controllers架構
  位置。
- **Product Entry**（TASK1.91已規劃）：HTTP層級的解析/驗證/
  Response組裝，本次任務不重新定義，只確認Product
  Feature呼叫Product Entry這一段介面。
- **Intelligence Adapter**（TASK1.92已規劃）：Product概念跟
  Intelligence概念之間的純轉換層，本次任務不重新定義。
- **Intelligence Feature**：Feature Intelligence
  Integration（`intelligence_feature.js`，TASK1.79），已存在，
  本次任務完全不修改。
- **Capability Layer**：Phase 4整條Capability
  Chain（TASK1.76~1.86），已存在，本次任務完全不修改。
- **Runtime Layer**：Analysis/Recommendation
  Runner（Phase 2），已存在，本次任務完全不修改。

### Responsibility Ownership（責任歸屬總表）

| 層級 | 歸屬 | 是否本次任務建立 |
|---|---|---|
| User Scenario | 產品規劃概念，不對應程式碼 | 否，純概念 |
| Product Feature | `src/routes/`/`src/controllers/`（規劃中） | 否 |
| Product Entry | `src/routes/`/`src/controllers/`（TASK1.91規劃） | 否 |
| Intelligence Adapter | 規劃中的獨立轉換層（TASK1.92規劃） | 否 |
| Intelligence Feature | `application/features/intelligence/`（TASK1.79已落地） | 否，既有 |
| Capability Layer | `capabilities/`（TASK1.76~1.86已落地） | 否，既有 |
| Runtime Layer | `analysis/`、`recommendation/`（Phase 2已落地） | 否，既有 |

### Dependency Direction（依賴方向）

七層之間維持嚴格的單向依賴——上層可以呼叫下一層的公開介面，
**不得**跳過中間層直接呼叫更下層，也**不得**下層依賴上層：

- Product Feature只呼叫Product Entry，不直接呼叫Adapter或
  Feature。
- Product Entry只呼叫Intelligence Adapter，不直接呼叫
  Intelligence Feature或Capability。
- Intelligence Adapter只呼叫Intelligence
  Feature（`requestIntelligence()`），不直接呼叫Capability
  Orchestrator或任何Capability——這是TASK1.92已經明確規劃的
  規則，本次任務重新確認並延伸到整條七層Flow。
- Intelligence Feature只呼叫Capability
  Orchestrator，不直接呼叫Analysis/Recommendation
  Runner——這是Phase 4既有邊界，本次任務不修改。
- Capability Layer只呼叫Runtime
  Layer（透過Runner），不直接存取database/auth/其他Runtime
  Internal Component——這是Phase 4既有邊界。

### Boundary Isolation（邊界隔離）

七層之間**沒有**任何一層可以繞過相鄰層直接存取更下層的內部
狀態——例如Product Feature不能直接import
`src/intelligence/capabilities/`底下的任何檔案，即使技術上
`import`語法允許這麼做，這也違反本次任務規劃的隔離原則。這條
規則延續Phase 4"每一層只認識下一層"的既有設計，本次任務把它
延伸到Product層。

---

## Feature Consumption Pattern

### 三種既有能力 + Decision Output的消費方式

- **Insight Intelligence**（既有，TASK1.66）：Product
  Feature（規劃中）若要消費Insight，走既有的`insightFeature.
  requestInsight()`路徑，**不經過**Intelligence
  Adapter/Intelligence Feature（Feature Intelligence
  Integration）——這是完全獨立、已經落地的Application Pattern，
  本次任務不改變。
- **Behavior Intelligence**（既有，TASK1.72）：同上，走既有的
  `behaviorFeature.requestBehavior()`路徑，同樣不經過
  Intelligence Adapter。
- **Capability Orchestration**（TASK1.78/1.86）：Product
  Feature（規劃中）若要消費Analysis+Recommendation（+選填
  Decision）組合能力，**必須**透過Intelligence
  Adapter→Intelligence Feature這條路徑，不得直接呼叫
  Capability Orchestrator。
- **Decision Output**（TASK1.83/1.87）：目前是佔位形狀
  （`decision: null`），Product Feature若要消費，同樣透過
  Intelligence Feature（若Feature未來注入`decisionCapability`），
  Product層**不需要**、也**不應該**知道Decision Capability
  內部如何運作。

### Product Feature不得直接呼叫的清單（規格明確要求）

- **Analysis Runner**（`src/intelligence/analysis/
  analysis_runner.js`）——必須透過Analysis Capability→
  Capability Orchestrator→Intelligence Feature這條既有鏈路，
  Product層完全不認識Runner的存在。
- **Recommendation Runner**——同上。
- **Runtime Internal Components**（`execution/`、`history/`、
  `metrics/`、`events/`、`governance/`、`facade/`、`service/`、
  `orchestration/`、`data_preparation/`）——這些是Phase 2
  Runtime Orchestrator內部使用的元件，Product Feature/
  Intelligence Adapter/Intelligence
  Feature/Capability層皆不得直接依賴。

---

## Request Lifecycle

完整的Request轉換鏈路（規格原文）：

```
Product Request
  ↓
Entry Validation
  ↓
Adapter Mapping
  ↓
Feature Request
  ↓
Capability Execution
```

### Request Ownership（各階段歸屬）

- **Product Request**：由User Scenario觸發，經Product
  Feature產生，形狀由Product Feature自行定義（規劃上是HTTP
  Request Body加上路由參數），本次任務不規定具體欄位。
- **Entry Validation**：歸屬Product Entry
  （TASK1.91已規劃）——驗證HTTP層級的形狀是否合法。
- **Adapter Mapping**：歸屬Intelligence Adapter
  （TASK1.92已規劃）——把驗證過的Product資料轉換成Insight
  Context形狀，不做業務驗證。
- **Feature Request**：轉換完成後，恰好是Feature Intelligence
  Integration既有要求的`{context, options?}`形狀（TASK1.79）。
- **Capability Execution**：Feature內部呼叫Capability
  Orchestrator執行整條Capability Chain，這一段完全是既有
  Phase 4行為，Product層/Adapter層都不參與這一段的執行細節。

### Validation Responsibility（驗證責任總表，延續並匯總TASK1.91/1.92）

| 驗證項目 | 歸屬層級 |
|---|---|
| HTTP method/body是否為合法JSON | Product Entry |
| Insight Context本身是否合法 | Analysis Capability（間接透過Analysis Runner既有驗證） |
| `{context, options?}`形狀是否為物件 | Capability Orchestrator既有驗證（`validateCapabilityOrchestratorRequest()`） |
| 業務規則驗證（例如使用者是否有權限看到某個insight類型） | 規劃上歸屬Product Feature層，不是Intelligence相關任何一層的職責 |

### Transformation Boundary（轉換邊界）

**只有Intelligence Adapter這一層**允許做"Product概念"到
"Intelligence概念"的資料轉換——Product Entry不得自行轉換
Context形狀（只能做HTTP形狀驗證），Intelligence
Feature/Capability Layer不得知道Product概念的存在（它們只
認識`{context, options?}`這個已經轉換完成的形狀）。

---

## Response Lifecycle

完整的Response轉換鏈路（規格原文）：

```
Capability Result
  ↓
Feature Result
  ↓
Adapter Mapping
  ↓
Product Response
```

### Exposed Fields（延續並確認TASK1.91/1.92已規劃的欄位）

- `analysis`/`recommendation`：從Capability Result一路原樣
  傳遞到Product Response，中間任何一層都不修改其內容。
- `decision`：選填欄位，同樣原樣傳遞（若存在）。

### Hidden Internal Fields（延續TASK1.91/1.92已規劃的過濾點）

- `capability: 'orchestration'`（Capability Orchestrator內部
  標籤）——規劃上在Adapter Mapping這一步被過濾掉。
- `feature: 'intelligence'`（Feature層內部標籤）——同上，
  Adapter Mapping這一步過濾。
- Decision佔位形狀的`status: 'decision_not_available'`——規劃上
  轉換成Product層自己的語意欄位（例如`decisionAvailable:
  false`），這個轉換規則延續TASK1.92已規劃的方向，本次任務
  不重新設計。

### Compatibility Strategy（相容性策略）

- Capability Result→Feature Result這一段完全是既有的Phase 4
  行為（TASK1.78/1.86 Backward Compatibility保證），本次任務
  不改變。
- Feature Result→Adapter Mapping這一段是TASK1.92已規劃的
  轉換規則，本次任務重新確認並放進整條Lifecycle裡。
- Adapter Mapping→Product Response這一段的實際欄位命名（例如
  是否叫`result`還是其他名稱）留給未來落地任務決定，本次任務
  只確認轉換方向跟過濾規則本身。

---

## Error Lifecycle

完整的Error轉換鏈路（規格原文，比TASK1.91/1.92規劃的三分類
更細緻，多了Entry/Adapter兩個獨立階段）：

```
Product Error
  ↓
Entry Error
  ↓
Adapter Error
  ↓
Capability Error
  ↓
Runtime Error
```

### Error Ownership（各階段歸屬跟觸發時機）

- **Product Error**：發生在Product Feature層——例如業務規則
  檢查失敗（使用者沒有權限），這類錯誤**不會**往下傳遞到Entry
  以下任何一層，因為根本不會產生Intelligence相關的呼叫。
- **Entry Error**：發生在Product Entry層——HTTP形狀驗證失敗
  （TASK1.91已規劃的Product Errors分類），**不會**往下傳遞到
  Adapter。
- **Adapter Error**：發生在Intelligence Adapter層——轉換過程
  本身失敗（例如Product資料缺少Adapter轉換Context所需的
  必要欄位），這是本次任務**新增明確定義**的錯誤階段，介於
  TASK1.91/1.92規劃的"Product Errors"跟"Intelligence
  Errors"之間——Adapter轉換失敗**不是**Intelligence
  Errors（Feature/Capability層還沒被呼叫到），也**不是**單純
  的Product Error（因為需要Adapter的轉換邏輯才能發現這個
  問題）。
- **Capability Error**：即TASK1.91/1.92規劃的"Intelligence
  Errors"——Feature Intelligence Integration/Capability
  Orchestrator回傳的`{ok:false, reason, field?, stage?}`。
- **Runtime Error**：Analysis/Recommendation Runner內部若拋出
  未預期例外，延續TASK1.92已規劃的攔截跟降級規則。

### Conversion Responsibility（轉換責任）

每一層只負責**把自己這一層的失敗，轉換成往上一層看得懂的
形狀**，不得跳過中間層直接轉換成最外層（Product Feature）看
得懂的格式——例如Capability Error不會直接變成Product Feature
的錯誤格式，必須先經過Adapter Error這一層的轉換（規劃上是
`reason`字串轉成`errorCode`），再經過Entry Error這一層決定
HTTP status code，最後才到Product Feature/Product Error這個
最外層。

### Isolation Strategy（隔離策略）

- 任何一層的錯誤都**不得**洩漏下一層（更底層）的實作細節——
  例如Product Feature最終看到的錯誤，不應該包含Runtime
  Runner的原始例外訊息或stack trace，這條規則延續TASK1.92
  已規劃的"不把原始例外訊息原樣暴露"。
- 這個隔離策略的目的是讓Product層的錯誤處理程式碼**不需要**
  認識Intelligence內部任何一層的實作細節，只需要處理一組
  規劃中會存在、但本次任務不建立的標準化`errorCode`。

---

## Phase 5 Integration Roadmap

### 已完成（TASK1.90~1.93累積規劃）

- Product Integration整體方向（TASK1.90）。
- Product Entry Boundary（TASK1.91）。
- Intelligence Adapter Boundary（TASK1.92）。
- 完整七層Feature Flow跟三種Lifecycle（TASK1.93，這裡）。

### 尚未落地（留給未來任務）

1. 實際建立Product Entry/Intelligence Adapter的程式碼（目前
   完全不存在）。
2. 在`src/bootstrap/application.js`新增對應欄位，把Feature
   Intelligence Integration組裝好依賴後掛上去。
3. 建立`errorCode`到HTTP status code的完整對照表。
4. 選擇一個具體的User Scenario/Product Feature作為第一個真實
   落地案例，驗證整條七層Flow在真實情境下可行。

### Known Limitations

見下方獨立章節。

---

## Known Limitations

1. **本次任務完全沒有建立任何路由/Adapter/Feature程式碼**——
   `src/`底下沒有新增任何對應User Scenario/Product
   Feature/Intelligence Adapter的實作檔案。
2. **沒有變更任何既有production程式碼**——Phase 1~4建立的所有
   既有程式碼、TASK1.90/1.91/1.92規劃的文件，本次任務完全沒有
   修改。
3. **User Scenario/Product Feature是規劃概念，不是程式碼層級的
   定義**——本文件用表格跟文字描述這兩層的職責，但沒有、也不
   打算定義具體的介面或型別，這些留給未來落地任務根據實際
   User Scenario決定。
4. **Adapter Error是本次任務新增的錯誤分類，尚未有實際程式碼
   驗證**——這個分類目前只存在於規劃文件，沒有任何測試能夠
   驗證"Adapter轉換真的會產生這種錯誤"，因為Adapter本身還不
   存在。
5. **errorCode/HTTP status code對照表依然沒有建立**——延續
   TASK1.91/1.92已記錄的Known Limitation。
6. **Contract結論延續**——延續`PHASE4_DECISION_CONTRACT_PLAN.md`
   （TASK1.84）的階段性結論，本次任務沒有改變它。
7. **async限制延續**——延續TASK1.75~1.92已記錄的Known
   Limitation：目前所有Capability都是同步函式，規劃中的七層
   Flow若要包裝成async介面，這個轉換細節留給未來落地任務處理。

---

## Completion Criteria 確認

✅ Product Intelligence Feature Flow defined——完整七層
（User Scenario→Product Feature→Product Entry→Intelligence
Adapter→Intelligence Feature→Capability Layer→Runtime
Layer）責任歸屬、依賴方向、邊界隔離已記錄。

✅ Feature consumption path defined——Insight/Behavior（既有，
不經過Adapter）跟Capability Orchestration/Decision
Output（必須經過Adapter→Feature）兩種消費模式已記錄，Product
Feature不得直接呼叫Analysis/Recommendation Runner/Runtime
Internal Components的清單已明確列出。

✅ Request lifecycle defined——Product Request→Entry
Validation→Adapter Mapping→Feature Request→Capability
Execution五個階段的歸屬、驗證責任、轉換邊界已記錄。

✅ Response lifecycle defined——Capability Result→Feature
Result→Adapter Mapping→Product Response四個階段的暴露/隱藏
欄位、相容性策略已記錄。

✅ Error lifecycle defined——Product Error→Entry Error→
Adapter Error→Capability Error→Runtime Error五個階段的歸屬、
轉換責任、隔離策略已記錄，新增定義了Adapter Error這個分類。

✅ AI Provider not enabled——本次規劃沒有呼叫任何AI SDK、沒有
建立Prompt Logic。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。

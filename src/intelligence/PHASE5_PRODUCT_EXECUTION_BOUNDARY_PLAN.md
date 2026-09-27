# Phase 5 Product Intelligence Execution Boundary Foundation（TASK1.95）

## 目的

在TASK1.90/1.91/1.92/1.93/1.94建立的Product Integration/Entry/
Adapter/Feature Flow/Contract規劃基礎上，定義Product Intelligence
Contract跟Intelligence Feature**實際執行**之間的邊界（Execution
Boundary）——本次任務**不是**實作HTTP路由、**不是**導入AI，是
Architecture Foundation任務，在Intelligence Adapter跟Intelligence
Feature之間**新增一層**明確的執行邊界定義，**不實作**任何實際的
執行程式碼。

跟TASK1.90/1.91/1.92/1.93/1.94的差異：
- TASK1.90~1.94規劃的都是**資料形狀**跟**職責邊界**（Request/
  Response/Error的形狀、Contract的介面規範）。
- 本次任務（TASK1.95）規劃的是**執行過程本身**——Intelligence
  Feature被呼叫這件事，從"被呼叫"到"回傳結果"之間，經歷了哪些
  階段、每個階段誰負責、失敗時如何處理——這是規劃系列**第一次**
  把"執行時序"（而不是"資料形狀"）作為主要規劃對象。

完整的規格目標Flow：

```
Product Feature
  ↓
Product Contract
  ↓
Product Entry
  ↓
Intelligence Adapter
  ↓
Execution Boundary（本次任務新增定義）
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
  TASK1.93 Product Intelligence Feature Flow Architecture Planning（規劃）
  TASK1.94 Product Intelligence Application Contract Foundation（規劃）
  TASK1.95 Product Intelligence Execution Boundary Foundation（這裡，規劃）
```

驗證方式見`backups/phase5-task1.95-product-execution/
test_product_execution_boundary.mjs`。

---

## Execution Boundary

### Contract → Execution Boundary → Feature Execution

Execution Boundary是規劃中Intelligence Adapter完成資料轉換
**之後**、真正呼叫Feature Intelligence
Integration**之前**（以及呼叫完成、拿到結果**之後**）的一段
執行管控邊界——它不轉換資料形狀（那是Adapter的職責，
TASK1.92），也不定義介面規範（那是Contract的職責，
TASK1.94），它管的是**呼叫這件事本身怎麼進行**。

### Responsibility（職責）

- **啟動執行**：Adapter轉換完成`{context, options?}`後，
  Execution Boundary負責實際發起對`intelligenceFeature.
  requestIntelligence()`的呼叫。
- **追蹤執行狀態**：記錄這次呼叫目前處於哪個階段（見下方
  Execution Lifecycle），這是**規劃層級**的狀態追蹤，不是要求
  未來落地一定要有一個狀態機物件，只是本次任務要求"呼叫過程
  的每個階段都要能被辨識出來"。
- **攔截執行失敗**：捕捉Feature呼叫過程中可能發生的失敗（既有
  的`{ok:false,...}`回傳，或未預期的例外），轉交給下方Failure
  Recovery Boundary定義的分類處理。
- **回傳執行結果**：把Feature執行完成的結果（成功或失敗）交還
  給呼叫端（規劃上是Intelligence Adapter，往上游繼續走
  Response Lifecycle，TASK1.93已規劃）。

Execution Boundary**不負責**：資料形狀轉換（Adapter職責）、
介面規範定義（Contract職責）、HTTP處理（Entry職責）、任何
業務決策邏輯（Capability/Runtime既有邊界之外的任何判斷）。

### Ownership（歸屬）

- Execution Boundary規劃上是**Intelligence Adapter內部**的一段
  邏輯，而不是一個獨立的檔案/模組——這跟TASK1.91/1.92已經
  規劃的"Entry"、"Adapter"是獨立命名層不同：Execution Boundary
  是Adapter職責裡"呼叫Feature並處理執行時序"這一段的**更細緻
  拆解**，歸屬依然在Adapter範疇內，只是本次任務把它獨立出來
  詳細規劃。
- Execution Boundary**唯一**呼叫的下游是Feature Intelligence
  Integration的`requestIntelligence()`——這條規則延續TASK1.92/
  1.93已規劃的"Adapter只認識Feature介面"的既有邊界，本次任務
  重新確認並在此基礎上規劃執行細節。

### Lifecycle（生命週期，總覽）

Execution Boundary管理的執行生命週期，見下方獨立的Execution
Lifecycle章節詳細展開。

---

## Execution Lifecycle

規格要求的五個階段：

```
request received
  ↓
validation completed
  ↓
execution started
  ↓
execution completed
  ↓
execution failed（跟completed互斥，其中一個會發生）
```

### 各階段定義

- **request received**：Execution Boundary收到Adapter轉換完成
  的`{context, options?}`——這是執行流程的起點，此時**尚未**
  呼叫Feature，只是"收到了準備要執行的請求"。
- **validation completed**：確認`{context, options?}`形狀本身
  沒有問題（規劃上這一步實際上發生在Capability Orchestrator
  既有的`validateCapabilityOrchestratorRequest()`裡，Execution
  Boundary本身不重新驗證，只是"知道"驗證這件事會發生、且發生
  在這個階段——這是規劃上的時序標記，不是新增一段驗證邏輯）。
- **execution started**：Execution Boundary實際呼叫
  `intelligenceFeature.requestIntelligence()`的那一刻。
- **execution completed**：`requestIntelligence()`回傳
  `{ok:true, feature, data}`——這是**成功**的終止狀態。
- **execution failed**：`requestIntelligence()`回傳
  `{ok:false, reason,...}`，或呼叫過程拋出未預期例外——這是
  **失敗**的終止狀態，跟`execution completed`互斥（同一次
  執行只會走到其中一個）。

### 階段之間的關係

`request received`→`validation
completed`→`execution started`是**嚴格循序**的（不能跳過
validation直接execution）；`execution started`之後，**恰好**
走向`execution completed`或`execution failed`兩者之一——沒有
第三種終止狀態，也不會同時是兩者。

這五個階段**全部**發生在單一次同步函式呼叫的生命週期內（延續
TASK1.75~1.94已記錄的"目前所有Capability都是同步函式"這條
Known Limitation）——規劃上，這五個階段目前是**邏輯上**可以
辨識的五個時間點，不是五個真的會被分別記錄下來的獨立事件
（除非未來要新增可觀測性機制，那是TASK1.89規劃的Operational
Readiness方向的範圍，本次任務不涉及）。

---

## Result Handling Boundary

### Execution Result → Product Result

```
Execution Result（Feature Intelligence Integration回傳）
  {ok:true, feature:'intelligence', data:{analysis, recommendation, decision?}}
  或
  {ok:false, reason, field?, stage?}
  ↓（Execution Boundary處理）
Product Result（往上游Adapter/Entry繼續走既有Response/Error Lifecycle）
```

### Success Handling（成功處理）

`execution completed`狀態下，Execution Boundary**原樣**把
`data`欄位往上傳遞——這是延續TASK1.93/1.94已規劃的
"Capability Result→Feature Result→Adapter Mapping→Product
Response"鏈路，Execution Boundary在這條鏈路裡不新增、不修改
任何欄位內容，只是"確認執行成功、可以往下一步走"。

### Failure Handling（失敗處理）

`execution failed`狀態下，Execution Boundary**分類**這次失敗
（見下方Failure Recovery Boundary的五種分類），並把分類結果
往上傳遞給Adapter層繼續走既有的Error Lifecycle（TASK1.93）——
Execution Boundary本身**不決定**最終呈現給Product層的錯誤碼或
HTTP status code，只負責"確認這是哪一種失敗"。

### Hidden Internal State（隱藏的內部狀態）

- Execution Lifecycle的五個階段標記（`request
  received`/`validation completed`/`execution
  started`/`execution completed`/`execution
  failed`）本身**是規劃概念，不是要往上游傳遞的資料欄位**——
  Product層/Adapter層**不會**在Response/Error裡看到這些階段
  名稱，它們只是本文件用來描述"執行怎麼進行"的內部語彙。
- 這條規則延續TASK1.92/1.93/1.94已規劃的"Hidden Internal
  Fields"精神——Execution Boundary層級也有自己的內部狀態，
  同樣不應該外洩。

---

## Failure Recovery Boundary

延續並精確對應TASK1.93 Error Lifecycle五階段
（Product/Entry/Adapter/Capability/Runtime
Error）跟TASK1.94 Error Contract四類型（Product/Adapter/
Intelligence/Runtime Error），本次任務在Execution Boundary
這個更細的顆粒度上，重新定義五種失敗來源跟各自的Recovery
策略：

### Contract Failure

Product Feature呼叫時提供的資料，經過Adapter轉換後，發現不
符合Contract定義的Request Contract（TASK1.94）——例如轉換完
的`context`不是物件。規劃上**不會**真的呼叫
`requestIntelligence()`（`execution started`階段不會發生），
直接在`validation completed`之前就中止，Recovery策略是直接
往上回報，不重試。

### Adapter Failure

Adapter轉換過程本身失敗（延續TASK1.93新增定義的Adapter
Error）——同樣**不會**進入`execution started`階段，Recovery
策略同上，直接往上回報。

### Feature Failure

Feature Intelligence Integration/Capability Orchestrator
回傳`{ok:false, reason, field?, stage?}`——這是**已經**進入
`execution started`階段、確實呼叫了Feature，但Feature/
Capability層自己判斷輸入不合法或依賴缺失。Recovery策略是
**不重試**（因為這通常是輸入問題或組裝問題，重試不會改變
結果），直接把`{ok:false,...}`原樣往上傳遞。

### Capability Failure

規格用詞跟Feature Failure在目前架構下**是同一件事**——因為
Intelligence Feature本身只是把呼叫轉發給Capability
Orchestrator，兩者的失敗形狀完全相同（都是`{ok:false,
reason, field?, stage?}`）。本文件把它們列成兩個名稱是延續
規格的用詞，但**本次任務明確記錄**：在目前的架構下，這兩種
失敗沒有可觀察的差異，Execution Boundary不需要、也無法區分
"是Feature層自己判斷失敗，還是Feature呼叫Capability後
Capability判斷失敗"——這是Phase 4刻意設計的封裝結果（Feature
只是Capability的呼叫端，不重新包裝失敗訊息）。

### Runtime Failure

Analysis/Recommendation Runner內部若拋出未預期例外——這會在
`execution started`階段**之後**、但在到達
`execution completed`/`execution failed`之前發生（也就是
`requestIntelligence()`呼叫本身拋出例外，而不是回傳
`{ok:false,...}`）。Recovery策略是Execution Boundary用
`try/catch`包住整個呼叫，攔截後**強制**轉換成
`execution failed`終止狀態（延續TASK1.92/1.93/1.94已規劃的
"不把原始例外訊息原樣暴露"規則），不允許例外真的往上游
（Adapter/Entry/Product Feature）擴散。

### Recovery策略總結

五種失敗來源裡，只有Runtime Failure需要**主動攔截**（因為它
是例外，不是正常回傳值）；其餘四種（Contract/Adapter/
Feature/Capability Failure）都是**既有的`{ok:false,...}`回傳
路徑**，Execution Boundary只是原樣傳遞，不需要額外的
try/catch。**沒有任何一種失敗規劃上會觸發自動重試**——這是
本次任務的明確決定：Intelligence Chain目前是deterministic的
（同樣輸入永遠得到同樣輸出，Phase 4/Phase 5系列反覆驗證過），
重試一個deterministic的失敗呼叫不會改變結果，所以不規劃任何
重試機制。

---

## Feature Integration

Execution Boundary規劃上**唯一**呼叫的下游依然是Feature
Intelligence Integration（`intelligence_feature.js`，
TASK1.79）——延續TASK1.92/1.93已規劃的Feature Consumption
Path，本次任務重新確認：

- Insight（既有，TASK1.66）/Behavior（既有，TASK1.72）**不
  經過**Execution Boundary——這兩個既有Feature有自己既有的
  Application Pattern，本次任務新增的Execution Boundary概念
  是**專屬於**Intelligence Capability這條規劃中路徑的，不是
  給所有Feature共用的通用執行邊界。
- Execution Boundary**不得**直接呼叫Capability
  Orchestrator——維持"每一層只認識下一層"的既有分層原則。

---

## Phase 5 Roadmap

### 已完成（TASK1.90~1.95累積規劃）

- Product Integration整體方向（TASK1.90）。
- Product Entry Boundary（TASK1.91）。
- Intelligence Adapter Boundary（TASK1.92）。
- 完整七層Feature Flow跟三種Lifecycle（TASK1.93）。
- Product Intelligence Contract跟版本策略（TASK1.94）。
- Execution Boundary、Execution Lifecycle五階段、Failure
  Recovery五分類（TASK1.95，這裡）。

### 尚未落地（留給未來任務）

1. 實際建立Product Entry/Intelligence Adapter（含Execution
   Boundary邏輯）/Contract定義的程式碼（目前完全不存在）。
2. 在`src/bootstrap/application.js`新增對應欄位。
3. 建立`errorCode`到HTTP status code的完整對照表。
4. 選擇第一個真實User Scenario/Product Feature落地案例，驗證
   本文件定義的Execution Lifecycle/Failure Recovery在真實
   情境下是否需要調整。
5. 若未來需要Operational Readiness（可觀測性、監控），評估
   是否要把Execution Lifecycle的五個階段變成真的會被記錄的
   事件（目前只是邏輯概念）。

### Known Limitations

見下方獨立章節。

---

## Known Limitations

1. **本次任務完全沒有建立任何執行邏輯程式碼**——`src/`底下
   沒有新增任何對應Execution Boundary的實作檔案，Execution
   Lifecycle的五個階段目前只是文件描述的邏輯概念。
2. **沒有變更任何既有production程式碼**——Phase 1~4建立的所有
   既有程式碼、TASK1.90~1.94規劃的文件，本次任務完全沒有
   修改。
3. **Feature Failure跟Capability Failure在目前架構下無法區分**
   ——本文件明確記錄這個限制，不是本次任務要解決的問題，而是
   Phase 4既有封裝設計的自然結果。
4. **沒有規劃任何重試機制**——這是本次任務的明確決定（因為
   Chain是deterministic的），但若未來Runtime層引入非
   deterministic的行為（例如真的呼叫外部AI
   API），這個"不重試"的假設需要重新評估——這也是延續TASK1.89
   AI Integration Timing判斷的其中一個理由：現在不是導入AI的
   時機，因為Operational Readiness（含重試/降級策略）還沒有
   規劃到位。
5. **Execution Lifecycle五階段目前不是可觀測的事件**——延續
   TASK1.89已規劃的Operational Readiness方向，若未來需要
   監控/告警，這五個階段是否要變成真正的事件（例如
   dispatch到Event Dispatcher），留給未來任務決定。
6. **Contract結論延續**——延續`PHASE4_DECISION_CONTRACT_PLAN.md`
   （TASK1.84）的階段性結論，本次任務沒有改變它。
7. **async限制延續**——延續TASK1.75~1.94已記錄的Known
   Limitation：目前所有Capability都是同步函式，Execution
   Lifecycle的五個階段全部發生在單一次同步呼叫內，未來若要
   支援async，這五個階段的時序關係需要重新設計（例如
   `execution started`到`execution completed`之間可能跨越
   多個event loop tick）。

---

## Completion Criteria 確認

✅ Product Execution Boundary defined——Contract→Execution
Boundary→Feature Execution的職責、歸屬已在Execution Boundary
章節明確記錄，並確認Execution Boundary歸屬Adapter內部範疇。

✅ Execution lifecycle defined——request
received/validation completed/execution
started/execution completed/execution
failed五個階段的定義跟階段之間的嚴格關係已記錄。

✅ Result handling defined——Execution Result→Product
Result的成功/失敗處理、Hidden Internal State（五個階段標記
不外洩）已記錄。

✅ Failure recovery defined——Contract/Adapter/Feature/
Capability/Runtime五種失敗來源的Recovery策略已記錄，明確
說明只有Runtime Failure需要主動攔截、其餘四種原樣傳遞、
沒有任何重試機制。

✅ AI Provider not enabled——本次規劃沒有呼叫任何AI SDK、沒有
建立Prompt Logic。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。

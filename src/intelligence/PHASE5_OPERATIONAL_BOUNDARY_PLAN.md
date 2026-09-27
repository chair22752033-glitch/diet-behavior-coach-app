# Phase 5 Product Intelligence Operational Boundary Architecture Planning（TASK1.96）

## 目的

在TASK1.90~1.95建立的Product Integration/Entry/Adapter/Feature
Flow/Contract/Execution Boundary規劃基礎上，定義Product
Intelligence執行過程如何被**觀察、追蹤、安全地運維**——本次任務
**不是**實作監控基礎設施、**不是**導入AI，是Architecture
Planning任務，在Execution Boundary跟Feature之間**新增一層**
Operational Boundary定義，**不實作**任何實際的監控/日誌程式碼。

跟TASK1.90~1.95的差異：
- TASK1.90~1.94規劃的是**資料形狀跟職責邊界**（Request/
  Response/Error/Contract）。
- TASK1.95規劃的是**執行時序**（Execution
  Lifecycle五階段、Failure Recovery）。
- 本次任務（TASK1.96）規劃的是**可觀測性**——執行的每個階段
  "是否/如何被觀察到"，這是延續TASK1.89 Phase 5
  Direction跟TASK1.95 Known Limitations裡都提到、但一直
  留給未來任務的"Operational Readiness"方向，第一次正式展開
  規劃。

完整的規格目標Flow：

```
Product Feature
  ↓
Contract
  ↓
Entry
  ↓
Adapter
  ↓
Execution Boundary
  ↓
Operational Boundary（本次任務新增定義）
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
  TASK1.92 Intelligence Product Adapter Architecture Foundation（規劃）
  TASK1.93 Product Intelligence Feature Flow Architecture Planning（規劃）
  TASK1.94 Product Intelligence Application Contract Foundation（規劃）
  TASK1.95 Product Intelligence Execution Boundary Foundation（規劃）
  TASK1.96 Product Intelligence Operational Boundary Architecture Planning（這裡，規劃）
```

驗證方式見`backups/phase5-task1.96-operational-boundary/
test_operational_boundary_architecture.mjs`。

---

## Operational Boundary

### Execution Boundary → Operational Boundary

Operational Boundary是規劃中Execution Boundary（TASK1.95已
規劃的執行時序管理）跟真正呼叫Feature之間，**額外**的一層
"觀察點"——它不改變執行流程本身（Execution Boundary依然負責
啟動/追蹤/攔截/回傳，見TASK1.95），Operational
Boundary只負責"在執行的關鍵時刻，記錄下可以被未來監控系統
使用的中繼資料"。

### Responsibility（職責）

- **標記觀察點**：在Execution Lifecycle的五個階段（TASK1.95：
  request received/validation completed/execution
  started/execution completed/execution
  failed）裡，規劃哪些階段**適合**被觀察、記錄什麼樣的資訊。
- **定義可觀察的Metadata**：規劃執行過程中，**哪些**中繼資料
  是安全可以被未來監控系統讀取的（見下方Operational
  Metadata），哪些不可以。
- **定義錯誤分類的可觀察性**：規劃Failure Recovery（TASK1.95
  五種失敗來源）裡，哪些失敗類型的資訊適合被未來監控系統聚合
  統計（見下方Error Observation）。

Operational Boundary**不負責**：實際的監控/日誌/告警實作（那是
"Future
Monitoring"方向，本次任務明確不實作）、資料轉換（Adapter
職責）、執行時序管理本身（Execution Boundary職責，TASK1.95）、
介面規範（Contract職責，TASK1.94）。

### Ownership（歸屬）

- Operational Boundary規劃上跟Execution Boundary一樣，是
  **Intelligence Adapter內部**的一段邏輯（延續TASK1.95已規劃
  的Ownership結論），不是獨立的檔案/模組/服務。
- Operational Boundary**唯一**關心的對象是Execution
  Boundary產生的執行時序資訊（TASK1.95的五個階段）跟Capability
  層的既有回傳形狀（`{ok, ...}`），**不**直接觀察Runtime
  Runner內部的任何細節——這條規則延續整個Phase 4/Phase 5系列
  "每一層只認識下一層"的既有分層原則。

### Isolation（隔離）

Operational Boundary的存在（或未來的實際落地）**不得**影響
Execution Boundary/Feature/Capability/Runtime既有的執行結果——
規劃上，任何觀察/記錄動作都應該是"旁路"（side-channel）性質，
不改變`requestIntelligence()`的回傳值、不新增額外的必要參數、
不因為觀察失敗而讓原本會成功的執行變成失敗。這是本次任務對
"可觀測性不能犧牲正確性"這條原則的明確承諾。

---

## Execution Observation

延續TASK1.95已規劃的Execution Lifecycle五階段，本次任務規劃
每個階段的觀察策略：

### Execution Tracking（執行追蹤）

規劃上，每次執行都可以被賦予一個**邏輯上的追蹤概念**（不要求
具體實作，例如未來可能是一個request ID）——這個概念在
`request received`階段"誕生"，在`execution
completed`/`execution failed`階段"終結"，中間`validation
completed`/`execution started`是這個追蹤概念經歷的中繼點。

### Lifecycle Visibility（生命週期可見性）

- `request received`：規劃上**可觀察**——記錄"有一次執行請求
  進來了"這件事本身是安全的，不涉及任何業務資料內容。
- `validation completed`：規劃上**可觀察**——記錄"驗證通過/
  失敗"這個布林結果是安全的。
- `execution started`：規劃上**可觀察**——記錄"開始呼叫
  Feature"這個時間點是安全的。
- `execution completed`：規劃上**可觀察**（欄位層級需謹慎，見
  Operational Metadata）——記錄"執行成功"跟一些**聚合性**
  資訊（例如`analysis.insights`陣列長度），但不記錄陣列**內容**
  本身。
- `execution failed`：規劃上**可觀察**——記錄失敗的`reason`
  字串跟`stage`（若有）是安全的，這些是Capability層既有的、
  穩定的錯誤分類字串（TASK1.86/1.93/1.94已確認過的既有
  reason清單）。

### Result Observation（結果觀察）

規劃上，"觀察執行結果"**不等於**"記錄執行結果的完整內容"——
延續上方Lifecycle Visibility的區分，觀察應該聚焦在**結構性
資訊**（成功與否、耗時、階段別）而不是**業務內容**（使用者的
Insight Context細節、Analysis/Recommendation的實際內容）。這是
本次任務對Metadata Strategy的核心原則，在下一章節具體展開。

---

## Operational Metadata

### Allowed Metadata（允許觀察的中繼資料）

規劃上，未來若要建立監控機制，**可以**安全記錄的中繼資料類別：

- **執行結果**：`ok`布林值（成功/失敗）。
- **錯誤分類**：`reason`/`stage`字串（既有的、有限集合的
  列舉值，不是任意文字）。
- **結構性計數**：`insights.length`/`recommendations.length`
  這類陣列長度（延續Analysis/Recommendation Runner既有的
  "事實計數，不是判斷"哲學，TASK1.44/1.87已確認過的設計原則）。
- **既有的`metadata.version`欄位**：Analysis/Recommendation/
  Decision Result既有的`metadata`裡的`version`欄位（純粹的
  格式版本標記）。

### Hidden Metadata（不允許觀察/記錄的中繼資料）

- **Insight Context的實際內容**——使用者的飲食/行為/情緒記錄
  細節，這些是敏感的個人資料，**絕對不得**出現在任何未來的
  監控/日誌系統裡（延續整個系列從未修改過的Auth/Session/
  Database邊界精神，本次任務把這條精神延伸到"可觀測性"領域）。
- **Analysis/Recommendation的實際insight/recommendation
  內容**——只記錄"有幾筆"是安全的，記錄"內容是什麼"可能間接
  洩漏使用者的個人資料。
- **`userId`等身份識別資訊**——這類資訊的觀察/記錄規劃上歸屬
  既有的Auth/Session/Middleware範疇（若有），不歸屬Intelligence
  Operational Boundary的規劃範圍，本文件不涉及。

### Compatibility Strategy（相容性策略）

- Allowed Metadata清單裡的每一項，都是**已經存在**於既有
  Capability/Feature回傳結果裡的資訊（`ok`、`reason`、
  `stage`、陣列長度可從既有陣列計算），Operational
  Boundary**不需要**新增任何欄位到既有的Request/Response
  Contract（TASK1.94）——這是刻意設計：可觀測性建立在既有
  資料之上，不改變既有Contract的形狀。
- 若未來要新增Allowed Metadata清單裡沒有的項目，規劃上應該
  先確認該項目不違反Hidden Metadata的原則，並更新本文件，而不
  是直接在監控程式碼裡讀取任意欄位。

---

## Error Observation

### Error Classification（錯誤分類，延續TASK1.94/1.95的既有分類）

延續TASK1.94 Error Contract四類型（Product/Adapter/
Intelligence/Runtime）跟TASK1.95 Failure Recovery五種來源
（Contract/Adapter/Feature/Capability/Runtime），本次任務規劃
這些分類**在可觀測性上的用途**：

- **Contract/Adapter Failure**：規劃上適合聚合統計"轉換失敗
  發生的頻率"，這類統計可以幫助未來判斷Adapter轉換邏輯是否有
  遺漏的邊界情況。
- **Feature/Capability
  Failure**：規劃上適合按`reason`字串分組統計（例如
  `analysis_capability_unavailable`發生的次數），幫助未來判斷
  是否有系統性的依賴注入問題。
- **Runtime Failure**：規劃上這是**優先級最高**的觀察對象——
  因為這代表Runner拋出了未預期例外，理論上不應該發生（Runner
  設計上是同步、deterministic、不拋例外的），如果真的觀察到
  這類失敗，代表既有假設被打破，需要立即關注。

### Observation Responsibility（觀察責任歸屬）

規劃上，錯誤觀察的責任歸屬**跟錯誤發生的層級一致**——
Operational Boundary本身不重新判斷"這是哪一種錯誤"（那是
Execution Boundary/Failure Recovery既有的分類邏輯，
TASK1.95），Operational
Boundary只是"在錯誤分類完成之後，決定要不要記錄、記錄什麼"。

### Future Monitoring Extension（未來監控擴充方向）

若未來要落地實際的監控機制（規劃層級，本次任務不實作）：

- 規劃上，比照Analysis/Recommendation Runner既有的
  `dependencies.modules`延伸點設計原則，Operational
  Boundary的觀察/記錄動作也應該是**選填的依賴注入**——不提供
  監控依賴時，執行行為完全不受影響（延續Backward
  Compatibility精神，TASK1.78/1.86已建立的模式）。
- 規劃上，記錄動作應該是**非阻塞**的（fire-and-forget或
  類似機制），不應該讓監控系統的延遲或故障，拖慢或中斷
  Intelligence Chain本身的執行——這是"可觀測性不能犧牲
  正確性"原則的延伸（不能犧牲效能/可用性）。

---

## Phase 5 Roadmap

### 已完成（TASK1.90~1.96累積規劃）

- Product Integration整體方向（TASK1.90）。
- Product Entry Boundary（TASK1.91）。
- Intelligence Adapter Boundary（TASK1.92）。
- 完整八層Feature Flow跟三種Lifecycle（TASK1.93）。
- Product Intelligence Contract跟版本策略（TASK1.94）。
- Execution Boundary、Execution Lifecycle五階段、Failure
  Recovery五分類（TASK1.95）。
- Operational Boundary、Execution Observation、Metadata
  Strategy、Error Observation（TASK1.96，這裡）。

### Current State（現況）

- Operational Boundary**完全不存在**於任何真實程式碼裡——
  `src/`底下沒有任何監控/日誌相關的實作。
- Execution Lifecycle的五個階段（TASK1.95）目前依然只是邏輯
  概念，沒有任何機制真的把它們變成可觀察的事件。

### Future Implementation Direction（未來落地方向）

1. 實際建立Product Entry/Intelligence Adapter（含Execution/
   Operational Boundary邏輯）/Contract定義的程式碼。
2. 若要落地監控，優先實作`execution failed`裡的Runtime
   Failure觀察（優先級最高，見上方Error Observation）。
3. 選擇一個輕量的記錄機制（規劃上不指定具體技術選型，本次
   任務不做技術選型決策），驗證"選填依賴注入"跟"非阻塞"這兩條
   設計原則是否可行。
4. 建立Allowed Metadata清單的實際schema（若需要），確保未來
   任何新增的監控欄位都經過Hidden Metadata原則的審查。

### Known Limitations

見下方獨立章節。

---

## Known Limitations

1. **本次任務完全沒有建立任何監控/日誌程式碼**——`src/`底下
   沒有新增任何對應Operational Boundary的實作檔案，這是純
   Architecture Planning。
2. **沒有變更任何既有production程式碼**——Phase 1~4建立的所有
   既有程式碼、TASK1.90~1.95規劃的文件，本次任務完全沒有
   修改。
3. **Allowed Metadata清單目前只是規劃層級的分類，沒有實際的
   schema或型別定義**——延續TASK1.94已記錄的"沒有建立任何
   型別定義檔案"限制。
4. **Execution Lifecycle五階段依然不是可觀察的真實事件**——
   延續TASK1.95已記錄的限制，本次任務規劃了"如果要觀察，該
   觀察什麼"，但沒有讓這些階段變成真正會發生的事件。
5. **沒有做任何監控技術選型**——本文件刻意不指定未來要用什麼
   技術（例如是否透過`src/intelligence/events/`既有的Event
   Dispatcher、或全新的機制），這是留給未來落地任務決定的
   範圍，本次任務只規劃"觀察什麼、不觀察什麼"這個內容層面的
   邊界。
6. **Contract結論延續**——延續`PHASE4_DECISION_CONTRACT_PLAN.md`
   （TASK1.84）的階段性結論，本次任務沒有改變它。
7. **async限制延續**——延續TASK1.75~1.95已記錄的Known
   Limitation：目前所有Capability都是同步函式，若未來監控機制
   需要非阻塞/非同步的記錄動作（例如"fire-and-forget"），這
   跟"目前一切都是同步"的既有事實之間如何協調，留給未來落地
   任務處理。

---

## Completion Criteria 確認

✅ Operational Boundary defined——Execution
Boundary→Operational Boundary的職責、歸屬、隔離原則已在
Operational Boundary章節明確記錄，並確認Operational
Boundary歸屬Adapter內部範疇、不改變執行結果。

✅ Execution observation defined——Execution
Tracking概念、五階段的Lifecycle
Visibility（哪些可觀察、觀察什麼）、Result Observation的
"結構性資訊 vs 業務內容"區分原則已記錄。

✅ Metadata strategy defined——Allowed
Metadata（ok/reason/stage/陣列長度/version）跟Hidden
Metadata（Insight Context內容/insight-recommendation實際
內容/userId）已明確列出，Compatibility Strategy確認不新增
任何Contract欄位。

✅ Error observation defined——五種失敗來源在可觀測性上的用途
已記錄，Runtime Failure被標記為優先級最高的觀察對象，Future
Monitoring Extension的兩條設計原則（選填依賴注入、非阻塞）已
記錄。

✅ AI Provider not enabled——本次規劃沒有呼叫任何AI SDK、沒有
建立Prompt Logic。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。

# Phase 5 Product Integration Implementation Preparation（TASK1.98）

## 目的

在TASK1.90~1.97完成的Phase 5架構規劃基礎上（含TASK1.97
Consolidation Review確認"架構規劃已完備"），規劃從**架構規劃**
過渡到**受控實作**的策略——本次任務**不是**實作Product
Integration程式碼、**不是**建立API路由、**不是**導入AI，是
Preparation/Validation任務，**不實作**任何實際的Entry/Adapter/
Execution/Operational Boundary程式碼。

跟TASK1.90~1.97的差異：前八份文件回答的是"架構應該長什麼樣子"；
本次任務回答的是"**如何**、以**什麼順序**、承擔**什麼風險**去
把這個架構變成真實程式碼"——這是Phase 5系列從規劃階段正式轉向
實作階段前的最後一份文件。

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
  TASK1.96 Product Intelligence Operational Boundary Architecture Planning（規劃）
  TASK1.97 Phase 5 Product Integration Architecture Consolidation Review（審查）
  TASK1.98 Phase 5 Product Integration Implementation Preparation（這裡，實作前準備）
```

驗證方式見`backups/phase5-task1.98-implementation-readiness/
test_implementation_readiness.mjs`。

---

## Current Architecture Snapshot

Phase 5目前由**八份文件**組成（TASK1.90~1.97），涵蓋完整九層
架構（Product Feature→Contract→Entry→Adapter→Execution
Boundary→Operational Boundary→Feature→Capability→Runtime），
其中：

- **Feature/Capability/Runtime三層**已在Phase 3/Phase 4**完全
  落地**（`intelligence_feature.js`、`capabilities/`整條Chain、
  `analysis_runner.js`/`recommendation_runner.js`），本次任務
  跟未來實作階段都**不修改**這三層。
- **Contract/Entry/Adapter/Execution Boundary/Operational
  Boundary五層**目前**只有文件**，`src/`底下沒有任何對應的
  實作檔案——這是本次任務規劃"如何落地"的主要對象。

---

## Implementation Boundary

### Which Boundaries Require Implementation（哪些邊界需要實作）

規劃上，五個規劃層級的邊界（Contract/Entry/Adapter/Execution
Boundary/Operational Boundary）**最終**都需要對應的實作程式碼
才能讓Product Feature真正消費Intelligence
能力——但本次任務**不建立**任何一個，只確認"未來需要"這件事跟
它們各自的優先順序（見下方Implementation Roadmap）。

### Which Boundaries Remain Documentation Only（哪些邊界維持只有文件）

- **Contract**（TASK1.94）：規劃上，Contract**可能永遠**不需要
  對應獨立的程式碼檔案（例如`.d.ts`）——它描述的介面規範，
  本質上已經由Feature Intelligence Integration/Capability
  Orchestrator既有的函式簽名跟輸入驗證邏輯**間接實現**
  了。是否要為Contract建立獨立的型別定義檔案，留給未來根據
  實際需求決定，本次任務不預先承諾一定需要。
- **Operational Boundary**（TASK1.96）：規劃上，這一層在
  "沒有真正的監控需求"之前，**同樣可能維持純文件狀態**——
  TASK1.96已經明確規劃"選填依賴注入、不提供時完全不影響
  執行"的設計，代表這一層的實作可以被無限期延後，不阻塞
  其他邊界的落地。

### Implementation Order（實作順序）

規劃上的建議順序（延續TASK1.90/1.93已建議的方向，本次任務把
它具體化到邊界層級）：

1. **Entry + Adapter**（TASK1.91/1.92）——這兩層是讓
   Product Feature真正能呼叫Intelligence Chain的**最小必要
   路徑**，沒有它們，Product Feature完全無法消費Capability
   Orchestrator/Feature Intelligence Integration提供的能力。
2. **Execution Boundary**（TASK1.95）——在Entry/Adapter落地
   之後，才有真實的"呼叫Feature"這件事可以管理時序跟失敗
   分類，這一層規劃上緊接在Entry/Adapter之後。
3. **Operational Boundary**（TASK1.96）——選填、可延後，只有
   在真的需要監控時才落地。
4. **Contract定義檔案**（TASK1.94，若需要）——視Entry/Adapter
   實際落地後，是否真的有必要用型別系統固化介面規範來決定。

### Code Boundary Planning（未來程式碼位置規劃）

規格要求審查"未來可能的程式碼位置"，本次任務**只審查、不建立**：

- **Product Entry**：規劃上歸屬既有的`src/routes/`或
  `src/controllers/`目錄（延續TASK1.91已確認的"跟既有routes/
  controllers架構位置一致"結論），**不需要**新建一個獨立的
  頂層目錄。
- **Adapter**：規劃上是`src/intelligence/`底下**新增**的一個
  獨立目錄（例如`src/intelligence/product/`或類似命名，本次
  任務不預先鎖定確切名稱），因為它是Intelligence
  Architecture跟Product Application之間的邊界，放在
  `src/intelligence/`底下比放在`src/routes/`底下更符合
  "這是Intelligence這一側的職責"這個既有分層原則。
- **Execution Boundary**：延續TASK1.95已規劃的Ownership
  結論（歸屬Adapter內部），規劃上**不需要**獨立的檔案，應該
  是Adapter模組內部的一個函式或一組函式，而不是一個新的
  目錄/服務。
- **Operational Boundary**：同上，延續TASK1.96已規劃的
  Ownership結論，規劃上**不需要**獨立的檔案，是Adapter內部的
  另一組函式。

### No Unnecessary Abstraction（不建立不必要的抽象）

規劃上明確要求：Execution
Boundary跟Operational Boundary**不應該**變成獨立的class/
interface/抽象層——它們是Adapter內部的邏輯步驟，用**簡單的
函式呼叫**表達即可（延續Phase 4整個系列"薄的邊界包裝、不含
業務邏輯"的既有慣例，見`analysis_capability.js`等既有
Capability的極簡實作風格）。這條原則本身也是"不建立不必要
抽象"的體現：如果未來實際落地時發現Adapter內部不需要真的
拆成"轉換/執行/觀察"三個明顯的函式（可能合併成一兩個），
規劃上也允許這樣做，本文件的分層只是**概念上**的邊界，不是
**強制的程式碼結構**要求。

---

## Migration Strategy

### Incremental Implementation Approach（漸進式實作方式）

規劃上，實作應該遵循以下漸進步驟（每一步都應該是獨立可驗證、
可回滾的）：

1. 先建立Entry/Adapter的**骨架**（函式簽名、輸入輸出形狀），
   內部邏輯先用最簡單的直接轉發（不做任何額外驗證/過濾），
   確認整條Chain可以從一個假想的Product Request走到
   Capability Orchestrator再走回來。
2. 再補上Request/Response Boundary規劃（TASK1.91/1.94）裡
   規劃的實際驗證/過濾邏輯（例如過濾Hidden
   Fields）。
3. 最後才考慮是否要接上真正的路由（本次任務跟這一步都不在
   規劃範圍內，需要另外的任務決定）。

### Compatibility Strategy（相容性策略）

- 每一步實作都**必須**保持Feature Intelligence
  Integration/Capability
  Orchestrator既有行為完全不變——延續TASK1.78/1.86已建立的
  Backward Compatibility保證，任何Entry/Adapter的實作**不得**
  要求修改這兩者的既有介面。
- 若未來要讓Adapter支援選填的`decisionCapability`（延續
  TASK1.79 Known Limitation裡提到"Feature Integration沒有
  注入decisionCapability"這件事），規劃上應該遵循TASK1.86
  已經驗證過的選填依賴注入模式，不需要重新設計一套新的
  相容性機制。

### Rollback Strategy（回滾策略）

- 若任何一步實作發生問題，規劃上**每一步都應該是獨立的git
  commit**，可以單獨revert而不影響其他已落地的部分（延續
  整個Phase 4/Phase 5系列一貫的commit粒度慣例）。
- 因為Entry/Adapter是**新增**的程式碼（不修改既有檔案），
  最壞情況下的回滾就是**刪除新增的檔案**，不需要處理任何
  既有程式碼的還原問題——這是"規劃先行、新增優先於修改"
  這個設計原則帶來的天然回滾優勢。
- Contract/Operational Boundary若最終決定不需要落地（見上方
  Which Boundaries Remain Documentation
  Only），"回滾"的意思就是"維持現狀、不做任何事"，成本為零。

---

## Risk Assessment

### Dependency Risks（依賴風險）

- **風險**：未來Entry/Adapter實作時，可能不小心引入對
  Runtime內部元件（`execution/`、`history/`等）的直接依賴，
  違反"每一層只認識下一層"的既有原則。
- **緩解**：延續Phase 4/Phase 5系列已經反覆用測試驗證過的
  依賴掃描模式（逐檔案掃描import語句），未來任何Entry/
  Adapter的測試套件都應該包含同款的依賴方向驗證。

### Integration Risks（整合風險）

- **風險**：Entry/Adapter一旦真的接上路由，可能在真實HTTP
  流量下發現TASK1.91~1.96規劃的Request/Response/Error
  Boundary有遺漏的邊界情況（例如某個既有reason字串沒有被
  規劃到）。
- **緩解**：延續Migration Strategy的漸進式方式，先驗證
  "假想Request走完整條Chain"，再逐步補上真實HTTP
  流量下才會出現的邊界情況，不要求一次到位。

### Backward Compatibility Risks（向後相容風險）

- **風險**：若未來Contract演進（TASK1.94 Version
  Strategy已規劃的情境）沒有嚴格遵守"只能新增選填欄位"的
  原則，可能意外破壞已經存在的Product Feature呼叫端。
- **緩解**：延續TASK1.94已規劃的Version
  Strategy，任何Contract變動都應該先對照"是否違反Backward
  Compatibility"這個判準，而不是憑感覺判斷是否安全。

### Risk總結

三類風險（Dependency/Integration/Backward
Compatibility）**都有對應的既有規劃或既有模式可以緩解**——
本次審查沒有發現任何一類風險是"完全沒有應對方案"的全新問題，
這也是TASK1.97 Consolidation Review得出"架構規劃已完備"結論的
延伸驗證。

---

## Implementation Roadmap

延續上方Implementation Order，具體化成未來任務的建議切分（本次
任務不承諾具體的TASK編號，只描述工作範圍）：

1. **Entry + Adapter骨架落地**——建立最小可運作的轉換層，
   驗證整條Chain可以被"假想的Product
   Request"觸發並正確回傳。
2. **Request/Response/Error Boundary實際邏輯落地**——把
   TASK1.91/1.92/1.94規劃的驗證/過濾/錯誤分類邏輯實作出來。
3. **Execution Boundary邏輯落地**——把TASK1.95規劃的Lifecycle
   時序管理跟Failure Recovery實作出來（規劃上可能跟第2步
   合併，取決於實際複雜度）。
4. **`src/bootstrap/application.js`接線**——新增對應欄位，把
   Feature Intelligence Integration組裝好依賴後掛上去（這一步
   會讓`app.intelligence`欄位數從24增加，需要對應更新既有
   驗證這個欄位數量的測試）。
5. **（選填）Operational Boundary落地**——只在真的有監控需求
   時才進行。
6. **（未來、另外規劃）真正接上路由**——這一步不在Phase 5
   目前規劃範圍內，需要獨立評估。

---

## Known Limitations

1. **本次任務完全沒有建立任何Entry/Adapter/Execution/
   Operational Boundary程式碼**——`src/`底下沒有新增任何
   對應的實作檔案，這是純Preparation/Validation。
2. **沒有變更任何既有production程式碼**——Phase 1~4建立的所有
   既有程式碼、TASK1.90~1.97規劃/審查的八份文件，本次任務
   完全沒有修改。
3. **Implementation Roadmap的六個步驟沒有對應具體的未來
   TASK編號**——這是刻意的，本次任務只規劃工作範圍跟順序，
   實際任務切分留給未來決定。
4. **Code Boundary Planning裡的目錄命名（例如`src/
   intelligence/product/`）只是範例，不是承諾**——本次任務
   明確標註"不預先鎖定確切名稱"，實際落地時的具體命名留給
   落地任務決定。
5. **Contract結論延續**——延續`PHASE4_DECISION_CONTRACT_PLAN.md`
   （TASK1.84）的階段性結論，本次任務沒有改變它。
6. **async限制延續**——延續TASK1.75~1.97已記錄的Known
   Limitation：目前所有Capability都是同步函式，Migration
   Strategy的漸進式步驟裡沒有特別處理這個限制，留給實際
   落地時處理。

---

## Completion Criteria 確認

✅ Implementation readiness defined——Which Boundaries
Require Implementation/Remain Documentation
Only、Implementation Order、Code Boundary
Planning（含No Unnecessary Abstraction原則）已在
Implementation Boundary章節明確記錄。

✅ Migration strategy defined——Incremental Implementation
Approach三步驟、Compatibility Strategy已在Migration
Strategy章節記錄。

✅ Rollback strategy defined——新增優先於修改的天然回滾優勢、
獨立commit粒度、Contract/Operational Boundary零成本回滾已在
Rollback Strategy章節記錄。

✅ Risk assessment completed——Dependency/Integration/
Backward Compatibility三類風險跟各自的緩解方案已在Risk
Assessment章節記錄，並確認都有既有規劃可以應對。

✅ AI Provider not enabled——本次規劃沒有呼叫任何AI SDK、沒有
建立Prompt Logic。

✅ Runtime Boundary preserved——Phase 2 Runtime本次完全沒有
被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。

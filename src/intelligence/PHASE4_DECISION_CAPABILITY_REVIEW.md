# Phase 4 Decision Capability Boundary Architecture Review（TASK1.82）

## 目的

本文件是**TASK1.82 Decision Capability Boundary Architecture
Review**的審查結論——本次任務**不是**建立Decision
Engine/Decision Algorithm/Decision Model、**不是**導入AI，目的是
在TASK1.81 Intelligence Decision Flow Architecture
Planning（`./PHASE4_DECISION_FLOW_PLAN.md`）已經定義的責任邊界
基礎上，更進一步評估：未來Decision Layer在Intelligence
Capability Architecture裡的**合法位置**——它應該長得像Capability
Orchestrator的延伸，還是像Analysis/Recommendation Capability
一樣獨立存在？

驗證方式見`backups/phase4-task1.82-decision-boundary-review/
test_decision_capability_review.mjs`——本次沒有新增/修改任何既有
production程式碼，測試內容以確認：(1) 既有Phase 4 Capability
Architecture（四層）維持不變且完整、(2) 本文件的架構評估跟既有
Capability設計慣例一致、(3) 本次審查沒有意外建立任何Decision
相關的production程式碼。

---

## Decision Boundary Analysis（Review Scope 1）

**問題**：`Recommendation Result → Decision Output`這一段責任，
是否需要獨立成一個Layer？

**分析**：

Recommendation Capability（TASK1.77）的職責已經在
`recommendation_capability_result_builder.js`跟
`recommendation_runner.js`的文件裡明確界定為「把Analysis Result
裡的欄位值轉成一筆一筆結構化的候選建議，每一筆都是平等並列的
候選項，不做任何選擇/排序」。這個職責邊界從TASK1.44
（Recommendation Framework Foundation）建立以來從未改變，也在
TASK1.80 Consolidation Review逐一驗證過。

「在多筆並列的候選項之間做出一個明確選擇」是一個**性質完全不同
的責任**——它需要额外的判斷準則（例如：依照什麼標準排序？選幾
個？），這件事Recommendation Capability目前完全沒有能力回答，也
不應該回答（會違反Recommendation Result「结构化資料、不做評分」
的既有規則，見`recommendation_capability_result_builder.js`的
JSDoc「no scoring」要求）。

**結論**：**是**，`Recommendation Result → Decision Output`需要
獨立成一個Layer。把「做選擇」的邏輯直接塞進Recommendation
Capability或Capability Orchestrator，會混淆現有「每一層只做一件
事」的既有慣例（Analysis只負責整理洞察、Recommendation只負責
列出候選項），也會讓未來要調整「選擇準則」時被迫牽動不相關的
既有程式碼。獨立成一個Layer可以維持Analysis/Recommendation兩層
「已經穩定、被充分測試」的既有邊界完全不受未來Decision邏輯演進
影響。

---

## Capability Design Options（Review Scope 2）

**問題**：Decision應該實作成：

- **選項A：Capability Orchestrator extension**——把Decision邏輯
  直接寫進`capability_orchestrator.js`內部（`requestCapabilityFlow()`
  在呼叫完Recommendation Capability之後，直接在Orchestrator裡面
  做選擇邏輯，不另外抽出檔案）。
- **選項B：Independent Decision Capability**——比照Analysis
  Capability（TASK1.76）/Recommendation Capability（TASK1.77）
  的既有模式，新增一個獨立的`capabilities/decision/`目錄
  （`decision_capability.js` + `decision_capability_result_
  builder.js` + `index.js` + `README.md`），Capability
  Orchestrator只**呼叫**它（跟現在呼叫Analysis/Recommendation
  Capability的方式完全一樣），不自己承載任何Decision邏輯。

**評估比較**：

| 面向 | 選項A（Orchestrator extension） | 選項B（Independent Capability） |
|---|---|---|
| 跟既有Analysis/Recommendation Capability的一致性 | 不一致——Orchestrator目前刻意保持「只協調、不承載業務邏輯」的薄邊界（見TASK1.78 `capability_orchestrator.js`的角色定義），選項A會打破這個既有慣例 | 一致——延續「每個Capability各自獨立、Orchestrator只負責串接」的既定模式 |
| 獨立測試能力 | 較差——Decision邏輯的測試會被迫跟Orchestrator的協調邏輯測試混在一起，無法像`analysis_capability.js`那樣單獨import出來測試 | 較好——可以比照TASK1.76/1.77各自獨立的測試套件模式，單獨驗證Decision邏輯，不依賴Orchestrator |
| 未來抽換/停用的彈性 | 較差——Decision邏輯寫死在Orchestrator內部，要停用或替換需要修改Orchestrator本體 | 較好——透過依賴注入（比照`analysisCapability`/
`recommendationCapability`的既有模式，未來會是`decisionCapability`），可以獨立替換而不動Orchestrator |
| 檔案/職責邊界的可讀性 | 較差——`capability_orchestrator.js`會同時承載「協調邏輯」跟「決策邏輯」兩種不同性質的程式碼 | 較好——一個檔案/目錄只對應一個職責，符合本系列從TASK1.60起一貫的「每一層只做一件事」設計哲學 |

**結論**：**建議選項B（Independent Decision
Capability）**——這跟Analysis Capability（TASK1.76）、
Recommendation Capability（TASK1.77）採用完全相同的架構模式，
维持Phase 4系列目前為止一致的設計語言。Capability
Orchestrator（TASK1.78）未來若要接上Decision，**擴充方式**會是
在`requestCapabilityFlow()`裡新增依賴注入的`decisionCapability`
參數，在Recommendation Capability成功後，比照現有「把
`analysisOutcome.result`包成`{analysisResult}`轉交給
Recommendation Capability」的既有寫法，新增一步「把
`recommendationOutcome.result`包成`{recommendationResult}`轉交給
Decision Capability」，並在Unified Capability Result裡追加
第三個`decision`欄位（`{analysis, recommendation, decision}`）。
這屬於**對Capability Orchestrator既有程式碼的擴充**（新增一段
呼叫邏輯），跟「選項A把Decision邏輯直接寫進Orchestrator」是完全
不同的兩件事——選項B底下，Orchestrator仍然只負責「呼叫」，不
負責「決策」。

**本次審查沒有實作上述任何一種選項**——這裡只記錄評估結論，
`capability_orchestrator.js`本身完全沒有被修改。

---

## Contract Consideration（Review Scope 3）

**問題**：未來Decision Layer是否需要`Decision Request
Contract`/`Decision Response Contract`？

**分析既有慣例**：目前Analysis Capability/Recommendation
Capability/Capability Orchestrator/Feature
Integration四層全部採用**內建的最小request驗證**（各自的
`validateXxxRequest()`函式，只檢查最外層形狀），完全沒有重用
TASK1.63建立的Contract Layer（`application/contracts/`）——這是
TASK1.63/1.76/1.77/1.78/1.79各自的README已經記錄過的既有決策：
「驗證Contract」目前只服務Phase 3既有的Workflow鏈路，Phase 4
Capability鏈路刻意各自維持獨立、輕量的驗證方式。

**結論**：**現階段不需要**新的Decision Request/Response
Contract——延續Phase 4既有Capability一致的做法，Decision
Capability（如果依照選項B實作）應該內建自己最小的request驗證
（檢查`recommendationResult`是否為物件），不需要新建一個獨立的
Contract檔案，也不需要重用Workflow用的Contract
Layer。**但是**，這不代表Contract**永遠**不需要——如果未來
Decision的輸入/輸出形狀變得更複雜（例如需要支援多種不同的
決策策略、需要驗證的欄位增加），到時候可以重新評估是否要為
Decision單獨建立Contract，跟Analysis/Recommendation/
Orchestrator比照，先以「內建驗證」為預設值，Contract留給明確
出現複雜度需求時再考慮。

---

## Output Evolution（Review Scope 4）

延續TASK1.81已記錄的演進方向，本次審查重新確認：

| | 目前（已完成，TASK1.43~1.81） | 未來（規劃中，未建立） |
|---|---|---|
| Analysis | ✅ 已存在（TASK1.43/1.76） | — |
| Recommendation | ✅ 已存在（TASK1.44/1.77） | — |
| Decision | ❌ 不存在 | 規劃中，本次審查評估其Capability位置（見上方Capability Design Options） |
| Action | ❌ 不存在 | 更下游的規劃方向，需要Decision先穩定才有討論基礎（延續TASK1.81的說明，本次不重複展開） |

---

## Data Flow

延續TASK1.81已記錄、本次審查再次確認相容的資料流（規劃中，未
建立）：

```
Feature
  ↓
Capability Orchestrator（TASK1.78，未來依選項B擴充，新增呼叫
  Decision Capability這一步，本身不承載Decision邏輯）
  ↓
Analysis Capability（TASK1.76，已存在，完全不修改）
  ↓
Recommendation Capability（TASK1.77，已存在，完全不修改）
  ↓
Decision Capability（規劃中，未建立，依選項B設計為獨立目錄）
  ↓
Output（Unified Capability Result，未來形狀擴充為
  {analysis, recommendation, decision}）
```

**本次審查確認**：這條資料流跟TASK1.81規劃的版本完全一致，唯一
新增的細節是明確選定了Decision的Capability實作方式（選項B），
資料流本身沒有任何改變。

---

## AI Extension Strategy（Review Scope 5）

延續TASK1.75/1.81已經確認的AI Extension Point設計原則，本次
針對Decision Layer再次確認：

**AI Decision Module合法位置**（規劃中，未建立）：比照
`analysis_runner.js`/`recommendation_runner.js`既有的
`dependencies.modules`延伸點，未來的**Decision
Runner**（Phase 2 Runtime層，規劃中，未建立）應該提供同樣語意
的`dependencies.modules`（或等義機制），讓AI增強的決策邏輯以
「其中一個可替換的決策模組」的身分注入，而不是讓Decision
Capability（選項B，Phase 4層）、Capability Orchestrator、或任何
Feature直接寫死AI呼叫邏輯。

**明確禁止（延續TASK1.75~1.81一致的邊界，本次審查重申）**：
`Feature → AI Provider`（Feature direct AI
usage）這條捷徑——不論現有的Insight/Behavior/Intelligence
Feature，或未來任何新增的Feature（包含使用Decision能力的
Feature），都不允許繞過Runtime層的modules延伸點，直接在Feature
層呼叫AI SDK。這條規則對Decision Capability（選項B）同樣適用：
即使未來Decision Runner支援AI modules，Decision
Capability/Capability Orchestrator/Feature都不應該知道「AI」是
什麼，只知道「呼叫Decision Runner，取得Decision Output」——跟
現有Analysis Capability/Recommendation
Capability對AI完全無感知的既有設計完全一致。

**本次審查沒有建立任何AI Decision Module或Decision
Runner**——這一節純粹是文件層級的方向確認。

---

## Known Limitations

1. **Decision Capability完全不存在**——本次審查明確禁止建立
   Decision Engine/Decision Algorithm/Decision Model，選項B只是
   **評估結論**，沒有對應的production程式碼落地。
2. **選項B的具體檔案結構尚未實作**——`capabilities/decision/`
   目錄、`decision_capability.js`、`decision_capability_result_
   builder.js`目前都不存在，實作時機留給未來任務決定。
3. **Capability Orchestrator的擴充尚未實作**——`capability_
   orchestrator.js`本身完全沒有被修改，「新增decisionCapability
   依賴注入參數」只是文件裡記錄的規劃方向。
4. **Decision Request/Response Contract的評估是階段性的**——
   本次結論是「現階段不需要」，但這個結論建立在Decision Layer
   還沒有實際實作、複雜度未知的前提下，未來若複雜度提高需要
   重新評估，不代表這個結論永久有效。
5. **async限制延續**——延續TASK1.75/1.81已記錄的Known
   Limitation：Analysis/Recommendation Runner目前都是同步函式，
   Decision Runner若比照設計，第一版也會是同步函式，若未來
   Decision AI modules需要非同步呼叫，會面臨跟Analysis/
   Recommendation modules同樣的async遷移問題。

---

## Completion Criteria 確認

✅ Decision Boundary明確——`Recommendation Result → Decision
Output`需要獨立成一個Layer的結論，以及建議採用選項B（Independent
Decision Capability）的理由，都已在本文件記錄。

✅ Capability Architecture保持——TASK1.76~1.81建立的四層Phase 4
Capability（Analysis/Recommendation Capability、Capability
Orchestrator、Feature Integration）加上TASK1.81的規劃文件，本次
審查確認完全沒有被修改。

✅ AI Provider未啟用——本次審查沒有呼叫任何AI SDK、沒有建立
Prompt Logic，`wrangler.toml`/`package.json`/`.env`皆無AI相關
新增。

✅ Runtime Boundary保持——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次完全沒有被修改。

✅ Application Pattern保持——Phase 3 Application
Pattern（Feature→Workflow→Capability→Use Case→Application
Service→Runtime）本次完全沒有被修改。

✅ 無Database改變——本次任務完全是文件跟測試，本地與遠端D1所有
domain table維持0筆。

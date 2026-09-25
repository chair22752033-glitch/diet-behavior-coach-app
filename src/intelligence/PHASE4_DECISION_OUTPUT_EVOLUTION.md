# Phase 4 Decision Capability Output Evolution Architecture（TASK1.87）

## 目的

在TASK1.86 Decision Capability Orchestration Integration（把
Independent Decision Capability以backward compatible方式接進
Capability Orchestrator）的基礎上，規劃Decision Output未來的演進
方向——本次任務**不是**建立Decision Logic、**不是**建立Decision
Algorithm、**不是**導入AI，純粹是Output Architecture Planning/
Schema Evolution Planning，記錄「目前的placeholder decision要如何
演進成structured decision output」這條路徑上的邊界跟設計原則，
**不實作**任何一步。

延續系列已完成的規劃/落地順序：

```
TASK1.75 Phase 4 Capability Architecture Planning（規劃）
TASK1.76 Analysis Capability（落地）
TASK1.77 Recommendation Capability（落地）
TASK1.78 Capability Orchestration（落地）
TASK1.79 Feature Integration（落地）
TASK1.80 Phase 4 Capability Architecture Consolidation Review（審查）
TASK1.81 Intelligence Decision Flow Architecture Planning（規劃）
TASK1.82 Decision Capability Boundary Architecture Review（審查）
TASK1.83 Decision Capability Foundation（落地）
TASK1.84 Decision Capability Contract & Output Architecture Planning（規劃）
TASK1.85 Decision Capability Integration Architecture（規劃）
TASK1.86 Decision Capability Orchestration Integration（落地）
TASK1.87 Decision Output Evolution Architecture（這裡，規劃）
```

驗證方式見`backups/phase4-task1.87-decision-output/
test_decision_output_evolution.mjs`。

---

## Current Output Model

目前（TASK1.83建立、TASK1.86整合進Orchestrator後依然完全沒有被
修改）`decision_result_builder.js`的`buildDecisionOutputPlaceholder()`
產生的Decision Output佔位形狀：

```js
{
  status: 'decision_not_available',
  decision: null,
  metadata: {
    version: '1.0.0',              // DECISION_OUTPUT_VERSION
    recommendationCount: number,   // 原樣讀取recommendations陣列長度，事實計數，不是判斷
  },
}
```

三個頂層欄位比照Analysis Result（TASK1.43）/Recommendation
Result（TASK1.44）已經確立的`{status, <主要資料欄位>, metadata}`
慣例——這裡的「主要資料欄位」叫`decision`，目前固定為`null`。這個
形狀從TASK1.83建立以來，經過TASK1.84 Contract Planning、TASK1.85
Integration Architecture、TASK1.86 Orchestration Integration三個
任務，**逐字沒有變動過**——本次任務首先確認這件事仍然成立，作為
規劃「未來要怎麼演進」的起點。

透過Capability Orchestrator（TASK1.86）整合後，這個形狀原樣出現在
Unified Capability Result的`result.decision`欄位裡，沒有被
Orchestrator拆開、改寫、或加上任何額外欄位。

---

## Future Evolution

規劃placeholder decision → structured decision output的演進路徑，
分成三個部分：

### decision payload

目前`decision`欄位固定為`null`。未來當真正的Decision Runner/
Decision Algorithm建立時（**本次任務明確不建立**），`decision`
欄位預計會從`null`演進成一個結構化物件，暫定形狀比照
Analysis/Recommendation的「陣列形態」慣例：

```
decision: {
  selected: [ { type, value, source, ... }, ... ],  // 從Recommendation候選項裡「做出選擇」後的結果（規劃中，尚未建立）
  rejected: [ { type, reason, ... }, ... ],          // 選填，未來可能記錄「為什麼沒被選中」
}
```

**這裡只是列出可能的形狀方向，不是承諾的最終設計**——真正的欄位
名稱、資料結構，取決於未來Decision Algorithm任務實際需要什麼資料
來支撐它的邏輯，本次任務不預先鎖定。

### metadata

`metadata`欄位延續既有`{version, recommendationCount}`，未來可能
擴充但**不變更既有欄位的語意**（`version`永遠是純粹的資料格式版本
標記，`recommendationCount`永遠是事實計數）。詳見下方「Metadata
Strategy」。

### extension fields

規劃預留一個選填的`extensions`或類似命名的欄位，作為「未來
Decision Capability需要但目前規格書沒有明確定義」的擴充口——比照
Analysis/Recommendation Result目前**沒有**這種欄位的事實（兩者都
是封閉的三欄位形狀），Decision Output是否需要這個擴充口，留給
未來實際需求決定，**本次任務不建立這個欄位**，只是記錄這是一個
合理的演進方向。

**Backward Compatibility保證**：無論`decision`欄位未來如何從
`null`演進成結構化物件，`{status, decision, metadata}`這三個
頂層key的存在**不會改變**——現有讀取`result.decision.status`/
`result.decision.metadata`的呼叫端程式碼（例如TASK1.86的Unified
Capability Result整合邏輯）在演進後依然能正確運作，因為頂層形狀
不變、只有`decision`欄位「裡面」的內容從`null`變成物件。

---

## Metadata Strategy

`metadata`欄位未來可能包含的資訊類別（**規劃層級，不實作**）：

- **version**：既有欄位，純粹的Decision Output格式版本號
  （`DECISION_OUTPUT_VERSION`），跟AI model版本完全無關，未來
  Schema變動時遞增。
- **source**：規劃新增，記錄這個Decision Output是由哪一種
  Decision模組產生的（例如`'placeholder'`、未來可能的
  `'rule_based'`、`'ai_assisted'`等字串標籤）——**這個欄位本身
  只是一個字串標籤，不是判斷邏輯**，用途是讓呼叫端/除錯時知道
  資料來源，不影響資料內容本身。
- **execution information**：規劃新增，記錄執行層面的事實資訊
  （例如處理的recommendation數量、是否有欄位被略過等**純粹的
  執行事實**），跟`recommendationCount`同一種「只記錄發生了
  什麼，不判斷好壞」的哲學。

**明確禁止**：`metadata`欄位任何時候都**不得**加入實際決策邏輯——
不得包含分數（score）、權重（weight）、閾值（threshold）、排序
結果、或任何形式的「這個推薦比那個推薦更好」的判斷內容。`metadata`
的角色永遠是「描述這筆Decision Output本身的中繼資訊」，不是
「決策內容」本身——決策內容只存在於`decision`欄位裡（未來），且
`decision`欄位本身的產生也**不在本次任務規劃的實作範圍內**。

---

## Extension Boundary

Decision Capability未來演進時，維持TASK1.75/1.81/1.82/1.84/1.85/
1.86已經確立的邊界，不因為Output Schema演進而放寬：

- 不得直接操作**database**（不import`src/db/`）。
- 不得直接操作**auth**（不import`src/auth/`、`src/oauth/`、
  `src/identity/`、`src/middleware/`）。
- 不得直接操作**session**。
- 不得繞過Capability邊界直接呼叫Analysis Runner/Recommendation
  Runner（維持`recommendationResult`作為唯一輸入的既有邊界）。
- 未來即使`decision`欄位演進出更複雜的結構，Decision Capability
  依然只能透過`{recommendationResult}`這一個輸入形狀取得資料，
  不得新增直接讀取Database/Auth/Runtime Internal Component的
  依賴。

---

## AI Integration Strategy

延續TASK1.75/1.81/1.82/1.84/1.85/1.86已經確認的AI Extension
Point設計原則，本次針對Output Evolution情境重新確認一次：

未來AI Decision Module合法接入位置，比照Analysis Runner/
Recommendation Runner既有的`dependencies.modules`延伸點——AI
邏輯只應該出現在Decision Runner（規劃中，尚未建立）內部的某個
module裡，產生的結果透過`decision_result_builder.js`同一套
Result Builder包裝成`{status, decision, metadata}`形狀（未來
`decision`欄位內容演進後的形狀）。

**Feature direct AI usage**（`Feature → AI Provider`）這條捷徑在
Output Schema演進後**依然完全禁止**——Feature、Capability
Orchestrator都只認識`decisionCapability.requestDecision()`這一個
介面，即使未來`decision`欄位是由AI產生的內容，呼叫鏈的每一層都
不需要、也不應該知道AI是什麼。`metadata.source`欄位（規劃中）
即使標記為`'ai_assisted'`，也只是一個描述性字串，不代表呼叫端
需要對AI有任何額外認知或特殊處理。

---

## Known Limitations

1. **本次任務完全沒有建立Decision Runner/Decision
   Algorithm**——`decision`欄位在真正的邏輯建立之前，永遠是
   `null`，Output Evolution只是規劃「未來可能長什麼樣子」，不是
   實作。
2. **沒有變更任何production程式碼**——`decision_capability.js`/
   `decision_result_builder.js`/`capability_orchestrator.js`/
   `capability_result_builder.js`本次任務完全沒有被修改，Output
   Evolution規劃出的欄位形狀（`selected`/`rejected`/`source`/
   `extensions`等）目前**完全不存在**於任何真實程式碼裡，純粹是
   文件記錄的未來方向。
3. **Contract結論延續**——延續`PHASE4_DECISION_CONTRACT_PLAN.md`
   （TASK1.84）「目前不需要建立Decision Request/Response
   Contract」的階段性結論，Output Schema即使未來演進，也不改變
   這個結論——除非複雜度明顯增加到需要重新評估。
4. **async限制延續**——延續TASK1.75/1.81/1.82/1.84/1.85/1.86已
   記錄的Known Limitation：目前所有Capability都是同步函式，
   Output Evolution規劃本身不涉及是否要改成async，這是完全獨立
   的議題，留給未來任務決定。
5. **沒有接進bootstrap/Feature Integration**——延續TASK1.86的
   Known Limitation，Capability Orchestrator依然沒有被wire進
   `src/bootstrap/application.js`，Feature Integration也依然沒有
   注入`decisionCapability`，Output Evolution規劃不改變這個現狀。

---

## Completion Criteria 確認

✅ Decision Output Evolution Boundary明確——文件清楚記錄了
placeholder decision → structured decision output的演進方向、
metadata可以/不可以包含什麼、AI合法接入位置，同時明確禁止本次
任務建立任何實際邏輯。

✅ Backward Compatibility保持——文件明確記錄`{status, decision,
metadata}`三個頂層key的存在不會因為未來演進而改變，現有呼叫端
程式碼的讀取方式不受影響。

✅ Decision Capability Boundary保持——文件重申Decision Capability
不得直接操作database/auth/session/runtime internal component，
未來Output Schema演進不放寬這個邊界。

✅ AI Provider未啟用——本次規劃沒有呼叫任何AI SDK、沒有建立
Prompt Logic，只是討論「未來AI可以在哪裡合法出現」。

✅ Runtime Boundary保持——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator/Decision Capability本身/
Capability Orchestrator本次任務完全沒有被修改。

✅ Application Pattern保持——Phase 3 Application
Pattern（Feature→Workflow→Capability→Use Case→Application
Service→Runtime）本次完全沒有被修改。

✅ 無Database改變——本地與遠端D1所有domain table維持0筆。

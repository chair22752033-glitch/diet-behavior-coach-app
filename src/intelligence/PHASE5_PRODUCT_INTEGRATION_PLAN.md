# Phase 5 Product Integration Architecture Planning（TASK1.90）

## 目的

開啟Phase 5，規劃Intelligence Capability Architecture（Phase 4）
如何跟真正的Product Application Layer整合——本次任務**不是**
導入AI、**不是**實作Decision Logic，是一份純Architecture
Planning任務，定義從Intelligence Architecture過渡到Product
Integration的方向，**不實作**任何實際整合。

延續TASK1.89 Phase 4 Final Validation & Phase 5 Transition
Planning記錄的"Product Integration"方向（四個候選方向之一，
本次驗證建議的優先順序第一項），這是Phase 5系列的第一個任務。

完整的規劃/落地/審查任務序列（跨Phase）：

```
Phase 1 Foundation（TASK1.1~1.39）
Phase 2 Intelligence Runtime Foundation（TASK1.40~1.58）
Phase 3 Intelligence Application Layer（TASK1.59~1.74）
Phase 4 Intelligence Capability Architecture（TASK1.75~1.89）
Phase 5 Product Integration（TASK1.90開始，這裡）
```

驗證方式見`backups/phase5-task1.90-product-integration/
test_phase5_product_integration_plan.mjs`。

---

## Product Integration Goal

目前Phase 4建立的Capability Chain（Analysis→Recommendation→
Decision→Unified Capability Result）跟Feature Intelligence
Integration（TASK1.79）都是**已建立但未接線**的狀態——它們可以被
獨立測試、獨立執行，但完全沒有被`src/bootstrap/application.js`
的`intelligence`物件使用，也沒有任何真實User-facing路由呼叫它們。

Phase 5 Product Integration的目標，是規劃（而非實作）如何讓這條
Capability Chain真正被Product使用——也就是讓某個真實的
Feature（例如既有的Insight/Behavior，或未來新Feature）可以選擇性
消費Capability Orchestrator/Feature Intelligence Integration
提供的能力，而不需要重新設計既有的Application Pattern
（Feature→Workflow→Capability→Use Case→Application
Service→Runtime，TASK1.60~1.74建立）。

**本次任務的產出是規劃文件，不是程式碼變更**——`app.intelligence`
物件本次任務結束後依然維持24個欄位不變，這是刻意的邊界。

---

## Architecture Boundary

### 四層責任邊界（規格原文的Boundary圖）

```
User Application
  ↓
Intelligence Feature
  ↓
Capability Layer
  ↓
Runtime
```

各層責任確認：

- **User Application**：HTTP路由層（`src/routes/`、
  `src/controllers/`）跟前端UI（`worker.js`的`getHTML()`）——這一層
  完全不認識Capability是什麼，只呼叫Feature層的公開介面
  （例如`insightFeature.requestInsight()`）。Phase 5規劃**不**
  修改這一層。
- **Intelligence Feature**：Phase 3 Application
  Pattern底下的Feature（`insightFeature`/`behaviorFeature`，
  TASK1.66/1.72）跟Phase 4的Feature Intelligence
  Integration（TASK1.79 `intelligence_feature.js`）——這一層
  是User Application跟底層能力之間的**唯一**合法進入點，負責
  把HTTP層的request轉成內部使用的Context形狀，呼叫下一層，
  再把結果轉成回傳給User Application的形狀。
- **Capability Layer**：Phase 4整條Capability
  Chain（Analysis/Recommendation/Decision/Orchestrator，
  TASK1.76~1.86）——這一層是Runtime跟Feature之間的邊界包裝，
  不含業務邏輯，只做依賴注入串接跟Result組裝。
- **Runtime**：Phase 2建立的Runner/Runtime
  Orchestrator（`analysis_runner.js`/`recommendation_runner.js`/
  `src/intelligence/orchestration/`）——實際執行分析/推薦邏輯的
  地方，Phase 4/Phase 5規劃皆不修改這一層。

### 現況 vs 規劃中的差異

**現況**（TASK1.79建立、TASK1.89確認的狀態）：Feature
Intelligence Integration存在，但**沒有**任何User
Application層的路由呼叫它，也**沒有**接進
`app.intelligence`物件。

**規劃中**（本次任務規劃、不實作）：Product Integration完成後，
`app.intelligence`物件會新增一個欄位（暫定命名待實際落地任務決定，
例如`intelligenceCapabilityFeature`），指向一個真正被
`createApplication()`組裝好依賴的Feature Intelligence
Integration實例（`analysisCapability`/`recommendationCapability`
皆已注入真實Runner），讓某個路由（或既有Insight/Behavior路由的
選填參數）可以呼叫它。

---

## Feature Flow

未來Product Feature如何消費三種既有能力的規劃：

### Insight（既有，TASK1.66）

`insightFeature.requestInsight()`已經是完整落地的Feature，走
Phase 3既有的Application Pattern（Feature→Workflow→UseCase→
ApplicationService→Runtime）。Product Integration**不改變**這條
既有路徑——這是本次規劃明確排除的範圍，Insight依然透過
`insightService`/`insightExecutionFlow`運作。

### Behavior（既有，TASK1.72）

`behaviorFeature.requestBehavior()`同樣是完整落地的Feature，跟
Insight並列的第二條Application Pattern路徑。Product
Integration同樣**不改變**這條路徑。

### Intelligence Capability（TASK1.76~1.89，規劃中要接線）

`app.intelligence.capabilities`（Phase 4整條Capability Chain）
跟`app.intelligence.features.intelligence`（Feature Intelligence
Integration，TASK1.79）目前**已存在但未接線**。規劃中的Feature
Flow：

```
未來Route（規劃中，本次不建立）
  ↓
app.intelligence.features.intelligence.requestIntelligence({context})
  ↓（內部）Capability Orchestrator.requestCapabilityFlow()
  ↓（內部）Analysis Capability → Recommendation Capability →（選填）Decision Capability
  ↓
{ok, feature:'intelligence', data:{analysis, recommendation, decision?}}
```

這條Flow刻意跟Insight/Behavior的Flow**平行存在、互不依賴**——
Product Integration規劃的落地方式，是新增一個獨立的路由/Feature
進入點來呼叫`intelligence`這個Feature，而不是修改
Insight/Behavior既有的Workflow/UseCase/ApplicationService，避免
任何對既有功能的回歸風險。

---

## API Strategy

### Request Boundary

未來若要新增路由呼叫Feature Intelligence
Integration，Request的形狀規劃比照Insight/Behavior既有路由的
既有慣例（HTTP method、path、request body結構），Feature層負責把
HTTP request轉換成`{context, options?}`這個Capability Orchestrator
既有要求的形狀——這個轉換邏輯目前完全不存在，是Product
Integration落地時才需要新增的部分，本次任務只確認轉換的**方向**
（HTTP request → Insight Context → Capability request），不
設計實際的轉換程式碼。

### Response Boundary

Feature層回傳給User Application的形狀，規劃沿用Feature
Intelligence Integration既有的
`{ok, feature:'intelligence', data:{analysis, recommendation,
decision?}}`形狀（TASK1.79建立），Response Boundary不需要額外
轉換——這是Phase 4刻意設計Feature層輸出跟Capability Orchestrator
輸出「形狀接近」的好處，Product Integration只需要在最外層加一層
HTTP Response包裝（例如加上HTTP status code），不需要重新設計
data結構本身。

### Error Boundary

Capability Orchestrator/Feature Intelligence Integration失敗時
回傳`{ok:false, reason, field?, stage?}`（TASK1.78/1.86建立），
Product Integration規劃**不修改**這個既有的失敗形狀，而是在
User Application層新增一層「失敗reason → HTTP status
code」的對照（例如`invalid_context`→400、
`analysis_capability_unavailable`→503），這個對照表目前不存在，
規劃是未來落地任務要新增的部分，本次不設計實際對照規則。

---

## Phase 5 Roadmap

延續TASK1.89 Phase 5 Direction的四個候選方向，本次任務把
"Product Integration"這一項展開成更具體的路徑規劃（依然是規劃，
不實作）：

1. **Product Integration**（本次任務規劃的主題）：讓Capability
   Chain真正被至少一個真實路由使用，驗證整條Chain在真實HTTP
   請求下可以正確運作。規劃路徑：先新增一個獨立的
   read-only路由（不影響任何既有寫入行為），呼叫Feature
   Intelligence Integration，驗證Request/Response/Error
   Boundary規劃的可行性，再視結果決定是否要更深度整合進
   Insight/Behavior既有路徑。
2. **Operational Readiness**：延續TASK1.89已規劃的方向——降級
   行為、逾時控制、可觀測性，這些機制應該在Product
   Integration實際上線**之前**規劃到位，避免真實流量進來後才
   發現沒有監控/告警。
3. **Intelligence Enhancement**：延續TASK1.89已規劃的方向——在
   Product Integration完成、有真實使用資料之後，才是評估
   Analysis/Recommendation modules是否需要擴充、或是否需要
   建立規則式Decision Runner的合理時機。
4. **Future AI Capability**：延續TASK1.89 AI Integration
   Timing的判斷——AI導入的四個前提條件（規則式Decision
   Runner存在、Contract結論重新評估、Operational Readiness
   到位、Product Integration完成）中，"Product
   Integration完成"是本次任務規劃的項目，其餘三項依然是未來
   任務的範圍。

**建議順序**：Product Integration（本次規劃的路徑）→
Operational Readiness → Intelligence Enhancement → Future AI
Capability。這個順序延續TASK1.89已經給出的建議，本次任務沒有
改變它，只是把第一項（Product Integration）具體化成可執行的
規劃路徑。

---

## Known Limitations

1. **本次任務完全沒有實作任何路由/Feature接線**——`app.
   intelligence`物件本次任務結束後依然維持24個欄位不變，任何
   新路由、任何HTTP request/response轉換程式碼都**不存在**於
   `src/`底下。
2. **沒有變更任何既有production程式碼**——本次任務是純
   Architecture Planning，Phase 1~4建立的所有既有程式碼
   （Insight/Behavior Feature、Capability Chain、Runtime
   Runner）本次任務完全沒有被修改。
3. **Request/Response轉換邏輯未設計**——本文件只確認轉換的
   方向（HTTP request → Insight Context → Capability
   request），實際的欄位對照、驗證規則、錯誤訊息文字，留給
   未來落地任務決定。
4. **Error Boundary的HTTP status code對照表未建立**——本文件
   只確認需要有這樣一張對照表，實際的reason字串到status
   code的完整對照，留給未來落地任務決定。
5. **Decision Output依然是佔位形狀**——延續TASK1.83/1.87/1.88/
   1.89已記錄的Known Limitation，`decision`欄位在真正的
   Decision Runner建立之前，永遠是`null`，Product Integration
   規劃不改變這件事。
6. **Contract結論延續**——延續`PHASE4_DECISION_CONTRACT_PLAN.md`
   （TASK1.84）的階段性結論，本次任務沒有改變它。
7. **async限制延續**——延續TASK1.75~1.89已記錄的Known
   Limitation：目前所有Capability都是同步函式，未來若要接進
   真實HTTP路由（`src/routes/`既有路由多半是async），這個
   同步/非同步的介面轉換是Product Integration落地時需要處理的
   細節，本次規劃只是點出這個既知限制。

---

## Completion Criteria 確認

✅ Phase 5 Product Integration direction defined——Product
Integration的目標、路徑、跟其他三個Phase 5方向的關係，本文件已
明確記錄。

✅ Intelligence Application boundary defined——User
Application→Intelligence Feature→Capability Layer→Runtime四層
責任邊界已逐一確認並記錄。

✅ Feature consumption path defined——Insight/Behavior（既有，
不變）跟Intelligence Capability（規劃中的接線路徑）三種能力的
消費方式已記錄。

✅ AI Provider not enabled——本次規劃沒有呼叫任何AI SDK、沒有
建立Prompt Logic。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain（Analysis/Recommendation/Orchestrator/Decision/Feature
Integration）本次完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。

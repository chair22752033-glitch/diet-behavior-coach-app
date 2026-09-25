# Phase 5 Intelligence Product Entry Boundary Foundation（TASK1.91）

## 目的

在TASK1.90 Phase 5 Product Integration Architecture
Planning基礎上，進一步定義從Product Application進入Intelligence
Feature的**穩定進入邊界（Product Entry Boundary）**——本次任務
**不是**導入AI、**不是**修改既有Product路由，是一份Architecture
Foundation任務，具體化TASK1.90記錄的Request/Response/Error
Boundary規劃方向，**不實作**任何實際的路由/Feature接線程式碼。

跟TASK1.90的差異：TASK1.90規劃的是四層責任邊界（User
Application→Intelligence Feature→Capability Layer→Runtime）的
**整體方向**；本次任務聚焦在User Application跟Intelligence
Feature之間**這一段邊界本身**，把"Product Intelligence
Entry"這個概念獨立出來，定義它接受什麼輸入、暴露什麼輸出、如何
分類錯誤——這是TASK1.90 Known Limitations裡明確列出「留給未來
落地任務決定」的部分，本次任務把它具體化成規劃文件（依然不是
程式碼）。

完整的規劃/落地/審查任務序列（跨Phase）：

```
Phase 1 Foundation（TASK1.1~1.39）
Phase 2 Intelligence Runtime Foundation（TASK1.40~1.58）
Phase 3 Intelligence Application Layer（TASK1.59~1.74）
Phase 4 Intelligence Capability Architecture（TASK1.75~1.89）
Phase 5 Product Integration
  TASK1.90 Product Integration Architecture Planning（規劃）
  TASK1.91 Intelligence Product Entry Boundary Foundation（這裡，規劃）
```

驗證方式見`backups/phase5-task1.91-product-entry/
test_product_entry_boundary.mjs`。

---

## Entry Architecture

### 完整Product Entry Flow（規格原文）

```
User Application
  ↓
Product Intelligence Entry（規劃中，本次任務定義概念，不建立程式碼）
  ↓
Feature（Feature Intelligence Integration，TASK1.79，已存在）
  ↓
Capability（Phase 4 Capability Chain，TASK1.76~1.86，已存在）
  ↓
Runtime（Analysis/Recommendation Runner，Phase 2，已存在）
```

### "Product Intelligence Entry"是什麼

這是TASK1.90 Architecture Boundary裡"User
Application"跟"Intelligence Feature"之間**新增的一層概念**——
不是新的程式碼目錄，而是一個**職責邊界的規劃名稱**，指的是
"某個未來會存在的路由/controller入口，把HTTP request轉換成
Feature Intelligence Integration要求的`{context, options?}`
形狀，並把Feature回傳的`{ok, feature, data}`或`{ok:false,
reason}`轉換成HTTP Response"。

這一層職責跟既有的`src/routes/`、`src/controllers/`同樣的架構
位置一致——本次規劃**沒有**創造新的架構層級，只是明確點名："如果
Product Integration要落地，這個轉換邏輯應該放在哪裡、遵守什麼
規則"，避免未來落地任務隨意把HTTP轉換邏輯寫進Feature層或
Capability層（違反既有的"No HTTP"邊界規則，見
`capabilities/orchestration/README.md`等既有文件）。

### 各層責任重新確認（延續TASK1.90，本次聚焦Entry這一段）

- **User Application**：真實的HTTP Request，包含method、
  path、headers、body。這一層完全不認識Insight Context/Capability
  Request形狀。
- **Product Intelligence Entry**（規劃中）：**唯一**允許把HTTP
  Request轉換成`{context, options?}`形狀的地方。這一層知道HTTP
  是什麼，但**不**知道Analysis/Recommendation/Decision Capability
  內部如何運作，只認識Feature層的公開介面
  （`requestIntelligence()`）。
- **Feature**：Feature Intelligence Integration
  （`intelligence_feature.js`，TASK1.79）——已存在，本次任務
  完全不修改。
- **Capability**：Phase 4整條Capability Chain——已存在，本次
  任務完全不修改。
- **Runtime**：Analysis/Recommendation Runner——已存在，本次
  任務完全不修改。

---

## Request Boundary

### Accepted Input Shape

Product Intelligence Entry（規劃中）接受的輸入，規劃上**必須**
恰好轉換成Feature Intelligence Integration既有要求的形狀：

```js
{
  context: { /* Insight Context，見TASK1.42既有定義 */ },
  options: { /* 選填 */ }
}
```

Product Intelligence Entry**不得**自行定義一套新的Request
形狀跳過這個既有形狀——這是延續Phase 4"Feature/Capability
Request形狀互相咬合，無需額外轉接層"設計原則的自然延伸。

### Validation Responsibility（驗證責任歸屬）

驗證責任按照既有的分層原則分散：

- **Product Intelligence Entry**：只驗證HTTP層級的形狀
  （method是否正確、body是否為合法JSON、必要欄位是否存在）——
  這一層的驗證**不**重複Feature/Capability層已經做的驗證。
- **Feature Intelligence Integration**：驗證`{context,
  options?}`是否為合法物件（既有的
  `validateCapabilityOrchestratorRequest()`同款驗證邏輯）。
- **Analysis Capability**（透過Capability Orchestrator間接
  觸發）：驗證`context`欄位本身是否為合法的Insight
  Context——這是Analysis Runner既有職責，Product Intelligence
  Entry**不得**越權重新實作這一段驗證。

### Ownership Boundary（歸屬邊界）

- HTTP相關的一切（Request Header、Cookie、Session、Auth
  Token）的解析歸屬於既有的`src/middleware/`/`src/auth/`/
  `src/oauth/`，Product Intelligence Entry**不得**自行解析這些
  內容——如果需要User身份資訊，應該透過既有中介層已經處理好、
  傳遞下來的乾淨資料（例如`userId`），不直接碰觸Cookie/Session
  物件本身。
- Insight Context的建構（把User的原始資料組成Insight
  Context形狀）歸屬於既有的Context
  Builder（`src/intelligence/context/`，TASK1.42），Product
  Intelligence Entry**不得**重新實作這段邏輯，應該重用既有
  Builder。

---

## Response Boundary

### Output Shape

規劃上，Product Intelligence Entry回傳給User Application的
Response，直接沿用Feature Intelligence Integration既有的成功/
失敗形狀，只在最外層加HTTP包裝：

```js
// 成功
HTTP 200 {
  ok: true,
  feature: 'intelligence',
  data: { analysis, recommendation, decision? }
}

// 失敗
HTTP <對應status code> {
  ok: false,
  reason: string,
  field?: string,
  stage?: string
}
```

### Exposed Fields（對外暴露的欄位）

- `analysis`：原樣暴露（Analysis Capability回傳的`result`）。
- `recommendation`：原樣暴露（Recommendation Capability回傳的
  `result`）。
- `decision`：**選填**暴露——只有在Product Intelligence
  Entry決定注入`decisionCapability`時才會出現，目前規劃階段
  尚未決定是否要注入（見Known Limitations）。

### Hidden Internal Fields（不應該暴露的內部欄位）

- Capability Orchestrator內部使用的`capability:'orchestration'`
  欄位——這是內部除錯用的標籤，規劃上**不應該**原樣暴露給
  Product Application層，應該在Product Intelligence Entry這一層
  被過濾掉或替換成Product層自己的錯誤分類（見Error Boundary）。
- Decision Capability佔位形狀裡的`status:
  'decision_not_available'`——這個字串是Capability層內部溝通用
  的狀態標記，規劃上**不建議**原樣暴露給前端UI，避免前端需要
  處理一個「未來會變動」的內部狀態字串。這是規劃層級的建議，
  本次任務不強制、也不實作任何過濾邏輯。

---

## Error Boundary

規劃三種錯誤分類，對應到User Application需要用不同方式呈現的
情境：

### Product Errors（Product層本身的錯誤）

發生在Product Intelligence Entry這一層——例如HTTP body不是合法
JSON、必要欄位缺失（連轉成`{context}`都做不到）。這類錯誤
**不應該**進到Feature層，應該在Entry這一層就直接回傳（規劃上
對應HTTP 400）。

### Intelligence Errors（Feature/Capability層的錯誤）

Feature Intelligence Integration/Capability
Orchestrator回傳的`{ok:false, reason, field?, stage?}`——例如
`invalid_context`、`analysis_capability_unavailable`。這類錯誤
的`reason`字串本身是穩定的（Phase 4已用測試逐一驗證這些字串不會
無故變動），規劃上Product Intelligence Entry應該維護一張
`reason` → HTTP status code的對照表（本次任務**不建立**這張表，
只確認需要有它）：

- `invalid_request`/`invalid_context`/`invalid_options_type`
  這類輸入驗證失敗 → 規劃對應HTTP 400。
- `analysis_capability_unavailable`/
  `recommendation_capability_unavailable`這類依賴注入缺失 →
  規劃對應HTTP 503（服務暫時不可用，這是伺服器組裝問題，不是
  User輸入問題）。

### Runtime Errors（Runtime層的例外）

Analysis Runner/Recommendation Runner內部拋出的例外（目前的
Runner設計是同步函式、不主動拋出例外，但規劃上依然要考慮這個
情境，避免未來Runner擴充後Product層沒有對應處理）——規劃上
Product Intelligence Entry應該用`try/catch`包住整個Feature呼叫，
未預期的例外一律規劃對應HTTP 500，並且**不**把原始例外訊息
（可能包含stack trace等內部細節）原樣暴露給User Application，
只回傳一個通用的錯誤訊息。

**三種錯誤分類的判斷順序**：Product Errors優先於Intelligence
Errors（HTTP body都解析不了，不會走到呼叫Feature這一步）；
Intelligence Errors優先於Runtime Errors（`{ok:false,...}`是
Feature/Capability層**正常**的失敗回傳路徑，不是例外，只有真的
拋出例外時才落到Runtime Errors這一類）。

---

## Feature Consumption Path

延續TASK1.90已規劃的三種能力消費方式，本次任務重新確認並聚焦於
Product Intelligence Entry跟三者的關係：

- **Insight**（既有，TASK1.66）：Product Intelligence
  Entry**不涉及**這條既有路徑，Insight依然透過既有的
  `src/routes/`/`src/controllers/`呼叫
  `insightFeature.requestInsight()`，這是Phase 3既有的
  Application Pattern，本次任務不改變。
- **Behavior**（既有，TASK1.72）：同上，Product Intelligence
  Entry不涉及這條既有路徑。
- **Intelligence Capability**（TASK1.76~1.89，規劃中）：Product
  Intelligence Entry是**唯一**規劃中會呼叫
  `intelligence_feature.js`的進入點，遵守本文件定義的
  Request/Response/Error Boundary。

---

## Phase 5 Roadmap

### Current State（現況）

- Feature Intelligence Integration（TASK1.79）存在，可獨立
  測試、可獨立呼叫，但沒有任何HTTP路由呼叫它。
- Product Intelligence Entry**完全不存在**——這是一個規劃中的
  概念，`src/routes/`、`src/controllers/`底下沒有任何對應的
  程式碼。
- `app.intelligence`物件維持24個欄位不變（延續TASK1.78/1.86/
  1.88/1.89/1.90的Known Limitation）。

### Future Implementation Direction（未來落地方向）

1. 在`src/routes/`（或`src/controllers/`）新增一個獨立的
   read-only路由，實作本文件定義的Request/Response/Error
   Boundary，作為Product Intelligence Entry的第一個真實實作。
2. 這個路由呼叫`app.intelligence.features.intelligence`
   （目前不存在，需要先在`src/bootstrap/application.js`新增
   對應欄位，把Feature Intelligence Integration組裝好依賴後
   掛上去）。
3. 驗證真實HTTP流量下，本文件規劃的Error Boundary對照表
   （reason → status code）是否完整、是否有遺漏的reason值。
4. 視使用情況決定是否要讓這個Entry支援選填的
   `decisionCapability`注入（目前Feature Intelligence
   Integration本身也還沒有這個選項，需要先落地TASK1.86
   同款的選填依賴注入模式）。

### Known Limitations

見下方獨立章節。

---

## Known Limitations

1. **本次任務完全沒有建立任何路由/controller程式碼**——
   `src/routes/`、`src/controllers/`本次任務完全沒有新增或修改
   任何檔案，"Product Intelligence Entry"純粹是規劃概念。
2. **沒有變更任何既有production程式碼**——Phase 1~4建立的所有
   既有程式碼（Insight/Behavior Feature、Capability Chain、
   Runtime Runner、Auth/OAuth/Session/Middleware）本次任務完全
   沒有被修改。
3. **Error reason → HTTP status code對照表尚未建立**——本文件
   只規劃了分類原則跟幾個範例對照，完整的對照表（涵蓋所有既有
   reason字串）留給未來落地任務建立。
4. **是否暴露decision欄位/是否過濾內部狀態字串尚未決定**——
   Response Boundary章節列出的"Hidden Internal
   Fields"是規劃建議，不是強制規則，本次任務不實作任何過濾
   邏輯。
5. **`app.intelligence`尚未新增對應欄位**——延續TASK1.78/1.86/
   1.88/1.89/1.90已記錄的Known Limitation，Feature
   Intelligence Integration依然沒有被組裝進
   `src/bootstrap/application.js`，這是Future Implementation
   Direction第二點列出的未來工作，本次任務不提前實作。
6. **Contract結論延續**——延續`PHASE4_DECISION_CONTRACT_PLAN.md`
   （TASK1.84）的階段性結論，本次任務沒有改變它。
7. **async限制延續**——延續TASK1.75~1.90已記錄的Known
   Limitation：目前所有Capability都是同步函式，未來Product
   Intelligence Entry若要接進真實async路由，這個介面轉換細節
   留給未來落地任務處理。

---

## Completion Criteria 確認

✅ Product Entry Boundary defined——"Product Intelligence
Entry"的職責邊界、跟既有`src/routes/`/`src/controllers/`架構
位置的關係，已在Entry Architecture章節明確記錄。

✅ Request/Response/Error boundary defined——三個Boundary
章節分別記錄了輸入形狀、驗證責任歸屬、輸出形狀、暴露/隱藏欄位、
三種錯誤分類跟判斷順序。

✅ Feature consumption path defined——Insight/Behavior（既有，
不涉及）跟Intelligence Capability（規劃中，Product
Intelligence Entry是唯一進入點）的消費路徑已記錄。

✅ AI Provider not enabled——本次規劃沒有呼叫任何AI SDK、沒有
建立Prompt Logic。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。

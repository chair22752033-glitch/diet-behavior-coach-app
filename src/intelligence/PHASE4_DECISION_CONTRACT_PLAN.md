# Phase 4 Decision Capability Contract & Output Architecture Plan（TASK1.84）

## 目的

本文件是**TASK1.84 Decision Capability Contract & Output
Architecture Planning**的規劃結論——本次任務**不是**建立Decision
Logic/Decision Algorithm、**不是**導入AI，目的是在TASK1.83
Decision Capability Foundation已經落地的真實實作
（`src/intelligence/capabilities/decision/`）基礎上，正式確認
Decision Capability未來所需的資料契約（Request/Response）與
輸出模型邊界，而不是繼續停留在TASK1.81/1.82的假設性規劃層次。

驗證方式見`backups/phase4-task1.84-decision-contract-plan/
test_decision_contract_architecture.mjs`——本次沒有新增/修改任何
既有production程式碼（`decision_capability.js`/`decision_result_
builder.js`本身完全不變），測試內容以確認：(1) 本文件描述的
Request/Response Boundary跟`decision_capability.js`/`decision_
result_builder.js`的真實程式碼行為完全一致（不是憑空規劃、
而是對照真實實作驗證）、(2) Decision Capability既有邊界維持不變、
(3) 本次規劃沒有意外建立任何新的Decision Algorithm/Rule Engine/
Scoring Logic/Weight/Threshold程式碼。

---

## Decision Request Boundary（Planning Scope 1）

**問題**：Decision Capability未來需要接收`Recommendation
Result`，這樣是否足夠？

**對照真實實作**（`decision_capability.js`的
`validateDecisionCapabilityRequest()`）：

```js
function validateDecisionCapabilityRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_request' };
  }
  if (!request.recommendationResult || typeof request.recommendationResult !== 'object' || Array.isArray(request.recommendationResult)) {
    return { ok: false, reason: 'invalid_recommendation_result' };
  }
  return { ok: true };
}
```

**Required fields**：
- `recommendationResult`（必填，物件）——Recommendation
  Capability（TASK1.77）`requestRecommendation()`成功時回傳的
  `result`欄位（`{status, recommendations, metadata}`）。

**Optional fields**：
- 目前**沒有**任何選填欄位。`decision_capability.js`唯一讀取的
  欄位是`request.recommendationResult`，不接受、也不解讀其他
  任何欄位（例如沒有`options`，跟Analysis/Recommendation
  Capability的`request.options`不同——因為目前完全沒有任何邏輯
  需要額外的選項參數）。

**Metadata boundary**：
- Request本身不攜帶獨立的metadata欄位；`recommendationResult.
  metadata`（Recommendation Result原本就有的欄位）不會被
  Decision Capability讀取或解讀，只有`recommendationResult.
  recommendations`陣列的**長度**（`.length`）會被讀取，用來產生
  `metadata.recommendationCount`——這是單純的事實計數，不是對
  metadata內容的解讀。

**結論**：**目前足夠**。Decision Capability現階段的責任（接收
Recommendation Result、驗證輸入結構、產生結構化Decision Output
佔位形狀）完全不需要`recommendationResult`以外的任何輸入——這
跟`decision_capability.js`的真實程式碼完全對應，不是假設。

**禁止加入實際決策內容確認**：`validateDecisionCapabilityRequest()`
只檢查形狀（是否為物件），完全不讀取`recommendations`陣列裡每
一筆的`type`/`value`/`source`欄位內容，也不做任何比較/篩選/
排序——維持TASK1.83建立時「不加入判斷邏輯」的邊界，本次規劃
沒有、也不應該修改這個驗證函式。

---

## Decision Response Boundary（Planning Scope 2）

**Decision Output Model**（`decision_result_builder.js`的
`buildDecisionOutputPlaceholder()`真實回傳形狀）：

```js
{
  status: 'decision_not_available',
  decision: null,
  metadata: {
    version: '1.0.0',
    recommendationCount: <number>,
  },
}
```

| 欄位 | 目前狀態 | 說明 |
|---|---|---|
| `status` | 固定字面值`'decision_not_available'` | 明確標示「這裡有結構、但還沒有真正的決策」，跟Analysis Result的`'analysis_ready'`/Recommendation Result的`'recommendation_ready'`刻意採用不同的命名慣例（`_ready`代表真正產出內容，`_not_available`代表佔位） |
| `decision` | 固定為`null` | 本次規劃**再次確認**這個欄位維持`null`，禁止在本任務新增任何實際決策內容 |
| `metadata.version` | `'1.0.0'`（`DECISION_OUTPUT_VERSION`常數） | 純資料版本標記，跟AI model版本無關 |
| `metadata.recommendationCount` | 原樣讀取輸入`recommendations`陣列長度 | 事實計數，不是評分 |

**未來擴充方式確認**：

- 當未來某個任務真正實作Decision邏輯時，`status`欄位預期會從
  `'decision_not_available'`演進為類似`'decision_ready'`的新
  字面值，`decision`欄位會從`null`演進為真正的決策內容（形狀
  待未來任務決定，可能是單一選擇物件、也可能是排序過的清單——
  TASK1.82審查文件已記錄這個未定案的狀態，本次規劃不做最終
  決定）。
- **向後相容原則**（本次規劃新增的明確要求）：未來擴充**必須**
  維持`{status, decision, metadata}`三個頂層欄位的既有形狀，
  新增內容只能透過「讓`decision`欄位從`null`變成真正有值」跟
  「在`metadata`底下新增欄位」達成，不應該重新命名或移除既有
  三個頂層欄位、也不應該把`status`/`decision`欄位挪到其他巢狀
  結構——這是為了讓現在就可以安全消費這個佔位形狀的呼叫端
  （例如未來的Capability Orchestrator擴充），日後升級時不需要
  重寫解讀邏輯。

---

## Recommendation / Decision Separation（Planning Scope 3）

**責任切分再次確認**（延續TASK1.82 Decision Boundary
Analysis章節的結論，本次用TASK1.83的真實程式碼再次核對）：

- **Recommendation Layer**（`recommendation_runner.js`/
  `recommendation_capability.js`）：負責**提供建議**——把
  Analysis Result裡的欄位值轉成一筆一筆結構化的候選項
  （`recommendations`陣列），每一筆都平等並列，不做任何選擇/
  排序/評分。這個責任邊界在TASK1.44建立以來完全沒有改變，
  TASK1.83也沒有修改`recommendation_runner.js`/
  `recommendation_capability.js`。
- **Decision Layer**（`decision_capability.js`/`decision_
  result_builder.js`）：負責**產生決策輸出**——目前只產生
  佔位形狀（`decision: null`），完全沒有實際「選擇」的邏輯，
  但架構位置已經明確界定為「消費Recommendation
  Result、產生Decision Output」，跟Recommendation Layer的
  責任完全不同、不重疊。

**禁止責任混合確認**（本次規劃逐一比對真實程式碼，非假設）：
- `recommendation_runner.js`/`recommendation_capability.js`
  完全沒有出現`decision`相關字樣（沒有被TASK1.83污染）。
- `decision_capability.js`/`decision_result_builder.js`完全
  沒有重新定義或修改`recommendations`陣列的形狀、也沒有解讀
  每一筆候選項的業務內容——只讀取陣列長度。
- 兩者是完全獨立、互不import的兩個Capability目錄
  （`capabilities/recommendation/`跟`capabilities/decision/`），
  這個目錄邊界本身就是責任分離的具體落地。

---

## Contract Strategy（Planning Scope 4）

**問題**：是否需要建立`Decision Request Contract`/`Decision
Response Contract`程式碼？

**對照真實實作重新評估**（TASK1.82當時是假設性評估，本次是
對照TASK1.83真實落地的程式碼複雜度重新確認）：

`decision_capability.js`的`validateDecisionCapabilityRequest()`
只有4行程式碼、檢查2個條件（request是否為物件、
recommendationResult是否為物件）；`decision_result_builder.js`
的`buildSuccessResult()`/`buildFailureResult()`同樣是極簡單的
純函式包裝。這個複雜度跟Analysis Capability
（TASK1.76）/Recommendation Capability（TASK1.77）的既有驗證
邏輯複雜度完全同一個量級——而Analysis/Recommendation
Capability從建立至今都沒有因為複雜度提高而需要重新評估建立
Contract。

**結論：目前不需要建立Decision Request/Response
Contract程式碼**——理由：

1. **複雜度極低**：驗證邏輯只有形狀檢查（是否為物件），沒有
   多個欄位交叉驗證、沒有條件式必填欄位、沒有巢狀結構驗證，
   不足以構成需要獨立Contract Layer的理由。
2. **維持既有慣例**：四層Phase 4 Capability
   （Analysis/Recommendation/Orchestration/Decision）全部
   採用內建最小驗證，沒有任何一層重用TASK1.63
   Contract Layer（那組Contract服務的是Phase 3既有的Workflow
   鏈路），Decision Capability維持這個一致性。
3. **YAGNI（You Aren't Gonna Need It）**：目前`decision`欄位
   本身還是`null`佔位，在真正的Decision內容形狀確定之前，
   任何Contract設計都只能是猜測，過早建立反而可能綁定錯誤的
   假設，未來實作真正的Decision邏輯時需要重新修改Contract，
   徒增成本。

**這個結論是階段性的**：一旦未來任務真正實作Decision內容（讓
`decision`欄位從`null`變成有意義的值），且該內容的驗證需求變得
複雜（例如需要驗證多種不同的決策策略、需要驗證巢狀的決策
理由結構），屆時應該重新評估是否需要建立Contract——本次規劃
不預先建立任何用不到的Contract程式碼。

---

## AI Extension Strategy（Planning Scope 5）

延續TASK1.75/1.81/1.82已經確認的AI Extension Point設計原則，
本次針對TASK1.83真實落地的Decision Capability重新確認：

**AI Decision Module合法位置**（規劃中，仍未建立）：比照
`analysis_runner.js`/`recommendation_runner.js`既有的
`dependencies.modules`延伸點，未來的**Decision
Runner**（Phase 2 Runtime層，規劃中，仍未建立）應該提供同樣
語意的`dependencies.modules`，讓AI增強的決策邏輯以「其中一個
可替換的決策模組」的身分注入。`decision_capability.js`目前
完全沒有依賴任何Runner（因為Decision Runner還不存在），本次
規劃確認：一旦Decision Runner未來被建立，`decision_
capability.js`應該比照`analysis_capability.js`/
`recommendation_capability.js`的既有模式，改為透過依賴注入
拿到`decisionRunner`並呼叫它，而不是繼續呼叫現在這個內建的
`buildDecisionOutputPlaceholder()`——這是`decision_
capability.js`預期會發生、但本次任務不執行的未來修改。

**明確禁止（延續TASK1.75~1.83一致的邊界，本次審查重申）**：
`Feature → AI Provider`（Feature direct AI
usage）這條捷徑——不論現有的Insight/Behavior/Intelligence
Feature，或未來任何新增的Feature，都不允許繞過Runtime層的
modules延伸點，直接呼叫AI SDK。這條規則對Decision
Capability同樣適用：即使未來Decision Runner支援AI
modules，Decision Capability/Capability Orchestrator/Feature
都不應該知道「AI」是什麼。

---

## Security Boundary

TASK1.83已經在真實程式碼裡落地並通過測試驗證的安全邊界，本次
規劃重新確認並記錄為未來任何Contract/Runner擴充都必須持續
遵守的標準：

- ❌ 不得直接操作**database**（`decision_capability.js`/
  `decision_result_builder.js`完全不import`src/db/`，完全不
  接受db參數——已驗證）。
- ❌ 不得直接操作**auth**（完全不import`src/auth/`、
  `src/oauth/`、`src/identity/`、`src/middleware/`——已驗證）。
- ❌ 不得直接操作**session**（同上，不接受userId/session相關
  參數——已驗證）。
- ❌ 不得直接操作Execution Manager/History Store/Metrics
  Store/Event Dispatcher（延續Capability層既有邊界——已驗證）。
- ❌ 不得呼叫任何AI Provider/AI SDK（延續AI Extension
  Strategy的邊界——已驗證）。

---

## Known Limitations

1. **Decision內容形狀仍未定案**——`decision`欄位目前是`null`，
   真正的內容形狀（單一選擇？排序清單？）留給未來實作任務
   決定，本次規劃只確認了外層`{status, decision, metadata}`
   骨架的向後相容原則。
2. **Contract評估結論是階段性的**——本次結論「目前不需要」建立
   在複雜度極低的前提上，複雜度提高時需要重新評估。
3. **Decision Runner完全不存在**——AI Extension Strategy裡描述
   的`dependencies.modules`延伸點是規劃中的方向，`decision_
   capability.js`目前完全不依賴任何Runner。
4. **Capability Orchestrator的擴充尚未實作**——`capability_
   orchestrator.js`本次完全沒有被修改，TASK1.82記錄的「新增
   decisionCapability依賴注入參數」擴充方式依然只是規劃。
5. **async限制延續**——延續TASK1.75/1.81/1.82已記錄的Known
   Limitation：若未來Decision Runner需要支援非同步AI
   modules，會面臨跟Analysis/Recommendation modules同樣的
   async遷移問題。

---

## Completion Criteria 確認

✅ Decision Contract Boundary明確——Request（`{recommendationResult}`，
無選填欄位）跟Response（`{status, decision, metadata}`，向後
相容擴充原則）的邊界都已對照TASK1.83真實程式碼確認並記錄。

✅ Decision Output Architecture明確——Decision Output Model的
三個頂層欄位、各自的目前狀態跟未來演進方式都已記錄。

✅ Recommendation / Decision Responsibility分離——兩層的責任
邊界已逐一比對真實程式碼確認完全不重疊、不混合。

✅ AI Provider未啟用——本次規劃沒有呼叫任何AI SDK、沒有建立
Prompt Logic，`wrangler.toml`/`package.json`/`.env`皆無AI相關
新增。

✅ Runtime Boundary保持——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次完全沒有被修改。

✅ Application Pattern保持——Phase 3 Application
Pattern（Feature→Workflow→Capability→Use Case→Application
Service→Runtime）本次完全沒有被修改。

✅ 無Database改變——本次任務完全是文件跟測試，本地與遠端D1
所有domain table維持0筆。

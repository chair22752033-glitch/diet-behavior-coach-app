# Phase 4 Decision Capability Integration Architecture Plan（TASK1.85）

## 目的

本文件是**TASK1.85 Decision Capability Integration
Architecture**的規劃結論——本次任務**不是**建立Decision
Logic/Decision Algorithm、**不是**導入AI，目的是確認Independent
Decision Capability（TASK1.83落地、TASK1.84確認Contract/Output
邊界）未來要如何**安全接入**既有的Capability Orchestrator
Flow（TASK1.78），而**不修改**`capability_orchestrator.js`本身
——本次任務規格明確禁止「修改Existing Capability Logic」，因此
這裡的產出是**設計圖跟決策**，不是程式碼變更。

驗證方式見`backups/phase4-task1.85-decision-integration/
test_decision_integration_architecture.mjs`——本次沒有新增/修改
任何既有production程式碼（`capability_orchestrator.js`/
`decision_capability.js`本身完全不變），測試內容以確認：(1) 本
文件描述的整合資料流跟四層Phase 4 Capability的真實程式碼行為
完全一致、(2) `capability_orchestrator.js`確實維持未接線狀態、
(3) 本次規劃沒有意外建立任何Decision Algorithm/Rule
Engine/Scoring Logic/Weight/Threshold程式碼。

---

## Integration Flow（Integration Scope 1）

**問題**：`Analysis Capability → Recommendation Capability →
Decision Capability`是否可以形成單向資料流？

**對照三個Capability的真實程式碼逐段確認**：

```
Analysis Capability（TASK1.76）
  requestAnalysis({context, options?})
    → 回傳 {ok, capability:'analysis', result:{status, insights, metadata}}
      ↓ result 包成 {analysisResult: result}
Recommendation Capability（TASK1.77）
  requestRecommendation({analysisResult})
    → 回傳 {ok, capability:'recommendation', result:{status, recommendations, metadata}}
      ↓ result 包成 {recommendationResult: result}
Decision Capability（TASK1.83）
  requestDecision({recommendationResult})
    → 回傳 {ok, capability:'decision', result:{status, decision, metadata}}
```

**確認結果**：**可以**形成單向資料流，而且這條資料流**已經**
被端對端測試驗證過（TASK1.83/1.84各自的test suite都有「完整
鏈路Analysis→Recommendation→Decision全部用真實Runner/Capability
串接，正確運作」的端對端測試）。三段的Request/Response形狀
互相咬合：
- Recommendation Capability的request形狀
  `{analysisResult}`恰好吃Analysis Capability回傳的`result`。
- Decision Capability的request形狀
  `{recommendationResult}`恰好吃Recommendation
  Capability回傳的`result`。

這條鏈路**沒有循環依賴、沒有跳層**——每一段都只認識自己的
直接輸入來源，Decision Capability完全不認識Analysis
Capability的存在（不import、不接收Analysis Result），
Analysis Capability也完全不認識Decision Capability的存在。

---

## Orchestrator Boundary（Integration Scope 2）

**問題**：Capability Orchestrator應該**直接呼叫**Decision
Capability，還是**維持未來Extension Point**？

**評估**：

規格明確禁止「修改Existing Capability
Logic」——`capability_orchestrator.js`的
`requestCapabilityFlow()`是已經被TASK1.78/1.79/1.80/1.81/1.82/
1.83/1.84反覆測試覆蓋的既有介面，直接修改它會牽動大量既有
測試的假設（例如`Unified Capability
Result`目前恰好只有`{analysis, recommendation}`兩個欄位，
被TASK1.79/1.80/1.81/1.82/1.83/1.84的測試套件多次驗證為
「恰好兩個」）。

**結論**：**維持未來Extension Point**，本次任務**不修改**
`capability_orchestrator.js`。

**未來若要接上時的具體擴充設計**（記錄設計圖，不執行）：

```js
// capability_orchestrator.js 未來可能的擴充（本次不執行）
function createCapabilityOrchestrator(dependencies) {
  const { analysisCapability, recommendationCapability, decisionCapability } = dependencies;
  // ...既有 analysisCapability / recommendationCapability 呼叫不變...

  // 新增步驟：Recommendation 成功後，呼叫 Decision Capability
  if (decisionCapability && typeof decisionCapability.requestDecision === 'function') {
    const decisionOutcome = decisionCapability.requestDecision({
      recommendationResult: recommendationOutcome.result,
    });
    if (!decisionOutcome.ok) {
      return resultBuilder.buildFailureResult(decisionOutcome.reason, decisionOutcome.field, 'decision');
    }
    return resultBuilder.buildSuccessResult(analysisOutcome.result, recommendationOutcome.result, decisionOutcome.result);
  }

  // decisionCapability 未提供時，維持現有兩欄位行為（向後相容）
  return resultBuilder.buildSuccessResult(analysisOutcome.result, recommendationOutcome.result);
}
```

**責任邊界確認**：這個擴充設計刻意讓`decisionCapability`成為
**選填**依賴——沒有提供時，Orchestrator完全維持TASK1.78建立
當下的既有行為（只回傳`{analysis, recommendation}`兩個欄位），
保證未來真正執行這個擴充時，既有呼叫端（如果有的話）不會被
破壞。這是唯一符合「不修改Existing Capability Logic」跟「安全
接入」兩個要求同時成立的設計方向——本次任務**不執行**這個
擴充，只記錄設計。

---

## Decision Output Integration（Integration Scope 3）

**問題**：Decision Output要如何加入Unified Intelligence Result？

**確認**：延續上一節的擴充設計，`Unified Capability
Result`未來會從`{analysis, recommendation}`兩個欄位擴充為
`{analysis, recommendation, decision}`三個欄位——`decision`
欄位直接放Decision Capability回傳的`result`（也就是TASK1.83/
1.84定義的`{status, decision, metadata}`佔位形狀，`decision`
內層欄位固定為`null`），不重新拆開或改寫其內容，延續整個
Phase 4系列「每一段Result原樣保留，不在上層重新加工」的一貫
慣例（見TASK1.78`capability_result_builder.js`/TASK1.79
`intelligence_feature_result_mapper.js`的既有做法）。

**明確禁止加入實際決策內容確認**：本次規劃裡展示的擴充設計
`decisionOutcome.result`本身就是TASK1.83已經建立、`decision`
欄位固定為`null`的佔位形狀——這個設計本身**不會**、也**不能**
加入任何實際決策內容，因為`decision_capability.js`目前根本
沒有能力產生實際決策（規格明確禁止建立Decision
Algorithm）。即使未來真的執行這個Orchestrator擴充，
Unified Capability Result裡的`decision`欄位在Decision
Algorithm真正建立之前，也只會是佔位形狀，不會意外洩漏任何
判斷/評分邏輯。

---

## Dependency Direction（Integration Scope 4）

**確認**：Decision Capability（`decision_capability.js`/
`decision_result_builder.js`）不依賴：

- **database**——完全不import`src/db/`，完全不接受db參數
  （TASK1.83建立時已驗證，本次規劃逐檔案git diff確認未變）。
- **auth**——完全不import`src/auth/`、`src/oauth/`、
  `src/identity/`、`src/middleware/`，完全不接受userId/session
  相關參數（同上）。
- **runtime internal components**——完全不import
  `src/intelligence/execution/`（Execution Manager）、
  `src/intelligence/history/`、`src/intelligence/metrics/`、
  `src/intelligence/events/`（Event Dispatcher）、
  `src/intelligence/governance/`、`src/intelligence/facade/`、
  `src/intelligence/service/`、`src/intelligence/orchestration/`
  （Phase 2 Runtime Orchestrator，注意跟Capability Orchestrator
  是完全不同的兩個東西）。

**上述擴充設計對這個依賴方向的影響確認**：即使未來執行了
Orchestrator Boundary章節描述的擴充，`capability_
orchestrator.js`本身依然只透過依賴注入認識`decisionCapability`
**這一個Capability實例**，不會因此新增任何對database/auth/
runtime internal components的依賴——這個擴充只是在既有的
「呼叫下一個Capability」模式上再多呼叫一次，不改變
Orchestrator本身「只協調、不承載業務邏輯、不直接碰觸Runtime
內部元件」的既有邊界（見TASK1.78 README「跟Phase 2 Runtime
Orchestrator的差異」章節）。

---

## AI Extension Strategy

延續TASK1.75/1.81/1.82/1.84已經確認的AI Extension Point設計
原則，本次針對Orchestrator整合情境重新確認：即使未來Decision
Runner支援AI modules（AI Decision Module的合法位置，見
`PHASE4_DECISION_CONTRACT_PLAN.md`），`capability_
orchestrator.js`的擴充設計裡也完全不需要、也不應該知道AI是
什麼——Orchestrator只認識`decisionCapability.
requestDecision()`這一個介面，AI相關的實作細節完全被封裝在
Decision Capability/未來的Decision Runner內部。

**明確禁止（延續一致的邊界，本次審查重申）**：`Feature → AI
Provider`（Feature direct AI usage）這條捷徑，在Orchestrator
整合後依然完全禁止——Feature Integration（TASK1.79）呼叫
Capability Orchestrator，Orchestrator呼叫各個Capability，
沒有任何一段允許跳過這條鏈路直接呼叫AI SDK。

---

## Known Limitations

1. **Orchestrator擴充完全沒有實作**——本文件的擴充設計是
   規劃圖，`capability_orchestrator.js`本次完全沒有被修改，
   何時執行這個擴充留給未來任務決定。
2. **Decision Output依然是佔位形狀**——即使未來Orchestrator
   接上Decision Capability，`decision`欄位在Decision
   Algorithm真正建立之前依然是`null`，Unified Capability
   Result的第三個欄位不會有實際內容。
3. **向後相容測試尚未針對真實擴充驗證**——本次規劃只在文件裡
   描述`decisionCapability`應該是選填依賴，真正執行擴充時，
   需要新增測試驗證「不提供decisionCapability時行為不變」跟
   「提供時Unified Result正確擴充成三欄位」兩種情境，這些測試
   本次沒有針對真實程式碼撰寫（因為程式碼還不存在）。
4. **Contract結論延續**——延續`PHASE4_DECISION_CONTRACT_PLAN.md`
   （TASK1.84）「目前不需要建立Decision Request/Response
   Contract」的階段性結論，本次整合規劃沒有改變這個結論。
5. **async限制延續**——延續TASK1.75/1.81/1.82/1.84已記錄的
   Known Limitation。

---

## Completion Criteria 確認

✅ Decision Capability Integration Boundary明確——三段Capability
的Request/Response形狀互相咬合，資料流單向、無循環依賴、無
跳層，已對照真實程式碼確認。

✅ Orchestrator Extension Point明確——確認`capability_
orchestrator.js`維持未接線狀態，並記錄了具體的、以選填依賴
維持向後相容的擴充設計圖。

✅ Decision Output Integration明確——`decision`欄位如何加入
Unified Capability Result（原樣保留佔位形狀，不重新加工）已
記錄，並確認這個整合不會意外加入任何實際決策內容。

✅ AI Provider未啟用——本次規劃沒有呼叫任何AI SDK、沒有建立
Prompt Logic，`wrangler.toml`/`package.json`/`.env`皆無AI
相關新增。

✅ Runtime Boundary保持——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次完全沒有被修改。

✅ Application Pattern保持——Phase 3 Application
Pattern（Feature→Workflow→Capability→Use Case→Application
Service→Runtime）本次完全沒有被修改。

✅ 無Database改變——本次任務完全是文件跟測試，本地與遠端D1
所有domain table維持0筆。

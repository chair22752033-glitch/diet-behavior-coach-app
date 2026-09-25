# Phase 4 Decision Capability Orchestration Integration（TASK1.86）

## 目的

依照TASK1.85 Decision Capability Integration
Architecture（`./PHASE4_DECISION_INTEGRATION_PLAN.md`）記錄的
設計圖，把Independent Decision Capability（TASK1.83）以
**backward compatible**的方式正式整合進Capability
Orchestrator（TASK1.78）——本次任務**不是**建立Decision
Logic/Decision Algorithm、**不是**導入AI，目的是讓Capability
Orchestrator支援**選填**的Decision Capability依賴。

跟TASK1.75/1.80/1.81/1.82/1.84/1.85不同的地方：這是TASK1.85
規劃之後**第一次真正修改**`capability_orchestrator.js`/
`capability_result_builder.js`（orchestration）——本次任務規格
明確允許「Orchestrator extension」，不再是純規劃/審查。

驗證方式見`backups/phase4-task1.86-decision-orchestration/
test_decision_orchestration_integration.mjs`。

---

## Optional Dependency Design

`createCapabilityOrchestrator(dependencies)`新增一個**選填**的
`decisionCapability`依賴，跟既有的`analysisCapability`/
`recommendationCapability`（兩者皆為必填）並列：

```js
export function createCapabilityOrchestrator(dependencies) {
  dependencies = dependencies || {};
  const { analysisCapability, recommendationCapability, decisionCapability } = dependencies;
  // ...
}
```

**設計原則**：`decisionCapability`是否存在、是否合法（有沒有
`requestDecision`函式），完全不影響`analysisCapability`/
`recommendationCapability`這兩段既有必填流程的行為——`request
CapabilityFlow()`只在Recommendation Capability**成功之後**，
才檢查`decisionCapability`是否可用，檢查方式跟既有的
`analysisCapability`/`recommendationCapability`可用性檢查完全
同一種寫法（`!decisionCapability || typeof decisionCapability.
requestDecision !== 'function'`），維持既有程式碼風格一致。

---

## Backward Compatibility

**核心保證**：`decisionCapability`未提供（`undefined`/`null`，
或提供了但沒有`requestDecision`函式）時，`requestCapabilityFlow()`
**完全等同**TASK1.78建立當下的行為——只呼叫Analysis
Capability跟Recommendation Capability，回傳的Unified Capability
Result恰好只有`{analysis, recommendation}`兩個key。

這個保證由兩處程式碼共同達成：

1. **`capability_orchestrator.js`**：`decisionCapability`不可用
   時，直接呼叫`resultBuilder.buildSuccessResult(analysisOutcome.
   result, recommendationOutcome.result)`——**只傳兩個參數**，
   跟TASK1.78~1.85既有呼叫端寫法完全一樣。
2. **`capability_result_builder.js`**：`buildSuccessResult()`的
   第三個參數`decisionResult`是選填的，只在明確傳入（非
   `undefined`）時才會把`decision`這個key加進`result`
   物件——沒有傳入時，`result`物件裡**完全不存在**這個key（不是
   `decision: undefined`，是這個屬性根本不存在，`Object.keys()`
   驗證得到的陣列也不會包含它）。

**驗證方式**：本次測試套件逐一驗證了TASK1.78~1.85既有測試套件
描述過的「Unified Capability Result恰好只有{analysis,
recommendation}兩個欄位」場景，在本次擴充後**依然逐字成立**——
這不是猜測，是對真實程式碼重新執行同樣斷言得到的結果。

---

## Decision Flow

有提供合法`decisionCapability`時的完整流程：

```
Feature
  ↓ {context, options?}
Capability Orchestrator
  ↓ analysisCapability.requestAnalysis({context, options})
Analysis Capability → Analysis Runner（完全不修改）
  ↓ 成功時 result = {status, insights, metadata}
Capability Orchestrator
  ↓ recommendationCapability.requestRecommendation({analysisResult: result})
Recommendation Capability → Recommendation Runner（完全不修改）
  ↓ 成功時 result = {status, recommendations, metadata}
Capability Orchestrator
  ↓ decisionCapability.requestDecision({recommendationResult: result})
Decision Capability（完全不修改）
  ↓ 成功時 result = {status, decision:null, metadata}
Capability Orchestrator
  ↓ buildSuccessResult(analysisResult, recommendationResult, decisionResult)
Unified Capability Result = {analysis, recommendation, decision}
```

任何一段失敗都立即中止並回傳帶有對應`stage`
（`'analysis'`|`'recommendation'`|`'decision'`）的失敗結果，不會
用不完整的資料頂替繼續往下一段傳遞——這條規則對新增的Decision
這一段跟既有兩段完全一致。

---

## Output Integration

Unified Capability Result的`decision`欄位原樣放
Decision Capability回傳的`result`（`{status:
'decision_not_available', decision: null, metadata}`
佔位形狀）——**沒有**在Orchestrator這一層重新拆開、改寫、或
解讀其內容，延續整個Phase 4系列「每一段Result原樣保留」的一貫
慣例。

本次整合**沒有**、也**不能**加入任何實際決策內容——`decision`
欄位在Unified Capability Result裡跟在Decision Capability自己
回傳的`result`裡一樣，永遠是`null`，因為`decision_capability.js`
本身完全沒有能力產生實際決策（規格明確禁止建立Decision
Algorithm/Rule Engine/Scoring Logic/Weight/Threshold）。

---

## Dependency Direction

Decision Capability（`decision_capability.js`/`decision_
result_builder.js`）本次任務**完全沒有被修改**，其既有的依賴
邊界維持不變——依然完全不依賴：

- **database**（不import`src/db/`，不接受db參數）
- **auth**（不import`src/auth/`、`src/oauth/`、`src/identity/`、
  `src/middleware/`）
- **runtime internal components**（不import
  `src/intelligence/execution/`、`history/`、`metrics/`、
  `events/`、`governance/`、`facade/`、`service/`、
  `orchestration/`）

`capability_orchestrator.js`本次的擴充也沒有新增任何對上述元件
的依賴——新增的程式碼只是多呼叫一次`decisionCapability.
requestDecision()`這個既有介面，跟既有呼叫
`analysisCapability.requestAnalysis()`/
`recommendationCapability.requestRecommendation()`同樣的
依賴注入模式，沒有引入任何新的import。

---

## AI Extension Strategy

延續TASK1.75/1.81/1.82/1.84/1.85已經確認的AI Extension
Point設計原則：即使未來Decision Runner支援AI
modules，`capability_orchestrator.js`也完全不需要、也不應該
知道AI是什麼——Orchestrator只認識`decisionCapability.
requestDecision()`這一個介面。`Feature → AI Provider`（Feature
direct AI usage）這條捷徑在本次整合後依然完全禁止。

---

## Known Limitations

1. **沒有接進bootstrap/Feature Integration**——
   `capability_orchestrator.js`本身沒有被wire進
   `src/bootstrap/application.js`，Feature
   Integration（TASK1.79 `intelligence_feature.js`）也沒有被
   修改成會注入`decisionCapability`——這個選填依賴目前只在
   測試裡被驗證存在、可運作。
2. **Decision Output依然是佔位形狀**——`decision`欄位在
   Decision Algorithm真正建立之前，永遠是`null`。
3. **Contract結論延續**——延續`PHASE4_DECISION_CONTRACT_PLAN.md`
   （TASK1.84）「目前不需要建立Decision Request/Response
   Contract」的階段性結論，本次整合沒有改變這個結論。
4. **async限制延續**——延續TASK1.75/1.81/1.82/1.84/1.85已記錄的
   Known Limitation。

---

## Completion Criteria 確認

✅ Decision Capability可被Orchestrator選擇性使用——
`decisionCapability`是選填依賴，提供時會被正確呼叫。

✅ Legacy Flow保持相容——不提供`decisionCapability`時，Unified
Capability Result恰好維持`{analysis, recommendation}`兩個欄位，
逐一比對TASK1.78~1.85既有測試場景重新驗證成立。

✅ Decision Output Integration正確——`decision`欄位原樣放入
Unified Capability Result，佔位形狀維持`decision: null`。

✅ AI Provider未啟用——本次整合沒有呼叫任何AI SDK、沒有建立
Prompt Logic。

✅ Runtime Boundary保持——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator/Decision Capability本身
本次完全沒有被修改。

✅ Application Pattern保持——Phase 3 Application
Pattern（Feature→Workflow→Capability→Use Case→Application
Service→Runtime）本次完全沒有被修改。

✅ 無Database改變——本地與遠端D1所有domain table維持0筆。

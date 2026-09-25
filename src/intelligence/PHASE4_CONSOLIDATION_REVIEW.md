# Phase 4 Intelligence Capability Architecture Consolidation Review（TASK1.80）

## 目的

本文件是**純審查文件**——本次任務不新增功能、不導入AI、不建立
新Capability。目的是確認Phase 4（TASK1.75規劃 → TASK1.76 Analysis
Capability → TASK1.77 Recommendation Capability → TASK1.78
Capability Orchestration → TASK1.79 Feature Intelligence
Integration）建立的Intelligence Capability Architecture已完整、
一致，並確認可以安全進入後續的Intelligence Enhancement（真正導入
AI的任務）。

---

## 1. Completed Capability Layers

Phase 4目前由四層組成，全部已建立、全部已通過各自任務的完整測試
套件，全部維持「已建立但未接線」（未wire進
`src/bootstrap/application.js`）的一致邊界決策：

| 層 | 目錄 | 建立任務 | 責任 |
|---|---|---|---|
| Analysis Capability | `src/intelligence/capabilities/analysis/` | TASK1.76 | 包裝Analysis Runner（TASK1.43），`createAnalysisCapability({analysisRunner}).requestAnalysis({context, options?})` |
| Recommendation Capability | `src/intelligence/capabilities/recommendation/` | TASK1.77 | 包裝Recommendation Runner（TASK1.44），`createRecommendationCapability({recommendationRunner}).requestRecommendation({analysisResult})` |
| Capability Orchestrator | `src/intelligence/capabilities/orchestration/` | TASK1.78 | 組合Analysis Capability + Recommendation Capability，`createCapabilityOrchestrator({analysisCapability, recommendationCapability}).requestCapabilityFlow({context, options?})` |
| Feature Integration | `src/intelligence/application/features/intelligence/` | TASK1.79 | 把Capability Orchestrator正式接上Feature層級入口，`createIntelligenceFeature({capabilityOrchestrator}).requestIntelligence({context, options?})` |

每一層各自的目錄結構固定為4個檔案（核心邏輯 + Result
Builder/Mapper + `index.js` + `README.md`），彼此之間**只透過依賴
注入**認識彼此（沒有任何一層跨目錄import另一層的實作檔案），下一
節逐一確認這條資料流。

**完整性確認**：四層全部存在、全部可被獨立import、全部有各自的
`README.md`、全部有對應的測試套件（TASK1.76~1.79，合計超過1000項
斷言），Analysis Capability + Recommendation Capability +
Capability Orchestrator + Feature Integration四者缺一不可，目前
全部完整存在。

---

## 2. Data Flow

Phase 4的合法資料流（規格原文，本次審查逐段驗證）：

```
Feature
  ↓
Capability Orchestrator
  ↓
Analysis Capability
  ↓
Recommendation Capability
  ↓
Output
```

具體對應到程式碼：

```
intelligence_feature.js（TASK1.79）
  requestIntelligence({context, options?})
    ↓ capabilityOrchestrator.requestCapabilityFlow({context, options?})
capability_orchestrator.js（TASK1.78）
    ↓ analysisCapability.requestAnalysis({context, options?})
analysis_capability.js（TASK1.76）
    ↓ analysisRunner.runAnalysis(context, options?)
analysis_runner.js（TASK1.43，Phase 2 Runtime，完全不修改）
    ↓ 回傳 {status, insights, metadata}
capability_orchestrator.js 把上面的 result 包成
{analysisResult: 上面的result}
    ↓ recommendationCapability.requestRecommendation({analysisResult})
recommendation_capability.js（TASK1.77）
    ↓ recommendationRunner.runRecommendation(analysisResult)
recommendation_runner.js（TASK1.44，Phase 2 Runtime，完全不修改）
    ↓ 回傳 {status, recommendations, metadata}
capability_orchestrator.js 組成
{analysis: {...}, recommendation: {...}}（Unified Capability
Result）
    ↓
intelligence_feature.js 透過
intelligence_feature_result_mapper.js 轉成
{ok:true, feature:'intelligence', data:{analysis, recommendation}}
（Feature Output）
```

**確認結果**：資料流完全正確、單向、無跳層——沒有任何一段繞過
上一段直接呼叫更下游的模組（例如Feature直接呼叫Analysis
Runner，或Capability Orchestrator跳過Recommendation
Capability直接呼叫Recommendation Runner）。任何一段失敗都會立即
中止並回傳帶有`stage`欄位（'analysis'|'recommendation'）的失敗
結果，不會用不完整的資料頂替繼續往下游傳遞。

---

## 3. Dependency Direction

四層之間的依賴方向（依賴注入，不是import）：

```
Feature Integration --(注入 capabilityOrchestrator)--> Capability Orchestrator
Capability Orchestrator --(注入 analysisCapability)--> Analysis Capability
Capability Orchestrator --(注入 recommendationCapability)--> Recommendation Capability
Analysis Capability --(注入 analysisRunner)--> Analysis Runner（Phase 2 Runtime）
Recommendation Capability --(注入 recommendationRunner)--> Recommendation Runner（Phase 2 Runtime）
```

**Import方向確認**（本次審查逐檔案掃描，見測試套件F/G類）：
- 每一層的核心檔案（`*_feature.js`/`*_orchestrator.js`/
  `*_capability.js`）唯一的相對路徑import是**同目錄底下**的
  Result Builder/Mapper，沒有任何一個檔案跨目錄import其他層的
  實作細節。
- 四層彼此之間**沒有循環依賴**：Feature Integration只認識
  Capability Orchestrator這一個下一層；Capability
  Orchestrator只認識Analysis Capability跟Recommendation
  Capability這兩個下一層；Analysis/Recommendation Capability各自
  只認識對應的Runner；沒有任何反向的import（例如Analysis
  Capability import Capability Orchestrator，或Analysis
  Capability import Recommendation Capability）。
- Analysis Capability跟Recommendation Capability**互不import**
  對方（`capabilities/analysis/`跟`capabilities/recommendation/`
  之間沒有任何跨目錄import），兩者的耦合完全交給Capability
  Orchestrator這一層負責。
- `src/intelligence/capabilities/index.js`（頂層barrel）re-export
  三個nested子目錄（`analysis/recommendation/orchestration`），
  這是既有慣例允許的「上層index.js認識自己底下的子目錄」，不是
  違規的跨層引用（TASK1.56 Runtime Architecture Review的
  cross-dir import例外清單已逐一記錄這幾條邊）。
- `src/intelligence/application/features/index.js`同樣re-export
  三個平行的Feature domain（`insight/behavior/intelligence`），
  `intelligence`domain完全不import`insight/`、`behavior/`底下
  任何檔案，三者互不認識。

**Runtime Leakage確認**：四層全部完全不import
`src/intelligence/execution/`（Execution Manager）、`history/`、
`metrics/`、`events/`、`governance/`、`facade/`、`service/`、
`orchestration/`（Phase 2 Runtime Orchestrator，注意跟Capability
Orchestrator是完全不同的兩個東西，見TASK1.78 README「跟Phase 2
Runtime Orchestrator的差異」章節）、`data_preparation/`。

**Domain Leakage確認**：`intelligence_feature.js`完全不import
`insight_feature.js`、`features/insight/`、`features/behavior/`
底下任何檔案，也完全不import`application/workflows/`、
`application/use_cases/`、`application/application_service.js`
——Phase 4這條路徑跟Phase 3既有的
Feature→Workflow→Capability→UseCase→ApplicationService→Runtime
路徑完全平行、互不交叉，兩條路徑可以同時存在而不互相污染。

---

## 4. Boundary Review

四層Capability全部遵守同一組邊界規則，逐層確認如下（全部由測試
套件的dependency scan/runtime isolation章節逐檔案驗證）：

| 禁止項目 | Analysis Capability | Recommendation Capability | Capability Orchestrator | Feature Integration |
|---|---|---|---|---|
| 直接操作Database（import `src/db/`、接受db參數） | ❌不存在 | ❌不存在 | ❌不存在 | ❌不存在 |
| 直接操作Auth/Session（import `src/auth/`、`src/oauth/`、`src/identity/`、`src/middleware/`） | ❌不存在 | ❌不存在 | ❌不存在 | ❌不存在 |
| 直接呼叫Execution Manager（import `src/intelligence/execution/`） | ❌不存在 | ❌不存在 | ❌不存在 | ❌不存在 |
| 直接存取History/Metrics Store | ❌不存在 | ❌不存在 | ❌不存在 | ❌不存在 |
| 直接存取Event Dispatcher | ❌不存在 | ❌不存在 | ❌不存在（規格額外明確禁止） | ❌不存在 |
| 呼叫AI Provider/建立Prompt Logic | ❌不存在 | ❌不存在 | ❌不存在 | ❌不存在 |

四層全部是**同步、純函式**（沒有一層讀取`Date.now()`/
`Math.random()`），也全部沒有`async`/`Promise`（因為整條鏈路底層
的Analysis Runner/Recommendation Runner本身就是同步的）——這跟
Phase 3既有的Insight/Behavior Feature（因為要經過Workflow→
Application Service→Runtime，中間會有Execution Manager的
async生命週期管理）形成對比，是Phase 4這條路徑刻意保持「輕量、
無副作用」的設計結果。

---

## 5. AI Extension Boundary

Phase 4目前**完全沒有啟用任何AI Provider**（沒有呼叫Claude/
OpenAI/DeepSeek、沒有Prompt Logic、沒有AI API Client、
`wrangler.toml`/`package.json`/`.env`都沒有任何AI相關的
binding/依賴/環境變數）。

未來AI Provider合法的位置（TASK1.75規劃、TASK1.76/1.77審查確認
延續有效）：

- **Analysis Runner的`dependencies.modules`**
  （`src/intelligence/analysis/analysis_runner.js`）——JSDoc明確
  標示「供測試/未來擴充使用」，接受覆蓋`DEFAULT_ANALYSIS_MODULES`
  的模組陣列，每個模組是`(insightContext) => {type,value,source}|null`
  的函式。
- **Recommendation Runner的`dependencies.modules`**
  （`src/intelligence/recommendation/recommendation_runner.js`）
  ——同樣的機制，模組是`(analysisResult) => {type,value,source}|null`
  的函式。

這兩個延伸點都在**Runtime層**（Phase 2），Analysis
Capability/Recommendation Capability只是透過依賴注入拿到已經
組裝好的Runner實例——即使Runner未來被注入AI增強模組，Capability
層本身完全不需要修改（Capability只知道「呼叫
`runAnalysis()`/`runRecommendation()`並取得結果」，不關心Runner
內部用哪組模組，這點已由TASK1.76/1.77/1.78/1.79各自的整合測試
用自訂modules驗證過）。

**明確禁止**：`Feature → AI Provider`這條捷徑——Feature Integration
（`intelligence_feature.js`）跟Capability Orchestrator都不知道
AI是什麼，也不會、不應該直接呼叫任何AI SDK。任何未來的AI能力都
必須透過Runner層的`modules`延伸點注入，往上游透過既有的
Capability/Orchestrator/Feature鏈路自然傳遞，不需要、也不允許在
中間任何一層開新的AI呼叫捷徑。

**Known Limitation（延續TASK1.75規劃文件的記錄）**：Analysis
Runner/Recommendation Runner本身目前是**同步**函式，`modules`
裡的每個模組也預期是同步函式。若未來的AI模組需要非同步呼叫
（例如真的對外呼叫AI API），Runner本身的簽名需要跟著演進成
`async`，這會連帶影響Analysis Capability/Recommendation
Capability/Capability Orchestrator/Feature Integration全部四層
的簽名（目前全部是同步函式）——這是一個已知的、留給「真正導入
AI」的未來任務評估與實作的架構限制，本次審查任務不處理、也不
應該處理（規格明確禁止「導入AI Provider」）。

---

## 6. Known Limitations（總結）

1. **async尚未支援**：見上方第5節，Runner/Capability/Orchestrator/
   Feature Integration四層全部是同步函式，未來若需要真正呼叫
   外部AI API，需要一次性把這條鏈路演進成async——這個演進本身
   不在本次審查範圍內。
2. **尚未接進bootstrap/未接進真實Feature**：Analysis
   Capability（TASK1.76）、Recommendation
   Capability（TASK1.77）、Capability Orchestrator（TASK1.78）、
   Feature Integration（TASK1.79）全部刻意「建立但不改變既有
   execution behavior」——沒有任何一層被wire進
   `src/bootstrap/application.js`的`intelligence`物件，也沒有
   任何既有Feature（Insight/Behavior）呼叫這條Phase 4鏈路。這是
   延續整個Phase 4系列一致的邊界決策，何時、是否要接進真實
   bootstrap留給未來任務決定。
3. **Unified Capability Result的nested形狀**：Capability
   Orchestrator/Feature Integration回傳的`{analysis, recommendation}`
   是刻意保留兩段Result原樣的nested結構，沒有進一步合併成單一
   的`{status, result, metadata}`形狀（跟Phase 3
   Insight/Behavior Feature的輸出形狀不同）。這是刻意的設計
   決策（避免發明有歧義的合併語意），但意味著未來若要把這條
   Phase 4鏈路的輸出直接餵給依賴Phase 3輸出形狀的既有程式碼，
   需要額外的轉接層，這個轉接層尚未存在。
4. **沒有Governance/Contract Layer的整合**：TASK1.55 Governance
   Layer、TASK1.63 Contract Layer目前只服務Phase 3既有的
   Insight/Behavior Feature鏈路，Phase 4的Capability鏈路目前
   完全沒有經過這兩層的驗證（Feature Integration/Capability
   Orchestrator各自內建自己最小的request形狀驗證，沒有重用
   Contract Layer）。是否要讓Phase 4鏈路也套用Governance/Contract
   留給未來任務評估。

---

## 7. Completion Criteria 確認

✅ Phase 4 Capability Architecture完整——Analysis Capability +
Recommendation Capability + Capability Orchestrator + Feature
Integration四層全部存在、全部通過測試。

✅ Analysis + Recommendation Flow正確——資料流
Feature→Capability Orchestrator→Analysis→Recommendation→Output
逐段驗證正確，無跳層、無循環依賴。

✅ Feature Integration正確——`intelligence_feature.js`正確使用
Capability Orchestrator，不繞過它直接呼叫Analysis/Recommendation
Capability。

✅ AI Provider未啟用——全程無任何AI SDK/Prompt Logic/API Client，
`wrangler.toml`/`package.json`/`.env`皆無AI相關新增。

✅ Runtime Boundary保持——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator/Execution Manager等Runtime
子系統本次審查完全沒有被修改。

✅ 無Database改變——本次審查完全是文件跟測試，本地與遠端D1所有
domain table維持0筆。

# Phase 4 Intelligence Capability Architecture Plan（TASK1.75）

## 目的

本文件是**TASK1.75 Phase 4 Intelligence Capability Architecture
Planning**的規劃結論——本次任務**不是**導入AI、**不是**建立AI
Provider、**不是**新增User Feature，目的是在Phase 1（Foundation
Layer）、Phase 2（Intelligence Runtime Foundation）、Phase 3
（Intelligence Application Layer，TASK1.60~1.74）全部完成之後，
在真正開始Phase 4 Intelligence Capability Development之前，先
確認發展方向，並明確定義未來AI Capability、Analysis Capability、
Recommendation Capability的合法接入邊界。

驗證方式見`backups/phase4-task1.75-capability-planning/
test_phase4_capability_architecture.mjs`——本次沒有修改任何既有
production程式碼，測試內容以確認既有架構已經具備規劃中描述的
extension point為主（原始碼靜態分析 + 呼叫既有的
`modules`依賴注入機制驗證擴充路徑事實上可行）。

## Phase 4 Architecture Goal

Phase 4的目標是讓Intelligence Runtime的Analysis跟Recommendation
兩個階段，能夠從目前Phase 1~3建立的**純規則式（deterministic
rule-based）**邏輯，逐步演進成**可選擇性AI-enhanced**的邏輯，
同時滿足：

1. 完全不修改Phase 2 Runtime Boundary（Data Preparation→Insight
   Context→Analysis→Recommendation四階段的既有介面形狀跟呼叫順序
   維持不變）
2. 完全不修改Phase 3 Application Pattern（Feature→Workflow→
   Capability→Use Case→Application Service→Runtime六層維持不變，
   兩個既有Feature domain——Insight、Behavior——完全不需要感知
   Runtime底層是規則式邏輯還是AI推論）
3. AI能力的啟用/停用是**可逆的**、**局部的**——不會因為導入AI
   而破壞任何既有deterministic測試斷言

## Capability Boundary（Review Scope 1）

責任切分（規格原文的Application Feature→Capability→Analysis/
Recommendation→Runtime鏈路，對應到目前實際的檔案結構）：

```
Application Feature（features/insight/、features/behavior/）
  ↓（透過Workflow→Capability→Use Case→Application Service間接）
Capability（application/capabilities/、features/behavior/
  behavior_capability.js）
  ↓（透過Application Service→Facade→Execution Manager→Service→
  Orchestrator間接）
Analysis / Recommendation（intelligence/analysis/
  analysis_runner.js、intelligence/recommendation/
  recommendation_runner.js）
  ↓
Runtime（Analysis Result Builder/Recommendation Result Builder
  組裝最終輸出）
```

**確認結果**：這個責任切分已經在Phase 1（TASK1.43/1.44建立
Analysis/Recommendation Framework）跟Phase 3（TASK1.60~1.72
建立Application Layer六層）分別確立，Phase 4不需要、也不應該
新增額外的中間層——Application Feature/Capability完全不知道
Analysis/Recommendation內部是規則式還是AI-enhanced，這正是目前
「每一層只認識自己呼叫的下一層」邊界設計的直接成果。

## AI Extension Point（Review Scope 2）

### 已經存在、可直接使用的合法接入位置

`analysis_runner.js`（`createAnalysisRunner(dependencies)`）跟
`recommendation_runner.js`（`createRecommendationRunner
(dependencies)`）**都已經**提供`dependencies.modules`這個依賴
注入覆蓋點，JSDoc明確寫著「覆蓋預設分析/推薦模組清單，**供測試/
未來擴充使用**」——這不是TASK1.75新發現的東西，而是TASK1.43/
1.44建立當下就刻意留下的extension point，本次規劃只是把它正式
確認為Phase 4 AI Capability的合法接入位置。

每個模組是一個純函式：

```js
// Analysis module: (insightContext) => {type,value,source} | null
// Recommendation module: (analysisResult) => {type,value,source} | null
```

Phase 4若要導入AI-enhanced分析/推薦能力，合法路徑是：

1. 撰寫一個新的模組函式（例如`aiPoweredInsightModule(context)`），
   內部呼叫AI Provider，回傳跟既有模組相同形狀的
   `{type, value, source}`物件（或`null`）
2. 透過`createAnalysisRunner({modules: [...DEFAULT_ANALYSIS_MODULES,
   aiPoweredInsightModule]})`或
   `createRecommendationRunner({modules: [...]})`注入，而不是
   修改`analysis_runner.js`/`recommendation_runner.js`本身的
   `runAnalysis()`/`runRecommendation()`函式邏輯
3. `analysis_runner.js`/`recommendation_runner.js`的核心迴圈
   （依序呼叫每個模組、過濾`null`、組裝成最終Result）維持完全
   不變

### 明確禁止：Feature直接呼叫AI

`features/insight/`、`features/behavior/`、
`application/capabilities/`、`application/use_cases/`、
`application/workflows/`、`application_service.js`全部維持
「完全不知道AI是什麼」的既有邊界——AI只能存在於Analysis/
Recommendation Runner的模組層級，不能讓任何Feature/Workflow/
Capability/Use Case/Application Service直接import AI SDK或呼叫
AI Provider。這是延續Phase 3每一個Feature Boundary Review（
TASK1.66/1.72/1.73/1.74）已經反覆驗證過的「Feature Layer完全不
呼叫AI Provider」規則，Phase 4不會、也不應該打破這個邊界。

## Deterministic vs AI Logic Boundary（Review Scope 3）

| 應該保持deterministic | 未來可以AI-enhanced |
|---|---|
| Data Preparation（`data_preparation/`）——單純從資料庫讀取並整理既有記錄 | ❌ 不適合AI化——這是資料存取層，不涉及推論 |
| Insight Context Builder（`context/insight_context_builder.js`）——把Data Preparation的原始資料整理成標準Context形狀 | ❌ 不適合AI化——這是結構轉換，不涉及推論 |
| Analysis Runner的**核心迴圈**（依序呼叫模組、過濾null、組裝Result）| ❌ 迴圈本身維持deterministic |
| Analysis Runner的**個別模組**（`DEFAULT_ANALYSIS_MODULES`裡的6個現有模組） | ✅ 可以在既有模組之外，額外注入AI-enhanced模組（見上方AI Extension Point），現有6個模組本身不需要、也不應該改成呼叫AI |
| Recommendation Runner的**核心迴圈** | ❌ 迴圈本身維持deterministic |
| Recommendation Runner的**個別模組**（`DEFAULT_RECOMMENDATION_MODULES`裡的3個現有模組） | ✅ 同上，可以額外注入AI-enhanced模組，現有3個模組不需要改動 |
| Contract Layer（TASK1.63）、4個Result Builder | ❌ 不適合AI化——這些是純粹的資料形狀驗證/包裝工具 |
| Application Service/Capability/Use Case/Workflow/Feature Entry（Phase 3六層） | ❌ 不適合AI化——這些是流程協調層，不解讀業務內容 |

## Data Boundary（Review Scope 4）

確認結果：未來的AI Capability（無論實作在Analysis模組或
Recommendation模組層級）**不會**、也**不應該**直接接觸：

- **Database**：AI模組函式的簽名是`(insightContext) => ...`／
  `(analysisResult) => ...`，不接受`db`參數，Insight Context/
  Analysis Result裡的資料已經是Data Preparation階段從資料庫
  讀取並整理過的**唯讀快照**，AI模組只能讀取這份快照，無法
  自己發動任何資料庫查詢
- **Auth**：AI模組函式完全不接受`userId`以外的任何身分相關參數
  （`userId`本身也只會出現在更上層的Feature/Workflow/Capability/
  Use Case/Application Service，不會被傳遞到Analysis/
  Recommendation模組——目前`runAnalysis(insightContext, options)`
  跟`runRecommendation(analysisResult)`的簽名裡都沒有`userId`）
- **Session**：同上，AI模組完全不知道session/cookie/jwt是什麼

## Security Boundary

- AI Provider（Phase 4實際導入時）應該透過環境變數/密鑰管理注入
  API金鑰，不應該把金鑰硬編碼在任何模組檔案裡（這是一般安全
  常識，本次任務不涉及實際導入，這裡只是預先記錄要求）
- AI模組的輸出（`{type, value, source}`）在被組裝進最終Analysis
  Result/Recommendation Result之前，應該通過跟現有模組完全相同
  的null-filtering機制，確保AI模組回傳非預期格式時不會污染最終
  輸出（現有`analysis_runner.js`/`recommendation_runner.js`的
  迴圈邏輯已經對這種情況免疫，因為它只是簡單地把每個模組回傳值
  push進陣列或跳過null，不強制驗證模組回傳值的內部形狀——Phase 4
  若要加固這點，屬於未來任務範疇，本次規劃只指出這是既有行為）
- 本次任務**沒有**啟用任何AI SDK、**沒有**建立任何AI API
  Client、**沒有**呼叫Claude/OpenAI/DeepSeek，`.env`或
  `wrangler.toml`裡完全沒有新增任何AI相關的環境變數或secret

## Known Limitations

- 目前`DEFAULT_ANALYSIS_MODULES`/`DEFAULT_RECOMMENDATION_MODULES`
  是同步純函式（沒有`async`），若未來的AI模組需要非同步呼叫
  （例如`fetch()`呼叫AI Provider API），`analysis_runner.js`/
  `recommendation_runner.js`目前的迴圈實作（`for...of`同步呼叫
  每個模組）**需要**改成支援`async`模組（例如`await
  Promise.all(modules.map(...))`或依序`await`）——這是Phase 4
  真正導入AI時必然需要處理的既有限制，本次任務不修改
  `analysis_runner.js`/`recommendation_runner.js`本身（規格明確
  禁止修改Phase 2 Runtime Boundary），只在此記錄這個已知限制
  供Phase 4參考。
- `runAnalysis()`/`runRecommendation()`目前是同步函式簽名
  （`function runAnalysis(insightContext, options)`，不是
  `async function`），如果Phase 4需要讓Runtime整條鏈路支援
  非同步AI呼叫，這兩個函式簽名本身也需要改成`async`——這會是
  一個牽動Orchestrator（`intelligence_orchestrator.js`）呼叫端
  的改動，屬於Phase 4實際導入AI時的工作範圍，不在本次規劃任務
  內執行。
- 現有模組完全沒有逾時（timeout）、重試（retry）或錯誤降級
  （fallback到deterministic版本）機制——這些都是呼叫真實AI
  Provider時必須考慮的既有落差，本次規劃記錄下來，留給Phase 4
  實際導入時處理。

## 完成標準確認

- ✅ Phase 4 Capability Boundary明確（見上方「Capability
  Boundary」章節的責任切分）
- ✅ AI Extension Point明確（`analysis_runner.js`/
  `recommendation_runner.js`既有的`modules`依賴注入機制，見
  「AI Extension Point」章節）
- ✅ Runtime Boundary保持（本次任務完全沒有修改
  `src/intelligence/analysis/`、`src/intelligence/
  recommendation/`或其餘任何Phase 2 Runtime檔案）
- ✅ Application Pattern保持（本次任務完全沒有修改
  `src/intelligence/application/`底下任何Phase 3檔案）
- ✅ AI Provider未啟用
- ✅ 無Database改變

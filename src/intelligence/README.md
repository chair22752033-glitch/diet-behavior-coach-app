# Intelligence Layer（Phase 1 TASK 1.40，TASK1.56審查更新目錄結構/
Bootstrap Integration章節以反映目前狀態）

Phase 2 Intelligence Layer 的架構基礎——**本次任務不是 AI 功能開發**，目的是在
真正開始做任何分析/洞察/推薦功能之前，先把「未來這些能力該放在哪一層、
彼此之間該怎麼呼叫」的架構邊界確立下來，避免未來的 AI 能力直接耦合在
Controller 或 API Layer 上。

## 目錄結構（TASK1.56更新——反映TASK1.41~1.55新增的全部子目錄）

```
src/intelligence/
├── README.md
├── index.js                    # 統一輸出入口，re-export下面全部namespace
├── insight_service.js          # createInsightService({analysisEngine, recommendationEngine})：getUserInsight(userId, context)
├── analysis_engine.js          # createAnalysisEngine()：analyze(userData)（TASK1.40既有的inert占位engine）
├── recommendation_engine.js    # createRecommendationEngine()：recommend(insight)（同上）
├── contracts.js                 # InsightResponseContract / AnalysisResultContract / RecommendationResultContract + matchesContract()
├── contracts/                   # TASK1.42/1.47：Insight Context Contract、Execution Contract（3個）
│   ├── insight_context_contract.js
│   └── execution/
├── data_preparation/            # TASK1.41：從既有Domain Service蒐集+正規化使用者資料
├── context/                     # TASK1.42：組出通過驗證的Insight Context
├── analysis/                    # TASK1.43：deterministic分析模組框架
├── recommendation/              # TASK1.44：deterministic推薦模組框架
├── orchestration/                # TASK1.45：依固定順序協調前四層，組出Unified Intelligence Result
├── service/                      # TASK1.46：Application/API Layer跟Orchestrator之間的應用邊界
├── facade/                       # TASK1.48：Consumer跟Service之間的門面，建立Runtime Context
├── runtime/                      # TASK1.49：Runtime Context定義/建構（純函式，被Facade使用）
├── execution/                    # TASK1.50：Execution Manager，唯一的生命週期管理入口
├── events/                       # TASK1.51：Execution Event定義 + Event Dispatcher（純記憶體pub/sub）
├── history/                      # TASK1.52：Execution History Record定義 + 純記憶體History Store
├── monitoring/                   # TASK1.53：唯讀觀察者，查詢單次執行狀態/歷史
├── metrics/                      # TASK1.54：唯讀觀察者，跨執行的彙總統計數字
└── governance/                   # TASK1.55：完全無狀態的政策/治理邊界，未接入真實執行鏈
```

每個子目錄底下都有自己的`README.md`，記錄該層的責任、對外介面、跟
其他層的依賴方向；這份頂層README只負責總覽跟TASK1.40既有的三個
top-level檔案（`insight_service.js`/`analysis_engine.js`/
`recommendation_engine.js`/`contracts.js`），細節請見各子目錄自己的
文件。

## 分層位置與依賴規則

```
Controller
   ↓
Application Service
   ↓
Insight Service（這裡）
   ↓
Analysis Engine / Recommendation Engine（這裡）
   ↓
Future AI Provider Adapter（本次不建立）
```

明確禁止的兩種捷徑（本次任務的核心架構要求）：

- ❌ `Controller → AI Provider`：Controller 不可以跳過 Insight Service
  直接呼叫任何分析/推薦邏輯，更不可以直接呼叫任何 AI API。
- ❌ `Route → Intelligence Layer`：Router/route 檔案不可以直接 import
  `src/intelligence/` 底下任何檔案，一定要先經過 Controller →
  Application Service 這條既有鏈路。

目前**沒有任何 controller/route/service import 這個目錄**——這是純粹的
Phase 2 extension point，只有 `src/bootstrap/application.js` 會組裝出
`intelligence` namespace（見下方「Bootstrap Integration」），但沒有任何
既有 API 讀取它。

## insight_service.js — `createInsightService({analysisEngine, recommendationEngine})`

`getUserInsight(userId, context)` 是唯一對外的函式，責任是「接收
userId、組合分析需求、呼叫 analysis engine、呼叫 recommendation
engine」。目前**不得產生任何分析結果**，一律回傳固定的：

```js
{ ok: true, status: 'not_ready', data: null }
```

呼叫鏈本身確實會往下呼叫 `analysisEngine.analyze()` 與
`recommendationEngine.recommend()`（並把 `analyze()` 的輸出當作
`recommend()` 的輸入），證明依賴關係真的接通，但兩者現階段都只是
`not_implemented` 的 inert 占位結果，`getUserInsight()` 完全不會讀取、
組裝、或依賴它們的內容來決定自己的回傳值。

## analysis_engine.js — `createAnalysisEngine()`

`analyze(userData)` 未來負責行為分析、趨勢分析、Pattern detection。
目前**不得實作任何分析邏輯**，一律回傳固定的：

```js
{ status: 'not_implemented', result: null }
```

## recommendation_engine.js — `createRecommendationEngine()`

`recommend(insight)` 未來負責行動建議、個人化推薦。目前**不得產生任何
建議**，一律回傳固定的：

```js
{ status: 'not_implemented', recommendations: [] }
```

## contracts.js

定義三個回傳值形狀的規格資料（`InsightResponseContract` /
`AnalysisResultContract` / `RecommendationResultContract`）與
`matchesContract(contract, value)` 這個輕量的執行期形狀檢查函式，供測試
使用。這跟 `src/contracts/*.js`（HTTP route 的 `{request,response}`
契約）是不同性質的東西——這裡完全不含任何 HTTP 相關欄位（沒有 status
code、沒有 failureReasons），因為 Intelligence Layer 完全不知道
Request/Response 是什麼。

## 安全原則（跟 Domain Service Layer / Controller Layer 一致）

一律不允許：

- ❌ SQL / `db.prepare()` / 任何 D1 操作（不 import `src/db/` 底下任何檔案）
- ❌ HTTP 處理（不知道 Request/Response 是什麼、不 import 任何路由/adapter 檔案）
- ❌ Session 邏輯（不 import `src/auth/` 或 `src/identity/`）
- ❌ 任何 AI API 呼叫（不呼叫 `fetch()`、不 import 任何 AI SDK，不串接
  Claude/OpenAI/DeepSeek 或任何 model inference 服務）

## Bootstrap Integration（TASK1.56更新——反映目前16個欄位）

`src/bootstrap/application.js` 的 `createApplication(env)` 新增一個
`intelligence` namespace，目前（TASK1.55後）恰好具備16個欄位：

```js
{
  config, db, services, router, middleware,
  intelligence: {
    insightService, analysisEngine, recommendationEngine,   // TASK1.40
    dataPreparation,                                         // TASK1.41
    context,                                                  // TASK1.42
    analysis,                                                 // TASK1.43
    recommendation,                                           // TASK1.44
    orchestration,                                            // TASK1.45
    service,                                                  // TASK1.46
    facade,                                                   // TASK1.48
    execution,                                                // TASK1.50
    events,                                                   // TASK1.51
    history,                                                  // TASK1.52
    monitoring,                                               // TASK1.53
    metrics,                                                  // TASK1.54
    governance,                                               // TASK1.55
  },
}
```

真實的呼叫鏈（`facade → execution → service → orchestration →
[dataPreparation, context, analysis, recommendation]`）全部透過
依賴注入組裝，`execution`額外注入了`events`/`history`兩個實例
（供生命週期狀態轉換時emit事件/寫入歷史），`monitoring`/`metrics`
則各自注入跟`execution`共用的同一份`history`/`events`實例做唯讀
觀察，`governance`是唯一完全獨立、沒有被注入進真實呼叫鏈的欄位
（純粹的Phase 3 extension point，見
`src/intelligence/governance/README.md`）。全部欄位都是每次
`createApplication(env)` 呼叫時重新建立的獨立實例，不共用狀態。
**目前沒有任何 route/controller 讀取 `app.intelligence`**，純粹是
組裝好、放在那裡供 Phase 2 使用，不影響任何一條既有 route 的行為。

## Phase 3 Extension Point（TASK1.57新增——Ending Preparation Review
確認的四個未來接入口）

Phase 2 把整個Intelligence Runtime Foundation建好，但**刻意完全沒有
啟用任何AI功能**——未來Phase 3要導入真實的分析/推薦能力（例如接上
真正的AI Provider）時，明確只能從下面四個既有邊界其中之一接入，
全部都是既有的依賴注入(DI)組裝點，不需要新增任何檔案就能替換掉
內部實作：

1. **`intelligence.facade`**（`src/intelligence/facade/`，TASK1.48）
   ——未來的Controller/API Layer如果要用Intelligence功能，只能透過
   `facade.executeIntelligence(db, request)`這一個入口，不會、也
   不應該跳過Facade直接呼叫底下任何一層。
2. **`intelligence.service`**（`src/intelligence/service/`，
   TASK1.46）——應用層跟Orchestrator之間的邊界，`getIntelligence()`
   內部用Execution Contract驗證輸入/輸出形狀，未來真正的AI推論邏輯
   如果需要在這一層插入前處理/後處理，可以透過重新組裝
   `createIntelligenceService({orchestrator, resultBuilder})`的
   依賴注入參數達成，不需要修改Facade或Orchestrator。
3. **`intelligence.execution`**（Execution Manager，
   `src/intelligence/execution/`，TASK1.50）——生命週期管理邊界，
   未來如果需要在「執行中」加入額外的runtime控制（例如逾時、重試、
   熔斷），可以透過`createExecutionManager()`既有的依賴注入參數
   （`service`/`eventDispatcher`/`historyStore`）擴充，不需要更動
   Facade或Service對外的介面。
4. **`intelligence.governance`**（`src/intelligence/governance/`，
   TASK1.55）——目前完全獨立、沒有被接進真實呼叫鏈的政策邊界，
   是Phase 3最直接的接入點：未來要在「允許執行AI分析前」加入真正
   的業務規則（例如額度限制、使用者資格判斷）時，只需要擴充
   `execution_policy.js`的規則，再由Facade/Execution Manager透過
   依賴注入呼叫`governanceService.validateExecution()`，不需要改變
   Governance現有的`{status, allowed, reasons, metadata}`輸出格式。

**明確禁止的捷徑**（Phase 3導入AI Provider時同樣適用，TASK1.40既定
原則的延伸）：未來的AI Provider**不得**繞過上面四個邊界，直接進入
`src/controllers/`、`src/routes/`、`src/worker.js`、或
`src/services/`（既有Domain Service）——這四個Phase 2既有位置對
Intelligence Layer的存在完全不知情（`src/routes/`/`src/controllers/`/
`src/worker.js`/`src/services/`目前零個檔案import
`src/intelligence/`底下任何東西，只有`src/bootstrap/application.js`
一個組裝點），Phase 3必須維持這個邊界，不能為了接AI Provider而讓
Controller或Domain Service反過來認識Intelligence Layer的存在。

**TASK1.58補充（兩層Extension Point的精確定位）**：上面四點回答的是
「Phase 3的變更該從哪個既有邊界`接進呼叫鏈`」，這是給**執行流程控制**
（前處理/後處理/生命週期/政策）用的邊界。但**AI Provider/Model
本身的推論邏輯要塞在哪一個具體檔案**，答案更精確、範圍更小，只有
兩個地方：

1. **Analysis Extension Point**——`src/intelligence/analysis/
   analysis_runner.js`的`createAnalysisRunner(dependencies)`接受
   選填的`dependencies.modules`，覆蓋預設的
   `DEFAULT_ANALYSIS_MODULES`（六個純函式，各自把Insight Context
   裡既有的count欄位原樣包成一筆insight）。真正的AI分析邏輯應該
   實作成同樣簽章的模組函式（`(insightContext) => {type,value,
   source}|null`），透過`src/bootstrap/application.js`重新組裝
   `analysis.createAnalysisRunner({modules:[...]})`時注入，不需要
   修改`analysis_runner.js`本身一行程式碼。
2. **Recommendation Extension Point**——
   `src/intelligence/recommendation/recommendation_runner.js`的
   `createRecommendationRunner(dependencies)`是同樣的`modules`
   注入機制，覆蓋`DEFAULT_RECOMMENDATION_MODULES`。

這兩個Extension Point**不得**進入的地方（TASK1.58明確重申）：
`src/controllers/`、`src/routes/`、`src/worker.js`、
`src/auth/`/`src/oauth/`（Authentication）、`src/services/`
（既有Domain Service）——跟上面四點的禁止範圍一致，只是這裡額外
明確排除了Authentication，強調AI Provider/Model Integration
即使接進Analysis/Recommendation，也完全不需要、不應該知道使用者
是誰、有沒有登入，那些資訊在更早的Data Preparation階段就已經被
轉換成匿名的count/context數字，Analysis/Recommendation拿到的
輸入裡沒有任何身份相關欄位。

## Data Flow（單向資料流，TASK1.57確認）

```
Domain Data（既有五大Domain Service）
  ↓
Data Preparation（TASK1.41）── 蒐集 + 正規化
  ↓
Insight Context（TASK1.42）── 組出通過驗證的Context
  ↓
Analysis（TASK1.43）── deterministic分析（目前inert）
  ↓
Recommendation（TASK1.44）── deterministic推薦（目前inert）
  ↓
Execution Runtime（Orchestrator→Service→Execution Manager→Facade，
  TASK1.45/1.46/1.50/1.48）── 生命週期管理 + 統一輸出格式
```

`intelligence_orchestrator.js`的`runIntelligencePipeline()`程式碼
本身就是這個順序的直接體現（依序呼叫`dataPreparation.prepare()` →
`contextBuilder.buildInsightContext()` →
`analysisRunner.runAnalysis()` →
`recommendationRunner.runRecommendation()`，任何一步失敗立刻停止，
不會用不完整資料頂替繼續跑後面階段）——資料只往下游流動，沒有任何
一層會回頭呼叫它的上游（例如Analysis不會反過來呼叫Data
Preparation），這個順序自TASK1.45建立以來沒有被任何後續任務改變過。

## Ending Review 準備狀態（TASK1.57確認）

- **Runtime Layer完整性**：Input（Data Preparation）/Context
  （Insight Context）/Analysis/Recommendation/Execution
  （Execution Manager）/Runtime（Runtime Context）/Governance
  七個boundary全部存在且各自有獨立的README/index.js/測試套件。
- **Phase 3接入口明確**：見上方「Phase 3 Extension Point」四點。
- **無未閉合邊界**：TASK1.56的Runtime Architecture Review已程式化
  驗證整個`src/intelligence/`零循環依賴、export一致、Execution
  Manager維持唯一lifecycle入口、Governance維持完全獨立無狀態。
- **Security Boundary**：整個Intelligence Layer完全不import
  `src/auth/`/`src/oauth/`/`src/identity/`/`src/middleware/`，不
  解析session/cookie/JWT，不呼叫`requireAuth()`。
- Phase 2 Intelligence Runtime Foundation**已具備進入Ending
  Review的條件**。

## Phase 2 Ending Documentation（TASK1.58——Final Validation & Ending
Review正式產出）

這是Phase 2的正式結案文件，總結「Phase 2做了什麼、邊界在哪裡、
Phase 3該從哪裡接」，供未來任何人（包含未來的Phase 3任務）不需要
重新爬梳TASK1.40~1.57全部commit history就能理解目前狀態。

### Completed Layers（14個，依建立順序）

| # | Layer | 目錄 | 建立於 | 對外唯一入口 |
|---|-------|------|--------|-------------|
| 1 | Data Preparation | `data_preparation/` | TASK1.41 | `createDataPreparationService().prepare()` |
| 2 | Context | `context/` | TASK1.42 | `createInsightContextBuilder().buildInsightContext()` |
| 3 | Analysis | `analysis/` | TASK1.43 | `createAnalysisRunner().runAnalysis()` |
| 4 | Recommendation | `recommendation/` | TASK1.44 | `createRecommendationRunner().runRecommendation()` |
| 5 | Orchestration | `orchestration/` | TASK1.45 | `createIntelligenceOrchestrator().runIntelligencePipeline()` |
| 6 | Service | `service/` | TASK1.46 | `createIntelligenceService().getIntelligence()` |
| 7 | （Execution Contract，非獨立layer，是Service的驗證工具） | `contracts/execution/` | TASK1.47 | 三個`validateXxx()`純函式 |
| 8 | Facade | `facade/` | TASK1.48 | `createIntelligenceFacade().executeIntelligence()` |
| 9 | Runtime（Context） | `runtime/` | TASK1.49 | `createRuntimeContext()` |
| 10 | Execution（Manager） | `execution/` | TASK1.50 | `createExecutionManager().execute()` |
| 11 | Events | `events/` | TASK1.51 | `createEventDispatcher()` |
| 12 | History | `history/` | TASK1.52 | `createHistoryStore()` |
| 13 | Monitoring | `monitoring/` | TASK1.53 | `createExecutionMonitor()`（唯讀） |
| 14 | Metrics | `metrics/` | TASK1.54 | `createExecutionMetrics()`（唯讀） |
| 15 | Governance | `governance/` | TASK1.55 | `createGovernanceService().validateExecution()`（未接入真實呼叫鏈） |

（表格列了15列是因為Execution Contract不算獨立layer；規格列出的
14個Layer是扣掉Execution Contract後的計數。）

### Dependency Direction（總結）

```
Facade → Execution Manager → Service → Orchestrator
                                          ↓
                        [Data Preparation → Context → Analysis → Recommendation]

Execution Manager ──(DI，選填)──→ Events / History
Events / History ──(DI，唯讀)──→ Monitoring、Metrics
Governance：完全獨立，未被任何上述箭頭指向或指出
```

嚴格單向、零循環依賴（TASK1.56/1.57已程式化驗證）。`src/bootstrap/
application.js`是唯一的組裝點，`src/controllers/`/`src/routes/`/
`src/worker.js`/`src/services/`零個檔案認識`src/intelligence/`
的存在。

### Phase 3 Extension Point（總結，完整說明見上方兩個章節）

- **執行流程控制**（前處理/後處理/生命週期/政策）：Facade/Service/
  Execution Manager/Governance四個既有DI組裝點。
- **AI Provider/Model推論邏輯本身**：只有Analysis Extension Point
  （`analysis_runner.js`的`dependencies.modules`）跟Recommendation
  Extension Point（`recommendation_runner.js`的
  `dependencies.modules`）兩個精確位置。
- 兩者都**不得**進入Controller/Route/Worker/Authentication/Domain
  Service。

### Known Limitations（Phase 2刻意未做、留給Phase 3的事）

- `analysisEngine`/`recommendationEngine`/`insightService`（TASK1.40
  建立的最早期占位物件）**沒有**被接進TASK1.45起建立的真實呼叫鏈
  （Facade→ExecutionManager→Service→Orchestrator），兩條路徑目前
  是平行、互不相干的——`app.intelligence.insightService`
  `.getUserInsight()`永遠回傳`{ok:true, status:'not_ready',
  data:null}`，不會受Phase 3在Analysis/Recommendation
  Extension Point的任何修改影響。Phase 3應該以
  Facade→ExecutionManager→Service→Orchestrator這條路徑為準，
  `insightService`/`analysisEngine`/`recommendationEngine`三者
  是否要保留、汰換、或整併，留給未來任務決定。
- Governance Layer（TASK1.55）建立後**完全沒有被接進**
  Facade/Execution Manager的真實呼叫鏈——目前呼叫
  `executionManager.execute()`不會經過任何Governance檢查。Phase 3
  如果要啟用真正的執行前政策檢查，需要明確新增一個任務去做「把
  Governance接進Execution Manager」這件事，這不會在沒有專屬任務的
  情況下自動發生。
- 整個Intelligence Layer目前**沒有任何route/controller讀取**
  `app.intelligence`——所有16個欄位都只是組裝好放在
  `src/bootstrap/application.js`裡，沒有任何使用者可見的功能受
  Phase 2影響。
- D1裡的`users`/`sessions`/全部domain表/`auth_audit_logs`從Phase 2
  開始建立至今（TASK1.40~1.58）恆為0筆——Phase 2完全是Cloudflare
  Worker既有生產環境之外的、獨立的程式碼新增，沒有任何一次測試或
  審查在真實資料庫留下痕跡。

## Phase 3 Application Architecture Plan（TASK1.59——架構規劃，
不是實作）

Phase 2把整個Intelligence Runtime Foundation建好、也確認了它已具備
Ending Review的條件（TASK1.56~1.58）。這一節是Phase 3正式開始前的
**架構規劃**——本身**不是新功能、不是AI功能、不修改任何Phase 2既有
檔案的行為**，只是把「Phase 3該怎麼安全地使用Phase 2成果」寫清楚，
供未來實際動手實作Phase 3時依循。

### 1. Phase 3 Architecture Boundary（確認呼叫鏈方向合理）

```
User Application（Phase 3未來要建立，目前不存在）
  ↓
Intelligence Facade（Phase 2既有，src/intelligence/facade/）
  ↓
Intelligence Service（Phase 2既有，src/intelligence/service/）
  ↓
Execution Runtime（Phase 2既有：Execution Manager→Orchestrator）
  ↓
Analysis / Recommendation Extension（Phase 2既有的modules注入機制）
```

這條鏈路合理，原因：
- 每一層都已經在Phase 2被建好、被測試過（TASK1.48/1.46/1.50/1.45/
  1.43/1.44），Phase 3不需要重新設計任何一層的介面。
- User Application是唯一「Phase 3需要新增」的東西，而且它只需要
  認識**一個**介面：`facade.executeIntelligence(db, request)`。
  User Application完全不需要、也不應該知道Intelligence Service/
  Execution Manager/Orchestrator/Analysis/Recommendation的存在，
  這是Facade Pattern存在的目的。
- 這條鏈路跟TASK1.45起建立、TASK1.56/1.57/1.58反覆驗證過的既有
  Data Flow（Domain Data→Data Preparation→Insight Context→
  Analysis→Recommendation→Execution Runtime）完全相容，只是這裡
  額外在最上面加了一層「User Application」，不改變Execution
  Runtime以下的任何東西。

### 2. AI Provider Extension Point（重申並收斂TASK1.58的結論）

未來Phase 3如果要導入真正的AI Provider（呼叫Claude/OpenAI/
DeepSeek或任何model inference服務），**只能**進入下面兩個具體
位置，不能有第三個：

- **`src/intelligence/analysis/analysis_runner.js`的
  `dependencies.modules`**——把AI分析邏輯包成一個
  `(insightContext) => {type,value,source}|null`函式，加進（或
  取代）`DEFAULT_ANALYSIS_MODULES`陣列。
- **`src/intelligence/recommendation/recommendation_runner.js`的
  `dependencies.modules`**——同樣的機制，`(analysisResult) =>
  {type,value,source}|null`函式。

**不得**進入（TASK1.59重申，範圍跟TASK1.58一致）：
`src/routes/`、`src/controllers/`、`src/worker.js`、
`src/auth/`/`src/oauth/`（Authentication）、`src/services/`
（既有Domain Service）。原因：這五個位置目前對Intelligence Layer
完全不知情（零import），AI Provider如果被塞進這五個位置，會需要
讓這些位置反過來認識Intelligence Layer的內部細節，破壞Phase 2
建立的「Application/Domain Service不知道Intelligence存在」邊界。

### 3. Application Usage Boundary（未來使用者功能該怎麼取得
Intelligence Result）

未來的使用者功能（例如「查看我的健康分析報告」）取得Intelligence
Result的**唯一**合法路徑：

```
Controller（Phase 3未來新增）
  ↓
app.intelligence.facade.executeIntelligence(db, { userId, ... })
  ↓
{ ok, data: { status, result: { context, analysis, recommendation }, metadata } }
```

Application Layer（未來的Controller/Route）**不得直接操作**：
- `app.intelligence.execution`（Execution Manager的
  `execute()`）——生命週期管理是Facade內部的細節，Controller不需要
  知道「執行到哪個狀態」。
- `app.intelligence.history`（History Store的`add()`/`get()`/
  `list()`）——歷史紀錄是Runtime Layer的內部觀測機制，不是使用者
  功能該讀取的資料來源。
- `app.intelligence.metrics`（Execution Metrics的
  `getMetrics()`/`getExecutionMetrics()`）——統計數字是給維運/
  監控看的，不是終端使用者功能的一部分。

如果未來真的需要「給使用者看執行歷史」或「給維運看統計儀表板」這種
功能，那是**獨立的、明確的新任務**（例如一個专门的Admin/Ops
API），不應該悄悄地讓一般使用者功能繞過Facade直接讀取
`intelligence.history`/`intelligence.metrics`。

### 4. Dependency Direction（Phase 3新增內容必須維持的方向）

```
Application（Phase 3新增：Controller/Route/未來的User-facing功能）
  ↓
Intelligence（Phase 2既有：Facade→Service→Execution Runtime→
              Analysis/Recommendation）
  ↓
Domain Data（既有五大Domain Service→D1）
```

**不得反向依賴**：
- Domain Service（`src/services/`）不得import
  `src/intelligence/`（維持TASK1.41既定的「Data Preparation依賴
  Domain Service，不是反過來」方向）。
- Intelligence Layer任何一個子層都不得import Phase 3未來新增的
  Controller/Route檔案（維持「下層不知道上層存在」）。
- Phase 3新增的AI Provider實作（未來的analysis/recommendation
  modules）不得反過來import`src/controllers/`、`src/routes/`、
  `src/auth/`、`src/oauth/`、`src/services/`——AI Provider只應該
  依賴它接收到的純資料輸入（`insightContext`/`analysisResult`），
  不應該有能力去查詢使用者身份或直接存取Domain Data。

### Phase 3 Readiness Checklist

- ✅ Phase 3架構方向明確（見上方1~4點）
- ✅ AI Extension Point明確（只有Analysis/Recommendation modules
  兩個位置）
- ✅ Application Boundary明確（只透過Facade，不直接碰execution/
  history/metrics）
- ✅ 本次規劃沒有啟用任何AI功能、沒有修改Phase 2既有任何檔案的行為
- ✅ 可以正式進入Phase 3 Development

## 測試方式

`backups/phase1-task1.40-intelligence-foundation/test_intelligence_foundation.mjs`：
純記憶體測試，完全不連線任何真實或本機模擬的資料庫，不呼叫任何 AI API
或 `fetch()`，不建立任何真實使用者 session。

**TASK1.56更新**：每個後續任務（TASK1.41~1.55）都在
`backups/phase1-task1.4X.../`、`backups/phase1-task1.5X.../`底下
新增了自己專屬的測試套件（`test_*.mjs`），全部延續同一個「純記憶體、
不連線真實資料庫、不呼叫AI API、每次任務結束都跑一次全倉庫回歸
掃描」的既有慣例。`backups/phase1-task1.56-runtime-review/
test_runtime_architecture_review.mjs`是這條測試鏈最新的一份，專門
驗證整個`src/intelligence/`的namespace一致性/dependency boundary/
無循環依賴/無跨層直接引用，而不是驗證某一個特定子層的業務邏輯。

**TASK1.57更新**：`backups/phase1-task1.57-ending-preparation/
test_phase2_ending_review.mjs`延續TASK1.56的審查手法，額外驗證
「Phase 2 Layer完整性」「Phase 3 Extension Point是否明確」「Data
Flow是否維持單向」「Security Boundary（Auth/OAuth/Session/User
Identity Provider）」——是Phase 2結束前最後一份測試套件，通過後
即代表可以進入Ending Review，往後任何Phase 3的變更都應該從上面
「Phase 3 Extension Point」列出的四個既有邊界接入，而不是回頭修改
Phase 2既有的任何一個檔案。

**TASK1.58更新（Phase 2最終驗證，最後一份測試套件）**：
`backups/phase1-task1.58-phase2-ending/
test_phase2_final_validation.mjs`是Phase 2正式結束前的最終驗證，
在TASK1.56/1.57既有的架構審查基礎上，額外明確驗證「Analysis/
Recommendation Extension Point」（`dependencies.modules`注入機制）
確實可用、且Application/Runtime/Pipeline三層各自的職責邊界（見上方
「Phase 2 Ending Documentation」）沒有被混淆。這份測試通過後，
Phase 2 Intelligence Runtime Foundation正式結束，往後的Intelligence
相關任務屬於Phase 3，應該從本文件「Phase 3 Extension Point」/
「Phase 2 Ending Documentation」列出的既有邊界接入，不應該回頭修改
`src/intelligence/`底下任何Phase 2既有檔案的行為。

**TASK1.59更新（Phase 3架構規劃，第一份Phase 3任務）**：
`backups/phase2-task1.59-phase3-planning/
test_phase3_architecture_plan.mjs`是Phase 3正式開始的第一份測試
套件——本身**不是實作**，驗證的是上方「Phase 3 Application
Architecture Plan」規劃的四個邊界（Phase 3 Architecture Boundary/
AI Provider Extension Point/Application Usage Boundary/Dependency
Direction）目前都還維持著（因為Phase 3實際上還沒開始動工，這些
邊界目前全部是「規劃正確、且現狀沒有違反」的雙重確認），同時再次
確認Phase 2既有的全部Layer/測試/D1狀態完全沒有被這次規劃任務動到
一根汗毛。往後實際開始寫Phase 3程式碼時，應該持續維持這份規劃
定義的邊界，任何違反（例如AI Provider邏輯跑進Controller、
Application Layer直接讀`intelligence.history`）都應該被視為架構
回歸。

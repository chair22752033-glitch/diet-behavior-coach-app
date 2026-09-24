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

# Intelligence Layer（Phase 1 TASK 1.40）

Phase 2 Intelligence Layer 的架構基礎——**本次任務不是 AI 功能開發**，目的是在
真正開始做任何分析/洞察/推薦功能之前，先把「未來這些能力該放在哪一層、
彼此之間該怎麼呼叫」的架構邊界確立下來，避免未來的 AI 能力直接耦合在
Controller 或 API Layer 上。

## 目錄結構

```
src/intelligence/
├── README.md
├── insight_service.js         # createInsightService({analysisEngine, recommendationEngine})：getUserInsight(userId, context)
├── analysis_engine.js           # createAnalysisEngine()：analyze(userData)
├── recommendation_engine.js       # createRecommendationEngine()：recommend(insight)
├── contracts.js                     # InsightResponseContract / AnalysisResultContract / RecommendationResultContract + matchesContract()
└── index.js                           # 統一輸出入口
```

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

## Bootstrap Integration

`src/bootstrap/application.js` 的 `createApplication(env)` 新增一個
`intelligence` namespace：

```js
{
  config, db, services, router, middleware,
  intelligence: { insightService, analysisEngine, recommendationEngine },
}
```

`insightService` 是用 `analysisEngine`/`recommendationEngine` 組裝出來的
（依賴注入），三者都是每次 `createApplication(env)` 呼叫時重新建立的
獨立實例，不共用狀態。**目前沒有任何 route/controller 讀取
`app.intelligence`**，純粹是組裝好、放在那裡供 Phase 2 使用，不影響任何
一條既有 route 的行為。

## 測試方式

`backups/phase1-task1.40-intelligence-foundation/test_intelligence_foundation.mjs`：
純記憶體測試，完全不連線任何真實或本機模擬的資料庫，不呼叫任何 AI API
或 `fetch()`，不建立任何真實使用者 session。

# Insight Analysis Framework Foundation（Phase 1 TASK 1.43）

Insight Context（TASK1.42）與 Recommendation Engine（TASK1.40）之間的
穩定分析邊界。**本次任務不是AI功能開發**，目的是先建立一個
deterministic 的分析框架骨架——能接收結構化 context、跑一組
deterministic 分析模組、回傳結構化的分析結果，完全不含任何AI依賴、
自然語言生成、或建議邏輯。

## 目錄結構

```
src/intelligence/analysis/
├── README.md
├── analysis_runner.js           # createAnalysisRunner()：runAnalysis(insightContext, options)
├── analysis_result_builder.js     # createAnalysisResultBuilder()：buildAnalysisResult(insights, options)
└── index.js                         # 統一輸出入口
```

## 分層位置

```
Insight Context（TASK1.42）
   ↓
Analysis Runner（這裡）
   ↓
Analysis Result Contract（analysis_result_builder.js）
   ↓
Recommendation Engine（TASK1.40，本次不修改、不串接）
```

目前**沒有任何 controller/route import 這個目錄**，`src/intelligence/
insight_service.js`（TASK1.40/1.42既有）本次也完全沒有被修改成會呼叫
這裡——這是純粹的 Phase 2 extension point，只有
`src/bootstrap/application.js` 會組裝出 `intelligence.analysis`。

## analysis_runner.js — `createAnalysisRunner(dependencies)`

`runAnalysis(insightContext, options)` 先用 TASK1.42 既有的
`validateInsightContext()` 驗證輸入，通過後依序執行一組
`DEFAULT_ANALYSIS_MODULES`（每個模組是 `(context) => insight|null` 的
純函式），把非 null 的結果組合成單一 Analysis Result。

內建的預設模組刻意只做「把 Insight Context 裡本來就有的 `count` 欄位
原樣包成一筆 insight」這種最保守的 deterministic 轉換——沒有加總以外
的任何計算、沒有判斷「多還是少」、沒有任何門檻值比較，避免不小心就
變成事實上的分析/推薦邏輯。真正的分析邏輯留給未來任務決定要不要、
怎麼加。

**規則**：
- `deterministic`：同樣的 Insight Context 輸入，任何時候呼叫都得到
  完全相同的 Analysis Result
- 只消費 Insight Context（TASK1.42 的輸出），完全不 import
  `src/services/`、`src/db/` 底下任何檔案（這個檔案甚至不接受 `db`
  參數）
- 不處理 HTTP、不處理 Session（不 import `src/auth/`/`src/identity/`）
- `dependencies.modules` 可覆蓋預設模組清單，供測試/未來擴充使用

## analysis_result_builder.js — `createAnalysisResultBuilder()`

`buildAnalysisResult(insights, options)` 定義穩定的輸出格式：

```js
{
  status: "analysis_ready",
  insights: [{ type, value, source }],
  metadata: { generatedAt, version },
}
```

**規則**（規格明確要求）：
- **no natural language generation**：不產生任何自然語言字串/句子
- **no recommendation**：不產生任何建議
- **no scoring unless explicitly deterministic from existing data**：
  `insights[].value` 一律是既有資料裡本來就有的、或用固定公式（例如
  count）算出來的 deterministic 數值，不是新算出來的主觀分數
- **predictable output**：純函式，完全不讀取 `Date.now()`/
  `Math.random()`——`metadata.generatedAt` 刻意不在這裡內部產生（那會
  讓輸出不再 deterministic），一律由呼叫端透過 `options.generatedAt`
  明確傳入，沒有提供時安全預設為 `null`

## Bootstrap Integration

`src/bootstrap/application.js` 的 `intelligence` namespace 新增
`analysis`：

```js
{
  insightService, analysisEngine, recommendationEngine,
  dataPreparation, context, analysis: createAnalysisRunner(),
}
```

跟其餘 intelligence 元件一樣，每次 `createApplication(env)` 呼叫都重新
建立獨立實例。**目前沒有任何 route/controller 讀取
`app.intelligence.analysis`**，`insightService` 本次也沒有被修改成會
呼叫它。

## 跟 TASK1.40 `analysisEngine` 的關係

`src/intelligence/analysis_engine.js`（TASK1.40）目前仍然是純
`{status:'not_implemented', result:null}` 的介面佔位，`insightService`
的 `getUserInsight()` 呼叫的是那個佔位。這裡（TASK1.43）建立的是
「真正會做 deterministic 轉換」的分析框架骨架，兩者刻意分開、互不
取代——`insightService` 本次沒有被修改，也還沒有任何呼叫端使用
`intelligence.analysis`，留給未來任務決定怎麼收斂/串接。

## 測試方式

`backups/phase1-task1.43-analysis-framework/test_analysis_framework.mjs`：
純記憶體測試，完全不連線任何真實或本機模擬的資料庫，不呼叫任何 AI API
或 `fetch()`，不建立任何真實使用者 session。

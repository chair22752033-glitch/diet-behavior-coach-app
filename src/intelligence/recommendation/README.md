# Recommendation Framework Foundation（Phase 1 TASK 1.44）

Analysis Result（TASK1.43）與未來 AI Provider 之間的穩定推薦邊界。
**本次任務不是AI推薦開發**，目的是先建立一個 deterministic 的推薦框架
骨架——能接收結構化的 Analysis Result、跑一組 deterministic 推薦模組、
回傳結構化的推薦結果，完全不含任何AI依賴、自然語言生成、教練式語氣、
或健康建議。

## 目錄結構

```
src/intelligence/recommendation/
├── README.md
├── recommendation_runner.js           # createRecommendationRunner()：runRecommendation(analysisResult)
├── recommendation_result_builder.js     # createRecommendationResultBuilder()：buildRecommendationResult(recommendations)
└── index.js                               # 統一輸出入口
```

## 分層位置

```
Insight Context（TASK1.42）
   ↓
Analysis Framework（TASK1.43）
   ↓
Analysis Result Contract
   ↓
Recommendation Runner（這裡）
   ↓
Recommendation Result Contract（recommendation_result_builder.js）
```

目前**沒有任何 controller/route import 這個目錄**，`src/intelligence/
insight_service.js`（TASK1.40/1.42既有）本次也完全沒有被修改成會呼叫
這裡——這是純粹的 Phase 2 extension point，只有
`src/bootstrap/application.js` 會組裝出 `intelligence.recommendation`。

## recommendation_runner.js — `createRecommendationRunner(dependencies)`

`runRecommendation(analysisResult)` 先驗證輸入是否符合 TASK1.43
`analysis_result_builder.js` 實際產生的 `{status, insights, metadata}`
形狀，通過後依序執行一組 `DEFAULT_RECOMMENDATION_MODULES`（每個模組是
`(analysisResult) => recommendation|null` 的純函式），把非 null 的結果
組合成單一 Recommendation Result。

> **注意**：這裡的輸入驗證是針對 TASK1.43 真正產生的形狀獨立寫的，
> 刻意不重用 `src/intelligence/contracts.js`（TASK1.40）裡舊版的
> `AnalysisResultContract`/`matchesContract()`——那組定義的是
> `{status, result}` 形狀，對應的是 `analysis_engine.js`（TASK1.40）
> 那個仍為 inert 占位的介面，跟 TASK1.43 真正產生的 Analysis Result
> 形狀不同，重用會造成錯誤的驗證結果。這是一項已知、低風險的架構
> 觀察（不影響正確性——兩者從未被同一段程式碼混用過），這裡只記錄
> 觀察，不修改 `src/intelligence/contracts.js`（不在本次任務範圍內），
> 留給未來任務決定是否要統一收斂 Analysis Result 的contract定義。

內建的預設模組刻意只做「把 Analysis Result 裡本來就有的欄位值/陣列
長度，原樣包成一筆 recommendation」這種最保守的 deterministic 轉換
——沒有任何門檻值比較、沒有健康建議、沒有教練式語氣、沒有對話文字，
避免變成事實上的AI推薦邏輯。真正的推薦邏輯留給未來任務決定要不要、
怎麼加。

**規則**：
- `deterministic`：同樣的 Analysis Result 輸入，任何時候呼叫都得到
  完全相同的 Recommendation Result
- 只消費 Analysis Result（作為參數傳入），完全不 import
  `src/intelligence/analysis/` 底下任何檔案（不直接耦合 Analysis
  Framework 的實作）
- 不 import `src/services/`、`src/db/` 底下任何檔案（這個檔案甚至不
  接受 `db` 參數）
- 不處理 HTTP、不處理 Session（不 import `src/auth/`/`src/identity/`）
- `dependencies.modules` 可覆蓋預設模組清單，供測試/未來擴充使用

## recommendation_result_builder.js — `createRecommendationResultBuilder()`

`buildRecommendationResult(recommendations)` 定義穩定的輸出格式：

```js
{
  status: "recommendation_ready",
  recommendations: [{ type, value, source }],
  metadata: { version },
}
```

**規則**（規格明確要求）：
- **structured output only**：只回傳結構化資料，不是任何字串
- **no conversational text**：不產生任何對話式文字
- **no user coaching language**：不產生任何教練/指導語氣的內容
- **no health advice generation**：不產生任何健康建議
- **no scoring unless explicitly deterministic from existing analysis
  output**：`recommendations[].value` 一律是既有 Analysis Result 裡
  本來就有的、或用固定公式（例如陣列長度）算出來的 deterministic
  數值，不是新算出來的主觀分數
- 純函式：跟 TASK1.43 `analysis_result_builder.js` 不同，這裡的
  `metadata` 規格範例只有 `version` 一個欄位（沒有 `generatedAt`），
  完全不需要任何「呼叫端明確傳入時間戳」的機制，天生就是 100%
  deterministic，不接受任何 `options` 參數

## Bootstrap Integration

`src/bootstrap/application.js` 的 `intelligence` namespace 新增
`recommendation`：

```js
{
  insightService, analysisEngine, recommendationEngine,
  dataPreparation, context, analysis,
  recommendation: createRecommendationRunner(),
}
```

跟其餘 intelligence 元件一樣，每次 `createApplication(env)` 呼叫都重新
建立獨立實例。**目前沒有任何 route/controller 讀取
`app.intelligence.recommendation`**，`insightService` 本次也沒有被
修改成會呼叫它。

## 跟 TASK1.40 `recommendationEngine` 的關係

`src/intelligence/recommendation_engine.js`（TASK1.40，注意檔名跟這個
目錄不同）目前仍然是純 `{status:'not_implemented', recommendations:[]}`
的介面佔位，`insightService` 的 `getUserInsight()` 呼叫的是那個佔位。
這裡（TASK1.44）建立的是「真正會做 deterministic 轉換」的推薦框架
骨架，兩者刻意分開、互不取代——`insightService` 本次沒有被修改，也
還沒有任何呼叫端使用 `intelligence.recommendation`，留給未來任務決定
怎麼收斂/串接。

## 測試方式

`backups/phase1-task1.44-recommendation-framework/test_recommendation_framework.mjs`：
純記憶體測試，完全不連線任何真實或本機模擬的資料庫，不呼叫任何 AI API
或 `fetch()`，不建立任何真實使用者 session。

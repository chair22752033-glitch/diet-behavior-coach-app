# Intelligence Orchestration Layer（TASK 1.45）

## 目的

這一層是 Phase 2 Intelligence 四個既有子層（Data Preparation → Insight
Context → Analysis Framework → Recommendation Framework）之間的**單一協調
邊界**——負責固定執行順序、把每一層的輸出接成下一層的輸入、最後組出一份
單一的 Unified Intelligence Result。

**這個任務不是 AI 功能開發**：Intelligence Orchestrator 完全不做推論、
分類、摘要、評分或建議，純粹是依序呼叫既有四個子層並原樣傳遞資料。

## 架構位置

```
User Data
  ↓
Data Preparation（TASK1.41）
  ↓
Insight Context（TASK1.42）
  ↓
Analysis Runner（TASK1.43）
  ↓
Recommendation Runner（TASK1.44）
  ↓
Intelligence Orchestrator（這裡）
  ↓
Unified Intelligence Result
```

## 檔案

- `intelligence_orchestrator.js`：`createIntelligenceOrchestrator(dependencies)`，
  透過依賴注入拿到 `dataPreparation`/`contextBuilder`/`analysisRunner`/
  `recommendationRunner` 四個既有子層實例，`runIntelligencePipeline(db, userId, options)`
  依序執行：
  1. `dataPreparation.prepare(db, userId, options)`
  2. `contextBuilder.buildInsightContext(prepared.context)`
  3. `analysisRunner.runAnalysis(context, options)`
  4. `recommendationRunner.runRecommendation(analysisResult)`

  任何一步失敗都立刻回傳失敗結果並停止，不會用不完整/未驗證的資料頂替
  繼續往下跑。
- `orchestration_result_builder.js`：`createOrchestrationResultBuilder()`，
  `buildOrchestrationResult({context, analysis, recommendation})` 定義穩定
  輸出格式：

  ```js
  {
    status: "intelligence_ready",
    context,
    analysis,
    recommendation,
    metadata: { version },
  }
  ```

  純函式，完全不讀取 `Date.now()`/`Math.random()`，`metadata` 只有
  `version` 一個欄位（沒有 `generatedAt`），不接受 `options` 參數，天生
  100% deterministic。
- `index.js`：統一輸出 `createIntelligenceOrchestrator`/
  `createOrchestrationResultBuilder`。

## 規則

- **deterministic**：同樣的輸入（db 回傳同樣的資料、同樣的
  userId/options），任何時候呼叫都得到完全相同的 Unified Intelligence
  Result。
- **no AI logic**：不做任何推論/分類/摘要/評分/建議，純粹協調既有四個
  子層。
- **no HTTP**：不 import 任何路由/controller，不知道 Request/Response
  是什麼。
- **no SQL**：不 import `src/db/` 底下任何檔案；`db` 只是原樣轉交給
  `dataPreparation.prepare()` 的參數，orchestrator 本身完全不知道其
  內部結構。
- **no session parsing**：不 import `src/auth/` 或 `src/identity/`。
- **no direct Domain Service access**：不 import `src/services/` 底下
  任何檔案。所有資料都必須先經過既有的 Intelligence Layer 邊界
  （`dataPreparation` → `contextBuilder` → `analysisRunner` →
  `recommendationRunner`），這裡只透過依賴注入拿到四個子層的實例，完全
  不繞過它們直接存取 Domain Service 或 D1。

## 跟既有子層的關係

Orchestrator **不重新實作**任何一個子層的邏輯，只是依序呼叫它們既有的
公開介面：

- `dataPreparation.prepare()`（TASK1.41）
- `contextBuilder.buildInsightContext()`（TASK1.42）
- `analysisRunner.runAnalysis()`（TASK1.43）
- `recommendationRunner.runRecommendation()`（TASK1.44）

四個子層彼此之間依然保持互不 import 的獨立性（例如
`recommendation_runner.js` 依然不 import `analysis/`）；只有這個
Orchestration Layer 知道完整的執行順序，並透過依賴注入把它們串起來。

## 目前狀態

- `src/intelligence/index.js` 新增 `orchestration` namespace re-export。
- `src/bootstrap/application.js` 新增 `application.intelligence.orchestration`，
  組裝 `createIntelligenceOrchestrator()` 實例，注入跟其他
  `intelligence.*` 欄位相同的 `dataPreparationService`/
  `insightContextBuilder`/`analysisRunner`/`recommendationRunner` 實例
  （不是各自獨立建立第二份）。
- `insight_service.js` 本次完全沒有被修改——Orchestrator 是跟
  `insightService` 平行、各自獨立掛在 `intelligence` namespace 底下的
  extension point，沒有任何 route/controller 讀取它，留給未來任務決定
  怎麼串接成使用者可見的功能。

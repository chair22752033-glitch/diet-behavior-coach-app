# Intelligence Application Service Layer（TASK 1.46）

## 目的

這一層是未來 Application/API Layer 跟 Phase 2 Intelligence Pipeline 之間
的**穩定應用邊界**——呼叫端只需要知道 `getIntelligence(db, request)`
這一個介面，完全不需要知道底下實際上是由 Intelligence Orchestrator
（TASK1.45）協調 Data Preparation → Insight Context → Analysis →
Recommendation 四個階段組成。

**這個任務不是 AI 功能開發**：Intelligence Service 完全不做推論、分類、
摘要、評分或建議，純粹是驗證輸入、呼叫 Orchestrator、把結果包成穩定的
服務層回傳格式。

## 架構位置

```
Application Layer（未來的Controller/API）
  ↓
Intelligence Service（這裡）
  ↓
Intelligence Orchestrator（TASK1.45）
  ↓
Data Preparation → Insight Context → Analysis → Recommendation
```

## 檔案

- `intelligence_service.js`：`createIntelligenceService(dependencies)`，
  透過依賴注入拿到 `orchestrator`（TASK1.45的
  `createIntelligenceOrchestrator()`實例）。`getIntelligence(db, request)`：
  1. 驗證 `request`（只檢查 `userId` 是否為非空字串，`options`
     完全不解讀）
  2. 呼叫 `orchestrator.runIntelligencePipeline(db, request.userId, request.options)`
  3. 成功時回傳 `{ok:true, data: <Unified Intelligence Result>}`；
     失敗時回傳 `{ok:false, reason}`

  任何一步失敗都立刻回傳失敗結果並停止，不會用不完整的資料頂替繼續
  執行。
- `service_result_builder.js`：`createServiceResultBuilder()`，
  `buildSuccessResult(result)`/`buildFailureResult(reason)` 定義穩定
  輸出格式：

  ```js
  // 成功
  { ok: true, data: { status, context, analysis, recommendation, metadata } }

  // 失敗
  { ok: false, reason }
  ```

  純函式，完全不讀取 `Date.now()`/`Math.random()`，只是把 Orchestrator
  已經算好的 Unified Intelligence Result 原樣包裝，不重新解讀、不轉換
  其內容。
- `index.js`：統一輸出 `createIntelligenceService`/
  `createServiceResultBuilder`。

## 規則

- **No direct Data Preparation call**：不 import
  `src/intelligence/data_preparation/`。
- **No direct Analysis call**：不 import `src/intelligence/analysis/`。
- **No direct Recommendation call**：不 import
  `src/intelligence/recommendation/`。
- **No direct Domain Service access**：不 import `src/services/` 底下
  任何檔案。
- **No SQL**：不 import `src/db/` 底下任何檔案；`db` 只是原樣轉交給
  `orchestrator.runIntelligencePipeline()` 的參數，這個檔案完全不知道
  其內部結構。
- **No HTTP**：不 import 任何路由/controller，不知道 Request/Response
  是什麼。
- **No Authentication parsing**：不 import `src/auth/` 或
  `src/identity/`；`userId` 一律由呼叫端當作 `request.userId` 傳入，
  這裡完全不知道「目前是誰登入」這件事。

**唯一允許呼叫的下一層是 Intelligence Orchestrator**——這個服務不繞過
Orchestrator 直接存取任何更底層的 Phase 2 子層（Data
Preparation/Analysis/Recommendation），也不知道 Orchestrator 內部是
怎麼協調這四個階段的，這正是「應用邊界」的意義：Orchestrator 的實作
細節對這一層以上完全隱藏。

## 目前狀態

- `src/intelligence/index.js` 新增 `service` namespace re-export。
- `src/bootstrap/application.js` 新增 `application.intelligence.service`，
  組裝 `createIntelligenceService({orchestrator})` 實例，注入跟
  `intelligence.orchestration` 完全相同的 `intelligenceOrchestrator`
  實例（不是各自建立第二份）。
- **完全沒有連接**任何 route/controller/`worker.js`——這是純粹的
  Phase 2 extension point，留給未來任務決定怎麼串接成使用者可見的
  功能（例如未來的 `GET /api/intelligence` route）。

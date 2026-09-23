# Insight Context Integration Layer（Phase 1 TASK 1.42）

Data Preparation Layer（TASK1.41）與 Insight Service（TASK1.40）之間的
穩定內部合約邊界。**本次任務不是AI功能開發**，目的是讓 Insight Service
真正呼叫 Analysis Engine 之前，先有一個明確、經過驗證的資料形狀
（Insight Context），不讓格式假設散落在 Insight Service 內部、更不會
散落到未來的 AI Provider Adapter。

## 目錄結構

```
src/intelligence/context/
├── README.md
├── insight_context_builder.js   # createInsightContextBuilder()：buildInsightContext(preparedContext)
└── index.js                       # 統一輸出入口
```

跟這個目錄搭配的合約定義在 `src/intelligence/contracts/
insight_context_contract.js`（`InsightContextContract` + 執行期驗證函式
`validateInsightContext()`）。

## 分層位置

```
User Data
   ↓
Domain Services（TASK1.15，本次完全不修改）
   ↓
Data Preparation Layer（TASK1.41，本次完全不修改）
   ↓
Insight Context Contract（src/intelligence/contracts/insight_context_contract.js）
   ↓
Insight Context Builder（這裡）
   ↓
Insight Service（TASK1.40，新增 getInsightContext() 呼叫這裡）
   ↓
Analysis Engine（TASK1.40，本次完全不修改）
```

## insight_context_builder.js — `createInsightContextBuilder()`

`buildInsightContext(preparedContext)` 把 Data Preparation Layer的輸出
（`{user, explorations, foodEvents, emotions, behaviors, reports}`）
轉成穩定的 Insight Context 形狀：

```js
{
  user,               // 白名單使用者欄位（或null）
  nutritionContext,    // ← foodEvents
  behaviorContext,      // ← behaviors
  emotionContext,        // ← emotions
  activityContext,         // ← explorations
  reportContext,             // ← reports
  metadata,                   // {totalRecords, sourceCounts}——純結構性統計，不含任何解讀
}
```

回傳值是 `{context, validation}`：`context` 是建好的 Insight Context，
`validation` 是 `validateInsightContext(context)` 的執行結果
（`{ok, reason?, field?}`），呼叫端（`insight_service.js`）依此判斷要不要
把 context 往下傳。

**規則**：
- 只消費 `dataPreparation` 層的輸出，完全不 import `src/services/`
  底下任何檔案（不直接呼叫 Domain Service）
- 不直接操作 SQL（不 import `src/db/`，這個檔案甚至不接受 `db` 參數）
- 不處理 HTTP、不解析 Session
- 純函式：不讀取 `Date.now()`/`Math.random()`/任何外部狀態，同樣的
  輸入永遠得到 deterministic 的輸出
- `metadata` 只是既有 `count` 欄位的加總跟複製，不是新算出來的分數，
  不做任何推論/分類/摘要/建議/prompt 組裝

## Bootstrap Integration

`src/bootstrap/application.js` 的 `intelligence` namespace 新增
`context`：

```js
{
  insightService, analysisEngine, recommendationEngine,
  dataPreparation, context: createInsightContextBuilder(),
}
```

同一個 `context` builder 實例也會被注入到 `insightService`
（`createInsightService({..., contextBuilder: context})`），供
`getInsightContext()` 使用——`app.intelligence.context` 跟
`insightService` 內部用的是同一個實例，不是各自獨立建立兩份。**目前
沒有任何 route/controller 讀取 `app.intelligence.context`**。

## 測試方式

`backups/phase1-task1.42-insight-context/test_insight_context.mjs`：
純記憶體測試，完全不連線任何真實或本機模擬的資料庫，不呼叫任何 AI API
或 `fetch()`，不建立任何真實使用者 session。

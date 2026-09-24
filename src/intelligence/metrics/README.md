# Intelligence Execution Metrics Layer（TASK 1.54）

## 目的

在Execution Manager（TASK1.50）、Execution Event（TASK1.51）、
Execution History（TASK1.52）、Execution Monitoring（TASK1.53）
之上，建立一個獨立的統計/量測邊界——把「執行次數計數」「成功率」
「平均耗時」統一包裝成一個對外的Metrics介面，為未來可能的
observability（例如儀表板、告警閾值）預留邊界，但**這次任務完全
不做任何持久化、不新增任何UI/API route**：Execution Manager原本的
執行邏輯與對外回傳格式**完全沒有改變**，Metrics只是額外的、旁路的
唯讀觀察者，跟Execution Monitoring（TASK1.53）是同一種角色，但
Monitoring著重「查詢單次執行的狀態/歷史」，Metrics著重「跨執行的
彙總統計數字」。

**這個任務不是 AI 功能開發**：Metrics的建立、事件收集、統計計算
全部都是純粹的資料聚合與算術，完全不做任何推論、分類、摘要、建議。

## 架構位置

```
Intelligence Facade（TASK1.48）
  ↓
Intelligence Execution Manager（TASK1.50）── 生命週期狀態轉換時
  ↓                          ↘
Intelligence Service      Event Dispatcher（TASK1.51）
（TASK1.46）                    ↑
                                ├── 訂閱 ──→ Execution Monitoring（TASK1.53，唯讀觀察）
                                └── 訂閱 ──→ Execution Metrics（這裡，累積統計）
```

`execution_metrics.js`完全不import`src/intelligence/events/`或
`src/intelligence/history/`底下任何檔案——`eventDispatcher`/
`historyStore`一律透過`createExecutionMetrics({historyStore,
eventDispatcher})`依賴注入傳入，是符合最小介面
（`{subscribe}`/`{get}`）的不透明物件，這是刻意的邊界決策，維持
「統計跟執行邏輯完全independent」跟「每一層只認識自己需要的最小
形狀」的既有慣例。

## 檔案

- `execution_metrics.js`：`createExecutionMetrics(options)`，提供
  三個介面（規格明確列出，不多不少）：
  - `recordExecutionEvent(event)`：把單一Execution Event（形狀跟
    TASK1.51一致：`{type, timestamp, executionId, payload}`）記錄
    進內部狀態——這是Metrics收集資料的唯一入口。建立時如果有提供
    合法的`eventDispatcher`，會自動把這個函式訂閱到四個固定事件
    類型上；也刻意公開成對外介面，讓呼叫端（或測試）可以在沒有
    Event Dispatcher的情況下直接餵事件進來。對不合法的事件安全
    回傳`{ok:false, reason}`，不拋出例外。
  - `getMetrics()`：對內部累積的全部executionId計算彙總統計，回傳
    `{status:'metrics_ready', metrics:{...}, metadata:{}}`。
  - `getExecutionMetrics(executionId)`：對單一executionId計算同樣
    形狀的統計。優先查詢自己內部累積的狀態；如果自己完全沒觀察過
    這個executionId的事件（例如這個Metrics實例是在該次執行結束後
    才建立的），且有提供`historyStore`，則退而查詢
    `historyStore.get(executionId)`當替代來源（並把History Record
    的`metadata`欄位一併帶出）——這是`historyStore`在這個檔案裡
    唯一的用途，純讀取，不修改。兩種來源都查不到時回傳
    `{status:'not_found', ...}`；executionId不合法時回傳
    `{status:'invalid_execution_id', ...}`。
- `metrics_result_builder.js`：
  - `buildMetrics(input)`：組出
    `{totalExecutions, initialized, running, completed, failed,
    averageDuration, successRate}`，未提供的欄位預設為`0`。
  - `buildMetricsResult(input)`：組出`{status, metrics, metadata}`
    （規格原文的標準化輸出形狀，注意這裡不是TASK1.51~1.53用的
    `{ok, ...}`慣例，是規格明確指定的不同形狀）。
  - 純函式，不讀取`Date.now()`/`Math.random()`，也不提供對外的
    驗證函式。
- `index.js`：統一輸出上述兩個檔案的內容。

## 統計定義

全部統計都是從累積的原始`{status, startedAt, completedAt}`快照
即時重新計算（不是逐次emit時累加的計數器，避免計數器失準），確保
「同樣的一組已記錄事件，任何時候呼叫都得到完全相同的統計結果」：

- `totalExecutions`/`initialized`/`running`/`completed`/`failed`：
  依每個executionId目前最新的status分類計數，
  `totalExecutions = initialized+running+completed+failed`恆成立。
- `averageDuration`：只計算status為`completed`或`failed`、且
  `startedAt`/`completedAt`都存在且可被解析成數字時間戳（數字，或
  可以被`Date.parse()`解析的字串）的executionId，取
  `completedAt-startedAt`的平均值；沒有任何符合條件的紀錄時為`0`
  （不是`NaN`）。`Date.parse()`是對輸入字串的確定性解析，不讀取
  目前時間，不違反deterministic規則。
- `successRate`：`completed / (completed + failed)`——只計算已經
  跑完的執行（`initialized`/`running`尚未有結果的不列入分母），
  沒有任何已結束的執行時為`0`（不是`NaN`）。

## 規則

- **memory only / no persistence**：`recordsByExecutionId`只存在於
  Metrics實例的記憶體（一個JS closure裡的`Map`）中，不寫入任何
  檔案/資料庫/KV，Metrics實例被丟棄後全部累積的統計也跟著消失。
- **no external dependency**：完全不 import 任何非相對路徑的外部
  套件，不呼叫`fetch()`。
- **deterministic**：同樣的一組已記錄事件（或同樣的historyStore
  狀態），任何時候`getMetrics()`/`getExecutionMetrics()`都得到完全
  相同的結果。

## 目前狀態

- `src/intelligence/index.js` 新增 `metrics` namespace re-export。
- `src/bootstrap/application.js` 新增
  `application.intelligence.metrics`，組裝
  `createExecutionMetrics({historyStore: intelligenceHistoryStore,
  eventDispatcher: intelligenceEventDispatcher})`實例——注入的是跟
  `intelligence.history`/`intelligence.events`完全相同的實例（不是
  各自建立第二份），純粹的依賴注入組裝，不影響
  `intelligence.execution`/`intelligence.monitoring`原本的行為。
- Execution Manager、Orchestrator、Analysis、Recommendation、
  Service、Facade、Runtime Context、Contracts八者的原始碼**完全
  沒有被修改**——本次任務明確禁止觸碰它們（Execution Manager這次
  連純新增的旁路行為都沒有，因為Metrics完全透過既有的
  historyStore/eventDispatcher做唯讀觀察，不需要Execution Manager
  提供任何新的依賴注入掛勾）。
- 完全沒有連接任何 route/controller/`worker.js`，也沒有新增任何
  D1/SQL/migration/UI——這是純粹的Phase 2 extension point，為未來
  可能的observability預留邊界。

# Intelligence Execution Monitoring Layer（TASK 1.53）

## 目的

在Execution Manager（TASK1.50）、Execution Event（TASK1.51）、
Execution History（TASK1.52）之上，建立一個純讀取、純觀察的監控
邊界——把「執行狀態查詢」「歷史紀錄查詢」「彙總統計」統一包裝成
一個對外的Monitoring介面，為未來可能的observability（例如儀表板、
告警）預留邊界，但**這次任務完全不做任何持久化、不新增任何UI/API
route**：Execution Manager原本的執行邏輯與對外回傳格式**完全沒有
改變**，Monitor只是額外的、旁路的唯讀觀察者。

**這個任務不是 AI 功能開發**：Monitor的建立、查詢、彙總全部都是
純粹的資料讀取與整理，完全不做任何推論、分類、摘要、建議。

## 架構位置

```
Intelligence Facade（TASK1.48）
  ↓
Intelligence Execution Manager（TASK1.50）── 生命週期狀態轉換時
  ↓                          ↘                    ↘
Intelligence Service      Event Dispatcher      History Store
（TASK1.46）                （TASK1.51）           （TASK1.52）
                                 ↑                    ↑
                                 └── 訂閱 ──┐  ┌── 讀取 ──┘
                                            ↓  ↓
                                     Execution Monitor（這裡）
```

`execution_monitor.js`完全不import`src/intelligence/history/`或
`src/intelligence/events/`底下任何檔案——`historyStore`/
`eventDispatcher`一律透過`createExecutionMonitor({historyStore,
eventDispatcher})`依賴注入傳入，是符合最小介面
（`{get, list}`/`{subscribe}`）的不透明物件，這是刻意的邊界決策，
維持「監控跟執行邏輯完全independent」跟「每一層只認識自己需要的
最小形狀」的既有慣例。

## 檔案

- `execution_monitor.js`：`createExecutionMonitor(options)`，提供：
  - `getExecutionStatus(executionId)`：合併History（`status`/
    `metadata`）跟Monitor自己透過`eventDispatcher.subscribe()`觀察
    到的Execution Event，組成單一Execution Status
    `{status, executionId, history, events, metadata}`。History
    查詢失敗（找不到／無效executionId／`historyStore`未提供）時
    整個查詢失敗，回傳`{ok:false, reason}`，不用不完整的資料頂替。
  - `getExecutionHistory(executionId)`：單純轉發
    `historyStore.get(executionId)`，`historyStore`未提供或
    executionId不合法時安全回傳`{ok:false, reason}`，不拋出例外。
  - `getSummary()`：讀取`historyStore.list()`全部紀錄，依`status`
    分類統計出`{totalExecutions, completed, failed, running}`——
    `completed`/`failed`各自對應History Record的`completed`/
    `failed`狀態，其餘所有狀態（`initialized`/`running`/未知狀態）
    一律歸類為`running`（尚未結束的執行），確保
    `totalExecutions = completed + failed + running`恆成立。
    `historyStore`未提供時安全回傳全部為0的Summary。
  - 建立時（如果有提供合法的`eventDispatcher`），對固定四個生命
    週期事件類型（跟TASK1.51的`EXECUTION_EVENT_TYPES`一致，但這裡
    刻意寫死自己的字面值常數`MONITORED_EVENT_TYPES`，不import
    `execution_event.js`）各自呼叫一次
    `eventDispatcher.subscribe(type, handler)`，訂閱到的事件依
    `event.executionId`分組累積在Monitor自己的記憶體`Map`裡——這是
    Monitor自己獨立的一份觀察紀錄，不讀取History Record裡自己的
    `events`欄位（雖然TASK1.52的History Record也有一份events拷貝，
    但那是History Store的內部細節，Monitor刻意透過Event Dispatcher
    直接觀察，維持跟Execution Event系統的直接對應關係）。
  - 全部三個介面都是純讀取，`historyStore`/`eventDispatcher`未提供
    時安全回傳預設值/失敗結果，不拋出例外。
- `monitoring_result_builder.js`：
  - `buildExecutionStatus(input)`：組出
    `{status, executionId, history, events, metadata}`，未提供的
    欄位分別預設為`null`/`null`/`null`/`[]`/`{}`。
  - `buildSummary(input)`：組出
    `{totalExecutions, completed, failed, running}`，未提供的欄位
    預設為`0`。
  - 純函式，不讀取`Date.now()`/`Math.random()`，也不提供對外的
    驗證函式——這兩種輸出形狀完全是Monitor自己內部組裝出來的，不是
    外部呼叫端可以自由傳入、需要驗證的輸入形狀。
- `index.js`：統一輸出上述兩個檔案的內容。

## 規則

- **memory only / no persistence**：`eventsByExecutionId`只存在於
  Monitor實例的記憶體（一個JS closure裡的`Map`）中，不寫入任何
  檔案/資料庫/KV，Monitor實例被丟棄後全部觀察紀錄也跟著消失。
- **no external dependency**：完全不 import 任何非相對路徑的外部
  套件，不呼叫`fetch()`。
- **deterministic output**：同樣的一組`historyStore`/
  `eventDispatcher`狀態、同樣的查詢輸入，任何時候
  `getExecutionStatus()`/`getExecutionHistory()`/`getSummary()`都
  得到完全相同的結果。

## 目前狀態

- `src/intelligence/index.js` 新增 `monitoring` namespace re-export。
- `src/bootstrap/application.js` 新增
  `application.intelligence.monitoring`，組裝
  `createExecutionMonitor({historyStore: intelligenceHistoryStore,
  eventDispatcher: intelligenceEventDispatcher})`實例——注入的是跟
  `intelligence.history`/`intelligence.events`完全相同的實例（不是
  各自建立第二份），純粹的依賴注入組裝，不影響`intelligence.execution`
  原本的執行邏輯/回傳格式。
- Orchestrator、Analysis、Recommendation、Service、Facade、Runtime
  Context、Contracts、Execution Manager八者的原始碼**完全沒有被
  修改**——本次任務明確禁止觸碰它們（Execution Manager這次連純新增
  的旁路行為都沒有，因為Monitor完全透過既有的historyStore/
  eventDispatcher做唯讀觀察，不需要Execution Manager提供任何新的
  依賴注入掛勾）。
- 完全沒有連接任何 route/controller/`worker.js`，也沒有新增任何
  D1/SQL/migration/UI——這是純粹的Phase 2 extension point，為未來
  可能的observability預留邊界。

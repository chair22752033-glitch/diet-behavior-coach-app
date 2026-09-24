# Intelligence Execution History Layer（TASK 1.52）

## 目的

在Execution Manager（TASK1.50）的生命週期狀態轉換、Execution Event
（TASK1.51）之上，建立一個純記憶體的「執行歷史」內部邊界——把單次
Intelligence執行從開始到結束的狀態記錄成一筆結構化的History Record，
為未來可能的持久化（例如寫入D1）預留邊界，但**這次任務完全不做任何
持久化**：不寫檔案、不寫資料庫、不呼叫任何外部服務，Execution
Manager原本的執行邏輯與對外回傳格式**完全沒有改變**，History只是
額外的、旁路的記錄行為。

**這個任務不是 AI 功能開發**：History Record的建立、驗證、儲存全部
都是純粹的資料記錄機制，完全不做任何推論、分類、摘要、建議。

## 架構位置

```
Consumer
  ↓
Intelligence Facade（TASK1.48）
  ↓
Intelligence Execution Manager（TASK1.50）── 生命週期狀態轉換時
  ↓                                    ↘         ↘
Intelligence Service（TASK1.46）    Event Dispatcher   History Store（這裡）
  ↓                                 （TASK1.51）        ── 記錄生命週期歷史
...
```

## 檔案

- `execution_history.js`：
  - `HistoryRecordContract`：定義必填欄位`[executionId, status]`、
    選填欄位`[startedAt, completedAt, events, metadata]`。
  - `validateHistoryRecord(record)`：驗證紀錄形狀——`executionId`/
    `status`必填且必須是非空字串；`startedAt`/`completedAt`選填但
    存在時必須是字串或`null`；`events`選填但存在時必須是陣列（陣列
    內容不被驗證，只確認是陣列）；`metadata`選填但存在時必須是物件。
  - `createHistoryRecord(input)`：把（可能不完整的）輸入套上固定
    預設值（`startedAt:null`, `completedAt:null`, `events:[]`,
    `metadata:{}`）後組成通過驗證的紀錄。純函式，完全不讀取
    `Date.now()`/`Math.random()`——`startedAt`/`completedAt`刻意不在
    這裡內部產生。
- `history_store.js`：`createHistoryStore()`，提供：
  - `add(record)`：驗證後以`record.executionId`為key存入/覆蓋Map，
    回傳`{ok:true}`（或`{ok:false, reason, field?}`）。同一個
    executionId重複呼叫`add()`會覆蓋既有紀錄——這是刻意設計，讓
    Execution Manager可以在同一次執行的不同生命週期階段重複呼叫
    `add()`更新同一筆紀錄，不需要額外的`update()`介面。
  - `get(executionId)`：依executionId查詢單筆紀錄，找不到時回傳
    `{ok:false, reason:'not_found'}`。
  - `list()`：回傳目前store裡全部紀錄的陣列。
  - 紀錄只存在於store實例的記憶體（一個JS closure裡的`Map`）中，
    store實例被丟棄後全部紀錄也跟著消失，**不做任何持久化**。
- `index.js`：統一輸出上述兩個檔案的內容。

## 規則

- **deterministic behavior**：同樣的輸入，任何時候
  `createHistoryRecord()`/`validateHistoryRecord()`都得到完全相同的
  結果；同樣的一組`add()`呼叫順序，`list()`得到完全相同的結果。
- **no external dependency**：完全不 import 任何非相對路徑的外部
  套件，不呼叫`fetch()`。
- **no persistence**：不寫入任何檔案/資料庫/KV，歷史紀錄只存在於
  記憶體中，store實例之間完全獨立、互不影響。

## Lifecycle Mapping（跟 Execution Manager 的整合）

`src/intelligence/execution/execution_manager.js` 透過選填的
`dependencies.historyStore`依賴注入拿到一個History Store實例，在每次
狀態轉換（`setState()`）時，除了既有TASK1.50的`onStateChange(state)`
回呼、TASK1.51的`eventDispatcher.emit()`之外，**額外**呼叫
`historyStore.add()`維護一筆以`executionId`為key的歷史紀錄：

| Execution Manager 狀態 | History Store 行為                                   |
|------------------------|-------------------------------------------------------|
| `"initialized"`        | 建立新紀錄：`status:'initialized'`, `startedAt:null`, `completedAt:null`, `events:[]`, `metadata:{}` |
| `"running"`            | 更新既有紀錄：`status:'running'`, `startedAt`設為目前的timestamp |
| `"completed"`          | 更新既有紀錄：`status:'completed'`, `completedAt`設為目前的timestamp |
| `"failed"`             | 更新既有紀錄：`status:'failed'`                       |

每次狀態轉換都會把當下（跟TASK1.51 Event Dispatcher送出的）同一份
Execution Event形狀的物件（`{type, timestamp, executionId, payload}`）
附加進紀錄的`events`陣列——這讓History Record的`events`欄位跟
Execution Event（TASK1.51）保持結構相容，但`execution_manager.js`本身
完全不 import `src/intelligence/events/`或`src/intelligence/history/`
底下任何檔案，這些事件形狀物件是`execution_manager.js`自己內部組出來
的字面值，跟`eventDispatcher`是否存在、`emit()`是否成功完全無關。

**這是純粹新增的旁路行為，不影響Execution Manager原本的執行邏輯**：
- `historyStore`是選填依賴，不提供時完全不影響`execute()`的行為
  （沒有任何歷史紀錄會被建立，但輸入驗證/呼叫Service/回傳結果完全
  不變）
- `executionId`（來自Runtime Context的`requestId`）沒有提供時，安全
  跳過整個歷史記錄行為，不拋出例外
- `historyStore.add()`/`get()`呼叫本身被try/catch包住，即使store
  實作丟出例外，也絕對不會中斷實際的Intelligence執行流程
- `execution_manager.js`完全不 import
  `src/intelligence/history/`底下任何檔案——`historyStore`一律透過
  依賴注入傳入
- Execution Manager回傳給呼叫端的成功/失敗結果格式（TASK1.50既有的
  `{ok, state, data|reason}`）**完全沒有改變**

## 目前狀態

- `src/intelligence/index.js` 新增 `history` namespace re-export。
- `src/bootstrap/application.js` 新增 `application.intelligence.history`，
  組裝 `createHistoryStore()` 實例，注入進 `intelligence.execution`
  （`createExecutionManager({service, eventDispatcher, historyStore})`）。
- Orchestrator、Analysis、Recommendation、Service、Facade、Runtime
  Context、Contracts七者的原始碼**完全沒有被修改**——本次任務明確
  禁止觸碰它們。
- 完全沒有連接任何 route/controller/`worker.js`，也沒有新增任何
  D1/SQL/migration——這是純粹的Phase 2 extension point，為未來可能的
  持久化預留邊界。

**TASK1.56（Runtime Policy Integration Review）更新**：這個
`application.intelligence.history`實例，後續被TASK1.53
（`intelligence.monitoring`的`getExecutionHistory()`/`getSummary()`）
跟TASK1.54（`intelligence.metrics`的`getExecutionMetrics()`回退
查詢）各自透過`historyStore.get()`/`historyStore.list()`唯讀查詢——
三者都只呼叫`get()`/`list()`，只有Execution Manager會呼叫`add()`
寫入，維持「Execution Manager是唯一能修改History的入口，其餘全部
是唯讀消費者」的邊界，這個檔案本身完全沒有因為新增消費者而被修改。

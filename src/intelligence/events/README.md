# Intelligence Execution Event Layer（TASK 1.51）

## 目的

在 Execution Manager（TASK1.50）的生命週期狀態轉換之上，引入一個
純記憶體的內部事件機制——把「狀態轉換」這件事包成結構化的
Execution Event，透過一個獨立的Event Dispatcher轉發給訂閱者。這一層
**完全不新增任何持久化或外部整合**：不寫檔案、不寫資料庫、不呼叫任何
外部服務，Execution Manager原本的執行邏輯（輸入驗證、呼叫Service、
成功/失敗結果）**完全沒有改變**，事件只是額外的、旁路的觀察管道。

**這個任務不是 AI 功能開發**：事件定義、驗證、發送全部都是純粹的
資料轉發機制，完全不做任何推論、分類、摘要、建議。

## 架構位置

```
Consumer
  ↓
Intelligence Facade（TASK1.48）
  ↓
Intelligence Execution Manager（TASK1.50）── 生命週期狀態轉換時emit事件
  ↓                                    ↘
Intelligence Service（TASK1.46）         Event Dispatcher（這裡）── 轉發給訂閱者
  ↓
...
```

## 檔案

- `execution_event.js`：
  - `EXECUTION_EVENT_TYPES`：固定四個字串
    `["execution_initialized","execution_started","execution_completed","execution_failed"]`，
    沒有其他事件類型。
  - `isValidExecutionEventType(type)`：檢查是不是這四個之一。
  - `validateExecutionEvent(event)`：驗證事件形狀——`type`必填且必須
    是合法的事件類型；`timestamp`/`executionId`選填但存在時必須是
    字串或`null`；`payload`選填、內容完全不被驗證（不解讀業務內容）。
  - `createExecutionEvent(input)`：把（可能不完整的）輸入套上固定
    預設值（`timestamp:null`, `executionId:null`, `payload:null`）
    後組成通過驗證的事件。純函式，完全不讀取
    `Date.now()`/`Math.random()`——`timestamp`刻意不在這裡內部產生。
- `event_dispatcher.js`：`createEventDispatcher()`，提供：
  - `subscribe(eventType, handler)`：註冊一個特定事件類型的handler，
    回傳`{ok:true, unsubscribe}`（或`{ok:false, reason}`）。
  - `emit(event)`：驗證事件形狀後，依訂閱順序**同步**呼叫所有訂閱了
    `event.type`的handler，回傳`{ok:true, handlerCount}`（或
    `{ok:false, reason, field?}`）。任何一個handler拋出的例外都會被
    吞掉，不會讓`emit()`本身拋出例外或影響其他handler——事件處理必須
    跟Execution Manager的實際執行邏輯完全independent。
  - 訂閱清單只存在於dispatcher實例的記憶體（一個JS closure裡的
    `Map`）中，dispatcher實例被丟棄後訂閱清單也跟著消失，**不做任何
    持久化**。
- `index.js`：統一輸出上述兩個檔案的內容。

## 規則

- **deterministic behavior**：同樣的訂閱者清單、同樣的event，任何
  時候`emit()`都得到完全相同的呼叫結果。
- **synchronous execution allowed**：`emit()`同步依序呼叫每個
  handler，不使用Promise/setTimeout/microtask排隊。
- **no external dependency**：完全不 import 任何非相對路徑的外部
  套件，不呼叫`fetch()`。
- **no persistence**：不寫入任何檔案/資料庫/KV，事件跟訂閱清單都只
  存在於記憶體中。

## Lifecycle Mapping（跟 Execution Manager 的整合）

`src/intelligence/execution/execution_manager.js` 的生命週期狀態
（`execution_state.js`固定四個，沒有變）對應到事件類型：

| Execution Manager 狀態 | Execution Event 類型     |
|------------------------|---------------------------|
| `"initialized"`        | `"execution_initialized"` |
| `"running"`            | `"execution_started"`     |
| `"completed"`          | `"execution_completed"`   |
| `"failed"`             | `"execution_failed"`      |

Execution Manager 透過選填的`dependencies.eventDispatcher`依賴注入
拿到一個Event Dispatcher實例，在每次狀態轉換（`setState()`）時，除了
既有TASK1.50的`onStateChange(state)`回呼之外，**額外**呼叫
`eventDispatcher.emit({type, timestamp, executionId, payload})`——
`executionId`/`timestamp`取自Facade建立的Runtime Context
（`runtimeContext.requestId`/`runtimeContext.timestamp`，沒有提供時
安全為`null`），`payload`在`completed`/`failed`狀態時分別帶上
`{status}`/`{reason}`供訂閱者參考，`initialized`/`running`狀態的
`payload`為`null`。

**這是純粹新增的旁路行為，不影響Execution Manager原本的執行邏輯**：
- `eventDispatcher`是選填依賴，不提供時完全不影響`execute()`的行為
  （沒有任何事件會被發送，但輸入驗證/呼叫Service/回傳結果完全不變）
- `execution_manager.js`完全不 import
  `src/intelligence/events/`底下任何檔案——`eventDispatcher`一律
  透過依賴注入傳入，這個檔案本身連事件類型字面值（例如
  `"execution_initialized"`）都是自己內部的常數對照表，不依賴
  `execution_event.js`的`EXECUTION_EVENT_TYPES`（事件的形狀驗證交給
  `event_dispatcher.js`內部的`validateExecutionEvent()`負責）
- Execution Manager回傳給呼叫端的成功/失敗結果格式（TASK1.50既有的
  `{ok, state, data|reason}`）**完全沒有改變**

## 目前狀態

- `src/intelligence/index.js` 新增 `events` namespace re-export。
- `src/bootstrap/application.js` 新增 `application.intelligence.events`，
  組裝 `createEventDispatcher()` 實例，注入進
  `intelligence.execution`（`createExecutionManager({service,
  eventDispatcher})`）。
- Orchestrator、Analysis、Recommendation、Service、Execution
  Contract、Runtime Context六者的原始碼**完全沒有被修改**——本次任務
  明確禁止觸碰它們。
- 完全沒有連接任何 route/controller/`worker.js`，也沒有新增任何
  資料庫logging——這是純粹的Phase 2 extension point。

**TASK1.56（Runtime Policy Integration Review）更新**：這個
`application.intelligence.events`實例，後續被TASK1.53
（`intelligence.monitoring`）跟TASK1.54（`intelligence.metrics`）
各自透過`eventDispatcher.subscribe()`額外訂閱——三者（Execution
Manager的emit端、Monitoring、Metrics）共用同一個Event Dispatcher
實例，訂閱清單裡因此同時存在三種訂閱者，但彼此透過
`event_dispatcher.js`既有的「一個handler拋出例外不影響其他handler」
設計完全隔離，這個檔案本身完全沒有因為新增訂閱者而被修改。

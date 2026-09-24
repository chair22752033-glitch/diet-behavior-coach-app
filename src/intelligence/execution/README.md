# Intelligence Execution Lifecycle Manager（TASK 1.50）

## 目的

在 Intelligence Facade（TASK1.48）跟 Intelligence Service（TASK1.46）
之間建立一個「執行生命週期管理」邊界——把單次Intelligence執行從開始
到結束的狀態（`initialized` → `running` → `completed`/`failed`）、
Service呼叫細節、成功/失敗結果全部標準化並封裝在這一層。**這個任務
完全不改變既有pipeline行為**：Orchestrator/Analysis/Recommendation/
Data Preparation/Runtime Context五層對Execution Manager一無所知，也
不需要知道。

**這個任務不是 AI 功能開發**：Execution Manager只做「狀態追蹤 + 呼叫
Service + 結果標準化」，完全不做任何推論、分類、摘要、建議。

## 架構位置

```
Consumer
  ↓
Intelligence Facade（TASK1.48）── 建立Runtime Context（TASK1.49）
  ↓
Intelligence Execution Manager（這裡）── 管理執行生命週期狀態
  ↓
Intelligence Service（TASK1.46）
  ↓
Execution Contract（TASK1.47）
  ↓
Intelligence Orchestrator（TASK1.45）
  ↓
Intelligence Pipeline
```

**這個任務起，Facade不再直接呼叫Service**——改為呼叫Execution
Manager，Execution Manager才是唯一直接呼叫Service的一層：

```
Facade → Execution Manager → Service
```

## 檔案

- `execution_state.js`：`EXECUTION_STATES`（固定四個字串：
  `"initialized"`/`"running"`/`"completed"`/`"failed"`，規格明確
  "No additional states"）跟`isValidExecutionState(state)`。純粹的
  資料定義，不含任何邏輯判斷。
- `execution_result_builder.js`：`createExecutionResultBuilder()`，
  `buildCompletedResult(serviceData)`/`buildFailedResult(reason)`
  定義穩定輸出格式：

  ```js
  // 成功
  { ok: true, state: "completed", data: { status, result } }

  // 失敗
  { ok: false, state: "failed", reason }
  ```

  `data.result`把Service回傳裡除了`status`以外的其餘欄位
  （`context`/`analysis`/`recommendation`/`metadata`）收斂包成單一
  物件。純函式，完全不讀取`Date.now()`/`Math.random()`。
- `execution_manager.js`：`createExecutionManager(dependencies)`，
  透過依賴注入拿到`service`（TASK1.46的`createIntelligenceService()`
  實例）。`execute(db, {request, runtimeContext})`：
  1. 狀態轉為`"initialized"`
  2. 驗證輸入（`request.userId`必填非空字串，`request.options`選填
     且存在時必須是物件）——失敗時狀態轉為`"failed"`並回傳失敗結果
  3. 狀態轉為`"running"`
  4. 呼叫`service.getIntelligence(db, {userId, options})`（**唯一**
     允許呼叫的下一層，`runtimeContext`會合併進`options.runtimeContext`
     欄位）
  5. 成功：狀態轉為`"completed"`，回傳標準化的成功結果；失敗：狀態
     轉為`"failed"`，回傳標準化的失敗結果

  狀態轉換透過選填的`dependencies.onStateChange(state)`依賴注入鉤子
  對外可觀察（供測試驗證轉換順序），不提供時完全不影響行為。
- `index.js`：統一輸出上述三個檔案的內容。

## 規則

Execution Manager **可以**呼叫：

- ✅ Intelligence Service（`service.getIntelligence()`）

Execution Manager **不可以**呼叫：

- ❌ Orchestrator（不 import `src/intelligence/orchestration/`）
- ❌ Analysis（不 import `src/intelligence/analysis/`）
- ❌ Recommendation（不 import `src/intelligence/recommendation/`）
- ❌ Data Preparation（不 import
  `src/intelligence/data_preparation/`）
- ❌ Database（不 import `src/db/` 底下任何檔案；`db` 只是原樣轉交給
  `service.getIntelligence()` 的不透明參數）
- ❌ Authentication（不 import `src/auth/` 或 `src/identity/`）

## 跟 Intelligence Facade 的整合

`src/intelligence/facade/intelligence_facade.js` 改為：

1. 驗證facade輸入（不變，仍是facade自己內建的
   `validateFacadeInput()`）
2. 建立 Runtime Context（TASK1.49，不變，仍由Facade自己呼叫
   `createRuntimeContext()`）
3. 呼叫 `executionManager.execute(db, {request:{userId, options},
   runtimeContext})`（**取代**原本直接呼叫
   `service.getIntelligence()`）
4. 把Execution Manager回傳的`data.result`攤平回
   `{status, context, analysis, recommendation, metadata}`，交給
   Facade既有的`facade_result_builder.js`（**完全沒有修改**）組出
   跟以前完全相同的對外格式——Facade對Application Consumer暴露的
   `executeIntelligence()`回傳格式因此保持100%不變，只有內部呼叫路徑
   從「Facade直接呼叫Service」改成「Facade呼叫Execution Manager，
   Execution Manager呼叫Service」。

`intelligence_service.js`、Orchestrator、Analysis、Recommendation、
Data Preparation、Runtime Context六者的原始碼**完全沒有被修改**——
本次任務明確禁止觸碰它們。

## 目前狀態

- `src/intelligence/index.js` 新增 `execution` namespace re-export。
- `src/bootstrap/application.js` 新增 `application.intelligence.execution`，
  組裝 `createExecutionManager({service})` 實例，注入的是跟
  `intelligence.service` 完全相同的 `intelligenceService` 實例（不是
  各自建立第二份）；`application.intelligence.facade` 改為注入
  `executionManager`（不再注入`service`）。
- 完全沒有連接任何 route/controller/`worker.js`——這是純粹的
  Phase 2 extension point。

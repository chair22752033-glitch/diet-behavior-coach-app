# Intelligence Application Facade Layer（TASK 1.48）

## 目的

在 Intelligence Service（TASK1.46）跟未來的 Application Consumer
（Controller/API/背景工作等）之間再建立一層 application-facing 的穩定
門面——呼叫端只需要知道 `executeIntelligence(db, request)` 這一個
介面，完全不需要知道底下實際上是 Service 先用 Execution Contract
（TASK1.47）驗證輸入/輸出，再呼叫 Orchestrator（TASK1.45）協調
Data Preparation → Analysis → Recommendation。

**這個任務不是 AI 功能開發**：Facade 完全不做推論、分類、摘要、評分或
建議，純粹是驗證輸入、呼叫 Service、把結果重新包裝成穩定的 facade
層格式。

## 架構位置

```
Application Consumer（未來的Controller/API/背景工作等）
  ↓
Intelligence Facade（這裡）
  ↓
Intelligence Service（TASK1.46）
  ↓
Execution Contract（TASK1.47）
  ↓
Intelligence Orchestrator（TASK1.45）
  ↓
Intelligence Pipeline
```

## 檔案

- `intelligence_facade.js`：`createIntelligenceFacade(dependencies)`，
  透過依賴注入拿到 `service`（TASK1.46的`createIntelligenceService()`
  實例）。`executeIntelligence(db, request)`：
  1. `validateFacadeInput(request)` 驗證輸入形狀（`userId`必填非空
     字串，`options`選填且存在時必須是物件）——這是Facade內建、自成
     一格的驗證邏輯，刻意不重用
     `src/intelligence/contracts/execution/`的
     `validateIntelligenceRequest()`（見下方「邊界決策」）
  2. 呼叫 `service.getIntelligence(db, {userId, options})`（**唯一**
     允許呼叫的下一層）
  3. 成功時把Service回傳的`{status, context, analysis, recommendation,
     metadata}`重新包裝成`{ok:true, data:{status, result:{context,
     analysis, recommendation}, metadata}}`；失敗時回傳
     `{ok:false, reason}`

  任何一步失敗都立刻回傳失敗結果並停止，不會用不完整的資料頂替繼續
  執行。
- `facade_result_builder.js`：`createFacadeResultBuilder()`，
  `buildSuccessResult(serviceData)`/`buildFailureResult(reason)`
  定義穩定輸出格式：

  ```js
  // 成功
  { ok: true, data: { status, result, metadata } }

  // 失敗
  { ok: false, reason }
  ```

  純函式，完全不讀取 `Date.now()`/`Math.random()`，只是把 Service 已
  經算好的內容重新排列（`context`/`analysis`/`recommendation`收斂進
  單一`result`物件），不重新解讀或轉換其內容。
- `index.js`：統一輸出 `createIntelligenceFacade`/
  `createFacadeResultBuilder`。

## 規則

Facade **可以**呼叫：

- ✅ Intelligence Service（`service.getIntelligence()`）

Facade **不可以**呼叫：

- ❌ Orchestrator（不 import `src/intelligence/orchestration/`）
- ❌ Analysis（不 import `src/intelligence/analysis/`）
- ❌ Recommendation（不 import `src/intelligence/recommendation/`）
- ❌ Data Preparation（不 import
  `src/intelligence/data_preparation/`）
- ❌ Domain Service（不 import `src/services/` 底下任何檔案）
- ❌ Database（不 import `src/db/` 底下任何檔案；`db` 只是原樣轉交給
  `service.getIntelligence()` 的不透明參數）

其他既有規則：

- **No HTTP**：不 import 任何路由/controller，不知道 Request/Response
  是什麼。
- **No Authentication parsing**：不 import `src/auth/` 或
  `src/identity/`；`userId` 一律由呼叫端當作 `request.userId` 傳入。
  本次任務明確把「未來 authorization/context 整合點」這件事留給後續
  任務，這裡完全不實作任何授權邏輯，只是預留了這一層作為未來加上
  authorization/context 檢查的自然位置。

## 邊界決策：為什麼不重用 Execution Contract 的 request 驗證？

`validateFacadeInput()` 是 Facade 自己內建的驗證函式，形狀恰好跟
`src/intelligence/contracts/execution/intelligence_request_contract.js`
的 `validateIntelligenceRequest()` 相似，但刻意**不直接 import 重用
它**——跟 TASK1.44 `recommendation_runner.js` 刻意不重用
`src/intelligence/contracts.js` 是同樣的邊界決策：讓 Facade 完全獨立
於 Execution Contract Layer 未來的形狀演進，只依賴 Service 這一個
下游介面，維持「每一層只認識自己呼叫的下一層」的架構原則，避免跨層
耦合。

## 目前狀態

- `src/intelligence/index.js` 新增 `facade` namespace re-export。
- `src/bootstrap/application.js` 新增 `application.intelligence.facade`，
  組裝 `createIntelligenceFacade({service})` 實例，注入的是跟
  `intelligence.service` 完全相同的 `intelligenceService` 實例（不是
  各自建立第二份）。
- `intelligence_service.js`、Orchestrator、Analysis、Recommendation
  四者的原始碼**完全沒有被修改**——本次任務明確禁止觸碰它們。
- **完全沒有連接**任何 route/controller/`worker.js`——這是純粹的
  Phase 2 extension point，留給未來任務決定怎麼串接成使用者可見的
  功能（例如未來的 `GET /api/intelligence` route，或加上
  authorization/context 檢查）。

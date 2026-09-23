# Adapter Layer（Phase 1 TASK 1.22）

未來 `src/worker.js` 與 Router Layer（TASK1.21）之間的接線層。
**本次不修改 `src/worker.js`、不修改 `wrangler.toml`、不建立任何正式 API
endpoint、不 `export default` 一個 worker。**

## 目錄結構

```
src/adapters/
├── README.md
├── context_builder.js   # createRequestContext(env, request)：組裝 {req, env, db, services}
└── worker_adapter.js      # createWorkerHandler()：組出 (request, env) => Promise<Response>
```

## 分層位置

```
Future worker.js
   ↓（本次未接）
worker_adapter.js（這裡）
   ↓
context_builder.js（這裡）
   ↓
Router（TASK1.21）
   ↓
Controller（TASK1.20）
   ↓
Application Service / Domain Service（TASK1.19 / TASK1.15）
   ↓
D1（TASK1.12）
```

## Context Builder

`createRequestContext(env, request)` 只做組裝，不執行任何業務邏輯：

- `db`：呼叫 TASK1.12 的 `createDb(env)`，`env` 沒有提供時直接拋出清楚的錯誤。
- `services`：集中把 TASK1.19 的 `auth_application_service.js`、TASK1.15 的
  `user_service.js`/`exploration_service.js`/`food_service.js`/
  `emotion_service.js`/`behavior_service.js`/`report_service.js` 各以
  module namespace 的形式注入成 `{authApplicationService, userService, ...}`，
  不呼叫其中任何一個函式。
- `req`：原封不動地保留呼叫方傳入的 `request`，不解析 body/cookie（那是
  各 controller/route 自己的事，見 TASK1.20/1.21 的設計）。

回傳形狀：`{req, env, db, services}`。

## Worker Adapter

`createWorkerHandler()` 回傳一個 `(request, env) => Promise<Response>`
函式，內部流程：

```
request
  ↓
createRequestContext(env, request)  →  {req, env, db, services}
  ↓
createAppRouter()（TASK1.21，在 createWorkerHandler() 呼叫時建立一次）
  ↓
router.handle(context.req, {db, env, services})
  ↓
Response
```

任何一步（`env` 缺少 binding、router 內部意外拋出等）丟出的例外都會被
`handleRequest()` 攔截，轉成一個 `{ok:false, reason}`、status 500 的
`Response`，避免整個 handler 未攔截地往外丟例外。

**本次沒有任何地方呼叫 `createWorkerHandler()`**：`src/worker.js` 完全
沒有 `export default { fetch: createWorkerHandler() }` 這樣的接線，這是
未來任務的範圍；本次只是把「這件事將來該怎麼做」的基礎架構準備好。

## 測試方式

`backups/phase1-task1.22-adapter/test_adapter_mock.mjs`：純記憶體 mock
D1 binding（跟 TASK1.12 測試同樣的 `makeMockD1` 手法），完全不連線任何
真實或本機模擬的資料庫，不建立任何真實使用者 session，也不會真的呼叫
OAuth 流程。

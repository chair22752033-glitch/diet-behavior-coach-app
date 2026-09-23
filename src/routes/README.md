# Router Layer（Phase 1 TASK 1.21）

`src/worker.js` 未來要接 API 時會用到的 method+path → controller 派發層。
**本次不建立任何正式 API endpoint、不修改 `src/worker.js`、不接真實登入流程。**

## 目錄結構

```
src/routes/
├── README.md
├── router.js         # createRouter()：通用 method+path 比對引擎，含 :param 解析
├── auth_routes.js     # registerAuthRoutes(router)：/auth/* 的 mapping
├── user_routes.js      # registerUserRoutes(router)：/users/:id 的 mapping
└── index.js             # createAppRouter()：組裝以上全部路由（目前沒有任何地方 import 它）
```

## 分層位置

```
worker.js
   ↓（future，本次未接）
Router（這裡）
   ↓
Controller（TASK1.20）
   ↓
Application Service / Domain Service（TASK1.19 / TASK1.15）
   ↓
Identity Layer / Session Layer / DB Access Layer
   ↓
D1
```

## Router 原則

`router.js` 本身**完全不知道**業務路由長什麼樣子，不 import 任何
controller/service/db 相關檔案。它只做三件事：

1. `router.add(method, path, handler)`：註冊一個 method+path→handler 的比對規則，
   `path` 支援 `:param` 語法（例如 `/users/:id`）。
2. `router.handle(request, context)`：依 `request.method` + `request.pathname`
   （或 `request.url`）找出符合的 route，把比對出的路由參數（`params`）
   與呼叫方傳入的 `context`（`{db, env, services}`）合併成
   `{req: request, params, db, env, services}` 交給對應的 handler。
3. 把 handler（也就是各路由檔案裡包好 controller 的函式）回傳的
   `{ok, data/reason, status}` 轉成一個真正的 `Response` 物件——
   這是唯一由 Router 負責的「HTTP 相關」邏輯，controller 本身完全不碰
   `Response`/status code/header。

找不到符合 path 的 route 回 `404 not_found`；path 有比對到但 method
不符回 `405 method_not_allowed`；handler 執行時丟出例外會被 `handle()`
攔截並轉成 `500` 回應（防止一個 controller 的未預期錯誤讓整個 Router 掛掉，
雖然 TASK1.20 的 controller 本身已經有 try/catch，這裡是多一層防呆）。

## Request Context 設計

`router.handle(request, context)` 的兩個參數分工：

- `request`：這次要處理的「請求」，最小介面是 `{method, pathname}`
  （或 `{method, url}`，Router 會自己用 `new URL(url).pathname` 取出路徑），
  可以額外帶 `payload`（已解析好的 body）、`cookieHeader`、`options`——
  這些是各路由檔案（`auth_routes.js`/`user_routes.js`）決定要不要用、
  要怎麼轉給對應 controller 的。刻意不要求是真正的 Fetch API `Request`，
  因為本次不接 worker.js，真正的 HTTP body/cookie 解析邏輯留給未來
  接線時再處理。
- `context`：呼叫方（未來的 worker.js 或測試）準備好的
  `{db, env, services}`——`db` 是 `createDb(env)`（TASK1.12）的輸出，
  `services` 保留給未來需要額外注入的情境（本次任務尚未用到）。

Router 把 `request` 存成 `params.req`、把路由參數解析結果存成
`params.params`，兩者跟原本的 `context` 合併後才交給 handler，所以
handler 收到的單一物件形狀是 `{req, params, db, env, services}`。

## 已註冊路由

| Method | Path | Controller |
|---|---|---|
| `POST` | `/auth/guest` | `loginGuestController` |
| `POST` | `/auth/provider` | `loginProviderController` |
| `POST` | `/auth/logout` | `logoutController` |
| `GET` | `/auth/me` | `currentUserController` |
| `GET` | `/users/:id` | `getUserByIdController` |

## Request Flow（以 `GET /users/123` 為例）

```
呼叫方組出 request={method:'GET', pathname:'/users/123'}
  與 context={db, env}
        │
        ▼
router.handle(request, context)
  → 比對到 user_routes.js 註冊的 GET /users/:id
  → 解析出 params={id:'123'}
  → 組出 routeContext={req, params, db, env}
        │
        ▼
user_routes.js 的 handler
  → getUserByIdController(ctx.db, {userId: ctx.params.id})
        │
        ▼
Controller（TASK1.20）
  → 呼叫 user_service.getUserById()（TASK1.15）
  → 回傳 {ok:true, data:{user:{...}}} 或 {ok:false, reason:..., status:404}
        │
        ▼
router.js 的 makeResponse()
  → new Response(JSON.stringify(result), {status, headers:{'Content-Type':'application/json'}})
```

## 為何目前沒有任何地方 import `src/routes/`

`src/routes/index.js` 的 `createAppRouter()` 是唯一把全部路由組裝起來
的地方，但**本次沒有任何測試以外的檔案 import 它**，`src/worker.js`
更是完全沒有引用這個目錄。這是刻意的：本次任務範圍只是「建立基礎架構」，
不是「建立正式 API」，維持零破壞原則（現有 QUEST / 身份測驗 / 五大系統
互通 / 情境演練 / 營養素資料 / UI / KV 同步行為完全不受影響）。

## 測試方式

`backups/phase1-task1.21-router/test_router_mock.mjs`：純記憶體 mock db，
完全不連線任何真實或本機模擬的資料庫，不建立任何真實使用者 session，
也不會真的呼叫 OAuth/Session 相關邏輯（controller 底下的 service 全部
換成 mock）。

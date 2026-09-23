# Middleware Layer（Phase 1 TASK 1.27）

為未來登入、權限、資料驗證建立統一入口。**本次只建立架構，不開啟正式
功能**：`router.js`（TASK1.21）接入時一律傳入空的 middleware 清單，
所有既有路由（auth/user/legacy）的輸出與接入前完全一致。

## 目錄結構

```
src/middleware/
├── README.md
├── error_handler.js     # withErrorHandling(handler)：統一例外攔截
├── auth_middleware.js     # requireAuth(options)：登入驗證middleware（未強制任何route）
├── validator.js             # validateBody(schema, data)：request body基礎驗證
├── request_context.js         # buildRequestContext(base)：補上requestId/timestamp/user
└── index.js                     # createMiddlewarePipeline(middlewares)：組裝入口
```

## error_handler.js

`withErrorHandling(handler)` 包住一個 route handler，捕捉例外並轉成跟
TASK1.20 `src/controllers/response.js` 完全一樣的格式
`{ok:false, reason, status}`——不新增另一套錯誤格式。沒有例外時原樣
回傳 handler 的回傳值（plain object 或真正的 `Response`，見TASK1.26的
Response透傳規則），確保「禁止改變既有route輸出」。

## auth_middleware.js

`requireAuth(options)` 回傳一個 `(ctx, next) => any` 形狀的 middleware，
借用 TASK1.13B/1.19 已驗證過的 `validateSessionWithIdentity()`。**這是
完整、可運作的邏輯，但本次沒有任何 `router.add()` 呼叫把它接進任何路由
的 middleware 清單**，所以不會影響任何現有請求——只是把「驗證身份」這
件事包成 middleware 可以使用的形狀，供未來需要登入才能存取的路由使用。

## validator.js

`validateBody(schema, data)` 提供最基本的 schema 驗證
（`{[field]: {required?, type?}}`），回傳 `{ok, errors}`。不支援巢狀
物件/陣列元素型別等進階規則——那些留給實際有 route 需要驗證時再依需求
擴充。

## request_context.js

`buildRequestContext(base)` 補上 `{requestId, timestamp, user, db, env}`。
`requestId`/`timestamp` 是每次呼叫都重新產生的請求層級中繼資料（本次
沒有任何地方讀取或記錄它），`user` 預設 `null`。跟 TASK1.22
`src/adapters/context_builder.js` 的 `createRequestContext(env, request)`
是不同的東西（那個組裝一次請求要用到的 db/env/services 給 Worker
Adapter，這個是 middleware pipeline 內部補完 ctx 用），刻意用不同函式
名稱避免混淆。

## index.js — createMiddlewarePipeline(middlewares)

```
createMiddlewarePipeline(middlewares) 回傳 applyPipeline(handler)
  applyPipeline(handler) 回傳 (ctx) => Promise<any>
    執行順序：
      buildRequestContext() 補完ctx
        → middlewares[0](ctx, next)
          → middlewares[1](ctx, next)
            → ...
              → handler(ctx)
    全程包在 withErrorHandling() 裡
```

## Router整合

`src/routes/router.js`（TASK1.21）的 `handle()` 內部，呼叫每個已比對到
的 route handler 之前，先用 `createMiddlewarePipeline([])`（空陣列）
包一層再呼叫。因為陣列是空的，實際效果只有「補完ctx欄位 + 例外攔截」，
不會呼叫任何 middleware，也就不會改變任何既有 route 的輸出——`auth_
routes.js`/`user_routes.js`/`legacy_routes.js`（TASK1.26）目前都沒有
指定任何 middleware。

## 測試方式

`backups/phase1-task1.27-middleware/test_middleware_mock.mjs`：純記憶體
測試，完全不連線任何真實或本機模擬的資料庫，不建立任何真實使用者
session，不會真的呼叫 Google OAuth。

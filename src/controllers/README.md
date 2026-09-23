# Controller Layer（Phase 1 TASK 1.20）

> **更新記錄（TASK1.39 架構一致性檢查）**：下方「本次不建立任何正式
> API endpoint、不接真實登入流程」與「目錄結構只有4個檔案」的敘述已
> 過時。目前 `src/controllers/` 實際共有 6 個 controller 檔案，全部
> 都已被真實路由使用：
>
> | 檔案 | 建立於 | 服務的路由 |
> |---|---|---|
> | `auth_controller.js` | TASK1.20 | `/auth/guest`、`/auth/provider`、`/auth/logout`、`/auth/me`、`/auth/provider/upgrade`、`/auth/google/callback` |
> | `user_controller.js` | TASK1.20 | 目前未掛任何route（見下方「User Controller」章節說明） |
> | `data_controller.js` | TASK1.35 | 10條 `/api/explorations`、`/api/food-events`、`/api/emotions`、`/api/behaviors`、`/api/reports` |
> | `dashboard_controller.js` | TASK1.36 | `GET /api/dashboard` |
> | `profile_controller.js` | TASK1.37 | `GET`/`PATCH /api/profile` |
> | `timeline_controller.js` | TASK1.38 | `GET /api/timeline` |
>
> 所有 `/api/*` controller 一律遵守同一套安全模型：`userId` 是獨立
> 參數，一律來自 `requireAuth()` 驗證後放進 `ctx.user.id`，從不讀取
> payload/query 裡的 `user_id`。以下內容保留原始設計記錄，僅此處
> 更正現況。

## 目錄結構

```
src/controllers/
├── README.md
├── response.js          # success(data) / failure(reason, status) 統一回應格式
├── auth_controller.js     # loginGuestController / loginProviderController / logoutController / currentUserController
└── user_controller.js      # getUserByIdController（見下方說明）
```

## 分層位置

```
worker.js
   ↓（future）
API route
   ↓
Controller（這裡）
   ↓
Application Service（TASK1.19）/ Domain Service（TASK1.15）
   ↓
Identity Layer / Session Layer / DB Access Layer
   ↓
D1
```

## Controller 原則

每個 controller function 只做三件事：**接收輸入 → 呼叫對應的 service 函式 →
用 `response.js` 格式化回傳**。一律不允許：

- ❌ SQL / `db.prepare()` / 任何 D1 操作
- ❌ KV 操作
- ❌ OAuth 流程本身（不 import `src/oauth/`）
- ❌ session 邏輯本身（不 import `src/auth/session.js` 或
  `src/identity/session_rules.js`）

這些全部委派給 `src/services/auth_application_service.js`（TASK1.19）或
`src/services/user_service.js`（TASK1.15）。

參數刻意不是 Fetch API 的 `Request` 物件——本次沒有任何路由，也沒有
`worker.js` 會呼叫這些函式，所以用「已經解析好的 payload / cookie 字串」
這種與傳輸協定無關的參數，未來不論接什麼框架，只需要在 route 那一層做
參數轉換，controller 本身不用改。

## Auth Controller

| 函式 | 對應未來路由 | 委派給 |
|---|---|---|
| `loginGuestController(db, payload, options)` | `POST /auth/guest` | `createGuestLogin()` |
| `loginProviderController(db, payload, options)` | `POST /auth/provider` | `loginWithProvider()` |
| `logoutController(db, cookieHeader, options)` | `POST /auth/logout` | `logout()` |
| `currentUserController(db, cookieHeader, options)` | `GET /auth/me` | `getCurrentUser()` |

**範圍說明**：本次規格明確列出的是這 4 個函式，`upgradeGuestLogin()`
（TASK1.19 已有）尚未被任何 controller 包裝——這不是遺漏，是按規格字面
範圍執行；若未來需要 `POST /auth/upgrade` 這類路由，屆時再依同樣的模式
（Request → Service → Response）補上對應的 controller function 即可。

## User Controller

本次規格只列出檔名、未詳細定義函式內容。依同樣的架構原則，補上一個
最基本、風險最低的讀取型 controller：`getUserByIdController(db, payload)`，
依 `payload.userId` 呼叫 TASK1.15 的 `user_service.getUserById()`。這跟
`currentUserController()`（依「目前登入的 cookie」取得使用者）是不同的
關注點——這裡是「已知某個 userId，查詢它的資料」。

## Response Format

```js
success(data)      // → { ok: true, data: {...} }
failure(reason, status)  // → { ok: false, reason: "...", status?: number }
```

`status` 是選填的，供未來真正接上 HTTP route 時決定回應狀態碼用，這個檔案
本身不含任何 HTTP 相關邏輯。

## 測試方式

`backups/phase1-task1.20-controller/test_controller_mock.mjs`：純記憶體 mock db，
完全不連線任何真實或本機模擬的資料庫，不建立任何真實使用者 session。

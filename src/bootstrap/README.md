# Bootstrap Layer（Phase 1 TASK 1.23）

> **更新記錄（TASK1.39 架構一致性檢查）**：下方「本次不修改
> `src/worker.js`」「不建立正式API endpoint」的敘述已過時，且下方
> 「目錄結構」缺少 TASK1.25 新增的 `route_gateway.js`。目前
> `src/bootstrap/` 實際有兩個檔案：
>
> ```
> src/bootstrap/
> ├── README.md
> ├── application.js       # createApplication(env)：組裝{config,db,services,router,middleware}
> └── route_gateway.js       # createRouteGateway({app,legacyHandler})：TASK1.25起決定請求走Router還是legacy handler
> ```
>
> `src/worker.js` 自 TASK1.24 起在每個請求開頭呼叫
> `createApplication(env)`，並用其 `router`/`db` 服務 TASK1.29～1.38
> 已上線的全部21條路由；`route_gateway.js` 則是 `/api/sync` 等 Legacy
> 路徑與尚未遷移路徑的 fallback 判斷邏輯（見該檔案內部說明）。以下內容
> 保留原始設計記錄，僅此處更正現況。

## 目錄結構

```
src/bootstrap/
├── README.md
└── application.js   # createApplication(env)：組裝 {config, db, services, router}
```

## Bootstrap Flow

```
env
  │
  ├─→ getEnvConfig(env)    ─┐
  ├─→ getAuthConfig(env)    ├─→ config = {env, auth, app}
  ├─→ getAppConfig(env)    ─┘
  │
  ├─→ createDb(env)（TASK1.12）           →  db
  │
  ├─→ 注入 authApplicationService／userService／
  │    explorationService／foodService／emotionService／
  │    behaviorService／reportService                      →  services
  │
  └─→ createAppRouter()（TASK1.21）        →  router

createApplication(env) 回傳 { config, db, services, router }
```

`createApplication()` 只做組裝，不執行任何業務邏輯——不呼叫任何
service 函式、不驗證 session、不建立真實使用者、不執行 Legacy
Import。跟 TASK1.22 的 `context_builder.js` 的差異：`context_builder`
是「每次請求」要用到的東西（含 `req`，且不含 `config`／`router`），
`createApplication()` 是「應用程式啟動一次」要準備好的東西（含
`config`／`router`，不含單次請求的 `req`）——兩者服務不同的層次，
未來真正接線時，`worker_adapter.js` 很可能會改成呼叫一次
`createApplication()`拿到 router，再對每個請求呼叫
`context_builder.js` 組出單次請求的 context，但那是之後任務的範圍，
本次兩邊仍各自獨立、沒有互相依賴或修改對方。

## 為何目前沒有任何地方呼叫 `createApplication()`

跟本次任務要求的其他基礎架構一樣，`src/worker.js` 完全沒有引用
`src/bootstrap/` 或 `src/config/`，維持零破壞原則（現有 QUEST / 身份
測驗 / 五大系統互通 / 情境演練 / 營養素資料 / UI / KV 同步行為完全
不受影響）。

## 測試方式

`backups/phase1-task1.23-bootstrap/test_bootstrap_mock.mjs`：純記憶體
mock D1 binding，完全不連線任何真實或本機模擬的資料庫，不建立任何
真實使用者 session，測試裡用的 OAuth client id/secret 都是假值。

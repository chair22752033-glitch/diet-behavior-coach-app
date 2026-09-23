# Contract Layer（Phase 1 TASK 1.28）

統一 request/response schema 的權威來源。**本次只建立規範與驗證能力，
不啟用新功能**：目前沒有任何 route 的 middleware 清單實際套用 contract
validation（見 `src/routes/router.js` 仍是空 middleware 清單，
TASK1.27）。

## 目錄結構

```
src/contracts/
├── README.md
├── response_contract.js   # success(data) / failure(reason,status) 的唯一權威定義
├── auth_contract.js         # loginGuest/loginProvider/logout/currentUser 的 request/response 規格
├── user_contract.js           # getUserById 的 request/response 規格
└── index.js                     # 統一輸出入口
```

## response_contract.js

`success(data)`/`failure(reason,status)` 內容跟 TASK1.20原本
`src/controllers/response.js` 定義的完全一致，只是把「權威來源」搬到
這裡。`src/controllers/response.js` 現在改成單純 re-export 這裡的實作
（向下相容既有 import 路徑），`auth_controller.js`/`user_controller.js`
則直接從這裡 import——controller 本身不再定義回應形狀，只負責呼叫。

## auth_contract.js / user_contract.js

每個 contract 是 `{request, response}` 形狀的規格資料，不含任何邏輯：

- `request`：跟 TASK1.27 `src/middleware/validator.js` 的
  `validateBody(schema, data)` 完全相容的 schema，可以直接拿來驗證。
- `response`：文件性質的描述（成功欄位、失敗reason清單、可能的status
  碼），供未來開發/測試對照，不是可執行的驗證規則。

涵蓋：`loginGuestContract`、`loginProviderContract`、`logoutContract`、
`currentUserContract`、`getUserByIdContract`——對應TASK1.19/1.20已經
存在的5個controller函式。

## Validator整合（TASK1.27 → TASK1.28）

`src/middleware/validator.js` 新增：

- `validateContract(contract, data)`：對 `contract.request` 呼叫既有的
  `validateBody()`。
- `createContractValidationMiddleware(contract, getData?)`：把
  `validateContract()` 包成 middleware pipeline（TASK1.27）可用的
  `(ctx,next)` 形狀，驗證失敗時短路回傳 `{ok:false,reason:'invalid_payload',status:400,errors}`。

理論上的完整流程：

```
request → contract validator（createContractValidationMiddleware） → route handler → controller → service
```

**這條流程目前沒有被任何實際 route 使用**——`router.js` 呼叫
`createMiddlewarePipeline([])` 時清單仍是空的，`auth_routes.js`/
`user_routes.js`/`legacy_routes.js` 都沒有把這個 middleware 加進去。
這是刻意的：跟 TASK1.27 的 `requireAuth()` 一樣，先把完整、可運作的
能力準備好，不代表任何一條現有路由的行為改變。

## Controller整合

`auth_controller.js`/`user_controller.js` 的 `import` 已經改成：

```js
import { success, failure } from '../contracts/response_contract.js';
```

取代原本的 `from './response.js'`，但兩者回傳值完全相同（同一份實作），
既有的成功/失敗回應格式不變。

## 測試方式

`backups/phase1-task1.28-contract/test_contract_mock.mjs`：純記憶體
測試，完全不連線任何真實或本機模擬的資料庫，不建立任何真實使用者
session。

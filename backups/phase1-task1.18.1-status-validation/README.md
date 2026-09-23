# TASK 1.18.1 測試結果｜Login Flow Identity Status Validation 修正

執行日期：2026-09-23

## 新增測試：22 / 22 通過

`test_status_validation_mock.mjs`：純記憶體 mock db，完全不連線任何真實或本機模擬的資料庫，不寫入任何真實使用者資料。

| # | 測試項目 | 結果 |
|---|---|---|
| 1 | active user login PASS | ✅ PASS |
| 2 | suspended user login FAIL | ✅ PASS |
| 3 | deleted user login FAIL | ✅ PASS |
| 4 | suspended guest upgrade FAIL | ✅ PASS |
| 5 | deleted guest upgrade FAIL | ✅ PASS |
| 6 | session 不會建立 | ✅ PASS |
| 7 | provider identity 不重複建立 | ✅ PASS |
| 8 | 正向流程（createGuestLogin/loginWithProvider/upgradeGuestLogin/resolveLoginIdentity）依然正常 | ✅ PASS |

```
執行方式：node backups/phase1-task1.18.1-status-validation/test_status_validation_mock.mjs
```

## 回歸測試：既有 6 套測試合計 260 項全數通過

| 套件 | 項數 | 結果 |
|---|---|---|
| TASK1.13B（User Identity Layer） | 39 | ✅ 全數PASS（含1項測試修正） |
| TASK1.14（Guest Lifecycle） | 24 | ✅ 全數PASS |
| TASK1.15（Domain Service） | 34 | ✅ 全數PASS |
| TASK1.16（Legacy Import） | 46 | ✅ 全數PASS |
| TASK1.17（OAuth Provider） | 51 | ✅ 全數PASS |
| TASK1.18（Login Flow） | 44 | ✅ 全數PASS |

**TASK1.13B 測試修正說明**：`backups/phase1-task1.13b-user-identity/test_identity_layer_mock.mjs` 的
`provider_already_linked` 測試案例，原本的 mock 訪客使用者物件缺少 `status` 欄位（真實訪客一律由
`createGuestUser()` 產生，`status` 必定有值）。加入 TASK1.18.1 的狀態驗證後，這個不符合真實資料形狀的
mock 會被新的狀態檢查提前擋下（`user_status_unknown`），導致測試改為驗證到錯誤的分支。已補上
`status: 'active'`，讓 mock 資料符合真實情況，測試恢復驗證原本要驗證的 `provider_already_linked` 邏輯。
這是**測試修正**，不是修改任何 production 程式邏輯。

## Code Scan

`grep` 掃描 `login_identity.js`/`upgrade.js`/`auth_service.js`/`login_session.js`，確認無 `client_secret`/`access_token`/`refresh_token` 寫死字串、無 Google 真實憑證格式（`GOCSPX-`/`ya29.`）。

## 資料庫狀態

本地與正式 D1 皆確認：
```json
{"users":0,"sessions":0,"nu":67,"sc":14}
```
本次未新增 migration，未寫入任何資料。

## P1～P6

見 `p1-p6-check/`，8/8 全數通過。

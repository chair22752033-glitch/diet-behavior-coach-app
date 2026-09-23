# TASK 1.18 測試結果｜正式 Login Flow（Guest → OAuth → Session）

執行日期：2026-09-23

## 單元測試：44 / 44 通過

`test_login_flow_mock.mjs`：純記憶體 mock db 物件，完全不連線任何真實或本機模擬的資料庫，也不寫入任何真實使用者資料。涵蓋三大流程：

| 群組 | 測試數 | 結果 |
|---|---|---|
| Guest Flow（含建立失敗路徑） | 8 | ✅ PASS |
| Provider Flow - 新使用者 | 7 | ✅ PASS |
| Provider Flow - 既有使用者（防重複建立） | 5 | ✅ PASS |
| Provider Flow - 錯誤情境 | 3 | ✅ PASS |
| Upgrade Flow（含session撤銷驗證） | 9 | ✅ PASS |
| Upgrade Flow - 錯誤情境 | 3 | ✅ PASS |
| resolveLoginIdentity 直接單元測試 | 3 | ✅ PASS |
| loginSession/logoutSession 直接單元測試 | 6 | ✅ PASS |

```
執行方式：node backups/phase1-task1.18-login-flow/test_login_flow_mock.mjs
```

## 重點驗證項目

- **Guest Flow**：`createGuestLogin()` 建立訪客 + session，失敗時不會半途建立 session
- **Provider Flow 防重複**：同一組 `auth_provider`+`auth_provider_id` 呼叫兩次，`user_id` 完全相同、資料庫只有 1 筆 user、第二次正確更新 `last_login_at`
- **Upgrade Flow 完整性**：升級前後 `user_id` 不變、升級後 `is_guest` 正確變更、**訪客時期的舊 session 被正確撤銷**、新 session 可正常使用、全程資料庫只有 1 個 user（沒有另建新帳號）
- **錯誤情境**：非 guest 升級拒絕、不存在的 user 拒絕、identity 格式不完整拒絕，皆沿用 TASK1.14 既有規則，未重複實作

## p1-p6-check/

P1～P6 基準測試重跑結果（沿用 TASK0.5 的 `baseline_capture.script.js`），因 `src/worker.js` 本次零修改，8/8 全數通過。

# TASK 1.14 測試結果｜Guest Lifecycle 與資料歸屬流程

執行日期：2026-09-22

## 測試檔案

`test_guest_lifecycle_mock.mjs`：純記憶體 mock D1 binding，完全不連線任何真實或本機模擬的資料庫，也不寫入任何真實使用者資料。涵蓋任務要求的全部 7 項測試：

| # | 測試項目 | 結果 |
|---|---|---|
| 1 | 建立 guest user 成功 | ✅ PASS（5項細節斷言） |
| 2 | guest user 建立 session 成功 | ✅ PASS（4項細節斷言） |
| 3 | guest 升級 provider 後 user_id 不變 | ✅ PASS（5項細節斷言） |
| 4 | 升級後歷史資料關聯仍存在 | ✅ PASS（3項細節斷言） |
| 5 | 非 guest 不允許升級 | ✅ PASS |
| 6 | 錯誤 provider 被拒絕 | ✅ PASS（3種情境） |
| 7 | session revoke 規則正常 | ✅ PASS（2項細節斷言） |

**總計：24 / 24 項全數通過**

```
執行方式：node backups/phase1-task1.14-guest-lifecycle/test_guest_lifecycle_mock.mjs
```

## p1-p6-check/

P1～P6 基準測試重跑結果（沿用 TASK0.5 的 `baseline_capture.script.js`），因 `src/worker.js` 本次零修改，8/8 全數通過，詳見 TASK1.14 執行報告本體。

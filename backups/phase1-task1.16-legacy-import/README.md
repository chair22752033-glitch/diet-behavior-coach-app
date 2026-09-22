# TASK 1.16 測試結果｜Legacy Import Service Layer

執行日期：2026-09-22

## A. 單元測試：46 / 46 通過（要求30項以上）

`test_legacy_import_mock.mjs`：純記憶體 mock db 物件，沿用 TASK1.9 現成的
`scripts/legacy_import/fixtures/sample_legacy_blob.json`（全為虛構占位內容），
完全不連線任何真實或本機模擬的資料庫，也不寫入任何真實使用者資料。

| # | 測試項目 | 細節斷言數 | 結果 |
|---|---|---|---|
| 1 | fixture legacy data 成功 import | 7 | ✅ PASS |
| 2 | parser → service → domain flow 正常 | 6 | ✅ PASS |
| 3 | guest user 自動建立 | 6 | ✅ PASS |
| 4 | quest records 正確建立 | 4 | ✅ PASS |
| 5 | food → emotion 關聯正常 | 5 | ✅ PASS |
| 6 | transaction rollback 測試 | 8 | ✅ PASS |
| 7 | 錯誤 JSON 不造成 crash | 6 | ✅ PASS |
| 8 | 重複 import 防呆 | 4 | ✅ PASS |

```
執行方式：node backups/phase1-task1.16-legacy-import/test_legacy_import_mock.mjs
```

## B. SQL 驗證：10 / 10 通過

`validate_legacy_import_sql_against_schema.mjs`：用 `EXPLAIN` 對本機模擬的真實
D1 schema 驗證新增的 `legacy_import_logs` 4 條 SQL，以及 `import_transaction.js`
回滾機制用的 6 條 DELETE 陳述式，零副作用（不執行、不寫入）。

```
執行方式：node backups/phase1-task1.16-legacy-import/validate_legacy_import_sql_against_schema.mjs
```

## C. 資料庫狀態：本地與正式皆確認 users=0、sessions=0

```json
{"users":0,"sessions":0,"er":0,"fe":0,"em":0,"bp":0,"ar":0,"lil":0,"nu":67,"sc":14}
```

## D. P1～P6：8 / 8 PASS

見 `p1-p6-check/`，因 `src/worker.js` 本次零修改，沿用 TASK0.5 腳本重跑全數通過。

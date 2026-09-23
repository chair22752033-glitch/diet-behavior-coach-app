# D1 Database Access Layer（Phase 1 TASK 1.12）

> **更新記錄（TASK1.39 架構一致性檢查）**：本文件下方「本次任務範圍內
> worker.js 沒有 import 這裡任何檔案」的敘述是 TASK1.12 當時的真實
> 狀態，現已過時——`src/worker.js` 自 TASK1.29 起，透過
> `src/bootstrap/application.js` → `createDb(env)` 正式啟用這整層，
> `/auth/*`、`/api/*` 全部路由的登入/資料存取都會呼叫這裡的方法讀寫
> 真實 D1。`tables/` 目錄也已從當時的 6 張表擴充為 9 張（新增
> `sessions.js`、`legacy_import_logs.js`、`auth_audit_logs.js`）。
> 以下內容保留原始設計記錄，僅此處更正現況。

這個目錄只是「基礎層」：把 D1 的原始 PreparedStatement API 包裝成好用、統一錯誤處理的介面，
供未來 `src/worker.js` 準備好接入 D1 時直接呼叫。

**本次任務範圍內，`src/worker.js` 沒有任何一行 `import` 這裡的任何檔案**——這是刻意的，
因為 TASK1.12 的限制是「不接入現有功能」。什麼時候、要不要接進去，是後續任務的決定。

## 目錄結構

```
src/db/
├── query.js              # 最底層：run/all/first，包裝 db.prepare().bind().run()/.all()/.first()
├── transaction.js         # batch/withTransaction，包裝 D1 原生 db.batch()
├── index.js               # createDb(env) 統一入口，組合上面兩層 + 每張表的 helper
└── tables/
    ├── users.js
    ├── exploration_records.js
    ├── food_events.js
    ├── emotion_records.js
    ├── behavior_patterns.js
    └── ai_reports.js
```

## 使用方式（未來，本次不執行）

```js
import { createDb } from './db/index.js';

// 在 fetch(request, env, ctx) 裡：
const db = createDb(env);

const result = await db.users.insert({
  id: 'uuid-...',
  is_guest: true,
  legacy_sync_code: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

if (!result.ok) {
  // result.error 是字串，不會拋出例外
}

// 交易範例：同時寫入 food_event 與關聯的 emotion_record
const txResult = await db.withTransaction(async (addStatement) => {
  addStatement('INSERT INTO food_events (...) VALUES (...)', [...]);
  addStatement('INSERT INTO emotion_records (...) VALUES (...)', [...]);
});
```

## 設計原則

1. **每一層只做一件事**：`query.js` 不知道任何表的欄位長怎樣，只負責「執行SQL、回傳結構化結果、絕不拋出例外」；`tables/*.js` 才知道欄位名稱，負責組SQL；`index.js` 只負責把兩者兜起來
2. **絕不拋出例外**：`run`/`all`/`first` 內部都用 try/catch，失敗時回傳 `{ok:false, error:'...'}`，呼叫端不需要包 try/catch 也不會讓整個request掛掉
3. **INSERT 一律用 `RETURNING id`**：D1（SQLite）支援 `RETURNING` 子句，insert 後立刻拿到自增id，不需要再多一次查詢，也解決了 TASK1.9 legacy import mapping 文件裡提到的「`food_events`↔`emotion_records` 關聯要等真正寫入才知道id」的問題
4. **createDb(env) 是唯一入口**：如果 `env.DIET_COACH_DB` 不存在會立刻拋出清楚的錯誤訊息，而不是讓後面的程式碼因為呼叫 undefined 的方法而產生難懂的錯誤

## 可支援操作

| 表 | insert | getById | 其他查詢 |
|---|---|---|---|
| users | ✅ | ✅ | `getByLegacySyncCode`、`listRecent` |
| exploration_records | ✅（RETURNING id） | ✅ | `listByUser` |
| food_events | ✅（RETURNING id） | ✅ | `listByUser` |
| emotion_records | ✅（RETURNING id） | ✅ | `listByUser`、`listByFoodEvent` |
| behavior_patterns | ✅（RETURNING id） | ✅ | `listByUser`、`listByUserAndType` |
| ai_reports | ✅（RETURNING id） | ✅ | `listByUser` |

外加底層通用能力：`db.run(sql, params)`、`db.all(sql, params)`、`db.first(sql, params)`（給沒有專屬 helper 的臨時查詢用）、`db.batch(statements)`、`db.withTransaction(builderFn)`。

## 測試方式

因為「不接入現有功能」、「不寫入真實使用者資料」，測試分兩種、都是零副作用：

1. **`test_db_layer_mock.mjs`**（純記憶體 mock，19項）：用假的 D1 binding（記錄呼叫內容，不連線任何資料庫）驗證每一層的邏輯正確性——SQL組出來對不對、參數順序對不對、成功/失敗都不拋出例外、`RETURNING id` 有沒有正確傳遞
2. **`validate_sql_against_schema.mjs`**（EXPLAIN唯讀驗證，21項）：把每個 helper 實際用到的 SQL 字串，用 `EXPLAIN <sql>` 對本機模擬的真實 D1 schema（TASK1.7建立的11張表）驗證語法與欄位名稱正確性。`EXPLAIN` 只編譯成bytecode、不執行，是零副作用的驗證方式

兩份測試腳本位於 `backups/phase1-task1.12-db-access-layer/`。

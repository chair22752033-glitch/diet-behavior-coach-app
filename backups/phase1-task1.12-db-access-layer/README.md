# TASK 1.12 執行結果｜建立 D1 Database Access Layer

執行日期：2026-09-22

限制遵守情形：
✅ 不修改現有 UI｜✅ 不接入現有功能（`src/worker.js` 零修改，`git diff --stat` 為空，沒有任何 `import` 指向 `src/db/`）｜✅ 不建立登入流程｜✅ 不建立 API endpoint｜✅ 不寫入真實使用者資料（本機模擬D1的 users/exploration_records/food_events/emotion_records/behavior_patterns/ai_reports 六張表在驗證前後皆為 0 筆，見下方驗證結果）｜✅ 不修改 KV 行為（未觸碰任何 KV 相關程式碼）｜✅ 不進行 Legacy migration（未執行 TASK1.9 parser、未搬動任何舊資料）

---

## 一、新增檔案

本次**只新增檔案，未修改任何既有檔案**（`src/worker.js`、`wrangler.toml` 皆零異動）：

```
src/db/
├── README.md                        # 架構說明文件
├── query.js                         # 底層 query wrapper（run/all/first）
├── transaction.js                   # transaction 基礎架構（batch/withTransaction）
├── index.js                         # createDb(env) 統一入口
└── tables/
    ├── users.js
    ├── exploration_records.js
    ├── food_events.js
    ├── emotion_records.js
    ├── behavior_patterns.js
    └── ai_reports.js

backups/phase1-task1.12-db-access-layer/
├── README.md                        # 本報告
├── test_db_layer_mock.mjs           # 純記憶體mock單元測試（19項）
└── validate_sql_against_schema.mjs  # EXPLAIN唯讀SQL語法驗證（21項）
```

---

## 二、架構說明

三層式設計，每層職責單一：

```
┌─────────────────────────────────────────────┐
│  tables/*.js（知道欄位名稱，組SQL）            │
│  users / exploration_records / food_events /  │
│  emotion_records / behavior_patterns /        │
│  ai_reports                                   │
└──────────────────┬────────────────────────────┘
                    │ 呼叫
┌───────────────────▼────────────────────────────┐
│  query.js（不知道任何表長怎樣，只管執行SQL）      │
│  run() / all() / first()                        │
│  — 一律 try/catch，失敗回傳 {ok:false,error}     │
│    絕不拋出例外                                  │
└──────────────────┬────────────────────────────┘
                    │ 呼叫 db.prepare().bind()
┌───────────────────▼────────────────────────────┐
│  transaction.js（多個statement一次送出）          │
│  batch() 包裝 D1 原生 db.batch()                 │
│  withTransaction() 高階建構器                     │
└──────────────────┬────────────────────────────┘
                    │
              env.DIET_COACH_DB（TASK1.11接入的binding）
```

`index.js` 的 `createDb(env)` 是唯一對外入口，把上述三層組合成一個物件：
```js
const db = createDb(env);
db.users.insert({...});          // 表專屬 helper
db.run('SELECT 1');              // 底層通用查詢
db.withTransaction(fn);          // 交易
```

**設計重點**：
1. **INSERT 一律用 `RETURNING id`**——D1（SQLite）支援這個語法，寫入後立刻拿到自增id，不必多一次查詢。這直接解決 TASK1.9 legacy import mapping 文件裡提到的問題：`emotion_records.linked_food_event_id` 需要等 `food_events` 真正寫入後才知道id，現在 `foodEvents.insert()` 回傳的 `{ok, id}` 就是這個真正的id
2. **絕不拋出例外**：所有函式內部都是 try/catch，失敗時回傳結構化的 `{ok:false, error:'...'}`，呼叫端不用額外包 try/catch
3. **binding 缺失時立刻給清楚錯誤**：`createDb({})` 會拋出「`env.DIET_COACH_DB` binding 不存在」，而不是讓後續程式碼因為呼叫 `undefined.prepare()` 而產生難懂的錯誤

---

## 三、可支援操作

| 表 | insert（RETURNING id） | getById | 其他查詢 |
|---|---|---|---|
| users | ✅（id為呼叫端提供的TEXT） | ✅ | `getByLegacySyncCode`、`listRecent` |
| exploration_records | ✅ | ✅ | `listByUser` |
| food_events | ✅ | ✅ | `listByUser` |
| emotion_records | ✅ | ✅ | `listByUser`、`listByFoodEvent` |
| behavior_patterns | ✅ | ✅ | `listByUser`、`listByUserAndType` |
| ai_reports | ✅ | ✅ | `listByUser` |

外加底層通用能力：`run(sql,params)`、`all(sql,params)`、`first(sql,params)`（給沒有專屬 helper 的臨時查詢用）、`batch(statements)`、`withTransaction(builderFn)`。

---

## 四、測試方式

因限制「不接入現有功能」、「不寫入真實使用者資料」，採用兩種**零副作用**的測試方式：

### (1) 純記憶體 Mock 單元測試：19 / 19 通過

`node backups/phase1-task1.12-db-access-layer/test_db_layer_mock.mjs`

用假的 D1 binding（記錄呼叫內容的物件，完全不連線任何真實或本機模擬的資料庫）驗證：
- `createDb(env)` 缺少 binding 時正確拋出清楚錯誤
- `query.run/all/first` 成功與失敗兩種情況都正確處理（失敗不拋例外）
- `transaction.batch`／`withTransaction` 正確組出多個 statement 並送出
- 6 個表 helper 的 `insert` 皆正確組出 SQL 與參數順序，`RETURNING id` 正確運作
- `food_events.insert` 拿到的 id 能正確傳給 `emotion_records.insert` 的 `linked_food_event_id`（驗證關聯機制）
- `getById`／`listByUser` 正確回傳結構

```
PASS: 19 / 19
✅✅✅ 全部通過（純記憶體 mock，未連線任何真實或本機模擬的 D1）
```

### (2) EXPLAIN 唯讀語法驗證：21 / 21 通過

`node backups/phase1-task1.12-db-access-layer/validate_sql_against_schema.mjs`

把 6 個表 helper 實際用到的全部 21 條 SQL 陳述式，逐一用 `EXPLAIN <sql>`（`?` 佔位符替換為 `NULL`）對**本機模擬的真實 D1 schema**（TASK1.7建立的11張表）執行。`EXPLAIN` 只把 SQL 編譯成 SQLite 虛擬機bytecode並印出來，**完全不會真的執行、不會寫入任何資料列**，是零副作用的欄位名稱/語法正確性檢查。

```
PASS: 21 / 21
✅✅✅ 全部 SQL 陳述式皆通過 EXPLAIN 語法驗證（零副作用，未寫入任何資料）
```

### (3) 驗證後資料庫狀態核對

確認測試前後，本機模擬 D1 的資料筆數完全沒有變化：

```json
{"users":0,"exploration_records":0,"food_events":0,"emotion_records":0,"behavior_patterns":0,"ai_reports":0,"nutrients":67,"scenarios":14}
```

六張目標表皆為 0 筆（無任何資料寫入，真實或虛構皆無），`nutrients`/`scenarios` 維持 TASK1.8 seed 後的狀態不變。

---

## 五、回滾方式

本次只新增檔案，未修改任何既有檔案、未寫入任何資料庫：

```bash
git revert <本次commit hash>
```

即可完全移除 `src/db/` 整個目錄與本次的測試腳本，不影響 `src/worker.js`、`wrangler.toml`、D1 資料庫或任何正式服務。因為 `src/worker.js` 完全沒有 `import` 這個目錄下的任何檔案，就算不執行 revert，這些檔案也不會被 wrangler 打包進實際部署的 Worker（esbuild 只會打包從入口檔案 `import` 進來的模組），對正式環境零風險、零影響。

---

## 六、是否可以進入後續 TASK

**✅ 可以。** D1 Access Layer 三層架構（query/transaction/tables）皆已建立並通過兩種零副作用測試（合計40項全數通過），且全程未修改 `src/worker.js`、未寫入任何真實使用者資料、未建立 API endpoint 或登入流程、未觸碰 KV 行為、未執行任何 Legacy migration。

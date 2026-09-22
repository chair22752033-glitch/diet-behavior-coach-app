# TASK 1.13B 執行結果｜建立 User Identity 基礎架構

執行日期：2026-09-22

限制遵守情形：
✅ 不建立 Google OAuth（`provider.js` 只是名單設計，未串接任何OAuth流程）｜✅ 不建立登入頁面｜✅ 不修改 UI｜✅ 不接入現有 KV 資料（未讀取任何 `sync:*` KV內容）｜✅ 不執行 Legacy Import（未執行 TASK1.9 parser）

---

## 一、新增檔案

**只新增/擴充檔案，`src/worker.js` 與 `wrangler.toml` 皆零異動**：

```
migrations/
└── 0004_phase1_task1_13b_users_identity.sql   # users表新增 status(含CHECK約束)/last_login_at

src/db/tables/users.js   # 擴充（非新檔案）：insert()帶入status、新增getByProvider/
                          # updateStatus/upgradeToProvider/touchLogin

src/identity/
├── README.md          # 架構說明
├── status.js            # USER_STATUS常數、isValidStatus/isActiveStatus/canLogIn
├── provider.js           # SUPPORTED_PROVIDERS、isSupportedProvider/isValidProviderPair
├── guest.js               # createGuestUser/isGuestUser
├── upgrade.js              # upgradeGuestToProvider（訪客→已驗證身份，含session撤銷）
└── session_rules.js         # validateSessionWithIdentity（組合TASK1.13A的session驗證+狀態檢查）

backups/phase1-task1.13b-user-identity/
├── README.md（本報告）
├── test_identity_layer_mock.mjs              # 純記憶體單元測試（39項）
├── validate_users_sql_against_schema.mjs     # EXPLAIN唯讀SQL驗證（5項）
└── p1-p6-check/                               # P1~P6基準測試重跑結果
```

---

## 二、Users Identity Layer 設計

### 1. users table 完整化

新增兩欄：
- `status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted'))`——資料庫層級強制合法值，已實測確認非法值會被 D1 拒絕寫入
- `last_login_at TEXT`（nullable）

新增索引 `idx_users_status`。已套用至本地與正式 D1，皆確認 0 筆資料。

### 2. Guest User 模型

`createGuestUser(opts)`：純函式，訪客 = `auth_provider`/`auth_provider_id` 皆 `null` + `is_guest=true` + `status='active'`。`id` 預設用 `crypto.randomUUID()` 產生，也可指定（供未來legacy import情境使用）。

### 3. Provider 欄位設計

- `SUPPORTED_PROVIDERS = ['google']`（僅名單規劃，未串接任何實際OAuth）
- 規則：`auth_provider`/`auth_provider_id` 必須「同時有值或同時為空」，應用層（`isValidProviderPair()`）與資料庫層（TASK1.7既有的partial unique index）雙重驗證

### 4. User Status

三種狀態：`active`／`suspended`／`deleted`。`canLogIn(user)` 是統一判斷入口，回傳 `{allowed, reason}`。

### 5. Session 關聯規則（新增兩條，皆不修改TASK1.13A的`src/auth/session.js`）

- **規則1**：`upgradeGuestToProvider()`——訪客升級為已驗證身份時，除了更新 `users` 表（原地升級，`id`不變，所有既有關聯資料天然延續），還會呼叫 TASK1.13A 既有的 `db.sessions.revokeAllForUser()` 撤銷該使用者所有舊session（防止 session fixation，資安慣例：權限/信任等級改變時重新產生session）
- **規則2**：`validateSessionWithIdentity()`——在 TASK1.13A 的 `validateSession()`（session本身是否合法）之上，疊加一層「使用者狀態是否允許使用」（`canLogIn()`），兩者皆通過才視為登入有效，停權/已刪除使用者即使session本身沒過期也會被拒絕

---

## 三、測試結果

### (1) 純記憶體單元測試：39 / 39 通過

`node backups/phase1-task1.13b-user-identity/test_identity_layer_mock.mjs`

涵蓋 status（8項）/ provider（8項）/ guest（10項）/ upgrade（9項，含成功、使用者不存在、已非訪客、provider已被綁定、不支援provider、provider配對不完整等情境）/ session_rules（4項，含active通過、suspended拒絕、無cookie透傳、session指向不存在使用者時安全拒絕）。

```
PASS: 39 / 39
✅✅✅ 全部通過（純記憶體運算，未連線任何資料庫，未建立OAuth或登入頁面）
```

### (2) EXPLAIN 唯讀 SQL 語法驗證：5 / 5 通過

`node backups/phase1-task1.13b-user-identity/validate_users_sql_against_schema.mjs`

```
PASS: 5 / 5
✅✅✅ 全部 SQL 陳述式皆通過 EXPLAIN 語法驗證（零副作用，未寫入任何資料）
```

### (3) CHECK 約束實測驗證

直接對本地D1嘗試寫入不合法的 `status` 值（`'not_a_valid_status'`），確認被 D1 正確拒絕：
```
✘ CHECK constraint failed: status IN ('active','suspended','deleted')
```

### (4) P1～P6 基準測試：8 / 8 通過

沿用 TASK0.5 的 `baseline_capture.script.js`，因 `src/worker.js` 本次零修改，8/8 全數通過。

### (5) 資料庫狀態核對

```json
{"users":0,"sessions":0,"nutrients":67,"scenarios":14}
```
`users`/`sessions` 皆 0 筆，本地與正式 D1 皆確認一致，未寫入任何真實或虛構的使用者資料。

---

## 四、回滾方式

**A. 移除程式碼**
```bash
git revert <本次commit hash>
```
移除 `src/identity/` 與 `src/db/tables/users.js` 的擴充部分，因為 `src/worker.js` 完全沒有 import 這些檔案，不影響任何正式服務。

**B. 移除新增欄位（若需要，SQLite需重建表）**
```bash
npx wrangler d1 execute diet-coach-db --remote --command "ALTER TABLE users DROP COLUMN status; ALTER TABLE users DROP COLUMN last_login_at;"
```
（現代SQLite支援 `DROP COLUMN`；本地驗證環境可加 `--local`）

**C. 完全不處理**：因為新增欄位皆為nullable或有預設值、且 `src/worker.js` 完全不讀寫它們，不回滾也無風險。

---

## 五、是否可以進入後續 TASK

**✅ 可以。** users identity layer（表結構完整化、訪客模型、provider設計、狀態管理、session關聯規則）皆已建立並通過44項測試（39項邏輯測試+5項SQL驗證），且全程未建立OAuth或登入頁面、未修改UI、未接入現有KV資料、未執行Legacy Import。

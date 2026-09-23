# User Identity 基礎架構（Phase 1 TASK 1.13B）

> **更新記錄（TASK1.39 架構一致性檢查）**：下方「本次任務刻意保持
> 未啟用狀態」的敘述已過時——這個目錄自 TASK1.29～1.33 起正式啟用：
> guest/provider 登入、帳號升級、Google OAuth callback、
> `requireAuth()` 的 session+使用者狀態驗證，全部實際呼叫這裡的
> `status.js`/`provider.js`/`guest.js`/`upgrade.js`/`session_rules.js`。
> 以下內容保留原始設計記錄，僅此處更正現況。

延續 TASK1.12（D1 Access Layer）與 TASK1.13A（Session 基礎架構），把 `users` 表
「完整化」：訪客模型、provider 欄位規則、使用者狀態、以及 session 與使用者之間
該遵守的關聯規則。

**本次任務刻意保持未啟用狀態**：`src/worker.js` 沒有任何一行 `import` 這裡的任何
檔案，沒有 Google OAuth、沒有登入頁面、沒有讀取現有 KV 資料、沒有執行 Legacy Import。

## 目錄結構

```
src/identity/
├── README.md         # 本文件
├── status.js           # USER_STATUS常數、canLogIn() 等狀態判斷
├── provider.js          # SUPPORTED_PROVIDERS、provider欄位配對規則
├── guest.js              # createGuestUser()、isGuestUser()
├── upgrade.js             # upgradeGuestToProvider()（訪客→已驗證身份，含session撤銷）
└── session_rules.js        # validateSessionWithIdentity()（session合法+使用者狀態合法）

migrations/0004_phase1_task1_13b_users_identity.sql   # users表新增 status/last_login_at
src/db/tables/users.js                                 # 擴充：getByProvider/updateStatus/
                                                        # upgradeToProvider/touchLogin
```

## users table 完整化

在 TASK1.7 原始 schema 基礎上，新增：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `status` | TEXT NOT NULL DEFAULT `'active'`，`CHECK (status IN ('active','suspended','deleted'))` | 帳號狀態，由 D1 層級的 CHECK 約束保護，非法值在寫入時就會被拒絕 |
| `last_login_at` | TEXT，nullable | 最後登入時間，供未來「上次登入」類UI或活躍度分析使用 |

新增索引 `idx_users_status`（依狀態篩選）。

## Guest User 模型

```js
createGuestUser({ displayName, legacySyncCode })
// → { id, auth_provider:null, auth_provider_id:null, is_guest:true,
//     status:'active', legacy_sync_code, created_at, updated_at }
```

- 訪客 = 沒有任何外部身份（`auth_provider`/`auth_provider_id` 皆為 `null`）+ `is_guest=true`
- `id` 用 `crypto.randomUUID()` 產生，也可由呼叫端指定（例如 TASK1.9 legacy import 情境，需要用特定id）
- 純函式，只組物件、不寫入 D1（寫入交給 `db.users.insert()`）

## Provider 欄位設計

- 目前規劃：`SUPPORTED_PROVIDERS = ['google']`（尚未串接，只是預留名單）
- 規則：`auth_provider` 與 `auth_provider_id` 必須「同時有值」或「同時為 NULL」——不允許只填一個
- 這個規則同時在應用層（`isValidProviderPair()`）與資料庫層（TASK1.7 建立的
  `idx_users_auth_provider_id` partial unique index）各驗證一次，雙重保險

## User Status

三種狀態：`active`（正常）、`suspended`（停權）、`deleted`（軟刪除）。

`canLogIn(user)` 是所有「要不要讓這個使用者繼續使用」判斷的單一入口：
```js
canLogIn({status:'active'})    // {allowed:true}
canLogIn({status:'suspended'}) // {allowed:false, reason:'user_suspended'}
canLogIn({status:'deleted'})   // {allowed:false, reason:'user_deleted'}
canLogIn(null)                 // {allowed:false, reason:'user_not_found'}
```

## Session 關聯規則

延續 TASK1.13A 已經建立的 FK（`sessions.user_id → users.id ON DELETE CASCADE`），
本次新增兩條規則：

### 規則1：身份升級時，撤銷所有舊 session（`upgrade.js`）

訪客升級成已驗證身份（填入 provider/providerId）等同於「信任等級改變」，比照資安
慣例在權限變化時重新產生 session（防止 session fixation 攻擊）：

```
upgradeGuestToProvider(db, userId, 'google', 'g-123')
  1. 確認 user 存在且目前是訪客（is_guest=1 且無 auth_provider）
  2. 確認 provider 合法、且沒有被其他帳號綁定過
  3. UPDATE users：填入 auth_provider/auth_provider_id、is_guest改0
  4. 呼叫 db.sessions.revokeAllForUser()（TASK1.13A就有的函式，這裡沒有重新發明）
  5. 回傳成功；呼叫端接著自行呼叫 createSession() 發一個新session
```

**設計選擇：原地升級，不是「建立新帳號搬資料」**——因為所有子表
（exploration_records/food_events/emotion_records/behavior_patterns/ai_reports/
sessions）都用 FK 指向 `users.id`，只要 `id` 不變，訪客時期累積的所有資料完全
不需要搬動，天然延續下去。

### 規則2：session合法 ≠ 使用者狀態允許使用（`session_rules.js`）

TASK1.13A 的 `validateSession()` 只檢查 session 本身（存在/未撤銷/未過期），
不知道「使用者現在是不是被停權了」。`validateSessionWithIdentity()` 在這之上
疊加一層使用者狀態檢查：

```
validateSessionWithIdentity(db, cookieHeader)
  1. 呼叫 src/auth/session.js 的 validateSession()（TASK1.13A，完全不修改它）
  2. session本身合法的話，再查一次 users 表，用 canLogIn() 檢查狀態
  3. 兩層都通過才回傳 {ok:true, userId, user}
```

這樣設計的好處：TASK1.13A 的 `session.js`（已經過38項測試）維持不動，
身份層的規則單獨疊加在一個新檔案裡，職責分離、互不干擾。

## 測試方式

- `test_identity_layer_mock.mjs`（39項）：純記憶體mock，涵蓋 status/provider/guest/
  upgrade/session_rules 五個模組的正常與邊界情況
- `validate_users_sql_against_schema.mjs`（5項）：`EXPLAIN`唯讀驗證 `users.js`
  新增的5條SQL陳述式

兩份測試腳本位於 `backups/phase1-task1.13b-user-identity/`。

# TASK 1.13A 執行結果｜建立 Session 基礎架構

執行日期：2026-09-22

限制遵守情形：
✅ 不建立 Google OAuth（未接觸任何 OAuth 相關程式碼）｜✅ 不建立正式登入流程（沒有登入頁面、沒有任何路由）｜✅ 不修改現有 UI｜✅ 不修改 `src/worker.js` 現有路由（`git diff --stat src/worker.js` 為空）｜✅ 不接入現有使用者資料（`sessions`/`users` 表在驗證前後皆為 0 筆）｜✅ 不執行 Legacy migration（未執行 TASK1.9 parser、未搬動任何舊資料）

---

## 一、新增檔案

**只新增檔案，`src/worker.js` 與 `wrangler.toml`（binding設定部分）皆零異動**：

```
migrations/
└── 0003_phase1_task1_13a_sessions_table.sql   # 新增 sessions 表 schema

src/db/tables/
└── sessions.js                                 # D1存取層（延續TASK1.12風格）
src/db/index.js                                 # 更新：加入 sessions helper（僅新增一行掛載，其餘不變）

src/auth/
├── README.md          # 架構說明與安全考量
├── constants.js        # Cookie名稱、TTL、安全旗標預設值
├── token.js             # generateOpaqueToken、hmacSign/Verify、signToken/verifyToken、sha256Hex
├── cookie.js            # parseCookies、serializeCookie、serializeExpiredCookie
└── session.js            # createSession、validateSession、revokeSession

backups/phase1-task1.13a-session/
├── README.md（本報告）
├── test_session_layer_mock.mjs                 # 純記憶體單元測試（38項）
├── validate_sessions_sql_against_schema.mjs    # EXPLAIN唯讀SQL驗證（7項）
└── p1-p6-check/                                 # P1~P6基準測試重跑結果
```

---

## 二、Session 架構設計

### 採用「不透明 token + D1 查表」模式（非 JWT）

- Session id 是一個 256-bit 隨機字串（`crypto.getRandomValues()` 產生），存進新建立的 `sessions` 表
- 瀏覽器只透過 HttpOnly cookie 拿到這個隨機字串，本身不帶任何語意
- 每次驗證都用主鍵查一次 D1（`WHERE id = ?`），確認存在、未撤銷、未過期
- 優點：可隨時撤銷（登出立即生效），不像 JWT 簽出去就收不回來

### sessions 表 schema（`migrations/0003_...`）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | TEXT PK | 不透明 session token |
| `user_id` | TEXT，FK→users(id) ON DELETE CASCADE | |
| `created_at` | TEXT | |
| `expires_at` | TEXT | 過期時間，建立時算好寫入 |
| `last_seen_at` | TEXT，nullable | 供未來 idle timeout 用，本次未實作邏輯 |
| `user_agent` | TEXT，nullable | |
| `ip_hash` | TEXT，nullable | 只存 IP 雜湊值，見「安全考量」 |
| `revoked_at` | TEXT，nullable | 登出/撤銷時間戳，NULL表示仍有效 |

索引：`idx_sessions_user`（依user_id查詢）、`idx_sessions_expires`（供未來清理過期session用）

### Cookie 設計

- Cookie 名稱：`dbc_sid`
- 預設有效期：30 天
- 預設安全旗標：`HttpOnly`、`Secure`、`SameSite=Lax`、`Path=/`

### 三個高階函式（`src/auth/session.js`）

| 函式 | 用途 |
|---|---|
| `createSession(db, userId, opts)` | 建立session、寫入D1、回傳token與Set-Cookie字串 |
| `validateSession(db, cookieHeader, opts)` | 驗證session，回傳`{ok,userId}`或`{ok:false,reason}`（reason: no_cookie/not_found/revoked/expired） |
| `revokeSession(db, cookieHeader, opts)` | 撤銷session（登出），回傳清除cookie的Set-Cookie字串 |

### Token 驗證基礎（`src/auth/token.js`）

- `generateOpaqueToken()`：目前 session 機制實際使用的隨機token產生器
- `hmacSign`/`hmacVerify`、`signToken`/`verifyToken`：通用HMAC簽章工具，供未來無狀態token（例如email驗證連結）使用，**本次沒有任何地方呼叫**，純粹先備妥基礎能力
- `sha256Hex`：用於 `ip_hash` 欄位

完整架構圖與資料流程說明見 `src/auth/README.md`。

---

## 三、安全考量

1. **HttpOnly + Secure + SameSite=Lax**：預設全開，降低XSS竊取session、CSRF攻擊的風險；本機http開發需明確傳入`{secure:false}`才能降低安全性，不會自動偵測協定
2. **Session id 不可預測**：256-bit密碼學安全隨機值，非時間戳或遞增數字
3. **IP 只存雜湊值**：`sessions.ip_hash`欄位設計上就不接受明文IP，即使資料庫外洩也無法直接還原使用者真實IP
4. **登出立即撤銷**：`revoked_at`欄位讓撤銷立即生效，不像純簽章token要等自然過期
5. **HMAC密鑰不寫死**：`secret`參數必須由呼叫端注入，程式碼裡沒有任何預設或寫死的密鑰
6. **驗證失敗一律安全降級**：所有驗簽/驗證函式遇到格式錯誤、資料不存在等情況，一律回傳`false`/`{ok:false}`，不拋出未捕捉例外

---

## 四、測試結果

### (1) 純記憶體單元測試：38 / 38 通過

`node backups/phase1-task1.13a-session/test_session_layer_mock.mjs`

涵蓋：
- `token.js`（12項）：token唯一性/格式、HMAC簽章驗證（含竄改/錯誤密鑰情境）、簽章token組裝與驗證、SHA-256雜湊一致性
- `cookie.js`（11項）：Cookie解析（含邊界情況：null/空字串/URL編碼）、Set-Cookie組裝（含安全旗標、Max-Age、覆寫選項）
- `session.js`（15項）：createSession/validateSession/revokeSession 完整流程，含 IP雜湊化、無cookie、session不存在、已撤銷、已過期等所有邊界情況

```
PASS: 38 / 38
✅✅✅ 全部通過（純記憶體運算，未連線任何資料庫，未建立任何登入流程）
```

### (2) EXPLAIN 唯讀 SQL 語法驗證：7 / 7 通過

`node backups/phase1-task1.13a-session/validate_sessions_sql_against_schema.mjs`

把 `src/db/tables/sessions.js` 的全部7條SQL陳述式，用`EXPLAIN`對本機模擬的真實D1 schema驗證，零副作用（不執行、不寫入）。

```
PASS: 7 / 7
✅✅✅ 全部 SQL 陳述式皆通過 EXPLAIN 語法驗證（零副作用，未寫入任何資料）
```

### (3) Migration 套用驗證（本地+正式）

`sessions` 表已透過 `wrangler d1 migrations apply` 套用到本地（Miniflare）與正式 D1，兩端皆確認：
- 表結構正確建立，外鍵正確指向 `users(id) ON DELETE CASCADE`
- **0 筆資料**（本地與正式皆確認）

### (4) P1～P6 基準測試：8 / 8 通過

沿用 TASK0.5 的 `baseline_capture.script.js`，因 `src/worker.js` 本次零修改，8/8 全數通過，屬預期中的確認性驗證。

### (5) 資料庫狀態核對

測試前後，本機與正式 D1 的相關表筆數：
```json
{"sessions":0,"users":0,"nutrients":67,"scenarios":14}
```
`sessions`/`users` 皆為 0 筆（未寫入任何真實或虛構的使用者資料），`nutrients`/`scenarios` 維持 TASK1.8 seed 後的狀態不變。

---

## 五、回滾方式

**A. 移除程式碼（保留 sessions 表結構）**
```bash
git revert <本次commit hash>
```
移除 `src/auth/`、`src/db/tables/sessions.js` 與 `src/db/index.js` 的相關掛載，因為 `src/worker.js` 完全沒有 import 這些檔案，revert 不影響任何正式服務。

**B. 移除 sessions 表本身（若需要）**
```bash
npx wrangler d1 execute diet-coach-db --remote --command "DROP TABLE IF EXISTS sessions;"
```
（本地驗證環境可加 `--local`）

**C. 完全不處理**：因為 `sessions` 表目前是空的、`src/worker.js` 完全沒有讀寫它，不回滾也無風險，可留著等待後續任務決定何時真正接入。

---

## 六、是否可以進入後續 TASK

**✅ 可以。** Session 基礎架構（sessions表、D1存取層、token/cookie/session三個helper模組）皆已建立並通過45項測試（38項邏輯測試+7項SQL語法驗證），且全程未建立OAuth或登入流程、未修改`src/worker.js`、未接入任何真實使用者資料。

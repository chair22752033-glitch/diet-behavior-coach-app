# Session 基礎架構（Phase 1 TASK 1.13A）

這個目錄是「未來身份系統」的基礎層：cookie session 的產生、驗證、撤銷邏輯。

**本次任務刻意保持未啟用狀態**：`src/worker.js` 沒有任何一行 `import` 這裡的任何檔案，
沒有 Google OAuth、沒有登入頁面、沒有任何路由會呼叫這些函式。什麼時候、要不要接進去，
是後續任務的決定。

## 目錄結構

```
src/auth/
├── README.md        # 本文件
├── constants.js       # Cookie名稱、TTL、安全旗標預設值
├── token.js           # generateOpaqueToken()、hmacSign/Verify、signToken/verifyToken、sha256Hex
├── cookie.js          # parseCookies()、serializeCookie()、serializeExpiredCookie()
└── session.js         # createSession()、validateSession()、revokeSession()（整合上面三個+D1）

src/db/tables/sessions.js   # D1 存取層（TASK1.12風格），對應 migrations/0003_...
```

## Session 架構設計

### 採用「不透明 token + D1 查表」模式，而非 JWT

- session id 本身就是一個 256-bit 隨機字串（`generateOpaqueToken()`），存進 D1 的 `sessions.id`
- 瀏覽器只拿到這個隨機字串（透過 HttpOnly cookie），完全看不到任何內部資訊
- 每次驗證都查一次 D1（`sessions.getById(token)`），確認存在、未撤銷、未過期
- **優點**：可以隨時撤銷（登出、強制登出所有裝置），不像 JWT 那樣「簽出去就收不回來，只能等自然過期」；也不需要在 token 裡塞任何使用者資訊，外洩風險最低（token本身不帶任何語意）
- **代價**：每次請求都要查一次資料庫。但因為是主鍵查找（`WHERE id = ?`），效能成本很低，且未來如果要優化，可以在 D1 前面加一層短 TTL 的 KV 快取（不在本次範圍）

### 為什麼還額外準備了 HMAC 簽章工具（`hmacSign`/`signToken`）？

這是給「不查資料庫、純驗簽即可」的場景用的無狀態 token，例如未來的：
- 電子郵件驗證連結（`verify:userId:expiresAt.簽章`）
- 密碼重設連結
- 短期一次性操作授權

這**不是**目前 session 機制在用的東西，只是先把通用工具準備好，本次沒有任何地方呼叫它。

### 資料流程（未來啟用時的樣子，本次不執行）

```
使用者完成某種身份確認（未來才決定：OAuth / 訪客建立 / 其他方式）
        ↓ 已知 userId
createSession(db, userId, {ip, userAgent})
        ↓ 寫入 D1 sessions 表，回傳 setCookie 字串
Worker 回應時加上 Set-Cookie: dbc_sid=xxx; HttpOnly; Secure; SameSite=Lax
        ↓
瀏覽器往後每次請求自動帶上 Cookie: dbc_sid=xxx
        ↓
validateSession(db, cookieHeader) → 查D1確認有效 → {ok:true, userId}
        ↓
使用者登出 → revokeSession(db, cookieHeader) → D1標記revoked_at + 回傳清除cookie的Set-Cookie
```

## 安全考量

1. **HttpOnly**：預設開啟（`constants.js` 的 `COOKIE_DEFAULTS`），JavaScript 無法讀取這個 cookie，降低 XSS 竊取 session 的風險
2. **Secure**：預設開啟，只在 HTTPS 連線下才會被瀏覽器送出。**注意**：本機用 `http://localhost` 開發測試時，瀏覽器不會送出帶 Secure 旗標的 cookie，呼叫端需要明確傳入 `{secure:false}` 才能在本機測試——這是刻意設計成「預設安全、需要主動選擇降低安全性」，而不是自動偵測協定（Worker 端偵測協定不夠可靠，容易因為 proxy/CDN 轉發而誤判）
3. **SameSite=Lax**：預設值，可防止大部分 CSRF 攻擊情境，同時不影響一般連結導覽的使用體驗
4. **Session id 不可預測**：用 `crypto.getRandomValues()` 產生 256-bit 隨機值（等同業界標準的隨機性），不是用時間戳、遞增數字等可猜測的值
5. **IP 只存雜湊值，不存明文**：`sessions.ip_hash` 欄位設計上就不接受明文IP，`createSession()` 會呼叫 `sha256Hex(salt+ip)` 之後才存入，即使資料庫外洩也無法直接還原使用者IP（前提是salt有妥善保密，這個salt管理方式屬於未來啟用時才需要決定的事，本次只是預留欄位與雜湊機制）
6. **登出即撤銷、非等待過期**：`revokeSession()` 立刻把 `revoked_at` 寫入資料庫，`validateSession()` 每次都檢查這個欄位，撤銷立即生效，不像純簽章型 token 那樣要等自然過期
7. **HMAC 密鑰絕不寫死在程式碼**：`hmacSign`/`hmacVerify` 的 `secret` 參數必須由呼叫端注入（例如未來從 Cloudflare Worker Secret 讀取），本檔案裡沒有任何寫死的密鑰或預設密鑰
8. **驗簽失敗一律回傳 false／invalid，不拋出例外**：`hmacVerify`、`verifyToken` 內部都用 try/catch，即使輸入格式完全不對（例如亂七八糟的字串）也不會讓呼叫端因為未捕捉的例外而出現非預期行為

## 可支援操作

| 函式 | 用途 |
|---|---|
| `createSession(db, userId, opts)` | 建立新session，寫入D1，回傳token與Set-Cookie字串 |
| `validateSession(db, cookieHeader, opts)` | 從Cookie標頭驗證session，回傳`{ok,userId}`或`{ok:false,reason}` |
| `revokeSession(db, cookieHeader, opts)` | 撤銷session（登出），回傳清除cookie用的Set-Cookie字串 |
| `generateOpaqueToken(byteLength)` | 產生不透明隨機token |
| `hmacSign`/`hmacVerify` | 通用HMAC簽章/驗證（供未來無狀態token使用） |
| `signToken`/`verifyToken` | 組合payload+簽章的token格式 |
| `sha256Hex(data)` | SHA-256雜湊（用於ip_hash） |
| `parseCookies(header)` | 解析Cookie標頭字串 |
| `serializeCookie`/`serializeExpiredCookie` | 組裝Set-Cookie標頭字串 |

## 測試方式

- `test_session_layer_mock.mjs`（38項）：純記憶體mock，涵蓋token/cookie/session三個模組的正常與邊界情況
- `validate_sessions_sql_against_schema.mjs`（7項）：`EXPLAIN`唯讀驗證`sessions`表SQL語法

兩份測試腳本位於 `backups/phase1-task1.13a-session/`。

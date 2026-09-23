# Login Flow 設計文件（Phase 1 TASK 1.18）

本文件說明 `src/services/auth_service.js` 提供的三種登入流程的設計與資料流。
**本次只建立後端 service layer 能力，沒有任何路由、沒有登入頁面、沒有接入
`src/worker.js`，不會改變任何現有使用者體驗。**

---

## 一、Guest Flow（訪客登入）

```
createGuestLogin(db, options)
        ↓
createGuestIdentity(db, metadata)      ← TASK1.14：建立 is_guest=true、
        ↓                                 auth_provider=null、status=active 的新使用者
loginSession(db, user, options)        ← TASK1.18：包一層 createSession()
        ↓
createSession(db, userId, sessionOpts) ← TASK1.13A：寫入 sessions 表、
        ↓                                 產生 256-bit opaque token
{ ok:true, user, session, cookie }
```

**用途**：使用者第一次打開 App、還沒有任何身份時，建立一個匿名可用的身份，
讓「探索紀錄/飲食紀錄/情緒紀錄/行為模式/報告」這些業務資料從第一次使用
就能開始累積（對應 `docs/user-ownership-rules.md` 的「Guest 的 user_id 永久
存在」原則）。

---

## 二、Provider Flow（Google 登入）

```
loginWithProvider(db, providerIdentity, options)
        ↓
resolveLoginIdentity(db, providerIdentity)   ← TASK1.18
        ↓
   ┌─────────────────────┬──────────────────────────┐
   │ 查 db.users.getByProvider() │                    │
   │ 找到既有使用者               │ 找不到（第一次登入）  │
   ↓                            ↓                    │
既有 user（created:false）    建立全新 user            │
                              （is_guest:false，       │
                               直接以已驗證身份誕生）    │
   └─────────────────────┴──────────────────────────┘
        ↓
若是既有使用者 → db.users.touchLogin() 更新 last_login_at   ← TASK1.13B
        ↓
loginSession(db, user, options)
        ↓
{ ok:true, user, session, cookie, created }
```

**用途**：使用者用 Google 帳號直接登入（不是先當訪客再升級）。第一次登入
會直接建立一個「一開始就是正式會員」的使用者列，之後每次登入都會更新
`last_login_at`，並回傳同一個 `user_id`（不會重複建立）。

**防重複 user**：`resolveLoginIdentity()` 先查一次
`db.users.getByProvider()`，加上 D1 schema 本身在 TASK1.7 就已建立的
partial unique index（`idx_users_auth_provider_id`，只在
`auth_provider`+`auth_provider_id` 皆非 NULL 時生效）做資料庫層級的
第二道防線，兩層一起保證同一組 provider identity 不會對應到兩個不同的
`user_id`。

---

## 三、Upgrade Flow（訪客升級為正式會員）

```
upgradeGuestLogin(db, guestUserId, providerIdentity, options)
        ↓
upgradeGuestToProvider(db, guestUserId, provider, providerId, options)   ← TASK1.14
        ↓
   1. 確認 guestUserId 目前確實是訪客
   2. 確認 provider 合法、未被其他帳號綁定
   3. 原地更新同一列 users：填入 auth_provider/auth_provider_id、is_guest改0
      （user_id 從頭到尾不變，訪客期間累積的所有業務資料自動延續）
   4. db.sessions.revokeAllForUser()：撤銷這個使用者原本所有的舊 session
      （身份升級 = 信任等級改變，比照資安慣例重新產生session，防session fixation）
        ↓
loginSession(db, user, options)   ← 建立一個全新的 session
        ↓
{ ok:true, user, session, cookie }
```

**用途**：使用者已經用訪客身份使用過 App（累積了一些探索/飲食/情緒紀錄），
之後決定用 Google 帳號登入，把這個訪客身份「升級」成正式會員，而不是
另外開一個全新帳號、把資料搬過去。`user_id` 全程不變，見
`docs/user-ownership-rules.md` 的「升級會員 user_id 不變」規則。

**與 Provider Flow 的差異**：`loginWithProvider()` 用在「使用者本來就是
直接用 Google 登入，沒有訪客歷史」的情境；`upgradeGuestLogin()` 用在
「使用者已經有一個訪客帳號，現在要把它跟 Google 身份綁在一起」的情境。
兩者是不同的使用場景，呼叫端（未來的 OAuth callback，本次不建立）需要
自己判斷該呼叫哪一個。

---

## 四、Session 與 Cookie

三個流程最終都會呼叫同一個 `loginSession(db, user, options)`
（`src/auth/login_session.js`，TASK1.18），底層是 TASK1.13A 的
`createSession()`：

- Session id：256-bit 隨機不透明 token，存進 `sessions` 表
- Cookie 名稱：`dbc_sid`（`src/auth/constants.js`）
- Cookie 屬性：`HttpOnly` + `Secure` + `SameSite=Lax`，預設 30 天有效期
- 登出（`logoutSession()`）：撤銷該 session（`revoked_at` 寫入時間戳）+
  回傳一個 `Max-Age=0` 的 Set-Cookie 字串清除瀏覽器端的 cookie

完整的 cookie 安全設計細節（為什麼預設 Secure、為什麼 IP 只存雜湊值等）
見 `src/auth/README.md`（TASK1.13A）與 `src/identity/README.md`（TASK1.13B）。

---

## 五、目前的限制與下一步（誠實揭露，非本次任務範圍）

以下事項**刻意不在本次任務範圍內**，需要後續任務決定：

1. **沒有任何路由**：`src/worker.js` 沒有 `/api/auth/*` 這類 endpoint，
   `loginWithProvider()`/`upgradeGuestLogin()` 也還沒有真正的 OAuth
   callback 會呼叫它們（TASK1.17 建立的 `src/oauth/` 也還沒有跟這裡串起來）
2. **State 儲存機制未決定**：TASK1.17 的 `createOAuthState()`/
   `validateOAuthState()` 是純函式，state 要存在 cookie 還是 KV 還是 D1，
   本次沒有決定，需要真正接 OAuth callback 時才會確定
3. **沒有 email 欄位持久化**：`providerIdentity.email` 目前只是流程中
   傳遞的資料，`users` 表沒有 `email` 欄位（TASK1.7 schema 沒有這個欄位），
   本次沒有新增 migration 補這個欄位，因為不在本次任務要求範圍內
4. **沒有前端登入按鈕、沒有登入頁面**：使用者完全無法感知這些程式碼的存在

這些都是後續任務（真正要「讓使用者可以登入」時）需要處理的事，本次的
交付範圍就是把這三段流程的邏輯先寫好、測試好。

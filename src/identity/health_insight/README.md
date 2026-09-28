# Health Insight User Identity Foundation（Phase 6 TASK1.118）

## 目的

為未來Health Insight個人化、歷史紀錄、Premium功能、Gemini
Enhancement Layer建立一個乾淨的User Identity邊界——本次任務**只**
建立身份邊界本身，**不**實作Gemini、**不**實作付費/訂閱、**不**
建立健康歷史資料表、**不**重新設計Health Insight UI。

## Section 1：Authentication Boundary Definition（既有架構檢視結果）

規格要求先檢視既有架構，決定"既有的就重用，不要重新建立一套"。
檢視結果：

| 項目 | 既有實作 | 位置 |
|---|---|---|
| Session產生/驗證/撤銷 | `createSession()`/`validateSession()`/`revokeSession()` | `src/auth/session.js`（TASK1.13A） |
| Session ↔ 使用者關聯規則（session合法+使用者狀態合法） | `validateSessionWithIdentity()` | `src/identity/session_rules.js`（TASK1.13B） |
| Guest登入 | `createGuestUser()` | `src/identity/guest.js`（TASK1.29起正式啟用） |
| Google OAuth | `createGoogleProvider()`/Authorization Code Flow | `src/oauth/google.js`（TASK1.33起正式啟用） |
| 帳號升級（訪客→已驗證身份） | `upgradeGuestToProvider()` | `src/identity/upgrade.js` |
| Route層身份驗證middleware | `requireAuth()`（內部呼叫`validateSessionWithIdentity()`） | `src/middleware/auth_middleware.js`（TASK1.27，TASK1.29起正式掛在10條`/api/*`路由上） |

**結論：既有authentication系統完整存在且已經正式啟用**（不是
TASK1.116/1.117 Health Insight這條產品線才需要的東西——這是Phase
1就已經完成、目前也正在被其餘10條`/api/*` API路由使用的既有系統）。
延續規格"If authentication already exists: reuse existing
boundary. Do NOT create a full authentication system"的明確要求，
本次任務**完全沒有**新增/修改`src/auth/`、`src/oauth/`、
`src/identity/session_rules.js`等既有Auth Layer任何一個檔案，只
在`src/identity/health_insight/`新增一層薄薄的轉接（見下方
"User Identity Context"）。

## Section 2：User Identity Context Boundary

`user_identity.js`定義穩定的中性身份形狀：

```js
{ userId: null, authenticated: false, provider: null }  // ANONYMOUS_IDENTITY
{ userId: 'abc123', authenticated: true, provider: 'guest' }   // 訪客
{ userId: 'abc123', authenticated: true, provider: 'google' }  // Google登入
```

`buildUserIdentity(user)`把`validateSessionWithIdentity()`回傳的
原始D1 user row（含`auth_provider_id`/`display_name`/
`legacy_sync_code`等實作細節欄位）轉成上面這個只有三個欄位的中性
形狀——**任何OAuth細節都無法通過這一層**（見該檔案檔案頭"Identity
Ownership"說明）。

`resolve_identity.js`的`resolveHealthInsightIdentity(db,
cookieHeader, options)`則是"重用既有boundary"的具體示範：直接
呼叫既有`validateSessionWithIdentity()`，驗證失敗（沒有
cookie/過期/被停權/例外）一律安全回傳`ANONYMOUS_IDENTITY`，不會
讓呼叫端因為身份解析失敗而整個request失敗。

## Section 3：Health Insight Compatibility

`request_context.js`示範兩種**今天已經可行、完全不需要修改
Product Entry/Contract/Adapter任何一行程式碼**的身份附加方式：

1. `attachIdentityToOptions(identity, options)` → 附加到
   `options.identity`（Product Adapter既有的options passthrough
   機制，`test_user_identity_foundation.mjs`用真實的
   `createHealthInsightProductIntegration()`證明這條路徑今天就能
   跑通，結果跟不帶身份時完全一致）。
2. `buildHealthInsightProductRequest({identity, rawInput})` →
   組出規格原文示範的`{user, rawInput}`形狀（Product Entry的
   `validateProductEntryRequest()`只檢查`rawInput`/`userId`，
   完全不會因為多一個沒看過的`user`欄位而拒絕請求）。

**這兩個函式都沒有被`src/controllers/
health_insight_controller.js`呼叫**——延續"Do not break current
API"/"Do not force authentication"的明確要求，Controller今天
依然100%匿名運作，完全沒有改變TASK1.116/1.117既有行為。要不要、
什麼時候把這裡接進真實的Controller呼叫鏈，留給未來任務決定。

## Section 4：Session Boundary（既有session確認結果）

規格要求：如果session已經存在，確認"身份分離"、"不洩漏進
Intelligence層"、"不跟database耦合"。確認結果：

- **身份分離**：`buildUserIdentity()`的輸出跟原始session/cookie/
  D1 row完全無關聯——呼叫端拿到的`{userId, authenticated,
  provider}`無法反推出session token、cookie內容、或任何D1欄位。
- **不洩漏進Intelligence層**：`src/identity/health_insight/`
  底下所有檔案完全不import `src/intelligence/`
  任何檔案（見下方"Architecture Protection"測試），User Identity
  Context目前唯一可能的去向是`options.identity`/`request.user`
  （Product Entry/Adapter層級），這兩個欄位在到達Capability
  Orchestrator/Analysis Runner/Recommendation Runner之前完全
  不會被讀取（除非未來任務刻意修改`buildIntelligenceRequest()`
  把它併入`context`——本次任務明確沒有做這件事）。
- **不跟database耦合**：`user_identity.js`/`request_context.js`/
  `membership_placeholder.js`三個檔案完全是純函式，不接受db
  參數、不import `src/db/`任何檔案；只有`resolve_identity.js`
  接受db參數，但那是**直接重用**既有`validateSessionWithIdentity()`
  的既有db存取方式，不是新增的db耦合。

## Section 5：Future Membership Preparation

`membership_placeholder.js`比照TASK1.40既有的
`analysisEngine`/`recommendationEngine`"inert占位物件"慣例，
`resolveFeaturePermission()`目前對任何身份/任何功能名稱都固定
回傳`{allowed:true, reason:'not_implemented'}`——現階段Health
Insight本來就對所有人開放，這裡只是先把"未來可能需要檢查權限"
的呼叫形狀定下來，**沒有**任何訂閱/付款/方案邏輯。

## 目錄結構

```
src/identity/health_insight/
  README.md                  本文件
  user_identity.js            ANONYMOUS_IDENTITY / buildUserIdentity() / isValidUserIdentity()
  resolve_identity.js          resolveHealthInsightIdentity()（重用既有session_rules.js）
  request_context.js            attachIdentityToOptions() / buildHealthInsightProductRequest()
  membership_placeholder.js      createMembershipPlaceholder() / resolveFeaturePermission()
  index.js                        統一輸出入口
```

## Current Limitations（目前限制，延續"Foundation only"既定範圍）

- **完全沒有被任何route/controller/worker.js呼叫**：這個目錄是
  純粹的extension point，`src/controllers/
  health_insight_controller.js`/`src/routes/
  health_insight_routes.js`/`src/worker.js`本次任務完全沒有被
  修改。Health Insight目前依然是100%匿名運作，跟TASK1.116/1.117
  完成時的行為完全一致。
- **沒有真正的Membership/Feature Permission判斷邏輯**：
  `resolveFeaturePermission()`是固定回傳`{allowed:true}`的
  占位函式，不是真正的權限系統。
- **沒有Health History儲存**：本次任務不建立任何資料表，
  `buildUserIdentity()`回傳的`userId`目前沒有任何地方用它去
  查詢/寫入任何domain資料表。
- **沒有真正接上Gemini Enhancement Layer**：`request_context.js`
  只是把"身份可以怎麼附加"的資料形狀準備好，完全沒有呼叫任何
  AI SDK/Gemini API。

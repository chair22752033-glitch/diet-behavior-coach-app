# OAuth Identity Provider Layer（Phase 1 TASK 1.17）

Google OAuth 的基礎建設層。**本次任務目的不是讓使用者登入**，而是建立
「Google OAuth → Identity Mapping → 未來登入流程」中間所需要的可重用元件。

`src/worker.js` 沒有任何一行 import 這裡的任何檔案，沒有登入頁面、沒有新增
API route，沒有執行過任何一次真實的 Google OAuth 登入，也沒有儲存過任何真實
Google token。

## 目錄結構

```
src/oauth/
├── README.md          # 本文件
├── constants.js         # Google公開端點URL、預設scope、state TTL（不含機密資訊）
├── provider.js           # OAuth provider通用介面定義（createOAuthProvider/isValidOAuthProvider）
├── google.js              # Google provider實作（getAuthorizationUrl/exchangeCode/getUserProfile）
├── oauth_state.js          # CSRF防護：createOAuthState/validateOAuthState（純函式，不接cookie/session）
└── token_exchange.js        # 標準OAuth2 authorization code→access token交換（provider中立）

src/identity/provider_mapping.js   # Google profile → 系統identity欄位 的轉換
src/identity/provider.js            # （TASK1.13B既有檔案）新增重新匯出 mapGoogleProfileToIdentity
```

## Provider Abstraction

```js
{
  providerName: 'google',
  getAuthorizationUrl(state, opts) -> string,
  async exchangeCode(code, opts) -> {ok, accessToken, ...} | {ok:false, error},
  async getUserProfile(accessToken, opts) -> {ok, profile:{id,email,name,picture}} | {ok:false, error},
}
```

`createOAuthProvider(providerName, methods)` 會驗證這三個方法都存在才放行，
未來要加入 Apple/Facebook/Line，只要照這個形狀各自建立一個 `xxx.js`，
呼叫端程式碼完全不需要改動。

## 安全設計

1. **secret 一律外部注入**：`createGoogleProvider(config)` 的 `config`
   `{client_id, client_secret, redirect_uri}` 必須由呼叫端提供（未來會是
   Cloudflare Worker Secret），程式碼裡沒有任何寫死的機密值，缺少任一項
   會立刻拋出清楚的錯誤，而不是靜默使用假值
2. **State 防 CSRF**：`createOAuthState()` 用 `crypto.getRandomValues()`
   （沿用 TASK1.13A 的 `generateOpaqueToken()`，256-bit）產生不可預測的隨機值，
   帶有效期限；`validateOAuthState()` 用常數時間比較（避免時序側信道攻擊），
   同時檢查一致性與是否過期
3. **Token 不落地**：`exchangeAuthorizationCode()`／`getUserProfile()`
   只回傳解析後的結果給呼叫端，這幾個檔案完全沒有 import 任何 D1 或 KV
   相關模組，不可能意外把 token 寫進資料庫
4. **錯誤安全回傳**：所有函式對任何失敗情況（缺參數、HTTP錯誤、網路例外、
   格式不符）一律回傳 `{ok:false, error}`，不會拋出未捕捉例外中斷呼叫流程
5. **可測試、不觸網**：`exchangeCode`/`getUserProfile` 皆可透過 `opts.fetchImpl`
   注入假的 fetch 實作，測試時完全不會對 Google 真實伺服器發出任何請求

## 測試方式

`backups/phase1-task1.17-oauth/test_oauth_layer_mock.mjs`：純記憶體運算 + 注入假
fetch，完全不連線任何真實網路服務或資料庫，也不使用任何真實 Google 帳號資料
（全部用明顯的假值，例如 `test-client-id`、`FAKE_ACCESS_TOKEN`）。

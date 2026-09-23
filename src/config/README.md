# Configuration Layer（Phase 1 TASK 1.23）

集中管理環境設定，避免未來各層各自散落地讀取 `env.XXX`。
**本次不修改 `src/worker.js`、不修改 `wrangler.toml`、不建立正式 API
endpoint、不接真實登入、不呼叫 Google。**

## 目錄結構

```
src/config/
├── README.md
├── env.js           # getEnvConfig(env)：D1/KV/R2 binding 整理
├── auth_config.js    # getAuthConfig(env)：Google OAuth設定 + Cookie設定整理
└── app_config.js       # getAppConfig(env)：environment/version/feature flags
```

## env.js — `getEnvConfig(env)`

回傳 `{environment, database, kv, r2}`：

- `environment`：`env.ENVIRONMENT`，本次 `wrangler.toml` 未設定這個變數，
  所以目前一律回傳 `'unknown'`。
- `database`/`kv`/`r2`：各自回傳 `{bindingName, present, binding, missingReason}`，
  `present` 是否存在該 binding 的布林值，`missingReason` 在缺少時給出清楚訊息
  （不拋例外——因為「這個 binding 存不存在」本身是可以被其他層安全檢查的
  資訊，不代表整個 config 建立失敗）。
- `env` 本身缺失（`undefined`/`null`）時才會直接拋出例外。

這裡不含任何機密資訊：D1/KV/R2 binding 本身是 Cloudflare 平台注入的資源
控制代碼，不是 secret。

## auth_config.js — `getAuthConfig(env)`

回傳 `{google, cookie}`：

- `google`：`{clientId, clientSecret, redirectUri, configured}`，直接讀取
  `env.GOOGLE_CLIENT_ID`/`env.GOOGLE_CLIENT_SECRET`/`env.GOOGLE_REDIRECT_URI`
  （本次 `wrangler.toml` 未新增這些變數，屬於未來 Google OAuth 正式上線
  時的任務範圍，所以目前一律是 `null`/`configured:false`）。**只讀取，
  不寫入**：這個函式不會把讀到的值 log 出來、寫進 D1/KV，也不會出現在
  任何拋出的錯誤訊息裡。
- `cookie`：`{name, ttl, secure, sameSite}`，直接沿用 TASK1.13A
  `src/auth/constants.js` 既有的 `SESSION_COOKIE_NAME`/`SESSION_TTL_SECONDS`/
  `COOKIE_DEFAULTS`，不重複定義一份數字造成兩處要同步維護。
- 完全不 import `src/oauth/` 底下任何檔案，不建立 OAuth 流程，不呼叫
  Google 的任何端點。

## app_config.js — `getAppConfig(env)`

回傳 `{environment, version, features}`：

- `version`：`env.APP_VERSION`，未設定時預設 `'1.0.0-phase1'`。
- `features`：預留的 feature flags，目前預設全部是 `false`
  （`d1Enabled`/`authEnabled`/`legacyImportEnabled`）——這正確反映現況：
  D1/Auth/Legacy Import 都只是「已建好但沒有接上」的基礎架構。可用
  `env.FEATURE_D1_ENABLED`/`env.FEATURE_AUTH_ENABLED`/
  `env.FEATURE_LEGACY_IMPORT_ENABLED`（`'true'`/`'1'`/布林值）覆寫，但
  本次 `wrangler.toml` 沒有設定任何一個，所以目前一律是預設的 `false`。

## 測試方式

見 `backups/phase1-task1.23-bootstrap/test_bootstrap_mock.mjs`（與
Bootstrap Layer 共用同一份測試檔案，因為 Bootstrap 直接組裝了這三個
config 函式的輸出）：純記憶體測試，完全不連線任何真實或本機模擬的
資料庫，不讀取任何真實 secret（測試裡用的 client id/secret 都是假值）。

/*
 * Phase 1 TASK 1.28｜Auth Contract
 *
 * 定義 TASK1.19/1.20 已經存在的四個 auth 操作（loginGuest / loginProvider /
 * logout / currentUser）的 request/response 規格，讓「這個 API 該收什麼、
 * 該回什麼」有明確、單一的權威來源，而不是散落在各個 controller 的
 * 註解裡。`request` schema 的格式跟 TASK1.27
 * `src/middleware/validator.js` 的 `validateBody(schema, data)` 完全
 * 相容，可以直接拿來驗證。
 *
 * 這裡純粹是「規格資料」，不含任何邏輯，也不 import 任何
 * controller/service/db 相關檔案。
 */

/**
 * 對應 loginGuestController（POST /auth/guest）
 * payload: {metadata?: object}
 */
export const loginGuestContract = {
  request: {
    metadata: { required: false, type: 'object' },
  },
  response: {
    success: { user: 'object', session: 'object', cookie: 'string' },
    failureReasons: ['guest_login_failed'],
    failureStatus: [500],
  },
};

/**
 * 對應 loginProviderController（POST /auth/provider）—— TASK1.32 起正式上線。
 * payload: {provider, providerId, email?, displayName?}——跟TASK1.31
 * upgradeProviderContract同一種外部欄位命名慣例，controller內部會轉換
 * 成identity層慣用的auth_provider/auth_provider_id/display_name。
 *
 * 本次不接Google OAuth callback、不執行Authorization Code Flow、不呼叫
 * Google API、不儲存任何token——payload是「已經確認好的provider
 * identity」，通常未來會由真正接上OAuth callback的那個任務負責產生
 * （例如呼叫src/identity/provider_mapping.js的
 * mapGoogleProfileToIdentity()後再轉成這裡的欄位名稱），這裡只負責
 * 「收到provider identity之後該怎麼登入」。
 */
export const loginProviderContract = {
  request: {
    provider: { required: true, type: 'string' },
    providerId: { required: true, type: 'string' },
    email: { required: false, type: 'string' },
    displayName: { required: false, type: 'string' },
  },
  response: {
    // 注意：resolveLoginIdentity()（src/identity/login_identity.js）本身
    // 只檢查auth_provider/auth_provider_id是否「存在」，不驗證是否為
    // 支援的provider名稱——這仍是既有實作的既有行為，TASK1.34沒有改動
    // login_identity.js一行。但TASK1.34在loginProviderController()呼叫
    // loginWithProvider()「之前」新增了validateProviderIdentity()檢查
    // （src/services/auth_security_service.js，統一使用
    // src/identity/provider.js的SUPPORTED_PROVIDERS），所以
    // invalid_provider現在是這條路由真的會發生的失敗原因。
    success: { user: 'object', session: 'object', cookie: 'string', created: 'boolean' },
    failureReasons: ['invalid_payload', 'invalid_provider', 'invalid_identity', 'user_suspended', 'user_deleted', 'provider_login_failed'],
    failureStatus: [400, 401],
  },
};

/**
 * 對應 logoutController（POST /auth/logout）—— TASK1.30 起正式上線。
 * 沒有 body，靠 cookieHeader 判斷，request schema 為空物件。
 */
export const logoutContract = {
  request: {},
  response: {
    success: { cookie: 'string', wasValid: 'boolean' },
    failureReasons: ['logout_failed'],
    failureStatus: [500],
  },
};

/**
 * 對應 currentUserController（GET /auth/me）—— TASK1.30 起正式上線。
 * 沒有 body，靠 cookieHeader 判斷，request schema 為空物件。
 */
export const currentUserContract = {
  request: {},
  response: {
    success: { user: 'object', userId: 'string' },
    failureReasons: ['no_cookie', 'not_found', 'revoked', 'expired', 'user_suspended', 'user_deleted', 'user_not_found', 'not_authenticated'],
    failureStatus: [401],
  },
};

/**
 * 對應 upgradeGuestController（POST /auth/provider/upgrade）—— TASK1.31 起正式上線。
 * payload: {provider, providerId, email?, displayName?}——注意欄位命名跟
 * loginProviderContract（auth_provider/auth_provider_id）不同，這是本次
 * 任務規格明確指定的欄位名稱，controller內部會轉換成identity層慣用的
 * auth_provider/auth_provider_id。
 *
 * 呼叫這個API的人必須是「目前透過cookie登入的訪客本人」——guestUserId
 * 不是從payload來的（那樣任何人都能指定升級任意user_id，是安全漏洞），
 * 而是從cookieHeader解析出目前的session歸屬。
 */
export const upgradeProviderContract = {
  request: {
    provider: { required: true, type: 'string' },
    providerId: { required: true, type: 'string' },
    email: { required: false, type: 'string' },
    displayName: { required: false, type: 'string' },
  },
  response: {
    success: { user: 'object', session: 'object', cookie: 'string' },
    failureReasons: [
      'no_cookie', 'not_found', 'revoked', 'expired',
      'user_suspended', 'user_deleted', 'user_not_found', 'not_authenticated',
      'invalid_payload', 'invalid_identity', 'invalid_provider', 'not_guest',
      'provider_already_linked', 'upgrade_failed',
    ],
    failureStatus: [400, 401],
  },
};

/**
 * 對應 googleOAuthCallbackController（GET /auth/google/callback）—— TASK1.33
 * 起正式上線。request是Google回呼URL上帶的query string參數
 * {code, state}，兩者皆必填字串（contract validation只檢查「有沒有」，
 * 真正的state正確性驗證發生在controller委派的
 * auth_application_service.loginWithGoogleCallback()內部）。
 *
 * 這條路由的成功/失敗結果實際上都是302 redirect（見
 * src/routes/auth_routes.js），這裡的success/failureStatus只是延續既有
 * contract慣例、方便直接對controller本身做單元測試，不代表HTTP層真的會
 * 回傳這些JSON/status。
 */
export const googleCallbackContract = {
  request: {
    code: { required: true, type: 'string' },
    state: { required: true, type: 'string' },
  },
  response: {
    success: { user: 'object', session: 'object', cookie: 'string', created: 'boolean' },
    // TASK1.34：新增invalid_provider——loginWithGoogleCallback()在呼叫
    // loginWithProvider()之前也加上了跟loginProviderController()同一份
    // validateProviderIdentity()檢查（見src/services/auth_security_service.js），
    // 目前mapGoogleProfileToIdentity()恆定回傳'google'，這是防禦性設計，
    // 現況下實務上不會觸發，但如實列在這裡。
    failureReasons: [
      'oauth_not_configured', 'missing_state', 'state_mismatch', 'state_expired',
      'code_exchange_failed', 'profile_fetch_failed', 'invalid_profile', 'missing_provider_id',
      'invalid_provider', 'invalid_identity', 'user_suspended', 'user_deleted', 'user_status_unknown',
      'oauth_callback_failed',
    ],
    failureStatus: [401, 500, 502, 503],
  },
};

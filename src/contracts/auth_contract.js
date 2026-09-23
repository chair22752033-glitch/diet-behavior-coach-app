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
 * 對應 loginProviderController（POST /auth/provider）
 * payload: {auth_provider, auth_provider_id, email?, display_name?}
 *   通常是 src/identity/provider_mapping.js 的 mapGoogleProfileToIdentity() 輸出
 */
export const loginProviderContract = {
  request: {
    auth_provider: { required: true, type: 'string' },
    auth_provider_id: { required: true, type: 'string' },
    email: { required: false, type: 'string' },
    display_name: { required: false, type: 'string' },
  },
  response: {
    success: { user: 'object', session: 'object', cookie: 'string', created: 'boolean' },
    failureReasons: ['invalid_payload', 'invalid_identity', 'user_suspended', 'user_deleted', 'provider_login_failed'],
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

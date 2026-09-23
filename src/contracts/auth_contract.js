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
 * 對應 logoutController（POST /auth/logout）
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
 * 對應 currentUserController（GET /auth/me）
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

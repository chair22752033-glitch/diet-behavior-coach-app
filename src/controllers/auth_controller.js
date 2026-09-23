/*
 * Phase 1 TASK 1.20｜Auth Controller（TASK1.28 起 response shape 改由 Contract Layer 管理）
 *
 * worker.js（未來）與 Authentication Application Service（TASK1.19）之間的
 * 隔離層：每個 controller function 只做三件事——接收輸入、呼叫對應的
 * application service 函式、用 src/contracts/response_contract.js
 * （TASK1.28）統一格式化回傳。Controller 本身不再定義回應的形狀，只是
 * 呼叫 Contract Layer 提供的 success()/failure()。
 *
 * 完全沒有：
 * - SQL / db.prepare() / 任何 D1 操作（不 import src/db/ 底下任何檔案）
 * - KV 操作
 * - OAuth 流程本身（不 import src/oauth/ 底下任何檔案）
 * - session 邏輯本身（不 import src/auth/session.js 或 src/identity/session_rules.js）
 * 這些全部委派給 src/services/auth_application_service.js（TASK1.19）。
 *
 * 這裡的函式參數刻意不是 Fetch API 的 Request 物件——本次不建立正式 API
 * route，也沒有 worker.js 會呼叫它們，所以用「已經解析好的 payload/cookie
 * 字串」這種與傳輸協定無關的參數，方便未來不論是接 Cloudflare Worker 的
 * Request、或未來換成別的框架，都只需要在 route 那一層做參數轉換，
 * controller 本身不用改。
 */
import { createGuestLogin, loginWithProvider, logout, getCurrentUser, upgradeGuestLogin } from '../services/auth_application_service.js';
import { success, failure } from '../contracts/response_contract.js';

/**
 * 對應未來的 POST /auth/guest
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {object} [payload] - {metadata?}，轉交給 createGuestLogin()
 * @param {object} [options] - {sessionOpts?}
 */
export async function loginGuestController(db, payload, options) {
  try {
    payload = payload || {};
    options = options || {};
    const result = await createGuestLogin(db, { metadata: payload.metadata, sessionOpts: options.sessionOpts, now: options.now });
    if (!result.ok) {
      return failure(result.reason || result.error || 'guest_login_failed', 500);
    }
    return success({ user: result.user, session: result.session, cookie: result.cookie });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

/**
 * 對應 TASK1.32 的 POST /auth/provider
 *
 * 本次不接 Google OAuth callback、不執行 Authorization Code Flow、
 * 不呼叫任何 Google API、不儲存任何 token——payload 是「已經確認好的
 * provider identity」（provider/providerId/email/displayName），跟
 * TASK1.31 upgrade 端點同一種外部欄位命名慣例，這裡同樣轉換成
 * identity 層慣用的 auth_provider/auth_provider_id/email/display_name
 * 之後才交給 loginWithProvider()（TASK1.19，內部呼叫已測試過的
 * resolveLoginIdentity()：provider identity 存在就回傳既有 user，不存在
 * 就建立新的 provider user，兩種情況都不會建立 guest user）。
 *
 * @param {object} db
 * @param {{provider:string, providerId:string, email?:string, displayName?:string}} payload
 * @param {object} [options] - {sessionOpts?, now?}
 */
export async function loginProviderController(db, payload, options) {
  try {
    if (!payload || typeof payload !== 'object') {
      return failure('invalid_payload', 400);
    }
    const providerIdentity = {
      auth_provider: payload.provider,
      auth_provider_id: payload.providerId,
      email: payload.email,
      display_name: payload.displayName,
    };
    const result = await loginWithProvider(db, providerIdentity, options);
    if (!result.ok) {
      // suspended/deleted/invalid_identity 等識別層拒絕理由，視為未授權
      return failure(result.reason || result.error || 'provider_login_failed', 401);
    }
    return success({ user: result.user, session: result.session, cookie: result.cookie, created: result.created });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

/**
 * 對應未來的 POST /auth/logout
 * @param {object} db
 * @param {string|null} cookieHeader - 請求的 Cookie 標頭字串
 * @param {object} [options]
 */
export async function logoutController(db, cookieHeader, options) {
  try {
    const result = await logout(db, cookieHeader, options);
    if (!result.ok) {
      return failure(result.error || 'logout_failed', 500);
    }
    return success({ cookie: result.cookie, wasValid: result.wasValid });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

/**
 * 對應未來的 GET /auth/me
 * @param {object} db
 * @param {string|null} cookieHeader
 * @param {object} [options]
 */
export async function currentUserController(db, cookieHeader, options) {
  try {
    const result = await getCurrentUser(db, cookieHeader, options);
    if (!result.ok) {
      return failure(result.reason || 'not_authenticated', 401);
    }
    return success({ user: result.user, userId: result.userId });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

/**
 * 對應 TASK1.31 的 POST /auth/provider/upgrade
 *
 * 要升級的對象（guestUserId）不是從 payload 來的——那樣任何呼叫端都能
 * 指定升級任意 user_id，是安全漏洞。而是先用 getCurrentUser()（跟
 * currentUserController 同一個函式）從 cookieHeader 解析出「目前登入
 * 的是誰」，再把那個 userId 交給 upgradeGuestLogin()。這也順便讓
 * suspended/deleted 的訪客在這一步就被擋下（getCurrentUser() 內部的
 * canLogIn() 檢查），upgradeGuestToProvider() 內部還有第二層一樣的
 * 狀態檢查（見 src/identity/upgrade.js），兩層防禦不衝突。
 *
 * @param {object} db
 * @param {string|null} cookieHeader - 目前這個訪客自己的session cookie
 * @param {{provider:string, providerId:string, email?:string, displayName?:string}} payload
 * @param {object} [options]
 */
export async function upgradeGuestController(db, cookieHeader, payload, options) {
  try {
    const currentUserResult = await getCurrentUser(db, cookieHeader, options);
    if (!currentUserResult.ok) {
      return failure(currentUserResult.reason || 'not_authenticated', 401);
    }
    if (!payload || typeof payload !== 'object') {
      return failure('invalid_payload', 400);
    }
    const providerIdentity = {
      auth_provider: payload.provider,
      auth_provider_id: payload.providerId,
      email: payload.email,
      display_name: payload.displayName,
    };
    const result = await upgradeGuestLogin(db, currentUserResult.userId, providerIdentity, options);
    if (!result.ok) {
      return failure(result.reason || result.error || 'upgrade_failed', 401);
    }
    return success({ user: result.user, session: result.session, cookie: result.cookie });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

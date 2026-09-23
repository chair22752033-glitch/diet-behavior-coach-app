/*
 * Phase 1 TASK 1.19｜Authentication Application Service Layer
 *
 * 這是給「未來的 API Controller」用的單一入口：整合目前已完成的所有身份相關
 * 基礎架構（Session Layer/User Identity Layer/Guest Lifecycle/OAuth Provider
 * Layer/Login Status Validation），提供五個高階函式。
 *
 *   worker.js
 *     ↓（本次不接，future）
 *   API Controller
 *     ↓
 *   Authentication Application Service（這個檔案）
 *     ↓
 *   Identity Layer / Session Layer
 *     ↓
 *   Domain Service（TASK1.15，本次未直接使用，見下方說明）
 *     ↓
 *   DB Access Layer（TASK1.12）
 *     ↓
 *   D1
 *
 * 這一層刻意不重新實作任何一段邏輯：
 * - createGuestLogin / loginWithProvider / upgradeGuestLogin 三個函式直接
 *   重新匯出 TASK1.18（+ TASK1.18.1 status validation 修正）已經寫好、
 *   測試過的 src/services/auth_service.js，不重複寫一份
 * - logout() 直接組合 TASK1.13A 的 validateSession()/revokeSession()
 * - getCurrentUser() 直接組合 TASK1.13B 的 validateSessionWithIdentity()
 *
 * 關於「Domain Service」：TASK1.15 的 exploration/food/emotion/behavior/
 * report_service.js 是業務資料（探索紀錄/飲食紀錄...）的存取層，跟「登入」
 * 這件事本身沒有直接關聯，所以這個檔案沒有 import 它們——架構圖上的
 * Domain Service 是給「未來 API Controller 處理業務資料請求」用的另一條
 * 路徑，不是 Authentication 這條路徑的必經之路。
 *
 * 重要：這裡只是 service function，不是路由。src/worker.js 完全沒有
 * import 這個檔案，沒有任何登入 API route、沒有 Google OAuth callback route，
 * 不會建立任何真實使用者的 session。
 *
 * TASK1.33：新增 loginWithGoogleCallback()，把 TASK1.17 的 OAuth Provider
 * 基礎架構（oauth_state 驗證 + google provider 的 exchangeCode/
 * getUserProfile）跟 TASK1.17 的 provider_mapping、以及這個檔案原本就有
 * 的 loginWithProvider() 串成一條完整的「Google callback → 登入」流程。
 * access_token/refresh_token/id_token 只存在這個函式的區域變數裡，函式
 * 執行完就離開作用域被GC回收，完全不寫入D1/KV/任何回傳值——回傳給呼叫端
 * 的只有 loginWithProvider() 本來就有的 {user, session, cookie, created}
 * 形狀，這裡新增的程式碼裡沒有任何一行把 accessToken/idToken 放進回傳值。
 */
export { createGuestLogin, loginWithProvider, upgradeGuestLogin } from './auth_service.js';

import { validateSession, revokeSession } from '../auth/session.js';
import { validateSessionWithIdentity } from '../identity/session_rules.js';
import { parseCookies } from '../auth/cookie.js';
import { validateOAuthState } from '../oauth/oauth_state.js';
import { mapGoogleProfileToIdentity } from '../identity/provider_mapping.js';
import { loginWithProvider } from './auth_service.js';

// TASK1.33：暫存「本次OAuth flow的state」用的cookie名稱。這個cookie預期由
// 未來啟動 Google 登入流程的那一步（尚未在本次任務範圍內）寫入
// createOAuthState() 的回傳值（JSON字串化），這裡只負責讀取、驗證、
// 用完即清除（一次性、防重放），不負責寫入。
export const OAUTH_STATE_COOKIE_NAME = 'dbc_oauth_state';

/**
 * 登出：驗證目前 cookie 對應的 session（了解登出前的狀態，供未來記錄/除錯用），
 * 接著撤銷該 session，最後回傳可以清除瀏覽器 cookie 的 Set-Cookie 字串。
 *
 * 完全委派給 TASK1.13A 的 validateSession()/revokeSession()，不重新實作
 * cookie 清除邏輯（清除用的 Set-Cookie 字串一律由 revokeSession() 內部的
 * serializeExpiredCookie() 產生）。
 *
 * 設計上「即使 session 當下已經無效（過期/已撤銷/根本沒有cookie），登出仍視為
 * 成功」——這是標準的登出語意：使用者的目的是「確保自己不再是登入狀態」，
 * 不應該因為 session 剛好已經失效而收到一個錯誤。
 *
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {string|null} cookieHeader - 請求的 Cookie 標頭字串
 * @param {object} [options] - {cookieOpts, now}
 * @returns {Promise<{ok:boolean, cookie?:string, wasValid?:boolean, error?:string}>}
 */
export async function logout(db, cookieHeader, options) {
  options = options || {};

  const validation = await validateSession(db, cookieHeader, options);
  const revokeResult = await revokeSession(db, cookieHeader, options);

  return {
    ok: revokeResult.ok,
    cookie: revokeResult.setCookie,
    wasValid: validation.ok,
    error: revokeResult.error,
  };
}

/**
 * 取得目前 cookie 對應的使用者（session 驗證 + 使用者狀態驗證）。
 *
 * 完全委派給 TASK1.13B 的 validateSessionWithIdentity()：session 本身要
 * 存在、未撤銷、未過期，且對應的使用者狀態必須是 active——停權/已刪除的
 * 使用者即使 session 本身還沒過期，也會被這裡拒絕（不會回傳 user）。
 *
 * @param {object} db
 * @param {string|null} cookieHeader
 * @param {object} [options] - {now}
 * @returns {Promise<{ok:boolean, user?:object, userId?:string, reason?:string}>}
 *   reason 可能是 'no_cookie' | 'not_found' | 'revoked' | 'expired' |
 *   'user_not_found' | 'user_suspended' | 'user_deleted' | 'user_status_unknown'
 */
export async function getCurrentUser(db, cookieHeader, options) {
  const result = await validateSessionWithIdentity(db, cookieHeader, options);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }
  return { ok: true, user: result.user, userId: result.userId };
}

/**
 * TASK1.33｜Google OAuth Authorization Code Callback → 登入
 *
 * Browser → Google callback(code+state) → oauth_state.validateOAuthState()
 * → googleProvider.exchangeCode() → googleProvider.getUserProfile()
 * → mapGoogleProfileToIdentity() → loginWithProvider() → createSession()
 *
 * 安全設計：
 * 1. state 必須先通過 validateOAuthState() 才會繼續往下（防CSRF）；
 *    expectedStateRecord 從 params.cookieHeader 解析出的
 *    OAUTH_STATE_COOKIE_NAME cookie 取得，不是從payload/query信任任何
 *    呼叫端自稱的值。
 * 2. googleProvider 由呼叫端（route層）注入，client_id/client_secret
 *    一律來自外部設定（例如 Cloudflare Worker Secret），這個函式本身
 *    看不到、也不會寫死任何機密值。
 * 3. access_token（exchangeResult.accessToken）只用來換取
 *    getUserProfile()，用完這個函式執行完畢就離開作用域，完全不寫入
 *    D1/KV，也不出現在這個函式的任何回傳值裡。
 * 4. refresh_token/id_token 同樣不落地——這裡連讀都沒有讀
 *    exchangeResult.idToken，直接忽略。
 * 5. googleProvider 不存在（未設定secret）、state驗證失敗、
 *    exchangeCode()/getUserProfile()回傳{ok:false}時，一律安全回傳
 *    {ok:false, reason}，不拋出未攔截例外、不呼叫任何後續步驟。
 * 6. 不建立重複user：直接複用已經測試過的 loginWithProvider()
 *    （resolveLoginIdentity() 內部用 db.users.getByProvider() 查找）。
 * 7. 已存在的provider identity會直接由 loginWithProvider() 回傳既有user
 *    並登入（created:false），不會建立新帳號。
 *
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {{code?:string, state?:string, cookieHeader?:string|null}} params
 * @param {object|null} googleProvider - src/oauth/google.js 的
 *   createGoogleProvider(config) 回傳的 provider 物件；null 代表這個
 *   環境還沒有設定 Google OAuth secret（例如本機開發、測試環境），
 *   這個函式會安全地回傳 oauth_not_configured，不會嘗試呼叫任何方法
 * @param {object} [options] - {now, sessionOpts, fetchImpl}
 * @returns {Promise<{ok:boolean, user?:object, session?:object, cookie?:string, created?:boolean, error?:string, reason?:string}>}
 *   reason 可能是：'oauth_not_configured' | 'missing_state' | 'state_mismatch' |
 *   'state_expired' | 'code_exchange_failed' | 'profile_fetch_failed' |
 *   'invalid_profile' | 'missing_provider_id' | resolveLoginIdentity() 的
 *   'invalid_identity' | 'user_suspended' | 'user_deleted' | 'user_status_unknown'
 */
export async function loginWithGoogleCallback(db, params, googleProvider, options) {
  params = params || {};
  options = options || {};

  if (!googleProvider) {
    return { ok: false, reason: 'oauth_not_configured' };
  }

  const cookies = parseCookies(params.cookieHeader);
  let expectedStateRecord = null;
  const rawStateRecord = cookies[OAUTH_STATE_COOKIE_NAME];
  if (rawStateRecord) {
    try {
      expectedStateRecord = JSON.parse(rawStateRecord);
    } catch (e) {
      expectedStateRecord = null;
    }
  }

  const stateCheck = validateOAuthState(params.state, expectedStateRecord, options);
  if (!stateCheck.ok) {
    return { ok: false, reason: stateCheck.reason };
  }

  const exchangeResult = await googleProvider.exchangeCode(params.code, options);
  if (!exchangeResult.ok) {
    return { ok: false, reason: 'code_exchange_failed' };
  }

  // exchangeResult.accessToken 只在這裡用一次，函式結束後這個區域變數
  // 就離開作用域，不會被寫入任何回傳值、D1 或 KV。
  const profileResult = await googleProvider.getUserProfile(exchangeResult.accessToken, options);
  if (!profileResult.ok) {
    return { ok: false, reason: 'profile_fetch_failed' };
  }

  const identityResult = mapGoogleProfileToIdentity(profileResult.profile);
  if (!identityResult.ok) {
    return { ok: false, reason: identityResult.error || 'invalid_profile' };
  }

  return loginWithProvider(db, identityResult.identity, options);
}

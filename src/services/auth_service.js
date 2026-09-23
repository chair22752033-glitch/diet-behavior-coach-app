/*
 * Phase 1 TASK 1.18｜Login Service Layer
 *
 * 三個登入流程的組裝點，串接前面幾個 TASK 已經各自測試過的模組，
 * 這裡不重新實作任何一段邏輯，只負責「依序呼叫、組出最終回傳形狀」：
 *
 *   createGuestLogin    = createGuestIdentity()（TASK1.14）+ loginSession()（TASK1.18）
 *   loginWithProvider   = resolveLoginIdentity()（TASK1.18）+ touchLogin()（TASK1.13B）+ loginSession()
 *   upgradeGuestLogin   = upgradeGuestToProvider()（TASK1.14，內含撤銷舊session）+ loginSession()
 *
 * 重要：這裡只是 service function，不是路由。本次沒有任何地方呼叫它們，
 * 不接 UI、不建立 OAuth callback route、不公開登入頁，src/worker.js 完全
 * 沒有 import 這個檔案。
 */
import { createGuestIdentity } from '../identity/lifecycle.js';
import { resolveLoginIdentity } from '../identity/login_identity.js';
import { upgradeGuestToProvider } from '../identity/upgrade.js';
import { loginSession } from '../auth/login_session.js';

/**
 * Guest User → Session → HttpOnly Cookie
 *
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {object} [options] - {metadata, sessionOpts}
 *   metadata 轉交給 createGuestIdentity()，sessionOpts 轉交給 createSession()
 * @returns {Promise<{ok:boolean, user?:object, session?:object, cookie?:string, error?:string}>}
 */
export async function createGuestLogin(db, options) {
  options = options || {};

  const identityResult = await createGuestIdentity(db, options.metadata);
  if (!identityResult.ok) {
    return { ok: false, error: identityResult.error };
  }

  const loginResult = await loginSession(db, identityResult.user, options);
  if (!loginResult.ok) {
    return { ok: false, error: loginResult.error };
  }

  return { ok: true, user: identityResult.user, session: loginResult.session, cookie: loginResult.cookie };
}

/**
 * Google OAuth Identity → 既有使用者登入 或 建立新使用者 → Session → HttpOnly Cookie
 *
 * @param {object} db
 * @param {{auth_provider:string, auth_provider_id:string, email?:string, display_name?:string}} providerIdentity
 *   通常是 src/identity/provider_mapping.js 的 mapGoogleProfileToIdentity() 輸出
 * @param {object} [options] - {sessionOpts, now}
 * @returns {Promise<{ok:boolean, user?:object, session?:object, cookie?:string, created?:boolean, error?:string, reason?:string}>}
 */
export async function loginWithProvider(db, providerIdentity, options) {
  options = options || {};

  const resolveResult = await resolveLoginIdentity(db, providerIdentity);
  if (!resolveResult.ok) {
    return { ok: false, error: resolveResult.error, reason: resolveResult.reason };
  }

  let user = resolveResult.user;

  if (!resolveResult.created) {
    // 既有使用者再次登入 → 更新 last_login_at（TASK1.13B 的 db.users.touchLogin）
    const now = (options.now ? new Date(options.now) : new Date()).toISOString();
    const touchResult = await db.users.touchLogin(user.id, now);
    if (!touchResult.ok) {
      return { ok: false, error: touchResult.error };
    }
    user = Object.assign({}, user, { last_login_at: now });
  }

  const loginResult = await loginSession(db, user, options);
  if (!loginResult.ok) {
    return { ok: false, error: loginResult.error };
  }

  return { ok: true, user, session: loginResult.session, cookie: loginResult.cookie, created: resolveResult.created };
}

/**
 * Guest User → upgradeGuestToProvider()（撤銷舊session）→ 建立新 Session
 *
 * @param {object} db
 * @param {string} guestUserId
 * @param {{auth_provider:string, auth_provider_id:string}} providerIdentity
 * @param {object} [options] - {sessionOpts, now}
 * @returns {Promise<{ok:boolean, user?:object, session?:object, cookie?:string, error?:string, reason?:string}>}
 *   reason 可能是 upgradeGuestToProvider() 的任何一種：
 *   'invalid_identity' | 'invalid_provider' | 'user_not_found' | 'not_guest' | 'provider_already_linked'
 */
export async function upgradeGuestLogin(db, guestUserId, providerIdentity, options) {
  options = options || {};

  if (!providerIdentity || !providerIdentity.auth_provider || !providerIdentity.auth_provider_id) {
    return { ok: false, reason: 'invalid_identity' };
  }

  const upgradeResult = await upgradeGuestToProvider(db, guestUserId, providerIdentity.auth_provider, providerIdentity.auth_provider_id, options);
  if (!upgradeResult.ok) {
    return { ok: false, error: upgradeResult.error, reason: upgradeResult.reason };
  }
  // upgradeGuestToProvider() 內部已經呼叫 db.sessions.revokeAllForUser()
  // 撤銷了這個使用者原本所有的舊 session（TASK1.14 建立的 session 關聯規則），
  // 這裡不需要、也不應該重複撤銷。

  const userResult = await db.users.getById(guestUserId);
  if (!userResult.ok || !userResult.row) {
    return { ok: false, error: 'user_not_found_after_upgrade' };
  }

  const loginResult = await loginSession(db, userResult.row, options);
  if (!loginResult.ok) {
    return { ok: false, error: loginResult.error };
  }

  return { ok: true, user: userResult.row, session: loginResult.session, cookie: loginResult.cookie };
}

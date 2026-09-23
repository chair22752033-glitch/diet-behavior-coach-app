/*
 * Phase 1 TASK 1.18｜Session Login Handler
 *
 * 把「已經確認好身份的 user」跟「建立/撤銷 session」串起來，是
 * src/services/auth_service.js 三個登入流程（guest/provider/upgrade）
 * 共用的最後一步：確認身份之後，session 該怎麼建立、cookie 怎麼給。
 *
 * 完全不重新實作 session 邏輯本身——底層仍是 TASK1.13A 的 createSession()/
 * revokeSession()，這裡只是包一層「回傳形狀對登入流程更方便」的介面。
 */
import { createSession, revokeSession } from './session.js';

/**
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {object} user - users 表的一列資料（至少要有 id）
 * @param {object} [options] - {sessionOpts}，轉交給 createSession()
 *   （ttlSeconds/userAgent/ip/ipSalt/cookieOpts/now）
 * @returns {Promise<{ok:boolean, user?:object, session?:object, cookie?:string, error?:string}>}
 */
export async function loginSession(db, user, options) {
  options = options || {};

  if (!user || !user.id) {
    return { ok: false, error: 'missing_user' };
  }

  const sessionResult = await createSession(db, user.id, options.sessionOpts);
  if (!sessionResult.ok) {
    return { ok: false, error: sessionResult.error };
  }

  return {
    ok: true,
    user,
    session: sessionResult,
    cookie: sessionResult.setCookie,
  };
}

/**
 * 登出：撤銷 cookie 對應的 session，並回傳可以清除瀏覽器 cookie 的 Set-Cookie 字串。
 *
 * @param {object} db
 * @param {string|null} cookieHeader - 請求的 Cookie 標頭字串
 * @param {object} [options] - {cookieOpts, now}
 * @returns {Promise<{ok:boolean, cookie?:string, error?:string}>}
 */
export async function logoutSession(db, cookieHeader, options) {
  options = options || {};
  const result = await revokeSession(db, cookieHeader, options);

  return {
    ok: result.ok,
    cookie: result.setCookie,
    error: result.error,
  };
}

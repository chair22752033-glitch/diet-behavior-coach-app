/*
 * Phase 1 TASK 1.14｜Guest Session 建立流程（guestSessionService）
 *
 * 串起「建立訪客身份」（lifecycle.js，TASK1.14）+「建立session」
 * （src/auth/session.js 的 createSession，TASK1.13A）兩個已經各自測試過的模組，
 * 這裡不重新實作任何一邊的邏輯，只負責「依序呼叫、組出最終回傳形狀」。
 *
 * 重要：只是 service function，不是路由，不接入 src/worker.js。
 */
import { createGuestIdentity } from './lifecycle.js';
import { createSession } from '../auth/session.js';

/**
 * 建立一個全新的訪客使用者，並立刻為他建立一個 session。
 *
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {object} [opts] - {metadata, sessionOpts}
 *   metadata：轉交給 createGuestIdentity() 的訪客資料（displayName/legacySyncCode/now/id）
 *   sessionOpts：轉交給 createSession() 的 session 選項（ttlSeconds/userAgent/ip/ipSalt/cookieOpts/now）
 * @returns {Promise<{ok:boolean, user?:object, session?:object, error?:string}>}
 *   成功時 session 就是 createSession() 的回傳值（含 token/setCookie/expiresAt）
 */
export async function createGuestSession(db, opts) {
  opts = opts || {};

  const identityResult = await createGuestIdentity(db, opts.metadata);
  if (!identityResult.ok) {
    return { ok: false, error: identityResult.error };
  }

  const sessionResult = await createSession(db, identityResult.user_id, opts.sessionOpts);
  if (!sessionResult.ok) {
    return { ok: false, error: sessionResult.error };
  }

  return {
    ok: true,
    user: identityResult.user,
    session: sessionResult,
  };
}

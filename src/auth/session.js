/*
 * Phase 1 TASK 1.13A｜Session Helper
 *
 * 把 D1 的 sessions 表存取（src/db/tables/sessions.js）、token 產生
 * （src/auth/token.js）、cookie 組裝（src/auth/cookie.js）串起來，
 * 提供 createSession / validateSession / revokeSession 三個高階函式。
 *
 * 重要：這裡只是「函式」，不是路由，本次沒有任何地方呼叫它們，
 * 也沒有任何 Google OAuth 或正式登入頁面——這些函式假設呼叫端已經
 * 用某種方式（未來才會決定是什麼方式）確認了 user_id，這裡只負責
 * 「確認了身份之後，session 該怎麼建立、驗證、撤銷」。
 */
import { generateOpaqueToken, sha256Hex } from './token.js';
import { serializeCookie, serializeExpiredCookie, parseCookies } from './cookie.js';
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from './constants.js';

/**
 * 建立一個新 session，寫入 D1，並回傳可以直接放進回應標頭的 Set-Cookie 字串。
 *
 * @param {object} db - createDb(env) 回傳的 db 物件（見 src/db/index.js）
 * @param {string} userId
 * @param {object} [opts] {ttlSeconds, userAgent, ip, ipSalt, cookieOpts, now}
 * @returns {Promise<{ok:boolean, token?:string, setCookie?:string, expiresAt?:string, error?:string}>}
 */
export async function createSession(db, userId, opts) {
  opts = opts || {};
  const now = opts.now ? new Date(opts.now) : new Date();
  const ttlSeconds = typeof opts.ttlSeconds === 'number' ? opts.ttlSeconds : SESSION_TTL_SECONDS;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const token = generateOpaqueToken();
  const ipHash = opts.ip ? await sha256Hex((opts.ipSalt || '') + opts.ip) : null;

  const insertResult = await db.sessions.insert({
    id: token,
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    user_agent: opts.userAgent || null,
    ip_hash: ipHash,
  });

  if (!insertResult.ok) {
    return { ok: false, error: insertResult.error };
  }

  const setCookie = serializeCookie(SESSION_COOKIE_NAME, token, Object.assign({ maxAgeSeconds: ttlSeconds }, opts.cookieOpts));

  return { ok: true, token, setCookie, expiresAt: expiresAt.toISOString() };
}

/**
 * 從請求的 Cookie 標頭驗證 session 是否有效。
 * @returns {Promise<{ok:boolean, userId?:string, reason?:string}>}
 *   reason 可能是 'no_cookie' | 'not_found' | 'revoked' | 'expired'
 */
export async function validateSession(db, cookieHeader, opts) {
  opts = opts || {};
  const now = opts.now ? new Date(opts.now) : new Date();
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return { ok: false, reason: 'no_cookie' };

  const result = await db.sessions.getById(token);
  if (!result.ok || !result.row) return { ok: false, reason: 'not_found' };

  const session = result.row;
  if (session.revoked_at) return { ok: false, reason: 'revoked' };
  if (new Date(session.expires_at).getTime() <= now.getTime()) return { ok: false, reason: 'expired' };

  return { ok: true, userId: session.user_id, session };
}

/**
 * 撤銷（登出）一個 session，並回傳可以清除瀏覽器 cookie 的 Set-Cookie 字串。
 */
export async function revokeSession(db, cookieHeader, opts) {
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  const setCookie = serializeExpiredCookie(SESSION_COOKIE_NAME, opts && opts.cookieOpts);
  if (!token) return { ok: true, setCookie, note: 'no_cookie_to_revoke' };

  const now = (opts && opts.now) ? new Date(opts.now) : new Date();
  const result = await db.sessions.revoke(token, now.toISOString());
  return { ok: result.ok, setCookie, error: result.error };
}

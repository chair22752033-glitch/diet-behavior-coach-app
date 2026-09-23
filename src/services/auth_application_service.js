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
 */
export { createGuestLogin, loginWithProvider, upgradeGuestLogin } from './auth_service.js';

import { validateSession, revokeSession } from '../auth/session.js';
import { validateSessionWithIdentity } from '../identity/session_rules.js';

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

/*
 * Phase 1 TASK 1.13B｜Session ↔ User 關聯規則
 *
 * TASK1.13A 的 validateSession() 只檢查 session 本身（存在/未撤銷/未過期），
 * 不知道「使用者」這件事。這裡疊加身份層的規則：即使 session 本身合法，
 * 使用者若被停權（suspended）或已刪除（deleted），也不該被視為登入有效。
 *
 * 刻意不修改 src/auth/session.js（TASK1.13A 的檔案，已經過 38 項測試），
 * 而是在這裡組合出一個新函式，兩層職責分開：
 *   src/auth/session.js    → session 本身合不合法
 *   src/identity/session_rules.js → 合法的 session 背後的使用者，狀態允不允許使用
 */
import { validateSession } from '../auth/session.js';
import { canLogIn } from './status.js';

/**
 * @returns {Promise<{ok:boolean, userId?:string, user?:object, reason?:string}>}
 *   reason 除了 validateSession() 原有的 no_cookie/not_found/revoked/expired，
 *   還可能是 user_suspended / user_deleted / user_not_found（session存在但對應的user不見了，理論上因為FK CASCADE不該發生）
 */
export async function validateSessionWithIdentity(db, cookieHeader, opts) {
  const sessionResult = await validateSession(db, cookieHeader, opts);
  if (!sessionResult.ok) return sessionResult;

  const userResult = await db.users.getById(sessionResult.userId);
  if (!userResult.ok || !userResult.row) {
    return { ok: false, reason: 'user_not_found' };
  }

  const check = canLogIn(userResult.row);
  if (!check.allowed) {
    return { ok: false, reason: check.reason };
  }

  return { ok: true, userId: sessionResult.userId, user: userResult.row };
}

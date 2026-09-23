/*
 * Phase 1 TASK 1.34｜Session Management Service
 *
 * 供「使用者管理自己裝置session」這種未來功能使用的服務層（例如「查看
 * 目前登入了哪些裝置」「登出某一台裝置」「全部登出」）。完全建立在
 * TASK1.13A 已經有的 db.sessions.listByUser()/revoke()/
 * revokeAllForUser() 之上，不重新實作任何SQL。
 *
 * 重要：這裡只是 service function，不是路由，不會被 src/worker.js 或任何
 * 既有 controller 呼叫，不改變任何一條已上線 API 的行為。
 */

/**
 * 列出某個使用者名下所有session（含已撤銷/已過期的歷史紀錄），並額外
 * 附加 isActive 欄位（未撤銷且未過期才是true），方便呼叫端不用自己重算。
 *
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {string} userId
 * @param {object} [options] - {now}
 * @returns {Promise<{ok:boolean, sessions?:Array, error?:string}>}
 */
export async function listUserSessions(db, userId, options) {
  options = options || {};
  if (!userId) {
    return { ok: false, reason: 'missing_user_id' };
  }
  const result = await db.sessions.listByUser(userId);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  const now = options.now ? new Date(options.now) : new Date();
  const sessions = result.results.map((s) =>
    Object.assign({}, s, {
      isActive: !s.revoked_at && new Date(s.expires_at).getTime() > now.getTime(),
    })
  );
  return { ok: true, sessions };
}

/**
 * 撤銷單一session。可選填 options.ownerUserId 做「操作者只能撤銷自己
 * 名下的session」這種所有權檢查（例如未來「登出某一台裝置」的API，
 * 呼叫端就是目前登入的使用者本人，絕不該讓任意使用者撤銷別人的
 * session）——不強制要求，因為系統管理用途（例如未來的後台管理功能）
 * 可能需要跨使用者撤銷，這裡把選擇權交給呼叫端。
 *
 * @param {object} db
 * @param {string} sessionId
 * @param {object} [options] - {now, ownerUserId}
 * @returns {Promise<{ok:boolean, sessionId?:string, alreadyRevoked?:boolean, reason?:string, error?:string}>}
 *   reason 可能是 'missing_session_id' | 'session_not_found' | 'not_owner'
 */
export async function revokeSessionById(db, sessionId, options) {
  options = options || {};
  if (!sessionId) {
    return { ok: false, reason: 'missing_session_id' };
  }

  const existing = await db.sessions.getById(sessionId);
  if (!existing.ok) {
    return { ok: false, error: existing.error };
  }
  if (!existing.row) {
    return { ok: false, reason: 'session_not_found' };
  }
  if (options.ownerUserId && existing.row.user_id !== options.ownerUserId) {
    return { ok: false, reason: 'not_owner' };
  }

  const alreadyRevoked = !!existing.row.revoked_at;
  const now = (options.now ? new Date(options.now) : new Date()).toISOString();
  const result = await db.sessions.revoke(sessionId, now);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, sessionId, alreadyRevoked };
}

/**
 * 撤銷某個使用者名下所有目前有效（尚未撤銷）的session——常見用途是
 * 「登出所有裝置」，或安全事件發生時強制該使用者所有session失效。
 * 直接複用 TASK1.13A/TASK1.13B 已經在 upgrade.js 用過的
 * db.sessions.revokeAllForUser()。
 *
 * @param {object} db
 * @param {string} userId
 * @param {object} [options] - {now}
 * @returns {Promise<{ok:boolean, userId?:string, reason?:string, error?:string}>}
 */
export async function revokeAllSessions(db, userId, options) {
  options = options || {};
  if (!userId) {
    return { ok: false, reason: 'missing_user_id' };
  }
  const now = (options.now ? new Date(options.now) : new Date()).toISOString();
  const result = await db.sessions.revokeAllForUser(userId, now);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, userId };
}

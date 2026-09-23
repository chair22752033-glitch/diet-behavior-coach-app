/*
 * Phase 1 TASK 1.34｜Session Cleanup Service
 *
 * 「找出過期的session」與「批次清理」拆成兩個函式：findExpiredSessions()
 * 是唯讀查詢（供呼叫端在真的刪除前先知道規模，或單純做報表/監控用），
 * cleanupExpiredSessions() 才會真的執行刪除。cleanupExpiredSessions()
 * 內部是「先查(listExpiredBefore, 有limit) → 再依查到的id清單刪除
 * (deleteByIds)」，而不是直接呼叫TASK1.13A既有的deleteExpiredBefore()
 * （那是無上限的條件式DELETE）——這樣才能保證「查到幾筆」跟「刪掉幾筆」
 * 永遠一致，limit也才有意義（真正達到「分批」清理的效果，而不是查詢有
 * 上限、刪除卻無上限）。
 *
 * 「不影響active session」：兩個函式都只篩選 expires_at < now 的資料列，
 * 不管 revoked_at——active session（未撤銷且未過期）與「已撤銷但尚未
 * 過期」的session都不會被這裡動到，只有真正過期的才會被清理。
 *
 * 重要：這裡只是 service function，不是路由，不會被 src/worker.js 或任何
 * 既有 controller 呼叫，不改變任何一條已上線 API 的行為或D1寫入footprint。
 */

/**
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {object} [options] - {now, limit}
 * @returns {Promise<{ok:boolean, results?:Array, error?:string}>}
 */
export async function findExpiredSessions(db, options) {
  options = options || {};
  const now = (options.now ? new Date(options.now) : new Date()).toISOString();
  const limit = typeof options.limit === 'number' ? options.limit : 500;
  return db.sessions.listExpiredBefore(now, limit);
}

/**
 * 批次清理過期session：先查一次（拿到即將被刪除的id清單），再依那份
 * 清單精準刪除（db.sessions.deleteByIds()）。查詢跟刪除共用同一個
 * `now` 時間戳與同一份id清單，確保「查到的」跟「刪掉的」永遠是同一批
 * ——deletedCount/deletedSessionIds 100% 準確反映真正被刪除的資料列，
 * 不會因為兩次操作之間又有新session過期而多刪、也不會因為
 * deleteExpiredBefore()式的無上限DELETE而讓limit形同虛設。
 *
 * @param {object} db
 * @param {object} [options] - {now, limit}
 * @returns {Promise<{ok:boolean, deletedCount:number, deletedSessionIds?:string[], error?:string}>}
 */
export async function cleanupExpiredSessions(db, options) {
  options = options || {};
  const now = (options.now ? new Date(options.now) : new Date()).toISOString();
  const limit = typeof options.limit === 'number' ? options.limit : 500;

  const findResult = await db.sessions.listExpiredBefore(now, limit);
  if (!findResult.ok) {
    return { ok: false, error: findResult.error, deletedCount: 0 };
  }

  const expiredIds = findResult.results.map((s) => s.id);
  if (expiredIds.length === 0) {
    return { ok: true, deletedCount: 0, deletedSessionIds: [] };
  }

  const deleteResult = await db.sessions.deleteByIds(expiredIds);
  if (!deleteResult.ok) {
    return { ok: false, error: deleteResult.error, deletedCount: 0 };
  }

  return { ok: true, deletedCount: expiredIds.length, deletedSessionIds: expiredIds };
}

/*
 * Phase 1 TASK 1.13A｜D1 Database Access Layer - sessions 表操作
 * 對應 schema：migrations/0003_phase1_task1_13a_sessions_table.sql
 *
 * 這裡只是純粹的 D1 存取（跟 src/db/tables/ 下其他表一致的風格），
 * 不含 token 產生、cookie 處理等邏輯——那些在 src/auth/ 底下，
 * 兩者刻意分開：這層只管「怎麼存取 sessions 表」，src/auth/ 管「session 的業務規則」。
 */
import { run, first, all } from '../query.js';

export function bind(db) {
  return {
    /**
     * @param {object} s {id, user_id, created_at, expires_at, last_seen_at?, user_agent?, ip_hash?}
     */
    async insert(s) {
      const sql = `INSERT INTO sessions
        (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash, revoked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`;
      const params = [
        s.id,
        s.user_id,
        s.created_at,
        s.expires_at,
        s.last_seen_at || null,
        s.user_agent || null,
        s.ip_hash || null,
      ];
      return run(db, sql, params);
    },
    async getById(id) {
      return first(db, 'SELECT * FROM sessions WHERE id = ?', [id]);
    },
    async listByUser(userId) {
      return all(db, 'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    },
    async touch(id, lastSeenAt) {
      return run(db, 'UPDATE sessions SET last_seen_at = ? WHERE id = ?', [lastSeenAt, id]);
    },
    async revoke(id, revokedAt) {
      return run(db, 'UPDATE sessions SET revoked_at = ? WHERE id = ?', [revokedAt, id]);
    },
    async revokeAllForUser(userId, revokedAt) {
      return run(db, 'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [revokedAt, userId]);
    },
    async deleteExpiredBefore(isoTimestamp) {
      return run(db, 'DELETE FROM sessions WHERE expires_at < ?', [isoTimestamp]);
    },
    /**
     * TASK1.34｜查找已過期（expires_at < isoTimestamp）的session，供
     * src/services/session_cleanup_service.js 在真的執行DELETE之前先
     * 知道「會清掉哪些」。刻意只用 expires_at 篩選，不管 revoked_at——
     * 「已撤銷但還沒過期」的session是另一種生命週期事件，不屬於這裡的
     * 清理範圍，維持active session（未撤銷且未過期）完全不受影響。
     */
    async listExpiredBefore(isoTimestamp, limit) {
      return all(db, 'SELECT * FROM sessions WHERE expires_at < ? ORDER BY expires_at ASC LIMIT ?', [isoTimestamp, limit || 500]);
    },
    /**
     * TASK1.34｜依明確的id清單批次刪除，只刪除呼叫端已經確認過的那些
     * id——這是 session_cleanup_service.js 真正執行清理時用的方法，
     * 確保「查到多少筆」跟「刪掉多少筆」永遠一致（不像
     * deleteExpiredBefore()那樣是無上限的條件式DELETE，兩者用途不同，
     * 互不取代，deleteExpiredBefore()繼續保留給未來可能的其他用途）。
     */
    async deleteByIds(ids) {
      if (!Array.isArray(ids) || ids.length === 0) {
        return { ok: true, meta: { changes: 0 } };
      }
      const placeholders = ids.map(() => '?').join(', ');
      return run(db, `DELETE FROM sessions WHERE id IN (${placeholders})`, ids);
    },
  };
}

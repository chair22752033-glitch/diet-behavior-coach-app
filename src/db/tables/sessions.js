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
  };
}

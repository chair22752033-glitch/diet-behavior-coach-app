/*
 * Phase 1 TASK 1.12｜D1 Database Access Layer - users 表操作
 * 對應 schema：migrations/0001_phase1_task1_7_initial_schema.sql
 */
import { run, first, all } from '../query.js';

export function bind(db) {
  return {
    /**
     * @param {object} u {id, auth_provider?, auth_provider_id?, display_name?, is_guest?, legacy_sync_code?, created_at, updated_at}
     */
    async insert(u) {
      const sql = `INSERT INTO users
        (id, auth_provider, auth_provider_id, display_name, is_guest, legacy_sync_code, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        u.id,
        u.auth_provider || null,
        u.auth_provider_id || null,
        u.display_name || null,
        u.is_guest === false ? 0 : 1,
        u.legacy_sync_code || null,
        u.created_at,
        u.updated_at,
      ];
      return run(db, sql, params);
    },
    async getById(id) {
      return first(db, 'SELECT * FROM users WHERE id = ?', [id]);
    },
    async getByLegacySyncCode(code) {
      return first(db, 'SELECT * FROM users WHERE legacy_sync_code = ?', [code]);
    },
    async listRecent(limit) {
      return all(db, 'SELECT * FROM users ORDER BY created_at DESC LIMIT ?', [limit || 20]);
    },
  };
}

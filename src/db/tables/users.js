/*
 * D1 Database Access Layer - users 表操作
 * 對應 schema：migrations/0001_phase1_task1_7_initial_schema.sql（TASK1.12）
 *              + migrations/0004_phase1_task1_13b_users_identity.sql（TASK1.13B，新增 status/last_login_at）
 */
import { run, first, all } from '../query.js';

export function bind(db) {
  return {
    /**
     * @param {object} u {id, auth_provider?, auth_provider_id?, display_name?, is_guest?, status?, legacy_sync_code?, created_at, updated_at}
     */
    async insert(u) {
      const sql = `INSERT INTO users
        (id, auth_provider, auth_provider_id, display_name, is_guest, status, legacy_sync_code, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        u.id,
        u.auth_provider || null,
        u.auth_provider_id || null,
        u.display_name || null,
        u.is_guest === false ? 0 : 1,
        u.status || 'active',
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
    /** TASK1.13B：依 (provider, providerId) 查找已連結的使用者，供 upgrade 前檢查是否已被其他帳號使用 */
    async getByProvider(provider, providerId) {
      return first(db, 'SELECT * FROM users WHERE auth_provider = ? AND auth_provider_id = ?', [provider, providerId]);
    },
    async listRecent(limit) {
      return all(db, 'SELECT * FROM users ORDER BY created_at DESC LIMIT ?', [limit || 20]);
    },
    /** TASK1.13B：變更使用者狀態（active/suspended/deleted），受 D1 schema 的 CHECK 約束保護 */
    async updateStatus(id, status, updatedAt) {
      return run(db, 'UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, updatedAt, id]);
    },
    /** TASK1.13B：guest → 已驗證身份 的「原地升級」，id 不變，沿用所有既有關聯資料 */
    async upgradeToProvider(id, provider, providerId, updatedAt) {
      return run(
        db,
        'UPDATE users SET auth_provider = ?, auth_provider_id = ?, is_guest = 0, updated_at = ? WHERE id = ?',
        [provider, providerId, updatedAt, id]
      );
    },
    /** TASK1.13B：記錄最後登入時間 */
    async touchLogin(id, lastLoginAt) {
      return run(db, 'UPDATE users SET last_login_at = ? WHERE id = ?', [lastLoginAt, id]);
    },
  };
}

/*
 * Phase 1 TASK 1.34｜D1 Database Access Layer - auth_audit_logs 表操作
 * 對應 schema：migrations/0006_phase1_task1_34_auth_audit_logs.sql
 *
 * 跟 src/db/tables/ 底下其他表一致的風格：純粹的 D1 存取，不含任何
 * 業務邏輯（何時該寫一筆稽核紀錄是 src/services/audit_log_service.js 的
 * 責任，這裡只管「怎麼存取 auth_audit_logs 表」）。
 */
import { run, first, all } from '../query.js';

// 對應 TASK1.34 規格列出的五種事件；audit_log_service.js 用這份清單驗證
// event_type 合法性，其他呼叫端也可以直接 import 這份清單重用，不需要
// 各自重複定義一份字串清單。
export const AUTH_AUDIT_EVENT_TYPES = Object.freeze([
  'guest_login',
  'provider_login',
  'oauth_login',
  'upgrade_account',
  'logout',
]);

export function bind(db) {
  return {
    /**
     * @param {object} entry {id, user_id, event_type, provider?, ip_hash?, user_agent?, created_at}
     */
    async insert(entry) {
      const sql = `INSERT INTO auth_audit_logs
        (id, user_id, event_type, provider, ip_hash, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        entry.id,
        entry.user_id,
        entry.event_type,
        entry.provider || null,
        entry.ip_hash || null,
        entry.user_agent || null,
        entry.created_at,
      ];
      return run(db, sql, params);
    },
    async getById(id) {
      return first(db, 'SELECT * FROM auth_audit_logs WHERE id = ?', [id]);
    },
    async listByUser(userId, limit) {
      return all(db, 'SELECT * FROM auth_audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit || 50]);
    },
    async listByEventType(eventType, limit) {
      return all(db, 'SELECT * FROM auth_audit_logs WHERE event_type = ? ORDER BY created_at DESC LIMIT ?', [eventType, limit || 50]);
    },
    async countByUser(userId) {
      return first(db, 'SELECT COUNT(*) as c FROM auth_audit_logs WHERE user_id = ?', [userId]);
    },
  };
}

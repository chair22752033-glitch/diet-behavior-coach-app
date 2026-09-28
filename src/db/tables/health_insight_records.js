/*
 * Phase 6 TASK 1.120｜D1 Database Access Layer - health_insight_records 表操作
 * 對應 schema：migrations/0007_phase6_task1_120_health_insight_records.sql
 *
 * 跟 src/db/tables/ 底下其他表一致的風格：純粹的 D1 存取，不含任何
 * 業務邏輯（要不要存、存什麼內容是
 * src/persistence/health_insight/health_insight_persistence_service.js
 * 的責任，這裡只管「怎麼存取health_insight_records表」）。
 */
import { run, first, all } from '../query.js';

export function bind(db) {
  return {
    /**
     * @param {{id:string, user_id:string, insight_version:string, input_snapshot:string, output_snapshot:string, created_at:string}} record
     */
    async insert(record) {
      const sql = `INSERT INTO health_insight_records
        (id, user_id, insight_version, input_snapshot, output_snapshot, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`;
      const params = [
        record.id,
        record.user_id,
        record.insight_version,
        record.input_snapshot,
        record.output_snapshot,
        record.created_at,
      ];
      return run(db, sql, params);
    },
    async getById(id) {
      return first(db, 'SELECT * FROM health_insight_records WHERE id = ?', [id]);
    },
    async listByUser(userId, limit) {
      return all(db, 'SELECT * FROM health_insight_records WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit || 20]);
    },
    async countByUser(userId) {
      return first(db, 'SELECT COUNT(*) as c FROM health_insight_records WHERE user_id = ?', [userId]);
    },
  };
}

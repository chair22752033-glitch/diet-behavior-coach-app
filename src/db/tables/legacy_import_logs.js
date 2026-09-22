/*
 * Phase 1 TASK 1.16｜D1 Database Access Layer - legacy_import_logs 表操作
 * 對應 schema：migrations/0005_phase1_task1_16_import_log.sql
 */
import { run, first, all } from '../query.js';

export function bind(db) {
  return {
    async insert(l) {
      const sql = `INSERT INTO legacy_import_logs
        (id, source_type, source_key, status, imported_count, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        l.id,
        l.source_type || null,
        l.source_key || null,
        l.status || null,
        typeof l.imported_count === 'number' ? l.imported_count : null,
        l.error_message || null,
        l.created_at,
      ];
      return run(db, sql, params);
    },
    async getById(id) {
      return first(db, 'SELECT * FROM legacy_import_logs WHERE id = ?', [id]);
    },
    async getBySourceKey(sourceKey) {
      return all(db, 'SELECT * FROM legacy_import_logs WHERE source_key = ? ORDER BY created_at DESC', [sourceKey]);
    },
    /** 供「重複import防呆」使用：該 sourceKey 是否已有一筆 status='success' 的紀錄 */
    async hasSuccessfulImport(sourceKey) {
      const result = await first(
        db,
        "SELECT id FROM legacy_import_logs WHERE source_key = ? AND status = 'success' LIMIT 1",
        [sourceKey]
      );
      if (!result.ok) return result;
      return { ok: true, exists: !!result.row };
    },
  };
}

/*
 * Phase 1 TASK 1.12｜D1 Database Access Layer - ai_reports 表操作
 * 對應 schema：migrations/0001_phase1_task1_7_initial_schema.sql
 */
import { run, first, all } from '../query.js';

export function bind(db) {
  return {
    async insert(rep) {
      const sql = `INSERT INTO ai_reports
        (user_id, report_type, period_start, period_end, content, model_used)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING id`;
      const params = [
        rep.user_id,
        rep.report_type || null,
        rep.period_start || null,
        rep.period_end || null,
        rep.content || null,
        rep.model_used || null,
      ];
      const res = await first(db, sql, params);
      if (!res.ok) return res;
      return { ok: true, id: res.row ? res.row.id : null };
    },
    async getById(id) {
      return first(db, 'SELECT * FROM ai_reports WHERE id = ?', [id]);
    },
    async listByUser(userId, limit) {
      return all(db, 'SELECT * FROM ai_reports WHERE user_id = ? ORDER BY period_start DESC LIMIT ?', [userId, limit || 20]);
    },
  };
}

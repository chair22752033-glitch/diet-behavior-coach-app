/*
 * Phase 1 TASK 1.12｜D1 Database Access Layer - behavior_patterns 表操作
 * 對應 schema：migrations/0001_phase1_task1_7_initial_schema.sql
 */
import { run, first, all } from '../query.js';

export function bind(db) {
  return {
    async insert(pat) {
      const sql = `INSERT INTO behavior_patterns
        (user_id, pattern_type, summary, evidence_json, confidence_score, detected_at)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING id`;
      const params = [
        pat.user_id,
        pat.pattern_type || null,
        pat.summary || null,
        pat.evidence_json || null,
        typeof pat.confidence_score === 'number' ? pat.confidence_score : null,
        pat.detected_at,
      ];
      const res = await first(db, sql, params);
      if (!res.ok) return res;
      return { ok: true, id: res.row ? res.row.id : null };
    },
    async getById(id) {
      return first(db, 'SELECT * FROM behavior_patterns WHERE id = ?', [id]);
    },
    async listByUser(userId, limit) {
      return all(db, 'SELECT * FROM behavior_patterns WHERE user_id = ? ORDER BY detected_at DESC LIMIT ?', [userId, limit || 50]);
    },
    async listByUserAndType(userId, patternType, limit) {
      return all(db, 'SELECT * FROM behavior_patterns WHERE user_id = ? AND pattern_type = ? ORDER BY detected_at DESC LIMIT ?', [userId, patternType, limit || 50]);
    },
  };
}

/*
 * Phase 1 TASK 1.12｜D1 Database Access Layer - emotion_records 表操作
 * 對應 schema：migrations/0001_phase1_task1_7_initial_schema.sql
 */
import { run, first, all } from '../query.js';

export function bind(db) {
  return {
    async insert(rec) {
      const sql = `INSERT INTO emotion_records
        (user_id, emotion_type, intensity, trigger_note, linked_food_event_id, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING id`;
      const params = [
        rec.user_id,
        rec.emotion_type || null,
        typeof rec.intensity === 'number' ? rec.intensity : null,
        rec.trigger_note || null,
        rec.linked_food_event_id || null,
        rec.occurred_at,
      ];
      const res = await first(db, sql, params);
      if (!res.ok) return res;
      return { ok: true, id: res.row ? res.row.id : null };
    },
    async getById(id) {
      return first(db, 'SELECT * FROM emotion_records WHERE id = ?', [id]);
    },
    async listByUser(userId, limit) {
      return all(db, 'SELECT * FROM emotion_records WHERE user_id = ? ORDER BY occurred_at DESC LIMIT ?', [userId, limit || 50]);
    },
    async listByFoodEvent(foodEventId) {
      return all(db, 'SELECT * FROM emotion_records WHERE linked_food_event_id = ?', [foodEventId]);
    },
  };
}

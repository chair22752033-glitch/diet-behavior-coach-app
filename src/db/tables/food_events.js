/*
 * Phase 1 TASK 1.12｜D1 Database Access Layer - food_events 表操作
 * 對應 schema：migrations/0001_phase1_task1_7_initial_schema.sql
 */
import { run, first, all } from '../query.js';

export function bind(db) {
  return {
    /**
     * @returns {Promise<{ok:boolean, id?:number, error?:string}>} 用 RETURNING id 取得新建立的自增id
     * （這個 id 正是 TASK1.9 legacy import parser 裡 emotion_records.linked_food_event_local_index
     *  未來要換成真正 linked_food_event_id 時所需要的值）
     */
    async insert(evt) {
      const sql = `INSERT INTO food_events
        (user_id, meal_type, description, nutrients_json, image_id, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING id`;
      const params = [
        evt.user_id,
        evt.meal_type || null,
        evt.description || null,
        evt.nutrients_json || null,
        evt.image_id || null,
        evt.occurred_at,
      ];
      const res = await first(db, sql, params);
      if (!res.ok) return res;
      return { ok: true, id: res.row ? res.row.id : null };
    },
    async getById(id) {
      return first(db, 'SELECT * FROM food_events WHERE id = ?', [id]);
    },
    async listByUser(userId, limit) {
      return all(db, 'SELECT * FROM food_events WHERE user_id = ? ORDER BY occurred_at DESC LIMIT ?', [userId, limit || 50]);
    },
  };
}

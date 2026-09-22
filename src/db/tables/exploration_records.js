/*
 * Phase 1 TASK 1.12｜D1 Database Access Layer - exploration_records 表操作
 * 對應 schema：migrations/0001_phase1_task1_7_initial_schema.sql
 */
import { run, first, all } from '../query.js';

export function bind(db) {
  return {
    /**
     * @returns {Promise<{ok:boolean, id?:number, error?:string}>} 用 RETURNING id 取得新建立的自增id
     */
    async insert(rec) {
      const sql = `INSERT INTO exploration_records
        (user_id, draw_mode, card_category, card_object_key, card_text, photo_idx, responses_json, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`;
      const params = [
        rec.user_id,
        rec.draw_mode || null,
        rec.card_category || null,
        rec.card_object_key || null,
        rec.card_text || null,
        typeof rec.photo_idx === 'number' ? rec.photo_idx : null,
        rec.responses_json || null,
        rec.occurred_at,
      ];
      const res = await first(db, sql, params);
      if (!res.ok) return res;
      return { ok: true, id: res.row ? res.row.id : null };
    },
    async getById(id) {
      return first(db, 'SELECT * FROM exploration_records WHERE id = ?', [id]);
    },
    async listByUser(userId, limit) {
      return all(db, 'SELECT * FROM exploration_records WHERE user_id = ? ORDER BY occurred_at DESC LIMIT ?', [userId, limit || 50]);
    },
  };
}

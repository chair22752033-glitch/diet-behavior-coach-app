/*
 * Phase 1 TASK 1.15｜Domain Service Layer - Exploration Service
 * QUEST / 探索紀錄相關業務邏輯。所有資料一律透過 user_id 關聯（規則見下方檢查）。
 */
import { requireActiveUser } from './user_service.js';

/**
 * 建立一筆探索紀錄（對應現有 QUEST 抽卡功能的未來資料層，見 TASK1.7 exploration_records 表）。
 *
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {string} userId
 * @param {object} data - {draw_mode?, card_category?, card_object_key?, card_text?, photo_idx?, responses_json?, occurred_at}
 * @returns {Promise<{ok:boolean, id?:number, reason?:string, error?:string}>}
 */
export async function createExplorationRecord(db, userId, data) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) return { ok: false, reason: userCheck.reason };

  data = data || {};
  const now = new Date().toISOString();
  const result = await db.explorationRecords.insert({
    user_id: userId,
    draw_mode: data.draw_mode || null,
    card_category: data.card_category || null,
    card_object_key: data.card_object_key || null,
    card_text: data.card_text || null,
    photo_idx: typeof data.photo_idx === 'number' ? data.photo_idx : null,
    responses_json: data.responses_json || null,
    occurred_at: data.occurred_at || now,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: result.id };
}

/**
 * 取得某使用者的探索紀錄列表。
 * @returns {Promise<{ok:boolean, results?:Array, reason?:string, error?:string}>}
 */
export async function getUserExplorations(db, userId, limit) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) return { ok: false, reason: userCheck.reason };

  const result = await db.explorationRecords.listByUser(userId, limit);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, results: result.results };
}

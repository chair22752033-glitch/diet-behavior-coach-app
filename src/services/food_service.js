/*
 * Phase 1 TASK 1.15｜Domain Service Layer - Food Service
 * 飲食紀錄相關業務邏輯。
 *
 * 重要：nutrients_json 在這一層是「原樣保留、不解析、不驗證」的欄位——這裡完全
 * 不會去讀寫 src/worker.js 內建的 NUTRI_DATA（67項營養素常數），呼叫端要放什麼
 * JSON字串進來，就原封不動存進 D1，取出來也是原封不動回傳。不修改現有營養素資料。
 */
import { requireActiveUser } from './user_service.js';

/**
 * 記錄一筆飲食事件。
 *
 * @param {object} db
 * @param {string} userId
 * @param {object} data - {meal_type?, description?, nutrients_json?, image_id?, occurred_at?}
 * @returns {Promise<{ok:boolean, id?:number, reason?:string, error?:string}>}
 */
export async function recordFoodEvent(db, userId, data) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) return { ok: false, reason: userCheck.reason };

  data = data || {};
  const now = new Date().toISOString();
  const result = await db.foodEvents.insert({
    user_id: userId,
    meal_type: data.meal_type || null,
    description: data.description || null,
    nutrients_json: data.nutrients_json || null, // 原樣保留，不做任何解析或改寫
    image_id: data.image_id || null,
    occurred_at: data.occurred_at || now,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: result.id };
}

/**
 * 取得某使用者的飲食紀錄歷史。
 * @returns {Promise<{ok:boolean, results?:Array, reason?:string, error?:string}>}
 */
export async function listFoodHistory(db, userId, limit) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) return { ok: false, reason: userCheck.reason };

  const result = await db.foodEvents.listByUser(userId, limit);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, results: result.results };
}

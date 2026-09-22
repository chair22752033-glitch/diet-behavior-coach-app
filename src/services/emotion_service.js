/*
 * Phase 1 TASK 1.15｜Domain Service Layer - Emotion Service
 * 情緒紀錄管理。
 *
 * 需保留 future linked_food_event_id 關聯能力：這個欄位是選填的，本次不強制
 * 要求呼叫端一定要帶（因為飲食事件本身也是選填建立的），但完整支援傳入後
 * 正確存進 D1，也提供依 food_event 反查情緒紀錄的方法。
 */
import { requireActiveUser } from './user_service.js';

/**
 * 建立一筆情緒紀錄，可選擇性關聯到某筆飲食事件（linked_food_event_id）。
 *
 * @param {object} db
 * @param {string} userId
 * @param {object} data - {emotion_type?, intensity?, trigger_note?, linked_food_event_id?, occurred_at?}
 * @returns {Promise<{ok:boolean, id?:number, reason?:string, error?:string}>}
 */
export async function createEmotionRecord(db, userId, data) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) return { ok: false, reason: userCheck.reason };

  data = data || {};
  const now = new Date().toISOString();
  const result = await db.emotionRecords.insert({
    user_id: userId,
    emotion_type: data.emotion_type || null,
    intensity: typeof data.intensity === 'number' ? data.intensity : null,
    trigger_note: data.trigger_note || null,
    linked_food_event_id: data.linked_food_event_id || null, // 保留 future 關聯能力，選填
    occurred_at: data.occurred_at || now,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: result.id };
}

/**
 * 取得某使用者的情緒紀錄歷史。
 * @returns {Promise<{ok:boolean, results?:Array, reason?:string, error?:string}>}
 */
export async function listEmotionHistory(db, userId, limit) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) return { ok: false, reason: userCheck.reason };

  const result = await db.emotionRecords.listByUser(userId, limit);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, results: result.results };
}

/**
 * 依某筆飲食事件反查所有關聯的情緒紀錄（示範 linked_food_event_id 關聯能力）。
 * 不做使用者狀態檢查——這是給「已經確認過food_event屬於哪個user」的呼叫端用的
 * 內部查詢，避免重複驗證；若需要對外開放，應由呼叫端先驗證food_event的擁有者。
 * @returns {Promise<{ok:boolean, results?:Array, error?:string}>}
 */
export async function listEmotionsByFoodEvent(db, foodEventId) {
  const result = await db.emotionRecords.listByFoodEvent(foodEventId);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, results: result.results };
}

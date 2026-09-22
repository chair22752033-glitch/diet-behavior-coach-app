/*
 * Phase 1 TASK 1.15｜Domain Service Layer - Report Service
 * AI 報告資料存取層。
 *
 * 本階段不串接 AI：這裡只負責把「已經產生好的報告內容」存進去、取出來，
 * content 是誰、用什麼模型、怎麼生成的，完全是呼叫端（未來的AI報告產生模組）
 * 的事，這一層不呼叫任何 AI API、不做任何內容生成或摘要邏輯。
 */
import { requireActiveUser } from './user_service.js';

/**
 * 儲存一份報告。
 *
 * @param {object} db
 * @param {string} userId
 * @param {object} data - {report_type?, period_start?, period_end?, content?, model_used?}
 * @returns {Promise<{ok:boolean, id?:number, reason?:string, error?:string}>}
 */
export async function saveReport(db, userId, data) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) return { ok: false, reason: userCheck.reason };

  data = data || {};
  const result = await db.aiReports.insert({
    user_id: userId,
    report_type: data.report_type || null,
    period_start: data.period_start || null,
    period_end: data.period_end || null,
    content: data.content || null,
    model_used: data.model_used || null,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: result.id };
}

/**
 * 取得某使用者的報告歷史。
 * @returns {Promise<{ok:boolean, results?:Array, reason?:string, error?:string}>}
 */
export async function getReports(db, userId, limit) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) return { ok: false, reason: userCheck.reason };

  const result = await db.aiReports.listByUser(userId, limit);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, results: result.results };
}

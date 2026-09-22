/*
 * Phase 1 TASK 1.15｜Domain Service Layer - Behavior Service
 * 行為模式資料管理。
 *
 * 刻意不建立任何 AI 分析邏輯——這裡只負責「把已經算好/已經決定好的行為模式
 * 資料存進去、取出來」，pattern_type/summary/confidence_score 等內容是什麼、
 * 怎麼算出來的，完全是呼叫端（未來的分析模組）的事，不在這一層。
 */
import { requireActiveUser } from './user_service.js';

/**
 * 建立一筆行為模式紀錄。
 *
 * @param {object} db
 * @param {string} userId
 * @param {object} data - {pattern_type?, summary?, evidence_json?, confidence_score?, detected_at?}
 * @returns {Promise<{ok:boolean, id?:number, reason?:string, error?:string}>}
 */
export async function createBehaviorPattern(db, userId, data) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) return { ok: false, reason: userCheck.reason };

  data = data || {};
  const now = new Date().toISOString();
  const result = await db.behaviorPatterns.insert({
    user_id: userId,
    pattern_type: data.pattern_type || null,
    summary: data.summary || null,
    evidence_json: data.evidence_json || null,
    confidence_score: typeof data.confidence_score === 'number' ? data.confidence_score : null,
    detected_at: data.detected_at || now,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: result.id };
}

/**
 * 取得某使用者的行為模式紀錄，可選擇性依 pattern_type 篩選。
 * @param {object} [opts] - {patternType?, limit?}
 * @returns {Promise<{ok:boolean, results?:Array, reason?:string, error?:string}>}
 */
export async function getBehaviorPatterns(db, userId, opts) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) return { ok: false, reason: userCheck.reason };

  opts = opts || {};
  const result = opts.patternType
    ? await db.behaviorPatterns.listByUserAndType(userId, opts.patternType, opts.limit)
    : await db.behaviorPatterns.listByUser(userId, opts.limit);

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, results: result.results };
}

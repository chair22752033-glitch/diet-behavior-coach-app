/*
 * Phase 1 TASK 1.38｜Timeline Controller
 *
 * worker.js 與 Timeline Service（TASK1.38）之間的隔離層，跟
 * src/controllers/dashboard_controller.js（TASK1.36）/
 * src/controllers/profile_controller.js（TASK1.37）同樣的設計原則：
 * 接收輸入、呼叫service、用 src/contracts/response_contract.js 統一
 * 格式化回傳。完全沒有 SQL/db.prepare()/D1操作（不 import src/db/ 底下
 * 任何檔案）、沒有session/cookie邏輯本身（不處理auth，「目前是誰登入」
 * 完全是 src/middleware/auth_middleware.js 的 requireAuth() 的責任）、
 * 沒有AI分析生成邏輯。
 *
 * 安全設計：userId是獨立參數，由呼叫端（src/routes/timeline_routes.js）
 * 從 ctx.user.id（requireAuth()驗證session後放進ctx的使用者資料）傳入，
 * 從來不是從 query 裡讀取——即使query裡混入一個user_id欄位（例如
 * ?user_id=B），這裡也完全不會讀取它，更不會拿它覆蓋掉userId參數。
 * 沒有userId（代表沒有通過requireAuth()，理論上不會發生，因為route層
 * 一律先掛requireAuth()）時，一律安全回傳401，不會呼叫任何service。
 */
import { getTimeline } from '../services/timeline_service.js';
import { success, failure } from '../contracts/response_contract.js';
import { USER_CHECK_REASONS } from './data_controller.js';

/** 對應 GET /api/timeline */
export async function getTimelineController(db, userId, query) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    query = query && typeof query === 'object' ? query : {};

    const result = await getTimeline(db, userId, { limit: query.limit, offset: query.offset });
    if (!result.ok) {
      if (result.reason && USER_CHECK_REASONS.has(result.reason)) {
        return failure(result.reason, 401);
      }
      return failure(result.reason || result.error || 'timeline_failed', 500);
    }
    return success({ timeline: result.timeline, pagination: result.pagination });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

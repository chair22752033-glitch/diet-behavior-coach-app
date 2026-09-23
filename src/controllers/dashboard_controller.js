/*
 * Phase 1 TASK 1.36｜Dashboard Controller
 *
 * worker.js 與 Dashboard Aggregation Service（TASK1.36）之間的隔離層，
 * 跟 src/controllers/data_controller.js（TASK1.35）同樣的設計原則：
 * 接收輸入、呼叫service、用 src/contracts/response_contract.js 統一
 * 格式化回傳。完全沒有 SQL/db.prepare()/D1操作（不 import src/db/ 底下
 * 任何檔案）、沒有session/cookie邏輯本身、沒有AI分析生成邏輯。
 *
 * 安全設計：userId是獨立參數，由呼叫端（src/routes/dashboard_routes.js）
 * 從 ctx.user.id（requireAuth()驗證session後放進ctx的使用者資料）傳入，
 * 從來不是從 query 裡讀取——即使query裡混入一個user_id欄位，這裡也完全
 * 不會讀取它。沒有userId時一律安全回傳401，不會呼叫任何service。
 */
import { getDashboard } from '../services/dashboard_service.js';
import { success, failure } from '../contracts/response_contract.js';
import { USER_CHECK_REASONS, parseLimit } from './data_controller.js';

/** 對應 GET /api/dashboard */
export async function getDashboardController(db, userId, query) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    const limit = parseLimit(query && query.limit);
    const result = await getDashboard(db, userId, { limit });
    if (!result.ok) {
      if (result.reason && USER_CHECK_REASONS.has(result.reason)) {
        return failure(result.reason, 401);
      }
      return failure(result.reason || result.error || 'dashboard_failed', 500);
    }
    return success({
      explorations: result.explorations,
      foodEvents: result.foodEvents,
      emotions: result.emotions,
      behaviors: result.behaviors,
      reports: result.reports,
    });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

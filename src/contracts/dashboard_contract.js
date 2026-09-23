/*
 * Phase 1 TASK 1.36｜Dashboard Contract
 *
 * 定義 getDashboardController（GET /api/dashboard）的 request/response
 * 規格。沒有body，查詢條件只有選填的limit（透過query string，五個
 * 子查詢共用同一個limit），所以request schema跟TASK1.35 list系列
 * contract一樣是空物件——limit不影響validateBody()的驗證結果。
 *
 * 這裡完全不包含user_id欄位——user_id一律由requireAuth() middleware
 * 驗證session後放進ctx.user.id，由src/routes/dashboard_routes.js傳給
 * controller，query裡即使夾帶user_id也會被完全忽略。
 */

export const dashboardContract = {
  request: {},
  response: {
    success: {
      explorations: 'object',
      foodEvents: 'object',
      emotions: 'object',
      behaviors: 'object',
      reports: 'object',
    },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'dashboard_failed'],
    failureStatus: [401, 500],
  },
};

/*
 * Phase 1 TASK 1.36｜Dashboard Route
 *
 * 建立 GET /api/dashboard → getDashboardController 的 mapping。
 *
 * Flow：Request → Router → Auth Middleware（requireAuth()）→ Current
 * User（ctx.user）→ Dashboard Controller → Dashboard Service → 並行讀取
 * 五大Domain Service → 組合Dashboard Response。
 *
 * middlewares順序跟 src/routes/data_routes.js（TASK1.35）一致：
 * [requireAuth(), contractValidation]——先驗證身份（未登入直接401短路，
 * 不會呼叫controller），通過後才做contract validation。
 *
 * 安全要求：
 * 1. 必須登入才能取得 → requireAuth()驗證失敗時整條pipeline在這裡短路
 * 2. user_id只能來自session → 一律用 ctx.user.id
 * 3. 不接受payload user_id → 這裡完全不會讀取 ctx.req.query.user_id
 * 4. 不可跨使用者資料 → getDashboard()傳給五個domain service的userId
 *    就是ctx.user.id，SQL查詢一律用這個userId的WHERE條件（TASK1.12
 *    既有實作），不可能查到別人的資料
 */
import { getDashboardController } from '../controllers/dashboard_controller.js';
import { requireAuth } from '../middleware/auth_middleware.js';
import { createContractValidationMiddleware } from '../middleware/validator.js';
import { dashboardContract } from '../contracts/dashboard_contract.js';

function getQuery(ctx) {
  return (ctx && ctx.req && ctx.req.query) || {};
}
function currentUserId(ctx) {
  return ctx && ctx.user ? ctx.user.id : null;
}

export function registerDashboardRoutes(router) {
  router.add(
    'GET',
    '/api/dashboard',
    async (ctx) => getDashboardController(ctx.db, currentUserId(ctx), getQuery(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(dashboardContract, getQuery)] }
  );
}

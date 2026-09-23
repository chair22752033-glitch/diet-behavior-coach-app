/*
 * Phase 1 TASK 1.37｜Profile Routes
 *
 * 建立 GET /api/profile → getProfileController、
 * PATCH /api/profile → updateProfileController 的 mapping。
 *
 * Flow：Request → Router → requireAuth() → Contract Validation →
 * Profile Controller → Profile Service → User Service / DB Access
 * Layer → D1。
 *
 * middlewares順序跟 src/routes/data_routes.js（TASK1.35）/
 * src/routes/dashboard_routes.js（TASK1.36）一致：
 * [requireAuth(), contractValidation]——先驗證身份（未登入直接401
 * 短路，不會做payload格式驗證），通過後才做contract validation。
 *
 * 安全要求：
 * 1. 未登入不可存取 → requireAuth()驗證失敗時整條pipeline在這裡短路
 * 2. user_id必須來自session → 一律用 ctx.user.id
 * 3. 不接受payload user_id → 這裡完全不會讀取 ctx.req.payload.user_id
 * 4. 不可跨使用者資料 → getProfile()/updateProfile()傳給service的
 *    userId就是ctx.user.id，不可能操作到別人的資料
 * 5. 禁止修改identity/system欄位 → updateProfileController()本身只會
 *    抽取payload.displayName轉交給service，這裡完全不會把
 *    auth_provider/is_guest/status等欄位傳下去
 */
import { getProfileController, updateProfileController } from '../controllers/profile_controller.js';
import { requireAuth } from '../middleware/auth_middleware.js';
import { createContractValidationMiddleware } from '../middleware/validator.js';
import { getProfileContract, updateProfileContract } from '../contracts/profile_contract.js';

function getPayload(ctx) {
  return (ctx && ctx.req && ctx.req.payload) || {};
}
function getQuery(ctx) {
  return (ctx && ctx.req && ctx.req.query) || {};
}
function currentUserId(ctx) {
  return ctx && ctx.user ? ctx.user.id : null;
}

export function registerProfileRoutes(router) {
  router.add(
    'GET',
    '/api/profile',
    async (ctx) => getProfileController(ctx.db, currentUserId(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(getProfileContract, getQuery)] }
  );

  router.add(
    'PATCH',
    '/api/profile',
    async (ctx) => updateProfileController(ctx.db, currentUserId(ctx), getPayload(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(updateProfileContract, getPayload)] }
  );
}

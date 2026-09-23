/*
 * Phase 1 TASK 1.35｜User Data Routes
 *
 * 建立五個資源（exploration/food-events/emotions/behaviors/reports）
 * 各自 POST（建立）/GET（查詢）的 method+path → controller mapping。
 *
 * Flow：Request → Router → Auth Middleware（requireAuth()，TASK1.27既有
 * 邏輯，本次是第一個真的把它掛進route的地方）→ Current User（ctx.user，
 * 由requireAuth()驗證session後放入）→ Controller → Domain Service
 * （TASK1.15）→ DB Access Layer（TASK1.12）→ D1。
 *
 * 每條路由的 middlewares 順序都是 [requireAuth(), contractValidation]：
 * 先驗證身份（未登入直接401短路，不會做payload格式驗證，避免對未登入的
 * 呼叫端洩漏「payload格式對不對」這種資訊），身份驗證通過後才做contract
 * validation，最後才進 controller。
 *
 * 安全要求（呼應TASK1.35規格）：
 * 1. 未登入不可存取 → requireAuth()驗證失敗時整條pipeline在這裡短路，
 *    根本不會呼叫controller
 * 2. user_id必須來自session → 這裡一律用 ctx.user.id（requireAuth()的
 *    產物），從來不讀取 ctx.req.payload.user_id 或 ctx.req.query.user_id
 * 3. 禁止payload指定user_id → 即使payload/query帶了user_id欄位，這裡
 *    完全不會把它傳給controller（controller的userId參數只會是
 *    ctx.user.id）
 * 4. 不可讀取其他user資料 → getUserExplorations()等service函式的SQL
 *    一律用「傳入的userId」的WHERE條件查詢（TASK1.12既有實作），這裡
 *    傳入的userId就是ctx.user.id，不可能查到別人的資料
 * 5. D1操作只能透過service → 這個檔案完全沒有import src/db/底下任何
 *    檔案，一律透過data_controller.js委派給domain service
 */
import {
  createExplorationController,
  listExplorationsController,
  createFoodEventController,
  listFoodEventsController,
  createEmotionController,
  listEmotionsController,
  createBehaviorController,
  listBehaviorsController,
  createReportController,
  listReportsController,
} from '../controllers/data_controller.js';
import { requireAuth } from '../middleware/auth_middleware.js';
import { createContractValidationMiddleware } from '../middleware/validator.js';
import {
  createExplorationContract,
  listExplorationsContract,
  createFoodEventContract,
  listFoodEventsContract,
  createEmotionContract,
  listEmotionsContract,
  createBehaviorContract,
  listBehaviorsContract,
  createReportContract,
  listReportsContract,
} from '../contracts/data_contract.js';

function getPayload(ctx) {
  return (ctx && ctx.req && ctx.req.payload) || {};
}
function getQuery(ctx) {
  return (ctx && ctx.req && ctx.req.query) || {};
}
function currentUserId(ctx) {
  return ctx && ctx.user ? ctx.user.id : null;
}

export function registerDataRoutes(router) {
  // ---------------------------------------------------------------------
  // 1. Exploration
  // ---------------------------------------------------------------------
  router.add(
    'POST',
    '/api/explorations',
    async (ctx) => createExplorationController(ctx.db, currentUserId(ctx), getPayload(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(createExplorationContract, getPayload)] }
  );
  router.add(
    'GET',
    '/api/explorations',
    async (ctx) => listExplorationsController(ctx.db, currentUserId(ctx), getQuery(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(listExplorationsContract, getQuery)] }
  );

  // ---------------------------------------------------------------------
  // 2. Food
  // ---------------------------------------------------------------------
  router.add(
    'POST',
    '/api/food-events',
    async (ctx) => createFoodEventController(ctx.db, currentUserId(ctx), getPayload(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(createFoodEventContract, getPayload)] }
  );
  router.add(
    'GET',
    '/api/food-events',
    async (ctx) => listFoodEventsController(ctx.db, currentUserId(ctx), getQuery(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(listFoodEventsContract, getQuery)] }
  );

  // ---------------------------------------------------------------------
  // 3. Emotion
  // ---------------------------------------------------------------------
  router.add(
    'POST',
    '/api/emotions',
    async (ctx) => createEmotionController(ctx.db, currentUserId(ctx), getPayload(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(createEmotionContract, getPayload)] }
  );
  router.add(
    'GET',
    '/api/emotions',
    async (ctx) => listEmotionsController(ctx.db, currentUserId(ctx), getQuery(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(listEmotionsContract, getQuery)] }
  );

  // ---------------------------------------------------------------------
  // 4. Behavior
  // ---------------------------------------------------------------------
  router.add(
    'POST',
    '/api/behaviors',
    async (ctx) => createBehaviorController(ctx.db, currentUserId(ctx), getPayload(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(createBehaviorContract, getPayload)] }
  );
  router.add(
    'GET',
    '/api/behaviors',
    async (ctx) => listBehaviorsController(ctx.db, currentUserId(ctx), getQuery(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(listBehaviorsContract, getQuery)] }
  );

  // ---------------------------------------------------------------------
  // 5. Report
  // ---------------------------------------------------------------------
  router.add(
    'POST',
    '/api/reports',
    async (ctx) => createReportController(ctx.db, currentUserId(ctx), getPayload(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(createReportContract, getPayload)] }
  );
  router.add(
    'GET',
    '/api/reports',
    async (ctx) => listReportsController(ctx.db, currentUserId(ctx), getQuery(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(listReportsContract, getQuery)] }
  );
}

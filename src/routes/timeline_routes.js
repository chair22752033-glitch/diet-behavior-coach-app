/*
 * Phase 1 TASK 1.38｜Timeline Route
 *
 * 建立 GET /api/timeline → getTimelineController 的 mapping。
 *
 * Flow：Request → Router → Auth Middleware（requireAuth()）→ Contract
 * Validation → Timeline Controller → Timeline Service → 五大Domain
 * Service（Promise.all並行）→ Aggregation → 依timestamp DESC排序 →
 * Response。
 *
 * middlewares順序跟 src/routes/dashboard_routes.js（TASK1.36）/
 * src/routes/profile_routes.js（TASK1.37）一致：
 * [requireAuth(), contractValidation]——先驗證身份（未登入直接401短路，
 * 不會做payload格式驗證），通過後才做contract validation。
 *
 * getQuery()：把 ctx.req.query 裡的 limit/offset 原始字串（來自
 * src/worker.js 用 url.searchParams.get() 取出的query string，一律是
 * 字串或null）轉成真正的 Number 型別，讓 timelineContract 宣告的
 * type:'number' 驗證能正確通過合法的數字字串；沒有帶這兩個參數時保持
 * undefined（required:false，不受影響）。轉換失敗（非數字字串）時刻意
 * 保留 NaN，交給 timeline_service.js 的 normalizeLimit()/
 * normalizeOffset() 安全回退到預設值，不在這裡就讓整個請求失敗。
 *
 * 安全要求：
 * 1. 必須登入才能取得 → requireAuth()驗證失敗時整條pipeline在這裡短路
 * 2. user_id只能來自session → 一律用 ctx.user.id
 * 3. 不接受query user_id → 這裡完全不會讀取 ctx.req.query.user_id，
 *    getQuery()只挑出limit/offset兩個已知欄位
 * 4. 不可跨使用者資料 → getTimeline()傳給五個domain service的userId
 *    就是ctx.user.id，SQL查詢一律用這個userId的WHERE條件（TASK1.12
 *    既有實作），不可能查到別人的資料
 * 5. 不直接操作SQL → 這個檔案完全沒有import src/db/底下任何檔案
 */
import { getTimelineController } from '../controllers/timeline_controller.js';
import { requireAuth } from '../middleware/auth_middleware.js';
import { createContractValidationMiddleware } from '../middleware/validator.js';
import { timelineContract } from '../contracts/timeline_contract.js';

function toNumberOrUndefined(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return Number(raw);
}

function getQuery(ctx) {
  const rawQuery = (ctx && ctx.req && ctx.req.query) || {};
  return {
    limit: toNumberOrUndefined(rawQuery.limit),
    offset: toNumberOrUndefined(rawQuery.offset),
  };
}

function currentUserId(ctx) {
  return ctx && ctx.user ? ctx.user.id : null;
}

export function registerTimelineRoutes(router) {
  router.add(
    'GET',
    '/api/timeline',
    async (ctx) => getTimelineController(ctx.db, currentUserId(ctx), getQuery(ctx)),
    { middlewares: [requireAuth(), createContractValidationMiddleware(timelineContract, getQuery)] }
  );
}

/*
 * Phase 1 TASK 1.21｜Auth Routes
 * （TASK1.29 起 POST /auth/guest 正式上線，TASK1.30 起 GET /auth/me、
 * POST /auth/logout 正式上線，TASK1.31 起 POST /auth/provider/upgrade
 * 正式上線）
 *
 * 建立 method+path → controller 的 mapping。
 * handler 從 Router 補好的 context（{req, db, env, services, params}）取出
 * TASK1.20 controller 需要的參數，呼叫後直接把 controller 回傳的
 * { ok, data/reason, status } 原樣交回給 Router 做 Response 轉換——
 * 這裡完全不直接呼叫 db.users/db.sessions，一律委派給 controller。
 *
 * req 是「已經解析好的請求描述物件」（method/pathname 之外還可能帶
 * payload/cookieHeader/options）——worker.js 對這四條已上線的路由都會
 * 把真正的 HTTP body/Cookie 標頭解析好傳進來。POST /auth/provider
 * （純Google OAuth登入，不是升級）維持TASK1.20原本的設計，尚未接上
 * 真正的HTTP request 解析，仍是「架構已備妥、尚未上線」狀態——本次
 * TASK1.31明確只啟用身份升級入口，不接Google OAuth callback。
 *
 * TASK1.29/1.30/1.31 已上線的四條路由都：
 * 1. 掛上 TASK1.28 對應的 contract validation middleware。
 * 2. controller 成功時，若 data.cookie 是字串，就把它實際附加到 HTTP
 *    回應的 Set-Cookie 標頭上（controller 本身刻意跟傳輸協定無關，只把
 *    cookie 字串放在 data 裡，「幫它變成真正的 Set-Cookie header」是
 *    路由層的責任）——guest login/身份升級 用它設定新session的cookie，
 *    logout 用它送出「清除cookie」的Set-Cookie（Max-Age=0）。GET
 *    /auth/me 是純讀取，controller 回傳值裡沒有 cookie 欄位，
 *    withSetCookie() 自然不會產生任何 Set-Cookie，不會意外建立新session。
 */
import {
  loginGuestController,
  loginProviderController,
  logoutController,
  currentUserController,
  upgradeGuestController,
} from '../controllers/auth_controller.js';
import { createContractValidationMiddleware } from '../middleware/validator.js';
import { loginGuestContract, logoutContract, currentUserContract, upgradeProviderContract } from '../contracts/auth_contract.js';

function withSetCookie(result) {
  if (result && result.ok && result.data && typeof result.data.cookie === 'string') {
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': result.data.cookie,
      },
    });
  }
  return result;
}

export function registerAuthRoutes(router) {
  router.add(
    'POST',
    '/auth/guest',
    async (ctx) => {
      const req = ctx.req || {};
      const result = await loginGuestController(ctx.db, req.payload, req.options);
      return withSetCookie(result);
    },
    { middlewares: [createContractValidationMiddleware(loginGuestContract)] }
  );

  router.add('POST', '/auth/provider', async (ctx) => {
    const req = ctx.req || {};
    return loginProviderController(ctx.db, req.payload, req.options);
  });

  router.add(
    'POST',
    '/auth/logout',
    async (ctx) => {
      const req = ctx.req || {};
      const result = await logoutController(ctx.db, req.cookieHeader, req.options);
      return withSetCookie(result);
    },
    { middlewares: [createContractValidationMiddleware(logoutContract)] }
  );

  router.add(
    'GET',
    '/auth/me',
    async (ctx) => {
      const req = ctx.req || {};
      // 純讀取：currentUserController → getCurrentUser() →
      // validateSessionWithIdentity() 全程只查詢，不建立/更新任何
      // session 或 user 資料。回傳值不含cookie欄位，withSetCookie()
      // 原樣透傳，不會產生Set-Cookie。
      return currentUserController(ctx.db, req.cookieHeader, req.options);
    },
    { middlewares: [createContractValidationMiddleware(currentUserContract)] }
  );

  router.add(
    'POST',
    '/auth/provider/upgrade',
    async (ctx) => {
      const req = ctx.req || {};
      // 注意：guestUserId不是從payload來的，是upgradeGuestController內部
      // 用cookieHeader解析出「目前登入的是誰」——這裡只負責把兩個原始
      // 輸入原樣轉交，不做任何身份判斷。
      const result = await upgradeGuestController(ctx.db, req.cookieHeader, req.payload, req.options);
      return withSetCookie(result);
    },
    { middlewares: [createContractValidationMiddleware(upgradeProviderContract)] }
  );
}

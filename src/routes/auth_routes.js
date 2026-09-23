/*
 * Phase 1 TASK 1.21｜Auth Routes（TASK1.29 起 POST /auth/guest 正式上線）
 *
 * 建立 method+path → controller 的 mapping。
 * handler 從 Router 補好的 context（{req, db, env, services, params}）取出
 * TASK1.20 controller 需要的參數，呼叫後直接把 controller 回傳的
 * { ok, data/reason, status } 原樣交回給 Router 做 Response 轉換。
 *
 * req 是「已經解析好的請求描述物件」（method/pathname 之外還可能帶
 * payload/cookieHeader/options）——TASK1.29 的 worker.js 對 POST
 * /auth/guest 已經會把真正 HTTP body 解析成 payload 傳進來；其餘三條
 * 路由（provider/logout/me）維持TASK1.20原本的設計，尚未接上真正的
 * HTTP request 解析，仍是「架構已備妥、尚未上線」狀態。
 *
 * TASK1.29：只有 POST /auth/guest 正式啟用——
 * 1. 掛上 TASK1.28 的 contract validation middleware（loginGuestContract）。
 * 2. controller 成功時，把 data.cookie（Set-Cookie字串）實際附加到
 *    HTTP 回應的標頭上（controller 本身刻意跟傳輸協定無關，只把 cookie
 *    字串放在 data 裡，「幫它變成真正的 Set-Cookie header」是路由層的
 *    責任）。失敗情境或其餘三條路由完全不受影響，一律照舊交給 Router
 *    的 makeResponse() 處理。
 */
import {
  loginGuestController,
  loginProviderController,
  logoutController,
  currentUserController,
} from '../controllers/auth_controller.js';
import { createContractValidationMiddleware } from '../middleware/validator.js';
import { loginGuestContract } from '../contracts/auth_contract.js';

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

  router.add('POST', '/auth/logout', async (ctx) => {
    const req = ctx.req || {};
    return logoutController(ctx.db, req.cookieHeader, req.options);
  });

  router.add('GET', '/auth/me', async (ctx) => {
    const req = ctx.req || {};
    return currentUserController(ctx.db, req.cookieHeader, req.options);
  });
}

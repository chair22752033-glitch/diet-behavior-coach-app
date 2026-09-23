/*
 * Phase 1 TASK 1.21｜Auth Routes
 *
 * 只建立 method+path → controller 的 mapping，不可真的掛到 worker.js。
 * handler 從 Router 補好的 context（{req, db, env, services, params}）取出
 * TASK1.20 controller 需要的參數，呼叫後直接把 controller 回傳的
 * { ok, data/reason, status } 原樣交回給 Router 做 Response 轉換。
 *
 * req 是「已經解析好的請求描述物件」（method/pathname 之外還可能帶
 * payload/cookieHeader/options），不是真正的 Fetch Request——這跟
 * TASK1.20 controller 刻意跟傳輸協定無關的設計一致，實際怎麼從一個真正
 * 的 HTTP Request 解析出 payload/cookieHeader，留給未來真正接上
 * worker.js 的那個任務處理。
 */
import {
  loginGuestController,
  loginProviderController,
  logoutController,
  currentUserController,
} from '../controllers/auth_controller.js';

export function registerAuthRoutes(router) {
  router.add('POST', '/auth/guest', async (ctx) => {
    const req = ctx.req || {};
    return loginGuestController(ctx.db, req.payload, req.options);
  });

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

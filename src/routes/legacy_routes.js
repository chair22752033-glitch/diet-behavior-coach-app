/*
 * Phase 1 TASK 1.26｜Legacy Route Adapter
 *
 * registerLegacyRoutes(router, legacyHandler) 把既有 Worker 路由「搬」進
 * Router Layer——只搬「這個 method+path 該由誰處理」這件事，完全不重新
 * 實作任何業務邏輯：每個 handler 都只是原封不動呼叫
 * legacyHandler(request, env)，把它回傳的真正 Response 原樣交回去
 * （見 src/routes/router.js TASK1.26 新增的「handler 回傳真正 Response
 * 時原樣透傳」規則，HTML/圖片/純文字都不會被誤轉成 JSON）。
 *
 * 完全不 import src/worker.js，也不知道 handle() 內部長什麼樣子——
 * legacyHandler 一律由呼叫端（route_gateway.js）注入。
 */

function delegate(ctx) {
  return ctx.legacyHandler(ctx.req, ctx.env);
}

/**
 * @param {object} router - createRouter() 的輸出
 * @param {(request:object, env:object) => Promise<Response>} legacyHandler
 *   src/worker.js 完全沒有變動過的 handle(r, env)。
 */
export function registerLegacyRoutes(router, legacyHandler) {
  if (!router || typeof router.add !== 'function') {
    throw new Error('registerLegacyRoutes(router, legacyHandler)：router 必須是 createRouter() 的輸出');
  }
  if (typeof legacyHandler !== 'function') {
    throw new Error('registerLegacyRoutes(router, legacyHandler)：legacyHandler 必須是函式');
  }

  function handler(ctx) {
    return delegate(Object.assign({}, ctx, { legacyHandler }));
  }

  router.add('GET', '/', handler);
  router.add('GET', '/manifest.json', handler);
  router.add('GET', '/icon.svg', handler);
  router.add('GET', '/apple-touch-icon.png', handler);
  router.add('GET', '/img/:path*', handler);
  router.add('GET', '/api/sync', handler);
  router.add('POST', '/api/sync', handler);
  router.add('GET', '/api/qlive', handler);
  router.add('POST', '/api/qlive', handler);
}

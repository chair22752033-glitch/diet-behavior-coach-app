/*
 * Phase 1 TASK 1.21｜Router 組裝入口（TASK1.26 起可選擇性掛載 Legacy Route Adapter）
 *
 * createAppRouter() 組出一個包含全部已定義路由的 Router 實例。
 * 重要：src/worker.js 完全沒有直接引用這個目錄——實際production使用的
 * router 是透過 src/bootstrap/application.js 的 createApplication(env)
 * 呼叫這裡的 createAppRouter()（不傳 legacyHandler）建立，再由
 * src/bootstrap/route_gateway.js（TASK1.26）視 feature flag 決定要不要
 * 動用它——這仍然是「基礎架構」而非「正式開放的 API」。
 */
import { createRouter } from './router.js';
import { registerAuthRoutes } from './auth_routes.js';
import { registerUserRoutes } from './user_routes.js';
import { registerLegacyRoutes } from './legacy_routes.js';

/**
 * @param {(request:object, env:object) => Promise<Response>} [legacyHandler]
 *   選填。有提供時，一併掛載 TASK1.26 的 Legacy Route Adapter（見
 *   legacy_routes.js 的 9 條路由）；未提供時行為與 TASK1.21～1.25 完全
 *   一致（只有 auth/user 路由）。
 */
export function createAppRouter(legacyHandler) {
  const router = createRouter();
  registerAuthRoutes(router);
  registerUserRoutes(router);
  if (typeof legacyHandler === 'function') {
    registerLegacyRoutes(router, legacyHandler);
  }
  return router;
}

export { createRouter } from './router.js';
export { registerAuthRoutes } from './auth_routes.js';
export { registerUserRoutes } from './user_routes.js';
export { registerLegacyRoutes } from './legacy_routes.js';

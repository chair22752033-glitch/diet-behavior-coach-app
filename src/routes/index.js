/*
 * Phase 1 TASK 1.21｜Router 組裝入口
 *
 * createAppRouter() 組出一個包含全部已定義路由的 Router 實例。
 * 重要：本次沒有任何檔案 import 這裡，src/worker.js 完全沒有引用
 * 這個目錄底下的任何東西——這是「基礎架構」而非「正式接上的 API」。
 */
import { createRouter } from './router.js';
import { registerAuthRoutes } from './auth_routes.js';
import { registerUserRoutes } from './user_routes.js';

export function createAppRouter() {
  const router = createRouter();
  registerAuthRoutes(router);
  registerUserRoutes(router);
  return router;
}

export { createRouter } from './router.js';
export { registerAuthRoutes } from './auth_routes.js';
export { registerUserRoutes } from './user_routes.js';

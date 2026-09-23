/*
 * Phase 1 TASK 1.21｜User Routes
 *
 * 只建立 GET /users/:id → getUserByIdController 的 mapping，不可真的掛到 worker.js。
 * :id 這個路由參數由 Router 解析後放進 ctx.params，這裡轉成
 * TASK1.20 controller 需要的 { userId } payload 形狀。
 */
import { getUserByIdController } from '../controllers/user_controller.js';

export function registerUserRoutes(router) {
  router.add('GET', '/users/:id', async (ctx) => {
    return getUserByIdController(ctx.db, { userId: ctx.params.id });
  });
}

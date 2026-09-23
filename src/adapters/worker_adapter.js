/*
 * Phase 1 TASK 1.22｜Worker Adapter
 *
 * 未來 worker.js 與 Router Layer（TASK1.21）之間的接線層：
 *   request → createRequestContext() → createAppRouter() → router.handle() → Response
 *
 * 重要：本次不允許 `export default` 一個 worker、也不允許修改
 * src/worker.js——這裡只準備好 createWorkerHandler()，回傳一個
 * `(request, env) => Promise<Response>` 形狀的函式，将來真正要接線時
 * 才會由 worker.js 呼叫它，本次沒有任何地方呼叫它。
 */
import { createAppRouter } from '../routes/index.js';
import { createRequestContext } from './context_builder.js';

/**
 * @returns {(request:object, env:object) => Promise<Response>}
 */
export function createWorkerHandler() {
  const router = createAppRouter();

  return async function handleRequest(request, env) {
    try {
      const context = createRequestContext(env, request);
      return await router.handle(context.req, {
        db: context.db,
        env: context.env,
        services: context.services,
      });
    } catch (e) {
      const reason = e && e.message ? e.message : String(e);
      return new Response(JSON.stringify({ ok: false, reason }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

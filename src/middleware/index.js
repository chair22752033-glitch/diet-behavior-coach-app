/*
 * Phase 1 TASK 1.27｜Middleware Pipeline 組裝入口
 *
 * createMiddlewarePipeline(middlewares) 回傳一個 applyPipeline(handler)
 * 函式：把一串 middleware（(ctx,next)=>any 形狀）跟最終的 route handler
 * 組成一條鏈，並且統一套用 request context 補完（request_context.js）
 * 與例外攔截（error_handler.js）。
 *
 * 本次 router.js 接入時一律傳入空陣列 `[]`（沒有任何 middleware），
 * 所以目前流程等同於「補上 requestId/timestamp/user 欄位 + 例外攔截」，
 * 不改變任何既有 route 的輸出——「只建立架構，不開啟正式功能」。
 */
import { withErrorHandling } from './error_handler.js';
import { buildRequestContext } from './request_context.js';
import { requireAuth } from './auth_middleware.js';
import { validateBody, validateContract, createContractValidationMiddleware } from './validator.js';

/**
 * @param {Array<(ctx:object, next:(ctx:object)=>any) => any>} [middlewares]
 * @returns {(handler:(ctx:object)=>any) => (ctx:object) => Promise<any>}
 */
export function createMiddlewarePipeline(middlewares) {
  const chain = Array.isArray(middlewares) ? middlewares.slice() : [];

  return function applyPipeline(handler) {
    if (typeof handler !== 'function') {
      throw new Error('applyPipeline(handler)：handler 必須是函式');
    }

    async function run(ctx) {
      const enrichedCtx = Object.assign({}, ctx, buildRequestContext(ctx));
      const composed = chain.reduceRight((next, middleware) => {
        return (c) => middleware(c, next);
      }, handler);
      return composed(enrichedCtx);
    }

    return withErrorHandling(run);
  };
}

export { withErrorHandling } from './error_handler.js';
export { buildRequestContext } from './request_context.js';
export { requireAuth } from './auth_middleware.js';
export { validateBody, validateContract, createContractValidationMiddleware } from './validator.js';

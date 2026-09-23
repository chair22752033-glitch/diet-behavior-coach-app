/*
 * Phase 1 TASK 1.27｜Error Handler Middleware
 *
 * withErrorHandling(handler) 包住一個 route handler，捕捉它執行時丟出的
 * 任何例外，統一轉成跟 TASK1.20 src/controllers/response.js 完全一樣的
 * 格式：{ok:false, reason, status}——不新增另一套錯誤格式，跟既有
 * controller/router 的錯誤回應完全一致，router.js（TASK1.21）拿到這個
 * plain object 後會照舊用 makeResponse() 轉成 Response。
 *
 * 沒有例外時，原樣回傳 handler 的回傳值（可能是 plain object，也可能是
 * 已經是真正 Response 的值——例如 TASK1.26 legacy route 的 delegate
 * handler），完全不碰內容，確保「禁止改變既有route輸出」。
 */

/**
 * @param {(ctx:object) => any} handler
 * @returns {(ctx:object) => Promise<any>}
 */
export function withErrorHandling(handler) {
  if (typeof handler !== 'function') {
    throw new Error('withErrorHandling(handler)：handler 必須是函式');
  }
  return async function wrapped(ctx) {
    try {
      return await handler(ctx);
    } catch (e) {
      return { ok: false, reason: e && e.message ? e.message : String(e), status: 500 };
    }
  };
}

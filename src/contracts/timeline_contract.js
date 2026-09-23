/*
 * Phase 1 TASK 1.38｜Timeline Contract
 *
 * 定義 getTimelineController（GET /api/timeline）的 request/response
 * 規格。查詢條件是選填的 limit/offset（透過query string），沒有body。
 *
 * request schema 宣告 limit/offset 為 type:'number'——因為
 * src/routes/timeline_routes.js 的 getQuery() 會先把 query string 原始
 * 字串（例如 "50"）轉成真正的 Number 再交給
 * createContractValidationMiddleware() 驗證，所以合法的數字字串在這裡
 * 驗證時已經是 number 型別。範圍驗證（limit: 1~100、offset: >=0）不是
 * 由這裡的通用 validateBody()（只支援 required/type，見
 * src/middleware/validator.js）負責——那是 timeline_service.js 的
 * normalizeLimit()/normalizeOffset() 的責任，超出範圍或不合法一律安全
 * 回退到預設值（1~100/>=0），不會讓查詢失敗，跟既有 list 系列 API
 * （data_controller.js 的 parseLimit()）同樣的「defensive normalize」
 * 哲學。
 *
 * 這裡完全不包含user_id欄位——user_id一律由requireAuth() middleware
 * 驗證session後放進ctx.user.id，由 timeline_routes.js 傳給controller，
 * query裡即使夾帶user_id（例如 ?user_id=B）也會被完全忽略。
 */

export const timelineContract = {
  request: {
    limit: { required: false, type: 'number' },
    offset: { required: false, type: 'number' },
  },
  response: {
    success: {
      timeline: 'object',
      pagination: 'object',
    },
    failureReasons: [
      'not_authenticated',
      'user_not_found',
      'user_suspended',
      'user_deleted',
      'user_status_unknown',
      'timeline_failed',
    ],
    failureStatus: [401, 500],
  },
};

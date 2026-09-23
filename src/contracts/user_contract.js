/*
 * Phase 1 TASK 1.28｜User Contract
 *
 * 定義 TASK1.15/1.20 已經存在的 getUserById 操作（GET /users/:id）的
 * request/response 規格。`request` schema 跟 TASK1.27
 * `src/middleware/validator.js` 的 `validateBody(schema, data)` 完全
 * 相容。
 */

/**
 * 對應 getUserByIdController（GET /users/:id）
 * payload: {userId: string}（router 從 :id 路由參數轉換而來，見 user_routes.js）
 */
export const getUserByIdContract = {
  request: {
    userId: { required: true, type: 'string' },
  },
  response: {
    success: { user: 'object' },
    failureReasons: ['invalid_payload', 'user_not_found'],
    failureStatus: [400, 404],
  },
};

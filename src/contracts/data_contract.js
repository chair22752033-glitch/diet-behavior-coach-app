/*
 * Phase 1 TASK 1.35｜User Data API Contract
 *
 * 定義五個資源（exploration/food-events/emotions/behaviors/reports）各自
 * 的 create（POST）/list（GET）操作的 request/response 規格，對應 TASK1.15
 * 已經存在、測試過的 Domain Service（src/services/*_service.js）。
 *
 * 重要：這裡的 request schema 完全不包含 user_id 欄位——user_id 一律
 * 由 requireAuth() middleware 驗證 session 後放進 ctx.user.id，由
 * src/routes/data_routes.js 傳給 controller，payload 裡即使夾帶 user_id
 * 也會被完全忽略（domain service 的函式簽章是 (db, userId, data)，
 * userId 是獨立參數，data 裡的 user_id 欄位從來不會被讀取）。
 *
 * list 操作的 request 一律是空物件——查詢條件只有選填的 limit（透過
 * query string，由 controller 解析成數字後傳給 service，不需要在這裡
 * 定義成contract欄位，因為 validateBody() 只檢查「有列在schema裡的
 * 欄位」，limit不影響驗證結果）。
 */

export const createExplorationContract = {
  request: {
    draw_mode: { required: false, type: 'string' },
    card_category: { required: false, type: 'string' },
    card_object_key: { required: false, type: 'string' },
    card_text: { required: false, type: 'string' },
    photo_idx: { required: false, type: 'number' },
    responses_json: { required: false, type: 'string' },
    occurred_at: { required: false, type: 'string' },
  },
  response: {
    success: { id: 'number' },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'create_failed'],
    failureStatus: [401, 500],
  },
};

export const listExplorationsContract = {
  request: {},
  response: {
    success: { results: 'object' },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'query_failed'],
    failureStatus: [401, 500],
  },
};

export const createFoodEventContract = {
  request: {
    meal_type: { required: false, type: 'string' },
    description: { required: false, type: 'string' },
    nutrients_json: { required: false, type: 'string' },
    image_id: { required: false, type: 'number' },
    occurred_at: { required: false, type: 'string' },
  },
  response: {
    success: { id: 'number' },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'create_failed'],
    failureStatus: [401, 500],
  },
};

export const listFoodEventsContract = {
  request: {},
  response: {
    success: { results: 'object' },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'query_failed'],
    failureStatus: [401, 500],
  },
};

export const createEmotionContract = {
  request: {
    emotion_type: { required: false, type: 'string' },
    intensity: { required: false, type: 'number' },
    trigger_note: { required: false, type: 'string' },
    linked_food_event_id: { required: false, type: 'number' },
    occurred_at: { required: false, type: 'string' },
  },
  response: {
    success: { id: 'number' },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'create_failed'],
    failureStatus: [401, 500],
  },
};

export const listEmotionsContract = {
  request: {},
  response: {
    success: { results: 'object' },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'query_failed'],
    failureStatus: [401, 500],
  },
};

export const createBehaviorContract = {
  request: {
    pattern_type: { required: false, type: 'string' },
    summary: { required: false, type: 'string' },
    evidence_json: { required: false, type: 'string' },
    confidence_score: { required: false, type: 'number' },
    detected_at: { required: false, type: 'string' },
  },
  response: {
    success: { id: 'number' },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'create_failed'],
    failureStatus: [401, 500],
  },
};

export const listBehaviorsContract = {
  request: {},
  response: {
    success: { results: 'object' },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'query_failed'],
    failureStatus: [401, 500],
  },
};

// 本階段不串接AI（禁止AI分析生成）：report 這一組API只負責「已經產生好的
// 報告內容」存進去/取出來，content是誰、用什麼模型、怎麼生成的，完全是
// 呼叫端的事，這裡不做任何內容生成或摘要邏輯，跟 report_service.js
// （TASK1.15）的既有限制完全一致。
export const createReportContract = {
  request: {
    report_type: { required: false, type: 'string' },
    period_start: { required: false, type: 'string' },
    period_end: { required: false, type: 'string' },
    content: { required: false, type: 'string' },
    model_used: { required: false, type: 'string' },
  },
  response: {
    success: { id: 'number' },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'create_failed'],
    failureStatus: [401, 500],
  },
};

export const listReportsContract = {
  request: {},
  response: {
    success: { results: 'object' },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'query_failed'],
    failureStatus: [401, 500],
  },
};

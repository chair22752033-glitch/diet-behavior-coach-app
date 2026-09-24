/*
 * Phase 1 TASK 1.51｜Intelligence Execution Event Layer Foundation
 * - Execution Event
 *
 * 定義 Intelligence Execution Event 的穩定形狀規格——這是Execution
 * Manager（TASK1.50）生命週期狀態轉換（initialized/running/
 * completed/failed）對外可觀察的「事件」表示法，跟
 * dependencies.onStateChange(state)那個單純的字串回呼不同：事件是一個
 * 結構化物件，帶有事件類型、時間戳、執行識別碼、跟選填的payload，讓
 * 未來需要訂閱這些生命週期變化的地方（不限於Execution Manager本身）
 * 有一個共同、穩定的資料格式可以依賴。
 *
 * 事件類型（規格原文，固定四個，對應execution_state.js的四個生命週期
 * 狀態，沒有其他事件類型）：
 * - "execution_initialized" ← state "initialized"
 * - "execution_started"     ← state "running"
 * - "execution_completed"   ← state "completed"
 * - "execution_failed"      ← state "failed"
 *
 * Event 結構（規格原文）：
 * {
 *   type,
 *   timestamp,
 *   executionId,
 *   payload,
 * }
 *
 * 必填：type
 * 選填：timestamp / executionId / payload
 *
 * 明確要求：
 * - deterministic validation：同樣的輸入，任何時候呼叫都得到完全相同
 *   的驗證結果，不讀取Date.now()/Math.random()/任何外部狀態——
 *   `createExecutionEvent()`刻意不在內部產生timestamp，沒有提供時
 *   安全預設為null，不猜測、不使用目前時間
 * - no business logic：只檢查形狀跟事件類型是否合法，完全不解讀
 *   payload的業務內容
 * - no AI decision：不做任何推論、分類、摘要
 */

export const EXECUTION_EVENT_TYPES = Object.freeze([
  'execution_initialized',
  'execution_started',
  'execution_completed',
  'execution_failed',
]);

export const EventTypeContract = {
  name: 'ExecutionEvent',
  required: ['type'],
  optional: ['timestamp', 'executionId', 'payload'],
};

/**
 * @param {*} type
 * @returns {boolean}
 */
export function isValidExecutionEventType(type) {
  return EXECUTION_EVENT_TYPES.includes(type);
}

/**
 * 只驗證架構（type是否為合法的事件類型、timestamp/executionId存在時
 * 是否為字串），不驗證payload的內部業務內容——跟
 * src/intelligence/runtime/runtime_context.js同樣的「只驗證架構，不
 * 驗證細節」哲學。
 *
 * @param {*} event
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
export function validateExecutionEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { ok: false, reason: 'invalid_event' };
  }

  if (typeof event.type !== 'string' || event.type.length === 0) {
    return { ok: false, reason: 'invalid_type', field: 'type' };
  }

  if (!isValidExecutionEventType(event.type)) {
    return { ok: false, reason: 'unknown_event_type', field: 'type' };
  }

  if (event.timestamp !== undefined && event.timestamp !== null && typeof event.timestamp !== 'string') {
    return { ok: false, reason: 'invalid_field_type', field: 'timestamp' };
  }

  if (event.executionId !== undefined && event.executionId !== null && typeof event.executionId !== 'string') {
    return { ok: false, reason: 'invalid_field_type', field: 'executionId' };
  }

  return { ok: true };
}

/**
 * 把（可能不完整的）輸入套上固定預設值（`timestamp:null`,
 * `executionId:null`, `payload:null`）後組成通過驗證的Execution
 * Event。純函式，完全不讀取Date.now()/Math.random()。
 *
 * @param {object} input
 * @param {string} input.type - 必填，必須是EXECUTION_EVENT_TYPES其中之一
 * @param {string} [input.timestamp] - 選填，沒有提供時預設為null
 * @param {string} [input.executionId] - 選填，沒有提供時預設為null
 * @param {*} [input.payload] - 選填，沒有提供時預設為null，內容完全
 *   不被這裡解讀
 * @returns {{ok:true, event:{type:string, timestamp:string|null, executionId:string|null, payload:*}}|{ok:false, reason:string, field?:string}}
 */
export function createExecutionEvent(input) {
  input = input && typeof input === 'object' ? input : {};

  const event = {
    type: input.type,
    timestamp: input.timestamp !== undefined ? input.timestamp : null,
    executionId: input.executionId !== undefined ? input.executionId : null,
    payload: input.payload !== undefined ? input.payload : null,
  };

  const validation = validateExecutionEvent(event);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason, field: validation.field };
  }

  return { ok: true, event };
}

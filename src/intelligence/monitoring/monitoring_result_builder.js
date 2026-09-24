/*
 * Phase 1 TASK 1.53｜Intelligence Execution Monitoring Layer Foundation
 * - Monitoring Result Builder
 *
 * 責任：把Execution Monitor（execution_monitor.js）讀到的原始資料
 * （History Record、透過Event Dispatcher訂閱到的Execution Event列表、
 * 彙總統計）組成規格要求的兩種標準化輸出形狀。純函式，不讀取
 * Date.now()/Math.random()。這裡刻意不提供對外的驗證函式（跟
 * TASK1.51的execution_event.js、TASK1.52的execution_history.js不
 * 同）——這兩種輸出形狀完全是Monitor自己內部組裝出來的，不是外部
 * 呼叫端可以自由傳入、需要驗證的輸入形狀。
 */

/**
 * Execution Status 標準化輸出：
 *   { status, executionId, history, events, metadata }
 *
 * @param {*} input
 * @returns {{status:*, executionId:string|null, history:object|null, events:object[], metadata:object}}
 */
export function buildExecutionStatus(input) {
  input = input && typeof input === 'object' ? input : {};
  return {
    status: input.status !== undefined ? input.status : null,
    executionId: input.executionId !== undefined ? input.executionId : null,
    history: input.history !== undefined ? input.history : null,
    events: input.events !== undefined ? input.events : [],
    metadata: input.metadata !== undefined ? input.metadata : {},
  };
}

/**
 * Summary 標準化輸出：
 *   { totalExecutions, completed, failed, running }
 *
 * @param {*} input
 * @returns {{totalExecutions:number, completed:number, failed:number, running:number}}
 */
export function buildSummary(input) {
  input = input && typeof input === 'object' ? input : {};
  return {
    totalExecutions: input.totalExecutions !== undefined ? input.totalExecutions : 0,
    completed: input.completed !== undefined ? input.completed : 0,
    failed: input.failed !== undefined ? input.failed : 0,
    running: input.running !== undefined ? input.running : 0,
  };
}

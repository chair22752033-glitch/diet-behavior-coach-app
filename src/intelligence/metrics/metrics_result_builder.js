/*
 * Phase 1 TASK 1.54｜Intelligence Execution Metrics Layer Foundation
 * - Metrics Result Builder
 *
 * 責任：把Execution Metrics（execution_metrics.js）計算出來的原始
 * 統計數字組成規格要求的標準化輸出形狀。純函式，不讀取
 * Date.now()/Math.random()。這裡刻意不提供對外的驗證函式（跟
 * TASK1.51的execution_event.js、TASK1.52的execution_history.js不
 * 同）——這個輸出形狀完全是Metrics自己內部組裝出來的，不是外部
 * 呼叫端可以自由傳入、需要驗證的輸入形狀。
 *
 * 注意：這裡的標準化輸出是`{status, metrics, metadata}`（規格原文），
 * 跟TASK1.51~1.53（events/history/monitoring）用的
 * `{ok, ...}`／`{ok:false, reason}`慣例不同——這是規格明確要求的
 * 形狀，直接照規格採用，不強行套用前幾個任務的ok/reason慣例。
 */

/**
 * Metrics 標準化輸出（getMetrics()/getExecutionMetrics()共用的
 * 統計數字形狀）：
 *   { totalExecutions, initialized, running, completed, failed,
 *     averageDuration, successRate }
 *
 * @param {*} input
 * @returns {{totalExecutions:number, initialized:number, running:number, completed:number, failed:number, averageDuration:number, successRate:number}}
 */
export function buildMetrics(input) {
  input = input && typeof input === 'object' ? input : {};
  return {
    totalExecutions: input.totalExecutions !== undefined ? input.totalExecutions : 0,
    initialized: input.initialized !== undefined ? input.initialized : 0,
    running: input.running !== undefined ? input.running : 0,
    completed: input.completed !== undefined ? input.completed : 0,
    failed: input.failed !== undefined ? input.failed : 0,
    averageDuration: input.averageDuration !== undefined ? input.averageDuration : 0,
    successRate: input.successRate !== undefined ? input.successRate : 0,
  };
}

/**
 * 頂層標準化輸出：
 *   { status, metrics, metadata }
 *
 * @param {*} input
 * @returns {{status:*, metrics:object, metadata:object}}
 */
export function buildMetricsResult(input) {
  input = input && typeof input === 'object' ? input : {};
  return {
    status: input.status !== undefined ? input.status : null,
    metrics: input.metrics !== undefined ? input.metrics : buildMetrics({}),
    metadata: input.metadata !== undefined ? input.metadata : {},
  };
}

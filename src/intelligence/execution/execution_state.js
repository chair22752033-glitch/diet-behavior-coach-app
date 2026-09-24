/*
 * Phase 1 TASK 1.50｜Intelligence Execution Lifecycle Manager Foundation
 * - Execution State
 *
 * 定義 Intelligence Execution Manager 的生命週期狀態——固定四個狀態，
 * 沒有其他狀態（規格原文："No additional states"）：
 *
 * - "initialized"：execute()剛開始執行，還沒開始驗證輸入或呼叫Service
 * - "running"：驗證輸入通過後，正在呼叫Intelligence Service
 * - "completed"：Service成功回傳，Execution Manager已組好成功結果
 * - "failed"：任何一步失敗（輸入驗證失敗、Service不可用、Service
 *   回傳失敗、Service丟出例外前的狀態標記），Execution Manager已組好
 *   失敗結果
 *
 * 這是純粹的資料定義檔案，不含任何邏輯判斷、不做任何推論/分類/摘要。
 */

export const EXECUTION_STATES = Object.freeze(['initialized', 'running', 'completed', 'failed']);

/**
 * @param {*} state
 * @returns {boolean}
 */
export function isValidExecutionState(state) {
  return EXECUTION_STATES.includes(state);
}

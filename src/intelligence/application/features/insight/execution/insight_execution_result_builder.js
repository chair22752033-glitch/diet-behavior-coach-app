/*
 * Phase 3 TASK 1.69｜Insight Feature Execution Flow Foundation
 * - Insight Execution Result Builder
 *
 * 「建立 Feature execution result handling」——把Insight Execution
 * Flow（`insight_execution_flow.js`）跑完整條Request→Workflow→
 * Context Mapper→Output Mapper流程之後得到的結果，組裝成一個穩定、
 * 可預期的最終格式：
 *
 * 成功：
 * {
 *   ok: true,
 *   feature: 'insight',
 *   output: { status, context, analysis, recommendation, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   feature: 'insight',
 *   reason,
 * }
 *
 * `output`欄位的形狀固定是TASK1.68 `insight_output_model.js`定義的
 * `InsightOutputModel`形狀——這是Insight Execution Flow第一次真正
 * 端到端跑完「Request→Workflow→Context Mapping→Output Mapping」
 * 整條流程之後，唯一穩定對外呈現的格式，跟TASK1.66
 * `insight_result_mapper.js`（`data:{status, result, metadata}`，
 * `result`維持不透明pass-through）跟TASK1.67
 * `insight_context_result_builder.js`（`data:{status, context,
 * analysis, recommendation, metadata}`，攤平但沒有經過Output Model
 * 驗證）都不完全相同——這裡的`output`一定是通過
 * `validateInsightOutput()`驗證過的合法InsightOutputModel形狀。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

const FEATURE_NAME = 'insight';

/**
 * @returns {{
 *   buildSuccessResult: (output:object) => {ok:true, feature:'insight', output:object},
 *   buildFailureResult: (reason:string) => {ok:false, feature:'insight', reason:string}
 * }}
 */
export function createInsightExecutionResultBuilder() {
  /**
   * @param {object} output - `insight_output_mapper.js`的
   *   `mapToInsightOutput()`成功時回傳的`output`欄位（已通過
   *   `validateInsightOutput()`驗證的InsightOutputModel形狀），
   *   這裡只是重新包裝，不修改任何欄位的值
   * @returns {{ok:true, feature:'insight', output:object}}
   */
  function buildSuccessResult(output) {
    return {
      ok: true,
      feature: FEATURE_NAME,
      output: output && typeof output === 'object' ? output : {},
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @returns {{ok:false, feature:'insight', reason:string}}
   */
  function buildFailureResult(reason) {
    return {
      ok: false,
      feature: FEATURE_NAME,
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
  }

  return { buildSuccessResult, buildFailureResult };
}

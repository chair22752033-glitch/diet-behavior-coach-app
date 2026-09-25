/*
 * Phase 4 TASK 1.77｜Recommendation Capability Execution Foundation
 * - Recommendation Capability Result Builder
 *
 * 定義 Recommendation Capability 對外的穩定回傳格式：
 *
 * 成功：
 * {
 *   ok: true,
 *   capability: 'recommendation',
 *   result: { status, recommendations, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   capability: 'recommendation',
 *   reason,
 *   field?,
 * }
 *
 * `result`欄位刻意保留Recommendation Runner（TASK1.44
 * recommendation_result_builder.js）原本產生的{status, recommendations,
 * metadata}形狀，不重新拆開再包裝成別的欄位名稱——理由跟TASK1.76
 * analysis_capability_result_builder.js完全一樣：Recommendation
 * Capability的責任是「接收結構化recommendation request、呼叫既有
 * Recommendation Runner、回傳Recommendation Result」，Recommendation
 * Result本身就是這條鏈路最終的產出物，不需要、也不應該在這裡加工或
 * 改變它的形狀。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議文字
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

const CAPABILITY_NAME = 'recommendation';

/**
 * @returns {{
 *   buildSuccessResult: (recommendationResult:object) => {ok:true, capability:'recommendation', result:{status:string, recommendations:Array, metadata:object}},
 *   buildFailureResult: (reason:string, field?:string) => {ok:false, capability:'recommendation', reason:string, field?:string}
 * }}
 */
export function createRecommendationCapabilityResultBuilder() {
  /**
   * @param {object} recommendationResult - Recommendation Runner
   *   （TASK1.44）成功時回傳的`result`欄位
   *   （{status, recommendations, metadata}），這裡只是重新包裝，
   *   不修改任何欄位的值
   * @returns {{ok:true, capability:'recommendation', result:{status:string, recommendations:Array, metadata:object}}}
   */
  function buildSuccessResult(recommendationResult) {
    return {
      ok: true,
      capability: CAPABILITY_NAME,
      result: recommendationResult && typeof recommendationResult === 'object' ? recommendationResult : {},
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @param {string} [field] - 選填，指出是哪個欄位造成的失敗
   *   （轉發自Recommendation Runner內部validateAnalysisResult()的
   *   field）
   * @returns {{ok:false, capability:'recommendation', reason:string, field?:string}}
   */
  function buildFailureResult(reason, field) {
    const failure = {
      ok: false,
      capability: CAPABILITY_NAME,
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
    if (typeof field === 'string' && field.length > 0) {
      failure.field = field;
    }
    return failure;
  }

  return { buildSuccessResult, buildFailureResult };
}

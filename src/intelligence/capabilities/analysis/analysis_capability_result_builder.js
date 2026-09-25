/*
 * Phase 4 TASK 1.76｜Analysis Capability Execution Foundation
 * - Analysis Capability Result Builder
 *
 * 定義 Analysis Capability 對外的穩定回傳格式：
 *
 * 成功：
 * {
 *   ok: true,
 *   capability: 'analysis',
 *   result: { status, insights, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   capability: 'analysis',
 *   reason,
 *   field?,
 * }
 *
 * `result`欄位刻意保留Analysis Runner（TASK1.43
 * analysis_result_builder.js）原本產生的{status, insights,
 * metadata}形狀，不重新拆開再包裝成別的欄位名稱——因為Analysis
 * Capability的責任是「接收結構化analysis request、呼叫既有
 * Analysis Runner、回傳Analysis Result」，Analysis Result本身
 * 就是這條鏈路最終的產出物，不需要、也不應該在這裡加工或改變
 * 它的形狀（跟TASK1.66 insight_result_mapper.js刻意把Workflow
 * 回傳的data重新拆開組裝不同——那裡的下一層是Workflow，這裡的
 * 下一層直接就是Analysis Runner，兩者是不同的架構位置）。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

const CAPABILITY_NAME = 'analysis';

/**
 * @returns {{
 *   buildSuccessResult: (analysisResult:object) => {ok:true, capability:'analysis', result:{status:string, insights:Array, metadata:object}},
 *   buildFailureResult: (reason:string, field?:string) => {ok:false, capability:'analysis', reason:string, field?:string}
 * }}
 */
export function createAnalysisCapabilityResultBuilder() {
  /**
   * @param {object} analysisResult - Analysis Runner（TASK1.43）
   *   成功時回傳的`result`欄位（{status, insights, metadata}），
   *   這裡只是重新包裝，不修改任何欄位的值
   * @returns {{ok:true, capability:'analysis', result:{status:string, insights:Array, metadata:object}}}
   */
  function buildSuccessResult(analysisResult) {
    return {
      ok: true,
      capability: CAPABILITY_NAME,
      result: analysisResult && typeof analysisResult === 'object' ? analysisResult : {},
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @param {string} [field] - 選填，指出是哪個欄位造成的失敗
   *   （轉發自Analysis Runner/validateInsightContext()的field）
   * @returns {{ok:false, capability:'analysis', reason:string, field?:string}}
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

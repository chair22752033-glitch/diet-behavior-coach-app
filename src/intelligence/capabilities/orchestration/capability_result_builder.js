/*
 * Phase 4 TASK 1.78｜Intelligence Capability Orchestration Foundation
 * - Capability Orchestrator Result Builder
 *
 * 定義 Capability Orchestrator 對外的穩定回傳格式：
 *
 * 成功：
 * {
 *   ok: true,
 *   capability: 'orchestration',
 *   result: {
 *     analysis: { status, insights, metadata },
 *     recommendation: { status, recommendations, metadata },
 *   },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   capability: 'orchestration',
 *   reason,
 *   field?,
 *   stage?,
 * }
 *
 * `result`欄位刻意用`{analysis, recommendation}`這種nested形狀分別
 * 保留Analysis Capability（TASK1.76）跟Recommendation
 * Capability（TASK1.77）各自原本產生的Result，不重新拆開、合併、
 * 或改寫成新的欄位名稱——理由跟TASK1.76/1.77的result builder同一種
 * 哲學：Orchestrator的責任是「接收intelligence capability
 * request、呼叫Analysis Capability、把Analysis Result傳遞給
 * Recommendation Capability、回傳Unified Capability Result」，
 * Unified Capability Result就是這兩段既有Result的組合，不需要、也
 * 不應該在這裡發明新的合併語意（例如把insights跟recommendations
 * 硬併成同一個陣列，或是猜測要用哪一段的status/metadata當作
 * 「唯一」的status/metadata）。
 *
 * `stage`欄位（'analysis'|'recommendation'）是Orchestrator新增的
 * 失敗定位資訊，指出Unified Flow在哪一段失敗——這是Orchestrator
 * 這一層才需要的資訊（Analysis Capability/Recommendation
 * Capability各自本來就不需要知道自己是「哪一段」），刻意設計成跟
 * `field`一樣的選填欄位，不影響既有的{ok,capability,reason,field?}
 * 失敗形狀相容性。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議文字
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

const CAPABILITY_NAME = 'orchestration';

/**
 * @returns {{
 *   buildSuccessResult: (analysisResult:object, recommendationResult:object) => {ok:true, capability:'orchestration', result:{analysis:object, recommendation:object}},
 *   buildFailureResult: (reason:string, field?:string, stage?:string) => {ok:false, capability:'orchestration', reason:string, field?:string, stage?:string}
 * }}
 */
export function createCapabilityOrchestratorResultBuilder() {
  /**
   * @param {object} analysisResult - Analysis Capability（TASK1.76）
   *   requestAnalysis()成功時回傳的`result`欄位
   *   （{status, insights, metadata}），這裡只是重新包裝，不修改
   *   任何欄位的值
   * @param {object} recommendationResult - Recommendation
   *   Capability（TASK1.77）requestRecommendation()成功時回傳的
   *   `result`欄位（{status, recommendations, metadata}），同樣
   *   原樣保留
   * @returns {{ok:true, capability:'orchestration', result:{analysis:object, recommendation:object}}}
   */
  function buildSuccessResult(analysisResult, recommendationResult) {
    return {
      ok: true,
      capability: CAPABILITY_NAME,
      result: {
        analysis: analysisResult && typeof analysisResult === 'object' ? analysisResult : {},
        recommendation: recommendationResult && typeof recommendationResult === 'object' ? recommendationResult : {},
      },
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @param {string} [field] - 選填，轉發自Analysis Capability/
   *   Recommendation Capability的field
   * @param {string} [stage] - 選填，指出Unified Flow在哪一段失敗
   *   （'analysis'|'recommendation'），驗證階段本身失敗時不提供
   *   （代表request形狀本身就不合法，尚未進入任何一段Capability）
   * @returns {{ok:false, capability:'orchestration', reason:string, field?:string, stage?:string}}
   */
  function buildFailureResult(reason, field, stage) {
    const failure = {
      ok: false,
      capability: CAPABILITY_NAME,
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
    if (typeof field === 'string' && field.length > 0) {
      failure.field = field;
    }
    if (typeof stage === 'string' && stage.length > 0) {
      failure.stage = stage;
    }
    return failure;
  }

  return { buildSuccessResult, buildFailureResult };
}

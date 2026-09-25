/*
 * Phase 4 TASK 1.79｜Feature Intelligence Capability Integration
 * Foundation
 * - Intelligence Feature Result Mapper
 *
 * 「將 Unified Capability Result 轉換為 Feature Output」——跟
 * `../feature_result_builder.js`（TASK1.65泛用Feature Entry骨架自己
 * 的result builder）不同，這個檔案不是給任何Feature共用的泛用result
 * builder，這裡是**專屬於這個Feature Integration Layer**的result
 * mapper：固定回傳`feature: 'intelligence'`，不接受參數決定domain
 * 名稱——形狀比照`../behavior/behavior_result_mapper.js`
 * （TASK1.72），但因為上游是Capability Orchestrator（TASK1.78）
 * 回傳的nested`{analysis, recommendation}`結構（不是Workflow回傳的
 * `{status, result, metadata}`），這裡的`data`欄位形狀也對應調整成
 * `{analysis, recommendation}`，原樣保留兩段Capability Result，不
 * 重新拆開合併。
 *
 * 成功：
 * {
 *   ok: true,
 *   feature: 'intelligence',
 *   data: { analysis, recommendation },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   feature: 'intelligence',
 *   reason,
 *   field?,
 *   stage?,
 * }
 *
 * `field`/`stage`欄位原樣轉發自Capability Orchestrator失敗時回傳的
 * 同名欄位（`stage`指出Unified Flow在'analysis'|'recommendation'
 * 哪一段失敗），跟`capabilities/orchestration/capability_result_
 * builder.js`（TASK1.78）的失敗形狀完全對應。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

const INTELLIGENCE_DOMAIN = 'intelligence';

/**
 * @returns {{
 *   mapSuccessResult: (capabilityResult:object) => {ok:true, feature:'intelligence', data:{analysis:object, recommendation:object}},
 *   mapFailureResult: (reason:string, field?:string, stage?:string) => {ok:false, feature:'intelligence', reason:string, field?:string, stage?:string}
 * }}
 */
export function createIntelligenceFeatureResultMapper() {
  /**
   * @param {object} capabilityResult - Capability
   *   Orchestrator（TASK1.78）requestCapabilityFlow()成功時回傳的
   *   `result`欄位（{analysis, recommendation}），這裡只是重新
   *   包裝，不修改任何欄位的值
   * @returns {{ok:true, feature:'intelligence', data:{analysis:object, recommendation:object}}}
   */
  function mapSuccessResult(capabilityResult) {
    capabilityResult = capabilityResult && typeof capabilityResult === 'object' ? capabilityResult : {};
    const { analysis, recommendation } = capabilityResult;
    return {
      ok: true,
      feature: INTELLIGENCE_DOMAIN,
      data: {
        analysis: analysis && typeof analysis === 'object' ? analysis : {},
        recommendation: recommendation && typeof recommendation === 'object' ? recommendation : {},
      },
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @param {string} [field] - 選填，轉發自Capability Orchestrator/
   *   Analysis Capability/Recommendation Capability的field
   * @param {string} [stage] - 選填，轉發自Capability
   *   Orchestrator的stage（'analysis'|'recommendation'）
   * @returns {{ok:false, feature:'intelligence', reason:string, field?:string, stage?:string}}
   */
  function mapFailureResult(reason, field, stage) {
    const failure = {
      ok: false,
      feature: INTELLIGENCE_DOMAIN,
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

  return { mapSuccessResult, mapFailureResult };
}

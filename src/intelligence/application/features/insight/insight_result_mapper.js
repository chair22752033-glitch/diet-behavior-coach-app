/*
 * Phase 3 TASK 1.66｜Insight Feature Capability Implementation
 * Foundation
 * - Insight Result Mapper
 *
 * 「統一 Insight Feature output」——跟TASK1.65
 * feature_result_builder.js不同，這個檔案不是給未來任何Feature
 * 共用的泛用result builder（那個檔案接受`feature`參數，可以給任何
 * Feature使用），這裡是**專屬於Insight這一個domain**的result
 * mapper：固定回傳`feature: 'insight'`，不接受參數決定domain名稱
 * ——因為這個檔案存在的目的就是「Insight Feature Capability的輸出
 * 格式」，不是「任何Feature共用的通用格式」。
 *
 * 成功：
 * {
 *   ok: true,
 *   feature: 'insight',
 *   data: { status, result, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   feature: 'insight',
 *   reason,
 * }
 *
 * 這個形狀刻意跟TASK1.65 Feature Layer的回傳形狀
 * `{ok:true, feature, data:{status, result, metadata}}`一致（只是
 * `feature`固定為`'insight'`字面值），確保「Feature Entry可以承載
 * 正式Insight Domain」這件事不會意外改變對外可見的資料格式——把
 * Workflow回傳的`data`重新拆開、再用自己獨立的`mapSuccessResult()`
 * 組回去，而不是原封不動地把Workflow的回傳值直接往外傳，跟
 * TASK1.65 feature_result_builder.js同樣的邊界決策。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

const INSIGHT_DOMAIN = 'insight';

/**
 * @returns {{
 *   mapSuccessResult: (workflowData:object) => {ok:true, feature:'insight', data:{status:*, result:*, metadata:*}},
 *   mapFailureResult: (reason:string) => {ok:false, feature:'insight', reason:string}
 * }}
 */
export function createInsightResultMapper() {
  /**
   * @param {object} workflowData - Workflow Layer（TASK1.64）成功時
   *   回傳的`data`欄位（{status, result, metadata}），這裡只是重新
   *   包裝，不修改任何欄位的值
   * @returns {{ok:true, feature:'insight', data:{status:*, result:*, metadata:*}}}
   */
  function mapSuccessResult(workflowData) {
    workflowData = workflowData && typeof workflowData === 'object' ? workflowData : {};
    const { status, result, metadata } = workflowData;
    return {
      ok: true,
      feature: INSIGHT_DOMAIN,
      data: { status, result, metadata },
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @returns {{ok:false, feature:'insight', reason:string}}
   */
  function mapFailureResult(reason) {
    return {
      ok: false,
      feature: INSIGHT_DOMAIN,
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
  }

  return { mapSuccessResult, mapFailureResult };
}

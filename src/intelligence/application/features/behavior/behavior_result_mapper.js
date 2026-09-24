/*
 * Phase 3 TASK 1.72｜Behavior Feature Foundation
 * - Behavior Result Mapper
 *
 * 「統一 Behavior Feature output」——跟`../feature_result_builder.js`
 * 不同，這個檔案不是給任何Feature共用的泛用result builder（那個
 * 檔案接受`feature`參數），這裡是**專屬於Behavior這一個domain**
 * 的result mapper：固定回傳`feature: 'behavior'`，不接受參數決定
 * domain名稱——完全比照`../insight/insight_result_mapper.js`
 * （TASK1.66）的形狀，只是domain名稱換成`'behavior'`。
 *
 * 成功：
 * {
 *   ok: true,
 *   feature: 'behavior',
 *   data: { status, result, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   feature: 'behavior',
 *   reason,
 * }
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

const BEHAVIOR_DOMAIN = 'behavior';

/**
 * @returns {{
 *   mapSuccessResult: (workflowData:object) => {ok:true, feature:'behavior', data:{status:*, result:*, metadata:*}},
 *   mapFailureResult: (reason:string) => {ok:false, feature:'behavior', reason:string}
 * }}
 */
export function createBehaviorResultMapper() {
  /**
   * @param {object} workflowData - Workflow Layer（TASK1.64）成功時
   *   回傳的`data`欄位（{status, result, metadata}），這裡只是重新
   *   包裝，不修改任何欄位的值
   * @returns {{ok:true, feature:'behavior', data:{status:*, result:*, metadata:*}}}
   */
  function mapSuccessResult(workflowData) {
    workflowData = workflowData && typeof workflowData === 'object' ? workflowData : {};
    const { status, result, metadata } = workflowData;
    return {
      ok: true,
      feature: BEHAVIOR_DOMAIN,
      data: { status, result, metadata },
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @returns {{ok:false, feature:'behavior', reason:string}}
   */
  function mapFailureResult(reason) {
    return {
      ok: false,
      feature: BEHAVIOR_DOMAIN,
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
  }

  return { mapSuccessResult, mapFailureResult };
}

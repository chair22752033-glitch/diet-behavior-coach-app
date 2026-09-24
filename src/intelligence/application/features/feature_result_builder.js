/*
 * Phase 3 TASK 1.65｜Intelligence Application Feature Entry
 * Foundation
 * - Feature Result Builder
 *
 * 定義 Intelligence Application Feature Entry Layer 對外的穩定
 * 回傳格式：
 *
 * 成功：
 * {
 *   ok: true,
 *   feature,
 *   data: { status, result, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   feature,
 *   reason,
 * }
 *
 * 這個形狀刻意跟 Workflow Layer（TASK1.64）的回傳形狀
 * `{ok:true, workflow, data:{status, result, metadata}}`看起來一樣，
 * 只是把`workflow`欄位換成`feature`欄位標明是哪一個Feature——這是
 * 刻意的邊界決策，不是偷懶：Feature Layer把Workflow回傳的`data`
 * 重新拆開、再用自己獨立的`buildSuccessResult()`組回去，而不是原封
 * 不動地把Workflow的回傳值直接往外傳。這樣未來如果Workflow Layer的
 * 回傳形狀演進，只要Feature Layer內部知道怎麼轉換，這裡定義的
 * Feature Result形狀就可以保持不變——跟TASK1.64
 * workflow_result_builder.js「把Capability的回傳值重新包裝、不是
 * 直接轉傳」是同一個邏輯，只是往上再疊一層。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

/**
 * @returns {{
 *   buildSuccessResult: (feature:string, workflowData:object) => {ok:true, feature:string, data:{status:*, result:*, metadata:*}},
 *   buildFailureResult: (feature:string, reason:string) => {ok:false, feature:string, reason:string}
 * }}
 */
export function createFeatureResultBuilder() {
  /**
   * @param {string} feature - 這次呼叫所屬的Feature名稱（例如
   *   'insight'），一律由呼叫端明確傳入；不是字串時安全正規化為
   *   'unknown_feature'，不猜測、不拋出例外
   * @param {object} workflowData - Workflow Layer（TASK1.64）成功時
   *   回傳的`data`欄位（{status, result, metadata}），這裡只是重新
   *   包裝，不修改任何欄位的值
   * @returns {{ok:true, feature:string, data:{status:*, result:*, metadata:*}}}
   */
  function buildSuccessResult(feature, workflowData) {
    workflowData = workflowData && typeof workflowData === 'object' ? workflowData : {};
    const { status, result, metadata } = workflowData;
    return {
      ok: true,
      feature: typeof feature === 'string' && feature.length > 0 ? feature : 'unknown_feature',
      data: { status, result, metadata },
    };
  }

  /**
   * @param {string} feature - 這次呼叫所屬的Feature名稱
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @returns {{ok:false, feature:string, reason:string}}
   */
  function buildFailureResult(feature, reason) {
    return {
      ok: false,
      feature: typeof feature === 'string' && feature.length > 0 ? feature : 'unknown_feature',
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
  }

  return { buildSuccessResult, buildFailureResult };
}

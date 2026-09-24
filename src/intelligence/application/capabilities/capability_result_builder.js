/*
 * Phase 3 TASK 1.62｜Intelligence Application Capability Layer
 * Foundation
 * - Capability Result Builder
 *
 * 定義 Intelligence Application Capability Layer 對外的穩定回傳
 * 格式：
 *
 * 成功：
 * {
 *   ok: true,
 *   capability,
 *   data: { status, result, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   capability,
 *   reason,
 * }
 *
 * 這個形狀刻意跟 Use Case Layer（TASK1.61）的回傳形狀
 * `{ok:true, useCase, data:{status, result, metadata}}` 看起來一樣，
 * 只是把`useCase`欄位換成`capability`欄位標明這是哪一個Intelligence
 * Application能力分類——這是刻意的邊界決策，不是偷懶：Capability
 * Layer把Use Case回傳的`data`重新拆開、再用自己獨立的
 * `buildSuccessResult()`組回去，而不是原封不動地把Use Case的回傳值
 * 直接往外傳。這樣未來如果Use Case Layer的回傳形狀演進，只要
 * Capability Layer內部知道怎麼轉換，這裡定義的Capability Result
 * 形狀就可以保持不變——跟TASK1.61 use_case_result_builder.js「把
 * Application Service的回傳值重新包裝、不是直接轉傳」是同一個
 * 邏輯，只是往上再疊一層。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

/**
 * @returns {{
 *   buildSuccessResult: (capability:string, useCaseData:object) => {ok:true, capability:string, data:{status:*, result:*, metadata:*}},
 *   buildFailureResult: (capability:string, reason:string) => {ok:false, capability:string, reason:string}
 * }}
 */
export function createCapabilityResultBuilder() {
  /**
   * @param {string} capability - 這次呼叫所屬的Intelligence
   *   Application能力分類名稱（例如 'insight'），一律由呼叫端明確
   *   傳入；不是字串時安全正規化為 'unknown_capability'，不猜測、
   *   不拋出例外
   * @param {object} useCaseData - Use Case Layer（TASK1.61）成功時
   *   回傳的`data`欄位（{status, result, metadata}），這裡只是重新
   *   包裝，不修改任何欄位的值
   * @returns {{ok:true, capability:string, data:{status:*, result:*, metadata:*}}}
   */
  function buildSuccessResult(capability, useCaseData) {
    useCaseData = useCaseData && typeof useCaseData === 'object' ? useCaseData : {};
    const { status, result, metadata } = useCaseData;
    return {
      ok: true,
      capability: typeof capability === 'string' && capability.length > 0 ? capability : 'unknown_capability',
      data: { status, result, metadata },
    };
  }

  /**
   * @param {string} capability - 這次呼叫所屬的Intelligence
   *   Application能力分類名稱
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @returns {{ok:false, capability:string, reason:string}}
   */
  function buildFailureResult(capability, reason) {
    return {
      ok: false,
      capability: typeof capability === 'string' && capability.length > 0 ? capability : 'unknown_capability',
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
  }

  return { buildSuccessResult, buildFailureResult };
}

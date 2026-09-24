/*
 * Phase 3 TASK 1.64｜Intelligence Application Workflow Layer
 * Foundation
 * - Workflow Result Builder
 *
 * 定義 Intelligence Application Workflow Layer 對外的穩定回傳
 * 格式：
 *
 * 成功：
 * {
 *   ok: true,
 *   workflow,
 *   data: { status, result, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   workflow,
 *   reason,
 * }
 *
 * 這個形狀刻意跟 Capability Layer（TASK1.62）/Use Case Layer
 * （TASK1.61）的回傳形狀`{ok:true, capability|useCase, data:{status,
 * result, metadata}}`看起來一樣，只是把`capability`/`useCase`欄位
 * 換成`workflow`欄位標明是哪一個Workflow——這是刻意的邊界決策，不是
 * 偷懶：Workflow Layer把Capability回傳的`data`重新拆開、再用自己
 * 獨立的`buildSuccessResult()`組回去，而不是原封不動地把Capability
 * 的回傳值直接往外傳。這樣未來如果Capability Layer的回傳形狀演進，
 * 只要Workflow Layer內部知道怎麼轉換，這裡定義的Workflow Result
 * 形狀就可以保持不變——跟TASK1.62 capability_result_builder.js
 * 「把Use Case的回傳值重新包裝、不是直接轉傳」是同一個邏輯，只是
 * 往上再疊一層。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

/**
 * @returns {{
 *   buildSuccessResult: (workflow:string, capabilityData:object) => {ok:true, workflow:string, data:{status:*, result:*, metadata:*}},
 *   buildFailureResult: (workflow:string, reason:string) => {ok:false, workflow:string, reason:string}
 * }}
 */
export function createWorkflowResultBuilder() {
  /**
   * @param {string} workflow - 這次呼叫所屬的Workflow名稱（例如
   *   'application_request'），一律由呼叫端明確傳入；不是字串時
   *   安全正規化為 'unknown_workflow'，不猜測、不拋出例外
   * @param {object} capabilityData - Capability Layer（TASK1.62）
   *   成功時回傳的`data`欄位（{status, result, metadata}），這裡
   *   只是重新包裝，不修改任何欄位的值
   * @returns {{ok:true, workflow:string, data:{status:*, result:*, metadata:*}}}
   */
  function buildSuccessResult(workflow, capabilityData) {
    capabilityData = capabilityData && typeof capabilityData === 'object' ? capabilityData : {};
    const { status, result, metadata } = capabilityData;
    return {
      ok: true,
      workflow: typeof workflow === 'string' && workflow.length > 0 ? workflow : 'unknown_workflow',
      data: { status, result, metadata },
    };
  }

  /**
   * @param {string} workflow - 這次呼叫所屬的Workflow名稱
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @returns {{ok:false, workflow:string, reason:string}}
   */
  function buildFailureResult(workflow, reason) {
    return {
      ok: false,
      workflow: typeof workflow === 'string' && workflow.length > 0 ? workflow : 'unknown_workflow',
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
  }

  return { buildSuccessResult, buildFailureResult };
}

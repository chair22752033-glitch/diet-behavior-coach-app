/*
 * Phase 3 TASK 1.60｜Intelligence Application Service Boundary
 * Foundation
 * - Application Result Builder
 *
 * 定義 Intelligence Application Service 對外的穩定回傳格式：
 *
 * 成功：
 * {
 *   ok: true,
 *   data: { status, result, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   reason,
 * }
 *
 * 這個形狀刻意跟 Intelligence Facade（TASK1.48）的回傳形狀
 * `{ok:true, data:{status, result, metadata}}`看起來一樣——這是
 * 刻意的邊界決策，不是偷懶：Application Service把Facade回傳的
 * `data`重新拆開、再用自己獨立的`buildSuccessResult()`組回去，而
 * 不是原封不動地把Facade的回傳值直接往外傳。這樣未來如果Facade的
 * 回傳形狀演進，只要Application Service內部知道怎麼轉換，這裡定義
 * 的Application Result形狀就可以保持不變——跟TASK1.48
 * facade_result_builder.js「把Service的回傳值重新包裝、不是直接
 * 轉傳」是同一個邏輯，只是往上再疊一層。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

/**
 * @returns {{
 *   buildSuccessResult: (facadeData:object) => {ok:true, data:{status:*, result:*, metadata:*}},
 *   buildFailureResult: (reason:string) => {ok:false, reason:string}
 * }}
 */
export function createApplicationResultBuilder() {
  /**
   * @param {object} facadeData - Intelligence Facade（TASK1.48）成功時
   *   回傳的`data`欄位（{status, result, metadata}），這裡只是重新
   *   包裝，不修改任何欄位的值
   * @returns {{ok:true, data:{status:*, result:*, metadata:*}}}
   */
  function buildSuccessResult(facadeData) {
    facadeData = facadeData && typeof facadeData === 'object' ? facadeData : {};
    const { status, result, metadata } = facadeData;
    return {
      ok: true,
      data: { status, result, metadata },
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @returns {{ok:false, reason:string}}
   */
  function buildFailureResult(reason) {
    return { ok: false, reason: typeof reason === 'string' ? reason : 'unknown_error' };
  }

  return { buildSuccessResult, buildFailureResult };
}

/*
 * Phase 3 TASK 1.61｜Intelligence Application Use Case Layer
 * Foundation
 * - Use Case Result Builder
 *
 * 定義 Intelligence Application Use Case Layer 對外的穩定回傳格式：
 *
 * 成功：
 * {
 *   ok: true,
 *   useCase,
 *   data: { status, result, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   useCase,
 *   reason,
 * }
 *
 * 這個形狀刻意跟 Application Service（TASK1.60）的回傳形狀
 * `{ok:true, data:{status, result, metadata}}` 看起來一樣，只是多了
 * 一個`useCase`欄位標明這是哪一個Application Scenario——這是刻意的
 * 邊界決策，不是偷懶：Use Case Layer把Application Service回傳的
 * `data`重新拆開、再用自己獨立的`buildSuccessResult()`組回去，而不是
 * 原封不動地把Application Service的回傳值直接往外傳。這樣未來如果
 * Application Service的回傳形狀演進，只要Use Case Layer內部知道怎麼
 * 轉換，這裡定義的Use Case Result形狀就可以保持不變——跟TASK1.60
 * application_result_builder.js「把Facade的回傳值重新包裝、不是直接
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
 *   buildSuccessResult: (useCase:string, applicationData:object) => {ok:true, useCase:string, data:{status:*, result:*, metadata:*}},
 *   buildFailureResult: (useCase:string, reason:string) => {ok:false, useCase:string, reason:string}
 * }}
 */
export function createUseCaseResultBuilder() {
  /**
   * @param {string} useCase - 這次呼叫所屬的Application Scenario名稱
   *   （例如 'insight'），一律由呼叫端明確傳入；不是字串時安全正規化
   *   為 'unknown_use_case'，不猜測、不拋出例外
   * @param {object} applicationData - Application Service（TASK1.60）
   *   成功時回傳的`data`欄位（{status, result, metadata}），這裡只是
   *   重新包裝，不修改任何欄位的值
   * @returns {{ok:true, useCase:string, data:{status:*, result:*, metadata:*}}}
   */
  function buildSuccessResult(useCase, applicationData) {
    applicationData = applicationData && typeof applicationData === 'object' ? applicationData : {};
    const { status, result, metadata } = applicationData;
    return {
      ok: true,
      useCase: typeof useCase === 'string' && useCase.length > 0 ? useCase : 'unknown_use_case',
      data: { status, result, metadata },
    };
  }

  /**
   * @param {string} useCase - 這次呼叫所屬的Application Scenario名稱
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @returns {{ok:false, useCase:string, reason:string}}
   */
  function buildFailureResult(useCase, reason) {
    return {
      ok: false,
      useCase: typeof useCase === 'string' && useCase.length > 0 ? useCase : 'unknown_use_case',
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
  }

  return { buildSuccessResult, buildFailureResult };
}

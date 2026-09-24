/*
 * Phase 1 TASK 1.48｜Intelligence Application Facade Layer Foundation
 * - Facade Result Builder
 *
 * 定義 Intelligence Facade 對外的穩定回傳格式（規格原文範例）：
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
 * 這一層的形狀刻意跟 Intelligence Service（TASK1.46）的回傳形狀
 * `{ok:true, data:{status, context, analysis, recommendation, metadata}}`
 * 不完全相同——Facade把`context`/`analysis`/`recommendation`三個欄位
 * 收斂包成單一`result`物件，`metadata`保留在`data`頂層。這是純粹的
 * 「重新包裝／改變資料的排列方式」，不是重新解讀內容：`result.context`/
 * `result.analysis`/`result.recommendation`跟Service回傳的內容完全
 * 相同，只是換一種巢狀方式呈現，讓Facade成為一個獨立、穩定的對外形狀
 * ——即使未來Service的回傳形狀演進，只要Facade內部知道怎麼轉換，這裡
 * 定義的Facade Result形狀就可以保持不變。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

/**
 * @returns {{
 *   buildSuccessResult: (serviceData:object) => {ok:true, data:{status:*, result:object, metadata:*}},
 *   buildFailureResult: (reason:string) => {ok:false, reason:string}
 * }}
 */
export function createFacadeResultBuilder() {
  /**
   * @param {object} serviceData - Intelligence Service（TASK1.46）成功時
   *   回傳的`data`欄位（{status, context, analysis, recommendation,
   *   metadata}），這裡只是重新排列，不修改任何欄位的值
   * @returns {{ok:true, data:{status:*, result:{context:*, analysis:*, recommendation:*}, metadata:*}}}
   */
  function buildSuccessResult(serviceData) {
    serviceData = serviceData && typeof serviceData === 'object' ? serviceData : {};
    const { status, context, analysis, recommendation, metadata } = serviceData;
    return {
      ok: true,
      data: {
        status,
        result: { context, analysis, recommendation },
        metadata,
      },
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

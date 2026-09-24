/*
 * Phase 3 TASK 1.67｜Insight Feature Context Integration Foundation
 * - Insight Context Result Builder
 *
 * 「統一 Insight Feature output mapping」——把
 * `insight_context_mapper.js`攤平出來的Insight Domain視圖
 * （{status, context, analysis, recommendation, metadata}）組裝成
 * 一個穩定、可預期的最終輸出格式：
 *
 * 成功：
 * {
 *   ok: true,
 *   feature: 'insight',
 *   data: { status, context, analysis, recommendation, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   feature: 'insight',
 *   reason,
 * }
 *
 * 這個形狀刻意跟TASK1.66 insight_result_mapper.js的
 * `{ok:true, feature:'insight', data:{status, result, metadata}}`
 * 不完全相同——這裡的`data`直接攤平`context`/`analysis`/
 * `recommendation`三個欄位（不再包在`result`裡面），這是Insight
 * Domain專屬的、跟Runtime內部怎麼收斂資料無關的最終輸出格式，
 * 「保持Domain與Runtime Context解耦」的具體落地：即使未來Runtime
 * 決定把三者收斂進不同名稱的容器，只要`insight_context_mapper.js`
 * 知道怎麼轉換，這裡定義的Insight Domain輸出格式就可以保持不變。
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
 *   buildSuccessResult: (insightDomainView:object) => {ok:true, feature:'insight', data:{status:*, context:*, analysis:*, recommendation:*, metadata:*}},
 *   buildFailureResult: (reason:string) => {ok:false, feature:'insight', reason:string}
 * }}
 */
export function createInsightContextResultBuilder() {
  /**
   * @param {object} insightDomainView - `insight_context_mapper.js`
   *   的`mapRuntimeContextToInsightDomain()`回傳的Insight Domain
   *   視圖（{status, context, analysis, recommendation, metadata}），
   *   這裡只是重新包裝，不修改任何欄位的值
   * @returns {{ok:true, feature:'insight', data:{status:*, context:*, analysis:*, recommendation:*, metadata:*}}}
   */
  function buildSuccessResult(insightDomainView) {
    insightDomainView = insightDomainView && typeof insightDomainView === 'object' ? insightDomainView : {};
    const { status, context, analysis, recommendation, metadata } = insightDomainView;
    return {
      ok: true,
      feature: INSIGHT_DOMAIN,
      data: { status, context, analysis, recommendation, metadata },
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @returns {{ok:false, feature:'insight', reason:string}}
   */
  function buildFailureResult(reason) {
    return {
      ok: false,
      feature: INSIGHT_DOMAIN,
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
  }

  return { buildSuccessResult, buildFailureResult };
}

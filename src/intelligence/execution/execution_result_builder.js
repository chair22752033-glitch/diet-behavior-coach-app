/*
 * Phase 1 TASK 1.50｜Intelligence Execution Lifecycle Manager Foundation
 * - Execution Result Builder
 *
 * 定義 Intelligence Execution Manager 對外的穩定回傳格式（規格原文
 * 範例）：
 *
 * 成功：
 * {
 *   ok: true,
 *   state: "completed",
 *   data: { status, result },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   state: "failed",
 *   reason,
 * }
 *
 * `data.status`原樣等於Service回傳的status（規格範例是
 * "intelligence_ready"）；`data.result`把Service回傳裡除了status以外
 * 的其餘欄位（context/analysis/recommendation/metadata）收斂包成
 * 單一物件——這是純粹的「重新包裝／改變資料的排列方式」，不是重新
 * 解讀內容，跟Facade（TASK1.48）當初把三個欄位收斂進result同樣的
 * 手法，只是這裡連metadata也一併收進result，因為規格範例的data只有
 * status跟result兩個欄位，沒有另外保留頂層metadata。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

/**
 * @returns {{
 *   buildCompletedResult: (serviceData:object) => {ok:true, state:"completed", data:{status:*, result:object}},
 *   buildFailedResult: (reason:string) => {ok:false, state:"failed", reason:string}
 * }}
 */
export function createExecutionResultBuilder() {
  /**
   * @param {object} serviceData - Intelligence Service（TASK1.46）成功時
   *   回傳的`data`欄位（{status, context, analysis, recommendation,
   *   metadata}），這裡只是重新排列，不修改任何欄位的值
   * @returns {{ok:true, state:"completed", data:{status:*, result:{context:*, analysis:*, recommendation:*, metadata:*}}}}
   */
  function buildCompletedResult(serviceData) {
    serviceData = serviceData && typeof serviceData === 'object' ? serviceData : {};
    const { status, context, analysis, recommendation, metadata } = serviceData;
    return {
      ok: true,
      state: 'completed',
      data: {
        status,
        result: { context, analysis, recommendation, metadata },
      },
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @returns {{ok:false, state:"failed", reason:string}}
   */
  function buildFailedResult(reason) {
    return { ok: false, state: 'failed', reason: typeof reason === 'string' ? reason : 'unknown_error' };
  }

  return { buildCompletedResult, buildFailedResult };
}

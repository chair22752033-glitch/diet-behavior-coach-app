/*
 * Phase 1 TASK 1.46｜Intelligence Application Service Layer Foundation
 * - Service Result Builder
 *
 * 定義 Intelligence Application Service 對外的穩定回傳格式（規格原文
 * 範例）：
 *
 * 成功：
 * {
 *   ok: true,
 *   data: { status, context, analysis, recommendation, metadata },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   reason,
 * }
 *
 * 明確要求：
 * - 只是把 Intelligence Orchestrator（TASK1.45）已經算好的 Unified
 *   Intelligence Result 原樣包成 `{ok:true, data}`，不重新解讀、不
 *   摘要、不轉換其內容
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

/**
 * @returns {{
 *   buildSuccessResult: (result:object) => {ok:true, data:object},
 *   buildFailureResult: (reason:string) => {ok:false, reason:string}
 * }}
 */
export function createServiceResultBuilder() {
  /**
   * @param {object} result - Intelligence Orchestrator（TASK1.45）成功時
   *   回傳的 Unified Intelligence Result（{status, context, analysis,
   *   recommendation, metadata}），這裡原樣包裝，不做任何轉換
   * @returns {{ok:true, data:object}}
   */
  function buildSuccessResult(result) {
    return { ok: true, data: result };
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

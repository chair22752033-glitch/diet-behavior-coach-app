/*
 * Phase 4 TASK 1.83｜Decision Capability Foundation
 * - Decision Result Builder
 *
 * 跟`analysis_capability_result_builder.js`（TASK1.76）/
 * `recommendation_capability_result_builder.js`（TASK1.77）不同的
 * 地方：Analysis/Recommendation Capability各自包裝一個**已經存在**
 * 的Runtime Runner（`analysis_runner.js`/`recommendation_
 * runner.js`），Runner本身負責產生真正的Analysis/Recommendation
 * Result；Decision Capability目前**沒有**對應的Decision
 * Runner——TASK1.82審查結論明確記錄「Decision Capability完全不
 * 存在」，本次任務也明確禁止「建立Decision Algorithm/建立Rule
 * Engine」。因此這個檔案身兼兩個角色：
 *
 * 1. `buildDecisionOutputPlaceholder()`——比照Analysis/
 *    Recommendation Runner各自Result Builder的角色，產生**結構化
 *    的Decision Output佔位形狀**（`{status, decision, metadata}`，
 *    延續TASK1.81/1.82規劃文件裡記錄的暫定形狀），但**不包含任何
 *    判斷邏輯、評分邏輯、AI推論**——`decision`欄位固定為`null`，
 *    `status`固定為`'decision_not_available'`，明確標示「這裡有
 *    結構、但還沒有真正的決策」，`metadata.recommendationCount`
 *    只是原樣讀取輸入的`recommendations`陣列長度（單純的事實計數，
 *    跟`recommendation_runner.js`裡`insightCountModule`同一種
 *    「只讀取既有欄位值/陣列長度，不做任何推論、分類、比較」的
 *    deterministic哲學，不是「評分」或「判斷」）。
 * 2. `createDecisionCapabilityResultBuilder()`——比照Analysis/
 *    Recommendation Capability Result Builder的角色，提供
 *    `buildSuccessResult()`/`buildFailureResult()`兩個Capability
 *    層級的封裝函式（`{ok, capability:'decision', result|reason}`）。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議
 * - no scoring：不計算任何分數/信心值/排序
 * - no decision logic：`decision`欄位永遠是`null`，這是本次任務
 *   刻意的邊界——真正的決策邏輯留給未來任務（本次任務明確禁止）
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

const CAPABILITY_NAME = 'decision';

// 目前的Decision Output輸出格式版本號，純粹是資料上的版本標記，
// 跟任何AI model版本無關（本次任務完全不串接任何AI）。
export const DECISION_OUTPUT_VERSION = '1.0.0';

/**
 * 產生結構化的Decision Output佔位形狀——比照Analysis Result
 * （TASK1.43）/Recommendation Result（TASK1.44）同樣的
 * `{status, <主要資料欄位>, metadata}`三欄位慣例，但`decision`
 * 欄位固定為`null`，因為目前完全沒有任何判斷邏輯/評分邏輯/AI
 * 推論可以產生真正的決策內容——這是TASK1.82審查結論裡「Decision
 * Output暫定形狀」的第一次落地，本次任務只建立形狀，不建立內容。
 *
 * @param {object} recommendationResult - Recommendation
 *   Capability（TASK1.77）`requestRecommendation()`成功時回傳的
 *   `result`欄位（{status, recommendations, metadata}），這裡只
 *   讀取`recommendations`陣列的長度（事實計數，不是判斷），不修改
 *   原始物件的任何欄位值，也不解讀其業務內容
 * @returns {{status:'decision_not_available', decision:null, metadata:{version:string, recommendationCount:number}}}
 */
export function buildDecisionOutputPlaceholder(recommendationResult) {
  const recommendations = recommendationResult && Array.isArray(recommendationResult.recommendations) ? recommendationResult.recommendations : [];
  return {
    status: 'decision_not_available',
    decision: null,
    metadata: {
      version: DECISION_OUTPUT_VERSION,
      recommendationCount: recommendations.length,
    },
  };
}

/**
 * @returns {{
 *   buildSuccessResult: (decisionOutput:object) => {ok:true, capability:'decision', result:{status:string, decision:null, metadata:object}},
 *   buildFailureResult: (reason:string, field?:string) => {ok:false, capability:'decision', reason:string, field?:string}
 * }}
 */
export function createDecisionCapabilityResultBuilder() {
  /**
   * @param {object} decisionOutput - `buildDecisionOutputPlaceholder()`
   *   產生的Decision Output佔位形狀，這裡只是重新包裝，不修改任何
   *   欄位的值
   * @returns {{ok:true, capability:'decision', result:{status:string, decision:null, metadata:object}}}
   */
  function buildSuccessResult(decisionOutput) {
    return {
      ok: true,
      capability: CAPABILITY_NAME,
      result: decisionOutput && typeof decisionOutput === 'object' ? decisionOutput : {},
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @param {string} [field] - 選填，指出是哪個欄位造成的失敗
   * @returns {{ok:false, capability:'decision', reason:string, field?:string}}
   */
  function buildFailureResult(reason, field) {
    const failure = {
      ok: false,
      capability: CAPABILITY_NAME,
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
    if (typeof field === 'string' && field.length > 0) {
      failure.field = field;
    }
    return failure;
  }

  return { buildSuccessResult, buildFailureResult };
}

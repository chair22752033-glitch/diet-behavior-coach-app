/*
 * Phase 1 TASK 1.44｜Recommendation Framework Foundation
 * - Recommendation Result Builder
 *
 * 定義 Recommendation Result 的穩定輸出格式（規格原文範例）：
 *
 * {
 *   status: "recommendation_ready",
 *   recommendations: [{ type, value, source }],
 *   metadata: { version },
 * }
 *
 * 明確要求：
 * - structured output only：只回傳結構化資料，不是任何字串
 * - no conversational text：不產生任何對話式文字
 * - no user coaching language：不產生任何教練/指導語氣的內容
 * - no health advice generation：不產生任何健康建議
 * - no scoring unless explicitly deterministic from existing analysis
 *   output：`recommendations[].value` 一律是既有Analysis Result裡
 *   本來就有的、或用固定公式（例如陣列長度）算出來的deterministic
 *   數值，不是新算出來的主觀分數
 *
 * 完全是純函式：不讀取 Date.now()/Math.random()/任何外部狀態，跟
 * TASK1.43 analysis_result_builder.js不同的是，這裡的metadata規格
 * 範例只有version一個欄位（沒有generatedAt），所以完全不需要任何
 * 「呼叫端明確傳入時間戳」的機制，天生就是100% deterministic。
 */

// 目前的Recommendation Result輸出格式版本號，純粹是資料上的版本標記，
// 跟任何AI model版本無關（本次任務完全不串接任何AI）。
export const RECOMMENDATION_RESULT_VERSION = '1.0.0';

function normalizeRecommendation(recommendation) {
  return {
    type: recommendation && typeof recommendation.type === 'string' ? recommendation.type : null,
    value: recommendation ? recommendation.value : null,
    source: recommendation && typeof recommendation.source === 'string' ? recommendation.source : null,
  };
}

/**
 * @returns {{buildRecommendationResult: (recommendations?:Array) => {status:string, recommendations:Array, metadata:{version:string}}}}
 */
export function createRecommendationResultBuilder() {
  /**
   * @param {Array<{type:string, value:*, source:string}>} [recommendations]
   * @returns {{status:'recommendation_ready', recommendations:Array, metadata:{version:string}}}
   */
  function buildRecommendationResult(recommendations) {
    const normalized = Array.isArray(recommendations) ? recommendations.map(normalizeRecommendation) : [];

    return {
      status: 'recommendation_ready',
      recommendations: normalized,
      metadata: {
        version: RECOMMENDATION_RESULT_VERSION,
      },
    };
  }

  return { buildRecommendationResult };
}

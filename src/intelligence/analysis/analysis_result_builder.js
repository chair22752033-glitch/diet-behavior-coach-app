/*
 * Phase 1 TASK 1.43｜Insight Analysis Framework Foundation
 * - Analysis Result Builder
 *
 * 定義 Analysis Result 的穩定輸出格式（規格原文範例）：
 *
 * {
 *   status: "analysis_ready",
 *   insights: [{ type, value, source }],
 *   metadata: { generatedAt, version },
 * }
 *
 * 明確要求：
 * - no natural language generation：不產生任何自然語言字串/句子
 * - no recommendation：不產生任何建議
 * - no scoring unless explicitly deterministic from existing data：
 *   不自己算任何新的主觀分數——`insights[].value` 一律是既有資料裡
 *   本來就有的、或用固定公式（例如count）算出來的deterministic數值
 * - predictable output：同樣的輸入，任何時候呼叫都得到完全相同的輸出
 *
 * 完全是純函式：不讀取 Date.now()/Math.random()/任何外部狀態。
 * `metadata.generatedAt` 刻意不在這裡內部產生（那會讓輸出不再
 * deterministic）——一律由呼叫端透過 `options.generatedAt` 明確傳入，
 * 沒有提供時安全預設為 null，不猜測、不使用目前時間。
 */

// 目前的Analysis Result輸出格式版本號，純粹是資料上的版本標記，跟
// 任何AI model版本無關（本次任務完全不串接任何AI）。
export const ANALYSIS_RESULT_VERSION = '1.0.0';

function normalizeInsight(insight) {
  return {
    type: insight && typeof insight.type === 'string' ? insight.type : null,
    value: insight ? insight.value : null,
    source: insight && typeof insight.source === 'string' ? insight.source : null,
  };
}

/**
 * @returns {{buildAnalysisResult: (insights:Array, options?:{generatedAt?:string}) => {status:string, insights:Array, metadata:{generatedAt:string|null, version:string}}}}
 */
export function createAnalysisResultBuilder() {
  /**
   * @param {Array<{type:string, value:*, source:string}>} [insights]
   * @param {object} [options] - {generatedAt?:string}：由呼叫端明確
   *   傳入的時間戳字串，這裡完全不會自己產生一個
   * @returns {{status:'analysis_ready', insights:Array, metadata:{generatedAt:string|null, version:string}}}
   */
  function buildAnalysisResult(insights, options) {
    options = options && typeof options === 'object' ? options : {};
    const normalizedInsights = Array.isArray(insights) ? insights.map(normalizeInsight) : [];

    return {
      status: 'analysis_ready',
      insights: normalizedInsights,
      metadata: {
        generatedAt: typeof options.generatedAt === 'string' ? options.generatedAt : null,
        version: ANALYSIS_RESULT_VERSION,
      },
    };
  }

  return { buildAnalysisResult };
}

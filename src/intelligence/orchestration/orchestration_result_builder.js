/*
 * Phase 1 TASK 1.45｜Intelligence Orchestration Layer Foundation
 * - Orchestration Result Builder
 *
 * 定義 Unified Intelligence Result 的穩定輸出格式（規格原文範例）：
 *
 * {
 *   status: "intelligence_ready",
 *   context,
 *   analysis,
 *   recommendation,
 *   metadata: { version },
 * }
 *
 * 明確要求：
 * - structured data only：只是把 Insight Context（TASK1.42）、Analysis
 *   Result（TASK1.43）、Recommendation Result（TASK1.44）三份既有的
 *   結構化資料原樣包成單一物件，不重新解讀、不摘要、不轉換其內容
 * - no natural language：不產生任何自然語言字串/句子
 * - no generated advice：不產生任何建議，`recommendation`欄位就是
 *   Recommendation Runner（TASK1.44）已經算好的結果，這裡不加工
 * - no scoring：不自己算任何新的分數/信心值，`metadata`只有版本號
 * - deterministic output：同樣的輸入，任何時候呼叫都得到完全相同的
 *   輸出——不讀取 Date.now()/Math.random()/任何外部狀態，因此跟
 *   analysis_result_builder.js不同，這裡的metadata範例只有version，
 *   刻意不接受options參數、不支援generatedAt欄位
 */

// 目前的Orchestration Result輸出格式版本號，純粹是資料上的版本標記，
// 跟任何AI model版本無關（本次任務完全不串接任何AI）。
export const ORCHESTRATION_RESULT_VERSION = '1.0.0';

/**
 * @returns {{buildOrchestrationResult: (layers:{context:object, analysis:object, recommendation:object}) => {status:string, context:object, analysis:object, recommendation:object, metadata:{version:string}}}}
 */
export function createOrchestrationResultBuilder() {
  /**
   * @param {object} layers
   * @param {object} [layers.context] - Insight Context（TASK1.42）
   * @param {object} [layers.analysis] - Analysis Result（TASK1.43）
   * @param {object} [layers.recommendation] - Recommendation Result（TASK1.44）
   * @returns {{status:'intelligence_ready', context:object|null, analysis:object|null, recommendation:object|null, metadata:{version:string}}}
   */
  function buildOrchestrationResult(layers) {
    layers = layers && typeof layers === 'object' ? layers : {};

    return {
      status: 'intelligence_ready',
      context: layers.context !== undefined ? layers.context : null,
      analysis: layers.analysis !== undefined ? layers.analysis : null,
      recommendation: layers.recommendation !== undefined ? layers.recommendation : null,
      metadata: { version: ORCHESTRATION_RESULT_VERSION },
    };
  }

  return { buildOrchestrationResult };
}

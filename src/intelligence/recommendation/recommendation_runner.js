/*
 * Phase 1 TASK 1.44｜Recommendation Framework Foundation
 * - Recommendation Runner
 *
 * 責任：接收已驗證的 Analysis Result（TASK1.43
 * analysis_result_builder.js 產生的 {status, insights, metadata}
 * 形狀），依序執行一組 deterministic 的推薦模組，把每個模組的輸出組合
 * 成單一 Recommendation Result（recommendation_result_builder.js）。
 * 架構位置：
 *
 *   Insight Context（TASK1.42）
 *     ↓
 *   Analysis Framework（TASK1.43）
 *     ↓
 *   Analysis Result Contract
 *     ↓
 *   Recommendation Runner（這裡）
 *     ↓
 *   Recommendation Result Contract（recommendation_result_builder.js）
 *
 * 明確要求：
 * - deterministic：同樣的Analysis Result輸入，任何時候呼叫都得到
 *   完全相同的Recommendation Result
 * - no AI logic / no natural language generation：每個推薦模組都是
 *   純函式，只讀取Analysis Result裡既有的欄位值，不做任何推論、分類、
 *   摘要，也不產生任何字串樣板
 * - no external dependency：不 import 任何非相對路徑的外部套件
 * - no SQL：完全不 import src/db/ 底下任何檔案，這個檔案甚至不接受
 *   db參數
 * - no HTTP：不知道 Request/Response 是什麼
 * - no session handling：不 import src/auth/ 或 src/identity/
 *
 * 注意：這裡的 validateAnalysisResult() 是針對 TASK1.43
 * analysis_result_builder.js 實際產生的 {status, insights, metadata}
 * 形狀做的獨立驗證，刻意不重用 src/intelligence/contracts.js
 * （TASK1.40）裡舊版的 AnalysisResultContract/matchesContract()——
 * 那組定義的是 {status, result} 形狀，對應的是analysis_engine.js
 * （TASK1.40）那個仍為inert占位的介面，跟TASK1.43真正產生的Analysis
 * Result形狀不同，重用會造成錯誤的驗證結果。本次任務規格也沒有要求
 * 新增一個獨立的contract檔案，所以驗證邏輯就地寫在這裡，不匯出給
 * 其他模組重用。
 *
 * 內建的預設推薦模組（DEFAULT_RECOMMENDATION_MODULES）刻意只做「把
 * Analysis Result裡本來就有的欄位值/陣列長度，原樣包成一筆
 * recommendation」這種最保守的deterministic轉換——沒有任何門檻值
 * 比較、沒有健康建議、沒有教練式語氣、沒有對話文字，避免變成事實上
 * 的AI推薦邏輯。真正的推薦邏輯留給未來任務決定要不要、怎麼加。
 */
import { createRecommendationResultBuilder } from './recommendation_result_builder.js';

/**
 * 只驗證架構（欄位是否存在、typeof是否相符），不驗證欄位內容細節——
 * 跟 src/intelligence/contracts/insight_context_contract.js 的
 * validateInsightContext() 同樣的「只驗證架構，不驗證細節」哲學。
 *
 * @param {*} analysisResult
 * @returns {{ok:boolean, reason?:string, field?:string}}
 */
function validateAnalysisResult(analysisResult) {
  if (!analysisResult || typeof analysisResult !== 'object') {
    return { ok: false, reason: 'invalid_analysis_result' };
  }
  if (typeof analysisResult.status !== 'string') {
    return { ok: false, reason: 'invalid_field_type', field: 'status' };
  }
  if (!Array.isArray(analysisResult.insights)) {
    return { ok: false, reason: 'invalid_field_type', field: 'insights' };
  }
  if (!analysisResult.metadata || typeof analysisResult.metadata !== 'object') {
    return { ok: false, reason: 'invalid_field_type', field: 'metadata' };
  }
  return { ok: true };
}

/**
 * 每個模組是 (analysisResult) => {type,value,source} | null 的純函式。
 * 回傳 null 代表「這個Analysis Result沒有值得回報的東西」，
 * recommendation_runner 會過濾掉這些null，不會塞進最終的
 * recommendations清單。
 */
export const DEFAULT_RECOMMENDATION_MODULES = [
  function insightCountModule(analysisResult) {
    return { type: 'insight_count', value: analysisResult.insights.length, source: 'insights' };
  },
  function analysisStatusModule(analysisResult) {
    return { type: 'analysis_status', value: analysisResult.status, source: 'status' };
  },
  function analysisVersionModule(analysisResult) {
    return { type: 'analysis_version', value: typeof analysisResult.metadata.version === 'string' ? analysisResult.metadata.version : null, source: 'metadata' };
  },
];

/**
 * @param {object} [dependencies]
 * @param {{buildRecommendationResult: Function}} [dependencies.resultBuilder]
 * @param {Array<Function>} [dependencies.modules] - 覆蓋預設推薦模組清單，供測試/未來擴充使用
 * @returns {{runRecommendation: (analysisResult:object) => {ok:boolean, result?:object, reason?:string, field?:string}}}
 */
export function createRecommendationRunner(dependencies) {
  dependencies = dependencies || {};
  const resultBuilder = dependencies.resultBuilder || createRecommendationResultBuilder();
  const modules = Array.isArray(dependencies.modules) ? dependencies.modules : DEFAULT_RECOMMENDATION_MODULES;

  /**
   * @param {object} analysisResult - TASK1.43
   *   analysis_result_builder.js 產生、{status, insights, metadata}
   *   形狀的 Analysis Result
   * @returns {{ok:boolean, result?:{status:string, recommendations:Array, metadata:object}, reason?:string, field?:string}}
   */
  function runRecommendation(analysisResult) {
    const validation = validateAnalysisResult(analysisResult);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason, field: validation.field };
    }

    const recommendations = [];
    for (const recommendationModule of modules) {
      const recommendation = recommendationModule(analysisResult);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    const result = resultBuilder.buildRecommendationResult(recommendations);
    return { ok: true, result };
  }

  return { runRecommendation };
}

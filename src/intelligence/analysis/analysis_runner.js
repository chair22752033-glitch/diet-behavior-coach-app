/*
 * Phase 1 TASK 1.43｜Insight Analysis Framework Foundation
 * - Analysis Runner
 *
 * 責任：接收已驗證的 Insight Context（TASK1.42），依序執行一組
 * deterministic 的分析模組，把每個模組的輸出組合成單一 Analysis
 * Result（TASK1.43 analysis_result_builder.js）。架構位置：
 *
 *   Insight Context（TASK1.42）
 *     ↓
 *   Analysis Runner（這裡）
 *     ↓
 *   Analysis Result Contract（analysis_result_builder.js）
 *     ↓
 *   Recommendation Engine（TASK1.40，本次不修改、不串接）
 *
 * 明確要求：
 * - deterministic：同樣的Insight Context輸入，任何時候呼叫都得到
 *   完全相同的Analysis Result
 * - no AI logic：每個分析模組都是純函式，只讀取context裡既有的
 *   count/欄位值，不做任何推論、分類、摘要
 * - no HTTP：不知道 Request/Response 是什麼
 * - no SQL：完全不 import src/db/ 底下任何檔案，這個檔案甚至不接受
 *   db參數
 * - no session handling：不 import src/auth/ 或 src/identity/
 *
 * 內建的預設分析模組（DEFAULT_ANALYSIS_MODULES）刻意只做「把
 * Insight Context裡本來就有的count欄位，原樣包成一筆insight」這種
 * 最保守的deterministic轉換——沒有加總以外的任何計算、沒有判斷「多
 * 還是少」、沒有任何門檻值比較，避免不小心就變成事實上的分析/推薦
 * 邏輯。真正的分析邏輯留給未來任務決定要不要、怎麼加。
 */
import { validateInsightContext } from '../contracts/insight_context_contract.js';
import { createAnalysisResultBuilder } from './analysis_result_builder.js';

/**
 * 每個模組是 (insightContext) => {type,value,source} | null 的純函式。
 * 回傳 null 代表「這個context沒有值得回報的東西」，analysis_runner
 * 會過濾掉這些null，不會塞進最終的insights清單。
 */
export const DEFAULT_ANALYSIS_MODULES = [
  function activityVolumeModule(context) {
    return { type: 'activity_count', value: context.activityContext.count, source: 'activityContext' };
  },
  function nutritionVolumeModule(context) {
    return { type: 'nutrition_count', value: context.nutritionContext.count, source: 'nutritionContext' };
  },
  function emotionVolumeModule(context) {
    return { type: 'emotion_count', value: context.emotionContext.count, source: 'emotionContext' };
  },
  function behaviorVolumeModule(context) {
    return { type: 'behavior_count', value: context.behaviorContext.count, source: 'behaviorContext' };
  },
  function reportVolumeModule(context) {
    return { type: 'report_count', value: context.reportContext.count, source: 'reportContext' };
  },
  function totalRecordsModule(context) {
    return { type: 'total_records', value: context.metadata.totalRecords, source: 'metadata' };
  },
];

/**
 * @param {object} [dependencies]
 * @param {{buildAnalysisResult: Function}} [dependencies.resultBuilder]
 * @param {Array<Function>} [dependencies.modules] - 覆蓋預設分析模組清單，供測試/未來擴充使用
 * @returns {{runAnalysis: (insightContext:object, options?:object) => {ok:boolean, result?:object, reason?:string, field?:string}}}
 */
export function createAnalysisRunner(dependencies) {
  dependencies = dependencies || {};
  const resultBuilder = dependencies.resultBuilder || createAnalysisResultBuilder();
  const modules = Array.isArray(dependencies.modules) ? dependencies.modules : DEFAULT_ANALYSIS_MODULES;

  /**
   * @param {object} insightContext - TASK1.42 insight_context_builder.js
   *   產生、通過 validateInsightContext() 驗證的 Insight Context
   * @param {object} [options] - 轉交給 resultBuilder.buildAnalysisResult()
   *   的選項（例如 generatedAt），這裡不解讀其內容
   * @returns {{ok:boolean, result?:{status:string, insights:Array, metadata:object}, reason?:string, field?:string}}
   */
  function runAnalysis(insightContext, options) {
    const validation = validateInsightContext(insightContext);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason, field: validation.field };
    }

    const insights = [];
    for (const analysisModule of modules) {
      const insight = analysisModule(insightContext);
      if (insight) {
        insights.push(insight);
      }
    }

    const result = resultBuilder.buildAnalysisResult(insights, options);
    return { ok: true, result };
  }

  return { runAnalysis };
}

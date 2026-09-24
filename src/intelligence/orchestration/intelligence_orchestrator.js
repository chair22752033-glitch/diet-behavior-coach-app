/*
 * Phase 1 TASK 1.45｜Intelligence Orchestration Layer Foundation
 * - Intelligence Orchestrator
 *
 * 責任：協調既有四個Phase 2 Intelligence子層，依規格圖固定順序執行，
 * 把每一層的輸出接成下一層的輸入，最後組出單一 Unified Intelligence
 * Result（orchestration_result_builder.js）。架構位置：
 *
 *   User Data
 *     ↓
 *   Data Preparation（TASK1.41）
 *     ↓
 *   Insight Context（TASK1.42）
 *     ↓
 *   Analysis Runner（TASK1.43）
 *     ↓
 *   Recommendation Runner（TASK1.44）
 *     ↓
 *   Intelligence Orchestrator（這裡）
 *     ↓
 *   Unified Intelligence Result
 *
 * 明確要求：
 * - deterministic：同樣的輸入（db回傳同樣的資料、同樣的userId/options），
 *   任何時候呼叫都得到完全相同的Unified Intelligence Result
 * - no AI logic：這個檔案完全不做任何推論/分類/摘要/評分/建議，純粹是
 *   依序呼叫四個既有子層、把回傳值原樣往下傳遞
 * - no HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - no SQL：完全不 import src/db/ 底下任何檔案，這個檔案甚至不知道
 *   db的內部結構——db只是原樣轉交給dataPreparation.prepare()的參數
 * - no session parsing：不 import src/auth/ 或 src/identity/
 * - no direct Domain Service access：不 import src/services/ 底下任何
 *   檔案；所有資料都必須先經過既有的Intelligence Layer邊界
 *   （dataPreparation → contextBuilder → analysisRunner →
 *   recommendationRunner），這裡只透過依賴注入拿到四個子層的實例，
 *   完全不繞過它們直接存取Domain Service或D1
 *
 * 跟src/intelligence/insight_service.js的getInsightContext()一樣的
 * 失敗處理風格：任何一個階段失敗都立刻回傳失敗結果並停止往下執行，
 * 不會用不完整/未驗證的資料頂替繼續跑後面的階段。
 */
import { createOrchestrationResultBuilder } from './orchestration_result_builder.js';

/**
 * @param {object} dependencies
 * @param {{prepare: (db:object, userId:string, options?:object) => Promise<object>}} dependencies.dataPreparation
 * @param {{buildInsightContext: (preparedContext:object) => {context:object, validation:object}}} dependencies.contextBuilder
 * @param {{runAnalysis: (insightContext:object, options?:object) => {ok:boolean, result?:object, reason?:string, field?:string}}} dependencies.analysisRunner
 * @param {{runRecommendation: (analysisResult:object) => {ok:boolean, result?:object, reason?:string, field?:string}}} dependencies.recommendationRunner
 * @param {{buildOrchestrationResult: Function}} [dependencies.resultBuilder]
 * @returns {{runIntelligencePipeline: (db:object, userId:string, options?:object) => Promise<{ok:boolean, status:string, reason?:string, field?:string, data:{result:object}|null}>}}
 */
export function createIntelligenceOrchestrator(dependencies) {
  dependencies = dependencies || {};
  const { dataPreparation, contextBuilder, analysisRunner, recommendationRunner } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createOrchestrationResultBuilder();

  /**
   * 依序執行 Data Preparation → Insight Context → Analysis Runner →
   * Recommendation Runner 四個既有階段，任何一步失敗都立刻停止並回傳
   * 失敗原因，成功時回傳組好的 Unified Intelligence Result。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給dataPreparation.prepare()
   * @param {string} userId - 一律是已經確認過的使用者id，由呼叫端當作
   *   獨立參數傳入
   * @param {object} [options] - 轉交給dataPreparation.prepare()跟
   *   analysisRunner.runAnalysis()的選項，這裡不解讀其內容
   * @returns {Promise<{ok:boolean, status:string, reason?:string, field?:string, data:{result:object}|null}>}
   */
  async function runIntelligencePipeline(db, userId, options) {
    if (!dataPreparation || typeof dataPreparation.prepare !== 'function') {
      return { ok: false, status: 'orchestration_unavailable', reason: 'data_preparation_unavailable', data: null };
    }

    const prepared = await dataPreparation.prepare(db, userId, options);
    if (!prepared.ok) {
      return { ok: false, status: 'orchestration_unavailable', reason: prepared.reason || prepared.error || 'context_build_failed', data: null };
    }

    if (!contextBuilder || typeof contextBuilder.buildInsightContext !== 'function') {
      return { ok: false, status: 'orchestration_unavailable', reason: 'context_builder_unavailable', data: null };
    }

    const { context, validation } = contextBuilder.buildInsightContext(prepared.context);
    if (!validation.ok) {
      return { ok: false, status: 'orchestration_invalid', reason: validation.reason, field: validation.field, data: null };
    }

    if (!analysisRunner || typeof analysisRunner.runAnalysis !== 'function') {
      return { ok: false, status: 'orchestration_unavailable', reason: 'analysis_runner_unavailable', data: null };
    }

    const analysisOutcome = analysisRunner.runAnalysis(context, options);
    if (!analysisOutcome.ok) {
      return { ok: false, status: 'orchestration_invalid', reason: analysisOutcome.reason, field: analysisOutcome.field, data: null };
    }

    if (!recommendationRunner || typeof recommendationRunner.runRecommendation !== 'function') {
      return { ok: false, status: 'orchestration_unavailable', reason: 'recommendation_runner_unavailable', data: null };
    }

    const recommendationOutcome = recommendationRunner.runRecommendation(analysisOutcome.result);
    if (!recommendationOutcome.ok) {
      return { ok: false, status: 'orchestration_invalid', reason: recommendationOutcome.reason, field: recommendationOutcome.field, data: null };
    }

    const result = resultBuilder.buildOrchestrationResult({
      context,
      analysis: analysisOutcome.result,
      recommendation: recommendationOutcome.result,
    });

    return { ok: true, status: 'intelligence_ready', data: { result } };
  }

  return { runIntelligencePipeline };
}

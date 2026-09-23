/*
 * Phase 1 TASK 1.40｜Phase 2 Intelligence Architecture Foundation
 * - Insight Service（未來的 Intelligence Application Service）
 * （TASK1.42 新增 getInsightContext()，串接 Data Preparation Layer
 * 與 Insight Context Contract）
 *
 * 責任：接收 userId、組合分析需求、呼叫 analysis engine、呼叫
 * recommendation engine——這是Controller/Application Service跟
 * Analysis/Recommendation Engine之間的隔離層，架構位置對應規格圖：
 *
 *   Controller
 *     ↓
 *   Application Service
 *     ↓
 *   Insight Service（這裡）
 *     ↓
 *   Analysis Engine / Recommendation Engine
 *     ↓
 *   Future AI Adapter
 *
 * 明確禁止：Controller 直接跳過這一層去呼叫 Analysis Engine 或任何
 * 未來的 AI Provider；也禁止 Router 直接呼叫 Intelligence Layer——
 * 兩者都必須先經過 Application Service 這一層（本次任務没有任何
 * controller/route實際呼叫這裡的函式，純粹是Phase 2 extension point）。
 *
 * 完全沒有：
 * - SQL / db.prepare() / 任何 D1 操作（不 import src/db/ 底下任何檔案）
 * - HTTP 處理（不知道 Request/Response 是什麼）
 * - Session 邏輯（不 import src/auth/ 或 src/identity/）
 * - 任何 AI API 呼叫（不呼叫 fetch()、不 import 任何 AI SDK）
 *
 * 目前不得產生任何分析結果：getUserInsight() 一律回傳固定的
 * {ok:true, status:'not_ready', data:null}，不因為傳入的userId/context
 * 而改變。呼叫鏈本身確實會往下呼叫 analysisEngine.analyze()／
 * recommendationEngine.recommend()（證明依賴關係真的接通、Analysis
 * Engine的輸出真的會被傳給Recommendation Engine當作輸入），但兩者
 * 現階段都只是回傳 not_implemented 的inert占位結果（見
 * analysis_engine.js/recommendation_engine.js），這裡完全不會讀取、
 * 組裝、或依賴它們回傳的內容來決定 getUserInsight() 的回傳值。
 *
 * TASK1.42新增：getInsightContext(db, userId, options)——呼叫
 * dataPreparation.prepare()蒐集並normalize使用者資料，再交給
 * contextBuilder.buildInsightContext()轉成穩定的Insight Context格式
 * （見src/intelligence/contracts/insight_context_contract.js/
 * src/intelligence/context/insight_context_builder.js），完全不產生
 * 任何分析結果——成功時一律回傳
 * {ok:true, status:'context_ready', data:{context}}，這裡只負責
 * 「把資料準備好、驗證格式對不對」，不解讀context內容、不打分數、不
 * 產生建議、不組任何prompt。dataPreparation/contextBuilder一樣是透過
 * 依賴注入傳入（跟analysisEngine/recommendationEngine同樣的DI風格），
 * 這個檔案本身完全不import任何其他intelligence子模組。
 */

/**
 * @param {object} dependencies
 * @param {{analyze: (userData:*) => Promise<*>}} [dependencies.analysisEngine]
 * @param {{recommend: (insight:*) => Promise<*>}} [dependencies.recommendationEngine]
 * @param {{prepare: (db:object, userId:string, options?:object) => Promise<object>}} [dependencies.dataPreparation]
 * @param {{buildInsightContext: (preparedContext:object) => {context:object, validation:object}}} [dependencies.contextBuilder]
 * @returns {{
 *   getUserInsight: (userId:string, context?:object) => Promise<{ok:true, status:'not_ready', data:null}>,
 *   getInsightContext: (db:object, userId:string, options?:object) => Promise<{ok:boolean, status:string, reason?:string, data:{context:object}|null}>
 * }}
 */
export function createInsightService(dependencies) {
  dependencies = dependencies || {};
  const { analysisEngine, recommendationEngine, dataPreparation, contextBuilder } = dependencies;

  /**
   * @param {string} userId
   * @param {object} [context] - 未來可能帶的額外分析情境參數，本次刻意
   *   完全不讀取它的任何欄位。
   * @returns {Promise<{ok:true, status:'not_ready', data:null}>}
   */
  async function getUserInsight(userId, context) {
    let analysisResult = null;
    if (analysisEngine && typeof analysisEngine.analyze === 'function') {
      analysisResult = await analysisEngine.analyze({ userId, context: context || null });
    }
    if (recommendationEngine && typeof recommendationEngine.recommend === 'function') {
      await recommendationEngine.recommend(analysisResult);
    }
    return { ok: true, status: 'not_ready', data: null };
  }

  /**
   * 呼叫 Data Preparation Layer 蒐集資料，再交給 Insight Context
   * Builder 轉成驗證過的 Insight Context——完全不做任何解讀/分析，
   * 只負責「把資料準備好、格式對不對」。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態
   * @param {string} userId - 一律是已經確認過的使用者id，由呼叫端當作
   *   獨立參數傳入
   * @param {object} [options] - 轉交給 dataPreparation.prepare() 的選項
   *   （例如limit），這裡不解讀其內容
   * @returns {Promise<{ok:boolean, status:string, reason?:string, data:{context:object}|null}>}
   */
  async function getInsightContext(db, userId, options) {
    if (!dataPreparation || typeof dataPreparation.prepare !== 'function') {
      return { ok: false, status: 'context_unavailable', reason: 'data_preparation_unavailable', data: null };
    }

    const prepared = await dataPreparation.prepare(db, userId, options);
    if (!prepared.ok) {
      return { ok: false, status: 'context_unavailable', reason: prepared.reason || prepared.error || 'context_build_failed', data: null };
    }

    if (!contextBuilder || typeof contextBuilder.buildInsightContext !== 'function') {
      return { ok: false, status: 'context_unavailable', reason: 'context_builder_unavailable', data: null };
    }

    const { context, validation } = contextBuilder.buildInsightContext(prepared.context);
    if (!validation.ok) {
      return { ok: false, status: 'context_invalid', reason: validation.reason, data: null };
    }

    return { ok: true, status: 'context_ready', data: { context } };
  }

  return { getUserInsight, getInsightContext };
}

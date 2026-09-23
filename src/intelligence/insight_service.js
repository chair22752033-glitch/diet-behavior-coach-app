/*
 * Phase 1 TASK 1.40｜Phase 2 Intelligence Architecture Foundation
 * - Insight Service（未來的 Intelligence Application Service）
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
 */

/**
 * @param {object} dependencies
 * @param {{analyze: (userData:*) => Promise<*>}} [dependencies.analysisEngine]
 * @param {{recommend: (insight:*) => Promise<*>}} [dependencies.recommendationEngine]
 * @returns {{getUserInsight: (userId:string, context?:object) => Promise<{ok:true, status:'not_ready', data:null}>}}
 */
export function createInsightService(dependencies) {
  dependencies = dependencies || {};
  const { analysisEngine, recommendationEngine } = dependencies;

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

  return { getUserInsight };
}

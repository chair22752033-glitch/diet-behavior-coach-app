/*
 * Phase 1 TASK 1.40｜Phase 2 Intelligence Architecture Foundation
 * - Recommendation Engine
 *
 * 未來負責：行動建議、個人化推薦。
 *
 * 本次任務刻意不產生任何建議——這裡只建立「未來推薦引擎該長什麼形狀」
 * 的介面本身，`recommend()` 一律回傳固定的 not_implemented 佔位結果，
 * 不讀取、不解析、不根據呼叫端傳入的 insight 內容做任何判斷。
 *
 * 完全沒有：
 * - SQL / db.prepare() / 任何 D1 操作（不 import src/db/ 底下任何檔案）
 * - HTTP 處理（不知道 Request/Response 是什麼）
 * - Session 邏輯（不 import src/auth/ 或 src/identity/）
 * - 任何 AI API 呼叫（不呼叫 fetch()、不 import 任何 AI SDK、不串接
 *   Claude/OpenAI/DeepSeek 或任何model inference服務）
 */

/**
 * @returns {{recommend: (insight:*) => Promise<{status:string, recommendations:Array}>}}
 */
export function createRecommendationEngine() {
  /**
   * @param {*} insight - 未來會是 analysis_engine.analyze() 的輸出，
   *   本次刻意完全不讀取這個參數的任何欄位，只是接受它、原樣忽略。
   * @returns {Promise<{status:'not_implemented', recommendations:[]}>}
   */
  async function recommend(insight) {
    return { status: 'not_implemented', recommendations: [] };
  }

  return { recommend };
}

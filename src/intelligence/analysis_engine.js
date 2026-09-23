/*
 * Phase 1 TASK 1.40｜Phase 2 Intelligence Architecture Foundation
 * - Analysis Engine
 *
 * 未來負責：行為分析、趨勢分析、Pattern detection。
 *
 * 本次任務刻意不實作任何分析邏輯——這裡只建立「未來分析引擎該長什麼
 * 形狀」的介面本身，`analyze()` 一律回傳固定的 not_implemented 佔位
 * 結果，不讀取、不解析、不推論呼叫端傳入的 userData 內容。
 *
 * 完全沒有：
 * - SQL / db.prepare() / 任何 D1 操作（不 import src/db/ 底下任何檔案）
 * - HTTP 處理（不知道 Request/Response 是什麼）
 * - Session 邏輯（不 import src/auth/ 或 src/identity/）
 * - 任何 AI API 呼叫（不呼叫 fetch()、不 import 任何 AI SDK、不串接
 *   Claude/OpenAI/DeepSeek 或任何model inference服務）
 */

/**
 * @returns {{analyze: (userData:*) => Promise<{status:string, result:null}>}}
 */
export function createAnalysisEngine() {
  /**
   * @param {*} userData - 未來會是「已經組合好的使用者資料」，本次刻意
   *   完全不讀取這個參數的任何欄位，只是接受它、原樣忽略。
   * @returns {Promise<{status:'not_implemented', result:null}>}
   */
  async function analyze(userData) {
    return { status: 'not_implemented', result: null };
  }

  return { analyze };
}

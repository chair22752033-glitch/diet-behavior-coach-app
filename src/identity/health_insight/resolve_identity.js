/*
 * Phase 6 TASK 1.118｜Health Insight User Identity Foundation
 * - Authentication Boundary連接點
 *
 * 責任：示範"重用既有Auth Layer"（規格明確要求：如果既有
 * authentication已經存在，重用既有邊界，不重新建立一套）——這個
 * 函式呼叫既有`src/identity/session_rules.js`的
 * `validateSessionWithIdentity()`（跟`requireAuth()`
 * middleware完全相同的驗證邏輯，TASK1.13B/1.27既有實作，完全
 * 沒有被修改），把結果轉成`user_identity.js`定義的中性
 * User Identity Context形狀。
 *
 * ## 明確要求
 *
 * - 任何驗證失敗（沒有cookie/session過期/使用者被停權/例外）都
 *   安全回傳`ANONYMOUS_IDENTITY`，**不會**讓呼叫端因為身份解析
 *   失敗而整個request失敗——延續規格"Do not force
 *   authentication"、"Anonymous mode must remain supported"的
 *   明確要求
 * - 這個檔案完全沒有被任何route/controller呼叫（延續本次任務
 *   "Foundation only"的既定範圍——見`README.md`
 *   "Current Limitations"說明），純粹是已經寫好、已經測試過、
 *   隨時可以被未來任務接上的extension point
 */
import { validateSessionWithIdentity } from '../session_rules.js';
import { buildUserIdentity, ANONYMOUS_IDENTITY } from './user_identity.js';

/**
 * @param {object} db - createDb(env)（TASK1.12）的輸出
 * @param {string|undefined} cookieHeader - 原始HTTP Cookie標頭
 * @param {object} [options] - 原樣轉交給`validateSessionWithIdentity()`（例如測試用的`now`）
 * @returns {Promise<{userId:string|null, authenticated:boolean, provider:string|null}>}
 */
export async function resolveHealthInsightIdentity(db, cookieHeader, options) {
  try {
    const result = await validateSessionWithIdentity(db, cookieHeader, options);
    if (!result || !result.ok) {
      return ANONYMOUS_IDENTITY;
    }
    return buildUserIdentity(result.user);
  } catch (e) {
    return ANONYMOUS_IDENTITY;
  }
}

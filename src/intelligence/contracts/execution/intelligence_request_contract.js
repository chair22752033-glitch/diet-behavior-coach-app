/*
 * Phase 1 TASK 1.47｜Intelligence Execution Contract Layer Foundation
 * - Intelligence Request Contract
 *
 * 定義 Intelligence Service（TASK1.46）`getIntelligence(db, request)`
 * 的request輸入穩定形狀規格——這是Application Layer跟Intelligence
 * Service之間的執行期合約，不是HTTP route的{request,response}契約
 * （那是src/contracts/*.js的責任），也跟
 * src/intelligence/contracts/insight_context_contract.js（Insight
 * Context的形狀）是不同層次的東西：這裡描述的是「呼叫端傳給
 * getIntelligence()的request物件」本身長什麼樣子。
 *
 * IntelligenceRequest 結構：
 * {
 *   userId,   // 必填，非空字串
 *   options,  // 選填，物件（詳細欄位規則見execution_options_contract.js）
 * }
 *
 * 明確要求：
 * - deterministic validation：同樣的輸入，任何時候呼叫都得到完全相同
 *   的驗證結果，不讀取Date.now()/Math.random()/任何外部狀態
 * - no business logic：只檢查形狀（userId是否為非空字串、options存在
 *   時是否為物件），不解讀options的業務內容（那是
 *   execution_options_contract.js的責任）
 * - no AI decision：不做任何推論、分類、摘要
 */

export const IntelligenceRequestContract = {
  name: 'IntelligenceRequest',
  required: ['userId'],
  optional: ['options'],
};

/**
 * 只驗證架構（userId是否存在且為非空字串、options存在時是否為物件），
 * 不驗證options的內部業務欄位——跟 src/middleware/validator.js 的
 * validateBody() 同樣的「只驗證架構，不驗證細節」哲學。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
export function validateIntelligenceRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_request' };
  }

  if (typeof request.userId !== 'string' || request.userId.length === 0) {
    return { ok: false, reason: 'invalid_user_id', field: 'userId' };
  }

  if (request.options !== undefined && (request.options === null || typeof request.options !== 'object' || Array.isArray(request.options))) {
    return { ok: false, reason: 'invalid_options_type', field: 'options' };
  }

  return { ok: true };
}

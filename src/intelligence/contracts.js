/*
 * Phase 1 TASK 1.40｜Phase 2 Intelligence Architecture Foundation
 * - Intelligence Layer Contract
 *
 * 定義 Intelligence Layer 三個回傳值的形狀規格，跟
 * src/contracts/*.js（HTTP route的{request,response}契約）是不同性質
 * 的東西——這裡描述的是「純函式呼叫」的回傳形狀（insight_service/
 * analysis_engine/recommendation_engine彼此之間，以及未來Application
 * Service呼叫insight_service時看到的形狀），不含任何HTTP相關欄位
 * （沒有status code、沒有failureReasons），因為這一層完全不知道
 * Request/Response是什麼。
 *
 * matchesContract() 提供輕量的執行期形狀檢查，供測試使用，不在任何
 * 正式呼叫路徑上執行（目前完全沒有任何controller/route呼叫這裡的
 * 任何函式）。
 */

export const InsightResponseContract = {
  name: 'InsightResponse',
  fields: {
    ok: 'boolean',
    status: 'string',
    data: 'object', // 允許 null（typeof null === 'object'）或未來的實際物件
  },
};

export const AnalysisResultContract = {
  name: 'AnalysisResult',
  fields: {
    status: 'string',
    result: 'object', // 允許 null 或未來的實際物件
  },
};

export const RecommendationResultContract = {
  name: 'RecommendationResult',
  fields: {
    status: 'string',
    recommendations: 'object', // 陣列的typeof也是'object'，允許[]或未來的實際陣列
  },
};

/**
 * 檢查 value 是否符合 contract.fields 描述的形狀（只檢查頂層欄位是否
 * 存在且typeof相符，不做深層結構驗證——跟 src/middleware/validator.js
 * 的 validateBody() 同樣「只驗證架構，不驗證細節」的哲學）。
 *
 * @param {{name:string, fields:Object<string,string>}} contract
 * @param {*} value
 * @returns {boolean}
 */
export function matchesContract(contract, value) {
  if (!contract || typeof contract !== 'object' || !contract.fields) return false;
  if (!value || typeof value !== 'object') return false;

  for (const [field, expectedType] of Object.entries(contract.fields)) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) return false;
    const actualType = typeof value[field];
    if (actualType !== expectedType) return false;
  }
  return true;
}

/*
 * Phase 1 TASK 1.47｜Intelligence Execution Contract Layer Foundation
 * - Intelligence Response Contract
 *
 * 定義 Intelligence Orchestrator（TASK1.45）成功時回傳、Intelligence
 * Service（TASK1.46）原樣包裝成 `{ok:true, data}` 的 Unified
 * Intelligence Result 穩定形狀規格（規格原文）：
 *
 * {
 *   status,
 *   context,
 *   analysis,
 *   recommendation,
 *   metadata,
 * }
 *
 * 預期 status 固定為 "intelligence_ready"。
 *
 * 明確要求：
 * - deterministic validation：同樣的輸入，任何時候呼叫都得到完全相同
 *   的驗證結果，不讀取Date.now()/Math.random()/任何外部狀態
 * - no business logic：只驗證架構（欄位是否存在、typeof是否相符、
 *   status是否等於預期值），不解讀context/analysis/recommendation/
 *   metadata的內部內容
 * - no AI decision：不做任何推論、分類、摘要、建議
 *
 * 這一層的用途是讓 Intelligence Service 在回傳給呼叫端之前，能確認
 * Orchestrator（未來即使內部實作演進）產生的結果依然符合這個穩定契約，
 * 讓「Service boundary」真正名副其實——即使底下Orchestrator/Analysis/
 * Recommendation邏輯未來改變，只要它們仍然遵守這個contract，Service
 * 對外的行為就不會改變。
 */

export const IntelligenceResponseContract = {
  name: 'IntelligenceResponse',
  fields: {
    status: 'string',
    context: 'object',
    analysis: 'object',
    recommendation: 'object',
    metadata: 'object',
  },
};

export const EXPECTED_STATUS = 'intelligence_ready';

/**
 * 只驗證架構（欄位是否存在、typeof是否相符、status是否等於預期值），
 * 不驗證context/analysis/recommendation/metadata的內部內容細節——跟
 * src/intelligence/contracts/insight_context_contract.js的
 * validateInsightContext()同樣的「只驗證架構，不驗證細節」哲學。
 *
 * @param {*} response
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
export function validateIntelligenceResponse(response) {
  if (!response || typeof response !== 'object') {
    return { ok: false, reason: 'invalid_response' };
  }

  for (const field of Object.keys(IntelligenceResponseContract.fields)) {
    if (!Object.prototype.hasOwnProperty.call(response, field)) {
      return { ok: false, reason: 'missing_field', field };
    }
  }

  if (typeof response.status !== 'string') {
    return { ok: false, reason: 'invalid_field_type', field: 'status' };
  }

  if (response.status !== EXPECTED_STATUS) {
    return { ok: false, reason: 'unexpected_status', field: 'status' };
  }

  for (const field of ['context', 'analysis', 'recommendation', 'metadata']) {
    if (!response[field] || typeof response[field] !== 'object') {
      return { ok: false, reason: 'invalid_field_type', field };
    }
  }

  return { ok: true };
}

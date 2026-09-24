/*
 * Phase 3 TASK 1.63｜Intelligence Application Contract Layer
 * Foundation
 * - Application Response Contract
 *
 * 定義 Capability Layer（TASK1.62）、Use Case Layer（TASK1.61）、
 * Application Service（TASK1.60）三層共用的response輸出穩定形狀
 * 規格（規格原文——「確保未來 Capability、Use Case、Application
 * Service 使用一致資料格式」）：
 *
 * 成功：
 * {
 *   ok: true,
 *   data: { status, result, metadata },
 *   // Use Case/Capability另外各自多一個字串標籤欄位
 *   // （useCase/capability），這個contract不對標籤欄位的名稱或
 *   // 存在與否做任何要求，只驗證三層共同持有的部分
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   reason,
 * }
 *
 * 三層實際的回傳形狀：
 * - Application Service：{ok:true, data:{status,result,metadata}} /
 *   {ok:false, reason}
 * - Use Case Layer：{ok:true, useCase, data:{status,result,metadata}} /
 *   {ok:false, useCase, reason}
 * - Capability Layer：{ok:true, capability, data:{status,result,
 *   metadata}} / {ok:false, capability, reason}
 *
 * 這個contract刻意只驗證三層共同的最小交集（`ok`/`data.status`/
 * `data.result`/`data.metadata`/`reason`），完全不要求、也不檢查
 * `useCase`/`capability`這類「各層自己額外加上去的標籤欄位」——
 * 這樣未來新增其他Capability（例如除了Insight以外的能力）即使標籤
 * 欄位名稱不同，只要基本形狀符合，這個contract依然視為合法，維持
 * 「這是Application Layer的共同契約，不是某一個特定Capability的
 * 契約」這個定位。
 *
 * 明確要求：
 * - deterministic validation：同樣的輸入，任何時候呼叫都得到完全相同
 *   的驗證結果，不讀取Date.now()/Math.random()/任何外部狀態
 * - no business logic：只驗證架構（欄位是否存在、typeof是否相符），
 *   不解讀data.status/data.result/data.metadata的內部內容
 * - no AI decision：不做任何推論、分類、摘要、建議
 */

export const ApplicationResponseContract = {
  name: 'ApplicationResponse',
  successFields: {
    data: 'object',
  },
  dataFields: ['status', 'result', 'metadata'],
  failureFields: {
    reason: 'string',
  },
};

/**
 * 只驗證架構（ok是否為布林值、成功時data是否具備
 * status/result/metadata三個欄位、失敗時reason是否為非空字串），不
 * 驗證data各欄位的內部內容、也不要求或檢查useCase/capability這類
 * 各層自行附加的標籤欄位——跟
 * src/intelligence/contracts/execution/intelligence_response_contract.js
 * 的validateIntelligenceResponse()同樣的「只驗證架構，不驗證細節」
 * 哲學。
 *
 * @param {*} response
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
export function validateApplicationResponseContract(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return { ok: false, reason: 'invalid_response' };
  }

  if (typeof response.ok !== 'boolean') {
    return { ok: false, reason: 'invalid_field_type', field: 'ok' };
  }

  if (response.ok === true) {
    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
      return { ok: false, reason: 'missing_field', field: 'data' };
    }
    for (const field of ApplicationResponseContract.dataFields) {
      if (!Object.prototype.hasOwnProperty.call(response.data, field)) {
        return { ok: false, reason: 'missing_field', field: `data.${field}` };
      }
    }
    return { ok: true };
  }

  if (typeof response.reason !== 'string' || response.reason.length === 0) {
    return { ok: false, reason: 'invalid_field_type', field: 'reason' };
  }

  return { ok: true };
}

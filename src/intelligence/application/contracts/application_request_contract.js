/*
 * Phase 3 TASK 1.63｜Intelligence Application Contract Layer
 * Foundation
 * - Application Request Contract
 *
 * 定義 Capability Layer（TASK1.62）、Use Case Layer（TASK1.61）、
 * Application Service（TASK1.60）三層共用的request輸入穩定形狀
 * 規格——這是Application Layer內部的資料格式合約，不是HTTP route的
 * {request,response}契約（那是src/contracts/*.js的責任），也跟
 * src/intelligence/contracts/execution/intelligence_request_contract.js
 * （Intelligence Service層級的request形狀）是不同層次的東西：這裡
 * 描述的是「User Application傳給Capability/Use Case/Application
 * Service的request物件」本身長什麼樣子——事實上這三層各自內建的
 * validateXxxRequest()（`validateCapabilityRequest`/
 * `validateUseCaseRequest`/`validateApplicationRequest`）目前用的
 * 就是完全一樣的規則，這個檔案把這個共同規則明確定義成一份獨立、
 * 可驗證的contract，讓未來新增的Capability/Use Case不需要各自重新
 * 發明規則，也讓「三層資料格式一致」這件事可以被獨立測試驗證，而
 * 不是只能靠肉眼比對三份原始碼。
 *
 * ApplicationRequest 結構：
 * {
 *   userId,     // 必填，非空字串
 *   options,    // 選填，物件
 *   requestId,  // 選填，字串（若提供，不驗證型別以外的內容）
 *   version,    // 選填，字串
 *   timestamp,  // 選填，字串
 *   metadata,   // 選填，物件
 * }
 *
 * 明確要求：
 * - deterministic validation：同樣的輸入，任何時候呼叫都得到完全相同
 *   的驗證結果，不讀取Date.now()/Math.random()/任何外部狀態
 * - no business logic：只檢查形狀（userId是否為非空字串、options存在
 *   時是否為物件），不解讀options的業務內容
 * - no AI decision：不做任何推論、分類、摘要
 *
 * 這個檔案本身不import、也不被Capability/Use Case/Application
 * Service三層任何一個import——本次任務明確禁止修改
 * Analysis/Recommendation Runner、直接操作Execution Runtime，也沒有
 * 被要求修改已經完成測試的既有Phase 3層（每一層各自的
 * validateXxxRequest()仍然是各自檔案內建、不匯出的獨立函式，維持
 * TASK1.60/1.61/1.62一路建立的「每一層邊界獨立、不互相重用驗證
 * 函式」的既有決策）。這裡的contract是提供給測試/未來使用的獨立、
 * 可驗證規格，用來確認三層「事實上」遵守同一份規則，而不是把三層
 * 重構成import這個檔案。
 */

export const ApplicationRequestContract = {
  name: 'ApplicationRequest',
  required: ['userId'],
  optional: ['options', 'requestId', 'version', 'timestamp', 'metadata'],
};

/**
 * 只驗證架構（userId是否存在且為非空字串、options存在時是否為物件），
 * 不驗證options的內部業務欄位、不驗證requestId/version/timestamp/
 * metadata的內容——跟
 * src/intelligence/contracts/execution/intelligence_request_contract.js
 * 的validateIntelligenceRequest()同樣的「只驗證架構，不驗證細節」
 * 哲學，也跟Capability/Use Case/Application Service三層各自內建的
 * validateXxxRequest()採用完全相同的規則。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
export function validateApplicationRequestContract(request) {
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

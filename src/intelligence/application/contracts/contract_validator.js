/*
 * Phase 3 TASK 1.63｜Intelligence Application Contract Layer
 * Foundation
 * - Contract Validator
 *
 * 把 application_request_contract.js / application_response_contract.js
 * 兩份純函式contract組裝成一個穩定、統一的驗證entry
 * point——`createContractValidator()`，提供`validateRequest(request)`/
 * `validateResponse(response)`兩個方法，回傳格式跟兩個contract檔案
 * 完全一致的`{ok:true}` / `{ok:false, reason, field?}`，這是規格
 * 要求的「contract result builder」：把驗證結果組成一致、可預期的
 * 形狀，不管呼叫的是request contract還是response contract，回傳
 * 的shape都一樣，呼叫端不需要分別知道兩個不同contract檔案內部各自
 * 的細節。
 *
 * 責任（規格明確列出，不多不少）：
 * - 定義 Application Request shape（透過
 *   application_request_contract.js）
 * - 定義 Application Response shape（透過
 *   application_response_contract.js）
 * - 驗證資料結構一致性（`validateRequest`/`validateResponse`）
 *
 * 明確要求（Contract Layer may call / must NOT call）：
 * - ✅ 只能呼叫同目錄的
 *   application_request_contract.js/application_response_contract.js
 *   兩個純函式contract
 * - ❌ 不直接存取 Database（不 import src/db/ 底下任何檔案，這個
 *   檔案完全不知道db是什麼）
 * - ❌ 不直接處理 Authentication（不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/，不知道「目前是誰登入」這件事）
 * - ❌ 不直接操作 Execution Runtime（不 import
 *   src/intelligence/execution/、src/intelligence/facade/、
 *   src/intelligence/service/、src/intelligence/orchestration/、
 *   src/intelligence/analysis/、src/intelligence/recommendation/、
 *   src/intelligence/data_preparation/、src/intelligence/history/、
 *   src/intelligence/metrics/、src/intelligence/events/、
 *   src/intelligence/governance/底下任何檔案）
 * - ❌ 不直接呼叫 Application Service/Use Case/Capability（不
 *   import ../application_service.js、../use_cases/、
 *   ../capabilities/底下任何檔案——這個Contract Layer是被動的
 *   純函式驗證工具，不是主動呼叫其他層的協調者，跟
 *   src/intelligence/contracts/execution/一樣，是「被上層拿去用」
 *   而不是「主動去呼叫上層」的角色）
 * - ❌ 不呼叫任何AI Provider/AI SDK——這一層完全不知道AI是什麼
 *
 * 這個檔案（以及整個contracts/目錄）目前**沒有被** application_
 * service.js/insight_use_case.js/insight_capability.js
 * import——本次任務明確禁止修改Analysis/Recommendation Runner、
 * 直接操作Execution Runtime，Implementation Scope也只要求「建立」
 * 這個目錄，沒有要求重構既有、已經各自通過測試的三層原始碼，維持
 * TASK1.55 Governance Layer同樣的邊界決策（「建立但不改變既有
 * execution behavior」）：Capability/Use Case/Application Service
 * 三層各自內建的validateXxxRequest()保持不變，這裡定義的contract
 * 是一份獨立、可驗證的規格，用來確認三層「事實上」遵守同一份規則
 * ——測試會直接呼叫這三層的真實函式並把它們的真實輸入/輸出餵給這裡
 * 的contract驗證，而不是修改三層去import這個檔案。
 */
import { validateApplicationRequestContract } from './application_request_contract.js';
import { validateApplicationResponseContract } from './application_response_contract.js';

/**
 * @param {object} [dependencies]
 * @param {(request:*) => {ok:boolean, reason?:string, field?:string}} [dependencies.requestValidator]
 * @param {(response:*) => {ok:boolean, reason?:string, field?:string}} [dependencies.responseValidator]
 * @returns {{
 *   validateRequest: (request:*) => {ok:true}|{ok:false, reason:string, field?:string},
 *   validateResponse: (response:*) => {ok:true}|{ok:false, reason:string, field?:string}
 * }}
 */
export function createContractValidator(dependencies) {
  dependencies = dependencies || {};
  const requestValidator = dependencies.requestValidator || validateApplicationRequestContract;
  const responseValidator = dependencies.responseValidator || validateApplicationResponseContract;

  /**
   * @param {*} request
   * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
   */
  function validateRequest(request) {
    return requestValidator(request);
  }

  /**
   * @param {*} response
   * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
   */
  function validateResponse(response) {
    return responseValidator(response);
  }

  return { validateRequest, validateResponse };
}

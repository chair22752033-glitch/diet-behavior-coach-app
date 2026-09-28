/*
 * Phase 6 TASK 1.118｜Health Insight User Identity Foundation
 * - Health Insight Request Context（Product Integration相容性準備）
 *
 * 責任：示範User Identity Context要怎麼附加到
 * `createHealthInsightProductIntegration().requestProductEntry()`
 * 既有的request形狀上——規格明確要求"Do not break current
 * API"，所以這裡**只組裝資料**，完全不呼叫Product
 * Integration本身，也完全沒有被`src/controllers/
 * health_insight_controller.js`（TASK1.116/1.117既有的
 * Response Boundary）呼叫——這是一個已經寫好、已經證明可行、
 * 但刻意還沒被接線的extension point（實際要不要在Controller層
 * 呼叫這裡，是未來任務的決定）。
 *
 * ## 兩種已經相容、不需要修改既有Product Entry/Contract/Adapter
 * 任何一行程式碼的附加方式（本次任務用測試證明兩種都真的可行）
 *
 * 1. **`options.identity`**（推薦，見`test_user_identity_foundation.mjs`
 *    的Health Insight compatibility章節）：Product Adapter
 *    （TASK1.100）本來就會把`productRequest.options`原樣轉交給
 *    Intelligence Feature（`{context, options}`），Health
 *    Insight Feature（TASK1.111）也只是原樣把`options`轉交給
 *    Capability Orchestrator——這條路徑完全是既有的"選填
 *    options passthrough"機制，不需要修改任何一層。
 * 2. **`request.user`**（規格原文示範的"Future direction"
 *    `requestProductEntry({user, rawInput})`形狀）：Product
 *    Entry（TASK1.99）的`validateProductEntryRequest()`只檢查
 *    `request.rawInput`/`request.userId`，完全不會因為多了一個
 *    沒看過的`request.user`欄位就拒絕請求——這個欄位今天已經可以
 *    安全存在，只是Product Entry/Adapter目前還不會讀取它（要
 *    真正讓Capability層"看到"使用者身份，需要未來任務明確決定
 *    要不要修改Adapter層的`buildIntelligenceRequest()`，本次
 *    任務明確不做這件事）。
 *
 * 兩種方式都**不會**把身份資訊直接送進Capability
 * Layer——`options.identity`/`request.user`都停在Product
 * Entry/Adapter這一層，除非未來任務刻意修改
 * `buildIntelligenceRequest()`把它併入`context`，否則
 * Analysis/Recommendation Runner永遠看不到這個欄位（延續規格
 * "Do not send OAuth details into Capability Layer"）。
 */
import { ANONYMOUS_IDENTITY, isValidUserIdentity } from './user_identity.js';

/**
 * 方式一：把身份附加到`options.identity`——今天已經可以安全
 * 使用，完全不需要修改Product Entry/Contract/Adapter。
 *
 * @param {{userId:string|null, authenticated:boolean, provider:string|null}} [identity]
 * @param {object} [options] - 既有的options內容（選填），原樣保留其餘欄位
 * @returns {object}
 */
export function attachIdentityToOptions(identity, options) {
  const safeIdentity = isValidUserIdentity(identity) ? identity : ANONYMOUS_IDENTITY;
  const safeOptions = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  return Object.assign({}, safeOptions, { identity: safeIdentity });
}

/**
 * 方式二：組出規格原文"Future direction"示範的
 * `{user, rawInput}`請求形狀——今天傳給未修改的
 * `requestProductEntry()`一樣完全不會出錯（多出來的`user`
 * 欄位被既有驗證邏輯忽略），只是Capability層目前還讀不到它。
 *
 * @param {object} params
 * @param {{userId:string|null, authenticated:boolean, provider:string|null}} [params.identity]
 * @param {object} params.rawInput
 * @param {object} [params.options]
 * @returns {{user:object, rawInput:object, options?:object}}
 */
export function buildHealthInsightProductRequest(params) {
  const safeParams = params && typeof params === 'object' ? params : {};
  const safeIdentity = isValidUserIdentity(safeParams.identity) ? safeParams.identity : ANONYMOUS_IDENTITY;
  const request = {
    user: safeIdentity,
    rawInput: safeParams.rawInput,
  };
  if (safeParams.options !== undefined) {
    request.options = safeParams.options;
  }
  return request;
}

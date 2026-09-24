/*
 * Phase 1 TASK 1.50｜Intelligence Execution Lifecycle Manager Foundation
 * - Intelligence Execution Manager
 *
 * 責任：在 Intelligence Facade（TASK1.48）跟 Intelligence Service
 * （TASK1.46）之間建立一個「執行生命週期管理」邊界——追蹤單次執行從
 * 開始到結束的狀態（initialized → running → completed/failed），
 * 把Service的呼叫細節、狀態轉換、成功/失敗結果標準化，全部封裝在這
 * 一層，Facade完全不需要知道底下是Service在跑、更不需要知道Service
 * 底下還有Execution Contract/Orchestrator/Pipeline。架構位置：
 *
 *   Intelligence Facade（TASK1.48）
 *     ↓
 *   Intelligence Execution Manager（這裡）── 管理執行生命週期狀態
 *     ↓
 *   Intelligence Service（TASK1.46）── 內部已用Execution Contract驗證
 *     ↓
 *   Intelligence Orchestrator（TASK1.45）
 *     ↓
 *   Intelligence Pipeline（Data Preparation/Analysis/Recommendation）
 *
 * 明確要求（Execution Manager may call / must NOT call）：
 * - ✅ 只能呼叫 Intelligence Service（透過依賴注入拿到的
 *   `service.getIntelligence()`）
 * - ❌ 不 import src/intelligence/orchestration/（不直接呼叫
 *   Orchestrator）
 * - ❌ 不 import src/intelligence/analysis/（不直接呼叫Analysis）
 * - ❌ 不 import src/intelligence/recommendation/（不直接呼叫
 *   Recommendation）
 * - ❌ 不 import src/intelligence/data_preparation/（不直接呼叫
 *   Data Preparation）
 * - ❌ 不 import src/db/ 底下任何檔案（不直接存取Database），這個
 *   檔案甚至不知道db的內部結構——db只是原樣轉交給
 *   service.getIntelligence()的不透明參數
 * - ❌ 不 import src/auth/ 或 src/identity/（不做任何身份驗證，
 *   userId一律由呼叫端當作request的欄位傳入）
 *
 * 生命週期狀態（見execution_state.js，固定四個，沒有其他狀態）：
 * 1. state = "initialized" —— execute()剛開始
 * 2. state = "running" —— 驗證輸入通過後，準備呼叫Service
 * 3. Service成功 → state = "completed"，回傳
 *    {ok:true, state:"completed", data:{status, result}}
 * 4. Service失敗（或依賴缺漏/輸入驗證失敗）→ state = "failed"，回傳
 *    {ok:false, state:"failed", reason}
 *
 * 每次`execute()`呼叫都是獨立的一次性生命週期，不跨呼叫共用狀態。
 * 狀態轉換本身透過選填的`dependencies.onStateChange(state)`依賴注入
 * 鉤子對外可觀察（供測試驗證轉換順序），不提供時完全不影響行為——
 * 這不是一個可以被外部輪詢的持久化狀態機，只是讓「這一次execute()
 * 呼叫依序經過了哪些狀態」變得可驗證。
 */
import { createExecutionResultBuilder } from './execution_result_builder.js';

/**
 * 驗證 execute() 的輸入——只檢查這一層自己需要知道的最小欄位
 * （input.request是否存在、request.userId是否為非空字串、
 * request.options存在時是否為物件），不解讀options的業務內容（那是
 * 更底層Service/Execution Contract的責任），也不解讀runtimeContext的
 * 內容（那是Runtime Context Layer/TASK1.49的責任，這裡只是原樣轉交）。
 *
 * @param {*} input
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateExecuteInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'invalid_input' };
  }
  const { request } = input;
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_request' };
  }
  if (typeof request.userId !== 'string' || request.userId.length === 0) {
    return { ok: false, reason: 'invalid_user_id' };
  }
  if (request.options !== undefined && (request.options === null || typeof request.options !== 'object' || Array.isArray(request.options))) {
    return { ok: false, reason: 'invalid_options_type' };
  }
  return { ok: true };
}

/**
 * @param {object} dependencies
 * @param {{getIntelligence: (db:object, request:{userId:string, options?:object}) => Promise<{ok:boolean, data?:object, reason?:string}>}} dependencies.service
 * @param {{buildCompletedResult: Function, buildFailedResult: Function}} [dependencies.resultBuilder]
 * @param {(state:string) => void} [dependencies.onStateChange] - 選填的
 *   狀態轉換觀察鉤子，每次狀態轉換（initialized/running/completed/
 *   failed）都會被呼叫一次，純粹用於觀察，不影響任何回傳值；不提供時
 *   完全不影響行為
 * @returns {{execute: (db:object, input:{request:{userId:string, options?:object}, runtimeContext?:object}) => Promise<{ok:true, state:"completed", data:{status:*, result:object}}|{ok:false, state:"failed", reason:string}>}}
 */
export function createExecutionManager(dependencies) {
  dependencies = dependencies || {};
  const { service, onStateChange } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createExecutionResultBuilder();

  function setState(next) {
    if (typeof onStateChange === 'function') {
      onStateChange(next);
    }
    return next;
  }

  /**
   * 管理單次Intelligence執行的生命週期：initialized → running →
   * （Service呼叫）→ completed/failed。任何一步失敗都立刻回傳
   * {ok:false, state:"failed", reason}，不會用不完整的資料頂替繼續
   * 執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給service.getIntelligence()
   * @param {{request:{userId:string, options?:object}, runtimeContext?:object}} input -
   *   `request`是業務請求（userId必填、options選填），`runtimeContext`
   *   （選填）是Facade建立的Runtime Context（TASK1.49），這裡完全不
   *   解讀其內容，只負責合併進轉交給Service的options.runtimeContext
   *   欄位
   * @returns {Promise<{ok:true, state:"completed", data:{status:string, result:{context:object, analysis:object, recommendation:object, metadata:object}}}|{ok:false, state:"failed", reason:string}>}
   */
  async function execute(db, input) {
    setState('initialized');

    const validation = validateExecuteInput(input);
    if (!validation.ok) {
      setState('failed');
      return resultBuilder.buildFailedResult(validation.reason);
    }

    const { request, runtimeContext } = input;

    setState('running');

    if (!service || typeof service.getIntelligence !== 'function') {
      setState('failed');
      return resultBuilder.buildFailedResult('service_unavailable');
    }

    const options = Object.assign({}, request.options, runtimeContext !== undefined ? { runtimeContext } : {});
    const outcome = await service.getIntelligence(db, { userId: request.userId, options });

    if (!outcome.ok) {
      setState('failed');
      return resultBuilder.buildFailedResult(outcome.reason);
    }

    setState('completed');
    return resultBuilder.buildCompletedResult(outcome.data);
  }

  return { execute };
}

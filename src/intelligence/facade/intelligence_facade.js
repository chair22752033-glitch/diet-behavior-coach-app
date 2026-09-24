/*
 * Phase 1 TASK 1.48｜Intelligence Application Facade Layer Foundation
 * （TASK1.49 起新增建立Runtime Context並跟request一起傳給Service）
 * - Intelligence Facade
 *
 * 責任：在未來的 Application Consumer 跟 Intelligence Service
 * （TASK1.46）之間再建立一層application-facing的穩定門面——呼叫端
 * 只需要知道 `executeIntelligence(db, request)` 這一個介面，完全不
 * 需要知道底下實際上是Service驗證request/options/response（TASK1.47
 * Execution Contract）、再呼叫Orchestrator（TASK1.45）協調Data
 * Preparation/Analysis/Recommendation。架構位置：
 *
 *   Application Consumer（未來的Controller/API/背景工作等）
 *     ↓
 *   Intelligence Facade（這裡）── 建立Runtime Context（TASK1.49）
 *     ↓
 *   Intelligence Service（TASK1.46）── 內部已用Execution Contract驗證
 *     ↓
 *   Intelligence Orchestrator（TASK1.45）
 *     ↓
 *   Intelligence Pipeline（Data Preparation/Analysis/Recommendation）
 *
 * 明確要求（Facade may call / must NOT call）：
 * - ✅ 只能呼叫 Intelligence Service（透過依賴注入拿到的
 *   `service.getIntelligence()`）
 * - ✅ 可以建立 Runtime Context（TASK1.49，
 *   `src/intelligence/runtime/`的`createRuntimeContext()`——純函式
 *   運算，不接受db參數、不做任何HTTP/AI呼叫）
 * - ❌ 不 import src/intelligence/orchestration/（不直接呼叫
 *   Orchestrator）
 * - ❌ 不 import src/intelligence/analysis/（不直接呼叫Analysis）
 * - ❌ 不 import src/intelligence/recommendation/（不直接呼叫
 *   Recommendation）
 * - ❌ 不 import src/intelligence/data_preparation/（不直接呼叫
 *   Data Preparation）
 * - ❌ 不 import src/services/ 底下任何檔案（不直接呼叫Domain
 *   Service）
 * - ❌ 不 import src/db/ 底下任何檔案（不直接存取Database），這個
 *   檔案甚至不知道db的內部結構——db只是原樣轉交給
 *   service.getIntelligence()的不透明參數
 *
 * 其他既有規則（跟Intelligence Service/Orchestrator一致）：
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/ 或 src/identity/，
 *   userId 一律由呼叫端當作request的欄位傳入，這裡完全不知道「目前
 *   是誰登入」這件事（本次任務明確把「未來authorization/context
 *   整合點」這件事留給後續任務，這裡完全不實作任何授權邏輯）
 *
 * validateFacadeInput() 是這個檔案內建、自成一格的驗證函式，刻意不
 * import src/intelligence/contracts/execution/的validateIntelligenceRequest()
 * ——跟TASK1.44 recommendation_runner.js刻意不重用
 * src/intelligence/contracts.js同樣的邊界決策：讓Facade完全獨立於
 * Execution Contract Layer未來的形狀演進，只依賴Service這一個下游
 * 介面，維持「每一層只認識自己呼叫的下一層」的架構原則。
 *
 * TASK1.49新增：驗證完facade輸入之後，呼叫
 * createRuntimeContext({userId, requestId, version, timestamp,
 * metadata})（都取自request，缺少的欄位由runtime_context_builder.js
 * 套用固定預設值）建立Runtime Context，驗證失敗時立刻回傳失敗結果。
 * 建立成功後，Runtime Context會合併進轉交給Service的
 * `options.runtimeContext`欄位——`options`本來就是Execution
 * Contract（TASK1.47）允許帶有未知額外欄位的自由欄位，所以完全不需要
 * 修改intelligence_service.js/Execution Contract/Orchestrator/
 * Analysis/Recommendation/Data Preparation任何一行邏輯，這幾層仍然
 * 完全不知道Runtime Context這個概念存在，對既有pipeline行為零影響。
 */
import { createFacadeResultBuilder } from './facade_result_builder.js';
import { createRuntimeContext } from '../runtime/index.js';

/**
 * 驗證 executeIntelligence() 的 request 輸入——只檢查這一層自己需要
 * 知道的最小欄位（userId是否為非空字串、options存在時是否為物件），
 * 不解讀options的業務內容（那是更底層Service/Execution Contract的
 * 責任）。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateFacadeInput(request) {
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
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{executeIntelligence: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, data:{status:*, result:object, metadata:*}}|{ok:false, reason:string}>}}
 */
export function createIntelligenceFacade(dependencies) {
  dependencies = dependencies || {};
  const { service } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createFacadeResultBuilder();

  /**
   * Application Consumer唯一需要呼叫的入口：驗證facade輸入 → 建立
   * Runtime Context（TASK1.49）→ 呼叫Intelligence Service（唯一允許
   * 呼叫的下一層，Runtime Context跟request一起傳遞）→ 回傳穩定的
   * facade結果格式。任何一步失敗都立刻回傳{ok:false, reason}，不會用
   * 不完整的資料頂替繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給service.getIntelligence()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request -
   *   Application Consumer傳入的請求物件，`userId`一律是已經確認過的
   *   使用者id，`options`（選填）原樣轉交給Service（這裡完全不解讀其
   *   內容），`requestId`/`version`/`timestamp`/`metadata`（皆選填）
   *   用來建立Runtime Context，缺少時由runtime_context_builder.js
   *   套用固定預設值
   * @returns {Promise<{ok:true, data:{status:string, result:{context:object, analysis:object, recommendation:object}, metadata:object}}|{ok:false, reason:string}>}
   */
  async function executeIntelligence(db, request) {
    const validation = validateFacadeInput(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(validation.reason);
    }

    const runtimeContextOutcome = createRuntimeContext({
      userId: request.userId,
      requestId: request.requestId,
      version: request.version,
      timestamp: request.timestamp,
      metadata: request.metadata,
    });
    if (!runtimeContextOutcome.ok) {
      return resultBuilder.buildFailureResult(runtimeContextOutcome.reason);
    }

    if (!service || typeof service.getIntelligence !== 'function') {
      return resultBuilder.buildFailureResult('service_unavailable');
    }

    const options = Object.assign({}, request.options, { runtimeContext: runtimeContextOutcome.context });
    const outcome = await service.getIntelligence(db, { userId: request.userId, options });
    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(outcome.reason);
    }

    return resultBuilder.buildSuccessResult(outcome.data);
  }

  return { executeIntelligence };
}

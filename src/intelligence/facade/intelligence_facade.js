/*
 * Phase 1 TASK 1.48｜Intelligence Application Facade Layer Foundation
 * （TASK1.49 起新增建立Runtime Context；TASK1.50 起改為呼叫Execution
 * Manager，不再直接呼叫Intelligence Service）
 * - Intelligence Facade
 *
 * 責任：在未來的 Application Consumer 跟 Intelligence Execution
 * Manager（TASK1.50）之間建立一個application-facing的穩定門面——
 * 呼叫端只需要知道 `executeIntelligence(db, request)` 這一個介面，
 * 完全不需要知道底下實際上是Execution Manager管理執行生命週期、呼叫
 * Service驗證request/options/response（TASK1.47 Execution Contract）、
 * 再呼叫Orchestrator（TASK1.45）協調Data Preparation/Analysis/
 * Recommendation。架構位置：
 *
 *   Application Consumer（未來的Controller/API/背景工作等）
 *     ↓
 *   Intelligence Facade（這裡）── 建立Runtime Context（TASK1.49）
 *     ↓
 *   Intelligence Execution Manager（TASK1.50）── 管理執行生命週期狀態
 *     ↓
 *   Intelligence Service（TASK1.46）── 內部已用Execution Contract驗證
 *     ↓
 *   Intelligence Orchestrator（TASK1.45）
 *     ↓
 *   Intelligence Pipeline（Data Preparation/Analysis/Recommendation）
 *
 * 明確要求（Facade may call / must NOT call）：
 * - ✅ 只能呼叫 Intelligence Execution Manager（透過依賴注入拿到的
 *   `executionManager.execute()`）
 * - ✅ 可以建立 Runtime Context（TASK1.49，
 *   `src/intelligence/runtime/`的`createRuntimeContext()`——純函式
 *   運算，不接受db參數、不做任何HTTP/AI呼叫）
 * - ❌ 不直接呼叫 Intelligence Service（TASK1.50起明確禁止——這裡
 *   完全不 import src/intelligence/service/，也完全不持有`service`
 *   依賴，一律透過Execution Manager間接呼叫）
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
 *   executionManager.execute()的不透明參數
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
 * Execution Contract Layer未來的形狀演進，只依賴Execution Manager
 * 這一個下游介面，維持「每一層只認識自己呼叫的下一層」的架構原則。
 *
 * TASK1.49新增：驗證完facade輸入之後，呼叫
 * createRuntimeContext({userId, requestId, version, timestamp,
 * metadata})（都取自request，缺少的欄位由runtime_context_builder.js
 * 套用固定預設值）建立Runtime Context，驗證失敗時立刻回傳失敗結果。
 *
 * TASK1.50新增：建立Runtime Context成功後，改為呼叫
 * `executionManager.execute(db, {request:{userId, options},
 * runtimeContext})`（**取代**原本直接呼叫`service.getIntelligence()`）
 * ——Runtime Context跟業務request一起、以`{request, runtimeContext}`
 * 的形狀傳給Execution Manager，由Execution Manager負責把
 * runtimeContext合併進轉交給Service的options.runtimeContext欄位（這
 * 部分邏輯從Facade下移到Execution Manager）。Execution Manager成功時
 * 回傳{ok:true, state:'completed', data:{status, result}}，這裡把
 * `data.result`攤平回`{status, context, analysis, recommendation,
 * metadata}`平面形狀，再交給既有的facade_result_builder.js（**完全
 * 沒有修改**）組出跟以前完全相同的對外格式——executeIntelligence()
 * 對Application Consumer暴露的回傳格式因此保持100%不變，只有內部
 * 呼叫路徑從「Facade直接呼叫Service」改成「Facade呼叫Execution
 * Manager，Execution Manager呼叫Service」。
 */
import { createFacadeResultBuilder } from './facade_result_builder.js';
import { createRuntimeContext } from '../runtime/index.js';

/**
 * 驗證 executeIntelligence() 的 request 輸入——只檢查這一層自己需要
 * 知道的最小欄位（userId是否為非空字串、options存在時是否為物件），
 * 不解讀options的業務內容（那是更底層Execution Manager/Service/
 * Execution Contract的責任）。
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
 * @param {{execute: (db:object, input:{request:{userId:string, options?:object}, runtimeContext?:object}) => Promise<{ok:boolean, state:string, data?:object, reason?:string}>}} dependencies.executionManager
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{executeIntelligence: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, data:{status:*, result:object, metadata:*}}|{ok:false, reason:string}>}}
 */
export function createIntelligenceFacade(dependencies) {
  dependencies = dependencies || {};
  const { executionManager } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createFacadeResultBuilder();

  /**
   * Application Consumer唯一需要呼叫的入口：驗證facade輸入 → 建立
   * Runtime Context（TASK1.49）→ 呼叫Intelligence Execution
   * Manager（TASK1.50，唯一允許呼叫的下一層，Runtime Context跟
   * request一起傳遞）→ 回傳穩定的facade結果格式。任何一步失敗都立刻
   * 回傳{ok:false, reason}，不會用不完整的資料頂替繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給executionManager.execute()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request -
   *   Application Consumer傳入的請求物件，`userId`一律是已經確認過的
   *   使用者id，`options`（選填）原樣轉交給Execution Manager（這裡
   *   完全不解讀其內容），`requestId`/`version`/`timestamp`/
   *   `metadata`（皆選填）用來建立Runtime Context，缺少時由
   *   runtime_context_builder.js套用固定預設值
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

    if (!executionManager || typeof executionManager.execute !== 'function') {
      return resultBuilder.buildFailureResult('execution_manager_unavailable');
    }

    const outcome = await executionManager.execute(db, {
      request: { userId: request.userId, options: request.options },
      runtimeContext: runtimeContextOutcome.context,
    });
    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(outcome.reason);
    }

    const flatData = Object.assign({ status: outcome.data.status }, outcome.data.result);
    return resultBuilder.buildSuccessResult(flatData);
  }

  return { executeIntelligence };
}

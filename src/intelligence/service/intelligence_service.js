/*
 * Phase 1 TASK 1.46｜Intelligence Application Service Layer Foundation
 * - Intelligence Service
 *
 * 責任：在未來的 Application/API Layer 跟 Intelligence Orchestrator
 * （TASK1.45）之間建立一個穩定的應用邊界——呼叫端只需要知道
 * `getIntelligence(db, request)` 這一個介面，完全不需要知道底下
 * 實際上是由 Orchestrator 協調 Data Preparation → Insight Context →
 * Analysis → Recommendation 四個階段組成。架構位置：
 *
 *   Application Layer（未來的Controller/API）
 *     ↓
 *   Intelligence Service（這裡）
 *     ↓
 *   Intelligence Orchestrator（TASK1.45）
 *     ↓
 *   Data Preparation / Analysis / Recommendation（TASK1.41/1.43/1.44）
 *
 * 明確要求：
 * - No direct Data Preparation call：完全不 import
 *   src/intelligence/data_preparation/
 * - No direct Analysis call：完全不 import src/intelligence/analysis/
 * - No direct Recommendation call：完全不 import
 *   src/intelligence/recommendation/
 * - No direct Domain Service access：完全不 import src/services/
 *   底下任何檔案
 * - No SQL：完全不 import src/db/ 底下任何檔案，這個檔案甚至不知道
 *   db的內部結構——db只是原樣轉交給orchestrator.runIntelligencePipeline()
 *   的不透明參數
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/ 或 src/identity/，
 *   userId 一律由呼叫端（未來的Controller/API Layer）當作request的
 *   欄位傳入，這裡完全不知道「目前是誰登入」這件事
 *
 * 只呼叫 Intelligence Orchestrator（透過依賴注入拿到的
 * `orchestrator.runIntelligencePipeline()`），不繞過它直接呼叫任何
 * 更底層的Phase 2子層。
 */
import { createServiceResultBuilder } from './service_result_builder.js';

/**
 * 驗證 getIntelligence() 的 request 輸入——只檢查這一層自己需要知道的
 * 最小欄位（userId 是否為非空字串），不解讀 options 的內容（options
 * 完全原樣轉交給 Orchestrator，由更底層的子層決定怎麼使用）。
 *
 * @param {*} request
 * @returns {{ok:boolean, reason?:string}}
 */
function validateRequest(request) {
  if (!request || typeof request !== 'object') {
    return { ok: false, reason: 'invalid_request' };
  }
  if (typeof request.userId !== 'string' || request.userId.length === 0) {
    return { ok: false, reason: 'invalid_user_id' };
  }
  return { ok: true };
}

/**
 * @param {object} dependencies
 * @param {{runIntelligencePipeline: (db:object, userId:string, options?:object) => Promise<{ok:boolean, status:string, reason?:string, field?:string, data:{result:object}|null}>}} dependencies.orchestrator
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{getIntelligence: (db:object, request:{userId:string, options?:object}) => Promise<{ok:true, data:object}|{ok:false, reason:string}>}}
 */
export function createIntelligenceService(dependencies) {
  dependencies = dependencies || {};
  const { orchestrator } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createServiceResultBuilder();

  /**
   * 應用層唯一需要呼叫的入口：驗證輸入 → 呼叫 Intelligence Orchestrator
   * → 回傳穩定的服務層結果格式。任何一步失敗都立刻回傳
   * {ok:false, reason}，不會用不完整的資料頂替繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給
   *   orchestrator.runIntelligencePipeline()
   * @param {{userId:string, options?:object}} request - 應用層傳入的
   *   請求物件，`userId` 一律是已經確認過的使用者id，`options`
   *   （選填）原樣轉交給Orchestrator，這裡完全不解讀其內容
   * @returns {Promise<{ok:true, data:{status:string, context:object, analysis:object, recommendation:object, metadata:object}}|{ok:false, reason:string}>}
   */
  async function getIntelligence(db, request) {
    const validation = validateRequest(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(validation.reason);
    }

    if (!orchestrator || typeof orchestrator.runIntelligencePipeline !== 'function') {
      return resultBuilder.buildFailureResult('orchestrator_unavailable');
    }

    const outcome = await orchestrator.runIntelligencePipeline(db, request.userId, request.options);
    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(outcome.reason);
    }

    return resultBuilder.buildSuccessResult(outcome.data.result);
  }

  return { getIntelligence };
}

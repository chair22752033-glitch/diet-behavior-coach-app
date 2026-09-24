/*
 * Phase 3 TASK 1.60｜Intelligence Application Service Boundary
 * Foundation
 * - Intelligence Application Service
 *
 * 責任：在未來的 User Application（Controller/API/背景工作等，
 * TASK1.59規劃、目前尚未建立）跟 Intelligence Facade（TASK1.48）
 * 之間建立一個application-facing的服務邊界——呼叫端只需要知道
 * `requestIntelligence(db, request)` 這一個介面，完全不需要知道
 * 底下實際上是Facade建立Runtime Context、呼叫Execution Manager
 * 管理生命週期、呼叫Service驗證、呼叫Orchestrator協調Pipeline。
 * 架構位置（規格原文）：
 *
 *   Application Service（這裡）
 *     ↓
 *   Intelligence Facade（TASK1.48）
 *     ↓
 *   Intelligence Service（TASK1.46）
 *     ↓
 *   Execution Runtime（Execution Manager，TASK1.50）
 *     ↓
 *   Analysis / Recommendation（TASK1.43/1.44）
 *
 * Application Service只負責四件事（規格明確列出，不多不少）：
 * - 接收 application request
 * - 驗證 application input
 * - 呼叫 Intelligence Facade
 * - 包裝 application response
 *
 * 明確要求（Application Service may call / must NOT call）：
 * - ✅ 只能呼叫 Intelligence Facade（透過依賴注入拿到的
 *   `facade.executeIntelligence()`）
 * - ❌ 不直接呼叫 Execution Manager（不 import
 *   src/intelligence/execution/，不持有`executionManager`依賴——
 *   一律透過Facade間接呼叫，這是規格明確禁止的捷徑
 *   「Application Service → Execution Manager」）
 * - ❌ 不直接存取 History Store（不 import
 *   src/intelligence/history/，不持有`historyStore`依賴）
 * - ❌ 不直接存取 Metrics Store（不 import
 *   src/intelligence/metrics/，不持有`metricsStore`依賴）
 * - ❌ 不直接使用 Event Dispatcher（不 import
 *   src/intelligence/events/，不持有`eventDispatcher`依賴）
 * - ❌ 不直接存取 Database（不 import src/db/ 底下任何檔案，這個
 *   檔案甚至不知道db的內部結構——db只是原樣轉交給
 *   facade.executeIntelligence()的不透明參數，這是規格明確禁止的
 *   捷徑「Application Service → Database」）
 * - ❌ 不 import src/intelligence/service/、
 *   src/intelligence/orchestration/、src/intelligence/analysis/、
 *   src/intelligence/recommendation/、
 *   src/intelligence/data_preparation/、
 *   src/intelligence/governance/（不繞過Facade直接呼叫任何更底層
 *   的Intelligence子層）
 * - ❌ 不 import src/services/ 底下任何檔案（不直接呼叫Domain
 *   Service）
 * - ❌ 不呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
 *   「Application Service → AI Provider」——這一層完全不知道AI是
 *   什麼，AI只可能在更底層的Analysis/Recommendation Extension
 *   Point被注入，跟Application Service完全無關）
 *
 * 其他既有規則（跟Facade/Service/Orchestrator一致）：
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/，userId 一律由呼叫端當作
 *   request的欄位傳入，這裡完全不知道「目前是誰登入」這件事
 *
 * validateApplicationRequest() 是這個檔案內建、自成一格的驗證函式，
 * 刻意不import Facade內部的validateFacadeInput()（那個函式本來就
 * 沒有被export出來）、也不import Execution Contract的
 * validateIntelligenceRequest()——跟TASK1.48
 * intelligence_facade.js刻意不重用Execution Contract、TASK1.44
 * recommendation_runner.js刻意不重用contracts.js同樣的邊界決策：
 * 讓Application Service完全獨立於Facade/Execution Contract未來的
 * 形狀演進，只依賴Facade這一個下游介面，維持「每一層只認識自己
 * 呼叫的下一層」的架構原則。
 */
import { createApplicationResultBuilder } from './application_result_builder.js';

/**
 * 驗證 requestIntelligence() 的 request 輸入——只檢查這一層自己
 * 需要知道的最小欄位（userId是否為非空字串、options存在時是否為
 * 物件），不解讀options的業務內容（那是更底層Facade/Execution
 * Manager/Service/Execution Contract的責任）。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateApplicationRequest(request) {
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
 * @param {{executeIntelligence: (db:object, request:object) => Promise<{ok:boolean, data?:object, reason?:string}>}} dependencies.facade
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{requestIntelligence: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, data:{status:*, result:*, metadata:*}}|{ok:false, reason:string}>}}
 */
export function createApplicationService(dependencies) {
  dependencies = dependencies || {};
  const { facade } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createApplicationResultBuilder();

  /**
   * Application Consumer唯一需要呼叫的入口：驗證application輸入 →
   * 呼叫Intelligence Facade（唯一允許呼叫的下一層）→ 回傳穩定的
   * application結果格式。任何一步失敗都立刻回傳{ok:false, reason}，
   * 不會用不完整的資料頂替繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給facade.executeIntelligence()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request -
   *   Application Consumer傳入的請求物件，原樣轉交給Facade，這裡
   *   完全不解讀options的業務內容
   * @returns {Promise<{ok:true, data:{status:*, result:*, metadata:*}}|{ok:false, reason:string}>}
   */
  async function requestIntelligence(db, request) {
    const validation = validateApplicationRequest(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(validation.reason);
    }

    if (!facade || typeof facade.executeIntelligence !== 'function') {
      return resultBuilder.buildFailureResult('facade_unavailable');
    }

    const outcome = await facade.executeIntelligence(db, request);
    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(outcome.reason);
    }

    return resultBuilder.buildSuccessResult(outcome.data);
  }

  return { requestIntelligence };
}

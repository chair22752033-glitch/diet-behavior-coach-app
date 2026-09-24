/*
 * Phase 3 TASK 1.61｜Intelligence Application Use Case Layer
 * Foundation
 * - Insight Use Case
 *
 * 責任：在未來的 User Application 跟 Application Service（TASK1.60）
 * 之間建立一個Use Case邊界——呼叫端只需要知道
 * `requestUserInsight(db, request)`這一個Application Scenario，完全
 * 不需要知道底下實際上是Application Service驗證input、呼叫
 * Intelligence Facade、Facade建立Runtime Context、呼叫Execution
 * Manager管理生命週期。
 *
 * 架構位置（規格原文）：
 *
 *   User Application
 *     ↓
 *   Use Case Layer（這裡）
 *     ↓
 *   Application Service（TASK1.60）
 *     ↓
 *   Intelligence Facade（TASK1.48）
 *     ↓
 *   Intelligence Runtime
 *
 * Use Case Layer只負責三件事（規格明確列出，不多不少）：
 * - 定義 Application Scenario（這裡是「取得使用者的Insight」這個
 *   場景，`USE_CASE_NAME = 'insight'`）
 * - 組合 Application Service 呼叫
 * - 包裝 Use Case Result
 *
 * 明確要求（Use Case Layer may call / must NOT call）：
 * - ✅ 只能呼叫 Application Service（透過依賴注入拿到的
 *   `applicationService.requestIntelligence()`）
 * - ❌ 不直接呼叫 Intelligence Facade（不 import
 *   src/intelligence/facade/，不持有`facade`依賴——一律透過
 *   Application Service間接呼叫，維持「User Application只透過
 *   Use Case Layer使用Intelligence，Use Case Layer只透過
 *   Application Service使用Intelligence」這條單向鏈）
 * - ❌ 不直接呼叫 Execution Manager（不 import
 *   src/intelligence/execution/，不持有`executionManager`依賴——
 *   這是規格明確禁止的捷徑「Use Case → Execution Manager」）
 * - ❌ 不直接存取 History Store（不 import
 *   src/intelligence/history/，不持有`historyStore`依賴）
 * - ❌ 不直接存取 Metrics Store（不 import
 *   src/intelligence/metrics/，不持有`metricsStore`依賴）
 * - ❌ 不直接使用 Event Dispatcher（不 import
 *   src/intelligence/events/，不持有`eventDispatcher`依賴）
 * - ❌ 不直接存取 Database（不 import src/db/ 底下任何檔案，這個
 *   檔案甚至不知道db的內部結構——db只是原樣轉交給
 *   applicationService.requestIntelligence()的不透明參數，這是規格
 *   明確禁止的捷徑「Use Case → Database」）
 * - ❌ 不 import src/intelligence/service/、
 *   src/intelligence/orchestration/、src/intelligence/analysis/、
 *   src/intelligence/recommendation/、
 *   src/intelligence/data_preparation/、
 *   src/intelligence/governance/（不繞過Application Service直接
 *   呼叫任何更底層的Intelligence子層）
 * - ❌ 不 import src/services/ 底下任何檔案（不直接呼叫Domain
 *   Service）
 * - ❌ 不呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
 *   「Use Case → AI Provider」——這一層完全不知道AI是什麼，AI只可能
 *   在更底層的Analysis/Recommendation Extension Point被注入，跟
 *   Use Case Layer完全無關）
 *
 * 其他既有規則（跟Application Service/Facade/Service/Orchestrator
 * 一致）：
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/，userId 一律由呼叫端當作
 *   request的欄位傳入，這裡完全不知道「目前是誰登入」這件事
 *
 * validateUseCaseRequest() 是這個檔案內建、自成一格的驗證函式，刻意
 * 不import Application Service內部的validateApplicationRequest()
 * （那個函式本來就沒有被export出來）、也不import Facade/Execution
 * Contract的驗證函式——跟TASK1.60 application_service.js刻意不重用
 * Facade內部驗證函式、TASK1.48 intelligence_facade.js刻意不重用
 * Execution Contract同樣的邊界決策，讓Use Case Layer完全獨立於
 * Application Service/Facade/Execution Contract未來的形狀演進，只
 * 依賴Application Service這一個下游介面，維持「每一層只認識自己
 * 呼叫的下一層」的架構原則。
 */
import { createUseCaseResultBuilder } from './use_case_result_builder.js';

const USE_CASE_NAME = 'insight';

/**
 * 驗證 requestUserInsight() 的 request 輸入——只檢查這一層自己需要
 * 知道的最小欄位（userId是否為非空字串、options存在時是否為物件），
 * 不解讀options的業務內容（那是更底層Application Service/Facade/
 * Execution Manager/Service/Execution Contract的責任）。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateUseCaseRequest(request) {
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
 * @param {{requestIntelligence: (db:object, request:object) => Promise<{ok:boolean, data?:object, reason?:string}>}} dependencies.applicationService
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{requestUserInsight: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, useCase:string, data:{status:*, result:*, metadata:*}}|{ok:false, useCase:string, reason:string}>}}
 */
export function createInsightUseCase(dependencies) {
  dependencies = dependencies || {};
  const { applicationService } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createUseCaseResultBuilder();

  /**
   * User Application唯一需要呼叫的「取得使用者Insight」場景入口：
   * 驗證use case輸入 → 呼叫Application Service（唯一允許呼叫的下一
   * 層）→ 回傳穩定的use case結果格式。任何一步失敗都立刻回傳
   * {ok:false, useCase, reason}，不會用不完整的資料頂替繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給
   *   applicationService.requestIntelligence()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request -
   *   User Application傳入的請求物件，原樣轉交給Application Service，
   *   這裡完全不解讀options的業務內容
   * @returns {Promise<{ok:true, useCase:string, data:{status:*, result:*, metadata:*}}|{ok:false, useCase:string, reason:string}>}
   */
  async function requestUserInsight(db, request) {
    const validation = validateUseCaseRequest(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(USE_CASE_NAME, validation.reason);
    }

    if (!applicationService || typeof applicationService.requestIntelligence !== 'function') {
      return resultBuilder.buildFailureResult(USE_CASE_NAME, 'application_service_unavailable');
    }

    const outcome = await applicationService.requestIntelligence(db, request);
    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(USE_CASE_NAME, outcome.reason);
    }

    return resultBuilder.buildSuccessResult(USE_CASE_NAME, outcome.data);
  }

  return { requestUserInsight };
}

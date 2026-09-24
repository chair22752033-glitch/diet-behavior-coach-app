/*
 * Phase 3 TASK 1.62｜Intelligence Application Capability Layer
 * Foundation
 * - Insight Capability
 *
 * 責任：在未來的 User Application 跟 Use Case Layer（TASK1.61）
 * 之間建立一個Capability邊界——呼叫端只需要知道
 * `requestInsightCapability(db, request)`這一個穩定的Capability
 * entry point，完全不需要知道底下實際上是Use Case Layer定義
 * Application Scenario、呼叫Application Service驗證input、呼叫
 * Facade建立Runtime Context、呼叫Execution Manager管理生命週期。
 *
 * 架構位置（規格原文）：
 *
 *   User Application
 *     ↓
 *   Capability Layer（這裡）
 *     ↓
 *   Use Case Layer（TASK1.61）
 *     ↓
 *   Application Service（TASK1.60）
 *     ↓
 *   Intelligence Facade（TASK1.48）
 *     ↓
 *   Intelligence Runtime
 *
 * Capability Layer只負責三件事（規格明確列出，不多不少）：
 * - 定義 Intelligence Application 能力分類（這裡是「Insight」這個
 *   能力分類，`CAPABILITY_NAME = 'insight'`）
 * - 組合對應 Use Case（透過依賴注入拿到的
 *   `useCase.requestUserInsight()`）
 * - 提供穩定 capability entry point
 *
 * 明確要求（Capability Layer may call / must NOT call）：
 * - ✅ 只能呼叫對應的 Use Case（透過依賴注入拿到的
 *   `useCase.requestUserInsight()`）
 * - ❌ 不直接呼叫 Application Service（不 import
 *   src/intelligence/application/application_service.js，不持有
 *   `applicationService`依賴——一律透過Use Case Layer間接呼叫，
 *   維持「User Application只透過Capability Layer使用
 *   Intelligence，Capability Layer只透過Use Case Layer使用
 *   Intelligence」這條單向鏈）
 * - ❌ 不直接呼叫 Intelligence Facade（不 import
 *   src/intelligence/facade/，不持有`facade`依賴）
 * - ❌ 不直接呼叫 Execution Manager（不 import
 *   src/intelligence/execution/，不持有`executionManager`依賴——
 *   這是規格明確禁止的捷徑「Capability → Execution Manager」）
 * - ❌ 不直接存取 History Store（不 import
 *   src/intelligence/history/，不持有`historyStore`依賴）
 * - ❌ 不直接存取 Metrics Store（不 import
 *   src/intelligence/metrics/，不持有`metricsStore`依賴）
 * - ❌ 不直接使用 Event Dispatcher（不 import
 *   src/intelligence/events/，不持有`eventDispatcher`依賴）
 * - ❌ 不直接存取 Database（不 import src/db/ 底下任何檔案，這個
 *   檔案甚至不知道db的內部結構——db只是原樣轉交給
 *   useCase.requestUserInsight()的不透明參數，這是規格明確禁止的
 *   捷徑「Capability → Database」）
 * - ❌ 不 import src/intelligence/service/、
 *   src/intelligence/orchestration/、src/intelligence/analysis/、
 *   src/intelligence/recommendation/、
 *   src/intelligence/data_preparation/、
 *   src/intelligence/governance/（不繞過Use Case Layer直接呼叫任何
 *   更底層的Intelligence子層）
 * - ❌ 不 import src/services/ 底下任何檔案（不直接呼叫Domain
 *   Service）
 * - ❌ 不呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
 *   「Capability → AI Provider」——這一層完全不知道AI是什麼，AI只
 *   可能在更底層的Analysis/Recommendation Extension Point被注入，
 *   跟Capability Layer完全無關）
 *
 * 其他既有規則（跟Use Case Layer/Application Service/Facade/
 * Service/Orchestrator一致）：
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/，userId 一律由呼叫端當作
 *   request的欄位傳入，這裡完全不知道「目前是誰登入」這件事
 *
 * validateCapabilityRequest() 是這個檔案內建、自成一格的驗證函式，
 * 刻意不import Use Case Layer內部的validateUseCaseRequest()（那個
 * 函式本來就沒有被export出來）、也不import Application Service/
 * Facade/Execution Contract的驗證函式——跟TASK1.61
 * insight_use_case.js刻意不重用Application Service內部驗證函式、
 * TASK1.60 application_service.js刻意不重用Facade內部驗證函式同樣
 * 的邊界決策，讓Capability Layer完全獨立於Use Case Layer/
 * Application Service/Facade未來的形狀演進，只依賴Use Case Layer
 * 這一個下游介面，維持「每一層只認識自己呼叫的下一層」的架構原則。
 */
import { createCapabilityResultBuilder } from './capability_result_builder.js';

const CAPABILITY_NAME = 'insight';

/**
 * 驗證 requestInsightCapability() 的 request 輸入——只檢查這一層
 * 自己需要知道的最小欄位（userId是否為非空字串、options存在時是否
 * 為物件），不解讀options的業務內容（那是更底層Use Case Layer/
 * Application Service/Facade/Execution Manager/Service/Execution
 * Contract的責任）。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateCapabilityRequest(request) {
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
 * @param {{requestUserInsight: (db:object, request:object) => Promise<{ok:boolean, useCase?:string, data?:object, reason?:string}>}} dependencies.useCase
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{requestInsightCapability: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, capability:string, data:{status:*, result:*, metadata:*}}|{ok:false, capability:string, reason:string}>}}
 */
export function createInsightCapability(dependencies) {
  dependencies = dependencies || {};
  const { useCase } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createCapabilityResultBuilder();

  /**
   * User Application唯一需要呼叫的「Insight能力」進入點：驗證
   * capability輸入 → 呼叫Use Case Layer（唯一允許呼叫的下一層）→
   * 回傳穩定的capability結果格式。任何一步失敗都立刻回傳
   * {ok:false, capability, reason}，不會用不完整的資料頂替繼續
   * 執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給
   *   useCase.requestUserInsight()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request -
   *   User Application傳入的請求物件，原樣轉交給Use Case Layer，
   *   這裡完全不解讀options的業務內容
   * @returns {Promise<{ok:true, capability:string, data:{status:*, result:*, metadata:*}}|{ok:false, capability:string, reason:string}>}
   */
  async function requestInsightCapability(db, request) {
    const validation = validateCapabilityRequest(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(CAPABILITY_NAME, validation.reason);
    }

    if (!useCase || typeof useCase.requestUserInsight !== 'function') {
      return resultBuilder.buildFailureResult(CAPABILITY_NAME, 'use_case_unavailable');
    }

    const outcome = await useCase.requestUserInsight(db, request);
    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(CAPABILITY_NAME, outcome.reason);
    }

    return resultBuilder.buildSuccessResult(CAPABILITY_NAME, outcome.data);
  }

  return { requestInsightCapability };
}

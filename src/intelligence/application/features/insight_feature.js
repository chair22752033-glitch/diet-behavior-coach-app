/*
 * Phase 3 TASK 1.65｜Intelligence Application Feature Entry
 * Foundation
 * - Insight Feature
 *
 * 責任：這是Phase 3第一個完整的Intelligence Application Feature
 * Entry Flow——驗證Phase 3 Application Architecture（TASK1.60~1.64
 * 建立的Application Service/Use Case/Capability/Contract/Workflow
 * 五層）可以承載真正的Intelligence Feature Flow，不只是各自獨立
 * 通過測試的孤立extension point。呼叫端只需要知道
 * `requestInsightFeature(db, featureRequest)`這一個Feature Entry，
 * 完全不需要知道底下實際上是先把Feature Request映射成Application
 * Request、再呼叫Workflow、Workflow驗證Contract後呼叫Capability、
 * Capability呼叫Use Case、Use Case呼叫Application Service、
 * Application Service呼叫Intelligence Facade、最後才真正執行
 * Runtime。
 *
 * 架構位置（規格原文）：
 *
 *   User Feature Request
 *     ↓
 *   Feature Layer（這裡）
 *     ↓
 *   Workflow（TASK1.64）
 *     ↓
 *   Capability（TASK1.62）
 *     ↓
 *   Use Case（TASK1.61）
 *     ↓
 *   Application Service（TASK1.60）
 *     ↓
 *   Intelligence Facade（TASK1.48）
 *     ↓
 *   Runtime
 *
 * Feature Layer只負責四件事（規格明確列出，不多不少）：
 * - 定義 Intelligence Feature Entry（`requestInsightFeature()`這一
 *   個具名Feature，`FEATURE_NAME = 'insight'`）
 * - 建立 Feature Request mapping（`mapFeatureRequestToApplicationRequest()`
 *   ——把Feature Request明確重新組裝成Application Request，只挑選
 *   已知欄位，而不是直接把輸入物件原封不動往下傳，讓「Feature
 *   Request長什麼樣子」跟「Application Request長什麼樣子」是兩個
 *   獨立定義，即使目前欄位剛好一樣）
 * - 呼叫 Workflow（透過依賴注入拿到的
 *   `workflow.executeApplicationRequest()`——唯一允許呼叫的下一層）
 * - 統一 Feature Result（透過`feature_result_builder.js`）
 *
 * 明確要求（Feature Layer may call / must NOT call）：
 * - ✅ 只能呼叫 Workflow（`workflow.executeApplicationRequest()`）
 * - ❌ 不直接呼叫 Capability（不 import
 *   src/intelligence/application/capabilities/，不持有
 *   `capability`依賴——一律透過Workflow間接呼叫）
 * - ❌ 不直接呼叫 Use Case（不 import
 *   src/intelligence/application/use_cases/，不持有`useCase`依賴）
 * - ❌ 不直接呼叫 Application Service（不 import
 *   src/intelligence/application/application_service.js，不持有
 *   `applicationService`依賴）
 * - ❌ 不直接呼叫 Intelligence Facade（不 import
 *   src/intelligence/facade/，不持有`facade`依賴）
 * - ❌ 不直接呼叫 Execution Manager（不 import
 *   src/intelligence/execution/，不持有`executionManager`依賴——
 *   這是規格明確禁止的捷徑「Feature → Execution Runtime」）
 * - ❌ 不直接存取 History Store、Metrics Store、Event Dispatcher
 * - ❌ 不直接存取 Database（不 import src/db/ 底下任何檔案——db只
 *   是原樣轉交給workflow.executeApplicationRequest()的不透明
 *   參數，這是規格明確禁止的捷徑「Feature → Database」）
 * - ❌ 不 import src/intelligence/service/、orchestration/、
 *   analysis/、recommendation/、data_preparation/、governance/
 * - ❌ 不 import src/services/ 底下任何檔案
 * - ❌ 不呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
 *   「Feature → AI Provider」）
 *
 * 其他既有規則：
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/，userId 一律由呼叫端當作
 *   request的欄位傳入
 *
 * 跟Workflow Layer（TASK1.64）刻意採用Contract Layer驗證輸入不同，
 * Feature Layer維持TASK1.60/1.61/1.62的既有慣例——自己內建一份
 * 最小的request驗證（跟其他層完全一樣的規則），不重用Contract
 * Layer（Workflow內部呼叫時仍然會再驗證一次Contract，這是刻意保留
 * 的重複防護，不是漏洞）。這是規格明確列出「驗證Contract」屬於
 * Workflow的責任、不屬於Feature Layer的責任，維持「每一層邊界獨立」
 * 的既有決策。
 */
import { createFeatureResultBuilder } from './feature_result_builder.js';

const FEATURE_NAME = 'insight';

/**
 * 驗證 requestInsightFeature() 的 featureRequest 輸入——只檢查這一
 * 層自己需要知道的最小欄位（userId是否為非空字串、options存在時是
 * 否為物件），不解讀options的業務內容。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateFeatureRequest(request) {
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
 * Feature Request mapping：把Feature Request明確重新組裝成
 * Application Request，只挑選已知欄位（userId/options/requestId/
 * version/timestamp/metadata），未知欄位不會被意外帶到下游——這是
 * 「Feature Request長什麼樣子」跟「Application Request長什麼樣子」
 * 兩個獨立定義之間的轉換，即使目前欄位剛好一致，也不是原封不動的
 * pass-through。
 *
 * @param {object} request - 已通過validateFeatureRequest()驗證的
 *   Feature Request
 * @returns {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}}
 */
function mapFeatureRequestToApplicationRequest(request) {
  const applicationRequest = { userId: request.userId };
  if (request.options !== undefined) applicationRequest.options = request.options;
  if (request.requestId !== undefined) applicationRequest.requestId = request.requestId;
  if (request.version !== undefined) applicationRequest.version = request.version;
  if (request.timestamp !== undefined) applicationRequest.timestamp = request.timestamp;
  if (request.metadata !== undefined) applicationRequest.metadata = request.metadata;
  return applicationRequest;
}

/**
 * @param {object} dependencies
 * @param {{executeApplicationRequest: (db:object, request:object) => Promise<{ok:boolean, workflow?:string, data?:object, reason?:string}>}} dependencies.workflow
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{requestInsightFeature: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, feature:string, data:{status:*, result:*, metadata:*}}|{ok:false, feature:string, reason:string}>}}
 */
export function createInsightFeature(dependencies) {
  dependencies = dependencies || {};
  const { workflow } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createFeatureResultBuilder();

  /**
   * User Feature Request唯一需要呼叫的Insight Feature Entry：驗證
   * 輸入 → 建立Feature Request mapping → 呼叫Workflow（唯一允許
   * 呼叫的下一層）→ 回傳穩定的feature結果格式。任何一步失敗都立刻
   * 回傳{ok:false, feature:'insight', reason}，不會用不完整的資料
   * 頂替繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給
   *   workflow.executeApplicationRequest()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request -
   *   Feature Request
   * @returns {Promise<{ok:true, feature:string, data:{status:*, result:*, metadata:*}}|{ok:false, feature:string, reason:string}>}
   */
  async function requestInsightFeature(db, request) {
    const validation = validateFeatureRequest(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(FEATURE_NAME, validation.reason);
    }

    if (!workflow || typeof workflow.executeApplicationRequest !== 'function') {
      return resultBuilder.buildFailureResult(FEATURE_NAME, 'workflow_unavailable');
    }

    const applicationRequest = mapFeatureRequestToApplicationRequest(request);
    const outcome = await workflow.executeApplicationRequest(db, applicationRequest);
    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(FEATURE_NAME, outcome.reason);
    }

    return resultBuilder.buildSuccessResult(FEATURE_NAME, outcome.data);
  }

  return { requestInsightFeature };
}

/*
 * Phase 3 TASK 1.66｜Insight Feature Capability Implementation
 * Foundation
 * - Insight Feature Capability
 *
 * 責任：這是Phase 3第一個「正式」的Intelligence Application
 * Feature Capability——TASK1.65 `insight_feature.js`證明了Feature
 * →Workflow→Capability→Use Case→Application Service→Runtime這條
 * 鏈路「架構上可以走通」（一個通用、可能未來被其他Feature複製的
 * 骨架），這個檔案則是**Insight這個domain自己明確的Capability
 * Implementation**——定義Insight Feature的domain intent（這是一個
 * 「取得使用者Insight」的請求，不是泛用的「任意Feature請求」）、
 * 把Feature request轉換成對應的Capability request、呼叫既有的
 * Workflow、統一Insight Feature output。
 *
 * 架構位置（規格原文）：
 *
 *   User Insight Request
 *     ↓
 *   Insight Feature（這裡）
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
 * Insight Feature Capability只負責四件事（規格明確列出，不多不少）：
 * - 定義 Insight Feature domain intent（`INSIGHT_DOMAIN = 'insight'`
 *   ——這個Capability只服務「Insight」這一個domain，不是泛用的
 *   Feature外殼）
 * - 將 Feature request 轉換成對應 Capability request
 *   （`mapInsightFeatureRequestToCapabilityRequest()`——跟TASK1.65
 *   `mapFeatureRequestToApplicationRequest()`同樣的「明確重新組裝、
 *   不是原封不動pass-through」邊界決策，只是這裡的最終目的地是
 *   Workflow真正呼叫的下一層Capability，而不是Application Service）
 * - 呼叫既有 Workflow（透過依賴注入拿到的
 *   `workflow.executeApplicationRequest()`——跟TASK1.65
 *   insight_feature.js完全一樣，唯一允許呼叫的下一層仍然是
 *   Workflow，不會為了「呼叫Capability」而繞過Workflow直接import
 *   Capability Layer）
 * - 統一 Insight Feature output（透過`insight_result_mapper.js`）
 *
 * 明確要求（Insight Feature Capability may call / must NOT call）：
 * - ✅ 只能呼叫 Workflow（`workflow.executeApplicationRequest()`）
 * - ❌ 不直接呼叫 Capability（不 import
 *   src/intelligence/application/capabilities/，不持有
 *   `capability`依賴——一律透過Workflow間接呼叫，即使規格文字
 *   說「轉換成對應Capability request」，實際呼叫對象仍然只有
 *   Workflow）
 * - ❌ 不直接呼叫 Use Case（不 import
 *   src/intelligence/application/use_cases/）
 * - ❌ 不直接呼叫 Application Service（不 import
 *   src/intelligence/application/application_service.js）
 * - ❌ 不直接呼叫 Intelligence Facade（不 import
 *   src/intelligence/facade/）
 * - ❌ 不直接呼叫 Execution Manager（不 import
 *   src/intelligence/execution/——規格明確禁止的捷徑
 *   「Insight Feature → Execution Runtime」）
 * - ❌ 不直接存取 History Store、Metrics Store、Event Dispatcher
 * - ❌ 不直接存取 Database（不 import src/db/ 底下任何檔案——db只
 *   是原樣轉交給workflow.executeApplicationRequest()的不透明
 *   參數，規格明確禁止的捷徑「Insight Feature → Database」）
 * - ❌ 不 import src/intelligence/service/、orchestration/、
 *   analysis/、recommendation/、data_preparation/、governance/
 * - ❌ 不 import src/services/ 底下任何檔案
 * - ❌ 不呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
 *   「Insight Feature → AI Provider」）
 *
 * 其他既有規則：
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/，userId 一律由呼叫端當作
 *   request的欄位傳入
 *
 * 跟TASK1.65 insight_feature.js一樣，這裡也維持既有慣例——自己內建
 * 一份最小的request驗證，不重用Contract Layer（TASK1.63），因為
 * 「驗證Contract」是規格明確列給Workflow Layer的責任；呼叫Workflow
 * 時，Contract驗證仍然會在Workflow內部再次執行。
 */
import { createInsightResultMapper } from './insight_result_mapper.js';

const INSIGHT_DOMAIN = 'insight';

/**
 * 驗證 requestInsight() 的 featureRequest 輸入——只檢查這一層自己
 * 需要知道的最小欄位（userId是否為非空字串、options存在時是否為
 * 物件），不解讀options的業務內容。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateInsightFeatureRequest(request) {
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
 * 將 Feature request 轉換成對應 Capability request：明確重新組裝
 * 成Workflow（進而Capability）預期的請求形狀，只挑選已知欄位
 * （userId/options/requestId/version/timestamp/metadata），不是
 * 原封不動的pass-through。
 *
 * @param {object} request - 已通過validateInsightFeatureRequest()
 *   驗證的Feature request
 * @returns {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}}
 */
function mapInsightFeatureRequestToCapabilityRequest(request) {
  const capabilityRequest = { userId: request.userId };
  if (request.options !== undefined) capabilityRequest.options = request.options;
  if (request.requestId !== undefined) capabilityRequest.requestId = request.requestId;
  if (request.version !== undefined) capabilityRequest.version = request.version;
  if (request.timestamp !== undefined) capabilityRequest.timestamp = request.timestamp;
  if (request.metadata !== undefined) capabilityRequest.metadata = request.metadata;
  return capabilityRequest;
}

/**
 * @param {object} dependencies
 * @param {{executeApplicationRequest: (db:object, request:object) => Promise<{ok:boolean, workflow?:string, data?:object, reason?:string}>}} dependencies.workflow
 * @param {{mapSuccessResult: Function, mapFailureResult: Function}} [dependencies.resultMapper]
 * @returns {{requestInsight: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, feature:'insight', data:{status:*, result:*, metadata:*}}|{ok:false, feature:'insight', reason:string}>}}
 */
export function createInsightFeatureCapability(dependencies) {
  dependencies = dependencies || {};
  const { workflow } = dependencies;
  const resultMapper = dependencies.resultMapper || createInsightResultMapper();

  /**
   * User Insight Request唯一需要呼叫的正式Insight Domain入口：
   * 驗證輸入 → 把Feature request轉換成Capability request → 呼叫
   * Workflow（唯一允許呼叫的下一層）→ 統一Insight Feature
   * output。任何一步失敗都立刻回傳{ok:false, feature:'insight',
   * reason}，不會用不完整的資料頂替繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給
   *   workflow.executeApplicationRequest()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request -
   *   User Insight Request
   * @returns {Promise<{ok:true, feature:'insight', data:{status:*, result:*, metadata:*}}|{ok:false, feature:'insight', reason:string}>}
   */
  async function requestInsight(db, request) {
    const validation = validateInsightFeatureRequest(request);
    if (!validation.ok) {
      return resultMapper.mapFailureResult(validation.reason);
    }

    if (!workflow || typeof workflow.executeApplicationRequest !== 'function') {
      return resultMapper.mapFailureResult('workflow_unavailable');
    }

    const capabilityRequest = mapInsightFeatureRequestToCapabilityRequest(request);
    const outcome = await workflow.executeApplicationRequest(db, capabilityRequest);
    if (!outcome.ok) {
      return resultMapper.mapFailureResult(outcome.reason);
    }

    return resultMapper.mapSuccessResult(outcome.data);
  }

  return { requestInsight };
}

/*
 * Phase 3 TASK 1.72｜Behavior Feature Foundation
 * - Behavior Feature
 *
 * 責任：這是Phase 3第二個正式的Intelligence Application Feature
 * domain entry——驗證TASK1.60~1.71建立的Application Pattern
 * （Feature→Workflow→Capability→Use Case→Application Service→
 * Runtime）不是只能承載Insight這一個domain，換一個完全不同的
 * domain名稱（"behavior"）、複製同樣的檔案形狀，就可以走完全一樣
 * 的完整生命週期，而且完全不需要碰到任何Insight相關的檔案。
 *
 * 架構位置（規格原文）：
 *
 *   Behavior Request
 *     ↓
 *   Behavior Feature（這裡）
 *     ↓
 *   Workflow（TASK1.64，本次任務為Behavior domain建立的獨立
 *   Workflow實例，見src/bootstrap/application.js）
 *     ↓
 *   Capability（./behavior_capability.js的createBehaviorCapability）
 *     ↓
 *   Use Case（./behavior_capability.js的createBehaviorUseCase）
 *     ↓
 *   Application Service（TASK1.60，跟Insight共用同一個既有實例）
 *     ↓
 *   Intelligence Runtime
 *
 * Behavior Feature只負責三件事（規格明確列出，不多不少）：
 * - 定義 Behavior Domain Entry（`BEHAVIOR_DOMAIN = 'behavior'`）
 * - 使用既有 Workflow Pattern（透過依賴注入拿到的
 *   `workflow.executeApplicationRequest()`——唯一允許呼叫的下一層，
 *   跟`../insight/insight_capability.js`（TASK1.66）完全同樣的
 *   邊界決策）
 * - 建立 Behavior Domain Output（透過`./behavior_result_mapper.js`）
 *
 * 明確要求（Behavior Feature may call / must NOT call）：
 * - ✅ 只能呼叫 Workflow（`workflow.executeApplicationRequest()`）
 * - ❌ 不直接呼叫 Capability（不import
 *   src/intelligence/application/capabilities/，也不import
 *   ./behavior_capability.js——一律透過Workflow間接呼叫，即使
 *   ./behavior_capability.js是本次任務新增的檔案，Behavior
 *   Feature本身仍然不直接認識它，只認識Workflow這一層）
 * - ❌ 不直接呼叫 Use Case（不import
 *   src/intelligence/application/use_cases/）
 * - ❌ 不直接呼叫 Application Service（不import
 *   src/intelligence/application/application_service.js）
 * - ❌ 不直接呼叫 Intelligence Facade（不import
 *   src/intelligence/facade/）
 * - ❌ 不直接呼叫 Execution Manager（不import
 *   src/intelligence/execution/——規格明確禁止的捷徑
 *   「Behavior Feature → Execution Manager」）
 * - ❌ 不直接存取 History Store、Metrics Store、Event Dispatcher
 * - ❌ 不直接存取 Database（不import src/db/底下任何檔案——db只是
 *   原樣轉交給workflow.executeApplicationRequest()的不透明參數，
 *   規格明確禁止的捷徑「Behavior Feature → Database」）
 * - ❌ 不import src/intelligence/service/、orchestration/、
 *   analysis/、recommendation/、data_preparation/、governance/
 * - ❌ 不import src/services/底下任何檔案
 * - ❌ 不呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
 *   「Behavior Feature → AI Provider」）
 * - ❌ **完全不import `../insight_feature.js`、
 *   `../insight/`底下任何檔案**——規格明確禁止的捷徑
 *   「Behavior Feature → Insight Feature」，這是Phase 3第一次
 *   有兩個Feature domain並存，必須確認彼此完全不認識對方
 *
 * 其他既有規則：
 * - No HTTP：不知道 Request/Response 是什麼，不import任何路由/
 *   controller
 * - No Authentication parsing：不import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/，userId一律由呼叫端當作
 *   request的欄位傳入
 *
 * 跟`../insight/insight_capability.js`（TASK1.66）一樣維持既有
 * 慣例——自己內建一份最小的request驗證，不重用Contract Layer
 * （TASK1.63），因為「驗證Contract」是規格明確列給Workflow的責任；
 * 呼叫Workflow時，Contract驗證仍然會在Workflow內部再次執行。
 */
import { createBehaviorResultMapper } from './behavior_result_mapper.js';

const BEHAVIOR_DOMAIN = 'behavior';

/**
 * 驗證 requestBehavior() 的 featureRequest 輸入——只檢查這一層自己
 * 需要知道的最小欄位（userId是否為非空字串、options存在時是否為
 * 物件），不解讀options的業務內容。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateBehaviorFeatureRequest(request) {
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
 * 把Behavior Feature Request明確重新組裝成Workflow預期的
 * Application Request，只挑選已知欄位，不是原封不動的
 * pass-through。
 *
 * @param {object} request - 已通過validateBehaviorFeatureRequest()
 *   驗證的Behavior Feature Request
 * @returns {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}}
 */
function mapBehaviorFeatureRequestToWorkflowRequest(request) {
  const workflowRequest = { userId: request.userId };
  if (request.options !== undefined) workflowRequest.options = request.options;
  if (request.requestId !== undefined) workflowRequest.requestId = request.requestId;
  if (request.version !== undefined) workflowRequest.version = request.version;
  if (request.timestamp !== undefined) workflowRequest.timestamp = request.timestamp;
  if (request.metadata !== undefined) workflowRequest.metadata = request.metadata;
  return workflowRequest;
}

/**
 * @param {object} dependencies
 * @param {{executeApplicationRequest: (db:object, request:object) => Promise<{ok:boolean, workflow?:string, data?:object, reason?:string}>}} dependencies.workflow
 * @param {{mapSuccessResult: Function, mapFailureResult: Function}} [dependencies.resultMapper]
 * @returns {{requestBehavior: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, feature:'behavior', data:{status:*, result:*, metadata:*}}|{ok:false, feature:'behavior', reason:string}>}}
 */
export function createBehaviorFeature(dependencies) {
  dependencies = dependencies || {};
  const { workflow } = dependencies;
  const resultMapper = dependencies.resultMapper || createBehaviorResultMapper();

  /**
   * User Behavior Request唯一需要呼叫的Behavior Domain入口：驗證
   * 輸入 → 把Feature request轉換成Workflow request → 呼叫Workflow
   * （唯一允許呼叫的下一層）→ 統一Behavior Feature output。任何
   * 一步失敗都立刻回傳{ok:false, feature:'behavior', reason}，
   * 不會用不完整的資料頂替繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給
   *   workflow.executeApplicationRequest()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request -
   *   User Behavior Request
   * @returns {Promise<{ok:true, feature:'behavior', data:{status:*, result:*, metadata:*}}|{ok:false, feature:'behavior', reason:string}>}
   */
  async function requestBehavior(db, request) {
    const validation = validateBehaviorFeatureRequest(request);
    if (!validation.ok) {
      return resultMapper.mapFailureResult(validation.reason);
    }

    if (!workflow || typeof workflow.executeApplicationRequest !== 'function') {
      return resultMapper.mapFailureResult('workflow_unavailable');
    }

    const workflowRequest = mapBehaviorFeatureRequestToWorkflowRequest(request);
    const outcome = await workflow.executeApplicationRequest(db, workflowRequest);
    if (!outcome.ok) {
      return resultMapper.mapFailureResult(outcome.reason);
    }

    return resultMapper.mapSuccessResult(outcome.data);
  }

  return { requestBehavior };
}

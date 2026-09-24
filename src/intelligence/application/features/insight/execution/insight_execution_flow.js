/*
 * Phase 3 TASK 1.69｜Insight Feature Execution Flow Foundation
 * - Insight Execution Flow
 *
 * 責任：這是Phase 3第一個真正把TASK1.64 Workflow、TASK1.67 Insight
 * Context Mapper、TASK1.68 Insight Output Mapper三者組合起來、端到
 * 端跑完整條「Request→Workflow→Context Mapping→Output Mapping」
 * 流程的層——TASK1.63/1.67/1.68建立的Contract/Context/Output三個
 * 純函式工具，過去每一個都只是「建立但沒有被實際串接」的孤立
 * extension point，這裡是第一次把Context Mapper跟Output Mapper
 * 真正接上實際呼叫鏈（Workflow本身則延續TASK1.64已經接上Contract
 * 的既有真實鏈路）。
 *
 * 架構位置（規格原文）：
 *
 *   Insight Feature
 *     ↓
 *   Insight Execution Flow（這裡）
 *     ↓
 *   Insight Workflow（TASK1.64）
 *     ↓
 *   Capability（TASK1.62）
 *     ↓
 *   Use Case（TASK1.61）
 *     ↓
 *   Application Service（TASK1.60）
 *     ↓
 *   Intelligence Runtime
 *     ↓
 *   Insight Output
 *
 * Insight Execution Flow只負責四件事（規格明確列出，不多不少）：
 * - 接收 Insight Feature Request
 * - 呼叫既有 Insight Workflow（透過依賴注入拿到的
 *   `workflow.executeApplicationRequest()`——唯一允許呼叫的下一層，
 *   跟TASK1.66 insight_capability.js/TASK1.65 insight_feature.js
 *   一樣不繞過Workflow直接呼叫Capability/Use Case/Application
 *   Service/Facade）
 * - 管理 Feature 層執行流程（Workflow成功後，依序呼叫Context
 *   Mapper攤平、Output Mapper轉換並驗證，任何一步失敗都立刻中止）
 * - 回傳 Insight Output（透過`insight_execution_result_builder.js`
 *   統一包裝成`{ok:true, feature:'insight', output}`）
 *
 * 明確要求（Insight Execution Flow may call / must NOT call）：
 * - ✅ 只能呼叫 Workflow（`workflow.executeApplicationRequest()`）、
 *   Context Mapper（`contextMapper.mapRuntimeContextToInsightDomain()`）
 *   跟 Output Mapper（`outputMapper.mapToInsightOutput()`）——三者
 *   都是透過依賴注入拿到的、符合最小介面的不透明物件
 * - ❌ 不直接呼叫 Capability（不 import
 *   src/intelligence/application/capabilities/）
 * - ❌ 不直接呼叫 Use Case（不 import
 *   src/intelligence/application/use_cases/）
 * - ❌ 不直接呼叫 Application Service（不 import
 *   src/intelligence/application/application_service.js）
 * - ❌ 不直接呼叫 Intelligence Facade（不 import
 *   src/intelligence/facade/）
 * - ❌ 不直接呼叫 Execution Manager（不 import
 *   src/intelligence/execution/——規格明確禁止的捷徑
 *   「Insight Feature → Execution Manager」）
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
 * 跟TASK1.66 insight_capability.js/TASK1.65 insight_feature.js
 * 一樣維持既有慣例——自己內建一份最小的request驗證，不重用Contract
 * Layer（TASK1.63），因為「驗證Contract」是規格明確列給Workflow的
 * 責任。這裡是Phase 3第一個「Insight Feature」系列裡真正把Context
 * Mapper跟Output Mapper接上真實呼叫鏈的層，`insight_capability.js`
 * （TASK1.66）本身完全沒有被修改——兩者是並存的兩個Insight Feature
 * entry point（TASK1.66回傳的是Facade收斂格式`data:{status, result,
 * metadata}`；這裡回傳的是經過驗證的InsightOutputModel格式）。
 */
import { createInsightExecutionResultBuilder } from './insight_execution_result_builder.js';

/**
 * 驗證 runInsightExecution() 的 featureRequest 輸入——只檢查這一層
 * 自己需要知道的最小欄位（userId是否為非空字串、options存在時是否
 * 為物件），不解讀options的業務內容。
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
 * 把Insight Feature Request明確重新組裝成Workflow預期的
 * Application Request，只挑選已知欄位，不是原封不動的
 * pass-through。
 *
 * @param {object} request - 已通過validateInsightFeatureRequest()
 *   驗證的Insight Feature Request
 * @returns {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}}
 */
function mapFeatureRequestToWorkflowRequest(request) {
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
 * @param {{mapRuntimeContextToInsightDomain: (workflowData:object) => object}} dependencies.contextMapper
 * @param {{mapToInsightOutput: (insightDomainView:object) => {ok:boolean, output?:object, reason?:string, field?:string}}} dependencies.outputMapper
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{runInsightExecution: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, feature:'insight', output:object}|{ok:false, feature:'insight', reason:string}>}}
 */
export function createInsightExecutionFlow(dependencies) {
  dependencies = dependencies || {};
  const { workflow, contextMapper, outputMapper } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createInsightExecutionResultBuilder();

  /**
   * Insight Feature唯一需要呼叫的完整Execution Flow入口：驗證
   * 輸入 → 呼叫Workflow（唯一允許呼叫的下一層）→ 呼叫Context
   * Mapper攤平Runtime Result → 呼叫Output Mapper轉換並驗證 →
   * 回傳穩定的Insight Output。任何一步失敗都立刻回傳
   * {ok:false, feature:'insight', reason}，不會用不完整的資料頂替
   * 繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給
   *   workflow.executeApplicationRequest()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request -
   *   Insight Feature Request
   * @returns {Promise<{ok:true, feature:'insight', output:object}|{ok:false, feature:'insight', reason:string}>}
   */
  async function runInsightExecution(db, request) {
    const validation = validateInsightFeatureRequest(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(validation.reason);
    }

    if (!workflow || typeof workflow.executeApplicationRequest !== 'function') {
      return resultBuilder.buildFailureResult('workflow_unavailable');
    }
    if (!contextMapper || typeof contextMapper.mapRuntimeContextToInsightDomain !== 'function') {
      return resultBuilder.buildFailureResult('context_mapper_unavailable');
    }
    if (!outputMapper || typeof outputMapper.mapToInsightOutput !== 'function') {
      return resultBuilder.buildFailureResult('output_mapper_unavailable');
    }

    const workflowRequest = mapFeatureRequestToWorkflowRequest(request);
    const workflowOutcome = await workflow.executeApplicationRequest(db, workflowRequest);
    if (!workflowOutcome.ok) {
      return resultBuilder.buildFailureResult(workflowOutcome.reason);
    }

    const insightDomainView = contextMapper.mapRuntimeContextToInsightDomain(workflowOutcome.data);
    const outputOutcome = outputMapper.mapToInsightOutput(insightDomainView);
    if (!outputOutcome.ok) {
      return resultBuilder.buildFailureResult(outputOutcome.reason);
    }

    return resultBuilder.buildSuccessResult(outputOutcome.output);
  }

  return { runInsightExecution };
}

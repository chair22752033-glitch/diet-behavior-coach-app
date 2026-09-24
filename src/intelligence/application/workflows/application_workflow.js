/*
 * Phase 3 TASK 1.64｜Intelligence Application Workflow Layer
 * Foundation
 * - Application Workflow
 *
 * 責任：協調 Capability Layer（TASK1.62）、Use Case Layer
 * （TASK1.61，透過Capability間接）、Application Contract
 * （TASK1.63）三者，形成一致的Application執行流程——呼叫端只需要
 * 知道`executeApplicationRequest(db, request)`這一個穩定入口，
 * 完全不需要知道底下實際上是先驗證Contract、再呼叫Capability、
 * Capability再呼叫Use Case、Use Case再呼叫Application Service。
 *
 * 架構位置（規格原文）：
 *
 *   User Application
 *     ↓
 *   Workflow Layer（這裡）
 *     ↓
 *   Capability Layer（TASK1.62）
 *     ↓
 *   Use Case Layer（TASK1.61）
 *     ↓
 *   Application Contract（TASK1.63）
 *     ↓
 *   Application Service（TASK1.60）
 *     ↓
 *   Intelligence Facade（TASK1.48）
 *     ↓
 *   Runtime
 *
 * Workflow Layer只負責四件事（規格明確列出，不多不少）：
 * - 接收 Application Request
 * - 驗證 Contract（透過依賴注入拿到的
 *   `contractValidator.validateRequest()`/`validateResponse()`——
 *   跟Capability/Use Case/Application Service三層不同，Workflow
 *   Layer是第一個**主動採用**TASK1.63 Contract Layer的層，不是
 *   各自重新實作一份一樣的驗證規則）
 * - 導向 Capability / Use Case（透過依賴注入拿到的
 *   `capability.requestInsightCapability()`——Capability內部自己
 *   會呼叫Use Case，Workflow Layer不需要、也不直接持有Use Case
 *   依賴，維持「每一層只認識自己呼叫的下一層」的既有慣例）
 * - 統一 Workflow Result（透過`workflow_result_builder.js`）
 *
 * 明確要求（Workflow Layer may call / must NOT call）：
 * - ✅ 只能呼叫 Capability（`capability.requestInsightCapability()`）
 *   跟 Contract Validator
 *   （`contractValidator.validateRequest()`/`validateResponse()`）
 * - ❌ 不直接呼叫 Use Case（不 import
 *   src/intelligence/application/use_cases/，不持有`useCase`
 *   依賴——一律透過Capability間接呼叫）
 * - ❌ 不直接呼叫 Application Service（不 import
 *   src/intelligence/application/application_service.js，不持有
 *   `applicationService`依賴）
 * - ❌ 不直接呼叫 Intelligence Facade（不 import
 *   src/intelligence/facade/，不持有`facade`依賴）
 * - ❌ 不直接呼叫 Execution Manager（不 import
 *   src/intelligence/execution/，不持有`executionManager`依賴——
 *   這是規格明確禁止的捷徑「Workflow → Execution Manager」）
 * - ❌ 不直接存取 History Store、Metrics Store、Event Dispatcher
 * - ❌ 不直接存取 Database（不 import src/db/ 底下任何檔案——db
 *   只是原樣轉交給capability.requestInsightCapability()的不透明
 *   參數，這是規格明確禁止的捷徑「Workflow → Database」）
 * - ❌ 不 import src/intelligence/service/、orchestration/、
 *   analysis/、recommendation/、data_preparation/、governance/
 * - ❌ 不 import src/services/ 底下任何檔案
 * - ❌ 不呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
 *   「Workflow → AI Provider」）
 *
 * 其他既有規則：
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/，userId 一律由呼叫端當作
 *   request的欄位傳入
 *
 * 跟前幾層（TASK1.60/1.61/1.62）刻意各自重新實作一模一樣的
 * validateXxxRequest()不同，這裡**沒有**內建自己的request驗證
 * 函式——Workflow Layer的請求輸入驗證完全委派給注入的
 * `contractValidator.validateRequest()`，這是規格明確要求的「驗證
 * Contract」責任，也是TASK1.63建立的Contract Layer第一次被實際
 * 採用，不再是「建立但沒有任何人使用」的孤立extension point。
 */
import { createWorkflowResultBuilder } from './workflow_result_builder.js';

const WORKFLOW_NAME = 'application_request';

/**
 * @param {object} dependencies
 * @param {{requestInsightCapability: (db:object, request:object) => Promise<{ok:boolean, capability?:string, data?:object, reason?:string}>}} dependencies.capability
 * @param {{validateRequest: (request:*) => {ok:boolean, reason?:string}, validateResponse: (response:*) => {ok:boolean, reason?:string}}} dependencies.contractValidator
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{executeApplicationRequest: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, workflow:string, data:{status:*, result:*, metadata:*}}|{ok:false, workflow:string, reason:string}>}}
 */
export function createApplicationWorkflow(dependencies) {
  dependencies = dependencies || {};
  const { capability, contractValidator } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createWorkflowResultBuilder();

  /**
   * User Application唯一需要呼叫的Application Request Workflow
   * 入口：驗證Contract → 呼叫Capability（唯一允許呼叫的下一層）→
   * 驗證回應Contract → 回傳穩定的workflow結果格式。任何一步失敗都
   * 立刻回傳{ok:false, workflow, reason}，不會用不完整的資料頂替
   * 繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給
   *   capability.requestInsightCapability()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request -
   *   User Application傳入的請求物件
   * @returns {Promise<{ok:true, workflow:string, data:{status:*, result:*, metadata:*}}|{ok:false, workflow:string, reason:string}>}
   */
  async function executeApplicationRequest(db, request) {
    if (!contractValidator || typeof contractValidator.validateRequest !== 'function') {
      return resultBuilder.buildFailureResult(WORKFLOW_NAME, 'contract_validator_unavailable');
    }

    const requestValidation = contractValidator.validateRequest(request);
    if (!requestValidation.ok) {
      return resultBuilder.buildFailureResult(WORKFLOW_NAME, requestValidation.reason);
    }

    if (!capability || typeof capability.requestInsightCapability !== 'function') {
      return resultBuilder.buildFailureResult(WORKFLOW_NAME, 'capability_unavailable');
    }

    const outcome = await capability.requestInsightCapability(db, request);

    if (typeof contractValidator.validateResponse === 'function') {
      const responseValidation = contractValidator.validateResponse(outcome);
      if (!responseValidation.ok) {
        return resultBuilder.buildFailureResult(WORKFLOW_NAME, responseValidation.reason);
      }
    }

    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(WORKFLOW_NAME, outcome.reason);
    }

    return resultBuilder.buildSuccessResult(WORKFLOW_NAME, outcome.data);
  }

  return { executeApplicationRequest };
}

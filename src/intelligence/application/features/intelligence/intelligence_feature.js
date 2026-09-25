/*
 * Phase 4 TASK 1.79｜Feature Intelligence Capability Integration
 * Foundation
 * - Intelligence Feature
 *
 * 責任：建立Phase 4 Capability跟Phase 3 Feature Layer之間正式的
 * 整合邊界——讓Feature可以透過明確的Capability Boundary使用
 * TASK1.76 Analysis Capability + TASK1.77 Recommendation
 * Capability + TASK1.78 Capability Orchestration，而不需要自己
 * 手動組裝這三層。這個檔案本身**不**呼叫AI、**不**建立Prompt
 * Logic、**不**修改Phase 3 Feature Pattern/Workflow
 * Layer/Application Service——單純是Feature層級的整合邊界：接收
 * Feature Request、呼叫Capability Orchestrator、把Unified
 * Capability Result轉換為Feature Output。
 *
 * 架構位置（規格原文）：
 *
 *   Feature Request
 *     ↓
 *   Intelligence Feature Integration（這裡）
 *     ↓
 *   Capability Orchestrator（TASK1.78，完全不修改）
 *     ↓
 *   Analysis Capability（TASK1.76，完全不修改）
 *     ↓
 *   Recommendation Capability（TASK1.77，完全不修改）
 *     ↓
 *   Output
 *
 * 這條鏈路刻意跟`../insight/insight_feature.js`/
 * `../behavior/behavior_feature.js`（Feature→Workflow→Capability→
 * Use Case→Application Service→Runtime）完全不同、互不交叉——這是
 * 規格Architecture Rule明確畫出的另一條合法路徑，不是「修改」既有
 * Insight/Behavior Feature的Workflow鏈路，而是為Phase 4 Capability
 * 這一整套（原本就已經跟Workflow/UseCase/ApplicationService平行
 * 存在、互不認識）新增一個對應的Feature層級入口。Insight/Behavior
 * 兩個既有Feature本身完全沒有被修改，仍然只認識Workflow這一層。
 *
 * Intelligence Feature只負責三件事（規格明確列出，不多不少）：
 * - 接收 Feature Request（`{context, options?}`形狀，跟Analysis
 *   Capability/Capability Orchestrator的request形狀完全一致——
 *   因為這個Feature就是Capability Orchestrator鏈路的Feature層級
 *   入口，不需要重新定義新的request形狀）
 * - 呼叫 Capability Orchestrator（透過依賴注入拿到的
 *   `capabilityOrchestrator.requestCapabilityFlow()`——唯一允許
 *   呼叫的下一層）
 * - 將 Unified Capability Result 轉換為 Feature Output（透過
 *   `./intelligence_feature_result_mapper.js`）
 *
 * 明確要求（Intelligence Feature may call / must NOT call）：
 * - ✅ 只能呼叫 Capability Orchestrator
 *   （`capabilityOrchestrator.requestCapabilityFlow()`）
 * - ❌ 不繞過Capability Orchestrator直接呼叫Analysis
 *   Capability/Recommendation Capability（不import
 *   `capabilities/analysis/`、`capabilities/recommendation/`）
 * - ❌ 不直接呼叫Analysis Runner/Recommendation Runner（不import
 *   `src/intelligence/analysis/`、`src/intelligence/recommendation/`）
 * - ❌ 不直接呼叫 Workflow/Use Case/Application
 *   Service（不import`application/workflows/`、
 *   `application/use_cases/`、
 *   `application/application_service.js`——這條鏈路完全不經過
 *   Phase 3既有的Application Pattern，兩條路徑刻意平行、互不交叉）
 * - ❌ 不直接呼叫 Intelligence Facade（不import
 *   src/intelligence/facade/）
 * - ❌ 不直接呼叫 Execution Manager（不import
 *   src/intelligence/execution/——規格明確禁止的捷徑
 *   「Feature → Runtime Internal Layer」）
 * - ❌ 不直接存取 History Store、Metrics Store、Event Dispatcher
 * - ❌ 不直接存取 Database（不import src/db/底下任何檔案，這個
 *   檔案完全不接受db參數，也不知道db是什麼——規格明確禁止的捷徑
 *   「Feature → Database」）
 * - ❌ 不import src/intelligence/service/、orchestration/
 *   （Phase 2 Runtime Orchestrator）、data_preparation/、
 *   governance/
 * - ❌ 不import src/services/底下任何檔案
 * - ❌ 不呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
 *   「Feature → AI Provider」）
 * - ❌ 完全不import`../insight_feature.js`、`../insight/`、
 *   `../behavior/`底下任何檔案——這是Phase 3第三個Feature domain
 *   entry，必須確認彼此完全不認識對方
 *
 * 其他既有規則：
 * - No HTTP：不知道 Request/Response 是什麼，不import任何路由/
 *   controller
 * - No Authentication parsing：不import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/
 * - deterministic：跟Capability Orchestrator/Analysis
 *   Capability/Recommendation Capability一樣，同樣的輸入永遠得到
 *   完全相同的輸出，不讀取Date.now()/Math.random()
 *
 * 注意：跟`../behavior/behavior_feature.js`（TASK1.72）不同，這個
 * Feature完全不接受`db`參數、也不接受`userId`——因為它呼叫的整條
 * Capability鏈路（Capability Orchestrator/Analysis
 * Capability/Recommendation Capability/Analysis Runner/
 * Recommendation Runner）從頭到尾都是純函式、同步、完全不接觸
 * database/auth，`requestIntelligence()`因此也是同步函式（不是
 * async），這是忠實反映底層鏈路本身的簽名，不是刻意跟既有Feature
 * 做出差異化設計。
 */
import { createIntelligenceFeatureResultMapper } from './intelligence_feature_result_mapper.js';

const INTELLIGENCE_DOMAIN = 'intelligence';

/**
 * 驗證 requestIntelligence() 的 featureRequest 輸入——跟
 * `capabilities/orchestration/capability_orchestrator.js`的
 * `validateCapabilityOrchestratorRequest()`完全一樣的最外層形狀
 * 檢查（request本身是否為物件、context是否為物件、options存在時
 * 是否為物件），因為這個Feature的request就是Capability
 * Orchestrator的request——不重複實作、也不import對方的驗證函式
 * （維持既有「每個Feature/Capability目錄自我完整、不跨目錄import
 * 實作細節」的慣例），只是恰好形狀相同。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateIntelligenceFeatureRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_request' };
  }
  if (!request.context || typeof request.context !== 'object' || Array.isArray(request.context)) {
    return { ok: false, reason: 'invalid_context' };
  }
  if (request.options !== undefined && (request.options === null || typeof request.options !== 'object' || Array.isArray(request.options))) {
    return { ok: false, reason: 'invalid_options_type' };
  }
  return { ok: true };
}

/**
 * @param {object} dependencies
 * @param {{requestCapabilityFlow: (request:object) => {ok:boolean, result?:object, reason?:string, field?:string, stage?:string}}} dependencies.capabilityOrchestrator
 * @param {{mapSuccessResult: Function, mapFailureResult: Function}} [dependencies.resultMapper]
 * @returns {{requestIntelligence: (request:{context:object, options?:object}) => {ok:true, feature:'intelligence', data:{analysis:object, recommendation:object}}|{ok:false, feature:'intelligence', reason:string, field?:string, stage?:string}}}
 */
export function createIntelligenceFeature(dependencies) {
  dependencies = dependencies || {};
  const { capabilityOrchestrator } = dependencies;
  const resultMapper = dependencies.resultMapper || createIntelligenceFeatureResultMapper();

  /**
   * User Application唯一需要呼叫的「Analysis + Recommendation
   * Capability Flow」Feature入口：驗證輸入 → 呼叫Capability
   * Orchestrator（唯一允許呼叫的下一層）→ 統一Intelligence
   * Feature output。任何一步失敗都立刻回傳
   * {ok:false, feature:'intelligence', reason, field?, stage?}，
   * 不會用不完整的資料頂替繼續執行。這是同步函式，跟Capability
   * Orchestrator本身的同步簽名完全一致。
   *
   * @param {{context:object, options?:object}} request - Feature
   *   Request，`context`是TASK1.42 Insight Context Builder產生的
   *   Insight Context，`options`原樣轉交給Capability
   *   Orchestrator，這裡完全不解讀其內容
   * @returns {{ok:true, feature:'intelligence', data:{analysis:object, recommendation:object}}|{ok:false, feature:'intelligence', reason:string, field?:string, stage?:string}}
   */
  function requestIntelligence(request) {
    const validation = validateIntelligenceFeatureRequest(request);
    if (!validation.ok) {
      return resultMapper.mapFailureResult(validation.reason);
    }

    if (!capabilityOrchestrator || typeof capabilityOrchestrator.requestCapabilityFlow !== 'function') {
      return resultMapper.mapFailureResult('capability_orchestrator_unavailable');
    }

    const outcome = capabilityOrchestrator.requestCapabilityFlow({ context: request.context, options: request.options });
    if (!outcome.ok) {
      return resultMapper.mapFailureResult(outcome.reason, outcome.field, outcome.stage);
    }

    return resultMapper.mapSuccessResult(outcome.result);
  }

  return { requestIntelligence };
}

/*
 * Phase 4 TASK 1.78｜Intelligence Capability Orchestration Foundation
 * - Capability Orchestrator
 *
 * 責任：Phase 4第三個Intelligence Capability
 * Boundary——這次不是再包裝一個新的Runtime Runner，而是把TASK1.76
 * Analysis Capability跟TASK1.77 Recommendation Capability這兩個已經
 * 各自獨立存在的Capability組合成一條完整的Intelligence Capability
 * Flow，讓Application Feature（未來）可以透過單一個Capability
 * Orchestration邊界，一次拿到「Analysis + Recommendation」組合後的
 * Unified Capability Result，而不需要自己手動依序呼叫兩個
 * Capability、自己手動把Analysis Result轉接給Recommendation
 * Capability。這個檔案本身**不**呼叫AI、**不**建立Prompt
 * Logic、**不**修改Analysis Runner/Recommendation
 * Runner/Phase 2 Runtime Orchestrator——單純是Capability層級的
 * 協調邊界：接收intelligence capability request、呼叫Analysis
 * Capability、把Analysis Result傳遞給Recommendation
 * Capability、回傳Unified Capability Result。
 *
 * 架構位置（規格原文）：
 *
 *   Feature（未來擴充，本次任務不新增/不修改任何Feature）
 *     ↓
 *   Capability Orchestrator（這裡）
 *     ↓
 *   Analysis Capability（TASK1.76，完全不修改）
 *     ↓
 *   Recommendation Capability（TASK1.77，完全不修改）
 *     ↓
 *   Capability Result
 *
 * 注意：這裡的「Runtime Orchestrator」跟Phase 2既有的
 * `src/intelligence/orchestration/`（TASK1.45 Intelligence
 * Orchestration，協調dataPreparation/context/analysis/
 * recommendation四層Runtime服務）是完全不同架構位置的兩個東西——
 * Phase 2的Runtime Orchestrator協調的是Runtime層的四個服務模組
 * （透過`intelligence_orchestrator.js`），這裡的Capability
 * Orchestrator協調的是Phase 4的兩個Capability實例（透過依賴注入
 * 拿到的`analysisCapability`/`recommendationCapability`，不是
 * Runner，也不是Runtime Orchestrator本身）。本次任務明確禁止修改
 * Phase 2 Runtime Orchestrator，這裡也完全不import
 * `src/intelligence/orchestration/`底下任何檔案，兩者互不認識。
 *
 * Capability Orchestrator只負責四件事（規格明確列出，不多不少）：
 * - 接收 intelligence capability request（`{context, options?}`
 *   形狀，跟Analysis Capability的request形狀完全一致——因為
 *   Orchestrator就是從Analysis這一段開始整條Flow）
 * - 呼叫 Analysis Capability（透過依賴注入拿到的
 *   `analysisCapability.requestAnalysis()`）
 * - 將 Analysis Result 傳遞給 Recommendation Capability（透過依賴
 *   注入拿到的`recommendationCapability.requestRecommendation()`，
 *   轉交的是Analysis Capability回傳的`result`欄位，包成
 *   Recommendation Capability要求的`{analysisResult}`形狀）
 * - 回傳 Unified Capability Result（透過
 *   `capability_result_builder.js`統一包裝，見該檔案的說明）
 *
 * 明確要求（Capability Orchestrator may call / must NOT call）：
 * - ✅ 只能呼叫 Analysis Capability 跟 Recommendation Capability
 *   （各自的`requestAnalysis()`/`requestRecommendation()`）
 * - ❌ 不直接呼叫 Analysis Runner/Recommendation
 *   Runner（不import`src/intelligence/analysis/`、
 *   `src/intelligence/recommendation/`——Orchestrator只認識
 *   Capability這一層，不繞過Capability直接摸Runtime層，維持
 *   TASK1.76/1.77建立的邊界）
 * - ❌ 不直接存取 Database（不 import src/db/ 底下任何檔案，這個
 *   檔案完全不接受db參數，也不知道db是什麼）
 * - ❌ 不直接存取 Auth/Session（不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/，完全不接受userId/session
 *   相關參數）
 * - ❌ 不直接呼叫 Execution Manager（不 import
 *   src/intelligence/execution/）
 * - ❌ 不直接存取 History Store、Metrics Store、Event
 *   Dispatcher（不 import src/intelligence/history/、
 *   src/intelligence/metrics/、src/intelligence/events/——規格
 *   這次額外明確列出event dispatcher，是前兩個Capability規格沒有
 *   單獨列出的一項，這裡忠實遵守）
 * - ❌ 不 import src/intelligence/facade/、service/、
 *   orchestration/、data_preparation/、governance/、
 *   application/（規格明確禁止修改Phase 3 Application
 *   Pattern，這裡也完全不認識Application Layer的存在，也不認識
 *   Phase 2 Runtime Orchestrator）
 * - ❌ 不呼叫任何AI Provider/AI SDK、不建立任何Prompt Logic
 *
 * 其他既有規則：
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/
 * - deterministic：跟Analysis Capability/Recommendation
 *   Capability一樣，同樣的輸入永遠得到完全相同的輸出，不讀取
 *   Date.now()/Math.random()
 *
 * 跟`analysis_capability.js`（TASK1.76）/
 * `recommendation_capability.js`（TASK1.77）一樣維持既有慣例——
 * 自己內建一份最小的request驗證，不重用其他層的驗證函式；
 * `context`欄位是否為合法的Insight Context這件事，交給Analysis
 * Capability內部（進而Analysis Runner內部）既有的驗證負責，
 * Orchestrator只做「這是不是一個物件」這種最外層的形狀檢查。
 *
 * 本次任務**沒有**把這個Orchestrator接進
 * `src/bootstrap/application.js`的`intelligence`物件，也**沒有**
 * 讓任何既有Feature（Insight/Behavior）呼叫它——這是刻意的邊界
 * 決策，跟TASK1.76/1.77同樣的模式：「建立但不改變既有execution
 * behavior」，用測試證明Analysis + Recommendation可以被安全組合
 * 執行即可，接不接進真實Feature留給未來任務決定。
 */
import { createCapabilityOrchestratorResultBuilder } from './capability_result_builder.js';

const CAPABILITY_NAME = 'orchestration';

/**
 * 驗證 requestCapabilityFlow() 的 request 輸入——跟
 * `analysis_capability.js`的`validateAnalysisCapabilityRequest()`
 * 完全一樣的最外層形狀檢查（request本身是否為物件、context是否為
 * 物件、options存在時是否為物件），因為Orchestrator的request就是
 * Analysis這一段的request——不重複實作、也不import對方的驗證函式
 * （維持既有「每個Feature/Capability目錄自我完整、不跨目錄import
 * 實作細節」的慣例），只是恰好形狀相同。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateCapabilityOrchestratorRequest(request) {
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
 * @param {{requestAnalysis: Function}} dependencies.analysisCapability
 * @param {{requestRecommendation: Function}} dependencies.recommendationCapability
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{requestCapabilityFlow: (request:{context:object, options?:object}) => {ok:true, capability:'orchestration', result:{analysis:object, recommendation:object}}|{ok:false, capability:'orchestration', reason:string, field?:string, stage?:string}}}
 */
export function createCapabilityOrchestrator(dependencies) {
  dependencies = dependencies || {};
  const { analysisCapability, recommendationCapability } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createCapabilityOrchestratorResultBuilder();

  /**
   * Feature唯一需要呼叫的「組合Analysis + Recommendation」進入點：
   * 驗證輸入 → 呼叫Analysis Capability → 把Analysis Result轉交給
   * Recommendation Capability → 回傳穩定的Unified Capability
   * Result。任何一步失敗都立刻回傳
   * {ok:false, capability:'orchestration', reason, field?, stage?}，
   * 不會用不完整的資料頂替繼續執行。這是同步函式，跟Analysis
   * Capability/Recommendation Capability本身的同步簽名完全一致。
   *
   * @param {{context:object, options?:object}} request - 結構化
   *   intelligence capability request，形狀跟Analysis
   *   Capability的request完全相同，Orchestrator原樣轉交
   * @returns {{ok:true, capability:'orchestration', result:{analysis:object, recommendation:object}}|{ok:false, capability:'orchestration', reason:string, field?:string, stage?:string}}
   */
  function requestCapabilityFlow(request) {
    const validation = validateCapabilityOrchestratorRequest(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(validation.reason);
    }

    if (!analysisCapability || typeof analysisCapability.requestAnalysis !== 'function') {
      return resultBuilder.buildFailureResult('analysis_capability_unavailable');
    }

    const analysisOutcome = analysisCapability.requestAnalysis({ context: request.context, options: request.options });
    if (!analysisOutcome.ok) {
      return resultBuilder.buildFailureResult(analysisOutcome.reason, analysisOutcome.field, 'analysis');
    }

    if (!recommendationCapability || typeof recommendationCapability.requestRecommendation !== 'function') {
      return resultBuilder.buildFailureResult('recommendation_capability_unavailable');
    }

    const recommendationOutcome = recommendationCapability.requestRecommendation({ analysisResult: analysisOutcome.result });
    if (!recommendationOutcome.ok) {
      return resultBuilder.buildFailureResult(recommendationOutcome.reason, recommendationOutcome.field, 'recommendation');
    }

    return resultBuilder.buildSuccessResult(analysisOutcome.result, recommendationOutcome.result);
  }

  return { requestCapabilityFlow };
}

/*
 * Phase 6 TASK 1.111｜Health Insight Feature Foundation
 * Implementation
 * - Health Insight Feature
 *
 * 責任：依照TASK1.106~1.110規劃的方向，第一次把"Health Insight
 * Feature"這個Product Activation規劃概念落地成最小可運作的
 * 骨架——這是Phase 6系列**第一個**寫production code的任務（之前
 * TASK1.106~1.110全部是純規劃/文件任務）。這個檔案本身**不**呼叫
 * AI、**不**建立Prompt Logic、**不**修改Analysis
 * Capability/Recommendation Capability/Decision
 * Capability/Capability Orchestrator/Phase 2 Runtime/Phase 3
 * Application Layer/五個既有Product Boundary
 * （Entry/Adapter/Execution/Operational/Contract）——單純是
 * Product層級的Feature：接收Product-level request、呼叫既有
 * Capability Orchestrator、把Unified Capability Result轉換成
 * Health Insight formatted output。
 *
 * 架構位置（延續TASK1.111規格原文Architecture Flow，簡化版的
 * Health Insight Implementation Flow，對照TASK1.110第3節完整
 * 九層規劃的其中一段）：
 *
 *   Product Layer（未來，本次任務不建立呼叫端）
 *     ↓
 *   Health Insight Feature（這裡）
 *     ↓（透過依賴注入拿到的capabilityOrchestrator介面）
 *   Capability Orchestrator（TASK1.78，完全不修改）
 *     ↓
 *   Analysis Capability（TASK1.76，完全不修改）
 *     ↓
 *   Recommendation Capability（TASK1.77，完全不修改）
 *     ↓
 *   Runtime（Phase 2，完全不修改）
 *
 * 這條鏈路刻意比照`../../../application/features/intelligence/
 * intelligence_feature.js`（TASK1.79）同樣的"Feature直接呼叫
 * Capability Orchestrator"設計——兩者是**平行**存在、互不認識的
 * 兩個Feature層級入口（延續TASK1.79既有文件"Insight/Behavior
 * Feature跟Intelligence Feature是兩條刻意平行、互不交叉的路徑"
 * 結論，Health Insight Feature是這個平行結構的**第三條**路徑），
 * 差異只在於：Intelligence Feature（TASK1.79）產生的是**通用**
 * 的`{analysis, recommendation}`Feature Output，Health Insight
 * Feature（這裡）產生的是**Health Insight特定**的
 * `{healthObservation, behaviorPattern, recommendation,
 * progressTrend, decision}`Product Output（延續TASK1.108
 * Output Boundary Definition的四類輸出 + 一個decision
 * placeholder），這是TASK1.110第2節"Application/Feature
 * Layer"已經規劃的"Health Insight Feature需要新實作"結論的落地。
 *
 * Health Insight Feature只負責三件事（規格明確列出，不多不少）：
 * - 接收 Product-level request（`{context, options?}`形狀，跟
 *   Analysis Capability/Capability Orchestrator/Intelligence
 *   Feature的request形狀完全一致——延續既有慣例，不需要重新定義
 *   新的request形狀）
 * - 呼叫 Capability Orchestrator（透過依賴注入拿到的
 *   `capabilityOrchestrator.requestCapabilityFlow()`——唯一允許
 *   呼叫的下一層）
 * - 將 Unified Capability Result 轉換為 Health Insight formatted
 *   result（透過`./health_insight_result_mapper.js`）
 *
 * 明確要求（Health Insight Feature may call / must NOT call，
 * 逐一對應TASK1.111 Forbidden清單）：
 * - ✅ 只能呼叫 Capability Orchestrator
 *   （`capabilityOrchestrator.requestCapabilityFlow()`）
 * - ❌ 不繞過Capability Orchestrator直接呼叫Analysis
 *   Capability/Recommendation Capability/Decision
 *   Capability（不import`capabilities/analysis/`、
 *   `capabilities/recommendation/`、`capabilities/decision/`底下
 *   任何實作檔案）
 * - ❌ 不直接呼叫Analysis Runner/Recommendation Runner（不import
 *   `src/intelligence/analysis/`、`src/intelligence/recommendation/`）
 * - ❌ 不import Phase 3 Application Layer（`application/`底下
 *   任何實作檔案，包含既有的Intelligence Feature/Insight
 *   Feature/Behavior Feature）——這條鏈路完全不經過Phase 3既有的
 *   Application Pattern，也不重用Intelligence Feature
 *   Integration（TASK1.79）本身，而是直接呼叫Capability
 *   Orchestrator，維持TASK1.111規格畫出的Architecture Flow
 * - ❌ 不import五個既有Product Boundary
 *   （`../../entry/`、`../../adapter/`、`../../execution/`、
 *   `../../operational/`、`../../contract/`底下任何實作
 *   檔案）——Health Insight Feature是Product Boundary
 *   之後、Capability之前的獨立層級，不繞過/不重複實作既有
 *   Boundary的職責，也不假設自己會被哪個Boundary呼叫
 * - ❌ 不直接存取 Database（不import src/db/底下任何檔案，這個
 *   檔案完全不接受db參數，也不知道db是什麼）
 * - ❌ 不直接存取 Auth/Session（不import src/auth/、
 *   src/oauth/、src/identity/、src/middleware/，完全不接受
 *   userId/session相關參數——延續TASK1.111 Request Boundary
 *   "The Feature should not directly consume: authentication
 *   data, session data, database objects"的明確要求）
 * - ❌ 不直接呼叫 Execution Manager（不import
 *   src/intelligence/execution/）
 * - ❌ 不直接存取 History Store、Metrics Store、Event Dispatcher
 * - ❌ 不import src/intelligence/service/、orchestration/
 *   （Phase 2 Runtime Orchestrator）、data_preparation/、
 *   governance/、facade/
 * - ❌ 不呼叫任何AI Provider/AI SDK、不建立任何Prompt Logic
 *
 * 其他既有規則：
 * - No HTTP：不知道 Request/Response 是什麼，不import任何路由/
 *   controller
 * - No Authentication parsing：不import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/
 * - deterministic：跟Capability Orchestrator/Analysis
 *   Capability/Recommendation Capability一樣，同樣的輸入永遠
 *   得到完全相同的輸出，不讀取Date.now()/Math.random()
 *
 * ## Error Boundary（延續TASK1.111 Implementation Requirements
 * 第4節）
 *
 * 跟`intelligence_feature.js`（TASK1.79，信任Capability鏈路
 * 完全deterministic、不包try/catch）刻意不同——TASK1.111規格
 * 明確要求Health Insight Feature要處理三類錯誤：
 * - **invalid input**：`validateHealthInsightRequest()`檢查
 *   request/context/options的最外層形狀，失敗時標記
 *   `stage:'request'`
 * - **capability failure**：呼叫
 *   `capabilityOrchestrator.requestCapabilityFlow()`本身拋出
 *   未預期例外時，用try/catch攔截，轉換成通用的
 *   `capability_execution_failed`錯誤碼，標記
 *   `stage:'capability'`，**不**把原始例外的stack
 *   trace或內部訊息往外傳遞；Capability Orchestrator正常回傳
 *   `{ok:false}`時，原樣轉換成Health Insight Feature自己的
 *   失敗結果，標記`stage`為Orchestrator轉發的
 *   'analysis'|'recommendation'|'decision'
 * - **mapping failure**：呼叫
 *   `resultMapper.mapSuccessResult()`本身拋出未預期例外時
 *   （例如Capability回傳形狀不符預期），同樣用try/catch攔截，
 *   轉換成`mapping_failed`錯誤碼，標記`stage:'mapping'`，同樣
 *   不暴露原始例外訊息
 */
import { createHealthInsightResultMapper } from './health_insight_result_mapper.js';

const FEATURE_NAME = 'health_insight';

/**
 * 驗證 requestHealthInsight() 的 request 輸入——跟
 * `capabilities/orchestration/capability_orchestrator.js`的
 * `validateCapabilityOrchestratorRequest()`完全一樣的最外層形狀
 * 檢查（request本身是否為物件、context是否為物件、options存在時
 * 是否為物件），因為Health Insight Feature的request就是
 * Capability Orchestrator的request——不重複實作、也不import對方
 * 的驗證函式（維持既有「每個Feature/Capability目錄自我完整、不
 * 跨目錄import實作細節」的慣例），只是恰好形狀相同。這裡刻意**不**
 * 檢查/接受`userId`、`session`、`db`等欄位——延續TASK1.111
 * Request Boundary的明確要求，Health Insight Feature不直接
 * 消費authentication/session/database物件。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateHealthInsightRequest(request) {
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
 * @param {{requestCapabilityFlow: (request:object) => {ok:boolean, result?:object, reason?:string, field?:string, stage?:string}}} [dependencies.capabilityOrchestrator] - 選填。沒有提供、或提供的物件沒有requestCapabilityFlow函式時，requestHealthInsight()回傳capability_orchestrator_unavailable失敗，不拋出例外。
 * @param {{mapSuccessResult: Function, mapFailureResult: Function}} [dependencies.resultMapper]
 * @returns {{requestHealthInsight: (request:{context:object, options?:object}) => {ok:true, feature:'health_insight', data:{healthObservation:Array, behaviorPattern:Array, recommendation:Array, progressTrend:object, decision:null}}|{ok:false, feature:'health_insight', reason:string, field?:string, stage?:string}}}
 */
export function createHealthInsightFeature(dependencies) {
  dependencies = dependencies || {};
  const { capabilityOrchestrator } = dependencies;
  const resultMapper = dependencies.resultMapper || createHealthInsightResultMapper();

  /**
   * 未來Product Layer（本次任務不建立）唯一需要呼叫的「Health
   * Insight Capability Flow」Feature入口：驗證輸入 → 呼叫
   * Capability Orchestrator（唯一允許呼叫的下一層）→ 用
   * `health_insight_result_mapper.js`轉換成Health Insight
   * formatted result。任何一步失敗都立刻回傳結構化的失敗結果
   * `{ok:false, feature:'health_insight', reason, field?,
   * stage?}`，不會用不完整的資料頂替繼續執行，也不會把原始例外
   * 訊息/stack trace往外傳遞。這是同步函式，跟Capability
   * Orchestrator本身的同步簽名完全一致。
   *
   * @param {{context:object, options?:object}} request - Health
   *   Insight Product-level request，`context`是Insight
   *   Context形狀的物件，`options`原樣轉交給Capability
   *   Orchestrator，這裡完全不解讀其內容
   * @returns {{ok:true, feature:'health_insight', data:{healthObservation:Array, behaviorPattern:Array, recommendation:Array, progressTrend:object, decision:null}}|{ok:false, feature:'health_insight', reason:string, field?:string, stage?:string}}
   */
  function requestHealthInsight(request) {
    const validation = validateHealthInsightRequest(request);
    if (!validation.ok) {
      return resultMapper.mapFailureResult(validation.reason, undefined, 'request');
    }

    if (!capabilityOrchestrator || typeof capabilityOrchestrator.requestCapabilityFlow !== 'function') {
      return resultMapper.mapFailureResult('capability_orchestrator_unavailable', undefined, 'capability');
    }

    let outcome;
    try {
      outcome = capabilityOrchestrator.requestCapabilityFlow({ context: request.context, options: request.options });
    } catch (e) {
      return resultMapper.mapFailureResult('capability_execution_failed', undefined, 'capability');
    }

    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
      return resultMapper.mapFailureResult('capability_invalid_result', undefined, 'capability');
    }

    if (!outcome.ok) {
      return resultMapper.mapFailureResult(outcome.reason, outcome.field, outcome.stage);
    }

    try {
      return resultMapper.mapSuccessResult(outcome.result);
    } catch (e) {
      return resultMapper.mapFailureResult('mapping_failed', undefined, 'mapping');
    }
  }

  return { requestHealthInsight };
}

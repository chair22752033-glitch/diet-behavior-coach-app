/*
 * Phase 5 TASK 1.101｜Product Execution Boundary Minimal Implementation
 * - Product Execution
 *
 * 責任：依照TASK1.95 Product Intelligence Execution Boundary
 * Foundation規劃的方向，第一次把"Execution Boundary"這個規劃
 * 概念落地成最小可運作的骨架——這是Phase 5系列**第三個**寫
 * production code的任務（前兩個是TASK1.99 Product Entry、
 * TASK1.100 Product Adapter）。這個檔案本身**不**呼叫AI、**不**
 * 建立Prompt Logic、**不**修改worker.js/routes/controllers/
 * Analysis Runner/Recommendation Runner/Phase 2 Runtime
 * Orchestrator/Phase 3 Application Pattern/Phase 4 Capability
 * Architecture——單純是Intelligence Adapter跟Feature Intelligence
 * Integration之間的**執行管控層**：接收Intelligence execution
 * request、管理執行生命週期狀態、呼叫依賴注入的Intelligence
 * Feature、正規化成功結果、分類執行失敗。
 *
 * 架構位置（延續TASK1.95規劃的Flow）：
 *
 *   Product Entry（TASK1.99，完全不修改）
 *     ↓
 *   Product Adapter（TASK1.100，完全不修改）
 *     ↓（透過依賴注入拿到的intelligenceFeature介面呼叫，跟呼叫
 *        真正的Feature完全相同的方式）
 *   Product Execution Boundary（這裡）
 *     ↓（透過依賴注入拿到的intelligenceFeature介面）
 *   Feature Intelligence Integration（TASK1.79，完全不修改）
 *     ↓
 *   Capability Orchestrator / Analysis+Recommendation Capability（既有，完全不修改）
 *
 * 刻意的"透明代理"設計：Execution Boundary對外暴露跟Feature
 * Intelligence Integration完全相同的介面——`requestIntelligence
 * (request)`，回傳形狀也完全比照
 * `intelligence_feature_result_mapper.js`既有的
 * `{ok:true, feature:'intelligence', data}`/`{ok:false,
 * feature:'intelligence', reason, field?, stage?}`（額外附加
 * `boundary`/`category`欄位，下游忽略即可）。這代表Adapter
 * （TASK1.100）完全不需要修改任何程式碼，只要把原本注入的
 * `intelligenceFeature`依賴換成`createProductExecution({
 * intelligenceFeature: 真正的Feature })`回傳的物件，就可以在
 * Adapter跟Feature之間插入這一層Execution Boundary——這正是
 * TASK1.95規劃文件"Ownership"章節"Execution Boundary規劃上是
 * Intelligence Adapter內部一段邏輯"的精神：即使本次任務把它
 * 落地成獨立目錄/模組（規格明確要求），介面設計上依然維持"對
 * Adapter完全透明"的效果，不需要修改Adapter任何程式碼（延續
 * Completion Criteria要求的Adapter compatibility）。
 *
 * Product Execution只負責五件事（規格明確列出，不多不少）：
 * - 接收 Intelligence execution request（`{context, options?}`
 *   形狀，跟Feature Intelligence Integration/Capability
 *   Orchestrator的request形狀完全一致）
 * - 管理執行生命週期狀態（見下方Execution Lifecycle，延續
 *   TASK1.95規劃的五個階段：request received/validation
 *   completed/execution started/execution completed/execution
 *   failed——這是規劃層級的邏輯狀態追蹤，不是要求外洩給下游的
 *   資料欄位，這裡透過`getLastExecutionState()`提供純粹用於
 *   introspection/測試的存取方式，不屬於`requestIntelligence()`
 *   本身的request/response contract）
 * - 呼叫依賴注入的 Intelligence Feature（
 *   `intelligenceFeature.requestIntelligence()`——唯一允許呼叫的
 *   下一層，延續TASK1.95"Execution Boundary唯一呼叫的下游是
 *   Feature Intelligence Integration"的規則）
 * - 正規化成功結果（`execution completed`狀態下原樣把`data`
 *   欄位往上傳遞，不新增不修改任何欄位內容，延續Result Handling
 *   Boundary的Success Handling規則）
 * - 分類執行失敗（見下方Failure Recovery Boundary的五種分類，
 *   本次實作能具體區分其中三種：`contract_failure`/
 *   `feature_failure`/`runtime_failure`——`adapter_failure`跟
 *   `capability_failure`延續TASK1.95文件已明確記錄的限制：前者
 *   發生在Adapter層、根本不會進入Execution Boundary；後者跟
 *   `feature_failure`在目前架構下無法區分，是Phase 4既有封裝
 *   設計的自然結果，不是本次任務要解決的問題）
 *
 * ## Execution Lifecycle（延續TASK1.95規劃的五階段）
 *
 * ```
 * request received
 *   ↓
 * validation completed
 *   ↓
 * execution started
 *   ↓
 * execution completed（成功終止狀態）
 *   或
 * execution failed（失敗終止狀態，跟completed互斥）
 * ```
 *
 * - `request received`：收到Adapter轉換完成的`{context,
 *   options?}`，此時尚未呼叫Feature。
 * - `validation completed`：確認`{context, options?}`最外層
 *   形狀本身沒有問題（只做防禦性的結構安全檢查，不重複
 *   Capability Orchestrator既有的`validateCapabilityOrchestratorRequest()`，
 *   延續TASK1.95"Adapter/Execution Boundary不重新驗證"的規劃）。
 * - `execution started`：實際呼叫`intelligenceFeature.
 *   requestIntelligence()`的那一刻。
 * - `execution completed`/`execution failed`：呼叫完成後的兩種
 *   互斥終止狀態。
 *
 * `request received`→`validation completed`→`execution
 * started`是嚴格循序的（Contract Failure會在`validation
 * completed`之前就中止，不會進入`execution started`）。
 *
 * ## Failure Recovery Boundary（延續TASK1.95規劃的五種分類）
 *
 * - **Contract Failure**：`{context, options?}`最外層形狀本身
 *   不合法（例如`context`不是物件）——不會呼叫Feature，Recovery
 *   策略是直接往上回報，不重試。
 * - **Adapter Failure**：發生在Adapter層，不會進入Execution
 *   Boundary（本次實作不處理，記錄在README的Known
 *   Limitations）。
 * - **Feature Failure**：Feature Intelligence Integration/
 *   Capability Orchestrator回傳`{ok:false, reason, field?,
 *   stage?}`——已經進入`execution started`階段，Recovery策略是
 *   不重試，原樣往上傳遞。
 * - **Capability Failure**：跟Feature Failure在目前架構下是
 *   同一件事（Phase 4既有封裝設計的自然結果），本次實作統一
 *   歸類為`feature_failure`。
 * - **Runtime Failure**：`requestIntelligence()`本身拋出未預期
 *   例外——用`try/catch`攔截，強制轉換成`execution failed`
 *   終止狀態，不允許例外真的往上游擴散，不洩漏原始例外訊息。
 *
 * 五種失敗來源裡，**只有Runtime Failure需要主動攔截**（因為它是
 * 例外，不是正常回傳值）；Contract/Feature Failure都是既有的
 * `{ok:false,...}`回傳路徑或防禦性檢查，不需要額外try/catch。
 * **沒有任何一種失敗會觸發自動重試**（延續TASK1.95"Intelligence
 * Chain目前是deterministic的，重試不會改變結果"的明確決定）。
 *
 * 明確要求（Product Execution may call / must NOT call）：
 * - ✅ 只能呼叫依賴注入拿到的`intelligenceFeature`介面
 *   （`requestIntelligence()`）
 * - ❌ 不得繞過Feature Intelligence Integration直接呼叫Capability
 *   Orchestrator/Analysis Capability/Recommendation Capability
 *   （不import`src/intelligence/capabilities/`、
 *   `src/intelligence/analysis/`、
 *   `src/intelligence/recommendation/`、
 *   `src/intelligence/application/`底下任何實作檔案）
 * - ❌ 不得直接存取Database（不import`src/db/`，完全不接受db
 *   參數）
 * - ❌ 不得直接存取Auth/Session（不import`src/auth/`、
 *   `src/oauth/`、`src/identity/`、`src/middleware/`）
 * - ❌ 不得知道HTTP是什麼（不import任何路由/controller檔案）
 * - ❌ 不得呼叫任何AI Provider/AI SDK、不得建立任何Prompt
 *   Logic、Decision Algorithm、Rule Engine、Scoring Logic
 *
 * 其他既有規則：
 * - deterministic：跟既有Capability/Entry/Adapter一樣，同樣的
 *   輸入永遠得到完全相同的輸出，不讀取Date.now()/Math.random()
 * - 沒有任何重試機制（延續TASK1.95的明確決定）
 *
 * 本次任務**沒有**把這個Product Execution接進
 * `src/bootstrap/application.js`，也**沒有**修改Product
 * Adapter（TASK1.100）任何程式碼——這是刻意的邊界決策，延續
 * Phase 4/Phase 5系列一貫的"建立但不改變既有execution
 * behavior"模式。
 */
import { createProductExecutionResultBuilder } from './product_execution_result_builder.js';

/**
 * 建立一份全新的Execution Lifecycle狀態追蹤器——每次
 * `requestIntelligence()`呼叫都會建立獨立的一份，反映"這五個
 * 階段全部發生在單一次同步函式呼叫的生命週期內"（延續TASK1.95
 * Known Limitation：目前所有Capability都是同步函式）。
 *
 * @returns {{stage:string, transitions:string[], transitionTo:(next:string)=>void}}
 */
function createExecutionState() {
  const state = { stage: 'idle', transitions: [] };
  state.transitionTo = function transitionTo(next) {
    state.transitions.push(next);
    state.stage = next;
  };
  return state;
}

/**
 * 驗證 requestIntelligence() 的 request 輸入——只做防禦性的
 * 結構安全檢查（request本身是否為物件、request.context是否為
 * 物件），對應Failure Recovery Boundary的Contract
 * Failure分類，不重複Capability Orchestrator既有的
 * `validateCapabilityOrchestratorRequest()`（延續TASK1.95
 * "Execution Boundary不重新驗證"的規劃）。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
function validateExecutionRequestShape(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_execution_request' };
  }
  if (!request.context || typeof request.context !== 'object' || Array.isArray(request.context)) {
    return { ok: false, reason: 'invalid_context', field: 'context' };
  }
  return { ok: true };
}

/**
 * @param {object} dependencies
 * @param {{requestIntelligence: Function}} [dependencies.intelligenceFeature] - 選填。沒有提供、或提供的物件沒有requestIntelligence函式時，requestIntelligence()回傳intelligence_feature_unavailable失敗（Contract Failure，不會進入execution started階段）。
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{
 *   requestIntelligence: (request:{context:object, options?:object}) => {ok:true, feature:'intelligence', boundary:'product-execution', data:object}|{ok:false, feature:'intelligence', boundary:'product-execution', reason:string, field?:string, stage?:string, category?:string},
 *   getLastExecutionState: () => {stage:string, transitions:string[]}
 * }}
 */
export function createProductExecution(dependencies) {
  dependencies = dependencies || {};
  const { intelligenceFeature } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createProductExecutionResultBuilder();

  let lastState = createExecutionState();

  /**
   * Product Adapter（TASK1.100）唯一需要呼叫的執行入口——介面
   * 跟Feature Intelligence Integration本身的`requestIntelligence()`
   * 完全相同（透明代理設計）。管理五階段Execution Lifecycle：
   * 驗證輸入形狀（Contract Failure提前中止）→ 呼叫Intelligence
   * Feature（用try/catch攔截Runtime Failure）→ 正規化成功結果或
   * 分類失敗（Feature Failure原樣傳遞）。這是同步函式，跟
   * Feature Intelligence Integration本身的同步簽名一致。
   *
   * @param {{context:object, options?:object}} request
   * @returns {{ok:true, feature:'intelligence', boundary:'product-execution', data:object}|{ok:false, feature:'intelligence', boundary:'product-execution', reason:string, field?:string, stage?:string, category?:string}}
   */
  function requestIntelligence(request) {
    const state = createExecutionState();
    lastState = state;
    state.transitionTo('request_received');

    const validation = validateExecutionRequestShape(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(validation.reason, validation.field, undefined, 'contract_failure');
    }

    state.transitionTo('validation_completed');

    if (!intelligenceFeature || typeof intelligenceFeature.requestIntelligence !== 'function') {
      return resultBuilder.buildFailureResult('intelligence_feature_unavailable', undefined, undefined, 'contract_failure');
    }

    state.transitionTo('execution_started');

    let outcome;
    try {
      outcome = intelligenceFeature.requestIntelligence(request);
    } catch (e) {
      state.transitionTo('execution_failed');
      return resultBuilder.buildFailureResult('internal_error', undefined, undefined, 'runtime_failure');
    }

    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
      state.transitionTo('execution_failed');
      return resultBuilder.buildFailureResult('intelligence_invalid_result', undefined, undefined, 'runtime_failure');
    }

    if (!outcome.ok) {
      state.transitionTo('execution_failed');
      return resultBuilder.buildFailureResult(outcome.reason, outcome.field, outcome.stage, 'feature_failure');
    }

    state.transitionTo('execution_completed');
    return resultBuilder.buildSuccessResult(outcome.data);
  }

  /**
   * Introspection-only存取方式，回傳最近一次`requestIntelligence()`
   * 呼叫的Execution Lifecycle狀態——**不屬於**
   * `requestIntelligence()`本身的request/response
   * contract，Product/Adapter層不會（也不應該）讀取這個函式，
   * 純粹是為了讓Execution Boundary自己的行為可以被獨立測試/
   * 觀察（延續TASK1.95"這五個階段目前是規劃概念，不是要往上游
   * 傳遞的資料欄位"的Hidden Internal State規則）。
   *
   * @returns {{stage:string, transitions:string[]}}
   */
  function getLastExecutionState() {
    return { stage: lastState.stage, transitions: lastState.transitions.slice() };
  }

  return { requestIntelligence, getLastExecutionState };
}

/*
 * Phase 4 TASK 1.83｜Decision Capability Foundation
 * - Decision Capability
 *
 * 責任：依照TASK1.82 Decision Capability Boundary Architecture
 * Review的審查結論（建議選項B：Independent Decision
 * Capability），建立Phase 4第四個獨立的Intelligence Capability
 * Boundary——比照Analysis Capability（TASK1.76）/Recommendation
 * Capability（TASK1.77）完全相同的架構模式，各自獨立存在、互不
 * import。這個檔案本身**不**建立Decision Algorithm、**不**建立
 * Rule Engine、**不**呼叫AI、**不**建立Prompt Logic——單純是一層
 * 薄的邊界包裝：接收Recommendation Result、驗證輸入結構、產生
 * 結構化的Decision Output佔位形狀。
 *
 * 架構位置（規格原文）：
 *
 *   Feature（未來擴充，本次任務不新增/不修改任何Feature）
 *     ↓
 *   Capability Orchestrator（TASK1.78，本次任務完全不修改）
 *     ↓
 *   Recommendation Capability（TASK1.77，完全不修改）
 *     ↓
 *   Decision Capability（這裡）
 *     ↓
 *   Decision Output
 *
 * 注意：本次任務**沒有**修改`capability_orchestrator.js`——
 * `requestCapabilityFlow()`目前依然只呼叫Analysis Capability跟
 * Recommendation Capability兩層，不會自動呼叫這裡的Decision
 * Capability（規格明確禁止「修改Existing Capability Logic」）。
 * Decision Capability目前是完全獨立、可以被單獨import/單獨測試的
 * 邊界，跟Analysis/Recommendation Capability在TASK1.76/1.77
 * 建立當下的狀態完全一樣——「已建立但未接線」，是否要讓
 * Capability Orchestrator接上Decision，留給未來任務決定（見
 * TASK1.82審查文件「Capability Design Options」章節記錄的擴充
 * 方式）。
 *
 * Decision Capability只負責三件事（規格明確列出，不多不少）：
 * - 接收 Recommendation Result（`{recommendationResult}`形狀，
 *   `recommendationResult`是Recommendation Capability
 *   `requestRecommendation()`成功時回傳的`result`欄位）
 * - 驗證輸入結構（只驗證最外層形狀，不解讀`recommendations`
 *   陣列裡每一筆的業務內容）
 * - 產生結構化 Decision Output placeholder（透過
 *   `./decision_result_builder.js`的`buildDecisionOutputPlaceholder()`，
 *   `decision`欄位固定為`null`）
 *
 * 目前明確禁止（規格原文）：
 * - ❌ 加入判斷邏輯——不比較、不排序、不篩選
 *   `recommendationResult.recommendations`裡的任何一筆
 * - ❌ 加入評分邏輯——不計算任何新的分數/信心值/權重
 * - ❌ AI推論——不呼叫任何AI Provider/AI SDK、不建立Prompt Logic
 *
 * 明確要求（Decision Capability may call / must NOT call）：
 * - ✅ 不呼叫任何下一層——這是Architecture Rule畫出的鏈路末端
 *   （Decision Capability → Decision Output），沒有更下游的
 *   Runtime Runner可以呼叫（因為Decision Runner尚未存在）
 * - ❌ 不直接存取 Database（不 import src/db/ 底下任何檔案，這個
 *   檔案完全不接受db參數，也不知道db是什麼——規格明確禁止的捷徑
 *   「Decision Capability → Database」）
 * - ❌ 不直接存取 Auth/Session（不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/，完全不接受userId/session
 *   相關參數——規格明確禁止的捷徑「Decision Capability → Auth」）
 * - ❌ 不直接呼叫 Execution Manager（不 import
 *   src/intelligence/execution/）
 * - ❌ 不直接存取 History Store、Metrics Store、Event Dispatcher
 * - ❌ 不 import src/intelligence/facade/、service/、
 *   orchestration/、data_preparation/、analysis/、recommendation/、
 *   governance/、application/（不認識Phase 2 Runtime Orchestrator/
 *   Phase 3 Application Layer的存在，也不繞過Capability層直接
 *   呼叫任何Runner）
 * - ❌ 不呼叫任何AI Provider/AI SDK、不啟用任何AI
 *   Provider（規格明確禁止的捷徑「Decision Capability → AI
 *   Provider」）
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
 * 跟`recommendation_capability.js`（TASK1.77）一樣維持既有慣例——
 * 自己內建一份最小的request驗證，不重用其他層的驗證函式。
 */
import { createDecisionCapabilityResultBuilder, buildDecisionOutputPlaceholder } from './decision_result_builder.js';

const CAPABILITY_NAME = 'decision';

/**
 * 驗證 requestDecision() 的 request 輸入——只檢查這一層自己需要
 * 知道的最外層形狀（request本身是否為物件、recommendationResult
 * 是否為物件），不解讀recommendationResult的內部業務內容。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateDecisionCapabilityRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_request' };
  }
  if (!request.recommendationResult || typeof request.recommendationResult !== 'object' || Array.isArray(request.recommendationResult)) {
    return { ok: false, reason: 'invalid_recommendation_result' };
  }
  return { ok: true };
}

/**
 * @param {object} [dependencies]
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{requestDecision: (request:{recommendationResult:object}) => {ok:true, capability:'decision', result:{status:'decision_not_available', decision:null, metadata:object}}|{ok:false, capability:'decision', reason:string, field?:string}}}
 */
export function createDecisionCapability(dependencies) {
  dependencies = dependencies || {};
  const resultBuilder = dependencies.resultBuilder || createDecisionCapabilityResultBuilder();

  /**
   * Feature/Capability Orchestrator唯一需要呼叫的「Decision能力」
   * 進入點：驗證輸入 → 產生結構化的Decision Output佔位形狀（沒有
   * 任何判斷邏輯/評分邏輯/AI推論）→ 回傳穩定的Decision Capability
   * 結果格式。任何一步失敗都立刻回傳
   * {ok:false, capability:'decision', reason}，不會用不完整的
   * 資料頂替繼續執行。這是同步函式，跟Analysis Capability/
   * Recommendation Capability本身的同步簽名完全一致。
   *
   * @param {{recommendationResult:object}} request - 結構化
   *   decision request，`recommendationResult`是Recommendation
   *   Capability `requestRecommendation()`成功時回傳的`result`
   *   欄位（{status, recommendations, metadata}），這裡完全不
   *   解讀其業務內容，只讀取`recommendations`陣列長度
   * @returns {{ok:true, capability:'decision', result:{status:'decision_not_available', decision:null, metadata:object}}|{ok:false, capability:'decision', reason:string, field?:string}}
   */
  function requestDecision(request) {
    const validation = validateDecisionCapabilityRequest(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(validation.reason);
    }

    const decisionOutput = buildDecisionOutputPlaceholder(request.recommendationResult);
    return resultBuilder.buildSuccessResult(decisionOutput);
  }

  return { requestDecision };
}

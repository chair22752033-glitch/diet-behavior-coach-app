/*
 * Phase 4 TASK 1.77｜Recommendation Capability Execution Foundation
 * - Recommendation Capability
 *
 * 責任：Phase 4第二個Intelligence Capability Execution
 * Boundary——讓Application Feature（未來）可以透過明確的Capability
 * 邊界使用Recommendation Framework（TASK1.44），而不需要直接import
 * `src/intelligence/recommendation/recommendation_runner.js`。這個
 * 檔案本身**不**呼叫AI、**不**建立Prompt Logic、**不**修改
 * Recommendation Runner核心邏輯——單純是一層薄的邊界包裝：接收結構化
 * recommendation request、呼叫既有Recommendation Runner、回傳
 * Recommendation Result。
 *
 * 架構位置（規格原文）：
 *
 *   Feature（未來擴充，本次任務不新增/不修改任何Feature）
 *     ↓
 *   Recommendation Capability（這裡）
 *     ↓
 *   Recommendation Runner（TASK1.44，完全不修改）
 *     ↓
 *   Recommendation Result
 *
 * 跟TASK1.76 Analysis Capability是完全平行、互不認識的兩個
 * Capability——各自直接包裝Runtime層的對應Runner（Analysis
 * Capability包裝Analysis Runner，Recommendation Capability包裝
 * Recommendation Runner），刻意分別放在
 * `src/intelligence/capabilities/analysis/`跟
 * `src/intelligence/capabilities/recommendation/`兩個平行的兄弟
 * 目錄，兩者完全不互相import。
 *
 * Recommendation Capability只負責三件事（規格明確列出，不多不少）：
 * - 接收結構化 recommendation request（`{analysisResult}`形狀，
 *   `analysisResult`是TASK1.43 Analysis Runner產生的Analysis
 *   Result）
 * - 呼叫既有 Recommendation Runner（透過依賴注入拿到的
 *   `recommendationRunner.runRecommendation()`——唯一允許呼叫的
 *   下一層）
 * - 回傳 Recommendation Result（透過
 *   `recommendation_capability_result_builder.js`統一包裝）
 *
 * 注意：Recommendation Runner本身的`runRecommendation(analysisResult)`
 * 只接受單一參數（跟Analysis Runner的
 * `runAnalysis(context, options)`不同，沒有第二個options參數）——
 * 這裡的request形狀刻意只定義`{analysisResult}`一個欄位，忠實對應
 * Recommendation Runner的真實簽名，不無中生有加上一個Runner根本不
 * 會用到的`options`欄位。
 *
 * 明確要求（Recommendation Capability may call / must NOT call）：
 * - ✅ 只能呼叫 Recommendation Runner
 *   （`recommendationRunner.runRecommendation(analysisResult)`）
 * - ❌ 不直接存取 Database（不 import src/db/ 底下任何檔案，這個
 *   檔案完全不接受db參數，也不知道db是什麼——規格明確禁止的捷徑
 *   「Capability → Database」）
 * - ❌ 不直接存取 Auth/Session（不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/，完全不接受userId/session
 *   相關參數）
 * - ❌ 不直接呼叫 Execution Manager（不 import
 *   src/intelligence/execution/——規格明確禁止的捷徑
 *   「Capability → Execution Internal Layer」）
 * - ❌ 不直接存取 History Store、Metrics Store（不 import
 *   src/intelligence/history/、src/intelligence/metrics/）
 * - ❌ 不 import src/intelligence/facade/、service/、
 *   orchestration/、data_preparation/、analysis/、governance/、
 *   application/（規格明確禁止修改Phase 3 Application
 *   Pattern，這裡也完全不認識Application Layer的存在）
 * - ❌ 不呼叫任何AI Provider/AI SDK、不啟用任何AI Provider、不
 *   建立任何Prompt Logic（規格明確禁止「Feature → AI Provider」
 *   這條捷徑，Recommendation Capability本身也完全不知道AI是什麼）
 *
 * 其他既有規則：
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/
 * - deterministic：跟Recommendation Runner本身一樣，同樣的輸入
 *   永遠得到完全相同的輸出，不讀取Date.now()/Math.random()
 *
 * 跟`analysis_capability.js`（TASK1.76）一樣維持既有慣例——自己
 * 內建一份最小的request驗證，不重用其他層的驗證函式；
 * `analysisResult`欄位是否為合法的Analysis Result這件事，交給
 * Recommendation Runner內部既有的`validateAnalysisResult()`負責
 * （Recommendation Capability只做「這是不是一個物件」這種最外層的
 * 形狀檢查，不重複驗證Analysis Result的內部欄位細節）。
 *
 * 本次任務**沒有**把這個Capability接進
 * `src/bootstrap/application.js`的`intelligence`物件，也**沒有**
 * 讓任何既有Feature（Insight/Behavior）呼叫它——這是刻意的邊界
 * 決策，跟TASK1.76 Analysis Capability同樣的模式：「建立但不改變
 * 既有execution behavior」，用測試證明Recommendation Framework
 * 事實上可以被安全消費即可，接不接進真實Feature留給未來任務決定。
 */
import { createRecommendationCapabilityResultBuilder } from './recommendation_capability_result_builder.js';

const CAPABILITY_NAME = 'recommendation';

/**
 * 驗證 requestRecommendation() 的 request 輸入——只檢查這一層自己
 * 需要知道的最外層形狀（request本身是否為物件、analysisResult是否
 * 為物件），不解讀analysisResult的內部業務內容（那是Recommendation
 * Runner內部`validateAnalysisResult()`的責任）。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateRecommendationCapabilityRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_request' };
  }
  if (!request.analysisResult || typeof request.analysisResult !== 'object' || Array.isArray(request.analysisResult)) {
    return { ok: false, reason: 'invalid_analysis_result' };
  }
  return { ok: true };
}

/**
 * @param {object} dependencies
 * @param {{runRecommendation: (analysisResult:object) => {ok:boolean, result?:object, reason?:string, field?:string}}} dependencies.recommendationRunner
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{requestRecommendation: (request:{analysisResult:object}) => {ok:true, capability:'recommendation', result:{status:string, recommendations:Array, metadata:object}}|{ok:false, capability:'recommendation', reason:string, field?:string}}}
 */
export function createRecommendationCapability(dependencies) {
  dependencies = dependencies || {};
  const { recommendationRunner } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createRecommendationCapabilityResultBuilder();

  /**
   * Feature唯一需要呼叫的「Recommendation能力」進入點：驗證輸入 →
   * 呼叫Recommendation Runner（唯一允許呼叫的下一層）→ 回傳穩定的
   * Recommendation Capability結果格式。任何一步失敗都立刻回傳
   * {ok:false, capability:'recommendation', reason}，不會用不完整
   * 的資料頂替繼續執行。這是同步函式，跟Recommendation Runner本身
   * `runRecommendation()`的同步簽名完全一致。
   *
   * @param {{analysisResult:object}} request - 結構化recommendation
   *   request，`analysisResult`是TASK1.43 Analysis Runner產生的
   *   Analysis Result（或TASK1.76 Analysis Capability
   *   `requestAnalysis()`成功時回傳的`result`欄位），這裡完全不
   *   解讀其內容，原樣轉交給Recommendation Runner
   * @returns {{ok:true, capability:'recommendation', result:{status:string, recommendations:Array, metadata:object}}|{ok:false, capability:'recommendation', reason:string, field?:string}}
   */
  function requestRecommendation(request) {
    const validation = validateRecommendationCapabilityRequest(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(validation.reason);
    }

    if (!recommendationRunner || typeof recommendationRunner.runRecommendation !== 'function') {
      return resultBuilder.buildFailureResult('recommendation_runner_unavailable');
    }

    const outcome = recommendationRunner.runRecommendation(request.analysisResult);
    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(outcome.reason, outcome.field);
    }

    return resultBuilder.buildSuccessResult(outcome.result);
  }

  return { requestRecommendation };
}

/*
 * Phase 4 TASK 1.76｜Analysis Capability Execution Foundation
 * - Analysis Capability
 *
 * 責任：這是Phase 4第一個Intelligence Capability Execution
 * Boundary——讓Application Feature（未來）可以透過明確的Capability
 * 邊界使用Analysis Framework（TASK1.43），而不需要直接import
 * `src/intelligence/analysis/analysis_runner.js`。這個檔案本身
 * **不**呼叫AI、**不**建立Prompt Logic、**不**修改Analysis Runner
 * 核心邏輯——單純是一層薄的邊界包裝：接收結構化analysis
 * request、呼叫既有Analysis Runner、回傳Analysis Result。
 *
 * 架構位置（規格原文）：
 *
 *   Feature（未來擴充，本次任務不新增/不修改任何Feature）
 *     ↓
 *   Analysis Capability（這裡）
 *     ↓
 *   Analysis Runner（TASK1.43，完全不修改）
 *     ↓
 *   Analysis Result
 *
 * 這是跟Phase 3 Application Capability（`application/
 * capabilities/insight_capability.js`，TASK1.62）完全不同架構
 * 位置的另一種「Capability」：Phase 3的Capability包裝Use Case
 * Layer（Application鏈路），這裡的Analysis Capability直接包裝
 * Runtime層的Analysis Runner——兩者刻意分別放在
 * `src/intelligence/application/capabilities/`跟
 * `src/intelligence/capabilities/`兩個不同目錄，避免互相混淆。
 *
 * Analysis Capability只負責三件事（規格明確列出，不多不少）：
 * - 接收結構化 analysis request（`{context, options?}`形狀，
 *   `context`是TASK1.42 Insight Context Builder產生的Insight
 *   Context）
 * - 呼叫既有 Analysis Runner（透過依賴注入拿到的
 *   `analysisRunner.runAnalysis()`——唯一允許呼叫的下一層）
 * - 回傳 Analysis Result（透過
 *   `analysis_capability_result_builder.js`統一包裝）
 *
 * 明確要求（Analysis Capability may call / must NOT call）：
 * - ✅ 只能呼叫 Analysis Runner
 *   （`analysisRunner.runAnalysis(context, options)`）
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
 *   orchestration/、data_preparation/、recommendation/、
 *   governance/、application/（規格明確禁止修改Phase 3
 *   Application Pattern，這裡也完全不認識Application Layer的
 *   存在）
 * - ❌ 不呼叫任何AI Provider/AI SDK、不啟用任何AI Provider、不
 *   建立任何Prompt Logic（規格明確禁止「Feature → AI Provider」
 *   這條捷徑，Analysis Capability本身也完全不知道AI是什麼）
 *
 * 其他既有規則：
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/、src/oauth/、
 *   src/identity/、src/middleware/
 * - deterministic：跟Analysis Runner本身一樣，同樣的輸入永遠得到
 *   完全相同的輸出，不讀取Date.now()/Math.random()
 *
 * 跟`application/capabilities/insight_capability.js`（TASK1.62）
 * 一樣維持既有慣例——自己內建一份最小的request驗證，不重用其他層
 * 的驗證函式；`context`欄位是否為合法的Insight Context這件事，
 * 交給Analysis Runner內部既有的`validateInsightContext()`負責
 * （Analysis Capability只做「這是不是一個物件」這種最外層的形狀
 * 檢查，不重複驗證Insight Context的內部欄位細節）。
 *
 * 本次任務**沒有**把這個Capability接進
 * `src/bootstrap/application.js`的`intelligence`物件，也**沒有**
 * 讓任何既有Feature（Insight/Behavior）呼叫它——這是刻意的邊界
 * 決策，跟TASK1.55 Governance Layer/TASK1.63 Contract Layer/
 * TASK1.67 Insight Context/TASK1.68 Insight Output同樣的模式：
 * 「建立但不改變既有execution behavior」，用測試證明Analysis
 * Framework事實上可以被安全消費即可，接不接進真實Feature留給
 * 未來任務決定。
 */
import { createAnalysisCapabilityResultBuilder } from './analysis_capability_result_builder.js';

const CAPABILITY_NAME = 'analysis';

/**
 * 驗證 requestAnalysis() 的 request 輸入——只檢查這一層自己需要
 * 知道的最外層形狀（request本身是否為物件、context是否為物件、
 * options存在時是否為物件），不解讀context的內部業務內容（那是
 * Analysis Runner內部`validateInsightContext()`的責任）。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateAnalysisCapabilityRequest(request) {
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
 * @param {{runAnalysis: (insightContext:object, options?:object) => {ok:boolean, result?:object, reason?:string, field?:string}}} dependencies.analysisRunner
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{requestAnalysis: (request:{context:object, options?:object}) => {ok:true, capability:'analysis', result:{status:string, insights:Array, metadata:object}}|{ok:false, capability:'analysis', reason:string, field?:string}}}
 */
export function createAnalysisCapability(dependencies) {
  dependencies = dependencies || {};
  const { analysisRunner } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createAnalysisCapabilityResultBuilder();

  /**
   * Feature唯一需要呼叫的「Analysis能力」進入點：驗證輸入 → 呼叫
   * Analysis Runner（唯一允許呼叫的下一層）→ 回傳穩定的Analysis
   * Capability結果格式。任何一步失敗都立刻回傳
   * {ok:false, capability:'analysis', reason}，不會用不完整的
   * 資料頂替繼續執行。這是同步函式，跟Analysis Runner本身
   * `runAnalysis()`的同步簽名完全一致（見
   * `../../PHASE4_CAPABILITY_PLAN.md`的Known Limitations章節——
   * 若未來需要支援非同步AI模組，這裡的簽名也需要跟著Analysis
   * Runner一起演進成async，本次任務不執行這個改動）。
   *
   * @param {{context:object, options?:object}} request - 結構化
   *   analysis request，`context`是TASK1.42 Insight Context
   *   Builder產生的Insight Context，`options`原樣轉交給
   *   Analysis Runner，這裡完全不解讀其內容
   * @returns {{ok:true, capability:'analysis', result:{status:string, insights:Array, metadata:object}}|{ok:false, capability:'analysis', reason:string, field?:string}}
   */
  function requestAnalysis(request) {
    const validation = validateAnalysisCapabilityRequest(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(validation.reason);
    }

    if (!analysisRunner || typeof analysisRunner.runAnalysis !== 'function') {
      return resultBuilder.buildFailureResult('analysis_runner_unavailable');
    }

    const outcome = analysisRunner.runAnalysis(request.context, request.options);
    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(outcome.reason, outcome.field);
    }

    return resultBuilder.buildSuccessResult(outcome.result);
  }

  return { requestAnalysis };
}

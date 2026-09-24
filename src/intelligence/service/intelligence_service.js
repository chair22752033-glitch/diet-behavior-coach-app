/*
 * Phase 1 TASK 1.46｜Intelligence Application Service Layer Foundation
 * （TASK1.47 起改用 src/intelligence/contracts/execution/ 三個contract
 * 驗證request/options/response，取代原本內建的validateRequest()）
 * - Intelligence Service
 *
 * 責任：在未來的 Application/API Layer 跟 Intelligence Orchestrator
 * （TASK1.45）之間建立一個穩定的應用邊界——呼叫端只需要知道
 * `getIntelligence(db, request)` 這一個介面，完全不需要知道底下
 * 實際上是由 Orchestrator 協調 Data Preparation → Insight Context →
 * Analysis → Recommendation 四個階段組成。架構位置：
 *
 *   Application Layer（未來的Controller/API）
 *     ↓
 *   Intelligence Service（這裡）── 使用Execution Contract驗證輸入/輸出
 *     ↓
 *   Intelligence Orchestrator（TASK1.45）
 *     ↓
 *   Data Preparation / Analysis / Recommendation（TASK1.41/1.43/1.44）
 *
 * 明確要求：
 * - No direct Data Preparation call：完全不 import
 *   src/intelligence/data_preparation/
 * - No direct Analysis call：完全不 import src/intelligence/analysis/
 * - No direct Recommendation call：完全不 import
 *   src/intelligence/recommendation/
 * - No direct Domain Service access：完全不 import src/services/
 *   底下任何檔案
 * - No SQL：完全不 import src/db/ 底下任何檔案，這個檔案甚至不知道
 *   db的內部結構——db只是原樣轉交給orchestrator.runIntelligencePipeline()
 *   的不透明參數
 * - No HTTP：不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller
 * - No Authentication parsing：不 import src/auth/ 或 src/identity/，
 *   userId 一律由呼叫端（未來的Controller/API Layer）當作request的
 *   欄位傳入，這裡完全不知道「目前是誰登入」這件事
 *
 * 只呼叫 Intelligence Orchestrator（透過依賴注入拿到的
 * `orchestrator.runIntelligencePipeline()`），不繞過它直接呼叫任何
 * 更底層的Phase 2子層。TASK1.47明確禁止修改Orchestrator/Analysis
 * Runner/Recommendation Runner的邏輯——三者的原始碼完全沒有被觸碰，
 * 這次只有這個檔案（Service boundary本身）改成使用
 * src/intelligence/contracts/execution/ 底下三個contract做驗證。
 *
 * TASK1.47新增的驗證步驟（getIntelligence()內部依序執行）：
 * 1. validateIntelligenceRequest(request) —— 驗證request形狀
 *    （userId必填非空字串、options選填且存在時必須是物件）
 * 2. validateExecutionOptions(request.options) —— 驗證options支援
 *    欄位（version/includeContext/includeAnalysis/
 *    includeRecommendation）的型別，request.options為undefined時
 *    視為合法、跳過此步驟等同直接通過
 * 3.（呼叫Orchestrator，完全沒有修改）
 * 4. validateIntelligenceResponse(outcome.data.result) —— 確認
 *    Orchestrator回傳的Unified Intelligence Result依然符合穩定
 *    contract（status恰好是"intelligence_ready"、五個欄位型別正確）
 *    才回傳給呼叫端
 *
 * `getIntelligence()`對外可觀察的行為（成功回傳{ok:true,data}、失敗
 * 回傳{ok:false,reason}）完全沒有改變，這是純粹的「內部驗證邏輯加固」。
 */
import { createServiceResultBuilder } from './service_result_builder.js';
import { validateIntelligenceRequest } from '../contracts/execution/intelligence_request_contract.js';
import { validateExecutionOptions } from '../contracts/execution/execution_options_contract.js';
import { validateIntelligenceResponse } from '../contracts/execution/intelligence_response_contract.js';

/**
 * @param {object} dependencies
 * @param {{runIntelligencePipeline: (db:object, userId:string, options?:object) => Promise<{ok:boolean, status:string, reason?:string, field?:string, data:{result:object}|null}>}} dependencies.orchestrator
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{getIntelligence: (db:object, request:{userId:string, options?:object}) => Promise<{ok:true, data:object}|{ok:false, reason:string}>}}
 */
export function createIntelligenceService(dependencies) {
  dependencies = dependencies || {};
  const { orchestrator } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createServiceResultBuilder();

  /**
   * 應用層唯一需要呼叫的入口：用Execution Contract驗證request →
   * 用Execution Contract驗證options → 呼叫 Intelligence Orchestrator
   * （完全沒有修改）→ 用Execution Contract驗證response → 回傳穩定的
   * 服務層結果格式。任何一步失敗都立刻回傳{ok:false, reason}，不會用
   * 不完整/不符合形狀的資料頂替繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給
   *   orchestrator.runIntelligencePipeline()
   * @param {{userId:string, options?:object}} request - 應用層傳入的
   *   請求物件，`userId` 一律是已經確認過的使用者id，`options`
   *   （選填）先經過execution options contract驗證型別，再原樣轉交給
   *   Orchestrator，這裡完全不解讀其業務內容
   * @returns {Promise<{ok:true, data:{status:string, context:object, analysis:object, recommendation:object, metadata:object}}|{ok:false, reason:string}>}
   */
  async function getIntelligence(db, request) {
    const requestValidation = validateIntelligenceRequest(request);
    if (!requestValidation.ok) {
      return resultBuilder.buildFailureResult(requestValidation.reason);
    }

    const optionsValidation = validateExecutionOptions(request.options);
    if (!optionsValidation.ok) {
      return resultBuilder.buildFailureResult(optionsValidation.reason);
    }

    if (!orchestrator || typeof orchestrator.runIntelligencePipeline !== 'function') {
      return resultBuilder.buildFailureResult('orchestrator_unavailable');
    }

    const outcome = await orchestrator.runIntelligencePipeline(db, request.userId, request.options);
    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(outcome.reason);
    }

    const responseValidation = validateIntelligenceResponse(outcome.data.result);
    if (!responseValidation.ok) {
      return resultBuilder.buildFailureResult(responseValidation.reason);
    }

    return resultBuilder.buildSuccessResult(outcome.data.result);
  }

  return { getIntelligence };
}

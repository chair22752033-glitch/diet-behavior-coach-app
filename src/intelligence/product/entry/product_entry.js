/*
 * Phase 5 TASK 1.99｜Product Entry Boundary Minimal Implementation
 * - Product Entry
 *
 * 責任：依照TASK1.91 Intelligence Product Entry Boundary
 * Foundation、TASK1.98 Implementation Readiness
 * Plan規劃的方向，第一次把"Product Intelligence Entry"這個規劃
 * 概念落地成最小可運作的骨架——這個檔案本身**不**呼叫AI、**不**
 * 建立Prompt Logic、**不**修改worker.js/routes/controllers/
 * Analysis Runner/Recommendation Runner/Phase 2 Runtime
 * Orchestrator/Phase 3 Application Pattern/Phase 4 Capability
 * Architecture——單純是Product Entry層級的邊界：接收Product
 * Request、驗證最外層的形狀、把request轉交給（選填依賴注入的）
 * Adapter、回傳結構化的結果。
 *
 * 架構位置（延續TASK1.91/1.93/1.98已規劃的九層Flow）：
 *
 *   Product Feature（規劃中，本次任務不建立）
 *     ↓
 *   Product Entry（這裡）
 *     ↓（透過依賴注入拿到的adapter介面）
 *   Intelligence Adapter（規劃中，尚未落地——本次任務不建立）
 *     ↓
 *   Intelligence Feature / Capability / Runtime（既有，完全不修改）
 *
 * 本次任務**沒有**建立Intelligence Adapter本身，因此Product
 * Entry透過依賴注入拿到的`adapter`是**選填的外部依賴**——沒有
 * 提供、或提供的物件沒有`forwardProductRequest`函式時，Product
 * Entry回傳`adapter_unavailable`失敗，不會拋出例外、不會嘗試
 * 繞過Adapter直接呼叫Feature/Capability層（延續TASK1.92已規劃的
 * "每一層只認識下一層"既有邊界，Product Entry完全不import
 * `src/intelligence/application/features/`或
 * `src/intelligence/capabilities/`底下任何實作檔案）。
 *
 * Product Entry只負責四件事（規格明確列出，不多不少）：
 * - 接收 product request（`{userId?, rawInput}`形狀，延續
 *   TASK1.92 Adapter規劃文件記錄的Product Request抽象形狀）
 * - 驗證最外層的形狀（request本身是否為物件、rawInput是否為
 *   物件、userId若存在是否為字串——這是TASK1.91已規劃的"只驗證
 *   HTTP層級的形狀，不重複Feature/Capability層已經做的驗證"）
 * - 轉交給（選填依賴注入的）Adapter（`adapter.
 *   forwardProductRequest(request)`）
 * - 回傳結構化的結果（透過`product_entry_result_builder.js`
 *   統一包裝）
 *
 * 明確要求（Product Entry may call / must NOT call）：
 * - ✅ 只能呼叫依賴注入拿到的`adapter`介面
 *   （`forwardProductRequest()`）
 * - ❌ 不得繞過Adapter直接呼叫Intelligence Feature/Capability
 *   Orchestrator/Analysis Runner/Recommendation Runner（不
 *   import`src/intelligence/application/`、
 *   `src/intelligence/capabilities/`、
 *   `src/intelligence/analysis/`、
 *   `src/intelligence/recommendation/`底下任何實作檔案）
 * - ❌ 不得直接存取Database（不import`src/db/`，完全不接受db
 *   參數）
 * - ❌ 不得直接存取Auth/Session（不import`src/auth/`、
 *   `src/oauth/`、`src/identity/`、`src/middleware/`）
 * - ❌ 不得知道HTTP是什麼（不import任何路由/controller檔案、
 *   不接受/回傳Request/Response物件本身，只處理乾淨的JS物件）
 * - ❌ 不得呼叫任何AI Provider/AI SDK、不得建立任何Prompt Logic
 *
 * 其他既有規則：
 * - deterministic：跟既有Capability一樣，同樣的輸入永遠得到
 *   完全相同的輸出，不讀取Date.now()/Math.random()
 * - 自己內建一份最小的request驗證，不重用其他層的驗證函式（延續
 *   `analysis_capability.js`等既有Capability自我完整的慣例）
 *
 * 本次任務**沒有**把這個Product Entry接進
 * `src/bootstrap/application.js`，也**沒有**建立任何真實的
 * route/controller呼叫它——這是刻意的邊界決策，延續Phase 4/
 * Phase 5系列一貫的"建立但不改變既有execution
 * behavior"模式，用測試證明Product Entry可以被安全地獨立測試、
 * 獨立呼叫即可，實際接上真實Product Feature/路由留給未來任務
 * 決定。
 */
import { createProductEntryResultBuilder } from './product_entry_result_builder.js';

/**
 * 驗證 requestProductEntry() 的 request 輸入——只檢查最外層的
 * 形狀（request本身是否為物件、rawInput是否為物件、userId若
 * 存在是否為字串），不解讀rawInput裡的任何業務內容，也不重新
 * 實作Insight Context或Capability層既有的驗證邏輯（延續
 * TASK1.91 Validation Responsibility章節規劃的分工）。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
function validateProductEntryRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_request' };
  }
  if (!request.rawInput || typeof request.rawInput !== 'object' || Array.isArray(request.rawInput)) {
    return { ok: false, reason: 'invalid_raw_input', field: 'rawInput' };
  }
  if (request.userId !== undefined && typeof request.userId !== 'string') {
    return { ok: false, reason: 'invalid_user_id', field: 'userId' };
  }
  return { ok: true };
}

/**
 * @param {object} dependencies
 * @param {{forwardProductRequest: Function}} [dependencies.adapter] - 選填。沒有提供、或提供的物件沒有forwardProductRequest函式時，requestProductEntry()回傳adapter_unavailable失敗，不拋出例外。
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{requestProductEntry: (request:{userId?:string, rawInput:object}) => {ok:true, boundary:'product-entry', result:object}|{ok:false, boundary:'product-entry', reason:string, field?:string, stage?:string}}}
 */
export function createProductEntry(dependencies) {
  dependencies = dependencies || {};
  const { adapter } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createProductEntryResultBuilder();

  /**
   * Product Feature（未來）唯一需要呼叫的進入點：驗證輸入 →
   * 轉交給Adapter → 回傳穩定的結構化結果。任何一步失敗都立刻
   * 回傳`{ok:false, boundary:'product-entry', reason, field?,
   * stage?}`，不會用不完整的資料頂替繼續執行。這是同步函式，
   * 跟Feature Intelligence Integration/Capability
   * Orchestrator本身的同步簽名一致。
   *
   * @param {{userId?:string, rawInput:object}} request
   * @returns {{ok:true, boundary:'product-entry', result:object}|{ok:false, boundary:'product-entry', reason:string, field?:string, stage?:string}}
   */
  function requestProductEntry(request) {
    const validation = validateProductEntryRequest(request);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(validation.reason, validation.field);
    }

    if (!adapter || typeof adapter.forwardProductRequest !== 'function') {
      return resultBuilder.buildFailureResult('adapter_unavailable');
    }

    const adapterOutcome = adapter.forwardProductRequest(request);
    if (!adapterOutcome || typeof adapterOutcome !== 'object' || Array.isArray(adapterOutcome)) {
      return resultBuilder.buildFailureResult('adapter_invalid_result', undefined, 'adapter');
    }

    if (!adapterOutcome.ok) {
      return resultBuilder.buildFailureResult(adapterOutcome.reason, adapterOutcome.field, 'adapter');
    }

    return resultBuilder.buildSuccessResult(adapterOutcome.result);
  }

  return { requestProductEntry };
}

/*
 * Phase 5 TASK 1.100｜Product Adapter Boundary Minimal Implementation
 * - Product Adapter
 *
 * 責任：依照TASK1.92 Intelligence Product Adapter Architecture
 * Foundation、TASK1.95 Product Execution Boundary Foundation、
 * TASK1.98 Implementation Readiness Plan規劃的方向，第一次把
 * "Intelligence Adapter"這個規劃概念落地成最小可運作的骨架——這
 * 是Phase 5系列**第二個**寫production code的任務（第一個是
 * TASK1.99 Product Entry）。這個檔案本身**不**呼叫AI、**不**建立
 * Prompt Logic、**不**修改worker.js/routes/controllers/Analysis
 * Runner/Recommendation Runner/Phase 2 Runtime Orchestrator/
 * Phase 3 Application Pattern/Phase 4 Capability
 * Architecture——單純是Product Entry跟Feature Intelligence
 * Integration之間的**純轉換層**：接收Product Entry已經驗證過的
 * request、轉換成Intelligence request格式、呼叫依賴注入的
 * Intelligence Feature、把Intelligence result轉換成Product
 * response形狀。
 *
 * 架構位置（延續TASK1.91/1.92/1.98已規劃的Flow）：
 *
 *   Product Entry（TASK1.99，完全不修改）
 *     ↓（透過adapter.forwardProductRequest()呼叫）
 *   Intelligence Adapter（這裡）
 *     ↓（透過依賴注入拿到的intelligenceFeature介面）
 *   Feature Intelligence Integration（TASK1.79，完全不修改）
 *     ↓
 *   Capability Orchestrator / Analysis+Recommendation Capability（既有，完全不修改）
 *
 * Product Entry呼叫Adapter的方式維持TASK1.99既有的約定：
 * `adapter.forwardProductRequest(request)`——這個檔案的
 * `forwardProductRequest`函式簽名跟回傳形狀（`{ok, result}`/
 * `{ok:false, reason, field?}`）恰好符合Product Entry既有的
 * 消費方式，Entry層完全不需要修改（延續Completion Criteria要求的
 * "Entry Adapter flow preserved"）。
 *
 * Product Adapter只負責四件事（規格明確列出，不多不少）：
 * - 接收已驗證的 Product request（Entry層已經確認
 *   `request.rawInput`是物件、`request.userId`若存在是字串——
 *   Adapter**不重複**這層HTTP形狀驗證，延續TASK1.92 Validation
 *   Responsibility章節規劃的"Adapter不做業務驗證"原則）
 * - 轉換成 Intelligence request 格式（把`rawInput`包裝成
 *   Feature Intelligence Integration要求的`{context,
 *   options?}`形狀——本次最小實作**不**呼叫真實的Insight Context
 *   Builder（`src/intelligence/context/`，TASK1.42），直接把
 *   `rawInput`當作`context`使用，這是刻意簡化的骨架版本，
 *   TASK1.92規劃文件Known Limitations已預告"Product
 *   Request/Response的實際型別/介面尚未定義"，真正的Context
 *   Builder整合留給未來任務決定）
 * - 呼叫依賴注入的 Intelligence Feature（
 *   `intelligenceFeature.requestIntelligence()`——唯一允許呼叫的
 *   下一層，延續TASK1.92 Feature Integration章節"Adapter不得
 *   直接呼叫Capability Orchestrator"的規則）
 * - 把 Intelligence result 轉換成 Product response 形狀（只
 *   取出`outcome.data`，自然過濾掉Feature層內部的
 *   `feature:'intelligence'`標籤欄位，延續TASK1.92 Response
 *   Mapping Boundary"Adapter層負責過濾內部欄位"的規則）
 *
 * 明確要求（Product Adapter may call / must NOT call）：
 * - ✅ 只能呼叫依賴注入拿到的`intelligenceFeature`介面
 *   （`requestIntelligence()`）
 * - ❌ 不得繞過Feature Intelligence Integration直接呼叫Capability
 *   Orchestrator/Analysis Capability/Recommendation
 *   Capability/Analysis Runner/Recommendation Runner（不import
 *   `src/intelligence/capabilities/`、
 *   `src/intelligence/analysis/`、
 *   `src/intelligence/recommendation/`、
 *   `src/intelligence/application/`底下任何實作檔案）
 * - ❌ 不得直接存取Database（不import`src/db/`，完全不接受db
 *   參數）
 * - ❌ 不得直接存取Auth/Session（不import`src/auth/`、
 *   `src/oauth/`、`src/identity/`、`src/middleware/`）
 * - ❌ 不得知道HTTP是什麼（不import任何路由/controller檔案、
 *   不接受/回傳Request/Response物件本身，只處理乾淨的JS物件）
 * - ❌ 不得呼叫任何AI Provider/AI SDK、不得建立任何Prompt
 *   Logic、Decision Algorithm、Rule Engine、Scoring Logic
 *
 * Error Mapping（延續TASK1.92 Error Mapping Boundary三種分類）：
 * - **Product Errors**：發生在Entry層，不會進入Adapter（Adapter
 *   假設收到的輸入已經通過Entry層驗證）——這裡對request/rawInput
 *   的檢查只是防禦性的結構安全檢查，不是重新定義業務驗證規則。
 * - **Intelligence Errors**：`intelligenceFeature.
 *   requestIntelligence()`回傳`{ok:false, reason, field?,
 *   stage?}`時，原樣轉換成Adapter自己的失敗結果，標記
 *   `stage:'intelligence'`。
 * - **Runtime Errors**：呼叫`intelligenceFeature.
 *   requestIntelligence()`本身拋出未預期例外時，Adapter用
 *   try/catch攔截，轉換成通用的`internal_error`錯誤碼，標記
 *   `stage:'runtime'`，**不**把原始例外的stack
 *   trace或內部訊息往外傳遞——這是TASK1.92明確要求、也是跟
 *   Product Entry（TASK1.99刻意讓例外往上傳播、不吞掉）**故意
 *   不同**的設計：延續TASK1.95 Execution Boundary規劃"Execution
 *   Lifecycle跟Failure Recovery由Adapter內部擁有"的結論，例外
 *   攔截職責明確歸屬在Adapter這一層，Entry層不需要重複處理。
 *
 * 其他既有規則：
 * - deterministic：跟既有Capability/Entry一樣，同樣的輸入永遠
 *   得到完全相同的輸出，不讀取Date.now()/Math.random()
 * - 自己內建一份最小的request驗證，不重用其他層的驗證函式（延續
 *   `product_entry.js`等既有邊界自我完整的慣例）
 *
 * 本次任務**沒有**把這個Product Adapter接進
 * `src/bootstrap/application.js`，也**沒有**把它注入
 * Product Entry既有的呼叫鏈（Entry的`adapter`依賴依然是選填的，
 * 本次任務不修改Entry任何程式碼）——這是刻意的邊界決策，延續
 * Phase 4/Phase 5系列一貫的"建立但不改變既有execution
 * behavior"模式，用測試證明Entry+Adapter可以被安全地組合執行
 * 即可，實際接上真實Intelligence Feature/路由留給未來任務決定。
 */
import { createProductAdapterResultBuilder } from './product_adapter_result_builder.js';

/**
 * 驗證 forwardProductRequest() 的 productRequest 輸入——只做
 * 防禦性的結構安全檢查（productRequest本身是否為物件、
 * productRequest.rawInput是否為物件），不重新定義業務驗證規則、
 * 不重複Product Entry（TASK1.99）已經做過的HTTP層級形狀驗證
 * （延續TASK1.92"Adapter不做任何業務驗證"的規劃）。
 *
 * @param {*} productRequest
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
function validateProductRequestShape(productRequest) {
  if (!productRequest || typeof productRequest !== 'object' || Array.isArray(productRequest)) {
    return { ok: false, reason: 'invalid_product_request' };
  }
  if (!productRequest.rawInput || typeof productRequest.rawInput !== 'object' || Array.isArray(productRequest.rawInput)) {
    return { ok: false, reason: 'invalid_raw_input', field: 'rawInput' };
  }
  return { ok: true };
}

/**
 * Product Request → Intelligence Request 轉換（Request Mapping
 * Boundary）。本次最小實作直接把`rawInput`當作Insight
 * Context使用，不呼叫真實的Context Builder——這是刻意簡化的
 * 骨架版本（見上方檔案頭註解）。
 *
 * @param {{userId?:string, rawInput:object}} productRequest
 * @returns {{context:object, options?:object}}
 */
function buildIntelligenceRequest(productRequest) {
  const intelligenceRequest = { context: productRequest.rawInput };
  if (productRequest.options !== undefined) {
    intelligenceRequest.options = productRequest.options;
  }
  return intelligenceRequest;
}

/**
 * @param {object} dependencies
 * @param {{requestIntelligence: Function}} [dependencies.intelligenceFeature] - 選填。沒有提供、或提供的物件沒有requestIntelligence函式時，forwardProductRequest()回傳intelligence_feature_unavailable失敗，不拋出例外。
 * @param {{buildSuccessResult: Function, buildFailureResult: Function}} [dependencies.resultBuilder]
 * @returns {{forwardProductRequest: (productRequest:{userId?:string, rawInput:object, options?:object}) => {ok:true, boundary:'product-adapter', result:object}|{ok:false, boundary:'product-adapter', reason:string, field?:string, stage?:string}}}
 */
export function createProductAdapter(dependencies) {
  dependencies = dependencies || {};
  const { intelligenceFeature } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createProductAdapterResultBuilder();

  /**
   * Product Entry（TASK1.99）唯一需要呼叫的轉換入口：驗證輸入
   * 形狀 → 轉換成Intelligence request → 呼叫Intelligence
   * Feature → 轉換Intelligence result成Product response。任何
   * 一步失敗都立刻回傳
   * `{ok:false, boundary:'product-adapter', reason, field?,
   * stage?}`，不會用不完整的資料頂替繼續執行。這是同步函式，跟
   * Feature Intelligence Integration本身的同步簽名一致。
   *
   * @param {{userId?:string, rawInput:object, options?:object}} productRequest
   * @returns {{ok:true, boundary:'product-adapter', result:object}|{ok:false, boundary:'product-adapter', reason:string, field?:string, stage?:string}}
   */
  function forwardProductRequest(productRequest) {
    const validation = validateProductRequestShape(productRequest);
    if (!validation.ok) {
      return resultBuilder.buildFailureResult(validation.reason, validation.field, 'request');
    }

    if (!intelligenceFeature || typeof intelligenceFeature.requestIntelligence !== 'function') {
      return resultBuilder.buildFailureResult('intelligence_feature_unavailable');
    }

    const intelligenceRequest = buildIntelligenceRequest(productRequest);

    let outcome;
    try {
      outcome = intelligenceFeature.requestIntelligence(intelligenceRequest);
    } catch (e) {
      return resultBuilder.buildFailureResult('internal_error', undefined, 'runtime');
    }

    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
      return resultBuilder.buildFailureResult('intelligence_invalid_result', undefined, 'intelligence');
    }

    if (!outcome.ok) {
      return resultBuilder.buildFailureResult(outcome.reason, outcome.field, 'intelligence');
    }

    return resultBuilder.buildSuccessResult(outcome.data);
  }

  return { forwardProductRequest };
}

/*
 * Phase 5 TASK 1.103｜Product Contract Boundary Minimal
 * Implementation
 * - Product Contract
 *
 * 責任：依照TASK1.94 Product Intelligence Application Contract
 * Foundation規劃的方向，加上本次任務自己明確要求的Implementation
 * Flow，第一次把"Contract Boundary"這個規劃概念落地成最小可
 * 運作的骨架——這是Phase 5系列**第五個**寫production code的
 * 任務（前四個是TASK1.99 Product Entry、TASK1.100 Product
 * Adapter、TASK1.101 Product Execution、TASK1.102 Product
 * Operational）。這個檔案本身**不**呼叫AI、**不**建立Prompt
 * Logic/Decision Algorithm/Rule Engine/Scoring Logic、**不**
 * 修改worker.js/routes/controllers/Analysis Runner/
 * Recommendation Runner/Phase 2 Runtime Orchestrator/Phase 3
 * Application Pattern/Phase 4 Capability Architecture——單純是
 * Product Entry跟Product Adapter之間的**驗證閘門**：驗證Product
 * Request形狀、驗證Product Response形狀、保持向後相容、提供
 * 結構化的驗證結果、避免任何業務邏輯判斷。
 *
 * 架構位置（本次任務明確要求的Implementation Flow）：
 *
 *   Product Entry（TASK1.99，完全不修改）
 *     ↓（透過adapter.forwardProductRequest()呼叫，跟呼叫真正
 *        Adapter完全相同的方式——透明代理設計）
 *   Product Contract（這裡）
 *     ↓（透過依賴注入拿到的adapter介面）
 *   Product Adapter（TASK1.100，完全不修改）
 *     ↓
 *   Product Execution Boundary（TASK1.101，完全不修改）
 *     ↓
 *   Product Operational Boundary（TASK1.102，完全不修改）
 *     ↓
 *   Feature Intelligence Integration（TASK1.79，完全不修改）
 *
 * 跟TASK1.94原始規劃的差異：TASK1.94 PHASE5_PRODUCT_
 * INTELLIGENCE_CONTRACT_PLAN.md規劃的是Feature層級的
 * `{context, options?}`/`{ok, data}`Contract（Adapter跟
 * Feature之間）。本次任務（TASK1.103）明確要求的Implementation
 * Flow把Contract Boundary放在Entry跟Adapter**之間**，因此本次
 * 落地的驗證範圍是**Product Request/Response層級**的Contract
 * （Entry產生的`{userId?, rawInput, options?}`跟Adapter回傳的
 * `{ok, result}`/`{ok:false, reason, field?}`）——這延續
 * TASK1.99已建立的先例：本次任務自己明確的Implementation
 * Scope/Flow優先於更早、更泛用的規劃文件。
 *
 * 刻意的"透明代理，只在必要時介入"設計：Contract對外暴露跟
 * Product Adapter完全相同的介面——`forwardProductRequest
 * (request)`。這代表Product Entry（TASK1.99）完全不需要修改
 * 任何程式碼，只要把原本注入的`adapter`依賴換成Contract
 * Boundary包裝過的版本，就可以在Entry跟Adapter之間插入這一層
 * 驗證閘門。驗證通過時，Contract把下游Adapter回傳的response
 * **原封不動**往上傳遞（不重新包裝），只有在**自己新增的驗證
 * 項目**發現問題時才回傳自己的失敗結果——這是"保持向後相容"
 * 具體的落地方式。
 *
 * Product Contract只負責五件事（規格明確列出，不多不少）：
 * - 驗證Product request形狀（`rawInput`必要物件、`userId`/
 *   `options`選填，透過`product_contract_validator.js`）
 * - 驗證Product response形狀（Adapter回傳的`{ok, result}`/
 *   `{ok:false, reason, field?}`是否合法）
 * - 保持向後相容（驗證通過時原樣透傳response，不新增/不修改
 *   任何既有欄位）
 * - 提供結構化的驗證結果（`{ok:false, boundary:
 *   'product-contract', reason, field?, stage?}`，`stage`指出
 *   在哪一個驗證階段失敗）
 * - 避免業務邏輯判斷（version compatibility
 *   check只判斷格式/主版本號是否認得，不對內容做任何評分/決策）
 *
 * 明確要求（Product Contract may call / must NOT call）：
 * - ✅ 只能呼叫依賴注入拿到的`adapter`介面
 *   （`forwardProductRequest()`）
 * - ❌ 不得繞過Adapter直接呼叫Execution/Operational/Feature/
 *   Capability（不import`src/intelligence/product/execution/`、
 *   `src/intelligence/product/operational/`、
 *   `src/intelligence/capabilities/`、
 *   `src/intelligence/analysis/`、
 *   `src/intelligence/recommendation/`、
 *   `src/intelligence/application/`底下任何實作檔案）
 * - ❌ 不得直接存取Database（不import`src/db/`）
 * - ❌ 不得直接存取Auth/Session（不import`src/auth/`、
 *   `src/oauth/`、`src/identity/`、`src/middleware/`）
 * - ❌ 不得知道HTTP是什麼
 * - ❌ 不得呼叫任何AI Provider/AI SDK、不得建立任何Decision
 *   Algorithm、Rule Engine、Scoring Logic、Prompt Logic
 *
 * 其他既有規則：
 * - deterministic：跟既有Capability/Entry/Adapter/Execution/
 *   Operational一樣，同樣的輸入永遠得到完全相同的輸出，不讀取
 *   Date.now()/Math.random()
 *
 * 本次任務**沒有**把這個Product Contract接進
 * `src/bootstrap/application.js`，也**沒有**修改Product Entry
 * （TASK1.99）/Product Adapter（TASK1.100）任何程式碼——這是
 * 刻意的邊界決策，延續Phase 4/Phase 5系列一貫的"建立但不改變
 * 既有execution behavior"模式。
 */
import { createProductContractValidator } from './product_contract_validator.js';
import { createProductContractResultBuilder } from './product_contract_result_builder.js';

/**
 * @param {object} dependencies
 * @param {{forwardProductRequest: Function}} [dependencies.adapter] - 選填。沒有提供、或提供的物件沒有forwardProductRequest函式時，forwardProductRequest()回傳adapter_unavailable失敗，不拋出例外。
 * @param {ReturnType<typeof createProductContractValidator>} [dependencies.validator]
 * @param {ReturnType<typeof createProductContractResultBuilder>} [dependencies.resultBuilder]
 * @returns {{forwardProductRequest: (request:{userId?:string, rawInput:object, options?:object}) => *}}
 */
export function createProductContract(dependencies) {
  dependencies = dependencies || {};
  const { adapter } = dependencies;
  const validator = dependencies.validator || createProductContractValidator();
  const resultBuilder = dependencies.resultBuilder || createProductContractResultBuilder();

  /**
   * Product Entry（TASK1.99）唯一需要呼叫的驗證閘門——介面跟
   * Product Adapter本身的`forwardProductRequest()`完全相同
   * （透明代理設計）。驗證Request形狀 → 轉交給下游Adapter →
   * 驗證Response形狀 → （成功時）檢查版本相容性 → 驗證全部
   * 通過時原樣回傳下游response，任何一步驗證失敗都回傳
   * Contract自己的結構化失敗結果。這是同步函式，跟Product
   * Adapter本身的同步簽名一致。
   *
   * @param {{userId?:string, rawInput:object, options?:object}} request
   * @returns {*} 驗證通過時原樣等於`adapter.forwardProductRequest(request)`的回傳值；驗證失敗時回傳`{ok:false, boundary:'product-contract', reason, field?, stage?}`
   */
  function forwardProductRequest(request) {
    const requestValidation = validator.validateProductRequestShape(request);
    if (!requestValidation.ok) {
      return resultBuilder.buildFailureResult(requestValidation.reason, requestValidation.field, 'request');
    }

    if (!adapter || typeof adapter.forwardProductRequest !== 'function') {
      return resultBuilder.buildFailureResult('adapter_unavailable', undefined, 'adapter');
    }

    const response = adapter.forwardProductRequest(request);

    const responseValidation = validator.validateProductResponseShape(response);
    if (!responseValidation.ok) {
      return resultBuilder.buildFailureResult(responseValidation.reason, responseValidation.field, 'response');
    }

    if (response.ok) {
      const version = validator.extractResponseVersion(response.result);
      const compatibility = validator.checkVersionCompatibility(version);
      if (!compatibility.ok) {
        return resultBuilder.buildFailureResult(compatibility.reason, compatibility.field, 'compatibility');
      }
    }

    return response;
  }

  return { forwardProductRequest };
}

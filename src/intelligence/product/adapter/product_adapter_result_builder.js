/*
 * Phase 5 TASK 1.100｜Product Adapter Boundary Minimal Implementation
 * - Product Adapter Result Builder
 *
 * 責任：把`product_adapter.js`裡`forwardProductRequest()`各種成功/
 * 失敗的分支，統一包裝成一致的結構化結果——延續
 * `product_entry_result_builder.js`（TASK1.99）/
 * `capability_result_builder.js`系列"每一層自己的Result Builder
 * 只負責組裝資料形狀，不做任何業務判斷"的分工慣例。
 *
 * 這個檔案本身：
 * - ❌ 不驗證輸入（驗證邏輯留在`product_adapter.js`）
 * - ❌ 不呼叫Intelligence Feature
 * - ❌ 不讀取Date.now()/Math.random()/任何非deterministic來源
 * - ✅ 只負責把已經決定好的資料，組裝成固定形狀的物件
 *
 * 注意：這裡回傳的`{ok, result}`/`{ok, reason, field?}`形狀，
 * 恰好是`product_entry.js`（TASK1.99）的
 * `adapter.forwardProductRequest()`所預期的下游adapter回傳形狀——
 * Entry層只讀取`ok`/`result`/`reason`/`field`四個欄位，這裡額外
 * 附加的`boundary`/`stage`欄位Entry層會忽略，不影響Entry↔Adapter
 * 既有的呼叫約定（延續Completion Criteria要求的"Entry Adapter
 * flow preserved"）。
 */

const BOUNDARY_NAME = 'product-adapter';

/**
 * @returns {{
 *   buildSuccessResult: (result:object) => {ok:true, boundary:'product-adapter', result:object},
 *   buildFailureResult: (reason:string, field?:string, stage?:string) => {ok:false, boundary:'product-adapter', reason:string, field?:string, stage?:string}
 * }}
 */
export function createProductAdapterResultBuilder() {
  /**
   * @param {object} result - 轉換後的Product Response內容，原樣往上傳遞，不重新解讀。
   * @returns {{ok:true, boundary:'product-adapter', result:object}}
   */
  function buildSuccessResult(result) {
    return {
      ok: true,
      boundary: BOUNDARY_NAME,
      result: result && typeof result === 'object' && !Array.isArray(result) ? result : {},
    };
  }

  /**
   * @param {string} reason
   * @param {string} [field]
   * @param {string} [stage] - 失敗發生的階段（'request'|'intelligence'|'runtime'），對應Adapter Plan規劃的Product/Intelligence/Runtime三種錯誤分類。
   * @returns {{ok:false, boundary:'product-adapter', reason:string, field?:string, stage?:string}}
   */
  function buildFailureResult(reason, field, stage) {
    const failure = {
      ok: false,
      boundary: BOUNDARY_NAME,
      reason: typeof reason === 'string' && reason.length > 0 ? reason : 'unknown_error',
    };
    if (typeof field === 'string' && field.length > 0) {
      failure.field = field;
    }
    if (typeof stage === 'string' && stage.length > 0) {
      failure.stage = stage;
    }
    return failure;
  }

  return { buildSuccessResult, buildFailureResult };
}

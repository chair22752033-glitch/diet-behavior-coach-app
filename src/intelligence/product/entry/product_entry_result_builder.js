/*
 * Phase 5 TASK 1.99｜Product Entry Boundary Minimal Implementation
 * - Product Entry Result Builder
 *
 * 責任：把`product_entry.js`裡`requestProductEntry()`各種成功/
 * 失敗的分支，統一包裝成一致的結構化結果（延續既有
 * `capability_result_builder.js`/`decision_result_builder.js`
 * 系列"每一層自己的Result Builder只負責組裝資料形狀，不做任何
 * 業務判斷"的分工慣例）。
 *
 * 這個檔案本身：
 * - ❌ 不驗證輸入（驗證邏輯留在`product_entry.js`）
 * - ❌ 不呼叫Adapter/Feature/Capability
 * - ❌ 不讀取Date.now()/Math.random()/任何非deterministic來源
 * - ✅ 只負責把已經決定好的資料，組裝成固定形狀的物件
 */

const BOUNDARY_NAME = 'product-entry';

/**
 * @returns {{
 *   buildSuccessResult: (result:object) => {ok:true, boundary:'product-entry', result:object},
 *   buildFailureResult: (reason:string, field?:string, stage?:string) => {ok:false, boundary:'product-entry', reason:string, field?:string, stage?:string}
 * }}
 */
export function createProductEntryResultBuilder() {
  /**
   * @param {object} result - Adapter回傳的成功結果內容，原樣往上傳遞，不重新解讀。
   * @returns {{ok:true, boundary:'product-entry', result:object}}
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
   * @param {string} [stage] - 失敗發生的階段（例如'adapter'），Product Entry自己驗證失敗時不帶這個欄位。
   * @returns {{ok:false, boundary:'product-entry', reason:string, field?:string, stage?:string}}
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

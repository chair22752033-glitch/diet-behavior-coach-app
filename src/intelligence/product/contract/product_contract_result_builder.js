/*
 * Phase 5 TASK 1.103｜Product Contract Boundary Minimal
 * Implementation
 * - Product Contract Result Builder
 *
 * 責任：把`product_contract.js`裡驗證失敗的分支，統一包裝成
 * 一致的結構化結果——延續`product_adapter_result_builder.js`
 * （TASK1.100）/`product_entry_result_builder.js`
 * （TASK1.99）系列既有的分工慣例。
 *
 * 跟Entry/Adapter自己的builder不同：這裡**只**提供
 * `buildFailureResult()`，**沒有**`buildSuccessResult()`——因為
 * Contract Boundary驗證通過時，`product_contract.js`會直接把
 * 下游Adapter回傳的response**原封不動**往上傳遞（pure
 * passthrough，不重新包裝成Contract自己的成功形狀），這是
 * Contract Boundary"只在發現問題時才介入、其餘時候完全透明"
 * 的刻意設計（延續TASK1.101/1.102已建立的透明代理精神，但
 * Contract比Execution/Operational更進一步：連失敗也只在
 * **自己新增的驗證項目**上介入，下游既有的失敗一樣原樣透傳）。
 *
 * 這個檔案本身：
 * - ❌ 不驗證輸入（驗證邏輯留在`product_contract_validator.js`）
 * - ❌ 不呼叫Adapter
 * - ❌ 不讀取Date.now()/Math.random()/任何非deterministic來源
 * - ✅ 只負責把已經決定好的資料，組裝成固定形狀的物件
 */

const BOUNDARY_NAME = 'product-contract';

/**
 * @returns {{
 *   buildFailureResult: (reason:string, field?:string, stage?:string) => {ok:false, boundary:'product-contract', reason:string, field?:string, stage?:string}
 * }}
 */
export function createProductContractResultBuilder() {
  /**
   * @param {string} reason
   * @param {string} [field]
   * @param {string} [stage] - 驗證失敗發生的階段：'request'（Product Request形狀不合法）|'adapter'（下游Adapter依賴缺失）|'response'（Adapter回傳的Response形狀不合法）|'compatibility'（版本不相容）。
   * @returns {{ok:false, boundary:'product-contract', reason:string, field?:string, stage?:string}}
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

  return { buildFailureResult };
}

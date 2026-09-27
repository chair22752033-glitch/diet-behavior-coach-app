/*
 * Phase 5 TASK 1.101｜Product Execution Boundary Minimal Implementation
 * - Product Execution Result Builder
 *
 * 責任：把`product_execution.js`裡`requestIntelligence()`各種成功/
 * 失敗的分支，統一包裝成一致的結構化結果——延續
 * `product_adapter_result_builder.js`（TASK1.100）/
 * `product_entry_result_builder.js`（TASK1.99）系列"每一層自己的
 * Result Builder只負責組裝資料形狀，不做任何業務判斷"的分工慣例。
 *
 * 跟Entry/Adapter自己的Result Builder不同：這裡回傳的形狀刻意
 * 完全比照Feature Intelligence Integration既有的
 * `intelligence_feature_result_mapper.js`（TASK1.79）——固定帶
 * `feature:'intelligence'`欄位，成功時`{ok:true, feature, data}`，
 * 失敗時`{ok:false, feature, reason, field?, stage?}`——這是刻意
 * 的"透明代理"設計：Execution Boundary對外表現得跟真正的
 * Intelligence Feature一模一樣，讓Adapter（TASK1.100）完全不需要
 * 修改任何程式碼，就可以把`intelligenceFeature`依賴換成
 * Execution Boundary包裝過的版本（延續Completion Criteria要求的
 * "Adapter compatibility"）。額外附加的`boundary`/`category`欄位
 * 是Execution Boundary自己的診斷資訊，Adapter既有邏輯只讀取
 * `ok`/`data`/`reason`/`field`，會忽略這些額外欄位。
 *
 * 這個檔案本身：
 * - ❌ 不驗證輸入（驗證邏輯留在`product_execution.js`）
 * - ❌ 不呼叫Intelligence Feature
 * - ❌ 不讀取Date.now()/Math.random()/任何非deterministic來源
 * - ✅ 只負責把已經決定好的資料，組裝成固定形狀的物件
 */

const INTELLIGENCE_DOMAIN = 'intelligence';
const BOUNDARY_NAME = 'product-execution';

/**
 * @returns {{
 *   buildSuccessResult: (data:object) => {ok:true, feature:'intelligence', boundary:'product-execution', data:object},
 *   buildFailureResult: (reason:string, field?:string, stage?:string, category?:string) => {ok:false, feature:'intelligence', boundary:'product-execution', reason:string, field?:string, stage?:string, category?:string}
 * }}
 */
export function createProductExecutionResultBuilder() {
  /**
   * @param {object} data - Feature Intelligence Integration回傳的
   *   `data`欄位（{analysis, recommendation, decision?}），原樣
   *   往上傳遞，不重新解讀（Result Handling Boundary的Success
   *   Handling：不新增、不修改任何欄位內容）。
   * @returns {{ok:true, feature:'intelligence', boundary:'product-execution', data:object}}
   */
  function buildSuccessResult(data) {
    return {
      ok: true,
      feature: INTELLIGENCE_DOMAIN,
      boundary: BOUNDARY_NAME,
      data: data && typeof data === 'object' && !Array.isArray(data) ? data : {},
    };
  }

  /**
   * @param {string} reason
   * @param {string} [field]
   * @param {string} [stage] - 原樣轉發自下游Feature/Capability失敗時回傳的stage欄位（不是Execution Boundary自己的執行階段概念）。
   * @param {string} [category] - Execution Boundary自己的Failure Recovery分類：'contract_failure'|'feature_failure'|'runtime_failure'。
   * @returns {{ok:false, feature:'intelligence', boundary:'product-execution', reason:string, field?:string, stage?:string, category?:string}}
   */
  function buildFailureResult(reason, field, stage, category) {
    const failure = {
      ok: false,
      feature: INTELLIGENCE_DOMAIN,
      boundary: BOUNDARY_NAME,
      reason: typeof reason === 'string' && reason.length > 0 ? reason : 'unknown_error',
    };
    if (typeof field === 'string' && field.length > 0) {
      failure.field = field;
    }
    if (typeof stage === 'string' && stage.length > 0) {
      failure.stage = stage;
    }
    if (typeof category === 'string' && category.length > 0) {
      failure.category = category;
    }
    return failure;
  }

  return { buildSuccessResult, buildFailureResult };
}

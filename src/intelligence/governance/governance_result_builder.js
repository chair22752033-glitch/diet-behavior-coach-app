/*
 * Phase 1 TASK 1.55｜Intelligence Execution Governance Layer Foundation
 * - Governance Result Builder
 *
 * 責任：把Execution Policy（execution_policy.js）算出來的
 * {allowed, reasons}組成規格要求的統一輸出形狀
 * {status, allowed, reasons, metadata}。純函式，不讀取
 * Date.now()/Math.random()，也不提供對外的驗證函式——這個輸出形狀
 * 完全是Governance Service自己內部組裝出來的，不是外部呼叫端可以
 * 自由傳入、需要驗證的輸入形狀。
 *
 * 明確禁止：這裡不加入任何AI recommendation或scoring——`metadata`
 * 固定只帶`version`這類純粹的版本標記資訊，不做任何推論、分類、
 * 建議。
 */

/**
 * @param {*} input
 * @returns {{status:*, allowed:boolean, reasons:string[], metadata:object}}
 */
export function buildGovernanceResult(input) {
  input = input && typeof input === 'object' ? input : {};
  return {
    status: input.status !== undefined ? input.status : null,
    allowed: input.allowed !== undefined ? input.allowed : false,
    reasons: input.reasons !== undefined ? input.reasons : [],
    metadata: input.metadata !== undefined ? input.metadata : {},
  };
}

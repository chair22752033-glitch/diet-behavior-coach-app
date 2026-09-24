/*
 * Phase 1 TASK 1.55｜Intelligence Execution Governance Layer Foundation
 * - Execution Policy Validator
 *
 * 責任：對「是否允許這次Intelligence執行」做純結構性的政策檢查——
 * 這裡刻意只做形狀/型別層級的檢查（userId是不是非空字串、options/
 * runtimeContext如果有提供是不是純物件），完全不做規格明確禁止的
 * 事情：
 * - ❌ 不讀取database（這個檔案完全沒有db參數，也沒有任何
 *   import src/db/）
 * - ❌ 不查詢user status（不呼叫任何service/repository，不判斷
 *   使用者是否為guest/已註冊/被封鎖等）
 * - ❌ 不解析session（不import src/auth/或src/oauth/，不檢查
 *   cookie/token/session是否存在或有效）
 * - ❌ 不包含business decision（不判斷使用者的資料是否足夠、
 *   是否符合某種業務資格，只檢查輸入本身的形狀是否符合最基本的
 *   結構約定）
 *
 * 這是刻意的邊界決策——Governance Layer要驗證的是「這次呼叫的
 * 形狀本身有沒有問題」，不是「這個使用者有沒有權限」（那是
 * Authentication/Authorization的責任，這裡完全不碰）。
 *
 * 全部規則都是純函式、確定性的（deterministic）：同樣的輸入，
 * 任何時候呼叫都得到完全相同的{allowed, reasons}結果，不讀取
 * Date.now()/Math.random()，不讀取任何外部狀態。
 */

/**
 * 固定的政策規則清單，依序執行——不是「第一個失敗就停止」，而是
 * 收集所有違反的規則，讓呼叫端一次看到全部問題（`reasons`是陣列，
 * 不是單一字串）。
 */
const POLICY_RULES = Object.freeze([
  {
    reason: 'missing_user_id',
    check: (input) => typeof input.userId === 'string' && input.userId.length > 0,
  },
  {
    reason: 'invalid_options',
    check: (input) =>
      input.options === undefined ||
      (input.options !== null && typeof input.options === 'object' && !Array.isArray(input.options)),
  },
  {
    reason: 'invalid_runtime_context',
    check: (input) =>
      input.runtimeContext === undefined ||
      (input.runtimeContext !== null && typeof input.runtimeContext === 'object' && !Array.isArray(input.runtimeContext)),
  },
]);

/**
 * @param {{userId?:*, options?:*, runtimeContext?:*}} input
 * @returns {{allowed:boolean, reasons:string[]}}
 */
export function validateExecutionPolicy(input) {
  const safeInput = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const reasons = [];
  for (const rule of POLICY_RULES) {
    if (!rule.check(safeInput)) {
      reasons.push(rule.reason);
    }
  }
  return { allowed: reasons.length === 0, reasons };
}

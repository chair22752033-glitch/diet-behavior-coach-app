/*
 * Phase 1 TASK 1.55｜Intelligence Execution Governance Layer Foundation
 * - Intelligence Execution Governance Service
 *
 * 責任：對外暴露單一介面`validateExecution(input)`，內部呼叫
 * `execution_policy.js`的`validateExecutionPolicy()`做純結構性的
 * 政策檢查，再用`governance_result_builder.js`組成規格要求的統一
 * 輸出形狀`{status, allowed, reasons, metadata}`。
 *
 * 架構位置（規格原文）：
 *
 *   Execution Facade（TASK1.48）
 *     ↓
 *   Execution Manager（TASK1.50）
 *     ↓
 *   Governance Layer（這裡）── 只判斷「允不允許執行」，不執行分析
 *     ↓
 *   Execution Policy Validation
 *     ↓
 *   既有 Intelligence Pipeline（Orchestrator/Analysis/Recommendation）
 *
 * **這次任務刻意不把Governance接進上面這條真實呼叫鏈**——規格明確
 * 要求「不要直接修改Orchestrator/Analysis/Recommendation」，「若需要
 * 串接，只能透過Dependency Injection」，且Bootstrap Requirement
 * 明確要求「純新增namespace，不改變既有execution behavior」。因此
 * 這裡建立的是一個完全獨立、可以在未來被facade/execution manager
 * 透過依賴注入接上的Governance Service，但`execution_manager.js`/
 * `intelligence_facade.js`本次完全沒有被修改，架構圖描述的是「未來
 * 可以怎麼接」，不是「這次任務已經接上」的既成事實。這是刻意的邊界
 * 決策，維持「治理跟執行邏輯完全independent」——跟TASK1.53
 * （Monitoring）、TASK1.54（Metrics）建立唯讀觀察層、完全不觸碰
 * execution_manager.js的既有慣例一致。
 *
 * Governance Layer不執行分析，只負責回答三個問題：
 * - 是否允許執行（allowed）
 * - 是否符合execution rules（透過reasons陣列列出違反了哪些規則）
 * - 是否符合runtime constraints（跟前面兩點是同一組規則，這裡沒有
 *   拆成兩套獨立機制，因為規格給的Policy Validator本身就是唯一的
 *   規則來源）
 *
 * 這個檔案完全不import src/intelligence/facade/、
 * src/intelligence/execution/、src/intelligence/orchestration/、
 * src/intelligence/analysis/、src/intelligence/recommendation/、
 * src/intelligence/service/底下任何檔案——唯一的相對路徑import是
 * ./execution_policy.js跟./governance_result_builder.js（Governance
 * 自己的兩個直接helper檔案）。
 */
import { validateExecutionPolicy } from './execution_policy.js';
import { buildGovernanceResult } from './governance_result_builder.js';

const GOVERNANCE_METADATA_VERSION = '1.0';

/**
 * @param {{policyValidator?: (input:object) => {allowed:boolean, reasons:string[]}}} [dependencies] -
 *   選填的依賴注入，`policyValidator`預設為`validateExecutionPolicy`，
 *   讓測試可以注入替代的policy validator觀察Governance Service的
 *   組裝行為，不提供時完全使用規格要求的預設政策規則。
 * @returns {{validateExecution: (input:{userId?:*, options?:*, runtimeContext?:*}) => {status:string, allowed:boolean, reasons:string[], metadata:{version:string}}}}
 */
export function createGovernanceService(dependencies) {
  dependencies = dependencies || {};
  const policyValidator = typeof dependencies.policyValidator === 'function' ? dependencies.policyValidator : validateExecutionPolicy;

  /**
   * @param {{userId?:*, options?:*, runtimeContext?:*}} input
   * @returns {{status:string, allowed:boolean, reasons:string[], metadata:{version:string}}}
   */
  function validateExecution(input) {
    const policyResult = policyValidator(input);
    const allowed = policyResult && policyResult.allowed === true;
    const reasons = policyResult && Array.isArray(policyResult.reasons) ? policyResult.reasons : [];
    return buildGovernanceResult({
      status: allowed ? 'governance_passed' : 'governance_rejected',
      allowed,
      reasons,
      metadata: { version: GOVERNANCE_METADATA_VERSION },
    });
  }

  return { validateExecution };
}

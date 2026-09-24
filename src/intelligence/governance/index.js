/*
 * Phase 1 TASK 1.55｜Intelligence Execution Governance Layer Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/metrics/index.js 同樣的角色：把
 * src/intelligence/governance/ 底下所有可對外使用的東西集中在這裡
 * re-export。
 *
 * 跟history/monitoring/metrics不同，這裡的createGovernanceService()
 * 完全無狀態、不接受historyStore/eventDispatcher依賴，也刻意沒有被
 * 接進facade→execution manager的真實呼叫鏈（見
 * src/intelligence/governance/README.md的「架構位置」說明）——只是
 * 掛在src/bootstrap/application.js的`intelligence.governance`底下，
 * 也被src/intelligence/index.js re-export成`governance` namespace，
 * 是留給Phase 3未來透過依賴注入接上的獨立extension point。
 */
export { validateExecutionPolicy } from './execution_policy.js';
export { buildGovernanceResult } from './governance_result_builder.js';
export { createGovernanceService } from './governance_service.js';

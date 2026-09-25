/*
 * Phase 4 TASK 1.83｜Decision Capability Foundation
 * - 統一輸出入口
 *
 * 把 src/intelligence/capabilities/decision/ 底下所有可對外使用的
 * 東西集中在這裡re-export，跟`../analysis/index.js`（TASK1.76）/
 * `../recommendation/index.js`（TASK1.77）/`../orchestration/
 * index.js`（TASK1.78）同樣的角色。
 *
 * 目前沒有任何 controller/route/worker.js/Capability
 * Orchestrator/既有Feature import這個目錄——這是純粹的Phase 4
 * extension point（見src/intelligence/capabilities/index.js跟
 * src/intelligence/index.js），本次任務明確禁止新增任何API
 * route，也沒有把這個Capability接進src/bootstrap/application.js
 * 或`capability_orchestrator.js`。
 */
export { createDecisionCapability } from './decision_capability.js';
export { createDecisionCapabilityResultBuilder, buildDecisionOutputPlaceholder, DECISION_OUTPUT_VERSION } from './decision_result_builder.js';

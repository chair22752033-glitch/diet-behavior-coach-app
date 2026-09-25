/*
 * Phase 4 TASK 1.78｜Intelligence Capability Orchestration Foundation
 * - 統一輸出入口
 *
 * 把 src/intelligence/capabilities/orchestration/ 底下所有可對外
 * 使用的東西集中在這裡re-export，跟`../analysis/index.js`
 * （TASK1.76）/`../recommendation/index.js`（TASK1.77）同樣的角色。
 *
 * 目前沒有任何 controller/route/worker.js/既有Feature import這個
 * 目錄——這是純粹的Phase 4 extension point（見
 * src/intelligence/capabilities/index.js跟
 * src/intelligence/index.js），本次任務明確禁止新增任何API route，
 * 也沒有把這個Orchestrator接進src/bootstrap/application.js。
 */
export { createCapabilityOrchestrator } from './capability_orchestrator.js';
export { createCapabilityOrchestratorResultBuilder } from './capability_result_builder.js';

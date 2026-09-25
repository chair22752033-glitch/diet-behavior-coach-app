/*
 * Phase 4 TASK 1.76｜Analysis Capability Execution Foundation
 * - 統一輸出入口
 *
 * 把 src/intelligence/capabilities/analysis/ 底下所有可對外使用的
 * 東西集中在這裡re-export，跟其他既有目錄的index.js同樣的角色。
 *
 * 目前沒有任何 controller/route/worker.js/既有Feature import這個
 * 目錄——這是純粹的Phase 4 extension point（見
 * src/intelligence/capabilities/index.js跟
 * src/intelligence/index.js），本次任務明確禁止新增任何API route，
 * 也沒有把這個Capability接進src/bootstrap/application.js。
 */
export { createAnalysisCapability } from './analysis_capability.js';
export { createAnalysisCapabilityResultBuilder } from './analysis_capability_result_builder.js';

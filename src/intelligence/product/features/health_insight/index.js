/*
 * Phase 6 TASK 1.111｜Health Insight Feature Foundation
 * Implementation
 * - 統一輸出入口
 *
 * 把 src/intelligence/product/features/health_insight/ 底下所有
 * 可對外使用的東西集中在這裡re-export，跟既有
 * `../../entry/index.js`（TASK1.99）/
 * `../../../application/features/intelligence/index.js`
 * （TASK1.79）等Phase 4/Phase 5/Phase 6邊界目錄同樣的角色。
 *
 * 目前沒有任何controller/route/worker.js/五個既有Product
 * Boundary（Entry/Adapter/Execution/Operational/Contract）/
 * Capability Orchestrator import這個目錄——這是純粹的Phase 6
 * extension point，本次任務明確禁止新增任何API
 * route，也沒有把Health Insight Feature接進
 * src/bootstrap/application.js。實際的真實Product Boundary串接/
 * 真實route整合留給未來任務決定。
 */
export { createHealthInsightFeature } from './health_insight_feature.js';
export { createHealthInsightResultMapper } from './health_insight_result_mapper.js';

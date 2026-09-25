/*
 * Phase 4 TASK 1.77｜Recommendation Capability Execution Foundation
 * - 統一輸出入口
 *
 * 把 src/intelligence/capabilities/recommendation/ 底下所有可對外
 * 使用的東西集中在這裡re-export，跟`../analysis/index.js`
 * （TASK1.76）同樣的角色。
 *
 * 目前沒有任何 controller/route/worker.js/既有Feature import這個
 * 目錄——這是純粹的Phase 4 extension point（見
 * src/intelligence/capabilities/index.js跟
 * src/intelligence/index.js），本次任務明確禁止新增任何API route，
 * 也沒有把這個Capability接進src/bootstrap/application.js。
 */
export { createRecommendationCapability } from './recommendation_capability.js';
export { createRecommendationCapabilityResultBuilder } from './recommendation_capability_result_builder.js';

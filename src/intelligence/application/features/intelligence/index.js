/*
 * Phase 4 TASK 1.79｜Feature Intelligence Capability Integration
 * Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/application/features/behavior/index.js 同樣的
 * 角色：把 src/intelligence/application/features/intelligence/ 底下
 * 所有可對外使用的東西集中在這裡re-export。
 *
 * 目前沒有任何 controller/route/worker.js import 這個目錄——這是
 * 純粹的Phase 4 extension point，也還沒有任何真實的User
 * Application呼叫它，本次任務明確禁止新增任何API route，也沒有把
 * 這個Feature接進src/bootstrap/application.js（延續TASK1.76/1.77/
 * 1.78「已建立但未接線」的既有模式，見README.md）。
 */
export { createIntelligenceFeature } from './intelligence_feature.js';
export { createIntelligenceFeatureResultMapper } from './intelligence_feature_result_mapper.js';

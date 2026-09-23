/*
 * Phase 1 TASK 1.40｜Phase 2 Intelligence Architecture Foundation
 * （TASK1.41 新增 dataPreparation namespace）
 * - 統一輸出入口
 *
 * 跟 src/contracts/index.js、src/routes/index.js 同樣的角色：把
 * src/intelligence/ 底下所有可對外使用的東西集中在這裡re-export，
 * 未來需要用到 Intelligence Layer 的地方（例如 Application Service）
 * 只需要 import 這一個檔案。
 *
 * 目前沒有任何 controller/route/service import 這個目錄——這是純粹的
 * Phase 2 extension point（見 src/bootstrap/application.js 的
 * `intelligence` namespace）。TASK1.41 新增的 dataPreparation 也沒有
 * 被 insight_service.js 呼叫（insight_service.js 本次完全不修改）。
 */
export { createInsightService } from './insight_service.js';
export { createAnalysisEngine } from './analysis_engine.js';
export { createRecommendationEngine } from './recommendation_engine.js';
export * as contracts from './contracts.js';
export * as dataPreparation from './data_preparation/index.js';

/*
 * Phase 1 TASK 1.44｜Recommendation Framework Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/analysis/index.js 同樣的角色：把
 * src/intelligence/recommendation/ 底下所有可對外使用的東西集中在
 * 這裡re-export。
 *
 * 目前沒有任何 controller/route import 這個目錄，`insight_service.js`
 * 本次也沒有被修改成會呼叫這裡——只有 src/bootstrap/application.js
 * 會組裝出 `intelligence.recommendation`，純粹是Phase 2 extension
 * point。
 */
export { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } from './recommendation_runner.js';
export { createRecommendationResultBuilder, RECOMMENDATION_RESULT_VERSION } from './recommendation_result_builder.js';

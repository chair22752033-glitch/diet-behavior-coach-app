/*
 * Phase 1 TASK 1.43｜Insight Analysis Framework Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/data_preparation/index.js、src/intelligence/
 * context/index.js 同樣的角色：把 src/intelligence/analysis/ 底下所有
 * 可對外使用的東西集中在這裡re-export。
 *
 * 目前沒有任何 controller/route import 這個目錄，`insight_service.js`
 * 本次也沒有被修改成會呼叫這裡——只有 src/bootstrap/application.js
 * 會組裝出 `intelligence.analysis`，純粹是Phase 2 extension point。
 */
export { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } from './analysis_runner.js';
export { createAnalysisResultBuilder, ANALYSIS_RESULT_VERSION } from './analysis_result_builder.js';

/*
 * Phase 1 TASK 1.45｜Intelligence Orchestration Layer Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/analysis/index.js、src/intelligence/
 * recommendation/index.js 同樣的角色：把 src/intelligence/orchestration/
 * 底下所有可對外使用的東西集中在這裡re-export。
 *
 * 目前沒有任何 controller/route import 這個目錄，`insight_service.js`
 * 本次也沒有被修改成會呼叫這裡——只有 src/bootstrap/application.js
 * 會組裝出 `intelligence.orchestration`，純粹是Phase 2 extension
 * point。
 */
export { createIntelligenceOrchestrator } from './intelligence_orchestrator.js';
export { createOrchestrationResultBuilder, ORCHESTRATION_RESULT_VERSION } from './orchestration_result_builder.js';

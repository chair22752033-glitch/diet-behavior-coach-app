/*
 * Phase 3 TASK 1.65｜Intelligence Application Feature Entry
 * Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/application/workflows/index.js 同樣的角色：把
 * src/intelligence/application/features/ 底下所有可對外使用的東西
 * 集中在這裡re-export。
 *
 * 這裡的createInsightFeature()是Phase 3第一個完整的Feature Entry
 * ——透過依賴注入拿到跟`intelligence.workflow`完全相同的Application
 * Workflow實例，完全不import
 * src/intelligence/application/capabilities/、
 * src/intelligence/application/use_cases/、
 * src/intelligence/application/application_service.js、
 * src/intelligence/facade/、src/intelligence/execution/、
 * src/intelligence/history/、src/intelligence/metrics/、
 * src/intelligence/events/、src/intelligence/service/、
 * src/intelligence/orchestration/、src/intelligence/analysis/、
 * src/intelligence/recommendation/、src/intelligence/governance/
 * 底下任何檔案——這個檔案唯一的相對路徑import是
 * ./feature_result_builder.js。
 *
 * 目前沒有任何 controller/route/worker.js import 這個目錄——這是
 * 純粹的Phase 3 extension point（見src/bootstrap/application.js的
 * `intelligence.features`），也還沒有任何真實的User Application
 * 呼叫它，本次任務明確禁止新增任何API route。
 */
export { createInsightFeature } from './insight_feature.js';
export { createFeatureResultBuilder } from './feature_result_builder.js';

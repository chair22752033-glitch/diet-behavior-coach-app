/*
 * Phase 3 TASK 1.66｜Insight Feature Capability Implementation
 * Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/application/features/index.js 同樣的角色：把
 * src/intelligence/application/features/insight/ 底下所有可對外
 * 使用的東西集中在這裡re-export。
 *
 * 這裡的createInsightFeatureCapability()是Phase 3第一個「正式」的
 * Feature Capability——透過依賴注入拿到跟`intelligence.workflow`
 * 完全相同的Application Workflow實例，完全不import
 * src/intelligence/application/capabilities/、
 * src/intelligence/application/use_cases/、
 * src/intelligence/application/application_service.js、
 * src/intelligence/facade/、src/intelligence/execution/、
 * src/intelligence/history/、src/intelligence/metrics/、
 * src/intelligence/events/、src/intelligence/service/、
 * src/intelligence/orchestration/、src/intelligence/analysis/、
 * src/intelligence/recommendation/、src/intelligence/governance/
 * 底下任何檔案——這個檔案唯一的相對路徑import是
 * ./insight_result_mapper.js。
 *
 * 目前沒有任何 controller/route/worker.js import 這個目錄——這是
 * 純粹的Phase 3 extension point（見src/bootstrap/application.js的
 * `intelligence.insightFeature`），也還沒有任何真實的User
 * Application呼叫它，本次任務明確禁止新增任何API route。
 *
 * Phase 3 TASK1.67新增：`context` namespace，re-export
 * ./context/index.js——把Runtime Context映射成Insight Domain可
 * 使用格式的純函式工具（`createInsightContextMapper()`/
 * `createInsightContextResultBuilder()`），跟TASK1.63
 * src/intelligence/application/contracts/同樣的角色。這個
 * namespace目前**沒有被**insight_capability.js/
 * insight_result_mapper.js import——維持「建立但不改變既有
 * execution behavior」的邊界決策，用測試證明Insight Feature
 * 事實上可以消費Runtime Context。
 *
 * Phase 3 TASK1.68新增：`output` namespace，re-export
 * ./output/index.js——把Insight Context Mapper（TASK1.67）攤平出來
 * 的Insight Domain視圖轉換成穩定Insight Domain Output的純函式
 * 工具（`InsightOutputModel`/`validateInsightOutput`/
 * `createInsightOutputMapper()`），同樣是「建立但不改變既有
 * execution behavior」的extension point，目前沒有被
 * insight_capability.js/insight_context_mapper.js import。
 */
export { createInsightFeatureCapability } from './insight_capability.js';
export { createInsightResultMapper } from './insight_result_mapper.js';
export * as context from './context/index.js';
export * as output from './output/index.js';

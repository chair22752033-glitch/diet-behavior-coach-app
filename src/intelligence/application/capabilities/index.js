/*
 * Phase 3 TASK 1.62｜Intelligence Application Capability Layer
 * Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/application/use_cases/index.js 同樣的角色：把
 * src/intelligence/application/capabilities/ 底下所有可對外使用的
 * 東西集中在這裡re-export。
 *
 * 這裡的createInsightCapability()是Phase 3第一個Capability——透過
 * 依賴注入拿到跟`intelligence.useCases`完全相同的Insight Use Case
 * 實例（見src/bootstrap/application.js），完全不import
 * src/intelligence/application/application_service.js、
 * src/intelligence/facade/、src/intelligence/execution/、
 * src/intelligence/history/、src/intelligence/metrics/、
 * src/intelligence/events/、src/intelligence/service/、
 * src/intelligence/orchestration/、src/intelligence/analysis/、
 * src/intelligence/recommendation/、src/intelligence/governance/
 * 底下任何檔案——這個檔案唯一的相對路徑import是
 * ./capability_result_builder.js。
 *
 * 目前沒有任何 controller/route/worker.js import 這個目錄——這是
 * 純粹的Phase 3 extension point（見src/bootstrap/application.js的
 * `intelligence.capabilities`），也還沒有任何真實的User Application
 * 呼叫它，本次任務明確禁止新增任何API route。
 */
export { createInsightCapability } from './insight_capability.js';
export { createCapabilityResultBuilder } from './capability_result_builder.js';

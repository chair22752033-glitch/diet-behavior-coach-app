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
 *
 * Phase 3 TASK1.66新增：`insight` namespace，re-export
 * ./insight/index.js——Insight這個domain自己明確的Capability
 * Implementation（`createInsightFeatureCapability({workflow})`），
 * 跟本檔案re-export的`createInsightFeature`（TASK1.65的通用Feature
 * Entry骨架）並存、互不覆蓋。這個nested子目錄同樣只透過依賴注入拿到
 * 跟`intelligence.workflow`完全相同的Application Workflow實例，
 * 唯一的相對路徑import是它自己底下的`./insight_result_mapper.js`。
 *
 * Phase 3 TASK1.72新增：`behavior` namespace，re-export
 * ./behavior/index.js——Phase 3第二個Intelligence Application
 * Feature domain（"behavior"），驗證Application Pattern
 * （Feature→Workflow→Capability→Use Case→Application Service→
 * Runtime）可以支援不同domain。跟`insight`namespace同一種性質
 * （nested子目錄自成一個domain），差別是Behavior domain注入的
 * `workflow`是**另外建立的獨立Workflow實例**（不是跟
 * `intelligence.workflow`共用同一份），確保Behavior完全不依賴
 * Insight Feature（見`./behavior/README.md`跟
 * `../EXTENSION_PATTERN.md`第3節說明）。
 *
 * Phase 4 TASK1.79新增：`intelligence` namespace，re-export
 * ./intelligence/index.js——這個nested子目錄跟`insight`/
 * `behavior`namespace架構位置不同：它完全不呼叫Workflow，而是走
 * 規格明確畫出的另一條平行路徑（Feature→Capability
 * Orchestrator→Analysis Capability→Recommendation
 * Capability→Output），把Phase 4的Analysis Capability
 * （TASK1.76）+ Recommendation Capability（TASK1.77）+ Capability
 * Orchestration（TASK1.78）正式接上Feature層級的入口。跟`insight`/
 * `behavior`一樣是nested子目錄自成一個domain、互不認識，差別只在
 * 這個domain底下呼叫的下一層是Capability Orchestrator，不是
 * Workflow（見`./intelligence/README.md`）。
 */
export { createInsightFeature } from './insight_feature.js';
export { createFeatureResultBuilder } from './feature_result_builder.js';
export * as insight from './insight/index.js';
export * as behavior from './behavior/index.js';
export * as intelligence from './intelligence/index.js';

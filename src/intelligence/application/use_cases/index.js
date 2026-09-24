/*
 * Phase 3 TASK 1.61｜Intelligence Application Use Case Layer
 * Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/application/index.js 同樣的角色：把
 * src/intelligence/application/use_cases/ 底下所有可對外使用的東西
 * 集中在這裡re-export。
 *
 * 這裡的createInsightUseCase()是Phase 3第一個Use Case
 * Scenario——透過依賴注入拿到跟`intelligence.application`完全相同
 * 的Application Service實例（見src/bootstrap/application.js），
 * 完全不import src/intelligence/facade/、
 * src/intelligence/execution/、src/intelligence/history/、
 * src/intelligence/metrics/、src/intelligence/events/、
 * src/intelligence/service/、src/intelligence/orchestration/、
 * src/intelligence/analysis/、src/intelligence/recommendation/、
 * src/intelligence/governance/底下任何檔案——這個檔案唯一的相對
 * 路徑import是./use_case_result_builder.js。
 *
 * 目前沒有任何 controller/route/worker.js import 這個目錄——這是
 * 純粹的Phase 3 extension point（見src/bootstrap/application.js的
 * `intelligence.useCases`），也還沒有任何真實的User Application
 * 呼叫它，本次任務明確禁止新增任何API route。
 */
export { createInsightUseCase } from './insight_use_case.js';
export { createUseCaseResultBuilder } from './use_case_result_builder.js';

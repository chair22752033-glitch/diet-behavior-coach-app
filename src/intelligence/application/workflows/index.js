/*
 * Phase 3 TASK 1.64｜Intelligence Application Workflow Layer
 * Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/application/capabilities/index.js 同樣的
 * 角色：把 src/intelligence/application/workflows/ 底下所有可對外
 * 使用的東西集中在這裡re-export。
 *
 * 這裡的createApplicationWorkflow()是Phase 3第一個實際採用TASK1.63
 * Contract Layer的層——透過依賴注入拿到跟`intelligence.capabilities`
 * 完全相同的Insight Capability實例，以及一個`createContractValidator()`
 * 建立的Contract Validator實例，完全不import
 * src/intelligence/application/use_cases/、
 * src/intelligence/application/application_service.js、
 * src/intelligence/facade/、src/intelligence/execution/、
 * src/intelligence/history/、src/intelligence/metrics/、
 * src/intelligence/events/、src/intelligence/service/、
 * src/intelligence/orchestration/、src/intelligence/analysis/、
 * src/intelligence/recommendation/、src/intelligence/governance/
 * 底下任何檔案——這個檔案唯一的相對路徑import是
 * ./workflow_result_builder.js。
 *
 * 目前沒有任何 controller/route/worker.js import 這個目錄——這是
 * 純粹的Phase 3 extension point（見src/bootstrap/application.js的
 * `intelligence.workflow`），也還沒有任何真實的User Application
 * 呼叫它，本次任務明確禁止新增任何API route。
 */
export { createApplicationWorkflow } from './application_workflow.js';
export { createWorkflowResultBuilder } from './workflow_result_builder.js';

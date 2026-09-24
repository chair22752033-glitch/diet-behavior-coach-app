/*
 * Phase 3 TASK 1.60｜Intelligence Application Service Boundary
 * Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/facade/index.js 同樣的角色：把
 * src/intelligence/application/ 底下所有可對外使用的東西集中在
 * 這裡re-export。
 *
 * 這裡的createApplicationService()是Phase 3規劃（TASK1.59）裡
 * User Application該接進來的第一個真實邊界，透過依賴注入拿到跟
 * `intelligence.facade`完全相同的Facade實例（見
 * src/bootstrap/application.js），完全不import
 * src/intelligence/execution/、src/intelligence/history/、
 * src/intelligence/metrics/、src/intelligence/events/、
 * src/intelligence/service/、src/intelligence/orchestration/、
 * src/intelligence/analysis/、src/intelligence/recommendation/、
 * src/intelligence/governance/底下任何檔案——這個檔案唯一的相對
 * 路徑import是./application_result_builder.js。
 *
 * 目前沒有任何 controller/route/worker.js import 這個目錄——這是
 * 純粹的Phase 3 extension point（見src/bootstrap/application.js的
 * `intelligence.application`），也還沒有任何真實的User Application
 * 呼叫它，本次任務明確禁止新增任何API route。
 */
export { createApplicationService } from './application_service.js';
export { createApplicationResultBuilder } from './application_result_builder.js';

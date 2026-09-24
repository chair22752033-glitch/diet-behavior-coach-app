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
 *
 * Phase 3 TASK1.61新增：`useCases` namespace，re-export
 * ./use_cases/index.js——建立在Application Service之上的Use Case
 * Layer（`createInsightUseCase({applicationService})`），完全不
 * import本檔案（application_service.js/
 * application_result_builder.js），只透過依賴注入拿到跟
 * `intelligence.application`完全相同的Application Service實例，
 * 維持「每一層只認識自己呼叫的下一層」的既有慣例。
 *
 * Phase 3 TASK1.62新增：`capabilities` namespace，re-export
 * ./capabilities/index.js——建立在Use Case Layer之上的Capability
 * Layer（`createInsightCapability({useCase})`），完全不import
 * ./use_cases/index.js或本檔案（application_service.js/
 * application_result_builder.js），只透過依賴注入拿到跟
 * `intelligence.useCases`完全相同的Insight Use Case實例，維持
 * 「每一層只認識自己呼叫的下一層」的既有慣例，再往上疊一層。
 */
export { createApplicationService } from './application_service.js';
export { createApplicationResultBuilder } from './application_result_builder.js';
export * as useCases from './use_cases/index.js';
export * as capabilities from './capabilities/index.js';

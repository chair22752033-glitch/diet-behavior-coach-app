/*
 * Phase 1 TASK 1.46｜Intelligence Application Service Layer Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/orchestration/index.js 同樣的角色：把
 * src/intelligence/service/ 底下所有可對外使用的東西集中在這裡
 * re-export。
 *
 * 目前沒有任何 controller/route/worker.js import 這個目錄——只有
 * src/bootstrap/application.js 會組裝出 `intelligence.service`，純粹
 * 是Phase 2 extension point，留給未來任務決定怎麼串接成使用者可見的
 * 功能。
 */
export { createIntelligenceService } from './intelligence_service.js';
export { createServiceResultBuilder } from './service_result_builder.js';

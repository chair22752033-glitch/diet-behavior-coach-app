/*
 * Phase 1 TASK 1.48｜Intelligence Application Facade Layer Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/service/index.js 同樣的角色：把
 * src/intelligence/facade/ 底下所有可對外使用的東西集中在這裡
 * re-export。
 *
 * 目前沒有任何 controller/route/worker.js import 這個目錄——只有
 * src/bootstrap/application.js 會組裝出 `intelligence.facade`，純粹
 * 是Phase 2 extension point，留給未來任務決定怎麼串接成使用者可見的
 * 功能（例如未來的 authorization/context 整合、或某條 API route）。
 */
export { createIntelligenceFacade } from './intelligence_facade.js';
export { createFacadeResultBuilder } from './facade_result_builder.js';

/*
 * Phase 1 TASK 1.49｜Intelligence Runtime Context Layer Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/facade/index.js 同樣的角色：把
 * src/intelligence/runtime/ 底下所有可對外使用的東西集中在這裡
 * re-export。
 *
 * 這裡的createRuntimeContext()被
 * src/intelligence/facade/intelligence_facade.js實際使用（建立Runtime
 * Context並跟service request一起傳遞），也被
 * src/intelligence/index.js re-export成`runtime` namespace供測試/
 * 未來使用。
 */
export { RuntimeContextContract, validateRuntimeContext } from './runtime_context.js';
export { createRuntimeContext, DEFAULT_REQUEST_ID, DEFAULT_VERSION, DEFAULT_TIMESTAMP } from './runtime_context_builder.js';

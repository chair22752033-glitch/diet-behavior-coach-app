/*
 * Phase 1 TASK 1.50｜Intelligence Execution Lifecycle Manager Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/facade/index.js 同樣的角色：把
 * src/intelligence/execution/ 底下所有可對外使用的東西集中在這裡
 * re-export。
 *
 * 這裡的createExecutionManager()被
 * src/intelligence/facade/intelligence_facade.js實際使用（Facade現在
 * 只呼叫Execution Manager，不再直接呼叫Intelligence Service），也被
 * src/intelligence/index.js re-export成`execution` namespace供測試/
 * 未來使用。
 */
export { EXECUTION_STATES, isValidExecutionState } from './execution_state.js';
export { createExecutionResultBuilder } from './execution_result_builder.js';
export { createExecutionManager } from './execution_manager.js';

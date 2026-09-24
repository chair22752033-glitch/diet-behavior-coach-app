/*
 * Phase 1 TASK 1.51｜Intelligence Execution Event Layer Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/execution/index.js 同樣的角色：把
 * src/intelligence/events/ 底下所有可對外使用的東西集中在這裡
 * re-export。
 *
 * 這裡的createEventDispatcher()被
 * src/intelligence/execution/execution_manager.js透過依賴注入使用
 * （選填的`dependencies.eventDispatcher`，Execution Manager在每次
 * 生命週期狀態轉換時呼叫`eventDispatcher.emit()`），也被
 * src/intelligence/index.js re-export成`events` namespace供測試/
 * 未來使用。
 */
export { EXECUTION_EVENT_TYPES, EventTypeContract, isValidExecutionEventType, validateExecutionEvent, createExecutionEvent } from './execution_event.js';
export { createEventDispatcher } from './event_dispatcher.js';

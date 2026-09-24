/*
 * Phase 1 TASK 1.52｜Intelligence Execution History Layer Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/events/index.js 同樣的角色：把
 * src/intelligence/history/ 底下所有可對外使用的東西集中在這裡
 * re-export。
 *
 * 這裡的createHistoryStore()被
 * src/intelligence/execution/execution_manager.js透過依賴注入使用
 * （選填的`dependencies.historyStore`，Execution Manager在每次
 * 生命週期狀態轉換時呼叫`historyStore.add()`/`get()`），也被
 * src/intelligence/monitoring/、src/intelligence/metrics/（TASK1.53/
 * 1.54）透過依賴注入唯讀查詢（`get()`/`list()`），也被
 * src/intelligence/index.js re-export成`history` namespace供測試/
 * 未來使用。
 */
export { HistoryRecordContract, validateHistoryRecord, createHistoryRecord } from './execution_history.js';
export { createHistoryStore } from './history_store.js';

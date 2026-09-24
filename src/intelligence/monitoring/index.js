/*
 * Phase 1 TASK 1.53｜Intelligence Execution Monitoring Layer Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/history/index.js 同樣的角色：把
 * src/intelligence/monitoring/ 底下所有可對外使用的東西集中在這裡
 * re-export。
 *
 * 這裡的createExecutionMonitor()透過依賴注入拿到跟
 * `intelligence.history`/`intelligence.events`完全相同的
 * historyStore/eventDispatcher實例（見
 * src/bootstrap/application.js），純唯讀觀察，完全不修改
 * Execution Manager的任何狀態，也被src/intelligence/index.js
 * re-export成`monitoring` namespace供測試/未來使用。
 */
export { createExecutionMonitor } from './execution_monitor.js';
export { buildExecutionStatus, buildSummary } from './monitoring_result_builder.js';

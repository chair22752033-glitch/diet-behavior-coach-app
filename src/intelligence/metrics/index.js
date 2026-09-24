/*
 * Phase 1 TASK 1.54｜Intelligence Execution Metrics Layer Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/monitoring/index.js 同樣的角色：把
 * src/intelligence/metrics/ 底下所有可對外使用的東西集中在這裡
 * re-export。
 *
 * 這裡的createExecutionMetrics()透過依賴注入拿到跟
 * `intelligence.history`/`intelligence.events`完全相同的
 * historyStore/eventDispatcher實例（見
 * src/bootstrap/application.js），跟monitoring是同一種唯讀觀察者
 * 角色，差別在於這裡著重跨執行的彙總統計數字，也被
 * src/intelligence/index.js re-export成`metrics` namespace供測試/
 * 未來使用。
 */
export { createExecutionMetrics } from './execution_metrics.js';
export { buildMetrics, buildMetricsResult } from './metrics_result_builder.js';

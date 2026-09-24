/*
 * Phase 3 TASK 1.67｜Insight Feature Context Integration Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/application/features/insight/index.js 同樣的
 * 角色：把 src/intelligence/application/features/insight/context/
 * 底下所有可對外使用的東西集中在這裡re-export。
 *
 * 這裡的兩個檔案目前**沒有被** insight_capability.js（TASK1.66）
 * import——維持TASK1.55 Governance Layer/TASK1.63 Contract Layer
 * 同樣的邊界決策（「建立但不改變既有已測試層的execution
 * behavior」）。這是純粹的Phase 3 extension point，用測試證明
 * Insight Feature「事實上」可以消費Runtime Context，而不是把
 * insight_capability.js重構成import這個目錄。
 */
export { createInsightContextMapper } from './insight_context_mapper.js';
export { createInsightContextResultBuilder } from './insight_context_result_builder.js';

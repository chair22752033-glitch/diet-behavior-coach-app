/*
 * Phase 3 TASK 1.68｜Insight Feature Output Model Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/application/features/insight/context/index.js
 * 同樣的角色：把
 * src/intelligence/application/features/insight/output/ 底下所有
 * 可對外使用的東西集中在這裡re-export。
 *
 * 這裡的兩個檔案目前**沒有被** insight_capability.js（TASK1.66）/
 * insight_context_mapper.js（TASK1.67）import——維持TASK1.55
 * Governance Layer/TASK1.63 Contract Layer/TASK1.67 Insight
 * Context Layer同樣的邊界決策（「建立但不改變既有已測試層的
 * execution behavior」）。這是純粹的Phase 3 extension point，用
 * 測試證明Insight Feature「事實上」可以產生穩定的Insight Domain
 * Output，而不是把既有已測試層重構成import這個目錄。
 */
export { InsightOutputModel, validateInsightOutput } from './insight_output_model.js';
export { createInsightOutputMapper } from './insight_output_mapper.js';

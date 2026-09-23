/*
 * Phase 1 TASK 1.42｜Insight Context Integration Layer
 * - 統一輸出入口
 *
 * 跟 src/intelligence/data_preparation/index.js 同樣的角色：把
 * src/intelligence/context/ 底下所有可對外使用的東西集中在這裡
 * re-export。
 *
 * 目前沒有任何 controller/route import 這個目錄——只有
 * src/intelligence/insight_service.js（TASK1.40既有、TASK1.42新增
 * getInsightContext()）跟 src/bootstrap/application.js（TASK1.42
 * 新增 intelligence.context）會用到這裡的 createInsightContextBuilder()。
 */
export { createInsightContextBuilder } from './insight_context_builder.js';

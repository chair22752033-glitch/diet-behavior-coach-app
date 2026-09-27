/*
 * Phase 5 TASK 1.99｜Product Entry Boundary Minimal Implementation
 * - 統一輸出入口
 *
 * 把 src/intelligence/product/entry/ 底下所有可對外使用的東西
 * 集中在這裡re-export，跟既有`../../capabilities/decision/
 * index.js`（TASK1.83）等Phase 4 Capability目錄同樣的角色。
 *
 * 目前沒有任何controller/route/worker.js/Capability
 * Orchestrator/既有Feature import這個目錄——這是純粹的Phase 5
 * extension point，本次任務明確禁止新增任何API route，也沒有把
 * Product Entry接進src/bootstrap/application.js或任何
 * Orchestrator。實際的Product Feature/Intelligence Adapter/
 * 真實route整合留給未來任務決定。
 */
export { createProductEntry } from './product_entry.js';
export { createProductEntryResultBuilder } from './product_entry_result_builder.js';

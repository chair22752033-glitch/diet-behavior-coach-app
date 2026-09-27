/*
 * Phase 5 TASK 1.100｜Product Adapter Boundary Minimal Implementation
 * - 統一輸出入口
 *
 * 把 src/intelligence/product/adapter/ 底下所有可對外使用的東西
 * 集中在這裡re-export，跟既有`../entry/index.js`（TASK1.99）/
 * `../../capabilities/decision/index.js`（TASK1.83）等Phase 4/
 * Phase 5邊界目錄同樣的角色。
 *
 * 目前沒有任何controller/route/worker.js/Product
 * Entry/Capability Orchestrator/既有Feature import這個目錄——這是
 * 純粹的Phase 5 extension point，本次任務明確禁止新增任何API
 * route，也沒有把Product Adapter接進src/bootstrap/application.js
 * 或Product Entry既有的呼叫鏈。實際的真實Intelligence Feature
 * 注入/真實route整合留給未來任務決定。
 */
export { createProductAdapter } from './product_adapter.js';
export { createProductAdapterResultBuilder } from './product_adapter_result_builder.js';

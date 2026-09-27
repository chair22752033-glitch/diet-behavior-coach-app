/*
 * Phase 5 TASK 1.102｜Product Operational Boundary Minimal
 * Implementation
 * - 統一輸出入口
 *
 * 把 src/intelligence/product/operational/ 底下所有可對外使用的
 * 東西集中在這裡re-export，跟既有`../execution/index.js`
 * （TASK1.101）/`../adapter/index.js`（TASK1.100）/
 * `../entry/index.js`（TASK1.99）等Phase 5邊界目錄同樣的角色。
 *
 * 目前沒有任何controller/route/worker.js/Product Execution/
 * Adapter/Capability Orchestrator/既有Feature import這個目錄——
 * 這是純粹的Phase 5 extension point，本次任務明確禁止新增任何
 * API route，也沒有把Product Operational接進
 * src/bootstrap/application.js或Product Execution/Adapter既有
 * 的呼叫鏈。實際的真實監控/日誌機制留給未來任務決定。
 */
export { createProductOperational } from './product_operational.js';
export { createProductOperationalResultBuilder } from './product_operational_result_builder.js';

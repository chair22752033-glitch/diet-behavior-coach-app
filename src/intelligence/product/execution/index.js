/*
 * Phase 5 TASK 1.101｜Product Execution Boundary Minimal Implementation
 * - 統一輸出入口
 *
 * 把 src/intelligence/product/execution/ 底下所有可對外使用的
 * 東西集中在這裡re-export，跟既有`../adapter/index.js`
 * （TASK1.100）/`../entry/index.js`（TASK1.99）等Phase 5邊界目錄
 * 同樣的角色。
 *
 * 目前沒有任何controller/route/worker.js/Product Adapter/
 * Capability Orchestrator/既有Feature import這個目錄——這是純粹
 * 的Phase 5 extension point，本次任務明確禁止新增任何API
 * route，也沒有把Product Execution接進
 * src/bootstrap/application.js或Product Adapter既有的呼叫鏈。
 * 實際的真實Intelligence Feature注入/真實route整合留給未來任務
 * 決定。
 */
export { createProductExecution } from './product_execution.js';
export { createProductExecutionResultBuilder } from './product_execution_result_builder.js';

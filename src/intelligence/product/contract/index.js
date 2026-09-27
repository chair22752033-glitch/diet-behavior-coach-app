/*
 * Phase 5 TASK 1.103｜Product Contract Boundary Minimal
 * Implementation
 * - 統一輸出入口
 *
 * 把 src/intelligence/product/contract/ 底下所有可對外使用的
 * 東西集中在這裡re-export，跟既有`../operational/index.js`
 * （TASK1.102）/`../execution/index.js`（TASK1.101）/
 * `../adapter/index.js`（TASK1.100）/`../entry/index.js`
 * （TASK1.99）等Phase 5邊界目錄同樣的角色。
 *
 * 目前沒有任何controller/route/worker.js/Product Entry/
 * Adapter/Capability Orchestrator/既有Feature import這個目錄——
 * 這是純粹的Phase 5 extension point，本次任務明確禁止新增任何
 * API route，也沒有把Product Contract接進
 * src/bootstrap/application.js或Product Entry既有的呼叫鏈。
 */
export { createProductContract } from './product_contract.js';
export { createProductContractValidator, SUPPORTED_RESPONSE_VERSIONS, validateProductRequestShape, validateProductResponseShape, extractResponseVersion, checkVersionCompatibility } from './product_contract_validator.js';
export { createProductContractResultBuilder } from './product_contract_result_builder.js';

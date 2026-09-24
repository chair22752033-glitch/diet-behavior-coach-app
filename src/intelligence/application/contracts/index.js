/*
 * Phase 3 TASK 1.63｜Intelligence Application Contract Layer
 * Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/contracts/execution/index.js 同樣的角色：把
 * src/intelligence/application/contracts/ 底下所有可對外使用的東西
 * 集中在這裡re-export。
 *
 * 這裡的兩個contract跟一個contract_validator目前**沒有被**
 * Capability/Use Case/Application Service三層import——本次任務
 * 明確禁止修改Analysis/Recommendation Runner、直接操作Execution
 * Runtime，也沒有要求重構已經各自通過測試的既有Phase 3層。這是
 * 純粹的Phase 3 extension point，用獨立的測試證明三層「事實上」
 * 遵守同一份request/response contract，而不是把三層改成import
 * 這個目錄。
 */
export { ApplicationRequestContract, validateApplicationRequestContract } from './application_request_contract.js';
export { ApplicationResponseContract, validateApplicationResponseContract } from './application_response_contract.js';
export { createContractValidator } from './contract_validator.js';

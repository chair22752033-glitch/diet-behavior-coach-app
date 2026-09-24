/*
 * Phase 1 TASK 1.47｜Intelligence Execution Contract Layer Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/orchestration/index.js、src/intelligence/
 * service/index.js 同樣的角色：把
 * src/intelligence/contracts/execution/ 底下所有可對外使用的東西集中
 * 在這裡re-export。
 *
 * 這裡的三個contract被 src/intelligence/service/intelligence_service.js
 * 實際使用（`getIntelligence()`用它們驗證request/options/回應），也被
 * src/intelligence/index.js re-export成`executionContracts` namespace
 * 供測試/未來使用。
 */
export { IntelligenceRequestContract, validateIntelligenceRequest } from './intelligence_request_contract.js';
export { ExecutionOptionsContract, validateExecutionOptions } from './execution_options_contract.js';
export { IntelligenceResponseContract, validateIntelligenceResponse, EXPECTED_STATUS } from './intelligence_response_contract.js';

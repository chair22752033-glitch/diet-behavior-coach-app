/*
 * Phase 1 TASK 1.40｜Phase 2 Intelligence Architecture Foundation
 * （TASK1.41 新增 dataPreparation namespace；TASK1.42 新增 context
 * namespace 與 insightContextContract；TASK1.43 新增 analysis
 * namespace；TASK1.44 新增 recommendation namespace；TASK1.45 新增
 * orchestration namespace；TASK1.46 新增 service namespace；TASK1.47
 * 新增 executionContracts namespace；TASK1.48 新增 facade namespace）
 * - 統一輸出入口
 *
 * 跟 src/contracts/index.js、src/routes/index.js 同樣的角色：把
 * src/intelligence/ 底下所有可對外使用的東西集中在這裡re-export，
 * 未來需要用到 Intelligence Layer 的地方（例如 Application Service）
 * 只需要 import 這一個檔案。
 *
 * 目前沒有任何 controller/route/worker.js import 這個目錄——這是純粹的
 * Phase 2 extension point（見 src/bootstrap/application.js 的
 * `intelligence` namespace）。TASK1.41 新增的 dataPreparation 沒有被
 * insight_service.js 呼叫；TASK1.42 新增的 context/insightContextContract
 * 正式被 insight_service.js 的 getInsightContext() 使用（透過依賴
 * 注入，insight_service.js 本身仍然不 import 這個目錄底下任何檔案）；
 * TASK1.43 新增的 analysis、TASK1.44 新增的 recommendation、TASK1.45
 * 新增的 orchestration、TASK1.46 新增的 service 則跟 dataPreparation
 * 一樣，本次沒有被既有的 insight_service.js 呼叫，純粹是 extension
 * point，留給未來任務決定怎麼串接。orchestration namespace本身透過
 * 依賴注入協調前面四層（dataPreparation/context/analysis/
 * recommendation），service namespace則透過依賴注入呼叫orchestration，
 * 但這個統一輸出入口本身不做任何組裝，只負責re-export。TASK1.47新增
 * 的executionContracts namespace跟insightContextContract一樣，是被
 * intelligence/service/intelligence_service.js直接import使用的純函式
 * 驗證工具（用來驗證getIntelligence()的request/options/response
 * 形狀），不是需要在bootstrap組裝的獨立子層實例。TASK1.48新增的facade
 * namespace則跟orchestration/service一樣，透過依賴注入呼叫
 * service（唯一允許呼叫的下一層），是需要在bootstrap組裝的獨立子層
 * 實例。
 */
export { createInsightService } from './insight_service.js';
export { createAnalysisEngine } from './analysis_engine.js';
export { createRecommendationEngine } from './recommendation_engine.js';
export * as contracts from './contracts.js';
export * as dataPreparation from './data_preparation/index.js';
export * as context from './context/index.js';
export { InsightContextContract as insightContextContract, validateInsightContext } from './contracts/insight_context_contract.js';
export * as analysis from './analysis/index.js';
export * as recommendation from './recommendation/index.js';
export * as orchestration from './orchestration/index.js';
export * as service from './service/index.js';
export * as executionContracts from './contracts/execution/index.js';
export * as facade from './facade/index.js';

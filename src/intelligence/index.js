/*
 * Phase 1 TASK 1.40｜Phase 2 Intelligence Architecture Foundation
 * （TASK1.41 新增 dataPreparation namespace；TASK1.42 新增 context
 * namespace 與 insightContextContract；TASK1.43 新增 analysis
 * namespace；TASK1.44 新增 recommendation namespace；TASK1.45 新增
 * orchestration namespace；TASK1.46 新增 service namespace；TASK1.47
 * 新增 executionContracts namespace；TASK1.48 新增 facade namespace；
 * TASK1.49 新增 runtime namespace；TASK1.50 新增 execution
 * namespace；TASK1.51 新增 events namespace；TASK1.52 新增 history
 * namespace；TASK1.53 新增 monitoring namespace）
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
 * 實例。TASK1.49新增的runtime namespace則跟executionContracts一樣，
 * 是被intelligence/facade/intelligence_facade.js直接import使用的
 * 純函式工具（用來建立Runtime Context），不是需要在bootstrap組裝的
 * 獨立子層實例。TASK1.50新增的execution namespace則跟orchestration/
 * service一樣，透過依賴注入呼叫service（唯一允許呼叫的下一層），是
 * 需要在bootstrap組裝的獨立子層實例——這次起，facade改為呼叫
 * execution namespace組裝出來的Execution Manager，不再直接呼叫
 * service（見src/bootstrap/application.js）。TASK1.51新增的events
 * namespace同樣是需要在bootstrap組裝的獨立子層實例（因為
 * createEventDispatcher()內部持有一份訂閱清單狀態），組裝出來的
 * dispatcher實例透過依賴注入傳給execution namespace組裝出來的
 * Execution Manager，讓生命週期狀態轉換可以額外emit事件，但
 * execution_manager.js本身完全不import events目錄底下任何檔案。
 * TASK1.52新增的history namespace跟events一樣，是需要在bootstrap
 * 組裝的獨立子層實例（因為createHistoryStore()內部持有一份歷史紀錄
 * 的Map狀態），組裝出來的store實例透過依賴注入傳給execution
 * namespace組裝出來的Execution Manager，讓生命週期狀態轉換可以額外
 * 建立/更新Execution History Record，但execution_manager.js本身
 * 完全不import history目錄底下任何檔案。TASK1.53新增的monitoring
 * namespace同樣是需要在bootstrap組裝的獨立子層實例（因為
 * createExecutionMonitor()內部持有一份透過訂閱Event Dispatcher累積
 * 的觀察紀錄Map狀態），但這次是純粹的唯讀觀察者——組裝出來的
 * Execution Monitor實例注入的是跟`intelligence.history`/
 * `intelligence.events`完全相同的historyStore/eventDispatcher
 * 實例，只讀取History Record、訂閱Execution Event，完全不修改
 * 任何狀態，也完全不需要Execution Manager提供任何新的依賴注入
 * 掛勾，execution_manager.js本身這次完全沒有被修改。
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
export * as runtime from './runtime/index.js';
export * as execution from './execution/index.js';
export * as events from './events/index.js';
export * as history from './history/index.js';
export * as monitoring from './monitoring/index.js';

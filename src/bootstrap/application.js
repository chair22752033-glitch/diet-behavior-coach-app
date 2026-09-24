/*
 * Phase 1 TASK 1.23｜Application Bootstrap（TASK1.27 起額外組裝 middleware；
 * TASK1.39 架構一致性檢查：補齊 services/middleware 物件缺少的既有匯出；
 * TASK1.40 新增 intelligence namespace，Phase 2 Intelligence Layer 的
 * extension point）
 *
 * createApplication(env)：把 Configuration Layer（TASK1.23）、DB Access
 * Layer（TASK1.12）、Domain/Application Service（TASK1.15/1.19）、Router
 * Layer（TASK1.21）、Middleware Layer（TASK1.27）、Intelligence Layer
 * （TASK1.40）組裝成一個單一物件
 * {config, db, services, router, middleware, intelligence}。
 *
 * 重要：這裡只是「組裝」，不執行任何業務邏輯。實際production路徑
 * （src/worker.js → app.router.handle()）完全不讀取 ctx.services/
 * ctx.middleware/ctx.intelligence——每個controller/route都是直接
 * import 自己需要的service/middleware模組，這幾個物件目前仍是「保留給
 * 未來需要動態注入情境使用」的Phase 2 extension point，純粹是資料，
 * 不影響任何一條既有route的行為。
 *
 * TASK1.39發現：services/middleware這兩個物件從TASK1.36
 * （dashboard_service.js）、TASK1.37（profile_service.js）、TASK1.38
 * （timeline_service.js）、以及TASK1.34（auth_security_service.js/
 * session_cleanup_service.js/session_management_service.js/
 * audit_log_service.js）新增後就沒有同步更新過，導致這裡列出的
 * services/middleware清單長期不完整——因為沒有任何地方讀取它們，這不是
 * 功能性bug，但屬於「架構一致性」問題，當時已經補齊。
 *
 * TASK1.40新增：`intelligence` namespace，組裝 src/intelligence/
 * （Insight Service / Analysis Engine / Recommendation Engine）三個
 * 元件的實例。`insightService`用`analysisEngine`/`recommendationEngine`
 * 做依賴注入組裝（呼應src/intelligence/insight_service.js的
 * createInsightService({analysisEngine, recommendationEngine})介面），
 * 三者都是每次createApplication(env)呼叫時重新建立的獨立實例，不共用
 * 狀態。目前沒有任何route/controller讀取app.intelligence，純粹是組裝
 * 好放在那裡供Phase 2使用，本次任務明確禁止建立任何AI分析流程，這裡
 * 也完全沒有串接任何AI API。
 *
 * TASK1.41新增：`intelligence.dataPreparation`，組裝
 * src/intelligence/data_preparation/ 的 createDataPreparationService()
 * 實例——負責「從既有五大Domain Service蒐集使用者資料 + 轉成穩定的
 * intelligence input格式」，一樣是每次createApplication(env)呼叫時
 * 重新建立的獨立實例。`insightService`本次完全沒有被修改成會呼叫
 * dataPreparation，兩者目前是各自獨立掛在intelligence namespace底下
 * 的extension point，沒有任何route/controller讀取它。
 *
 * TASK1.42新增：`intelligence.context`，組裝
 * src/intelligence/context/ 的 createInsightContextBuilder() 實例——
 * 負責把dataPreparation的輸出轉成通過驗證的Insight Context（見
 * src/intelligence/contracts/insight_context_contract.js）。這次
 * `insightService`真的被修改了（新增getInsightContext()），把同一個
 * `dataPreparationService`跟`insightContextBuilder`實例都注入進去
 * （createInsightService({..., dataPreparation, contextBuilder})），
 * 讓getInsightContext()可以呼叫dataPreparation.prepare() +
 * contextBuilder.buildInsightContext()組出context——但仍然完全不產生
 * 任何分析結果，getInsightContext()成功時只回傳
 * {ok:true, status:'context_ready', data:{context}}。
 * `app.intelligence.context`跟注入進insightService的是同一個實例
 * （不是各自獨立建立兩份）。目前依然沒有任何route/controller讀取
 * app.intelligence，本次任務明確禁止串接任何AI API。
 *
 * TASK1.43新增：`intelligence.analysis`，組裝
 * src/intelligence/analysis/ 的 createAnalysisRunner() 實例——負責
 * 「接收驗證過的Insight Context、跑一組deterministic分析模組、組出
 * Analysis Result」。跟dataPreparation當初一樣，`insightService`本次
 * 完全沒有被修改成會呼叫它，兩者是各自獨立掛在intelligence namespace
 * 底下的extension point，沒有任何route/controller讀取它，留給未來
 * 任務決定怎麼串接。
 *
 * TASK1.44新增：`intelligence.recommendation`，組裝
 * src/intelligence/recommendation/ 的 createRecommendationRunner()
 * 實例——負責「接收驗證過的Analysis Result、跑一組deterministic推薦
 * 模組、組出Recommendation Result」。跟analysis當初一樣，
 * `insightService`本次完全沒有被修改成會呼叫它，是各自獨立掛在
 * intelligence namespace底下的extension point，沒有任何
 * route/controller讀取它，留給未來任務決定怎麼串接。
 *
 * TASK1.45新增：`intelligence.orchestration`，組裝
 * src/intelligence/orchestration/ 的 createIntelligenceOrchestrator()
 * 實例——負責「依固定順序協調dataPreparation→context→analysis→
 * recommendation四個既有子層，組出單一Unified Intelligence Result」。
 * 注入的是跟`intelligence.dataPreparation`/`intelligence.context`/
 * `intelligence.analysis`/`intelligence.recommendation`完全相同的
 * 實例（不是各自獨立建立第二份），確保orchestrator跑出來的結果跟
 * 直接個別呼叫這幾層是一致的。`insightService`本次依然完全沒有被
 * 修改成會呼叫orchestrator，兩者是各自獨立掛在intelligence
 * namespace底下的extension point，沒有任何route/controller讀取它。
 *
 * TASK1.46新增：`intelligence.service`，組裝
 * src/intelligence/service/ 的 createIntelligenceService() 實例——
 * 負責「在未來的Application/API Layer跟Orchestrator之間建立穩定應用
 * 邊界」，對外只暴露`getIntelligence(db, request)`一個介面，隱藏底下
 * Orchestrator的協調細節。注入的是跟`intelligence.orchestration`
 * 完全相同的`intelligenceOrchestrator`實例（不是各自建立第二份）。
 * `insightService`本次依然完全沒有被修改成會呼叫這個service，兩者是
 * 各自獨立掛在intelligence namespace底下的extension point，本次任務
 * 明確禁止串接任何route/controller/worker.js。
 *
 * TASK1.47（Intelligence Execution Contract Layer）本次不需要修改
 * 這個檔案——新增的三個contract是純函式驗證工具，由
 * intelligence_service.js內部import使用，不是需要在這裡組裝的獨立
 * 子層實例。
 *
 * TASK1.48新增：`intelligence.facade`，組裝
 * src/intelligence/facade/ 的 createIntelligenceFacade() 實例——負責
 * 「在未來的Application Consumer跟Intelligence Service之間再建立一層
 * application-facing的穩定門面」，對外只暴露
 * `executeIntelligence(db, request)`一個介面，把Service回傳的
 * {status, context, analysis, recommendation, metadata}重新包裝成
 * {status, result:{context, analysis, recommendation}, metadata}。
 * 當時注入的是跟`intelligence.service`完全相同的`intelligenceService`
 * 實例（不是各自建立第二份）。本次任務完全沒有修改
 * intelligence_service.js/Orchestrator/Analysis/Recommendation，也
 * 明確禁止串接任何route/controller/worker.js。
 *
 * TASK1.50新增：`intelligence.execution`，組裝
 * src/intelligence/execution/ 的 createExecutionManager() 實例——
 * 負責「管理單次Intelligence執行的生命週期
 * （initialized→running→completed/failed），標準化Service呼叫細節
 * 跟成功/失敗結果」。注入的是跟`intelligence.service`完全相同的
 * `intelligenceService`實例（不是各自建立第二份）。**這次起，
 * `intelligence.facade`改為注入`executionManager: intelligenceExecutionManager`
 * （不再注入`service`）**——Facade不再直接呼叫Service，Facade
 * → Execution Manager → Service成為新的呼叫鏈。
 * `intelligence_service.js`/Orchestrator/Analysis/Recommendation/
 * Runtime Context/Data Preparation六者的原始碼依然完全沒有被修改，
 * 本次任務明確禁止串接任何route/controller/worker.js。
 *
 * TASK1.51新增：`intelligence.events`，組裝
 * src/intelligence/events/ 的 createEventDispatcher() 實例——純記憶體
 * 的事件訂閱/發送機制，不做任何持久化。注入進
 * `intelligence.execution`（`createExecutionManager({service,
 * eventDispatcher})`）——Execution Manager在每次生命週期狀態轉換時
 * 額外emit對應的Execution Event（見
 * src/intelligence/execution/execution_manager.js的Lifecycle
 * Mapping），這是純粹新增的旁路行為，`intelligence.execution`原本
 * 對外的執行邏輯/回傳格式完全沒有改變。
 * `intelligence_service.js`/Orchestrator/Analysis/Recommendation/
 * Runtime Context/Execution Contract六者的原始碼依然完全沒有被修改，
 * 本次任務明確禁止串接任何route/controller/worker.js，也明確禁止
 * 新增任何資料庫logging。
 *
 * TASK1.52新增：`intelligence.history`，組裝
 * src/intelligence/history/ 的 createHistoryStore() 實例——純記憶體
 * 的Execution History紀錄集合，不做任何持久化。注入進
 * `intelligence.execution`（`createExecutionManager({service,
 * eventDispatcher, historyStore})`）——Execution Manager在每次
 * 生命週期狀態轉換時額外建立/更新對應的Execution History Record
 * （見src/intelligence/execution/execution_manager.js的Lifecycle
 * Mapping），這是純粹新增的旁路行為，`intelligence.execution`原本
 * 對外的執行邏輯/回傳格式完全沒有改變。
 * `intelligence_service.js`/Orchestrator/Analysis/Recommendation/
 * Facade/Runtime Context/Contracts七者的原始碼依然完全沒有被修改，
 * 本次任務明確禁止串接任何route/controller/worker.js，也明確禁止
 * 新增任何D1/SQL/migration。
 *
 * TASK1.53新增：`intelligence.monitoring`，組裝
 * src/intelligence/monitoring/ 的 createExecutionMonitor() 實例——
 * 純讀取、純觀察的監控邊界，注入的是跟`intelligence.history`/
 * `intelligence.events`完全相同的`intelligenceHistoryStore`/
 * `intelligenceEventDispatcher`實例（不是各自建立第二份）。這次是
 * 純粹的依賴注入組裝，**不影響**`intelligence.execution`的任何
 * 行為——`execution_manager.js`本身這次完全沒有被修改，Monitor
 * 完全透過既有的historyStore/eventDispatcher做唯讀觀察。
 * `intelligence_service.js`/Orchestrator/Analysis/Recommendation/
 * Facade/Runtime Context/Contracts/Execution Manager八者的原始碼
 * 依然完全沒有被修改，本次任務明確禁止串接任何route/controller/
 * worker.js，也明確禁止新增任何D1/SQL/migration/UI。
 *
 * TASK1.54新增：`intelligence.metrics`，組裝
 * src/intelligence/metrics/ 的 createExecutionMetrics() 實例——
 * 獨立的統計/量測邊界（跨執行的次數/平均耗時/成功率），注入的是跟
 * `intelligence.history`/`intelligence.events`完全相同的
 * `intelligenceHistoryStore`/`intelligenceEventDispatcher`實例（不
 * 是各自建立第二份）。這次同樣是純粹的依賴注入組裝，**不影響**
 * `intelligence.execution`/`intelligence.monitoring`的任何行為——
 * `execution_manager.js`本身這次同樣完全沒有被修改，Metrics完全
 * 透過既有的historyStore/eventDispatcher做唯讀觀察與統計累積。
 * `intelligence_service.js`/Orchestrator/Analysis/Recommendation/
 * Facade/Runtime Context/Contracts/Execution Manager八者的原始碼
 * 依然完全沒有被修改，本次任務明確禁止串接任何route/controller/
 * worker.js，也明確禁止新增任何D1/SQL/migration/UI。
 *
 * TASK1.55新增：`intelligence.governance`，組裝
 * src/intelligence/governance/ 的 createGovernanceService() 實例——
 * 完全無狀態的治理邊界，只回答「這次執行的輸入形狀允不允許執行」
 * （純結構檢查，不讀database、不查user status、不解析session、
 * 不包含business decision）。這次是規格明確要求的「純新增
 * namespace，不改變既有execution behavior」——`intelligence.facade`/
 * `intelligence.execution`完全沒有被重新注入任何新依賴，
 * `intelligence_facade.js`/`execution_manager.js`本身也完全沒有
 * 被修改，Governance Service目前是獨立掛在intelligence namespace
 * 底下、留給Phase 3未來透過依賴注入接上的extension point。
 * `intelligence_service.js`/Orchestrator/Analysis/Recommendation/
 * Facade/Runtime Context/Contracts/Execution Manager八者的原始碼
 * 依然完全沒有被修改，本次任務明確禁止串接任何route/controller/
 * worker.js，也明確禁止啟用任何AI API。
 *
 * Phase 3 TASK1.60新增：`intelligence.application`，組裝
 * src/intelligence/application/ 的 createApplicationService()
 * 實例——Phase 3第一個真正的實作層，是TASK1.59規劃裡「User
 * Application只透過Facade使用Intelligence」這條規則的具體落地。
 * 注入的是跟`intelligence.facade`完全相同的`intelligenceFacade`
 * 實例（不是各自建立第二份）。Application Service完全不能直接
 * 呼叫Execution Manager/History Store/Metrics Store/Event
 * Dispatcher/Database/AI Provider（規格明確禁止的捷徑），唯一
 * 認識的下一層是Facade。這是純粹的依賴注入組裝，`intelligence.
 * facade`/`intelligence.execution`/其餘既有欄位完全沒有被重新
 * 注入任何新依賴，`intelligence_facade.js`/`execution_manager.js`
 * 本身也完全沒有被修改。本次任務明確禁止新增任何API route，
 * `intelligence.application`目前是純粹的Phase 3 extension
 * point，還沒有任何真實的User Application呼叫它。
 *
 * Phase 3 TASK1.61新增：`intelligence.useCases`，組裝
 * src/intelligence/application/use_cases/ 的
 * createInsightUseCase() 實例——建立在Application Service之上的
 * Use Case Layer，定義未來User Application要如何使用Intelligence
 * 能力（目前是「取得使用者的Insight」這一個具名Application
 * Scenario）。注入的是跟`intelligence.application`完全相同的
 * `intelligenceApplicationService`實例（不是各自建立第二份）。
 * Use Case Layer完全不能直接呼叫Facade/Execution Manager/History
 * Store/Metrics Store/Event Dispatcher/Database/AI Provider（規格
 * 明確禁止的捷徑），唯一認識的下一層是Application Service。這是
 * 純粹的依賴注入組裝，`intelligence.application`/
 * `intelligence.facade`/其餘既有欄位完全沒有被重新注入任何新依賴，
 * `application_service.js`/`intelligence_facade.js`/
 * `execution_manager.js`本身也完全沒有被修改。本次任務明確禁止
 * 新增任何API route，`intelligence.useCases`目前是純粹的Phase 3
 * extension point，還沒有任何真實的User Application呼叫它。
 *
 * Phase 3 TASK1.62新增：`intelligence.capabilities`，組裝
 * src/intelligence/application/capabilities/ 的
 * createInsightCapability() 實例——建立在Use Case Layer之上的
 * Capability Layer，讓未來不同的Intelligence Application能力
 * 可以被清楚分類與管理（目前是「Insight」這一個具名能力）。注入
 * 的是跟`intelligence.useCases`完全相同的
 * `intelligenceInsightUseCase`實例（不是各自建立第二份）。
 * Capability Layer完全不能直接呼叫Application Service/Facade/
 * Execution Manager/History Store/Metrics Store/Event
 * Dispatcher/Database/AI Provider（規格明確禁止的捷徑），唯一
 * 認識的下一層是Use Case Layer。這是純粹的依賴注入組裝，
 * `intelligence.useCases`/`intelligence.application`/
 * `intelligence.facade`/其餘既有欄位完全沒有被重新注入任何新
 * 依賴，`insight_use_case.js`/`application_service.js`/
 * `intelligence_facade.js`/`execution_manager.js`本身也完全沒有
 * 被修改。本次任務明確禁止新增任何API route，
 * `intelligence.capabilities`目前是純粹的Phase 3 extension
 * point，還沒有任何真實的User Application呼叫它。
 *
 * TASK1.63（Contract Layer）本次**不需要修改**這個檔案——
 * `src/intelligence/application/contracts/`是純函式驗證工具，
 * 不是需要在這裡組裝的獨立子層實例。
 *
 * Phase 3 TASK1.64新增：`intelligence.workflow`，組裝
 * src/intelligence/application/workflows/ 的
 * createApplicationWorkflow({capability, contractValidator})
 * 實例——建立在Capability之上、第一個實際採用TASK1.63 Contract
 * Layer的協調層。注入的`capability`是跟`intelligence.capabilities`
 * 完全相同的`intelligenceInsightCapability`實例（不是各自建立
 * 第二份），`contractValidator`是新建立的
 * `intelligenceApplicationNamespace.contracts.createContractValidator()`
 * 實例（Contract Layer本身是無狀態純函式工具，這裡才第一次真正
 * 被組裝使用）。Workflow Layer完全不能直接呼叫Use Case/Application
 * Service/Facade/Execution Manager/History Store/Metrics Store/
 * Event Dispatcher/Database/AI Provider（規格明確禁止的捷徑），
 * 唯一認識的下一層是Capability Layer。這是純粹的依賴注入組裝，
 * `intelligence.capabilities`/`intelligence.useCases`/
 * `intelligence.application`/`intelligence.facade`/其餘既有欄位
 * 完全沒有被重新注入任何新依賴，`insight_capability.js`/
 * `insight_use_case.js`/`application_service.js`/
 * `intelligence_facade.js`/`execution_manager.js`本身也完全沒有
 * 被修改。本次任務明確禁止新增任何API route，
 * `intelligence.workflow`目前是純粹的Phase 3 extension point，
 * 還沒有任何真實的User Application呼叫它。
 *
 * Phase 3 TASK1.65新增：`intelligence.features`，組裝
 * src/intelligence/application/features/ 的
 * createInsightFeature({workflow}) 實例——Phase 3第一個完整的
 * Feature Entry，驗證TASK1.60~1.64建立的Application Service/Use
 * Case/Capability/Contract/Workflow五層可以承載一個從頭到尾的
 * Intelligence Feature Flow。注入的`workflow`是跟
 * `intelligence.workflow`完全相同的`intelligenceApplicationWorkflow`
 * 實例（不是各自建立第二份）。Feature Layer完全不能直接呼叫
 * Capability/Use Case/Application Service/Facade/Execution
 * Manager/History Store/Metrics Store/Event Dispatcher/Database/
 * AI Provider（規格明確禁止的捷徑），唯一認識的下一層是Workflow
 * Layer。這是純粹的依賴注入組裝，`intelligence.workflow`/
 * `intelligence.capabilities`/`intelligence.useCases`/
 * `intelligence.application`/`intelligence.facade`/其餘既有欄位
 * 完全沒有被重新注入任何新依賴，`application_workflow.js`/
 * `insight_capability.js`/`insight_use_case.js`/
 * `application_service.js`/`intelligence_facade.js`/
 * `execution_manager.js`本身也完全沒有被修改。本次任務明確禁止
 * 新增任何API route，`intelligence.features`目前是純粹的Phase 3
 * extension point，還沒有任何真實的User Application呼叫它。
 *
 * Phase 3 TASK1.66新增：`intelligence.insightFeature`，組裝
 * src/intelligence/application/features/insight/ 的
 * createInsightFeatureCapability({workflow}) 實例——Phase 3第一個
 * 「正式」的domain-specific Feature Capability（跟TASK1.65通用的
 * `intelligence.features`並存、互不覆蓋）。注入的`workflow`是跟
 * `intelligence.workflow`完全相同的`intelligenceApplicationWorkflow`
 * 實例（不是各自建立第二份）。Insight Feature Capability完全不能
 * 直接呼叫Capability/Use Case/Application Service/Facade/
 * Execution Manager/History Store/Metrics Store/Event Dispatcher/
 * Database/AI Provider（規格明確禁止的捷徑），唯一認識的下一層是
 * Workflow Layer。這是純粹的依賴注入組裝，`intelligence.workflow`/
 * `intelligence.features`/`intelligence.capabilities`/
 * `intelligence.useCases`/`intelligence.application`/
 * `intelligence.facade`/其餘既有欄位完全沒有被重新注入任何新
 * 依賴，`application_workflow.js`/`insight_capability.js`（位於
 * capabilities/）/`insight_use_case.js`/`application_service.js`/
 * `intelligence_facade.js`/`execution_manager.js`/TASK1.65
 * `features/insight_feature.js`本身也完全沒有被修改。本次任務
 * 明確禁止新增任何API route，`intelligence.insightFeature`目前是
 * 純粹的Phase 3 extension point，還沒有任何真實的User Application
 * 呼叫它。
 *
 * Phase 3 TASK1.69新增：`intelligence.insightExecutionFlow`，組裝
 * src/intelligence/application/features/insight/execution/ 的
 * createInsightExecutionFlow({workflow, contextMapper, outputMapper})
 * 實例——跟TASK1.67（Insight Context Mapper）/TASK1.68（Insight
 * Output Mapper）維持「建立但不改變既有execution behavior」的被動
 * extension point不同，這是Phase 3第一次把這兩個純函式工具真正接上
 * 真實呼叫鏈：注入的`workflow`是跟`intelligence.workflow`完全相同的
 * `intelligenceApplicationWorkflow`實例（不是各自建立第二份），
 * `contextMapper`/`outputMapper`則是分別呼叫
 * `intelligenceApplicationNamespace.features.insight.context.
 * createInsightContextMapper()`/
 * `intelligenceApplicationNamespace.features.insight.output.
 * createInsightOutputMapper()`新建立的、只給這條Execution Flow使用
 * 的獨立實例（`intelligenceInsightContextMapperForFlow`/
 * `intelligenceInsightOutputMapperForFlow`，不影響TASK1.67/1.68本身
 * 的測試邊界）。Insight Execution Flow完全不能直接呼叫Capability/
 * Use Case/Application Service/Facade/Execution Manager/History
 * Store/Metrics Store/Event Dispatcher/Database/AI Provider（規格
 * 明確禁止的捷徑），唯一認識的下一層是Workflow Layer。這是純粹的
 * 依賴注入組裝，`intelligence.workflow`/`intelligence.features`/
 * `intelligence.insightFeature`/`intelligence.capabilities`/
 * `intelligence.useCases`/`intelligence.application`/
 * `intelligence.facade`/其餘既有欄位完全沒有被重新注入任何新依賴，
 * `application_workflow.js`/`insight_capability.js`（位於
 * capabilities/與features/insight/兩處）/`insight_use_case.js`/
 * `application_service.js`/`intelligence_facade.js`/
 * `execution_manager.js`/`insight_context_mapper.js`/
 * `insight_output_mapper.js`本身也完全沒有被修改。本次任務明確
 * 禁止新增任何API route，`intelligence.insightExecutionFlow`目前是
 * 純粹的Phase 3 extension point，還沒有任何真實的User Application
 * 呼叫它。
 */
import { getEnvConfig } from '../config/env.js';
import { getAuthConfig } from '../config/auth_config.js';
import { getAppConfig } from '../config/app_config.js';
import { createDb } from '../db/index.js';
import { createAppRouter } from '../routes/index.js';
import {
  createMiddlewarePipeline,
  requireAuth,
  validateBody,
  validateContract,
  createContractValidationMiddleware,
} from '../middleware/index.js';
import * as authApplicationService from '../services/auth_application_service.js';
import * as authSecurityService from '../services/auth_security_service.js';
import * as userService from '../services/user_service.js';
import * as explorationService from '../services/exploration_service.js';
import * as foodService from '../services/food_service.js';
import * as emotionService from '../services/emotion_service.js';
import * as behaviorService from '../services/behavior_service.js';
import * as reportService from '../services/report_service.js';
import * as dashboardService from '../services/dashboard_service.js';
import * as profileService from '../services/profile_service.js';
import * as timelineService from '../services/timeline_service.js';
import * as sessionCleanupService from '../services/session_cleanup_service.js';
import * as sessionManagementService from '../services/session_management_service.js';
import * as auditLogService from '../services/audit_log_service.js';
import { createInsightService, createAnalysisEngine, createRecommendationEngine, dataPreparation, context as insightContext, analysis, recommendation, orchestration, service as intelligenceServiceNamespace, facade as intelligenceFacadeNamespace, execution as intelligenceExecutionNamespace, events as intelligenceEventsNamespace, history as intelligenceHistoryNamespace, monitoring as intelligenceMonitoringNamespace, metrics as intelligenceMetricsNamespace, governance as intelligenceGovernanceNamespace, application as intelligenceApplicationNamespace } from '../intelligence/index.js';

/**
 * @param {object} env - Worker 的 env 物件
 * @returns {{config:object, db:object, services:object, router:object, middleware:object, intelligence:object}}
 */
export function createApplication(env) {
  if (!env) {
    throw new Error('createApplication(env)：env 不可為空');
  }

  const config = {
    env: getEnvConfig(env),
    auth: getAuthConfig(env),
    app: getAppConfig(env),
  };

  const db = createDb(env);

  const services = {
    authApplicationService,
    authSecurityService,
    userService,
    explorationService,
    foodService,
    emotionService,
    behaviorService,
    reportService,
    dashboardService,
    profileService,
    timelineService,
    sessionCleanupService,
    sessionManagementService,
    auditLogService,
  };

  const router = createAppRouter();

  // TASK1.27：把 middleware pipeline 的組裝入口跟現成的
  // requireAuth()/validateBody()/validateContract()/
  // createContractValidationMiddleware() 一併暴露出來，供未來需要動態
  // 注入這些middleware的情境使用；目前所有實際route都是直接從
  // src/middleware/index.js import，不讀取這裡，這個物件不影響任何
  // 既有route的行為。
  const middleware = {
    createMiddlewarePipeline,
    requireAuth,
    validateBody,
    validateContract,
    createContractValidationMiddleware,
  };

  // TASK1.40：Phase 2 Intelligence Layer 的 extension point。
  // analysisEngine/recommendationEngine 目前都只是回傳
  // {status:'not_implemented', ...} 的inert占位物件（見
  // src/intelligence/analysis_engine.js/recommendation_engine.js），
  // insightService 用依賴注入的方式組裝它們，getUserInsight() 一律回傳
  // 固定的 {ok:true, status:'not_ready', data:null}，不產生任何實際
  // 分析/推薦結果，也不呼叫任何AI API。
  const analysisEngine = createAnalysisEngine();
  const recommendationEngine = createRecommendationEngine();
  const dataPreparationService = dataPreparation.createDataPreparationService();
  const insightContextBuilder = insightContext.createInsightContextBuilder();
  const insightService = createInsightService({
    analysisEngine,
    recommendationEngine,
    dataPreparation: dataPreparationService,
    contextBuilder: insightContextBuilder,
  });
  const analysisRunner = analysis.createAnalysisRunner();
  const recommendationRunner = recommendation.createRecommendationRunner();
  const intelligenceOrchestrator = orchestration.createIntelligenceOrchestrator({
    dataPreparation: dataPreparationService,
    contextBuilder: insightContextBuilder,
    analysisRunner,
    recommendationRunner,
  });
  const intelligenceService = intelligenceServiceNamespace.createIntelligenceService({
    orchestrator: intelligenceOrchestrator,
  });
  const intelligenceEventDispatcher = intelligenceEventsNamespace.createEventDispatcher();
  const intelligenceHistoryStore = intelligenceHistoryNamespace.createHistoryStore();
  const intelligenceExecutionManager = intelligenceExecutionNamespace.createExecutionManager({
    service: intelligenceService,
    eventDispatcher: intelligenceEventDispatcher,
    historyStore: intelligenceHistoryStore,
  });
  const intelligenceFacade = intelligenceFacadeNamespace.createIntelligenceFacade({
    executionManager: intelligenceExecutionManager,
  });
  const intelligenceExecutionMonitor = intelligenceMonitoringNamespace.createExecutionMonitor({
    historyStore: intelligenceHistoryStore,
    eventDispatcher: intelligenceEventDispatcher,
  });
  const intelligenceExecutionMetrics = intelligenceMetricsNamespace.createExecutionMetrics({
    historyStore: intelligenceHistoryStore,
    eventDispatcher: intelligenceEventDispatcher,
  });
  const intelligenceGovernanceService = intelligenceGovernanceNamespace.createGovernanceService();
  const intelligenceApplicationService = intelligenceApplicationNamespace.createApplicationService({
    facade: intelligenceFacade,
  });
  const intelligenceInsightUseCase = intelligenceApplicationNamespace.useCases.createInsightUseCase({
    applicationService: intelligenceApplicationService,
  });
  const intelligenceInsightCapability = intelligenceApplicationNamespace.capabilities.createInsightCapability({
    useCase: intelligenceInsightUseCase,
  });
  const intelligenceContractValidator = intelligenceApplicationNamespace.contracts.createContractValidator();
  const intelligenceApplicationWorkflow = intelligenceApplicationNamespace.workflows.createApplicationWorkflow({
    capability: intelligenceInsightCapability,
    contractValidator: intelligenceContractValidator,
  });
  const intelligenceInsightFeature = intelligenceApplicationNamespace.features.createInsightFeature({
    workflow: intelligenceApplicationWorkflow,
  });
  const intelligenceInsightFeatureCapability = intelligenceApplicationNamespace.features.insight.createInsightFeatureCapability({
    workflow: intelligenceApplicationWorkflow,
  });
  const intelligenceInsightContextMapperForFlow = intelligenceApplicationNamespace.features.insight.context.createInsightContextMapper();
  const intelligenceInsightOutputMapperForFlow = intelligenceApplicationNamespace.features.insight.output.createInsightOutputMapper();
  const intelligenceInsightExecutionFlow = intelligenceApplicationNamespace.features.insight.execution.createInsightExecutionFlow({
    workflow: intelligenceApplicationWorkflow,
    contextMapper: intelligenceInsightContextMapperForFlow,
    outputMapper: intelligenceInsightOutputMapperForFlow,
  });
  const intelligence = {
    insightService,
    analysisEngine,
    recommendationEngine,
    dataPreparation: dataPreparationService,
    context: insightContextBuilder,
    analysis: analysisRunner,
    recommendation: recommendationRunner,
    orchestration: intelligenceOrchestrator,
    service: intelligenceService,
    execution: intelligenceExecutionManager,
    events: intelligenceEventDispatcher,
    history: intelligenceHistoryStore,
    monitoring: intelligenceExecutionMonitor,
    metrics: intelligenceExecutionMetrics,
    governance: intelligenceGovernanceService,
    application: intelligenceApplicationService,
    useCases: intelligenceInsightUseCase,
    capabilities: intelligenceInsightCapability,
    workflow: intelligenceApplicationWorkflow,
    features: intelligenceInsightFeature,
    insightFeature: intelligenceInsightFeatureCapability,
    insightExecutionFlow: intelligenceInsightExecutionFlow,
    facade: intelligenceFacade,
  };

  return { config, db, services, router, middleware, intelligence };
}

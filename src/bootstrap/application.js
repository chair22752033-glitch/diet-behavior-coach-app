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
import { createInsightService, createAnalysisEngine, createRecommendationEngine, dataPreparation } from '../intelligence/index.js';

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
  const insightService = createInsightService({ analysisEngine, recommendationEngine });
  const dataPreparationService = dataPreparation.createDataPreparationService();
  const intelligence = { insightService, analysisEngine, recommendationEngine, dataPreparation: dataPreparationService };

  return { config, db, services, router, middleware, intelligence };
}

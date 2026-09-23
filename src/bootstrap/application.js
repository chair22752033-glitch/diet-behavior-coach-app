/*
 * Phase 1 TASK 1.23｜Application Bootstrap（TASK1.27 起額外組裝 middleware；
 * TASK1.39 架構一致性檢查：補齊 services/middleware 物件缺少的既有匯出）
 *
 * createApplication(env)：把 Configuration Layer（TASK1.23）、DB Access
 * Layer（TASK1.12）、Domain/Application Service（TASK1.15/1.19）、Router
 * Layer（TASK1.21）、Middleware Layer（TASK1.27）組裝成一個單一物件
 * {config, db, services, router, middleware}。
 *
 * 重要：這裡只是「組裝」，不執行任何業務邏輯。實際production路徑
 * （src/worker.js → app.router.handle()）完全不讀取 ctx.services/
 * ctx.middleware——每個controller/route都是直接 import 自己需要的
 * service/middleware模組，這兩個物件目前仍是「保留給未來需要動態注入
 * 情境使用」的Phase 2 extension point，純粹是資料，不影響任何一條既有
 * route的行為。
 *
 * TASK1.39發現：這兩個物件從TASK1.36（dashboard_service.js）、
 * TASK1.37（profile_service.js）、TASK1.38（timeline_service.js）、以及
 * TASK1.34（auth_security_service.js/session_cleanup_service.js/
 * session_management_service.js/audit_log_service.js）新增後就沒有
 * 同步更新過，導致這裡列出的services/middleware清單長期不完整——因為
 * 沒有任何地方讀取它們，這不是功能性bug，但屬於「架構一致性」問題，
 * 這裡補齊，純粹新增物件屬性，不修改任何既有行為。
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

/**
 * @param {object} env - Worker 的 env 物件
 * @returns {{config:object, db:object, services:object, router:object, middleware:object}}
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

  return { config, db, services, router, middleware };
}

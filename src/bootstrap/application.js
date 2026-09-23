/*
 * Phase 1 TASK 1.23｜Application Bootstrap（TASK1.27 起額外組裝 middleware）
 *
 * createApplication(env)：把 Configuration Layer（TASK1.23）、DB Access
 * Layer（TASK1.12）、Domain/Application Service（TASK1.15/1.19）、Router
 * Layer（TASK1.21）、Middleware Layer（TASK1.27）組裝成一個單一物件
 * {config, db, services, router, middleware}。
 *
 * 重要：這裡只是「組裝」，不執行任何業務邏輯，也不建立任何真實登入/
 * session/Legacy Import。禁止 `export default` 一個 worker，本次也
 * 沒有任何地方呼叫 createApplication()，src/worker.js 完全沒有引用
 * 這個目錄。
 */
import { getEnvConfig } from '../config/env.js';
import { getAuthConfig } from '../config/auth_config.js';
import { getAppConfig } from '../config/app_config.js';
import { createDb } from '../db/index.js';
import { createAppRouter } from '../routes/index.js';
import { createMiddlewarePipeline, requireAuth, validateBody } from '../middleware/index.js';
import * as authApplicationService from '../services/auth_application_service.js';
import * as userService from '../services/user_service.js';
import * as explorationService from '../services/exploration_service.js';
import * as foodService from '../services/food_service.js';
import * as emotionService from '../services/emotion_service.js';
import * as behaviorService from '../services/behavior_service.js';
import * as reportService from '../services/report_service.js';

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
    userService,
    explorationService,
    foodService,
    emotionService,
    behaviorService,
    reportService,
  };

  const router = createAppRouter();

  // TASK1.27：把 middleware pipeline 的組裝入口跟現成的
  // requireAuth()/validateBody() 一併暴露出來，供未來需要登入/權限/
  // 資料驗證的路由使用；本次沒有任何 route 實際套用它們。
  const middleware = {
    createMiddlewarePipeline,
    requireAuth,
    validateBody,
  };

  return { config, db, services, router, middleware };
}

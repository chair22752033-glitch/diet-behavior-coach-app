/*
 * Phase 1 TASK 1.23｜Application Bootstrap
 *
 * createApplication(env)：把 Configuration Layer（TASK1.23）、DB Access
 * Layer（TASK1.12）、Domain/Application Service（TASK1.15/1.19）、Router
 * Layer（TASK1.21）組裝成一個單一物件 {config, db, services, router}。
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
import * as authApplicationService from '../services/auth_application_service.js';
import * as userService from '../services/user_service.js';
import * as explorationService from '../services/exploration_service.js';
import * as foodService from '../services/food_service.js';
import * as emotionService from '../services/emotion_service.js';
import * as behaviorService from '../services/behavior_service.js';
import * as reportService from '../services/report_service.js';

/**
 * @param {object} env - Worker 的 env 物件
 * @returns {{config:object, db:object, services:object, router:object}}
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

  return { config, db, services, router };
}

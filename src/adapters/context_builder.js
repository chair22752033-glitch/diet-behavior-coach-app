/*
 * Phase 1 TASK 1.22｜Request Context Builder
 *
 * 負責把「一次請求需要用到的東西」組成一個單一物件：req（原始請求）、
 * env（Worker binding）、db（TASK1.12 createDb(env) 的輸出）、services
 * （集中注入 TASK1.19/1.15 的各個 service module）。
 *
 * 刻意只做「組裝」，不執行任何業務邏輯——不呼叫任何 service 函式、
 * 不讀寫 D1/KV、不驗證 session、不解析 request body。這些全部留給
 * Router（TASK1.21）→ Controller（TASK1.20）→ Service 那條鏈路。
 */
import { createDb } from '../db/index.js';
import * as authApplicationService from '../services/auth_application_service.js';
import * as userService from '../services/user_service.js';
import * as explorationService from '../services/exploration_service.js';
import * as foodService from '../services/food_service.js';
import * as emotionService from '../services/emotion_service.js';
import * as behaviorService from '../services/behavior_service.js';
import * as reportService from '../services/report_service.js';

/**
 * @param {object} env - Worker 的 env 物件（含 DIET_COACH_DB 等 binding）
 * @param {object} request - 這次請求（未來可能是真正的 Fetch Request，或測試用的 request-like 物件）
 * @returns {{req:object, env:object, db:object, services:object}}
 */
export function createRequestContext(env, request) {
  if (!env) {
    throw new Error('createRequestContext(env, request)：env 不可為空');
  }

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

  return { req: request, env, db, services };
}

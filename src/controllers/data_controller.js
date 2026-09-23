/*
 * Phase 1 TASK 1.35｜User Data Controller
 *
 * worker.js 與 Domain Service（TASK1.15）之間的隔離層，跟 auth_controller.js
 * 同樣的設計原則：controller 只做三件事——接收輸入、呼叫對應的 domain
 * service 函式、用 src/contracts/response_contract.js 統一格式化回傳。
 *
 * 完全沒有：
 * - SQL / db.prepare() / 任何直接的 D1 操作（不 import src/db/ 底下任何
 *   檔案）——所有D1操作一律透過 src/services/*_service.js（TASK1.15）進行，
 *   符合「D1操作只能透過service」的安全要求
 * - session / cookie 邏輯本身（不 import src/auth/ 或
 *   src/identity/session_rules.js）——「目前是誰登入」完全是
 *   src/middleware/auth_middleware.js 的 requireAuth() 的責任，這裡收到
 *   的 userId 參數已經是驗證過的結果
 * - AI分析生成邏輯（report相關函式只負責存取「已經產生好的內容」）
 *
 * 安全設計（呼應TASK1.35安全要求）：
 * - 這裡每個 controller function 的簽章都是 (db, userId, payload/query)，
 *   userId 是獨立參數、由呼叫端（src/routes/data_routes.js）從
 *   ctx.user.id（requireAuth()驗證session後放進ctx的使用者資料）傳入，
 *   從來不是從 payload/query 裡讀取——即使payload/query裡混入一個
 *   user_id欄位，這裡也完全不會讀取它，更不會用它覆蓋掉userId參數。
 * - 沒有userId（代表沒有通過requireAuth()，理論上不會發生，因為route層
 *   一律先掛requireAuth()）時，一律安全回傳401，不會呼叫任何service。
 */
import {
  createExplorationRecord,
  getUserExplorations,
} from '../services/exploration_service.js';
import {
  recordFoodEvent,
  listFoodHistory,
} from '../services/food_service.js';
import {
  createEmotionRecord,
  listEmotionHistory,
} from '../services/emotion_service.js';
import {
  createBehaviorPattern,
  getBehaviorPatterns,
} from '../services/behavior_service.js';
import {
  saveReport,
  getReports,
} from '../services/report_service.js';
import { success, failure } from '../contracts/response_contract.js';

// 使用者狀態層的拒絕理由（requireActiveUser()內部canLogIn()回傳的reason）
// 一律視為401（未授權使用），真正的db層錯誤（result.error）才視為500——
// 這個對照表跟其他controller（例如auth_controller.js）的既有慣例一致。
const USER_CHECK_REASONS = new Set(['user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown']);

function failureFromServiceResult(result, fallbackReason) {
  if (result.reason && USER_CHECK_REASONS.has(result.reason)) {
    return failure(result.reason, 401);
  }
  return failure(result.error || result.reason || fallbackReason, 500);
}

/**
 * query string的limit參數（字串）安全轉成正整數，格式不對時回傳
 * undefined，讓service套用它自己原本的預設值，不會因為一個不合法的
 * limit值就讓整個查詢失敗。
 */
function parseLimit(rawLimit) {
  if (rawLimit === undefined || rawLimit === null || rawLimit === '') return undefined;
  const n = Number(rawLimit);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

// ---------------------------------------------------------------------------
// 1. Exploration
// ---------------------------------------------------------------------------

/** 對應 POST /api/explorations */
export async function createExplorationController(db, userId, payload) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    payload = payload && typeof payload === 'object' ? payload : {};
    const result = await createExplorationRecord(db, userId, payload);
    if (!result.ok) return failureFromServiceResult(result, 'create_failed');
    return success({ id: result.id });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

/** 對應 GET /api/explorations */
export async function listExplorationsController(db, userId, query) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    const limit = parseLimit(query && query.limit);
    const result = await getUserExplorations(db, userId, limit);
    if (!result.ok) return failureFromServiceResult(result, 'query_failed');
    return success({ results: result.results });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

// ---------------------------------------------------------------------------
// 2. Food
// ---------------------------------------------------------------------------

/** 對應 POST /api/food-events */
export async function createFoodEventController(db, userId, payload) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    payload = payload && typeof payload === 'object' ? payload : {};
    const result = await recordFoodEvent(db, userId, payload);
    if (!result.ok) return failureFromServiceResult(result, 'create_failed');
    return success({ id: result.id });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

/** 對應 GET /api/food-events */
export async function listFoodEventsController(db, userId, query) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    const limit = parseLimit(query && query.limit);
    const result = await listFoodHistory(db, userId, limit);
    if (!result.ok) return failureFromServiceResult(result, 'query_failed');
    return success({ results: result.results });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

// ---------------------------------------------------------------------------
// 3. Emotion
// ---------------------------------------------------------------------------

/** 對應 POST /api/emotions */
export async function createEmotionController(db, userId, payload) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    payload = payload && typeof payload === 'object' ? payload : {};
    const result = await createEmotionRecord(db, userId, payload);
    if (!result.ok) return failureFromServiceResult(result, 'create_failed');
    return success({ id: result.id });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

/** 對應 GET /api/emotions */
export async function listEmotionsController(db, userId, query) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    const limit = parseLimit(query && query.limit);
    const result = await listEmotionHistory(db, userId, limit);
    if (!result.ok) return failureFromServiceResult(result, 'query_failed');
    return success({ results: result.results });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

// ---------------------------------------------------------------------------
// 4. Behavior
// ---------------------------------------------------------------------------

/** 對應 POST /api/behaviors */
export async function createBehaviorController(db, userId, payload) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    payload = payload && typeof payload === 'object' ? payload : {};
    const result = await createBehaviorPattern(db, userId, payload);
    if (!result.ok) return failureFromServiceResult(result, 'create_failed');
    return success({ id: result.id });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

/** 對應 GET /api/behaviors（選填 query.patternType 篩選） */
export async function listBehaviorsController(db, userId, query) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    query = query || {};
    const limit = parseLimit(query.limit);
    const result = await getBehaviorPatterns(db, userId, { patternType: query.patternType || undefined, limit });
    if (!result.ok) return failureFromServiceResult(result, 'query_failed');
    return success({ results: result.results });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

// ---------------------------------------------------------------------------
// 5. Report（不串接AI，只存取「已經產生好的報告內容」，見data_contract.js說明）
// ---------------------------------------------------------------------------

/** 對應 POST /api/reports */
export async function createReportController(db, userId, payload) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    payload = payload && typeof payload === 'object' ? payload : {};
    const result = await saveReport(db, userId, payload);
    if (!result.ok) return failureFromServiceResult(result, 'create_failed');
    return success({ id: result.id });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

/** 對應 GET /api/reports */
export async function listReportsController(db, userId, query) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    const limit = parseLimit(query && query.limit);
    const result = await getReports(db, userId, limit);
    if (!result.ok) return failureFromServiceResult(result, 'query_failed');
    return success({ results: result.results });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

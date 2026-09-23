/*
 * Phase 1 TASK 1.37｜Profile Controller
 *
 * worker.js 與 Profile Service（TASK1.37）之間的隔離層，跟
 * src/controllers/data_controller.js（TASK1.35）/
 * src/controllers/dashboard_controller.js（TASK1.36）同樣的設計原則：
 * 接收輸入、呼叫service、用 src/contracts/response_contract.js 統一
 * 格式化回傳。完全沒有 SQL/db.prepare()/D1操作（不 import src/db/ 底下
 * 任何檔案）、沒有session/cookie邏輯本身（不處理身份驗證，那是
 * requireAuth() middleware的責任）。
 *
 * 安全設計：
 * - userId是獨立參數，由呼叫端（src/routes/profile_routes.js）從
 *   ctx.user.id（requireAuth()驗證session後放進ctx的使用者資料）傳入，
 *   從來不是從payload裡讀取——即使payload裡混入一個user_id欄位，這裡
 *   也完全不會讀取它。沒有userId時一律安全回傳401，不會呼叫任何service。
 * - updateProfileController() 呼叫 updateProfile() 時，只從payload裡
 *   明確抽取 displayName 這一個欄位轉交給service——payload裡即使夾帶
 *   auth_provider/is_guest/status/id/created_at/last_login_at等
 *   identity/system欄位，這裡在轉交給service之前就已經被完全過濾掉，
 *   這是繼profile_service.js「白名單設計」之後的第二層防禦。
 */
import { getProfile, updateProfile } from '../services/profile_service.js';
import { success, failure } from '../contracts/response_contract.js';
import { USER_CHECK_REASONS } from './data_controller.js';

const UPDATE_FAILURE_STATUS = {
  invalid_display_name: 400,
  display_name_too_long: 400,
  no_fields_to_update: 400,
};

/** 對應 GET /api/profile */
export async function getProfileController(db, userId) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    const result = await getProfile(db, userId);
    if (!result.ok) {
      if (USER_CHECK_REASONS.has(result.reason)) return failure(result.reason, 401);
      return failure(result.reason || result.error || 'profile_fetch_failed', 500);
    }
    return success(result.profile);
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

/** 對應 PATCH /api/profile */
export async function updateProfileController(db, userId, payload) {
  try {
    if (!userId) return failure('not_authenticated', 401);
    payload = payload && typeof payload === 'object' ? payload : {};

    // 白名單：只抽取displayName轉交給service，其餘任何欄位（含
    // auth_provider/auth_provider_id/is_guest/status/id/created_at/
    // last_login_at）在這裡就已經被完全丟棄，不會被service看見。
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'displayName')) {
      updates.displayName = payload.displayName;
    }

    const result = await updateProfile(db, userId, updates);
    if (!result.ok) {
      if (USER_CHECK_REASONS.has(result.reason)) return failure(result.reason, 401);
      const status = UPDATE_FAILURE_STATUS[result.reason] || (result.error ? 500 : 400);
      return failure(result.reason || result.error || 'update_failed', status);
    }
    return success(result.profile);
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}

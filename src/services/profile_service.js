/*
 * Phase 1 TASK 1.37｜User Profile Service
 *
 * 「使用者管理自己的基本資料」的業務邏輯層，跟TASK1.15五大Domain
 * Service（exploration/food/emotion/behavior/report）同樣風格：不直接
 * 操作SQL，一律透過db access layer（src/db/tables/users.js）；user
 * identity（userId）由呼叫端傳入參數，這裡不重新驗證session、不解析
 * cookie（那是requireAuth() middleware的責任）——沿用既有的
 * requireActiveUser()（src/services/user_service.js，TASK1.15既有、
 * 完全沒有被修改）確認使用者存在且狀態允許使用。
 *
 * 安全設計：
 * - getProfile()只回傳「使用者可以看到的欄位」，明確排除
 *   session token/OAuth token/provider secret/其他任何內部安全欄位——
 *   users表本身根本沒有儲存這些東西（token不落地是TASK1.33已經確立的
 *   規則），這裡是額外一層「白名單欄位」的防禦，即使未來users表新增了
 *   別的欄位，這裡也不會意外多回傳出去。
 * - updateProfile()是「白名單」設計：只認得displayName這一個欄位，
 *   payload/updates裡任何其他欄位（例如auth_provider/is_guest/status/
 *   id/created_at/last_login_at）一律被忽略，不會被讀取、更不會被
 *   拿去更新——不需要額外寫「拒絕清單」，因為根本不存在讀取它們的程式碼
 *   路徑。沒有帶displayName（或格式不合法）時，整個更新視為失敗，
 *   不會做部分更新或靜默忽略成功。
 */
import { requireActiveUser } from './user_service.js';

// TASK1.37：明確定義的display_name長度限制（規格要求「長度限制需明確
// 定義」）。100字對一般使用者顯示名稱是足夠寬鬆但仍有界限的長度。
export const DISPLAY_NAME_MAX_LENGTH = 100;

function toProfileView(user) {
  return {
    id: user.id,
    displayName: user.display_name || null,
    isGuest: user.is_guest === 1 || user.is_guest === true,
    authProvider: user.auth_provider || null,
    status: user.status,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at || null,
  };
}

/**
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {string} userId
 * @returns {Promise<{ok:boolean, profile?:object, reason?:string}>}
 *   reason 可能是 requireActiveUser() 的任何一種：
 *   'user_not_found' | 'user_suspended' | 'user_deleted' | 'user_status_unknown'
 */
export async function getProfile(db, userId) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) {
    return { ok: false, reason: userCheck.reason };
  }
  return { ok: true, profile: toProfileView(userCheck.user) };
}

/**
 * @param {object} db
 * @param {string} userId
 * @param {{displayName?:*}} updates - 只認得displayName這個key，其他任何
 *   欄位（即使存在）一律不會被讀取
 * @returns {Promise<{ok:boolean, profile?:object, reason?:string, error?:string}>}
 *   reason 除了 requireActiveUser() 的幾種，還可能是
 *   'no_fields_to_update'（沒有帶displayName，或帶了不支援的欄位組合）|
 *   'invalid_display_name'（空字串/純空白/型別不是字串）|
 *   'display_name_too_long'
 */
export async function updateProfile(db, userId, updates) {
  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) {
    return { ok: false, reason: userCheck.reason };
  }

  updates = updates || {};
  if (!Object.prototype.hasOwnProperty.call(updates, 'displayName')) {
    return { ok: false, reason: 'no_fields_to_update' };
  }

  const displayName = updates.displayName;
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return { ok: false, reason: 'invalid_display_name' };
  }
  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, reason: 'display_name_too_long' };
  }

  const now = new Date().toISOString();
  const updateResult = await db.users.updateDisplayName(userId, displayName, now);
  if (!updateResult.ok) {
    return { ok: false, error: updateResult.error };
  }

  return {
    ok: true,
    profile: toProfileView(Object.assign({}, userCheck.user, { display_name: displayName, updated_at: now })),
  };
}

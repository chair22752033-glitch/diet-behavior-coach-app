/*
 * Phase 1 TASK 1.14｜Guest Lifecycle Service
 *
 * 負責「建立 Guest User」這件事的完整流程：組出訪客物件（借用 TASK1.13B 的
 * guest.js，不重複實作資料模型）+ 實際寫入 D1（借用 TASK1.12 的 db.users）。
 *
 * 重要：這裡只是 service function，不是路由。本次沒有任何地方呼叫它，
 * 也沒有任何 UI 能觸發它——它是「將來訪客第一次使用 App 時該發生什麼事」
 * 的基礎架構，本次不開放給使用者操作。
 */
import { createGuestUser } from './guest.js';

/**
 * 建立一個新的訪客身份並寫入 D1。
 *
 * @param {object} db - createDb(env) 回傳的 db 物件（見 src/db/index.js）
 * @param {object} [metadata] - 選填，{displayName, legacySyncCode, now, id}，見 guest.js 的 createGuestUser()
 * @returns {Promise<{ok:boolean, user_id?:string, user?:object, error?:string}>}
 *
 * 規則（對應 TASK1.14 要求）：
 * - id 使用現有 users 設計（沿用 guest.js 的 crypto.randomUUID()，或由 metadata.id 指定）
 * - is_guest = true
 * - auth_provider = null
 * - status = active
 */
export async function createGuestIdentity(db, metadata) {
  const guestUser = createGuestUser(metadata || {});

  const insertResult = await db.users.insert(guestUser);
  if (!insertResult.ok) {
    return { ok: false, error: insertResult.error };
  }

  return { ok: true, user_id: guestUser.id, user: guestUser };
}

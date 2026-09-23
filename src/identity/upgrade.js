/*
 * Phase 1 TASK 1.13B｜Guest → 已驗證身份 升級流程（session關聯規則的具體實作）
 * Phase 1 TASK 1.18.1｜修正：只有 active 狀態的 guest 才允許升級
 *
 * 設計選擇：「原地升級」而非「建立新帳號再搬資料」——同一個 user_id 不變，
 * 只是把 auth_provider/auth_provider_id 填上去、is_guest 改成 0。
 * 好處：使用者在訪客階段累積的所有資料（exploration_records/food_events/...，
 * 全部用 FK 指向 users.id）完全不需要搬動，天然延續。
 *
 * session關聯規則：身份升級（等於是權限/信任等級改變）時，比照資安慣例
 * 「重新產生 session、撤銷舊 session」（防止 session fixation），這裡呼叫
 * TASK1.13A 已經有的 db.sessions.revokeAllForUser()，不重新發明。
 * 注意：這個函式只負責撤銷舊session，「建立新session」由呼叫端決定何時做
 * （通常是upgrade成功後立刻呼叫 src/auth/session.js 的 createSession）。
 *
 * TASK1.18.1 修正：在確認「目前是訪客」之後，額外用 TASK1.13B 的 canLogIn()
 * 檢查該訪客的 status——這是 TASK1.18 code review 發現的缺口：原本只要
 * is_guest 成立就會放行升級，一個被停權/已刪除的訪客帳號仍可完成升級並
 * 取得新 session。檢查順序刻意放在 is_guest 判斷「之後」：先確定操作對象
 * 真的是訪客（維持 'not_guest' 這個既有、已被其他測試依賴的錯誤原因不變），
 * 再檢查這個訪客的狀態允不允許繼續操作。
 */
import { isSupportedProvider, isValidProviderPair } from './provider.js';
import { canLogIn } from './status.js';

/**
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {string} userId
 * @param {string} provider
 * @param {string} providerId
 * @param {object} [opts] {now}
 * @returns {Promise<{ok:boolean, reason?:string, error?:string}>}
 *   reason 可能是 'user_not_found' | 'not_guest' | 'user_suspended' | 'user_deleted' |
 *   'user_status_unknown' | 'invalid_provider' | 'provider_already_linked'
 */
export async function upgradeGuestToProvider(db, userId, provider, providerId, opts) {
  opts = opts || {};
  const now = (opts.now ? new Date(opts.now) : new Date()).toISOString();

  if (!isValidProviderPair(provider, providerId) || !provider || !providerId) {
    return { ok: false, reason: 'invalid_provider' };
  }
  if (!isSupportedProvider(provider)) {
    return { ok: false, reason: 'invalid_provider' };
  }

  const userResult = await db.users.getById(userId);
  if (!userResult.ok || !userResult.row) return { ok: false, reason: 'user_not_found' };
  const user = userResult.row;

  const isGuest = user.is_guest === 1 || user.is_guest === true;
  if (!isGuest || user.auth_provider) return { ok: false, reason: 'not_guest' };

  // TASK1.18.1：只有 active 的訪客才允許升級，停權/已刪除的訪客在這裡被拒絕
  const statusCheck = canLogIn(user);
  if (!statusCheck.allowed) return { ok: false, reason: statusCheck.reason };

  const existing = await db.users.getByProvider(provider, providerId);
  if (!existing.ok) return { ok: false, error: existing.error };
  if (existing.row && existing.row.id !== userId) return { ok: false, reason: 'provider_already_linked' };

  const updateResult = await db.users.upgradeToProvider(userId, provider, providerId, now);
  if (!updateResult.ok) return { ok: false, error: updateResult.error };

  // session關聯規則：身份升級後撤銷所有舊session，強制重新建立（防止session fixation）
  const revokeResult = await db.sessions.revokeAllForUser(userId, now);
  if (!revokeResult.ok) return { ok: false, error: revokeResult.error };

  return { ok: true, userId, provider, providerId };
}

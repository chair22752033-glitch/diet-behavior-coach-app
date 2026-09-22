/*
 * Phase 1 TASK 1.13B｜Guest User 模型
 *
 * 純函式：只負責「組出一個訪客使用者物件長什麼樣子」，不做任何 D1 寫入
 * （寫入是呼叫端的事，見 src/db/tables/users.js 的 insert()）。
 * 這裡刻意跟資料庫存取分開，方便單獨測試「訪客資料模型對不對」。
 */
import { USER_STATUS } from './status.js';

/**
 * 訪客使用者的定義：
 * - auth_provider / auth_provider_id 皆為 null（沒有任何外部身份）
 * - is_guest = true
 * - status = 'active'
 * - legacy_sync_code 可選填（若是由舊版 KV sync code 對應過來的訪客，見 TASK1.9 mapping文件）
 *
 * @param {object} [opts] {id, displayName, legacySyncCode, now}
 * @returns {object} 符合 users 表欄位的物件，尚未寫入資料庫
 */
export function createGuestUser(opts) {
  opts = opts || {};
  const now = (opts.now ? new Date(opts.now) : new Date()).toISOString();
  return {
    id: opts.id || crypto.randomUUID(),
    auth_provider: null,
    auth_provider_id: null,
    display_name: opts.displayName || null,
    is_guest: true,
    status: USER_STATUS.ACTIVE,
    legacy_sync_code: opts.legacySyncCode || null,
    created_at: now,
    updated_at: now,
  };
}

export function isGuestUser(user) {
  return !!user && (user.is_guest === 1 || user.is_guest === true) && !user.auth_provider;
}

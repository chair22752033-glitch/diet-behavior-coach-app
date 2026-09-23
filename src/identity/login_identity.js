/*
 * Phase 1 TASK 1.18｜Identity Resolver
 *
 * 統一處理「provider identity → user identity」的查找/建立邏輯，
 * 專門給 src/services/auth_service.js 的 loginWithProvider() 使用。
 *
 * 範圍界定（避免職責重疊）：
 * - 這裡處理的是「一個 OAuth identity 第一次或再次登入」的情境
 *   （已存在就回傳既有 user，不存在就直接以已驗證身份誕生一個新 user）
 * - 「訪客升級成已驗證身份、保留原本 user_id」是另一條路徑，由 TASK1.14
 *   已經建立並測試過的 src/identity/upgrade.js 的 upgradeGuestToProvider()
 *   負責，這裡不重複實作、也不會被 upgradeGuestLogin() 呼叫到
 * - 防止重複 user：先查一次 db.users.getByProvider()，且 D1 schema
 *   本身也有 partial unique index（TASK1.7 的 idx_users_auth_provider_id）
 *   做資料庫層級的第二道防線
 */

/**
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {{auth_provider:string, auth_provider_id:string, email?:string, display_name?:string}} identity
 *   通常是 src/identity/provider_mapping.js 的 mapGoogleProfileToIdentity() 輸出
 * @returns {Promise<{ok:boolean, user?:object, created?:boolean, error?:string, reason?:string}>}
 *   reason 可能是 'invalid_identity'
 */
export async function resolveLoginIdentity(db, identity) {
  if (!identity || !identity.auth_provider || !identity.auth_provider_id) {
    return { ok: false, reason: 'invalid_identity' };
  }

  const existing = await db.users.getByProvider(identity.auth_provider, identity.auth_provider_id);
  if (!existing.ok) return { ok: false, error: existing.error };

  if (existing.row) {
    return { ok: true, user: existing.row, created: false };
  }

  // 這個 provider identity 是第一次出現 → 直接建立一個「已驗證身份」的新使用者
  // （不是訪客，is_guest=false，從一開始就是正式會員）
  const now = new Date().toISOString();
  const newUser = {
    id: crypto.randomUUID(),
    auth_provider: identity.auth_provider,
    auth_provider_id: identity.auth_provider_id,
    display_name: identity.display_name || null,
    is_guest: false,
    status: 'active',
    legacy_sync_code: null,
    created_at: now,
    updated_at: now,
  };

  const insertResult = await db.users.insert(newUser);
  if (!insertResult.ok) return { ok: false, error: insertResult.error };

  return { ok: true, user: newUser, created: true };
}

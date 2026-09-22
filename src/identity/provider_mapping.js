/*
 * Phase 1 TASK 1.17｜Google Profile Mapping
 *
 * 純函式：把 OAuth provider（目前只有 Google）回傳的 profile 資料，轉換成
 * 系統內部使用的 identity 欄位形狀。這裡只做「格式轉換」，完全不呼叫
 * db access layer、不呼叫 domain service，也不會建立任何 users 資料列——
 * 要不要真的拿這個結果去建立/升級使用者，是呼叫端（未來 TASK1.18）的事。
 */

/**
 * @param {{id, email, name, picture}} googleProfile - src/oauth/google.js 的 getUserProfile() 回傳的 profile
 * @returns {{ok:boolean, identity?:{auth_provider:string, auth_provider_id:string, email:string|null, display_name:string|null}, error?:string}}
 */
export function mapGoogleProfileToIdentity(googleProfile) {
  if (!googleProfile || typeof googleProfile !== 'object') {
    return { ok: false, error: 'invalid_profile' };
  }
  if (!googleProfile.id) {
    return { ok: false, error: 'missing_provider_id' };
  }

  return {
    ok: true,
    identity: {
      auth_provider: 'google',
      auth_provider_id: String(googleProfile.id),
      email: googleProfile.email || null,
      display_name: googleProfile.name || null,
    },
  };
}

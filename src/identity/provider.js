/*
 * Phase 1 TASK 1.13B｜Provider 欄位設計
 *
 * 對應 users 表的 auth_provider / auth_provider_id 兩欄。目前只是「設計」——
 * 定義未來預期支援哪些 provider、以及兩個欄位之間該遵守的規則，
 * 本次沒有任何實際的 OAuth 串接（不建立 Google OAuth，見任務限制）。
 *
 * TASK1.17 更新：Google 的 OAuth Provider 基礎能力已在 src/oauth/google.js
 * 建立、profile→identity 的轉換邏輯在 src/identity/provider_mapping.js，
 * 這裡重新匯出 mapGoogleProfileToIdentity 方便呼叫端只需要 import 這一個檔案
 * 就能同時拿到「provider規則驗證」與「google mapping」兩種能力。
 * TASK1.13B 原本的規則（SUPPORTED_PROVIDERS/isSupportedProvider/
 * isValidProviderPair）與其他既有邏輯（upgradeGuestToProvider、
 * session_rules.js）完全未被修改。
 */
export { mapGoogleProfileToIdentity } from './provider_mapping.js';

// 目前規劃未來會支援的 provider 名稱。'guest' 不是這裡的成員——訪客沒有
// auth_provider（該欄位為 NULL），是否為訪客是看 users.is_guest，不是看 provider。
export const SUPPORTED_PROVIDERS = Object.freeze(['google']);

export function isSupportedProvider(provider) {
  return SUPPORTED_PROVIDERS.indexOf(provider) >= 0;
}

/**
 * 規則：auth_provider 與 auth_provider_id 必須「同時有值」或「同時為空」，
 * 不允許只有一個有值（那代表資料不完整或程式邏輯有誤）。
 * 這與 D1 schema 的 partial unique index（idx_users_auth_provider_id，
 * 只在兩者皆非NULL時生效）互相呼應。
 */
export function isValidProviderPair(provider, providerId) {
  const hasProvider = provider !== null && provider !== undefined && provider !== '';
  const hasProviderId = providerId !== null && providerId !== undefined && providerId !== '';
  return hasProvider === hasProviderId;
}

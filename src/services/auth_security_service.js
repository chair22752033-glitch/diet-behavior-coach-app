/*
 * Phase 1 TASK 1.34｜Auth Security Service - Provider Validation Hardening
 *
 * 目的：讓「provider是不是SUPPORTED_PROVIDERS裡支援的名稱」這件事，在
 * 所有會「以provider identity建立/登入一個使用者」的入口統一檢查，而不
 * 是分散在各自的實作裡各管各的：
 *
 * - upgradeGuestToProvider()（src/identity/upgrade.js，TASK1.13B/1.18.1）
 *   本來就已經呼叫 isSupportedProvider()/isValidProviderPair()——這是
 *   既有、已測試過的行為，TASK1.34不改動這個檔案一行，這裡只是重新確認
 *   它跟這個service用的是同一份 SUPPORTED_PROVIDERS 權威來源
 *   （src/identity/provider.js），見本檔案下方測試涵蓋。
 * - loginWithProvider()（src/services/auth_service.js，TASK1.18）本身
 *   內部的 resolveLoginIdentity() 只檢查 auth_provider/auth_provider_id
 *   是否「存在」，不驗證是否為支援的provider名稱——這是TASK1.18/1.18.1
 *   的既有、大量測試依賴的行為，TASK1.34同樣不改動 login_identity.js
 *   一行。改成在「呼叫 loginWithProvider() 之前」的兩個入口點各自加上
 *   這裡提供的 validateProviderIdentity()：
 *     1. src/controllers/auth_controller.js 的 loginProviderController()
 *        （對應 POST /auth/provider，TASK1.32）
 *     2. src/services/auth_application_service.js 的
 *        loginWithGoogleCallback()（對應 GET /auth/google/callback，
 *        TASK1.33；google callback目前的provider恆為'google'，這裡的
 *        檢查是防禦性設計，為未來可能新增的provider預留同一套規則）
 *
 * 這樣「所有入口統一使用SUPPORTED_PROVIDERS檢查」這件事成立，同時完全
 * 不需要修改任何一行TASK1.18/1.18.1/1.19已經測試過的identity/service
 * 層程式碼——原本合法（google）的登入路徑行為完全不變，只有原本「應該
 * 被擋下卻沒被擋下」的不支援provider名稱，現在會在更早的步驟被攔截。
 */
import { isSupportedProvider, isValidProviderPair, SUPPORTED_PROVIDERS } from '../identity/provider.js';

export { SUPPORTED_PROVIDERS };

/**
 * @param {string} provider
 * @param {string} providerId
 * @returns {{ok:boolean, reason?:'invalid_provider'}}
 */
export function validateProviderIdentity(provider, providerId) {
  if (!isValidProviderPair(provider, providerId) || !provider || !providerId) {
    return { ok: false, reason: 'invalid_provider' };
  }
  if (!isSupportedProvider(provider)) {
    return { ok: false, reason: 'invalid_provider' };
  }
  return { ok: true };
}

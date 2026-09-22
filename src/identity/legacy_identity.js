/*
 * Phase 1 TASK 1.16｜Legacy Identity Mapping
 *
 * 負責「舊資料來源 → user identity」的判斷邏輯：TASK1.9 的 parser
 * （scripts/legacy_import/parse_legacy_blob.js）解析出來的 user 物件，
 * 該被視為訪客還是已驗證身份，由這裡決定。
 *
 * 純函式，不做任何 D1 寫入（寫入交給 src/identity/lifecycle.js 的
 * createGuestIdentity()，由呼叫端 legacy_import_service.js 決定何時呼叫）。
 */
import { createGuestUser } from './guest.js';

/**
 * @param {object} parsedUser - parseLegacyBlob() 回傳結果裡的 user 欄位
 *   （形狀：{id, auth_provider, auth_provider_id, display_name, is_guest,
 *            legacy_sync_code, created_at, updated_at}）
 * @param {object} [opts] - {now}
 * @returns {object} 決策結果：
 *   - 一般情況（沒有 provider 資訊）：{ isGuest:true, user: <準備寫入的guest user物件> }
 *   - 若 parsedUser 已帶有 provider 資訊（目前 TASK1.9 parser 不會產生這種資料，
 *     是為未來預留的分支）：{ isGuest:false, unsupported:true, reason:'legacy_provider_import_not_supported' }
 *     本次明確不支援直接把「已有provider」的舊資料當成已驗證身份匯入——
 *     因為本次不接OAuth，沒有辦法驗證這組provider/providerId的真實性，
 *     安全起見一律要求先以訪客身份匯入，之後再走正常的 upgradeIdentity() 流程
 *     （見 src/identity/account_upgrade.js，TASK1.14）。
 */
export function resolveLegacyUserIdentity(parsedUser, opts) {
  opts = opts || {};

  const hasProvider = !!(parsedUser && parsedUser.auth_provider && parsedUser.auth_provider_id);
  if (hasProvider) {
    return {
      isGuest: false,
      unsupported: true,
      reason: 'legacy_provider_import_not_supported',
    };
  }

  // 沒有 provider 資訊 → 一律建立為訪客，沿用 TASK1.13B 的 guest.js 資料模型，
  // id 與 legacy_sync_code 盡量沿用 parser 已經算好的值（避免同一來源重複匯入時產生不同id）
  const guestUser = createGuestUser({
    id: parsedUser && parsedUser.id,
    legacySyncCode: parsedUser && parsedUser.legacy_sync_code,
    now: opts.now,
  });

  return { isGuest: true, user: guestUser };
}

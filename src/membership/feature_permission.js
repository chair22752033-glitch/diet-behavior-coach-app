/*
 * Phase 6 TASK 1.122｜Premium Feature Boundary - Feature Permission
 *
 * 責任：規格目標架構"Feature Permission Check"這一步的具體落地
 * ——純粹的資料驅動判斷（membership tier是否符合某個feature要求的
 * 最低tier），不含任何AI/HTTP/資料庫邏輯。
 *
 * ## 明確要求（規格原文）
 *
 * Permission邏輯不能活在Gemini程式碼裡——呼叫順序是"Permission
 * Boundary → Gemini Provider"，不是反過來。這個檔案完全不import
 * `../intelligence/enhancement/gemini/`任何檔案，`src/intelligence/
 * enhancement/gemini/`底下也完全沒有任何檔案import這裡的任何
 * 東西——Permission Boundary不需要知道Gemini實際上怎麼運作，只
 * 需要知道"這個功能名稱需要什麼等級"；Gemini Provider（TASK1.121
 * 既有的`gemini_client.js`/`gemini_provider.js`/`gemini_
 * enhancer.js`）也完全不知道Permission Boundary的存在。
 */
import { isValidMembershipState, UNKNOWN_MEMBERSHIP } from './membership_state.js';
import { resolveMembershipState } from './membership_resolver.js';

/**
 * 功能名稱 → 最低要求tier的對照表——目前只有一個功能
 * （`gemini_enhancement`）。未來新增其他premium功能時，只需要在
 * 這裡加一行，不需要修改判斷邏輯本身。
 */
const FEATURE_TIER_REQUIREMENTS = Object.freeze({
  gemini_enhancement: 'premium',
});

/**
 * 純粹的tier比對——membershipState格式不合法時安全視為
 * `UNKNOWN_MEMBERSHIP`（fail-closed：任何不確定的情況一律視為不
 * 允許，不會因為輸入異常就意外放行）。找不到對應feature名稱時
 * 一律回傳false（未知功能，預設不允許）。
 *
 * @param {{tier:string}} membershipState
 * @param {string} featureName
 * @returns {boolean}
 */
export function isFeatureAllowedForTier(membershipState, featureName) {
  if (typeof featureName !== 'string' || featureName.length === 0) return false;
  const safeState = isValidMembershipState(membershipState) ? membershipState : UNKNOWN_MEMBERSHIP;
  const requiredTier = FEATURE_TIER_REQUIREMENTS[featureName];
  if (!requiredTier) return false;
  return safeState.tier === requiredTier;
}

/**
 * 規格範例的便利函式：`canUseFeature(user, "gemini_enhancement")`
 * ——內部組合`resolveMembershipState()`跟`isFeatureAllowedForTier()`
 * 兩步驟，呼叫端（route層）不需要自己手動串接兩個模組。**永遠不
 * 拋出例外**，任何失敗都安全回傳`false`（fail-closed）。
 *
 * @param {{userId:string|null, authenticated:boolean, provider:string|null}} identity
 * @param {string} featureName
 * @param {object} [options] - 透傳給resolveMembershipState()（見該檔案"Future Payment Compatibility"說明）
 * @returns {boolean}
 */
export function canUseFeature(identity, featureName, options) {
  try {
    const membershipState = resolveMembershipState(identity, options);
    return isFeatureAllowedForTier(membershipState, featureName);
  } catch (e) {
    return false;
  }
}

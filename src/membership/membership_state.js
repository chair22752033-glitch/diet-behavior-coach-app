/*
 * Phase 6 TASK 1.122｜Premium Feature Boundary - Membership State
 *
 * 責任：定義一個跟「怎麼判斷會員等級」完全無關的穩定形狀
 * （Membership State），供Feature Permission Boundary使用——延續
 * 整個系列已確立的慣例（User Identity Context/Health Insight
 * Product Response...）：這裡只定義「資料長什麼樣子」，不含任何
 * 付款/帳單/交易細節。
 *
 * ## Membership State（規格原文：free/premium/unknown三種狀態）
 *
 * - `free`：已登入、但沒有付費會員資格的使用者（目前系統唯一可能
 *   自然產生的"已登入"狀態，因為本次任務刻意不實作付費）
 * - `premium`：已登入且具有付費會員資格的使用者——本次任務只
 *   準備好這個狀態的"形狀"跟"判斷邏輯"，沒有任何管道可以讓真實
 *   使用者變成這個狀態（見`membership_resolver.js`"Future Payment
 *   Compatibility"延伸點說明）
 * - `unknown`：無法判斷會員等級的狀態（匿名使用者、或身份格式不
 *   合法時的安全預設）
 *
 * 明確不含：payment provider、transaction id、billing cycle、
 * subscription id、信用卡資訊——這個形狀從頭到尾只有一個欄位，
 * 這個檔案完全不import任何db/payment相關模組。
 */

export const MEMBERSHIP_TIERS = Object.freeze({
  FREE: 'free',
  PREMIUM: 'premium',
  UNKNOWN: 'unknown',
});

const VALID_TIERS = Object.freeze([MEMBERSHIP_TIERS.FREE, MEMBERSHIP_TIERS.PREMIUM, MEMBERSHIP_TIERS.UNKNOWN]);

/**
 * 無法判斷會員等級時的安全預設狀態——刻意用Object.freeze()避免
 * 任何呼叫端不小心修改到共用的常數物件（延續TASK1.118
 * ANONYMOUS_IDENTITY的既有慣例）。
 */
export const UNKNOWN_MEMBERSHIP = Object.freeze({ tier: MEMBERSHIP_TIERS.UNKNOWN });

/**
 * 判斷傳入的值是否已經是合法的Membership State形狀——純結構檢查。
 *
 * @param {*} state
 * @returns {boolean}
 */
export function isValidMembershipState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (typeof state.tier !== 'string') return false;
  return VALID_TIERS.indexOf(state.tier) >= 0;
}

/**
 * 建立一個合法的Membership State——輸入不是合法tier時安全退回
 * `UNKNOWN_MEMBERSHIP`，不拋出例外，延續整個系列"防禦性正規化"的
 * 既有慣例。
 *
 * @param {*} tier
 * @returns {{tier:'free'|'premium'|'unknown'}}
 */
export function buildMembershipState(tier) {
  if (typeof tier === 'string' && VALID_TIERS.indexOf(tier) >= 0) {
    return { tier };
  }
  return UNKNOWN_MEMBERSHIP;
}

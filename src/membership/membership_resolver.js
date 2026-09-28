/*
 * Phase 6 TASK 1.122｜Premium Feature Boundary - Membership Resolver
 *
 * 責任：把TASK1.118既有的User Identity Context
 * （`{userId, authenticated, provider}`）解析成Membership
 * State——這是規格目標架構"Identity → Membership Resolver"這一步
 * 的具體落地。
 *
 * ## 目前的判斷規則（規格明確要求：本次任務不實作付費）
 *
 * - 身份無效/匿名（`authenticated !== true`或`userId`不是非空
 *   字串）→ `unknown`（在檢查`options.lookupTier`之前就已經回傳，
 *   匿名使用者結構性地不可能被查成premium）
 * - 已登入使用者，且沒有注入`options.lookupTier`（目前系統的
 *   真實情況——沒有任何付費系統） → `free`
 * - 已登入使用者，且`options.lookupTier(userId)`回傳合法的
 *   tier（`'free'`或`'premium'`）→ 使用該回傳值；回傳其他不合法
 *   值（或拋出例外）時安全退回`free`（已登入使用者的安全預設，
 *   不會因為查詢函式本身壞掉就把已登入使用者降級成unknown）
 *
 * ## Future Payment Compatibility（規格明確要求，本次任務不實作）
 *
 * `options.lookupTier`是刻意準備好的延伸點——未來真正的付款/會員
 * 系統接上時，只需要在呼叫`resolveMembershipState()`的地方傳入
 * 一個會去查真實會員資料的`lookupTier(userId)`函式（例如查D1的
 * 新表、或查第三方付款供應商的API），這個檔案本身完全不需要
 * 修改。目前唯一的呼叫端（`src/routes/health_insight_routes.js`）
 * 把既有的`req.options`（延續TASK1.13B/1.29起`req.options`已經
 * 是"單一請求層級選填覆寫"的既有慣例，例如測試用的`now`）原樣
 * 轉發到這裡，但Cloudflare Worker真正的HTTP dispatch
 * （`src/worker.js`）永遠只會傳空物件`options: {}`——也就是說，
 * 目前**沒有任何真實HTTP請求**能夠讓自己變成premium，這個延伸點
 * 只服務未來的付款系統／目前的測試需求。
 *
 * 這個檔案完全不import `src/db/`、不import任何payment/billing
 * 相關模組、也不接受db參數——是否要查真實資料完全由呼叫端決定
 * （透過`options.lookupTier`），這裡只負責"如果查得到就用查到的
 * 結果，查不到/沒有查詢函式就用安全預設"這件事本身。
 */
import { UNKNOWN_MEMBERSHIP, buildMembershipState } from './membership_state.js';

function isAuthenticatedIdentity(identity) {
  return !!(
    identity &&
    typeof identity === 'object' &&
    identity.authenticated === true &&
    typeof identity.userId === 'string' &&
    identity.userId.length > 0
  );
}

/**
 * @param {{userId:string|null, authenticated:boolean, provider:string|null}} identity - TASK1.118既有的User Identity Context
 * @param {object} [options]
 * @param {(userId:string) => string} [options.lookupTier] - 選填，未來真正的會員/付款系統可以注入這個函式，回傳'free'|'premium'
 * @returns {{tier:'free'|'premium'|'unknown'}}
 */
export function resolveMembershipState(identity, options) {
  try {
    if (!isAuthenticatedIdentity(identity)) {
      return UNKNOWN_MEMBERSHIP;
    }

    const safeOptions = options && typeof options === 'object' ? options : {};
    if (typeof safeOptions.lookupTier === 'function') {
      const tier = safeOptions.lookupTier(identity.userId);
      const state = buildMembershipState(tier);
      return state.tier === 'unknown' ? buildMembershipState('free') : state;
    }

    return buildMembershipState('free');
  } catch (e) {
    return UNKNOWN_MEMBERSHIP;
  }
}

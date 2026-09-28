/*
 * Phase 6 TASK 1.118｜Health Insight User Identity Foundation
 * - Membership Extension Point（純粹的inert placeholder）
 *
 * 責任：延續規格"Future Membership Preparation"要求的
 * extension point：
 *
 *   User Identity
 *     ↓
 *   Membership（這裡，inert placeholder）
 *     ↓
 *   Feature Permission（這裡，inert placeholder）
 *     ↓
 *   Gemini Access（規劃中，本次任務不建立）
 *
 * 比照TASK1.40既有的`analysisEngine`/`recommendationEngine`
 * "inert占位物件"慣例——這裡**沒有**訂閱/付費/方案邏輯，
 * `resolveFeaturePermission()`目前對任何身份、任何功能名稱都
 * 回傳固定的`{allowed:true, reason:'not_implemented'}`（現階段
 * Health Insight對所有人開放，這個placeholder只是先把"未來可能
 * 需要檢查權限"這件事的呼叫形狀定下來，不代表真的做了任何
 * 權限判斷）。
 *
 * 明確禁止（本次任務規格原文）：
 * - ❌ 訂閱系統（subscription）
 * - ❌ 付款系統（payment）
 * - ❌ Premium方案邏輯（premium plans）
 *
 * 這個檔案完全不import任何db/payment/billing相關程式碼，也沒有
 * 任何route/controller呼叫它——純粹是"這個呼叫形狀已經想好了"的
 * 佔位骨架。
 */

/**
 * @returns {{status:'not_implemented'}}
 */
export function createMembershipPlaceholder() {
  return { status: 'not_implemented' };
}

/**
 * 目前對任何身份/任何功能名稱都固定允許——現階段Health
 * Insight本來就對所有人（含匿名/訪客）開放，這個函式只是先把
 * 未來"檢查權限"的呼叫介面定下來，不做任何真正的判斷。
 *
 * @param {{userId:string|null, authenticated:boolean, provider:string|null}} [identity]
 * @param {string} [featureName]
 * @returns {{allowed:true, reason:'not_implemented'}}
 */
export function resolveFeaturePermission(identity, featureName) {
  return { allowed: true, reason: 'not_implemented' };
}

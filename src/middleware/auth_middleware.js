/*
 * Phase 1 TASK 1.27｜Auth Middleware（介面預留，本次不強制任何route）
 *
 * requireAuth(options) 回傳一個符合 middleware pipeline 介面
 * （(ctx, next) => any）的函式，供未來需要登入才能存取的路由使用。
 *
 * 本次任務明確要求「只提供 requireAuth()，不實際強制任何route」——
 * 也就是說：這個檔案本身已經是完整、可運作的邏輯（借用TASK1.13B/1.19
 * 已經驗證過的 validateSessionWithIdentity()），但目前沒有任何
 * router.add() 呼叫把它接進任何路由的 middleware 清單，所以不會影響
 * 任何現有請求。
 *
 * 完全不建立新的登入流程、不呼叫 Google OAuth、不執行 Legacy Import——
 * 只是把「驗證身份」這件事包成一個 middleware 可以使用的形狀。
 */
import { validateSessionWithIdentity } from '../identity/session_rules.js';

/**
 * @param {object} [options] - 轉交給 validateSessionWithIdentity() 的選項（例如測試用的 now）
 * @returns {(ctx:object, next:(ctx:object)=>any) => Promise<any>}
 */
export function requireAuth(options) {
  options = options || {};
  return async function authMiddleware(ctx, next) {
    const cookieHeader = ctx && ctx.req ? ctx.req.cookieHeader : undefined;
    const result = await validateSessionWithIdentity(ctx.db, cookieHeader, options);
    if (!result.ok) {
      return { ok: false, reason: result.reason || 'not_authenticated', status: 401 };
    }
    const nextCtx = Object.assign({}, ctx, { user: result.user });
    return next(nextCtx);
  };
}

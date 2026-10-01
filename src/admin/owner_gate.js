/*
 * Phase 9（後台 A 階段）｜擁有者驗證閘門。
 *
 * 只有「已驗證 session 的登入者，且其 Google 身分 (auth_provider_id = Google sub)
 * 等於 env.ADMIN_GOOGLE_SUB」才算擁有者。
 *   - 絕不信任前端送來的 email / role / tier 等欄位。
 *   - 用 Google 的穩定 sub（auth_provider_id），不是 email（email 可變）。
 *   - env.ADMIN_GOOGLE_SUB 未設定時，一律不是擁有者（fail-closed）。
 */

import { getCurrentUser } from '../services/auth_application_service.js';
import { first } from '../db/query.js';

/**
 * @returns {Promise<{authenticated:boolean, owner:boolean, userId?:string}>}
 */
export async function resolveOwner(appDb, rawDb, cookieHeader, env) {
  const adminSub = env && env.ADMIN_GOOGLE_SUB;
  const auth = await getCurrentUser(appDb, cookieHeader, {});
  if (!auth.ok || !auth.userId) return { authenticated: false, owner: false };
  if (typeof adminSub !== 'string' || adminSub.length === 0) {
    // 沒設定擁有者 → 沒有人是擁有者
    return { authenticated: true, owner: false, userId: auth.userId };
  }
  const row = await first(rawDb, 'SELECT auth_provider, auth_provider_id FROM users WHERE id = ?', [auth.userId]);
  if (!row.ok || !row.row) return { authenticated: true, owner: false, userId: auth.userId };
  const isOwner = row.row.auth_provider === 'google' && row.row.auth_provider_id === adminSub;
  return { authenticated: true, owner: !!isOwner, userId: auth.userId };
}

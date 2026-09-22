/*
 * Phase 1 TASK 1.15｜Domain Service Layer - User Service
 *
 * 定位：worker.js → future API → services（這裡）→ db access layer（TASK1.12）→ D1
 * 這一層完全不知道 D1 長什麼樣子（不 import 任何 src/db/query.js 或 transaction.js），
 * 只透過呼叫端傳進來的 db 物件（createDb(env) 的回傳值）操作資料。
 *
 * user_service 是其他所有 domain service 共用的「使用者存在且狀態允許使用」檢查入口，
 * 不重新實作狀態判斷邏輯，直接沿用 TASK1.13B 的 src/identity/status.js。
 */
import { canLogIn } from '../identity/status.js';

/**
 * 取得使用者資料（不做狀態檢查，單純查詢）。
 * @returns {Promise<{ok:boolean, user?:object, error?:string}>}
 */
export async function getUserById(db, userId) {
  const result = await db.users.getById(userId);
  if (!result.ok) return { ok: false, error: result.error };
  if (!result.row) return { ok: false, error: 'user_not_found' };
  return { ok: true, user: result.row };
}

/**
 * 只確認使用者存在（不管狀態），用於不需要嚴格狀態檢查的場景。
 * @returns {Promise<boolean>}
 */
export async function userExists(db, userId) {
  const result = await db.users.getById(userId);
  return !!(result.ok && result.row);
}

/**
 * 未來所有會員相關流程（建立資料、查詢資料、任何需要「這個user能不能用」的地方）
 * 共用的單一入口：確認使用者存在，且狀態允許使用（active）。
 *
 * @returns {Promise<{ok:boolean, user?:object, reason?:string}>}
 *   reason 可能是 'user_not_found' | 'user_suspended' | 'user_deleted' | 'user_status_unknown'
 */
export async function requireActiveUser(db, userId) {
  if (!userId) return { ok: false, reason: 'user_not_found' };

  const result = await db.users.getById(userId);
  if (!result.ok) return { ok: false, reason: 'user_not_found' };

  const check = canLogIn(result.row);
  if (!check.allowed) return { ok: false, reason: check.reason };

  return { ok: true, user: result.row };
}

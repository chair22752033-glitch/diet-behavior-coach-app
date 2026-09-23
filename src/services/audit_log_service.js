/*
 * Phase 1 TASK 1.34｜Authentication Audit Log Service
 *
 * 建立在新表 auth_audit_logs（migrations/0006_...）與
 * src/db/tables/auth_audit_logs.js 之上的服務層，提供「寫入一筆稽核
 * 紀錄」跟「查詢某使用者的稽核紀錄」兩種能力。
 *
 * 重要：這裡只是 service function，完全不會被任何既有 controller
 * （loginGuestController/loginProviderController/logoutController/
 * upgradeGuestController/googleOAuthCallbackController）呼叫——把
 * 「這五個事件實際發生時該不該自動寫一筆audit log」留給未來的任務決定，
 * 本次只負責把「寫得進去、查得出來」這個能力建好、獨立測試，不改變任何
 * 既有登入流程的行為或D1寫入footprint（禁止修改現有登入流程行為）。
 */
import { AUTH_AUDIT_EVENT_TYPES } from '../db/tables/auth_audit_logs.js';

export { AUTH_AUDIT_EVENT_TYPES };

function isValidEventType(eventType) {
  return AUTH_AUDIT_EVENT_TYPES.indexOf(eventType) >= 0;
}

/**
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {{user_id:string, event_type:string, provider?:string, ip_hash?:string, user_agent?:string}} event
 * @param {object} [options] - {now}
 * @returns {Promise<{ok:boolean, entry?:object, reason?:string, error?:string}>}
 *   reason 可能是 'invalid_event' | 'missing_user_id' | 'invalid_event_type'
 */
export async function recordAuthEvent(db, event, options) {
  options = options || {};
  if (!event || typeof event !== 'object') {
    return { ok: false, reason: 'invalid_event' };
  }
  if (!event.user_id) {
    return { ok: false, reason: 'missing_user_id' };
  }
  if (!isValidEventType(event.event_type)) {
    return { ok: false, reason: 'invalid_event_type' };
  }

  const now = (options.now ? new Date(options.now) : new Date()).toISOString();
  const entry = {
    id: crypto.randomUUID(),
    user_id: event.user_id,
    event_type: event.event_type,
    provider: event.provider || null,
    ip_hash: event.ip_hash || null,
    user_agent: event.user_agent || null,
    created_at: now,
  };

  const result = await db.authAuditLogs.insert(entry);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, entry };
}

/**
 * @param {object} db
 * @param {string} userId
 * @param {object} [options] - {limit}
 * @returns {Promise<{ok:boolean, logs?:Array, error?:string}>}
 */
export async function listAuthEventsForUser(db, userId, options) {
  options = options || {};
  if (!userId) {
    return { ok: false, reason: 'missing_user_id' };
  }
  const result = await db.authAuditLogs.listByUser(userId, options.limit);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, logs: result.results };
}

/**
 * @param {object} db
 * @param {string} eventType
 * @param {object} [options] - {limit}
 * @returns {Promise<{ok:boolean, logs?:Array, reason?:string, error?:string}>}
 */
export async function listAuthEventsByType(db, eventType, options) {
  options = options || {};
  if (!isValidEventType(eventType)) {
    return { ok: false, reason: 'invalid_event_type' };
  }
  const result = await db.authAuditLogs.listByEventType(eventType, options.limit);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, logs: result.results };
}

/*
 * Phase D｜Support Request Store（使用者主動分享記錄給管理者）
 *
 * 讀寫 D1 的 support_requests 表（見 migrations/0015）。
 *
 * 安全原則：
 *   - 只用「已驗證的 session user_id」當 owner key，不信前端宣稱的身分。
 *   - payload 為使用者端依期間過濾後的記錄快照（JSON 字串），後端只負責驗證
 *     大小上限與基本結構並存檔；不另外去翻該使用者的其他資料。
 *   - 讀取（list/get）僅供擁有者後台使用，呼叫端需先過 owner 閘門。
 */

import { run, all, first } from '../db/query.js';

// 單筆分享的大小與數量上限（避免被塞爆）。
export const SUPPORT_MAX_PAYLOAD_BYTES = 512 * 1024; // 512 KB
export const SUPPORT_MAX_RECORDS = 2000;
export const SUPPORT_MIN_PERIOD_DAYS = 90;

function genId() {
  return 'sr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

/**
 * 建立一筆分享（使用者本人送出）。
 * @param {object} rawDb
 * @param {string} userId - 已驗證的 session user_id
 * @param {object} input - { question, periodDays, rangeFrom, rangeTo, recordCount, payload(JSON字串) }
 * @returns {Promise<{ok:boolean, id?:string, reason?:string}>}
 */
export async function createSupportRequest(rawDb, userId, input) {
  if (!rawDb || typeof userId !== 'string' || userId.length === 0) {
    return { ok: false, reason: 'invalid_user' };
  }
  const payload = (input && typeof input.payload === 'string') ? input.payload : '';
  if (!payload) return { ok: false, reason: 'empty_payload' };
  // 用 byte 長度估算（避免超大 payload）。
  const bytes = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(payload).length : payload.length;
  if (bytes > SUPPORT_MAX_PAYLOAD_BYTES) return { ok: false, reason: 'payload_too_large' };

  const id = genId();
  const question = (input && typeof input.question === 'string') ? input.question.slice(0, 2000) : '';
  let periodDays = Number(input && input.periodDays);
  if (!Number.isFinite(periodDays) || periodDays <= 0) periodDays = SUPPORT_MIN_PERIOD_DAYS;
  periodDays = Math.max(SUPPORT_MIN_PERIOD_DAYS, Math.min(3650, Math.floor(periodDays)));
  let recordCount = Number(input && input.recordCount);
  if (!Number.isFinite(recordCount) || recordCount < 0) recordCount = 0;
  recordCount = Math.min(SUPPORT_MAX_RECORDS, Math.floor(recordCount));
  const rangeFrom = (input && typeof input.rangeFrom === 'string') ? input.rangeFrom.slice(0, 40) : null;
  const rangeTo = (input && typeof input.rangeTo === 'string') ? input.rangeTo.slice(0, 40) : null;

  const res = await run(
    rawDb,
    'INSERT INTO support_requests (id, user_id, question, period_days, range_from, range_to, record_count, payload, status, created_at) ' +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', datetime('now'))",
    [id, userId, question, periodDays, rangeFrom, rangeTo, recordCount, payload]
  );
  if (!res.ok) return { ok: false, reason: res.error || 'write_failed' };
  return { ok: true, id };
}

/**
 * 列出分享（擁有者後台用；不含 payload 全文，只給 metadata + 問題摘要）。
 * @returns {Promise<{ok:boolean, items:Array}>}
 */
export async function listSupportRequests(rawDb, options) {
  if (!rawDb) return { ok: false, items: [] };
  const limit = Math.max(1, Math.min(200, Number((options && options.limit) || 50)));
  const res = await all(
    rawDb,
    'SELECT s.id, s.user_id, s.question, s.period_days, s.range_from, s.range_to, s.record_count, s.status, s.created_at, ' +
      'u.display_name AS display_name, u.email AS email ' +
      'FROM support_requests s LEFT JOIN users u ON u.id = s.user_id ' +
      'ORDER BY s.created_at DESC LIMIT ?',
    [limit]
  );
  if (!res.ok) return { ok: false, items: [] };
  return { ok: true, items: res.results || [] };
}

/**
 * 取單筆分享全文（含 payload）。擁有者後台用。
 * @returns {Promise<{ok:boolean, row:object|null}>}
 */
export async function getSupportRequest(rawDb, id) {
  if (!rawDb || typeof id !== 'string' || !id) return { ok: false, row: null };
  const res = await first(
    rawDb,
    'SELECT s.id, s.user_id, s.question, s.period_days, s.range_from, s.range_to, s.record_count, s.status, s.created_at, s.payload, ' +
      'u.display_name AS display_name, u.email AS email ' +
      'FROM support_requests s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?',
    [id]
  );
  if (!res.ok) return { ok: false, row: null };
  return { ok: true, row: res.row };
}

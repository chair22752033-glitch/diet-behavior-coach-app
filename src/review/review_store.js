/*
 * Phase 9｜7 日回顧的 D1 快取 + 配額存取層。
 *
 * - 快取：以 (user_id, report_key) 為主鍵。同資料+視窗 → 同 key → 重看命中快取，
 *   不重算、不重複扣配額（idempotent）。
 * - 配額：期間內 distinct report_key 數 = 真正產生過的報告數。重看不增加。
 *   beta 每帳號上限由呼叫端（worker）帶入；本層只負責計數與寫入。
 *
 * 所有函式用 app.db.raw（原始 D1）。
 */

import { first, all, run } from '../db/query.js';

/** 取某 report_key 的快取（命中代表已產生過，可重看不扣額度） */
export async function getReport(rawDb, userId, reportKey) {
  if (!rawDb || !userId || !reportKey) return { ok: false, report: null };
  const res = await first(
    rawDb,
    'SELECT report_key, window_start, window_end, data_version, model_version, payload, created_at FROM review_reports WHERE user_id = ? AND report_key = ?',
    [userId, reportKey]
  );
  if (!res.ok) return { ok: false, report: null, reason: 'read_failed' };
  if (!res.row) return { ok: true, report: null };
  let payload = null;
  try { payload = JSON.parse(res.row.payload); } catch (e) { payload = null; }
  return { ok: true, report: { reportKey: res.row.report_key, windowStart: res.row.window_start, windowEnd: res.row.window_end, createdAt: res.row.created_at, payload } };
}

/** 取某使用者最近一次產生的報告（供 GET 重看，不扣額度） */
export async function getLatestReport(rawDb, userId) {
  if (!rawDb || !userId) return { ok: false, report: null };
  const res = await all(
    rawDb,
    'SELECT report_key, window_start, window_end, payload, created_at FROM review_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  if (!res.ok) return { ok: false, report: null, reason: 'read_failed' };
  if (!res.results.length) return { ok: true, report: null };
  const row = res.results[0];
  let payload = null;
  try { payload = JSON.parse(row.payload); } catch (e) { payload = null; }
  return { ok: true, report: { reportKey: row.report_key, windowStart: row.window_start, windowEnd: row.window_end, createdAt: row.created_at, payload } };
}

/** 計算某時間點之後，已產生過的 distinct 報告數（= 已用配額） */
export async function countReportsSince(rawDb, userId, sinceIso) {
  if (!rawDb || !userId) return { ok: false, count: 0 };
  const res = sinceIso
    ? await first(rawDb, 'SELECT COUNT(*) AS n FROM review_reports WHERE user_id = ? AND created_at >= ?', [userId, sinceIso])
    : await first(rawDb, 'SELECT COUNT(*) AS n FROM review_reports WHERE user_id = ?', [userId]);
  if (!res.ok) return { ok: false, count: 0, reason: 'read_failed' };
  return { ok: true, count: res.row ? Number(res.row.n) || 0 : 0 };
}

/**
 * 寫入一份新報告（idempotent：ON CONFLICT DO NOTHING，重送不重複、不多扣）。
 * 回傳 { ok, inserted } —— inserted=false 代表這個 key 已存在（重看，不算新產生）。
 */
export async function saveReport(rawDb, userId, reportKey, meta, payloadObj) {
  if (!rawDb || !userId || !reportKey) return { ok: false, reason: 'invalid_args' };
  let payloadStr;
  try { payloadStr = JSON.stringify(payloadObj); } catch (e) { return { ok: false, reason: 'unserializable' }; }
  const res = await run(
    rawDb,
    'INSERT INTO review_reports (user_id, report_key, window_start, window_end, data_version, model_version, payload, created_at) ' +
      "VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(user_id, report_key) DO NOTHING",
    [userId, reportKey, meta.windowStart, meta.windowEnd, meta.dataVersion || '', meta.modelVersion || '', payloadStr]
  );
  if (!res.ok) return { ok: false, reason: res.error || 'write_failed' };
  const inserted = !!(res.meta && (res.meta.changes === 1 || res.meta.rows_written === 1));
  return { ok: true, inserted };
}

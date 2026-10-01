/*
 * Phase 9（後台 A 階段）｜後台資料存取層。
 *
 * 嚴格界線：後台只讀「聚合數字」與「會員權益狀態」，
 * 絕不提供任何讀取使用者飲食明細（sync_records 的 payload）的函式。
 * 全部用 app.db.raw（原始 D1）。
 */

import { first, all, run } from '../db/query.js';

function today() {
  return new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

/**
 * 累加當日某端點的用量（只記數字；沒有使用者資料）。
 * rowsRead/rowsWritten 取自 D1 result.meta；取不到時以 0 計。
 */
export async function recordUsage(rawDb, endpoint, rowsRead, rowsWritten) {
  if (!rawDb || !endpoint) return { ok: false };
  const rr = Number.isFinite(rowsRead) ? Math.max(0, Math.floor(rowsRead)) : 0;
  const rw = Number.isFinite(rowsWritten) ? Math.max(0, Math.floor(rowsWritten)) : 0;
  const res = await run(
    rawDb,
    'INSERT INTO usage_metrics (day, endpoint, requests, rows_read, rows_written, updated_at) ' +
      "VALUES (?, ?, 1, ?, ?, datetime('now')) " +
      'ON CONFLICT(day, endpoint) DO UPDATE SET ' +
      'requests = requests + 1, rows_read = rows_read + excluded.rows_read, ' +
      'rows_written = rows_written + excluded.rows_written, updated_at = excluded.updated_at',
    [today(), endpoint, rr, rw]
  );
  return { ok: res.ok };
}

/**
 * 後台總覽：聚合加入人數、會員清單、近期稽核、近 30 天用量。
 * 不含任何飲食明細。
 */
export async function getOverview(rawDb, options) {
  const memberLimit = (options && options.memberLimit) || 100;
  const auditLimit = (options && options.auditLimit) || 50;

  // 加入人數（來自 users 表，不是 sync_records——沒記錄的註冊者也要算）
  const totalU = await first(rawDb, 'SELECT COUNT(*) AS n FROM users', []);
  const googleU = await first(rawDb, "SELECT COUNT(*) AS n FROM users WHERE auth_provider = 'google'", []);

  // 現有 premium 會員（權益狀態，非飲食資料）
  const members = await all(
    rawDb,
    "SELECT m.user_id, m.plan, m.status, m.valid_until, m.source, m.updated_at, u.display_name " +
      'FROM memberships m LEFT JOIN users u ON u.id = m.user_id ' +
      "WHERE m.plan = 'premium' AND m.status = 'active' " +
      'ORDER BY m.updated_at DESC LIMIT ?',
    [memberLimit]
  );

  // 近期加入的帳號（供擁有者找出要開通的人——只有帳號 metadata，無飲食資料）
  const signups = await all(
    rawDb,
    "SELECT id, display_name, auth_provider, is_guest, created_at FROM users ORDER BY created_at DESC LIMIT ?",
    [(options && options.signupLimit) || 50]
  );

  // 近期權益稽核
  const audit = await all(
    rawDb,
    'SELECT user_id, action, plan, valid_until, source, actor, at FROM membership_audit ORDER BY at DESC LIMIT ?',
    [auditLimit]
  );

  // 近 30 天用量彙總（per endpoint 加總）
  const usage = await all(
    rawDb,
    "SELECT endpoint, SUM(requests) AS requests, SUM(rows_read) AS rows_read, SUM(rows_written) AS rows_written " +
      "FROM usage_metrics WHERE day >= date('now','-30 days') GROUP BY endpoint ORDER BY endpoint",
    []
  );

  return {
    ok: true,
    data: {
      totalUsers: totalU.ok && totalU.row ? Number(totalU.row.n) || 0 : 0,
      googleUsers: googleU.ok && googleU.row ? Number(googleU.row.n) || 0 : 0,
      activeMembers: members.ok ? members.results : [],
      recentSignups: signups.ok ? signups.results : [],
      recentAudit: audit.ok ? audit.results : [],
      usage30d: usage.ok ? usage.results : []
    }
  };
}

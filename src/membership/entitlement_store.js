/*
 * Phase 9｜Membership Entitlement Store（server 端唯一權威權益來源）
 *
 * 這是 membership_resolver 的 options.lookupTier 真正要連到的地方。
 * 讀寫 D1 的 memberships / membership_audit 表（見 migrations/0009）。
 *
 * 安全原則：
 *   - 只用「已驗證的 session user_id」當 key，絕不接受前端宣稱的 tier/user_id。
 *   - 到期在請求當下判斷（valid_until 比 now），不依賴任何排程清理。
 *   - 查詢失敗 → 回 { tier: 'unknown' }（暫時不可確認），呼叫端據此 fail-safe，
 *     不把暫時故障永久寫成降級，也不要求已付費者重新購買。
 *   - 只有 free / premium 兩種對外方案；unknown 是查詢狀態不是商品。
 *
 * 注意：getEntitlement 是 async（D1 I/O）。membership_resolver 的 lookupTier
 * 是 sync 契約，因此呼叫端（worker dispatch）要「先 await 解析好 tier，再注入
 * 一個回傳該值的 sync 閉包」，不要把本檔案的 async 函式直接當 lookupTier。
 */

import { first, run } from '../db/query.js';

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString();
}

/**
 * 查某使用者目前有效的權益 tier。
 * @param {object} rawDb - 原始 D1（app.db.raw）
 * @param {string} userId - 已驗證的 session user_id
 * @returns {Promise<{tier:'free'|'premium'|'unknown', validUntil?:string|null, status?:string}>}
 */
export async function getEntitlement(rawDb, userId) {
  if (!rawDb || typeof userId !== 'string' || userId.length === 0) {
    return { tier: 'unknown' };
  }
  const res = await first(
    rawDb,
    'SELECT plan, status, valid_from, valid_until FROM memberships WHERE user_id = ?',
    [userId]
  );
  if (!res.ok) {
    // 查詢失敗 → 暫時不可確認，不改變使用者實際方案
    return { tier: 'unknown' };
  }
  const row = res.row;
  if (!row) {
    // 沒有紀錄 = 一般免費使用者（這是正常狀態，不是錯誤）
    return { tier: 'free' };
  }
  if (row.status && row.status !== 'active') {
    return { tier: 'free', status: row.status, validUntil: row.valid_until || null };
  }
  if (row.plan !== 'premium') {
    return { tier: 'free', status: row.status, validUntil: row.valid_until || null };
  }
  // premium：請求當下檢查是否過期
  if (row.valid_until) {
    const now = nowIso();
    if (String(row.valid_until) <= now) {
      // 已過期 → 當下視為 free（不寫 DB、不永久降級；下次 grant 會覆蓋）
      return { tier: 'free', status: 'expired', validUntil: row.valid_until };
    }
  }
  return { tier: 'premium', status: 'active', validUntil: row.valid_until || null };
}

/**
 * 授予有期限的 beta premium 權益（只給明確指定的帳號；沒有公開自助升級端點）。
 * @param {object} rawDb
 * @param {string} userId - 已存在於 users 表的使用者 id
 * @param {number} days - 試用天數（例如 14）
 * @param {string} source - 來源標記（例如 'beta_manual'）
 * @param {string} actor - 操作者（例如管理者 email），寫入稽核
 * @returns {Promise<{ok:boolean, validUntil?:string, reason?:string}>}
 */
export async function grantBeta(rawDb, userId, days, source, actor, tier) {
  if (!rawDb || typeof userId !== 'string' || userId.length === 0) {
    return { ok: false, reason: 'invalid_user' };
  }
  const validFrom = nowIso();
  const validUntil = addDaysIso(days && days > 0 ? days : 14);
  const src = source || 'beta_manual';
  const tierLabel = (typeof tier === 'string' && tier.length) ? tier : 'app';
  const upsert = await run(
    rawDb,
    'INSERT INTO memberships (user_id, plan, status, tier, valid_from, valid_until, source, created_at, updated_at) ' +
      "VALUES (?, 'premium', 'active', ?, ?, ?, ?, datetime('now'), datetime('now')) " +
      'ON CONFLICT(user_id) DO UPDATE SET ' +
      "plan='premium', status='active', tier=excluded.tier, valid_from=excluded.valid_from, valid_until=excluded.valid_until, " +
      'source=excluded.source, updated_at=excluded.updated_at',
    [userId, tierLabel, validFrom, validUntil, src]
  );
  if (!upsert.ok) return { ok: false, reason: upsert.error || 'write_failed' };
  await run(
    rawDb,
    'INSERT INTO membership_audit (user_id, action, plan, valid_until, source, actor, at) ' +
      "VALUES (?, 'grant', 'premium', ?, ?, ?, datetime('now'))",
    [userId, validUntil, src + ':' + tierLabel, actor || 'system']
  );
  return { ok: true, validUntil, tier: tierLabel };
}

/**
 * 撤銷某帳號的權益（降回 free / status=revoked），寫入稽核。
 */
export async function revoke(rawDb, userId, actor) {
  if (!rawDb || typeof userId !== 'string' || userId.length === 0) {
    return { ok: false, reason: 'invalid_user' };
  }
  const upd = await run(
    rawDb,
    "UPDATE memberships SET plan='free', status='revoked', updated_at=datetime('now') WHERE user_id = ?",
    [userId]
  );
  if (!upd.ok) return { ok: false, reason: upd.error || 'write_failed' };
  await run(
    rawDb,
    'INSERT INTO membership_audit (user_id, action, plan, valid_until, source, actor, at) ' +
      "VALUES (?, 'revoke', 'free', NULL, 'revoke', ?, datetime('now'))",
    [userId, actor || 'system']
  );
  return { ok: true };
}

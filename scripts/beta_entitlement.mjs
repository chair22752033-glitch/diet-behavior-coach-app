#!/usr/bin/env node
/*
 * Phase 9｜Beta 權益授予／撤銷 — 特權操作命令（在操作者本機、具 Cloudflare 登入時使用）。
 *
 * 這不是公開端點：沒有任何 HTTP 路由能自助升級。授予一律由操作者明確指定帳號。
 *
 * 用法（先查出使用者的內部 id）：
 *   npx wrangler d1 execute diet-coach-db --remote \
 *     --command="SELECT id, email, display_name FROM users WHERE email='someone@example.com';"
 *
 * 產生授予 14 天 beta 的指令：
 *   node scripts/beta_entitlement.mjs grant <userId> 14 beta_manual <operator@email>
 * 產生撤銷指令：
 *   node scripts/beta_entitlement.mjs revoke <userId> <operator@email>
 *
 * 本腳本只「印出」要執行的 wrangler 指令（讓你檢查後再貼上執行），不自行寫入正式庫。
 * SQL 語意與 src/membership/entitlement_store.js 保持一致。
 */

const DB = 'diet-coach-db';

function esc(s) { return String(s).replace(/'/g, "''"); }

function isoPlusDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days || 14));
  return d.toISOString();
}

const [, , action, userId, a3, a4, a5] = process.argv;

if (!action || !userId) {
  console.error('用法:\n  node scripts/beta_entitlement.mjs grant <userId> [days=14] [source=beta_manual] [actor]\n  node scripts/beta_entitlement.mjs revoke <userId> [actor]');
  process.exit(1);
}

if (action === 'grant') {
  const days = a3 && /^\d+$/.test(a3) ? Number(a3) : 14;
  const source = (a3 && !/^\d+$/.test(a3)) ? a3 : (a4 || 'beta_manual');
  const actor = a5 || a4 || 'operator';
  const validUntil = isoPlusDays(days);
  const uid = esc(userId);
  const upsert =
    "INSERT INTO memberships (user_id, plan, status, valid_from, valid_until, source, created_at, updated_at) " +
    "VALUES ('" + uid + "', 'premium', 'active', datetime('now'), '" + esc(validUntil) + "', '" + esc(source) + "', datetime('now'), datetime('now')) " +
    "ON CONFLICT(user_id) DO UPDATE SET plan='premium', status='active', valid_from=excluded.valid_from, valid_until=excluded.valid_until, source=excluded.source, updated_at=excluded.updated_at;";
  const audit =
    "INSERT INTO membership_audit (user_id, action, plan, valid_until, source, actor, at) " +
    "VALUES ('" + uid + "', 'grant', 'premium', '" + esc(validUntil) + "', '" + esc(source) + "', '" + esc(actor) + "', datetime('now'));";
  console.log('# 授予 ' + userId + ' 的 beta premium（到期：' + validUntil + '）');
  console.log('npx wrangler d1 execute ' + DB + ' --remote --command="' + upsert.replace(/"/g, '\\"') + '"');
  console.log('npx wrangler d1 execute ' + DB + ' --remote --command="' + audit.replace(/"/g, '\\"') + '"');
} else if (action === 'revoke') {
  const actor = a3 || 'operator';
  const uid = esc(userId);
  const upd = "UPDATE memberships SET plan='free', status='revoked', updated_at=datetime('now') WHERE user_id='" + uid + "';";
  const audit = "INSERT INTO membership_audit (user_id, action, plan, valid_until, source, actor, at) VALUES ('" + uid + "', 'revoke', 'free', NULL, 'revoke', '" + esc(actor) + "', datetime('now'));";
  console.log('# 撤銷 ' + userId + ' 的權益');
  console.log('npx wrangler d1 execute ' + DB + ' --remote --command="' + upd.replace(/"/g, '\\"') + '"');
  console.log('npx wrangler d1 execute ' + DB + ' --remote --command="' + audit.replace(/"/g, '\\"') + '"');
} else {
  console.error('未知動作：' + action + '（只支援 grant / revoke）');
  process.exit(1);
}

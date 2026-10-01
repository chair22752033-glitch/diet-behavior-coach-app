/*
 * Phase 9（後台 A 階段）｜擁有者後台 — real Worker boundary tests。
 * 驗證：/admin 與 /api/admin/* 的擁有者閘門（Google sub 白名單）、未登入/非擁有者拒絕、
 * 開通/撤銷、overview 只含聚合（無飲食明細）、用量量測累加、ADMIN_GOOGLE_SUB 未設時無人是擁有者。
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

function makeD1(sqlite) {
  function stmt(sql) {
    let params = [];
    const api = {
      bind(...p) { params = p.map((x) => (x === undefined ? null : x)); return api; },
      _run() { const s = sqlite.prepare(sql); const info = s.run(...params); return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid || 0) } }; },
      _all() { const s = sqlite.prepare(sql); return { results: s.all(...params), success: true, meta: {} }; },
      _first() { const s = sqlite.prepare(sql); const r = s.get(...params); return r === undefined ? null : r; },
      async run() { return api._run(); }, async all() { return api._all(); }, async first() { return api._first(); },
    };
    return api;
  }
  return { prepare(sql) { return stmt(sql); }, async batch(prepared) { sqlite.exec('BEGIN'); try { const r = []; for (const st of prepared) r.push(st._run()); sqlite.exec('COMMIT'); return r; } catch (e) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw e; } } };
}
function makeKV() { const m = new Map(); return { async get(k){return m.has(k)?m.get(k):null;}, async put(k,v){m.set(k,v);}, async delete(k){m.delete(k);} }; }
function applyMigrations(sqlite) {
  const dir = path.join(repoRoot, 'migrations');
  for (const f of fs.readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f) && !/0002_/.test(f)).sort()) {
    try { sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) {}
  }
}
const worker = (await import('../../src/worker.js')).default;
function makeCtx(adminSub) {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const env = { DIET_COACH_DB: makeD1(sqlite), SYNC_KV: makeKV() };
  if (adminSub) env.ADMIN_GOOGLE_SUB = adminSub;
  return { env, sqlite };
}
async function call(env, method, pathname, { cookie, body, origin } = {}) {
  const headers = {}; if (cookie) headers['Cookie'] = cookie; if (origin) headers['Origin'] = origin;
  const init = { method, headers };
  if (body !== undefined) { init.body = typeof body === 'string' ? body : JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await worker.fetch(new Request('https://x.test' + pathname, init), env, {});
  let json = null; const text = await res.text(); try { json = text ? JSON.parse(text) : null; } catch (e) {}
  return { status: res.status, json, text };
}
async function mintGuest(env, sqlite) {
  const r = await worker.fetch(new Request('https://x.test/auth/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env, {});
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const uid = sqlite.prepare('SELECT id FROM users ORDER BY rowid DESC LIMIT 1').get().id;
  return { cookie, userId: uid };
}
// 把一個 guest 變成 google 擁有者
function makeOwner(sqlite, userId, sub) {
  sqlite.prepare("UPDATE users SET auth_provider='google', auth_provider_id=?, display_name=? WHERE id=?").run(sub, 'Owner', userId);
}

let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('✅ ' + name); } catch (e) { failed++; console.log('❌ ' + name + ' — ' + e.message); } }

const SUB = 'owner-google-sub-123';

await test('/admin GET 未登入 → 403（非擁有者不給頁面）', async () => {
  const { env } = makeCtx(SUB);
  const r = await call(env, 'GET', '/admin');
  assert.strictEqual(r.status, 403);
});
await test('/api/admin/overview 未登入 → 401', async () => {
  const { env } = makeCtx(SUB);
  const r = await call(env, 'GET', '/api/admin/overview');
  assert.strictEqual(r.status, 401);
});
await test('/api/admin/overview 非擁有者（guest）→ 403', async () => {
  const { env, sqlite } = makeCtx(SUB);
  const g = await mintGuest(env, sqlite);
  const r = await call(env, 'GET', '/api/admin/overview', { cookie: g.cookie });
  assert.strictEqual(r.status, 403);
});
await test('google 使用者但 sub 不符 → 403', async () => {
  const { env, sqlite } = makeCtx(SUB);
  const g = await mintGuest(env, sqlite);
  makeOwner(sqlite, g.userId, 'some-other-sub');
  const r = await call(env, 'GET', '/api/admin/overview', { cookie: g.cookie });
  assert.strictEqual(r.status, 403);
});
await test('ADMIN_GOOGLE_SUB 未設定 → 連正確 google 使用者也不是擁有者（fail-closed）', async () => {
  const { env, sqlite } = makeCtx(null); // 沒設 adminSub
  const g = await mintGuest(env, sqlite);
  makeOwner(sqlite, g.userId, SUB);
  const r = await call(env, 'GET', '/api/admin/overview', { cookie: g.cookie });
  assert.strictEqual(r.status, 403);
});
await test('擁有者 → /admin 頁面 200 + overview 200（含聚合欄位）', async () => {
  const { env, sqlite } = makeCtx(SUB);
  const g = await mintGuest(env, sqlite); makeOwner(sqlite, g.userId, SUB);
  const page = await call(env, 'GET', '/admin', { cookie: g.cookie });
  assert.strictEqual(page.status, 200);
  assert.ok(/擁有者後台/.test(page.text), 'admin page HTML');
  const ov = await call(env, 'GET', '/api/admin/overview', { cookie: g.cookie });
  assert.strictEqual(ov.status, 200);
  assert.ok(ov.json.ok && ov.json.data, 'overview ok');
  ['totalUsers', 'googleUsers', 'activeMembers', 'recentAudit', 'usage30d'].forEach((k) => assert.ok(k in ov.json.data, 'has ' + k));
});
await test('overview 不含任何飲食明細（無 ins/payload/sync 欄位）', async () => {
  const { env, sqlite } = makeCtx(SUB);
  const g = await mintGuest(env, sqlite); makeOwner(sqlite, g.userId, SUB);
  // 塞一筆該帳號的飲食記錄
  await call(env, 'POST', '/api/sync', { cookie: g.cookie, body: { ins: [{ id: 'a', ts: Date.now(), crave: 'fried', st: { crave: 'fried' } }], quest: { entries: [] } } });
  const ov = await call(env, 'GET', '/api/admin/overview', { cookie: g.cookie });
  const blob = JSON.stringify(ov.json);
  assert.ok(blob.indexOf('"ins"') === -1 && blob.indexOf('payload') === -1 && blob.indexOf('"crave"') === -1, 'no diet detail leaked');
});
await test('擁有者 grant（by userId）→ 會員出現在 overview', async () => {
  const { env, sqlite } = makeCtx(SUB);
  const owner = await mintGuest(env, sqlite); makeOwner(sqlite, owner.userId, SUB);
  const target = await mintGuest(env, sqlite);
  const g = await call(env, 'POST', '/api/admin/grant', { cookie: owner.cookie, origin: 'https://x.test', body: { who: target.userId, days: 14 } });
  assert.strictEqual(g.status, 200); assert.ok(g.json.ok && g.json.validUntil, 'granted');
  const ov = await call(env, 'GET', '/api/admin/overview', { cookie: owner.cookie });
  assert.ok(ov.json.data.activeMembers.some((m) => m.user_id === target.userId), 'member listed');
  // 目標帳號現在是 premium：/api/review 不再 403
  const rv = await call(env, 'GET', '/api/review', { cookie: target.cookie });
  assert.strictEqual(rv.status, 200);
});
await test('擁有者 grant（by Google sub）→ 成功', async () => {
  const { env, sqlite } = makeCtx(SUB);
  const owner = await mintGuest(env, sqlite); makeOwner(sqlite, owner.userId, SUB);
  const target = await mintGuest(env, sqlite);
  sqlite.prepare("UPDATE users SET auth_provider='google', auth_provider_id='member-sub-9' WHERE id=?").run(target.userId);
  const g = await call(env, 'POST', '/api/admin/grant', { cookie: owner.cookie, origin: 'https://x.test', body: { who: 'member-sub-9', days: 7 } });
  assert.strictEqual(g.status, 200); assert.ok(g.json.ok);
});
await test('擁有者 revoke → 會員從 active 名單移除', async () => {
  const { env, sqlite } = makeCtx(SUB);
  const owner = await mintGuest(env, sqlite); makeOwner(sqlite, owner.userId, SUB);
  const target = await mintGuest(env, sqlite);
  await call(env, 'POST', '/api/admin/grant', { cookie: owner.cookie, origin: 'https://x.test', body: { who: target.userId, days: 14 } });
  const rev = await call(env, 'POST', '/api/admin/revoke', { cookie: owner.cookie, origin: 'https://x.test', body: { who: target.userId } });
  assert.strictEqual(rev.status, 200); assert.ok(rev.json.ok);
  const ov = await call(env, 'GET', '/api/admin/overview', { cookie: owner.cookie });
  assert.ok(!ov.json.data.activeMembers.some((m) => m.user_id === target.userId), 'member removed');
});
await test('grant 不存在的 id/sub → 404', async () => {
  const { env, sqlite } = makeCtx(SUB);
  const owner = await mintGuest(env, sqlite); makeOwner(sqlite, owner.userId, SUB);
  const r = await call(env, 'POST', '/api/admin/grant', { cookie: owner.cookie, origin: 'https://x.test', body: { who: 'no-such-id-or-sub' } });
  assert.strictEqual(r.status, 404);
});
await test('POST 壞 Origin → 403（CSRF 縱深防禦）', async () => {
  const { env, sqlite } = makeCtx(SUB);
  const owner = await mintGuest(env, sqlite); makeOwner(sqlite, owner.userId, SUB);
  const target = await mintGuest(env, sqlite);
  const r = await call(env, 'POST', '/api/admin/grant', { cookie: owner.cookie, origin: 'https://evil.example', body: { who: target.userId } });
  assert.strictEqual(r.status, 403);
});
await test('用量量測：/api/sync 後 overview.usage30d 有 api/sync 列', async () => {
  const { env, sqlite } = makeCtx(SUB);
  const owner = await mintGuest(env, sqlite); makeOwner(sqlite, owner.userId, SUB);
  await call(env, 'POST', '/api/sync', { cookie: owner.cookie, body: { ins: [{ id: 'a', ts: Date.now(), crave: 'fried', st: {} }], quest: { entries: [] } } });
  await call(env, 'GET', '/api/sync', { cookie: owner.cookie });
  const ov = await call(env, 'GET', '/api/admin/overview', { cookie: owner.cookie });
  const row = ov.json.data.usage30d.find((u) => u.endpoint === 'api/sync');
  assert.ok(row, 'has api/sync usage');
  assert.ok(Number(row.requests) >= 2, 'requests counted');
});

console.log('\n合計：' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);

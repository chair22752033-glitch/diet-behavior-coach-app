/*
 * Phase 9｜Membership Entitlement + 7-Day Review — real Worker boundary tests.
 *
 * 透過 worker.default.fetch + node:sqlite D1 + 假 KV + 由 /auth/guest 真正簽發的
 * session 驗證：/api/review 的權益閘門、資料不足降級、個人化產生、idempotency、
 * 配額、重看、到期、跨帳號隔離、權益查詢失敗 fail-safe、偽造前端 tier 無效。
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
      _all() { const s = sqlite.prepare(sql); const rows = s.all(...params); return { results: rows, success: true, meta: {} }; },
      _first() { const s = sqlite.prepare(sql); const row = s.get(...params); return row === undefined ? null : row; },
      async run() { return api._run(); },
      async all() { return api._all(); },
      async first() { return api._first(); },
    };
    return api;
  }
  return {
    prepare(sql) { return stmt(sql); },
    async batch(prepared) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const st of prepared) results.push(st._run()); sqlite.exec('COMMIT'); return results; }
      catch (e) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw e; }
    },
  };
}
function makeKV() { const m = new Map(); return { async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); }, _map: m }; }
function applyMigrations(sqlite) {
  const dir = path.join(repoRoot, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f) && !/0002_/.test(f)).sort();
  for (const f of files) { try { sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) {} }
}

const worker = (await import('../../src/worker.js')).default;

function makeCtx() {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const env = { DIET_COACH_DB: makeD1(sqlite), SYNC_KV: makeKV() };
  return { env, sqlite };
}
async function call(env, method, pathname, { cookie, body } = {}) {
  const headers = {};
  if (cookie) headers['Cookie'] = cookie;
  const init = { method, headers };
  if (body !== undefined) { init.body = typeof body === 'string' ? body : JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await worker.fetch(new Request('https://x.test' + pathname, init), env, {});
  let json = null; const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch (e) {}
  return { status: res.status, json, text, setCookie: res.headers.get('set-cookie') };
}
async function mintGuest(env, sqlite) {
  const r = await call(env, 'POST', '/auth/guest', { body: {} });
  assert.strictEqual(r.status, 200, 'guest login should succeed');
  const cookie = (r.setCookie || '').split(';')[0];
  assert.ok(cookie.indexOf('=') > 0, 'guest should Set-Cookie');
  const uid = sqlite.prepare('SELECT id FROM users ORDER BY rowid DESC LIMIT 1').get().id;
  return { cookie, userId: uid };
}
function grant(sqlite, userId, days) {
  const until = new Date(); until.setUTCDate(until.getUTCDate() + days);
  sqlite.prepare("INSERT INTO memberships (user_id, plan, status, valid_from, valid_until, source, created_at, updated_at) VALUES (?, 'premium', 'active', datetime('now'), ?, 'test', datetime('now'), datetime('now')) ON CONFLICT(user_id) DO UPDATE SET plan='premium', status='active', valid_until=excluded.valid_until, updated_at=excluded.updated_at")
    .run(userId, until.toISOString());
}
function daysAgoMs(n) { return Date.now() - n * 24 * 60 * 60 * 1000; }
async function seedIns(env, cookie, records) {
  const r = await call(env, 'POST', '/api/sync', { cookie, body: { ins: records, quest: { entries: [] } } });
  assert.strictEqual(r.status, 200, 'seed sync should succeed: ' + r.text);
}

let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('✅ ' + name); } catch (e) { failed++; console.log('❌ ' + name + ' — ' + e.message); } }

// ---- tests ----
await test('unauth GET /api/review → 401', async () => {
  const { env } = makeCtx();
  const r = await call(env, 'GET', '/api/review');
  assert.strictEqual(r.status, 401);
});
await test('unauth POST /api/review → 401', async () => {
  const { env } = makeCtx();
  const r = await call(env, 'POST', '/api/review', { body: {} });
  assert.strictEqual(r.status, 401);
});
await test('authed free user → 403 premium_required', async () => {
  const { env, sqlite } = makeCtx();
  const g = await mintGuest(env, sqlite);
  const r = await call(env, 'POST', '/api/review', { cookie: g.cookie, body: {} });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.json.error, 'premium_required');
});
await test('forged frontend tier in body is ignored (free stays 403)', async () => {
  const { env, sqlite } = makeCtx();
  const g = await mintGuest(env, sqlite);
  const r = await call(env, 'POST', '/api/review', { cookie: g.cookie, body: { tier: 'premium', plan: 'premium' } });
  assert.strictEqual(r.status, 403);
});
await test('premium + insufficient data (<3 dates) → basic summary, no quota consume', async () => {
  const { env, sqlite } = makeCtx();
  const g = await mintGuest(env, sqlite); grant(sqlite, g.userId, 14);
  await seedIns(env, g.cookie, [{ id: 'r1', ts: daysAgoMs(1), crave: 'fried', st: { crave: 'fried' } }]);
  const r = await call(env, 'POST', '/api/review', { cookie: g.cookie, body: {} });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.data.review.kind, 'basic');
  assert.strictEqual(r.json.data.dataLimitation, true);
  assert.strictEqual(r.json.data.generated, false);
});
await test('premium + ≥3 distinct dates → personalized, generated, quota used 1', async () => {
  const { env, sqlite } = makeCtx();
  const g = await mintGuest(env, sqlite); grant(sqlite, g.userId, 14);
  await seedIns(env, g.cookie, [
    { id: 'a', ts: daysAgoMs(1), crave: 'fried', st: { crave: 'fried', stress_raw: 7 } },
    { id: 'b', ts: daysAgoMs(2), crave: 'fried', st: { crave: 'fried', stress_raw: 8 } },
    { id: 'c', ts: daysAgoMs(3), crave: 'sweet', st: { crave: 'sweet', stress_raw: 6 } },
  ]);
  const r = await call(env, 'POST', '/api/review', { cookie: g.cookie, body: {} });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.data.review.kind, 'personalized');
  assert.strictEqual(r.json.data.generated, true);
  assert.strictEqual(r.json.data.quota.used, 1);
  assert.ok(r.json.data.review.observation, 'should have an observation');
});
await test('idempotent: same data re-POST → cached, generated false, quota still 1', async () => {
  const { env, sqlite } = makeCtx();
  const g = await mintGuest(env, sqlite); grant(sqlite, g.userId, 14);
  const recs = [
    { id: 'a', ts: daysAgoMs(1), crave: 'fried', st: { crave: 'fried' } },
    { id: 'b', ts: daysAgoMs(2), crave: 'fried', st: { crave: 'fried' } },
    { id: 'c', ts: daysAgoMs(3), crave: 'soup', st: { crave: 'soup' } },
  ];
  await seedIns(env, g.cookie, recs);
  const r1 = await call(env, 'POST', '/api/review', { cookie: g.cookie, body: {} });
  const r2 = await call(env, 'POST', '/api/review', { cookie: g.cookie, body: {} });
  assert.strictEqual(r1.json.data.generated, true);
  assert.strictEqual(r2.json.data.generated, false);
  assert.strictEqual(r2.json.data.quota.used, 1);
});
await test('quota: 3rd distinct generation → 429 quota_exhausted', async () => {
  const { env, sqlite } = makeCtx();
  const g = await mintGuest(env, sqlite); grant(sqlite, g.userId, 14);
  // gen 1
  await seedIns(env, g.cookie, [
    { id: 'a', ts: daysAgoMs(1), crave: 'fried', st: {} }, { id: 'b', ts: daysAgoMs(2), crave: 'fried', st: {} }, { id: 'c', ts: daysAgoMs(3), crave: 'fried', st: {} },
  ]);
  await call(env, 'POST', '/api/review', { cookie: g.cookie });
  // gen 2 (new data → new key)
  await seedIns(env, g.cookie, [{ id: 'd', ts: daysAgoMs(1) + 1000, crave: 'sweet', st: {} }]);
  await call(env, 'POST', '/api/review', { cookie: g.cookie });
  // gen 3 attempt (new data again)
  await seedIns(env, g.cookie, [{ id: 'e', ts: daysAgoMs(2) + 1000, crave: 'soup', st: {} }]);
  const r3 = await call(env, 'POST', '/api/review', { cookie: g.cookie });
  assert.strictEqual(r3.status, 429);
  assert.strictEqual(r3.json.error, 'quota_exhausted');
});
await test('GET reopen returns cached review without consuming quota', async () => {
  const { env, sqlite } = makeCtx();
  const g = await mintGuest(env, sqlite); grant(sqlite, g.userId, 14);
  await seedIns(env, g.cookie, [
    { id: 'a', ts: daysAgoMs(1), crave: 'fried', st: {} }, { id: 'b', ts: daysAgoMs(2), crave: 'fried', st: {} }, { id: 'c', ts: daysAgoMs(3), crave: 'fried', st: {} },
  ]);
  await call(env, 'POST', '/api/review', { cookie: g.cookie });
  const get = await call(env, 'GET', '/api/review', { cookie: g.cookie });
  assert.strictEqual(get.status, 200);
  assert.strictEqual(get.json.data.cached, true);
  assert.ok(get.json.data.review, 'GET should return the cached review');
});
await test('expired premium → 403 (treated as free)', async () => {
  const { env, sqlite } = makeCtx();
  const g = await mintGuest(env, sqlite); grant(sqlite, g.userId, -1); // valid_until in the past
  const r = await call(env, 'POST', '/api/review', { cookie: g.cookie });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.json.error, 'premium_required');
});
await test('cross-account: B does not see A\'s report', async () => {
  const { env, sqlite } = makeCtx();
  const A = await mintGuest(env, sqlite); grant(sqlite, A.userId, 14);
  await seedIns(env, A.cookie, [
    { id: 'a', ts: daysAgoMs(1), crave: 'fried', st: {} }, { id: 'b', ts: daysAgoMs(2), crave: 'fried', st: {} }, { id: 'c', ts: daysAgoMs(3), crave: 'fried', st: {} },
  ]);
  await call(env, 'POST', '/api/review', { cookie: A.cookie });
  const B = await mintGuest(env, sqlite); grant(sqlite, B.userId, 14);
  const getB = await call(env, 'GET', '/api/review', { cookie: B.cookie });
  assert.strictEqual(getB.status, 200);
  assert.strictEqual(getB.json.data.available, false, 'B has no report of their own');
  assert.strictEqual(getB.json.data.review, null, 'B must not see A report');
});
await test('entitlement lookup failure → 503 (not a purchase prompt, not downgrade)', async () => {
  const { env, sqlite } = makeCtx();
  const g = await mintGuest(env, sqlite); grant(sqlite, g.userId, 14);
  sqlite.exec('DROP TABLE memberships'); // simulate lookup failure
  const r = await call(env, 'POST', '/api/review', { cookie: g.cookie });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.json.error, 'entitlement_unavailable');
});

console.log('\n合計：' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);

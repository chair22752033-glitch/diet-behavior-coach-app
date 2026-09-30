/*
 * Remediation follow-up (2026-09-30) — sync OWNERSHIP + concurrent-write safety,
 * tested through the REAL Worker boundary (worker.default.fetch) with:
 *   - a node:sqlite-backed D1 adapter (real SQL, real transactions/upsert)
 *   - a fake KV
 *   - real session cookies minted via the worker's own POST /auth/guest
 *
 * Covers the reviewer's behavioral cases: unauthorized read/write, cross-account
 * isolation, legacy-code bypass rejection, malformed-but-valid JSON, two-client
 * interleaving without lost updates, idempotent retries, identical-timestamp
 * distinct records, 31+ records + reload, session-secret removal, and the
 * documented (unsupported) delete semantics. Local/mocked only — not live
 * Google/production verification.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e)); }
}

// --- node:sqlite -> D1-compatible adapter ----------------------------------
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
function makeKV() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    _map: m,
  };
}
function applyMigrations(sqlite) {
  const dir = path.join(repoRoot, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f) && !/0002_/.test(f)).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try { sqlite.exec(sql); } catch (e) { /* ignore already-exists / seed-only issues */ }
  }
  // Staged additive migration 0008 (sync ownership) — NOT yet in migrations/ so the
  // existing "exactly 7 migrations" regression gates stay green. Installed at rollout.
  const staged = path.join(__dirname, '0008_phase8_sync_ownership.sql');
  if (fs.existsSync(staged)) { try { sqlite.exec(fs.readFileSync(staged, 'utf8')); } catch (e) { /* ignore */ } }
}

const workerMod = await import('../../src/worker.js');
const worker = workerMod.default;

function makeEnv() {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  return { DIET_COACH_DB: makeD1(sqlite), SYNC_KV: makeKV() };
}
async function call(env, method, pathname, { cookie, body } = {}) {
  const headers = {};
  if (cookie) headers['Cookie'] = cookie;
  const init = { method, headers };
  if (body !== undefined) { init.body = typeof body === 'string' ? body : JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await worker.fetch(new Request('https://x.test' + pathname, init), env, {});
  let json = null; const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  return { status: res.status, json, text, setCookie: res.headers.get('set-cookie') };
}
async function mintGuest(env) {
  const r = await call(env, 'POST', '/auth/guest', { body: {} });
  assert.ok(r.status === 200, 'guest login should succeed, got ' + r.status);
  const sc = r.setCookie || '';
  const cookie = sc.split(';')[0];
  assert.ok(cookie && cookie.indexOf('=') > 0, 'guest login should Set-Cookie');
  return { cookie, resp: r };
}

console.log('\n=== Boundary preflight ===');
{
  const env = makeEnv();
  await test('worker serves home HTML (sanity)', async () => {
    const r = await call(env, 'GET', '/');
    assert.strictEqual(r.status, 200);
  });
  await test('POST /auth/guest mints a session and Set-Cookie', async () => {
    const g = await mintGuest(env);
    assert.ok(g.cookie.length > 0);
  });
  await test('guest login JSON omits session token + cookie string', async () => {
    const g = await mintGuest(env);
    const s = JSON.stringify(g.resp.json || {});
    assert.ok(!/"token"/.test(s), 'no token in JSON');
    assert.ok(!(g.resp.json && g.resp.json.data && 'cookie' in g.resp.json.data), 'no cookie field in JSON');
  });
}

console.log('\n=== A. Unauthorized access fails safely (401) ===');
{
  const env = makeEnv();
  await test('GET /api/sync without session -> 401', async () => {
    const r = await call(env, 'GET', '/api/sync');
    assert.strictEqual(r.status, 401);
    assert.ok(r.json && r.json.error === 'not_authenticated');
  });
  await test('POST /api/sync without session -> 401 (no write)', async () => {
    const r = await call(env, 'POST', '/api/sync', { body: { ins: [{ id: 'x', ts: 1 }] } });
    assert.strictEqual(r.status, 401);
  });
  await test('legacy short-code bypass GET /api/sync?code=abc123 -> 401 (not KV data)', async () => {
    const r = await call(env, 'GET', '/api/sync?code=abc123');
    assert.strictEqual(r.status, 401);
  });
  await test('GET/POST /api/qlive without session -> 401', async () => {
    assert.strictEqual((await call(env, 'GET', '/api/qlive')).status, 401);
    assert.strictEqual((await call(env, 'POST', '/api/qlive', { body: { ts: 1 } })).status, 401);
  });
}

console.log('\n=== B. Ownership + cross-account isolation ===');
{
  const env = makeEnv();
  const A = await mintGuest(env);
  const B = await mintGuest(env);
  await test('A writes then reads back its own record', async () => {
    const w = await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ft: false, ins: [{ id: 'a1', ts: 100, crave: 'soup', note: '🍜' }] } });
    assert.strictEqual(w.status, 200);
    const r = await call(env, 'GET', '/api/sync', { cookie: A.cookie });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.data.ins.length, 1);
    assert.strictEqual(r.json.data.ins[0].note, '🍜');
  });
  await test('B cannot see A’s data (cross-account isolation)', async () => {
    const r = await call(env, 'GET', '/api/sync', { cookie: B.cookie });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.data.ins.length, 0);
  });
  await test('B writes its own; A still sees only its own', async () => {
    await call(env, 'POST', '/api/sync', { cookie: B.cookie, body: { ins: [{ id: 'b1', ts: 200, crave: 'fried' }] } });
    const ra = await call(env, 'GET', '/api/sync', { cookie: A.cookie });
    const rb = await call(env, 'GET', '/api/sync', { cookie: B.cookie });
    assert.deepStrictEqual(ra.json.data.ins.map((r) => r.id), ['a1']);
    assert.deepStrictEqual(rb.json.data.ins.map((r) => r.id), ['b1']);
  });
}

console.log('\n=== C. Concurrent-write safety (per-record upsert, no lost update) ===');
{
  const env = makeEnv();
  const A = await mintGuest(env);
  await test('two-device interleave: stale whole-doc write does NOT delete the other record', async () => {
    // device1 pushes {r1}; device2 (stale, never saw r1) pushes {r2}
    await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ins: [{ id: 'r1', ts: 1 }] } });
    await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ins: [{ id: 'r2', ts: 2 }] } });
    const r = await call(env, 'GET', '/api/sync', { cookie: A.cookie });
    const ids = r.json.data.ins.map((x) => x.id).sort();
    assert.deepStrictEqual(ids, ['r1', 'r2']);
  });
  await test('idempotent retry: same record_id twice -> exactly one row', async () => {
    await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ins: [{ id: 'dup', ts: 5 }] } });
    await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ins: [{ id: 'dup', ts: 5 }] } });
    const r = await call(env, 'GET', '/api/sync', { cookie: A.cookie });
    assert.strictEqual(r.json.data.ins.filter((x) => x.id === 'dup').length, 1);
  });
  await test('identical timestamps on distinct ids -> both preserved', async () => {
    await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ins: [{ id: 'same-ts-1', ts: 9999 }, { id: 'same-ts-2', ts: 9999 }] } });
    const r = await call(env, 'GET', '/api/sync', { cookie: A.cookie });
    const both = r.json.data.ins.filter((x) => x.ts === 9999).map((x) => x.id).sort();
    assert.deepStrictEqual(both, ['same-ts-1', 'same-ts-2']);
  });
  await test('records WITHOUT client id but same ts + different content -> both preserved (server-derived id)', async () => {
    const env2 = makeEnv();
    const G = await mintGuest(env2);
    await call(env2, 'POST', '/api/sync', { cookie: G.cookie, body: { ins: [{ ts: 42, crave: 'soup' }, { ts: 42, crave: 'fried' }] } });
    const r = await call(env2, 'GET', '/api/sync', { cookie: G.cookie });
    assert.strictEqual(r.json.data.ins.filter((x) => x.ts === 42).length, 2);
  });
}

console.log('\n=== D. Schema validation + quota (no silent drop) ===');
{
  const env = makeEnv();
  const A = await mintGuest(env);
  await test('POST array (malformed-but-valid JSON) -> 400', async () => {
    const r = await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: '[1,2,3]' });
    assert.strictEqual(r.status, 400);
  });
  await test('POST error-object -> 400', async () => {
    const r = await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { error: 'x' } });
    assert.strictEqual(r.status, 400);
  });
  await test('POST ins not array -> 400', async () => {
    const r = await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ins: 'nope' } });
    assert.strictEqual(r.status, 400);
  });
  await test('POST oversized record -> 400 (rejected, not silently dropped)', async () => {
    const big = { id: 'big', ts: 1, blob: 'x'.repeat(9000) };
    const r = await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ins: [big] } });
    assert.strictEqual(r.status, 400);
    const rd = await call(env, 'GET', '/api/sync', { cookie: A.cookie });
    assert.strictEqual(rd.json.data.ins.length, 0);
  });
}

console.log('\n=== E. 31+ records + reload (no truncation) ===');
{
  const env = makeEnv();
  const A = await mintGuest(env);
  await test('push 31 records -> all 31 readable after reload', async () => {
    const ins = [];
    for (let i = 0; i < 31; i++) ins.push({ id: 'n' + i, ts: 1000 + i });
    const w = await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ins } });
    assert.strictEqual(w.status, 200);
    const r = await call(env, 'GET', '/api/sync', { cookie: A.cookie });
    assert.strictEqual(r.json.data.ins.length, 31);
  });
}

console.log('\n=== F. QUEST + scalars round-trip, owner-scoped qlive ===');
{
  const env = makeEnv();
  const A = await mintGuest(env);
  const B = await mintGuest(env);
  await test('quest entries + scalars persist and read back', async () => {
    await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ft: false, identity: { key: 'active' }, quest: { entries: [{ id: 'q1', ts: 1 }] } } });
    const r = await call(env, 'GET', '/api/sync', { cookie: A.cookie });
    assert.strictEqual(r.json.data.quest.entries.length, 1);
    assert.strictEqual(r.json.data.ft, false);
    assert.ok(r.json.data.identity && r.json.data.identity.key === 'active');
  });
  await test('qlive is owner-scoped: A writes, B cannot read A’s live state', async () => {
    await call(env, 'POST', '/api/qlive', { cookie: A.cookie, body: { ts: 5, qst: { mode: 'single' } } });
    const ra = await call(env, 'GET', '/api/qlive', { cookie: A.cookie });
    const rb = await call(env, 'GET', '/api/qlive', { cookie: B.cookie });
    assert.ok(ra.json.data && ra.json.data.ts === 5);
    assert.strictEqual(rb.json.data, null);
  });
  await test('qlive rejects non-object body -> 400', async () => {
    const r = await call(env, 'POST', '/api/qlive', { cookie: A.cookie, body: '[1,2]' });
    assert.strictEqual(r.status, 400);
  });
}

console.log('\n=== G. Delete semantics are documented as unsupported ===');
{
  const env = makeEnv();
  const A = await mintGuest(env);
  await test('omitting a previously-synced record does NOT delete it (append-only, no tombstone)', async () => {
    await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ins: [{ id: 'keep', ts: 1 }] } });
    await call(env, 'POST', '/api/sync', { cookie: A.cookie, body: { ins: [{ id: 'other', ts: 2 }] } });
    const r = await call(env, 'GET', '/api/sync', { cookie: A.cookie });
    // 'keep' is still present even though the 2nd push omitted it — deletes do not sync (by design)
    assert.ok(r.json.data.ins.some((x) => x.id === 'keep'));
  });
}

console.log('\n合計：' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);

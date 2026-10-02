/*
 * Phase C｜Consent events — real Worker boundary tests.
 * worker.default.fetch + node:sqlite D1 (migration 0012) + fake KV + fake UI_ASSETS
 * serving /ui-assets/legal/*. Verifies: auth gate, grant/status, validation, append-only
 * withdraw, content-change invalidation, cross-user isolation.
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
function makeKV() { const m = new Map(); return { async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } }; }
function applyMigrations(sqlite) {
  const dir = path.join(repoRoot, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f) && !/0002_/.test(f)).sort();
  for (const f of files) { try { sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) {} }
}
// Fake UI_ASSETS: serves the legal pages; contents mutable so we can test content-change.
function makeAssets() {
  const base = path.join(repoRoot, 'public');
  const overrides = new Map();
  return {
    _override(p, text) { overrides.set(p, text); },
    async fetch(req) {
      const p = new URL(req.url).pathname;
      if (overrides.has(p)) return new Response(overrides.get(p), { status: 200 });
      try { return new Response(fs.readFileSync(path.join(base, p), 'utf8'), { status: 200 }); }
      catch { return new Response('nf', { status: 404 }); }
    },
  };
}

const worker = (await import('../../src/worker.js')).default;

function makeCtx() {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const assets = makeAssets();
  const env = { DIET_COACH_DB: makeD1(sqlite), SYNC_KV: makeKV(), UI_ASSETS: assets };
  return { env, sqlite, assets };
}
async function call(env, method, pathname, { cookie, body } = {}) {
  const headers = {};
  if (cookie) headers['Cookie'] = cookie;
  const init = { method, headers };
  if (body !== undefined) { init.body = typeof body === 'string' ? body : JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await worker.fetch(new Request('https://x.test' + pathname, init), env, {});
  let json = null; const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch (e) {}
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}
async function mintGuest(env, sqlite) {
  const r = await call(env, 'POST', '/auth/guest', { body: {} });
  assert.strictEqual(r.status, 200, 'guest login should succeed');
  const cookie = (r.setCookie || '').split(';')[0];
  const uid = sqlite.prepare('SELECT id FROM users ORDER BY rowid DESC LIMIT 1').get().id;
  return { cookie, userId: uid };
}

let pass = 0, fail = 0; const fails = [];
function ok(c, n) { if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } }

async function main() {
  const { env, sqlite, assets } = makeCtx();

  // 1. auth gate
  let r = await call(env, 'POST', '/api/consent', { body: { purpose: 'free_trial', docType: 'intent', action: 'granted' } });
  ok(r.status === 401, 'POST /api/consent without login -> 401');
  r = await call(env, 'GET', '/api/consent/status?purpose=free_trial&type=intent');
  ok(r.status === 401, 'GET status without login -> 401');

  const a = await mintGuest(env, sqlite);

  // 2. grant + status
  r = await call(env, 'POST', '/api/consent', { cookie: a.cookie, body: { purpose: 'free_trial', docType: 'intent', action: 'granted' } });
  ok(r.status === 200 && r.json && r.json.ok && r.json.eventId, 'grant consent -> 200 + eventId');
  r = await call(env, 'GET', '/api/consent/status?purpose=free_trial&type=intent', { cookie: a.cookie });
  ok(r.status === 200 && r.json.active === true, 'status active after grant');

  // 3. validation
  ok((await call(env, 'POST', '/api/consent', { cookie: a.cookie, body: { purpose: 'x', docType: 'nope', action: 'granted' } })).status === 400, 'unknown docType -> 400');
  ok((await call(env, 'POST', '/api/consent', { cookie: a.cookie, body: { purpose: 'x', docType: 'intent', action: 'bogus' } })).status === 400, 'bad action -> 400');
  ok((await call(env, 'POST', '/api/consent', { cookie: a.cookie, body: { docType: 'intent', action: 'granted' } })).status === 400, 'missing purpose -> 400');

  // 4. append-only withdraw
  r = await call(env, 'POST', '/api/consent', { cookie: a.cookie, body: { purpose: 'free_trial', docType: 'intent', action: 'withdrawn' } });
  ok(r.status === 200 && r.json.ok, 'withdraw recorded');
  r = await call(env, 'GET', '/api/consent/status?purpose=free_trial&type=intent', { cookie: a.cookie });
  ok(r.json.active === false && r.json.reason === 'withdrawn', 'status inactive after withdraw');
  const rows = sqlite.prepare("SELECT action FROM consent_events WHERE user_id = ? AND purpose='free_trial' ORDER BY seq").all(a.userId).map((x) => x.action);
  ok(rows.length === 2 && rows[0] === 'granted' && rows[1] === 'withdrawn', 'both rows retained (append-only)');

  // 5. content-change invalidates a prior grant
  const b = await mintGuest(env, sqlite);
  await call(env, 'POST', '/api/consent', { cookie: b.cookie, body: { purpose: 'accept_terms', docType: 'terms', action: 'granted' } });
  ok((await call(env, 'GET', '/api/consent/status?purpose=accept_terms&type=terms', { cookie: b.cookie })).json.active === true, 'terms consent active');
  assets._override('/ui-assets/legal/terms.html', '<html>edited terms v2</html>'); // simulate doc text changed
  r = await call(env, 'GET', '/api/consent/status?purpose=accept_terms&type=terms', { cookie: b.cookie });
  ok(r.json.active === false && r.json.reason === 'content_changed', 'edited document invalidates prior consent');

  // 6. cross-user isolation
  const c = await mintGuest(env, sqlite);
  ok((await call(env, 'GET', '/api/consent/status?purpose=free_trial&type=intent', { cookie: c.cookie })).json.active === false, 'new user has no consent');

  // 7. history endpoint
  r = await call(env, 'GET', '/api/consent/history', { cookie: a.cookie });
  ok(r.status === 200 && r.json.ok && r.json.events.length === 2, 'history returns user own events');

  console.log('\n──────────────────────────────');
  console.log('consent boundary: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });

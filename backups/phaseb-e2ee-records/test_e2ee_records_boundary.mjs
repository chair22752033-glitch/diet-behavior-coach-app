/*
 * Phase B（E2EE 第 3 步・第一塊）｜/api/e2ee/records — real Worker boundary tests.
 * worker.default.fetch + node:sqlite D1 (migration 0014). Verifies auth gate, ciphertext-only
 * store, list, CAS/idempotency, validation, cross-user isolation, and that the plaintext
 * /api/sync path is unaffected.
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
      _run() { const s = sqlite.prepare(sql); const i = s.run(...params); return { success: true, meta: { changes: i.changes, last_row_id: Number(i.lastInsertRowid || 0) } }; },
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
const worker = (await import('../../src/worker.js')).default;
function ctx() { const sqlite = new DatabaseSync(':memory:'); applyMigrations(sqlite); return { env: { DIET_COACH_DB: makeD1(sqlite), SYNC_KV: makeKV() }, sqlite }; }
async function call(env, method, p, { cookie, body } = {}) {
  const headers = {}; if (cookie) headers['Cookie'] = cookie;
  const init = { method, headers }; if (body !== undefined) { init.body = typeof body === 'string' ? body : JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await worker.fetch(new Request('https://x.test' + p, init), env, {});
  let json = null; const t = await res.text(); try { json = t ? JSON.parse(t) : null; } catch (e) {}
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}
async function guest(env, sqlite) { const r = await call(env, 'POST', '/auth/guest', { body: {} }); assert.strictEqual(r.status, 200); return { cookie: (r.setCookie || '').split(';')[0], uid: sqlite.prepare('SELECT id FROM users ORDER BY rowid DESC LIMIT 1').get().id }; }

const JWE = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE'].join('.');
const JWE2 = ['AAAA', 'BBBB', 'CCCC', 'DDDX', 'EEEE'].join('.');
let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } };

async function main() {
  const { env, sqlite } = ctx();

  ok((await call(env, 'GET', '/api/e2ee/records')).status === 401, 'GET without login -> 401');
  ok((await call(env, 'POST', '/api/e2ee/records', { body: { kind: 'ins', recordId: 'a', revisionId: 'r1', envelope: JWE } })).status === 401, 'POST without login -> 401');

  const a = await guest(env, sqlite);

  let r = await call(env, 'POST', '/api/e2ee/records', { cookie: a.cookie, body: { kind: 'ins', recordId: 'a', baseRevision: null, revisionId: 'r1', envelope: JWE } });
  ok(r.status === 200 && r.json.ok, 'store ciphertext record -> 200');

  ok((await call(env, 'POST', '/api/e2ee/records', { cookie: a.cookie, body: { kind: 'ins', recordId: 'b', baseRevision: null, revisionId: 'r1', envelope: '{"crave":"fried"}' } })).json.error === 'not_ciphertext', 'plaintext payload refused');
  ok((await call(env, 'POST', '/api/e2ee/records', { cookie: a.cookie, body: { kind: 'nope', recordId: 'c', revisionId: 'r1', envelope: JWE } })).status === 400, 'bad kind -> 400');

  // CAS
  ok((await call(env, 'POST', '/api/e2ee/records', { cookie: a.cookie, body: { kind: 'ins', recordId: 'a', baseRevision: 'WRONG', revisionId: 'r2', envelope: JWE2 } })).status === 409, 'stale baseRevision -> 409');
  ok((await call(env, 'POST', '/api/e2ee/records', { cookie: a.cookie, body: { kind: 'ins', recordId: 'a', baseRevision: 'r1', revisionId: 'r2', envelope: JWE2 } })).json.ok === true, 'correct baseRevision updates');
  ok((await call(env, 'POST', '/api/e2ee/records', { cookie: a.cookie, body: { kind: 'ins', recordId: 'a', baseRevision: 'r1', revisionId: 'r2', envelope: JWE2 } })).json.idempotent === true, 'idempotent replay');

  // list
  r = await call(env, 'GET', '/api/e2ee/records?kind=ins', { cookie: a.cookie });
  ok(r.status === 200 && r.json.records.length === 1 && r.json.records[0].envelope === JWE2, 'list returns ciphertext records');

  // cross-user isolation
  const b = await guest(env, sqlite);
  ok((await call(env, 'GET', '/api/e2ee/records', { cookie: b.cookie })).json.records.length === 0, 'different user sees no records');

  // plaintext /api/sync still works and is independent
  r = await call(env, 'POST', '/api/sync', { cookie: b.cookie, body: { ins: [{ id: 'x', ts: 1 }], quest: { entries: [] } } });
  ok(r.status === 200 && r.json.ok, 'existing plaintext /api/sync still works (unaffected)');
  r = await call(env, 'GET', '/api/sync', { cookie: b.cookie });
  ok(r.status === 200 && r.json.data && Array.isArray(r.json.data.ins), 'plaintext sync read unaffected');

  console.log('\n──────────────────────────────');
  console.log('e2ee records boundary: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });

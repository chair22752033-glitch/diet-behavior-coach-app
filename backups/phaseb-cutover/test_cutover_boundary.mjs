/*
 * Phase B（E2EE 第 4 步）｜cutover / cleanup / rollback + /api/sync lock — real Worker boundary.
 * worker.default.fetch + node:sqlite. Verifies the full, guarded, mostly-reversible cutover.
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
function applyMigrations(sqlite) { const dir = path.join(repoRoot, 'migrations'); for (const f of fs.readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f) && !/0002_/.test(f)).sort()) { try { sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) {} } }
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

const VAULT = { vaultId: 'v_cut1', recoverySalt: btoa('0123456789012345'), wrappedVkRecovery: btoa('x'.repeat(40)), format: 'dms-e2ee-1', epoch: 1 };
const JWE = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE'].join('.');
let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } };

async function main() {
  const { env, sqlite } = ctx();
  const a = await guest(env, sqlite);

  ok((await call(env, 'POST', '/api/e2ee/cutover', { body: {} })).status === 401, 'cutover without login -> 401');

  // seed plaintext + vault
  ok((await call(env, 'POST', '/api/sync', { cookie: a.cookie, body: { ins: [{ id: 'p1', ts: 1 }], quest: { entries: [] } } })).json.ok, 'seed plaintext sync');
  ok((await call(env, 'POST', '/api/vault', { cookie: a.cookie, body: VAULT })).json.ok, 'create vault');

  ok((await call(env, 'POST', '/api/e2ee/cutover', { cookie: a.cookie, body: {} })).json.error === 'confirm_required', 'cutover needs confirm');
  ok((await call(env, 'POST', '/api/e2ee/cutover', { cookie: a.cookie, body: { confirm: true } })).json.error === 'nothing_migrated', 'cutover refused before any ciphertext migrated');

  // migrate a ciphertext record
  ok((await call(env, 'POST', '/api/e2ee/records', { cookie: a.cookie, body: { kind: 'ins', recordId: 'p1', baseRevision: null, revisionId: 'r1', envelope: JWE } })).json.ok, 'migrate one ciphertext record');

  // cutover
  let r = await call(env, 'POST', '/api/e2ee/cutover', { cookie: a.cookie, body: { confirm: true } });
  ok(r.json.ok && r.json.crypto_mode === 'e2ee_only', 'cutover -> e2ee_only');
  ok((await call(env, 'GET', '/api/vault', { cookie: a.cookie })).json.vault.crypto_mode === 'e2ee_only', 'vault crypto_mode persisted e2ee_only');

  // plaintext sync now locked
  ok((await call(env, 'POST', '/api/sync', { cookie: a.cookie, body: { ins: [{ id: 'p2', ts: 2 }], quest: { entries: [] } } })).json.error === 'e2ee_locked', 'plaintext /api/sync POST locked after cutover');

  // rollback allowed while plaintext present
  ok((await call(env, 'POST', '/api/e2ee/rollback', { cookie: a.cookie, body: { confirm: true } })).json.ok, 'rollback -> vault_created (plaintext still present)');
  ok((await call(env, 'POST', '/api/sync', { cookie: a.cookie, body: { ins: [{ id: 'p2', ts: 2 }], quest: { entries: [] } } })).json.ok, 'plaintext sync works again after rollback');

  // cutover again, then cleanup
  ok((await call(env, 'POST', '/api/e2ee/cutover', { cookie: a.cookie, body: { confirm: true } })).json.ok, 're-cutover -> e2ee_only');
  r = await call(env, 'POST', '/api/e2ee/cleanup', { cookie: a.cookie, body: { confirm: true } });
  ok(r.json.ok && r.json.deleted >= 1, 'cleanup deletes plaintext (' + (r.json && r.json.deleted) + ')');
  ok(sqlite.prepare('SELECT COUNT(*) c FROM sync_records WHERE user_id = ?').get(a.uid).c === 0, 'no plaintext sync_records remain');
  // ciphertext still there
  ok((await call(env, 'GET', '/api/e2ee/records', { cookie: a.cookie })).json.records.length === 1, 'ciphertext records intact after cleanup');
  // rollback after cleanup refused
  ok((await call(env, 'POST', '/api/e2ee/rollback', { cookie: a.cookie, body: { confirm: true } })).json.error === 'plaintext_already_cleaned', 'rollback refused after cleanup');

  // cross-user: fresh guest has no vault
  const b = await guest(env, sqlite);
  ok((await call(env, 'POST', '/api/e2ee/cutover', { cookie: b.cookie, body: { confirm: true } })).json.error === 'no_vault', 'other user cutover -> no_vault');

  console.log('\n──────────────────────────────');
  console.log('cutover boundary: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });

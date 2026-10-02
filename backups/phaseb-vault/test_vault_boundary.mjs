/*
 * Phase B（E2EE 第 1 步）｜/api/vault — real Worker boundary tests.
 * worker.default.fetch + node:sqlite D1 (migration 0013). Verifies auth gate,
 * create/get, single-vault (409), input validation, cross-user isolation.
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
async function guest(env, sqlite) { const r = await call(env, 'POST', '/auth/guest', { body: {} }); assert.strictEqual(r.status, 200); return (r.setCookie || '').split(';')[0]; }

const GOOD = { vaultId: 'v_abc123def', recoverySalt: btoa('0123456789012345'), wrappedVkRecovery: btoa('x'.repeat(40)), format: 'dms-e2ee-1', epoch: 1 };
let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } };

async function main() {
  const { env, sqlite } = ctx();

  ok((await call(env, 'GET', '/api/vault')).status === 401, 'GET without login -> 401');
  ok((await call(env, 'POST', '/api/vault', { body: GOOD })).status === 401, 'POST without login -> 401');

  const c = await guest(env, sqlite);
  let r = await call(env, 'GET', '/api/vault', { cookie: c });
  ok(r.status === 200 && r.json.exists === false, 'GET before create -> exists:false');

  r = await call(env, 'POST', '/api/vault', { cookie: c, body: GOOD });
  ok(r.status === 200 && r.json.ok, 'create vault -> 200');

  r = await call(env, 'GET', '/api/vault', { cookie: c });
  ok(r.status === 200 && r.json.exists === true && r.json.vault.vault_id === 'v_abc123def', 'GET after create returns vault');
  ok(r.json.vault.wrapped_vk_recovery === GOOD.wrappedVkRecovery && r.json.vault.crypto_mode === 'vault_created', 'vault fields + crypto_mode=vault_created');

  r = await call(env, 'POST', '/api/vault', { cookie: c, body: GOOD });
  ok(r.status === 409 && r.json.error === 'vault_exists', 'second create -> 409 vault_exists (no silent overwrite)');

  // validation
  ok((await call(env, 'POST', '/api/vault', { cookie: c, body: { ...GOOD, recoverySalt: '!!notb64!!' } })).status === 400, 'bad salt -> 400');
  const c2 = await guest(env, sqlite);
  ok((await call(env, 'POST', '/api/vault', { cookie: c2, body: { ...GOOD, epoch: 0 } })).status === 400, 'bad epoch -> 400');
  ok((await call(env, 'POST', '/api/vault', { cookie: c2, body: { vaultId: 'v_x' } })).status === 400, 'missing fields -> 400');

  // cross-user isolation: c2 has no vault yet
  ok((await call(env, 'GET', '/api/vault', { cookie: c2 })).json.exists === false, 'different user has no vault');

  console.log('\n──────────────────────────────');
  console.log('vault boundary: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });

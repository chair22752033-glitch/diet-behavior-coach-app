/*
 * Remediation client-side behavior tests (updated 2026-09-30 for session-owned sync).
 *
 * Extracts the real client sync helpers from the getHTML() inline script and
 * exercises them with a mock fetch + mock localStorage. Covers: shape validation,
 * non-destructive merge (no data loss), cloudPull preserving local data on every
 * failure/authless case, sd() reporting local-write failure, plus source-level
 * assertions for the auth/sync/truncation fixes. Server ownership/consistency is
 * covered by test_sync_ownership_boundary.mjs (real Worker boundary).
 * Local/mocked only — not live Google/production verification.
 */
import fs from 'node:fs';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const workerSrc = fs.readFileSync(path.join(repoRoot, 'src/worker.js'), 'utf8');
const authRoutesSrc = fs.readFileSync(path.join(repoRoot, 'src/routes/auth_routes.js'), 'utf8');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.message)); }
}

function emittedHtml() {
  const s = workerSrc.indexOf('function getHTML(){return [');
  const a = s + 'function getHTML(){return '.length;
  const j = workerSrc.indexOf("].join('\\n');", a);
  const arr = new Function('return ' + workerSrc.slice(a, j + 1))();
  return arr.join('\n');
}
function inlineScript() {
  const html = emittedHtml();
  let scripts = [], i = 0;
  while (true) { const x = html.indexOf('<script', i); if (x === -1) break; const g = html.indexOf('>', x); const e = html.indexOf('</script>', g); scripts.push(html.slice(g + 1, e)); i = e + 1; }
  return scripts[1];
}
function extractFn(js, name) {
  const sig = 'function ' + name + '(';
  const start = js.indexOf(sig);
  if (start === -1) throw new Error('function not found: ' + name);
  let i = js.indexOf('{', start), depth = 0;
  for (; i < js.length; i++) { if (js[i] === '{') depth++; else if (js[i] === '}') { depth--; if (depth === 0) { i++; break; } } }
  return js.slice(start, i);
}
function makeSandbox(initialLocal, fetchImpl, syncOn) {
  const store = Object.assign({}, initialLocal);
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { if (store.__throwOnSet) throw new Error('quota'); store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const js = inlineScript();
  const fns = ['ld', 'sd', 'isSyncShape', 'recKey', 'mergeRecords', 'mergeData', 'cloudPush', 'cloudPull']
    .map((n) => extractFn(js, n)).join('\n');
  const preamble = 'var SYNC_ON=' + (syncOn ? 'true' : 'false') + ';';
  const api = new Function('localStorage', 'fetch', 'SK', preamble + fns + '\nreturn {ld,sd,isSyncShape,recKey,mergeRecords,mergeData,cloudPush,cloudPull,setSyncOn:function(v){SYNC_ON=v;}};')(localStorage, fetchImpl, 'diet_app_v1');
  api.__store = store;
  return api;
}
function mockFetch(response) {
  return function () {
    if (response === 'reject') return Promise.reject(new Error('offline'));
    return Promise.resolve({
      ok: response.ok,
      status: response.status || (response.ok ? 200 : 400),
      json: () => Promise.resolve(response.json),
      text: () => Promise.resolve(JSON.stringify(response.json)),
    });
  };
}
const delay = () => new Promise((r) => setTimeout(r, 5));

console.log('\n=== A. Client sync shape validation ===');
{
  const api = makeSandbox({}, mockFetch({ ok: true, json: { ok: true, data: { ins: [] } } }), true);
  test('isSyncShape accepts valid {ins:[]}', () => assert.ok(api.isSyncShape({ ins: [] })));
  test('isSyncShape rejects error object', () => assert.ok(!api.isSyncShape({ error: 'x' })));
  test('isSyncShape rejects array', () => assert.ok(!api.isSyncShape([1])));
  test('isSyncShape rejects null', () => assert.ok(!api.isSyncShape(null)));
  test('isSyncShape rejects ins non-array', () => assert.ok(!api.isSyncShape({ ins: 'x' })));
}

console.log('\n=== B. Two-device merge (no data loss) ===');
{
  const api = makeSandbox({}, mockFetch({ ok: true, json: { ok: true, data: { ins: [] } } }), true);
  const merged = api.mergeData({ ft: false, ins: [{ id: 'a', ts: 100, note: '🍜' }] }, { ins: [{ id: 'b', ts: 200 }] });
  test('merge keeps both records', () => assert.strictEqual(merged.ins.length, 2));
  test('merge newest-first', () => assert.deepStrictEqual(merged.ins.map((r) => r.ts), [200, 100]));
  test('merge preserves user emoji note', () => assert.strictEqual(merged.ins.find((r) => r.id === 'a').note, '🍜'));
  test('merge dedups by id', () => assert.strictEqual(api.mergeData({ ins: [{ id: 'x', ts: 1 }] }, { ins: [{ id: 'x', ts: 1 }] }).ins.length, 1));
  test('merge unions quest.entries', () => assert.strictEqual(api.mergeData({ ins: [], quest: { entries: [{ id: 'q1', ts: 1 }] } }, { ins: [], quest: { entries: [{ id: 'q2', ts: 2 }] } }).quest.entries.length, 2));
  test('merge never overwrites existing local scalar', () => assert.strictEqual(api.mergeData({ ins: [], identity: { key: 'local' } }, { ins: [], identity: { key: 'remote' } }).identity.key, 'local'));
}

console.log('\n=== C. cloudPull non-destructive (session-based) ===');
async function pullCase(name, local, fetchResp, syncOn, expect) {
  const api = makeSandbox(local, mockFetch(fetchResp), syncOn);
  const before = api.__store['diet_app_v1'];
  const ok = await new Promise((res) => api.cloudPull(res));
  await delay();
  const after = api.__store['diet_app_v1'];
  if (expect.cb !== undefined) test(name + ' -> cb=' + expect.cb, () => assert.strictEqual(ok, expect.cb));
  if (expect.unchanged) test(name + ' -> local unchanged', () => assert.strictEqual(after, before));
  if (expect.mergedCount !== undefined) test(name + ' -> merged ' + expect.mergedCount, () => assert.strictEqual(JSON.parse(after).ins.length, expect.mergedCount));
}
{
  const local = { 'diet_app_v1': JSON.stringify({ ft: false, ins: [{ id: 'l1', ts: 1 }] }) };
  await pullCase('not logged in (SYNC_ON=false)', { ...local }, { ok: true, json: { ok: true, data: { ins: [] } } }, false, { cb: false, unchanged: true });
  await pullCase('HTTP 401', { ...local }, { ok: false, status: 401, json: { ok: false } }, true, { cb: false, unchanged: true });
  await pullCase('HTTP 500', { ...local }, { ok: false, status: 500, json: { ok: false } }, true, { cb: false, unchanged: true });
  await pullCase('200 body.ok=false', { ...local }, { ok: true, json: { ok: false, error: 'x' } }, true, { cb: false, unchanged: true });
  await pullCase('200 invalid data shape', { ...local }, { ok: true, json: { ok: true, data: { error: 'x' } } }, true, { cb: false, unchanged: true });
  await pullCase('offline', { ...local }, 'reject', true, { cb: false, unchanged: true });
  await pullCase('200 valid remote merges', { ...local }, { ok: true, json: { ok: true, data: { ins: [{ id: 'r1', ts: 2 }] } } }, true, { cb: true, mergedCount: 2 });
}

console.log('\n=== D. sd() reports local-write failure ===');
{
  const okApi = makeSandbox({}, mockFetch({ ok: true, json: { ok: true, data: { ins: [] } } }), false);
  test('sd returns true on success', () => assert.strictEqual(okApi.sd({ ins: [] }), true));
  const badApi = makeSandbox({ __throwOnSet: true }, mockFetch({ ok: true, json: { ok: true, data: { ins: [] } } }), false);
  test('sd returns false when localStorage throws', () => assert.strictEqual(badApi.sd({ ins: [] }), false));
}

console.log('\n=== E. Source-level fixes present ===');
{
  test('auth: POST /auth/provider(/upgrade) blocked with explicit failure', () => {
    assert.ok(workerSrc.includes('direct_provider_login_disabled'));
  });
  test('sync: session-owned dispatch resolves owner from session (getCurrentUser)', () => {
    assert.ok(workerSrc.includes("syncPath === '/api/sync'"));
    assert.ok(workerSrc.includes('getCurrentUser(app.db'));
    assert.ok(workerSrc.includes('pushSyncDoc(app.db.raw'));
    assert.ok(workerSrc.includes("error: 'not_authenticated'"));
  });
  test('sync: legacy anonymous short-code KV path disabled (fail closed)', () => {
    assert.ok(workerSrc.includes('legacy_sync_disabled'));
    assert.ok(workerSrc.includes('legacy_qlive_disabled'));
    assert.ok(!workerSrc.includes("var key='sync:'+code"));
  });
  test('client: sync is session-gated (SYNC_ON), no user-chosen code', () => {
    assert.ok(workerSrc.includes('var SYNC_ON=false;'));
    assert.ok(!workerSrc.includes('/api/sync?code='));
    assert.ok(!workerSrc.includes('/api/qlive?code='));
  });
  test('client: new records carry stable id (uid)', () => {
    assert.ok(workerSrc.includes('data.ins.unshift({id:uid()'));
    assert.ok(workerSrc.includes('data.quest.entries.unshift({id:uid()'));
  });
  test('persistence: 30-record silent truncation removed', () => {
    assert.ok(!workerSrc.includes('data.ins=data.ins.slice(0,30)'));
    assert.ok(!workerSrc.includes('data.quest.entries=data.quest.entries.slice(0,30)'));
  });
  test('withSetCookie strips cookie + session.token from JSON body', () => {
    assert.ok(authRoutesSrc.includes("if (k === 'cookie') continue;"));
    assert.ok(authRoutesSrc.includes("if (sk === 'token') continue;"));
  });
  test('Google OAuth start/callback preserved', () => {
    assert.ok(workerSrc.includes("pathname === '/auth/google/start'"));
    assert.ok(workerSrc.includes("pathname === '/auth/google/callback'"));
  });
}

console.log('\n合計：' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);

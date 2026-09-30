/*
 * Remediation behavior tests (2026-09-30) — auth trust boundary + sync data integrity.
 *
 * Scope: reproduce the reviewed findings and verify the fixes without touching
 * production. Client sync helpers are extracted from the real getHTML() inline
 * script and exercised against a mock localStorage + mock fetch. Server/auth
 * behaviour is asserted at source level here and verified live via curl on the
 * dev server (see report_security_remediation.md). Local/mocked only — not a
 * production verification.
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

// --- Reconstruct the emitted client JS (2nd <script>) -----------------------
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
  while (true) {
    const x = html.indexOf('<script', i); if (x === -1) break;
    const g = html.indexOf('>', x); const e = html.indexOf('</script>', g);
    scripts.push(html.slice(g + 1, e)); i = e + 1;
  }
  return scripts[1];
}
function extractFn(js, name) {
  const sig = 'function ' + name + '(';
  const start = js.indexOf(sig);
  if (start === -1) throw new Error('function not found: ' + name);
  let i = js.indexOf('{', start), depth = 0;
  for (; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return js.slice(start, i);
}

// --- Build a sandbox exposing the real sync helpers -------------------------
function makeSandbox(initialLocal, fetchImpl) {
  const store = Object.assign({}, initialLocal);
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      if (store.__throwOnSet) throw new Error('quota');
      store[k] = String(v);
    },
    removeItem: (k) => { delete store[k]; },
  };
  const js = inlineScript();
  const fns = ['ld', 'sd', 'getSyncCode', 'setSyncCode', 'isSyncShape', 'recKey', 'mergeRecords', 'mergeData', 'cloudPush', 'cloudPull']
    .map((n) => extractFn(js, n)).join('\n');
  const api = new Function('localStorage', 'fetch', 'SK', 'SCK', fns + '\nreturn {ld,sd,getSyncCode,setSyncCode,isSyncShape,recKey,mergeRecords,mergeData,cloudPush,cloudPull};')(localStorage, fetchImpl, 'diet_app_v1', 'diet_sync_code');
  api.__store = store;
  return api;
}
function mockFetch(response) {
  // response: {ok, text} or throws
  return function () {
    if (response === 'reject') return Promise.reject(new Error('offline'));
    return Promise.resolve({
      ok: response.ok,
      status: response.status || (response.ok ? 200 : 400),
      text: () => Promise.resolve(response.text),
      json: () => Promise.resolve(JSON.parse(response.text)),
    });
  };
}
const delay = () => new Promise((r) => setTimeout(r, 5));

console.log('\n=== A. Client sync shape validation ===');
{
  const api = makeSandbox({}, mockFetch({ ok: true, text: 'null' }));
  test('isSyncShape accepts a valid {ins:[]} object', () => assert.ok(api.isSyncShape({ ins: [] })));
  test('isSyncShape rejects an error object', () => assert.ok(!api.isSyncShape({ error: 'invalid code' })));
  test('isSyncShape rejects an array', () => assert.ok(!api.isSyncShape([1, 2])));
  test('isSyncShape rejects null', () => assert.ok(!api.isSyncShape(null)));
  test('isSyncShape accepts object without ins', () => assert.ok(api.isSyncShape({ ft: false })));
  test('isSyncShape rejects ins that is not an array', () => assert.ok(!api.isSyncShape({ ins: 'x' })));
}

console.log('\n=== B. Two-device merge (no data loss) ===');
{
  const api = makeSandbox({}, mockFetch({ ok: true, text: 'null' }));
  const A = { ft: false, ins: [{ ts: 100, crave: 'soup', note: '昔天 🍜' }] };
  const B = { ft: false, ins: [{ ts: 200, crave: 'fried' }] };
  const merged = api.mergeData(A, B);
  test('merge keeps both devices’ records', () => assert.strictEqual(merged.ins.length, 2));
  test('merge is newest-first by ts', () => assert.deepStrictEqual(merged.ins.map((r) => r.ts), [200, 100]));
  test('merge preserves user note + emoji verbatim', () => assert.strictEqual(merged.ins.find((r) => r.ts === 100).note, '昔天 🍜'));
  const dup = api.mergeData({ ins: [{ ts: 100, v: 'a' }] }, { ins: [{ ts: 100, v: 'b' }] });
  test('merge dedups by ts (no duplicate 100)', () => assert.strictEqual(dup.ins.length, 1));
  const q = api.mergeData({ ins: [], quest: { entries: [{ ts: 1 }] } }, { ins: [], quest: { entries: [{ ts: 2 }] } });
  test('merge unions quest.entries too', () => assert.strictEqual(q.quest.entries.length, 2));
  const scal = api.mergeData({ ins: [], ft: false, identity: { key: 'local' } }, { ins: [], identity: { key: 'remote' }, extra: 'x' });
  test('merge never overwrites an existing local scalar', () => assert.strictEqual(scal.identity.key, 'local'));
  test('merge fills a missing scalar from remote (additive)', () => assert.strictEqual(scal.extra, 'x'));
}

console.log('\n=== C. cloudPull is non-destructive on failure ===');
async function pullCase(name, initialLocal, resp, expect) {
  const api = makeSandbox(initialLocal, mockFetch(resp));
  const before = api.__store['diet_app_v1'];
  const ok = await new Promise((res) => api.cloudPull(res));
  await delay();
  const after = api.__store['diet_app_v1'];
  if (expect.cb !== undefined) test(name + ' → cb=' + expect.cb, () => assert.strictEqual(ok, expect.cb));
  if (expect.unchanged) test(name + ' → local data unchanged', () => assert.strictEqual(after, before));
  if (expect.mergedCount !== undefined) test(name + ' → local now has ' + expect.mergedCount + ' records', () => assert.strictEqual(JSON.parse(after).ins.length, expect.mergedCount));
}
{
  const local = { 'diet_app_v1': JSON.stringify({ ft: false, ins: [{ ts: 1, crave: 'soup' }] }), 'diet_sync_code': 'abc' };
  await pullCase('HTTP 400', { ...local }, { ok: false, status: 400, text: '{"error":"invalid code"}' }, { cb: false, unchanged: true });
  await pullCase('HTTP 500', { ...local }, { ok: false, status: 500, text: 'server error' }, { cb: false, unchanged: true });
  await pullCase('200 but error object', { ...local }, { ok: true, text: '{"error":"nope"}' }, { cb: false, unchanged: true });
  await pullCase('200 but malformed JSON', { ...local }, { ok: true, text: '{not json' }, { cb: false, unchanged: true });
  await pullCase('offline (fetch rejects)', { ...local }, 'reject', { cb: false, unchanged: true });
  await pullCase('200 null (first device seeds)', { ...local }, { ok: true, text: 'null' }, { cb: true, unchanged: true });
  await pullCase('200 valid remote merges', { ...local }, { ok: true, text: JSON.stringify({ ft: false, ins: [{ ts: 2, crave: 'fried' }] }) }, { cb: true, mergedCount: 2 });
}

console.log('\n=== D. sd() reports local-write failure ===');
{
  const okApi = makeSandbox({ 'diet_sync_code': '' }, mockFetch({ ok: true, text: 'null' }));
  test('sd returns true on successful local write', () => assert.strictEqual(okApi.sd({ ins: [] }), true));
  const badApi = makeSandbox({ __throwOnSet: true, 'diet_sync_code': '' }, mockFetch({ ok: true, text: 'null' }));
  test('sd returns false when localStorage.setItem throws', () => assert.strictEqual(badApi.sd({ ins: [] }), false));
}

console.log('\n=== E. Source-level fixes present ===');
{
  test('worker blocks POST /auth/provider(/upgrade) with explicit failure', () => {
    assert.ok(workerSrc.includes("direct_provider_login_disabled"));
    assert.ok(/pathname === '\/auth\/provider' \|\| pathname === '\/auth\/provider\/upgrade'/.test(workerSrc));
  });
  test('worker no longer forwards /auth/provider to the router in the guest branch', () => {
    assert.ok(workerSrc.includes("if (method === 'POST' && pathname === '/auth/guest')"));
    assert.ok(!/'\/auth\/guest' \|\| pathname === '\/auth\/provider'/.test(workerSrc));
  });
  test('server validates JSON before writing sync/qlive KV', () => {
    assert.ok((workerSrc.match(/invalid json/g) || []).length >= 2);
  });
  test('30-record silent truncation removed for check-ins and QUEST', () => {
    assert.ok(!workerSrc.includes('data.ins=data.ins.slice(0,30)'));
    assert.ok(!workerSrc.includes('data.quest.entries=data.quest.entries.slice(0,30)'));
  });
  test('withSetCookie strips cookie + session.token from JSON body', () => {
    assert.ok(authRoutesSrc.includes("if (k === 'cookie') continue;"));
    assert.ok(authRoutesSrc.includes("if (sk === 'token') continue;"));
  });
  test('Google OAuth start/callback path preserved', () => {
    assert.ok(workerSrc.includes("pathname === '/auth/google/start'"));
    assert.ok(workerSrc.includes("pathname === '/auth/google/callback'"));
    assert.ok(authRoutesSrc.includes('buildGoogleCallbackResponse'));
  });
}

console.log('\n=== F. 30→31 persistence (buildResult keeps all) ===');
{
  // buildResult unshifts then sd(); with truncation removed, N+1 records persist.
  const br = extractFn(inlineScript(), 'buildResult');
  test('buildResult no longer slices ins to 30', () => assert.ok(!/slice\(0,\s*30\)/.test(br)));
}

console.log('\n合計：' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);

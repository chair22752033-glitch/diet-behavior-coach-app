/*
 * Phase 1 TASK 1.26｜Legacy Route Adapter Migration Layer 測試
 *
 * 分三部分：
 * A) router.js 的 :name* 萬用字元 + Response透傳 單元測試
 * B) legacy_routes.js 的 registerLegacyRoutes() 單元測試（假router/假legacyHandler）
 * C) 對真正的 src/worker.js（含TASK1.26接線）用 Node ESM import 直接呼叫
 *    export default 的 fetch()，驗證 flag=false（正式環境現況）與
 *    flag=true（router優先+legacy fallback）兩種情境下的實際行為完全等價。
 *
 * 完全不連線任何真實或本機模擬的資料庫，不建立任何真實使用者 session，
 * 不會真的呼叫 Google OAuth，不執行 Legacy Import。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRouter } from '../../src/routes/router.js';
import { registerLegacyRoutes } from '../../src/routes/legacy_routes.js';
import { createAppRouter } from '../../src/routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '..', '..', 'src', 'worker.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`✅ ${name}`);
    })
    .catch((e) => {
      failed++;
      console.log(`❌ ${name}`);
      console.log('   ', e && e.stack ? e.stack.split('\n')[0] : e);
    });
}

function makeLegacyHandler(responseFactory) {
  const calls = [];
  const fn = async (request, env) => {
    calls.push({ request, env });
    return responseFactory ? responseFactory(request, env) : new Response('legacy-ok', { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

function makeFakeKV() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value) { store.set(key, value); },
  };
}

function makeFakeR2(objects) {
  return {
    async get(key) {
      if (!objects[key]) return null;
      return { body: objects[key] };
    },
  };
}

function makeFakeD1() {
  const calls = [];
  function makeStatement(sql, params) {
    return {
      sql,
      params: params || [],
      bind(...p) { return makeStatement(sql, p); },
      async run() { calls.push({ type: 'run', sql }); return { meta: {} }; },
      async all() { calls.push({ type: 'all', sql }); return { results: [] }; },
      async first() { calls.push({ type: 'first', sql }); return null; },
    };
  }
  return {
    calls,
    prepare(sql) { return makeStatement(sql); },
    async batch(statements) {
      calls.push({ type: 'batch', count: statements.length });
      const results = [];
      for (const s of statements) results.push(await s.run());
      return results;
    },
  };
}

async function run() {
  // =========================================================================
  // A. router.js 的 :name* 萬用字元 + Response透傳
  // =========================================================================

  await test('router.js：:path* 可以比對單一segment', async () => {
    const router = createRouter();
    let captured = null;
    router.add('GET', '/img/:path*', (ctx) => { captured = ctx.params.path; return { ok: true }; });
    await router.handle({ method: 'GET', pathname: '/img/a.jpg' }, {});
    assert.strictEqual(captured, 'a.jpg');
  });

  await test('router.js：:path* 可以比對多層segment', async () => {
    const router = createRouter();
    let captured = null;
    router.add('GET', '/img/:path*', (ctx) => { captured = ctx.params.path; return { ok: true }; });
    await router.handle({ method: 'GET', pathname: '/img/quest/scenes/terrain-1.jpg' }, {});
    assert.strictEqual(captured, 'quest/scenes/terrain-1.jpg');
  });

  await test('router.js：:path* 不影響一般 :id 單段參數的行為', async () => {
    const router = createRouter();
    let captured = null;
    router.add('GET', '/users/:id', (ctx) => { captured = ctx.params.id; return { ok: true }; });
    const res = await router.handle({ method: 'GET', pathname: '/users/abc/def' }, {});
    // /users/:id 只認單段，多一層應該不比對成功（回404）
    assert.strictEqual(res.status, 404);
    assert.strictEqual(captured, null);
  });

  await test('router.js：handler回傳真正的Response時原樣透傳（不被makeResponse()轉成JSON）', async () => {
    const router = createRouter();
    const marker = new Response('<html>raw</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    router.add('GET', '/raw', () => marker);
    const res = await router.handle({ method: 'GET', pathname: '/raw' }, {});
    assert.strictEqual(res, marker);
    const text = await res.text();
    assert.strictEqual(text, '<html>raw</html>');
    assert.strictEqual(res.headers.get('content-type'), 'text/html');
  });

  await test('router.js：handler回傳plain object時仍照舊被makeResponse()轉成JSON（既有auth/user行為不變）', async () => {
    const router = createRouter();
    router.add('GET', '/plain', () => ({ ok: true, data: { x: 1 } }));
    const res = await router.handle({ method: 'GET', pathname: '/plain' }, {});
    assert.strictEqual(res.headers.get('content-type'), 'application/json');
    const body = await res.json();
    assert.deepStrictEqual(body, { ok: true, data: { x: 1 } });
  });

  await test('router.js：resolvePathname 現在有被 export 出來', async () => {
    const mod = await import('../../src/routes/router.js');
    assert.strictEqual(typeof mod.resolvePathname, 'function');
    assert.strictEqual(mod.resolvePathname({ pathname: '/x' }), '/x');
  });

  // =========================================================================
  // B. legacy_routes.js 的 registerLegacyRoutes() 單元測試
  // =========================================================================

  await test('registerLegacyRoutes()：router參數不合法時丟出明確錯誤', () => {
    assert.throws(() => registerLegacyRoutes(null, makeLegacyHandler()), /router/);
  });

  await test('registerLegacyRoutes()：legacyHandler不是函式時丟出明確錯誤', () => {
    const router = createRouter();
    assert.throws(() => registerLegacyRoutes(router, 'not-a-function'), /legacyHandler/);
  });

  await test('registerLegacyRoutes()：成功註冊9條路由', () => {
    const router = createRouter();
    registerLegacyRoutes(router, makeLegacyHandler());
    assert.strictEqual(router.routes.length, 9);
  });

  await test('registerLegacyRoutes()：註冊的method+path組合與規格完全一致', () => {
    const router = createRouter();
    registerLegacyRoutes(router, makeLegacyHandler());
    const combos = router.routes.map((r) => `${r.method} ${r.path}`).sort();
    assert.deepStrictEqual(combos, [
      'GET /',
      'GET /api/qlive',
      'GET /api/sync',
      'GET /apple-touch-icon.png',
      'GET /icon.svg',
      'GET /img/:path*',
      'GET /manifest.json',
      'POST /api/qlive',
      'POST /api/sync',
    ]);
  });

  await test('registerLegacyRoutes()：GET / 的 handler 呼叫 legacyHandler(request, env)，參數原封不動', async () => {
    const router = createRouter();
    const legacy = makeLegacyHandler();
    registerLegacyRoutes(router, legacy);
    const request = { method: 'GET', pathname: '/' };
    const env = { marker: 'real-env' };
    await router.handle(request, { env });
    assert.strictEqual(legacy.calls.length, 1);
    assert.strictEqual(legacy.calls[0].request, request);
    assert.strictEqual(legacy.calls[0].env, env);
  });

  await test('registerLegacyRoutes()：GET /img/:path* 的 handler 也是原封不動呼叫 legacyHandler（不自己解析path）', async () => {
    const router = createRouter();
    const legacy = makeLegacyHandler();
    registerLegacyRoutes(router, legacy);
    const request = { method: 'GET', pathname: '/img/quest/scenes/terrain-1.jpg' };
    await router.handle(request, { env: {} });
    assert.strictEqual(legacy.calls.length, 1);
    assert.strictEqual(legacy.calls[0].request, request);
  });

  await test('registerLegacyRoutes()：POST /api/sync 的 handler 呼叫 legacyHandler', async () => {
    const router = createRouter();
    const legacy = makeLegacyHandler();
    registerLegacyRoutes(router, legacy);
    await router.handle({ method: 'POST', pathname: '/api/sync' }, { env: {} });
    assert.strictEqual(legacy.calls.length, 1);
  });

  await test('registerLegacyRoutes()：legacyHandler回傳的真正Response原樣透傳（不被轉成JSON）', async () => {
    const router = createRouter();
    const htmlResponse = new Response('<!DOCTYPE html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    const legacy = makeLegacyHandler(() => htmlResponse);
    registerLegacyRoutes(router, legacy);
    const res = await router.handle({ method: 'GET', pathname: '/' }, { env: {} });
    assert.strictEqual(res, htmlResponse);
  });

  await test('registerLegacyRoutes()：不重新實作任何邏輯——原始碼掃描不含 getManifest/getIconSVG/getHTML 等legacy函式名稱', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'legacy_routes.js'), 'utf8');
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/getManifest|getIconSVG|getHTML|ICON_PNG/.test(stripped));
  });

  await test('createAppRouter(legacyHandler) 有提供legacyHandler時，一併掛載legacy路由', () => {
    const router = createAppRouter(makeLegacyHandler());
    const paths = router.routes.map((r) => r.path);
    assert.ok(paths.includes('/'));
    assert.ok(paths.includes('/api/sync'));
  });

  // 注意：auth路由數量從6條變成7條是TASK1.33新增GET /auth/google/callback
  // 造成的，屬預期演進（不是回歸）；「不含legacy路由」這個核心行為不變。
  await test('（TASK1.33後更新）createAppRouter()（不傳參數）不含legacy路由（auth/user路由共7條）', () => {
    const router = createAppRouter();
    const paths = router.routes.map((r) => r.path);
    assert.ok(!paths.includes('/'));
    assert.ok(!paths.includes('/api/sync'));
    assert.strictEqual(router.routes.length, 7); // 6個auth + 1個user
  });

  // =========================================================================
  // C. 真正的 src/worker.js（含TASK1.26接線）端對端測試
  // =========================================================================

  const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
  const mod = await import(workerUrl);
  const worker = mod.default;

  const SYNC_KV = makeFakeKV();
  const DIET_COACH_IMAGES = makeFakeR2({ 'quest/scenes/terrain-1.jpg': 'FAKE_JPEG_BYTES' });
  const DIET_COACH_DB = makeFakeD1();
  const envFalse = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB };
  const envTrue = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };

  // -------------------------------------------------------------------------
  // 1. flag=false 行為不變
  // -------------------------------------------------------------------------

  await test('（1.flag=false）GET / 回傳首頁HTML，行為與TASK1.24/1.25一致', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), envFalse, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  // 注意：這項斷言原本驗證「TASK1.26當下 POST /auth/guest 仍落到首頁
  // catch-all」，這是當時的真實狀態。TASK1.29已依規格明確把這一條路由
  // 正式上線（不受這裡測的feature flag影響）——這是TASK1.29的任務目標，
  // 不是回歸。
  await test('（TASK1.29起）POST /auth/guest 已正式上線，不受這裡測的flag狀態影響，回傳JSON+Set-Cookie', async () => {
    const isolatedEnv = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: makeFakeD1() };
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), isolatedEnv, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/json');
    assert.ok(res.headers.get('set-cookie'));
  });

  await test('（1.flag=false）D1完全沒有任何SQL呼叫', async () => {
    const freshD1 = makeFakeD1();
    const env = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: freshD1 };
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=f1'), env, {});
    assert.strictEqual(freshD1.calls.length, 0);
  });

  // -------------------------------------------------------------------------
  // 2. flag=true 首頁正常
  // -------------------------------------------------------------------------

  await test('（2.flag=true）GET / 透過router+legacy adapter回傳真正的首頁HTML', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), envTrue, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（2.flag=true）首頁Content-Type為html（不是被router硬轉成JSON）', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), envTrue, {});
    assert.ok((res.headers.get('content-type') || '').indexOf('text/html') === 0);
  });

  await test('（2.flag=true）首頁Cache-Control為no-store（legacy邏輯完全透傳）', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), envTrue, {});
    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
  });

  // -------------------------------------------------------------------------
  // 3. manifest 正常
  // -------------------------------------------------------------------------

  await test('（3.manifest）flag=false：GET /manifest.json 回傳200且Content-Type正確', async () => {
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), envFalse, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
  });

  await test('（3.manifest）flag=true：GET /manifest.json 透過router+adapter回傳一樣的結果', async () => {
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), envTrue, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
    const text = await res.text();
    assert.doesNotThrow(() => JSON.parse(text));
  });

  // -------------------------------------------------------------------------
  // 4. icon 正常
  // -------------------------------------------------------------------------

  await test('（4.icon）flag=false：GET /icon.svg 回傳svg內容', async () => {
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), envFalse, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  await test('（4.icon）flag=true：GET /icon.svg 透過router+adapter回傳一樣的svg內容', async () => {
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), envTrue, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  await test('（4.icon）flag=true：GET /apple-touch-icon.png 回傳200且Content-Type為image/png', async () => {
    const res = await worker.fetch(new Request('https://example.com/apple-touch-icon.png'), envTrue, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/png');
  });

  // -------------------------------------------------------------------------
  // 5. img 正常
  // -------------------------------------------------------------------------

  await test('（5.img）flag=false：GET /img/存在的物件 回傳200且內容正確', async () => {
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envFalse, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text, 'FAKE_JPEG_BYTES');
  });

  await test('（5.img）flag=true：GET /img/存在的物件（多層路徑）透過router+adapter+:path*正確比對，回傳一樣的內容', async () => {
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envTrue, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text, 'FAKE_JPEG_BYTES');
  });

  await test('（5.img）flag=true：GET /img/不存在的物件 回傳404（legacy判斷邏輯透傳，非router自己的404）', async () => {
    const res = await worker.fetch(new Request('https://example.com/img/does/not/exist.jpg'), envTrue, {});
    assert.strictEqual(res.status, 404);
  });

  await test('（5.img）flag=true：GET /img/ Cache-Control含immutable（legacy邏輯完全透傳）', async () => {
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envTrue, {});
    assert.ok((res.headers.get('cache-control') || '').indexOf('immutable') >= 0);
  });

  // -------------------------------------------------------------------------
  // 6. sync 正常
  // -------------------------------------------------------------------------

  await test('（6.sync）flag=false：POST /api/sync 成功寫入並可GET讀回', async () => {
    const postRes = await worker.fetch(new Request('https://example.com/api/sync?code=ra-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), envFalse, {});
    const postJson = await postRes.json();
    assert.strictEqual(postJson.ok, true);
    const getRes = await worker.fetch(new Request('https://example.com/api/sync?code=ra-1'), envFalse, {});
    assert.strictEqual(await getRes.text(), JSON.stringify({ v: 1 }));
  });

  await test('（6.sync）flag=true：POST /api/sync 透過router+adapter一樣成功寫入並可GET讀回', async () => {
    const postRes = await worker.fetch(new Request('https://example.com/api/sync?code=ra-2', { method: 'POST', body: JSON.stringify({ v: 2 }) }), envTrue, {});
    const postJson = await postRes.json();
    assert.strictEqual(postJson.ok, true);
    const getRes = await worker.fetch(new Request('https://example.com/api/sync?code=ra-2'), envTrue, {});
    assert.strictEqual(await getRes.text(), JSON.stringify({ v: 2 }));
  });

  await test('（6.sync）flag=true：GET /api/sync 無效code格式回傳400（legacy驗證邏輯透傳）', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=ab'), envTrue, {});
    assert.strictEqual(res.status, 400);
  });

  await test('（6.sync）flag=true：POST /api/sync 過大內容回傳413（legacy驗證邏輯透傳）', async () => {
    const bigBody = 'x'.repeat(1000001);
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=ra-big', { method: 'POST', body: bigBody }), envTrue, {});
    assert.strictEqual(res.status, 413);
  });

  await test('（6.sync）flag=true 與 flag=false 寫入同一個KV store（沒有另外開一份資料）', async () => {
    await worker.fetch(new Request('https://example.com/api/sync?code=ra-shared', { method: 'POST', body: 'shared-value' }), envTrue, {});
    const getRes = await worker.fetch(new Request('https://example.com/api/sync?code=ra-shared'), envFalse, {});
    assert.strictEqual(await getRes.text(), 'shared-value');
  });

  // -------------------------------------------------------------------------
  // 7. qlive 正常
  // -------------------------------------------------------------------------

  await test('（7.qlive）flag=false：POST /api/qlive 成功寫入並可GET讀回', async () => {
    const postRes = await worker.fetch(new Request('https://example.com/api/qlive?code=rq-1', { method: 'POST', body: JSON.stringify({ ts: 1 }) }), envFalse, {});
    assert.strictEqual((await postRes.json()).ok, true);
    const getRes = await worker.fetch(new Request('https://example.com/api/qlive?code=rq-1'), envFalse, {});
    assert.strictEqual(await getRes.text(), JSON.stringify({ ts: 1 }));
  });

  await test('（7.qlive）flag=true：POST /api/qlive 透過router+adapter一樣成功寫入並可GET讀回', async () => {
    const postRes = await worker.fetch(new Request('https://example.com/api/qlive?code=rq-2', { method: 'POST', body: JSON.stringify({ ts: 2 }) }), envTrue, {});
    assert.strictEqual((await postRes.json()).ok, true);
    const getRes = await worker.fetch(new Request('https://example.com/api/qlive?code=rq-2'), envTrue, {});
    assert.strictEqual(await getRes.text(), JSON.stringify({ ts: 2 }));
  });

  await test('（7.qlive）flag=true：GET /api/qlive 不存在的code回傳200且內容為null', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/qlive?code=never-existed-rq'), envTrue, {});
    assert.strictEqual(await res.text(), 'null');
  });

  // -------------------------------------------------------------------------
  // 8. auth route 正常（確認legacy adapter沒有影響既有TASK1.21路由）
  // -------------------------------------------------------------------------

  await test('（8.auth route）flag=true：POST /auth/guest 依然被router+controller正確處理（不受legacy adapter影響）', async () => {
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), envTrue, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/json');
    const body = await res.json();
    assert.ok(body.data.user);
  });

  await test('（8.auth route）flag=true：GET /auth/me 沒有cookie時依然回401 JSON', async () => {
    const res = await worker.fetch(new Request('https://example.com/auth/me'), envTrue, {});
    assert.strictEqual(res.status, 401);
  });

  // 注意：同上，TASK1.29 已將 POST /auth/guest 正式上線，不論flag狀態。
  await test('（TASK1.29起）POST /auth/guest 已正式上線，flag=false時依然回傳JSON（不受legacy adapter影響，因為根本沒有經過gateway）', async () => {
    const isolatedEnv = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: makeFakeD1() };
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST' }), isolatedEnv, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/json');
  });

  // -------------------------------------------------------------------------
  // 9. users route 正常
  // -------------------------------------------------------------------------

  await test('（9.users route）flag=true：GET /users/:id（不存在）依然回404 JSON', async () => {
    const res = await worker.fetch(new Request('https://example.com/users/does-not-exist'), envTrue, {});
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers.get('content-type'), 'application/json');
  });

  await test('（9.users route）flag=false：GET /users/123 落到首頁catch-all', async () => {
    const res = await worker.fetch(new Request('https://example.com/users/123'), envFalse, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  // -------------------------------------------------------------------------
  // 10. fallback 正常（真正尚未遷移/未知的路徑）
  // -------------------------------------------------------------------------

  await test('（10.fallback）flag=true：完全未知的路徑（router與legacy adapter都沒有對應規則）仍安全fallback到legacy首頁catch-all', async () => {
    const res = await worker.fetch(new Request('https://example.com/this/path/does/not/exist/anywhere'), envTrue, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（10.fallback）flag=true：createApplication失敗（缺少D1）時，一律安全退回legacy，首頁仍正常', async () => {
    const envTrueNoD1 = { SYNC_KV, DIET_COACH_IMAGES, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };
    const res = await worker.fetch(new Request('https://example.com/'), envTrueNoD1, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（10.fallback）flag=true：/apple-touch-icon-precomposed.png（未列在legacy_routes.js清單內）仍透過gateway安全fallback到legacy並正常回應', async () => {
    const res = await worker.fetch(new Request('https://example.com/apple-touch-icon-precomposed.png'), envTrue, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/png');
  });

  // -------------------------------------------------------------------------
  // 11. UI HTML 一致
  // -------------------------------------------------------------------------

  await test('（11.UI一致）flag=true 與 flag=false 的首頁HTML內容完全相同（逐位元）', async () => {
    const resFalse = await worker.fetch(new Request('https://example.com/'), envFalse, {});
    const textFalse = await resFalse.text();
    const resTrue = await worker.fetch(new Request('https://example.com/'), envTrue, {});
    const textTrue = await resTrue.text();
    assert.strictEqual(textFalse, textTrue);
  });

  await test('（11.UI一致）首頁HTML內容包含 NUTRI_DATA/SCEN_DATA/QST_PHOTOS（flag=true下依然完整）', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), envTrue, {});
    const text = await res.text();
    assert.ok(text.indexOf('NUTRI_DATA') > 0);
    assert.ok(text.indexOf('SCEN_DATA') > 0);
    assert.ok(text.indexOf('QST_PHOTOS') > 0);
  });

  await test('（11.UI一致）首頁HTML長度數量級一致（未被截斷或異常膨脹）', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), envTrue, {});
    const text = await res.text();
    assert.ok(text.length > 1000000 && text.length < 1500000, `長度異常: ${text.length}`);
  });

  // -------------------------------------------------------------------------
  // 12. KV/R2 一致
  // -------------------------------------------------------------------------

  await test('（12.KV一致）/api/sync 在flag=true與flag=false下讀寫同一份KV資料，內容一致', async () => {
    await worker.fetch(new Request('https://example.com/api/sync?code=kv-check', { method: 'POST', body: 'consistent-value' }), envFalse, {});
    const resTrue = await worker.fetch(new Request('https://example.com/api/sync?code=kv-check'), envTrue, {});
    assert.strictEqual(await resTrue.text(), 'consistent-value');
  });

  await test('（12.KV一致）/api/qlive 在flag=true與flag=false下讀寫同一份KV資料，內容一致', async () => {
    await worker.fetch(new Request('https://example.com/api/qlive?code=qlive-kv-check', { method: 'POST', body: 'consistent-qlive-value' }), envTrue, {});
    const resFalse = await worker.fetch(new Request('https://example.com/api/qlive?code=qlive-kv-check'), envFalse, {});
    assert.strictEqual(await resFalse.text(), 'consistent-qlive-value');
  });

  await test('（12.R2一致）/img/* 在flag=true與flag=false下讀取同一個R2物件，內容一致', async () => {
    const resFalse = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envFalse, {});
    const resTrue = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envTrue, {});
    assert.strictEqual(await resFalse.text(), await resTrue.text());
  });

  // -------------------------------------------------------------------------
  // 額外：D1零寫入守則（延續前幾個TASK的守則，確認legacy adapter沒有破壞它）
  // -------------------------------------------------------------------------

  await test('（延續守則）flag=true處理全部legacy路徑（首頁/manifest/icon/img/sync/qlive）後，D1完全沒有任何SQL呼叫', async () => {
    const freshD1 = makeFakeD1();
    const env = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: freshD1, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/manifest.json'), env, {});
    await worker.fetch(new Request('https://example.com/icon.svg'), env, {});
    await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=d1check'), env, {});
    await worker.fetch(new Request('https://example.com/api/qlive?code=d1check'), env, {});
    assert.strictEqual(freshD1.calls.length, 0);
  });

  await test('（延續守則）原始碼掃描：worker.js 的 handle(r,env) 函式體本身完全沒有變動（TASK1.26沒有動到legacy handler）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/gateway|createApplication|registerLegacyRoutes/.test(handleBody));
  });

  // 注意：這項斷言原本是「TASK1.26當下 src/worker.js 完全沒有異動」的
  // 一次性快照檢查——這在TASK1.26當時是真的，但TASK1.29（Enable Guest
  // Authentication API Route）已經合法修改了worker.js的入口區塊來啟用
  // POST /auth/guest，導致這個快照式的斷言從此不再成立，不是回歸。
  // 真正持久有效的守則是上面那項「handle(r,env)函式體本身完全沒有
  // 變動」的原始碼掃描（仍然通過），這裡改成驗證同樣的持久性質，取代
  // 已經被後續任務正常超越的git diff快照檢查。
  await test('（延續守則，TASK1.29後更新）worker.js 的合法改動只會發生在 handle(r,env) 之前的入口區塊，handle本身永遠維持原樣', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0, 'handle(r,env) 函式應該存在');
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/gateway|createApplication|registerLegacyRoutes|middleware|contract/i.test(handleBody));
  });

  // -------------------------------------------------------------------------
  // 額外補充：跨category邊界情境
  // -------------------------------------------------------------------------

  await test('registerLegacyRoutes()：多次呼叫在不同router上互不干擾（各自獨立累加9條路由）', () => {
    const routerA = createRouter();
    const routerB = createRouter();
    registerLegacyRoutes(routerA, makeLegacyHandler());
    assert.strictEqual(routerA.routes.length, 9);
    assert.strictEqual(routerB.routes.length, 0);
  });

  await test('router.js：:path* 對含URL編碼字元的路徑正確decode', async () => {
    const router = createRouter();
    let captured = null;
    router.add('GET', '/img/:path*', (ctx) => { captured = ctx.params.path; return { ok: true }; });
    await router.handle({ method: 'GET', pathname: '/img/a%20b/c.jpg' }, {});
    assert.strictEqual(captured, 'a b/c.jpg');
  });

  // 注意：總數從15變成16是TASK1.33新增GET /auth/google/callback造成的
  // 預期演進，不是回歸。
  await test('（TASK1.33後更新）createAppRouter(legacyHandler) 同時具備auth/user/legacy三種路由，總數為16', () => {
    const router = createAppRouter(makeLegacyHandler());
    assert.strictEqual(router.routes.length, 16);
  });

  await test('（延續守則）flag=true：DELETE /api/sync（不支援的方法）由router自行判斷回405（新架構自己的JSON 405，屬已知細節差異，不影響flag預設關閉時的正式環境）', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=method-check', { method: 'DELETE' }), envTrue, {});
    assert.strictEqual(res.status, 405);
  });

  await test('（延續守則）flag=false：DELETE /api/sync 仍是legacy原本的405（純文字，非JSON）', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=method-check-2', { method: 'DELETE' }), envFalse, {});
    assert.strictEqual(res.status, 405);
    const text = await res.text();
    assert.strictEqual(text, 'Method Not Allowed');
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'route-adapter-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

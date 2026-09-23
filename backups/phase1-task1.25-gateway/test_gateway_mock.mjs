/*
 * Phase 1 TASK 1.25｜Feature Flag & Route Migration Gateway 測試
 *
 * 分兩部分：
 * A) 對 src/bootstrap/route_gateway.js 的純單元測試（假 app / 假 legacyHandler）
 * B) 對真正的 src/worker.js（含 gateway 接線）用 Node ESM import 直接呼叫
 *    export default 的 fetch()，驗證 flag=false（預設，正式環境現況）與
 *    flag=true（假設性開啟）兩種情境下的實際行為。
 *
 * 完全不連線任何真實或本機模擬的資料庫，不建立任何真實使用者 session，
 * 不會真的呼叫 Google OAuth，不執行 Legacy Import。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRouteGateway } from '../../src/bootstrap/route_gateway.js';
import { createApplication } from '../../src/bootstrap/application.js';

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

async function readJson(response) {
  const text = await response.text();
  return JSON.parse(text);
}

// --- 假 app（純記憶體，不含真正的 db/router） ---
// 注意（TASK1.26起）：route_gateway.js 現在會先用 app.router.routes 判斷
// 「這個路徑router認不認得」，認得才會真的呼叫 app.router.handle()；也
// 會在建構時嘗試呼叫 app.router.add() 掛載legacy路由（見
// registerLegacyRoutes()）。這裡的假router用一個「比對任何路徑」的萬用
// 規則預先塞進 routes，並提供一個no-op的add()（純粹讓掛載動作不拋錯），
// 讓這些「測gateway本身該不該呼叫router」的單元測試不受TASK1.26新增的
// 路徑比對前置檢查影響——真正的路徑比對邏輯已經在下面的「端對端」測試
// 用真正的 router.js 驗證過了。
function makeFakeApp(overrides) {
  const base = {
    config: { app: { features: { routeMigrationEnabled: false } } },
    db: { marker: 'fake-db' },
    env: undefined,
    services: { marker: 'fake-services' },
    router: {
      calls: [],
      routes: [{ method: 'ANY', regex: /^.*$/, paramNames: [] }],
      add() { /* no-op：讓 registerLegacyRoutes() 掛載動作不拋錯 */ },
      async handle(request, context) {
        this.calls.push({ request, context });
        return new Response(JSON.stringify({ ok: true, data: { fromRouter: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  };
  return Object.assign(base, overrides || {});
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

// --- 假 KV binding ---
function makeFakeKV() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value) { store.set(key, value); },
  };
}

// --- 假 R2 binding ---
function makeFakeR2(objects) {
  return {
    async get(key) {
      if (!objects[key]) return null;
      return { body: objects[key] };
    },
  };
}

// --- 假 D1 binding ---
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
  // A. createRouteGateway() 純單元測試
  // =========================================================================

  // -------------------------------------------------------------------------
  // A0. 建構參數檢查
  // -------------------------------------------------------------------------

  await test('createRouteGateway() 缺少 legacyHandler 時丟出明確錯誤', () => {
    assert.throws(() => createRouteGateway({ app: makeFakeApp() }), /legacyHandler/);
  });

  await test('createRouteGateway(undefined) 也因缺少 legacyHandler 而丟出明確錯誤', () => {
    assert.throws(() => createRouteGateway(undefined), /legacyHandler/);
  });

  await test('createRouteGateway() 提供正確 legacyHandler 時成功建立，回傳 {handle}', () => {
    const gateway = createRouteGateway({ app: makeFakeApp(), legacyHandler: makeLegacyHandler() });
    assert.strictEqual(typeof gateway.handle, 'function');
  });

  // -------------------------------------------------------------------------
  // 1. flag=false 走 legacy
  // -------------------------------------------------------------------------

  await test('flag=false（明確設定）時，gateway.handle() 呼叫 legacyHandler', async () => {
    const app = makeFakeApp({ config: { app: { features: { routeMigrationEnabled: false } } } });
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    await gateway.handle({ method: 'GET', pathname: '/' }, {});
    assert.strictEqual(legacy.calls.length, 1);
    assert.strictEqual(app.router.calls.length, 0);
  });

  await test('flag 完全未設定 features 物件時，預設視為 false，走 legacy', async () => {
    const app = makeFakeApp({ config: { app: { features: {} } } });
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    await gateway.handle({ method: 'GET', pathname: '/' }, {});
    assert.strictEqual(legacy.calls.length, 1);
  });

  await test('app 為 null 時（bootstrap建立失敗），一律走 legacy', async () => {
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app: null, legacyHandler: legacy });
    await gateway.handle({ method: 'GET', pathname: '/' }, {});
    assert.strictEqual(legacy.calls.length, 1);
  });

  await test('app.config 結構不完整（例如缺少 app.config.app）時，安全視為 false，走 legacy', async () => {
    const app = makeFakeApp({ config: {} });
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    await gateway.handle({ method: 'GET', pathname: '/' }, {});
    assert.strictEqual(legacy.calls.length, 1);
  });

  await test('legacyHandler 被呼叫時，request/env 參數原封不動傳入', async () => {
    const app = makeFakeApp();
    const legacy = makeLegacyHandler();
    const request = { method: 'GET', pathname: '/img/x.jpg' };
    const env = { marker: 'real-env' };
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    await gateway.handle(request, env);
    assert.strictEqual(legacy.calls[0].request, request);
    assert.strictEqual(legacy.calls[0].env, env);
  });

  await test('flag=false 時，gateway.handle() 回傳值就是 legacyHandler 的回傳值', async () => {
    const app = makeFakeApp();
    const marker = new Response('legacy-marker', { status: 200 });
    const legacy = makeLegacyHandler(() => marker);
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    const res = await gateway.handle({ method: 'GET', pathname: '/' }, {});
    assert.strictEqual(res, marker);
  });

  // -------------------------------------------------------------------------
  // 2. flag=true 走 router
  // -------------------------------------------------------------------------

  await test('flag=true 時，gateway.handle() 呼叫 app.router.handle() 而不是 legacyHandler', async () => {
    const app = makeFakeApp({ config: { app: { features: { routeMigrationEnabled: true } } } });
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    await gateway.handle({ method: 'GET', pathname: '/auth/me' }, {});
    assert.strictEqual(app.router.calls.length, 1);
    assert.strictEqual(legacy.calls.length, 0);
  });

  await test('flag=true 時，router.handle() 收到的 context 帶有正確的 db/env/services', async () => {
    const fakeEnv = { marker: 'real-env-2' };
    const app = makeFakeApp({ config: { app: { features: { routeMigrationEnabled: true } } } });
    const gateway = createRouteGateway({ app, legacyHandler: makeLegacyHandler() });
    await gateway.handle({ method: 'GET', pathname: '/auth/me' }, fakeEnv);
    const ctx = app.router.calls[0].context;
    assert.strictEqual(ctx.db, app.db);
    assert.strictEqual(ctx.env, fakeEnv);
    assert.strictEqual(ctx.services, app.services);
  });

  await test('flag=true 時，router.handle() 收到的 request 就是原始 request（同一參考）', async () => {
    const app = makeFakeApp({ config: { app: { features: { routeMigrationEnabled: true } } } });
    const gateway = createRouteGateway({ app, legacyHandler: makeLegacyHandler() });
    const request = { method: 'GET', pathname: '/users/1' };
    await gateway.handle(request, {});
    assert.strictEqual(app.router.calls[0].request, request);
  });

  await test('flag=true 時，gateway.handle() 回傳值就是 router.handle() 的回傳值', async () => {
    const app = makeFakeApp({ config: { app: { features: { routeMigrationEnabled: true } } } });
    const gateway = createRouteGateway({ app, legacyHandler: makeLegacyHandler() });
    const res = await gateway.handle({ method: 'GET', pathname: '/auth/me' }, {});
    const body = await readJson(res);
    assert.strictEqual(body.data.fromRouter, true);
  });

  await test('flag 用 truthy 但非布林值（例如字串"1"儲存在features裡）時仍視為開啟', async () => {
    const app = makeFakeApp({ config: { app: { features: { routeMigrationEnabled: '1' } } } });
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    await gateway.handle({ method: 'GET', pathname: '/auth/me' }, {});
    assert.strictEqual(app.router.calls.length, 1);
    assert.strictEqual(legacy.calls.length, 0);
  });

  // -------------------------------------------------------------------------
  // 3. fallback 正常
  // -------------------------------------------------------------------------

  await test('flag=true 但 app.router 不存在時，安全退回 legacy', async () => {
    const app = makeFakeApp({ config: { app: { features: { routeMigrationEnabled: true } } }, router: undefined });
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    await gateway.handle({ method: 'GET', pathname: '/auth/me' }, {});
    assert.strictEqual(legacy.calls.length, 1);
  });

  await test('flag=true 但 app.router.handle 不是函式時，安全退回 legacy', async () => {
    const app = makeFakeApp({ config: { app: { features: { routeMigrationEnabled: true } } }, router: { handle: 'not-a-function' } });
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    await gateway.handle({ method: 'GET', pathname: '/auth/me' }, {});
    assert.strictEqual(legacy.calls.length, 1);
  });

  await test('flag=true 且 app 本身為 null（矛盾狀態，理論上不會發生）時仍安全退回 legacy', async () => {
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app: null, legacyHandler: legacy });
    await gateway.handle({ method: 'GET', pathname: '/auth/me' }, {});
    assert.strictEqual(legacy.calls.length, 1);
  });

  // -------------------------------------------------------------------------
  // 4. error handling
  // -------------------------------------------------------------------------

  await test('flag=true 但 router.handle() 同步拋出例外時，安全退回 legacy 而非讓整個請求失敗', async () => {
    const app = makeFakeApp({ config: { app: { features: { routeMigrationEnabled: true } } } });
    app.router.handle = () => { throw new Error('router-boom'); };
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    const res = await gateway.handle({ method: 'GET', pathname: '/auth/me' }, {});
    assert.strictEqual(legacy.calls.length, 1);
    assert.ok(res instanceof Response);
  });

  await test('flag=true 但 router.handle() 回傳 rejected promise 時，安全退回 legacy', async () => {
    const app = makeFakeApp({ config: { app: { features: { routeMigrationEnabled: true } } } });
    app.router.handle = async () => { throw new Error('router-async-boom'); };
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    const res = await gateway.handle({ method: 'GET', pathname: '/auth/me' }, {});
    assert.strictEqual(legacy.calls.length, 1);
    assert.ok(res instanceof Response);
  });

  await test('gateway.handle() 本身不會讓例外往外洩漏未攔截（flag=true+router拋錯的情境下）', async () => {
    const app = makeFakeApp({ config: { app: { features: { routeMigrationEnabled: true } } } });
    app.router.handle = () => { throw new Error('boom'); };
    const gateway = createRouteGateway({ app, legacyHandler: makeLegacyHandler() });
    let threw = false;
    try {
      await gateway.handle({ method: 'GET', pathname: '/x' }, {});
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, false);
  });

  // =========================================================================
  // B. 真正的 src/worker.js（含 gateway 接線）端對端測試
  // =========================================================================

  const workerUrlDefault = 'file://' + workerPath + '?t=' + Date.now() + '-a';
  const modDefault = await import(workerUrlDefault);
  const workerDefault = modDefault.default;

  const SYNC_KV = makeFakeKV();
  const DIET_COACH_IMAGES = makeFakeR2({ 'quest/scenes/terrain-1.jpg': 'FAKE_JPEG_BYTES' });
  const DIET_COACH_DB = makeFakeD1();
  const envFlagUnset = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB };
  const envFlagFalse = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB, FEATURE_ROUTE_MIGRATION_ENABLED: 'false' };
  const envFlagTrue = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };

  // -------------------------------------------------------------------------
  // 1（端對端）. flag未設定/false 走 legacy（正式環境現況）
  // -------------------------------------------------------------------------

  await test('（端對端）flag未設定（正式環境現況）：GET / 回傳首頁HTML（走legacy）', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/'), envFlagUnset, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（端對端）flag未設定：POST /auth/guest 仍落到首頁catch-all（未被router攔截）', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), envFlagUnset, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（端對端）FEATURE_ROUTE_MIGRATION_ENABLED="false" 明確設定時，GET / 仍是首頁HTML', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/'), envFlagFalse, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  // -------------------------------------------------------------------------
  // 2（端對端）. flag=true 走 router
  // -------------------------------------------------------------------------

  await test('（端對端）flag=true：POST /auth/guest 真正被router+controller處理，回傳JSON', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), envFlagTrue, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/json');
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data.user);
  });

  await test('（端對端）flag=true：GET /users/:id（不存在的user）真正被router+controller處理，回傳404 JSON', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/users/does-not-exist'), envFlagTrue, {});
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers.get('content-type'), 'application/json');
  });

  await test('（端對端）flag=true：GET /auth/me 沒有cookie時回401 JSON（真正走identity層）', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/auth/me'), envFlagTrue, {});
    assert.strictEqual(res.status, 401);
  });

  // 注意：這項斷言原本驗證「flag=true 時 GET / 這種尚未遷移的路徑會被
  // router回應404」，這是TASK1.25當下的已知限制。TASK1.26的Legacy Route
  // Adapter + Gateway「router優先、找不到才fallback legacy」正是為了
  // 解決這個限制而存在——現在 GET / 已經是router認得的路徑（掛載了
  // legacy_routes.js 的 delegate handler），行為改成「router認得這個
  // 路徑 → 呼叫router.handle() → handler直接delegate給legacyHandler →
  // 回傳真正的首頁HTML」，不再是404。這是TASK1.26明確要做到的效果，
  // 不是回歸。
  await test('（端對端）flag=true：GET /（TASK1.26起已由Legacy Route Adapter接管）回傳真正的首頁HTML，不再是404', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/'), envFlagTrue, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（端對端）flag=true：createApplication失敗（缺少D1）時，自動安全退回legacy，首頁仍正常', async () => {
    const envTrueNoD1 = { SYNC_KV, DIET_COACH_IMAGES, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };
    const res = await workerDefault.fetch(new Request('https://example.com/'), envTrueNoD1, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  // -------------------------------------------------------------------------
  // 5（端對端）. KV正常（flag=false，正式環境現況）
  // -------------------------------------------------------------------------

  await test('（端對端,flag未設定）POST /api/sync 成功寫入並可GET讀回', async () => {
    const postRes = await workerDefault.fetch(
      new Request('https://example.com/api/sync?code=gw-test-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }),
      envFlagUnset, {}
    );
    const postJson = await postRes.json();
    assert.strictEqual(postJson.ok, true);
    const getRes = await workerDefault.fetch(new Request('https://example.com/api/sync?code=gw-test-1'), envFlagUnset, {});
    const getText = await getRes.text();
    assert.strictEqual(getText, JSON.stringify({ v: 1 }));
  });

  await test('（端對端,flag未設定）POST /api/qlive 成功寫入並可GET讀回', async () => {
    const postRes = await workerDefault.fetch(
      new Request('https://example.com/api/qlive?code=gw-qlive-1', { method: 'POST', body: JSON.stringify({ ts: 9 }) }),
      envFlagUnset, {}
    );
    const postJson = await postRes.json();
    assert.strictEqual(postJson.ok, true);
    const getRes = await workerDefault.fetch(new Request('https://example.com/api/qlive?code=gw-qlive-1'), envFlagUnset, {});
    const getText = await getRes.text();
    assert.strictEqual(getText, JSON.stringify({ ts: 9 }));
  });

  await test('（端對端,flag未設定）GET /api/sync 無效code格式回傳400（KV流程判斷邏輯未變）', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/api/sync?code=ab'), envFlagUnset, {});
    assert.strictEqual(res.status, 400);
  });

  await test('（端對端,flag未設定）POST /api/sync 過大內容回傳413', async () => {
    const bigBody = 'x'.repeat(1000001);
    const res = await workerDefault.fetch(new Request('https://example.com/api/sync?code=gw-too-big', { method: 'POST', body: bigBody }), envFlagUnset, {});
    assert.strictEqual(res.status, 413);
  });

  await test('（端對端,flag=false明確設定）POST /api/sync 一樣正常寫入（flag不影響legacy的KV邏輯）', async () => {
    const postRes = await workerDefault.fetch(
      new Request('https://example.com/api/sync?code=gw-test-flagfalse', { method: 'POST', body: 'hello' }),
      envFlagFalse, {}
    );
    const postJson = await postRes.json();
    assert.strictEqual(postJson.ok, true);
    assert.strictEqual(SYNC_KV.store.get('sync:gw-test-flagfalse'), 'hello');
  });

  // -------------------------------------------------------------------------
  // 6（端對端）. R2正常（flag=false，正式環境現況）
  // -------------------------------------------------------------------------

  await test('（端對端,flag未設定）GET /img/存在的物件 回傳200且內容正確', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envFlagUnset, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text, 'FAKE_JPEG_BYTES');
  });

  await test('（端對端,flag未設定）GET /img/不存在的物件 回傳404', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/img/does/not/exist.jpg'), envFlagUnset, {});
    assert.strictEqual(res.status, 404);
  });

  await test('（端對端,flag=false明確設定）GET /img/存在的物件 依然正常（flag不影響legacy的R2邏輯）', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envFlagFalse, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（端對端,flag未設定）GET /img/ 缺少R2 binding時優雅降級為404', async () => {
    const envNoR2 = { SYNC_KV, DIET_COACH_DB };
    const res = await workerDefault.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envNoR2, {});
    assert.strictEqual(res.status, 404);
  });

  // -------------------------------------------------------------------------
  // 7（端對端）. UI一致（flag未設定/false，正式環境現況，跟TASK1.24逐位元比對）
  // -------------------------------------------------------------------------

  await test('（UI一致）flag未設定時，首頁HTML內容包含 NUTRI_DATA/SCEN_DATA/QST_PHOTOS', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/'), envFlagUnset, {});
    const text = await res.text();
    assert.ok(text.indexOf('NUTRI_DATA') > 0);
    assert.ok(text.indexOf('SCEN_DATA') > 0);
    assert.ok(text.indexOf('QST_PHOTOS') > 0);
  });

  await test('（UI一致）flag未設定時，首頁Cache-Control為no-store', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/'), envFlagUnset, {});
    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
  });

  await test('（UI一致）flag未設定 vs flag=false明確設定，首頁HTML內容完全相同', async () => {
    const res1 = await workerDefault.fetch(new Request('https://example.com/'), envFlagUnset, {});
    const text1 = await res1.text();
    const res2 = await workerDefault.fetch(new Request('https://example.com/'), envFlagFalse, {});
    const text2 = await res2.text();
    assert.strictEqual(text1, text2);
  });

  await test('（UI一致）首頁HTML長度與TASK1.24基準（約118萬字元）數量級一致', async () => {
    const res = await workerDefault.fetch(new Request('https://example.com/'), envFlagUnset, {});
    const text = await res.text();
    assert.ok(text.length > 1000000 && text.length < 1500000, `長度異常: ${text.length}`);
  });

  await test('（UI一致）/manifest.json /icon.svg /apple-touch-icon.png 在flag未設定時行為與TASK1.24一致', async () => {
    const manifestRes = await workerDefault.fetch(new Request('https://example.com/manifest.json'), envFlagUnset, {});
    assert.strictEqual(manifestRes.headers.get('content-type'), 'application/manifest+json');
    const iconRes = await workerDefault.fetch(new Request('https://example.com/icon.svg'), envFlagUnset, {});
    const iconText = await iconRes.text();
    assert.strictEqual(iconText.indexOf('<svg'), 0);
    const appleRes = await workerDefault.fetch(new Request('https://example.com/apple-touch-icon.png'), envFlagUnset, {});
    assert.strictEqual(appleRes.headers.get('content-type'), 'image/png');
  });

  // -------------------------------------------------------------------------
  // 額外：無legacy import / 無auth啟用 / D1零寫入（延續TASK1.24的守則，確認gateway沒有破壞這些保證）
  // -------------------------------------------------------------------------

  await test('（延續守則）flag=true處理/auth/guest後，假D1完全沒有實際SQL寫入以外的非預期呼叫（僅users.insert一次）', async () => {
    const freshD1 = makeFakeD1();
    const env = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: freshD1, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };
    await workerDefault.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const runCalls = freshD1.calls.filter((c) => c.type === 'run');
    assert.ok(runCalls.length >= 1);
    assert.ok(runCalls.every((c) => /INSERT INTO (users|sessions)/.test(c.sql)));
  });

  await test('（延續守則）flag未設定時，多次呼叫後假D1完全沒有任何SQL呼叫（legacy路徑完全不碰D1）', async () => {
    const freshD1 = makeFakeD1();
    const env = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: freshD1 };
    await workerDefault.fetch(new Request('https://example.com/'), env, {});
    await workerDefault.fetch(new Request('https://example.com/api/sync?code=x2'), env, {});
    await workerDefault.fetch(new Request('https://example.com/auth/guest', { method: 'POST' }), env, {});
    assert.strictEqual(freshD1.calls.length, 0);
  });

  await test('（延續守則）原始碼掃描：route_gateway.js 不 import src/oauth/ 或 legacy_import', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bootstrap', 'route_gateway.js'), 'utf8');
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/from\s+['"].*oauth\//.test(stripped));
    assert.ok(!/legacy_import/.test(stripped));
  });

  await test('（延續守則）原始碼掃描：route_gateway.js 沒有 export default', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bootstrap', 'route_gateway.js'), 'utf8');
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/export\s+default/.test(stripped));
  });

  await test('（延續守則）原始碼掃描：worker.js 的 handle(r,env) 函式體本身完全沒有變動（不含 gateway/app 相關字樣）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/gateway/.test(handleBody));
    assert.ok(!/createApplication/.test(handleBody));
  });

  await test('（延續守則）原始碼掃描：worker.js 有 import createRouteGateway', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(/import\s*\{\s*createRouteGateway\s*\}\s*from\s*['"]\.\/bootstrap\/route_gateway\.js['"]/.test(src));
  });

  // -------------------------------------------------------------------------
  // 額外：createApplication() 產生的 app 真的能被 gateway 正確判讀 features
  // -------------------------------------------------------------------------

  await test('createApplication() 的 config.app.features.routeMigrationEnabled 預設為 false', () => {
    const app = createApplication(envFlagUnset);
    assert.strictEqual(app.config.app.features.routeMigrationEnabled, false);
  });

  await test('createApplication() 讀取 FEATURE_ROUTE_MIGRATION_ENABLED="true" 後 features.routeMigrationEnabled 為 true', () => {
    const app = createApplication(envFlagTrue);
    assert.strictEqual(app.config.app.features.routeMigrationEnabled, true);
  });

  await test('createApplication() 讀取 FEATURE_ROUTE_MIGRATION_ENABLED="false" 後 features.routeMigrationEnabled 為 false', () => {
    const app = createApplication(envFlagFalse);
    assert.strictEqual(app.config.app.features.routeMigrationEnabled, false);
  });

  await test('把 createApplication() 真正的輸出接進 createRouteGateway()，flag=false時完整跑一次不拋錯', async () => {
    const app = createApplication(envFlagUnset);
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    const res = await gateway.handle({ method: 'GET', pathname: '/' }, envFlagUnset);
    assert.strictEqual(legacy.calls.length, 1);
    assert.ok(res instanceof Response);
  });

  await test('把 createApplication() 真正的輸出接進 createRouteGateway()，flag=true時真的呼叫到真正的router', async () => {
    const app = createApplication(envFlagTrue);
    const legacy = makeLegacyHandler();
    const gateway = createRouteGateway({ app, legacyHandler: legacy });
    const res = await gateway.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, envFlagTrue);
    assert.strictEqual(legacy.calls.length, 0);
    assert.strictEqual(res.status, 200);
    const body = await readJson(res);
    assert.ok(body.data.user);
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'gateway-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

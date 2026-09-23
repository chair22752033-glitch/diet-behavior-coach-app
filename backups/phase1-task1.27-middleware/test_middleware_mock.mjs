/*
 * Phase 1 TASK 1.27｜API Middleware & Request Pipeline Layer 測試
 *
 * 分四部分：
 * A) src/middleware/ 底下每個檔案的純單元測試
 * B) createMiddlewarePipeline() 的組裝/順序/短路/例外攔截測試
 * C) router.js 接入pipeline後的整合測試（含legacy/auth/user路由）
 * D) 對真正的 src/worker.js 端對端測試，確認接入pipeline後既有輸出
 *    完全不變（flag=false/true皆同TASK1.26行為）
 *
 * 完全不連線任何真實或本機模擬的資料庫，不建立任何真實使用者 session，
 * 不會真的呼叫 Google OAuth，不執行 Legacy Import。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withErrorHandling } from '../../src/middleware/error_handler.js';
import { buildRequestContext } from '../../src/middleware/request_context.js';
import { validateBody } from '../../src/middleware/validator.js';
import { requireAuth } from '../../src/middleware/auth_middleware.js';
import { createMiddlewarePipeline } from '../../src/middleware/index.js';
import { createRouter } from '../../src/routes/router.js';
import { createAppRouter } from '../../src/routes/index.js';
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

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

async function run() {
  // =========================================================================
  // A1. error_handler.js — withErrorHandling
  // =========================================================================

  await test('withErrorHandling()：handler不是函式時丟出明確錯誤', () => {
    assert.throws(() => withErrorHandling('not-a-function'), /handler/);
  });

  await test('withErrorHandling()：沒有例外時原樣回傳plain object', async () => {
    const wrapped = withErrorHandling(async () => ({ ok: true, data: { x: 1 } }));
    const result = await wrapped({});
    assert.deepStrictEqual(result, { ok: true, data: { x: 1 } });
  });

  await test('withErrorHandling()：沒有例外時原樣回傳真正的Response（不被改動）', async () => {
    const marker = new Response('raw', { status: 200 });
    const wrapped = withErrorHandling(async () => marker);
    const result = await wrapped({});
    assert.strictEqual(result, marker);
  });

  await test('withErrorHandling()：捕捉Error例外，轉成{ok:false,reason,status:500}', async () => {
    const wrapped = withErrorHandling(async () => { throw new Error('boom'); });
    const result = await wrapped({});
    assert.deepStrictEqual(result, { ok: false, reason: 'boom', status: 500 });
  });

  await test('withErrorHandling()：捕捉非Error的例外（例如字串），仍轉成明確的reason字串', async () => {
    const wrapped = withErrorHandling(async () => { throw 'plain-string-error'; });
    const result = await wrapped({});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
    assert.strictEqual(result.reason, 'plain-string-error');
  });

  await test('withErrorHandling()：同步throw（非async函式）也能被攔截', async () => {
    const wrapped = withErrorHandling(() => { throw new Error('sync-boom'); });
    const result = await wrapped({});
    assert.strictEqual(result.reason, 'sync-boom');
  });

  // =========================================================================
  // A2. request_context.js — buildRequestContext
  // =========================================================================

  await test('buildRequestContext()：回傳包含requestId/timestamp/user/db/env五個欄位', () => {
    const ctx = buildRequestContext({});
    assert.deepStrictEqual(Object.keys(ctx).sort(), ['db', 'env', 'requestId', 'timestamp', 'user']);
  });

  await test('buildRequestContext()：沒有提供base時仍正常運作（user為null，db/env為undefined）', () => {
    const ctx = buildRequestContext();
    assert.strictEqual(ctx.user, null);
    assert.strictEqual(ctx.db, undefined);
    assert.strictEqual(ctx.env, undefined);
  });

  await test('buildRequestContext()：user未提供時預設為null', () => {
    const ctx = buildRequestContext({ db: {}, env: {} });
    assert.strictEqual(ctx.user, null);
  });

  await test('buildRequestContext()：db/env原樣透傳（同一參考）', () => {
    const fakeDb = { marker: 'db' };
    const fakeEnv = { marker: 'env' };
    const ctx = buildRequestContext({ db: fakeDb, env: fakeEnv });
    assert.strictEqual(ctx.db, fakeDb);
    assert.strictEqual(ctx.env, fakeEnv);
  });

  await test('buildRequestContext()：user提供時原樣透傳', () => {
    const fakeUser = { id: 'u-1' };
    const ctx = buildRequestContext({ user: fakeUser });
    assert.strictEqual(ctx.user, fakeUser);
  });

  await test('buildRequestContext()：requestId是非空字串', () => {
    const ctx = buildRequestContext({});
    assert.strictEqual(typeof ctx.requestId, 'string');
    assert.ok(ctx.requestId.length > 0);
  });

  await test('buildRequestContext()：每次呼叫的requestId都不同', () => {
    const ctx1 = buildRequestContext({});
    const ctx2 = buildRequestContext({});
    assert.notStrictEqual(ctx1.requestId, ctx2.requestId);
  });

  await test('buildRequestContext()：timestamp是合法的ISO字串', () => {
    const ctx = buildRequestContext({});
    assert.doesNotThrow(() => new Date(ctx.timestamp).toISOString());
    assert.strictEqual(new Date(ctx.timestamp).toISOString(), ctx.timestamp);
  });

  // =========================================================================
  // A3. validator.js — validateBody
  // =========================================================================

  await test('validateBody()：空schema永遠回傳ok:true', () => {
    const result = validateBody({}, { anything: 1 });
    assert.deepStrictEqual(result, { ok: true, errors: [] });
  });

  await test('validateBody()：required欄位缺少時回傳錯誤', () => {
    const result = validateBody({ name: { required: true } }, {});
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('name')));
  });

  await test('validateBody()：required欄位存在時通過', () => {
    const result = validateBody({ name: { required: true } }, { name: 'x' });
    assert.strictEqual(result.ok, true);
  });

  await test('validateBody()：type不符時回傳錯誤', () => {
    const result = validateBody({ age: { type: 'number' } }, { age: '30' });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('age')));
  });

  await test('validateBody()：type符合時通過', () => {
    const result = validateBody({ age: { type: 'number' } }, { age: 30 });
    assert.strictEqual(result.ok, true);
  });

  await test('validateBody()：多個欄位同時驗證，收集全部錯誤', () => {
    const result = validateBody(
      { name: { required: true }, age: { type: 'number' } },
      { age: 'not-a-number' }
    );
    assert.strictEqual(result.errors.length, 2);
  });

  await test('validateBody()：data為null時視為空物件，不拋例外', () => {
    const result = validateBody({ name: { required: true } }, null);
    assert.strictEqual(result.ok, false);
  });

  await test('validateBody()：欄位非required且未提供時，不檢查type，仍算通過', () => {
    const result = validateBody({ nickname: { type: 'string' } }, {});
    assert.strictEqual(result.ok, true);
  });

  // =========================================================================
  // A4. auth_middleware.js — requireAuth（介面存在，未強制任何route）
  // =========================================================================

  await test('requireAuth()：回傳一個函式（middleware形狀）', () => {
    const mw = requireAuth();
    assert.strictEqual(typeof mw, 'function');
  });

  await test('requireAuth()：沒有cookie時回傳401，不呼叫next', async () => {
    const mw = requireAuth();
    let nextCalled = false;
    const result = await mw({ db: {}, req: {} }, () => { nextCalled = true; });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(nextCalled, false);
  });

  await test('requireAuth()：session驗證成功時呼叫next並帶上user', async () => {
    const fakeUser = { id: 'u-1', status: 'active' };
    const fakeDb = {
      sessions: { async getById() { return { ok: true, row: { user_id: 'u-1', revoked_at: null, expires_at: '2999-01-01T00:00:00Z' } }; } },
      users: { async getById() { return { ok: true, row: fakeUser }; } },
    };
    const mw = requireAuth();
    let capturedCtx = null;
    const result = await mw({ db: fakeDb, req: { cookieHeader: 'dbc_sid=validtoken' } }, (ctx) => {
      capturedCtx = ctx;
      return { ok: true, data: {} };
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(capturedCtx.user, fakeUser);
  });

  await test('原始碼掃描：auth_routes.js/user_routes.js/legacy_routes.js 都沒有 import requireAuth（本次不強制任何route）', () => {
    const files = ['auth_routes.js', 'user_routes.js', 'legacy_routes.js'];
    for (const f of files) {
      const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', f), 'utf8'));
      assert.ok(!/requireAuth/.test(src), `${f} 不應 import requireAuth`);
    }
  });

  // =========================================================================
  // B. createMiddlewarePipeline() — 組裝/順序/短路/例外攔截
  // =========================================================================

  await test('createMiddlewarePipeline()：applyPipeline對非函式handler丟出明確錯誤', () => {
    const applyPipeline = createMiddlewarePipeline([]);
    assert.throws(() => applyPipeline('not-a-function'), /handler/);
  });

  await test('createMiddlewarePipeline([])：空清單時直接呼叫handler（補完ctx後）', async () => {
    const applyPipeline = createMiddlewarePipeline([]);
    let capturedCtx = null;
    const wrapped = applyPipeline((ctx) => { capturedCtx = ctx; return { ok: true }; });
    await wrapped({ req: { marker: 'req' } });
    assert.ok(capturedCtx.requestId);
    assert.strictEqual(capturedCtx.req.marker, 'req');
  });

  await test('（1.middleware順序）多個middleware依註冊順序依序執行', async () => {
    const order = [];
    const mwA = (ctx, next) => { order.push('A'); return next(ctx); };
    const mwB = (ctx, next) => { order.push('B'); return next(ctx); };
    const applyPipeline = createMiddlewarePipeline([mwA, mwB]);
    const wrapped = applyPipeline(() => { order.push('handler'); return { ok: true }; });
    await wrapped({});
    assert.deepStrictEqual(order, ['A', 'B', 'handler']);
  });

  await test('（1.middleware順序）middleware可以修改ctx，下一個middleware看得到修改後的結果', async () => {
    const mwA = (ctx, next) => next(Object.assign({}, ctx, { tag: 'from-A' }));
    let seenTag = null;
    const mwB = (ctx, next) => { seenTag = ctx.tag; return next(ctx); };
    const applyPipeline = createMiddlewarePipeline([mwA, mwB]);
    const wrapped = applyPipeline(() => ({ ok: true }));
    await wrapped({});
    assert.strictEqual(seenTag, 'from-A');
  });

  await test('middleware可以短路（不呼叫next），handler完全不會被執行', async () => {
    let handlerCalled = false;
    const shortCircuit = (ctx, next) => ({ ok: false, reason: 'blocked', status: 403 });
    const applyPipeline = createMiddlewarePipeline([shortCircuit]);
    const wrapped = applyPipeline(() => { handlerCalled = true; return { ok: true }; });
    const result = await wrapped({});
    assert.strictEqual(handlerCalled, false);
    assert.strictEqual(result.reason, 'blocked');
  });

  await test('（2.error捕捉）middleware本身丟出例外時被pipeline的withErrorHandling攔截', async () => {
    const throwingMw = () => { throw new Error('mw-boom'); };
    const applyPipeline = createMiddlewarePipeline([throwingMw]);
    const wrapped = applyPipeline(() => ({ ok: true }));
    const result = await wrapped({});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'mw-boom');
    assert.strictEqual(result.status, 500);
  });

  await test('（2.error捕捉）route handler丟出例外時被pipeline攔截', async () => {
    const applyPipeline = createMiddlewarePipeline([]);
    const wrapped = applyPipeline(() => { throw new Error('handler-boom'); });
    const result = await wrapped({});
    assert.strictEqual(result.reason, 'handler-boom');
  });

  await test('（3.request context）pipeline補完的ctx有requestId/timestamp/user，且不覆蓋原本的req/params/db/env/services', async () => {
    const applyPipeline = createMiddlewarePipeline([]);
    let capturedCtx = null;
    const wrapped = applyPipeline((ctx) => { capturedCtx = ctx; return { ok: true }; });
    const originalReq = { marker: 'original-req' };
    const originalDb = { marker: 'original-db' };
    await wrapped({ req: originalReq, params: { id: '1' }, db: originalDb, env: { marker: 'env' }, services: { marker: 'services' } });
    assert.strictEqual(capturedCtx.req, originalReq);
    assert.deepStrictEqual(capturedCtx.params, { id: '1' });
    assert.strictEqual(capturedCtx.db, originalDb);
    assert.ok(capturedCtx.requestId);
    assert.ok(capturedCtx.timestamp);
    assert.strictEqual(capturedCtx.user, null);
  });

  // =========================================================================
  // C. router.js 接入pipeline後的整合測試
  // =========================================================================

  await test('（7.router正常）router接入pipeline後，一般route仍正常運作，回傳plain object被正確轉成JSON Response', async () => {
    const router = createRouter();
    router.add('GET', '/ping', () => ({ ok: true, data: { pong: true } }));
    const res = await router.handle({ method: 'GET', pathname: '/ping' }, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.pong, true);
  });

  await test('（7.router正常）router接入pipeline後，route handler丟出例外仍被轉成500 JSON（跟接入前行為一致）', async () => {
    const router = createRouter();
    router.add('GET', '/boom', () => { throw new Error('boom-error'); });
    const res = await router.handle({ method: 'GET', pathname: '/boom' }, {});
    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.strictEqual(body.reason, 'boom-error');
  });

  await test('（7.router正常）route handler收到的ctx多了requestId/timestamp/user欄位（不影響原本用到的req/params）', async () => {
    const router = createRouter();
    let capturedCtx = null;
    router.add('GET', '/users/:id', (ctx) => { capturedCtx = ctx; return { ok: true }; });
    await router.handle({ method: 'GET', pathname: '/users/42' }, { db: { marker: 'db' } });
    assert.strictEqual(capturedCtx.params.id, '42');
    assert.strictEqual(capturedCtx.db.marker, 'db');
    assert.ok(capturedCtx.requestId);
    assert.ok(capturedCtx.timestamp);
  });

  await test('（7.router正常）Response透傳規則接入pipeline後依然有效（handler回傳真Response原樣透傳）', async () => {
    const router = createRouter();
    const marker = new Response('raw-html', { status: 200, headers: { 'Content-Type': 'text/html' } });
    router.add('GET', '/raw', () => marker);
    const res = await router.handle({ method: 'GET', pathname: '/raw' }, {});
    assert.strictEqual(res, marker);
  });

  await test('（8.response一致）plain object回傳值接入pipeline前後JSON內容完全一致', async () => {
    const router = createRouter();
    router.add('GET', '/x', () => ({ ok: true, data: { a: 1, b: 'two' } }));
    const res = await router.handle({ method: 'GET', pathname: '/x' }, {});
    const body = await res.json();
    assert.deepStrictEqual(body, { ok: true, data: { a: 1, b: 'two' } });
  });

  await test('（6.legacy route正常/整合）createAppRouter(legacyHandler)透過真正router.handle()正確delegate給legacy', async () => {
    const calls = [];
    const legacyHandler = async (request, env) => { calls.push({ request, env }); return new Response('legacy-html', { status: 200 }); };
    const router = createAppRouter(legacyHandler);
    const request = { method: 'GET', pathname: '/' };
    const res = await router.handle(request, { env: { marker: 'e' } });
    assert.strictEqual(await res.text(), 'legacy-html');
    assert.strictEqual(calls[0].request, request);
  });

  // 注意：路由數量從18條變成20條是TASK1.37新增GET/PATCH /api/profile
  // 造成的預期演進，不是回歸；這裡驗證的核心事實（pipeline接入沒有讓
  // 路由數量無故增減）依然成立。
  await test('（TASK1.37後更新）createAppRouter()：auth/user/data/dashboard/profile route數量在接入pipeline後為20條', () => {
    const router = createAppRouter();
    assert.strictEqual(router.routes.length, 20);
  });

  // =========================================================================
  // D. 真正的 src/worker.js 端對端測試
  // =========================================================================

  const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
  const mod = await import(workerUrl);
  const worker = mod.default;

  const SYNC_KV = makeFakeKV();
  const DIET_COACH_IMAGES = makeFakeR2({ 'quest/scenes/terrain-1.jpg': 'FAKE_JPEG_BYTES' });
  const DIET_COACH_DB = makeFakeD1();
  const envFalse = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB };
  const envTrue = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };

  await test('（6.legacy route正常）flag=false：GET / 首頁HTML行為與TASK1.26完全一致', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), envFalse, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（6.legacy route正常）flag=true：GET / 透過router+pipeline+legacy adapter，回傳一樣的首頁HTML', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), envTrue, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（6.legacy route正常）flag=true：GET /manifest.json 內容不變', async () => {
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), envTrue, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
  });

  await test('（6.legacy route正常）flag=true：GET /icon.svg 內容不變', async () => {
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), envTrue, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  await test('（8.response一致）flag=true 與 flag=false 的首頁HTML逐位元相同（pipeline接入後仍成立）', async () => {
    const resTrue = await worker.fetch(new Request('https://example.com/'), envTrue, {});
    const resFalse = await worker.fetch(new Request('https://example.com/'), envFalse, {});
    assert.strictEqual(await resTrue.text(), await resFalse.text());
  });

  await test('（8.response一致）flag=true：POST /auth/guest 回傳格式與TASK1.26完全一致', async () => {
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), envTrue, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.user);
    assert.ok(body.data.cookie);
  });

  await test('（8.response一致）flag=true：GET /users/:id（不存在）回傳404 JSON，格式與TASK1.26完全一致', async () => {
    const res = await worker.fetch(new Request('https://example.com/users/nope'), envTrue, {});
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
  });

  await test('（8.response一致）flag=true：GET /auth/me 沒有cookie時回401，格式一致', async () => {
    const res = await worker.fetch(new Request('https://example.com/auth/me'), envTrue, {});
    assert.strictEqual(res.status, 401);
  });

  await test('（9.KV/R2正常）flag=false：POST /api/sync 成功寫入並可GET讀回', async () => {
    const postRes = await worker.fetch(new Request('https://example.com/api/sync?code=mw-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), envFalse, {});
    assert.strictEqual((await postRes.json()).ok, true);
    const getRes = await worker.fetch(new Request('https://example.com/api/sync?code=mw-1'), envFalse, {});
    assert.strictEqual(await getRes.text(), JSON.stringify({ v: 1 }));
  });

  await test('（9.KV/R2正常）flag=true：POST /api/sync 透過router+pipeline+legacy adapter一樣成功寫入並可GET讀回', async () => {
    const postRes = await worker.fetch(new Request('https://example.com/api/sync?code=mw-2', { method: 'POST', body: JSON.stringify({ v: 2 }) }), envTrue, {});
    assert.strictEqual((await postRes.json()).ok, true);
    const getRes = await worker.fetch(new Request('https://example.com/api/sync?code=mw-2'), envTrue, {});
    assert.strictEqual(await getRes.text(), JSON.stringify({ v: 2 }));
  });

  await test('（9.KV/R2正常）flag=true：POST /api/qlive 透過router+pipeline+legacy adapter一樣成功寫入並可GET讀回', async () => {
    const postRes = await worker.fetch(new Request('https://example.com/api/qlive?code=mw-3', { method: 'POST', body: JSON.stringify({ ts: 3 }) }), envTrue, {});
    assert.strictEqual((await postRes.json()).ok, true);
    const getRes = await worker.fetch(new Request('https://example.com/api/qlive?code=mw-3'), envTrue, {});
    assert.strictEqual(await getRes.text(), JSON.stringify({ ts: 3 }));
  });

  await test('（9.KV/R2正常）flag=true：GET /img/存在的物件 回傳內容與flag=false完全相同', async () => {
    const resTrue = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envTrue, {});
    const resFalse = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envFalse, {});
    assert.strictEqual(await resTrue.text(), await resFalse.text());
  });

  await test('（9.KV/R2正常）flag=true：GET /api/sync 無效code格式仍回400（legacy驗證邏輯透傳，pipeline未改變它）', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=ab'), envTrue, {});
    assert.strictEqual(res.status, 400);
  });

  await test('（延續守則）D1完全沒有任何SQL呼叫（flag=false時多次呼叫後）', async () => {
    const freshD1 = makeFakeD1();
    const env = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: freshD1 };
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=mw-d1'), env, {});
    assert.strictEqual(freshD1.calls.length, 0);
  });

  await test('（延續守則）D1完全沒有任何SQL呼叫（flag=true時多次呼叫legacy路徑後）', async () => {
    const freshD1 = makeFakeD1();
    const env = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: freshD1, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/manifest.json'), env, {});
    await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    assert.strictEqual(freshD1.calls.length, 0);
  });

  await test('（延續守則）flag=true：createApplication失敗（缺少D1）時仍安全fallback，首頁正常', async () => {
    const envTrueNoD1 = { SYNC_KV, DIET_COACH_IMAGES, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };
    const res = await worker.fetch(new Request('https://example.com/'), envTrueNoD1, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（延續守則）原始碼掃描：worker.js 的 handle(r,env) 函式體本身完全沒有變動（TASK1.27沒有動到legacy handler）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/middleware|pipeline/i.test(handleBody));
  });

  // 注意：這項斷言原本是「TASK1.27當下 src/worker.js 完全沒有異動」的
  // 一次性快照檢查，TASK1.29已合法修改worker.js的入口區塊來啟用
  // POST /auth/guest，這裡改成驗證持久有效的守則（跟上面那項handle本體
  // 未變動的檢查一致），取代已被後續任務正常超越的git diff快照檢查。
  await test('（延續守則，TASK1.29後更新）worker.js 的合法改動只會發生在 handle(r,env) 之前的入口區塊', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0);
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/middleware|pipeline|contract/i.test(handleBody));
  });

  await test('（延續守則）git diff：wrangler.toml 在TASK1.27完全沒有異動', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat wrangler.toml', { cwd: path.join(__dirname, '..', '..') }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  // =========================================================================
  // 額外：createApplication() 的 middleware 欄位
  // =========================================================================

  await test('createApplication() 回傳值多了middleware欄位，內含createMiddlewarePipeline/requireAuth/validateBody', () => {
    const app = createApplication(envFalse);
    assert.strictEqual(typeof app.middleware.createMiddlewarePipeline, 'function');
    assert.strictEqual(typeof app.middleware.requireAuth, 'function');
    assert.strictEqual(typeof app.middleware.validateBody, 'function');
  });

  await test('createApplication() 不會因為新增middleware欄位而執行任何db呼叫（純組裝）', () => {
    const freshD1 = makeFakeD1();
    createApplication({ DIET_COACH_DB: freshD1, SYNC_KV, DIET_COACH_IMAGES });
    assert.strictEqual(freshD1.calls.length, 0);
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'middleware-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

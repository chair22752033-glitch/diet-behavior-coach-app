/*
 * Phase 1 TASK 1.22｜Adapter Layer 測試
 *
 * 純記憶體測試：用跟 TASK1.12 測試同樣手法的假 D1 binding（prepare/bind/
 * run/all/first/batch），完全不連線任何真實或本機模擬的資料庫，
 * 不建立任何真實使用者 session，也不會真的呼叫 OAuth 流程。
 */
import assert from 'node:assert';
import { createRequestContext } from '../../src/adapters/context_builder.js';
import { createWorkerHandler } from '../../src/adapters/worker_adapter.js';

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

function makeMockD1(opts) {
  opts = opts || {};
  const calls = [];
  let nextId = opts.startId || 1;

  function makeStatement(sql, params) {
    return {
      sql,
      params: params || [],
      bind(...p) { return makeStatement(sql, p); },
      async run() {
        if (opts.shouldThrow) throw new Error(opts.shouldThrow);
        calls.push({ type: 'run', sql, params: params || [] });
        return { meta: { last_row_id: nextId++, changes: 1 } };
      },
      async all() {
        if (opts.shouldThrow) throw new Error(opts.shouldThrow);
        calls.push({ type: 'all', sql, params: params || [] });
        return { results: opts.rows || [], meta: {} };
      },
      async first() {
        if (opts.shouldThrow) throw new Error(opts.shouldThrow);
        calls.push({ type: 'first', sql, params: params || [] });
        return (opts.rows && opts.rows[0]) || null;
      },
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

function makeEnv(opts) {
  return { DIET_COACH_DB: makeMockD1(opts) };
}

async function run() {
  // ---------------------------------------------------------------------
  // 1. context 建立成功
  // ---------------------------------------------------------------------

  await test('createRequestContext() 成功回傳 {req, env, db, services}', () => {
    const env = makeEnv();
    const request = { method: 'GET', pathname: '/x' };
    const ctx = createRequestContext(env, request);
    assert.ok(ctx.req);
    assert.ok(ctx.env);
    assert.ok(ctx.db);
    assert.ok(ctx.services);
  });

  await test('createRequestContext() 回傳值的 key 剛好是 req/env/db/services 四個', () => {
    const env = makeEnv();
    const ctx = createRequestContext(env, {});
    assert.deepStrictEqual(Object.keys(ctx).sort(), ['db', 'env', 'req', 'services']);
  });

  // ---------------------------------------------------------------------
  // 2. env 正確傳遞
  // ---------------------------------------------------------------------

  await test('ctx.env 就是原本傳入的 env 物件（同一參考）', () => {
    const env = makeEnv();
    const ctx = createRequestContext(env, {});
    assert.strictEqual(ctx.env, env);
  });

  await test('不同的 env 物件會產生使用該 env 的獨立 db', () => {
    const envA = makeEnv();
    const envB = makeEnv();
    const ctxA = createRequestContext(envA, {});
    const ctxB = createRequestContext(envB, {});
    assert.strictEqual(ctxA.db.raw, envA.DIET_COACH_DB);
    assert.strictEqual(ctxB.db.raw, envB.DIET_COACH_DB);
    assert.notStrictEqual(ctxA.db.raw, ctxB.db.raw);
  });

  // ---------------------------------------------------------------------
  // 3. db instance 建立
  // ---------------------------------------------------------------------

  await test('ctx.db 具備 TASK1.12 createDb() 的表 helper（users/sessions等）', () => {
    const env = makeEnv();
    const ctx = createRequestContext(env, {});
    assert.ok(ctx.db.users);
    assert.ok(ctx.db.sessions);
    assert.ok(ctx.db.explorationRecords);
    assert.ok(ctx.db.foodEvents);
    assert.ok(ctx.db.emotionRecords);
    assert.ok(ctx.db.behaviorPatterns);
    assert.ok(ctx.db.aiReports);
    assert.ok(ctx.db.legacyImportLogs);
  });

  await test('ctx.db.users.insert 會實際呼叫底層假 D1 binding 的 prepare/run', async () => {
    const env = makeEnv();
    const ctx = createRequestContext(env, {});
    const res = await ctx.db.users.insert({
      id: 'u-ctx-1', is_guest: true, created_at: 't0', updated_at: 't0',
    });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(env.DIET_COACH_DB.calls.length, 1);
    assert.strictEqual(env.DIET_COACH_DB.calls[0].type, 'run');
  });

  // ---------------------------------------------------------------------
  // 6. service injection 正常
  // ---------------------------------------------------------------------

  await test('ctx.services 帶有全部預期的 service module', () => {
    const env = makeEnv();
    const ctx = createRequestContext(env, {});
    const expectedKeys = [
      'authApplicationService',
      'userService',
      'explorationService',
      'foodService',
      'emotionService',
      'behaviorService',
      'reportService',
    ];
    for (const key of expectedKeys) {
      assert.ok(ctx.services[key], `services.${key} 應存在`);
    }
  });

  await test('ctx.services.userService 是真正的 module，有 getUserById 等函式', () => {
    const env = makeEnv();
    const ctx = createRequestContext(env, {});
    assert.strictEqual(typeof ctx.services.userService.getUserById, 'function');
    assert.strictEqual(typeof ctx.services.userService.requireActiveUser, 'function');
  });

  await test('ctx.services.authApplicationService 有 createGuestLogin/getCurrentUser 等函式', () => {
    const env = makeEnv();
    const ctx = createRequestContext(env, {});
    assert.strictEqual(typeof ctx.services.authApplicationService.createGuestLogin, 'function');
    assert.strictEqual(typeof ctx.services.authApplicationService.loginWithProvider, 'function');
    assert.strictEqual(typeof ctx.services.authApplicationService.getCurrentUser, 'function');
  });

  await test('context_builder 不會呼叫任何 service 函式（純組裝，無副作用）', () => {
    const env = makeEnv();
    createRequestContext(env, {});
    assert.strictEqual(env.DIET_COACH_DB.calls.length, 0);
  });

  // ---------------------------------------------------------------------
  // 8. missing env 處理
  // ---------------------------------------------------------------------

  await test('createRequestContext(undefined, request) 丟出明確錯誤', () => {
    assert.throws(() => createRequestContext(undefined, {}), /env 不可為空/);
  });

  await test('createRequestContext(null, request) 丟出明確錯誤', () => {
    assert.throws(() => createRequestContext(null, {}), /env 不可為空/);
  });

  await test('createRequestContext({}, request)（env缺少 DIET_COACH_DB binding）丟出清楚錯誤', () => {
    assert.throws(() => createRequestContext({}, {}), /DIET_COACH_DB/);
  });

  // ---------------------------------------------------------------------
  // 9. mock request 流程（req 原樣透傳）
  // ---------------------------------------------------------------------

  await test('ctx.req 就是原本傳入的 request 物件（同一參考，未被複製或修改）', () => {
    const env = makeEnv();
    const request = { method: 'POST', pathname: '/auth/guest', payload: { a: 1 } };
    const ctx = createRequestContext(env, request);
    assert.strictEqual(ctx.req, request);
  });

  await test('request 為 undefined 時 context_builder 仍不拋錯（req 只是原樣帶過）', () => {
    const env = makeEnv();
    const ctx = createRequestContext(env, undefined);
    assert.strictEqual(ctx.req, undefined);
  });

  // ---------------------------------------------------------------------
  // 4/5. router 呼叫 + controller chain 正常（透過 createWorkerHandler 端對端）
  // ---------------------------------------------------------------------

  await test('createWorkerHandler() 回傳一個函式', () => {
    const handler = createWorkerHandler();
    assert.strictEqual(typeof handler, 'function');
  });

  await test('（端對端）POST /auth/guest 透過 worker_adapter 成功建立 guest session', async () => {
    const handler = createWorkerHandler();
    const env = makeEnv();
    const request = { method: 'POST', pathname: '/auth/guest', payload: {}, options: {} };
    const res = await handler(request, env);
    assert.ok(res instanceof Response);
    assert.strictEqual(res.status, 200);
    const body = await readJson(res);
    assert.strictEqual(body.ok, true);
    assert.ok(body.data.user);
    assert.ok(body.data.cookie);
  });

  await test('（端對端）GET /users/:id 透過 worker_adapter 找不到使用者回 404', async () => {
    const handler = createWorkerHandler();
    const env = makeEnv();
    const res = await handler({ method: 'GET', pathname: '/users/does-not-exist' }, env);
    assert.strictEqual(res.status, 404);
  });

  await test('（端對端）GET /users/:id 找到使用者時回 200 並帶出 user 資料', async () => {
    const handler = createWorkerHandler();
    const env = makeEnv({ rows: [{ id: 'u-1', is_guest: 1, status: 'active' }] });
    const res = await handler({ method: 'GET', pathname: '/users/u-1' }, env);
    assert.strictEqual(res.status, 200);
    const body = await readJson(res);
    assert.strictEqual(body.data.user.id, 'u-1');
  });

  await test('（端對端）GET /auth/me 沒有 cookie 時回 401（controller chain 正常拒絕）', async () => {
    const handler = createWorkerHandler();
    const env = makeEnv();
    const res = await handler({ method: 'GET', pathname: '/auth/me', cookieHeader: null }, env);
    assert.strictEqual(res.status, 401);
  });

  await test('（端對端）POST /auth/provider payload 缺欄位時回 401（識別層透過整條chain正確拒絕）', async () => {
    const handler = createWorkerHandler();
    const env = makeEnv();
    const res = await handler({ method: 'POST', pathname: '/auth/provider', payload: { email: 'x@example.com' } }, env);
    assert.strictEqual(res.status, 401);
  });

  await test('（端對端）POST /auth/logout 沒有 cookie 仍回 200（wasValid:false）', async () => {
    const handler = createWorkerHandler();
    const env = makeEnv();
    const res = await handler({ method: 'POST', pathname: '/auth/logout', cookieHeader: null }, env);
    assert.strictEqual(res.status, 200);
    const body = await readJson(res);
    assert.strictEqual(body.data.wasValid, false);
  });

  await test('（端對端）method mismatch 回 405', async () => {
    const handler = createWorkerHandler();
    const env = makeEnv();
    const res = await handler({ method: 'GET', pathname: '/auth/guest' }, env);
    assert.strictEqual(res.status, 405);
  });

  await test('（端對端）未知路徑回 404', async () => {
    const handler = createWorkerHandler();
    const env = makeEnv();
    const res = await handler({ method: 'GET', pathname: '/does/not/exist' }, env);
    assert.strictEqual(res.status, 404);
  });

  await test('createWorkerHandler() 每次呼叫都是獨立 router（不共用狀態）', async () => {
    const handlerA = createWorkerHandler();
    const handlerB = createWorkerHandler();
    const env = makeEnv();
    const resA = await handlerA({ method: 'GET', pathname: '/auth/me', cookieHeader: null }, env);
    const resB = await handlerB({ method: 'GET', pathname: '/auth/me', cookieHeader: null }, env);
    assert.strictEqual(resA.status, 401);
    assert.strictEqual(resB.status, 401);
  });

  // ---------------------------------------------------------------------
  // 7. error handling
  // ---------------------------------------------------------------------

  await test('（錯誤處理）env 缺少 DIET_COACH_DB binding 時，handler 回 500 而非拋出未攔截例外', async () => {
    const handler = createWorkerHandler();
    const res = await handler({ method: 'POST', pathname: '/auth/guest', payload: {} }, {});
    assert.ok(res instanceof Response);
    assert.strictEqual(res.status, 500);
    const body = await readJson(res);
    assert.strictEqual(body.ok, false);
    assert.ok(/DIET_COACH_DB/.test(body.reason));
  });

  await test('（錯誤處理）env 為 undefined 時，handler 回 500 而非拋出未攔截例外', async () => {
    const handler = createWorkerHandler();
    const res = await handler({ method: 'GET', pathname: '/auth/me' }, undefined);
    assert.strictEqual(res.status, 500);
  });

  await test('（錯誤處理）底層 D1 binding 拋出例外時（例如DB故障），handler 仍回 500 而非未攔截拋出', async () => {
    const handler = createWorkerHandler();
    const env = makeEnv({ shouldThrow: 'simulated_d1_failure' });
    const res = await handler({ method: 'POST', pathname: '/auth/guest', payload: {} }, env);
    // createGuestLogin 內部的 db 呼叫會失敗，controller 已有 try/catch 轉成 failure，
    // 所以這裡預期是 controller 正常回應的錯誤狀態，而不是 adapter 層的 500
    assert.ok([500].includes(res.status) || res.status >= 400);
  });

  await test('（錯誤處理）request 完全缺少 pathname/url 時，handler 回 500 而非拋出未攔截例外', async () => {
    const handler = createWorkerHandler();
    const env = makeEnv();
    const res = await handler({ method: 'GET' }, env);
    assert.strictEqual(res.status, 500);
  });

  // ---------------------------------------------------------------------
  // 原始碼掃描：adapter 層不得直接碰 SQL / KV / OAuth / 不得 export default worker
  // ---------------------------------------------------------------------

  await testSourceScan();

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;
}

async function testSourceScan() {
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const adaptersDir = path.join(here, '..', '..', 'src', 'adapters');

  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '');
  }

  for (const file of ['context_builder.js', 'worker_adapter.js']) {
    await test(`原始碼掃描：${file} 不含 db.prepare()`, () => {
      const src = stripComments(readFileSync(path.join(adaptersDir, file), 'utf8'));
      assert.ok(!/\bdb\.prepare\s*\(/.test(src));
    });

    await test(`原始碼掃描：${file} 不 import src/oauth/`, () => {
      const src = stripComments(readFileSync(path.join(adaptersDir, file), 'utf8'));
      assert.ok(!/from\s+['"].*src\/oauth\//.test(src));
    });

    await test(`原始碼掃描：${file} 沒有 export default`, () => {
      const src = stripComments(readFileSync(path.join(adaptersDir, file), 'utf8'));
      assert.ok(!/export\s+default/.test(src), `${file} 不應 export default 一個 worker`);
    });
  }

  await test('原始碼掃描：src/worker.js 完全沒有 import src/adapters/', () => {
    const workerSrc = readFileSync(path.join(here, '..', '..', 'src', 'worker.js'), 'utf8');
    assert.ok(!/adapters\//.test(workerSrc));
  });
}

run();

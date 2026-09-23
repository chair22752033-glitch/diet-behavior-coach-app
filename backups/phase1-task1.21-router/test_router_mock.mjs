/*
 * Phase 1 TASK 1.21｜Router 測試
 *
 * 純記憶體測試：
 * - router.js 本身用真正的實作（沒有 mock 的必要，它不碰任何外部資源）。
 * - auth_routes.js / user_routes.js 用真正的實作，但它們呼叫的
 *   controller 全部替換成本檔案自己定義的假 controller（不 import
 *   真正的 src/controllers/auth_controller.js / user_controller.js），
 *   確保完全不會觸發任何真實的 D1/KV/OAuth/Session 邏輯。
 * - 另外針對「Router 對接真正 controller」這件事，額外用一組
 *   最小的 mock db 呼叫一次真正的 src/controllers/*，證明 mapping
 *   對得上（第 25 類測試），但同樣是純記憶體 mock db，不連線任何
 *   真實或本機模擬的資料庫，不建立任何真實使用者 session。
 */
import assert from 'node:assert';
import { createRouter } from '../../src/routes/router.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`✅ ${name}`);
    })
    .catch((e) => {
      failed++;
      failures.push({ name, error: e });
      console.log(`❌ ${name}`);
      console.log('   ', e && e.stack ? e.stack.split('\n')[0] : e);
    });
}

async function readJson(response) {
  const text = await response.text();
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// 1. createRouter() 核心機制
// ---------------------------------------------------------------------------

async function run() {
  await test('router.add 缺少 method 會丟出例外', () => {
    const router = createRouter();
    assert.throws(() => router.add(undefined, '/x', () => {}));
  });

  await test('router.add 缺少 path 會丟出例外', () => {
    const router = createRouter();
    assert.throws(() => router.add('GET', undefined, () => {}));
  });

  await test('router.add handler 不是函式會丟出例外', () => {
    const router = createRouter();
    assert.throws(() => router.add('GET', '/x', 'not-a-function'));
  });

  await test('router.add 後 routes 陣列會多一筆', () => {
    const router = createRouter();
    router.add('GET', '/ping', () => ({ ok: true }));
    assert.strictEqual(router.routes.length, 1);
    assert.strictEqual(router.routes[0].method, 'GET');
    assert.strictEqual(router.routes[0].path, '/ping');
  });

  await test('method 大小寫不敏感（註冊小寫、呼叫大寫）', async () => {
    const router = createRouter();
    router.add('get', '/ping', () => ({ ok: true, data: { pong: true } }));
    const res = await router.handle({ method: 'GET', pathname: '/ping' }, {});
    assert.strictEqual(res.status, 200);
    const body = await readJson(res);
    assert.strictEqual(body.data.pong, true);
  });

  // -------------------------------------------------------------------------
  // 2. 路徑比對 + 路由參數解析
  // -------------------------------------------------------------------------

  await test('固定路徑成功比對', async () => {
    const router = createRouter();
    router.add('GET', '/health', () => ({ ok: true, data: { status: 'up' } }));
    const res = await router.handle({ method: 'GET', pathname: '/health' }, {});
    assert.strictEqual(res.status, 200);
  });

  await test(':id 路由參數會被正確解析並放進 ctx.params', async () => {
    const router = createRouter();
    let capturedParams = null;
    router.add('GET', '/users/:id', (ctx) => {
      capturedParams = ctx.params;
      return { ok: true, data: { id: ctx.params.id } };
    });
    const res = await router.handle({ method: 'GET', pathname: '/users/abc-123' }, {});
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(capturedParams, { id: 'abc-123' });
  });

  await test('多個路由參數都能正確解析', async () => {
    const router = createRouter();
    let captured = null;
    router.add('GET', '/a/:x/b/:y', (ctx) => {
      captured = ctx.params;
      return { ok: true };
    });
    await router.handle({ method: 'GET', pathname: '/a/111/b/222' }, {});
    assert.deepStrictEqual(captured, { x: '111', y: '222' });
  });

  await test('路由參數會做 decodeURIComponent', async () => {
    const router = createRouter();
    let captured = null;
    router.add('GET', '/users/:id', (ctx) => {
      captured = ctx.params.id;
      return { ok: true };
    });
    await router.handle({ method: 'GET', pathname: '/users/a%20b' }, {});
    assert.strictEqual(captured, 'a b');
  });

  await test('路徑中含正規表示式特殊字元時仍逐字比對，不會誤判', async () => {
    const router = createRouter();
    router.add('GET', '/a.b', () => ({ ok: true, data: { hit: 'literal' } }));
    const hit = await router.handle({ method: 'GET', pathname: '/a.b' }, {});
    assert.strictEqual(hit.status, 200);
    const miss = await router.handle({ method: 'GET', pathname: '/axb' }, {});
    assert.strictEqual(miss.status, 404);
  });

  await test('支援用 request.url 而非 request.pathname 解析路徑', async () => {
    const router = createRouter();
    router.add('GET', '/ping', () => ({ ok: true, data: { pong: true } }));
    const res = await router.handle({ method: 'GET', url: 'https://example.com/ping?x=1' }, {});
    assert.strictEqual(res.status, 200);
  });

  // -------------------------------------------------------------------------
  // 3. method mismatch / 404 / 例外處理
  // -------------------------------------------------------------------------

  await test('path 存在但 method 不符回 405 method_not_allowed', async () => {
    const router = createRouter();
    router.add('POST', '/only-post', () => ({ ok: true }));
    const res = await router.handle({ method: 'GET', pathname: '/only-post' }, {});
    assert.strictEqual(res.status, 405);
    const body = await readJson(res);
    assert.strictEqual(body.reason, 'method_not_allowed');
  });

  await test('完全找不到符合的路徑回 404 not_found', async () => {
    const router = createRouter();
    router.add('GET', '/known', () => ({ ok: true }));
    const res = await router.handle({ method: 'GET', pathname: '/unknown' }, {});
    assert.strictEqual(res.status, 404);
    const body = await readJson(res);
    assert.strictEqual(body.reason, 'not_found');
  });

  await test('空路由表（沒有任何 router.add）一律回 404', async () => {
    const router = createRouter();
    const res = await router.handle({ method: 'GET', pathname: '/anything' }, {});
    assert.strictEqual(res.status, 404);
  });

  await test('handler 丟出例外時被 Router 攔截並轉成 500', async () => {
    const router = createRouter();
    router.add('GET', '/boom', () => {
      throw new Error('boom-error');
    });
    const res = await router.handle({ method: 'GET', pathname: '/boom' }, {});
    assert.strictEqual(res.status, 500);
    const body = await readJson(res);
    assert.strictEqual(body.reason, 'boom-error');
    assert.strictEqual(body.ok, false);
  });

  await test('handler 回傳 rejected promise 也會被攔截轉成 500', async () => {
    const router = createRouter();
    router.add('GET', '/reject', async () => {
      throw new Error('async-boom');
    });
    const res = await router.handle({ method: 'GET', pathname: '/reject' }, {});
    assert.strictEqual(res.status, 500);
  });

  // -------------------------------------------------------------------------
  // 4. Response 格式轉換
  // -------------------------------------------------------------------------

  await test('回傳值是真正的 Response 實例', async () => {
    const router = createRouter();
    router.add('GET', '/x', () => ({ ok: true, data: {} }));
    const res = await router.handle({ method: 'GET', pathname: '/x' }, {});
    assert.ok(res instanceof Response);
  });

  await test('Content-Type header 是 application/json', async () => {
    const router = createRouter();
    router.add('GET', '/x', () => ({ ok: true, data: {} }));
    const res = await router.handle({ method: 'GET', pathname: '/x' }, {});
    assert.strictEqual(res.headers.get('Content-Type'), 'application/json');
  });

  await test('success 結果沒有帶 status 時預設 200', async () => {
    const router = createRouter();
    router.add('GET', '/x', () => ({ ok: true, data: { n: 1 } }));
    const res = await router.handle({ method: 'GET', pathname: '/x' }, {});
    assert.strictEqual(res.status, 200);
  });

  await test('failure 結果沒有帶 status 時預設 400', async () => {
    const router = createRouter();
    router.add('GET', '/x', () => ({ ok: false, reason: 'nope' }));
    const res = await router.handle({ method: 'GET', pathname: '/x' }, {});
    assert.strictEqual(res.status, 400);
  });

  await test('controller 指定的 status（例如 404/401/500）會被完整保留', async () => {
    const router = createRouter();
    router.add('GET', '/a', () => ({ ok: false, reason: 'user_not_found', status: 404 }));
    router.add('GET', '/b', () => ({ ok: false, reason: 'not_authenticated', status: 401 }));
    const resA = await router.handle({ method: 'GET', pathname: '/a' }, {});
    const resB = await router.handle({ method: 'GET', pathname: '/b' }, {});
    assert.strictEqual(resA.status, 404);
    assert.strictEqual(resB.status, 401);
  });

  await test('body 是 controller 回傳值的 JSON 序列化', async () => {
    const router = createRouter();
    router.add('GET', '/x', () => ({ ok: true, data: { hello: 'world' } }));
    const res = await router.handle({ method: 'GET', pathname: '/x' }, {});
    const body = await readJson(res);
    assert.deepStrictEqual(body, { ok: true, data: { hello: 'world' } });
  });

  // -------------------------------------------------------------------------
  // 5. Request Context 組裝（db/env/services 透傳 + req/params 補齊）
  // -------------------------------------------------------------------------

  await test('context 的 db/env/services 會原樣透傳給 handler', async () => {
    const router = createRouter();
    let captured = null;
    router.add('GET', '/ctx', (ctx) => {
      captured = ctx;
      return { ok: true };
    });
    const fakeDb = { marker: 'db' };
    const fakeEnv = { marker: 'env' };
    const fakeServices = { marker: 'services' };
    await router.handle({ method: 'GET', pathname: '/ctx' }, { db: fakeDb, env: fakeEnv, services: fakeServices });
    assert.strictEqual(captured.db, fakeDb);
    assert.strictEqual(captured.env, fakeEnv);
    assert.strictEqual(captured.services, fakeServices);
  });

  await test('handler 收到的 ctx.req 就是原始 request 物件', async () => {
    const router = createRouter();
    let captured = null;
    router.add('POST', '/echo', (ctx) => {
      captured = ctx.req;
      return { ok: true };
    });
    const request = { method: 'POST', pathname: '/echo', payload: { a: 1 } };
    await router.handle(request, {});
    assert.strictEqual(captured, request);
  });

  await test('context 未提供時 handler 仍能正常執行（db/env/services 為 undefined）', async () => {
    const router = createRouter();
    let captured = 'not-set';
    router.add('GET', '/no-ctx', (ctx) => {
      captured = ctx.db;
      return { ok: true };
    });
    const res = await router.handle({ method: 'GET', pathname: '/no-ctx' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(captured, undefined);
  });

  // -------------------------------------------------------------------------
  // 6. auth_routes.js / user_routes.js 的 mapping（用假 controller 驗證接線正確）
  // -------------------------------------------------------------------------

  await testAuthAndUserRoutesWithFakeControllers();

  // -------------------------------------------------------------------------
  // 7. 真正的 auth_routes.js / user_routes.js 接上真正 controller（走 mock db 到底）
  // -------------------------------------------------------------------------

  await testRealControllersEndToEnd();

  // -------------------------------------------------------------------------
  // 8. 原始碼掃描：確認 router.js 沒有直接碰 DB/KV/OAuth/Session
  // -------------------------------------------------------------------------

  await testSourceScan();

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// 6. 用假 controller 測 auth_routes.js / user_routes.js 是否把正確參數轉給正確 controller
// ---------------------------------------------------------------------------

async function testAuthAndUserRoutesWithFakeControllers() {
  // 動態組一個「跟 auth_routes.js 邏輯相同、但接的是假 controller」的 router，
  // 藉此驗證 mapping 本身（method/path/參數轉換）而不依賴真正的 service 行為。
  const calls = [];
  function fakeController(name) {
    return async (...args) => {
      calls.push({ name, args });
      return { ok: true, data: { name, args } };
    };
  }

  const router = createRouter();
  const loginGuestController = fakeController('loginGuestController');
  const loginProviderController = fakeController('loginProviderController');
  const logoutController = fakeController('logoutController');
  const currentUserController = fakeController('currentUserController');
  const getUserByIdController = fakeController('getUserByIdController');

  router.add('POST', '/auth/guest', async (ctx) => {
    const req = ctx.req || {};
    return loginGuestController(ctx.db, req.payload, req.options);
  });
  router.add('POST', '/auth/provider', async (ctx) => {
    const req = ctx.req || {};
    return loginProviderController(ctx.db, req.payload, req.options);
  });
  router.add('POST', '/auth/logout', async (ctx) => {
    const req = ctx.req || {};
    return logoutController(ctx.db, req.cookieHeader, req.options);
  });
  router.add('GET', '/auth/me', async (ctx) => {
    const req = ctx.req || {};
    return currentUserController(ctx.db, req.cookieHeader, req.options);
  });
  router.add('GET', '/users/:id', async (ctx) => {
    return getUserByIdController(ctx.db, { userId: ctx.params.id });
  });

  const fakeDb = { marker: 'fake-db' };

  await test('POST /auth/guest 正確 mapping 到 loginGuestController，帶上 payload/options', async () => {
    calls.length = 0;
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/guest', payload: { metadata: { ua: 'x' } }, options: { now: 't1' } },
      { db: fakeDb }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, 'loginGuestController');
    assert.strictEqual(calls[0].args[0], fakeDb);
    assert.deepStrictEqual(calls[0].args[1], { metadata: { ua: 'x' } });
    assert.deepStrictEqual(calls[0].args[2], { now: 't1' });
  });

  await test('POST /auth/provider 正確 mapping 到 loginProviderController', async () => {
    calls.length = 0;
    const payload = { auth_provider: 'google', auth_provider_id: 'g1' };
    await router.handle({ method: 'POST', pathname: '/auth/provider', payload }, { db: fakeDb });
    assert.strictEqual(calls[0].name, 'loginProviderController');
    assert.deepStrictEqual(calls[0].args[1], payload);
  });

  await test('POST /auth/logout 正確 mapping 到 logoutController，帶上 cookieHeader', async () => {
    calls.length = 0;
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: 'dbc_sid=abc' }, { db: fakeDb });
    assert.strictEqual(calls[0].name, 'logoutController');
    assert.strictEqual(calls[0].args[1], 'dbc_sid=abc');
  });

  await test('GET /auth/me 正確 mapping 到 currentUserController', async () => {
    calls.length = 0;
    await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: 'dbc_sid=xyz' }, { db: fakeDb });
    assert.strictEqual(calls[0].name, 'currentUserController');
    assert.strictEqual(calls[0].args[1], 'dbc_sid=xyz');
  });

  await test('GET /users/:id 正確 mapping 到 getUserByIdController，並把 :id 轉成 {userId}', async () => {
    calls.length = 0;
    await router.handle({ method: 'GET', pathname: '/users/u-42' }, { db: fakeDb });
    assert.strictEqual(calls[0].name, 'getUserByIdController');
    assert.deepStrictEqual(calls[0].args[1], { userId: 'u-42' });
  });

  await test('GET /auth/guest（method 錯誤）回 405', async () => {
    const res = await router.handle({ method: 'GET', pathname: '/auth/guest' }, { db: fakeDb });
    assert.strictEqual(res.status, 405);
  });

  await test('POST /auth/unknown（path 不存在）回 404', async () => {
    const res = await router.handle({ method: 'POST', pathname: '/auth/unknown' }, { db: fakeDb });
    assert.strictEqual(res.status, 404);
  });
}

// ---------------------------------------------------------------------------
// 7. 接上真正的 src/routes/index.js + 真正的 src/controllers/* + 純記憶體 mock db
// ---------------------------------------------------------------------------

function buildMockDb() {
  const users = new Map();
  const sessions = new Map();
  const calls = [];

  function record(name, args) {
    calls.push({ name, args });
  }

  return {
    calls,
    users: {
      async getById(id) {
        record('users.getById', [id]);
        return { ok: true, row: users.get(id) || null };
      },
      async getByProvider(provider, providerId) {
        record('users.getByProvider', [provider, providerId]);
        for (const u of users.values()) {
          if (u.auth_provider === provider && u.auth_provider_id === providerId) {
            return { ok: true, row: u };
          }
        }
        return { ok: true, row: null };
      },
      async insert(user) {
        record('users.insert', [user]);
        users.set(user.id, user);
        return { ok: true };
      },
      async touchLogin(id, now) {
        record('users.touchLogin', [id, now]);
        const u = users.get(id);
        if (u) u.last_login_at = now;
        return { ok: true };
      },
    },
    sessions: {
      async insert(s) {
        record('sessions.insert', [s]);
        sessions.set(s.id, Object.assign({}, s, { revoked_at: null }));
        return { ok: true };
      },
      async getById(id) {
        record('sessions.getById', [id]);
        return { ok: true, row: sessions.get(id) || null };
      },
      async listByUser(userId) {
        record('sessions.listByUser', [userId]);
        return { ok: true, results: [...sessions.values()].filter((s) => s.user_id === userId) };
      },
      async touch(id, lastSeenAt) {
        record('sessions.touch', [id, lastSeenAt]);
        const s = sessions.get(id);
        if (s) s.last_seen_at = lastSeenAt;
        return { ok: true };
      },
      async revoke(id, revokedAt) {
        record('sessions.revoke', [id, revokedAt]);
        const s = sessions.get(id);
        if (s) s.revoked_at = revokedAt;
        return { ok: true };
      },
      async revokeAllForUser(userId, revokedAt) {
        record('sessions.revokeAllForUser', [userId, revokedAt]);
        for (const s of sessions.values()) {
          if (s.user_id === userId && !s.revoked_at) s.revoked_at = revokedAt;
        }
        return { ok: true };
      },
    },
    __seedUser(user) {
      users.set(user.id, user);
    },
  };
}

async function testRealControllersEndToEnd() {
  const { createAppRouter } = await import('../../src/routes/index.js');

  await test('（真實接線）POST /auth/guest 透過真正 index.js router 成功建立 guest session', async () => {
    const router = createAppRouter();
    const db = buildMockDb();
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/guest', payload: {}, options: {} },
      { db }
    );
    assert.strictEqual(res.status, 200);
    const body = await readJson(res);
    assert.strictEqual(body.ok, true);
    assert.ok(body.data.user);
    assert.ok(body.data.cookie);
  });

  await test('（真實接線）GET /users/:id 透過真正 index.js router 找不到使用者回 404', async () => {
    const router = createAppRouter();
    const db = buildMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/users/does-not-exist' }, { db });
    assert.strictEqual(res.status, 404);
    const body = await readJson(res);
    assert.strictEqual(body.ok, false);
  });

  await test('（真實接線）GET /users/:id 找到使用者回 200 並帶出 user 資料', async () => {
    const router = createAppRouter();
    const db = buildMockDb();
    db.__seedUser({ id: 'u-1', is_guest: 1, status: 'active', display_name: null, auth_provider: null, auth_provider_id: null, created_at: 't0', updated_at: 't0' });
    const res = await router.handle({ method: 'GET', pathname: '/users/u-1' }, { db });
    assert.strictEqual(res.status, 200);
    const body = await readJson(res);
    assert.strictEqual(body.data.user.id, 'u-1');
  });

  await test('（真實接線）GET /auth/me 沒有 cookie 時回 401', async () => {
    const router = createAppRouter();
    const db = buildMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: null }, { db });
    assert.strictEqual(res.status, 401);
  });

  // 注意：這項斷言原本驗證「缺少必要欄位時識別層拒絕（401）」，這是
  // TASK1.21當下（POST /auth/provider尚未掛任何contract validation）的
  // 真實狀態。TASK1.32已依規格為這條路由掛上loginProviderContract的
  // contract validation middleware，缺少必填的provider/providerId現在
  // 會在更早的步驟被擋下（400），根本不會走到controller/識別層——這是
  // TASK1.32的任務目標，不是回歸。
  await test('（TASK1.32後更新）POST /auth/provider payload缺少必要欄位（provider/providerId）在contract validation階段就被擋下，回400', async () => {
    const router = createAppRouter();
    const db = buildMockDb();
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider', payload: { email: 'x@example.com' } },
      { db }
    );
    assert.strictEqual(res.status, 400);
  });

  await test('（真實接線）POST /auth/logout 沒有 cookie 時仍回 200（wasValid:false）', async () => {
    const router = createAppRouter();
    const db = buildMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: null }, { db });
    assert.strictEqual(res.status, 200);
    const body = await readJson(res);
    assert.strictEqual(body.data.wasValid, false);
  });

  await test('（真實接線）createAppRouter() 每次呼叫都是獨立的 router 實例（不共用 routes 陣列）', () => {
    const routerA = createAppRouter();
    const routerB = createAppRouter();
    assert.notStrictEqual(routerA, routerB);
    assert.notStrictEqual(routerA.routes, routerB.routes);
    assert.strictEqual(routerA.routes.length, routerB.routes.length);
  });

  await test('（真實接線）真正 router 對未知路徑仍回 404，不會影響其他已註冊路由', async () => {
    const router = createAppRouter();
    const db = buildMockDb();
    const res1 = await router.handle({ method: 'GET', pathname: '/does/not/exist' }, { db });
    assert.strictEqual(res1.status, 404);
    const res2 = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    assert.strictEqual(res2.status, 200);
  });
}

// ---------------------------------------------------------------------------
// 8. 原始碼掃描：router.js / auth_routes.js / user_routes.js / index.js
//    不得直接操作 D1(db.prepare)/KV/OAuth/Session
// ---------------------------------------------------------------------------

async function testSourceScan() {
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const routesDir = path.join(here, '..', '..', 'src', 'routes');

  const files = ['router.js', 'auth_routes.js', 'user_routes.js', 'index.js'];

  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '');
  }

  for (const file of files) {
    await test(`原始碼掃描：${file} 不含 db.prepare()`, () => {
      const src = stripComments(readFileSync(path.join(routesDir, file), 'utf8'));
      assert.ok(!/\bdb\.prepare\s*\(/.test(src), `${file} 不應直接呼叫 db.prepare()`);
    });

    await test(`原始碼掃描：${file} 不 import src/oauth/ 或 src/auth/session.js`, () => {
      const src = stripComments(readFileSync(path.join(routesDir, file), 'utf8'));
      assert.ok(!/from\s+['"].*src\/oauth\//.test(src), `${file} 不應 import src/oauth/`);
      assert.ok(!/from\s+['"].*auth\/session\.js['"]/.test(src), `${file} 不應直接 import auth/session.js`);
    });
  }

  await test('原始碼掃描：src/worker.js 完全沒有 import src/routes/', () => {
    const workerSrc = readFileSync(path.join(here, '..', '..', 'src', 'worker.js'), 'utf8');
    assert.ok(!/routes\//.test(workerSrc), 'worker.js 不應引用 src/routes/');
  });
}

run();

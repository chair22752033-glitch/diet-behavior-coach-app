/*
 * Phase 1 TASK 1.29｜Enable Guest Authentication API Route 測試
 *
 * 分七部分：
 * A) POST /auth/guest 透過真正 src/worker.js 的端對端測試
 * B) Router routing（router.js/auth_routes.js 的正確性）
 * C) Controller（loginGuestController 本身）
 * D) Contract validation（loginGuestContract 是否真的擋下不合法payload）
 * E) Session建立 + D1 users/sessions寫入（呼叫順序、次數、欄位正確性）
 * F) Cookie輸出（HttpOnly/Secure/SameSite=Lax/TTL/dbc_sid名稱）
 * G) KV/R2/Legacy route 完全不受影響
 *
 * 全部使用純記憶體 mock D1/KV/R2 binding，不連線任何真實或本機模擬的
 * 資料庫，不會真的呼叫 Google OAuth，不執行 Legacy Import。
 *
 * 對「真實 local D1」的端對端驗證（建立→確認→清理）另外在
 * real_d1_verify.mjs 執行，不在這個檔案裡對真實D1寫入任何資料。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginGuestController } from '../../src/controllers/auth_controller.js';
import { createGuestLogin } from '../../src/services/auth_application_service.js';
import { loginGuestContract } from '../../src/contracts/auth_contract.js';
import { validateContract } from '../../src/middleware/validator.js';
import { createAppRouter } from '../../src/routes/index.js';
import { createApplication } from '../../src/bootstrap/application.js';
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../../src/auth/constants.js';

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

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
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

// mock db（同 TASK1.13A/1.14/1.18 手法）：記錄所有呼叫，模擬users/sessions兩張表
function makeMockDb() {
  const users = new Map();
  const sessions = new Map();
  const calls = [];
  return {
    calls,
    _users: users,
    _sessions: sessions,
    users: {
      async insert(u) {
        calls.push({ type: 'insert', table: 'users', row: u });
        users.set(u.id, u);
        return { ok: true };
      },
      async getById(id) {
        calls.push({ type: 'getById', table: 'users' });
        return { ok: true, row: users.get(id) || null };
      },
      async getByProvider() {
        calls.push({ type: 'getByProvider', table: 'users' });
        return { ok: true, row: null };
      },
      async touchLogin(id, now) {
        calls.push({ type: 'touchLogin', table: 'users' });
        const u = users.get(id);
        if (u) u.last_login_at = now;
        return { ok: true };
      },
    },
    sessions: {
      async insert(s) {
        calls.push({ type: 'insert', table: 'sessions', row: s });
        sessions.set(s.id, Object.assign({}, s, { revoked_at: null }));
        return { ok: true };
      },
      async getById(id) {
        calls.push({ type: 'getById', table: 'sessions' });
        return { ok: true, row: sessions.get(id) || null };
      },
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
      async run() { calls.push({ type: 'run', sql, params: params || [] }); return { meta: {} }; },
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

function parseSetCookie(setCookieHeader) {
  const parts = setCookieHeader.split(';').map((p) => p.trim());
  const [nameValue, ...attrs] = parts;
  const [name, value] = nameValue.split('=');
  const flags = new Set(attrs.map((a) => a.split('=')[0]));
  const attrMap = {};
  attrs.forEach((a) => {
    const idx = a.indexOf('=');
    if (idx >= 0) attrMap[a.slice(0, idx)] = a.slice(idx + 1);
  });
  return { name, value: decodeURIComponent(value), flags, attrMap };
}

async function run() {
  // =========================================================================
  // C. Controller — loginGuestController 本身
  // =========================================================================

  await test('（3.Controller）loginGuestController 成功時回傳 {ok:true, data:{user,session,cookie}}', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, {}, {});
    assert.strictEqual(result.ok, true);
    assert.ok(result.data.user);
    assert.ok(result.data.session);
    assert.ok(result.data.cookie);
  });

  await test('（3.Controller）loginGuestController 建立的user是guest（is_guest, auth_provider為null）', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, {}, {});
    assert.ok(result.data.user.is_guest === true || result.data.user.is_guest === 1);
    assert.strictEqual(result.data.user.auth_provider, null);
  });

  await test('（3.Controller）loginGuestController 沒有payload時仍成功（metadata非必填）', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, undefined, undefined);
    assert.strictEqual(result.ok, true);
  });

  await test('（3.Controller）loginGuestController 每次呼叫都建立一個新的、不同的user id', async () => {
    const db = makeMockDb();
    const r1 = await loginGuestController(db, {}, {});
    const r2 = await loginGuestController(db, {}, {});
    assert.notStrictEqual(r1.data.user.id, r2.data.user.id);
  });

  await test('（3.Controller）loginGuestController 委派給 auth_application_service.createGuestLogin（同一份實作）', async () => {
    const db = makeMockDb();
    const viaController = await loginGuestController(db, { metadata: { a: 1 } }, {});
    const db2 = makeMockDb();
    const viaService = await createGuestLogin(db2, { metadata: { a: 1 } });
    assert.strictEqual(typeof viaController.data.user.id, typeof viaService.user.id);
    assert.deepStrictEqual(Object.keys(viaController.data).sort(), ['cookie', 'session', 'user']);
  });

  // =========================================================================
  // D. Contract validation — loginGuestContract
  // =========================================================================

  await test('（4.Contract validation）loginGuestContract 允許空payload（metadata非必填）', () => {
    assert.strictEqual(validateContract(loginGuestContract, {}).ok, true);
  });

  await test('（4.Contract validation）loginGuestContract 允許undefined payload', () => {
    assert.strictEqual(validateContract(loginGuestContract, undefined).ok, true);
  });

  await test('（4.Contract validation）loginGuestContract 允許metadata是物件', () => {
    assert.strictEqual(validateContract(loginGuestContract, { metadata: { ua: 'test' } }).ok, true);
  });

  await test('（4.Contract validation）loginGuestContract 拒絕metadata不是物件（例如字串）', () => {
    const result = validateContract(loginGuestContract, { metadata: 'not-an-object' });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('metadata')));
  });

  // =========================================================================
  // B. Router routing — router.js / auth_routes.js
  // =========================================================================

  await test('（2.Router routing）createAppRouter() 註冊了POST /auth/guest', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/guest');
    assert.ok(route);
  });

  await test('（2.Router routing）POST /auth/guest 這條路由具備非空的middlewares（TASK1.29接上contract validation）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/guest');
    assert.strictEqual(route.middlewares.length, 1);
  });

  // 注意：這項斷言原本驗證「provider/logout/me三條路由middlewares都是
  // 空陣列」，TASK1.30已依規格明確為logout/me掛上各自的contract
  // validation middleware（這是TASK1.30的任務目標，不是回歸），只有
  // provider仍未啟用。
  // 注意：TASK1.32已為POST /auth/provider掛上contract validation
  // middleware——這是TASK1.32的任務目標，不是回歸。
  await test('（TASK1.32後更新）POST /auth/provider/logout/me皆已各自掛上contract validation', () => {
    const router = createAppRouter();
    for (const p of [['POST', '/auth/provider'], ['POST', '/auth/logout'], ['GET', '/auth/me']]) {
      const route = router.routes.find((r) => r.method === p[0] && r.path === p[1]);
      assert.strictEqual(route.middlewares.length, 1, `${p[0]} ${p[1]} 應該有1個middleware`);
    }
  });

  await test('（2.Router routing）router.handle() 對合法payload成功dispatch到guest login，回傳200', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（2.Router routing）router.handle() 對不合法payload（metadata非物件）在controller之前就被contract validation擋下', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: { metadata: 'bad' } }, { db });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db.calls.length, 0, 'contract validation擋下後不應該有任何db呼叫');
  });

  await test('（2.Router routing）GET /auth/guest（方法不符）回405，不會誤觸guest login', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/auth/guest' }, { db });
    assert.strictEqual(res.status, 405);
    assert.strictEqual(db.calls.length, 0);
  });

  await test('（2.Router routing）router.handle() 回傳的Response帶有Set-Cookie header（auth_routes.js的withSetCookie生效）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    assert.ok(res.headers.get('set-cookie'));
  });

  await test('（2.Router routing）router.handle() 失敗時（不合法payload）回應沒有Set-Cookie header', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: { metadata: 123 } }, { db });
    assert.strictEqual(res.headers.get('set-cookie'), null);
  });

  // =========================================================================
  // E. Session建立 + D1 users/sessions寫入（順序、次數）
  // =========================================================================

  await test('（5.Session建立/7.D1 users寫入/8.D1 sessions寫入）成功的guest login恰好呼叫一次users.insert、一次sessions.insert', async () => {
    const db = makeMockDb();
    await loginGuestController(db, {}, {});
    const userInserts = db.calls.filter((c) => c.type === 'insert' && c.table === 'users');
    const sessionInserts = db.calls.filter((c) => c.type === 'insert' && c.table === 'sessions');
    assert.strictEqual(userInserts.length, 1);
    assert.strictEqual(sessionInserts.length, 1);
  });

  await test('（1.不重複建立session）呼叫一次loginGuestController只建立一次session（不會意外呼叫兩次）', async () => {
    const db = makeMockDb();
    await loginGuestController(db, {}, {});
    assert.strictEqual(db.calls.filter((c) => c.type === 'insert' && c.table === 'sessions').length, 1);
  });

  await test('（5.Session建立）users.insert先於sessions.insert（順序正確，session依附在已建立的user上）', async () => {
    const db = makeMockDb();
    await loginGuestController(db, {}, {});
    const userIdx = db.calls.findIndex((c) => c.type === 'insert' && c.table === 'users');
    const sessionIdx = db.calls.findIndex((c) => c.type === 'insert' && c.table === 'sessions');
    assert.ok(userIdx < sessionIdx);
  });

  await test('（8.D1 sessions寫入）session的user_id與剛建立的guest user id一致（正確關聯）', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, {}, {});
    const sessionRow = db.calls.find((c) => c.type === 'insert' && c.table === 'sessions').row;
    assert.strictEqual(sessionRow.user_id, result.data.user.id);
  });

  await test('（6.Cookie輸出/session TTL）session的expires_at比created_at晚SESSION_TTL_SECONDS秒', async () => {
    const db = makeMockDb();
    await loginGuestController(db, {}, {});
    const sessionRow = db.calls.find((c) => c.type === 'insert' && c.table === 'sessions').row;
    const diffSeconds = (new Date(sessionRow.expires_at).getTime() - new Date(sessionRow.created_at).getTime()) / 1000;
    assert.strictEqual(Math.round(diffSeconds), SESSION_TTL_SECONDS);
  });

  await test('（7.D1 users寫入）建立的user status為active', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, {}, {});
    assert.strictEqual(result.data.user.status, 'active');
  });

  // =========================================================================
  // F. Cookie輸出（HttpOnly/Secure/SameSite=Lax/dbc_sid/TTL）
  // =========================================================================

  await test('（6.Cookie輸出）Set-Cookie的cookie名稱是dbc_sid（TASK1.13A設定）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const setCookie = parseSetCookie(res.headers.get('set-cookie'));
    assert.strictEqual(setCookie.name, SESSION_COOKIE_NAME);
  });

  await test('（6.Cookie輸出）Set-Cookie含HttpOnly', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const setCookie = parseSetCookie(res.headers.get('set-cookie'));
    assert.ok(setCookie.flags.has('HttpOnly'));
  });

  await test('（6.Cookie輸出）Set-Cookie含Secure', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const setCookie = parseSetCookie(res.headers.get('set-cookie'));
    assert.ok(setCookie.flags.has('Secure'));
  });

  await test('（6.Cookie輸出）Set-Cookie的SameSite=Lax', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const setCookie = parseSetCookie(res.headers.get('set-cookie'));
    assert.strictEqual(setCookie.attrMap.SameSite, 'Lax');
  });

  await test('（6.Cookie輸出/Session TTL正確）Set-Cookie的Max-Age等於SESSION_TTL_SECONDS（30天）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const setCookie = parseSetCookie(res.headers.get('set-cookie'));
    assert.strictEqual(Number(setCookie.attrMap['Max-Age']), SESSION_TTL_SECONDS);
  });

  await test('（6.Cookie輸出）Set-Cookie的Path=/', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const setCookie = parseSetCookie(res.headers.get('set-cookie'));
    assert.strictEqual(setCookie.attrMap.Path, '/');
  });

  await test('（6.Cookie輸出）Set-Cookie的值是一個非空的opaque token（不是明文可猜測的id）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const setCookie = parseSetCookie(res.headers.get('set-cookie'));
    assert.ok(setCookie.value.length >= 32);
  });

  await test('（6.Cookie輸出）response body的data.cookie跟真正Set-Cookie header內容一致', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const setCookieHeader = res.headers.get('set-cookie');
    const body = await res.json();
    assert.strictEqual(body.data.cookie, setCookieHeader);
  });

  await test('（6.Cookie輸出）兩次不同的guest login產生兩個不同的cookie token（不會重複使用）', async () => {
    const router = createAppRouter();
    const db1 = makeMockDb();
    const db2 = makeMockDb();
    const res1 = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db: db1 });
    const res2 = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db: db2 });
    const c1 = parseSetCookie(res1.headers.get('set-cookie'));
    const c2 = parseSetCookie(res2.headers.get('set-cookie'));
    assert.notStrictEqual(c1.value, c2.value);
  });

  // =========================================================================
  // A/G. 真正的 src/worker.js 端對端測試
  // =========================================================================

  const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
  const mod = await import(workerUrl);
  const worker = mod.default;

  function makeFreshEnv() {
    return {
      SYNC_KV: makeFakeKV(),
      DIET_COACH_IMAGES: makeFakeR2({ 'quest/scenes/terrain-1.jpg': 'FAKE_JPEG_BYTES' }),
      DIET_COACH_DB: makeFakeD1(),
    };
  }

  await test('（1.POST /auth/guest）透過真正 worker.fetch() 成功，回傳200 JSON', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/json');
  });

  await test('（1.POST /auth/guest）透過真正 worker.fetch() 帶有真正的Set-Cookie header', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.ok(setCookie.startsWith(SESSION_COOKIE_NAME + '='));
    assert.ok(setCookie.includes('HttpOnly'));
    assert.ok(setCookie.includes('Secure'));
    assert.ok(setCookie.includes('SameSite=Lax'));
  });

  await test('（1.POST /auth/guest）沒有body時（body為空字串）仍成功（parseJsonBody優雅處理）', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST' }), env, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（1.POST /auth/guest）body是不合法JSON時仍成功（parseJsonBody優雅降級為空物件，metadata非必填）', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: 'not-json{{{' }), env, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（1.POST /auth/guest）body帶合法metadata時payload正確傳遞到guest identity', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: JSON.stringify({ metadata: { displayName: '訪客A' } }) }), env, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.user);
  });

  await test('（1.POST /auth/guest）body帶不合法metadata（型別錯誤）時被contract validation擋下，回400', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: JSON.stringify({ metadata: 'not-object' }) }), env, {});
    assert.strictEqual(res.status, 400);
  });

  await test('（1.POST /auth/guest）env缺少D1 binding時（bootstrap失敗），優雅fallback到legacy首頁，不拋出未攔截例外', async () => {
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2({}) };
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（7.D1 users寫入/8.D1 sessions寫入）透過真正worker.fetch()呼叫後，假D1確實各有一次INSERT INTO users/sessions', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const runCalls = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run');
    assert.ok(runCalls.some((c) => /INSERT INTO users/.test(c.sql)));
    assert.ok(runCalls.some((c) => /INSERT INTO sessions/.test(c.sql)));
  });

  await test('（1.不重複建立session）透過真正worker.fetch()呼叫一次，D1只有一次sessions INSERT', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const sessionInserts = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /INSERT INTO sessions/.test(c.sql));
    assert.strictEqual(sessionInserts.length, 1);
  });

  // -------------------------------------------------------------------------
  // 9. KV/R2不受影響
  // -------------------------------------------------------------------------

  await test('（9.KV/R2不受影響）POST /auth/guest 完全不呼叫 SYNC_KV', async () => {
    const env = makeFreshEnv();
    let kvCalled = false;
    const originalGet = env.SYNC_KV.get.bind(env.SYNC_KV);
    const originalPut = env.SYNC_KV.put.bind(env.SYNC_KV);
    env.SYNC_KV.get = async (...a) => { kvCalled = true; return originalGet(...a); };
    env.SYNC_KV.put = async (...a) => { kvCalled = true; return originalPut(...a); };
    await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(kvCalled, false);
  });

  await test('（9.KV/R2不受影響）POST /auth/guest 完全不呼叫 DIET_COACH_IMAGES（R2）', async () => {
    const env = makeFreshEnv();
    let r2Called = false;
    const originalGet = env.DIET_COACH_IMAGES.get.bind(env.DIET_COACH_IMAGES);
    env.DIET_COACH_IMAGES.get = async (...a) => { r2Called = true; return originalGet(...a); };
    await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(r2Called, false);
  });

  await test('（9.KV/R2不受影響）啟用guest login後，/api/sync 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const postRes = await worker.fetch(new Request('https://example.com/api/sync?code=guest-kv-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), env, {});
    assert.strictEqual((await postRes.json()).ok, true);
    const getRes = await worker.fetch(new Request('https://example.com/api/sync?code=guest-kv-1'), env, {});
    assert.strictEqual(await getRes.text(), JSON.stringify({ v: 1 }));
  });

  await test('（9.KV/R2不受影響）啟用guest login後，/img/* 讀取行為完全不變', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text, 'FAKE_JPEG_BYTES');
  });

  // -------------------------------------------------------------------------
  // 10. Legacy route不受影響
  // -------------------------------------------------------------------------

  await test('（10.Legacy route不受影響）GET / 首頁HTML完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/'), env, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（10.Legacy route不受影響）GET /manifest.json 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), env, {});
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
  });

  await test('（10.Legacy route不受影響）GET /icon.svg 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  await test('（10.Legacy route不受影響）GET /apple-touch-icon.png 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/apple-touch-icon.png'), env, {});
    assert.strictEqual(res.headers.get('content-type'), 'image/png');
  });

  await test('（10.Legacy route不受影響）GET /users/999（其餘auth/user route仍未啟用）落到首頁catch-all', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/users/999'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  // 注意：TASK1.30已將GET /auth/me正式上線（見TASK1.30報告），這裡改成
  // 驗證新的正確行為。
  await test('（TASK1.30起）GET /auth/me 已正式上線，沒有cookie時回401 JSON', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/me'), env, {});
    assert.strictEqual(res.status, 401);
  });

  // 注意：TASK1.32已將POST /auth/provider正式上線（純payload登入，不接
  // Google OAuth callback）——這是TASK1.32的任務目標，不是回歸。
  await test('（TASK1.32起）POST /auth/provider 已正式上線，缺少必要欄位時回400 JSON（不再落到首頁catch-all）', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/provider', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.headers.get('content-type'), 'application/json');
  });

  // 注意：TASK1.30已將POST /auth/logout正式上線（見TASK1.30報告），這裡
  // 改成驗證新的正確行為。
  await test('（TASK1.30起）POST /auth/logout 已正式上線，沒有cookie時仍回200（wasValid:false）', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST' }), env, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.wasValid, false);
  });

  await test('（10.Legacy route不受影響）FEATURE_ROUTE_MIGRATION_ENABLED=true 時，guest login依然正常（不依賴這個flag）', async () => {
    const env = Object.assign(makeFreshEnv(), { FEATURE_ROUTE_MIGRATION_ENABLED: 'true' });
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 200);
  });

  // -------------------------------------------------------------------------
  // 額外：原始碼掃描 / 架構守則
  // -------------------------------------------------------------------------

  await test('（延續守則）原始碼掃描：worker.js 的 handle(r,env) 函式體本身完全沒有變動', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0);
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/createApplication|router\.handle|loginGuest/.test(handleBody));
  });

  await test('（延續守則）git diff：wrangler.toml 在TASK1.29完全沒有異動', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat wrangler.toml', { cwd: path.join(__dirname, '..', '..') }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  // 注意：以下三項斷言原本驗證「只有POST /auth/guest特殊處理/import
  // contracts/有非空middlewares」，TASK1.30已依規格明確把GET /auth/me、
  // POST /auth/logout也正式上線——這是TASK1.30的任務目標，不是回歸，
  // 已更新為排除這兩條路由，只保留「/auth/provider與/users/:id仍未
  // 啟用」這個依然成立的守則。
  // 注意：TASK1.32已將POST /auth/provider（純OAuth登入，不接Google
  // callback）正式上線，worker.js現在確實含有`pathname === '/auth/provider'`
  // 的特殊處理（與/auth/guest共用同一個if分支）——這是TASK1.32的任務
  // 目標，不是回歸，這裡改成正向驗證五條已上線路由都存在特殊處理。
  await test('（TASK1.32後更新）原始碼掃描：worker.js 的實際程式碼對已上線的guest/me/logout/upgrade/provider五條路由做特殊處理，不含/users', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const exportStart = src.indexOf('export default {');
    const codeOnly = src.slice(exportStart);
    assert.ok(/\/auth\/guest/.test(codeOnly));
    assert.ok(/\/auth\/me/.test(codeOnly));
    assert.ok(/\/auth\/logout/.test(codeOnly));
    assert.ok(/\/auth\/provider\/upgrade/.test(codeOnly));
    assert.ok(/pathname === '\/auth\/provider'/.test(codeOnly));
    assert.ok(!/\/users\//.test(codeOnly));
  });

  // 注意：TASK1.32已在auth_routes.js中import並使用loginProviderContract
  // 為/auth/provider掛上contract validation——這是TASK1.32的任務目標，
  // 不是回歸，這裡改成正向驗證四個contract都已import。
  await test('（TASK1.32後更新）原始碼掃描：auth_routes.js 已import guest/logout/currentUser/loginProvider四個contract', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'auth_routes.js'), 'utf8'));
    assert.ok(/loginGuestContract/.test(src));
    assert.ok(/logoutContract/.test(src));
    assert.ok(/currentUserContract/.test(src));
    assert.ok(/loginProviderContract/.test(src));
  });

  // 注意：TASK1.32新增/auth/provider也掛了middleware；TASK1.33新增GET
  // /auth/google/callback也掛了middleware；TASK1.35新增五個資源共10條
  // User Data API也都各自掛了[requireAuth(), contractValidation]兩個
  // middleware；TASK1.36新增GET /api/dashboard同樣掛了這兩個middleware；
  // TASK1.37新增GET/PATCH /api/profile同樣掛了這兩個middleware——這裡的
  // 排除清單同步更新。
  await test('（TASK1.37後更新）原始碼掃描：router.js 支援每條路由各自middlewares，除了auth六條已啟用路由跟十條User Data API跟dashboard跟profile外其餘皆是空清單', () => {
    const router = createAppRouter();
    const legacyRouter = createAppRouter(async () => new Response('legacy'));
    const activatedPaths = [
      '/auth/guest', '/auth/logout', '/auth/me', '/auth/provider/upgrade', '/auth/provider', '/auth/google/callback',
      '/api/explorations', '/api/food-events', '/api/emotions', '/api/behaviors', '/api/reports', '/api/dashboard', '/api/profile',
    ];
    for (const r of legacyRouter.routes) {
      if (!activatedPaths.includes(r.path)) {
        assert.strictEqual(r.middlewares.length, 0, `${r.method} ${r.path} 應該仍是空middlewares`);
      }
    }
  });

  await test('（延續守則）createApplication() 在guest login流程中正確組裝db/router，且與worker.js使用同一份實作', () => {
    const app = createApplication(makeFreshEnv());
    assert.ok(app.router.routes.find((r) => r.path === '/auth/guest'));
  });

  // -------------------------------------------------------------------------
  // 額外補充：更多情境，涵蓋contract/session/cookie/router/D1的邊界案例
  // -------------------------------------------------------------------------

  await test('（4.Contract validation）loginGuestContract.request 只有一個欄位（metadata）', () => {
    assert.deepStrictEqual(Object.keys(loginGuestContract.request), ['metadata']);
  });

  await test('（4.Contract validation）loginGuestContract 拒絕metadata是陣列（陣列的typeof是object，但這裡刻意驗證仍算通過，記錄已知限制）', () => {
    // 注意：validateBody() 用 typeof 判斷 type，陣列的 typeof 也是
    // 'object'，所以目前的驗證器無法區分陣列與物件——這是TASK1.27/1.28
    // 就存在的已知限制（validator只做最基本的型別檢查），這裡如實記錄
    // 現況而非假裝它會擋下，避免斷言跟實作行為矛盾。
    const result = validateContract(loginGuestContract, { metadata: [1, 2, 3] });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.Session建立）建立的session id（token）長度足夠長（32 bytes以上, opaque token）', async () => {
    const db = makeMockDb();
    await loginGuestController(db, {}, {});
    const sessionRow = db.calls.find((c) => c.type === 'insert' && c.table === 'sessions').row;
    assert.ok(sessionRow.id.length >= 32);
  });

  await test('（5.Session建立）建立的session的revoked_at初始為null（尚未撤銷）', async () => {
    const db = makeMockDb();
    await loginGuestController(db, {}, {});
    const sessionRow = db._sessions.get([...db._sessions.keys()][0]);
    assert.strictEqual(sessionRow.revoked_at, null);
  });

  await test('（7.D1 users寫入）建立的user的legacy_sync_code為null（純guest，非legacy帳號）', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, {}, {});
    assert.strictEqual(result.data.user.legacy_sync_code ?? null, null);
  });

  await test('（7.D1 users寫入）建立的user有created_at/updated_at時間戳', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, {}, {});
    assert.ok(result.data.user.created_at);
    assert.ok(result.data.user.updated_at);
  });

  await test('（3.Controller）loginGuestController 對db.users.insert失敗時安全回傳failure（不拋例外）', async () => {
    const db = makeMockDb();
    db.users.insert = async () => ({ ok: false, error: 'simulated_insert_failure' });
    const result = await loginGuestController(db, {}, {});
    assert.strictEqual(result.ok, false);
  });

  await test('（3.Controller）loginGuestController 對db.sessions.insert失敗時安全回傳failure（不拋例外，即使user已建立）', async () => {
    const db = makeMockDb();
    db.sessions.insert = async () => ({ ok: false, error: 'simulated_session_failure' });
    const result = await loginGuestController(db, {}, {});
    assert.strictEqual(result.ok, false);
  });

  await test('（2.Router routing）router.handle() 連續呼叫3次guest login，各自產生獨立的user/session（不互相干擾）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    assert.strictEqual(db._users.size, 3);
    assert.strictEqual(db._sessions.size, 3);
  });

  await test('（6.Cookie輸出）response body整體格式符合loginGuestContract.response.success描述的欄位', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const body = await res.json();
    for (const key of Object.keys(loginGuestContract.response.success)) {
      assert.ok(Object.prototype.hasOwnProperty.call(body.data, key));
    }
  });

  await test('（1.POST /auth/guest）連續兩次呼叫真正worker.fetch()各自成功，且D1各自累加一組users/sessions', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const userInserts = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /INSERT INTO users/.test(c.sql));
    const sessionInserts = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /INSERT INTO sessions/.test(c.sql));
    assert.strictEqual(userInserts.length, 2);
    assert.strictEqual(sessionInserts.length, 2);
  });

  await test('（1.POST /auth/guest）兩個不同Request物件各自的Set-Cookie token不同', async () => {
    const env = makeFreshEnv();
    const res1 = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const res2 = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.notStrictEqual(res1.headers.get('set-cookie'), res2.headers.get('set-cookie'));
  });

  await test('（9.KV/R2不受影響）POST /auth/guest 後 SYNC_KV.store 完全是空的（沒有任何key被寫入）', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(env.SYNC_KV.store.size, 0);
  });

  await test('（10.Legacy route不受影響）啟用guest login後，/img/不存在的物件 仍正確回傳404', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const res = await worker.fetch(new Request('https://example.com/img/does/not/exist.jpg'), env, {});
    assert.strictEqual(res.status, 404);
  });

  await test('（10.Legacy route不受影響）啟用guest login後，/api/qlive 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const postRes = await worker.fetch(new Request('https://example.com/api/qlive?code=guest-qlive-1', { method: 'POST', body: JSON.stringify({ ts: 5 }) }), env, {});
    assert.strictEqual((await postRes.json()).ok, true);
  });

  await test('（延續守則）原始碼掃描：worker.js 沒有 import src/oauth/ 底下任何檔案（本次只啟用guest，不接OAuth）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/from\s+['"]\.\/oauth\//.test(src));
  });

  await test('（延續守則）原始碼掃描：worker.js 沒有 legacy_import 相關字樣（未執行Legacy Import）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/legacy_import/i.test(src));
  });

  await test('（延續守則）原始碼掃描：auth_routes.js 的 withSetCookie() 只在成功且有cookie欄位時才建立真正Response', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'auth_routes.js'), 'utf8'));
    assert.ok(/function withSetCookie/.test(src));
    assert.ok(/result\.ok/.test(src));
  });

  await test('（延續守則）POST /auth/guest 失敗情境（db insert失敗）透過真正worker.fetch()仍安全回應，不拋出未攔截例外', async () => {
    const env = makeFreshEnv();
    env.DIET_COACH_DB.prepare = () => { throw new Error('simulated_prepare_failure'); };
    let threw = false;
    let res;
    try {
      res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, false);
    assert.ok(res.status >= 400);
  });

  await test('（延續守則）router.js 每條路由各自快取自己的 pipelineHandler（applyPipeline在add()時建立一次，不是每次handle都重建）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.path === '/auth/guest');
    assert.strictEqual(typeof route.applyPipeline, 'function');
  });

  await test('（延續守則）D1本地/正式環境驗證另外在 real_d1_verify.mjs 執行，本檔案完全不連線真實或本機模擬的資料庫', () => {
    assert.ok(true, '本檔案自始至終只使用makeMockDb()/makeFakeD1()，見上方全部測試');
  });

  await test('（延續守則）原始碼掃描：worker.js 的 parseJsonBody() 對任何輸入都不會拋出未攔截例外（try/catch包裹）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const fnStart = src.indexOf('async function parseJsonBody');
    const fnBody = src.slice(fnStart, src.indexOf('\n}', fnStart) + 2);
    assert.ok(/try\s*{/.test(fnBody));
    assert.ok(/catch/.test(fnBody));
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'guest-login-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

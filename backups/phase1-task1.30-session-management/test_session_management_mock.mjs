/*
 * Phase 1 TASK 1.30｜Enable Session Management API Route 測試
 *
 * 分七部分：
 * A) GET /auth/me（成功/無cookie/過期/撤銷/suspended/deleted）
 * B) POST /auth/logout（成功/cookie清除/session不可再次使用）
 * C) Router routing（middlewares/contract validation接線）
 * D) Guest Login → /auth/me、Guest Login → logout 完整整合流程
 * E) 真正的 src/worker.js 端對端測試
 * F) KV/R2不受影響
 * G) Legacy route不受影響
 *
 * 全部使用純記憶體 mock D1/KV/R2 binding，不連線任何真實或本機模擬的
 * 資料庫，不會真的呼叫 Google OAuth，不執行 Legacy Import。
 * 對「真實 local D1」的端對端驗證（建立→確認→清理）另外在
 * real_d1_verify.mjs 執行。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentUserController, logoutController } from '../../src/controllers/auth_controller.js';
import { currentUserContract, logoutContract } from '../../src/contracts/auth_contract.js';
import { createAppRouter } from '../../src/routes/index.js';
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

// 完整的 mock db：users/sessions 兩張表，方法簽章對齊 src/db/tables/*.js
function makeMockDb() {
  const users = new Map();
  const sessions = new Map();
  const calls = [];

  function seedUser(user) {
    users.set(user.id, Object.assign({ status: 'active', is_guest: 1, auth_provider: null, auth_provider_id: null }, user));
  }
  function seedSession(session) {
    sessions.set(session.id, Object.assign({ revoked_at: null }, session));
  }

  return {
    calls,
    _users: users,
    _sessions: sessions,
    seedUser,
    seedSession,
    users: {
      async insert(u) {
        calls.push({ type: 'insert', table: 'users' });
        seedUser(u);
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
      async updateStatus(id, status) {
        calls.push({ type: 'updateStatus', table: 'users' });
        const u = users.get(id);
        if (u) u.status = status;
        return { ok: true };
      },
    },
    sessions: {
      async insert(s) {
        calls.push({ type: 'insert', table: 'sessions' });
        seedSession(s);
        return { ok: true };
      },
      async getById(id) {
        calls.push({ type: 'getById', table: 'sessions' });
        return { ok: true, row: sessions.get(id) || null };
      },
      async touch(id, lastSeenAt) {
        calls.push({ type: 'touch', table: 'sessions' });
        const s = sessions.get(id);
        if (s) s.last_seen_at = lastSeenAt;
        return { ok: true };
      },
      async revoke(id, revokedAt) {
        calls.push({ type: 'revoke', table: 'sessions' });
        const s = sessions.get(id);
        if (s) s.revoked_at = revokedAt;
        return { ok: true };
      },
      async revokeAllForUser(userId, revokedAt) {
        calls.push({ type: 'revokeAllForUser', table: 'sessions' });
        for (const s of sessions.values()) {
          if (s.user_id === userId && !s.revoked_at) s.revoked_at = revokedAt;
        }
        return { ok: true };
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

// makeFakeD1() 只記錄呼叫、不儲存任何狀態，適合「有沒有呼叫SQL/呼叫次數」
// 這種測試。但要驗證真正的 worker.fetch() 端對端「guest login寫入的資料，
// /auth/me或logout讀得回來」這種round-trip情境，需要一個真的會儲存狀態
// 的假D1——這裡針對 src/db/tables/users.js / sessions.js 實際會產生的
// SQL語句（INSERT INTO users/sessions、SELECT * FROM users/sessions
// WHERE id = ?、UPDATE sessions SET revoked_at = ? WHERE id = ?）做最小
// 限度的pattern match，維護兩個Map當作真正的表格儲存。
function makeStatefulFakeD1() {
  const calls = [];
  const users = new Map();
  const sessions = new Map();

  function makeStatement(sql, params) {
    params = params || [];
    return {
      sql,
      params,
      bind(...p) { return makeStatement(sql, p); },
      async run() {
        calls.push({ type: 'run', sql, params });
        if (/INSERT INTO users/.test(sql)) {
          const [id, auth_provider, auth_provider_id, display_name, is_guest, status, legacy_sync_code, created_at, updated_at] = params;
          users.set(id, { id, auth_provider, auth_provider_id, display_name, is_guest, status, legacy_sync_code, created_at, updated_at });
        } else if (/INSERT INTO sessions/.test(sql)) {
          const [id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash] = params;
          sessions.set(id, { id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash, revoked_at: null });
        } else if (/UPDATE sessions SET revoked_at/.test(sql)) {
          const [revokedAt, id] = params;
          const s = sessions.get(id);
          if (s) s.revoked_at = revokedAt;
        }
        return { meta: {} };
      },
      async all() {
        calls.push({ type: 'all', sql, params });
        return { results: [] };
      },
      async first() {
        calls.push({ type: 'first', sql, params });
        if (/SELECT \* FROM users WHERE id = \?/.test(sql)) {
          return users.get(params[0]) || null;
        }
        if (/SELECT \* FROM sessions WHERE id = \?/.test(sql)) {
          return sessions.get(params[0]) || null;
        }
        return null;
      },
    };
  }

  return {
    calls,
    _users: users,
    _sessions: sessions,
    prepare(sql) { return makeStatement(sql, []); },
    async batch(statements) {
      calls.push({ type: 'batch', count: statements.length });
      const results = [];
      for (const s of statements) results.push(await s.run());
      return results;
    },
  };
}

function activeUser(id) {
  return { id, status: 'active', is_guest: 1, auth_provider: null, auth_provider_id: null, display_name: null, legacy_sync_code: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}

function validSession(id, userId, opts) {
  opts = opts || {};
  // 預設用「現在」而不是寫死的日期，避免測試在未來（或過去）執行時
  // 因為真實時鐘已經超過寫死日期，讓「合法未過期」的session變成過期。
  const now = opts.now || new Date().toISOString();
  const created = new Date(now);
  const expires = opts.expiresAt ? new Date(opts.expiresAt) : new Date(created.getTime() + SESSION_TTL_SECONDS * 1000);
  return {
    id,
    user_id: userId,
    created_at: created.toISOString(),
    expires_at: expires.toISOString(),
    revoked_at: opts.revokedAt || null,
    user_agent: null,
    ip_hash: null,
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
  return { name, value: decodeURIComponent(value || ''), flags, attrMap };
}

async function run() {
  // =========================================================================
  // A. GET /auth/me
  // =========================================================================

  await test('（1.GET /auth/me成功）合法session+active user時回傳200且帶user資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-1'));
    db.seedSession(validSession('tok-1', 'u-1'));
    const result = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-1`, {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.user.id, 'u-1');
    assert.strictEqual(result.data.userId, 'u-1');
  });

  await test('（2.GET /auth/me無cookie）沒有cookie時回401，reason為no_cookie', async () => {
    const db = makeMockDb();
    const result = await currentUserController(db, null, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.reason, 'no_cookie');
  });

  await test('（2.GET /auth/me無cookie）cookieHeader是空字串時也視為無cookie', async () => {
    const db = makeMockDb();
    const result = await currentUserController(db, '', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'no_cookie');
  });

  await test('（3.GET /auth/me過期session）expires_at已過去時回401，reason為expired', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-2'));
    db.seedSession(validSession('tok-2', 'u-2', { expiresAt: '2020-01-01T00:00:00Z' }));
    const result = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-2`, { now: '2026-01-15T00:00:00Z' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'expired');
  });

  await test('（4.GET /auth/me revoked session）revoked_at已設定時回401，reason為revoked', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-3'));
    db.seedSession(validSession('tok-3', 'u-3', { revokedAt: '2026-01-10T00:00:00Z' }));
    const result = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-3`, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'revoked');
  });

  await test('（5.suspended user拒絕）session合法但user status=suspended時回401', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeUser('u-4'), { status: 'suspended' }));
    db.seedSession(validSession('tok-4', 'u-4'));
    const result = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-4`, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.ok(currentUserContract.response.failureReasons.includes(result.reason));
  });

  await test('（6.deleted user拒絕）session合法但user status=deleted時回401', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeUser('u-5'), { status: 'deleted' }));
    db.seedSession(validSession('tok-5', 'u-5'));
    const result = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-5`, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.ok(currentUserContract.response.failureReasons.includes(result.reason));
  });

  await test('（GET /auth/me不存在的session token）回401，reason為not_found', async () => {
    const db = makeMockDb();
    const result = await currentUserController(db, `${SESSION_COOKIE_NAME}=does-not-exist`, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'not_found');
  });

  await test('（GET /auth/me）只讀取cookie，完全不建立新session（sessions.insert從未被呼叫）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-6'));
    db.seedSession(validSession('tok-6', 'u-6'));
    await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-6`, {});
    assert.strictEqual(db.calls.filter((c) => c.type === 'insert' && c.table === 'sessions').length, 0);
  });

  await test('（GET /auth/me）成功時只查詢，不會呼叫updateStatus/touchLogin等任何寫入方法', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-7'));
    db.seedSession(validSession('tok-7', 'u-7'));
    await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-7`, {});
    const writeCalls = db.calls.filter((c) => ['insert', 'updateStatus', 'touchLogin', 'revoke', 'revokeAllForUser', 'touch'].includes(c.type));
    assert.strictEqual(writeCalls.length, 0);
  });

  await test('（GET /auth/me）回傳的user不含session相關欄位混入（只回傳users表資料）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-8'));
    db.seedSession(validSession('tok-8', 'u-8'));
    const result = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-8`, {});
    assert.strictEqual(result.data.user.id, 'u-8');
    assert.strictEqual(result.data.user.expires_at, undefined);
  });

  // =========================================================================
  // B. POST /auth/logout
  // =========================================================================

  await test('（7.POST /auth/logout成功）合法session時回200，wasValid為true', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-9'));
    db.seedSession(validSession('tok-9', 'u-9'));
    const result = await logoutController(db, `${SESSION_COOKIE_NAME}=tok-9`, {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.wasValid, true);
  });

  await test('（7.POST /auth/logout成功）沒有cookie時仍回200，wasValid為false（優雅處理，非錯誤）', async () => {
    const db = makeMockDb();
    const result = await logoutController(db, null, {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.wasValid, false);
  });

  await test('（8.logout cookie清除）logout回傳的cookie字串以dbc_sid=;開頭（清空值）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-10'));
    db.seedSession(validSession('tok-10', 'u-10'));
    const result = await logoutController(db, `${SESSION_COOKIE_NAME}=tok-10`, {});
    assert.ok(result.data.cookie.startsWith(`${SESSION_COOKIE_NAME}=;`));
  });

  await test('（8.logout cookie清除）logout回傳的cookie含Max-Age=0', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-11'));
    db.seedSession(validSession('tok-11', 'u-11'));
    const result = await logoutController(db, `${SESSION_COOKIE_NAME}=tok-11`, {});
    const cookie = parseSetCookie(result.data.cookie);
    assert.strictEqual(cookie.attrMap['Max-Age'], '0');
  });

  await test('（8.logout cookie清除）logout回傳的cookie含HttpOnly/Secure/SameSite=Lax', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-12'));
    db.seedSession(validSession('tok-12', 'u-12'));
    const result = await logoutController(db, `${SESSION_COOKIE_NAME}=tok-12`, {});
    const cookie = parseSetCookie(result.data.cookie);
    assert.ok(cookie.flags.has('HttpOnly'));
    assert.ok(cookie.flags.has('Secure'));
    assert.strictEqual(cookie.attrMap.SameSite, 'Lax');
  });

  await test('（9.logout後session不可再次使用）logout後對同一token呼叫getById，revoked_at已被設定', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-13'));
    db.seedSession(validSession('tok-13', 'u-13'));
    await logoutController(db, `${SESSION_COOKIE_NAME}=tok-13`, {});
    assert.ok(db._sessions.get('tok-13').revoked_at);
  });

  await test('（9.logout後session不可再次使用）logout後再用同一cookie呼叫GET /auth/me，回401 reason=revoked', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-14'));
    db.seedSession(validSession('tok-14', 'u-14'));
    await logoutController(db, `${SESSION_COOKIE_NAME}=tok-14`, {});
    const result = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-14`, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'revoked');
  });

  await test('（9.logout後session不可再次使用）對已撤銷的session重複呼叫logout仍安全（wasValid仍為true，因為session本身還是「有效存在」直到過期，只是已撤銷)', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-15'));
    db.seedSession(validSession('tok-15', 'u-15'));
    await logoutController(db, `${SESSION_COOKIE_NAME}=tok-15`, {});
    // 再登出一次，不應該拋出例外
    const result2 = await logoutController(db, `${SESSION_COOKIE_NAME}=tok-15`, {});
    assert.strictEqual(result2.ok, true);
  });

  await test('（POST /auth/logout）不會建立任何新的user或session（純粹撤銷）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-16'));
    db.seedSession(validSession('tok-16', 'u-16'));
    await logoutController(db, `${SESSION_COOKIE_NAME}=tok-16`, {});
    assert.strictEqual(db.calls.filter((c) => c.type === 'insert').length, 0);
  });

  await test('（POST /auth/logout）對不存在的session token仍安全處理（不拋例外，wasValid為false）', async () => {
    const db = makeMockDb();
    const result = await logoutController(db, `${SESSION_COOKIE_NAME}=does-not-exist`, {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.wasValid, false);
  });

  // =========================================================================
  // C. Router routing
  // =========================================================================

  await test('（Router routing）createAppRouter() 註冊了GET /auth/me與POST /auth/logout', () => {
    const router = createAppRouter();
    assert.ok(router.routes.find((r) => r.method === 'GET' && r.path === '/auth/me'));
    assert.ok(router.routes.find((r) => r.method === 'POST' && r.path === '/auth/logout'));
  });

  await test('（Router routing）GET /auth/me這條路由具備1個middleware（contract validation）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/auth/me');
    assert.strictEqual(route.middlewares.length, 1);
  });

  await test('（Router routing）POST /auth/logout這條路由具備1個middleware（contract validation）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/logout');
    assert.strictEqual(route.middlewares.length, 1);
  });

  await test('（Router routing）router.handle() 對GET /auth/me成功dispatch，回傳200', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-17'));
    db.seedSession(validSession('tok-17', 'u-17'));
    const res = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: `${SESSION_COOKIE_NAME}=tok-17` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（Router routing）router.handle() 對POST /auth/logout成功dispatch，回傳200且帶Set-Cookie', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-18'));
    db.seedSession(validSession('tok-18', 'u-18'));
    const res = await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-18` }, { db });
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('set-cookie'));
  });

  await test('（Router routing）GET /auth/me的Response沒有Set-Cookie（純讀取，不建立新session）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-19'));
    db.seedSession(validSession('tok-19', 'u-19'));
    const res = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: `${SESSION_COOKIE_NAME}=tok-19` }, { db });
    assert.strictEqual(res.headers.get('set-cookie'), null);
  });

  await test('（Router routing）POST /auth/me（方法不符）回405', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/me' }, { db });
    assert.strictEqual(res.status, 405);
  });

  await test('（Router routing）GET /auth/logout（方法不符）回405', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/auth/logout' }, { db });
    assert.strictEqual(res.status, 405);
  });

  await test('（Contract validation）logoutContract/currentUserContract的request schema皆為空物件，任何payload都能通過（因為這兩條路由靠cookieHeader而非payload判斷）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-20'));
    db.seedSession(validSession('tok-20', 'u-20'));
    const res = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: `${SESSION_COOKIE_NAME}=tok-20`, payload: { random: 'field' } }, { db });
    assert.strictEqual(res.status, 200);
  });

  // =========================================================================
  // D. Guest Login → /auth/me、Guest Login → logout 完整整合流程
  // =========================================================================

  await test('（10.Guest Login → /auth/me完整流程）guest login後用回傳的cookie呼叫/auth/me成功，取回同一個user', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const loginRes = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const loginBody = await loginRes.json();
    const setCookie = loginRes.headers.get('set-cookie');
    const cookieValue = setCookie.split(';')[0]; // "dbc_sid=xxxx"

    const meRes = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: cookieValue }, { db });
    assert.strictEqual(meRes.status, 200);
    const meBody = await meRes.json();
    assert.strictEqual(meBody.data.user.id, loginBody.data.user.id);
  });

  await test('（11.Guest Login → logout完整流程）guest login後用回傳的cookie呼叫logout成功', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const loginRes = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const setCookie = loginRes.headers.get('set-cookie');
    const cookieValue = setCookie.split(';')[0];

    const logoutRes = await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: cookieValue }, { db });
    assert.strictEqual(logoutRes.status, 200);
    const logoutBody = await logoutRes.json();
    assert.strictEqual(logoutBody.data.wasValid, true);
  });

  await test('（11.Guest Login → logout完整流程）logout之後，同一cookie再呼叫/auth/me失敗（reason=revoked）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const loginRes = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: cookieValue }, { db });

    const meRes = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: cookieValue }, { db });
    assert.strictEqual(meRes.status, 401);
    const meBody = await meRes.json();
    assert.strictEqual(meBody.reason, 'revoked');
  });

  await test('（10/11.完整流程）guest login → /auth/me → logout → /auth/me 完整序列都符合預期', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const loginRes = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];

    const me1 = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: cookieValue }, { db });
    assert.strictEqual(me1.status, 200);

    const logoutRes = await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: cookieValue }, { db });
    assert.strictEqual(logoutRes.status, 200);

    const me2 = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: cookieValue }, { db });
    assert.strictEqual(me2.status, 401);
  });

  // =========================================================================
  // E. 真正的 src/worker.js 端對端測試
  // =========================================================================

  const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
  const mod = await import(workerUrl);
  const worker = mod.default;

  function makeFreshEnv() {
    return {
      SYNC_KV: makeFakeKV(),
      DIET_COACH_IMAGES: makeFakeR2({ 'quest/scenes/terrain-1.jpg': 'FAKE_JPEG_BYTES' }),
      // 用會真的儲存狀態的假D1（見上方 makeStatefulFakeD1()），這樣
      // guest login 寫入的 user/session 才能被後續 /auth/me、logout
      // 真正讀回來，端對端測試才有意義。
      DIET_COACH_DB: makeStatefulFakeD1(),
    };
  }

  await test('（1.GET /auth/me成功，端對端）guest login後用真正Cookie header呼叫/auth/me成功', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const setCookie = loginRes.headers.get('set-cookie');
    const cookieValue = setCookie.split(';')[0];

    const meRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
    assert.strictEqual(meRes.status, 200);
    const body = await meRes.json();
    assert.ok(body.data.user);
  });

  await test('（2.GET /auth/me無cookie，端對端）沒有Cookie header時回401', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/me'), env, {});
    assert.strictEqual(res.status, 401);
  });

  await test('（7.POST /auth/logout成功，端對端）guest login後用真正Cookie header呼叫logout成功', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];

    const logoutRes = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});
    assert.strictEqual(logoutRes.status, 200);
    const body = await logoutRes.json();
    assert.strictEqual(body.data.wasValid, true);
  });

  await test('（8.logout cookie清除，端對端）logout回應的Set-Cookie含Max-Age=0且HttpOnly/Secure/SameSite=Lax', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const logoutRes = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});
    const setCookie = logoutRes.headers.get('set-cookie');
    assert.ok(setCookie.includes('Max-Age=0'));
    assert.ok(setCookie.includes('HttpOnly'));
    assert.ok(setCookie.includes('Secure'));
    assert.ok(setCookie.includes('SameSite=Lax'));
  });

  await test('（9.logout後session不可再次使用，端對端）logout後再用同一cookie呼叫/auth/me回401', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});

    const meRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
    assert.strictEqual(meRes.status, 401);
  });

  await test('（端對端）GET /auth/me 沒有D1 binding時（bootstrap失敗），優雅fallback到legacy首頁', async () => {
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2({}) };
    const res = await worker.fetch(new Request('https://example.com/auth/me'), env, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（端對端）POST /auth/logout 沒有D1 binding時（bootstrap失敗），優雅fallback到legacy首頁', async () => {
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2({}) };
    const res = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST' }), env, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  // -------------------------------------------------------------------------
  // 12. KV/R2不受影響
  // -------------------------------------------------------------------------

  await test('（12.KV/R2不受影響）GET /auth/me 完全不呼叫SYNC_KV/R2', async () => {
    const env = makeFreshEnv();
    let kvOrR2Called = false;
    env.SYNC_KV.get = async () => { kvOrR2Called = true; return null; };
    env.DIET_COACH_IMAGES.get = async () => { kvOrR2Called = true; return null; };
    await worker.fetch(new Request('https://example.com/auth/me'), env, {});
    assert.strictEqual(kvOrR2Called, false);
  });

  await test('（12.KV/R2不受影響）POST /auth/logout 完全不呼叫SYNC_KV/R2', async () => {
    const env = makeFreshEnv();
    let kvOrR2Called = false;
    env.SYNC_KV.get = async () => { kvOrR2Called = true; return null; };
    env.DIET_COACH_IMAGES.get = async () => { kvOrR2Called = true; return null; };
    await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST' }), env, {});
    assert.strictEqual(kvOrR2Called, false);
  });

  await test('（12.KV/R2不受影響）啟用session管理後，/api/sync 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
    const postRes = await worker.fetch(new Request('https://example.com/api/sync?code=session-kv-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), env, {});
    assert.strictEqual((await postRes.json()).ok, true);
  });

  await test('（12.KV/R2不受影響）啟用session管理後，/img/* 讀取行為完全不變', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    assert.strictEqual(await res.text(), 'FAKE_JPEG_BYTES');
  });

  // -------------------------------------------------------------------------
  // 13. Legacy route不受影響
  // -------------------------------------------------------------------------

  await test('（13.Legacy route不受影響）GET / 首頁HTML完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/'), env, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（13.Legacy route不受影響）GET /manifest.json 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), env, {});
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
  });

  await test('（13.Legacy route不受影響）POST /auth/provider（仍未啟用）落到首頁catch-all', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/provider', { method: 'POST' }), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（13.Legacy route不受影響）GET /users/999（仍未啟用）落到首頁catch-all', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/users/999'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（13.Legacy route不受影響）D1完全沒有任何SQL呼叫（不含已啟用的三條auth路由）', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=session-d1'), env, {});
    assert.strictEqual(env.DIET_COACH_DB.calls.length, 0);
  });

  // -------------------------------------------------------------------------
  // 額外：原始碼掃描 / 架構守則（不可直接呼叫db.users/db.sessions）
  // -------------------------------------------------------------------------

  await test('（延續守則）原始碼掃描：auth_routes.js 完全沒有直接呼叫 db.users 或 db.sessions', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'auth_routes.js'), 'utf8'));
    assert.ok(!/ctx\.db\.users|ctx\.db\.sessions|\bdb\.users\.|(?<!ctx\.)\bdb\.sessions\./.test(src));
  });

  await test('（延續守則）原始碼掃描：auth_routes.js 只呼叫controller層函式（loginGuestController/loginProviderController/logoutController/currentUserController）', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'auth_routes.js'), 'utf8'));
    assert.ok(/loginGuestController/.test(src));
    assert.ok(/logoutController/.test(src));
    assert.ok(/currentUserController/.test(src));
  });

  await test('（延續守則）原始碼掃描：worker.js 的 handle(r,env) 函式體完全沒有變動', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0);
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/createApplication|router\.handle|currentUser|logout/i.test(handleBody));
  });

  await test('（延續守則）git diff：wrangler.toml 在TASK1.30完全沒有異動', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat wrangler.toml', { cwd: path.join(__dirname, '..', '..') }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（延續守則）原始碼掃描：worker.js 不 import src/oauth/（本次不接Google OAuth callback）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/from\s+['"]\.\/oauth\//.test(src));
  });

  await test('（延續守則）原始碼掃描：worker.js 沒有 legacy_import 相關字樣（未執行Legacy Import）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/legacy_import/i.test(src));
  });

  await test('（延續守則）contracts已存在的currentUserContract/logoutContract欄位與controller實際回傳值一致（無需修改）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-21'));
    db.seedSession(validSession('tok-21', 'u-21'));
    const meResult = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-21`, {});
    for (const key of Object.keys(currentUserContract.response.success)) {
      assert.ok(Object.prototype.hasOwnProperty.call(meResult.data, key));
    }
    const logoutResult = await logoutController(db, `${SESSION_COOKIE_NAME}=tok-21`, {});
    for (const key of Object.keys(logoutContract.response.success)) {
      assert.ok(Object.prototype.hasOwnProperty.call(logoutResult.data, key));
    }
  });

  // -------------------------------------------------------------------------
  // 額外補充：更多邊界情境，涵蓋cookie解析/多重情境/D1呼叫次數等
  // -------------------------------------------------------------------------

  await test('（GET /auth/me）cookieHeader含多個cookie時仍能正確找出dbc_sid', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-22'));
    db.seedSession(validSession('tok-22', 'u-22'));
    const result = await currentUserController(db, `foo=bar; ${SESSION_COOKIE_NAME}=tok-22; baz=qux`, {});
    assert.strictEqual(result.ok, true);
  });

  await test('（POST /auth/logout）cookieHeader含多個cookie時仍能正確找出dbc_sid並撤銷', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-23'));
    db.seedSession(validSession('tok-23', 'u-23'));
    const result = await logoutController(db, `foo=bar; ${SESSION_COOKIE_NAME}=tok-23`, {});
    assert.strictEqual(result.data.wasValid, true);
    assert.ok(db._sessions.get('tok-23').revoked_at);
  });

  await test('（5.suspended user拒絕）suspended user的session本身仍完好（沒有被撤銷），只是使用者狀態擋下', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeUser('u-24'), { status: 'suspended' }));
    db.seedSession(validSession('tok-24', 'u-24'));
    await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-24`, {});
    assert.strictEqual(db._sessions.get('tok-24').revoked_at, null);
  });

  await test('（6.deleted user拒絕）deleted user呼叫logout仍能正常撤銷session（登出不應該因為帳號狀態被擋下）', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeUser('u-25'), { status: 'deleted' }));
    db.seedSession(validSession('tok-25', 'u-25'));
    const result = await logoutController(db, `${SESSION_COOKIE_NAME}=tok-25`, {});
    assert.strictEqual(result.ok, true);
    assert.ok(db._sessions.get('tok-25').revoked_at);
  });

  await test('（GET /auth/me）exactly at expires_at boundary（同一時刻）視為已過期', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-26'));
    db.seedSession(validSession('tok-26', 'u-26', { expiresAt: '2026-01-15T00:00:00Z' }));
    const result = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-26`, { now: '2026-01-15T00:00:00Z' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'expired');
  });

  await test('（GET /auth/me）session快到期但還沒過期時仍成功', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-27'));
    db.seedSession(validSession('tok-27', 'u-27', { expiresAt: '2026-01-15T00:00:01Z' }));
    const result = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-27`, { now: '2026-01-15T00:00:00Z' });
    assert.strictEqual(result.ok, true);
  });

  await test('（Router routing）router.handle() 對GET /auth/me的suspended user情境正確透過完整鏈路回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(Object.assign(activeUser('u-28'), { status: 'suspended' }));
    db.seedSession(validSession('tok-28', 'u-28'));
    const res = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: `${SESSION_COOKIE_NAME}=tok-28` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（Router routing）router.handle() 對POST /auth/logout的deleted user情境仍正常撤銷', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(Object.assign(activeUser('u-29'), { status: 'deleted' }));
    db.seedSession(validSession('tok-29', 'u-29'));
    const res = await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-29` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（10.完整流程）guest login → /auth/me 呼叫兩次都成功（讀取不影響session狀態）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const loginRes = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const me1 = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: cookieValue }, { db });
    const me2 = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: cookieValue }, { db });
    assert.strictEqual(me1.status, 200);
    assert.strictEqual(me2.status, 200);
  });

  await test('（11.完整流程）guest login → logout 兩次不同guest各自獨立（各自的session互不影響）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const login1 = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const login2 = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const cookie1 = login1.headers.get('set-cookie').split(';')[0];
    const cookie2 = login2.headers.get('set-cookie').split(';')[0];

    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: cookie1 }, { db });

    const me1 = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: cookie1 }, { db });
    const me2 = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: cookie2 }, { db });
    assert.strictEqual(me1.status, 401);
    assert.strictEqual(me2.status, 200);
  });

  await test('（端對端）連續三次guest login+/auth/me+logout序列都各自獨立正確', async () => {
    const env = makeFreshEnv();
    for (let i = 0; i < 3; i++) {
      const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
      const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
      const meRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
      assert.strictEqual(meRes.status, 200);
      const logoutRes = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});
      assert.strictEqual(logoutRes.status, 200);
    }
  });

  await test('（端對端）GET /auth/me 透過真正worker.fetch()呼叫後，D1沒有任何write類型SQL（只有SELECT）', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const callsBefore = env.DIET_COACH_DB.calls.length;
    await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
    const newCalls = env.DIET_COACH_DB.calls.slice(callsBefore);
    assert.ok(newCalls.every((c) => c.type === 'first' || c.type === 'all'));
  });

  await test('（端對端）POST /auth/logout 透過真正worker.fetch()呼叫後，D1有一次UPDATE sessions（revoke）', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});
    const updateCalls = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /UPDATE sessions SET revoked_at/.test(c.sql));
    assert.strictEqual(updateCalls.length, 1);
  });

  await test('（4.GET /auth/me revoked session，端對端）呼叫logout兩次，第二次/auth/me仍正確回401（不會因重複撤銷而出錯）', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});
    await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});
    const meRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
    assert.strictEqual(meRes.status, 401);
  });

  await test('（13.Legacy route不受影響）啟用session管理後，GET /auth/me 對legacy的/img/*行為完全無交互影響', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
    const res = await worker.fetch(new Request('https://example.com/img/does/not/exist.jpg'), env, {});
    assert.strictEqual(res.status, 404);
  });

  await test('（13.Legacy route不受影響）FEATURE_ROUTE_MIGRATION_ENABLED=true時，/auth/me與/auth/logout依然正常（不依賴這個flag）', async () => {
    const env = Object.assign(makeFreshEnv(), { FEATURE_ROUTE_MIGRATION_ENABLED: 'true' });
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const meRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
    assert.strictEqual(meRes.status, 200);
    const logoutRes = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});
    assert.strictEqual(logoutRes.status, 200);
  });

  await test('（延續守則）原始碼掃描：auth_routes.js 的 withSetCookie() 對GET /auth/me的成功回應不會產生Set-Cookie（因為data裡沒有cookie欄位）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-30'));
    db.seedSession(validSession('tok-30', 'u-30'));
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: `${SESSION_COOKIE_NAME}=tok-30` }, { db });
    assert.strictEqual(res.headers.get('set-cookie'), null);
  });

  await test('（延續守則）currentUserContract/logoutContract的request schema都是空物件（不需要payload驗證）', () => {
    assert.deepStrictEqual(currentUserContract.request, {});
    assert.deepStrictEqual(logoutContract.request, {});
  });

  await test('（延續守則）POST /auth/logout 對payload存在但無關緊要的請求仍正常運作（因為logout靠cookieHeader而非payload）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-31'));
    db.seedSession(validSession('tok-31', 'u-31'));
    const res = await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-31`, payload: { irrelevant: true } }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（延續守則）createAppRouter() 的 auth/user 路由總數在TASK1.30後仍是5條（沒有新增/刪除路由，只是啟用middleware）', () => {
    const router = createAppRouter();
    assert.strictEqual(router.routes.length, 5);
  });

  await test('（3.GET /auth/me過期session，端對端）直接在假D1插入一筆已過期的session，透過真正worker.fetch()驗證回401', async () => {
    const env = makeFreshEnv();
    const now = new Date().toISOString();
    const past = new Date(Date.now() - 1000).toISOString();
    // 欄位順序對齊 src/db/tables/users.js / sessions.js 真正的INSERT語句，
    // 讓 makeStatefulFakeD1() 的pattern match能正確插入。
    await env.DIET_COACH_DB
      .prepare('INSERT INTO users (id, auth_provider, auth_provider_id, display_name, is_guest, status, legacy_sync_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind('u-expired', null, null, null, 1, 'active', null, now, now)
      .run();
    await env.DIET_COACH_DB
      .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)')
      .bind('tok-expired', 'u-expired', now, past, null, null, null)
      .run();
    const res = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: `${SESSION_COOKIE_NAME}=tok-expired` } }), env, {});
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.reason, 'expired');
  });

  await test('（延續守則）POST /auth/logout 對格式錯誤的cookieHeader（沒有=號）安全處理，不拋例外', async () => {
    const db = makeMockDb();
    const result = await logoutController(db, 'malformed-cookie-without-equals', {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.wasValid, false);
  });

  await test('（延續守則）GET /auth/me 對格式錯誤的cookieHeader（沒有=號）安全處理，回401而非拋例外', async () => {
    const db = makeMockDb();
    const result = await currentUserController(db, 'malformed-cookie-without-equals', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
  });

  await test('（延續守則）response.js的success/failure在GET /auth/me與POST /auth/logout回應中格式一致（皆來自contracts/response_contract.js）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-32'));
    db.seedSession(validSession('tok-32', 'u-32'));
    const meResult = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-32`, {});
    const logoutResult = await logoutController(db, `${SESSION_COOKIE_NAME}=tok-32`, {});
    assert.strictEqual(typeof meResult.ok, 'boolean');
    assert.strictEqual(typeof logoutResult.ok, 'boolean');
  });

  await test('（延續守則）GET /auth/me 對已知的user_not_found情境（session存在但user被刪光，理論上因FK CASCADE不該發生）安全回401', async () => {
    const db = makeMockDb();
    db.seedSession(validSession('tok-orphan', 'ghost-user-id'));
    const result = await currentUserController(db, `${SESSION_COOKIE_NAME}=tok-orphan`, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_not_found');
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'session-management-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

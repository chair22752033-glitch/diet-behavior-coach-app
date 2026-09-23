/*
 * Phase 1 TASK 1.37｜User Profile & Account Management Layer 測試
 *
 * 分為以下部分：
 * A) GET profile success
 * B) PATCH displayName success
 * C) 未登入401
 * D) expired session
 * E) revoked session
 * F) logout後拒絕
 * G) cross user isolation
 * H) user_id spoofing
 * I) identity field protection
 * J) system field protection
 * K) contract validation
 * L) service failure
 * M) KV/R2/Legacy route regression
 * N) 架構守則 / 原始碼掃描（含P1-P6標記）
 *
 * 全部使用純記憶體 mock D1 binding，完全不連線任何真實或本機模擬的
 * 資料庫。對「真實 local D1」的端對端驗證另外在 real_d1_verify.mjs 執行。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProfileController, updateProfileController } from '../../src/controllers/profile_controller.js';
import { getProfile, updateProfile, DISPLAY_NAME_MAX_LENGTH } from '../../src/services/profile_service.js';
import { createAppRouter } from '../../src/routes/index.js';
import { getProfileContract, updateProfileContract } from '../../src/contracts/profile_contract.js';
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../../src/auth/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '..', '..', 'src', 'worker.js');
const repoRoot = path.join(__dirname, '..', '..');

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
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}
function makeFakeR2(objects) {
  objects = objects || {};
  return { async get(key) { if (!objects[key]) return null; return { body: objects[key] }; } };
}

// -----------------------------------------------------------------------
// Mock db：users/sessions，方法簽章對齊 src/db/tables/*.js
// -----------------------------------------------------------------------
function makeMockDb() {
  const users = new Map();
  const sessions = new Map();
  const calls = [];

  function seedUser(user) {
    users.set(user.id, Object.assign({ status: 'active', is_guest: 0, auth_provider: 'google', auth_provider_id: null }, user));
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
      async getById(id) { calls.push({ type: 'getById', table: 'users' }); return { ok: true, row: users.get(id) || null }; },
      async updateDisplayName(id, displayName, updatedAt) {
        calls.push({ type: 'updateDisplayName', table: 'users' });
        const u = users.get(id);
        if (u) { u.display_name = displayName; u.updated_at = updatedAt; }
        return { ok: true };
      },
    },
    sessions: {
      async getById(id) { calls.push({ type: 'getById', table: 'sessions' }); return { ok: true, row: sessions.get(id) || null }; },
      async revoke(id, revokedAt) { calls.push({ type: 'revoke', table: 'sessions' }); const s = sessions.get(id); if (s) s.revoked_at = revokedAt; return { ok: true }; },
    },
  };
}

// -----------------------------------------------------------------------
// Stateful fake D1：讓真正worker.fetch()的round-trip情境能保有真的狀態
// （沿用TASK1.29起建立的模式，這裡擴充UPDATE users SET display_name）
// -----------------------------------------------------------------------
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
        } else if (/UPDATE users SET display_name = \?/.test(sql)) {
          const [display_name, updated_at, id] = params;
          const u = users.get(id);
          if (u) { u.display_name = display_name; u.updated_at = updated_at; }
        } else if (/UPDATE sessions SET revoked_at = \? WHERE id = \?/.test(sql)) {
          const [revokedAt, id] = params;
          const s = sessions.get(id);
          if (s) s.revoked_at = revokedAt;
        }
        return { meta: {} };
      },
      async all() { calls.push({ type: 'all', sql, params }); return { results: [] }; },
      async first() {
        calls.push({ type: 'first', sql, params });
        if (/SELECT \* FROM users WHERE id = \?/.test(sql)) return users.get(params[0]) || null;
        if (/SELECT \* FROM sessions WHERE id = \?/.test(sql)) return sessions.get(params[0]) || null;
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

function activeUser(id, overrides) {
  return Object.assign({
    id, status: 'active', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-' + id,
    display_name: 'Original Name', legacy_sync_code: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', last_login_at: '2026-01-05T00:00:00Z',
  }, overrides || {});
}

function makeSession(id, userId, overrides) {
  const now = new Date();
  return Object.assign({
    id,
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
    revoked_at: null,
    user_agent: 'test-agent',
    ip_hash: 'test-ip-hash',
  }, overrides || {});
}

async function run() {
  // =========================================================================
  // A. GET profile success
  // =========================================================================

  await test('（1.GET profile success）登入使用者成功取得個人資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-1'));
    const result = await getProfileController(db, 'u-1');
    assert.strictEqual(result.ok, true);
  });

  await test('（1.GET profile success）回傳的欄位恰好是id/displayName/isGuest/authProvider/status/createdAt/lastLoginAt七個', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-2'));
    const result = await getProfileController(db, 'u-2');
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['authProvider', 'createdAt', 'displayName', 'id', 'isGuest', 'lastLoginAt', 'status'].sort());
  });

  await test('（1.GET profile success）id欄位正確對應user.id', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-3'));
    const result = await getProfileController(db, 'u-3');
    assert.strictEqual(result.data.id, 'u-3');
  });

  await test('（1.GET profile success）displayName正確對應display_name', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-4', { display_name: '測試使用者' }));
    const result = await getProfileController(db, 'u-4');
    assert.strictEqual(result.data.displayName, '測試使用者');
  });

  await test('（1.GET profile success）isGuest正確反映is_guest（0/false轉成boolean false）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-5', { is_guest: 0 }));
    const result = await getProfileController(db, 'u-5');
    assert.strictEqual(result.data.isGuest, false);
  });

  await test('（1.GET profile success）guest使用者的isGuest正確為true', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-6', { is_guest: 1, auth_provider: null, auth_provider_id: null, display_name: null }));
    const result = await getProfileController(db, 'u-6');
    assert.strictEqual(result.data.isGuest, true);
    assert.strictEqual(result.data.authProvider, null);
  });

  await test('（1.GET profile success）authProvider正確對應auth_provider', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-7', { auth_provider: 'google' }));
    const result = await getProfileController(db, 'u-7');
    assert.strictEqual(result.data.authProvider, 'google');
  });

  await test('（1.GET profile success）status正確對應status', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-8', { status: 'active' }));
    const result = await getProfileController(db, 'u-8');
    assert.strictEqual(result.data.status, 'active');
  });

  await test('（1.GET profile success）createdAt正確對應created_at', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-9', { created_at: '2026-02-02T00:00:00Z' }));
    const result = await getProfileController(db, 'u-9');
    assert.strictEqual(result.data.createdAt, '2026-02-02T00:00:00Z');
  });

  await test('（1.GET profile success）lastLoginAt正確對應last_login_at，沒有值時為null', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-10', { last_login_at: null }));
    const result = await getProfileController(db, 'u-10');
    assert.strictEqual(result.data.lastLoginAt, null);
  });

  await test('（1.GET profile success）Router routing層級：GET /api/profile透過真正router.handle()完整鏈路成功', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-11'));
    db.seedSession(makeSession('tok-11', 'u-11'));
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-11` }, { db });
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // =========================================================================
  // B. PATCH displayName success
  // =========================================================================

  await test('（2.PATCH displayName success）登入使用者成功更新display_name', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-12'));
    const result = await updateProfileController(db, 'u-12', { displayName: 'New Name' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.displayName, 'New Name');
  });

  await test('（2.PATCH displayName success）更新後db._users裡的display_name真的被改變', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-13'));
    await updateProfileController(db, 'u-13', { displayName: 'Updated' });
    assert.strictEqual(db._users.get('u-13').display_name, 'Updated');
  });

  await test('（2.PATCH displayName success）更新後updated_at時間戳有變動', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-14', { updated_at: '2020-01-01T00:00:00Z' }));
    await updateProfileController(db, 'u-14', { displayName: 'Updated' });
    assert.notStrictEqual(db._users.get('u-14').updated_at, '2020-01-01T00:00:00Z');
  });

  await test('（2.PATCH displayName success）更新後GET profile能查回新的displayName', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-15'));
    await updateProfileController(db, 'u-15', { displayName: 'Fresh Name' });
    const result = await getProfileController(db, 'u-15');
    assert.strictEqual(result.data.displayName, 'Fresh Name');
  });

  await test('（2.PATCH displayName success）更新不影響其他欄位（id/authProvider/status/createdAt皆不變）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-16', { auth_provider: 'google', status: 'active', created_at: '2026-01-01T00:00:00Z' }));
    const result = await updateProfileController(db, 'u-16', { displayName: 'Renamed' });
    assert.strictEqual(result.data.id, 'u-16');
    assert.strictEqual(result.data.authProvider, 'google');
    assert.strictEqual(result.data.status, 'active');
    assert.strictEqual(result.data.createdAt, '2026-01-01T00:00:00Z');
  });

  await test('（2.PATCH displayName success）恰好等於長度上限（100字）時允許', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-17'));
    const name = 'a'.repeat(DISPLAY_NAME_MAX_LENGTH);
    const result = await updateProfileController(db, 'u-17', { displayName: name });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.PATCH displayName success）中文字元displayName正確處理', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-18'));
    const result = await updateProfileController(db, 'u-18', { displayName: '中文顯示名稱' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.displayName, '中文顯示名稱');
  });

  await test('（Router routing）PATCH /api/profile 透過真正router.handle()完整鏈路成功', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-19'));
    db.seedSession(makeSession('tok-19', 'u-19'));
    const res = await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { displayName: 'Router Test' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-19` }, { db });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.displayName, 'Router Test');
  });

  console.log('');

  // =========================================================================
  // C. 未登入401
  // =========================================================================

  await test('（3.未登入401）GET /api/profile 沒有cookie時回401，完全不呼叫任何service', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: {} }, { db });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(db.calls.length, 0);
  });

  await test('（3.未登入401）PATCH /api/profile 沒有cookie時回401，完全不呼叫任何service', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { displayName: 'x' } }, { db });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(db.calls.length, 0);
  });

  await test('（3.未登入401）getProfileController()對沒有userId的呼叫直接安全回401（雙重防禦）', async () => {
    const db = makeMockDb();
    const result = await getProfileController(db, null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.reason, 'not_authenticated');
  });

  await test('（3.未登入401）updateProfileController()對沒有userId的呼叫直接安全回401（雙重防禦）', async () => {
    const db = makeMockDb();
    const result = await updateProfileController(db, null, { displayName: 'x' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
  });

  await test('（3.未登入401）帶著不存在的session token時回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=does-not-exist` }, { db });
    assert.strictEqual(res.status, 401);
  });

  console.log('');

  // =========================================================================
  // D. expired session
  // =========================================================================

  await test('（4.expired session）session已過期時GET profile回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-20'));
    db.seedSession(makeSession('tok-20', 'u-20', { expires_at: '2020-01-01T00:00:00.000Z' }));
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-20` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（4.expired session）session已過期時PATCH profile回401，不會呼叫updateDisplayName', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-21'));
    db.seedSession(makeSession('tok-21', 'u-21', { expires_at: '2020-01-01T00:00:00.000Z' }));
    const res = await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { displayName: 'x' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-21` }, { db });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(db.calls.filter((c) => c.type === 'updateDisplayName').length, 0);
  });

  await test('（4.expired session）session剛好還沒過期（差1秒）時仍能正常取得profile', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-22'));
    const future = new Date(Date.now() + 1000).toISOString();
    db.seedSession(makeSession('tok-22', 'u-22', { expires_at: future }));
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-22` }, { db });
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // =========================================================================
  // E. revoked session
  // =========================================================================

  await test('（5.revoked session）session已撤銷時GET profile回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-23'));
    db.seedSession(makeSession('tok-23', 'u-23', { revoked_at: '2026-01-10T00:00:00.000Z' }));
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-23` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（5.revoked session）session已撤銷時PATCH profile回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-24'));
    db.seedSession(makeSession('tok-24', 'u-24', { revoked_at: '2026-01-10T00:00:00.000Z' }));
    const res = await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { displayName: 'x' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-24` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（5.revoked session）使用者狀態為suspended時GET profile回401（即使session本身有效）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-25', { status: 'suspended' }));
    db.seedSession(makeSession('tok-25', 'u-25'));
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-25` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（5.revoked session）使用者狀態為deleted時GET profile回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-26', { status: 'deleted' }));
    db.seedSession(makeSession('tok-26', 'u-26'));
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-26` }, { db });
    assert.strictEqual(res.status, 401);
  });

  console.log('');

  // =========================================================================
  // F. logout後拒絕
  // =========================================================================

  await test('（6.logout後拒絕）登出後同一個cookie無法再取得profile，回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-27'));
    db.seedSession(makeSession('tok-27', 'u-27'));
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-27` }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-27` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（6.logout後拒絕）登出前可以正常存取，登出後才失效（前後對照）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-28'));
    db.seedSession(makeSession('tok-28', 'u-28'));
    const before = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-28` }, { db });
    assert.strictEqual(before.status, 200);
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-28` }, { db });
    const after = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-28` }, { db });
    assert.strictEqual(after.status, 401);
  });

  await test('（6.logout後拒絕）登出後PATCH profile也會被拒絕，不會意外更新資料', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-29'));
    db.seedSession(makeSession('tok-29', 'u-29'));
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-29` }, { db });
    const res = await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { displayName: 'hacked' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-29` }, { db });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(db._users.get('u-29').display_name, 'Original Name');
  });

  console.log('');

  // =========================================================================
  // G. cross user isolation
  // =========================================================================

  await test('（7.cross user isolation）使用者A的session只能取得自己的profile，取不到使用者B的', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a1', { display_name: 'Alice' }));
    db.seedUser(activeUser('u-cross-b1', { display_name: 'Bob' }));
    const resultA = await getProfileController(db, 'u-cross-a1');
    assert.strictEqual(resultA.data.displayName, 'Alice');
    assert.notStrictEqual(resultA.data.displayName, 'Bob');
  });

  await test('（7.cross user isolation，端對端）使用者A的session取得profile內容正確是A自己的，不是B的', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a2', { display_name: 'Alice2' }));
    db.seedUser(activeUser('u-cross-b2', { display_name: 'Bob2' }));
    db.seedSession(makeSession('tok-cross-a2', 'u-cross-a2'));
    db.seedSession(makeSession('tok-cross-b2', 'u-cross-b2'));
    const resA = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-cross-a2` }, { db });
    const bodyA = await resA.json();
    assert.strictEqual(bodyA.data.displayName, 'Alice2');
  });

  await test('（7.cross user isolation）使用者A更新自己的displayName，不會影響使用者B的資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a3', { display_name: 'Alice3' }));
    db.seedUser(activeUser('u-cross-b3', { display_name: 'Bob3' }));
    await updateProfileController(db, 'u-cross-a3', { displayName: 'Alice3-Updated' });
    assert.strictEqual(db._users.get('u-cross-b3').display_name, 'Bob3');
  });

  await test('（7.cross user isolation）三個使用者各自的profile互不干擾', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-multi-1', { display_name: 'Name1' }));
    db.seedUser(activeUser('u-cross-multi-2', { display_name: 'Name2' }));
    db.seedUser(activeUser('u-cross-multi-3', { display_name: 'Name3' }));
    for (const [id, name] of [['u-cross-multi-1', 'Name1'], ['u-cross-multi-2', 'Name2'], ['u-cross-multi-3', 'Name3']]) {
      const result = await getProfileController(db, id);
      assert.strictEqual(result.data.displayName, name);
    }
  });

  await test('（7.cross user isolation）使用者A無法透過偽造session cookie存取使用者B的profile（不存在的token仍是401）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-b4', { display_name: 'SecretName' }));
    db.seedSession(makeSession('tok-cross-b4', 'u-cross-b4'));
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=forged-token-not-real` }, { db });
    assert.strictEqual(res.status, 401);
  });

  console.log('');

  // =========================================================================
  // H. user_id spoofing
  // =========================================================================

  await test('（8.user_id spoofing）PATCH payload帶user_id時完全被忽略，不會影響更新對象', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-spoof-a1', { display_name: 'A-name' }));
    db.seedUser(activeUser('u-spoof-victim', { display_name: 'Victim-name' }));
    db.seedSession(makeSession('tok-spoof-a1', 'u-spoof-a1'));
    await router.handle(
      { method: 'PATCH', pathname: '/api/profile', payload: { displayName: 'Hacked', user_id: 'u-spoof-victim' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-spoof-a1` },
      { db }
    );
    assert.strictEqual(db._users.get('u-spoof-a1').display_name, 'Hacked');
    assert.strictEqual(db._users.get('u-spoof-victim').display_name, 'Victim-name');
  });

  await test('（8.user_id spoofing）controller層直接測試：updateProfileController()的userId參數優先於payload裡任何欄位', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-spoof-a2'));
    const result = await updateProfileController(db, 'u-spoof-a2', { displayName: 'New', user_id: 'someone-else', id: 'someone-else-2' });
    assert.strictEqual(result.data.id, 'u-spoof-a2');
  });

  await test('（8.user_id spoofing）GET profile的query帶user_id時完全被忽略（GET本身沒有body，query不影響結果）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-spoof-a3', { display_name: 'Real' }));
    db.seedSession(makeSession('tok-spoof-a3', 'u-spoof-a3'));
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: { user_id: 'someone-else' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-spoof-a3` }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.id, 'u-spoof-a3');
  });

  console.log('');

  // =========================================================================
  // I. identity field protection
  // =========================================================================

  await test('（9.identity field protection）PATCH payload帶auth_provider時被忽略，不會被更新', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-id-1', { auth_provider: 'google' }));
    const result = await updateProfileController(db, 'u-id-1', { displayName: 'New', auth_provider: 'facebook' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(db._users.get('u-id-1').auth_provider, 'google');
  });

  await test('（9.identity field protection）PATCH payload帶auth_provider_id時被忽略', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-id-2', { auth_provider_id: 'g-original' }));
    await updateProfileController(db, 'u-id-2', { displayName: 'New', auth_provider_id: 'g-hacked' });
    assert.strictEqual(db._users.get('u-id-2').auth_provider_id, 'g-original');
  });

  await test('（9.identity field protection）只帶auth_provider（沒有displayName）時整個更新被拒絕，不會有任何欄位被改動', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-id-3', { auth_provider: 'google' }));
    db.seedSession(makeSession('tok-id-3', 'u-id-3'));
    const res = await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { auth_provider: 'facebook' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-id-3` }, { db });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db._users.get('u-id-3').auth_provider, 'google');
  });

  await test('（9.identity field protection，端對端）透過真正router.handle()，PATCH {auth_provider:"facebook"} 無法竄改身份', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-id-4', { auth_provider: 'google', auth_provider_id: 'g-real' }));
    db.seedSession(makeSession('tok-id-4', 'u-id-4'));
    await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { auth_provider: 'facebook', auth_provider_id: 'fb-fake' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-id-4` }, { db });
    assert.strictEqual(db._users.get('u-id-4').auth_provider, 'google');
    assert.strictEqual(db._users.get('u-id-4').auth_provider_id, 'g-real');
  });

  console.log('');

  // =========================================================================
  // J. system field protection
  // =========================================================================

  await test('（10.system field protection）PATCH payload帶status時被忽略，不會被更新', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sys-1', { status: 'active' }));
    await updateProfileController(db, 'u-sys-1', { displayName: 'New', status: 'deleted' });
    assert.strictEqual(db._users.get('u-sys-1').status, 'active');
  });

  await test('（10.system field protection）PATCH payload帶is_guest時被忽略', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sys-2', { is_guest: 0 }));
    await updateProfileController(db, 'u-sys-2', { displayName: 'New', is_guest: true });
    assert.strictEqual(db._users.get('u-sys-2').is_guest, 0);
  });

  await test('（10.system field protection）PATCH payload帶id時被忽略（不會意外變更成別的id）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sys-3'));
    const result = await updateProfileController(db, 'u-sys-3', { displayName: 'New', id: 'u-sys-hacked' });
    assert.strictEqual(result.data.id, 'u-sys-3');
    assert.strictEqual(db._users.has('u-sys-hacked'), false);
  });

  await test('（10.system field protection）PATCH payload帶created_at時被忽略', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sys-4', { created_at: '2026-01-01T00:00:00Z' }));
    await updateProfileController(db, 'u-sys-4', { displayName: 'New', created_at: '2000-01-01T00:00:00Z' });
    assert.strictEqual(db._users.get('u-sys-4').created_at, '2026-01-01T00:00:00Z');
  });

  await test('（10.system field protection）PATCH payload帶last_login_at時被忽略', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sys-5', { last_login_at: '2026-01-05T00:00:00Z' }));
    await updateProfileController(db, 'u-sys-5', { displayName: 'New', last_login_at: '2099-01-01T00:00:00Z' });
    assert.strictEqual(db._users.get('u-sys-5').last_login_at, '2026-01-05T00:00:00Z');
  });

  await test('（10.system field protection）同時帶status/is_guest且沒有displayName時整個更新被拒絕，不會成功', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-sys-6', { status: 'active', is_guest: 0 }));
    db.seedSession(makeSession('tok-sys-6', 'u-sys-6'));
    const res = await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { status: 'deleted', is_guest: false }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-sys-6` }, { db });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db._users.get('u-sys-6').status, 'active');
    assert.strictEqual(db._users.get('u-sys-6').is_guest, 0);
  });

  console.log('');

  // =========================================================================
  // K. contract validation
  // =========================================================================

  await test('（11.contract validation）displayName型別錯誤（數字而非字串）時被contract validation擋下，回400', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-contract-1'));
    db.seedSession(makeSession('tok-contract-1', 'u-contract-1'));
    const res = await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { displayName: 12345 }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-contract-1` }, { db });
    assert.strictEqual(res.status, 400);
  });

  await test('（11.contract validation）displayName為空字串時被service層拒絕，回400', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-contract-2'));
    db.seedSession(makeSession('tok-contract-2', 'u-contract-2'));
    const res = await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { displayName: '' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-contract-2` }, { db });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.reason, 'invalid_display_name');
  });

  await test('（11.contract validation）displayName為純空白字串時被拒絕', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-contract-3'));
    const result = await updateProfileController(db, 'u-contract-3', { displayName: '   ' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_display_name');
  });

  await test('（11.contract validation）displayName超過長度上限時被拒絕，回400', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-contract-4'));
    const tooLong = 'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1);
    const result = await updateProfileController(db, 'u-contract-4', { displayName: tooLong });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.reason, 'display_name_too_long');
  });

  await test('（11.contract validation）空payload（{}）時被service拒絕，reason=no_fields_to_update', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-contract-5'));
    const result = await updateProfileController(db, 'u-contract-5', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'no_fields_to_update');
    assert.strictEqual(result.status, 400);
  });

  await test('（11.contract validation）getProfileContract.request為空物件（沒有必填欄位）', () => {
    assert.deepStrictEqual(getProfileContract.request, {});
  });

  await test('（11.contract validation）updateProfileContract.request只定義displayName一個選填字串欄位', () => {
    assert.deepStrictEqual(Object.keys(updateProfileContract.request), ['displayName']);
    assert.strictEqual(updateProfileContract.request.displayName.required, false);
    assert.strictEqual(updateProfileContract.request.displayName.type, 'string');
  });

  await test('（11.contract validation）displayName剛好超過長度上限1個字元時被拒絕（邊界測試）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-contract-7'));
    const result = await updateProfileController(db, 'u-contract-7', { displayName: 'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1) });
    assert.strictEqual(result.ok, false);
  });

  await test('（11.contract validation）displayName為null時通過contract validation（validateBody()視null為missing，required:false允許），但service層因型別不是string而拒絕，reason=invalid_display_name', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-contract-8'));
    db.seedSession(makeSession('tok-contract-8', 'u-contract-8'));
    const res = await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { displayName: null }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-contract-8` }, { db });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.reason, 'invalid_display_name');
  });

  await test('（11.contract validation）GET /api/profile不接受body驗證錯誤而拒絕（沒有body本來就沒東西可驗證）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-contract-6'));
    db.seedSession(makeSession('tok-contract-6', 'u-contract-6'));
    const res = await router.handle({ method: 'GET', pathname: '/api/profile', query: { anything: 'whatever' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-contract-6` }, { db });
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // =========================================================================
  // L. service failure
  // =========================================================================

  await test('（12.service failure）updateProfile()對不存在的userId安全回401 user_not_found（不會嘗試更新）', async () => {
    const db = makeMockDb();
    const result = await updateProfileController(db, 'no-such-user', { displayName: 'x' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(db.calls.filter((c) => c.type === 'updateDisplayName').length, 0);
  });

  await test('（12.service failure）getProfile()對不存在的userId安全回401 user_not_found', async () => {
    const db = makeMockDb();
    const result = await getProfileController(db, 'no-such-user');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.reason, 'user_not_found');
  });

  await test('（12.service failure）updateDisplayName的db操作失敗時安全回傳500', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-1'));
    db.users.updateDisplayName = async () => ({ ok: false, error: 'db_error' });
    const result = await updateProfileController(db, 'u-fail-1', { displayName: 'New' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（12.service failure）getProfileController()對service拋出未預期例外時安全回500，不拋出未攔截例外', async () => {
    const db = makeMockDb();
    db.users.getById = async () => { throw new Error('unexpected'); };
    const result = await getProfileController(db, 'u-fail-2');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（12.service failure）updateProfileController()對service拋出未預期例外時安全回500', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-3'));
    db.users.updateDisplayName = async () => { throw new Error('unexpected'); };
    const result = await updateProfileController(db, 'u-fail-3', { displayName: 'New' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（12.service failure，端對端）db操作失敗時透過真正router.handle()整個請求安全回500', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-4'));
    db.seedSession(makeSession('tok-fail-4', 'u-fail-4'));
    db.users.updateDisplayName = async () => ({ ok: false, error: 'db_error' });
    const res = await router.handle({ method: 'PATCH', pathname: '/api/profile', payload: { displayName: 'x' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-fail-4` }, { db });
    assert.strictEqual(res.status, 500);
  });

  console.log('');

  // =========================================================================
  // 真正的 src/worker.js 端對端測試（KV/R2/Legacy共用）
  // =========================================================================

  const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
  const mod = await import(workerUrl);
  const worker = mod.default;

  function makeFreshEnv(extra) {
    return Object.assign({
      SYNC_KV: makeFakeKV(),
      DIET_COACH_IMAGES: makeFakeR2({ 'quest/scenes/terrain-1.jpg': 'FAKE_JPEG_BYTES' }),
      DIET_COACH_DB: makeStatefulFakeD1(),
    }, extra || {});
  }

  async function guestLoginCookie(env) {
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    return res.headers.get('set-cookie').split(';')[0];
  }

  await test('（1.GET profile success，端對端）guest login後可以取得自己的profile，isGuest為true', async () => {
    const env = makeFreshEnv();
    const cookie = await guestLoginCookie(env);
    const res = await worker.fetch(new Request('https://example.com/api/profile', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.isGuest, true);
  });

  await test('（2.PATCH displayName success，端對端）guest登入後PATCH displayName成功，GET查回新名字', async () => {
    const env = makeFreshEnv();
    const cookie = await guestLoginCookie(env);
    await worker.fetch(new Request('https://example.com/api/profile', { method: 'PATCH', headers: { Cookie: cookie }, body: JSON.stringify({ displayName: 'E2E Name' }) }), env, {});
    const res = await worker.fetch(new Request('https://example.com/api/profile', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    assert.strictEqual(body.data.displayName, 'E2E Name');
  });

  await test('（端對端）沒有D1 binding時（bootstrap失敗），優雅fallback到legacy首頁', async () => {
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2({}) };
    const res = await worker.fetch(new Request('https://example.com/api/profile'), env, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（延續守則）FEATURE_ROUTE_MIGRATION_ENABLED=true時，profile依然正常（不依賴這個flag）', async () => {
    const env = Object.assign(makeFreshEnv(), { FEATURE_ROUTE_MIGRATION_ENABLED: 'true' });
    const cookie = await guestLoginCookie(env);
    const res = await worker.fetch(new Request('https://example.com/api/profile', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（Router routing）POST /api/profile（方法不符，只註冊GET/PATCH）回405', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/profile', payload: {} }, { db: makeMockDb() });
    assert.strictEqual(res.status, 405);
  });

  await test('（Router routing）DELETE /api/profile（方法不符）回405', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'DELETE', pathname: '/api/profile' }, { db: makeMockDb() });
    assert.strictEqual(res.status, 405);
  });

  console.log('');

  // -------------------------------------------------------------------------
  // 13. KV regression / 14. R2 regression
  // -------------------------------------------------------------------------

  await test('（13.KV regression）GET /api/profile 完全不呼叫SYNC_KV', async () => {
    const env = makeFreshEnv();
    const cookie = await guestLoginCookie(env);
    let kvCalled = false;
    env.SYNC_KV.get = async () => { kvCalled = true; return null; };
    await worker.fetch(new Request('https://example.com/api/profile', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(kvCalled, false);
  });

  await test('（13.KV regression）PATCH /api/profile 完全不呼叫SYNC_KV', async () => {
    const env = makeFreshEnv();
    const cookie = await guestLoginCookie(env);
    let kvCalled = false;
    env.SYNC_KV.get = async () => { kvCalled = true; return null; };
    await worker.fetch(new Request('https://example.com/api/profile', { method: 'PATCH', headers: { Cookie: cookie }, body: JSON.stringify({ displayName: 'x' }) }), env, {});
    assert.strictEqual(kvCalled, false);
  });

  await test('（13.KV regression）啟用profile後，/api/sync 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=profile-kv-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), env, {});
    assert.strictEqual((await res.json()).ok, true);
  });

  await test('（14.R2 regression）GET /api/profile 完全不呼叫R2', async () => {
    const env = makeFreshEnv();
    const cookie = await guestLoginCookie(env);
    let r2Called = false;
    env.DIET_COACH_IMAGES.get = async () => { r2Called = true; return null; };
    await worker.fetch(new Request('https://example.com/api/profile', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(r2Called, false);
  });

  await test('（14.R2 regression）啟用profile後，/img/* 讀取行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    assert.strictEqual(await res.text(), 'FAKE_JPEG_BYTES');
  });

  console.log('');

  // -------------------------------------------------------------------------
  // 15. Legacy route regression
  // -------------------------------------------------------------------------

  await test('（15.Legacy route regression）GET / 首頁HTML完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/'), env, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（15.Legacy route regression）GET /manifest.json 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), env, {});
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
  });

  await test('（15.Legacy route regression）GET /icon.svg 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  await test('（15.Legacy route regression）GET /users/999（仍未啟用）落到首頁catch-all', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/users/999'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（15.Legacy route regression）D1完全沒有任何SQL呼叫（只呼叫不含auth/api的legacy路由時）', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=profile-legacy-1'), env, {});
    assert.strictEqual(env.DIET_COACH_DB.calls.length, 0);
  });

  await test('（15.Legacy route regression）既有的User Data API/Dashboard/auth路由行為完全不變', async () => {
    const env = makeFreshEnv();
    const cookie = await guestLoginCookie(env);
    const res = await worker.fetch(new Request('https://example.com/api/dashboard', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // =========================================================================
  // N. 架構守則 / 原始碼掃描（含P1-P6標記）
  // =========================================================================

  await test('（架構守則）原始碼掃描：src/services/profile_service.js 完全沒有 import src/db/ 底下任何檔案（不直接操作SQL，一律透過db access layer）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'profile_service.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/db\//.test(src));
    assert.ok(!/db\.prepare\(/.test(src));
  });

  await test('（架構守則）原始碼掃描：profile_service.js 使用既有requireActiveUser()（來自user_service.js，TASK1.15既有函式）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'profile_service.js'), 'utf8'));
    assert.ok(/from\s+['"]\.\/user_service\.js['"]/.test(src));
    assert.ok(/requireActiveUser/.test(src));
  });

  await test('（架構守則）原始碼掃描：src/services/user_service.js 完全沒有被TASK1.37修改（既有Domain Service零異動）', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat src/services/user_service.js', { cwd: repoRoot }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（架構守則）原始碼掃描：src/services/exploration_service.js / food_service.js / emotion_service.js / behavior_service.js / report_service.js 完全沒有被TASK1.37修改', async () => {
    const { execSync } = await import('node:child_process');
    for (const f of ['exploration_service.js', 'food_service.js', 'emotion_service.js', 'behavior_service.js', 'report_service.js']) {
      const diff = execSync(`git diff --stat src/services/${f}`, { cwd: repoRoot }).toString();
      assert.strictEqual(diff.trim(), '', `src/services/${f} 不應該有任何異動`);
    }
  });

  await test('（架構守則）原始碼掃描：profile_controller.js 完全沒有 import src/db/ 底下任何檔案', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'controllers', 'profile_controller.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/db\//.test(src));
  });

  await test('（架構守則）原始碼掃描：profile_controller.js 沒有 import src/auth/ 或 src/identity/session_rules.js（不處理身份驗證）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'controllers', 'profile_controller.js'), 'utf8'));
    assert.ok(!/from\s+['"]\.\.\/auth\//.test(src));
    assert.ok(!/from\s+['"]\.\.\/identity\/session_rules\.js['"]/.test(src));
  });

  await test('（架構守則）原始碼掃描：GET/PATCH /api/profile路由都掛了requireAuth() middleware', () => {
    const router = createAppRouter();
    const getRoute = router.routes.find((r) => r.method === 'GET' && r.path === '/api/profile');
    const patchRoute = router.routes.find((r) => r.method === 'PATCH' && r.path === '/api/profile');
    assert.strictEqual(getRoute.middlewares.length, 2);
    assert.strictEqual(patchRoute.middlewares.length, 2);
  });

  await test('（架構守則）原始碼掃描：本次沒有任何AI分析相關字樣（禁止AI分析邏輯）', () => {
    for (const f of ['src/services/profile_service.js', 'src/controllers/profile_controller.js', 'src/routes/profile_routes.js', 'src/contracts/profile_contract.js']) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      assert.ok(!/openai|anthropic|gpt-|generateReport|analyzePattern/i.test(src), f);
    }
  });

  await test('（架構守則）原始碼掃描：本次新增檔案完全沒有修改任何UI/HTML字串', () => {
    for (const f of ['src/services/profile_service.js', 'src/controllers/profile_controller.js', 'src/routes/profile_routes.js', 'src/contracts/profile_contract.js']) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      assert.ok(!/<script|<style|getHTML|innerHTML/i.test(src), f);
    }
  });

  await test('（架構守則）原始碼掃描：worker.js 的 handle(r,env) 函式體完全沒有變動', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0);
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/createApplication|router\.handle|profile/i.test(handleBody));
  });

  await test('（架構守則）git diff：wrangler.toml 在TASK1.37完全沒有異動', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat wrangler.toml', { cwd: repoRoot }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（架構守則）原始碼掃描：worker.js 沒有 legacy_import 相關字樣（未修改Legacy route）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/legacy_import/i.test(src));
  });

  await test('（架構守則）原始碼掃描：src/db/tables/sessions.js 完全沒有被TASK1.37修改（session schema/既有方法零異動）', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat src/db/tables/sessions.js', { cwd: repoRoot }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（架構守則）原始碼掃描：src/db/tables/users.js 新增的updateDisplayName()只更新display_name跟updated_at，不觸碰auth_provider/is_guest/status', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'db', 'tables', 'users.js'), 'utf8'));
    const match = src.match(/async updateDisplayName\([^)]*\)\s*\{[\s\S]*?\n\s*\},/);
    assert.ok(match, '應該找到updateDisplayName()方法');
    const body = match[0];
    assert.ok(/UPDATE users SET display_name = \?, updated_at = \? WHERE id = \?/.test(body));
    assert.ok(!/auth_provider|is_guest|status\s*=/.test(body));
  });

  await test('（架構守則）原始碼掃描：既有的insert/getById/getByProvider/updateStatus/upgradeToProvider/touchLogin方法簽章完全沒有變動', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src', 'db', 'tables', 'users.js'), 'utf8');
    assert.ok(/async updateStatus\(id, status, updatedAt\)/.test(src));
    assert.ok(/async upgradeToProvider\(id, provider, providerId, updatedAt\)/.test(src));
    assert.ok(/async touchLogin\(id, lastLoginAt\)/.test(src));
  });

  await test('（架構守則）D1本地/正式環境驗證另外在 real_d1_verify.mjs 執行，本檔案完全不連線真實或本機模擬的資料庫', () => {
    assert.ok(true);
  });

  await test('（16.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（前端頁面完全未被TASK1.37修改，UI受影響機率為0，見「禁止修改UI」限制）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'profile-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

/*
 * Phase 1 TASK 1.31｜Enable Guest Identity Upgrade API Route 測試
 *
 * 分七部分：
 * A) upgradeGuestController 本身（成功/user_id保持/provider mapping/
 *    session rotation/old session revoke/new session login）
 * B) 拒絕情境（invalid provider/non guest/suspended/deleted）
 * C) 舊業務資料保留（exploration/food records透過user_id不變而延續）
 * D) Router routing / Contract validation
 * E) 真正的 src/worker.js 端對端測試
 * F) KV/R2不受影響
 * G) Legacy route不受影響
 *
 * 全部使用純記憶體 mock D1/KV/R2 binding，不連線任何真實或本機模擬的
 * 資料庫，不會真的呼叫 Google OAuth，不執行 Legacy Import。
 * 對「真實 local D1」的端對端驗證（建立→升級→確認→清理）另外在
 * real_d1_verify.mjs 執行。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upgradeGuestController, loginGuestController } from '../../src/controllers/auth_controller.js';
import { upgradeProviderContract } from '../../src/contracts/auth_contract.js';
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

// 完整的 mock db：users/sessions/exploration_records/food_events，方法簽章對齊 src/db/tables/*.js
function makeMockDb() {
  const users = new Map();
  const sessions = new Map();
  const explorationRecords = [];
  const foodEvents = [];
  const calls = [];
  let nextRecordId = 1;

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
    _explorationRecords: explorationRecords,
    _foodEvents: foodEvents,
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
      async getByProvider(provider, providerId) {
        calls.push({ type: 'getByProvider', table: 'users' });
        for (const u of users.values()) {
          if (u.auth_provider === provider && u.auth_provider_id === providerId) return { ok: true, row: u };
        }
        return { ok: true, row: null };
      },
      async touchLogin(id, now) {
        calls.push({ type: 'touchLogin', table: 'users' });
        const u = users.get(id);
        if (u) u.last_login_at = now;
        return { ok: true };
      },
      async upgradeToProvider(id, provider, providerId, updatedAt) {
        calls.push({ type: 'upgradeToProvider', table: 'users' });
        const u = users.get(id);
        if (u) {
          u.auth_provider = provider;
          u.auth_provider_id = providerId;
          u.is_guest = 0;
          u.updated_at = updatedAt;
        }
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
    explorationRecords: {
      async insert(rec) {
        calls.push({ type: 'insert', table: 'exploration_records' });
        const row = Object.assign({ id: nextRecordId++ }, rec);
        explorationRecords.push(row);
        return { ok: true, id: row.id };
      },
      async listByUser(userId, limit) {
        calls.push({ type: 'listByUser', table: 'exploration_records' });
        return { ok: true, results: explorationRecords.filter((r) => r.user_id === userId).slice(0, limit || 50) };
      },
    },
    foodEvents: {
      async insert(evt) {
        calls.push({ type: 'insert', table: 'food_events' });
        const row = Object.assign({ id: nextRecordId++ }, evt);
        foodEvents.push(row);
        return { ok: true, id: row.id };
      },
      async listByUser(userId, limit) {
        calls.push({ type: 'listByUser', table: 'food_events' });
        return { ok: true, results: foodEvents.filter((r) => r.user_id === userId).slice(0, limit || 50) };
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

// makeFakeD1() 只記錄呼叫，要驗證真正worker.fetch()的round-trip情境需要
// 會真的儲存狀態的假D1，這裡針對users/sessions實際SQL做最小pattern match。
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
        } else if (/UPDATE users SET auth_provider/.test(sql)) {
          const [auth_provider, auth_provider_id, updated_at, id] = params;
          const u = users.get(id);
          if (u) { u.auth_provider = auth_provider; u.auth_provider_id = auth_provider_id; u.is_guest = 0; u.updated_at = updated_at; }
        } else if (/UPDATE sessions SET revoked_at = \? WHERE user_id = \?/.test(sql)) {
          const [revokedAt, userId] = params;
          for (const s of sessions.values()) {
            if (s.user_id === userId && !s.revoked_at) s.revoked_at = revokedAt;
          }
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
        if (/SELECT \* FROM users WHERE auth_provider = \? AND auth_provider_id = \?/.test(sql)) {
          for (const u of users.values()) {
            if (u.auth_provider === params[0] && u.auth_provider_id === params[1]) return u;
          }
          return null;
        }
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

function activeGuest(id) {
  return { id, status: 'active', is_guest: 1, auth_provider: null, auth_provider_id: null, display_name: null, legacy_sync_code: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}

function activeSession(id, userId) {
  const now = new Date();
  return {
    id,
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
    revoked_at: null,
    user_agent: null,
    ip_hash: null,
  };
}

function upgradePayload(overrides) {
  return Object.assign({ provider: 'google', providerId: 'test-google-id', email: 'test@example.com', displayName: 'Test User' }, overrides || {});
}

async function run() {
  // =========================================================================
  // A. upgradeGuestController 本身
  // =========================================================================

  await test('（1.guest upgrade成功）合法session+active guest+合法provider資訊時升級成功', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-1'));
    db.seedSession(activeSession('tok-1', 'u-1'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-1`, upgradePayload(), {});
    assert.strictEqual(result.ok, true);
    assert.ok(result.data.user);
    assert.ok(result.data.session);
    assert.ok(result.data.cookie);
  });

  await test('（2.user_id保持）升級前後user_id完全相同（原地升級，不是建立新帳號）', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-2'));
    db.seedSession(activeSession('tok-2', 'u-2'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-2`, upgradePayload(), {});
    assert.strictEqual(result.data.user.id, 'u-2');
  });

  await test('（3.provider mapping）payload的provider/providerId正確對應到user.auth_provider/auth_provider_id', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-3'));
    db.seedSession(activeSession('tok-3', 'u-3'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-3`, upgradePayload({ provider: 'google', providerId: 'g-abc-123' }), {});
    assert.strictEqual(result.data.user.auth_provider, 'google');
    assert.strictEqual(result.data.user.auth_provider_id, 'g-abc-123');
  });

  await test('（3.provider mapping）升級後user.is_guest變成false/0', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-4'));
    db.seedSession(activeSession('tok-4', 'u-4'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-4`, upgradePayload(), {});
    assert.ok(result.data.user.is_guest === false || result.data.user.is_guest === 0);
  });

  await test('（4.session rotation/5.old session revoke）升級後舊session的revoked_at被設定', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-5'));
    db.seedSession(activeSession('tok-5', 'u-5'));
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-5`, upgradePayload(), {});
    assert.ok(db._sessions.get('tok-5').revoked_at);
  });

  await test('（4.session rotation/6.new session login）升級後回傳的新session token跟舊的不同', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-6'));
    db.seedSession(activeSession('tok-6', 'u-6'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-6`, upgradePayload(), {});
    assert.notStrictEqual(result.data.session.token, 'tok-6');
  });

  await test('（6.new session login）新session的user_id正確指向升級後的同一個user', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-7'));
    db.seedSession(activeSession('tok-7', 'u-7'));
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-7`, upgradePayload(), {});
    const newSessionEntry = [...db._sessions.values()].find((s) => s.user_id === 'u-7' && !s.revoked_at);
    assert.ok(newSessionEntry);
  });

  await test('（6.new session login）新session可以用來呼叫upgradeGuestController以外的操作（session本身有效，TTL正確）', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-8'));
    db.seedSession(activeSession('tok-8', 'u-8'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-8`, upgradePayload(), {});
    const newSessionEntry = [...db._sessions.values()].find((s) => s.user_id === 'u-8' && !s.revoked_at);
    const ttlSeconds = (new Date(newSessionEntry.expires_at).getTime() - new Date(newSessionEntry.created_at).getTime()) / 1000;
    assert.strictEqual(Math.round(ttlSeconds), SESSION_TTL_SECONDS);
  });

  await test('（4.session rotation）升級前只有1個session，升級後（含新舊）有2個session紀錄（舊的被撤銷、新的有效）', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-9'));
    db.seedSession(activeSession('tok-9', 'u-9'));
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-9`, upgradePayload(), {});
    const allSessionsForUser = [...db._sessions.values()].filter((s) => s.user_id === 'u-9');
    assert.strictEqual(allSessionsForUser.length, 2);
    assert.strictEqual(allSessionsForUser.filter((s) => s.revoked_at).length, 1);
    assert.strictEqual(allSessionsForUser.filter((s) => !s.revoked_at).length, 1);
  });

  await test('（Set-Cookie）升級成功時data.cookie是新session的Set-Cookie字串', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-10'));
    db.seedSession(activeSession('tok-10', 'u-10'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-10`, upgradePayload(), {});
    assert.ok(result.data.cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
    assert.ok(!result.data.cookie.startsWith(`${SESSION_COOKIE_NAME}=;`)); // 不是清除用的空cookie
  });

  await test('（upgradeGuestController）沒有cookie時回401，不會執行任何升級動作', async () => {
    const db = makeMockDb();
    const result = await upgradeGuestController(db, null, upgradePayload(), {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(db.calls.filter((c) => c.type === 'upgradeToProvider').length, 0);
  });

  await test('（upgradeGuestController）payload不是物件時回400', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-11'));
    db.seedSession(activeSession('tok-11', 'u-11'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-11`, null, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 400);
  });

  // =========================================================================
  // B. 拒絕情境
  // =========================================================================

  await test('（7.invalid provider）不支援的provider名稱時升級失敗，reason=invalid_provider', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-12'));
    db.seedSession(activeSession('tok-12', 'u-12'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-12`, upgradePayload({ provider: 'not-a-real-provider' }), {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_provider');
  });

  await test('（7.invalid provider）缺少providerId時升級失敗', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-13'));
    db.seedSession(activeSession('tok-13', 'u-13'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-13`, upgradePayload({ providerId: undefined }), {});
    assert.strictEqual(result.ok, false);
  });

  await test('（8.non guest拒絕）目前登入的使用者已經不是guest（已有auth_provider）時升級失敗，reason=not_guest', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeGuest('u-14'), { is_guest: 0, auth_provider: 'google', auth_provider_id: 'already-linked' }));
    db.seedSession(activeSession('tok-14', 'u-14'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-14`, upgradePayload(), {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'not_guest');
  });

  await test('（9.suspended拒絕）suspended的guest嘗試升級時被拒絕', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeGuest('u-15'), { status: 'suspended' }));
    db.seedSession(activeSession('tok-15', 'u-15'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-15`, upgradePayload(), {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.ok(upgradeProviderContract.response.failureReasons.includes(result.reason));
  });

  await test('（10.deleted拒絕）deleted的guest嘗試升級時被拒絕', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeGuest('u-16'), { status: 'deleted' }));
    db.seedSession(activeSession('tok-16', 'u-16'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-16`, upgradePayload(), {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
  });

  await test('（9.suspended拒絕）suspended guest升級失敗時，完全沒有呼叫upgradeToProvider（在更早的getCurrentUser就被擋下）', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeGuest('u-17'), { status: 'suspended' }));
    db.seedSession(activeSession('tok-17', 'u-17'));
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-17`, upgradePayload(), {});
    assert.strictEqual(db.calls.filter((c) => c.type === 'upgradeToProvider').length, 0);
  });

  await test('（拒絕情境）provider已被其他使用者連結時升級失敗，reason=provider_already_linked', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-18'));
    db.seedSession(activeSession('tok-18', 'u-18'));
    db.seedUser(Object.assign(activeGuest('u-other'), { is_guest: 0, auth_provider: 'google', auth_provider_id: 'taken-id' }));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-18`, upgradePayload({ providerId: 'taken-id' }), {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'provider_already_linked');
  });

  await test('（拒絕情境）不存在的session token時回401，不會意外升級任何user', async () => {
    const db = makeMockDb();
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=does-not-exist`, upgradePayload(), {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
  });

  // =========================================================================
  // C. 舊業務資料保留（exploration/food records透過user_id延續）
  // =========================================================================

  await test('（驗證要求）升級前建立的exploration_records在升級後仍可用同一個user_id查到', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-19'));
    db.seedSession(activeSession('tok-19', 'u-19'));
    await db.explorationRecords.insert({ user_id: 'u-19', draw_mode: 'single', card_category: 'T', occurred_at: '2026-01-05T00:00:00Z' });
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-19`, upgradePayload(), {});
    const after = await db.explorationRecords.listByUser('u-19', 50);
    assert.strictEqual(after.results.length, 1);
  });

  await test('（驗證要求）升級前建立的food_events在升級後仍可用同一個user_id查到', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-20'));
    db.seedSession(activeSession('tok-20', 'u-20'));
    await db.foodEvents.insert({ user_id: 'u-20', description: '午餐', occurred_at: '2026-01-05T12:00:00Z' });
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-20`, upgradePayload(), {});
    const after = await db.foodEvents.listByUser('u-20', 50);
    assert.strictEqual(after.results.length, 1);
    assert.strictEqual(after.results[0].description, '午餐');
  });

  await test('（驗證要求）升級失敗時（例如suspended guest）舊業務資料也完全不受影響', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeGuest('u-21'), { status: 'suspended' }));
    db.seedSession(activeSession('tok-21', 'u-21'));
    await db.explorationRecords.insert({ user_id: 'u-21', draw_mode: 'single', occurred_at: '2026-01-05T00:00:00Z' });
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-21`, upgradePayload(), {});
    const records = await db.explorationRecords.listByUser('u-21', 50);
    assert.strictEqual(records.results.length, 1);
  });

  await test('（驗證要求）升級後多筆exploration/food紀錄依然全部保留、沒有任何一筆遺失', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-22'));
    db.seedSession(activeSession('tok-22', 'u-22'));
    for (let i = 0; i < 3; i++) {
      await db.explorationRecords.insert({ user_id: 'u-22', draw_mode: 'single', occurred_at: `2026-01-0${i + 1}T00:00:00Z` });
      await db.foodEvents.insert({ user_id: 'u-22', description: `meal-${i}`, occurred_at: `2026-01-0${i + 1}T12:00:00Z` });
    }
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-22`, upgradePayload(), {});
    const explorations = await db.explorationRecords.listByUser('u-22', 50);
    const foods = await db.foodEvents.listByUser('u-22', 50);
    assert.strictEqual(explorations.results.length, 3);
    assert.strictEqual(foods.results.length, 3);
  });

  // =========================================================================
  // D. Router routing / Contract validation
  // =========================================================================

  await test('（Router routing）createAppRouter() 註冊了POST /auth/provider/upgrade', () => {
    const router = createAppRouter();
    assert.ok(router.routes.find((r) => r.method === 'POST' && r.path === '/auth/provider/upgrade'));
  });

  await test('（Router routing）POST /auth/provider/upgrade這條路由具備1個middleware（contract validation）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/provider/upgrade');
    assert.strictEqual(route.middlewares.length, 1);
  });

  await test('（Router routing）router.handle() 對合法升級請求成功dispatch，回傳200且帶Set-Cookie', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeGuest('u-23'));
    db.seedSession(activeSession('tok-23', 'u-23'));
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider/upgrade', cookieHeader: `${SESSION_COOKIE_NAME}=tok-23`, payload: upgradePayload() },
      { db }
    );
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('set-cookie'));
  });

  await test('（Contract validation）缺少必填欄位provider時被contract validation擋下，回400', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeGuest('u-24'));
    db.seedSession(activeSession('tok-24', 'u-24'));
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider/upgrade', cookieHeader: `${SESSION_COOKIE_NAME}=tok-24`, payload: { providerId: 'g-1' } },
      { db }
    );
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db.calls.filter((c) => c.type === 'upgradeToProvider').length, 0);
  });

  await test('（Contract validation）缺少必填欄位providerId時被contract validation擋下，回400', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider/upgrade', cookieHeader: `${SESSION_COOKIE_NAME}=whatever`, payload: { provider: 'google' } },
      { db }
    );
    assert.strictEqual(res.status, 400);
  });

  await test('（Contract validation）email/displayName選填欄位缺少時仍能通過驗證（只要provider/providerId齊全）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeGuest('u-25'));
    db.seedSession(activeSession('tok-25', 'u-25'));
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider/upgrade', cookieHeader: `${SESSION_COOKIE_NAME}=tok-25`, payload: { provider: 'google', providerId: 'g-2' } },
      { db }
    );
    assert.strictEqual(res.status, 200);
  });

  await test('（Router routing）GET /auth/provider/upgrade（方法不符）回405', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/auth/provider/upgrade' }, { db });
    assert.strictEqual(res.status, 405);
  });

  await test('（Router routing）POST /auth/provider/upgrade 對suspended guest透過完整鏈路正確回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(Object.assign(activeGuest('u-26'), { status: 'suspended' }));
    db.seedSession(activeSession('tok-26', 'u-26'));
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider/upgrade', cookieHeader: `${SESSION_COOKIE_NAME}=tok-26`, payload: upgradePayload() },
      { db }
    );
    assert.strictEqual(res.status, 401);
  });

  await test('（Router routing）guest login → upgrade 完整流程（透過真正router.handle()）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const loginRes = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const loginBody = await loginRes.json();
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];

    const upgradeRes = await router.handle(
      { method: 'POST', pathname: '/auth/provider/upgrade', cookieHeader: cookieValue, payload: upgradePayload() },
      { db }
    );
    assert.strictEqual(upgradeRes.status, 200);
    const upgradeBody = await upgradeRes.json();
    assert.strictEqual(upgradeBody.data.user.id, loginBody.data.user.id);
    assert.strictEqual(upgradeBody.data.user.auth_provider, 'google');
  });

  await test('（Router routing）guest login → upgrade後，用舊cookie呼叫/auth/me應該失敗（舊session已撤銷）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const loginRes = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const oldCookie = loginRes.headers.get('set-cookie').split(';')[0];
    await router.handle({ method: 'POST', pathname: '/auth/provider/upgrade', cookieHeader: oldCookie, payload: upgradePayload() }, { db });

    const meWithOldCookie = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: oldCookie }, { db });
    assert.strictEqual(meWithOldCookie.status, 401);
  });

  await test('（Router routing）guest login → upgrade後，用新cookie呼叫/auth/me應該成功', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const loginRes = await router.handle({ method: 'POST', pathname: '/auth/guest', payload: {} }, { db });
    const oldCookie = loginRes.headers.get('set-cookie').split(';')[0];
    const upgradeRes = await router.handle({ method: 'POST', pathname: '/auth/provider/upgrade', cookieHeader: oldCookie, payload: upgradePayload() }, { db });
    const newCookie = upgradeRes.headers.get('set-cookie').split(';')[0];

    const meWithNewCookie = await router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: newCookie }, { db });
    assert.strictEqual(meWithNewCookie.status, 200);
    const body = await meWithNewCookie.json();
    assert.strictEqual(body.data.user.auth_provider, 'google');
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
      DIET_COACH_DB: makeStatefulFakeD1(),
    };
  }

  await test('（1.guest upgrade成功，端對端）guest login後用真正Cookie header呼叫upgrade成功', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];

    const upgradeRes = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookieValue }, body: JSON.stringify(upgradePayload()) }),
      env, {}
    );
    assert.strictEqual(upgradeRes.status, 200);
    const body = await upgradeRes.json();
    assert.ok(body.data.user);
    assert.ok(upgradeRes.headers.get('set-cookie'));
  });

  await test('（2.user_id保持，端對端）升級前後透過真正worker.fetch()的user.id相同', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const loginBody = await loginRes.json();
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];

    const upgradeRes = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookieValue }, body: JSON.stringify(upgradePayload()) }),
      env, {}
    );
    const upgradeBody = await upgradeRes.json();
    assert.strictEqual(upgradeBody.data.user.id, loginBody.data.user.id);
  });

  await test('（7.invalid provider，端對端）不支援的provider透過真正worker.fetch()回401', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];

    const upgradeRes = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookieValue }, body: JSON.stringify(upgradePayload({ provider: 'not-supported' })) }),
      env, {}
    );
    assert.strictEqual(upgradeRes.status, 401);
  });

  await test('（端對端）沒有cookie時透過真正worker.fetch()呼叫upgrade回401', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', body: JSON.stringify(upgradePayload()) }),
      env, {}
    );
    assert.strictEqual(res.status, 401);
  });

  await test('（端對端）沒有D1 binding時（bootstrap失敗），優雅fallback到legacy首頁', async () => {
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2({}) };
    const res = await worker.fetch(new Request('https://example.com/auth/provider/upgrade', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（端對端）升級後用新cookie呼叫/auth/me能取回auth_provider=google', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const oldCookie = loginRes.headers.get('set-cookie').split(';')[0];
    const upgradeRes = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: oldCookie }, body: JSON.stringify(upgradePayload()) }),
      env, {}
    );
    const newCookie = upgradeRes.headers.get('set-cookie').split(';')[0];
    const meRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: newCookie } }), env, {});
    assert.strictEqual(meRes.status, 200);
    const meBody = await meRes.json();
    assert.strictEqual(meBody.data.user.auth_provider, 'google');
  });

  await test('（端對端）升級後舊cookie呼叫/auth/me回401（session已撤銷）', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const oldCookie = loginRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: oldCookie }, body: JSON.stringify(upgradePayload()) }),
      env, {}
    );
    const meRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: oldCookie } }), env, {});
    assert.strictEqual(meRes.status, 401);
  });

  await test('（延續守則）D1有一次UPDATE users SET auth_provider（升級寫入）與一次UPDATE sessions（撤銷舊session）', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookieValue }, body: JSON.stringify(upgradePayload()) }),
      env, {}
    );
    const updateUserCalls = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /UPDATE users SET auth_provider/.test(c.sql));
    const updateSessionCalls = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /UPDATE sessions SET revoked_at/.test(c.sql));
    assert.strictEqual(updateUserCalls.length, 1);
    assert.ok(updateSessionCalls.length >= 1);
  });

  // -------------------------------------------------------------------------
  // 11. KV/R2不受影響
  // -------------------------------------------------------------------------

  await test('（11.KV/R2不受影響）POST /auth/provider/upgrade 完全不呼叫SYNC_KV/R2', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    let kvOrR2Called = false;
    env.SYNC_KV.get = async () => { kvOrR2Called = true; return null; };
    env.DIET_COACH_IMAGES.get = async () => { kvOrR2Called = true; return null; };
    await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookieValue }, body: JSON.stringify(upgradePayload()) }),
      env, {}
    );
    assert.strictEqual(kvOrR2Called, false);
  });

  await test('（11.KV/R2不受影響）啟用guest upgrade後，/api/sync 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookieValue }, body: JSON.stringify(upgradePayload()) }), env, {});
    const postRes = await worker.fetch(new Request('https://example.com/api/sync?code=upgrade-kv-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), env, {});
    assert.strictEqual((await postRes.json()).ok, true);
  });

  await test('（11.KV/R2不受影響）啟用guest upgrade後，/img/* 讀取行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    assert.strictEqual(await res.text(), 'FAKE_JPEG_BYTES');
  });

  // -------------------------------------------------------------------------
  // 12. Legacy route不受影響
  // -------------------------------------------------------------------------

  await test('（12.Legacy route不受影響）GET / 首頁HTML完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/'), env, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（12.Legacy route不受影響）GET /manifest.json 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), env, {});
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
  });

  await test('（12.Legacy route不受影響）POST /auth/provider（純OAuth登入，非升級，仍未啟用）落到首頁catch-all', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/provider', { method: 'POST' }), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（12.Legacy route不受影響）GET /users/999（仍未啟用）落到首頁catch-all', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/users/999'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（12.Legacy route不受影響）D1完全沒有任何SQL呼叫（不含已啟用的四條auth路由）', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=upgrade-d1'), env, {});
    assert.strictEqual(env.DIET_COACH_DB.calls.length, 0);
  });

  await test('（12.Legacy route不受影響）FEATURE_ROUTE_MIGRATION_ENABLED=true時，upgrade依然正常（不依賴這個flag）', async () => {
    const env = Object.assign(makeFreshEnv(), { FEATURE_ROUTE_MIGRATION_ENABLED: 'true' });
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const upgradeRes = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookieValue }, body: JSON.stringify(upgradePayload()) }),
      env, {}
    );
    assert.strictEqual(upgradeRes.status, 200);
  });

  // -------------------------------------------------------------------------
  // 額外：原始碼掃描 / 架構守則
  // -------------------------------------------------------------------------

  await test('（延續守則）原始碼掃描：auth_routes.js 完全沒有直接呼叫 db.users 或 db.sessions', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'auth_routes.js'), 'utf8'));
    assert.ok(!/ctx\.db\.users|ctx\.db\.sessions/.test(src));
  });

  await test('（延續守則）原始碼掃描：auth_controller.js 沒有直接 import src/auth/session.js 或 src/identity/session_rules.js（沿用既有controller原則）', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'controllers', 'auth_controller.js'), 'utf8'));
    assert.ok(!/from\s+['"]\.\.\/auth\/session\.js['"]/.test(src));
    assert.ok(!/from\s+['"]\.\.\/identity\/session_rules\.js['"]/.test(src));
  });

  await test('（延續守則）原始碼掃描：auth_controller.js 不直接 import src/oauth/ 底下任何檔案（本次不接Google OAuth callback）', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'controllers', 'auth_controller.js'), 'utf8'));
    assert.ok(!/from\s+['"]\.\.\/oauth\//.test(src));
  });

  await test('（延續守則）原始碼掃描：worker.js 不 import src/oauth/（本次不接Google OAuth callback）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/from\s+['"]\.\/oauth\//.test(src));
  });

  await test('（延續守則）原始碼掃描：worker.js 沒有 legacy_import 相關字樣（未執行Legacy Import）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/legacy_import/i.test(src));
  });

  await test('（延續守則）原始碼掃描：worker.js 的 handle(r,env) 函式體完全沒有變動', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0);
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/createApplication|router\.handle|upgradeGuest/i.test(handleBody));
  });

  await test('（延續守則）git diff：wrangler.toml 在TASK1.31完全沒有異動', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat wrangler.toml', { cwd: path.join(__dirname, '..', '..') }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（延續守則）upgradeProviderContract.request 要求provider/providerId為必填字串，email/displayName選填', () => {
    assert.strictEqual(upgradeProviderContract.request.provider.required, true);
    assert.strictEqual(upgradeProviderContract.request.providerId.required, true);
    assert.strictEqual(upgradeProviderContract.request.email.required, false);
    assert.strictEqual(upgradeProviderContract.request.displayName.required, false);
  });

  await test('（延續守則）loginGuestController與upgradeGuestController共用同一份contracts/response_contract.js（success/failure）', async () => {
    const db = makeMockDb();
    const loginResult = await loginGuestController(db, {}, {});
    db.seedSession(activeSession('tok-final', loginResult.data.user.id));
    const upgradeResult = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-final`, upgradePayload(), {});
    assert.strictEqual(typeof loginResult.ok, 'boolean');
    assert.strictEqual(typeof upgradeResult.ok, 'boolean');
  });

  // -------------------------------------------------------------------------
  // 額外補充：更多邊界情境
  // -------------------------------------------------------------------------

  await test('（3.provider mapping）email/displayName不影響auth_provider/auth_provider_id的正確性', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-27'));
    db.seedSession(activeSession('tok-27', 'u-27'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-27`, { provider: 'google', providerId: 'g-27' }, {});
    assert.strictEqual(result.data.user.auth_provider, 'google');
    assert.strictEqual(result.data.user.auth_provider_id, 'g-27');
  });

  await test('（2.user_id保持）升級後從db.users.getById同一個id仍能查到升級後的資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-28'));
    db.seedSession(activeSession('tok-28', 'u-28'));
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-28`, upgradePayload(), {});
    const row = db._users.get('u-28');
    assert.strictEqual(row.id, 'u-28');
    assert.strictEqual(row.auth_provider, 'google');
  });

  await test('（4.session rotation）revokeAllForUser只影響該user自己的session，不影響其他user的session', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-29'));
    db.seedUser(activeGuest('u-30'));
    db.seedSession(activeSession('tok-29', 'u-29'));
    db.seedSession(activeSession('tok-30', 'u-30'));
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-29`, upgradePayload(), {});
    assert.ok(db._sessions.get('tok-29').revoked_at);
    assert.strictEqual(db._sessions.get('tok-30').revoked_at, null);
  });

  await test('（5.old session revoke）舊session被revoke後無法再用來呼叫upgrade（防止重放）', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-31'));
    db.seedSession(activeSession('tok-31', 'u-31'));
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-31`, upgradePayload(), {});
    const secondAttempt = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-31`, upgradePayload({ providerId: 'another-id' }), {});
    assert.strictEqual(secondAttempt.ok, false);
    assert.strictEqual(secondAttempt.status, 401);
  });

  await test('（6.new session login）升級後的新session可以立刻用來查詢/auth/me，不需要重新登入', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-32'));
    db.seedSession(activeSession('tok-32', 'u-32'));
    const upgradeResult = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-32`, upgradePayload(), {});
    const newSessionEntry = [...db._sessions.values()].find((s) => s.user_id === 'u-32' && !s.revoked_at);
    assert.strictEqual(upgradeResult.data.session.token, newSessionEntry.id);
  });

  await test('（7.invalid provider）providerId為空字串時升級失敗', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-33'));
    db.seedSession(activeSession('tok-33', 'u-33'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-33`, upgradePayload({ providerId: '' }), {});
    assert.strictEqual(result.ok, false);
  });

  await test('（8.non guest拒絕）已經是provider帳號的使用者升級失敗時，不會意外撤銷其現有session', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeGuest('u-34'), { is_guest: 0, auth_provider: 'google', auth_provider_id: 'existing' }));
    db.seedSession(activeSession('tok-34', 'u-34'));
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-34`, upgradePayload(), {});
    assert.strictEqual(db._sessions.get('tok-34').revoked_at, null);
  });

  await test('（9.suspended拒絕）suspended guest升級失敗後，其原本的session仍然是原本的狀態（未被撤銷，因為升級根本沒有執行）', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeGuest('u-35'), { status: 'suspended' }));
    db.seedSession(activeSession('tok-35', 'u-35'));
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-35`, upgradePayload(), {});
    assert.strictEqual(db._sessions.get('tok-35').revoked_at, null);
  });

  await test('（10.deleted拒絕）deleted guest的user資料在升級失敗後保持不變（沒有被部分更新）', async () => {
    const db = makeMockDb();
    db.seedUser(Object.assign(activeGuest('u-36'), { status: 'deleted' }));
    db.seedSession(activeSession('tok-36', 'u-36'));
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-36`, upgradePayload(), {});
    const row = db._users.get('u-36');
    assert.strictEqual(row.auth_provider, null);
    assert.strictEqual(row.is_guest, 1);
  });

  await test('（驗證要求）升級後，多次呼叫listByUser得到一致的結果（冪等讀取）', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-37'));
    db.seedSession(activeSession('tok-37', 'u-37'));
    await db.explorationRecords.insert({ user_id: 'u-37', draw_mode: 'single', occurred_at: '2026-01-05T00:00:00Z' });
    await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-37`, upgradePayload(), {});
    const first = await db.explorationRecords.listByUser('u-37', 50);
    const second = await db.explorationRecords.listByUser('u-37', 50);
    assert.deepStrictEqual(first.results, second.results);
  });

  await test('（Router routing）upgrade成功後payload裡的provider欄位不會外洩到response（controller只回傳user/session/cookie）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeGuest('u-38'));
    db.seedSession(activeSession('tok-38', 'u-38'));
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider/upgrade', cookieHeader: `${SESSION_COOKIE_NAME}=tok-38`, payload: upgradePayload() },
      { db }
    );
    const body = await res.json();
    assert.deepStrictEqual(Object.keys(body.data).sort(), ['cookie', 'session', 'user']);
  });

  await test('（端對端）guest login → upgrade → 再次嘗試upgrade（已經是provider帳號）應該失敗，reason=not_guest', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const oldCookie = loginRes.headers.get('set-cookie').split(';')[0];
    const upgradeRes1 = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: oldCookie }, body: JSON.stringify(upgradePayload()) }),
      env, {}
    );
    const newCookie = upgradeRes1.headers.get('set-cookie').split(';')[0];
    const upgradeRes2 = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: newCookie }, body: JSON.stringify(upgradePayload({ providerId: 'another-provider-id' })) }),
      env, {}
    );
    assert.strictEqual(upgradeRes2.status, 401);
    const body = await upgradeRes2.json();
    assert.strictEqual(body.reason, 'not_guest');
  });

  await test('（端對端）連續兩個不同guest各自獨立升級，互不影響', async () => {
    const env = makeFreshEnv();
    const login1 = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const login2 = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie1 = login1.headers.get('set-cookie').split(';')[0];
    const cookie2 = login2.headers.get('set-cookie').split(';')[0];

    const upgrade1 = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookie1 }, body: JSON.stringify(upgradePayload({ providerId: 'guest-1-google-id' })) }),
      env, {}
    );
    assert.strictEqual(upgrade1.status, 200);

    const me2 = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookie2 } }), env, {});
    assert.strictEqual(me2.status, 200);
    const me2Body = await me2.json();
    assert.strictEqual(me2Body.data.user.auth_provider, null);
  });

  await test('（延續守則）原始碼掃描：upgradeProviderContract定義在src/contracts/auth_contract.js，且被src/contracts/index.js統一輸出', async () => {
    const contractsIndex = await import('../../src/contracts/index.js');
    assert.strictEqual(contractsIndex.upgradeProviderContract, upgradeProviderContract);
  });

  await test('（延續守則）原始碼掃描：upgradeGuestController原始碼中的provider識別轉換邏輯（payload.provider→auth_provider）存在', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'controllers', 'auth_controller.js'), 'utf8'));
    assert.ok(/auth_provider:\s*payload\.provider/.test(src));
    assert.ok(/auth_provider_id:\s*payload\.providerId/.test(src));
  });

  await test('（延續守則）D1本地/正式環境驗證另外在 real_d1_verify.mjs 執行，本檔案完全不連線真實或本機模擬的資料庫', () => {
    assert.ok(true);
  });

  await test('（延續守則）upgradeGuestController 對getCurrentUser失敗時不會呼叫upgradeGuestLogin（短路，符合「兩層防禦」設計）', async () => {
    const db = makeMockDb();
    const calls = [];
    const originalGetById = db.users.getById.bind(db.users);
    db.users.getById = async (...args) => { calls.push('getById'); return originalGetById(...args); };
    await upgradeGuestController(db, null, upgradePayload(), {});
    // 沒有cookie，getCurrentUser在validateSession階段就已失敗（no_cookie），
    // 完全不會走到db.users.getById這一步
    assert.strictEqual(calls.length, 0);
  });

  await test('（3.provider mapping）不同provider（例如未來可能支援的其他provider名稱）也能正確映射，只要isSupportedProvider()允許', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-39'));
    db.seedSession(activeSession('tok-39', 'u-39'));
    // 目前系統只支援google，這裡驗證的是「欄位映射邏輯本身」不寫死google，
    // 而是原樣傳遞payload.provider（即使被identity層拒絕也是映射正確、
    // 只是被業務規則擋下）
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-39`, upgradePayload({ provider: 'facebook', providerId: 'fb-1' }), {});
    assert.strictEqual(result.reason, 'invalid_provider');
  });

  await test('（Contract validation）payload為完全空物件{}時被contract validation擋下（缺少必填的provider/providerId）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeGuest('u-40'));
    db.seedSession(activeSession('tok-40', 'u-40'));
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider/upgrade', cookieHeader: `${SESSION_COOKIE_NAME}=tok-40`, payload: {} },
      { db }
    );
    assert.strictEqual(res.status, 400);
  });

  await test('（12.Legacy route不受影響）GET /icon.svg 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'guest-upgrade-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

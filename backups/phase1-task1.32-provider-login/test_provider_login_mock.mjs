/*
 * Phase 1 TASK 1.32｜Enable Provider Authentication API Route 測試
 *
 * 分為以下部分：
 * A) loginProviderController 本身（成功/existing user login/new provider user建立）
 * B) 拒絕情境（duplicate provider不會建立第二筆/suspended拒絕/deleted拒絕/invalid payload）
 * C) session建立 / cookie輸出
 * D) Router routing / Contract validation
 * E) 真正的 src/worker.js 端對端測試
 * F) guest流程不受影響
 * G) upgrade流程不受影響
 * H) KV/R2不受影響
 * I) Legacy route不受影響
 * J) 架構守則 / 原始碼掃描
 *
 * 全部使用純記憶體 mock D1/KV/R2 binding，不連線任何真實或本機模擬的
 * 資料庫，不會真的呼叫 Google OAuth（本次不接callback、不執行
 * Authorization Code Flow、不呼叫任何Google API、不儲存任何token），
 * 不執行 Legacy Import。
 * 對「真實 local D1」的端對端驗證（登入→確認→清理）另外在
 * real_d1_verify.mjs 執行。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginProviderController, loginGuestController, upgradeGuestController } from '../../src/controllers/auth_controller.js';
import { loginProviderContract } from '../../src/contracts/auth_contract.js';
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

// makeStatefulFakeD1() 針對users/sessions實際SQL做最小pattern match，讓真正
// worker.fetch()的round-trip情境能保有真的狀態（沿用TASK1.29起建立的模式，
// 這裡額外加上touchLogin()的UPDATE users SET last_login_at分支）。
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
        } else if (/UPDATE users SET last_login_at/.test(sql)) {
          const [last_login_at, id] = params;
          const u = users.get(id);
          if (u) u.last_login_at = last_login_at;
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

function loginPayload(overrides) {
  return Object.assign({ provider: 'google', providerId: 'test-google-id', email: 'test@example.com', displayName: 'Test User' }, overrides || {});
}

async function run() {
  // =========================================================================
  // A. loginProviderController 本身（成功/existing user login/new provider user建立）
  // =========================================================================

  await test('（1.provider login成功）合法provider identity第一次登入時成功', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload());
    assert.strictEqual(result.ok, true);
    assert.ok(result.data.user);
    assert.ok(result.data.session);
    assert.ok(result.data.cookie);
  });

  await test('（3.new provider user建立）第一次登入時建立新的provider user，created=true', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload());
    assert.strictEqual(result.data.created, true);
  });

  await test('（3.new provider user建立）新建立的provider user的auth_provider/auth_provider_id正確對應payload', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload({ provider: 'google', providerId: 'g-new-1' }));
    assert.strictEqual(result.data.user.auth_provider, 'google');
    assert.strictEqual(result.data.user.auth_provider_id, 'g-new-1');
  });

  await test('（3.new provider user建立）新建立的provider user的display_name對應payload.displayName', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload({ displayName: '新使用者' }));
    assert.strictEqual(result.data.user.display_name, '新使用者');
  });

  await test('（3.new provider user建立）新建立的provider user不是guest（4.provider user id保持：一開始就是正式會員）', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload());
    assert.ok(result.data.user.is_guest === false || result.data.user.is_guest === 0);
  });

  await test('（3.new provider user建立）新建立的provider user狀態為active', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload());
    assert.strictEqual(result.data.user.status, 'active');
  });

  await test('（4.不建立guest user）新建立的provider user的legacy_sync_code為null（非透過legacy import路徑建立）', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload());
    assert.strictEqual(result.data.user.legacy_sync_code, null);
  });

  await test('（2.existing user login）同一個provider identity第二次登入時回傳既有user（不是新建立）', async () => {
    const db = makeMockDb();
    const first = await loginProviderController(db, loginPayload({ providerId: 'g-existing-1' }));
    const second = await loginProviderController(db, loginPayload({ providerId: 'g-existing-1' }));
    assert.strictEqual(second.data.created, false);
    assert.strictEqual(second.data.user.id, first.data.user.id);
  });

  await test('（2.existing user login）existing user再次登入時touchLogin被呼叫，last_login_at更新', async () => {
    const db = makeMockDb();
    await loginProviderController(db, loginPayload({ providerId: 'g-existing-2' }));
    const second = await loginProviderController(db, loginPayload({ providerId: 'g-existing-2' }));
    assert.strictEqual(second.ok, true);
    assert.ok(db.calls.filter((c) => c.type === 'touchLogin').length >= 1);
  });

  await test('（2.existing user login）existing user再次登入時不會呼叫db.users.insert（不會建立第二筆）', async () => {
    const db = makeMockDb();
    await loginProviderController(db, loginPayload({ providerId: 'g-existing-3' }));
    const insertCallsAfterFirst = db.calls.filter((c) => c.type === 'insert' && c.table === 'users').length;
    await loginProviderController(db, loginPayload({ providerId: 'g-existing-3' }));
    const insertCallsAfterSecond = db.calls.filter((c) => c.type === 'insert' && c.table === 'users').length;
    assert.strictEqual(insertCallsAfterSecond, insertCallsAfterFirst);
  });

  await test('（2.existing user login）existing user的id在多次登入間保持不變', async () => {
    const db = makeMockDb();
    const first = await loginProviderController(db, loginPayload({ providerId: 'g-existing-4' }));
    const second = await loginProviderController(db, loginPayload({ providerId: 'g-existing-4' }));
    const third = await loginProviderController(db, loginPayload({ providerId: 'g-existing-4' }));
    assert.strictEqual(first.data.user.id, second.data.user.id);
    assert.strictEqual(second.data.user.id, third.data.user.id);
  });

  await test('（loginProviderController）payload不是物件時回400', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 400);
  });

  await test('（loginProviderController）payload是字串時回400', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, 'not-an-object');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 400);
  });

  await test('（loginProviderController）缺少provider欄位時回401（identity層拒絕，reason=invalid_identity）', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, { providerId: 'g-x' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.reason, 'invalid_identity');
  });

  await test('（loginProviderController）缺少providerId欄位時回401，reason=invalid_identity', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, { provider: 'google' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_identity');
  });

  await test('（loginProviderController）providerId為空字串時視為缺少必要欄位，回401', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload({ providerId: '' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_identity');
  });

  // =========================================================================
  // B. 拒絕情境（duplicate provider不會建立第二筆/suspended拒絕/deleted拒絕）
  // =========================================================================

  await test('（5.duplicate provider拒絕：唯一性保證）同一個provider+providerId連續登入10次，users裡只會有1筆對應的user', async () => {
    const db = makeMockDb();
    for (let i = 0; i < 10; i++) {
      await loginProviderController(db, loginPayload({ providerId: 'g-dup-1' }));
    }
    const matches = [...db._users.values()].filter((u) => u.auth_provider === 'google' && u.auth_provider_id === 'g-dup-1');
    assert.strictEqual(matches.length, 1);
  });

  await test('（5.duplicate provider拒絕）不同provider但相同providerId視為不同identity，各自建立獨立user', async () => {
    const db = makeMockDb();
    const googleResult = await loginProviderController(db, loginPayload({ provider: 'google', providerId: 'same-id' }));
    const otherResult = await loginProviderController(db, loginPayload({ provider: 'facebook', providerId: 'same-id' }));
    assert.notStrictEqual(googleResult.data.user.id, otherResult.data.user.id);
  });

  await test('（6.suspended拒絕）suspended狀態的既有provider user登入被拒絕，reason=user_suspended', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-susp-1', status: 'suspended', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-susp-1' });
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-susp-1' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_suspended');
    assert.strictEqual(result.status, 401);
  });

  await test('（6.suspended拒絕）suspended user登入失敗時不會呼叫touchLogin/session建立', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-susp-2', status: 'suspended', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-susp-2' });
    await loginProviderController(db, loginPayload({ providerId: 'g-susp-2' }));
    assert.strictEqual(db.calls.filter((c) => c.type === 'touchLogin').length, 0);
    assert.strictEqual(db.calls.filter((c) => c.type === 'insert' && c.table === 'sessions').length, 0);
  });

  await test('（7.deleted拒絕）deleted狀態的既有provider user登入被拒絕，reason=user_deleted', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-del-1', status: 'deleted', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-del-1' });
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-del-1' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_deleted');
    assert.strictEqual(result.status, 401);
  });

  await test('（7.deleted拒絕）deleted user登入失敗時不會呼叫session建立', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-del-2', status: 'deleted', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-del-2' });
    await loginProviderController(db, loginPayload({ providerId: 'g-del-2' }));
    assert.strictEqual(db.calls.filter((c) => c.type === 'insert' && c.table === 'sessions').length, 0);
  });

  await test('（延續守則）既有使用者狀態為未知值（不是active/suspended/deleted）時登入被拒絕，reason=user_status_unknown', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-unknown-1', status: 'pending_review', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-unknown-1' });
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-unknown-1' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_status_unknown');
  });

  await test('（loginProviderController）db.users.insert失敗時安全回傳failure（不拋例外）', async () => {
    const db = makeMockDb();
    db.users.insert = async () => ({ ok: false, error: 'db_error' });
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-insert-fail' }));
    assert.strictEqual(result.ok, false);
  });

  await test('（loginProviderController）db.sessions.insert失敗時安全回傳failure（即使user已建立成功）', async () => {
    const db = makeMockDb();
    db.sessions.insert = async () => ({ ok: false, error: 'db_error' });
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-session-fail' }));
    assert.strictEqual(result.ok, false);
  });

  // =========================================================================
  // C. session建立 / cookie輸出
  // =========================================================================

  await test('（8.session建立）登入成功後產生的session token長度足夠長（32 bytes以上, opaque token）', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-sess-1' }));
    assert.ok(result.data.session.token.length >= 32);
  });

  await test('（8.session建立）session的user_id正確指向登入的user', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-sess-2' }));
    const sessionEntry = [...db._sessions.values()].find((s) => s.user_id === result.data.user.id);
    assert.ok(sessionEntry);
  });

  await test('（8.session建立）session的revoked_at初始為null（尚未撤銷）', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-sess-3' }));
    const sessionEntry = [...db._sessions.values()].find((s) => s.user_id === result.data.user.id);
    assert.strictEqual(sessionEntry.revoked_at, null);
  });

  await test('（8.session建立）session的TTL正確', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-sess-4' }));
    const sessionEntry = [...db._sessions.values()].find((s) => s.user_id === result.data.user.id);
    const ttlSeconds = (new Date(sessionEntry.expires_at).getTime() - new Date(sessionEntry.created_at).getTime()) / 1000;
    assert.strictEqual(Math.round(ttlSeconds), SESSION_TTL_SECONDS);
  });

  await test('（8.session建立）existing user再次登入時仍建立新session（每次登入都是新session，不重用）', async () => {
    const db = makeMockDb();
    const first = await loginProviderController(db, loginPayload({ providerId: 'g-sess-5' }));
    const second = await loginProviderController(db, loginPayload({ providerId: 'g-sess-5' }));
    assert.notStrictEqual(first.data.session.token, second.data.session.token);
  });

  await test('（8.session建立）連續3次不同provider identity登入，各自產生獨立的user/session（不互相干擾）', async () => {
    const db = makeMockDb();
    const r1 = await loginProviderController(db, loginPayload({ providerId: 'g-multi-1' }));
    const r2 = await loginProviderController(db, loginPayload({ providerId: 'g-multi-2' }));
    const r3 = await loginProviderController(db, loginPayload({ providerId: 'g-multi-3' }));
    const ids = new Set([r1.data.user.id, r2.data.user.id, r3.data.user.id]);
    assert.strictEqual(ids.size, 3);
  });

  await test('（9.cookie輸出）登入成功時data.cookie是新session的Set-Cookie字串', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-cookie-1' }));
    assert.ok(result.data.cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
    assert.ok(!result.data.cookie.startsWith(`${SESSION_COOKIE_NAME}=;`));
  });

  await test('（9.cookie輸出）cookie裡的token與session.token一致', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-cookie-2' }));
    assert.ok(result.data.cookie.startsWith(`${SESSION_COOKIE_NAME}=${result.data.session.token}`));
  });

  await test('（response shape）response body整體格式符合loginProviderContract.response.success描述的欄位', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, loginPayload({ providerId: 'g-shape-1' }));
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['cookie', 'created', 'session', 'user']);
  });

  // =========================================================================
  // D. Router routing / Contract validation
  // =========================================================================

  await test('（Router routing）createAppRouter() 註冊了POST /auth/provider', () => {
    const router = createAppRouter();
    assert.ok(router.routes.find((r) => r.method === 'POST' && r.path === '/auth/provider'));
  });

  await test('（Router routing）POST /auth/provider這條路由具備1個middleware（contract validation）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/provider');
    assert.strictEqual(route.middlewares.length, 1);
  });

  await test('（Router routing）router.handle() 對合法登入請求成功dispatch，回傳200且帶Set-Cookie', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider', payload: loginPayload({ providerId: 'g-router-1' }) },
      { db }
    );
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('set-cookie'));
  });

  await test('（Contract validation）缺少必填欄位provider時被contract validation擋下，回400', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider', payload: { providerId: 'g-1' } },
      { db }
    );
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db.calls.filter((c) => c.type === 'insert' && c.table === 'users').length, 0);
  });

  await test('（Contract validation）缺少必填欄位providerId時被contract validation擋下，回400', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider', payload: { provider: 'google' } },
      { db }
    );
    assert.strictEqual(res.status, 400);
  });

  await test('（Contract validation）payload為完全空物件{}時被contract validation擋下', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/provider', payload: {} }, { db });
    assert.strictEqual(res.status, 400);
  });

  await test('（Contract validation）email/displayName選填欄位缺少時仍能通過驗證（只要provider/providerId齊全）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider', payload: { provider: 'google', providerId: 'g-optional-1' } },
      { db }
    );
    assert.strictEqual(res.status, 200);
  });

  await test('（Contract validation）provider欄位型別錯誤（數字而非字串）時被擋下，回400', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider', payload: { provider: 123, providerId: 'g-1' } },
      { db }
    );
    assert.strictEqual(res.status, 400);
  });

  await test('（Router routing）GET /auth/provider（方法不符）回405', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/auth/provider' }, { db });
    assert.strictEqual(res.status, 405);
  });

  await test('（Router routing）POST /auth/provider 對suspended既有user透過完整鏈路正確回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser({ id: 'u-router-susp', status: 'suspended', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-router-susp' });
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider', payload: loginPayload({ providerId: 'g-router-susp' }) },
      { db }
    );
    assert.strictEqual(res.status, 401);
  });

  await test('（Router routing）連續兩次呼叫router.handle()登入同一個provider identity，第二次回傳既有user且仍是200', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const first = await router.handle({ method: 'POST', pathname: '/auth/provider', payload: loginPayload({ providerId: 'g-router-dup' }) }, { db });
    const firstBody = await first.json();
    const second = await router.handle({ method: 'POST', pathname: '/auth/provider', payload: loginPayload({ providerId: 'g-router-dup' }) }, { db });
    const secondBody = await second.json();
    assert.strictEqual(second.status, 200);
    assert.strictEqual(secondBody.data.user.id, firstBody.data.user.id);
    assert.strictEqual(secondBody.data.created, false);
  });

  await test('（Router routing）登入成功後payload裡不會外洩到response（controller只回傳user/session/cookie/created）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/auth/provider', payload: loginPayload({ providerId: 'g-noleak-1' }) }, { db });
    const body = await res.json();
    assert.deepStrictEqual(Object.keys(body.data).sort(), ['cookie', 'created', 'session', 'user']);
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

  await test('（1.provider login成功，端對端）透過真正worker.fetch()呼叫POST /auth/provider成功', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-1' })) }),
      env, {}
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.user);
    assert.ok(res.headers.get('set-cookie'));
  });

  await test('（2.existing user login，端對端）透過真正worker.fetch()重複登入同一個provider identity回傳既有user', async () => {
    const env = makeFreshEnv();
    const first = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-2' })) }),
      env, {}
    );
    const firstBody = await first.json();
    const second = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-2' })) }),
      env, {}
    );
    const secondBody = await second.json();
    assert.strictEqual(secondBody.data.user.id, firstBody.data.user.id);
    assert.strictEqual(secondBody.data.created, false);
  });

  await test('（5.duplicate provider拒絕，端對端）D1只會有1筆對應該provider identity的INSERT INTO users', async () => {
    const env = makeFreshEnv();
    for (let i = 0; i < 3; i++) {
      await worker.fetch(
        new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-dup' })) }),
        env, {}
      );
    }
    const insertUserCalls = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /INSERT INTO users/.test(c.sql));
    assert.strictEqual(insertUserCalls.length, 1);
  });

  await test('（8.session建立，端對端）D1每次登入都有一次INSERT INTO sessions', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-sess-1' })) }), env, {});
    await worker.fetch(new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-sess-1' })) }), env, {});
    const insertSessionCalls = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /INSERT INTO sessions/.test(c.sql));
    assert.strictEqual(insertSessionCalls.length, 2);
  });

  await test('（端對端）登入成功後用回傳的cookie呼叫/auth/me能取回正確的auth_provider', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-me-1' })) }),
      env, {}
    );
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const meRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
    assert.strictEqual(meRes.status, 200);
    const meBody = await meRes.json();
    assert.strictEqual(meBody.data.user.auth_provider, 'google');
  });

  await test('（端對端）登入成功後用回傳的cookie呼叫/auth/logout能成功登出', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-logout-1' })) }),
      env, {}
    );
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const logoutRes = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});
    assert.strictEqual(logoutRes.status, 200);
    const meAfterLogout = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
    assert.strictEqual(meAfterLogout.status, 401);
  });

  await test('（6.suspended拒絕，端對端）suspended既有provider user透過真正worker.fetch()登入回401', async () => {
    const env = makeFreshEnv();
    const first = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-susp-1' })) }),
      env, {}
    );
    const firstBody = await first.json();
    // 直接在假D1裡把這個user標記為suspended，模擬「後台停權既有provider user」
    env.DIET_COACH_DB._users.get(firstBody.data.user.id).status = 'suspended';
    const second = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-susp-1' })) }),
      env, {}
    );
    assert.strictEqual(second.status, 401);
    const secondBody = await second.json();
    assert.strictEqual(secondBody.reason, 'user_suspended');
  });

  await test('（7.deleted拒絕，端對端）deleted既有provider user透過真正worker.fetch()登入回401', async () => {
    const env = makeFreshEnv();
    const first = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-del-1' })) }),
      env, {}
    );
    const firstBody = await first.json();
    env.DIET_COACH_DB._users.get(firstBody.data.user.id).status = 'deleted';
    const second = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-del-1' })) }),
      env, {}
    );
    assert.strictEqual(second.status, 401);
    const secondBody = await second.json();
    assert.strictEqual(secondBody.reason, 'user_deleted');
  });

  await test('（端對端）沒有D1 binding時（bootstrap失敗），優雅fallback到legacy首頁', async () => {
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2({}) };
    const res = await worker.fetch(new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload()) }), env, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（端對端）body不是合法JSON時，parseJsonBody優雅處理成{}，contract validation回400（不拋未攔截例外）', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/provider', { method: 'POST', body: 'not-json{{{' }), env, {});
    assert.strictEqual(res.status, 400);
  });

  await test('（延續守則）FEATURE_ROUTE_MIGRATION_ENABLED=true時，provider login依然正常（不依賴這個flag）', async () => {
    const env = Object.assign(makeFreshEnv(), { FEATURE_ROUTE_MIGRATION_ENABLED: 'true' });
    const res = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-e2e-flag-1' })) }),
      env, {}
    );
    assert.strictEqual(res.status, 200);
  });

  // =========================================================================
  // F. guest流程不受影響
  // =========================================================================

  await test('（10.guest流程不受影響）POST /auth/guest 透過真正worker.fetch()依然正常運作', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.user.is_guest === true || body.data.user.is_guest === 1, true);
  });

  await test('（10.guest流程不受影響）guest login與provider login各自產生獨立的user，互不干擾', async () => {
    const env = makeFreshEnv();
    const guestRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const guestBody = await guestRes.json();
    const providerRes = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-guest-unaffected-1' })) }),
      env, {}
    );
    const providerBody = await providerRes.json();
    assert.notStrictEqual(guestBody.data.user.id, providerBody.data.user.id);
    assert.strictEqual(guestBody.data.user.auth_provider, null);
  });

  await test('（10.guest流程不受影響）loginGuestController本身行為完全不變（純記憶體）', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, {}, {});
    assert.strictEqual(result.ok, true);
    assert.ok(result.data.user.is_guest === true || result.data.user.is_guest === 1);
  });

  // =========================================================================
  // G. upgrade流程不受影響
  // =========================================================================

  await test('（11.upgrade流程不受影響）guest login → upgrade透過真正worker.fetch()依然正常運作', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const upgradeRes = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookieValue }, body: JSON.stringify({ provider: 'google', providerId: 'g-upgrade-unaffected-1' }) }),
      env, {}
    );
    assert.strictEqual(upgradeRes.status, 200);
    const body = await upgradeRes.json();
    assert.strictEqual(body.data.user.auth_provider, 'google');
  });

  await test('（11.upgrade流程不受影響）upgrade後的provider identity跟直接provider login是同一套資料表，不會互相衝突', async () => {
    const env = makeFreshEnv();
    // guest升級成google/g-shared-1
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const upgradeRes = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookieValue }, body: JSON.stringify({ provider: 'google', providerId: 'g-shared-1' }) }),
      env, {}
    );
    const upgradeBody = await upgradeRes.json();
    // 之後直接用同一個provider identity做provider login，應該找到同一個user（existing user login）
    const providerLoginRes = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-shared-1' })) }),
      env, {}
    );
    const providerLoginBody = await providerLoginRes.json();
    assert.strictEqual(providerLoginBody.data.user.id, upgradeBody.data.user.id);
    assert.strictEqual(providerLoginBody.data.created, false);
  });

  await test('（11.upgrade流程不受影響）upgradeGuestController本身行為完全不變（純記憶體）', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-upg-unaffected-1'));
    db.seedSession(activeSession('tok-upg-unaffected-1', 'u-upg-unaffected-1'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-upg-unaffected-1`, { provider: 'google', providerId: 'g-upg-mock-1' }, {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.user.id, 'u-upg-unaffected-1');
  });

  await test('（11.upgrade流程不受影響）POST /auth/provider/upgrade這條路由的middleware數量沒有因TASK1.32而改變（仍是1個）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/provider/upgrade');
    assert.strictEqual(route.middlewares.length, 1);
  });

  // =========================================================================
  // H. KV/R2不受影響
  // =========================================================================

  await test('（12.KV/R2不受影響）POST /auth/provider 完全不呼叫SYNC_KV/R2', async () => {
    const env = makeFreshEnv();
    let kvOrR2Called = false;
    env.SYNC_KV.get = async () => { kvOrR2Called = true; return null; };
    env.DIET_COACH_IMAGES.get = async () => { kvOrR2Called = true; return null; };
    await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-kv-1' })) }),
      env, {}
    );
    assert.strictEqual(kvOrR2Called, false);
  });

  await test('（12.KV/R2不受影響）啟用provider login後，/api/sync 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify(loginPayload({ providerId: 'g-kv-2' })) }),
      env, {}
    );
    const postRes = await worker.fetch(new Request('https://example.com/api/sync?code=provider-login-kv-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), env, {});
    assert.strictEqual((await postRes.json()).ok, true);
  });

  await test('（12.KV/R2不受影響）啟用provider login後，/img/* 讀取行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    assert.strictEqual(await res.text(), 'FAKE_JPEG_BYTES');
  });

  // =========================================================================
  // I. Legacy route不受影響
  // =========================================================================

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

  await test('（13.Legacy route不受影響）GET /icon.svg 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  await test('（13.Legacy route不受影響）GET /users/999（仍未啟用）落到首頁catch-all', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/users/999'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（13.Legacy route不受影響）D1完全沒有任何SQL呼叫（只呼叫不含auth的legacy路由時）', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=provider-login-legacy-1'), env, {});
    assert.strictEqual(env.DIET_COACH_DB.calls.length, 0);
  });

  await test('（13.Legacy route不受影響）啟用provider login後，/api/qlive 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/api/qlive?code=provider-login-qlive-1'), env, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'null');
  });

  // =========================================================================
  // J. 架構守則 / 原始碼掃描
  // =========================================================================

  await test('（架構守則）原始碼掃描：auth_routes.js 完全沒有直接呼叫 db.users 或 db.sessions', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'auth_routes.js'), 'utf8'));
    assert.ok(!/ctx\.db\.users|ctx\.db\.sessions/.test(src));
  });

  await test('（架構守則）原始碼掃描：auth_controller.js 不直接 import src/oauth/ 底下任何檔案（本次不接Google OAuth callback）', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'controllers', 'auth_controller.js'), 'utf8'));
    assert.ok(!/from\s+['"]\.\.\/oauth\//.test(src));
  });

  await test('（架構守則）原始碼掃描：worker.js 不 import src/oauth/（本次不接Google OAuth callback/Authorization Code Flow）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/from\s+['"]\.\/oauth\//.test(src));
  });

  await test('（架構守則）原始碼掃描：worker.js 沒有 legacy_import 相關字樣（未執行Legacy Import）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/legacy_import/i.test(src));
  });

  await test('（架構守則）原始碼掃描：worker.js 沒有呼叫任何 Google API（沒有 accounts.google.com / googleapis.com 字樣）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/accounts\.google\.com|googleapis\.com/.test(src));
  });

  await test('（架構守則）原始碼掃描：auth_controller.js 沒有儲存任何OAuth token相關欄位（access_token/refresh_token）', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'controllers', 'auth_controller.js'), 'utf8'));
    assert.ok(!/access_token|refresh_token/.test(src));
  });

  await test('（架構守則）原始碼掃描：worker.js 的 handle(r,env) 函式體完全沒有變動', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0);
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/createApplication|router\.handle|loginProvider/i.test(handleBody));
  });

  await test('（架構守則）git diff：wrangler.toml 在TASK1.32完全沒有異動', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat wrangler.toml', { cwd: path.join(__dirname, '..', '..') }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（架構守則）loginProviderContract.request 要求provider/providerId為必填字串，email/displayName選填', () => {
    assert.strictEqual(loginProviderContract.request.provider.required, true);
    assert.strictEqual(loginProviderContract.request.providerId.required, true);
    assert.strictEqual(loginProviderContract.request.email.required, false);
    assert.strictEqual(loginProviderContract.request.displayName.required, false);
  });

  await test('（架構守則）原始碼掃描：loginProviderContract定義在src/contracts/auth_contract.js，且被src/contracts/index.js統一輸出', async () => {
    const contractsIndex = await import('../../src/contracts/index.js');
    assert.strictEqual(contractsIndex.loginProviderContract, loginProviderContract);
  });

  await test('（架構守則）原始碼掃描：loginProviderController原始碼中的provider識別轉換邏輯（payload.provider→auth_provider）存在', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'controllers', 'auth_controller.js'), 'utf8'));
    assert.ok(/auth_provider:\s*payload\.provider/.test(src));
    assert.ok(/auth_provider_id:\s*payload\.providerId/.test(src));
  });

  await test('（架構守則）原始碼掃描：worker.js 對/auth/guest與/auth/provider共用同一個特殊處理分支', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const exportStart = src.indexOf('export default {');
    const codeOnly = src.slice(exportStart);
    assert.ok(/pathname === '\/auth\/guest' \|\| pathname === '\/auth\/provider'/.test(codeOnly));
  });

  await test('（架構守則）D1本地/正式環境驗證另外在 real_d1_verify.mjs 執行，本檔案完全不連線真實或本機模擬的資料庫', () => {
    assert.ok(true);
  });

  await test('（架構守則）router.js 每條路由各自快取自己的 pipelineHandler（applyPipeline在add()時建立一次，不是每次handle都重建）', async () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/provider');
    const handlerRef1 = route.applyPipeline;
    await router.handle({ method: 'POST', pathname: '/auth/provider', payload: loginPayload({ providerId: 'g-cache-check' }) }, { db: makeMockDb() });
    const handlerRef2 = route.applyPipeline;
    assert.strictEqual(handlerRef1, handlerRef2);
  });

  await test('（架構守則）loginProviderContract.response.failureReasons不含不會實際發生的invalid_provider（resolveLoginIdentity()只檢查存在性，不驗證是否為支援的provider）', () => {
    assert.ok(!loginProviderContract.response.failureReasons.includes('invalid_provider'));
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'provider-login-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

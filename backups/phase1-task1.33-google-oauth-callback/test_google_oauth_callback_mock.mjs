/*
 * Phase 1 TASK 1.33｜Google OAuth Callback Integration Layer 測試
 *
 * 分為以下部分：
 * A) loginWithGoogleCallback（service層）本身：state成功/失敗、code exchange
 *    成功/失敗、profile mapping、existing/new user、session建立
 * B) googleOAuthCallbackController（controller層）
 * C) Router routing / Contract validation
 * D) 真正的 src/worker.js 端對端測試（含真正的302 redirect/Set-Cookie）
 * E) token不落地 / secret不外洩
 * F) guest流程不受影響
 * G) provider login流程不受影響
 * H) Legacy route不受影響
 * I) 架構守則 / 原始碼掃描
 *
 * 全部使用純記憶體 mock D1/KV/R2 binding + 注入假 fetch（fetchImpl），
 * 完全不連線任何真實網路服務或資料庫，不會真的呼叫 Google
 * accounts.google.com/oauth2.googleapis.com/googleapis.com，也不使用任何
 * 真實 Google 帳號資料或憑證（全部用明顯的假值，例如
 * test-client-id.apps.googleusercontent.com、FAKE_ACCESS_TOKEN）。
 * 對「真實 local D1」的端對端驗證（mock callback→確認→清理）另外在
 * real_d1_verify.mjs 執行。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginWithGoogleCallback, OAUTH_STATE_COOKIE_NAME, loginWithProvider } from '../../src/services/auth_application_service.js';
import { googleOAuthCallbackController, loginGuestController, loginProviderController } from '../../src/controllers/auth_controller.js';
import { googleCallbackContract } from '../../src/contracts/auth_contract.js';
import { createAppRouter } from '../../src/routes/index.js';
import { createGoogleProvider } from '../../src/oauth/google.js';
import { createOAuthState } from '../../src/oauth/oauth_state.js';
import { serializeCookie } from '../../src/auth/cookie.js';
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

// 明顯的假設定，非任何真實 Google 專案的憑證（沿用TASK1.17測試的慣例）
const FAKE_CONFIG = {
  client_id: 'test-client-id.apps.googleusercontent.com',
  client_secret: 'FAKE_CLIENT_SECRET_FOR_TEST_ONLY',
  redirect_uri: 'https://example.com/auth/google/callback',
};

function makeFakeKV() {
  const store = new Map();
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}
function makeFakeR2(objects) {
  objects = objects || {};
  return { async get(key) { if (!objects[key]) return null; return { body: objects[key] }; } };
}

// 完整的 mock db：users/sessions，方法簽章對齊 src/db/tables/*.js
function makeMockDb() {
  const users = new Map();
  const sessions = new Map();
  const calls = [];

  function seedUser(user) {
    users.set(user.id, Object.assign({ status: 'active', is_guest: 1, auth_provider: null, auth_provider_id: null }, user));
  }

  return {
    calls,
    _users: users,
    _sessions: sessions,
    seedUser,
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
    },
    sessions: {
      async insert(s) {
        calls.push({ type: 'insert', table: 'sessions' });
        sessions.set(s.id, Object.assign({ revoked_at: null }, s));
        return { ok: true };
      },
      async getById(id) {
        calls.push({ type: 'getById', table: 'sessions' });
        return { ok: true, row: sessions.get(id) || null };
      },
    },
  };
}

// 針對users/sessions實際SQL做最小pattern match，讓真正worker.fetch()的
// round-trip情境能保有真的狀態（沿用TASK1.29起建立的模式）。
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
        } else if (/UPDATE users SET last_login_at/.test(sql)) {
          const [last_login_at, id] = params;
          const u = users.get(id);
          if (u) u.last_login_at = last_login_at;
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

function makeFakeGoogleFetch(overrides) {
  overrides = overrides || {};
  return async (url, opts) => {
    const u = String(url);
    if (u.indexOf('oauth2.googleapis.com/token') >= 0) {
      if (overrides.tokenResponse) return overrides.tokenResponse(url, opts);
      return { ok: true, json: async () => ({ access_token: 'FAKE_ACCESS_TOKEN', token_type: 'Bearer', expires_in: 3600, id_token: 'FAKE_ID_TOKEN_SHOULD_NEVER_LAND', scope: 'openid email profile' }) };
    }
    if (u.indexOf('googleapis.com/oauth2/v2/userinfo') >= 0) {
      if (overrides.profileResponse) return overrides.profileResponse(url, opts);
      return { ok: true, json: async () => ({ id: 'g-fake-1', email: 'fake@example.com', name: 'Fake Google User', picture: 'https://example.com/pic.jpg' }) };
    }
    throw new Error('unexpected fetch to ' + u + '（測試不應該打到這個端點）');
  };
}

function makeStateCookie(stateRecord) {
  const cookieString = serializeCookie(OAUTH_STATE_COOKIE_NAME, JSON.stringify(stateRecord), { secure: false });
  return cookieString.split(';')[0];
}

async function run() {
  const fakeGoogleProvider = createGoogleProvider(FAKE_CONFIG);

  // =========================================================================
  // A. loginWithGoogleCallback（service層）本身
  // =========================================================================

  await test('（1.state成功）合法state+成功exchange+成功profile時整條流程成功', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await loginWithGoogleCallback(
      db,
      { code: 'fake-code-1', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) },
      fakeGoogleProvider,
      { fetchImpl: makeFakeGoogleFetch() }
    );
    assert.strictEqual(result.ok, true);
    assert.ok(result.user);
    assert.ok(result.session);
    assert.ok(result.cookie);
  });

  await test('（2.state失敗）沒有cookie（沒有存放過state）時安全回傳missing_state', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await loginWithGoogleCallback(
      db,
      { code: 'fake-code-2', state: stateRecord.state, cookieHeader: null },
      fakeGoogleProvider,
      { fetchImpl: makeFakeGoogleFetch() }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_state');
  });

  await test('（2.state失敗）query帶的state跟cookie存放的不一致時回傳state_mismatch', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await loginWithGoogleCallback(
      db,
      { code: 'fake-code-3', state: 'this-is-a-tampered-different-state', cookieHeader: makeStateCookie(stateRecord) },
      fakeGoogleProvider,
      { fetchImpl: makeFakeGoogleFetch() }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'state_mismatch');
  });

  await test('（2.state失敗）state已過期時回傳state_expired', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState({ now: '2026-01-01T00:00:00.000Z', ttlSeconds: 600 });
    const result = await loginWithGoogleCallback(
      db,
      { code: 'fake-code-4', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) },
      fakeGoogleProvider,
      { fetchImpl: makeFakeGoogleFetch(), now: '2026-01-01T00:20:00.000Z' }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'state_expired');
  });

  await test('（2.state失敗）cookie存放的內容不是合法JSON時安全回傳missing_state（不拋例外）', async () => {
    const db = makeMockDb();
    const badCookie = serializeCookie(OAUTH_STATE_COOKIE_NAME, 'not-valid-json{{{', { secure: false }).split(';')[0];
    const result = await loginWithGoogleCallback(
      db,
      { code: 'fake-code-5', state: 'whatever-state', cookieHeader: badCookie },
      fakeGoogleProvider,
      { fetchImpl: makeFakeGoogleFetch() }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_state');
  });

  await test('（2.state失敗）query完全沒有帶state參數（undefined）時安全回傳missing_state', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await loginWithGoogleCallback(
      db,
      { code: 'fake-code-5b', state: undefined, cookieHeader: makeStateCookie(stateRecord) },
      fakeGoogleProvider,
      { fetchImpl: makeFakeGoogleFetch() }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_state');
  });

  await test('（2.state失敗）cookie裡有其他無關的cookie、但沒有oauth_state本身時仍安全回傳missing_state', async () => {
    const db = makeMockDb();
    const result = await loginWithGoogleCallback(
      db,
      { code: 'fake-code-5c', state: 'whatever', cookieHeader: 'unrelated_cookie=abc; another=def' },
      fakeGoogleProvider,
      { fetchImpl: makeFakeGoogleFetch() }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_state');
  });

  await test('（1.state成功）state在有效期內的最後一刻（尚未過期）仍驗證成功', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState({ now: '2026-01-01T00:00:00.000Z', ttlSeconds: 600 });
    const result = await loginWithGoogleCallback(
      db,
      { code: 'fake-code-5d', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) },
      fakeGoogleProvider,
      { fetchImpl: makeFakeGoogleFetch(), now: '2026-01-01T00:09:59.000Z' }
    );
    assert.strictEqual(result.ok, true);
  });

  await test('（2.state失敗）state驗證失敗時完全不會呼叫exchangeCode（短路，不浪費一次真實API額度）', async () => {
    const db = makeMockDb();
    let exchangeCalled = false;
    const spyFetch = async (url, opts) => { exchangeCalled = true; return makeFakeGoogleFetch()(url, opts); };
    await loginWithGoogleCallback(
      db,
      { code: 'fake-code-6', state: 'no-such-state', cookieHeader: null },
      fakeGoogleProvider,
      { fetchImpl: spyFetch }
    );
    assert.strictEqual(exchangeCalled, false);
  });

  await test('（oauth_not_configured）googleProvider為null時安全回傳oauth_not_configured，不嘗試呼叫任何方法', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await loginWithGoogleCallback(
      db,
      { code: 'fake-code-7', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) },
      null,
      { fetchImpl: makeFakeGoogleFetch() }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'oauth_not_configured');
  });

  await test('（3.code exchange成功）exchangeCode成功時正確取得accessToken並繼續往下流程', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    let capturedAccessToken = null;
    const fetchImpl = makeFakeGoogleFetch({
      profileResponse: async (url, opts) => {
        capturedAccessToken = opts.headers.Authorization;
        return { ok: true, json: async () => ({ id: 'g-capture-1', email: 'x@example.com', name: 'X' }) };
      },
    });
    const result = await loginWithGoogleCallback(
      db,
      { code: 'fake-code-8', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) },
      fakeGoogleProvider,
      { fetchImpl }
    );
    assert.strictEqual(result.ok, true);
    assert.strictEqual(capturedAccessToken, 'Bearer FAKE_ACCESS_TOKEN');
  });

  await test('（4.exchange失敗）token端點回傳HTTP錯誤時安全回傳code_exchange_failed', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ tokenResponse: async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }) });
    const result = await loginWithGoogleCallback(
      db,
      { code: 'bad-code', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) },
      fakeGoogleProvider,
      { fetchImpl }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'code_exchange_failed');
  });

  await test('（4.exchange失敗）token端點網路例外時安全回傳code_exchange_failed（不拋出未攔截例外）', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = async (url) => { if (String(url).indexOf('token') >= 0) throw new Error('network down'); return makeFakeGoogleFetch()(url); };
    const result = await loginWithGoogleCallback(
      db,
      { code: 'some-code', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) },
      fakeGoogleProvider,
      { fetchImpl }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'code_exchange_failed');
  });

  await test('（4.exchange失敗）token回應缺少access_token欄位時安全回傳code_exchange_failed', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ tokenResponse: async () => ({ ok: true, json: async () => ({ token_type: 'Bearer' }) }) });
    const result = await loginWithGoogleCallback(
      db,
      { code: 'some-code', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) },
      fakeGoogleProvider,
      { fetchImpl }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'code_exchange_failed');
  });

  await test('（4.exchange失敗）exchange失敗時完全不會呼叫getUserProfile', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    let profileCalled = false;
    const fetchImpl = makeFakeGoogleFetch({
      tokenResponse: async () => ({ ok: false, status: 500, json: async () => ({}) }),
      profileResponse: async (...args) => { profileCalled = true; return makeFakeGoogleFetch().profileResponse ? null : { ok: true, json: async () => ({ id: 'x' }) }; },
    });
    await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(profileCalled, false);
  });

  await test('（profile fetch失敗）userinfo端點回傳HTTP錯誤時安全回傳profile_fetch_failed', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: false, status: 401 }) });
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'profile_fetch_failed');
  });

  await test('（profile fetch失敗）userinfo端點網路例外時安全回傳profile_fetch_failed', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = async (url, opts) => {
      if (String(url).indexOf('userinfo') >= 0) throw new Error('network down');
      return makeFakeGoogleFetch()(url, opts);
    };
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'profile_fetch_failed');
  });

  await test('（5.profile mapping）profile成功取回時正確轉換成auth_provider=google/auth_provider_id=profile.id', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-mapping-1', email: 'm@example.com', name: 'Mapping Test' }) }) });
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.user.auth_provider, 'google');
    assert.strictEqual(result.user.auth_provider_id, 'g-mapping-1');
  });

  await test('（5.profile mapping）profile的name正確對應到user.display_name', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-mapping-2', email: 'm2@example.com', name: '測試使用者' }) }) });
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.user.display_name, '測試使用者');
  });

  await test('（5.profile mapping）profile缺少id欄位時安全回傳missing_provider_id', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ email: 'no-id@example.com', name: 'No Id' }) }) });
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_provider_id');
  });

  await test('（6.existing user login）同一個Google profile.id第二次callback時回傳既有user（created:false）', async () => {
    const db = makeMockDb();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-existing-1', email: 'e@example.com', name: 'Existing' }) }) });

    const state1 = createOAuthState();
    const first = await loginWithGoogleCallback(db, { code: 'c1', state: state1.state, cookieHeader: makeStateCookie(state1) }, fakeGoogleProvider, { fetchImpl });

    const state2 = createOAuthState();
    const second = await loginWithGoogleCallback(db, { code: 'c2', state: state2.state, cookieHeader: makeStateCookie(state2) }, fakeGoogleProvider, { fetchImpl });

    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.created, false);
    assert.strictEqual(second.user.id, first.user.id);
  });

  await test('（6.existing user login）existing user再次登入會touchLogin更新last_login_at', async () => {
    const db = makeMockDb();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-existing-2', email: 'e2@example.com', name: 'Existing2' }) }) });
    const state1 = createOAuthState();
    await loginWithGoogleCallback(db, { code: 'c1', state: state1.state, cookieHeader: makeStateCookie(state1) }, fakeGoogleProvider, { fetchImpl });
    const state2 = createOAuthState();
    await loginWithGoogleCallback(db, { code: 'c2', state: state2.state, cookieHeader: makeStateCookie(state2) }, fakeGoogleProvider, { fetchImpl });
    assert.ok(db.calls.filter((c) => c.type === 'touchLogin').length >= 1);
  });

  await test('（7.new user建立）第一次callback（全新profile.id）時建立新的provider user，created:true', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-new-1', email: 'new@example.com', name: 'New User' }) }) });
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.created, true);
    assert.ok(result.user.is_guest === false || result.user.is_guest === 0);
    assert.strictEqual(result.user.status, 'active');
  });

  await test('（6.不建立重複user）同一個provider identity連續3次callback，users裡只會有1筆對應的user', async () => {
    const db = makeMockDb();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-dup-1', email: 'd@example.com', name: 'Dup' }) }) });
    for (let i = 0; i < 3; i++) {
      const stateRecord = createOAuthState();
      await loginWithGoogleCallback(db, { code: 'c' + i, state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    }
    const matches = [...db._users.values()].filter((u) => u.auth_provider === 'google' && u.auth_provider_id === 'g-dup-1');
    assert.strictEqual(matches.length, 1);
  });

  await test('（既有provider user被suspended）第二次callback時被拒絕，reason=user_suspended', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-susp-1', status: 'suspended', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-susp-1' });
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-susp-1', email: 's@example.com', name: 'Susp' }) }) });
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_suspended');
  });

  await test('（既有provider user被deleted）第二次callback時被拒絕，reason=user_deleted', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-del-1', status: 'deleted', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-del-1' });
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-del-1', email: 'd@example.com', name: 'Del' }) }) });
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_deleted');
  });

  await test('（8.session建立）成功時建立的session token長度足夠長（32 bytes以上, opaque token）', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl: makeFakeGoogleFetch() });
    assert.ok(result.session.token.length >= 32);
  });

  await test('（8.session建立）session的user_id正確指向登入的user，TTL正確', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl: makeFakeGoogleFetch() });
    const sessionEntry = db._sessions.get(result.session.token);
    assert.strictEqual(sessionEntry.user_id, result.user.id);
    const ttlSeconds = (new Date(sessionEntry.expires_at).getTime() - new Date(sessionEntry.created_at).getTime()) / 1000;
    assert.strictEqual(Math.round(ttlSeconds), SESSION_TTL_SECONDS);
  });

  await test('（9.cookie輸出）成功時cookie是新session的Set-Cookie字串', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl: makeFakeGoogleFetch() });
    assert.ok(result.cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
    assert.ok(result.cookie.indexOf(result.session.token) >= 0);
  });

  await test('（10.token不落地）回傳值裡完全沒有accessToken/idToken/refreshToken欄位', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl: makeFakeGoogleFetch() });
    const serialized = JSON.stringify(result);
    assert.ok(serialized.indexOf('FAKE_ACCESS_TOKEN') < 0);
    assert.ok(serialized.indexOf('FAKE_ID_TOKEN_SHOULD_NEVER_LAND') < 0);
    assert.ok(!Object.prototype.hasOwnProperty.call(result, 'accessToken'));
    assert.ok(!Object.prototype.hasOwnProperty.call(result, 'idToken'));
    assert.ok(!Object.prototype.hasOwnProperty.call(result, 'refreshToken'));
  });

  await test('（10.token不落地）建立的user/session資料列裡完全沒有token相關欄位', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl: makeFakeGoogleFetch() });
    for (const u of db._users.values()) {
      assert.ok(!('access_token' in u) && !('refresh_token' in u) && !('id_token' in u));
    }
    for (const s of db._sessions.values()) {
      assert.ok(!('access_token' in s) && !('refresh_token' in s) && !('id_token' in s));
    }
  });

  await test('（5.profile mapping）profile沒有email欄位時，identity.email安全地是null（不會拋例外）', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-noemail-1', name: 'No Email User' }) }) });
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.profile mapping）profile.id是數字型別時，mapGoogleProfileToIdentity()會轉成字串再比對/儲存', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 123456789, email: 'num@example.com', name: 'Numeric Id' }) }) });
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.user.auth_provider_id, '123456789');
  });

  await test('（7.new user建立）新建立的provider user的legacy_sync_code為null（非透過legacy import路徑建立）', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-legacy-check-1', email: 'l@example.com', name: 'L' }) }) });
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.user.legacy_sync_code, null);
  });

  await test('（8.session建立）連續3個不同Google profile.id各自callback，各自產生獨立的user/session（不互相干擾）', async () => {
    const db = makeMockDb();
    const ids = ['g-multi-1', 'g-multi-2', 'g-multi-3'];
    const results = [];
    for (const id of ids) {
      const stateRecord = createOAuthState();
      const fetchImpl = makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id, email: id + '@example.com', name: id }) }) });
      results.push(await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl }));
    }
    const userIds = new Set(results.map((r) => r.user.id));
    const sessionTokens = new Set(results.map((r) => r.session.token));
    assert.strictEqual(userIds.size, 3);
    assert.strictEqual(sessionTokens.size, 3);
  });

  await test('（9.cookie輸出）cookie不是清除用的空cookie（不是Max-Age=0）', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl: makeFakeGoogleFetch() });
    assert.ok(result.cookie.indexOf('Max-Age=0') < 0);
  });

  await test('（延續守則）loginWithGoogleCallback對payload缺少code時仍安全走state驗證優先（不會在還沒驗證state前就嘗試呼叫exchangeCode）', async () => {
    const db = makeMockDb();
    let exchangeCalled = false;
    const spyFetch = async (url, opts) => { exchangeCalled = true; return makeFakeGoogleFetch()(url, opts); };
    await loginWithGoogleCallback(db, { code: undefined, state: 'no-such-state', cookieHeader: null }, fakeGoogleProvider, { fetchImpl: spyFetch });
    assert.strictEqual(exchangeCalled, false);
  });

  console.log('');

  // =========================================================================
  // B. googleOAuthCallbackController（controller層）
  // =========================================================================

  await test('（controller）成功時回傳success shape：{user,session,cookie,created}', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await googleOAuthCallbackController(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl: makeFakeGoogleFetch() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['cookie', 'created', 'session', 'user']);
  });

  await test('（controller）googleProvider為null時安全回傳failure(oauth_not_configured)，不拋例外', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await googleOAuthCallbackController(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, null, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'oauth_not_configured');
  });

  await test('（controller）state驗證失敗時安全回傳failure(missing_state)', async () => {
    const db = makeMockDb();
    const result = await googleOAuthCallbackController(db, { code: 'x', state: 'whatever', cookieHeader: null }, fakeGoogleProvider, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_state');
  });

  await test('（controller）exchange失敗時安全回傳failure(code_exchange_failed)', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const fetchImpl = makeFakeGoogleFetch({ tokenResponse: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
    const result = await googleOAuthCallbackController(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'code_exchange_failed');
  });

  await test('（controller）internal exception時安全回傳failure(500)，不拋出未攔截例外', async () => {
    const throwingProvider = { exchangeCode: async () => { throw new Error('boom'); }, getUserProfile: async () => ({ ok: true, profile: { id: 'x' } }) };
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await googleOAuthCallbackController(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, throwingProvider, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  // =========================================================================
  // C. Router routing / Contract validation
  // =========================================================================

  await test('（Router routing）createAppRouter() 註冊了GET /auth/google/callback', () => {
    const router = createAppRouter();
    assert.ok(router.routes.find((r) => r.method === 'GET' && r.path === '/auth/google/callback'));
  });

  await test('（Router routing）GET /auth/google/callback這條路由具備1個middleware（contract validation）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/auth/google/callback');
    assert.strictEqual(route.middlewares.length, 1);
  });

  await test('（Contract validation）缺少code時被contract validation擋下，回400', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/auth/google/callback', query: { state: 's1' } }, { db: makeMockDb(), env: {} });
    assert.strictEqual(res.status, 400);
  });

  await test('（Contract validation）缺少state時被contract validation擋下，回400', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/auth/google/callback', query: { code: 'c1' } }, { db: makeMockDb(), env: {} });
    assert.strictEqual(res.status, 400);
  });

  await test('（Contract validation）query為完全空物件時被contract validation擋下', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/auth/google/callback', query: {} }, { db: makeMockDb(), env: {} });
    assert.strictEqual(res.status, 400);
  });

  await test('（Router routing）POST /auth/google/callback（方法不符）回405', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/auth/google/callback' }, { db: makeMockDb(), env: {} });
    assert.strictEqual(res.status, 405);
  });

  await test('（Router routing）code/state齊全但env沒有Google secret時，route層安全回傳302且oauth_error=oauth_not_configured', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/auth/google/callback', query: { code: 'c1', state: 's1' } }, { db: makeMockDb(), env: {} });
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get('Location'), '/?oauth_error=oauth_not_configured');
  });

  await test('（Contract validation）code欄位型別錯誤（數字而非字串）時被擋下，回400', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/auth/google/callback', query: { code: 123, state: 's1' } }, { db: makeMockDb(), env: {} });
    assert.strictEqual(res.status, 400);
  });

  await test('（Router routing）DELETE /auth/google/callback（方法不符）回405', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'DELETE', pathname: '/auth/google/callback' }, { db: makeMockDb(), env: {} });
    assert.strictEqual(res.status, 405);
  });

  await test('（Router routing）成功時的302 Response本身沒有Content-Type: application/json（不是JSON API）', async () => {
    const router = createAppRouter();
    const stateRecord = createOAuthState();
    const res = await router.handle(
      { method: 'GET', pathname: '/auth/google/callback', query: { code: 'c1', state: stateRecord.state }, cookieHeader: makeStateCookie(stateRecord), options: { fetchImpl: makeFakeGoogleFetch() } },
      { db: makeMockDb(), env: { GOOGLE_CLIENT_ID: FAKE_CONFIG.client_id, GOOGLE_CLIENT_SECRET: FAKE_CONFIG.client_secret, GOOGLE_REDIRECT_URI: FAKE_CONFIG.redirect_uri } }
    );
    assert.notStrictEqual(res.headers.get('Content-Type'), 'application/json');
  });

  console.log('');

  // =========================================================================
  // D. 真正的 src/worker.js 端對端測試
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

  function makeGoogleEnv() {
    return makeFreshEnv({
      GOOGLE_CLIENT_ID: FAKE_CONFIG.client_id,
      GOOGLE_CLIENT_SECRET: FAKE_CONFIG.client_secret,
      GOOGLE_REDIRECT_URI: FAKE_CONFIG.redirect_uri,
    });
  }

  // TASK1.33的worker.js branch本身不支援注入options.fetchImpl（真正的
  // Cloudflare Worker Request不會有這個欄位），這裡透過暫時覆寫全域
  // fetch來模擬（跟TASK1.17/1.32既有測試手法一致的精神：測試時完全不會
  // 對Google真實伺服器發出任何請求），測試結束後一律還原。
  const originalGlobalFetch = globalThis.fetch;
  function withFakeGlobalFetch(fakeFetch, fn) {
    globalThis.fetch = fakeFetch;
    return Promise.resolve()
      .then(fn)
      .finally(() => { globalThis.fetch = originalGlobalFetch; });
  }

  await test('（1.state成功，端對端）透過真正worker.fetch()走完整callback流程成功並302導回首頁', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-e2e-1', email: 'e2e1@example.com', name: 'E2E1' }) }) }), async () => {
      const env = makeGoogleEnv();
      const stateRecord = createOAuthState();
      const res = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get('Location'), '/');
      assert.ok(res.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`)));
    });
  });

  await test('（2.state失敗，端對端）state不一致時302導回首頁並帶oauth_error=state_mismatch，不建立任何session', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch(), async () => {
      const env = makeGoogleEnv();
      const stateRecord = createOAuthState();
      const res = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=tampered-state-value`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get('Location'), '/?oauth_error=state_mismatch');
      assert.strictEqual(env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /INSERT INTO sessions/.test(c.sql)).length, 0);
    });
  });

  await test('（4.exchange失敗，端對端）Google token端點失敗時302導回首頁並帶oauth_error=code_exchange_failed', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch({ tokenResponse: async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }) }), async () => {
      const env = makeGoogleEnv();
      const stateRecord = createOAuthState();
      const res = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=bad-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get('Location'), '/?oauth_error=code_exchange_failed');
    });
  });

  await test('（端對端）oauth_state cookie無論成功或失敗都會被清除（一次性、防重放）', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch(), async () => {
      const env = makeGoogleEnv();
      const stateRecord = createOAuthState();
      const res = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      const clearedCookie = res.headers.getSetCookie().find((c) => c.startsWith(`${OAUTH_STATE_COOKIE_NAME}=`));
      assert.ok(clearedCookie);
      assert.ok(/Max-Age=0/.test(clearedCookie));
    });
  });

  await test('（端對端）同一個state不能被重放使用第二次（第一次成功後，state已經被清除，第二次會missing_state）', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-replay-1', email: 'r@example.com', name: 'Replay' }) }) }), async () => {
      const env = makeGoogleEnv();
      const stateRecord = createOAuthState();
      const cookieValue = makeStateCookie(stateRecord);
      const firstRes = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: cookieValue } }),
        env, {}
      );
      assert.strictEqual(firstRes.status, 302);
      assert.strictEqual(firstRes.headers.get('Location'), '/');

      // 模擬瀏覽器已經照Set-Cookie清除了oauth_state（第二次請求不再帶
      // 這個cookie），用同一個state值重放
      const secondRes = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`),
        env, {}
      );
      assert.strictEqual(secondRes.status, 302);
      assert.strictEqual(secondRes.headers.get('Location'), '/?oauth_error=missing_state');
    });
  });

  await test('（端對端）沒有D1 binding時（bootstrap失敗），優雅fallback到legacy首頁', async () => {
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2({}) };
    const res = await worker.fetch(new Request('https://example.com/auth/google/callback?code=c&state=s'), env, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（延續守則）FEATURE_ROUTE_MIGRATION_ENABLED=true時，google callback依然正常（不依賴這個flag）', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-flag-1', email: 'f@example.com', name: 'Flag' }) }) }), async () => {
      const env = Object.assign(makeGoogleEnv(), { FEATURE_ROUTE_MIGRATION_ENABLED: 'true' });
      const stateRecord = createOAuthState();
      const res = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get('Location'), '/');
    });
  });

  await test('（3.code exchange成功，端對端）D1恰好有一次INSERT INTO users與一次INSERT INTO sessions', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-e2e-counts-1', email: 'c@example.com', name: 'Counts' }) }) }), async () => {
      const env = makeGoogleEnv();
      const stateRecord = createOAuthState();
      await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      const insertUserCalls = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /INSERT INTO users/.test(c.sql));
      const insertSessionCalls = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /INSERT INTO sessions/.test(c.sql));
      assert.strictEqual(insertUserCalls.length, 1);
      assert.strictEqual(insertSessionCalls.length, 1);
    });
  });

  await test('（6.existing user login，端對端）同一個Google帳號第二次callback時，D1不會有第二次INSERT INTO users', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-e2e-existing-1', email: 'ex@example.com', name: 'Existing' }) }) }), async () => {
      const env = makeGoogleEnv();
      const state1 = createOAuthState();
      await worker.fetch(new Request(`https://example.com/auth/google/callback?code=c1&state=${encodeURIComponent(state1.state)}`, { headers: { Cookie: makeStateCookie(state1) } }), env, {});
      const state2 = createOAuthState();
      await worker.fetch(new Request(`https://example.com/auth/google/callback?code=c2&state=${encodeURIComponent(state2.state)}`, { headers: { Cookie: makeStateCookie(state2) } }), env, {});
      const insertUserCalls = env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /INSERT INTO users/.test(c.sql));
      assert.strictEqual(insertUserCalls.length, 1);
      assert.strictEqual(env.DIET_COACH_DB._users.size, 1);
    });
  });

  console.log('');

  // =========================================================================
  // E. token不落地 / secret不外洩（端對端）
  // =========================================================================

  await test('（10.token不落地，端對端）302回應完全沒有body，Location/Set-Cookie裡都不含accessToken字串', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-noleak-1', email: 'n@example.com', name: 'NoLeak' }) }) }), async () => {
      const env = makeGoogleEnv();
      const stateRecord = createOAuthState();
      const res = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      const body = await res.text();
      assert.strictEqual(body, '');
      assert.ok(res.headers.get('Location').indexOf('FAKE_ACCESS_TOKEN') < 0);
      for (const c of res.headers.getSetCookie()) {
        assert.ok(c.indexOf('FAKE_ACCESS_TOKEN') < 0);
        assert.ok(c.indexOf('FAKE_ID_TOKEN_SHOULD_NEVER_LAND') < 0);
      }
    });
  });

  await test('（10.token不落地，端對端）D1裡建立的users/sessions資料列完全不含access_token/id_token欄位或值', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-noleak-2', email: 'n2@example.com', name: 'NoLeak2' }) }) }), async () => {
      const env = makeGoogleEnv();
      const stateRecord = createOAuthState();
      await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      const insertUserCall = env.DIET_COACH_DB.calls.find((c) => c.type === 'run' && /INSERT INTO users/.test(c.sql));
      assert.ok(insertUserCall);
      const serializedParams = JSON.stringify(insertUserCall.params);
      assert.ok(serializedParams.indexOf('FAKE_ACCESS_TOKEN') < 0);
      assert.ok(serializedParams.indexOf('FAKE_ID_TOKEN_SHOULD_NEVER_LAND') < 0);
    });
  });

  await test('（11.secret不外洩，端對端）302回應的Location/Set-Cookie裡都不含client_secret字串', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch(), async () => {
      const env = makeGoogleEnv();
      const stateRecord = createOAuthState();
      const res = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      assert.ok(res.headers.get('Location').indexOf(FAKE_CONFIG.client_secret) < 0);
      for (const c of res.headers.getSetCookie()) assert.ok(c.indexOf(FAKE_CONFIG.client_secret) < 0);
    });
  });

  await test('（11.secret不外洩）client_secret只出現在「送給Google token端點」的outgoing request body，不出現在任何回傳值', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    let capturedOutgoingBody = null;
    const fetchImpl = makeFakeGoogleFetch({
      tokenResponse: async (url, opts) => {
        capturedOutgoingBody = opts.body;
        return { ok: true, json: async () => ({ access_token: 'FAKE_ACCESS_TOKEN', token_type: 'Bearer' }) };
      },
    });
    const result = await loginWithGoogleCallback(db, { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) }, fakeGoogleProvider, { fetchImpl });
    assert.ok(capturedOutgoingBody.indexOf(encodeURIComponent(FAKE_CONFIG.client_secret)) >= 0, 'client_secret應該確實被送到Google token端點');
    assert.ok(JSON.stringify(result).indexOf(FAKE_CONFIG.client_secret) < 0, 'client_secret不應該出現在回傳給呼叫端的結果裡');
  });

  await test('（11.secret不外洩）getGoogleProviderFromEnv()完全依賴env注入，缺任一項就回傳null而非用假值頂替', async () => {
    // 直接測試route層行為：透過router.handle()確認env不完整時安全短路
    const router = createAppRouter();
    const res1 = await router.handle({ method: 'GET', pathname: '/auth/google/callback', query: { code: 'c', state: 's' } }, { db: makeMockDb(), env: { GOOGLE_CLIENT_ID: 'x' } });
    assert.strictEqual(res1.headers.get('Location'), '/?oauth_error=oauth_not_configured');
    const res2 = await router.handle({ method: 'GET', pathname: '/auth/google/callback', query: { code: 'c', state: 's' } }, { db: makeMockDb(), env: { GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' } });
    assert.strictEqual(res2.headers.get('Location'), '/?oauth_error=oauth_not_configured');
  });

  console.log('');

  // =========================================================================
  // F. guest流程不受影響
  // =========================================================================

  await test('（12.guest流程不受影響）POST /auth/guest 透過真正worker.fetch()依然正常運作', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.user.is_guest === true || body.data.user.is_guest === 1);
  });

  await test('（12.guest流程不受影響）loginGuestController本身行為完全不變（純記憶體）', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, {}, {});
    assert.strictEqual(result.ok, true);
  });

  await test('（12.guest流程不受影響）guest login與google callback各自產生獨立的user', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-guest-unaffected-1', email: 'gg@example.com', name: 'GG' }) }) }), async () => {
      const env = makeGoogleEnv();
      const guestRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
      const guestBody = await guestRes.json();
      const stateRecord = createOAuthState();
      const callbackRes = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      assert.strictEqual(callbackRes.status, 302);
      const usersCount = env.DIET_COACH_DB._users.size;
      assert.strictEqual(usersCount, 2);
      assert.ok(guestBody.data.user.id);
    });
  });

  // =========================================================================
  // G. provider login流程不受影響
  // =========================================================================

  await test('（13.provider login不受影響）POST /auth/provider 透過真正worker.fetch()依然正常運作', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify({ provider: 'google', providerId: 'g-provider-unaffected-1' }) }),
      env, {}
    );
    assert.strictEqual(res.status, 200);
  });

  await test('（13.provider login不受影響）loginProviderController本身行為完全不變（純記憶體）', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, { provider: 'google', providerId: 'g-ctrl-unaffected-1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（13.provider login不受影響）先透過POST /auth/provider登入的provider identity，之後用同一個Google profile.id做OAuth callback能找到同一個user（existing user login）', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-shared-1', email: 's@example.com', name: 'Shared' }) }) }), async () => {
      const env = makeGoogleEnv();
      const providerRes = await worker.fetch(
        new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify({ provider: 'google', providerId: 'g-shared-1' }) }),
        env, {}
      );
      const providerBody = await providerRes.json();

      const stateRecord = createOAuthState();
      const callbackRes = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      assert.strictEqual(callbackRes.status, 302);
      assert.strictEqual(env.DIET_COACH_DB._users.size, 1, 'provider login跟OAuth callback應該找到同一個user，不會建立第二筆');
      const onlyUser = [...env.DIET_COACH_DB._users.values()][0];
      assert.strictEqual(onlyUser.id, providerBody.data.user.id);
    });
  });

  await test('（13.provider login不受影響）POST /auth/provider這條路由的middleware數量沒有因TASK1.33而改變（仍是1個）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/provider');
    assert.strictEqual(route.middlewares.length, 1);
  });

  await test('（13.provider login不受影響）POST /auth/provider/upgrade這條路由的middleware數量沒有因TASK1.33而改變（仍是1個）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/provider/upgrade');
    assert.strictEqual(route.middlewares.length, 1);
  });

  await test('（13.provider login不受影響）GET /auth/me這條路由的middleware數量沒有因TASK1.33而改變（仍是1個）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/auth/me');
    assert.strictEqual(route.middlewares.length, 1);
  });

  await test('（13.provider login不受影響）POST /auth/logout這條路由的middleware數量沒有因TASK1.33而改變（仍是1個）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/logout');
    assert.strictEqual(route.middlewares.length, 1);
  });

  await test('（13.provider login不受影響）POST /auth/guest這條路由的middleware數量沒有因TASK1.33而改變（仍是1個）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/guest');
    assert.strictEqual(route.middlewares.length, 1);
  });

  // =========================================================================
  // H. Legacy route不受影響
  // =========================================================================

  await test('（14.Legacy route不受影響）GET / 首頁HTML完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/'), env, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（14.Legacy route不受影響）GET /manifest.json 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), env, {});
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
  });

  await test('（14.Legacy route不受影響）GET /users/999（仍未啟用）落到首頁catch-all', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/users/999'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（14.Legacy route不受影響）POST /auth/google/callback（GET以外的方法，仍照路由方法比對）落到gateway/legacy（因為worker.js只特殊處理GET）', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/google/callback', { method: 'POST' }), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（14.Legacy route不受影響）D1完全沒有任何SQL呼叫（只呼叫不含auth的legacy路由時）', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=oauth-legacy-1'), env, {});
    assert.strictEqual(env.DIET_COACH_DB.calls.length, 0);
  });

  await test('（14.Legacy route不受影響）啟用google callback後，/img/* 讀取行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    assert.strictEqual(await res.text(), 'FAKE_JPEG_BYTES');
  });

  await test('（14.Legacy route不受影響）啟用google callback後，/api/sync 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=oauth-kv-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), env, {});
    assert.strictEqual((await res.json()).ok, true);
  });

  await test('（14.Legacy route不受影響）GET /icon.svg 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  await test('（14.Legacy route不受影響）GET /apple-touch-icon.png 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/apple-touch-icon.png'), env, {});
    assert.strictEqual(res.status, 200);
  });

  // =========================================================================
  // I. 架構守則 / 原始碼掃描
  // =========================================================================

  await test('（架構守則）原始碼掃描：worker.js 沒有寫死任何client_secret字樣或FAKE_CONFIG以外的憑證', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/client_secret\s*[:=]\s*['"][^'"]+['"]/i.test(src));
  });

  await test('（架構守則）原始碼掃描：src/routes/auth_routes.js 沒有寫死任何client_secret字樣（一律從ctx.env讀取）', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'auth_routes.js'), 'utf8'));
    assert.ok(!/client_secret\s*:\s*['"][^'"]+['"]/i.test(src));
    assert.ok(/env\.GOOGLE_CLIENT_SECRET/.test(src));
  });

  await test('（架構守則）原始碼掃描：src/services/auth_application_service.js 沒有把accessToken/idToken寫進任何回傳物件', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'services', 'auth_application_service.js'), 'utf8'));
    assert.ok(!/accessToken\s*:/.test(src));
    assert.ok(!/idToken\s*:/.test(src));
  });

  await test('（架構守則）原始碼掃描：auth_controller.js 完全沒有一行 import src/oauth/ 底下任何檔案', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'controllers', 'auth_controller.js'), 'utf8'));
    assert.ok(!/from\s+['"]\.\.\/oauth\//.test(src));
  });

  await test('（架構守則）原始碼掃描：auth_controller.js 沒有 import src/auth/session.js、src/identity/session_rules.js、src/auth/cookie.js', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'controllers', 'auth_controller.js'), 'utf8'));
    assert.ok(!/from\s+['"]\.\.\/auth\/session\.js['"]/.test(src));
    assert.ok(!/from\s+['"]\.\.\/identity\/session_rules\.js['"]/.test(src));
    assert.ok(!/from\s+['"]\.\.\/auth\/cookie\.js['"]/.test(src));
  });

  await test('（架構守則）原始碼掃描：worker.js 沒有 legacy_import 相關字樣（未執行Legacy Import）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/legacy_import/i.test(src));
  });

  await test('（架構守則）原始碼掃描：worker.js 的 handle(r,env) 函式體完全沒有變動', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0);
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/createApplication|router\.handle|loginWithGoogleCallback/i.test(handleBody));
  });

  await test('（架構守則）git diff：wrangler.toml 在TASK1.33完全沒有異動', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat wrangler.toml', { cwd: path.join(__dirname, '..', '..') }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（架構守則）googleCallbackContract.request 要求code/state為必填字串', () => {
    assert.strictEqual(googleCallbackContract.request.code.required, true);
    assert.strictEqual(googleCallbackContract.request.state.required, true);
  });

  await test('（架構守則）原始碼掃描：googleCallbackContract定義在src/contracts/auth_contract.js，且被src/contracts/index.js統一輸出', async () => {
    const contractsIndex = await import('../../src/contracts/index.js');
    assert.strictEqual(contractsIndex.googleCallbackContract, googleCallbackContract);
  });

  await test('（架構守則）loginWithGoogleCallback最終委派給既有、已測試過的loginWithProvider()（不重新實作resolveLoginIdentity邏輯）', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'services', 'auth_application_service.js'), 'utf8'));
    assert.ok(/return loginWithProvider\(db, identityResult\.identity, options\);/.test(src));
  });

  await test('（架構守則）router.js 每條路由各自快取自己的 pipelineHandler（applyPipeline在add()時建立一次，不是每次handle都重建）', async () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/auth/google/callback');
    const handlerRef1 = route.applyPipeline;
    await router.handle({ method: 'GET', pathname: '/auth/google/callback', query: { code: 'c', state: 's' } }, { db: makeMockDb(), env: {} });
    const handlerRef2 = route.applyPipeline;
    assert.strictEqual(handlerRef1, handlerRef2);
  });

  await test('（架構守則）原始碼掃描：src/oauth/底下的檔案完全沒有被本次任務修改出任何D1/KV相關import（TASK1.17既有限制持續成立）', () => {
    const oauthDir = path.join(__dirname, '..', '..', 'src', 'oauth');
    for (const file of fs.readdirSync(oauthDir)) {
      if (!file.endsWith('.js')) continue;
      const src = stripComments(fs.readFileSync(path.join(oauthDir, file), 'utf8'));
      assert.ok(!/from\s+['"].*\/db\//.test(src), file + ' 不應該import db相關模組');
      assert.ok(!/SYNC_KV/.test(src), file + ' 不應該直接操作KV');
    }
  });

  await test('（架構守則）OAUTH_STATE_COOKIE_NAME與SESSION_COOKIE_NAME是兩個不同的cookie名稱（避免互相覆蓋）', async () => {
    assert.notStrictEqual(OAUTH_STATE_COOKIE_NAME, SESSION_COOKIE_NAME);
  });

  await test('（架構守則）googleCallbackContract.response.failureReasons涵蓋所有loginWithGoogleCallback()可能回傳的reason', () => {
    const expectedReasons = [
      'oauth_not_configured', 'missing_state', 'state_mismatch', 'state_expired',
      'code_exchange_failed', 'profile_fetch_failed', 'invalid_profile', 'missing_provider_id',
      'invalid_identity', 'user_suspended', 'user_deleted', 'user_status_unknown',
    ];
    for (const reason of expectedReasons) {
      assert.ok(googleCallbackContract.response.failureReasons.includes(reason), reason + ' 應該在failureReasons裡');
    }
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'google-oauth-callback-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

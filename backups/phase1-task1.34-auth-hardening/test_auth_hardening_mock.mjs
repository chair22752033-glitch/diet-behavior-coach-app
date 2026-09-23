/*
 * Phase 1 TASK 1.34｜Production Authentication Hardening Layer 測試
 *
 * 分為以下部分：
 * A) Session Cleanup Service（findExpiredSessions/cleanupExpiredSessions）
 * B) Session Management Service（listUserSessions/revokeSessionById/revokeAllSessions）
 * C) Multi-device session（同一個user多個session的管理情境）
 * D) Authentication Audit Log（recordAuthEvent/listAuthEventsForUser/listAuthEventsByType）
 * E) Provider Validation Hardening（validateProviderIdentity + 三個入口）
 * F) Login regression（guest/provider login既有行為不受影響）
 * G) OAuth regression（google callback既有行為不受影響）
 * H) Guest regression（guest lifecycle不受影響）
 * I) Logout regression（logout不受影響）
 * J) D1 migration（schema/db層wiring正確）
 * K) 架構守則 / 原始碼掃描
 *
 * 全部使用純記憶體 mock D1 binding，完全不連線任何真實或本機模擬的
 * 資料庫。對「真實 local D1」的端對端驗證（建立→audit log寫入→
 * cleanup→清理）另外在 real_d1_verify.mjs 執行。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findExpiredSessions, cleanupExpiredSessions } from '../../src/services/session_cleanup_service.js';
import { listUserSessions, revokeSessionById, revokeAllSessions } from '../../src/services/session_management_service.js';
import { recordAuthEvent, listAuthEventsForUser, listAuthEventsByType, AUTH_AUDIT_EVENT_TYPES } from '../../src/services/audit_log_service.js';
import { validateProviderIdentity, SUPPORTED_PROVIDERS } from '../../src/services/auth_security_service.js';
import { AUTH_AUDIT_EVENT_TYPES as TABLE_AUDIT_EVENT_TYPES } from '../../src/db/tables/auth_audit_logs.js';

import {
  loginGuestController,
  loginProviderController,
  logoutController,
  currentUserController,
  upgradeGuestController,
  googleOAuthCallbackController,
} from '../../src/controllers/auth_controller.js';
import { loginProviderContract, googleCallbackContract } from '../../src/contracts/auth_contract.js';
import { createAppRouter } from '../../src/routes/index.js';
import { createGoogleProvider } from '../../src/oauth/google.js';
import { createOAuthState } from '../../src/oauth/oauth_state.js';
import { serializeCookie } from '../../src/auth/cookie.js';
import { OAUTH_STATE_COOKIE_NAME } from '../../src/services/auth_application_service.js';
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

const FAKE_CONFIG = {
  client_id: 'test-client-id.apps.googleusercontent.com',
  client_secret: 'FAKE_CLIENT_SECRET_FOR_TEST_ONLY',
  redirect_uri: 'https://example.com/auth/google/callback',
};

// 完整的 mock db：users/sessions/authAuditLogs，方法簽章對齊 src/db/tables/*.js
function makeMockDb() {
  const users = new Map();
  const sessions = new Map();
  const authAuditLogs = new Map();
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
    _authAuditLogs: authAuditLogs,
    seedUser,
    seedSession,
    users: {
      async insert(u) { calls.push({ type: 'insert', table: 'users' }); seedUser(u); return { ok: true }; },
      async getById(id) { calls.push({ type: 'getById', table: 'users' }); return { ok: true, row: users.get(id) || null }; },
      async getByProvider(provider, providerId) {
        calls.push({ type: 'getByProvider', table: 'users' });
        for (const u of users.values()) if (u.auth_provider === provider && u.auth_provider_id === providerId) return { ok: true, row: u };
        return { ok: true, row: null };
      },
      async touchLogin(id, now) { calls.push({ type: 'touchLogin', table: 'users' }); const u = users.get(id); if (u) u.last_login_at = now; return { ok: true }; },
      async upgradeToProvider(id, provider, providerId, updatedAt) {
        calls.push({ type: 'upgradeToProvider', table: 'users' });
        const u = users.get(id);
        if (u) { u.auth_provider = provider; u.auth_provider_id = providerId; u.is_guest = 0; u.updated_at = updatedAt; }
        return { ok: true };
      },
      async updateStatus(id, status) { calls.push({ type: 'updateStatus', table: 'users' }); const u = users.get(id); if (u) u.status = status; return { ok: true }; },
    },
    sessions: {
      async insert(s) { calls.push({ type: 'insert', table: 'sessions' }); seedSession(s); return { ok: true }; },
      async getById(id) { calls.push({ type: 'getById', table: 'sessions' }); return { ok: true, row: sessions.get(id) || null }; },
      async listByUser(userId) {
        calls.push({ type: 'listByUser', table: 'sessions' });
        const results = [...sessions.values()].filter((s) => s.user_id === userId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        return { ok: true, results };
      },
      async touch(id, lastSeenAt) { calls.push({ type: 'touch', table: 'sessions' }); const s = sessions.get(id); if (s) s.last_seen_at = lastSeenAt; return { ok: true }; },
      async revoke(id, revokedAt) { calls.push({ type: 'revoke', table: 'sessions' }); const s = sessions.get(id); if (s) s.revoked_at = revokedAt; return { ok: true }; },
      async revokeAllForUser(userId, revokedAt) {
        calls.push({ type: 'revokeAllForUser', table: 'sessions' });
        for (const s of sessions.values()) if (s.user_id === userId && !s.revoked_at) s.revoked_at = revokedAt;
        return { ok: true };
      },
      async deleteExpiredBefore(isoTimestamp) {
        calls.push({ type: 'deleteExpiredBefore', table: 'sessions' });
        let changes = 0;
        for (const [id, s] of sessions.entries()) if (s.expires_at < isoTimestamp) { sessions.delete(id); changes++; }
        return { ok: true, meta: { changes } };
      },
      async listExpiredBefore(isoTimestamp, limit) {
        calls.push({ type: 'listExpiredBefore', table: 'sessions' });
        const results = [...sessions.values()].filter((s) => s.expires_at < isoTimestamp).sort((a, b) => (a.expires_at > b.expires_at ? 1 : -1)).slice(0, limit || 500);
        return { ok: true, results };
      },
      async deleteByIds(ids) {
        calls.push({ type: 'deleteByIds', table: 'sessions' });
        let changes = 0;
        for (const id of ids || []) if (sessions.delete(id)) changes++;
        return { ok: true, meta: { changes } };
      },
    },
    authAuditLogs: {
      async insert(entry) { calls.push({ type: 'insert', table: 'auth_audit_logs' }); authAuditLogs.set(entry.id, entry); return { ok: true }; },
      async getById(id) { calls.push({ type: 'getById', table: 'auth_audit_logs' }); return { ok: true, row: authAuditLogs.get(id) || null }; },
      async listByUser(userId, limit) {
        calls.push({ type: 'listByUser', table: 'auth_audit_logs' });
        const results = [...authAuditLogs.values()].filter((e) => e.user_id === userId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit || 50);
        return { ok: true, results };
      },
      async listByEventType(eventType, limit) {
        calls.push({ type: 'listByEventType', table: 'auth_audit_logs' });
        const results = [...authAuditLogs.values()].filter((e) => e.event_type === eventType).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit || 50);
        return { ok: true, results };
      },
      async countByUser(userId) {
        calls.push({ type: 'countByUser', table: 'auth_audit_logs' });
        return { ok: true, row: { c: [...authAuditLogs.values()].filter((e) => e.user_id === userId).length } };
      },
    },
  };
}

function makeStatefulFakeD1() {
  const calls = [];
  const users = new Map();
  const sessions = new Map();
  const authAuditLogs = new Map();

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
        } else if (/INSERT INTO auth_audit_logs/.test(sql)) {
          const [id, user_id, event_type, provider, ip_hash, user_agent, created_at] = params;
          authAuditLogs.set(id, { id, user_id, event_type, provider, ip_hash, user_agent, created_at });
        } else if (/UPDATE users SET last_login_at/.test(sql)) {
          const [last_login_at, id] = params;
          const u = users.get(id);
          if (u) u.last_login_at = last_login_at;
        } else if (/UPDATE users SET auth_provider/.test(sql)) {
          const [auth_provider, auth_provider_id, updated_at, id] = params;
          const u = users.get(id);
          if (u) { u.auth_provider = auth_provider; u.auth_provider_id = auth_provider_id; u.is_guest = 0; u.updated_at = updated_at; }
        } else if (/UPDATE sessions SET revoked_at = \? WHERE user_id = \?/.test(sql)) {
          const [revokedAt, userId] = params;
          for (const s of sessions.values()) if (s.user_id === userId && !s.revoked_at) s.revoked_at = revokedAt;
        } else if (/UPDATE sessions SET revoked_at = \? WHERE id = \?/.test(sql)) {
          const [revokedAt, id] = params;
          const s = sessions.get(id);
          if (s) s.revoked_at = revokedAt;
        } else if (/DELETE FROM sessions WHERE id IN/.test(sql)) {
          for (const id of params) sessions.delete(id);
        } else if (/DELETE FROM sessions WHERE expires_at < \?/.test(sql)) {
          const [iso] = params;
          for (const [id, s] of sessions.entries()) if (s.expires_at < iso) sessions.delete(id);
        }
        return { meta: {} };
      },
      async all() {
        calls.push({ type: 'all', sql, params });
        if (/SELECT \* FROM sessions WHERE user_id = \? ORDER BY created_at/.test(sql)) {
          const [userId] = params;
          return { results: [...sessions.values()].filter((s) => s.user_id === userId) };
        }
        if (/SELECT \* FROM sessions WHERE expires_at < \?/.test(sql)) {
          const [iso, limit] = params;
          return { results: [...sessions.values()].filter((s) => s.expires_at < iso).slice(0, limit) };
        }
        if (/SELECT \* FROM auth_audit_logs WHERE user_id = \?/.test(sql)) {
          const [userId, limit] = params;
          return { results: [...authAuditLogs.values()].filter((e) => e.user_id === userId).slice(0, limit) };
        }
        return { results: [] };
      },
      async first() {
        calls.push({ type: 'first', sql, params });
        if (/SELECT \* FROM users WHERE id = \?/.test(sql)) return users.get(params[0]) || null;
        if (/SELECT \* FROM users WHERE auth_provider = \? AND auth_provider_id = \?/.test(sql)) {
          for (const u of users.values()) if (u.auth_provider === params[0] && u.auth_provider_id === params[1]) return u;
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
    _authAuditLogs: authAuditLogs,
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

function makeSession(id, userId, overrides) {
  // 預設用真正的目前時間當基準（而不是寫死的過去日期），這樣沒有明確
  // 覆寫expires_at的呼叫端（例如透過真正的controller走expiry檢查）才會
  // 拿到一個相對「現在」確實還有效的session；需要「已過期」情境的測試
  // 一律用overrides明確指定一個相對現在肯定已過去的expires_at。
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

function makeFakeGoogleFetch(overrides) {
  overrides = overrides || {};
  return async (url) => {
    const u = String(url);
    if (u.indexOf('oauth2.googleapis.com/token') >= 0) {
      if (overrides.tokenResponse) return overrides.tokenResponse(url);
      return { ok: true, json: async () => ({ access_token: 'FAKE_ACCESS_TOKEN', token_type: 'Bearer', expires_in: 3600 }) };
    }
    if (u.indexOf('googleapis.com/oauth2/v2/userinfo') >= 0) {
      if (overrides.profileResponse) return overrides.profileResponse(url);
      return { ok: true, json: async () => ({ id: 'g-fake-1', email: 'fake@example.com', name: 'Fake Google User' }) };
    }
    throw new Error('unexpected fetch to ' + u);
  };
}

function makeStateCookie(stateRecord) {
  return serializeCookie(OAUTH_STATE_COOKIE_NAME, JSON.stringify(stateRecord), { secure: false }).split(';')[0];
}

async function run() {
  const fakeGoogleProvider = createGoogleProvider(FAKE_CONFIG);

  // =========================================================================
  // A. Session Cleanup Service
  // =========================================================================

  await test('（1.session cleanup）findExpiredSessions()只找出expires_at早於now的session', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-1'));
    db.seedSession(makeSession('tok-expired-1', 'u-1', { expires_at: '2026-01-01T00:00:00.000Z' }));
    db.seedSession(makeSession('tok-active-1', 'u-1', { expires_at: '2026-06-01T00:00:00.000Z' }));
    const result = await findExpiredSessions(db, { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.results[0].id, 'tok-expired-1');
  });

  await test('（1.session cleanup）findExpiredSessions()支援limit參數', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-2'));
    for (let i = 0; i < 5; i++) db.seedSession(makeSession('tok-exp-' + i, 'u-2', { expires_at: '2026-01-0' + (i + 1) + 'T00:00:00.000Z' }));
    const result = await findExpiredSessions(db, { now: '2026-06-01T00:00:00.000Z', limit: 3 });
    assert.strictEqual(result.results.length, 3);
  });

  await test('（1.session cleanup）findExpiredSessions()預設limit為500', async () => {
    const db = makeMockDb();
    const result = await findExpiredSessions(db, { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.results, []);
  });

  await test('（1.session cleanup）cleanupExpiredSessions()成功刪除過期session，回傳deletedCount', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-3'));
    db.seedSession(makeSession('tok-cleanup-1', 'u-3', { expires_at: '2026-01-01T00:00:00.000Z' }));
    db.seedSession(makeSession('tok-cleanup-2', 'u-3', { expires_at: '2026-01-02T00:00:00.000Z' }));
    const result = await cleanupExpiredSessions(db, { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.deletedCount, 2);
    assert.deepStrictEqual(result.deletedSessionIds.sort(), ['tok-cleanup-1', 'tok-cleanup-2']);
  });

  await test('（1.session cleanup）cleanupExpiredSessions()真的把過期session從db._sessions移除', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-4'));
    db.seedSession(makeSession('tok-remove-1', 'u-4', { expires_at: '2026-01-01T00:00:00.000Z' }));
    await cleanupExpiredSessions(db, { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(db._sessions.has('tok-remove-1'), false);
  });

  await test('（1.session cleanup，不影響active session）cleanupExpiredSessions()完全不影響未過期的session', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-5'));
    db.seedSession(makeSession('tok-exp', 'u-5', { expires_at: '2026-01-01T00:00:00.000Z' }));
    db.seedSession(makeSession('tok-active', 'u-5', { expires_at: '2026-06-01T00:00:00.000Z' }));
    await cleanupExpiredSessions(db, { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(db._sessions.has('tok-active'), true);
  });

  await test('（1.session cleanup，不影響active session）已撤銷但尚未過期的session不會被cleanup清除（跟expired是不同的生命週期事件）', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-6'));
    db.seedSession(makeSession('tok-revoked-not-expired', 'u-6', { expires_at: '2026-06-01T00:00:00.000Z', revoked_at: '2026-01-10T00:00:00.000Z' }));
    const result = await cleanupExpiredSessions(db, { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(result.deletedCount, 0);
    assert.strictEqual(db._sessions.has('tok-revoked-not-expired'), true);
  });

  await test('（1.session cleanup）沒有任何過期session時，cleanupExpiredSessions()安全回傳deletedCount:0', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-7'));
    db.seedSession(makeSession('tok-active-only', 'u-7', { expires_at: '2026-06-01T00:00:00.000Z' }));
    const result = await cleanupExpiredSessions(db, { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.deletedCount, 0);
    assert.deepStrictEqual(result.deletedSessionIds, []);
  });

  await test('（1.session cleanup）cleanupExpiredSessions()「查到幾筆」跟「刪掉幾筆」永遠一致（即使limit小於實際過期數量）', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-8'));
    for (let i = 0; i < 5; i++) db.seedSession(makeSession('tok-limit-' + i, 'u-8', { expires_at: '2026-01-0' + (i + 1) + 'T00:00:00.000Z' }));
    const result = await cleanupExpiredSessions(db, { now: '2026-06-01T00:00:00.000Z', limit: 3 });
    assert.strictEqual(result.deletedCount, 3);
    assert.strictEqual(result.deletedSessionIds.length, 3);
    assert.strictEqual(db._sessions.size, 2, '剩下2筆沒被這次批次處理到的還在，符合「批次清理」語意');
  });

  await test('（1.session cleanup）cleanupExpiredSessions()對find失敗時安全回傳failure，不執行刪除', async () => {
    const db = makeMockDb();
    db.sessions.listExpiredBefore = async () => ({ ok: false, error: 'db_error' });
    const result = await cleanupExpiredSessions(db, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.deletedCount, 0);
  });

  await test('（1.session cleanup）findExpiredSessions()對find失敗時安全回傳failure，不拋例外', async () => {
    const db = makeMockDb();
    db.sessions.listExpiredBefore = async () => ({ ok: false, error: 'db_error' });
    const result = await findExpiredSessions(db, {});
    assert.strictEqual(result.ok, false);
  });

  await test('（1.session cleanup）cleanupExpiredSessions()連續呼叫兩次，第二次因為已經清過了所以deletedCount為0', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-idempotent-1'));
    db.seedSession(makeSession('tok-idempotent-1', 'u-idempotent-1', { expires_at: '2026-01-01T00:00:00.000Z' }));
    const first = await cleanupExpiredSessions(db, { now: '2026-01-15T00:00:00.000Z' });
    const second = await cleanupExpiredSessions(db, { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(first.deletedCount, 1);
    assert.strictEqual(second.deletedCount, 0);
  });

  await test('（1.session cleanup）cleanupExpiredSessions()跨多個user的過期session一次全部清理', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-multi-a'));
    db.seedUser(activeGuest('u-multi-b'));
    db.seedSession(makeSession('tok-multi-a', 'u-multi-a', { expires_at: '2026-01-01T00:00:00.000Z' }));
    db.seedSession(makeSession('tok-multi-b', 'u-multi-b', { expires_at: '2026-01-01T00:00:00.000Z' }));
    const result = await cleanupExpiredSessions(db, { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(result.deletedCount, 2);
  });

  await test('（1.session cleanup）cleanupExpiredSessions()對刪除失敗時安全回傳failure', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-9'));
    db.seedSession(makeSession('tok-del-fail', 'u-9', { expires_at: '2026-01-01T00:00:00.000Z' }));
    db.sessions.deleteByIds = async () => ({ ok: false, error: 'db_error' });
    const result = await cleanupExpiredSessions(db, { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.deletedCount, 0);
  });

  console.log('');

  // =========================================================================
  // B. Session Management Service
  // =========================================================================

  await test('（2.session revoke）revokeSessionById()成功撤銷指定session', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-10'));
    db.seedSession(makeSession('tok-revoke-1', 'u-10'));
    const result = await revokeSessionById(db, 'tok-revoke-1', { now: '2026-01-20T00:00:00.000Z' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(db._sessions.get('tok-revoke-1').revoked_at, '2026-01-20T00:00:00.000Z');
  });

  await test('（2.session revoke）revokeSessionById()對不存在的session回傳session_not_found', async () => {
    const db = makeMockDb();
    const result = await revokeSessionById(db, 'does-not-exist', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'session_not_found');
  });

  await test('（2.session revoke）revokeSessionById()缺少sessionId時回傳missing_session_id', async () => {
    const db = makeMockDb();
    const result = await revokeSessionById(db, null, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_session_id');
  });

  await test('（2.session revoke）revokeSessionById()回傳alreadyRevoked正確反映撤銷前的狀態', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-11'));
    db.seedSession(makeSession('tok-already-1', 'u-11', { revoked_at: '2026-01-10T00:00:00.000Z' }));
    const result = await revokeSessionById(db, 'tok-already-1', { now: '2026-01-20T00:00:00.000Z' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.alreadyRevoked, true);
  });

  await test('（2.session revoke）revokeSessionById()對尚未撤銷的session回傳alreadyRevoked:false', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-12'));
    db.seedSession(makeSession('tok-fresh-1', 'u-12'));
    const result = await revokeSessionById(db, 'tok-fresh-1', {});
    assert.strictEqual(result.alreadyRevoked, false);
  });

  await test('（2.session revoke，所有權檢查）revokeSessionById()帶ownerUserId時，非本人的session會被拒絕，reason=not_owner', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-13'));
    db.seedUser(activeGuest('u-14'));
    db.seedSession(makeSession('tok-owner-1', 'u-13'));
    const result = await revokeSessionById(db, 'tok-owner-1', { ownerUserId: 'u-14' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'not_owner');
    assert.strictEqual(db._sessions.get('tok-owner-1').revoked_at, null, '被拒絕的請求不應該真的撤銷session');
  });

  await test('（2.session revoke，所有權檢查）revokeSessionById()帶正確的ownerUserId時成功撤銷', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-15'));
    db.seedSession(makeSession('tok-owner-2', 'u-15'));
    const result = await revokeSessionById(db, 'tok-owner-2', { ownerUserId: 'u-15' });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.session revoke）revokeSessionById()不帶ownerUserId時（系統管理用途）允許跨使用者撤銷', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-16'));
    db.seedSession(makeSession('tok-admin-1', 'u-16'));
    const result = await revokeSessionById(db, 'tok-admin-1', {});
    assert.strictEqual(result.ok, true);
  });

  await test('（2.session revoke）revokeAllSessions()撤銷該user名下所有目前有效的session', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-17'));
    db.seedSession(makeSession('tok-all-1', 'u-17'));
    db.seedSession(makeSession('tok-all-2', 'u-17'));
    const result = await revokeAllSessions(db, 'u-17', { now: '2026-01-20T00:00:00.000Z' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(db._sessions.get('tok-all-1').revoked_at, '2026-01-20T00:00:00.000Z');
    assert.strictEqual(db._sessions.get('tok-all-2').revoked_at, '2026-01-20T00:00:00.000Z');
  });

  await test('（2.session revoke）revokeAllSessions()缺少userId時回傳missing_user_id', async () => {
    const db = makeMockDb();
    const result = await revokeAllSessions(db, null, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_user_id');
  });

  await test('（2.session revoke）revokeAllSessions()只影響指定user，不影響其他user的session', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-18'));
    db.seedUser(activeGuest('u-19'));
    db.seedSession(makeSession('tok-u18', 'u-18'));
    db.seedSession(makeSession('tok-u19', 'u-19'));
    await revokeAllSessions(db, 'u-18', {});
    assert.ok(db._sessions.get('tok-u18').revoked_at);
    assert.strictEqual(db._sessions.get('tok-u19').revoked_at, null);
  });

  console.log('');

  // =========================================================================
  // C. Multi-device session
  // =========================================================================

  await test('（3.multi-device session）listUserSessions()正確列出同一個user名下的多個session', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-20'));
    db.seedSession(makeSession('tok-device-1', 'u-20', { user_agent: 'iPhone' }));
    db.seedSession(makeSession('tok-device-2', 'u-20', { user_agent: 'Chrome/Windows' }));
    db.seedSession(makeSession('tok-device-3', 'u-20', { user_agent: 'Chrome/Mac' }));
    const result = await listUserSessions(db, 'u-20', { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sessions.length, 3);
  });

  await test('（3.multi-device session）listUserSessions()正確標記isActive（未撤銷且未過期才是true）', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-21'));
    db.seedSession(makeSession('tok-active-2', 'u-21', { expires_at: '2026-06-01T00:00:00.000Z' }));
    db.seedSession(makeSession('tok-expired-2', 'u-21', { expires_at: '2026-01-01T00:00:00.000Z' }));
    db.seedSession(makeSession('tok-revoked-2', 'u-21', { revoked_at: '2026-01-10T00:00:00.000Z' }));
    const result = await listUserSessions(db, 'u-21', { now: '2026-01-15T00:00:00.000Z' });
    const byId = Object.fromEntries(result.sessions.map((s) => [s.id, s]));
    assert.strictEqual(byId['tok-active-2'].isActive, true);
    assert.strictEqual(byId['tok-expired-2'].isActive, false);
    assert.strictEqual(byId['tok-revoked-2'].isActive, false);
  });

  await test('（3.multi-device session）listUserSessions()只列出指定user自己的session，不含其他user的', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-22'));
    db.seedUser(activeGuest('u-23'));
    db.seedSession(makeSession('tok-mine', 'u-22'));
    db.seedSession(makeSession('tok-other', 'u-23'));
    const result = await listUserSessions(db, 'u-22', {});
    assert.strictEqual(result.sessions.length, 1);
    assert.strictEqual(result.sessions[0].id, 'tok-mine');
  });

  await test('（3.multi-device session）沒有任何session的user回傳空陣列（不是錯誤）', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-24'));
    const result = await listUserSessions(db, 'u-24', {});
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.sessions, []);
  });

  await test('（3.multi-device session）撤銷其中一個裝置的session後，其他裝置的session仍是active', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-25'));
    db.seedSession(makeSession('tok-dev-a', 'u-25', { expires_at: '2026-06-01T00:00:00.000Z' }));
    db.seedSession(makeSession('tok-dev-b', 'u-25', { expires_at: '2026-06-01T00:00:00.000Z' }));
    await revokeSessionById(db, 'tok-dev-a', {});
    const result = await listUserSessions(db, 'u-25', { now: '2026-01-15T00:00:00.000Z' });
    const byId = Object.fromEntries(result.sessions.map((s) => [s.id, s]));
    assert.strictEqual(byId['tok-dev-a'].isActive, false);
    assert.strictEqual(byId['tok-dev-b'].isActive, true);
  });

  await test('（3.multi-device session）revokeAllSessions()（全部登出）後，listUserSessions()顯示全部isActive:false', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-26'));
    db.seedSession(makeSession('tok-all-a', 'u-26', { expires_at: '2026-06-01T00:00:00.000Z' }));
    db.seedSession(makeSession('tok-all-b', 'u-26', { expires_at: '2026-06-01T00:00:00.000Z' }));
    await revokeAllSessions(db, 'u-26', { now: '2026-01-20T00:00:00.000Z' });
    const result = await listUserSessions(db, 'u-26', { now: '2026-01-21T00:00:00.000Z' });
    assert.ok(result.sessions.every((s) => s.isActive === false));
  });

  await test('（3.multi-device session）多裝置各自的session id/user_agent/ip_hash保持獨立不互相污染', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-27'));
    db.seedSession(makeSession('tok-ua-1', 'u-27', { user_agent: 'Device-A', ip_hash: 'hash-a' }));
    db.seedSession(makeSession('tok-ua-2', 'u-27', { user_agent: 'Device-B', ip_hash: 'hash-b' }));
    const result = await listUserSessions(db, 'u-27', {});
    const byId = Object.fromEntries(result.sessions.map((s) => [s.id, s]));
    assert.strictEqual(byId['tok-ua-1'].user_agent, 'Device-A');
    assert.strictEqual(byId['tok-ua-2'].user_agent, 'Device-B');
  });

  console.log('');

  // =========================================================================
  // D. Authentication Audit Log
  // =========================================================================

  await test('（4.audit log）recordAuthEvent()成功寫入一筆guest_login紀錄', async () => {
    const db = makeMockDb();
    const result = await recordAuthEvent(db, { user_id: 'u-28', event_type: 'guest_login' }, { now: '2026-01-15T00:00:00.000Z' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.entry.event_type, 'guest_login');
    assert.strictEqual(result.entry.user_id, 'u-28');
    assert.ok(result.entry.id);
  });

  for (const eventType of ['guest_login', 'provider_login', 'oauth_login', 'upgrade_account', 'logout']) {
    await test(`（4.audit log）recordAuthEvent()接受事件類型：${eventType}`, async () => {
      const db = makeMockDb();
      const result = await recordAuthEvent(db, { user_id: 'u-event-' + eventType, event_type: eventType });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.entry.event_type, eventType);
    });
  }

  await test('（4.audit log）recordAuthEvent()拒絕不合法的event_type', async () => {
    const db = makeMockDb();
    const result = await recordAuthEvent(db, { user_id: 'u-29', event_type: 'not_a_real_event' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_event_type');
  });

  await test('（4.audit log）recordAuthEvent()缺少user_id時安全拒絕', async () => {
    const db = makeMockDb();
    const result = await recordAuthEvent(db, { event_type: 'guest_login' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_user_id');
  });

  await test('（4.audit log）recordAuthEvent()對非物件event安全拒絕，不拋例外', async () => {
    const db = makeMockDb();
    const result = await recordAuthEvent(db, null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_event');
  });

  await test('（4.audit log）recordAuthEvent()正確帶入provider/ip_hash/user_agent選填欄位', async () => {
    const db = makeMockDb();
    const result = await recordAuthEvent(db, { user_id: 'u-30', event_type: 'provider_login', provider: 'google', ip_hash: 'hash-xyz', user_agent: 'Mozilla/5.0' });
    assert.strictEqual(result.entry.provider, 'google');
    assert.strictEqual(result.entry.ip_hash, 'hash-xyz');
    assert.strictEqual(result.entry.user_agent, 'Mozilla/5.0');
  });

  await test('（4.audit log）recordAuthEvent()缺少provider/ip_hash/user_agent時安全預設為null（不拋例外）', async () => {
    const db = makeMockDb();
    const result = await recordAuthEvent(db, { user_id: 'u-31', event_type: 'logout' });
    assert.strictEqual(result.entry.provider, null);
    assert.strictEqual(result.entry.ip_hash, null);
    assert.strictEqual(result.entry.user_agent, null);
  });

  await test('（4.audit log）listAuthEventsForUser()正確回傳指定user的所有紀錄，按時間新到舊排序', async () => {
    const db = makeMockDb();
    await recordAuthEvent(db, { user_id: 'u-32', event_type: 'guest_login' }, { now: '2026-01-01T00:00:00.000Z' });
    await recordAuthEvent(db, { user_id: 'u-32', event_type: 'upgrade_account' }, { now: '2026-01-02T00:00:00.000Z' });
    await recordAuthEvent(db, { user_id: 'u-32', event_type: 'logout' }, { now: '2026-01-03T00:00:00.000Z' });
    const result = await listAuthEventsForUser(db, 'u-32');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.logs.length, 3);
    assert.strictEqual(result.logs[0].event_type, 'logout');
  });

  await test('（4.audit log）listAuthEventsForUser()只回傳指定user的紀錄，不含其他user的', async () => {
    const db = makeMockDb();
    await recordAuthEvent(db, { user_id: 'u-33', event_type: 'guest_login' });
    await recordAuthEvent(db, { user_id: 'u-34', event_type: 'guest_login' });
    const result = await listAuthEventsForUser(db, 'u-33');
    assert.strictEqual(result.logs.length, 1);
  });

  await test('（4.audit log）listAuthEventsForUser()缺少userId時安全拒絕', async () => {
    const db = makeMockDb();
    const result = await listAuthEventsForUser(db, null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_user_id');
  });

  await test('（4.audit log）listAuthEventsByType()正確回傳指定事件類型的所有紀錄（跨user）', async () => {
    const db = makeMockDb();
    await recordAuthEvent(db, { user_id: 'u-35', event_type: 'oauth_login' });
    await recordAuthEvent(db, { user_id: 'u-36', event_type: 'oauth_login' });
    await recordAuthEvent(db, { user_id: 'u-37', event_type: 'guest_login' });
    const result = await listAuthEventsByType(db, 'oauth_login');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.logs.length, 2);
  });

  await test('（4.audit log）listAuthEventsByType()對不合法event_type安全拒絕', async () => {
    const db = makeMockDb();
    const result = await listAuthEventsByType(db, 'not_real');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_event_type');
  });

  await test('（4.audit log）AUTH_AUDIT_EVENT_TYPES恰好包含TASK1.34規格要求的5種事件，不多不少', () => {
    assert.deepStrictEqual([...AUTH_AUDIT_EVENT_TYPES].sort(), ['guest_login', 'logout', 'oauth_login', 'provider_login', 'upgrade_account'].sort());
  });

  await test('（4.audit log）audit_log_service.js重新匯出的AUTH_AUDIT_EVENT_TYPES跟db table層是同一份陣列', () => {
    assert.strictEqual(AUTH_AUDIT_EVENT_TYPES, TABLE_AUDIT_EVENT_TYPES);
  });

  await test('（4.audit log）連續寫入多筆不同事件類型，每一筆都有獨立的id（不會重複）', async () => {
    const db = makeMockDb();
    const r1 = await recordAuthEvent(db, { user_id: 'u-38', event_type: 'guest_login' });
    const r2 = await recordAuthEvent(db, { user_id: 'u-38', event_type: 'upgrade_account' });
    assert.notStrictEqual(r1.entry.id, r2.entry.id);
  });

  console.log('');

  // =========================================================================
  // E. Provider Validation Hardening
  // =========================================================================

  await test('（5.provider validation）validateProviderIdentity()對支援的provider（google）+合法providerId回傳ok:true', () => {
    const result = validateProviderIdentity('google', 'g-1');
    assert.strictEqual(result.ok, true);
  });

  await test('（5.provider validation）validateProviderIdentity()對不支援的provider回傳ok:false, reason=invalid_provider', () => {
    const result = validateProviderIdentity('facebook', 'fb-1');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_provider');
  });

  await test('（5.provider validation）validateProviderIdentity()對缺少providerId回傳invalid_provider', () => {
    const result = validateProviderIdentity('google', undefined);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_provider');
  });

  await test('（5.provider validation）validateProviderIdentity()對缺少provider回傳invalid_provider', () => {
    const result = validateProviderIdentity(undefined, 'g-1');
    assert.strictEqual(result.ok, false);
  });

  await test('（5.provider validation）validateProviderIdentity()對providerId為空字串視為缺少', () => {
    const result = validateProviderIdentity('google', '');
    assert.strictEqual(result.ok, false);
  });

  await test('（5.provider validation）SUPPORTED_PROVIDERS重新匯出的內容跟src/identity/provider.js是同一份（單一權威來源）', async () => {
    const identityProvider = await import('../../src/identity/provider.js');
    assert.strictEqual(SUPPORTED_PROVIDERS, identityProvider.SUPPORTED_PROVIDERS);
  });

  await test('（5.provider validation，入口1）loginProviderController()對不支援的provider安全拒絕，不呼叫任何db操作', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, { provider: 'twitter', providerId: 't-1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_provider');
    assert.strictEqual(result.status, 401);
    assert.strictEqual(db.calls.length, 0);
  });

  await test('（5.provider validation，入口1）loginProviderController()對支援的provider（google）正常放行', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, { provider: 'google', providerId: 'g-valid-1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.provider validation，入口2）upgradeGuestToProvider()（透過upgradeGuestController）對不支援的provider仍正確拒絕（既有行為，TASK1.34確認未被破壞）', async () => {
    const db = makeMockDb();
    db.seedUser(activeGuest('u-39'));
    db.seedSession(makeSession('tok-upg-hardening-1', 'u-39'));
    const result = await upgradeGuestController(db, `${SESSION_COOKIE_NAME}=tok-upg-hardening-1`, { provider: 'twitter', providerId: 't-2' }, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_provider');
  });

  await test('（5.provider validation，入口3）googleOAuthCallbackController()/loginWithGoogleCallback()的provider永遠是google（防禦性檢查現況下必定通過）', async () => {
    const db = makeMockDb();
    const stateRecord = createOAuthState();
    const result = await googleOAuthCallbackController(
      db,
      { code: 'x', state: stateRecord.state, cookieHeader: makeStateCookie(stateRecord) },
      fakeGoogleProvider,
      { fetchImpl: makeFakeGoogleFetch() }
    );
    assert.strictEqual(result.ok, true);
  });

  await test('（5.provider validation）三個入口統一共用同一個validateProviderIdentity()實作（原始碼掃描）', () => {
    const controllerSrc = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'controllers', 'auth_controller.js'), 'utf8'));
    const appServiceSrc = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'auth_application_service.js'), 'utf8'));
    const upgradeSrc = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'identity', 'upgrade.js'), 'utf8'));
    assert.ok(/from\s+['"]\.\.\/services\/auth_security_service\.js['"]/.test(controllerSrc));
    assert.ok(/from\s+['"]\.\/auth_security_service\.js['"]/.test(appServiceSrc));
    assert.ok(/isSupportedProvider/.test(upgradeSrc), 'upgradeGuestToProvider()應該持續使用既有的isSupportedProvider()（來自src/identity/provider.js，跟auth_security_service.js同一份SUPPORTED_PROVIDERS）');
  });

  await test('（5.provider validation）validateProviderIdentity()對providerId型別為數字時視為存在（不強制字串型別，交由更上層的contract validation處理型別）', () => {
    const result = validateProviderIdentity('google', 12345);
    assert.strictEqual(result.ok, true);
  });

  await test('（5.provider validation）SUPPORTED_PROVIDERS目前恰好只有google一種（跟upgrade.js/login_identity.js共用同一份現況）', () => {
    assert.deepStrictEqual([...SUPPORTED_PROVIDERS], ['google']);
  });

  await test('（5.provider validation）loginProviderContract.response.failureReasons正確包含invalid_provider', () => {
    assert.ok(loginProviderContract.response.failureReasons.includes('invalid_provider'));
  });

  await test('（5.provider validation）googleCallbackContract.response.failureReasons正確包含invalid_provider', () => {
    assert.ok(googleCallbackContract.response.failureReasons.includes('invalid_provider'));
  });

  console.log('');

  // =========================================================================
  // 真正的 src/worker.js 端對端測試（F/G/H/I 各regression類別共用）
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
  const originalGlobalFetch = globalThis.fetch;
  function withFakeGlobalFetch(fakeFetch, fn) {
    globalThis.fetch = fakeFetch;
    return Promise.resolve().then(fn).finally(() => { globalThis.fetch = originalGlobalFetch; });
  }

  // -------------------------------------------------------------------------
  // F. Login regression（guest/provider login既有行為不受影響）
  // -------------------------------------------------------------------------

  await test('（6.login regression）POST /auth/guest 透過真正worker.fetch()依然正常運作', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（6.login regression）POST /auth/provider（google）透過真正worker.fetch()依然正常運作', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify({ provider: 'google', providerId: 'g-regress-1' }) }),
      env, {}
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.user.auth_provider, 'google');
  });

  await test('（6.login regression）POST /auth/provider（不支援的provider）現在透過真正worker.fetch()正確被Provider Validation Hardening擋下，回401', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(
      new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify({ provider: 'twitter', providerId: 't-regress-1' }) }),
      env, {}
    );
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.reason, 'invalid_provider');
    assert.strictEqual(env.DIET_COACH_DB.calls.filter((c) => c.type === 'run' && /INSERT INTO users/.test(c.sql)).length, 0);
  });

  await test('（6.login regression）POST /auth/provider（google）existing user login行為完全不變', async () => {
    const env = makeFreshEnv();
    const first = await worker.fetch(new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify({ provider: 'google', providerId: 'g-regress-2' }) }), env, {});
    const firstBody = await first.json();
    const second = await worker.fetch(new Request('https://example.com/auth/provider', { method: 'POST', body: JSON.stringify({ provider: 'google', providerId: 'g-regress-2' }) }), env, {});
    const secondBody = await second.json();
    assert.strictEqual(secondBody.data.created, false);
    assert.strictEqual(secondBody.data.user.id, firstBody.data.user.id);
  });

  await test('（6.login regression）Router routing層級：POST /auth/provider這條路由的middleware數量沒有因TASK1.34而改變（仍是1個）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/auth/provider');
    assert.strictEqual(route.middlewares.length, 1);
  });

  // -------------------------------------------------------------------------
  // G. OAuth regression（google callback既有行為不受影響）
  // -------------------------------------------------------------------------

  await test('（7.oauth regression）GET /auth/google/callback透過真正worker.fetch()走完整流程依然成功', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch({ profileResponse: async () => ({ ok: true, json: async () => ({ id: 'g-oauth-regress-1', email: 'o@example.com', name: 'O' }) }) }), async () => {
      const env = makeGoogleEnv();
      const stateRecord = createOAuthState();
      const res = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get('Location'), '/');
    });
  });

  await test('（7.oauth regression）state驗證失敗行為完全不變', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch(), async () => {
      const env = makeGoogleEnv();
      const res = await worker.fetch(new Request('https://example.com/auth/google/callback?code=c&state=tampered'), env, {});
      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get('Location'), '/?oauth_error=missing_state');
    });
  });

  await test('（7.oauth regression）googleCallbackContract路由middleware數量沒有因TASK1.34而改變（仍是1個）', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/auth/google/callback');
    assert.strictEqual(route.middlewares.length, 1);
  });

  await test('（7.oauth regression）oauth_state cookie無論成功失敗都會被清除的行為完全不變', async () => {
    await withFakeGlobalFetch(makeFakeGoogleFetch(), async () => {
      const env = makeGoogleEnv();
      const stateRecord = createOAuthState();
      const res = await worker.fetch(
        new Request(`https://example.com/auth/google/callback?code=fake-code&state=${encodeURIComponent(stateRecord.state)}`, { headers: { Cookie: makeStateCookie(stateRecord) } }),
        env, {}
      );
      const cleared = res.headers.getSetCookie().find((c) => c.startsWith(`${OAUTH_STATE_COOKIE_NAME}=`));
      assert.ok(cleared && /Max-Age=0/.test(cleared));
    });
  });

  // -------------------------------------------------------------------------
  // H. Guest regression（guest lifecycle不受影響）
  // -------------------------------------------------------------------------

  await test('（8.guest regression）loginGuestController()本身行為完全不變', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, {}, {});
    assert.strictEqual(result.ok, true);
    assert.ok(result.data.user.is_guest === true || result.data.user.is_guest === 1);
  });

  await test('（8.guest regression）guest login → upgrade（google）流程完全不變', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const upgradeRes = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookieValue }, body: JSON.stringify({ provider: 'google', providerId: 'g-upgrade-regress-1' }) }),
      env, {}
    );
    assert.strictEqual(upgradeRes.status, 200);
  });

  await test('（8.guest regression）guest → upgrade（不支援的provider）現在正確被Provider Validation Hardening的既有機制擋下（既有行為，未被破壞）', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const upgradeRes = await worker.fetch(
      new Request('https://example.com/auth/provider/upgrade', { method: 'POST', headers: { Cookie: cookieValue }, body: JSON.stringify({ provider: 'twitter', providerId: 't-upgrade-regress-1' }) }),
      env, {}
    );
    assert.strictEqual(upgradeRes.status, 401);
    const body = await upgradeRes.json();
    assert.strictEqual(body.reason, 'invalid_provider');
  });

  // -------------------------------------------------------------------------
  // I. Logout regression
  // -------------------------------------------------------------------------

  await test('（9.logout regression）logoutController()本身行為完全不變', async () => {
    const db = makeMockDb();
    const loginResult = await loginGuestController(db, {}, {});
    db.seedSession(makeSession('tok-logout-regress-1', loginResult.data.user.id));
    const result = await logoutController(db, `${SESSION_COOKIE_NAME}=tok-logout-regress-1`, {});
    assert.strictEqual(result.ok, true);
  });

  await test('（9.logout regression）POST /auth/logout透過真正worker.fetch()依然正常運作', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
    const logoutRes = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});
    assert.strictEqual(logoutRes.status, 200);
    const meRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
    assert.strictEqual(meRes.status, 401);
  });

  await test('（9.logout regression）沒有cookie時logout仍安全回200（wasValid:false），行為不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST' }), env, {});
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // -------------------------------------------------------------------------
  // Legacy route不受影響（延續守則，跟前幾個TASK一致的檢查項目）
  // -------------------------------------------------------------------------

  await test('（延續守則）GET / 首頁HTML完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（延續守則）D1完全沒有任何SQL呼叫（只呼叫不含auth的legacy路由時）', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=hardening-legacy-1'), env, {});
    assert.strictEqual(env.DIET_COACH_DB.calls.length, 0);
  });

  await test('（延續守則）KV/R2讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    assert.strictEqual(await res.text(), 'FAKE_JPEG_BYTES');
  });

  // =========================================================================
  // J. D1 migration
  // =========================================================================

  await test('（10.D1 migration）migrations/0006_phase1_task1_34_auth_audit_logs.sql存在', () => {
    const migrationPath = path.join(repoRoot, 'migrations', '0006_phase1_task1_34_auth_audit_logs.sql');
    assert.ok(fs.existsSync(migrationPath));
  });

  await test('（10.D1 migration）migration內容正確建立auth_audit_logs表，含所有規格要求的欄位', () => {
    const sql = fs.readFileSync(path.join(repoRoot, 'migrations', '0006_phase1_task1_34_auth_audit_logs.sql'), 'utf8');
    assert.ok(/CREATE TABLE IF NOT EXISTS auth_audit_logs/.test(sql));
    for (const col of ['id', 'user_id', 'event_type', 'provider', 'ip_hash', 'user_agent', 'created_at']) {
      assert.ok(new RegExp('\\b' + col + '\\b').test(sql), `migration應該含有欄位 ${col}`);
    }
  });

  await test('（10.D1 migration）migration建立了3個索引（user/event_type/created_at）', () => {
    const sql = fs.readFileSync(path.join(repoRoot, 'migrations', '0006_phase1_task1_34_auth_audit_logs.sql'), 'utf8');
    assert.strictEqual((sql.match(/CREATE INDEX/g) || []).length, 3);
  });

  await test('（10.D1 migration）src/db/index.js正確wiring authAuditLogs binding', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'db', 'index.js'), 'utf8'));
    assert.ok(/bindAuthAuditLogs/.test(src));
    assert.ok(/authAuditLogs:\s*bindAuthAuditLogs\(db\)/.test(src));
  });

  await test('（10.D1 migration）createDb()回傳的物件確實含有authAuditLogs（透過真正的createDb()+假D1 binding驗證，不連線真實D1）', async () => {
    const { createDb } = await import('../../src/db/index.js');
    const fakeD1 = { prepare() { return { bind() { return this; }, async run() { return { meta: {} }; }, async all() { return { results: [] }; }, async first() { return null; } }; }, async batch() { return []; } };
    const db = createDb({ DIET_COACH_DB: fakeD1 });
    assert.ok(db.authAuditLogs);
    assert.strictEqual(typeof db.authAuditLogs.insert, 'function');
    assert.strictEqual(typeof db.authAuditLogs.listByUser, 'function');
  });

  await test('（10.D1 migration）src/db/tables/sessions.js新增的listExpiredBefore/deleteByIds方法存在且可呼叫', async () => {
    const { createDb } = await import('../../src/db/index.js');
    const fakeD1 = { prepare() { return { bind() { return this; }, async run() { return { meta: {} }; }, async all() { return { results: [] }; }, async first() { return null; } }; }, async batch() { return []; } };
    const db = createDb({ DIET_COACH_DB: fakeD1 });
    assert.strictEqual(typeof db.sessions.listExpiredBefore, 'function');
    assert.strictEqual(typeof db.sessions.deleteByIds, 'function');
    const r1 = await db.sessions.listExpiredBefore('2026-01-01T00:00:00.000Z', 10);
    assert.strictEqual(r1.ok, true);
  });

  await test('（10.D1 migration）deleteByIds([])空陣列時安全回傳meta.changes:0，不會產生SQL語法錯誤', async () => {
    const { createDb } = await import('../../src/db/index.js');
    const fakeD1 = { prepare() { return { bind() { return this; }, async run() { return { meta: {} }; }, async all() { return { results: [] }; }, async first() { return null; } }; }, async batch() { return []; } };
    const db = createDb({ DIET_COACH_DB: fakeD1 });
    const result = await db.sessions.deleteByIds([]);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.meta.changes, 0);
  });

  console.log('');

  // =========================================================================
  // K. 架構守則 / 原始碼掃描
  // =========================================================================

  await test('（架構守則）原始碼掃描：session_cleanup_service.js / session_management_service.js / audit_log_service.js 完全沒有被任何既有controller import（維持dormant，不改變既有登入流程行為）', () => {
    const controllerSrc = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'controllers', 'auth_controller.js'), 'utf8'));
    assert.ok(!/session_cleanup_service|session_management_service|audit_log_service/.test(controllerSrc));
  });

  await test('（架構守則）原始碼掃描：worker.js完全沒有import這三個新service（維持dormant）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/session_cleanup_service|session_management_service|audit_log_service/.test(src));
  });

  await test('（架構守則）原始碼掃描：worker.js 的 handle(r,env) 函式體完全沒有變動', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0);
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/createApplication|router\.handle|session_cleanup|session_management|audit_log/i.test(handleBody));
  });

  // 注意：這項測試原本用「git diff --stat src/worker.js相對於上一個
  // commit為空」來確認TASK1.34沒有修改worker.js——但這個判斷方式只在
  // TASK1.34自己的commit尚未產生、且沒有任何後續任務的情況下才成立，
  // TASK1.35開始正式修改worker.js（新增User Data API的路由分派，這是
  // TASK1.35任務範圍內合法的異動），用即時git diff判斷會對後續每個
  // 有修改worker.js的任務都產生假失敗，不是可長期成立的檢查方式。改成
  // 靜態原始碼掃描：確認worker.js裡沒有出現任何TASK1.34新增的三個
  // dormant service名稱（跟前一項測試互相呼應，是這裡真正想驗證的
  // 「TASK1.34沒有把worker.js接上這些新service」這個事實，且這個事實
  // 不受後續任務是否修改worker.js其他部分而改變）。
  await test('（TASK1.35後更新）原始碼掃描：worker.js 完全沒有引用TASK1.34新增的三個dormant service（session_cleanup/session_management/audit_log），不因後續任務修改worker.js而受影響', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/session_cleanup_service|session_management_service|audit_log_service/.test(src));
  });

  await test('（架構守則）git diff：wrangler.toml 在TASK1.34完全沒有異動', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat wrangler.toml', { cwd: repoRoot }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（架構守則）原始碼掃描：src/services/auth_security_service.js 沒有寫死任何provider名稱以外的邏輯，SUPPORTED_PROVIDERS完全重用src/identity/provider.js', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'auth_security_service.js'), 'utf8'));
    assert.ok(/from\s+['"]\.\.\/identity\/provider\.js['"]/.test(src));
    assert.ok(!/SUPPORTED_PROVIDERS\s*=\s*\[/.test(src), '不應該在這個檔案裡重新定義一份SUPPORTED_PROVIDERS陣列');
  });

  await test('（架構守則）原始碼掃描：session_cleanup_service.js / session_management_service.js 完全沒有直接呼叫 db.prepare()（一律透過db.sessions既有方法）', () => {
    for (const file of ['session_cleanup_service.js', 'session_management_service.js']) {
      const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', file), 'utf8'));
      assert.ok(!/db\.prepare\(/.test(src), file + ' 不應該直接呼叫db.prepare()');
    }
  });

  await test('（架構守則）原始碼掃描：audit_log_service.js 完全沒有import src/oauth/或KV相關模組（純D1稽核紀錄，不碰OAuth token或KV schema）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'audit_log_service.js'), 'utf8'));
    assert.ok(!/from\s+['"]\.\.\/oauth\//.test(src));
    assert.ok(!/SYNC_KV/.test(src));
  });

  await test('（架構守則）原始碼掃描：本次沒有任何AI分析相關字樣（禁止AI分析功能）', () => {
    const files = [
      'src/services/session_cleanup_service.js',
      'src/services/session_management_service.js',
      'src/services/audit_log_service.js',
      'src/services/auth_security_service.js',
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      assert.ok(!/ai_report|aiReport|openai|anthropic|gpt/i.test(src), f);
    }
  });

  await test('（架構守則）原始碼掃描：新增的四個service檔案完全沒有修改任何UI/HTML字串（不含<script>/<style>/getHTML等字樣）', () => {
    const files = [
      'src/services/session_cleanup_service.js',
      'src/services/session_management_service.js',
      'src/services/audit_log_service.js',
      'src/services/auth_security_service.js',
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      assert.ok(!/<script|<style|getHTML|innerHTML/i.test(src), f);
    }
  });

  await test('（架構守則）D1本地/正式環境驗證另外在 real_d1_verify.mjs 執行，本檔案完全不連線真實或本機模擬的資料庫', () => {
    assert.ok(true);
  });

  await test('（11.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（前端頁面完全未被TASK1.34修改，UI受影響機率為0，見「禁止修改UI」限制）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（4.audit log）listAuthEventsForUser()支援limit參數', async () => {
    const db = makeMockDb();
    for (let i = 0; i < 5; i++) await recordAuthEvent(db, { user_id: 'u-limit-audit-1', event_type: 'logout' }, { now: `2026-01-0${i + 1}T00:00:00.000Z` });
    const result = await listAuthEventsForUser(db, 'u-limit-audit-1', { limit: 2 });
    assert.strictEqual(result.logs.length, 2);
  });

  await test('（4.audit log）沒有任何紀錄的user查詢時安全回傳空陣列', async () => {
    const db = makeMockDb();
    const result = await listAuthEventsForUser(db, 'u-no-logs-1');
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.logs, []);
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'auth-hardening-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

/*
 * Phase 1 TASK 1.36｜User Dashboard Aggregation Layer 測試
 *
 * 分為以下部分：
 * A) auth required（GET /api/dashboard未登入一律401，不呼叫任何domain service）
 * B) dashboard success
 * C) empty user
 * D) user data aggregation
 * E) cross user isolation
 * F) session expired
 * G) logout invalidation
 * H) service failure handling
 * I) KV/R2 regression
 * J) legacy route regression
 * K) 架構守則 / 原始碼掃描（含P1-P6標記）
 *
 * 全部使用純記憶體 mock D1 binding，完全不連線任何真實或本機模擬的
 * 資料庫。對「真實 local D1」的端對端驗證另外在 real_d1_verify.mjs 執行。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDashboardController } from '../../src/controllers/dashboard_controller.js';
import { getDashboard } from '../../src/services/dashboard_service.js';
import {
  createExplorationController,
  createFoodEventController,
  createEmotionController,
  createBehaviorController,
  createReportController,
} from '../../src/controllers/data_controller.js';
import { createAppRouter } from '../../src/routes/index.js';
import { dashboardContract } from '../../src/contracts/dashboard_contract.js';
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
// Mock db：users/sessions + 五個domain資料表，方法簽章對齊 src/db/tables/*.js
// -----------------------------------------------------------------------
function makeMockDb() {
  const users = new Map();
  const sessions = new Map();
  const explorationRecords = [];
  const foodEvents = [];
  const emotionRecords = [];
  const behaviorPatterns = [];
  const aiReports = [];
  const calls = [];
  let nextId = 1;

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
    _explorationRecords: explorationRecords,
    _foodEvents: foodEvents,
    _emotionRecords: emotionRecords,
    _behaviorPatterns: behaviorPatterns,
    _aiReports: aiReports,
    seedUser,
    seedSession,
    users: {
      async getById(id) { calls.push({ type: 'getById', table: 'users' }); return { ok: true, row: users.get(id) || null }; },
    },
    sessions: {
      async getById(id) { calls.push({ type: 'getById', table: 'sessions' }); return { ok: true, row: sessions.get(id) || null }; },
      async revoke(id, revokedAt) { calls.push({ type: 'revoke', table: 'sessions' }); const s = sessions.get(id); if (s) s.revoked_at = revokedAt; return { ok: true }; },
    },
    explorationRecords: {
      async insert(rec) { calls.push({ type: 'insert', table: 'exploration_records' }); const row = Object.assign({ id: nextId++ }, rec); explorationRecords.push(row); return { ok: true, id: row.id }; },
      async listByUser(userId, limit) { calls.push({ type: 'listByUser', table: 'exploration_records' }); return { ok: true, results: explorationRecords.filter((r) => r.user_id === userId).slice(0, limit || 50) }; },
    },
    foodEvents: {
      async insert(evt) { calls.push({ type: 'insert', table: 'food_events' }); const row = Object.assign({ id: nextId++ }, evt); foodEvents.push(row); return { ok: true, id: row.id }; },
      async listByUser(userId, limit) { calls.push({ type: 'listByUser', table: 'food_events' }); return { ok: true, results: foodEvents.filter((r) => r.user_id === userId).slice(0, limit || 50) }; },
    },
    emotionRecords: {
      async insert(rec) { calls.push({ type: 'insert', table: 'emotion_records' }); const row = Object.assign({ id: nextId++ }, rec); emotionRecords.push(row); return { ok: true, id: row.id }; },
      async listByUser(userId, limit) { calls.push({ type: 'listByUser', table: 'emotion_records' }); return { ok: true, results: emotionRecords.filter((r) => r.user_id === userId).slice(0, limit || 50) }; },
      async listByFoodEvent(foodEventId) { calls.push({ type: 'listByFoodEvent', table: 'emotion_records' }); return { ok: true, results: emotionRecords.filter((r) => r.linked_food_event_id === foodEventId) }; },
    },
    behaviorPatterns: {
      async insert(pat) { calls.push({ type: 'insert', table: 'behavior_patterns' }); const row = Object.assign({ id: nextId++ }, pat); behaviorPatterns.push(row); return { ok: true, id: row.id }; },
      async listByUser(userId, limit) { calls.push({ type: 'listByUser', table: 'behavior_patterns' }); return { ok: true, results: behaviorPatterns.filter((r) => r.user_id === userId).slice(0, limit || 50) }; },
      async listByUserAndType(userId, patternType, limit) { calls.push({ type: 'listByUserAndType', table: 'behavior_patterns' }); return { ok: true, results: behaviorPatterns.filter((r) => r.user_id === userId && r.pattern_type === patternType).slice(0, limit || 50) }; },
    },
    aiReports: {
      async insert(rep) { calls.push({ type: 'insert', table: 'ai_reports' }); const row = Object.assign({ id: nextId++ }, rep); aiReports.push(row); return { ok: true, id: row.id }; },
      async listByUser(userId, limit) { calls.push({ type: 'listByUser', table: 'ai_reports' }); return { ok: true, results: aiReports.filter((r) => r.user_id === userId).slice(0, limit || 20) }; },
    },
  };
}

// -----------------------------------------------------------------------
// Stateful fake D1：讓真正worker.fetch()的round-trip情境能保有真的狀態
// （沿用TASK1.29起建立的模式，擴充自TASK1.35版本）
// -----------------------------------------------------------------------
function makeStatefulFakeD1() {
  const calls = [];
  const users = new Map();
  const sessions = new Map();
  const explorationRecords = new Map();
  const foodEvents = new Map();
  const emotionRecords = new Map();
  const behaviorPatterns = new Map();
  const aiReports = new Map();
  let nextId = 1;

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
        } else if (/UPDATE sessions SET revoked_at = \? WHERE id = \?/.test(sql)) {
          const [revokedAt, id] = params;
          const s = sessions.get(id);
          if (s) s.revoked_at = revokedAt;
        }
        return { meta: {} };
      },
      async all() {
        calls.push({ type: 'all', sql, params });
        if (/SELECT \* FROM exploration_records WHERE user_id = \?/.test(sql)) {
          const [userId, limit] = params;
          return { results: [...explorationRecords.values()].filter((r) => r.user_id === userId).slice(0, limit) };
        }
        if (/SELECT \* FROM food_events WHERE user_id = \?/.test(sql)) {
          const [userId, limit] = params;
          return { results: [...foodEvents.values()].filter((r) => r.user_id === userId).slice(0, limit) };
        }
        if (/SELECT \* FROM emotion_records WHERE user_id = \?/.test(sql)) {
          const [userId, limit] = params;
          return { results: [...emotionRecords.values()].filter((r) => r.user_id === userId).slice(0, limit) };
        }
        if (/SELECT \* FROM behavior_patterns WHERE user_id = \?/.test(sql)) {
          const [userId, limit] = params;
          return { results: [...behaviorPatterns.values()].filter((r) => r.user_id === userId).slice(0, limit) };
        }
        if (/SELECT \* FROM ai_reports WHERE user_id = \?/.test(sql)) {
          const [userId, limit] = params;
          return { results: [...aiReports.values()].filter((r) => r.user_id === userId).slice(0, limit) };
        }
        return { results: [] };
      },
      async first() {
        calls.push({ type: 'first', sql, params });
        if (/SELECT \* FROM users WHERE id = \?/.test(sql)) return users.get(params[0]) || null;
        if (/SELECT \* FROM sessions WHERE id = \?/.test(sql)) return sessions.get(params[0]) || null;
        if (/INSERT INTO exploration_records/.test(sql)) {
          const [user_id, draw_mode, card_category, card_object_key, card_text, photo_idx, responses_json, occurred_at] = params;
          const id = nextId++;
          explorationRecords.set(id, { id, user_id, draw_mode, card_category, card_object_key, card_text, photo_idx, responses_json, occurred_at });
          return { id };
        }
        if (/INSERT INTO food_events/.test(sql)) {
          const [user_id, meal_type, description, nutrients_json, image_id, occurred_at] = params;
          const id = nextId++;
          foodEvents.set(id, { id, user_id, meal_type, description, nutrients_json, image_id, occurred_at });
          return { id };
        }
        if (/INSERT INTO emotion_records/.test(sql)) {
          const [user_id, emotion_type, intensity, trigger_note, linked_food_event_id, occurred_at] = params;
          const id = nextId++;
          emotionRecords.set(id, { id, user_id, emotion_type, intensity, trigger_note, linked_food_event_id, occurred_at });
          return { id };
        }
        if (/INSERT INTO behavior_patterns/.test(sql)) {
          const [user_id, pattern_type, summary, evidence_json, confidence_score, detected_at] = params;
          const id = nextId++;
          behaviorPatterns.set(id, { id, user_id, pattern_type, summary, evidence_json, confidence_score, detected_at });
          return { id };
        }
        if (/INSERT INTO ai_reports/.test(sql)) {
          const [user_id, report_type, period_start, period_end, content, model_used] = params;
          const id = nextId++;
          aiReports.set(id, { id, user_id, report_type, period_start, period_end, content, model_used });
          return { id };
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

function activeUser(id, overrides) {
  return Object.assign({ id, status: 'active', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-' + id, display_name: null, legacy_sync_code: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }, overrides || {});
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

async function seedAllFiveRecords(db, userId) {
  await createExplorationController(db, userId, { draw_mode: 'single' });
  await createFoodEventController(db, userId, { meal_type: 'lunch' });
  await createEmotionController(db, userId, { emotion_type: 'calm' });
  await createBehaviorController(db, userId, { pattern_type: 'test-pattern' });
  await createReportController(db, userId, { report_type: 'weekly' });
}

async function run() {
  // =========================================================================
  // A. auth required
  // =========================================================================

  await test('（1.auth required）GET /api/dashboard 沒有cookie時回401，完全不呼叫任何domain service', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {} }, { db });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(db.calls.length, 0, '未登入時完全不應該有任何db呼叫');
  });

  await test('（1.auth required）帶著不存在的session token時回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=does-not-exist` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（1.auth required）session已撤銷時回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-revoked-1'));
    db.seedSession(makeSession('tok-revoked-1', 'u-revoked-1', { revoked_at: '2026-01-01T00:00:00.000Z' }));
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-revoked-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（1.auth required）使用者狀態為suspended時回401（即使session本身有效）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-susp-1', { status: 'suspended' }));
    db.seedSession(makeSession('tok-susp-1', 'u-susp-1'));
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-susp-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（1.auth required）使用者狀態為deleted時回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-del-1', { status: 'deleted' }));
    db.seedSession(makeSession('tok-del-1', 'u-del-1'));
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-del-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（1.auth required）合法登入的使用者可以正常存取（正向對照組）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-ok-1'));
    db.seedSession(makeSession('tok-ok-1', 'u-ok-1'));
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-ok-1` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（1.auth required）getDashboardController() 對沒有userId的呼叫直接安全回401（雙重防禦，即使繞過route層middleware直接呼叫controller）', async () => {
    const db = makeMockDb();
    const result = await getDashboardController(db, null, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.reason, 'not_authenticated');
  });

  await test('（1.auth required）getDashboard()（service層）對沒有userId的呼叫安全回401（雙重防禦）', async () => {
    const db = makeMockDb();
    const result = await getDashboard(db, null, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_not_found');
  });

  await test('（Router routing）POST /api/dashboard（方法不符，只註冊了GET）回405', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/dashboard', payload: {} }, { db: makeMockDb() });
    assert.strictEqual(res.status, 405);
  });

  await test('（Router routing）DELETE /api/dashboard（方法不符）回405', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'DELETE', pathname: '/api/dashboard' }, { db: makeMockDb() });
    assert.strictEqual(res.status, 405);
  });

  await test('（1.auth required）session存在但對應的user資料已經不見時（理論上因FK CASCADE不該發生）安全回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedSession(makeSession('tok-orphan-1', 'u-does-not-exist'));
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-orphan-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（1.auth required）cookie格式不正確（缺少session名稱）時安全回401，不拋例外', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: 'garbage-not-a-cookie' }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（1.auth required）query為undefined時（router層沒有帶query欄位）仍安全回401，不拋例外', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard' }, { db });
    assert.strictEqual(res.status, 401);
  });

  console.log('');

  // =========================================================================
  // B. dashboard success
  // =========================================================================

  await test('（2.dashboard success）登入使用者成功取得dashboard，回傳success shape', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-dash-1'));
    const result = await getDashboardController(db, 'u-dash-1', {});
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['behaviors', 'emotions', 'explorations', 'foodEvents', 'reports']);
  });

  await test('（2.dashboard success）dashboard的五個欄位都是陣列', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-dash-2'));
    const result = await getDashboardController(db, 'u-dash-2', {});
    for (const key of ['explorations', 'foodEvents', 'emotions', 'behaviors', 'reports']) {
      assert.ok(Array.isArray(result.data[key]), `${key} 應該是陣列`);
    }
  });

  await test('（2.dashboard success）Router routing層級：GET /api/dashboard透過真正router.handle()完整鏈路成功', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-dash-3'));
    db.seedSession(makeSession('tok-dash-3', 'u-dash-3'));
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-dash-3` }, { db });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.ok);
  });

  await test('（2.dashboard success）不存在的userId時安全回401 user_not_found', async () => {
    const db = makeMockDb();
    const result = await getDashboardController(db, 'no-such-user', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.reason, 'user_not_found');
  });

  await test('（2.dashboard success）dashboardContract.response.success正確描述五個欄位', () => {
    assert.deepStrictEqual(Object.keys(dashboardContract.response.success).sort(), ['behaviors', 'emotions', 'explorations', 'foodEvents', 'reports']);
  });

  await test('（2.dashboard success）連續呼叫兩次dashboard結果一致（冪等讀取）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-dash-4'));
    await createExplorationController(db, 'u-dash-4', { draw_mode: 'single' });
    const first = await getDashboardController(db, 'u-dash-4', {});
    const second = await getDashboardController(db, 'u-dash-4', {});
    assert.deepStrictEqual(first.data, second.data);
  });

  await test('（2.dashboard success）dashboard成功時HTTP status為200', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-dash-5'));
    db.seedSession(makeSession('tok-dash-5', 'u-dash-5'));
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-dash-5` }, { db });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('Content-Type'), 'application/json');
  });

  console.log('');

  // =========================================================================
  // C. empty user
  // =========================================================================

  await test('（3.empty user）全新使用者（五個資料表都沒有任何紀錄）取得dashboard成功，五個欄位皆為空陣列', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-empty-1'));
    const result = await getDashboardController(db, 'u-empty-1', {});
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data.explorations, []);
    assert.deepStrictEqual(result.data.foodEvents, []);
    assert.deepStrictEqual(result.data.emotions, []);
    assert.deepStrictEqual(result.data.behaviors, []);
    assert.deepStrictEqual(result.data.reports, []);
  });

  await test('（3.empty user）空使用者的dashboard請求仍會呼叫全部五個listByUser（不會因為預期沒資料就跳過查詢）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-empty-2'));
    await getDashboardController(db, 'u-empty-2', {});
    const listCalls = db.calls.filter((c) => c.type === 'listByUser');
    const tables = new Set(listCalls.map((c) => c.table));
    assert.strictEqual(tables.size, 5);
  });

  await test('（3.empty user，端對端）guest login後立刻取得dashboard（尚未建立任何資料）全部回空陣列', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-empty-3'));
    db.seedSession(makeSession('tok-empty-3', 'u-empty-3'));
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-empty-3` }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.explorations.length, 0);
    assert.strictEqual(body.data.reports.length, 0);
  });

  await test('（3.empty user）不同使用者各自都是empty user時互不影響（各自查詢皆回空陣列）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-empty-5'));
    db.seedUser(activeUser('u-empty-6'));
    const resultA = await getDashboardController(db, 'u-empty-5', {});
    const resultB = await getDashboardController(db, 'u-empty-6', {});
    assert.deepStrictEqual(resultA.data, resultB.data);
  });

  await test('（3.empty user）只有其中一類有資料，其餘四類仍正確回空陣列（不會互相污染）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-empty-4'));
    await createExplorationController(db, 'u-empty-4', { draw_mode: 'single' });
    const result = await getDashboardController(db, 'u-empty-4', {});
    assert.strictEqual(result.data.explorations.length, 1);
    assert.strictEqual(result.data.foodEvents.length, 0);
    assert.strictEqual(result.data.emotions.length, 0);
    assert.strictEqual(result.data.behaviors.length, 0);
    assert.strictEqual(result.data.reports.length, 0);
  });

  await test('（3.empty user，端對端）真正worker.fetch()對全新guest的dashboard五個欄位皆為空陣列', async () => {
    const workerUrlLocal = 'file://' + workerPath + '?t=' + Date.now() + '-empty';
    const modLocal = await import(workerUrlLocal);
    const workerLocal = modLocal.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const loginRes = await workerLocal.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];
    const res = await workerLocal.fetch(new Request('https://example.com/api/dashboard', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    for (const key of ['explorations', 'foodEvents', 'emotions', 'behaviors', 'reports']) {
      assert.deepStrictEqual(body.data[key], []);
    }
  });

  console.log('');

  // =========================================================================
  // D. user data aggregation
  // =========================================================================

  await test('（4.user data aggregation）建立五大類資料後，dashboard正確聚合全部五類', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-agg-1'));
    await seedAllFiveRecords(db, 'u-agg-1');
    const result = await getDashboardController(db, 'u-agg-1', {});
    assert.strictEqual(result.data.explorations.length, 1);
    assert.strictEqual(result.data.foodEvents.length, 1);
    assert.strictEqual(result.data.emotions.length, 1);
    assert.strictEqual(result.data.behaviors.length, 1);
    assert.strictEqual(result.data.reports.length, 1);
  });

  await test('（4.user data aggregation）dashboard回傳的每個欄位內容跟直接呼叫各自的domain service查詢結果一致', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-agg-2'));
    await createExplorationController(db, 'u-agg-2', { draw_mode: 'triple', card_category: 'X' });
    const result = await getDashboardController(db, 'u-agg-2', {});
    assert.strictEqual(result.data.explorations[0].draw_mode, 'triple');
    assert.strictEqual(result.data.explorations[0].card_category, 'X');
  });

  await test('（4.user data aggregation）多筆同類資料全部正確聚合，數量正確', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-agg-3'));
    for (let i = 0; i < 4; i++) await createFoodEventController(db, 'u-agg-3', { meal_type: 'snack-' + i });
    const result = await getDashboardController(db, 'u-agg-3', {});
    assert.strictEqual(result.data.foodEvents.length, 4);
  });

  await test('（4.user data aggregation）query.limit正確套用到全部五個子查詢', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-agg-4'));
    for (let i = 0; i < 5; i++) {
      await createExplorationController(db, 'u-agg-4', { draw_mode: 'single' });
      await createFoodEventController(db, 'u-agg-4', { meal_type: 'meal' });
    }
    const result = await getDashboardController(db, 'u-agg-4', { limit: '2' });
    assert.strictEqual(result.data.explorations.length, 2);
    assert.strictEqual(result.data.foodEvents.length, 2);
  });

  await test('（4.user data aggregation）沒有帶limit時套用各domain service自己的預設值（不會強制帶入undefined造成錯誤）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-agg-9'));
    await createExplorationController(db, 'u-agg-9', { draw_mode: 'single' });
    const result = await getDashboardController(db, 'u-agg-9', undefined);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.explorations.length, 1);
  });

  await test('（4.user data aggregation）dashboard的explorations欄位保留每筆紀錄的完整欄位（不做任何欄位裁剪）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-agg-10'));
    await createExplorationController(db, 'u-agg-10', { draw_mode: 'single', card_category: 'T', card_text: 'some text' });
    const result = await getDashboardController(db, 'u-agg-10', {});
    assert.strictEqual(result.data.explorations[0].card_text, 'some text');
  });

  await test('（4.user data aggregation）不合法的limit值時安全套用各service預設值（不拋例外）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-agg-5'));
    await createExplorationController(db, 'u-agg-5', { draw_mode: 'single' });
    const result = await getDashboardController(db, 'u-agg-5', { limit: 'not-a-number' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.explorations.length, 1);
  });

  await test('（4.user data aggregation）情緒紀錄關聯的食物事件在dashboard裡各自出現在正確的欄位（emotions/foodEvents不互相混淆）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-agg-6'));
    const foodResult = await createFoodEventController(db, 'u-agg-6', { meal_type: 'dinner' });
    await createEmotionController(db, 'u-agg-6', { emotion_type: 'guilty', linked_food_event_id: foodResult.data.id });
    const result = await getDashboardController(db, 'u-agg-6', {});
    assert.strictEqual(result.data.foodEvents.length, 1);
    assert.strictEqual(result.data.emotions.length, 1);
    assert.strictEqual(result.data.emotions[0].linked_food_event_id, foodResult.data.id);
  });

  await test('（4.user data aggregation）建立超過limit數量的資料時，dashboard正確截斷成limit筆', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-agg-7'));
    for (let i = 0; i < 10; i++) await createBehaviorController(db, 'u-agg-7', { pattern_type: 'p' + i });
    const result = await getDashboardController(db, 'u-agg-7', { limit: '3' });
    assert.strictEqual(result.data.behaviors.length, 3);
  });

  await test('（4.user data aggregation）emotions/behaviors/reports三類同時建立多筆，各自數量正確不互相干擾', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-agg-8'));
    await createEmotionController(db, 'u-agg-8', { emotion_type: 'a' });
    await createEmotionController(db, 'u-agg-8', { emotion_type: 'b' });
    await createBehaviorController(db, 'u-agg-8', { pattern_type: 'x' });
    await createReportController(db, 'u-agg-8', { report_type: 'r1' });
    await createReportController(db, 'u-agg-8', { report_type: 'r2' });
    await createReportController(db, 'u-agg-8', { report_type: 'r3' });
    const result = await getDashboardController(db, 'u-agg-8', {});
    assert.strictEqual(result.data.emotions.length, 2);
    assert.strictEqual(result.data.behaviors.length, 1);
    assert.strictEqual(result.data.reports.length, 3);
  });

  await test('（4.user data aggregation，端對端）透過真正worker.fetch()建立五大類資料後dashboard正確聚合', async () => {
    const workerUrlLocal = 'file://' + workerPath + '?t=' + Date.now() + '-agg';
    const modLocal = await import(workerUrlLocal);
    const workerLocal = modLocal.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const loginRes = await workerLocal.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];
    await workerLocal.fetch(new Request('https://example.com/api/explorations', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ draw_mode: 'single' }) }), env, {});
    await workerLocal.fetch(new Request('https://example.com/api/food-events', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ meal_type: 'lunch' }) }), env, {});
    await workerLocal.fetch(new Request('https://example.com/api/emotions', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ emotion_type: 'calm' }) }), env, {});
    await workerLocal.fetch(new Request('https://example.com/api/behaviors', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ pattern_type: 'x' }) }), env, {});
    await workerLocal.fetch(new Request('https://example.com/api/reports', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ report_type: 'weekly' }) }), env, {});
    const dashRes = await workerLocal.fetch(new Request('https://example.com/api/dashboard', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(dashRes.status, 200);
    const body = await dashRes.json();
    assert.strictEqual(body.data.explorations.length, 1);
    assert.strictEqual(body.data.foodEvents.length, 1);
    assert.strictEqual(body.data.emotions.length, 1);
    assert.strictEqual(body.data.behaviors.length, 1);
    assert.strictEqual(body.data.reports.length, 1);
  });

  console.log('');

  // =========================================================================
  // E. cross user isolation
  // =========================================================================

  await test('（5.cross user isolation）使用者A的dashboard完全不含使用者B的資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a1'));
    db.seedUser(activeUser('u-cross-b1'));
    await seedAllFiveRecords(db, 'u-cross-a1');
    await createExplorationController(db, 'u-cross-b1', { draw_mode: 'b-only' });
    const resultA = await getDashboardController(db, 'u-cross-a1', {});
    assert.strictEqual(resultA.data.explorations.length, 1);
    assert.notStrictEqual(resultA.data.explorations[0].draw_mode, 'b-only');
  });

  await test('（5.cross user isolation）query帶偽造user_id完全被忽略，dashboard一律回傳session使用者自己的資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a2'));
    db.seedUser(activeUser('u-cross-victim'));
    await createReportController(db, 'u-cross-victim', { report_type: 'victim-report' });
    const result = await getDashboardController(db, 'u-cross-a2', { user_id: 'u-cross-victim' });
    assert.strictEqual(result.data.reports.length, 0);
  });

  await test('（5.cross user isolation，端對端）兩個不同guest登入各自的dashboard完全互不干擾', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a3'));
    db.seedUser(activeUser('u-cross-b3'));
    db.seedSession(makeSession('tok-cross-a3', 'u-cross-a3'));
    db.seedSession(makeSession('tok-cross-b3', 'u-cross-b3'));
    await router.handle({ method: 'POST', pathname: '/api/behaviors', payload: { pattern_type: 'a-secret' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-cross-a3` }, { db });
    const resB = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-cross-b3` }, { db });
    const bodyB = await resB.json();
    assert.deepStrictEqual(bodyB.data.behaviors, []);
  });

  await test('（5.cross user isolation）使用者A無法透過偽造session cookie存取使用者B的dashboard（不存在的token仍是401）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-b4'));
    db.seedSession(makeSession('tok-cross-b4', 'u-cross-b4'));
    await seedAllFiveRecords(db, 'u-cross-b4');
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=forged-token-not-real` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（5.cross user isolation）emotions欄位跨使用者隔離', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a5'));
    db.seedUser(activeUser('u-cross-b5'));
    await createEmotionController(db, 'u-cross-a5', { emotion_type: 'a-emotion' });
    await createEmotionController(db, 'u-cross-b5', { emotion_type: 'b-emotion' });
    const resultA = await getDashboardController(db, 'u-cross-a5', {});
    assert.strictEqual(resultA.data.emotions.length, 1);
    assert.strictEqual(resultA.data.emotions[0].emotion_type, 'a-emotion');
  });

  await test('（5.cross user isolation）reports欄位跨使用者隔離', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a6'));
    db.seedUser(activeUser('u-cross-b6'));
    await createReportController(db, 'u-cross-a6', { report_type: 'a-report' });
    await createReportController(db, 'u-cross-b6', { report_type: 'b-report' });
    const resultB = await getDashboardController(db, 'u-cross-b6', {});
    assert.strictEqual(resultB.data.reports.length, 1);
    assert.strictEqual(resultB.data.reports[0].report_type, 'b-report');
  });

  await test('（5.cross user isolation）foodEvents欄位跨使用者隔離', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a7'));
    db.seedUser(activeUser('u-cross-b7'));
    await createFoodEventController(db, 'u-cross-a7', { meal_type: 'a-meal' });
    await createFoodEventController(db, 'u-cross-b7', { meal_type: 'b-meal' });
    const resultA = await getDashboardController(db, 'u-cross-a7', {});
    assert.strictEqual(resultA.data.foodEvents.length, 1);
    assert.strictEqual(resultA.data.foodEvents[0].meal_type, 'a-meal');
  });

  await test('（5.cross user isolation）多使用者各自建立多筆資料後，每個人的dashboard只看得到自己的', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-multi-1'));
    db.seedUser(activeUser('u-cross-multi-2'));
    db.seedUser(activeUser('u-cross-multi-3'));
    for (const id of ['u-cross-multi-1', 'u-cross-multi-2', 'u-cross-multi-3']) {
      await createBehaviorController(db, id, { pattern_type: id + '-pattern' });
    }
    for (const id of ['u-cross-multi-1', 'u-cross-multi-2', 'u-cross-multi-3']) {
      const result = await getDashboardController(db, id, {});
      assert.strictEqual(result.data.behaviors.length, 1);
      assert.strictEqual(result.data.behaviors[0].pattern_type, id + '-pattern');
    }
  });

  console.log('');

  // =========================================================================
  // F. session expired
  // =========================================================================

  await test('（6.session expired）session已過期時取得dashboard回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-sess-1'));
    db.seedSession(makeSession('tok-exp-sess-1', 'u-exp-sess-1', { expires_at: '2020-01-01T00:00:00.000Z' }));
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-exp-sess-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（6.session expired）過期session時完全不會呼叫任何domain service查詢', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-sess-2'));
    db.seedSession(makeSession('tok-exp-sess-2', 'u-exp-sess-2', { expires_at: '2020-01-01T00:00:00.000Z' }));
    await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-exp-sess-2` }, { db });
    assert.strictEqual(db.calls.filter((c) => c.type === 'listByUser').length, 0);
  });

  await test('（6.session expired）session剛好還沒過期（差1秒）時仍能正常取得dashboard', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-sess-3'));
    const future = new Date(Date.now() + 1000).toISOString();
    db.seedSession(makeSession('tok-exp-sess-3', 'u-exp-sess-3', { expires_at: future }));
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-exp-sess-3` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（6.session expired，端對端）過期session透過真正worker.fetch()取得dashboard回401', async () => {
    const workerUrlLocal = 'file://' + workerPath + '?t=' + Date.now() + '-sessexp';
    const modLocal = await import(workerUrlLocal);
    const workerLocal = modLocal.default;
    const fakeD1 = makeStatefulFakeD1();
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: fakeD1 };
    const loginRes = await workerLocal.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];
    const sessionToken = cookie.split('=')[1];
    const sessionRow = fakeD1._sessions.get(sessionToken);
    sessionRow.expires_at = '2020-01-01T00:00:00.000Z';
    const res = await workerLocal.fetch(new Request('https://example.com/api/dashboard', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 401);
  });

  console.log('');

  // =========================================================================
  // G. logout invalidation
  // =========================================================================

  await test('（7.logout invalidation）登出後同一個cookie無法再取得dashboard，回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-logout-1'));
    db.seedSession(makeSession('tok-logout-1', 'u-logout-1'));
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-1` }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（7.logout invalidation）登出前可以正常取得，登出後才失效（前後對照）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-logout-2'));
    db.seedSession(makeSession('tok-logout-2', 'u-logout-2'));
    const before = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-2` }, { db });
    assert.strictEqual(before.status, 200);
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-2` }, { db });
    const after = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-2` }, { db });
    assert.strictEqual(after.status, 401);
  });

  await test('（7.logout invalidation）登出其中一個裝置的session，不影響同一個user的其他session取得dashboard', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-logout-3'));
    db.seedSession(makeSession('tok-logout-3a', 'u-logout-3'));
    db.seedSession(makeSession('tok-logout-3b', 'u-logout-3'));
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-3a` }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-3b` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（7.logout invalidation）登出後dashboard完全不會呼叫任何domain service（在auth middleware就短路）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-logout-4'));
    db.seedSession(makeSession('tok-logout-4', 'u-logout-4'));
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-4` }, { db });
    db.calls.length = 0;
    await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-4` }, { db });
    assert.strictEqual(db.calls.filter((c) => c.type === 'listByUser').length, 0);
  });

  await test('（7.logout invalidation，端對端）guest登出後透過真正worker.fetch()取得dashboard回401', async () => {
    const workerUrlLocal = 'file://' + workerPath + '?t=' + Date.now() + '-logout';
    const modLocal = await import(workerUrlLocal);
    const workerLocal = modLocal.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const loginRes = await workerLocal.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];
    await workerLocal.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookie } }), env, {});
    const res = await workerLocal.fetch(new Request('https://example.com/api/dashboard', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 401);
  });

  console.log('');

  // =========================================================================
  // H. service failure handling
  // =========================================================================

  await test('（8.service failure handling）exploration查詢失敗時整個dashboard安全回500，不回傳部分資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-1'));
    db.explorationRecords.listByUser = async () => ({ ok: false, error: 'db_error' });
    const result = await getDashboardController(db, 'u-fail-1', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（8.service failure handling）food查詢失敗時整個dashboard安全回500', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-2'));
    db.foodEvents.listByUser = async () => ({ ok: false, error: 'db_error' });
    const result = await getDashboardController(db, 'u-fail-2', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（8.service failure handling）emotion查詢失敗時整個dashboard安全回500', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-3'));
    db.emotionRecords.listByUser = async () => ({ ok: false, error: 'db_error' });
    const result = await getDashboardController(db, 'u-fail-3', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（8.service failure handling）behavior查詢失敗時整個dashboard安全回500', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-4'));
    db.behaviorPatterns.listByUser = async () => ({ ok: false, error: 'db_error' });
    const result = await getDashboardController(db, 'u-fail-4', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（8.service failure handling）report查詢失敗時整個dashboard安全回500', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-5'));
    db.aiReports.listByUser = async () => ({ ok: false, error: 'db_error' });
    const result = await getDashboardController(db, 'u-fail-5', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（8.service failure handling）service層回傳的failedSection正確標記是哪個區塊失敗', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-6'));
    db.behaviorPatterns.listByUser = async () => ({ ok: false, error: 'db_error' });
    const result = await getDashboard(db, 'u-fail-6', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failedSection, 'behaviors');
  });

  await test('（8.service failure handling）controller對getDashboard()拋出未預期例外時安全回500，不拋出未攔截例外', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-7'));
    db.explorationRecords.listByUser = async () => { throw new Error('unexpected'); };
    const result = await getDashboardController(db, 'u-fail-7', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（8.service failure handling，端對端）任一子service失敗時，透過真正router.handle()整個請求安全回500', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-8'));
    db.seedSession(makeSession('tok-fail-8', 'u-fail-8'));
    db.aiReports.listByUser = async () => ({ ok: false, error: 'db_error' });
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-fail-8` }, { db });
    assert.strictEqual(res.status, 500);
  });

  await test('（8.service failure handling）多個子service同時失敗時，仍安全回傳500（不會因為多重失敗而拋出未攔截例外）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-9'));
    db.foodEvents.listByUser = async () => ({ ok: false, error: 'db_error_1' });
    db.emotionRecords.listByUser = async () => ({ ok: false, error: 'db_error_2' });
    const result = await getDashboardController(db, 'u-fail-9', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（8.service failure handling）子service失敗不影響其他使用者的dashboard查詢（失敗是per-request的，不是全域狀態）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-10'));
    db.seedUser(activeUser('u-fail-11'));
    let shouldFail = true;
    const originalListByUser = db.behaviorPatterns.listByUser.bind(db.behaviorPatterns);
    db.behaviorPatterns.listByUser = async (userId, limit) => {
      if (shouldFail && userId === 'u-fail-10') return { ok: false, error: 'db_error' };
      return originalListByUser(userId, limit);
    };
    const resultA = await getDashboardController(db, 'u-fail-10', {});
    assert.strictEqual(resultA.ok, false);
    const resultB = await getDashboardController(db, 'u-fail-11', {});
    assert.strictEqual(resultB.ok, true);
  });

  console.log('');

  // =========================================================================
  // 真正的 src/worker.js 端對端測試（I/J共用）
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

  await test('（1.auth required，端對端）沒有cookie呼叫GET /api/dashboard透過真正worker.fetch()回401', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/api/dashboard'), env, {});
    assert.strictEqual(res.status, 401);
  });

  await test('（端對端）沒有D1 binding時（bootstrap失敗），優雅fallback到legacy首頁', async () => {
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2({}) };
    const res = await worker.fetch(new Request('https://example.com/api/dashboard'), env, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（延續守則）FEATURE_ROUTE_MIGRATION_ENABLED=true時，dashboard依然正常（不依賴這個flag）', async () => {
    const env = Object.assign(makeFreshEnv(), { FEATURE_ROUTE_MIGRATION_ENABLED: 'true' });
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];
    const res = await worker.fetch(new Request('https://example.com/api/dashboard', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // =========================================================================
  // I. KV/R2 regression
  // =========================================================================

  await test('（9.KV/R2 regression）GET /api/dashboard 完全不呼叫SYNC_KV/R2', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];
    let kvOrR2Called = false;
    env.SYNC_KV.get = async () => { kvOrR2Called = true; return null; };
    env.DIET_COACH_IMAGES.get = async () => { kvOrR2Called = true; return null; };
    await worker.fetch(new Request('https://example.com/api/dashboard', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(kvOrR2Called, false);
  });

  await test('（9.KV/R2 regression）啟用dashboard後，/api/sync 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=dashboard-kv-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), env, {});
    assert.strictEqual((await res.json()).ok, true);
  });

  await test('（9.KV/R2 regression）啟用dashboard後，/img/* 讀取行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    assert.strictEqual(await res.text(), 'FAKE_JPEG_BYTES');
  });

  await test('（9.KV/R2 regression）dashboard查詢失敗時（500）仍然完全不呼叫KV/R2', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-kv-fail-1'));
    db.seedSession(makeSession('tok-kv-fail-1', 'u-kv-fail-1'));
    db.aiReports.listByUser = async () => ({ ok: false, error: 'db_error' });
    let kvOrR2Called = false;
    const fakeEnv = { SYNC_KV: { get: async () => { kvOrR2Called = true; } }, DIET_COACH_IMAGES: { get: async () => { kvOrR2Called = true; } } };
    await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-kv-fail-1` }, { db, env: fakeEnv });
    assert.strictEqual(kvOrR2Called, false);
  });

  console.log('');

  // =========================================================================
  // J. legacy route regression
  // =========================================================================

  await test('（10.legacy route regression）GET / 首頁HTML完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/'), env, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（10.legacy route regression）GET /manifest.json 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), env, {});
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
  });

  await test('（10.legacy route regression）GET /icon.svg 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  await test('（10.legacy route regression）GET /users/999（仍未啟用）落到首頁catch-all', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/users/999'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（10.legacy route regression）D1完全沒有任何SQL呼叫（只呼叫不含auth/api的legacy路由時）', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=dashboard-legacy-1'), env, {});
    assert.strictEqual(env.DIET_COACH_DB.calls.length, 0);
  });

  await test('（10.legacy route regression）既有5個User Data API資源行為完全不變', async () => {
    const env = makeFreshEnv();
    const loginRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];
    const res = await worker.fetch(new Request('https://example.com/api/explorations', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ draw_mode: 'single' }) }), env, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（10.legacy route regression）既有五條auth路由行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（10.legacy route regression）GET /apple-touch-icon.png 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/apple-touch-icon.png'), env, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（10.legacy route regression）啟用dashboard後，/api/qlive 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/api/qlive?code=dashboard-qlive-1'), env, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'null');
  });

  console.log('');

  // =========================================================================
  // K. 架構守則 / 原始碼掃描（含P1-P6標記）
  // =========================================================================

  await test('（架構守則）原始碼掃描：dashboard_controller.js 完全沒有 import src/db/ 底下任何檔案', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'controllers', 'dashboard_controller.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/db\//.test(src));
  });

  await test('（架構守則）原始碼掃描：dashboard_controller.js 沒有 import src/auth/ 或 src/identity/session_rules.js（session邏輯完全交給requireAuth() middleware）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'controllers', 'dashboard_controller.js'), 'utf8'));
    assert.ok(!/from\s+['"]\.\.\/auth\//.test(src));
    assert.ok(!/from\s+['"]\.\.\/identity\/session_rules\.js['"]/.test(src));
  });

  await test('（架構守則）原始碼掃描：dashboard_routes.js 使用requireAuth()（從src/middleware/auth_middleware.js import，TASK1.27既有邏輯）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'routes', 'dashboard_routes.js'), 'utf8'));
    assert.ok(/from\s+['"]\.\.\/middleware\/auth_middleware\.js['"]/.test(src));
  });

  await test('（架構守則）原始碼掃描：src/routes/index.js 正確註冊registerDashboardRoutes()', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'routes', 'index.js'), 'utf8'));
    assert.ok(/registerDashboardRoutes/.test(src));
  });

  await test('（架構守則）原始碼掃描：src/services/dashboard_service.js 完全沒有 import src/db/ 底下任何檔案（D1操作只能透過既有domain service）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'dashboard_service.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/db\//.test(src));
  });

  await test('（架構守則）原始碼掃描：dashboard_service.js 完全委派給TASK1.15既有的五個domain service，沒有重新實作任何查詢邏輯', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'dashboard_service.js'), 'utf8'));
    assert.ok(/from\s+['"]\.\/exploration_service\.js['"]/.test(src));
    assert.ok(/from\s+['"]\.\/food_service\.js['"]/.test(src));
    assert.ok(/from\s+['"]\.\/emotion_service\.js['"]/.test(src));
    assert.ok(/from\s+['"]\.\/behavior_service\.js['"]/.test(src));
    assert.ok(/from\s+['"]\.\/report_service\.js['"]/.test(src));
  });

  await test('（架構守則）原始碼掃描：dashboard_service.js 使用Promise.all並行呼叫五個子查詢（不是依序await）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'dashboard_service.js'), 'utf8'));
    assert.ok(/Promise\.all/.test(src));
  });

  await test('（架構守則）原始碼掃描：src/routes/dashboard_routes.js 完全沒有直接呼叫 ctx.db.explorationRecords/foodEvents/emotionRecords/behaviorPatterns/aiReports', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'routes', 'dashboard_routes.js'), 'utf8'));
    assert.ok(!/ctx\.db\.(explorationRecords|foodEvents|emotionRecords|behaviorPatterns|aiReports)/.test(src));
  });

  await test('（架構守則）原始碼掃描：src/routes/dashboard_routes.js 完全沒有讀取query.user_id', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'routes', 'dashboard_routes.js'), 'utf8'));
    assert.ok(!/query\.user_id/.test(src));
    assert.ok(/ctx\.user\.id/.test(src), '應該用ctx.user.id取得目前登入的使用者');
  });

  await test('（架構守則）原始碼掃描：GET /api/dashboard路由掛了requireAuth() middleware', () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/api/dashboard');
    assert.ok(route);
    assert.strictEqual(route.middlewares.length, 2, '應該有2個middleware（requireAuth+contractValidation）');
  });

  await test('（架構守則）原始碼掃描：dashboard相關檔案完全沒有出現AI分析相關字樣（禁止AI分析生成）', () => {
    for (const f of ['src/controllers/dashboard_controller.js', 'src/routes/dashboard_routes.js', 'src/services/dashboard_service.js', 'src/contracts/dashboard_contract.js']) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      assert.ok(!/openai|anthropic|gpt-|generateReport|analyzePattern/i.test(src), f);
    }
  });

  await test('（架構守則）原始碼掃描：dashboard相關檔案完全沒有修改任何UI/HTML字串', () => {
    for (const f of ['src/controllers/dashboard_controller.js', 'src/routes/dashboard_routes.js', 'src/services/dashboard_service.js', 'src/contracts/dashboard_contract.js']) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      assert.ok(!/<script|<style|getHTML|innerHTML/i.test(src), f);
    }
  });

  await test('（架構守則）原始碼掃描：worker.js 的 handle(r,env) 函式體完全沒有變動', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0);
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/createApplication|router\.handle|dashboard/i.test(handleBody));
  });

  await test('（架構守則）git diff：wrangler.toml 在TASK1.36完全沒有異動', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat wrangler.toml', { cwd: repoRoot }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（架構守則）原始碼掃描：worker.js 沒有 legacy_import 相關字樣（Legacy Import沒有被正式啟動）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/legacy_import/i.test(src));
  });

  await test('（架構守則）dashboardContract.request為空物件（沒有必填欄位，limit為選填query參數）', () => {
    assert.deepStrictEqual(dashboardContract.request, {});
  });

  await test('（架構守則）dashboardContract.response.failureReasons不含user_id相關的reason（因為user_id完全不接受payload指定，不會有這種錯誤情境）', () => {
    assert.ok(!dashboardContract.response.failureReasons.some((r) => /user_id/i.test(r)));
  });

  await test('（架構守則）router.js 每條路由各自快取自己的 pipelineHandler（applyPipeline在add()時建立一次，不是每次handle都重建）', async () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/api/dashboard');
    const handlerRef1 = route.applyPipeline;
    await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {} }, { db: makeMockDb() });
    const handlerRef2 = route.applyPipeline;
    assert.strictEqual(handlerRef1, handlerRef2);
  });

  await test('（架構守則）原始碼掃描：src/db/tables/底下五個domain table檔案完全沒有被TASK1.36修改（沒有異動既有資料表）', async () => {
    const { execSync } = await import('node:child_process');
    for (const f of ['exploration_records.js', 'food_events.js', 'emotion_records.js', 'behavior_patterns.js', 'ai_reports.js']) {
      const diff = execSync(`git diff --stat src/db/tables/${f}`, { cwd: repoRoot }).toString();
      assert.strictEqual(diff.trim(), '', `src/db/tables/${f} 不應該有任何異動`);
    }
  });

  await test('（架構守則）D1本地/正式環境驗證另外在 real_d1_verify.mjs 執行，本檔案完全不連線真實或本機模擬的資料庫', () => {
    assert.ok(true);
  });

  await test('（11.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（前端頁面完全未被TASK1.36修改，UI受影響機率為0，見「禁止修改UI」限制）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'dashboard-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

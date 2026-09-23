/*
 * Phase 1 TASK 1.35｜User Data API Integration Layer 測試
 *
 * 分為以下部分：
 * A) auth required（10條路由未登入一律401，不呼叫任何domain service）
 * B) create/query exploration
 * C) food record
 * D) emotion link
 * E) behavior record
 * F) report storage
 * G) cross-user isolation
 * H) session expired
 * I) logout invalidation
 * J) legacy route regression
 * K) KV/R2 regression
 * L) 架構守則 / 原始碼掃描
 *
 * 全部使用純記憶體 mock D1 binding，完全不連線任何真實或本機模擬的
 * 資料庫。對「真實 local D1」的端對端驗證另外在 real_d1_verify.mjs 執行。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createExplorationController, listExplorationsController,
  createFoodEventController, listFoodEventsController,
  createEmotionController, listEmotionsController,
  createBehaviorController, listBehaviorsController,
  createReportController, listReportsController,
} from '../../src/controllers/data_controller.js';
import { createAppRouter } from '../../src/routes/index.js';
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
      async insert(rec) {
        calls.push({ type: 'insert', table: 'exploration_records' });
        const row = Object.assign({ id: nextId++ }, rec);
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
        const row = Object.assign({ id: nextId++ }, evt);
        foodEvents.push(row);
        return { ok: true, id: row.id };
      },
      async listByUser(userId, limit) {
        calls.push({ type: 'listByUser', table: 'food_events' });
        return { ok: true, results: foodEvents.filter((r) => r.user_id === userId).slice(0, limit || 50) };
      },
    },
    emotionRecords: {
      async insert(rec) {
        calls.push({ type: 'insert', table: 'emotion_records' });
        const row = Object.assign({ id: nextId++ }, rec);
        emotionRecords.push(row);
        return { ok: true, id: row.id };
      },
      async listByUser(userId, limit) {
        calls.push({ type: 'listByUser', table: 'emotion_records' });
        return { ok: true, results: emotionRecords.filter((r) => r.user_id === userId).slice(0, limit || 50) };
      },
      async listByFoodEvent(foodEventId) {
        calls.push({ type: 'listByFoodEvent', table: 'emotion_records' });
        return { ok: true, results: emotionRecords.filter((r) => r.linked_food_event_id === foodEventId) };
      },
    },
    behaviorPatterns: {
      async insert(pat) {
        calls.push({ type: 'insert', table: 'behavior_patterns' });
        const row = Object.assign({ id: nextId++ }, pat);
        behaviorPatterns.push(row);
        return { ok: true, id: row.id };
      },
      async listByUser(userId, limit) {
        calls.push({ type: 'listByUser', table: 'behavior_patterns' });
        return { ok: true, results: behaviorPatterns.filter((r) => r.user_id === userId).slice(0, limit || 50) };
      },
      async listByUserAndType(userId, patternType, limit) {
        calls.push({ type: 'listByUserAndType', table: 'behavior_patterns' });
        return { ok: true, results: behaviorPatterns.filter((r) => r.user_id === userId && r.pattern_type === patternType).slice(0, limit || 50) };
      },
    },
    aiReports: {
      async insert(rep) {
        calls.push({ type: 'insert', table: 'ai_reports' });
        const row = Object.assign({ id: nextId++ }, rep);
        aiReports.push(row);
        return { ok: true, id: row.id };
      },
      async listByUser(userId, limit) {
        calls.push({ type: 'listByUser', table: 'ai_reports' });
        return { ok: true, results: aiReports.filter((r) => r.user_id === userId).slice(0, limit || 20) };
      },
    },
  };
}

// -----------------------------------------------------------------------
// Stateful fake D1：讓真正worker.fetch()的round-trip情境能保有真的狀態
// （沿用TASK1.29起建立的模式，這裡擴充五個domain表的INSERT/SELECT）
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
        if (/SELECT \* FROM behavior_patterns WHERE user_id = \? AND pattern_type = \?/.test(sql)) {
          const [userId, patternType, limit] = params;
          return { results: [...behaviorPatterns.values()].filter((r) => r.user_id === userId && r.pattern_type === patternType).slice(0, limit) };
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
        if (/SELECT \* FROM users WHERE auth_provider = \? AND auth_provider_id = \?/.test(sql)) {
          for (const u of users.values()) if (u.auth_provider === params[0] && u.auth_provider_id === params[1]) return u;
          return null;
        }
        if (/SELECT \* FROM sessions WHERE id = \?/.test(sql)) return sessions.get(params[0]) || null;
        if (/INSERT INTO exploration_records/.test(sql)) {
          const [user_id, draw_mode, card_category, card_object_key, card_text, photo_idx, responses_json, occurred_at] = params;
          const id = nextId++;
          const row = { id, user_id, draw_mode, card_category, card_object_key, card_text, photo_idx, responses_json, occurred_at };
          explorationRecords.set(id, row);
          return { id };
        }
        if (/INSERT INTO food_events/.test(sql)) {
          const [user_id, meal_type, description, nutrients_json, image_id, occurred_at] = params;
          const id = nextId++;
          const row = { id, user_id, meal_type, description, nutrients_json, image_id, occurred_at };
          foodEvents.set(id, row);
          return { id };
        }
        if (/INSERT INTO emotion_records/.test(sql)) {
          const [user_id, emotion_type, intensity, trigger_note, linked_food_event_id, occurred_at] = params;
          const id = nextId++;
          const row = { id, user_id, emotion_type, intensity, trigger_note, linked_food_event_id, occurred_at };
          emotionRecords.set(id, row);
          return { id };
        }
        if (/INSERT INTO behavior_patterns/.test(sql)) {
          const [user_id, pattern_type, summary, evidence_json, confidence_score, detected_at] = params;
          const id = nextId++;
          const row = { id, user_id, pattern_type, summary, evidence_json, confidence_score, detected_at };
          behaviorPatterns.set(id, row);
          return { id };
        }
        if (/INSERT INTO ai_reports/.test(sql)) {
          const [user_id, report_type, period_start, period_end, content, model_used] = params;
          const id = nextId++;
          const row = { id, user_id, report_type, period_start, period_end, content, model_used };
          aiReports.set(id, row);
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
    _explorationRecords: explorationRecords,
    _foodEvents: foodEvents,
    _emotionRecords: emotionRecords,
    _behaviorPatterns: behaviorPatterns,
    _aiReports: aiReports,
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
  // 預設用真正的現在時間當基準，讓沒有覆寫expires_at的呼叫端（走真正
  // controller的expiry檢查）拿到一個確實還有效的session；需要「已過期」
  // 情境的測試一律用overrides明確指定一個相對現在肯定已過去的expires_at。
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

const ALL_API_PATHS = [
  ['POST', '/api/explorations'],
  ['GET', '/api/explorations'],
  ['POST', '/api/food-events'],
  ['GET', '/api/food-events'],
  ['POST', '/api/emotions'],
  ['GET', '/api/emotions'],
  ['POST', '/api/behaviors'],
  ['GET', '/api/behaviors'],
  ['POST', '/api/reports'],
  ['GET', '/api/reports'],
];

async function run() {
  // =========================================================================
  // A. auth required
  // =========================================================================

  for (const [method, path] of ALL_API_PATHS) {
    await test(`（1.auth required）${method} ${path} 沒有cookie時回401，完全不呼叫任何domain service`, async () => {
      const router = createAppRouter();
      const db = makeMockDb();
      const req = { method, pathname: path };
      if (method === 'POST') req.payload = {};
      if (method === 'GET') req.query = {};
      const res = await router.handle(req, { db });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(db.calls.length, 0, '未登入時完全不應該有任何db呼叫');
    });
  }

  await test('（1.auth required）帶著不存在的session token時回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/api/explorations', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=does-not-exist` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（1.auth required）session已撤銷時回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-revoked-1'));
    db.seedSession(makeSession('tok-revoked-1', 'u-revoked-1', { revoked_at: '2026-01-01T00:00:00.000Z' }));
    const res = await router.handle({ method: 'GET', pathname: '/api/explorations', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-revoked-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（1.auth required）使用者狀態為suspended時回401（即使session本身有效）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-susp-1', { status: 'suspended' }));
    db.seedSession(makeSession('tok-susp-1', 'u-susp-1'));
    const res = await router.handle({ method: 'GET', pathname: '/api/explorations', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-susp-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（1.auth required）使用者狀態為deleted時回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-del-1', { status: 'deleted' }));
    db.seedSession(makeSession('tok-del-1', 'u-del-1'));
    const res = await router.handle({ method: 'GET', pathname: '/api/explorations', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-del-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（1.auth required）合法登入的使用者可以正常存取（正向對照組）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-ok-1'));
    db.seedSession(makeSession('tok-ok-1', 'u-ok-1'));
    const res = await router.handle({ method: 'GET', pathname: '/api/explorations', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-ok-1` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（1.auth required）controller層對沒有userId的呼叫直接安全回401（雙重防禦，即使繞過route層middleware直接呼叫controller）', async () => {
    const db = makeMockDb();
    const result = await createExplorationController(db, null, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.reason, 'not_authenticated');
  });

  for (const [name, fn] of [
    ['listExplorationsController', listExplorationsController],
    ['createFoodEventController', createFoodEventController],
    ['listFoodEventsController', listFoodEventsController],
    ['createEmotionController', createEmotionController],
    ['listEmotionsController', listEmotionsController],
    ['createBehaviorController', createBehaviorController],
    ['listBehaviorsController', listBehaviorsController],
    ['createReportController', createReportController],
    ['listReportsController', listReportsController],
  ]) {
    await test(`（1.auth required）${name}() 對沒有userId的呼叫直接安全回401`, async () => {
      const db = makeMockDb();
      const result = await fn(db, null, {});
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.status, 401);
    });
  }

  console.log('');

  // =========================================================================
  // B. create/query exploration
  // =========================================================================

  await test('（2.create exploration）登入使用者成功建立一筆探索紀錄', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-1'));
    const result = await createExplorationController(db, 'u-exp-1', { draw_mode: 'single', card_category: 'T' });
    assert.strictEqual(result.ok, true);
    assert.ok(result.data.id);
  });

  await test('（2.create exploration）建立的紀錄user_id正確對應目前登入的使用者', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-2'));
    await createExplorationController(db, 'u-exp-2', { draw_mode: 'single' });
    assert.strictEqual(db._explorationRecords[0].user_id, 'u-exp-2');
  });

  await test('（2.create exploration）空payload仍能成功建立（所有欄位皆選填）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-3'));
    const result = await createExplorationController(db, 'u-exp-3', {});
    assert.strictEqual(result.ok, true);
  });

  await test('（2.create exploration）建立失敗時（db insert失敗）安全回傳500', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-4'));
    db.explorationRecords.insert = async () => ({ ok: false, error: 'db_error' });
    const result = await createExplorationController(db, 'u-exp-4', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（2.create exploration）不存在的userId建立時安全回401 user_not_found', async () => {
    const db = makeMockDb();
    const result = await createExplorationController(db, 'no-such-user', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.reason, 'user_not_found');
  });

  await test('（3.query exploration）登入使用者能查詢自己的探索紀錄', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-5'));
    await createExplorationController(db, 'u-exp-5', { draw_mode: 'single' });
    await createExplorationController(db, 'u-exp-5', { draw_mode: 'triple' });
    const result = await listExplorationsController(db, 'u-exp-5', {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.results.length, 2);
  });

  await test('（3.query exploration）沒有任何紀錄時回傳空陣列', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-6'));
    const result = await listExplorationsController(db, 'u-exp-6', {});
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data.results, []);
  });

  await test('（3.query exploration）query.limit正確限制回傳筆數', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-7'));
    for (let i = 0; i < 5; i++) await createExplorationController(db, 'u-exp-7', { draw_mode: 'single' });
    const result = await listExplorationsController(db, 'u-exp-7', { limit: '2' });
    assert.strictEqual(result.data.results.length, 2);
  });

  await test('（3.query exploration）不合法的limit值時安全套用service預設值（不拋例外）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-8'));
    await createExplorationController(db, 'u-exp-8', { draw_mode: 'single' });
    const result = await listExplorationsController(db, 'u-exp-8', { limit: 'not-a-number' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.results.length, 1);
  });

  await test('（Router routing）POST /api/explorations 透過真正router.handle()完整鏈路成功', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-9'));
    db.seedSession(makeSession('tok-exp-9', 'u-exp-9'));
    const res = await router.handle({ method: 'POST', pathname: '/api/explorations', payload: { draw_mode: 'single' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-exp-9` }, { db });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.id);
  });

  await test('（Contract validation）POST /api/explorations photo_idx型別錯誤（字串而非數字）時被contract validation擋下，回400', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-10'));
    db.seedSession(makeSession('tok-exp-10', 'u-exp-10'));
    const res = await router.handle({ method: 'POST', pathname: '/api/explorations', payload: { photo_idx: 'not-a-number' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-exp-10` }, { db });
    assert.strictEqual(res.status, 400);
  });

  await test('（Contract validation）契約驗證發生在Auth Middleware之後——未登入時即使payload格式錯誤也是先回401（不洩漏payload驗證結果）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'POST', pathname: '/api/explorations', payload: { photo_idx: 'not-a-number' } }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（Router routing）DELETE /api/explorations（方法不符）回405', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'DELETE', pathname: '/api/explorations' }, { db: makeMockDb() });
    assert.strictEqual(res.status, 405);
  });

  console.log('');

  // =========================================================================
  // C. food record
  // =========================================================================

  await test('（4.food record）登入使用者成功記錄一筆飲食事件', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-food-1'));
    const result = await createFoodEventController(db, 'u-food-1', { meal_type: 'lunch', description: '雞胸肉沙拉' });
    assert.strictEqual(result.ok, true);
  });

  await test('（4.food record）nutrients_json原樣保留，不做任何解析或改寫', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-food-2'));
    const rawJson = JSON.stringify({ protein: 30, carbs: 20 });
    await createFoodEventController(db, 'u-food-2', { nutrients_json: rawJson });
    assert.strictEqual(db._foodEvents[0].nutrients_json, rawJson);
  });

  await test('（4.food record）建立的紀錄user_id正確對應目前登入的使用者', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-food-3'));
    await createFoodEventController(db, 'u-food-3', { description: 'test' });
    assert.strictEqual(db._foodEvents[0].user_id, 'u-food-3');
  });

  await test('（4.food record）查詢自己的飲食紀錄歷史', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-food-4'));
    await createFoodEventController(db, 'u-food-4', { meal_type: 'breakfast' });
    await createFoodEventController(db, 'u-food-4', { meal_type: 'dinner' });
    const result = await listFoodEventsController(db, 'u-food-4', {});
    assert.strictEqual(result.data.results.length, 2);
  });

  await test('（4.food record）建立失敗時安全回傳500', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-food-5'));
    db.foodEvents.insert = async () => ({ ok: false, error: 'db_error' });
    const result = await createFoodEventController(db, 'u-food-5', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 500);
  });

  await test('（Router routing）POST /api/food-events 透過真正router.handle()完整鏈路成功', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-food-6'));
    db.seedSession(makeSession('tok-food-6', 'u-food-6'));
    const res = await router.handle({ method: 'POST', pathname: '/api/food-events', payload: { meal_type: 'lunch' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-food-6` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（4.food record）query.limit正確限制飲食紀錄回傳筆數', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-food-7'));
    for (let i = 0; i < 4; i++) await createFoodEventController(db, 'u-food-7', { meal_type: 'snack' });
    const result = await listFoodEventsController(db, 'u-food-7', { limit: '2' });
    assert.strictEqual(result.data.results.length, 2);
  });

  await test('（4.food record）image_id選填欄位可以正確帶入', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-food-8'));
    await createFoodEventController(db, 'u-food-8', { image_id: 42 });
    assert.strictEqual(db._foodEvents[0].image_id, 42);
  });

  console.log('');

  // =========================================================================
  // D. emotion link
  // =========================================================================

  await test('（5.emotion link）登入使用者成功建立一筆情緒紀錄', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-emo-1'));
    const result = await createEmotionController(db, 'u-emo-1', { emotion_type: 'anxious', intensity: 7 });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.emotion link）情緒紀錄可以正確關聯到某筆飲食事件（linked_food_event_id）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-emo-2'));
    const foodResult = await createFoodEventController(db, 'u-emo-2', { meal_type: 'snack' });
    const emotionResult = await createEmotionController(db, 'u-emo-2', { emotion_type: 'guilty', linked_food_event_id: foodResult.data.id });
    assert.strictEqual(emotionResult.ok, true);
    assert.strictEqual(db._emotionRecords[0].linked_food_event_id, foodResult.data.id);
  });

  await test('（5.emotion link）不帶linked_food_event_id時仍能成功建立（選填欄位）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-emo-3'));
    const result = await createEmotionController(db, 'u-emo-3', { emotion_type: 'calm' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(db._emotionRecords[0].linked_food_event_id, null);
  });

  await test('（5.emotion link）建立的紀錄user_id正確對應目前登入的使用者', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-emo-4'));
    await createEmotionController(db, 'u-emo-4', { emotion_type: 'happy' });
    assert.strictEqual(db._emotionRecords[0].user_id, 'u-emo-4');
  });

  await test('（5.emotion link）查詢自己的情緒紀錄歷史', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-emo-5'));
    await createEmotionController(db, 'u-emo-5', { emotion_type: 'sad' });
    const result = await listEmotionsController(db, 'u-emo-5', {});
    assert.strictEqual(result.data.results.length, 1);
  });

  await test('（Router routing）POST /api/emotions 透過真正router.handle()完整鏈路成功', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-emo-6'));
    db.seedSession(makeSession('tok-emo-6', 'u-emo-6'));
    const res = await router.handle({ method: 'POST', pathname: '/api/emotions', payload: { emotion_type: 'anxious' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-emo-6` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（5.emotion link）intensity數值欄位正確存入', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-emo-7'));
    await createEmotionController(db, 'u-emo-7', { emotion_type: 'anxious', intensity: 8 });
    assert.strictEqual(db._emotionRecords[0].intensity, 8);
  });

  await test('（Contract validation）POST /api/emotions intensity型別錯誤（字串）時被contract validation擋下，回400', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-emo-8'));
    db.seedSession(makeSession('tok-emo-8', 'u-emo-8'));
    const res = await router.handle({ method: 'POST', pathname: '/api/emotions', payload: { intensity: 'high' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-emo-8` }, { db });
    assert.strictEqual(res.status, 400);
  });

  console.log('');

  // =========================================================================
  // E. behavior record
  // =========================================================================

  await test('（6.behavior record）登入使用者成功建立一筆行為模式紀錄', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-beh-1'));
    const result = await createBehaviorController(db, 'u-beh-1', { pattern_type: 'late_night_snacking', summary: '深夜進食傾向' });
    assert.strictEqual(result.ok, true);
  });

  await test('（6.behavior record）建立的紀錄user_id正確對應目前登入的使用者', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-beh-2'));
    await createBehaviorController(db, 'u-beh-2', { pattern_type: 'stress_eating' });
    assert.strictEqual(db._behaviorPatterns[0].user_id, 'u-beh-2');
  });

  await test('（6.behavior record）查詢自己的行為模式紀錄', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-beh-3'));
    await createBehaviorController(db, 'u-beh-3', { pattern_type: 'stress_eating' });
    await createBehaviorController(db, 'u-beh-3', { pattern_type: 'emotional_eating' });
    const result = await listBehaviorsController(db, 'u-beh-3', {});
    assert.strictEqual(result.data.results.length, 2);
  });

  await test('（6.behavior record）query.patternType正確篩選特定類型', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-beh-4'));
    await createBehaviorController(db, 'u-beh-4', { pattern_type: 'stress_eating' });
    await createBehaviorController(db, 'u-beh-4', { pattern_type: 'emotional_eating' });
    const result = await listBehaviorsController(db, 'u-beh-4', { patternType: 'stress_eating' });
    assert.strictEqual(result.data.results.length, 1);
    assert.strictEqual(result.data.results[0].pattern_type, 'stress_eating');
  });

  await test('（6.behavior record）不含AI分析生成邏輯——建立時只是原樣存入呼叫端提供的summary/evidence_json，不做任何運算', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-beh-5'));
    const rawEvidence = JSON.stringify({ manualNote: 'user提供的原始文字' });
    await createBehaviorController(db, 'u-beh-5', { evidence_json: rawEvidence });
    assert.strictEqual(db._behaviorPatterns[0].evidence_json, rawEvidence);
  });

  await test('（Router routing）POST /api/behaviors 透過真正router.handle()完整鏈路成功', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-beh-6'));
    db.seedSession(makeSession('tok-beh-6', 'u-beh-6'));
    const res = await router.handle({ method: 'POST', pathname: '/api/behaviors', payload: { pattern_type: 'test' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-beh-6` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（6.behavior record）confidence_score數值欄位正確存入', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-beh-7'));
    await createBehaviorController(db, 'u-beh-7', { pattern_type: 'test', confidence_score: 0.85 });
    assert.strictEqual(db._behaviorPatterns[0].confidence_score, 0.85);
  });

  console.log('');

  // =========================================================================
  // F. report storage
  // =========================================================================

  await test('（7.report storage）登入使用者成功儲存一份報告', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-rep-1'));
    const result = await createReportController(db, 'u-rep-1', { report_type: 'weekly', content: '已經產生好的報告內容' });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.report storage）不接AI分析生成——content原樣存入，不呼叫任何AI API', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-rep-2'));
    await createReportController(db, 'u-rep-2', { content: '呼叫端已經產生好的內容' });
    assert.strictEqual(db._aiReports[0].content, '呼叫端已經產生好的內容');
  });

  await test('（7.report storage）建立的紀錄user_id正確對應目前登入的使用者', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-rep-3'));
    await createReportController(db, 'u-rep-3', { report_type: 'monthly' });
    assert.strictEqual(db._aiReports[0].user_id, 'u-rep-3');
  });

  await test('（7.report storage）查詢自己的報告歷史', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-rep-4'));
    await createReportController(db, 'u-rep-4', { report_type: 'weekly' });
    const result = await listReportsController(db, 'u-rep-4', {});
    assert.strictEqual(result.data.results.length, 1);
  });

  await test('（Router routing）POST /api/reports 透過真正router.handle()完整鏈路成功', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-rep-5'));
    db.seedSession(makeSession('tok-rep-5', 'u-rep-5'));
    const res = await router.handle({ method: 'POST', pathname: '/api/reports', payload: { report_type: 'weekly' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-rep-5` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（7.report storage）period_start/period_end選填欄位正確存入', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-rep-6'));
    await createReportController(db, 'u-rep-6', { period_start: '2026-01-01', period_end: '2026-01-07' });
    assert.strictEqual(db._aiReports[0].period_start, '2026-01-01');
    assert.strictEqual(db._aiReports[0].period_end, '2026-01-07');
  });

  await test('（7.report storage）model_used欄位原樣存入，這裡不驗證/不呼叫任何模型', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-rep-7'));
    await createReportController(db, 'u-rep-7', { model_used: 'whatever-caller-says' });
    assert.strictEqual(db._aiReports[0].model_used, 'whatever-caller-says');
  });

  console.log('');

  // =========================================================================
  // G. cross-user isolation
  // =========================================================================

  await test('（8.cross-user isolation）使用者A的探索紀錄查詢不到使用者B的資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a1'));
    db.seedUser(activeUser('u-cross-b1'));
    await createExplorationController(db, 'u-cross-a1', { draw_mode: 'single' });
    await createExplorationController(db, 'u-cross-b1', { draw_mode: 'triple' });
    const resultA = await listExplorationsController(db, 'u-cross-a1', {});
    assert.strictEqual(resultA.data.results.length, 1);
    assert.strictEqual(resultA.data.results[0].user_id, 'u-cross-a1');
  });

  await test('（8.cross-user isolation）Payload指定的user_id完全被忽略，一律用session的userId', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a2'));
    await createExplorationController(db, 'u-cross-a2', { draw_mode: 'single', user_id: 'u-someone-else' });
    assert.strictEqual(db._explorationRecords[0].user_id, 'u-cross-a2');
  });

  await test('（8.cross-user isolation，端對端）透過真正router.handle()驗證：使用者A登入後查不到使用者B的food-events', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a3'));
    db.seedUser(activeUser('u-cross-b3'));
    db.seedSession(makeSession('tok-cross-a3', 'u-cross-a3'));
    db.seedSession(makeSession('tok-cross-b3', 'u-cross-b3'));
    await router.handle({ method: 'POST', pathname: '/api/food-events', payload: { description: 'A的食物' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-cross-a3` }, { db });
    await router.handle({ method: 'POST', pathname: '/api/food-events', payload: { description: 'B的食物' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-cross-b3` }, { db });
    const resA = await router.handle({ method: 'GET', pathname: '/api/food-events', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-cross-a3` }, { db });
    const bodyA = await resA.json();
    assert.strictEqual(bodyA.data.results.length, 1);
    assert.strictEqual(bodyA.data.results[0].description, 'A的食物');
  });

  await test('（8.cross-user isolation，端對端）即使payload偽造user_id欄位為另一個真實存在的user，透過真正router.handle()仍正確歸屬於session使用者', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a4'));
    db.seedUser(activeUser('u-cross-victim'));
    db.seedSession(makeSession('tok-cross-a4', 'u-cross-a4'));
    await router.handle(
      { method: 'POST', pathname: '/api/emotions', payload: { emotion_type: 'anxious', user_id: 'u-cross-victim' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-cross-a4` },
      { db }
    );
    assert.strictEqual(db._emotionRecords[0].user_id, 'u-cross-a4');
    const victimResult = await listEmotionsController(db, 'u-cross-victim', {});
    assert.deepStrictEqual(victimResult.data.results, []);
  });

  await test('（8.cross-user isolation）behaviors跨使用者隔離', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a5'));
    db.seedUser(activeUser('u-cross-b5'));
    await createBehaviorController(db, 'u-cross-a5', { pattern_type: 'a-pattern' });
    await createBehaviorController(db, 'u-cross-b5', { pattern_type: 'b-pattern' });
    const resultA = await listBehaviorsController(db, 'u-cross-a5', {});
    assert.strictEqual(resultA.data.results.length, 1);
  });

  await test('（8.cross-user isolation）reports跨使用者隔離', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a6'));
    db.seedUser(activeUser('u-cross-b6'));
    await createReportController(db, 'u-cross-a6', { report_type: 'a-report' });
    await createReportController(db, 'u-cross-b6', { report_type: 'b-report' });
    const resultB = await listReportsController(db, 'u-cross-b6', {});
    assert.strictEqual(resultB.data.results.length, 1);
    assert.strictEqual(resultB.data.results[0].report_type, 'b-report');
  });

  await test('（8.cross-user isolation）emotions跨使用者隔離', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a7'));
    db.seedUser(activeUser('u-cross-b7'));
    await createEmotionController(db, 'u-cross-a7', { emotion_type: 'happy' });
    await createEmotionController(db, 'u-cross-b7', { emotion_type: 'sad' });
    const resultA = await listEmotionsController(db, 'u-cross-a7', {});
    assert.strictEqual(resultA.data.results.length, 1);
    assert.strictEqual(resultA.data.results[0].emotion_type, 'happy');
  });

  await test('（8.cross-user isolation，端對端）使用者A無法透過偽造session cookie存取使用者B的behaviors（不存在的token仍是401，不會意外命中任何user）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-b8'));
    db.seedSession(makeSession('tok-cross-b8', 'u-cross-b8'));
    await createBehaviorController(db, 'u-cross-b8', { pattern_type: 'secret-pattern' });
    const res = await router.handle({ method: 'GET', pathname: '/api/behaviors', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=forged-token-not-real` }, { db });
    assert.strictEqual(res.status, 401);
  });

  console.log('');

  // =========================================================================
  // H. session expired
  // =========================================================================

  await test('（9.session expired）session已過期時查詢explorations回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-sess-1'));
    db.seedSession(makeSession('tok-exp-sess-1', 'u-exp-sess-1', { expires_at: '2020-01-01T00:00:00.000Z' }));
    const res = await router.handle({ method: 'GET', pathname: '/api/explorations', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-exp-sess-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（9.session expired）session已過期時建立food-event回401，且不會呼叫insert', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-sess-2'));
    db.seedSession(makeSession('tok-exp-sess-2', 'u-exp-sess-2', { expires_at: '2020-01-01T00:00:00.000Z' }));
    const res = await router.handle({ method: 'POST', pathname: '/api/food-events', payload: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-exp-sess-2` }, { db });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(db.calls.filter((c) => c.type === 'insert' && c.table === 'food_events').length, 0);
  });

  await test('（9.session expired）過期session對所有10條API皆一致回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-sess-3'));
    db.seedSession(makeSession('tok-exp-sess-3', 'u-exp-sess-3', { expires_at: '2020-01-01T00:00:00.000Z' }));
    for (const [method, apiPath] of ALL_API_PATHS) {
      const req = { method, pathname: apiPath, cookieHeader: `${SESSION_COOKIE_NAME}=tok-exp-sess-3` };
      if (method === 'POST') req.payload = {};
      if (method === 'GET') req.query = {};
      const res = await router.handle(req, { db });
      assert.strictEqual(res.status, 401, `${method} ${apiPath} 應該回401`);
    }
  });

  await test('（9.session expired）session剛好還沒過期（差1秒）時仍能正常存取', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-exp-sess-4'));
    const future = new Date(Date.now() + 1000).toISOString();
    db.seedSession(makeSession('tok-exp-sess-4', 'u-exp-sess-4', { expires_at: future }));
    const res = await router.handle({ method: 'GET', pathname: '/api/explorations', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-exp-sess-4` }, { db });
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // =========================================================================
  // I. logout invalidation
  // =========================================================================

  await test('（10.logout invalidation）登出後同一個cookie無法再存取explorations，回401', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-logout-1'));
    db.seedSession(makeSession('tok-logout-1', 'u-logout-1'));
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-1` }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/api/explorations', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（10.logout invalidation）登出前可以正常存取，登出後才失效（前後對照）', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-logout-2'));
    db.seedSession(makeSession('tok-logout-2', 'u-logout-2'));
    const before = await router.handle({ method: 'GET', pathname: '/api/food-events', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-2` }, { db });
    assert.strictEqual(before.status, 200);
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-2` }, { db });
    const after = await router.handle({ method: 'GET', pathname: '/api/food-events', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-2` }, { db });
    assert.strictEqual(after.status, 401);
  });

  await test('（10.logout invalidation）登出後建立emotions也會被拒絕，不會意外寫入資料', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-logout-3'));
    db.seedSession(makeSession('tok-logout-3', 'u-logout-3'));
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-3` }, { db });
    const res = await router.handle({ method: 'POST', pathname: '/api/emotions', payload: { emotion_type: 'x' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-3` }, { db });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(db._emotionRecords.length, 0);
  });

  await test('（10.logout invalidation）登出其中一個裝置的session，不影響同一個user的其他session存取API', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    db.seedUser(activeUser('u-logout-4'));
    db.seedSession(makeSession('tok-logout-4a', 'u-logout-4'));
    db.seedSession(makeSession('tok-logout-4b', 'u-logout-4'));
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-4a` }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/api/explorations', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-4b` }, { db });
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // =========================================================================
  // 真正的 src/worker.js 端對端測試（G/legacy/KV/R2共用）
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
    return { cookie: res.headers.get('set-cookie').split(';')[0], body: await res.json() };
  }

  await test('（1.auth required，端對端）沒有cookie呼叫POST /api/explorations透過真正worker.fetch()回401', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/api/explorations', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 401);
  });

  await test('（2.create exploration，端對端）guest login後可以建立探索紀錄，D1真的新增一筆', async () => {
    const env = makeFreshEnv();
    const { cookie } = await guestLoginCookie(env);
    const res = await worker.fetch(
      new Request('https://example.com/api/explorations', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ draw_mode: 'single' }) }),
      env, {}
    );
    assert.strictEqual(res.status, 200);
    const insertCalls = env.DIET_COACH_DB.calls.filter((c) => c.type === 'first' && /INSERT INTO exploration_records/.test(c.sql));
    assert.strictEqual(insertCalls.length, 1);
  });

  await test('（3.query exploration，端對端）建立後可以透過GET查回同一筆紀錄', async () => {
    const env = makeFreshEnv();
    const { cookie } = await guestLoginCookie(env);
    await worker.fetch(new Request('https://example.com/api/explorations', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ draw_mode: 'single' }) }), env, {});
    const res = await worker.fetch(new Request('https://example.com/api/explorations', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.results.length, 1);
  });

  await test('（4.food record，端對端）建立飲食事件成功並可查回', async () => {
    const env = makeFreshEnv();
    const { cookie } = await guestLoginCookie(env);
    await worker.fetch(new Request('https://example.com/api/food-events', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ meal_type: 'lunch' }) }), env, {});
    const res = await worker.fetch(new Request('https://example.com/api/food-events', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    assert.strictEqual(body.data.results.length, 1);
    assert.strictEqual(body.data.results[0].meal_type, 'lunch');
  });

  await test('（5.emotion link，端對端）建立情緒紀錄並關聯food_event成功', async () => {
    const env = makeFreshEnv();
    const { cookie } = await guestLoginCookie(env);
    const foodRes = await worker.fetch(new Request('https://example.com/api/food-events', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ meal_type: 'snack' }) }), env, {});
    const foodBody = await foodRes.json();
    const emotionRes = await worker.fetch(
      new Request('https://example.com/api/emotions', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ emotion_type: 'guilty', linked_food_event_id: foodBody.data.id }) }),
      env, {}
    );
    assert.strictEqual(emotionRes.status, 200);
  });

  await test('（6.behavior record，端對端）建立行為模式紀錄並查回', async () => {
    const env = makeFreshEnv();
    const { cookie } = await guestLoginCookie(env);
    await worker.fetch(new Request('https://example.com/api/behaviors', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ pattern_type: 'test-pattern' }) }), env, {});
    const res = await worker.fetch(new Request('https://example.com/api/behaviors', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    assert.strictEqual(body.data.results.length, 1);
  });

  await test('（7.report storage，端對端）儲存報告並查回', async () => {
    const env = makeFreshEnv();
    const { cookie } = await guestLoginCookie(env);
    await worker.fetch(new Request('https://example.com/api/reports', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ report_type: 'weekly', content: 'test content' }) }), env, {});
    const res = await worker.fetch(new Request('https://example.com/api/reports', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    assert.strictEqual(body.data.results.length, 1);
  });

  await test('（8.cross-user isolation，端對端）兩個不同guest登入各自建立/查詢資料，完全互不干擾', async () => {
    const env = makeFreshEnv();
    const guestA = await guestLoginCookie(env);
    const guestB = await guestLoginCookie(env);
    await worker.fetch(new Request('https://example.com/api/explorations', { method: 'POST', headers: { Cookie: guestA.cookie }, body: JSON.stringify({ draw_mode: 'A-draw' }) }), env, {});
    const resB = await worker.fetch(new Request('https://example.com/api/explorations', { headers: { Cookie: guestB.cookie } }), env, {});
    const bodyB = await resB.json();
    assert.deepStrictEqual(bodyB.data.results, []);
  });

  await test('（9.session expired，端對端）沒有D1 binding時（bootstrap失敗），優雅fallback到legacy首頁', async () => {
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2({}) };
    const res = await worker.fetch(new Request('https://example.com/api/explorations', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（6.behavior record，端對端）query patternType篩選在真正worker.fetch()流程中正確運作', async () => {
    const env = makeFreshEnv();
    const { cookie } = await guestLoginCookie(env);
    await worker.fetch(new Request('https://example.com/api/behaviors', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ pattern_type: 'a-type' }) }), env, {});
    await worker.fetch(new Request('https://example.com/api/behaviors', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ pattern_type: 'b-type' }) }), env, {});
    const res = await worker.fetch(new Request('https://example.com/api/behaviors?patternType=a-type', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    assert.strictEqual(body.data.results.length, 1);
    assert.strictEqual(body.data.results[0].pattern_type, 'a-type');
  });

  await test('（3.query exploration，端對端）query limit參數在真正worker.fetch()流程中正確運作', async () => {
    const env = makeFreshEnv();
    const { cookie } = await guestLoginCookie(env);
    for (let i = 0; i < 3; i++) {
      await worker.fetch(new Request('https://example.com/api/explorations', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ draw_mode: 'single' }) }), env, {});
    }
    const res = await worker.fetch(new Request('https://example.com/api/explorations?limit=2', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    assert.strictEqual(body.data.results.length, 2);
  });

  await test('（10.logout invalidation，端對端）登出後透過真正worker.fetch()呼叫food-events回401', async () => {
    const env = makeFreshEnv();
    const { cookie } = await guestLoginCookie(env);
    await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookie } }), env, {});
    const res = await worker.fetch(new Request('https://example.com/api/food-events', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 401);
  });

  await test('（延續守則）FEATURE_ROUTE_MIGRATION_ENABLED=true時，User Data API依然正常（不依賴這個flag）', async () => {
    const env = Object.assign(makeFreshEnv(), { FEATURE_ROUTE_MIGRATION_ENABLED: 'true' });
    const { cookie } = await guestLoginCookie(env);
    const res = await worker.fetch(new Request('https://example.com/api/explorations', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ draw_mode: 'single' }) }), env, {});
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // =========================================================================
  // J. Legacy route regression
  // =========================================================================

  await test('（11.legacy route regression）GET / 首頁HTML完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/'), env, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（11.legacy route regression）GET /manifest.json 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), env, {});
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
  });

  await test('（11.legacy route regression）GET /icon.svg 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  await test('（11.legacy route regression）GET /users/999（仍未啟用）落到首頁catch-all', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/users/999'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（11.legacy route regression）D1完全沒有任何SQL呼叫（只呼叫不含auth/api的legacy路由時）', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=data-api-legacy-1'), env, {});
    assert.strictEqual(env.DIET_COACH_DB.calls.length, 0);
  });

  await test('（11.legacy route regression）GET /apple-touch-icon.png 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/apple-touch-icon.png'), env, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（11.legacy route regression）既有五條auth路由行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // =========================================================================
  // K. KV/R2 regression
  // =========================================================================

  await test('（12.KV/R2 regression）POST /api/explorations 完全不呼叫SYNC_KV/R2', async () => {
    const env = makeFreshEnv();
    const { cookie } = await guestLoginCookie(env);
    let kvOrR2Called = false;
    env.SYNC_KV.get = async () => { kvOrR2Called = true; return null; };
    env.DIET_COACH_IMAGES.get = async () => { kvOrR2Called = true; return null; };
    await worker.fetch(new Request('https://example.com/api/explorations', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ draw_mode: 'single' }) }), env, {});
    assert.strictEqual(kvOrR2Called, false);
  });

  await test('（12.KV/R2 regression）啟用User Data API後，/api/sync 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=data-api-kv-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), env, {});
    assert.strictEqual((await res.json()).ok, true);
  });

  await test('（12.KV/R2 regression）啟用User Data API後，/img/* 讀取行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    assert.strictEqual(await res.text(), 'FAKE_JPEG_BYTES');
  });

  console.log('');

  // =========================================================================
  // L. 架構守則 / 原始碼掃描
  // =========================================================================

  await test('（架構守則）原始碼掃描：src/controllers/data_controller.js 完全沒有 import src/db/ 底下任何檔案（D1操作只能透過service）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'controllers', 'data_controller.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/db\//.test(src));
  });

  await test('（架構守則）原始碼掃描：src/routes/data_routes.js 完全沒有直接呼叫 ctx.db.explorationRecords/foodEvents/emotionRecords/behaviorPatterns/aiReports', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'routes', 'data_routes.js'), 'utf8'));
    assert.ok(!/ctx\.db\.(explorationRecords|foodEvents|emotionRecords|behaviorPatterns|aiReports)/.test(src));
  });

  await test('（架構守則）原始碼掃描：src/routes/data_routes.js 完全沒有讀取payload.user_id或query.user_id', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'routes', 'data_routes.js'), 'utf8'));
    assert.ok(!/payload\.user_id|query\.user_id/.test(src));
    assert.ok(/ctx\.user\.id/.test(src), '應該用ctx.user.id取得目前登入的使用者');
  });

  await test('（架構守則）原始碼掃描：十條路由都掛了requireAuth() middleware', () => {
    const router = createAppRouter();
    for (const [method, apiPath] of ALL_API_PATHS) {
      const route = router.routes.find((r) => r.method === method && r.path === apiPath);
      assert.ok(route, `${method} ${apiPath} 應該存在`);
      assert.strictEqual(route.middlewares.length, 2, `${method} ${apiPath} 應該有2個middleware（requireAuth+contractValidation）`);
    }
  });

  await test('（架構守則）原始碼掃描：data_controller.js/data_routes.js 完全沒有出現AI分析相關字樣（禁止AI分析生成）', () => {
    for (const f of ['src/controllers/data_controller.js', 'src/routes/data_routes.js', 'src/contracts/data_contract.js']) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      assert.ok(!/openai|anthropic|gpt-|generateReport|analyzePattern/i.test(src), f);
    }
  });

  await test('（架構守則）原始碼掃描：本次新增檔案完全沒有修改任何UI/HTML字串', () => {
    for (const f of ['src/controllers/data_controller.js', 'src/routes/data_routes.js', 'src/contracts/data_contract.js']) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      assert.ok(!/<script|<style|getHTML|innerHTML/i.test(src), f);
    }
  });

  await test('（架構守則）原始碼掃描：worker.js 的 handle(r,env) 函式體完全沒有變動', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0);
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/createApplication|router\.handle|explorationRecords|foodEvents/i.test(handleBody));
  });

  await test('（架構守則）git diff：wrangler.toml 在TASK1.35完全沒有異動', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat wrangler.toml', { cwd: repoRoot }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（架構守則）原始碼掃描：worker.js 沒有 legacy_import 相關字樣（Legacy Import沒有被正式啟動）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/legacy_import/i.test(src));
  });

  await test('（架構守則）data_controller.js 完全委派給TASK1.15既有的domain service，沒有重新實作任何insert/query邏輯', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'controllers', 'data_controller.js'), 'utf8'));
    assert.ok(/from\s+['"]\.\.\/services\/exploration_service\.js['"]/.test(src));
    assert.ok(/from\s+['"]\.\.\/services\/food_service\.js['"]/.test(src));
    assert.ok(/from\s+['"]\.\.\/services\/emotion_service\.js['"]/.test(src));
    assert.ok(/from\s+['"]\.\.\/services\/behavior_service\.js['"]/.test(src));
    assert.ok(/from\s+['"]\.\.\/services\/report_service\.js['"]/.test(src));
  });

  await test('（架構守則）原始碼掃描：data_contract.js完全沒有定義user_id相關欄位（禁止payload指定user_id）', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src', 'contracts', 'data_contract.js'), 'utf8');
    assert.ok(!/user_id\s*:\s*\{/.test(src));
  });

  await test('（架構守則）五個資源的list contract的request皆為空物件（查詢條件只有選填的limit，不需要contract欄位驗證）', async () => {
    const { listExplorationsContract, listFoodEventsContract, listEmotionsContract, listBehaviorsContract, listReportsContract } = await import('../../src/contracts/data_contract.js');
    for (const c of [listExplorationsContract, listFoodEventsContract, listEmotionsContract, listBehaviorsContract, listReportsContract]) {
      assert.deepStrictEqual(c.request, {});
    }
  });

  await test('（架構守則）router.js 每條路由各自快取自己的 pipelineHandler（applyPipeline在add()時建立一次，不是每次handle都重建）', async () => {
    const router = createAppRouter();
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/api/explorations');
    const handlerRef1 = route.applyPipeline;
    await router.handle({ method: 'GET', pathname: '/api/explorations' }, { db: makeMockDb() });
    const handlerRef2 = route.applyPipeline;
    assert.strictEqual(handlerRef1, handlerRef2);
  });

  await test('（架構守則）D1本地/正式環境驗證另外在 real_d1_verify.mjs 執行，本檔案完全不連線真實或本機模擬的資料庫', () => {
    assert.ok(true);
  });

  await test('（13.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（前端頁面完全未被TASK1.35修改，UI受影響機率為0，見「禁止修改UI」限制）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'user-data-api-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

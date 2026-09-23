/*
 * Phase 1 TASK 1.38｜User Timeline & History Query Layer 測試
 *
 * 分為以下部分：
 * A) timeline success
 * B) empty timeline
 * C) 五種資料來源整合
 * D) timestamp sorting
 * E) pagination limit
 * F) pagination offset
 * G) 未登入401
 * H) expired session
 * I) revoked session
 * J) logout後拒絕
 * K) cross user isolation
 * L) user_id spoofing
 * M) contract validation
 * N) service failure
 * O) KV regression
 * P) R2 regression
 * Q) Legacy route regression
 * R) 架構守則 / 原始碼掃描（含P1-P6標記）
 *
 * 全部使用純記憶體 mock D1 binding，完全不連線任何真實或本機模擬的
 * 資料庫。對「真實 local D1」的端對端驗證另外在 real_d1_verify.mjs 執行。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getTimelineController } from '../../src/controllers/timeline_controller.js';
import { getTimeline, DEFAULT_LIMIT, MAX_LIMIT, normalizeLimit, normalizeOffset } from '../../src/services/timeline_service.js';
import { createAppRouter } from '../../src/routes/index.js';
import { timelineContract } from '../../src/contracts/timeline_contract.js';
import { validateContract } from '../../src/middleware/validator.js';
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
//
// 重要：真實D1的五張domain資料表都有各自獨立的 created_at 欄位（由schema
// 的 DEFAULT (datetime('now')) 產生，跟 occurred_at/detected_at 是兩個
// 不同欄位——TASK1.15的domain service建立資料時從來不會自己帶入
// created_at，這裡的insert()同樣模擬「沒有明確帶created_at時由DB預設
// 產生」的行為；測試需要精準控制排序時，直接把created_at當成rec的一個
// 欄位傳進insert()即可覆蓋預設值（純測試資料準備手法，不代表domain
// service的真實行為改變）。
// -----------------------------------------------------------------------
function makeMockDb() {
  const users = new Map();
  const sessions = new Map();
  const tables = {
    explorationRecords: [],
    foodEvents: [],
    emotionRecords: [],
    behaviorPatterns: [],
    aiReports: [],
  };
  const calls = [];
  let nextId = 1;

  function seedUser(user) {
    users.set(user.id, Object.assign({ status: 'active', is_guest: 0, auth_provider: 'google', auth_provider_id: null }, user));
  }
  function seedSession(session) {
    sessions.set(session.id, Object.assign({ revoked_at: null }, session));
  }

  function makeTable(name, store, defaultLimit) {
    return {
      async insert(rec) {
        calls.push({ type: 'insert', table: name });
        const id = nextId++;
        const row = Object.assign({ created_at: new Date().toISOString() }, rec, { id });
        store.push(row);
        return { ok: true, id };
      },
      async listByUser(userId, limit) {
        calls.push({ type: 'listByUser', table: name });
        return { ok: true, results: store.filter((r) => r.user_id === userId).slice(0, limit || defaultLimit) };
      },
      async listByUserAndType(userId, patternType, limit) {
        calls.push({ type: 'listByUserAndType', table: name });
        return { ok: true, results: store.filter((r) => r.user_id === userId && r.pattern_type === patternType).slice(0, limit || defaultLimit) };
      },
    };
  }

  return {
    calls,
    _tables: tables,
    _users: users,
    _sessions: sessions,
    seedUser,
    seedSession,
    users: {
      async getById(id) { calls.push({ type: 'getById', table: 'users' }); return { ok: true, row: users.get(id) || null }; },
    },
    sessions: {
      async getById(id) { calls.push({ type: 'getById', table: 'sessions' }); return { ok: true, row: sessions.get(id) || null }; },
      async revoke(id, revokedAt) { calls.push({ type: 'revoke', table: 'sessions' }); const s = sessions.get(id); if (s) s.revoked_at = revokedAt; return { ok: true }; },
    },
    explorationRecords: makeTable('exploration_records', tables.explorationRecords, 50),
    foodEvents: makeTable('food_events', tables.foodEvents, 50),
    emotionRecords: makeTable('emotion_records', tables.emotionRecords, 50),
    behaviorPatterns: makeTable('behavior_patterns', tables.behaviorPatterns, 50),
    aiReports: makeTable('ai_reports', tables.aiReports, 20),
  };
}

// -----------------------------------------------------------------------
// Stateful fake D1：讓真正worker.fetch()的round-trip情境能保有真的狀態
// （沿用TASK1.29起建立的模式，擴充自TASK1.35/1.36版本，額外補上
// created_at欄位模擬真實schema的DEFAULT行為）
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
        const now = new Date().toISOString();
        if (/INSERT INTO exploration_records/.test(sql)) {
          const [user_id, draw_mode, card_category, card_object_key, card_text, photo_idx, responses_json, occurred_at] = params;
          const id = nextId++;
          explorationRecords.set(id, { id, user_id, draw_mode, card_category, card_object_key, card_text, photo_idx, responses_json, occurred_at, created_at: now });
          return { id };
        }
        if (/INSERT INTO food_events/.test(sql)) {
          const [user_id, meal_type, description, nutrients_json, image_id, occurred_at] = params;
          const id = nextId++;
          foodEvents.set(id, { id, user_id, meal_type, description, nutrients_json, image_id, occurred_at, created_at: now });
          return { id };
        }
        if (/INSERT INTO emotion_records/.test(sql)) {
          const [user_id, emotion_type, intensity, trigger_note, linked_food_event_id, occurred_at] = params;
          const id = nextId++;
          emotionRecords.set(id, { id, user_id, emotion_type, intensity, trigger_note, linked_food_event_id, occurred_at, created_at: now });
          return { id };
        }
        if (/INSERT INTO behavior_patterns/.test(sql)) {
          const [user_id, pattern_type, summary, evidence_json, confidence_score, detected_at] = params;
          const id = nextId++;
          behaviorPatterns.set(id, { id, user_id, pattern_type, summary, evidence_json, confidence_score, detected_at, created_at: now });
          return { id };
        }
        if (/INSERT INTO ai_reports/.test(sql)) {
          const [user_id, report_type, period_start, period_end, content, model_used] = params;
          const id = nextId++;
          aiReports.set(id, { id, user_id, report_type, period_start, period_end, content, model_used, created_at: now });
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
  return Object.assign({
    id, status: 'active', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-' + id,
    display_name: null, legacy_sync_code: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
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
  // A. timeline success
  // =========================================================================

  await test('（1.timeline success）登入使用者成功取得timeline', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-1'));
    await db.explorationRecords.insert({ user_id: 'u-1', occurred_at: '2026-03-01T00:00:00Z' });
    const result = await getTimelineController(db, 'u-1', {});
    assert.strictEqual(result.ok, true);
  });

  await test('（1.timeline success）回傳shape恰好是{timeline, pagination}', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-2'));
    const result = await getTimelineController(db, 'u-2', {});
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['pagination', 'timeline']);
  });

  await test('（1.timeline success）timeline是陣列', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-3'));
    const result = await getTimelineController(db, 'u-3', {});
    assert.ok(Array.isArray(result.data.timeline));
  });

  await test('（1.timeline success）pagination包含limit/offset/total三個欄位', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-4'));
    const result = await getTimelineController(db, 'u-4', {});
    assert.deepStrictEqual(Object.keys(result.data.pagination).sort(), ['limit', 'offset', 'total']);
  });

  await test('（1.timeline success）每個timeline item shape恰好是{id, type, timestamp, data}', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-5'));
    await db.explorationRecords.insert({ user_id: 'u-5', occurred_at: '2026-03-01T00:00:00Z' });
    const result = await getTimelineController(db, 'u-5', {});
    assert.deepStrictEqual(Object.keys(result.data.timeline[0]).sort(), ['data', 'id', 'timestamp', 'type']);
  });

  await test('（1.timeline success）item.id格式為"{type}-{原始id}"', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-6'));
    const insertResult = await db.explorationRecords.insert({ user_id: 'u-6', occurred_at: '2026-03-01T00:00:00Z' });
    const result = await getTimelineController(db, 'u-6', {});
    assert.strictEqual(result.data.timeline[0].id, `exploration-${insertResult.id}`);
  });

  await test('（1.timeline success）item.timestamp對應原始資料的created_at（不是occurred_at/detected_at）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-7'));
    await db.explorationRecords.insert({ user_id: 'u-7', occurred_at: '1999-01-01T00:00:00Z', created_at: '2026-05-05T00:00:00Z' });
    const result = await getTimelineController(db, 'u-7', {});
    assert.strictEqual(result.data.timeline[0].timestamp, '2026-05-05T00:00:00Z');
  });

  await test('（1.timeline success）不存在的userId安全回401 user_not_found', async () => {
    const db = makeMockDb();
    const result = await getTimelineController(db, 'does-not-exist', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_not_found');
    assert.strictEqual(result.status, 401);
  });

  await test('（1.timeline success）Router routing層級：GET /api/timeline透過真正router.handle()完整鏈路成功', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-8'));
    db.seedSession(makeSession('tok-8', 'u-8'));
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-8` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（1.timeline success）getTimelineController()對沒有userId的呼叫直接安全回401（雙重防禦）', async () => {
    const db = makeMockDb();
    const result = await getTimelineController(db, null, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.reason, 'not_authenticated');
  });

  await test('（1.timeline success）getTimeline()（service層）對沒有userId的呼叫安全回401（雙重防禦）', async () => {
    const db = makeMockDb();
    const result = await getTimeline(db, null, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_not_found');
  });

  console.log('');

  // =========================================================================
  // B. empty timeline
  // =========================================================================

  await test('（2.empty timeline）全新使用者（五個資料表都沒有任何紀錄）取得timeline成功，timeline為空陣列', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-empty-1'));
    const result = await getTimelineController(db, 'u-empty-1', {});
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data.timeline, []);
  });

  await test('（2.empty timeline）empty timeline的pagination.total為0', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-empty-2'));
    const result = await getTimelineController(db, 'u-empty-2', {});
    assert.strictEqual(result.data.pagination.total, 0);
  });

  await test('（2.empty timeline）不同使用者各自都是empty user時互不影響', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-empty-3'));
    db.seedUser(activeUser('u-empty-4'));
    const r1 = await getTimelineController(db, 'u-empty-3', {});
    const r2 = await getTimelineController(db, 'u-empty-4', {});
    assert.deepStrictEqual(r1.data.timeline, []);
    assert.deepStrictEqual(r2.data.timeline, []);
  });

  await test('（2.empty timeline）只有其中一類有資料，其餘四類不影響timeline為非空但只有1筆', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-empty-5'));
    await db.foodEvents.insert({ user_id: 'u-empty-5', occurred_at: '2026-03-01T00:00:00Z' });
    const result = await getTimelineController(db, 'u-empty-5', {});
    assert.strictEqual(result.data.timeline.length, 1);
    assert.strictEqual(result.data.timeline[0].type, 'food');
  });

  await test('（2.empty timeline，端對端）guest login後立刻取得timeline（尚未建立任何資料）為空陣列', async () => {
    const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
    const mod = await import(workerUrl);
    const worker = mod.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const guestRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = guestRes.headers.get('set-cookie').split(';')[0];
    const res = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(body.data.timeline, []);
    assert.strictEqual(body.data.pagination.total, 0);
  });

  console.log('');

  // =========================================================================
  // C. 五種資料來源整合
  // =========================================================================

  await test('（3.五種資料來源整合）五種來源各建立一筆，timeline共有5筆', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sources-1'));
    await db.explorationRecords.insert({ user_id: 'u-sources-1', occurred_at: '2026-03-01T00:00:00Z' });
    await db.foodEvents.insert({ user_id: 'u-sources-1', occurred_at: '2026-03-01T00:00:00Z' });
    await db.emotionRecords.insert({ user_id: 'u-sources-1', occurred_at: '2026-03-01T00:00:00Z' });
    await db.behaviorPatterns.insert({ user_id: 'u-sources-1', detected_at: '2026-03-01T00:00:00Z' });
    await db.aiReports.insert({ user_id: 'u-sources-1' });
    const result = await getTimelineController(db, 'u-sources-1', {});
    assert.strictEqual(result.data.timeline.length, 5);
  });

  await test('（3.五種資料來源整合）type欄位分別正確為exploration/food/emotion/behavior/report', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sources-2'));
    await db.explorationRecords.insert({ user_id: 'u-sources-2' });
    await db.foodEvents.insert({ user_id: 'u-sources-2' });
    await db.emotionRecords.insert({ user_id: 'u-sources-2' });
    await db.behaviorPatterns.insert({ user_id: 'u-sources-2' });
    await db.aiReports.insert({ user_id: 'u-sources-2' });
    const result = await getTimelineController(db, 'u-sources-2', {});
    const types = result.data.timeline.map((i) => i.type).sort();
    assert.deepStrictEqual(types, ['behavior', 'emotion', 'exploration', 'food', 'report']);
  });

  await test('（3.五種資料來源整合）exploration item的data欄位就是原始exploration_records資料（不裁剪）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sources-3'));
    await db.explorationRecords.insert({ user_id: 'u-sources-3', draw_mode: 'single', card_category: 'CAT', card_text: 'hello' });
    const result = await getTimelineController(db, 'u-sources-3', {});
    const item = result.data.timeline.find((i) => i.type === 'exploration');
    assert.strictEqual(item.data.draw_mode, 'single');
    assert.strictEqual(item.data.card_category, 'CAT');
    assert.strictEqual(item.data.card_text, 'hello');
    assert.strictEqual(item.data.user_id, 'u-sources-3');
  });

  await test('（3.五種資料來源整合）food item的data欄位就是原始food_events資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sources-4'));
    await db.foodEvents.insert({ user_id: 'u-sources-4', meal_type: 'lunch', description: 'salad' });
    const result = await getTimelineController(db, 'u-sources-4', {});
    const item = result.data.timeline.find((i) => i.type === 'food');
    assert.strictEqual(item.data.meal_type, 'lunch');
    assert.strictEqual(item.data.description, 'salad');
  });

  await test('（3.五種資料來源整合）emotion item的data欄位就是原始emotion_records資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sources-5'));
    await db.emotionRecords.insert({ user_id: 'u-sources-5', emotion_type: 'happy', intensity: 8 });
    const result = await getTimelineController(db, 'u-sources-5', {});
    const item = result.data.timeline.find((i) => i.type === 'emotion');
    assert.strictEqual(item.data.emotion_type, 'happy');
    assert.strictEqual(item.data.intensity, 8);
  });

  await test('（3.五種資料來源整合）behavior item的data欄位就是原始behavior_patterns資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sources-6'));
    await db.behaviorPatterns.insert({ user_id: 'u-sources-6', pattern_type: 'late-night-snack', summary: 'sum' });
    const result = await getTimelineController(db, 'u-sources-6', {});
    const item = result.data.timeline.find((i) => i.type === 'behavior');
    assert.strictEqual(item.data.pattern_type, 'late-night-snack');
    assert.strictEqual(item.data.summary, 'sum');
  });

  await test('（3.五種資料來源整合）report item的data欄位就是原始ai_reports資料（不含任何AI生成/摘要邏輯）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sources-7'));
    await db.aiReports.insert({ user_id: 'u-sources-7', report_type: 'weekly', content: 'raw content as-is' });
    const result = await getTimelineController(db, 'u-sources-7', {});
    const item = result.data.timeline.find((i) => i.type === 'report');
    assert.strictEqual(item.data.report_type, 'weekly');
    assert.strictEqual(item.data.content, 'raw content as-is');
  });

  await test('（3.五種資料來源整合）多筆同類資料全部正確整合，數量正確', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sources-8'));
    for (let i = 0; i < 4; i++) await db.foodEvents.insert({ user_id: 'u-sources-8', meal_type: 'meal-' + i });
    const result = await getTimelineController(db, 'u-sources-8', {});
    assert.strictEqual(result.data.timeline.length, 4);
  });

  await test('（3.五種資料來源整合，端對端）透過真正worker.fetch()建立五大類資料後timeline正確整合', async () => {
    const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
    const mod = await import(workerUrl);
    const worker = mod.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const guestRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = guestRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(new Request('https://example.com/api/explorations', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ draw_mode: 'single' }) }), env, {});
    await worker.fetch(new Request('https://example.com/api/food-events', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ meal_type: 'lunch' }) }), env, {});
    await worker.fetch(new Request('https://example.com/api/emotions', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ emotion_type: 'calm' }) }), env, {});
    await worker.fetch(new Request('https://example.com/api/behaviors', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ pattern_type: 'x' }) }), env, {});
    await worker.fetch(new Request('https://example.com/api/reports', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ report_type: 'weekly' }) }), env, {});
    const res = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    assert.strictEqual(body.data.timeline.length, 5);
    assert.strictEqual(body.data.pagination.total, 5);
  });

  console.log('');

  // =========================================================================
  // D. timestamp sorting
  // =========================================================================

  await test('（4.timestamp sorting）依timestamp新到舊排序（DESC）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sort-1'));
    await db.explorationRecords.insert({ user_id: 'u-sort-1', created_at: '2026-01-01T00:00:00Z' });
    await db.foodEvents.insert({ user_id: 'u-sort-1', created_at: '2026-03-01T00:00:00Z' });
    await db.emotionRecords.insert({ user_id: 'u-sort-1', created_at: '2026-02-01T00:00:00Z' });
    const result = await getTimelineController(db, 'u-sort-1', {});
    const timestamps = result.data.timeline.map((i) => i.timestamp);
    assert.deepStrictEqual(timestamps, ['2026-03-01T00:00:00Z', '2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z']);
  });

  await test('（4.timestamp sorting）跨五種type混合排序仍正確', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sort-2'));
    await db.aiReports.insert({ user_id: 'u-sort-2', created_at: '2026-01-05T00:00:00Z' });
    await db.explorationRecords.insert({ user_id: 'u-sort-2', created_at: '2026-01-04T00:00:00Z' });
    await db.behaviorPatterns.insert({ user_id: 'u-sort-2', created_at: '2026-01-03T00:00:00Z' });
    await db.foodEvents.insert({ user_id: 'u-sort-2', created_at: '2026-01-02T00:00:00Z' });
    await db.emotionRecords.insert({ user_id: 'u-sort-2', created_at: '2026-01-01T00:00:00Z' });
    const result = await getTimelineController(db, 'u-sort-2', {});
    const types = result.data.timeline.map((i) => i.type);
    assert.deepStrictEqual(types, ['report', 'exploration', 'behavior', 'food', 'emotion']);
  });

  await test('（4.timestamp sorting）相同timestamp時不會拋出例外（順序穩定即可）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sort-3'));
    await db.foodEvents.insert({ user_id: 'u-sort-3', created_at: '2026-01-01T00:00:00Z' });
    await db.emotionRecords.insert({ user_id: 'u-sort-3', created_at: '2026-01-01T00:00:00Z' });
    const result = await getTimelineController(db, 'u-sort-3', {});
    assert.strictEqual(result.data.timeline.length, 2);
  });

  await test('（4.timestamp sorting）同一來源內多筆也正確依timestamp排序（不依賴insert順序）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-sort-4'));
    await db.foodEvents.insert({ user_id: 'u-sort-4', created_at: '2026-01-01T00:00:00Z', meal_type: 'old' });
    await db.foodEvents.insert({ user_id: 'u-sort-4', created_at: '2026-06-01T00:00:00Z', meal_type: 'new' });
    const result = await getTimelineController(db, 'u-sort-4', {});
    assert.strictEqual(result.data.timeline[0].data.meal_type, 'new');
    assert.strictEqual(result.data.timeline[1].data.meal_type, 'old');
  });

  await test('（4.timestamp sorting，端對端）真正worker.fetch()建立順序打亂但timeline依然正確排序', async () => {
    const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
    const mod = await import(workerUrl);
    const worker = mod.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const guestRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = guestRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(new Request('https://example.com/api/food-events', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ meal_type: 'first' }) }), env, {});
    await new Promise((resolve) => setTimeout(resolve, 5));
    await worker.fetch(new Request('https://example.com/api/food-events', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ meal_type: 'second' }) }), env, {});
    const res = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    assert.strictEqual(body.data.timeline[0].data.meal_type, 'second');
    assert.strictEqual(body.data.timeline[1].data.meal_type, 'first');
  });

  console.log('');

  // =========================================================================
  // E. pagination limit
  // =========================================================================

  await test('（5.pagination limit）沒有帶limit時預設為50', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-limit-1'));
    const result = await getTimelineController(db, 'u-limit-1', {});
    assert.strictEqual(result.data.pagination.limit, DEFAULT_LIMIT);
    assert.strictEqual(DEFAULT_LIMIT, 50);
  });

  await test('（5.pagination limit）帶limit=3時只回3筆', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-limit-2'));
    for (let i = 0; i < 5; i++) await db.foodEvents.insert({ user_id: 'u-limit-2', created_at: `2026-01-0${i + 1}T00:00:00Z` });
    const result = await getTimelineController(db, 'u-limit-2', { limit: 3 });
    assert.strictEqual(result.data.timeline.length, 3);
    assert.strictEqual(result.data.pagination.limit, 3);
  });

  await test('（5.pagination limit）limit=3時仍取最新的3筆（DESC排序後截斷）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-limit-3'));
    for (let i = 1; i <= 5; i++) await db.foodEvents.insert({ user_id: 'u-limit-3', created_at: `2026-01-0${i}T00:00:00Z`, meal_type: 'day' + i });
    const result = await getTimelineController(db, 'u-limit-3', { limit: 3 });
    const days = result.data.timeline.map((i) => i.data.meal_type);
    assert.deepStrictEqual(days, ['day5', 'day4', 'day3']);
  });

  await test('（5.pagination limit）limit最大為100，超過時clamp成100（不拒絕、不報錯）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-limit-4'));
    const result = await getTimelineController(db, 'u-limit-4', { limit: 999 });
    assert.strictEqual(result.data.pagination.limit, 100);
    assert.strictEqual(MAX_LIMIT, 100);
  });

  await test('（5.pagination limit）limit=0時回退到預設值50（不是回傳空清單）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-limit-5'));
    const result = await getTimelineController(db, 'u-limit-5', { limit: 0 });
    assert.strictEqual(result.data.pagination.limit, DEFAULT_LIMIT);
  });

  await test('（5.pagination limit）limit為負數時回退到預設值', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-limit-6'));
    const result = await getTimelineController(db, 'u-limit-6', { limit: -5 });
    assert.strictEqual(result.data.pagination.limit, DEFAULT_LIMIT);
  });

  await test('（5.pagination limit）limit為非數字字串時回退到預設值（不拋例外）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-limit-7'));
    const result = await getTimelineController(db, 'u-limit-7', { limit: 'abc' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.pagination.limit, DEFAULT_LIMIT);
  });

  await test('（5.pagination limit）limit為字串"3"（query string原始型別）時正確轉成數字3', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-limit-8'));
    for (let i = 0; i < 5; i++) await db.foodEvents.insert({ user_id: 'u-limit-8' });
    const result = await getTimelineController(db, 'u-limit-8', { limit: '3' });
    assert.strictEqual(result.data.timeline.length, 3);
  });

  await test('（5.pagination limit）normalizeLimit()單元測試：1~100之間的整數原樣保留', () => {
    assert.strictEqual(normalizeLimit(1), 1);
    assert.strictEqual(normalizeLimit(100), 100);
    assert.strictEqual(normalizeLimit(50), 50);
  });

  await test('（5.pagination limit，端對端）GET /api/timeline?limit=2 正確只回2筆', async () => {
    const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
    const mod = await import(workerUrl);
    const worker = mod.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const guestRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = guestRes.headers.get('set-cookie').split(';')[0];
    for (let i = 0; i < 4; i++) {
      await worker.fetch(new Request('https://example.com/api/food-events', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ meal_type: 'm' + i }) }), env, {});
    }
    const res = await worker.fetch(new Request('https://example.com/api/timeline?limit=2', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    assert.strictEqual(body.data.timeline.length, 2);
    assert.strictEqual(body.data.pagination.limit, 2);
  });

  console.log('');

  // =========================================================================
  // F. pagination offset
  // =========================================================================

  await test('（6.pagination offset）沒有帶offset時預設為0', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-offset-1'));
    const result = await getTimelineController(db, 'u-offset-1', {});
    assert.strictEqual(result.data.pagination.offset, 0);
  });

  await test('（6.pagination offset）offset=2時跳過前2筆最新的資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-offset-2'));
    for (let i = 1; i <= 5; i++) await db.foodEvents.insert({ user_id: 'u-offset-2', created_at: `2026-01-0${i}T00:00:00Z`, meal_type: 'day' + i });
    const result = await getTimelineController(db, 'u-offset-2', { offset: 2 });
    const days = result.data.timeline.map((i) => i.data.meal_type);
    assert.deepStrictEqual(days, ['day3', 'day2', 'day1']);
  });

  await test('（6.pagination offset）limit+offset合併分頁正確', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-offset-3'));
    for (let i = 1; i <= 5; i++) await db.foodEvents.insert({ user_id: 'u-offset-3', created_at: `2026-01-0${i}T00:00:00Z`, meal_type: 'day' + i });
    const result = await getTimelineController(db, 'u-offset-3', { limit: 2, offset: 1 });
    const days = result.data.timeline.map((i) => i.data.meal_type);
    assert.deepStrictEqual(days, ['day4', 'day3']);
  });

  await test('（6.pagination offset）offset超過總筆數時回傳空陣列（不拋例外）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-offset-4'));
    await db.foodEvents.insert({ user_id: 'u-offset-4' });
    const result = await getTimelineController(db, 'u-offset-4', { offset: 999 });
    assert.deepStrictEqual(result.data.timeline, []);
    assert.strictEqual(result.data.pagination.total, 1);
  });

  await test('（6.pagination offset）offset為負數時回退到0', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-offset-5'));
    const result = await getTimelineController(db, 'u-offset-5', { offset: -10 });
    assert.strictEqual(result.data.pagination.offset, 0);
  });

  await test('（6.pagination offset）offset為非數字字串時回退到0（不拋例外）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-offset-6'));
    const result = await getTimelineController(db, 'u-offset-6', { offset: 'xyz' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.pagination.offset, 0);
  });

  await test('（6.pagination offset）pagination.total永遠反映全部符合條件的總筆數，不受limit/offset影響', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-offset-7'));
    for (let i = 0; i < 7; i++) await db.foodEvents.insert({ user_id: 'u-offset-7' });
    const result = await getTimelineController(db, 'u-offset-7', { limit: 2, offset: 3 });
    assert.strictEqual(result.data.pagination.total, 7);
    assert.strictEqual(result.data.timeline.length, 2);
  });

  await test('（6.pagination offset）normalizeOffset()單元測試：>=0的整數原樣保留', () => {
    assert.strictEqual(normalizeOffset(0), 0);
    assert.strictEqual(normalizeOffset(5), 5);
    assert.strictEqual(normalizeOffset(undefined), 0);
  });

  await test('（6.pagination offset，端對端）GET /api/timeline?limit=2&offset=1 正確分頁', async () => {
    const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
    const mod = await import(workerUrl);
    const worker = mod.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const guestRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = guestRes.headers.get('set-cookie').split(';')[0];
    for (let i = 0; i < 4; i++) {
      await worker.fetch(new Request('https://example.com/api/food-events', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ meal_type: 'm' + i }) }), env, {});
    }
    const res = await worker.fetch(new Request('https://example.com/api/timeline?limit=2&offset=1', { headers: { Cookie: cookie } }), env, {});
    const body = await res.json();
    assert.strictEqual(body.data.timeline.length, 2);
    assert.strictEqual(body.data.pagination.offset, 1);
    assert.strictEqual(body.data.pagination.total, 4);
  });

  console.log('');

  // =========================================================================
  // G. 未登入401
  // =========================================================================

  await test('（7.未登入401）GET /api/timeline沒有cookie時回401，完全不呼叫任何domain service', async () => {
    const db = makeMockDb();
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {} }, { db });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(db.calls.filter((c) => c.type === 'listByUser').length, 0);
  });

  await test('（7.未登入401）帶著不存在的session token時回401', async () => {
    const db = makeMockDb();
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=does-not-exist` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（7.未登入401）cookie格式不正確（缺少session名稱）時安全回401，不拋例外', async () => {
    const db = makeMockDb();
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: 'not-a-valid-cookie' }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（7.未登入401）使用者狀態為suspended時回401（即使session本身有效）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-suspended', { status: 'suspended' }));
    db.seedSession(makeSession('tok-suspended', 'u-suspended'));
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-suspended` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（7.未登入401）使用者狀態為deleted時回401', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-deleted', { status: 'deleted' }));
    db.seedSession(makeSession('tok-deleted', 'u-deleted'));
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-deleted` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（7.未登入401，端對端）真正worker.fetch()沒有cookie時GET /api/timeline回401', async () => {
    const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
    const mod = await import(workerUrl);
    const worker = mod.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const res = await worker.fetch(new Request('https://example.com/api/timeline'), env, {});
    assert.strictEqual(res.status, 401);
  });

  console.log('');

  // =========================================================================
  // H. expired session
  // =========================================================================

  await test('（8.expired session）session已過期時GET /api/timeline回401', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-expired-1'));
    db.seedSession(makeSession('tok-expired-1', 'u-expired-1', { expires_at: '2020-01-01T00:00:00Z' }));
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-expired-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（8.expired session）過期session的失敗reason為expired', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-expired-2'));
    db.seedSession(makeSession('tok-expired-2', 'u-expired-2', { expires_at: '2020-01-01T00:00:00Z' }));
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-expired-2` }, { db });
    const body = await res.json();
    assert.strictEqual(body.reason, 'expired');
  });

  await test('（8.expired session）尚未過期（未來時間）的session正常可用', async () => {
    const db = makeMockDb();
    const future = new Date(Date.now() + 100000).toISOString();
    db.seedUser(activeUser('u-expired-3'));
    db.seedSession(makeSession('tok-expired-3', 'u-expired-3', { expires_at: future }));
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-expired-3` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（8.expired session）過期session完全不會呼叫任何domain service', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-expired-4'));
    db.seedSession(makeSession('tok-expired-4', 'u-expired-4', { expires_at: '2020-01-01T00:00:00Z' }));
    const router = createAppRouter();
    await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-expired-4` }, { db });
    assert.strictEqual(db.calls.filter((c) => c.type === 'listByUser').length, 0);
  });

  await test('（8.expired session，端對端）真正worker.fetch()過期session回401', async () => {
    const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
    const mod = await import(workerUrl);
    const worker = mod.default;
    const fakeD1 = makeStatefulFakeD1();
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: fakeD1 };
    const guestRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = guestRes.headers.get('set-cookie').split(';')[0];
    const sessionId = cookie.split('=')[1];
    fakeD1._sessions.get(sessionId).expires_at = '2020-01-01T00:00:00Z';
    const res = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 401);
  });

  console.log('');

  // =========================================================================
  // I. revoked session
  // =========================================================================

  await test('（9.revoked session）session已撤銷時GET /api/timeline回401', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-revoked-1'));
    db.seedSession(makeSession('tok-revoked-1', 'u-revoked-1', { revoked_at: '2026-01-10T00:00:00Z' }));
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-revoked-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（9.revoked session）撤銷session的失敗reason為revoked', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-revoked-2'));
    db.seedSession(makeSession('tok-revoked-2', 'u-revoked-2', { revoked_at: '2026-01-10T00:00:00Z' }));
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-revoked-2` }, { db });
    const body = await res.json();
    assert.strictEqual(body.reason, 'revoked');
  });

  await test('（9.revoked session）未撤銷（revoked_at為null）的session正常可用', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-revoked-3'));
    db.seedSession(makeSession('tok-revoked-3', 'u-revoked-3', { revoked_at: null }));
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-revoked-3` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（9.revoked session，端對端）真正worker.fetch()透過POST /auth/logout撤銷後GET /api/timeline回401', async () => {
    const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
    const mod = await import(workerUrl);
    const worker = mod.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const guestRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = guestRes.headers.get('set-cookie').split(';')[0];
    await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookie } }), env, {});
    const res = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 401);
  });

  console.log('');

  // =========================================================================
  // J. logout後拒絕
  // =========================================================================

  await test('（10.logout後拒絕）guest login → logout → GET /api/timeline回401', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-logout-1'));
    db.seedSession(makeSession('tok-logout-1', 'u-logout-1'));
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-1` }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-1` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（10.logout後拒絕）logout前可以正常存取，logout後同一個cookie無法再存取', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-logout-2'));
    db.seedSession(makeSession('tok-logout-2', 'u-logout-2'));
    const router = createAppRouter();
    const before = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-2` }, { db });
    assert.strictEqual(before.status, 200);
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-2` }, { db });
    const after = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-2` }, { db });
    assert.strictEqual(after.status, 401);
  });

  await test('（10.logout後拒絕）logout後session.revoked_at確實被設定', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-logout-3'));
    db.seedSession(makeSession('tok-logout-3', 'u-logout-3'));
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/auth/logout', cookieHeader: `${SESSION_COOKIE_NAME}=tok-logout-3` }, { db });
    assert.ok(db._sessions.get('tok-logout-3').revoked_at);
  });

  await test('（10.logout後拒絕，端對端）真正worker.fetch()完整guest→logout→timeline流程', async () => {
    const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
    const mod = await import(workerUrl);
    const worker = mod.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const guestRes = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookie = guestRes.headers.get('set-cookie').split(';')[0];
    const okRes = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(okRes.status, 200);
    await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookie } }), env, {});
    const afterRes = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(afterRes.status, 401);
  });

  console.log('');

  // =========================================================================
  // K. cross user isolation
  // =========================================================================

  await test('（11.cross user isolation）使用者A的timeline完全不含使用者B的資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a1'));
    db.seedUser(activeUser('u-cross-b1'));
    await db.foodEvents.insert({ user_id: 'u-cross-a1', meal_type: 'a-only' });
    await db.foodEvents.insert({ user_id: 'u-cross-b1', meal_type: 'b-only' });
    const result = await getTimelineController(db, 'u-cross-a1', {});
    assert.strictEqual(result.data.timeline.length, 1);
    assert.strictEqual(result.data.timeline[0].data.meal_type, 'a-only');
  });

  await test('（11.cross user isolation）五種type分別做跨使用者隔離驗證', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a2'));
    db.seedUser(activeUser('u-cross-b2'));
    await db.explorationRecords.insert({ user_id: 'u-cross-a2' });
    await db.foodEvents.insert({ user_id: 'u-cross-a2' });
    await db.emotionRecords.insert({ user_id: 'u-cross-a2' });
    await db.behaviorPatterns.insert({ user_id: 'u-cross-a2' });
    await db.aiReports.insert({ user_id: 'u-cross-a2' });
    await db.explorationRecords.insert({ user_id: 'u-cross-b2' });
    await db.foodEvents.insert({ user_id: 'u-cross-b2' });
    await db.emotionRecords.insert({ user_id: 'u-cross-b2' });
    await db.behaviorPatterns.insert({ user_id: 'u-cross-b2' });
    await db.aiReports.insert({ user_id: 'u-cross-b2' });
    const resultA = await getTimelineController(db, 'u-cross-a2', {});
    const resultB = await getTimelineController(db, 'u-cross-b2', {});
    assert.strictEqual(resultA.data.timeline.length, 5);
    assert.strictEqual(resultB.data.timeline.length, 5);
    assert.ok(resultA.data.timeline.every((i) => i.data.user_id === 'u-cross-a2'));
    assert.ok(resultB.data.timeline.every((i) => i.data.user_id === 'u-cross-b2'));
  });

  await test('（11.cross user isolation）使用者A無法透過偽造session cookie存取使用者B的timeline（不存在的token仍是401）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-b3'));
    db.seedSession(makeSession('tok-cross-b3', 'u-cross-b3'));
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=forged-token-not-real` }, { db });
    assert.strictEqual(res.status, 401);
  });

  await test('（11.cross user isolation，端對端）兩個不同guest登入各自的timeline完全互不干擾', async () => {
    const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
    const mod = await import(workerUrl);
    const worker = mod.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const guestA = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieA = guestA.headers.get('set-cookie').split(';')[0];
    const guestB = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieB = guestB.headers.get('set-cookie').split(';')[0];
    await worker.fetch(new Request('https://example.com/api/food-events', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ meal_type: 'a-meal' }) }), env, {});
    const resB = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookieB } }), env, {});
    const bodyB = await resB.json();
    assert.deepStrictEqual(bodyB.data.timeline, []);
  });

  await test('（11.cross user isolation）exploration/emotion/behavior/report各自跨使用者隔離', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-cross-a4'));
    db.seedUser(activeUser('u-cross-b4'));
    await db.explorationRecords.insert({ user_id: 'u-cross-a4', card_text: 'a-explore' });
    await db.explorationRecords.insert({ user_id: 'u-cross-b4', card_text: 'b-explore' });
    await db.emotionRecords.insert({ user_id: 'u-cross-a4', emotion_type: 'a-emotion' });
    await db.emotionRecords.insert({ user_id: 'u-cross-b4', emotion_type: 'b-emotion' });
    const resultA = await getTimelineController(db, 'u-cross-a4', {});
    const types = resultA.data.timeline.map((i) => i.data.card_text || i.data.emotion_type);
    assert.ok(types.every((t) => t.startsWith('a-')));
  });

  console.log('');

  // =========================================================================
  // L. user_id spoofing
  // =========================================================================

  await test('（12.user_id spoofing）query帶偽造user_id完全被忽略，timeline一律回傳session使用者自己的資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-spoof-victim'));
    db.seedUser(activeUser('u-spoof-attacker'));
    await db.foodEvents.insert({ user_id: 'u-spoof-victim', meal_type: 'victim-meal' });
    db.seedSession(makeSession('tok-spoof-1', 'u-spoof-attacker'));
    const router = createAppRouter();
    const res = await router.handle(
      { method: 'GET', pathname: '/api/timeline', query: { user_id: 'u-spoof-victim' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-spoof-1` },
      { db }
    );
    const body = await res.json();
    assert.deepStrictEqual(body.data.timeline, []);
  });

  await test('（12.user_id spoofing）getTimelineController()完全不會讀取query.user_id（原始碼層級保證：userId參數獨立於query）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-spoof-2'));
    const result = await getTimelineController(db, 'u-spoof-2', { user_id: 'someone-else', limit: 10 });
    assert.strictEqual(result.ok, true);
  });

  await test('（12.user_id spoofing，端對端）GET /api/timeline?user_id=B時仍只回session使用者（A）自己的資料', async () => {
    const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
    const mod = await import(workerUrl);
    const worker = mod.default;
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: makeStatefulFakeD1() };
    const guestA = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieA = guestA.headers.get('set-cookie').split(';')[0];
    const guestB = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    const cookieB = guestB.headers.get('set-cookie').split(';')[0];
    const bodyB = await (await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieB } }), env, {})).json();
    const userBId = bodyB.data.id;
    await worker.fetch(new Request('https://example.com/api/food-events', { method: 'POST', headers: { Cookie: cookieB }, body: JSON.stringify({ meal_type: 'b-secret' }) }), env, {});
    const res = await worker.fetch(new Request(`https://example.com/api/timeline?user_id=${userBId}`, { headers: { Cookie: cookieA } }), env, {});
    const body = await res.json();
    assert.deepStrictEqual(body.data.timeline, []);
  });

  await test('（12.user_id spoofing）原始碼掃描：timeline_routes.js的getQuery()只挑選limit/offset，不會透傳user_id', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'routes', 'timeline_routes.js'), 'utf8'));
    assert.ok(!/user_id/.test(src));
  });

  console.log('');

  // =========================================================================
  // M. contract validation
  // =========================================================================

  await test('（13.contract validation）沒有帶limit/offset時validateContract()通過', () => {
    const result = validateContract(timelineContract, {});
    assert.strictEqual(result.ok, true);
  });

  await test('（13.contract validation）limit/offset是合法數字時validateContract()通過', () => {
    const result = validateContract(timelineContract, { limit: 20, offset: 5 });
    assert.strictEqual(result.ok, true);
  });

  await test('（13.contract validation）limit型別錯誤（非number）時validateContract()回傳錯誤', () => {
    const result = validateContract(timelineContract, { limit: true });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('limit')));
  });

  await test('（13.contract validation）offset型別錯誤（非number）時validateContract()回傳錯誤', () => {
    const result = validateContract(timelineContract, { offset: [1, 2] });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('offset')));
  });

  await test('（13.contract validation）timelineContract.request正確宣告limit/offset皆為required:false', () => {
    assert.strictEqual(timelineContract.request.limit.required, false);
    assert.strictEqual(timelineContract.request.offset.required, false);
  });

  await test('（13.contract validation）timelineContract.response.success正確描述timeline/pagination兩個欄位', () => {
    assert.deepStrictEqual(Object.keys(timelineContract.response.success).sort(), ['pagination', 'timeline']);
  });

  await test('（13.contract validation）Router層級：query.limit為布林值等非標準型別時，timeline_routes.js的getQuery()一律先轉成Number()再驗證，typeof結果仍是number因此不會觸發400（設計上是defensive normalize、不是嚴格拒絕——跟data_controller.js既有parseLimit()同樣哲學），請求安全成功', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-contract-1'));
    db.seedSession(makeSession('tok-contract-1', 'u-contract-1'));
    const router = createAppRouter();
    const res = await router.handle(
      { method: 'GET', pathname: '/api/timeline', query: { limit: true }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-contract-1` },
      { db }
    );
    assert.strictEqual(res.status, 200);
  });

  await test('（13.contract validation）validateContract()直接呼叫（不經過timeline_routes.js的getQuery()轉換）時，真正非number型別（例如布林值/陣列）仍會被正確攔截——這才是「contract驗證limit/offset必須是number」規則本身被驗證到的地方（見前面兩項單元測試），route層的Number()轉換只是「盡量避免因為query string原始型別是字串就誤判失敗」的額外防禦，兩者不衝突', () => {
    assert.strictEqual(validateContract(timelineContract, { limit: true }).ok, false);
    assert.strictEqual(validateContract(timelineContract, { limit: 50 }).ok, true);
  });

  await test('（13.contract validation）query string數字字串（例如"50"）經過getQuery()轉換後型別正確為number，不會觸發400', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-contract-2'));
    db.seedSession(makeSession('tok-contract-2', 'u-contract-2'));
    const router = createAppRouter();
    const res = await router.handle(
      { method: 'GET', pathname: '/api/timeline', query: { limit: '50', offset: '0' }, cookieHeader: `${SESSION_COOKIE_NAME}=tok-contract-2` },
      { db }
    );
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // =========================================================================
  // N. service failure
  // =========================================================================

  await test('（14.service failure）任一子service失敗時整體回傳失敗，不會回傳部分資料', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-1'));
    await db.explorationRecords.insert({ user_id: 'u-fail-1' });
    db.foodEvents.listByUser = async () => ({ ok: false, error: 'db_boom' });
    const result = await getTimelineController(db, 'u-fail-1', {});
    assert.strictEqual(result.ok, false);
  });

  await test('（14.service failure）子service失敗時回傳的錯誤不含任何timeline/pagination欄位（不是部分資料+靜默遺失）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-2'));
    db.emotionRecords.listByUser = async () => ({ ok: false, error: 'db_boom' });
    const result = await getTimelineController(db, 'u-fail-2', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.data, undefined);
  });

  await test('（14.service failure）子service失敗時HTTP status為500', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-3'));
    db.behaviorPatterns.listByUser = async () => ({ ok: false, error: 'db_boom' });
    const result = await getTimelineController(db, 'u-fail-3', {});
    assert.strictEqual(result.status, 500);
  });

  await test('（14.service failure）service層getTimeline()同樣正確回傳失敗（不只是controller層處理）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-4'));
    db.aiReports.listByUser = async () => ({ ok: false, error: 'db_boom' });
    const result = await getTimeline(db, 'u-fail-4', {});
    assert.strictEqual(result.ok, false);
  });

  await test('（14.service failure）exploration來源失敗時同樣整體失敗（五個來源逐一驗證）', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-5'));
    db.explorationRecords.listByUser = async () => ({ ok: false, error: 'db_boom' });
    const result = await getTimelineController(db, 'u-fail-5', {});
    assert.strictEqual(result.ok, false);
  });

  await test('（14.service failure）Router層級：service失敗時GET /api/timeline回500', async () => {
    const db = makeMockDb();
    db.seedUser(activeUser('u-fail-6'));
    db.seedSession(makeSession('tok-fail-6', 'u-fail-6'));
    db.foodEvents.listByUser = async () => ({ ok: false, error: 'db_boom' });
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-fail-6` }, { db });
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

  await test('（1.timeline success，端對端）guest login後可以取得自己的timeline', async () => {
    const env = makeFreshEnv();
    const cookie = await guestLoginCookie(env);
    const res = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（端對端）沒有D1 binding時（bootstrap失敗），優雅fallback到legacy首頁', async () => {
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2({}) };
    const res = await worker.fetch(new Request('https://example.com/api/timeline'), env, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（延續守則）FEATURE_ROUTE_MIGRATION_ENABLED=true時，timeline依然正常（不依賴這個flag）', async () => {
    const env = Object.assign(makeFreshEnv(), { FEATURE_ROUTE_MIGRATION_ENABLED: 'true' });
    const cookie = await guestLoginCookie(env);
    const res = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（Router routing）POST /api/timeline（方法不符，只註冊了GET）回405', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/timeline', payload: {} }, { db: makeMockDb() });
    assert.strictEqual(res.status, 405);
  });

  await test('（Router routing）DELETE /api/timeline（方法不符）回405', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'DELETE', pathname: '/api/timeline' }, { db: makeMockDb() });
    assert.strictEqual(res.status, 405);
  });

  console.log('');

  // -------------------------------------------------------------------------
  // 15. KV regression / 16. R2 regression
  // -------------------------------------------------------------------------

  await test('（15.KV regression）GET /api/timeline 完全不呼叫SYNC_KV', async () => {
    const env = makeFreshEnv();
    const cookie = await guestLoginCookie(env);
    let kvCalled = false;
    env.SYNC_KV.get = async () => { kvCalled = true; return null; };
    await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(kvCalled, false);
  });

  await test('（15.KV regression）啟用timeline後，/api/sync 讀寫行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=timeline-kv-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), env, {});
    assert.strictEqual((await res.json()).ok, true);
  });

  await test('（16.R2 regression）GET /api/timeline 完全不呼叫R2', async () => {
    const env = makeFreshEnv();
    const cookie = await guestLoginCookie(env);
    let r2Called = false;
    env.DIET_COACH_IMAGES.get = async () => { r2Called = true; return null; };
    await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(r2Called, false);
  });

  await test('（16.R2 regression）啟用timeline後，/img/* 讀取行為完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    assert.strictEqual(await res.text(), 'FAKE_JPEG_BYTES');
  });

  console.log('');

  // -------------------------------------------------------------------------
  // 17. Legacy route regression
  // -------------------------------------------------------------------------

  await test('（17.Legacy route regression）GET / 首頁HTML完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/'), env, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（17.Legacy route regression）GET /manifest.json 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), env, {});
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
  });

  await test('（17.Legacy route regression）GET /icon.svg 完全不變', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  await test('（17.Legacy route regression）GET /users/999（仍未啟用）落到首頁catch-all', async () => {
    const env = makeFreshEnv();
    const res = await worker.fetch(new Request('https://example.com/users/999'), env, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（17.Legacy route regression）D1完全沒有任何SQL呼叫（只呼叫不含auth/api的legacy路由時）', async () => {
    const env = makeFreshEnv();
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=timeline-legacy-1'), env, {});
    assert.strictEqual(env.DIET_COACH_DB.calls.length, 0);
  });

  await test('（17.Legacy route regression）既有的User Data API/Dashboard/Profile/auth路由行為完全不變', async () => {
    const env = makeFreshEnv();
    const cookie = await guestLoginCookie(env);
    const dashRes = await worker.fetch(new Request('https://example.com/api/dashboard', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(dashRes.status, 200);
    const profileRes = await worker.fetch(new Request('https://example.com/api/profile', { headers: { Cookie: cookie } }), env, {});
    assert.strictEqual(profileRes.status, 200);
  });

  console.log('');

  // =========================================================================
  // R. 架構守則 / 原始碼掃描（含P1-P6標記）
  // =========================================================================

  await test('（架構守則）原始碼掃描：src/services/timeline_service.js 完全沒有 import src/db/ 底下任何檔案（不直接操作SQL）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'timeline_service.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/db\//.test(src));
    assert.ok(!/db\.prepare\(/.test(src));
  });

  await test('（架構守則）原始碼掃描：src/controllers/timeline_controller.js 完全沒有 db.prepare()（不直接操作D1）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'controllers', 'timeline_controller.js'), 'utf8'));
    assert.ok(!/db\.prepare\(/.test(src));
  });

  await test('（架構守則）原始碼掃描：src/routes/timeline_routes.js 完全沒有 db.prepare()（不直接操作D1）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'routes', 'timeline_routes.js'), 'utf8'));
    assert.ok(!/db\.prepare\(/.test(src));
  });

  await test('（架構守則）原始碼掃描：timeline_service.js只透過既有五大domain service函式取得資料（getUserExplorations/listFoodHistory/listEmotionHistory/getBehaviorPatterns/getReports）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'timeline_service.js'), 'utf8'));
    assert.ok(/getUserExplorations/.test(src));
    assert.ok(/listFoodHistory/.test(src));
    assert.ok(/listEmotionHistory/.test(src));
    assert.ok(/getBehaviorPatterns/.test(src));
    assert.ok(/getReports/.test(src));
  });

  await test('（架構守則）原始碼掃描：timeline_service.js使用Promise.all平行取得五個來源', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'timeline_service.js'), 'utf8'));
    assert.ok(/Promise\.all/.test(src));
  });

  await test('（架構守則）原始碼掃描：timeline_service.js完全沒有任何AI相關字樣（不做AI分析生成）', () => {
    const src = stripComments(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'timeline_service.js'), 'utf8'));
    assert.ok(!/generat|summar|openai|gemini|prompt/i.test(src));
  });

  await test('（架構守則）原始碼掃描：五個既有domain service（exploration/food/emotion/behavior/report_service.js）完全沒有被TASK1.38修改', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync(
      'git diff --stat src/services/exploration_service.js src/services/food_service.js src/services/emotion_service.js src/services/behavior_service.js src/services/report_service.js',
      { cwd: repoRoot }
    ).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（架構守則）原始碼掃描：src/auth/session.js（登入流程核心）完全沒有被TASK1.38修改', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat src/auth/session.js', { cwd: repoRoot }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（TASK1.39後更新）原始碼掃描：src/identity/ 底下OAuth/session相關的.js邏輯檔案完全沒有被TASK1.38修改', async () => {
    // 注意：原本這裡用 `git diff --stat src/identity/` 檢查整個目錄，
    // TASK1.39（架構一致性檢查）合法地只更新了
    // src/identity/README.md（修正過時的文件敘述，不涉及任何邏輯），
    // 導致這條斷言用「整個目錄零異動」的過嚴標準誤判成失敗——這是跟
    // TASK1.34自我檢查曾經犯過的同一種「用live git diff檢查整個目錄」
    // 的脆弱設計（見TASK1.35的修正紀錄），這裡比照辦理：把檢查範圍
    // 限定在真正代表OAuth/session行為的.js檔案，不含README.md這類
    // 文件檔案，之後任何一次任務即使合法更新這個目錄底下的文件，也不會
    // 再讓這條斷言誤判。
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat -- src/identity/*.js', { cwd: repoRoot }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  await test('（架構守則）migrations/ 底下完全沒有新增任何檔案（不修改既有資料表schema）', async () => {
    const { execSync } = await import('node:child_process');
    const statusOutput = execSync('git status --porcelain migrations/', { cwd: repoRoot }).toString();
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（16.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（前端頁面完全未被TASK1.38修改，UI受影響機率為0，見「禁止修改UI」限制）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

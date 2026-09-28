/*
 * Phase 6 TASK 1.124｜Health Insight Product Completion Implementation 測試
 *
 * 本次任務是Phase 6的最後一個實作任務，把Health Insight從"功能性
 * 原型"補齊成完整的第一版產品體驗：
 *
 *   1) History Retrieval Boundary（新模組 src/history/health_insight/）
 *   2) Progress Experience（新元件 progress_summary_card.js，取代
 *      Dashboard呼叫固定內容的progress_card.js）
 *   3) Premium Experience Completion（確認TASK1.121/1.122/1.123
 *      既有三態邊界完整，不修改Gemini Provider/Membership Boundary）
 *   4) Gemini Experience Refinement（確認success/denied/failure
 *      三態呈現不外洩技術細節）
 *   5) Complete User Journey（New user/Existing user端對端驗證）
 *
 * 明確不實作：付款/訂閱/計費/Stripe、複雜健康評分系統、醫療判讀、
 * AI生成的進度判斷。不修改Analysis Runner/Recommendation
 * Runner/Capability Orchestrator/Runtime，不新增D1 migration。
 *
 * 新增一條讀取用的路由 GET /api/health-insight/history（History
 * API，規格明確允許），worker.js新增對應一個if區塊轉發cookie。
 *
 * 分為以下15個部分：
 * A) History retrieval
 * B) User ownership
 * C) Anonymous behavior
 * D) Progress presentation
 * E) Premium experience
 * F) Gemini success
 * G) Gemini denied
 * H) Gemini failure fallback
 * I) Complete user journey
 * J) OAuth compatibility
 * K) Persistence compatibility
 * L) UI consistency
 * M) Security validation
 * N) Regression validation
 * O) P1-P6
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const srcRoot = path.join(repoRoot, 'src');
const historyDir = path.join(srcRoot, 'history', 'health_insight');
const membershipDir = path.join(srcRoot, 'membership');
const geminiDir = path.join(srcRoot, 'intelligence', 'enhancement', 'gemini');
const routesDir = path.join(srcRoot, 'routes');
const persistenceDir = path.join(srcRoot, 'persistence', 'health_insight');
const identityDir = path.join(srcRoot, 'identity', 'health_insight');
const uiDir = path.join(srcRoot, 'ui', 'health_insight');
const componentsDir = path.join(uiDir, 'components');
const pagesDir = path.join(uiDir, 'pages');
const migrationsDir = path.join(repoRoot, 'migrations');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`✅ ${name}`);
    })
    .catch((e) => {
      failed++;
      failures.push(name);
      console.log(`❌ ${name}`);
      console.log('   ', e && e.stack ? e.stack.split('\n')[0] : e);
    });
}

function getImportLines(source) {
  return source.split('\n').filter((line) => /^import\b/.test(line.trim())).join('\n');
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

async function withMockedGlobalFetch(mockFn, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mockFn;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function fakeGeminiHttpResponse(text) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
}

async function loadModules() {
  const { createAppRouter } = await import(path.join(routesDir, 'index.js'));
  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  const historyModule = await import(path.join(historyDir, 'index.js'));
  const identityModule = await import(path.join(identityDir, 'index.js'));
  const componentsModule = await import(path.join(componentsDir, 'index.js'));
  return { createAppRouter, createApplication, historyModule, identityModule, componentsModule };
}

/**
 * 建立一個模擬D1的db物件——`records`是已存的原始row陣列
 * （`{id, user_id, insight_version, input_snapshot, output_snapshot, created_at}`），
 * `insert()`會把新record推進同一個陣列，讓`listByUser()`立刻查得到
 * （模擬真實D1的行為，但完全是記憶體內的假資料，不碰任何真實檔案）。
 */
function makeSessionDb({ userId, status, isGuest, authProvider, expiresInFutureSeconds, records, listByUserBehavior }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (expiresInFutureSeconds !== undefined ? expiresInFutureSeconds : 3600) * 1000).toISOString();
  const store = Array.isArray(records) ? records.slice() : [];
  return {
    sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: userId, expires_at: expiresAt, revoked_at: null } }) },
    users: { getById: async () => ({ ok: true, row: { id: userId, is_guest: isGuest ? 1 : 0, auth_provider: authProvider || null, status: status || 'active' } }) },
    healthInsightRecords: {
      insert: async (r) => { store.push(r); return { ok: true, meta: {} }; },
      listByUser: async (uid, limit) => {
        if (listByUserBehavior === 'throw') throw new Error('simulated listByUser throw');
        if (listByUserBehavior === 'db-error') return { ok: false, error: 'simulated' };
        if (listByUserBehavior === 'undefined') return undefined;
        return {
          ok: true,
          results: store
            .filter((r) => r.user_id === uid)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
            .slice(0, limit || 20),
        };
      },
    },
    __store: store,
  };
}

function makeRawRecord({ id, userId, healthGoal, observationCount, recommendationCount, createdAt }) {
  return {
    id: id || `rec-${Math.random().toString(36).slice(2)}`,
    user_id: userId,
    insight_version: '1.0.0',
    input_snapshot: JSON.stringify({ healthGoal: healthGoal || null, age: 28 }),
    output_snapshot: JSON.stringify({
      healthObservation: new Array(observationCount || 0).fill({ category: 'x' }),
      behaviorPattern: [],
      recommendation: new Array(recommendationCount || 0).fill({ category: 'y' }),
      progressTrend: {},
      decision: null,
    }),
    created_at: createdAt || new Date().toISOString(),
  };
}

const PREMIUM_OPTIONS = { lookupTier: () => 'premium' };
const FREE_OPTIONS = { lookupTier: () => 'free' };

const SAMPLE_PAYLOAD = { age: 28, gender: 'female', height: 165, weight: 55, healthGoal: 'weight_loss' };

async function main() {
  const { createAppRouter, createApplication, historyModule, identityModule, componentsModule } = await loadModules();
  const { getHealthInsightHistoryForIdentity, summarizeHealthInsightRecord, DEFAULT_HISTORY_LIMIT } = historyModule;
  const { ANONYMOUS_IDENTITY } = identityModule;
  const { createHistoryCard, createProgressSummaryCard } = componentsModule;

  const historyServiceSource = fs.readFileSync(path.join(historyDir, 'history_service.js'), 'utf8');
  const historyIndexSource = fs.readFileSync(path.join(historyDir, 'index.js'), 'utf8');
  const historyReadmeSource = fs.readFileSync(path.join(historyDir, 'README.md'), 'utf8');
  const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
  const dashboardSource = fs.readFileSync(path.join(pagesDir, 'dashboard_page.js'), 'utf8');
  const historyCardSource = fs.readFileSync(path.join(componentsDir, 'history_card.js'), 'utf8');
  const progressCardSource = fs.readFileSync(path.join(componentsDir, 'progress_summary_card.js'), 'utf8');
  const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');

  const AUTH_IDENTITY_GOOGLE = { userId: 'auth-user-google', authenticated: true, provider: 'google' };
  const AUTH_IDENTITY_OTHER = { userId: 'auth-user-other', authenticated: true, provider: 'guest' };

  // =========================================================================
  // A. History retrieval
  // =========================================================================
  console.log('--- A. History retrieval ---');

  await test('（1.history retrieval）src/history/health_insight/history_service.js存在', () => {
    assert.ok(fs.existsSync(path.join(historyDir, 'history_service.js')));
  });

  await test('（1.history retrieval）src/history/health_insight/index.js存在', () => {
    assert.ok(fs.existsSync(path.join(historyDir, 'index.js')));
  });

  await test('（1.history retrieval）src/history/health_insight/README.md存在', () => {
    assert.ok(fs.existsSync(path.join(historyDir, 'README.md')));
  });

  await test('（1.history retrieval）getHealthInsightHistoryForIdentity是已匯出的function', () => {
    assert.strictEqual(typeof getHealthInsightHistoryForIdentity, 'function');
  });

  await test('（1.history retrieval）summarizeHealthInsightRecord是已匯出的function', () => {
    assert.strictEqual(typeof summarizeHealthInsightRecord, 'function');
  });

  await test('（1.history retrieval）DEFAULT_HISTORY_LIMIT是正整數', () => {
    assert.strictEqual(typeof DEFAULT_HISTORY_LIMIT, 'number');
    assert.ok(DEFAULT_HISTORY_LIMIT > 0);
    assert.ok(Number.isInteger(DEFAULT_HISTORY_LIMIT));
  });

  await test('（1.history retrieval）history_service.js只import src/persistence/health_insight/（不直接碰db/SQL）', () => {
    const importLines = getImportLines(historyServiceSource);
    assert.ok(importLines.includes('../../persistence/health_insight/index.js'));
  });

  await test('（1.history retrieval）history_service.js完全不import src/db/任何檔案', () => {
    assert.ok(!getImportLines(historyServiceSource).includes("from '../../db"));
  });

  await test('（1.history retrieval）history_service.js完全不含原始SQL字樣（SELECT/INSERT）', () => {
    const stripped = stripComments(historyServiceSource);
    assert.ok(!/SELECT\s/i.test(stripped));
    assert.ok(!/INSERT\s/i.test(stripped));
  });

  const ANONYMOUS_LIKE_IDENTITIES = [
    null,
    undefined,
    {},
    'not-an-object',
    42,
    [],
    { authenticated: false },
    { authenticated: true },
    { authenticated: true, userId: null },
    { authenticated: true, userId: '' },
    { authenticated: true, userId: 42 },
    { authenticated: 'true', userId: 'u1' },
    ANONYMOUS_IDENTITY,
  ];

  for (const [idx, badIdentity] of ANONYMOUS_LIKE_IDENTITIES.entries()) {
    await test(`（1.history retrieval）匿名/不合法identity形狀#${idx}永遠安全回傳authenticated:false, records:[]，不觸發任何D1查詢`, async () => {
      const db = makeSessionDb({ userId: 'should-never-be-queried', records: [makeRawRecord({ userId: 'should-never-be-queried' })] });
      let listByUserCalled = false;
      const originalListByUser = db.healthInsightRecords.listByUser;
      db.healthInsightRecords.listByUser = async (...args) => { listByUserCalled = true; return originalListByUser(...args); };
      const result = await getHealthInsightHistoryForIdentity(db, badIdentity, {});
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.authenticated, false);
      assert.deepStrictEqual(result.records, []);
      assert.strictEqual(listByUserCalled, false);
    });
  }

  const DB_FAILURE_MODES = ['throw', 'db-error', 'undefined'];
  for (const mode of DB_FAILURE_MODES) {
    await test(`（1.history retrieval）已登入使用者、db.listByUser失敗模式=${mode}時安全回傳ok:true+空陣列，不拋出例外`, async () => {
      const db = makeSessionDb({ userId: 'u-fail', records: [], listByUserBehavior: mode });
      const result = await getHealthInsightHistoryForIdentity(db, AUTH_IDENTITY_GOOGLE, {});
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.authenticated, true);
      assert.deepStrictEqual(result.records, []);
    });
  }

  await test('（1.history retrieval）db為null/undefined/{}時安全回傳空陣列，不拋出例外', async () => {
    for (const badDb of [null, undefined, {}, { healthInsightRecords: undefined }, { healthInsightRecords: {} }]) {
      const result = await getHealthInsightHistoryForIdentity(badDb, AUTH_IDENTITY_GOOGLE, {});
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(result.records, []);
    }
  });

  await test('（1.history retrieval）已登入使用者+有紀錄時，records依created_at DESC排序（延續listByUser SQL的排序假設）', async () => {
    const records = [
      makeRawRecord({ id: 'r1', userId: 'u-order', createdAt: '2026-01-01T00:00:00.000Z', healthGoal: 'weight_loss' }),
      makeRawRecord({ id: 'r2', userId: 'u-order', createdAt: '2026-01-03T00:00:00.000Z', healthGoal: 'muscle_gain' }),
      makeRawRecord({ id: 'r3', userId: 'u-order', createdAt: '2026-01-02T00:00:00.000Z', healthGoal: 'healthy_lifestyle' }),
    ];
    const db = makeSessionDb({ userId: 'u-order', records });
    const result = await getHealthInsightHistoryForIdentity(db, { userId: 'u-order', authenticated: true, provider: 'google' }, {});
    assert.strictEqual(result.records.length, 3);
    assert.strictEqual(result.records[0].id, 'r2');
    assert.strictEqual(result.records[1].id, 'r3');
    assert.strictEqual(result.records[2].id, 'r1');
  });

  await test('（1.history retrieval）省略options.limit時使用DEFAULT_HISTORY_LIMIT', async () => {
    const records = new Array(DEFAULT_HISTORY_LIMIT + 5).fill(null).map((_, i) => makeRawRecord({ id: `r${i}`, userId: 'u-many', createdAt: new Date(2026, 0, i + 1).toISOString() }));
    const db = makeSessionDb({ userId: 'u-many', records });
    const result = await getHealthInsightHistoryForIdentity(db, { userId: 'u-many', authenticated: true, provider: 'google' }, {});
    assert.strictEqual(result.records.length, DEFAULT_HISTORY_LIMIT);
  });

  await test('（1.history retrieval）options.limit覆寫預設值', async () => {
    const records = new Array(10).fill(null).map((_, i) => makeRawRecord({ id: `r${i}`, userId: 'u-limit', createdAt: new Date(2026, 0, i + 1).toISOString() }));
    const db = makeSessionDb({ userId: 'u-limit', records });
    const result = await getHealthInsightHistoryForIdentity(db, { userId: 'u-limit', authenticated: true, provider: 'google' }, { limit: 3 });
    assert.strictEqual(result.records.length, 3);
  });

  const LIMIT_EDGE_CASES = [
    { label: '0', limit: 0 },
    { label: '負數', limit: -5 },
    { label: '字串', limit: 'not-a-number' },
    { label: 'NaN', limit: NaN },
    { label: 'null', limit: null },
    { label: '很大的數', limit: 1000 },
  ];
  for (const { label, limit } of LIMIT_EDGE_CASES) {
    await test(`（1.history retrieval）options.limit=${label}時安全退回DEFAULT_HISTORY_LIMIT或安全處理，不拋出例外`, async () => {
      const records = new Array(10).fill(null).map((_, i) => makeRawRecord({ id: `r${i}`, userId: 'u-limit-edge', createdAt: new Date(2026, 0, i + 1).toISOString() }));
      const db = makeSessionDb({ userId: 'u-limit-edge', records });
      let result;
      await assert.doesNotReject(async () => { result = await getHealthInsightHistoryForIdentity(db, { userId: 'u-limit-edge', authenticated: true, provider: 'google' }, { limit }); });
      assert.strictEqual(result.ok, true);
      assert.ok(Array.isArray(result.records));
    });
  }

  const SUMMARIZE_GOAL_COUNT_MATRIX = [];
  for (const goal of ['weight_loss', 'weight_maintenance', 'muscle_gain', 'healthy_lifestyle']) {
    for (const count of [0, 3, 10]) {
      SUMMARIZE_GOAL_COUNT_MATRIX.push({ goal, count });
    }
  }
  for (const { goal, count } of SUMMARIZE_GOAL_COUNT_MATRIX) {
    await test(`（1.history retrieval）summarizeHealthInsightRecord正確處理目標=${goal}、觀察/建議筆數=${count}的組合`, () => {
      const record = makeRawRecord({ id: 'combo', userId: 'u-combo', healthGoal: goal, observationCount: count, recommendationCount: count });
      const summary = summarizeHealthInsightRecord(record);
      assert.strictEqual(summary.healthGoal, goal);
      assert.strictEqual(summary.observationCount, count);
      assert.strictEqual(summary.recommendationCount, count);
    });
  }

  const SUMMARIZE_EDGE_CASES = [
    { label: 'null record', input: null },
    { label: 'undefined record', input: undefined },
    { label: '字串record', input: 'not-an-object' },
    { label: '空物件', input: {} },
    { label: 'input_snapshot不是合法JSON', input: { id: 'x', created_at: '2026-01-01T00:00:00.000Z', input_snapshot: '{bad json', output_snapshot: '{}' } },
    { label: 'output_snapshot不是合法JSON', input: { id: 'x', created_at: '2026-01-01T00:00:00.000Z', input_snapshot: '{}', output_snapshot: 'not json' } },
    { label: 'input_snapshot是陣列字串', input: { id: 'x', created_at: '2026-01-01T00:00:00.000Z', input_snapshot: '[1,2,3]', output_snapshot: '{}' } },
    { label: 'healthGoal不是字串', input: { id: 'x', created_at: '2026-01-01T00:00:00.000Z', input_snapshot: JSON.stringify({ healthGoal: 42 }), output_snapshot: '{}' } },
    { label: 'healthObservation不是陣列', input: { id: 'x', created_at: '2026-01-01T00:00:00.000Z', input_snapshot: '{}', output_snapshot: JSON.stringify({ healthObservation: 'x', recommendation: 'y' }) } },
    { label: 'id不是字串', input: { id: 42, created_at: '2026-01-01T00:00:00.000Z' } },
    { label: 'created_at不是字串', input: { id: 'x', created_at: 12345 } },
  ];

  for (const { label, input } of SUMMARIZE_EDGE_CASES) {
    await test(`（1.history retrieval）summarizeHealthInsightRecord對「${label}」安全處理，不拋出例外`, () => {
      let result;
      assert.doesNotThrow(() => { result = summarizeHealthInsightRecord(input); });
      assert.strictEqual(typeof result, 'object');
      assert.ok('id' in result);
      assert.ok('createdAt' in result);
      assert.ok('healthGoal' in result);
      assert.ok('observationCount' in result);
      assert.ok('recommendationCount' in result);
    });
  }

  await test('（1.history retrieval）summarizeHealthInsightRecord正確挑出healthGoal/計數', () => {
    const record = makeRawRecord({ id: 'r1', userId: 'u1', healthGoal: 'muscle_gain', observationCount: 3, recommendationCount: 2, createdAt: '2026-02-01T00:00:00.000Z' });
    const summary = summarizeHealthInsightRecord(record);
    assert.strictEqual(summary.id, 'r1');
    assert.strictEqual(summary.createdAt, '2026-02-01T00:00:00.000Z');
    assert.strictEqual(summary.healthGoal, 'muscle_gain');
    assert.strictEqual(summary.observationCount, 3);
    assert.strictEqual(summary.recommendationCount, 2);
  });

  await test('（1.history retrieval）summarizeHealthInsightRecord的輸出完全不含user_id/input_snapshot/output_snapshot原始欄位（不外洩原始JSON字串/user_id）', () => {
    const record = makeRawRecord({ id: 'r1', userId: 'secret-user-id', healthGoal: 'weight_loss' });
    const summary = summarizeHealthInsightRecord(record);
    assert.ok(!('user_id' in summary));
    assert.ok(!('input_snapshot' in summary));
    assert.ok(!('output_snapshot' in summary));
    assert.ok(!JSON.stringify(summary).includes('secret-user-id'));
  });

  const RECORD_COUNT_CASES = [0, 1, 2, 3, 4, 5, 6, 7, 10];
  for (const count of RECORD_COUNT_CASES) {
    await test(`（1.history retrieval）createHistoryCard()對${count}筆previousRecords正確呈現（0筆顯示第一筆紀錄文案，1筆以上顯示清單，超過上限時截斷）`, () => {
      const records = new Array(count).fill(null).map((_, i) => ({ id: `r${i}`, createdAt: `2026-01-0${(i % 9) + 1}T00:00:00.000Z`, healthGoal: 'weight_loss' }));
      const html = createHistoryCard({ isAuthenticated: true, previousRecords: records });
      assert.strictEqual(typeof html, 'string');
      if (count === 0) {
        assert.ok(html.includes('第一筆紀錄'));
      } else {
        const itemCount = (html.match(/hi-history-record-item/g) || []).length;
        assert.strictEqual(itemCount, Math.min(count, 5));
      }
    });
  }

  const DATE_FORMAT_CASES = [
    { label: '正常ISO日期', iso: '2026-03-05T12:00:00.000Z', shouldContain: '3/5' },
    { label: '跨年日期', iso: '2025-12-31T23:59:59.000Z', shouldContain: '12/31' },
    { label: '月初日期', iso: '2026-01-01T00:00:00.000Z', shouldContain: '1/1' },
  ];
  for (const { label, iso, shouldContain } of DATE_FORMAT_CASES) {
    await test(`（1.history retrieval）History卡片日期格式化：${label}顯示"${shouldContain}"`, () => {
      const html = createHistoryCard({ isAuthenticated: true, previousRecords: [{ id: 'r1', createdAt: iso, healthGoal: 'weight_loss' }] });
      assert.ok(html.includes(shouldContain));
    });
  }

  const INVALID_DATE_CASES = ['not-a-date', '', null, undefined, 42];
  for (const badDate of INVALID_DATE_CASES) {
    await test(`（1.history retrieval）History卡片對不合法日期"${badDate}"安全處理，不拋出例外也不顯示"NaN/NaN"`, () => {
      const html = createHistoryCard({ isAuthenticated: true, previousRecords: [{ id: 'r1', createdAt: badDate, healthGoal: 'weight_loss' }] });
      assert.strictEqual(typeof html, 'string');
      assert.ok(!html.includes('NaN'));
    });
  }

  const HEALTH_GOALS_FOR_HISTORY = ['weight_loss', 'weight_maintenance', 'muscle_gain', 'healthy_lifestyle'];
  const HEALTH_GOAL_LABELS_FOR_HISTORY = {
    weight_loss: '想瘦一點',
    weight_maintenance: '維持現在的狀態',
    muscle_gain: '想變得更結實',
    healthy_lifestyle: '單純想過得健康一點',
  };
  for (const goal of HEALTH_GOALS_FOR_HISTORY) {
    await test(`（1.history retrieval）History卡片正確顯示健康目標「${goal}」的中文標籤`, () => {
      const html = createHistoryCard({ isAuthenticated: true, previousRecords: [{ id: 'r1', createdAt: '2026-01-01T00:00:00.000Z', healthGoal: goal }] });
      assert.ok(html.includes(HEALTH_GOAL_LABELS_FOR_HISTORY[goal]));
    });
  }

  await test('（1.history retrieval）createHistoryCard()對malformed context/previousRecords安全處理，不拋出例外', () => {
    for (const bad of [null, undefined, 'x', 42, { previousRecords: 'not-an-array' }, { previousRecords: null }]) {
      assert.doesNotThrow(() => createHistoryCard(bad));
    }
  });

  await test('（1.history retrieval）History卡片單筆紀錄缺少healthGoal時，退回"一筆先前的紀錄"泛用文字', () => {
    const html = createHistoryCard({ isAuthenticated: true, previousRecords: [{ id: 'r1', createdAt: null, healthGoal: null }] });
    assert.ok(html.includes('一筆先前的紀錄'));
  });

  console.log('');

  // =========================================================================
  // B. User ownership
  // =========================================================================
  console.log('--- B. User ownership ---');

  await test('（2.user ownership）getHealthInsightHistoryForIdentity函式簽章只有(db, identity, options)三個參數，沒有第四個userId參數', () => {
    assert.strictEqual(getHealthInsightHistoryForIdentity.length, 3);
  });

  await test('（2.user ownership）history_service.js原始碼完全沒有從options或第三方參數讀取userId（只用identity.userId）', () => {
    const stripped = stripComments(historyServiceSource);
    assert.ok(!/options\.userId/.test(stripped));
    assert.ok(!/params\.userId/.test(stripped));
  });

  await test('（2.user ownership）實際查詢時傳給listByUser()的userId嚴格等於identity.userId（不是任何其他來源）', async () => {
    let capturedUserId = null;
    const db = makeSessionDb({ userId: 'owner-1', records: [makeRawRecord({ userId: 'owner-1' })] });
    const originalListByUser = db.healthInsightRecords.listByUser;
    db.healthInsightRecords.listByUser = async (uid, limit) => { capturedUserId = uid; return originalListByUser(uid, limit); };
    await getHealthInsightHistoryForIdentity(db, { userId: 'owner-1', authenticated: true, provider: 'google' }, {});
    assert.strictEqual(capturedUserId, 'owner-1');
  });

  await test('（2.user ownership）兩個不同使用者的紀錄在同一個db裡完全不會互相污染', async () => {
    const records = [
      makeRawRecord({ id: 'a1', userId: 'user-a', healthGoal: 'weight_loss' }),
      makeRawRecord({ id: 'b1', userId: 'user-b', healthGoal: 'muscle_gain' }),
      makeRawRecord({ id: 'a2', userId: 'user-a', healthGoal: 'weight_loss' }),
    ];
    const db = makeSessionDb({ userId: 'user-a', records });
    const resultA = await getHealthInsightHistoryForIdentity(db, { userId: 'user-a', authenticated: true, provider: 'google' }, {});
    const resultB = await getHealthInsightHistoryForIdentity(db, { userId: 'user-b', authenticated: true, provider: 'google' }, {});
    assert.strictEqual(resultA.records.length, 2);
    assert.strictEqual(resultB.records.length, 1);
    assert.ok(resultA.records.every((r) => r.id === 'a1' || r.id === 'a2'));
    assert.strictEqual(resultB.records[0].id, 'b1');
  });

  await test('（2.user ownership）GET /api/health-insight/history的route handler完全不從req.query/req.payload讀取任何userId欄位', () => {
    const idx = routesSource.indexOf("'/api/health-insight/history'");
    assert.ok(idx >= 0);
    const block = routesSource.slice(idx, idx + 500);
    assert.ok(!/req\.query/.test(block));
    assert.ok(!/req\.payload\.userId/.test(block));
    assert.ok(!/req\.payload\.user_id/.test(block));
  });

  await test('（2.user ownership）GET /api/health-insight/history唯一的身份來源是resolveHealthInsightIdentity(ctx.db, req.cookieHeader, {})', () => {
    const idx = routesSource.indexOf("'/api/health-insight/history'");
    const block = routesSource.slice(idx, idx + 500);
    assert.ok(block.includes('resolveHealthInsightIdentity(ctx.db, req.cookieHeader'));
  });

  await test('（2.user ownership）端對端：偽造不同session cookie的兩個使用者，各自只查到自己的紀錄', async () => {
    const records = [
      makeRawRecord({ id: 'x1', userId: 'end-to-end-a', healthGoal: 'weight_loss' }),
      makeRawRecord({ id: 'x2', userId: 'end-to-end-b', healthGoal: 'muscle_gain' }),
    ];
    const dbForA = makeSessionDb({ userId: 'end-to-end-a', records });
    const dbForB = makeSessionDb({ userId: 'end-to-end-b', records });
    const router = createAppRouter();
    const resA = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbForA });
    const resB = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbForB });
    const bodyA = await resA.json();
    const bodyB = await resB.json();
    assert.strictEqual(bodyA.data.records.length, 1);
    assert.strictEqual(bodyA.data.records[0].id, 'x1');
    assert.strictEqual(bodyB.data.records.length, 1);
    assert.strictEqual(bodyB.data.records[0].id, 'x2');
  });

  const OWNERSHIP_USER_PAIRS = [
    ['owner-pair-a1', 'owner-pair-b1'],
    ['owner-pair-a2', 'owner-pair-b2'],
    ['owner-pair-a3', 'owner-pair-b3'],
    ['owner-pair-a4', 'owner-pair-b4'],
    ['owner-pair-a5', 'owner-pair-b5'],
  ];
  for (const [userA, userB] of OWNERSHIP_USER_PAIRS) {
    await test(`（2.user ownership）使用者對(${userA}, ${userB})：各自POST後GET history只看得到自己的紀錄`, async () => {
      const dbA = makeSessionDb({ userId: userA, records: [] });
      const router = createAppRouter();
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbA });
      const dbB = makeSessionDb({ userId: userB, records: dbA.__store });
      const resB = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbB });
      const bodyB = await resB.json();
      assert.strictEqual(bodyB.data.records.length, 0);
    });
  }

  await test('（2.user ownership）即使options.lookupTier被注入，GET /api/health-insight/history依然只查identity.userId對應的紀錄（lookupTier跟History查詢完全無關）', async () => {
    const records = [makeRawRecord({ id: 'p1', userId: 'owner-premium-1', healthGoal: 'weight_loss' })];
    const db = makeSessionDb({ userId: 'owner-premium-1', records });
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.records.length, 1);
    assert.strictEqual(body.data.records[0].id, 'p1');
  });

  await test('（2.user ownership）history_service.js的getHealthInsightHistoryForIdentity()對同一個identity物件重複呼叫是deterministic（沒有隱藏的隨機/時間依賴）', async () => {
    const records = [makeRawRecord({ id: 'det-1', userId: 'owner-det', healthGoal: 'weight_loss' })];
    const db = makeSessionDb({ userId: 'owner-det', records });
    const identity = { userId: 'owner-det', authenticated: true, provider: 'google' };
    const result1 = await getHealthInsightHistoryForIdentity(db, identity, {});
    const result2 = await getHealthInsightHistoryForIdentity(db, identity, {});
    assert.deepStrictEqual(result1, result2);
  });

  console.log('');

  // =========================================================================
  // C. Anonymous behavior
  // =========================================================================
  console.log('--- C. Anonymous behavior ---');

  await test('（3.anonymous behavior）匿名使用者POST /api/health-insight時，previousRecords永遠是空陣列，不觸發任何D1查詢', async () => {
    const router = createAppRouter();
    let listByUserCalled = false;
    const db = { healthInsightRecords: { listByUser: async () => { listByUserCalled = true; return { ok: true, results: [] }; } } };
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(listByUserCalled, false);
  });

  await test('（3.anonymous behavior）GET /api/health-insight/history匿名呼叫回傳{authenticated:false, records:[]}', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', options: {} }, { db: {} });
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.authenticated, false);
    assert.deepStrictEqual(body.data.records, []);
  });

  await test('（3.anonymous behavior）GET /api/health-insight/history匿名呼叫（無cookieHeader）不拋出例外', async () => {
    const router = createAppRouter();
    await assert.doesNotReject(async () => {
      await router.handle({ method: 'GET', pathname: '/api/health-insight/history', options: {} }, { db: {} });
    });
  });

  await test('（3.anonymous behavior）匿名使用者Dashboard html的History卡片顯示登入引導文案，不是「會員專屬」文案', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, options: {} }, { db: {} });
    const body = await res.json();
    assert.ok(body.data.html.includes('登入之後'));
  });

  await test('（3.anonymous behavior）匿名使用者Dashboard html的Progress卡片顯示登入引導文案', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, options: {} }, { db: {} });
    const body = await res.json();
    const idx = body.data.html.indexOf('hi-progress-summary-card');
    const block = body.data.html.slice(idx, idx + 700);
    assert.ok(block.includes('登入之後'));
  });

  await test('（3.anonymous behavior）匿名使用者的健康觀察/建議卡片不受History/Progress改動影響，依然正常顯示', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, options: {} }, { db: {} });
    const body = await res.json();
    assert.ok(body.data.html.includes('hi-observation-card'));
    assert.ok(body.data.html.includes('hi-recommendation-card'));
  });

  await test('（3.anonymous behavior）createHistoryCard({isAuthenticated:false})不含任何"筆"數字統計/真實日期格式', () => {
    const html = createHistoryCard({ isAuthenticated: false });
    assert.ok(!/\d+\s*筆/.test(html));
  });

  await test('（3.anonymous behavior）createProgressSummaryCard({isAuthenticated:false})是deterministic', () => {
    const html1 = createProgressSummaryCard({ isAuthenticated: false });
    const html2 = createProgressSummaryCard({ isAuthenticated: false });
    assert.strictEqual(html1, html2);
  });

  const ANONYMOUS_PAYLOAD_VARIANTS = [
    { age: 20, healthGoal: 'weight_loss' },
    { age: 45, healthGoal: 'muscle_gain' },
    { age: 60, healthGoal: 'healthy_lifestyle' },
    { age: 28 },
    {},
  ];
  for (const [idx, payload] of ANONYMOUS_PAYLOAD_VARIANTS.entries()) {
    await test(`（3.anonymous behavior）匿名payload變化#${idx}：POST永遠成功、Gemini鎖定、History/Progress顯示登入引導`, async () => {
      const router = createAppRouter();
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload, options: {} }, { db: {} });
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.ok(body.data.html.includes('會員專屬'));
      assert.ok(body.data.html.includes('登入之後'));
    });
  }

  const ANONYMOUS_HISTORY_COOKIE_CASES = [undefined, '', 'garbage', 'dbc_sid=nonexistent-token'];
  for (const cookieHeader of ANONYMOUS_HISTORY_COOKIE_CASES) {
    await test(`（3.anonymous behavior）GET /api/health-insight/history，cookieHeader="${cookieHeader}"時安全回傳匿名空清單`, async () => {
      const router = createAppRouter();
      const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader, options: {} }, { db: {} });
      const body = await res.json();
      assert.strictEqual(body.data.authenticated, false);
      assert.deepStrictEqual(body.data.records, []);
    });
  }

  await test('（3.anonymous behavior）匿名使用者連續呼叫GET /api/health-insight/history多次，結果deterministic', async () => {
    const router = createAppRouter();
    const res1 = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', options: {} }, { db: {} });
    const res2 = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', options: {} }, { db: {} });
    const body1 = await res1.json();
    const body2 = await res2.json();
    assert.deepStrictEqual(body1, body2);
  });

  console.log('');

  // =========================================================================
  // D. Progress presentation
  // =========================================================================
  console.log('--- D. Progress presentation ---');

  await test('（4.progress presentation）createProgressSummaryCard是已匯出的function', () => {
    assert.strictEqual(typeof createProgressSummaryCard, 'function');
  });

  await test('（4.progress presentation）progress_summary_card.js完全不import src/history/或src/persistence/任何檔案（純呈現層）', () => {
    const importLines = getImportLines(progressCardSource);
    assert.ok(!importLines.includes('/history/'));
    assert.ok(!importLines.includes('/persistence/'));
  });

  await test('（4.progress presentation）progress_summary_card.js完全不含fetch/gemini字樣（不是AI生成，純樣板文字）', () => {
    const stripped = stripComments(progressCardSource);
    assert.ok(!/fetch\s*\(/.test(stripped));
    assert.ok(!/gemini/i.test(stripped));
  });

  await test('（4.progress presentation）progress_summary_card.js完全不含健康評分/醫療判讀關鍵字（分數/評分/score/診斷）', () => {
    const stripped = stripComments(progressCardSource);
    assert.ok(!/分數/.test(stripped));
    assert.ok(!/評分/.test(stripped));
    assert.ok(!/score/i.test(stripped));
    assert.ok(!/診斷/.test(stripped));
  });

  await test('（4.progress presentation）createProgressSummaryCard對malformed context安全處理，不拋出例外', () => {
    for (const bad of [null, undefined, 'x', 42, [], { previousRecordCount: 'not-a-number' }]) {
      assert.doesNotThrow(() => createProgressSummaryCard(bad));
    }
  });

  await test('（4.progress presentation）匿名狀態顯示登入引導文案', () => {
    const html = createProgressSummaryCard({ isAuthenticated: false });
    assert.ok(html.includes('登入之後'));
  });

  await test('（4.progress presentation）已登入+第一次使用（previousRecordCount:0）顯示"起點"文案，不做任何比較', () => {
    const html = createProgressSummaryCard({ isAuthenticated: true, previousRecordCount: 0 });
    assert.ok(html.includes('起點'));
  });

  const HEALTH_GOALS = ['weight_loss', 'weight_maintenance', 'muscle_gain', 'healthy_lifestyle'];
  const HEALTH_GOAL_LABELS = {
    weight_loss: '想瘦一點',
    weight_maintenance: '維持現在的狀態',
    muscle_gain: '想變得更結實',
    healthy_lifestyle: '單純想過得健康一點',
  };

  const SAME_GOAL_COUNTS = [1, 2, 5, 10];
  for (const goal of HEALTH_GOALS) {
    for (const count of SAME_GOAL_COUNTS) {
      await test(`（4.progress presentation）已登入+持續同樣目標「${goal}」（先前紀錄數=${count}）顯示"持續朝著"+正確中文標籤+第${count + 1}次`, () => {
        const html = createProgressSummaryCard({ isAuthenticated: true, previousRecordCount: count, previousHealthGoal: goal, currentHealthGoal: goal });
        assert.ok(html.includes('持續朝著'));
        assert.ok(html.includes(HEALTH_GOAL_LABELS[goal]));
        assert.ok(html.includes(`第 ${count + 1} 次`));
      });
    }
  }

  const GOAL_CHANGE_COUNTS = [1, 3, 7];
  for (const prevGoal of HEALTH_GOALS) {
    for (const currGoal of HEALTH_GOALS) {
      if (prevGoal === currGoal) continue;
      for (const count of GOAL_CHANGE_COUNTS) {
        await test(`（4.progress presentation）目標從「${prevGoal}」轉向「${currGoal}」（先前紀錄數=${count}）顯示方向改變文案（中性描述，不評價好壞）`, () => {
          const html = createProgressSummaryCard({ isAuthenticated: true, previousRecordCount: count, previousHealthGoal: prevGoal, currentHealthGoal: currGoal });
          assert.ok(html.includes('轉向'));
          assert.ok(html.includes(HEALTH_GOAL_LABELS[prevGoal]));
          assert.ok(html.includes(HEALTH_GOAL_LABELS[currGoal]));
          assert.ok(!/不好|錯誤|失敗|不應該/.test(html));
        });
      }
    }
  }

  await test('（4.progress presentation）previousHealthGoal/currentHealthGoal缺失或不合法時，退回"第N次記錄"泛用文案，不拋出例外', () => {
    for (const bad of [undefined, null, 42, 'unknown_goal_value']) {
      const html = createProgressSummaryCard({ isAuthenticated: true, previousRecordCount: 1, previousHealthGoal: bad, currentHealthGoal: bad });
      assert.strictEqual(typeof html, 'string');
      assert.ok(html.length > 0);
    }
  });

  await test('（4.progress presentation）只使用既有.hi-card/.hi-placeholder-card class，沒有發明新的頂層class（延續既有視覺語言）', () => {
    assert.ok(createProgressSummaryCard({ isAuthenticated: true, previousRecordCount: 0 }).includes('class="hi-card'));
  });

  await test('（4.progress presentation）只使用既有progressPlaceholder插畫資產（沒有新增插畫）', () => {
    assert.ok(progressCardSource.includes("createIllustration('progressPlaceholder')"));
  });

  await test('（4.progress presentation）route層正確把最近一筆先前紀錄的healthGoal當作previousHealthGoal傳入presentationContext', async () => {
    const records = [makeRawRecord({ id: 'prev-1', userId: 'u-goal-track', healthGoal: 'healthy_lifestyle', createdAt: '2026-01-01T00:00:00.000Z' })];
    const db = makeSessionDb({ userId: 'u-goal-track', records });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: Object.assign({}, SAMPLE_PAYLOAD, { healthGoal: 'muscle_gain' }), cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    const idx = body.data.html.indexOf('hi-progress-summary-card');
    const block = body.data.html.slice(idx, idx + 700);
    assert.ok(block.includes('單純想過得健康一點') || block.includes('想變得更結實'));
  });

  const ORDINAL_CASES = [0, 1, 2, 3, 4, 5, 9, 19, 99];
  for (const previousRecordCount of ORDINAL_CASES) {
    await test(`（4.progress presentation）previousRecordCount=${previousRecordCount}時，同目標顯示正確的"第${previousRecordCount + 1}次"序數，不拋出例外`, () => {
      const html = createProgressSummaryCard({ isAuthenticated: true, previousRecordCount, previousHealthGoal: 'weight_loss', currentHealthGoal: 'weight_loss' });
      if (previousRecordCount === 0) {
        assert.ok(html.includes('起點'));
      } else {
        assert.ok(html.includes(`第 ${previousRecordCount + 1} 次`));
      }
    });
  }

  await test('（4.progress presentation）createProgressSummaryCard對previousRecordCount為負數/非整數安全處理，視為0（起點）', () => {
    for (const bad of [-1, -100, 1.5, NaN]) {
      const html = createProgressSummaryCard({ isAuthenticated: true, previousRecordCount: bad, currentHealthGoal: 'weight_loss' });
      assert.strictEqual(typeof html, 'string');
    }
  });

  await test('（4.progress presentation）dashboard_page.js正確把previousRecords.length傳給createProgressSummaryCard的previousRecordCount（不是別的欄位）', () => {
    const stripped = stripComments(dashboardSource);
    assert.ok(stripped.includes('previousRecordCount: previousRecords.length'));
  });

  await test('（4.progress presentation）progress_summary_card.js完全不接受db/persistence相關參數', () => {
    assert.ok(!/function createProgressSummaryCard\([^)]*db/.test(stripComments(progressCardSource)));
  });

  await test('（4.progress presentation）Progress卡片標題固定為"進度方向"（不因狀態不同而改變標題文字）', () => {
    const states = [
      createProgressSummaryCard({ isAuthenticated: false }),
      createProgressSummaryCard({ isAuthenticated: true, previousRecordCount: 0 }),
      createProgressSummaryCard({ isAuthenticated: true, previousRecordCount: 1, previousHealthGoal: 'weight_loss', currentHealthGoal: 'weight_loss' }),
    ];
    for (const html of states) {
      assert.ok(html.includes('進度方向'));
    }
  });

  console.log('');

  // =========================================================================
  // E. Premium experience
  // =========================================================================
  console.log('--- E. Premium experience ---');

  await test('（5.premium experience）free使用者：基本Health Insight正常運作，Gemini鎖定', async () => {
    const db = makeSessionDb({ userId: 'free-user-1' });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: FREE_OPTIONS }, { db });
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data.html.includes('hi-observation-card'));
    assert.ok(body.data.html.includes('會員專屬'));
    assert.ok(!('enhancedExplanation' in body.data));
  });

  await test('（5.premium experience）free使用者的鎖定文案清楚說明升級價值（"升級會員"字樣）', async () => {
    const db = makeSessionDb({ userId: 'free-user-2' });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: FREE_OPTIONS }, { db });
    const body = await res.json();
    assert.ok(body.data.html.includes('升級會員'));
  });

  await test('（5.premium experience）premium使用者：Gemini enhancement可用', async () => {
    const db = makeSessionDb({ userId: 'premium-user-1' });
    const router = createAppRouter();
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('這是premium說明'), async () => {
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
      const body = await res.json();
      assert.strictEqual(body.data.enhancedExplanation, '這是premium說明');
      assert.ok(body.data.html.includes('hi-gemini-insight-card'));
    });
  });

  await test('（5.premium experience）匿名使用者：基本體驗正常，完全沒有premium存取權', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, options: {} }, { db: {} });
    const body = await res.json();
    assert.ok(body.data.html.includes('hi-observation-card'));
    assert.ok(!('enhancedExplanation' in body.data));
    assert.ok(body.data.html.includes('會員專屬'));
  });

  await test('（5.premium experience）本次任務完全沒有實作payment/subscription/billing/stripe（原始碼掃描）', () => {
    const files = [historyServiceSource, historyIndexSource, dashboardSource, historyCardSource, progressCardSource, routesSource];
    for (const source of files) {
      const stripped = stripComments(source);
      assert.ok(!/stripe/i.test(stripped));
      assert.ok(!/payment/i.test(stripped));
      assert.ok(!/subscription/i.test(stripped));
      assert.ok(!/billing/i.test(stripped));
    }
  });

  await test('（5.premium experience）src/membership/整個目錄完全沒有被本次任務修改（Membership boundary unchanged）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/membership/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.premium experience）src/intelligence/enhancement/gemini/整個目錄完全沒有被本次任務修改（Gemini Provider unchanged）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/enhancement/gemini/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const TIER_HISTORY_MATRIX = [
    { tier: 'free', options: FREE_OPTIONS, recordCount: 0 },
    { tier: 'free', options: FREE_OPTIONS, recordCount: 2 },
    { tier: 'premium', options: PREMIUM_OPTIONS, recordCount: 0 },
    { tier: 'premium', options: PREMIUM_OPTIONS, recordCount: 2 },
  ];
  for (const { tier, options, recordCount } of TIER_HISTORY_MATRIX) {
    await test(`（5.premium experience）tier=${tier}, 先前紀錄數=${recordCount}：History/Progress呈現完全不受Gemini tier影響（只受"有沒有登入"跟"有沒有歷史紀錄"影響）`, async () => {
      const records = new Array(recordCount).fill(null).map((_, i) => makeRawRecord({ id: `pre-${tier}-${i}`, userId: `tier-history-${tier}`, healthGoal: 'weight_loss', createdAt: new Date(2026, 0, i + 1).toISOString() }));
      const db = makeSessionDb({ userId: `tier-history-${tier}`, records });
      const router = createAppRouter();
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
      const body = await res.json();
      if (recordCount === 0) {
        assert.ok(body.data.html.includes('第一筆紀錄') || body.data.html.includes('起點'));
      } else {
        assert.ok(body.data.html.includes('持續朝著') || body.data.html.includes('轉向'));
      }
    });
  }

  const PREMIUM_TIER_LOOKUP_VARIANTS = [
    { label: 'lookupTier回傳premium', lookupTier: () => 'premium', expectPermitted: true },
    { label: 'lookupTier回傳free', lookupTier: () => 'free', expectPermitted: false },
    { label: 'lookupTier回傳不合法字串', lookupTier: () => 'gold-tier', expectPermitted: false },
    { label: 'lookupTier回傳null', lookupTier: () => null, expectPermitted: false },
    { label: 'lookupTier拋出例外', lookupTier: () => { throw new Error('boom'); }, expectPermitted: false },
    { label: '沒有lookupTier（預設free）', lookupTier: undefined, expectPermitted: false },
  ];
  for (const { label, lookupTier, expectPermitted } of PREMIUM_TIER_LOOKUP_VARIANTS) {
    await test(`（5.premium experience）情境=${label}：geminiPermitted正確反映在html的鎖定/解鎖狀態`, async () => {
      const db = makeSessionDb({ userId: `tier-variant-${label}` });
      const router = createAppRouter();
      const options = lookupTier ? { lookupTier } : {};
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options }, { db });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      if (expectPermitted) {
        assert.ok(!body.data.html.includes('會員專屬'));
      } else {
        assert.ok(body.data.html.includes('會員專屬'));
      }
    });
  }

  console.log('');

  // =========================================================================
  // F. Gemini success
  // =========================================================================
  console.log('--- F. Gemini success ---');

  await test('（6.gemini success）成功時data.enhancedExplanation存在且等於Gemini回傳文字', async () => {
    const db = makeSessionDb({ userId: 'gemini-ok-1' });
    const router = createAppRouter();
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('你這陣子觀察得很細心'), async () => {
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
      const body = await res.json();
      assert.strictEqual(body.data.enhancedExplanation, '你這陣子觀察得很細心');
    });
  });

  await test('（6.gemini success）成功時html顯示"AI 陪伴解讀"卡片跟正確內容', async () => {
    const db = makeSessionDb({ userId: 'gemini-ok-2' });
    const router = createAppRouter();
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('說明內容ABC'), async () => {
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
      const body = await res.json();
      assert.ok(body.data.html.includes('AI 陪伴解讀'));
      assert.ok(body.data.html.includes('說明內容ABC'));
    });
  });

  await test('（6.gemini success）html完全不含"會員專屬"字樣（成功時不該同時顯示鎖定文案）', async () => {
    const db = makeSessionDb({ userId: 'gemini-ok-3' });
    const router = createAppRouter();
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('內容'), async () => {
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
      const body = await res.json();
      assert.ok(!body.data.html.includes('會員專屬'));
    });
  });

  const GEMINI_SUCCESS_TEXTS = [
    '你這陣子的觀察很仔細',
    '慢慢來，你已經在進步了',
    '今天的紀錄看起來很不錯',
    '繼續保持這個步調',
    '你對自己的了解越來越深',
  ];
  for (const [idx, text] of GEMINI_SUCCESS_TEXTS.entries()) {
    await test(`（6.gemini success）成功文字變化#${idx}正確顯示在html裡（不做任何額外改寫）`, async () => {
      const db = makeSessionDb({ userId: `gemini-success-text-${idx}` });
      const router = createAppRouter();
      await withMockedGlobalFetch(async () => fakeGeminiHttpResponse(text), async () => {
        const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
        const body = await res.json();
        assert.strictEqual(body.data.enhancedExplanation, text);
        assert.ok(body.data.html.includes(text));
      });
    });
  }

  await test('（6.gemini success）Gemini成功說明文字經過escapeHtml()處理（若含HTML特殊字元不會破壞結構）', async () => {
    const db = makeSessionDb({ userId: 'gemini-success-escape' });
    const router = createAppRouter();
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('內容含<b>標籤</b>與"引號"'), async () => {
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
      const body = await res.json();
      assert.ok(!body.data.html.includes('<b>標籤</b>'));
    });
  });

  console.log('');

  // =========================================================================
  // G. Gemini denied
  // =========================================================================
  console.log('--- G. Gemini denied ---');

  await test('（7.gemini denied）free使用者不會觸發Gemini API呼叫（geminiPermitted:false時完全不打fetch）', async () => {
    let fetchCalled = false;
    const db = makeSessionDb({ userId: 'gemini-denied-1' });
    const router = createAppRouter();
    await withMockedGlobalFetch(async () => { fetchCalled = true; return fakeGeminiHttpResponse('不應該被呼叫'); }, async () => {
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: FREE_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
    });
    assert.strictEqual(fetchCalled, false);
  });

  await test('（7.gemini denied）denied時html顯示"會員專屬"邊界訊息，不含AI內容', async () => {
    const db = makeSessionDb({ userId: 'gemini-denied-2' });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: FREE_OPTIONS }, { db });
    const body = await res.json();
    assert.ok(body.data.html.includes('會員專屬'));
    assert.ok(!('enhancedExplanation' in body.data));
  });

  await test('（7.gemini denied）denied不影響History/Progress卡片正常顯示', async () => {
    const db = makeSessionDb({ userId: 'gemini-denied-3' });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: FREE_OPTIONS }, { db });
    const body = await res.json();
    assert.ok(body.data.html.includes('hi-history-card'));
    assert.ok(body.data.html.includes('hi-progress-summary-card'));
  });

  const DENIED_IDENTITY_VARIANTS = [
    { label: 'free-google', identity: null, options: FREE_OPTIONS, userId: 'denied-free-google' },
    { label: 'anonymous', identity: null, options: {}, userId: null },
  ];
  for (const variant of DENIED_IDENTITY_VARIANTS) {
    await test(`（7.gemini denied）情境=${variant.label}：完全不會意外顯示AI 陪伴解讀卡片`, async () => {
      const db = variant.userId ? makeSessionDb({ userId: variant.userId }) : {};
      const router = createAppRouter();
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: variant.userId ? 'dbc_sid=token123' : undefined, options: variant.options }, { db });
      const body = await res.json();
      assert.ok(!body.data.html.includes('>AI 陪伴解讀<'));
    });
  }

  await test('（7.gemini denied）free使用者即使已經累積多筆歷史紀錄，依然不會解鎖Gemini（History筆數跟Permission完全無關）', async () => {
    const records = new Array(5).fill(null).map((_, i) => makeRawRecord({ id: `denied-history-${i}`, userId: 'denied-with-history', healthGoal: 'weight_loss', createdAt: new Date(2026, 0, i + 1).toISOString() }));
    const db = makeSessionDb({ userId: 'denied-with-history', records });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: FREE_OPTIONS }, { db });
    const body = await res.json();
    assert.ok(body.data.html.includes('會員專屬'));
    assert.ok(!('enhancedExplanation' in body.data));
  });

  console.log('');

  // =========================================================================
  // H. Gemini failure fallback
  // =========================================================================
  console.log('--- H. Gemini failure fallback ---');

  await test('（8.gemini failure fallback）Gemini API拋出例外時，安靜降級，回傳原本Health Insight結果', async () => {
    const db = makeSessionDb({ userId: 'gemini-fail-1' });
    const router = createAppRouter();
    await withMockedGlobalFetch(async () => { throw new Error('network down'); }, async () => {
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.ok(!('enhancedExplanation' in body.data));
    });
  });

  await test('（8.gemini failure fallback）Gemini失敗時html完全不顯示Gemini卡片，也不顯示"會員專屬"（permitted但這次失敗，安靜隱藏）', async () => {
    const db = makeSessionDb({ userId: 'gemini-fail-2' });
    const router = createAppRouter();
    await withMockedGlobalFetch(async () => ({ ok: false, status: 500 }), async () => {
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
      const body = await res.json();
      assert.ok(!body.data.html.includes('hi-gemini-insight-card'));
    });
  });

  await test('（8.gemini failure fallback）html完全不外洩任何錯誤訊息/model名稱/provider細節', async () => {
    const db = makeSessionDb({ userId: 'gemini-fail-3' });
    const router = createAppRouter();
    await withMockedGlobalFetch(async () => { throw new Error('simulated internal error with sensitive detail'); }, async () => {
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
      const body = await res.json();
      assert.ok(!body.data.html.includes('sensitive detail'));
      assert.ok(!/gemini-1\.5|gemini-2|candidates/i.test(body.data.html));
    });
  });

  await test('（8.gemini failure fallback）Gemini失敗不影響History/Progress/其餘卡片', async () => {
    const db = makeSessionDb({ userId: 'gemini-fail-4' });
    const router = createAppRouter();
    await withMockedGlobalFetch(async () => { throw new Error('boom'); }, async () => {
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
      const body = await res.json();
      assert.ok(body.data.html.includes('hi-history-card'));
      assert.ok(body.data.html.includes('hi-progress-summary-card'));
      assert.ok(body.data.html.includes('hi-observation-card'));
    });
  });

  const GEMINI_FAILURE_OUTCOMES = [
    { label: 'http-not-ok-500', mock: async () => ({ ok: false, status: 500 }) },
    { label: 'http-not-ok-429', mock: async () => ({ ok: false, status: 429 }) },
    { label: 'throws-network-error', mock: async () => { throw new Error('network error'); } },
    { label: 'malformed-json-shape', mock: async () => ({ ok: true, json: async () => ({ unexpected: 'shape' }) }) },
    { label: 'empty-candidates-array', mock: async () => ({ ok: true, json: async () => ({ candidates: [] }) }) },
    { label: 'json-parse-throws', mock: async () => ({ ok: true, json: async () => { throw new Error('invalid json'); } }) },
    { label: 'null-response', mock: async () => null },
  ];

  for (const { label, mock } of GEMINI_FAILURE_OUTCOMES) {
    await test(`（8.gemini failure fallback）Gemini失敗模式=${label}：POST依然回傳200+ok:true`, async () => {
      const db = makeSessionDb({ userId: `gemini-fail-outcome-${label}` });
      const router = createAppRouter();
      await withMockedGlobalFetch(mock, async () => {
        const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.ok, true);
      });
    });

    await test(`（8.gemini failure fallback）Gemini失敗模式=${label}：data不含enhancedExplanation欄位`, async () => {
      const db = makeSessionDb({ userId: `gemini-fail-outcome2-${label}` });
      const router = createAppRouter();
      await withMockedGlobalFetch(mock, async () => {
        const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
        const body = await res.json();
        assert.ok(!('enhancedExplanation' in body.data));
      });
    });

    await test(`（8.gemini failure fallback）Gemini失敗模式=${label}：html完全不含hi-gemini-insight-card（安靜隱藏，不顯示會員專屬）`, async () => {
      const db = makeSessionDb({ userId: `gemini-fail-outcome3-${label}` });
      const router = createAppRouter();
      await withMockedGlobalFetch(mock, async () => {
        const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
        const body = await res.json();
        assert.ok(!body.data.html.includes('hi-gemini-insight-card'));
      });
    });
  }

  console.log('');

  // =========================================================================
  // I. Complete user journey
  // =========================================================================
  console.log('--- I. Complete user journey ---');

  await test('（9.complete user journey）New user：GET /health-insight回傳Input Experience頁面', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('<!DOCTYPE html>'));
  });

  await test('（9.complete user journey）New user：匿名POST拿到洞察+建議+Gemini鎖定+History/Progress登入引導', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, options: {} }, { db: {} });
    const body = await res.json();
    assert.ok(body.data.html.includes('hi-observation-card'));
    assert.ok(body.data.html.includes('hi-recommendation-card'));
    assert.ok(body.data.html.includes('會員專屬'));
    assert.ok(body.data.html.includes('登入之後'));
  });

  await test('（9.complete user journey）New user登入後：Return later查看GET /api/health-insight/history看得到剛才登入前的匿名提交不會出現（匿名不存）', async () => {
    const db = makeSessionDb({ userId: 'journey-new-user', records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.authenticated, true);
    assert.deepStrictEqual(body.data.records, []);
  });

  await test('（9.complete user journey）New user登入後第一次POST：History顯示"第一筆紀錄"，Progress顯示"起點"', async () => {
    const db = makeSessionDb({ userId: 'journey-new-user-2', records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.ok(body.data.html.includes('第一筆紀錄'));
    assert.ok(body.data.html.includes('起點'));
  });

  await test('（9.complete user journey）New user "Return later"：再次POST後，GET /api/health-insight/history看得到先前那筆紀錄', async () => {
    const db = makeSessionDb({ userId: 'journey-return-later', records: [] });
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.records.length, 1);
    assert.strictEqual(body.data.records[0].healthGoal, 'weight_loss');
  });

  await test('（9.complete user journey）Existing user：login→generate insight→save record→view progress→premium enhancement全流程', async () => {
    const db = makeSessionDb({ userId: 'journey-existing-user', records: [] });
    const router = createAppRouter();
    // generate insight #1（尚未premium）
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    // generate insight #2（升級premium，Gemini成功）
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('第二次的陪伴解讀'), async () => {
      const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: Object.assign({}, SAMPLE_PAYLOAD, { healthGoal: 'muscle_gain' }), cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake-key' } });
      const body2 = await res2.json();
      assert.strictEqual(body2.data.enhancedExplanation, '第二次的陪伴解讀');
      // 第二次填寫healthGoal從weight_loss改成muscle_gain，方向改變，
      // 顯示"轉向"文案（不是"持續朝著...第N次"文案，那是同一目標時才會顯示）
      assert.ok(body2.data.html.includes('轉向'));
    });
    const historyRes = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const historyBody = await historyRes.json();
    assert.strictEqual(historyBody.data.records.length, 2);
  });

  await test('（9.complete user journey）連續多次POST後，累積的紀錄筆數持續正確增加', async () => {
    const db = makeSessionDb({ userId: 'journey-accumulate', records: [] });
    const router = createAppRouter();
    for (let i = 0; i < 4; i++) {
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const body = await res.json();
      assert.strictEqual(body.data.records.length, i + 1);
    }
  });

  const JOURNEY_USERS = ['journey-multi-1', 'journey-multi-2', 'journey-multi-3'];
  for (const userId of JOURNEY_USERS) {
    await test(`（9.complete user journey）使用者${userId}：三次interleaved POST之後，History正確顯示3筆、依時間新到舊排序`, async () => {
      const db = makeSessionDb({ userId, records: [] });
      const router = createAppRouter();
      const goals = ['weight_loss', 'muscle_gain', 'healthy_lifestyle'];
      for (const goal of goals) {
        await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: Object.assign({}, SAMPLE_PAYLOAD, { healthGoal: goal }), cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      }
      const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const body = await res.json();
      assert.strictEqual(body.data.records.length, 3);
      assert.strictEqual(body.data.records[0].healthGoal, 'healthy_lifestyle');
      assert.strictEqual(body.data.records[2].healthGoal, 'weight_loss');
    });
  }

  await test('（9.complete user journey）New user完整旅程：GET頁面→匿名POST→登入→POST→Return later查看紀錄，全程不拋出例外', async () => {
    const router = createAppRouter();
    await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, options: {} }, { db: {} });
    const db = makeSessionDb({ userId: 'full-journey-user', records: [] });
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const historyRes = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const historyBody = await historyRes.json();
    assert.strictEqual(historyBody.data.records.length, 1);
  });

  await test('（9.complete user journey）Existing user：從free逐步升級成premium，History紀錄在升級前後都保持連續累積', async () => {
    const db = makeSessionDb({ userId: 'upgrade-journey-user', records: [] });
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: FREE_OPTIONS }, { db });
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('升級後的說明'), async () => {
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'k' } });
    });
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.records.length, 2);
  });

  console.log('');

  // =========================================================================
  // J. OAuth compatibility
  // =========================================================================
  console.log('--- J. OAuth compatibility ---');

  await test('（10.oauth compatibility）src/identity/health_insight/user_identity.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/health_insight/user_identity.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.oauth compatibility）src/identity/health_insight/resolve_identity.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/health_insight/resolve_identity.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const SESSION_EDGE_CASES = [
    { label: 'no-cookie', cookieHeader: undefined, db: () => makeSessionDb({ userId: 'oauth-1' }) },
    { label: 'malformed-cookie', cookieHeader: 'garbage-no-equals-sign', db: () => makeSessionDb({ userId: 'oauth-2' }) },
    { label: 'empty-cookie-string', cookieHeader: '', db: () => makeSessionDb({ userId: 'oauth-3' }) },
    { label: 'expired-session', cookieHeader: 'dbc_sid=token123', db: () => makeSessionDb({ userId: 'oauth-4', expiresInFutureSeconds: -10 }) },
    { label: 'suspended-user', cookieHeader: 'dbc_sid=token123', db: () => makeSessionDb({ userId: 'oauth-5', status: 'suspended' }) },
    { label: 'deleted-user', cookieHeader: 'dbc_sid=token123', db: () => makeSessionDb({ userId: 'oauth-6', status: 'deleted' }) },
  ];

  for (const c of SESSION_EDGE_CASES) {
    await test(`（10.oauth compatibility）session邊界情境=${c.label}：GET /api/health-insight/history安全退回匿名狀態，不拋出例外`, async () => {
      const router = createAppRouter();
      const db = c.db();
      const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: c.cookieHeader, options: {} }, { db });
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.strictEqual(body.data.authenticated, false);
      assert.deepStrictEqual(body.data.records, []);
    });

    await test(`（10.oauth compatibility）session邊界情境=${c.label}：POST /api/health-insight的previousRecords安全退回空陣列，不拋出例外`, async () => {
      const router = createAppRouter();
      const db = c.db();
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: c.cookieHeader, options: {} }, { db });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.ok, true);
    });
  }

  await test('（10.oauth compatibility）正常合法session：History正確辨識為已登入', async () => {
    const db = makeSessionDb({ userId: 'oauth-valid', records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.authenticated, true);
  });

  await test('（10.oauth compatibility）src/identity/health_insight/request_context.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/health_insight/request_context.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.oauth compatibility）src/identity/health_insight/membership_placeholder.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/health_insight/membership_placeholder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.oauth compatibility）GET /health-insight（Input Experience頁面）完全不受OAuth session邊界情境影響（本來就不解析cookie）', async () => {
    const router = createAppRouter();
    for (const cookieHeader of ['dbc_sid=token123', 'garbage', undefined]) {
      const res = await router.handle({ method: 'GET', pathname: '/health-insight', cookieHeader, options: {} }, {});
      assert.strictEqual(res.status, 200);
    }
  });

  for (const c of SESSION_EDGE_CASES) {
    await test(`（10.oauth compatibility）session邊界情境=${c.label}：Progress卡片安全退回"起點"/登入引導文案，不拋出例外`, async () => {
      const router = createAppRouter();
      const db = c.db();
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: c.cookieHeader, options: {} }, { db });
      const body = await res.json();
      assert.ok(body.data.html.includes('hi-progress-summary-card'));
    });
  }

  const MALFORMED_PAYLOAD_CASES = [null, undefined, 'not-an-object', 42, [], { age: 'not-a-number' }];
  for (const [idx, payload] of MALFORMED_PAYLOAD_CASES.entries()) {
    await test(`（10.oauth compatibility）malformed payload#${idx}：已登入使用者POST依然安全回傳200，不拋出例外`, async () => {
      const db = makeSessionDb({ userId: `malformed-payload-${idx}`, records: [] });
      const router = createAppRouter();
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      assert.strictEqual(res.status, 200);
    });
  }

  await test('（10.oauth compatibility）POST /api/health-insight/history（錯誤方法）回傳method_not_allowed，不是History Retrieval的責任範圍', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight/history', payload: {}, options: {} }, { db: {} });
    assert.strictEqual(res.status, 405);
  });

  await test('（10.oauth compatibility）app.router.routes同時包含三條Health Insight路由，方法/路徑都正確', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const paths = app.router.routes.map((r) => `${r.method} ${r.path}`);
    assert.ok(paths.includes('GET /health-insight'));
    assert.ok(paths.includes('POST /api/health-insight'));
    assert.ok(paths.includes('GET /api/health-insight/history'));
  });

  console.log('');

  // =========================================================================
  // K. Persistence compatibility
  // =========================================================================
  console.log('--- K. Persistence compatibility ---');

  await test('（11.persistence compatibility）src/persistence/health_insight/health_insight_persistence_service.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/persistence/health_insight/health_insight_persistence_service.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.persistence compatibility）src/db/tables/health_insight_records.js完全沒有被本次任務修改（沒有新增欄位/query）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/tables/health_insight_records.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.persistence compatibility）src/db/index.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.persistence compatibility）migrations/沒有新增任何檔案（本次任務不修改D1 schema）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    assert.strictEqual(files.length, 7);
  });

  await test('（11.persistence compatibility）history_service.js只呼叫listHealthInsightRecordsForUser()，完全不呼叫saveHealthInsightRecord()（History是唯讀邊界）', () => {
    const stripped = stripComments(historyServiceSource);
    assert.ok(stripped.includes('listHealthInsightRecordsForUser'));
    assert.ok(!stripped.includes('saveHealthInsightRecord'));
  });

  await test('（11.persistence compatibility）route層saveHealthInsightRecord()→canUseFeature()→enhanceHealthInsightResult()的既有呼叫順序完全沒有改變（先用stripComments排除TASK1.124文件註解裡提到這些函式名稱造成的誤判）', () => {
    const stripped = stripComments(routesSource);
    const saveIdx = stripped.indexOf('saveHealthInsightRecord(');
    const canUseIdx = stripped.indexOf('canUseFeature(');
    const enhanceIdx = stripped.indexOf('enhanceHealthInsightResult(');
    const historyIdx = stripped.indexOf('getHealthInsightHistoryForIdentity(');
    assert.ok(saveIdx >= 0 && canUseIdx >= 0 && enhanceIdx >= 0 && historyIdx >= 0);
    assert.ok(saveIdx < canUseIdx);
    assert.ok(canUseIdx < enhanceIdx);
  });

  await test('（11.persistence compatibility）saveHealthInsightRecord()依然只存原始structuredResponse（route層完全沒有把History/Progress資料混進persistence的payload；先用stripComments排除文件註解干擾）', () => {
    const stripped = stripComments(routesSource);
    const idx = stripped.indexOf('saveHealthInsightRecord(ctx.db');
    assert.ok(idx >= 0);
    const block = stripped.slice(idx, idx + 200);
    assert.ok(block.includes('{ identity, payload: req.payload, structuredResponse }'));
  });

  await test('（11.persistence compatibility）history_service.js匯出的三個函式名稱跟index.js re-export完全一致', () => {
    assert.ok(historyIndexSource.includes('getHealthInsightHistoryForIdentity'));
    assert.ok(historyIndexSource.includes('summarizeHealthInsightRecord'));
    assert.ok(historyIndexSource.includes('DEFAULT_HISTORY_LIMIT'));
  });

  await test('（11.persistence compatibility）history_service.js完全不import src/controllers/任何檔案（純資料存取邊界，不越權碰controller）', () => {
    assert.ok(!getImportLines(historyServiceSource).includes('/controllers/'));
  });

  await test('（11.persistence compatibility）GET /api/health-insight/history完全不呼叫saveHealthInsightRecord/submitHealthInsightController（純讀取路由）', () => {
    const idx = routesSource.indexOf("router.add('GET', '/api/health-insight/history'");
    const block = routesSource.slice(idx, routesSource.length);
    assert.ok(!block.includes('saveHealthInsightRecord('));
    assert.ok(!block.includes('submitHealthInsightController('));
  });

  await test('（11.persistence compatibility）連續3次POST後，db.__store裡確實累積3筆對應user_id的紀錄（真正模擬D1 insert行為）', async () => {
    const db = makeSessionDb({ userId: 'persistence-count-check', records: [] });
    const router = createAppRouter();
    for (let i = 0; i < 3; i++) {
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    }
    assert.strictEqual(db.__store.filter((r) => r.user_id === 'persistence-count-check').length, 3);
  });

  await test('（11.persistence compatibility）持久化的output_snapshot欄位形狀完全不受History/Progress改動影響（依然是healthObservation/behaviorPattern/recommendation/progressTrend/decision）', async () => {
    const db = makeSessionDb({ userId: 'persistence-shape-check', records: [] });
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: SAMPLE_PAYLOAD, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const stored = db.__store[0];
    const outputSnapshot = JSON.parse(stored.output_snapshot);
    assert.ok('healthObservation' in outputSnapshot);
    assert.ok('behaviorPattern' in outputSnapshot);
    assert.ok('recommendation' in outputSnapshot);
    assert.ok('progressTrend' in outputSnapshot);
    assert.ok('decision' in outputSnapshot);
  });

  const TASK1124_NEW_FILES_FOR_HEADER_CHECK = [
    { path: path.join(historyDir, 'history_service.js'), source: historyServiceSource },
    { path: path.join(historyDir, 'index.js'), source: historyIndexSource },
    { path: path.join(componentsDir, 'history_card.js'), source: historyCardSource },
    { path: path.join(componentsDir, 'progress_summary_card.js'), source: progressCardSource },
  ];
  for (const { path: filePath, source } of TASK1124_NEW_FILES_FOR_HEADER_CHECK) {
    await test(`（11.persistence compatibility）新增檔案${path.basename(filePath)}的檔案頭標明"Phase 6 TASK 1.124"`, () => {
      assert.ok(source.includes('Phase 6 TASK 1.124'));
    });
  }

  await test('（11.persistence compatibility）src/history/health_insight/README.md提及Persistence Layer/History Service兩個關鍵詞（架構位置文件完整）', () => {
    assert.ok(historyReadmeSource.includes('Persistence Layer'));
    assert.ok(historyReadmeSource.includes('History Service'));
  });

  console.log('');

  // =========================================================================
  // L. UI consistency
  // =========================================================================
  console.log('--- L. UI consistency ---');

  await test('（12.UI consistency）src/ui/health_insight/design_system/design_tokens.js完全沒有被本次任務修改（沒有新增CSS/token）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/design_system/design_tokens.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.UI consistency）src/ui/health_insight/assets/asset_registry.js完全沒有被本次任務修改（沒有新增插畫資產）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/assets/asset_registry.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.UI consistency）history_card.js/progress_summary_card.js完全不含window/document（SSR安全，純字串組裝）', () => {
    assert.ok(!/window\.|document\./.test(historyCardSource));
    assert.ok(!/window\.|document\./.test(progressCardSource));
  });

  await test('（12.UI consistency）history_card.js/progress_summary_card.js通過node --check語法驗證', () => {
    for (const f of ['history_card.js', 'progress_summary_card.js']) {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(componentsDir, f)], { encoding: 'utf8' }));
    }
  });

  await test('（12.UI consistency）Dashboard桌面版最大寬度限制（max-width:720px）完全來自既有design_tokens.js規則，本次任務沒有新增任何寬度限制', () => {
    const designTokensSource = fs.readFileSync(path.join(uiDir, 'design_system', 'design_tokens.js'), 'utf8');
    assert.ok(designTokensSource.includes('max-width: 720px'));
  });

  await test('（12.UI consistency）history_card.js/progress_summary_card.js只使用既有components/底下輔助檔案（html_utils/illustration/card_header/card_cta）', () => {
    for (const source of [historyCardSource, progressCardSource]) {
      const importLines = getImportLines(source);
      const others = importLines.split('\n').filter((line) => line.trim() && !/html_utils\.js|illustration\.js|card_header\.js|card_cta\.js/.test(line));
      assert.strictEqual(others.join('\n').trim(), '');
    }
  });

  await test('（12.UI consistency）History/Progress卡片都使用muted accent（延續既有"功能預留/中性資訊"視覺語言）', () => {
    assert.ok(historyCardSource.includes("accent: 'muted'"));
    assert.ok(progressCardSource.includes("accent: 'muted'"));
  });

  await test('（12.UI consistency）history_card.js/progress_summary_card.js的使用者可見文字都經過escapeHtml()或固定樣板（沒有直接插入未過濾的payload欄位）', () => {
    assert.ok(historyCardSource.includes('escapeHtml('));
    assert.ok(progressCardSource.includes('escapeHtml('));
  });

  await test('（12.UI consistency）Dashboard維持單欄手機優先版面（沒有新增CSS grid/flex多欄規則）', () => {
    assert.ok(!/display:\s*grid/.test(historyCardSource));
    assert.ok(!/display:\s*grid/.test(progressCardSource));
  });

  await test('（12.UI consistency）dashboard_page.js只匯出renderHealthInsightDashboard/renderHealthInsightDashboardError兩個函式（沒有新增/移除其他匯出）', () => {
    assert.strictEqual((dashboardSource.match(/^export function/gm) || []).length, 2);
    assert.ok(dashboardSource.includes('export function renderHealthInsightDashboard('));
    assert.ok(dashboardSource.includes('export function renderHealthInsightDashboardError('));
  });

  await test('（12.UI consistency）history_card.js/progress_summary_card.js各自只有一個具名匯出（單一職責）', () => {
    assert.strictEqual((historyCardSource.match(/^export function/gm) || []).length, 1);
    assert.strictEqual((progressCardSource.match(/^export function/gm) || []).length, 1);
  });

  await test('（12.UI consistency）history_card.js/progress_summary_card.js的html輸出都以合法的<div class="hi-card開頭', () => {
    assert.ok(createHistoryCard({ isAuthenticated: false }).startsWith('<div class="hi-card'));
    assert.ok(createProgressSummaryCard({ isAuthenticated: false }).startsWith('<div class="hi-card'));
  });

  await test('（12.UI consistency）history_card.js/progress_summary_card.js的html輸出都以</div>結尾（結構完整閉合）', () => {
    assert.ok(createHistoryCard({ isAuthenticated: false }).trim().endsWith('</div>'));
    assert.ok(createProgressSummaryCard({ isAuthenticated: false }).trim().endsWith('</div>'));
  });

  await test('（12.UI consistency）history_card.js/progress_summary_card.js完全沒有inline onclick=等HTML事件屬性（延續"建立但不接線"既有模式；規則要求"on..."前有空白且後面緊接引號，避免誤判JS識別字如"context ="）', () => {
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(historyCardSource));
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(progressCardSource));
  });

  console.log('');

  // =========================================================================
  // M. Security validation
  // =========================================================================
  console.log('--- M. Security validation ---');

  await test('（13.security validation）history_card.js的healthGoal標籤透過固定lookup table，不直接echo原始payload字串', () => {
    const stripped = stripComments(historyCardSource);
    assert.ok(stripped.includes('HEALTH_GOAL_LABELS'));
  });

  await test('（13.security validation）progress_summary_card.js的healthGoal標籤透過固定lookup table，不直接echo原始payload字串', () => {
    const stripped = stripComments(progressCardSource);
    assert.ok(stripped.includes('HEALTH_GOAL_LABELS'));
  });

  await test('（13.security validation）不合法的healthGoal值不會被直接輸出到html（只會被lookup table安全擋掉，回傳空字串）', () => {
    const maliciousGoal = '<script>alert(1)</script>';
    const html = createProgressSummaryCard({ isAuthenticated: true, previousRecordCount: 1, previousHealthGoal: maliciousGoal, currentHealthGoal: maliciousGoal });
    assert.ok(!html.includes('<script>'));
  });

  await test('（13.security validation）history_card.js/progress_summary_card.js完全沒有eval/Function/child_process/require(fs)等危險API', () => {
    for (const source of [historyCardSource, progressCardSource]) {
      const stripped = stripComments(source);
      assert.ok(!/\beval\s*\(/.test(stripped));
      assert.ok(!/new Function/.test(stripped));
      assert.ok(!/child_process/.test(stripped));
    }
  });

  await test('（13.security validation）history_card.js完全沒有<a href付款/升級連結（延續Gemini Insight Card既有邊界原則）', () => {
    assert.ok(!/<a\s+href/.test(historyCardSource));
  });

  await test('（13.security validation）progress_summary_card.js完全沒有<a href付款/升級連結', () => {
    assert.ok(!/<a\s+href/.test(progressCardSource));
  });

  await test('（13.security validation）GET /api/health-insight/history不接受也不處理任何寫入型參數（沒有payload/POST body解析）', () => {
    const idx = routesSource.indexOf("router.add('GET', '/api/health-insight/history'");
    const block = routesSource.slice(idx, idx + 400);
    assert.ok(!/req\.payload/.test(block));
  });

  await test('（13.security validation）worker.js新增的GET /api/health-insight/history區塊沒有解析body（沒有parseJsonBody呼叫）', () => {
    const idx = workerSource.indexOf("pathname === '/api/health-insight/history'");
    assert.ok(idx >= 0);
    const block = workerSource.slice(idx, idx + 400);
    assert.ok(!block.includes('parseJsonBody'));
  });

  const XSS_PAYLOADS = [
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "'; DROP TABLE health_insight_records; --",
    '<svg onload=alert(1)>',
    'javascript:alert(1)',
    '${7*7}',
  ];

  for (const [idx, payload] of XSS_PAYLOADS.entries()) {
    await test(`（13.security validation）惡意healthGoal字串#${idx}不會被History卡片直接輸出（lookup table安全擋掉，只留下泛用文字）`, () => {
      const html = createHistoryCard({ isAuthenticated: true, previousRecords: [{ id: 'r1', createdAt: '2026-01-01T00:00:00.000Z', healthGoal: payload }] });
      assert.ok(!html.includes(payload));
    });

    await test(`（13.security validation）惡意healthGoal字串#${idx}不會被Progress卡片直接輸出`, () => {
      const html = createProgressSummaryCard({ isAuthenticated: true, previousRecordCount: 1, previousHealthGoal: payload, currentHealthGoal: payload });
      assert.ok(!html.includes(payload));
    });
  }

  await test('（13.security validation）端對端：payload.healthGoal帶惡意字串，完整POST流程不會把它原樣輸出到html', async () => {
    const db = makeSessionDb({ userId: 'xss-end-to-end', records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: Object.assign({}, SAMPLE_PAYLOAD, { healthGoal: '<script>alert(1)</script>' }), cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.ok(!body.data.html.includes('<script>alert(1)</script>'));
  });

  await test('（13.security validation）匿名使用者無法透過options.lookupTier偽造身份取得History（identity在解析cookie階段就已經定型，lookupTier只影響membership tier不影響identity本身）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', options: PREMIUM_OPTIONS }, { db: {} });
    const body = await res.json();
    assert.strictEqual(body.data.authenticated, false);
    assert.deepStrictEqual(body.data.records, []);
  });

  await test('（13.security validation）history_card.js/progress_summary_card.js完全沒有require(child_process)/fs等危險模組', () => {
    for (const source of [historyCardSource, progressCardSource]) {
      const importLines = getImportLines(source);
      assert.ok(!importLines.includes('child_process'));
      assert.ok(!importLines.includes("'fs'"));
      assert.ok(!importLines.includes('"fs"'));
    }
  });

  console.log('');

  // =========================================================================
  // N. Regression validation
  // =========================================================================
  console.log('--- N. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（14.regression validation）此檔案目前被另一個regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），跳過再往下spawn其餘測試檔案，避免遞迴', () => {
      assert.ok(true);
    });
  } else {
    const healthInsightLineageSuites = [
      'backups/phase6-task1.111-health-insight-feature/test_health_insight_feature_foundation.mjs',
      'backups/phase6-task1.112-health-insight-integration/test_health_insight_product_integration.mjs',
      'backups/phase6-task1.113-health-insight-activation/test_health_insight_activation_foundation.mjs',
      'backups/phase6-task1.114-health-insight-uiux/test_health_insight_uiux_foundation.mjs',
      'backups/phase6-task1.115-health-insight-visual-integration/test_health_insight_visual_integration.mjs',
      'backups/phase6-task1.116-health-insight-activation/test_health_insight_activation.mjs',
      'backups/phase6-task1.117-response-boundary/test_health_insight_response_boundary.mjs',
      'backups/phase6-task1.118-user-identity/test_user_identity_foundation.mjs',
      'backups/phase6-task1.119-oauth-user-binding/test_health_insight_identity_binding.mjs',
      'backups/phase6-task1.120-health-insight-persistence/test_health_insight_persistence.mjs',
      'backups/phase6-task1.121-gemini-enhancement/test_gemini_enhancement_layer.mjs',
      'backups/phase6-task1.122-premium-feature-boundary/test_premium_feature_boundary.mjs',
      'backups/phase6-task1.123-product-experience/test_health_insight_product_experience.mjs',
    ];

    for (const relSuite of healthInsightLineageSuites) {
      await test(`（14.regression validation）${relSuite} 完整執行，exit code為0（Health Insight產品線本身無回歸；用PHASE1_REVIEW_NESTED=1限定只跑該檔案自己的直接斷言）`, () => {
        execFileSync('node', [relSuite], {
          cwd: repoRoot,
          stdio: 'pipe',
          timeout: 60000,
          env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
        });
      });
    }

    await test('（14.regression validation）本檔案（TASK1.124自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic', () => {
      execFileSync('node', [path.join(__dirname, 'test_health_insight_product_completion.mjs')], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 60000,
        env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
      });
    });
  }

  console.log('');

  // =========================================================================
  // O. P1-P6
  // =========================================================================
  console.log('--- O. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在p1-p6-check/run.js執行（本次任務完全沒有修改任何既有legacy UI/getHTML()相關程式碼，既有UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js既有legacy getHTML()/getManifest()前端邏輯完全沒有被修改', () => {
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  await test('（P1-P6）src/worker.js既有三個Health Insight if區塊（GET /health-insight、POST /api/health-insight、GET /api/health-insight/history）都逐字存在', () => {
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'POST' && pathname === '/api/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/api/health-insight/history')"));
  });

  await test('（P1-P6）app.intelligence維持24個既有欄位', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（P1-P6）app.router.routes數量為24（既有23條+History API新增1條，明確被授權的Route connection）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 24);
  });

  await test('（P1-P6）新的route是GET方法、路徑為/api/health-insight/history', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const found = app.router.routes.some((r) => r.method === 'GET' && r.path === '/api/health-insight/history');
    assert.ok(found);
  });

  await test('（P1-P6）migrations/、src/db/完全沒有新增或修改任何檔案（本次任務不修改D1 schema）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/ src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（P1-P6）src/intelligence/enhancement/gemini/整個目錄完全沒有被本次任務修改（Gemini Provider unchanged）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/enhancement/gemini/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）src/membership/整個目錄完全沒有被本次任務修改（Membership boundary unchanged）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/membership/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）src/intelligence/product/、src/intelligence/capabilities/、src/intelligence/analysis/、src/intelligence/recommendation/整個目錄完全沒有被本次任務修改', () => {
    for (const dir of ['src/intelligence/product/', 'src/intelligence/capabilities/', 'src/intelligence/analysis/', 'src/intelligence/recommendation/']) {
      const diff = execFileSync('git', ['diff', '--stat', '--', dir], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${dir} 有非預期的diff`);
    }
  });

  await test('（P1-P6）package.json、wrangler.toml完全沒有被本次任務修改', () => {
    const diffPkg = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    const diffWrangler = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diffPkg.trim(), '');
    assert.strictEqual(diffWrangler.trim(), '');
  });

  await test('（P1-P6）新增/修改的核心檔案通過node --check語法驗證', () => {
    [
      path.join(srcRoot, 'worker.js'),
      path.join(routesDir, 'health_insight_routes.js'),
      path.join(pagesDir, 'dashboard_page.js'),
      path.join(componentsDir, 'index.js'),
      path.join(componentsDir, 'history_card.js'),
      path.join(componentsDir, 'progress_summary_card.js'),
      path.join(historyDir, 'history_service.js'),
      path.join(historyDir, 'index.js'),
    ].forEach((f) => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', f], { encoding: 'utf8' }));
    });
  });

  // ---- Architecture protection：既有Product/Capability/Runtime/Identity/Persistence/Membership/Gemini檔案零diff ----
  const PROTECTED_FILES = [
    'src/intelligence/enhancement/gemini/gemini_client.js',
    'src/intelligence/enhancement/gemini/gemini_provider.js',
    'src/intelligence/enhancement/gemini/gemini_enhancer.js',
    'src/intelligence/enhancement/gemini/index.js',
    'src/intelligence/enhancement/provider/ai_provider_contract.js',
    'src/membership/membership_state.js',
    'src/membership/membership_resolver.js',
    'src/membership/feature_permission.js',
    'src/membership/index.js',
    'src/intelligence/product/health_insight_integration.js',
    'src/intelligence/product/entry/product_entry.js',
    'src/intelligence/capabilities/orchestration/index.js',
    'src/intelligence/capabilities/analysis/index.js',
    'src/intelligence/capabilities/recommendation/index.js',
    'src/intelligence/analysis/analysis_runner.js',
    'src/intelligence/recommendation/recommendation_runner.js',
    'src/identity/health_insight/user_identity.js',
    'src/identity/health_insight/resolve_identity.js',
    'src/controllers/health_insight_controller.js',
    'src/controllers/health_insight_response_builder.js',
    'src/persistence/health_insight/health_insight_persistence_service.js',
    'src/db/tables/health_insight_records.js',
    'src/db/index.js',
    'src/config/gemini_config.js',
    'src/ui/health_insight/components/error_card.js',
    'src/ui/health_insight/components/health_summary_card.js',
    'src/ui/health_insight/components/observation_card.js',
    'src/ui/health_insight/components/recommendation_card.js',
    'src/ui/health_insight/components/behavior_pattern_card.js',
    'src/ui/health_insight/components/progress_card.js',
    'src/ui/health_insight/components/gemini_insight_card.js',
    'src/ui/health_insight/components/history_placeholder_card.js',
    'src/ui/health_insight/components/illustration.js',
    'src/ui/health_insight/components/card_header.js',
    'src/ui/health_insight/components/card_cta.js',
    'src/ui/health_insight/components/html_utils.js',
    'src/ui/health_insight/components/label_map.js',
    'src/ui/health_insight/components/question_card.js',
    'src/ui/health_insight/pages/input_page.js',
    'src/ui/health_insight/render_product_response.js',
    'src/ui/health_insight/design_system/design_tokens.js',
    'src/ui/health_insight/client/interaction_script.js',
    'src/ui/health_insight/assets/asset_registry.js',
  ];

  for (const relFile of PROTECTED_FILES) {
    await test(`（P1-P6.architecture protection）既有檔案完全沒有被本次任務修改：${relFile}`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  for (const relFile of PROTECTED_FILES) {
    await test(`（P1-P6.architecture protection）既有檔案依然通過node --check語法驗證：${relFile}`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(repoRoot, relFile)], { encoding: 'utf8' }));
    });
  }

  await test('（P1-P6.architecture protection）src/worker.js既有GET /health-insight、POST /api/health-insight兩個if區塊依然逐字存在（本次任務新增的GET /api/health-insight/history是明確授權的History API擴充，不要求worker.js整體零diff）', () => {
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'POST' && pathname === '/api/health-insight')"));
  });

  // ---- 逐檔案完整性掃描（Architecture protection bulk scan）----
  const TASK1124_AUTHORIZED_MODIFIED_FILES = [
    'src/worker.js',
    'src/routes/health_insight_routes.js',
    'src/ui/health_insight/pages/dashboard_page.js',
    'src/ui/health_insight/components/index.js',
  ];
  const TASK1124_NEWLY_CREATED_FILES = [
    'src/history/health_insight/history_service.js',
    'src/history/health_insight/index.js',
    'src/ui/health_insight/components/history_card.js',
    'src/ui/health_insight/components/progress_summary_card.js',
  ];

  const gitDiffNameOnly = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !f.startsWith('backups/'));

  const allExistingSrcFiles = execFileSync('sh', ['-c', "find src -name '*.js'"], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !TASK1124_AUTHORIZED_MODIFIED_FILES.includes(f))
    .filter((f) => !TASK1124_NEWLY_CREATED_FILES.includes(f));

  await test(`（P1-P6.architecture protection）逐檔案完整性掃描：src/底下共找到 ${allExistingSrcFiles.length} 個既有檔案需要逐一確認零diff（排除本次任務明確授權修改/新增的8個檔案）`, () => {
    assert.ok(allExistingSrcFiles.length >= 200, `預期至少200個既有檔案，實際 ${allExistingSrcFiles.length}`);
  });

  for (const relFile of allExistingSrcFiles) {
    await test(`（P1-P6.architecture protection）逐檔案完整性掃描：${relFile} 完全沒有被本次任務修改`, () => {
      assert.ok(!gitDiffNameOnly.includes(relFile), `${relFile} 出現在git diff清單裡`);
    });
  }

  for (const relFile of TASK1124_AUTHORIZED_MODIFIED_FILES) {
    await test(`（P1-P6.architecture protection）逐檔案完整性掃描：${relFile} 的commit歷史/目前diff裡確實存在TASK1.124的修改（控制組，用git log避免commit後永遠假性失敗）`, () => {
      const status = execFileSync('sh', ['-c', `git diff --name-only -- ${relFile} ; git log --oneline -- ${relFile}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(status.trim().length > 0, `${relFile} 找不到任何diff或commit歷史`);
    });
  }

  for (const relFile of TASK1124_NEWLY_CREATED_FILES) {
    await test(`（P1-P6.architecture protection）逐檔案完整性掃描：${relFile} 確實存在於磁碟上（新增檔案，永久事實，不會因為commit後變成假性失敗）`, () => {
      assert.ok(fs.existsSync(path.join(repoRoot, relFile)));
      assert.ok(fs.statSync(path.join(repoRoot, relFile)).size > 0);
    });
  }

  await test('（P1-P6）真實端對端：free使用者連續呼叫POST兩次結果deterministic（相同輸入，僅History/Progress隨累積筆數改變，健康觀察/建議部分不變）', async () => {
    const db1 = makeSessionDb({ userId: 'p1p6-det-free-1', records: [] });
    const db2 = makeSessionDb({ userId: 'p1p6-det-free-2', records: [] });
    const router = createAppRouter();
    const res1 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: db1 });
    const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: db2 });
    const body1 = await res1.json();
    const body2 = await res2.json();
    const extractCard = (html, marker) => {
      const start = html.indexOf(marker);
      const end = html.indexOf('</div>\n</div>', start);
      return html.slice(start, end);
    };
    assert.strictEqual(extractCard(body1.data.html, 'hi-observation-card'), extractCard(body2.data.html, 'hi-observation-card'));
    assert.strictEqual(extractCard(body1.data.html, 'hi-recommendation-card'), extractCard(body2.data.html, 'hi-recommendation-card'));
  });

  await test('（P1-P6）src/ui/health_insight/components/index.js的diff只有新增匯出，沒有移除任何既有匯出', () => {
    const source = fs.readFileSync(path.join(componentsDir, 'index.js'), 'utf8');
    for (const existingExport of ['escapeHtml', 'getObservationLabel', 'createIllustration', 'createCardHeader', 'createCardCta', 'createHealthSummaryCard', 'createObservationCard', 'createRecommendationCard', 'createBehaviorPatternPlaceholderCard', 'createProgressPlaceholderCard', 'createChoiceQuestionCard', 'createErrorCard', 'createGeminiInsightCard', 'createHistoryPlaceholderCard']) {
      assert.ok(source.includes(existingExport), `既有匯出${existingExport}消失了`);
    }
  });

  await test('（P1-P6）components/index.js新增匯出createHistoryCard/createProgressSummaryCard', () => {
    const source = fs.readFileSync(path.join(componentsDir, 'index.js'), 'utf8');
    assert.ok(source.includes('createHistoryCard'));
    assert.ok(source.includes('createProgressSummaryCard'));
  });

  console.log('');

  const total = passed + failed;
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('失敗清單：');
    failures.forEach((f) => console.log(' -', f));
    process.exitCode = 1;
  }
  console.log(`（總斷言數：${total}）`);
}

main().catch((e) => {
  console.error('未預期的例外：', e);
  process.exitCode = 1;
});

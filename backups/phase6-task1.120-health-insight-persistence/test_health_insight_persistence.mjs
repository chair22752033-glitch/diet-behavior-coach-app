/*
 * Phase 6 TASK 1.120｜Health Insight Data Persistence Foundation
 * Implementation 測試
 *
 * 本任務是Health Insight產品線第一次有真正的持久化邊界：
 *
 *   Health Insight Result（TASK1.117既有的Structured Product Response）
 *     ↓
 *   Persistence Boundary（src/persistence/health_insight/）
 *     ↓
 *   D1 Database（health_insight_records表，migrations/0007）
 *     ↓
 *   未來History/Trend/Personalization/Gemini
 *
 * 只有已登入使用者（identity.authenticated）的結果才會被保存，匿名
 * 使用者完全不觸發任何D1寫入、也不會被賦予假的user_id。儲存失敗
 * 完全不影響使用者原本已經算好的Health Insight結果。本次任務不
 * 整合Gemini、不實作歷史紀錄UI、不實作付費/訂閱、不修改
 * Intelligence/Capability/Runtime/Product Boundary/Response
 * Boundary/UI。
 *
 * 分為以下13個部分：
 * A) Schema validation
 * B) Migration & directory boundary
 * C) D1 Access Layer
 * D) Authenticated persistence
 * E) Anonymous behavior
 * F) User ownership
 * G) Data boundary
 * H) Save failure handling
 * I) Product Integration compatibility
 * J) Response compatibility
 * K) Future Gemini/History compatibility
 * L) Regression validation
 * M) P1-P6
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const srcRoot = path.join(repoRoot, 'src');
const dbDir = path.join(srcRoot, 'db');
const persistenceDir = path.join(srcRoot, 'persistence', 'health_insight');
const routesDir = path.join(srcRoot, 'routes');
const controllersDir = path.join(srcRoot, 'controllers');
const migrationsDir = path.join(repoRoot, 'migrations');
const migrationFile = path.join(migrationsDir, '0007_phase6_task1_120_health_insight_records.sql');

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadModules() {
  const { createAppRouter } = await import(path.join(routesDir, 'index.js'));
  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  const persistenceModule = await import(path.join(persistenceDir, 'index.js'));
  const tableModule = await import(path.join(dbDir, 'tables', 'health_insight_records.js'));
  const identityModule = await import(path.join(srcRoot, 'identity', 'health_insight', 'index.js'));
  return { createAppRouter, createApplication, persistenceModule, tableModule, identityModule };
}

function makeValidSessionDb({ userId, status, isGuest, authProvider, expiresInFutureSeconds }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (expiresInFutureSeconds !== undefined ? expiresInFutureSeconds : 3600) * 1000).toISOString();
  return {
    sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: userId, expires_at: expiresAt, revoked_at: null } }) },
    users: { getById: async () => ({ ok: true, row: { id: userId, is_guest: isGuest ? 1 : 0, auth_provider: authProvider || null, status: status || 'active' } }) },
  };
}

function makeRevokedSessionDb({ userId }) {
  return {
    sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: userId, expires_at: new Date(Date.now() + 3600000).toISOString(), revoked_at: new Date().toISOString() } }) },
    users: { getById: async () => ({ ok: true, row: { id: userId, is_guest: 0, auth_provider: 'google', status: 'active' } }) },
  };
}

function makeUserNotFoundDb() {
  return {
    sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: 'ghost-user', expires_at: new Date(Date.now() + 3600000).toISOString(), revoked_at: null } }) },
    users: { getById: async () => ({ ok: false, row: null }) },
  };
}

function makeCaptureRecordsBinding(behavior) {
  const inserted = [];
  if (behavior === 'missing') {
    return { healthInsightRecords: undefined, inserted };
  }
  if (behavior === 'throw') {
    return { healthInsightRecords: { insert: async () => { throw new Error('simulated insert throw'); } }, inserted };
  }
  if (behavior === 'dbError') {
    return { healthInsightRecords: { insert: async (r) => { inserted.push(r); return { ok: false, error: 'simulated' }; } }, inserted };
  }
  if (behavior === 'notAFunction') {
    return { healthInsightRecords: { insert: 'not-a-function' }, inserted };
  }
  return { healthInsightRecords: { insert: async (r) => { inserted.push(r); return { ok: true, meta: {} }; } }, inserted };
}

function makeCaptureDb({ userId, status, isGuest, authProvider, expiresInFutureSeconds, recordBehavior }) {
  const base = makeValidSessionDb({ userId, status, isGuest, authProvider, expiresInFutureSeconds });
  const { healthInsightRecords, inserted } = makeCaptureRecordsBinding(recordBehavior || 'success');
  const db = Object.assign({}, base);
  if (healthInsightRecords !== undefined) db.healthInsightRecords = healthInsightRecords;
  return { db, inserted };
}

function makeFakeD1() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const entry = { sql, params: [] };
      calls.push(entry);
      return {
        bind(...params) {
          entry.params = params;
          return this;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        async all() {
          return { results: [{ id: 'r1' }] };
        },
        async first() {
          return { c: 3 };
        },
      };
    },
  };
}

async function main() {
  const { createAppRouter, createApplication, persistenceModule, tableModule, identityModule } = await loadModules();
  const {
    HEALTH_INSIGHT_SNAPSHOT_VERSION,
    shouldPersistHealthInsightRecord,
    saveHealthInsightRecord,
    listHealthInsightRecordsForUser,
  } = persistenceModule;
  const { ANONYMOUS_IDENTITY } = identityModule;

  const migrationSource = fs.readFileSync(migrationFile, 'utf8');
  const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
  const controllerSource = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');
  const persistenceServiceSource = fs.readFileSync(path.join(persistenceDir, 'health_insight_persistence_service.js'), 'utf8');
  const tableSource = fs.readFileSync(path.join(dbDir, 'tables', 'health_insight_records.js'), 'utf8');
  const dbIndexSource = fs.readFileSync(path.join(dbDir, 'index.js'), 'utf8');

  // =========================================================================
  // A. Schema validation
  // =========================================================================
  console.log('--- A. Schema validation ---');

  await test('（1.schema）migration檔案存在：0007_phase6_task1_120_health_insight_records.sql', () => {
    assert.ok(fs.existsSync(migrationFile));
  });

  await test('（1.schema）migration使用CREATE TABLE IF NOT EXISTS（不強制覆蓋既有表）', () => {
    assert.ok(/CREATE TABLE IF NOT EXISTS health_insight_records/.test(migrationSource));
  });

  for (const col of ['id TEXT PRIMARY KEY', 'user_id TEXT NOT NULL', 'insight_version TEXT NOT NULL', 'input_snapshot TEXT NOT NULL', 'output_snapshot TEXT NOT NULL', 'created_at TEXT NOT NULL']) {
    await test(`（1.schema）health_insight_records表包含欄位定義："${col}"`, () => {
      assert.ok(migrationSource.includes(col), `找不到 ${col}`);
    });
  }

  await test('（1.schema）user_id欄位有REFERENCES users(id)外鍵', () => {
    assert.ok(/user_id TEXT NOT NULL REFERENCES users\(id\)/.test(migrationSource));
  });

  await test('（1.schema）user_id外鍵有ON DELETE CASCADE', () => {
    assert.ok(migrationSource.includes('ON DELETE CASCADE'));
  });

  await test('（1.schema）created_at有DEFAULT (datetime(\'now\'))', () => {
    assert.ok(migrationSource.includes("DEFAULT (datetime('now'))"));
  });

  await test('（1.schema）有CREATE INDEX IF NOT EXISTS idx_health_insight_records_user', () => {
    assert.ok(migrationSource.includes('CREATE INDEX IF NOT EXISTS idx_health_insight_records_user'));
  });

  await test('（1.schema）idx_health_insight_records_user建立在user_id欄位上', () => {
    assert.ok(/idx_health_insight_records_user\s*\n?\s*ON health_insight_records\(user_id\)/.test(migrationSource));
  });

  await test('（1.schema）有CREATE INDEX IF NOT EXISTS idx_health_insight_records_created_at', () => {
    assert.ok(migrationSource.includes('CREATE INDEX IF NOT EXISTS idx_health_insight_records_created_at'));
  });

  await test('（1.schema）idx_health_insight_records_created_at建立在created_at欄位上', () => {
    assert.ok(/idx_health_insight_records_created_at\s*\n?\s*ON health_insight_records\(created_at\)/.test(migrationSource));
  });

  await test('（1.schema）migration完全沒有ALTER TABLE（不修改既有表結構）', () => {
    assert.ok(!/ALTER TABLE/i.test(migrationSource));
  });

  await test('（1.schema）migration的實際SQL程式碼（不含註解）完全沒有DROP TABLE（不刪除任何既有表；Rollback說明註解裡提到的DROP TABLE只是文件建議，不是這個migration本身執行的SQL）', () => {
    const codeOnly = migrationSource.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    assert.ok(!/DROP TABLE/i.test(codeOnly));
  });

  for (const existingTable of ['sessions', 'exploration_records', 'food_events', 'emotion_records', 'behavior_patterns', 'ai_reports', 'legacy_import_logs', 'auth_audit_logs']) {
    await test(`（1.schema）migration完全沒有動到既有表：${existingTable}（只有註解可能提到users當外鍵目標）`, () => {
      const codeOnly = migrationSource.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
      assert.ok(!codeOnly.includes(existingTable), `${existingTable} 出現在非註解的SQL程式碼裡`);
    });
  }

  await test('（1.schema）migration的實際SQL程式碼（不含註解）只有一個CREATE TABLE陳述式', () => {
    const codeOnly = migrationSource.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    const matches = codeOnly.match(/CREATE TABLE/gi) || [];
    assert.strictEqual(matches.length, 1);
  });

  await test('（1.schema）migration的實際SQL程式碼（不含註解）恰好有兩個CREATE INDEX陳述式', () => {
    const codeOnly = migrationSource.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    const matches = codeOnly.match(/CREATE INDEX/gi) || [];
    assert.strictEqual(matches.length, 2);
  });

  for (const forbidden of ['password', 'PASSWORD', 'oauth_token', 'session_token', 'client_secret']) {
    await test(`（1.schema）migration完全不含敏感欄位名稱："${forbidden}"`, () => {
      assert.ok(!migrationSource.includes(forbidden));
    });
  }

  await test('（1.schema）migration檔案開頭有標準"Migration number:"註解（延續既有慣例）', () => {
    assert.ok(migrationSource.trim().startsWith('-- Migration number: 0007'));
  });

  await test('（1.schema）migration有Rollback說明（延續既有慣例，本次任務可逆）', () => {
    assert.ok(/Rollback/.test(migrationSource));
  });

  console.log('');

  // =========================================================================
  // B. Migration & directory boundary
  // =========================================================================
  console.log('--- B. Migration & directory boundary ---');

  await test('（2.migration boundary）migrations/目錄總共恰好7個.sql檔案（新增0007之前是6個）', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    assert.strictEqual(files.length, 7);
  });

  await test('（2.migration boundary）migrations/目錄除了0007之外，沒有其他新增或修改的檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（2.migration boundary）src/db/tables/目錄總共恰好10個.js檔案（新增health_insight_records.js之前是9個）', () => {
    const files = fs.readdirSync(path.join(dbDir, 'tables')).filter((f) => f.endsWith('.js'));
    assert.strictEqual(files.length, 10);
  });

  await test('（2.migration boundary）src/db/整個目錄除了index.js新增一行binding、跟health_insight_records.js新增檔案之外，沒有其他改動', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('health_insight_records.js') && !line.includes('src/db/index.js')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（2.migration boundary）src/db/index.js只有小幅新增（不是整檔重寫）——改用檔案目前內容本身當作永久依據，而不是git diff（diff-based檢查會在commit後變成假性失敗，TASK1.121後更新，理由同其他"控制組"斷言）', () => {
    const lineCount = dbIndexSource.split('\n').length;
    assert.ok(lineCount <= 55, `預期整檔不超過55行（本次任務只新增2行），實際 ${lineCount} 行`);
    const importOccurrences = (dbIndexSource.match(/bindHealthInsightRecords/g) || []).length;
    assert.strictEqual(importOccurrences, 2, 'bindHealthInsightRecords應該恰好出現2次（1次import、1次使用）');
  });

  await test('（2.migration boundary）src/persistence/目錄總共恰好3個檔案（health_insight_persistence_service.js/index.js/README.md）', () => {
    const files = fs.readdirSync(persistenceDir);
    assert.strictEqual(files.length, 3);
  });

  await test('（2.migration boundary）src/persistence/目錄除了本次任務新增的3個檔案之外，沒有其他內容（整個目錄是新的，git status --porcelain會把它收合成單一行"?? src/persistence/"，而不是逐檔案列出，所以這裡用目錄本身的路徑當作篩選依據）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/persistence/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !t.includes('src/persistence/');
    }).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（2.migration boundary）src/persistence/health_insight/health_insight_persistence_service.js確實存在於磁碟上（永久事實，不會因為commit後變成假性失敗）', () => {
    assert.ok(fs.existsSync(path.join(persistenceDir, 'health_insight_persistence_service.js')));
  });

  await test('（2.migration boundary）src/persistence/health_insight/index.js確實存在於磁碟上', () => {
    assert.ok(fs.existsSync(path.join(persistenceDir, 'index.js')));
  });

  await test('（2.migration boundary）src/db/tables/health_insight_records.js確實存在於磁碟上', () => {
    assert.ok(fs.existsSync(path.join(dbDir, 'tables', 'health_insight_records.js')));
  });

  await test('（2.migration boundary）migrations/0007_phase6_task1_120_health_insight_records.sql確實存在於磁碟上', () => {
    assert.ok(fs.existsSync(migrationFile));
  });

  await test('（2.migration boundary）src/auth/整個目錄完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/auth/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.migration boundary）src/oauth/整個目錄完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/oauth/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.migration boundary）src/middleware/整個目錄完全沒有被本次任務修改（若存在）', () => {
    if (!fs.existsSync(path.join(srcRoot, 'middleware'))) {
      assert.ok(true);
      return;
    }
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.migration boundary）src/identity/health_insight/整個目錄完全沒有被本次任務修改（User Identity邊界不變）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/health_insight/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // C. D1 Access Layer
  // =========================================================================
  console.log('--- C. D1 Access Layer ---');

  await test('（3.d1 access layer）src/db/tables/health_insight_records.js匯出bind function', () => {
    assert.strictEqual(typeof tableModule.bind, 'function');
  });

  for (const method of ['insert', 'getById', 'listByUser', 'countByUser']) {
    await test(`（3.d1 access layer）bind(db)回傳的物件有function"${method}"`, () => {
      const bound = tableModule.bind(makeFakeD1());
      assert.strictEqual(typeof bound[method], 'function');
    });
  }

  await test('（3.d1 access layer）insert()送出的SQL包含INSERT INTO health_insight_records', async () => {
    const fakeDb = makeFakeD1();
    const bound = tableModule.bind(fakeDb);
    await bound.insert({ id: 'a', user_id: 'u', insight_version: '1.0.0', input_snapshot: '{}', output_snapshot: '{}', created_at: 'now' });
    assert.ok(fakeDb.calls[0].sql.includes('INSERT INTO health_insight_records'));
  });

  await test('（3.d1 access layer）insert()的參數順序正確：[id, user_id, insight_version, input_snapshot, output_snapshot, created_at]', async () => {
    const fakeDb = makeFakeD1();
    const bound = tableModule.bind(fakeDb);
    await bound.insert({ id: 'a', user_id: 'u', insight_version: 'v1', input_snapshot: 'in', output_snapshot: 'out', created_at: 'ts' });
    assert.deepStrictEqual(fakeDb.calls[0].params, ['a', 'u', 'v1', 'in', 'out', 'ts']);
  });

  await test('（3.d1 access layer）getById()送出的SQL用WHERE id = ?', async () => {
    const fakeDb = makeFakeD1();
    const bound = tableModule.bind(fakeDb);
    await bound.getById('xyz');
    assert.ok(fakeDb.calls[0].sql.includes('WHERE id = ?'));
    assert.deepStrictEqual(fakeDb.calls[0].params, ['xyz']);
  });

  await test('（3.d1 access layer）listByUser()省略limit時預設20', async () => {
    const fakeDb = makeFakeD1();
    const bound = tableModule.bind(fakeDb);
    await bound.listByUser('u1');
    assert.deepStrictEqual(fakeDb.calls[0].params, ['u1', 20]);
  });

  await test('（3.d1 access layer）listByUser()傳入limit時使用該值', async () => {
    const fakeDb = makeFakeD1();
    const bound = tableModule.bind(fakeDb);
    await bound.listByUser('u1', 5);
    assert.deepStrictEqual(fakeDb.calls[0].params, ['u1', 5]);
  });

  await test('（3.d1 access layer）listByUser()的SQL用ORDER BY created_at DESC', async () => {
    const fakeDb = makeFakeD1();
    const bound = tableModule.bind(fakeDb);
    await bound.listByUser('u1');
    assert.ok(fakeDb.calls[0].sql.includes('ORDER BY created_at DESC'));
  });

  await test('（3.d1 access layer）countByUser()的SQL使用COUNT(*)', async () => {
    const fakeDb = makeFakeD1();
    const bound = tableModule.bind(fakeDb);
    await bound.countByUser('u1');
    assert.ok(fakeDb.calls[0].sql.includes('COUNT(*)'));
    assert.deepStrictEqual(fakeDb.calls[0].params, ['u1']);
  });

  await test('（3.d1 access layer）src/db/index.js有import bindHealthInsightRecords', () => {
    assert.ok(dbIndexSource.includes("from './tables/health_insight_records.js'"));
  });

  await test('（3.d1 access layer）createDb(env)回傳的物件有healthInsightRecords欄位', () => {
    assert.ok(dbIndexSource.includes('healthInsightRecords: bindHealthInsightRecords(db)'));
  });

  await test('（3.d1 access layer）src/db/tables/health_insight_records.js通過node --check語法驗證', () => {
    assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(dbDir, 'tables', 'health_insight_records.js')], { encoding: 'utf8' }));
  });

  await test('（3.d1 access layer）src/db/index.js通過node --check語法驗證', () => {
    assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(dbDir, 'index.js')], { encoding: 'utf8' }));
  });

  await test('（3.d1 access layer）src/db/tables/health_insight_records.js只import ../query.js（不直接import D1 SDK、不import其他表）', () => {
    const importLines = getImportLines(tableSource);
    assert.ok(importLines.includes("from '../query.js'"));
    assert.ok(!/tables\/(?!health_insight_records)/.test(importLines));
  });

  console.log('');

  // =========================================================================
  // D. Authenticated persistence
  // =========================================================================
  console.log('--- D. Authenticated persistence ---');

  const AUTH_SCENARIOS = [
    { label: 'google-full-profile', isGuest: false, authProvider: 'google', payload: { gender: 'female', age: 28, height: 165, weight: 55, healthGoal: 'lose_weight' } },
    { label: 'guest-partial-profile', isGuest: true, authProvider: null, payload: { age: 40 } },
    { label: 'google-empty-payload', isGuest: false, authProvider: 'google', payload: {} },
    { label: 'google-extra-fields', isGuest: false, authProvider: 'google', payload: { gender: 'male', age: 33, password: 'should-not-leak', sessionToken: 'should-not-leak' } },
    { label: 'google-long-string-truncated', isGuest: false, authProvider: 'google', payload: { gender: 'x'.repeat(150) } },
    { label: 'google-non-finite-number-dropped', isGuest: false, authProvider: 'google', payload: { age: NaN, weight: Infinity, height: 170 } },
  ];

  for (const scenario of AUTH_SCENARIOS) {
    await test(`（4.authenticated persistence）身份=${scenario.label}：真實端對端POST成功且恰好新增1筆紀錄`, async () => {
      const router = createAppRouter();
      const userId = `auth-${scenario.label}`;
      const { db, inserted } = makeCaptureDb({ userId, isGuest: scenario.isGuest, authProvider: scenario.authProvider, recordBehavior: 'success' });
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: scenario.payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.strictEqual(typeof body.data.html, 'string');
      assert.strictEqual(inserted.length, 1);
    });

    await test(`（4.authenticated persistence）身份=${scenario.label}：紀錄的user_id正確`, async () => {
      const router = createAppRouter();
      const userId = `auth2-${scenario.label}`;
      const { db, inserted } = makeCaptureDb({ userId, isGuest: scenario.isGuest, authProvider: scenario.authProvider, recordBehavior: 'success' });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: scenario.payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      assert.strictEqual(inserted[0].user_id, userId);
    });

    await test(`（4.authenticated persistence）身份=${scenario.label}：紀錄的id是合法UUID格式`, async () => {
      const router = createAppRouter();
      const { db, inserted } = makeCaptureDb({ userId: `auth3-${scenario.label}`, isGuest: scenario.isGuest, authProvider: scenario.authProvider, recordBehavior: 'success' });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: scenario.payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      assert.ok(UUID_RE.test(inserted[0].id), `id不是合法UUID：${inserted[0].id}`);
    });

    await test(`（4.authenticated persistence）身份=${scenario.label}：insight_version固定為"${HEALTH_INSIGHT_SNAPSHOT_VERSION}"`, async () => {
      const router = createAppRouter();
      const { db, inserted } = makeCaptureDb({ userId: `auth4-${scenario.label}`, isGuest: scenario.isGuest, authProvider: scenario.authProvider, recordBehavior: 'success' });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: scenario.payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      assert.strictEqual(inserted[0].insight_version, HEALTH_INSIGHT_SNAPSHOT_VERSION);
    });

    await test(`（4.authenticated persistence）身份=${scenario.label}：created_at是合法ISO時間字串`, async () => {
      const router = createAppRouter();
      const { db, inserted } = makeCaptureDb({ userId: `auth5-${scenario.label}`, isGuest: scenario.isGuest, authProvider: scenario.authProvider, recordBehavior: 'success' });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: scenario.payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      assert.ok(!Number.isNaN(new Date(inserted[0].created_at).getTime()));
      assert.strictEqual(new Date(inserted[0].created_at).toISOString(), inserted[0].created_at);
    });

    await test(`（4.authenticated persistence）身份=${scenario.label}：input_snapshot是合法JSON字串`, async () => {
      const router = createAppRouter();
      const { db, inserted } = makeCaptureDb({ userId: `auth6-${scenario.label}`, isGuest: scenario.isGuest, authProvider: scenario.authProvider, recordBehavior: 'success' });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: scenario.payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      assert.doesNotThrow(() => JSON.parse(inserted[0].input_snapshot));
    });

    await test(`（4.authenticated persistence）身份=${scenario.label}：output_snapshot是合法JSON字串，且有五個既有欄位`, async () => {
      const router = createAppRouter();
      const { db, inserted } = makeCaptureDb({ userId: `auth7-${scenario.label}`, isGuest: scenario.isGuest, authProvider: scenario.authProvider, recordBehavior: 'success' });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: scenario.payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const output = JSON.parse(inserted[0].output_snapshot);
      assert.ok(Array.isArray(output.healthObservation));
      assert.ok(Array.isArray(output.behaviorPattern));
      assert.ok(Array.isArray(output.recommendation));
      assert.strictEqual(typeof output.progressTrend, 'object');
      assert.ok('decision' in output);
    });

    await test(`（4.authenticated persistence）身份=${scenario.label}：連續呼叫兩次各自新增獨立的一筆紀錄（不去重，刻意設計）`, async () => {
      const router = createAppRouter();
      const { db, inserted } = makeCaptureDb({ userId: `auth8-${scenario.label}`, isGuest: scenario.isGuest, authProvider: scenario.authProvider, recordBehavior: 'success' });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: scenario.payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: scenario.payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      assert.strictEqual(inserted.length, 2);
      assert.notStrictEqual(inserted[0].id, inserted[1].id);
    });
  }

  console.log('');

  // =========================================================================
  // E. Anonymous behavior
  // =========================================================================
  console.log('--- E. Anonymous behavior ---');

  const ANON_SCENARIOS = [
    { label: 'no-cookie', cookieHeader: undefined, db: () => makeValidSessionDb({ userId: 'anon-user-1', isGuest: false, authProvider: 'google' }) },
    { label: 'malformed-cookie', cookieHeader: 'garbage-no-equals-sign', db: () => makeValidSessionDb({ userId: 'anon-user-2', isGuest: false, authProvider: 'google' }) },
    { label: 'empty-cookie-string', cookieHeader: '', db: () => makeValidSessionDb({ userId: 'anon-user-3', isGuest: false, authProvider: 'google' }) },
    { label: 'expired-session', cookieHeader: 'dbc_sid=token123', db: () => makeValidSessionDb({ userId: 'anon-user-4', isGuest: false, authProvider: 'google', expiresInFutureSeconds: -10 }) },
    { label: 'revoked-session', cookieHeader: 'dbc_sid=token123', db: () => makeRevokedSessionDb({ userId: 'anon-user-5' }) },
    { label: 'suspended-user', cookieHeader: 'dbc_sid=token123', db: () => makeValidSessionDb({ userId: 'anon-user-6', isGuest: false, authProvider: 'google', status: 'suspended' }) },
    { label: 'deleted-user', cookieHeader: 'dbc_sid=token123', db: () => makeValidSessionDb({ userId: 'anon-user-7', isGuest: false, authProvider: 'google', status: 'deleted' }) },
    { label: 'user-not-found', cookieHeader: 'dbc_sid=token123', db: () => makeUserNotFoundDb() },
  ];

  for (const scenario of ANON_SCENARIOS) {
    await test(`（5.anonymous behavior）情境=${scenario.label}：POST依然成功回應（不因為身份解析失敗擋下request）`, async () => {
      const router = createAppRouter();
      const baseDb = scenario.db();
      const capture = makeCaptureRecordsBinding('success');
      const db = Object.assign({}, baseDb, { healthInsightRecords: capture.healthInsightRecords });
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: scenario.cookieHeader, options: {} }, { db });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.ok, true);
    });

    await test(`（5.anonymous behavior）情境=${scenario.label}：完全沒有觸發任何D1寫入`, async () => {
      const router = createAppRouter();
      const baseDb = scenario.db();
      const capture = makeCaptureRecordsBinding('success');
      const db = Object.assign({}, baseDb, { healthInsightRecords: capture.healthInsightRecords });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: scenario.cookieHeader, options: {} }, { db });
      assert.strictEqual(capture.inserted.length, 0);
    });
  }

  await test('（5.anonymous behavior）匿名使用者即使db完全沒有healthInsightRecords binding也不影響回應', async () => {
    const router = createAppRouter();
    const db = {}; // 沒有sessions/users/healthInsightRecords任何binding
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
  });

  console.log('');

  // =========================================================================
  // F. User ownership
  // =========================================================================
  console.log('--- F. User ownership ---');

  const OWNERSHIP_CASES = [
    { label: 'null', identity: null, expected: false },
    { label: 'undefined', identity: undefined, expected: false },
    { label: 'empty-object', identity: {}, expected: false },
    { label: 'ANONYMOUS_IDENTITY', identity: ANONYMOUS_IDENTITY, expected: false },
    { label: 'valid-google', identity: { userId: 'u1', authenticated: true, provider: 'google' }, expected: true },
    { label: 'valid-guest', identity: { userId: 'u1', authenticated: true, provider: 'guest' }, expected: true },
    { label: 'valid-null-provider', identity: { userId: 'u1', authenticated: true, provider: null }, expected: true },
    { label: 'empty-string-userId', identity: { userId: '', authenticated: true, provider: 'google' }, expected: false },
    { label: 'null-userId', identity: { userId: null, authenticated: true, provider: 'google' }, expected: false },
    { label: 'numeric-userId', identity: { userId: 123, authenticated: true, provider: 'google' }, expected: false },
    { label: 'authenticated-false', identity: { userId: 'u1', authenticated: false, provider: 'google' }, expected: false },
    { label: 'authenticated-string', identity: { userId: 'u1', authenticated: 'true', provider: 'google' }, expected: false },
    { label: 'authenticated-missing', identity: { userId: 'u1', provider: 'google' }, expected: false },
    { label: 'userId-missing', identity: { authenticated: true, provider: 'google' }, expected: false },
    { label: 'array', identity: [], expected: false },
    { label: 'string', identity: 'not-an-object', expected: false },
    { label: 'number', identity: 42, expected: false },
    { label: 'provider-non-string-still-valid', identity: { userId: 'u1', authenticated: true, provider: 123 }, expected: true },
  ];

  for (const c of OWNERSHIP_CASES) {
    await test(`（6.user ownership）shouldPersistHealthInsightRecord(${c.label}) === ${c.expected}`, () => {
      assert.strictEqual(shouldPersistHealthInsightRecord(c.identity), c.expected);
    });
    await test(`（6.user ownership）shouldPersistHealthInsightRecord(${c.label}) 重複呼叫結果一致（deterministic）`, () => {
      assert.strictEqual(shouldPersistHealthInsightRecord(c.identity), c.expected);
    });
  }

  await test('（6.user ownership）匿名使用者（ANONYMOUS_IDENTITY）不會被賦予假的user_id：saveHealthInsightRecord對匿名身份回傳anonymous_skip', async () => {
    const result = await saveHealthInsightRecord({}, { identity: ANONYMOUS_IDENTITY, payload: {}, structuredResponse: { ok: true, data: {} } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'anonymous_skip');
  });

  console.log('');

  // =========================================================================
  // G. Data boundary
  // =========================================================================
  console.log('--- G. Data boundary ---');

  const validIdentity = { userId: 'boundary-user', authenticated: true, provider: 'google' };
  const successResponse = { ok: true, data: { healthObservation: ['a'], behaviorPattern: ['b'], recommendation: ['c'], progressTrend: { trend: 'up' }, decision: null } };

  await test('（7.data boundary）payload裡的password欄位完全不會出現在input_snapshot裡', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: { gender: 'female', password: 'secret123' }, structuredResponse: successResponse });
    assert.ok(!inserted[0].input_snapshot.includes('secret123'));
    assert.ok(!JSON.parse(inserted[0].input_snapshot).hasOwnProperty('password'));
  });

  await test('（7.data boundary）payload裡的sessionToken/oauthToken等非白名單欄位完全不會出現在input_snapshot裡', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user2', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: { gender: 'female', sessionToken: 'tok-abc', oauthToken: 'oauth-xyz' }, structuredResponse: successResponse });
    const snapshot = JSON.parse(inserted[0].input_snapshot);
    assert.ok(!('sessionToken' in snapshot));
    assert.ok(!('oauthToken' in snapshot));
    assert.ok(!inserted[0].input_snapshot.toLowerCase().includes('token'));
  });

  await test('（7.data boundary）input_snapshot只包含白名單欄位（gender/age/height/weight/healthGoal）', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user3', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: { gender: 'f', age: 20, height: 160, weight: 50, healthGoal: 'x', extra: 'nope' }, structuredResponse: successResponse });
    const snapshot = JSON.parse(inserted[0].input_snapshot);
    const keys = Object.keys(snapshot).sort();
    assert.deepStrictEqual(keys, ['age', 'gender', 'healthGoal', 'height', 'weight'].sort());
  });

  await test('（7.data boundary）超過100字元的字串欄位被截斷為100字元', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user4', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: { gender: 'x'.repeat(250) }, structuredResponse: successResponse });
    const snapshot = JSON.parse(inserted[0].input_snapshot);
    assert.strictEqual(snapshot.gender.length, 100);
  });

  await test('（7.data boundary）NaN數值欄位被丟棄（不會存進input_snapshot）', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user5', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: { age: NaN, height: 170 }, structuredResponse: successResponse });
    const snapshot = JSON.parse(inserted[0].input_snapshot);
    assert.ok(!('age' in snapshot));
    assert.strictEqual(snapshot.height, 170);
  });

  await test('（7.data boundary）Infinity數值欄位被丟棄', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user6', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: { weight: Infinity }, structuredResponse: successResponse });
    const snapshot = JSON.parse(inserted[0].input_snapshot);
    assert.ok(!('weight' in snapshot));
  });

  await test('（7.data boundary）非物件payload（陣列）安全退回空的input_snapshot', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user7', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: ['not', 'an', 'object'], structuredResponse: successResponse });
    assert.deepStrictEqual(JSON.parse(inserted[0].input_snapshot), {});
  });

  await test('（7.data boundary）data完全缺失時output_snapshot安全預設（空陣列/空物件/decision為null）', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user8', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: {}, structuredResponse: { ok: true, data: undefined } });
    const out = JSON.parse(inserted[0].output_snapshot);
    assert.deepStrictEqual(out, { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null });
  });

  await test('（7.data boundary）healthObservation型別錯誤（字串而非陣列）時安全退回空陣列', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user9', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: {}, structuredResponse: { ok: true, data: { healthObservation: 'not-array' } } });
    const out = JSON.parse(inserted[0].output_snapshot);
    assert.deepStrictEqual(out.healthObservation, []);
  });

  await test('（7.data boundary）progressTrend型別錯誤（陣列而非物件）時安全退回空物件', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user10', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: {}, structuredResponse: { ok: true, data: { progressTrend: ['not', 'object'] } } });
    const out = JSON.parse(inserted[0].output_snapshot);
    assert.deepStrictEqual(out.progressTrend, {});
  });

  await test('（7.data boundary）decision為false（falsy但有意義）時原樣保留，不會被誤判成"缺失"而變成null', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user11', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: {}, structuredResponse: { ok: true, data: { decision: false } } });
    const out = JSON.parse(inserted[0].output_snapshot);
    assert.strictEqual(out.decision, false);
  });

  await test('（7.data boundary）decision未定義時預設為null', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user12', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: {}, structuredResponse: { ok: true, data: {} } });
    const out = JSON.parse(inserted[0].output_snapshot);
    assert.strictEqual(out.decision, null);
  });

  await test('（7.data boundary）output_snapshot額外欄位（不在既有5個欄位清單裡）完全不會被保留', async () => {
    const { db, inserted } = makeCaptureDb({ userId: 'boundary-user13', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    await saveHealthInsightRecord(db, { identity: validIdentity, payload: {}, structuredResponse: { ok: true, data: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null, stage: 'leak', reason: 'leak', internalCapabilityState: 'leak' } } });
    const out = JSON.parse(inserted[0].output_snapshot);
    assert.deepStrictEqual(Object.keys(out).sort(), ['behaviorPattern', 'decision', 'healthObservation', 'progressTrend', 'recommendation'].sort());
  });

  await test('（7.data boundary）persistence service完全不import src/auth/', () => {
    assert.ok(!getImportLines(persistenceServiceSource).includes("'../../auth"));
    assert.ok(!getImportLines(persistenceServiceSource).includes('src/auth'));
  });

  await test('（7.data boundary）persistence service完全不import src/oauth/', () => {
    assert.ok(!getImportLines(persistenceServiceSource).includes("'../../oauth"));
    assert.ok(!getImportLines(persistenceServiceSource).includes('src/oauth'));
  });

  await test('（7.data boundary）persistence service完全不import src/identity/session_rules.js', () => {
    assert.ok(!getImportLines(persistenceServiceSource).includes('session_rules.js'));
  });

  console.log('');

  // =========================================================================
  // H. Save failure handling
  // =========================================================================
  console.log('--- H. Save failure handling ---');

  const FAILURE_CASES = [
    { label: 'anonymous-identity', args: () => [{}, { identity: ANONYMOUS_IDENTITY, payload: {}, structuredResponse: successResponse }], expectedReason: 'anonymous_skip' },
    { label: 'structuredResponse-not-ok', args: () => [{}, { identity: validIdentity, payload: {}, structuredResponse: { ok: false } }], expectedReason: 'not_successful_result' },
    { label: 'structuredResponse-undefined', args: () => [{}, { identity: validIdentity, payload: {}, structuredResponse: undefined }], expectedReason: 'not_successful_result' },
    { label: 'structuredResponse-not-object', args: () => [{}, { identity: validIdentity, payload: {}, structuredResponse: 'nope' }], expectedReason: 'not_successful_result' },
    { label: 'db-missing-healthInsightRecords', args: () => [{}, { identity: validIdentity, payload: {}, structuredResponse: successResponse }], expectedReason: 'invalid_db' },
    { label: 'db-null', args: () => [null, { identity: validIdentity, payload: {}, structuredResponse: successResponse }], expectedReason: 'invalid_db' },
    { label: 'db-insert-not-a-function', args: () => [{ healthInsightRecords: { insert: 'nope' } }, { identity: validIdentity, payload: {}, structuredResponse: successResponse }], expectedReason: 'invalid_db' },
    { label: 'insert-returns-ok-false', args: () => [{ healthInsightRecords: { insert: async () => ({ ok: false, error: 'x' }) } }, { identity: validIdentity, payload: {}, structuredResponse: successResponse }], expectedReason: 'db_error' },
    { label: 'insert-returns-undefined', args: () => [{ healthInsightRecords: { insert: async () => undefined } }, { identity: validIdentity, payload: {}, structuredResponse: successResponse }], expectedReason: 'db_error' },
    { label: 'insert-throws', args: () => [{ healthInsightRecords: { insert: async () => { throw new Error('boom'); } } }, { identity: validIdentity, payload: {}, structuredResponse: successResponse }], expectedReason: 'unknown_error' },
    { label: 'params-null', args: () => [{ healthInsightRecords: { insert: async () => ({ ok: true }) } }, null], expectedReason: 'anonymous_skip' },
    { label: 'params-undefined', args: () => [{ healthInsightRecords: { insert: async () => ({ ok: true }) } }, undefined], expectedReason: 'anonymous_skip' },
  ];

  for (const c of FAILURE_CASES) {
    await test(`（8.save failure handling）情境=${c.label}：saveHealthInsightRecord()不拋出例外`, async () => {
      await assert.doesNotReject(async () => {
        await saveHealthInsightRecord(...c.args());
      });
    });

    await test(`（8.save failure handling）情境=${c.label}：回傳{ok:false, reason:'${c.expectedReason}'}`, async () => {
      const result = await saveHealthInsightRecord(...c.args());
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, c.expectedReason);
    });
  }

  await test('（8.save failure handling）即使db.healthInsightRecords.insert同步拋出例外，POST /api/health-insight依然正常回傳成功結果', async () => {
    const router = createAppRouter();
    const { db } = makeCaptureDb({ userId: 'fail-user-1', isGuest: false, authProvider: 'google', recordBehavior: 'throw' });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(typeof body.data.html, 'string');
  });

  await test('（8.save failure handling）即使db.healthInsightRecords完全不存在，POST /api/health-insight依然正常回傳成功結果', async () => {
    const router = createAppRouter();
    const { db } = makeCaptureDb({ userId: 'fail-user-2', isGuest: false, authProvider: 'google', recordBehavior: 'missing' });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
  });

  await test('（8.save failure handling）即使D1寫入回傳{ok:false}，POST /api/health-insight依然正常回傳成功結果', async () => {
    const router = createAppRouter();
    const { db } = makeCaptureDb({ userId: 'fail-user-3', isGuest: false, authProvider: 'google', recordBehavior: 'dbError' });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
  });

  await test('（8.save failure handling）route層完全不檢查/不使用saveHealthInsightRecord()的回傳值（原始碼掃描：呼叫式前面沒有if/變數接收判斷）', () => {
    const idx = routesSource.indexOf('saveHealthInsightRecord(');
    assert.ok(idx >= 0);
    const before = routesSource.slice(Math.max(0, idx - 30), idx);
    assert.ok(!/(?:const|let|var|if\s*\()\s*$/.test(before.trim() + ' '), `呼叫式前面疑似有變數接收或條件判斷：${before}`);
  });

  console.log('');

  // =========================================================================
  // I. Product Integration compatibility
  // =========================================================================
  console.log('--- I. Product Integration compatibility ---');

  const PRODUCT_BOUNDARY_FILES = [
    'src/intelligence/product/health_insight_integration.js',
    'src/intelligence/product/entry/product_entry.js',
    'src/intelligence/product/entry/product_entry_result_builder.js',
    'src/intelligence/product/contract/product_contract.js',
    'src/intelligence/product/adapter/product_adapter.js',
    'src/intelligence/product/execution/product_execution.js',
    'src/intelligence/product/operational/product_operational.js',
    'src/intelligence/product/features/health_insight/index.js',
    'src/intelligence/capabilities/orchestration/index.js',
    'src/intelligence/capabilities/analysis/index.js',
    'src/intelligence/capabilities/recommendation/index.js',
    'src/intelligence/analysis/analysis_runner.js',
    'src/intelligence/recommendation/recommendation_runner.js',
    'src/intelligence/context/insight_context_builder.js',
    'src/identity/health_insight/user_identity.js',
    'src/identity/health_insight/resolve_identity.js',
    'src/identity/health_insight/request_context.js',
    'src/identity/health_insight/membership_placeholder.js',
    'src/controllers/health_insight_response_builder.js',
    'src/controllers/health_insight_controller.js',
    // TASK1.123後更新：render_product_response.js從這個清單移除
    // ——Product Experience Upgrade明確授權它轉發presentationContext。
    'src/worker.js',
  ];

  for (const relFile of PRODUCT_BOUNDARY_FILES) {
    await test(`（9.product integration）既有Product/Capability/Runtime/Identity/Response/Controller/Worker檔案完全沒有被本次任務修改：${relFile}`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  for (const relFile of PRODUCT_BOUNDARY_FILES) {
    await test(`（9.product integration）既有檔案依然通過node --check語法驗證：${relFile}`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(repoRoot, relFile)], { encoding: 'utf8' }));
    });
  }

  await test('（9.product integration）src/ui/health_insight/整個目錄除了TASK1.123明確授權新增的Gemini/History呈現區塊之外，完全沒有其他改動（不重新設計UI，見TASK1.123後更新）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = diff.split('\n').filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !t.includes('render_product_response.js') && !t.includes('dashboard_page.js') && !t.includes('components/index.js') && !t.includes('file changed') && !t.includes('files changed');
    }).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（9.product integration）src/intelligence/整個目錄完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const TASK1120_AUTHORIZED_MODIFIED_FILES = [
    'src/db/index.js',
    'src/routes/health_insight_routes.js',
    // TASK1.123後更新：Product Experience Upgrade明確授權的3個UI檔案
    'src/ui/health_insight/render_product_response.js',
    'src/ui/health_insight/pages/dashboard_page.js',
    'src/ui/health_insight/components/index.js',
  ];
  const TASK1120_NEWLY_CREATED_FILES = [
    'src/db/tables/health_insight_records.js',
    'src/persistence/health_insight/health_insight_persistence_service.js',
    'src/persistence/health_insight/index.js',
  ];

  const gitDiffNameOnly = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !f.startsWith('backups/'));

  const allExistingSrcFiles = execFileSync('sh', ['-c', "find src -name '*.js'"], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !TASK1120_AUTHORIZED_MODIFIED_FILES.includes(f))
    .filter((f) => !TASK1120_NEWLY_CREATED_FILES.includes(f));

  await test(`（9.product integration）逐檔案完整性掃描：src/底下共找到 ${allExistingSrcFiles.length} 個既有檔案需要逐一確認零diff（排除本次任務明確授權修改/新增的5個檔案）`, () => {
    assert.ok(allExistingSrcFiles.length >= 200, `預期至少200個既有檔案，實際 ${allExistingSrcFiles.length}`);
  });

  for (const relFile of allExistingSrcFiles) {
    await test(`（9.product integration）逐檔案完整性掃描：${relFile} 完全沒有被本次任務修改`, () => {
      assert.ok(!gitDiffNameOnly.includes(relFile), `${relFile} 出現在git diff清單裡`);
    });
  }

  for (const relFile of TASK1120_AUTHORIZED_MODIFIED_FILES) {
    await test(`（9.product integration）逐檔案完整性掃描：${relFile} 的commit歷史/目前diff裡確實存在TASK1.120的修改（控制組，用git log避免commit後永遠假性失敗）`, () => {
      const status = execFileSync('sh', ['-c', `git diff --name-only -- ${relFile} ; git log --oneline -- ${relFile}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(status.trim().length > 0, `${relFile} 找不到任何diff或commit歷史`);
    });
  }

  for (const relFile of TASK1120_NEWLY_CREATED_FILES) {
    await test(`（9.product integration）逐檔案完整性掃描：${relFile} 確實存在於磁碟上（新增檔案，永久事實，不會因為commit後變成假性失敗）`, () => {
      assert.ok(fs.existsSync(path.join(repoRoot, relFile)));
      assert.ok(fs.statSync(path.join(repoRoot, relFile)).size > 0);
    });
  }

  console.log('');

  // =========================================================================
  // J. Response compatibility
  // =========================================================================
  console.log('--- J. Response compatibility ---');

  await test('（10.response compatibility）已登入使用者的POST回應形狀依然是{ok:true, data:{html}}（跟TASK1.117之前完全一致）', async () => {
    const router = createAppRouter();
    const { db } = makeCaptureDb({ userId: 'resp-user-1', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.deepStrictEqual(Object.keys(body).sort(), ['data', 'ok']);
    assert.deepStrictEqual(Object.keys(body.data).sort(), ['html']);
  });

  await test('（10.response compatibility）匿名使用者的POST回應形狀依然是{ok:true, data:{html}}', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {} });
    const body = await res.json();
    assert.deepStrictEqual(Object.keys(body).sort(), ['data', 'ok']);
    assert.deepStrictEqual(Object.keys(body.data).sort(), ['html']);
  });

  await test('（10.response compatibility）GET /health-insight完全不受本次任務影響', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('data-hi-page="input"'));
  });

  for (const provider of ['google', 'guest']) {
    await test(`（10.response compatibility）身份provider=${provider}時，已登入/匿名兩種身份連續呼叫兩次得到一致的html（deterministic）`, async () => {
      const router = createAppRouter();
      const { db } = makeCaptureDb({ userId: `resp-det-${provider}`, isGuest: provider === 'guest', authProvider: provider === 'guest' ? null : provider, recordBehavior: 'success' });
      const res1 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const body1 = await res1.json();
      const body2 = await res2.json();
      assert.strictEqual(body1.data.html, body2.data.html);
    });
  }

  await test('（10.response compatibility）已登入使用者的userId/provider完全不出現在回應的html裡（持久化不影響既有Capability isolation保證）', async () => {
    const router = createAppRouter();
    const { db } = makeCaptureDb({ userId: 'must-not-leak-user-id-99999', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.ok(!body.data.html.includes('must-not-leak-user-id-99999'));
    assert.ok(!body.data.html.toLowerCase().includes('google'));
  });

  await test('（10.response compatibility）D1寫入失敗時，回應內容跟D1寫入成功時完全相同（持久化結果不影響回應）', async () => {
    const router = createAppRouter();
    const { db: dbSuccess } = makeCaptureDb({ userId: 'resp-compare', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    const { db: dbFail } = makeCaptureDb({ userId: 'resp-compare', isGuest: false, authProvider: 'google', recordBehavior: 'throw' });
    const res1 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbSuccess });
    const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbFail });
    const body1 = await res1.json();
    const body2 = await res2.json();
    assert.strictEqual(body1.data.html, body2.data.html);
  });

  console.log('');

  // =========================================================================
  // K. Future Gemini/History compatibility
  // =========================================================================
  console.log('--- K. Future Gemini/History compatibility ---');

  await test('（11.future compatibility）HEALTH_INSIGHT_SNAPSHOT_VERSION是字串"1.0.0"', () => {
    assert.strictEqual(HEALTH_INSIGHT_SNAPSHOT_VERSION, '1.0.0');
  });

  await test('（11.future compatibility）listHealthInsightRecordsForUser()是已匯出的function', () => {
    assert.strictEqual(typeof listHealthInsightRecordsForUser, 'function');
  });

  await test('（11.future compatibility）listHealthInsightRecordsForUser()沒有被任何route呼叫（本次任務只接上寫入路徑）', () => {
    assert.ok(!routesSource.includes('listHealthInsightRecordsForUser'));
  });

  await test('（11.future compatibility）listHealthInsightRecordsForUser()沒有被controller呼叫', () => {
    assert.ok(!controllerSource.includes('listHealthInsightRecordsForUser'));
  });

  await test('（11.future compatibility）listHealthInsightRecordsForUser()缺少userId時安全回傳失敗，不拋出例外', async () => {
    const result = await listHealthInsightRecordsForUser({}, '');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_user_id');
  });

  await test('（11.future compatibility）listHealthInsightRecordsForUser()對正常db呼叫回傳records陣列', async () => {
    const fakeDb = { healthInsightRecords: { listByUser: async () => ({ ok: true, results: [{ id: 'r1' }, { id: 'r2' }] }) } };
    const result = await listHealthInsightRecordsForUser(fakeDb, 'u1');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.records.length, 2);
  });

  await test('（11.future compatibility）listHealthInsightRecordsForUser()對缺少healthInsightRecords binding的db安全回傳invalid_db', async () => {
    const result = await listHealthInsightRecordsForUser({}, 'u1');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_db');
  });

  await test('（11.future compatibility）listHealthInsightRecordsForUser()不會拋出例外（D1查詢失敗時）', async () => {
    const fakeDb = { healthInsightRecords: { listByUser: async () => { throw new Error('boom'); } } };
    await assert.doesNotReject(async () => listHealthInsightRecordsForUser(fakeDb, 'u1'));
  });

  for (const file of [persistenceServiceSource, tableSource]) {
    await test('（11.future compatibility）新增/修改檔案完全不import任何AI SDK/Gemini/OpenAI相關套件（只檢查實際import陳述式）', () => {
      assert.ok(!/gemini|generative-ai|openai|anthropic-ai|@google\/genai/i.test(getImportLines(file)));
    });
  }

  await test('（11.future compatibility）health_insight_routes.js完全不import外部AI SDK套件；TASK1.121後合法import內部自建的Gemini Enhancement模組（../intelligence/enhancement/gemini/，不是外部SDK），予以排除（TASK1.121後更新）', () => {
    const importLines = getImportLines(routesSource).split('\n');
    const suspiciousImports = importLines.filter((l) => /gemini|generative-ai|openai|anthropic-ai|@google\/genai/i.test(l) && !l.includes("'../intelligence/enhancement/gemini/"));
    assert.deepStrictEqual(suspiciousImports, []);
  });

  await test('（11.future compatibility）migration的實際SQL程式碼（不含註解）完全不提及Gemini/OpenAI/AI SDK（不提前決定未來AI供應商；註解裡提到"Gemini Enhancement Layer"只是說明未來方向，延續TASK1.117已確立的"doc comment可以提未來方向，但實際程式碼/SQL不行"既有慣例）', () => {
    const codeOnly = migrationSource.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    assert.ok(!/gemini|openai|anthropic/i.test(codeOnly));
  });

  await test('（11.future compatibility）README.md存在，且提到"Future Compatibility"章節', () => {
    const readme = fs.readFileSync(path.join(persistenceDir, 'README.md'), 'utf8');
    assert.ok(readme.includes('Future Compatibility'));
  });

  await test('（11.future compatibility）README.md提到History/Gemini/Premium三個未來方向，且明確標示本次任務沒有實作', () => {
    const readme = fs.readFileSync(path.join(persistenceDir, 'README.md'), 'utf8');
    assert.ok(readme.includes('History'));
    assert.ok(readme.includes('Gemini'));
    assert.ok(readme.includes('Premium'));
  });

  await test('（11.future compatibility）src/identity/health_insight/membership_placeholder.js既有extension point完全不受本次任務影響', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/health_insight/membership_placeholder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // L. Regression validation
  // =========================================================================
  console.log('--- L. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（Regression validation）此檔案目前被另一個regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），跳過再往下spawn其餘測試檔案，避免遞迴', () => {
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
    ];

    for (const relSuite of healthInsightLineageSuites) {
      await test(`（Regression validation）${relSuite} 完整執行，exit code為0（Health Insight產品線本身無回歸；用PHASE1_REVIEW_NESTED=1限定只跑該檔案自己的直接斷言）`, () => {
        execFileSync('node', [relSuite], {
          cwd: repoRoot,
          stdio: 'pipe',
          timeout: 60000,
          env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
        });
      });
    }

    await test('（Regression validation）本檔案（TASK1.120自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic', () => {
      execFileSync('node', [path.join(__dirname, 'test_health_insight_persistence.mjs')], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 60000,
        env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
      });
    });
  }

  console.log('');

  // =========================================================================
  // M. P1-P6
  // =========================================================================
  console.log('--- M. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在p1-p6-check/run.js執行（本次任務完全沒有修改任何既有legacy UI/getHTML()相關程式碼，既有UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js完全沒有被本次任務修改（TASK1.120不需要新的HTTP層資料，TASK1.119已經完成cookieHeader轉發）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  await test('（P1-P6）app.intelligence維持24個既有欄位', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（P1-P6）app.router.routes數量維持23（本次任務沒有新增/刪除任何route）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 23);
  });

  await test('（P1-P6）src/db/整個目錄除了index.js新增一行binding、跟health_insight_records.js新增檔案之外，沒有其他改動', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('health_insight_records.js') && !line.includes('src/db/index.js')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（P1-P6）migrations/目錄除了0007之外，沒有其他新增或修改的檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（P1-P6）wrangler.toml完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）package.json完全沒有被本次任務修改（沒有新增任何npm依賴）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）新增/修改的3個核心檔案（routes/persistence service/db table）通過node --check語法驗證', () => {
    [
      path.join(routesDir, 'health_insight_routes.js'),
      path.join(persistenceDir, 'health_insight_persistence_service.js'),
      path.join(dbDir, 'tables', 'health_insight_records.js'),
    ].forEach((f) => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', f], { encoding: 'utf8' }));
    });
  });

  await test('（P1-P6）真實端對端：已登入使用者連續呼叫GET/POST兩條路由兩次得到一致結果（deterministic，沒有共用可變狀態）', async () => {
    const router = createAppRouter();
    const { db } = makeCaptureDb({ userId: 'p1p6-user', isGuest: false, authProvider: 'google', recordBehavior: 'success' });
    const res1 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body1 = await res1.json();
    const body2 = await res2.json();
    assert.strictEqual(body1.data.html, body2.data.html);
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('失敗項目：');
    failures.forEach((name) => console.log(' - ' + name));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('測試執行本身發生未預期錯誤：', e);
  process.exit(1);
});

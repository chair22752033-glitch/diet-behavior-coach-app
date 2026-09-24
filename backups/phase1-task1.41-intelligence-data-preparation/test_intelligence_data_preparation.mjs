/*
 * Phase 1 TASK 1.41｜Intelligence Data Preparation Layer Foundation 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「資料準備邊界」：
 * context_builder.js能不能正確從既有Domain Service蒐集資料、
 * data_normalizer.js的輸出是否deterministic、整條鏈路是否完全不碰
 * SQL/AI API/fetch()。不驗證任何分析/推薦邏輯（因為根本沒有）。
 *
 * 分為以下12個部分：
 * A) context builder
 * B) domain service boundary
 * C) no SQL in intelligence layer
 * D) no AI SDK
 * E) no external API call
 * F) user ownership rule
 * G) deterministic normalization
 * H) empty data handling
 * I) error handling
 * J) bootstrap injection
 * K) regression check
 * L) P1-P6
 *
 * 全部使用純記憶體測試，完全不連線任何真實或本機模擬的資料庫，不呼叫
 * 任何AI API或fetch()，不建立任何真實使用者session。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const srcRoot = path.join(repoRoot, 'src');
const dataPrepDir = path.join(srcRoot, 'intelligence', 'data_preparation');

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
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readPrepSrc(file) {
  return stripComments(fs.readFileSync(path.join(dataPrepDir, file), 'utf8'));
}

// -----------------------------------------------------------------------
// Mock db：users + 五個domain資料表，方法簽章對齊 src/db/tables/*.js
// （沿用TASK1.36/1.38/1.39/1.40既有的mock手法）
// -----------------------------------------------------------------------
function makeMockDb() {
  const users = new Map();
  const tables = {
    explorationRecords: [],
    foodEvents: [],
    emotionRecords: [],
    behaviorPatterns: [],
    aiReports: [],
  };
  const calls = [];
  let nextId = 1;

  function seedUser(u) {
    users.set(u.id, Object.assign({ status: 'active', is_guest: 1, auth_provider: null, display_name: null, created_at: '2026-01-01T00:00:00Z' }, u));
  }

  function makeTable(name, store, defaultLimit) {
    return {
      async insert(rec) {
        calls.push({ type: 'insert', table: name });
        const row = Object.assign({ created_at: new Date().toISOString() }, rec, { id: nextId++ });
        store.push(row);
        return { ok: true, id: row.id };
      },
      async listByUser(userId, limit) {
        calls.push({ type: 'listByUser', table: name });
        return { ok: true, results: store.filter((r) => r.user_id === userId).slice(0, limit || defaultLimit) };
      },
    };
  }

  return {
    calls,
    _tables: tables,
    seedUser,
    users: {
      async getById(id) { calls.push({ type: 'getById', table: 'users' }); return { ok: true, row: users.get(id) || null }; },
    },
    explorationRecords: makeTable('exploration_records', tables.explorationRecords, 50),
    foodEvents: makeTable('food_events', tables.foodEvents, 50),
    emotionRecords: makeTable('emotion_records', tables.emotionRecords, 50),
    behaviorPatterns: makeTable('behavior_patterns', tables.behaviorPatterns, 50),
    aiReports: makeTable('ai_reports', tables.aiReports, 20),
  };
}

async function run() {
  const { createContextBuilder } = await import(path.join(dataPrepDir, 'context_builder.js'));
  const { createDataNormalizer } = await import(path.join(dataPrepDir, 'data_normalizer.js'));
  const dataPrepIndexMod = await import(path.join(dataPrepDir, 'index.js'));
  const { createDataPreparationService } = dataPrepIndexMod;

  // =========================================================================
  // A. context builder
  // =========================================================================
  console.log('--- A. context builder ---');

  await test('（1.context builder）createContextBuilder() 回傳物件具備 buildContext 函式', () => {
    const builder = createContextBuilder();
    assert.strictEqual(typeof builder.buildContext, 'function');
  });

  await test('（1.context builder）buildContext() 成功時回傳 {ok:true, context:{...}}', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-ctx-1' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-ctx-1', {});
    assert.strictEqual(result.ok, true);
    assert.ok(result.context);
  });

  await test('（1.context builder）context恰好具備 user/explorations/foodEvents/emotions/behaviors/reports 六個欄位', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-ctx-2' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-ctx-2', {});
    assert.deepStrictEqual(Object.keys(result.context).sort(), ['behaviors', 'emotions', 'explorations', 'foodEvents', 'reports', 'user']);
  });

  await test('（1.context builder）context.user正確對應db.users.getById()回傳的row（未經任何轉換的原始row）', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-ctx-3', display_name: 'Test User' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-ctx-3', {});
    assert.strictEqual(result.context.user.id, 'u-ctx-3');
    assert.strictEqual(result.context.user.display_name, 'Test User');
  });

  await test('（1.context builder）context.explorations正確對應getUserExplorations()的結果', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-ctx-4' });
    await db.explorationRecords.insert({ user_id: 'u-ctx-4', card_text: 'explore-1' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-ctx-4', {});
    assert.strictEqual(result.context.explorations.length, 1);
    assert.strictEqual(result.context.explorations[0].card_text, 'explore-1');
  });

  await test('（1.context builder）context.foodEvents正確對應listFoodHistory()的結果', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-ctx-5' });
    await db.foodEvents.insert({ user_id: 'u-ctx-5', meal_type: 'lunch' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-ctx-5', {});
    assert.strictEqual(result.context.foodEvents.length, 1);
    assert.strictEqual(result.context.foodEvents[0].meal_type, 'lunch');
  });

  await test('（1.context builder）context.emotions正確對應listEmotionHistory()的結果', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-ctx-6' });
    await db.emotionRecords.insert({ user_id: 'u-ctx-6', emotion_type: 'calm' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-ctx-6', {});
    assert.strictEqual(result.context.emotions.length, 1);
    assert.strictEqual(result.context.emotions[0].emotion_type, 'calm');
  });

  await test('（1.context builder）context.behaviors正確對應getBehaviorPatterns()的結果', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-ctx-7' });
    await db.behaviorPatterns.insert({ user_id: 'u-ctx-7', pattern_type: 'late-snack' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-ctx-7', {});
    assert.strictEqual(result.context.behaviors.length, 1);
    assert.strictEqual(result.context.behaviors[0].pattern_type, 'late-snack');
  });

  await test('（1.context builder）context.reports正確對應getReports()的結果', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-ctx-8' });
    await db.aiReports.insert({ user_id: 'u-ctx-8', report_type: 'weekly' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-ctx-8', {});
    assert.strictEqual(result.context.reports.length, 1);
    assert.strictEqual(result.context.reports[0].report_type, 'weekly');
  });

  await test('（1.context builder）五種來源同時建立時全部正確整合進同一個context', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-ctx-9' });
    await db.explorationRecords.insert({ user_id: 'u-ctx-9' });
    await db.foodEvents.insert({ user_id: 'u-ctx-9' });
    await db.emotionRecords.insert({ user_id: 'u-ctx-9' });
    await db.behaviorPatterns.insert({ user_id: 'u-ctx-9' });
    await db.aiReports.insert({ user_id: 'u-ctx-9' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-ctx-9', {});
    assert.strictEqual(result.context.explorations.length, 1);
    assert.strictEqual(result.context.foodEvents.length, 1);
    assert.strictEqual(result.context.emotions.length, 1);
    assert.strictEqual(result.context.behaviors.length, 1);
    assert.strictEqual(result.context.reports.length, 1);
  });

  await test('（1.context builder）options.limit正確套用到全部五個子查詢', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-ctx-10' });
    for (let i = 0; i < 5; i++) await db.foodEvents.insert({ user_id: 'u-ctx-10', meal_type: 'm' + i });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-ctx-10', { limit: 2 });
    assert.strictEqual(result.context.foodEvents.length, 2);
  });

  await test('（1.context builder）沒有帶options時安全套用各domain service自己的預設值（不拋出例外）', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-ctx-11' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-ctx-11');
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // B. domain service boundary
  // =========================================================================
  console.log('--- B. domain service boundary ---');

  const ctxSrc = readPrepSrc('context_builder.js');

  const EXPECTED_IMPORTS = [
    ['getUserExplorations', '../../services/exploration_service.js'],
    ['listFoodHistory', '../../services/food_service.js'],
    ['listEmotionHistory', '../../services/emotion_service.js'],
    ['getBehaviorPatterns', '../../services/behavior_service.js'],
    ['getReports', '../../services/report_service.js'],
    ['requireActiveUser', '../../services/user_service.js'],
  ];
  for (const [fnName, fromPath] of EXPECTED_IMPORTS) {
    await test(`（2.domain service boundary）context_builder.js 有 import 既有的 ${fnName}（來自${fromPath}）`, () => {
      const re = new RegExp(`import\\s*\\{[^}]*\\b${fnName}\\b[^}]*\\}\\s*from\\s*['"]${fromPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
      assert.ok(re.test(ctxSrc), `找不到 import { ${fnName} } from '${fromPath}'`);
    });
  }

  await test('（2.domain service boundary）context_builder.js 完全不直接呼叫 db.explorationRecords/db.foodEvents/db.emotionRecords/db.behaviorPatterns/db.aiReports（一律透過既有domain service函式，不繞過去直接摸db table物件）', () => {
    assert.ok(!/db\.(explorationRecords|foodEvents|emotionRecords|behaviorPatterns|aiReports)\./.test(ctxSrc));
  });

  await test('（2.domain service boundary）context_builder.js 使用 Promise.all 平行取得五個來源', () => {
    assert.ok(/Promise\.all/.test(ctxSrc));
  });

  await test('（2.domain service boundary）原始碼掃描：五個既有domain service（exploration/food/emotion/behavior/report_service.js）跟user_service.js完全沒有被TASK1.41修改', () => {
    const diff = execFileSync(
      'git',
      ['diff', '--stat', 'src/services/exploration_service.js', 'src/services/food_service.js', 'src/services/emotion_service.js', 'src/services/behavior_service.js', 'src/services/report_service.js', 'src/services/user_service.js'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    assert.strictEqual(diff.trim(), '');
  });

  // 注意：這裡原本用「git diff --stat 整個insight_service.js」檢查
  // TASK1.41完全沒有動它，但這是跟TASK1.34/TASK1.38曾經犯過的同一種
  // 「用live git diff檢查一個檔案，假設它永遠不會再被改」的脆弱設計
  // ——TASK1.42（架構規格明確要求）之後就會合法地修改這個檔案（新增
  // getInsightContext()）。改用行為性檢查取代：確認TASK1.40建立的
  // getUserInsight()函式簽章跟固定回傳值的行為描述仍然存在於原始碼裡，
  // 這個斷言不會因為TASK1.42在同一個檔案新增其他函式而誤判失敗。
  await test('（TASK1.42後更新）原始碼掃描：src/intelligence/insight_service.js 仍然保留TASK1.40建立的getUserInsight()函式與其固定回傳值行為（不因後續任務新增其他函式而受影響）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'intelligence', 'insight_service.js'), 'utf8'));
    assert.ok(/async function getUserInsight\(userId, context\)/.test(src));
    assert.ok(/return \{ ok: true, status: 'not_ready', data: null \}/.test(src));
  });

  console.log('');

  // =========================================================================
  // C. no SQL in intelligence layer
  // =========================================================================
  console.log('--- C. no SQL in intelligence layer ---');

  const prepJsFiles = fs.readdirSync(dataPrepDir).filter((f) => f.endsWith('.js')).sort();
  await test(`（3.no SQL）src/intelligence/data_preparation/ 恰好包含3個.js檔案（context_builder/data_normalizer/index）`, () => {
    assert.deepStrictEqual(prepJsFiles, ['context_builder.js', 'data_normalizer.js', 'index.js']);
  });

  for (const file of prepJsFiles) {
    await test(`（3.no SQL）src/intelligence/data_preparation/${file} 完全沒有 db.prepare()`, () => {
      const src = readPrepSrc(file);
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（3.no SQL）src/intelligence/data_preparation/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readPrepSrc(file);
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（3.no SQL）src/intelligence/data_preparation/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readPrepSrc(file);
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（3.no SQL）src/intelligence/data_preparation/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readPrepSrc(file);
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（3.no SQL）data_normalizer.js 甚至完全不接受db參數（純函式，簽章只有normalize(context)）', () => {
    const src = readPrepSrc('data_normalizer.js');
    assert.ok(/function normalize\(context\)/.test(src));
  });

  console.log('');

  // =========================================================================
  // D. no AI SDK
  // =========================================================================
  console.log('--- D. no AI SDK ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i,
  ];
  for (const file of prepJsFiles) {
    const codeOnly = readPrepSrc(file);
    for (const pattern of AI_KEYWORDS) {
      await test(`（4.no AI SDK）src/intelligence/data_preparation/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（4.no AI SDK）src/intelligence/data_preparation/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // E. no external API call
  // =========================================================================
  console.log('--- E. no external API call ---');

  for (const file of prepJsFiles) {
    await test(`（5.no external API call）src/intelligence/data_preparation/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readPrepSrc(file);
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（5.no external API call）src/intelligence/data_preparation/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readPrepSrc(file);
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  await test('（5.no external API call）context_builder.js/data_normalizer.js/index.js 完全沒有 import src/auth/ 或 src/identity/（不處理session）', () => {
    for (const file of prepJsFiles) {
      const src = readPrepSrc(file);
      assert.ok(!/from\s+['"].*\/auth\//.test(src), `${file} import了 src/auth/`);
      assert.ok(!/from\s+['"].*\/identity\//.test(src), `${file} import了 src/identity/`);
    }
  });

  console.log('');

  // =========================================================================
  // F. user ownership rule
  // =========================================================================
  console.log('--- F. user ownership rule ---');

  await test('（6.user ownership rule）buildContext()完全不會讀取options.user_id（userId一律是獨立參數，不接受options覆蓋）', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-own-1' });
    await db.foodEvents.insert({ user_id: 'u-own-1', meal_type: 'own-meal' });
    db.seedUser({ id: 'u-own-victim' });
    await db.foodEvents.insert({ user_id: 'u-own-victim', meal_type: 'victim-meal' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-own-1', { user_id: 'u-own-victim' });
    assert.strictEqual(result.context.foodEvents.length, 1);
    assert.strictEqual(result.context.foodEvents[0].meal_type, 'own-meal');
  });

  await test('（6.user ownership rule）cross-user isolation：使用者A的context完全不含使用者B的資料', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-own-a' });
    db.seedUser({ id: 'u-own-b' });
    await db.explorationRecords.insert({ user_id: 'u-own-a', card_text: 'a-only' });
    await db.explorationRecords.insert({ user_id: 'u-own-b', card_text: 'b-only' });
    const builder = createContextBuilder();
    const resultA = await builder.buildContext(db, 'u-own-a', {});
    assert.strictEqual(resultA.context.explorations.length, 1);
    assert.strictEqual(resultA.context.explorations[0].card_text, 'a-only');
  });

  await test('（6.user ownership rule）原始碼掃描：context_builder.js 完全不讀取 .user_id（除了合法傳給domain service的userId參數本身，這裡確認函式簽章只用獨立的userId參數，不從options/context物件解構user_id欄位）', () => {
    assert.ok(!/options\.user_id/.test(ctxSrc));
    assert.ok(!/context\.user_id/.test(ctxSrc));
  });

  await test('（6.user ownership rule）data_preparation/index.js的prepare()同樣把userId當獨立參數傳給buildContext()，不從options讀取', () => {
    const src = readPrepSrc('index.js');
    assert.ok(/prepare\(db, userId, options\)/.test(src) || /async function prepare\(db, userId, options\)/.test(src));
  });

  console.log('');

  // =========================================================================
  // G. deterministic normalization
  // =========================================================================
  console.log('--- G. deterministic normalization ---');

  function sampleContext() {
    return {
      user: { id: 'u-norm-1', status: 'active', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-1', display_name: 'Name', legacy_sync_code: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', last_login_at: '2026-01-03T00:00:00Z' },
      explorations: [{ id: 1, user_id: 'u-norm-1', card_text: 'x' }],
      foodEvents: [{ id: 2, user_id: 'u-norm-1', meal_type: 'lunch' }],
      emotions: [{ id: 3, user_id: 'u-norm-1', emotion_type: 'calm' }],
      behaviors: [{ id: 4, user_id: 'u-norm-1', pattern_type: 'p', confidence_score: 0.87 }],
      reports: [{ id: 5, user_id: 'u-norm-1', report_type: 'weekly' }],
    };
  }

  await test('（7.deterministic normalization）同樣的輸入呼叫兩次normalize()得到完全相同（deepStrictEqual）的輸出', () => {
    const normalizer = createDataNormalizer();
    const a = normalizer.normalize(sampleContext());
    const b = normalizer.normalize(sampleContext());
    assert.deepStrictEqual(a, b);
  });

  await test('（7.deterministic normalization）normalize()多次呼叫同一個normalizer實例，結果仍然一致（不受呼叫次數/內部狀態影響）', () => {
    const normalizer = createDataNormalizer();
    const results = [];
    for (let i = 0; i < 5; i++) results.push(normalizer.normalize(sampleContext()));
    for (let i = 1; i < results.length; i++) assert.deepStrictEqual(results[i], results[0]);
  });

  await test('（7.deterministic normalization）不同normalizer實例對同樣輸入產生相同輸出（不依賴實例內部狀態）', () => {
    const a = createDataNormalizer().normalize(sampleContext());
    const b = createDataNormalizer().normalize(sampleContext());
    assert.deepStrictEqual(a, b);
  });

  await test('（7.deterministic normalization）normalize()不會修改（mutate）傳入的原始context物件', () => {
    const normalizer = createDataNormalizer();
    const original = sampleContext();
    const snapshot = JSON.parse(JSON.stringify(original));
    normalizer.normalize(original);
    assert.deepStrictEqual(original, snapshot);
  });

  await test('（7.deterministic normalization）normalize()回傳的user欄位只保留白名單子集：id/isGuest/authProvider/status/createdAt', () => {
    const normalizer = createDataNormalizer();
    const result = normalizer.normalize(sampleContext());
    assert.deepStrictEqual(Object.keys(result.user).sort(), ['authProvider', 'createdAt', 'id', 'isGuest', 'status']);
  });

  await test('（7.deterministic normalization）normalize()回傳的user欄位不含auth_provider_id/legacy_sync_code/updated_at/last_login_at（敏感/實作細節欄位）', () => {
    const normalizer = createDataNormalizer();
    const result = normalizer.normalize(sampleContext());
    const keys = Object.keys(result.user);
    assert.ok(!keys.includes('auth_provider_id'));
    assert.ok(!keys.includes('legacy_sync_code'));
    assert.ok(!keys.includes('updated_at'));
    assert.ok(!keys.includes('last_login_at'));
  });

  await test('（7.deterministic normalization）每個domain資料欄位（explorations/foodEvents/emotions/behaviors/reports）都轉成{count,items}結構', () => {
    const normalizer = createDataNormalizer();
    const result = normalizer.normalize(sampleContext());
    for (const key of ['explorations', 'foodEvents', 'emotions', 'behaviors', 'reports']) {
      assert.deepStrictEqual(Object.keys(result[key]).sort(), ['count', 'items']);
      assert.strictEqual(result[key].count, result[key].items.length);
    }
  });

  await test('（7.deterministic normalization）behaviors.items裡既有的confidence_score原樣保留，不被重新計算或四捨五入', () => {
    const normalizer = createDataNormalizer();
    const result = normalizer.normalize(sampleContext());
    assert.strictEqual(result.behaviors.items[0].confidence_score, 0.87);
  });

  await test('（7.deterministic normalization）items內容是shallow copy，不是同一個物件參考（修改normalize()輸出不會影響原始context）', () => {
    const normalizer = createDataNormalizer();
    const original = sampleContext();
    const result = normalizer.normalize(original);
    result.explorations.items[0].card_text = 'MUTATED';
    assert.strictEqual(original.explorations[0].card_text, 'x');
  });

  await test('（7.deterministic normalization）normalize()不讀取Date.now()/Math.random()（原始碼掃描確認）', () => {
    const src = readPrepSrc('data_normalizer.js');
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  console.log('');

  // =========================================================================
  // H. empty data handling
  // =========================================================================
  console.log('--- H. empty data handling ---');

  await test('（8.empty data handling）全新使用者（五個資料表都沒有任何紀錄）buildContext()成功，五個欄位皆為空陣列', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-empty-1' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-empty-1', {});
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.context.explorations, []);
    assert.deepStrictEqual(result.context.foodEvents, []);
    assert.deepStrictEqual(result.context.emotions, []);
    assert.deepStrictEqual(result.context.behaviors, []);
    assert.deepStrictEqual(result.context.reports, []);
  });

  await test('（8.empty data handling）normalize()對空陣列的context回傳{count:0, items:[]}', () => {
    const normalizer = createDataNormalizer();
    const result = normalizer.normalize({ user: null, explorations: [], foodEvents: [], emotions: [], behaviors: [], reports: [] });
    for (const key of ['explorations', 'foodEvents', 'emotions', 'behaviors', 'reports']) {
      assert.deepStrictEqual(result[key], { count: 0, items: [] });
    }
  });

  await test('（8.empty data handling）normalize(undefined)不拋出例外，回傳安全的空結構', () => {
    const normalizer = createDataNormalizer();
    const result = normalizer.normalize(undefined);
    assert.strictEqual(result.user, null);
    assert.deepStrictEqual(result.explorations, { count: 0, items: [] });
  });

  await test('（8.empty data handling）normalize(null)不拋出例外，回傳安全的空結構', () => {
    const normalizer = createDataNormalizer();
    const result = normalizer.normalize(null);
    assert.strictEqual(result.user, null);
  });

  await test('（8.empty data handling）normalize({})（完全空物件）不拋出例外，全部欄位安全預設為空', () => {
    const normalizer = createDataNormalizer();
    const result = normalizer.normalize({});
    assert.strictEqual(result.user, null);
    for (const key of ['explorations', 'foodEvents', 'emotions', 'behaviors', 'reports']) {
      assert.deepStrictEqual(result[key], { count: 0, items: [] });
    }
  });

  await test('（8.empty data handling）normalize()對context.user=null正確回傳user:null（不拋出例外）', () => {
    const normalizer = createDataNormalizer();
    const result = normalizer.normalize({ user: null, explorations: [], foodEvents: [], emotions: [], behaviors: [], reports: [] });
    assert.strictEqual(result.user, null);
  });

  await test('（8.empty data handling，端對端）prepare()對全新使用者回傳的normalize後context，count全部為0', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-empty-2' });
    const service = createDataPreparationService();
    const result = await service.prepare(db, 'u-empty-2', {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.context.explorations.count, 0);
    assert.strictEqual(result.context.reports.count, 0);
  });

  console.log('');

  // =========================================================================
  // I. error handling
  // =========================================================================
  console.log('--- I. error handling ---');

  await test('（9.error handling）buildContext()對不存在的userId安全回傳{ok:false, reason:"user_not_found"}', async () => {
    const db = makeMockDb();
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'does-not-exist', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_not_found');
  });

  await test('（9.error handling）buildContext()對userId=null安全回傳失敗（不拋出例外）', async () => {
    const db = makeMockDb();
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, null, {});
    assert.strictEqual(result.ok, false);
  });

  await test('（9.error handling）使用者status為suspended時buildContext()安全回傳失敗', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-err-1', status: 'suspended' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-err-1', {});
    assert.strictEqual(result.ok, false);
  });

  await test('（9.error handling）任一子來源查詢失敗時，buildContext()整體回傳失敗（不會回傳部分資料）', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-err-2' });
    db.foodEvents.listByUser = async () => ({ ok: false, error: 'db_boom' });
    const builder = createContextBuilder();
    const result = await builder.buildContext(db, 'u-err-2', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.context, undefined);
  });

  await test('（9.error handling）五個來源逐一測試查詢失敗都會讓整體失敗', async () => {
    const tables = ['explorationRecords', 'foodEvents', 'emotionRecords', 'behaviorPatterns', 'aiReports'];
    for (const t of tables) {
      const db = makeMockDb();
      db.seedUser({ id: 'u-err-3-' + t });
      db[t].listByUser = async () => ({ ok: false, error: 'db_boom' });
      const builder = createContextBuilder();
      const result = await builder.buildContext(db, 'u-err-3-' + t, {});
      assert.strictEqual(result.ok, false, `${t} 查詢失敗時應該整體失敗`);
    }
  });

  await test('（9.error handling）prepare()在buildContext()失敗時直接回傳失敗結果，不含任何context欄位（沒有把未normalize的原始資料或半成品結果頂替回傳）', async () => {
    const db = makeMockDb();
    const service = createDataPreparationService();
    const result = await service.prepare(db, 'does-not-exist', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_not_found');
    assert.strictEqual(result.context, undefined);
  });

  await test('（9.error handling）原始碼掃描：index.js的prepare()只有在buildContext()回傳ok:true時才會呼叫normalize()（結構上保證失敗結果不會被送進normalize）', () => {
    const src = readPrepSrc('index.js');
    // prepare()的實作應該是：先呼叫buildContext()，用if(!contextResult.ok)提前return，
    // 只有通過這個檢查之後才會呼叫dataNormalizer.normalize()。
    const prepareBody = src.match(/async function prepare\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
    assert.ok(prepareBody, '找不到prepare()函式本體');
    const body = prepareBody[1];
    const guardIndex = body.search(/if\s*\(\s*!contextResult\.ok\s*\)/);
    const normalizeIndex = body.search(/dataNormalizer\.normalize\(/);
    assert.ok(guardIndex >= 0, 'prepare()應該要有 if(!contextResult.ok) 提前return的判斷式');
    assert.ok(normalizeIndex > guardIndex, 'normalize()的呼叫應該要在失敗判斷式之後才執行');
  });

  await test('（9.error handling）normalize()對非物件輸入（字串/數字）安全回傳空結構，不拋出例外', () => {
    const normalizer = createDataNormalizer();
    assert.doesNotThrow(() => normalizer.normalize('not an object'));
    assert.doesNotThrow(() => normalizer.normalize(42));
    const result = normalizer.normalize('not an object');
    assert.strictEqual(result.user, null);
  });

  await test('（9.error handling）normalize()對context.explorations是非陣列值（例如字串）時安全視為空清單，不拋出例外', () => {
    const normalizer = createDataNormalizer();
    const result = normalizer.normalize({ explorations: 'not-an-array' });
    assert.deepStrictEqual(result.explorations, { count: 0, items: [] });
  });

  console.log('');

  // =========================================================================
  // J. bootstrap injection
  // =========================================================================
  console.log('--- J. bootstrap injection ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（10.bootstrap injection）createApplication(env).intelligence 具備 dataPreparation 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('dataPreparation' in app.intelligence);
  });

  await test('（10.bootstrap injection）app.intelligence.dataPreparation 恰好具備 buildContext/normalize/prepare 三個函式', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence.dataPreparation).sort(), ['buildContext', 'normalize', 'prepare']);
    assert.strictEqual(typeof app.intelligence.dataPreparation.buildContext, 'function');
    assert.strictEqual(typeof app.intelligence.dataPreparation.normalize, 'function');
    assert.strictEqual(typeof app.intelligence.dataPreparation.prepare, 'function');
  });

  // 注意：TASK1.42 又新增了 `context` 欄位（Insight Context Builder的
  // extension point），這是明確要做的擴充，不是回歸，這裡的預期key
  // 清單已同步更新。
  // 注意：TASK1.43 又新增了 `analysis` 欄位，這是明確要做的擴充，不是
  // 回歸，這裡的預期key清單已同步更新。
  // 注意：TASK1.44 又新增了 `recommendation` 欄位，這是明確要做的
  // 擴充，不是回歸，這裡的預期key清單已同步更新。
  // 注意：TASK1.45 又新增了 `orchestration` 欄位，這是明確要做的
  // 擴充，不是回歸，這裡的預期key清單已同步更新。
  // 注意：TASK1.46 又新增了 `service` 欄位，這是明確要做的擴充，不是
  // 回歸，這裡的預期key清單已同步更新。
  // 注意：TASK1.48 又新增了 `facade` 欄位，TASK1.50 又新增了
  // `execution` 欄位，TASK1.51 又新增了 `events` 欄位，都是明確要做的
  // 擴充，不是回歸，這裡的預期key清單已同步更新。
  await test('（TASK1.51後更新）app.intelligence 仍然保留TASK1.40既有的insightService/analysisEngine/recommendationEngine跟TASK1.41既有的dataPreparation跟TASK1.42既有的context跟TASK1.43既有的analysis跟TASK1.44既有的recommendation跟TASK1.45既有的orchestration跟TASK1.46既有的service跟TASK1.48既有的facade跟TASK1.50既有的execution（沒有被TASK1.51取代或破壞）', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), ['analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution', 'facade', 'features', 'governance', 'history', 'insightService', 'metrics', 'monitoring', 'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow']);
  });

  await test('（10.bootstrap injection）透過app.intelligence.dataPreparation.prepare()呼叫，可以正確運作（端對端，含mock db）', async () => {
    const app = createApplication(makeFullEnv());
    const db = makeMockDb();
    db.seedUser({ id: 'u-boot-1' });
    const result = await app.intelligence.dataPreparation.prepare(db, 'u-boot-1', {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.context.user.id, 'u-boot-1');
  });

  await test('（10.bootstrap injection）每次createApplication()呼叫都各自建立獨立的dataPreparation實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.dataPreparation, app2.intelligence.dataPreparation);
  });

  await test('（10.bootstrap injection）createApplication() 完整回傳形狀依然是 {config, db, services, router, middleware, intelligence} 六個頂層欄位（TASK1.41純粹擴充intelligence內部，不新增頂層欄位）', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'intelligence', 'middleware', 'router', 'services']);
  });

  await test('（10.bootstrap injection）原始碼掃描：src/bootstrap/application.js 有 import dataPreparation（來自 ../intelligence/index.js）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(/import\s*\{[^}]*\bdataPreparation\b[^}]*\}\s*from\s*['"]\.\.\/intelligence\/index\.js['"]/.test(src));
  });

  await test('（10.bootstrap injection）原始碼掃描：src/intelligence/index.js 有 export dataPreparation namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'intelligence', 'index.js'), 'utf8'));
    assert.ok(/export \* as dataPreparation from ['"]\.\/data_preparation\/index\.js['"]/.test(src));
  });

  await test('（10.bootstrap injection）app.router.routes 數量沒有因為新增dataPreparation而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  console.log('');

  // =========================================================================
  // K. regression check
  // =========================================================================
  console.log('--- K. regression check ---');

  // 沿用TASK1.39/1.40既有的遞迴防護手法：這個章節會動態掃描並spawn子
  // 行程執行backups/底下全部既有測試檔案，其中包含TASK1.39/1.40自己的
  // meta regression suite（它們也會動態掃描並spawn子行程）。用環境變數
  // PHASE1_REVIEW_NESTED當作遞迴深度防護旗標，避免互相遞迴spawn造成
  // 無限迴圈（TASK1.39/1.40已經示範過這個問題跟修法）。
  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（11.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.41-intelligence-data-preparation')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.40）`, () => {
      assert.ok(allSuites.length >= 32, `預期至少32個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（11.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
        try {
          execFileSync('node', [suite], {
            cwd: repoRoot,
            stdio: 'pipe',
            timeout: 60000,
            env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
          });
        } catch (e) {
          const output = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
          throw new Error(`${relName} 執行失敗：${output.split('\n').filter((l) => l.includes('❌') || l.includes('FAIL')).slice(0, 5).join(' | ')}`);
        }
      });
    }
  }

  console.log('');

  // =========================================================================
  // L. P1-P6
  // =========================================================================
  console.log('--- L. P1-P6 ---');

  await test('（12.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（12.P1-P6）src/worker.js 完全沒有被TASK1.41修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）wrangler.toml 完全沒有被TASK1.41修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

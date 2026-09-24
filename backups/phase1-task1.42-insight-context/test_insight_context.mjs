/*
 * Phase 1 TASK 1.42｜Insight Context Integration Layer 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「Data Preparation Layer
 * 與 Insight Service 之間的穩定內部合約」：Insight Context的形狀是否
 * 正確、buildInsightContext()是否deterministic、getInsightContext()
 * 是否正確串接dataPreparation跟contextBuilder、整條鏈路是否完全不碰
 * SQL/AI API/fetch()。不驗證任何分析/推薦邏輯（因為根本沒有）。
 *
 * 分為以下12個部分：
 * A) context contract
 * B) data preparation integration
 * C) no AI dependency
 * D) no external API call
 * E) no SQL
 * F) deterministic output
 * G) missing data handling
 * H) invalid context rejection
 * I) bootstrap injection
 * J) intelligence boundary
 * K) regression test
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
const intelDir = path.join(srcRoot, 'intelligence');
const contextDir = path.join(intelDir, 'context');
const contractsSubDir = path.join(intelDir, 'contracts');

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

function readSrc(fullPath) {
  return stripComments(fs.readFileSync(fullPath, 'utf8'));
}

// -----------------------------------------------------------------------
// Mock db：users + 五個domain資料表（沿用TASK1.36/1.38/1.39/1.40/1.41
// 既有的mock手法）
// -----------------------------------------------------------------------
function makeMockDb() {
  const users = new Map();
  const tables = { explorationRecords: [], foodEvents: [], emotionRecords: [], behaviorPatterns: [], aiReports: [] };
  let nextId = 1;

  function seedUser(u) {
    users.set(u.id, Object.assign({ status: 'active', is_guest: 1, auth_provider: null, display_name: null, created_at: '2026-01-01T00:00:00Z' }, u));
  }
  function makeTable(store, defaultLimit) {
    return {
      async insert(rec) {
        const row = Object.assign({ created_at: new Date().toISOString() }, rec, { id: nextId++ });
        store.push(row);
        return { ok: true, id: row.id };
      },
      async listByUser(userId, limit) {
        return { ok: true, results: store.filter((r) => r.user_id === userId).slice(0, limit || defaultLimit) };
      },
    };
  }

  return {
    seedUser,
    users: { async getById(id) { return { ok: true, row: users.get(id) || null }; } },
    explorationRecords: makeTable(tables.explorationRecords, 50),
    foodEvents: makeTable(tables.foodEvents, 50),
    emotionRecords: makeTable(tables.emotionRecords, 50),
    behaviorPatterns: makeTable(tables.behaviorPatterns, 50),
    aiReports: makeTable(tables.aiReports, 20),
  };
}

function samplePreparedContext(overrides) {
  return Object.assign(
    {
      user: { id: 'u-sample', isGuest: false, authProvider: 'google', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
      explorations: { count: 1, items: [{ id: 1, user_id: 'u-sample', card_text: 'x' }] },
      foodEvents: { count: 2, items: [{ id: 2, user_id: 'u-sample', meal_type: 'lunch' }, { id: 3, user_id: 'u-sample', meal_type: 'dinner' }] },
      emotions: { count: 1, items: [{ id: 4, user_id: 'u-sample', emotion_type: 'calm' }] },
      behaviors: { count: 1, items: [{ id: 5, user_id: 'u-sample', pattern_type: 'p', confidence_score: 0.75 }] },
      reports: { count: 0, items: [] },
    },
    overrides || {}
  );
}

async function run() {
  const contractMod = await import(path.join(contractsSubDir, 'insight_context_contract.js'));
  const { InsightContextContract, validateInsightContext } = contractMod;
  const builderMod = await import(path.join(contextDir, 'insight_context_builder.js'));
  const { createInsightContextBuilder } = builderMod;
  const contextIndexMod = await import(path.join(contextDir, 'index.js'));
  const intelligenceIndexMod = await import(path.join(intelDir, 'index.js'));
  const { createInsightService } = await import(path.join(intelDir, 'insight_service.js'));
  const { createDataPreparationService } = await import(path.join(intelDir, 'data_preparation', 'index.js'));

  // =========================================================================
  // A. context contract
  // =========================================================================
  console.log('--- A. context contract ---');

  await test('（1.context contract）InsightContextContract.fields 恰好定義了7個欄位', () => {
    assert.deepStrictEqual(
      Object.keys(InsightContextContract.fields).sort(),
      ['activityContext', 'behaviorContext', 'emotionContext', 'metadata', 'nutritionContext', 'reportContext', 'user'].sort()
    );
  });

  await test('（1.context contract）validateInsightContext() 對規格範例的完整結構回傳{ok:true}', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext());
    const result = validateInsightContext(context);
    assert.strictEqual(result.ok, true);
  });

  const REQUIRED_FIELDS = Object.keys(InsightContextContract.fields);
  for (const field of REQUIRED_FIELDS) {
    await test(`（1.context contract）validateInsightContext() 缺少${field}欄位時回傳{ok:false, reason:'missing_field', field:'${field}'}`, () => {
      const builder = createInsightContextBuilder();
      const { context } = builder.buildInsightContext(samplePreparedContext());
      delete context[field];
      const result = validateInsightContext(context);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, 'missing_field');
      assert.strictEqual(result.field, field);
    });
  }

  await test('（1.context contract）validateInsightContext() 對user是非null非物件（例如字串）時回傳invalid_field_type', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext());
    context.user = 'not-an-object';
    const result = validateInsightContext(context);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_field_type');
    assert.strictEqual(result.field, 'user');
  });

  await test('（1.context contract）validateInsightContext() 對user=null視為合法（訪客/找不到使用者的合法值）', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext({ user: null }));
    const result = validateInsightContext(context);
    assert.strictEqual(result.ok, true);
  });

  const SECTION_KEYS = ['nutritionContext', 'behaviorContext', 'emotionContext', 'activityContext', 'reportContext'];
  for (const sectionKey of SECTION_KEYS) {
    await test(`（1.context contract）validateInsightContext() 對${sectionKey}不是物件時回傳invalid_field_type`, () => {
      const builder = createInsightContextBuilder();
      const { context } = builder.buildInsightContext(samplePreparedContext());
      context[sectionKey] = 'not-an-object';
      const result = validateInsightContext(context);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.field, sectionKey);
    });

    await test(`（1.context contract）validateInsightContext() 對${sectionKey}.count不是number時回傳invalid_field_type`, () => {
      const builder = createInsightContextBuilder();
      const { context } = builder.buildInsightContext(samplePreparedContext());
      context[sectionKey].count = 'not-a-number';
      const result = validateInsightContext(context);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.field, `${sectionKey}.count`);
    });

    await test(`（1.context contract）validateInsightContext() 對${sectionKey}.items不是物件（例如null）時回傳invalid_field_type`, () => {
      const builder = createInsightContextBuilder();
      const { context } = builder.buildInsightContext(samplePreparedContext());
      context[sectionKey].items = null;
      const result = validateInsightContext(context);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.field, `${sectionKey}.items`);
    });
  }

  await test('（1.context contract）validateInsightContext() 對metadata不是物件時回傳invalid_field_type', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext());
    context.metadata = null;
    const result = validateInsightContext(context);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'metadata');
  });

  await test('（1.context contract）validateInsightContext(null) 安全回傳invalid_context，不拋出例外', () => {
    const result = validateInsightContext(null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（1.context contract）validateInsightContext("字串") 安全回傳invalid_context，不拋出例外', () => {
    const result = validateInsightContext('not an object');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_context');
  });

  console.log('');

  // =========================================================================
  // B. data preparation integration
  // =========================================================================
  console.log('--- B. data preparation integration ---');

  await test('（2.data preparation integration）buildInsightContext() 正確把 dataPreparation.foodEvents 映射成 nutritionContext', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext());
    assert.strictEqual(context.nutritionContext.count, 2);
    assert.strictEqual(context.nutritionContext.items[0].meal_type, 'lunch');
  });

  await test('（2.data preparation integration）buildInsightContext() 正確把 dataPreparation.behaviors 映射成 behaviorContext', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext());
    assert.strictEqual(context.behaviorContext.count, 1);
    assert.strictEqual(context.behaviorContext.items[0].pattern_type, 'p');
  });

  await test('（2.data preparation integration）buildInsightContext() 正確把 dataPreparation.emotions 映射成 emotionContext', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext());
    assert.strictEqual(context.emotionContext.count, 1);
    assert.strictEqual(context.emotionContext.items[0].emotion_type, 'calm');
  });

  await test('（2.data preparation integration）buildInsightContext() 正確把 dataPreparation.explorations 映射成 activityContext', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext());
    assert.strictEqual(context.activityContext.count, 1);
    assert.strictEqual(context.activityContext.items[0].card_text, 'x');
  });

  await test('（2.data preparation integration）buildInsightContext() 正確把 dataPreparation.reports 映射成 reportContext', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext());
    assert.strictEqual(context.reportContext.count, 0);
    assert.deepStrictEqual(context.reportContext.items, []);
  });

  await test('（2.data preparation integration）buildInsightContext() 的user欄位原樣透傳dataPreparation正規化過的user', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext());
    assert.deepStrictEqual(context.user, { id: 'u-sample', isGuest: false, authProvider: 'google', status: 'active', createdAt: '2026-01-01T00:00:00Z' });
  });

  await test('（2.data preparation integration）metadata.totalRecords正確等於五個來源count的加總', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext());
    assert.strictEqual(context.metadata.totalRecords, 1 + 2 + 1 + 1 + 0);
  });

  await test('（2.data preparation integration）metadata.sourceCounts正確對應五個來源各自的count', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext());
    assert.deepStrictEqual(context.metadata.sourceCounts, { nutrition: 2, behavior: 1, emotion: 1, activity: 1, report: 0 });
  });

  await test('（2.data preparation integration，端對端）真正呼叫createDataPreparationService().prepare()後再交給buildInsightContext()，全程串接成功', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-e2e-1' });
    await db.foodEvents.insert({ user_id: 'u-e2e-1', meal_type: 'breakfast' });
    const dataPrepService = createDataPreparationService();
    const prepared = await dataPrepService.prepare(db, 'u-e2e-1', {});
    assert.strictEqual(prepared.ok, true);
    const builder = createInsightContextBuilder();
    const { context, validation } = builder.buildInsightContext(prepared.context);
    assert.strictEqual(validation.ok, true);
    assert.strictEqual(context.nutritionContext.count, 1);
  });

  await test('（2.data preparation integration，端對端）透過insight_service.js的getInsightContext()完整串接dataPreparation+contextBuilder', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-e2e-2' });
    await db.behaviorPatterns.insert({ user_id: 'u-e2e-2', pattern_type: 'late-snack' });
    const dataPrepService = createDataPreparationService();
    const contextBuilder = createInsightContextBuilder();
    const insightService = createInsightService({ dataPreparation: dataPrepService, contextBuilder });
    const result = await insightService.getInsightContext(db, 'u-e2e-2', {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'context_ready');
    assert.strictEqual(result.data.context.behaviorContext.count, 1);
  });

  await test('（2.data preparation integration）getInsightContext()成功時回傳shape恰好是{ok, status, data:{context}}', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-e2e-3' });
    const insightService = createInsightService({ dataPreparation: createDataPreparationService(), contextBuilder: createInsightContextBuilder() });
    const result = await insightService.getInsightContext(db, 'u-e2e-3', {});
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'ok', 'status']);
    assert.deepStrictEqual(Object.keys(result.data), ['context']);
  });

  await test('（2.data preparation integration）getInsightContext()完全不會產生任何分析/建議結果（data.context裡沒有insight/recommendation/analysis欄位）', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-e2e-4' });
    const insightService = createInsightService({ dataPreparation: createDataPreparationService(), contextBuilder: createInsightContextBuilder() });
    const result = await insightService.getInsightContext(db, 'u-e2e-4', {});
    const keys = Object.keys(result.data.context);
    assert.ok(!keys.includes('insight'));
    assert.ok(!keys.includes('recommendation'));
    assert.ok(!keys.includes('analysis'));
    assert.ok(!keys.includes('score'));
  });

  console.log('');

  // =========================================================================
  // C. no AI dependency
  // =========================================================================
  console.log('--- C. no AI dependency ---');

  const NEW_FILES = [
    path.join(contractsSubDir, 'insight_context_contract.js'),
    path.join(contextDir, 'insight_context_builder.js'),
    path.join(contextDir, 'index.js'),
  ];

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i,
  ];
  for (const filePath of NEW_FILES) {
    const relName = path.relative(srcRoot, filePath);
    const codeOnly = readSrc(filePath);
    for (const pattern of AI_KEYWORDS) {
      await test(`（3.no AI dependency）src/${relName} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${relName} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（3.no AI dependency）src/${relName} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${relName} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // D. no external API call
  // =========================================================================
  console.log('--- D. no external API call ---');

  for (const filePath of NEW_FILES) {
    const relName = path.relative(srcRoot, filePath);
    await test(`（4.no external API call）src/${relName} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(filePath);
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（4.no external API call）src/${relName} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(filePath);
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
    await test(`（4.no external API call）src/${relName} 完全沒有 import src/auth/ 或 src/identity/（不處理session）`, () => {
      const src = readSrc(filePath);
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // E. no SQL
  // =========================================================================
  console.log('--- E. no SQL ---');

  for (const filePath of NEW_FILES) {
    const relName = path.relative(srcRoot, filePath);
    await test(`（5.no SQL）src/${relName} 完全沒有 db.prepare()`, () => {
      const src = readSrc(filePath);
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（5.no SQL）src/${relName} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(filePath);
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（5.no SQL）src/${relName} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(filePath);
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（5.no SQL）src/${relName} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(filePath);
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（5.no SQL）insight_context_builder.js 甚至完全不接受db參數（純函式，簽章只有buildInsightContext(preparedContext)）', () => {
    const src = readSrc(path.join(contextDir, 'insight_context_builder.js'));
    assert.ok(/function buildInsightContext\(preparedContext\)/.test(src));
  });

  await test('（5.no SQL）原始碼掃描：insight_context_builder.js 完全不 import src/services/ 底下任何檔案（不直接呼叫Domain Service）', () => {
    const src = readSrc(path.join(contextDir, 'insight_context_builder.js'));
    assert.ok(!/from\s+['"].*\/services\//.test(src));
  });

  console.log('');

  // =========================================================================
  // F. deterministic output
  // =========================================================================
  console.log('--- F. deterministic output ---');

  await test('（6.deterministic output）同樣的preparedContext呼叫兩次buildInsightContext()得到完全相同（deepStrictEqual）的context', () => {
    const builder = createInsightContextBuilder();
    const a = builder.buildInsightContext(samplePreparedContext());
    const b = builder.buildInsightContext(samplePreparedContext());
    assert.deepStrictEqual(a.context, b.context);
  });

  await test('（6.deterministic output）不同builder實例對同樣輸入產生相同輸出（不依賴實例內部狀態）', () => {
    const a = createInsightContextBuilder().buildInsightContext(samplePreparedContext());
    const b = createInsightContextBuilder().buildInsightContext(samplePreparedContext());
    assert.deepStrictEqual(a.context, b.context);
  });

  await test('（6.deterministic output）buildInsightContext()不會修改（mutate）傳入的原始preparedContext物件', () => {
    const builder = createInsightContextBuilder();
    const original = samplePreparedContext();
    const snapshot = JSON.parse(JSON.stringify(original));
    builder.buildInsightContext(original);
    assert.deepStrictEqual(original, snapshot);
  });

  await test('（6.deterministic output）修改buildInsightContext()輸出的items不會影響原始preparedContext（shallow copy，非同一參考）', () => {
    const builder = createInsightContextBuilder();
    const original = samplePreparedContext();
    const { context } = builder.buildInsightContext(original);
    context.nutritionContext.items[0].meal_type = 'MUTATED';
    assert.strictEqual(original.foodEvents.items[0].meal_type, 'lunch');
  });

  await test('（6.deterministic output）buildInsightContext()不讀取Date.now()/Math.random()（原始碼掃描確認）', () => {
    const src = readSrc(path.join(contextDir, 'insight_context_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（6.deterministic output，端對端）連續兩次getInsightContext()呼叫（相同mock db/userId）得到相同的context', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-det-1' });
    await db.foodEvents.insert({ user_id: 'u-det-1', meal_type: 'snack' });
    const insightService = createInsightService({ dataPreparation: createDataPreparationService(), contextBuilder: createInsightContextBuilder() });
    const first = await insightService.getInsightContext(db, 'u-det-1', {});
    const second = await insightService.getInsightContext(db, 'u-det-1', {});
    assert.deepStrictEqual(first, second);
  });

  console.log('');

  // =========================================================================
  // G. missing data handling
  // =========================================================================
  console.log('--- G. missing data handling ---');

  await test('（7.missing data handling）buildInsightContext(undefined) 不拋出例外，回傳安全的空結構', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(undefined);
    assert.strictEqual(context.user, null);
    assert.deepStrictEqual(context.nutritionContext, { count: 0, items: [] });
  });

  await test('（7.missing data handling）buildInsightContext(null) 不拋出例外，回傳安全的空結構', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(null);
    assert.strictEqual(context.user, null);
  });

  await test('（7.missing data handling）buildInsightContext({}) 不拋出例外，全部section安全預設為空', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext({});
    for (const key of ['nutritionContext', 'behaviorContext', 'emotionContext', 'activityContext', 'reportContext']) {
      assert.deepStrictEqual(context[key], { count: 0, items: [] });
    }
    assert.strictEqual(context.metadata.totalRecords, 0);
  });

  await test('（7.missing data handling）buildInsightContext()對缺少單一section（例如沒有foodEvents欄位）安全預設為空section', () => {
    const builder = createInsightContextBuilder();
    const partial = samplePreparedContext();
    delete partial.foodEvents;
    const { context } = builder.buildInsightContext(partial);
    assert.deepStrictEqual(context.nutritionContext, { count: 0, items: [] });
  });

  await test('（7.missing data handling）buildInsightContext()對section是非物件值（例如字串）時安全視為空section', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext({ foodEvents: 'not-an-object' }));
    assert.deepStrictEqual(context.nutritionContext, { count: 0, items: [] });
  });

  await test('（7.missing data handling）buildInsightContext()對section.items是非陣列值時安全視為空items', () => {
    const builder = createInsightContextBuilder();
    const { context } = builder.buildInsightContext(samplePreparedContext({ emotions: { count: 5, items: 'not-an-array' } }));
    assert.deepStrictEqual(context.emotionContext, { count: 0, items: [] });
  });

  await test('（7.missing data handling）buildInsightContext()對全新使用者（全部section皆空）仍然通過validation', () => {
    const builder = createInsightContextBuilder();
    const { context, validation } = builder.buildInsightContext({});
    assert.strictEqual(validation.ok, true);
  });

  await test('（7.missing data handling，端對端）全新使用者（五個資料表都沒有紀錄）透過getInsightContext()成功回傳context_ready，全部count為0', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-empty-1' });
    const insightService = createInsightService({ dataPreparation: createDataPreparationService(), contextBuilder: createInsightContextBuilder() });
    const result = await insightService.getInsightContext(db, 'u-empty-1', {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'context_ready');
    assert.strictEqual(result.data.context.metadata.totalRecords, 0);
  });

  console.log('');

  // =========================================================================
  // H. invalid context rejection
  // =========================================================================
  console.log('--- H. invalid context rejection ---');

  await test('（8.invalid context rejection）getInsightContext()對不存在的userId安全回傳{ok:false, status:"context_unavailable", reason:"user_not_found"}', async () => {
    const db = makeMockDb();
    const insightService = createInsightService({ dataPreparation: createDataPreparationService(), contextBuilder: createInsightContextBuilder() });
    const result = await insightService.getInsightContext(db, 'does-not-exist', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'context_unavailable');
    assert.strictEqual(result.reason, 'user_not_found');
    assert.strictEqual(result.data, null);
  });

  await test('（8.invalid context rejection）getInsightContext()在dataPreparation缺失時安全回傳{ok:false, status:"context_unavailable", reason:"data_preparation_unavailable"}（不拋出例外）', async () => {
    const db = makeMockDb();
    const insightService = createInsightService({ contextBuilder: createInsightContextBuilder() });
    const result = await insightService.getInsightContext(db, 'u1', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'data_preparation_unavailable');
  });

  await test('（8.invalid context rejection）getInsightContext()在contextBuilder缺失時安全回傳{ok:false, status:"context_unavailable", reason:"context_builder_unavailable"}（不拋出例外）', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-noctx-1' });
    const insightService = createInsightService({ dataPreparation: createDataPreparationService() });
    const result = await insightService.getInsightContext(db, 'u-noctx-1', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'context_builder_unavailable');
  });

  await test('（8.invalid context rejection）getInsightContext()對dataPreparation.prepare()失敗（子來源查詢失敗）安全回傳context_unavailable', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-fail-1' });
    db.foodEvents.listByUser = async () => ({ ok: false, error: 'db_boom' });
    const insightService = createInsightService({ dataPreparation: createDataPreparationService(), contextBuilder: createInsightContextBuilder() });
    const result = await insightService.getInsightContext(db, 'u-fail-1', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'context_unavailable');
  });

  await test('（8.invalid context rejection）getInsightContext()對contextBuilder回傳validation.ok=false時正確回傳{ok:false, status:"context_invalid"}（注入假的contextBuilder驗證insight_service.js的錯誤處理邏輯）', async () => {
    const db = makeMockDb();
    db.seedUser({ id: 'u-invalid-1' });
    const fakeContextBuilder = { buildInsightContext: () => ({ context: {}, validation: { ok: false, reason: 'test_invalid_reason' } }) };
    const insightService = createInsightService({ dataPreparation: createDataPreparationService(), contextBuilder: fakeContextBuilder });
    const result = await insightService.getInsightContext(db, 'u-invalid-1', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'context_invalid');
    assert.strictEqual(result.reason, 'test_invalid_reason');
    assert.strictEqual(result.data, null);
  });

  await test('（8.invalid context rejection）validateInsightContext()拒絕缺少必要欄位的物件（跟A類contract測試互補，這裡從「拒絕」角度確認至少一個具體案例）', () => {
    const result = validateInsightContext({ user: null });
    assert.strictEqual(result.ok, false);
  });

  await test('（8.invalid context rejection）validateInsightContext()拒絕空物件{}', () => {
    const result = validateInsightContext({});
    assert.strictEqual(result.ok, false);
  });

  console.log('');

  // =========================================================================
  // I. bootstrap injection
  // =========================================================================
  console.log('--- I. bootstrap injection ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（9.bootstrap injection）createApplication(env).intelligence 具備 context 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('context' in app.intelligence);
  });

  await test('（9.bootstrap injection）app.intelligence.context 具備 buildInsightContext 函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.context.buildInsightContext, 'function');
  });

  // 注意：TASK1.43 為 app.intelligence 新增了 `analysis` 欄位，這是
  // 明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  // 注意：TASK1.44 為 app.intelligence 新增了 `recommendation` 欄位，
  // 這是明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  // 注意：TASK1.45 為 app.intelligence 新增了 `orchestration` 欄位，
  // 這是明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  // 注意：TASK1.46 為 app.intelligence 新增了 `service` 欄位，這是
  // 明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  await test('（TASK1.69後更新）app.intelligence 恰好具備 insightService/analysisEngine/recommendationEngine/dataPreparation/context/analysis/recommendation/orchestration/service/facade/execution/events/history/monitoring/metrics/governance/application/useCases/capabilities/workflow/features/insightFeature/insightExecutionFlow 二十三個欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), ['analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution', 'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring', 'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow']);
  });

  await test('（9.bootstrap injection）app.intelligence.context跟注入進insightService的contextBuilder是同一個實例（不是各自獨立建立兩份）', async () => {
    const app = createApplication(makeFullEnv());
    const db = makeMockDb();
    db.seedUser({ id: 'u-boot-1' });
    let capturedContext = null;
    const originalBuild = app.intelligence.context.buildInsightContext;
    app.intelligence.context.buildInsightContext = (...args) => { capturedContext = args; return originalBuild.apply(app.intelligence.context, args); };
    await app.intelligence.insightService.getInsightContext(db, 'u-boot-1', {});
    assert.ok(capturedContext !== null, 'insightService內部應該呼叫的正是app.intelligence.context這個實例');
  });

  await test('（9.bootstrap injection，端對端）透過app.intelligence.insightService.getInsightContext()呼叫，可以正確運作', async () => {
    const app = createApplication(makeFullEnv());
    const db = makeMockDb();
    db.seedUser({ id: 'u-boot-2' });
    const result = await app.intelligence.insightService.getInsightContext(db, 'u-boot-2', {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'context_ready');
  });

  await test('（9.bootstrap injection）每次createApplication()呼叫都各自建立獨立的context實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.context, app2.intelligence.context);
  });

  await test('（9.bootstrap injection）createApplication() 完整回傳形狀依然是 {config, db, services, router, middleware, intelligence} 六個頂層欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'intelligence', 'middleware', 'router', 'services']);
  });

  await test('（9.bootstrap injection）原始碼掃描：src/bootstrap/application.js 有 import context（來自 ../intelligence/index.js）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(/context as insightContext/.test(src) || /\bcontext\b.*from ['"]\.\.\/intelligence\/index\.js['"]/.test(src));
  });

  await test('（9.bootstrap injection）原始碼掃描：src/intelligence/index.js 有 export context namespace 跟 insightContextContract', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as context from ['"]\.\/context\/index\.js['"]/.test(src));
    assert.ok(/insightContextContract/.test(src));
  });

  await test('（9.bootstrap injection）app.router.routes 數量沒有因為新增context而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  console.log('');

  // =========================================================================
  // J. intelligence boundary
  // =========================================================================
  console.log('--- J. intelligence boundary ---');

  await test('（10.intelligence boundary）insight_service.js 完全不 import src/intelligence/context/ 或 src/intelligence/contracts/（純DI，不硬編依賴）', () => {
    const src = readSrc(path.join(intelDir, 'insight_service.js'));
    assert.ok(!/from\s+['"]\.\/context\//.test(src));
    assert.ok(!/from\s+['"]\.\/contracts\//.test(src));
  });

  await test('（10.intelligence boundary）insight_context_builder.js 只 import 同目錄下的 contracts/insight_context_contract.js（唯一允許的相依）', () => {
    const src = readSrc(path.join(contextDir, 'insight_context_builder.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['../contracts/insight_context_contract.js']);
  });

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（10.intelligence boundary）src/routes/${file} 完全不 import src/intelligence/context/ 或 src/intelligence/contracts/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/context\//.test(src));
      assert.ok(!/from\s+['"].*\/intelligence\/contracts\//.test(src));
    });
  }

  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（10.intelligence boundary）src/controllers/${file} 完全不 import src/intelligence/context/ 或 src/intelligence/contracts/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/context\//.test(src));
      assert.ok(!/from\s+['"].*\/intelligence\/contracts\//.test(src));
    });
  }

  await test('（10.intelligence boundary）原始碼掃描：五個既有domain service跟user_service.js完全沒有被TASK1.42修改', () => {
    const diff = execFileSync(
      'git',
      ['diff', '--stat', 'src/services/exploration_service.js', 'src/services/food_service.js', 'src/services/emotion_service.js', 'src/services/behavior_service.js', 'src/services/report_service.js', 'src/services/user_service.js'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.intelligence boundary）原始碼掃描：src/intelligence/data_preparation/（TASK1.41既有）完全沒有被TASK1.42修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/data_preparation/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.intelligence boundary）原始碼掃描：src/intelligence/analysis_engine.js/recommendation_engine.js（TASK1.40既有）完全沒有被TASK1.42修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis_engine.js', 'src/intelligence/recommendation_engine.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // K. regression test
  // =========================================================================
  console.log('--- K. regression test ---');

  // 沿用TASK1.39/1.40/1.41既有的遞迴防護手法。
  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（11.regression test）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.42-insight-context')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression test）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.41）`, () => {
      assert.ok(allSuites.length >= 33, `預期至少33個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（11.regression test）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

  await test('（12.P1-P6）src/worker.js 完全沒有被TASK1.42修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）wrangler.toml 完全沒有被TASK1.42修改', () => {
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

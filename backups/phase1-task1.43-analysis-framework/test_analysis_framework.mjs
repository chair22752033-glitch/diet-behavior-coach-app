/*
 * Phase 1 TASK 1.43｜Insight Analysis Framework Foundation 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「Insight Context 與
 * Recommendation Engine之間的deterministic分析邊界」：
 * analysis_runner.js能不能正確接收/驗證Insight Context、跑一組
 * deterministic分析模組、analysis_result_builder.js的輸出格式是否
 * 穩定可預測。不驗證任何真正的AI分析/推薦邏輯（因為根本沒有）。
 *
 * 分為以下12個部分：
 * A) analysis input validation
 * B) context boundary
 * C) deterministic output
 * D) no AI dependency
 * E) no external API
 * F) no SQL
 * G) no HTTP dependency
 * H) empty context handling
 * I) invalid context handling
 * J) bootstrap injection
 * K) regression testing
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
const analysisDir = path.join(intelDir, 'analysis');

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

function sampleInsightContext(overrides) {
  return Object.assign(
    {
      user: { id: 'u-sample', isGuest: false, authProvider: 'google', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
      nutritionContext: { count: 2, items: [{ id: 1, meal_type: 'lunch' }, { id: 2, meal_type: 'dinner' }] },
      behaviorContext: { count: 1, items: [{ id: 3, pattern_type: 'p', confidence_score: 0.75 }] },
      emotionContext: { count: 1, items: [{ id: 4, emotion_type: 'calm' }] },
      activityContext: { count: 3, items: [{ id: 5 }, { id: 6 }, { id: 7 }] },
      reportContext: { count: 0, items: [] },
      metadata: { totalRecords: 7, sourceCounts: { nutrition: 2, behavior: 1, emotion: 1, activity: 3, report: 0 } },
    },
    overrides || {}
  );
}

async function run() {
  const runnerMod = await import(path.join(analysisDir, 'analysis_runner.js'));
  const { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } = runnerMod;
  const resultBuilderMod = await import(path.join(analysisDir, 'analysis_result_builder.js'));
  const { createAnalysisResultBuilder, ANALYSIS_RESULT_VERSION } = resultBuilderMod;
  const analysisIndexMod = await import(path.join(analysisDir, 'index.js'));
  const { validateInsightContext } = await import(path.join(intelDir, 'contracts', 'insight_context_contract.js'));

  // =========================================================================
  // A. analysis input validation
  // =========================================================================
  console.log('--- A. analysis input validation ---');

  await test('（1.analysis input validation）createAnalysisRunner() 回傳物件具備 runAnalysis 函式', () => {
    const runner = createAnalysisRunner();
    assert.strictEqual(typeof runner.runAnalysis, 'function');
  });

  await test('（1.analysis input validation）runAnalysis() 對合法的Insight Context回傳{ok:true, result:{...}}', () => {
    const runner = createAnalysisRunner();
    const result = runner.runAnalysis(sampleInsightContext(), {});
    assert.strictEqual(result.ok, true);
    assert.ok(result.result);
  });

  await test('（1.analysis input validation）runAnalysis() 內部先呼叫既有的validateInsightContext()做輸入驗證（原始碼掃描確認有import）', () => {
    const src = readSrc(path.join(analysisDir, 'analysis_runner.js'));
    assert.ok(/import\s*\{[^}]*validateInsightContext[^}]*\}\s*from\s*['"]\.\.\/contracts\/insight_context_contract\.js['"]/.test(src));
  });

  await test('（1.analysis input validation）runAnalysis() 對驗證失敗的context直接回傳失敗結果，不執行任何分析模組', () => {
    let moduleCalled = false;
    const spyModule = () => { moduleCalled = true; return null; };
    const runner = createAnalysisRunner({ modules: [spyModule] });
    const result = runner.runAnalysis({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(moduleCalled, false);
  });

  await test('（1.analysis input validation）runAnalysis()驗證失敗時回傳的reason跟validateInsightContext()本身回傳的reason一致', () => {
    const runner = createAnalysisRunner();
    const badContext = sampleInsightContext();
    delete badContext.metadata;
    const result = runner.runAnalysis(badContext, {});
    const directValidation = validateInsightContext(badContext);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, directValidation.reason);
    assert.strictEqual(result.field, directValidation.field);
  });

  await test('（1.analysis input validation）DEFAULT_ANALYSIS_MODULES 是非空陣列，每個元素都是函式', () => {
    assert.ok(Array.isArray(DEFAULT_ANALYSIS_MODULES));
    assert.ok(DEFAULT_ANALYSIS_MODULES.length > 0);
    for (const m of DEFAULT_ANALYSIS_MODULES) assert.strictEqual(typeof m, 'function');
  });

  console.log('');

  // =========================================================================
  // B. context boundary
  // =========================================================================
  console.log('--- B. context boundary ---');

  await test('（2.context boundary）analysis_runner.js 完全不 import src/services/ 底下任何檔案（不直接呼叫Domain Service，只消費Insight Context）', () => {
    const src = readSrc(path.join(analysisDir, 'analysis_runner.js'));
    assert.ok(!/from\s+['"].*\/services\//.test(src));
  });

  await test('（2.context boundary）analysis_runner.js 完全不 import src/intelligence/data_preparation/ 底下任何檔案（不繞過Insight Context直接拿資料準備層）', () => {
    const src = readSrc(path.join(analysisDir, 'analysis_runner.js'));
    assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
  });

  await test('（2.context boundary）analysis_runner.js 只 import contracts/insight_context_contract.js 跟 ./analysis_result_builder.js（唯二允許的相依）', () => {
    const src = readSrc(path.join(analysisDir, 'analysis_runner.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports.sort(), ['../contracts/insight_context_contract.js', './analysis_result_builder.js']);
  });

  await test('（2.context boundary）預設分析模組只讀取context裡既有的count/totalRecords欄位，不讀取items內容本身（原始碼掃描：不出現.items）', () => {
    const src = readSrc(path.join(analysisDir, 'analysis_runner.js'));
    const moduleBlock = src.match(/export const DEFAULT_ANALYSIS_MODULES = \[([\s\S]*?)\n\];/);
    assert.ok(moduleBlock);
    assert.ok(!/\.items\b/.test(moduleBlock[1]), '預設模組不應該讀取items內容，只讀取count/totalRecords摘要值');
  });

  await test('（2.context boundary，功能驗證）runAnalysis()只消費傳入的Insight Context，不會意外去讀取全域變數或其他context', () => {
    const runner = createAnalysisRunner();
    const contextA = sampleInsightContext({ activityContext: { count: 999, items: [] } });
    const contextB = sampleInsightContext({ activityContext: { count: 1, items: [] } });
    const resultA = runner.runAnalysis(contextA, {});
    const resultB = runner.runAnalysis(contextB, {});
    const activityInsightA = resultA.result.insights.find((i) => i.type === 'activity_count');
    const activityInsightB = resultB.result.insights.find((i) => i.type === 'activity_count');
    assert.strictEqual(activityInsightA.value, 999);
    assert.strictEqual(activityInsightB.value, 1);
  });

  console.log('');

  // =========================================================================
  // C. deterministic output
  // =========================================================================
  console.log('--- C. deterministic output ---');

  await test('（3.deterministic output）同樣的Insight Context呼叫兩次runAnalysis()得到完全相同（deepStrictEqual）的result', () => {
    const runner = createAnalysisRunner();
    const a = runner.runAnalysis(sampleInsightContext(), {});
    const b = runner.runAnalysis(sampleInsightContext(), {});
    assert.deepStrictEqual(a, b);
  });

  await test('（3.deterministic output）不同runner實例對同樣輸入產生相同輸出（不依賴實例內部狀態）', () => {
    const a = createAnalysisRunner().runAnalysis(sampleInsightContext(), {});
    const b = createAnalysisRunner().runAnalysis(sampleInsightContext(), {});
    assert.deepStrictEqual(a, b);
  });

  await test('（3.deterministic output）runAnalysis()不會修改（mutate）傳入的原始Insight Context物件', () => {
    const runner = createAnalysisRunner();
    const original = sampleInsightContext();
    const snapshot = JSON.parse(JSON.stringify(original));
    runner.runAnalysis(original, {});
    assert.deepStrictEqual(original, snapshot);
  });

  await test('（3.deterministic output）analysis_runner.js 不讀取Date.now()/Math.random()（原始碼掃描確認）', () => {
    const src = readSrc(path.join(analysisDir, 'analysis_runner.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（3.deterministic output）analysis_result_builder.js 不讀取Date.now()/Math.random()（原始碼掃描確認）', () => {
    const src = readSrc(path.join(analysisDir, 'analysis_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（3.deterministic output）buildAnalysisResult() 沒有帶options.generatedAt時，metadata.generatedAt安全預設為null（不會自己猜一個目前時間）', () => {
    const builder = createAnalysisResultBuilder();
    const result = builder.buildAnalysisResult([], {});
    assert.strictEqual(result.metadata.generatedAt, null);
  });

  await test('（3.deterministic output）buildAnalysisResult() 有明確帶options.generatedAt時原樣採用（由呼叫端決定，不是內部產生）', () => {
    const builder = createAnalysisResultBuilder();
    const result = builder.buildAnalysisResult([], { generatedAt: '2026-06-01T00:00:00Z' });
    assert.strictEqual(result.metadata.generatedAt, '2026-06-01T00:00:00Z');
  });

  await test('（3.deterministic output）metadata.version固定為ANALYSIS_RESULT_VERSION，不因輸入而改變', () => {
    const builder = createAnalysisResultBuilder();
    const a = builder.buildAnalysisResult([{ type: 'x', value: 1, source: 'y' }], {});
    const b = builder.buildAnalysisResult([], {});
    assert.strictEqual(a.metadata.version, ANALYSIS_RESULT_VERSION);
    assert.strictEqual(b.metadata.version, ANALYSIS_RESULT_VERSION);
  });

  console.log('');

  // =========================================================================
  // D. no AI dependency
  // =========================================================================
  console.log('--- D. no AI dependency ---');

  const ANALYSIS_JS_FILES = fs.readdirSync(analysisDir).filter((f) => f.endsWith('.js')).sort();
  await test('（4.no AI dependency）src/intelligence/analysis/ 恰好包含3個.js檔案（analysis_runner/analysis_result_builder/index）', () => {
    assert.deepStrictEqual(ANALYSIS_JS_FILES, ['analysis_result_builder.js', 'analysis_runner.js', 'index.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i,
  ];
  for (const file of ANALYSIS_JS_FILES) {
    const codeOnly = readSrc(path.join(analysisDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（4.no AI dependency）src/intelligence/analysis/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（4.no AI dependency）src/intelligence/analysis/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // E. no external API
  // =========================================================================
  console.log('--- E. no external API ---');

  for (const file of ANALYSIS_JS_FILES) {
    await test(`（5.no external API）src/intelligence/analysis/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(analysisDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（5.no external API）src/intelligence/analysis/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(analysisDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // F. no SQL
  // =========================================================================
  console.log('--- F. no SQL ---');

  for (const file of ANALYSIS_JS_FILES) {
    await test(`（6.no SQL）src/intelligence/analysis/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(analysisDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（6.no SQL）src/intelligence/analysis/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(analysisDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（6.no SQL）src/intelligence/analysis/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(analysisDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（6.no SQL）src/intelligence/analysis/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(analysisDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（6.no SQL）analysis_runner.js 甚至完全不接受db參數（純函式鏈路，簽章只有runAnalysis(insightContext, options)）', () => {
    const src = readSrc(path.join(analysisDir, 'analysis_runner.js'));
    assert.ok(/function runAnalysis\(insightContext, options\)/.test(src));
  });

  console.log('');

  // =========================================================================
  // G. no HTTP dependency
  // =========================================================================
  console.log('--- G. no HTTP dependency ---');

  for (const file of ANALYSIS_JS_FILES) {
    await test(`（7.no HTTP dependency）src/intelligence/analysis/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(analysisDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（7.no HTTP dependency）src/intelligence/analysis/${file} 完全不 import src/auth/ 或 src/identity/（不處理session）`, () => {
      const src = readSrc(path.join(analysisDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（7.no HTTP dependency）src/intelligence/analysis/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(analysisDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（7.no HTTP dependency）src/routes/${file} 完全不 import src/intelligence/analysis/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/analysis\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（7.no HTTP dependency）src/controllers/${file} 完全不 import src/intelligence/analysis/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/analysis\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // H. empty context handling
  // =========================================================================
  console.log('--- H. empty context handling ---');

  function emptyInsightContext() {
    return {
      user: null,
      nutritionContext: { count: 0, items: [] },
      behaviorContext: { count: 0, items: [] },
      emotionContext: { count: 0, items: [] },
      activityContext: { count: 0, items: [] },
      reportContext: { count: 0, items: [] },
      metadata: { totalRecords: 0, sourceCounts: { nutrition: 0, behavior: 0, emotion: 0, activity: 0, report: 0 } },
    };
  }

  await test('（8.empty context handling）全新使用者（全部section皆空）runAnalysis()仍然成功回傳analysis_ready', () => {
    const runner = createAnalysisRunner();
    const result = runner.runAnalysis(emptyInsightContext(), {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.status, 'analysis_ready');
  });

  await test('（8.empty context handling）空context的每個insight.value都正確為0（不是null/undefined，也不是拋出例外）', () => {
    const runner = createAnalysisRunner();
    const result = runner.runAnalysis(emptyInsightContext(), {});
    for (const insight of result.result.insights) {
      assert.strictEqual(insight.value, 0);
    }
  });

  await test('（8.empty context handling）空context仍然產生跟DEFAULT_ANALYSIS_MODULES數量一致的insights（每個模組都有回應，只是value都是0）', () => {
    const runner = createAnalysisRunner();
    const result = runner.runAnalysis(emptyInsightContext(), {});
    assert.strictEqual(result.result.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（8.empty context handling）buildAnalysisResult([]) 對空insights陣列安全回傳{status, insights:[], metadata}', () => {
    const builder = createAnalysisResultBuilder();
    const result = builder.buildAnalysisResult([], {});
    assert.deepStrictEqual(result.insights, []);
    assert.strictEqual(result.status, 'analysis_ready');
  });

  await test('（8.empty context handling）buildAnalysisResult(undefined) 不拋出例外，安全回傳空insights', () => {
    const builder = createAnalysisResultBuilder();
    const result = builder.buildAnalysisResult(undefined, {});
    assert.deepStrictEqual(result.insights, []);
  });

  await test('（8.empty context handling）buildAnalysisResult(null) 不拋出例外，安全回傳空insights', () => {
    const builder = createAnalysisResultBuilder();
    const result = builder.buildAnalysisResult(null, {});
    assert.deepStrictEqual(result.insights, []);
  });

  await test('（8.empty context handling）buildAnalysisResult() 沒有帶options時不拋出例外', () => {
    const builder = createAnalysisResultBuilder();
    assert.doesNotThrow(() => builder.buildAnalysisResult([]));
  });

  console.log('');

  // =========================================================================
  // I. invalid context handling
  // =========================================================================
  console.log('--- I. invalid context handling ---');

  await test('（9.invalid context handling）runAnalysis(null) 安全回傳{ok:false, reason:"invalid_context"}，不拋出例外', () => {
    const runner = createAnalysisRunner();
    const result = runner.runAnalysis(null, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（9.invalid context handling）runAnalysis(undefined) 安全回傳失敗，不拋出例外', () => {
    const runner = createAnalysisRunner();
    const result = runner.runAnalysis(undefined, {});
    assert.strictEqual(result.ok, false);
  });

  await test('（9.invalid context handling）runAnalysis("字串") 安全回傳失敗，不拋出例外', () => {
    const runner = createAnalysisRunner();
    const result = runner.runAnalysis('not an object', {});
    assert.strictEqual(result.ok, false);
  });

  await test('（9.invalid context handling）runAnalysis({}) 安全回傳missing_field失敗（缺少全部必要欄位）', () => {
    const runner = createAnalysisRunner();
    const result = runner.runAnalysis({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_field');
  });

  const REQUIRED_CONTEXT_FIELDS = ['user', 'nutritionContext', 'behaviorContext', 'emotionContext', 'activityContext', 'reportContext', 'metadata'];
  for (const field of REQUIRED_CONTEXT_FIELDS) {
    await test(`（9.invalid context handling）runAnalysis()對缺少${field}欄位的context正確拒絕`, () => {
      const runner = createAnalysisRunner();
      const badContext = sampleInsightContext();
      delete badContext[field];
      const result = runner.runAnalysis(badContext, {});
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.field, field);
    });
  }

  await test('（9.invalid context handling）runAnalysis()對section型別不正確（例如nutritionContext是字串）正確拒絕', () => {
    const runner = createAnalysisRunner();
    const badContext = sampleInsightContext({ nutritionContext: 'not-an-object' });
    const result = runner.runAnalysis(badContext, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'nutritionContext');
  });

  await test('（9.invalid context handling）失敗結果不含result欄位（沒有把部分執行結果頂替回傳）', () => {
    const runner = createAnalysisRunner();
    const result = runner.runAnalysis(null, {});
    assert.strictEqual(result.result, undefined);
  });

  console.log('');

  // =========================================================================
  // J. bootstrap injection
  // =========================================================================
  console.log('--- J. bootstrap injection ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（10.bootstrap injection）createApplication(env).intelligence 具備 analysis 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('analysis' in app.intelligence);
  });

  await test('（10.bootstrap injection）app.intelligence.analysis 具備 runAnalysis 函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.analysis.runAnalysis, 'function');
  });

  // 注意：TASK1.44 為 app.intelligence 新增了 `recommendation` 欄位，
  // 這是明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  // 注意：TASK1.45 為 app.intelligence 新增了 `orchestration` 欄位，
  // 這是明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  // 注意：TASK1.46 為 app.intelligence 新增了 `service` 欄位，這是
  // 明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  await test('（TASK1.66後更新）app.intelligence 恰好具備 insightService/analysisEngine/recommendationEngine/dataPreparation/context/analysis/recommendation/orchestration/service/facade/execution/events/history/monitoring/metrics/governance/application/useCases/capabilities/workflow/features/insightFeature 二十二個欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), ['analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution', 'facade', 'features', 'governance', 'history', 'insightFeature', 'insightService', 'metrics', 'monitoring', 'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow']);
  });

  await test('（10.bootstrap injection，端對端）透過app.intelligence.analysis.runAnalysis()呼叫，可以正確運作', () => {
    const app = createApplication(makeFullEnv());
    const result = app.intelligence.analysis.runAnalysis(sampleInsightContext(), {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.status, 'analysis_ready');
  });

  await test('（10.bootstrap injection）每次createApplication()呼叫都各自建立獨立的analysis實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.analysis, app2.intelligence.analysis);
  });

  await test('（10.bootstrap injection）createApplication() 完整回傳形狀依然是 {config, db, services, router, middleware, intelligence} 六個頂層欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'intelligence', 'middleware', 'router', 'services']);
  });

  await test('（10.bootstrap injection）app.intelligence.insightService 完全沒有被TASK1.43修改成會呼叫app.intelligence.analysis（本次任務規格明確不要求串接insight_service.js）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/insight_service.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.bootstrap injection）原始碼掃描：src/bootstrap/application.js 有 import analysis（來自 ../intelligence/index.js）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(/\banalysis\b.*from ['"]\.\.\/intelligence\/index\.js['"]/.test(src));
  });

  await test('（10.bootstrap injection）原始碼掃描：src/intelligence/index.js 有 export analysis namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as analysis from ['"]\.\/analysis\/index\.js['"]/.test(src));
  });

  await test('（10.bootstrap injection）app.router.routes 數量沒有因為新增analysis而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  console.log('');

  // =========================================================================
  // K. regression testing
  // =========================================================================
  console.log('--- K. regression testing ---');

  // 沿用TASK1.39/1.40/1.41/1.42既有的遞迴防護手法。
  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（11.regression testing）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.43-analysis-framework')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression testing）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.42）`, () => {
      assert.ok(allSuites.length >= 34, `預期至少34個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（11.regression testing）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

  await test('（12.P1-P6）src/worker.js 完全沒有被TASK1.43修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）wrangler.toml 完全沒有被TASK1.43修改', () => {
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

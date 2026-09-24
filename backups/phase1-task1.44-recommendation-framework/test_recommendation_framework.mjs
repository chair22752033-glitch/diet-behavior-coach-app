/*
 * Phase 1 TASK 1.44｜Recommendation Framework Foundation 測試
 *
 * 本任務不是AI推薦開發——這個測試檔案驗證的是「Analysis Result 與
 * 未來AI Provider之間的deterministic推薦邊界」：
 * recommendation_runner.js能不能正確接收/驗證Analysis Result、跑一組
 * deterministic推薦模組、recommendation_result_builder.js的輸出格式
 * 是否穩定可預測。不驗證任何真正的AI推薦/建議邏輯（因為根本沒有）。
 *
 * 分為以下13個部分：
 * A) analysis input validation
 * B) recommendation contract
 * C) deterministic output
 * D) no AI dependency
 * E) no external API
 * F) no SQL
 * G) no HTTP dependency
 * H) empty analysis handling
 * I) invalid analysis handling
 * J) bootstrap injection
 * K) intelligence boundary
 * L) regression testing
 * M) P1-P6
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
const recDir = path.join(intelDir, 'recommendation');

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

function sampleAnalysisResult(overrides) {
  return Object.assign(
    {
      status: 'analysis_ready',
      insights: [
        { type: 'activity_count', value: 3, source: 'activityContext' },
        { type: 'nutrition_count', value: 2, source: 'nutritionContext' },
        { type: 'total_records', value: 5, source: 'metadata' },
      ],
      metadata: { generatedAt: null, version: '1.0.0' },
    },
    overrides || {}
  );
}

async function run() {
  const runnerMod = await import(path.join(recDir, 'recommendation_runner.js'));
  const { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } = runnerMod;
  const resultBuilderMod = await import(path.join(recDir, 'recommendation_result_builder.js'));
  const { createRecommendationResultBuilder, RECOMMENDATION_RESULT_VERSION } = resultBuilderMod;
  const recIndexMod = await import(path.join(recDir, 'index.js'));
  const analysisRunnerMod = await import(path.join(intelDir, 'analysis', 'analysis_runner.js'));
  const { createAnalysisRunner } = analysisRunnerMod;

  // =========================================================================
  // A. analysis input validation
  // =========================================================================
  console.log('--- A. analysis input validation ---');

  await test('（1.analysis input validation）createRecommendationRunner() 回傳物件具備 runRecommendation 函式', () => {
    const runner = createRecommendationRunner();
    assert.strictEqual(typeof runner.runRecommendation, 'function');
  });

  await test('（1.analysis input validation）runRecommendation() 對合法的Analysis Result回傳{ok:true, result:{...}}', () => {
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation(sampleAnalysisResult());
    assert.strictEqual(result.ok, true);
    assert.ok(result.result);
  });

  await test('（1.analysis input validation）runRecommendation() 對缺少status欄位的Analysis Result正確拒絕', () => {
    const runner = createRecommendationRunner();
    const bad = sampleAnalysisResult();
    delete bad.status;
    const result = runner.runRecommendation(bad);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'status');
  });

  await test('（1.analysis input validation）runRecommendation() 對insights不是陣列時正確拒絕', () => {
    const runner = createRecommendationRunner();
    const bad = sampleAnalysisResult({ insights: 'not-an-array' });
    const result = runner.runRecommendation(bad);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'insights');
  });

  await test('（1.analysis input validation）runRecommendation() 對metadata不是物件時正確拒絕', () => {
    const runner = createRecommendationRunner();
    const bad = sampleAnalysisResult({ metadata: null });
    const result = runner.runRecommendation(bad);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'metadata');
  });

  await test('（1.analysis input validation）runRecommendation() 對驗證失敗的Analysis Result直接回傳失敗，不執行任何推薦模組', () => {
    let moduleCalled = false;
    const spyModule = () => { moduleCalled = true; return null; };
    const runner = createRecommendationRunner({ modules: [spyModule] });
    const result = runner.runRecommendation({});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(moduleCalled, false);
  });

  await test('（1.analysis input validation）DEFAULT_RECOMMENDATION_MODULES 是非空陣列，每個元素都是函式', () => {
    assert.ok(Array.isArray(DEFAULT_RECOMMENDATION_MODULES));
    assert.ok(DEFAULT_RECOMMENDATION_MODULES.length > 0);
    for (const m of DEFAULT_RECOMMENDATION_MODULES) assert.strictEqual(typeof m, 'function');
  });

  await test('（1.analysis input validation，端對端）真正的analysis_runner.js輸出可以直接餵給recommendation_runner.js（兩層真正串接）', () => {
    const analysisRunner = createAnalysisRunner();
    const insightContext = {
      user: null,
      nutritionContext: { count: 1, items: [] },
      behaviorContext: { count: 0, items: [] },
      emotionContext: { count: 0, items: [] },
      activityContext: { count: 0, items: [] },
      reportContext: { count: 0, items: [] },
      metadata: { totalRecords: 1, sourceCounts: { nutrition: 1, behavior: 0, emotion: 0, activity: 0, report: 0 } },
    };
    const analysisResult = analysisRunner.runAnalysis(insightContext, {});
    assert.strictEqual(analysisResult.ok, true);
    const recommendationRunner = createRecommendationRunner();
    const recResult = recommendationRunner.runRecommendation(analysisResult.result);
    assert.strictEqual(recResult.ok, true);
    assert.strictEqual(recResult.result.status, 'recommendation_ready');
  });

  console.log('');

  // =========================================================================
  // B. recommendation contract
  // =========================================================================
  console.log('--- B. recommendation contract ---');

  await test('（2.recommendation contract）buildRecommendationResult() 回傳shape恰好是{status, recommendations, metadata}', () => {
    const builder = createRecommendationResultBuilder();
    const result = builder.buildRecommendationResult([]);
    assert.deepStrictEqual(Object.keys(result).sort(), ['metadata', 'recommendations', 'status']);
  });

  await test('（2.recommendation contract）status固定為"recommendation_ready"', () => {
    const builder = createRecommendationResultBuilder();
    const result = builder.buildRecommendationResult([]);
    assert.strictEqual(result.status, 'recommendation_ready');
  });

  await test('（2.recommendation contract）metadata恰好只有version一個欄位（規格範例沒有generatedAt）', () => {
    const builder = createRecommendationResultBuilder();
    const result = builder.buildRecommendationResult([]);
    assert.deepStrictEqual(Object.keys(result.metadata), ['version']);
  });

  await test('（2.recommendation contract）每筆recommendation恰好具備{type, value, source}三個欄位', () => {
    const builder = createRecommendationResultBuilder();
    const result = builder.buildRecommendationResult([{ type: 'x', value: 1, source: 'y' }]);
    assert.deepStrictEqual(Object.keys(result.recommendations[0]).sort(), ['source', 'type', 'value']);
  });

  await test('（2.recommendation contract）type不是字串時安全正規化為null', () => {
    const builder = createRecommendationResultBuilder();
    const result = builder.buildRecommendationResult([{ type: 123, value: 1, source: 'y' }]);
    assert.strictEqual(result.recommendations[0].type, null);
  });

  await test('（2.recommendation contract）source不是字串時安全正規化為null', () => {
    const builder = createRecommendationResultBuilder();
    const result = builder.buildRecommendationResult([{ type: 'x', value: 1, source: 123 }]);
    assert.strictEqual(result.recommendations[0].source, null);
  });

  await test('（2.recommendation contract）真正跑runRecommendation()產生的每個recommendation都符合{type,value,source}形狀', () => {
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation(sampleAnalysisResult());
    for (const rec of result.result.recommendations) {
      assert.deepStrictEqual(Object.keys(rec).sort(), ['source', 'type', 'value']);
      assert.strictEqual(typeof rec.type, 'string');
      assert.strictEqual(typeof rec.source, 'string');
    }
  });

  await test('（2.recommendation contract）recommendations[].value不含任何自然語言字串（結構化資料，不是對話文字）——這裡驗證預設模組的value型別只會是number/string/boolean，不是長篇文字', () => {
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation(sampleAnalysisResult());
    for (const rec of result.result.recommendations) {
      if (typeof rec.value === 'string') {
        assert.ok(rec.value.length < 50, `value看起來像自然語言而非簡短結構化值：${rec.value}`);
      }
    }
  });

  console.log('');

  // =========================================================================
  // C. deterministic output
  // =========================================================================
  console.log('--- C. deterministic output ---');

  await test('（3.deterministic output）同樣的Analysis Result呼叫兩次runRecommendation()得到完全相同（deepStrictEqual）的result', () => {
    const runner = createRecommendationRunner();
    const a = runner.runRecommendation(sampleAnalysisResult());
    const b = runner.runRecommendation(sampleAnalysisResult());
    assert.deepStrictEqual(a, b);
  });

  await test('（3.deterministic output）不同runner實例對同樣輸入產生相同輸出（不依賴實例內部狀態）', () => {
    const a = createRecommendationRunner().runRecommendation(sampleAnalysisResult());
    const b = createRecommendationRunner().runRecommendation(sampleAnalysisResult());
    assert.deepStrictEqual(a, b);
  });

  await test('（3.deterministic output）runRecommendation()不會修改（mutate）傳入的原始Analysis Result物件', () => {
    const runner = createRecommendationRunner();
    const original = sampleAnalysisResult();
    const snapshot = JSON.parse(JSON.stringify(original));
    runner.runRecommendation(original);
    assert.deepStrictEqual(original, snapshot);
  });

  await test('（3.deterministic output）recommendation_runner.js 不讀取Date.now()/Math.random()（原始碼掃描確認）', () => {
    const src = readSrc(path.join(recDir, 'recommendation_runner.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（3.deterministic output）recommendation_result_builder.js 不讀取Date.now()/Math.random()（原始碼掃描確認）', () => {
    const src = readSrc(path.join(recDir, 'recommendation_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（3.deterministic output）buildRecommendationResult() 不接受options參數（規格範例metadata沒有generatedAt，天生不需要）', () => {
    const src = readSrc(path.join(recDir, 'recommendation_result_builder.js'));
    assert.ok(/function buildRecommendationResult\(recommendations\)/.test(src));
  });

  await test('（3.deterministic output）metadata.version固定為RECOMMENDATION_RESULT_VERSION，不因輸入而改變', () => {
    const builder = createRecommendationResultBuilder();
    const a = builder.buildRecommendationResult([{ type: 'x', value: 1, source: 'y' }]);
    const b = builder.buildRecommendationResult([]);
    assert.strictEqual(a.metadata.version, RECOMMENDATION_RESULT_VERSION);
    assert.strictEqual(b.metadata.version, RECOMMENDATION_RESULT_VERSION);
  });

  await test('（3.deterministic output，端對端）連續兩次「analysis→recommendation」串接呼叫得到相同結果', () => {
    const analysisRunner = createAnalysisRunner();
    const insightContext = {
      user: null, nutritionContext: { count: 1, items: [] }, behaviorContext: { count: 0, items: [] },
      emotionContext: { count: 0, items: [] }, activityContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] },
      metadata: { totalRecords: 1, sourceCounts: { nutrition: 1, behavior: 0, emotion: 0, activity: 0, report: 0 } },
    };
    const recommendationRunner = createRecommendationRunner();
    const first = recommendationRunner.runRecommendation(analysisRunner.runAnalysis(insightContext, {}).result);
    const second = recommendationRunner.runRecommendation(analysisRunner.runAnalysis(insightContext, {}).result);
    assert.deepStrictEqual(first, second);
  });

  console.log('');

  // =========================================================================
  // D. no AI dependency
  // =========================================================================
  console.log('--- D. no AI dependency ---');

  const REC_JS_FILES = fs.readdirSync(recDir).filter((f) => f.endsWith('.js')).sort();
  await test('（4.no AI dependency）src/intelligence/recommendation/ 恰好包含3個.js檔案（recommendation_runner/recommendation_result_builder/index）', () => {
    assert.deepStrictEqual(REC_JS_FILES, ['index.js', 'recommendation_result_builder.js', 'recommendation_runner.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of REC_JS_FILES) {
    const codeOnly = readSrc(path.join(recDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（4.no AI dependency）src/intelligence/recommendation/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（4.no AI dependency）src/intelligence/recommendation/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
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

  for (const file of REC_JS_FILES) {
    await test(`（5.no external API）src/intelligence/recommendation/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(recDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（5.no external API）src/intelligence/recommendation/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(recDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // F. no SQL
  // =========================================================================
  console.log('--- F. no SQL ---');

  for (const file of REC_JS_FILES) {
    await test(`（6.no SQL）src/intelligence/recommendation/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(recDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（6.no SQL）src/intelligence/recommendation/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(recDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（6.no SQL）src/intelligence/recommendation/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(recDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（6.no SQL）src/intelligence/recommendation/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(recDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（6.no SQL）recommendation_runner.js 甚至完全不接受db參數（純函式鏈路，簽章只有runRecommendation(analysisResult)）', () => {
    const src = readSrc(path.join(recDir, 'recommendation_runner.js'));
    assert.ok(/function runRecommendation\(analysisResult\)/.test(src));
  });

  console.log('');

  // =========================================================================
  // G. no HTTP dependency
  // =========================================================================
  console.log('--- G. no HTTP dependency ---');

  for (const file of REC_JS_FILES) {
    await test(`（7.no HTTP dependency）src/intelligence/recommendation/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(recDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（7.no HTTP dependency）src/intelligence/recommendation/${file} 完全不 import src/auth/ 或 src/identity/（不處理session）`, () => {
      const src = readSrc(path.join(recDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（7.no HTTP dependency）src/intelligence/recommendation/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(recDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（7.no HTTP dependency）src/routes/${file} 完全不 import src/intelligence/recommendation/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/recommendation\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（7.no HTTP dependency）src/controllers/${file} 完全不 import src/intelligence/recommendation/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/recommendation\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // H. empty analysis handling
  // =========================================================================
  console.log('--- H. empty analysis handling ---');

  function emptyAnalysisResult() {
    return { status: 'analysis_ready', insights: [], metadata: { generatedAt: null, version: '1.0.0' } };
  }

  await test('（8.empty analysis handling）insights為空陣列的Analysis Result，runRecommendation()仍然成功回傳recommendation_ready', () => {
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation(emptyAnalysisResult());
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.status, 'recommendation_ready');
  });

  await test('（8.empty analysis handling）空Analysis Result的insight_count推薦正確為0', () => {
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation(emptyAnalysisResult());
    const insightCountRec = result.result.recommendations.find((r) => r.type === 'insight_count');
    assert.strictEqual(insightCountRec.value, 0);
  });

  await test('（8.empty analysis handling）空Analysis Result仍然產生跟DEFAULT_RECOMMENDATION_MODULES數量一致的recommendations', () => {
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation(emptyAnalysisResult());
    assert.strictEqual(result.result.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（8.empty analysis handling）buildRecommendationResult([]) 對空recommendations陣列安全回傳{status, recommendations:[], metadata}', () => {
    const builder = createRecommendationResultBuilder();
    const result = builder.buildRecommendationResult([]);
    assert.deepStrictEqual(result.recommendations, []);
    assert.strictEqual(result.status, 'recommendation_ready');
  });

  await test('（8.empty analysis handling）buildRecommendationResult(undefined) 不拋出例外，安全回傳空recommendations', () => {
    const builder = createRecommendationResultBuilder();
    const result = builder.buildRecommendationResult(undefined);
    assert.deepStrictEqual(result.recommendations, []);
  });

  await test('（8.empty analysis handling）buildRecommendationResult(null) 不拋出例外，安全回傳空recommendations', () => {
    const builder = createRecommendationResultBuilder();
    const result = builder.buildRecommendationResult(null);
    assert.deepStrictEqual(result.recommendations, []);
  });

  await test('（8.empty analysis handling）buildRecommendationResult() 沒有帶任何參數時不拋出例外', () => {
    const builder = createRecommendationResultBuilder();
    assert.doesNotThrow(() => builder.buildRecommendationResult());
  });

  console.log('');

  // =========================================================================
  // I. invalid analysis handling
  // =========================================================================
  console.log('--- I. invalid analysis handling ---');

  await test('（9.invalid analysis handling）runRecommendation(null) 安全回傳{ok:false, reason:"invalid_analysis_result"}，不拋出例外', () => {
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation(null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_analysis_result');
  });

  await test('（9.invalid analysis handling）runRecommendation(undefined) 安全回傳失敗，不拋出例外', () => {
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation(undefined);
    assert.strictEqual(result.ok, false);
  });

  await test('（9.invalid analysis handling）runRecommendation("字串") 安全回傳失敗，不拋出例外', () => {
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation('not an object');
    assert.strictEqual(result.ok, false);
  });

  await test('（9.invalid analysis handling）runRecommendation({}) 安全回傳失敗（缺少status/insights/metadata）', () => {
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation({});
    assert.strictEqual(result.ok, false);
  });

  await test('（9.invalid analysis handling）runRecommendation()對status不是字串（例如數字）正確拒絕', () => {
    const runner = createRecommendationRunner();
    const bad = sampleAnalysisResult({ status: 123 });
    const result = runner.runRecommendation(bad);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'status');
  });

  await test('（9.invalid analysis handling）失敗結果不含result欄位（沒有把部分執行結果頂替回傳）', () => {
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation(null);
    assert.strictEqual(result.result, undefined);
  });

  await test('（9.invalid analysis handling）拿TASK1.42 Insight Context（錯誤的上層物件）直接餵給runRecommendation()會被正確拒絕（形狀不符）', async () => {
    const insightContext = {
      user: null, nutritionContext: { count: 0, items: [] }, behaviorContext: { count: 0, items: [] },
      emotionContext: { count: 0, items: [] }, activityContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] },
      metadata: { totalRecords: 0, sourceCounts: {} },
    };
    const runner = createRecommendationRunner();
    const result = runner.runRecommendation(insightContext);
    assert.strictEqual(result.ok, false);
  });

  console.log('');

  // =========================================================================
  // J. bootstrap injection
  // =========================================================================
  console.log('--- J. bootstrap injection ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（10.bootstrap injection）createApplication(env).intelligence 具備 recommendation 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('recommendation' in app.intelligence);
  });

  await test('（10.bootstrap injection）app.intelligence.recommendation 具備 runRecommendation 函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.recommendation.runRecommendation, 'function');
  });

  // 注意：TASK1.45 為 app.intelligence 新增了 `orchestration` 欄位，
  // 這是明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  // 注意：TASK1.46 為 app.intelligence 新增了 `service` 欄位，這是
  // 明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  await test('（TASK1.69後更新）app.intelligence 恰好具備 insightService/analysisEngine/recommendationEngine/dataPreparation/context/analysis/recommendation/orchestration/service/facade/execution/events/history/monitoring/metrics/governance/application/useCases/capabilities/workflow/features/insightFeature/insightExecutionFlow 二十三個欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), ['analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution', 'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring', 'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow']);
  });

  await test('（10.bootstrap injection，端對端）透過app.intelligence.analysis+app.intelligence.recommendation串接呼叫，可以正確運作', () => {
    const app = createApplication(makeFullEnv());
    const insightContext = {
      user: null, nutritionContext: { count: 1, items: [] }, behaviorContext: { count: 0, items: [] },
      emotionContext: { count: 0, items: [] }, activityContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] },
      metadata: { totalRecords: 1, sourceCounts: { nutrition: 1, behavior: 0, emotion: 0, activity: 0, report: 0 } },
    };
    const analysisResult = app.intelligence.analysis.runAnalysis(insightContext, {});
    const recResult = app.intelligence.recommendation.runRecommendation(analysisResult.result);
    assert.strictEqual(recResult.ok, true);
    assert.strictEqual(recResult.result.status, 'recommendation_ready');
  });

  await test('（10.bootstrap injection）每次createApplication()呼叫都各自建立獨立的recommendation實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.recommendation, app2.intelligence.recommendation);
  });

  await test('（10.bootstrap injection）createApplication() 完整回傳形狀依然是 {config, db, services, router, middleware, intelligence} 六個頂層欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'intelligence', 'middleware', 'router', 'services']);
  });

  await test('（10.bootstrap injection）app.intelligence.insightService 完全沒有被TASK1.44修改成會呼叫app.intelligence.recommendation（本次任務規格明確不要求串接insight_service.js）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/insight_service.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.bootstrap injection）原始碼掃描：src/bootstrap/application.js 有 import recommendation（來自 ../intelligence/index.js）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(/\brecommendation\b.*from ['"]\.\.\/intelligence\/index\.js['"]/.test(src));
  });

  await test('（10.bootstrap injection）原始碼掃描：src/intelligence/index.js 有 export recommendation namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as recommendation from ['"]\.\/recommendation\/index\.js['"]/.test(src));
  });

  await test('（10.bootstrap injection）app.router.routes 數量沒有因為新增recommendation而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  console.log('');

  // =========================================================================
  // K. intelligence boundary
  // =========================================================================
  console.log('--- K. intelligence boundary ---');

  await test('（11.intelligence boundary）recommendation_runner.js 完全不 import src/intelligence/analysis/ 底下任何檔案（不直接耦合Analysis Framework實作，只消費Analysis Result作為參數）', () => {
    const src = readSrc(path.join(recDir, 'recommendation_runner.js'));
    assert.ok(!/from\s+['"].*\/analysis\//.test(src));
  });

  await test('（11.intelligence boundary）recommendation_runner.js 完全不 import src/intelligence/context/ 或 src/intelligence/contracts/', () => {
    const src = readSrc(path.join(recDir, 'recommendation_runner.js'));
    assert.ok(!/from\s+['"].*\/context\//.test(src));
    assert.ok(!/from\s+['"].*\/contracts\//.test(src));
  });

  await test('（11.intelligence boundary）recommendation_runner.js 完全不 import src/intelligence/data_preparation/', () => {
    const src = readSrc(path.join(recDir, 'recommendation_runner.js'));
    assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
  });

  await test('（11.intelligence boundary）recommendation_runner.js 只 import ./recommendation_result_builder.js（唯一允許的相依）', () => {
    const src = readSrc(path.join(recDir, 'recommendation_runner.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./recommendation_result_builder.js']);
  });

  await test('（11.intelligence boundary）insight_service.js 完全不 import src/intelligence/recommendation/（純DI，不硬編依賴）', () => {
    const src = readSrc(path.join(intelDir, 'insight_service.js'));
    assert.ok(!/from\s+['"]\.\/recommendation\//.test(src));
  });

  await test('（11.intelligence boundary）原始碼掃描：五個既有domain service跟user_service.js完全沒有被TASK1.44修改', () => {
    const diff = execFileSync(
      'git',
      ['diff', '--stat', 'src/services/exploration_service.js', 'src/services/food_service.js', 'src/services/emotion_service.js', 'src/services/behavior_service.js', 'src/services/report_service.js', 'src/services/user_service.js'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.intelligence boundary）原始碼掃描：src/intelligence/data_preparation/、src/intelligence/context/（既有）完全沒有被TASK1.44修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/data_preparation/*.js src/intelligence/context/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.intelligence boundary）原始碼掃描：src/intelligence/analysis/（TASK1.43既有）完全沒有被TASK1.44修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/analysis/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.intelligence boundary）原始碼掃描：src/intelligence/analysis_engine.js/recommendation_engine.js（TASK1.40既有）完全沒有被TASK1.44修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis_engine.js', 'src/intelligence/recommendation_engine.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // L. regression testing
  // =========================================================================
  console.log('--- L. regression testing ---');

  // 沿用TASK1.39~1.43既有的遞迴防護手法。
  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（12.regression testing）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.44-recommendation-framework')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（12.regression testing）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.43）`, () => {
      assert.ok(allSuites.length >= 35, `預期至少35個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（12.regression testing）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // M. P1-P6
  // =========================================================================
  console.log('--- M. P1-P6 ---');

  await test('（13.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（13.P1-P6）src/worker.js 完全沒有被TASK1.44修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）wrangler.toml 完全沒有被TASK1.44修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

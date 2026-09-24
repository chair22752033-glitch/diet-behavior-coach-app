/*
 * Phase 1 TASK 1.40｜Phase 2 Intelligence Architecture Foundation 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「架構邊界」，不是任何
 * 分析/推薦邏輯的正確性（因為根本沒有任何邏輯：analyze()/recommend()/
 * getUserInsight()一律回傳固定的inert占位值）。
 *
 * 分為以下16個部分：
 * A) intelligence folder structure
 * B) export consistency
 * C) insight service interface
 * D) analysis engine interface
 * E) recommendation engine interface
 * F) contract consistency
 * G) no SQL
 * H) no D1 access
 * I) no AI API call
 * J) no fetch call
 * K) dependency boundary
 * L) bootstrap integration
 * M) existing API regression
 * N) authentication regression
 * O) session regression
 * P) P1-P6
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

function readIntelSrc(file) {
  return stripComments(fs.readFileSync(path.join(intelDir, file), 'utf8'));
}

async function run() {
  // =========================================================================
  // A. intelligence folder structure
  // =========================================================================
  console.log('--- A. intelligence folder structure ---');

  await test('（1.intelligence folder structure）src/intelligence/ 目錄存在', () => {
    assert.ok(fs.existsSync(intelDir) && fs.statSync(intelDir).isDirectory());
  });

  const EXPECTED_FILES = ['README.md', 'analysis_engine.js', 'contracts.js', 'index.js', 'insight_service.js', 'recommendation_engine.js'];
  // TASK1.41後更新：src/intelligence/ 底下新增了 data_preparation/
  // 子目錄（Intelligence Data Preparation Layer），這是明確要做的
  // 擴充，不是回歸——這裡只檢查TASK1.40當時規格要求的6個「檔案」
  // 是否還在（用isFile()排除目錄），不再假設目錄下只有這6個項目。
  const actualEntries = fs.readdirSync(intelDir, { withFileTypes: true });
  const actualFiles = actualEntries.filter((e) => e.isFile()).map((e) => e.name).sort();
  const actualDirs = actualEntries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

  await test(`（TASK1.41後更新）src/intelligence/ 底下的檔案（不含子目錄）恰好是TASK1.40規格要求的6個`, () => {
    assert.deepStrictEqual(actualFiles, EXPECTED_FILES);
  });

  // 注意：TASK1.42 新增了 contracts/（Insight Context Contract）跟
  // context/（Insight Context Builder）兩個子目錄，TASK1.43 新增了
  // analysis/（Analysis Framework），TASK1.44 新增了
  // recommendation/（Recommendation Framework），TASK1.45 新增了
  // orchestration/（Intelligence Orchestrator），TASK1.46 新增了
  // service/（Intelligence Application Service），TASK1.48 新增了
  // facade/（Intelligence Application Facade），TASK1.49 新增了
  // runtime/（Intelligence Runtime Context），TASK1.50 新增了
  // execution/（Intelligence Execution Manager），TASK1.51 又新增了
  // events/（Intelligence Execution Event Layer），TASK1.52 再新增了
  // history/（Intelligence Execution History Layer），TASK1.53 再
  // 新增了monitoring/（Intelligence Execution Monitoring Layer），
  // TASK1.54 再新增了metrics/（Intelligence Execution Metrics
  // Layer），都是明確要做的擴充，不是回歸——這裡的預期子目錄清單
  // 已同步更新。
  await test('（TASK1.54後更新）src/intelligence/ 底下的子目錄依序是 analysis/context/contracts/data_preparation/events/execution/facade/history/metrics/monitoring/orchestration/recommendation/runtime/service 十四個', () => {
    assert.deepStrictEqual(actualDirs, ['analysis', 'context', 'contracts', 'data_preparation', 'events', 'execution', 'facade', 'history', 'metrics', 'monitoring', 'orchestration', 'recommendation', 'runtime', 'service']);
  });

  for (const f of EXPECTED_FILES) {
    await test(`（1.intelligence folder structure）src/intelligence/${f} 存在且非空`, () => {
      const stat = fs.statSync(path.join(intelDir, f));
      assert.ok(stat.isFile());
      assert.ok(stat.size > 0);
    });
  }

  console.log('');

  // =========================================================================
  // B. export consistency
  // =========================================================================
  console.log('--- B. export consistency ---');

  const indexMod = await import(path.join(intelDir, 'index.js'));

  await test('（2.export consistency）index.js 匯出 createInsightService（函式）', () => {
    assert.strictEqual(typeof indexMod.createInsightService, 'function');
  });
  await test('（2.export consistency）index.js 匯出 createAnalysisEngine（函式）', () => {
    assert.strictEqual(typeof indexMod.createAnalysisEngine, 'function');
  });
  await test('（2.export consistency）index.js 匯出 createRecommendationEngine（函式）', () => {
    assert.strictEqual(typeof indexMod.createRecommendationEngine, 'function');
  });
  await test('（2.export consistency）index.js 匯出 contracts（namespace物件）', () => {
    assert.strictEqual(typeof indexMod.contracts, 'object');
    assert.ok(indexMod.contracts !== null);
  });

  const insightMod = await import(path.join(intelDir, 'insight_service.js'));
  const analysisMod = await import(path.join(intelDir, 'analysis_engine.js'));
  const recommendMod = await import(path.join(intelDir, 'recommendation_engine.js'));
  const contractsMod = await import(path.join(intelDir, 'contracts.js'));

  await test('（2.export consistency）index.js的createInsightService跟insight_service.js匯出的是同一個函式參考', () => {
    assert.strictEqual(indexMod.createInsightService, insightMod.createInsightService);
  });
  await test('（2.export consistency）index.js的createAnalysisEngine跟analysis_engine.js匯出的是同一個函式參考', () => {
    assert.strictEqual(indexMod.createAnalysisEngine, analysisMod.createAnalysisEngine);
  });
  await test('（2.export consistency）index.js的createRecommendationEngine跟recommendation_engine.js匯出的是同一個函式參考', () => {
    assert.strictEqual(indexMod.createRecommendationEngine, recommendMod.createRecommendationEngine);
  });
  await test('（2.export consistency）index.js的contracts namespace跟contracts.js匯出的每個具名項目一致', () => {
    for (const key of Object.keys(contractsMod)) {
      assert.strictEqual(indexMod.contracts[key], contractsMod[key], `${key} 不一致`);
    }
  });

  console.log('');

  // =========================================================================
  // C. insight service interface
  // =========================================================================
  console.log('--- C. insight service interface ---');

  await test('（3.insight service interface）createInsightService 呼叫後回傳物件具備 getUserInsight 函式', () => {
    const svc = insightMod.createInsightService({});
    assert.strictEqual(typeof svc.getUserInsight, 'function');
  });

  await test('（3.insight service interface）createInsightService() 不帶任何參數也不拋出例外', () => {
    assert.doesNotThrow(() => insightMod.createInsightService());
  });

  await test('（3.insight service interface）createInsightService(undefined) 不拋出例外', () => {
    assert.doesNotThrow(() => insightMod.createInsightService(undefined));
  });

  const insightInputCases = [
    ['userId="u1", context={}', 'u1', {}],
    ['userId="u2", context=undefined', 'u2', undefined],
    ['userId=null, context=null', null, null],
    ['userId=undefined, context={foo:"bar"}', undefined, { foo: 'bar' }],
    ['userId=123（非字串）, context=[]', 123, []],
    ['userId="", context={}', '', {}],
  ];
  for (const [label, userId, context] of insightInputCases) {
    await test(`（3.insight service interface）getUserInsight(${label}) 一律回傳固定的{ok:true,status:'not_ready',data:null}，不因輸入而改變`, async () => {
      const svc = insightMod.createInsightService({});
      const result = await svc.getUserInsight(userId, context);
      assert.deepStrictEqual(result, { ok: true, status: 'not_ready', data: null });
    });
  }

  await test('（3.insight service interface）getUserInsight() 回傳的是Promise（async函式）', () => {
    const svc = insightMod.createInsightService({});
    const ret = svc.getUserInsight('u1', {});
    assert.ok(ret instanceof Promise);
  });

  await test('（3.insight service interface）沒有帶任何dependencies時，getUserInsight() 依然安全回傳固定值，不拋出例外', async () => {
    const svc = insightMod.createInsightService();
    const result = await svc.getUserInsight('u1');
    assert.deepStrictEqual(result, { ok: true, status: 'not_ready', data: null });
  });

  await test('（3.insight service interface）只提供analysisEngine、不提供recommendationEngine時，依然安全運作', async () => {
    const svc = insightMod.createInsightService({ analysisEngine: analysisMod.createAnalysisEngine() });
    const result = await svc.getUserInsight('u1', {});
    assert.deepStrictEqual(result, { ok: true, status: 'not_ready', data: null });
  });

  await test('（3.insight service interface）只提供recommendationEngine、不提供analysisEngine時，依然安全運作', async () => {
    const svc = insightMod.createInsightService({ recommendationEngine: recommendMod.createRecommendationEngine() });
    const result = await svc.getUserInsight('u1', {});
    assert.deepStrictEqual(result, { ok: true, status: 'not_ready', data: null });
  });

  console.log('');

  // =========================================================================
  // D. analysis engine interface
  // =========================================================================
  console.log('--- D. analysis engine interface ---');

  await test('（4.analysis engine interface）createAnalysisEngine 呼叫後回傳物件具備 analyze 函式', () => {
    const engine = analysisMod.createAnalysisEngine();
    assert.strictEqual(typeof engine.analyze, 'function');
  });

  const analyzeInputCases = [
    ['undefined', undefined],
    ['null', null],
    ['{}', {}],
    ['{userId:"u1", explorations:[1,2,3]}', { userId: 'u1', explorations: [1, 2, 3] }],
    ['字串 "some data"', 'some data'],
    ['數字 42', 42],
  ];
  for (const [label, input] of analyzeInputCases) {
    await test(`（4.analysis engine interface）analyze(${label}) 一律回傳固定的{status:'not_implemented',result:null}`, async () => {
      const engine = analysisMod.createAnalysisEngine();
      const result = await engine.analyze(input);
      assert.deepStrictEqual(result, { status: 'not_implemented', result: null });
    });
  }

  await test('（4.analysis engine interface）analyze() 回傳的是Promise（async函式）', () => {
    const engine = analysisMod.createAnalysisEngine();
    assert.ok(engine.analyze({}) instanceof Promise);
  });

  await test('（4.analysis engine interface）createAnalysisEngine() 每次呼叫都是獨立的新物件（不是singleton）', () => {
    const a = analysisMod.createAnalysisEngine();
    const b = analysisMod.createAnalysisEngine();
    assert.notStrictEqual(a, b);
  });

  console.log('');

  // =========================================================================
  // E. recommendation engine interface
  // =========================================================================
  console.log('--- E. recommendation engine interface ---');

  await test('（5.recommendation engine interface）createRecommendationEngine 呼叫後回傳物件具備 recommend 函式', () => {
    const engine = recommendMod.createRecommendationEngine();
    assert.strictEqual(typeof engine.recommend, 'function');
  });

  const recommendInputCases = [
    ['undefined', undefined],
    ['null', null],
    ['{status:"not_implemented",result:null}（真正的analyze()輸出）', { status: 'not_implemented', result: null }],
    ['{}', {}],
    ['任意物件 {foo:"bar"}', { foo: 'bar' }],
  ];
  for (const [label, input] of recommendInputCases) {
    await test(`（5.recommendation engine interface）recommend(${label}) 一律回傳固定的{status:'not_implemented',recommendations:[]}`, async () => {
      const engine = recommendMod.createRecommendationEngine();
      const result = await engine.recommend(input);
      assert.deepStrictEqual(result, { status: 'not_implemented', recommendations: [] });
    });
  }

  await test('（5.recommendation engine interface）recommend() 回傳的recommendations是真正的陣列型別（Array.isArray）', async () => {
    const engine = recommendMod.createRecommendationEngine();
    const result = await engine.recommend(null);
    assert.ok(Array.isArray(result.recommendations));
    assert.strictEqual(result.recommendations.length, 0);
  });

  await test('（5.recommendation engine interface）createRecommendationEngine() 每次呼叫都是獨立的新物件（不是singleton）', () => {
    const a = recommendMod.createRecommendationEngine();
    const b = recommendMod.createRecommendationEngine();
    assert.notStrictEqual(a, b);
  });

  console.log('');

  // =========================================================================
  // F. contract consistency
  // =========================================================================
  console.log('--- F. contract consistency ---');

  const { InsightResponseContract, AnalysisResultContract, RecommendationResultContract, matchesContract } = contractsMod;

  await test('（6.contract consistency）InsightResponseContract 定義了 ok/status/data 三個欄位', () => {
    assert.deepStrictEqual(Object.keys(InsightResponseContract.fields).sort(), ['data', 'ok', 'status']);
  });
  await test('（6.contract consistency）AnalysisResultContract 定義了 status/result 兩個欄位', () => {
    assert.deepStrictEqual(Object.keys(AnalysisResultContract.fields).sort(), ['result', 'status']);
  });
  await test('（6.contract consistency）RecommendationResultContract 定義了 status/recommendations 兩個欄位', () => {
    assert.deepStrictEqual(Object.keys(RecommendationResultContract.fields).sort(), ['recommendations', 'status']);
  });

  await test('（6.contract consistency）matchesContract()：真正的getUserInsight()輸出符合InsightResponseContract', async () => {
    const svc = insightMod.createInsightService({});
    const result = await svc.getUserInsight('u1', {});
    assert.strictEqual(matchesContract(InsightResponseContract, result), true);
  });
  await test('（6.contract consistency）matchesContract()：真正的analyze()輸出符合AnalysisResultContract', async () => {
    const engine = analysisMod.createAnalysisEngine();
    const result = await engine.analyze({});
    assert.strictEqual(matchesContract(AnalysisResultContract, result), true);
  });
  await test('（6.contract consistency）matchesContract()：真正的recommend()輸出符合RecommendationResultContract', async () => {
    const engine = recommendMod.createRecommendationEngine();
    const result = await engine.recommend(null);
    assert.strictEqual(matchesContract(RecommendationResultContract, result), true);
  });

  await test('（6.contract consistency）matchesContract()：缺少必要欄位的物件不符合contract', () => {
    assert.strictEqual(matchesContract(InsightResponseContract, { ok: true }), false);
  });
  await test('（6.contract consistency）matchesContract()：欄位型別不符時不符合contract（status應為string卻給number）', () => {
    assert.strictEqual(matchesContract(AnalysisResultContract, { status: 123, result: null }), false);
  });
  await test('（6.contract consistency）matchesContract()：null不符合任何contract', () => {
    assert.strictEqual(matchesContract(InsightResponseContract, null), false);
  });
  await test('（6.contract consistency）matchesContract()：非物件(字串)不符合任何contract', () => {
    assert.strictEqual(matchesContract(InsightResponseContract, 'not an object'), false);
  });

  console.log('');

  // =========================================================================
  // G. no SQL
  // =========================================================================
  console.log('--- G. no SQL ---');

  const intelJsFiles = fs.readdirSync(intelDir).filter((f) => f.endsWith('.js'));
  await test(`（7.no SQL）src/intelligence/ 動態掃描到 ${intelJsFiles.length} 個.js檔案`, () => {
    assert.strictEqual(intelJsFiles.length, 5);
  });

  for (const file of intelJsFiles) {
    await test(`（7.no SQL）src/intelligence/${file} 完全沒有 db.prepare()`, () => {
      const src = readIntelSrc(file);
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（7.no SQL）src/intelligence/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readIntelSrc(file);
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // H. no D1 access
  // =========================================================================
  console.log('--- H. no D1 access ---');

  for (const file of intelJsFiles) {
    await test(`（8.no D1 access）src/intelligence/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readIntelSrc(file);
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（8.no D1 access）src/intelligence/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readIntelSrc(file);
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // I. no AI API call
  // =========================================================================
  console.log('--- I. no AI API call ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i,
  ];
  for (const file of intelJsFiles) {
    // 注意：這裡故意用 readIntelSrc()（stripComments()後的版本）而不是
    // 原始檔案內容——每個檔案的頂部註解都會明確寫出「禁止串接
    // Claude/OpenAI/DeepSeek」這類文字，用來說明本次任務的限制，這是
    // 合法的文件性質敘述，不是實際程式碼在使用這些服務。這裡要驗證的是
    // 「真正會被執行的程式碼」裡完全沒有出現這些字樣（import、字串
    // 字面值、變數名稱等），所以先把註解剝除掉再檢查，避免把「說明
    // 禁止事項的註解」誤判成違規。
    const codeOnly = readIntelSrc(file);
    for (const pattern of AI_KEYWORDS) {
      await test(`（9.no AI API call）src/intelligence/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
  }

  await test('（9.no AI API call）src/intelligence/README.md 提到的AI服務名稱（Claude/OpenAI/DeepSeek）只出現在「禁止事項」說明文字裡，README本身沒有任何程式碼區塊示範怎麼呼叫它們', () => {
    const readme = fs.readFileSync(path.join(intelDir, 'README.md'), 'utf8');
    assert.ok(/Claude\/OpenAI\/DeepSeek/i.test(readme), 'README應該要有明確提到禁止串接哪些AI服務');
  });

  await test('（9.no AI API call）src/intelligence/README.md 提到的AI服務名稱只出現在「禁止事項」說明文字裡，不是任何程式碼片段', () => {
    const readme = fs.readFileSync(path.join(intelDir, 'README.md'), 'utf8');
    const codeBlocks = [...readme.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);
    for (const block of codeBlocks) {
      assert.ok(!/anthropic|claude|openai|deepseek/i.test(block), 'README的程式碼區塊不應該出現AI服務名稱');
    }
  });

  console.log('');

  // =========================================================================
  // J. no fetch call
  // =========================================================================
  console.log('--- J. no fetch call ---');

  for (const file of intelJsFiles) {
    await test(`（10.no fetch call）src/intelligence/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readIntelSrc(file);
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（10.no fetch call）src/intelligence/${file} 完全沒有 import 任何 AI SDK 套件（不含相對路徑的import一律視為外部套件）`, () => {
      const src = readIntelSrc(file);
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // K. dependency boundary
  // =========================================================================
  console.log('--- K. dependency boundary ---');

  await test('（11.dependency boundary）insight_service.js 呼叫鏈：getUserInsight()真的呼叫了analysisEngine.analyze()', async () => {
    let called = false;
    let receivedArg = null;
    const fakeAnalysisEngine = { analyze: async (arg) => { called = true; receivedArg = arg; return { status: 'not_implemented', result: null }; } };
    const svc = insightMod.createInsightService({ analysisEngine: fakeAnalysisEngine });
    await svc.getUserInsight('u-dep-1', { foo: 'bar' });
    assert.strictEqual(called, true);
    assert.strictEqual(receivedArg.userId, 'u-dep-1');
    assert.deepStrictEqual(receivedArg.context, { foo: 'bar' });
  });

  await test('（11.dependency boundary）insight_service.js 呼叫鏈：getUserInsight()真的呼叫了recommendationEngine.recommend()', async () => {
    let called = false;
    const fakeRecommendationEngine = { recommend: async () => { called = true; return { status: 'not_implemented', recommendations: [] }; } };
    const svc = insightMod.createInsightService({ recommendationEngine: fakeRecommendationEngine });
    await svc.getUserInsight('u-dep-2', {});
    assert.strictEqual(called, true);
  });

  await test('（11.dependency boundary）依賴鏈正確串接：analysisEngine.analyze()的回傳值會被當成recommendationEngine.recommend()的參數', async () => {
    const fakeAnalysisResult = { status: 'not_implemented', result: null, __marker: 'analysis-output' };
    const fakeAnalysisEngine = { analyze: async () => fakeAnalysisResult };
    let receivedByRecommend = null;
    const fakeRecommendationEngine = { recommend: async (insight) => { receivedByRecommend = insight; return { status: 'not_implemented', recommendations: [] }; } };
    const svc = insightMod.createInsightService({ analysisEngine: fakeAnalysisEngine, recommendationEngine: fakeRecommendationEngine });
    await svc.getUserInsight('u-dep-3', {});
    assert.strictEqual(receivedByRecommend, fakeAnalysisResult);
    assert.strictEqual(receivedByRecommend.__marker, 'analysis-output');
  });

  await test('（11.dependency boundary）即使analysisEngine/recommendationEngine回傳「真的分析結果」，getUserInsight()仍然不會把它塞進自己的回傳值（架構上禁止Insight Service洩漏子層結果）', async () => {
    const fakeAnalysisEngine = { analyze: async () => ({ status: 'done', result: { fake: 'real-looking-data' } }) };
    const fakeRecommendationEngine = { recommend: async () => ({ status: 'done', recommendations: ['fake-recommendation'] }) };
    const svc = insightMod.createInsightService({ analysisEngine: fakeAnalysisEngine, recommendationEngine: fakeRecommendationEngine });
    const result = await svc.getUserInsight('u-dep-4', {});
    assert.deepStrictEqual(result, { ok: true, status: 'not_ready', data: null });
  });

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（11.dependency boundary）src/routes/${file} 完全不 import src/intelligence/ 底下任何檔案（禁止 Route → Intelligence Layer）`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\//.test(src));
    });
  }

  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（11.dependency boundary）src/controllers/${file} 完全不 import src/intelligence/ 底下任何檔案（禁止 Controller → AI Provider / Intelligence Layer 直接耦合）`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\//.test(src));
    });
  }

  await test('（11.dependency boundary）insight_service.js 完全不 import src/routes/ 或 src/controllers/ 底下任何檔案（不處理HTTP，維持單向依賴）', () => {
    const src = readIntelSrc('insight_service.js');
    assert.ok(!/from\s+['"].*\/routes\//.test(src));
    assert.ok(!/from\s+['"].*\/controllers\//.test(src));
  });

  await test('（11.dependency boundary）insight_service.js 完全不 import src/auth/ 或 src/identity/（不處理session）', () => {
    const src = readIntelSrc('insight_service.js');
    assert.ok(!/from\s+['"].*\/auth\//.test(src));
    assert.ok(!/from\s+['"].*\/identity\//.test(src));
  });

  console.log('');

  // =========================================================================
  // L. bootstrap integration
  // =========================================================================
  console.log('--- L. bootstrap integration ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));

  function makeFullEnv() {
    return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} };
  }

  await test('（12.bootstrap integration）createApplication(env) 回傳值具備 intelligence 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('intelligence' in app);
  });

  // 注意：TASK1.41 為 app.intelligence 新增了 `dataPreparation` 欄位，
  // TASK1.42 又新增了 `context` 欄位，TASK1.43 新增了 `analysis`
  // 欄位，TASK1.44 新增了 `recommendation` 欄位（Recommendation
  // Framework的extension point，見src/intelligence/recommendation/），
  // TASK1.45 新增了 `orchestration` 欄位（Intelligence Orchestrator
  // 的extension point，見src/intelligence/orchestration/），TASK1.46
  // 再新增了 `service` 欄位（Intelligence Application Service的
  // extension point，見src/intelligence/service/），都是明確要做的
  // 擴充，不是回歸，這裡的預期key清單已同步更新。
  // 注意：TASK1.50 又新增了 `execution` 欄位（Intelligence Execution
  // Manager的extension point，見src/intelligence/execution/），這是
  // 明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  await test('（TASK1.54後更新）app.intelligence 恰好具備 insightService/analysisEngine/recommendationEngine/dataPreparation/context/analysis/recommendation/orchestration/service/facade/execution/events/history/monitoring/metrics 十五個欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), ['analysis', 'analysisEngine', 'context', 'dataPreparation', 'events', 'execution', 'facade', 'history', 'insightService', 'metrics', 'monitoring', 'orchestration', 'recommendation', 'recommendationEngine', 'service']);
  });

  await test('（12.bootstrap integration）app.intelligence.insightService 具備 getUserInsight 函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.insightService.getUserInsight, 'function');
  });

  await test('（12.bootstrap integration）app.intelligence.analysisEngine 具備 analyze 函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.analysisEngine.analyze, 'function');
  });

  await test('（12.bootstrap integration）app.intelligence.recommendationEngine 具備 recommend 函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.recommendationEngine.recommend, 'function');
  });

  await test('（12.bootstrap integration）透過app.intelligence.insightService.getUserInsight()呼叫，回傳固定的{ok:true,status:"not_ready",data:null}', async () => {
    const app = createApplication(makeFullEnv());
    const result = await app.intelligence.insightService.getUserInsight('u1', {});
    assert.deepStrictEqual(result, { ok: true, status: 'not_ready', data: null });
  });

  await test('（12.bootstrap integration）每次createApplication()呼叫都各自建立獨立的intelligence實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence, app2.intelligence);
    assert.notStrictEqual(app1.intelligence.insightService, app2.intelligence.insightService);
    assert.notStrictEqual(app1.intelligence.analysisEngine, app2.intelligence.analysisEngine);
  });

  await test('（12.bootstrap integration）createApplication() 完整回傳形狀為 {config, db, services, router, middleware, intelligence} 六個頂層欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'intelligence', 'middleware', 'router', 'services']);
  });

  await test('（12.bootstrap integration）原始碼掃描：src/bootstrap/application.js 有 import src/intelligence/index.js', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(/from\s+['"]\.\.\/intelligence\/index\.js['"]/.test(src));
  });

  await test('（12.bootstrap integration）app.router.routes 數量沒有因為新增intelligence而改變（依然是21條，intelligence純粹是額外欄位，不影響既有router組裝）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  console.log('');

  // =========================================================================
  // M. existing API regression
  // =========================================================================
  console.log('--- M. existing API regression ---');

  // 注意：跟 backups/phase1-task1.39-review/test_architecture_review.mjs
  // 同樣的道理——這個章節會動態掃描並spawn子行程執行backups/底下全部
  // 既有測試檔案，其中包含TASK1.39自己的meta regression suite（它也會
  // 動態掃描並spawn子行程）。如果雙方互相掃到對方就會無限遞迴spawn
  // （這個問題在寫這個檔案時就被實際測出來過：跑這個檔案時卡死超過
  // 60秒逾時）。修正方式：用環境變數PHASE1_REVIEW_NESTED當作遞迴深度
  // 防護旗標——被當成子行程執行時，一律跳過「自己再往下spawn一層」，
  // 只執行本檔案其餘的直接斷言，讓遞迴深度固定壓在1層。
  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（13.existing API regression）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.40-intelligence-foundation')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（13.existing API regression）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.39）`, () => {
      assert.ok(allSuites.length >= 31, `預期至少31個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（13.existing API regression）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // N. authentication regression
  // =========================================================================
  console.log('--- N. authentication regression ---');

  const { createAppRouter } = await import(path.join(srcRoot, 'routes', 'index.js'));
  const { SESSION_COOKIE_NAME } = await import(path.join(srcRoot, 'auth', 'constants.js'));

  function makeMinimalMockDb() {
    const users = new Map();
    const sessions = new Map();
    return {
      seedUser(u) { users.set(u.id, Object.assign({ is_guest: 1, auth_provider: null, display_name: null, created_at: '2026-01-01T00:00:00Z' }, u)); },
      seedSession(s) { sessions.set(s.id, s); },
      users: { async getById(id) { return { ok: true, row: users.get(id) || null }; } },
      sessions: { async getById(id) { return { ok: true, row: sessions.get(id) || null }; } },
      explorationRecords: { async listByUser() { return { ok: true, results: [] }; } },
      foodEvents: { async listByUser() { return { ok: true, results: [] }; } },
      emotionRecords: { async listByUser() { return { ok: true, results: [] }; } },
      behaviorPatterns: { async listByUser() { return { ok: true, results: [] }; } },
      aiReports: { async listByUser() { return { ok: true, results: [] }; } },
    };
  }

  await test('（14.authentication regression）新增intelligence layer後，requireAuth()正常運作：未登入GET /api/dashboard仍正確回401', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {} }, { db: makeMinimalMockDb() });
    assert.strictEqual(res.status, 401);
  });

  await test('（14.authentication regression）新增intelligence layer後，合法登入使用者仍可正常存取/api/timeline', async () => {
    const db = makeMinimalMockDb();
    db.seedUser({ id: 'u-auth-1', status: 'active' });
    db.seedSession({ id: 'tok-auth-1', user_id: 'u-auth-1', expires_at: '2099-01-01T00:00:00Z', revoked_at: null });
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/timeline', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-auth-1` }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（14.authentication regression）新增intelligence layer後，guest login（POST /auth/guest）流程完全不受影響', async () => {
    const workerPath = path.join(srcRoot, 'worker.js');
    const mod = await import('file://' + workerPath + '?t=' + Date.now());
    const worker = mod.default;
    const fakeD1 = makeStatefulFakeD1ForAuth();
    const env = { SYNC_KV: makeFakeKV(), DIET_COACH_IMAGES: makeFakeR2(), DIET_COACH_DB: fakeD1 };
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('set-cookie'));
  });

  await test('（14.authentication regression）原始碼掃描：src/auth/session.js 完全沒有被TASK1.40修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/auth/session.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.authentication regression）原始碼掃描：src/identity/ 底下的.js邏輯檔案完全沒有被TASK1.40修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/identity/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.authentication regression）原始碼掃描：src/oauth/ 底下的.js邏輯檔案完全沒有被TASK1.40修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // O. session regression
  // =========================================================================
  console.log('--- O. session regression ---');

  await test('（15.session regression）新增intelligence layer後，session過期時requireAuth()仍正確回401 reason=expired', async () => {
    const db = makeMinimalMockDb();
    db.seedUser({ id: 'u-sess-1', status: 'active' });
    db.seedSession({ id: 'tok-sess-1', user_id: 'u-sess-1', expires_at: '2020-01-01T00:00:00Z', revoked_at: null });
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-sess-1` }, { db });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.reason, 'expired');
  });

  await test('（15.session regression）新增intelligence layer後，session已撤銷時requireAuth()仍正確回401 reason=revoked', async () => {
    const db = makeMinimalMockDb();
    db.seedUser({ id: 'u-sess-2', status: 'active' });
    db.seedSession({ id: 'tok-sess-2', user_id: 'u-sess-2', expires_at: '2099-01-01T00:00:00Z', revoked_at: '2026-01-01T00:00:00Z' });
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${SESSION_COOKIE_NAME}=tok-sess-2` }, { db });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.reason, 'revoked');
  });

  await test('（15.session regression）原始碼掃描：src/db/tables/sessions.js 完全沒有被TASK1.40修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/db/tables/sessions.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（15.session regression）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  console.log('');

  // =========================================================================
  // P. P1-P6
  // =========================================================================
  console.log('--- P. P1-P6 ---');

  await test('（16.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（16.P1-P6）src/worker.js 完全沒有被TASK1.40修改（git diff確認，包含getHTML()在內的全部內容零異動）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（16.P1-P6）wrangler.toml 完全沒有被TASK1.40修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

// -----------------------------------------------------------------------
// 給 N 類別端對端guest login regression測試用的最小fake bindings
// -----------------------------------------------------------------------
function makeFakeKV() {
  const store = new Map();
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}
function makeFakeR2() {
  return { async get() { return null; } };
}
function makeStatefulFakeD1ForAuth() {
  const users = new Map();
  const sessions = new Map();
  function makeStatement(sql, params) {
    params = params || [];
    return {
      bind(...p) { return makeStatement(sql, p); },
      async run() {
        if (/INSERT INTO users/.test(sql)) {
          const [id, auth_provider, auth_provider_id, display_name, is_guest, status, legacy_sync_code, created_at, updated_at] = params;
          users.set(id, { id, auth_provider, auth_provider_id, display_name, is_guest, status, legacy_sync_code, created_at, updated_at });
        } else if (/INSERT INTO sessions/.test(sql)) {
          const [id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash] = params;
          sessions.set(id, { id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash, revoked_at: null });
        }
        return { meta: {} };
      },
      async all() { return { results: [] }; },
      async first() {
        if (/SELECT \* FROM users WHERE id = \?/.test(sql)) return users.get(params[0]) || null;
        if (/SELECT \* FROM sessions WHERE id = \?/.test(sql)) return sessions.get(params[0]) || null;
        return null;
      },
    };
  }
  return {
    prepare(sql) { return makeStatement(sql, []); },
    async batch(statements) { const r = []; for (const s of statements) r.push(await s.run()); return r; },
  };
}

run();

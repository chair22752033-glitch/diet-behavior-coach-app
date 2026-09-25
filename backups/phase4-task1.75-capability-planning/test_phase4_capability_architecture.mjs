/*
 * Phase 4 TASK 1.75｜Phase 4 Intelligence Capability Architecture
 * Planning 測試
 *
 * 本任務不是導入AI、不是建立AI Provider、不是新增User Feature——
 * 這是在Phase 1/2/3全部完成之後，正式開始Phase 4 Intelligence
 * Capability Development前的架構規劃，確認未來AI Capability/
 * Analysis Capability/Recommendation Capability的合法接入邊界。
 *
 * 規劃結論記錄於`src/intelligence/PHASE4_CAPABILITY_PLAN.md`（本次
 * 任務唯一新增的文件）。這份測試逐項驗證該文件描述的每一個結論
 * 是否有既有程式碼支撐（尤其是analysis_runner.js/
 * recommendation_runner.js既有的modules依賴注入機制，這是Phase 4
 * AI Extension Point的核心）。
 *
 * 分為以下9個部分：
 * A) capability boundary
 * B) AI extension boundary
 * C) runtime isolation
 * D) application isolation
 * E) dependency scan
 * F) export consistency
 * G) documentation consistency
 * H) regression check
 * I) P1-P6
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
const applicationDir = path.join(intelDir, 'application');
const analysisDir = path.join(intelDir, 'analysis');
const recommendationDir = path.join(intelDir, 'recommendation');
const featuresDir = path.join(applicationDir, 'features');
const insightDir = path.join(featuresDir, 'insight');
const behaviorDir = path.join(featuresDir, 'behavior');

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

function listAllJsFiles(dir) {
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
    }
  }
  walk(dir);
  return files.sort();
}

const ALL_APPLICATION_FILES = listAllJsFiles(applicationDir);
const ANALYSIS_FILES = listAllJsFiles(analysisDir);
const RECOMMENDATION_FILES = listAllJsFiles(recommendationDir);

const AI_KEYWORDS = [
  /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
  /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
  /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
];

async function run() {
  const { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(recommendationDir, 'index.js'));

  // =========================================================================
  // A. capability boundary
  // =========================================================================
  console.log('--- A. capability boundary ---');

  await test('（1.capability boundary）PHASE4_CAPABILITY_PLAN.md存在於src/intelligence/底下（不是application/底下——因為規劃範圍涵蓋Phase 2 Runtime跟Phase 3 Application兩者）', () => {
    const docPath = path.join(intelDir, 'PHASE4_CAPABILITY_PLAN.md');
    assert.ok(fs.existsSync(docPath));
    assert.ok(fs.readFileSync(docPath, 'utf8').length > 500);
  });

  await test('（1.capability boundary）Application Feature（insight/behavior）→Capability→Analysis/Recommendation→Runtime責任切分：Feature層完全不import analysis/或recommendation/', () => {
    for (const dir of [insightDir, behaviorDir]) {
      for (const f of listAllJsFiles(dir)) {
        const src = readSrc(f);
        assert.ok(!/from\s+['"].*\/analysis\//.test(src), `${path.relative(repoRoot, f)}不應該import analysis/`);
        assert.ok(!/from\s+['"].*\/recommendation\//.test(src), `${path.relative(repoRoot, f)}不應該import recommendation/`);
      }
    }
  });

  await test('（1.capability boundary）Capability層（application/capabilities/、features/behavior/behavior_capability.js）完全不import analysis/或recommendation/', () => {
    for (const f of [path.join(applicationDir, 'capabilities', 'insight_capability.js'), path.join(behaviorDir, 'behavior_capability.js')]) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
    }
  });

  await test('（1.capability boundary）Analysis Runner跟Recommendation Runner完全不import Application Layer（application/）底下任何檔案（責任切分是單向的，Runtime不認識上層Application）', () => {
    for (const f of [...ANALYSIS_FILES, ...RECOMMENDATION_FILES]) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/application\//.test(src), `${path.relative(repoRoot, f)}不應該import application/`);
    }
  });

  await test('（1.capability boundary）Analysis Runner的輸出（Analysis Result）形狀跟Recommendation Runner的輸入形狀相容（{status, insights/recommendations, metadata}）', () => {
    const analysisRunner = createAnalysisRunner();
    const recommendationRunner = createRecommendationRunner();
    const insightContext = { user: null, activityContext: { count: 1, items: [] }, nutritionContext: { count: 0, items: [] }, emotionContext: { count: 0, items: [] }, behaviorContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] }, metadata: { totalRecords: 1 } };
    const analysisOutcome = analysisRunner.runAnalysis(insightContext);
    assert.strictEqual(analysisOutcome.ok, true);
    const recommendationOutcome = recommendationRunner.runRecommendation(analysisOutcome.result);
    assert.strictEqual(recommendationOutcome.ok, true);
  });

  console.log('');

  // =========================================================================
  // B. AI extension boundary
  // =========================================================================
  console.log('--- B. AI extension boundary ---');

  await test('（2.AI extension boundary）createAnalysisRunner()接受dependencies.modules覆蓋預設模組清單（既有的Phase 4 AI Extension Point機制）', () => {
    let customModuleCalled = false;
    const customModule = (context) => { customModuleCalled = true; return { type: 'custom', value: 1, source: 'custom' }; };
    const runner = createAnalysisRunner({ modules: [customModule] });
    const insightContext = { user: null, activityContext: { count: 0, items: [] }, nutritionContext: { count: 0, items: [] }, emotionContext: { count: 0, items: [] }, behaviorContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] }, metadata: {} };
    const outcome = runner.runAnalysis(insightContext);
    assert.strictEqual(customModuleCalled, true);
    assert.strictEqual(outcome.ok, true);
    assert.deepStrictEqual(outcome.result.insights, [{ type: 'custom', value: 1, source: 'custom' }]);
  });

  await test('（2.AI extension boundary）createRecommendationRunner()接受dependencies.modules覆蓋預設模組清單', () => {
    let customModuleCalled = false;
    const customModule = (analysisResult) => { customModuleCalled = true; return { type: 'custom-rec', value: 1, source: 'custom' }; };
    const runner = createRecommendationRunner({ modules: [customModule] });
    const outcome = runner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(customModuleCalled, true);
    assert.strictEqual(outcome.ok, true);
    assert.deepStrictEqual(outcome.result.recommendations, [{ type: 'custom-rec', value: 1, source: 'custom' }]);
  });

  await test('（2.AI extension boundary）自訂模組可以跟既有DEFAULT模組並存（模擬Phase 4的做法：[...DEFAULT_ANALYSIS_MODULES, aiModule]，不是取代既有模組）', () => {
    const aiLikeModule = (context) => ({ type: 'ai_powered_insight', value: 'placeholder', source: 'ai' });
    const runner = createAnalysisRunner({ modules: [...DEFAULT_ANALYSIS_MODULES, aiLikeModule] });
    const insightContext = { user: null, activityContext: { count: 2, items: [] }, nutritionContext: { count: 1, items: [] }, emotionContext: { count: 0, items: [] }, behaviorContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] }, metadata: { totalRecords: 3 } };
    const outcome = runner.runAnalysis(insightContext);
    assert.strictEqual(outcome.ok, true);
    assert.strictEqual(outcome.result.insights.length, DEFAULT_ANALYSIS_MODULES.length + 1);
    assert.ok(outcome.result.insights.some((i) => i.type === 'ai_powered_insight'));
  });

  await test('（2.AI extension boundary）模組回傳null時正確被過濾（AI模組「這次沒有東西可報告」的合法回應）', () => {
    const runner = createAnalysisRunner({ modules: [() => null, () => ({ type: 'x', value: 1, source: 'y' })] });
    const insightContext = { user: null, activityContext: { count: 0, items: [] }, nutritionContext: { count: 0, items: [] }, emotionContext: { count: 0, items: [] }, behaviorContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] }, metadata: {} };
    const outcome = runner.runAnalysis(insightContext);
    assert.strictEqual(outcome.result.insights.length, 1);
  });

  for (const f of [...listAllJsFiles(insightDir), ...listAllJsFiles(behaviorDir), ...ALL_APPLICATION_FILES]) {
    const relName = path.relative(repoRoot, f);
    await test(`（2.AI extension boundary）${relName} 完全不含AI Provider相關關鍵字樣（Feature/Application Layer完全不直接呼叫AI）`, () => {
      const src = readSrc(f);
      for (const pattern of AI_KEYWORDS) {
        assert.ok(!pattern.test(src), `${relName}出現疑似AI相關字樣：${pattern}`);
      }
    });
    await test(`（2.AI extension boundary）${relName} 完全不呼叫fetch()（Feature/Application Layer不直接對外發起網路請求）`, () => {
      assert.ok(!/\bfetch\s*\(/.test(readSrc(f)));
    });
  }

  console.log('');

  // =========================================================================
  // C. runtime isolation
  // =========================================================================
  console.log('--- C. runtime isolation ---');

  await test('（3.runtime isolation）analysis_runner.js/recommendation_runner.js本次任務完全沒有被修改（git diff確認，Phase 2 Runtime Boundary維持不變）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/analysis/', 'src/intelligence/recommendation/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.runtime isolation）runAnalysis(insightContext, options)簽名完全不接受db/userId/session參數（AI模組無法透過這個入口取得資料庫或身分資訊）', () => {
    const src = readSrc(path.join(analysisDir, 'analysis_runner.js'));
    assert.ok(/function runAnalysis\(insightContext, options\)/.test(src));
    assert.ok(!/\bdb\b/.test(src));
  });

  await test('（3.runtime isolation）runRecommendation(analysisResult)簽名完全不接受db/userId/session參數', () => {
    const src = readSrc(path.join(recommendationDir, 'recommendation_runner.js'));
    assert.ok(/function runRecommendation\(analysisResult\)/.test(src));
    assert.ok(!/\bdb\b/.test(src));
  });

  await test('（3.runtime isolation）analysis_runner.js/recommendation_runner.js完全不import src/db/、src/auth/、src/oauth/', () => {
    for (const f of [path.join(analysisDir, 'analysis_runner.js'), path.join(recommendationDir, 'recommendation_runner.js')]) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/db\//.test(src));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    }
  });

  for (const f of [...ANALYSIS_FILES, ...RECOMMENDATION_FILES]) {
    const relName = path.relative(repoRoot, f);
    await test(`（3.runtime isolation）${relName} 完全不含AI Provider相關關鍵字樣（現有DEFAULT模組維持deterministic）`, () => {
      const src = readSrc(f);
      for (const pattern of AI_KEYWORDS) {
        assert.ok(!pattern.test(src), `${relName}出現疑似AI相關字樣：${pattern}`);
      }
    });
    await test(`${`（3.runtime isolation）${relName} 完全不呼叫fetch()（現有實作沒有任何對外部服務的網路呼叫）`}`, () => {
      assert.ok(!/\bfetch\s*\(/.test(readSrc(f)));
    });
  }

  await test('（3.runtime isolation）DEFAULT_ANALYSIS_MODULES/DEFAULT_RECOMMENDATION_MODULES是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const insightContext = { user: null, activityContext: { count: 5, items: [] }, nutritionContext: { count: 3, items: [] }, emotionContext: { count: 1, items: [] }, behaviorContext: { count: 2, items: [] }, reportContext: { count: 0, items: [] }, metadata: { totalRecords: 11 } };
    const runner = createAnalysisRunner();
    const r1 = runner.runAnalysis(insightContext);
    const r2 = runner.runAnalysis(insightContext);
    assert.deepStrictEqual(r1, r2);
  });

  console.log('');

  // =========================================================================
  // D. application isolation
  // =========================================================================
  console.log('--- D. application isolation ---');

  await test('（4.application isolation）Application Layer（application/整個目錄樹，35個檔案）本次任務完全沒有被修改（git diff確認，Phase 3 Application Pattern維持不變）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.application isolation）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.application isolation）app.intelligence物件恰好維持24個欄位不變（本次任務沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（4.application isolation）端對端：Insight跟Behavior兩條完整鏈路在本次任務後依然成功運作（Phase 3 Application Pattern未受影響）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  console.log('');

  // =========================================================================
  // E. dependency scan
  // =========================================================================
  console.log('--- E. dependency scan ---');

  for (const f of [...ANALYSIS_FILES, ...RECOMMENDATION_FILES, ...ALL_APPLICATION_FILES]) {
    const relName = path.relative(repoRoot, f);
    const src = readSrc(f);
    await test(`（5.dependency scan）${relName} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（5.dependency scan）${relName} 完全不import src/auth/、src/oauth/`, () => {
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
    await test(`（5.dependency scan）${relName} 裡所有import都是相對路徑（完全不import任何非相對路徑的外部套件，包含AI SDK）`, () => {
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${relName}import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  await test('（5.dependency scan）wrangler.toml完全沒有新增任何AI相關的環境變數/binding（本次任務沒有啟用AI Provider）', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content), `wrangler.toml不應該出現${pattern}`);
    }
  });

  await test('（5.dependency scan）package.json完全沒有新增任何AI SDK依賴（@anthropic-ai、openai等）', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name), `package.json不應該有AI SDK依賴：${name}`);
      }
    }
  });

  console.log('');

  // =========================================================================
  // F. export consistency
  // =========================================================================
  console.log('--- F. export consistency ---');

  await test('（6.export consistency）analysis/index.js正確re-export createAnalysisRunner/DEFAULT_ANALYSIS_MODULES', async () => {
    const mod = await import(path.join(analysisDir, 'index.js'));
    assert.strictEqual(typeof mod.createAnalysisRunner, 'function');
    assert.ok(Array.isArray(mod.DEFAULT_ANALYSIS_MODULES));
  });

  await test('（6.export consistency）recommendation/index.js正確re-export createRecommendationRunner/DEFAULT_RECOMMENDATION_MODULES', async () => {
    const mod = await import(path.join(recommendationDir, 'index.js'));
    assert.strictEqual(typeof mod.createRecommendationRunner, 'function');
    assert.ok(Array.isArray(mod.DEFAULT_RECOMMENDATION_MODULES));
  });

  await test('（6.export consistency）DEFAULT_ANALYSIS_MODULES恰好6個模組，每個都是函式', () => {
    assert.strictEqual(DEFAULT_ANALYSIS_MODULES.length, 6);
    for (const m of DEFAULT_ANALYSIS_MODULES) {
      assert.strictEqual(typeof m, 'function');
    }
  });

  await test('（6.export consistency）DEFAULT_RECOMMENDATION_MODULES恰好3個模組，每個都是函式', () => {
    assert.strictEqual(DEFAULT_RECOMMENDATION_MODULES.length, 3);
    for (const m of DEFAULT_RECOMMENDATION_MODULES) {
      assert.strictEqual(typeof m, 'function');
    }
  });

  await test('（6.export consistency）src/intelligence/index.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // G. documentation consistency
  // =========================================================================
  console.log('--- G. documentation consistency ---');

  const planDoc = fs.readFileSync(path.join(intelDir, 'PHASE4_CAPABILITY_PLAN.md'), 'utf8');

  for (const section of ['Phase 4 Architecture Goal', 'Capability Boundary', 'AI Extension', 'Data Boundary', 'Security Boundary', 'Known Limitations']) {
    await test(`（7.documentation consistency）PHASE4_CAPABILITY_PLAN.md包含「${section}」章節`, () => {
      assert.ok(planDoc.includes(section), `文件應該包含${section}章節`);
    });
  }

  await test('（7.documentation consistency）PHASE4_CAPABILITY_PLAN.md記錄了modules依賴注入是既有的AI Extension Point機制', () => {
    assert.ok(/dependencies\.modules/.test(planDoc));
    assert.ok(/DEFAULT_ANALYSIS_MODULES/.test(planDoc));
    assert.ok(/DEFAULT_RECOMMENDATION_MODULES/.test(planDoc));
  });

  await test('（7.documentation consistency）PHASE4_CAPABILITY_PLAN.md明確記錄「Feature直接呼叫AI」是禁止的', () => {
    assert.ok(/Feature.*直接呼叫AI|Feature直接呼叫AI/.test(planDoc));
  });

  await test('（7.documentation consistency）PHASE4_CAPABILITY_PLAN.md記錄了完成標準確認章節（六項checkbox）', () => {
    assert.ok(/完成標準確認/.test(planDoc));
    const checkmarks = (planDoc.match(/✅/g) || []).length;
    assert.ok(checkmarks >= 6, `預期至少6個✅項目，實際${checkmarks}`);
  });

  await test('（7.documentation consistency）PHASE4_CAPABILITY_PLAN.md記錄了Known Limitations裡「async模組尚未支援」這個已知限制', () => {
    assert.ok(/async/i.test(planDoc));
  });

  console.log('');

  // =========================================================================
  // H. regression check
  // =========================================================================
  console.log('--- H. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（8.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.75-capability-planning')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（8.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 65, `預期至少65個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（8.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // I. P1-P6
  // =========================================================================
  console.log('--- I. P1-P6 ---');

  await test('（9.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（9.P1-P6）src/worker.js 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（9.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

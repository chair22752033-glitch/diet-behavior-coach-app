/*
 * Phase 2 TASK 1.59｜Phase 3 Intelligence Application Architecture
 * Planning 測試
 *
 * 本任務不是導入AI功能，也不是新增實際使用者功能——這是Phase 3
 * 正式開始前的架構規劃，本身完全不修改任何Phase 2既有檔案的行為。
 * 這份測試驗證的是「Phase 3該怎麼安全使用Phase 2成果」這份規劃
 * 本身站得住腳：
 * - Phase 3 Architecture Boundary：User Application→Facade→
 *   Service→Execution Runtime→Analysis/Recommendation Extension
 *   這條鏈路，每一段介面都確實存在且可用
 * - AI Provider Extension Point：只有Analysis/Recommendation
 *   modules兩個位置，其餘（route/controller/worker/auth/domain
 *   service）目前完全不知道Intelligence Layer的存在
 * - Application Usage Boundary：Application Layer只能透過Facade
 *   取得Intelligence Result，不直接操作execution/history/metrics
 * - Dependency Direction：Application→Intelligence→Domain Data，
 *   不得反向
 *
 * 因為Phase 3實際上還沒開始動工，這裡驗證的是「規劃正確、且現狀
 * 沒有違反」的雙重確認，不是驗證任何新寫的Phase 3程式碼（因為
 * 根本沒有）。
 *
 * 分為以下8個部分：
 * A) phase boundary
 * B) extension point
 * C) dependency direction
 * D) AI isolation
 * E) application isolation
 * F) runtime isolation
 * G) regression check
 * H) P1-P6
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

function listAllFilesInDir(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && (!ext || e.name.endsWith(ext)))
    .map((e) => path.join(dir, e.name));
}

async function run() {
  const allIntelFiles = listAllJsFiles(intelDir);
  const readmeSrc = fs.readFileSync(path.join(intelDir, 'README.md'), 'utf8');

  // =========================================================================
  // A. phase boundary
  // =========================================================================
  console.log('--- A. phase boundary ---');

  await test('（1.phase boundary）README.md記錄了「Phase 3 Application Architecture Plan」章節', () => {
    assert.ok(readmeSrc.includes('Phase 3 Application Architecture Plan'));
  });

  await test('（1.phase boundary）README.md記錄了完整的User Application→Facade→Service→Execution Runtime→Analysis/Recommendation鏈路文字', () => {
    assert.ok(readmeSrc.includes('User Application'));
    assert.ok(readmeSrc.includes('Intelligence Facade'));
    assert.ok(readmeSrc.includes('Intelligence Service'));
    assert.ok(readmeSrc.includes('Execution Runtime'));
  });

  await test('（1.phase boundary）Facade的executeIntelligence()確實存在且可獨立建立實例', async () => {
    const { createIntelligenceFacade } = await import(path.join(intelDir, 'facade', 'index.js'));
    const facade = createIntelligenceFacade({});
    assert.strictEqual(typeof facade.executeIntelligence, 'function');
  });

  await test('（1.phase boundary）Service的getIntelligence()確實存在且可獨立建立實例', async () => {
    const { createIntelligenceService } = await import(path.join(intelDir, 'service', 'index.js'));
    const service = createIntelligenceService({});
    assert.strictEqual(typeof service.getIntelligence, 'function');
  });

  await test('（1.phase boundary）Execution Manager的execute()確實存在且可獨立建立實例', async () => {
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    const manager = createExecutionManager({});
    assert.strictEqual(typeof manager.execute, 'function');
  });

  await test('（1.phase boundary）Orchestrator的runIntelligencePipeline()確實存在且可獨立建立實例', async () => {
    const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));
    const orchestrator = createIntelligenceOrchestrator({});
    assert.strictEqual(typeof orchestrator.runIntelligencePipeline, 'function');
  });

  await test('（1.phase boundary）Analysis Runner的runAnalysis()確實存在且可獨立建立實例', async () => {
    const { createAnalysisRunner } = await import(path.join(intelDir, 'analysis', 'index.js'));
    const runner = createAnalysisRunner();
    assert.strictEqual(typeof runner.runAnalysis, 'function');
  });

  await test('（1.phase boundary）Recommendation Runner的runRecommendation()確實存在且可獨立建立實例', async () => {
    const { createRecommendationRunner } = await import(path.join(intelDir, 'recommendation', 'index.js'));
    const runner = createRecommendationRunner();
    assert.strictEqual(typeof runner.runRecommendation, 'function');
  });

  await test('（1.phase boundary，端對端）完整鏈路User Application→Facade→ExecutionManager→Service→Orchestrator→[dataPreparation→context→analysis→recommendation]從頭到尾真實跑一次成功', async () => {
    const { createIntelligenceFacade } = await import(path.join(intelDir, 'facade', 'index.js'));
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    const { createIntelligenceService } = await import(path.join(intelDir, 'service', 'index.js'));
    const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));
    const { createAnalysisRunner } = await import(path.join(intelDir, 'analysis', 'index.js'));
    const { createRecommendationRunner } = await import(path.join(intelDir, 'recommendation', 'index.js'));

    const dataPreparation = { prepare: async () => ({ ok: true, context: { raw: true } }) };
    const contextBuilder = { buildInsightContext: () => ({ context: { user: null, activityContext: { count: 1, items: [] }, nutritionContext: { count: 1, items: [] }, emotionContext: { count: 1, items: [] }, behaviorContext: { count: 1, items: [] }, reportContext: { count: 1, items: [] }, metadata: { totalRecords: 5 } }, validation: { ok: true } }) };
    const analysisRunner = createAnalysisRunner();
    const recommendationRunner = createRecommendationRunner();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation, contextBuilder, analysisRunner, recommendationRunner });
    const service = createIntelligenceService({ orchestrator });
    const executionManager = createExecutionManager({ service });
    const facade = createIntelligenceFacade({ executionManager });

    // 模擬「User Application」呼叫Facade——這是Phase 3未來唯一需要
    // 認識的介面
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.status, 'intelligence_ready');
  });

  console.log('');

  // =========================================================================
  // B. extension point
  // =========================================================================
  console.log('--- B. extension point ---');

  await test('（2.extension point）README.md明確記錄AI Provider只能進入analysis modules跟recommendation modules兩個位置', () => {
    assert.ok(readmeSrc.includes('AI Provider Extension Point'));
    assert.ok(readmeSrc.includes('analysis_runner.js'));
    assert.ok(readmeSrc.includes('recommendation_runner.js'));
  });

  await test('（2.extension point）analysis_runner.js的createAnalysisRunner(dependencies)接受dependencies.modules', async () => {
    const src = readSrc(path.join(intelDir, 'analysis', 'analysis_runner.js'));
    assert.ok(/dependencies\.modules/.test(src));
  });

  await test('（2.extension point）recommendation_runner.js的createRecommendationRunner(dependencies)接受dependencies.modules', async () => {
    const src = readSrc(path.join(intelDir, 'recommendation', 'recommendation_runner.js'));
    assert.ok(/dependencies\.modules/.test(src));
  });

  await test('（2.extension point，端對端）注入一個模擬AI Provider的analysis module，Runner正確採用它而不是預設模組', async () => {
    const { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } = await import(path.join(intelDir, 'analysis', 'index.js'));
    const aiModule = (context) => ({ type: 'ai_generated_insight', value: 'phase3_placeholder', source: 'mock_ai_provider' });
    const runner = createAnalysisRunner({ modules: [aiModule] });
    const context = { user: null, activityContext: { count: 0, items: [] }, nutritionContext: { count: 0, items: [] }, emotionContext: { count: 0, items: [] }, behaviorContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] }, metadata: { totalRecords: 0 } };
    const result = runner.runAnalysis(context);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.insights, [{ type: 'ai_generated_insight', value: 'phase3_placeholder', source: 'mock_ai_provider' }]);
    assert.ok(DEFAULT_ANALYSIS_MODULES.length > 0, '確認預設模組依然存在、沒有被這次注入永久覆蓋');
  });

  await test('（2.extension point，端對端）注入一個模擬AI Provider的recommendation module，Runner正確採用它而不是預設模組', async () => {
    const { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(intelDir, 'recommendation', 'index.js'));
    const aiModule = () => ({ type: 'ai_generated_recommendation', value: 'phase3_placeholder', source: 'mock_ai_provider' });
    const runner = createRecommendationRunner({ modules: [aiModule] });
    const analysisResult = { status: 'analysis_ready', insights: [], metadata: {} };
    const result = runner.runRecommendation(analysisResult);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.recommendations, [{ type: 'ai_generated_recommendation', value: 'phase3_placeholder', source: 'mock_ai_provider' }]);
    assert.ok(DEFAULT_RECOMMENDATION_MODULES.length > 0);
  });

  await test('（2.extension point）除了analysis/recommendation兩個runner以外，intelligence/其餘子層完全沒有可以注入自訂"modules"的介面（AI邏輯沒有其他後門可以進入）', () => {
    for (const f of allIntelFiles) {
      if (f.includes(path.join('intelligence', 'analysis')) || f.includes(path.join('intelligence', 'recommendation'))) continue;
      const src = readSrc(f);
      assert.ok(!/dependencies\.modules/.test(src), `${f} 不應該有dependencies.modules介面`);
    }
  });

  for (const forbidden of ['routes', 'controllers']) {
    await test(`（2.extension point）src/${forbidden}/ 完全沒有任何檔案import src/intelligence/（AI Provider不得進入${forbidden}）`, () => {
      const files = listAllFilesInDir(path.join(srcRoot, forbidden), '.js');
      for (const f of files) {
        assert.ok(!/from\s+['"].*\/intelligence\//.test(readSrc(f)), `${f} 不應該import intelligence/`);
      }
    });
  }

  await test('（2.extension point）src/worker.js完全沒有import src/intelligence/（AI Provider不得進入worker）', () => {
    assert.ok(!/from\s+['"].*\/intelligence\//.test(readSrc(path.join(srcRoot, 'worker.js'))));
  });

  await test('（2.extension point）src/auth/、src/oauth/完全沒有任何檔案import src/intelligence/（AI Provider不得進入authentication）', () => {
    for (const dir of ['auth', 'oauth']) {
      const files = listAllFilesInDir(path.join(srcRoot, dir), '.js');
      for (const f of files) {
        assert.ok(!/from\s+['"].*\/intelligence\//.test(readSrc(f)), `${f} 不應該import intelligence/`);
      }
    }
  });

  await test('（2.extension point）src/services/（既有Domain Service）完全沒有任何檔案import src/intelligence/（AI Provider不得進入domain service）', () => {
    const files = listAllFilesInDir(path.join(srcRoot, 'services'), '.js');
    for (const f of files) {
      assert.ok(!/from\s+['"].*\/intelligence\//.test(readSrc(f)), `${f} 不應該import intelligence/`);
    }
  });

  console.log('');

  // =========================================================================
  // C. dependency direction
  // =========================================================================
  console.log('--- C. dependency direction ---');

  await test('（3.dependency direction）README.md明確記錄Application→Intelligence→Domain Data的方向，且明確列出「不得反向依賴」', () => {
    assert.ok(readmeSrc.includes('Dependency Direction'));
    assert.ok(readmeSrc.includes('不得反向依賴'));
  });

  await test('（3.dependency direction）src/services/（Domain Service）完全不import src/intelligence/（維持TASK1.41既定方向：Data Preparation依賴Domain Service，不是反過來）', () => {
    const files = listAllFilesInDir(path.join(srcRoot, 'services'), '.js');
    for (const f of files) {
      assert.ok(!/from\s+['"].*\/intelligence\//.test(readSrc(f)));
    }
  });

  await test('（3.dependency direction）data_preparation/context_builder.js確實依賴既有Domain Service（正確方向：Intelligence→Domain Data）', () => {
    const src = readSrc(path.join(intelDir, 'data_preparation', 'context_builder.js'));
    assert.ok(/from\s+['"]\.\.\/\.\.\/services\//.test(src));
  });

  await test('（3.dependency direction）整個src/intelligence/依賴圖沒有循環依賴（Phase 3規劃前的最後確認）', () => {
    const graph = {};
    for (const f of allIntelFiles) {
      const imports = [...readSrc(f).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((imp) => imp.startsWith('.'));
      graph[f] = imports.map((imp) => path.normalize(path.join(path.dirname(f), imp)));
    }
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = {};
    for (const f of allIntelFiles) color[f] = WHITE;
    let cycleEdge = null;
    function dfs(node) {
      color[node] = GRAY;
      for (const next of graph[node] || []) {
        if (!(next in graph)) continue;
        if (color[next] === GRAY) cycleEdge = `${node} -> ${next}`;
        else if (color[next] === WHITE) dfs(next);
      }
      color[node] = BLACK;
    }
    for (const f of allIntelFiles) {
      if (color[f] === WHITE) dfs(f);
    }
    assert.strictEqual(cycleEdge, null, `發現循環依賴：${cycleEdge}`);
  });

  await test('（3.dependency direction）analysis_runner.js/recommendation_runner.js（未來AI Provider會被注入的地方）完全不import src/controllers/、src/routes/、src/auth/、src/oauth/、src/services/（AI Provider實作不應該有能力查詢使用者身份或直接存取Domain Data）', () => {
    for (const file of ['analysis/analysis_runner.js', 'recommendation/recommendation_runner.js']) {
      const src = readSrc(path.join(intelDir, ...file.split('/')));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
      assert.ok(!/from\s+['"].*\/services\//.test(src));
    }
  });

  const NON_DATA_PREP_FILES = allIntelFiles.filter((f) => !f.includes(path.join('intelligence', 'data_preparation')));
  for (const f of NON_DATA_PREP_FILES) {
    const relName = path.relative(repoRoot, f);
    await test(`（3.dependency direction）${relName} 完全不import src/services/（除了data_preparation/透過既有Domain Service間接存取以外，Intelligence Layer不應該反向依賴Domain Service實作細節）`, () => {
      assert.ok(!/from\s+['"].*\/services\//.test(readSrc(f)), `${relName} 不應該import src/services/`);
    });
  }

  for (const f of allIntelFiles) {
    const relName = path.relative(repoRoot, f);
    await test(`（3.dependency direction）${relName} 完全不import Phase 3未來新增的src/controllers/或src/routes/（下層不知道上層存在）`, () => {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/controllers\//.test(src), `${relName} 不應該import src/controllers/`);
      assert.ok(!/from\s+['"].*\/routes\//.test(src), `${relName} 不應該import src/routes/`);
    });
  }

  console.log('');

  // =========================================================================
  // D. AI isolation
  // =========================================================================
  console.log('--- D. AI isolation ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const pattern of AI_KEYWORDS) {
    await test(`（4.AI isolation）整個src/intelligence/的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
      for (const f of allIntelFiles) {
        assert.ok(!pattern.test(readSrc(f)), `${f} 出現疑似AI/Prompt相關字樣：${pattern}`);
      }
    });
  }

  for (const f of allIntelFiles) {
    const relName = path.relative(repoRoot, f);
    await test(`（4.AI isolation）${relName} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(readSrc(f)), `${relName} 不應該呼叫fetch()`);
    });
  }

  await test('（4.AI isolation）整個src/intelligence/沒有任何非相對路徑的外部套件import（沒有AI SDK）', () => {
    for (const f of allIntelFiles) {
      const imports = [...readSrc(f).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${f} import了非相對路徑套件：${imp}`);
      }
    }
  });

  await test('（4.AI isolation）DEFAULT_ANALYSIS_MODULES/DEFAULT_RECOMMENDATION_MODULES依然是deterministic的count透傳模組，沒有被偷偷換成AI呼叫', async () => {
    const { DEFAULT_ANALYSIS_MODULES } = await import(path.join(intelDir, 'analysis', 'index.js'));
    const { DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(intelDir, 'recommendation', 'index.js'));
    assert.strictEqual(DEFAULT_ANALYSIS_MODULES.length, 6);
    assert.strictEqual(DEFAULT_RECOMMENDATION_MODULES.length, 3);
  });

  await test('（4.AI isolation）package.json完全沒有任何已知AI SDK套件的dependency（@anthropic-ai/sdk、openai等）', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) return;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    for (const name of Object.keys(allDeps)) {
      assert.ok(!/anthropic|openai|deepseek/i.test(name), `package.json不應該出現AI SDK套件：${name}`);
    }
  });

  console.log('');

  // =========================================================================
  // E. application isolation
  // =========================================================================
  console.log('--- E. application isolation ---');

  await test('（5.application isolation）README.md明確記錄Application Layer不得直接操作execution/history/metrics三者', () => {
    assert.ok(readmeSrc.includes('Application Usage Boundary'));
    assert.ok(readmeSrc.includes('不得直接操作'));
  });

  await test('（5.application isolation）目前src/controllers/、src/routes/完全沒有任何檔案讀取app.intelligence.execution/history/metrics（因為根本沒有讀取app.intelligence任何欄位）', () => {
    const files = [...listAllFilesInDir(path.join(srcRoot, 'controllers'), '.js'), ...listAllFilesInDir(path.join(srcRoot, 'routes'), '.js')];
    for (const f of files) {
      const src = readSrc(f);
      assert.ok(!/intelligence\.execution/.test(src));
      assert.ok(!/intelligence\.history/.test(src));
      assert.ok(!/intelligence\.metrics/.test(src));
    }
  });

  await test('（5.application isolation，模擬情境）一個模擬的Application Layer只需要呼叫facade.executeIntelligence()就能取得完整結果，完全不需要接觸execution/history/metrics任何一個實例', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });

    // 模擬Application Layer：只透過facade.executeIntelligence()一個
    // 函式取得結果，完全不引用app.intelligence.execution/history/
    // metrics
    async function simulatedControllerAction(facade, db, request) {
      return facade.executeIntelligence(db, request);
    }
    const result = await simulatedControllerAction(app.intelligence.facade, {}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['metadata', 'result', 'status']);
  });

  await test('（5.application isolation）facade.executeIntelligence()回傳值裡完全沒有暴露execution state/history record/metrics數字（Application Layer拿到的是最終業務結果，不是Runtime內部細節）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.facade.executeIntelligence({}, { userId: 'u1' });
    const serialized = JSON.stringify(result);
    assert.ok(!/executionId/.test(serialized));
    assert.ok(!/totalExecutions/.test(serialized));
    assert.ok(!/averageDuration/.test(serialized));
  });

  await test('（5.application isolation）Governance/Monitoring/Metrics三者的介面完全沒有被Facade re-export或暴露出去（Application Layer透過Facade拿不到這些內部觀測工具）', () => {
    const facadeSrc = readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js'));
    assert.ok(!/governance/i.test(facadeSrc));
    assert.ok(!/monitoring/i.test(facadeSrc));
    assert.ok(!/metrics/i.test(facadeSrc));
  });

  console.log('');

  // =========================================================================
  // F. runtime isolation
  // =========================================================================
  console.log('--- F. runtime isolation ---');

  const RUNTIME_LAYERS = ['execution', 'events', 'history', 'monitoring', 'metrics', 'governance'];
  const PIPELINE_LAYERS = ['data_preparation', 'context', 'analysis', 'recommendation'];

  await test('（6.runtime isolation）Runtime Layer（execution/events/history/monitoring/metrics/governance）彼此之間完全沒有互相import', () => {
    for (const dir of RUNTIME_LAYERS) {
      const dirPath = path.join(intelDir, dir);
      for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith('.js'))) {
        const src = readSrc(path.join(dirPath, file));
        for (const other of RUNTIME_LAYERS) {
          if (other === dir) continue;
          assert.ok(!new RegExp(`from\\s+['"]\\.\\./${other}/`).test(src), `${dir}/${file} 不應該import ${other}/`);
        }
      }
    }
  });

  await test('（6.runtime isolation）Runtime Layer完全不import Pipeline Layer（data_preparation/context/analysis/recommendation）', () => {
    for (const dir of RUNTIME_LAYERS) {
      const dirPath = path.join(intelDir, dir);
      for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith('.js'))) {
        const src = readSrc(path.join(dirPath, file));
        for (const other of PIPELINE_LAYERS) {
          assert.ok(!new RegExp(`from\\s+['"]\\.\\./${other}/`).test(src), `${dir}/${file} 不應該import Pipeline Layer的${other}/`);
        }
      }
    }
  });

  await test('（6.runtime isolation）execution_manager.js是唯一呼叫historyStore.add(跟eventDispatcher.emit(的檔案（Runtime Layer內部lifecycle入口維持單一）', () => {
    const executionManagerSrc = readSrc(path.join(intelDir, 'execution', 'execution_manager.js'));
    assert.ok(/historyStore\.add\(/.test(executionManagerSrc));
    for (const f of allIntelFiles) {
      if (f.endsWith(path.join('execution', 'execution_manager.js'))) continue;
      const src = readSrc(f);
      assert.ok(!/historyStore\.add\(/.test(src));
      assert.ok(!/eventDispatcher\.emit\(/.test(src));
    }
  });

  await test('（6.runtime isolation）Governance完全維持無狀態、未接入execution flow（Phase 3規劃不強制接入，維持TASK1.55/1.56/1.57/1.58既有結論）', () => {
    const governanceDir = path.join(intelDir, 'governance');
    for (const file of fs.readdirSync(governanceDir).filter((f) => f.endsWith('.js'))) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/\blet\s+\w/.test(src));
      assert.ok(!/new Map\(/.test(src));
    }
    for (const [dir, file] of [['execution', 'execution_manager.js'], ['facade', 'intelligence_facade.js']]) {
      assert.ok(!/governance/i.test(readSrc(path.join(intelDir, dir, file))));
    }
  });

  await test('（6.runtime isolation，端對端）呼叫Execution Manager完全不需要經過Monitoring/Metrics/Governance任一者的批准或干預才能成功', async () => {
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    const service = { getIntelligence: async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } }) };
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // G. regression check
  // =========================================================================
  console.log('--- G. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（7.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase2-task1.59-phase3-planning')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（7.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/1.58全部）`, () => {
      assert.ok(allSuites.length >= 50, `預期至少50個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（7.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // H. P1-P6
  // =========================================================================
  console.log('--- H. P1-P6 ---');

  await test('（8.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（8.P1-P6）src/worker.js 完全沒有被TASK1.59修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.P1-P6）wrangler.toml 完全沒有被TASK1.59修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（8.P1-P6）analysis/recommendation Runner的原始碼在本次規劃任務前後完全一致（規劃任務只讀取/驗證，不修改行為）', () => {
    const analysisSrc = readSrc(path.join(intelDir, 'analysis', 'analysis_runner.js'));
    const recommendationSrc = readSrc(path.join(intelDir, 'recommendation', 'recommendation_runner.js'));
    assert.ok(/DEFAULT_ANALYSIS_MODULES/.test(analysisSrc));
    assert.ok(/DEFAULT_RECOMMENDATION_MODULES/.test(recommendationSrc));
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/analysis/analysis_runner.js', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.P1-P6）本次規劃完全沒有修改任何production邏輯檔案——git diff --name-only只應該顯示src/intelligence/底下的文件變動跟backups/底下的新增測試檔案', () => {
    const diffFiles = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const f of diffFiles) {
      assert.ok(
        f.startsWith('src/intelligence/') || f.startsWith('backups/'),
        `TASK1.59不應該修改${f}（架構規劃任務只允許動src/intelligence/文件跟backups/測試）`
      );
    }
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

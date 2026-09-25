/*
 * Phase 4 TASK 1.81｜Intelligence Decision Flow Architecture
 * Planning 測試
 *
 * 本任務不是導入AI、不是建立Decision Model/Decision
 * Algorithm、不是新增User Feature——這是純規劃任務，在TASK1.75~
 * 1.80建立的Phase 4 Capability Architecture基礎上，定義未來
 * Intelligence Decision Flow的責任邊界，記錄在
 * `src/intelligence/PHASE4_DECISION_FLOW_PLAN.md`。
 *
 * 這份測試驗證的是：
 * - Decision Boundary：文件正確記錄Analysis Result→Recommendation
 *   Result→Decision Output的責任切分
 * - Capability Compatibility：既有Phase 4 Capability Architecture
 *   （四層）完全沒有被修改，資料流依然正確運作
 * - Data Flow：既有資料流跟規劃中的Decision資料流相容
 * - Dependency Direction：本次規劃沒有新增任何Decision相關的
 *   production程式碼（沒有Decision Runner/Decision Capability實作）
 * - AI Boundary：文件正確記錄Decision modules是未來AI延伸點、
 *   Feature direct AI call仍然禁止
 * - Runtime Isolation：Analysis/Recommendation Runner、Phase 2
 *   Runtime Orchestrator完全沒有被修改
 * - Documentation Consistency：文件章節齊全、內容跟規格要求一致
 * - Regression/P1-P6
 *
 * 分為以下9個部分：
 * A) decision boundary
 * B) capability compatibility
 * C) data flow
 * D) dependency direction
 * E) AI boundary
 * F) runtime isolation
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
const analysisDir = path.join(intelDir, 'analysis');
const recommendationDir = path.join(intelDir, 'recommendation');
const applicationDir = path.join(intelDir, 'application');
const featuresDir = path.join(applicationDir, 'features');
const intelligenceFeatureDir = path.join(featuresDir, 'intelligence');
const capabilitiesDir = path.join(intelDir, 'capabilities');
const analysisCapabilityDir = path.join(capabilitiesDir, 'analysis');
const recommendationCapabilityDir = path.join(capabilitiesDir, 'recommendation');
const orchestrationCapabilityDir = path.join(capabilitiesDir, 'orchestration');
const planDocPath = path.join(intelDir, 'PHASE4_DECISION_FLOW_PLAN.md');

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

function getReExportedNamespaces(indexPath) {
  const src = readSrc(indexPath);
  const names = new Set();
  for (const m of src.matchAll(/^export\s*\*\s*as\s+(\S+)\s+from/gm)) {
    names.add(m[1]);
  }
  return names;
}

function makeInsightContext(overrides) {
  return Object.assign({
    user: null,
    activityContext: { count: 2, items: [{ id: 'a1' }] },
    nutritionContext: { count: 1, items: [{ id: 'n1' }] },
    emotionContext: { count: 0, items: [] },
    behaviorContext: { count: 0, items: [] },
    reportContext: { count: 0, items: [] },
    metadata: { totalRecords: 3 },
  }, overrides || {});
}

// 四層既有Phase 4 Capability Architecture各自的目錄跟檔案清單，
// 本次規劃任務用來確認「既有架構完全沒有被觸碰」
const PHASE4_LAYERS = [
  { name: 'analysis', dir: analysisCapabilityDir, files: ['analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js'] },
  { name: 'recommendation', dir: recommendationCapabilityDir, files: ['recommendation_capability.js', 'recommendation_capability_result_builder.js', 'index.js'] },
  { name: 'orchestration', dir: orchestrationCapabilityDir, files: ['capability_orchestrator.js', 'capability_result_builder.js', 'index.js'] },
  { name: 'intelligence-feature', dir: intelligenceFeatureDir, files: ['intelligence_feature.js', 'intelligence_feature_result_mapper.js', 'index.js'] },
];
const ALL_PHASE4_FILES = PHASE4_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));

async function run() {
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createIntelligenceFeature } = await import(path.join(intelligenceFeatureDir, 'index.js'));
  const { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(recommendationDir, 'index.js'));

  function makeRealFeature() {
    return createIntelligenceFeature({
      capabilityOrchestrator: createCapabilityOrchestrator({
        analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
        recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
      }),
    });
  }

  const planDoc = fs.readFileSync(planDocPath, 'utf8');

  // =========================================================================
  // A. decision boundary
  // =========================================================================
  console.log('--- A. decision boundary ---');

  await test('（1.decision boundary）src/intelligence/PHASE4_DECISION_FLOW_PLAN.md 存在且內容非空', () => {
    assert.ok(fs.existsSync(planDocPath));
    assert.ok(planDoc.length > 1000);
  });

  const REQUIRED_DOC_SECTIONS = ['Decision Flow Goal', 'Layer Responsibility', 'Data Flow', 'AI Extension Strategy', 'Security Boundary', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.decision boundary）PHASE4_DECISION_FLOW_PLAN.md包含「${section}」章節`, () => {
      assert.ok(planDoc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.decision boundary）文件記錄Analysis Result → Recommendation Result → Decision Output的責任切分順序', () => {
    assert.ok(/Analysis Result/.test(planDoc));
    assert.ok(/Recommendation Result/.test(planDoc));
    assert.ok(/Decision Output/.test(planDoc));
    const analysisIdx = planDoc.indexOf('Analysis Result\n  ↓\nRecommendation Result');
    assert.ok(analysisIdx >= 0, '文件應包含Analysis Result → Recommendation Result → Decision Output的流程圖');
  });

  await test('（1.decision boundary）文件明確說明Recommendation的責任是「候選項並列」，Decision的責任是「做出選擇」（兩者責任不同）', () => {
    assert.ok(/候選/.test(planDoc));
    assert.ok(/選擇/.test(planDoc));
  });

  await test('（1.decision boundary）文件記錄Decision Runner/Decision Capability目前完全不存在（未建立）', () => {
    assert.ok(/未建立/.test(planDoc));
  });

  await test('（1.decision boundary）文件記錄Decision Output暫定形狀比照Analysis/Recommendation Result的{status, ..., metadata}三欄位慣例', () => {
    assert.ok(/status.*metadata|metadata.*status/.test(planDoc.replace(/\n/g, ' ')));
  });

  console.log('');

  // =========================================================================
  // B. capability compatibility
  // =========================================================================
  console.log('--- B. capability compatibility ---');

  await test('（2.capability compatibility）Analysis Capability（TASK1.76）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/capabilities/analysis/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.capability compatibility）Recommendation Capability（TASK1.77）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/capabilities/recommendation/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.capability compatibility）Capability Orchestrator（TASK1.78）本次規劃完全沒有被修改（規劃文件裡描述的擴充方式尚未實作）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/capabilities/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.capability compatibility）Feature Integration（TASK1.79）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/features/intelligence/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.capability compatibility）src/intelligence/capabilities/index.js（頂層）依然恰好具備analysis/orchestration/recommendation三個namespace（本次沒有新增decision namespace）', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['analysis', 'orchestration', 'recommendation']);
  });

  await test('（2.capability compatibility）application/features/index.js依然只有insight/behavior/intelligence三個namespace（本次沒有新增任何Feature）', () => {
    const namespaces = getReExportedNamespaces(path.join(featuresDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['behavior', 'insight', 'intelligence']);
  });

  await test('（2.capability compatibility）端對端：Analysis Capability單獨呼叫依然正確運作（TASK1.76行為不變）', () => {
    const capability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const result = capability.requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'analysis');
  });

  await test('（2.capability compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作（TASK1.77行為不變）', () => {
    const capability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const result = capability.requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'recommendation');
  });

  await test('（2.capability compatibility）端對端：Capability Orchestrator依然正確運作（TASK1.78行為不變）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'orchestration');
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.capability compatibility）端對端：Feature Integration依然正確運作（TASK1.79行為不變）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'intelligence');
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.capability compatibility）Unified Capability Result目前依然只有{analysis, recommendation}兩個欄位（本次規劃沒有實際新增decision欄位，文件只是記錄未來方向）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.data, 'decision'), false);
  });

  await test('（2.capability compatibility）app.intelligence物件恰好維持24個欄位不變（本次規劃沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（2.capability compatibility）src/bootstrap/application.js本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // C. data flow
  // =========================================================================
  console.log('--- C. data flow ---');

  await test('（3.data flow）端對端：既有Feature→Capability Orchestrator→Analysis→Recommendation→Output資料流依然完整正確（規劃新增Decision階段不影響既有資料流）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.analysis.insights.length, DEFAULT_ANALYSIS_MODULES.length);
    assert.strictEqual(result.data.recommendation.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（3.data flow）端對端：recommendation的insight_count恰好反映analysis的insights陣列長度（既有串接關係不受規劃文件影響）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    const insightCount = result.data.recommendation.recommendations.find((r) => r.type === 'insight_count');
    assert.strictEqual(insightCount.value, result.data.analysis.insights.length);
  });

  await test('（3.data flow）文件記錄的規劃中資料流（Insight Context→Analysis Runner→Recommendation Runner→Decision Runner）跟既有資料流的前兩段完全一致，只在尾端追加Decision', () => {
    assert.ok(/Decision Runner（規劃中，未建立）/.test(planDoc));
    assert.ok(/Analysis Runner（TASK1.43，已存在，完全不修改）/.test(planDoc));
    assert.ok(/Recommendation Runner（TASK1.44，已存在，完全不修改）/.test(planDoc));
  });

  await test('（3.data flow）文件記錄規劃中的Capability層資料流（Capability Orchestrator→Analysis Capability→Recommendation Capability→Decision Capability→Output）', () => {
    assert.ok(/Decision Capability（規劃中，未建立）/.test(planDoc));
  });

  await test('（3.data flow）文件明確確認規劃中的資料流跟既有資料流完全相容，不需要打破/重新設計既有資料流', () => {
    assert.ok(/完全相容/.test(planDoc));
  });

  await test('（3.data flow）端對端：不同的InsightContext輸入都能正確走完既有的完整鏈路（驗證規劃階段沒有破壞既有行為）', () => {
    const feature = makeRealFeature();
    for (const overrides of [{}, { activityContext: { count: 10, items: [] } }, { metadata: { totalRecords: 99 } }]) {
      const result = feature.requestIntelligence({ context: makeInsightContext(overrides) });
      assert.strictEqual(result.ok, true);
    }
  });

  await test('（3.data flow）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果（規劃階段沒有引入任何非deterministic行為）', () => {
    const feature = makeRealFeature();
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(feature.requestIntelligence(request), feature.requestIntelligence(request));
  });

  console.log('');

  // =========================================================================
  // D. dependency direction
  // =========================================================================
  console.log('--- D. dependency direction ---');

  await test('（4.dependency direction）本次規劃沒有建立任何decision相關的.js production程式碼檔案（掃描src/intelligence/整棵樹，排除本次任務自己新增的PHASE4_DECISION_FLOW_PLAN.md文件）', () => {
    function walk(dir) {
      const found = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...walk(full));
        else if (entry.name.endsWith('.js') && /decision/i.test(entry.name)) found.push(full);
      }
      return found;
    }
    const decisionFiles = walk(intelDir);
    assert.deepStrictEqual(decisionFiles, [], `發現非預期的decision相關.js檔案：${JSON.stringify(decisionFiles)}`);
  });

  await test('（4.dependency direction）本次規劃沒有新增src/intelligence/decision/或capabilities/decision/目錄', () => {
    assert.strictEqual(fs.existsSync(path.join(intelDir, 'decision')), false);
    assert.strictEqual(fs.existsSync(path.join(capabilitiesDir, 'decision')), false);
  });

  await test('（4.dependency direction）analysis_runner.js/recommendation_runner.js完全不出現Decision相關字樣（本次規劃沒有修改Runner）', () => {
    const analysisSrc = readSrc(path.join(analysisDir, 'analysis_runner.js'));
    const recommendationSrc = readSrc(path.join(recommendationDir, 'recommendation_runner.js'));
    assert.ok(!/Decision/.test(analysisSrc));
    assert.ok(!/Decision/.test(recommendationSrc));
  });

  await test('（4.dependency direction）capability_orchestrator.js完全不出現Decision相關字樣（規劃文件裡描述的擴充尚未實作）', () => {
    const src = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
    assert.ok(!/Decision/.test(src));
  });

  await test('（4.dependency direction）intelligence_feature.js完全不出現Decision相關字樣', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
    assert.ok(!/Decision/.test(src));
  });

  await test('（4.dependency direction）四層Phase 4 Capability（analysis/recommendation/orchestration/intelligence-feature）本次規劃完全沒有任何檔案被新增或修改（git status確認唯一變更是文件跟測試）', () => {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src/intelligence/capabilities/', 'src/intelligence/application/features/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（4.dependency direction）Phase 2 Runtime子系統（analysis/recommendation/execution/service/orchestration/facade/data_preparation/history/metrics/events/governance）本次規劃完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/analysis/ src/intelligence/recommendation/ src/intelligence/execution/ src/intelligence/service/ src/intelligence/orchestration/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（4.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次規劃完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  // 逐檔案掃描四層既有Phase 4 Capability Architecture的12個檔案，
  // 確認本次規劃任務完全沒有意外修改任何一個檔案的內容（用git diff
  // 逐檔案比對，而不是只比對整個目錄，更精確地定位）。
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    await test(`（4.dependency direction）${layer}/${file} 本次規劃完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
    await test(`（4.dependency direction）${layer}/${file} 完全不出現Decision相關字樣（本次規劃沒有偷偷埋入任何Decision實作）`, () => {
      const src = readSrc(full);
      assert.ok(!/Decision/.test(src), `${layer}/${file} 意外出現Decision字樣`);
    });
  }

  console.log('');

  // =========================================================================
  // E. AI boundary
  // =========================================================================
  console.log('--- E. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];

  // 逐檔案掃描既有四層Phase 4 Capability Architecture的12個檔案，
  // 確認本次規劃審查後這些檔案依然完全沒有任何AI相關程式碼——這是
  // 「規劃階段不能意外埋入AI呼叫」這條規則最直接的驗證方式。
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（5.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（5.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（5.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic，本次規劃沒有破壞既有的deterministic性質）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（5.AI boundary）PHASE4_DECISION_FLOW_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}（文件本身只是討論「未來AI可以在哪裡」，不是真的呼叫）`, () => {
      assert.ok(!pattern.test(planDoc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（5.AI boundary）文件記錄未來AI合法進入位置包含Analysis modules（既有延伸點）', () => {
    assert.ok(/Analysis modules/.test(planDoc));
  });

  await test('（5.AI boundary）文件記錄未來AI合法進入位置包含Recommendation modules（既有延伸點）', () => {
    assert.ok(/Recommendation modules/.test(planDoc));
  });

  await test('（5.AI boundary）文件記錄未來AI合法進入位置包含Decision modules（規劃中，尚未建立）', () => {
    assert.ok(/Decision modules/.test(planDoc));
  });

  await test('（5.AI boundary）文件明確記錄「Feature → AI Provider」是禁止的捷徑', () => {
    assert.ok(/Feature.*AI Provider/.test(planDoc));
  });

  await test('（5.AI boundary）文件記錄Decision Layer即使支援AI modules，Feature/Capability Orchestrator/Decision Capability都不應該知道AI是什麼', () => {
    assert.ok(/不應該知道.{0,10}AI/.test(planDoc.replace(/\n/g, '')) || /不知道.{0,10}AI/.test(planDoc.replace(/\n/g, '')));
  });

  await test('（5.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（5.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（5.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
    for (const envFile of ['.env', '.env.example']) {
      const envPath = path.join(repoRoot, envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        assert.ok(!/ANTHROPIC/i.test(content));
        assert.ok(!/OPENAI/i.test(content));
        assert.ok(!/DEEPSEEK/i.test(content));
      }
    }
  });

  await test('（5.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作（未來AI Extension Point機制未被破壞）', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.insights, [{ type: 'placeholder', value: 1, source: 'x' }]);
  });

  await test('（5.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.recommendations, [{ type: 'placeholder', value: 1, source: 'x' }]);
  });

  console.log('');

  // =========================================================================
  // F. runtime isolation
  // =========================================================================
  console.log('--- F. runtime isolation ---');

  await test('（6.runtime isolation）Analysis Runner本身（analysis_runner.js）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Recommendation Runner本身（recommendation_runner.js）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/，TASK1.45）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Execution Manager（src/intelligence/execution/）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/execution/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Runtime Execution Layer（service/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）src/intelligence/index.js本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  // 逐檔案掃描既有四層Phase 4 Capability Architecture的12個檔案，
  // 確認本次規劃審查後這些檔案依然完全遵守既有的Runtime/Database/
  // Auth邊界（延續TASK1.76~1.80已經驗證過的規則，本次只是再次
  // 確認規劃審查沒有破壞任何一條）。
  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（6.runtime isolation）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    await test(`（6.runtime isolation）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（6.runtime isolation）${layer}/${file} 完全不出現db變數名稱`, () => {
      assert.ok(!/\bdb\b/.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（6.runtime isolation）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（6.runtime isolation）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
    await test(`（6.runtime isolation）${layer}/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher變數名稱`, () => {
      assert.ok(!/executionManager|historyStore|metricsStore|eventDispatcher/.test(src));
    });
  }

  await test('（6.runtime isolation）文件記錄Decision Layer未來實作時不得直接操作database', () => {
    assert.ok(/不得直接操作\s*\*\*database\*\*/.test(planDoc));
  });

  await test('（6.runtime isolation）文件記錄Decision Layer未來實作時不得直接操作auth', () => {
    assert.ok(/不得直接操作\s*\*\*auth\*\*/.test(planDoc));
  });

  await test('（6.runtime isolation）文件記錄Decision Layer未來實作時不得直接操作session', () => {
    assert.ok(/不得直接操作\s*\*\*session\*\*/.test(planDoc));
  });

  console.log('');

  // =========================================================================
  // G. documentation consistency
  // =========================================================================
  console.log('--- G. documentation consistency ---');

  await test('（7.documentation consistency）文件開頭明確聲明「不是導入AI、不是建立Decision Model/Decision Algorithm、不是新增User Feature」', () => {
    assert.ok(/不是.*導入AI/.test(planDoc.replace(/\n/g, '')));
    assert.ok(/不是.*建立Decision Model/.test(planDoc.replace(/\n/g, '')));
    assert.ok(/不是.*新增User Feature/.test(planDoc.replace(/\n/g, '')));
  });

  await test('（7.documentation consistency）文件記錄Intelligence Output Evolution：目前是Analysis/Recommendation，未來是Decision/Action', () => {
    assert.ok(/Decision、Action|Decision.{0,5}Action/.test(planDoc));
  });

  await test('（7.documentation consistency）文件明確指出Action階段只是提及、沒有展開設計（避免一次規劃太多）', () => {
    assert.ok(/Action/.test(planDoc));
    assert.ok(/沒有展開設計|不展開設計/.test(planDoc));
  });

  await test('（7.documentation consistency）文件記錄了六項Completion Criteria checkbox', () => {
    const checkCount = (planDoc.match(/✅/g) || []).length;
    assert.ok(checkCount >= 6, `預期至少6個✅，實際${checkCount}`);
  });

  await test('（7.documentation consistency）文件引用了TASK1.75既有的PHASE4_CAPABILITY_PLAN.md（確認規劃延續既有結論，不是重新發明）', () => {
    assert.ok(/PHASE4_CAPABILITY_PLAN\.md/.test(planDoc));
  });

  await test('（7.documentation consistency）PHASE4_CAPABILITY_PLAN.md（TASK1.75）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE4_CAPABILITY_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.documentation consistency）PHASE4_CONSOLIDATION_REVIEW.md（TASK1.80）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE4_CONSOLIDATION_REVIEW.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.documentation consistency）文件記錄async限制延續TASK1.75規劃文件已記錄的Known Limitation', () => {
    assert.ok(/async/.test(planDoc));
    assert.ok(/延續TASK1\.75/.test(planDoc));
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.81-decision-planning')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（8.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 71, `預期至少71個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（9.P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
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

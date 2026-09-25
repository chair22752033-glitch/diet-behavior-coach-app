/*
 * Phase 5 TASK 1.90｜Phase 5 Product Integration Architecture
 * Planning 測試
 *
 * 本任務不是導入AI、不是實作Decision Logic——這是Phase 5第一個
 * 任務，純Architecture Planning，規劃Phase 4 Intelligence
 * Capability Architecture如何跟真正的Product Application Layer
 * 整合，記錄在
 * `src/intelligence/PHASE5_PRODUCT_INTEGRATION_PLAN.md`，本次
 * **不修改**任何production程式碼、**不實作**任何路由/Feature接線。
 *
 * 這份測試驗證的是：
 * - Architecture Consistency：User Application→Intelligence
 *   Feature→Capability Layer→Runtime四層責任邊界正確、跟既有
 *   Phase 1~4架構一致
 * - Application Boundary：Request/Response/Error Boundary規劃
 *   跟既有Feature Intelligence Integration/Capability
 *   Orchestrator的既有形狀一致
 * - Feature Flow：Insight/Behavior既有路徑完全不受影響，
 *   Intelligence Capability依然是「已建立但未接線」狀態
 * - Capability Compatibility：Phase 4整條Capability Chain依然
 *   正確運作
 * - Dependency Direction：本次規劃沒有新增任何production依賴
 * - AI Boundary：本次規劃沒有導入任何AI SDK
 * - Documentation Consistency：文件章節齊全、內容跟規格要求一致
 * - Regression/P1-P6
 *
 * 分為以下9個部分：
 * A) architecture consistency
 * B) application boundary
 * C) feature flow
 * D) capability compatibility
 * E) dependency direction
 * F) AI boundary
 * G) documentation consistency
 * H) regression validation
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
const insightFeatureDir = path.join(featuresDir, 'insight');
const behaviorFeatureDir = path.join(featuresDir, 'behavior');
const capabilitiesDir = path.join(intelDir, 'capabilities');
const analysisCapabilityDir = path.join(capabilitiesDir, 'analysis');
const recommendationCapabilityDir = path.join(capabilitiesDir, 'recommendation');
const orchestrationCapabilityDir = path.join(capabilitiesDir, 'orchestration');
const decisionCapabilityDir = path.join(capabilitiesDir, 'decision');
const docPath = path.join(intelDir, 'PHASE5_PRODUCT_INTEGRATION_PLAN.md');

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

function makeRecommendationResult(overrides) {
  return Object.assign({
    status: 'recommendation_ready',
    recommendations: [{ type: 'x', value: 1, source: 'y' }],
    metadata: { version: '1.0.0' },
  }, overrides || {});
}

const PHASE4_LAYERS = [
  { name: 'analysis', dir: analysisCapabilityDir, files: ['analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js'] },
  { name: 'recommendation', dir: recommendationCapabilityDir, files: ['recommendation_capability.js', 'recommendation_capability_result_builder.js', 'index.js'] },
  { name: 'orchestration', dir: orchestrationCapabilityDir, files: ['capability_orchestrator.js', 'capability_result_builder.js', 'index.js'] },
  { name: 'decision', dir: decisionCapabilityDir, files: ['decision_capability.js', 'decision_result_builder.js', 'index.js'] },
  { name: 'intelligence-feature', dir: intelligenceFeatureDir, files: ['intelligence_feature.js', 'intelligence_feature_result_mapper.js', 'index.js'] },
];
const ALL_PHASE4_FILES = PHASE4_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));

async function run() {
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createDecisionCapability } = await import(path.join(decisionCapabilityDir, 'index.js'));
  const { createIntelligenceFeature } = await import(path.join(intelligenceFeatureDir, 'index.js'));
  const { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(recommendationDir, 'index.js'));

  function makeRealAnalysisCapability() {
    return createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
  }
  function makeRealRecommendationCapability() {
    return createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
  }
  function makeRealDecisionCapability() {
    return createDecisionCapability();
  }
  function makeRealFeature() {
    return createIntelligenceFeature({
      capabilityOrchestrator: createCapabilityOrchestrator({
        analysisCapability: makeRealAnalysisCapability(),
        recommendationCapability: makeRealRecommendationCapability(),
      }),
    });
  }

  const doc = fs.readFileSync(docPath, 'utf8');
  const flatDoc = doc.replace(/\n/g, ' ');
  const orchestratorSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
  const resultBuilderSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_result_builder.js'));
  const decisionCapabilitySrc = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
  const featureSrc = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));

  // =========================================================================
  // A. architecture consistency
  // =========================================================================
  console.log('--- A. architecture consistency ---');

  const REQUIRED_DOC_SECTIONS = ['Product Integration Goal', 'Architecture Boundary', 'Feature Flow', 'API Strategy', 'Phase 5 Roadmap', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.architecture consistency）PHASE5_PRODUCT_INTEGRATION_PLAN.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.architecture consistency）文件記錄四層責任邊界圖：User Application → Intelligence Feature → Capability Layer → Runtime', () => {
    assert.ok(/User Application/.test(doc));
    assert.ok(/Intelligence Feature/.test(doc));
    assert.ok(/Capability Layer/.test(doc));
    assert.ok(/Runtime/.test(doc));
  });

  await test('（1.architecture consistency）文件記錄現況：Feature Intelligence Integration「已建立但未接線」', () => {
    assert.ok(/已建立但未接線/.test(doc) || /已存在但未接線/.test(doc));
  });

  await test('（1.architecture consistency）文件明確聲明「本次任務的產出是規劃文件，不是程式碼變更」', () => {
    assert.ok(/規劃文件.{0,10}不是程式碼變更/.test(flatDoc));
  });

  await test('（1.architecture consistency）src/intelligence/目錄結構跟文件描述的四層一致（capabilities/、application/features/存在）', () => {
    assert.ok(fs.existsSync(capabilitiesDir));
    assert.ok(fs.existsSync(featuresDir));
    assert.ok(fs.existsSync(analysisDir));
    assert.ok(fs.existsSync(recommendationDir));
  });

  await test('（1.architecture consistency）application/features/index.js恰好具備insight/behavior/intelligence三個namespace（跟文件描述的三種Feature一致）', () => {
    const namespaces = getReExportedNamespaces(path.join(featuresDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['behavior', 'insight', 'intelligence']);
  });

  await test('（1.architecture consistency）capabilities/index.js恰好具備analysis/recommendation/orchestration/decision四個namespace', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['analysis', 'decision', 'orchestration', 'recommendation']);
  });

  await test('（1.architecture consistency）insight/behavior Feature目錄確實存在（文件描述的既有Feature Flow基礎）', () => {
    assert.ok(fs.existsSync(insightFeatureDir));
    assert.ok(fs.existsSync(behaviorFeatureDir));
  });

  console.log('');

  // =========================================================================
  // B. application boundary
  // =========================================================================
  console.log('--- B. application boundary ---');

  await test('（2.application boundary）文件記錄Request Boundary：HTTP request → Insight Context → Capability request的轉換方向', () => {
    assert.ok(/Request Boundary/.test(doc));
    assert.ok(/HTTP request/.test(doc));
  });

  await test('（2.application boundary）文件記錄Response Boundary：沿用Feature Intelligence Integration既有的{ok, feature, data}形狀', () => {
    assert.ok(/Response Boundary/.test(doc));
    assert.ok(/feature:'intelligence'/.test(doc));
  });

  await test('（2.application boundary）文件記錄Error Boundary：{ok:false, reason, field?, stage?}既有失敗形狀不變', () => {
    assert.ok(/Error Boundary/.test(doc));
    assert.ok(/ok:false/.test(doc));
  });

  await test('（2.application boundary）端對端：Feature Intelligence Integration的成功回傳形狀恰好是{ok, feature, data}（跟文件Response Boundary描述一致）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'feature', 'ok']);
    assert.strictEqual(result.feature, 'intelligence');
  });

  await test('（2.application boundary）端對端：Capability Orchestrator失敗時的回傳形狀恰好是{ok, capability, reason, field?, stage?}的子集（跟文件Error Boundary描述一致）', () => {
    const orchestrator = createCapabilityOrchestrator({});
    const result = orchestrator.requestCapabilityFlow(null);
    assert.strictEqual(result.ok, false);
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'reason'));
  });

  await test('（2.application boundary）文件明確指出Request/Response轉換邏輯「目前完全不存在」，是Product Integration落地時才需要新增的部分', () => {
    assert.ok(/目前完全不存在/.test(doc));
  });

  await test('（2.application boundary）文件明確指出HTTP status code對照表「目前不存在」', () => {
    assert.ok(/對照表.{0,20}(不存在|未建立)/.test(flatDoc));
  });

  console.log('');

  // =========================================================================
  // C. feature flow
  // =========================================================================
  console.log('--- C. feature flow ---');

  await test('（3.feature flow）文件記錄Insight（既有）的Feature Flow「不改變」', () => {
    assert.ok(/Insight（既有/.test(doc));
    assert.ok(/不改變|不變/.test(doc));
  });

  await test('（3.feature flow）文件記錄Behavior（既有）的Feature Flow「不改變」', () => {
    assert.ok(/Behavior（既有/.test(doc));
  });

  await test('（3.feature flow）文件記錄Intelligence Capability規劃中的Feature Flow圖（未來Route → requestIntelligence → Capability Orchestrator）', () => {
    assert.ok(/requestIntelligence/.test(doc));
    assert.ok(/Capability Orchestrator/.test(doc));
  });

  await test('（3.feature flow）文件明確說明規劃的Flow「跟Insight/Behavior的Flow平行存在、互不依賴」', () => {
    assert.ok(/平行存在/.test(doc));
    assert.ok(/互不依賴/.test(doc));
  });

  await test('（3.feature flow）端對端：Insight Feature依然正確運作（本次規劃沒有影響既有Insight Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（3.feature flow）端對端：Behavior Feature依然正確運作（本次規劃沒有影響既有Behavior Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（3.feature flow）端對端：Intelligence Capability Flow（規劃中要接線的部分）目前依然可以獨立運作、正確產生data', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  await test('（3.feature flow）Feature Intelligence Integration（TASK1.79，intelligence_feature.js）依然可以被獨立import並建立（本次規劃沒有把它接進app.intelligence，維持「已建立但未接線」現況）', async () => {
    const { createIntelligenceFeature } = await import(path.join(intelligenceFeatureDir, 'index.js'));
    assert.strictEqual(typeof createIntelligenceFeature, 'function');
    const feature = createIntelligenceFeature({
      capabilityOrchestrator: createCapabilityOrchestrator({
        analysisCapability: makeRealAnalysisCapability(),
        recommendationCapability: makeRealRecommendationCapability(),
      }),
    });
    assert.strictEqual(typeof feature.requestIntelligence, 'function');
  });

  console.log('');

  // =========================================================================
  // D. capability compatibility
  // =========================================================================
  console.log('--- D. capability compatibility ---');

  await test('（4.capability compatibility）端對端：Analysis Capability單獨呼叫依然正確運作', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（4.capability compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（4.capability compatibility）端對端：Decision Capability單獨呼叫依然正確運作', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.decision, null);
  });

  await test('（4.capability compatibility）端對端：Capability Orchestrator提供decisionCapability時正確組出三欄位結果', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
  });

  await test('（4.capability compatibility）端對端：Capability Orchestrator不提供decisionCapability時依然只回傳兩欄位（Backward Compatibility保持）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（4.capability compatibility）端對端：完整Chain（Analysis→Recommendation→Decision）依然可以串接成功', () => {
    const a = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    const r = makeRealRecommendationCapability().requestRecommendation({ analysisResult: a.result });
    const d = makeRealDecisionCapability().requestDecision({ recommendationResult: r.result });
    assert.strictEqual(a.ok, true);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(d.ok, true);
  });

  await test('（4.capability compatibility）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const feature = makeRealFeature();
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(feature.requestIntelligence(request), feature.requestIntelligence(request));
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（4.capability compatibility）${layer.name} 目錄恰好包含規格要求的檔案（本次規劃沒有新增/刪除任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  console.log('');

  // =========================================================================
  // E. dependency direction
  // =========================================================================
  console.log('--- E. dependency direction ---');

  await test('（5.dependency direction）app.intelligence物件恰好維持24個欄位不變（本次規劃沒有新增任何bootstrap欄位，沒有實作Product Integration接線）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（5.dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.dependency direction）src/routes/目錄本次任務完全沒有新增任何檔案（沒有實作新路由）', () => {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src/routes/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（5.dependency direction）src/controllers/目錄本次任務完全沒有新增任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（5.dependency direction）四層既有Phase 4 Capability（analysis/recommendation/orchestration/decision）本次任務完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（5.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    await test(`（5.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
    const src = readSrc(full);
    await test(`（5.dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（5.dependency direction）${layer}/${file} 完全不出現db變數名稱`, () => {
      assert.ok(!/\bdb\b/.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（5.dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（5.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（5.dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

  console.log('');

  // =========================================================================
  // F. AI boundary
  // =========================================================================
  console.log('--- F. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（6.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（6.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（6.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（6.AI boundary）PHASE5_PRODUCT_INTEGRATION_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
      assert.ok(!pattern.test(doc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（6.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（6.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（6.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（6.AI boundary）文件記錄的Future AI Capability方向延續TASK1.89 AI Integration Timing的判斷（Product Integration是四個前提條件之一）', () => {
    assert.ok(/Future AI Capability/.test(doc));
    assert.ok(/AI Integration\s*Timing/.test(flatDoc));
  });

  await test('（6.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
  });

  await test('（6.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // G. documentation consistency
  // =========================================================================
  console.log('--- G. documentation consistency ---');

  await test('（7.documentation consistency）src/intelligence/PHASE5_PRODUCT_INTEGRATION_PLAN.md 存在且內容非空', () => {
    assert.ok(fs.existsSync(docPath));
    assert.ok(doc.length > 2000);
  });

  await test('（7.documentation consistency）文件開頭明確聲明「不是導入AI、不是實作Decision Logic」', () => {
    assert.ok(/不是.{0,10}導入AI/.test(flatDoc));
    assert.ok(/不是.{0,15}實作Decision\s*Logic/.test(flatDoc));
  });

  await test('（7.documentation consistency）文件記錄了跨Phase的任務序列（Phase 1~5）', () => {
    assert.ok(/Phase 1 Foundation/.test(doc));
    assert.ok(/Phase 2 Intelligence Runtime Foundation/.test(doc));
    assert.ok(/Phase 3 Intelligence Application Layer/.test(doc));
    assert.ok(/Phase 4 Intelligence Capability Architecture/.test(doc));
    assert.ok(/Phase 5 Product Integration/.test(doc));
  });

  await test('（7.documentation consistency）文件記錄Phase 5 Roadmap四個方向：Product Integration/Operational Readiness/Intelligence Enhancement/Future AI Capability', () => {
    assert.ok(/Product Integration/.test(doc));
    assert.ok(/Operational Readiness/.test(doc));
    assert.ok(/Intelligence Enhancement/.test(doc));
    assert.ok(/Future AI Capability/.test(doc));
  });

  await test('（7.documentation consistency）文件引用了TASK1.89的Phase 5 Direction作為延續基礎', () => {
    assert.ok(/TASK1\.89/.test(doc));
  });

  await test('（7.documentation consistency）文件記錄了七項或以上的Completion Criteria確認（✅）', () => {
    const checkCount = (doc.match(/✅/g) || []).length;
    assert.ok(checkCount >= 7, `預期至少7個✅，實際${checkCount}`);
  });

  await test('（7.documentation consistency）文件記錄async限制延續TASK1.75~1.89已記錄的Known Limitation', () => {
    assert.ok(/async/.test(doc));
  });

  await test('（7.documentation consistency）文件明確指出本次任務沒有變更任何既有production程式碼', () => {
    assert.ok(/沒有變更任何既有production程式碼|完全沒有變更任何production程式碼/.test(doc));
  });

  await test('（7.documentation consistency）文件引用了PHASE4_DECISION_CONTRACT_PLAN.md的Contract結論延續', () => {
    assert.ok(/PHASE4_DECISION_CONTRACT_PLAN\.md/.test(doc));
  });

  await test('（7.documentation consistency）先前所有Phase 4規劃/審查文件本次任務完全沒有被修改', () => {
    const docs = [
      'PHASE4_CAPABILITY_PLAN.md', 'PHASE4_CONSOLIDATION_REVIEW.md', 'PHASE4_DECISION_FLOW_PLAN.md',
      'PHASE4_DECISION_CAPABILITY_REVIEW.md', 'PHASE4_DECISION_CONTRACT_PLAN.md', 'PHASE4_DECISION_INTEGRATION_PLAN.md',
      'PHASE4_DECISION_ORCHESTRATION_INTEGRATION.md', 'PHASE4_DECISION_OUTPUT_EVOLUTION.md', 'PHASE4_CAPABILITY_CONSOLIDATION_REVIEW.md',
      'PHASE4_FINAL_VALIDATION_AND_PHASE5_PLAN.md',
    ];
    for (const docName of docs) {
      const diff = execFileSync('git', ['diff', '--stat', `src/intelligence/${docName}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${docName} 不應該被本次任務修改`);
    }
  });

  console.log('');

  // =========================================================================
  // H. regression validation
  // =========================================================================
  console.log('--- H. regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（8.regression validation）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.90-product-integration')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（8.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 80, `預期至少80個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（8.regression validation）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

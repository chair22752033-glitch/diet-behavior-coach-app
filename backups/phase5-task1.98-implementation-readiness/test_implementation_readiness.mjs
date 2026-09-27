/*
 * Phase 5 TASK 1.98｜Phase 5 Product Integration Implementation
 * Preparation 測試
 *
 * 本任務不是實作Product Integration程式碼、不是建立API路由、
 * 不是導入AI——這是Preparation/Validation任務，在TASK1.90~1.97
 * 完成的Phase 5架構規劃基礎上，規劃從架構規劃過渡到受控實作的
 * 策略，記錄在
 * `src/intelligence/PHASE5_IMPLEMENTATION_READINESS_PLAN.md`，
 * 本次**不修改**任何production程式碼、**不建立**任何Entry/
 * Adapter/Execution/Operational Boundary程式碼。
 *
 * 這份測試驗證的是：
 * - Architecture Completeness：Phase 5八份文件（TASK1.90~1.97）
 *   皆完整存在
 * - Implementation Boundary：哪些邊界需要實作、哪些維持文件、
 *   實作順序、程式碼位置規劃、不建立不必要抽象原則
 * - Migration Strategy：漸進式實作方式、相容性策略
 * - Rollback Strategy：回滾優勢、獨立commit粒度
 * - Dependency Direction：本次規劃沒有新增任何production依賴
 * - Compatibility：Phase 4/既有Feature依然正確運作
 * - Risk Assessment：三類風險跟緩解方案
 * - AI Boundary：本次規劃沒有導入任何AI SDK
 * - Regression/P1-P6
 *
 * 分為以下10個部分：
 * A) architecture completeness
 * B) implementation boundary
 * C) migration strategy
 * D) rollback strategy
 * E) dependency direction
 * F) compatibility
 * G) risk assessment
 * H) AI boundary
 * I) regression validation
 * J) P1-P6
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
const decisionCapabilityDir = path.join(capabilitiesDir, 'decision');
const docPath = path.join(intelDir, 'PHASE5_IMPLEMENTATION_READINESS_PLAN.md');

const PHASE5_DOCS = [
  'PHASE5_PRODUCT_INTEGRATION_PLAN.md',
  'PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md',
  'PHASE5_PRODUCT_ADAPTER_PLAN.md',
  'PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md',
  'PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md',
  'PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md',
  'PHASE5_OPERATIONAL_BOUNDARY_PLAN.md',
  'PHASE5_PRODUCT_INTEGRATION_CONSOLIDATION_REVIEW.md',
];

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
  const featureSrc = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
  const orchestratorSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));

  // =========================================================================
  // A. architecture completeness
  // =========================================================================
  console.log('--- A. architecture completeness ---');

  for (const docName of PHASE5_DOCS) {
    await test(`（1.architecture completeness）src/intelligence/${docName}（Phase 5既有規劃/審查文件）存在且本次任務完全沒有被修改`, () => {
      const fullPath = path.join(intelDir, docName);
      assert.ok(fs.existsSync(fullPath), `${docName} 不存在`);
      const diff = execFileSync('git', ['diff', '--stat', `src/intelligence/${docName}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${docName} 不應該被本次任務修改`);
    });
  }

  const REQUIRED_DOC_SECTIONS = ['Current Architecture Snapshot', 'Implementation Boundary', 'Migration Strategy', 'Rollback Strategy', 'Risk Assessment', 'Implementation Roadmap', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.architecture completeness）PHASE5_IMPLEMENTATION_READINESS_PLAN.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.architecture completeness）文件記錄完整的規劃/落地/審查任務序列（TASK1.90~TASK1.98）', () => {
    for (const t of ['TASK1.90', 'TASK1.91', 'TASK1.92', 'TASK1.93', 'TASK1.94', 'TASK1.95', 'TASK1.96', 'TASK1.97', 'TASK1.98']) {
      assert.ok(doc.includes(t), `文件缺少任務序列引用：${t}`);
    }
  });

  await test('（1.architecture completeness）文件記錄Feature/Capability/Runtime三層已在Phase 3/Phase 4完全落地', () => {
    assert.ok(/已在Phase 3\/Phase 4\*{0,2}完全/.test(flatDoc));
  });

  await test('（1.architecture completeness）文件記錄Contract/Entry/Adapter/Execution Boundary/Operational Boundary五層目前只有文件', () => {
    assert.ok(/目前\*{0,2}只有文件/.test(flatDoc));
  });

  console.log('');

  // =========================================================================
  // B. implementation boundary
  // =========================================================================
  console.log('--- B. implementation boundary ---');

  await test('（2.implementation boundary）文件記錄Which Boundaries Require Implementation：五個邊界最終都需要對應實作程式碼', () => {
    assert.ok(/Which Boundaries Require Implementation/.test(doc));
  });

  await test('（2.implementation boundary）文件記錄Which Boundaries Remain Documentation Only：Contract跟Operational Boundary可能永遠維持純文件', () => {
    assert.ok(/Which Boundaries Remain Documentation Only/.test(doc));
    assert.ok(/可能永遠\*{0,2}不需要/.test(flatDoc));
  });

  await test('（2.implementation boundary）文件記錄Implementation Order：Entry+Adapter優先，Operational Boundary可延後', () => {
    assert.ok(/Implementation Order/.test(doc));
    assert.ok(/最小必要\s*路徑/.test(flatDoc));
  });

  await test('（2.implementation boundary）文件記錄Code Boundary Planning：Product Entry歸屬既有routes/controllers，不需要新建獨立頂層目錄', () => {
    assert.ok(/Code Boundary Planning/.test(doc));
    assert.ok(/不需要\*{0,2}新建一個獨立的\s*頂層目錄/.test(flatDoc));
  });

  await test('（2.implementation boundary）文件記錄Adapter規劃上是src/intelligence/底下新增的獨立目錄', () => {
    assert.ok(/`src\/intelligence\/`底下\*{0,2}新增\*{0,2}的一個\s*獨立目錄/.test(flatDoc));
  });

  await test('（2.implementation boundary）文件記錄Execution/Operational Boundary規劃上不需要獨立的檔案，是Adapter內部函式', () => {
    assert.ok(/不需要\*{0,2}獨立的檔案/.test(flatDoc));
  });

  await test('（2.implementation boundary）文件記錄No Unnecessary Abstraction原則：不應該變成獨立的class/interface/抽象層', () => {
    assert.ok(/No Unnecessary Abstraction/.test(doc));
    assert.ok(/不應該\*{0,2}變成獨立的class\/\s*interface/.test(flatDoc));
  });

  await test('（2.implementation boundary）文件明確說明文件分層只是概念上的邊界，不是強制的程式碼結構要求', () => {
    assert.ok(/概念上\*{0,2}的邊界/.test(flatDoc));
    assert.ok(/強制的程式碼結構\*{0,2}要求/.test(flatDoc));
  });

  console.log('');

  // =========================================================================
  // C. migration strategy
  // =========================================================================
  console.log('--- C. migration strategy ---');

  await test('（3.migration strategy）文件記錄Incremental Implementation Approach：先建立骨架、再補驗證邏輯、最後才考慮接路由', () => {
    assert.ok(/Incremental Implementation Approach/.test(doc));
    assert.ok(/骨架/.test(doc));
  });

  await test('（3.migration strategy）文件記錄每一步都應該是獨立可驗證、可回滾的', () => {
    assert.ok(/獨立可驗證、\s*可回滾/.test(flatDoc));
  });

  await test('（3.migration strategy）文件記錄Compatibility Strategy：每一步實作必須保持Feature/Capability既有行為完全不變', () => {
    assert.ok(/Compatibility Strategy/.test(doc));
    assert.ok(/必須\*{0,2}保持Feature\s*Intelligence/.test(flatDoc));
  });

  await test('（3.migration strategy）文件引用TASK1.78/1.86已建立的Backward Compatibility保證跟TASK1.86選填依賴注入模式', () => {
    assert.ok(/TASK1\.78\/1\.86/.test(doc));
    assert.ok(/TASK1\.86\s*已經驗證過的選填依賴注入模式/.test(flatDoc));
  });

  await test('（3.migration strategy）端對端：Feature Intelligence Integration依然恰好接受{context, options?}形狀（Migration Strategy的相容性基礎）', () => {
    const feature = makeRealFeature();
    assert.doesNotThrow(() => feature.requestIntelligence({ context: makeInsightContext() }));
  });

  await test('（3.migration strategy）端對端：Capability Orchestrator不提供decisionCapability時依然只回傳兩欄位（Backward Compatibility依然成立）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  console.log('');

  // =========================================================================
  // D. rollback strategy
  // =========================================================================
  console.log('--- D. rollback strategy ---');

  await test('（4.rollback strategy）文件記錄每一步應該是獨立git commit，可單獨revert', () => {
    assert.ok(/獨立的git\s*commit/.test(flatDoc));
  });

  await test('（4.rollback strategy）文件記錄Entry/Adapter是新增的程式碼，最壞情況回滾就是刪除新增的檔案', () => {
    assert.ok(/新增\*{0,2}的程式碼（不修改既有檔案）/.test(flatDoc));
    assert.ok(/刪除新增\*{0,2}的檔案/.test(flatDoc));
  });

  await test('（4.rollback strategy）文件記錄"規劃先行、新增優先於修改"的天然回滾優勢', () => {
    assert.ok(/新增優先於修改/.test(doc));
    assert.ok(/天然回滾優勢/.test(doc));
  });

  await test('（4.rollback strategy）文件記錄Contract/Operational Boundary若不需要落地，回滾成本為零', () => {
    assert.ok(/成本為零/.test(doc));
  });

  console.log('');

  // =========================================================================
  // E. dependency direction
  // =========================================================================
  console.log('--- E. dependency direction ---');

  await test('（5.dependency direction）app.intelligence物件恰好維持24個欄位不變（本次規劃沒有新增任何bootstrap欄位）', async () => {
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

  await test('（5.dependency direction）src/routes/、src/controllers/目錄本次任務完全沒有新增或修改任何檔案（沒有建立API路由）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/routes/ src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（5.dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
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

  await test('（TASK1.99後更新）（5.dependency direction）TASK1.98自己的commit（ad6bff7）沒有建立任何新目錄（例如src/intelligence/product/）——注意：TASK1.99之後這個目錄已經合法存在（Product Entry Boundary Minimal Implementation），這裡改用git show檢查TASK1.98自己的commit內容，而不是檢查目錄現在是否存在，避免誤判後續任務的合法擴充為本次任務的回歸', () => {
    const filesInCommit = execFileSync('git', ['show', '--name-only', '--pretty=format:', 'ad6bff7'], { cwd: repoRoot, encoding: 'utf8' });
    assert.ok(!filesInCommit.split('\n').some((f) => f.startsWith('src/intelligence/product/')));
  });

  await test('（5.dependency direction）本次任務沒有建立任何.d.ts/JSON Schema型別定義檔案', () => {
    function walk(dir) {
      const found = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...walk(full));
        else if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.schema.json')) found.push(full);
      }
      return found;
    }
    const found = walk(intelDir);
    assert.deepStrictEqual(found, [], `發現非預期的型別定義檔案：${JSON.stringify(found)}`);
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
  // F. compatibility
  // =========================================================================
  console.log('--- F. compatibility ---');

  await test('（6.compatibility）端對端：Analysis Capability單獨呼叫依然正確運作', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（6.compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（6.compatibility）端對端：Decision Capability單獨呼叫依然正確運作', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
  });

  await test('（6.compatibility）端對端：完整Chain（Analysis→Recommendation→Decision）依然可以串接成功', () => {
    const a = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    const r = makeRealRecommendationCapability().requestRecommendation({ analysisResult: a.result });
    const d = makeRealDecisionCapability().requestDecision({ recommendationResult: r.result });
    assert.strictEqual(a.ok, true);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(d.ok, true);
  });

  await test('（6.compatibility）端對端：Capability Orchestrator提供decisionCapability時正確組出三欄位結果', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
  });

  await test('（6.compatibility）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const feature = makeRealFeature();
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(feature.requestIntelligence(request), feature.requestIntelligence(request));
  });

  await test('（6.compatibility）端對端：Insight Feature依然正確運作（本次規劃沒有影響既有Insight Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（6.compatibility）端對端：Behavior Feature依然正確運作（本次規劃沒有影響既有Behavior Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（6.compatibility）intelligence_feature.js完全不出現HTTP相關字樣（維持"No HTTP"邊界）', () => {
    assert.ok(!/\bRequest\b/.test(featureSrc));
    assert.ok(!/\bResponse\b/.test(featureSrc));
    assert.ok(!/\bhttp\b/i.test(featureSrc));
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（6.compatibility）${layer.name} 目錄恰好包含規格要求的檔案（本次規劃沒有新增/刪除任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  console.log('');

  // =========================================================================
  // G. risk assessment
  // =========================================================================
  console.log('--- G. risk assessment ---');

  await test('（7.risk assessment）文件記錄三類風險：Dependency Risks/Integration Risks/Backward Compatibility Risks', () => {
    assert.ok(/Dependency Risks/.test(doc));
    assert.ok(/Integration Risks/.test(doc));
    assert.ok(/Backward Compatibility Risks/.test(doc));
  });

  await test('（7.risk assessment）文件記錄Dependency Risks的緩解方案：延續既有依賴掃描模式', () => {
    assert.ok(/依賴掃描模式/.test(doc));
  });

  await test('（7.risk assessment）文件記錄Integration Risks的緩解方案：漸進式方式驗證邊界情況', () => {
    assert.ok(/不要求一次到位/.test(doc));
  });

  await test('（7.risk assessment）文件記錄Backward Compatibility Risks的緩解方案：對照Version Strategy判準', () => {
    assert.ok(/而不是憑感覺判斷是否安全/.test(doc));
  });

  await test('（7.risk assessment）文件記錄Risk總結：三類風險都有對應的既有規劃或既有模式可以緩解', () => {
    assert.ok(/Risk總結/.test(doc));
    assert.ok(/都有對應的既有規劃或既有模式可以緩解/.test(doc));
  });

  await test('（7.risk assessment）文件明確引用TASK1.97 Consolidation Review的"架構規劃已完備"結論作為風險評估的延伸驗證', () => {
    assert.ok(/架構規劃已完備/.test(doc));
  });

  console.log('');

  // =========================================================================
  // H. AI boundary
  // =========================================================================
  console.log('--- H. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（8.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（8.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（8.AI boundary）PHASE5_IMPLEMENTATION_READINESS_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
      assert.ok(!pattern.test(doc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（8.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（8.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（8.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（8.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
  });

  await test('（8.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // I. regression validation
  // =========================================================================
  console.log('--- I. regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（9.regression validation）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.98-implementation-readiness')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 88, `預期至少88個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（9.regression validation）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // J. P1-P6
  // =========================================================================
  console.log('--- J. P1-P6 ---');

  await test('（10.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（10.P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（10.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

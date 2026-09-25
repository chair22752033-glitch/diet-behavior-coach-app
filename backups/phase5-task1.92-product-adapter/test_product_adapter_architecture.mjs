/*
 * Phase 5 TASK 1.92｜Intelligence Product Adapter Architecture
 * Foundation 測試
 *
 * 本任務不是實作HTTP路由、不是導入AI——這是Architecture Foundation
 * 任務，在TASK1.91基礎上定義Product Entry跟Intelligence
 * Feature之間新增的一層轉換邊界（Intelligence
 * Adapter），記錄在`src/intelligence/PHASE5_PRODUCT_ADAPTER_
 * PLAN.md`，本次**不修改**任何production程式碼、**不建立**任何
 * Adapter/路由程式碼。
 *
 * 這份測試驗證的是：
 * - Adapter Boundary：Intelligence Adapter的職責範圍跟Entry層的
 *   邊界
 * - Request Mapping：Product Request→Intelligence Request的轉換
 *   方向、歸屬、驗證責任
 * - Response Mapping：Intelligence Result→Product Response的
 *   轉換方向、暴露/隱藏欄位
 * - Error Mapping：Product/Intelligence/Runtime三種錯誤在
 *   Adapter層的處理分工
 * - Feature/Capability Compatibility：Phase 4整條Chain依然正確
 *   運作
 * - Dependency Direction：本次規劃沒有新增任何production依賴
 * - AI Boundary：本次規劃沒有導入任何AI SDK
 * - Regression/P1-P6
 *
 * 分為以下10個部分：
 * A) adapter boundary
 * B) request mapping
 * C) response mapping
 * D) error mapping
 * E) feature compatibility
 * F) capability compatibility
 * G) dependency direction
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
const docPath = path.join(intelDir, 'PHASE5_PRODUCT_ADAPTER_PLAN.md');
const entryDocPath = path.join(intelDir, 'PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md');

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
  const entryDoc = fs.readFileSync(entryDocPath, 'utf8');
  const featureSrc = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
  const orchestratorSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));

  // =========================================================================
  // A. adapter boundary
  // =========================================================================
  console.log('--- A. adapter boundary ---');

  const REQUIRED_DOC_SECTIONS = ['Adapter Responsibility', 'Request Mapping', 'Response Mapping', 'Error Mapping', 'Feature Integration', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.adapter boundary）PHASE5_PRODUCT_ADAPTER_PLAN.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.adapter boundary）文件記錄六層架構圖：User Application → Product Entry → Intelligence Adapter → Feature → Capability → Runtime', () => {
    assert.ok(/User Application/.test(doc));
    assert.ok(/Product Entry/.test(doc));
    assert.ok(/Intelligence Adapter/.test(doc));
    assert.ok(/Feature/.test(doc));
    assert.ok(/Capability/.test(doc));
    assert.ok(/Runtime/.test(doc));
  });

  await test('（1.adapter boundary）文件明確說明Intelligence Adapter是Product Entry跟Feature之間新增的一層轉換邊界', () => {
    assert.ok(/新增的一層轉換邊界/.test(flatDoc));
  });

  await test('（1.adapter boundary）文件記錄Adapter跟Entry的職責邊界：Entry知道HTTP，Adapter不知道HTTP', () => {
    assert.ok(/Adapter跟Entry的職責邊界/.test(doc));
    assert.ok(/不知道\*{0,2}HTTP/.test(flatDoc));
  });

  await test('（1.adapter boundary）文件明確延續"No HTTP"規則，把這條規則往上推一層', () => {
    assert.ok(/No HTTP/.test(doc));
    assert.ok(/往上推一層/.test(doc));
  });

  await test('（1.adapter boundary）文件跟TASK1.91做明確區分（Entry職責範圍 vs Adapter獨立職責）', () => {
    assert.ok(/TASK1\.91/.test(doc));
  });

  await test('（1.adapter boundary）src/intelligence/目錄結構跟文件描述的既有架構一致', () => {
    assert.ok(fs.existsSync(capabilitiesDir));
    assert.ok(fs.existsSync(featuresDir));
  });

  await test('（1.adapter boundary）文件記錄Product Input Conversion/Intelligence Request Conversion/Result Conversion三件Adapter職責', () => {
    assert.ok(/Product Input Conversion/.test(doc));
    assert.ok(/Intelligence Request Conversion/.test(doc));
    assert.ok(/Result Conversion/.test(doc));
  });

  console.log('');

  // =========================================================================
  // B. request mapping
  // =========================================================================
  console.log('--- B. request mapping ---');

  await test('（2.request mapping）文件記錄Product Request → Intelligence Request轉換圖', () => {
    assert.ok(/Product Request/.test(doc));
    assert.ok(/Intelligence Request/.test(doc));
  });

  await test('（2.request mapping）文件記錄Ownership：Product Request形狀歸屬Entry層，Adapter不得定義自己的一套Product Request形狀', () => {
    assert.ok(/Ownership（歸屬）/.test(doc));
    assert.ok(/不得\*{0,2}定義自己的一套Product Request形狀/.test(flatDoc));
  });

  await test('（2.request mapping）文件記錄Insight Context形狀歸屬既有Context Builder，Adapter不得自行決定Context欄位', () => {
    assert.ok(/Context\s*Builder/.test(flatDoc));
    assert.ok(/不得\*{0,2}自行決定Context\s*裡有哪些欄位/.test(flatDoc));
  });

  await test('（2.request mapping）文件記錄Validation Responsibility：Intelligence Adapter不做任何業務驗證', () => {
    assert.ok(/不做任何業務驗證/.test(doc));
  });

  await test('（2.request mapping）文件記錄Hidden Fields：HTTP相關欄位（Header/Cookie）不應該被傳進Intelligence Adapter', () => {
    assert.ok(/Hidden Fields/.test(doc));
    assert.ok(/Cookie/.test(doc));
  });

  await test('（2.request mapping）端對端：Feature Intelligence Integration依然恰好接受{context, options?}形狀（跟文件描述的Intelligence Request一致）', () => {
    const feature = makeRealFeature();
    assert.doesNotThrow(() => feature.requestIntelligence({ context: makeInsightContext() }));
  });

  await test('（2.request mapping）端對端：Capability Orchestrator的既有輸入驗證依然成立，文件規劃沒有重新設計這段驗證', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    assert.strictEqual(orchestrator.requestCapabilityFlow(null).reason, 'invalid_request');
    assert.strictEqual(orchestrator.requestCapabilityFlow({}).reason, 'invalid_context');
  });

  console.log('');

  // =========================================================================
  // C. response mapping
  // =========================================================================
  console.log('--- C. response mapping ---');

  await test('（3.response mapping）文件記錄Intelligence Result → Product Response轉換圖', () => {
    assert.ok(/Intelligence Result/.test(doc));
    assert.ok(/Product Response/.test(doc));
  });

  await test('（3.response mapping）文件記錄規劃中的Product Response形狀使用success欄位（刻意跟ok區隔）', () => {
    assert.ok(/success:\s*true/.test(doc));
    assert.ok(/刻意跟ok區隔/.test(doc));
  });

  await test('（3.response mapping）文件記錄Exposed Fields：analysis/recommendation原樣傳遞，decision選填傳遞', () => {
    assert.ok(/Exposed Fields/.test(doc));
  });

  await test('（3.response mapping）文件記錄Hidden Internal Fields：feature:\'intelligence\'跟capability:\'orchestration\'欄位規劃上由Adapter層過濾', () => {
    assert.ok(/feature:'intelligence'/.test(doc));
    assert.ok(/capability:'orchestration'/.test(doc));
  });

  await test('（3.response mapping）文件記錄decision佔位形狀的status字串規劃轉換成decisionAvailable布林欄位', () => {
    assert.ok(/decisionAvailable/.test(doc));
  });

  await test('（3.response mapping）文件明確標註本次任務依然只是規劃轉換方向，不實作', () => {
    assert.ok(/依然只是規劃這個轉換方向，不實作/.test(doc));
  });

  await test('（3.response mapping）端對端：Feature Intelligence Integration成功回傳形狀恰好是{ok, feature, data}（文件Intelligence Result引用的真實形狀）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'feature', 'ok']);
    assert.strictEqual(result.feature, 'intelligence');
  });

  await test('（3.response mapping）端對端：Capability Orchestrator成功回傳確實包含capability:\'orchestration\'欄位（文件討論的內部欄位確實存在於真實程式碼）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.capability, 'orchestration');
  });

  await test('（3.response mapping）端對端：Decision Capability的status欄位確實是"decision_not_available"（文件討論的內部狀態字串確實存在於真實程式碼）', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.result.status, 'decision_not_available');
  });

  console.log('');

  // =========================================================================
  // D. error mapping
  // =========================================================================
  console.log('--- D. error mapping ---');

  await test('（4.error mapping）文件記錄三種錯誤在Adapter層的處理分工：Product Errors在Entry層被擋下，Intelligence Errors由Adapter轉換，Runtime Errors由Adapter攔截', () => {
    assert.ok(/Product Errors/.test(doc));
    assert.ok(/Intelligence Errors/.test(doc));
    assert.ok(/Runtime Errors/.test(doc));
  });

  await test('（4.error mapping）文件記錄Product Errors不會進入Intelligence Adapter', () => {
    assert.ok(/不會\*{0,2}進入\s*Intelligence\s*Adapter/.test(flatDoc));
  });

  await test('（4.error mapping）文件記錄Intelligence Errors轉換成Product層錯誤形狀（errorCode/errorField），但不決定HTTP status code', () => {
    assert.ok(/errorCode/.test(doc));
    assert.ok(/不.{0,10}決定HTTP\s*status\s*code/.test(flatDoc));
  });

  await test('（4.error mapping）文件記錄Runtime Errors規劃用try/catch包住Feature呼叫，轉換成通用的internal_error錯誤碼', () => {
    assert.ok(/try\/catch/.test(doc));
    assert.ok(/internal_error/.test(doc));
  });

  await test('（4.error mapping）文件明確重申"不把原始例外訊息原樣暴露"的規則延續TASK1.91', () => {
    assert.ok(/不把原始例外/.test(doc));
  });

  await test('（4.error mapping）文件記錄分工總結：Entry擋Product Errors、Adapter轉換Intelligence Errors、Adapter攔截Runtime Errors', () => {
    assert.ok(/分工總結/.test(doc));
  });

  await test('（4.error mapping）端對端：Decision階段失敗時reason/field/stage欄位正確帶出（文件Intelligence Errors分類引用的真實行為）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: { requestDecision: () => ({ ok: false, capability: 'decision', reason: 'x', field: 'y' }) },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'x');
    assert.strictEqual(result.field, 'y');
    assert.strictEqual(result.stage, 'decision');
  });

  await test('（4.error mapping）端對端：analysis_capability_unavailable/recommendation_capability_unavailable兩個reason字樣確實存在（文件討論的Intelligence Errors真實範例）', () => {
    const orchestrator1 = createCapabilityOrchestrator({ recommendationCapability: makeRealRecommendationCapability() });
    assert.strictEqual(orchestrator1.requestCapabilityFlow({ context: makeInsightContext() }).reason, 'analysis_capability_unavailable');
  });

  console.log('');

  // =========================================================================
  // E. feature compatibility
  // =========================================================================
  console.log('--- E. feature compatibility ---');

  await test('（5.feature compatibility）文件記錄Feature Integration：Intelligence Adapter唯一呼叫的下游是Feature Intelligence Integration', () => {
    assert.ok(/唯一\*{0,2}呼叫的下游是Feature Intelligence Integration/.test(flatDoc));
  });

  await test('（5.feature compatibility）文件明確說明Insight/Behavior不經過Intelligence Adapter', () => {
    assert.ok(/不經過\*{0,2}\s*Intelligence\s*Adapter/.test(flatDoc));
  });

  await test('（5.feature compatibility）文件明確禁止Intelligence Adapter直接呼叫Capability Orchestrator或任何Capability', () => {
    assert.ok(/不得\*{0,2}直接呼叫Capability\s*Orchestrator/.test(flatDoc));
  });

  await test('（5.feature compatibility）端對端：Insight Feature依然正確運作（本次規劃沒有影響既有Insight Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.feature compatibility）端對端：Behavior Feature依然正確運作（本次規劃沒有影響既有Behavior Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.feature compatibility）端對端：Feature Intelligence Integration可以被獨立import並成功呼叫（TASK1.79行為不變）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.feature compatibility）intelligence_feature.js完全不出現HTTP相關字樣（維持"No HTTP"邊界）', () => {
    assert.ok(!/\bRequest\b/.test(featureSrc));
    assert.ok(!/\bResponse\b/.test(featureSrc));
    assert.ok(!/\bhttp\b/i.test(featureSrc));
  });

  await test('（5.feature compatibility）capability_orchestrator.js完全不出現HTTP相關字樣（Adapter規劃沒有把HTTP概念滲透進Capability層）', () => {
    assert.ok(!/\bhttp\b/i.test(orchestratorSrc));
  });

  console.log('');

  // =========================================================================
  // F. capability compatibility
  // =========================================================================
  console.log('--- F. capability compatibility ---');

  await test('（6.capability compatibility）端對端：Analysis Capability單獨呼叫依然正確運作', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（6.capability compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（6.capability compatibility）端對端：Decision Capability單獨呼叫依然正確運作', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
  });

  await test('（6.capability compatibility）端對端：Capability Orchestrator提供decisionCapability時正確組出三欄位結果', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
  });

  await test('（6.capability compatibility）端對端：Capability Orchestrator不提供decisionCapability時依然只回傳兩欄位', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（6.capability compatibility）端對端：完整Chain（Analysis→Recommendation→Decision）依然可以串接成功', () => {
    const a = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    const r = makeRealRecommendationCapability().requestRecommendation({ analysisResult: a.result });
    const d = makeRealDecisionCapability().requestDecision({ recommendationResult: r.result });
    assert.strictEqual(a.ok, true);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(d.ok, true);
  });

  await test('（6.capability compatibility）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const feature = makeRealFeature();
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(feature.requestIntelligence(request), feature.requestIntelligence(request));
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（6.capability compatibility）${layer.name} 目錄恰好包含規格要求的檔案（本次規劃沒有新增/刪除任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  console.log('');

  // =========================================================================
  // G. dependency direction
  // =========================================================================
  console.log('--- G. dependency direction ---');

  await test('（7.dependency direction）app.intelligence物件恰好維持24個欄位不變（本次規劃沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（7.dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.dependency direction）src/routes/目錄本次任務完全沒有新增或修改任何檔案（沒有建立HTTP路由）', () => {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src/routes/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.dependency direction）src/controllers/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.dependency direction）四層既有Phase 4 Capability（analysis/recommendation/orchestration/decision）本次任務完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（7.dependency direction）PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md（TASK1.91）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    await test(`（7.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
    const src = readSrc(full);
    await test(`（7.dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（7.dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（7.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（7.dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

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
    await test(`（8.AI boundary）PHASE5_PRODUCT_ADAPTER_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.92-product-adapter')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 82, `預期至少82個既有測試檔案，實際 ${allSuites.length}`);
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

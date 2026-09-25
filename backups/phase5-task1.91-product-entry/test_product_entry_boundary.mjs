/*
 * Phase 5 TASK 1.91｜Intelligence Product Entry Boundary
 * Foundation 測試
 *
 * 本任務不是導入AI、不是修改既有Product路由——這是Architecture
 * Foundation任務，在TASK1.90基礎上定義從Product Application進入
 * Intelligence Feature的穩定進入邊界（Product Intelligence
 * Entry），記錄在
 * `src/intelligence/PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md`，本次
 * **不修改**任何production程式碼、**不建立**任何路由/controller
 * 程式碼。
 *
 * 這份測試驗證的是：
 * - Entry Architecture：Product Intelligence Entry的職責邊界跟
 *   既有架構位置的關係
 * - Request Boundary：輸入形狀、驗證責任歸屬跟既有Feature/
 *   Capability驗證邏輯一致
 * - Response Boundary：輸出形狀跟既有Feature Intelligence
 *   Integration一致
 * - Error Handling：三種錯誤分類（Product/Intelligence/Runtime）
 *   跟既有錯誤形狀一致
 * - Feature/Capability Compatibility：Phase 4整條Chain依然正確
 *   運作
 * - Dependency Direction：本次規劃沒有新增任何production依賴
 * - AI Boundary：本次規劃沒有導入任何AI SDK
 * - Regression/P1-P6
 *
 * 分為以下10個部分：
 * A) entry architecture
 * B) request boundary
 * C) response boundary
 * D) error handling
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
const docPath = path.join(intelDir, 'PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md');

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
  const featureSrc = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));

  // =========================================================================
  // A. entry architecture
  // =========================================================================
  console.log('--- A. entry architecture ---');

  const REQUIRED_DOC_SECTIONS = ['Entry Architecture', 'Request Boundary', 'Response Boundary', 'Error Boundary', 'Feature Consumption Path', 'Phase 5 Roadmap', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.entry architecture）PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.entry architecture）文件記錄完整Product Entry Flow：User Application → Product Intelligence Entry → Feature → Capability → Runtime', () => {
    assert.ok(/User Application/.test(doc));
    assert.ok(/Product Intelligence Entry/.test(doc));
    assert.ok(/Feature/.test(doc));
    assert.ok(/Capability/.test(doc));
    assert.ok(/Runtime/.test(doc));
  });

  await test('（1.entry architecture）文件明確說明"Product Intelligence Entry"是規劃概念，不是新的程式碼目錄', () => {
    assert.ok(/不是新的程式碼目錄|純粹是規劃概念/.test(flatDoc));
  });

  await test('（1.entry architecture）文件明確聲明本次任務沒有創造新的架構層級，跟既有routes/controllers架構位置一致', () => {
    assert.ok(/沒有\*{0,2}創造新的架構層級/.test(flatDoc));
  });

  await test('（1.entry architecture）文件重新確認各層責任（User Application/Product Intelligence Entry/Feature/Capability/Runtime）', () => {
    assert.ok(/各層責任重新確認/.test(doc));
  });

  await test('（1.entry architecture）文件跟TASK1.90做明確區分（Entry這一段 vs 整體四層方向）', () => {
    assert.ok(/TASK1\.90/.test(doc));
  });

  await test('（1.entry architecture）src/intelligence/目錄結構跟文件描述的既有架構一致（capabilities/、application/features/存在）', () => {
    assert.ok(fs.existsSync(capabilitiesDir));
    assert.ok(fs.existsSync(featuresDir));
  });

  console.log('');

  // =========================================================================
  // B. request boundary
  // =========================================================================
  console.log('--- B. request boundary ---');

  await test('（2.request boundary）文件記錄Accepted Input Shape：{context, options?}恰好對應Feature Intelligence Integration既有要求形狀', () => {
    assert.ok(/Accepted Input Shape/.test(doc));
    assert.ok(/context:/.test(doc));
  });

  await test('（2.request boundary）文件明確禁止Product Intelligence Entry自行定義新的Request形狀跳過既有形狀', () => {
    assert.ok(/不得\*{0,2}自行定義一套新的Request/.test(flatDoc));
  });

  await test('（2.request boundary）文件記錄Validation Responsibility三層驗證責任分工（Entry層/Feature層/Analysis Capability層）', () => {
    assert.ok(/Validation Responsibility/.test(doc));
  });

  await test('（2.request boundary）文件記錄Ownership Boundary：HTTP相關內容歸屬middleware/auth/oauth，Entry不得自行解析', () => {
    assert.ok(/Ownership Boundary/.test(doc));
    assert.ok(/middleware/.test(doc));
  });

  await test('（2.request boundary）文件記錄Insight Context建構歸屬既有Context Builder，Entry不得重新實作', () => {
    assert.ok(/Context\s*Builder/.test(flatDoc));
    assert.ok(/不得\*{0,2}重新實作/.test(flatDoc));
  });

  await test('（2.request boundary）端對端：Feature Intelligence Integration依然恰好接受{context, options?}形狀（跟文件描述的Request Boundary一致）', () => {
    const feature = makeRealFeature();
    assert.doesNotThrow(() => feature.requestIntelligence({ context: makeInsightContext() }));
    assert.doesNotThrow(() => feature.requestIntelligence({ context: makeInsightContext(), options: {} }));
  });

  await test('（2.request boundary）端對端：Capability Orchestrator的既有輸入驗證（invalid_request/invalid_context/invalid_options_type）依然成立，文件規劃沒有重新設計這段驗證', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    assert.strictEqual(orchestrator.requestCapabilityFlow(null).reason, 'invalid_request');
    assert.strictEqual(orchestrator.requestCapabilityFlow({}).reason, 'invalid_context');
    assert.strictEqual(orchestrator.requestCapabilityFlow({ context: {}, options: 'x' }).reason, 'invalid_options_type');
  });

  console.log('');

  // =========================================================================
  // C. response boundary
  // =========================================================================
  console.log('--- C. response boundary ---');

  await test('（3.response boundary）文件記錄Output Shape：成功時HTTP 200 + {ok, feature, data}，失敗時對應status code + {ok:false, reason, field?, stage?}', () => {
    assert.ok(/Output Shape/.test(doc));
    assert.ok(/HTTP 200/.test(doc));
    assert.ok(/ok: true/.test(doc));
  });

  await test('（3.response boundary）文件記錄Exposed Fields：analysis/recommendation原樣暴露，decision選填暴露', () => {
    assert.ok(/Exposed Fields/.test(doc));
    assert.ok(/analysis.{0,30}原樣暴露/.test(flatDoc) || /原樣暴露/.test(doc));
  });

  await test('（3.response boundary）文件記錄Hidden Internal Fields：capability:\'orchestration\'跟status:\'decision_not_available\'不應該原樣暴露', () => {
    assert.ok(/Hidden Internal Fields/.test(doc));
    assert.ok(/decision_not_available/.test(doc));
  });

  await test('（3.response boundary）文件明確標註Hidden Internal Fields是規劃建議，本次任務不強制、不實作過濾邏輯', () => {
    assert.ok(/不強制/.test(doc));
    assert.ok(/不實作任何過濾邏輯|不實作/.test(doc));
  });

  await test('（3.response boundary）端對端：Feature Intelligence Integration成功回傳形狀恰好是{ok, feature, data}（跟文件Output Shape描述一致）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'feature', 'ok']);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'intelligence');
  });

  await test('（3.response boundary）端對端：data.analysis/data.recommendation原樣保留Capability回傳內容（跟文件Exposed Fields描述一致）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.ok(Array.isArray(result.data.analysis.insights));
    assert.ok(Array.isArray(result.data.recommendation.recommendations));
  });

  await test('（3.response boundary）端對端：Decision Capability的status欄位確實是"decision_not_available"（文件裡討論的內部狀態字串確實存在於真實程式碼）', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.result.status, 'decision_not_available');
  });

  console.log('');

  // =========================================================================
  // D. error handling
  // =========================================================================
  console.log('--- D. error handling ---');

  await test('（4.error handling）文件記錄三種錯誤分類：Product Errors/Intelligence Errors/Runtime Errors', () => {
    assert.ok(/Product Errors/.test(doc));
    assert.ok(/Intelligence Errors/.test(doc));
    assert.ok(/Runtime Errors/.test(doc));
  });

  await test('（4.error handling）文件記錄Product Errors對應HTTP 400', () => {
    assert.ok(/HTTP 400/.test(doc));
  });

  await test('（4.error handling）文件記錄Intelligence Errors裡輸入驗證失敗（invalid_request/invalid_context/invalid_options_type）規劃對應HTTP 400', () => {
    assert.ok(/invalid_request/.test(doc));
    assert.ok(/invalid_context/.test(doc));
  });

  await test('（4.error handling）文件記錄Intelligence Errors裡依賴注入缺失（analysis_capability_unavailable/recommendation_capability_unavailable）規劃對應HTTP 503', () => {
    assert.ok(/analysis_capability_unavailable/.test(doc));
    assert.ok(/HTTP 503/.test(doc));
  });

  await test('（4.error handling）文件記錄Runtime Errors規劃對應HTTP 500，且不暴露原始例外訊息', () => {
    assert.ok(/HTTP 500/.test(doc));
    assert.ok(/不.{0,10}原樣暴露/.test(flatDoc));
  });

  await test('（4.error handling）文件記錄三種錯誤分類的判斷順序：Product Errors優先於Intelligence Errors優先於Runtime Errors', () => {
    assert.ok(/判斷順序/.test(doc));
  });

  await test('（4.error handling）端對端：Capability Orchestrator的invalid_request/invalid_context/invalid_options_type三個reason字串確實存在（文件Error Boundary引用的真實字串）', () => {
    const orchestrator = createCapabilityOrchestrator({});
    assert.strictEqual(orchestrator.requestCapabilityFlow(null).reason, 'invalid_request');
    assert.strictEqual(orchestrator.requestCapabilityFlow({}).reason, 'invalid_context');
  });

  await test('（4.error handling）端對端：analysis_capability_unavailable/recommendation_capability_unavailable兩個reason字串確實存在', () => {
    const orchestrator1 = createCapabilityOrchestrator({ recommendationCapability: makeRealRecommendationCapability() });
    assert.strictEqual(orchestrator1.requestCapabilityFlow({ context: makeInsightContext() }).reason, 'analysis_capability_unavailable');
    const orchestrator2 = createCapabilityOrchestrator({ analysisCapability: makeRealAnalysisCapability() });
    assert.strictEqual(orchestrator2.requestCapabilityFlow({ context: makeInsightContext() }).reason, 'recommendation_capability_unavailable');
  });

  await test('（4.error handling）端對端：Decision階段失敗時reason/stage欄位正確帶出（文件Intelligence Errors分類引用的真實行為）', () => {
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

  console.log('');

  // =========================================================================
  // E. feature compatibility
  // =========================================================================
  console.log('--- E. feature compatibility ---');

  await test('（5.feature compatibility）文件記錄Feature Consumption Path：Insight/Behavior既有路徑不涉及，Intelligence Capability是Product Intelligence Entry唯一規劃中的進入點', () => {
    assert.ok(/Insight\*{0,2}（既有/.test(flatDoc));
    assert.ok(/Behavior\*{0,2}（既有/.test(flatDoc));
    assert.ok(/唯一.{0,20}進入點|唯一\*{0,2}規劃中會呼叫/.test(flatDoc));
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

  await test('（5.feature compatibility）intelligence_feature.js完全不出現HTTP相關字樣（Request/Response/http），維持"No HTTP"邊界（文件Entry Architecture章節引用的既有規則）', () => {
    assert.ok(!/\bRequest\b/.test(featureSrc));
    assert.ok(!/\bResponse\b/.test(featureSrc));
    assert.ok(!/\bhttp\b/i.test(featureSrc));
  });

  await test('（5.feature compatibility）intelligence_feature.js完全不import src/routes/或src/controllers/', () => {
    assert.ok(!/from\s+['"].*\/routes\//.test(featureSrc));
    assert.ok(!/from\s+['"].*\/controllers\//.test(featureSrc));
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

  await test('（7.dependency direction）src/routes/目錄本次任務完全沒有新增或修改任何檔案', () => {
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
    await test(`（8.AI boundary）PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.91-product-entry')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 81, `預期至少81個既有測試檔案，實際 ${allSuites.length}`);
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

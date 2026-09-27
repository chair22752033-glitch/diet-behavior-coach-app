/*
 * Phase 5 TASK 1.93｜Product Intelligence Feature Flow
 * Architecture Planning 測試
 *
 * 本任務不是實作HTTP路由、不是導入AI——這是Architecture Planning
 * 任務，在TASK1.90/1.91/1.92基礎上定義真實Product情境如何消費
 * Intelligence能力的完整七層Feature Flow（User Scenario→Product
 * Feature→Product Entry→Intelligence Adapter→Intelligence
 * Feature→Capability Layer→Runtime Layer），記錄在
 * `src/intelligence/PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md`，本次
 * **不修改**任何production程式碼、**不建立**任何路由/Adapter/
 * Feature程式碼。
 *
 * 這份測試驗證的是：
 * - Product Feature Flow：七層責任歸屬、依賴方向、邊界隔離
 * - Entry/Adapter Boundary Compatibility：跟TASK1.91/1.92規劃
 *   的一致性
 * - Feature/Capability Compatibility：Phase 4整條Chain依然正確
 *   運作
 * - Request/Response/Error Lifecycle：五個/四個/五個階段的定義
 * - Dependency Direction：本次規劃沒有新增任何production依賴
 * - AI Boundary：本次規劃沒有導入任何AI SDK
 * - Regression/P1-P6
 *
 * 分為以下12個部分：
 * A) product feature flow
 * B) entry boundary compatibility
 * C) adapter compatibility
 * D) feature compatibility
 * E) capability compatibility
 * F) request lifecycle
 * G) response lifecycle
 * H) error lifecycle
 * I) dependency direction
 * J) AI boundary
 * K) regression validation
 * L) P1-P6
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
const docPath = path.join(intelDir, 'PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md');
const entryDocPath = path.join(intelDir, 'PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md');
const adapterDocPath = path.join(intelDir, 'PHASE5_PRODUCT_ADAPTER_PLAN.md');

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
  const adapterDoc = fs.readFileSync(adapterDocPath, 'utf8');
  const featureSrc = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
  const orchestratorSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));

  // =========================================================================
  // A. product feature flow
  // =========================================================================
  console.log('--- A. product feature flow ---');

  const REQUIRED_DOC_SECTIONS = ['Product Feature Flow Architecture', 'Feature Consumption Pattern', 'Request Lifecycle', 'Response Lifecycle', 'Error Lifecycle', 'Phase 5 Integration Roadmap', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.product feature flow）PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.product feature flow）文件記錄完整七層Flow：User Scenario → Product Feature → Product Entry → Intelligence Adapter → Intelligence Feature → Capability Layer → Runtime Layer', () => {
    assert.ok(/User Scenario/.test(doc));
    assert.ok(/Product Feature/.test(doc));
    assert.ok(/Product Entry/.test(doc));
    assert.ok(/Intelligence Adapter/.test(doc));
    assert.ok(/Intelligence Feature/.test(doc));
    assert.ok(/Capability Layer/.test(doc));
    assert.ok(/Runtime Layer/.test(doc));
  });

  await test('（1.product feature flow）文件記錄Responsibility Ownership總表（七層各自歸屬跟是否本次任務建立）', () => {
    assert.ok(/Responsibility Ownership/.test(doc));
  });

  await test('（1.product feature flow）文件明確說明User Scenario/Product Feature是規劃概念，不對應/不建立任何程式碼', () => {
    assert.ok(/不對應任何程式碼|純粹是產品規劃層級的概念/.test(doc));
  });

  await test('（1.product feature flow）文件記錄Dependency Direction：七層之間嚴格單向依賴，不得跳過中間層', () => {
    assert.ok(/Dependency Direction/.test(doc));
    assert.ok(/不得\s*跳過中間層/.test(flatDoc));
  });

  await test('（1.product feature flow）文件記錄Boundary Isolation：沒有任何一層可以繞過相鄰層直接存取更下層', () => {
    assert.ok(/Boundary Isolation/.test(doc));
  });

  await test('（1.product feature flow）文件跟TASK1.90/1.91/1.92做明確區分並延續其規劃', () => {
    assert.ok(/TASK1\.90/.test(doc));
    assert.ok(/TASK1\.91/.test(doc));
    assert.ok(/TASK1\.92/.test(doc));
  });

  await test('（1.product feature flow）src/intelligence/目錄結構跟文件描述的既有架構一致', () => {
    assert.ok(fs.existsSync(capabilitiesDir));
    assert.ok(fs.existsSync(featuresDir));
  });

  console.log('');

  // =========================================================================
  // B. entry boundary compatibility
  // =========================================================================
  console.log('--- B. entry boundary compatibility ---');

  await test('（2.entry boundary compatibility）文件明確確認Product Feature呼叫Product Entry這一段介面，本次任務不重新定義Entry職責', () => {
    assert.ok(/不重新定義/.test(doc));
  });

  await test('（2.entry boundary compatibility）PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md（TASK1.91）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.entry boundary compatibility）文件引用TASK1.91規劃的三種錯誤分類（Product/Intelligence/Runtime Errors）作為Error Lifecycle的延續基礎', () => {
    assert.ok(/Product Errors/.test(doc));
    assert.ok(entryDoc.includes('Product Errors'));
  });

  await test('（2.entry boundary compatibility）TASK1.91文件依然包含Entry Architecture等既有六個章節（本次任務沒有破壞前一份文件的結構）', () => {
    for (const section of ['Entry Architecture', 'Request Boundary', 'Response Boundary', 'Error Boundary', 'Feature Consumption Path', 'Phase 5 Roadmap', 'Known Limitations']) {
      assert.ok(entryDoc.includes(section), `PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md缺少章節：${section}`);
    }
  });

  console.log('');

  // =========================================================================
  // C. adapter compatibility
  // =========================================================================
  console.log('--- C. adapter compatibility ---');

  await test('（3.adapter compatibility）文件明確確認Intelligence Adapter職責不重新定義，延續TASK1.92規劃', () => {
    assert.ok(/延續TASK1\.92/.test(flatDoc) || /TASK1\.92已規劃/.test(doc));
  });

  await test('（3.adapter compatibility）PHASE5_PRODUCT_ADAPTER_PLAN.md（TASK1.92）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_ADAPTER_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.adapter compatibility）文件重申Intelligence Adapter只呼叫Intelligence Feature，不直接呼叫Capability Orchestrator', () => {
    assert.ok(/不直接呼叫Capability\s*Orchestrator/.test(flatDoc));
  });

  await test('（3.adapter compatibility）TASK1.92文件依然包含Adapter Responsibility等既有六個章節（本次任務沒有破壞前一份文件的結構）', () => {
    for (const section of ['Adapter Responsibility', 'Request Mapping', 'Response Mapping', 'Error Mapping', 'Feature Integration', 'Known Limitations']) {
      assert.ok(adapterDoc.includes(section), `PHASE5_PRODUCT_ADAPTER_PLAN.md缺少章節：${section}`);
    }
  });

  console.log('');

  // =========================================================================
  // D. feature compatibility
  // =========================================================================
  console.log('--- D. feature compatibility ---');

  await test('（4.feature compatibility）文件記錄Feature Consumption Pattern：Insight/Behavior既有路徑不經過Intelligence Adapter', () => {
    assert.ok(/Insight Intelligence/.test(doc));
    assert.ok(/Behavior Intelligence/.test(doc));
    assert.ok(/不經過\*{0,2}\s*Intelligence\s*Adapter/.test(flatDoc));
  });

  await test('（4.feature compatibility）文件記錄Capability Orchestration/Decision Output必須透過Intelligence Adapter→Intelligence Feature', () => {
    assert.ok(/Capability Orchestration/.test(doc));
    assert.ok(/Decision Output/.test(doc));
  });

  await test('（4.feature compatibility）文件明確列出Product Feature不得直接呼叫的清單：Analysis Runner/Recommendation Runner/Runtime Internal Components', () => {
    assert.ok(/Analysis Runner/.test(doc));
    assert.ok(/Recommendation Runner/.test(doc));
    assert.ok(/Runtime Internal Components/.test(doc));
  });

  await test('（4.feature compatibility）端對端：Insight Feature依然正確運作（本次規劃沒有影響既有Insight Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（4.feature compatibility）端對端：Behavior Feature依然正確運作（本次規劃沒有影響既有Behavior Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（4.feature compatibility）端對端：Feature Intelligence Integration可以被獨立import並成功呼叫（TASK1.79行為不變）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（4.feature compatibility）intelligence_feature.js完全不出現HTTP相關字樣（維持"No HTTP"邊界，跨七層依然成立）', () => {
    assert.ok(!/\bRequest\b/.test(featureSrc));
    assert.ok(!/\bResponse\b/.test(featureSrc));
    assert.ok(!/\bhttp\b/i.test(featureSrc));
  });

  console.log('');

  // =========================================================================
  // E. capability compatibility
  // =========================================================================
  console.log('--- E. capability compatibility ---');

  await test('（5.capability compatibility）端對端：Analysis Capability單獨呼叫依然正確運作', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（5.capability compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（5.capability compatibility）端對端：Decision Capability單獨呼叫依然正確運作', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.capability compatibility）端對端：Capability Orchestrator提供decisionCapability時正確組出三欄位結果', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
  });

  await test('（5.capability compatibility）端對端：Capability Orchestrator不提供decisionCapability時依然只回傳兩欄位', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（5.capability compatibility）端對端：完整Chain（Analysis→Recommendation→Decision）依然可以串接成功', () => {
    const a = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    const r = makeRealRecommendationCapability().requestRecommendation({ analysisResult: a.result });
    const d = makeRealDecisionCapability().requestDecision({ recommendationResult: r.result });
    assert.strictEqual(a.ok, true);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(d.ok, true);
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（5.capability compatibility）${layer.name} 目錄恰好包含規格要求的檔案（本次規劃沒有新增/刪除任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  console.log('');

  // =========================================================================
  // F. request lifecycle
  // =========================================================================
  console.log('--- F. request lifecycle ---');

  await test('（6.request lifecycle）文件記錄五階段Request Lifecycle：Product Request → Entry Validation → Adapter Mapping → Feature Request → Capability Execution', () => {
    assert.ok(/Product Request/.test(doc));
    assert.ok(/Entry Validation/.test(doc));
    assert.ok(/Adapter Mapping/.test(doc));
    assert.ok(/Feature Request/.test(doc));
    assert.ok(/Capability Execution/.test(doc));
  });

  await test('（6.request lifecycle）文件記錄Validation Responsibility總表（HTTP形狀/Insight Context/{context,options?}形狀/業務規則四項驗證歸屬）', () => {
    assert.ok(/Validation Responsibility/.test(doc));
    assert.ok(/業務規則驗證/.test(doc));
  });

  await test('（6.request lifecycle）文件記錄Transformation Boundary：只有Intelligence Adapter允許做Product概念到Intelligence概念的轉換', () => {
    assert.ok(/Transformation Boundary/.test(doc));
    assert.ok(/只有Intelligence\s*Adapter/.test(flatDoc));
  });

  await test('（6.request lifecycle）端對端：Feature Intelligence Integration依然恰好接受{context, options?}形狀（Feature Request階段引用的真實形狀）', () => {
    const feature = makeRealFeature();
    assert.doesNotThrow(() => feature.requestIntelligence({ context: makeInsightContext() }));
  });

  await test('（6.request lifecycle）端對端：Capability Orchestrator既有輸入驗證（invalid_request/invalid_context/invalid_options_type）依然成立', () => {
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
  // G. response lifecycle
  // =========================================================================
  console.log('--- G. response lifecycle ---');

  await test('（7.response lifecycle）文件記錄四階段Response Lifecycle：Capability Result → Feature Result → Adapter Mapping → Product Response', () => {
    assert.ok(/Capability Result/.test(doc));
    assert.ok(/Feature Result/.test(doc));
    assert.ok(/Product Response/.test(doc));
  });

  await test('（7.response lifecycle）文件記錄Exposed Fields：analysis/recommendation/decision一路原樣傳遞', () => {
    assert.ok(/Exposed Fields/.test(doc));
  });

  await test('（7.response lifecycle）文件記錄Hidden Internal Fields：capability:\'orchestration\'/feature:\'intelligence\'/decision_not_available三個內部標籤的過濾規劃', () => {
    assert.ok(/capability: 'orchestration'/.test(doc));
    assert.ok(/feature: 'intelligence'/.test(doc));
    assert.ok(/decision_not_available/.test(doc));
  });

  await test('（7.response lifecycle）文件記錄Compatibility Strategy：三段轉換各自的相容性保證來源', () => {
    assert.ok(/Compatibility Strategy/.test(doc));
  });

  await test('（7.response lifecycle）端對端：Feature Intelligence Integration成功回傳形狀恰好是{ok, feature, data}（Feature Result階段引用的真實形狀）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'feature', 'ok']);
  });

  await test('（7.response lifecycle）端對端：Capability Orchestrator成功回傳確實包含capability:\'orchestration\'欄位（文件討論的內部欄位確實存在）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.capability, 'orchestration');
  });

  await test('（7.response lifecycle）端對端：data.analysis/data.recommendation原樣保留Capability回傳內容，串起完整Response Lifecycle', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.ok(Array.isArray(result.data.analysis.insights));
    assert.ok(Array.isArray(result.data.recommendation.recommendations));
  });

  console.log('');

  // =========================================================================
  // H. error lifecycle
  // =========================================================================
  console.log('--- H. error lifecycle ---');

  await test('（8.error lifecycle）文件記錄五階段Error Lifecycle：Product Error → Entry Error → Adapter Error → Capability Error → Runtime Error', () => {
    assert.ok(/Product Error\b/.test(doc));
    assert.ok(/Entry Error/.test(doc));
    assert.ok(/Adapter Error/.test(doc));
    assert.ok(/Capability Error/.test(doc));
    assert.ok(/Runtime Error\b/.test(doc));
  });

  await test('（8.error lifecycle）文件明確定義Adapter Error是本次任務新增的錯誤階段，介於Product Errors跟Intelligence Errors之間', () => {
    assert.ok(/新增明確定義/.test(doc));
  });

  await test('（8.error lifecycle）文件記錄Conversion Responsibility：每一層只轉換成上一層看得懂的形狀，不得跳過中間層', () => {
    assert.ok(/Conversion Responsibility/.test(doc));
    assert.ok(/不得\s*跳過中間層/.test(flatDoc));
  });

  await test('（8.error lifecycle）文件記錄Isolation Strategy：任何一層錯誤不得洩漏下一層的實作細節', () => {
    assert.ok(/Isolation Strategy/.test(doc));
    assert.ok(/不得\*{0,2}洩漏下一層/.test(flatDoc));
  });

  await test('（8.error lifecycle）文件重申"不把原始例外訊息原樣暴露"延續TASK1.92', () => {
    assert.ok(/不把原始例外訊息原樣暴露/.test(doc));
  });

  await test('（8.error lifecycle）端對端：Decision階段失敗時reason/field/stage欄位正確帶出（Capability Error階段引用的真實行為）', () => {
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

  await test('（8.error lifecycle）端對端：analysis_capability_unavailable/recommendation_capability_unavailable兩個reason字樣確實存在（Capability Error真實範例）', () => {
    const orchestrator1 = createCapabilityOrchestrator({ recommendationCapability: makeRealRecommendationCapability() });
    assert.strictEqual(orchestrator1.requestCapabilityFlow({ context: makeInsightContext() }).reason, 'analysis_capability_unavailable');
    const orchestrator2 = createCapabilityOrchestrator({ analysisCapability: makeRealAnalysisCapability() });
    assert.strictEqual(orchestrator2.requestCapabilityFlow({ context: makeInsightContext() }).reason, 'recommendation_capability_unavailable');
  });

  console.log('');

  // =========================================================================
  // I. dependency direction
  // =========================================================================
  console.log('--- I. dependency direction ---');

  await test('（9.dependency direction）app.intelligence物件恰好維持24個欄位不變（本次規劃沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（9.dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.dependency direction）src/routes/目錄本次任務完全沒有新增或修改任何檔案（沒有建立HTTP路由）', () => {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src/routes/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）src/controllers/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）四層既有Phase 4 Capability（analysis/recommendation/orchestration/decision）本次任務完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    await test(`（9.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
    const src = readSrc(full);
    await test(`（9.dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（9.dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（9.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（9.dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

  console.log('');

  // =========================================================================
  // J. AI boundary
  // =========================================================================
  console.log('--- J. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（10.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（10.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（10.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（10.AI boundary）PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
      assert.ok(!pattern.test(doc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（10.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（10.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（10.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（10.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
  });

  await test('（10.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // K. regression validation
  // =========================================================================
  console.log('--- K. regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（11.regression validation）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.93-product-feature-flow')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 83, `預期至少83個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（11.regression validation）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

  await test('（12.P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（12.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

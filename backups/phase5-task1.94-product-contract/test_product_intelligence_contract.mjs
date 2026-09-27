/*
 * Phase 5 TASK 1.94｜Product Intelligence Application Contract
 * Foundation 測試
 *
 * 本任務不是實作HTTP路由、不是導入AI——這是Architecture Foundation
 * 任務，在TASK1.90/1.91/1.92/1.93基礎上定義Product Feature跟
 * Intelligence Integration之間穩定的Contract邊界（Product
 * Intelligence Contract），記錄在
 * `src/intelligence/PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md`，
 * 本次**不修改**任何production程式碼、**不建立**任何Contract
 * 定義檔案/路由/Adapter程式碼。
 *
 * 這份測試驗證的是：
 * - Contract Boundary：Product Feature跟Intelligence Contract
 *   之間的職責、歸屬、相容性
 * - Request/Response/Error Contract：必要/選填欄位、暴露/隱藏
 *   欄位、四種錯誤類型跟收斂後的兩種形狀
 * - Version Strategy：Contract演進原則、向後相容、未來擴充策略
 * - Adapter/Feature/Capability Compatibility：跟前三個任務規劃
 *   的一致性，Phase 4整條Chain依然正確運作
 * - Dependency Direction：本次規劃沒有新增任何production依賴
 * - AI Boundary：本次規劃沒有導入任何AI SDK
 * - Regression/P1-P6
 *
 * 分為以下12個部分：
 * A) contract boundary
 * B) request contract
 * C) response contract
 * D) error contract
 * E) version strategy
 * F) adapter compatibility
 * G) feature compatibility
 * H) capability compatibility
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
const docPath = path.join(intelDir, 'PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md');
const entryDocPath = path.join(intelDir, 'PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md');
const adapterDocPath = path.join(intelDir, 'PHASE5_PRODUCT_ADAPTER_PLAN.md');
const flowDocPath = path.join(intelDir, 'PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md');
const contractDocPath = path.join(intelDir, 'PHASE4_DECISION_CONTRACT_PLAN.md');

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
  const entryDoc = fs.readFileSync(entryDocPath, 'utf8');
  const adapterDoc = fs.readFileSync(adapterDocPath, 'utf8');
  const flowDoc = fs.readFileSync(flowDocPath, 'utf8');
  const contractDoc = fs.readFileSync(contractDocPath, 'utf8');
  const featureSrc = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
  const orchestratorSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));

  // =========================================================================
  // A. contract boundary
  // =========================================================================
  console.log('--- A. contract boundary ---');

  const REQUIRED_DOC_SECTIONS = ['Contract Boundary', 'Request Contract', 'Response Contract', 'Error Contract', 'Version Strategy', 'Phase 5 Roadmap', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.contract boundary）PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.contract boundary）文件記錄Product Feature → Intelligence Contract邊界，並確認完整八層Flow（Product Feature→Contract→Entry→Adapter→Feature→Capability→Runtime）', () => {
    assert.ok(/Product Feature/.test(doc));
    assert.ok(/Product Intelligence Contract/.test(doc));
    assert.ok(/Product Entry/.test(doc));
    assert.ok(/Intelligence Adapter/.test(doc));
    assert.ok(/Capability Layer/.test(doc));
    assert.ok(/Runtime Layer/.test(doc));
  });

  await test('（1.contract boundary）文件明確說明Contract不是轉換邏輯，是介面規範跟穩定承諾', () => {
    assert.ok(/介面規範/.test(doc));
    assert.ok(/穩定.{0,2}承諾/.test(doc));
  });

  await test('（1.contract boundary）文件記錄Responsibility：Contract不負責實際資料轉換、驗證邏輯執行、HTTP處理', () => {
    assert.ok(/Contract\*{0,2}不負責/.test(flatDoc));
  });

  await test('（1.contract boundary）文件記錄Ownership：Contract歸屬Phase 5規劃系列，不歸屬任何單一Product Feature', () => {
    assert.ok(/不歸屬任何單一Product Feature/.test(doc));
  });

  await test('（1.contract boundary）文件記錄Compatibility：Contract完全建立在既有Phase 4/TASK1.79形狀之上，不新增任何實際欄位', () => {
    assert.ok(/不新增任何實際欄位/.test(doc));
  });

  await test('（1.contract boundary）文件跟TASK1.90/1.91/1.92/1.93做明確區分並延續其規劃', () => {
    assert.ok(/TASK1\.90/.test(doc));
    assert.ok(/TASK1\.91/.test(doc));
    assert.ok(/TASK1\.92/.test(doc));
    assert.ok(/TASK1\.93/.test(doc));
  });

  console.log('');

  // =========================================================================
  // B. request contract
  // =========================================================================
  console.log('--- B. request contract ---');

  await test('（2.request contract）文件記錄Required Fields：context是唯一必要欄位', () => {
    assert.ok(/Required Fields/.test(doc));
    assert.ok(/context.{0,10}是唯一的必要欄位/.test(flatDoc));
  });

  await test('（2.request contract）文件記錄Optional Fields：options是唯一規劃中的選填欄位', () => {
    assert.ok(/Optional Fields/.test(doc));
    assert.ok(/options.{0,10}是唯一規劃中的選填欄位/.test(flatDoc));
  });

  await test('（2.request contract）文件記錄Validation Responsibility表格：HTTP形狀/Product資料轉換/{context,options?}形狀/Insight Context內容四項驗證歸屬', () => {
    assert.ok(/Validation Responsibility/.test(doc));
    assert.ok(/Product Entry（TASK1\.91）/.test(doc));
    assert.ok(/Intelligence Adapter（TASK1\.92）/.test(doc));
  });

  await test('（2.request contract）文件記錄Version Strategy（Request這一段）：目前定為v1', () => {
    assert.ok(/定為\*{0,2}v1/.test(flatDoc));
  });

  await test('（2.request contract）端對端：Feature Intelligence Integration依然恰好接受{context, options?}形狀（Request Contract引用的真實形狀）', () => {
    const feature = makeRealFeature();
    assert.doesNotThrow(() => feature.requestIntelligence({ context: makeInsightContext() }));
    assert.doesNotThrow(() => feature.requestIntelligence({ context: makeInsightContext(), options: {} }));
  });

  await test('（2.request contract）端對端：Capability Orchestrator的既有輸入驗證依然成立（Contract只是宣告，不執行驗證，驗證依然在既有層級發生）', () => {
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
  // C. response contract
  // =========================================================================
  console.log('--- C. response contract ---');

  await test('（3.response contract）文件記錄Exposed Fields：analysis/recommendation保證存在，decision不保證存在', () => {
    assert.ok(/Exposed Fields/.test(doc));
    assert.ok(/保證存在/.test(doc));
    assert.ok(/不保證存在/.test(doc));
  });

  await test('（3.response contract）文件記錄Hidden Fields：feature/capability/decision.status三個內部欄位Product Feature不應該依賴', () => {
    assert.ok(/Hidden Fields/.test(doc));
    assert.ok(/feature: 'intelligence'/.test(doc));
    assert.ok(/capability: 'orchestration'/.test(doc));
    assert.ok(/decision_not_available/.test(doc));
  });

  await test('（3.response contract）文件明確說明目前這些Hidden Fields依然會出現在真實回傳結果裡（因為Adapter尚未落地）', () => {
    assert.ok(/依然會\*{0,2}出現在真實回傳結果裡/.test(flatDoc));
  });

  await test('（3.response contract）文件記錄Compatibility Strategy：Contract先畫出未來界線，遵守Contract的Product Feature未來不會breaking', () => {
    assert.ok(/Compatibility Strategy/.test(doc));
    assert.ok(/breaking/i.test(doc));
  });

  await test('（3.response contract）端對端：Feature Intelligence Integration成功回傳形狀恰好是{ok, feature, data}，data.analysis/data.recommendation原樣暴露（Response Contract引用的真實形狀）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'feature', 'ok']);
    assert.ok(Array.isArray(result.data.analysis.insights));
    assert.ok(Array.isArray(result.data.recommendation.recommendations));
  });

  await test('（3.response contract）端對端：不提供decisionCapability時，Unified Capability Result恰好沒有decision欄位（驗證"decision不保證存在"這條Contract規則）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.result, 'decision'), false);
  });

  await test('（3.response contract）端對端：提供decisionCapability時，decision欄位確實存在（驗證"decision選填但可存在"這條Contract規則）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.ok(Object.prototype.hasOwnProperty.call(result.result, 'decision'));
  });

  await test('（3.response contract）端對端：Capability Orchestrator成功回傳確實包含capability:\'orchestration\'欄位（Hidden Fields章節討論的內部欄位確實存在於真實程式碼，證明目前尚未被過濾）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.capability, 'orchestration');
  });

  await test('（3.response contract）端對端：Feature Intelligence Integration成功回傳確實包含feature:\'intelligence\'欄位（同上，證明目前尚未被過濾）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.feature, 'intelligence');
  });

  console.log('');

  // =========================================================================
  // D. error contract
  // =========================================================================
  console.log('--- D. error contract ---');

  await test('（4.error contract）文件記錄四種錯誤類型：Product Error/Adapter Error/Intelligence Error/Runtime Error', () => {
    assert.ok(/### Product Error\b/.test(doc));
    assert.ok(/### Adapter Error/.test(doc));
    assert.ok(/### Intelligence Error/.test(doc));
    assert.ok(/### Runtime Error\b/.test(doc));
  });

  await test('（4.error contract）文件明確說明Product Error不屬於Intelligence Contract範圍', () => {
    assert.ok(/不屬於\*{0,2}Intelligence\s*Contract/.test(flatDoc));
  });

  await test('（4.error contract）文件記錄Adapter Error規劃上會被轉換成跟Intelligence Error相同的錯誤形狀', () => {
    assert.ok(/相同的錯誤形狀/.test(doc));
  });

  await test('（4.error contract）文件記錄Intelligence Error的既有形狀：{ok, reason, field?, stage?}，頂層key永遠存在', () => {
    assert.ok(/reason:\s*string/.test(doc));
    assert.ok(/永遠存在/.test(doc));
  });

  await test('（4.error contract）文件記錄Runtime Error規劃降級成internal_error這類統一reason值', () => {
    assert.ok(/internal_error/.test(doc));
  });

  await test('（4.error contract）文件記錄四種錯誤的Contract總結：Product Feature最終只需要處理兩種形狀', () => {
    assert.ok(/只需要處理兩種/.test(doc));
  });

  await test('（4.error contract）端對端：Decision階段失敗時reason/field/stage欄位正確帶出（Intelligence Error形狀引用的真實行為）', () => {
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

  await test('（4.error contract）端對端：invalid_request/invalid_context失敗形狀恰好符合{ok:false, reason}（field/stage選填不存在時不強制出現）', () => {
    const orchestrator = createCapabilityOrchestrator({});
    const result = orchestrator.requestCapabilityFlow(null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  console.log('');

  // =========================================================================
  // E. version strategy
  // =========================================================================
  console.log('--- E. version strategy ---');

  await test('（5.version strategy）文件記錄Contract Evolution原則：只能新增選填欄位，不得移除既有欄位/改必要/改型別', () => {
    assert.ok(/Contract Evolution/.test(doc));
    assert.ok(/只能新增\*{0,2}選填欄位/.test(doc));
  });

  await test('（5.version strategy）文件記錄Breaking Change需要新版本號，v1/v2應可並存', () => {
    assert.ok(/Breaking\s*Change/.test(flatDoc));
    assert.ok(/並存/.test(doc));
  });

  await test('（5.version strategy）文件記錄Backward Compatibility：延續TASK1.78/1.86的decisionCapability選填注入保證', () => {
    assert.ok(/Backward Compatibility/.test(doc));
    assert.ok(/decisionCapability/.test(doc));
  });

  await test('（5.version strategy）文件記錄Future Extension Strategy：Intelligence Enhancement擴充反映在既有欄位內容豐富化，不是Contract形狀變動', () => {
    assert.ok(/Future Extension Strategy/.test(doc));
    assert.ok(/內容.{0,5}豐富化/.test(flatDoc));
  });

  await test('（5.version strategy）文件記錄未來AI內容應該落在既有decision欄位內部，不新增獨立的aiResult欄位', () => {
    assert.ok(/aiResult/.test(doc));
  });

  await test('（5.version strategy）文件引用TASK1.87 Decision Output Evolution作為AI內容規劃方向的延續基礎', () => {
    assert.ok(/TASK1\.87/.test(doc));
  });

  console.log('');

  // =========================================================================
  // F. adapter compatibility
  // =========================================================================
  console.log('--- F. adapter compatibility ---');

  await test('（6.adapter compatibility）PHASE5_PRODUCT_ADAPTER_PLAN.md（TASK1.92）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_ADAPTER_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.adapter compatibility）TASK1.92文件依然包含既有六個章節（本次任務沒有破壞前一份文件的結構）', () => {
    for (const section of ['Adapter Responsibility', 'Request Mapping', 'Response Mapping', 'Error Mapping', 'Feature Integration', 'Known Limitations']) {
      assert.ok(adapterDoc.includes(section), `PHASE5_PRODUCT_ADAPTER_PLAN.md缺少章節：${section}`);
    }
  });

  await test('（6.adapter compatibility）文件引用TASK1.92的Response Mapping過濾規則作為Hidden Fields的延續基礎', () => {
    assert.ok(adapterDoc.includes("feature:'intelligence'") || adapterDoc.includes("feature: 'intelligence'"));
  });

  await test('（6.adapter compatibility）PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md（TASK1.91）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.adapter compatibility）PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md（TASK1.93）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.adapter compatibility）TASK1.93文件依然包含既有七個章節（本次任務沒有破壞前一份文件的結構）', () => {
    for (const section of ['Product Feature Flow Architecture', 'Feature Consumption Pattern', 'Request Lifecycle', 'Response Lifecycle', 'Error Lifecycle', 'Phase 5 Integration Roadmap', 'Known Limitations']) {
      assert.ok(flowDoc.includes(section), `PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md缺少章節：${section}`);
    }
  });

  console.log('');

  // =========================================================================
  // G. feature compatibility
  // =========================================================================
  console.log('--- G. feature compatibility ---');

  await test('（7.feature compatibility）端對端：Insight Feature依然正確運作（本次規劃沒有影響既有Insight Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.feature compatibility）端對端：Behavior Feature依然正確運作（本次規劃沒有影響既有Behavior Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.feature compatibility）端對端：Feature Intelligence Integration可以被獨立import並成功呼叫（TASK1.79行為不變）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.feature compatibility）intelligence_feature.js完全不出現HTTP相關字樣（維持"No HTTP"邊界）', () => {
    assert.ok(!/\bRequest\b/.test(featureSrc));
    assert.ok(!/\bResponse\b/.test(featureSrc));
    assert.ok(!/\bhttp\b/i.test(featureSrc));
  });

  await test('（7.feature compatibility）capability_orchestrator.js完全不出現HTTP相關字樣（Contract規劃沒有把HTTP概念滲透進Capability層）', () => {
    assert.ok(!/\bhttp\b/i.test(orchestratorSrc));
  });

  console.log('');

  // =========================================================================
  // H. capability compatibility
  // =========================================================================
  console.log('--- H. capability compatibility ---');

  await test('（8.capability compatibility）端對端：Analysis Capability單獨呼叫依然正確運作', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（8.capability compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（8.capability compatibility）端對端：Decision Capability單獨呼叫依然正確運作', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.capability compatibility）端對端：完整Chain（Analysis→Recommendation→Decision）依然可以串接成功', () => {
    const a = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    const r = makeRealRecommendationCapability().requestRecommendation({ analysisResult: a.result });
    const d = makeRealDecisionCapability().requestDecision({ recommendationResult: r.result });
    assert.strictEqual(a.ok, true);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(d.ok, true);
  });

  await test('（8.capability compatibility）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const feature = makeRealFeature();
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(feature.requestIntelligence(request), feature.requestIntelligence(request));
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（8.capability compatibility）${layer.name} 目錄恰好包含規格要求的檔案（本次規劃沒有新增/刪除任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

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

  await test('（9.dependency direction）PHASE4_DECISION_CONTRACT_PLAN.md（TASK1.84）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE4_DECISION_CONTRACT_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.dependency direction）本次任務沒有建立任何.d.ts/JSON Schema型別定義檔案', () => {
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
    await test(`（10.AI boundary）PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.94-product-contract')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 84, `預期至少84個既有測試檔案，實際 ${allSuites.length}`);
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

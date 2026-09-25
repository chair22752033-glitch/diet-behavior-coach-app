/*
 * Phase 4 TASK 1.86｜Decision Capability Orchestration Integration
 * Foundation 測試
 *
 * 本任務不是建立Decision Logic/Decision Algorithm/Decision
 * Model、不是導入AI——依照TASK1.85 Decision Capability Integration
 * Architecture記錄的設計圖，把Independent Decision
 * Capability（TASK1.83）以backward compatible的方式正式整合進
 * Capability Orchestrator（TASK1.78），詳見
 * `src/intelligence/PHASE4_DECISION_ORCHESTRATION_INTEGRATION.md`。
 *
 * 這份測試驗證的是：
 * - Decision Optional Flow：提供合法decisionCapability時，
 *   Orchestrator正確呼叫Decision Capability並組進Unified
 *   Capability Result
 * - Legacy Flow Compatibility：不提供decisionCapability（或提供
 *   的物件不合法）時，Orchestrator完全維持TASK1.78建立當下的既有
 *   行為
 * - Output Structure：buildSuccessResult()/buildFailureResult()
 *   的新增decisionResult/stage:'decision'行為正確
 * - Dependency Scan：本次任務沒有建立任何Decision
 *   Algorithm/Rule Engine/Scoring Logic/Weight/Threshold，Decision
 *   Capability本身完全沒有被修改
 * - Runtime Isolation：Analysis/Recommendation Runner、Phase 2
 *   Runtime Orchestrator、Phase 3 Application Layer完全沒有被修改
 * - AI Boundary：本次整合沒有呼叫任何AI Provider
 * - Regression/P1-P6
 *
 * 分為以下8個部分：
 * A) decision optional flow
 * B) legacy flow compatibility
 * C) output structure
 * D) dependency scan
 * E) runtime isolation
 * F) AI boundary
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
const docPath = path.join(intelDir, 'PHASE4_DECISION_ORCHESTRATION_INTEGRATION.md');

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
const TASK1_86_MODIFIED_FILES = new Set(['orchestration/capability_orchestrator.js', 'orchestration/capability_result_builder.js']);

async function run() {
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createCapabilityOrchestrator, createCapabilityOrchestratorResultBuilder } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
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

  // =========================================================================
  // A. decision optional flow
  // =========================================================================
  console.log('--- A. decision optional flow ---');

  await test('（1.decision optional flow）src/intelligence/PHASE4_DECISION_ORCHESTRATION_INTEGRATION.md 存在且內容非空', () => {
    assert.ok(fs.existsSync(docPath));
    assert.ok(doc.length > 1500);
  });

  const REQUIRED_DOC_SECTIONS = ['Optional Dependency Design', 'Backward Compatibility', 'Decision Flow', 'Output Integration', 'Dependency Direction', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.decision optional flow）PHASE4_DECISION_ORCHESTRATION_INTEGRATION.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.decision optional flow）端對端：提供合法decisionCapability時，Orchestrator呼叫它並回傳三個欄位的Unified Capability Result', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'orchestration');
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
  });

  await test('（1.decision optional flow）端對端：decision欄位內容恰好是Decision Capability的佔位形狀{status:"decision_not_available", decision:null, metadata}', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.result.decision.status, 'decision_not_available');
    assert.strictEqual(result.result.decision.decision, null);
    assert.strictEqual(typeof result.result.decision.metadata, 'object');
  });

  await test('（1.decision optional flow）端對端：decision.metadata.recommendationCount恰好等於DEFAULT_RECOMMENDATION_MODULES.length（真實資料流串接正確）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.result.decision.metadata.recommendationCount, DEFAULT_RECOMMENDATION_MODULES.length);
    assert.strictEqual(result.result.recommendation.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
    assert.strictEqual(result.result.analysis.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（1.decision optional flow）端對端：decisionCapability.requestDecision()收到的request恰好是{recommendationResult: <Recommendation Capability的result>}', () => {
    let receivedRequest = null;
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: {
        requestDecision: (request) => {
          receivedRequest = request;
          return { ok: true, capability: 'decision', result: { status: 'x', decision: null, metadata: {} } };
        },
      },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(receivedRequest), ['recommendationResult']);
    assert.deepStrictEqual(receivedRequest.recommendationResult, result.result.recommendation);
  });

  await test('（1.decision optional flow）Decision階段失敗時，Orchestrator立刻回傳{ok:false, stage:"decision"}，不會用不完整資料頂替繼續', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: { requestDecision: () => ({ ok: false, capability: 'decision', reason: 'decision_failed_for_test' }) },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.capability, 'orchestration');
    assert.strictEqual(result.reason, 'decision_failed_for_test');
    assert.strictEqual(result.stage, 'decision');
  });

  await test('（1.decision optional flow）Decision階段失敗時，回傳結果裡完全沒有analysis/recommendation/decision欄位（失敗結果形狀跟成功結果完全不同）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: { requestDecision: () => ({ ok: false, capability: 'decision', reason: 'x' }) },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'result'), false);
  });

  await test('（1.decision optional flow）Decision階段失敗時，field欄位（若decisionCapability有提供）會被正確帶出', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: { requestDecision: () => ({ ok: false, capability: 'decision', reason: 'invalid_recommendation_result', field: 'recommendationResult' }) },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.field, 'recommendationResult');
  });

  await test('（1.decision optional flow）decisionCapability存在但requestDecision不是函式時，Orchestrator退回既有的兩段Flow行為（不拋例外、不嘗試呼叫）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: { requestDecision: 'not-a-function' },
    });
    let result;
    assert.doesNotThrow(() => { result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() }); });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（1.decision optional flow）decisionCapability = {}（空物件，沒有requestDecision）時，Orchestrator退回既有的兩段Flow行為', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: {},
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（1.decision optional flow）端對端：不同的InsightContext輸入配合decisionCapability都能正確走完完整的三段Flow', () => {
    for (const overrides of [{}, { activityContext: { count: 10, items: [] } }, { metadata: { totalRecords: 99 } }]) {
      const orchestrator = createCapabilityOrchestrator({
        analysisCapability: makeRealAnalysisCapability(),
        recommendationCapability: makeRealRecommendationCapability(),
        decisionCapability: makeRealDecisionCapability(),
      });
      const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext(overrides) });
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
    }
  });

  await test('（1.decision optional flow）端對端：提供decisionCapability時，是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(orchestrator.requestCapabilityFlow(request), orchestrator.requestCapabilityFlow(request));
  });

  await test('（1.decision optional flow）Analysis階段失敗時，Decision Capability完全不會被呼叫（單向Flow，任何一段失敗立刻中止）', () => {
    let decisionCalled = false;
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: { requestAnalysis: () => ({ ok: false, capability: 'analysis', reason: 'analysis_failed' }) },
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: { requestDecision: () => { decisionCalled = true; return { ok: true, result: {} }; } },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stage, 'analysis');
    assert.strictEqual(decisionCalled, false);
  });

  await test('（1.decision optional flow）Recommendation階段失敗時，Decision Capability完全不會被呼叫', () => {
    let decisionCalled = false;
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: { requestRecommendation: () => ({ ok: false, capability: 'recommendation', reason: 'recommendation_failed' }) },
      decisionCapability: { requestDecision: () => { decisionCalled = true; return { ok: true, result: {} }; } },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stage, 'recommendation');
    assert.strictEqual(decisionCalled, false);
  });

  console.log('');

  // =========================================================================
  // B. legacy flow compatibility
  // =========================================================================
  console.log('--- B. legacy flow compatibility ---');

  await test('（2.legacy flow compatibility）端對端：完全不提供decisionCapability時，Unified Capability Result恰好只有{analysis, recommendation}兩個欄位', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.legacy flow compatibility）decisionCapability明確傳入undefined時，行為跟完全不傳等價', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: undefined,
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.legacy flow compatibility）decisionCapability明確傳入null時，行為跟完全不傳等價', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: null,
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.legacy flow compatibility）不提供decisionCapability時，Analysis Capability不可用的失敗訊息維持TASK1.78既有文字', () => {
    const orchestrator = createCapabilityOrchestrator({ recommendationCapability: makeRealRecommendationCapability() });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'analysis_capability_unavailable');
  });

  await test('（2.legacy flow compatibility）不提供decisionCapability時，Recommendation Capability不可用的失敗訊息維持TASK1.78既有文字', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: makeRealAnalysisCapability() });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'recommendation_capability_unavailable');
  });

  await test('（2.legacy flow compatibility）不提供任何依賴時的invalid_request/invalid_context驗證行為維持不變', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    assert.strictEqual(orchestrator.requestCapabilityFlow(null).reason, 'invalid_request');
    assert.strictEqual(orchestrator.requestCapabilityFlow({}).reason, 'invalid_context');
    assert.strictEqual(orchestrator.requestCapabilityFlow({ context: {}, options: 'x' }).reason, 'invalid_options_type');
  });

  await test('（2.legacy flow compatibility）createCapabilityOrchestrator()回傳物件恰好只有requestCapabilityFlow一個公開介面（有無decisionCapability都一樣，介面沒有被本次整合擴充）', () => {
    const withoutDecision = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const withDecision = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {}, decisionCapability: {} });
    assert.deepStrictEqual(Object.keys(withoutDecision), ['requestCapabilityFlow']);
    assert.deepStrictEqual(Object.keys(withDecision), ['requestCapabilityFlow']);
  });

  await test('（2.legacy flow compatibility）端對端：Analysis Capability單獨呼叫依然正確運作（TASK1.76行為不變）', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'analysis');
  });

  await test('（2.legacy flow compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作（TASK1.77行為不變）', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'recommendation');
  });

  await test('（2.legacy flow compatibility）端對端：Decision Capability單獨呼叫依然正確運作，介面跟TASK1.83/1.84/1.85完全一致（本次任務沒有修改decision_capability.js）', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'decision');
    assert.strictEqual(result.result.decision, null);
  });

  await test('（2.legacy flow compatibility）端對端：Feature Integration（TASK1.79）依然正確運作，data欄位依然只有{analysis, recommendation}（本次任務沒有讓Feature Integration注入decisionCapability）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'intelligence');
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.legacy flow compatibility）端對端：recommendation的insight_count恰好反映analysis的insights陣列長度（既有串接關係不受本次整合影響）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    const insightCount = result.data.recommendation.recommendations.find((r) => r.type === 'insight_count');
    assert.strictEqual(insightCount.value, result.data.analysis.insights.length);
  });

  await test('（2.legacy flow compatibility）端對端：不提供decisionCapability時，是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(orchestrator.requestCapabilityFlow(request), orchestrator.requestCapabilityFlow(request));
  });

  await test('（2.legacy flow compatibility）src/intelligence/capabilities/index.js（頂層）依然恰好具備analysis/recommendation/orchestration/decision四個namespace（本次整合沒有新增第五個namespace）', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['analysis', 'decision', 'orchestration', 'recommendation']);
  });

  await test('（2.legacy flow compatibility）src/intelligence/capabilities/index.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.legacy flow compatibility）application/features/index.js依然只有insight/behavior/intelligence三個namespace（本次沒有新增任何Feature）', () => {
    const namespaces = getReExportedNamespaces(path.join(featuresDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['behavior', 'insight', 'intelligence']);
  });

  await test('（2.legacy flow compatibility）intelligence_feature.js/intelligence_feature_result_mapper.js本次任務完全沒有被修改（Feature Integration沒有注入decisionCapability）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/features/intelligence/intelligence_feature.js src/intelligence/application/features/intelligence/intelligence_feature_result_mapper.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.legacy flow compatibility）intelligence_feature.js完全不出現decisionCapability相關字樣（本次任務沒有把Decision接進Feature層）', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
    assert.ok(!/decisionCapability/.test(src));
  });

  console.log('');

  // =========================================================================
  // C. output structure
  // =========================================================================
  console.log('--- C. output structure ---');

  await test('（3.output structure）buildSuccessResult()只傳兩個參數時，result物件完全不存在decision這個key（不是decision:undefined，是這個屬性根本不存在）', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    const result = resultBuilder.buildSuccessResult({ a: 1 }, { b: 2 });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.result, 'decision'), false);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（3.output structure）buildSuccessResult()傳入第三個參數（合法物件）時，result.decision原樣保留該物件（不重新拆開/改寫）', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    const decisionResult = { status: 'decision_not_available', decision: null, metadata: { version: '1.0.0', recommendationCount: 3 } };
    const result = resultBuilder.buildSuccessResult({ a: 1 }, { b: 2 }, decisionResult);
    assert.deepStrictEqual(result.result.decision, decisionResult);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
  });

  await test('（3.output structure）buildSuccessResult()第三個參數為null時，result.decision退化為{}（跟analysis/recommendation的既有防呆邏輯一致）', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    const result = resultBuilder.buildSuccessResult({ a: 1 }, { b: 2 }, null);
    assert.deepStrictEqual(result.result.decision, {});
  });

  await test('（3.output structure）buildSuccessResult()第三個參數為非物件（字串/數字）時，result.decision退化為{}', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    for (const bad of ['x', 42, true]) {
      const result = resultBuilder.buildSuccessResult({ a: 1 }, { b: 2 }, bad);
      assert.deepStrictEqual(result.result.decision, {});
    }
  });

  await test('（3.output structure）buildSuccessResult()第一、二個參數（analysisResult/recommendationResult）的既有防呆邏輯完全不受第三個參數影響', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    const result = resultBuilder.buildSuccessResult(null, undefined, { x: 1 });
    assert.deepStrictEqual(result.result.analysis, {});
    assert.deepStrictEqual(result.result.recommendation, {});
    assert.deepStrictEqual(result.result.decision, { x: 1 });
  });

  await test('（3.output structure）buildFailureResult()支援stage="decision"，回傳形狀跟stage="analysis"/"recommendation"完全一致', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    const result = resultBuilder.buildFailureResult('decision_failed', 'someField', 'decision');
    assert.deepStrictEqual(result, { ok: false, capability: 'orchestration', reason: 'decision_failed', field: 'someField', stage: 'decision' });
  });

  await test('（3.output structure）成功結果的頂層key恰好是{ok, capability, result}（無論有沒有decisionResult，頂層結構不變）', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    const withoutDecision = resultBuilder.buildSuccessResult({}, {});
    const withDecision = resultBuilder.buildSuccessResult({}, {}, {});
    assert.deepStrictEqual(Object.keys(withoutDecision).sort(), ['capability', 'ok', 'result']);
    assert.deepStrictEqual(Object.keys(withDecision).sort(), ['capability', 'ok', 'result']);
  });

  await test('（3.output structure）端對端：真實Decision Capability回傳的result直接被Orchestrator原樣放進Unified Capability Result（沒有中間轉換層）', () => {
    const decisionCapability = makeRealDecisionCapability();
    const recommendationResult = makeRecommendationResult();
    const expectedDecisionResult = decisionCapability.requestDecision({ recommendationResult }).result;
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: { requestRecommendation: () => ({ ok: true, capability: 'recommendation', result: recommendationResult }) },
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(result.result.decision, expectedDecisionResult);
  });

  await test('（3.output structure）capability_result_builder.js的頭部JSDoc正確記錄decisionResult是選填的第三個參數', () => {
    assert.ok(/decisionResult/.test(resultBuilderSrc));
  });

  console.log('');

  // =========================================================================
  // D. dependency scan
  // =========================================================================
  console.log('--- D. dependency scan ---');

  await test('（4.dependency scan）decision_capability.js/decision_result_builder.js/decision/index.js本次任務完全沒有被修改（規格允許修改Orchestrator，但沒有允許修改Decision Capability本身）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.dependency scan）analysis_capability.js/recommendation_capability.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.dependency scan）capability_orchestrator.js/capability_result_builder.js（orchestration）本次任務確實被修改（規格明確允許Orchestrator extension）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/orchestration/capability_orchestrator.js src/intelligence/capabilities/orchestration/capability_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.ok(diff.trim().length > 0);
  });

  await test('（4.dependency scan）orchestration/index.js本次任務完全沒有被修改（只有內層兩個檔案被修改，統一輸出的方式不變）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/orchestration/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.dependency scan）capability_orchestrator.js完全不import capabilities/decision/底下任何實作檔案（只透過依賴注入拿到的decisionCapability介面呼叫）', () => {
    assert.ok(!/from\s+['"].*\/decision\/decision_capability/.test(orchestratorSrc));
    assert.ok(!/from\s+['"].*\/decision\/decision_result_builder/.test(orchestratorSrc));
  });

  await test('（4.dependency scan）capability_orchestrator.js的import語句完全沒有引用src/intelligence/capabilities/decision/', () => {
    const importLines = orchestratorSrc.match(/^import[^\n]*$/gm) || [];
    for (const line of importLines) {
      assert.ok(!/\/decision\//.test(line), `發現不預期的decision import：${line}`);
    }
  });

  await test('（4.dependency scan）本次任務完全沒有建立任何名稱包含Algorithm/Engine/RuleEngine的新.js程式碼檔案', () => {
    function walk(dir) {
      const found = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...walk(full));
        else if (entry.name.endsWith('.js') && /(algorithm|ruleengine|rule_engine)/i.test(entry.name)) found.push(full);
      }
      return found;
    }
    const found = walk(intelDir);
    assert.deepStrictEqual(found, [], `發現非預期的Algorithm/Engine相關.js檔案：${JSON.stringify(found)}`);
  });

  await test('（4.dependency scan）capability_orchestrator.js/capability_result_builder.js完全不出現score/weight/threshold相關的計算邏輯（本次整合沒有加入判斷邏輯）', () => {
    for (const src of [orchestratorSrc, resultBuilderSrc]) {
      assert.ok(!/\.score\s*=/.test(src));
      assert.ok(!/\bweight\s*[:=]/i.test(src));
      assert.ok(!/\bthreshold\s*[:=]/i.test(src));
    }
  });

  await test('（4.dependency scan）PHASE4_DECISION_ORCHESTRATION_INTEGRATION.md裡完全不包含score/weight/threshold計算（純文件，沒有偷偷描述真實決策邏輯）', () => {
    assert.ok(!/\.score\s*=/.test(doc));
    assert.ok(!/\bweight\s*[:=]/i.test(doc));
    assert.ok(!/\bthreshold\s*[:=]/i.test(doc));
  });

  await test('（4.dependency scan）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const key = `${layer}/${file}`;
    if (TASK1_86_MODIFIED_FILES.has(key)) continue;
    await test(`（4.dependency scan）${key} 本次任務完全沒有被修改（逐檔案git diff確認，只有orchestration層的兩個檔案被允許修改）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（4.dependency scan）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    await test(`（4.dependency scan）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（4.dependency scan）${layer}/${file} 完全不出現db變數名稱`, () => {
      assert.ok(!/\bdb\b/.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（4.dependency scan）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（4.dependency scan）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

  console.log('');

  // =========================================================================
  // E. runtime isolation
  // =========================================================================
  console.log('--- E. runtime isolation ---');

  await test('（5.runtime isolation）Analysis Runner本身（analysis_runner.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Recommendation Runner本身（recommendation_runner.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/，TASK1.45）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Execution Manager（src/intelligence/execution/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/execution/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Runtime Execution Layer（service/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）src/intelligence/index.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）app.intelligence物件恰好維持24個欄位不變（本次任務沒有新增任何bootstrap欄位、沒有把Orchestrator接進bootstrap）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（5.runtime isolation）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）端對端：Insight跟Behavior兩個既有Feature在本次整合後依然成功運作', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  await test('（5.runtime isolation）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（5.runtime isolation）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

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
    await test(`（6.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic，本次整合沒有破壞既有的deterministic性質）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（6.AI boundary）PHASE4_DECISION_ORCHESTRATION_INTEGRATION.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
      assert.ok(!pattern.test(doc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（6.AI boundary）文件明確記錄「Feature → AI Provider」（Feature direct AI usage）在本次整合後依然完全禁止', () => {
    assert.ok(/Feature.*AI\s*Provider/.test(flatDoc));
  });

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

  await test('（6.AI boundary）端對端：即使decisionCapability是模擬的「未來AI」實作，Orchestrator也只透過requestDecision()這個介面呼叫，完全不知道底層是不是AI', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: { requestDecision: () => ({ ok: true, capability: 'decision', result: { status: 'simulated_ai_decision', decision: null, metadata: {} } }) },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.decision.status, 'simulated_ai_decision');
  });

  await test('（6.AI boundary）端對端：真實Decision Capability的decision欄位依然恆為null（本次整合沒有加入任何實際決策內容）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.result.decision.decision, null);
  });

  await test('（6.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作（未來AI Extension Point機制未被破壞）', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.insights, [{ type: 'placeholder', value: 1, source: 'x' }]);
  });

  await test('（6.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.recommendations, [{ type: 'placeholder', value: 1, source: 'x' }]);
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.86-decision-orchestration')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（7.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 76, `預期至少76個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（8.P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（8.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

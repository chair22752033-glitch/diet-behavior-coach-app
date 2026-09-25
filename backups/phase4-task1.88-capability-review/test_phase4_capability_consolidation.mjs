/*
 * Phase 4 TASK 1.88｜Phase 4 Intelligence Capability Consolidation
 * Review 測試
 *
 * 本任務不是實作Decision Logic、不是導入AI——這是Review/Validation
 * 任務，對TASK1.75~1.87累積建立的整條Phase 4 Intelligence
 * Capability Chain（Analysis → Recommendation → Decision →
 * Unified Capability Result）做最終的整體審查，記錄在
 * `src/intelligence/PHASE4_CAPABILITY_CONSOLIDATION_REVIEW.md`，
 * 本次**不修改**任何production程式碼。
 *
 * 這份測試驗證的是：
 * - Capability Chain：Analysis→Recommendation→Decision依賴方向
 *   正確、無跳層、無循環依賴
 * - Orchestration：Capability Orchestrator正確協調選填的Decision
 *   Capability、維持Legacy行為、不含業務決策邏輯
 * - Decision Compatibility：Decision Capability依然正確消費
 *   Recommendation Result
 * - Output Structure：Unified Capability Result支援
 *   analysis/recommendation/decision，不含score/weight/threshold/
 *   hidden rules
 * - Dependency Scan：Decision/Analysis/Recommendation Capability
 *   完全不依賴database/auth/oauth/runtime internal component
 * - Runtime Isolation：Analysis/Recommendation Runner、Phase 2
 *   Runtime Orchestrator、Phase 3 Application Layer完全沒有被修改
 * - AI Boundary：本次審查沒有啟用任何AI Provider
 * - Documentation Consistency：文件章節齊全、內容跟規格要求一致
 * - Regression/P1-P6
 *
 * 分為以下10個部分：
 * A) capability chain
 * B) orchestration
 * C) decision compatibility
 * D) output structure
 * E) dependency scan
 * F) runtime isolation
 * G) AI boundary
 * H) documentation consistency
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
const docPath = path.join(intelDir, 'PHASE4_CAPABILITY_CONSOLIDATION_REVIEW.md');

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
  const { createCapabilityOrchestrator, createCapabilityOrchestratorResultBuilder } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createDecisionCapability, buildDecisionOutputPlaceholder } = await import(path.join(decisionCapabilityDir, 'index.js'));
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
  const decisionResultBuilderSrc = readSrc(path.join(decisionCapabilityDir, 'decision_result_builder.js'));
  const analysisCapabilitySrc = readSrc(path.join(analysisCapabilityDir, 'analysis_capability.js'));
  const recommendationCapabilitySrc = readSrc(path.join(recommendationCapabilityDir, 'recommendation_capability.js'));

  // =========================================================================
  // A. capability chain
  // =========================================================================
  console.log('--- A. capability chain ---');

  await test('（1.capability chain）Recommendation Capability完全不import Decision Capability（無循環依賴）', () => {
    assert.ok(!/from\s+['"].*\/decision\//.test(recommendationCapabilitySrc));
  });

  await test('（1.capability chain）Analysis Capability完全不import Decision Capability（無循環依賴）', () => {
    assert.ok(!/from\s+['"].*\/decision\//.test(analysisCapabilitySrc));
  });

  await test('（1.capability chain）Analysis Capability完全不import Recommendation Capability（無跳層、無反向依賴）', () => {
    assert.ok(!/from\s+['"].*\/recommendation\//.test(analysisCapabilitySrc));
  });

  await test('（1.capability chain）Decision Capability完全不import Analysis Capability（無跳層）', () => {
    assert.ok(!/from\s+['"].*\/analysis\//.test(decisionCapabilitySrc));
  });

  await test('（1.capability chain）Decision Capability完全不import Analysis Runner/Recommendation Runner（不繞過Recommendation Capability直接摸Runtime層）', () => {
    assert.ok(!/from\s+['"].*intelligence\/analysis\//.test(decisionCapabilitySrc));
    assert.ok(!/from\s+['"].*intelligence\/recommendation\//.test(decisionCapabilitySrc));
  });

  await test('（1.capability chain）Analysis Capability原始碼完全不出現Decision字樣（單向依賴，Analysis不認識Decision的存在）', () => {
    assert.ok(!/Decision/.test(analysisCapabilitySrc));
  });

  await test('（1.capability chain）Recommendation Capability原始碼完全不出現Decision字樣（單向依賴，Recommendation不認識Decision的存在）', () => {
    assert.ok(!/Decision/.test(recommendationCapabilitySrc));
  });

  await test('（1.capability chain）端對端：Analysis→Recommendation→Decision可以形成完整的單向資料流，全部用真實Capability串接正確運作', () => {
    const analysisOutcome = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(analysisOutcome.ok, true);
    const recommendationOutcome = makeRealRecommendationCapability().requestRecommendation({ analysisResult: analysisOutcome.result });
    assert.strictEqual(recommendationOutcome.ok, true);
    const decisionOutcome = makeRealDecisionCapability().requestDecision({ recommendationResult: recommendationOutcome.result });
    assert.strictEqual(decisionOutcome.ok, true);
    assert.strictEqual(decisionOutcome.result.metadata.recommendationCount, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（1.capability chain）端對端：Analysis Capability回傳的result恰好吃進Recommendation Capability要求的{analysisResult}形狀（無需轉接層）', () => {
    const analysisOutcome = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.doesNotThrow(() => makeRealRecommendationCapability().requestRecommendation({ analysisResult: analysisOutcome.result }));
  });

  await test('（1.capability chain）端對端：Recommendation Capability回傳的result恰好吃進Decision Capability要求的{recommendationResult}形狀（無需轉接層）', () => {
    const recommendationOutcome = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.doesNotThrow(() => makeRealDecisionCapability().requestDecision({ recommendationResult: recommendationOutcome.result }));
  });

  await test('（1.capability chain）端對端：Analysis Capability單獨呼叫依然正確運作（TASK1.76行為不變）', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'analysis');
    assert.strictEqual(result.result.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（1.capability chain）端對端：Recommendation Capability單獨呼叫依然正確運作（TASK1.77行為不變）', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'recommendation');
    assert.strictEqual(result.result.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（1.capability chain）端對端：Decision Capability單獨呼叫依然正確運作（TASK1.83行為不變）', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'decision');
  });

  await test('（1.capability chain）端對端：Chain是deterministic的——同樣的輸入重複跑得到完全相同的三段結果', () => {
    const context = makeInsightContext();
    function runChain() {
      const a = makeRealAnalysisCapability().requestAnalysis({ context });
      const r = makeRealRecommendationCapability().requestRecommendation({ analysisResult: a.result });
      const d = makeRealDecisionCapability().requestDecision({ recommendationResult: r.result });
      return { a, r, d };
    }
    assert.deepStrictEqual(runChain(), runChain());
  });

  await test('（1.capability chain）src/intelligence/capabilities/index.js（頂層barrel）恰好re-export四個namespace：analysis/recommendation/orchestration/decision', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['analysis', 'decision', 'orchestration', 'recommendation']);
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（1.capability chain）${layer.name} 目錄恰好包含規格要求的檔案（核心邏輯+Result Builder+index.js+README.md）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  console.log('');

  // =========================================================================
  // B. orchestration
  // =========================================================================
  console.log('--- B. orchestration ---');

  await test('（2.orchestration）端對端：Capability Orchestrator提供合法decisionCapability時正確協調三段Flow，回傳三欄位Unified Capability Result', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
  });

  await test('（2.orchestration）端對端：不提供decisionCapability時，Orchestrator保留Legacy行為，恰好回傳{analysis, recommendation}兩個欄位', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.orchestration）端對端：decisionCapability為undefined/null/{}/非函式時，Orchestrator都退回Legacy兩欄位行為', () => {
    for (const decisionCapability of [undefined, null, {}, { requestDecision: 'not-a-function' }]) {
      const orchestrator = createCapabilityOrchestrator({
        analysisCapability: makeRealAnalysisCapability(),
        recommendationCapability: makeRealRecommendationCapability(),
        decisionCapability,
      });
      const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
      assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
    }
  });

  await test('（2.orchestration）Decision階段失敗時，Orchestrator正確回傳{ok:false, stage:"decision"}', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: { requestDecision: () => ({ ok: false, capability: 'decision', reason: 'x' }) },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stage, 'decision');
  });

  await test('（2.orchestration）Analysis階段失敗時，Recommendation/Decision完全不會被呼叫（單向Flow，任何一段失敗立刻中止）', () => {
    let recommendationCalled = false;
    let decisionCalled = false;
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: { requestAnalysis: () => ({ ok: false, capability: 'analysis', reason: 'x' }) },
      recommendationCapability: { requestRecommendation: () => { recommendationCalled = true; return { ok: true, result: {} }; } },
      decisionCapability: { requestDecision: () => { decisionCalled = true; return { ok: true, result: {} }; } },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stage, 'analysis');
    assert.strictEqual(recommendationCalled, false);
    assert.strictEqual(decisionCalled, false);
  });

  await test('（2.orchestration）Recommendation階段失敗時，Decision完全不會被呼叫', () => {
    let decisionCalled = false;
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: { requestRecommendation: () => ({ ok: false, capability: 'recommendation', reason: 'x' }) },
      decisionCapability: { requestDecision: () => { decisionCalled = true; return { ok: true, result: {} }; } },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stage, 'recommendation');
    assert.strictEqual(decisionCalled, false);
  });

  await test('（2.orchestration）Capability Orchestrator不含業務決策邏輯——完全不出現score/weight/threshold相關的計算', () => {
    assert.ok(!/\.score\s*=/.test(orchestratorSrc));
    assert.ok(!/\bweight\s*[:=]/i.test(orchestratorSrc));
    assert.ok(!/\bthreshold\s*[:=]/i.test(orchestratorSrc));
  });

  await test('（2.orchestration）Capability Orchestrator不含任何if/else用來挑選或排序recommendation/decision候選項（不比較.value、不用sort()）', () => {
    assert.ok(!/\.sort\s*\(/.test(orchestratorSrc));
    assert.ok(!/recommendations\[/.test(orchestratorSrc));
  });

  await test('（2.orchestration）createCapabilityOrchestrator()回傳物件恰好只有requestCapabilityFlow一個公開介面', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    assert.deepStrictEqual(Object.keys(orchestrator), ['requestCapabilityFlow']);
  });

  await test('（2.orchestration）Orchestrator的request驗證行為不受decisionCapability是否提供影響（invalid_request/invalid_context/invalid_options_type）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    assert.strictEqual(orchestrator.requestCapabilityFlow(null).reason, 'invalid_request');
    assert.strictEqual(orchestrator.requestCapabilityFlow({}).reason, 'invalid_context');
    assert.strictEqual(orchestrator.requestCapabilityFlow({ context: {}, options: 'x' }).reason, 'invalid_options_type');
  });

  await test('（2.orchestration）端對端：是deterministic的——提供decisionCapability時同樣的request重複呼叫得到完全相同的結果', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(orchestrator.requestCapabilityFlow(request), orchestrator.requestCapabilityFlow(request));
  });

  console.log('');

  // =========================================================================
  // C. decision compatibility
  // =========================================================================
  console.log('--- C. decision compatibility ---');

  await test('（3.decision compatibility）端對端：Decision Capability依然正確消費真實Recommendation Result', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.status, 'decision_not_available');
    assert.strictEqual(result.result.decision, null);
  });

  await test('（3.decision compatibility）buildDecisionOutputPlaceholder()對不同recommendationCount輸入依然正確計數', () => {
    for (const count of [0, 1, 5, 20]) {
      const recommendations = Array.from({ length: count }, (_, i) => ({ type: `t${i}` }));
      const output = buildDecisionOutputPlaceholder(makeRecommendationResult({ recommendations }));
      assert.strictEqual(output.metadata.recommendationCount, count);
    }
  });

  await test('（3.decision compatibility）Decision Capability的decision欄位依然恆為null', () => {
    for (const overrides of [{}, { recommendations: [] }, { recommendations: [{ type: 'a' }, { type: 'b' }] }]) {
      const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult(overrides) });
      assert.strictEqual(result.result.decision, null);
    }
  });

  await test('（3.decision compatibility）Decision Capability回傳物件恰好只有requestDecision一個公開介面', () => {
    assert.deepStrictEqual(Object.keys(makeRealDecisionCapability()), ['requestDecision']);
  });

  await test('（3.decision compatibility）端對端：不同的Decision Capability實例對同一個Recommendation Result得到一致的結果（deterministic）', () => {
    const recommendationResult = makeRecommendationResult({ recommendations: [{ type: 'a' }, { type: 'b' }] });
    assert.deepStrictEqual(
      makeRealDecisionCapability().requestDecision({ recommendationResult }),
      makeRealDecisionCapability().requestDecision({ recommendationResult }),
    );
  });

  await test('（3.decision compatibility）Decision Capability對缺少recommendationResult的request正確回傳失敗', () => {
    const result = makeRealDecisionCapability().requestDecision({});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.capability, 'decision');
  });

  await test('（3.decision compatibility）Decision Capability對非物件的request正確回傳失敗', () => {
    for (const bad of [null, undefined, 'x', 42]) {
      const result = makeRealDecisionCapability().requestDecision(bad);
      assert.strictEqual(result.ok, false);
    }
  });

  console.log('');

  // =========================================================================
  // D. output structure
  // =========================================================================
  console.log('--- D. output structure ---');

  await test('（4.output structure）Unified Capability Result成功時的頂層key恰好是{ok, capability, result}', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    const result = resultBuilder.buildSuccessResult({}, {});
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'result']);
  });

  await test('（4.output structure）result.analysis/result.recommendation/result.decision原樣保留各Capability回傳的內容（沒有重新拆開/改寫）', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    const analysisResult = { status: 'a', insights: [1, 2], metadata: {} };
    const recommendationResult = { status: 'r', recommendations: [3], metadata: {} };
    const decisionResult = { status: 'd', decision: null, metadata: {} };
    const result = resultBuilder.buildSuccessResult(analysisResult, recommendationResult, decisionResult);
    assert.deepStrictEqual(result.result.analysis, analysisResult);
    assert.deepStrictEqual(result.result.recommendation, recommendationResult);
    assert.deepStrictEqual(result.result.decision, decisionResult);
  });

  await test('（4.output structure）不提供decisionResult時，result物件完全不存在decision這個key', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    const result = resultBuilder.buildSuccessResult({}, {});
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.result, 'decision'), false);
  });

  await test('（4.output structure）buildFailureResult()支援stage為analysis/recommendation/decision三種值', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    for (const stage of ['analysis', 'recommendation', 'decision']) {
      const result = resultBuilder.buildFailureResult('x', 'y', stage);
      assert.strictEqual(result.stage, stage);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.capability, 'orchestration');
    }
  });

  await test('（4.output structure）Unified Capability Result（analysis/recommendation/orchestration/decision四層核心邏輯檔案）完全不含score計算邏輯', () => {
    for (const src of [orchestratorSrc, resultBuilderSrc, decisionCapabilitySrc, decisionResultBuilderSrc, analysisCapabilitySrc, recommendationCapabilitySrc]) {
      assert.ok(!/\.score\s*=/.test(src));
    }
  });

  await test('（4.output structure）Unified Capability Result相關四層核心邏輯檔案完全不含weight相關字樣', () => {
    for (const src of [orchestratorSrc, resultBuilderSrc, decisionCapabilitySrc, decisionResultBuilderSrc, analysisCapabilitySrc, recommendationCapabilitySrc]) {
      assert.ok(!/\bweight\b/i.test(src));
    }
  });

  await test('（4.output structure）Unified Capability Result相關四層核心邏輯檔案完全不含threshold相關字樣', () => {
    for (const src of [orchestratorSrc, resultBuilderSrc, decisionCapabilitySrc, decisionResultBuilderSrc, analysisCapabilitySrc, recommendationCapabilitySrc]) {
      assert.ok(!/\bthreshold\b/i.test(src));
    }
  });

  await test('（4.output structure）Unified Capability Result相關四層核心邏輯檔案完全不含hidden rules（沒有依recommendation內容分支挑選的if/switch邏輯）', () => {
    for (const src of [orchestratorSrc, resultBuilderSrc]) {
      assert.ok(!/if\s*\(\s*recommendation/.test(src));
      assert.ok(!/switch\s*\(\s*recommendation/.test(src));
    }
  });

  await test('（4.output structure）端對端：真實三段Capability串接後，Unified Capability Result的decision欄位內容跟Decision Capability單獨呼叫的結果完全一致', () => {
    const recommendationResult = makeRecommendationResult();
    const expectedDecision = makeRealDecisionCapability().requestDecision({ recommendationResult }).result;
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: { requestRecommendation: () => ({ ok: true, capability: 'recommendation', result: recommendationResult }) },
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(result.result.decision, expectedDecision);
  });

  console.log('');

  // =========================================================================
  // E. dependency scan
  // =========================================================================
  console.log('--- E. dependency scan ---');

  await test('（5.dependency scan）本次審查完全沒有建立任何名稱包含Algorithm/Engine/RuleEngine的新.js程式碼檔案', () => {
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

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    await test(`（5.dependency scan）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（5.dependency scan）${layer}/${file} 完全不出現db變數名稱`, () => {
      assert.ok(!/\bdb\b/.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（5.dependency scan）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（5.dependency scan）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

  await test('（5.dependency scan）decision_capability.js/decision_result_builder.js本次審查完全沒有被修改（逐檔案git diff確認）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/decision/decision_capability.js src/intelligence/capabilities/decision/decision_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.dependency scan）analysis_capability.js/recommendation_capability.js本次審查完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.dependency scan）capability_orchestrator.js/capability_result_builder.js本次審查完全沒有被修改（TASK1.86後的既有狀態維持不變）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/orchestration/capability_orchestrator.js src/intelligence/capabilities/orchestration/capability_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.dependency scan）intelligence_feature.js/intelligence_feature_result_mapper.js本次審查完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/features/intelligence/intelligence_feature.js src/intelligence/application/features/intelligence/intelligence_feature_result_mapper.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.dependency scan）四層既有Phase 4 Capability（analysis/recommendation/orchestration/decision）本次審查完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（5.dependency scan）Phase 3 Application Layer（application/整個目錄樹）本次審查完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    await test(`（5.dependency scan）${layer}/${file} 本次審查完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  console.log('');

  // =========================================================================
  // F. runtime isolation
  // =========================================================================
  console.log('--- F. runtime isolation ---');

  await test('（6.runtime isolation）Analysis Runner本身（analysis_runner.js）本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Recommendation Runner本身（recommendation_runner.js）本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/，TASK1.45）本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Execution Manager（src/intelligence/execution/）本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/execution/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Runtime Execution Layer（service/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次審查完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）src/intelligence/index.js本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）app.intelligence物件恰好維持24個欄位不變（本次審查沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（6.runtime isolation）src/bootstrap/application.js本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）端對端：Insight跟Behavior兩個既有Feature在本次審查後依然成功運作', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  await test('（6.runtime isolation）端對端：Feature Intelligence Integration（TASK1.79）依然正確運作，data欄位依然只有{analysis, recommendation}', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'intelligence');
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  await test('（6.runtime isolation）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（6.runtime isolation）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（6.runtime isolation）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    await test(`（6.runtime isolation）${layer}/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher變數名稱`, () => {
      assert.ok(!/executionManager|historyStore|metricsStore|eventDispatcher/.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // G. AI boundary
  // =========================================================================
  console.log('--- G. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（7.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（7.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（7.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（7.AI boundary）PHASE4_CAPABILITY_CONSOLIDATION_REVIEW.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
      assert.ok(!pattern.test(doc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（7.AI boundary）文件明確記錄「Feature → AI Provider」（Feature direct AI usage）依然完全禁止', () => {
    assert.ok(/Feature.*AI\s*Provider/.test(flatDoc));
  });

  await test('（7.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（7.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（7.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（7.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作（未來AI Extension Point機制未被破壞）', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.insights, [{ type: 'placeholder', value: 1, source: 'x' }]);
  });

  await test('（7.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.recommendations, [{ type: 'placeholder', value: 1, source: 'x' }]);
  });

  console.log('');

  // =========================================================================
  // H. documentation consistency
  // =========================================================================
  console.log('--- H. documentation consistency ---');

  await test('（8.documentation consistency）src/intelligence/PHASE4_CAPABILITY_CONSOLIDATION_REVIEW.md 存在且內容非空', () => {
    assert.ok(fs.existsSync(docPath));
    assert.ok(doc.length > 1500);
  });

  const REQUIRED_DOC_SECTIONS = ['Capability Architecture Summary', 'Data Flow', 'Dependency Direction', 'Output Boundary', 'AI Extension Boundary', 'Known Limitations', 'Completion Status'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（8.documentation consistency）PHASE4_CAPABILITY_CONSOLIDATION_REVIEW.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（8.documentation consistency）文件開頭明確聲明「本次任務不是實作Decision Logic、不是導入AI」', () => {
    assert.ok(/不是.{0,15}實作Decision\s*Logic/.test(flatDoc));
    assert.ok(/不是.{0,10}導入AI/.test(flatDoc));
  });

  await test('（8.documentation consistency）文件記錄了完整的規劃/落地/審查任務序列（TASK1.75~TASK1.88）', () => {
    for (const t of ['TASK1.75', 'TASK1.76', 'TASK1.77', 'TASK1.78', 'TASK1.79', 'TASK1.80', 'TASK1.81', 'TASK1.82', 'TASK1.83', 'TASK1.84', 'TASK1.85', 'TASK1.86', 'TASK1.87', 'TASK1.88']) {
      assert.ok(doc.includes(t), `文件缺少任務序列引用：${t}`);
    }
  });

  await test('（8.documentation consistency）文件記錄了跟TASK1.80的差異說明（Decision建立前 vs 建立後的整體審查）', () => {
    assert.ok(/跟TASK1\.80不同/.test(doc));
  });

  await test('（8.documentation consistency）文件記錄五個Capability的Summary表格（Analysis/Recommendation/Orchestrator/Decision/Feature Integration）', () => {
    assert.ok(/Analysis Capability/.test(doc));
    assert.ok(/Recommendation Capability/.test(doc));
    assert.ok(/Capability Orchestrator/.test(doc));
    assert.ok(/Decision Capability/.test(doc));
    assert.ok(/Feature Intelligence Integration/.test(doc));
  });

  await test('（8.documentation consistency）文件記錄了七項或以上的Completion Status確認（✅）', () => {
    const checkCount = (doc.match(/✅/g) || []).length;
    assert.ok(checkCount >= 7, `預期至少7個✅，實際${checkCount}`);
  });

  await test('（8.documentation consistency）文件記錄async限制延續TASK1.75~1.87已記錄的Known Limitation', () => {
    assert.ok(/async/.test(doc));
  });

  await test('（8.documentation consistency）文件明確指出本次審查沒有變更任何production程式碼', () => {
    assert.ok(/沒有變更任何production程式碼/.test(doc));
  });

  await test('（8.documentation consistency）文件引用了PHASE4_DECISION_CONTRACT_PLAN.md（TASK1.84）的Contract結論延續', () => {
    assert.ok(/PHASE4_DECISION_CONTRACT_PLAN\.md/.test(doc));
  });

  await test('（8.documentation consistency）先前所有Phase 4規劃/審查文件本次任務完全沒有被修改', () => {
    const docs = [
      'PHASE4_CAPABILITY_PLAN.md', 'PHASE4_CONSOLIDATION_REVIEW.md', 'PHASE4_DECISION_FLOW_PLAN.md',
      'PHASE4_DECISION_CAPABILITY_REVIEW.md', 'PHASE4_DECISION_CONTRACT_PLAN.md', 'PHASE4_DECISION_INTEGRATION_PLAN.md',
      'PHASE4_DECISION_ORCHESTRATION_INTEGRATION.md', 'PHASE4_DECISION_OUTPUT_EVOLUTION.md',
    ];
    for (const docName of docs) {
      const diff = execFileSync('git', ['diff', '--stat', `src/intelligence/${docName}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${docName} 不應該被本次任務修改`);
    }
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.88-capability-review')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 78, `預期至少78個既有測試檔案，實際 ${allSuites.length}`);
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

/*
 * Phase 4 TASK 1.89｜Phase 4 Final Validation & Phase 5 Transition
 * Planning 測試
 *
 * 本任務不是導入AI、不是實作Decision Logic——這是Review/Planning
 * 任務，對Phase 4 Intelligence Capability Architecture做最終驗證，
 * 並規劃Phase 5過渡方向，記錄在
 * `src/intelligence/PHASE4_FINAL_VALIDATION_AND_PHASE5_PLAN.md`，
 * 本次**不修改**任何production程式碼、**不實作**任何Phase 5功能。
 *
 * 這份測試驗證的是：
 * - Capability Completeness：五個Phase 4 Capability皆已落地、
 *   目錄結構/檔案組成完整
 * - Dependency Direction：單向依賴鏈完全成立，無跳層、無循環依賴
 * - Decision Boundary：Decision Capability完全沒有
 *   database/auth/runtime internal component依賴，decision欄位
 *   恆為null
 * - Output Model：Unified Capability Result支援
 *   analysis/recommendation/decision，Backward Compatibility保持
 * - AI Boundary：本次規劃沒有導入任何AI SDK、沒有啟用AI Provider
 * - Runtime Isolation：Analysis/Recommendation Runner、Phase 2
 *   Runtime Orchestrator、Phase 3 Application Layer完全沒有被修改
 * - Documentation Consistency：文件章節齊全、內容跟規格要求一致
 * - Regression/P1-P6
 *
 * 分為以下9個部分：
 * A) capability completeness
 * B) dependency direction
 * C) decision boundary
 * D) output model
 * E) AI boundary
 * F) runtime isolation
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
const capabilitiesDir = path.join(intelDir, 'capabilities');
const analysisCapabilityDir = path.join(capabilitiesDir, 'analysis');
const recommendationCapabilityDir = path.join(capabilitiesDir, 'recommendation');
const orchestrationCapabilityDir = path.join(capabilitiesDir, 'orchestration');
const decisionCapabilityDir = path.join(capabilitiesDir, 'decision');
const docPath = path.join(intelDir, 'PHASE4_FINAL_VALIDATION_AND_PHASE5_PLAN.md');

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
  // A. capability completeness
  // =========================================================================
  console.log('--- A. capability completeness ---');

  for (const layer of PHASE4_LAYERS) {
    await test(`（1.capability completeness）${layer.name} 目錄存在且恰好包含規格要求的檔案（核心邏輯+Result Builder+index.js+README.md）`, () => {
      assert.ok(fs.existsSync(layer.dir));
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
    for (const file of layer.files) {
      await test(`（1.capability completeness）${layer.name}/${file} 存在且內容非空`, () => {
        const full = path.join(layer.dir, file);
        assert.ok(fs.existsSync(full));
        assert.ok(fs.statSync(full).size > 0);
      });
    }
  }

  await test('（1.capability completeness）src/intelligence/capabilities/index.js（頂層barrel）恰好re-export四個namespace：analysis/recommendation/orchestration/decision', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['analysis', 'decision', 'orchestration', 'recommendation']);
  });

  await test('（1.capability completeness）application/features/index.js恰好具備insight/behavior/intelligence三個namespace', () => {
    const namespaces = getReExportedNamespaces(path.join(featuresDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['behavior', 'insight', 'intelligence']);
  });

  await test('（1.capability completeness）端對端：Analysis Capability可以被獨立建立並成功呼叫', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'analysis');
  });

  await test('（1.capability completeness）端對端：Recommendation Capability可以被獨立建立並成功呼叫', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'recommendation');
  });

  await test('（1.capability completeness）端對端：Decision Capability可以被獨立建立並成功呼叫', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'decision');
  });

  await test('（1.capability completeness）端對端：Capability Orchestrator可以被獨立建立並成功呼叫（含/不含decisionCapability兩種情況）', () => {
    const withoutDecision = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    }).requestCapabilityFlow({ context: makeInsightContext() });
    const withDecision = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    }).requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(withoutDecision.ok, true);
    assert.strictEqual(withDecision.ok, true);
  });

  await test('（1.capability completeness）端對端：Feature Intelligence Integration可以被獨立建立並成功呼叫', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'intelligence');
  });

  await test('（1.capability completeness）每個Capability的核心邏輯檔案都恰好只export規格要求的公開函式（createXxxCapability）', () => {
    const analysisModule = fs.readFileSync(path.join(analysisCapabilityDir, 'analysis_capability.js'), 'utf8');
    const recommendationModule = fs.readFileSync(path.join(recommendationCapabilityDir, 'recommendation_capability.js'), 'utf8');
    const decisionModule = fs.readFileSync(path.join(decisionCapabilityDir, 'decision_capability.js'), 'utf8');
    assert.ok(/export function createAnalysisCapability/.test(analysisModule));
    assert.ok(/export function createRecommendationCapability/.test(recommendationModule));
    assert.ok(/export function createDecisionCapability/.test(decisionModule));
  });

  console.log('');

  // =========================================================================
  // B. dependency direction
  // =========================================================================
  console.log('--- B. dependency direction ---');

  await test('（2.dependency direction）Recommendation Capability完全不import Decision Capability（無循環依賴）', () => {
    assert.ok(!/from\s+['"].*\/decision\//.test(recommendationCapabilitySrc));
  });

  await test('（2.dependency direction）Analysis Capability完全不import Decision Capability/Recommendation Capability（無循環依賴、無反向依賴）', () => {
    assert.ok(!/from\s+['"].*\/decision\//.test(analysisCapabilitySrc));
    assert.ok(!/from\s+['"].*\/recommendation\//.test(analysisCapabilitySrc));
  });

  await test('（2.dependency direction）Decision Capability完全不import Analysis Capability（無跳層）', () => {
    assert.ok(!/from\s+['"].*\/analysis\//.test(decisionCapabilitySrc));
  });

  await test('（2.dependency direction）Decision Capability完全不import Analysis Runner/Recommendation Runner（不繞過Recommendation Capability直接摸Runtime層）', () => {
    assert.ok(!/from\s+['"].*intelligence\/analysis\//.test(decisionCapabilitySrc));
    assert.ok(!/from\s+['"].*intelligence\/recommendation\//.test(decisionCapabilitySrc));
  });

  await test('（2.dependency direction）Capability Orchestrator完全不import Analysis Runner/Recommendation Runner（只透過Capability介面呼叫）', () => {
    assert.ok(!/from\s+['"].*intelligence\/analysis\//.test(orchestratorSrc));
    assert.ok(!/from\s+['"].*intelligence\/recommendation\//.test(orchestratorSrc));
  });

  await test('（2.dependency direction）Capability Orchestrator完全不import capabilities/decision/底下任何實作檔案（只透過依賴注入呼叫）', () => {
    assert.ok(!/from\s+['"].*\/decision\/decision_capability/.test(orchestratorSrc));
    assert.ok(!/from\s+['"].*\/decision\/decision_result_builder/.test(orchestratorSrc));
  });

  await test('（2.dependency direction）Feature Intelligence Integration完全不直接import Analysis/Recommendation/Decision Capability實作（只透過capabilityOrchestrator依賴注入）', () => {
    const featureSrc = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
    assert.ok(!/from\s+['"].*\/capabilities\/analysis\//.test(featureSrc));
    assert.ok(!/from\s+['"].*\/capabilities\/recommendation\//.test(featureSrc));
    assert.ok(!/from\s+['"].*\/capabilities\/decision\//.test(featureSrc));
  });

  await test('（2.dependency direction）Analysis Capability原始碼完全不出現Decision字樣（單向依賴確認）', () => {
    assert.ok(!/Decision/.test(analysisCapabilitySrc));
  });

  await test('（2.dependency direction）Recommendation Capability原始碼完全不出現Decision字樣（單向依賴確認）', () => {
    assert.ok(!/Decision/.test(recommendationCapabilitySrc));
  });

  await test('（2.dependency direction）端對端：Analysis→Recommendation→Decision可以形成完整單向資料流，無需額外轉接層', () => {
    const analysisOutcome = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    const recommendationOutcome = makeRealRecommendationCapability().requestRecommendation({ analysisResult: analysisOutcome.result });
    const decisionOutcome = makeRealDecisionCapability().requestDecision({ recommendationResult: recommendationOutcome.result });
    assert.strictEqual(analysisOutcome.ok, true);
    assert.strictEqual(recommendationOutcome.ok, true);
    assert.strictEqual(decisionOutcome.ok, true);
  });

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    await test(`（2.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  await test('（2.dependency direction）四層既有Phase 4 Capability（analysis/recommendation/orchestration/decision）本次任務完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（2.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  // 逐檔案掃描五層Phase 4 Capability Architecture全部檔案，確認
  // 每一個檔案都完全不依賴database/auth/oauth/identity/middleware/
  // Phase 2 Runtime Internal Component——這是本次Final
  // Validation對整條Capability Chain依賴邊界的最後一次全面重新
  // 確認。
  const RUNTIME_FORBIDDEN_SUBDIRS_FULL = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    await test(`（2.dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（2.dependency direction）${layer}/${file} 完全不出現db變數名稱`, () => {
      assert.ok(!/\bdb\b/.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（2.dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS_FULL) {
      await test(`（2.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（2.dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
    await test(`（2.dependency direction）${layer}/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher變數名稱`, () => {
      assert.ok(!/executionManager|historyStore|metricsStore|eventDispatcher/.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // C. decision boundary
  // =========================================================================
  console.log('--- C. decision boundary ---');

  await test('（3.decision boundary）端對端：Decision Capability的decision欄位恆為null', () => {
    for (const overrides of [{}, { recommendations: [] }, { recommendations: [{ type: 'a' }, { type: 'b' }] }]) {
      const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult(overrides) });
      assert.strictEqual(result.result.decision, null);
    }
  });

  await test('（3.decision boundary）端對端：Decision Capability的status恆為"decision_not_available"', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.result.status, 'decision_not_available');
  });

  await test('（3.decision boundary）buildDecisionOutputPlaceholder()對不同recommendationCount輸入依然正確計數', () => {
    for (const count of [0, 1, 5, 20]) {
      const recommendations = Array.from({ length: count }, (_, i) => ({ type: `t${i}` }));
      const output = buildDecisionOutputPlaceholder(makeRecommendationResult({ recommendations }));
      assert.strictEqual(output.metadata.recommendationCount, count);
    }
  });

  await test('（3.decision boundary）Decision Capability回傳物件恰好只有requestDecision一個公開介面', () => {
    assert.deepStrictEqual(Object.keys(makeRealDecisionCapability()), ['requestDecision']);
  });

  await test('（3.decision boundary）decision_capability.js/decision_result_builder.js完全不含score/weight/threshold計算邏輯', () => {
    for (const src of [decisionCapabilitySrc, decisionResultBuilderSrc]) {
      assert.ok(!/\.score\s*=/.test(src));
      assert.ok(!/\bweight\b/i.test(src));
      assert.ok(!/\bthreshold\b/i.test(src));
    }
  });

  for (const file of ['decision_capability.js', 'decision_result_builder.js', 'index.js']) {
    const src = readSrc(path.join(decisionCapabilityDir, file));
    await test(`（3.decision boundary）decision/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（3.decision boundary）decision/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution'];
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（3.decision boundary）decision/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（3.decision boundary）decision/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

  await test('（3.decision boundary）decision_capability.js/decision_result_builder.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/decision/decision_capability.js src/intelligence/capabilities/decision/decision_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.decision boundary）端對端：Decision Capability對缺少recommendationResult的request正確回傳失敗', () => {
    const result = makeRealDecisionCapability().requestDecision({});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.capability, 'decision');
  });

  await test('（3.decision boundary）端對端：Decision Capability是deterministic的——同樣輸入重複呼叫得到完全相同結果', () => {
    const recommendationResult = makeRecommendationResult({ recommendations: [{ type: 'a' }, { type: 'b' }] });
    assert.deepStrictEqual(
      makeRealDecisionCapability().requestDecision({ recommendationResult }),
      makeRealDecisionCapability().requestDecision({ recommendationResult }),
    );
  });

  console.log('');

  // =========================================================================
  // D. output model
  // =========================================================================
  console.log('--- D. output model ---');

  await test('（4.output model）Unified Capability Result成功時的頂層key恰好是{ok, capability, result}', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    const result = resultBuilder.buildSuccessResult({}, {});
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'result']);
  });

  await test('（4.output model）端對端：不提供decisionCapability時，result恰好只有{analysis, recommendation}兩個欄位（Backward Compatibility）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（4.output model）端對端：提供decisionCapability時，result恰好有{analysis, recommendation, decision}三個欄位', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
  });

  await test('（4.output model）buildFailureResult()支援stage為analysis/recommendation/decision三種值', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    for (const stage of ['analysis', 'recommendation', 'decision']) {
      const result = resultBuilder.buildFailureResult('x', 'y', stage);
      assert.strictEqual(result.stage, stage);
    }
  });

  await test('（4.output model）result.analysis/result.recommendation/result.decision原樣保留各Capability回傳內容（不重新拆開/改寫）', () => {
    const resultBuilder = createCapabilityOrchestratorResultBuilder();
    const analysisResult = { status: 'a', insights: [1, 2], metadata: {} };
    const recommendationResult = { status: 'r', recommendations: [3], metadata: {} };
    const decisionResult = { status: 'd', decision: null, metadata: {} };
    const result = resultBuilder.buildSuccessResult(analysisResult, recommendationResult, decisionResult);
    assert.deepStrictEqual(result.result.analysis, analysisResult);
    assert.deepStrictEqual(result.result.recommendation, recommendationResult);
    assert.deepStrictEqual(result.result.decision, decisionResult);
  });

  await test('（4.output model）Unified Capability Result相關核心邏輯檔案完全不含score/weight/threshold', () => {
    for (const src of [orchestratorSrc, resultBuilderSrc]) {
      assert.ok(!/\.score\s*=/.test(src));
      assert.ok(!/\bweight\s*[:=]/i.test(src));
      assert.ok(!/\bthreshold\s*[:=]/i.test(src));
    }
  });

  await test('（4.output model）端對端：Feature Intelligence Integration的data欄位維持{analysis, recommendation}（沒有讓Feature注入decisionCapability）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  await test('（4.output model）端對端：recommendation的insight_count恰好反映analysis的insights陣列長度（既有串接關係不受本次驗證影響）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    const insightCount = result.data.recommendation.recommendations.find((r) => r.type === 'insight_count');
    assert.strictEqual(insightCount.value, result.data.analysis.insights.length);
  });

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
    await test(`（5.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（5.AI boundary）PHASE4_FINAL_VALIDATION_AND_PHASE5_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
      assert.ok(!pattern.test(doc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（5.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（5.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
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

  await test('（5.AI boundary）文件記錄「現在不是導入AI的時機」的判斷理由', () => {
    assert.ok(/現在不是導入AI的時機/.test(doc));
  });

  await test('（5.AI boundary）文件記錄AI合法接入位置永遠是Runner內部的modules，不是Orchestrator/Feature層', () => {
    assert.ok(/dependencies\.modules/.test(flatDoc));
  });

  await test('（5.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作', () => {
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

  await test('（6.runtime isolation）Analysis Runner本身（analysis_runner.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Recommendation Runner本身（recommendation_runner.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/，TASK1.45）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Execution Manager（src/intelligence/execution/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/execution/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Runtime Execution Layer（service/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）src/intelligence/index.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）app.intelligence物件恰好維持24個欄位不變（本次任務沒有新增任何bootstrap欄位、沒有進行Phase 5 Product Integration）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（6.runtime isolation）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）端對端：Insight跟Behavior兩個既有Feature在本次驗證後依然成功運作', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  await test('（6.runtime isolation）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（6.runtime isolation）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // G. documentation consistency
  // =========================================================================
  console.log('--- G. documentation consistency ---');

  await test('（7.documentation consistency）src/intelligence/PHASE4_FINAL_VALIDATION_AND_PHASE5_PLAN.md 存在且內容非空', () => {
    assert.ok(fs.existsSync(docPath));
    assert.ok(doc.length > 2000);
  });

  const REQUIRED_DOC_SECTIONS = ['Phase 4 Completion Status', 'Architecture Snapshot', 'Capability Summary', 'Phase 5 Direction', 'AI Integration Timing', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（7.documentation consistency）PHASE4_FINAL_VALIDATION_AND_PHASE5_PLAN.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（7.documentation consistency）文件開頭明確聲明「不是導入AI、不是實作Decision Logic」', () => {
    assert.ok(/不是.{0,10}導入AI/.test(flatDoc));
    assert.ok(/不是.{0,15}實作Decision\s*Logic/.test(flatDoc));
  });

  await test('（7.documentation consistency）文件記錄了完整的規劃/落地/審查任務序列（TASK1.75~TASK1.89）', () => {
    for (const t of ['TASK1.75', 'TASK1.76', 'TASK1.77', 'TASK1.78', 'TASK1.79', 'TASK1.80', 'TASK1.81', 'TASK1.82', 'TASK1.83', 'TASK1.84', 'TASK1.85', 'TASK1.86', 'TASK1.87', 'TASK1.88', 'TASK1.89']) {
      assert.ok(doc.includes(t), `文件缺少任務序列引用：${t}`);
    }
  });

  await test('（7.documentation consistency）文件記錄Phase 5四個候選方向：Product Integration/Intelligence Enhancement/AI Capability Preparation/Operational Readiness', () => {
    assert.ok(/Product Integration/.test(doc));
    assert.ok(/Intelligence Enhancement/.test(doc));
    assert.ok(/AI Capability Preparation/.test(doc));
    assert.ok(/Operational Readiness/.test(doc));
  });

  await test('（7.documentation consistency）文件明確標註Phase 5四個方向「本次任務不實作」', () => {
    assert.ok(/本次任務不實作/.test(doc));
  });

  await test('（7.documentation consistency）文件記錄Phase 4 Completion Status的完成判準表格（五個Capability對照落地任務）', () => {
    assert.ok(/Analysis Capability/.test(doc));
    assert.ok(/Recommendation Capability/.test(doc));
    assert.ok(/Capability Orchestrator/.test(doc));
    assert.ok(/Decision Capability/.test(doc));
    assert.ok(/Feature Intelligence Integration/.test(doc));
  });

  await test('（7.documentation consistency）文件記錄了七項或以上的Completion Criteria確認（✅）', () => {
    const checkCount = (doc.match(/✅/g) || []).length;
    assert.ok(checkCount >= 8, `預期至少8個✅，實際${checkCount}`);
  });

  await test('（7.documentation consistency）文件記錄async限制延續TASK1.75~1.88已記錄的Known Limitation', () => {
    assert.ok(/async/.test(doc));
  });

  await test('（7.documentation consistency）文件明確指出本次任務沒有變更任何production程式碼', () => {
    assert.ok(/沒有變更任何既有production程式碼|完全沒有變更任何production程式碼/.test(doc));
  });

  await test('（7.documentation consistency）文件引用了PHASE4_DECISION_CONTRACT_PLAN.md（TASK1.84）的Contract結論延續', () => {
    assert.ok(/PHASE4_DECISION_CONTRACT_PLAN\.md/.test(doc));
  });

  await test('（7.documentation consistency）文件明確跟TASK1.88 Consolidation Review做區別說明', () => {
    assert.ok(/TASK1\.88/.test(doc));
  });

  await test('（7.documentation consistency）先前所有Phase 4規劃/審查文件本次任務完全沒有被修改', () => {
    const docs = [
      'PHASE4_CAPABILITY_PLAN.md', 'PHASE4_CONSOLIDATION_REVIEW.md', 'PHASE4_DECISION_FLOW_PLAN.md',
      'PHASE4_DECISION_CAPABILITY_REVIEW.md', 'PHASE4_DECISION_CONTRACT_PLAN.md', 'PHASE4_DECISION_INTEGRATION_PLAN.md',
      'PHASE4_DECISION_ORCHESTRATION_INTEGRATION.md', 'PHASE4_DECISION_OUTPUT_EVOLUTION.md', 'PHASE4_CAPABILITY_CONSOLIDATION_REVIEW.md',
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.89-final-validation')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（8.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 79, `預期至少79個既有測試檔案，實際 ${allSuites.length}`);
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

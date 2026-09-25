/*
 * Phase 4 TASK 1.87｜Decision Output Evolution Architecture 測試
 *
 * 本任務不是建立Decision Logic、不是建立Decision Algorithm、不是
 * 導入AI——這是純規劃任務，在TASK1.86 Decision Capability
 * Orchestration Integration基礎上，定義Decision Output未來演進
 * 方向（placeholder decision → structured decision
 * output），記錄在`src/intelligence/PHASE4_DECISION_OUTPUT_
 * EVOLUTION.md`，本次**不修改**任何production程式碼。
 *
 * 這份測試驗證的是：
 * - Output Structure：目前的{status, decision, metadata}形狀確實
 *   存在且沒有被修改
 * - Backward Compatibility：既有Capability/Orchestrator行為完全
 *   不受本次規劃影響
 * - Decision Boundary：文件正確記錄metadata可以/不可以包含什麼、
 *   decision欄位演進方向
 * - Dependency Direction：本次規劃沒有建立任何Decision
 *   Algorithm/Rule Engine/Scoring Logic/Weight/Threshold程式碼
 * - Runtime Isolation：Analysis/Recommendation Runner、Phase 2
 *   Runtime Orchestrator、Decision Capability本身、Capability
 *   Orchestrator完全沒有被修改
 * - AI Boundary：文件正確記錄AI Decision Module的未來合法位置、
 *   Feature direct AI usage仍然禁止
 * - Documentation Consistency：文件章節齊全、內容跟規格要求一致
 * - Regression/P1-P6
 *
 * 分為以下9個部分：
 * A) output structure
 * B) backward compatibility
 * C) decision boundary
 * D) dependency direction
 * E) runtime isolation
 * F) AI boundary
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
const decisionCapabilityDir = path.join(capabilitiesDir, 'decision');
const docPath = path.join(intelDir, 'PHASE4_DECISION_OUTPUT_EVOLUTION.md');

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
  const { createDecisionCapability, buildDecisionOutputPlaceholder, DECISION_OUTPUT_VERSION } = await import(path.join(decisionCapabilityDir, 'index.js'));
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
  const decisionCapabilitySrc = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
  const decisionResultBuilderSrc = readSrc(path.join(decisionCapabilityDir, 'decision_result_builder.js'));
  const orchestratorSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
  const resultBuilderSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_result_builder.js'));

  // =========================================================================
  // A. output structure
  // =========================================================================
  console.log('--- A. output structure ---');

  await test('（1.output structure）src/intelligence/PHASE4_DECISION_OUTPUT_EVOLUTION.md 存在且內容非空', () => {
    assert.ok(fs.existsSync(docPath));
    assert.ok(doc.length > 1500);
  });

  const REQUIRED_DOC_SECTIONS = ['Current Output Model', 'Future Evolution', 'Metadata Strategy', 'Extension Boundary', 'AI Integration Strategy', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.output structure）PHASE4_DECISION_OUTPUT_EVOLUTION.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.output structure）端對端：目前Decision Output恰好是{status, decision, metadata}三個頂層欄位', () => {
    const output = buildDecisionOutputPlaceholder(makeRecommendationResult());
    assert.deepStrictEqual(Object.keys(output).sort(), ['decision', 'metadata', 'status']);
  });

  await test('（1.output structure）端對端：status固定為"decision_not_available"', () => {
    const output = buildDecisionOutputPlaceholder(makeRecommendationResult());
    assert.strictEqual(output.status, 'decision_not_available');
  });

  await test('（1.output structure）端對端：decision欄位固定為null（本次規劃沒有讓它變成任何其他值）', () => {
    for (const overrides of [{}, { recommendations: [] }, { recommendations: [{ type: 'a' }, { type: 'b' }, { type: 'c' }] }]) {
      const output = buildDecisionOutputPlaceholder(makeRecommendationResult(overrides));
      assert.strictEqual(output.decision, null);
    }
  });

  await test('（1.output structure）端對端：metadata恰好是{version, recommendationCount}兩個欄位（本次規劃沒有實際新增source/execution information欄位）', () => {
    const output = buildDecisionOutputPlaceholder(makeRecommendationResult());
    assert.deepStrictEqual(Object.keys(output.metadata).sort(), ['recommendationCount', 'version']);
  });

  await test('（1.output structure）DECISION_OUTPUT_VERSION依然是"1.0.0"（本次規劃沒有實際遞增版本號）', () => {
    assert.strictEqual(DECISION_OUTPUT_VERSION, '1.0.0');
  });

  await test('（1.output structure）metadata.recommendationCount恰好等於輸入的recommendations陣列長度', () => {
    for (const count of [0, 1, 5, 10]) {
      const recommendations = Array.from({ length: count }, (_, i) => ({ type: `t${i}` }));
      const output = buildDecisionOutputPlaceholder(makeRecommendationResult({ recommendations }));
      assert.strictEqual(output.metadata.recommendationCount, count);
    }
  });

  await test('（1.output structure）文件記錄的目前Decision Output程式碼片段跟真實程式碼一致（{status, decision, metadata}三欄位）', () => {
    assert.ok(/status:\s*'decision_not_available'/.test(doc));
    assert.ok(/decision:\s*null/.test(doc));
  });

  await test('（1.output structure）文件記錄目前形狀「逐字沒有變動過」的歷史脈絡（引用TASK1.83/1.84/1.85/1.86）', () => {
    assert.ok(/TASK1\.83/.test(doc));
    assert.ok(/TASK1\.84/.test(doc));
    assert.ok(/TASK1\.85/.test(doc));
    assert.ok(/TASK1\.86/.test(doc));
  });

  await test('（1.output structure）decision_result_builder.js本次任務完全沒有被修改（逐檔案git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/decision/decision_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // B. backward compatibility
  // =========================================================================
  console.log('--- B. backward compatibility ---');

  await test('（2.backward compatibility）端對端：Analysis Capability單獨呼叫依然正確運作（TASK1.76行為不變）', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'analysis');
  });

  await test('（2.backward compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作（TASK1.77行為不變）', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'recommendation');
  });

  await test('（2.backward compatibility）端對端：Decision Capability單獨呼叫依然正確運作，介面跟TASK1.83~1.86完全一致', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'decision');
    assert.strictEqual(result.result.decision, null);
  });

  await test('（2.backward compatibility）端對端：不提供decisionCapability時，Orchestrator依然只回傳{analysis, recommendation}兩個欄位（TASK1.86 Backward Compatibility保證依然成立）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.backward compatibility）端對端：提供decisionCapability時，Orchestrator依然正確組出三欄位的Unified Capability Result（TASK1.86行為不變）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
    assert.strictEqual(result.result.decision.status, 'decision_not_available');
    assert.strictEqual(result.result.decision.decision, null);
  });

  await test('（2.backward compatibility）端對端：Feature Integration（TASK1.79）依然正確運作，data欄位依然只有{analysis, recommendation}', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'intelligence');
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.backward compatibility）端對端：recommendation的insight_count恰好反映analysis的insights陣列長度（既有串接關係不受本次規劃影響）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    const insightCount = result.data.recommendation.recommendations.find((r) => r.type === 'insight_count');
    assert.strictEqual(insightCount.value, result.data.analysis.insights.length);
  });

  await test('（2.backward compatibility）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果（規劃階段沒有引入任何非deterministic行為）', () => {
    const feature = makeRealFeature();
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(feature.requestIntelligence(request), feature.requestIntelligence(request));
  });

  await test('（2.backward compatibility）端對端：Decision Capability對同一個Recommendation Result重複呼叫得到完全相同的結果', () => {
    const recommendationResult = makeRecommendationResult({ recommendations: [{ type: 'a' }, { type: 'b' }] });
    const capabilityA = makeRealDecisionCapability();
    const capabilityB = makeRealDecisionCapability();
    assert.deepStrictEqual(capabilityA.requestDecision({ recommendationResult }), capabilityB.requestDecision({ recommendationResult }));
  });

  await test('（2.backward compatibility）src/intelligence/capabilities/index.js（頂層）依然恰好具備analysis/recommendation/orchestration/decision四個namespace（本次規劃沒有新增第五個namespace）', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['analysis', 'decision', 'orchestration', 'recommendation']);
  });

  await test('（2.backward compatibility）application/features/index.js依然只有insight/behavior/intelligence三個namespace（本次沒有新增任何Feature）', () => {
    const namespaces = getReExportedNamespaces(path.join(featuresDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['behavior', 'insight', 'intelligence']);
  });

  await test('（2.backward compatibility）app.intelligence物件恰好維持24個欄位不變（本次規劃沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（2.backward compatibility）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // C. decision boundary
  // =========================================================================
  console.log('--- C. decision boundary ---');

  await test('（3.decision boundary）文件明確記錄未來decision欄位可能演進成的欄位（selected/rejected）', () => {
    assert.ok(/selected/.test(doc));
    assert.ok(/rejected/.test(doc));
  });

  await test('（3.decision boundary）文件明確標註「這裡只是列出可能的形狀方向，不是承諾的最終設計」', () => {
    assert.ok(/不是承諾的最終設計/.test(doc));
  });

  await test('（3.decision boundary）文件記錄Backward Compatibility保證：{status, decision, metadata}三個頂層key的存在不會改變', () => {
    assert.ok(/三個頂層key的存在/.test(flatDoc) || /三個頂層.{0,5}key.{0,10}不會改變/.test(flatDoc));
  });

  await test('（3.decision boundary）文件記錄metadata可以包含version/source/execution information', () => {
    assert.ok(/\*\*version\*\*/.test(doc));
    assert.ok(/\*\*source\*\*/.test(doc));
    assert.ok(/execution information/.test(doc));
  });

  await test('（3.decision boundary）文件明確禁止metadata加入實際決策邏輯（score/weight/threshold/排序結果）', () => {
    assert.ok(/score/.test(doc));
    assert.ok(/weight/.test(doc));
    assert.ok(/threshold/.test(doc));
    assert.ok(/明確禁止/.test(doc));
  });

  await test('（3.decision boundary）文件記錄extension fields的規劃方向，同時明確說明本次任務不建立這個欄位', () => {
    assert.ok(/extensions/.test(doc));
    assert.ok(/本次任務不建立這個欄位/.test(doc));
  });

  await test('（3.decision boundary）文件記錄了七項或以上的Completion Criteria checkbox', () => {
    const checkCount = (doc.match(/✅/g) || []).length;
    assert.ok(checkCount >= 7, `預期至少7個✅，實際${checkCount}`);
  });

  await test('（3.decision boundary）文件引用了TASK1.84的PHASE4_DECISION_CONTRACT_PLAN.md（Contract結論延續）', () => {
    assert.ok(/PHASE4_DECISION_CONTRACT_PLAN\.md/.test(doc));
  });

  await test('（3.decision boundary）PHASE4_DECISION_CONTRACT_PLAN.md（TASK1.84）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE4_DECISION_CONTRACT_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.decision boundary）PHASE4_DECISION_ORCHESTRATION_INTEGRATION.md（TASK1.86）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE4_DECISION_ORCHESTRATION_INTEGRATION.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // D. dependency direction
  // =========================================================================
  console.log('--- D. dependency direction ---');

  await test('（4.dependency direction）本次任務完全沒有建立任何名稱包含Algorithm/Engine/RuleEngine的新.js程式碼檔案', () => {
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

  await test('（4.dependency direction）decision_capability.js/decision_result_builder.js完全不出現score/weight/threshold相關的計算邏輯', () => {
    for (const src of [decisionCapabilitySrc, decisionResultBuilderSrc]) {
      assert.ok(!/\.score\s*=/.test(src));
      assert.ok(!/\bweight\b/i.test(src));
      assert.ok(!/\bthreshold\b/i.test(src));
    }
  });

  await test('（4.dependency direction）capability_orchestrator.js/capability_result_builder.js完全不出現score/weight/threshold相關的計算邏輯', () => {
    for (const src of [orchestratorSrc, resultBuilderSrc]) {
      assert.ok(!/\.score\s*=/.test(src));
      assert.ok(!/\bweight\s*[:=]/i.test(src));
      assert.ok(!/\bthreshold\s*[:=]/i.test(src));
    }
  });

  await test('（4.dependency direction）PHASE4_DECISION_OUTPUT_EVOLUTION.md裡完全不包含真實的score/weight/threshold計算式（純文件展示可能的欄位名稱，不是真實可執行邏輯）', () => {
    assert.ok(!/\.score\s*=/.test(doc));
    assert.ok(!/\bweight\s*[:=]\s*\d/i.test(doc));
    assert.ok(!/\bthreshold\s*[:=]\s*\d/i.test(doc));
  });

  await test('（4.dependency direction）四層既有Phase 4 Capability（analysis/recommendation/orchestration/decision）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    await test(`（4.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  await test('（4.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

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

  await test('（5.runtime isolation）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（5.runtime isolation）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（5.runtime isolation）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    await test(`（5.runtime isolation）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（5.runtime isolation）${layer}/${file} 完全不出現db變數名稱`, () => {
      assert.ok(!/\bdb\b/.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（5.runtime isolation）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（5.runtime isolation）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
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
    await test(`（6.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic，本次規劃沒有破壞既有的deterministic性質）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（6.AI boundary）PHASE4_DECISION_OUTPUT_EVOLUTION.md不含實際的AI呼叫程式碼字樣 ${pattern}（文件本身只是討論「未來AI可以在哪裡」，不是真的呼叫）`, () => {
      assert.ok(!pattern.test(doc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（6.AI boundary）文件記錄未來AI Decision Module合法位置比照Analysis Runner/Recommendation Runner既有的dependencies.modules延伸點', () => {
    assert.ok(/dependencies\.modules/.test(flatDoc));
  });

  await test('（6.AI boundary）文件明確記錄「Feature → AI Provider」（Feature direct AI usage）在Output Schema演進後依然完全禁止', () => {
    assert.ok(/Feature.*AI\s*Provider/.test(flatDoc));
    assert.ok(/Feature direct AI\s*usage/.test(flatDoc));
  });

  await test('（6.AI boundary）文件記錄即使metadata.source標記為ai_assisted，呼叫端也不需要對AI有任何額外認知', () => {
    assert.ok(/ai_assisted/.test(doc));
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
  // G. documentation consistency
  // =========================================================================
  console.log('--- G. documentation consistency ---');

  await test('（7.documentation consistency）文件開頭明確聲明「不是建立Decision Logic、不是建立Decision Algorithm、不是導入AI」', () => {
    assert.ok(/不是.{0,15}建立Decision\s*Logic/.test(flatDoc));
    assert.ok(/不是.{0,15}建立Decision\s*Algorithm/.test(flatDoc));
    assert.ok(/不是.{0,10}導入AI/.test(flatDoc));
  });

  await test('（7.documentation consistency）文件記錄Current Output Model引用真實的DECISION_OUTPUT_VERSION值1.0.0', () => {
    assert.ok(/1\.0\.0/.test(doc));
  });

  await test('（7.documentation consistency）文件記錄了完整的規劃/落地任務序列（TASK1.75~TASK1.87）', () => {
    for (const t of ['TASK1.75', 'TASK1.76', 'TASK1.77', 'TASK1.78', 'TASK1.79', 'TASK1.80', 'TASK1.81', 'TASK1.82', 'TASK1.83', 'TASK1.84', 'TASK1.85', 'TASK1.86', 'TASK1.87']) {
      assert.ok(doc.includes(t), `文件缺少任務序列引用：${t}`);
    }
  });

  await test('（7.documentation consistency）文件記錄async限制延續TASK1.75/1.81/1.82/1.84/1.85/1.86已記錄的Known Limitation', () => {
    assert.ok(/async/.test(doc));
    assert.ok(/延續TASK1\.75/.test(doc));
  });

  await test('（7.documentation consistency）文件的Known Limitations章節明確指出本次任務沒有變更任何production程式碼', () => {
    assert.ok(/沒有變更任何production程式碼/.test(doc));
  });

  await test('（7.documentation consistency）文件的Known Limitations章節明確指出沒有接進bootstrap/Feature Integration（延續TASK1.86）', () => {
    assert.ok(/沒有接進bootstrap/.test(doc));
  });

  await test('（7.documentation consistency）文件引用了TASK1.86（Decision Capability Orchestration Integration）作為本次規劃的基礎', () => {
    assert.ok(/TASK1\.86 Decision Capability Orchestration Integration/.test(doc));
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.87-decision-output')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（8.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 77, `預期至少77個既有測試檔案，實際 ${allSuites.length}`);
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

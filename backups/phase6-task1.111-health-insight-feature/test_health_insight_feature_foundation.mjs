/*
 * Phase 6 TASK 1.111｜Health Insight Feature Foundation
 * Implementation 測試
 *
 * 本任務是Phase 6系列**第一個**寫production code的任務——依照
 * TASK1.106~1.110累積的規劃，把Health Insight Feature落地成
 * 最小可運作的骨架：接收Product-level request、呼叫既有
 * Capability Orchestrator、把Unified Capability Result轉換成
 * Health Insight formatted result。本次任務不實作UI、不建立
 * route/controller、不整合任何AI Provider、不建立database
 * schema。
 *
 * 這份測試驗證的是：
 * - health_insight_feature.js/health_insight_result_mapper.js
 *   各自的boundary正確
 * - 端對端：Health Insight Feature透過真實的Capability
 *   Orchestrator（進而真實的Analysis Capability/Recommendation
 *   Capability/Analysis Runner/Recommendation Runner）可以走完
 *   整條「Product-level request → Capability Orchestrator →
 *   Analysis Capability → Recommendation Capability → Health
 *   Insight Output」流程
 * - Health Insight Feature完全不直接依賴database/auth/session/
 *   execution manager/history store/metrics store
 * - 完全不繞過Capability Orchestrator直接呼叫Analysis/
 *   Recommendation/Decision Capability，也完全不import五個既有
 *   Product Boundary/Phase 3 Application Layer
 * - Analysis Runner/Recommendation Runner/Phase 2 Runtime
 *   Orchestrator/Phase 4 Capability Chain/五個既有Product
 *   Boundary/Phase 3 Application Layer本身完全沒有被修改
 * - Output Mapping符合TASK1.108四類輸出定義，不暴露runtime
 *   metadata/execution details/internal capability structure
 * - Error Boundary正確處理invalid input/capability failure/
 *   mapping failure，不暴露stack trace/internal exception
 * - export一致性、regression、P1-P6
 *
 * 分為以下14個部分：
 * A) Feature creation
 * B) Request handling
 * C) Capability integration
 * D) Analysis consumption
 * E) Recommendation consumption
 * F) Output mapping
 * G) Error handling
 * H) Dependency direction
 * I) Boundary protection
 * J) Runtime isolation
 * K) AI boundary
 * L) Regression validation
 * M) P1-P6
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
const productDir = path.join(intelDir, 'product');
const productEntryDir = path.join(productDir, 'entry');
const productContractDir = path.join(productDir, 'contract');
const productAdapterDir = path.join(productDir, 'adapter');
const productExecutionDir = path.join(productDir, 'execution');
const productOperationalDir = path.join(productDir, 'operational');
const productFeaturesDir = path.join(productDir, 'features');
const healthInsightDir = path.join(productFeaturesDir, 'health_insight');
const capabilitiesDir = path.join(intelDir, 'capabilities');
const analysisCapabilityDir = path.join(capabilitiesDir, 'analysis');
const recommendationCapabilityDir = path.join(capabilitiesDir, 'recommendation');
const orchestrationCapabilityDir = path.join(capabilitiesDir, 'orchestration');
const decisionCapabilityDir = path.join(capabilitiesDir, 'decision');
const applicationDir = path.join(intelDir, 'application');
const featuresDir = path.join(applicationDir, 'features');
const intelligenceFeatureDir = path.join(featuresDir, 'intelligence');
const analysisDir = path.join(intelDir, 'analysis');
const recommendationDir = path.join(intelDir, 'recommendation');
const orchestrationRuntimeDir = path.join(intelDir, 'orchestration');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readSrc(fullPath) {
  return stripComments(fs.readFileSync(fullPath, 'utf8'));
}

function getNamedExports(fullPath) {
  const src = readSrc(fullPath);
  const names = new Set();
  for (const m of src.matchAll(/^export\s+const\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+function\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  return names;
}

function getReExportedNames(indexPath) {
  const src = readSrc(indexPath);
  const names = new Set();
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}\s*from/gm)) {
    for (const part of m[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const asMatch = trimmed.match(/^(\S+)\s+as\s+(\S+)$/);
      names.add(asMatch ? asMatch[1] : trimmed);
    }
  }
  return names;
}

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

const PRODUCT_BOUNDARY_LAYERS = [
  { name: 'product-entry', dir: productEntryDir, files: ['product_entry.js', 'product_entry_result_builder.js', 'index.js'] },
  { name: 'product-contract', dir: productContractDir, files: ['product_contract.js', 'product_contract_validator.js', 'product_contract_result_builder.js', 'index.js'] },
  { name: 'product-adapter', dir: productAdapterDir, files: ['product_adapter.js', 'product_adapter_result_builder.js', 'index.js'] },
  { name: 'product-execution', dir: productExecutionDir, files: ['product_execution.js', 'product_execution_result_builder.js', 'index.js'] },
  { name: 'product-operational', dir: productOperationalDir, files: ['product_operational.js', 'product_operational_result_builder.js', 'index.js'] },
];
const PHASE4_LAYERS = [
  { name: 'analysis', dir: analysisCapabilityDir, files: ['analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js'] },
  { name: 'recommendation', dir: recommendationCapabilityDir, files: ['recommendation_capability.js', 'recommendation_capability_result_builder.js', 'index.js'] },
  { name: 'orchestration', dir: orchestrationCapabilityDir, files: ['capability_orchestrator.js', 'capability_result_builder.js', 'index.js'] },
  { name: 'decision', dir: decisionCapabilityDir, files: ['decision_capability.js', 'decision_result_builder.js', 'index.js'] },
  { name: 'intelligence-feature', dir: intelligenceFeatureDir, files: ['intelligence_feature.js', 'intelligence_feature_result_mapper.js', 'index.js'] },
];
const EXISTING_LAYERS = [...PRODUCT_BOUNDARY_LAYERS, ...PHASE4_LAYERS];
const EXISTING_SCANNED_FILES = EXISTING_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));
const PRODUCT_LAYER_NAMES = PRODUCT_BOUNDARY_LAYERS.map((l) => l.name);

const HEALTH_INSIGHT_FILES = ['health_insight_feature.js', 'health_insight_result_mapper.js', 'index.js'];
const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution', 'capabilities', 'analysis', 'recommendation', 'application'];
const AI_KEYWORDS = [
  /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i, /gemini/i,
  /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
  /model\s*[:=]\s*['"]/i, /inference/i, /prompt/i,
];

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

async function run() {
  const { createHealthInsightFeature } = await import(path.join(healthInsightDir, 'health_insight_feature.js'));
  const { createHealthInsightResultMapper } = await import(path.join(healthInsightDir, 'health_insight_result_mapper.js'));
  await import(path.join(healthInsightDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createAnalysisRunner } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner } = await import(path.join(recommendationDir, 'index.js'));

  function makeRealOrchestrator() {
    return createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
  }

  // =========================================================================
  // A. Feature creation
  // =========================================================================
  console.log('--- A. Feature creation ---');

  await test('（1.Feature creation）src/intelligence/product/features/health_insight/ 恰好包含4個檔案（health_insight_feature/health_insight_result_mapper/index/README）', () => {
    const files = fs.readdirSync(healthInsightDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'health_insight_feature.js', 'health_insight_result_mapper.js', 'index.js']);
  });

  await test('（1.Feature creation）features/health_insight/index.js完整re-export了兩個具名函式（createHealthInsightFeature/createHealthInsightResultMapper），沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(healthInsightDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createHealthInsightFeature', 'createHealthInsightResultMapper']);
  });

  await test('（1.Feature creation）features/health_insight/index.js re-export的名稱在對應來源檔案裡確實存在', () => {
    const indexSrc = readSrc(path.join(healthInsightDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(healthInsightDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（1.Feature creation）features/health_insight/index.js唯一的相對路徑import是./health_insight_feature.js跟./health_insight_result_mapper.js', () => {
    const src = readSrc(path.join(healthInsightDir, 'index.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports.sort(), ['./health_insight_feature.js', './health_insight_result_mapper.js']);
  });

  await test('（1.Feature creation）health_insight_feature.js唯一的相對路徑import是./health_insight_result_mapper.js', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./health_insight_result_mapper.js']);
  });

  await test('（1.Feature creation）health_insight_result_mapper.js完全零相依（沒有任何import）', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_result_mapper.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（1.Feature creation）src/intelligence/product/features/health_insight/README.md 存在且非空', () => {
    const readmePath = path.join(healthInsightDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  const REQUIRED_README_SECTIONS = ['Feature Responsibility', 'Dependency Direction', 'Input/Output Boundary', 'Capability Usage', 'Current Limitations'];
  for (const section of REQUIRED_README_SECTIONS) {
    await test(`（1.Feature creation）README.md包含「${section}」章節`, () => {
      const readme = fs.readFileSync(path.join(healthInsightDir, 'README.md'), 'utf8');
      assert.ok(readme.includes(section), `README缺少章節：${section}`);
    });
  }

  await test('（1.Feature creation）createHealthInsightFeature()回傳物件恰好只有requestHealthInsight一個公開介面', () => {
    const feature = createHealthInsightFeature({ capabilityOrchestrator: {} });
    assert.deepStrictEqual(Object.keys(feature), ['requestHealthInsight']);
  });

  await test('（1.Feature creation）createHealthInsightResultMapper()回傳物件恰好只有mapSuccessResult/mapFailureResult兩個公開介面', () => {
    const mapper = createHealthInsightResultMapper();
    assert.deepStrictEqual(Object.keys(mapper).sort(), ['mapFailureResult', 'mapSuccessResult']);
  });

  await test('（1.Feature creation）createHealthInsightFeature()沒有傳入dependencies時安全建立，不拋出例外', () => {
    assert.doesNotThrow(() => createHealthInsightFeature());
  });

  await test('（1.Feature creation）requestHealthInsight()是同步函式（跟Capability Orchestrator本身的同步簽名一致，回傳值不是Promise）', () => {
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => ({ ok: true, result: {} }) } });
    const returned = feature.requestHealthInsight({ context: {} });
    assert.strictEqual(returned instanceof Promise, false);
  });

  await test('（1.Feature creation）requestHealthInsight()不接受db參數（整條鏈路完全不接觸database）', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js'));
    assert.ok(!/function requestHealthInsight\(\s*db\s*,/.test(src));
  });

  await test('（1.Feature creation）不同次createHealthInsightFeature()呼叫回傳的是不同的物件實例（沒有共享的模組級單例狀態）', () => {
    const a = createHealthInsightFeature({ capabilityOrchestrator: {} });
    const b = createHealthInsightFeature({ capabilityOrchestrator: {} });
    assert.notStrictEqual(a, b);
  });

  console.log('');

  // =========================================================================
  // B. Request handling
  // =========================================================================
  console.log('--- B. Request handling ---');

  await test('（2.Request handling）requestHealthInsight()缺少request時回傳invalid_request，完全不呼叫capabilityOrchestrator', () => {
    let called = false;
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => { called = true; } } });
    const result = feature.requestHealthInsight();
    assert.deepStrictEqual(result, { ok: false, feature: 'health_insight', reason: 'invalid_request', stage: 'request' });
    assert.strictEqual(called, false);
  });

  for (const bad of [null, 42, 'x', true, [], Symbol('x')]) {
    await test(`（2.Request handling）request為${String(typeof bad === 'symbol' ? 'Symbol' : bad)}時安全回傳invalid_request，不拋出例外`, () => {
      const feature = createHealthInsightFeature({ capabilityOrchestrator: {} });
      assert.doesNotThrow(() => feature.requestHealthInsight(bad));
      const result = feature.requestHealthInsight(bad);
      assert.strictEqual(result.reason, 'invalid_request');
      assert.strictEqual(result.stage, 'request');
    });
  }

  await test('（2.Request handling）request.context缺少時回傳{ok:false, feature:"health_insight", reason:"invalid_context", stage:"request"}，完全不呼叫capabilityOrchestrator', () => {
    let called = false;
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => { called = true; } } });
    const result = feature.requestHealthInsight({});
    assert.deepStrictEqual(result, { ok: false, feature: 'health_insight', reason: 'invalid_context', stage: 'request' });
    assert.strictEqual(called, false);
  });

  for (const bad of [null, 42, 'x', true, [], Symbol('x')]) {
    await test(`（2.Request handling）request.context為${String(typeof bad === 'symbol' ? 'Symbol' : bad)}時安全回傳invalid_context，不拋出例外`, () => {
      const feature = createHealthInsightFeature({ capabilityOrchestrator: {} });
      assert.doesNotThrow(() => feature.requestHealthInsight({ context: bad }));
      const result = feature.requestHealthInsight({ context: bad });
      assert.strictEqual(result.reason, 'invalid_context');
    });
  }

  await test('（2.Request handling）request.options為陣列時回傳invalid_options_type', () => {
    const feature = createHealthInsightFeature({ capabilityOrchestrator: {} });
    const result = feature.requestHealthInsight({ context: {}, options: [] });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（2.Request handling）request.options為null時回傳invalid_options_type', () => {
    const feature = createHealthInsightFeature({ capabilityOrchestrator: {} });
    const result = feature.requestHealthInsight({ context: {}, options: null });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  for (const bad of [42, 'x', true]) {
    await test(`（2.Request handling）request.options為${String(bad)}（非物件基本型別）時回傳invalid_options_type`, () => {
      const feature = createHealthInsightFeature({ capabilityOrchestrator: {} });
      const result = feature.requestHealthInsight({ context: {}, options: bad });
      assert.strictEqual(result.reason, 'invalid_options_type');
    });
  }

  await test('（2.Request handling）request.options未提供時視為合法（options是選填欄位）', () => {
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => ({ ok: true, result: {} }) } });
    const result = feature.requestHealthInsight({ context: {} });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.Request handling）request.options為合法物件時原樣轉交給capabilityOrchestrator，不解讀其內容', () => {
    let received;
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: (req) => { received = req; return { ok: true, result: {} }; } } });
    const options = { locale: 'zh-TW', extra: { nested: true } };
    feature.requestHealthInsight({ context: {}, options });
    assert.deepStrictEqual(received.options, options);
  });

  await test('（2.Request handling）request.userId/session/db等額外欄位不會被轉交給capabilityOrchestrator（Feature只轉交context/options）', () => {
    let received;
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: (req) => { received = req; return { ok: true, result: {} }; } } });
    feature.requestHealthInsight({ context: {}, userId: 'u1', session: { token: 'secret' }, db: {} });
    assert.deepStrictEqual(Object.keys(received).sort(), ['context', 'options']);
  });

  await test('（2.Request handling）validateHealthInsightRequest不重複import Product Contract/Adapter的驗證函式（自我完整慣例）', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js'));
    assert.ok(!/from\s+['"].*product_contract_validator/.test(src));
    assert.ok(!/from\s+['"].*product_adapter/.test(src));
  });

  console.log('');

  // =========================================================================
  // C. Capability integration
  // =========================================================================
  console.log('--- C. Capability integration ---');

  await test('（3.Capability integration）capabilityOrchestrator未提供時回傳{ok:false, reason:"capability_orchestrator_unavailable", stage:"capability"}', () => {
    const feature = createHealthInsightFeature({});
    const result = feature.requestHealthInsight({ context: {} });
    assert.deepStrictEqual(result, { ok: false, feature: 'health_insight', reason: 'capability_orchestrator_unavailable', stage: 'capability' });
  });

  await test('（3.Capability integration）capabilityOrchestrator為null時回傳capability_orchestrator_unavailable', () => {
    const feature = createHealthInsightFeature({ capabilityOrchestrator: null });
    const result = feature.requestHealthInsight({ context: {} });
    assert.strictEqual(result.reason, 'capability_orchestrator_unavailable');
  });

  await test('（3.Capability integration）capabilityOrchestrator沒有requestCapabilityFlow函式時回傳capability_orchestrator_unavailable', () => {
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: 'not a function' } });
    const result = feature.requestHealthInsight({ context: {} });
    assert.strictEqual(result.reason, 'capability_orchestrator_unavailable');
  });

  await test('（3.Capability integration）requestHealthInsight()呼叫capabilityOrchestrator.requestCapabilityFlow()恰好一次', () => {
    let callCount = 0;
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => { callCount++; return { ok: true, result: {} }; } } });
    feature.requestHealthInsight({ context: { a: 1 } });
    assert.strictEqual(callCount, 1);
  });

  await test('（3.Capability integration）requestHealthInsight()把request.context原樣轉交給capabilityOrchestrator', () => {
    let received;
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: (req) => { received = req; return { ok: true, result: {} }; } } });
    const context = { activityContext: { count: 5 } };
    feature.requestHealthInsight({ context });
    assert.strictEqual(received.context, context);
  });

  await test('（3.Capability integration）capabilityOrchestrator.requestCapabilityFlow()拋出例外時回傳capability_execution_failed，不暴露原始例外訊息', () => {
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => { throw new Error('super secret internal detail'); } } });
    const result = feature.requestHealthInsight({ context: {} });
    assert.strictEqual(result.reason, 'capability_execution_failed');
    assert.strictEqual(result.stage, 'capability');
    assert.ok(!JSON.stringify(result).includes('super secret internal detail'));
  });

  await test('（3.Capability integration）capabilityOrchestrator.requestCapabilityFlow()回傳非物件時回傳capability_invalid_result', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => bad } });
      const result = feature.requestHealthInsight({ context: {} });
      assert.strictEqual(result.reason, 'capability_invalid_result');
    }
  });

  await test('（3.Capability integration）capabilityOrchestrator回傳{ok:false}時原樣轉發reason/field/stage', () => {
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => ({ ok: false, reason: 'analysis_capability_unavailable', field: 'context', stage: 'analysis' }) } });
    const result = feature.requestHealthInsight({ context: {} });
    assert.strictEqual(result.reason, 'analysis_capability_unavailable');
    assert.strictEqual(result.field, 'context');
    assert.strictEqual(result.stage, 'analysis');
  });

  await test('（3.Capability integration）真實Capability Orchestrator組合（Analysis+Recommendation Capability+Runner）可以被Health Insight Feature安全呼叫成功', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'health_insight');
  });

  await test('（3.Capability integration）真實鏈路呼叫時Analysis Capability的requestAnalysis()有被實際呼叫（透過Orchestrator轉發，Feature不繞過）', () => {
    let analysisCalled = false;
    const analysisCapability = createAnalysisCapability({ analysisRunner: { runAnalysis: (ctx, opt) => { analysisCalled = true; return { ok: true, result: { status: 'ok', insights: [], metadata: {} } }; } } });
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: { runRecommendation: () => ({ ok: true, result: { status: 'ok', recommendations: [], metadata: {} } }) } });
    const orchestrator = createCapabilityOrchestrator({ analysisCapability, recommendationCapability });
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    feature.requestHealthInsight({ context: makeInsightContext() });
    assert.strictEqual(analysisCalled, true);
  });

  console.log('');

  // =========================================================================
  // D. Analysis consumption
  // =========================================================================
  console.log('--- D. Analysis consumption ---');

  await test('（4.Analysis consumption）Health Insight Feature不直接import Analysis Capability（不繞過Capability Orchestrator）', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js'));
    assert.ok(!/from\s+['"].*\/capabilities\/analysis\//.test(src));
  });

  await test('（4.Analysis consumption）Health Insight Feature不直接import Analysis Runner（不繞過Capability層直接摸Runtime）', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js'));
    assert.ok(!/from\s+['"].*\/intelligence\/analysis\//.test(src));
  });

  await test('（4.Analysis consumption）真實鏈路：Analysis Capability產生的insights正確流入Capability Orchestrator的result.analysis', () => {
    const orchestrator = makeRealOrchestrator();
    const outcome = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(outcome.ok, true);
    assert.ok(Array.isArray(outcome.result.analysis.insights));
    assert.ok(outcome.result.analysis.insights.length > 0);
  });

  await test('（4.Analysis consumption）真實鏈路：Health Insight Feature最終輸出的healthObservation包含Analysis Capability產生的每一筆insight（數量一致）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const context = makeInsightContext();
    const capabilityOutcome = orchestrator.requestCapabilityFlow({ context });
    const featureResult = feature.requestHealthInsight({ context });
    assert.strictEqual(featureResult.data.healthObservation.length, capabilityOutcome.result.analysis.insights.length);
  });

  await test('（4.Analysis consumption）healthObservation裡每一筆的type/value跟Analysis insights完全對應（逐筆比對）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const context = makeInsightContext();
    const capabilityOutcome = orchestrator.requestCapabilityFlow({ context });
    const featureResult = feature.requestHealthInsight({ context });
    for (let i = 0; i < capabilityOutcome.result.analysis.insights.length; i++) {
      assert.strictEqual(featureResult.data.healthObservation[i].type, capabilityOutcome.result.analysis.insights[i].type);
      assert.strictEqual(featureResult.data.healthObservation[i].value, capabilityOutcome.result.analysis.insights[i].value);
    }
  });

  await test('（4.Analysis consumption）Analysis Capability失敗時（analysisRunner missing）Health Insight Feature回傳stage:"analysis"', () => {
    const analysisCapability = createAnalysisCapability({});
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const orchestrator = createCapabilityOrchestrator({ analysisCapability, recommendationCapability });
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stage, 'analysis');
  });

  await test('（4.Analysis consumption）Health Insight Feature沒有重新實作任何insight計算邏輯（不含activityContext.count/nutritionContext.count等直接讀取樣式）', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js')) + readSrc(path.join(healthInsightDir, 'health_insight_result_mapper.js'));
    assert.ok(!/activityContext\.count/.test(src));
    assert.ok(!/nutritionContext\.count/.test(src));
    assert.ok(!/emotionContext\.count/.test(src));
  });

  console.log('');

  // =========================================================================
  // E. Recommendation consumption
  // =========================================================================
  console.log('--- E. Recommendation consumption ---');

  await test('（5.Recommendation consumption）Health Insight Feature不直接import Recommendation Capability（不繞過Capability Orchestrator）', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js'));
    assert.ok(!/from\s+['"].*\/capabilities\/recommendation\//.test(src));
  });

  await test('（5.Recommendation consumption）Health Insight Feature不直接import Recommendation Runner', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js'));
    assert.ok(!/from\s+['"].*\/intelligence\/recommendation\//.test(src));
  });

  await test('（5.Recommendation consumption）真實鏈路：Recommendation Capability產生的recommendations正確流入Capability Orchestrator的result.recommendation', () => {
    const orchestrator = makeRealOrchestrator();
    const outcome = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.ok(Array.isArray(outcome.result.recommendation.recommendations));
    assert.ok(outcome.result.recommendation.recommendations.length > 0);
  });

  await test('（5.Recommendation consumption）真實鏈路：Health Insight Feature最終輸出的recommendation包含Recommendation Capability產生的每一筆建議（數量一致）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const context = makeInsightContext();
    const capabilityOutcome = orchestrator.requestCapabilityFlow({ context });
    const featureResult = feature.requestHealthInsight({ context });
    assert.strictEqual(featureResult.data.recommendation.length, capabilityOutcome.result.recommendation.recommendations.length);
  });

  await test('（5.Recommendation consumption）recommendation裡每一筆的type/value跟Recommendation Capability產生的recommendations完全對應（逐筆比對）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const context = makeInsightContext();
    const capabilityOutcome = orchestrator.requestCapabilityFlow({ context });
    const featureResult = feature.requestHealthInsight({ context });
    for (let i = 0; i < capabilityOutcome.result.recommendation.recommendations.length; i++) {
      assert.strictEqual(featureResult.data.recommendation[i].type, capabilityOutcome.result.recommendation.recommendations[i].type);
      assert.strictEqual(featureResult.data.recommendation[i].value, capabilityOutcome.result.recommendation.recommendations[i].value);
    }
  });

  await test('（5.Recommendation consumption）Recommendation Capability失敗時（recommendationRunner missing）Health Insight Feature回傳stage:"recommendation"', () => {
    const analysisCapability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const recommendationCapability = createRecommendationCapability({});
    const orchestrator = createCapabilityOrchestrator({ analysisCapability, recommendationCapability });
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stage, 'recommendation');
  });

  await test('（5.Recommendation consumption）Health Insight Feature沒有重新實作任何recommendation計算邏輯（不含insights.length等直接推導樣式）', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js')) + readSrc(path.join(healthInsightDir, 'health_insight_result_mapper.js'));
    assert.ok(!/insights\.length/.test(src));
    assert.ok(!/recommendations\.length/.test(src));
  });

  console.log('');

  // =========================================================================
  // F. Output mapping
  // =========================================================================
  console.log('--- F. Output mapping ---');

  await test('（6.Output mapping）成功結果恰好包含五個data欄位（healthObservation/behaviorPattern/recommendation/progressTrend/decision），延續TASK1.108四類輸出+decision placeholder', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['behaviorPattern', 'decision', 'healthObservation', 'progressTrend', 'recommendation']);
  });

  await test('（6.Output mapping）成功結果的最外層恰好只有ok/feature/data三個欄位', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'feature', 'ok']);
  });

  await test('（6.Output mapping）feature欄位固定為"health_insight"字串', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.strictEqual(result.feature, 'health_insight');
  });

  await test('（6.Output mapping）healthObservation是陣列，每一筆元素恰好只有type/value兩個欄位（不含source）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.ok(Array.isArray(result.data.healthObservation));
    for (const item of result.data.healthObservation) {
      assert.deepStrictEqual(Object.keys(item).sort(), ['type', 'value']);
    }
  });

  await test('（6.Output mapping）recommendation是陣列，每一筆元素恰好只有type/value兩個欄位（不含source）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.ok(Array.isArray(result.data.recommendation));
    for (const item of result.data.recommendation) {
      assert.deepStrictEqual(Object.keys(item).sort(), ['type', 'value']);
    }
  });

  await test('（6.Output mapping）behaviorPattern固定為空陣列（V1不屬於範圍，延續TASK1.108第2節B結論）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.deepStrictEqual(result.data.behaviorPattern, []);
  });

  await test('（6.Output mapping）progressTrend固定為空物件（V1不屬於範圍，延續TASK1.108第2節D結論）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.deepStrictEqual(result.data.progressTrend, {});
  });

  await test('（6.Output mapping）decision固定為null（延續Decision Capability既有佔位設計，本次任務沒有注入decisionCapability）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.strictEqual(result.data.decision, null);
  });

  await test('（6.Output mapping）即使Capability Orchestrator有提供decisionCapability（result.decision存在），Health Insight Feature的decision輸出依然是null（Decision Capability本身既有佔位就是null）', () => {
    const analysisCapability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const decisionCapability = { requestDecision: () => ({ ok: true, capability: 'decision', result: { status: 'decision_ready', decision: null, metadata: {} } }) };
    const orchestrator = createCapabilityOrchestrator({ analysisCapability, recommendationCapability, decisionCapability });
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.strictEqual(result.data.decision, null);
  });

  await test('（6.Output mapping）不暴露runtime metadata（Capability Orchestrator既有回傳形狀裡的capability:"orchestration"標籤、Feature Intelligence Integration既有回傳形狀裡的feature:"intelligence"標籤、Analysis/Recommendation Capability整體回傳的status欄位本身——這裡只檢查這些"整體結構標籤"欄位不存在，不檢查Capability既有產生的內容值本身，因為Recommendation Capability既有的analysis_status這類recommendation項目屬於Capability自己產生的既有內容，Health Insight Feature如實轉發不算洩漏，延續TASK1.111"Do NOT move capability logic into Feature"的原則不重新篩選Capability內容）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    assert.strictEqual(result.capability, undefined);
    assert.strictEqual(result.data.status, undefined);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('"capability":"orchestration"'));
    assert.ok(!serialized.includes('"feature":"intelligence"'));
  });

  await test('（6.Output mapping）不暴露internal capability structure（insight/recommendation物件的source欄位完全被過濾掉）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('"source"'));
  });

  await test('（6.Output mapping）不暴露execution details（Product Execution Boundary的五階段lifecycle標記完全不出現）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestHealthInsight({ context: makeInsightContext() });
    const serialized = JSON.stringify(result);
    for (const stageWord of ['request_received', 'validation_completed', 'execution_started', 'execution_completed', 'execution_failed']) {
      assert.ok(!serialized.includes(stageWord));
    }
  });

  await test('（6.Output mapping）mapSuccessResult()對非物件capabilityResult安全地回傳空的healthObservation/recommendation陣列，不拋出例外', () => {
    const mapper = createHealthInsightResultMapper();
    for (const bad of [null, undefined, 42, 'x', []]) {
      const result = mapper.mapSuccessResult(bad);
      assert.deepStrictEqual(result.data.healthObservation, []);
      assert.deepStrictEqual(result.data.recommendation, []);
    }
  });

  await test('（6.Output mapping）mapSuccessResult()對analysis.insights不是陣列時安全回傳空陣列', () => {
    const mapper = createHealthInsightResultMapper();
    const result = mapper.mapSuccessResult({ analysis: { insights: 'not an array' }, recommendation: {} });
    assert.deepStrictEqual(result.data.healthObservation, []);
  });

  await test('（6.Output mapping）mapSuccessResult()過濾掉insights陣列裡的非物件/null元素', () => {
    const mapper = createHealthInsightResultMapper();
    const result = mapper.mapSuccessResult({ analysis: { insights: [{ type: 'a', value: 1 }, null, 42, { type: 'b', value: 2 }] }, recommendation: {} });
    assert.deepStrictEqual(result.data.healthObservation, [{ type: 'a', value: 1 }, { type: 'b', value: 2 }]);
  });

  await test('（6.Output mapping）deterministic：同樣的capabilityResult輸入永遠得到完全相同的mapSuccessResult()輸出', () => {
    const mapper = createHealthInsightResultMapper();
    const input = { analysis: { insights: [{ type: 'a', value: 1, source: 'x' }] }, recommendation: { recommendations: [{ type: 'b', value: 2, source: 'y' }] } };
    const r1 = mapper.mapSuccessResult(input);
    const r2 = mapper.mapSuccessResult(input);
    assert.deepStrictEqual(r1, r2);
  });

  await test('（6.Output mapping）health_insight_result_mapper.js不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_result_mapper.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  console.log('');

  // =========================================================================
  // G. Error handling
  // =========================================================================
  console.log('--- G. Error handling ---');

  await test('（7.Error handling）失敗結果恰好只有ok/feature/reason/field?/stage?欄位，不含data', () => {
    const feature = createHealthInsightFeature({});
    const result = feature.requestHealthInsight({ context: {} });
    assert.strictEqual(result.data, undefined);
    for (const key of Object.keys(result)) {
      assert.ok(['ok', 'feature', 'reason', 'field', 'stage'].includes(key));
    }
  });

  await test('（7.Error handling）失敗結果的reason永遠是字串', () => {
    const scenarios = [
      () => createHealthInsightFeature({}).requestHealthInsight({}),
      () => createHealthInsightFeature({ capabilityOrchestrator: {} }).requestHealthInsight({ context: {} }),
      () => createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => { throw new Error('x'); } } }).requestHealthInsight({ context: {} }),
    ];
    for (const scenario of scenarios) {
      const result = scenario();
      assert.strictEqual(typeof result.reason, 'string');
    }
  });

  await test('（7.Error handling）mapFailureResult()對非字串reason安全正規化為unknown_error', () => {
    const mapper = createHealthInsightResultMapper();
    for (const bad of [undefined, null, 42, {}, []]) {
      const result = mapper.mapFailureResult(bad);
      assert.strictEqual(result.reason, 'unknown_error');
    }
  });

  await test('（7.Error handling）mapFailureResult()的field/stage只在是非空字串時才出現在結果物件裡', () => {
    const mapper = createHealthInsightResultMapper();
    const withoutFieldStage = mapper.mapFailureResult('some_reason');
    assert.strictEqual('field' in withoutFieldStage, false);
    assert.strictEqual('stage' in withoutFieldStage, false);
    const withFieldStage = mapper.mapFailureResult('some_reason', 'some_field', 'some_stage');
    assert.strictEqual(withFieldStage.field, 'some_field');
    assert.strictEqual(withFieldStage.stage, 'some_stage');
  });

  await test('（7.Error handling）mapFailureResult()對空字串field/stage不加入結果物件', () => {
    const mapper = createHealthInsightResultMapper();
    const result = mapper.mapFailureResult('reason', '', '');
    assert.strictEqual('field' in result, false);
    assert.strictEqual('stage' in result, false);
  });

  await test('（7.Error handling）resultMapper.mapSuccessResult()拋出例外時Health Insight Feature回傳mapping_failed，不暴露原始例外訊息', () => {
    const throwingMapper = { mapSuccessResult: () => { throw new Error('mapping exploded with secret detail'); }, mapFailureResult: createHealthInsightResultMapper().mapFailureResult };
    const feature = createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => ({ ok: true, result: {} }) }, resultMapper: throwingMapper });
    const result = feature.requestHealthInsight({ context: {} });
    assert.strictEqual(result.reason, 'mapping_failed');
    assert.strictEqual(result.stage, 'mapping');
    assert.ok(!JSON.stringify(result).includes('mapping exploded with secret detail'));
  });

  await test('（7.Error handling）例外物件的stack trace完全不會出現在任何失敗結果的序列化字串裡（逐一測試各種例外情境）', () => {
    const scenarios = [
      () => createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => { throw new TypeError('type error with stack'); } } }).requestHealthInsight({ context: {} }),
      () => createHealthInsightFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => { throw new RangeError('range error with stack'); } } }).requestHealthInsight({ context: {} }),
    ];
    for (const scenario of scenarios) {
      const result = scenario();
      const serialized = JSON.stringify(result);
      assert.ok(!serialized.includes('.js:'));
      assert.ok(!serialized.includes('at '));
    }
  });

  await test('（7.Error handling）Capability Orchestrator驗證失敗（invalid_context等）時Health Insight Feature原樣轉發，不吞掉也不改寫reason', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const rawOutcome = orchestrator.requestCapabilityFlow({ context: null });
    const featureResult = feature.requestHealthInsight({ context: null });
    assert.strictEqual(featureResult.reason, rawOutcome.reason);
  });

  await test('（7.Error handling）requestHealthInsight()本身永遠不拋出例外（即使dependencies極端異常）', () => {
    const badDependencies = [
      { capabilityOrchestrator: 42 },
      { capabilityOrchestrator: 'not an object' },
      { capabilityOrchestrator: { requestCapabilityFlow: null } },
      { capabilityOrchestrator: { requestCapabilityFlow: () => undefined } },
      { capabilityOrchestrator: { requestCapabilityFlow: () => { throw 'a string throw'; } } },
    ];
    for (const deps of badDependencies) {
      const feature = createHealthInsightFeature(deps);
      assert.doesNotThrow(() => feature.requestHealthInsight({ context: {} }));
    }
  });

  console.log('');

  // =========================================================================
  // H. Dependency direction
  // =========================================================================
  console.log('--- H. Dependency direction ---');

  await test('（8.Dependency direction）Health Insight Feature兩個實作檔案完全不import五個既有Product Boundary（Entry/Contract/Adapter/Execution/Operational）', () => {
    for (const file of ['health_insight_feature.js', 'health_insight_result_mapper.js']) {
      const src = readSrc(path.join(healthInsightDir, file));
      for (const boundary of ['entry', 'contract', 'adapter', 'execution', 'operational']) {
        assert.ok(!new RegExp(`from\\s+['"].*\\/product\\/${boundary}\\/`).test(src), `${file} 不應該import product/${boundary}/`);
      }
    }
  });

  await test('（8.Dependency direction）Health Insight Feature兩個實作檔案完全不import Phase 3 Application Layer（application/底下任何檔案，含既有Intelligence Feature Integration本身）', () => {
    for (const file of ['health_insight_feature.js', 'health_insight_result_mapper.js']) {
      const src = readSrc(path.join(healthInsightDir, file));
      assert.ok(!/from\s+['"].*\/application\//.test(src), `${file} 不應該import application/`);
    }
  });

  await test('（8.Dependency direction）Health Insight Feature兩個實作檔案完全不import src/db/、src/auth/、src/oauth/、src/identity/、src/middleware/', () => {
    for (const file of ['health_insight_feature.js', 'health_insight_result_mapper.js']) {
      const src = readSrc(path.join(healthInsightDir, file));
      for (const subdir of ['db', 'auth', 'oauth', 'identity', 'middleware']) {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src), `${file} 不應該import src/${subdir}/`);
      }
    }
  });

  for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
    await test(`（8.Dependency direction）health_insight_feature.js完全不import src/intelligence/${subdir}/（不繞過Capability Orchestrator/不摸Phase 2 Runtime內部服務）`, () => {
      const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js'));
      assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
    });
  }

  await test('（8.Dependency direction）health_insight_feature.js完全不import src/routes/、src/controllers/、worker.js（No HTTP邊界）', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js'));
    assert.ok(!/from\s+['"].*\/routes\//.test(src));
    assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    assert.ok(!/worker\.js/.test(src));
  });

  await test('（8.Dependency direction）Health Insight Feature兩個實作檔案完全不呼叫fetch()', () => {
    for (const file of ['health_insight_feature.js', 'health_insight_result_mapper.js']) {
      const src = readSrc(path.join(healthInsightDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    }
  });

  await test('（8.Dependency direction）Health Insight Feature兩個實作檔案完全不呼叫Date.now()/Math.random()（deterministic）', () => {
    for (const file of ['health_insight_feature.js', 'health_insight_result_mapper.js']) {
      const src = readSrc(path.join(healthInsightDir, file));
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    }
  });

  await test('（8.Dependency direction）沒有新增任何新的Product Boundary目錄（五個既有Boundary清單不變）', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    assert.deepStrictEqual(dirNames, ['adapter', 'contract', 'entry', 'execution', 'features', 'operational']);
  });

  await test('（8.Dependency direction）src/intelligence/product/features/ 目錄恰好只有health_insight一個子目錄', () => {
    const entries = fs.readdirSync(productFeaturesDir, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    assert.deepStrictEqual(dirNames, ['health_insight']);
  });

  console.log('');

  // =========================================================================
  // I. Boundary protection
  // =========================================================================
  console.log('--- I. Boundary protection ---');

  await test('（9.Boundary protection）Health Insight Feature目錄本次任務新增的檔案清單恰好符合預期（health_insight_feature.js/health_insight_result_mapper.js/index.js/README.md）', () => {
    const files = fs.readdirSync(healthInsightDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'health_insight_feature.js', 'health_insight_result_mapper.js', 'index.js']);
  });

  for (const layer of EXISTING_LAYERS) {
    await test(`（9.Boundary protection）${layer.name} 目錄本次任務完全沒有任何檔案被修改`, () => {
      const status = execFileSync('git', ['status', '--porcelain', layer.dir], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(status.trim(), '');
    });
    await test(`（9.Boundary protection）${layer.name} 目錄恰好維持既有的檔案清單`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  for (const { layer, file, full } of EXISTING_SCANNED_FILES) {
    await test(`（9.Boundary protection）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });

    const src = readSrc(full);

    await test(`（9.Boundary protection）${layer}/${file} 完全不import src/db/（重新確認既有邊界）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });

    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（9.Boundary protection）${layer}/${file} 完全不import src/${subdir}/（重新確認既有邊界）`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }

    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（9.Boundary protection）${layer}/${file} 不含身分相關字樣 ${pattern}（重新確認既有邊界）`, () => {
        assert.ok(!pattern.test(src));
      });
    }

    await test(`（9.Boundary protection）${layer}/${file} 完全沒有呼叫fetch()（重新確認既有邊界）`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });

    await test(`（9.Boundary protection）${layer}/${file} 完全不呼叫Date.now()/Math.random()（重新確認既有邊界，deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });

    for (const pattern of AI_KEYWORDS) {
      await test(`（9.Boundary protection）${layer}/${file} 的實際程式碼不含AI相關關鍵字樣 ${pattern}（重新確認Phase 5/Phase 4既有邊界）`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }

    if (PRODUCT_LAYER_NAMES.includes(layer) && file !== 'README.md' && file !== 'index.js') {
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（9.Boundary protection）${layer}/${file} 完全不import src/intelligence/${subdir}/（重新確認Product Boundary不得繞過下一層）`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（9.Boundary protection）${layer}/${file} 完全不import src/routes/、src/controllers/、worker.js（重新確認No HTTP邊界）`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
      });
    }
  }

  await test('（9.Boundary protection）src/bootstrap/application.js本次任務完全沒有被修改（app.intelligence unchanged）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.Boundary protection）app.intelligence物件恰好維持24個欄位不變', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（9.Boundary protection）app.router.routes 數量沒有因為本次任務而改變（TASK1.116後更新：TASK1.116是本系列第一個明確被授權做"Route connection"的任務，正式新增GET /health-insight、POST /api/health-insight兩條路由，21+2=23）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 23);
  });

  await test('（9.Boundary protection）src/worker.js既有TASK1.21~1.38路由分派邏輯/legacy handler完全沒有被修改（TASK1.116後更新：TASK1.116在檔案末尾新增GET /health-insight、POST /api/health-insight兩個if區塊，這是本次任務明確授權的Route connection範圍，不再要求整個檔案零diff，改成驗證既有邏輯的具體內容標記依然逐字存在）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('const DATA_API_PATHS = new Set(['));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/api/timeline')"));
    assert.ok(workerSource.includes('async function handle(r,env){'));
    assert.ok(workerSource.includes("if(p==='/api/qlive'){"));
  });

  await test('（9.Boundary protection）src/routes/、src/controllers/既有檔案完全沒有被修改，只新增Health Insight專屬的新檔案（TASK1.116後更新：TASK1.116新增src/routes/health_insight_routes.js、src/controllers/health_insight_controller.js，並在src/routes/index.js新增對應的import/register一行，這是本次任務明確授權的Route connection範圍，這裡改成驗證既有路由/controller檔案本身逐一沒有被修改）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/auth_routes.js src/routes/user_routes.js src/routes/data_routes.js src/routes/dashboard_routes.js src/routes/profile_routes.js src/routes/timeline_routes.js src/routes/legacy_routes.js src/routes/router.js src/controllers/auth_controller.js src/controllers/dashboard_controller.js src/controllers/data_controller.js src/controllers/profile_controller.js src/controllers/timeline_controller.js src/controllers/user_controller.js src/controllers/response.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.Boundary protection）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.Boundary protection）migrations/ 目錄本次任務完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.Boundary protection）src/db/ 目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.Boundary protection）沒有新增任何CSS檔案/frontend元件（本次任務不實作UI）', () => {
    const status = execFileSync('sh', ['-c', "git status --porcelain -- '*.css' 'src/frontend/' 'src/components/' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.Boundary protection）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  console.log('');

  // =========================================================================
  // J. Runtime isolation
  // =========================================================================
  console.log('--- J. Runtime isolation ---');

  await test('（10.Runtime isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', orchestrationRuntimeDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Runtime isolation）src/intelligence/analysis/（Analysis Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', analysisDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Runtime isolation）src/intelligence/recommendation/（Recommendation Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', recommendationDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Runtime isolation）Phase 4 Capability Architecture（capabilities/整個目錄樹）本次任務完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', capabilitiesDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Runtime isolation）Health Insight Feature從頭到尾只透過依賴注入拿到的capabilityOrchestrator互動，完全不知道Runtime內部模組（analysisRunner/recommendationRunner）的存在', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js'));
    assert.ok(!/analysisRunner/.test(src));
    assert.ok(!/recommendationRunner/.test(src));
  });

  await test('（10.Runtime isolation）真實鏈路：即使Health Insight Feature/Capability Orchestrator/Analysis Capability/Recommendation Capability一路串接執行，Analysis Runner/Recommendation Runner原始檔案在執行前後checksum不變', () => {
    const before = fs.readFileSync(path.join(analysisDir, 'analysis_runner.js'), 'utf8');
    const beforeRec = fs.readFileSync(path.join(recommendationDir, 'recommendation_runner.js'), 'utf8');
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    feature.requestHealthInsight({ context: makeInsightContext() });
    const after = fs.readFileSync(path.join(analysisDir, 'analysis_runner.js'), 'utf8');
    const afterRec = fs.readFileSync(path.join(recommendationDir, 'recommendation_runner.js'), 'utf8');
    assert.strictEqual(before, after);
    assert.strictEqual(beforeRec, afterRec);
  });

  await test('（10.Runtime isolation）呼叫Health Insight Feature多次不會累積任何跨呼叫的共享狀態（連續兩次呼叫回傳的insight內容完全相同）', () => {
    const orchestrator = makeRealOrchestrator();
    const feature = createHealthInsightFeature({ capabilityOrchestrator: orchestrator });
    const context = makeInsightContext();
    const r1 = feature.requestHealthInsight({ context });
    const r2 = feature.requestHealthInsight({ context });
    assert.deepStrictEqual(r1, r2);
  });

  console.log('');

  // =========================================================================
  // K. AI boundary
  // =========================================================================
  console.log('--- K. AI boundary ---');

  for (const file of ['health_insight_feature.js', 'health_insight_result_mapper.js', 'index.js']) {
    const src = readSrc(path.join(healthInsightDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（11.AI boundary）${file} 的實際程式碼不含AI相關關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
  }

  await test('（11.AI boundary）文件（README.md）不含實際的AI呼叫程式碼字樣', () => {
    const readme = fs.readFileSync(path.join(healthInsightDir, 'README.md'), 'utf8');
    for (const pattern of [/api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i]) {
      assert.ok(!pattern.test(readme));
    }
  });

  await test('（11.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i, /GEMINI/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（11.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek|gemini/i.test(name));
      }
    }
  });

  await test('（11.AI boundary）package.json本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
    for (const envFile of ['.env', '.env.example']) {
      const envPath = path.join(repoRoot, envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        assert.ok(!/ANTHROPIC/i.test(content));
        assert.ok(!/OPENAI/i.test(content));
        assert.ok(!/DEEPSEEK/i.test(content));
        assert.ok(!/GEMINI/i.test(content));
      }
    }
  });

  console.log('');

  // =========================================================================
  // L. Regression validation
  // =========================================================================
  console.log('--- L. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（Regression validation）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase6-task1.111-health-insight-feature')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（Regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5/Phase 6全部）`, () => {
      assert.ok(allSuites.length >= 100, `預期至少100個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（Regression validation）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // M. P1-P6
  // =========================================================================
  console.log('--- M. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改（TASK1.116後更新：見上方"Boundary protection"章節已經改用內容標記比對，這裡額外確認legacy getHTML()函式本身逐字沒有被修改，既有UI維持不變）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  await test('（P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（P1-P6）src/auth/、src/oauth/ 完全沒有被本次任務修改，src/routes/、src/controllers/既有檔案也沒有被修改（TASK1.116後更新：見上方"Boundary protection"章節已針對routes/controllers做過檔案範圍限定的diff檢查，這裡額外確認src/auth/、src/oauth/兩個目錄完全沒有被觸碰）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

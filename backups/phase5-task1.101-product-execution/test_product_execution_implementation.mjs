/*
 * Phase 5 TASK 1.101｜Product Execution Boundary Minimal Implementation 測試
 *
 * 本任務是Phase 5系列第三個寫production code的任務（前兩個是
 * TASK1.99 Product Entry、TASK1.100 Product Adapter）。依照
 * TASK1.95 Execution Boundary Foundation規劃，在
 * `src/intelligence/product/execution/`底下建立最小的Product
 * Execution Boundary骨架：`product_execution.js`、
 * `product_execution_result_builder.js`、`index.js`、
 * `README.md`。
 *
 * 本次任務**不**實作真實的product routes、**不**實作AI、**不**
 * 修改worker.js/routes/controllers/auth/oauth/session/database
 * schema/migrations/Analysis Runner/Recommendation Runner/
 * Phase 2 Runtime Orchestrator/Phase 3 Application Pattern/
 * Phase 4 Capability Architecture/Product Entry（TASK1.99）/
 * Product Adapter（TASK1.100）、**不**接進
 * `src/bootstrap/application.js`。
 *
 * 分為以下12個部分：
 * A) execution creation
 * B) lifecycle handling
 * C) execution state
 * D) success handling
 * E) failure classification
 * F) adapter compatibility
 * G) feature compatibility
 * H) contract compatibility
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
const productDir = path.join(intelDir, 'product');
const productEntryDir = path.join(productDir, 'entry');
const productAdapterDir = path.join(productDir, 'adapter');
const productExecutionDir = path.join(productDir, 'execution');

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

const PHASE4_LAYERS = [
  { name: 'analysis', dir: analysisCapabilityDir, files: ['analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js'] },
  { name: 'recommendation', dir: recommendationCapabilityDir, files: ['recommendation_capability.js', 'recommendation_capability_result_builder.js', 'index.js'] },
  { name: 'orchestration', dir: orchestrationCapabilityDir, files: ['capability_orchestrator.js', 'capability_result_builder.js', 'index.js'] },
  { name: 'decision', dir: decisionCapabilityDir, files: ['decision_capability.js', 'decision_result_builder.js', 'index.js'] },
  { name: 'intelligence-feature', dir: intelligenceFeatureDir, files: ['intelligence_feature.js', 'intelligence_feature_result_mapper.js', 'index.js'] },
];
const PRODUCT_ENTRY_LAYER = { name: 'product-entry', dir: productEntryDir, files: ['product_entry.js', 'product_entry_result_builder.js', 'index.js'] };
const PRODUCT_ADAPTER_LAYER = { name: 'product-adapter', dir: productAdapterDir, files: ['product_adapter.js', 'product_adapter_result_builder.js', 'index.js'] };
const PRODUCT_EXECUTION_LAYER = { name: 'product-execution', dir: productExecutionDir, files: ['product_execution.js', 'product_execution_result_builder.js', 'index.js'] };
const ALL_LAYERS = [...PHASE4_LAYERS, PRODUCT_ENTRY_LAYER, PRODUCT_ADAPTER_LAYER, PRODUCT_EXECUTION_LAYER];
const ALL_SCANNED_FILES = ALL_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));

const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution', 'capabilities', 'analysis', 'recommendation', 'application'];

async function run() {
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createIntelligenceFeature } = await import(path.join(intelligenceFeatureDir, 'index.js'));
  const { createAnalysisRunner } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner } = await import(path.join(recommendationDir, 'index.js'));
  const { createProductEntry } = await import(path.join(productEntryDir, 'index.js'));
  const { createProductAdapter } = await import(path.join(productAdapterDir, 'index.js'));
  const { createProductExecution, createProductExecutionResultBuilder } = await import(path.join(productExecutionDir, 'index.js'));

  function makeRealAnalysisCapability() {
    return createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
  }
  function makeRealRecommendationCapability() {
    return createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
  }
  function makeRealIntelligenceFeature() {
    return createIntelligenceFeature({
      capabilityOrchestrator: createCapabilityOrchestrator({
        analysisCapability: makeRealAnalysisCapability(),
        recommendationCapability: makeRealRecommendationCapability(),
      }),
    });
  }

  const productExecutionSrc = readSrc(path.join(productExecutionDir, 'product_execution.js'));
  const productExecutionResultBuilderSrc = readSrc(path.join(productExecutionDir, 'product_execution_result_builder.js'));
  const productExecutionIndexSrc = readSrc(path.join(productExecutionDir, 'index.js'));
  const productAdapterSrc = readSrc(path.join(productAdapterDir, 'product_adapter.js'));
  const readme = fs.readFileSync(path.join(productExecutionDir, 'README.md'), 'utf8');

  // =========================================================================
  // A. execution creation
  // =========================================================================
  console.log('--- A. execution creation ---');

  await test('（1.execution creation）src/intelligence/product/execution/ 目錄存在', () => {
    assert.ok(fs.existsSync(productExecutionDir) && fs.statSync(productExecutionDir).isDirectory());
  });

  await test('（1.execution creation）src/intelligence/product/execution/ 底下恰好是規格要求的4個檔案', () => {
    const files = fs.readdirSync(productExecutionDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'index.js', 'product_execution.js', 'product_execution_result_builder.js']);
  });

  for (const f of ['product_execution.js', 'product_execution_result_builder.js', 'index.js', 'README.md']) {
    await test(`（1.execution creation）src/intelligence/product/execution/${f} 存在且非空`, () => {
      const stat = fs.statSync(path.join(productExecutionDir, f));
      assert.ok(stat.isFile());
      assert.ok(stat.size > 0);
    });
  }

  await test('（1.execution creation）createProductExecution 是一個function', () => {
    assert.strictEqual(typeof createProductExecution, 'function');
  });

  await test('（1.execution creation）createProductExecutionResultBuilder 是一個function', () => {
    assert.strictEqual(typeof createProductExecutionResultBuilder, 'function');
  });

  await test('（1.execution creation）createProductExecution() 不需要任何參數也可以呼叫', () => {
    assert.doesNotThrow(() => createProductExecution());
  });

  await test('（1.execution creation）createProductExecution({}) 回傳的物件具有 requestIntelligence 跟 getLastExecutionState 兩個function', () => {
    const exec = createProductExecution({});
    assert.strictEqual(typeof exec.requestIntelligence, 'function');
    assert.strictEqual(typeof exec.getLastExecutionState, 'function');
  });

  await test('（1.execution creation）createProductExecution() 每次呼叫都回傳新的獨立實例', () => {
    const e1 = createProductExecution({});
    const e2 = createProductExecution({});
    assert.notStrictEqual(e1, e2);
    assert.notStrictEqual(e1.requestIntelligence, e2.requestIntelligence);
  });

  await test('（1.execution creation）createProductExecutionResultBuilder() 回傳的物件具有 buildSuccessResult 跟 buildFailureResult', () => {
    const rb = createProductExecutionResultBuilder();
    assert.strictEqual(typeof rb.buildSuccessResult, 'function');
    assert.strictEqual(typeof rb.buildFailureResult, 'function');
  });

  await test('（1.execution creation）createProductExecution 可以自訂 resultBuilder 依賴注入', () => {
    let called = false;
    const customBuilder = {
      buildSuccessResult: (d) => { called = true; return { ok: true, custom: true, data: d }; },
      buildFailureResult: (reason) => ({ ok: false, custom: true, reason }),
    };
    const exec = createProductExecution({
      resultBuilder: customBuilder,
      intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) },
    });
    const result = exec.requestIntelligence({ context: {} });
    assert.strictEqual(called, true);
    assert.strictEqual(result.custom, true);
  });

  console.log('');

  // =========================================================================
  // B. lifecycle handling
  // =========================================================================
  console.log('--- B. lifecycle handling ---');

  await test('（2.lifecycle handling）成功路徑走完全部四個階段：request_received→validation_completed→execution_started→execution_completed', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    exec.requestIntelligence({ context: {} });
    assert.deepStrictEqual(exec.getLastExecutionState().transitions, ['request_received', 'validation_completed', 'execution_started', 'execution_completed']);
  });

  await test('（2.lifecycle handling）Feature Failure路徑走到execution_failed（跟completed互斥）', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'x' }) } });
    exec.requestIntelligence({ context: {} });
    assert.deepStrictEqual(exec.getLastExecutionState().transitions, ['request_received', 'validation_completed', 'execution_started', 'execution_failed']);
  });

  await test('（2.lifecycle handling）Runtime Failure路徑（拋出例外）同樣走到execution_failed', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => { throw new Error('x'); } } });
    exec.requestIntelligence({ context: {} });
    assert.deepStrictEqual(exec.getLastExecutionState().transitions, ['request_received', 'validation_completed', 'execution_started', 'execution_failed']);
  });

  await test('（2.lifecycle handling）Contract Failure（request本身不合法）只走到request_received，不會到validation_completed', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    exec.requestIntelligence(null);
    assert.deepStrictEqual(exec.getLastExecutionState().transitions, ['request_received']);
  });

  await test('（2.lifecycle handling）Contract Failure（context不合法）走到request_received後立刻中止，不會到execution_started', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    exec.requestIntelligence({});
    assert.deepStrictEqual(exec.getLastExecutionState().transitions, ['request_received']);
  });

  await test('（2.lifecycle handling）intelligenceFeature依賴缺失時走到validation_completed，但不會到execution_started（尚未真正呼叫Feature）', () => {
    const exec = createProductExecution({});
    exec.requestIntelligence({ context: {} });
    assert.deepStrictEqual(exec.getLastExecutionState().transitions, ['request_received', 'validation_completed']);
  });

  await test('（2.lifecycle handling）階段順序嚴格遞增：request_received永遠是第一個，execution_started永遠在execution_completed/failed之前', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    exec.requestIntelligence({ context: {} });
    const transitions = exec.getLastExecutionState().transitions;
    assert.strictEqual(transitions[0], 'request_received');
    const startedIdx = transitions.indexOf('execution_started');
    const completedIdx = transitions.indexOf('execution_completed');
    assert.ok(startedIdx < completedIdx);
  });

  await test('（2.lifecycle handling）execution_completed跟execution_failed不會同時出現在同一次transitions裡', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    exec.requestIntelligence({ context: {} });
    const transitions = exec.getLastExecutionState().transitions;
    assert.ok(!(transitions.includes('execution_completed') && transitions.includes('execution_failed')));
  });

  await test('（2.lifecycle handling）Execution Lifecycle的階段名稱完全不會出現在requestIntelligence()回傳的結果物件裡（Hidden Internal State）', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    const result = exec.requestIntelligence({ context: {} });
    const serialized = JSON.stringify(result);
    for (const stageName of ['request_received', 'validation_completed', 'execution_started', 'execution_completed', 'execution_failed']) {
      assert.ok(!serialized.includes(stageName), `${stageName}不應該出現在回傳結果裡`);
    }
  });

  console.log('');

  // =========================================================================
  // C. execution state
  // =========================================================================
  console.log('--- C. execution state ---');

  await test('（3.execution state）getLastExecutionState()在任何呼叫之前回傳stage:"idle"、transitions:[]', () => {
    const exec = createProductExecution({});
    const state = exec.getLastExecutionState();
    assert.strictEqual(state.stage, 'idle');
    assert.deepStrictEqual(state.transitions, []);
  });

  await test('（3.execution state）getLastExecutionState()反映最近一次呼叫的最終stage', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    exec.requestIntelligence({ context: {} });
    assert.strictEqual(exec.getLastExecutionState().stage, 'execution_completed');
  });

  await test('（3.execution state）每次requestIntelligence()呼叫都重新建立獨立的execution state（不累積前一次的transitions）', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    exec.requestIntelligence({ context: {} });
    const firstTransitions = exec.getLastExecutionState().transitions;
    exec.requestIntelligence({ context: {} });
    const secondTransitions = exec.getLastExecutionState().transitions;
    assert.deepStrictEqual(firstTransitions, secondTransitions);
    assert.strictEqual(secondTransitions.length, 4);
  });

  await test('（3.execution state）getLastExecutionState()回傳的transitions陣列是複本，外部修改不會影響內部狀態', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    exec.requestIntelligence({ context: {} });
    const state1 = exec.getLastExecutionState();
    state1.transitions.push('tampered');
    const state2 = exec.getLastExecutionState();
    assert.ok(!state2.transitions.includes('tampered'));
  });

  await test('（3.execution state）兩個獨立的createProductExecution()實例有各自獨立的execution state', () => {
    const exec1 = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    const exec2 = createProductExecution({});
    exec1.requestIntelligence({ context: {} });
    assert.strictEqual(exec1.getLastExecutionState().stage, 'execution_completed');
    assert.strictEqual(exec2.getLastExecutionState().stage, 'idle');
  });

  console.log('');

  // =========================================================================
  // D. success handling
  // =========================================================================
  console.log('--- D. success handling ---');

  await test('（4.success handling）成功時data欄位原樣等於Feature回傳的data（不新增不修改任何欄位）', () => {
    const data = { analysis: { status: 'x' }, recommendation: { status: 'y' } };
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data }) } });
    const result = exec.requestIntelligence({ context: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data, data);
  });

  await test('（4.success handling）成功結果恰好包含{ok, feature, boundary, data}四個欄位', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    const result = exec.requestIntelligence({ context: {} });
    assert.deepStrictEqual(Object.keys(result).sort(), ['boundary', 'data', 'feature', 'ok']);
  });

  await test('（4.success handling）成功結果的feature欄位恰好是"intelligence"（跟真正的Feature Intelligence Integration相同標籤，維持透明代理）', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    const result = exec.requestIntelligence({ context: {} });
    assert.strictEqual(result.feature, 'intelligence');
  });

  await test('（4.success handling）成功結果的boundary欄位恰好是"product-execution"', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    const result = exec.requestIntelligence({ context: {} });
    assert.strictEqual(result.boundary, 'product-execution');
  });

  await test('（4.success handling）buildSuccessResult(非物件)時data退回空物件{}', () => {
    const rb = createProductExecutionResultBuilder();
    for (const v of [null, undefined, 'x', 1, true, []]) {
      assert.deepStrictEqual(rb.buildSuccessResult(v).data, {});
    }
  });

  await test('（4.success handling）decision欄位存在時原樣透過data傳遞', () => {
    const data = { analysis: {}, recommendation: {}, decision: { status: 'placeholder' } };
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data }) } });
    const result = exec.requestIntelligence({ context: {} });
    assert.deepStrictEqual(result.data.decision, { status: 'placeholder' });
  });

  await test('（4.success handling）端對端：串接真實Intelligence Feature時，data恰好包含analysis跟recommendation兩個欄位', () => {
    const exec = createProductExecution({ intelligenceFeature: makeRealIntelligenceFeature() });
    const result = exec.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  await test('（4.success handling）requestIntelligence()是同步函式（不回傳Promise）', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    const result = exec.requestIntelligence({ context: {} });
    assert.strictEqual(result instanceof Promise, false);
  });

  console.log('');

  // =========================================================================
  // E. failure classification
  // =========================================================================
  console.log('--- E. failure classification ---');

  await test('（5.failure classification）request本身不合法時分類為contract_failure，reason為invalid_execution_request', () => {
    const exec = createProductExecution({});
    const result = exec.requestIntelligence(null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.category, 'contract_failure');
    assert.strictEqual(result.reason, 'invalid_execution_request');
  });

  const INVALID_CONTEXT_SHAPES = [
    { label: 'missing', value: {} },
    { label: 'null', value: { context: null } },
    { label: 'string', value: { context: 'x' } },
    { label: 'number', value: { context: 1 } },
    { label: 'array', value: { context: [] } },
  ];

  for (const { label, value } of INVALID_CONTEXT_SHAPES) {
    await test(`（5.failure classification）request.context為${label}時分類為contract_failure，reason為invalid_context`, () => {
      const exec = createProductExecution({});
      const result = exec.requestIntelligence(value);
      assert.strictEqual(result.category, 'contract_failure');
      assert.strictEqual(result.reason, 'invalid_context');
      assert.strictEqual(result.field, 'context');
    });
  }

  await test('（5.failure classification）intelligenceFeature依賴缺失時分類為contract_failure，reason為intelligence_feature_unavailable', () => {
    const exec = createProductExecution({});
    const result = exec.requestIntelligence({ context: {} });
    assert.strictEqual(result.category, 'contract_failure');
    assert.strictEqual(result.reason, 'intelligence_feature_unavailable');
  });

  await test('（5.failure classification）intelligenceFeature.requestIntelligence回傳{ok:false,...}時分類為feature_failure，原樣轉發reason/field/stage', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'invalid_context', field: 'context', stage: 'analysis' }) } });
    const result = exec.requestIntelligence({ context: {} });
    assert.strictEqual(result.category, 'feature_failure');
    assert.strictEqual(result.reason, 'invalid_context');
    assert.strictEqual(result.field, 'context');
    assert.strictEqual(result.stage, 'analysis');
  });

  await test('（5.failure classification）intelligenceFeature.requestIntelligence拋出例外時分類為runtime_failure，reason為internal_error', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => { throw new Error('secret-stack-trace-xyz'); } } });
    const result = exec.requestIntelligence({ context: {} });
    assert.strictEqual(result.category, 'runtime_failure');
    assert.strictEqual(result.reason, 'internal_error');
    assert.ok(!JSON.stringify(result).includes('secret-stack-trace-xyz'));
  });

  await test('（5.failure classification）intelligenceFeature.requestIntelligence回傳非物件（null/字串/陣列）時分類為runtime_failure，reason為intelligence_invalid_result', () => {
    for (const badReturn of [null, 'oops', [1, 2], undefined]) {
      const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => badReturn } });
      const result = exec.requestIntelligence({ context: {} });
      assert.strictEqual(result.category, 'runtime_failure');
      assert.strictEqual(result.reason, 'intelligence_invalid_result');
    }
  });

  await test('（5.failure classification）拋出非Error物件（字串）同樣被攔截，分類為runtime_failure', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => { throw 'raw-string-throw'; } } });
    assert.doesNotThrow(() => exec.requestIntelligence({ context: {} }));
    const result = exec.requestIntelligence({ context: {} });
    assert.strictEqual(result.category, 'runtime_failure');
  });

  await test('（5.failure classification）三種分類字串恰好是contract_failure/feature_failure/runtime_failure（不多不少）', () => {
    const categories = new Set();
    categories.add(createProductExecution({}).requestIntelligence(null).category);
    categories.add(createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'x' }) } }).requestIntelligence({ context: {} }).category);
    categories.add(createProductExecution({ intelligenceFeature: { requestIntelligence: () => { throw new Error('x'); } } }).requestIntelligence({ context: {} }).category);
    assert.deepStrictEqual([...categories].sort(), ['contract_failure', 'feature_failure', 'runtime_failure']);
  });

  await test('（5.failure classification）product_execution.js的原始碼確實含有try/catch（Runtime Failure攔截職責的具體實作證據）', () => {
    assert.ok(/\btry\s*\{/.test(productExecutionSrc));
    assert.ok(/\bcatch\s*\(/.test(productExecutionSrc));
  });

  await test('（5.failure classification）README.md記錄五種失敗來源分類，並明確說明只有三種在本次實作可具體區分', () => {
    for (const kw of ['Contract Failure', 'Adapter Failure', 'Feature Failure', 'Capability Failure', 'Runtime Failure']) {
      assert.ok(readme.includes(kw), `README缺少關鍵字：${kw}`);
    }
  });

  await test('（5.failure classification）沒有任何重試邏輯（原始碼不含setTimeout/retry/重試相關關鍵字）', () => {
    assert.ok(!/setTimeout/.test(productExecutionSrc));
    assert.ok(!/\bretry\b/i.test(productExecutionSrc));
  });

  console.log('');

  // =========================================================================
  // F. adapter compatibility
  // =========================================================================
  console.log('--- F. adapter compatibility ---');

  await test('（6.adapter compatibility）Product Adapter可以把Execution Boundary當作自己的intelligenceFeature依賴注入，完全不需要修改Adapter任何程式碼', () => {
    const executionBoundary = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { analysis: {} } }) } });
    const adapter = createProductAdapter({ intelligenceFeature: executionBoundary });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result, { analysis: {} });
  });

  await test('（6.adapter compatibility）端對端：Adapter+ExecutionBoundary+真實Feature串接成功，結果恰好包含analysis跟recommendation', () => {
    const executionBoundary = createProductExecution({ intelligenceFeature: makeRealIntelligenceFeature() });
    const adapter = createProductAdapter({ intelligenceFeature: executionBoundary });
    const result = adapter.forwardProductRequest({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（6.adapter compatibility）Execution Boundary的Runtime Failure透過Adapter往上傳遞時，Adapter把它包裝成自己的intelligence stage（Adapter既有邏輯不需要知道Execution Boundary的存在）', () => {
    const executionBoundary = createProductExecution({ intelligenceFeature: { requestIntelligence: () => { throw new Error('x'); } } });
    const adapter = createProductAdapter({ intelligenceFeature: executionBoundary });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'internal_error');
    assert.strictEqual(result.stage, 'intelligence');
    assert.strictEqual(result.boundary, 'product-adapter');
  });

  await test('（6.adapter compatibility）Execution Boundary的Feature Failure透過Adapter往上傳遞時，reason/field原樣透傳', () => {
    const executionBoundary = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'invalid_context', field: 'context' }) } });
    const adapter = createProductAdapter({ intelligenceFeature: executionBoundary });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'invalid_context');
    assert.strictEqual(result.field, 'context');
  });

  await test('（6.adapter compatibility）端對端：Entry+Adapter+ExecutionBoundary+真實Feature完整四層串接成功', () => {
    const executionBoundary = createProductExecution({ intelligenceFeature: makeRealIntelligenceFeature() });
    const adapter = createProductAdapter({ intelligenceFeature: executionBoundary });
    const entry = createProductEntry({ adapter });
    const result = entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.boundary, 'product-entry');
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（6.adapter compatibility）deterministic：完整四層串接後，同樣的request重複呼叫得到完全相同的結果', () => {
    const executionBoundary = createProductExecution({ intelligenceFeature: makeRealIntelligenceFeature() });
    const adapter = createProductAdapter({ intelligenceFeature: executionBoundary });
    const entry = createProductEntry({ adapter });
    const request = { rawInput: makeInsightContext() };
    assert.deepStrictEqual(entry.requestProductEntry(request), entry.requestProductEntry(request));
  });

  await test('（6.adapter compatibility）product_adapter.js（TASK1.100）本次任務完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/adapter/product_adapter.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.adapter compatibility）src/intelligence/product/adapter/ 整個目錄本次任務完全沒有任何檔案被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/product/adapter/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  console.log('');

  // =========================================================================
  // G. feature compatibility
  // =========================================================================
  console.log('--- G. feature compatibility ---');

  await test('（7.feature compatibility）Execution Boundary呼叫intelligenceFeature.requestIntelligence()時，request原樣轉交（不篩選/不重新包裝）', () => {
    let received;
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: (r) => { received = r; return { ok: true, feature: 'intelligence', data: {} }; } } });
    const request = { context: { x: 1 }, options: { y: 2 } };
    exec.requestIntelligence(request);
    assert.strictEqual(received, request);
  });

  await test('（7.feature compatibility）Execution Boundary完全符合Feature Intelligence Integration既有的{context, options?}request contract（TASK1.79既有定義）', () => {
    const feature = makeRealIntelligenceFeature();
    const exec = createProductExecution({ intelligenceFeature: feature });
    assert.doesNotThrow(() => exec.requestIntelligence({ context: makeInsightContext() }));
  });

  await test('（7.feature compatibility）Execution Boundary可以直接注入真正的Feature Intelligence Integration（createIntelligenceFeature()的回傳值）作為intelligenceFeature依賴', () => {
    const feature = makeRealIntelligenceFeature();
    const exec = createProductExecution({ intelligenceFeature: feature });
    const result = exec.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.feature compatibility）intelligence_feature.js（TASK1.79）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/features/intelligence/intelligence_feature.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.feature compatibility）Execution Boundary不會多傳或漏傳options欄位——沒有options時intelligenceFeature收到的request也沒有options', () => {
    let received;
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: (r) => { received = r; return { ok: true, feature: 'intelligence', data: {} }; } } });
    exec.requestIntelligence({ context: {} });
    assert.strictEqual('options' in received, false);
  });

  console.log('');

  // =========================================================================
  // H. contract compatibility
  // =========================================================================
  console.log('--- H. contract compatibility ---');

  await test('（8.contract compatibility）requestIntelligence()回傳形狀恰好符合Feature Intelligence Integration既有的{ok, feature, data}/{ok:false, feature, reason, field?, stage?}外觀（額外欄位boundary/category下游會忽略）', () => {
    const exec = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { a: 1 } }) } });
    const result = exec.requestIntelligence({ context: {} });
    assert.strictEqual(typeof result.ok, 'boolean');
    assert.strictEqual(result.feature, 'intelligence');
    assert.ok('data' in result);
  });

  await test('（8.contract compatibility）buildFailureResult(reason, field, stage, category)四個都帶時恰好6個欄位', () => {
    const rb = createProductExecutionResultBuilder();
    const out = rb.buildFailureResult('r', 'f', 's', 'c');
    assert.deepStrictEqual(Object.keys(out).sort(), ['boundary', 'category', 'feature', 'field', 'ok', 'reason', 'stage']);
  });

  await test('（8.contract compatibility）buildFailureResult(reason)沒有field/stage/category時只回傳{ok, feature, boundary, reason}四個欄位', () => {
    const rb = createProductExecutionResultBuilder();
    const out = rb.buildFailureResult('r');
    assert.deepStrictEqual(Object.keys(out).sort(), ['boundary', 'feature', 'ok', 'reason']);
  });

  await test('（8.contract compatibility）buildFailureResult(非字串reason)時reason退回unknown_error', () => {
    const rb = createProductExecutionResultBuilder();
    for (const v of [null, undefined, 123, {}, []]) {
      assert.strictEqual(rb.buildFailureResult(v).reason, 'unknown_error');
    }
  });

  await test('（8.contract compatibility）README.md記錄Execution Boundary的五個責任：接收/管理/呼叫/正規化/分類', () => {
    for (const kw of ['接收', '管理', '呼叫', '正規化', '分類']) {
      assert.ok(readme.includes(kw), `README缺少關鍵字：${kw}`);
    }
  });

  await test('（8.contract compatibility）README.md明確記錄"目前狀態"：沒有接進bootstrap/application.js，沒有注入到Product Adapter既有的呼叫鏈', () => {
    const flat = readme.replace(/\n/g, ' ');
    assert.ok(/沒有\*{0,2}接進`src\/bootstrap\/application\.js`/.test(flat));
    assert.ok(/沒有\*{0,2}注入到Product\s*Adapter既有的\s*呼叫鏈/.test(flat));
  });

  console.log('');

  // =========================================================================
  // I. dependency direction
  // =========================================================================
  console.log('--- I. dependency direction ---');

  await test('（9.dependency direction）src/intelligence/product/ 底下現在至少包含entry/、adapter/、execution/三個子目錄', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirNames = entries.map((e) => e.name);
    assert.ok(dirNames.includes('entry'));
    assert.ok(dirNames.includes('adapter'));
    assert.ok(dirNames.includes('execution'));
    assert.ok(entries.every((e) => e.isDirectory()));
  });

  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    if (layer !== 'product-execution') {
      await test(`（9.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
        const relPath = path.relative(repoRoot, full);
        const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
        assert.strictEqual(diff.trim(), '');
      });
    } else {
      await test(`（TASK1.102後更新）（9.dependency direction）${layer}/${file} 是TASK1.101自己的commit（eae66d2）新增的檔案（git show --name-status確認，而不是檢查即時git status——避免被後續任何時間點的執行誤判為失敗，延續TASK1.99/1.100測試套件同樣的修正）`, () => {
        const relPath = path.relative(repoRoot, full);
        const nameStatus = execFileSync('git', ['show', '--name-status', '--pretty=format:', 'eae66d2'], { cwd: repoRoot, encoding: 'utf8' });
        const line = nameStatus.split('\n').find((l) => l.endsWith('\t' + relPath));
        assert.ok(line && line.startsWith('A'), `預期${relPath}在eae66d2被新增，實際：${line}`);
      });
    }
    const src = readSrc(full);
    await test(`（9.dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（9.dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    if (layer === 'product-execution') {
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（9.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/（不得繞過Feature Intelligence Integration直接呼叫Capability層）`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（9.dependency direction）${layer}/${file} 完全不import src/routes/、src/controllers/、worker.js、Product Entry/Adapter`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
        assert.ok(!/from\s+['"].*\/entry\//.test(src));
        assert.ok(!/from\s+['"].*\/adapter\//.test(src));
      });
    } else if (layer !== 'product-entry' && layer !== 'product-adapter') {
      for (const subdir of ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution']) {
        await test(`（9.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（9.dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

  await test('（9.dependency direction）product_execution.js只import自己目錄底下的product_execution_result_builder.js（沒有其他import）', () => {
    const importLines = productExecutionSrc.match(/^import .*/gm) || [];
    assert.deepStrictEqual(importLines, ["import { createProductExecutionResultBuilder } from './product_execution_result_builder.js';"]);
  });

  await test('（9.dependency direction）product_execution_result_builder.js完全沒有任何import（自我完整）', () => {
    assert.ok(!/^import /m.test(productExecutionResultBuilderSrc));
  });

  await test('（9.dependency direction）index.js只re-export product_execution.js跟product_execution_result_builder.js的內容', () => {
    assert.ok(productExecutionIndexSrc.includes("from './product_execution.js'"));
    assert.ok(productExecutionIndexSrc.includes("from './product_execution_result_builder.js'"));
    const exportLines = (productExecutionIndexSrc.match(/^export \{.*\} from '.*';$/gm) || []);
    assert.strictEqual(exportLines.length, 2);
  });

  await test('（9.dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.dependency direction）app.intelligence物件恰好維持24個欄位不變', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（9.dependency direction）app.router.routes 數量沒有因為新增Product Execution而改變（依然是21條）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（9.dependency direction）src/routes/、src/controllers/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/routes/ src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）migrations/ 目錄本次任務完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）src/db/ 目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）四層既有Phase 4 Capability完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（9.dependency direction）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）9份Phase 5規劃/審查文件本次任務完全沒有被修改', () => {
    const PHASE5_DOCS = [
      'PHASE5_PRODUCT_INTEGRATION_PLAN.md', 'PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md', 'PHASE5_PRODUCT_ADAPTER_PLAN.md',
      'PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md', 'PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md', 'PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md',
      'PHASE5_OPERATIONAL_BOUNDARY_PLAN.md', 'PHASE5_PRODUCT_INTEGRATION_CONSOLIDATION_REVIEW.md', 'PHASE5_IMPLEMENTATION_READINESS_PLAN.md',
    ];
    for (const docName of PHASE5_DOCS) {
      const diff = execFileSync('git', ['diff', '--stat', `src/intelligence/${docName}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${docName} 不應該被本次任務修改`);
    }
  });

  console.log('');

  // =========================================================================
  // J. AI boundary
  // =========================================================================
  console.log('--- J. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt/i,
  ];

  for (const { layer, file, full } of ALL_SCANNED_FILES) {
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

  await test('（10.AI boundary）README.md不含實際的AI呼叫程式碼字樣', () => {
    for (const pattern of [/api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i]) {
      assert.ok(!pattern.test(readme));
    }
  });

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

  await test('（10.AI boundary）package.json本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.101-product-execution')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 91, `預期至少91個既有測試檔案，實際 ${allSuites.length}`);
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

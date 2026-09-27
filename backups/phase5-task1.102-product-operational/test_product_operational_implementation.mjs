/*
 * Phase 5 TASK 1.102｜Product Operational Boundary Minimal
 * Implementation 測試
 *
 * 本任務是Phase 5系列第四個寫production code的任務（前三個是
 * TASK1.99 Product Entry、TASK1.100 Product Adapter、TASK1.101
 * Product Execution）。依照TASK1.96 Operational Boundary
 * Architecture Planning，在
 * `src/intelligence/product/operational/`底下建立最小的
 * Product Operational Boundary骨架：`product_operational.js`、
 * `product_operational_result_builder.js`、`index.js`、
 * `README.md`。
 *
 * 本次任務**不**實作任何監控dashboard、**不**實作AI、**不**
 * 修改worker.js/routes/controllers/auth/oauth/session/database
 * schema/migrations/Analysis Runner/Recommendation Runner/
 * Phase 2 Runtime Orchestrator/Phase 3 Application Pattern/
 * Phase 4 Capability Architecture/Product Entry（TASK1.99）/
 * Product Adapter（TASK1.100）/Product Execution
 * （TASK1.101）、**不**接進`src/bootstrap/application.js`。
 *
 * 分為以下11個部分：
 * A) operational creation
 * B) lifecycle observation
 * C) metadata filtering
 * D) execution compatibility
 * E) adapter compatibility
 * F) error observation
 * G) dependency direction
 * H) backward compatibility
 * I) AI boundary
 * J) regression validation
 * K) P1-P6
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
const productOperationalDir = path.join(productDir, 'operational');

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
const PRODUCT_OPERATIONAL_LAYER = { name: 'product-operational', dir: productOperationalDir, files: ['product_operational.js', 'product_operational_result_builder.js', 'index.js'] };
const ALL_LAYERS = [...PHASE4_LAYERS, PRODUCT_ENTRY_LAYER, PRODUCT_ADAPTER_LAYER, PRODUCT_EXECUTION_LAYER, PRODUCT_OPERATIONAL_LAYER];
const ALL_SCANNED_FILES = ALL_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));
const PRODUCT_LAYER_NAMES = ['product-entry', 'product-adapter', 'product-execution', 'product-operational'];

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
  const { createProductExecution } = await import(path.join(productExecutionDir, 'index.js'));
  const { createProductOperational, createProductOperationalResultBuilder } = await import(path.join(productOperationalDir, 'index.js'));

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

  const productOperationalSrc = readSrc(path.join(productOperationalDir, 'product_operational.js'));
  const productOperationalResultBuilderSrc = readSrc(path.join(productOperationalDir, 'product_operational_result_builder.js'));
  const productOperationalIndexSrc = readSrc(path.join(productOperationalDir, 'index.js'));
  const productExecutionSrc = readSrc(path.join(productExecutionDir, 'product_execution.js'));
  const productAdapterSrc = readSrc(path.join(productAdapterDir, 'product_adapter.js'));
  const readme = fs.readFileSync(path.join(productOperationalDir, 'README.md'), 'utf8');

  // =========================================================================
  // A. operational creation
  // =========================================================================
  console.log('--- A. operational creation ---');

  await test('（1.operational creation）src/intelligence/product/operational/ 目錄存在', () => {
    assert.ok(fs.existsSync(productOperationalDir) && fs.statSync(productOperationalDir).isDirectory());
  });

  await test('（1.operational creation）src/intelligence/product/operational/ 底下恰好是規格要求的4個檔案', () => {
    const files = fs.readdirSync(productOperationalDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'index.js', 'product_operational.js', 'product_operational_result_builder.js']);
  });

  for (const f of ['product_operational.js', 'product_operational_result_builder.js', 'index.js', 'README.md']) {
    await test(`（1.operational creation）src/intelligence/product/operational/${f} 存在且非空`, () => {
      const stat = fs.statSync(path.join(productOperationalDir, f));
      assert.ok(stat.isFile());
      assert.ok(stat.size > 0);
    });
  }

  await test('（1.operational creation）createProductOperational 是一個function', () => {
    assert.strictEqual(typeof createProductOperational, 'function');
  });

  await test('（1.operational creation）createProductOperationalResultBuilder 是一個function', () => {
    assert.strictEqual(typeof createProductOperationalResultBuilder, 'function');
  });

  await test('（1.operational creation）createProductOperational() 不需要任何參數也可以呼叫', () => {
    assert.doesNotThrow(() => createProductOperational());
  });

  await test('（1.operational creation）createProductOperational({}) 回傳的物件具有 requestIntelligence function', () => {
    const op = createProductOperational({});
    assert.strictEqual(typeof op.requestIntelligence, 'function');
  });

  await test('（1.operational creation）createProductOperational() 每次呼叫都回傳新的獨立實例', () => {
    const op1 = createProductOperational({});
    const op2 = createProductOperational({});
    assert.notStrictEqual(op1, op2);
    assert.notStrictEqual(op1.requestIntelligence, op2.requestIntelligence);
  });

  await test('（1.operational creation）createProductOperationalResultBuilder() 回傳的物件具有 buildStartedMetadata/buildCompletedMetadata/buildFailedMetadata三個function', () => {
    const rb = createProductOperationalResultBuilder();
    assert.strictEqual(typeof rb.buildStartedMetadata, 'function');
    assert.strictEqual(typeof rb.buildCompletedMetadata, 'function');
    assert.strictEqual(typeof rb.buildFailedMetadata, 'function');
  });

  await test('（1.operational creation）createProductOperational 可以自訂 metadataBuilder 依賴注入', () => {
    let called = false;
    const customBuilder = {
      buildStartedMetadata: () => ({ custom: 'started' }),
      buildCompletedMetadata: () => { called = true; return { custom: 'completed' }; },
      buildFailedMetadata: () => ({ custom: 'failed' }),
    };
    const events = [];
    const op = createProductOperational({
      metadataBuilder: customBuilder,
      observer: (m) => events.push(m),
      intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) },
    });
    op.requestIntelligence({ context: {} });
    assert.strictEqual(called, true);
    assert.deepStrictEqual(events, [{ custom: 'started' }, { custom: 'completed' }]);
  });

  console.log('');

  // =========================================================================
  // B. lifecycle observation
  // =========================================================================
  console.log('--- B. lifecycle observation ---');

  await test('（2.lifecycle observation）成功路徑：observer恰好被呼叫兩次，順序是started→completed', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m), intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    op.requestIntelligence({ context: {} });
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].phase, 'started');
    assert.strictEqual(events[1].phase, 'completed');
  });

  await test('（2.lifecycle observation）Feature Failure路徑：observer恰好被呼叫兩次，順序是started→failed', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m), intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'x' }) } });
    op.requestIntelligence({ context: {} });
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].phase, 'started');
    assert.strictEqual(events[1].phase, 'failed');
  });

  await test('（2.lifecycle observation）Runtime例外路徑：observer依然恰好被呼叫兩次，順序是started→failed', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m), intelligenceFeature: { requestIntelligence: () => { throw new Error('x'); } } });
    try { op.requestIntelligence({ context: {} }); } catch (e) { /* expected */ }
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].phase, 'started');
    assert.strictEqual(events[1].phase, 'failed');
  });

  await test('（2.lifecycle observation）intelligenceFeature依賴缺失時：observer依然恰好被呼叫兩次，started→failed', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m) });
    op.requestIntelligence({ context: {} });
    assert.strictEqual(events.length, 2);
    assert.deepStrictEqual(events[1], { phase: 'failed', ok: false, reason: 'intelligence_feature_unavailable' });
  });

  await test('（2.lifecycle observation）沒有提供observer時，requestIntelligence()依然正常運作（觀察是選填的，不影響核心行為）', () => {
    const op = createProductOperational({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    assert.doesNotThrow(() => op.requestIntelligence({ context: {} }));
    const result = op.requestIntelligence({ context: {} });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.lifecycle observation）每次requestIntelligence()呼叫都獨立產生一組started/completed事件（不累積前一次）', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m), intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    op.requestIntelligence({ context: {} });
    op.requestIntelligence({ context: {} });
    assert.strictEqual(events.length, 4);
    assert.strictEqual(events[0].phase, 'started');
    assert.strictEqual(events[1].phase, 'completed');
    assert.strictEqual(events[2].phase, 'started');
    assert.strictEqual(events[3].phase, 'completed');
  });

  await test('（2.lifecycle observation）started事件不包含ok欄位（此時尚未知道成功/失敗）', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m), intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    op.requestIntelligence({ context: {} });
    assert.strictEqual('ok' in events[0], false);
  });

  console.log('');

  // =========================================================================
  // C. metadata filtering
  // =========================================================================
  console.log('--- C. metadata filtering ---');

  await test('（3.metadata filtering）成功事件恰好可能包含phase/ok/version/resultCounts/durationMs欄位（不多不少的allowed set）', () => {
    const events = [];
    let tick = 0;
    const clock = () => (tick += 10);
    const op = createProductOperational({
      observer: (m) => events.push(m),
      clock,
      intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { analysis: { insights: [1, 2], metadata: { version: '1.0.0' } }, recommendation: { recommendations: [1], metadata: { version: '1.0.0' } } } }) },
    });
    op.requestIntelligence({ context: {} });
    const completedKeys = Object.keys(events[1]).sort();
    assert.deepStrictEqual(completedKeys, ['durationMs', 'ok', 'phase', 'resultCounts', 'version']);
  });

  await test('（3.metadata filtering）失敗事件恰好可能包含phase/ok/reason/stage/durationMs欄位（不多不少的allowed set，明確不含field）', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m), intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'x', field: 'sensitive-field-name', stage: 'analysis' }) } });
    op.requestIntelligence({ context: {} });
    const failedKeys = Object.keys(events[1]).sort();
    assert.deepStrictEqual(failedKeys, ['ok', 'phase', 'reason', 'stage']);
    assert.strictEqual('field' in events[1], false);
  });

  await test('（3.metadata filtering）失敗事件完全不包含底層回傳的field值（即使底層有field，也不會轉發）', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m), intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'invalid_context', field: 'context' }) } });
    op.requestIntelligence({ context: {} });
    assert.ok(!JSON.stringify(events).includes('"field"'));
  });

  await test('（3.metadata filtering）resultCounts只包含insights/recommendations的長度數字，完全不含陣列內容', () => {
    const events = [];
    const op = createProductOperational({
      observer: (m) => events.push(m),
      intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { analysis: { insights: [{ secret: 'PII-analysis-content' }] }, recommendation: { recommendations: [{ secret: 'PII-recommendation-content' }] } } }) },
    });
    op.requestIntelligence({ context: {} });
    assert.deepStrictEqual(events[1].resultCounts, { insights: 1, recommendations: 1 });
    assert.ok(!JSON.stringify(events).includes('PII-analysis-content'));
    assert.ok(!JSON.stringify(events).includes('PII-recommendation-content'));
  });

  await test('（3.metadata filtering）observer完全收不到request.context的任何內容（敏感的Insight Context資料）', () => {
    const events = [];
    const op = createProductOperational({
      observer: (m) => events.push(m),
      intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) },
    });
    op.requestIntelligence({ context: { secretDietRecord: 'user ate 3000 calories of PII-SECRET-FOOD today' } });
    assert.ok(!JSON.stringify(events).includes('PII-SECRET-FOOD'));
    assert.ok(!JSON.stringify(events).includes('secretDietRecord'));
  });

  await test('（3.metadata filtering）observer完全收不到userId（即使request.options帶了userId風格的欄位）', () => {
    const events = [];
    const op = createProductOperational({
      observer: (m) => events.push(m),
      intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) },
    });
    op.requestIntelligence({ context: {}, options: { userId: 'user-secret-id-12345' } });
    assert.ok(!JSON.stringify(events).includes('user-secret-id-12345'));
  });

  await test('（3.metadata filtering）沒有注入clock時，durationMs完全不會出現在任何事件裡', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m), intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    op.requestIntelligence({ context: {} });
    for (const event of events) {
      assert.strictEqual('durationMs' in event, false);
    }
  });

  await test('（3.metadata filtering）clock拋出例外時，durationMs安全地不出現（不影響其他欄位/不拋出）', () => {
    const events = [];
    const badClock = () => { throw new Error('clock broken'); };
    const op = createProductOperational({ observer: (m) => events.push(m), clock: badClock, intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    assert.doesNotThrow(() => op.requestIntelligence({ context: {} }));
    assert.strictEqual('durationMs' in events[1], false);
  });

  await test('（3.metadata filtering）clock回傳非數字時，durationMs安全地不出現', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m), clock: () => 'not-a-number', intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    op.requestIntelligence({ context: {} });
    assert.strictEqual('durationMs' in events[1], false);
  });

  await test('（3.metadata filtering）durationMs是clock兩次讀值的差（結束時刻減開始時刻）', () => {
    const events = [];
    const values = [100, 250];
    let i = 0;
    const clock = () => values[i++];
    const op = createProductOperational({ observer: (m) => events.push(m), clock, intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    op.requestIntelligence({ context: {} });
    assert.strictEqual(events[1].durationMs, 150);
  });

  await test('（3.metadata filtering）buildCompletedMetadata(非物件resultCounts)時resultCounts不會出現', () => {
    const rb = createProductOperationalResultBuilder();
    for (const v of [null, undefined, 'x', 1, true, []]) {
      const out = rb.buildCompletedMetadata({ resultCounts: v });
      assert.strictEqual('resultCounts' in out, false);
    }
  });

  await test('（3.metadata filtering）buildFailedMetadata(非字串reason)時reason退回unknown_error', () => {
    const rb = createProductOperationalResultBuilder();
    for (const v of [null, undefined, 123, {}, []]) {
      assert.strictEqual(rb.buildFailedMetadata({ reason: v }).reason, 'unknown_error');
    }
  });

  await test('（3.metadata filtering）buildStartedMetadata()回傳恰好{phase:"started"}一個欄位', () => {
    const rb = createProductOperationalResultBuilder();
    assert.deepStrictEqual(rb.buildStartedMetadata(), { phase: 'started' });
  });

  await test('（3.metadata filtering）README.md記錄Allowed Metadata跟Forbidden Metadata清單（status/reason/stage/version/duration/counts vs userId/context/insight/recommendation content）', () => {
    for (const kw of ['status', 'reason', 'stage', 'version']) {
      assert.ok(readme.includes(kw), `README缺少關鍵字：${kw}`);
    }
    for (const kw of ['userId', 'user identity information', 'raw context content', 'insight content', 'recommendation content', 'hidden decision logic']) {
      assert.ok(readme.includes(kw), `README缺少Forbidden關鍵字：${kw}`);
    }
  });

  console.log('');

  // =========================================================================
  // D. execution compatibility
  // =========================================================================
  console.log('--- D. execution compatibility ---');

  await test('（4.execution compatibility）Product Execution可以把Operational Boundary當作自己的intelligenceFeature依賴注入，完全不需要修改Execution任何程式碼', () => {
    const operational = createProductOperational({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { analysis: {}, recommendation: {} } }) } });
    const execution = createProductExecution({ intelligenceFeature: operational });
    const result = execution.requestIntelligence({ context: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data, { analysis: {}, recommendation: {} });
  });

  await test('（4.execution compatibility）端對端：Execution+Operational+真實Feature串接成功，結果恰好包含analysis跟recommendation', () => {
    const operational = createProductOperational({ intelligenceFeature: makeRealIntelligenceFeature() });
    const execution = createProductExecution({ intelligenceFeature: operational });
    const result = execution.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  await test('（4.execution compatibility）Execution Boundary的Execution Lifecycle依然正確走完（Operational Boundary透明代理不影響Execution自己的lifecycle追蹤）', () => {
    const operational = createProductOperational({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    const execution = createProductExecution({ intelligenceFeature: operational });
    execution.requestIntelligence({ context: {} });
    assert.deepStrictEqual(execution.getLastExecutionState().transitions, ['request_received', 'validation_completed', 'execution_started', 'execution_completed']);
  });

  await test('（4.execution compatibility）Operational Boundary的Runtime例外透過Execution Boundary時，Execution正確攔截並分類為runtime_failure（Execution既有邏輯不需要知道Operational的存在）', () => {
    const operational = createProductOperational({ intelligenceFeature: { requestIntelligence: () => { throw new Error('x'); } } });
    const execution = createProductExecution({ intelligenceFeature: operational });
    const result = execution.requestIntelligence({ context: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.category, 'runtime_failure');
    assert.strictEqual(result.reason, 'internal_error');
  });

  await test('（4.execution compatibility）product_execution.js（TASK1.101）本次任務完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/execution/product_execution.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.execution compatibility）src/intelligence/product/execution/ 整個目錄本次任務完全沒有任何檔案被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/product/execution/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  console.log('');

  // =========================================================================
  // E. adapter compatibility
  // =========================================================================
  console.log('--- E. adapter compatibility ---');

  await test('（5.adapter compatibility）Product Adapter可以直接把Operational Boundary（跳過Execution）當作自己的intelligenceFeature依賴注入', () => {
    const operational = createProductOperational({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { analysis: {} } }) } });
    const adapter = createProductAdapter({ intelligenceFeature: operational });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result, { analysis: {} });
  });

  await test('（5.adapter compatibility）端對端：完整規格Flow（Entry→Adapter→Execution→Operational→Feature）五層串接成功', () => {
    const operational = createProductOperational({ intelligenceFeature: makeRealIntelligenceFeature() });
    const execution = createProductExecution({ intelligenceFeature: operational });
    const adapter = createProductAdapter({ intelligenceFeature: execution });
    const entry = createProductEntry({ adapter });
    const result = entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.boundary, 'product-entry');
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（5.adapter compatibility）deterministic：完整五層串接後，同樣的request重複呼叫得到完全相同的結果', () => {
    const operational = createProductOperational({ intelligenceFeature: makeRealIntelligenceFeature() });
    const execution = createProductExecution({ intelligenceFeature: operational });
    const adapter = createProductAdapter({ intelligenceFeature: execution });
    const entry = createProductEntry({ adapter });
    const request = { rawInput: makeInsightContext() };
    assert.deepStrictEqual(entry.requestProductEntry(request), entry.requestProductEntry(request));
  });

  await test('（5.adapter compatibility）完整五層串接時，observer正確收到started/completed事件，且事件內容不含任何業務資料', () => {
    const events = [];
    const operational = createProductOperational({ intelligenceFeature: makeRealIntelligenceFeature(), observer: (m) => events.push(m) });
    const execution = createProductExecution({ intelligenceFeature: operational });
    const adapter = createProductAdapter({ intelligenceFeature: execution });
    const entry = createProductEntry({ adapter });
    entry.requestProductEntry({ rawInput: makeInsightContext(), userId: 'user-should-not-leak' });
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].phase, 'started');
    assert.strictEqual(events[1].phase, 'completed');
    assert.ok(!JSON.stringify(events).includes('user-should-not-leak'));
  });

  await test('（5.adapter compatibility）product_adapter.js（TASK1.100）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/adapter/product_adapter.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.adapter compatibility）src/intelligence/product/adapter/ 整個目錄本次任務完全沒有任何檔案被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/product/adapter/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（5.adapter compatibility）src/intelligence/product/entry/ 整個目錄本次任務完全沒有任何檔案被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/product/entry/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  console.log('');

  // =========================================================================
  // F. error observation
  // =========================================================================
  console.log('--- F. error observation ---');

  await test('（6.error observation）observer拋出例外時完全被吞掉，requestIntelligence()依然回傳正確的成功結果', () => {
    const badObserver = () => { throw new Error('observer boom'); };
    const op = createProductOperational({ observer: badObserver, intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { x: 1 } }) } });
    const result = op.requestIntelligence({ context: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data, { x: 1 });
  });

  await test('（6.error observation）observer拋出例外時完全被吞掉，requestIntelligence()依然正確拋出底層的原始例外', () => {
    const badObserver = () => { throw new Error('observer boom'); };
    const op = createProductOperational({ observer: badObserver, intelligenceFeature: { requestIntelligence: () => { throw new Error('real-failure'); } } });
    assert.throws(() => op.requestIntelligence({ context: {} }), /real-failure/);
  });

  await test('（6.error observation）底層拋出例外時，Operational Boundary原樣拋出，不吞掉、不轉換成回傳值（跟Execution Boundary故意不同）', () => {
    const op = createProductOperational({ intelligenceFeature: { requestIntelligence: () => { throw new Error('propagate-me'); } } });
    assert.throws(() => op.requestIntelligence({ context: {} }), /propagate-me/);
  });

  await test('（6.error observation）底層例外訊息完全不會出現在observer收到的metadata裡（不洩漏內部細節）', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m), intelligenceFeature: { requestIntelligence: () => { throw new Error('super-secret-stack-trace-98765'); } } });
    try { op.requestIntelligence({ context: {} }); } catch (e) { /* expected */ }
    assert.ok(!JSON.stringify(events).includes('super-secret-stack-trace-98765'));
    assert.strictEqual(events[1].reason, 'internal_error');
  });

  await test('（6.error observation）底層回傳{ok:false,...}時，原樣回傳（不吞掉、不轉換），reason/field/stage完全保留', () => {
    const op = createProductOperational({ intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'x', field: 'y', stage: 'z' }) } });
    const result = op.requestIntelligence({ context: {} });
    assert.deepStrictEqual(result, { ok: false, reason: 'x', field: 'y', stage: 'z' });
  });

  await test('（6.error observation）底層回傳非物件時，原樣回傳（透傳，不修改）', () => {
    for (const badReturn of [null, 'oops', [1, 2]]) {
      const op = createProductOperational({ intelligenceFeature: { requestIntelligence: () => badReturn } });
      const result = op.requestIntelligence({ context: {} });
      assert.deepStrictEqual(result, badReturn);
    }
  });

  await test('（6.error observation）observer收到的失敗事件的reason恰好等於底層失敗結果的reason（原樣轉發，不重新分類）', () => {
    const events = [];
    const op = createProductOperational({ observer: (m) => events.push(m), intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'specific_reason_xyz' }) } });
    op.requestIntelligence({ context: {} });
    assert.strictEqual(events[1].reason, 'specific_reason_xyz');
  });

  await test('（6.error observation）product_operational.js的原始碼確實含有try/catch（攔截底層例外先觀察再重新拋出的具體實作證據）', () => {
    assert.ok(/\btry\s*\{/.test(productOperationalSrc));
    assert.ok(/\bcatch\s*\(/.test(productOperationalSrc));
  });

  await test('（6.error observation）product_operational.js含有throw語句（確認例外會被重新拋出，不是吞掉）', () => {
    assert.ok(/\bthrow\s+e\b/.test(productOperationalSrc));
  });

  console.log('');

  // =========================================================================
  // G. dependency direction
  // =========================================================================
  console.log('--- G. dependency direction ---');

  await test('（7.dependency direction）src/intelligence/product/ 底下現在至少包含entry/、adapter/、execution/、operational/四個子目錄', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirNames = entries.map((e) => e.name);
    for (const name of ['entry', 'adapter', 'execution', 'operational']) {
      assert.ok(dirNames.includes(name));
    }
    assert.ok(entries.every((e) => e.isDirectory()));
  });

  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    if (layer !== 'product-operational') {
      await test(`（7.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
        const relPath = path.relative(repoRoot, full);
        const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
        assert.strictEqual(diff.trim(), '');
      });
    } else {
      await test(`（TASK1.103後更新）（7.dependency direction）${layer}/${file} 是TASK1.102自己的commit（9c383d3）新增的檔案（git show --name-status確認，而不是檢查即時git status——避免被後續任何時間點的執行誤判為失敗，延續TASK1.99/1.100/1.101測試套件同樣的修正）`, () => {
        const relPath = path.relative(repoRoot, full);
        const nameStatus = execFileSync('git', ['show', '--name-status', '--pretty=format:', '9c383d3'], { cwd: repoRoot, encoding: 'utf8' });
        const line = nameStatus.split('\n').find((l) => l.endsWith('\t' + relPath));
        assert.ok(line && line.startsWith('A'), `預期${relPath}在9c383d3被新增，實際：${line}`);
      });
    }
    const src = readSrc(full);
    await test(`（7.dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（7.dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    if (layer === 'product-operational') {
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（7.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/（不得繞過Feature Intelligence Integration直接呼叫Capability層）`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（7.dependency direction）${layer}/${file} 完全不import src/routes/、src/controllers/、worker.js、Product Entry/Adapter/Execution`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
        assert.ok(!/from\s+['"].*\/entry\//.test(src));
        assert.ok(!/from\s+['"].*\/adapter\//.test(src));
        assert.ok(!/from\s+['"].*\/execution\//.test(src));
      });
    } else if (!PRODUCT_LAYER_NAMES.includes(layer)) {
      for (const subdir of ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution']) {
        await test(`（7.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（7.dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

  await test('（7.dependency direction）product_operational.js只import自己目錄底下的product_operational_result_builder.js（沒有其他import）', () => {
    const importLines = productOperationalSrc.match(/^import .*/gm) || [];
    assert.deepStrictEqual(importLines, ["import { createProductOperationalResultBuilder } from './product_operational_result_builder.js';"]);
  });

  await test('（7.dependency direction）product_operational_result_builder.js完全沒有任何import（自我完整）', () => {
    assert.ok(!/^import /m.test(productOperationalResultBuilderSrc));
  });

  await test('（7.dependency direction）index.js只re-export product_operational.js跟product_operational_result_builder.js的內容', () => {
    assert.ok(productOperationalIndexSrc.includes("from './product_operational.js'"));
    assert.ok(productOperationalIndexSrc.includes("from './product_operational_result_builder.js'"));
    const exportLines = (productOperationalIndexSrc.match(/^export \{.*\} from '.*';$/gm) || []);
    assert.strictEqual(exportLines.length, 2);
  });

  await test('（7.dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.dependency direction）src/routes/、src/controllers/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/routes/ src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.dependency direction）migrations/ 目錄本次任務完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.dependency direction）src/db/ 目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.dependency direction）四層既有Phase 4 Capability完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（7.dependency direction）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.dependency direction）9份Phase 5規劃/審查文件本次任務完全沒有被修改', () => {
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
  // H. backward compatibility
  // =========================================================================
  console.log('--- H. backward compatibility ---');

  await test('（8.backward compatibility）app.intelligence物件恰好維持24個欄位不變', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（8.backward compatibility）app.router.routes 數量沒有因為新增Product Operational而改變（依然是21條）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（8.backward compatibility）端對端：Analysis Capability單獨呼叫依然正確運作', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.backward compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.backward compatibility）端對端：Feature Intelligence Integration單獨呼叫依然正確運作', () => {
    const result = makeRealIntelligenceFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.backward compatibility）端對端：Execution Boundary單獨呼叫（不經過Operational）依然正確運作，行為跟TASK1.101完成時完全一致', () => {
    const execution = createProductExecution({ intelligenceFeature: makeRealIntelligenceFeature() });
    const result = execution.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  await test('（8.backward compatibility）端對端：Adapter單獨呼叫（不經過Execution/Operational）依然正確運作，行為跟TASK1.100完成時完全一致', () => {
    const adapter = createProductAdapter({ intelligenceFeature: makeRealIntelligenceFeature() });
    const result = adapter.forwardProductRequest({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.backward compatibility）端對端：Entry單獨呼叫（沒有提供adapter）依然回傳adapter_unavailable', () => {
    const entry = createProductEntry({});
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.reason, 'adapter_unavailable');
  });

  await test('（8.backward compatibility）端對端：Insight Feature依然正確運作（本次任務沒有影響既有Insight Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.backward compatibility）端對端：Behavior Feature依然正確運作（本次任務沒有影響既有Behavior Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（8.backward compatibility）${layer.name} 目錄恰好包含規格要求的檔案（本次任務沒有新增/刪除任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  await test('（8.backward compatibility）product-entry/product-adapter/product-execution 三個目錄恰好維持既有的4個檔案（本次任務沒有新增/刪除/修改）', () => {
    assert.deepStrictEqual(fs.readdirSync(productEntryDir).sort(), ['README.md', 'index.js', 'product_entry.js', 'product_entry_result_builder.js']);
    assert.deepStrictEqual(fs.readdirSync(productAdapterDir).sort(), ['README.md', 'index.js', 'product_adapter.js', 'product_adapter_result_builder.js']);
    assert.deepStrictEqual(fs.readdirSync(productExecutionDir).sort(), ['README.md', 'index.js', 'product_execution.js', 'product_execution_result_builder.js']);
  });

  console.log('');

  // =========================================================================
  // I. AI boundary
  // =========================================================================
  console.log('--- I. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt/i,
  ];

  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（9.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（9.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
  }

  await test('（9.AI boundary）product_operational.js/product_operational_result_builder.js/index.js 完全不呼叫Date.now()/Math.random()（deterministic，時間來源必須透過clock依賴注入）', () => {
    for (const src of [productOperationalSrc, productOperationalResultBuilderSrc, productOperationalIndexSrc]) {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    }
  });

  await test('（9.AI boundary）README.md不含實際的AI呼叫程式碼字樣', () => {
    for (const pattern of [/api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i]) {
      assert.ok(!pattern.test(readme));
    }
  });

  await test('（9.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（9.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（9.AI boundary）package.json本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（9.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
  });

  await test('（9.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // J. regression validation
  // =========================================================================
  console.log('--- J. regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（10.regression validation）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.102-product-operational')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（10.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 92, `預期至少92個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（10.regression validation）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // K. P1-P6
  // =========================================================================
  console.log('--- K. P1-P6 ---');

  await test('（11.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（11.P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（11.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

/*
 * Phase 5 TASK 1.100｜Product Adapter Boundary Minimal Implementation 測試
 *
 * 本任務是Phase 5系列第二個寫production code的任務（第一個是
 * TASK1.99 Product Entry）。依照TASK1.90~1.98完成的Phase 5架構
 * 規劃，在`src/intelligence/product/adapter/`底下建立最小的
 * Product Adapter Boundary骨架：`product_adapter.js`、
 * `product_adapter_result_builder.js`、`index.js`、`README.md`。
 *
 * 本次任務**不**實作真實的product routes、**不**實作AI、**不**
 * 修改worker.js/routes/controllers/auth/oauth/session/database
 * schema/migrations/Analysis Runner/Recommendation Runner/
 * Phase 2 Runtime Orchestrator/Phase 3 Application Pattern/
 * Phase 4 Capability Architecture/Product Entry（TASK1.99）、
 * **不**接進`src/bootstrap/application.js`。
 *
 * 分為以下11個部分：
 * A) adapter creation
 * B) request mapping
 * C) response mapping
 * D) error mapping
 * E) entry compatibility
 * F) contract compatibility
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
const ALL_LAYERS = [...PHASE4_LAYERS, PRODUCT_ENTRY_LAYER, PRODUCT_ADAPTER_LAYER];
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
  const { createProductAdapter, createProductAdapterResultBuilder } = await import(path.join(productAdapterDir, 'index.js'));

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

  const productAdapterSrc = readSrc(path.join(productAdapterDir, 'product_adapter.js'));
  const productAdapterResultBuilderSrc = readSrc(path.join(productAdapterDir, 'product_adapter_result_builder.js'));
  const productAdapterIndexSrc = readSrc(path.join(productAdapterDir, 'index.js'));
  const productEntrySrc = readSrc(path.join(productEntryDir, 'product_entry.js'));
  const readme = fs.readFileSync(path.join(productAdapterDir, 'README.md'), 'utf8');

  // =========================================================================
  // A. adapter creation
  // =========================================================================
  console.log('--- A. adapter creation ---');

  await test('（1.adapter creation）src/intelligence/product/adapter/ 目錄存在', () => {
    assert.ok(fs.existsSync(productAdapterDir) && fs.statSync(productAdapterDir).isDirectory());
  });

  await test('（1.adapter creation）src/intelligence/product/adapter/ 底下恰好是規格要求的4個檔案：product_adapter.js/product_adapter_result_builder.js/index.js/README.md', () => {
    const files = fs.readdirSync(productAdapterDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'index.js', 'product_adapter.js', 'product_adapter_result_builder.js']);
  });

  for (const f of ['product_adapter.js', 'product_adapter_result_builder.js', 'index.js', 'README.md']) {
    await test(`（1.adapter creation）src/intelligence/product/adapter/${f} 存在且非空`, () => {
      const stat = fs.statSync(path.join(productAdapterDir, f));
      assert.ok(stat.isFile());
      assert.ok(stat.size > 0);
    });
  }

  await test('（1.adapter creation）createProductAdapter 是一個function', () => {
    assert.strictEqual(typeof createProductAdapter, 'function');
  });

  await test('（1.adapter creation）createProductAdapterResultBuilder 是一個function', () => {
    assert.strictEqual(typeof createProductAdapterResultBuilder, 'function');
  });

  await test('（1.adapter creation）createProductAdapter() 不需要任何參數也可以呼叫（dependencies是選填的）', () => {
    assert.doesNotThrow(() => createProductAdapter());
  });

  await test('（1.adapter creation）createProductAdapter({}) 回傳的物件具有 forwardProductRequest function', () => {
    const adapter = createProductAdapter({});
    assert.strictEqual(typeof adapter.forwardProductRequest, 'function');
  });

  await test('（1.adapter creation）createProductAdapter() 每次呼叫都回傳新的獨立實例（不是singleton）', () => {
    const adapter1 = createProductAdapter({});
    const adapter2 = createProductAdapter({});
    assert.notStrictEqual(adapter1, adapter2);
    assert.notStrictEqual(adapter1.forwardProductRequest, adapter2.forwardProductRequest);
  });

  await test('（1.adapter creation）createProductAdapterResultBuilder() 回傳的物件具有 buildSuccessResult 跟 buildFailureResult 兩個function', () => {
    const rb = createProductAdapterResultBuilder();
    assert.strictEqual(typeof rb.buildSuccessResult, 'function');
    assert.strictEqual(typeof rb.buildFailureResult, 'function');
  });

  await test('（1.adapter creation）createProductAdapter 可以自訂 resultBuilder 依賴注入', () => {
    let called = false;
    const customBuilder = {
      buildSuccessResult: (r) => { called = true; return { ok: true, boundary: 'custom', result: r }; },
      buildFailureResult: (reason) => ({ ok: false, boundary: 'custom', reason }),
    };
    const adapter = createProductAdapter({
      resultBuilder: customBuilder,
      intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) },
    });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(called, true);
    assert.strictEqual(result.boundary, 'custom');
  });

  console.log('');

  // =========================================================================
  // B. request mapping
  // =========================================================================
  console.log('--- B. request mapping ---');

  await test('（2.request mapping）productRequest.rawInput被轉換成Intelligence request的context欄位', () => {
    let received;
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: (r) => { received = r; return { ok: true, feature: 'intelligence', data: {} }; } } });
    const rawInput = { a: 1, nested: { b: 2 } };
    adapter.forwardProductRequest({ rawInput });
    assert.deepStrictEqual(received.context, rawInput);
  });

  await test('（2.request mapping）productRequest.rawInput被當作context原樣傳遞（同一個物件參照，不深拷貝/不重新建構）', () => {
    let received;
    const rawInput = { a: 1 };
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: (r) => { received = r; return { ok: true, feature: 'intelligence', data: {} }; } } });
    adapter.forwardProductRequest({ rawInput });
    assert.strictEqual(received.context, rawInput);
  });

  await test('（2.request mapping）沒有提供productRequest.options時，Intelligence request不包含options欄位', () => {
    let received;
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: (r) => { received = r; return { ok: true, feature: 'intelligence', data: {} }; } } });
    adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual('options' in received, false);
  });

  await test('（2.request mapping）提供productRequest.options時，Intelligence request原樣帶上options欄位', () => {
    let received;
    const options = { mode: 'x' };
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: (r) => { received = r; return { ok: true, feature: 'intelligence', data: {} }; } } });
    adapter.forwardProductRequest({ rawInput: {}, options });
    assert.strictEqual(received.options, options);
  });

  await test('（2.request mapping）Intelligence request恰好只有context跟options兩個可能欄位（沒有多餘的userId/rawInput洩漏）', () => {
    let received;
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: (r) => { received = r; return { ok: true, feature: 'intelligence', data: {} }; } } });
    adapter.forwardProductRequest({ rawInput: {}, userId: 'u1', options: { x: 1 } });
    assert.deepStrictEqual(Object.keys(received).sort(), ['context', 'options']);
  });

  const INVALID_PRODUCT_REQUEST_SHAPES = [
    { label: 'null', value: null },
    { label: 'undefined', value: undefined },
    { label: 'string', value: 'hello' },
    { label: 'number', value: 123 },
    { label: 'boolean', value: true },
    { label: 'array', value: [] },
    { label: 'array-with-items', value: [{ rawInput: {} }] },
  ];

  const adapterNoFeature = createProductAdapter({});

  for (const { label, value } of INVALID_PRODUCT_REQUEST_SHAPES) {
    await test(`（2.request mapping）productRequest為${label}時回傳{ok:false, reason:'invalid_product_request'}（防禦性結構檢查，不是重新定義業務驗證）`, () => {
      const result = adapterNoFeature.forwardProductRequest(value);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, 'invalid_product_request');
      assert.strictEqual(result.boundary, 'product-adapter');
    });
  }

  const INVALID_RAW_INPUT_SHAPES = [
    { label: 'missing', value: {} },
    { label: 'null', value: { rawInput: null } },
    { label: 'string', value: { rawInput: 'x' } },
    { label: 'number', value: { rawInput: 1 } },
    { label: 'array', value: { rawInput: [] } },
  ];

  for (const { label, value } of INVALID_RAW_INPUT_SHAPES) {
    await test(`（2.request mapping）productRequest.rawInput為${label}時回傳{ok:false, reason:'invalid_raw_input', field:'rawInput'}`, () => {
      const result = adapterNoFeature.forwardProductRequest(value);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, 'invalid_raw_input');
      assert.strictEqual(result.field, 'rawInput');
    });
  }

  await test('（2.request mapping）rawInput為空物件{}時通過檢查並成功轉換', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.request mapping）驗證失敗時完全不會呼叫intelligenceFeature（提前短路）', () => {
    let called = false;
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => { called = true; return { ok: true, feature: 'intelligence', data: {} }; } } });
    adapter.forwardProductRequest(null);
    adapter.forwardProductRequest({});
    assert.strictEqual(called, false);
  });

  console.log('');

  // =========================================================================
  // C. response mapping
  // =========================================================================
  console.log('--- C. response mapping ---');

  await test('（3.response mapping）成功時Product response的result恰好等於Intelligence result的data欄位（原樣傳遞analysis/recommendation）', () => {
    const data = { analysis: { status: 'x' }, recommendation: { status: 'y' } };
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data }) } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result, data);
  });

  await test('（3.response mapping）成功時Product response完全不包含Feature層內部的feature:\'intelligence\'標籤欄位（Adapter層自然過濾）', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { analysis: {} } }) } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual('feature' in result, false);
    assert.strictEqual('feature' in result.result, false);
  });

  await test('（3.response mapping）decision欄位存在時原樣透過data傳遞（選填暴露原則）', () => {
    const data = { analysis: {}, recommendation: {}, decision: { status: 'placeholder' } };
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data }) } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.deepStrictEqual(result.result.decision, { status: 'placeholder' });
  });

  await test('（3.response mapping）端對端：串接真實Intelligence Feature（Analysis+Recommendation Capability）時Product response.result恰好包含analysis跟recommendation兩個欄位', () => {
    const adapter = createProductAdapter({ intelligenceFeature: makeRealIntelligenceFeature() });
    const result = adapter.forwardProductRequest({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（3.response mapping）buildSuccessResult(非物件) 時result退回空物件{}', () => {
    const rb = createProductAdapterResultBuilder();
    for (const v of [null, undefined, 'x', 1, true, []]) {
      const out = rb.buildSuccessResult(v);
      assert.deepStrictEqual(out.result, {});
    }
  });

  await test('（3.response mapping）buildSuccessResult(result) 回傳恰好{ok, boundary, result}三個欄位', () => {
    const rb = createProductAdapterResultBuilder();
    const out = rb.buildSuccessResult({ a: 1 });
    assert.deepStrictEqual(Object.keys(out).sort(), ['boundary', 'ok', 'result']);
    assert.strictEqual(out.boundary, 'product-adapter');
  });

  await test('（3.response mapping）requestProductEntry() 是同步函式（不回傳Promise）', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result instanceof Promise, false);
    assert.strictEqual(typeof result.then, 'undefined');
  });

  console.log('');

  // =========================================================================
  // D. error mapping
  // =========================================================================
  console.log('--- D. error mapping ---');

  await test('（4.error mapping）沒有提供intelligenceFeature依賴時回傳{ok:false, reason:"intelligence_feature_unavailable"}', () => {
    const adapter = createProductAdapter({});
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'intelligence_feature_unavailable');
  });

  await test('（4.error mapping）intelligenceFeature為null時回傳intelligence_feature_unavailable', () => {
    const adapter = createProductAdapter({ intelligenceFeature: null });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'intelligence_feature_unavailable');
  });

  await test('（4.error mapping）intelligenceFeature為空物件{}（沒有requestIntelligence）時回傳intelligence_feature_unavailable', () => {
    const adapter = createProductAdapter({ intelligenceFeature: {} });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'intelligence_feature_unavailable');
  });

  await test('（4.error mapping）intelligenceFeature.requestIntelligence不是function時回傳intelligence_feature_unavailable', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: 'nope' } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'intelligence_feature_unavailable');
  });

  await test('（4.error mapping）requestIntelligence()回傳null時回傳intelligence_invalid_result，stage為intelligence', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => null } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'intelligence_invalid_result');
    assert.strictEqual(result.stage, 'intelligence');
  });

  await test('（4.error mapping）requestIntelligence()回傳陣列時回傳intelligence_invalid_result', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => [1, 2] } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'intelligence_invalid_result');
  });

  await test('（4.error mapping）requestIntelligence()回傳字串時回傳intelligence_invalid_result', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => 'oops' } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'intelligence_invalid_result');
  });

  await test('（4.error mapping）requestIntelligence()回傳{ok:false, reason, field}時原樣轉換並標記stage:intelligence（Intelligence Errors分類）', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'invalid_context', field: 'context' }) } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_context');
    assert.strictEqual(result.field, 'context');
    assert.strictEqual(result.stage, 'intelligence');
  });

  await test('（4.error mapping）requestIntelligence()回傳{ok:false}沒有reason時退回unknown_error', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => ({ ok: false }) } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'unknown_error');
    assert.strictEqual(result.stage, 'intelligence');
  });

  await test('（4.error mapping）requestIntelligence()拋出例外時，Adapter用try/catch攔截，回傳internal_error，stage為runtime（Runtime Errors分類，故意跟Entry不同）', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => { throw new Error('boom secret stack trace'); } } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'internal_error');
    assert.strictEqual(result.stage, 'runtime');
  });

  await test('（4.error mapping）requestIntelligence()拋出例外時，原始例外訊息完全不會出現在回傳結果的任何欄位裡（不洩漏內部細節）', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => { throw new Error('super-secret-internal-detail-12345'); } } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('super-secret-internal-detail-12345'));
  });

  await test('（4.error mapping）requestIntelligence()拋出非Error物件（例如字串）時同樣被攔截，回傳internal_error', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => { throw 'raw-string-throw'; } } });
    assert.doesNotThrow(() => adapter.forwardProductRequest({ rawInput: {} }));
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'internal_error');
  });

  await test('（4.error mapping）product_adapter.js的原始碼確實含有try/catch（Runtime Errors攔截職責的具體實作證據）', () => {
    assert.ok(/\btry\s*\{/.test(productAdapterSrc));
    assert.ok(/\bcatch\s*\(/.test(productAdapterSrc));
  });

  await test('（4.error mapping）product_entry.js的原始碼依然沒有任何try/catch（Entry刻意讓例外往上傳播，跟Adapter刻意不同，延續TASK1.99既有設計）', () => {
    assert.ok(!/\btry\s*\{/.test(productEntrySrc));
    assert.ok(!/\bcatch\s*\(/.test(productEntrySrc));
  });

  await test('（4.error mapping）三種失敗stage字串恰好是request/intelligence/runtime（不多不少，對應Product/Intelligence/Runtime三種錯誤分類）', () => {
    const stages = new Set();
    stages.add(adapterNoFeature.forwardProductRequest({}).stage);
    const a1 = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'x' }) } });
    stages.add(a1.forwardProductRequest({ rawInput: {} }).stage);
    const a2 = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => { throw new Error('x'); } } });
    stages.add(a2.forwardProductRequest({ rawInput: {} }).stage);
    assert.deepStrictEqual([...stages].sort(), ['intelligence', 'request', 'runtime']);
  });

  await test('（4.error mapping）buildFailureResult(reason, field, stage)三個都帶時恰好5個欄位', () => {
    const rb = createProductAdapterResultBuilder();
    const out = rb.buildFailureResult('r', 'f', 's');
    assert.deepStrictEqual(Object.keys(out).sort(), ['boundary', 'field', 'ok', 'reason', 'stage']);
  });

  await test('（4.error mapping）buildFailureResult(非字串reason)時reason退回unknown_error', () => {
    const rb = createProductAdapterResultBuilder();
    for (const v of [null, undefined, 123, {}, []]) {
      assert.strictEqual(rb.buildFailureResult(v).reason, 'unknown_error');
    }
  });

  console.log('');

  // =========================================================================
  // E. entry compatibility
  // =========================================================================
  console.log('--- E. entry compatibility ---');

  await test('（5.entry compatibility）Product Entry可以直接把Adapter當作自己的adapter依賴注入，完全不需要修改Entry任何程式碼', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { analysis: {} } }) } });
    const entry = createProductEntry({ adapter });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.boundary, 'product-entry');
    assert.deepStrictEqual(result.result, { analysis: {} });
  });

  await test('（5.entry compatibility）端對端：Entry+Adapter+真實Intelligence Feature串接成功，結果恰好包含analysis跟recommendation', () => {
    const adapter = createProductAdapter({ intelligenceFeature: makeRealIntelligenceFeature() });
    const entry = createProductEntry({ adapter });
    const result = entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（5.entry compatibility）Adapter失敗時，Entry把stage強制覆蓋成"adapter"（Entry既有邏輯，Adapter自己的內部stage不會透過Entry外洩）', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => { throw new Error('x'); } } });
    const entry = createProductEntry({ adapter });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'internal_error');
    assert.strictEqual(result.stage, 'adapter');
    assert.strictEqual(result.boundary, 'product-entry');
  });

  await test('（5.entry compatibility）Adapter回傳的result.reason/field被Entry原樣透傳（Entry不重新解讀Adapter的失敗原因）', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'invalid_context', field: 'context' }) } });
    const entry = createProductEntry({ adapter });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.reason, 'invalid_context');
    assert.strictEqual(result.field, 'context');
  });

  await test('（5.entry compatibility）Entry自己的HTTP層級驗證依然在Adapter之前執行（Entry驗證失敗時Adapter完全不會被呼叫）', () => {
    let called = false;
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => { called = true; return { ok: true, feature: 'intelligence', data: {} }; } } });
    const entry = createProductEntry({ adapter });
    entry.requestProductEntry({ userId: 123, rawInput: {} });
    assert.strictEqual(called, false);
  });

  await test('（5.entry compatibility）deterministic：Entry+Adapter串接後，同樣的request重複呼叫得到完全相同的結果', () => {
    const adapter = createProductAdapter({ intelligenceFeature: makeRealIntelligenceFeature() });
    const entry = createProductEntry({ adapter });
    const request = { rawInput: makeInsightContext() };
    assert.deepStrictEqual(entry.requestProductEntry(request), entry.requestProductEntry(request));
  });

  await test('（5.entry compatibility）product_entry.js（TASK1.99）本次任務完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/entry/product_entry.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.entry compatibility）src/intelligence/product/entry/ 整個目錄本次任務完全沒有任何檔案被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/product/entry/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  console.log('');

  // =========================================================================
  // F. contract compatibility
  // =========================================================================
  console.log('--- F. contract compatibility ---');

  await test('（6.contract compatibility）Adapter的forwardProductRequest()回傳形狀恰好符合Entry既有adapter依賴的預期介面（{ok, result}或{ok, reason, field?}）', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { a: 1 } }) } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(typeof result.ok, 'boolean');
    assert.ok('result' in result);
  });

  await test('（6.contract compatibility）Adapter不依賴Product Entry的request contract以外的任何欄位（只讀取rawInput/options，不讀取userId）', () => {
    let received;
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: (r) => { received = r; return { ok: true, feature: 'intelligence', data: {} }; } } });
    adapter.forwardProductRequest({ rawInput: { x: 1 }, userId: 'u1' });
    assert.strictEqual(JSON.stringify(received).includes('u1'), false);
  });

  await test('（6.contract compatibility）Adapter把完整轉換後的{context, options?}原樣轉交給intelligenceFeature.requestIntelligence（不篩選/不重新包裝）', () => {
    let received;
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: (r) => { received = r; return { ok: true, feature: 'intelligence', data: {} }; } } });
    adapter.forwardProductRequest({ rawInput: { x: 1 }, options: { y: 2 } });
    assert.deepStrictEqual(received, { context: { x: 1 }, options: { y: 2 } });
  });

  await test('（6.contract compatibility）Adapter恰好符合Feature Intelligence Integration既有的{context, options?}request contract（TASK1.79既有定義，Adapter不得更改這個形狀本身）', () => {
    const feature = makeRealIntelligenceFeature();
    const adapter = createProductAdapter({ intelligenceFeature: feature });
    assert.doesNotThrow(() => adapter.forwardProductRequest({ rawInput: makeInsightContext() }));
  });

  await test('（6.contract compatibility）README.md記錄Adapter的四個責任：接收/轉換/呼叫/轉換', () => {
    for (const kw of ['接收', '轉換', '呼叫']) {
      assert.ok(readme.includes(kw), `README缺少關鍵字：${kw}`);
    }
  });

  await test('（6.contract compatibility）README.md明確記錄"目前狀態"：沒有接進bootstrap/application.js，沒有注入到Product Entry既有的呼叫鏈', () => {
    const flat = readme.replace(/\n/g, ' ');
    assert.ok(/沒有\*{0,2}接進`src\/bootstrap\/application\.js`/.test(flat));
    assert.ok(/沒有\*{0,2}注入到Product\s*Entry既有的\s*呼叫鏈/.test(flat));
  });

  await test('（6.contract compatibility）README.md明確記錄Entry呼叫Adapter的既有約定：adapter.forwardProductRequest(request)，Entry層完全不需要修改', () => {
    assert.ok(readme.includes('adapter.forwardProductRequest(request)'));
    assert.ok(/Entry層完全不需要\s*修改/.test(readme.replace(/\n/g, ' ')));
  });

  console.log('');

  // =========================================================================
  // G. dependency direction
  // =========================================================================
  console.log('--- G. dependency direction ---');

  await test('（TASK1.104後更新）src/intelligence/product/ 底下至少包含本次任務建立的adapter/（後續任務新增了同層的execution/等子目錄跟TASK1.104新增的PHASE5_PRODUCT_INTEGRATION_FINAL_REVIEW.md檔案，都是合法擴充，不是回歸）', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirEntries = entries.filter((e) => e.isDirectory());
    const dirNames = dirEntries.map((e) => e.name);
    assert.ok(dirNames.includes('adapter'));
    assert.ok(dirNames.includes('entry'));
  });

  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    if (layer !== 'product-adapter') {
      await test(`（7.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
        const relPath = path.relative(repoRoot, full);
        const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
        assert.strictEqual(diff.trim(), '');
      });
    } else {
      await test(`（TASK1.101後更新）（7.dependency direction）${layer}/${file} 是TASK1.100自己的commit（080c8d9）新增的檔案（git show --name-status確認，而不是檢查即時git status——避免被後續任何時間點的執行誤判為失敗，延續TASK1.99測試套件同樣的修正）`, () => {
        const relPath = path.relative(repoRoot, full);
        const nameStatus = execFileSync('git', ['show', '--name-status', '--pretty=format:', '080c8d9'], { cwd: repoRoot, encoding: 'utf8' });
        const line = nameStatus.split('\n').find((l) => l.endsWith('\t' + relPath));
        assert.ok(line && line.startsWith('A'), `預期${relPath}在080c8d9被新增，實際：${line}`);
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
    if (layer === 'product-adapter') {
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（7.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/（不得繞過Feature Intelligence Integration直接呼叫Capability層）`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（7.dependency direction）${layer}/${file} 完全不import src/routes/、src/controllers/、worker.js、Product Entry`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
        assert.ok(!/from\s+['"].*\/entry\//.test(src));
      });
    } else if (layer !== 'product-entry') {
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

  await test('（7.dependency direction）product_adapter.js只import自己目錄底下的product_adapter_result_builder.js（沒有其他import）', () => {
    const importLines = productAdapterSrc.match(/^import .*/gm) || [];
    assert.deepStrictEqual(importLines, ["import { createProductAdapterResultBuilder } from './product_adapter_result_builder.js';"]);
  });

  await test('（7.dependency direction）product_adapter_result_builder.js完全沒有任何import（自我完整，不依賴任何其他模組）', () => {
    assert.ok(!/^import /m.test(productAdapterResultBuilderSrc));
  });

  await test('（7.dependency direction）index.js只re-export product_adapter.js跟product_adapter_result_builder.js的內容', () => {
    assert.ok(productAdapterIndexSrc.includes("from './product_adapter.js'"));
    assert.ok(productAdapterIndexSrc.includes("from './product_adapter_result_builder.js'"));
    const exportLines = (productAdapterIndexSrc.match(/^export \{.*\} from '.*';$/gm) || []);
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

  await test('（7.dependency direction）四層既有Phase 4 Capability（analysis/recommendation/orchestration/decision）本次任務完全沒有任何檔案被新增或修改', () => {
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

  await test('（8.backward compatibility）app.intelligence物件恰好維持24個欄位不變（本次任務沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（8.backward compatibility）app.router.routes 數量沒有因為新增Product Adapter而改變（依然是21條）', async () => {
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

  await test('（8.backward compatibility）端對端：Feature Intelligence Integration單獨呼叫依然正確運作（本次任務沒有影響既有Feature行為）', () => {
    const feature = makeRealIntelligenceFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'intelligence');
  });

  await test('（8.backward compatibility）端對端：Product Entry單獨呼叫（沒有提供adapter）依然回傳adapter_unavailable，行為跟TASK1.99完成時完全一致', () => {
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

  await test('（8.backward compatibility）product-entry 目錄恰好維持TASK1.99建立當下的4個檔案（本次任務沒有新增/刪除/修改）', () => {
    const files = fs.readdirSync(productEntryDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'index.js', 'product_entry.js', 'product_entry_result_builder.js']);
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
    await test(`（9.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  await test('（9.AI boundary）README.md不含實際的AI呼叫程式碼字樣（只有規格允許的規劃性字眼）', () => {
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

  await test('（9.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作（本次任務沒有影響AI延伸點的規劃位置）', () => {
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.100-product-adapter')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（10.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 90, `預期至少90個既有測試檔案，實際 ${allSuites.length}`);
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

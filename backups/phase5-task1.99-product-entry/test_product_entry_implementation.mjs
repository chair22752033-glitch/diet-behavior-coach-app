/*
 * Phase 5 TASK 1.99｜Product Entry Boundary Minimal Implementation 測試
 *
 * 本任務是Phase 5系列第一個寫production code的任務——依照
 * TASK1.90~1.98完成的Phase 5架構規劃，在
 * `src/intelligence/product/entry/`底下建立最小的Product Entry
 * Boundary骨架：`product_entry.js`、
 * `product_entry_result_builder.js`、`index.js`、`README.md`。
 *
 * 本次任務**不**實作真實的product routes、**不**實作AI、**不**
 * 修改worker.js/routes/controllers/auth/oauth/session/database
 * schema/migrations/Analysis Runner/Recommendation Runner/
 * Phase 2 Runtime Orchestrator/Phase 3 Application Pattern/
 * Phase 4 Capability Architecture、**不**接進
 * `src/bootstrap/application.js`。
 *
 * 分為以下10個部分：
 * A) entry creation
 * B) request validation
 * C) response structure
 * D) error handling
 * E) contract compatibility
 * F) dependency direction
 * G) backward compatibility
 * H) AI boundary
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
const productDir = path.join(intelDir, 'product');
const productEntryDir = path.join(productDir, 'entry');

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
const ALL_LAYERS = [...PHASE4_LAYERS, PRODUCT_ENTRY_LAYER];
const ALL_SCANNED_FILES = ALL_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));

async function run() {
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createDecisionCapability } = await import(path.join(decisionCapabilityDir, 'index.js'));
  const { createIntelligenceFeature } = await import(path.join(intelligenceFeatureDir, 'index.js'));
  const { createAnalysisRunner } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner } = await import(path.join(recommendationDir, 'index.js'));
  const { createProductEntry, createProductEntryResultBuilder } = await import(path.join(productEntryDir, 'index.js'));

  function makeRealAnalysisCapability() {
    return createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
  }
  function makeRealRecommendationCapability() {
    return createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
  }
  function makeRealFeature() {
    return createIntelligenceFeature({
      capabilityOrchestrator: createCapabilityOrchestrator({
        analysisCapability: makeRealAnalysisCapability(),
        recommendationCapability: makeRealRecommendationCapability(),
      }),
    });
  }

  const productEntrySrc = readSrc(path.join(productEntryDir, 'product_entry.js'));
  const productEntryResultBuilderSrc = readSrc(path.join(productEntryDir, 'product_entry_result_builder.js'));
  const productEntryIndexSrc = readSrc(path.join(productEntryDir, 'index.js'));
  const readme = fs.readFileSync(path.join(productEntryDir, 'README.md'), 'utf8');

  // =========================================================================
  // A. entry creation
  // =========================================================================
  console.log('--- A. entry creation ---');

  await test('（1.entry creation）src/intelligence/product/entry/ 目錄存在', () => {
    assert.ok(fs.existsSync(productEntryDir) && fs.statSync(productEntryDir).isDirectory());
  });

  await test('（1.entry creation）src/intelligence/product/entry/ 底下恰好是規格要求的4個檔案：product_entry.js/product_entry_result_builder.js/index.js/README.md', () => {
    const files = fs.readdirSync(productEntryDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'index.js', 'product_entry.js', 'product_entry_result_builder.js']);
  });

  for (const f of ['product_entry.js', 'product_entry_result_builder.js', 'index.js', 'README.md']) {
    await test(`（1.entry creation）src/intelligence/product/entry/${f} 存在且非空`, () => {
      const stat = fs.statSync(path.join(productEntryDir, f));
      assert.ok(stat.isFile());
      assert.ok(stat.size > 0);
    });
  }

  await test('（1.entry creation）createProductEntry 是一個function', () => {
    assert.strictEqual(typeof createProductEntry, 'function');
  });

  await test('（1.entry creation）createProductEntryResultBuilder 是一個function', () => {
    assert.strictEqual(typeof createProductEntryResultBuilder, 'function');
  });

  await test('（1.entry creation）createProductEntry() 不需要任何參數也可以呼叫（dependencies是選填的）', () => {
    assert.doesNotThrow(() => createProductEntry());
  });

  await test('（1.entry creation）createProductEntry({}) 回傳的物件具有 requestProductEntry function', () => {
    const entry = createProductEntry({});
    assert.strictEqual(typeof entry.requestProductEntry, 'function');
  });

  await test('（1.entry creation）createProductEntry() 每次呼叫都回傳新的獨立實例（不是singleton）', () => {
    const entry1 = createProductEntry({});
    const entry2 = createProductEntry({});
    assert.notStrictEqual(entry1, entry2);
    assert.notStrictEqual(entry1.requestProductEntry, entry2.requestProductEntry);
  });

  await test('（1.entry creation）createProductEntryResultBuilder() 回傳的物件具有 buildSuccessResult 跟 buildFailureResult 兩個function', () => {
    const rb = createProductEntryResultBuilder();
    assert.strictEqual(typeof rb.buildSuccessResult, 'function');
    assert.strictEqual(typeof rb.buildFailureResult, 'function');
  });

  await test('（1.entry creation）createProductEntry 可以自訂 resultBuilder 依賴注入', () => {
    let called = false;
    const customBuilder = {
      buildSuccessResult: (r) => { called = true; return { ok: true, boundary: 'custom', result: r }; },
      buildFailureResult: (reason) => ({ ok: false, boundary: 'custom', reason }),
    };
    const entry = createProductEntry({
      resultBuilder: customBuilder,
      adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) },
    });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(called, true);
    assert.strictEqual(result.boundary, 'custom');
  });

  console.log('');

  // =========================================================================
  // B. request validation
  // =========================================================================
  console.log('--- B. request validation ---');

  const entryNoAdapter = createProductEntry({});

  const INVALID_REQUEST_SHAPES = [
    { label: 'null', value: null, reason: 'invalid_request' },
    { label: 'undefined', value: undefined, reason: 'invalid_request' },
    { label: 'string', value: 'hello', reason: 'invalid_request' },
    { label: 'number', value: 123, reason: 'invalid_request' },
    { label: 'boolean', value: true, reason: 'invalid_request' },
    { label: 'array', value: [], reason: 'invalid_request' },
    { label: 'array-with-items', value: [{ rawInput: {} }], reason: 'invalid_request' },
  ];

  for (const { label, value, reason } of INVALID_REQUEST_SHAPES) {
    await test(`（2.request validation）request為${label}時回傳{ok:false, reason:'${reason}'}`, () => {
      const result = entryNoAdapter.requestProductEntry(value);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, reason);
      assert.strictEqual(result.boundary, 'product-entry');
      assert.strictEqual(result.field, undefined);
    });
  }

  const INVALID_RAW_INPUT_SHAPES = [
    { label: 'missing', value: {} },
    { label: 'null', value: { rawInput: null } },
    { label: 'undefined', value: { rawInput: undefined } },
    { label: 'string', value: { rawInput: 'x' } },
    { label: 'number', value: { rawInput: 1 } },
    { label: 'boolean', value: { rawInput: false } },
    { label: 'array', value: { rawInput: [] } },
    { label: 'array-with-items', value: { rawInput: [1, 2] } },
  ];

  for (const { label, value } of INVALID_RAW_INPUT_SHAPES) {
    await test(`（2.request validation）request.rawInput為${label}時回傳{ok:false, reason:'invalid_raw_input', field:'rawInput'}`, () => {
      const result = entryNoAdapter.requestProductEntry(value);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, 'invalid_raw_input');
      assert.strictEqual(result.field, 'rawInput');
      assert.strictEqual(result.boundary, 'product-entry');
    });
  }

  const INVALID_USER_ID_SHAPES = [
    { label: 'number', value: 1 },
    { label: 'boolean', value: true },
    { label: 'null', value: null },
    { label: 'object', value: {} },
    { label: 'array', value: [] },
  ];

  for (const { label, value } of INVALID_USER_ID_SHAPES) {
    await test(`（2.request validation）request.userId為${label}時回傳{ok:false, reason:'invalid_user_id', field:'userId'}`, () => {
      const result = entryNoAdapter.requestProductEntry({ rawInput: {}, userId: value });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, 'invalid_user_id');
      assert.strictEqual(result.field, 'userId');
    });
  }

  await test('（2.request validation）request.userId為undefined時（省略）不算驗證失敗', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.request validation）request.userId為合法字串時通過驗證', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    const result = entry.requestProductEntry({ rawInput: {}, userId: 'u-123' });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.request validation）request.userId為空字串時通過驗證（只檢查型別，不檢查內容）', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    const result = entry.requestProductEntry({ rawInput: {}, userId: '' });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.request validation）request.rawInput為空物件{}時通過驗證（只檢查型別，不檢查內容）', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.request validation）驗證順序：request形狀優先於rawInput，rawInput優先於userId', () => {
    const r1 = entryNoAdapter.requestProductEntry(null);
    assert.strictEqual(r1.reason, 'invalid_request');
    const r2 = entryNoAdapter.requestProductEntry({ userId: 1 });
    assert.strictEqual(r2.reason, 'invalid_raw_input');
    const r3 = entryNoAdapter.requestProductEntry({ rawInput: {}, userId: 1 });
    assert.strictEqual(r3.reason, 'invalid_user_id');
  });

  await test('（2.request validation）驗證失敗時完全不會呼叫adapter（提前短路）', () => {
    let adapterCalled = false;
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => { adapterCalled = true; return { ok: true, result: {} }; } } });
    entry.requestProductEntry(null);
    assert.strictEqual(adapterCalled, false);
    entry.requestProductEntry({});
    assert.strictEqual(adapterCalled, false);
    entry.requestProductEntry({ rawInput: {}, userId: 1 });
    assert.strictEqual(adapterCalled, false);
  });

  console.log('');

  // =========================================================================
  // C. response structure
  // =========================================================================
  console.log('--- C. response structure ---');

  await test('（3.response structure）buildSuccessResult(result) 回傳恰好{ok, boundary, result}三個欄位', () => {
    const rb = createProductEntryResultBuilder();
    const out = rb.buildSuccessResult({ a: 1 });
    assert.deepStrictEqual(Object.keys(out).sort(), ['boundary', 'ok', 'result']);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.boundary, 'product-entry');
    assert.deepStrictEqual(out.result, { a: 1 });
  });

  await test('（3.response structure）buildSuccessResult(非物件) 時result退回空物件{}', () => {
    const rb = createProductEntryResultBuilder();
    for (const v of [null, undefined, 'x', 1, true, []]) {
      const out = rb.buildSuccessResult(v);
      assert.deepStrictEqual(out.result, {});
    }
  });

  await test('（3.response structure）buildFailureResult(reason) 沒有field/stage時只回傳{ok, boundary, reason}三個欄位', () => {
    const rb = createProductEntryResultBuilder();
    const out = rb.buildFailureResult('some_reason');
    assert.deepStrictEqual(Object.keys(out).sort(), ['boundary', 'ok', 'reason']);
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.reason, 'some_reason');
  });

  await test('（3.response structure）buildFailureResult(reason, field) 帶field時回傳恰好4個欄位', () => {
    const rb = createProductEntryResultBuilder();
    const out = rb.buildFailureResult('r', 'f');
    assert.deepStrictEqual(Object.keys(out).sort(), ['boundary', 'field', 'ok', 'reason']);
    assert.strictEqual(out.field, 'f');
  });

  await test('（3.response structure）buildFailureResult(reason, field, stage) 三個都帶時回傳恰好5個欄位', () => {
    const rb = createProductEntryResultBuilder();
    const out = rb.buildFailureResult('r', 'f', 's');
    assert.deepStrictEqual(Object.keys(out).sort(), ['boundary', 'field', 'ok', 'reason', 'stage']);
    assert.strictEqual(out.stage, 's');
  });

  await test('（3.response structure）buildFailureResult(reason, undefined, stage) 省略field但帶stage時，field不出現在結果裡', () => {
    const rb = createProductEntryResultBuilder();
    const out = rb.buildFailureResult('r', undefined, 's');
    assert.strictEqual('field' in out, false);
    assert.strictEqual(out.stage, 's');
  });

  await test('（3.response structure）buildFailureResult(非字串reason) 時reason退回unknown_error', () => {
    const rb = createProductEntryResultBuilder();
    for (const v of [null, undefined, 123, {}, []]) {
      const out = rb.buildFailureResult(v);
      assert.strictEqual(out.reason, 'unknown_error');
    }
  });

  await test('（3.response structure）buildFailureResult(空字串reason) 時reason退回unknown_error', () => {
    const rb = createProductEntryResultBuilder();
    const out = rb.buildFailureResult('');
    assert.strictEqual(out.reason, 'unknown_error');
  });

  await test('（3.response structure）buildFailureResult(reason, 非字串field) 時field不出現在結果裡', () => {
    const rb = createProductEntryResultBuilder();
    for (const v of [123, {}, [], true]) {
      const out = rb.buildFailureResult('r', v);
      assert.strictEqual('field' in out, false);
    }
  });

  await test('（3.response structure）buildFailureResult(reason, field, 非字串stage) 時stage不出現在結果裡', () => {
    const rb = createProductEntryResultBuilder();
    for (const v of [123, {}, [], true]) {
      const out = rb.buildFailureResult('r', 'f', v);
      assert.strictEqual('stage' in out, false);
    }
  });

  await test('（3.response structure）成功結果的boundary欄位永遠恰好是字串"product-entry"', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: true, result: { x: 1 } }) } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.boundary, 'product-entry');
  });

  await test('（3.response structure）失敗結果的boundary欄位永遠恰好是字串"product-entry"', () => {
    const result = entryNoAdapter.requestProductEntry(null);
    assert.strictEqual(result.boundary, 'product-entry');
  });

  await test('（3.response structure）requestProductEntry() 是同步函式（不回傳Promise）', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result instanceof Promise, false);
    assert.strictEqual(typeof result.then, 'undefined');
  });

  await test('（3.response structure）成功結果的result欄位保留adapter回傳的原始物件內容（不重新拆解/合併）', () => {
    const original = { insights: [1, 2, 3], nested: { deep: true } };
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: true, result: original }) } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.deepStrictEqual(result.result, original);
  });

  console.log('');

  // =========================================================================
  // D. error handling
  // =========================================================================
  console.log('--- D. error handling ---');

  await test('（4.error handling）沒有提供adapter依賴時回傳{ok:false, reason:"adapter_unavailable"}', () => {
    const entry = createProductEntry({});
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'adapter_unavailable');
  });

  await test('（4.error handling）adapter為null時回傳adapter_unavailable', () => {
    const entry = createProductEntry({ adapter: null });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.reason, 'adapter_unavailable');
  });

  await test('（4.error handling）adapter為空物件{}（沒有forwardProductRequest）時回傳adapter_unavailable', () => {
    const entry = createProductEntry({ adapter: {} });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.reason, 'adapter_unavailable');
  });

  await test('（4.error handling）adapter.forwardProductRequest不是function（是字串）時回傳adapter_unavailable', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: 'not-a-function' } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.reason, 'adapter_unavailable');
  });

  await test('（4.error handling）adapter.forwardProductRequest回傳null時回傳adapter_invalid_result', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => null } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'adapter_invalid_result');
    assert.strictEqual(result.stage, 'adapter');
  });

  await test('（4.error handling）adapter.forwardProductRequest回傳undefined時回傳adapter_invalid_result', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => undefined } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.reason, 'adapter_invalid_result');
  });

  await test('（4.error handling）adapter.forwardProductRequest回傳字串時回傳adapter_invalid_result', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => 'oops' } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.reason, 'adapter_invalid_result');
  });

  await test('（4.error handling）adapter.forwardProductRequest回傳陣列時回傳adapter_invalid_result', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => [1, 2] } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.reason, 'adapter_invalid_result');
  });

  await test('（4.error handling）adapter.forwardProductRequest回傳{ok:false, reason, field}時原樣包裝並標記stage:adapter', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: false, reason: 'downstream_failure', field: 'x' }) } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'downstream_failure');
    assert.strictEqual(result.field, 'x');
    assert.strictEqual(result.stage, 'adapter');
  });

  await test('（4.error handling）adapter.forwardProductRequest回傳{ok:false}沒有reason時退回unknown_error', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: false }) } });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.reason, 'unknown_error');
    assert.strictEqual(result.stage, 'adapter');
  });

  await test('（4.error handling）adapter.forwardProductRequest拋出例外時，例外會往上傳播（本次任務不吞掉例外，不做try/catch）', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => { throw new Error('boom'); } } });
    assert.throws(() => entry.requestProductEntry({ rawInput: {} }), /boom/);
  });

  await test('（4.error handling）product_entry.js的原始碼沒有任何try/catch（延續既有Capability"讓例外往上傳播"的慣例，不吞掉錯誤）', () => {
    assert.ok(!/\btry\s*\{/.test(productEntrySrc));
    assert.ok(!/\bcatch\s*\(/.test(productEntrySrc));
  });

  await test('（4.error handling）驗證失敗的三種reason字串恰好是invalid_request/invalid_raw_input/invalid_user_id（不多不少）', () => {
    const reasons = new Set();
    reasons.add(entryNoAdapter.requestProductEntry(null).reason);
    reasons.add(entryNoAdapter.requestProductEntry({}).reason);
    reasons.add(entryNoAdapter.requestProductEntry({ rawInput: {}, userId: 1 }).reason);
    assert.deepStrictEqual([...reasons].sort(), ['invalid_raw_input', 'invalid_request', 'invalid_user_id']);
  });

  console.log('');

  // =========================================================================
  // E. contract compatibility
  // =========================================================================
  console.log('--- E. contract compatibility ---');

  await test('（5.contract compatibility）Product Entry把完整的request原樣轉交給adapter.forwardProductRequest（不篩選/不重新包裝欄位）', () => {
    let received;
    const entry = createProductEntry({ adapter: { forwardProductRequest: (r) => { received = r; return { ok: true, result: {} }; } } });
    const request = { rawInput: { x: 1 }, userId: 'u1' };
    entry.requestProductEntry(request);
    assert.strictEqual(received, request);
  });

  await test('（5.contract compatibility）Product Entry的request contract恰好是{rawInput(必填object), userId?(選填string)}——跟Adapter尚未落地的下游contract完全分離', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    assert.strictEqual(entry.requestProductEntry({ rawInput: {} }).ok, true);
    assert.strictEqual(entry.requestProductEntry({ rawInput: {}, userId: 'u1' }).ok, true);
  });

  await test('（5.contract compatibility）Product Entry不會額外注入或刪除request上的欄位（額外欄位會原樣一起轉交）', () => {
    let received;
    const entry = createProductEntry({ adapter: { forwardProductRequest: (r) => { received = r; return { ok: true, result: {} }; } } });
    entry.requestProductEntry({ rawInput: {}, extra: 'kept' });
    assert.strictEqual(received.extra, 'kept');
  });

  await test('（5.contract compatibility）Product Entry不依賴Intelligence Application Contract（{context, options}）形狀，兩者是不同層的contract（延續TASK1.94規劃：Contract屬於Adapter與Feature之間，Product Entry屬於更外層）', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    const result = entry.requestProductEntry({ rawInput: { context: {} } });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.contract compatibility）deterministic：同樣的request重複呼叫（同一個adapter mock）得到完全相同的結果', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: (r) => ({ ok: true, result: { echoed: r.rawInput } }) } });
    const request = { rawInput: { a: 1 } };
    assert.deepStrictEqual(entry.requestProductEntry(request), entry.requestProductEntry(request));
  });

  await test('（5.contract compatibility）README.md記錄Product Entry的四個責任：接收/驗證/轉交/回傳', () => {
    for (const kw of ['接收', '驗證', '轉交', '回傳']) {
      assert.ok(readme.includes(kw), `README缺少關鍵字：${kw}`);
    }
  });

  await test('（5.contract compatibility）README.md明確記錄"目前狀態"：沒有接進bootstrap/application.js，沒有連接任何真實route', () => {
    assert.ok(/沒有\*{0,2}接進`src\/bootstrap\/application\.js`/.test(readme.replace(/\n/g, ' ')));
    assert.ok(/沒有連接任何真實的product\s*route/.test(readme.replace(/\n/g, ' ')));
  });

  console.log('');

  // =========================================================================
  // F. dependency direction
  // =========================================================================
  console.log('--- F. dependency direction ---');

  await test('（6.dependency direction）src/intelligence/product/ 是本次任務新增的目錄', () => {
    assert.ok(fs.existsSync(productDir) && fs.statSync(productDir).isDirectory());
  });

  await test('（6.dependency direction）src/intelligence/product/ 底下恰好只有entry/一個子目錄', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    assert.deepStrictEqual(entries.map((e) => e.name), ['entry']);
    assert.ok(entries[0].isDirectory());
  });

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution', 'capabilities', 'analysis', 'recommendation', 'application'];

  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    if (layer !== 'product-entry') {
      await test(`（6.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
        const relPath = path.relative(repoRoot, full);
        const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
        assert.strictEqual(diff.trim(), '');
      });
    } else {
      await test(`（6.dependency direction）${layer}/${file} 是本次任務新增的檔案（git status --porcelain顯示為??）`, () => {
        const relPath = path.relative(repoRoot, full);
        const status = execFileSync('git', ['status', '--porcelain', relPath], { cwd: repoRoot, encoding: 'utf8' });
        assert.ok(status.trim().startsWith('??') || status.trim().startsWith('A '), `預期為新增檔案，實際狀態：${status}`);
      });
    }
    const src = readSrc(full);
    await test(`（6.dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（6.dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    if (layer === 'product-entry') {
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（6.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/（不得繞過Adapter直接呼叫Feature/Capability層）`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（6.dependency direction）${layer}/${file} 完全不import src/routes/、src/controllers/、worker.js`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
      });
    } else {
      for (const subdir of ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution']) {
        await test(`（6.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（6.dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

  await test('（6.dependency direction）product_entry.js只import自己目錄底下的product_entry_result_builder.js（沒有其他import）', () => {
    const importLines = productEntrySrc.match(/^import .*/gm) || [];
    assert.deepStrictEqual(importLines, ["import { createProductEntryResultBuilder } from './product_entry_result_builder.js';"]);
  });

  await test('（6.dependency direction）product_entry_result_builder.js完全沒有任何import（自我完整，不依賴任何其他模組）', () => {
    assert.ok(!/^import /m.test(productEntryResultBuilderSrc));
  });

  await test('（6.dependency direction）index.js只re-export product_entry.js跟product_entry_result_builder.js的內容', () => {
    assert.ok(productEntryIndexSrc.includes("from './product_entry.js'"));
    assert.ok(productEntryIndexSrc.includes("from './product_entry_result_builder.js'"));
    const importLines = (productEntryIndexSrc.match(/^export \{.*\} from '.*';$/gm) || []);
    assert.strictEqual(importLines.length, 2);
  });

  await test('（6.dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.dependency direction）src/routes/、src/controllers/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/routes/ src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（6.dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（6.dependency direction）migrations/ 目錄本次任務完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（6.dependency direction）src/db/ 目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（6.dependency direction）四層既有Phase 4 Capability（analysis/recommendation/orchestration/decision）本次任務完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（6.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（6.dependency direction）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（6.dependency direction）9份Phase 5規劃/審查文件本次任務完全沒有被修改', () => {
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
  // G. backward compatibility
  // =========================================================================
  console.log('--- G. backward compatibility ---');

  await test('（7.backward compatibility）app.intelligence物件恰好維持24個欄位不變（本次任務沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（7.backward compatibility）端對端：Analysis Capability單獨呼叫依然正確運作', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.backward compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.backward compatibility）端對端：Capability Orchestrator不提供decisionCapability時依然只回傳兩欄位（Backward Compatibility依然成立）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（7.backward compatibility）端對端：Feature Intelligence Integration依然恰好接受{context, options?}形狀', () => {
    const feature = makeRealFeature();
    assert.doesNotThrow(() => feature.requestIntelligence({ context: makeInsightContext() }));
  });

  await test('（7.backward compatibility）端對端：Insight Feature依然正確運作（本次任務沒有影響既有Insight Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.backward compatibility）端對端：Behavior Feature依然正確運作（本次任務沒有影響既有Behavior Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.backward compatibility）app.router.routes 數量沒有因為新增Product Entry而改變（依然是21條）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 21);
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（7.backward compatibility）${layer.name} 目錄恰好包含規格要求的檔案（本次任務沒有新增/刪除任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  console.log('');

  // =========================================================================
  // H. AI boundary
  // =========================================================================
  console.log('--- H. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt/i,
  ];

  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（8.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（8.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  await test('（8.AI boundary）README.md不含實際的AI呼叫程式碼字樣（只有規格允許的規劃性字眼）', () => {
    for (const pattern of [/api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i]) {
      assert.ok(!pattern.test(readme));
    }
  });

  await test('（8.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（8.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（8.AI boundary）package.json本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（8.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作（本次任務沒有影響AI延伸點的規劃位置）', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
  });

  await test('（8.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.99-product-entry')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 89, `預期至少89個既有測試檔案，實際 ${allSuites.length}`);
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

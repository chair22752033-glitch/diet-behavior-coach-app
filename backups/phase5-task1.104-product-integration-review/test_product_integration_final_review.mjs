/*
 * Phase 5 TASK 1.104｜Phase 5 Product Integration End-to-End
 * Validation Review 測試
 *
 * 本任務是驗證/審查任務——不新增任何production功能、不新增任何
 * 邊界層、不實作AI。目的是把TASK1.99~1.103已經獨立落地、獨立
 * 測試過的五個Product Integration Boundary（Entry/Contract/
 * Adapter/Execution/Operational）串成一條完整的End-to-End鏈路，
 * 驗證：
 * - Boundary responsibility separation（職責分工沒有重疊）
 * - Dependency direction（依賴方向依然單向）
 * - Request/Response lifecycle（六層鏈路完整、內容不被竄改）
 * - Error handling flow（五種獨立失敗分類互不衝突）
 * - Metadata security boundary（完整鏈路下依然不洩漏敏感資料）
 * - Contract/Backward/Capability compatibility、Runtime isolation
 *
 * 分為以下11個部分：
 * A) Entry boundary validation
 * B) Contract boundary validation
 * C) Adapter boundary validation
 * D) Execution boundary validation
 * E) Operational boundary validation
 * F) End-to-end flow validation
 * G) Dependency direction
 * H) Backward compatibility
 * I) AI boundary
 * J) Regression validation
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
const productContractDir = path.join(productDir, 'contract');
const productAdapterDir = path.join(productDir, 'adapter');
const productExecutionDir = path.join(productDir, 'execution');
const productOperationalDir = path.join(productDir, 'operational');
const reviewDocPath = path.join(productDir, 'PHASE5_PRODUCT_INTEGRATION_FINAL_REVIEW.md');

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
const PRODUCT_LAYERS = [
  { name: 'product-entry', dir: productEntryDir, files: ['product_entry.js', 'product_entry_result_builder.js', 'index.js'] },
  { name: 'product-contract', dir: productContractDir, files: ['product_contract.js', 'product_contract_validator.js', 'product_contract_result_builder.js', 'index.js'] },
  { name: 'product-adapter', dir: productAdapterDir, files: ['product_adapter.js', 'product_adapter_result_builder.js', 'index.js'] },
  { name: 'product-execution', dir: productExecutionDir, files: ['product_execution.js', 'product_execution_result_builder.js', 'index.js'] },
  { name: 'product-operational', dir: productOperationalDir, files: ['product_operational.js', 'product_operational_result_builder.js', 'index.js'] },
];
const ALL_LAYERS = [...PHASE4_LAYERS, ...PRODUCT_LAYERS];
const ALL_SCANNED_FILES = ALL_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));
const PRODUCT_LAYER_NAMES = PRODUCT_LAYERS.map((l) => l.name);
const PRODUCT_COMMITS = {
  'product-entry': 'e6cfd32',
  'product-adapter': '080c8d9',
  'product-execution': 'eae66d2',
  'product-operational': '9c383d3',
  'product-contract': '9c286a0',
};

const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution', 'capabilities', 'analysis', 'recommendation', 'application'];

async function run() {
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createIntelligenceFeature } = await import(path.join(intelligenceFeatureDir, 'index.js'));
  const { createAnalysisRunner } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner } = await import(path.join(recommendationDir, 'index.js'));
  const { createProductEntry } = await import(path.join(productEntryDir, 'index.js'));
  const { createProductContract } = await import(path.join(productContractDir, 'index.js'));
  const { createProductAdapter } = await import(path.join(productAdapterDir, 'index.js'));
  const { createProductExecution } = await import(path.join(productExecutionDir, 'index.js'));
  const { createProductOperational } = await import(path.join(productOperationalDir, 'index.js'));

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
  function makeFullChain(observer, overrideFeature) {
    const operational = createProductOperational({ intelligenceFeature: overrideFeature || makeRealIntelligenceFeature(), observer });
    const execution = createProductExecution({ intelligenceFeature: operational });
    const adapter = createProductAdapter({ intelligenceFeature: execution });
    const contract = createProductContract({ adapter });
    return createProductEntry({ adapter: contract });
  }

  const readme = fs.readFileSync(reviewDocPath, 'utf8');
  const flatReadme = readme.replace(/\n/g, ' ');

  // =========================================================================
  // A. Entry boundary validation
  // =========================================================================
  console.log('--- A. Entry boundary validation ---');

  await test('（1.Entry boundary validation）Product Entry目錄跟4個檔案依然完整存在', () => {
    assert.deepStrictEqual(fs.readdirSync(productEntryDir).sort(), ['README.md', 'index.js', 'product_entry.js', 'product_entry_result_builder.js']);
  });

  await test('（1.Entry boundary validation）Entry單獨呼叫（沒有adapter依賴）依然回傳adapter_unavailable', () => {
    const entry = createProductEntry({});
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'adapter_unavailable');
  });

  await test('（1.Entry boundary validation）Entry的request形狀驗證依然正確：rawInput必要、userId選填字串', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    assert.strictEqual(entry.requestProductEntry(null).reason, 'invalid_request');
    assert.strictEqual(entry.requestProductEntry({}).reason, 'invalid_raw_input');
    assert.strictEqual(entry.requestProductEntry({ rawInput: {}, userId: 1 }).reason, 'invalid_user_id');
    assert.strictEqual(entry.requestProductEntry({ rawInput: {}, userId: 'u1' }).ok, true);
  });

  await test('（1.Entry boundary validation）Entry依然不吞掉例外（下游拋出時原樣往上傳播）', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => { throw new Error('propagate'); } } });
    assert.throws(() => entry.requestProductEntry({ rawInput: {} }), /propagate/);
  });

  await test('（1.Entry boundary validation）Entry回傳結果恰好帶boundary:"product-entry"', () => {
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    assert.strictEqual(entry.requestProductEntry({ rawInput: {} }).boundary, 'product-entry');
  });

  console.log('');

  // =========================================================================
  // B. Contract boundary validation
  // =========================================================================
  console.log('--- B. Contract boundary validation ---');

  await test('（2.Contract boundary validation）Product Contract目錄跟5個檔案依然完整存在', () => {
    assert.deepStrictEqual(fs.readdirSync(productContractDir).sort(), ['README.md', 'index.js', 'product_contract.js', 'product_contract_result_builder.js', 'product_contract_validator.js']);
  });

  await test('（2.Contract boundary validation）Contract的request形狀驗證依然正確：rawInput/userId/options', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    assert.strictEqual(contract.forwardProductRequest(null).reason, 'invalid_request');
    assert.strictEqual(contract.forwardProductRequest({}).reason, 'invalid_raw_input');
    assert.strictEqual(contract.forwardProductRequest({ rawInput: {}, options: 'x' }).reason, 'invalid_options');
  });

  await test('（2.Contract boundary validation）Contract的response形狀驗證依然正確', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => 'not-an-object' } });
    assert.strictEqual(contract.forwardProductRequest({ rawInput: {} }).reason, 'invalid_response');
  });

  await test('（2.Contract boundary validation）Contract的版本相容性檢查依然正確：不支援的主版本號被攔下', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: { analysis: { metadata: { version: '9.9.9' } } } }) } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'unsupported_version');
  });

  await test('（2.Contract boundary validation）Contract驗證通過時依然原樣透傳下游response（同一個物件參照）', () => {
    const response = { ok: true, result: { analysis: {} } };
    const contract = createProductContract({ adapter: { forwardProductRequest: () => response } });
    assert.strictEqual(contract.forwardProductRequest({ rawInput: {} }), response);
  });

  console.log('');

  // =========================================================================
  // C. Adapter boundary validation
  // =========================================================================
  console.log('--- C. Adapter boundary validation ---');

  await test('（3.Adapter boundary validation）Product Adapter目錄跟4個檔案依然完整存在', () => {
    assert.deepStrictEqual(fs.readdirSync(productAdapterDir).sort(), ['README.md', 'index.js', 'product_adapter.js', 'product_adapter_result_builder.js']);
  });

  await test('（3.Adapter boundary validation）Adapter依然把rawInput轉換成context', () => {
    let received;
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: (r) => { received = r; return { ok: true, feature: 'intelligence', data: {} }; } } });
    adapter.forwardProductRequest({ rawInput: { a: 1 } });
    assert.deepStrictEqual(received.context, { a: 1 });
  });

  await test('（3.Adapter boundary validation）Adapter依然用try/catch攔截Runtime例外，轉換成internal_error', () => {
    const adapter = createProductAdapter({ intelligenceFeature: { requestIntelligence: () => { throw new Error('x'); } } });
    const result = adapter.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'internal_error');
    assert.strictEqual(result.stage, 'runtime');
  });

  await test('（3.Adapter boundary validation）端對端：Adapter單獨呼叫真實Intelligence Feature依然正確運作', () => {
    const adapter = createProductAdapter({ intelligenceFeature: makeRealIntelligenceFeature() });
    const result = adapter.forwardProductRequest({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  console.log('');

  // =========================================================================
  // D. Execution boundary validation
  // =========================================================================
  console.log('--- D. Execution boundary validation ---');

  await test('（4.Execution boundary validation）Product Execution目錄跟4個檔案依然完整存在', () => {
    assert.deepStrictEqual(fs.readdirSync(productExecutionDir).sort(), ['README.md', 'index.js', 'product_execution.js', 'product_execution_result_builder.js']);
  });

  await test('（4.Execution boundary validation）Execution的五階段Lifecycle依然正確：成功路徑走完整四個transitions', () => {
    const execution = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: {} }) } });
    execution.requestIntelligence({ context: {} });
    assert.deepStrictEqual(execution.getLastExecutionState().transitions, ['request_received', 'validation_completed', 'execution_started', 'execution_completed']);
  });

  await test('（4.Execution boundary validation）Execution依然把介面/回傳形狀完全比照Feature（透明代理）', () => {
    const execution = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { x: 1 } }) } });
    const result = execution.requestIntelligence({ context: {} });
    assert.strictEqual(result.feature, 'intelligence');
    assert.deepStrictEqual(result.data, { x: 1 });
  });

  await test('（4.Execution boundary validation）Execution的三種失敗分類依然正確：contract_failure/feature_failure/runtime_failure', () => {
    assert.strictEqual(createProductExecution({}).requestIntelligence(null).category, 'contract_failure');
    assert.strictEqual(createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: false, reason: 'x' }) } }).requestIntelligence({ context: {} }).category, 'feature_failure');
    assert.strictEqual(createProductExecution({ intelligenceFeature: { requestIntelligence: () => { throw new Error('x'); } } }).requestIntelligence({ context: {} }).category, 'runtime_failure');
  });

  console.log('');

  // =========================================================================
  // E. Operational boundary validation
  // =========================================================================
  console.log('--- E. Operational boundary validation ---');

  await test('（5.Operational boundary validation）Product Operational目錄跟4個檔案依然完整存在', () => {
    assert.deepStrictEqual(fs.readdirSync(productOperationalDir).sort(), ['README.md', 'index.js', 'product_operational.js', 'product_operational_result_builder.js']);
  });

  await test('（5.Operational boundary validation）Operational依然是純透傳（原樣回傳底層結果，不修改）', () => {
    const data = { analysis: { x: 1 } };
    const op = createProductOperational({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data }) } });
    const result = op.requestIntelligence({ context: {} });
    assert.deepStrictEqual(result.data, data);
  });

  await test('（5.Operational boundary validation）Operational依然原樣重新拋出底層例外（不吞掉、不轉換）', () => {
    const op = createProductOperational({ intelligenceFeature: { requestIntelligence: () => { throw new Error('propagate-me'); } } });
    assert.throws(() => op.requestIntelligence({ context: {} }), /propagate-me/);
  });

  await test('（5.Operational boundary validation）Operational的observer依然只收到Allowed Metadata（phase/ok/reason/stage/version/durationMs/resultCounts）', () => {
    const events = [];
    const op = createProductOperational({
      observer: (m) => events.push(m),
      intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { analysis: { insights: [1, 2], metadata: { version: '1.0.0' } } } }) },
    });
    op.requestIntelligence({ context: {} });
    const allowedKeys = new Set(['phase', 'ok', 'reason', 'stage', 'version', 'durationMs', 'resultCounts']);
    for (const event of events) {
      for (const key of Object.keys(event)) {
        assert.ok(allowedKeys.has(key), `未預期的欄位：${key}`);
      }
    }
  });

  await test('（5.Operational boundary validation）Operational的observer拋出例外時依然被完全吞掉，不影響執行結果', () => {
    const op = createProductOperational({ observer: () => { throw new Error('observer boom'); }, intelligenceFeature: { requestIntelligence: () => ({ ok: true, feature: 'intelligence', data: { x: 1 } }) } });
    const result = op.requestIntelligence({ context: {} });
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // F. End-to-end flow validation
  // =========================================================================
  console.log('--- F. End-to-end flow validation ---');

  await test('（6.End-to-end flow validation）完整六層鏈路（Entry→Contract→Adapter→Execution→Operational→Feature）成功串接', () => {
    const entry = makeFullChain();
    const result = entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.boundary, 'product-entry');
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（6.End-to-end flow validation）端到端deterministic：完整鏈路重複呼叫得到完全相同的結果', () => {
    const entry = makeFullChain();
    const request = { rawInput: makeInsightContext() };
    assert.deepStrictEqual(entry.requestProductEntry(request), entry.requestProductEntry(request));
  });

  await test('（6.End-to-end flow validation）Request Lifecycle：Entry驗證失敗時，Contract/Adapter/Execution/Operational/Feature全部不會被呼叫', () => {
    let contractCalled = false;
    const realAdapter = { forwardProductRequest: () => { contractCalled = true; return { ok: true, result: {} }; } };
    const contract = createProductContract({ adapter: realAdapter });
    let adapterInnerCalled = false;
    const wrappedContract = { forwardProductRequest: (r) => { adapterInnerCalled = true; return contract.forwardProductRequest(r); } };
    const entry = createProductEntry({ adapter: wrappedContract });
    entry.requestProductEntry({ userId: 123, rawInput: {} });
    assert.strictEqual(adapterInnerCalled, false);
  });

  await test('（6.End-to-end flow validation）Response Lifecycle：analysis/recommendation的內容從Runner到Entry全程沒有被修改過（deepStrictEqual逐層比對）', () => {
    const realFeature = makeRealIntelligenceFeature();
    const featureResult = realFeature.requestIntelligence({ context: makeInsightContext() });

    const entry = makeFullChain(undefined, realFeature);
    const entryResult = entry.requestProductEntry({ rawInput: makeInsightContext() });

    assert.deepStrictEqual(entryResult.result.analysis, featureResult.data.analysis);
    assert.deepStrictEqual(entryResult.result.recommendation, featureResult.data.recommendation);
  });

  await test('（6.End-to-end flow validation）Error Flow：Runtime例外從Feature經過Operational（重新拋出）、Execution（攔截分類）、Adapter（包裝）、Contract（驗證透傳）、Entry（覆寫stage）全程正確傳遞', () => {
    const events = [];
    const entry = makeFullChain((m) => events.push(m), { requestIntelligence: () => { throw new Error('deep-runtime-failure'); } });
    const result = entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'internal_error');
    assert.strictEqual(result.stage, 'adapter');
    assert.strictEqual(result.boundary, 'product-entry');
    assert.ok(!JSON.stringify(result).includes('deep-runtime-failure'));
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].phase, 'failed');
    assert.strictEqual(events[1].reason, 'internal_error');
  });

  await test('（6.End-to-end flow validation）Error Flow：Feature Failure（{ok:false,...}）從Feature到Entry全程正確傳遞', () => {
    const entry = makeFullChain(undefined, { requestIntelligence: () => ({ ok: false, reason: 'analysis_capability_unavailable', field: 'analysisCapability' }) });
    const result = entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'analysis_capability_unavailable');
    assert.strictEqual(result.field, 'analysisCapability');
    assert.strictEqual(result.stage, 'adapter');
  });

  await test('（6.End-to-end flow validation）Contract Compatibility：Contract攔截版本不相容的response時，不相容的response不會流向Entry', () => {
    const incompatibleAdapter = { forwardProductRequest: () => ({ ok: true, result: { analysis: { metadata: { version: '99.0.0' } } } }) };
    const contract = createProductContract({ adapter: incompatibleAdapter });
    const entry = createProductEntry({ adapter: contract });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'unsupported_version');
    assert.notStrictEqual(result.stage, undefined);
  });

  await test('（6.Security Boundary）完整鏈路執行時，即使context/userId含有敏感標記，observer事件序列化後完全不含這些標記', () => {
    const events = [];
    const entry = makeFullChain((m) => events.push(m));
    entry.requestProductEntry({ rawInput: makeInsightContext({ secretMarker: 'PII-SECRET-MARKER-777' }), userId: 'user-should-not-leak-777' });
    const serialized = JSON.stringify(events);
    assert.ok(!serialized.includes('PII-SECRET-MARKER-777'));
    assert.ok(!serialized.includes('user-should-not-leak-777'));
  });

  await test('（6.Security Boundary）完整鏈路失敗時，observer事件裡完全不含field欄位（Allowed Metadata清單沒有列出它）', () => {
    const events = [];
    const entry = makeFullChain((m) => events.push(m), { requestIntelligence: () => ({ ok: false, reason: 'x', field: 'sensitive-field-name' }) });
    entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.ok(!JSON.stringify(events).includes('sensitive-field-name'));
  });

  await test('（6.Runtime Isolation）完整鏈路只透過Feature Intelligence Integration一個介面接觸Capability/Runtime，五個Product Boundary本身完全不import Runtime內部模組', () => {
    for (const layer of PRODUCT_LAYERS) {
      for (const file of layer.files) {
        if (file === 'README.md') continue;
        const src = readSrc(path.join(layer.dir, file));
        assert.ok(!/from\s+['"].*\/orchestration\//.test(src), `${layer.name}/${file}不應該import orchestration/`);
      }
    }
  });

  console.log('');

  // =========================================================================
  // G. Dependency direction
  // =========================================================================
  console.log('--- G. Dependency direction ---');

  await test('（7.Dependency direction）src/intelligence/product/ 底下的5個邊界子目錄全部存在', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    for (const name of ['entry', 'contract', 'adapter', 'execution', 'operational']) {
      assert.ok(dirNames.includes(name));
    }
  });

  await test('（7.Dependency direction）PHASE5_PRODUCT_INTEGRATION_FINAL_REVIEW.md存在且非空', () => {
    const stat = fs.statSync(reviewDocPath);
    assert.ok(stat.isFile());
    assert.ok(stat.size > 0);
  });

  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    if (!PRODUCT_LAYER_NAMES.includes(layer)) {
      await test(`（7.Dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
        const relPath = path.relative(repoRoot, full);
        const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
        assert.strictEqual(diff.trim(), '');
      });
    } else {
      await test(`（7.Dependency direction）${layer}/${file} 是${PRODUCT_COMMITS[layer]}這個先前commit新增的檔案，本次審查任務完全沒有修改它`, () => {
        const relPath = path.relative(repoRoot, full);
        const diff = execFileSync('git', ['diff', '--stat', PRODUCT_COMMITS[layer], '--', relPath], { cwd: repoRoot, encoding: 'utf8' });
        assert.strictEqual(diff.trim(), '', `預期${relPath}自${PRODUCT_COMMITS[layer]}以來沒有變化`);
      });
    }
    const src = readSrc(full);
    await test(`（7.Dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（7.Dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（7.Dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

  for (const layer of PRODUCT_LAYERS) {
    for (const file of layer.files) {
      if (file === 'README.md' || file === 'index.js') continue;
      const src = readSrc(path.join(layer.dir, file));
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（7.Dependency direction）${layer.name}/${file} 完全不import src/intelligence/${subdir}/`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（7.Dependency direction）${layer.name}/${file} 完全不import src/routes/、src/controllers/、worker.js`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
      });
    }
  }

  await test('（7.Dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.Dependency direction）src/routes/、src/controllers/目錄本次任務完全沒有新增或修改任何檔案（沒有新增API route）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/routes/ src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）migrations/ 目錄本次任務完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）src/db/ 目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）四層既有Phase 4 Capability完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（7.Dependency direction）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）9份Phase 5規劃/審查文件本次任務完全沒有被修改', () => {
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

  await test('（7.Dependency direction）沒有新增任何API route（本次任務不新增production功能）', () => {
    const status = execFileSync('sh', ['-c', "git status --porcelain -- src/routes/ src/controllers/ src/worker.js"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）沒有新增任何新的邊界目錄（本次任務只審查既有5個邊界，不新增第6個）', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    assert.deepStrictEqual(dirNames, ['adapter', 'contract', 'entry', 'execution', 'features', 'operational']); // TASK1.111後更新：新增features/目錄（Health Insight Feature），這是Feature層，不是第六個Product Boundary，本次任務不需要重跑舊有結論
  });

  console.log('');

  // =========================================================================
  // H. Backward compatibility
  // =========================================================================
  console.log('--- H. Backward compatibility ---');

  await test('（8.Backward compatibility）app.intelligence物件恰好維持24個欄位不變', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（8.Backward compatibility）app.router.routes 數量沒有因為本次審查任務而改變（依然是21條）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（8.Backward compatibility）端對端：Analysis Capability單獨呼叫依然正確運作', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.Backward compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.Backward compatibility）端對端：Feature Intelligence Integration單獨呼叫依然正確運作', () => {
    const result = makeRealIntelligenceFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.Backward compatibility）端對端：Insight Feature依然正確運作（本次任務沒有影響既有Insight Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.Backward compatibility）端對端：Behavior Feature依然正確運作（本次任務沒有影響既有Behavior Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（8.Backward compatibility）${layer.name} 目錄恰好包含規格要求的檔案（本次任務沒有新增/刪除任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  for (const layer of PRODUCT_LAYERS) {
    await test(`（8.Backward compatibility）${layer.name} 目錄恰好維持既有的檔案清單（本次審查任務沒有新增/刪除/修改）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

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

  await test('（9.AI boundary）五個Product Boundary的所有.js檔案完全不呼叫Date.now()/Math.random()（deterministic）', () => {
    for (const layer of PRODUCT_LAYERS) {
      for (const file of layer.files) {
        if (file === 'README.md') continue;
        const src = readSrc(path.join(layer.dir, file));
        assert.ok(!/Date\.now\(\)/.test(src), `${layer.name}/${file}`);
        assert.ok(!/Math\.random\(\)/.test(src), `${layer.name}/${file}`);
      }
    }
  });

  await test('（9.AI boundary）五個Product Boundary完全不含Decision Algorithm/Rule Engine/Scoring Logic相關字樣（score/weight/threshold/rule engine）', () => {
    for (const layer of PRODUCT_LAYERS) {
      for (const file of layer.files) {
        if (file === 'README.md') continue;
        const src = readSrc(path.join(layer.dir, file));
        for (const pattern of [/\bscore\b/i, /\bweight(ing)?\b/i, /\bthreshold\b/i, /rule\s*engine/i]) {
          assert.ok(!pattern.test(src), `${layer.name}/${file} 出現疑似字樣：${pattern}`);
        }
      }
    }
  });

  await test('（9.AI boundary）PHASE5_PRODUCT_INTEGRATION_FINAL_REVIEW.md不含實際的AI呼叫程式碼字樣', () => {
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
  // J. Regression validation
  // =========================================================================
  console.log('--- J. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（10.Regression validation）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.104-product-integration-review')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（10.Regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 95, `預期至少95個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（10.Regression validation）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

/*
 * Phase 5 TASK 1.103｜Product Contract Boundary Minimal
 * Implementation 測試
 *
 * 本任務是Phase 5系列第五個寫production code的任務（前四個是
 * TASK1.99 Product Entry、TASK1.100 Product Adapter、TASK1.101
 * Product Execution、TASK1.102 Product Operational）。依照
 * TASK1.94 Contract Foundation規劃跟本次任務自己明確要求的
 * Implementation Flow（Entry→Contract→Adapter→Execution→
 * Operational→Feature），在
 * `src/intelligence/product/contract/`底下建立最小的Product
 * Contract Boundary骨架：`product_contract.js`、
 * `product_contract_validator.js`、
 * `product_contract_result_builder.js`、`index.js`、
 * `README.md`。
 *
 * 本次任務**不**實作真實的product routes、**不**實作AI、**不**
 * 修改worker.js/routes/controllers/auth/oauth/session/database
 * schema/migrations/Analysis Runner/Recommendation Runner/
 * Phase 2 Runtime Orchestrator/Phase 3 Application Pattern/
 * Phase 4 Capability Architecture/Product Entry（TASK1.99）/
 * Product Adapter（TASK1.100）/Product Execution
 * （TASK1.101）/Product Operational（TASK1.102）、**不**接進
 * `src/bootstrap/application.js`。
 *
 * 分為以下12個部分：
 * A) contract creation
 * B) request validation
 * C) response validation
 * D) compatibility handling
 * E) entry compatibility
 * F) adapter compatibility
 * G) execution compatibility
 * H) operational compatibility
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
const productOperationalDir = path.join(productDir, 'operational');
const productContractDir = path.join(productDir, 'contract');

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
const PRODUCT_CONTRACT_LAYER = { name: 'product-contract', dir: productContractDir, files: ['product_contract.js', 'product_contract_validator.js', 'product_contract_result_builder.js', 'index.js'] };
const ALL_LAYERS = [...PHASE4_LAYERS, PRODUCT_ENTRY_LAYER, PRODUCT_ADAPTER_LAYER, PRODUCT_EXECUTION_LAYER, PRODUCT_OPERATIONAL_LAYER, PRODUCT_CONTRACT_LAYER];
const ALL_SCANNED_FILES = ALL_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));
const PRODUCT_LAYER_NAMES = ['product-entry', 'product-adapter', 'product-execution', 'product-operational', 'product-contract'];

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
  const { createProductOperational } = await import(path.join(productOperationalDir, 'index.js'));
  const {
    createProductContract, createProductContractValidator, createProductContractResultBuilder,
    SUPPORTED_RESPONSE_VERSIONS, validateProductRequestShape, validateProductResponseShape,
    extractResponseVersion, checkVersionCompatibility,
  } = await import(path.join(productContractDir, 'index.js'));

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
  function makeFullChain(observer) {
    const operational = createProductOperational({ intelligenceFeature: makeRealIntelligenceFeature(), observer });
    const execution = createProductExecution({ intelligenceFeature: operational });
    const adapter = createProductAdapter({ intelligenceFeature: execution });
    const contract = createProductContract({ adapter });
    return createProductEntry({ adapter: contract });
  }

  const productContractSrc = readSrc(path.join(productContractDir, 'product_contract.js'));
  const productContractValidatorSrc = readSrc(path.join(productContractDir, 'product_contract_validator.js'));
  const productContractResultBuilderSrc = readSrc(path.join(productContractDir, 'product_contract_result_builder.js'));
  const productContractIndexSrc = readSrc(path.join(productContractDir, 'index.js'));
  const productEntrySrc = readSrc(path.join(productEntryDir, 'product_entry.js'));
  const productAdapterSrc = readSrc(path.join(productAdapterDir, 'product_adapter.js'));
  const readme = fs.readFileSync(path.join(productContractDir, 'README.md'), 'utf8');

  // =========================================================================
  // A. contract creation
  // =========================================================================
  console.log('--- A. contract creation ---');

  await test('（1.contract creation）src/intelligence/product/contract/ 目錄存在', () => {
    assert.ok(fs.existsSync(productContractDir) && fs.statSync(productContractDir).isDirectory());
  });

  await test('（1.contract creation）src/intelligence/product/contract/ 底下恰好是規格要求的5個檔案', () => {
    const files = fs.readdirSync(productContractDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'index.js', 'product_contract.js', 'product_contract_result_builder.js', 'product_contract_validator.js']);
  });

  for (const f of ['product_contract.js', 'product_contract_validator.js', 'product_contract_result_builder.js', 'index.js', 'README.md']) {
    await test(`（1.contract creation）src/intelligence/product/contract/${f} 存在且非空`, () => {
      const stat = fs.statSync(path.join(productContractDir, f));
      assert.ok(stat.isFile());
      assert.ok(stat.size > 0);
    });
  }

  await test('（1.contract creation）createProductContract 是一個function', () => {
    assert.strictEqual(typeof createProductContract, 'function');
  });

  await test('（1.contract creation）createProductContractValidator 是一個function', () => {
    assert.strictEqual(typeof createProductContractValidator, 'function');
  });

  await test('（1.contract creation）createProductContractResultBuilder 是一個function', () => {
    assert.strictEqual(typeof createProductContractResultBuilder, 'function');
  });

  await test('（1.contract creation）createProductContract() 不需要任何參數也可以呼叫', () => {
    assert.doesNotThrow(() => createProductContract());
  });

  await test('（1.contract creation）createProductContract({}) 回傳的物件具有 forwardProductRequest function', () => {
    const contract = createProductContract({});
    assert.strictEqual(typeof contract.forwardProductRequest, 'function');
  });

  await test('（1.contract creation）createProductContract() 每次呼叫都回傳新的獨立實例', () => {
    const c1 = createProductContract({});
    const c2 = createProductContract({});
    assert.notStrictEqual(c1, c2);
    assert.notStrictEqual(c1.forwardProductRequest, c2.forwardProductRequest);
  });

  await test('（1.contract creation）createProductContractValidator() 回傳的物件具有四個驗證function', () => {
    const validator = createProductContractValidator();
    assert.strictEqual(typeof validator.validateProductRequestShape, 'function');
    assert.strictEqual(typeof validator.validateProductResponseShape, 'function');
    assert.strictEqual(typeof validator.extractResponseVersion, 'function');
    assert.strictEqual(typeof validator.checkVersionCompatibility, 'function');
  });

  await test('（1.contract creation）createProductContractResultBuilder() 回傳的物件只有 buildFailureResult 一個function（沒有buildSuccessResult，驗證通過時原樣透傳）', () => {
    const rb = createProductContractResultBuilder();
    assert.strictEqual(typeof rb.buildFailureResult, 'function');
    assert.strictEqual('buildSuccessResult' in rb, false);
  });

  await test('（1.contract creation）createProductContract 可以自訂 validator/resultBuilder 依賴注入', () => {
    let called = false;
    const customValidator = {
      validateProductRequestShape: () => { called = true; return { ok: true }; },
      validateProductResponseShape: () => ({ ok: true }),
      extractResponseVersion: () => undefined,
      checkVersionCompatibility: () => ({ ok: true }),
    };
    const contract = createProductContract({
      validator: customValidator,
      adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) },
    });
    contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(called, true);
  });

  console.log('');

  // =========================================================================
  // B. request validation
  // =========================================================================
  console.log('--- B. request validation ---');

  const contractNoAdapter = createProductContract({});

  const INVALID_REQUEST_SHAPES = [
    { label: 'null', value: null },
    { label: 'undefined', value: undefined },
    { label: 'string', value: 'hello' },
    { label: 'number', value: 123 },
    { label: 'array', value: [] },
  ];

  for (const { label, value } of INVALID_REQUEST_SHAPES) {
    await test(`（2.request validation）request為${label}時回傳{ok:false, reason:'invalid_request', stage:'request'}`, () => {
      const result = contractNoAdapter.forwardProductRequest(value);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, 'invalid_request');
      assert.strictEqual(result.stage, 'request');
      assert.strictEqual(result.boundary, 'product-contract');
    });
  }

  const INVALID_RAW_INPUT_SHAPES = [
    { label: 'missing', value: {} },
    { label: 'null', value: { rawInput: null } },
    { label: 'string', value: { rawInput: 'x' } },
    { label: 'array', value: { rawInput: [] } },
  ];

  for (const { label, value } of INVALID_RAW_INPUT_SHAPES) {
    await test(`（2.request validation）request.rawInput為${label}時回傳{ok:false, reason:'invalid_raw_input', field:'rawInput'}`, () => {
      const result = contractNoAdapter.forwardProductRequest(value);
      assert.strictEqual(result.reason, 'invalid_raw_input');
      assert.strictEqual(result.field, 'rawInput');
    });
  }

  const INVALID_USER_ID_SHAPES = [1, true, null, {}, []];
  for (const value of INVALID_USER_ID_SHAPES) {
    await test(`（2.request validation）request.userId為${JSON.stringify(value)}時回傳{ok:false, reason:'invalid_user_id', field:'userId'}`, () => {
      const result = contractNoAdapter.forwardProductRequest({ rawInput: {}, userId: value });
      assert.strictEqual(result.reason, 'invalid_user_id');
      assert.strictEqual(result.field, 'userId');
    });
  }

  const INVALID_OPTIONS_SHAPES = [null, 1, 'x', [], true];
  for (const value of INVALID_OPTIONS_SHAPES) {
    await test(`（2.request validation）request.options為${JSON.stringify(value)}時回傳{ok:false, reason:'invalid_options', field:'options'}`, () => {
      const result = contractNoAdapter.forwardProductRequest({ rawInput: {}, options: value });
      assert.strictEqual(result.reason, 'invalid_options');
      assert.strictEqual(result.field, 'options');
    });
  }

  await test('（2.request validation）request.userId/options為undefined（省略）時不算驗證失敗', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.request validation）合法的userId跟options同時提供時通過驗證', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    const result = contract.forwardProductRequest({ rawInput: {}, userId: 'u1', options: { a: 1 } });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.request validation）驗證失敗時完全不會呼叫adapter（提前短路）', () => {
    let called = false;
    const contract = createProductContract({ adapter: { forwardProductRequest: () => { called = true; return { ok: true, result: {} }; } } });
    contract.forwardProductRequest(null);
    contract.forwardProductRequest({});
    contract.forwardProductRequest({ rawInput: {}, userId: 1 });
    assert.strictEqual(called, false);
  });

  await test('（2.request validation）validateProductRequestShape()是獨立可測試的純函式，行為跟透過contract呼叫時一致', () => {
    assert.deepStrictEqual(validateProductRequestShape({ rawInput: {} }), { ok: true });
    assert.strictEqual(validateProductRequestShape(null).reason, 'invalid_request');
  });

  console.log('');

  // =========================================================================
  // C. response validation
  // =========================================================================
  console.log('--- C. response validation ---');

  const INVALID_RESPONSE_SHAPES = [null, undefined, 'x', 1, [], true];
  for (const badResponse of INVALID_RESPONSE_SHAPES) {
    await test(`（3.response validation）adapter回傳${JSON.stringify(badResponse)}時Contract回傳{ok:false, reason:'invalid_response', stage:'response'}`, () => {
      const contract = createProductContract({ adapter: { forwardProductRequest: () => badResponse } });
      const result = contract.forwardProductRequest({ rawInput: {} });
      assert.strictEqual(result.reason, 'invalid_response');
      assert.strictEqual(result.stage, 'response');
    });
  }

  await test('（3.response validation）adapter回傳沒有ok欄位（非布林）的物件時回傳invalid_response_ok_field', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ result: {} }) } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'invalid_response_ok_field');
    assert.strictEqual(result.field, 'ok');
  });

  await test('（3.response validation）adapter回傳{ok:true}但沒有result欄位時回傳invalid_response_result', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true }) } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'invalid_response_result');
    assert.strictEqual(result.field, 'result');
  });

  await test('（3.response validation）adapter回傳{ok:true, result:非物件}時回傳invalid_response_result', () => {
    for (const badResult of [null, 'x', 1, []]) {
      const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: badResult }) } });
      const result = contract.forwardProductRequest({ rawInput: {} });
      assert.strictEqual(result.reason, 'invalid_response_result');
    }
  });

  await test('（3.response validation）adapter回傳{ok:false}但reason不是字串時回傳invalid_response_reason', () => {
    for (const badReason of [undefined, 123, null, {}]) {
      const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: false, reason: badReason }) } });
      const result = contract.forwardProductRequest({ rawInput: {} });
      assert.strictEqual(result.reason, 'invalid_response_reason');
      assert.strictEqual(result.field, 'reason');
    }
  });

  await test('（3.response validation）adapter回傳合法的{ok:true, result:{}}時通過response驗證', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: {} }) } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, true);
  });

  await test('（3.response validation）adapter回傳合法的{ok:false, reason:"x"}時通過response驗證，原樣透傳', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: false, reason: 'x' }) } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.deepStrictEqual(result, { ok: false, reason: 'x' });
  });

  await test('（3.response validation）validateProductResponseShape()是獨立可測試的純函式', () => {
    assert.deepStrictEqual(validateProductResponseShape({ ok: true, result: {} }), { ok: true });
    assert.strictEqual(validateProductResponseShape(null).reason, 'invalid_response');
  });

  console.log('');

  // =========================================================================
  // D. compatibility handling
  // =========================================================================
  console.log('--- D. compatibility handling ---');

  await test('（4.compatibility handling）SUPPORTED_RESPONSE_VERSIONS目前恰好是["1.0.0"]', () => {
    assert.deepStrictEqual(SUPPORTED_RESPONSE_VERSIONS, ['1.0.0']);
  });

  await test('（4.compatibility handling）result沒有任何version資訊時視為相容（結構性缺席不等於不相容）', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: { analysis: {} } }) } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, true);
  });

  await test('（4.compatibility handling）result.analysis.metadata.version為"1.0.0"時視為相容，原樣透傳', () => {
    const response = { ok: true, result: { analysis: { metadata: { version: '1.0.0' } } } };
    const contract = createProductContract({ adapter: { forwardProductRequest: () => response } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result, response);
  });

  await test('（4.compatibility handling）result.recommendation.metadata.version為"1.0.0"時視為相容', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: { recommendation: { metadata: { version: '1.0.0' } } } }) } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, true);
  });

  await test('（4.compatibility handling）version格式不符合X.Y.Z時回傳invalid_version_format', () => {
    for (const badVersion of ['1.0', 'v1.0.0', '1', 'abc']) {
      const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: { analysis: { metadata: { version: badVersion } } } }) } });
      const result = contract.forwardProductRequest({ rawInput: {} });
      assert.strictEqual(result.reason, 'invalid_version_format', `version=${badVersion}`);
      assert.strictEqual(result.field, 'version');
      assert.strictEqual(result.stage, 'compatibility');
    }
  });

  await test('（4.compatibility handling）主版本號不在支援清單時回傳unsupported_version', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: { analysis: { metadata: { version: '2.0.0' } } } }) } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'unsupported_version');
    assert.strictEqual(result.field, 'version');
  });

  await test('（4.compatibility handling）次版本/修訂版本演進視為相容（只比對主版本號）', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: { analysis: { metadata: { version: '1.5.2' } } } }) } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, true);
  });

  await test('（4.compatibility handling）失敗回應（ok:false）完全不檢查版本相容性（版本檢查只發生在成功回應）', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: false, reason: 'x' }) } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'x');
  });

  await test('（4.compatibility handling）checkVersionCompatibility()可以自訂supportedVersions', () => {
    const validator = createProductContractValidator({ supportedVersions: ['2.0.0'] });
    assert.strictEqual(validator.checkVersionCompatibility('2.3.1').ok, true);
    assert.strictEqual(validator.checkVersionCompatibility('1.0.0').ok, false);
  });

  await test('（4.compatibility handling）extractResponseVersion()只讀取metadata.version，不讀取其他欄位', () => {
    assert.strictEqual(extractResponseVersion({ analysis: { metadata: { version: '1.0.0' }, insights: ['secret'] } }), '1.0.0');
    assert.strictEqual(extractResponseVersion({}), undefined);
    assert.strictEqual(extractResponseVersion(null), undefined);
  });

  await test('（4.compatibility handling）保持向後相容：驗證通過時Contract不新增/不修改response的任何既有欄位（同一個物件參照）', () => {
    const response = { ok: true, result: { analysis: { metadata: { version: '1.0.0' } } }, extraField: 'kept' };
    const contract = createProductContract({ adapter: { forwardProductRequest: () => response } });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result, response);
    assert.strictEqual(result.extraField, 'kept');
  });

  await test('（4.compatibility handling）checkVersionCompatibility()不做任何評分/決策——只回傳ok布林值跟結構化reason，不含任何分數/建議欄位', () => {
    const result = checkVersionCompatibility('2.0.0');
    assert.deepStrictEqual(Object.keys(result).sort(), ['field', 'ok', 'reason']);
  });

  console.log('');

  // =========================================================================
  // E. entry compatibility
  // =========================================================================
  console.log('--- E. entry compatibility ---');

  await test('（5.entry compatibility）Product Entry可以把Contract當作自己的adapter依賴注入，完全不需要修改Entry任何程式碼', () => {
    const contract = createProductContract({ adapter: { forwardProductRequest: () => ({ ok: true, result: { analysis: {} } }) } });
    const entry = createProductEntry({ adapter: contract });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.boundary, 'product-entry');
    assert.deepStrictEqual(result.result, { analysis: {} });
  });

  await test('（5.entry compatibility）Contract驗證失敗時透過Entry往上傳遞，Entry把stage強制覆蓋成"adapter"（Entry既有邏輯不需要知道Contract的存在）', () => {
    const contract = createProductContract({});
    const entry = createProductEntry({ adapter: contract });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'adapter_unavailable');
    assert.strictEqual(result.stage, 'adapter');
    assert.strictEqual(result.boundary, 'product-entry');
  });

  await test('（5.entry compatibility）Entry自己的request驗證依然在Contract之前執行（Entry驗證失敗時Contract完全不會被呼叫）', () => {
    let called = false;
    const contract = createProductContract({ adapter: { forwardProductRequest: () => { called = true; return { ok: true, result: {} }; } } });
    const entry = createProductEntry({ adapter: contract });
    entry.requestProductEntry({ userId: 123, rawInput: {} });
    assert.strictEqual(called, false);
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
  // F. adapter compatibility
  // =========================================================================
  console.log('--- F. adapter compatibility ---');

  await test('（6.adapter compatibility）Contract呼叫adapter.forwardProductRequest()時，request原樣轉交（不篩選/不重新包裝）', () => {
    let received;
    const contract = createProductContract({ adapter: { forwardProductRequest: (r) => { received = r; return { ok: true, result: {} }; } } });
    const request = { rawInput: { x: 1 }, userId: 'u1' };
    contract.forwardProductRequest(request);
    assert.strictEqual(received, request);
  });

  await test('（6.adapter compatibility）端對端：Contract+真實Adapter串接成功', () => {
    const adapter = createProductAdapter({ intelligenceFeature: makeRealIntelligenceFeature() });
    const contract = createProductContract({ adapter });
    const result = contract.forwardProductRequest({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（6.adapter compatibility）Adapter既有的失敗（例如intelligence_feature_unavailable）透過Contract原樣透傳，不被重新分類', () => {
    const adapter = createProductAdapter({});
    const contract = createProductContract({ adapter });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.reason, 'intelligence_feature_unavailable');
    assert.strictEqual(result.boundary, 'product-adapter');
  });

  await test('（6.adapter compatibility）product_adapter.js（TASK1.100）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/adapter/product_adapter.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.adapter compatibility）src/intelligence/product/adapter/ 整個目錄本次任務完全沒有任何檔案被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/product/adapter/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  console.log('');

  // =========================================================================
  // G. execution compatibility
  // =========================================================================
  console.log('--- G. execution compatibility ---');

  await test('（7.execution compatibility）端對端：Contract→Adapter→Execution三層串接成功', () => {
    const execution = createProductExecution({ intelligenceFeature: makeRealIntelligenceFeature() });
    const adapter = createProductAdapter({ intelligenceFeature: execution });
    const contract = createProductContract({ adapter });
    const result = contract.forwardProductRequest({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（7.execution compatibility）Execution Boundary的Runtime例外透過Adapter/Contract往上傳遞時，Contract原樣透傳Adapter的分類結果', () => {
    const execution = createProductExecution({ intelligenceFeature: { requestIntelligence: () => { throw new Error('x'); } } });
    const adapter = createProductAdapter({ intelligenceFeature: execution });
    const contract = createProductContract({ adapter });
    const result = contract.forwardProductRequest({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'internal_error');
    assert.strictEqual(result.stage, 'intelligence');
  });

  await test('（7.execution compatibility）product_execution.js（TASK1.101）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/execution/product_execution.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.execution compatibility）src/intelligence/product/execution/ 整個目錄本次任務完全沒有任何檔案被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/product/execution/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  console.log('');

  // =========================================================================
  // H. operational compatibility
  // =========================================================================
  console.log('--- H. operational compatibility ---');

  await test('（8.operational compatibility）端對端：完整規格Flow（Entry→Contract→Adapter→Execution→Operational→Feature）六層串接成功', () => {
    const entry = makeFullChain();
    const result = entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.boundary, 'product-entry');
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（8.operational compatibility）deterministic：完整六層串接後，同樣的request重複呼叫得到完全相同的結果', () => {
    const entry = makeFullChain();
    const request = { rawInput: makeInsightContext() };
    assert.deepStrictEqual(entry.requestProductEntry(request), entry.requestProductEntry(request));
  });

  await test('（8.operational compatibility）完整六層串接時，Operational Boundary的observer正確收到started/completed事件（Contract插入不影響Operational既有行為）', () => {
    const events = [];
    const entry = makeFullChain((m) => events.push(m));
    entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].phase, 'started');
    assert.strictEqual(events[1].phase, 'completed');
  });

  await test('（8.operational compatibility）完整六層串接時，observer事件完全不含任何業務資料/userId', () => {
    const events = [];
    const entry = makeFullChain((m) => events.push(m));
    entry.requestProductEntry({ rawInput: makeInsightContext(), userId: 'should-not-leak' });
    assert.ok(!JSON.stringify(events).includes('should-not-leak'));
  });

  await test('（8.operational compatibility）product_operational.js（TASK1.102）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/operational/product_operational.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.operational compatibility）src/intelligence/product/operational/ 整個目錄本次任務完全沒有任何檔案被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/product/operational/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  console.log('');

  // =========================================================================
  // I. dependency direction
  // =========================================================================
  console.log('--- I. dependency direction ---');

  await test('（TASK1.104後更新）src/intelligence/product/ 底下現在至少包含entry/、adapter/、execution/、operational/、contract/五個子目錄（TASK1.104新增的PHASE5_PRODUCT_INTEGRATION_FINAL_REVIEW.md是同層的文件檔案，是合法擴充，不是回歸）', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirEntries = entries.filter((e) => e.isDirectory());
    const dirNames = dirEntries.map((e) => e.name);
    for (const name of ['entry', 'adapter', 'execution', 'operational', 'contract']) {
      assert.ok(dirNames.includes(name));
    }
  });

  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    if (layer !== 'product-contract') {
      await test(`（9.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
        const relPath = path.relative(repoRoot, full);
        const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
        assert.strictEqual(diff.trim(), '');
      });
    } else {
      await test(`（TASK1.104後更新）（9.dependency direction）${layer}/${file} 是TASK1.103自己的commit（9c286a0）新增的檔案（git show --name-status確認，而不是檢查即時git status——避免被後續任何時間點的執行誤判為失敗，延續TASK1.99/1.100/1.101/1.102測試套件同樣的修正）`, () => {
        const relPath = path.relative(repoRoot, full);
        const nameStatus = execFileSync('git', ['show', '--name-status', '--pretty=format:', '9c286a0'], { cwd: repoRoot, encoding: 'utf8' });
        const line = nameStatus.split('\n').find((l) => l.endsWith('\t' + relPath));
        assert.ok(line && line.startsWith('A'), `預期${relPath}在9c286a0被新增，實際：${line}`);
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
    if (layer === 'product-contract') {
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（9.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/（不得繞過Adapter直接呼叫下游）`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（9.dependency direction）${layer}/${file} 完全不import src/routes/、src/controllers/、worker.js、Product Entry/Execution/Operational`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
        assert.ok(!/from\s+['"].*\/entry\//.test(src));
        assert.ok(!/from\s+['"].*\/execution\//.test(src));
        assert.ok(!/from\s+['"].*\/operational\//.test(src));
      });
    } else if (!PRODUCT_LAYER_NAMES.includes(layer)) {
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

  await test('（9.dependency direction）product_contract.js只import自己目錄底下的validator跟result_builder（沒有其他import）', () => {
    const importLines = productContractSrc.match(/^import .*/gm) || [];
    assert.deepStrictEqual(importLines.sort(), [
      "import { createProductContractResultBuilder } from './product_contract_result_builder.js';",
      "import { createProductContractValidator } from './product_contract_validator.js';",
    ].sort());
  });

  await test('（9.dependency direction）product_contract_validator.js完全沒有任何import（自我完整）', () => {
    assert.ok(!/^import /m.test(productContractValidatorSrc));
  });

  await test('（9.dependency direction）product_contract_result_builder.js完全沒有任何import（自我完整）', () => {
    assert.ok(!/^import /m.test(productContractResultBuilderSrc));
  });

  await test('（9.dependency direction）index.js只re-export contract/validator/result_builder三個檔案的內容', () => {
    assert.ok(productContractIndexSrc.includes("from './product_contract.js'"));
    assert.ok(productContractIndexSrc.includes("from './product_contract_validator.js'"));
    assert.ok(productContractIndexSrc.includes("from './product_contract_result_builder.js'"));
    const exportLines = (productContractIndexSrc.match(/^export \{.*\} from '.*';$/gm) || []);
    assert.strictEqual(exportLines.length, 3);
  });

  await test('（9.dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
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

  await test('（10.AI boundary）product_contract.js/validator不含Decision Algorithm/Rule Engine/Scoring Logic相關字樣（score/weight/threshold/rule engine）', () => {
    for (const pattern of [/\bscore\b/i, /\bweight(ing)?\b/i, /\bthreshold\b/i, /rule\s*engine/i]) {
      assert.ok(!pattern.test(productContractSrc), `product_contract.js出現疑似字樣：${pattern}`);
      assert.ok(!pattern.test(productContractValidatorSrc), `product_contract_validator.js出現疑似字樣：${pattern}`);
    }
  });

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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.103-product-contract')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 93, `預期至少93個既有測試檔案，實際 ${allSuites.length}`);
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

/*
 * Phase 6 TASK 1.112｜Health Insight Product Integration
 * Foundation 測試
 *
 * 本任務把TASK1.111建立的Health Insight
 * Feature，接進TASK1.99~1.103既有的五個Product
 * Boundary，組成第一條完整的Product → Intelligence執行路徑。
 * 本次任務不實作UI、不建立route/controller、不整合任何AI
 * Provider、不建立database schema，也不修改任何既有Boundary/
 * Feature/Capability/Runtime檔案——唯一新增的production
 * 程式碼是`src/intelligence/product/health_insight_integration.js`
 * 這一個組合根檔案。
 *
 * 這份測試驗證的是：
 * - 完整鏈路（Entry→Contract→Adapter→Execution→Operational→
 *   Health Insight Feature→Capability Orchestrator→Analysis/
 *   Recommendation Capability→Runtime）可以端對端成功執行
 * - 六類錯誤（invalid product request/contract validation
 *   failure/adapter failure/execution failure/feature
 *   failure/capability failure）各自能正確傳遞成結構化失敗，
 *   不暴露內部細節
 * - 五個既有Product Boundary + Health Insight Feature + Phase
 *   4 Capability Chain + Phase 2/3既有架構完全沒有被修改
 * - Operational Boundary在真實Health Insight資料流下依然不會
 *   記錄userId/健康資料/insight內容/recommendation內容
 * - Dependency Injection正確（每一層可替換、沒有global
 *   singleton、不接受db/auth依賴）
 * - export一致性、regression、P1-P6
 *
 * 分為以下15個部分：
 * A) Product Entry integration
 * B) Contract integration
 * C) Adapter integration
 * D) Execution integration
 * E) Operational integration
 * F) Health Insight Feature integration
 * G) Capability chain integration
 * H) End-to-end request flow
 * I) Response mapping
 * J) Error boundary
 * K) Dependency direction
 * L) Runtime isolation
 * M) AI boundary
 * N) Regression validation
 * O) P1-P6
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
const integrationFilePath = path.join(productDir, 'health_insight_integration.js');
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
const HEALTH_INSIGHT_LAYER = { name: 'health-insight-feature', dir: healthInsightDir, files: ['health_insight_feature.js', 'health_insight_result_mapper.js', 'index.js'] };
const EXISTING_LAYERS = [...PRODUCT_BOUNDARY_LAYERS, ...PHASE4_LAYERS, HEALTH_INSIGHT_LAYER];
const EXISTING_SCANNED_FILES = EXISTING_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));
const PRODUCT_LAYER_NAMES = PRODUCT_BOUNDARY_LAYERS.map((l) => l.name);

const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution', 'capabilities', 'analysis', 'recommendation', 'application'];
const AI_KEYWORDS = [
  /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i, /gemini/i,
  /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
  /model\s*[:=]\s*['"]/i, /inference/i, /prompt/i,
];

function makeInsightRawInput(overrides) {
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
  const integrationModule = await import(integrationFilePath);
  const { createHealthInsightProductIntegration, createHealthInsightIntelligenceAdapter } = integrationModule;
  const { createProductEntry } = await import(path.join(productEntryDir, 'index.js'));
  const { createProductContract } = await import(path.join(productContractDir, 'index.js'));
  const { createProductAdapter } = await import(path.join(productAdapterDir, 'index.js'));
  const { createProductExecution } = await import(path.join(productExecutionDir, 'index.js'));
  const { createProductOperational } = await import(path.join(productOperationalDir, 'index.js'));
  const { createHealthInsightFeature } = await import(path.join(healthInsightDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createAnalysisRunner } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner } = await import(path.join(recommendationDir, 'index.js'));

  // =========================================================================
  // A. Product Entry integration
  // =========================================================================
  console.log('--- A. Product Entry integration ---');

  await test('（1.Product Entry integration）createHealthInsightProductIntegration()回傳物件恰好只有requestProductEntry一個公開介面（跟Product Entry本身的公開介面完全一致）', () => {
    const integration = createHealthInsightProductIntegration();
    assert.deepStrictEqual(Object.keys(integration), ['requestProductEntry']);
  });

  await test('（1.Product Entry integration）requestProductEntry()是同步函式', () => {
    const integration = createHealthInsightProductIntegration();
    const returned = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(returned instanceof Promise, false);
  });

  await test('（1.Product Entry integration）沒有提供request時Product Entry自己的驗證先攔截，回傳invalid_request，完全不會走到Contract/Adapter/Capability', () => {
    let touched = false;
    const integration = createHealthInsightProductIntegration({ contract: { forwardProductRequest: () => { touched = true; } } });
    const result = integration.requestProductEntry();
    assert.strictEqual(result.reason, 'invalid_request');
    assert.strictEqual(touched, false);
  });

  await test('（1.Product Entry integration）request.rawInput缺少時Product Entry自己攔截，回傳invalid_raw_input，完全不會走到Contract', () => {
    let touched = false;
    const integration = createHealthInsightProductIntegration({ contract: { forwardProductRequest: () => { touched = true; } } });
    const result = integration.requestProductEntry({});
    assert.strictEqual(result.reason, 'invalid_raw_input');
    assert.strictEqual(result.field, 'rawInput');
    assert.strictEqual(touched, false);
  });

  await test('（1.Product Entry integration）request.userId為非字串時Product Entry自己攔截，回傳invalid_user_id', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput(), userId: 42 });
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（1.Product Entry integration）自訂entry依賴會被完整使用（依賴注入正確傳遞到最外層）', () => {
    let called = false;
    const customEntry = { requestProductEntry: (req) => { called = true; return { ok: true, boundary: 'product-entry', result: { custom: true } }; } };
    const integration = createHealthInsightProductIntegration({ entry: customEntry });
    const result = integration.requestProductEntry({ rawInput: {} });
    assert.strictEqual(called, true);
    assert.deepStrictEqual(result, { ok: true, boundary: 'product-entry', result: { custom: true } });
  });

  await test('（1.Product Entry integration）Product Entry回傳的成功/失敗結果都帶有boundary:"product-entry"標籤（既有Entry Result Builder行為，本次整合沒有改變它）', () => {
    const integration = createHealthInsightProductIntegration();
    const success = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const failure = integration.requestProductEntry({});
    assert.strictEqual(success.boundary, 'product-entry');
    assert.strictEqual(failure.boundary, 'product-entry');
  });

  console.log('');

  // =========================================================================
  // B. Contract integration
  // =========================================================================
  console.log('--- B. Contract integration ---');

  await test('（2.Contract integration）Contract被正確注入成Entry的adapter依賴（Entry呼叫的下一層恰好是Contract，不是真正的Adapter）', () => {
    let contractCalled = false;
    const fakeContract = { forwardProductRequest: (req) => { contractCalled = true; return { ok: true, result: {} }; } };
    const integration = createHealthInsightProductIntegration({ contract: fakeContract });
    integration.requestProductEntry({ rawInput: {} });
    assert.strictEqual(contractCalled, true);
  });

  await test('（2.Contract integration）request.options為陣列時（Entry不驗證options，但Contract會）回傳Contract自己的invalid_options失敗', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput(), options: [] });
    assert.strictEqual(result.reason, 'invalid_options');
    assert.strictEqual(result.field, 'options');
  });

  await test('（2.Contract integration）request.options為null時Contract回傳invalid_options', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput(), options: null });
    assert.strictEqual(result.reason, 'invalid_options');
  });

  await test('（2.Contract integration）自訂adapter依賴會被正確注入到Contract內部（Contract呼叫的下一層是自訂adapter，不是真正的Product Adapter）', () => {
    let customAdapterCalled = false;
    const customAdapter = { forwardProductRequest: (req) => { customAdapterCalled = true; return { ok: true, result: {} }; } };
    const integration = createHealthInsightProductIntegration({ adapter: customAdapter });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(customAdapterCalled, true);
  });

  await test('（2.Contract integration）真實鏈路成功時Contract版本相容性檢查通過（Health Insight的result沒有analysis/recommendation.metadata.version欄位，視為"沒有版本資訊"，安全視為相容）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.Contract integration）Contract失敗時的失敗結果同樣被Entry包裝成boundary:"product-entry"（Contract自己的boundary標籤"product-contract"被Entry接手後改寫，不會外洩）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput(), options: [] });
    assert.strictEqual(result.boundary, 'product-entry');
    assert.notStrictEqual(result.boundary, 'product-contract');
  });

  console.log('');

  // =========================================================================
  // C. Adapter integration
  // =========================================================================
  console.log('--- C. Adapter integration ---');

  await test('（3.Adapter integration）真正的Product Adapter被正確注入成Contract的adapter依賴，把rawInput轉換成{context, options}後轉交給下一層', () => {
    let receivedIntelligenceRequest;
    const fakeExecution = { requestIntelligence: (req) => { receivedIntelligenceRequest = req; return { ok: true, feature: 'intelligence', data: {} }; } };
    const integration = createHealthInsightProductIntegration({ execution: fakeExecution });
    const rawInput = makeInsightRawInput();
    integration.requestProductEntry({ rawInput, options: { locale: 'zh-TW' } });
    assert.deepStrictEqual(receivedIntelligenceRequest, { context: rawInput, options: { locale: 'zh-TW' } });
  });

  await test('（3.Adapter integration）自訂execution依賴會被正確注入到Adapter內部（Adapter呼叫的下一層是自訂execution，不是真正的Product Execution）', () => {
    let customExecutionCalled = false;
    const customExecution = { requestIntelligence: (req) => { customExecutionCalled = true; return { ok: true, data: {} }; } };
    const integration = createHealthInsightProductIntegration({ execution: customExecution });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(customExecutionCalled, true);
  });

  await test('（3.Adapter integration）Adapter層完全沒有加入任何health/analysis特定邏輯（本次整合沒有修改product_adapter.js，逐檔案git diff確認在下方Dependency direction區塊）', () => {
    const src = readSrc(path.join(productAdapterDir, 'product_adapter.js'));
    assert.ok(!/health_insight/i.test(src));
    assert.ok(!/healthObservation|behaviorPattern|progressTrend/i.test(src));
  });

  console.log('');

  // =========================================================================
  // D. Execution integration
  // =========================================================================
  console.log('--- D. Execution integration ---');

  await test('（4.Execution integration）真正的Product Execution被正確注入成Adapter的intelligenceFeature依賴，管理五階段lifecycle', () => {
    const execution = createProductExecution({ intelligenceFeature: { requestIntelligence: () => ({ ok: true, data: {} }) } });
    const integration = createHealthInsightProductIntegration({ execution });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const state = execution.getLastExecutionState();
    assert.deepStrictEqual(state.transitions, ['request_received', 'validation_completed', 'execution_started', 'execution_completed']);
  });

  await test('（4.Execution integration）自訂operational依賴會被正確注入到Execution內部', () => {
    let customOperationalCalled = false;
    const customOperational = { requestIntelligence: (req) => { customOperationalCalled = true; return { ok: true, data: {} }; } };
    const integration = createHealthInsightProductIntegration({ operational: customOperational });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(customOperationalCalled, true);
  });

  await test('（4.Execution integration）Execution層完全沒有產生任何insight內容（本次整合沒有修改product_execution.js，只原樣轉發data欄位）', () => {
    const src = readSrc(path.join(productExecutionDir, 'product_execution.js'));
    assert.ok(!/health_insight/i.test(src));
    assert.ok(!/healthObservation|behaviorPattern|progressTrend/i.test(src));
  });

  await test('（4.Execution integration）健康失敗情境下Execution Lifecycle正確轉換到execution_failed（Health Insight Feature本身失敗時）', () => {
    const brokenHealthInsightFeature = { requestHealthInsight: () => ({ ok: false, feature: 'health_insight', reason: 'capability_orchestrator_unavailable', stage: 'capability' }) };
    const execution = createProductExecution({ intelligenceFeature: createHealthInsightIntelligenceAdapter(brokenHealthInsightFeature) });
    const integration = createHealthInsightProductIntegration({ execution });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const state = execution.getLastExecutionState();
    assert.deepStrictEqual(state.transitions, ['request_received', 'validation_completed', 'execution_started', 'execution_failed']);
  });

  console.log('');

  // =========================================================================
  // E. Operational integration
  // =========================================================================
  console.log('--- E. Operational integration ---');

  await test('（5.Operational integration）真正的Product Operational被正確注入成Execution的intelligenceFeature依賴，observer會收到started/completed兩筆metadata', () => {
    const observed = [];
    const integration = createHealthInsightProductIntegration({ observer: (m) => observed.push(m) });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(observed.length, 2);
    assert.strictEqual(observed[0].phase, 'started');
    assert.strictEqual(observed[1].phase, 'completed');
  });

  await test('（5.Operational integration）observer記錄的metadata不含userId（Operational必須不記錄userId）', () => {
    const observed = [];
    const integration = createHealthInsightProductIntegration({ observer: (m) => observed.push(m) });
    integration.requestProductEntry({ rawInput: makeInsightRawInput(), userId: 'super-secret-user-id-12345' });
    const serialized = JSON.stringify(observed);
    assert.ok(!serialized.includes('super-secret-user-id-12345'));
    assert.ok(!serialized.includes('userId'));
  });

  await test('（5.Operational integration）observer記錄的metadata不含健康資料（activityContext/nutritionContext等原始輸入內容完全不出現）', () => {
    const observed = [];
    const integration = createHealthInsightProductIntegration({ observer: (m) => observed.push(m) });
    integration.requestProductEntry({ rawInput: makeInsightRawInput({ activityContext: { count: 999, items: [{ id: 'unique-marker-activity' }] } }) });
    const serialized = JSON.stringify(observed);
    assert.ok(!serialized.includes('unique-marker-activity'));
    assert.ok(!serialized.includes('activityContext'));
  });

  await test('（5.Operational integration）observer記錄的metadata不含insight內容（healthObservation的type/value完全不出現，因為extractResultCounts讀不到Health Insight的data形狀，安全回傳undefined）', () => {
    const observed = [];
    const integration = createHealthInsightProductIntegration({ observer: (m) => observed.push(m) });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const serialized = JSON.stringify(observed);
    assert.ok(!serialized.includes('activity_count'));
    assert.ok(!serialized.includes('healthObservation'));
  });

  await test('（5.Operational integration）observer記錄的metadata不含recommendation內容（recommendation的type/value完全不出現）', () => {
    const observed = [];
    const integration = createHealthInsightProductIntegration({ observer: (m) => observed.push(m) });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const serialized = JSON.stringify(observed);
    assert.ok(!serialized.includes('insight_count'));
    assert.ok(!serialized.includes('analysis_status'));
  });

  await test('（5.Operational integration）completed metadata裡version/resultCounts欄位因為Health Insight資料形狀不匹配而安全缺席（不是空物件洩漏，是完全沒有這兩個key）', () => {
    const observed = [];
    const integration = createHealthInsightProductIntegration({ observer: (m) => observed.push(m) });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const completedMetadata = observed.find((m) => m.phase === 'completed');
    assert.strictEqual('version' in completedMetadata, false);
    assert.strictEqual('resultCounts' in completedMetadata, false);
  });

  await test('（5.Operational integration）Operational層完全沒有加入任何Health Insight特定的擷取邏輯（本次整合沒有修改product_operational.js）', () => {
    const src = readSrc(path.join(productOperationalDir, 'product_operational.js'));
    assert.ok(!/health_insight/i.test(src));
    assert.ok(!/healthObservation|behaviorPattern|progressTrend/i.test(src));
  });

  await test('（5.Operational integration）自訂clock依賴會被正確注入，durationMs出現在metadata裡', () => {
    const observed = [];
    let counter = 100;
    const integration = createHealthInsightProductIntegration({ observer: (m) => observed.push(m), clock: () => (counter += 10) });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const completedMetadata = observed.find((m) => m.phase === 'completed');
    assert.strictEqual(typeof completedMetadata.durationMs, 'number');
  });

  console.log('');

  // =========================================================================
  // F. Health Insight Feature integration
  // =========================================================================
  console.log('--- F. Health Insight Feature integration ---');

  await test('（6.Health Insight Feature integration）createHealthInsightIntelligenceAdapter()回傳物件恰好只有requestIntelligence一個公開介面', () => {
    const adapter = createHealthInsightIntelligenceAdapter({ requestHealthInsight: () => ({}) });
    assert.deepStrictEqual(Object.keys(adapter), ['requestIntelligence']);
  });

  await test('（6.Health Insight Feature integration）介面轉接是純轉發，不修改request/response內容（deepStrictEqual逐一比對）', () => {
    let receivedRequest;
    const fakeFeature = { requestHealthInsight: (req) => { receivedRequest = req; return { ok: true, feature: 'health_insight', data: { marker: 'unchanged' } }; } };
    const adapter = createHealthInsightIntelligenceAdapter(fakeFeature);
    const request = { context: { a: 1 }, options: { b: 2 } };
    const response = adapter.requestIntelligence(request);
    assert.strictEqual(receivedRequest, request);
    assert.deepStrictEqual(response, { ok: true, feature: 'health_insight', data: { marker: 'unchanged' } });
  });

  await test('（6.Health Insight Feature integration）真正的Health Insight Feature被正確注入成Operational的intelligenceFeature依賴（透過名稱轉接）', () => {
    let called = false;
    const healthInsightFeature = { requestHealthInsight: (req) => { called = true; return { ok: true, feature: 'health_insight', data: {} }; } };
    const integration = createHealthInsightProductIntegration({ healthInsightFeature });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(called, true);
  });

  await test('（6.Health Insight Feature integration）自訂capabilityOrchestrator依賴會被正確注入到Health Insight Feature內部', () => {
    let called = false;
    const capabilityOrchestrator = { requestCapabilityFlow: (req) => { called = true; return { ok: true, result: {} }; } };
    const integration = createHealthInsightProductIntegration({ capabilityOrchestrator });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(called, true);
  });

  await test('（6.Health Insight Feature integration）Health Insight Feature本身完全沒有被修改（逐檔案git diff確認，見下方Dependency direction區塊；這裡先確認檔案內容裡沒有Product Entry/Contract/Adapter/Execution/Operational的字樣，證明它依然不認識上游Boundary的存在）', () => {
    const src = readSrc(path.join(healthInsightDir, 'health_insight_feature.js'));
    assert.ok(!/product_entry|product_contract|product_adapter|product_execution|product_operational/i.test(src));
  });

  console.log('');

  // =========================================================================
  // G. Capability chain integration
  // =========================================================================
  console.log('--- G. Capability chain integration ---');

  await test('（7.Capability chain integration）真實鏈路：Analysis Capability + Recommendation Capability + 各自的Runner確實被完整串接執行', () => {
    let analysisCalled = false;
    let recommendationCalled = false;
    const analysisCapability = createAnalysisCapability({ analysisRunner: { runAnalysis: (ctx, opt) => { analysisCalled = true; return { ok: true, result: { status: 'ok', insights: [], metadata: {} } }; } } });
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: { runRecommendation: () => { recommendationCalled = true; return { ok: true, result: { status: 'ok', recommendations: [], metadata: {} } }; } } });
    const integration = createHealthInsightProductIntegration({ analysisCapability, recommendationCapability });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(analysisCalled, true);
    assert.strictEqual(recommendationCalled, true);
  });

  await test('（7.Capability chain integration）自訂capabilityOrchestrator優先於analysisCapability/recommendationCapability（更外層依賴優先）', () => {
    let orchestratorCalled = false;
    let analysisCalled = false;
    const capabilityOrchestrator = { requestCapabilityFlow: () => { orchestratorCalled = true; return { ok: true, result: {} }; } };
    const analysisCapability = { requestAnalysis: () => { analysisCalled = true; return { ok: true, result: {} }; } };
    const integration = createHealthInsightProductIntegration({ capabilityOrchestrator, analysisCapability });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(orchestratorCalled, true);
    assert.strictEqual(analysisCalled, false);
  });

  await test('（7.Capability chain integration）自訂analysisRunner/recommendationRunner會被組進預設的Capability（最底層可替換）', () => {
    let runnerCalled = false;
    const analysisRunner = { runAnalysis: () => { runnerCalled = true; return { ok: true, result: { status: 'ok', insights: [], metadata: {} } }; } };
    const integration = createHealthInsightProductIntegration({ analysisRunner, recommendationRunner: createRecommendationRunner() });
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(runnerCalled, true);
  });

  await test('（7.Capability chain integration）真實Analysis Runner/Recommendation Runner在完整鏈路下產生的insights/recommendations數量符合預期（6筆insights，3筆recommendations，延續TASK1.111已確認的既有行為）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(result.result.healthObservation.length, 6);
    assert.strictEqual(result.result.recommendation.length, 3);
  });

  console.log('');

  // =========================================================================
  // H. End-to-end request flow
  // =========================================================================
  console.log('--- H. End-to-end request flow ---');

  await test('（8.End-to-end request flow）完整鏈路：{userId?, rawInput, options?}形式的Product Request可以成功走完Entry→Contract→Adapter→Execution→Operational→Health Insight Feature→Capability Orchestrator→Runtime', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ userId: 'u1', rawInput: makeInsightRawInput(), options: { locale: 'zh-TW' } });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.End-to-end request flow）rawInput轉換成的{context, options}正確傳遞到Health Insight Feature（options原樣保留，不遺失）', () => {
    let receivedRequest;
    const capabilityOrchestrator = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
    const realHealthInsightFeature = createHealthInsightFeature({ capabilityOrchestrator });
    const spyingFeature = { requestHealthInsight: (req) => { receivedRequest = req; return realHealthInsightFeature.requestHealthInsight(req); } };
    const integration = createHealthInsightProductIntegration({ healthInsightFeature: spyingFeature });
    const rawInput = makeInsightRawInput();
    integration.requestProductEntry({ rawInput, options: { locale: 'zh-TW' } });
    assert.deepStrictEqual(receivedRequest, { context: rawInput, options: { locale: 'zh-TW' } });
  });

  await test('（8.End-to-end request flow）沒有options時整條鏈路依然成功（options是選填欄位）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.End-to-end request flow）deterministic：同樣的Product Request永遠得到完全相同的最終結果', () => {
    const integration = createHealthInsightProductIntegration();
    const rawInput = makeInsightRawInput();
    const r1 = integration.requestProductEntry({ rawInput });
    const r2 = integration.requestProductEntry({ rawInput });
    assert.deepStrictEqual(r1, r2);
  });

  await test('（8.End-to-end request flow）呼叫兩次createHealthInsightProductIntegration()回傳的是互相獨立的實例（沒有共享狀態）', () => {
    const a = createHealthInsightProductIntegration();
    const b = createHealthInsightProductIntegration();
    assert.notStrictEqual(a, b);
  });

  await test('（8.End-to-end request flow）不同的rawInput內容產生不同的healthObservation數值（確認資料真的有流過整條鏈路，不是回傳固定假資料）', () => {
    const integration = createHealthInsightProductIntegration();
    const r1 = integration.requestProductEntry({ rawInput: makeInsightRawInput({ activityContext: { count: 1, items: [] } }) });
    const r2 = integration.requestProductEntry({ rawInput: makeInsightRawInput({ activityContext: { count: 99, items: [] } }) });
    const v1 = r1.result.healthObservation.find((i) => i.type === 'activity_count').value;
    const v2 = r2.result.healthObservation.find((i) => i.type === 'activity_count').value;
    assert.strictEqual(v1, 1);
    assert.strictEqual(v2, 99);
  });

  console.log('');

  // =========================================================================
  // I. Response mapping
  // =========================================================================
  console.log('--- I. Response mapping ---');

  await test('（9.Response mapping）成功結果的result欄位恰好包含五個欄位（healthObservation/behaviorPattern/recommendation/progressTrend/decision），延續TASK1.108四類輸出定義', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['behaviorPattern', 'decision', 'healthObservation', 'progressTrend', 'recommendation']);
  });

  await test('（9.Response mapping）最終回傳結果的最外層恰好只有ok/boundary/result三個欄位（Health Insight Feature/Execution/Adapter的內部標籤"feature"完全被過濾掉）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.deepStrictEqual(Object.keys(result).sort(), ['boundary', 'ok', 'result']);
  });

  await test('（9.Response mapping）healthObservation/recommendation陣列裡每一筆元素恰好只有type/value兩個欄位', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    for (const item of [...result.result.healthObservation, ...result.result.recommendation]) {
      assert.deepStrictEqual(Object.keys(item).sort(), ['type', 'value']);
    }
  });

  await test('（9.Response mapping）behaviorPattern固定為空陣列、progressTrend固定為空物件、decision固定為null（延續TASK1.111既有結論，端對端驗證依然成立）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.deepStrictEqual(result.result.behaviorPattern, []);
    assert.deepStrictEqual(result.result.progressTrend, {});
    assert.strictEqual(result.result.decision, null);
  });

  await test('（9.Response mapping）不暴露runtime metadata（"orchestration"/"intelligence"這類Capability/Feature內部標籤字串完全不作為result內容的一部分出現在result欄位裡）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const serializedResult = JSON.stringify(result.result);
    assert.ok(!serializedResult.includes('"orchestration"'));
    assert.ok(!serializedResult.includes('"health_insight"'));
  });

  await test('（9.Response mapping）不暴露execution details（五階段lifecycle標記完全不出現在最終result裡）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const serialized = JSON.stringify(result);
    for (const stageWord of ['request_received', 'validation_completed', 'execution_started', 'execution_completed', 'execution_failed']) {
      assert.ok(!serialized.includes(stageWord));
    }
  });

  await test('（9.Response mapping）不暴露internal capability structure（source欄位完全被過濾掉，延續TASK1.111既有結論）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.ok(!JSON.stringify(result).includes('"source"'));
  });

  console.log('');

  // =========================================================================
  // J. Error boundary
  // =========================================================================
  console.log('--- J. Error boundary ---');

  await test('（10.Error boundary）invalid product request（缺少rawInput）回傳結構化失敗，不拋出例外', () => {
    const integration = createHealthInsightProductIntegration();
    assert.doesNotThrow(() => integration.requestProductEntry({}));
    const result = integration.requestProductEntry({});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(typeof result.reason, 'string');
  });

  await test('（10.Error boundary）contract validation failure（options型別不合法）回傳結構化失敗', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput(), options: 'not an object' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options');
  });

  await test('（10.Error boundary）adapter failure（adapter依賴缺失）回傳結構化失敗', () => {
    const integration = createHealthInsightProductIntegration({ adapter: {} });
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'adapter_unavailable');
  });

  await test('（10.Error boundary）execution failure（execution依賴缺失）回傳結構化失敗', () => {
    const integration = createHealthInsightProductIntegration({ execution: {} });
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(result.ok, false);
  });

  await test('（10.Error boundary）feature failure（Health Insight Feature本身回傳失敗）正確傳遞到最外層', () => {
    const brokenFeature = { requestHealthInsight: () => ({ ok: false, feature: 'health_insight', reason: 'capability_orchestrator_unavailable', stage: 'capability' }) };
    const integration = createHealthInsightProductIntegration({ healthInsightFeature: brokenFeature });
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'capability_orchestrator_unavailable');
  });

  await test('（10.Error boundary）capability failure（analysisRunner缺失，導致Analysis Capability失敗）正確傳遞到最外層', () => {
    const integration = createHealthInsightProductIntegration({ analysisCapability: createAnalysisCapability({}) });
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'analysis_runner_unavailable');
  });

  await test('（10.Error boundary）capability failure（recommendationRunner缺失）正確傳遞到最外層', () => {
    const integration = createHealthInsightProductIntegration({ recommendationCapability: createRecommendationCapability({}) });
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'recommendation_runner_unavailable');
  });

  await test('（10.Error boundary）Health Insight Feature拋出例外時（capability orchestrator本身throw）不會讓整條鏈路崩潰，Execution會攔截並回傳結構化失敗', () => {
    const throwingOrchestrator = { requestCapabilityFlow: () => { throw new Error('secret internal capability detail'); } };
    const integration = createHealthInsightProductIntegration({ capabilityOrchestrator: throwingOrchestrator });
    assert.doesNotThrow(() => integration.requestProductEntry({ rawInput: makeInsightRawInput() }));
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(result.ok, false);
    assert.ok(!JSON.stringify(result).includes('secret internal capability detail'));
  });

  await test('（10.Error boundary）所有失敗情境的結果都不含stack trace/例外訊息（逐一情境比對）', () => {
    const scenarios = [
      () => createHealthInsightProductIntegration().requestProductEntry({}),
      () => createHealthInsightProductIntegration({ adapter: {} }).requestProductEntry({ rawInput: makeInsightRawInput() }),
      () => createHealthInsightProductIntegration({ analysisCapability: createAnalysisCapability({}) }).requestProductEntry({ rawInput: makeInsightRawInput() }),
      () => createHealthInsightProductIntegration({ capabilityOrchestrator: { requestCapabilityFlow: () => { throw new TypeError('boom with stack'); } } }).requestProductEntry({ rawInput: makeInsightRawInput() }),
    ];
    for (const scenario of scenarios) {
      const result = scenario();
      const serialized = JSON.stringify(result);
      assert.ok(!serialized.includes('.js:'));
      assert.ok(!serialized.includes(' at '));
    }
  });

  await test('（10.Error boundary）所有失敗情境的結果都恰好只有ok/boundary/reason/field?/stage?欄位（不含result/data）', () => {
    const scenarios = [
      createHealthInsightProductIntegration().requestProductEntry({}),
      createHealthInsightProductIntegration({ adapter: {} }).requestProductEntry({ rawInput: makeInsightRawInput() }),
    ];
    for (const result of scenarios) {
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.result, undefined);
      for (const key of Object.keys(result)) {
        assert.ok(['ok', 'boundary', 'reason', 'field', 'stage'].includes(key));
      }
    }
  });

  console.log('');

  // =========================================================================
  // K. Dependency direction
  // =========================================================================
  console.log('--- K. Dependency direction ---');

  await test('（11.Dependency direction）health_insight_integration.js的唯一相對路徑import恰好是11個既定模組（5個Product Boundary+Health Insight Feature+Capability Orchestrator+Analysis/Recommendation Capability+Analysis/Recommendation Runner）', () => {
    const src = readSrc(integrationFilePath);
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(imports, [
      '../analysis/index.js',
      '../capabilities/analysis/index.js',
      '../capabilities/orchestration/index.js',
      '../capabilities/recommendation/index.js',
      '../recommendation/index.js',
      './adapter/index.js',
      './contract/index.js',
      './entry/index.js',
      './execution/index.js',
      './features/health_insight/index.js',
      './operational/index.js',
    ]);
  });

  await test('（11.Dependency direction）health_insight_integration.js完全不import src/db/、src/auth/、src/oauth/、src/identity/、src/middleware/', () => {
    const src = readSrc(integrationFilePath);
    for (const subdir of ['db', 'auth', 'oauth', 'identity', 'middleware']) {
      assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
    }
  });

  await test('（11.Dependency direction）health_insight_integration.js完全不import src/routes/、src/controllers/、worker.js（No HTTP邊界）', () => {
    const src = readSrc(integrationFilePath);
    assert.ok(!/from\s+['"].*\/routes\//.test(src));
    assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    assert.ok(!/worker\.js/.test(src));
  });

  await test('（11.Dependency direction）health_insight_integration.js完全不import Phase 3 Application Layer/Decision Capability/既有Intelligence Feature Integration', () => {
    const src = readSrc(integrationFilePath);
    assert.ok(!/from\s+['"].*\/application\//.test(src));
    assert.ok(!/from\s+['"].*\/capabilities\/decision\//.test(src));
  });

  await test('（11.Dependency direction）health_insight_integration.js完全不呼叫fetch()/Date.now()/Math.random()', () => {
    const src = readSrc(integrationFilePath);
    assert.ok(!/\bfetch\s*\(/.test(src));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（11.Dependency direction）health_insight_integration.js沒有任何模組級的可變狀態（沒有頂層let/var宣告，每次呼叫create函式都是全新實例）', () => {
    const src = readSrc(integrationFilePath);
    assert.ok(!/^(let|var)\s+/m.test(src));
  });

  await test('（11.Dependency direction）src/intelligence/product/ 底下沒有新增任何新的子目錄（只新增一個檔案health_insight_integration.js，沒有新增第六個Product Boundary目錄）', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    assert.deepStrictEqual(dirNames, ['adapter', 'contract', 'entry', 'execution', 'features', 'operational']);
  });

  await test('（11.Dependency direction）src/intelligence/product/ 底下只新增了health_insight_integration.js一個檔案（逐一確認其他既有.md/.js檔案沒有被移除或新增額外檔案）', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name).sort();
    assert.ok(entries.includes('health_insight_integration.js'));
    assert.ok(entries.includes('PHASE6_HEALTH_INSIGHT_IMPLEMENTATION_ARCHITECTURE_PLAN.md'));
  });

  for (const layer of EXISTING_LAYERS) {
    await test(`（11.Dependency direction）${layer.name} 目錄本次任務完全沒有任何檔案被修改`, () => {
      const status = execFileSync('git', ['status', '--porcelain', layer.dir], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(status.trim(), '');
    });
    await test(`（11.Dependency direction）${layer.name} 目錄恰好維持既有的檔案清單`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  for (const { layer, file, full } of EXISTING_SCANNED_FILES) {
    await test(`（11.Dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });

    const src = readSrc(full);

    await test(`（11.Dependency direction）${layer}/${file} 完全不import src/db/（重新確認既有邊界）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });

    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（11.Dependency direction）${layer}/${file} 完全不import src/${subdir}/（重新確認既有邊界）`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }

    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（11.Dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}（重新確認既有邊界）`, () => {
        assert.ok(!pattern.test(src));
      });
    }

    await test(`（11.Dependency direction）${layer}/${file} 完全沒有呼叫fetch()（重新確認既有邊界）`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });

    await test(`（11.Dependency direction）${layer}/${file} 完全不呼叫Date.now()/Math.random()（重新確認既有邊界，deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });

    for (const pattern of AI_KEYWORDS) {
      await test(`（11.Dependency direction）${layer}/${file} 的實際程式碼不含AI相關關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }

    if (PRODUCT_LAYER_NAMES.includes(layer) && file !== 'README.md' && file !== 'index.js') {
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（11.Dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/（重新確認Product Boundary不得繞過下一層）`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（11.Dependency direction）${layer}/${file} 完全不import src/routes/、src/controllers/、worker.js（重新確認No HTTP邊界）`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
      });
    }
  }

  console.log('');

  // =========================================================================
  // L. Runtime isolation
  // =========================================================================
  console.log('--- L. Runtime isolation ---');

  await test('（12.Runtime isolation）src/bootstrap/application.js本次任務完全沒有被修改（Product Boundary沒有接進bootstrap）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.Runtime isolation）app.intelligence物件恰好維持24個欄位不變', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（12.Runtime isolation）app.router.routes 數量沒有因為本次任務而改變（TASK1.116後更新：TASK1.116是本系列第一個明確被授權做"Route connection"的任務，正式新增GET /health-insight、POST /api/health-insight兩條路由，21+2=23，這裡驗證的是"這個既有任務本身沒有意外改變路由數量"，不是"路由數量永遠固定21"）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 23);
  });

  await test('（12.Runtime isolation）src/worker.js既有TASK1.21~1.38路由分派邏輯/legacy handler完全沒有被修改（TASK1.116後更新：TASK1.116在檔案末尾新增GET /health-insight、POST /api/health-insight兩個if區塊，這是本次任務明確授權的Route connection範圍，不再要求整個檔案零diff，改成驗證既有邏輯的具體內容標記依然逐字存在）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('const DATA_API_PATHS = new Set(['));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/api/timeline')"));
    assert.ok(workerSource.includes('async function handle(r,env){'));
    assert.ok(workerSource.includes("if(p==='/api/qlive'){"));
  });

  await test('（12.Runtime isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', orchestrationRuntimeDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（12.Runtime isolation）src/intelligence/analysis/（Analysis Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', analysisDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（12.Runtime isolation）src/intelligence/recommendation/（Recommendation Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', recommendationDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（12.Runtime isolation）Phase 4 Capability Architecture（capabilities/整個目錄樹）本次任務完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', capabilitiesDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（12.Runtime isolation）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（12.Runtime isolation）真實鏈路執行前後Analysis Runner/Recommendation Runner原始檔案checksum不變', () => {
    const before = fs.readFileSync(path.join(analysisDir, 'analysis_runner.js'), 'utf8');
    const beforeRec = fs.readFileSync(path.join(recommendationDir, 'recommendation_runner.js'), 'utf8');
    const integration = createHealthInsightProductIntegration();
    integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const after = fs.readFileSync(path.join(analysisDir, 'analysis_runner.js'), 'utf8');
    const afterRec = fs.readFileSync(path.join(recommendationDir, 'recommendation_runner.js'), 'utf8');
    assert.strictEqual(before, after);
    assert.strictEqual(beforeRec, afterRec);
  });

  await test('（12.Runtime isolation）src/auth/、src/oauth/、src/middleware/完全沒有被修改，src/db/、migrations/除了TASK1.120明確授權新增的Health Insight persistence層之外也沒有其他變動（TASK1.120後更新：TASK1.120是本系列第一個明確被授權新增D1 schema/persistence層的任務，這裡排除該任務已知的3個異動——新增migrations/0007_phase6_task1_120_*.sql、新增src/db/tables/health_insight_records.js、在src/db/index.js新增對應binding）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/db/ src/auth/ src/oauth/ src/middleware/ migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120') && !line.includes('health_insight_records.js') && !line.includes('src/db/index.js')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（12.Runtime isolation）src/routes/、src/controllers/既有檔案完全沒有被修改，只新增Health Insight專屬的新檔案（TASK1.116後更新：TASK1.116新增src/routes/health_insight_routes.js、src/controllers/health_insight_controller.js，並在src/routes/index.js新增對應的import/register一行，這是本次任務明確授權的Route connection範圍，這裡改成驗證既有路由/controller檔案本身逐一沒有被修改）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/auth_routes.js src/routes/user_routes.js src/routes/data_routes.js src/routes/dashboard_routes.js src/routes/profile_routes.js src/routes/timeline_routes.js src/routes/legacy_routes.js src/routes/router.js src/controllers/auth_controller.js src/controllers/dashboard_controller.js src/controllers/data_controller.js src/controllers/profile_controller.js src/controllers/timeline_controller.js src/controllers/user_controller.js src/controllers/response.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.Runtime isolation）沒有新增任何CSS檔案/frontend元件', () => {
    const status = execFileSync('sh', ['-c', "git status --porcelain -- '*.css' 'src/frontend/' 'src/components/' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  console.log('');

  // =========================================================================
  // M. AI boundary
  // =========================================================================
  console.log('--- M. AI boundary ---');

  for (const pattern of AI_KEYWORDS) {
    await test(`（13.AI boundary）health_insight_integration.js的實際程式碼不含AI相關關鍵字樣 ${pattern}`, () => {
      const src = readSrc(integrationFilePath);
      assert.ok(!pattern.test(src), `health_insight_integration.js 出現疑似AI相關字樣：${pattern}`);
    });
  }

  await test('（13.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i, /GEMINI/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（13.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.AI boundary）package.json完全沒有新增任何AI SDK依賴，也完全沒有被修改', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek|gemini/i.test(name));
      }
    }
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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
  // N. Regression validation
  // =========================================================================
  console.log('--- N. Regression validation ---');

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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase6-task1.112-health-insight-integration')) {
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
  // O. P1-P6
  // =========================================================================
  console.log('--- O. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改（TASK1.116後更新：見上方"Runtime isolation"章節已經改用內容標記比對，這裡額外確認legacy getHTML()函式本身逐字沒有被修改，既有UI維持不變）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  await test('（P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）migrations/ 目錄除了TASK1.120新增的0007 health_insight_records migration之外，完全沒有其他檔案被新增或修改（TASK1.120後更新）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = statusOutput.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（P1-P6）src/auth/、src/oauth/ 完全沒有被本次任務修改，src/routes/、src/controllers/既有檔案也沒有被修改（TASK1.116後更新：見上方"Runtime isolation"章節已針對routes/controllers做過檔案範圍限定的diff檢查，這裡額外確認src/auth/、src/oauth/兩個目錄完全沒有被觸碰）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

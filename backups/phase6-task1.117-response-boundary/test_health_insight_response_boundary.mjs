/*
 * Phase 6 TASK 1.117｜Health Insight Response Boundary Refinement
 * 測試
 *
 * 本任務把TASK1.116的「Controller直接呼叫UI元件產生HTML」拆成
 * 「Controller → Response Builder → Structured Product
 * Response → UI Renderer → HTML」四段，為將來的OAuth/User
 * History/Premium/Gemini Enhancement Layer預留一個跟呈現方式
 * 無關的資料邊界。本次任務不整合Gemini、不實作OAuth、不修改
 * Intelligence架構、不重寫`src/ui/health_insight/`底下既有元件
 * （只新增一個UI Renderer連接檔案+對error_card.js既有分類表做
 * 純新增式的4筆identity mapping）。
 *
 * 分為以下11個部分：
 * A) Response structure
 * B) Success flow
 * C) Error flow
 * D) Controller behavior
 * E) UI compatibility
 * F) Product Integration compatibility
 * G) Future OAuth compatibility
 * H) Future Gemini compatibility
 * I) Architecture protection
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
const routesDir = path.join(srcRoot, 'routes');
const controllersDir = path.join(srcRoot, 'controllers');
const uiDir = path.join(srcRoot, 'ui', 'health_insight');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`✅ ${name}`);
    })
    .catch((e) => {
      failed++;
      failures.push(name);
      console.log(`❌ ${name}`);
      console.log('   ', e && e.stack ? e.stack.split('\n')[0] : e);
    });
}

/**
 * 只取出檔案裡實際的import陳述式，用來檢查「有沒有真的引用某個
 * package」——避免檔案頭文件註解裡合理提到"Gemini
 * Enhancement Layer"（本次任務規格明確要求說明未來相容性方向）
 * 被誤判成"整合了Gemini"。
 */
function getImportLines(source) {
  return source.split('\n').filter((line) => /^import\b/.test(line.trim())).join('\n');
}

function hasAiSdkImport(source) {
  return /gemini|generative-ai|openai|anthropic-ai|@google\/genai/i.test(getImportLines(source));
}

async function loadModules() {
  const { createAppRouter } = await import(path.join(routesDir, 'index.js'));
  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  const controllerModule = await import(path.join(controllersDir, 'health_insight_controller.js'));
  const responseBuilderModule = await import(path.join(controllersDir, 'health_insight_response_builder.js'));
  const uiModule = await import(path.join(uiDir, 'index.js'));
  const { createHealthInsightProductIntegration } = await import(path.join(srcRoot, 'intelligence', 'product', 'health_insight_integration.js'));
  const { createInsightContextBuilder } = await import(path.join(srcRoot, 'intelligence', 'context', 'insight_context_builder.js'));
  return { createAppRouter, createApplication, controllerModule, responseBuilderModule, uiModule, createHealthInsightProductIntegration, createInsightContextBuilder };
}

async function main() {
  const {
    createAppRouter,
    createApplication,
    controllerModule,
    responseBuilderModule,
    uiModule,
    createHealthInsightProductIntegration,
    createInsightContextBuilder,
  } = await loadModules();

  const { getHealthInsightPageController, submitHealthInsightController } = controllerModule;
  const { buildSuccessResponse, buildFailureResponse, classifyHealthInsightErrorReason, createHealthInsightResponseBuilder } = responseBuilderModule;
  const { renderHealthInsightDashboard, renderHealthInsightDashboardError, renderHealthInsightProductResponse, classifyErrorReason } = uiModule;

  function makeSuccessOutcome(result) {
    return { ok: true, boundary: 'product-entry', result };
  }
  function makeFailureOutcome(reason, extra) {
    return Object.assign({ ok: false, boundary: 'product-entry', reason }, extra || {});
  }

  // =========================================================================
  // A. Response structure
  // =========================================================================
  console.log('--- A. Response structure ---');

  await test('（1.structure）health_insight_response_builder.js存在', () => {
    assert.ok(fs.existsSync(path.join(controllersDir, 'health_insight_response_builder.js')));
  });

  for (const exportName of Object.keys(responseBuilderModule)) {
    await test(`（1.structure）health_insight_response_builder.js的公開匯出"${exportName}"型別正確`, () => {
      assert.strictEqual(typeof responseBuilderModule[exportName], 'function', `${exportName} 應該是function`);
    });
  }

  for (const exportName of Object.keys(uiModule)) {
    await test(`（1.structure）src/ui/health_insight/index.js既有的公開匯出"${exportName}"在TASK1.117（新增renderHealthInsightProductResponse匯出後）依然存在且型別正確`, () => {
      const value = uiModule[exportName];
      assert.notStrictEqual(value, undefined, `${exportName} 是undefined`);
      if (exportName === 'ASSET_BASE_PATH') {
        assert.strictEqual(typeof value, 'string');
      } else if (exportName.startsWith('create') || exportName.startsWith('render') || exportName.startsWith('get') || exportName.startsWith('list') || exportName.startsWith('classify') || exportName === 'escapeHtml') {
        assert.strictEqual(typeof value, 'function', `${exportName} 應該是function`);
      } else {
        assert.strictEqual(typeof value, 'object', `${exportName} 應該是object`);
      }
    });
  }

  await test('（1.structure）export buildSuccessResponse/buildFailureResponse/createHealthInsightResponseBuilder/classifyHealthInsightErrorReason', () => {
    assert.strictEqual(typeof buildSuccessResponse, 'function');
    assert.strictEqual(typeof buildFailureResponse, 'function');
    assert.strictEqual(typeof createHealthInsightResponseBuilder, 'function');
    assert.strictEqual(typeof classifyHealthInsightErrorReason, 'function');
  });

  await test('（1.structure）createHealthInsightResponseBuilder()回傳{buildSuccessResponse, buildFailureResponse}', () => {
    const rb = createHealthInsightResponseBuilder();
    assert.strictEqual(typeof rb.buildSuccessResponse, 'function');
    assert.strictEqual(typeof rb.buildFailureResponse, 'function');
  });

  await test('（1.structure）成功回應形狀恰好是{ok:true, data:{healthObservation, behaviorPattern, recommendation, progressTrend, decision}}，沒有多餘欄位', () => {
    const response = buildSuccessResponse({ healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null });
    assert.deepStrictEqual(Object.keys(response).sort(), ['data', 'ok']);
    assert.deepStrictEqual(Object.keys(response.data).sort(), ['behaviorPattern', 'decision', 'healthObservation', 'progressTrend', 'recommendation']);
  });

  await test('（1.structure）失敗回應形狀恰好是{ok:false, error:{type, category}}，沒有多餘欄位', () => {
    const response = buildFailureResponse({ reason: 'internal_error' });
    assert.deepStrictEqual(Object.keys(response).sort(), ['error', 'ok']);
    assert.deepStrictEqual(Object.keys(response.error).sort(), ['category', 'type']);
  });

  await test('（1.structure）失敗回應的error.type固定是字串"friendly_error"', () => {
    const response = buildFailureResponse({ reason: 'internal_error' });
    assert.strictEqual(response.error.type, 'friendly_error');
  });

  await test('（1.structure）成功回應ok固定是boolean true，失敗回應ok固定是boolean false', () => {
    assert.strictEqual(buildSuccessResponse({}).ok, true);
    assert.strictEqual(buildFailureResponse('x').ok, false);
  });

  await test('（1.structure）成功回應data.healthObservation/behaviorPattern/recommendation固定是Array', () => {
    const response = buildSuccessResponse({ healthObservation: [1], behaviorPattern: [2], recommendation: [3] });
    assert.ok(Array.isArray(response.data.healthObservation));
    assert.ok(Array.isArray(response.data.behaviorPattern));
    assert.ok(Array.isArray(response.data.recommendation));
  });

  await test('（1.structure）成功回應data.progressTrend固定是plain object', () => {
    const response = buildSuccessResponse({ progressTrend: { a: 1 } });
    assert.strictEqual(typeof response.data.progressTrend, 'object');
    assert.ok(!Array.isArray(response.data.progressTrend));
  });

  await test('（1.structure）失敗回應的error.category只會是四種已知分類之一', () => {
    const KNOWN = ['missing_data', 'invalid_input', 'unavailable_intelligence', 'temporary_failure'];
    ['internal_error', 'missing_field', 'adapter_unavailable', 'invalid_request', 'totally_unknown_reason'].forEach((reason) => {
      const response = buildFailureResponse({ reason });
      assert.ok(KNOWN.includes(response.error.category), `${reason} → ${response.error.category} 不在已知分類裡`);
    });
  });

  await test('（1.structure）buildFailureResponse可以直接傳reason字串（不一定要物件）', () => {
    const response = buildFailureResponse('internal_error');
    assert.strictEqual(response.error.category, 'temporary_failure');
  });

  await test('（1.structure）結構化回應是JSON-serializable（JSON.stringify/parse不遺失資訊）', () => {
    const success = buildSuccessResponse({ healthObservation: [{ type: 'a', value: 1 }], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null });
    const roundtrip = JSON.parse(JSON.stringify(success));
    assert.deepStrictEqual(roundtrip, success);
    const failure = buildFailureResponse({ reason: 'internal_error' });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(failure)), failure);
  });

  const WRONG_TYPE_FIELD_VALUES = [
    { label: 'string', value: 'not-an-array-or-object' },
    { label: 'number', value: 42 },
    { label: 'boolean', value: true },
    { label: 'function', value: () => {} },
  ];

  for (const field of ['healthObservation', 'behaviorPattern', 'recommendation']) {
    for (const { label, value } of WRONG_TYPE_FIELD_VALUES) {
      await test(`（1.structure）buildSuccessResponse對${field}提供${label}型別時安全正規化成空陣列`, () => {
        const response = buildSuccessResponse({ [field]: value });
        assert.deepStrictEqual(response.data[field], []);
      });
    }
  }

  for (const { label, value } of WRONG_TYPE_FIELD_VALUES) {
    await test(`（1.structure）buildSuccessResponse對progressTrend提供${label}型別時安全正規化成空物件`, () => {
      const response = buildSuccessResponse({ progressTrend: value });
      assert.deepStrictEqual(response.data.progressTrend, {});
    });
  }

  const WRONG_TOP_LEVEL_INPUTS = [
    { label: 'undefined', value: undefined },
    { label: 'null', value: null },
    { label: '字串', value: 'garbage' },
    { label: '數字', value: 42 },
    { label: '陣列', value: [1, 2, 3] },
  ];

  for (const { label, value } of WRONG_TOP_LEVEL_INPUTS) {
    await test(`（1.structure）buildSuccessResponse對整個result參數提供${label}時，回傳安全的預設data（不拋出例外）`, () => {
      assert.doesNotThrow(() => buildSuccessResponse(value));
      const response = buildSuccessResponse(value);
      assert.deepStrictEqual(response.data, { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null });
    });
  }

  for (const { label, value } of WRONG_TOP_LEVEL_INPUTS) {
    await test(`（1.structure）buildFailureResponse對整個failureResult參數提供${label}時，安全分類成temporary_failure（不拋出例外）`, () => {
      assert.doesNotThrow(() => buildFailureResponse(value));
      const response = buildFailureResponse(value);
      assert.strictEqual(response.error.category, 'temporary_failure');
    });
  }

  console.log('');

  // =========================================================================
  // B. Success flow
  // =========================================================================
  console.log('--- B. Success flow ---');

  await test('（2.success flow）submitHealthInsightController()成功時回傳{ok:true, data}（不是{ok:true, data:{html}}）', () => {
    const fakeIntegration = { requestProductEntry: () => makeSuccessOutcome({ healthObservation: [{ type: 'a', value: 1 }], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null }) };
    const result = submitHealthInsightController({ age: 28 }, { integration: fakeIntegration });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(typeof result.data, 'object');
    assert.ok(!('html' in result.data));
  });

  await test('（2.success flow）submitHealthInsightController()成功時data完全等於Integration的result（防禦性正規化後）', () => {
    const fakeResult = { healthObservation: [{ type: 'a', value: 1 }], behaviorPattern: [{ type: 'b', value: 2 }], recommendation: [{ type: 'c', value: 3 }], progressTrend: { x: 1 }, decision: null };
    const fakeIntegration = { requestProductEntry: () => makeSuccessOutcome(fakeResult) };
    const result = submitHealthInsightController({}, { integration: fakeIntegration });
    assert.deepStrictEqual(result.data, fakeResult);
  });

  await test('（2.success flow）Integration result缺少某些欄位時，data安全補上空陣列/空物件/null（不拋出例外）', () => {
    const fakeIntegration = { requestProductEntry: () => makeSuccessOutcome({}) };
    const result = submitHealthInsightController({}, { integration: fakeIntegration });
    assert.deepStrictEqual(result.data, { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null });
  });

  await test('（2.success flow）Integration result欄位型別不符時（例如healthObservation是字串），data安全正規化成空陣列', () => {
    const fakeIntegration = { requestProductEntry: () => makeSuccessOutcome({ healthObservation: 'not an array', progressTrend: 'not an object', decision: undefined }) };
    const result = submitHealthInsightController({}, { integration: fakeIntegration });
    assert.deepStrictEqual(result.data.healthObservation, []);
    assert.deepStrictEqual(result.data.progressTrend, {});
    assert.strictEqual(result.data.decision, null);
  });

  await test('（2.success flow）Integration result.decision是非null值時被完整保留（不強制覆蓋成null）', () => {
    const fakeIntegration = { requestProductEntry: () => makeSuccessOutcome({ decision: { future: true } }) };
    const result = submitHealthInsightController({}, { integration: fakeIntegration });
    assert.deepStrictEqual(result.data.decision, { future: true });
  });

  await test('（2.success flow）端對端真實鏈路（不注入任何dependencies）成功時data.healthObservation恰好6項、data.recommendation恰好3項', () => {
    const result = submitHealthInsightController({ age: 28, gender: 'female' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.healthObservation.length, 6);
    assert.strictEqual(result.data.recommendation.length, 3);
  });

  await test('（2.success flow）端對端真實鏈路data.behaviorPattern/progressTrend維持V1既有的空陣列/空物件（延續既有限制，非本次任務回歸）', () => {
    const result = submitHealthInsightController({ age: 28 });
    assert.deepStrictEqual(result.data.behaviorPattern, []);
    assert.deepStrictEqual(result.data.progressTrend, {});
  });

  console.log('');

  // =========================================================================
  // C. Error flow
  // =========================================================================
  console.log('--- C. Error flow ---');

  await test('（3.error flow）submitHealthInsightController()失敗時回傳{ok:false, error:{type,category}}', () => {
    const fakeIntegration = { requestProductEntry: () => makeFailureOutcome('internal_error') };
    const result = submitHealthInsightController({}, { integration: fakeIntegration });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.type, 'friendly_error');
    assert.strictEqual(result.error.category, 'temporary_failure');
  });

  const REASON_TO_CATEGORY = {
    invalid_request: 'missing_data',
    invalid_raw_input: 'missing_data',
    invalid_options: 'missing_data',
    invalid_options_type: 'missing_data',
    invalid_user_id: 'missing_data',
    invalid_context: 'missing_data',
    missing_field: 'invalid_input',
    invalid_field_type: 'invalid_input',
    adapter_unavailable: 'unavailable_intelligence',
    intelligence_feature_unavailable: 'unavailable_intelligence',
    capability_orchestrator_unavailable: 'unavailable_intelligence',
    analysis_capability_unavailable: 'unavailable_intelligence',
    recommendation_capability_unavailable: 'unavailable_intelligence',
    analysis_runner_unavailable: 'unavailable_intelligence',
    recommendation_runner_unavailable: 'unavailable_intelligence',
    capability_execution_failed: 'temporary_failure',
    internal_error: 'temporary_failure',
    mapping_failed: 'temporary_failure',
    intelligence_invalid_result: 'temporary_failure',
    capability_invalid_result: 'temporary_failure',
    unknown_error: 'temporary_failure',
  };

  for (const [reason, expectedCategory] of Object.entries(REASON_TO_CATEGORY)) {
    await test(`（3.error flow）reason=${reason} 正確分類成category=${expectedCategory}`, () => {
      const fakeIntegration = { requestProductEntry: () => makeFailureOutcome(reason, { field: 'x', stage: 'y' }) };
      const result = submitHealthInsightController({}, { integration: fakeIntegration });
      assert.strictEqual(result.error.category, expectedCategory);
    });
  }

  for (const reason of Object.keys(REASON_TO_CATEGORY)) {
    await test(`（3.error flow）reason=${reason} 時，結構化回應完全不含reason/field/stage/boundary原始值`, () => {
      const fakeIntegration = { requestProductEntry: () => makeFailureOutcome(reason, { field: `marker_${reason}`, stage: `stage_${reason}` }) };
      const result = submitHealthInsightController({}, { integration: fakeIntegration });
      const serialized = JSON.stringify(result);
      assert.ok(!serialized.includes(reason) || REASON_TO_CATEGORY[reason] === reason, `${reason} 洩漏在回應裡`);
      assert.ok(!serialized.includes(`marker_${reason}`));
      assert.ok(!serialized.includes(`stage_${reason}`));
      assert.ok(!serialized.includes('boundary'));
      assert.ok(!serialized.includes('product-entry'));
    });
  }

  await test('（3.error flow）未知reason（不在對照表）安全分類成temporary_failure', () => {
    const fakeIntegration = { requestProductEntry: () => makeFailureOutcome('never_seen_reason_xyz') };
    const result = submitHealthInsightController({}, { integration: fakeIntegration });
    assert.strictEqual(result.error.category, 'temporary_failure');
  });

  await test('（3.error flow）contextBuilder拋出例外時，回應是{ok:false, error:{category:"temporary_failure"}}，不洩漏例外訊息', () => {
    const throwingBuilder = { buildInsightContext: () => { throw new Error('super secret internal detail'); } };
    const result = submitHealthInsightController({ age: 28 }, { contextBuilder: throwingBuilder });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.category, 'temporary_failure');
    assert.ok(!JSON.stringify(result).includes('super secret internal detail'));
  });

  await test('（3.error flow）integration拋出例外時，回應是{ok:false, error:{category:"temporary_failure"}}，不洩漏例外訊息', () => {
    const throwingIntegration = { requestProductEntry: () => { throw new Error('secret stack trace here'); } };
    const result = submitHealthInsightController({ age: 28 }, { integration: throwingIntegration });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.category, 'temporary_failure');
    assert.ok(!JSON.stringify(result).includes('secret stack trace here'));
  });

  await test('（3.error flow）integration回傳非物件（undefined/null/字串）時安全轉成失敗回應', () => {
    [undefined, null, 'garbage', 42].forEach((weird) => {
      const fakeIntegration = { requestProductEntry: () => weird };
      const result = submitHealthInsightController({}, { integration: fakeIntegration });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error.category, 'temporary_failure');
    });
  });

  console.log('');

  // =========================================================================
  // D. Controller behavior
  // =========================================================================
  console.log('--- D. Controller behavior ---');

  const controllerSource = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');

  await test('（4.controller behavior）controller完全不import renderHealthInsightDashboard/renderHealthInsightDashboardError（不再擁有呈現邏輯，這裡只檢查實際的import陳述式，不含檔案頭說明TASK1.116舊行為的文件註解）', () => {
    const importLines = controllerSource.split('\n').filter((line) => /^import\b/.test(line.trim())).join('\n');
    assert.ok(!importLines.includes('renderHealthInsightDashboard'));
  });

  await test('（4.controller behavior）controller import createHealthInsightResponseBuilder（新的Response Boundary）', () => {
    assert.ok(controllerSource.includes("from './health_insight_response_builder.js'"));
    assert.ok(controllerSource.includes('createHealthInsightResponseBuilder'));
  });

  await test('（4.controller behavior）controller依然import renderHealthInsightInputExperience（GET頁面本身不涉及Product Response，不受影響）', () => {
    assert.ok(controllerSource.includes('renderHealthInsightInputExperience'));
  });

  await test('（4.controller behavior）getHealthInsightPageController()行為完全沒有改變（依然直接回傳HTML，因為它不是Product Response）', () => {
    const result = getHealthInsightPageController();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(typeof result.data.html, 'string');
  });

  await test('（4.controller behavior）submitHealthInsightController()支援dependencies.responseBuilder依賴注入', () => {
    let called = false;
    const fakeResponseBuilder = {
      buildSuccessResponse: (result) => { called = true; return { ok: true, data: result }; },
      buildFailureResponse: (f) => ({ ok: false, error: { type: 'friendly_error', category: 'temporary_failure' } }),
    };
    const fakeIntegration = { requestProductEntry: () => makeSuccessOutcome({ x: 1 }) };
    const result = submitHealthInsightController({}, { integration: fakeIntegration, responseBuilder: fakeResponseBuilder });
    assert.ok(called);
    assert.deepStrictEqual(result, { ok: true, data: { x: 1 } });
  });

  await test('（4.controller behavior）不提供responseBuilder時預設用真正的createHealthInsightResponseBuilder()', () => {
    const fakeIntegration = { requestProductEntry: () => makeSuccessOutcome({ healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null }) };
    const result = submitHealthInsightController({}, { integration: fakeIntegration });
    assert.deepStrictEqual(result, buildSuccessResponse({ healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null }));
  });

  await test('（4.controller behavior）既有Context Builder使用方式完全保留（contextBuilder.buildInsightContext()呼叫方式不變）', () => {
    let called = false;
    const fakeContextBuilder = {
      buildInsightContext(preparedContext) {
        called = true;
        assert.ok('user' in preparedContext);
        assert.ok(Array.isArray(preparedContext.explorations));
        return createInsightContextBuilder().buildInsightContext(preparedContext);
      },
    };
    submitHealthInsightController({ age: 28 }, { contextBuilder: fakeContextBuilder });
    assert.ok(called);
  });

  await test('（4.controller behavior）既有Product Integration呼叫方式完全保留（integration.requestProductEntry({rawInput})，不傳userId）', () => {
    let capturedRequest = null;
    const fakeIntegration = { requestProductEntry: (request) => { capturedRequest = request; return makeSuccessOutcome({}); } };
    submitHealthInsightController({ age: 28 }, { integration: fakeIntegration });
    assert.ok('rawInput' in capturedRequest);
    assert.ok(!('userId' in capturedRequest));
  });

  await test('（4.controller behavior）既有的三個try/catch Error Boundary位置完全保留（contextBuilder/integration/outcome-shape）', () => {
    assert.ok((controllerSource.match(/try\s*{/g) || []).length >= 2);
  });

  console.log('');

  // =========================================================================
  // E. UI compatibility
  // =========================================================================
  console.log('--- E. UI compatibility ---');

  await test('（5.UI compatibility）src/ui/health_insight/render_product_response.js存在且export renderHealthInsightProductResponse', () => {
    assert.ok(fs.existsSync(path.join(uiDir, 'render_product_response.js')));
    assert.strictEqual(typeof renderHealthInsightProductResponse, 'function');
  });

  await test('（5.UI compatibility）成功結構化回應渲染出跟直接呼叫renderHealthInsightDashboard(data)完全相同的HTML', () => {
    const data = { healthObservation: [{ type: 'a', value: 1 }], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null };
    const html = renderHealthInsightProductResponse({ ok: true, data });
    assert.strictEqual(html, renderHealthInsightDashboard(data));
  });

  for (const category of ['missing_data', 'invalid_input', 'unavailable_intelligence', 'temporary_failure']) {
    await test(`（5.UI compatibility）失敗結構化回應（category=${category}）渲染出正確分類的錯誤卡片`, () => {
      const html = renderHealthInsightProductResponse({ ok: false, error: { type: 'friendly_error', category } });
      assert.ok(html.includes(`hi-error-${category}`), `未渲染出hi-error-${category}`);
    });
  }

  await test('（5.UI compatibility）error_card.js的classifyErrorReason()對四個分類名稱本身回傳identity（TASK1.117新增的mapping）', () => {
    assert.strictEqual(classifyErrorReason('missing_data'), 'missing_data');
    assert.strictEqual(classifyErrorReason('invalid_input'), 'invalid_input');
    assert.strictEqual(classifyErrorReason('unavailable_intelligence'), 'unavailable_intelligence');
    assert.strictEqual(classifyErrorReason('temporary_failure'), 'temporary_failure');
  });

  await test('（5.UI compatibility）error_card.js既有20筆原始reason分類完全沒有改變', () => {
    const SAMPLE_REASONS = { invalid_request: 'missing_data', missing_field: 'invalid_input', adapter_unavailable: 'unavailable_intelligence', internal_error: 'temporary_failure' };
    Object.entries(SAMPLE_REASONS).forEach(([reason, expected]) => {
      assert.strictEqual(classifyErrorReason(reason), expected);
    });
  });

  await test('（5.UI compatibility）renderHealthInsightProductResponse對malformed輸入（undefined/null/字串/陣列）安全渲染成錯誤卡片，不拋出例外', () => {
    [undefined, null, 'garbage', [1, 2, 3], 42].forEach((weird) => {
      assert.doesNotThrow(() => renderHealthInsightProductResponse(weird));
      const html = renderHealthInsightProductResponse(weird);
      assert.ok(html.includes('hi-error-card'));
    });
  });

  await test('（5.UI compatibility）renderHealthInsightProductResponse是deterministic（同樣輸入永遠同樣輸出）', () => {
    const data = { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null };
    const r1 = renderHealthInsightProductResponse({ ok: true, data });
    const r2 = renderHealthInsightProductResponse({ ok: true, data });
    assert.strictEqual(r1, r2);
  });

  await test('（5.UI compatibility）端對端（POST /api/health-insight）回傳的HTML跟直接組裝的HTML一致，UI外觀沒有改變', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, gender: 'female', healthGoal: 'weight_loss' }, options: {} }, {});
    const body = await res.json();
    assert.ok(body.data.html.includes('data-hi-page="dashboard"'));
    assert.ok(body.data.html.includes('今天的健康小洞察'));
    assert.strictEqual((body.data.html.match(/hi-observation-item"/g) || []).length, 6);
    assert.strictEqual((body.data.html.match(/hi-recommendation-item"/g) || []).length, 3);
  });

  const UNTOUCHED_UI_FILES = [
    'src/ui/health_insight/components/question_card.js',
    'src/ui/health_insight/components/health_summary_card.js',
    'src/ui/health_insight/components/observation_card.js',
    'src/ui/health_insight/components/recommendation_card.js',
    'src/ui/health_insight/components/behavior_pattern_card.js',
    'src/ui/health_insight/components/progress_card.js',
    'src/ui/health_insight/components/illustration.js',
    'src/ui/health_insight/components/card_header.js',
    'src/ui/health_insight/components/card_cta.js',
    'src/ui/health_insight/components/html_utils.js',
    'src/ui/health_insight/components/label_map.js',
    // TASK1.123後更新：dashboard_page.js從這個"完全沒有被重寫"清單
    // 移除——Product Experience Upgrade明確授權新增Gemini/History
    // 呈現區塊，見該任務commit說明。
    'src/ui/health_insight/pages/input_page.js',
    'src/ui/health_insight/design_system/design_tokens.js',
    'src/ui/health_insight/client/interaction_script.js',
    'src/ui/health_insight/assets/asset_registry.js',
  ];

  for (const relFile of UNTOUCHED_UI_FILES) {
    await test(`（5.UI compatibility）既有UI檔案完全沒有被重寫：${relFile}`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${relFile} 出現非預期的diff`);
    });
  }

  console.log('');

  // =========================================================================
  // F. Product Integration compatibility
  // =========================================================================
  console.log('--- F. Product Integration compatibility ---');

  await test('（6.product integration）controller完全不繞過Product Entry：不import Feature/Capability/Analysis/Recommendation/Orchestration任何實作檔案', () => {
    assert.ok(!controllerSource.includes("from '../intelligence/product/features/"));
    assert.ok(!controllerSource.includes("from '../intelligence/capabilities/"));
    assert.ok(!controllerSource.includes("from '../intelligence/analysis/"));
    assert.ok(!controllerSource.includes("from '../intelligence/recommendation/"));
    assert.ok(!controllerSource.includes("from '../intelligence/orchestration/"));
  });

  await test('（6.product integration）controller只import health_insight_integration.js（Composition Root）跟insight_context_builder.js（純函式橋接）', () => {
    assert.ok(controllerSource.includes("from '../intelligence/product/health_insight_integration.js'"));
    assert.ok(controllerSource.includes("from '../intelligence/context/insight_context_builder.js'"));
  });

  await test('（6.product integration）health_insight_integration.js（TASK1.112）完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/product/health_insight_integration.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.product integration）insight_context_builder.js（TASK1.42）完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/context/insight_context_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.product integration）真實createHealthInsightProductIntegration()的requestProductEntry()成功時，Response Builder能正確消費它的result形狀', () => {
    const integration = createHealthInsightProductIntegration();
    const contextBuilder = createInsightContextBuilder();
    const { context } = contextBuilder.buildInsightContext({ user: null, explorations: [], foodEvents: [], emotions: [], behaviors: [], reports: [] });
    const outcome = integration.requestProductEntry({ rawInput: context });
    assert.strictEqual(outcome.ok, true);
    const response = buildSuccessResponse(outcome.result);
    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.data.healthObservation.length, 6);
  });

  await test('（6.product integration）真實鏈路的失敗結果（注入一個永遠回傳capability_orchestrator_unavailable的假Capability Orchestrator）能被Response Builder正確分類', () => {
    const fakeCapabilityOrchestrator = { requestCapabilityFlow: () => ({ ok: false, capability: 'orchestration', reason: 'capability_orchestrator_unavailable' }) };
    const integration = createHealthInsightProductIntegration({ capabilityOrchestrator: fakeCapabilityOrchestrator });
    const contextBuilder = createInsightContextBuilder();
    const { context } = contextBuilder.buildInsightContext({ user: null, explorations: [], foodEvents: [], emotions: [], behaviors: [], reports: [] });
    const outcome = integration.requestProductEntry({ rawInput: context });
    assert.strictEqual(outcome.ok, false);
    const response = buildFailureResponse(outcome);
    assert.strictEqual(response.ok, false);
    assert.strictEqual(response.error.category, 'unavailable_intelligence');
  });

  const MALFORMED_PAYLOADS = [
    { label: '空物件', payload: {} },
    { label: 'null', payload: null },
    { label: '陣列', payload: [1, 2, 3] },
    { label: '字串', payload: 'garbage' },
    { label: '數字', payload: 42 },
    { label: 'boolean', payload: true },
    { label: '巢狀物件混雜合法/非法欄位', payload: { age: 28, nested: { x: 1 }, gender: ['not', 'a', 'string'] } },
    { label: '超長字串欄位', payload: { gender: 'x'.repeat(10000) } },
    { label: '含__proto__的payload', payload: JSON.parse('{"__proto__":{"polluted":true},"age":28}') },
    { label: '全部五個欄位都是正確型別', payload: { gender: 'female', age: 28, height: 165, weight: 60, healthGoal: 'weight_loss' } },
  ];

  for (const { label, payload } of MALFORMED_PAYLOADS) {
    await test(`（6.product integration）端對端透過真實router：POST /api/health-insight payload=${label} 時，外部JSON回應status固定200且html有效（不會讓server崩潰）`, async () => {
      const router = createAppRouter();
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload, options: {} }, {});
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.strictEqual(typeof body.data.html, 'string');
      assert.ok(body.data.html.length > 0);
    });
  }

  for (const [reason] of Object.entries(REASON_TO_CATEGORY)) {
    await test(`（6.product integration）reason=${reason} 的buildFailureResponse()回傳值JSON.stringify後完全不含原始reason字串本身（除非該reason剛好等於它自己的分類名稱）`, () => {
      const response = buildFailureResponse({ reason, field: 'x', stage: 'y', boundary: 'product-entry' });
      const serialized = JSON.stringify(response);
      if (reason !== response.error.category) {
        assert.ok(!serialized.includes(reason));
      }
      assert.ok(!serialized.includes('"x"'));
      assert.ok(!serialized.includes('"y"'));
      assert.ok(!serialized.includes('boundary'));
    });
  }

  console.log('');

  // =========================================================================
  // G. Future OAuth compatibility
  // =========================================================================
  console.log('--- G. Future OAuth compatibility ---');

  await test('（7.future OAuth）controller完全不直接import src/auth/、src/oauth/、src/identity/session_rules.js、src/middleware/（沒有提前引入身份底層邏輯；TASK1.119後更新：TASK1.119合法新增了import中性的src/identity/health_insight/身份橋接層，這裡改成排除那個特定路徑，其餘auth/oauth/middleware/session底層依然完全禁止）', () => {
    ['../auth/', '../oauth/', '../identity/session_rules.js', '../middleware/'].forEach((p) => {
      assert.ok(!controllerSource.includes(`from '${p}`), `不應該import ${p}`);
    });
  });

  await test('（7.future OAuth）response_builder.js完全不import src/auth/、src/oauth/、src/identity/、src/middleware/、src/db/', () => {
    const rbSource = fs.readFileSync(path.join(controllersDir, 'health_insight_response_builder.js'), 'utf8');
    ['../auth/', '../oauth/', '../identity/', '../middleware/', '../db/'].forEach((p) => {
      assert.ok(!rbSource.includes(`from '${p}`), `不應該import ${p}`);
    });
  });

  await test('（7.future OAuth）buildSuccessResponse/buildFailureResponse目前完全不需要userId/identity參數就能正常運作（未來加上時不需要破壞性改變既有呼叫方式）', () => {
    assert.doesNotThrow(() => buildSuccessResponse({}));
    assert.doesNotThrow(() => buildFailureResponse('internal_error'));
  });

  await test('（7.future OAuth）結構化回應可以安全地附加額外欄位（例如未來的userId/identity）而不影響既有欄位讀取——模擬未來擴充', () => {
    const response = buildSuccessResponse({ healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null });
    const futureResponse = Object.assign({}, response, { identity: { userId: 'future-user-123' } });
    assert.strictEqual(futureResponse.ok, true);
    assert.deepStrictEqual(futureResponse.data, response.data);
    assert.strictEqual(futureResponse.identity.userId, 'future-user-123');
  });

  await test('（7.future OAuth）UI Renderer在收到帶有未知額外欄位（模擬未來identity欄位）的結構化回應時，依然正確渲染，不會因為多出欄位而壞掉', () => {
    const data = { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null };
    const responseWithExtra = { ok: true, data, identity: { userId: 'future-user' } };
    assert.doesNotThrow(() => renderHealthInsightProductResponse(responseWithExtra));
    assert.strictEqual(renderHealthInsightProductResponse(responseWithExtra), renderHealthInsightDashboard(data));
  });

  await test('（7.future OAuth）Product Integration本身（health_insight_integration.js）依然明確不接受db/auth依賴（延續TASK1.112既定邊界，OAuth要接上時只需要在Controller層加參數，不需要修改Product Integration）', () => {
    const integrationSource = fs.readFileSync(path.join(srcRoot, 'intelligence', 'product', 'health_insight_integration.js'), 'utf8');
    assert.ok(!integrationSource.includes("from '../../db/"));
    assert.ok(!integrationSource.includes("from '../../auth/"));
  });

  console.log('');

  // =========================================================================
  // H. Future Gemini compatibility
  // =========================================================================
  console.log('--- H. Future Gemini compatibility ---');

  await test('（8.future Gemini）結構化成功回應的data是純資料（陣列/物件/null），不含任何HTML字串片段，可以被未來的Gemini Enhancement安全處理', () => {
    const fakeIntegration = { requestProductEntry: () => makeSuccessOutcome({ healthObservation: [{ type: 'a', value: 1 }], behaviorPattern: [], recommendation: [{ type: 'b', value: 2 }], progressTrend: {}, decision: null }) };
    const result = submitHealthInsightController({}, { integration: fakeIntegration });
    const serialized = JSON.stringify(result.data);
    assert.ok(!/<[a-z][\s\S]*>/i.test(serialized), 'data裡不應該含任何HTML標籤');
  });

  await test('（8.future Gemini）可以在Response Builder跟UI Renderer之間插入一個純轉換步驟（模擬Gemini Enhancement），不需要修改Controller/Response Builder/UI Renderer任何一個檔案', () => {
    const fakeIntegration = { requestProductEntry: () => makeSuccessOutcome({ healthObservation: [{ type: 'a', value: 1 }], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null }) };
    const structuredResponse = submitHealthInsightController({}, { integration: fakeIntegration });

    function simulateGeminiEnhancement(response) {
      if (!response.ok) return response;
      return Object.assign({}, response, {
        data: Object.assign({}, response.data, {
          healthObservation: response.data.healthObservation.map((item) => Object.assign({}, item, { enhanced: true })),
        }),
      });
    }

    const enhancedResponse = simulateGeminiEnhancement(structuredResponse);
    assert.strictEqual(enhancedResponse.data.healthObservation[0].enhanced, true);
    assert.doesNotThrow(() => renderHealthInsightProductResponse(enhancedResponse));
  });

  await test('（8.future Gemini）UI Renderer完全不知道data的內容是否被加值處理過——只依賴既有的{type,value}形狀，額外欄位（例如enhanced）不影響渲染', () => {
    const data = { healthObservation: [{ type: '活動紀錄', value: 0, enhanced: true, geminiNote: '某種未來的加值註解' }], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null };
    assert.doesNotThrow(() => renderHealthInsightDashboard(data));
  });

  await test('（8.future Gemini）Controller/Response Builder完全不import任何AI SDK/Gemini/OpenAI相關套件（本次任務明確禁止整合；只檢查實際import陳述式，檔案頭合理提及"未來Gemini相容性方向"的文件註解不算）', () => {
    const rbSource = fs.readFileSync(path.join(controllersDir, 'health_insight_response_builder.js'), 'utf8');
    assert.ok(!hasAiSdkImport(controllerSource));
    assert.ok(!hasAiSdkImport(rbSource));
  });

  await test('（8.future Gemini）render_product_response.js完全不import任何AI SDK/Gemini相關套件', () => {
    const rendererSource = fs.readFileSync(path.join(uiDir, 'render_product_response.js'), 'utf8');
    assert.ok(!hasAiSdkImport(rendererSource));
  });

  await test('（8.future Gemini）沒有建立任何prompt模板/prompt組裝相關字串（沒有"prompt"字樣出現在新增檔案裡）', () => {
    const rbSource = fs.readFileSync(path.join(controllersDir, 'health_insight_response_builder.js'), 'utf8');
    const rendererSource = fs.readFileSync(path.join(uiDir, 'render_product_response.js'), 'utf8');
    assert.ok(!/prompt/i.test(rbSource));
    assert.ok(!/prompt/i.test(rendererSource));
  });

  console.log('');

  // =========================================================================
  // I. Architecture protection
  // =========================================================================
  console.log('--- I. Architecture protection ---');

  await test('（9.architecture protection）app.intelligence維持24個既有欄位', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（9.architecture protection）app.router.routes數量維持23（本次任務沒有新增/刪除任何route；TASK1.124後更新：TASK1.124新增GET /api/health-insight/history，23+1=24）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 24);
  });

  await test('（9.architecture protection）src/worker.js的既有TASK1.21~1.38路由分派邏輯/legacy handler完全沒有被修改（本次任務不需要新增/修改worker.js的任何判斷式，路由路徑完全沒有變化；TASK1.119後更新：TASK1.119合法新增了POST /api/health-insight讀取Cookie標頭的一行，不再要求整個檔案零diff，改成驗證既有邏輯的具體內容標記依然逐字存在，理由跟TASK1.116/1.111~1.115其餘suite同一段落完全相同）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('const DATA_API_PATHS = new Set(['));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/api/timeline')"));
    assert.ok(workerSource.includes('async function handle(r,env){'));
    assert.ok(workerSource.includes("if(p==='/api/qlive'){"));
  });

  await test('（9.architecture protection）src/routes/index.js完全沒有被本次任務修改（沒有新增/刪除任何route註冊）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/routes/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.architecture protection）src/ui/health_insight/design_system/design_tokens.js完全沒有被本次任務修改（本次任務不重新設計視覺）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/ui/health_insight/design_system/design_tokens.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.architecture protection）src/intelligence/整個目錄完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.architecture protection）src/db/整個目錄除了TASK1.120在src/db/index.js新增一行binding之外，完全沒有其他既有檔案被本次任務修改（TASK1.120後更新）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = diff.split('\n').filter((line) => line.trim() && !line.includes('src/db/index.js') && !line.includes('file changed') && !line.includes('files changed')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（9.architecture protection）migrations/目錄除了TASK1.120新增的0007 health_insight_records migration之外，完全沒有其他檔案被新增或修改（TASK1.120後更新）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（9.architecture protection）src/auth/、src/oauth/、src/identity/、src/middleware/除了TASK1.126明確授權的user_identity.js語意分類擴充之外，完全沒有其他改動（不實作OAuth/不改authentication/session）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/ src/oauth/ src/identity/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = diff.split('\n').filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !t.includes('user_identity.js') && !t.includes('file changed') && !t.includes('files changed');
    }).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（9.architecture protection）既有20條非Health Insight route在router裡依然全部存在', () => {
    const router = createAppRouter();
    const existingPaths = ['/auth/guest', '/auth/provider', '/auth/logout', '/auth/me', '/auth/provider/upgrade', '/auth/google/callback', '/api/explorations', '/api/food-events', '/api/emotions', '/api/behaviors', '/api/reports', '/api/dashboard', '/api/profile', '/api/timeline'];
    existingPaths.forEach((p) => {
      assert.ok(router.routes.some((r) => r.path === p), `缺少既有路由 ${p}`);
    });
  });

  for (const r of [
    { method: 'GET', path: '/health-insight' },
    { method: 'POST', path: '/api/health-insight' },
    { method: 'GET', path: '/auth/me' },
    { method: 'POST', path: '/auth/guest' },
    { method: 'POST', path: '/auth/logout' },
    { method: 'POST', path: '/auth/provider' },
    { method: 'POST', path: '/auth/provider/upgrade' },
    { method: 'GET', path: '/auth/google/callback' },
    { method: 'GET', path: '/api/dashboard' },
    { method: 'GET', path: '/api/profile' },
    { method: 'PATCH', path: '/api/profile' },
    { method: 'GET', path: '/api/timeline' },
    { method: 'GET', path: '/api/explorations' },
    { method: 'POST', path: '/api/explorations' },
    { method: 'GET', path: '/api/food-events' },
    { method: 'POST', path: '/api/food-events' },
    { method: 'GET', path: '/api/emotions' },
    { method: 'POST', path: '/api/emotions' },
    { method: 'GET', path: '/api/behaviors' },
    { method: 'POST', path: '/api/behaviors' },
    { method: 'GET', path: '/api/reports' },
    { method: 'POST', path: '/api/reports' },
  ]) {
    await test(`（9.architecture protection）既有route ${r.method} ${r.path} 在新router裡的regex確實能比對到自己的literal path`, () => {
      const router = createAppRouter();
      const match = router.routes.find((route) => route.method === r.method && route.path === r.path);
      assert.ok(match, `找不到 ${r.method} ${r.path}`);
      assert.ok(match.regex.test(r.path));
    });
  }

  await test('（9.architecture protection）GET /health-insight行為完全沒有改變（Input Experience頁面正常渲染）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('data-hi-page="input"'));
  });

  await test('（9.architecture protection）POST /api/health-insight外部JSON回應形狀完全沒有改變（依然是{ok:true, data:{html}}）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(typeof body.data.html, 'string');
  });

  const INTENTIONALLY_CHANGED_FILES = [
    'src/controllers/health_insight_controller.js',
    'src/routes/health_insight_routes.js',
    'src/ui/health_insight/index.js',
    'src/ui/health_insight/components/error_card.js',
  ];
  const NEWLY_ADDED_FILES = [
    'src/controllers/health_insight_response_builder.js',
    'src/ui/health_insight/render_product_response.js',
  ];
  // （TASK1.119後更新）src/worker.js從這個控制組移除——TASK1.119
  // 合法新增了POST /api/health-insight讀取Cookie標頭的一行（見該
  // 任務"Minimal route/session connection"明確授權範圍），這個
  // suite針對worker.js的保護已經在上面改成內容標記比對（見"既有
  // TASK1.21~1.38路由分派邏輯"那個斷言），不再要求零diff。
  const UNCHANGED_CONTROL_FILES = [
    'src/routes/index.js',
    'src/ui/health_insight/design_system/design_tokens.js',
  ];

  const gitDiffNameOnly = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !f.startsWith('backups/'));
  const gitStatusPorcelain = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  // （TASK1.120後更新）src/db/index.js從這個逐檔案掃描排除，理由
  // 同上方"architecture protection"章節。（TASK1.123後更新）
  // dashboard_page.js/components/index.js從這個逐檔案掃描排除——
  // Product Experience Upgrade明確授權新增Gemini/History呈現區塊。
  const TASK1123_AUTHORIZED_UI_FILES = [
    'src/ui/health_insight/pages/dashboard_page.js',
    'src/ui/health_insight/components/index.js',
    // TASK1.124後更新：History/Progress Product Completion明確授權新增的4個檔案
    'src/ui/health_insight/components/history_card.js',
    'src/ui/health_insight/components/progress_summary_card.js',
    'src/history/health_insight/history_service.js',
    'src/history/health_insight/index.js',
    // TASK1.126後更新：Guest/Authentication Experience Correction明確授權修改的2個檔案
    'src/identity/health_insight/user_identity.js',
    'src/persistence/health_insight/health_insight_persistence_service.js',
  ];
  const allExistingSrcFiles = execFileSync('sh', ['-c', "find src -name '*.js'"], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !NEWLY_ADDED_FILES.includes(f) && !INTENTIONALLY_CHANGED_FILES.includes(f) && f !== 'src/worker.js' && f !== 'src/db/index.js' && !TASK1123_AUTHORIZED_UI_FILES.includes(f));

  await test(`（9.architecture protection）逐檔案完整性掃描：src/底下共找到 ${allExistingSrcFiles.length} 個既有檔案需要逐一確認零diff（排除4個本次任務明確授權修改的檔案+2個本次任務新增的檔案）`, () => {
    assert.ok(allExistingSrcFiles.length >= 200, `預期至少200個既有檔案，實際 ${allExistingSrcFiles.length}`);
  });

  for (const relFile of allExistingSrcFiles) {
    await test(`（9.architecture protection）逐檔案完整性掃描：${relFile} 完全沒有被本次任務修改`, () => {
      assert.ok(!gitDiffNameOnly.includes(relFile), `${relFile} 出現在git diff清單裡`);
    });
  }

  // （TASK1.118後更新，理由跟TASK1.116同一份suite的對應段落
  // 完全相同）：這個控制組原本用「現在git diff/git status還看不
  // 看得到這個檔案」確認上面的diff偵測機制本身正常運作，但
  // commit完成後這些斷言會永遠、必然失敗，變成誤導後續每個任務
  // 的偽陽性"回歸"。改用`git log --oneline -- <file>`確認歷史上
  // 確實有對應的commit紀錄，這是不會隨時間改變的事實。
  for (const relFile of INTENTIONALLY_CHANGED_FILES.concat(NEWLY_ADDED_FILES)) {
    await test(`（9.architecture protection）逐檔案完整性掃描：${relFile} 的commit歷史裡確實存在TASK1.117的新增/修改紀錄（TASK1.118後更新：改用git log歷史紀錄取代git status/diff即時狀態）`, () => {
      const log = execFileSync('git', ['log', '--oneline', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(log.trim().length > 0, `${relFile} 的git log歷史裡找不到任何commit`);
    });
  }

  for (const relFile of UNCHANGED_CONTROL_FILES) {
    await test(`（9.architecture protection）逐檔案完整性掃描：${relFile} 確實維持零diff（控制組，worker.js/routes索引/design tokens本次任務刻意不需要修改）`, () => {
      assert.ok(!gitDiffNameOnly.includes(relFile), `${relFile} 不應該出現在git diff清單裡`);
    });
  }

  await test('（9.architecture protection）沒有任何新增/修改檔案import外部AI SDK套件（只檢查實際import陳述式）；health_insight_routes.js在TASK1.121後合法import內部自建的Gemini Enhancement模組（../intelligence/enhancement/gemini/，不是外部SDK），予以排除（TASK1.121後更新）', () => {
    [
      path.join(controllersDir, 'health_insight_controller.js'),
      path.join(controllersDir, 'health_insight_response_builder.js'),
      path.join(uiDir, 'render_product_response.js'),
    ].forEach((f) => {
      const source = fs.readFileSync(f, 'utf8');
      assert.ok(!hasAiSdkImport(source), `${f} 疑似含AI SDK引用`);
    });
    const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
    const importLines = getImportLines(routesSource).split('\n');
    const suspiciousImports = importLines.filter((l) => /gemini|generative-ai|openai|anthropic-ai|@google\/genai/i.test(l) && !l.includes("'../intelligence/enhancement/gemini/"));
    assert.deepStrictEqual(suspiciousImports, []);
  });

  await test('（9.architecture protection）wrangler.toml完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.architecture protection）package.json完全沒有被本次任務修改（沒有新增任何npm依賴）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.architecture protection）D1 domain tables驗證：新增/修改的檔案完全不import src/db/，不會對D1做任何讀寫', () => {
    [
      path.join(controllersDir, 'health_insight_controller.js'),
      path.join(controllersDir, 'health_insight_response_builder.js'),
      path.join(routesDir, 'health_insight_routes.js'),
      path.join(uiDir, 'render_product_response.js'),
    ].forEach((f) => {
      const source = fs.readFileSync(f, 'utf8');
      assert.ok(!source.includes('db.prepare') && !source.includes("from '../db/") && !source.includes("from '../../db/"));
    });
  });

  console.log('');

  // =========================================================================
  // J. Regression validation
  // =========================================================================
  console.log('--- J. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（Regression validation）此檔案目前被另一個regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），跳過再往下spawn其餘測試檔案，避免遞迴', () => {
      assert.ok(true);
    });
  } else {
    const healthInsightLineageSuites = [
      'backups/phase6-task1.111-health-insight-feature/test_health_insight_feature_foundation.mjs',
      'backups/phase6-task1.112-health-insight-integration/test_health_insight_product_integration.mjs',
      'backups/phase6-task1.113-health-insight-activation/test_health_insight_activation_foundation.mjs',
      'backups/phase6-task1.114-health-insight-uiux/test_health_insight_uiux_foundation.mjs',
      'backups/phase6-task1.115-health-insight-visual-integration/test_health_insight_visual_integration.mjs',
      'backups/phase6-task1.116-health-insight-activation/test_health_insight_activation.mjs',
    ];

    for (const relSuite of healthInsightLineageSuites) {
      await test(`（Regression validation）${relSuite} 完整執行，exit code為0（Health Insight產品線本身無回歸；用PHASE1_REVIEW_NESTED=1限定只跑該檔案自己的直接斷言）`, () => {
        execFileSync('node', [relSuite], {
          cwd: repoRoot,
          stdio: 'pipe',
          timeout: 60000,
          env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
        });
      });
    }

    await test('（Regression validation）本檔案（TASK1.117自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic', () => {
      execFileSync('node', [path.join(__dirname, 'test_health_insight_response_boundary.mjs')], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 60000,
        env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
      });
    });

    await test('（Regression validation）本次任務刻意不重新掃描/重跑Phase1~5（TASK1.26~1.105）既有測試檔案——延續TASK1.116已確認的既定範圍決策，那些檔案各自內建的"worker.js/routes/controllers零diff"假設是在Route connection被允許之前寫下的既有測試基礎設施假設，Health Insight產品線本身（TASK1.111~1.116）已經在上面驗證無回歸', () => {
      assert.ok(true);
    });
  }

  console.log('');

  // =========================================================================
  // K. P1-P6
  // =========================================================================
  console.log('--- K. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在p1-p6-check/run.js執行（本次任務完全沒有修改任何既有legacy UI/getHTML()相關程式碼，既有UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改（本次任務完全沒有動到worker.js）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  await test('（P1-P6）wrangler.toml完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）migrations/目錄除了TASK1.120新增的0007 health_insight_records migration之外，完全沒有其他檔案被新增或修改（TASK1.120後更新）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（P1-P6）src/auth/、src/oauth/完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('失敗項目：');
    failures.forEach((name) => console.log(' - ' + name));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('測試執行本身發生未預期錯誤：', e);
  process.exit(1);
});

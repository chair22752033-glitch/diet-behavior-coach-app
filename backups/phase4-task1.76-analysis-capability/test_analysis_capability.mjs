/*
 * Phase 4 TASK 1.76｜Analysis Capability Execution Foundation 測試
 *
 * 本任務不是導入AI、不是建立AI Provider、不是建立Prompt Logic——
 * 這是Phase 4第一個Intelligence Capability Execution Boundary，
 * 讓Application Feature可以透過明確的Capability邊界使用Analysis
 * Framework（TASK1.43），而不需要直接import`analysis_runner.js`。
 *
 * 這份測試驗證的是：
 * - analysis_capability.js/analysis_capability_result_builder.js
 *   各自的boundary正確
 * - 端對端：Analysis Capability透過真實的Analysis Runner可以走
 *   完整條「structured request → Analysis Runner → Analysis
 *   Result」流程
 * - Analysis Capability完全不直接依賴database/auth/session/
 *   execution manager/history store/metrics store
 * - Analysis Runner/Recommendation Runner本身完全沒有被修改
 * - Phase 3 Application Layer完全沒有被修改（本次任務不接進既有
 *   Feature，也不修改Application Pattern）
 * - export一致性、regression、P1-P6
 *
 * 分為以下10個部分：
 * A) capability boundary
 * B) analysis runner integration
 * C) result compatibility
 * D) feature isolation
 * E) runtime isolation
 * F) dependency scan
 * G) export consistency
 * H) no AI dependency
 * I) regression check
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
const capabilitiesDir = path.join(intelDir, 'capabilities');
const analysisCapabilityDir = path.join(capabilitiesDir, 'analysis');

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

function getReExportedNamespaces(indexPath) {
  const src = readSrc(indexPath);
  const names = new Set();
  for (const m of src.matchAll(/^export\s*\*\s*as\s+(\S+)\s+from/gm)) {
    names.add(m[1]);
  }
  return names;
}

const ANALYSIS_CAPABILITY_JS_FILES = ['analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js'];

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
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'analysis_capability.js'));
  const { createAnalysisCapabilityResultBuilder } = await import(path.join(analysisCapabilityDir, 'analysis_capability_result_builder.js'));
  await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } = await import(path.join(analysisDir, 'index.js'));

  // =========================================================================
  // A. capability boundary
  // =========================================================================
  console.log('--- A. capability boundary ---');

  await test('（1.capability boundary）src/intelligence/capabilities/analysis/ 恰好包含4個檔案（analysis_capability/analysis_capability_result_builder/index/README）', () => {
    const files = fs.readdirSync(analysisCapabilityDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js']);
  });

  await test('（1.capability boundary）src/intelligence/capabilities/analysis/README.md 存在且非空', () => {
    const readmePath = path.join(analysisCapabilityDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.capability boundary）src/intelligence/capabilities/README.md（頂層）存在且非空', () => {
    const readmePath = path.join(capabilitiesDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.capability boundary）createAnalysisCapability()回傳物件恰好只有requestAnalysis一個公開介面', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    assert.deepStrictEqual(Object.keys(capability), ['requestAnalysis']);
  });

  await test('（1.capability boundary）createAnalysisCapabilityResultBuilder()回傳物件恰好只有buildSuccessResult/buildFailureResult兩個公開介面', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    assert.deepStrictEqual(Object.keys(builder).sort(), ['buildFailureResult', 'buildSuccessResult']);
  });

  await test('（1.capability boundary）requestAnalysis()是同步函式（跟Analysis Runner本身runAnalysis()的同步簽名一致，回傳值不是Promise）', () => {
    const capability = createAnalysisCapability({ analysisRunner: { runAnalysis: () => ({ ok: true, result: {} }) } });
    const returned = capability.requestAnalysis({ context: {} });
    assert.strictEqual(returned instanceof Promise, false);
  });

  await test('（1.capability boundary）requestAnalysis()合法輸入時正確呼叫analysisRunner.runAnalysis()並回傳包裝後的結果', () => {
    const analysisRunner = { runAnalysis: () => ({ ok: true, result: { status: 'x', insights: [], metadata: {} } }) };
    const capability = createAnalysisCapability({ analysisRunner });
    const result = capability.requestAnalysis({ context: {} });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'analysis');
  });

  await test('（1.capability boundary）requestAnalysis()缺少context時回傳{ok:false, capability:"analysis", reason:"invalid_context"}，完全不呼叫analysisRunner', () => {
    let called = false;
    const analysisRunner = { runAnalysis: () => { called = true; } };
    const capability = createAnalysisCapability({ analysisRunner });
    const result = capability.requestAnalysis({});
    assert.deepStrictEqual(result, { ok: false, capability: 'analysis', reason: 'invalid_context' });
    assert.strictEqual(called, false);
  });

  await test('（1.capability boundary）requestAnalysis()的context為null時回傳invalid_context', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    const result = capability.requestAnalysis({ context: null });
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（1.capability boundary）requestAnalysis()的context為陣列時回傳invalid_context', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    const result = capability.requestAnalysis({ context: [] });
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（1.capability boundary）requestAnalysis()的context為字串時回傳invalid_context', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    const result = capability.requestAnalysis({ context: 'not an object' });
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（1.capability boundary）requestAnalysis()的options為陣列時回傳invalid_options_type', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    const result = capability.requestAnalysis({ context: {}, options: [] });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.capability boundary）requestAnalysis()的options為null時回傳invalid_options_type', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    const result = capability.requestAnalysis({ context: {}, options: null });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.capability boundary）requestAnalysis()的options為合法空物件{}時通過驗證，正常呼叫analysisRunner', () => {
    let called = false;
    const analysisRunner = { runAnalysis: () => { called = true; return { ok: true, result: {} }; } };
    const capability = createAnalysisCapability({ analysisRunner });
    capability.requestAnalysis({ context: {}, options: {} });
    assert.strictEqual(called, true);
  });

  await test('（1.capability boundary）requestAnalysis(null)不拋出例外，回傳invalid_request', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    assert.doesNotThrow(() => capability.requestAnalysis(null));
    const result = capability.requestAnalysis(null);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability boundary）requestAnalysis("not an object")回傳invalid_request', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    const result = capability.requestAnalysis('not an object');
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability boundary）requestAnalysis([])回傳invalid_request（陣列不是合法request）', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    const result = capability.requestAnalysis([]);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability boundary）analysisRunner缺失時回傳analysis_runner_unavailable', () => {
    const capability = createAnalysisCapability({});
    const result = capability.requestAnalysis({ context: {} });
    assert.strictEqual(result.reason, 'analysis_runner_unavailable');
  });

  await test('（1.capability boundary）analysisRunner.runAnalysis不是函式時回傳analysis_runner_unavailable', () => {
    const capability = createAnalysisCapability({ analysisRunner: { runAnalysis: 'nope' } });
    const result = capability.requestAnalysis({ context: {} });
    assert.strictEqual(result.reason, 'analysis_runner_unavailable');
  });

  await test('（1.capability boundary）不同的Analysis Capability實例各自獨立（不是共用singleton）', () => {
    const capabilityA = createAnalysisCapability({ analysisRunner: {} });
    const capabilityB = createAnalysisCapability({ analysisRunner: {} });
    assert.notStrictEqual(capabilityA, capabilityB);
  });

  await test('（1.capability boundary）createAnalysisCapability()可以自訂resultBuilder（依賴注入）', () => {
    let customCalled = false;
    const customBuilder = { buildSuccessResult: () => ({}), buildFailureResult: (reason) => { customCalled = true; return { ok: false, capability: 'analysis', reason: `custom:${reason}` }; } };
    const capability = createAnalysisCapability({ analysisRunner: {}, resultBuilder: customBuilder });
    const result = capability.requestAnalysis({});
    assert.strictEqual(customCalled, true);
    assert.strictEqual(result.reason, 'custom:invalid_context');
  });

  await test('（1.capability boundary）createAnalysisCapability()沒有提供resultBuilder時，內部自動建立一個預設的（跟直接呼叫createAnalysisCapabilityResultBuilder()行為一致）', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    const result = capability.requestAnalysis({});
    const builder = createAnalysisCapabilityResultBuilder();
    assert.deepStrictEqual(result, builder.buildFailureResult('invalid_context'));
  });

  await test('（1.capability boundary）dependencies為undefined時不拋出例外，回傳analysis_runner_unavailable', () => {
    const capability = createAnalysisCapability();
    assert.doesNotThrow(() => capability.requestAnalysis({ context: {} }));
    const result = capability.requestAnalysis({ context: {} });
    assert.strictEqual(result.reason, 'analysis_runner_unavailable');
  });

  await test('（1.capability boundary）dependencies為{}時不拋出例外，回傳analysis_runner_unavailable', () => {
    const capability = createAnalysisCapability({});
    const result = capability.requestAnalysis({ context: {} });
    assert.strictEqual(result.reason, 'analysis_runner_unavailable');
  });

  await test('（1.capability boundary）requestAnalysis()的context為Symbol/數字等非預期型別時安全回傳invalid_context，不拋出例外', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    for (const badContext of [42, true, 'x', Symbol('x')]) {
      assert.doesNotThrow(() => capability.requestAnalysis({ context: badContext }));
      const result = capability.requestAnalysis({ context: badContext });
      assert.strictEqual(result.reason, 'invalid_context');
    }
  });

  await test('（1.capability boundary）requestAnalysis()的options為字串/數字時回傳invalid_options_type', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    assert.strictEqual(capability.requestAnalysis({ context: {}, options: 'x' }).reason, 'invalid_options_type');
    assert.strictEqual(capability.requestAnalysis({ context: {}, options: 42 }).reason, 'invalid_options_type');
  });

  await test('（1.capability boundary）requestAnalysis()的options未提供時（undefined）通過驗證，正常呼叫analysisRunner（options為選填）', () => {
    let receivedOptions = 'not-called';
    const analysisRunner = { runAnalysis: (context, options) => { receivedOptions = options; return { ok: true, result: {} }; } };
    const capability = createAnalysisCapability({ analysisRunner });
    capability.requestAnalysis({ context: {} });
    assert.strictEqual(receivedOptions, undefined);
  });

  await test('（1.capability boundary）失敗結果一律恰好只有ok/capability/reason（沒有field時）三個欄位', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    const result = capability.requestAnalysis({});
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'reason']);
  });

  await test('（1.capability boundary）成功結果一律恰好只有ok/capability/result三個欄位', () => {
    const analysisRunner = { runAnalysis: () => ({ ok: true, result: { a: 1 } }) };
    const capability = createAnalysisCapability({ analysisRunner });
    const result = capability.requestAnalysis({ context: {} });
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'result']);
  });

  await test('（1.capability boundary）失敗結果的capability欄位固定為"analysis"字面值', () => {
    const capability = createAnalysisCapability({ analysisRunner: {} });
    const result = capability.requestAnalysis({});
    assert.strictEqual(result.capability, 'analysis');
  });

  await test('（1.capability boundary）成功結果的capability欄位固定為"analysis"字面值', () => {
    const analysisRunner = { runAnalysis: () => ({ ok: true, result: {} }) };
    const capability = createAnalysisCapability({ analysisRunner });
    const result = capability.requestAnalysis({ context: {} });
    assert.strictEqual(result.capability, 'analysis');
  });

  await test('（1.capability boundary）requestAnalysis()呼叫analysisRunner.runAnalysis()恰好一次（不會重試或重複呼叫）', () => {
    let callCount = 0;
    const analysisRunner = { runAnalysis: () => { callCount++; return { ok: true, result: {} }; } };
    const capability = createAnalysisCapability({ analysisRunner });
    capability.requestAnalysis({ context: {} });
    assert.strictEqual(callCount, 1);
  });

  await test('（1.capability boundary）requestAnalysis()的request物件不會被修改（沒有side effect）', () => {
    const analysisRunner = { runAnalysis: () => ({ ok: true, result: {} }) };
    const capability = createAnalysisCapability({ analysisRunner });
    const request = { context: { a: 1 }, options: { b: 2 } };
    const requestCopy = JSON.parse(JSON.stringify(request));
    capability.requestAnalysis(request);
    assert.deepStrictEqual(request, requestCopy);
  });

  console.log('');

  // =========================================================================
  // B. analysis runner integration
  // =========================================================================
  console.log('--- B. analysis runner integration ---');

  await test('（2.analysis runner integration）端對端：真實的Analysis Runner確實有被Analysis Capability觸發（透過spy驗證）', () => {
    let runnerCalled = false;
    const spyRunner = { runAnalysis: (...args) => { runnerCalled = true; return createAnalysisRunner().runAnalysis(...args); } };
    const capability = createAnalysisCapability({ analysisRunner: spyRunner });
    const result = capability.requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(runnerCalled, true);
    assert.strictEqual(result.ok, true);
  });

  await test('（2.analysis runner integration）端對端：context跟options都正確原樣轉交給analysisRunner.runAnalysis()', () => {
    let receivedContext = null;
    let receivedOptions = null;
    const spyRunner = { runAnalysis: (context, options) => { receivedContext = context; receivedOptions = options; return { ok: true, result: {} }; } };
    const capability = createAnalysisCapability({ analysisRunner: spyRunner });
    const context = makeInsightContext();
    const options = { generatedAt: 'x' };
    capability.requestAnalysis({ context, options });
    assert.strictEqual(receivedContext, context);
    assert.strictEqual(receivedOptions, options);
  });

  await test('（2.analysis runner integration）端對端：真實Analysis Runner失敗時（例如context缺少必要欄位），Capability正確轉發reason跟field', () => {
    const capability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const result = capability.requestAnalysis({ context: { user: null } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.capability, 'analysis');
    assert.strictEqual(typeof result.reason, 'string');
  });

  await test('（2.analysis runner integration）端對端：真實Analysis Runner成功時的insights陣列恰好6筆（DEFAULT_ANALYSIS_MODULES數量）', () => {
    const capability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const result = capability.requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（2.analysis runner integration）端對端：注入自訂modules的Analysis Runner，Capability依然正確運作（證明Capability層不關心Runner內部用哪組模組——這正是TASK1.75規劃的AI Extension Point不受Capability層影響）', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'custom', value: 1, source: 'x' })] });
    const capability = createAnalysisCapability({ analysisRunner: customRunner });
    const result = capability.requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.insights, [{ type: 'custom', value: 1, source: 'x' }]);
  });

  await test('（2.analysis runner integration）Analysis Runner本身（analysis_runner.js）本次任務完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.analysis runner integration）Recommendation Runner本身（recommendation_runner.js）本次任務完全沒有被修改（規格明確禁止修改Recommendation Runner）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.analysis runner integration）端對端：不同的InsightContext輸入都能正確走完Analysis Capability→Analysis Runner流程', () => {
    const capability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    for (const overrides of [{}, { activityContext: { count: 10, items: [] } }, { metadata: { totalRecords: 99 } }]) {
      const result = capability.requestAnalysis({ context: makeInsightContext(overrides) });
      assert.strictEqual(result.ok, true);
    }
  });

  await test('（2.analysis runner integration）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const capability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(capability.requestAnalysis(request), capability.requestAnalysis(request));
  });

  await test('（2.analysis runner integration）端對端：多次獨立建立的Analysis Capability實例（各自注入獨立的Analysis Runner）互不干擾，各自得到正確的結果', () => {
    const capabilityA = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const capabilityB = createAnalysisCapability({ analysisRunner: createAnalysisRunner({ modules: [() => ({ type: 'only-b', value: 1, source: 'b' })] }) });
    const context = makeInsightContext();
    const resultA = capabilityA.requestAnalysis({ context });
    const resultB = capabilityB.requestAnalysis({ context });
    assert.strictEqual(resultA.result.insights.length, DEFAULT_ANALYSIS_MODULES.length);
    assert.deepStrictEqual(resultB.result.insights, [{ type: 'only-b', value: 1, source: 'b' }]);
  });

  await test('（2.analysis runner integration）端對端：透過src/intelligence/index.js的頂層capabilities.analysis跟直接import capabilities/analysis/index.js得到一致的行為', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    const directCapability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const viaTopLevel = intelModule.capabilities.analysis.createAnalysisCapability({ analysisRunner: intelModule.analysis.createAnalysisRunner() });
    const context = makeInsightContext();
    assert.deepStrictEqual(directCapability.requestAnalysis({ context }), viaTopLevel.requestAnalysis({ context }));
  });

  console.log('');

  // =========================================================================
  // C. result compatibility
  // =========================================================================
  console.log('--- C. result compatibility ---');

  await test('（3.result compatibility）buildSuccessResult()保留Analysis Result原本的{status,insights,metadata}形狀，不重新拆開組裝', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    const analysisResult = { status: 'analysis_ready', insights: [{ type: 'x', value: 1, source: 'y' }], metadata: { version: '1.0.0' } };
    const result = builder.buildSuccessResult(analysisResult);
    assert.deepStrictEqual(result, { ok: true, capability: 'analysis', result: analysisResult });
  });

  await test('（3.result compatibility）buildSuccessResult()的result參照跟傳入的analysisResult完全相同（不做深拷貝）', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    const analysisResult = { status: 'x', insights: [], metadata: {} };
    const result = builder.buildSuccessResult(analysisResult);
    assert.strictEqual(result.result, analysisResult);
  });

  await test('（3.result compatibility）buildSuccessResult(undefined)安全正規化為{}，不拋出例外', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    assert.doesNotThrow(() => builder.buildSuccessResult(undefined));
    assert.deepStrictEqual(builder.buildSuccessResult(undefined), { ok: true, capability: 'analysis', result: {} });
  });

  await test('（3.result compatibility）buildFailureResult(reason)不提供field時，回傳物件不含field欄位', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    const result = builder.buildFailureResult('invalid_context');
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'reason']);
  });

  await test('（3.result compatibility）buildFailureResult(reason, field)提供field時，回傳物件包含field欄位', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    const result = builder.buildFailureResult('invalid_field_type', 'status');
    assert.deepStrictEqual(result, { ok: false, capability: 'analysis', reason: 'invalid_field_type', field: 'status' });
  });

  await test('（3.result compatibility）buildFailureResult(非字串reason)安全正規化為unknown_error', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(123), { ok: false, capability: 'analysis', reason: 'unknown_error' });
    assert.deepStrictEqual(builder.buildFailureResult(undefined), { ok: false, capability: 'analysis', reason: 'unknown_error' });
  });

  await test('（3.result compatibility）buildFailureResult(reason, 非字串field)忽略非法field，不加入field欄位', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    const result = builder.buildFailureResult('x', 123);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'field'), false);
  });

  await test('（3.result compatibility）buildFailureResult(reason, 空字串field)忽略空字串field，不加入field欄位', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    const result = builder.buildFailureResult('x', '');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'field'), false);
  });

  await test('（3.result compatibility）是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    const input = { status: 'x', insights: [{ type: 'a', value: 1, source: 'b' }], metadata: {} };
    assert.deepStrictEqual(builder.buildSuccessResult(input), builder.buildSuccessResult(input));
  });

  await test('（3.result compatibility）analysis_capability_result_builder.js完全沒有呼叫Date.now()/Math.random()', () => {
    const src = readSrc(path.join(analysisCapabilityDir, 'analysis_capability_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（3.result compatibility）不同的Analysis Capability Result Builder實例各自獨立（不是共用singleton）', () => {
    const builderA = createAnalysisCapabilityResultBuilder();
    const builderB = createAnalysisCapabilityResultBuilder();
    assert.notStrictEqual(builderA, builderB);
  });

  await test('（3.result compatibility）createAnalysisCapabilityResultBuilder(任何參數)都回傳相同介面（不接受依賴注入，因為完全沒有任何依賴需要注入）', () => {
    const builderA = createAnalysisCapabilityResultBuilder();
    const builderB = createAnalysisCapabilityResultBuilder({ ignored: 'value' });
    assert.deepStrictEqual(Object.keys(builderA), Object.keys(builderB));
  });

  await test('（3.result compatibility）buildSuccessResult()對不同的analysisResult輸入都能正確保留insights陣列內容不變', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    const insights = [{ type: 'a', value: 1, source: 'x' }, { type: 'b', value: 2, source: 'y' }];
    const result = builder.buildSuccessResult({ status: 'ready', insights, metadata: {} });
    assert.strictEqual(result.result.insights, insights);
    assert.strictEqual(result.result.insights.length, 2);
  });

  await test('（3.result compatibility）buildFailureResult()對已知的Analysis Runner失敗reason（invalid_insight_context等）都能正確轉發', () => {
    const builder = createAnalysisCapabilityResultBuilder();
    for (const reason of ['invalid_insight_context', 'invalid_field_type', 'analysis_runner_unavailable']) {
      const result = builder.buildFailureResult(reason);
      assert.strictEqual(result.reason, reason);
    }
  });

  console.log('');

  // =========================================================================
  // D. feature isolation
  // =========================================================================
  console.log('--- D. feature isolation ---');

  for (const file of ANALYSIS_CAPABILITY_JS_FILES) {
    await test(`（4.feature isolation）capabilities/analysis/${file} 完全不import src/intelligence/application/（不認識Phase 3 Application Layer的存在）`, () => {
      assert.ok(!/from\s+['"].*\/application\//.test(readSrc(path.join(analysisCapabilityDir, file))));
    });
    await test(`（4.feature isolation）capabilities/analysis/${file} 完全不出現INSIGHT_DOMAIN/BEHAVIOR_DOMAIN/insightFeature/behaviorFeature等既有Feature domain識別字樣（Analysis Capability是domain-agnostic的，不綁定任何特定Feature）`, () => {
      const src = readSrc(path.join(analysisCapabilityDir, file));
      assert.ok(!/INSIGHT_DOMAIN/.test(src));
      assert.ok(!/BEHAVIOR_DOMAIN/.test(src));
      assert.ok(!/insightFeature/.test(src));
      assert.ok(!/behaviorFeature/.test(src));
    });
    await test(`（4.feature isolation）capabilities/analysis/${file} 完全不import features/insight/或features/behavior/`, () => {
      const src = readSrc(path.join(analysisCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/insight\//.test(src));
      assert.ok(!/from\s+['"].*\/behavior\//.test(src));
    });
    await test(`（4.feature isolation）capabilities/analysis/${file} 完全不import application/use_cases/、application/workflows/`, () => {
      const src = readSrc(path.join(analysisCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/use_cases\//.test(src));
      assert.ok(!/from\s+['"].*\/workflows\//.test(src));
    });
  }

  await test('（4.feature isolation）Insight專屬檔案（capabilities/insight_capability.js、use_cases/insight_use_case.js、features/insight_feature.js、features/insight/整條樹）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/capabilities/insight_capability.js src/intelligence/application/use_cases/insight_use_case.js src/intelligence/application/features/insight_feature.js src/intelligence/application/features/insight/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.feature isolation）Behavior專屬檔案（features/behavior/整條樹）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/features/behavior/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.feature isolation）application/features/index.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/features/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.feature isolation）application/index.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.feature isolation）Contract Layer（application/contracts/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/contracts/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.feature isolation）Workflow Layer（application/workflows/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/workflows/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.feature isolation）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有被修改（git diff確認，Phase 3 Application Pattern維持不變）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.feature isolation）src/bootstrap/application.js本次任務完全沒有被修改（Analysis Capability沒有接進既有intelligence物件）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.feature isolation）app.intelligence物件恰好維持24個欄位不變（本次任務沒有新增任何bootstrap欄位，Analysis Capability是獨立extension point）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（4.feature isolation）端對端：Insight跟Behavior兩個既有Feature在本次任務後依然成功運作（未受Analysis Capability新增影響）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  console.log('');

  // =========================================================================
  // E. runtime isolation
  // =========================================================================
  console.log('--- E. runtime isolation ---');

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'recommendation', 'governance', 'events', 'monitoring'];
  for (const file of ANALYSIS_CAPABILITY_JS_FILES) {
    await test(`（5.runtime isolation）capabilities/analysis/${file} 完全不import src/intelligence/execution/（Execution Manager）`, () => {
      const src = readSrc(path.join(analysisCapabilityDir, file));
      const executionManagerDir = path.join(intelDir, 'execution');
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        const resolved = path.normalize(path.join(analysisCapabilityDir, imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir);
      }
    });
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（5.runtime isolation）capabilities/analysis/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(readSrc(path.join(analysisCapabilityDir, file))));
      });
    }
    for (const varName of ['executionManager', 'historyStore', 'metricsStore', 'eventDispatcher', 'governanceService']) {
      await test(`（5.runtime isolation）capabilities/analysis/${file} 完全不出現${varName}變數名稱`, () => {
        assert.ok(!new RegExp(varName).test(readSrc(path.join(analysisCapabilityDir, file))));
      });
    }
  }

  await test('（5.runtime isolation）Runtime Execution Layer（execution/、service/、orchestration/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/execution/ src/intelligence/service/ src/intelligence/orchestration/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // F. dependency scan
  // =========================================================================
  console.log('--- F. dependency scan ---');

  for (const file of ANALYSIS_CAPABILITY_JS_FILES) {
    await test(`（6.dependency scan）capabilities/analysis/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(analysisCapabilityDir, file))));
    });
    for (const pattern of [/db\.prepare\(/, /\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i, /DIET_COACH_DB/]) {
      await test(`（6.dependency scan）capabilities/analysis/${file} 不含資料庫關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(readSrc(path.join(analysisCapabilityDir, file))));
      });
    }
    await test(`（6.dependency scan）capabilities/analysis/${file} 完全不出現db變數名稱（Analysis Capability完全不知道db是什麼，甚至不接受db作為參數）`, () => {
      assert.ok(!/\bdb\b/.test(readSrc(path.join(analysisCapabilityDir, file))));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（6.dependency scan）capabilities/analysis/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(readSrc(path.join(analysisCapabilityDir, file))));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i, /\buserId\b/]) {
      await test(`（6.dependency scan）capabilities/analysis/${file} 不含身分相關字樣 ${pattern}（不接受身分相關參數）`, () => {
        assert.ok(!pattern.test(readSrc(path.join(analysisCapabilityDir, file))));
      });
    }
    for (const fn of ['requireAuth(', 'requireActiveUser(', 'getCurrentUser(']) {
      await test(`（6.dependency scan）capabilities/analysis/${file} 完全不呼叫${fn.replace('(', '()')}`, () => {
        assert.ok(!readSrc(path.join(analysisCapabilityDir, file)).includes(fn));
      });
    }
    await test(`（6.dependency scan）capabilities/analysis/${file} 裡所有import都是相對路徑（完全不import任何非相對路徑的外部套件）`, () => {
      const imports = [...readSrc(path.join(analysisCapabilityDir, file)).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file}import了非相對路徑的外部套件：${imp}`);
      }
    });
    await test(`（6.dependency scan）capabilities/analysis/${file} 完全不import src/services/（既有Domain Service）`, () => {
      assert.ok(!/from\s+['"].*\/services\//.test(readSrc(path.join(analysisCapabilityDir, file))));
    });
    await test(`（6.dependency scan）capabilities/analysis/${file} 完全不呼叫setTimeout()/setInterval()（沒有非同步排程邏輯）`, () => {
      const src = readSrc(path.join(analysisCapabilityDir, file));
      assert.ok(!/setTimeout\(/.test(src));
      assert.ok(!/setInterval\(/.test(src));
    });
  }

  await test('（6.dependency scan）capabilities/analysis/整個目錄樹沒有任何檔案import src/intelligence/runtime/', () => {
    for (const file of ANALYSIS_CAPABILITY_JS_FILES) {
      assert.ok(!/from\s+['"].*\/runtime\//.test(readSrc(path.join(analysisCapabilityDir, file))));
    }
  });

  await test('（6.dependency scan）capabilities/analysis/整個目錄樹沒有任何檔案import src/intelligence/contracts.js或src/intelligence/contracts/', () => {
    for (const file of ANALYSIS_CAPABILITY_JS_FILES) {
      const src = readSrc(path.join(analysisCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/contracts/.test(src));
    }
  });

  console.log('');

  // =========================================================================
  // G. export consistency
  // =========================================================================
  console.log('--- G. export consistency ---');

  await test('（7.export consistency）capabilities/analysis/index.js完整re-export了兩個具名函式（createAnalysisCapability/createAnalysisCapabilityResultBuilder），沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(analysisCapabilityDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createAnalysisCapability', 'createAnalysisCapabilityResultBuilder']);
  });

  await test('（7.export consistency）capabilities/analysis/index.js re-export的名稱在對應來源檔案裡確實存在', () => {
    const indexSrc = readSrc(path.join(analysisCapabilityDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(analysisCapabilityDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（7.export consistency）src/intelligence/capabilities/index.js（頂層）恰好只有analysis一個namespace', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces], ['analysis']);
  });

  await test('（7.export consistency）import後，capabilitiesModule.analysis是非空物件，具備createAnalysisCapability/createAnalysisCapabilityResultBuilder', async () => {
    const capabilitiesModule = await import(path.join(capabilitiesDir, 'index.js'));
    assert.strictEqual(typeof capabilitiesModule.analysis.createAnalysisCapability, 'function');
    assert.strictEqual(typeof capabilitiesModule.analysis.createAnalysisCapabilityResultBuilder, 'function');
  });

  await test('（7.export consistency）src/intelligence/index.js有export * as capabilities from ./capabilities/index.js', () => {
    const src = readSrc(path.join(intelDir, 'index.js'));
    assert.ok(/export \* as capabilities from ['"]\.\/capabilities\/index\.js['"]/.test(src));
  });

  await test('（7.export consistency）import後，intelModule.capabilities.analysis可以正確運作端對端流程', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    const capability = intelModule.capabilities.analysis.createAnalysisCapability({ analysisRunner: intelModule.analysis.createAnalysisRunner() });
    const result = capability.requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.export consistency）src/intelligence/index.js跟application/index.js各自的capabilities namespace互不污染（頂層capabilities.analysis跟application.capabilities.createInsightCapability是不同的東西）', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    assert.strictEqual(typeof intelModule.capabilities.createInsightCapability, 'undefined');
    assert.strictEqual(typeof intelModule.application.capabilities.createInsightCapability, 'function');
    assert.strictEqual(typeof intelModule.application.capabilities.createAnalysisCapability, 'undefined');
  });

  await test('（7.export consistency）capabilities/analysis/index.js唯一的相對路徑import是./analysis_capability.js跟./analysis_capability_result_builder.js', () => {
    const src = readSrc(path.join(analysisCapabilityDir, 'index.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports.sort(), ['./analysis_capability.js', './analysis_capability_result_builder.js']);
  });

  await test('（7.export consistency）analysis_capability.js唯一的相對路徑import是./analysis_capability_result_builder.js', () => {
    const src = readSrc(path.join(analysisCapabilityDir, 'analysis_capability.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./analysis_capability_result_builder.js']);
  });

  await test('（7.export consistency）analysis_capability_result_builder.js完全零相依（沒有任何import）', () => {
    const src = readSrc(path.join(analysisCapabilityDir, 'analysis_capability_result_builder.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（7.export consistency）src/intelligence/capabilities/index.js唯一的相對路徑import是./analysis/index.js', () => {
    const src = readSrc(path.join(capabilitiesDir, 'index.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./analysis/index.js']);
  });

  console.log('');

  // =========================================================================
  // H. no AI dependency
  // =========================================================================
  console.log('--- H. no AI dependency ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of ANALYSIS_CAPABILITY_JS_FILES) {
    const codeOnly = readSrc(path.join(analysisCapabilityDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.no AI dependency）capabilities/analysis/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（8.no AI dependency）capabilities/analysis/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
  }

  await test('（8.no AI dependency）wrangler.toml完全沒有新增任何AI相關的環境變數/binding（本次任務沒有啟用AI Provider）', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（8.no AI dependency）analysis_capability.js完全不出現score/confidence相關的計算邏輯（不解讀分析結果的業務內容，也不計算任何新的分數）', () => {
    const src = readSrc(path.join(analysisCapabilityDir, 'analysis_capability.js'));
    assert.ok(!/\.score\s*=/.test(src));
    assert.ok(!/\.confidence\s*=/.test(src));
  });

  await test('（8.no AI dependency）analysis_capability.js/analysis_capability_result_builder.js完全不呼叫Date.now()/Math.random()（deterministic）', () => {
    for (const file of ['analysis_capability.js', 'analysis_capability_result_builder.js']) {
      const src = readSrc(path.join(analysisCapabilityDir, file));
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    }
  });

  await test('（8.no AI dependency）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（8.no AI dependency）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  console.log('');

  // =========================================================================
  // I. regression check
  // =========================================================================
  console.log('--- I. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（9.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.76-analysis-capability')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 66, `預期至少66個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（9.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

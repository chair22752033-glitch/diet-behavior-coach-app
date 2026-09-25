/*
 * Phase 4 TASK 1.77｜Recommendation Capability Execution Foundation 測試
 *
 * 本任務不是導入AI、不是建立AI Provider、不是建立Prompt Logic——
 * 這是Phase 4第二個Intelligence Capability Execution Boundary，
 * 讓Application Feature可以透過明確的Capability邊界使用
 * Recommendation Framework（TASK1.44），而不需要直接import
 * `recommendation_runner.js`。
 *
 * 這份測試驗證的是：
 * - recommendation_capability.js/
 *   recommendation_capability_result_builder.js各自的boundary正確
 * - 端對端：Recommendation Capability透過真實的Recommendation
 *   Runner可以走完整條「structured request → Recommendation
 *   Runner → Recommendation Result」流程
 * - Recommendation Capability完全不直接依賴database/auth/session/
 *   execution manager/history store/metrics store
 * - Recommendation Runner/Analysis Runner本身完全沒有被修改
 * - Phase 3 Application Layer完全沒有被修改（本次任務不接進既有
 *   Feature，也不修改Application Pattern）
 * - export一致性、regression、P1-P6
 *
 * 分為以下10個部分：
 * A) capability boundary
 * B) recommendation runner integration
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
const recommendationCapabilityDir = path.join(capabilitiesDir, 'recommendation');

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

const RECOMMENDATION_CAPABILITY_JS_FILES = ['recommendation_capability.js', 'recommendation_capability_result_builder.js', 'index.js'];

function makeAnalysisResult(overrides) {
  return Object.assign({
    status: 'analysis_ready',
    insights: [{ type: 'x', value: 1, source: 'y' }],
    metadata: { version: '1.0.0' },
  }, overrides || {});
}

async function run() {
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'recommendation_capability.js'));
  const { createRecommendationCapabilityResultBuilder } = await import(path.join(recommendationCapabilityDir, 'recommendation_capability_result_builder.js'));
  await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(recommendationDir, 'index.js'));
  const { createAnalysisRunner } = await import(path.join(analysisDir, 'index.js'));

  // =========================================================================
  // A. capability boundary
  // =========================================================================
  console.log('--- A. capability boundary ---');

  await test('（1.capability boundary）src/intelligence/capabilities/recommendation/ 恰好包含4個檔案（recommendation_capability/recommendation_capability_result_builder/index/README）', () => {
    const files = fs.readdirSync(recommendationCapabilityDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'index.js', 'recommendation_capability.js', 'recommendation_capability_result_builder.js']);
  });

  await test('（1.capability boundary）src/intelligence/capabilities/recommendation/README.md 存在且非空', () => {
    const readmePath = path.join(recommendationCapabilityDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.capability boundary）src/intelligence/capabilities/README.md（頂層）存在且非空', () => {
    const readmePath = path.join(capabilitiesDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.capability boundary）src/intelligence/capabilities/README.md（頂層）內容有提到recommendation子namespace（TASK1.77新增）', () => {
    const content = fs.readFileSync(path.join(capabilitiesDir, 'README.md'), 'utf8');
    assert.ok(/recommendation/.test(content));
  });

  await test('（1.capability boundary）createRecommendationCapability()回傳物件恰好只有requestRecommendation一個公開介面', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    assert.deepStrictEqual(Object.keys(capability), ['requestRecommendation']);
  });

  await test('（1.capability boundary）createRecommendationCapabilityResultBuilder()回傳物件恰好只有buildSuccessResult/buildFailureResult兩個公開介面', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    assert.deepStrictEqual(Object.keys(builder).sort(), ['buildFailureResult', 'buildSuccessResult']);
  });

  await test('（1.capability boundary）requestRecommendation()是同步函式（跟Recommendation Runner本身runRecommendation()的同步簽名一致，回傳值不是Promise）', () => {
    const capability = createRecommendationCapability({ recommendationRunner: { runRecommendation: () => ({ ok: true, result: {} }) } });
    const returned = capability.requestRecommendation({ analysisResult: {} });
    assert.strictEqual(returned instanceof Promise, false);
  });

  await test('（1.capability boundary）requestRecommendation()合法輸入時正確呼叫recommendationRunner.runRecommendation()並回傳包裝後的結果', () => {
    const recommendationRunner = { runRecommendation: () => ({ ok: true, result: { status: 'recommendation_ready', recommendations: [], metadata: {} } }) };
    const capability = createRecommendationCapability({ recommendationRunner });
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'recommendation');
  });

  await test('（1.capability boundary）requestRecommendation()缺少analysisResult時回傳{ok:false, capability:"recommendation", reason:"invalid_analysis_result"}，完全不呼叫recommendationRunner', () => {
    let called = false;
    const recommendationRunner = { runRecommendation: () => { called = true; } };
    const capability = createRecommendationCapability({ recommendationRunner });
    const result = capability.requestRecommendation({});
    assert.deepStrictEqual(result, { ok: false, capability: 'recommendation', reason: 'invalid_analysis_result' });
    assert.strictEqual(called, false);
  });

  await test('（1.capability boundary）requestRecommendation()的analysisResult為null時回傳invalid_analysis_result', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    const result = capability.requestRecommendation({ analysisResult: null });
    assert.strictEqual(result.reason, 'invalid_analysis_result');
  });

  await test('（1.capability boundary）requestRecommendation()的analysisResult為陣列時回傳invalid_analysis_result', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    const result = capability.requestRecommendation({ analysisResult: [] });
    assert.strictEqual(result.reason, 'invalid_analysis_result');
  });

  await test('（1.capability boundary）requestRecommendation()的analysisResult為字串時回傳invalid_analysis_result', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    const result = capability.requestRecommendation({ analysisResult: 'not an object' });
    assert.strictEqual(result.reason, 'invalid_analysis_result');
  });

  await test('（1.capability boundary）requestRecommendation()的analysisResult為Symbol/數字/布林等非預期型別時安全回傳invalid_analysis_result，不拋出例外', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    for (const bad of [42, true, 'x', Symbol('x'), undefined]) {
      assert.doesNotThrow(() => capability.requestRecommendation({ analysisResult: bad }));
      const result = capability.requestRecommendation({ analysisResult: bad });
      assert.strictEqual(result.reason, 'invalid_analysis_result');
    }
  });

  await test('（1.capability boundary）requestRecommendation(null)不拋出例外，回傳invalid_request', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    assert.doesNotThrow(() => capability.requestRecommendation(null));
    const result = capability.requestRecommendation(null);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability boundary）requestRecommendation("not an object")回傳invalid_request', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    const result = capability.requestRecommendation('not an object');
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability boundary）requestRecommendation([])回傳invalid_request（陣列不是合法request）', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    const result = capability.requestRecommendation([]);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability boundary）requestRecommendation(undefined)回傳invalid_request', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    const result = capability.requestRecommendation(undefined);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability boundary）requestRecommendation(42)回傳invalid_request', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    const result = capability.requestRecommendation(42);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability boundary）recommendationRunner缺失時回傳recommendation_runner_unavailable', () => {
    const capability = createRecommendationCapability({});
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.strictEqual(result.reason, 'recommendation_runner_unavailable');
  });

  await test('（1.capability boundary）recommendationRunner.runRecommendation不是函式時回傳recommendation_runner_unavailable', () => {
    const capability = createRecommendationCapability({ recommendationRunner: { runRecommendation: 'nope' } });
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.strictEqual(result.reason, 'recommendation_runner_unavailable');
  });

  await test('（1.capability boundary）不同的Recommendation Capability實例各自獨立（不是共用singleton）', () => {
    const capabilityA = createRecommendationCapability({ recommendationRunner: {} });
    const capabilityB = createRecommendationCapability({ recommendationRunner: {} });
    assert.notStrictEqual(capabilityA, capabilityB);
  });

  await test('（1.capability boundary）createRecommendationCapability()可以自訂resultBuilder（依賴注入）', () => {
    let customCalled = false;
    const customBuilder = { buildSuccessResult: () => ({}), buildFailureResult: (reason) => { customCalled = true; return { ok: false, capability: 'recommendation', reason: `custom:${reason}` }; } };
    const capability = createRecommendationCapability({ recommendationRunner: {}, resultBuilder: customBuilder });
    const result = capability.requestRecommendation({});
    assert.strictEqual(customCalled, true);
    assert.strictEqual(result.reason, 'custom:invalid_analysis_result');
  });

  await test('（1.capability boundary）createRecommendationCapability()沒有提供resultBuilder時，內部自動建立一個預設的（跟直接呼叫createRecommendationCapabilityResultBuilder()行為一致）', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    const result = capability.requestRecommendation({});
    const builder = createRecommendationCapabilityResultBuilder();
    assert.deepStrictEqual(result, builder.buildFailureResult('invalid_analysis_result'));
  });

  await test('（1.capability boundary）dependencies為undefined時不拋出例外，回傳recommendation_runner_unavailable', () => {
    const capability = createRecommendationCapability();
    assert.doesNotThrow(() => capability.requestRecommendation({ analysisResult: makeAnalysisResult() }));
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.strictEqual(result.reason, 'recommendation_runner_unavailable');
  });

  await test('（1.capability boundary）dependencies為{}時不拋出例外，回傳recommendation_runner_unavailable', () => {
    const capability = createRecommendationCapability({});
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.strictEqual(result.reason, 'recommendation_runner_unavailable');
  });

  await test('（1.capability boundary）requestRecommendation()request裡多出未定義欄位（例如多餘的options）不影響驗證結果，仍然正常呼叫recommendationRunner（Runner本身沒有第二個參數，多餘欄位單純被忽略）', () => {
    let called = false;
    const recommendationRunner = { runRecommendation: () => { called = true; return { ok: true, result: {} }; } };
    const capability = createRecommendationCapability({ recommendationRunner });
    capability.requestRecommendation({ analysisResult: makeAnalysisResult(), options: { ignored: true } });
    assert.strictEqual(called, true);
  });

  await test('（1.capability boundary）失敗結果一律恰好只有ok/capability/reason（沒有field時）三個欄位', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    const result = capability.requestRecommendation({});
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'reason']);
  });

  await test('（1.capability boundary）成功結果一律恰好只有ok/capability/result三個欄位', () => {
    const recommendationRunner = { runRecommendation: () => ({ ok: true, result: { a: 1 } }) };
    const capability = createRecommendationCapability({ recommendationRunner });
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'result']);
  });

  await test('（1.capability boundary）失敗結果的capability欄位固定為"recommendation"字面值', () => {
    const capability = createRecommendationCapability({ recommendationRunner: {} });
    const result = capability.requestRecommendation({});
    assert.strictEqual(result.capability, 'recommendation');
  });

  await test('（1.capability boundary）成功結果的capability欄位固定為"recommendation"字面值', () => {
    const recommendationRunner = { runRecommendation: () => ({ ok: true, result: {} }) };
    const capability = createRecommendationCapability({ recommendationRunner });
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.strictEqual(result.capability, 'recommendation');
  });

  await test('（1.capability boundary）requestRecommendation()呼叫recommendationRunner.runRecommendation()恰好一次（不會重試或重複呼叫）', () => {
    let callCount = 0;
    const recommendationRunner = { runRecommendation: () => { callCount++; return { ok: true, result: {} }; } };
    const capability = createRecommendationCapability({ recommendationRunner });
    capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.strictEqual(callCount, 1);
  });

  await test('（1.capability boundary）requestRecommendation()的request物件不會被修改（沒有side effect）', () => {
    const recommendationRunner = { runRecommendation: () => ({ ok: true, result: {} }) };
    const capability = createRecommendationCapability({ recommendationRunner });
    const request = { analysisResult: makeAnalysisResult() };
    const requestCopy = JSON.parse(JSON.stringify(request));
    capability.requestRecommendation(request);
    assert.deepStrictEqual(request, requestCopy);
  });

  await test('（1.capability boundary）requestRecommendation()把request.analysisResult原封不動（同一參照）轉交給recommendationRunner.runRecommendation()', () => {
    let received = null;
    const recommendationRunner = { runRecommendation: (analysisResult) => { received = analysisResult; return { ok: true, result: {} }; } };
    const capability = createRecommendationCapability({ recommendationRunner });
    const analysisResult = makeAnalysisResult();
    capability.requestRecommendation({ analysisResult });
    assert.strictEqual(received, analysisResult);
  });

  console.log('');

  // =========================================================================
  // B. recommendation runner integration
  // =========================================================================
  console.log('--- B. recommendation runner integration ---');

  await test('（2.recommendation runner integration）端對端：真實的Recommendation Runner確實有被Recommendation Capability觸發（透過spy驗證）', () => {
    let runnerCalled = false;
    const spyRunner = { runRecommendation: (...args) => { runnerCalled = true; return createRecommendationRunner().runRecommendation(...args); } };
    const capability = createRecommendationCapability({ recommendationRunner: spyRunner });
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.strictEqual(runnerCalled, true);
    assert.strictEqual(result.ok, true);
  });

  await test('（2.recommendation runner integration）端對端：analysisResult正確原樣轉交給recommendationRunner.runRecommendation()', () => {
    let receivedAnalysisResult = null;
    const spyRunner = { runRecommendation: (analysisResult) => { receivedAnalysisResult = analysisResult; return { ok: true, result: {} }; } };
    const capability = createRecommendationCapability({ recommendationRunner: spyRunner });
    const analysisResult = makeAnalysisResult();
    capability.requestRecommendation({ analysisResult });
    assert.strictEqual(receivedAnalysisResult, analysisResult);
  });

  await test('（2.recommendation runner integration）端對端：真實Recommendation Runner失敗時（例如analysisResult缺少必要欄位），Capability正確轉發reason跟field', () => {
    const capability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const result = capability.requestRecommendation({ analysisResult: { status: 'x' } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.capability, 'recommendation');
    assert.strictEqual(typeof result.reason, 'string');
    assert.strictEqual(result.field, 'insights');
  });

  await test('（2.recommendation runner integration）端對端：真實Recommendation Runner成功時的recommendations陣列恰好3筆（DEFAULT_RECOMMENDATION_MODULES數量）', () => {
    const capability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
    assert.strictEqual(DEFAULT_RECOMMENDATION_MODULES.length, 3);
  });

  await test('（2.recommendation runner integration）端對端：注入自訂modules的Recommendation Runner，Capability依然正確運作（證明Capability層不關心Runner內部用哪組模組——這正是TASK1.75規劃的AI Extension Point不受Capability層影響）', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'custom', value: 1, source: 'x' })] });
    const capability = createRecommendationCapability({ recommendationRunner: customRunner });
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.recommendations, [{ type: 'custom', value: 1, source: 'x' }]);
  });

  await test('（2.recommendation runner integration）Recommendation Runner本身（recommendation_runner.js）本次任務完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.recommendation runner integration）Analysis Runner本身（analysis_runner.js）本次任務完全沒有被修改（規格明確禁止修改Analysis Runner）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.recommendation runner integration）Analysis Capability（TASK1.76）本次任務完全沒有被修改的核心邏輯（analysis_capability.js/analysis_capability_result_builder.js git diff確認）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/analysis/analysis_capability.js src/intelligence/capabilities/analysis/analysis_capability_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.recommendation runner integration）端對端：Analysis Capability產生的真實result可以直接餵給Recommendation Capability（兩個Capability串接，證明兩段Phase 4邊界銜接一致，但彼此完全不import對方）', async () => {
    const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'analysis_capability.js'));
    const analysisCapability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const insightContext = {
      user: null,
      activityContext: { count: 2, items: [{ id: 'a1' }] },
      nutritionContext: { count: 1, items: [{ id: 'n1' }] },
      emotionContext: { count: 0, items: [] },
      behaviorContext: { count: 0, items: [] },
      reportContext: { count: 0, items: [] },
      metadata: { totalRecords: 3 },
    };
    const analysisOutcome = analysisCapability.requestAnalysis({ context: insightContext });
    assert.strictEqual(analysisOutcome.ok, true);
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const recommendationOutcome = recommendationCapability.requestRecommendation({ analysisResult: analysisOutcome.result });
    assert.strictEqual(recommendationOutcome.ok, true);
    assert.strictEqual(recommendationOutcome.result.status, 'recommendation_ready');
  });

  await test('（2.recommendation runner integration）端對端：不同的Analysis Result輸入都能正確走完Recommendation Capability→Recommendation Runner流程', () => {
    const capability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    for (const overrides of [{}, { status: 'partial' }, { insights: [] }, { metadata: { version: '2.0.0' } }]) {
      const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult(overrides) });
      assert.strictEqual(result.ok, true);
    }
  });

  await test('（2.recommendation runner integration）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const capability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const request = { analysisResult: makeAnalysisResult() };
    assert.deepStrictEqual(capability.requestRecommendation(request), capability.requestRecommendation(request));
  });

  await test('（2.recommendation runner integration）端對端：多次獨立建立的Recommendation Capability實例（各自注入獨立的Recommendation Runner）互不干擾，各自得到正確的結果', () => {
    const capabilityA = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const capabilityB = createRecommendationCapability({ recommendationRunner: createRecommendationRunner({ modules: [() => ({ type: 'only-b', value: 1, source: 'b' })] }) });
    const analysisResult = makeAnalysisResult();
    const resultA = capabilityA.requestRecommendation({ analysisResult });
    const resultB = capabilityB.requestRecommendation({ analysisResult });
    assert.strictEqual(resultA.result.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
    assert.deepStrictEqual(resultB.result.recommendations, [{ type: 'only-b', value: 1, source: 'b' }]);
  });

  await test('（2.recommendation runner integration）端對端：透過src/intelligence/index.js的頂層capabilities.recommendation跟直接import capabilities/recommendation/index.js得到一致的行為', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    const directCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const viaTopLevel = intelModule.capabilities.recommendation.createRecommendationCapability({ recommendationRunner: intelModule.recommendation.createRecommendationRunner() });
    const analysisResult = makeAnalysisResult();
    assert.deepStrictEqual(directCapability.requestRecommendation({ analysisResult }), viaTopLevel.requestRecommendation({ analysisResult }));
  });

  await test('（2.recommendation runner integration）端對端：recommendation_runner的insightCountModule正確反映insights陣列長度', () => {
    const capability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult({ insights: [{ type: 'a', value: 1, source: 'x' }, { type: 'b', value: 2, source: 'y' }] }) });
    const insightCount = result.result.recommendations.find((r) => r.type === 'insight_count');
    assert.strictEqual(insightCount.value, 2);
  });

  console.log('');

  // =========================================================================
  // C. result compatibility
  // =========================================================================
  console.log('--- C. result compatibility ---');

  await test('（3.result compatibility）buildSuccessResult()保留Recommendation Result原本的{status,recommendations,metadata}形狀，不重新拆開組裝', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    const recommendationResult = { status: 'recommendation_ready', recommendations: [{ type: 'x', value: 1, source: 'y' }], metadata: { version: '1.0.0' } };
    const result = builder.buildSuccessResult(recommendationResult);
    assert.deepStrictEqual(result, { ok: true, capability: 'recommendation', result: recommendationResult });
  });

  await test('（3.result compatibility）buildSuccessResult()的result參照跟傳入的recommendationResult完全相同（不做深拷貝）', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    const recommendationResult = { status: 'x', recommendations: [], metadata: {} };
    const result = builder.buildSuccessResult(recommendationResult);
    assert.strictEqual(result.result, recommendationResult);
  });

  await test('（3.result compatibility）buildSuccessResult(undefined)安全正規化為{}，不拋出例外', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    assert.doesNotThrow(() => builder.buildSuccessResult(undefined));
    assert.deepStrictEqual(builder.buildSuccessResult(undefined), { ok: true, capability: 'recommendation', result: {} });
  });

  await test('（3.result compatibility）buildSuccessResult(null)安全正規化為{}，不拋出例外', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    assert.deepStrictEqual(builder.buildSuccessResult(null), { ok: true, capability: 'recommendation', result: {} });
  });

  await test('（3.result compatibility）buildFailureResult(reason)不提供field時，回傳物件不含field欄位', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    const result = builder.buildFailureResult('invalid_analysis_result');
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'reason']);
  });

  await test('（3.result compatibility）buildFailureResult(reason, field)提供field時，回傳物件包含field欄位', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    const result = builder.buildFailureResult('invalid_field_type', 'insights');
    assert.deepStrictEqual(result, { ok: false, capability: 'recommendation', reason: 'invalid_field_type', field: 'insights' });
  });

  await test('（3.result compatibility）buildFailureResult(非字串reason)安全正規化為unknown_error', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(123), { ok: false, capability: 'recommendation', reason: 'unknown_error' });
    assert.deepStrictEqual(builder.buildFailureResult(undefined), { ok: false, capability: 'recommendation', reason: 'unknown_error' });
  });

  await test('（3.result compatibility）buildFailureResult(reason, 非字串field)忽略非法field，不加入field欄位', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    const result = builder.buildFailureResult('x', 123);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'field'), false);
  });

  await test('（3.result compatibility）buildFailureResult(reason, 空字串field)忽略空字串field，不加入field欄位', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    const result = builder.buildFailureResult('x', '');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'field'), false);
  });

  await test('（3.result compatibility）是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    const input = { status: 'x', recommendations: [{ type: 'a', value: 1, source: 'b' }], metadata: {} };
    assert.deepStrictEqual(builder.buildSuccessResult(input), builder.buildSuccessResult(input));
  });

  await test('（3.result compatibility）recommendation_capability_result_builder.js完全沒有呼叫Date.now()/Math.random()', () => {
    const src = readSrc(path.join(recommendationCapabilityDir, 'recommendation_capability_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（3.result compatibility）不同的Recommendation Capability Result Builder實例各自獨立（不是共用singleton）', () => {
    const builderA = createRecommendationCapabilityResultBuilder();
    const builderB = createRecommendationCapabilityResultBuilder();
    assert.notStrictEqual(builderA, builderB);
  });

  await test('（3.result compatibility）createRecommendationCapabilityResultBuilder(任何參數)都回傳相同介面（不接受依賴注入，因為完全沒有任何依賴需要注入）', () => {
    const builderA = createRecommendationCapabilityResultBuilder();
    const builderB = createRecommendationCapabilityResultBuilder({ ignored: 'value' });
    assert.deepStrictEqual(Object.keys(builderA), Object.keys(builderB));
  });

  await test('（3.result compatibility）buildSuccessResult()對不同的recommendationResult輸入都能正確保留recommendations陣列內容不變', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    const recommendations = [{ type: 'a', value: 1, source: 'x' }, { type: 'b', value: 2, source: 'y' }];
    const result = builder.buildSuccessResult({ status: 'ready', recommendations, metadata: {} });
    assert.strictEqual(result.result.recommendations, recommendations);
    assert.strictEqual(result.result.recommendations.length, 2);
  });

  await test('（3.result compatibility）buildFailureResult()對已知的Recommendation Runner失敗reason（invalid_analysis_result等）都能正確轉發', () => {
    const builder = createRecommendationCapabilityResultBuilder();
    for (const reason of ['invalid_analysis_result', 'invalid_field_type', 'recommendation_runner_unavailable']) {
      const result = builder.buildFailureResult(reason);
      assert.strictEqual(result.reason, reason);
    }
  });

  await test('（3.result compatibility）result_builder跟analysis版本（TASK1.76）是完全獨立的兩個模組（不共用同一份程式碼、不互相import）', () => {
    const src = readSrc(path.join(recommendationCapabilityDir, 'recommendation_capability_result_builder.js'));
    assert.ok(!/analysis_capability_result_builder/.test(src));
  });

  console.log('');

  // =========================================================================
  // D. feature isolation
  // =========================================================================
  console.log('--- D. feature isolation ---');

  for (const file of RECOMMENDATION_CAPABILITY_JS_FILES) {
    await test(`（4.feature isolation）capabilities/recommendation/${file} 完全不import src/intelligence/application/（不認識Phase 3 Application Layer的存在）`, () => {
      assert.ok(!/from\s+['"].*\/application\//.test(readSrc(path.join(recommendationCapabilityDir, file))));
    });
    await test(`（4.feature isolation）capabilities/recommendation/${file} 完全不出現INSIGHT_DOMAIN/BEHAVIOR_DOMAIN/insightFeature/behaviorFeature等既有Feature domain識別字樣（Recommendation Capability是domain-agnostic的，不綁定任何特定Feature）`, () => {
      const src = readSrc(path.join(recommendationCapabilityDir, file));
      assert.ok(!/INSIGHT_DOMAIN/.test(src));
      assert.ok(!/BEHAVIOR_DOMAIN/.test(src));
      assert.ok(!/insightFeature/.test(src));
      assert.ok(!/behaviorFeature/.test(src));
    });
    await test(`（4.feature isolation）capabilities/recommendation/${file} 完全不import features/insight/或features/behavior/`, () => {
      const src = readSrc(path.join(recommendationCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/insight\//.test(src));
      assert.ok(!/from\s+['"].*\/behavior\//.test(src));
    });
    await test(`（4.feature isolation）capabilities/recommendation/${file} 完全不import application/use_cases/、application/workflows/`, () => {
      const src = readSrc(path.join(recommendationCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/use_cases\//.test(src));
      assert.ok(!/from\s+['"].*\/workflows\//.test(src));
    });
    await test(`（4.feature isolation）capabilities/recommendation/${file} 完全不import capabilities/analysis/（跟Analysis Capability是完全平行、互不認識的兩個Capability）`, () => {
      const src = readSrc(path.join(recommendationCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
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

  // （TASK1.79後更新）原本這裡有一個「application/features/index.js
  // 本次任務完全沒有被修改」的斷言，比對即時的git diff
  // --stat。TASK1.79合法地在這個檔案新增了`intelligence`
  // namespace的re-export，這不是TASK1.77造成的回歸，這裡移除
  // 這個斷言，理由同下方對application/整個目錄樹的說明。

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

  // （TASK1.79後更新）原本這裡有一個「Phase 3 Application
  // Layer（application/整個目錄樹）本次任務完全沒有被修改」的
  // 斷言，比對即時的git diff --stat。這是跟TASK1.39/1.56/1.63/
  // 1.67/1.68同一種「比對即時git diff」的脆弱治具：application/
  // 整個目錄樹從來就不在本任務系列真正的禁止清單裡，TASK1.79合法
  // 地在`application/features/`底下新增了第三個Intelligence
  // Application Feature domain（"intelligence"）——這不是TASK1.77
  // 造成的回歸，而是斷言本身寫得過度嚴格，這裡移除這個斷言，改由
  // TASK1.79自己的章節驗證真正的禁止清單（worker.js等）維持零
  // 異動即可。

  await test('（4.feature isolation）src/bootstrap/application.js本次任務完全沒有被修改（Recommendation Capability沒有接進既有intelligence物件）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.feature isolation）app.intelligence物件恰好維持24個欄位不變（本次任務沒有新增任何bootstrap欄位，Recommendation Capability是獨立extension point）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（4.feature isolation）端對端：Insight跟Behavior兩個既有Feature在本次任務後依然成功運作（未受Recommendation Capability新增影響）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  await test('（4.feature isolation）Analysis Capability（TASK1.76）目錄樹本次任務完全沒有被修改（capabilities/analysis/整條樹git diff確認，兩個Capability互不影響）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/capabilities/analysis/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // E. runtime isolation
  // =========================================================================
  console.log('--- E. runtime isolation ---');

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'analysis', 'governance', 'events', 'monitoring'];
  for (const file of RECOMMENDATION_CAPABILITY_JS_FILES) {
    await test(`（5.runtime isolation）capabilities/recommendation/${file} 完全不import src/intelligence/execution/（Execution Manager）`, () => {
      const src = readSrc(path.join(recommendationCapabilityDir, file));
      const executionManagerDir = path.join(intelDir, 'execution');
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        const resolved = path.normalize(path.join(recommendationCapabilityDir, imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir);
      }
    });
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（5.runtime isolation）capabilities/recommendation/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(readSrc(path.join(recommendationCapabilityDir, file))));
      });
    }
    for (const varName of ['executionManager', 'historyStore', 'metricsStore', 'eventDispatcher', 'governanceService']) {
      await test(`（5.runtime isolation）capabilities/recommendation/${file} 完全不出現${varName}變數名稱`, () => {
        assert.ok(!new RegExp(varName).test(readSrc(path.join(recommendationCapabilityDir, file))));
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

  for (const file of RECOMMENDATION_CAPABILITY_JS_FILES) {
    await test(`（6.dependency scan）capabilities/recommendation/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(recommendationCapabilityDir, file))));
    });
    for (const pattern of [/db\.prepare\(/, /\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i, /DIET_COACH_DB/]) {
      await test(`（6.dependency scan）capabilities/recommendation/${file} 不含資料庫關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(readSrc(path.join(recommendationCapabilityDir, file))));
      });
    }
    await test(`（6.dependency scan）capabilities/recommendation/${file} 完全不出現db變數名稱（Recommendation Capability完全不知道db是什麼，甚至不接受db作為參數）`, () => {
      assert.ok(!/\bdb\b/.test(readSrc(path.join(recommendationCapabilityDir, file))));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（6.dependency scan）capabilities/recommendation/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(readSrc(path.join(recommendationCapabilityDir, file))));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i, /\buserId\b/]) {
      await test(`（6.dependency scan）capabilities/recommendation/${file} 不含身分相關字樣 ${pattern}（不接受身分相關參數）`, () => {
        assert.ok(!pattern.test(readSrc(path.join(recommendationCapabilityDir, file))));
      });
    }
    for (const fn of ['requireAuth(', 'requireActiveUser(', 'getCurrentUser(']) {
      await test(`（6.dependency scan）capabilities/recommendation/${file} 完全不呼叫${fn.replace('(', '()')}`, () => {
        assert.ok(!readSrc(path.join(recommendationCapabilityDir, file)).includes(fn));
      });
    }
    await test(`（6.dependency scan）capabilities/recommendation/${file} 裡所有import都是相對路徑（完全不import任何非相對路徑的外部套件）`, () => {
      const imports = [...readSrc(path.join(recommendationCapabilityDir, file)).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file}import了非相對路徑的外部套件：${imp}`);
      }
    });
    await test(`（6.dependency scan）capabilities/recommendation/${file} 完全不import src/services/（既有Domain Service）`, () => {
      assert.ok(!/from\s+['"].*\/services\//.test(readSrc(path.join(recommendationCapabilityDir, file))));
    });
    await test(`（6.dependency scan）capabilities/recommendation/${file} 完全不呼叫setTimeout()/setInterval()（沒有非同步排程邏輯）`, () => {
      const src = readSrc(path.join(recommendationCapabilityDir, file));
      assert.ok(!/setTimeout\(/.test(src));
      assert.ok(!/setInterval\(/.test(src));
    });
  }

  await test('（6.dependency scan）capabilities/recommendation/整個目錄樹沒有任何檔案import src/intelligence/runtime/', () => {
    for (const file of RECOMMENDATION_CAPABILITY_JS_FILES) {
      assert.ok(!/from\s+['"].*\/runtime\//.test(readSrc(path.join(recommendationCapabilityDir, file))));
    }
  });

  await test('（6.dependency scan）capabilities/recommendation/整個目錄樹沒有任何檔案import src/intelligence/contracts.js或src/intelligence/contracts/', () => {
    for (const file of RECOMMENDATION_CAPABILITY_JS_FILES) {
      const src = readSrc(path.join(recommendationCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/contracts/.test(src));
    }
  });

  console.log('');

  // =========================================================================
  // G. export consistency
  // =========================================================================
  console.log('--- G. export consistency ---');

  await test('（7.export consistency）capabilities/recommendation/index.js完整re-export了兩個具名函式（createRecommendationCapability/createRecommendationCapabilityResultBuilder），沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(recommendationCapabilityDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createRecommendationCapability', 'createRecommendationCapabilityResultBuilder']);
  });

  await test('（7.export consistency）capabilities/recommendation/index.js re-export的名稱在對應來源檔案裡確實存在', () => {
    const indexSrc = readSrc(path.join(recommendationCapabilityDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(recommendationCapabilityDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  // TASK1.78後更新：capabilities/index.js新增了第三個namespace
  // `orchestration`（Capability Orchestrator，跟這裡的analysis/
  // recommendation是平行的兄弟namespace，互不import、互不覆蓋），
  // 「恰好只有這兩個」的斷言已經不成立，改為驗證這兩個仍然存在，
  // 不再驗證「僅有」這兩個——理由同TASK1.39/1.56/1.63/1.67/1.68/
  // 1.76/1.77同一系列的修正案例。
  await test('（TASK1.78後更新）（7.export consistency）src/intelligence/capabilities/index.js（頂層）仍然同時包含analysis跟recommendation兩個namespace（TASK1.78新增orchestration後，三者平行並存）', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.ok(namespaces.has('analysis'));
    assert.ok(namespaces.has('recommendation'));
  });

  await test('（7.export consistency）import後，capabilitiesModule.recommendation是非空物件，具備createRecommendationCapability/createRecommendationCapabilityResultBuilder', async () => {
    const capabilitiesModule = await import(path.join(capabilitiesDir, 'index.js'));
    assert.strictEqual(typeof capabilitiesModule.recommendation.createRecommendationCapability, 'function');
    assert.strictEqual(typeof capabilitiesModule.recommendation.createRecommendationCapabilityResultBuilder, 'function');
  });

  await test('（7.export consistency）import後，capabilitiesModule.analysis依然完好（TASK1.76的Analysis Capability沒有被本次修改影響）', async () => {
    const capabilitiesModule = await import(path.join(capabilitiesDir, 'index.js'));
    assert.strictEqual(typeof capabilitiesModule.analysis.createAnalysisCapability, 'function');
  });

  await test('（7.export consistency）src/intelligence/index.js有export * as capabilities from ./capabilities/index.js（本次沒有新增/修改這一行，TASK1.76已建立）', () => {
    const src = readSrc(path.join(intelDir, 'index.js'));
    assert.ok(/export \* as capabilities from ['"]\.\/capabilities\/index\.js['"]/.test(src));
  });

  await test('（7.export consistency）src/intelligence/index.js本次任務完全沒有被修改（頂層capabilities namespace是TASK1.76已建立的，本次只新增nested的recommendation子目錄）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.export consistency）import後，intelModule.capabilities.recommendation可以正確運作端對端流程', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    const capability = intelModule.capabilities.recommendation.createRecommendationCapability({ recommendationRunner: intelModule.recommendation.createRecommendationRunner() });
    const result = capability.requestRecommendation({ analysisResult: makeAnalysisResult() });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.export consistency）src/intelligence/index.js跟application/index.js各自的capabilities namespace互不污染（頂層capabilities.recommendation跟application.capabilities.createInsightCapability是不同的東西）', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    assert.strictEqual(typeof intelModule.capabilities.createInsightCapability, 'undefined');
    assert.strictEqual(typeof intelModule.application.capabilities.createInsightCapability, 'function');
    assert.strictEqual(typeof intelModule.application.capabilities.createRecommendationCapability, 'undefined');
  });

  await test('（7.export consistency）頂層capabilities.analysis跟capabilities.recommendation是兩個完全不同、互不覆蓋的namespace（各自具備獨立的create函式）', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    assert.strictEqual(typeof intelModule.capabilities.analysis.createAnalysisCapability, 'function');
    assert.strictEqual(typeof intelModule.capabilities.recommendation.createRecommendationCapability, 'function');
    assert.strictEqual(typeof intelModule.capabilities.analysis.createRecommendationCapability, 'undefined');
    assert.strictEqual(typeof intelModule.capabilities.recommendation.createAnalysisCapability, 'undefined');
  });

  await test('（7.export consistency）capabilities/recommendation/index.js唯一的相對路徑import是./recommendation_capability.js跟./recommendation_capability_result_builder.js', () => {
    const src = readSrc(path.join(recommendationCapabilityDir, 'index.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports.sort(), ['./recommendation_capability.js', './recommendation_capability_result_builder.js']);
  });

  await test('（7.export consistency）recommendation_capability.js唯一的相對路徑import是./recommendation_capability_result_builder.js', () => {
    const src = readSrc(path.join(recommendationCapabilityDir, 'recommendation_capability.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./recommendation_capability_result_builder.js']);
  });

  await test('（7.export consistency）recommendation_capability_result_builder.js完全零相依（沒有任何import）', () => {
    const src = readSrc(path.join(recommendationCapabilityDir, 'recommendation_capability_result_builder.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  // TASK1.78後更新：capabilities/index.js新增了
  // `export * as orchestration from './orchestration/index.js';`
  // 這一行合法的nested子目錄re-export，「恰好是這兩個」的斷言已經
  // 不成立，改為驗證至少包含這兩個既有的import，不再限定總數。
  await test('（TASK1.78後更新）（7.export consistency）src/intelligence/capabilities/index.js的相對路徑import包含./analysis/index.js跟./recommendation/index.js', () => {
    const src = readSrc(path.join(capabilitiesDir, 'index.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.ok(imports.includes('./analysis/index.js'));
    assert.ok(imports.includes('./recommendation/index.js'));
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
  for (const file of RECOMMENDATION_CAPABILITY_JS_FILES) {
    const codeOnly = readSrc(path.join(recommendationCapabilityDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.no AI dependency）capabilities/recommendation/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（8.no AI dependency）capabilities/recommendation/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
  }

  await test('（8.no AI dependency）wrangler.toml完全沒有新增任何AI相關的環境變數/binding（本次任務沒有啟用AI Provider）', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（8.no AI dependency）recommendation_capability.js完全不出現score/confidence相關的計算邏輯（不解讀分析結果的業務內容，也不計算任何新的分數）', () => {
    const src = readSrc(path.join(recommendationCapabilityDir, 'recommendation_capability.js'));
    assert.ok(!/\.score\s*=/.test(src));
    assert.ok(!/\.confidence\s*=/.test(src));
  });

  await test('（8.no AI dependency）recommendation_capability.js完全不出現任何自然語言/教練語氣字樣（建議你/應該/推薦您）', () => {
    const src = readSrc(path.join(recommendationCapabilityDir, 'recommendation_capability.js'));
    assert.ok(!/建議你/.test(src));
    assert.ok(!/應該/.test(src));
    assert.ok(!/推薦您/.test(src));
  });

  await test('（8.no AI dependency）recommendation_capability.js/recommendation_capability_result_builder.js完全不呼叫Date.now()/Math.random()（deterministic）', () => {
    for (const file of ['recommendation_capability.js', 'recommendation_capability_result_builder.js']) {
      const src = readSrc(path.join(recommendationCapabilityDir, file));
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.77-recommendation-capability')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 67, `預期至少67個既有測試檔案，實際 ${allSuites.length}`);
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

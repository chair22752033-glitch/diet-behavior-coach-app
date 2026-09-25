/*
 * Phase 4 TASK 1.78｜Intelligence Capability Orchestration Foundation 測試
 *
 * 本任務不是導入AI、不是建立AI Provider、不是修改Runtime
 * Orchestrator——這是Phase 4第三個Intelligence Capability
 * Boundary，把TASK1.76 Analysis Capability跟TASK1.77
 * Recommendation Capability組合成一條完整的Intelligence Capability
 * Flow，讓Application Feature（未來）可以透過單一個Capability
 * Orchestration邊界一次拿到Unified Capability Result。
 *
 * 這份測試驗證的是：
 * - capability_orchestrator.js/capability_result_builder.js各自的
 *   boundary正確
 * - 端對端：Capability Orchestrator透過真實的Analysis
 *   Capability跟Recommendation Capability可以走完整條「structured
 *   request → Analysis Capability → Recommendation Capability →
 *   Unified Capability Result」流程
 * - Capability Orchestrator完全不直接依賴database/auth/session/
 *   execution manager/history store/metrics store/event
 *   dispatcher
 * - Analysis Runner/Recommendation Runner/Phase 2 Runtime
 *   Orchestrator本身完全沒有被修改
 * - Analysis Capability/Recommendation Capability本身完全沒有被
 *   修改
 * - Phase 3 Application Layer完全沒有被修改（本次任務不接進既有
 *   Feature，也不修改Application Pattern）
 * - export一致性、regression、P1-P6
 *
 * 分為以下11個部分：
 * A) capability chaining
 * B) analysis integration
 * C) recommendation integration
 * D) result compatibility
 * E) feature isolation
 * F) runtime isolation
 * G) dependency scan
 * H) export consistency
 * I) no AI dependency
 * J) regression check
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
const capabilitiesDir = path.join(intelDir, 'capabilities');
const analysisCapabilityDir = path.join(capabilitiesDir, 'analysis');
const recommendationCapabilityDir = path.join(capabilitiesDir, 'recommendation');
const orchestrationCapabilityDir = path.join(capabilitiesDir, 'orchestration');

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

const ORCHESTRATION_CAPABILITY_JS_FILES = ['capability_orchestrator.js', 'capability_result_builder.js', 'index.js'];

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

function makeAnalysisResult(overrides) {
  return Object.assign({
    status: 'analysis_ready',
    insights: [{ type: 'x', value: 1, source: 'y' }],
    metadata: { version: '1.0.0' },
  }, overrides || {});
}

async function run() {
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
  const { createCapabilityOrchestratorResultBuilder } = await import(path.join(orchestrationCapabilityDir, 'capability_result_builder.js'));
  await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(recommendationDir, 'index.js'));

  function makeRealCapabilities() {
    return {
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    };
  }

  // =========================================================================
  // A. capability chaining
  // =========================================================================
  console.log('--- A. capability chaining ---');

  await test('（1.capability chaining）src/intelligence/capabilities/orchestration/ 恰好包含4個檔案（capability_orchestrator/capability_result_builder/index/README）', () => {
    const files = fs.readdirSync(orchestrationCapabilityDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'capability_orchestrator.js', 'capability_result_builder.js', 'index.js']);
  });

  await test('（1.capability chaining）src/intelligence/capabilities/orchestration/README.md 存在且非空', () => {
    const readmePath = path.join(orchestrationCapabilityDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.capability chaining）src/intelligence/capabilities/README.md（頂層）內容有提到orchestration子namespace（TASK1.78新增）', () => {
    const content = fs.readFileSync(path.join(capabilitiesDir, 'README.md'), 'utf8');
    assert.ok(/orchestration/.test(content));
  });

  await test('（1.capability chaining）createCapabilityOrchestrator()回傳物件恰好只有requestCapabilityFlow一個公開介面', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    assert.deepStrictEqual(Object.keys(orchestrator), ['requestCapabilityFlow']);
  });

  await test('（1.capability chaining）createCapabilityOrchestratorResultBuilder()回傳物件恰好只有buildSuccessResult/buildFailureResult兩個公開介面', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    assert.deepStrictEqual(Object.keys(builder).sort(), ['buildFailureResult', 'buildSuccessResult']);
  });

  await test('（1.capability chaining）requestCapabilityFlow()是同步函式（跟Analysis Capability/Recommendation Capability本身的同步簽名一致，回傳值不是Promise）', () => {
    const orchestrator = createCapabilityOrchestrator(makeRealCapabilities());
    const returned = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(returned instanceof Promise, false);
  });

  await test('（1.capability chaining）requestCapabilityFlow()缺少context時回傳{ok:false, capability:"orchestration", reason:"invalid_context"}，完全不呼叫analysisCapability/recommendationCapability', () => {
    let analysisCalled = false;
    let recommendationCalled = false;
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: { requestAnalysis: () => { analysisCalled = true; } },
      recommendationCapability: { requestRecommendation: () => { recommendationCalled = true; } },
    });
    const result = orchestrator.requestCapabilityFlow({});
    assert.deepStrictEqual(result, { ok: false, capability: 'orchestration', reason: 'invalid_context' });
    assert.strictEqual(analysisCalled, false);
    assert.strictEqual(recommendationCalled, false);
  });

  await test('（1.capability chaining）requestCapabilityFlow()的context為null時回傳invalid_context', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow({ context: null });
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（1.capability chaining）requestCapabilityFlow()的context為陣列時回傳invalid_context', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow({ context: [] });
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（1.capability chaining）requestCapabilityFlow()的context為字串時回傳invalid_context', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow({ context: 'not an object' });
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（1.capability chaining）requestCapabilityFlow()的context為Symbol/數字/布林等非預期型別時安全回傳invalid_context，不拋出例外', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    for (const bad of [42, true, 'x', Symbol('x')]) {
      assert.doesNotThrow(() => orchestrator.requestCapabilityFlow({ context: bad }));
      const result = orchestrator.requestCapabilityFlow({ context: bad });
      assert.strictEqual(result.reason, 'invalid_context');
    }
  });

  await test('（1.capability chaining）requestCapabilityFlow()的options為陣列時回傳invalid_options_type', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow({ context: {}, options: [] });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.capability chaining）requestCapabilityFlow()的options為null時回傳invalid_options_type', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow({ context: {}, options: null });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.capability chaining）requestCapabilityFlow()的options為字串/數字時回傳invalid_options_type', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    assert.strictEqual(orchestrator.requestCapabilityFlow({ context: {}, options: 'x' }).reason, 'invalid_options_type');
    assert.strictEqual(orchestrator.requestCapabilityFlow({ context: {}, options: 42 }).reason, 'invalid_options_type');
  });

  await test('（1.capability chaining）requestCapabilityFlow()的options未提供時（undefined）通過驗證，正常呼叫analysisCapability（options為選填）', () => {
    let receivedOptions = 'not-called';
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: { requestAnalysis: (req) => { receivedOptions = req.options; return { ok: true, result: makeAnalysisResult() }; } },
      recommendationCapability: { requestRecommendation: () => ({ ok: true, result: {} }) },
    });
    orchestrator.requestCapabilityFlow({ context: {} });
    assert.strictEqual(receivedOptions, undefined);
  });

  await test('（1.capability chaining）requestCapabilityFlow(null)不拋出例外，回傳invalid_request', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    assert.doesNotThrow(() => orchestrator.requestCapabilityFlow(null));
    const result = orchestrator.requestCapabilityFlow(null);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability chaining）requestCapabilityFlow("not an object")回傳invalid_request', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow('not an object');
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability chaining）requestCapabilityFlow([])回傳invalid_request（陣列不是合法request）', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow([]);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability chaining）requestCapabilityFlow(undefined)回傳invalid_request', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow(undefined);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability chaining）analysisCapability缺失時回傳analysis_capability_unavailable', () => {
    const orchestrator = createCapabilityOrchestrator({ recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow({ context: {} });
    assert.strictEqual(result.reason, 'analysis_capability_unavailable');
  });

  await test('（1.capability chaining）analysisCapability.requestAnalysis不是函式時回傳analysis_capability_unavailable', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: { requestAnalysis: 'nope' }, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow({ context: {} });
    assert.strictEqual(result.reason, 'analysis_capability_unavailable');
  });

  await test('（1.capability chaining）recommendationCapability缺失時（但analysis成功）回傳recommendation_capability_unavailable', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: { requestAnalysis: () => ({ ok: true, result: makeAnalysisResult() }) },
    });
    const result = orchestrator.requestCapabilityFlow({ context: {} });
    assert.strictEqual(result.reason, 'recommendation_capability_unavailable');
  });

  await test('（1.capability chaining）recommendationCapability.requestRecommendation不是函式時回傳recommendation_capability_unavailable', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: { requestAnalysis: () => ({ ok: true, result: makeAnalysisResult() }) },
      recommendationCapability: { requestRecommendation: 'nope' },
    });
    const result = orchestrator.requestCapabilityFlow({ context: {} });
    assert.strictEqual(result.reason, 'recommendation_capability_unavailable');
  });

  await test('（1.capability chaining）recommendationCapability缺失時（analysis驗證失敗優先），完全不檢查recommendationCapability，直接回傳analysis的失敗reason', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: { requestAnalysis: () => ({ ok: false, reason: 'invalid_insight_context' }) },
    });
    const result = orchestrator.requestCapabilityFlow({ context: {} });
    assert.strictEqual(result.reason, 'invalid_insight_context');
    assert.strictEqual(result.stage, 'analysis');
  });

  await test('（1.capability chaining）不同的Capability Orchestrator實例各自獨立（不是共用singleton）', () => {
    const orchestratorA = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const orchestratorB = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    assert.notStrictEqual(orchestratorA, orchestratorB);
  });

  await test('（1.capability chaining）createCapabilityOrchestrator()可以自訂resultBuilder（依賴注入）', () => {
    let customCalled = false;
    const customBuilder = { buildSuccessResult: () => ({}), buildFailureResult: (reason) => { customCalled = true; return { ok: false, capability: 'orchestration', reason: `custom:${reason}` }; } };
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {}, resultBuilder: customBuilder });
    const result = orchestrator.requestCapabilityFlow({});
    assert.strictEqual(customCalled, true);
    assert.strictEqual(result.reason, 'custom:invalid_context');
  });

  await test('（1.capability chaining）createCapabilityOrchestrator()沒有提供resultBuilder時，內部自動建立一個預設的（跟直接呼叫createCapabilityOrchestratorResultBuilder()行為一致）', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow({});
    const builder = createCapabilityOrchestratorResultBuilder();
    assert.deepStrictEqual(result, builder.buildFailureResult('invalid_context'));
  });

  await test('（1.capability chaining）dependencies為undefined時不拋出例外，回傳analysis_capability_unavailable', () => {
    const orchestrator = createCapabilityOrchestrator();
    assert.doesNotThrow(() => orchestrator.requestCapabilityFlow({ context: {} }));
    const result = orchestrator.requestCapabilityFlow({ context: {} });
    assert.strictEqual(result.reason, 'analysis_capability_unavailable');
  });

  await test('（1.capability chaining）dependencies為{}時不拋出例外，回傳analysis_capability_unavailable', () => {
    const orchestrator = createCapabilityOrchestrator({});
    const result = orchestrator.requestCapabilityFlow({ context: {} });
    assert.strictEqual(result.reason, 'analysis_capability_unavailable');
  });

  await test('（1.capability chaining）失敗結果一律恰好只有ok/capability/reason（沒有field/stage時）三個欄位', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow({});
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'reason']);
  });

  await test('（1.capability chaining）成功結果一律恰好只有ok/capability/result三個欄位', () => {
    const orchestrator = createCapabilityOrchestrator(makeRealCapabilities());
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'result']);
  });

  await test('（1.capability chaining）失敗結果的capability欄位固定為"orchestration"字面值', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    const result = orchestrator.requestCapabilityFlow({});
    assert.strictEqual(result.capability, 'orchestration');
  });

  await test('（1.capability chaining）成功結果的capability欄位固定為"orchestration"字面值', () => {
    const orchestrator = createCapabilityOrchestrator(makeRealCapabilities());
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.capability, 'orchestration');
  });

  await test('（1.capability chaining）requestCapabilityFlow()的request物件不會被修改（沒有side effect）', () => {
    const orchestrator = createCapabilityOrchestrator(makeRealCapabilities());
    const request = { context: makeInsightContext(), options: { b: 2 } };
    const requestCopy = JSON.parse(JSON.stringify(request));
    orchestrator.requestCapabilityFlow(request);
    assert.deepStrictEqual(request, requestCopy);
  });

  console.log('');

  // =========================================================================
  // B. analysis integration
  // =========================================================================
  console.log('--- B. analysis integration ---');

  await test('（2.analysis integration）端對端：真實的Analysis Capability確實有被Capability Orchestrator觸發（透過spy驗證）', () => {
    let analysisCalled = false;
    const real = makeRealCapabilities();
    const spyAnalysis = { requestAnalysis: (...args) => { analysisCalled = true; return real.analysisCapability.requestAnalysis(...args); } };
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: spyAnalysis, recommendationCapability: real.recommendationCapability });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(analysisCalled, true);
    assert.strictEqual(result.ok, true);
  });

  await test('（2.analysis integration）端對端：context跟options都正確原樣轉交給analysisCapability.requestAnalysis()', () => {
    let received = null;
    const spyAnalysis = { requestAnalysis: (req) => { received = req; return { ok: true, result: makeAnalysisResult() }; } };
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: spyAnalysis, recommendationCapability: { requestRecommendation: () => ({ ok: true, result: {} }) } });
    const context = makeInsightContext();
    const options = { generatedAt: 'x' };
    orchestrator.requestCapabilityFlow({ context, options });
    assert.strictEqual(received.context, context);
    assert.strictEqual(received.options, options);
  });

  await test('（2.analysis integration）端對端：真實Analysis Capability失敗時（例如context缺少必要欄位），Orchestrator正確轉發reason/field並標記stage為analysis', () => {
    const orchestrator = createCapabilityOrchestrator(makeRealCapabilities());
    const result = orchestrator.requestCapabilityFlow({ context: { user: null } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.capability, 'orchestration');
    assert.strictEqual(typeof result.reason, 'string');
    assert.strictEqual(result.stage, 'analysis');
  });

  await test('（2.analysis integration）Analysis Runner本身（analysis_runner.js）本次任務完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.analysis integration）Analysis Capability本身（analysis_capability.js/analysis_capability_result_builder.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/analysis/analysis_capability.js src/intelligence/capabilities/analysis/analysis_capability_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.analysis integration）端對端：注入自訂modules的Analysis Runner（透過真實Analysis Capability），Orchestrator依然正確運作（證明Orchestrator層不關心Analysis Capability內部用哪個Runner/哪組模組）', () => {
    const customAnalysisCapability = createAnalysisCapability({ analysisRunner: createAnalysisRunner({ modules: [() => ({ type: 'custom', value: 1, source: 'x' })] }) });
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: customAnalysisCapability, recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }) });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.analysis.insights, [{ type: 'custom', value: 1, source: 'x' }]);
  });

  await test('（2.analysis integration）端對端：真實Analysis Capability成功時，Unified Result的analysis欄位insights陣列恰好6筆（DEFAULT_ANALYSIS_MODULES數量）', () => {
    const orchestrator = createCapabilityOrchestrator(makeRealCapabilities());
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.analysis.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（2.analysis integration）端對端：不同的InsightContext輸入都能正確走完Orchestrator→Analysis Capability這一段', () => {
    const orchestrator = createCapabilityOrchestrator(makeRealCapabilities());
    for (const overrides of [{}, { activityContext: { count: 10, items: [] } }, { metadata: { totalRecords: 99 } }]) {
      const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext(overrides) });
      assert.strictEqual(result.ok, true);
    }
  });

  console.log('');

  // =========================================================================
  // C. recommendation integration
  // =========================================================================
  console.log('--- C. recommendation integration ---');

  await test('（3.recommendation integration）端對端：真實的Recommendation Capability確實有被Capability Orchestrator觸發（透過spy驗證）', () => {
    let recommendationCalled = false;
    const real = makeRealCapabilities();
    const spyRecommendation = { requestRecommendation: (...args) => { recommendationCalled = true; return real.recommendationCapability.requestRecommendation(...args); } };
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: real.analysisCapability, recommendationCapability: spyRecommendation });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(recommendationCalled, true);
    assert.strictEqual(result.ok, true);
  });

  await test('（3.recommendation integration）端對端：Analysis Capability的result正確地被包成{analysisResult}轉交給recommendationCapability.requestRecommendation()', () => {
    let received = null;
    const analysisResult = makeAnalysisResult();
    const spyAnalysis = { requestAnalysis: () => ({ ok: true, result: analysisResult }) };
    const spyRecommendation = { requestRecommendation: (req) => { received = req; return { ok: true, result: {} }; } };
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: spyAnalysis, recommendationCapability: spyRecommendation });
    orchestrator.requestCapabilityFlow({ context: {} });
    assert.deepStrictEqual(received, { analysisResult });
  });

  await test('（3.recommendation integration）端對端：真實Recommendation Capability失敗時，Orchestrator正確轉發reason/field並標記stage為recommendation', () => {
    const spyAnalysis = { requestAnalysis: () => ({ ok: true, result: { status: 'x' } }) };
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: spyAnalysis, recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }) });
    const result = orchestrator.requestCapabilityFlow({ context: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stage, 'recommendation');
    assert.strictEqual(result.field, 'insights');
  });

  await test('（3.recommendation integration）Recommendation Runner本身（recommendation_runner.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.recommendation integration）Recommendation Capability本身（recommendation_capability.js/recommendation_capability_result_builder.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/recommendation/recommendation_capability.js src/intelligence/capabilities/recommendation/recommendation_capability_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.recommendation integration）端對端：注入自訂modules的Recommendation Runner（透過真實Recommendation Capability），Orchestrator依然正確運作', () => {
    const customRecommendationCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner({ modules: [() => ({ type: 'only-custom', value: 1, source: 'b' })] }) });
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }), recommendationCapability: customRecommendationCapability });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.recommendation.recommendations, [{ type: 'only-custom', value: 1, source: 'b' }]);
  });

  await test('（3.recommendation integration）端對端：真實Recommendation Capability成功時，Unified Result的recommendation欄位recommendations陣列恰好3筆（DEFAULT_RECOMMENDATION_MODULES數量）', () => {
    const orchestrator = createCapabilityOrchestrator(makeRealCapabilities());
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.recommendation.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（3.recommendation integration）端對端：recommendation的insight_count恰好反映analysis產生的insights陣列長度（兩段真的有串接，不是各自獨立跑）', () => {
    const orchestrator = createCapabilityOrchestrator(makeRealCapabilities());
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    const insightCount = result.result.recommendation.recommendations.find((r) => r.type === 'insight_count');
    assert.strictEqual(insightCount.value, result.result.analysis.insights.length);
  });

  console.log('');

  // =========================================================================
  // D. result compatibility
  // =========================================================================
  console.log('--- D. result compatibility ---');

  await test('（4.result compatibility）buildSuccessResult()保留Analysis Result跟Recommendation Result原本的形狀，組成{analysis, recommendation}nested結構，不重新拆開組裝', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    const analysisResult = makeAnalysisResult();
    const recommendationResult = { status: 'recommendation_ready', recommendations: [], metadata: { version: '1.0.0' } };
    const result = builder.buildSuccessResult(analysisResult, recommendationResult);
    assert.deepStrictEqual(result, { ok: true, capability: 'orchestration', result: { analysis: analysisResult, recommendation: recommendationResult } });
  });

  await test('（4.result compatibility）buildSuccessResult()的result.analysis/result.recommendation參照跟傳入的參數完全相同（不做深拷貝）', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    const analysisResult = makeAnalysisResult();
    const recommendationResult = { status: 'x', recommendations: [], metadata: {} };
    const result = builder.buildSuccessResult(analysisResult, recommendationResult);
    assert.strictEqual(result.result.analysis, analysisResult);
    assert.strictEqual(result.result.recommendation, recommendationResult);
  });

  await test('（4.result compatibility）buildSuccessResult(undefined, undefined)安全正規化為{analysis:{}, recommendation:{}}，不拋出例外', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    assert.doesNotThrow(() => builder.buildSuccessResult(undefined, undefined));
    assert.deepStrictEqual(builder.buildSuccessResult(undefined, undefined), { ok: true, capability: 'orchestration', result: { analysis: {}, recommendation: {} } });
  });

  await test('（4.result compatibility）buildSuccessResult(null, null)安全正規化為{analysis:{}, recommendation:{}}', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    assert.deepStrictEqual(builder.buildSuccessResult(null, null), { ok: true, capability: 'orchestration', result: { analysis: {}, recommendation: {} } });
  });

  await test('（4.result compatibility）buildFailureResult(reason)不提供field/stage時，回傳物件不含field/stage欄位', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    const result = builder.buildFailureResult('invalid_context');
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'reason']);
  });

  await test('（4.result compatibility）buildFailureResult(reason, field)提供field不提供stage時，回傳物件包含field但不含stage', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    const result = builder.buildFailureResult('invalid_field_type', 'status');
    assert.deepStrictEqual(result, { ok: false, capability: 'orchestration', reason: 'invalid_field_type', field: 'status' });
  });

  await test('（4.result compatibility）buildFailureResult(reason, field, stage)三者都提供時，回傳物件包含全部四個欄位', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    const result = builder.buildFailureResult('invalid_field_type', 'insights', 'recommendation');
    assert.deepStrictEqual(result, { ok: false, capability: 'orchestration', reason: 'invalid_field_type', field: 'insights', stage: 'recommendation' });
  });

  await test('（4.result compatibility）buildFailureResult(reason, undefined, stage)只提供stage不提供field時，回傳物件包含stage但不含field', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    const result = builder.buildFailureResult('x', undefined, 'analysis');
    assert.deepStrictEqual(result, { ok: false, capability: 'orchestration', reason: 'x', stage: 'analysis' });
  });

  await test('（4.result compatibility）buildFailureResult(非字串reason)安全正規化為unknown_error', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(123), { ok: false, capability: 'orchestration', reason: 'unknown_error' });
    assert.deepStrictEqual(builder.buildFailureResult(undefined), { ok: false, capability: 'orchestration', reason: 'unknown_error' });
  });

  await test('（4.result compatibility）buildFailureResult(reason, 非字串field)忽略非法field，不加入field欄位', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    const result = builder.buildFailureResult('x', 123);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'field'), false);
  });

  await test('（4.result compatibility）buildFailureResult(reason, field, 非字串stage)忽略非法stage，不加入stage欄位', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    const result = builder.buildFailureResult('x', 'y', 123);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'stage'), false);
  });

  await test('（4.result compatibility）buildFailureResult(reason, 空字串field, 空字串stage)忽略空字串，不加入field/stage欄位', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    const result = builder.buildFailureResult('x', '', '');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'field'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'stage'), false);
  });

  await test('（4.result compatibility）是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const builder = createCapabilityOrchestratorResultBuilder();
    const analysisResult = makeAnalysisResult();
    const recommendationResult = { status: 'x', recommendations: [], metadata: {} };
    assert.deepStrictEqual(builder.buildSuccessResult(analysisResult, recommendationResult), builder.buildSuccessResult(analysisResult, recommendationResult));
  });

  await test('（4.result compatibility）capability_result_builder.js完全沒有呼叫Date.now()/Math.random()', () => {
    const src = readSrc(path.join(orchestrationCapabilityDir, 'capability_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（4.result compatibility）不同的Capability Orchestrator Result Builder實例各自獨立（不是共用singleton）', () => {
    const builderA = createCapabilityOrchestratorResultBuilder();
    const builderB = createCapabilityOrchestratorResultBuilder();
    assert.notStrictEqual(builderA, builderB);
  });

  await test('（4.result compatibility）createCapabilityOrchestratorResultBuilder(任何參數)都回傳相同介面（不接受依賴注入）', () => {
    const builderA = createCapabilityOrchestratorResultBuilder();
    const builderB = createCapabilityOrchestratorResultBuilder({ ignored: 'value' });
    assert.deepStrictEqual(Object.keys(builderA), Object.keys(builderB));
  });

  await test('（4.result compatibility）result_builder跟Analysis/Recommendation版本（TASK1.76/1.77）是完全獨立的三個模組（不共用同一份程式碼、不互相import）', () => {
    const src = readSrc(path.join(orchestrationCapabilityDir, 'capability_result_builder.js'));
    assert.ok(!/analysis_capability_result_builder/.test(src));
    assert.ok(!/recommendation_capability_result_builder/.test(src));
  });

  console.log('');

  // =========================================================================
  // E. feature isolation
  // =========================================================================
  console.log('--- E. feature isolation ---');

  for (const file of ORCHESTRATION_CAPABILITY_JS_FILES) {
    await test(`（5.feature isolation）capabilities/orchestration/${file} 完全不import src/intelligence/application/（不認識Phase 3 Application Layer的存在）`, () => {
      assert.ok(!/from\s+['"].*\/application\//.test(readSrc(path.join(orchestrationCapabilityDir, file))));
    });
    await test(`（5.feature isolation）capabilities/orchestration/${file} 完全不出現INSIGHT_DOMAIN/BEHAVIOR_DOMAIN/insightFeature/behaviorFeature等既有Feature domain識別字樣`, () => {
      const src = readSrc(path.join(orchestrationCapabilityDir, file));
      assert.ok(!/INSIGHT_DOMAIN/.test(src));
      assert.ok(!/BEHAVIOR_DOMAIN/.test(src));
      assert.ok(!/insightFeature/.test(src));
      assert.ok(!/behaviorFeature/.test(src));
    });
    await test(`（5.feature isolation）capabilities/orchestration/${file} 完全不import features/insight/或features/behavior/`, () => {
      const src = readSrc(path.join(orchestrationCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/insight\//.test(src));
      assert.ok(!/from\s+['"].*\/behavior\//.test(src));
    });
    await test(`（5.feature isolation）capabilities/orchestration/${file} 完全不import application/use_cases/、application/workflows/`, () => {
      const src = readSrc(path.join(orchestrationCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/use_cases\//.test(src));
      assert.ok(!/from\s+['"].*\/workflows\//.test(src));
    });
    await test(`（5.feature isolation）capabilities/orchestration/${file} 完全不import capabilities/analysis/或capabilities/recommendation/（Orchestrator透過依賴注入拿到Capability實例，不import對方的實作檔案）`, () => {
      const src = readSrc(path.join(orchestrationCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
    });
  }

  await test('（5.feature isolation）Insight專屬檔案（capabilities/insight_capability.js、use_cases/insight_use_case.js、features/insight_feature.js、features/insight/整條樹）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/capabilities/insight_capability.js src/intelligence/application/use_cases/insight_use_case.js src/intelligence/application/features/insight_feature.js src/intelligence/application/features/insight/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.feature isolation）Behavior專屬檔案（features/behavior/整條樹）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/features/behavior/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.feature isolation）application/features/index.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/features/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.feature isolation）application/index.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.feature isolation）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有被修改（git diff確認，Phase 3 Application Pattern維持不變）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.feature isolation）src/bootstrap/application.js本次任務完全沒有被修改（Capability Orchestrator沒有接進既有intelligence物件）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.feature isolation）app.intelligence物件恰好維持24個欄位不變（本次任務沒有新增任何bootstrap欄位，Capability Orchestrator是獨立extension point）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（5.feature isolation）端對端：Insight跟Behavior兩個既有Feature在本次任務後依然成功運作（未受Capability Orchestrator新增影響）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  await test('（5.feature isolation）Analysis Capability（TASK1.76）跟Recommendation Capability（TASK1.77）目錄樹本次任務完全沒有被修改（git diff確認，三個Capability互不影響）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.feature isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/，TASK1.45）本次任務完全沒有被修改（規格明確禁止修改Phase 2 Orchestrator）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // F. runtime isolation
  // =========================================================================
  console.log('--- F. runtime isolation ---');

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring'];
  for (const file of ORCHESTRATION_CAPABILITY_JS_FILES) {
    await test(`（6.runtime isolation）capabilities/orchestration/${file} 完全不import src/intelligence/execution/（Execution Manager）`, () => {
      const src = readSrc(path.join(orchestrationCapabilityDir, file));
      const executionManagerDir = path.join(intelDir, 'execution');
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        const resolved = path.normalize(path.join(orchestrationCapabilityDir, imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir);
      }
    });
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（6.runtime isolation）capabilities/orchestration/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(readSrc(path.join(orchestrationCapabilityDir, file))));
      });
    }
    for (const varName of ['executionManager', 'historyStore', 'metricsStore', 'eventDispatcher', 'governanceService']) {
      await test(`（6.runtime isolation）capabilities/orchestration/${file} 完全不出現${varName}變數名稱（規格額外明確禁止Orchestrator直接操作event dispatcher）`, () => {
        assert.ok(!new RegExp(varName).test(readSrc(path.join(orchestrationCapabilityDir, file))));
      });
    }
  }

  await test('（6.runtime isolation）Runtime Execution Layer（execution/、service/、orchestration/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/execution/ src/intelligence/service/ src/intelligence/orchestration/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // G. dependency scan
  // =========================================================================
  console.log('--- G. dependency scan ---');

  for (const file of ORCHESTRATION_CAPABILITY_JS_FILES) {
    await test(`（7.dependency scan）capabilities/orchestration/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(orchestrationCapabilityDir, file))));
    });
    for (const pattern of [/db\.prepare\(/, /\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i, /DIET_COACH_DB/]) {
      await test(`（7.dependency scan）capabilities/orchestration/${file} 不含資料庫關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(readSrc(path.join(orchestrationCapabilityDir, file))));
      });
    }
    await test(`（7.dependency scan）capabilities/orchestration/${file} 完全不出現db變數名稱（Capability Orchestrator完全不知道db是什麼，甚至不接受db作為參數）`, () => {
      assert.ok(!/\bdb\b/.test(readSrc(path.join(orchestrationCapabilityDir, file))));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（7.dependency scan）capabilities/orchestration/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(readSrc(path.join(orchestrationCapabilityDir, file))));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i, /\buserId\b/]) {
      await test(`（7.dependency scan）capabilities/orchestration/${file} 不含身分相關字樣 ${pattern}（不接受身分相關參數）`, () => {
        assert.ok(!pattern.test(readSrc(path.join(orchestrationCapabilityDir, file))));
      });
    }
    for (const fn of ['requireAuth(', 'requireActiveUser(', 'getCurrentUser(']) {
      await test(`（7.dependency scan）capabilities/orchestration/${file} 完全不呼叫${fn.replace('(', '()')}`, () => {
        assert.ok(!readSrc(path.join(orchestrationCapabilityDir, file)).includes(fn));
      });
    }
    await test(`（7.dependency scan）capabilities/orchestration/${file} 裡所有import都是相對路徑（完全不import任何非相對路徑的外部套件）`, () => {
      const imports = [...readSrc(path.join(orchestrationCapabilityDir, file)).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file}import了非相對路徑的外部套件：${imp}`);
      }
    });
    await test(`（7.dependency scan）capabilities/orchestration/${file} 完全不import src/services/（既有Domain Service）`, () => {
      assert.ok(!/from\s+['"].*\/services\//.test(readSrc(path.join(orchestrationCapabilityDir, file))));
    });
    await test(`（7.dependency scan）capabilities/orchestration/${file} 完全不呼叫setTimeout()/setInterval()（沒有非同步排程邏輯）`, () => {
      const src = readSrc(path.join(orchestrationCapabilityDir, file));
      assert.ok(!/setTimeout\(/.test(src));
      assert.ok(!/setInterval\(/.test(src));
    });
  }

  await test('（7.dependency scan）capabilities/orchestration/整個目錄樹沒有任何檔案import src/intelligence/runtime/', () => {
    for (const file of ORCHESTRATION_CAPABILITY_JS_FILES) {
      assert.ok(!/from\s+['"].*\/runtime\//.test(readSrc(path.join(orchestrationCapabilityDir, file))));
    }
  });

  await test('（7.dependency scan）capabilities/orchestration/整個目錄樹沒有任何檔案import src/intelligence/contracts.js或src/intelligence/contracts/', () => {
    for (const file of ORCHESTRATION_CAPABILITY_JS_FILES) {
      const src = readSrc(path.join(orchestrationCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/contracts/.test(src));
    }
  });

  console.log('');

  // =========================================================================
  // H. export consistency
  // =========================================================================
  console.log('--- H. export consistency ---');

  await test('（8.export consistency）capabilities/orchestration/index.js完整re-export了兩個具名函式（createCapabilityOrchestrator/createCapabilityOrchestratorResultBuilder），沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(orchestrationCapabilityDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createCapabilityOrchestrator', 'createCapabilityOrchestratorResultBuilder']);
  });

  await test('（8.export consistency）capabilities/orchestration/index.js re-export的名稱在對應來源檔案裡確實存在', () => {
    const indexSrc = readSrc(path.join(orchestrationCapabilityDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(orchestrationCapabilityDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（8.export consistency）src/intelligence/capabilities/index.js（頂層）同時包含analysis/recommendation/orchestration三個namespace', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['analysis', 'orchestration', 'recommendation']);
  });

  await test('（8.export consistency）import後，capabilitiesModule.orchestration是非空物件，具備createCapabilityOrchestrator/createCapabilityOrchestratorResultBuilder', async () => {
    const capabilitiesModule = await import(path.join(capabilitiesDir, 'index.js'));
    assert.strictEqual(typeof capabilitiesModule.orchestration.createCapabilityOrchestrator, 'function');
    assert.strictEqual(typeof capabilitiesModule.orchestration.createCapabilityOrchestratorResultBuilder, 'function');
  });

  await test('（8.export consistency）import後，capabilitiesModule.analysis/capabilitiesModule.recommendation依然完好（TASK1.76/1.77沒有被本次修改影響）', async () => {
    const capabilitiesModule = await import(path.join(capabilitiesDir, 'index.js'));
    assert.strictEqual(typeof capabilitiesModule.analysis.createAnalysisCapability, 'function');
    assert.strictEqual(typeof capabilitiesModule.recommendation.createRecommendationCapability, 'function');
  });

  await test('（8.export consistency）src/intelligence/index.js有export * as capabilities from ./capabilities/index.js（本次沒有新增/修改這一行，TASK1.76已建立）', () => {
    const src = readSrc(path.join(intelDir, 'index.js'));
    assert.ok(/export \* as capabilities from ['"]\.\/capabilities\/index\.js['"]/.test(src));
  });

  await test('（8.export consistency）src/intelligence/index.js本次任務完全沒有被修改（頂層capabilities namespace是TASK1.76已建立的，本次只新增nested的orchestration子目錄）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.export consistency）import後，intelModule.capabilities.orchestration可以正確運作端對端流程（結合真實的analysis/recommendation namespace建構Capability實例）', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    const orchestrator = intelModule.capabilities.orchestration.createCapabilityOrchestrator({
      analysisCapability: intelModule.capabilities.analysis.createAnalysisCapability({ analysisRunner: intelModule.analysis.createAnalysisRunner() }),
      recommendationCapability: intelModule.capabilities.recommendation.createRecommendationCapability({ recommendationRunner: intelModule.recommendation.createRecommendationRunner() }),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.export consistency）src/intelligence/index.js跟application/index.js各自的capabilities namespace互不污染（頂層capabilities.orchestration跟application.capabilities.createInsightCapability是不同的東西）', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    assert.strictEqual(typeof intelModule.capabilities.createInsightCapability, 'undefined');
    assert.strictEqual(typeof intelModule.application.capabilities.createInsightCapability, 'function');
    assert.strictEqual(typeof intelModule.application.capabilities.createCapabilityOrchestrator, 'undefined');
  });

  await test('（8.export consistency）頂層capabilities.analysis/recommendation/orchestration是三個完全不同、互不覆蓋的namespace（各自具備獨立的create函式）', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    assert.strictEqual(typeof intelModule.capabilities.analysis.createAnalysisCapability, 'function');
    assert.strictEqual(typeof intelModule.capabilities.recommendation.createRecommendationCapability, 'function');
    assert.strictEqual(typeof intelModule.capabilities.orchestration.createCapabilityOrchestrator, 'function');
    assert.strictEqual(typeof intelModule.capabilities.analysis.createCapabilityOrchestrator, 'undefined');
    assert.strictEqual(typeof intelModule.capabilities.recommendation.createCapabilityOrchestrator, 'undefined');
    assert.strictEqual(typeof intelModule.capabilities.orchestration.createAnalysisCapability, 'undefined');
    assert.strictEqual(typeof intelModule.capabilities.orchestration.createRecommendationCapability, 'undefined');
  });

  await test('（8.export consistency）capabilities/orchestration/index.js唯一的相對路徑import是./capability_orchestrator.js跟./capability_result_builder.js', () => {
    const src = readSrc(path.join(orchestrationCapabilityDir, 'index.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports.sort(), ['./capability_orchestrator.js', './capability_result_builder.js']);
  });

  await test('（8.export consistency）capability_orchestrator.js唯一的相對路徑import是./capability_result_builder.js', () => {
    const src = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./capability_result_builder.js']);
  });

  await test('（8.export consistency）capability_result_builder.js完全零相依（沒有任何import）', () => {
    const src = readSrc(path.join(orchestrationCapabilityDir, 'capability_result_builder.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（8.export consistency）src/intelligence/capabilities/index.js的相對路徑import包含./analysis/index.js、./recommendation/index.js、./orchestration/index.js三個', () => {
    const src = readSrc(path.join(capabilitiesDir, 'index.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports.sort(), ['./analysis/index.js', './orchestration/index.js', './recommendation/index.js']);
  });

  console.log('');

  // =========================================================================
  // I. no AI dependency
  // =========================================================================
  console.log('--- I. no AI dependency ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of ORCHESTRATION_CAPABILITY_JS_FILES) {
    const codeOnly = readSrc(path.join(orchestrationCapabilityDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（9.no AI dependency）capabilities/orchestration/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（9.no AI dependency）capabilities/orchestration/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
  }

  await test('（9.no AI dependency）wrangler.toml完全沒有新增任何AI相關的環境變數/binding（本次任務沒有啟用AI Provider）', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（9.no AI dependency）capability_orchestrator.js完全不出現score/confidence相關的計算邏輯（不解讀分析結果的業務內容，也不計算任何新的分數）', () => {
    const src = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
    assert.ok(!/\.score\s*=/.test(src));
    assert.ok(!/\.confidence\s*=/.test(src));
  });

  await test('（9.no AI dependency）capability_orchestrator.js完全不出現任何自然語言/教練語氣字樣（建議你/應該/推薦您）', () => {
    const src = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
    assert.ok(!/建議你/.test(src));
    assert.ok(!/應該/.test(src));
    assert.ok(!/推薦您/.test(src));
  });

  await test('（9.no AI dependency）capability_orchestrator.js/capability_result_builder.js完全不呼叫Date.now()/Math.random()（deterministic）', () => {
    for (const file of ['capability_orchestrator.js', 'capability_result_builder.js']) {
      const src = readSrc(path.join(orchestrationCapabilityDir, file));
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    }
  });

  await test('（9.no AI dependency）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（9.no AI dependency）package.json完全沒有新增任何AI SDK依賴', () => {
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
  // J. regression check
  // =========================================================================
  console.log('--- J. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（10.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.78-capability-orchestration')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（10.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 68, `預期至少68個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（10.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

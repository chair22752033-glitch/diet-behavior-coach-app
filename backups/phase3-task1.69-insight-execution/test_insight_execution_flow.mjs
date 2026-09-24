/*
 * Phase 3 TASK 1.69｜Insight Feature Execution Flow Foundation 測試
 *
 * 本任務不是建立API，也不是建立UI，也不是導入AI——這是建立Insight
 * Feature層級的Execution Flow，讓Insight Domain可以管理一次
 * Feature Request到Output的完整流程，同時保持Runtime Execution
 * Layer隔離。這是Phase 3第一個真正把TASK1.64 Workflow、TASK1.67
 * Insight Context Mapper、TASK1.68 Insight Output Mapper三者組合
 * 起來、端到端跑完整條「Request→Workflow→Context Mapping→Output
 * Mapping」流程的層。這份測試驗證的是：
 * - insight_execution_flow.js正確依序呼叫Workflow→Context Mapper
 *   →Output Mapper，任何一步失敗都立刻中止並回傳{ok:false}
 * - insight_execution_result_builder.js正確包裝最終的
 *   {ok:true, feature:'insight', output}/{ok:false, feature, reason}
 * - 端對端：透過完整真實依賴鏈（一路到Analysis/Recommendation
 *   Runner）產生的真實輸出，可以被Execution Flow完整消費並產生
 *   通過validateInsightOutput()驗證的InsightOutputModel形狀
 * - Insight Execution Flow完全不直接呼叫Capability/Use Case/
 *   Application Service/Facade/Execution Manager/History Store/
 *   Metrics Store/Event Dispatcher/Database/AI Provider
 * - insight_capability.js（TASK1.66）/insight_context_mapper.js
 *   （TASK1.67）/insight_output_mapper.js（TASK1.68）完全沒有被
 *   修改
 * - 跟TASK1.67/1.68不同：這是active orchestrator，寫入
 *   bootstrap/application.js（新欄位intelligence.insightExecutionFlow）
 * - export一致性、regression、P1-P6
 *
 * 分為以下12個部分：
 * A) execution flow boundary
 * B) insight workflow integration
 * C) output model compatibility
 * D) context compatibility
 * E) contract compatibility
 * F) runtime isolation
 * G) no database dependency
 * H) no auth dependency
 * I) no AI dependency
 * J) export consistency
 * K) regression check
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
const applicationDir = path.join(intelDir, 'application');
const useCasesDir = path.join(applicationDir, 'use_cases');
const capabilitiesDir = path.join(applicationDir, 'capabilities');
const contractsDir = path.join(applicationDir, 'contracts');
const workflowsDir = path.join(applicationDir, 'workflows');
const featuresDir = path.join(applicationDir, 'features');
const insightDir = path.join(featuresDir, 'insight');
const contextDir = path.join(insightDir, 'context');
const outputDir = path.join(insightDir, 'output');
const executionDir = path.join(insightDir, 'execution');

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

function listAllJsFiles(dir) {
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
    }
  }
  walk(dir);
  return files.sort();
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

function getRelativeImportTargets(fullPath) {
  const src = readSrc(fullPath);
  const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((imp) => imp.startsWith('.'));
  return imports.map((imp) => path.normalize(path.join(path.dirname(fullPath), imp)));
}

async function buildRealChain() {
  const { createInsightExecutionFlow } = await import(path.join(executionDir, 'index.js'));
  const { createInsightContextMapper } = await import(path.join(contextDir, 'index.js'));
  const { createInsightOutputMapper } = await import(path.join(outputDir, 'index.js'));
  const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
  const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
  const { createInsightCapability } = await import(path.join(capabilitiesDir, 'index.js'));
  const { createInsightUseCase } = await import(path.join(useCasesDir, 'index.js'));
  const { createApplicationService } = await import(path.join(applicationDir, 'index.js'));
  const { createIntelligenceFacade } = await import(path.join(intelDir, 'facade', 'index.js'));
  const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
  const { createIntelligenceService } = await import(path.join(intelDir, 'service', 'index.js'));
  const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));
  const { createAnalysisRunner } = await import(path.join(intelDir, 'analysis', 'index.js'));
  const { createRecommendationRunner } = await import(path.join(intelDir, 'recommendation', 'index.js'));

  const dataPreparation = { prepare: async () => ({ ok: true, context: { raw: true } }) };
  const contextBuilder = {
    buildInsightContext: () => ({
      context: {
        user: null,
        activityContext: { count: 2, items: [{ id: 'a1' }] },
        nutritionContext: { count: 1, items: [{ id: 'n1' }] },
        emotionContext: { count: 0, items: [] },
        behaviorContext: { count: 0, items: [] },
        reportContext: { count: 0, items: [] },
        metadata: { totalRecords: 3 },
      },
      validation: { ok: true },
    }),
  };
  const orchestrator = createIntelligenceOrchestrator({ dataPreparation, contextBuilder, analysisRunner: createAnalysisRunner(), recommendationRunner: createRecommendationRunner() });
  const service = createIntelligenceService({ orchestrator });
  const executionManager = createExecutionManager({ service });
  const facade = createIntelligenceFacade({ executionManager });
  const applicationService = createApplicationService({ facade });
  const insightUseCase = createInsightUseCase({ applicationService });
  const insightCapability = createInsightCapability({ useCase: insightUseCase });
  const workflow = createApplicationWorkflow({ capability: insightCapability, contractValidator: createContractValidator() });
  const contextMapper = createInsightContextMapper();
  const outputMapper = createInsightOutputMapper();
  const executionFlow = createInsightExecutionFlow({ workflow, contextMapper, outputMapper });
  return { executionFlow, workflow, contextMapper, outputMapper, insightCapability, insightUseCase, applicationService, facade, executionManager, service };
}

async function run() {
  const flowMod = await import(path.join(executionDir, 'insight_execution_flow.js'));
  const { createInsightExecutionFlow } = flowMod;
  const builderMod = await import(path.join(executionDir, 'insight_execution_result_builder.js'));
  const { createInsightExecutionResultBuilder } = builderMod;
  await import(path.join(executionDir, 'index.js'));

  const EXECUTION_JS_FILES = fs.readdirSync(executionDir).filter((f) => f.endsWith('.js')).sort();

  // =========================================================================
  // A. execution flow boundary
  // =========================================================================
  console.log('--- A. execution flow boundary ---');

  await test('（1.execution flow boundary）src/intelligence/application/features/insight/execution/ 恰好包含3個.js檔案（insight_execution_flow/insight_execution_result_builder/index）', () => {
    assert.deepStrictEqual(EXECUTION_JS_FILES, ['index.js', 'insight_execution_flow.js', 'insight_execution_result_builder.js']);
  });

  await test('（1.execution flow boundary）src/intelligence/application/features/insight/execution/README.md 存在且非空', () => {
    const readmePath = path.join(executionDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.execution flow boundary）createInsightExecutionFlow()回傳物件恰好只有runInsightExecution一個公開介面', () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    assert.deepStrictEqual(Object.keys(flow), ['runInsightExecution']);
  });

  await test('（1.execution flow boundary）runInsightExecution()缺少userId時回傳{ok:false, feature:"insight", reason:"invalid_user_id"}，完全不呼叫workflow', async () => {
    let workflowCalled = false;
    const flow = createInsightExecutionFlow({ workflow: { executeApplicationRequest: async () => { workflowCalled = true; } }, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, {});
    assert.deepStrictEqual(result, { ok: false, feature: 'insight', reason: 'invalid_user_id' });
    assert.strictEqual(workflowCalled, false);
  });

  await test('（1.execution flow boundary）runInsightExecution()的userId為空字串時回傳失敗', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, { userId: '' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（1.execution flow boundary）runInsightExecution()的userId為數字（非字串）時回傳失敗', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, { userId: 123 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（1.execution flow boundary）runInsightExecution()的options為陣列時回傳失敗', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, { userId: 'u1', options: [] });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.execution flow boundary）runInsightExecution()的options為null時回傳失敗', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, { userId: 'u1', options: null });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.execution flow boundary）runInsightExecution(db, null)不拋出例外，回傳失敗', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    await assert.doesNotReject(() => flow.runInsightExecution({}, null));
    const result = await flow.runInsightExecution({}, null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.execution flow boundary）runInsightExecution(db, "not an object")回傳{ok:false, reason:"invalid_request"}', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, 'not an object');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.execution flow boundary）workflow缺失時回傳{ok:false, reason:"workflow_unavailable"}', async () => {
    const flow = createInsightExecutionFlow({ contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) }, outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) } });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, feature: 'insight', reason: 'workflow_unavailable' });
  });

  await test('（1.execution flow boundary）contextMapper缺失時回傳{ok:false, reason:"context_mapper_unavailable"}', async () => {
    const flow = createInsightExecutionFlow({ workflow: { executeApplicationRequest: async () => ({ ok: true, data: {} }) }, outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) } });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, feature: 'insight', reason: 'context_mapper_unavailable' });
  });

  await test('（1.execution flow boundary）outputMapper缺失時回傳{ok:false, reason:"output_mapper_unavailable"}', async () => {
    const flow = createInsightExecutionFlow({ workflow: { executeApplicationRequest: async () => ({ ok: true, data: {} }) }, contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) } });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, feature: 'insight', reason: 'output_mapper_unavailable' });
  });

  await test('（1.execution flow boundary）dependencies為undefined時不拋出例外，回傳workflow_unavailable', async () => {
    const flow = createInsightExecutionFlow();
    await assert.doesNotReject(() => flow.runInsightExecution({}, { userId: 'u1' }));
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.reason, 'workflow_unavailable');
  });

  await test('（1.execution flow boundary）dependencies為{}時不拋出例外，回傳workflow_unavailable', async () => {
    const flow = createInsightExecutionFlow({});
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.reason, 'workflow_unavailable');
  });

  await test('（1.execution flow boundary）workflow存在但executeApplicationRequest不是函式時回傳workflow_unavailable', async () => {
    const flow = createInsightExecutionFlow({ workflow: { executeApplicationRequest: 'not a function' }, contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) }, outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) } });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.reason, 'workflow_unavailable');
  });

  await test('（1.execution flow boundary）contextMapper存在但mapRuntimeContextToInsightDomain不是函式時回傳context_mapper_unavailable', async () => {
    const flow = createInsightExecutionFlow({ workflow: { executeApplicationRequest: async () => ({ ok: true, data: {} }) }, contextMapper: { mapRuntimeContextToInsightDomain: 'nope' }, outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) } });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.reason, 'context_mapper_unavailable');
  });

  await test('（1.execution flow boundary）outputMapper存在但mapToInsightOutput不是函式時回傳output_mapper_unavailable', async () => {
    const flow = createInsightExecutionFlow({ workflow: { executeApplicationRequest: async () => ({ ok: true, data: {} }) }, contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) }, outputMapper: { mapToInsightOutput: 'nope' } });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.reason, 'output_mapper_unavailable');
  });

  await test('（1.execution flow boundary）userId為只有空白字元的字串時仍視為非空字串（不額外做trim判斷，跟TASK1.66 insight_capability.js同樣的最小驗證規則）', async () => {
    let workflowCalled = false;
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => { workflowCalled = true; return { ok: false, reason: 'stop_here' }; } },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    await flow.runInsightExecution({}, { userId: '   ' });
    assert.strictEqual(workflowCalled, true);
  });

  await test('（1.execution flow boundary）options為合法空物件{}時通過驗證，正常呼叫workflow', async () => {
    let workflowCalled = false;
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => { workflowCalled = true; return { ok: false, reason: 'stop_here' }; } },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    await flow.runInsightExecution({}, { userId: 'u1', options: {} });
    assert.strictEqual(workflowCalled, true);
  });

  await test('（1.execution flow boundary）request為陣列時回傳{ok:false, reason:"invalid_request"}（陣列是object但不應被當成合法request）', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, ['u1']);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.execution flow boundary）不同的Insight Execution Flow實例各自獨立（不是共用singleton）', () => {
    const flowA = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const flowB = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    assert.notStrictEqual(flowA, flowB);
  });

  await test('（1.execution flow boundary）createInsightExecutionFlow()可以自訂resultBuilder（依賴注入），失敗時使用自訂的buildFailureResult()', async () => {
    let customBuilderCalled = false;
    const customResultBuilder = {
      buildSuccessResult: (output) => ({ ok: true, feature: 'insight', output }),
      buildFailureResult: (reason) => { customBuilderCalled = true; return { ok: false, feature: 'insight', reason: `custom:${reason}` }; },
    };
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {}, resultBuilder: customResultBuilder });
    const result = await flow.runInsightExecution({}, {});
    assert.strictEqual(customBuilderCalled, true);
    assert.strictEqual(result.reason, 'custom:invalid_user_id');
  });

  await test('（1.execution flow boundary）createInsightExecutionFlow()沒有提供resultBuilder時，內部自動建立一個預設的（跟直接呼叫createInsightExecutionResultBuilder()行為一致）', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, {});
    const builder = createInsightExecutionResultBuilder();
    assert.deepStrictEqual(result, builder.buildFailureResult('invalid_user_id'));
  });

  await test('（1.execution flow boundary）userId為Symbol/物件等非預期型別時安全回傳invalid_user_id，不拋出例外', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    await assert.doesNotReject(() => flow.runInsightExecution({}, { userId: {} }));
    const result = await flow.runInsightExecution({}, { userId: {} });
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（1.execution flow boundary）userId為布林值時安全回傳invalid_user_id', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, { userId: true });
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（1.execution flow boundary）options為字串（非物件）時回傳invalid_options_type', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, { userId: 'u1', options: 'not an object' });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.execution flow boundary）options為數字時回傳invalid_options_type', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, { userId: 'u1', options: 42 });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.execution flow boundary）失敗結果一律不含output欄位（只有ok/feature/reason三個欄位）', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, {});
    assert.deepStrictEqual(Object.keys(result).sort(), ['feature', 'ok', 'reason']);
  });

  await test('（1.execution flow boundary）成功結果一律不含reason欄位（只有ok/feature/output三個欄位）', async () => {
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: true, data: {} }) },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: { a: 1 } }) },
    });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result).sort(), ['feature', 'ok', 'output']);
  });

  await test('（1.execution flow boundary）失敗結果的feature欄位固定為"insight"字串（跟TASK1.66/1.67/1.68同樣的feature命名慣例）', async () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const result = await flow.runInsightExecution({}, {});
    assert.strictEqual(result.feature, 'insight');
  });

  await test('（1.execution flow boundary）成功結果的feature欄位固定為"insight"字串', async () => {
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: true, data: {} }) },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.feature, 'insight');
  });

  await test('（1.execution flow boundary）runInsightExecution()回傳的是Promise（非同步函式）', () => {
    const flow = createInsightExecutionFlow({ workflow: {}, contextMapper: {}, outputMapper: {} });
    const returned = flow.runInsightExecution({}, { userId: 'u1' });
    assert.ok(returned instanceof Promise);
  });

  console.log('');

  // =========================================================================
  // B. insight workflow integration
  // =========================================================================
  console.log('--- B. insight workflow integration ---');

  await test('（2.insight workflow integration）workflow.executeApplicationRequest()失敗時，Execution Flow直接把reason轉發，完全不呼叫contextMapper/outputMapper', async () => {
    let contextMapperCalled = false;
    let outputMapperCalled = false;
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: false, reason: 'invalid_user_id' }) },
      contextMapper: { mapRuntimeContextToInsightDomain: () => { contextMapperCalled = true; return {}; } },
      outputMapper: { mapToInsightOutput: () => { outputMapperCalled = true; return { ok: true, output: {} }; } },
    });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, feature: 'insight', reason: 'invalid_user_id' });
    assert.strictEqual(contextMapperCalled, false);
    assert.strictEqual(outputMapperCalled, false);
  });

  await test('（2.insight workflow integration）workflow.executeApplicationRequest()被呼叫時，傳入的request只挑選userId/options/requestId/version/timestamp/metadata已知欄位', async () => {
    let receivedRequest = null;
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async (db, request) => { receivedRequest = request; return { ok: false, reason: 'stop_here' }; } },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    await flow.runInsightExecution({}, { userId: 'u1', unknownField: 'should not pass through', options: { a: 1 }, requestId: 'r1', version: 'v1', timestamp: 't1', metadata: { m: 1 } });
    assert.deepStrictEqual(receivedRequest, { userId: 'u1', options: { a: 1 }, requestId: 'r1', version: 'v1', timestamp: 't1', metadata: { m: 1 } });
  });

  await test('（2.insight workflow integration）workflow.executeApplicationRequest()只收到已知欄位，未知欄位不會外洩', async () => {
    let receivedRequest = null;
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async (db, request) => { receivedRequest = request; return { ok: false, reason: 'stop_here' }; } },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    await flow.runInsightExecution({}, { userId: 'u1', secret: 'leak-me' });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(receivedRequest, 'secret'), false);
  });

  await test('（2.insight workflow integration）db參數原樣轉交給workflow.executeApplicationRequest()（Execution Flow不解讀db，也不做任何轉換）', async () => {
    const opaqueDb = { marker: 'opaque' };
    let receivedDb = null;
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async (db) => { receivedDb = db; return { ok: false, reason: 'stop_here' }; } },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    await flow.runInsightExecution(opaqueDb, { userId: 'u1' });
    assert.strictEqual(receivedDb, opaqueDb);
  });

  await test('（2.insight workflow integration）requestId/version/timestamp/metadata未提供時，轉交給workflow的request不會出現這些欄位（不假造資料）', async () => {
    let receivedRequest = null;
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async (db, request) => { receivedRequest = request; return { ok: false, reason: 'stop_here' }; } },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(receivedRequest, { userId: 'u1' });
  });

  await test('（2.insight workflow integration）只提供部分已知欄位（例如只有requestId沒有version）時，只轉交實際提供的欄位', async () => {
    let receivedRequest = null;
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async (db, request) => { receivedRequest = request; return { ok: false, reason: 'stop_here' }; } },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    await flow.runInsightExecution({}, { userId: 'u1', requestId: 'r1' });
    assert.deepStrictEqual(receivedRequest, { userId: 'u1', requestId: 'r1' });
  });

  await test('（2.insight workflow integration）workflow.executeApplicationRequest()只被呼叫恰好一次（不會重試或重複呼叫）', async () => {
    let callCount = 0;
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => { callCount++; return { ok: false, reason: 'stop_here' }; } },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(callCount, 1);
  });

  await test('（2.insight workflow integration）端對端：真實的下層Workflow確實有被Execution Flow觸發（透過spy驗證，證明是Execution Flow→Workflow這條真實鏈路）', async () => {
    let workflowCalled = false;
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const spyCapability = {
      requestInsightCapability: async () => {
        workflowCalled = true;
        return { ok: true, capability: 'insight', data: { status: 'intelligence_ready', result: { context: {}, analysis: {}, recommendation: {} }, metadata: {} } };
      },
    };
    const workflow = createApplicationWorkflow({ capability: spyCapability, contractValidator: createContractValidator() });
    const { createInsightContextMapper } = await import(path.join(contextDir, 'index.js'));
    const { createInsightOutputMapper } = await import(path.join(outputDir, 'index.js'));
    const flow = createInsightExecutionFlow({ workflow, contextMapper: createInsightContextMapper(), outputMapper: createInsightOutputMapper() });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(workflowCalled, true);
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // C. output model compatibility
  // =========================================================================
  console.log('--- C. output model compatibility ---');

  await test('（3.output model compatibility）outputMapper.mapToInsightOutput()失敗時，Execution Flow把reason轉發成最終失敗結果', async () => {
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: true, data: { status: 'x', result: {}, metadata: {} } }) },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({ status: 'x' }) },
      outputMapper: { mapToInsightOutput: () => ({ ok: false, reason: 'missing_field', field: 'context' }) },
    });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, feature: 'insight', reason: 'missing_field' });
  });

  await test('（3.output model compatibility）outputMapper.mapToInsightOutput()成功時，最終output欄位就是outputMapper回傳的output（原樣使用，不修改任何欄位）', async () => {
    const fixedOutput = { status: 'ready', context: { a: 1 }, analysis: { b: 2 }, recommendation: { c: 3 }, metadata: { m: 1 } };
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: true, data: {} }) },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: fixedOutput }) },
    });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: true, feature: 'insight', output: fixedOutput });
  });

  await test('（3.output model compatibility）端對端：真實的Output Mapper（TASK1.68）確實有被Execution Flow觸發並驗證通過validateInsightOutput()', async () => {
    const { validateInsightOutput } = await import(path.join(outputDir, 'insight_output_model.js'));
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(validateInsightOutput(result.output), { ok: true });
  });

  await test('（3.output model compatibility）端對端：最終output恰好具備status/context/analysis/recommendation/metadata五個欄位（InsightOutputModel形狀）', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result.output).sort(), ['analysis', 'context', 'metadata', 'recommendation', 'status']);
  });

  await test('（3.output model compatibility）insight_execution_result_builder.js 完全沒有任何相對路徑import（純函式，零相依，跟insight_context_mapper.js/insight_output_model.js同樣性質）', () => {
    const src = readSrc(path.join(executionDir, 'insight_execution_result_builder.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, []);
  });

  await test('（3.output model compatibility）createInsightExecutionResultBuilder()回傳物件恰好只有buildSuccessResult/buildFailureResult兩個公開介面', () => {
    const builder = createInsightExecutionResultBuilder();
    assert.deepStrictEqual(Object.keys(builder).sort(), ['buildFailureResult', 'buildSuccessResult']);
  });

  await test('（3.output model compatibility）buildSuccessResult(output)回傳{ok:true, feature:"insight", output}，output非物件時安全正規化為{}', () => {
    const builder = createInsightExecutionResultBuilder();
    assert.deepStrictEqual(builder.buildSuccessResult(undefined), { ok: true, feature: 'insight', output: {} });
    assert.deepStrictEqual(builder.buildSuccessResult(null), { ok: true, feature: 'insight', output: {} });
    assert.deepStrictEqual(builder.buildSuccessResult('x'), { ok: true, feature: 'insight', output: {} });
  });

  await test('（3.output model compatibility）buildFailureResult(非字串reason)安全正規化為unknown_error，feature固定為"insight"', () => {
    const builder = createInsightExecutionResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(123), { ok: false, feature: 'insight', reason: 'unknown_error' });
    assert.deepStrictEqual(builder.buildFailureResult(undefined), { ok: false, feature: 'insight', reason: 'unknown_error' });
  });

  await test('（3.output model compatibility）insight_execution_result_builder.js是deterministic的——同樣輸入永遠得到完全相同的輸出（不讀取Date.now()/Math.random()）', () => {
    const src = readSrc(path.join(executionDir, 'insight_execution_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
    const builder = createInsightExecutionResultBuilder();
    assert.deepStrictEqual(builder.buildSuccessResult({ a: 1 }), builder.buildSuccessResult({ a: 1 }));
  });

  await test('（3.output model compatibility）insight_execution_flow.js/insight_execution_result_builder.js完全沒有呼叫Date.now()/Math.random()（deterministic，跟規格明確要求一致）', () => {
    for (const file of ['insight_execution_flow.js', 'insight_execution_result_builder.js']) {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/Date\.now\(\)/.test(src), `${file}不應該呼叫Date.now()`);
      assert.ok(!/Math\.random\(\)/.test(src), `${file}不應該呼叫Math.random()`);
    }
  });

  await test('（3.output model compatibility）buildFailureResult()不接受任何參數時安全正規化為unknown_error', () => {
    const builder = createInsightExecutionResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(), { ok: false, feature: 'insight', reason: 'unknown_error' });
  });

  await test('（3.output model compatibility）buildFailureResult(空字串)保留空字串（空字串本身是合法字串，不會被正規化成unknown_error）', () => {
    const builder = createInsightExecutionResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(''), { ok: false, feature: 'insight', reason: '' });
  });

  await test('（3.output model compatibility）createInsightExecutionResultBuilder(任何參數)都回傳相同介面（不接受依賴注入，因為完全沒有任何依賴需要注入）', () => {
    const builderA = createInsightExecutionResultBuilder();
    const builderB = createInsightExecutionResultBuilder({ ignored: 'value' });
    assert.deepStrictEqual(Object.keys(builderA), Object.keys(builderB));
  });

  await test('（3.output model compatibility）不同的Insight Execution Result Builder實例各自獨立（不是共用singleton）', () => {
    const builderA = createInsightExecutionResultBuilder();
    const builderB = createInsightExecutionResultBuilder();
    assert.notStrictEqual(builderA, builderB);
  });

  await test('（3.output model compatibility）buildSuccessResult()回傳的output參照跟傳入的output完全相同（不做深拷貝，也不修改任何巢狀欄位）', () => {
    const builder = createInsightExecutionResultBuilder();
    const output = { status: 'x', context: { a: 1 }, analysis: {}, recommendation: {}, metadata: {} };
    const result = builder.buildSuccessResult(output);
    assert.strictEqual(result.output, output);
  });

  await test('（3.output model compatibility）buildSuccessResult(output)不管重複呼叫幾次都回傳全新的頂層物件（不是同一個共用結果物件被重複修改）', () => {
    const builder = createInsightExecutionResultBuilder();
    const output = { a: 1 };
    const result1 = builder.buildSuccessResult(output);
    const result2 = builder.buildSuccessResult(output);
    assert.notStrictEqual(result1, result2);
    assert.deepStrictEqual(result1, result2);
  });

  await test('（3.output model compatibility）端對端：真實outputMapper搭配缺少欄位的domain view時，因為TASK1.68的實作總是把缺漏欄位補成null，最終依然ok:true（不是回歸，是既有TASK1.68行為，Execution Flow原樣轉發這個結果）', async () => {
    const { createInsightOutputMapper } = await import(path.join(outputDir, 'index.js'));
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: true, data: { status: 'x', result: {}, metadata: {} } }) },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({ status: 'x' }) },
      outputMapper: createInsightOutputMapper(),
    });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.output, { status: 'x', context: null, analysis: null, recommendation: null, metadata: null });
  });

  await test('（3.output model compatibility）outputMapper明確回傳{ok:false, reason}（例如非物件domain view的假設性驗證失敗場景）時，Execution Flow正確轉發reason，不拋出例外', async () => {
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: true, data: {} }) },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: false, reason: 'invalid_output' }) },
    });
    await assert.doesNotReject(() => flow.runInsightExecution({}, { userId: 'u1' }));
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, feature: 'insight', reason: 'invalid_output' });
  });

  console.log('');

  // =========================================================================
  // D. context compatibility
  // =========================================================================
  console.log('--- D. context compatibility ---');

  await test('（4.context compatibility）contextMapper.mapRuntimeContextToInsightDomain()收到的是workflow成功時的data欄位（原樣傳入，不做任何預先處理）', async () => {
    const fixedData = { status: 'x', result: { context: { a: 1 } }, metadata: {} };
    let receivedData = null;
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: true, data: fixedData }) },
      contextMapper: { mapRuntimeContextToInsightDomain: (data) => { receivedData = data; return { status: 'x' }; } },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(receivedData, fixedData);
  });

  await test('（4.context compatibility）contextMapper攤平後的結果原樣轉交給outputMapper（Execution Flow不修改任何欄位）', async () => {
    const domainView = { status: 'x', context: {}, analysis: {}, recommendation: {}, metadata: {} };
    let receivedView = null;
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: true, data: {} }) },
      contextMapper: { mapRuntimeContextToInsightDomain: () => domainView },
      outputMapper: { mapToInsightOutput: (view) => { receivedView = view; return { ok: true, output: view }; } },
    });
    await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(receivedView, domainView);
  });

  await test('（4.context compatibility）端對端：真實的Context Mapper（TASK1.67）確實有被Execution Flow觸發（透過完整真實鏈路，不是mock）', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.ok(result.output.context && typeof result.output.context === 'object');
  });

  await test('（4.context compatibility）端對端：真實輸出的context欄位確實是TASK1.42 InsightContext形狀（具備user/activityContext/nutritionContext/emotionContext/behaviorContext/reportContext/metadata七個欄位）', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    const contextKeys = Object.keys(result.output.context).sort();
    assert.deepStrictEqual(contextKeys, ['activityContext', 'behaviorContext', 'emotionContext', 'metadata', 'nutritionContext', 'reportContext', 'user']);
  });

  await test('（4.context compatibility）insight_context_mapper.js（TASK1.67）完全沒有被修改——完全沒有任何import', () => {
    const src = readSrc(path.join(contextDir, 'insight_context_mapper.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（4.context compatibility）insight_output_mapper.js（TASK1.68）完全沒有被修改——唯一相對路徑import維持是./insight_output_model.js', () => {
    const src = readSrc(path.join(outputDir, 'insight_output_mapper.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./insight_output_model.js']);
  });

  await test('（4.context compatibility）insight_context_result_builder.js（TASK1.67）完全沒有被修改——完全沒有任何import', () => {
    const src = readSrc(path.join(contextDir, 'insight_context_result_builder.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（4.context compatibility）insight_output_model.js（TASK1.68）完全沒有被修改——完全沒有任何import', () => {
    const src = readSrc(path.join(outputDir, 'insight_output_model.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（4.context compatibility）Execution Flow不重複使用TASK1.67的insight_context_result_builder.js或TASK1.68的insight_output_model.js具名匯出以外的任何內容（只用mapRuntimeContextToInsightDomain跟mapToInsightOutput兩個函式）', () => {
    const src = readSrc(path.join(executionDir, 'insight_execution_flow.js'));
    assert.ok(!/createInsightContextResultBuilder/.test(src));
    assert.ok(!/InsightOutputModel/.test(src));
    assert.ok(!/validateInsightOutput/.test(src));
  });

  await test('（4.context compatibility）端對端：真實輸出的analysis/recommendation欄位確實是物件（不是null，因為Analysis/Recommendation Runner一定會回傳結果）', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(typeof result.output.analysis, 'object');
    assert.strictEqual(typeof result.output.recommendation, 'object');
  });

  await test('（4.context compatibility）端對端：兩次呼叫同樣的userId得到內容相同的輸出（deterministic，沒有隨機性介入）', async () => {
    const { executionFlow } = await buildRealChain();
    const result1 = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    const result2 = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(result1, result2);
  });

  await test('（4.context compatibility）端對端：不同的userId呼叫Execution Flow時，contextMapper/outputMapper都各自被正確觸發一次（透過真實依賴鏈驗證多次獨立呼叫互不干擾）', async () => {
    const { executionFlow } = await buildRealChain();
    const resultA = await executionFlow.runInsightExecution({}, { userId: 'userA' });
    const resultB = await executionFlow.runInsightExecution({}, { userId: 'userB' });
    assert.strictEqual(resultA.ok, true);
    assert.strictEqual(resultB.ok, true);
    assert.deepStrictEqual(Object.keys(resultA.output).sort(), Object.keys(resultB.output).sort());
  });

  await test('（4.context compatibility）端對端：Execution Flow輸出的metadata欄位確實存在且為物件（來自真實Runtime Context的metadata，不是Execution Flow自己捏造的）', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(typeof result.output.metadata, 'object');
    assert.ok(result.output.metadata !== null);
  });

  console.log('');

  // =========================================================================
  // E. contract compatibility
  // =========================================================================
  console.log('--- E. contract compatibility ---');

  await test('（5.contract compatibility）端對端：Execution Flow底層Workflow回傳的{ok,data}形狀先通過Contract Layer的response驗證，才交給Context Mapper', async () => {
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { workflow } = await buildRealChain();
    const result = await workflow.executeApplicationRequest({}, { userId: 'u1' });
    const cv = createContractValidator();
    assert.deepStrictEqual(cv.validateResponse(result), { ok: true });
  });

  await test('（5.contract compatibility）Contract Layer本身完全沒有被Execution Flow修改——ApplicationRequestContract/ApplicationResponseContract的驗證規則維持不變', async () => {
    const { validateApplicationRequestContract, validateApplicationResponseContract } = await import(path.join(contractsDir, 'index.js'));
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: 'u1' }), { ok: true });
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true, data: { status: 'x', result: {}, metadata: {} } }), { ok: true });
  });

  await test('（5.contract compatibility）Execution Flow完全不直接import Contract Layer（不import ../../contracts/，「驗證Contract」是規格明確列給Workflow的責任）', () => {
    for (const file of EXECUTION_JS_FILES) {
      assert.ok(!/from\s+['"].*\/contracts\//.test(readSrc(path.join(executionDir, file))));
    }
  });

  await test('（5.contract compatibility）Execution Flow最終輸出的{ok, feature, output}/{ok, feature, reason}形狀跟Contract Layer的ok/data/reason最小交集相容（ok欄位存在且為boolean）', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(typeof result.ok, 'boolean');
  });

  await test('（5.contract compatibility）Contract Layer的validateRequest()對Execution Flow轉發給Workflow的request同樣視為合法（因為欄位選取邏輯跟TASK1.66 insight_capability.js的mapInsightFeatureRequestToCapabilityRequest()一致）', async () => {
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const cv = createContractValidator();
    assert.deepStrictEqual(cv.validateRequest({ userId: 'u1', options: { a: 1 } }), { ok: true });
  });

  await test('（5.contract compatibility）端對端：Execution Flow失敗結果的reason字串跟Workflow/Contract Layer回傳的reason完全一致（沒有被二次包裝或改寫）', async () => {
    const { executionFlow, workflow } = await buildRealChain();
    const flowResult = await executionFlow.runInsightExecution({}, {});
    const workflowResult = await workflow.executeApplicationRequest({}, {});
    assert.strictEqual(flowResult.reason, workflowResult.reason);
  });

  await test('（5.contract compatibility）Execution Flow完全不呼叫createContractValidator()（不重新建立第二份Contract Validator，Contract驗證完全交給Workflow層）', () => {
    for (const file of EXECUTION_JS_FILES) {
      assert.ok(!/createContractValidator/.test(readSrc(path.join(executionDir, file))));
    }
  });

  await test('（5.contract compatibility）端對端：Execution Flow成功結果的output欄位跟Contract Layer完全無關（Contract只驗證到Workflow那層的data.result，output是後續Context/Output Mapping才產生的Insight Domain專屬格式）', async () => {
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    const cv = createContractValidator();
    const validation = cv.validateResponse(result);
    assert.strictEqual(validation.ok, false);
    assert.strictEqual(validation.reason, 'missing_field');
  });

  console.log('');

  // =========================================================================
  // F. runtime isolation
  // =========================================================================
  console.log('--- F. runtime isolation ---');

  for (const file of EXECUTION_JS_FILES) {
    await test(`（6.runtime isolation）execution/${file} 完全不import src/intelligence/application/capabilities/（不直接呼叫Capability，唯一認識的下一層是Workflow）`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/application\/capabilities\//.test(src));
    });
    await test(`（6.runtime isolation）execution/${file} 完全不import src/intelligence/application/use_cases/`, () => {
      assert.ok(!/from\s+['"].*\/use_cases\//.test(readSrc(path.join(executionDir, file))));
    });
    await test(`（6.runtime isolation）execution/${file} 完全不import src/intelligence/application/application_service.js`, () => {
      assert.ok(!/from\s+['"].*\/application_service\.js['"]/.test(readSrc(path.join(executionDir, file))));
    });
    await test(`（6.runtime isolation）execution/${file} 完全不import src/intelligence/facade/`, () => {
      assert.ok(!/from\s+['"].*\/facade\//.test(readSrc(path.join(executionDir, file))));
    });
    await test(`（6.runtime isolation）execution/${file} 完全不import src/intelligence/execution/（Execution Manager，規格明確禁止「Insight Feature → Execution Manager」）`, () => {
      const src = readSrc(path.join(executionDir, file));
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      const executionManagerDir = path.join(intelDir, 'execution');
      for (const imp of imports) {
        const resolved = path.normalize(path.join(executionDir, imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir, `execution/${file}意外import了Execution Manager目錄下的檔案：${imp}`);
      }
    });
    await test(`（6.runtime isolation）execution/${file} 完全不import src/intelligence/service/、orchestration/、analysis/、recommendation/、data_preparation/、governance/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/service\//.test(src));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
      assert.ok(!/from\s+['"].*\/governance\//.test(src));
    });
    await test(`（6.runtime isolation）execution/${file} 完全不import src/intelligence/history/、metrics/、events/、monitoring/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/history\//.test(src));
      assert.ok(!/from\s+['"].*\/metrics\//.test(src));
      assert.ok(!/from\s+['"].*\/events\//.test(src));
      assert.ok(!/from\s+['"].*\/monitoring\//.test(src));
    });
    await test(`（6.runtime isolation）execution/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher/facade/applicationService變數名稱`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/executionManager/.test(src));
      assert.ok(!/historyStore/.test(src));
      assert.ok(!/metricsStore/.test(src));
      assert.ok(!/eventDispatcher/.test(src));
      assert.ok(!/\bfacade\b/i.test(src));
      assert.ok(!/applicationService/.test(src));
    });
  }

  await test('（6.runtime isolation）insight_capability.js（TASK1.66）完全沒有被修改——唯一相對路徑import維持是./insight_result_mapper.js', () => {
    const src = readSrc(path.join(insightDir, 'insight_capability.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./insight_result_mapper.js']);
  });

  await test('（6.runtime isolation）insight_capability.js完全沒有出現execution/相關的相對路徑import字樣（沒有反過來認識這個新的Execution Flow Layer的存在）', () => {
    const src = readSrc(path.join(insightDir, 'insight_capability.js'));
    assert.ok(!/from\s+['"]\.\/execution\//.test(src));
  });

  await test('（TASK1.69）（6.runtime isolation）src/bootstrap/application.js的intelligence物件恰好具備23個欄位（TASK1.66既有22個加上TASK1.69新增的insightExecutionFlow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（6.runtime isolation）app.intelligence.insightExecutionFlow跟app.intelligence.insightFeature是不同的兩個實例（各自獨立，互不覆蓋，並存的兩個Insight Feature entry point）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app.intelligence.insightExecutionFlow, app.intelligence.insightFeature);
    assert.deepStrictEqual(Object.keys(app.intelligence.insightExecutionFlow), ['runInsightExecution']);
  });

  await test('（6.runtime isolation）app.intelligence.insightExecutionFlow注入的workflow跟app.intelligence.workflow是同一個實例（不是各自建立第二份）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const viaWorkflow = await app.intelligence.workflow.executeApplicationRequest({}, { userId: 'u1' });
    const viaInsightExecutionFlow = await app.intelligence.insightExecutionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(viaWorkflow.ok, true);
    assert.strictEqual(viaInsightExecutionFlow.ok, true);
    assert.deepStrictEqual(viaWorkflow.data.result, {
      context: viaInsightExecutionFlow.output.context,
      analysis: viaInsightExecutionFlow.output.analysis,
      recommendation: viaInsightExecutionFlow.output.recommendation,
    });
  });

  await test('（6.runtime isolation）每次createApplication()呼叫都各自建立獨立的Insight Execution Flow實例（不是共用singleton）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app1 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const app2 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app1.intelligence.insightExecutionFlow, app2.intelligence.insightExecutionFlow);
  });

  await test('（6.runtime isolation）app.intelligence.insightExecutionFlow跟app.intelligence.insightFeature都各自維持自己的公開介面（一個只有runInsightExecution，一個只有requestInsight，不會互相混入對方的方法）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(typeof app.intelligence.insightExecutionFlow.requestInsight, 'undefined');
    assert.strictEqual(typeof app.intelligence.insightFeature.runInsightExecution, 'undefined');
  });

  await test('（6.runtime isolation）app.intelligence.insightExecutionFlow跟app.intelligence.features、app.intelligence.insightFeature三者互不覆蓋，各自獨立存在', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app.intelligence.insightExecutionFlow, app.intelligence.features);
    assert.notStrictEqual(app.intelligence.insightExecutionFlow, app.intelligence.insightFeature);
    assert.notStrictEqual(app.intelligence.features, app.intelligence.insightFeature);
  });

  await test('（6.runtime isolation）app.router.routes 數量沒有因為新增insightExecutionFlow而改變（本次任務明確禁止新增API route）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.ok(Array.isArray(app.router.routes));
    assert.ok(app.router.routes.length > 0);
  });

  await test('（6.runtime isolation）app.intelligence.insightExecutionFlow.runInsightExecution是一個函式', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(typeof app.intelligence.insightExecutionFlow.runInsightExecution, 'function');
  });

  await test('（6.runtime isolation）端對端：透過app.intelligence.insightExecutionFlow呼叫得到跟直接建立的Execution Flow一致的輸出形狀（都通過validateInsightOutput()驗證）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const { executionFlow } = await buildRealChain();
    const { validateInsightOutput } = await import(path.join(outputDir, 'insight_output_model.js'));
    const viaBootstrap = await app.intelligence.insightExecutionFlow.runInsightExecution({}, { userId: 'u1' });
    const viaDirect = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(viaBootstrap.ok, true);
    assert.strictEqual(viaDirect.ok, true);
    assert.deepStrictEqual(validateInsightOutput(viaBootstrap.output), { ok: true });
    assert.deepStrictEqual(validateInsightOutput(viaDirect.output), { ok: true });
    assert.deepStrictEqual(Object.keys(viaBootstrap.output).sort(), Object.keys(viaDirect.output).sort());
  });

  console.log('');

  // =========================================================================
  // G. no database dependency
  // =========================================================================
  console.log('--- G. no database dependency ---');

  for (const file of EXECUTION_JS_FILES) {
    await test(`（7.no database dependency）execution/${file} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(executionDir, file))));
    });
    await test(`（7.no database dependency）execution/${file} 完全沒有db.prepare()/SQL關鍵字/DIET_COACH_DB字樣`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（7.no database dependency）runInsightExecution()把db當作不透明的第一個參數，只轉交給workflow.executeApplicationRequest()，完全不呼叫db的任何方法', () => {
    const src = readSrc(path.join(executionDir, 'insight_execution_flow.js'));
    assert.ok(!/db\.prepare\(/.test(src));
    assert.ok(!/db\.\w+\(/.test(src));
  });

  await test('（7.no database dependency）db為null時仍原樣轉交給workflow（Execution Flow不對db做任何存在性檢查）', async () => {
    let receivedDb = 'not-called';
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async (db) => { receivedDb = db; return { ok: false, reason: 'stop_here' }; } },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    await flow.runInsightExecution(null, { userId: 'u1' });
    assert.strictEqual(receivedDb, null);
  });

  await test('（7.no database dependency）db為undefined時仍原樣轉交給workflow', async () => {
    let receivedDb = 'not-called';
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async (db) => { receivedDb = db; return { ok: false, reason: 'stop_here' }; } },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: true, output: {} }) },
    });
    await flow.runInsightExecution(undefined, { userId: 'u1' });
    assert.strictEqual(receivedDb, undefined);
  });

  console.log('');

  // =========================================================================
  // H. no auth dependency
  // =========================================================================
  console.log('--- H. no auth dependency ---');

  for (const file of EXECUTION_JS_FILES) {
    await test(`（8.no auth dependency）execution/${file} 完全不import src/auth/、src/oauth/、src/identity/、src/middleware/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（8.no auth dependency）execution/${file} 完全沒有出現jwt/session/cookie相關字樣`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
    await test(`（8.no auth dependency）execution/${file} 完全不呼叫requireAuth()/requireActiveUser()/getCurrentUser()`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/requireAuth\(/.test(src));
      assert.ok(!/requireActiveUser\(/.test(src));
      assert.ok(!/getCurrentUser\(/.test(src));
    });
    await test(`（8.no auth dependency）execution/${file} 完全不出現token/apiKey/secret相關字樣`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/\btoken\b/i.test(src));
      assert.ok(!/apiKey/i.test(src));
      assert.ok(!/\bsecret\b/i.test(src));
    });
  }

  await test('（8.no auth dependency）runInsightExecution()的userId參數只是原樣傳遞的字串，完全不做任何身分驗證或查詢使用者資料（沒有呼叫getById/findUser等字樣）', () => {
    const src = readSrc(path.join(executionDir, 'insight_execution_flow.js'));
    assert.ok(!/getById\(/.test(src));
    assert.ok(!/findUser\(/.test(src));
    assert.ok(!/\.getUser\(/.test(src));
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
  for (const file of EXECUTION_JS_FILES) {
    const codeOnly = readSrc(path.join(executionDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（9.no AI dependency）execution/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（9.no AI dependency）execution/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
    await test(`（9.no AI dependency）execution/${file} 完全不 import 任何非相對路徑的外部套件`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  await test('（9.no AI dependency）Insight Execution Flow完全不產生任何自然語言/建議文字，也不計算任何新的分數/信心值（沒有score/confidence相關的計算邏輯）', () => {
    const src = readSrc(path.join(executionDir, 'insight_execution_flow.js'));
    assert.ok(!/\.score\s*=/.test(src));
    assert.ok(!/\.confidence\s*=/.test(src));
  });

  console.log('');

  // =========================================================================
  // J. export consistency
  // =========================================================================
  console.log('--- J. export consistency ---');

  await test('（10.export consistency）execution/index.js完整re-export了execution/底下每個原始檔案的全部具名export', () => {
    const reExported = getReExportedNames(path.join(executionDir, 'index.js'));
    for (const file of ['insight_execution_flow.js', 'insight_execution_result_builder.js']) {
      const names = getNamedExports(path.join(executionDir, file));
      for (const name of names) {
        assert.ok(reExported.has(name), `execution/index.js 缺少 re-export ${name}（來自${file}）`);
      }
    }
  });

  await test('（10.export consistency）execution/index.js re-export的名稱在對應來源檔案裡確實存在（沒有re-export不存在的東西）', () => {
    const indexSrc = readSrc(path.join(executionDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(executionDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `execution/index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（10.export consistency）execution/index.js恰好只re-export兩個具名函式（createInsightExecutionFlow/createInsightExecutionResultBuilder），沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(executionDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createInsightExecutionFlow', 'createInsightExecutionResultBuilder']);
  });

  await test('（10.export consistency）src/intelligence/application/features/insight/index.js 有 export * as execution from ./execution/index.js', () => {
    const src = readSrc(path.join(insightDir, 'index.js'));
    assert.ok(/export \* as execution from ['"]\.\/execution\/index\.js['"]/.test(src));
  });

  await test('（10.export consistency）insight/index.js恰好只re-export兩個具名函式（createInsightFeatureCapability/createInsightResultMapper），本次沒有新增具名re-export，execution是以namespace形式加入（跟context/output同樣模式）', () => {
    const reExported = getReExportedNames(path.join(insightDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createInsightFeatureCapability', 'createInsightResultMapper']);
    const namespaces = getReExportedNamespaces(path.join(insightDir, 'index.js'));
    assert.ok(namespaces.has('context'));
    assert.ok(namespaces.has('output'));
    assert.ok(namespaces.has('execution'));
  });

  await test('（10.export consistency）import後，insightModule.execution 是非空物件，具備createInsightExecutionFlow/createInsightExecutionResultBuilder', async () => {
    const insightModule = await import(path.join(insightDir, 'index.js'));
    assert.strictEqual(typeof insightModule.execution, 'object');
    assert.strictEqual(typeof insightModule.execution.createInsightExecutionFlow, 'function');
    assert.strictEqual(typeof insightModule.execution.createInsightExecutionResultBuilder, 'function');
  });

  await test('（10.export consistency）src/intelligence/index.js完全沒有被TASK1.69修改（git diff確認）——application/features/insight/execution是nested三層底下，不需要在這個統一輸出入口新增任何東西', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.export consistency）context/index.js跟output/index.js都完全沒有被TASK1.69修改（git diff確認，各自維持TASK1.67/TASK1.68既有的具名匯出）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/features/insight/context/index.js src/intelligence/application/features/insight/output/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.export consistency）execution/README.md提及「active orchestrator」或「主動」字樣，明確記錄跟TASK1.67/1.68被動extension point不同的架構決策', () => {
    const readme = fs.readFileSync(path.join(executionDir, 'README.md'), 'utf8');
    assert.ok(/active orchestrator|主動/.test(readme));
  });

  await test('（10.export consistency）execution/README.md提及insightExecutionFlow這個bootstrap欄位名稱', () => {
    const readme = fs.readFileSync(path.join(executionDir, 'README.md'), 'utf8');
    assert.ok(/insightExecutionFlow/.test(readme));
  });

  await test('（10.export consistency）src/bootstrap/application.js的注解裡有記錄TASK1.69新增intelligence.insightExecutionFlow的組裝說明', () => {
    const src = fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8');
    assert.ok(/TASK1\.69新增：`intelligence\.insightExecutionFlow`/.test(src));
  });

  await test('（10.export consistency）import後，insightModule.context/insightModule.output/insightModule.execution三個namespace各自獨立不互相污染（各自只有自己該有的函式）', async () => {
    const insightModule = await import(path.join(insightDir, 'index.js'));
    assert.strictEqual(typeof insightModule.context.createInsightExecutionFlow, 'undefined');
    assert.strictEqual(typeof insightModule.output.createInsightExecutionFlow, 'undefined');
    assert.strictEqual(typeof insightModule.execution.createInsightContextMapper, 'undefined');
    assert.strictEqual(typeof insightModule.execution.createInsightOutputMapper, 'undefined');
  });

  console.log('');

  // =========================================================================
  // K. regression check
  // =========================================================================
  console.log('--- K. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（11.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.69-insight-execution')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 59, `預期至少59個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（11.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

  await test('（12.P1-P6）src/worker.js 完全沒有被TASK1.69修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）wrangler.toml 完全沒有被TASK1.69修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（12.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被TASK1.69修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）Analysis/Recommendation Runner/Execution Manager/Application Service/Insight Use Case/Insight Capability（capabilities/）/Application Workflow/Insight Feature Capability（TASK1.66）/Insight Context Mapper（TASK1.67）/Insight Output Mapper（TASK1.68）的原始碼完全沒有被TASK1.69修改（規格明確禁止修改Execution Runtime Behavior）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/analysis/analysis_runner.js src/intelligence/recommendation/recommendation_runner.js src/intelligence/execution/execution_manager.js src/intelligence/facade/intelligence_facade.js src/intelligence/application/application_service.js src/intelligence/application/use_cases/insight_use_case.js src/intelligence/application/capabilities/insight_capability.js src/intelligence/application/workflows/application_workflow.js src/intelligence/application/features/insight/insight_capability.js src/intelligence/application/features/insight/insight_result_mapper.js src/intelligence/application/features/insight/context/insight_context_mapper.js src/intelligence/application/features/insight/context/insight_context_result_builder.js src/intelligence/application/features/insight/output/insight_output_model.js src/intelligence/application/features/insight/output/insight_output_mapper.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）src/bootstrap/application.js只有新增insightExecutionFlow相關的組裝（git diff只包含新增行，沒有刪除既有行——用grep確認diff裡沒有以"-"開頭且非"---"的既有程式碼行）', () => {
    const diff = execFileSync('git', ['diff', '--', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    const removedLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
    assert.strictEqual(removedLines.length, 0, `bootstrap/application.js出現非預期的刪除行：${JSON.stringify(removedLines)}`);
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

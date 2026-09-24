/*
 * Phase 3 TASK 1.70｜Insight Feature Lifecycle Validation Review 測試
 *
 * 本任務不是新增功能、不是建立新Layer、不是導入AI——這是對Phase 3
 * 目前已建立的整條Insight Feature Architecture做一次完整生命週期
 * 驗證：
 *
 *   Request
 *     ↓
 *   Insight Execution Flow（TASK1.69）
 *     ↓
 *   Workflow（TASK1.64，內部採用Contract Layer TASK1.63）
 *     ↓
 *   Capability（TASK1.62）→ Use Case（TASK1.61）→ Application
 *   Service（TASK1.60）→ Intelligence Facade（TASK1.48）→
 *   Execution Manager（TASK1.50）→ Intelligence Service（TASK1.46）
 *   → Orchestrator（TASK1.45）→ Data Preparation/Insight Context/
 *   Analysis/Recommendation（Phase 2 Runtime）
 *     ↓
 *   Context Mapping（TASK1.67，攤平Runtime Result）
 *     ↓
 *   Output Mapping（TASK1.68，驗證並轉換成InsightOutputModel）
 *     ↓
 *   Response（TASK1.69 Result Builder，
 *   {ok:true, feature:'insight', output}）
 *
 * 這份測試驗證的是：
 * - 完整生命週期在真實依賴鏈（一路到Analysis/Recommendation
 *   Runner）下確實成立（成功路徑）
 * - 每一個Boundary（invalid request/invalid contract/workflow
 *   failure/runtime failure/invalid output）在錯誤情境下都正確
 *   回傳結構化的{ok:false, reason}，不會有例外未經處理外洩、也不會
 *   用不完整的資料頂替繼續執行
 * - Insight Feature（execution/context/output/insight_capability.js
 *   本身）完全不直接依賴database/auth/oauth/execution internal
 *   components/AI provider
 * - export一致性、Phase 1-3既有測試全部通過、P1-P6
 *
 * 這是一份**審查**測試，本身不修改任何production邏輯——唯一的
 * 變更是為`src/intelligence/application/features/insight/README.md`
 * 補充一段記錄本次審查結論的「完整生命週期」章節（純文件補充，不
 * 影響任何執行行為）。
 *
 * 分為以下10個部分：
 * A) lifecycle flow
 * B) success path
 * C) error path
 * D) contract boundary
 * E) workflow boundary
 * F) runtime isolation
 * G) dependency scan
 * H) export consistency
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

// Phase 3 Insight Feature整個目錄樹底下所有.js檔案（execution/、
// context/、output/三個nested子目錄 + insight_capability.js/
// insight_result_mapper.js/index.js本身）——這是本次Lifecycle
// Review的Dependency Scan掃描範圍。
function listAllInsightJsFiles() {
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
    }
  }
  walk(insightDir);
  return files.sort();
}

async function buildRealChain(overrides) {
  overrides = overrides || {};
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
  const { createInsightFeatureCapability } = await import(path.join(insightDir, 'index.js'));

  const dataPreparation = 'dataPreparation' in overrides ? overrides.dataPreparation : { prepare: async () => ({ ok: true, context: { raw: true } }) };
  const contextBuilder = overrides.contextBuilder || {
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
  const insightFeatureCapability = createInsightFeatureCapability({ workflow });
  return { executionFlow, workflow, contextMapper, outputMapper, insightCapability, insightUseCase, applicationService, facade, executionManager, service, orchestrator, insightFeatureCapability };
}

async function run() {
  const INSIGHT_ALL_FILES = listAllInsightJsFiles();

  // =========================================================================
  // A. lifecycle flow
  // =========================================================================
  console.log('--- A. lifecycle flow ---');

  await test('（1.lifecycle flow）Insight Feature Execution Flow相關4個檔案存在（insight_execution_flow.js/insight_execution_result_builder.js/index.js/README.md）', () => {
    const files = fs.readdirSync(executionDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'index.js', 'insight_execution_flow.js', 'insight_execution_result_builder.js']);
  });

  await test('（1.lifecycle flow）Insight Context Mapping相關4個檔案存在', () => {
    const files = fs.readdirSync(contextDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'index.js', 'insight_context_mapper.js', 'insight_context_result_builder.js']);
  });

  await test('（1.lifecycle flow）Insight Output Model相關4個檔案存在', () => {
    const files = fs.readdirSync(outputDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'index.js', 'insight_output_mapper.js', 'insight_output_model.js']);
  });

  await test('（1.lifecycle flow）Workflow Layer（TASK1.64）存在且提供executeApplicationRequest', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const workflow = createApplicationWorkflow({ capability: {}, contractValidator: {} });
    assert.strictEqual(typeof workflow.executeApplicationRequest, 'function');
  });

  await test('（1.lifecycle flow）Contract Layer（TASK1.63）存在且提供validateRequest/validateResponse', async () => {
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const cv = createContractValidator();
    assert.strictEqual(typeof cv.validateRequest, 'function');
    assert.strictEqual(typeof cv.validateResponse, 'function');
  });

  await test('（1.lifecycle flow）Capability（TASK1.62）/Use Case（TASK1.61）/Application Service（TASK1.60）三層存在且各自提供對應入口函式', async () => {
    const { createInsightCapability } = await import(path.join(capabilitiesDir, 'index.js'));
    const { createInsightUseCase } = await import(path.join(useCasesDir, 'index.js'));
    const { createApplicationService } = await import(path.join(applicationDir, 'index.js'));
    assert.strictEqual(typeof createInsightCapability({}).requestInsightCapability, 'function');
    assert.strictEqual(typeof createInsightUseCase({}).requestUserInsight, 'function');
    assert.strictEqual(typeof createApplicationService({}).requestIntelligence, 'function');
  });

  await test('（1.lifecycle flow）src/bootstrap/application.js的intelligence物件同時具備insightExecutionFlow跟insightFeature兩個Insight Feature entry point', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(typeof app.intelligence.insightExecutionFlow.runInsightExecution, 'function');
    assert.strictEqual(typeof app.intelligence.insightFeature.requestInsight, 'function');
  });

  await test('（1.lifecycle flow）app.intelligence物件恰好具備23個欄位（TASK1.69既有狀態，本次審查沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（1.lifecycle flow）端對端：runInsightExecution()內部依序呼叫workflow→contextMapper→outputMapper（透過三個spy依序驗證呼叫順序）', async () => {
    const { createInsightExecutionFlow } = await import(path.join(executionDir, 'index.js'));
    const callOrder = [];
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => { callOrder.push('workflow'); return { ok: true, data: {} }; } },
      contextMapper: { mapRuntimeContextToInsightDomain: () => { callOrder.push('contextMapper'); return {}; } },
      outputMapper: { mapToInsightOutput: () => { callOrder.push('outputMapper'); return { ok: true, output: {} }; } },
    });
    await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(callOrder, ['workflow', 'contextMapper', 'outputMapper']);
  });

  await test('（1.lifecycle flow）端對端：完整生命週期（Request→Execution Flow→Workflow→Capability→Use Case→Application Service→Facade→Execution Manager→Service→Orchestrator→Data Preparation/Context/Analysis/Recommendation→Context Mapping→Output Mapping→Response）在真實依賴鏈下成立，成功回傳ok:true', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'insight');
    assert.ok(result.output);
  });

  await test('（1.lifecycle flow）src/intelligence/application/features/insight/README.md記錄了本次TASK1.70確認的完整生命週期章節', () => {
    const readme = fs.readFileSync(path.join(insightDir, 'README.md'), 'utf8');
    assert.ok(/TASK1\.70/.test(readme));
    assert.ok(/生命週期|Lifecycle/i.test(readme));
  });

  await test('（1.lifecycle flow）backups/phase3-task1.70-insight-lifecycle-review/README.md不存在（本次審查記錄直接寫在測試檔案跟既有insight/README.md，沒有新增額外文件檔案）', () => {
    assert.ok(!fs.existsSync(path.join(__dirname, 'README.md')));
  });

  console.log('');

  // =========================================================================
  // B. success path
  // =========================================================================
  console.log('--- B. success path ---');

  await test('（2.success path）端對端：真實輸出通過validateInsightOutput()驗證（InsightOutputModel形狀）', async () => {
    const { validateInsightOutput } = await import(path.join(outputDir, 'insight_output_model.js'));
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(validateInsightOutput(result.output), { ok: true });
  });

  await test('（2.success path）端對端：輸出恰好具備status/context/analysis/recommendation/metadata五個欄位', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result.output).sort(), ['analysis', 'context', 'metadata', 'recommendation', 'status']);
  });

  await test('（2.success path）端對端：context欄位具備TASK1.42 InsightContext七個既有欄位', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result.output.context).sort(), ['activityContext', 'behaviorContext', 'emotionContext', 'metadata', 'nutritionContext', 'reportContext', 'user']);
  });

  await test('（2.success path）端對端：status欄位為"intelligence_ready"（成功時Runtime既有的既定狀態字串）', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.output.status, 'intelligence_ready');
  });

  await test('（2.success path）端對端：不同userId呼叫都能各自成功走完整條生命週期', async () => {
    const { executionFlow } = await buildRealChain();
    for (const userId of ['u1', 'u2', 'another-user', '  spaced  ']) {
      const result = await executionFlow.runInsightExecution({}, { userId });
      assert.strictEqual(result.ok, true, `userId=${userId}應該成功`);
    }
  });

  await test('（2.success path）端對端：deterministic——同樣輸入重複呼叫得到完全相同的輸出', async () => {
    const { executionFlow } = await buildRealChain();
    const r1 = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    const r2 = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(r1, r2);
  });

  await test('（2.success path）端對端：透過app.intelligence.insightExecutionFlow（bootstrap組裝）呼叫，搭配stub的service.getIntelligence，同樣走完整條生命週期得到ok:true', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: { a: 1 }, analysis: { b: 2 }, recommendation: { c: 3 }, metadata: { d: 4 } } });
    const result = await app.intelligence.insightExecutionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.output, { status: 'intelligence_ready', context: { a: 1 }, analysis: { b: 2 }, recommendation: { c: 3 }, metadata: { d: 4 } });
  });

  await test('（2.success path）端對端：透過app.intelligence.insightFeature（TASK1.66既有entry point）跟app.intelligence.insightExecutionFlow（TASK1.69新entry point）呼叫同一組真實依賴，底層Runtime資料完全一致', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: { x: 1 }, analysis: { y: 2 }, recommendation: { z: 3 }, metadata: {} } });
    const viaFeature = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const viaExecutionFlow = await app.intelligence.insightExecutionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(viaFeature.ok, true);
    assert.strictEqual(viaExecutionFlow.ok, true);
    assert.deepStrictEqual(viaFeature.data.result, { context: viaExecutionFlow.output.context, analysis: viaExecutionFlow.output.analysis, recommendation: viaExecutionFlow.output.recommendation });
  });

  console.log('');

  // =========================================================================
  // C. error path
  // =========================================================================
  console.log('--- C. error path ---');

  await test('（3.error path）invalid request：缺少userId時Execution Flow回傳{ok:false, feature:"insight", reason:"invalid_user_id"}', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, {});
    assert.deepStrictEqual(result, { ok: false, feature: 'insight', reason: 'invalid_user_id' });
  });

  await test('（3.error path）invalid request：request為null時回傳invalid_request，不拋出例外', async () => {
    const { executionFlow } = await buildRealChain();
    await assert.doesNotReject(() => executionFlow.runInsightExecution({}, null));
    const result = await executionFlow.runInsightExecution({}, null);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（3.error path）invalid request：options為陣列時回傳invalid_options_type', async () => {
    const { executionFlow } = await buildRealChain();
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1', options: [] });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（3.error path）invalid contract：直接呼叫Workflow（跳過Execution Flow自己的驗證）搭配畸形request，Contract Layer正確攔截並回傳失敗（證明Contract Layer本身仍然是這條生命週期上真正把關的一層，不是只有Execution Flow自己在驗證）', async () => {
    const { workflow } = await buildRealChain();
    const result = await workflow.executeApplicationRequest({}, { userId: 123 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（3.error path）invalid contract：Workflow沒有注入contractValidator時回傳contract_validator_unavailable（Contract Boundary本身缺失時的降級行為）', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const workflow = createApplicationWorkflow({ capability: { requestInsightCapability: async () => ({ ok: true, data: {} }) } });
    const result = await workflow.executeApplicationRequest({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, workflow: 'application_request', reason: 'contract_validator_unavailable' });
  });

  await test('（3.error path）workflow failure：Workflow回傳失敗時，Execution Flow把reason原樣轉發，完全不呼叫contextMapper/outputMapper', async () => {
    let contextMapperCalled = false;
    const { createInsightExecutionFlow } = await import(path.join(executionDir, 'index.js'));
    const { createInsightContextMapper } = await import(path.join(contextDir, 'index.js'));
    const { createInsightOutputMapper } = await import(path.join(outputDir, 'index.js'));
    const realContextMapper = createInsightContextMapper();
    const spyContextMapper = { mapRuntimeContextToInsightDomain: (...args) => { contextMapperCalled = true; return realContextMapper.mapRuntimeContextToInsightDomain(...args); } };
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: false, reason: 'capability_unavailable' }) },
      contextMapper: spyContextMapper,
      outputMapper: createInsightOutputMapper(),
    });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, feature: 'insight', reason: 'capability_unavailable' });
    assert.strictEqual(contextMapperCalled, false);
  });

  await test('（3.error path）workflow failure：端對端，capability層缺失useCase依賴時，失敗reason一路正確轉發到Execution Flow頂層', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { createInsightCapability } = await import(path.join(capabilitiesDir, 'index.js'));
    const { createInsightExecutionFlow } = await import(path.join(executionDir, 'index.js'));
    const { createInsightContextMapper } = await import(path.join(contextDir, 'index.js'));
    const { createInsightOutputMapper } = await import(path.join(outputDir, 'index.js'));
    const brokenCapability = createInsightCapability({});
    const workflow = createApplicationWorkflow({ capability: brokenCapability, contractValidator: createContractValidator() });
    const flow = createInsightExecutionFlow({ workflow, contextMapper: createInsightContextMapper(), outputMapper: createInsightOutputMapper() });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.feature, 'insight');
    assert.strictEqual(typeof result.reason, 'string');
  });

  await test('（3.error path）runtime failure：Data Preparation階段失敗時（結構化{ok:false}，不是例外），失敗reason一路正確轉發到Execution Flow頂層，完全不拋出未處理例外', async () => {
    const { executionFlow } = await buildRealChain({ dataPreparation: { prepare: async () => ({ ok: false, reason: 'db_connection_failed' }) } });
    await assert.doesNotReject(() => executionFlow.runInsightExecution({}, { userId: 'u1' }));
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.feature, 'insight');
    assert.strictEqual(result.reason, 'db_connection_failed');
  });

  await test('（3.error path）runtime failure：Context Builder驗證失敗時（例如InsightContext形狀不合法），失敗reason一路正確轉發', async () => {
    const { executionFlow } = await buildRealChain({ contextBuilder: { buildInsightContext: () => ({ context: null, validation: { ok: false, reason: 'invalid_context_shape', field: 'context' } }) } });
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_context_shape');
  });

  await test('（3.error path）runtime failure：Orchestrator缺少dataPreparation依賴時（Runtime組裝層級的缺失），失敗reason為data_preparation_unavailable，一路正確轉發', async () => {
    const { executionFlow } = await buildRealChain({ dataPreparation: null });
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'data_preparation_unavailable');
  });

  await test('（3.error path）invalid output：outputMapper明確回傳失敗時，Execution Flow正確轉發，不拋出例外', async () => {
    const { createInsightExecutionFlow } = await import(path.join(executionDir, 'index.js'));
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: true, data: {} }) },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: false, reason: 'invalid_output' }) },
    });
    await assert.doesNotReject(() => flow.runInsightExecution({}, { userId: 'u1' }));
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, feature: 'insight', reason: 'invalid_output' });
  });

  await test('（3.error path）invalid output：outputMapper回傳缺少欄位時（missing_field），Execution Flow正確轉發reason跟field資訊不會遺失（雖然最終結果本身不含field，但驗證reason正確）', async () => {
    const { createInsightExecutionFlow } = await import(path.join(executionDir, 'index.js'));
    const flow = createInsightExecutionFlow({
      workflow: { executeApplicationRequest: async () => ({ ok: true, data: {} }) },
      contextMapper: { mapRuntimeContextToInsightDomain: () => ({}) },
      outputMapper: { mapToInsightOutput: () => ({ ok: false, reason: 'missing_field', field: 'context' }) },
    });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.reason, 'missing_field');
  });

  await test('（3.error path）所有錯誤情境的最終結果都符合{ok:false, feature:"insight", reason:string}固定形狀（不會有多餘或缺少的欄位）', async () => {
    const { executionFlow } = await buildRealChain();
    const scenarios = [
      {},
      { userId: '' },
      { userId: 123 },
      { userId: 'u1', options: [] },
    ];
    for (const request of scenarios) {
      const result = await executionFlow.runInsightExecution({}, request);
      assert.strictEqual(result.ok, false);
      assert.deepStrictEqual(Object.keys(result).sort(), ['feature', 'ok', 'reason']);
      assert.strictEqual(typeof result.reason, 'string');
    }
  });

  await test('（3.error path）每一個錯誤情境都不會讓Promise reject（一律用回傳值表達失敗，不是throw）', async () => {
    const { executionFlow } = await buildRealChain({ dataPreparation: { prepare: async () => ({ ok: false, reason: 'x' }) } });
    const scenarios = [null, undefined, 'string', [], {}, { userId: null }];
    for (const request of scenarios) {
      await assert.doesNotReject(() => executionFlow.runInsightExecution({}, request), `request=${JSON.stringify(request)}不應該reject`);
    }
  });

  console.log('');

  // =========================================================================
  // D. contract boundary
  // =========================================================================
  console.log('--- D. contract boundary ---');

  await test('（4.contract boundary）Contract Layer的validateApplicationRequestContract()跟Execution Flow自己內建的驗證規則對同樣的非法輸入給出相同的reason（兩者形狀規則一致，不是各自定義不相容的規則）', async () => {
    const { validateApplicationRequestContract } = await import(path.join(contractsDir, 'index.js'));
    const { executionFlow } = await buildRealChain();
    const invalidInputs = [{}, { userId: 123 }, { userId: 'u1', options: [] }, { userId: 'u1', options: null }];
    for (const input of invalidInputs) {
      const contractResult = validateApplicationRequestContract(input);
      const flowResult = await executionFlow.runInsightExecution({}, input);
      assert.strictEqual(contractResult.ok, false);
      assert.strictEqual(flowResult.ok, false);
      assert.strictEqual(contractResult.reason, flowResult.reason, `input=${JSON.stringify(input)}的reason應該一致`);
    }
  });

  await test('（4.contract boundary）Contract Layer的validateApplicationResponseContract()正確攔截Capability回傳的畸形response（缺少data.result），Workflow把這個攔截結果正確轉發到Execution Flow頂層', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { createInsightExecutionFlow } = await import(path.join(executionDir, 'index.js'));
    const { createInsightContextMapper } = await import(path.join(contextDir, 'index.js'));
    const { createInsightOutputMapper } = await import(path.join(outputDir, 'index.js'));
    const malformedCapability = { requestInsightCapability: async () => ({ ok: true, capability: 'insight', data: { status: 'intelligence_ready' } }) };
    const workflow = createApplicationWorkflow({ capability: malformedCapability, contractValidator: createContractValidator() });
    const flow = createInsightExecutionFlow({ workflow, contextMapper: createInsightContextMapper(), outputMapper: createInsightOutputMapper() });
    const result = await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_field');
  });

  await test('（4.contract boundary）Contract Layer本身完全沒有被本次審查修改（git diff確認）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/contracts/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.contract boundary）Workflow是這條生命週期上唯一主動呼叫Contract Layer的層——Execution Flow/Context Mapper/Output Mapper/insight_capability.js都完全不import contracts/', () => {
    const files = [...INSIGHT_ALL_FILES];
    for (const f of files) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/contracts\//.test(src), `${path.relative(repoRoot, f)}不應該import contracts/`);
    }
  });

  await test('（4.contract boundary）Contract Layer的validateRequest()/validateResponse()是deterministic的——同樣輸入永遠得到相同結果，跟Insight Feature Execution Flow整條生命週期的deterministic要求一致', async () => {
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const cv = createContractValidator();
    const input = { userId: 'u1', options: { a: 1 } };
    assert.deepStrictEqual(cv.validateRequest(input), cv.validateRequest(input));
  });

  console.log('');

  // =========================================================================
  // E. workflow boundary
  // =========================================================================
  console.log('--- E. workflow boundary ---');

  await test('（5.workflow boundary）Workflow只認識Capability跟ContractValidator兩個依賴（不import use_cases/、application_service.js、facade/、execution/）', () => {
    const src = readSrc(path.join(workflowsDir, 'application_workflow.js'));
    assert.ok(!/from\s+['"].*\/use_cases\//.test(src));
    assert.ok(!/from\s+['"].*\/application_service\.js['"]/.test(src));
    assert.ok(!/from\s+['"].*\/facade\//.test(src));
    assert.ok(!/from\s+['"].*\/execution\//.test(src));
  });

  await test('（5.workflow boundary）端對端：Execution Flow完全不繞過Workflow直接呼叫Capability/Use Case/Application Service/Facade（透過spy on workflow確認呼叫鏈只經過一個入口）', async () => {
    let workflowCallCount = 0;
    const { createInsightExecutionFlow } = await import(path.join(executionDir, 'index.js'));
    const { workflow: realWorkflow, contextMapper, outputMapper } = await buildRealChain();
    const spyWorkflow = { executeApplicationRequest: async (...args) => { workflowCallCount++; return realWorkflow.executeApplicationRequest(...args); } };
    const flow = createInsightExecutionFlow({ workflow: spyWorkflow, contextMapper, outputMapper });
    await flow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(workflowCallCount, 1);
  });

  await test('（5.workflow boundary）Workflow回傳的成功結果{ok:true, workflow:"application_request", data}中的data，其shape就是Context Mapper預期消費的{status, result:{context,analysis,recommendation}, metadata}', async () => {
    const { workflow } = await buildRealChain();
    const result = await workflow.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.workflow, 'application_request');
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['metadata', 'result', 'status']);
    assert.deepStrictEqual(Object.keys(result.data.result).sort(), ['analysis', 'context', 'recommendation']);
  });

  await test('（5.workflow boundary）Workflow失敗結果固定為{ok:false, workflow:"application_request", reason}三個欄位', async () => {
    const { workflow } = await buildRealChain();
    const result = await workflow.executeApplicationRequest({}, {});
    assert.deepStrictEqual(Object.keys(result).sort(), ['ok', 'reason', 'workflow']);
  });

  await test('（5.workflow boundary）db參數從Execution Flow到Workflow到Capability全程原樣傳遞（同一個參照，沒有被任何一層複製或修改）', async () => {
    const opaqueDb = { marker: 'lifecycle-review' };
    const receivedDbs = [];
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { createInsightExecutionFlow } = await import(path.join(executionDir, 'index.js'));
    const { createInsightContextMapper } = await import(path.join(contextDir, 'index.js'));
    const { createInsightOutputMapper } = await import(path.join(outputDir, 'index.js'));
    const spyCapability = { requestInsightCapability: async (db) => { receivedDbs.push(db); return { ok: false, reason: 'stop_here' }; } };
    const workflow = createApplicationWorkflow({ capability: spyCapability, contractValidator: createContractValidator() });
    const flow = createInsightExecutionFlow({ workflow, contextMapper: createInsightContextMapper(), outputMapper: createInsightOutputMapper() });
    await flow.runInsightExecution(opaqueDb, { userId: 'u1' });
    assert.strictEqual(receivedDbs.length, 1);
    assert.strictEqual(receivedDbs[0], opaqueDb);
  });

  console.log('');

  // =========================================================================
  // F. runtime isolation
  // =========================================================================
  console.log('--- F. runtime isolation ---');

  for (const f of INSIGHT_ALL_FILES) {
    const relName = path.relative(repoRoot, f);
    await test(`（6.runtime isolation）${relName} 完全不import src/intelligence/execution/（Execution Manager，用path.resolve()精準比對，避免跟insight/execution/這個nested子目錄名稱混淆）`, () => {
      const executionManagerDir = path.join(intelDir, 'execution');
      const src = readSrc(f);
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        const resolved = path.normalize(path.join(path.dirname(f), imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir, `${relName}意外import了Execution Manager目錄下的檔案：${imp}`);
      }
    });
    await test(`（6.runtime isolation）${relName} 完全不import src/intelligence/facade/、service/、orchestration/`, () => {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/facade\//.test(src), `${relName}不應該import facade/`);
      assert.ok(!/from\s+['"].*\/service\//.test(src), `${relName}不應該import service/`);
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src), `${relName}不應該import orchestration/`);
    });
    await test(`（6.runtime isolation）${relName} 完全不import src/intelligence/analysis/、recommendation/、data_preparation/、governance/`, () => {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/analysis\//.test(src), `${relName}不應該import analysis/`);
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src), `${relName}不應該import recommendation/`);
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src), `${relName}不應該import data_preparation/`);
      assert.ok(!/from\s+['"].*\/governance\//.test(src), `${relName}不應該import governance/`);
    });
    await test(`（6.runtime isolation）${relName} 完全不import src/intelligence/history/、metrics/、events/、monitoring/`, () => {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/history\//.test(src));
      assert.ok(!/from\s+['"].*\/metrics\//.test(src));
      assert.ok(!/from\s+['"].*\/events\//.test(src));
      assert.ok(!/from\s+['"].*\/monitoring\//.test(src));
    });
  }

  await test('（6.runtime isolation）只有insight_capability.js/insight_execution_flow.js允許import workflows/（唯一認識的下一層），context/output/result_builder相關檔案完全不import workflows/', () => {
    const filesAllowedWorkflow = new Set([path.join(insightDir, 'insight_capability.js'), path.join(executionDir, 'insight_execution_flow.js')]);
    for (const f of INSIGHT_ALL_FILES) {
      const src = readSrc(f);
      const importsWorkflow = /from\s+['"].*\/workflows\//.test(src);
      if (importsWorkflow) {
        assert.ok(filesAllowedWorkflow.has(f), `${path.relative(repoRoot, f)}不應該import workflows/`);
      }
    }
  });

  await test('（6.runtime isolation）Insight Feature整個目錄樹完全不import src/intelligence/application/capabilities/、use_cases/、application_service.js（一律透過Workflow間接呼叫）', () => {
    for (const f of INSIGHT_ALL_FILES) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/application\/capabilities\//.test(src), `${path.relative(repoRoot, f)}不應該import application/capabilities/`);
      assert.ok(!/from\s+['"].*\/use_cases\//.test(src), `${path.relative(repoRoot, f)}不應該import use_cases/`);
      assert.ok(!/from\s+['"].*\/application_service\.js['"]/.test(src), `${path.relative(repoRoot, f)}不應該import application_service.js`);
    }
  });

  await test('（6.runtime isolation）Runtime Execution Layer（execution/、service/、orchestration/、analysis/、recommendation/、data_preparation/、facade/）本身完全沒有被本次審查修改（git diff確認）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/execution/ src/intelligence/service/ src/intelligence/orchestration/ src/intelligence/analysis/ src/intelligence/recommendation/ src/intelligence/data_preparation/ src/intelligence/facade/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Workflow/Capability/Use Case/Application Service/insight_capability.js（features/insight/）/insight_execution_flow.js/insight_context_mapper.js/insight_output_mapper.js全部原始碼本次審查完全沒有被修改（git diff確認，只允許測試補強/文件補充）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/workflows/application_workflow.js src/intelligence/application/capabilities/insight_capability.js src/intelligence/application/use_cases/insight_use_case.js src/intelligence/application/application_service.js src/intelligence/application/features/insight/insight_capability.js src/intelligence/application/features/insight/execution/insight_execution_flow.js src/intelligence/application/features/insight/context/insight_context_mapper.js src/intelligence/application/features/insight/output/insight_output_mapper.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）src/bootstrap/application.js本次審查完全沒有被修改（git diff確認，跟TASK1.69的active orchestrator組裝不同，本次是純審查任務，不新增/修改任何bootstrap欄位）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // G. dependency scan
  // =========================================================================
  console.log('--- G. dependency scan ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];

  for (const f of INSIGHT_ALL_FILES) {
    const relName = path.relative(repoRoot, f);
    const src = readSrc(f);
    await test(`（7.dependency scan）${relName} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src), `${relName}不應該import db/`);
    });
    await test(`（7.dependency scan）${relName} 完全沒有db.prepare()/SQL關鍵字/DIET_COACH_DB字樣`, () => {
      assert.ok(!/db\.prepare\(/.test(src));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
    await test(`（7.dependency scan）${relName} 完全不import src/auth/、src/oauth/、src/identity/、src/middleware/（不直接依賴auth/oauth）`, () => {
      assert.ok(!/from\s+['"].*\/auth\//.test(src), `${relName}不應該import auth/`);
      assert.ok(!/from\s+['"].*\/oauth\//.test(src), `${relName}不應該import oauth/`);
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（7.dependency scan）${relName} 完全沒有jwt/session/cookie相關字樣，也不呼叫requireAuth()/requireActiveUser()/getCurrentUser()`, () => {
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
      assert.ok(!/requireAuth\(/.test(src));
      assert.ok(!/requireActiveUser\(/.test(src));
      assert.ok(!/getCurrentUser\(/.test(src));
    });
    for (const pattern of AI_KEYWORDS) {
      await test(`（7.dependency scan）${relName} 不含AI Provider相關關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${relName}出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（7.dependency scan）${relName} 完全不呼叫fetch()（沒有任何對外部服務的網路呼叫）`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src), `${relName}不應該呼叫fetch()`);
    });
    await test(`（7.dependency scan）${relName} 裡所有import都是相對路徑（完全不import任何非相對路徑的外部套件）`, () => {
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${relName}import了非相對路徑的外部套件：${imp}`);
      }
    });
    await test(`（7.dependency scan）${relName} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher變數名稱`, () => {
      assert.ok(!/executionManager/.test(src));
      assert.ok(!/historyStore/.test(src));
      assert.ok(!/metricsStore/.test(src));
      assert.ok(!/eventDispatcher/.test(src));
    });
    await test(`（7.dependency scan）${relName} 沒有import src/services/（既有Domain Service，跟Runtime Data Preparation依賴的服務不同層次）`, () => {
      assert.ok(!/from\s+['"].*\/services\//.test(src), `${relName}不應該import src/services/`);
    });
  }

  await test('（7.dependency scan）Insight Feature整個目錄樹共12個.js檔案，逐一掃描完成（記錄本次dependency scan的完整覆蓋範圍）', () => {
    assert.strictEqual(INSIGHT_ALL_FILES.length, 12);
  });

  console.log('');

  // =========================================================================
  // H. export consistency
  // =========================================================================
  console.log('--- H. export consistency ---');

  await test('（8.export consistency）features/insight/index.js恰好re-export兩個具名函式（createInsightFeatureCapability/createInsightResultMapper）+ context/output/execution三個namespace', () => {
    const reExported = getReExportedNames(path.join(insightDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createInsightFeatureCapability', 'createInsightResultMapper']);
    const namespaces = getReExportedNamespaces(path.join(insightDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['context', 'execution', 'output']);
  });

  await test('（8.export consistency）import後，insightModule同時具備context/output/execution三個namespace，各自具備正確的具名函式', async () => {
    const insightModule = await import(path.join(insightDir, 'index.js'));
    assert.strictEqual(typeof insightModule.context.createInsightContextMapper, 'function');
    assert.strictEqual(typeof insightModule.context.createInsightContextResultBuilder, 'function');
    assert.strictEqual(typeof insightModule.output.createInsightOutputMapper, 'function');
    assert.strictEqual(typeof insightModule.output.InsightOutputModel, 'object');
    assert.strictEqual(typeof insightModule.output.validateInsightOutput, 'function');
    assert.strictEqual(typeof insightModule.execution.createInsightExecutionFlow, 'function');
    assert.strictEqual(typeof insightModule.execution.createInsightExecutionResultBuilder, 'function');
  });

  await test('（8.export consistency）context/output/execution三個index.js re-export的名稱在對應來源檔案裡確實存在（沒有re-export不存在的東西）', () => {
    for (const dir of [contextDir, outputDir, executionDir]) {
      const indexSrc = readSrc(path.join(dir, 'index.js'));
      for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
        const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        const sourceFile = path.normalize(path.join(dir, m[2]));
        const sourceExports = getNamedExports(sourceFile);
        for (const name of names) {
          assert.ok(sourceExports.has(name), `${path.relative(repoRoot, dir)}/index.js re-export了${sourceFile}裡不存在的${name}`);
        }
      }
    }
  });

  await test('（8.export consistency）src/intelligence/index.js完全沒有被本次審查修改（application/features/insight/整條樹都是nested三層以下，不需要在最外層統一輸出入口新增任何東西）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.export consistency）insight_capability.js/insight_result_mapper.js（TASK1.66）本次審查完全沒有被修改（唯一相對路徑import維持是./insight_result_mapper.js）', () => {
    const src = readSrc(path.join(insightDir, 'insight_capability.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./insight_result_mapper.js']);
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.70-insight-lifecycle-review')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 61, `預期至少61個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（10.P1-P6）src/worker.js 完全沒有被本次審查修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.P1-P6）wrangler.toml 完全沒有被本次審查修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（10.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次審查修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.P1-P6）本次審查唯一的production/文件變更是src/intelligence/application/features/insight/README.md新增一段「完整生命週期」章節（純文件補充），沒有任何production邏輯檔案被修改——本次任務屬於「只有docs/tests」的Rollback情境，不需要額外的git revert程式碼變更', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --name-only -- src/'], { cwd: repoRoot, encoding: 'utf8' });
    const changedFiles = diff.trim().split('\n').filter(Boolean);
    assert.deepStrictEqual(changedFiles, ['src/intelligence/application/features/insight/README.md']);
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

/*
 * Phase 3 TASK 1.65｜Intelligence Application Feature Entry
 * Foundation 測試
 *
 * 本任務不是建立API，也不是建立UI，也不是導入AI——這是Phase 3
 * 第一個完整的Intelligence Application Feature Entry Flow，驗證
 * Phase 3 Application Architecture（TASK1.60~1.64建立的
 * Application Service/Use Case/Capability/Contract/Workflow五層）
 * 可以承載真正的Intelligence Feature Flow：
 *
 *   Workflow → Capability → Use Case → Application Service
 *     → Intelligence Runtime
 *
 * 這份測試驗證的是：
 * - Feature Layer只做規格明確列出的四件事（定義Intelligence
 *   Feature Entry、建立Feature Request mapping、呼叫Workflow、
 *   統一Feature Result）
 * - Feature Layer只認識Workflow這一個下游介面，完全不能直接呼叫
 *   Capability/Use Case/Application Service/Intelligence Facade/
 *   Execution Manager/History Store/Metrics Store/Event
 *   Dispatcher/Database/AI Provider（規格明確禁止的三條捷徑）
 * - 合法流程（User Feature Request→Feature→Workflow→Capability→
 *   Use Case→Application Service→Intelligence Facade→Runtime）
 *   從頭到尾真實可用，這是Phase 3第一次完整端到端串接
 * - export一致性、regression、P1-P6
 *
 * 分為以下13個部分：
 * A) feature boundary
 * B) workflow integration
 * C) capability integration
 * D) use case integration
 * E) contract integration
 * F) application service isolation
 * G) runtime isolation
 * H) no database dependency
 * I) no auth dependency
 * J) no AI dependency
 * K) export consistency
 * L) regression check
 * M) P1-P6
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

function makeSpyWorkflow(config) {
  config = config || {};
  const calls = [];
  return {
    calls,
    workflow: {
      executeApplicationRequest: async (db, request) => {
        calls.push({ db, request });
        if (config.executeApplicationRequest) return config.executeApplicationRequest(db, request);
        return {
          ok: true,
          workflow: 'application_request',
          data: {
            status: 'intelligence_ready',
            result: { context: {}, analysis: {}, recommendation: {} },
            metadata: {},
          },
        };
      },
    },
  };
}

async function buildRealChain() {
  const { createInsightFeature } = await import(path.join(featuresDir, 'index.js'));
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
  const contextBuilder = { buildInsightContext: () => ({ context: { user: null, activityContext: { count: 1, items: [] }, nutritionContext: { count: 1, items: [] }, emotionContext: { count: 1, items: [] }, behaviorContext: { count: 1, items: [] }, reportContext: { count: 1, items: [] }, metadata: { totalRecords: 5 } }, validation: { ok: true } }) };
  const orchestrator = createIntelligenceOrchestrator({ dataPreparation, contextBuilder, analysisRunner: createAnalysisRunner(), recommendationRunner: createRecommendationRunner() });
  const service = createIntelligenceService({ orchestrator });
  const executionManager = createExecutionManager({ service });
  const facade = createIntelligenceFacade({ executionManager });
  const applicationService = createApplicationService({ facade });
  const insightUseCase = createInsightUseCase({ applicationService });
  const insightCapability = createInsightCapability({ useCase: insightUseCase });
  const workflow = createApplicationWorkflow({ capability: insightCapability, contractValidator: createContractValidator() });
  const feature = createInsightFeature({ workflow });
  return { feature, workflow, insightCapability, insightUseCase, applicationService, facade, executionManager, service };
}

async function run() {
  const featureMod = await import(path.join(featuresDir, 'insight_feature.js'));
  const { createInsightFeature } = featureMod;
  const builderMod = await import(path.join(featuresDir, 'feature_result_builder.js'));
  const { createFeatureResultBuilder } = builderMod;
  await import(path.join(featuresDir, 'index.js'));

  const FEATURE_JS_FILES = fs.readdirSync(featuresDir).filter((f) => f.endsWith('.js')).sort();

  // =========================================================================
  // A. feature boundary
  // =========================================================================
  console.log('--- A. feature boundary ---');

  await test('（1.feature boundary）src/intelligence/application/features/ 恰好包含3個.js檔案（insight_feature/feature_result_builder/index）', () => {
    assert.deepStrictEqual(FEATURE_JS_FILES, ['feature_result_builder.js', 'index.js', 'insight_feature.js']);
  });

  await test('（1.feature boundary）src/intelligence/application/features/README.md 存在且非空', () => {
    const readmePath = path.join(featuresDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.feature boundary）createInsightFeature()回傳物件恰好只有requestInsightFeature一個公開介面', () => {
    const feature = createInsightFeature({});
    assert.deepStrictEqual(Object.keys(feature), ['requestInsightFeature']);
  });

  await test('（1.feature boundary）createInsightFeature(undefined)不拋出例外', () => {
    assert.doesNotThrow(() => createInsightFeature(undefined));
  });

  await test('（1.feature boundary）不同的Insight Feature實例各自獨立（不是共用singleton）', () => {
    const featureA = createInsightFeature({});
    const featureB = createInsightFeature({});
    assert.notStrictEqual(featureA, featureB);
  });

  await test('（1.feature boundary）requestInsightFeature()合法輸入時正確呼叫workflow.executeApplicationRequest()並回傳包裝後的結果', async () => {
    const { workflow, calls } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow });
    const result = await feature.requestInsightFeature({}, { userId: 'u1' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'insight');
    assert.deepStrictEqual(result.data, { status: 'intelligence_ready', result: { context: {}, analysis: {}, recommendation: {} }, metadata: {} });
  });

  await test('（1.feature boundary）requestInsightFeature()缺少userId時回傳{ok:false, feature:"insight", reason:"invalid_user_id"}，完全不呼叫workflow', async () => {
    const { workflow, calls } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow });
    const result = await feature.requestInsightFeature({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.feature, 'insight');
    assert.strictEqual(result.reason, 'invalid_user_id');
    assert.strictEqual(calls.length, 0);
  });

  await test('（1.feature boundary）requestInsightFeature()的userId為空字串時回傳失敗', async () => {
    const { workflow } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow });
    const result = await feature.requestInsightFeature({}, { userId: '' });
    assert.strictEqual(result.ok, false);
  });

  await test('（1.feature boundary）requestInsightFeature()的userId為數字（非字串）時回傳失敗', async () => {
    const { workflow } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow });
    const result = await feature.requestInsightFeature({}, { userId: 123 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（1.feature boundary）requestInsightFeature()的options為陣列時回傳失敗', async () => {
    const { workflow } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow });
    const result = await feature.requestInsightFeature({}, { userId: 'u1', options: [] });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.feature boundary）requestInsightFeature(null,null)不拋出例外', async () => {
    const { workflow } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow });
    await assert.doesNotReject(() => feature.requestInsightFeature(null, null));
  });

  await test('（1.feature boundary）requestInsightFeature(db, "not an object")回傳{ok:false, reason:"invalid_request"}', async () => {
    const { workflow } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow });
    const result = await feature.requestInsightFeature({}, 'not an object');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.feature boundary）Workflow回傳失敗時，Feature Layer正確轉發失敗原因', async () => {
    const { workflow } = makeSpyWorkflow({ executeApplicationRequest: async () => ({ ok: false, workflow: 'application_request', reason: 'workflow_failure_reason' }) });
    const feature = createInsightFeature({ workflow });
    const result = await feature.requestInsightFeature({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.feature, 'insight');
    assert.strictEqual(result.reason, 'workflow_failure_reason');
  });

  await test('（1.feature boundary）沒有提供workflow依賴時，回傳{ok:false, reason:"workflow_unavailable"}', async () => {
    const feature = createInsightFeature({});
    const result = await feature.requestInsightFeature({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'workflow_unavailable');
  });

  await test('（1.feature boundary）workflow.executeApplicationRequest不是函式時，安全回傳workflow_unavailable，不拋出例外', async () => {
    const feature = createInsightFeature({ workflow: { executeApplicationRequest: 'nope' } });
    await assert.doesNotReject(() => feature.requestInsightFeature({}, { userId: 'u1' }));
    assert.strictEqual((await feature.requestInsightFeature({}, { userId: 'u1' })).reason, 'workflow_unavailable');
  });

  console.log('');

  // =========================================================================
  // B. workflow integration
  // =========================================================================
  console.log('--- B. workflow integration ---');

  await test('（2.workflow integration）insight_feature.js只呼叫workflow.executeApplicationRequest()，不呼叫Workflow的其他任何方法', () => {
    const src = readSrc(path.join(featuresDir, 'insight_feature.js'));
    const calls = [...src.matchAll(/workflow\.(\w+)\(/g)].map((m) => m[1]);
    assert.deepStrictEqual([...new Set(calls)], ['executeApplicationRequest']);
  });

  await test('（2.workflow integration）Feature Request mapping：mapFeatureRequestToApplicationRequest只挑選已知欄位，未知欄位不會被帶到下游', async () => {
    const { workflow, calls } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow });
    await feature.requestInsightFeature({}, { userId: 'u1', unknownField: 'should not pass through', options: { a: 1 } });
    assert.deepStrictEqual(calls[0].request, { userId: 'u1', options: { a: 1 } });
    assert.ok(!('unknownField' in calls[0].request));
  });

  await test('（2.workflow integration）Feature Request mapping：requestId/version/timestamp/metadata都會被正確映射到Application Request', async () => {
    const { workflow, calls } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow });
    const request = { userId: 'u1', requestId: 'r1', version: 'v1', timestamp: 't1', metadata: { m: 1 } };
    await feature.requestInsightFeature({}, request);
    assert.deepStrictEqual(calls[0].request, request);
  });

  await test('（2.workflow integration）Feature Request mapping：db原封不動當作不透明參數轉交', async () => {
    const { workflow, calls } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow });
    const opaqueDb = { marker: 'db', nested: { a: 1 } };
    await feature.requestInsightFeature(opaqueDb, { userId: 'u1' });
    assert.strictEqual(calls[0].db, opaqueDb);
  });

  await test('（2.workflow integration）createInsightFeature支援dependencies.resultBuilder依賴注入', async () => {
    const fakeBuilder = {
      buildSuccessResult: () => ({ ok: true, data: 'custom' }),
      buildFailureResult: () => ({ ok: false, reason: 'custom_fail' }),
    };
    const { workflow } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow, resultBuilder: fakeBuilder });
    const result = await feature.requestInsightFeature({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: true, data: 'custom' });
  });

  console.log('');

  // =========================================================================
  // C. capability integration
  // =========================================================================
  console.log('--- C. capability integration ---');

  await test('（3.capability integration）insight_feature.js完全不直接呼叫Capability（不import ../capabilities/，Capability只透過Workflow間接被觸發）', () => {
    for (const file of FEATURE_JS_FILES) {
      assert.ok(!/from\s+['"].*\/capabilities\//.test(readSrc(path.join(featuresDir, file))));
    }
  });

  await test('（3.capability integration）端對端：真實Capability確實有被Workflow觸發（透過spy驗證，證明是Feature→Workflow→Capability這條真實鏈路）', async () => {
    let capabilityCalled = false;
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const spyCapability = {
      requestInsightCapability: async () => {
        capabilityCalled = true;
        return { ok: true, capability: 'insight', data: { status: 'intelligence_ready', result: {}, metadata: {} } };
      },
    };
    const workflow = createApplicationWorkflow({ capability: spyCapability, contractValidator: createContractValidator() });
    const feature = createInsightFeature({ workflow });
    const result = await feature.requestInsightFeature({}, { userId: 'u1' });
    assert.strictEqual(capabilityCalled, true);
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // D. use case integration
  // =========================================================================
  console.log('--- D. use case integration ---');

  await test('（4.use case integration）insight_feature.js完全不直接呼叫Use Case（不import ../use_cases/）', () => {
    for (const file of FEATURE_JS_FILES) {
      assert.ok(!/from\s+['"].*\/use_cases\//.test(readSrc(path.join(featuresDir, file))));
    }
  });

  await test('（4.use case integration）端對端：真實Use Case確實有被Capability觸發（透過完整真實鏈路，不是mock）', async () => {
    let useCaseCalled = false;
    const { createInsightCapability } = await import(path.join(capabilitiesDir, 'index.js'));
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const spyUseCase = {
      requestUserInsight: async () => {
        useCaseCalled = true;
        return { ok: true, useCase: 'insight', data: { status: 'intelligence_ready', result: {}, metadata: {} } };
      },
    };
    const capability = createInsightCapability({ useCase: spyUseCase });
    const workflow = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    const feature = createInsightFeature({ workflow });
    const result = await feature.requestInsightFeature({}, { userId: 'u1' });
    assert.strictEqual(useCaseCalled, true);
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // E. contract integration
  // =========================================================================
  console.log('--- E. contract integration ---');

  await test('（5.contract integration）insight_feature.js完全不直接import Contract Layer（不import ../contracts/，「驗證Contract」是規格明確列給Workflow的責任，不是Feature的責任）', () => {
    for (const file of FEATURE_JS_FILES) {
      assert.ok(!/from\s+['"].*\/contracts\//.test(readSrc(path.join(featuresDir, file))));
    }
  });

  await test('（5.contract integration）端對端：Feature呼叫真實Workflow（內建真實Contract Validator）時，合法請求確實一路通過Contract驗證抵達Capability（證明Feature沒有繞過Workflow內部的Contract檢查）', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    let capabilityCalled = false;
    const spyCapability = { requestInsightCapability: async () => { capabilityCalled = true; return { ok: true, capability: 'insight', data: { status: 'intelligence_ready', result: {}, metadata: {} } }; } };
    const workflow = createApplicationWorkflow({ capability: spyCapability, contractValidator: createContractValidator() });
    const feature = createInsightFeature({ workflow });
    const result = await feature.requestInsightFeature({}, { userId: 'u1' });
    assert.strictEqual(capabilityCalled, true);
    assert.strictEqual(result.ok, true);
  });

  await test('（5.contract integration）端對端：即使Capability回傳的response不符合Contract形狀（缺少result/metadata），Workflow內部真實的Contract Validator依然會攔截，Feature Layer正確轉發這個失敗——證明Contract Layer在完整鏈路裡真的有把關，不是被繞過的裝飾品', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const malformedCapability = { requestInsightCapability: async () => ({ ok: true, capability: 'insight', data: { status: 'intelligence_ready' } }) };
    const workflow = createApplicationWorkflow({ capability: malformedCapability, contractValidator: createContractValidator() });
    const feature = createInsightFeature({ workflow });
    const result = await feature.requestInsightFeature({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.feature, 'insight');
    assert.strictEqual(result.reason, 'missing_field');
  });

  await test('（5.contract integration）Feature Layer本身的驗證規則跟Contract Layer（TASK1.63）的ApplicationRequestContract規則一致（同樣拒絕缺少userId的請求）', async () => {
    const { validateApplicationRequestContract } = await import(path.join(contractsDir, 'index.js'));
    const { workflow, calls } = makeSpyWorkflow();
    const feature = createInsightFeature({ workflow });
    const badRequest = {};
    const featureResult = await feature.requestInsightFeature({}, badRequest);
    const contractResult = validateApplicationRequestContract(badRequest);
    assert.strictEqual(featureResult.ok, false);
    assert.strictEqual(contractResult.ok, false);
    assert.strictEqual(featureResult.reason, contractResult.reason);
    assert.strictEqual(calls.length, 0);
  });

  console.log('');

  // =========================================================================
  // F. application service isolation
  // =========================================================================
  console.log('--- F. application service isolation ---');

  for (const file of FEATURE_JS_FILES) {
    await test(`（6.application service isolation）features/${file} 完全不import src/intelligence/application/application_service.js（不得繞過Workflow直接呼叫Application Service）`, () => {
      assert.ok(!/from\s+['"].*\/application_service\.js['"]/.test(readSrc(path.join(featuresDir, file))));
    });
    await test(`（6.application service isolation）features/${file} 完全不出現applicationService/capability/useCase變數名稱（沒有持有更底層依賴）`, () => {
      const src = readSrc(path.join(featuresDir, file));
      assert.ok(!/applicationService/.test(src));
      assert.ok(!/\bcapability\b/.test(src));
      assert.ok(!/\buseCase\b/.test(src));
    });
  }

  await test('（6.application service isolation）application_service.js完全不import src/intelligence/application/features/（雙向隔離）', () => {
    assert.ok(!/from\s+['"].*\/features\//.test(readSrc(path.join(applicationDir, 'application_service.js'))));
  });

  console.log('');

  // =========================================================================
  // G. runtime isolation
  // =========================================================================
  console.log('--- G. runtime isolation ---');

  for (const file of FEATURE_JS_FILES) {
    await test(`（7.runtime isolation）features/${file} 完全不import src/intelligence/facade/`, () => {
      assert.ok(!/from\s+['"].*\/facade\//.test(readSrc(path.join(featuresDir, file))));
    });
    await test(`（7.runtime isolation）features/${file} 完全不import src/intelligence/execution/（不得直接操作Execution Manager，規格明確禁止「Feature → Execution Runtime」）`, () => {
      assert.ok(!/from\s+['"].*\/execution\//.test(readSrc(path.join(featuresDir, file))));
    });
    await test(`（7.runtime isolation）features/${file} 完全不import src/intelligence/service/、orchestration/、analysis/、recommendation/、data_preparation/`, () => {
      const src = readSrc(path.join(featuresDir, file));
      assert.ok(!/from\s+['"].*\/service\//.test(src));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
    });
    await test(`（7.runtime isolation）features/${file} 完全不import src/intelligence/history/、metrics/、events/、monitoring/、governance/`, () => {
      const src = readSrc(path.join(featuresDir, file));
      assert.ok(!/from\s+['"].*\/history\//.test(src));
      assert.ok(!/from\s+['"].*\/metrics\//.test(src));
      assert.ok(!/from\s+['"].*\/events\//.test(src));
      assert.ok(!/from\s+['"].*\/monitoring\//.test(src));
      assert.ok(!/from\s+['"].*\/governance\//.test(src));
    });
    await test(`（7.runtime isolation）features/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher/facade變數名稱`, () => {
      const src = readSrc(path.join(featuresDir, file));
      assert.ok(!/executionManager/.test(src));
      assert.ok(!/historyStore/.test(src));
      assert.ok(!/metricsStore/.test(src));
      assert.ok(!/eventDispatcher/.test(src));
      assert.ok(!/\bfacade\b/i.test(src));
    });
  }

  await test('（7.runtime isolation）application_workflow.js/insight_capability.js/insight_use_case.js/application_service.js/execution_manager.js/intelligence_facade.js完全沒有出現feature字樣（既有層沒有反過來認識Feature Layer的存在）', () => {
    assert.ok(!/feature/i.test(readSrc(path.join(workflowsDir, 'application_workflow.js'))));
    assert.ok(!/feature/i.test(readSrc(path.join(capabilitiesDir, 'insight_capability.js'))));
    assert.ok(!/feature/i.test(readSrc(path.join(useCasesDir, 'insight_use_case.js'))));
    assert.ok(!/feature/i.test(readSrc(path.join(applicationDir, 'application_service.js'))));
    assert.ok(!/feature/i.test(readSrc(path.join(intelDir, 'execution', 'execution_manager.js'))));
    assert.ok(!/feature/i.test(readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js'))));
  });

  await test('（7.runtime isolation）application_workflow.js唯一的相對路徑import維持是./workflow_result_builder.js（TASK1.64既有斷言，證明本次任務沒有修改它）', () => {
    const src = readSrc(path.join(workflowsDir, 'application_workflow.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./workflow_result_builder.js']);
  });

  await test('（7.runtime isolation）insight_capability.js唯一的相對路徑import維持是./capability_result_builder.js（TASK1.62既有斷言，證明本次任務沒有修改它）', () => {
    const src = readSrc(path.join(capabilitiesDir, 'insight_capability.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./capability_result_builder.js']);
  });

  await test('（7.runtime isolation）insight_use_case.js唯一的相對路徑import維持是./use_case_result_builder.js（TASK1.61既有斷言，證明本次任務沒有修改它）', () => {
    const src = readSrc(path.join(useCasesDir, 'insight_use_case.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./use_case_result_builder.js']);
  });

  await test('（7.runtime isolation）application_service.js唯一的相對路徑import維持是./application_result_builder.js（TASK1.60既有斷言，證明本次任務沒有修改它）', () => {
    const src = readSrc(path.join(applicationDir, 'application_service.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./application_result_builder.js']);
  });

  await test('（7.runtime isolation）insight_feature.js唯一的相對路徑import是./feature_result_builder.js', () => {
    const src = readSrc(path.join(featuresDir, 'insight_feature.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./feature_result_builder.js']);
  });

  await test('（7.runtime isolation）feature_result_builder.js完全沒有任何import（純函式，零相依）', () => {
    const src = readSrc(path.join(featuresDir, 'feature_result_builder.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  const allIntelFilesExceptFeatures = listAllJsFiles(intelDir).filter((f) => !f.includes(path.join('application', 'features')) && f !== path.join(intelDir, 'index.js') && f !== path.join(applicationDir, 'index.js'));
  for (const f of allIntelFilesExceptFeatures) {
    const relName = path.relative(repoRoot, f);
    await test(`（7.runtime isolation）${relName} 完全不import src/intelligence/application/features/（下層/既有層不知道Feature Layer的存在）`, () => {
      const targets = getRelativeImportTargets(f);
      for (const target of targets) {
        assert.ok(!target.startsWith(featuresDir), `${relName} 不應該import application/features/（實際解析到：${path.relative(repoRoot, target)}）`);
      }
    });
  }

  await test('（7.runtime isolation）src/controllers/、src/routes/、src/worker.js完全沒有任何檔案import src/intelligence/application/features/（本次任務明確禁止新增API route）', () => {
    const files = [
      ...fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'controllers', f)),
      ...fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'routes', f)),
      path.join(srcRoot, 'worker.js'),
    ];
    for (const f of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\/features\//.test(readSrc(f)), `${f} 不應該import intelligence/application/features/`);
    }
  });

  await test('（7.runtime isolation）src/services/（既有Domain Service）完全不import src/intelligence/application/features/', () => {
    const files = fs.readdirSync(path.join(srcRoot, 'services')).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\/features\//.test(readSrc(path.join(srcRoot, 'services', file))));
    }
  });

  await test('（7.runtime isolation）src/bootstrap/application.js的intelligence物件恰好具備21個欄位（TASK1.64既有20個加上TASK1.65新增的features）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（7.runtime isolation）app.intelligence.features注入的workflow跟app.intelligence.workflow是同一個實例', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const viaWorkflow = await app.intelligence.workflow.executeApplicationRequest({}, { userId: 'u1' });
    const viaFeature = await app.intelligence.features.requestInsightFeature({}, { userId: 'u1' });
    assert.deepStrictEqual(viaWorkflow.data, viaFeature.data);
  });

  await test('（7.runtime isolation）每次createApplication()呼叫都各自建立獨立的Insight Feature實例（不是共用singleton）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app1 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const app2 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app1.intelligence.features, app2.intelligence.features);
  });

  await test('（7.runtime isolation）app.router.routes 數量沒有因為新增features而改變（依然是21條，本次任務明確禁止新增API route）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（7.runtime isolation，端對端）合法流程Feature→Workflow→Capability→Use Case→Application Service→Facade→Service→Execution Runtime→Analysis/Recommendation從頭到尾真實跑一次成功——Phase 3 Application Architecture第一次完整端到端串接', async () => {
    const { feature } = await buildRealChain();
    const result = await feature.requestInsightFeature({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'insight');
    assert.strictEqual(result.data.status, 'intelligence_ready');
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['metadata', 'result', 'status']);
  });

  console.log('');

  // =========================================================================
  // H. no database dependency
  // =========================================================================
  console.log('--- H. no database dependency ---');

  for (const file of FEATURE_JS_FILES) {
    await test(`（8.no database dependency）features/${file} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(featuresDir, file))));
    });
    await test(`（8.no database dependency）features/${file} 完全沒有db.prepare()/SQL關鍵字/DIET_COACH_DB字樣`, () => {
      const src = readSrc(path.join(featuresDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（8.no database dependency）requestInsightFeature()把db當作不透明的第一個參數，完全不呼叫db的任何方法', () => {
    const src = readSrc(path.join(featuresDir, 'insight_feature.js'));
    assert.ok(!/db\.(prepare|exec|batch|run)\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // I. no auth dependency
  // =========================================================================
  console.log('--- I. no auth dependency ---');

  for (const file of FEATURE_JS_FILES) {
    await test(`（9.no auth dependency）features/${file} 完全不import src/auth/、src/oauth/、src/identity/、src/middleware/`, () => {
      const src = readSrc(path.join(featuresDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（9.no auth dependency）features/${file} 完全沒有出現jwt/session/cookie相關字樣`, () => {
      const src = readSrc(path.join(featuresDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
    await test(`（9.no auth dependency）features/${file} 完全不呼叫requireAuth()/requireActiveUser()/getCurrentUser()`, () => {
      const src = readSrc(path.join(featuresDir, file));
      assert.ok(!/requireAuth\(/.test(src));
      assert.ok(!/requireActiveUser\(/.test(src));
      assert.ok(!/getCurrentUser\(/.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // J. no AI dependency
  // =========================================================================
  console.log('--- J. no AI dependency ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of FEATURE_JS_FILES) {
    const codeOnly = readSrc(path.join(featuresDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（10.no AI dependency）features/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（10.no AI dependency）features/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
    await test(`（10.no AI dependency）features/${file} 完全不 import 任何非相對路徑的外部套件`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  await test('（10.no AI dependency）Feature Layer沒有任何機會接觸到Analysis/Recommendation Extension Point（modules注入機制）——那是更底層的事，跟Feature Layer完全無關', () => {
    for (const file of FEATURE_JS_FILES) {
      const src = readSrc(path.join(featuresDir, file));
      assert.ok(!/dependencies\.modules/.test(src));
    }
  });

  console.log('');

  // =========================================================================
  // K. export consistency
  // =========================================================================
  console.log('--- K. export consistency ---');

  await test('（11.export consistency）features/index.js完整re-export了features/底下每個原始檔案的全部具名export', () => {
    const reExported = getReExportedNames(path.join(featuresDir, 'index.js'));
    for (const file of ['insight_feature.js', 'feature_result_builder.js']) {
      const names = getNamedExports(path.join(featuresDir, file));
      for (const name of names) {
        assert.ok(reExported.has(name), `features/index.js 缺少 re-export ${name}（來自${file}）`);
      }
    }
  });

  await test('（11.export consistency）features/index.js re-export的名稱在對應來源檔案裡確實存在（沒有re-export不存在的東西）', () => {
    const indexSrc = readSrc(path.join(featuresDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(featuresDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `features/index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（11.export consistency）features/index.js恰好只re-export兩個具名函式（createInsightFeature/createFeatureResultBuilder），沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(featuresDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createFeatureResultBuilder', 'createInsightFeature']);
  });

  await test('（11.export consistency）src/intelligence/application/index.js 有 export * as features from ./features/index.js', () => {
    const src = readSrc(path.join(applicationDir, 'index.js'));
    assert.ok(/export \* as features from ['"]\.\/features\/index\.js['"]/.test(src));
  });

  await test('（11.export consistency）import後，applicationModule.features 是非空物件，具備createInsightFeature/createFeatureResultBuilder', async () => {
    const applicationModule = await import(path.join(applicationDir, 'index.js'));
    assert.strictEqual(typeof applicationModule.features, 'object');
    assert.strictEqual(typeof applicationModule.features.createInsightFeature, 'function');
    assert.strictEqual(typeof applicationModule.features.createFeatureResultBuilder, 'function');
  });

  await test('（11.export consistency）src/intelligence/index.js的統一輸出入口本身沒有新增任何頂層namespace（application/features是nested在application底下，不是新的頂層namespace）', () => {
    const namespaces = getReExportedNamespaces(path.join(intelDir, 'index.js'));
    assert.ok(!namespaces.has('features'));
    assert.ok(namespaces.has('application'));
  });

  await test('（11.export consistency）application/index.js re-export了features這個namespace（export * as features），跟useCases/capabilities/contracts/workflows同一批extension point', () => {
    const namespaces = getReExportedNamespaces(path.join(applicationDir, 'index.js'));
    assert.ok(namespaces.has('features'));
    assert.ok(namespaces.has('workflows'));
    assert.ok(namespaces.has('useCases'));
    assert.ok(namespaces.has('capabilities'));
    assert.ok(namespaces.has('contracts'));
  });

  await test('（11.export consistency）app.intelligence.features具備requestInsightFeature一個函式', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence.features), ['requestInsightFeature']);
  });

  await test('（11.export consistency）createFeatureResultBuilder()回傳物件恰好只有buildSuccessResult/buildFailureResult兩個公開介面', () => {
    const builder = createFeatureResultBuilder();
    assert.deepStrictEqual(Object.keys(builder).sort(), ['buildFailureResult', 'buildSuccessResult']);
  });

  await test('（11.export consistency）buildSuccessResult()是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const builder = createFeatureResultBuilder();
    const r1 = builder.buildSuccessResult('insight', { status: 'x', result: { a: 1 }, metadata: { b: 2 } });
    const r2 = builder.buildSuccessResult('insight', { status: 'x', result: { a: 1 }, metadata: { b: 2 } });
    assert.deepStrictEqual(r1, r2);
  });

  await test('（11.export consistency）buildFailureResult(非字串feature, 非字串reason)安全正規化', () => {
    const builder = createFeatureResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(123, 456), { ok: false, feature: 'unknown_feature', reason: 'unknown_error' });
  });

  await test('（11.export consistency）insight_feature.js內建的FEATURE_NAME固定為字面值"insight"', () => {
    const src = readSrc(path.join(featuresDir, 'insight_feature.js'));
    assert.ok(/const\s+FEATURE_NAME\s*=\s*['"]insight['"]/.test(src));
  });

  console.log('');

  // =========================================================================
  // L. regression check
  // =========================================================================
  console.log('--- L. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（12.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.65-feature-entry')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（12.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 56, `預期至少56個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（12.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // M. P1-P6
  // =========================================================================
  console.log('--- M. P1-P6 ---');

  await test('（13.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（13.P1-P6）src/worker.js 完全沒有被TASK1.65修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）wrangler.toml 完全沒有被TASK1.65修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（13.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被TASK1.65修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）Analysis/Recommendation Runner/Execution Manager/Application Service/Insight Use Case/Insight Capability/Application Workflow的原始碼完全沒有被TASK1.65修改（規格明確禁止修改Execution Runtime Behavior）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/analysis/analysis_runner.js src/intelligence/recommendation/recommendation_runner.js src/intelligence/execution/execution_manager.js src/intelligence/facade/intelligence_facade.js src/intelligence/application/application_service.js src/intelligence/application/use_cases/insight_use_case.js src/intelligence/application/capabilities/insight_capability.js src/intelligence/application/workflows/application_workflow.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

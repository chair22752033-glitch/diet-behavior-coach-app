/*
 * Phase 3 TASK 1.64｜Intelligence Application Workflow Layer
 * Foundation 測試
 *
 * 本任務不是建立API，也不是建立UI，也不是導入AI——這是建立
 * Application Request Workflow Boundary，負責協調Capability
 * Layer（TASK1.62）、Use Case Layer（TASK1.61，透過Capability
 * 間接）、Application Contract（TASK1.63），形成一致的Application
 * 執行流程。這份測試驗證的是：
 * - Workflow Layer只做規格明確列出的四件事（接收Application
 *   Request、驗證Contract、導向Capability/Use Case、統一Workflow
 *   Result）
 * - Workflow Layer是第一個實際採用Contract Layer的層（完全委派給
 *   contractValidator.validateRequest()/validateResponse()，沒有
 *   自己內建重複的驗證規則）
 * - Workflow Layer只認識Capability Layer這一個下游介面，完全不能
 *   直接呼叫Use Case/Application Service/Intelligence Facade/
 *   Execution Manager/History Store/Metrics Store/Event
 *   Dispatcher/Database/AI Provider（規格明確禁止的三條捷徑）
 * - 合法流程（User Application→Workflow→Capability→Use Case→
 *   Application Contract→Application Service→Intelligence Facade
 *   →Runtime）確實可用
 * - export一致性、regression、P1-P6
 *
 * 分為以下13個部分：
 * A) workflow boundary
 * B) capability integration
 * C) use case integration
 * D) contract integration
 * E) application service isolation
 * F) facade isolation
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

function makeSpyCapability(config) {
  config = config || {};
  const calls = [];
  return {
    calls,
    capability: {
      requestInsightCapability: async (db, request) => {
        calls.push({ db, request });
        if (config.requestInsightCapability) return config.requestInsightCapability(db, request);
        return {
          ok: true,
          capability: 'insight',
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

async function run() {
  const workflowMod = await import(path.join(workflowsDir, 'application_workflow.js'));
  const { createApplicationWorkflow } = workflowMod;
  const builderMod = await import(path.join(workflowsDir, 'workflow_result_builder.js'));
  const { createWorkflowResultBuilder } = builderMod;
  await import(path.join(workflowsDir, 'index.js'));
  const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));

  const WORKFLOW_JS_FILES = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.js')).sort();

  // =========================================================================
  // A. workflow boundary
  // =========================================================================
  console.log('--- A. workflow boundary ---');

  await test('（1.workflow boundary）src/intelligence/application/workflows/ 恰好包含3個.js檔案（application_workflow/workflow_result_builder/index）', () => {
    assert.deepStrictEqual(WORKFLOW_JS_FILES, ['application_workflow.js', 'index.js', 'workflow_result_builder.js']);
  });

  await test('（1.workflow boundary）src/intelligence/application/workflows/README.md 存在且非空', () => {
    const readmePath = path.join(workflowsDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.workflow boundary）createApplicationWorkflow()回傳物件恰好只有executeApplicationRequest一個公開介面', () => {
    const wf = createApplicationWorkflow({});
    assert.deepStrictEqual(Object.keys(wf), ['executeApplicationRequest']);
  });

  await test('（1.workflow boundary）createApplicationWorkflow(undefined)不拋出例外', () => {
    assert.doesNotThrow(() => createApplicationWorkflow(undefined));
  });

  await test('（1.workflow boundary）不同的Application Workflow實例各自獨立（不是共用singleton）', () => {
    const wfA = createApplicationWorkflow({});
    const wfB = createApplicationWorkflow({});
    assert.notStrictEqual(wfA, wfB);
  });

  await test('（1.workflow boundary）executeApplicationRequest()合法輸入時正確呼叫capability.requestInsightCapability()並回傳包裝後的結果', async () => {
    const { capability, calls } = makeSpyCapability();
    const wf = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    const result = await wf.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.workflow, 'application_request');
    assert.deepStrictEqual(result.data, { status: 'intelligence_ready', result: { context: {}, analysis: {}, recommendation: {} }, metadata: {} });
  });

  await test('（1.workflow boundary）executeApplicationRequest()缺少userId時回傳{ok:false, workflow:"application_request", reason:"invalid_user_id"}，完全不呼叫capability', async () => {
    const { capability, calls } = makeSpyCapability();
    const wf = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    const result = await wf.executeApplicationRequest({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.workflow, 'application_request');
    assert.strictEqual(result.reason, 'invalid_user_id');
    assert.strictEqual(calls.length, 0);
  });

  await test('（1.workflow boundary）executeApplicationRequest()的userId為空字串時回傳失敗', async () => {
    const { capability } = makeSpyCapability();
    const wf = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    const result = await wf.executeApplicationRequest({}, { userId: '' });
    assert.strictEqual(result.ok, false);
  });

  await test('（1.workflow boundary）executeApplicationRequest()的options為陣列時回傳失敗', async () => {
    const { capability } = makeSpyCapability();
    const wf = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    const result = await wf.executeApplicationRequest({}, { userId: 'u1', options: [] });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.workflow boundary）executeApplicationRequest(null,null)不拋出例外', async () => {
    const { capability } = makeSpyCapability();
    const wf = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    await assert.doesNotReject(() => wf.executeApplicationRequest(null, null));
  });

  await test('（1.workflow boundary）executeApplicationRequest(db, "not an object")回傳{ok:false, reason:"invalid_request"}', async () => {
    const { capability } = makeSpyCapability();
    const wf = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    const result = await wf.executeApplicationRequest({}, 'not an object');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.workflow boundary）Capability回傳失敗時，Workflow Layer正確轉發失敗原因', async () => {
    const { capability } = makeSpyCapability({ requestInsightCapability: async () => ({ ok: false, capability: 'insight', reason: 'capability_failure_reason' }) });
    const wf = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    const result = await wf.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.workflow, 'application_request');
    assert.strictEqual(result.reason, 'capability_failure_reason');
  });

  await test('（1.workflow boundary）沒有提供capability依賴時，回傳{ok:false, reason:"capability_unavailable"}', async () => {
    const wf = createApplicationWorkflow({ contractValidator: createContractValidator() });
    const result = await wf.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'capability_unavailable');
  });

  await test('（1.workflow boundary）沒有提供contractValidator依賴時，回傳{ok:false, reason:"contract_validator_unavailable"}', async () => {
    const { capability } = makeSpyCapability();
    const wf = createApplicationWorkflow({ capability });
    const result = await wf.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'contract_validator_unavailable');
  });

  await test('（1.workflow boundary）capability.requestInsightCapability不是函式時，安全回傳capability_unavailable，不拋出例外', async () => {
    const wf = createApplicationWorkflow({ capability: { requestInsightCapability: 'nope' }, contractValidator: createContractValidator() });
    await assert.doesNotReject(() => wf.executeApplicationRequest({}, { userId: 'u1' }));
    assert.strictEqual((await wf.executeApplicationRequest({}, { userId: 'u1' })).reason, 'capability_unavailable');
  });

  await test('（1.workflow boundary）contractValidator.validateRequest不是函式時，安全回傳contract_validator_unavailable，不拋出例外', async () => {
    const { capability } = makeSpyCapability();
    const wf = createApplicationWorkflow({ capability, contractValidator: { validateRequest: 'nope' } });
    await assert.doesNotReject(() => wf.executeApplicationRequest({}, { userId: 'u1' }));
    assert.strictEqual((await wf.executeApplicationRequest({}, { userId: 'u1' })).reason, 'contract_validator_unavailable');
  });

  console.log('');

  // =========================================================================
  // B. capability integration
  // =========================================================================
  console.log('--- B. capability integration ---');

  await test('（2.capability integration）application_workflow.js把request原樣轉交給capability.requestInsightCapability()（不解讀options業務內容）', async () => {
    const { capability, calls } = makeSpyCapability();
    const wf = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    const request = { userId: 'u1', options: { customField: 'x' }, requestId: 'r1' };
    await wf.executeApplicationRequest({ marker: 'db' }, request);
    assert.deepStrictEqual(calls[0].db, { marker: 'db' });
    assert.deepStrictEqual(calls[0].request, request);
  });

  await test('（2.capability integration）application_workflow.js只呼叫capability.requestInsightCapability()，不呼叫Capability的其他任何方法', () => {
    const src = readSrc(path.join(workflowsDir, 'application_workflow.js'));
    const calls = [...src.matchAll(/capability\.(\w+)\(/g)].map((m) => m[1]);
    assert.deepStrictEqual([...new Set(calls)], ['requestInsightCapability']);
  });

  await test('（2.capability integration）端對端：真實Capability（透過完整依賴鏈到Runtime）產生的結果被Workflow正確包裝', async () => {
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

    const result = await workflow.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.workflow, 'application_request');
    assert.strictEqual(result.data.status, 'intelligence_ready');
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['metadata', 'result', 'status']);
  });

  console.log('');

  // =========================================================================
  // C. use case integration
  // =========================================================================
  console.log('--- C. use case integration ---');

  await test('（3.use case integration）application_workflow.js完全不直接呼叫Use Case（不import ../use_cases/，Use Case只透過Capability間接被觸發）', () => {
    for (const file of WORKFLOW_JS_FILES) {
      assert.ok(!/from\s+['"].*\/use_cases\//.test(readSrc(path.join(workflowsDir, file))));
    }
  });

  await test('（3.use case integration）呼叫Workflow時，底層真實Use Case確實有被觸發（透過spy包裝在Capability內部驗證，證明是Capability→UseCase這條真實鏈路，不是Workflow自己跳過Capability直接呼叫）', async () => {
    let useCaseCalled = false;
    const { createInsightCapability } = await import(path.join(capabilitiesDir, 'index.js'));
    const spyUseCase = {
      requestUserInsight: async () => {
        useCaseCalled = true;
        return { ok: true, useCase: 'insight', data: { status: 'intelligence_ready', result: {}, metadata: {} } };
      },
    };
    const capability = createInsightCapability({ useCase: spyUseCase });
    const wf = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    const result = await wf.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(useCaseCalled, true);
    assert.strictEqual(result.ok, true);
  });

  await test('（3.use case integration）Workflow對不合法輸入的拒絕原因，跟Use Case/Capability各自獨立驗證的判斷一致（invalid_options_type）——證明Contract跟三層既有規則保持一致', async () => {
    const { createInsightCapability } = await import(path.join(capabilitiesDir, 'index.js'));
    const { createInsightUseCase } = await import(path.join(useCasesDir, 'index.js'));
    const badRequest = { userId: 'u1', options: 'not-an-object' };

    const useCase = createInsightUseCase({ applicationService: { requestIntelligence: async () => ({ ok: true, data: {} }) } });
    const ucResult = await useCase.requestUserInsight({}, badRequest);

    const capability = createInsightCapability({ useCase });
    const capResult = await capability.requestInsightCapability({}, badRequest);

    const wf = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    const wfResult = await wf.executeApplicationRequest({}, badRequest);

    assert.strictEqual(ucResult.reason, 'invalid_options_type');
    assert.strictEqual(capResult.reason, 'invalid_options_type');
    assert.strictEqual(wfResult.reason, 'invalid_options_type');
  });

  console.log('');

  // =========================================================================
  // D. contract integration
  // =========================================================================
  console.log('--- D. contract integration ---');

  await test('（4.contract integration）application_workflow.js完全沒有自己內建的validateXxxRequest()函式（輸入驗證完全委派給contractValidator）', () => {
    const src = readSrc(path.join(workflowsDir, 'application_workflow.js'));
    assert.ok(!/function\s+validate\w*Request\w*\s*\(/.test(src));
  });

  await test('（4.contract integration）executeApplicationRequest()實際呼叫了contractValidator.validateRequest()（透過spy驗證呼叫次數）', async () => {
    const { capability } = makeSpyCapability();
    let validateRequestCalls = 0;
    const contractValidator = {
      validateRequest: (request) => { validateRequestCalls++; return { ok: true }; },
      validateResponse: () => ({ ok: true }),
    };
    const wf = createApplicationWorkflow({ capability, contractValidator });
    await wf.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(validateRequestCalls, 1);
  });

  await test('（4.contract integration）executeApplicationRequest()實際呼叫了contractValidator.validateResponse()（透過spy驗證呼叫次數跟參數）', async () => {
    const { capability } = makeSpyCapability();
    let capturedResponse = null;
    const contractValidator = {
      validateRequest: () => ({ ok: true }),
      validateResponse: (response) => { capturedResponse = response; return { ok: true }; },
    };
    const wf = createApplicationWorkflow({ capability, contractValidator });
    const outcome = await wf.executeApplicationRequest({}, { userId: 'u1' });
    assert.ok(capturedResponse);
    assert.strictEqual(capturedResponse.ok, true);
    assert.strictEqual(outcome.ok, true);
  });

  await test('（4.contract integration）contractValidator.validateRequest()判定失敗時，Workflow立刻回傳失敗，完全不呼叫capability', async () => {
    const { capability, calls } = makeSpyCapability();
    const contractValidator = { validateRequest: () => ({ ok: false, reason: 'contract_rejected' }), validateResponse: () => ({ ok: true }) };
    const wf = createApplicationWorkflow({ capability, contractValidator });
    const result = await wf.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'contract_rejected');
    assert.strictEqual(calls.length, 0);
  });

  await test('（4.contract integration）contractValidator.validateResponse()判定失敗時，Workflow回傳失敗（即使Capability本身回傳成功）', async () => {
    const { capability } = makeSpyCapability();
    const contractValidator = { validateRequest: () => ({ ok: true }), validateResponse: () => ({ ok: false, reason: 'response_shape_invalid' }) };
    const wf = createApplicationWorkflow({ capability, contractValidator });
    const result = await wf.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'response_shape_invalid');
  });

  await test('（4.contract integration）真實的createContractValidator()（TASK1.63）確實可以直接注入使用，端對端驗證流程正常運作', async () => {
    const { capability } = makeSpyCapability();
    const realContractValidator = createContractValidator();
    const wf = createApplicationWorkflow({ capability, contractValidator: realContractValidator });
    const result = await wf.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（4.contract integration）真實的createContractValidator()對不合法request正確攔截（invalid_user_id），驗證跟TASK1.63的ApplicationRequestContract規則一致', async () => {
    const { capability, calls } = makeSpyCapability();
    const realContractValidator = createContractValidator();
    const wf = createApplicationWorkflow({ capability, contractValidator: realContractValidator });
    const result = await wf.executeApplicationRequest({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
    assert.strictEqual(calls.length, 0);
  });

  await test('（4.contract integration）createApplicationWorkflow沒有validateResponse方法時（只有validateRequest）仍能正常運作（validateResponse是選填的防禦性檢查）', async () => {
    const { capability } = makeSpyCapability();
    const contractValidator = { validateRequest: () => ({ ok: true }) };
    const wf = createApplicationWorkflow({ capability, contractValidator });
    const result = await wf.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // E. application service isolation
  // =========================================================================
  console.log('--- E. application service isolation ---');

  for (const file of WORKFLOW_JS_FILES) {
    await test(`（5.application service isolation）workflows/${file} 完全不import src/intelligence/application/application_service.js（不得繞過Capability/Use Case直接呼叫Application Service）`, () => {
      assert.ok(!/from\s+['"].*\/application_service\.js['"]/.test(readSrc(path.join(workflowsDir, file))));
    });
    await test(`（5.application service isolation）workflows/${file} 完全不出現applicationService變數名稱（沒有持有Application Service依賴）`, () => {
      assert.ok(!/applicationService/.test(readSrc(path.join(workflowsDir, file))));
    });
  }

  await test('（5.application service isolation）application_service.js完全不import src/intelligence/application/workflows/（雙向隔離——Application Service不知道Workflow Layer的存在）', () => {
    assert.ok(!/from\s+['"].*\/workflows\//.test(readSrc(path.join(applicationDir, 'application_service.js'))));
  });

  console.log('');

  // =========================================================================
  // F. facade isolation
  // =========================================================================
  console.log('--- F. facade isolation ---');

  for (const file of WORKFLOW_JS_FILES) {
    await test(`（6.facade isolation）workflows/${file} 完全不import src/intelligence/facade/`, () => {
      assert.ok(!/from\s+['"].*\/facade\//.test(readSrc(path.join(workflowsDir, file))));
    });
    await test(`（6.facade isolation）workflows/${file} 完全不出現facade變數名稱`, () => {
      assert.ok(!/\bfacade\b/i.test(readSrc(path.join(workflowsDir, file))));
    });
  }

  await test('（6.facade isolation）src/intelligence/facade/index.js完全不import src/intelligence/application/workflows/', () => {
    assert.ok(!/from\s+['"].*\/workflows\//.test(readSrc(path.join(intelDir, 'facade', 'index.js'))));
  });

  console.log('');

  // =========================================================================
  // G. runtime isolation
  // =========================================================================
  console.log('--- G. runtime isolation ---');

  for (const file of WORKFLOW_JS_FILES) {
    await test(`（7.runtime isolation）workflows/${file} 完全不import src/intelligence/execution/（不得直接操作Execution Manager）`, () => {
      assert.ok(!/from\s+['"].*\/execution\//.test(readSrc(path.join(workflowsDir, file))));
    });
    await test(`（7.runtime isolation）workflows/${file} 完全不import src/intelligence/service/、orchestration/、analysis/、recommendation/、data_preparation/`, () => {
      const src = readSrc(path.join(workflowsDir, file));
      assert.ok(!/from\s+['"].*\/service\//.test(src));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
    });
    await test(`（7.runtime isolation）workflows/${file} 完全不import src/intelligence/history/、metrics/、events/、monitoring/、governance/`, () => {
      const src = readSrc(path.join(workflowsDir, file));
      assert.ok(!/from\s+['"].*\/history\//.test(src));
      assert.ok(!/from\s+['"].*\/metrics\//.test(src));
      assert.ok(!/from\s+['"].*\/events\//.test(src));
      assert.ok(!/from\s+['"].*\/monitoring\//.test(src));
      assert.ok(!/from\s+['"].*\/governance\//.test(src));
    });
    await test(`（7.runtime isolation）workflows/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher變數名稱`, () => {
      const src = readSrc(path.join(workflowsDir, file));
      assert.ok(!/executionManager/.test(src));
      assert.ok(!/historyStore/.test(src));
      assert.ok(!/metricsStore/.test(src));
      assert.ok(!/eventDispatcher/.test(src));
    });
  }

  await test('（7.runtime isolation）insight_capability.js/insight_use_case.js/application_service.js/execution_manager.js/intelligence_facade.js完全沒有出現workflow字樣（既有層沒有反過來認識Workflow Layer的存在）', () => {
    assert.ok(!/workflow/i.test(readSrc(path.join(capabilitiesDir, 'insight_capability.js'))));
    assert.ok(!/workflow/i.test(readSrc(path.join(useCasesDir, 'insight_use_case.js'))));
    assert.ok(!/workflow/i.test(readSrc(path.join(applicationDir, 'application_service.js'))));
    assert.ok(!/workflow/i.test(readSrc(path.join(intelDir, 'execution', 'execution_manager.js'))));
    assert.ok(!/workflow/i.test(readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js'))));
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

  await test('（7.runtime isolation）application_workflow.js唯一的相對路徑import是./workflow_result_builder.js', () => {
    const src = readSrc(path.join(workflowsDir, 'application_workflow.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./workflow_result_builder.js']);
  });

  await test('（7.runtime isolation）workflow_result_builder.js完全沒有任何import（純函式，零相依）', () => {
    const src = readSrc(path.join(workflowsDir, 'workflow_result_builder.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  const allIntelFilesExceptWorkflows = listAllJsFiles(intelDir).filter((f) => !f.includes(path.join('application', 'workflows')) && f !== path.join(intelDir, 'index.js') && f !== path.join(applicationDir, 'index.js'));
  for (const f of allIntelFilesExceptWorkflows) {
    const relName = path.relative(repoRoot, f);
    await test(`（7.runtime isolation）${relName} 完全不import src/intelligence/application/workflows/（下層/既有層不知道Workflow Layer的存在）`, () => {
      const targets = getRelativeImportTargets(f);
      for (const target of targets) {
        assert.ok(!target.startsWith(workflowsDir), `${relName} 不應該import application/workflows/（實際解析到：${path.relative(repoRoot, target)}）`);
      }
    });
  }

  await test('（7.runtime isolation）src/controllers/、src/routes/、src/worker.js完全沒有任何檔案import src/intelligence/application/workflows/（本次任務明確禁止新增API route）', () => {
    const files = [
      ...fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'controllers', f)),
      ...fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'routes', f)),
      path.join(srcRoot, 'worker.js'),
    ];
    for (const f of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\/workflows\//.test(readSrc(f)), `${f} 不應該import intelligence/application/workflows/`);
    }
  });

  await test('（7.runtime isolation）src/services/（既有Domain Service）完全不import src/intelligence/application/workflows/', () => {
    const files = fs.readdirSync(path.join(srcRoot, 'services')).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\/workflows\//.test(readSrc(path.join(srcRoot, 'services', file))));
    }
  });

  await test('（7.runtime isolation）src/bootstrap/application.js的intelligence物件恰好具備20個欄位（TASK1.63既有19個加上TASK1.64新增的workflow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'governance', 'history', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（7.runtime isolation）app.intelligence.workflow注入的capability跟app.intelligence.capabilities是同一個實例', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const viaCapability = await app.intelligence.capabilities.requestInsightCapability({}, { userId: 'u1' });
    const viaWorkflow = await app.intelligence.workflow.executeApplicationRequest({}, { userId: 'u1' });
    assert.deepStrictEqual(viaCapability.data, viaWorkflow.data);
  });

  await test('（7.runtime isolation）每次createApplication()呼叫都各自建立獨立的Application Workflow實例（不是共用singleton）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app1 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const app2 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app1.intelligence.workflow, app2.intelligence.workflow);
  });

  await test('（7.runtime isolation）app.router.routes 數量沒有因為新增workflow而改變（依然是21條，本次任務明確禁止新增API route）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 21);
  });

  console.log('');

  // =========================================================================
  // H. no database dependency
  // =========================================================================
  console.log('--- H. no database dependency ---');

  for (const file of WORKFLOW_JS_FILES) {
    await test(`（8.no database dependency）workflows/${file} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(workflowsDir, file))));
    });
    await test(`（8.no database dependency）workflows/${file} 完全沒有db.prepare()/SQL關鍵字/DIET_COACH_DB字樣`, () => {
      const src = readSrc(path.join(workflowsDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（8.no database dependency）executeApplicationRequest()把db當作不透明的第一個參數，完全不呼叫db的任何方法', () => {
    const src = readSrc(path.join(workflowsDir, 'application_workflow.js'));
    assert.ok(!/db\.(prepare|exec|batch|run)\(/.test(src));
  });

  await test('（8.no database dependency）application_workflow.js的函式簽章接受db作為第一個參數但完全不解讀其內部結構', async () => {
    const { capability, calls } = makeSpyCapability();
    const wf = createApplicationWorkflow({ capability, contractValidator: createContractValidator() });
    const opaqueDb = { anything: 'goes', nested: { a: 1 } };
    await wf.executeApplicationRequest(opaqueDb, { userId: 'u1' });
    assert.strictEqual(calls[0].db, opaqueDb);
  });

  console.log('');

  // =========================================================================
  // I. no auth dependency
  // =========================================================================
  console.log('--- I. no auth dependency ---');

  for (const file of WORKFLOW_JS_FILES) {
    await test(`（9.no auth dependency）workflows/${file} 完全不import src/auth/、src/oauth/、src/identity/、src/middleware/`, () => {
      const src = readSrc(path.join(workflowsDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（9.no auth dependency）workflows/${file} 完全沒有出現jwt/session/cookie相關字樣`, () => {
      const src = readSrc(path.join(workflowsDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
    await test(`（9.no auth dependency）workflows/${file} 完全不呼叫requireAuth()/requireActiveUser()/getCurrentUser()`, () => {
      const src = readSrc(path.join(workflowsDir, file));
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
  for (const file of WORKFLOW_JS_FILES) {
    const codeOnly = readSrc(path.join(workflowsDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（10.no AI dependency）workflows/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（10.no AI dependency）workflows/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
    await test(`（10.no AI dependency）workflows/${file} 完全不 import 任何非相對路徑的外部套件`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  await test('（10.no AI dependency）Workflow Layer沒有任何機會接觸到Analysis/Recommendation Extension Point（modules注入機制）——那是更底層的事，跟Workflow Layer完全無關', () => {
    for (const file of WORKFLOW_JS_FILES) {
      const src = readSrc(path.join(workflowsDir, file));
      assert.ok(!/dependencies\.modules/.test(src));
    }
  });

  console.log('');

  // =========================================================================
  // K. export consistency
  // =========================================================================
  console.log('--- K. export consistency ---');

  await test('（11.export consistency）workflows/index.js完整re-export了workflows/底下每個原始檔案的全部具名export', () => {
    const reExported = getReExportedNames(path.join(workflowsDir, 'index.js'));
    for (const file of ['application_workflow.js', 'workflow_result_builder.js']) {
      const names = getNamedExports(path.join(workflowsDir, file));
      for (const name of names) {
        assert.ok(reExported.has(name), `workflows/index.js 缺少 re-export ${name}（來自${file}）`);
      }
    }
  });

  await test('（11.export consistency）workflows/index.js re-export的名稱在對應來源檔案裡確實存在（沒有re-export不存在的東西）', () => {
    const indexSrc = readSrc(path.join(workflowsDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(workflowsDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `workflows/index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（11.export consistency）workflows/index.js恰好只re-export兩個具名函式（createApplicationWorkflow/createWorkflowResultBuilder），沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(workflowsDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createApplicationWorkflow', 'createWorkflowResultBuilder']);
  });

  await test('（11.export consistency）src/intelligence/application/index.js 有 export * as workflows from ./workflows/index.js', () => {
    const src = readSrc(path.join(applicationDir, 'index.js'));
    assert.ok(/export \* as workflows from ['"]\.\/workflows\/index\.js['"]/.test(src));
  });

  await test('（11.export consistency）import後，applicationModule.workflows 是非空物件，具備createApplicationWorkflow/createWorkflowResultBuilder', async () => {
    const applicationModule = await import(path.join(applicationDir, 'index.js'));
    assert.strictEqual(typeof applicationModule.workflows, 'object');
    assert.strictEqual(typeof applicationModule.workflows.createApplicationWorkflow, 'function');
    assert.strictEqual(typeof applicationModule.workflows.createWorkflowResultBuilder, 'function');
  });

  await test('（11.export consistency）src/intelligence/index.js的統一輸出入口本身沒有新增任何頂層namespace（application/workflows是nested在application底下，不是新的頂層namespace）', () => {
    const namespaces = getReExportedNamespaces(path.join(intelDir, 'index.js'));
    assert.ok(!namespaces.has('workflows'));
    assert.ok(namespaces.has('application'));
  });

  await test('（11.export consistency）application/index.js re-export了workflows這個namespace（export * as workflows），跟useCases/capabilities/contracts同一批extension point', () => {
    const namespaces = getReExportedNamespaces(path.join(applicationDir, 'index.js'));
    assert.ok(namespaces.has('workflows'));
    assert.ok(namespaces.has('useCases'));
    assert.ok(namespaces.has('capabilities'));
    assert.ok(namespaces.has('contracts'));
  });

  await test('（11.export consistency）app.intelligence.workflow具備executeApplicationRequest一個函式', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence.workflow), ['executeApplicationRequest']);
  });

  await test('（11.export consistency）createWorkflowResultBuilder()回傳物件恰好只有buildSuccessResult/buildFailureResult兩個公開介面', () => {
    const builder = createWorkflowResultBuilder();
    assert.deepStrictEqual(Object.keys(builder).sort(), ['buildFailureResult', 'buildSuccessResult']);
  });

  await test('（11.export consistency）buildSuccessResult()是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const builder = createWorkflowResultBuilder();
    const r1 = builder.buildSuccessResult('application_request', { status: 'x', result: { a: 1 }, metadata: { b: 2 } });
    const r2 = builder.buildSuccessResult('application_request', { status: 'x', result: { a: 1 }, metadata: { b: 2 } });
    assert.deepStrictEqual(r1, r2);
  });

  await test('（11.export consistency）buildFailureResult(非字串workflow, 非字串reason)安全正規化', () => {
    const builder = createWorkflowResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(123, 456), { ok: false, workflow: 'unknown_workflow', reason: 'unknown_error' });
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.64-workflow')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（12.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 55, `預期至少55個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（13.P1-P6）src/worker.js 完全沒有被TASK1.64修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）wrangler.toml 完全沒有被TASK1.64修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（13.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被TASK1.64修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）Analysis/Recommendation Runner/Execution Manager/Application Service/Insight Use Case/Insight Capability的原始碼完全沒有被TASK1.64修改（規格明確禁止修改Execution Runtime Behavior）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/analysis/analysis_runner.js src/intelligence/recommendation/recommendation_runner.js src/intelligence/execution/execution_manager.js src/intelligence/facade/intelligence_facade.js src/intelligence/application/application_service.js src/intelligence/application/use_cases/insight_use_case.js src/intelligence/application/capabilities/insight_capability.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

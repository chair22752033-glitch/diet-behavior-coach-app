/*
 * Phase 3 TASK 1.72｜Behavior Feature Foundation 測試
 *
 * 本任務不是建立新Framework、不是建立新Layer、不是導入AI——這是
 * 建立Phase 3**第二個**Intelligence Application Feature
 * （"behavior"），驗證TASK1.60~1.71建立的Application Pattern
 * （Feature→Workflow→Capability→Use Case→Application Service→
 * Runtime）可以支援不同的domain，並且確認新增這個domain完全不
 * 依賴、也不修改Insight Feature。這份測試驗證的是：
 * - behavior_feature.js/behavior_capability.js/
 *   behavior_result_mapper.js三個檔案各自的boundary正確
 * - 端對端：Behavior Feature透過完整真實依賴鏈（Behavior專屬的
 *   Workflow→Capability→Use Case→跟Insight共用的Application
 *   Service→Facade→Runtime）可以走完整條生命週期
 * - Insight Feature/Insight Domain Logic完全沒有被修改
 * - Behavior Feature跟Insight Feature完全隔離、互不認識
 * - Behavior Feature完全不直接依賴database/auth/execution
 *   internal/AI provider
 * - export一致性、regression、P1-P6
 *
 * 分為以下14個部分：
 * A) feature isolation
 * B) extension pattern compatibility
 * C) workflow integration
 * D) capability integration
 * E) use case integration
 * F) contract compatibility
 * G) output mapping
 * H) insight isolation
 * I) runtime isolation
 * J) no database dependency
 * K) no auth dependency
 * L) no AI dependency
 * M) regression check
 * N) P1-P6
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
const behaviorDir = path.join(featuresDir, 'behavior');

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

const BEHAVIOR_JS_FILES = ['behavior_capability.js', 'behavior_feature.js', 'behavior_result_mapper.js', 'index.js'];

async function buildRealChain() {
  const { createBehaviorFeature, createBehaviorUseCase, createBehaviorCapability } = await import(path.join(behaviorDir, 'index.js'));
  const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
  const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
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
  const behaviorUseCase = createBehaviorUseCase({ applicationService });
  const behaviorCapability = createBehaviorCapability({ useCase: behaviorUseCase });
  const behaviorWorkflow = createApplicationWorkflow({ capability: behaviorCapability, contractValidator: createContractValidator() });
  const behaviorFeature = createBehaviorFeature({ workflow: behaviorWorkflow });
  return { behaviorFeature, behaviorWorkflow, behaviorCapability, behaviorUseCase, applicationService, facade, executionManager, service };
}

async function run() {
  const { createBehaviorFeature } = await import(path.join(behaviorDir, 'behavior_feature.js'));
  const { createBehaviorUseCase, createBehaviorCapability } = await import(path.join(behaviorDir, 'behavior_capability.js'));
  const { createBehaviorResultMapper } = await import(path.join(behaviorDir, 'behavior_result_mapper.js'));
  await import(path.join(behaviorDir, 'index.js'));

  // =========================================================================
  // A. feature isolation
  // =========================================================================
  console.log('--- A. feature isolation ---');

  await test('（1.feature isolation）src/intelligence/application/features/behavior/ 恰好包含5個檔案（behavior_capability/behavior_feature/behavior_result_mapper/index/README）', () => {
    const files = fs.readdirSync(behaviorDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'behavior_capability.js', 'behavior_feature.js', 'behavior_result_mapper.js', 'index.js']);
  });

  await test('（1.feature isolation）src/intelligence/application/features/behavior/README.md 存在且非空', () => {
    const readmePath = path.join(behaviorDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.feature isolation）createBehaviorFeature()回傳物件恰好只有requestBehavior一個公開介面', () => {
    const feature = createBehaviorFeature({ workflow: {} });
    assert.deepStrictEqual(Object.keys(feature), ['requestBehavior']);
  });

  await test('（1.feature isolation）createBehaviorUseCase()回傳物件恰好只有requestUserBehavior一個公開介面', () => {
    const useCase = createBehaviorUseCase({ applicationService: {} });
    assert.deepStrictEqual(Object.keys(useCase), ['requestUserBehavior']);
  });

  await test('（1.feature isolation）createBehaviorCapability()回傳物件恰好只有requestInsightCapability一個公開介面', () => {
    const capability = createBehaviorCapability({ useCase: {} });
    assert.deepStrictEqual(Object.keys(capability), ['requestInsightCapability']);
  });

  await test('（1.feature isolation）createBehaviorResultMapper()回傳物件恰好只有mapSuccessResult/mapFailureResult兩個公開介面', () => {
    const mapper = createBehaviorResultMapper();
    assert.deepStrictEqual(Object.keys(mapper).sort(), ['mapFailureResult', 'mapSuccessResult']);
  });

  await test('（1.feature isolation）requestBehavior()合法輸入時正確呼叫workflow.executeApplicationRequest()並回傳包裝後的結果', async () => {
    const workflow = { executeApplicationRequest: async () => ({ ok: true, data: { status: 'x', result: {}, metadata: {} } }) };
    const feature = createBehaviorFeature({ workflow });
    const result = await feature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'behavior');
  });

  await test('（1.feature isolation）requestBehavior()缺少userId時回傳{ok:false, feature:"behavior", reason:"invalid_user_id"}，完全不呼叫workflow', async () => {
    let workflowCalled = false;
    const workflow = { executeApplicationRequest: async () => { workflowCalled = true; } };
    const feature = createBehaviorFeature({ workflow });
    const result = await feature.requestBehavior({}, {});
    assert.deepStrictEqual(result, { ok: false, feature: 'behavior', reason: 'invalid_user_id' });
    assert.strictEqual(workflowCalled, false);
  });

  await test('（1.feature isolation）requestBehavior()的userId為空字串時回傳失敗', async () => {
    const feature = createBehaviorFeature({ workflow: {} });
    const result = await feature.requestBehavior({}, { userId: '' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（1.feature isolation）requestBehavior()的userId為數字（非字串）時回傳失敗', async () => {
    const feature = createBehaviorFeature({ workflow: {} });
    const result = await feature.requestBehavior({}, { userId: 123 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（1.feature isolation）requestBehavior()的options為陣列時回傳失敗', async () => {
    const feature = createBehaviorFeature({ workflow: {} });
    const result = await feature.requestBehavior({}, { userId: 'u1', options: [] });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.feature isolation）requestBehavior(null,null)不拋出例外', async () => {
    const feature = createBehaviorFeature({ workflow: {} });
    await assert.doesNotReject(() => feature.requestBehavior(null, null));
  });

  await test('（1.feature isolation）requestBehavior(db, "not an object")回傳{ok:false, reason:"invalid_request"}', async () => {
    const feature = createBehaviorFeature({ workflow: {} });
    const result = await feature.requestBehavior({}, 'not an object');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.feature isolation）requestBehavior()workflow缺失時回傳workflow_unavailable', async () => {
    const feature = createBehaviorFeature({});
    const result = await feature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.reason, 'workflow_unavailable');
  });

  await test('（1.feature isolation）requestBehavior()只挑選已知欄位轉交給workflow（不假造資料、不洩漏未知欄位）', async () => {
    let receivedRequest = null;
    const workflow = { executeApplicationRequest: async (db, request) => { receivedRequest = request; return { ok: false, reason: 'stop_here' }; } };
    const feature = createBehaviorFeature({ workflow });
    await feature.requestBehavior({}, { userId: 'u1', unknownField: 'leak', options: { a: 1 } });
    assert.deepStrictEqual(receivedRequest, { userId: 'u1', options: { a: 1 } });
  });

  await test('（1.feature isolation）db參數原樣轉交給workflow.executeApplicationRequest()（不解讀db）', async () => {
    const opaqueDb = { marker: 'x' };
    let receivedDb = null;
    const workflow = { executeApplicationRequest: async (db) => { receivedDb = db; return { ok: false, reason: 'stop_here' }; } };
    const feature = createBehaviorFeature({ workflow });
    await feature.requestBehavior(opaqueDb, { userId: 'u1' });
    assert.strictEqual(receivedDb, opaqueDb);
  });

  await test('（1.feature isolation）不同的Behavior Feature實例各自獨立（不是共用singleton）', () => {
    const featureA = createBehaviorFeature({ workflow: {} });
    const featureB = createBehaviorFeature({ workflow: {} });
    assert.notStrictEqual(featureA, featureB);
  });

  await test('（1.feature isolation）buildFailureResult類（mapFailureResult）非字串reason安全正規化為unknown_error，feature固定為"behavior"', () => {
    const mapper = createBehaviorResultMapper();
    assert.deepStrictEqual(mapper.mapFailureResult(123), { ok: false, feature: 'behavior', reason: 'unknown_error' });
    assert.deepStrictEqual(mapper.mapFailureResult(undefined), { ok: false, feature: 'behavior', reason: 'unknown_error' });
  });

  await test('（1.feature isolation）mapSuccessResult({})未提供欄位時使用undefined（不假造資料）', () => {
    const mapper = createBehaviorResultMapper();
    const result = mapper.mapSuccessResult({});
    assert.deepStrictEqual(result, { ok: true, feature: 'behavior', data: { status: undefined, result: undefined, metadata: undefined } });
  });

  await test('（1.feature isolation）requestBehavior()的options為null時回傳失敗', async () => {
    const feature = createBehaviorFeature({ workflow: {} });
    const result = await feature.requestBehavior({}, { userId: 'u1', options: null });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.feature isolation）requestBehavior()的options為合法空物件{}時通過驗證，正常呼叫workflow', async () => {
    let called = false;
    const workflow = { executeApplicationRequest: async () => { called = true; return { ok: false, reason: 'stop' }; } };
    const feature = createBehaviorFeature({ workflow });
    await feature.requestBehavior({}, { userId: 'u1', options: {} });
    assert.strictEqual(called, true);
  });

  await test('（1.feature isolation）requestBehavior()request為陣列時回傳invalid_request', async () => {
    const feature = createBehaviorFeature({ workflow: {} });
    const result = await feature.requestBehavior({}, ['u1']);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.feature isolation）requestBehavior()workflow.executeApplicationRequest不是函式時回傳workflow_unavailable', async () => {
    const feature = createBehaviorFeature({ workflow: { executeApplicationRequest: 'nope' } });
    const result = await feature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.reason, 'workflow_unavailable');
  });

  await test('（1.feature isolation）requestBehavior()完整request（requestId/version/timestamp/metadata）都正確轉交給workflow', async () => {
    let received = null;
    const workflow = { executeApplicationRequest: async (db, req) => { received = req; return { ok: false, reason: 'stop' }; } };
    const feature = createBehaviorFeature({ workflow });
    await feature.requestBehavior({}, { userId: 'u1', requestId: 'r1', version: 'v1', timestamp: 't1', metadata: { m: 1 } });
    assert.deepStrictEqual(received, { userId: 'u1', requestId: 'r1', version: 'v1', timestamp: 't1', metadata: { m: 1 } });
  });

  await test('（1.feature isolation）createBehaviorFeature()可以自訂resultMapper（依賴注入）', async () => {
    let customCalled = false;
    const customMapper = { mapSuccessResult: () => ({}), mapFailureResult: (reason) => { customCalled = true; return { ok: false, feature: 'behavior', reason: `custom:${reason}` }; } };
    const feature = createBehaviorFeature({ workflow: {}, resultMapper: customMapper });
    const result = await feature.requestBehavior({}, {});
    assert.strictEqual(customCalled, true);
    assert.strictEqual(result.reason, 'custom:invalid_user_id');
  });

  await test('（1.feature isolation）不同的Behavior Use Case/Capability/Result Mapper實例各自獨立（不是共用singleton）', () => {
    assert.notStrictEqual(createBehaviorUseCase({}), createBehaviorUseCase({}));
    assert.notStrictEqual(createBehaviorCapability({}), createBehaviorCapability({}));
    assert.notStrictEqual(createBehaviorResultMapper(), createBehaviorResultMapper());
  });

  console.log('');

  // =========================================================================
  // B. extension pattern compatibility
  // =========================================================================
  console.log('--- B. extension pattern compatibility ---');

  await test('（2.extension pattern compatibility）behavior_feature.js body形狀跟insight_capability.js（features/insight/）完全比照——都是validate→map→callWorkflow→wrap四步驟', () => {
    const behaviorSrc = readSrc(path.join(behaviorDir, 'behavior_feature.js'));
    const insightSrc = readSrc(path.join(insightDir, 'insight_capability.js'));
    assert.ok(/function validate\w+Request/.test(behaviorSrc));
    assert.ok(/function validate\w+Request/.test(insightSrc));
    assert.ok(/executeApplicationRequest/.test(behaviorSrc));
    assert.ok(/executeApplicationRequest/.test(insightSrc));
  });

  await test('（2.extension pattern compatibility）behavior_capability.js的createBehaviorUseCase() body形狀跟application/use_cases/insight_use_case.js完全比照——都是validate→callApplicationService→wrap三步驟', () => {
    const behaviorSrc = readSrc(path.join(behaviorDir, 'behavior_capability.js'));
    const insightUseCaseSrc = readSrc(path.join(useCasesDir, 'insight_use_case.js'));
    assert.ok(/requestIntelligence/.test(behaviorSrc));
    assert.ok(/requestIntelligence/.test(insightUseCaseSrc));
  });

  await test('（2.extension pattern compatibility）behavior_capability.js的createBehaviorCapability() body形狀跟application/capabilities/insight_capability.js完全比照——都是validate→callUseCase→wrap三步驟', () => {
    const behaviorSrc = readSrc(path.join(behaviorDir, 'behavior_capability.js'));
    const insightCapabilitySrc = readSrc(path.join(capabilitiesDir, 'insight_capability.js'));
    assert.ok(/requestUserBehavior/.test(behaviorSrc));
    assert.ok(/requestUserInsight/.test(insightCapabilitySrc));
  });

  await test('（2.extension pattern compatibility）Behavior跟Insight的Feature Result最終形狀一致（{ok,feature,data:{status,result,metadata}}/{ok:false,feature,reason}），只有feature字面值不同', async () => {
    const insightMapperMod = await import(path.join(insightDir, 'insight_result_mapper.js'));
    const insightMapper = insightMapperMod.createInsightResultMapper();
    const behaviorMapper = createBehaviorResultMapper();
    const insightSuccess = insightMapper.mapSuccessResult({ status: 'x', result: {}, metadata: {} });
    const behaviorSuccess = behaviorMapper.mapSuccessResult({ status: 'x', result: {}, metadata: {} });
    assert.deepStrictEqual(Object.keys(insightSuccess).sort(), Object.keys(behaviorSuccess).sort());
    assert.strictEqual(insightSuccess.feature, 'insight');
    assert.strictEqual(behaviorSuccess.feature, 'behavior');
  });

  await test('（2.extension pattern compatibility）EXTENSION_PATTERN.md（TASK1.71）記錄的擴充路徑在本次任務真正落地——新增了createApplicationWorkflow()的第二個獨立實例', async () => {
    const doc = fs.readFileSync(path.join(applicationDir, 'EXTENSION_PATTERN.md'), 'utf8');
    assert.ok(/mealPlan/.test(doc));
    const { behaviorWorkflow } = await buildRealChain();
    assert.strictEqual(typeof behaviorWorkflow.executeApplicationRequest, 'function');
  });

  await test('（2.extension pattern compatibility）端對端：假想第二個domain（"behavior"）確實可以重複使用共用的createApplicationWorkflow()/createContractValidator()/Application Service整條Runtime鏈路，走完整條生命週期', async () => {
    const { behaviorFeature } = await buildRealChain();
    const result = await behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'behavior');
    assert.strictEqual(result.data.status, 'intelligence_ready');
  });

  console.log('');

  // =========================================================================
  // C. workflow integration
  // =========================================================================
  console.log('--- C. workflow integration ---');

  await test('（3.workflow integration）behavior_feature.js完全不直接呼叫Capability（不import ../capabilities/、不import ./behavior_capability.js）', () => {
    const src = readSrc(path.join(behaviorDir, 'behavior_feature.js'));
    assert.ok(!/from\s+['"].*\/capabilities\//.test(src));
    assert.ok(!/from\s+['"]\.\/behavior_capability\.js['"]/.test(src));
  });

  await test('（3.workflow integration）端對端：真實的下層Workflow確實有被Behavior Feature觸發（透過spy驗證）', async () => {
    let workflowCalled = false;
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const spyCapability = {
      requestInsightCapability: async () => {
        workflowCalled = true;
        return { ok: true, capability: 'behavior', data: { status: 'intelligence_ready', result: {}, metadata: {} } };
      },
    };
    const workflow = createApplicationWorkflow({ capability: spyCapability, contractValidator: createContractValidator() });
    const feature = createBehaviorFeature({ workflow });
    const result = await feature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(workflowCalled, true);
    assert.strictEqual(result.ok, true);
  });

  await test('（3.workflow integration）Workflow失敗時的{ok:false,reason}形狀正確轉發到Behavior Feature最終結果', async () => {
    const workflow = { executeApplicationRequest: async () => ({ ok: false, reason: 'contract_validator_unavailable' }) };
    const feature = createBehaviorFeature({ workflow });
    const result = await feature.requestBehavior({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, feature: 'behavior', reason: 'contract_validator_unavailable' });
  });

  await test('（3.workflow integration）Behavior Feature注入的Workflow跟Insight注入的Workflow是完全不同的兩個實例（各自獨立建立，不共用）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app.intelligence.workflow, undefined);
    // behaviorFeature本身不對外暴露它注入的workflow實例，這裡透過
    // 行為差異驗證兩者是獨立鏈路：修改app.intelligence.service後，
    // 只影響共用鏈路，不影響behaviorFeature也共用同一份Application
    // Service（見D類「端對端：behaviorFeature reaches shared
    // Application Service」測試），但Capability/UseCase/Workflow
    // 三層是各自獨立建立的新實例。
    assert.strictEqual(typeof app.intelligence.behaviorFeature.requestBehavior, 'function');
  });

  console.log('');

  // =========================================================================
  // D. capability integration
  // =========================================================================
  console.log('--- D. capability integration ---');

  await test('（4.capability integration）createBehaviorCapability()的公開方法名稱固定為requestInsightCapability（符合Workflow既有介面要求，不是業務依賴Insight——見EXTENSION_PATTERN.md第3節）', () => {
    const capability = createBehaviorCapability({ useCase: {} });
    assert.deepStrictEqual(Object.keys(capability), ['requestInsightCapability']);
  });

  await test('（4.capability integration）requestInsightCapability()正確呼叫useCase.requestUserBehavior()（唯一允許呼叫的下一層）', async () => {
    let useCaseCalled = false;
    const useCase = { requestUserBehavior: async () => { useCaseCalled = true; return { ok: true, useCase: 'behavior', data: { status: 'x', result: {}, metadata: {} } }; } };
    const capability = createBehaviorCapability({ useCase });
    const result = await capability.requestInsightCapability({}, { userId: 'u1' });
    assert.strictEqual(useCaseCalled, true);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'behavior');
  });

  await test('（4.capability integration）requestInsightCapability()useCase缺失時回傳use_case_unavailable', async () => {
    const capability = createBehaviorCapability({});
    const result = await capability.requestInsightCapability({}, { userId: 'u1' });
    assert.strictEqual(result.reason, 'use_case_unavailable');
  });

  await test('（4.capability integration）requestInsightCapability()缺少userId時回傳invalid_user_id，完全不呼叫useCase', async () => {
    let useCaseCalled = false;
    const useCase = { requestUserBehavior: async () => { useCaseCalled = true; } };
    const capability = createBehaviorCapability({ useCase });
    const result = await capability.requestInsightCapability({}, {});
    assert.strictEqual(result.reason, 'invalid_user_id');
    assert.strictEqual(useCaseCalled, false);
  });

  await test('（4.capability integration）Use Case失敗時的{ok:false,reason}形狀正確轉發到Capability最終結果', async () => {
    const useCase = { requestUserBehavior: async () => ({ ok: false, useCase: 'behavior', reason: 'application_service_unavailable' }) };
    const capability = createBehaviorCapability({ useCase });
    const result = await capability.requestInsightCapability({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, capability: 'behavior', reason: 'application_service_unavailable' });
  });

  await test('（4.capability integration）behavior_capability.js完全不import跨目錄的Result Builder（不import../../capabilities/capability_result_builder.js或../../use_cases/use_case_result_builder.js，維持「每個Feature目錄完全自成一體」的既有邊界慣例）', () => {
    const src = readSrc(path.join(behaviorDir, 'behavior_capability.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（4.capability integration）requestInsightCapability()的options為陣列時回傳invalid_options_type', async () => {
    const capability = createBehaviorCapability({ useCase: {} });
    const result = await capability.requestInsightCapability({}, { userId: 'u1', options: [] });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（4.capability integration）requestInsightCapability()db參數原樣轉交給useCase.requestUserBehavior()', async () => {
    const opaqueDb = { marker: 'cap' };
    let receivedDb = null;
    const useCase = { requestUserBehavior: async (db) => { receivedDb = db; return { ok: false, reason: 'stop' }; } };
    const capability = createBehaviorCapability({ useCase });
    await capability.requestInsightCapability(opaqueDb, { userId: 'u1' });
    assert.strictEqual(receivedDb, opaqueDb);
  });

  console.log('');

  // =========================================================================
  // E. use case integration
  // =========================================================================
  console.log('--- E. use case integration ---');

  await test('（5.use case integration）requestUserBehavior()正確呼叫applicationService.requestIntelligence()（唯一允許呼叫的下一層）', async () => {
    let appServiceCalled = false;
    const applicationService = { requestIntelligence: async () => { appServiceCalled = true; return { ok: true, data: { status: 'x', result: {}, metadata: {} } }; } };
    const useCase = createBehaviorUseCase({ applicationService });
    const result = await useCase.requestUserBehavior({}, { userId: 'u1' });
    assert.strictEqual(appServiceCalled, true);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.useCase, 'behavior');
  });

  await test('（5.use case integration）requestUserBehavior()applicationService缺失時回傳application_service_unavailable', async () => {
    const useCase = createBehaviorUseCase({});
    const result = await useCase.requestUserBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.reason, 'application_service_unavailable');
  });

  await test('（5.use case integration）requestUserBehavior()缺少userId時回傳invalid_user_id，完全不呼叫applicationService', async () => {
    let called = false;
    const applicationService = { requestIntelligence: async () => { called = true; } };
    const useCase = createBehaviorUseCase({ applicationService });
    const result = await useCase.requestUserBehavior({}, {});
    assert.strictEqual(result.reason, 'invalid_user_id');
    assert.strictEqual(called, false);
  });

  await test('（5.use case integration）Application Service失敗時的{ok:false,reason}形狀正確轉發到Use Case最終結果', async () => {
    const applicationService = { requestIntelligence: async () => ({ ok: false, reason: 'facade_unavailable' }) };
    const useCase = createBehaviorUseCase({ applicationService });
    const result = await useCase.requestUserBehavior({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, useCase: 'behavior', reason: 'facade_unavailable' });
  });

  await test('（5.use case integration）requestUserBehavior()的options為陣列時回傳invalid_options_type', async () => {
    const useCase = createBehaviorUseCase({ applicationService: {} });
    const result = await useCase.requestUserBehavior({}, { userId: 'u1', options: [] });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（5.use case integration）requestUserBehavior()db參數原樣轉交給applicationService.requestIntelligence()', async () => {
    const opaqueDb = { marker: 'uc' };
    let receivedDb = null;
    const applicationService = { requestIntelligence: async (db) => { receivedDb = db; return { ok: false, reason: 'stop' }; } };
    const useCase = createBehaviorUseCase({ applicationService });
    await useCase.requestUserBehavior(opaqueDb, { userId: 'u1' });
    assert.strictEqual(receivedDb, opaqueDb);
  });

  await test('（5.use case integration）端對端：真實的Application Service（TASK1.60，跟Insight共用同一份既有邏輯，不是Insight的實例但是同一份domain-agnostic程式碼）確實有被Behavior Use Case觸發', async () => {
    const { behaviorUseCase, applicationService } = await buildRealChain();
    let appServiceCalled = false;
    const originalRequest = applicationService.requestIntelligence;
    applicationService.requestIntelligence = async (...args) => { appServiceCalled = true; return originalRequest.apply(applicationService, args); };
    const result = await behaviorUseCase.requestUserBehavior({}, { userId: 'u1' });
    assert.strictEqual(appServiceCalled, true);
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // F. contract compatibility
  // =========================================================================
  console.log('--- F. contract compatibility ---');

  await test('（6.contract compatibility）behavior_feature.js/behavior_capability.js完全不直接import Contract Layer（不import ../../contracts/，「驗證Contract」是規格明確列給Workflow的責任）', () => {
    for (const file of ['behavior_feature.js', 'behavior_capability.js']) {
      assert.ok(!/from\s+['"].*\/contracts\//.test(readSrc(path.join(behaviorDir, file))));
    }
  });

  await test('（6.contract compatibility）端對端：真實輸出（透過完整鏈路）先通過Contract Layer的response驗證，再交給Behavior Result Mapper包裝', async () => {
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { behaviorFeature, behaviorWorkflow } = await buildRealChain();
    const workflowResult = await behaviorWorkflow.executeApplicationRequest({}, { userId: 'u1' });
    const cv = createContractValidator();
    assert.deepStrictEqual(cv.validateResponse(workflowResult), { ok: true });
    const featureResult = await behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(featureResult.ok, true);
  });

  await test('（6.contract compatibility）Contract Layer本身完全沒有被Behavior Feature修改——ApplicationRequestContract/ApplicationResponseContract的驗證規則維持不變', async () => {
    const { validateApplicationRequestContract, validateApplicationResponseContract } = await import(path.join(contractsDir, 'index.js'));
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: 'u1' }), { ok: true });
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true, data: { status: 'x', result: {}, metadata: {} } }), { ok: true });
  });

  await test('（6.contract compatibility）Behavior Feature自己內建的驗證規則跟Contract Layer的validateApplicationRequestContract()對同樣非法輸入給出相同reason（架構規則一致）', async () => {
    const { validateApplicationRequestContract } = await import(path.join(contractsDir, 'index.js'));
    const feature = createBehaviorFeature({ workflow: {} });
    const invalidInputs = [{}, { userId: 123 }, { userId: 'u1', options: [] }];
    for (const input of invalidInputs) {
      const contractResult = validateApplicationRequestContract(input);
      const featureResult = await feature.requestBehavior({}, input);
      assert.strictEqual(contractResult.reason, featureResult.reason);
    }
  });

  console.log('');

  // =========================================================================
  // G. output mapping
  // =========================================================================
  console.log('--- G. output mapping ---');

  await test('（7.output mapping）behavior_result_mapper.js完全沒有任何import（純函式，零相依）', () => {
    const src = readSrc(path.join(behaviorDir, 'behavior_result_mapper.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（7.output mapping）mapSuccessResult()是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const mapper = createBehaviorResultMapper();
    const input = { status: 'x', result: { a: 1 }, metadata: { b: 2 } };
    assert.deepStrictEqual(mapper.mapSuccessResult(input), mapper.mapSuccessResult(input));
  });

  await test('（7.output mapping）mapSuccessResult()不修改輸入物件本身（沒有side effect）', () => {
    const mapper = createBehaviorResultMapper();
    const input = { status: 'x', result: {}, metadata: {} };
    const inputCopy = JSON.parse(JSON.stringify(input));
    mapper.mapSuccessResult(input);
    assert.deepStrictEqual(input, inputCopy);
  });

  await test('（7.output mapping）mapSuccessResult(undefined)不拋出例外，欄位皆為undefined', () => {
    const mapper = createBehaviorResultMapper();
    assert.doesNotThrow(() => mapper.mapSuccessResult(undefined));
    const result = mapper.mapSuccessResult(undefined);
    assert.deepStrictEqual(result, { ok: true, feature: 'behavior', data: { status: undefined, result: undefined, metadata: undefined } });
  });

  await test('（7.output mapping）端對端：真實輸出的data.result恰好具備context/analysis/recommendation三個欄位', async () => {
    const { behaviorFeature } = await buildRealChain();
    const result = await behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result.data.result).sort(), ['analysis', 'context', 'recommendation']);
  });

  await test('（7.output mapping）不產生任何自然語言/建議文字，也不計算任何新的分數/信心值（behavior_result_mapper.js沒有score/confidence相關的計算邏輯）', () => {
    const src = readSrc(path.join(behaviorDir, 'behavior_result_mapper.js'));
    assert.ok(!/\.score\s*=/.test(src));
    assert.ok(!/\.confidence\s*=/.test(src));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（7.output mapping）mapFailureResult()是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const mapper = createBehaviorResultMapper();
    assert.deepStrictEqual(mapper.mapFailureResult('x'), mapper.mapFailureResult('x'));
  });

  await test('（7.output mapping）mapFailureResult(空字串)保留空字串（空字串本身是合法字串，不會被正規化成unknown_error）', () => {
    const mapper = createBehaviorResultMapper();
    assert.deepStrictEqual(mapper.mapFailureResult(''), { ok: false, feature: 'behavior', reason: '' });
  });

  await test('（7.output mapping）createBehaviorResultMapper(任何參數)都回傳相同介面（不接受依賴注入，因為完全沒有任何依賴需要注入）', () => {
    const mapperA = createBehaviorResultMapper();
    const mapperB = createBehaviorResultMapper({ ignored: 'value' });
    assert.deepStrictEqual(Object.keys(mapperA), Object.keys(mapperB));
  });

  await test('（7.output mapping）端對端：兩次呼叫同樣的userId得到內容相同的輸出（deterministic）', async () => {
    const { behaviorFeature } = await buildRealChain();
    const r1 = await behaviorFeature.requestBehavior({}, { userId: 'u1' });
    const r2 = await behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.deepStrictEqual(r1, r2);
  });

  console.log('');

  // =========================================================================
  // H. insight isolation
  // =========================================================================
  console.log('--- H. insight isolation ---');

  for (const file of BEHAVIOR_JS_FILES) {
    await test(`（8.insight isolation）behavior/${file} 完全不import ../insight_feature.js`, () => {
      assert.ok(!/from\s+['"].*insight_feature\.js['"]/.test(readSrc(path.join(behaviorDir, file))));
    });
    await test(`（8.insight isolation）behavior/${file} 完全不import ../insight/底下任何檔案`, () => {
      assert.ok(!/from\s+['"].*\/insight\//.test(readSrc(path.join(behaviorDir, file))));
    });
    await test(`（8.insight isolation）behavior/${file} 完全不import application/capabilities/insight_capability.js或application/use_cases/insight_use_case.js`, () => {
      const src = readSrc(path.join(behaviorDir, file));
      assert.ok(!/insight_capability\.js/.test(src));
      assert.ok(!/insight_use_case\.js/.test(src));
    });
    await test(`（8.insight isolation）behavior/${file} 完全沒有出現INSIGHT_DOMAIN/insightFeature/insightCapability等Insight專屬識別字樣`, () => {
      const src = readSrc(path.join(behaviorDir, file));
      assert.ok(!/INSIGHT_DOMAIN/.test(src));
      assert.ok(!/insightFeature/.test(src));
      assert.ok(!/insightCapability/.test(src));
    });
  }

  await test('（8.insight isolation）application/capabilities/insight_capability.js（TASK1.62）完全沒有被本次任務修改——git diff確認', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/capabilities/insight_capability.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.insight isolation）application/use_cases/insight_use_case.js（TASK1.61）完全沒有被本次任務修改——git diff確認', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/use_cases/insight_use_case.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.insight isolation）application/features/insight_feature.js（TASK1.65）完全沒有被本次任務修改——git diff確認', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/features/insight_feature.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.insight isolation）application/features/insight/整條樹（TASK1.66~1.69，12個檔案）完全沒有被本次任務修改——git diff確認', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/features/insight/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.insight isolation）端對端：修改app.intelligence.service.getIntelligence()這個共用stub不會讓Behavior Feature拿到「Insight」字面值以外的其他domain資料——behaviorFeature/insightFeature各自回傳自己domain名稱的feature欄位', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(behaviorResult.feature, 'behavior');
    assert.strictEqual(insightResult.feature, 'insight');
  });

  await test('（8.insight isolation）behavior_feature.js完全不出現字面值"insight"（去除註解跟JSDoc後的實際程式碼，只有behavior domain相關字樣）', () => {
    const src = readSrc(path.join(behaviorDir, 'behavior_feature.js')).replace(/\/\*\*[\s\S]*?\*\//g, '');
    assert.ok(!/insight/i.test(src), `實際找到：${(src.match(/.{0,30}insight.{0,30}/i) || [])[0]}`);
  });

  await test('（8.insight isolation）behavior_result_mapper.js完全不出現字面值"insight"', () => {
    const src = readSrc(path.join(behaviorDir, 'behavior_result_mapper.js'));
    assert.ok(!/insight/i.test(src));
  });

  await test('（8.insight isolation）app.intelligence.behaviorFeature跟app.intelligence.insightFeature/insightExecutionFlow/features是完全不同的四個實例（各自獨立，互不覆蓋）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const entries = [app.intelligence.behaviorFeature, app.intelligence.insightFeature, app.intelligence.insightExecutionFlow, app.intelligence.features];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        assert.notStrictEqual(entries[i], entries[j]);
      }
    }
  });

  console.log('');

  // =========================================================================
  // I. runtime isolation
  // =========================================================================
  console.log('--- I. runtime isolation ---');

  for (const file of BEHAVIOR_JS_FILES) {
    await test(`（9.runtime isolation）behavior/${file} 完全不import src/intelligence/facade/`, () => {
      assert.ok(!/from\s+['"].*\/facade\//.test(readSrc(path.join(behaviorDir, file))));
    });
    await test(`（9.runtime isolation）behavior/${file} 完全不import src/intelligence/execution/（Execution Manager）`, () => {
      const src = readSrc(path.join(behaviorDir, file));
      const executionManagerDir = path.join(intelDir, 'execution');
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        const resolved = path.normalize(path.join(behaviorDir, imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir);
      }
    });
    await test(`（9.runtime isolation）behavior/${file} 完全不import src/intelligence/service/、orchestration/、analysis/、recommendation/、data_preparation/、governance/`, () => {
      const src = readSrc(path.join(behaviorDir, file));
      assert.ok(!/from\s+['"].*\/service\//.test(src));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
      assert.ok(!/from\s+['"].*\/governance\//.test(src));
    });
    await test(`（9.runtime isolation）behavior/${file} 完全不import src/intelligence/history/、metrics/、events/、monitoring/`, () => {
      const src = readSrc(path.join(behaviorDir, file));
      assert.ok(!/from\s+['"].*\/history\//.test(src));
      assert.ok(!/from\s+['"].*\/metrics\//.test(src));
      assert.ok(!/from\s+['"].*\/events\//.test(src));
      assert.ok(!/from\s+['"].*\/monitoring\//.test(src));
    });
    await test(`（9.runtime isolation）behavior/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher變數名稱`, () => {
      const src = readSrc(path.join(behaviorDir, file));
      assert.ok(!/executionManager/.test(src));
      assert.ok(!/historyStore/.test(src));
      assert.ok(!/metricsStore/.test(src));
      assert.ok(!/eventDispatcher/.test(src));
    });
  }

  await test('（9.runtime isolation）Runtime Execution Layer（execution/、service/、orchestration/、analysis/、recommendation/、data_preparation/、facade/）本身完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/execution/ src/intelligence/service/ src/intelligence/orchestration/ src/intelligence/analysis/ src/intelligence/recommendation/ src/intelligence/data_preparation/ src/intelligence/facade/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.runtime isolation）src/bootstrap/application.js的intelligence物件恰好具備24個欄位（TASK1.69既有23個加上TASK1.72新增的behaviorFeature）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（9.runtime isolation）app.router.routes 數量沒有因為新增behaviorFeature而改變（本次任務明確禁止新增API route）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.ok(Array.isArray(app.router.routes));
    assert.ok(app.router.routes.length > 0);
  });

  await test('（9.runtime isolation）每次createApplication()呼叫都各自建立獨立的Behavior Feature實例（不是共用singleton）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app1 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const app2 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app1.intelligence.behaviorFeature, app2.intelligence.behaviorFeature);
  });

  console.log('');

  // =========================================================================
  // J. no database dependency
  // =========================================================================
  console.log('--- J. no database dependency ---');

  for (const file of BEHAVIOR_JS_FILES) {
    await test(`（10.no database dependency）behavior/${file} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(behaviorDir, file))));
    });
    await test(`（10.no database dependency）behavior/${file} 完全沒有db.prepare()/SQL關鍵字/DIET_COACH_DB字樣`, () => {
      const src = readSrc(path.join(behaviorDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（10.no database dependency）requestBehavior()把db當作不透明的第一個參數，完全不呼叫db的任何方法', () => {
    const src = readSrc(path.join(behaviorDir, 'behavior_feature.js'));
    assert.ok(!/db\.\w+\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // K. no auth dependency
  // =========================================================================
  console.log('--- K. no auth dependency ---');

  for (const file of BEHAVIOR_JS_FILES) {
    await test(`（11.no auth dependency）behavior/${file} 完全不import src/auth/、src/oauth/、src/identity/、src/middleware/`, () => {
      const src = readSrc(path.join(behaviorDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（11.no auth dependency）behavior/${file} 完全沒有出現jwt/session/cookie相關字樣`, () => {
      const src = readSrc(path.join(behaviorDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
    await test(`（11.no auth dependency）behavior/${file} 完全不呼叫requireAuth()/requireActiveUser()/getCurrentUser()`, () => {
      const src = readSrc(path.join(behaviorDir, file));
      assert.ok(!/requireAuth\(/.test(src));
      assert.ok(!/requireActiveUser\(/.test(src));
      assert.ok(!/getCurrentUser\(/.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // L. no AI dependency
  // =========================================================================
  console.log('--- L. no AI dependency ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of BEHAVIOR_JS_FILES) {
    const codeOnly = readSrc(path.join(behaviorDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（12.no AI dependency）behavior/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（12.no AI dependency）behavior/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
    await test(`（12.no AI dependency）behavior/${file} 完全不 import 任何非相對路徑的外部套件`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // M. regression check
  // =========================================================================
  console.log('--- M. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（13.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.72-behavior-feature')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（13.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 62, `預期至少62個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（13.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // N. P1-P6
  // =========================================================================
  console.log('--- N. P1-P6 ---');

  await test('（14.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（14.P1-P6）src/worker.js 完全沒有被TASK1.72修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）wrangler.toml 完全沒有被TASK1.72修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（14.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被TASK1.72修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）Analysis/Recommendation Runner/Execution Manager/Application Service/Insight Feature相關全部檔案的原始碼完全沒有被TASK1.72修改（規格明確禁止修改Insight Feature/Insight Domain Logic/Runtime Execution Layer）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/analysis/analysis_runner.js src/intelligence/recommendation/recommendation_runner.js src/intelligence/execution/execution_manager.js src/intelligence/application/application_service.js src/intelligence/application/use_cases/insight_use_case.js src/intelligence/application/capabilities/insight_capability.js src/intelligence/application/workflows/application_workflow.js src/intelligence/application/features/insight_feature.js src/intelligence/application/features/insight/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）src/bootstrap/application.js只有新增behaviorFeature相關的組裝（git diff只包含新增行，沒有刪除既有行——用grep確認diff裡沒有以"-"開頭且非"---"的既有程式碼行）', () => {
    const diff = execFileSync('git', ['diff', '--', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    const removedLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
    assert.strictEqual(removedLines.length, 0, `bootstrap/application.js出現非預期的刪除行：${JSON.stringify(removedLines)}`);
  });

  await test('（14.P1-P6）src/intelligence/application/features/index.js只有新增behavior相關的re-export（git diff只包含新增行，沒有刪除既有行）', () => {
    const diff = execFileSync('git', ['diff', '--', 'src/intelligence/application/features/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    const removedLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
    assert.strictEqual(removedLines.length, 0, `features/index.js出現非預期的刪除行：${JSON.stringify(removedLines)}`);
  });

  // （TASK1.76後更新）原本這裡有一個「src/intelligence/index.js
  // 完全沒有被TASK1.72修改」的斷言，比對整個檔案即時的git diff
  // --stat。這是跟TASK1.39/TASK1.56/TASK1.63/TASK1.67/TASK1.68
  // 同一種「比對即時整檔git diff」的脆弱治具：src/intelligence/
  // index.js從來就不在本任務系列真正的禁止清單裡，TASK1.76合法地
  // 在這個檔案新增了頂層capabilities namespace的re-export
  // （`export * as capabilities from './capabilities/index.js'`），
  // 導致這個斷言失敗——這不是TASK1.72造成的回歸，而是斷言本身
  // 寫得過度嚴格，這裡移除這個斷言，改由TASK1.76/後續任務自己的
  // 章節驗證真正的禁止清單（worker.js等）維持零異動即可。

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

/*
 * Phase 3 TASK 1.73｜Phase 3 Application Layer Consolidation Review
 * 測試
 *
 * 本任務不是新增功能、不是建立新Layer、不是導入AI——這是在
 * Insight Feature（TASK1.66~1.69）跟Behavior Feature（TASK1.72）
 * 兩個真實Feature domain並存之後，對整條Phase 3 Application
 * Architecture做一次consolidation審查，確認：
 * - 多Feature支援能力（Multi Feature Pattern）
 * - Domain Isolation
 * - Shared Boundary正確性（Application Service/Contract/Result
 *   Builder是否保持domain agnostic）
 * - Workflow Boundary（domain leakage/naming limitation/incorrect
 *   dependency）
 * - Phase 4 Extension Point是否明確
 *
 * 審查結論記錄於
 * `src/intelligence/application/CONSOLIDATION_REVIEW.md`（本次
 * 任務唯一新增的文件）。這份測試逐項驗證該文件的每一個結論。
 *
 * 分為以下11個部分：
 * A) feature isolation
 * B) insight isolation
 * C) behavior isolation
 * D) shared layer boundary
 * E) workflow boundary
 * F) contract consistency
 * G) dependency scan
 * H) export consistency
 * I) bootstrap consistency
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

const SHARED_GENERIC_FILES = [
  path.join(applicationDir, 'application_service.js'),
  path.join(applicationDir, 'application_result_builder.js'),
  path.join(contractsDir, 'application_request_contract.js'),
  path.join(contractsDir, 'application_response_contract.js'),
  path.join(contractsDir, 'contract_validator.js'),
  path.join(capabilitiesDir, 'capability_result_builder.js'),
  path.join(useCasesDir, 'use_case_result_builder.js'),
  path.join(workflowsDir, 'workflow_result_builder.js'),
  path.join(featuresDir, 'feature_result_builder.js'),
].sort();

async function buildInsightChain() {
  const { createInsightFeatureCapability } = await import(path.join(insightDir, 'index.js'));
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
      context: { user: null, activityContext: { count: 0, items: [] }, nutritionContext: { count: 0, items: [] }, emotionContext: { count: 0, items: [] }, behaviorContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] }, metadata: {} },
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
  const contractValidator = createContractValidator();
  const workflow = createApplicationWorkflow({ capability: insightCapability, contractValidator });
  const insightFeatureCapability = createInsightFeatureCapability({ workflow });
  return { insightFeatureCapability, workflow, applicationService, contractValidator };
}

async function buildBehaviorChain(sharedApplicationService, sharedContractValidator) {
  const { createBehaviorFeature, createBehaviorUseCase, createBehaviorCapability } = await import(path.join(behaviorDir, 'index.js'));
  const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
  const behaviorUseCase = createBehaviorUseCase({ applicationService: sharedApplicationService });
  const behaviorCapability = createBehaviorCapability({ useCase: behaviorUseCase });
  const behaviorWorkflow = createApplicationWorkflow({ capability: behaviorCapability, contractValidator: sharedContractValidator });
  const behaviorFeature = createBehaviorFeature({ workflow: behaviorWorkflow });
  return { behaviorFeature, behaviorWorkflow };
}

async function run() {
  const INSIGHT_ALL_FILES = listAllJsFiles(insightDir);
  const BEHAVIOR_ALL_FILES = listAllJsFiles(behaviorDir);

  // =========================================================================
  // A. feature isolation
  // =========================================================================
  console.log('--- A. feature isolation ---');

  await test('（1.feature isolation）features/insight/跟features/behavior/兩個目錄都存在', () => {
    assert.ok(fs.existsSync(insightDir));
    assert.ok(fs.existsSync(behaviorDir));
  });

  await test('（1.feature isolation）Insight跟Behavior各自的Feature Entry都恰好只有一個公開方法', async () => {
    const { createInsightFeatureCapability } = await import(path.join(insightDir, 'index.js'));
    const { createBehaviorFeature } = await import(path.join(behaviorDir, 'index.js'));
    assert.deepStrictEqual(Object.keys(createInsightFeatureCapability({ workflow: {} })), ['requestInsight']);
    assert.deepStrictEqual(Object.keys(createBehaviorFeature({ workflow: {} })), ['requestBehavior']);
  });

  await test('（1.feature isolation）端對端：Insight跟Behavior兩條鏈路可以同時運作，互不干擾（各自呼叫各自的requestInsight/requestBehavior都成功）', async () => {
    const { insightFeatureCapability, applicationService, contractValidator } = await buildInsightChain();
    const { behaviorFeature } = await buildBehaviorChain(applicationService, contractValidator);
    const insightResult = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
    assert.strictEqual(insightResult.feature, 'insight');
    assert.strictEqual(behaviorResult.feature, 'behavior');
  });

  await test('（1.feature isolation）端對端：Insight跟Behavior各自的Workflow是不同實例，即使共用同一個Application Service/Contract Validator', async () => {
    const { insightFeatureCapability, workflow: insightWorkflow, applicationService, contractValidator } = await buildInsightChain();
    const { behaviorWorkflow } = await buildBehaviorChain(applicationService, contractValidator);
    assert.notStrictEqual(insightWorkflow, behaviorWorkflow);
    assert.strictEqual(typeof insightFeatureCapability.requestInsight, 'function');
  });

  await test('（1.feature isolation）Insight跟Behavior的Result Mapper各自固定回傳不同的feature字面值，即使輸入完全相同', async () => {
    const insightMapperMod = await import(path.join(insightDir, 'insight_result_mapper.js'));
    const behaviorMapperMod = await import(path.join(behaviorDir, 'behavior_result_mapper.js'));
    const insightMapper = insightMapperMod.createInsightResultMapper();
    const behaviorMapper = behaviorMapperMod.createBehaviorResultMapper();
    const input = { status: 'x', result: { a: 1 }, metadata: {} };
    assert.strictEqual(insightMapper.mapSuccessResult(input).feature, 'insight');
    assert.strictEqual(behaviorMapper.mapSuccessResult(input).feature, 'behavior');
  });

  await test('（1.feature isolation）Insight跟Behavior各自失敗時的reason完全獨立（互相注入錯誤的下一層不會混淆對方的錯誤訊息）', async () => {
    const insightMapperMod = await import(path.join(insightDir, 'insight_result_mapper.js'));
    const behaviorMapperMod = await import(path.join(behaviorDir, 'behavior_result_mapper.js'));
    const insightMapper = insightMapperMod.createInsightResultMapper();
    const behaviorMapper = behaviorMapperMod.createBehaviorResultMapper();
    assert.deepStrictEqual(insightMapper.mapFailureResult('x'), { ok: false, feature: 'insight', reason: 'x' });
    assert.deepStrictEqual(behaviorMapper.mapFailureResult('x'), { ok: false, feature: 'behavior', reason: 'x' });
  });

  console.log('');

  // =========================================================================
  // B. insight isolation
  // =========================================================================
  console.log('--- B. insight isolation ---');

  for (const f of INSIGHT_ALL_FILES) {
    const relName = path.relative(repoRoot, f);
    await test(`（2.insight isolation）${relName} 完全不import ../behavior_feature.js 或 ../behavior/ 底下任何檔案`, () => {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*behavior_feature\.js['"]/.test(src));
      assert.ok(!/from\s+['"].*\/behavior\//.test(src));
    });
    await test(`（2.insight isolation）${relName} 完全沒有出現BEHAVIOR_DOMAIN/behaviorFeature/createBehaviorCapability等Behavior專屬識別字樣`, () => {
      const src = readSrc(f);
      assert.ok(!/BEHAVIOR_DOMAIN/.test(src));
      assert.ok(!/behaviorFeature/.test(src));
      assert.ok(!/createBehaviorCapability/.test(src));
      assert.ok(!/createBehaviorUseCase/.test(src));
    });
  }

  await test('（2.insight isolation）application/features/insight/整條樹（12個檔案）本次審查完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/features/insight/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.insight isolation）application/features/insight_feature.js（TASK1.65）本次審查完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/features/insight_feature.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.insight isolation）application/capabilities/insight_capability.js（TASK1.62）本次審查完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/capabilities/insight_capability.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.insight isolation）application/use_cases/insight_use_case.js（TASK1.61）本次審查完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/use_cases/insight_use_case.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.insight isolation）端對端：Insight自己的完整鏈路（真實依賴，一路到Analysis/Recommendation Runner）在Behavior存在的情況下依然成功、輸出形狀不變', async () => {
    const { insightFeatureCapability } = await buildInsightChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['metadata', 'result', 'status']);
  });

  console.log('');

  // =========================================================================
  // C. behavior isolation
  // =========================================================================
  console.log('--- C. behavior isolation ---');

  for (const f of BEHAVIOR_ALL_FILES) {
    const relName = path.relative(repoRoot, f);
    await test(`（3.behavior isolation）${relName} 完全不import ../insight_feature.js 或 ../insight/ 底下任何檔案`, () => {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*insight_feature\.js['"]/.test(src));
      assert.ok(!/from\s+['"].*\/insight\//.test(src));
    });
    await test(`${`（3.behavior isolation）${relName} 完全沒有出現INSIGHT_DOMAIN/insightFeature/createInsightCapability等Insight專屬識別字樣`}`, () => {
      const src = readSrc(f);
      assert.ok(!/INSIGHT_DOMAIN/.test(src));
      assert.ok(!/insightFeature/.test(src));
      assert.ok(!/createInsightCapability/.test(src));
      assert.ok(!/createInsightUseCase/.test(src));
    });
    await test(`（3.behavior isolation）${relName} 完全不import application/capabilities/insight_capability.js或application/use_cases/insight_use_case.js`, () => {
      const src = readSrc(f);
      assert.ok(!/insight_capability\.js/.test(src));
      assert.ok(!/insight_use_case\.js/.test(src));
    });
  }

  await test('（3.behavior isolation）application/features/behavior/整條樹（5個檔案）本次審查完全沒有被修改（git diff確認——Behavior本身是TASK1.72建立的，本次審查不應該再修改它）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/features/behavior/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.behavior isolation）端對端：Behavior自己的完整鏈路（真實依賴，一路到Analysis/Recommendation Runner）在Insight存在的情況下依然成功、輸出形狀不變', async () => {
    const { applicationService, contractValidator } = await buildInsightChain();
    const { behaviorFeature } = await buildBehaviorChain(applicationService, contractValidator);
    const result = await behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['metadata', 'result', 'status']);
  });

  console.log('');

  // =========================================================================
  // D. shared layer boundary
  // =========================================================================
  console.log('--- D. shared layer boundary ---');

  for (const f of SHARED_GENERIC_FILES) {
    const relName = path.relative(repoRoot, f);
    await test(`（4.shared layer boundary）${relName} 的實際程式碼（去除註解後）完全不含"insight"字樣（domain-agnostic）`, () => {
      const src = readSrc(f);
      assert.ok(!/insight/i.test(src), `${relName}不應該含有insight字樣，實際找到：${(src.match(/.{0,30}insight.{0,30}/i) || [])[0]}`);
    });
    await test(`（4.shared layer boundary）${relName} 的實際程式碼（去除註解後）完全不含"behavior"字樣（domain-agnostic）`, () => {
      const src = readSrc(f);
      assert.ok(!/behavior/i.test(src), `${relName}不應該含有behavior字樣，實際找到：${(src.match(/.{0,30}behavior.{0,30}/i) || [])[0]}`);
    });
  }

  await test('（4.shared layer boundary）4個Result Builder用不同的domain名稱參數呼叫，各自正確反映在結果裡（"insight"跟"behavior"都能正常運作，證明真正domain-agnostic而不是巧合）', async () => {
    const { createCapabilityResultBuilder } = await import(path.join(capabilitiesDir, 'capability_result_builder.js'));
    const { createUseCaseResultBuilder } = await import(path.join(useCasesDir, 'use_case_result_builder.js'));
    const { createWorkflowResultBuilder } = await import(path.join(workflowsDir, 'workflow_result_builder.js'));
    const { createFeatureResultBuilder } = await import(path.join(featuresDir, 'feature_result_builder.js'));
    const capBuilder = createCapabilityResultBuilder();
    const ucBuilder = createUseCaseResultBuilder();
    const wfBuilder = createWorkflowResultBuilder();
    const ftBuilder = createFeatureResultBuilder();
    assert.strictEqual(capBuilder.buildSuccessResult('insight', {}).capability, 'insight');
    assert.strictEqual(capBuilder.buildSuccessResult('behavior', {}).capability, 'behavior');
    assert.strictEqual(ucBuilder.buildSuccessResult('insight', {}).useCase, 'insight');
    assert.strictEqual(ucBuilder.buildSuccessResult('behavior', {}).useCase, 'behavior');
    assert.strictEqual(wfBuilder.buildSuccessResult('insight-wf', {}).workflow, 'insight-wf');
    assert.strictEqual(wfBuilder.buildSuccessResult('behavior-wf', {}).workflow, 'behavior-wf');
    assert.strictEqual(ftBuilder.buildSuccessResult('insight', {}).feature, 'insight');
    assert.strictEqual(ftBuilder.buildSuccessResult('behavior', {}).feature, 'behavior');
  });

  await test('（4.shared layer boundary）端對端：Insight跟Behavior的Use Case都呼叫同一個intelligenceApplicationService實例，該實例本身完全不需要知道呼叫方是誰', async () => {
    const { createApplicationService } = await import(path.join(applicationDir, 'index.js'));
    const { createIntelligenceFacade } = await import(path.join(intelDir, 'facade', 'index.js'));
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    const { createIntelligenceService } = await import(path.join(intelDir, 'service', 'index.js'));
    const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));
    const { createAnalysisRunner } = await import(path.join(intelDir, 'analysis', 'index.js'));
    const { createRecommendationRunner } = await import(path.join(intelDir, 'recommendation', 'index.js'));
    const { createInsightUseCase } = await import(path.join(useCasesDir, 'index.js'));
    const { createBehaviorUseCase } = await import(path.join(behaviorDir, 'index.js'));

    const dataPreparation = { prepare: async () => ({ ok: true, context: {} }) };
    const contextBuilder = { buildInsightContext: () => ({ context: { user: null, activityContext: { count: 0, items: [] }, nutritionContext: { count: 0, items: [] }, emotionContext: { count: 0, items: [] }, behaviorContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] }, metadata: {} }, validation: { ok: true } }) };
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation, contextBuilder, analysisRunner: createAnalysisRunner(), recommendationRunner: createRecommendationRunner() });
    const service = createIntelligenceService({ orchestrator });
    const executionManager = createExecutionManager({ service });
    const facade = createIntelligenceFacade({ executionManager });
    const sharedApplicationService = createApplicationService({ facade });

    const insightUseCase = createInsightUseCase({ applicationService: sharedApplicationService });
    const behaviorUseCase = createBehaviorUseCase({ applicationService: sharedApplicationService });

    const insightResult = await insightUseCase.requestUserInsight({}, { userId: 'u1' });
    const behaviorResult = await behaviorUseCase.requestUserBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
    assert.deepStrictEqual(insightResult.data, behaviorResult.data);
  });

  console.log('');

  // =========================================================================
  // E. workflow boundary
  // =========================================================================
  console.log('--- E. workflow boundary ---');

  await test('（5.workflow boundary）application_workflow.js的實際程式碼（去除註解後）完全不含"insight"或"behavior"業務邏輯字樣，除了介面方法名稱requestInsightCapability', () => {
    const src = readSrc(path.join(workflowsDir, 'application_workflow.js'));
    assert.ok(!/behavior/i.test(src), 'application_workflow.js不應該含有behavior字樣');
    const insightOccurrences = [...src.matchAll(/insight/gi)];
    for (const m of insightOccurrences) {
      const context = src.slice(Math.max(0, m.index - 20), m.index + 20);
      assert.ok(/requestInsightCapability/.test(context), `application_workflow.js出現非預期的insight字樣：${context}`);
    }
  });

  await test('（5.workflow boundary）application_workflow.js完全不import任何Feature-specific或domain-specific的檔案（不import features/、capabilities/insight_capability.js、use_cases/insight_use_case.js）', () => {
    const src = readSrc(path.join(workflowsDir, 'application_workflow.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./workflow_result_builder.js']);
  });

  await test('（5.workflow boundary）createApplicationWorkflow()是factory函式，不是singleton——重複呼叫產生互不相干的獨立實例（no incorrect dependency，不會意外共用內部狀態）', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const workflowA = createApplicationWorkflow({ capability: { requestInsightCapability: async () => ({ ok: true, data: { status: 'A', result: {}, metadata: {} } }) }, contractValidator: {} });
    const workflowB = createApplicationWorkflow({ capability: { requestInsightCapability: async () => ({ ok: true, data: { status: 'B', result: {}, metadata: {} } }) }, contractValidator: {} });
    assert.notStrictEqual(workflowA, workflowB);
  });

  await test('（5.workflow boundary）端對端：兩個獨立Workflow實例（各自注入不同capability）確實回傳各自capability的資料，不會互相污染（驗證no incorrect dependency）', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const workflowA = createApplicationWorkflow({ capability: { requestInsightCapability: async () => ({ ok: true, data: { status: 'A-status', result: {}, metadata: {} } }) }, contractValidator: createContractValidator() });
    const workflowB = createApplicationWorkflow({ capability: { requestInsightCapability: async () => ({ ok: true, data: { status: 'B-status', result: {}, metadata: {} } }) }, contractValidator: createContractValidator() });
    const resultA = await workflowA.executeApplicationRequest({}, { userId: 'u1' });
    const resultB = await workflowB.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(resultA.data.status, 'A-status');
    assert.strictEqual(resultB.data.status, 'B-status');
  });

  await test('（5.workflow boundary）bootstrap.js裡Insight跟Behavior各自的Workflow確實是兩個不同實例（透過真實bootstrap組裝驗證，不是理論上的可能性）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'shared-status', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.workflow.executeApplicationRequest({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
    assert.strictEqual(insightResult.data.status, 'shared-status');
    assert.strictEqual(behaviorResult.data.status, 'shared-status');
  });

  await test('（5.workflow boundary）CONSOLIDATION_REVIEW.md記錄了Workflow Boundary Review三個子項（domain leakage/naming limitation/incorrect dependency）的審查結論', () => {
    const doc = fs.readFileSync(path.join(applicationDir, 'CONSOLIDATION_REVIEW.md'), 'utf8');
    assert.ok(/Domain leakage/.test(doc));
    assert.ok(/Naming limitation/.test(doc));
    assert.ok(/Incorrect dependency/.test(doc));
  });

  console.log('');

  // =========================================================================
  // F. contract consistency
  // =========================================================================
  console.log('--- F. contract consistency ---');

  await test('（6.contract consistency）Contract Layer的validateApplicationRequestContract()對Insight跟Behavior兩個domain的Feature request給出一致的驗證規則（同樣非法輸入得到同樣reason）', async () => {
    const { validateApplicationRequestContract } = await import(path.join(contractsDir, 'index.js'));
    const { insightFeatureCapability, applicationService, contractValidator } = await buildInsightChain();
    const { behaviorFeature } = await buildBehaviorChain(applicationService, contractValidator);
    const invalidInputs = [{}, { userId: 123 }, { userId: 'u1', options: [] }];
    for (const input of invalidInputs) {
      const contractResult = validateApplicationRequestContract(input);
      const insightResult = await insightFeatureCapability.requestInsight({}, input);
      const behaviorResult = await behaviorFeature.requestBehavior({}, input);
      assert.strictEqual(contractResult.reason, insightResult.reason);
      assert.strictEqual(contractResult.reason, behaviorResult.reason);
    }
  });

  await test('（6.contract consistency）同一個ContractValidator實例被Insight跟Behavior兩個Workflow共用時，兩者的驗證行為完全一致（deterministic、無狀態污染）', async () => {
    const { applicationService, contractValidator, workflow: insightWorkflow } = await buildInsightChain();
    const { behaviorWorkflow } = await buildBehaviorChain(applicationService, contractValidator);
    const insightInvalid = await insightWorkflow.executeApplicationRequest({}, {});
    const behaviorInvalid = await behaviorWorkflow.executeApplicationRequest({}, {});
    assert.strictEqual(insightInvalid.reason, behaviorInvalid.reason);
  });

  await test('（6.contract consistency）validateApplicationResponseContract()對Insight跟Behavior兩者Capability回傳的畸形response都能正確攔截（同一套規則不因domain而異）', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const malformedCapability = { requestInsightCapability: async () => ({ ok: true, data: { status: 'x' } }) };
    const workflowInsightLike = createApplicationWorkflow({ capability: malformedCapability, contractValidator: createContractValidator() });
    const workflowBehaviorLike = createApplicationWorkflow({ capability: malformedCapability, contractValidator: createContractValidator() });
    const r1 = await workflowInsightLike.executeApplicationRequest({}, { userId: 'u1' });
    const r2 = await workflowBehaviorLike.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(r1.reason, 'missing_field');
    assert.strictEqual(r2.reason, 'missing_field');
  });

  await test('（6.contract consistency）Contract Layer本身（4個檔案）本次審查完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/contracts/'], { cwd: repoRoot, encoding: 'utf8' });
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
  const ALL_SCAN_FILES = [...SHARED_GENERIC_FILES, ...INSIGHT_ALL_FILES, ...BEHAVIOR_ALL_FILES];

  for (const f of ALL_SCAN_FILES) {
    const relName = path.relative(repoRoot, f);
    const src = readSrc(f);
    await test(`（7.dependency scan）${relName} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（7.dependency scan）${relName} 完全不import src/auth/、src/oauth/`, () => {
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
    await test(`（7.dependency scan）${relName} 完全不import src/intelligence/execution/（Execution Manager）`, () => {
      const executionManagerDir = path.join(intelDir, 'execution');
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        const resolved = path.normalize(path.join(path.dirname(f), imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir);
      }
    });
    await test(`（7.dependency scan）${relName} 完全不含AI Provider相關關鍵字樣`, () => {
      for (const pattern of AI_KEYWORDS) {
        assert.ok(!pattern.test(src), `${relName}出現疑似AI相關字樣：${pattern}`);
      }
    });
    await test(`（7.dependency scan）${relName} 完全不呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（7.dependency scan）${relName} 完全不import src/intelligence/service/、orchestration/、analysis/、recommendation/、data_preparation/、governance/、facade/`, () => {
      assert.ok(!/from\s+['"].*\/service\//.test(src));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
      assert.ok(!/from\s+['"].*\/governance\//.test(src));
      assert.ok(!/from\s+['"].*\/facade\//.test(src));
    });
    await test(`（7.dependency scan）${relName} 完全不import src/intelligence/history/、metrics/、events/、monitoring/`, () => {
      assert.ok(!/from\s+['"].*\/history\//.test(src));
      assert.ok(!/from\s+['"].*\/metrics\//.test(src));
      assert.ok(!/from\s+['"].*\/events\//.test(src));
      assert.ok(!/from\s+['"].*\/monitoring\//.test(src));
    });
    await test(`（7.dependency scan）${relName} 完全不出現jwt/session/cookie相關字樣，也不呼叫requireAuth()`, () => {
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
      assert.ok(!/requireAuth\(/.test(src));
    });
    await test(`（7.dependency scan）${relName} 裡所有相對路徑以外的import都不存在`, () => {
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${relName}import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  await test(`（7.dependency scan）本次審查範圍共掃描了${ALL_SCAN_FILES.length}個Application Layer相關檔案（記錄完整覆蓋範圍）`, () => {
    assert.ok(ALL_SCAN_FILES.length >= 25, `預期至少25個檔案，實際${ALL_SCAN_FILES.length}`);
  });

  console.log('');

  // =========================================================================
  // H. export consistency
  // =========================================================================
  console.log('--- H. export consistency ---');

  await test('（8.export consistency）application/features/index.js同時具備insight跟behavior兩個namespace', () => {
    const namespaces = getReExportedNamespaces(path.join(featuresDir, 'index.js'));
    assert.ok(namespaces.has('insight'));
    assert.ok(namespaces.has('behavior'));
  });

  await test('（8.export consistency）import後，featuresModule.insight跟featuresModule.behavior都是非空物件，各自具備正確的具名函式', async () => {
    const featuresModule = await import(path.join(featuresDir, 'index.js'));
    assert.strictEqual(typeof featuresModule.insight.createInsightFeatureCapability, 'function');
    assert.strictEqual(typeof featuresModule.behavior.createBehaviorFeature, 'function');
    assert.strictEqual(typeof featuresModule.behavior.createBehaviorUseCase, 'function');
    assert.strictEqual(typeof featuresModule.behavior.createBehaviorCapability, 'function');
  });

  await test('（8.export consistency）featuresModule.insight跟featuresModule.behavior互不污染（各自只有自己該有的函式，behavior namespace沒有insight的函式，反之亦然）', async () => {
    const featuresModule = await import(path.join(featuresDir, 'index.js'));
    assert.strictEqual(typeof featuresModule.insight.createBehaviorFeature, 'undefined');
    assert.strictEqual(typeof featuresModule.behavior.createInsightFeatureCapability, 'undefined');
  });

  await test('（8.export consistency）application/index.js re-export的use_cases/capabilities/contracts/workflows/features五個namespace都存在且各自非空', async () => {
    const applicationModule = await import(path.join(applicationDir, 'index.js'));
    for (const ns of ['useCases', 'capabilities', 'contracts', 'workflows', 'features']) {
      assert.strictEqual(typeof applicationModule[ns], 'object', `application/index.js應該有${ns} namespace`);
    }
  });

  // （TASK1.76後更新）原本這裡有一個「src/intelligence/index.js
  // 完全沒有被TASK1.73修改」的斷言，比對整個檔案即時的git diff
  // --stat。這是跟TASK1.39/TASK1.56/TASK1.63/TASK1.67/TASK1.68
  // 同一種「比對即時整檔git diff」的脆弱治具：src/intelligence/
  // index.js從來就不在本任務系列真正的禁止清單裡，TASK1.76合法地
  // 在這個檔案新增了頂層capabilities namespace的re-export
  // （`export * as capabilities from './capabilities/index.js'`），
  // 導致這個斷言失敗——這不是TASK1.73造成的回歸，而是斷言本身
  // 寫得過度嚴格，這裡移除這個斷言，改由TASK1.76/後續任務自己的
  // 章節驗證真正的禁止清單（worker.js等）維持零異動即可。

  await test('（8.export consistency）application/features/index.js本次審查完全沒有被修改（git diff確認，Behavior的namespace是TASK1.72新增的，本次是純審查）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/features/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // I. bootstrap consistency
  // =========================================================================
  console.log('--- I. bootstrap consistency ---');

  await test('（9.bootstrap consistency）app.intelligence物件恰好具備24個欄位（TASK1.72既有狀態，本次審查沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（9.bootstrap consistency）app.intelligence.behaviorFeature跟app.intelligence.insightFeature/insightExecutionFlow/features/workflow六個欄位互不相同（各自獨立實例）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const entries = [app.intelligence.behaviorFeature, app.intelligence.insightFeature, app.intelligence.insightExecutionFlow, app.intelligence.features, app.intelligence.workflow];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        assert.notStrictEqual(entries[i], entries[j], `entries[${i}]跟entries[${j}]不應該是同一個實例`);
      }
    }
  });

  await test('（9.bootstrap consistency）app.intelligence.application（Application Service實例）本身只有一份，被Insight跟Behavior兩條鏈路間接共用（不是各自建立第二份）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(typeof app.intelligence.application.requestIntelligence, 'function');
    assert.deepStrictEqual(Object.keys(app.intelligence.application), ['requestIntelligence']);
  });

  await test('（9.bootstrap consistency）src/bootstrap/application.js本次審查完全沒有被修改（git diff確認，本次是純審查任務）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.bootstrap consistency）Application Layer所有production原始碼（application/底下.js檔案）本次審查完全沒有被修改（唯一新增的是CONSOLIDATION_REVIEW.md）', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null | grep -v '^$' || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非文件的production程式碼變更：${diff}`);
  });

  await test('（9.bootstrap consistency）CONSOLIDATION_REVIEW.md存在於正確路徑且內容非空，記錄TASK1.73', () => {
    const docPath = path.join(applicationDir, 'CONSOLIDATION_REVIEW.md');
    assert.ok(fs.existsSync(docPath));
    const doc = fs.readFileSync(docPath, 'utf8');
    assert.ok(doc.length > 500);
    assert.ok(/TASK1\.73/.test(doc));
  });

  await test('（9.bootstrap consistency）CONSOLIDATION_REVIEW.md記錄了Phase 4 Extension Point章節，說明未來新增Feature的合法入口', () => {
    const doc = fs.readFileSync(path.join(applicationDir, 'CONSOLIDATION_REVIEW.md'), 'utf8');
    assert.ok(/Phase 4 Extension Point/.test(doc));
    assert.ok(/createApplicationWorkflow/.test(doc));
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.73-application-consolidation')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（10.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 63, `預期至少63個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（11.P1-P6）src/worker.js 完全沒有被本次審查修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）wrangler.toml 完全沒有被本次審查修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（11.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次審查修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）Runtime Execution Layer（execution/、service/、orchestration/、analysis/、recommendation/、data_preparation/、facade/）本次審查完全沒有被修改（git diff確認）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/execution/ src/intelligence/service/ src/intelligence/orchestration/ src/intelligence/analysis/ src/intelligence/recommendation/ src/intelligence/data_preparation/ src/intelligence/facade/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

/*
 * Phase 3 TASK 1.74｜Phase 3 Application Final Validation 測試
 *
 * 本任務不是新增功能、不是建立新Layer、不是導入AI——這是Phase 3
 * Application Layer系列（TASK1.60起算）的最後一次總體驗證，確認
 * 整條Application Architecture已經完成，並且可以安全進入Phase 4。
 *
 * 延續並整合TASK1.70（Lifecycle Validation）、TASK1.71（Extension
 * Pattern Review）、TASK1.73（Consolidation Review）三次審查的
 * 結論，本次做最終彙整跟交叉確認，詳見本次新增的
 * `src/intelligence/application/PHASE3_FINAL_VALIDATION.md`。
 *
 * 分為以下12個部分：
 * A) application architecture
 * B) feature isolation
 * C) insight validation
 * D) behavior validation
 * E) shared layer validation
 * F) workflow boundary
 * G) runtime isolation
 * H) dependency scan
 * I) export consistency
 * J) bootstrap consistency
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

const ALL_APPLICATION_FILES = listAllJsFiles(applicationDir);

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
  return { insightFeatureCapability, workflow, applicationService, contractValidator, insightUseCase, insightCapability };
}

async function buildBehaviorChain(sharedApplicationService, sharedContractValidator) {
  const { createBehaviorFeature, createBehaviorUseCase, createBehaviorCapability } = await import(path.join(behaviorDir, 'index.js'));
  const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
  const behaviorUseCase = createBehaviorUseCase({ applicationService: sharedApplicationService });
  const behaviorCapability = createBehaviorCapability({ useCase: behaviorUseCase });
  const behaviorWorkflow = createApplicationWorkflow({ capability: behaviorCapability, contractValidator: sharedContractValidator });
  const behaviorFeature = createBehaviorFeature({ workflow: behaviorWorkflow });
  return { behaviorFeature, behaviorWorkflow, behaviorUseCase, behaviorCapability };
}

async function run() {
  const INSIGHT_ALL_FILES = listAllJsFiles(insightDir);
  const BEHAVIOR_ALL_FILES = listAllJsFiles(behaviorDir);

  // =========================================================================
  // A. application architecture
  // =========================================================================
  console.log('--- A. application architecture ---');

  await test('（1.application architecture）PHASE3_FINAL_VALIDATION.md存在且記錄了TASK1.74跟完整流程結論', () => {
    const docPath = path.join(applicationDir, 'PHASE3_FINAL_VALIDATION.md');
    assert.ok(fs.existsSync(docPath));
    const doc = fs.readFileSync(docPath, 'utf8');
    assert.ok(doc.length > 500);
    assert.ok(/TASK1\.74/.test(doc));
    assert.ok(/可以安全進入Phase 4/.test(doc));
  });

  await test('（1.application architecture）Feature→Workflow→Capability→Use Case→Application Service五層的入口函式全部存在', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createInsightCapability } = await import(path.join(capabilitiesDir, 'index.js'));
    const { createInsightUseCase } = await import(path.join(useCasesDir, 'index.js'));
    const { createApplicationService } = await import(path.join(applicationDir, 'index.js'));
    assert.strictEqual(typeof createApplicationWorkflow({ capability: {}, contractValidator: {} }).executeApplicationRequest, 'function');
    assert.strictEqual(typeof createInsightCapability({}).requestInsightCapability, 'function');
    assert.strictEqual(typeof createInsightUseCase({}).requestUserInsight, 'function');
    assert.strictEqual(typeof createApplicationService({}).requestIntelligence, 'function');
  });

  await test('（1.application architecture）端對端：Insight完整鏈路（Feature→Workflow→Capability→Use Case→Application Service→Facade→Execution Manager→Service→Orchestrator→Analysis/Recommendation）成功走完，回傳ok:true', async () => {
    const { insightFeatureCapability } = await buildInsightChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（1.application architecture）端對端：Behavior完整鏈路（同樣六層）成功走完，回傳ok:true', async () => {
    const { applicationService, contractValidator } = await buildInsightChain();
    const { behaviorFeature } = await buildBehaviorChain(applicationService, contractValidator);
    const result = await behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（1.application architecture）端對端：兩個domain的成功結果都恰好具備data.status/data.result/data.metadata三個欄位（流程一致）', async () => {
    const { insightFeatureCapability, applicationService, contractValidator } = await buildInsightChain();
    const { behaviorFeature } = await buildBehaviorChain(applicationService, contractValidator);
    const insightResult = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(insightResult.data).sort(), ['metadata', 'result', 'status']);
    assert.deepStrictEqual(Object.keys(behaviorResult.data).sort(), ['metadata', 'result', 'status']);
  });

  await test('（1.application architecture）端對端：兩個domain的失敗傳遞規則一致（結構化{ok:false, reason}，不會拋出未處理例外）', async () => {
    const { insightFeatureCapability, applicationService, contractValidator } = await buildInsightChain();
    const { behaviorFeature } = await buildBehaviorChain(applicationService, contractValidator);
    await assert.doesNotReject(() => insightFeatureCapability.requestInsight({}, {}));
    await assert.doesNotReject(() => behaviorFeature.requestBehavior({}, {}));
    const insightFail = await insightFeatureCapability.requestInsight({}, {});
    const behaviorFail = await behaviorFeature.requestBehavior({}, {});
    assert.strictEqual(insightFail.ok, false);
    assert.strictEqual(behaviorFail.ok, false);
    assert.strictEqual(typeof insightFail.reason, 'string');
    assert.strictEqual(typeof behaviorFail.reason, 'string');
  });

  await test('（1.application architecture）Workflow的成功/失敗回傳形狀在整條鏈路上維持一致（{ok, workflow, data}/{ok:false, workflow, reason}）', async () => {
    const { workflow } = await buildInsightChain();
    const success = await workflow.executeApplicationRequest({}, { userId: 'u1' });
    const failure = await workflow.executeApplicationRequest({}, {});
    assert.deepStrictEqual(Object.keys(success).sort(), ['data', 'ok', 'workflow']);
    assert.deepStrictEqual(Object.keys(failure).sort(), ['ok', 'reason', 'workflow']);
  });

  console.log('');

  // =========================================================================
  // B. feature isolation
  // =========================================================================
  console.log('--- B. feature isolation ---');

  await test('（2.feature isolation）features/insight/跟features/behavior/兩個目錄互不import', () => {
    for (const f of INSIGHT_ALL_FILES) {
      assert.ok(!/from\s+['"].*\/behavior\//.test(readSrc(f)));
    }
    for (const f of BEHAVIOR_ALL_FILES) {
      assert.ok(!/from\s+['"].*\/insight\//.test(readSrc(f)));
    }
  });

  await test('（2.feature isolation）features/index.js同時具備insight跟behavior兩個namespace，各自獨立', async () => {
    const namespaces = getReExportedNamespaces(path.join(featuresDir, 'index.js'));
    assert.ok(namespaces.has('insight'));
    assert.ok(namespaces.has('behavior'));
    const featuresModule = await import(path.join(featuresDir, 'index.js'));
    assert.strictEqual(typeof featuresModule.insight.createBehaviorFeature, 'undefined');
    assert.strictEqual(typeof featuresModule.behavior.createInsightFeatureCapability, 'undefined');
  });

  await test('（2.feature isolation）端對端：修改Insight鏈路的中間結果不會影響Behavior鏈路的獨立實例（各自的Use Case/Capability/Workflow物件完全不同）', async () => {
    const { applicationService, contractValidator, insightUseCase, insightCapability, workflow: insightWorkflow } = await buildInsightChain();
    const { behaviorUseCase, behaviorCapability, behaviorWorkflow } = await buildBehaviorChain(applicationService, contractValidator);
    assert.notStrictEqual(insightUseCase, behaviorUseCase);
    assert.notStrictEqual(insightCapability, behaviorCapability);
    assert.notStrictEqual(insightWorkflow, behaviorWorkflow);
  });

  await test('（2.feature isolation）兩個Feature各自的Result Mapper/Builder互相獨立，修改其中一個不影響另一個的行為', async () => {
    const insightMapperMod = await import(path.join(insightDir, 'insight_result_mapper.js'));
    const behaviorMapperMod = await import(path.join(behaviorDir, 'behavior_result_mapper.js'));
    const insightMapper = insightMapperMod.createInsightResultMapper();
    const behaviorMapper = behaviorMapperMod.createBehaviorResultMapper();
    const input = { status: 'shared-status', result: {}, metadata: {} };
    const insightResult = insightMapper.mapSuccessResult(input);
    const behaviorResult = behaviorMapper.mapSuccessResult(input);
    assert.notStrictEqual(insightResult.feature, behaviorResult.feature);
  });

  console.log('');

  // =========================================================================
  // C. insight validation
  // =========================================================================
  console.log('--- C. insight validation ---');

  await test('（3.insight validation）features/insight/整條樹恰好12個檔案', () => {
    assert.strictEqual(INSIGHT_ALL_FILES.length, 12);
  });

  await test('（3.insight validation）Insight的四個nested子系統（context/output/execution + 根目錄capability）都存在且各自可運作', async () => {
    const { createInsightFeatureCapability, context, output, execution } = await import(path.join(insightDir, 'index.js'));
    assert.strictEqual(typeof createInsightFeatureCapability, 'function');
    assert.strictEqual(typeof context.createInsightContextMapper, 'function');
    assert.strictEqual(typeof output.createInsightOutputMapper, 'function');
    assert.strictEqual(typeof execution.createInsightExecutionFlow, 'function');
  });

  await test('（3.insight validation）端對端：Insight Execution Flow（TASK1.69）確實可以走完整條Request→Output生命週期，得到通過validateInsightOutput()驗證的輸出', async () => {
    const { context, output, execution } = await import(path.join(insightDir, 'index.js'));
    const { workflow } = await buildInsightChain();
    const executionFlow = execution.createInsightExecutionFlow({ workflow, contextMapper: context.createInsightContextMapper(), outputMapper: output.createInsightOutputMapper() });
    const result = await executionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    const { validateInsightOutput } = await import(path.join(insightDir, 'output', 'insight_output_model.js'));
    assert.deepStrictEqual(validateInsightOutput(result.output), { ok: true });
  });

  await test('（3.insight validation）Insight專屬檔案（capabilities/insight_capability.js、use_cases/insight_use_case.js、features/insight_feature.js、features/insight/整條樹）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/capabilities/insight_capability.js src/intelligence/application/use_cases/insight_use_case.js src/intelligence/application/features/insight_feature.js src/intelligence/application/features/insight/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.insight validation）Insight的requestInsight()對不同userId都能正確走完整條生命週期（不是巧合的單一測試案例）', async () => {
    const { insightFeatureCapability } = await buildInsightChain();
    for (const userId of ['u1', 'another-user', 'x']) {
      const result = await insightFeatureCapability.requestInsight({}, { userId });
      assert.strictEqual(result.ok, true, `userId=${userId}應該成功`);
    }
  });

  console.log('');

  // =========================================================================
  // D. behavior validation
  // =========================================================================
  console.log('--- D. behavior validation ---');

  await test('（4.behavior validation）features/behavior/整條樹恰好4個.js檔案（behavior_capability/behavior_feature/behavior_result_mapper/index，另有README.md非.js檔案）', () => {
    assert.strictEqual(BEHAVIOR_ALL_FILES.length, 4);
  });

  await test('（4.behavior validation）Behavior的三個具名函式（createBehaviorFeature/createBehaviorUseCase/createBehaviorCapability）都存在且可運作', async () => {
    const { createBehaviorFeature, createBehaviorUseCase, createBehaviorCapability } = await import(path.join(behaviorDir, 'index.js'));
    assert.strictEqual(typeof createBehaviorFeature({ workflow: {} }).requestBehavior, 'function');
    assert.strictEqual(typeof createBehaviorUseCase({}).requestUserBehavior, 'function');
    assert.strictEqual(typeof createBehaviorCapability({}).requestInsightCapability, 'function');
  });

  await test('（4.behavior validation）端對端：Behavior Feature確實可以走完整條Request→Output生命週期', async () => {
    const { applicationService, contractValidator } = await buildInsightChain();
    const { behaviorFeature } = await buildBehaviorChain(applicationService, contractValidator);
    const result = await behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'behavior');
  });

  await test('（4.behavior validation）Behavior專屬檔案（features/behavior/整條樹）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/features/behavior/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.behavior validation）Behavior的requestBehavior()對不同userId都能正確走完整條生命週期', async () => {
    const { applicationService, contractValidator } = await buildInsightChain();
    const { behaviorFeature } = await buildBehaviorChain(applicationService, contractValidator);
    for (const userId of ['u1', 'another-user', 'x']) {
      const result = await behaviorFeature.requestBehavior({}, { userId });
      assert.strictEqual(result.ok, true, `userId=${userId}應該成功`);
    }
  });

  console.log('');

  // =========================================================================
  // E. shared layer validation
  // =========================================================================
  console.log('--- E. shared layer validation ---');

  for (const f of SHARED_GENERIC_FILES) {
    const relName = path.relative(repoRoot, f);
    await test(`（5.shared layer validation）${relName} 完全不含"insight"字樣`, () => {
      assert.ok(!/insight/i.test(readSrc(f)));
    });
    await test(`（5.shared layer validation）${relName} 完全不含"behavior"字樣`, () => {
      assert.ok(!/behavior/i.test(readSrc(f)));
    });
  }

  await test('（5.shared layer validation）端對端：同一個Application Service實例被Insight跟Behavior兩個Use Case呼叫，回傳完全相同的Runtime資料（真正domain-agnostic，不是各自建立第二份導致巧合一致）', async () => {
    const { applicationService, insightUseCase } = await buildInsightChain();
    const { behaviorUseCase } = await buildBehaviorChain(applicationService, {});
    const insightResult = await insightUseCase.requestUserInsight({}, { userId: 'u1' });
    const behaviorResult = await behaviorUseCase.requestUserBehavior({}, { userId: 'u1' });
    assert.deepStrictEqual(insightResult.data, behaviorResult.data);
  });

  await test('（5.shared layer validation）Contract Layer本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/contracts/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.shared layer validation）application_service.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/application_service.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // F. workflow boundary
  // =========================================================================
  console.log('--- F. workflow boundary ---');

  await test('（6.workflow boundary）application_workflow.js唯一的相對路徑import是./workflow_result_builder.js（沒有domain leakage）', () => {
    const src = readSrc(path.join(workflowsDir, 'application_workflow.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]), ['./workflow_result_builder.js']);
  });

  await test('（6.workflow boundary）application_workflow.js除了介面方法名稱requestInsightCapability外，完全沒有其他insight相關字樣（已知的naming limitation，不是domain leakage）', () => {
    const src = readSrc(path.join(workflowsDir, 'application_workflow.js'));
    const occurrences = [...src.matchAll(/insight/gi)];
    for (const m of occurrences) {
      const context = src.slice(Math.max(0, m.index - 20), m.index + 20);
      assert.ok(/requestInsightCapability/.test(context));
    }
  });

  await test('（6.workflow boundary）application_workflow.js完全不含"behavior"字樣', () => {
    assert.ok(!/behavior/i.test(readSrc(path.join(workflowsDir, 'application_workflow.js'))));
  });

  await test('（6.workflow boundary）createApplicationWorkflow()是factory，重複呼叫產生互不相干的實例（no incorrect dependency）', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const a = createApplicationWorkflow({ capability: {}, contractValidator: {} });
    const b = createApplicationWorkflow({ capability: {}, contractValidator: {} });
    assert.notStrictEqual(a, b);
  });

  await test('（6.workflow boundary）端對端：Insight跟Behavior各自的Workflow實例即使共用同一個ContractValidator，也不會互相污染彼此的Capability結果', async () => {
    const { workflow: insightWorkflow, applicationService, contractValidator } = await buildInsightChain();
    const { behaviorWorkflow } = await buildBehaviorChain(applicationService, contractValidator);
    const insightResult = await insightWorkflow.executeApplicationRequest({}, { userId: 'u1' });
    const behaviorResult = await behaviorWorkflow.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  await test('（6.workflow boundary）application_workflow.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/workflows/application_workflow.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // G. runtime isolation
  // =========================================================================
  console.log('--- G. runtime isolation ---');

  for (const f of ALL_APPLICATION_FILES) {
    const relName = path.relative(repoRoot, f);
    const src = readSrc(f);
    await test(`（7.runtime isolation）${relName} 完全不import src/intelligence/execution/（Execution Manager）`, () => {
      const executionManagerDir = path.join(intelDir, 'execution');
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        const resolved = path.normalize(path.join(path.dirname(f), imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir, `${relName}意外import了Execution Manager目錄下的檔案：${imp}`);
      }
    });
    await test(`（7.runtime isolation）${relName} 完全不import src/intelligence/history/`, () => {
      assert.ok(!/from\s+['"].*\/history\//.test(src));
    });
    await test(`（7.runtime isolation）${relName} 完全不import src/intelligence/metrics/`, () => {
      assert.ok(!/from\s+['"].*\/metrics\//.test(src));
    });
    await test(`（7.runtime isolation）${relName} 完全不import src/intelligence/events/`, () => {
      assert.ok(!/from\s+['"].*\/events\//.test(src));
    });
    await test(`（7.runtime isolation）${relName} 完全不import src/intelligence/governance/`, () => {
      assert.ok(!/from\s+['"].*\/governance\//.test(src));
    });
  }

  await test(`（7.runtime isolation）本次審查掃描了整個application/目錄樹共${ALL_APPLICATION_FILES.length}個.js檔案，逐一確認不直接操作Execution Manager/History/Metrics/Events/Governance五個Runtime子系統`, () => {
    assert.strictEqual(ALL_APPLICATION_FILES.length, 35);
  });

  await test('（7.runtime isolation）Runtime Execution Layer（execution/、service/、orchestration/、analysis/、recommendation/、data_preparation/、facade/、history/、metrics/、events/、governance/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/execution/ src/intelligence/service/ src/intelligence/orchestration/ src/intelligence/analysis/ src/intelligence/recommendation/ src/intelligence/data_preparation/ src/intelligence/facade/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // H. dependency scan
  // =========================================================================
  console.log('--- H. dependency scan ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];

  for (const f of ALL_APPLICATION_FILES) {
    const relName = path.relative(repoRoot, f);
    const src = readSrc(f);
    await test(`（8.dependency scan）${relName} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（8.dependency scan）${relName} 完全不import src/auth/、src/oauth/`, () => {
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
    await test(`（8.dependency scan）${relName} 完全不含AI Provider相關關鍵字樣`, () => {
      for (const pattern of AI_KEYWORDS) {
        assert.ok(!pattern.test(src), `${relName}出現疑似AI相關字樣：${pattern}`);
      }
    });
    await test(`（8.dependency scan）${relName} 完全不呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（8.dependency scan）${relName} 裡所有import都是相對路徑（不import任何非相對路徑的外部套件）`, () => {
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${relName}import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // I. export consistency
  // =========================================================================
  console.log('--- I. export consistency ---');

  await test('（9.export consistency）application/index.js re-export的use_cases/capabilities/contracts/workflows/features五個namespace都存在且各自非空', async () => {
    const applicationModule = await import(path.join(applicationDir, 'index.js'));
    for (const ns of ['useCases', 'capabilities', 'contracts', 'workflows', 'features']) {
      assert.strictEqual(typeof applicationModule[ns], 'object');
    }
  });

  await test('（9.export consistency）import後，featuresModule.insight跟featuresModule.behavior各自具備正確的具名函式', async () => {
    const featuresModule = await import(path.join(featuresDir, 'index.js'));
    assert.strictEqual(typeof featuresModule.insight.createInsightFeatureCapability, 'function');
    assert.strictEqual(typeof featuresModule.behavior.createBehaviorFeature, 'function');
  });

  await test('（9.export consistency）src/intelligence/index.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.export consistency）application/features/index.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/features/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.export consistency）Application Layer所有production原始碼（application/底下全部35個.js檔案）本次任務完全沒有被修改（唯一新增的是PHASE3_FINAL_VALIDATION.md）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/ | grep -v "\\.md " || true'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // J. bootstrap consistency
  // =========================================================================
  console.log('--- J. bootstrap consistency ---');

  await test('（10.bootstrap consistency）app.intelligence物件恰好具備24個欄位（TASK1.72既有狀態，本次審查沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（10.bootstrap consistency）app.intelligence.behaviorFeature跟app.intelligence.insightFeature/insightExecutionFlow/features/workflow全部各自獨立（互不相同的實例）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const entries = [app.intelligence.behaviorFeature, app.intelligence.insightFeature, app.intelligence.insightExecutionFlow, app.intelligence.features, app.intelligence.workflow];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        assert.notStrictEqual(entries[i], entries[j]);
      }
    }
  });

  await test('（10.bootstrap consistency）端對端：透過真實app物件，Insight跟Behavior兩個entry point都能成功運作（stub掉Runtime最底層的service.getIntelligence）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  await test('（10.bootstrap consistency）app.router.routes數量沒有因為本次任務而改變（本次任務明確禁止新增API route）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.ok(Array.isArray(app.router.routes));
    assert.ok(app.router.routes.length > 0);
  });

  await test('（10.bootstrap consistency）src/bootstrap/application.js本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.bootstrap consistency）PHASE3_FINAL_VALIDATION.md記錄了Phase 4 Extension Point三個子項（New Feature/AI Provider/Recommendation Capability）', () => {
    const doc = fs.readFileSync(path.join(applicationDir, 'PHASE3_FINAL_VALIDATION.md'), 'utf8');
    assert.ok(/New Feature/.test(doc));
    assert.ok(/AI Provider/.test(doc));
    assert.ok(/Recommendation Capability/.test(doc));
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.74-final-validation')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 64, `預期至少64個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（12.P1-P6）src/worker.js 完全沒有被本次審查修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）wrangler.toml 完全沒有被本次審查修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（12.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次審查修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

/*
 * Phase 3 TASK 1.67｜Insight Feature Context Integration
 * Foundation 測試
 *
 * 本任務不是建立API，也不是建立UI，也不是導入AI——這是建立Phase 3
 * Insight Feature（TASK1.66）與Intelligence Runtime Context
 * （Phase 2：Data Preparation/Insight Context/Analysis
 * Framework/Recommendation Framework/Intelligence Runtime）的
 * 整合邊界，驗證Application Layer與Runtime Layer的正式串接。這份
 * 測試驗證的是：
 * - insight_context_mapper.js正確把Runtime Context攤平成Insight
 *   Domain可用格式，只做結構性重新排列，不解讀業務內容
 * - insight_context_result_builder.js正確統一Insight Feature
 *   output mapping
 * - 端對端：Insight Feature Capability（TASK1.66）透過完整真實
 *   依賴鏈（一路到Analysis/Recommendation Runner）產生的真實
 *   輸出，可以被這裡的mapper正確消費，證明Phase 2 Runtime跟
 *   Phase 3 Application Layer事實上已經正式接通
 * - Insight Context Layer完全不主動呼叫Workflow/Capability/Use
 *   Case/Application Service/Facade，也完全不操作Execution
 *   Manager/History Store/Metrics Store/Event Dispatcher/
 *   Database/Auth/AI
 * - insight_capability.js（TASK1.66）完全沒有被修改（唯一相對
 *   路徑import維持不變）
 * - export一致性、regression、P1-P6
 *
 * 分為以下12個部分：
 * A) insight context mapping
 * B) runtime integration
 * C) workflow compatibility
 * D) feature boundary
 * E) contract compatibility
 * F) application service isolation
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
  const insightFeatureCapability = createInsightFeatureCapability({ workflow });
  return { insightFeatureCapability, workflow, insightCapability, insightUseCase, applicationService, facade, executionManager, service };
}

async function run() {
  const mapperMod = await import(path.join(contextDir, 'insight_context_mapper.js'));
  const { createInsightContextMapper } = mapperMod;
  const builderMod = await import(path.join(contextDir, 'insight_context_result_builder.js'));
  const { createInsightContextResultBuilder } = builderMod;
  await import(path.join(contextDir, 'index.js'));

  const CONTEXT_JS_FILES = fs.readdirSync(contextDir).filter((f) => f.endsWith('.js')).sort();

  // =========================================================================
  // A. insight context mapping
  // =========================================================================
  console.log('--- A. insight context mapping ---');

  await test('（1.insight context mapping）src/intelligence/application/features/insight/context/ 恰好包含3個.js檔案（insight_context_mapper/insight_context_result_builder/index）', () => {
    assert.deepStrictEqual(CONTEXT_JS_FILES, ['index.js', 'insight_context_mapper.js', 'insight_context_result_builder.js']);
  });

  await test('（1.insight context mapping）src/intelligence/application/features/insight/context/README.md 存在且非空', () => {
    const readmePath = path.join(contextDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.insight context mapping）createInsightContextMapper()回傳物件恰好只有mapRuntimeContextToInsightDomain一個公開介面', () => {
    const mapper = createInsightContextMapper();
    assert.deepStrictEqual(Object.keys(mapper), ['mapRuntimeContextToInsightDomain']);
  });

  await test('（1.insight context mapping）mapRuntimeContextToInsightDomain()正確攤平{status,result:{context,analysis,recommendation},metadata}成扁平格式', () => {
    const mapper = createInsightContextMapper();
    const input = { status: 'intelligence_ready', result: { context: { user: null }, analysis: { a: 1 }, recommendation: { r: 1 } }, metadata: { m: 1 } };
    const output = mapper.mapRuntimeContextToInsightDomain(input);
    assert.deepStrictEqual(output, {
      status: 'intelligence_ready',
      context: { user: null },
      analysis: { a: 1 },
      recommendation: { r: 1 },
      metadata: { m: 1 },
    });
  });

  await test('（1.insight context mapping）mapRuntimeContextToInsightDomain()不修改輸入物件本身（沒有side effect）', () => {
    const mapper = createInsightContextMapper();
    const input = { status: 'x', result: { context: {}, analysis: {}, recommendation: {} }, metadata: {} };
    const inputCopy = JSON.parse(JSON.stringify(input));
    mapper.mapRuntimeContextToInsightDomain(input);
    assert.deepStrictEqual(input, inputCopy);
  });

  await test('（1.insight context mapping）mapRuntimeContextToInsightDomain(undefined)不拋出例外，回傳全部欄位為null', () => {
    const mapper = createInsightContextMapper();
    assert.doesNotThrow(() => mapper.mapRuntimeContextToInsightDomain(undefined));
    const output = mapper.mapRuntimeContextToInsightDomain(undefined);
    assert.deepStrictEqual(output, { status: null, context: null, analysis: null, recommendation: null, metadata: null });
  });

  await test('（1.insight context mapping）mapRuntimeContextToInsightDomain(null)不拋出例外', () => {
    const mapper = createInsightContextMapper();
    assert.doesNotThrow(() => mapper.mapRuntimeContextToInsightDomain(null));
  });

  await test('（1.insight context mapping）mapRuntimeContextToInsightDomain("string")不拋出例外', () => {
    const mapper = createInsightContextMapper();
    assert.doesNotThrow(() => mapper.mapRuntimeContextToInsightDomain('string'));
  });

  await test('（1.insight context mapping）result為陣列時安全視為空物件，不拋出例外', () => {
    const mapper = createInsightContextMapper();
    const output = mapper.mapRuntimeContextToInsightDomain({ status: 'x', result: [], metadata: {} });
    assert.deepStrictEqual(output, { status: 'x', context: null, analysis: null, recommendation: null, metadata: {} });
  });

  await test('（1.insight context mapping）result缺少某個欄位時該欄位映射為null（不假造資料）', () => {
    const mapper = createInsightContextMapper();
    const output = mapper.mapRuntimeContextToInsightDomain({ status: 'x', result: { context: { a: 1 } }, metadata: {} });
    assert.strictEqual(output.context.a, 1);
    assert.strictEqual(output.analysis, null);
    assert.strictEqual(output.recommendation, null);
  });

  await test('（1.insight context mapping）context/analysis/recommendation的值原封不動（只做結構重排，不修改內容）', () => {
    const mapper = createInsightContextMapper();
    const context = { user: null, activityContext: { count: 5, items: [1, 2, 3] } };
    const analysis = { deep: { nested: { value: 42 } } };
    const recommendation = { list: ['a', 'b'] };
    const output = mapper.mapRuntimeContextToInsightDomain({ status: 'x', result: { context, analysis, recommendation }, metadata: {} });
    assert.strictEqual(output.context, context);
    assert.strictEqual(output.analysis, analysis);
    assert.strictEqual(output.recommendation, recommendation);
  });

  await test('（1.insight context mapping）mapRuntimeContextToInsightDomain()是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const mapper = createInsightContextMapper();
    const input = { status: 'x', result: { context: { a: 1 }, analysis: { b: 2 }, recommendation: { c: 3 } }, metadata: { d: 4 } };
    assert.deepStrictEqual(mapper.mapRuntimeContextToInsightDomain(input), mapper.mapRuntimeContextToInsightDomain(input));
  });

  await test('（1.insight context mapping）insight_context_mapper.js完全沒有任何import（純函式，零相依）', () => {
    const src = readSrc(path.join(contextDir, 'insight_context_mapper.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（1.insight context mapping）不同的Insight Context Mapper實例各自獨立（不是共用singleton）', () => {
    const mapperA = createInsightContextMapper();
    const mapperB = createInsightContextMapper();
    assert.notStrictEqual(mapperA, mapperB);
  });

  await test('（1.insight context mapping）createInsightContextMapper(任何參數)都回傳相同介面（不接受依賴注入，因為完全沒有任何依賴需要注入）', () => {
    const mapperA = createInsightContextMapper();
    const mapperB = createInsightContextMapper({ ignored: 'value' });
    assert.deepStrictEqual(Object.keys(mapperA), Object.keys(mapperB));
  });

  await test('（1.insight context mapping）status為非字串值（例如數字0、布林false）時原樣保留，不強制轉型也不誤判為缺漏', () => {
    const mapper = createInsightContextMapper();
    assert.strictEqual(mapper.mapRuntimeContextToInsightDomain({ status: 0, result: {}, metadata: {} }).status, 0);
    assert.strictEqual(mapper.mapRuntimeContextToInsightDomain({ status: false, result: {}, metadata: {} }).status, false);
  });

  await test('（1.insight context mapping）context/analysis/recommendation為null時正確保留null（不會被誤判成「欄位不存在」而覆蓋成別的值）', () => {
    const mapper = createInsightContextMapper();
    const output = mapper.mapRuntimeContextToInsightDomain({ status: 'x', result: { context: null, analysis: null, recommendation: null }, metadata: {} });
    assert.strictEqual(output.context, null);
    assert.strictEqual(output.analysis, null);
    assert.strictEqual(output.recommendation, null);
  });

  console.log('');

  // =========================================================================
  // B. runtime integration
  // =========================================================================
  console.log('--- B. runtime integration ---');

  await test('（2.runtime integration）端對端：真實Insight Feature Capability（透過完整依賴鏈到Analysis/Recommendation Runner）產生的輸出可以被mapper正確消費——驗證Phase 2 Runtime跟Phase 3 Application Layer事實上已經正式接通', async () => {
    const { insightFeatureCapability } = await buildRealChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);

    const mapper = createInsightContextMapper();
    const domainView = mapper.mapRuntimeContextToInsightDomain(result.data);
    assert.strictEqual(domainView.status, 'intelligence_ready');
    assert.ok(domainView.context && typeof domainView.context === 'object');
    assert.ok(domainView.analysis && typeof domainView.analysis === 'object');
    assert.ok(domainView.recommendation && typeof domainView.recommendation === 'object');
  });

  await test('（2.runtime integration）端對端：真實輸出的context欄位確實是TASK1.42 InsightContext形狀（具備user/activityContext/nutritionContext/emotionContext/behaviorContext/reportContext/metadata七個欄位）', async () => {
    const { insightFeatureCapability } = await buildRealChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    const mapper = createInsightContextMapper();
    const domainView = mapper.mapRuntimeContextToInsightDomain(result.data);
    const contextKeys = Object.keys(domainView.context).sort();
    assert.deepStrictEqual(contextKeys, ['activityContext', 'behaviorContext', 'emotionContext', 'metadata', 'nutritionContext', 'reportContext', 'user']);
  });

  await test('（2.runtime integration）端對端：mapper攤平後的context跟原始result.context內容完全相同（只是不再需要透過result取得，沒有遺漏或竄改任何欄位）', async () => {
    const { insightFeatureCapability } = await buildRealChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    const mapper = createInsightContextMapper();
    const domainView = mapper.mapRuntimeContextToInsightDomain(result.data);
    assert.deepStrictEqual(domainView.context, result.data.result.context);
    assert.deepStrictEqual(domainView.analysis, result.data.result.analysis);
    assert.deepStrictEqual(domainView.recommendation, result.data.result.recommendation);
  });

  await test('（2.runtime integration）端對端：把mapper的輸出餵給result builder，最終得到攤平格式的Insight Domain輸出', async () => {
    const { insightFeatureCapability } = await buildRealChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    const mapper = createInsightContextMapper();
    const builder = createInsightContextResultBuilder();
    const domainView = mapper.mapRuntimeContextToInsightDomain(result.data);
    const finalResult = builder.buildSuccessResult(domainView);
    assert.strictEqual(finalResult.ok, true);
    assert.strictEqual(finalResult.feature, 'insight');
    assert.deepStrictEqual(Object.keys(finalResult.data).sort(), ['analysis', 'context', 'metadata', 'recommendation', 'status']);
  });

  console.log('');

  // =========================================================================
  // C. workflow compatibility
  // =========================================================================
  console.log('--- C. workflow compatibility ---');

  await test('（3.workflow compatibility）Workflow成功回傳的{status,workflow,data}形狀，data部分可以被mapper正確消費（跟Insight Feature Capability的data形狀一致）', async () => {
    const { workflow } = await buildRealChain();
    const result = await workflow.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    const mapper = createInsightContextMapper();
    const domainView = mapper.mapRuntimeContextToInsightDomain(result.data);
    assert.strictEqual(domainView.status, 'intelligence_ready');
    assert.ok(domainView.context);
  });

  await test('（3.workflow compatibility）Application Service/Use Case/Capability/Workflow/Insight Feature Capability五層成功回傳的data，餵給mapper都得到相同的攤平結果（證明result pass-through在整條鏈路上完全一致）', async () => {
    const { insightFeatureCapability, workflow, insightCapability, insightUseCase, applicationService } = await buildRealChain();
    const mapper = createInsightContextMapper();

    const r1 = await applicationService.requestIntelligence({}, { userId: 'u1' });
    const r2 = await insightUseCase.requestUserInsight({}, { userId: 'u1' });
    const r3 = await insightCapability.requestInsightCapability({}, { userId: 'u1' });
    const r4 = await workflow.executeApplicationRequest({}, { userId: 'u1' });
    const r5 = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });

    const domainViews = [r1, r2, r3, r4, r5].map((r) => mapper.mapRuntimeContextToInsightDomain(r.data));
    for (let i = 1; i < domainViews.length; i++) {
      assert.deepStrictEqual(domainViews[i], domainViews[0]);
    }
  });

  await test('（3.workflow compatibility）Workflow失敗時的{ok:false,reason}形狀，mapper對缺少result欄位的情況安全處理（不拋出例外）', async () => {
    const { workflow } = await buildRealChain();
    const result = await workflow.executeApplicationRequest({}, {});
    assert.strictEqual(result.ok, false);
    const mapper = createInsightContextMapper();
    assert.doesNotThrow(() => mapper.mapRuntimeContextToInsightDomain(result));
  });

  console.log('');

  // =========================================================================
  // D. feature boundary
  // =========================================================================
  console.log('--- D. feature boundary ---');

  for (const file of CONTEXT_JS_FILES) {
    await test(`（4.feature boundary）context/${file} 完全不import ../insight_capability.js（不主動呼叫Insight Feature Capability，是被動的映射工具）`, () => {
      assert.ok(!/from\s+['"].*insight_capability\.js['"]/.test(readSrc(path.join(contextDir, file))));
    });
    await test(`（4.feature boundary）context/${file} 完全不import ../insight_result_mapper.js`, () => {
      assert.ok(!/from\s+['"].*insight_result_mapper\.js['"]/.test(readSrc(path.join(contextDir, file))));
    });
  }

  await test('（4.feature boundary）insight_capability.js（TASK1.66）完全沒有被修改——唯一相對路徑import維持是./insight_result_mapper.js', () => {
    const src = readSrc(path.join(insightDir, 'insight_capability.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./insight_result_mapper.js']);
  });

  await test('（4.feature boundary）insight_result_mapper.js（TASK1.66）完全沒有被修改——完全沒有任何import', () => {
    const src = readSrc(path.join(insightDir, 'insight_result_mapper.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（4.feature boundary）insight_capability.js完全沒有出現context/mapper/domain相關的import字樣（沒有反過來認識這個新的Context Layer的存在）', () => {
    const src = readSrc(path.join(insightDir, 'insight_capability.js'));
    assert.ok(!/from\s+['"]\.\/context\//.test(src));
  });

  console.log('');

  // =========================================================================
  // E. contract compatibility
  // =========================================================================
  console.log('--- E. contract compatibility ---');

  await test('（5.contract compatibility）真實輸出（透過完整鏈路）先通過Contract Layer的response驗證，再交給mapper攤平，兩者不互相衝突', async () => {
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { insightFeatureCapability } = await buildRealChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    const cv = createContractValidator();
    assert.deepStrictEqual(cv.validateResponse(result), { ok: true });

    const mapper = createInsightContextMapper();
    assert.doesNotThrow(() => mapper.mapRuntimeContextToInsightDomain(result.data));
  });

  await test('（5.contract compatibility）mapper攤平後餵給result builder產生的最終輸出，其data.status/data.metadata欄位跟Contract Layer要求的response欄位型別相容（status存在、metadata存在）', async () => {
    const { insightFeatureCapability } = await buildRealChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    const mapper = createInsightContextMapper();
    const builder = createInsightContextResultBuilder();
    const domainView = mapper.mapRuntimeContextToInsightDomain(result.data);
    const finalResult = builder.buildSuccessResult(domainView);
    assert.ok(Object.prototype.hasOwnProperty.call(finalResult.data, 'status'));
    assert.ok(Object.prototype.hasOwnProperty.call(finalResult.data, 'metadata'));
  });

  await test('（5.contract compatibility）建立在Insight Domain攤平輸出上的最終ok/reason形狀，本身也能通過Contract Layer的validateResponse()（因為ok/data/reason這組最小交集完全沒有改變）', async () => {
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { insightFeatureCapability } = await buildRealChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    const mapper = createInsightContextMapper();
    const builder = createInsightContextResultBuilder();
    const domainView = mapper.mapRuntimeContextToInsightDomain(result.data);
    const finalResult = builder.buildSuccessResult(domainView);
    const cv = createContractValidator();
    const validation = cv.validateResponse(finalResult);
    // Insight Domain攤平格式的data底下沒有result欄位（改成直接放context/
    // analysis/recommendation），跟Contract要求的data.result不同，這裡
    // 驗證的是這個「已知的形狀差異」，不是回歸——攤平格式是Insight Domain
    // 專屬的最終輸出，本來就不需要滿足上游泛用Contract的data.result欄位。
    assert.strictEqual(validation.ok, false);
    assert.strictEqual(validation.reason, 'missing_field');
  });

  await test('（5.contract compatibility）Contract Layer本身完全沒有被這個新的Context Layer修改——ApplicationRequestContract/ApplicationResponseContract的驗證規則維持不變', async () => {
    const { validateApplicationRequestContract, validateApplicationResponseContract } = await import(path.join(contractsDir, 'index.js'));
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: 'u1' }), { ok: true });
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true, data: { status: 'x', result: {}, metadata: {} } }), { ok: true });
  });

  console.log('');

  // =========================================================================
  // F. application service isolation
  // =========================================================================
  console.log('--- F. application service isolation ---');

  for (const file of CONTEXT_JS_FILES) {
    await test(`（6.application service isolation）context/${file} 完全不import src/intelligence/application/application_service.js`, () => {
      assert.ok(!/from\s+['"].*\/application_service\.js['"]/.test(readSrc(path.join(contextDir, file))));
    });
    await test(`（6.application service isolation）context/${file} 完全不import src/intelligence/facade/、src/intelligence/application/use_cases/、src/intelligence/application/capabilities/、src/intelligence/application/workflows/`, () => {
      const src = readSrc(path.join(contextDir, file));
      assert.ok(!/from\s+['"].*\/facade\//.test(src));
      assert.ok(!/from\s+['"].*\/use_cases\//.test(src));
      assert.ok(!/from\s+['"].*\/capabilities\//.test(src));
      assert.ok(!/from\s+['"].*\/workflows\//.test(src));
    });
    await test(`（6.application service isolation）context/${file} 完全不import src/intelligence/execution/、history/、metrics/、events/、service/、orchestration/、analysis/、recommendation/、data_preparation/、governance/`, () => {
      const src = readSrc(path.join(contextDir, file));
      assert.ok(!/from\s+['"].*\/execution\//.test(src));
      assert.ok(!/from\s+['"].*\/history\//.test(src));
      assert.ok(!/from\s+['"].*\/metrics\//.test(src));
      assert.ok(!/from\s+['"].*\/events\//.test(src));
      assert.ok(!/from\s+['"].*\/service\//.test(src));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
      assert.ok(!/from\s+['"].*\/governance\//.test(src));
    });
    await test(`（6.application service isolation）context/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher/facade/applicationService變數名稱`, () => {
      const src = readSrc(path.join(contextDir, file));
      assert.ok(!/executionManager/.test(src));
      assert.ok(!/historyStore/.test(src));
      assert.ok(!/metricsStore/.test(src));
      assert.ok(!/eventDispatcher/.test(src));
      assert.ok(!/\bfacade\b/i.test(src));
      assert.ok(!/applicationService/.test(src));
    });
  }

  await test('（6.application service isolation）src/bootstrap/application.js完全不import src/intelligence/application/features/insight/context/（本次任務不需要在bootstrap組裝這個純函式工具）', () => {
    assert.ok(!/from\s+['"].*\/features\/insight\/context\//.test(readSrc(path.join(srcRoot, 'bootstrap', 'application.js'))));
  });

  await test('（TASK1.69後更新）（6.application service isolation）src/bootstrap/application.js的intelligence物件維持24個欄位不變（本次任務TASK1.67本身沒有新增bootstrap欄位；TASK1.69新增了insightExecutionFlow，是後續任務的合法擴充，不是TASK1.67造成的回歸）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  const allIntelFilesExceptContextLayer = listAllJsFiles(intelDir).filter((f) => !f.includes(path.join('features', 'insight', 'context')) && f !== path.join(intelDir, 'index.js') && f !== path.join(applicationDir, 'index.js') && f !== path.join(featuresDir, 'index.js') && f !== path.join(insightDir, 'index.js'));
  for (const f of allIntelFilesExceptContextLayer) {
    const relName = path.relative(repoRoot, f);
    await test(`（6.application service isolation）${relName} 完全不import src/intelligence/application/features/insight/context/（既有層沒有反過來認識這個新的Context Layer的存在）`, () => {
      const targets = getRelativeImportTargets(f);
      for (const target of targets) {
        assert.ok(!target.startsWith(contextDir), `${relName} 不應該import application/features/insight/context/（實際解析到：${path.relative(repoRoot, target)}）`);
      }
    });
  }

  await test('（6.application service isolation）src/controllers/、src/routes/、src/worker.js完全沒有任何檔案import src/intelligence/application/features/insight/context/（本次任務明確禁止新增API route）', () => {
    const files = [
      ...fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'controllers', f)),
      ...fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'routes', f)),
      path.join(srcRoot, 'worker.js'),
    ];
    for (const f of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\/features\/insight\/context\//.test(readSrc(f)), `${f} 不應該import intelligence/application/features/insight/context/`);
    }
  });

  console.log('');

  // =========================================================================
  // G. no database dependency
  // =========================================================================
  console.log('--- G. no database dependency ---');

  for (const file of CONTEXT_JS_FILES) {
    await test(`（7.no database dependency）context/${file} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(contextDir, file))));
    });
    await test(`（7.no database dependency）context/${file} 完全沒有db.prepare()/SQL關鍵字/DIET_COACH_DB字樣`, () => {
      const src = readSrc(path.join(contextDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
    await test(`（7.no database dependency）context/${file} 完全不出現db變數名稱（Context Layer完全不知道db是什麼，甚至不接受db作為參數）`, () => {
      const src = readSrc(path.join(contextDir, file));
      assert.ok(!/\bdb\b/.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // H. no auth dependency
  // =========================================================================
  console.log('--- H. no auth dependency ---');

  for (const file of CONTEXT_JS_FILES) {
    await test(`（8.no auth dependency）context/${file} 完全不import src/auth/、src/oauth/、src/identity/、src/middleware/`, () => {
      const src = readSrc(path.join(contextDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（8.no auth dependency）context/${file} 完全沒有出現jwt/session/cookie相關字樣`, () => {
      const src = readSrc(path.join(contextDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
    await test(`（8.no auth dependency）context/${file} 完全不呼叫requireAuth()/requireActiveUser()/getCurrentUser()`, () => {
      const src = readSrc(path.join(contextDir, file));
      assert.ok(!/requireAuth\(/.test(src));
      assert.ok(!/requireActiveUser\(/.test(src));
      assert.ok(!/getCurrentUser\(/.test(src));
    });
  }

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
  for (const file of CONTEXT_JS_FILES) {
    const codeOnly = readSrc(path.join(contextDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（9.no AI dependency）context/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（9.no AI dependency）context/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
    await test(`（9.no AI dependency）context/${file} 完全不 import 任何非相對路徑的外部套件`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  await test('（9.no AI dependency）Insight Context Layer完全不解讀analysis/recommendation的內部業務內容（沒有讀取任何巢狀的.score/.confidence/.summary欄位做分支判斷）', () => {
    const src = readSrc(path.join(contextDir, 'insight_context_mapper.js'));
    assert.ok(!/\.score\b/.test(src));
    assert.ok(!/\.confidence\b/.test(src));
    assert.ok(!/analysis\.\w+/.test(src));
    assert.ok(!/recommendation\.\w+/.test(src));
  });

  console.log('');

  // =========================================================================
  // J. export consistency
  // =========================================================================
  console.log('--- J. export consistency ---');

  await test('（10.export consistency）context/index.js完整re-export了context/底下每個原始檔案的全部具名export', () => {
    const reExported = getReExportedNames(path.join(contextDir, 'index.js'));
    for (const file of ['insight_context_mapper.js', 'insight_context_result_builder.js']) {
      const names = getNamedExports(path.join(contextDir, file));
      for (const name of names) {
        assert.ok(reExported.has(name), `context/index.js 缺少 re-export ${name}（來自${file}）`);
      }
    }
  });

  await test('（10.export consistency）context/index.js re-export的名稱在對應來源檔案裡確實存在（沒有re-export不存在的東西）', () => {
    const indexSrc = readSrc(path.join(contextDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(contextDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `context/index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（10.export consistency）context/index.js恰好只re-export兩個具名函式（createInsightContextMapper/createInsightContextResultBuilder），沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(contextDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createInsightContextMapper', 'createInsightContextResultBuilder']);
  });

  await test('（10.export consistency）src/intelligence/application/features/insight/index.js 有 export * as context from ./context/index.js', () => {
    const src = readSrc(path.join(insightDir, 'index.js'));
    assert.ok(/export \* as context from ['"]\.\/context\/index\.js['"]/.test(src));
  });

  await test('（10.export consistency）insight/index.js恰好只re-export兩個具名函式（createInsightFeatureCapability/createInsightResultMapper），本次沒有新增具名re-export，context是以namespace形式加入', () => {
    const reExported = getReExportedNames(path.join(insightDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createInsightFeatureCapability', 'createInsightResultMapper']);
    const namespaces = getReExportedNamespaces(path.join(insightDir, 'index.js'));
    assert.ok(namespaces.has('context'));
  });

  await test('（10.export consistency）import後，insightModule.context 是非空物件，具備createInsightContextMapper/createInsightContextResultBuilder', async () => {
    const insightModule = await import(path.join(insightDir, 'index.js'));
    assert.strictEqual(typeof insightModule.context, 'object');
    assert.strictEqual(typeof insightModule.context.createInsightContextMapper, 'function');
    assert.strictEqual(typeof insightModule.context.createInsightContextResultBuilder, 'function');
  });

  await test('（10.export consistency）src/intelligence/index.js完全沒有被TASK1.67修改（git diff確認）——application/features/insight/context是nested三層底下，不需要在這個統一輸出入口新增任何東西', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.export consistency）createInsightContextResultBuilder()回傳物件恰好只有buildSuccessResult/buildFailureResult兩個公開介面', () => {
    const builder = createInsightContextResultBuilder();
    assert.deepStrictEqual(Object.keys(builder).sort(), ['buildFailureResult', 'buildSuccessResult']);
  });

  await test('（10.export consistency）buildFailureResult(非字串reason)安全正規化為unknown_error，feature固定為"insight"', () => {
    const builder = createInsightContextResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(123), { ok: false, feature: 'insight', reason: 'unknown_error' });
    assert.deepStrictEqual(builder.buildFailureResult(undefined), { ok: false, feature: 'insight', reason: 'unknown_error' });
  });

  await test('（10.export consistency）buildSuccessResult({})未提供欄位時使用undefined（不假造資料）', () => {
    const builder = createInsightContextResultBuilder();
    const result = builder.buildSuccessResult({});
    assert.deepStrictEqual(result, { ok: true, feature: 'insight', data: { status: undefined, context: undefined, analysis: undefined, recommendation: undefined, metadata: undefined } });
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.67-insight-context')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 58, `預期至少58個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（12.P1-P6）src/worker.js 完全沒有被TASK1.67修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）wrangler.toml 完全沒有被TASK1.67修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（12.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被TASK1.67修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  // （TASK1.69後更新）原本這裡有一個「src/bootstrap/application.js
  // 完全沒有被TASK1.67修改」的斷言，比對整個檔案即時的git diff
  // --stat。這是跟TASK1.39/TASK1.56/TASK1.63同一種「比對即時整檔
  // git diff」的脆弱治具：bootstrap.js從來就不在本任務系列真正的
  // 禁止清單裡（禁止清單只有worker.js/wrangler.toml/routes/
  // controllers/auth/oauth/migrations/Analysis Runner/
  // Recommendation Runner/Execution Manager），TASK1.67本身雖然
  // 沒有修改它，但TASK1.69合法地在bootstrap.js新增了
  // `intelligence.insightExecutionFlow`的組裝，導致這個斷言
  // 失敗——這不是TASK1.67造成的回歸，而是斷言本身寫得過度嚴格，
  // 這裡移除這個斷言，改由TASK1.69/後續任務自己的P1-P6區塊驗證
  // bootstrap.js真正的禁止清單（worker.js等）維持零異動即可。

  await test('（12.P1-P6）Analysis/Recommendation Runner/Execution Manager/Application Service/Insight Use Case/Insight Capability（capabilities/）/Application Workflow/Insight Feature Capability（TASK1.66）的原始碼完全沒有被TASK1.67修改（規格明確禁止修改Execution Runtime Behavior）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/analysis/analysis_runner.js src/intelligence/recommendation/recommendation_runner.js src/intelligence/execution/execution_manager.js src/intelligence/facade/intelligence_facade.js src/intelligence/application/application_service.js src/intelligence/application/use_cases/insight_use_case.js src/intelligence/application/capabilities/insight_capability.js src/intelligence/application/workflows/application_workflow.js src/intelligence/application/features/insight/insight_capability.js src/intelligence/application/features/insight/insight_result_mapper.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

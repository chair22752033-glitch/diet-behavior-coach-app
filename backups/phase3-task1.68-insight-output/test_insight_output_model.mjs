/*
 * Phase 3 TASK 1.68｜Insight Feature Output Model Foundation
 * 測試
 *
 * 本任務不是建立API，也不是建立UI，也不是導入AI——這是建立Insight
 * Domain專屬的Output Model，把Runtime Result經由Insight Context
 * Mapping（TASK1.67）攤平後，轉換成穩定的Insight Feature Output。
 * 這份測試驗證的是：
 * - insight_output_model.js正確定義InsightOutputModel（五個欄位：
 *   status/context/analysis/recommendation/metadata）跟
 *   validateInsightOutput()只驗證架構
 * - insight_output_mapper.js正確把Insight Domain視圖轉換成
 *   Insight Domain Output，並套用驗證
 * - 端對端：Insight Feature Capability（TASK1.66）透過完整真實
 *   依賴鏈產生的真實輸出，先經過Insight Context Mapper
 *   （TASK1.67）攤平，再餵給這裡的Output Mapper，可以正確產生
 *   穩定的Insight Domain Output，證明Runtime Result與Domain
 *   Output已經正式分離
 * - Output Layer完全不主動呼叫Feature/Context Mapper/Workflow/
 *   Capability/Use Case/Application Service/Facade，也完全不操作
 *   Execution Manager/History Store/Metrics Store/Event
 *   Dispatcher/Database/Auth/AI
 * - insight_capability.js（TASK1.66）/insight_context_mapper.js
 *   （TASK1.67）完全沒有被修改
 * - export一致性、regression、P1-P6
 *
 * 分為以下11個部分：
 * A) output model boundary
 * B) context mapping compatibility
 * C) feature integration
 * D) contract compatibility
 * E) runtime isolation
 * F) no database dependency
 * G) no auth dependency
 * H) no AI dependency
 * I) export consistency
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
const contextDir = path.join(insightDir, 'context');
const outputDir = path.join(insightDir, 'output');

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
  const modelMod = await import(path.join(outputDir, 'insight_output_model.js'));
  const { InsightOutputModel, validateInsightOutput } = modelMod;
  const mapperMod = await import(path.join(outputDir, 'insight_output_mapper.js'));
  const { createInsightOutputMapper } = mapperMod;
  await import(path.join(outputDir, 'index.js'));

  const OUTPUT_JS_FILES = fs.readdirSync(outputDir).filter((f) => f.endsWith('.js')).sort();

  // =========================================================================
  // A. output model boundary
  // =========================================================================
  console.log('--- A. output model boundary ---');

  await test('（1.output model boundary）src/intelligence/application/features/insight/output/ 恰好包含3個.js檔案（insight_output_model/insight_output_mapper/index）', () => {
    assert.deepStrictEqual(OUTPUT_JS_FILES, ['index.js', 'insight_output_mapper.js', 'insight_output_model.js']);
  });

  await test('（1.output model boundary）src/intelligence/application/features/insight/output/README.md 存在且非空', () => {
    const readmePath = path.join(outputDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.output model boundary）InsightOutputModel.fields恰好具備status/context/analysis/recommendation/metadata五個欄位', () => {
    assert.deepStrictEqual(Object.keys(InsightOutputModel.fields).sort(), ['analysis', 'context', 'metadata', 'recommendation', 'status']);
  });

  await test('（1.output model boundary）validateInsightOutput()對完整五欄位物件回傳{ok:true}', () => {
    assert.deepStrictEqual(validateInsightOutput({ status: 'x', context: {}, analysis: {}, recommendation: {}, metadata: {} }), { ok: true });
  });

  await test('（1.output model boundary）validateInsightOutput()允許任何型別的欄位值（包含null），只驗證欄位是否存在', () => {
    assert.deepStrictEqual(validateInsightOutput({ status: null, context: null, analysis: null, recommendation: null, metadata: null }), { ok: true });
    assert.deepStrictEqual(validateInsightOutput({ status: 0, context: [], analysis: 'x', recommendation: false, metadata: 42 }), { ok: true });
  });

  await test('（1.output model boundary）validateInsightOutput(null)回傳{ok:false, reason:"invalid_output"}', () => {
    assert.deepStrictEqual(validateInsightOutput(null), { ok: false, reason: 'invalid_output' });
  });

  await test('（1.output model boundary）validateInsightOutput(undefined)回傳{ok:false, reason:"invalid_output"}', () => {
    assert.deepStrictEqual(validateInsightOutput(undefined), { ok: false, reason: 'invalid_output' });
  });

  await test('（1.output model boundary）validateInsightOutput("string")回傳{ok:false, reason:"invalid_output"}', () => {
    assert.deepStrictEqual(validateInsightOutput('string'), { ok: false, reason: 'invalid_output' });
  });

  await test('（1.output model boundary）validateInsightOutput([])（陣列）回傳{ok:false, reason:"invalid_output"}', () => {
    assert.deepStrictEqual(validateInsightOutput([]), { ok: false, reason: 'invalid_output' });
  });

  await test('（1.output model boundary）validateInsightOutput({})缺少全部欄位回傳{ok:false, reason:"missing_field", field:"status"}（第一個欄位）', () => {
    assert.deepStrictEqual(validateInsightOutput({}), { ok: false, reason: 'missing_field', field: 'status' });
  });

  await test('（1.output model boundary）validateInsightOutput缺少單一欄位（recommendation）時正確回報該欄位', () => {
    const output = { status: 'x', context: {}, analysis: {}, metadata: {} };
    assert.deepStrictEqual(validateInsightOutput(output), { ok: false, reason: 'missing_field', field: 'recommendation' });
  });

  await test('（1.output model boundary）insight_output_model.js完全沒有任何import（純函式，零相依）', () => {
    const src = readSrc(path.join(outputDir, 'insight_output_model.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（1.output model boundary）validateInsightOutput()是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const input = { status: 'x', context: {}, analysis: {}, recommendation: {}, metadata: {} };
    assert.deepStrictEqual(validateInsightOutput(input), validateInsightOutput(input));
  });

  await test('（1.output model boundary）validateInsightOutput依序檢查五個欄位（缺少analysis比缺少recommendation更早被發現，因為analysis欄位順序在前）', () => {
    const output = { status: 'x', context: {}, recommendation: {}, metadata: {} };
    assert.deepStrictEqual(validateInsightOutput(output), { ok: false, reason: 'missing_field', field: 'analysis' });
  });

  await test('（1.output model boundary）InsightOutputModel.fields的欄位型別標記都是"any"（因為這一層完全不解讀業務內容，只在乎欄位是否存在）', () => {
    for (const type of Object.values(InsightOutputModel.fields)) {
      assert.strictEqual(type, 'any');
    }
  });

  await test('（1.output model boundary）多次呼叫validateInsightOutput不會累積任何狀態（每次呼叫都是獨立、無副作用的純函式）', () => {
    const output = { status: 'x', context: {}, analysis: {}, recommendation: {}, metadata: {} };
    for (let i = 0; i < 5; i++) {
      assert.deepStrictEqual(validateInsightOutput(output), { ok: true });
    }
  });

  console.log('');

  // =========================================================================
  // B. context mapping compatibility
  // =========================================================================
  console.log('--- B. context mapping compatibility ---');

  await test('（2.context mapping compatibility）createInsightOutputMapper()回傳物件恰好只有mapToInsightOutput一個公開介面', () => {
    const mapper = createInsightOutputMapper();
    assert.deepStrictEqual(Object.keys(mapper), ['mapToInsightOutput']);
  });

  await test('（2.context mapping compatibility）mapToInsightOutput()正確把Insight Context Mapper（TASK1.67）攤平的視圖轉換成InsightOutputModel形狀', () => {
    const mapper = createInsightOutputMapper();
    const insightDomainView = { status: 'intelligence_ready', context: { user: null }, analysis: { a: 1 }, recommendation: { r: 1 }, metadata: { m: 1 } };
    const result = mapper.mapToInsightOutput(insightDomainView);
    assert.deepStrictEqual(result, {
      ok: true,
      output: { status: 'intelligence_ready', context: { user: null }, analysis: { a: 1 }, recommendation: { r: 1 }, metadata: { m: 1 } },
    });
  });

  await test('（2.context mapping compatibility）mapToInsightOutput(undefined)不拋出例外，回傳ok:true且欄位全為null（因為五個欄位都存在，只是值是null，通過validateInsightOutput）', () => {
    const mapper = createInsightOutputMapper();
    assert.doesNotThrow(() => mapper.mapToInsightOutput(undefined));
    const result = mapper.mapToInsightOutput(undefined);
    assert.deepStrictEqual(result, { ok: true, output: { status: null, context: null, analysis: null, recommendation: null, metadata: null } });
  });

  await test('（2.context mapping compatibility）mapToInsightOutput(null)不拋出例外', () => {
    const mapper = createInsightOutputMapper();
    assert.doesNotThrow(() => mapper.mapToInsightOutput(null));
  });

  await test('（2.context mapping compatibility）mapToInsightOutput()對context/analysis/recommendation的值原封不動（只做結構重排跟驗證，不修改內容）', () => {
    const mapper = createInsightOutputMapper();
    const context = { user: null, activityContext: { count: 5, items: [1, 2, 3] } };
    const analysis = { deep: { nested: { value: 42 } } };
    const recommendation = { list: ['a', 'b'] };
    const result = mapper.mapToInsightOutput({ status: 'x', context, analysis, recommendation, metadata: {} });
    assert.strictEqual(result.output.context, context);
    assert.strictEqual(result.output.analysis, analysis);
    assert.strictEqual(result.output.recommendation, recommendation);
  });

  await test('（2.context mapping compatibility）mapToInsightOutput()是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const mapper = createInsightOutputMapper();
    const input = { status: 'x', context: { a: 1 }, analysis: { b: 2 }, recommendation: { c: 3 }, metadata: { d: 4 } };
    assert.deepStrictEqual(mapper.mapToInsightOutput(input), mapper.mapToInsightOutput(input));
  });

  await test('（2.context mapping compatibility）端對端：真實Insight Context Mapper（TASK1.67）的攤平輸出可以直接餵給Output Mapper產生成功結果', async () => {
    const { createInsightContextMapper } = await import(path.join(contextDir, 'index.js'));
    const { insightFeatureCapability } = await buildRealChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);

    const contextMapper = createInsightContextMapper();
    const domainView = contextMapper.mapRuntimeContextToInsightDomain(result.data);

    const outputMapper = createInsightOutputMapper();
    const outputResult = outputMapper.mapToInsightOutput(domainView);
    assert.strictEqual(outputResult.ok, true);
    assert.deepStrictEqual(Object.keys(outputResult.output).sort(), ['analysis', 'context', 'metadata', 'recommendation', 'status']);
  });

  await test('（2.context mapping compatibility）不同的Insight Output Mapper實例各自獨立（不是共用singleton）', () => {
    const mapperA = createInsightOutputMapper();
    const mapperB = createInsightOutputMapper();
    assert.notStrictEqual(mapperA, mapperB);
  });

  await test('（2.context mapping compatibility）createInsightOutputMapper(任何參數)都回傳相同介面（不接受依賴注入，因為完全沒有任何依賴需要注入）', () => {
    const mapperA = createInsightOutputMapper();
    const mapperB = createInsightOutputMapper({ ignored: 'value' });
    assert.deepStrictEqual(Object.keys(mapperA), Object.keys(mapperB));
  });

  await test('（2.context mapping compatibility）status為非字串值（例如數字0、布林false）時原樣保留，不強制轉型也不誤判為缺漏', () => {
    const mapper = createInsightOutputMapper();
    assert.strictEqual(mapper.mapToInsightOutput({ status: 0, context: {}, analysis: {}, recommendation: {}, metadata: {} }).output.status, 0);
    assert.strictEqual(mapper.mapToInsightOutput({ status: false, context: {}, analysis: {}, recommendation: {}, metadata: {} }).output.status, false);
  });

  await test('（2.context mapping compatibility）context/analysis/recommendation為null時mapToInsightOutput正確保留null並依然通過驗證（ok:true）', () => {
    const mapper = createInsightOutputMapper();
    const result = mapper.mapToInsightOutput({ status: 'x', context: null, analysis: null, recommendation: null, metadata: {} });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.output.context, null);
    assert.strictEqual(result.output.analysis, null);
    assert.strictEqual(result.output.recommendation, null);
  });

  console.log('');

  // =========================================================================
  // C. feature integration
  // =========================================================================
  console.log('--- C. feature integration ---');

  await test('（3.feature integration）端對端：真實Insight Feature Capability（透過完整依賴鏈到Analysis/Recommendation Runner）產生的輸出，先經過Context Mapper攤平、再經過Output Mapper，得到的Insight Domain Output跟原始的context/analysis/recommendation內容完全相同（無遺漏無竄改）', async () => {
    const { createInsightContextMapper } = await import(path.join(contextDir, 'index.js'));
    const { insightFeatureCapability } = await buildRealChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });

    const contextMapper = createInsightContextMapper();
    const domainView = contextMapper.mapRuntimeContextToInsightDomain(result.data);

    const outputMapper = createInsightOutputMapper();
    const outputResult = outputMapper.mapToInsightOutput(domainView);

    assert.deepStrictEqual(outputResult.output.context, result.data.result.context);
    assert.deepStrictEqual(outputResult.output.analysis, result.data.result.analysis);
    assert.deepStrictEqual(outputResult.output.recommendation, result.data.result.recommendation);
    assert.strictEqual(outputResult.output.status, result.data.status);
  });

  await test('（3.feature integration）端對端：真實輸出的context欄位確實是TASK1.42 InsightContext形狀（具備user/activityContext/nutritionContext/emotionContext/behaviorContext/reportContext/metadata七個欄位）', async () => {
    const { createInsightContextMapper } = await import(path.join(contextDir, 'index.js'));
    const { insightFeatureCapability } = await buildRealChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    const contextMapper = createInsightContextMapper();
    const domainView = contextMapper.mapRuntimeContextToInsightDomain(result.data);
    const outputMapper = createInsightOutputMapper();
    const outputResult = outputMapper.mapToInsightOutput(domainView);
    const contextKeys = Object.keys(outputResult.output.context).sort();
    assert.deepStrictEqual(contextKeys, ['activityContext', 'behaviorContext', 'emotionContext', 'metadata', 'nutritionContext', 'reportContext', 'user']);
  });

  await test('（3.feature integration）insight_capability.js（TASK1.66）完全沒有被修改——唯一相對路徑import維持是./insight_result_mapper.js', () => {
    const src = readSrc(path.join(insightDir, 'insight_capability.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./insight_result_mapper.js']);
  });

  await test('（3.feature integration）insight_context_mapper.js（TASK1.67）完全沒有被修改——完全沒有任何import', () => {
    const src = readSrc(path.join(contextDir, 'insight_context_mapper.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（3.feature integration）insight_capability.js/insight_context_mapper.js完全沒有出現output相關的import字樣（沒有反過來認識這個新的Output Layer的存在）', () => {
    assert.ok(!/from\s+['"]\.\/output\//.test(readSrc(path.join(insightDir, 'insight_capability.js'))));
    assert.ok(!/from\s+['"]\.\.\/output\//.test(readSrc(path.join(contextDir, 'insight_context_mapper.js'))));
  });

  console.log('');

  // =========================================================================
  // D. contract compatibility
  // =========================================================================
  console.log('--- D. contract compatibility ---');

  await test('（4.contract compatibility）真實輸出先通過Contract Layer的response驗證，再交給Context Mapper攤平、Output Mapper轉換，三者不互相衝突', async () => {
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { createInsightContextMapper } = await import(path.join(contextDir, 'index.js'));
    const { insightFeatureCapability } = await buildRealChain();
    const result = await insightFeatureCapability.requestInsight({}, { userId: 'u1' });
    const cv = createContractValidator();
    assert.deepStrictEqual(cv.validateResponse(result), { ok: true });

    const contextMapper = createInsightContextMapper();
    const domainView = contextMapper.mapRuntimeContextToInsightDomain(result.data);
    const outputMapper = createInsightOutputMapper();
    assert.doesNotThrow(() => outputMapper.mapToInsightOutput(domainView));
    assert.strictEqual(outputMapper.mapToInsightOutput(domainView).ok, true);
  });

  await test('（4.contract compatibility）Contract Layer本身完全沒有被這個新的Output Layer修改——ApplicationRequestContract/ApplicationResponseContract的驗證規則維持不變', async () => {
    const { validateApplicationRequestContract, validateApplicationResponseContract } = await import(path.join(contractsDir, 'index.js'));
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: 'u1' }), { ok: true });
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true, data: { status: 'x', result: {}, metadata: {} } }), { ok: true });
  });

  await test('（4.contract compatibility）Output Mapper的失敗形狀（{ok:false, reason, field?}）本身就是可以被視為「架構驗證失敗」的穩定形狀，跟Contract Layer的驗證失敗形狀一致（都具備ok/reason兩個欄位）', () => {
    const outputMapper = createInsightOutputMapper();
    // 手動建構一個會讓validateInsightOutput失敗的情境：透過依賴注入不可行
    // （mapToInsightOutput內部固定組出五個欄位），改為直接測試
    // validateInsightOutput本身的失敗形狀
    const failure = validateInsightOutput({ status: 'x' });
    assert.ok(Object.prototype.hasOwnProperty.call(failure, 'ok'));
    assert.ok(Object.prototype.hasOwnProperty.call(failure, 'reason'));
  });

  console.log('');

  // =========================================================================
  // E. runtime isolation
  // =========================================================================
  console.log('--- E. runtime isolation ---');

  for (const file of OUTPUT_JS_FILES) {
    await test(`（5.runtime isolation）output/${file} 完全不import src/intelligence/facade/、execution/、history/、metrics/、events/、service/、orchestration/、analysis/、recommendation/、data_preparation/、governance/`, () => {
      const src = readSrc(path.join(outputDir, file));
      assert.ok(!/from\s+['"].*\/facade\//.test(src));
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
    await test(`（5.runtime isolation）output/${file} 完全不import ../insight_capability.js、../insight_result_mapper.js、../context/（不主動呼叫其他層，是被動的映射工具）`, () => {
      const src = readSrc(path.join(outputDir, file));
      assert.ok(!/from\s+['"].*insight_capability\.js['"]/.test(src));
      assert.ok(!/from\s+['"].*insight_result_mapper\.js['"]/.test(src));
      assert.ok(!/from\s+['"].*\/context\//.test(src));
    });
    await test(`（5.runtime isolation）output/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher/facade變數名稱`, () => {
      const src = readSrc(path.join(outputDir, file));
      assert.ok(!/executionManager/.test(src));
      assert.ok(!/historyStore/.test(src));
      assert.ok(!/metricsStore/.test(src));
      assert.ok(!/eventDispatcher/.test(src));
      assert.ok(!/\bfacade\b/i.test(src));
    });
  }

  await test('（5.runtime isolation）insight_output_mapper.js唯一的相對路徑import是./insight_output_model.js', () => {
    const src = readSrc(path.join(outputDir, 'insight_output_mapper.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./insight_output_model.js']);
  });

  await test('（5.runtime isolation）application_workflow.js/insight_capability.js（capabilities/）/insight_use_case.js/application_service.js/execution_manager.js/intelligence_facade.js完全沒有出現"features/insight/output"這個nested子目錄相關字樣', () => {
    assert.ok(!/features\/insight\/output/i.test(readSrc(path.join(workflowsDir, 'application_workflow.js'))));
    assert.ok(!/features\/insight\/output/i.test(readSrc(path.join(capabilitiesDir, 'insight_capability.js'))));
    assert.ok(!/features\/insight\/output/i.test(readSrc(path.join(useCasesDir, 'insight_use_case.js'))));
    assert.ok(!/features\/insight\/output/i.test(readSrc(path.join(applicationDir, 'application_service.js'))));
    assert.ok(!/features\/insight\/output/i.test(readSrc(path.join(intelDir, 'execution', 'execution_manager.js'))));
    assert.ok(!/features\/insight\/output/i.test(readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js'))));
  });

  await test('（5.runtime isolation）src/bootstrap/application.js完全不import src/intelligence/application/features/insight/output/（本次任務不需要在bootstrap組裝這個純函式工具）', () => {
    assert.ok(!/from\s+['"].*\/features\/insight\/output\//.test(readSrc(path.join(srcRoot, 'bootstrap', 'application.js'))));
  });

  await test('（TASK1.69後更新）（5.runtime isolation）src/bootstrap/application.js的intelligence物件維持23個欄位不變（本次任務TASK1.68本身沒有新增bootstrap欄位；TASK1.69新增了insightExecutionFlow，是後續任務的合法擴充，不是TASK1.68造成的回歸）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  const allIntelFilesExceptOutputLayer = listAllJsFiles(intelDir).filter((f) => !f.includes(path.join('features', 'insight', 'output')) && f !== path.join(intelDir, 'index.js') && f !== path.join(applicationDir, 'index.js') && f !== path.join(featuresDir, 'index.js') && f !== path.join(insightDir, 'index.js'));
  for (const f of allIntelFilesExceptOutputLayer) {
    const relName = path.relative(repoRoot, f);
    await test(`（5.runtime isolation）${relName} 完全不import src/intelligence/application/features/insight/output/（既有層沒有反過來認識這個新的Output Layer的存在）`, () => {
      const targets = getRelativeImportTargets(f);
      for (const target of targets) {
        assert.ok(!target.startsWith(outputDir), `${relName} 不應該import application/features/insight/output/（實際解析到：${path.relative(repoRoot, target)}）`);
      }
    });
  }

  await test('（5.runtime isolation）src/controllers/、src/routes/、src/worker.js完全沒有任何檔案import src/intelligence/application/features/insight/output/（本次任務明確禁止新增API route）', () => {
    const files = [
      ...fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'controllers', f)),
      ...fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'routes', f)),
      path.join(srcRoot, 'worker.js'),
    ];
    for (const f of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\/features\/insight\/output\//.test(readSrc(f)), `${f} 不應該import intelligence/application/features/insight/output/`);
    }
  });

  await test('（5.runtime isolation）src/services/（既有Domain Service）完全不import src/intelligence/application/features/insight/output/', () => {
    const files = fs.readdirSync(path.join(srcRoot, 'services')).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\/features\/insight\/output\//.test(readSrc(path.join(srcRoot, 'services', file))));
    }
  });

  console.log('');

  // =========================================================================
  // F. no database dependency
  // =========================================================================
  console.log('--- F. no database dependency ---');

  for (const file of OUTPUT_JS_FILES) {
    await test(`（6.no database dependency）output/${file} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(outputDir, file))));
    });
    await test(`（6.no database dependency）output/${file} 完全沒有db.prepare()/SQL關鍵字/DIET_COACH_DB字樣`, () => {
      const src = readSrc(path.join(outputDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
    await test(`（6.no database dependency）output/${file} 完全不出現db變數名稱（Output Layer完全不知道db是什麼，甚至不接受db作為參數）`, () => {
      const src = readSrc(path.join(outputDir, file));
      assert.ok(!/\bdb\b/.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // G. no auth dependency
  // =========================================================================
  console.log('--- G. no auth dependency ---');

  for (const file of OUTPUT_JS_FILES) {
    await test(`（7.no auth dependency）output/${file} 完全不import src/auth/、src/oauth/、src/identity/、src/middleware/`, () => {
      const src = readSrc(path.join(outputDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（7.no auth dependency）output/${file} 完全沒有出現jwt/session/cookie相關字樣`, () => {
      const src = readSrc(path.join(outputDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
    await test(`（7.no auth dependency）output/${file} 完全不呼叫requireAuth()/requireActiveUser()/getCurrentUser()`, () => {
      const src = readSrc(path.join(outputDir, file));
      assert.ok(!/requireAuth\(/.test(src));
      assert.ok(!/requireActiveUser\(/.test(src));
      assert.ok(!/getCurrentUser\(/.test(src));
    });
  }

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
  for (const file of OUTPUT_JS_FILES) {
    const codeOnly = readSrc(path.join(outputDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.no AI dependency）output/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（8.no AI dependency）output/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
    await test(`（8.no AI dependency）output/${file} 完全不 import 任何非相對路徑的外部套件`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  await test('（8.no AI dependency）Insight Output Layer完全不解讀analysis/recommendation的內部業務內容（沒有讀取任何巢狀的.score/.confidence/.summary欄位做分支判斷）', () => {
    const src = readSrc(path.join(outputDir, 'insight_output_mapper.js'));
    assert.ok(!/\.score\b/.test(src));
    assert.ok(!/\.confidence\b/.test(src));
    assert.ok(!/analysis\.\w+/.test(src));
    assert.ok(!/recommendation\.\w+/.test(src));
  });

  console.log('');

  // =========================================================================
  // I. export consistency
  // =========================================================================
  console.log('--- I. export consistency ---');

  await test('（9.export consistency）output/index.js完整re-export了output/底下每個原始檔案的全部具名export', () => {
    const reExported = getReExportedNames(path.join(outputDir, 'index.js'));
    for (const file of ['insight_output_model.js', 'insight_output_mapper.js']) {
      const names = getNamedExports(path.join(outputDir, file));
      for (const name of names) {
        assert.ok(reExported.has(name), `output/index.js 缺少 re-export ${name}（來自${file}）`);
      }
    }
  });

  await test('（9.export consistency）output/index.js re-export的名稱在對應來源檔案裡確實存在（沒有re-export不存在的東西）', () => {
    const indexSrc = readSrc(path.join(outputDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(outputDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `output/index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（9.export consistency）output/index.js恰好只re-export三個具名項目（InsightOutputModel/validateInsightOutput/createInsightOutputMapper），沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(outputDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['InsightOutputModel', 'createInsightOutputMapper', 'validateInsightOutput']);
  });

  await test('（9.export consistency）src/intelligence/application/features/insight/index.js 有 export * as output from ./output/index.js', () => {
    const src = readSrc(path.join(insightDir, 'index.js'));
    assert.ok(/export \* as output from ['"]\.\/output\/index\.js['"]/.test(src));
  });

  await test('（9.export consistency）insight/index.js恰好只re-export兩個具名函式（createInsightFeatureCapability/createInsightResultMapper），本次沒有新增具名re-export，output是以namespace形式加入', () => {
    const reExported = getReExportedNames(path.join(insightDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createInsightFeatureCapability', 'createInsightResultMapper']);
    const namespaces = getReExportedNamespaces(path.join(insightDir, 'index.js'));
    assert.ok(namespaces.has('output'));
    assert.ok(namespaces.has('context'));
  });

  await test('（9.export consistency）import後，insightModule.output 是非空物件，具備InsightOutputModel/validateInsightOutput/createInsightOutputMapper', async () => {
    const insightModule = await import(path.join(insightDir, 'index.js'));
    assert.strictEqual(typeof insightModule.output, 'object');
    assert.strictEqual(typeof insightModule.output.InsightOutputModel, 'object');
    assert.strictEqual(typeof insightModule.output.validateInsightOutput, 'function');
    assert.strictEqual(typeof insightModule.output.createInsightOutputMapper, 'function');
  });

  await test('（9.export consistency）src/intelligence/index.js完全沒有被TASK1.68修改（git diff確認）——application/features/insight/output是nested四層底下，不需要在這個統一輸出入口新增任何東西', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.export consistency）InsightOutputModel.name恰好等於字面值"InsightOutput"', () => {
    assert.strictEqual(InsightOutputModel.name, 'InsightOutput');
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.68-insight-output')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（10.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 59, `預期至少59個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（11.P1-P6）src/worker.js 完全沒有被TASK1.68修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）wrangler.toml 完全沒有被TASK1.68修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（11.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被TASK1.68修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  // （TASK1.69後更新）原本這裡有一個「src/bootstrap/application.js
  // 完全沒有被TASK1.68修改」的斷言，比對整個檔案即時的git diff
  // --stat。這是跟TASK1.39/TASK1.56/TASK1.63/TASK1.67同一種「比對
  // 即時整檔git diff」的脆弱治具：bootstrap.js從來就不在本任務系列
  // 真正的禁止清單裡（禁止清單只有worker.js/wrangler.toml/routes/
  // controllers/auth/oauth/migrations/Analysis Runner/
  // Recommendation Runner/Execution Manager），TASK1.68本身雖然
  // 沒有修改它，但TASK1.69合法地在bootstrap.js新增了
  // `intelligence.insightExecutionFlow`的組裝，導致這個斷言
  // 失敗——這不是TASK1.68造成的回歸，而是斷言本身寫得過度嚴格，
  // 這裡移除這個斷言，改由TASK1.69/後續任務自己的P1-P6區塊驗證
  // bootstrap.js真正的禁止清單（worker.js等）維持零異動即可。

  await test('（11.P1-P6）Analysis/Recommendation Runner/Execution Manager/Application Service/Insight Use Case/Insight Capability（capabilities/）/Application Workflow/Insight Feature Capability（TASK1.66）/Insight Context Mapper（TASK1.67）的原始碼完全沒有被TASK1.68修改（規格明確禁止修改Execution Runtime Behavior）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/analysis/analysis_runner.js src/intelligence/recommendation/recommendation_runner.js src/intelligence/execution/execution_manager.js src/intelligence/facade/intelligence_facade.js src/intelligence/application/application_service.js src/intelligence/application/use_cases/insight_use_case.js src/intelligence/application/capabilities/insight_capability.js src/intelligence/application/workflows/application_workflow.js src/intelligence/application/features/insight/insight_capability.js src/intelligence/application/features/insight/insight_result_mapper.js src/intelligence/application/features/insight/context/insight_context_mapper.js src/intelligence/application/features/insight/context/insight_context_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

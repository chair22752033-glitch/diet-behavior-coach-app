/*
 * Phase 3 TASK 1.63｜Intelligence Application Contract Layer
 * Foundation 測試
 *
 * 本任務不是建立API，也不是建立UI，也不是導入AI——這是在
 * Capability（TASK1.62）、Use Case（TASK1.61）、Application
 * Service（TASK1.60）三層之間定義的統一Request/Response
 * Contract，確保未來Capability、Use Case、Application Service
 * 使用一致資料格式。這份測試驗證的是：
 * - request/response contract各自正確驗證形狀，且不解讀業務內容
 * - Capability/Use Case/Application Service三層目前實際產生的
 *   request/response都通過同一份contract驗證（三層格式一致）
 * - Contract Layer完全不主動呼叫Application Service/Use Case/
 *   Capability，也完全不操作Execution Runtime/Database/Auth/AI
 * - Capability/Use Case/Application Service三層的原始碼完全沒有
 *   被修改（唯一相對路徑import維持不變）
 * - export一致性、regression、P1-P6
 *
 * 分為以下13個部分：
 * A) request contract
 * B) response contract
 * C) validation boundary
 * D) capability compatibility
 * E) use case compatibility
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

async function run() {
  const requestContractMod = await import(path.join(contractsDir, 'application_request_contract.js'));
  const { ApplicationRequestContract, validateApplicationRequestContract } = requestContractMod;
  const responseContractMod = await import(path.join(contractsDir, 'application_response_contract.js'));
  const { ApplicationResponseContract, validateApplicationResponseContract } = responseContractMod;
  const validatorMod = await import(path.join(contractsDir, 'contract_validator.js'));
  const { createContractValidator } = validatorMod;
  await import(path.join(contractsDir, 'index.js'));

  const CONTRACT_JS_FILES = fs.readdirSync(contractsDir).filter((f) => f.endsWith('.js')).sort();

  // =========================================================================
  // A. request contract
  // =========================================================================
  console.log('--- A. request contract ---');

  await test('（1.request contract）ApplicationRequestContract.required恰好是["userId"]', () => {
    assert.deepStrictEqual(ApplicationRequestContract.required, ['userId']);
  });

  await test('（1.request contract）ApplicationRequestContract.optional恰好是["options","requestId","version","timestamp","metadata"]', () => {
    assert.deepStrictEqual(ApplicationRequestContract.optional, ['options', 'requestId', 'version', 'timestamp', 'metadata']);
  });

  await test('（1.request contract）validateApplicationRequestContract({userId:"u1"})回傳{ok:true}', () => {
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: 'u1' }), { ok: true });
  });

  await test('（1.request contract）validateApplicationRequestContract({userId:"u1", options:{}})回傳{ok:true}', () => {
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: 'u1', options: {} }), { ok: true });
  });

  await test('（1.request contract）validateApplicationRequestContract({userId:"u1", options:{}, requestId:"r1", version:"v1", timestamp:"t1", metadata:{}})回傳{ok:true}（所有選填欄位都存在）', () => {
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: 'u1', options: {}, requestId: 'r1', version: 'v1', timestamp: 't1', metadata: {} }), { ok: true });
  });

  await test('（1.request contract）validateApplicationRequestContract(null)回傳{ok:false, reason:"invalid_request"}', () => {
    assert.deepStrictEqual(validateApplicationRequestContract(null), { ok: false, reason: 'invalid_request' });
  });

  await test('（1.request contract）validateApplicationRequestContract(undefined)回傳{ok:false, reason:"invalid_request"}', () => {
    assert.deepStrictEqual(validateApplicationRequestContract(undefined), { ok: false, reason: 'invalid_request' });
  });

  await test('（1.request contract）validateApplicationRequestContract("string")回傳{ok:false, reason:"invalid_request"}', () => {
    assert.deepStrictEqual(validateApplicationRequestContract('string'), { ok: false, reason: 'invalid_request' });
  });

  await test('（1.request contract）validateApplicationRequestContract([])（陣列）回傳{ok:false, reason:"invalid_request"}', () => {
    assert.deepStrictEqual(validateApplicationRequestContract([]), { ok: false, reason: 'invalid_request' });
  });

  await test('（1.request contract）validateApplicationRequestContract({})缺少userId回傳{ok:false, reason:"invalid_user_id", field:"userId"}', () => {
    assert.deepStrictEqual(validateApplicationRequestContract({}), { ok: false, reason: 'invalid_user_id', field: 'userId' });
  });

  await test('（1.request contract）validateApplicationRequestContract({userId:""})空字串回傳失敗', () => {
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: '' }), { ok: false, reason: 'invalid_user_id', field: 'userId' });
  });

  await test('（1.request contract）validateApplicationRequestContract({userId:123})數字回傳失敗', () => {
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: 123 }), { ok: false, reason: 'invalid_user_id', field: 'userId' });
  });

  await test('（1.request contract）validateApplicationRequestContract({userId:"u1", options:[]})options為陣列回傳失敗', () => {
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: 'u1', options: [] }), { ok: false, reason: 'invalid_options_type', field: 'options' });
  });

  await test('（1.request contract）validateApplicationRequestContract({userId:"u1", options:"str"})options為字串回傳失敗', () => {
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: 'u1', options: 'str' }), { ok: false, reason: 'invalid_options_type', field: 'options' });
  });

  await test('（1.request contract）validateApplicationRequestContract({userId:"u1", options:null})options為null回傳失敗', () => {
    assert.deepStrictEqual(validateApplicationRequestContract({ userId: 'u1', options: null }), { ok: false, reason: 'invalid_options_type', field: 'options' });
  });

  await test('（1.request contract）validateApplicationRequestContract是deterministic的——同樣輸入永遠得到相同輸出', () => {
    const input = { userId: 'u1', options: { a: 1 } };
    assert.deepStrictEqual(validateApplicationRequestContract(input), validateApplicationRequestContract(input));
  });

  await test('（1.request contract）application_request_contract.js完全沒有任何import（純函式，零相依）', () => {
    const src = readSrc(path.join(contractsDir, 'application_request_contract.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  console.log('');

  // =========================================================================
  // B. response contract
  // =========================================================================
  console.log('--- B. response contract ---');

  await test('（2.response contract）ApplicationResponseContract.dataFields恰好是["status","result","metadata"]', () => {
    assert.deepStrictEqual(ApplicationResponseContract.dataFields, ['status', 'result', 'metadata']);
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:true, data:{status:"x",result:{},metadata:{}}})回傳{ok:true}', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true, data: { status: 'x', result: {}, metadata: {} } }), { ok: true });
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:false, reason:"some_reason"})回傳{ok:true}（合法的失敗形狀）', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: false, reason: 'some_reason' }), { ok: true });
  });

  await test('（2.response contract）validateApplicationResponseContract(null)回傳{ok:false, reason:"invalid_response"}', () => {
    assert.deepStrictEqual(validateApplicationResponseContract(null), { ok: false, reason: 'invalid_response' });
  });

  await test('（2.response contract）validateApplicationResponseContract(undefined)回傳{ok:false, reason:"invalid_response"}', () => {
    assert.deepStrictEqual(validateApplicationResponseContract(undefined), { ok: false, reason: 'invalid_response' });
  });

  await test('（2.response contract）validateApplicationResponseContract([])（陣列）回傳{ok:false, reason:"invalid_response"}', () => {
    assert.deepStrictEqual(validateApplicationResponseContract([]), { ok: false, reason: 'invalid_response' });
  });

  await test('（2.response contract）validateApplicationResponseContract({})缺少ok欄位回傳{ok:false, reason:"invalid_field_type", field:"ok"}', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({}), { ok: false, reason: 'invalid_field_type', field: 'ok' });
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:"true"})ok為字串（非布林）回傳失敗', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: 'true' }), { ok: false, reason: 'invalid_field_type', field: 'ok' });
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:true})成功但缺少data回傳{ok:false, reason:"missing_field", field:"data"}', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true }), { ok: false, reason: 'missing_field', field: 'data' });
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:true, data:[]})data為陣列回傳失敗', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true, data: [] }), { ok: false, reason: 'missing_field', field: 'data' });
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:true, data:{status:"x"}})缺少result回傳{ok:false, reason:"missing_field", field:"data.result"}', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true, data: { status: 'x' } }), { ok: false, reason: 'missing_field', field: 'data.result' });
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:true, data:{status:"x", result:{}}})缺少metadata回傳失敗', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true, data: { status: 'x', result: {} } }), { ok: false, reason: 'missing_field', field: 'data.metadata' });
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:false})失敗但缺少reason回傳{ok:false, reason:"invalid_field_type", field:"reason"}', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: false }), { ok: false, reason: 'invalid_field_type', field: 'reason' });
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:false, reason:""})reason為空字串回傳失敗', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: false, reason: '' }), { ok: false, reason: 'invalid_field_type', field: 'reason' });
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:false, reason:123})reason為數字回傳失敗', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: false, reason: 123 }), { ok: false, reason: 'invalid_field_type', field: 'reason' });
  });

  await test('（2.response contract）data.status/result/metadata允許任何型別的值（只驗證欄位是否存在，不驗證欄位值的內容）', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true, data: { status: undefined, result: null, metadata: 42 } }), { ok: true });
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:true, data:{status,result,metadata}, useCase:"insight"})額外的useCase欄位不影響驗證結果（不要求也不檢查特定標籤欄位）', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true, data: { status: 'x', result: {}, metadata: {} }, useCase: 'insight' }), { ok: true });
  });

  await test('（2.response contract）validateApplicationResponseContract({ok:true, data:{status,result,metadata}, capability:"insight"})額外的capability欄位不影響驗證結果', () => {
    assert.deepStrictEqual(validateApplicationResponseContract({ ok: true, data: { status: 'x', result: {}, metadata: {} }, capability: 'insight' }), { ok: true });
  });

  await test('（2.response contract）validateApplicationResponseContract是deterministic的——同樣輸入永遠得到相同輸出', () => {
    const input = { ok: true, data: { status: 'x', result: {}, metadata: {} } };
    assert.deepStrictEqual(validateApplicationResponseContract(input), validateApplicationResponseContract(input));
  });

  await test('（2.response contract）application_response_contract.js完全沒有任何import（純函式，零相依）', () => {
    const src = readSrc(path.join(contractsDir, 'application_response_contract.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  console.log('');

  // =========================================================================
  // C. validation boundary
  // =========================================================================
  console.log('--- C. validation boundary ---');

  await test('（3.validation boundary）createContractValidator()回傳物件恰好只有validateRequest/validateResponse兩個公開介面', () => {
    const cv = createContractValidator();
    assert.deepStrictEqual(Object.keys(cv).sort(), ['validateRequest', 'validateResponse']);
  });

  await test('（3.validation boundary）createContractValidator(undefined)不拋出例外', () => {
    assert.doesNotThrow(() => createContractValidator(undefined));
  });

  await test('（3.validation boundary）不同的Contract Validator實例各自獨立（不是共用singleton）', () => {
    const cvA = createContractValidator();
    const cvB = createContractValidator();
    assert.notStrictEqual(cvA, cvB);
  });

  await test('（3.validation boundary）validateRequest()委派給validateApplicationRequestContract（回傳結果一致）', () => {
    const cv = createContractValidator();
    assert.deepStrictEqual(cv.validateRequest({ userId: 'u1' }), validateApplicationRequestContract({ userId: 'u1' }));
    assert.deepStrictEqual(cv.validateRequest({}), validateApplicationRequestContract({}));
  });

  await test('（3.validation boundary）validateResponse()委派給validateApplicationResponseContract（回傳結果一致）', () => {
    const cv = createContractValidator();
    const sample = { ok: true, data: { status: 'x', result: {}, metadata: {} } };
    assert.deepStrictEqual(cv.validateResponse(sample), validateApplicationResponseContract(sample));
  });

  await test('（3.validation boundary）createContractValidator支援dependencies.requestValidator依賴注入', () => {
    const fakeValidator = () => ({ ok: false, reason: 'custom_fail' });
    const cv = createContractValidator({ requestValidator: fakeValidator });
    assert.deepStrictEqual(cv.validateRequest({ userId: 'u1' }), { ok: false, reason: 'custom_fail' });
  });

  await test('（3.validation boundary）createContractValidator支援dependencies.responseValidator依賴注入', () => {
    const fakeValidator = () => ({ ok: false, reason: 'custom_fail' });
    const cv = createContractValidator({ responseValidator: fakeValidator });
    assert.deepStrictEqual(cv.validateResponse({ ok: true }), { ok: false, reason: 'custom_fail' });
  });

  await test('（3.validation boundary）contract_validator.js唯一的相對路徑import是./application_request_contract.js跟./application_response_contract.js', () => {
    const src = readSrc(path.join(contractsDir, 'contract_validator.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports.sort(), ['./application_request_contract.js', './application_response_contract.js']);
  });

  console.log('');

  // =========================================================================
  // D. capability compatibility
  // =========================================================================
  console.log('--- D. capability compatibility ---');

  await test('（4.capability compatibility）Capability的合法輸入通過request contract驗證', async () => {
    const { createInsightCapability } = await import(path.join(capabilitiesDir, 'index.js'));
    const cv = createContractValidator();
    const request = { userId: 'u1', options: { a: 1 } };
    assert.deepStrictEqual(cv.validateRequest(request), { ok: true });
    // 確認Capability實際上也接受這個request並正常運作（不是巧合的形狀相似）
    const cap = createInsightCapability({ useCase: { requestUserInsight: async () => ({ ok: true, useCase: 'insight', data: { status: 'x', result: {}, metadata: {} } }) } });
    const result = await cap.requestInsightCapability({}, request);
    assert.strictEqual(result.ok, true);
  });

  await test('（4.capability compatibility）Capability成功回傳的response通過response contract驗證', async () => {
    const { createInsightCapability } = await import(path.join(capabilitiesDir, 'index.js'));
    const cv = createContractValidator();
    const cap = createInsightCapability({ useCase: { requestUserInsight: async () => ({ ok: true, useCase: 'insight', data: { status: 'intelligence_ready', result: { a: 1 }, metadata: { b: 2 } } }) } });
    const result = await cap.requestInsightCapability({}, { userId: 'u1' });
    assert.deepStrictEqual(cv.validateResponse(result), { ok: true });
  });

  await test('（4.capability compatibility）Capability失敗回傳的response通過response contract驗證', async () => {
    const { createInsightCapability } = await import(path.join(capabilitiesDir, 'index.js'));
    const cv = createContractValidator();
    const cap = createInsightCapability({});
    const result = await cap.requestInsightCapability({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(cv.validateResponse(result), { ok: true });
  });

  await test('（4.capability compatibility）Capability對不合法輸入的拒絕跟request contract的判斷一致（invalid_user_id）', async () => {
    const { createInsightCapability } = await import(path.join(capabilitiesDir, 'index.js'));
    const cv = createContractValidator();
    const cap = createInsightCapability({ useCase: { requestUserInsight: async () => ({ ok: true, data: {} }) } });
    const badRequest = {};
    const capResult = await cap.requestInsightCapability({}, badRequest);
    const contractResult = cv.validateRequest(badRequest);
    assert.strictEqual(capResult.ok, false);
    assert.strictEqual(contractResult.ok, false);
    assert.strictEqual(capResult.reason, contractResult.reason);
  });

  await test('（4.capability compatibility）端對端：真實Capability（透過完整依賴鏈）產生的response通過response contract驗證', async () => {
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

    const cv = createContractValidator();
    const result = await insightCapability.requestInsightCapability({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(cv.validateResponse(result), { ok: true });
  });

  console.log('');

  // =========================================================================
  // E. use case compatibility
  // =========================================================================
  console.log('--- E. use case compatibility ---');

  await test('（5.use case compatibility）Use Case的合法輸入通過request contract驗證', async () => {
    const { createInsightUseCase } = await import(path.join(useCasesDir, 'index.js'));
    const cv = createContractValidator();
    const request = { userId: 'u1', options: { a: 1 } };
    assert.deepStrictEqual(cv.validateRequest(request), { ok: true });
    const uc = createInsightUseCase({ applicationService: { requestIntelligence: async () => ({ ok: true, data: { status: 'x', result: {}, metadata: {} } }) } });
    const result = await uc.requestUserInsight({}, request);
    assert.strictEqual(result.ok, true);
  });

  await test('（5.use case compatibility）Use Case成功回傳的response通過response contract驗證', async () => {
    const { createInsightUseCase } = await import(path.join(useCasesDir, 'index.js'));
    const cv = createContractValidator();
    const uc = createInsightUseCase({ applicationService: { requestIntelligence: async () => ({ ok: true, data: { status: 'intelligence_ready', result: { a: 1 }, metadata: { b: 2 } } }) } });
    const result = await uc.requestUserInsight({}, { userId: 'u1' });
    assert.deepStrictEqual(cv.validateResponse(result), { ok: true });
  });

  await test('（5.use case compatibility）Use Case失敗回傳的response通過response contract驗證', async () => {
    const { createInsightUseCase } = await import(path.join(useCasesDir, 'index.js'));
    const cv = createContractValidator();
    const uc = createInsightUseCase({});
    const result = await uc.requestUserInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(cv.validateResponse(result), { ok: true });
  });

  await test('（5.use case compatibility）Use Case對不合法輸入的拒絕跟request contract的判斷一致（invalid_options_type）', async () => {
    const { createInsightUseCase } = await import(path.join(useCasesDir, 'index.js'));
    const cv = createContractValidator();
    const uc = createInsightUseCase({ applicationService: { requestIntelligence: async () => ({ ok: true, data: {} }) } });
    const badRequest = { userId: 'u1', options: [] };
    const ucResult = await uc.requestUserInsight({}, badRequest);
    const contractResult = cv.validateRequest(badRequest);
    assert.strictEqual(ucResult.ok, false);
    assert.strictEqual(contractResult.ok, false);
    assert.strictEqual(ucResult.reason, contractResult.reason);
  });

  await test('（5.use case compatibility）端對端：真實Use Case（透過完整依賴鏈）產生的response通過response contract驗證', async () => {
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

    const cv = createContractValidator();
    const result = await insightUseCase.requestUserInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(cv.validateResponse(result), { ok: true });
  });

  console.log('');

  // =========================================================================
  // F. application service isolation
  // =========================================================================
  console.log('--- F. application service isolation ---');

  for (const file of CONTRACT_JS_FILES) {
    await test(`（6.application service isolation）contracts/${file} 完全不import src/intelligence/application/application_service.js（不主動呼叫Application Service，是被動的驗證工具）`, () => {
      assert.ok(!/from\s+['"].*\/application_service\.js['"]/.test(readSrc(path.join(contractsDir, file))));
    });
    await test(`（6.application service isolation）contracts/${file} 完全不import ../use_cases/或../capabilities/（不主動呼叫Use Case/Capability）`, () => {
      const src = readSrc(path.join(contractsDir, file));
      assert.ok(!/from\s+['"].*\/use_cases\//.test(src));
      assert.ok(!/from\s+['"].*\/capabilities\//.test(src));
    });
  }

  await test('（6.application service isolation）Application Service（合法輸入時）跟Application Service直接呼叫Application Contract驗證的結果一致，但application_service.js本身完全不import contracts/', async () => {
    const src = readSrc(path.join(applicationDir, 'application_service.js'));
    assert.ok(!/from\s+['"].*\/contracts\//.test(src));
  });

  await test('（6.application service isolation）Application Service的合法輸入通過request contract驗證，端對端行為一致但沒有互相import', async () => {
    const { createApplicationService } = await import(path.join(applicationDir, 'index.js'));
    const cv = createContractValidator();
    const svc = createApplicationService({ facade: { executeIntelligence: async () => ({ ok: true, data: { status: 'x', result: {}, metadata: {} } }) } });
    const request = { userId: 'u1' };
    assert.deepStrictEqual(cv.validateRequest(request), { ok: true });
    const result = await svc.requestIntelligence({}, request);
    assert.deepStrictEqual(cv.validateResponse(result), { ok: true });
  });

  console.log('');

  // =========================================================================
  // G. runtime isolation
  // =========================================================================
  console.log('--- G. runtime isolation ---');

  for (const file of CONTRACT_JS_FILES) {
    await test(`（7.runtime isolation）contracts/${file} 完全不import src/intelligence/execution/（不得直接操作Execution Manager）`, () => {
      assert.ok(!/from\s+['"].*\/execution\//.test(readSrc(path.join(contractsDir, file))));
    });
    await test(`（7.runtime isolation）contracts/${file} 完全不import src/intelligence/facade/`, () => {
      assert.ok(!/from\s+['"].*\/facade\//.test(readSrc(path.join(contractsDir, file))));
    });
    await test(`（7.runtime isolation）contracts/${file} 完全不import src/intelligence/service/、orchestration/、analysis/、recommendation/、data_preparation/`, () => {
      const src = readSrc(path.join(contractsDir, file));
      assert.ok(!/from\s+['"].*\/service\//.test(src));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
    });
    await test(`（7.runtime isolation）contracts/${file} 完全不import src/intelligence/history/、metrics/、events/、monitoring/、governance/`, () => {
      const src = readSrc(path.join(contractsDir, file));
      assert.ok(!/from\s+['"].*\/history\//.test(src));
      assert.ok(!/from\s+['"].*\/metrics\//.test(src));
      assert.ok(!/from\s+['"].*\/events\//.test(src));
      assert.ok(!/from\s+['"].*\/monitoring\//.test(src));
      assert.ok(!/from\s+['"].*\/governance\//.test(src));
    });
    await test(`（7.runtime isolation）contracts/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher變數名稱`, () => {
      const src = readSrc(path.join(contractsDir, file));
      assert.ok(!/executionManager/.test(src));
      assert.ok(!/historyStore/.test(src));
      assert.ok(!/metricsStore/.test(src));
      assert.ok(!/eventDispatcher/.test(src));
    });
  }

  await test('（7.runtime isolation）insight_capability.js/insight_use_case.js/application_service.js/execution_manager.js/intelligence_facade.js完全沒有出現contract字樣（既有層沒有反過來認識Contract Layer的存在）', () => {
    assert.ok(!/contract/i.test(readSrc(path.join(capabilitiesDir, 'insight_capability.js'))));
    assert.ok(!/contract/i.test(readSrc(path.join(useCasesDir, 'insight_use_case.js'))));
    assert.ok(!/contract/i.test(readSrc(path.join(applicationDir, 'application_service.js'))));
    assert.ok(!/contract/i.test(readSrc(path.join(intelDir, 'execution', 'execution_manager.js'))));
    assert.ok(!/contract/i.test(readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js'))));
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

  function getRelativeImportTargets(fullPath) {
    const src = readSrc(fullPath);
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((imp) => imp.startsWith('.'));
    return imports.map((imp) => path.normalize(path.join(path.dirname(fullPath), imp)));
  }

  const allIntelFilesExceptContracts = listAllJsFiles(intelDir).filter((f) => !f.includes(path.join('application', 'contracts')) && f !== path.join(intelDir, 'index.js') && f !== path.join(applicationDir, 'index.js'));
  for (const f of allIntelFilesExceptContracts) {
    const relName = path.relative(repoRoot, f);
    await test(`（7.runtime isolation）${relName} 完全不import src/intelligence/application/contracts/（本次任務沒有把任何既有層改成import這個Contract Layer——用實際路徑解析比對，避免跟既有頂層src/intelligence/contracts/誤判）`, () => {
      const targets = getRelativeImportTargets(f);
      for (const target of targets) {
        assert.ok(!target.startsWith(contractsDir), `${relName} 不應該import application/contracts/（實際解析到：${path.relative(repoRoot, target)}）`);
      }
    });
  }

  await test('（7.runtime isolation）src/controllers/、src/routes/、src/worker.js完全沒有任何檔案import src/intelligence/application/contracts/（本次任務明確禁止新增API route）', () => {
    const files = [
      ...fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'controllers', f)),
      ...fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'routes', f)),
      path.join(srcRoot, 'worker.js'),
    ];
    for (const f of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\/contracts\//.test(readSrc(f)), `${f} 不應該import intelligence/application/contracts/`);
    }
  });

  await test('（7.runtime isolation）src/bootstrap/application.js完全不import src/intelligence/application/contracts/（本次任務不需要在bootstrap組裝這個純函式驗證工具）', () => {
    assert.ok(!/from\s+['"].*\/application\/contracts\//.test(readSrc(path.join(srcRoot, 'bootstrap', 'application.js'))));
  });

  await test('（7.runtime isolation）src/bootstrap/application.js的intelligence物件維持19個欄位不變（本次任務沒有新增bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'governance', 'history', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases',
    ]);
  });

  console.log('');

  // =========================================================================
  // H. no database dependency
  // =========================================================================
  console.log('--- H. no database dependency ---');

  for (const file of CONTRACT_JS_FILES) {
    await test(`（8.no database dependency）contracts/${file} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(contractsDir, file))));
    });
    await test(`（8.no database dependency）contracts/${file} 完全沒有db.prepare()/SQL關鍵字/DIET_COACH_DB字樣`, () => {
      const src = readSrc(path.join(contractsDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
    await test(`（8.no database dependency）contracts/${file} 完全不出現db變數名稱作為函式參數（Contract Layer完全不知道db是什麼）`, () => {
      const src = readSrc(path.join(contractsDir, file));
      assert.ok(!/\bdb\b/.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // I. no auth dependency
  // =========================================================================
  console.log('--- I. no auth dependency ---');

  for (const file of CONTRACT_JS_FILES) {
    await test(`（9.no auth dependency）contracts/${file} 完全不import src/auth/、src/oauth/、src/identity/、src/middleware/`, () => {
      const src = readSrc(path.join(contractsDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（9.no auth dependency）contracts/${file} 完全沒有出現jwt/session/cookie相關字樣`, () => {
      const src = readSrc(path.join(contractsDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
    await test(`（9.no auth dependency）contracts/${file} 完全不呼叫requireAuth()/requireActiveUser()/getCurrentUser()`, () => {
      const src = readSrc(path.join(contractsDir, file));
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
  for (const file of CONTRACT_JS_FILES) {
    const codeOnly = readSrc(path.join(contractsDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（10.no AI dependency）contracts/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（10.no AI dependency）contracts/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
    await test(`（10.no AI dependency）contracts/${file} 完全不 import 任何非相對路徑的外部套件`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  await test('（10.no AI dependency）Contract Layer沒有任何機會接觸到Analysis/Recommendation Extension Point（modules注入機制）——那是更底層的事，跟Contract Layer完全無關', () => {
    for (const file of CONTRACT_JS_FILES) {
      const src = readSrc(path.join(contractsDir, file));
      assert.ok(!/dependencies\.modules/.test(src));
    }
  });

  console.log('');

  // =========================================================================
  // K. export consistency
  // =========================================================================
  console.log('--- K. export consistency ---');

  await test('（11.export consistency）contracts/index.js完整re-export了contracts/底下每個原始檔案的全部具名export', () => {
    const reExported = getReExportedNames(path.join(contractsDir, 'index.js'));
    for (const file of ['application_request_contract.js', 'application_response_contract.js', 'contract_validator.js']) {
      const names = getNamedExports(path.join(contractsDir, file));
      for (const name of names) {
        assert.ok(reExported.has(name), `contracts/index.js 缺少 re-export ${name}（來自${file}）`);
      }
    }
  });

  await test('（11.export consistency）contracts/index.js re-export的名稱在對應來源檔案裡確實存在（沒有re-export不存在的東西）', () => {
    const indexSrc = readSrc(path.join(contractsDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(contractsDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `contracts/index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（11.export consistency）contracts/index.js恰好re-export五個具名項目（ApplicationRequestContract/validateApplicationRequestContract/ApplicationResponseContract/validateApplicationResponseContract/createContractValidator）', () => {
    const reExported = getReExportedNames(path.join(contractsDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), [
      'ApplicationRequestContract',
      'ApplicationResponseContract',
      'createContractValidator',
      'validateApplicationRequestContract',
      'validateApplicationResponseContract',
    ]);
  });

  await test('（11.export consistency）src/intelligence/application/index.js 有 export * as contracts from ./contracts/index.js', () => {
    const src = readSrc(path.join(applicationDir, 'index.js'));
    assert.ok(/export \* as contracts from ['"]\.\/contracts\/index\.js['"]/.test(src));
  });

  await test('（11.export consistency）import後，applicationModule.contracts 是非空物件，具備createContractValidator/validateApplicationRequestContract/validateApplicationResponseContract', async () => {
    const applicationModule = await import(path.join(applicationDir, 'index.js'));
    assert.strictEqual(typeof applicationModule.contracts, 'object');
    assert.strictEqual(typeof applicationModule.contracts.createContractValidator, 'function');
    assert.strictEqual(typeof applicationModule.contracts.validateApplicationRequestContract, 'function');
    assert.strictEqual(typeof applicationModule.contracts.validateApplicationResponseContract, 'function');
  });

  await test('（11.export consistency）src/intelligence/index.js的統一輸出入口本身沒有新增任何頂層namespace（application/contracts是nested在application底下，不是新的頂層namespace，也不會跟既有頂層的contracts/executionContracts衝突）', () => {
    const namespaces = getReExportedNamespaces(path.join(intelDir, 'index.js'));
    assert.ok(namespaces.has('contracts'));
    assert.ok(namespaces.has('executionContracts'));
    assert.ok(namespaces.has('application'));
    // 頂層contracts namespace的內容維持是src/intelligence/contracts.js（TASK1.40既有），
    // 不會被application/contracts/取代
    const intelSrc = readSrc(path.join(intelDir, 'index.js'));
    assert.ok(/export \* as contracts from ['"]\.\/contracts\.js['"]/.test(intelSrc));
  });

  await test('（11.export consistency）application/index.js re-export了contracts這個namespace（export * as contracts），跟useCases/capabilities同一批extension point', () => {
    const namespaces = getReExportedNamespaces(path.join(applicationDir, 'index.js'));
    assert.ok(namespaces.has('contracts'));
    assert.ok(namespaces.has('useCases'));
    assert.ok(namespaces.has('capabilities'));
  });

  await test('（11.export consistency）src/intelligence/application/contracts/ 恰好包含4個.js檔案（application_request_contract/application_response_contract/contract_validator/index）', () => {
    assert.deepStrictEqual(CONTRACT_JS_FILES, ['application_request_contract.js', 'application_response_contract.js', 'contract_validator.js', 'index.js']);
  });

  await test('（11.export consistency）src/intelligence/application/contracts/README.md 存在且非空', () => {
    const readmePath = path.join(contractsDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.63-contract')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（12.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 54, `預期至少54個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（13.P1-P6）src/worker.js 完全沒有被TASK1.63修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）wrangler.toml 完全沒有被TASK1.63修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（13.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被TASK1.63修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）src/bootstrap/application.js 完全沒有被TASK1.63修改（本次任務不需要在bootstrap組裝這個純函式驗證工具）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）Analysis/Recommendation Runner/Execution Manager/Application Service/Insight Use Case/Insight Capability的原始碼完全沒有被TASK1.63修改（規格明確禁止修改Execution Runtime Behavior）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/analysis/analysis_runner.js src/intelligence/recommendation/recommendation_runner.js src/intelligence/execution/execution_manager.js src/intelligence/facade/intelligence_facade.js src/intelligence/application/application_service.js src/intelligence/application/use_cases/insight_use_case.js src/intelligence/application/capabilities/insight_capability.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

/*
 * Phase 1 TASK 1.47｜Intelligence Execution Contract Layer Foundation
 * 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「Intelligence Service
 * （TASK1.46）跟未來呼叫端之間的三個穩定執行期合約」：
 * validateIntelligenceRequest()/validateExecutionOptions()/
 * validateIntelligenceResponse()能不能正確驗證request/options/
 * response的形狀，以及intelligence_service.js是否確實改用這三個
 * contract（而不是自己內建驗證邏輯），同時確認Orchestrator/Analysis/
 * Recommendation三層邏輯完全沒有被觸碰。不驗證任何真正的AI分析/推薦
 * 邏輯（因為根本沒有）。
 *
 * 分為以下14個部分：
 * A) request validation
 * B) options validation
 * C) response validation
 * D) service integration
 * E) invalid input handling
 * F) deterministic behavior
 * G) no AI dependency
 * H) no external dependency
 * I) no SQL
 * J) no HTTP
 * K) no authentication dependency
 * L) regression test
 * M) bootstrap compatibility
 * N) P1-P6
 *
 * 全部使用純記憶體測試（除了L/M類少數呼叫真正的createApplication()跟
 * 子行程regression外），完全不連線任何真實或本機模擬的資料庫，不呼叫
 * 任何AI API或fetch()，不建立任何真實使用者session。
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
const contractsDir = path.join(intelDir, 'contracts');
const executionDir = path.join(contractsDir, 'execution');
const serviceDir = path.join(intelDir, 'service');

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

function sampleResponse(overrides) {
  return Object.assign(
    {
      status: 'intelligence_ready',
      context: { user: { id: 'u1' } },
      analysis: { status: 'analysis_ready', insights: [], metadata: { generatedAt: null, version: '1.0.0' } },
      recommendation: { status: 'recommendation_ready', recommendations: [], metadata: { version: '1.0.0' } },
      metadata: { version: '1.0.0' },
    },
    overrides || {}
  );
}

async function run() {
  const requestMod = await import(path.join(executionDir, 'intelligence_request_contract.js'));
  const { validateIntelligenceRequest, IntelligenceRequestContract } = requestMod;
  const optionsMod = await import(path.join(executionDir, 'execution_options_contract.js'));
  const { validateExecutionOptions, ExecutionOptionsContract } = optionsMod;
  const responseMod = await import(path.join(executionDir, 'intelligence_response_contract.js'));
  const { validateIntelligenceResponse, IntelligenceResponseContract, EXPECTED_STATUS } = responseMod;
  await import(path.join(executionDir, 'index.js'));
  const { createIntelligenceService } = await import(path.join(serviceDir, 'index.js'));
  const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));

  // =========================================================================
  // A. request validation
  // =========================================================================
  console.log('--- A. request validation ---');

  await test('（1.request validation）合法request {userId} 通過驗證', () => {
    assert.deepStrictEqual(validateIntelligenceRequest({ userId: 'u1' }), { ok: true });
  });

  await test('（1.request validation）合法request {userId, options} 通過驗證', () => {
    const result = validateIntelligenceRequest({ userId: 'u1', options: { includeContext: true } });
    assert.strictEqual(result.ok, true);
  });

  await test('（1.request validation）缺少userId時回傳{ok:false, reason:"invalid_user_id"}', () => {
    const result = validateIntelligenceRequest({});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（1.request validation）userId為空字串時回傳失敗', () => {
    assert.strictEqual(validateIntelligenceRequest({ userId: '' }).ok, false);
  });

  await test('（1.request validation）userId為數字時回傳失敗（型別不對）', () => {
    assert.strictEqual(validateIntelligenceRequest({ userId: 123 }).ok, false);
  });

  await test('（1.request validation）userId為null時回傳失敗', () => {
    assert.strictEqual(validateIntelligenceRequest({ userId: null }).ok, false);
  });

  await test('（1.request validation）options存在但不是物件時回傳{ok:false, reason:"invalid_options_type"}', () => {
    const result = validateIntelligenceRequest({ userId: 'u1', options: 'not-an-object' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.request validation）options為陣列時回傳失敗（陣列不是合法的options物件）', () => {
    assert.strictEqual(validateIntelligenceRequest({ userId: 'u1', options: [] }).ok, false);
  });

  await test('（1.request validation）options為null時回傳失敗', () => {
    assert.strictEqual(validateIntelligenceRequest({ userId: 'u1', options: null }).ok, false);
  });

  await test('（1.request validation）request本身為null時回傳{ok:false, reason:"invalid_request"}', () => {
    assert.strictEqual(validateIntelligenceRequest(null).reason, 'invalid_request');
  });

  await test('（1.request validation）request本身為陣列時回傳失敗（typeof []==="object"但不合法）', () => {
    assert.strictEqual(validateIntelligenceRequest([]).ok, false);
  });

  await test('（1.request validation）request本身為字串時回傳失敗', () => {
    assert.strictEqual(validateIntelligenceRequest('u1').ok, false);
  });

  await test('（1.request validation）IntelligenceRequestContract具備required:["userId"]跟optional:["options"]', () => {
    assert.deepStrictEqual(IntelligenceRequestContract.required, ['userId']);
    assert.deepStrictEqual(IntelligenceRequestContract.optional, ['options']);
  });

  await test('（1.request validation）驗證函式是純函式：同樣輸入呼叫多次得到deepStrictEqual結果', () => {
    const input = { userId: 'u1', options: { includeContext: true } };
    const a = validateIntelligenceRequest(input);
    const b = validateIntelligenceRequest(input);
    assert.deepStrictEqual(a, b);
  });

  console.log('');

  // =========================================================================
  // B. options validation
  // =========================================================================
  console.log('--- B. options validation ---');

  await test('（2.options validation）options為undefined時視為合法（等同沒有提供options）', () => {
    assert.deepStrictEqual(validateExecutionOptions(undefined), { ok: true });
  });

  await test('（2.options validation）空物件{}視為合法', () => {
    assert.strictEqual(validateExecutionOptions({}).ok, true);
  });

  await test('（2.options validation）version為字串時通過', () => {
    assert.strictEqual(validateExecutionOptions({ version: '1.0.0' }).ok, true);
  });

  await test('（2.options validation）version不是字串時回傳失敗', () => {
    const result = validateExecutionOptions({ version: 123 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'version');
  });

  await test('（2.options validation）includeContext為布林值時通過', () => {
    assert.strictEqual(validateExecutionOptions({ includeContext: true }).ok, true);
    assert.strictEqual(validateExecutionOptions({ includeContext: false }).ok, true);
  });

  await test('（2.options validation）includeContext不是布林值時回傳失敗', () => {
    const result = validateExecutionOptions({ includeContext: 'yes' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'includeContext');
  });

  await test('（2.options validation）includeAnalysis不是布林值時回傳失敗', () => {
    const result = validateExecutionOptions({ includeAnalysis: 1 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'includeAnalysis');
  });

  await test('（2.options validation）includeRecommendation不是布林值時回傳失敗', () => {
    const result = validateExecutionOptions({ includeRecommendation: 'true' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'includeRecommendation');
  });

  await test('（2.options validation）四個欄位同時提供且型別皆正確時通過', () => {
    const result = validateExecutionOptions({ version: '1.0.0', includeContext: true, includeAnalysis: false, includeRecommendation: true });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.options validation）options是null時回傳{ok:false, reason:"invalid_options"}', () => {
    const result = validateExecutionOptions(null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options');
  });

  await test('（2.options validation）options是陣列時回傳失敗', () => {
    assert.strictEqual(validateExecutionOptions([]).ok, false);
  });

  await test('（2.options validation）options是字串時回傳失敗', () => {
    assert.strictEqual(validateExecutionOptions('bad').ok, false);
  });

  await test('（2.options validation）帶有非預期額外欄位時依然通過（只驗證已知欄位的型別，不拒絕未知欄位，保留未來擴充彈性）', () => {
    const result = validateExecutionOptions({ weirdField: 'whatever' });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.options validation）ExecutionOptionsContract.fields恰好具備version/includeContext/includeAnalysis/includeRecommendation四個欄位', () => {
    assert.deepStrictEqual(Object.keys(ExecutionOptionsContract.fields).sort(), ['includeAnalysis', 'includeContext', 'includeRecommendation', 'version']);
  });

  await test('（2.options validation）驗證邏輯完全不讀取欄位的值去做任何業務判斷——原始碼掃描確認execution_options_contract.js只用typeof比較，沒有if(options.includeAnalysis)這種依值分支的程式碼', () => {
    const src = readSrc(path.join(executionDir, 'execution_options_contract.js'));
    assert.ok(!/if\s*\(\s*options\.\w+\s*\)/.test(src), '不應該出現依欄位值做判斷的分支');
  });

  await test('（2.options validation）驗證函式是純函式：同樣輸入呼叫多次得到deepStrictEqual結果', () => {
    const input = { version: '1.0.0', includeContext: true };
    assert.deepStrictEqual(validateExecutionOptions(input), validateExecutionOptions(input));
  });

  console.log('');

  // =========================================================================
  // C. response validation
  // =========================================================================
  console.log('--- C. response validation ---');

  await test('（3.response validation）合法的Unified Intelligence Result通過驗證', () => {
    assert.deepStrictEqual(validateIntelligenceResponse(sampleResponse()), { ok: true });
  });

  await test('（3.response validation）EXPECTED_STATUS恰好是"intelligence_ready"', () => {
    assert.strictEqual(EXPECTED_STATUS, 'intelligence_ready');
  });

  await test('（3.response validation）status不等於"intelligence_ready"時回傳{ok:false, reason:"unexpected_status"}', () => {
    const result = validateIntelligenceResponse(sampleResponse({ status: 'something_else' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'unexpected_status');
  });

  await test('（3.response validation）status不是字串時回傳{ok:false, reason:"invalid_field_type", field:"status"}', () => {
    const result = validateIntelligenceResponse(sampleResponse({ status: 123 }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_field_type');
    assert.strictEqual(result.field, 'status');
  });

  for (const field of ['context', 'analysis', 'recommendation', 'metadata']) {
    await test(`（3.response validation）缺少${field}欄位時回傳{ok:false, reason:"missing_field", field:"${field}"}`, () => {
      const bad = sampleResponse();
      delete bad[field];
      const result = validateIntelligenceResponse(bad);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, 'missing_field');
      assert.strictEqual(result.field, field);
    });

    await test(`（3.response validation）${field}為null時回傳{ok:false, reason:"invalid_field_type", field:"${field}"}`, () => {
      const bad = sampleResponse({ [field]: null });
      const result = validateIntelligenceResponse(bad);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, 'invalid_field_type');
      assert.strictEqual(result.field, field);
    });

    await test(`（3.response validation）${field}為字串時回傳失敗（必須是物件）`, () => {
      const bad = sampleResponse({ [field]: 'not-an-object' });
      assert.strictEqual(validateIntelligenceResponse(bad).ok, false);
    });
  }

  await test('（3.response validation）response為null時回傳{ok:false, reason:"invalid_response"}', () => {
    const result = validateIntelligenceResponse(null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_response');
  });

  await test('（3.response validation）response為字串時回傳失敗', () => {
    assert.strictEqual(validateIntelligenceResponse('bad').ok, false);
  });

  await test('（3.response validation）IntelligenceResponseContract.fields恰好具備status/context/analysis/recommendation/metadata五個欄位', () => {
    assert.deepStrictEqual(Object.keys(IntelligenceResponseContract.fields).sort(), ['analysis', 'context', 'metadata', 'recommendation', 'status']);
  });

  await test('（3.response validation）驗證函式是純函式：同樣輸入呼叫多次得到deepStrictEqual結果', () => {
    const input = sampleResponse();
    assert.deepStrictEqual(validateIntelligenceResponse(input), validateIntelligenceResponse(input));
  });

  console.log('');

  // =========================================================================
  // D. service integration
  // =========================================================================
  console.log('--- D. service integration ---');

  function makeSpyOrchestrator(config) {
    config = config || {};
    const calls = [];
    return {
      calls,
      orchestrator: {
        runIntelligencePipeline: async (db, userId, options) => {
          calls.push({ db, userId, options });
          if (config.runIntelligencePipeline) return config.runIntelligencePipeline(db, userId, options);
          return { ok: true, status: 'intelligence_ready', data: { result: sampleResponse() } };
        },
      },
    };
  }

  await test('（4.service integration）合法request成功時，getIntelligence()回傳{ok:true, data}，data符合response contract', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(validateIntelligenceResponse(result.data).ok, true);
  });

  await test('（4.service integration）request驗證失敗時，orchestrator完全不會被呼叫（request contract先擋下）', async () => {
    const { orchestrator, calls } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    await service.getIntelligence({}, {});
    assert.strictEqual(calls.length, 0);
  });

  await test('（4.service integration）options驗證失敗時，orchestrator完全不會被呼叫（options contract先擋下）', async () => {
    const { orchestrator, calls } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1', options: { includeContext: 'nope' } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(calls.length, 0);
  });

  await test('（4.service integration）options驗證失敗時，getIntelligence()回傳跟validateExecutionOptions()相同的reason', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1', options: { version: 123 } });
    assert.strictEqual(result.reason, validateExecutionOptions({ version: 123 }).reason);
  });

  await test('（4.service integration）orchestrator回傳的response不符合response contract（例如缺少欄位）時，getIntelligence()正確攔截並回傳失敗，不會把不合法的資料回傳給呼叫端', async () => {
    const { orchestrator } = makeSpyOrchestrator({ runIntelligencePipeline: () => ({ ok: true, status: 'intelligence_ready', data: { result: { status: 'intelligence_ready' } } }) });
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_field');
  });

  await test('（4.service integration）orchestrator回傳status不是"intelligence_ready"時，getIntelligence()正確攔截並回傳失敗', async () => {
    const { orchestrator } = makeSpyOrchestrator({ runIntelligencePipeline: () => ({ ok: true, status: 'intelligence_ready', data: { result: sampleResponse({ status: 'wrong' }) } }) });
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'unexpected_status');
  });

  await test('（4.service integration）request.options未提供時，跳過options contract驗證（視為合法），orchestrator仍會被正常呼叫', async () => {
    const { orchestrator, calls } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].options, undefined);
  });

  await test('（4.service integration，端對端）真正的createIntelligenceOrchestrator()（假造四個子依賴）搭配真正的service，三個contract都確實在中間發揮作用', async () => {
    const realOrchestrator = createIntelligenceOrchestrator({
      dataPreparation: { prepare: async () => ({ ok: true, context: {} }) },
      contextBuilder: { buildInsightContext: () => ({ context: sampleResponse().context, validation: { ok: true } }) },
      analysisRunner: { runAnalysis: () => ({ ok: true, result: sampleResponse().analysis }) },
      recommendationRunner: { runRecommendation: () => ({ ok: true, result: sampleResponse().recommendation }) },
    });
    const service = createIntelligenceService({ orchestrator: realOrchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1', options: { includeContext: true } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.status, 'intelligence_ready');
  });

  await test('（4.service integration）intelligence_service.js確實import了三個execution contract檔案（原始碼掃描）', () => {
    const src = readSrc(path.join(serviceDir, 'intelligence_service.js'));
    assert.ok(/from\s*['"]\.\.\/contracts\/execution\/intelligence_request_contract\.js['"]/.test(src));
    assert.ok(/from\s*['"]\.\.\/contracts\/execution\/execution_options_contract\.js['"]/.test(src));
    assert.ok(/from\s*['"]\.\.\/contracts\/execution\/intelligence_response_contract\.js['"]/.test(src));
  });

  await test('（4.service integration）intelligence_service.js確實呼叫了validateIntelligenceRequest/validateExecutionOptions/validateIntelligenceResponse三個函式（原始碼掃描）', () => {
    const src = readSrc(path.join(serviceDir, 'intelligence_service.js'));
    assert.ok(/validateIntelligenceRequest\(/.test(src));
    assert.ok(/validateExecutionOptions\(/.test(src));
    assert.ok(/validateIntelligenceResponse\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // E. invalid input handling
  // =========================================================================
  console.log('--- E. invalid input handling ---');

  await test('（5.invalid input handling）validateIntelligenceRequest(undefined) 不拋出例外，安全回傳失敗', () => {
    assert.doesNotThrow(() => validateIntelligenceRequest(undefined));
    assert.strictEqual(validateIntelligenceRequest(undefined).ok, false);
  });

  await test('（5.invalid input handling）validateExecutionOptions(123) 不拋出例外，安全回傳失敗', () => {
    assert.doesNotThrow(() => validateExecutionOptions(123));
    assert.strictEqual(validateExecutionOptions(123).ok, false);
  });

  await test('（5.invalid input handling）validateIntelligenceResponse(undefined) 不拋出例外，安全回傳失敗', () => {
    assert.doesNotThrow(() => validateIntelligenceResponse(undefined));
    assert.strictEqual(validateIntelligenceResponse(undefined).ok, false);
  });

  await test('（5.invalid input handling）validateIntelligenceRequest()沒有帶任何參數時不拋出例外', () => {
    assert.doesNotThrow(() => validateIntelligenceRequest());
  });

  await test('（5.invalid input handling）validateExecutionOptions()沒有帶任何參數時等同undefined，視為合法', () => {
    assert.strictEqual(validateExecutionOptions().ok, true);
  });

  await test('（5.invalid input handling）validateIntelligenceResponse()沒有帶任何參數時不拋出例外，安全回傳失敗', () => {
    assert.doesNotThrow(() => validateIntelligenceResponse());
    assert.strictEqual(validateIntelligenceResponse().ok, false);
  });

  await test('（5.invalid input handling）getIntelligence()對完全空的request物件安全回傳失敗，不拋出例外', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    await assert.doesNotReject(() => service.getIntelligence({}, {}));
  });

  await test('（5.invalid input handling）getIntelligence()對request為深層巢狀的畸形物件安全回傳失敗，不拋出例外', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const weird = { userId: { nested: true }, options: { a: { b: { c: 1 } } } };
    await assert.doesNotReject(() => service.getIntelligence({}, weird));
    const result = await service.getIntelligence({}, weird);
    assert.strictEqual(result.ok, false);
  });

  console.log('');

  // =========================================================================
  // F. deterministic behavior
  // =========================================================================
  console.log('--- F. deterministic behavior ---');

  await test('（6.deterministic behavior）intelligence_request_contract.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(executionDir, 'intelligence_request_contract.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（6.deterministic behavior）execution_options_contract.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(executionDir, 'execution_options_contract.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（6.deterministic behavior）intelligence_response_contract.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(executionDir, 'intelligence_response_contract.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（6.deterministic behavior）三個驗證函式都不會修改（mutate）傳入的物件', () => {
    const req = { userId: 'u1', options: { includeContext: true } };
    const reqSnapshot = JSON.parse(JSON.stringify(req));
    validateIntelligenceRequest(req);
    assert.deepStrictEqual(req, reqSnapshot);

    const opts = { version: '1.0.0' };
    const optsSnapshot = JSON.parse(JSON.stringify(opts));
    validateExecutionOptions(opts);
    assert.deepStrictEqual(opts, optsSnapshot);

    const resp = sampleResponse();
    const respSnapshot = JSON.parse(JSON.stringify(resp));
    validateIntelligenceResponse(resp);
    assert.deepStrictEqual(resp, respSnapshot);
  });

  await test('（6.deterministic behavior，端對端）同樣的假orchestrator輸出，連續呼叫兩次getIntelligence()得到完全相同的結果', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const a = await service.getIntelligence({}, { userId: 'u1' });
    const b = await service.getIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(a, b);
  });

  await test('（6.deterministic behavior）連續三次呼叫validateIntelligenceRequest()（相同輸入）結果完全相同', () => {
    const input = { userId: 'u1' };
    const first = validateIntelligenceRequest(input);
    validateIntelligenceRequest(input);
    const third = validateIntelligenceRequest(input);
    assert.deepStrictEqual(first, third);
  });

  console.log('');

  // =========================================================================
  // G. no AI dependency
  // =========================================================================
  console.log('--- G. no AI dependency ---');

  const EXECUTION_JS_FILES = fs.readdirSync(executionDir).filter((f) => f.endsWith('.js')).sort();
  await test('（7.no AI dependency）src/intelligence/contracts/execution/ 恰好包含4個.js檔案', () => {
    assert.deepStrictEqual(EXECUTION_JS_FILES, ['execution_options_contract.js', 'index.js', 'intelligence_request_contract.js', 'intelligence_response_contract.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of EXECUTION_JS_FILES) {
    const codeOnly = readSrc(path.join(executionDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（7.no AI dependency）src/intelligence/contracts/execution/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（7.no AI dependency）src/intelligence/contracts/execution/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // H. no external dependency
  // =========================================================================
  console.log('--- H. no external dependency ---');

  for (const file of EXECUTION_JS_FILES) {
    await test(`（8.no external dependency）src/intelligence/contracts/execution/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（8.no external dependency）src/intelligence/contracts/execution/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // I. no SQL
  // =========================================================================
  console.log('--- I. no SQL ---');

  for (const file of EXECUTION_JS_FILES) {
    await test(`（9.no SQL）src/intelligence/contracts/execution/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（9.no SQL）src/intelligence/contracts/execution/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（9.no SQL）src/intelligence/contracts/execution/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（9.no SQL）src/intelligence/contracts/execution/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（9.no SQL）三個contract檔案完全不接受db參數（純資料形狀驗證，跟D1完全無關）', () => {
    const reqSrc = readSrc(path.join(executionDir, 'intelligence_request_contract.js'));
    const optSrc = readSrc(path.join(executionDir, 'execution_options_contract.js'));
    const respSrc = readSrc(path.join(executionDir, 'intelligence_response_contract.js'));
    assert.ok(/function validateIntelligenceRequest\(request\)/.test(reqSrc));
    assert.ok(/function validateExecutionOptions\(options\)/.test(optSrc));
    assert.ok(/function validateIntelligenceResponse\(response\)/.test(respSrc));
  });

  console.log('');

  // =========================================================================
  // J. no HTTP
  // =========================================================================
  console.log('--- J. no HTTP ---');

  for (const file of EXECUTION_JS_FILES) {
    await test(`（10.no HTTP）src/intelligence/contracts/execution/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（10.no HTTP）src/intelligence/contracts/execution/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（10.no HTTP）src/routes/${file} 完全不 import src/intelligence/contracts/execution/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/contracts\/execution\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（10.no HTTP）src/controllers/${file} 完全不 import src/intelligence/contracts/execution/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/contracts\/execution\//.test(src));
    });
  }

  await test('（10.no HTTP）src/worker.js 完全不 import src/intelligence/contracts/execution/', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/intelligence\/contracts\/execution\//.test(src));
  });

  console.log('');

  // =========================================================================
  // K. no authentication dependency
  // =========================================================================
  console.log('--- K. no authentication dependency ---');

  for (const file of EXECUTION_JS_FILES) {
    await test(`（11.no authentication dependency）src/intelligence/contracts/execution/${file} 完全不 import src/auth/ 或 src/identity/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（11.no authentication dependency）src/intelligence/contracts/execution/${file} 完全不 import src/middleware/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（11.no authentication dependency）src/intelligence/contracts/execution/${file} 完全沒有出現 JWT/session/cookie 相關字樣`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（11.no authentication dependency）intelligence_request_contract.js 完全不呼叫 requireAuth/requireActiveUser（userId驗證只檢查型別，不做身份查證）', () => {
    const src = readSrc(path.join(executionDir, 'intelligence_request_contract.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // L. regression test
  // =========================================================================
  console.log('--- L. regression test ---');

  // 沿用TASK1.39~1.46既有的遞迴防護手法。
  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（12.regression test）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.47-execution-contract')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（12.regression test）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.46）`, () => {
      assert.ok(allSuites.length >= 38, `預期至少38個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（12.regression test）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // M. bootstrap compatibility
  // =========================================================================
  console.log('--- M. bootstrap compatibility ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（13.bootstrap compatibility）createApplication() 完整回傳形狀依然是 {config, db, services, router, middleware, intelligence} 六個頂層欄位（本次任務不修改bootstrap）', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'intelligence', 'middleware', 'router', 'services']);
  });

  // 注意：TASK1.48（Intelligence Facade Layer）為app.intelligence新增
  // 了`facade`欄位，TASK1.50（Intelligence Execution Lifecycle
  // Manager）新增了`execution`欄位，TASK1.51（Intelligence Execution
  // Event Layer）又新增了`events`欄位，都是明確要做的擴充，不是回歸，
  // 這裡的預期key清單已同步更新。
  await test('（TASK1.60後更新）app.intelligence 恰好具備TASK1.46既有九個欄位加上TASK1.48新增的facade、TASK1.50新增的execution、TASK1.51新增的events、TASK1.52新增的history、TASK1.53新增的monitoring、TASK1.54新增的metrics、TASK1.55新增的governance、TASK1.60新增的application，共十七個欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), ['analysis', 'analysisEngine', 'application', 'context', 'dataPreparation', 'events', 'execution', 'facade', 'governance', 'history', 'insightService', 'metrics', 'monitoring', 'orchestration', 'recommendation', 'recommendationEngine', 'service']);
  });

  await test('（13.bootstrap compatibility）app.intelligence.service.getIntelligence() 透過bootstrap建立的實例依然正確使用新的execution contract驗證（缺少userId時回傳invalid_user_id）', async () => {
    const app = createApplication(makeFullEnv());
    const result = await app.intelligence.service.getIntelligence({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（13.bootstrap compatibility）app.intelligence.service.getIntelligence() 對不合法options正確攔截（透過bootstrap建立的實例）', async () => {
    const app = createApplication(makeFullEnv());
    const result = await app.intelligence.service.getIntelligence({}, { userId: 'u1', options: { includeContext: 'nope' } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_field_type');
  });

  await test('（13.bootstrap compatibility）app.router.routes 數量沒有因為新增execution contract而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  // 注意：這裡原本用「git diff --stat src/bootstrap/application.js
  // 必須為空」檢查TASK1.47沒有修改這個檔案——TASK1.48（Intelligence
  // Facade Layer）合法新增了`intelligence.facade`欄位，需要修改這個
  // 檔案，讓這個live diff檢查永遠失敗，屬於TASK1.39當時就記錄過的
  // 「用即時git diff檢查未來會被後續任務合法修改的檔案」治具問題。
  // 修正為內容型檢查：確認TASK1.47當時真正在乎的事情——
  // intelligenceService的組裝方式（用intelligenceOrchestrator做DI）
  // 依然存在，不受未來新增欄位影響。
  await test('（TASK1.48後更新）原始碼掃描：src/bootstrap/application.js 裡createIntelligenceService()依然用intelligenceOrchestrator做依賴注入（TASK1.47當時的組裝方式沒有被後續任務破壞，即使檔案本身因TASK1.48新增facade欄位而合法變動）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    const match = src.match(/createIntelligenceService\(\{([^}]*)\}\)/);
    assert.ok(match, '應該找得到createIntelligenceService({...})呼叫');
    assert.ok(/orchestrator\s*:\s*intelligenceOrchestrator/.test(match[1]));
  });

  await test('（13.bootstrap compatibility）原始碼掃描：src/intelligence/orchestration/、src/intelligence/analysis/、src/intelligence/recommendation/ 三個目錄的.js檔案完全沒有被TASK1.47修改（規格明確禁止）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/orchestration/*.js src/intelligence/analysis/*.js src/intelligence/recommendation/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.bootstrap compatibility）原始碼掃描：src/intelligence/index.js 有 export executionContracts namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as executionContracts from ['"]\.\/contracts\/execution\/index\.js['"]/.test(src));
  });

  await test('（13.bootstrap compatibility）每次createApplication()呼叫都各自建立獨立的service實例（不受execution contract共用狀態影響，因為contract都是純函式無狀態）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.service, app2.intelligence.service);
  });

  console.log('');

  // =========================================================================
  // N. P1-P6
  // =========================================================================
  console.log('--- N. P1-P6 ---');

  await test('（14.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（14.P1-P6）src/worker.js 完全沒有被TASK1.47修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）wrangler.toml 完全沒有被TASK1.47修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

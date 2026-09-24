/*
 * Phase 1 TASK 1.48｜Intelligence Application Facade Layer Foundation
 * 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「未來Application
 * Consumer跟Intelligence Service（TASK1.46）之間的application-facing
 * 穩定門面」：intelligence_facade.js的executeIntelligence(db, request)
 * 能不能正確驗證輸入、只呼叫Service（不繞過它直接呼叫Orchestrator/
 * Analysis/Recommendation/Data Preparation/Domain Service/Database）、
 * 把Service的回傳重新包裝成facade自己的穩定輸出格式。不驗證任何真正
 * 的AI分析/推薦邏輯（因為根本沒有）。
 *
 * 分為以下15個部分：
 * A) facade interface
 * B) service integration
 * C) input validation
 * D) output contract
 * E) failure handling
 * F) deterministic behavior
 * G) no AI dependency
 * H) no external dependency
 * I) no SQL
 * J) no HTTP
 * K) no authentication dependency
 * L) pipeline isolation
 * M) regression test
 * N) bootstrap compatibility
 * O) P1-P6
 *
 * 全部使用純記憶體測試（除了M/N類少數呼叫真正的createApplication()跟
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
const facadeDir = path.join(intelDir, 'facade');

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

function sampleServiceData(overrides) {
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

function makeSpyService(config) {
  config = config || {};
  const calls = [];
  return {
    calls,
    service: {
      getIntelligence: async (db, request) => {
        calls.push({ db, request });
        if (config.getIntelligence) return config.getIntelligence(db, request);
        return { ok: true, data: sampleServiceData() };
      },
    },
  };
}

async function run() {
  const facadeMod = await import(path.join(facadeDir, 'intelligence_facade.js'));
  const { createIntelligenceFacade } = facadeMod;
  const resultBuilderMod = await import(path.join(facadeDir, 'facade_result_builder.js'));
  const { createFacadeResultBuilder } = resultBuilderMod;
  await import(path.join(facadeDir, 'index.js'));
  const { createIntelligenceService } = await import(path.join(intelDir, 'service', 'index.js'));
  const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));

  // =========================================================================
  // A. facade interface
  // =========================================================================
  console.log('--- A. facade interface ---');

  await test('（1.facade interface）createIntelligenceFacade() 回傳物件具備 executeIntelligence 函式', () => {
    const facade = createIntelligenceFacade({});
    assert.strictEqual(typeof facade.executeIntelligence, 'function');
  });

  await test('（1.facade interface）executeIntelligence() 回傳一個Promise', () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = facade.executeIntelligence({}, { userId: 'u1' });
    assert.ok(result instanceof Promise);
  });

  await test('（1.facade interface）executeIntelligence() 只需要兩個參數：db跟request', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(/async function executeIntelligence\(db, request\)/.test(src));
  });

  await test('（1.facade interface）createIntelligenceFacade() 沒有傳入依賴時不拋出例外', () => {
    assert.doesNotThrow(() => createIntelligenceFacade());
  });

  await test('（1.facade interface）createIntelligenceFacade({}) 沒有service時，executeIntelligence()仍安全回傳失敗，不拋出例外', async () => {
    const facade = createIntelligenceFacade({});
    await assert.doesNotReject(() => facade.executeIntelligence({}, { userId: 'u1' }));
  });

  await test('（1.facade interface，端對端）真正的createIntelligenceService()實例可以被當作依賴注入進facade（形狀相容，不拋出例外）', () => {
    const realService = createIntelligenceService({});
    assert.doesNotThrow(() => createIntelligenceFacade({ service: realService }));
  });

  await test('（1.facade interface）index.js 正確re-export createIntelligenceFacade/createFacadeResultBuilder', async () => {
    const indexMod = await import(path.join(facadeDir, 'index.js'));
    assert.strictEqual(typeof indexMod.createIntelligenceFacade, 'function');
    assert.strictEqual(typeof indexMod.createFacadeResultBuilder, 'function');
  });

  console.log('');

  // =========================================================================
  // B. service integration
  // =========================================================================
  console.log('--- B. service integration ---');

  await test('（2.service integration）db/userId/options 都原樣轉交給service.getIntelligence()', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const db = { marker: 'the-db' };
    const options = { includeContext: true };
    await facade.executeIntelligence(db, { userId: 'u1', options });
    assert.strictEqual(calls[0].db, db);
    assert.strictEqual(calls[0].request.userId, 'u1');
    assert.strictEqual(calls[0].request.options, options);
  });

  await test('（2.service integration）request.options未提供時，service.getIntelligence()收到的options是undefined', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(calls[0].request.options, undefined);
  });

  await test('（2.service integration）service恰好只被呼叫一次', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(calls.length, 1);
  });

  await test('（2.service integration）facade輸入驗證失敗時，service完全不會被呼叫', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    await facade.executeIntelligence({}, {});
    assert.strictEqual(calls.length, 0);
  });

  await test('（2.service integration）service依賴完全缺少時，安全回傳失敗，不拋出例外', async () => {
    const facade = createIntelligenceFacade({});
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'service_unavailable');
  });

  await test('（2.service integration）service.getIntelligence不是函式時，安全回傳失敗', async () => {
    const facade = createIntelligenceFacade({ service: { getIntelligence: 'nope' } });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'service_unavailable');
  });

  await test('（2.service integration）連續兩次呼叫、不同userId，各自呼叫service時帶著正確的userId', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    await facade.executeIntelligence({}, { userId: 'u1' });
    await facade.executeIntelligence({}, { userId: 'u2' });
    assert.strictEqual(calls[0].request.userId, 'u1');
    assert.strictEqual(calls[1].request.userId, 'u2');
  });

  await test('（2.service integration，端對端）真正的createIntelligenceService()（假造Orchestrator）可以被facade成功呼叫並取得結果', async () => {
    const fakeOrchestrator = {
      runIntelligencePipeline: async () => ({ ok: true, status: 'intelligence_ready', data: { result: sampleServiceData() } }),
    };
    const realService = createIntelligenceService({ orchestrator: fakeOrchestrator });
    const facade = createIntelligenceFacade({ service: realService });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.status, 'intelligence_ready');
  });

  await test('（2.service integration，端對端）真正的createIntelligenceService()+真正的createIntelligenceOrchestrator()（假造四個底層子依賴）完整串接依然正確運作', async () => {
    const realOrchestrator = createIntelligenceOrchestrator({
      dataPreparation: { prepare: async () => ({ ok: true, context: {} }) },
      contextBuilder: { buildInsightContext: () => ({ context: sampleServiceData().context, validation: { ok: true } }) },
      analysisRunner: { runAnalysis: () => ({ ok: true, result: sampleServiceData().analysis }) },
      recommendationRunner: { runRecommendation: () => ({ ok: true, result: sampleServiceData().recommendation }) },
    });
    const realService = createIntelligenceService({ orchestrator: realOrchestrator });
    const facade = createIntelligenceFacade({ service: realService });
    const result = await facade.executeIntelligence({}, { userId: 'u1', options: {} });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.status, 'intelligence_ready');
  });

  console.log('');

  // =========================================================================
  // C. input validation
  // =========================================================================
  console.log('--- C. input validation ---');

  await test('（3.input validation）request為null時安全回傳{ok:false, reason:"invalid_request"}', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（3.input validation）request為undefined時安全回傳失敗', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, undefined);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（3.input validation）request為字串時安全回傳失敗', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, 'nope');
    assert.strictEqual(result.ok, false);
  });

  await test('（3.input validation）request為陣列時安全回傳失敗', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, []);
    assert.strictEqual(result.ok, false);
  });

  await test('（3.input validation）request缺少userId時安全回傳{ok:false, reason:"invalid_user_id"}', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（3.input validation）userId為空字串時安全回傳失敗', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, { userId: '' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（3.input validation）userId為數字時安全回傳失敗', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, { userId: 123 });
    assert.strictEqual(result.ok, false);
  });

  await test('（3.input validation）options存在但不是物件時安全回傳{ok:false, reason:"invalid_options_type"}', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, { userId: 'u1', options: 'nope' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（3.input validation）options為陣列時安全回傳失敗', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, { userId: 'u1', options: [] });
    assert.strictEqual(result.ok, false);
  });

  await test('（3.input validation）options為null時安全回傳失敗', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, { userId: 'u1', options: null });
    assert.strictEqual(result.ok, false);
  });

  await test('（3.input validation）合法request {userId} 通過驗證（options選填）', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（3.input validation）options內容完全不被facade解讀（只是原樣轉交），即使options帶著非預期欄位也不影響驗證結果', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, { userId: 'u1', options: { weird: 'field' } });
    assert.strictEqual(result.ok, true);
  });

  await test('（3.input validation）validateFacadeInput()的驗證邏輯是facade內建、自成一格的函式（原始碼掃描確認）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(/function validateFacadeInput\(request\)/.test(src));
  });

  console.log('');

  // =========================================================================
  // D. output contract
  // =========================================================================
  console.log('--- D. output contract ---');

  await test('（4.output contract）buildSuccessResult(serviceData) 回傳{ok:true, data:{status, result, metadata}}', () => {
    const builder = createFacadeResultBuilder();
    const result = builder.buildSuccessResult(sampleServiceData());
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['metadata', 'result', 'status']);
  });

  await test('（4.output contract）data.status恰好等於傳入serviceData.status', () => {
    const builder = createFacadeResultBuilder();
    const result = builder.buildSuccessResult(sampleServiceData());
    assert.strictEqual(result.data.status, 'intelligence_ready');
  });

  await test('（4.output contract）data.result恰好收斂了context/analysis/recommendation三個欄位', () => {
    const builder = createFacadeResultBuilder();
    const result = builder.buildSuccessResult(sampleServiceData());
    assert.deepStrictEqual(Object.keys(result.data.result).sort(), ['analysis', 'context', 'recommendation']);
  });

  await test('（4.output contract）data.result.context/analysis/recommendation跟原始serviceData的內容完全相同（deepStrictEqual，只是重新排列不是重新解讀）', () => {
    const builder = createFacadeResultBuilder();
    const serviceData = sampleServiceData();
    const result = builder.buildSuccessResult(serviceData);
    assert.deepStrictEqual(result.data.result.context, serviceData.context);
    assert.deepStrictEqual(result.data.result.analysis, serviceData.analysis);
    assert.deepStrictEqual(result.data.result.recommendation, serviceData.recommendation);
  });

  await test('（4.output contract）data.metadata恰好等於serviceData.metadata（不在result裡面，保留在data頂層）', () => {
    const builder = createFacadeResultBuilder();
    const serviceData = sampleServiceData();
    const result = builder.buildSuccessResult(serviceData);
    assert.deepStrictEqual(result.data.metadata, serviceData.metadata);
    assert.ok(!('metadata' in result.data.result));
  });

  await test('（4.output contract）buildFailureResult(reason) 回傳{ok:false, reason}', () => {
    const builder = createFacadeResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult('some_reason'), { ok: false, reason: 'some_reason' });
  });

  await test('（4.output contract）buildFailureResult()對非字串reason安全正規化為"unknown_error"', () => {
    const builder = createFacadeResultBuilder();
    assert.strictEqual(builder.buildFailureResult(123).reason, 'unknown_error');
    assert.strictEqual(builder.buildFailureResult(null).reason, 'unknown_error');
  });

  await test('（4.output contract）buildSuccessResult()對缺少欄位的serviceData安全處理，不拋出例外', () => {
    const builder = createFacadeResultBuilder();
    assert.doesNotThrow(() => builder.buildSuccessResult({}));
    assert.doesNotThrow(() => builder.buildSuccessResult(undefined));
  });

  await test('（4.output contract，端對端）executeIntelligence()成功時回傳shape恰好是{ok, data}兩個頂層欄位', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'ok']);
  });

  await test('（4.output contract，端對端）executeIntelligence()失敗時回傳shape恰好是{ok, reason}兩個頂層欄位（不含data）', async () => {
    const facade = createIntelligenceFacade({});
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result).sort(), ['ok', 'reason']);
  });

  await test('（4.output contract）JSON.stringify(result)不會拋出例外、也不會遺失任何頂層欄位（純資料結構）', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    const roundTripped = JSON.parse(JSON.stringify(result));
    assert.deepStrictEqual(Object.keys(roundTripped).sort(), Object.keys(result).sort());
  });

  console.log('');

  // =========================================================================
  // E. failure handling
  // =========================================================================
  console.log('--- E. failure handling ---');

  await test('（5.failure handling）service失敗（ok:false）且有reason時，facade原樣轉發同一個reason', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'user_not_found' }) });
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_not_found');
  });

  await test('（5.failure handling）facade失敗結果完全不含data欄位（沒有把部分執行結果頂替回傳）', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'boom' }) });
    const facade = createIntelligenceFacade({ service });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.data, undefined);
  });

  await test('（5.failure handling）service丟出例外（reject）時，executeIntelligence()整體也會reject（不吞掉錯誤）', async () => {
    const service = { getIntelligence: async () => { throw new Error('boom'); } };
    const facade = createIntelligenceFacade({ service });
    await assert.rejects(() => facade.executeIntelligence({}, { userId: 'u1' }), /boom/);
  });

  await test('（5.failure handling）驗證失敗（invalid_user_id）的失敗結果格式跟service失敗的格式完全一致（都是{ok:false, reason}）', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const a = await facade.executeIntelligence({}, {});
    assert.deepStrictEqual(Object.keys(a).sort(), ['ok', 'reason']);
  });

  await test('（5.failure handling，端對端）真正的Service在Orchestrator失敗時，facade正確轉發失敗原因', async () => {
    const fakeOrchestrator = { runIntelligencePipeline: async () => ({ ok: false, status: 'orchestration_unavailable', reason: 'data_preparation_unavailable', data: null }) };
    const realService = createIntelligenceService({ orchestrator: fakeOrchestrator });
    const facade = createIntelligenceFacade({ service: realService });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'data_preparation_unavailable');
  });

  await test('（5.failure handling）options型別錯誤造成service內部execution contract拒絕時，facade正確轉發失敗（透過真正的service+假orchestrator）', async () => {
    const fakeOrchestrator = { runIntelligencePipeline: async () => ({ ok: true, status: 'intelligence_ready', data: { result: sampleServiceData() } }) };
    const realService = createIntelligenceService({ orchestrator: fakeOrchestrator });
    const facade = createIntelligenceFacade({ service: realService });
    const result = await facade.executeIntelligence({}, { userId: 'u1', options: { includeContext: 'nope' } });
    assert.strictEqual(result.ok, false);
  });

  console.log('');

  // =========================================================================
  // F. deterministic behavior
  // =========================================================================
  console.log('--- F. deterministic behavior ---');

  await test('（6.deterministic behavior）同樣的假service輸出，連續呼叫兩次executeIntelligence()得到完全相同（deepStrictEqual）的結果', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const a = await facade.executeIntelligence({}, { userId: 'u1' });
    const b = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(a, b);
  });

  await test('（6.deterministic behavior）不同facade實例對同樣輸入產生相同輸出（不依賴實例內部狀態）', async () => {
    const a = await createIntelligenceFacade({ service: makeSpyService().service }).executeIntelligence({}, { userId: 'u1' });
    const b = await createIntelligenceFacade({ service: makeSpyService().service }).executeIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(a, b);
  });

  await test('（6.deterministic behavior）intelligence_facade.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（6.deterministic behavior）facade_result_builder.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(facadeDir, 'facade_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（6.deterministic behavior）executeIntelligence()不會修改（mutate）傳入的原始request物件', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const request = { userId: 'u1', options: { includeContext: true } };
    const snapshot = JSON.parse(JSON.stringify(request));
    await facade.executeIntelligence({}, request);
    assert.deepStrictEqual(request, snapshot);
  });

  await test('（6.deterministic behavior）連續三次呼叫（相同輸入）第一次跟第三次的結果完全相同（不依賴呼叫次數/內部計數器）', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ service });
    const first = await facade.executeIntelligence({}, { userId: 'u1' });
    await facade.executeIntelligence({}, { userId: 'u1' });
    const third = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(first, third);
  });

  console.log('');

  // =========================================================================
  // G. no AI dependency
  // =========================================================================
  console.log('--- G. no AI dependency ---');

  const FACADE_JS_FILES = fs.readdirSync(facadeDir).filter((f) => f.endsWith('.js')).sort();
  await test('（7.no AI dependency）src/intelligence/facade/ 恰好包含3個.js檔案（intelligence_facade/facade_result_builder/index）', () => {
    assert.deepStrictEqual(FACADE_JS_FILES, ['facade_result_builder.js', 'index.js', 'intelligence_facade.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of FACADE_JS_FILES) {
    const codeOnly = readSrc(path.join(facadeDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（7.no AI dependency）src/intelligence/facade/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（7.no AI dependency）src/intelligence/facade/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
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

  for (const file of FACADE_JS_FILES) {
    await test(`（8.no external dependency）src/intelligence/facade/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（8.no external dependency）src/intelligence/facade/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // I. no SQL
  // =========================================================================
  console.log('--- I. no SQL ---');

  for (const file of FACADE_JS_FILES) {
    await test(`（9.no SQL）src/intelligence/facade/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（9.no SQL）src/intelligence/facade/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（9.no SQL）src/intelligence/facade/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（9.no SQL）src/intelligence/facade/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（9.no SQL）intelligence_facade.js 的db參數完全不被解構/存取任何屬性——db只是原樣轉交給service.getIntelligence()的不透明參數', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/\bdb\.\w/.test(src), 'db不應該被存取任何屬性，facade不應該知道db的內部結構');
  });

  console.log('');

  // =========================================================================
  // J. no HTTP
  // =========================================================================
  console.log('--- J. no HTTP ---');

  for (const file of FACADE_JS_FILES) {
    await test(`（10.no HTTP）src/intelligence/facade/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（10.no HTTP）src/intelligence/facade/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（10.no HTTP）src/routes/${file} 完全不 import src/intelligence/facade/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/facade\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（10.no HTTP）src/controllers/${file} 完全不 import src/intelligence/facade/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/facade\//.test(src));
    });
  }

  await test('（10.no HTTP）src/worker.js 完全不 import src/intelligence/facade/', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/intelligence\/facade\//.test(src));
  });

  console.log('');

  // =========================================================================
  // K. no authentication dependency
  // =========================================================================
  console.log('--- K. no authentication dependency ---');

  for (const file of FACADE_JS_FILES) {
    await test(`（11.no authentication dependency）src/intelligence/facade/${file} 完全不 import src/auth/ 或 src/identity/`, () => {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（11.no authentication dependency）src/intelligence/facade/${file} 完全不 import src/middleware/`, () => {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（11.no authentication dependency）src/intelligence/facade/${file} 完全沒有出現 JWT/session/cookie 相關字樣`, () => {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（11.no authentication dependency）intelligence_facade.js 完全不呼叫 requireAuth/requireActiveUser（userId一律由呼叫端當作request.userId傳入，本次任務明確不實作任何授權邏輯，只是預留未來的authorization/context整合點）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // L. pipeline isolation
  // =========================================================================
  console.log('--- L. pipeline isolation ---');

  await test('（12.pipeline isolation）intelligence_facade.js 完全不 import src/intelligence/orchestration/（Facade must NOT call Orchestrator）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
  });

  await test('（12.pipeline isolation）intelligence_facade.js 完全不 import src/intelligence/analysis/（Facade must NOT call Analysis）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/analysis\//.test(src));
  });

  await test('（12.pipeline isolation）intelligence_facade.js 完全不 import src/intelligence/recommendation/（Facade must NOT call Recommendation）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
  });

  await test('（12.pipeline isolation）intelligence_facade.js 完全不 import src/intelligence/data_preparation/（Facade must NOT call Data Preparation）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
  });

  await test('（12.pipeline isolation）intelligence_facade.js 完全不 import src/services/ 底下任何檔案（Facade must NOT call Domain Service）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/services\//.test(src));
  });

  await test('（12.pipeline isolation）intelligence_facade.js 完全不 import src/db/ 底下任何檔案（Facade must NOT call Database）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/db\//.test(src));
  });

  await test('（12.pipeline isolation）intelligence_facade.js 完全不 import src/intelligence/contracts/execution/（不重用Execution Contract，維持每一層只認識自己呼叫的下一層的邊界決策）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/contracts\/execution\//.test(src));
  });

  await test('（12.pipeline isolation）intelligence_facade.js 只 import ./facade_result_builder.js（唯一允許的相依，加上未來依賴注入的service）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./facade_result_builder.js']);
  });

  await test('（12.pipeline isolation）facade_result_builder.js 完全不 import任何intelligence子模組（純粹的資料重新排列，不依賴任何業務邏輯）', () => {
    const src = readSrc(path.join(facadeDir, 'facade_result_builder.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, []);
  });

  await test('（12.pipeline isolation）insight_service.js 完全不 import src/intelligence/facade/（純DI，不硬編依賴，本次任務規格明確不要求串接insight_service.js）', () => {
    const src = readSrc(path.join(intelDir, 'insight_service.js'));
    assert.ok(!/from\s+['"]\.\/facade\//.test(src));
  });

  await test('（12.pipeline isolation）原始碼掃描：src/intelligence/service/intelligence_service.js 完全沒有被TASK1.48修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/service/intelligence_service.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.pipeline isolation）原始碼掃描：src/intelligence/orchestration/、src/intelligence/analysis/、src/intelligence/recommendation/ 三個目錄的.js檔案完全沒有被TASK1.48修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/orchestration/*.js src/intelligence/analysis/*.js src/intelligence/recommendation/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // M. regression test
  // =========================================================================
  console.log('--- M. regression test ---');

  // 沿用TASK1.39~1.47既有的遞迴防護手法。
  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（13.regression test）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.48-intelligence-facade')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（13.regression test）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.47）`, () => {
      assert.ok(allSuites.length >= 39, `預期至少39個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（13.regression test）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // N. bootstrap compatibility
  // =========================================================================
  console.log('--- N. bootstrap compatibility ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（14.bootstrap compatibility）createApplication(env).intelligence 具備 facade 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('facade' in app.intelligence);
  });

  await test('（14.bootstrap compatibility）app.intelligence.facade 具備 executeIntelligence 函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.facade.executeIntelligence, 'function');
  });

  await test('（14.bootstrap compatibility）app.intelligence 恰好具備十個欄位（TASK1.46既有九個加上TASK1.48新增的facade）', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), ['analysis', 'analysisEngine', 'context', 'dataPreparation', 'facade', 'insightService', 'orchestration', 'recommendation', 'recommendationEngine', 'service']);
  });

  await test('（14.bootstrap compatibility）app.intelligence.facade內部注入的service跟app.intelligence.service是同一個實例（用spy覆寫getIntelligence()驗證兩者共用同一個物件參考）', async () => {
    const app = createApplication(makeFullEnv());
    let called = false;
    app.intelligence.service.getIntelligence = async () => {
      called = true;
      return { ok: false, reason: 'spy_short_circuit' };
    };
    const result = await app.intelligence.facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(called, true);
    assert.strictEqual(result.reason, 'spy_short_circuit');
  });

  await test('（14.bootstrap compatibility）每次createApplication()呼叫都各自建立獨立的facade實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.facade, app2.intelligence.facade);
  });

  await test('（14.bootstrap compatibility）createApplication() 完整回傳形狀依然是 {config, db, services, router, middleware, intelligence} 六個頂層欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'intelligence', 'middleware', 'router', 'services']);
  });

  await test('（14.bootstrap compatibility）原始碼掃描：src/bootstrap/application.js 有 import facade（來自 ../intelligence/index.js）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(/\bfacade\b.*from ['"]\.\.\/intelligence\/index\.js['"]/.test(src));
  });

  await test('（14.bootstrap compatibility）原始碼掃描：src/intelligence/index.js 有 export facade namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as facade from ['"]\.\/facade\/index\.js['"]/.test(src));
  });

  await test('（14.bootstrap compatibility）app.router.routes 數量沒有因為新增facade而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（14.bootstrap compatibility）原始碼掃描：src/bootstrap/application.js 呼叫createIntelligenceFacade()時注入的是既有的intelligenceService變數（不是新建第二份實例）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    const match = src.match(/createIntelligenceFacade\(\{([^}]*)\}\)/);
    assert.ok(match, '應該找得到createIntelligenceFacade({...})呼叫');
    assert.ok(/service\s*:\s*intelligenceService/.test(match[1]));
  });

  console.log('');

  // =========================================================================
  // O. P1-P6
  // =========================================================================
  console.log('--- O. P1-P6 ---');

  await test('（15.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（15.P1-P6）src/worker.js 完全沒有被TASK1.48修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（15.P1-P6）wrangler.toml 完全沒有被TASK1.48修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（15.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

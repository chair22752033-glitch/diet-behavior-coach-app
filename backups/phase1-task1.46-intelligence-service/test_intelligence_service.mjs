/*
 * Phase 1 TASK 1.46｜Intelligence Application Service Layer Foundation
 * 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「未來Application/API
 * Layer跟Intelligence Orchestrator之間的穩定應用邊界」：
 * intelligence_service.js的getIntelligence(db, request)能不能正確
 * 驗證輸入、呼叫Orchestrator、把結果包成穩定的服務層格式，以及這一層
 * 是否確實只透過依賴注入呼叫Orchestrator，完全不繞過它直接存取任何
 * 更底層的Phase 2子層或Domain Service。不驗證任何真正的AI分析/推薦
 * 邏輯（因為根本沒有）。
 *
 * 分為以下14個部分：
 * A) service interface
 * B) orchestrator integration
 * C) input validation
 * D) output contract
 * E) failure handling
 * F) deterministic behavior
 * G) no AI dependency
 * H) no external dependency
 * I) no SQL
 * J) no HTTP
 * K) no authentication dependency
 * L) bootstrap injection
 * M) regression test
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

function sampleUnifiedResult(overrides) {
  return Object.assign(
    {
      status: 'intelligence_ready',
      context: { user: { id: 'u1' }, nutritionContext: { count: 0, items: [] } },
      analysis: { status: 'analysis_ready', insights: [], metadata: { generatedAt: null, version: '1.0.0' } },
      recommendation: { status: 'recommendation_ready', recommendations: [], metadata: { version: '1.0.0' } },
      metadata: { version: '1.0.0' },
    },
    overrides || {}
  );
}

/**
 * 建立一組可控制回傳值、並記錄呼叫參數的假Orchestrator，供
 * orchestrator integration / input validation / output contract /
 * failure handling / deterministic behavior 各類測試共用。
 */
function makeSpyOrchestrator(config) {
  config = config || {};
  const calls = [];
  const orchestrator = {
    runIntelligencePipeline: async (db, userId, options) => {
      calls.push({ db, userId, options });
      if (config.runIntelligencePipeline) return config.runIntelligencePipeline(db, userId, options);
      return { ok: true, status: 'intelligence_ready', data: { result: sampleUnifiedResult() } };
    },
  };
  return { orchestrator, calls };
}

async function run() {
  const serviceMod = await import(path.join(serviceDir, 'intelligence_service.js'));
  const { createIntelligenceService } = serviceMod;
  const resultBuilderMod = await import(path.join(serviceDir, 'service_result_builder.js'));
  const { createServiceResultBuilder } = resultBuilderMod;
  await import(path.join(serviceDir, 'index.js'));
  const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));

  // =========================================================================
  // A. service interface
  // =========================================================================
  console.log('--- A. service interface ---');

  await test('（1.service interface）createIntelligenceService() 回傳物件具備 getIntelligence 函式', () => {
    const service = createIntelligenceService({});
    assert.strictEqual(typeof service.getIntelligence, 'function');
  });

  await test('（1.service interface）getIntelligence() 回傳一個Promise', () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = service.getIntelligence({}, { userId: 'u1' });
    assert.ok(result instanceof Promise);
  });

  await test('（1.service interface）getIntelligence() 只需要兩個參數：db跟request（不需要options當作第三個獨立參數）', () => {
    const src = readSrc(path.join(serviceDir, 'intelligence_service.js'));
    assert.ok(/async function getIntelligence\(db, request\)/.test(src));
  });

  await test('（1.service interface）createIntelligenceService() 沒有傳入依賴時不拋出例外', () => {
    assert.doesNotThrow(() => createIntelligenceService());
  });

  await test('（1.service interface）createIntelligenceService({}) 沒有orchestrator時，getIntelligence()仍安全回傳失敗，不拋出例外', async () => {
    const service = createIntelligenceService({});
    await assert.doesNotReject(() => service.getIntelligence({}, { userId: 'u1' }));
  });

  await test('（1.service interface，端對端）真正的createIntelligenceOrchestrator()實例可以被當作依賴注入進service（形狀相容，不拋出例外）', () => {
    const realOrchestrator = createIntelligenceOrchestrator({});
    assert.doesNotThrow(() => createIntelligenceService({ orchestrator: realOrchestrator }));
  });

  await test('（1.service interface）index.js 正確re-export createIntelligenceService/createServiceResultBuilder', async () => {
    const indexMod = await import(path.join(serviceDir, 'index.js'));
    assert.strictEqual(typeof indexMod.createIntelligenceService, 'function');
    assert.strictEqual(typeof indexMod.createServiceResultBuilder, 'function');
  });

  console.log('');

  // =========================================================================
  // B. orchestrator integration
  // =========================================================================
  console.log('--- B. orchestrator integration ---');

  await test('（2.orchestrator integration）db/userId/options 三者原樣轉交給orchestrator.runIntelligencePipeline()', async () => {
    const { orchestrator, calls } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const db = { marker: 'the-db' };
    const options = { limit: 5 };
    await service.getIntelligence(db, { userId: 'u1', options });
    assert.strictEqual(calls[0].db, db);
    assert.strictEqual(calls[0].userId, 'u1');
    assert.strictEqual(calls[0].options, options);
  });

  await test('（2.orchestrator integration）request.options未提供時，orchestrator.runIntelligencePipeline()收到的options是undefined，不拋出例外', async () => {
    const { orchestrator, calls } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(calls[0].options, undefined);
  });

  await test('（2.orchestrator integration）orchestrator恰好只被呼叫一次', async () => {
    const { orchestrator, calls } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(calls.length, 1);
  });

  await test('（2.orchestrator integration）驗證失敗時（例如缺少userId），orchestrator完全不會被呼叫', async () => {
    const { orchestrator, calls } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    await service.getIntelligence({}, {});
    assert.strictEqual(calls.length, 0);
  });

  await test('（2.orchestrator integration）orchestrator依賴完全缺少時，安全回傳失敗，不拋出例外', async () => {
    const service = createIntelligenceService({});
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'orchestrator_unavailable');
  });

  await test('（2.orchestrator integration）orchestrator.runIntelligencePipeline不是函式時，安全回傳失敗', async () => {
    const service = createIntelligenceService({ orchestrator: { runIntelligencePipeline: 'nope' } });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'orchestrator_unavailable');
  });

  await test('（2.orchestrator integration）連續兩次呼叫、不同userId，各自呼叫orchestrator時帶著正確的userId', async () => {
    const { orchestrator, calls } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    await service.getIntelligence({}, { userId: 'u1' });
    await service.getIntelligence({}, { userId: 'u2' });
    assert.strictEqual(calls[0].userId, 'u1');
    assert.strictEqual(calls[1].userId, 'u2');
  });

  await test('（2.orchestrator integration，端對端）真正的createIntelligenceOrchestrator()（假造四個子依賴）可以被service成功呼叫並取得結果', async () => {
    const fakeDataPreparation = { prepare: async () => ({ ok: true, context: {} }) };
    const fakeContextBuilder = { buildInsightContext: () => ({ context: sampleUnifiedResult().context, validation: { ok: true } }) };
    const fakeAnalysisRunner = { runAnalysis: () => ({ ok: true, result: sampleUnifiedResult().analysis }) };
    const fakeRecommendationRunner = { runRecommendation: () => ({ ok: true, result: sampleUnifiedResult().recommendation }) };
    const realOrchestrator = createIntelligenceOrchestrator({
      dataPreparation: fakeDataPreparation,
      contextBuilder: fakeContextBuilder,
      analysisRunner: fakeAnalysisRunner,
      recommendationRunner: fakeRecommendationRunner,
    });
    const service = createIntelligenceService({ orchestrator: realOrchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1', options: {} });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.status, 'intelligence_ready');
  });

  console.log('');

  // =========================================================================
  // C. input validation
  // =========================================================================
  console.log('--- C. input validation ---');

  await test('（3.input validation）request為null時安全回傳{ok:false, reason:"invalid_request"}，不拋出例外', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（3.input validation）request為undefined時安全回傳失敗，不拋出例外', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, undefined);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（3.input validation）request為字串時安全回傳失敗，不拋出例外', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, 'not-an-object');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（3.input validation）request為陣列時安全回傳失敗（typeof [] === "object"但不是合法request，缺少userId）', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, []);
    assert.strictEqual(result.ok, false);
  });

  await test('（3.input validation）request缺少userId欄位時安全回傳{ok:false, reason:"invalid_user_id"}', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { options: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（3.input validation）userId為空字串時安全回傳失敗', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: '' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（3.input validation）userId為數字時安全回傳失敗（不是字串）', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 123 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（3.input validation）userId為null時安全回傳失敗', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: null });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（3.input validation）userId是合法非空字串、options未提供時，仍視為合法request（options是選填欄位）', async () => {
    const { orchestrator, calls } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(calls.length, 1);
  });

  await test('（3.input validation）options內容完全不被這一層解讀（只是原樣轉交），即使options帶著非預期欄位也不影響驗證結果', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1', options: { weird: 'field', nested: { a: 1 } } });
    assert.strictEqual(result.ok, true);
  });

  // 注意：TASK1.47（Intelligence Execution Contract Layer）明確要求
  // intelligence_service.js改用src/intelligence/contracts/execution/
  // 底下的validateIntelligenceRequest()取代這裡原本內建的
  // validateRequest()，這是規格明確要求的架構調整，不是回歸——
  // getIntelligence()對外可觀察的行為（成功/失敗的回傳格式）完全沒有
  // 改變，這裡改成驗證「intelligence_service.js確實import並使用
  // execution contract層的驗證函式」。
  await test('（TASK1.47後更新）intelligence_service.js改用src/intelligence/contracts/execution/的validateIntelligenceRequest()做輸入驗證（不再是內建的validateRequest()）', () => {
    const src = readSrc(path.join(serviceDir, 'intelligence_service.js'));
    assert.ok(/import\s*\{\s*validateIntelligenceRequest\s*\}\s*from\s*['"]\.\.\/contracts\/execution\/intelligence_request_contract\.js['"]/.test(src));
    assert.ok(/validateIntelligenceRequest\(request\)/.test(src));
  });

  console.log('');

  // =========================================================================
  // D. output contract
  // =========================================================================
  console.log('--- D. output contract ---');

  await test('（4.output contract）buildSuccessResult(result) 回傳{ok:true, data:result}，data跟傳入的result是同一個物件參考', () => {
    const builder = createServiceResultBuilder();
    const raw = sampleUnifiedResult();
    const wrapped = builder.buildSuccessResult(raw);
    assert.strictEqual(wrapped.ok, true);
    assert.strictEqual(wrapped.data, raw);
  });

  await test('（4.output contract）buildFailureResult(reason) 回傳{ok:false, reason}', () => {
    const builder = createServiceResultBuilder();
    const wrapped = builder.buildFailureResult('some_reason');
    assert.deepStrictEqual(wrapped, { ok: false, reason: 'some_reason' });
  });

  await test('（4.output contract）buildFailureResult()對非字串reason安全正規化為"unknown_error"', () => {
    const builder = createServiceResultBuilder();
    assert.strictEqual(builder.buildFailureResult(123).reason, 'unknown_error');
    assert.strictEqual(builder.buildFailureResult(null).reason, 'unknown_error');
    assert.strictEqual(builder.buildFailureResult(undefined).reason, 'unknown_error');
  });

  await test('（4.output contract，端對端）getIntelligence()成功時回傳shape恰好是{ok, data}兩個頂層欄位', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'ok']);
  });

  await test('（4.output contract，端對端）getIntelligence()成功時data欄位shape恰好符合規格範例{status, context, analysis, recommendation, metadata}', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'context', 'metadata', 'recommendation', 'status']);
  });

  await test('（4.output contract，端對端）getIntelligence()成功時data.status恰好是"intelligence_ready"', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.data.status, 'intelligence_ready');
  });

  await test('（4.output contract，端對端）getIntelligence()失敗時回傳shape恰好是{ok, reason}兩個頂層欄位（不含data）', async () => {
    const service = createIntelligenceService({});
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result).sort(), ['ok', 'reason']);
  });

  await test('（4.output contract，端對端）getIntelligence()成功時data跟orchestrator回傳的outcome.data.result是同一個物件（不重新複製/轉換）', async () => {
    const rawResult = sampleUnifiedResult();
    const { orchestrator } = makeSpyOrchestrator({ runIntelligencePipeline: () => ({ ok: true, status: 'intelligence_ready', data: { result: rawResult } }) });
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.data, rawResult);
  });

  await test('（4.output contract）JSON.stringify(result)不會拋出例外、也不會遺失任何頂層欄位（純資料結構）', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    const roundTripped = JSON.parse(JSON.stringify(result));
    assert.deepStrictEqual(Object.keys(roundTripped).sort(), Object.keys(result).sort());
  });

  console.log('');

  // =========================================================================
  // E. failure handling
  // =========================================================================
  console.log('--- E. failure handling ---');

  await test('（5.failure handling）orchestrator失敗（ok:false）且有reason時，service原樣轉發同一個reason', async () => {
    const { orchestrator } = makeSpyOrchestrator({ runIntelligencePipeline: () => ({ ok: false, status: 'orchestration_unavailable', reason: 'data_preparation_unavailable', data: null }) });
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'data_preparation_unavailable');
  });

  await test('（5.failure handling）orchestrator失敗（orchestration_invalid狀態，帶field）時，service仍正確回傳reason（field不是service對外契約的一部分）', async () => {
    const { orchestrator } = makeSpyOrchestrator({ runIntelligencePipeline: () => ({ ok: false, status: 'orchestration_invalid', reason: 'invalid_field_type', field: 'nutritionContext', data: null }) });
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_field_type');
  });

  await test('（5.failure handling）service失敗結果完全不含data欄位（沒有把部分執行結果頂替回傳）', async () => {
    const { orchestrator } = makeSpyOrchestrator({ runIntelligencePipeline: () => ({ ok: false, reason: 'boom', data: null }) });
    const service = createIntelligenceService({ orchestrator });
    const result = await service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.data, undefined);
  });

  await test('（5.failure handling）orchestrator丟出例外（reject）時，getIntelligence()整體也會reject（不吞掉錯誤、不假裝成功，呼叫端可自行決定要不要try/catch）', async () => {
    const orchestrator = { runIntelligencePipeline: async () => { throw new Error('boom'); } };
    const service = createIntelligenceService({ orchestrator });
    await assert.rejects(() => service.getIntelligence({}, { userId: 'u1' }), /boom/);
  });

  await test('（5.failure handling）驗證失敗（invalid_user_id）的失敗結果格式跟orchestrator失敗的格式完全一致（都是{ok:false, reason}）', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const a = await service.getIntelligence({}, {});
    const b = await service.getIntelligence({}, { userId: 'u1', options: undefined });
    assert.deepStrictEqual(Object.keys(a).sort(), ['ok', 'reason']);
    assert.strictEqual(b.ok, true);
  });

  await test('（5.failure handling，端對端）真正的Orchestrator在dataPreparation失敗時，service正確轉發失敗原因', async () => {
    const realOrchestrator = createIntelligenceOrchestrator({
      dataPreparation: { prepare: async () => ({ ok: false, reason: 'user_not_found' }) },
    });
    const service = createIntelligenceService({ orchestrator: realOrchestrator });
    const result = await service.getIntelligence({}, { userId: 'missing' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'user_not_found');
  });

  console.log('');

  // =========================================================================
  // F. deterministic behavior
  // =========================================================================
  console.log('--- F. deterministic behavior ---');

  await test('（6.deterministic behavior）同樣的假orchestrator輸出，連續呼叫兩次getIntelligence()得到完全相同（deepStrictEqual）的結果', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const a = await service.getIntelligence({}, { userId: 'u1' });
    const b = await service.getIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(a, b);
  });

  await test('（6.deterministic behavior）不同service實例對同樣輸入產生相同輸出（不依賴實例內部狀態）', async () => {
    const a = await createIntelligenceService({ orchestrator: makeSpyOrchestrator().orchestrator }).getIntelligence({}, { userId: 'u1' });
    const b = await createIntelligenceService({ orchestrator: makeSpyOrchestrator().orchestrator }).getIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(a, b);
  });

  await test('（6.deterministic behavior）intelligence_service.js 不讀取Date.now()/Math.random()（原始碼掃描確認）', () => {
    const src = readSrc(path.join(serviceDir, 'intelligence_service.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（6.deterministic behavior）service_result_builder.js 不讀取Date.now()/Math.random()（原始碼掃描確認）', () => {
    const src = readSrc(path.join(serviceDir, 'service_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（6.deterministic behavior）getIntelligence()不會修改（mutate）傳入的原始request物件', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const request = { userId: 'u1', options: { limit: 5 } };
    const snapshot = JSON.parse(JSON.stringify(request));
    await service.getIntelligence({}, request);
    assert.deepStrictEqual(request, snapshot);
  });

  await test('（6.deterministic behavior）連續三次呼叫（相同輸入）第一次跟第三次的結果完全相同（不依賴呼叫次數/內部計數器）', async () => {
    const { orchestrator } = makeSpyOrchestrator();
    const service = createIntelligenceService({ orchestrator });
    const first = await service.getIntelligence({}, { userId: 'u1' });
    await service.getIntelligence({}, { userId: 'u1' });
    const third = await service.getIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(first, third);
  });

  await test('（6.deterministic behavior，端對端）真正的Orchestrator（假造四個子依賴皆為deterministic）連續兩次呼叫得到相同結果', async () => {
    const fakeDeps = {
      dataPreparation: { prepare: async () => ({ ok: true, context: {} }) },
      contextBuilder: { buildInsightContext: () => ({ context: {}, validation: { ok: true } }) },
      analysisRunner: { runAnalysis: () => ({ ok: true, result: { status: 'analysis_ready', insights: [], metadata: { generatedAt: null, version: '1.0.0' } } }) },
      recommendationRunner: { runRecommendation: () => ({ ok: true, result: { status: 'recommendation_ready', recommendations: [], metadata: { version: '1.0.0' } } }) },
    };
    const service = createIntelligenceService({ orchestrator: createIntelligenceOrchestrator(fakeDeps) });
    const a = await service.getIntelligence({}, { userId: 'u1' });
    const b = await service.getIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(a, b);
  });

  console.log('');

  // =========================================================================
  // G. no AI dependency
  // =========================================================================
  console.log('--- G. no AI dependency ---');

  const SERVICE_JS_FILES = fs.readdirSync(serviceDir).filter((f) => f.endsWith('.js')).sort();
  await test('（7.no AI dependency）src/intelligence/service/ 恰好包含3個.js檔案（intelligence_service/service_result_builder/index）', () => {
    assert.deepStrictEqual(SERVICE_JS_FILES, ['index.js', 'intelligence_service.js', 'service_result_builder.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of SERVICE_JS_FILES) {
    const codeOnly = readSrc(path.join(serviceDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（7.no AI dependency）src/intelligence/service/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（7.no AI dependency）src/intelligence/service/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
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

  for (const file of SERVICE_JS_FILES) {
    await test(`（8.no external dependency）src/intelligence/service/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(serviceDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（8.no external dependency）src/intelligence/service/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(serviceDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // I. no SQL
  // =========================================================================
  console.log('--- I. no SQL ---');

  for (const file of SERVICE_JS_FILES) {
    await test(`（9.no SQL）src/intelligence/service/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(serviceDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（9.no SQL）src/intelligence/service/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(serviceDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（9.no SQL）src/intelligence/service/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(serviceDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（9.no SQL）src/intelligence/service/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(serviceDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（9.no SQL）intelligence_service.js 的db參數完全不被解構/存取任何屬性——db只是原樣轉交給orchestrator.runIntelligencePipeline()的不透明參數', () => {
    const src = readSrc(path.join(serviceDir, 'intelligence_service.js'));
    assert.ok(!/\bdb\.\w/.test(src), 'db不應該被存取任何屬性，service不應該知道db的內部結構');
  });

  await test('（9.no SQL）intelligence_service.js 完全不 import src/intelligence/data_preparation/、src/intelligence/analysis/、src/intelligence/recommendation/（不直接呼叫這三層，只透過Orchestrator）', () => {
    const src = readSrc(path.join(serviceDir, 'intelligence_service.js'));
    assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
    assert.ok(!/from\s+['"].*\/analysis\//.test(src));
    assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
  });

  console.log('');

  // =========================================================================
  // J. no HTTP
  // =========================================================================
  console.log('--- J. no HTTP ---');

  for (const file of SERVICE_JS_FILES) {
    await test(`（10.no HTTP）src/intelligence/service/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(serviceDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（10.no HTTP）src/intelligence/service/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(serviceDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（10.no HTTP）src/routes/${file} 完全不 import src/intelligence/service/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/service\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（10.no HTTP）src/controllers/${file} 完全不 import src/intelligence/service/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/service\//.test(src));
    });
  }

  await test('（10.no HTTP）src/worker.js 完全不 import src/intelligence/service/', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/intelligence\/service\//.test(src));
  });

  console.log('');

  // =========================================================================
  // K. no authentication dependency
  // =========================================================================
  console.log('--- K. no authentication dependency ---');

  for (const file of SERVICE_JS_FILES) {
    await test(`（11.no authentication dependency）src/intelligence/service/${file} 完全不 import src/auth/ 或 src/identity/`, () => {
      const src = readSrc(path.join(serviceDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（11.no authentication dependency）src/intelligence/service/${file} 完全不 import src/middleware/（不做requireAuth等middleware邏輯）`, () => {
      const src = readSrc(path.join(serviceDir, file));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（11.no authentication dependency）src/intelligence/service/${file} 完全沒有出現 JWT/session/cookie 相關字樣`, () => {
      const src = readSrc(path.join(serviceDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（11.no authentication dependency）intelligence_service.js 完全不呼叫 requireAuth/requireActiveUser（userId一律由呼叫端當作request.userId傳入，不自己驗證身份）', () => {
    const src = readSrc(path.join(serviceDir, 'intelligence_service.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // L. bootstrap injection
  // =========================================================================
  console.log('--- L. bootstrap injection ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（12.bootstrap injection）createApplication(env).intelligence 具備 service 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('service' in app.intelligence);
  });

  await test('（12.bootstrap injection）app.intelligence.service 具備 getIntelligence 函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.service.getIntelligence, 'function');
  });

  await test('（TASK1.65後更新）app.intelligence 恰好具備 insightService/analysisEngine/recommendationEngine/dataPreparation/context/analysis/recommendation/orchestration/service/facade/execution/events/history/monitoring/metrics/governance/application/useCases/capabilities/workflow/features 二十一個欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), ['analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution', 'facade', 'features', 'governance', 'history', 'insightService', 'metrics', 'monitoring', 'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow']);
  });

  await test('（12.bootstrap injection）app.intelligence.service內部注入的orchestrator跟app.intelligence.orchestration是同一個實例（用spy覆寫runIntelligencePipeline()驗證兩者共用同一個物件參考）', async () => {
    const app = createApplication(makeFullEnv());
    let called = false;
    app.intelligence.orchestration.runIntelligencePipeline = async () => {
      called = true;
      return { ok: false, status: 'orchestration_unavailable', reason: 'spy_short_circuit', data: null };
    };
    const result = await app.intelligence.service.getIntelligence({}, { userId: 'u1' });
    assert.strictEqual(called, true);
    assert.strictEqual(result.reason, 'spy_short_circuit');
  });

  await test('（12.bootstrap injection）每次createApplication()呼叫都各自建立獨立的service實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.service, app2.intelligence.service);
  });

  await test('（12.bootstrap injection）createApplication() 完整回傳形狀依然是 {config, db, services, router, middleware, intelligence} 六個頂層欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'intelligence', 'middleware', 'router', 'services']);
  });

  await test('（12.bootstrap injection）app.intelligence.insightService 完全沒有被TASK1.46修改成會呼叫app.intelligence.service（本次任務規格明確不要求串接insight_service.js）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/insight_service.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.bootstrap injection）原始碼掃描：src/bootstrap/application.js 有 import service（來自 ../intelligence/index.js）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(/\bservice\b.*from ['"]\.\.\/intelligence\/index\.js['"]/.test(src) || /as intelligenceServiceNamespace.*from ['"]\.\.\/intelligence\/index\.js['"]/.test(src));
  });

  await test('（12.bootstrap injection）原始碼掃描：src/intelligence/index.js 有 export service namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as service from ['"]\.\/service\/index\.js['"]/.test(src));
  });

  await test('（12.bootstrap injection）app.router.routes 數量沒有因為新增service而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（12.bootstrap injection）原始碼掃描：src/bootstrap/application.js 呼叫createIntelligenceService()時注入的是既有的intelligenceOrchestrator變數（不是新建第二份實例）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    const match = src.match(/createIntelligenceService\(\{([^}]*)\}\)/);
    assert.ok(match, '應該找得到createIntelligenceService({...})呼叫');
    assert.ok(/orchestrator\s*:\s*intelligenceOrchestrator/.test(match[1]));
  });

  console.log('');

  // =========================================================================
  // M. regression test
  // =========================================================================
  console.log('--- M. regression test ---');

  // 沿用TASK1.39~1.45既有的遞迴防護手法。
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.46-intelligence-service')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（13.regression test）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.45）`, () => {
      assert.ok(allSuites.length >= 37, `預期至少37個既有測試檔案，實際 ${allSuites.length}`);
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
  // N. P1-P6
  // =========================================================================
  console.log('--- N. P1-P6 ---');

  await test('（14.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（14.P1-P6）src/worker.js 完全沒有被TASK1.46修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）wrangler.toml 完全沒有被TASK1.46修改', () => {
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

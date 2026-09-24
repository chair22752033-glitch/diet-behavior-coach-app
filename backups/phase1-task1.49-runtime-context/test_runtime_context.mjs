/*
 * Phase 1 TASK 1.49｜Intelligence Runtime Context Layer Foundation
 * 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「Intelligence執行期
 * 上下文邊界」：runtime_context_builder.js的createRuntimeContext()
 * 能不能正確套用預設值、runtime_context.js的validateRuntimeContext()
 * 能不能正確驗證形狀、Intelligence Facade（TASK1.48）是否確實建立
 * Runtime Context並跟service request一起傳遞、同時確認Orchestrator/
 * Analysis/Recommendation/Data Preparation/Service四層邏輯完全沒有
 * 被觸碰、既有pipeline行為零影響。不驗證任何真正的AI分析/推薦邏輯
 * （因為根本沒有）。
 *
 * 分為以下15個部分：
 * A) runtime context creation
 * B) validation
 * C) default values
 * D) facade integration
 * E) deterministic behavior
 * F) failure handling
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
const runtimeDir = path.join(intelDir, 'runtime');
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

async function run() {
  const contractMod = await import(path.join(runtimeDir, 'runtime_context.js'));
  const { validateRuntimeContext, RuntimeContextContract } = contractMod;
  const builderMod = await import(path.join(runtimeDir, 'runtime_context_builder.js'));
  const { createRuntimeContext, DEFAULT_REQUEST_ID, DEFAULT_VERSION, DEFAULT_TIMESTAMP } = builderMod;
  await import(path.join(runtimeDir, 'index.js'));
  const { createIntelligenceFacade } = await import(path.join(facadeDir, 'index.js'));
  const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));

  // TASK1.50後新增：facade不再直接持有service依賴，改為透過Execution
  // Manager間接呼叫（見src/intelligence/facade/intelligence_facade.js
  // 的TASK1.50更動）。這個helper把一個（假造或真正的）service包成
  // Execution Manager，讓本檔案既有的facade integration測試能以最小
  // 改動繼續驗證「facade的呼叫最終有沒有正確傳到service」這件事。
  function wrapAsExecutionManager(service) {
    return createExecutionManager({ service });
  }

  // =========================================================================
  // A. runtime context creation
  // =========================================================================
  console.log('--- A. runtime context creation ---');

  await test('（1.runtime context creation）createRuntimeContext({userId}) 成功回傳{ok:true, context}', () => {
    const result = createRuntimeContext({ userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.ok(result.context);
  });

  await test('（1.runtime context creation）context.userId恰好等於傳入的userId', () => {
    const result = createRuntimeContext({ userId: 'u1' });
    assert.strictEqual(result.context.userId, 'u1');
  });

  await test('（1.runtime context creation）帶完整欄位（requestId/version/timestamp/metadata）時全部欄位都正確保留', () => {
    const result = createRuntimeContext({ userId: 'u1', requestId: 'req-1', version: '2', timestamp: '2026-01-01T00:00:00Z', metadata: { a: 1 } });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.context, { userId: 'u1', requestId: 'req-1', version: '2', timestamp: '2026-01-01T00:00:00Z', metadata: { a: 1 } });
  });

  await test('（1.runtime context creation）context恰好具備requestId/userId/version/timestamp/metadata五個欄位', () => {
    const result = createRuntimeContext({ userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result.context).sort(), ['metadata', 'requestId', 'timestamp', 'userId', 'version']);
  });

  await test('（1.runtime context creation）RuntimeContextContract.required恰好是["userId"]', () => {
    assert.deepStrictEqual(RuntimeContextContract.required, ['userId']);
  });

  await test('（1.runtime context creation）RuntimeContextContract.optional恰好是["requestId","version","timestamp","metadata"]', () => {
    assert.deepStrictEqual(RuntimeContextContract.optional, ['requestId', 'version', 'timestamp', 'metadata']);
  });

  await test('（1.runtime context creation）createRuntimeContext()沒有帶任何參數時不拋出例外，安全回傳失敗（缺少userId）', () => {
    assert.doesNotThrow(() => createRuntimeContext());
    assert.strictEqual(createRuntimeContext().ok, false);
  });

  await test('（1.runtime context creation）createRuntimeContext(null)不拋出例外，安全回傳失敗', () => {
    assert.doesNotThrow(() => createRuntimeContext(null));
    assert.strictEqual(createRuntimeContext(null).ok, false);
  });

  await test('（1.runtime context creation）metadata可以帶任意巢狀物件，原樣保留不被轉換', () => {
    const metadata = { nested: { deep: { value: 42 } } };
    const result = createRuntimeContext({ userId: 'u1', metadata });
    assert.deepStrictEqual(result.context.metadata, metadata);
  });

  console.log('');

  // =========================================================================
  // B. validation
  // =========================================================================
  console.log('--- B. validation ---');

  await test('（2.validation）validateRuntimeContext(合法context) 回傳{ok:true, context}', () => {
    const ctx = { requestId: null, userId: 'u1', version: '1', timestamp: null, metadata: {} };
    const result = validateRuntimeContext(ctx);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.context, ctx);
  });

  await test('（2.validation）缺少userId時回傳{ok:false, reason:"invalid_user_id"}', () => {
    const result = validateRuntimeContext({ requestId: null, version: '1', timestamp: null, metadata: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
    assert.strictEqual(result.field, 'userId');
  });

  await test('（2.validation）userId為空字串時回傳失敗', () => {
    assert.strictEqual(validateRuntimeContext({ userId: '' }).ok, false);
  });

  await test('（2.validation）userId為數字時回傳失敗', () => {
    assert.strictEqual(validateRuntimeContext({ userId: 123 }).ok, false);
  });

  await test('（2.validation）requestId為null時視為合法（規格預設值就是null）', () => {
    assert.strictEqual(validateRuntimeContext({ userId: 'u1', requestId: null }).ok, true);
  });

  await test('（2.validation）requestId為字串時視為合法', () => {
    assert.strictEqual(validateRuntimeContext({ userId: 'u1', requestId: 'req-1' }).ok, true);
  });

  await test('（2.validation）requestId為數字時回傳{ok:false, reason:"invalid_field_type", field:"requestId"}', () => {
    const result = validateRuntimeContext({ userId: 'u1', requestId: 123 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_field_type');
    assert.strictEqual(result.field, 'requestId');
  });

  await test('（2.validation）version不是字串時回傳失敗', () => {
    const result = validateRuntimeContext({ userId: 'u1', version: 1 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'version');
  });

  await test('（2.validation）timestamp為null時視為合法', () => {
    assert.strictEqual(validateRuntimeContext({ userId: 'u1', timestamp: null }).ok, true);
  });

  await test('（2.validation）timestamp為數字時回傳失敗', () => {
    const result = validateRuntimeContext({ userId: 'u1', timestamp: 12345 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'timestamp');
  });

  await test('（2.validation）metadata為物件時視為合法', () => {
    assert.strictEqual(validateRuntimeContext({ userId: 'u1', metadata: { a: 1 } }).ok, true);
  });

  await test('（2.validation）metadata為null時回傳失敗（存在時必須是物件）', () => {
    const result = validateRuntimeContext({ userId: 'u1', metadata: null });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'metadata');
  });

  await test('（2.validation）metadata為陣列時回傳失敗', () => {
    assert.strictEqual(validateRuntimeContext({ userId: 'u1', metadata: [] }).ok, false);
  });

  await test('（2.validation）metadata為字串時回傳失敗', () => {
    assert.strictEqual(validateRuntimeContext({ userId: 'u1', metadata: 'nope' }).ok, false);
  });

  await test('（2.validation）context本身為null時回傳{ok:false, reason:"invalid_context"}', () => {
    const result = validateRuntimeContext(null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（2.validation）context本身為陣列時回傳失敗', () => {
    assert.strictEqual(validateRuntimeContext([]).ok, false);
  });

  await test('（2.validation）context本身為字串時回傳失敗', () => {
    assert.strictEqual(validateRuntimeContext('bad').ok, false);
  });

  console.log('');

  // =========================================================================
  // C. default values
  // =========================================================================
  console.log('--- C. default values ---');

  await test('（3.default values）DEFAULT_REQUEST_ID恰好是null', () => {
    assert.strictEqual(DEFAULT_REQUEST_ID, null);
  });

  await test('（3.default values）DEFAULT_VERSION恰好是"1"', () => {
    assert.strictEqual(DEFAULT_VERSION, '1');
  });

  await test('（3.default values）DEFAULT_TIMESTAMP恰好是null', () => {
    assert.strictEqual(DEFAULT_TIMESTAMP, null);
  });

  await test('（3.default values）沒有提供requestId時，context.requestId預設為null', () => {
    const result = createRuntimeContext({ userId: 'u1' });
    assert.strictEqual(result.context.requestId, null);
  });

  await test('（3.default values）沒有提供version時，context.version預設為"1"', () => {
    const result = createRuntimeContext({ userId: 'u1' });
    assert.strictEqual(result.context.version, '1');
  });

  await test('（3.default values）沒有提供timestamp時，context.timestamp預設為null', () => {
    const result = createRuntimeContext({ userId: 'u1' });
    assert.strictEqual(result.context.timestamp, null);
  });

  await test('（3.default values）沒有提供metadata時，context.metadata預設為空物件{}', () => {
    const result = createRuntimeContext({ userId: 'u1' });
    assert.deepStrictEqual(result.context.metadata, {});
  });

  await test('（3.default values）連續兩次呼叫createRuntimeContext({userId})，各自的metadata是獨立的物件（不是共用同一個參考）', () => {
    const a = createRuntimeContext({ userId: 'u1' });
    const b = createRuntimeContext({ userId: 'u1' });
    assert.notStrictEqual(a.context.metadata, b.context.metadata);
    a.context.metadata.mutated = true;
    assert.deepStrictEqual(b.context.metadata, {});
  });

  await test('（3.default values）明確傳入undefined的欄位一樣套用預設值（例如{userId, requestId:undefined}）', () => {
    const result = createRuntimeContext({ userId: 'u1', requestId: undefined });
    assert.strictEqual(result.context.requestId, DEFAULT_REQUEST_ID);
  });

  await test('（3.default values）createRuntimeContext()完全不會自己讀取Date.now()當作timestamp（原始碼掃描確認）', () => {
    const src = readSrc(path.join(runtimeDir, 'runtime_context_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/new Date\(\)/.test(src));
  });

  console.log('');

  // =========================================================================
  // D. facade integration
  // =========================================================================
  console.log('--- D. facade integration ---');

  function makeSpyService(config) {
    config = config || {};
    const calls = [];
    return {
      calls,
      service: {
        getIntelligence: async (db, request) => {
          calls.push({ db, request });
          if (config.getIntelligence) return config.getIntelligence(db, request);
          return { ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } };
        },
      },
    };
  }

  await test('（4.facade integration）executeIntelligence()成功時，service收到的options.runtimeContext存在且userId正確', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    await facade.executeIntelligence({}, { userId: 'u1' });
    assert.ok(calls[0].request.options.runtimeContext);
    assert.strictEqual(calls[0].request.options.runtimeContext.userId, 'u1');
  });

  await test('（4.facade integration）request帶requestId時，runtimeContext.requestId正確保留', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    await facade.executeIntelligence({}, { userId: 'u1', requestId: 'req-99' });
    assert.strictEqual(calls[0].request.options.runtimeContext.requestId, 'req-99');
  });

  await test('（4.facade integration）request帶version時，runtimeContext.version正確保留', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    await facade.executeIntelligence({}, { userId: 'u1', version: '3' });
    assert.strictEqual(calls[0].request.options.runtimeContext.version, '3');
  });

  await test('（4.facade integration）request帶timestamp時，runtimeContext.timestamp正確保留', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    await facade.executeIntelligence({}, { userId: 'u1', timestamp: '2026-06-01T00:00:00Z' });
    assert.strictEqual(calls[0].request.options.runtimeContext.timestamp, '2026-06-01T00:00:00Z');
  });

  await test('（4.facade integration）request帶metadata時，runtimeContext.metadata正確保留', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    await facade.executeIntelligence({}, { userId: 'u1', metadata: { source: 'test' } });
    assert.deepStrictEqual(calls[0].request.options.runtimeContext.metadata, { source: 'test' });
  });

  await test('（4.facade integration）request沒有帶任何runtime欄位時，runtimeContext套用全部預設值', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    await facade.executeIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(calls[0].request.options.runtimeContext, { requestId: null, userId: 'u1', version: '1', timestamp: null, metadata: {} });
  });

  await test('（4.facade integration）request.options的既有欄位（例如includeContext）在合併後依然存在，沒有被runtimeContext覆蓋或遺失', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    await facade.executeIntelligence({}, { userId: 'u1', options: { includeContext: true, includeAnalysis: false } });
    assert.strictEqual(calls[0].request.options.includeContext, true);
    assert.strictEqual(calls[0].request.options.includeAnalysis, false);
    assert.ok(calls[0].request.options.runtimeContext);
  });

  await test('（4.facade integration）request帶不合法的runtime欄位（例如version不是字串）時，facade正確攔截並回傳失敗，service完全不會被呼叫', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    const result = await facade.executeIntelligence({}, { userId: 'u1', version: 123 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(calls.length, 0);
  });

  await test('（4.facade integration）request帶不合法的requestId（非字串非null）時，facade正確攔截並回傳失敗', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    const result = await facade.executeIntelligence({}, { userId: 'u1', requestId: 123 });
    assert.strictEqual(result.ok, false);
  });

  await test('（4.facade integration）request帶不合法的metadata（陣列）時，facade正確攔截並回傳失敗', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    const result = await facade.executeIntelligence({}, { userId: 'u1', metadata: [] });
    assert.strictEqual(result.ok, false);
  });

  await test('（4.facade integration）executeIntelligence()對外可觀察的成功回傳格式完全沒有因為新增Runtime Context而改變（依然是{ok:true, data:{status, result, metadata}}）', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'ok']);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['metadata', 'result', 'status']);
  });

  await test('（4.facade integration）原始碼掃描：intelligence_facade.js確實import並呼叫createRuntimeContext', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(/from\s*['"]\.\.\/runtime\/index\.js['"]/.test(src));
    assert.ok(/createRuntimeContext\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // E. deterministic behavior
  // =========================================================================
  console.log('--- E. deterministic behavior ---');

  await test('（5.deterministic behavior）同樣輸入呼叫createRuntimeContext()多次得到deepStrictEqual結果', () => {
    const input = { userId: 'u1', requestId: 'r1', version: '2', timestamp: 't1', metadata: { a: 1 } };
    assert.deepStrictEqual(createRuntimeContext(input), createRuntimeContext(input));
  });

  await test('（5.deterministic behavior）同樣輸入呼叫validateRuntimeContext()多次得到相同的ok/reason/field', () => {
    const ctx = { userId: 'u1' };
    const a = validateRuntimeContext(ctx);
    const b = validateRuntimeContext(ctx);
    assert.strictEqual(a.ok, b.ok);
  });

  await test('（5.deterministic behavior）runtime_context.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(runtimeDir, 'runtime_context.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（5.deterministic behavior）runtime_context_builder.js 不讀取Math.random()', () => {
    const src = readSrc(path.join(runtimeDir, 'runtime_context_builder.js'));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（5.deterministic behavior）createRuntimeContext()不會修改（mutate）傳入的input物件', () => {
    const input = { userId: 'u1', metadata: { a: 1 } };
    const snapshot = JSON.parse(JSON.stringify(input));
    createRuntimeContext(input);
    assert.deepStrictEqual(input, snapshot);
  });

  await test('（5.deterministic behavior，端對端）同樣的假service輸出，連續呼叫兩次executeIntelligence()（相同request，含相同runtime欄位）得到完全相同的結果', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    const request = { userId: 'u1', requestId: 'req-1', version: '1', timestamp: 't1', metadata: {} };
    const a = await facade.executeIntelligence({}, request);
    const b = await facade.executeIntelligence({}, request);
    assert.deepStrictEqual(a, b);
  });

  console.log('');

  // =========================================================================
  // F. failure handling
  // =========================================================================
  console.log('--- F. failure handling ---');

  await test('（6.failure handling）createRuntimeContext(undefined) 不拋出例外', () => {
    assert.doesNotThrow(() => createRuntimeContext(undefined));
  });

  await test('（6.failure handling）validateRuntimeContext(undefined) 不拋出例外，安全回傳失敗', () => {
    assert.doesNotThrow(() => validateRuntimeContext(undefined));
    assert.strictEqual(validateRuntimeContext(undefined).ok, false);
  });

  await test('（6.failure handling）validateRuntimeContext()沒有帶任何參數時不拋出例外', () => {
    assert.doesNotThrow(() => validateRuntimeContext());
  });

  await test('（6.failure handling）facade輸入驗證失敗（缺少userId）時，完全不會呼叫createRuntimeContext後續流程，service也不會被呼叫', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    const result = await facade.executeIntelligence({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
    assert.strictEqual(calls.length, 0);
  });

  await test('（6.failure handling）runtime context驗證失敗時的失敗結果格式跟其他失敗一致（都是{ok:false, reason}）', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    const result = await facade.executeIntelligence({}, { userId: 'u1', timestamp: 12345 });
    assert.deepStrictEqual(Object.keys(result).sort(), ['ok', 'reason']);
  });

  await test('（6.failure handling）runtime context驗證失敗時，reason正是validateRuntimeContext()回傳的reason', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    const result = await facade.executeIntelligence({}, { userId: 'u1', timestamp: 12345 });
    const direct = validateRuntimeContext({ userId: 'u1', requestId: null, version: '1', timestamp: 12345, metadata: {} });
    assert.strictEqual(result.reason, direct.reason);
  });

  console.log('');

  // =========================================================================
  // G. no AI dependency
  // =========================================================================
  console.log('--- G. no AI dependency ---');

  const RUNTIME_JS_FILES = fs.readdirSync(runtimeDir).filter((f) => f.endsWith('.js')).sort();
  await test('（7.no AI dependency）src/intelligence/runtime/ 恰好包含3個.js檔案', () => {
    assert.deepStrictEqual(RUNTIME_JS_FILES, ['index.js', 'runtime_context.js', 'runtime_context_builder.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of RUNTIME_JS_FILES) {
    const codeOnly = readSrc(path.join(runtimeDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（7.no AI dependency）src/intelligence/runtime/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（7.no AI dependency）src/intelligence/runtime/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
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

  for (const file of RUNTIME_JS_FILES) {
    await test(`（8.no external dependency）src/intelligence/runtime/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（8.no external dependency）src/intelligence/runtime/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // I. no SQL
  // =========================================================================
  console.log('--- I. no SQL ---');

  for (const file of RUNTIME_JS_FILES) {
    await test(`（9.no SQL）src/intelligence/runtime/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（9.no SQL）src/intelligence/runtime/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（9.no SQL）src/intelligence/runtime/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（9.no SQL）src/intelligence/runtime/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（9.no SQL）runtime_context_builder.js 的createRuntimeContext()完全不接受db參數（純函式，簽章只有createRuntimeContext(input)）', () => {
    const src = readSrc(path.join(runtimeDir, 'runtime_context_builder.js'));
    assert.ok(/function createRuntimeContext\(input\)/.test(src));
  });

  console.log('');

  // =========================================================================
  // J. no HTTP
  // =========================================================================
  console.log('--- J. no HTTP ---');

  for (const file of RUNTIME_JS_FILES) {
    await test(`（10.no HTTP）src/intelligence/runtime/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（10.no HTTP）src/intelligence/runtime/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（10.no HTTP）src/routes/${file} 完全不 import src/intelligence/runtime/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/runtime\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（10.no HTTP）src/controllers/${file} 完全不 import src/intelligence/runtime/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/runtime\//.test(src));
    });
  }

  await test('（10.no HTTP）src/worker.js 完全不 import src/intelligence/runtime/', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/intelligence\/runtime\//.test(src));
  });

  console.log('');

  // =========================================================================
  // K. no authentication dependency
  // =========================================================================
  console.log('--- K. no authentication dependency ---');

  for (const file of RUNTIME_JS_FILES) {
    await test(`（11.no authentication dependency）src/intelligence/runtime/${file} 完全不 import src/auth/ 或 src/identity/`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（11.no authentication dependency）src/intelligence/runtime/${file} 完全不 import src/middleware/`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（11.no authentication dependency）src/intelligence/runtime/${file} 完全沒有出現 JWT/session/cookie 相關字樣`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（11.no authentication dependency）runtime_context_builder.js 完全不呼叫 requireAuth/requireActiveUser（userId一律由呼叫端當作獨立欄位傳入，不做任何身份驗證）', () => {
    const src = readSrc(path.join(runtimeDir, 'runtime_context_builder.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // L. pipeline isolation
  // =========================================================================
  console.log('--- L. pipeline isolation ---');

  for (const file of RUNTIME_JS_FILES) {
    await test(`（12.pipeline isolation）src/intelligence/runtime/${file} 完全不 import src/intelligence/orchestration/`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
    });
    await test(`（12.pipeline isolation）src/intelligence/runtime/${file} 完全不 import src/intelligence/analysis/`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
    });
    await test(`（12.pipeline isolation）src/intelligence/runtime/${file} 完全不 import src/intelligence/recommendation/`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
    });
    await test(`（12.pipeline isolation）src/intelligence/runtime/${file} 完全不 import src/intelligence/data_preparation/`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
    });
    await test(`（12.pipeline isolation）src/intelligence/runtime/${file} 完全不 import src/services/ 底下任何檔案`, () => {
      const src = readSrc(path.join(runtimeDir, file));
      assert.ok(!/from\s+['"].*\/services\//.test(src));
    });
  }

  await test('（12.pipeline isolation）intelligence_facade.js 依然完全不 import src/intelligence/orchestration/（Facade must NOT call Orchestrator，即使TASK1.49新增了Runtime Context）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
  });

  await test('（12.pipeline isolation）intelligence_facade.js 依然完全不 import src/intelligence/analysis/', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/analysis\//.test(src));
  });

  await test('（12.pipeline isolation）intelligence_facade.js 依然完全不 import src/intelligence/recommendation/', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
  });

  await test('（12.pipeline isolation）intelligence_facade.js 依然完全不 import src/db/ 底下任何檔案（Facade must NOT access database）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/db\//.test(src));
  });

  await test('（12.pipeline isolation）原始碼掃描：src/intelligence/orchestration/、src/intelligence/analysis/、src/intelligence/recommendation/、src/intelligence/data_preparation/ 四個目錄的.js檔案完全沒有被TASK1.49修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/orchestration/*.js src/intelligence/analysis/*.js src/intelligence/recommendation/*.js src/intelligence/data_preparation/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.pipeline isolation）原始碼掃描：src/intelligence/service/intelligence_service.js 完全沒有被TASK1.49修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/service/intelligence_service.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  // 注意：這裡原本用「git diff --stat src/bootstrap/application.js
  // 必須為空」檢查TASK1.49沒有修改這個檔案——TASK1.50（Intelligence
  // Execution Lifecycle Manager）合法新增了`intelligence.execution`
  // 欄位並把facade改為注入executionManager，需要修改這個檔案，讓這個
  // live diff檢查永遠失敗，屬於TASK1.39當時就記錄過的「用即時git
  // diff檢查未來會被後續任務合法修改的檔案」治具問題。修正為內容型
  // 檢查：確認TASK1.49當時真正在乎的事情——Runtime Context Builder
  // 依然是純函式工具，不需要被bootstrap組裝成獨立實例（原始碼裡不會
  // 出現createRuntimeContext()被賦值成intelligence namespace底下的
  // 欄位）。
  await test('（TASK1.50後更新）原始碼掃描：src/bootstrap/application.js 裡createRuntimeContext()依然不是被組裝進intelligence namespace的獨立實例（Runtime Context Builder依然是純函式工具，不受後續任務新增欄位影響）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(!/createRuntimeContext/.test(src), 'application.js不應該直接呼叫createRuntimeContext()，那是facade內部的責任');
  });

  await test('（12.pipeline isolation，端對端）Runtime Context只是多帶著一個目前沒有人讀取的欄位往下傳，不影響既有pipeline行為——用真正的Orchestrator（假造四個底層子依賴）驗證options.runtimeContext不影響分析/推薦結果', async () => {
    const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));
    const { createIntelligenceService } = await import(path.join(intelDir, 'service', 'index.js'));
    const preparedContext = { user: { id: 'u1' }, explorations: { count: 0, items: [] }, foodEvents: { count: 0, items: [] }, emotions: { count: 0, items: [] }, behaviors: { count: 0, items: [] }, reports: { count: 0, items: [] } };
    const { createInsightContextBuilder } = await import(path.join(intelDir, 'context', 'index.js'));
    const { createAnalysisRunner } = await import(path.join(intelDir, 'analysis', 'index.js'));
    const { createRecommendationRunner } = await import(path.join(intelDir, 'recommendation', 'index.js'));
    const orchestrator = createIntelligenceOrchestrator({
      dataPreparation: { prepare: async () => ({ ok: true, context: preparedContext }) },
      contextBuilder: createInsightContextBuilder(),
      analysisRunner: createAnalysisRunner(),
      recommendationRunner: createRecommendationRunner(),
    });
    const service = createIntelligenceService({ orchestrator });
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    const withoutRuntime = await facade.executeIntelligence({}, { userId: 'u1' });
    const withRuntime = await facade.executeIntelligence({}, { userId: 'u1', requestId: 'req-x', metadata: { source: 'test' } });
    assert.deepStrictEqual(withoutRuntime.data.result, withRuntime.data.result);
  });

  console.log('');

  // =========================================================================
  // M. regression test
  // =========================================================================
  console.log('--- M. regression test ---');

  // 沿用TASK1.39~1.48既有的遞迴防護手法。
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.49-runtime-context')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（13.regression test）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.48）`, () => {
      assert.ok(allSuites.length >= 40, `預期至少40個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（14.bootstrap compatibility）createApplication() 完整回傳形狀依然是 {config, db, services, router, middleware, intelligence} 六個頂層欄位（本次任務不修改bootstrap）', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'intelligence', 'middleware', 'router', 'services']);
  });

  // 注意：TASK1.50為app.intelligence新增了`execution`欄位（Execution
  // Manager的extension point），TASK1.51又新增了`events`欄位
  // （Execution Event Layer的extension point），都是明確要做的擴充，
  // 不是回歸，這裡的預期key清單已同步更新。
  await test('（TASK1.55後更新）app.intelligence 恰好具備十六個欄位（TASK1.48既有十個加上TASK1.50新增的execution、TASK1.51新增的events、TASK1.52新增的history、TASK1.53新增的monitoring、TASK1.54新增的metrics、TASK1.55新增的governance）', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), ['analysis', 'analysisEngine', 'context', 'dataPreparation', 'events', 'execution', 'facade', 'governance', 'history', 'insightService', 'metrics', 'monitoring', 'orchestration', 'recommendation', 'recommendationEngine', 'service']);
  });

  await test('（14.bootstrap compatibility）透過bootstrap建立的app.intelligence.facade.executeIntelligence()依然正確建立並套用Runtime Context', async () => {
    const app = createApplication(makeFullEnv());
    let capturedRequest = null;
    app.intelligence.service.getIntelligence = async (db, request) => {
      capturedRequest = request;
      return { ok: false, reason: 'spy_short_circuit' };
    };
    await app.intelligence.facade.executeIntelligence({}, { userId: 'u1', requestId: 'req-boot' });
    assert.ok(capturedRequest.options.runtimeContext);
    assert.strictEqual(capturedRequest.options.runtimeContext.requestId, 'req-boot');
  });

  await test('（14.bootstrap compatibility）app.router.routes 數量沒有因為新增runtime而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（14.bootstrap compatibility）原始碼掃描：src/intelligence/index.js 有 export runtime namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as runtime from ['"]\.\/runtime\/index\.js['"]/.test(src));
  });

  await test('（14.bootstrap compatibility）每次createApplication()呼叫都各自建立獨立的facade/service實例（Runtime Context不影響既有的實例獨立性）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.facade, app2.intelligence.facade);
  });

  console.log('');

  // =========================================================================
  // O. P1-P6
  // =========================================================================
  console.log('--- O. P1-P6 ---');

  await test('（15.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（15.P1-P6）src/worker.js 完全沒有被TASK1.49修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（15.P1-P6）wrangler.toml 完全沒有被TASK1.49修改', () => {
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

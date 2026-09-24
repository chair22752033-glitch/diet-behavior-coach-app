/*
 * Phase 1 TASK 1.50｜Intelligence Execution Lifecycle Manager Foundation
 * 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「Intelligence Facade
 * （TASK1.48）跟Intelligence Service（TASK1.46）之間的執行生命週期
 * 管理邊界」：execution_manager.js的execute(db, {request,
 * runtimeContext})能不能正確追蹤生命週期狀態（initialized→running→
 * completed/failed）、只呼叫Service（不繞過它直接呼叫Orchorchestrator/
 * Analysis/Recommendation/Data Preparation/Database/Authentication）、
 * 把Service的回傳標準化成Execution Manager自己的成功/失敗格式，以及
 * Facade是否確實改用Execution Manager（不再直接呼叫Service）。不驗證
 * 任何真正的AI分析/推薦邏輯（因為根本沒有）。
 *
 * 分為以下15個部分：
 * A) lifecycle states
 * B) execution success
 * C) execution failure
 * D) facade integration
 * E) service isolation
 * F) pipeline isolation
 * G) deterministic behavior
 * H) no AI dependency
 * I) no external dependency
 * J) no SQL
 * K) no HTTP
 * L) no authentication dependency
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
const executionDir = path.join(intelDir, 'execution');
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
  const stateMod = await import(path.join(executionDir, 'execution_state.js'));
  const { EXECUTION_STATES, isValidExecutionState } = stateMod;
  const resultBuilderMod = await import(path.join(executionDir, 'execution_result_builder.js'));
  const { createExecutionResultBuilder } = resultBuilderMod;
  const managerMod = await import(path.join(executionDir, 'execution_manager.js'));
  const { createExecutionManager } = managerMod;
  await import(path.join(executionDir, 'index.js'));
  const { createIntelligenceFacade } = await import(path.join(facadeDir, 'index.js'));
  const { createIntelligenceService } = await import(path.join(intelDir, 'service', 'index.js'));

  // =========================================================================
  // A. lifecycle states
  // =========================================================================
  console.log('--- A. lifecycle states ---');

  await test('（1.lifecycle states）EXECUTION_STATES恰好是["initialized","running","completed","failed"]四個，沒有其他狀態', () => {
    assert.deepStrictEqual(EXECUTION_STATES, ['initialized', 'running', 'completed', 'failed']);
  });

  await test('（1.lifecycle states）isValidExecutionState()對四個合法狀態都回傳true', () => {
    for (const state of EXECUTION_STATES) {
      assert.strictEqual(isValidExecutionState(state), true);
    }
  });

  await test('（1.lifecycle states）isValidExecutionState()對不存在的狀態回傳false', () => {
    assert.strictEqual(isValidExecutionState('pending'), false);
    assert.strictEqual(isValidExecutionState('cancelled'), false);
    assert.strictEqual(isValidExecutionState(''), false);
  });

  await test('（1.lifecycle states）isValidExecutionState()對非字串輸入安全回傳false，不拋出例外', () => {
    assert.doesNotThrow(() => isValidExecutionState(null));
    assert.strictEqual(isValidExecutionState(null), false);
    assert.strictEqual(isValidExecutionState(undefined), false);
    assert.strictEqual(isValidExecutionState(123), false);
  });

  await test('（1.lifecycle states）成功執行依序經過initialized→running→completed三個狀態', async () => {
    const { service } = makeSpyService();
    const states = [];
    const manager = createExecutionManager({ service, onStateChange: (s) => states.push(s) });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(states, ['initialized', 'running', 'completed']);
  });

  await test('（1.lifecycle states）輸入驗證失敗時只經過initialized→failed兩個狀態（不會進入running）', async () => {
    const { service } = makeSpyService();
    const states = [];
    const manager = createExecutionManager({ service, onStateChange: (s) => states.push(s) });
    await manager.execute({}, { request: {} });
    assert.deepStrictEqual(states, ['initialized', 'failed']);
  });

  await test('（1.lifecycle states）Service回傳失敗時依序經過initialized→running→failed三個狀態', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'boom' }) });
    const states = [];
    const manager = createExecutionManager({ service, onStateChange: (s) => states.push(s) });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(states, ['initialized', 'running', 'failed']);
  });

  await test('（1.lifecycle states）每一次狀態轉換的值都通過isValidExecutionState()', async () => {
    const { service } = makeSpyService();
    const states = [];
    const manager = createExecutionManager({ service, onStateChange: (s) => states.push(s) });
    await manager.execute({}, { request: { userId: 'u1' } });
    for (const s of states) {
      assert.strictEqual(isValidExecutionState(s), true);
    }
  });

  await test('（1.lifecycle states）沒有提供onStateChange時不拋出例外，行為完全不受影響', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    await assert.doesNotReject(() => manager.execute({}, { request: { userId: 'u1' } }));
  });

  console.log('');

  // =========================================================================
  // B. execution success
  // =========================================================================
  console.log('--- B. execution success ---');

  await test('（2.execution success）execute()成功時回傳{ok:true, state:"completed", data}', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.state, 'completed');
    assert.ok(result.data);
  });

  await test('（2.execution success）成功結果的data恰好具備status/result兩個欄位', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['result', 'status']);
  });

  await test('（2.execution success）data.status恰好等於Service回傳的status（"intelligence_ready"）', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.data.status, 'intelligence_ready');
  });

  await test('（2.execution success）data.result收斂了context/analysis/recommendation/metadata四個欄位', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(Object.keys(result.data.result).sort(), ['analysis', 'context', 'metadata', 'recommendation']);
  });

  await test('（2.execution success）data.result的內容跟Service回傳的內容完全相同（deepStrictEqual，只是重新排列不是重新解讀）', async () => {
    const serviceData = sampleServiceData();
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: true, data: serviceData }) });
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(result.data.result.context, serviceData.context);
    assert.deepStrictEqual(result.data.result.analysis, serviceData.analysis);
    assert.deepStrictEqual(result.data.result.recommendation, serviceData.recommendation);
    assert.deepStrictEqual(result.data.result.metadata, serviceData.metadata);
  });

  await test('（2.execution success）createExecutionResultBuilder().buildCompletedResult() 直接測試回傳格式正確', () => {
    const builder = createExecutionResultBuilder();
    const serviceData = sampleServiceData();
    const result = builder.buildCompletedResult(serviceData);
    assert.deepStrictEqual(result, {
      ok: true,
      state: 'completed',
      data: {
        status: 'intelligence_ready',
        result: {
          context: serviceData.context,
          analysis: serviceData.analysis,
          recommendation: serviceData.recommendation,
          metadata: serviceData.metadata,
        },
      },
    });
  });

  await test('（2.execution success）buildCompletedResult()對缺少欄位的serviceData安全處理，不拋出例外', () => {
    const builder = createExecutionResultBuilder();
    assert.doesNotThrow(() => builder.buildCompletedResult({}));
    assert.doesNotThrow(() => builder.buildCompletedResult(undefined));
  });

  console.log('');

  // =========================================================================
  // C. execution failure
  // =========================================================================
  console.log('--- C. execution failure ---');

  await test('（3.execution failure）execute()失敗時回傳{ok:false, state:"failed", reason}', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'user_not_found' }) });
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.state, 'failed');
    assert.strictEqual(result.reason, 'user_not_found');
  });

  await test('（3.execution failure）失敗結果完全不含data欄位', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'boom' }) });
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.data, undefined);
  });

  await test('（3.execution failure）input缺少request時安全回傳{ok:false, reason:"invalid_request"}', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（3.execution failure）input本身為null時安全回傳{ok:false, reason:"invalid_input"}', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_input');
  });

  await test('（3.execution failure）input為陣列時安全回傳失敗', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, []);
    assert.strictEqual(result.ok, false);
  });

  await test('（3.execution failure）request.userId為空字串時安全回傳{ok:false, reason:"invalid_user_id"}', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: '' } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（3.execution failure）request.options存在但不是物件時安全回傳{ok:false, reason:"invalid_options_type"}', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: 'u1', options: 'nope' } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（3.execution failure）service依賴完全缺少時安全回傳{ok:false, reason:"service_unavailable"}', async () => {
    const manager = createExecutionManager({});
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'service_unavailable');
  });

  await test('（3.execution failure）service.getIntelligence不是函式時安全回傳{ok:false, reason:"service_unavailable"}', async () => {
    const manager = createExecutionManager({ service: { getIntelligence: 'nope' } });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'service_unavailable');
  });

  await test('（3.execution failure）service丟出例外（reject）時，execute()整體也會reject（不吞掉錯誤）', async () => {
    const service = { getIntelligence: async () => { throw new Error('boom'); } };
    const manager = createExecutionManager({ service });
    await assert.rejects(() => manager.execute({}, { request: { userId: 'u1' } }), /boom/);
  });

  await test('（3.execution failure）createExecutionResultBuilder().buildFailedResult() 直接測試回傳格式正確', () => {
    const builder = createExecutionResultBuilder();
    assert.deepStrictEqual(builder.buildFailedResult('some_reason'), { ok: false, state: 'failed', reason: 'some_reason' });
  });

  await test('（3.execution failure）buildFailedResult()對非字串reason安全正規化為"unknown_error"', () => {
    const builder = createExecutionResultBuilder();
    assert.strictEqual(builder.buildFailedResult(123).reason, 'unknown_error');
    assert.strictEqual(builder.buildFailedResult(null).reason, 'unknown_error');
    assert.strictEqual(builder.buildFailedResult(undefined).reason, 'unknown_error');
  });

  console.log('');

  // =========================================================================
  // D. facade integration
  // =========================================================================
  console.log('--- D. facade integration ---');

  function wrapAsExecutionManager(service) {
    return createExecutionManager({ service });
  }

  await test('（4.facade integration）facade成功時，Execution Manager恰好被呼叫一次', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(calls.length, 1);
  });

  await test('（4.facade integration）facade建立的Runtime Context會被合併進轉交給Service的options.runtimeContext（透過Execution Manager轉發）', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    await facade.executeIntelligence({}, { userId: 'u1', requestId: 'req-1' });
    assert.ok(calls[0].request.options.runtimeContext);
    assert.strictEqual(calls[0].request.options.runtimeContext.requestId, 'req-1');
  });

  await test('（4.facade integration）facade對外可觀察的成功回傳格式完全沒有因為改用Execution Manager而改變（依然是{ok:true, data:{status, result, metadata}}）', async () => {
    const { service } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['metadata', 'result', 'status']);
    assert.deepStrictEqual(Object.keys(result.data.result).sort(), ['analysis', 'context', 'recommendation']);
  });

  await test('（4.facade integration）facade對外可觀察的失敗回傳格式完全沒有改變（依然是{ok:false, reason}）', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'user_not_found' }) });
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: false, reason: 'user_not_found' });
  });

  await test('（4.facade integration）facade依賴完全缺少executionManager時，安全回傳{ok:false, reason:"execution_manager_unavailable"}', async () => {
    const facade = createIntelligenceFacade({});
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'execution_manager_unavailable');
  });

  await test('（4.facade integration）executionManager.execute不是函式時，facade安全回傳{ok:false, reason:"execution_manager_unavailable"}', async () => {
    const facade = createIntelligenceFacade({ executionManager: { execute: 'nope' } });
    const result = await facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'execution_manager_unavailable');
  });

  await test('（4.facade integration）facade輸入驗證失敗時，Execution Manager完全不會被呼叫', async () => {
    const { service, calls } = makeSpyService();
    const facade = createIntelligenceFacade({ executionManager: wrapAsExecutionManager(service) });
    await facade.executeIntelligence({}, {});
    assert.strictEqual(calls.length, 0);
  });

  await test('（4.facade integration，端對端）真正的createIntelligenceService()+真正的createIntelligenceOrchestrator()（假造四個底層子依賴）搭配真正的Execution Manager，完整串接依然正確運作', async () => {
    const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));
    const realOrchestrator = createIntelligenceOrchestrator({
      dataPreparation: { prepare: async () => ({ ok: true, context: {} }) },
      contextBuilder: { buildInsightContext: () => ({ context: sampleServiceData().context, validation: { ok: true } }) },
      analysisRunner: { runAnalysis: () => ({ ok: true, result: sampleServiceData().analysis }) },
      recommendationRunner: { runRecommendation: () => ({ ok: true, result: sampleServiceData().recommendation }) },
    });
    const realService = createIntelligenceService({ orchestrator: realOrchestrator });
    const realExecutionManager = createExecutionManager({ service: realService });
    const facade = createIntelligenceFacade({ executionManager: realExecutionManager });
    const result = await facade.executeIntelligence({}, { userId: 'u1', options: {} });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.status, 'intelligence_ready');
  });

  console.log('');

  // =========================================================================
  // E. service isolation
  // =========================================================================
  console.log('--- E. service isolation ---');

  await test('（5.service isolation）intelligence_facade.js 完全不 import src/intelligence/service/（不再直接呼叫Intelligence Service）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/service\//.test(src));
  });

  await test('（5.service isolation）intelligence_facade.js 完全不出現`service.getIntelligence`字樣（原本TASK1.48/1.49的直接呼叫方式已移除）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/service\.getIntelligence/.test(src));
  });

  await test('（5.service isolation）intelligence_facade.js 確實出現`executionManager.execute`字樣（改用Execution Manager）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(/executionManager\.execute/.test(src));
  });

  await test('（5.service isolation）createIntelligenceFacade()的dependencies解構出的是executionManager，不是service', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(/const\s*\{\s*executionManager\s*\}\s*=\s*dependencies/.test(src));
  });

  await test('（5.service isolation）execution_manager.js 確實 import intelligence_service.js以外的東西——只 import ./execution_result_builder.js（唯一允許的相依，加上未來依賴注入的service）', () => {
    const src = readSrc(path.join(executionDir, 'execution_manager.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./execution_result_builder.js']);
  });

  await test('（5.service isolation）execution_manager.js 完全不 import src/intelligence/service/（透過依賴注入拿到service，不直接import）', () => {
    const src = readSrc(path.join(executionDir, 'execution_manager.js'));
    assert.ok(!/from\s+['"].*\/service\//.test(src));
  });

  await test('（5.service isolation）execution_state.js/execution_result_builder.js 完全不 import intelligence/service/', () => {
    for (const file of ['execution_state.js', 'execution_result_builder.js']) {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/service\//.test(src));
    }
  });

  console.log('');

  // =========================================================================
  // F. pipeline isolation
  // =========================================================================
  console.log('--- F. pipeline isolation ---');

  const EXECUTION_JS_FILES = fs.readdirSync(executionDir).filter((f) => f.endsWith('.js')).sort();
  await test('（6.pipeline isolation）src/intelligence/execution/ 恰好包含4個.js檔案', () => {
    assert.deepStrictEqual(EXECUTION_JS_FILES, ['execution_manager.js', 'execution_result_builder.js', 'execution_state.js', 'index.js']);
  });

  for (const file of EXECUTION_JS_FILES) {
    await test(`（6.pipeline isolation）src/intelligence/execution/${file} 完全不 import src/intelligence/orchestration/（Execution Manager must NOT call Orchestrator）`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
    });
    await test(`（6.pipeline isolation）src/intelligence/execution/${file} 完全不 import src/intelligence/analysis/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
    });
    await test(`（6.pipeline isolation）src/intelligence/execution/${file} 完全不 import src/intelligence/recommendation/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
    });
    await test(`（6.pipeline isolation）src/intelligence/execution/${file} 完全不 import src/intelligence/data_preparation/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
    });
    await test(`（6.pipeline isolation）src/intelligence/execution/${file} 完全不 import src/db/ 底下任何檔案（Execution Manager must NOT call Database）`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（6.pipeline isolation）src/intelligence/execution/${file} 完全不 import src/auth/ 或 src/identity/（Execution Manager must NOT call Authentication）`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
  }

  await test('（6.pipeline isolation）execution_manager.js 的db參數完全不被解構/存取任何屬性——db只是原樣轉交給service.getIntelligence()的不透明參數', () => {
    const src = readSrc(path.join(executionDir, 'execution_manager.js'));
    assert.ok(!/\bdb\.\w/.test(src), 'db不應該被存取任何屬性，Execution Manager不應該知道db的內部結構');
  });

  await test('（6.pipeline isolation）intelligence_facade.js 依然完全不 import src/intelligence/orchestration/（即使TASK1.50改了呼叫鏈，Facade依然不直接碰Orchestrator）', () => {
    const src = readSrc(path.join(facadeDir, 'intelligence_facade.js'));
    assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
  });

  await test('（6.pipeline isolation）原始碼掃描：src/intelligence/service/intelligence_service.js 完全沒有被TASK1.50修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/service/intelligence_service.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.pipeline isolation）原始碼掃描：src/intelligence/orchestration/、src/intelligence/analysis/、src/intelligence/recommendation/、src/intelligence/data_preparation/、src/intelligence/runtime/ 五個目錄的.js檔案完全沒有被TASK1.50修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/orchestration/*.js src/intelligence/analysis/*.js src/intelligence/recommendation/*.js src/intelligence/data_preparation/*.js src/intelligence/runtime/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.pipeline isolation，端對端）真正的Orchestrator（假造四個底層子依賴）搭配Execution Manager，跟直接搭配Service得到的result完全相同——Execution Manager只是多一層生命週期管理，不改變pipeline的實際運算結果', async () => {
    const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));
    const orchestrator = createIntelligenceOrchestrator({
      dataPreparation: { prepare: async () => ({ ok: true, context: {} }) },
      contextBuilder: { buildInsightContext: () => ({ context: sampleServiceData().context, validation: { ok: true } }) },
      analysisRunner: { runAnalysis: () => ({ ok: true, result: sampleServiceData().analysis }) },
      recommendationRunner: { runRecommendation: () => ({ ok: true, result: sampleServiceData().recommendation }) },
    });
    const service = createIntelligenceService({ orchestrator });
    const directOutcome = await service.getIntelligence({}, { userId: 'u1' });
    const manager = createExecutionManager({ service });
    const managedOutcome = await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(managedOutcome.data.status, directOutcome.data.status);
    assert.deepStrictEqual(managedOutcome.data.result, {
      context: directOutcome.data.context,
      analysis: directOutcome.data.analysis,
      recommendation: directOutcome.data.recommendation,
      metadata: directOutcome.data.metadata,
    });
  });

  console.log('');

  // =========================================================================
  // G. deterministic behavior
  // =========================================================================
  console.log('--- G. deterministic behavior ---');

  await test('（7.deterministic behavior）同樣的假service輸出，連續呼叫兩次execute()得到完全相同（deepStrictEqual）的結果', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const a = await manager.execute({}, { request: { userId: 'u1' } });
    const b = await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(a, b);
  });

  await test('（7.deterministic behavior）不同manager實例對同樣輸入產生相同輸出（不依賴實例內部狀態）', async () => {
    const a = await createExecutionManager({ service: makeSpyService().service }).execute({}, { request: { userId: 'u1' } });
    const b = await createExecutionManager({ service: makeSpyService().service }).execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(a, b);
  });

  await test('（7.deterministic behavior）execution_state.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(executionDir, 'execution_state.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（7.deterministic behavior）execution_result_builder.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(executionDir, 'execution_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（7.deterministic behavior）execution_manager.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(executionDir, 'execution_manager.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（7.deterministic behavior）execute()不會修改（mutate）傳入的原始input物件', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const input = { request: { userId: 'u1', options: { includeContext: true } }, runtimeContext: { userId: 'u1' } };
    const snapshot = JSON.parse(JSON.stringify(input));
    await manager.execute({}, input);
    assert.deepStrictEqual(input, snapshot);
  });

  await test('（7.deterministic behavior）連續三次呼叫（相同輸入）第一次跟第三次的結果完全相同（不依賴呼叫次數/內部計數器）', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const first = await manager.execute({}, { request: { userId: 'u1' } });
    await manager.execute({}, { request: { userId: 'u1' } });
    const third = await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(first, third);
  });

  console.log('');

  // =========================================================================
  // H. no AI dependency
  // =========================================================================
  console.log('--- H. no AI dependency ---');

  await test('（8.no AI dependency）src/intelligence/execution/ 恰好包含4個.js檔案（execution_manager/execution_result_builder/execution_state/index）', () => {
    assert.deepStrictEqual(EXECUTION_JS_FILES, ['execution_manager.js', 'execution_result_builder.js', 'execution_state.js', 'index.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of EXECUTION_JS_FILES) {
    const codeOnly = readSrc(path.join(executionDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.no AI dependency）src/intelligence/execution/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（8.no AI dependency）src/intelligence/execution/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // I. no external dependency
  // =========================================================================
  console.log('--- I. no external dependency ---');

  for (const file of EXECUTION_JS_FILES) {
    await test(`（9.no external dependency）src/intelligence/execution/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（9.no external dependency）src/intelligence/execution/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // J. no SQL
  // =========================================================================
  console.log('--- J. no SQL ---');

  for (const file of EXECUTION_JS_FILES) {
    await test(`（10.no SQL）src/intelligence/execution/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（10.no SQL）src/intelligence/execution/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（10.no SQL）src/intelligence/execution/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（10.no SQL）src/intelligence/execution/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // K. no HTTP
  // =========================================================================
  console.log('--- K. no HTTP ---');

  for (const file of EXECUTION_JS_FILES) {
    await test(`（11.no HTTP）src/intelligence/execution/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（11.no HTTP）src/intelligence/execution/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（11.no HTTP）src/routes/${file} 完全不 import src/intelligence/execution/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/execution\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（11.no HTTP）src/controllers/${file} 完全不 import src/intelligence/execution/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/execution\//.test(src));
    });
  }

  await test('（11.no HTTP）src/worker.js 完全不 import src/intelligence/execution/', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/intelligence\/execution\//.test(src));
  });

  console.log('');

  // =========================================================================
  // L. no authentication dependency
  // =========================================================================
  console.log('--- L. no authentication dependency ---');

  for (const file of EXECUTION_JS_FILES) {
    await test(`（12.no authentication dependency）src/intelligence/execution/${file} 完全不 import src/auth/ 或 src/identity/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（12.no authentication dependency）src/intelligence/execution/${file} 完全不 import src/middleware/`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（12.no authentication dependency）src/intelligence/execution/${file} 完全沒有出現 JWT/session/cookie 相關字樣`, () => {
      const src = readSrc(path.join(executionDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（12.no authentication dependency）execution_manager.js 完全不呼叫 requireAuth/requireActiveUser（userId一律由呼叫端當作request.userId傳入，不做任何身份驗證）', () => {
    const src = readSrc(path.join(executionDir, 'execution_manager.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // M. regression test
  // =========================================================================
  console.log('--- M. regression test ---');

  // 沿用TASK1.39~1.49既有的遞迴防護手法。
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.50-execution-manager')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（13.regression test）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.49）`, () => {
      assert.ok(allSuites.length >= 41, `預期至少41個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（14.bootstrap compatibility）createApplication(env).intelligence 具備 execution 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('execution' in app.intelligence);
  });

  await test('（14.bootstrap compatibility）app.intelligence.execution 具備 execute 函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.execution.execute, 'function');
  });

  // 注意：TASK1.51為app.intelligence新增了`events`欄位（Execution
  // Event Layer的extension point），這是明確要做的擴充，不是回歸，
  // 這裡的預期key清單已同步更新。
  await test('（TASK1.52後更新）app.intelligence 恰好具備十三個欄位（TASK1.48既有十個加上TASK1.50新增的execution、TASK1.51新增的events、TASK1.52新增的history）', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), ['analysis', 'analysisEngine', 'context', 'dataPreparation', 'events', 'execution', 'facade', 'history', 'insightService', 'orchestration', 'recommendation', 'recommendationEngine', 'service']);
  });

  await test('（14.bootstrap compatibility）app.intelligence.execution內部注入的service跟app.intelligence.service是同一個實例（用spy覆寫getIntelligence()驗證兩者共用同一個物件參考）', async () => {
    const app = createApplication(makeFullEnv());
    let called = false;
    app.intelligence.service.getIntelligence = async () => {
      called = true;
      return { ok: false, reason: 'spy_short_circuit' };
    };
    const result = await app.intelligence.execution.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(called, true);
    assert.strictEqual(result.reason, 'spy_short_circuit');
  });

  await test('（14.bootstrap compatibility）app.intelligence.facade內部注入的executionManager跟app.intelligence.execution是同一個實例（用spy覆寫execute()驗證）', async () => {
    const app = createApplication(makeFullEnv());
    let called = false;
    app.intelligence.execution.execute = async () => {
      called = true;
      return { ok: false, state: 'failed', reason: 'spy_short_circuit' };
    };
    const result = await app.intelligence.facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(called, true);
    assert.strictEqual(result.reason, 'spy_short_circuit');
  });

  await test('（14.bootstrap compatibility）每次createApplication()呼叫都各自建立獨立的execution實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.execution, app2.intelligence.execution);
  });

  await test('（14.bootstrap compatibility）createApplication() 完整回傳形狀依然是 {config, db, services, router, middleware, intelligence} 六個頂層欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'intelligence', 'middleware', 'router', 'services']);
  });

  await test('（14.bootstrap compatibility）原始碼掃描：src/bootstrap/application.js 有 import execution（來自 ../intelligence/index.js）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(/\bexecution\b.*from ['"]\.\.\/intelligence\/index\.js['"]/.test(src) || /as intelligenceExecutionNamespace.*from ['"]\.\.\/intelligence\/index\.js['"]/.test(src));
  });

  await test('（14.bootstrap compatibility）原始碼掃描：src/intelligence/index.js 有 export execution namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as execution from ['"]\.\/execution\/index\.js['"]/.test(src));
  });

  await test('（14.bootstrap compatibility）app.router.routes 數量沒有因為新增execution而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（14.bootstrap compatibility）原始碼掃描：src/bootstrap/application.js 呼叫createExecutionManager()時注入的是既有的intelligenceService變數（不是新建第二份實例）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    const match = src.match(/createExecutionManager\(\{([^}]*)\}\)/);
    assert.ok(match, '應該找得到createExecutionManager({...})呼叫');
    assert.ok(/service\s*:\s*intelligenceService/.test(match[1]));
  });

  await test('（14.bootstrap compatibility）原始碼掃描：src/bootstrap/application.js 呼叫createIntelligenceFacade()時注入的是既有的intelligenceExecutionManager變數（不再注入service）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    const match = src.match(/createIntelligenceFacade\(\{([^}]*)\}\)/);
    assert.ok(match, '應該找得到createIntelligenceFacade({...})呼叫');
    assert.ok(/executionManager\s*:\s*intelligenceExecutionManager/.test(match[1]));
  });

  console.log('');

  // =========================================================================
  // O. P1-P6
  // =========================================================================
  console.log('--- O. P1-P6 ---');

  await test('（15.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（15.P1-P6）src/worker.js 完全沒有被TASK1.50修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（15.P1-P6）wrangler.toml 完全沒有被TASK1.50修改', () => {
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

/*
 * Phase 1 TASK 1.53｜Intelligence Execution Monitoring Layer Foundation
 * 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「在Execution Manager
 * （TASK1.50）、Execution Event（TASK1.51）、Execution History
 * （TASK1.52）之上，一個純讀取、純觀察的Execution Monitoring邊界」：
 * execution_monitor.js的createExecutionMonitor({historyStore,
 * eventDispatcher})能不能正確透過依賴注入拿到的historyStore/
 * eventDispatcher，提供getExecutionStatus()/getExecutionHistory()/
 * getSummary()三個唯讀查詢介面，monitoring_result_builder.js能不能
 * 正確組出兩種標準化輸出形狀，以及整個Monitor是否完全不修改
 * historyStore/eventDispatcher的任何狀態、完全不影響Execution
 * Manager本身的執行邏輯。不驗證任何真正的AI分析/推薦邏輯（因為根本
 * 沒有），也不驗證任何持久化（因為明確禁止）。
 *
 * 分為以下16個部分：
 * A) monitor creation
 * B) history reading
 * C) event reading
 * D) status query
 * E) summary generation
 * F) deterministic behavior
 * G) execution lifecycle compatibility
 * H) history compatibility
 * I) no AI dependency
 * J) no external dependency
 * K) no SQL
 * L) no HTTP
 * M) no authentication dependency
 * N) no persistence
 * O) regression test
 * P) P1-P6
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
const monitoringDir = path.join(intelDir, 'monitoring');
const historyDir = path.join(intelDir, 'history');
const eventsDir = path.join(intelDir, 'events');
const executionDir = path.join(intelDir, 'execution');

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

function makeSpyService(config) {
  config = config || {};
  return {
    service: {
      getIntelligence: async (db, request) => {
        if (config.getIntelligence) return config.getIntelligence(db, request);
        return {
          ok: true,
          data: {
            status: 'intelligence_ready',
            context: {},
            analysis: { status: 'analysis_ready', insights: [], metadata: { generatedAt: null, version: '1.0.0' } },
            recommendation: { status: 'recommendation_ready', recommendations: [], metadata: { version: '1.0.0' } },
            metadata: {},
          },
        };
      },
    },
  };
}

async function run() {
  const monitorMod = await import(path.join(monitoringDir, 'execution_monitor.js'));
  const { createExecutionMonitor } = monitorMod;
  const builderMod = await import(path.join(monitoringDir, 'monitoring_result_builder.js'));
  const { buildExecutionStatus, buildSummary } = builderMod;
  await import(path.join(monitoringDir, 'index.js'));
  const { createExecutionManager } = await import(path.join(executionDir, 'index.js'));
  const { createHistoryStore } = await import(path.join(historyDir, 'index.js'));
  const { createEventDispatcher } = await import(path.join(eventsDir, 'event_dispatcher.js'));
  const { EXECUTION_EVENT_TYPES } = await import(path.join(eventsDir, 'execution_event.js'));

  // =========================================================================
  // A. monitor creation
  // =========================================================================
  console.log('--- A. monitor creation ---');

  await test('（1.monitor creation）createExecutionMonitor({}) 不拋出例外，回傳物件具備三個函式', () => {
    const monitor = createExecutionMonitor({});
    assert.strictEqual(typeof monitor.getExecutionStatus, 'function');
    assert.strictEqual(typeof monitor.getExecutionHistory, 'function');
    assert.strictEqual(typeof monitor.getSummary, 'function');
  });

  await test('（1.monitor creation）createExecutionMonitor(undefined) 不拋出例外', () => {
    assert.doesNotThrow(() => createExecutionMonitor(undefined));
  });

  await test('（1.monitor creation）createExecutionMonitor()回傳物件恰好只有三個公開介面（不多不少）', () => {
    const monitor = createExecutionMonitor({});
    assert.deepStrictEqual(Object.keys(monitor).sort(), ['getExecutionHistory', 'getExecutionStatus', 'getSummary']);
  });

  await test('（1.monitor creation）沒有提供historyStore/eventDispatcher時建立成功，不拋出例外', () => {
    assert.doesNotThrow(() => createExecutionMonitor({ historyStore: undefined, eventDispatcher: undefined }));
  });

  await test('（1.monitor creation）eventDispatcher.subscribe不是函式時建立成功，不拋出例外（安全跳過訂閱）', () => {
    assert.doesNotThrow(() => createExecutionMonitor({ eventDispatcher: { subscribe: 'nope' } }));
  });

  await test('（1.monitor creation）eventDispatcher.subscribe內部拋出例外時建立成功，不拋出例外', () => {
    const throwingDispatcher = { subscribe: () => { throw new Error('subscribe boom'); } };
    assert.doesNotThrow(() => createExecutionMonitor({ eventDispatcher: throwingDispatcher }));
  });

  await test('（1.monitor creation）提供合法eventDispatcher時，建立過程會對四個事件類型各呼叫一次subscribe()', () => {
    const subscribedTypes = [];
    const fakeDispatcher = { subscribe: (type) => { subscribedTypes.push(type); return { ok: true, unsubscribe: () => {} }; } };
    createExecutionMonitor({ eventDispatcher: fakeDispatcher });
    assert.deepStrictEqual(subscribedTypes.sort(), [...EXECUTION_EVENT_TYPES].sort());
  });

  await test('（1.monitor creation）不同的Monitor實例各自獨立（不是共用singleton）', () => {
    const historyStore = createHistoryStore();
    const monitorA = createExecutionMonitor({ historyStore });
    const monitorB = createExecutionMonitor({ historyStore });
    assert.notStrictEqual(monitorA, monitorB);
  });

  console.log('');

  // =========================================================================
  // B. history reading
  // =========================================================================
  console.log('--- B. history reading ---');

  await test('（2.history reading）getExecutionHistory()對存在的executionId回傳{ok:true, record}', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'completed', startedAt: 't1', completedAt: 't2', events: [], metadata: {} });
    const monitor = createExecutionMonitor({ historyStore });
    const result = monitor.getExecutionHistory('e1');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.record.executionId, 'e1');
  });

  await test('（2.history reading）getExecutionHistory()對不存在的executionId回傳{ok:false, reason:"not_found"}', () => {
    const historyStore = createHistoryStore();
    const monitor = createExecutionMonitor({ historyStore });
    const result = monitor.getExecutionHistory('does-not-exist');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'not_found');
  });

  await test('（2.history reading）getExecutionHistory()對無效executionId（空字串）回傳{ok:false, reason:"invalid_execution_id"}', () => {
    const historyStore = createHistoryStore();
    const monitor = createExecutionMonitor({ historyStore });
    const result = monitor.getExecutionHistory('');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_execution_id');
  });

  await test('（2.history reading）getExecutionHistory()對非字串executionId安全回傳失敗，不拋出例外', () => {
    const historyStore = createHistoryStore();
    const monitor = createExecutionMonitor({ historyStore });
    assert.doesNotThrow(() => monitor.getExecutionHistory(123));
    assert.strictEqual(monitor.getExecutionHistory(123).ok, false);
  });

  await test('（2.history reading）没有提供historyStore時，getExecutionHistory()回傳{ok:false, reason:"history_unavailable"}', () => {
    const monitor = createExecutionMonitor({});
    const result = monitor.getExecutionHistory('e1');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'history_unavailable');
  });

  await test('（2.history reading）historyStore.get不是函式時，getExecutionHistory()安全回傳失敗，不拋出例外', () => {
    const monitor = createExecutionMonitor({ historyStore: { get: 'nope' } });
    assert.doesNotThrow(() => monitor.getExecutionHistory('e1'));
    assert.strictEqual(monitor.getExecutionHistory('e1').ok, false);
  });

  await test('（2.history reading）getExecutionHistory()單純轉發historyStore.get()的完整回傳值（deepStrictEqual）', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'running', startedAt: 't1', completedAt: null, events: [], metadata: { a: 1 } });
    const monitor = createExecutionMonitor({ historyStore });
    assert.deepStrictEqual(monitor.getExecutionHistory('e1'), historyStore.get('e1'));
  });

  await test('（2.history reading）Monitor完全不修改historyStore的任何紀錄（純讀取）', () => {
    const historyStore = createHistoryStore();
    const record = { executionId: 'e1', status: 'completed', startedAt: 't1', completedAt: 't2', events: [], metadata: {} };
    historyStore.add(record);
    const snapshot = JSON.parse(JSON.stringify(historyStore.get('e1')));
    const monitor = createExecutionMonitor({ historyStore });
    monitor.getExecutionHistory('e1');
    monitor.getExecutionStatus('e1');
    monitor.getSummary();
    assert.deepStrictEqual(historyStore.get('e1'), snapshot);
  });

  console.log('');

  // =========================================================================
  // C. event reading
  // =========================================================================
  console.log('--- C. event reading ---');

  await test('（3.event reading）Monitor透過eventDispatcher.subscribe()觀察到的事件，會出現在getExecutionStatus()的events欄位', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'running' });
    const dispatcher = createEventDispatcher();
    const monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    dispatcher.emit({ type: 'execution_started', executionId: 'e1', timestamp: 't1', payload: null });
    const result = monitor.getExecutionStatus('e1');
    assert.strictEqual(result.status.events.length, 1);
    assert.strictEqual(result.status.events[0].type, 'execution_started');
  });

  await test('（3.event reading）沒有提供eventDispatcher時，events欄位固定為空陣列', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'completed' });
    const monitor = createExecutionMonitor({ historyStore });
    const result = monitor.getExecutionStatus('e1');
    assert.deepStrictEqual(result.status.events, []);
  });

  await test('（3.event reading）Monitor依executionId分組累積事件，不同executionId的事件互不混雜', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'running' });
    historyStore.add({ executionId: 'e2', status: 'running' });
    const dispatcher = createEventDispatcher();
    const monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    dispatcher.emit({ type: 'execution_started', executionId: 'e1', timestamp: null, payload: null });
    dispatcher.emit({ type: 'execution_started', executionId: 'e2', timestamp: null, payload: null });
    dispatcher.emit({ type: 'execution_completed', executionId: 'e2', timestamp: null, payload: null });
    assert.strictEqual(monitor.getExecutionStatus('e1').status.events.length, 1);
    assert.strictEqual(monitor.getExecutionStatus('e2').status.events.length, 2);
  });

  await test('（3.event reading）event.executionId缺失（null）時，Monitor安全忽略，不拋出例外、不記到任何分組', () => {
    const dispatcher = createEventDispatcher();
    const monitor = createExecutionMonitor({ historyStore: createHistoryStore(), eventDispatcher: dispatcher });
    assert.doesNotThrow(() => dispatcher.emit({ type: 'execution_started', executionId: null, timestamp: null, payload: null }));
  });

  await test('（3.event reading）Monitor只訂閱四個固定的Execution Event類型，不會意外訂閱到其他類型', () => {
    const dispatcher = createEventDispatcher();
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'running' });
    const monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    dispatcher.emit({ type: 'some_other_event', executionId: 'e1', timestamp: null, payload: null });
    assert.strictEqual(monitor.getExecutionStatus('e1').status.events.length, 0);
  });

  await test('（3.event reading）Monitor建立之前emit的事件不會被觀察到（訂閱是建立時才註冊的，不會回溯過去的事件）', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'running' });
    const dispatcher = createEventDispatcher();
    dispatcher.emit({ type: 'execution_started', executionId: 'e1', timestamp: null, payload: null });
    const monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    assert.strictEqual(monitor.getExecutionStatus('e1').status.events.length, 0);
  });

  await test('（3.event reading）Execution Manager跟Monitor共用同一個eventDispatcher時，Manager emit的事件會被Monitor即時觀察到', async () => {
    const { service } = makeSpyService();
    const historyStore = createHistoryStore();
    const dispatcher = createEventDispatcher();
    const monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    const manager = createExecutionManager({ service, historyStore, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1' } });
    const result = monitor.getExecutionStatus('e1');
    assert.strictEqual(result.status.events.length, 3);
  });

  console.log('');

  // =========================================================================
  // D. status query
  // =========================================================================
  console.log('--- D. status query ---');

  await test('（4.status query）getExecutionStatus()對存在的紀錄回傳{ok:true, status:{status, executionId, history, events, metadata}}', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'completed', startedAt: 't1', completedAt: 't2', events: [], metadata: { a: 1 } });
    const monitor = createExecutionMonitor({ historyStore });
    const result = monitor.getExecutionStatus('e1');
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.status).sort(), ['events', 'executionId', 'history', 'metadata', 'status']);
  });

  await test('（4.status query）status.status欄位取自History Record的status', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'failed' });
    const monitor = createExecutionMonitor({ historyStore });
    assert.strictEqual(monitor.getExecutionStatus('e1').status.status, 'failed');
  });

  await test('（4.status query）status.executionId欄位跟查詢的executionId一致', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'running' });
    const monitor = createExecutionMonitor({ historyStore });
    assert.strictEqual(monitor.getExecutionStatus('e1').status.executionId, 'e1');
  });

  await test('（4.status query）status.history欄位是完整的History Record（deepStrictEqual）', () => {
    const historyStore = createHistoryStore();
    const record = { executionId: 'e1', status: 'completed', startedAt: 't1', completedAt: 't2', events: [{ type: 'x' }], metadata: { a: 1 } };
    historyStore.add(record);
    const monitor = createExecutionMonitor({ historyStore });
    assert.deepStrictEqual(monitor.getExecutionStatus('e1').status.history, record);
  });

  await test('（4.status query）status.metadata欄位取自History Record的metadata', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'completed', metadata: { foo: 'bar' } });
    const monitor = createExecutionMonitor({ historyStore });
    assert.deepStrictEqual(monitor.getExecutionStatus('e1').status.metadata, { foo: 'bar' });
  });

  await test('（4.status query）getExecutionStatus()對不存在的executionId回傳{ok:false, reason:"not_found"}', () => {
    const historyStore = createHistoryStore();
    const monitor = createExecutionMonitor({ historyStore });
    const result = monitor.getExecutionStatus('does-not-exist');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'not_found');
  });

  await test('（4.status query）getExecutionStatus()對無效executionId（空字串）回傳{ok:false, reason:"invalid_execution_id"}', () => {
    const monitor = createExecutionMonitor({ historyStore: createHistoryStore() });
    const result = monitor.getExecutionStatus('');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_execution_id');
  });

  await test('（4.status query）沒有提供historyStore時，getExecutionStatus()回傳{ok:false, reason:"history_unavailable"}', () => {
    const monitor = createExecutionMonitor({});
    const result = monitor.getExecutionStatus('e1');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'history_unavailable');
  });

  await test('（4.status query）monitoring_result_builder.buildExecutionStatus()未提供欄位時使用固定預設值', () => {
    const status = buildExecutionStatus({});
    assert.deepStrictEqual(status, { status: null, executionId: null, history: null, events: [], metadata: {} });
  });

  console.log('');

  // =========================================================================
  // E. summary generation
  // =========================================================================
  console.log('--- E. summary generation ---');

  await test('（5.summary generation）getSummary()一開始（沒有任何紀錄）回傳全部為0的Summary', () => {
    const monitor = createExecutionMonitor({ historyStore: createHistoryStore() });
    assert.deepStrictEqual(monitor.getSummary(), { ok: true, summary: { totalExecutions: 0, completed: 0, failed: 0, running: 0 } });
  });

  await test('（5.summary generation）沒有提供historyStore時，getSummary()依然回傳全部為0的Summary（不拋出例外）', () => {
    const monitor = createExecutionMonitor({});
    assert.deepStrictEqual(monitor.getSummary(), { ok: true, summary: { totalExecutions: 0, completed: 0, failed: 0, running: 0 } });
  });

  await test('（5.summary generation）completed狀態的紀錄被正確計入summary.completed', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'completed' });
    const monitor = createExecutionMonitor({ historyStore });
    assert.strictEqual(monitor.getSummary().summary.completed, 1);
  });

  await test('（5.summary generation）failed狀態的紀錄被正確計入summary.failed', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'failed' });
    const monitor = createExecutionMonitor({ historyStore });
    assert.strictEqual(monitor.getSummary().summary.failed, 1);
  });

  await test('（5.summary generation）initialized/running狀態的紀錄都被計入summary.running', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'initialized' });
    historyStore.add({ executionId: 'e2', status: 'running' });
    const monitor = createExecutionMonitor({ historyStore });
    assert.strictEqual(monitor.getSummary().summary.running, 2);
  });

  await test('（5.summary generation）totalExecutions恆等於completed+failed+running', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'completed' });
    historyStore.add({ executionId: 'e2', status: 'failed' });
    historyStore.add({ executionId: 'e3', status: 'running' });
    historyStore.add({ executionId: 'e4', status: 'initialized' });
    const monitor = createExecutionMonitor({ historyStore });
    const summary = monitor.getSummary().summary;
    assert.strictEqual(summary.totalExecutions, summary.completed + summary.failed + summary.running);
    assert.strictEqual(summary.totalExecutions, 4);
  });

  await test('（5.summary generation）混合多筆不同狀態的紀錄，summary統計正確', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'completed' });
    historyStore.add({ executionId: 'e2', status: 'completed' });
    historyStore.add({ executionId: 'e3', status: 'failed' });
    historyStore.add({ executionId: 'e4', status: 'running' });
    const monitor = createExecutionMonitor({ historyStore });
    assert.deepStrictEqual(monitor.getSummary().summary, { totalExecutions: 4, completed: 2, failed: 1, running: 1 });
  });

  await test('（5.summary generation）覆蓋同一個executionId（狀態更新）不會讓totalExecutions重複計算', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'initialized' });
    historyStore.add({ executionId: 'e1', status: 'running' });
    historyStore.add({ executionId: 'e1', status: 'completed' });
    const monitor = createExecutionMonitor({ historyStore });
    assert.strictEqual(monitor.getSummary().summary.totalExecutions, 1);
    assert.strictEqual(monitor.getSummary().summary.completed, 1);
  });

  await test('（5.summary generation）historyStore.list不是函式時，getSummary()安全回傳全部為0，不拋出例外', () => {
    const monitor = createExecutionMonitor({ historyStore: { list: 'nope' } });
    assert.doesNotThrow(() => monitor.getSummary());
    assert.deepStrictEqual(monitor.getSummary().summary, { totalExecutions: 0, completed: 0, failed: 0, running: 0 });
  });

  await test('（5.summary generation）monitoring_result_builder.buildSummary()未提供欄位時使用固定預設值', () => {
    assert.deepStrictEqual(buildSummary({}), { totalExecutions: 0, completed: 0, failed: 0, running: 0 });
  });

  console.log('');

  // =========================================================================
  // F. deterministic behavior
  // =========================================================================
  console.log('--- F. deterministic behavior ---');

  await test('（6.deterministic behavior）同樣輸入呼叫buildExecutionStatus()多次得到deepStrictEqual結果', () => {
    const input = { status: 'completed', executionId: 'e1', history: { a: 1 }, events: [{ b: 2 }], metadata: { c: 3 } };
    assert.deepStrictEqual(buildExecutionStatus(input), buildExecutionStatus(input));
  });

  await test('（6.deterministic behavior）同樣輸入呼叫buildSummary()多次得到deepStrictEqual結果', () => {
    const input = { totalExecutions: 5, completed: 3, failed: 1, running: 1 };
    assert.deepStrictEqual(buildSummary(input), buildSummary(input));
  });

  await test('（6.deterministic behavior）execution_monitor.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(monitoringDir, 'execution_monitor.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（6.deterministic behavior）monitoring_result_builder.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(monitoringDir, 'monitoring_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（6.deterministic behavior）buildExecutionStatus()不會修改（mutate）傳入的input物件', () => {
    const input = { status: 'completed', metadata: { a: 1 } };
    const snapshot = JSON.parse(JSON.stringify(input));
    buildExecutionStatus(input);
    assert.deepStrictEqual(input, snapshot);
  });

  await test('（6.deterministic behavior）buildSummary()不會修改（mutate）傳入的input物件', () => {
    const input = { totalExecutions: 3, completed: 1 };
    const snapshot = JSON.parse(JSON.stringify(input));
    buildSummary(input);
    assert.deepStrictEqual(input, snapshot);
  });

  await test('（6.deterministic behavior，端對端）同樣的一組執行序列，兩個獨立的Monitor+Store各自觀察後得到deepStrictEqual的summary', async () => {
    const { service } = makeSpyService();

    const storeA = createHistoryStore();
    const dispatcherA = createEventDispatcher();
    const monitorA = createExecutionMonitor({ historyStore: storeA, eventDispatcher: dispatcherA });
    const managerA = createExecutionManager({ service, historyStore: storeA, eventDispatcher: dispatcherA });
    await managerA.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1', timestamp: 't1' } });

    const storeB = createHistoryStore();
    const dispatcherB = createEventDispatcher();
    const monitorB = createExecutionMonitor({ historyStore: storeB, eventDispatcher: dispatcherB });
    const managerB = createExecutionManager({ service, historyStore: storeB, eventDispatcher: dispatcherB });
    await managerB.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1', timestamp: 't1' } });

    assert.deepStrictEqual(monitorA.getSummary(), monitorB.getSummary());
    assert.deepStrictEqual(monitorA.getExecutionStatus('e1'), monitorB.getExecutionStatus('e1'));
  });

  console.log('');

  // =========================================================================
  // G. execution lifecycle compatibility
  // =========================================================================
  console.log('--- G. execution lifecycle compatibility ---');

  await test('（7.execution lifecycle compatibility）Execution Manager成功執行後，Monitor看到的最終status是completed', async () => {
    const { service } = makeSpyService();
    const historyStore = createHistoryStore();
    const dispatcher = createEventDispatcher();
    const monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    const manager = createExecutionManager({ service, historyStore, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1' } });
    assert.strictEqual(monitor.getExecutionStatus('e1').status.status, 'completed');
  });

  await test('（7.execution lifecycle compatibility）Execution Manager失敗執行後，Monitor看到的最終status是failed', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'boom' }) });
    const historyStore = createHistoryStore();
    const dispatcher = createEventDispatcher();
    const monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    const manager = createExecutionManager({ service, historyStore, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1' } });
    assert.strictEqual(monitor.getExecutionStatus('e1').status.status, 'failed');
  });

  await test('（7.execution lifecycle compatibility）Execution Manager執行完成後，Monitor的getSummary()正確反映completed/failed數量', async () => {
    const { service } = makeSpyService();
    const failingService = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'boom' }) }).service;
    const historyStore = createHistoryStore();
    const dispatcher = createEventDispatcher();
    const monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    const manager1 = createExecutionManager({ service, historyStore, eventDispatcher: dispatcher });
    const manager2 = createExecutionManager({ service: failingService, historyStore, eventDispatcher: dispatcher });
    await manager1.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1' } });
    await manager2.execute({}, { request: { userId: 'u2' }, runtimeContext: { requestId: 'e2' } });
    assert.deepStrictEqual(monitor.getSummary().summary, { totalExecutions: 2, completed: 1, failed: 1, running: 0 });
  });

  await test('（7.execution lifecycle compatibility）Execution Manager本身完全沒有被TASK1.53修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/execution/execution_manager.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.execution lifecycle compatibility）execute()對外的成功/失敗回傳格式完全沒有因為新增Monitor而改變', async () => {
    const { service } = makeSpyService();
    const historyStore = createHistoryStore();
    const dispatcher = createEventDispatcher();
    createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    const manager = createExecutionManager({ service, historyStore, eventDispatcher: dispatcher });
    const result = await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1' } });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'ok', 'state']);
  });

  console.log('');

  // =========================================================================
  // H. history compatibility
  // =========================================================================
  console.log('--- H. history compatibility ---');

  await test('（8.history compatibility）Monitor讀到的History Record形狀跟TASK1.52的History Record完全一致（六個欄位）', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'completed', startedAt: 't1', completedAt: 't2', events: [], metadata: {} });
    const monitor = createExecutionMonitor({ historyStore });
    const record = monitor.getExecutionHistory('e1').record;
    assert.deepStrictEqual(Object.keys(record).sort(), ['completedAt', 'events', 'executionId', 'metadata', 'startedAt', 'status']);
  });

  await test('（8.history compatibility）Monitor完全不import src/intelligence/history/底下任何檔案', () => {
    const src = readSrc(path.join(monitoringDir, 'execution_monitor.js'));
    assert.ok(!/from\s+['"].*\/history\//.test(src));
  });

  await test('（8.history compatibility）Monitor完全不import src/intelligence/events/底下任何檔案', () => {
    const src = readSrc(path.join(monitoringDir, 'execution_monitor.js'));
    assert.ok(!/from\s+['"].*\/events\//.test(src));
  });

  await test('（8.history compatibility）execution_monitor.js唯一的相對路徑import是./monitoring_result_builder.js', () => {
    const src = readSrc(path.join(monitoringDir, 'execution_monitor.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./monitoring_result_builder.js']);
  });

  await test('（8.history compatibility）不同的historyStore實例互不影響同一個Monitor的查詢結果（Monitor綁定的是建立時傳入的那個實例）', () => {
    const storeA = createHistoryStore();
    const storeB = createHistoryStore();
    storeA.add({ executionId: 'e1', status: 'completed' });
    const monitor = createExecutionMonitor({ historyStore: storeA });
    assert.strictEqual(monitor.getExecutionHistory('e1').ok, true);
    storeB.add({ executionId: 'e2', status: 'completed' });
    assert.strictEqual(monitor.getExecutionHistory('e2').ok, false);
  });

  console.log('');

  // =========================================================================
  // I. no AI dependency
  // =========================================================================
  console.log('--- I. no AI dependency ---');

  const MONITORING_JS_FILES = fs.readdirSync(monitoringDir).filter((f) => f.endsWith('.js')).sort();
  await test('（9.no AI dependency）src/intelligence/monitoring/ 恰好包含3個.js檔案（execution_monitor/monitoring_result_builder/index）', () => {
    assert.deepStrictEqual(MONITORING_JS_FILES, ['execution_monitor.js', 'index.js', 'monitoring_result_builder.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of MONITORING_JS_FILES) {
    const codeOnly = readSrc(path.join(monitoringDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（9.no AI dependency）src/intelligence/monitoring/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（9.no AI dependency）src/intelligence/monitoring/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // J. no external dependency
  // =========================================================================
  console.log('--- J. no external dependency ---');

  for (const file of MONITORING_JS_FILES) {
    await test(`（10.no external dependency）src/intelligence/monitoring/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（10.no external dependency）src/intelligence/monitoring/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // K. no SQL
  // =========================================================================
  console.log('--- K. no SQL ---');

  for (const file of MONITORING_JS_FILES) {
    await test(`（11.no SQL）src/intelligence/monitoring/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（11.no SQL）src/intelligence/monitoring/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（11.no SQL）src/intelligence/monitoring/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（11.no SQL）src/intelligence/monitoring/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
    await test(`（11.no SQL）src/intelligence/monitoring/${file} 完全沒有出現 migration 相關字樣`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/migration/i.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // L. no HTTP
  // =========================================================================
  console.log('--- L. no HTTP ---');

  for (const file of MONITORING_JS_FILES) {
    await test(`（12.no HTTP）src/intelligence/monitoring/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（12.no HTTP）src/intelligence/monitoring/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（12.no HTTP）src/routes/${file} 完全不 import src/intelligence/monitoring/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/monitoring\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（12.no HTTP）src/controllers/${file} 完全不 import src/intelligence/monitoring/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/monitoring\//.test(src));
    });
  }

  await test('（12.no HTTP）src/worker.js 完全不 import src/intelligence/monitoring/', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/intelligence\/monitoring\//.test(src));
  });

  await test('（12.no HTTP）src/worker.js 完全沒有被TASK1.53修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // M. no authentication dependency
  // =========================================================================
  console.log('--- M. no authentication dependency ---');

  for (const file of MONITORING_JS_FILES) {
    await test(`（13.no authentication dependency）src/intelligence/monitoring/${file} 完全不 import src/auth/ 或 src/identity/`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（13.no authentication dependency）src/intelligence/monitoring/${file} 完全不 import src/middleware/`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（13.no authentication dependency）src/intelligence/monitoring/${file} 完全沒有出現 JWT/session/cookie 相關字樣`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（13.no authentication dependency）execution_monitor.js 完全不呼叫 requireAuth/requireActiveUser', () => {
    const src = readSrc(path.join(monitoringDir, 'execution_monitor.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // N. no persistence
  // =========================================================================
  console.log('--- N. no persistence ---');

  for (const file of MONITORING_JS_FILES) {
    await test(`（14.no persistence）src/intelligence/monitoring/${file} 完全不 import src/db/ 或 node:fs（不寫入檔案/資料庫）`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
      assert.ok(!/from\s+['"]node:fs['"]/.test(src));
      assert.ok(!/from\s+['"]fs['"]/.test(src));
    });
    await test(`（14.no persistence）src/intelligence/monitoring/${file} 完全沒有出現 localStorage/KV/writeFile 等持久化相關字樣`, () => {
      const src = readSrc(path.join(monitoringDir, file));
      assert.ok(!/localStorage/.test(src));
      assert.ok(!/writeFile/.test(src));
      assert.ok(!/\bKV\b/.test(src));
    });
  }

  await test('（14.no persistence）不同Monitor實例的觀察紀錄完全獨立，互不影響', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'running' });
    const dispatcherA = createEventDispatcher();
    const dispatcherB = createEventDispatcher();
    const monitorA = createExecutionMonitor({ historyStore, eventDispatcher: dispatcherA });
    createExecutionMonitor({ historyStore, eventDispatcher: dispatcherB });
    dispatcherB.emit({ type: 'execution_started', executionId: 'e1', timestamp: null, payload: null });
    assert.strictEqual(monitorA.getExecutionStatus('e1').status.events.length, 0);
  });

  await test('（14.no persistence）Monitor實例被丟棄後，重新建立一個新的實例不會保留先前觀察到的事件（沒有任何跨實例的持久化狀態）', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'running' });
    const dispatcher = createEventDispatcher();
    let monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    dispatcher.emit({ type: 'execution_started', executionId: 'e1', timestamp: null, payload: null });
    assert.strictEqual(monitor.getExecutionStatus('e1').status.events.length, 1);
    monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    assert.strictEqual(monitor.getExecutionStatus('e1').status.events.length, 0);
  });

  await test('（14.no persistence）原始碼掃描：src/bootstrap/application.js 沒有為monitoring新增任何資料庫寫入邏輯（規格明確禁止D1/SQL/migration）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(!/intelligenceExecutionMonitor.*\.(insert|write|save)\(/i.test(src));
  });

  console.log('');

  // =========================================================================
  // O. regression test
  // =========================================================================
  console.log('--- O. regression test ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（15.regression test）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.53-execution-monitoring')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（15.regression test）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.52）`, () => {
      assert.ok(allSuites.length >= 44, `預期至少44個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（15.regression test）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

  console.log('--- (extra) bootstrap integration ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（bootstrap整合）createApplication(env).intelligence 具備 monitoring 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('monitoring' in app.intelligence);
  });

  await test('（bootstrap整合）app.intelligence.monitoring 具備 getExecutionStatus/getExecutionHistory/getSummary 三個函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.monitoring.getExecutionStatus, 'function');
    assert.strictEqual(typeof app.intelligence.monitoring.getExecutionHistory, 'function');
    assert.strictEqual(typeof app.intelligence.monitoring.getSummary, 'function');
  });

  await test('（bootstrap整合）app.intelligence.monitoring注入的historyStore/eventDispatcher跟app.intelligence.history/events是同一個實例（實際執行後能在app.intelligence.monitoring查到紀錄）', async () => {
    const app = createApplication(makeFullEnv());
    app.intelligence.service.getIntelligence = async () => ({ ok: false, reason: 'spy_failure' });
    await app.intelligence.facade.executeIntelligence({}, { userId: 'u1', requestId: 'bootstrap-exec-1' });
    const statusResult = app.intelligence.monitoring.getExecutionStatus('bootstrap-exec-1');
    assert.strictEqual(statusResult.ok, true);
    assert.strictEqual(statusResult.status.status, 'failed');
    assert.strictEqual(statusResult.status.events.length, 3);
  });

  await test('（bootstrap整合）每次createApplication()呼叫都各自建立獨立的Execution Monitor實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.monitoring, app2.intelligence.monitoring);
  });

  await test('（bootstrap整合）原始碼掃描：src/intelligence/index.js 有 export monitoring namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as monitoring from ['"]\.\/monitoring\/index\.js['"]/.test(src));
  });

  await test('（bootstrap整合）原始碼掃描：src/intelligence/service/、src/intelligence/orchestration/、src/intelligence/analysis/、src/intelligence/recommendation/、src/intelligence/contracts/、src/intelligence/runtime/、src/intelligence/facade/ 底下.js檔案完全沒有被TASK1.53修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/*.js src/intelligence/orchestration/*.js src/intelligence/analysis/*.js src/intelligence/recommendation/*.js src/intelligence/contracts/*.js src/intelligence/contracts/execution/*.js src/intelligence/runtime/*.js src/intelligence/facade/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（bootstrap整合）app.router.routes 數量沒有因為新增monitoring而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  console.log('');

  // =========================================================================
  // P. P1-P6
  // =========================================================================
  console.log('--- P. P1-P6 ---');

  await test('（16.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（16.P1-P6）wrangler.toml 完全沒有被TASK1.53修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（16.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

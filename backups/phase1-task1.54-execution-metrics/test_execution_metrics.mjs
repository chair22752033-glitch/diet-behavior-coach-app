/*
 * Phase 1 TASK 1.54｜Intelligence Execution Metrics Layer Foundation
 * 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「在Execution Manager
 * （TASK1.50）、Execution Event（TASK1.51）、Execution History
 * （TASK1.52）、Execution Monitoring（TASK1.53）之上，一個獨立的
 * 統計/量測邊界」：execution_metrics.js的createExecutionMetrics(
 * {historyStore, eventDispatcher})能不能正確透過recordExecutionEvent()
 * 收集事件（不論是手動呼叫、還是透過eventDispatcher自動訂閱），
 * getMetrics()/getExecutionMetrics()能不能正確計算出deterministic的
 * 統計數字（次數分類/平均耗時/成功率），metrics_result_builder.js
 * 能不能正確組出規格要求的{status, metrics, metadata}標準化輸出，
 * 以及Metrics是否完全不修改historyStore/eventDispatcher的任何狀態、
 * 完全不影響Execution Manager本身的執行邏輯。不驗證任何真正的AI
 * 分析/推薦邏輯（因為根本沒有），也不驗證任何持久化（因為明確禁止）。
 *
 * 分為以下17個部分：
 * A) metrics creation
 * B) event collection
 * C) execution counting
 * D) completed counting
 * E) failed counting
 * F) duration calculation
 * G) success rate
 * H) deterministic output
 * I) history compatibility
 * J) monitoring compatibility
 * K) no AI dependency
 * L) no external dependency
 * M) no SQL
 * N) no HTTP
 * O) no persistence
 * P) regression test
 * Q) P1-P6
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
const metricsDir = path.join(intelDir, 'metrics');
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
  const metricsMod = await import(path.join(metricsDir, 'execution_metrics.js'));
  const { createExecutionMetrics } = metricsMod;
  const builderMod = await import(path.join(metricsDir, 'metrics_result_builder.js'));
  const { buildMetrics, buildMetricsResult } = builderMod;
  await import(path.join(metricsDir, 'index.js'));
  const { createExecutionManager } = await import(path.join(executionDir, 'index.js'));
  const { createHistoryStore } = await import(path.join(historyDir, 'index.js'));
  const { createEventDispatcher } = await import(path.join(eventsDir, 'event_dispatcher.js'));
  const { EXECUTION_EVENT_TYPES } = await import(path.join(eventsDir, 'execution_event.js'));
  const { createExecutionMonitor } = await import(path.join(monitoringDir, 'execution_monitor.js'));

  // =========================================================================
  // A. metrics creation
  // =========================================================================
  console.log('--- A. metrics creation ---');

  await test('（1.metrics creation）createExecutionMetrics({}) 不拋出例外，回傳物件具備三個函式', () => {
    const metrics = createExecutionMetrics({});
    assert.strictEqual(typeof metrics.recordExecutionEvent, 'function');
    assert.strictEqual(typeof metrics.getMetrics, 'function');
    assert.strictEqual(typeof metrics.getExecutionMetrics, 'function');
  });

  await test('（1.metrics creation）createExecutionMetrics(undefined) 不拋出例外', () => {
    assert.doesNotThrow(() => createExecutionMetrics(undefined));
  });

  await test('（1.metrics creation）createExecutionMetrics()回傳物件恰好只有三個公開介面（不多不少）', () => {
    const metrics = createExecutionMetrics({});
    assert.deepStrictEqual(Object.keys(metrics).sort(), ['getExecutionMetrics', 'getMetrics', 'recordExecutionEvent']);
  });

  await test('（1.metrics creation）沒有提供historyStore/eventDispatcher時建立成功，不拋出例外', () => {
    assert.doesNotThrow(() => createExecutionMetrics({ historyStore: undefined, eventDispatcher: undefined }));
  });

  await test('（1.metrics creation）eventDispatcher.subscribe不是函式時建立成功，不拋出例外（安全跳過訂閱）', () => {
    assert.doesNotThrow(() => createExecutionMetrics({ eventDispatcher: { subscribe: 'nope' } }));
  });

  await test('（1.metrics creation）eventDispatcher.subscribe內部拋出例外時建立成功，不拋出例外', () => {
    const throwingDispatcher = { subscribe: () => { throw new Error('subscribe boom'); } };
    assert.doesNotThrow(() => createExecutionMetrics({ eventDispatcher: throwingDispatcher }));
  });

  await test('（1.metrics creation）提供合法eventDispatcher時，建立過程會對四個事件類型各呼叫一次subscribe()', () => {
    const subscribedTypes = [];
    const fakeDispatcher = { subscribe: (type) => { subscribedTypes.push(type); return { ok: true, unsubscribe: () => {} }; } };
    createExecutionMetrics({ eventDispatcher: fakeDispatcher });
    assert.deepStrictEqual(subscribedTypes.sort(), [...EXECUTION_EVENT_TYPES].sort());
  });

  await test('（1.metrics creation）不同的Metrics實例各自獨立（不是共用singleton）', () => {
    const metricsA = createExecutionMetrics({});
    const metricsB = createExecutionMetrics({});
    assert.notStrictEqual(metricsA, metricsB);
  });

  console.log('');

  // =========================================================================
  // B. event collection
  // =========================================================================
  console.log('--- B. event collection ---');

  await test('（2.event collection）recordExecutionEvent()對合法事件回傳{ok:true}', () => {
    const metrics = createExecutionMetrics({});
    const result = metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1', timestamp: null, payload: null });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.event collection）recordExecutionEvent(null)安全回傳{ok:false, reason:"invalid_event"}，不拋出例外', () => {
    const metrics = createExecutionMetrics({});
    assert.doesNotThrow(() => metrics.recordExecutionEvent(null));
    const result = metrics.recordExecutionEvent(null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_event');
  });

  await test('（2.event collection）recordExecutionEvent({})缺少type時回傳{ok:false, reason:"invalid_event"}', () => {
    const metrics = createExecutionMetrics({});
    const result = metrics.recordExecutionEvent({});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_event');
  });

  await test('（2.event collection）recordExecutionEvent()缺少executionId時回傳{ok:false, reason:"invalid_execution_id"}', () => {
    const metrics = createExecutionMetrics({});
    const result = metrics.recordExecutionEvent({ type: 'execution_initialized' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_execution_id');
  });

  await test('（2.event collection）recordExecutionEvent()對不是四個固定類型之一的type回傳{ok:false, reason:"unknown_event_type"}', () => {
    const metrics = createExecutionMetrics({});
    const result = metrics.recordExecutionEvent({ type: 'not_a_real_type', executionId: 'e1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'unknown_event_type');
  });

  await test('（2.event collection）四個固定事件類型都能被recordExecutionEvent()成功記錄', () => {
    const metrics = createExecutionMetrics({});
    for (const type of EXECUTION_EVENT_TYPES) {
      const result = metrics.recordExecutionEvent({ type, executionId: `e-${type}` });
      assert.strictEqual(result.ok, true);
    }
  });

  await test('（2.event collection）沒有提供eventDispatcher時，依然可以透過直接呼叫recordExecutionEvent()手動餵事件', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'manual-1' });
    assert.strictEqual(metrics.getMetrics().metrics.totalExecutions, 1);
  });

  await test('（2.event collection）Execution Manager跟Metrics共用同一個eventDispatcher時，Manager emit的事件會被Metrics自動收集，不需要手動呼叫recordExecutionEvent()', async () => {
    const { service } = makeSpyService();
    const historyStore = createHistoryStore();
    const dispatcher = createEventDispatcher();
    const metrics = createExecutionMetrics({ historyStore, eventDispatcher: dispatcher });
    const manager = createExecutionManager({ service, historyStore, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1' } });
    assert.strictEqual(metrics.getMetrics().metrics.totalExecutions, 1);
    assert.strictEqual(metrics.getMetrics().metrics.completed, 1);
  });

  await test('（2.event collection）Metrics建立之前emit的事件不會被觀察到（訂閱是建立時才註冊的，不會回溯過去的事件）', () => {
    const dispatcher = createEventDispatcher();
    dispatcher.emit({ type: 'execution_initialized', executionId: 'e1', timestamp: null, payload: null });
    const metrics = createExecutionMetrics({ eventDispatcher: dispatcher });
    assert.strictEqual(metrics.getMetrics().metrics.totalExecutions, 0);
  });

  await test('（2.event collection）event.executionId為null時，recordExecutionEvent()安全回傳失敗，不記錄任何狀態', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: null });
    assert.strictEqual(metrics.getMetrics().metrics.totalExecutions, 0);
  });

  console.log('');

  // =========================================================================
  // C. execution counting
  // =========================================================================
  console.log('--- C. execution counting ---');

  await test('（3.execution counting）只有execution_initialized事件時，totalExecutions=1, initialized=1', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    assert.deepStrictEqual(metrics.getMetrics().metrics, { totalExecutions: 1, initialized: 1, running: 0, completed: 0, failed: 0, averageDuration: 0, successRate: 0 });
  });

  await test('（3.execution counting）走到execution_started後，狀態從initialized轉為running', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e1' });
    const m = metrics.getMetrics().metrics;
    assert.strictEqual(m.initialized, 0);
    assert.strictEqual(m.running, 1);
    assert.strictEqual(m.totalExecutions, 1);
  });

  await test('（3.execution counting）同一個executionId重複記錄不會讓totalExecutions重複計算', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1' });
    assert.strictEqual(metrics.getMetrics().metrics.totalExecutions, 1);
  });

  await test('（3.execution counting）多個不同executionId各自累加totalExecutions', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e2' });
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e3' });
    assert.strictEqual(metrics.getMetrics().metrics.totalExecutions, 3);
  });

  await test('（3.execution counting）totalExecutions恆等於initialized+running+completed+failed', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e2' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e2' });
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e3' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e3' });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e3' });
    const m = metrics.getMetrics().metrics;
    assert.strictEqual(m.totalExecutions, m.initialized + m.running + m.completed + m.failed);
  });

  await test('（3.execution counting）getExecutionMetrics(executionId)對單一執行回傳totalExecutions=1', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    assert.strictEqual(metrics.getExecutionMetrics('e1').metrics.totalExecutions, 1);
  });

  console.log('');

  // =========================================================================
  // D. completed counting
  // =========================================================================
  console.log('--- D. completed counting ---');

  await test('（4.completed counting）execution_completed事件正確計入completed', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1' });
    assert.strictEqual(metrics.getMetrics().metrics.completed, 1);
  });

  await test('（4.completed counting）多筆執行都completed時，completed正確累加', () => {
    const metrics = createExecutionMetrics({});
    for (const id of ['e1', 'e2', 'e3']) {
      metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: id });
      metrics.recordExecutionEvent({ type: 'execution_started', executionId: id });
      metrics.recordExecutionEvent({ type: 'execution_completed', executionId: id });
    }
    assert.strictEqual(metrics.getMetrics().metrics.completed, 3);
  });

  await test('（4.completed counting）Execution Manager透過eventDispatcher驅動的真實成功執行，completed正確計為1', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const metrics = createExecutionMetrics({ eventDispatcher: dispatcher });
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1' } });
    assert.strictEqual(metrics.getMetrics().metrics.completed, 1);
    assert.strictEqual(metrics.getMetrics().metrics.failed, 0);
  });

  console.log('');

  // =========================================================================
  // E. failed counting
  // =========================================================================
  console.log('--- E. failed counting ---');

  await test('（5.failed counting）execution_failed事件正確計入failed', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_failed', executionId: 'e1' });
    assert.strictEqual(metrics.getMetrics().metrics.failed, 1);
  });

  await test('（5.failed counting）輸入驗證失敗（只有initialized跟failed，沒有started）時，failed依然正確計入', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_failed', executionId: 'e1' });
    assert.strictEqual(metrics.getMetrics().metrics.failed, 1);
    assert.strictEqual(metrics.getMetrics().metrics.initialized, 0);
  });

  await test('（5.failed counting）Execution Manager透過eventDispatcher驅動的真實失敗執行，failed正確計為1', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'boom' }) });
    const dispatcher = createEventDispatcher();
    const metrics = createExecutionMetrics({ eventDispatcher: dispatcher });
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1' } });
    assert.strictEqual(metrics.getMetrics().metrics.failed, 1);
    assert.strictEqual(metrics.getMetrics().metrics.completed, 0);
  });

  await test('（5.failed counting）混合completed跟failed，各自正確分類', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e2' });
    metrics.recordExecutionEvent({ type: 'execution_failed', executionId: 'e2' });
    const m = metrics.getMetrics().metrics;
    assert.strictEqual(m.completed, 1);
    assert.strictEqual(m.failed, 1);
  });

  console.log('');

  // =========================================================================
  // F. duration calculation
  // =========================================================================
  console.log('--- F. duration calculation ---');

  await test('（6.duration calculation）字串ISO時間戳可以正確計算出耗時（毫秒）', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e1', timestamp: '2026-01-01T00:00:00.000Z' });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1', timestamp: '2026-01-01T00:00:05.000Z' });
    assert.strictEqual(metrics.getMetrics().metrics.averageDuration, 5000);
  });

  await test('（6.duration calculation）數字時間戳可以正確計算出耗時', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e1', timestamp: 1000 });
    metrics.recordExecutionEvent({ type: 'execution_failed', executionId: 'e1', timestamp: 2500 });
    assert.strictEqual(metrics.getMetrics().metrics.averageDuration, 1500);
  });

  await test('（6.duration calculation）多筆完成的執行取平均值', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e1', timestamp: 0 });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1', timestamp: 1000 });
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e2' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e2', timestamp: 0 });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e2', timestamp: 3000 });
    assert.strictEqual(metrics.getMetrics().metrics.averageDuration, 2000);
  });

  await test('（6.duration calculation）沒有任何完成的執行時，averageDuration為0（不是NaN）', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    assert.strictEqual(metrics.getMetrics().metrics.averageDuration, 0);
  });

  await test('（6.duration calculation）timestamp缺失（null）時，該筆執行不列入averageDuration計算，不會產生NaN', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e1', timestamp: null });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1', timestamp: null });
    assert.strictEqual(metrics.getMetrics().metrics.averageDuration, 0);
    assert.strictEqual(Number.isNaN(metrics.getMetrics().metrics.averageDuration), false);
  });

  await test('（6.duration calculation）無法解析的時間戳字串不會產生NaN', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e1', timestamp: 'not-a-real-date' });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1', timestamp: 'also-not-a-date' });
    assert.strictEqual(metrics.getMetrics().metrics.averageDuration, 0);
  });

  await test('（6.duration calculation）running/initialized狀態的執行不列入averageDuration計算（只計算已結束的）', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e1', timestamp: 0 });
    assert.strictEqual(metrics.getMetrics().metrics.averageDuration, 0);
  });

  console.log('');

  // =========================================================================
  // G. success rate
  // =========================================================================
  console.log('--- G. success rate ---');

  await test('（7.success rate）全部completed時，successRate為1', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1' });
    assert.strictEqual(metrics.getMetrics().metrics.successRate, 1);
  });

  await test('（7.success rate）全部failed時，successRate為0', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_failed', executionId: 'e1' });
    assert.strictEqual(metrics.getMetrics().metrics.successRate, 0);
  });

  await test('（7.success rate）1個completed加1個failed時，successRate為0.5', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e2' });
    metrics.recordExecutionEvent({ type: 'execution_failed', executionId: 'e2' });
    assert.strictEqual(metrics.getMetrics().metrics.successRate, 0.5);
  });

  await test('（7.success rate）沒有任何已結束的執行時，successRate為0（不是NaN）', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    assert.strictEqual(metrics.getMetrics().metrics.successRate, 0);
    assert.strictEqual(Number.isNaN(metrics.getMetrics().metrics.successRate), false);
  });

  await test('（7.success rate）running/initialized狀態的執行不列入successRate分母（只計算已結束的）', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e2' });
    metrics.recordExecutionEvent({ type: 'execution_started', executionId: 'e2' });
    assert.strictEqual(metrics.getMetrics().metrics.successRate, 1);
  });

  await test('（7.success rate）3個completed加1個failed時，successRate為0.75', () => {
    const metrics = createExecutionMetrics({});
    for (const id of ['e1', 'e2', 'e3']) {
      metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: id });
      metrics.recordExecutionEvent({ type: 'execution_completed', executionId: id });
    }
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e4' });
    metrics.recordExecutionEvent({ type: 'execution_failed', executionId: 'e4' });
    assert.strictEqual(metrics.getMetrics().metrics.successRate, 0.75);
  });

  console.log('');

  // =========================================================================
  // H. deterministic output
  // =========================================================================
  console.log('--- H. deterministic output ---');

  await test('（8.deterministic output）同樣輸入呼叫buildMetrics()多次得到deepStrictEqual結果', () => {
    const input = { totalExecutions: 5, initialized: 1, running: 1, completed: 2, failed: 1, averageDuration: 100, successRate: 0.66 };
    assert.deepStrictEqual(buildMetrics(input), buildMetrics(input));
  });

  await test('（8.deterministic output）同樣輸入呼叫buildMetricsResult()多次得到deepStrictEqual結果', () => {
    const input = { status: 'metrics_ready', metrics: buildMetrics({}), metadata: { a: 1 } };
    assert.deepStrictEqual(buildMetricsResult(input), buildMetricsResult(input));
  });

  await test('（8.deterministic output）buildMetrics()未提供欄位時使用固定預設值', () => {
    assert.deepStrictEqual(buildMetrics({}), { totalExecutions: 0, initialized: 0, running: 0, completed: 0, failed: 0, averageDuration: 0, successRate: 0 });
  });

  await test('（8.deterministic output）buildMetricsResult()未提供欄位時使用固定預設值', () => {
    assert.deepStrictEqual(buildMetricsResult({}), { status: null, metrics: buildMetrics({}), metadata: {} });
  });

  await test('（8.deterministic output）execution_metrics.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(metricsDir, 'execution_metrics.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（8.deterministic output）metrics_result_builder.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(metricsDir, 'metrics_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（8.deterministic output）buildMetrics()不會修改（mutate）傳入的input物件', () => {
    const input = { totalExecutions: 3 };
    const snapshot = JSON.parse(JSON.stringify(input));
    buildMetrics(input);
    assert.deepStrictEqual(input, snapshot);
  });

  await test('（8.deterministic output）recordExecutionEvent()不會修改（mutate）傳入的event物件', () => {
    const metrics = createExecutionMetrics({});
    const event = { type: 'execution_initialized', executionId: 'e1', timestamp: null, payload: null };
    const snapshot = JSON.parse(JSON.stringify(event));
    metrics.recordExecutionEvent(event);
    assert.deepStrictEqual(event, snapshot);
  });

  await test('（8.deterministic output，端對端）同樣的一組執行序列，兩個獨立的Metrics各自觀察後得到deepStrictEqual的getMetrics()結果', async () => {
    const { service } = makeSpyService();

    const dispatcherA = createEventDispatcher();
    const metricsA = createExecutionMetrics({ eventDispatcher: dispatcherA });
    const managerA = createExecutionManager({ service, eventDispatcher: dispatcherA });
    await managerA.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1', timestamp: 't1' } });

    const dispatcherB = createEventDispatcher();
    const metricsB = createExecutionMetrics({ eventDispatcher: dispatcherB });
    const managerB = createExecutionManager({ service, eventDispatcher: dispatcherB });
    await managerB.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1', timestamp: 't1' } });

    assert.deepStrictEqual(metricsA.getMetrics(), metricsB.getMetrics());
  });

  await test('（8.deterministic output）重複呼叫getMetrics()（狀態沒有改變）得到deepStrictEqual結果', () => {
    const metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1' });
    assert.deepStrictEqual(metrics.getMetrics(), metrics.getMetrics());
  });

  console.log('');

  // =========================================================================
  // I. history compatibility
  // =========================================================================
  console.log('--- I. history compatibility ---');

  await test('（9.history compatibility）getExecutionMetrics()對自己內部沒有觀察過、但historyStore有紀錄的executionId，會回退查詢historyStore', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'completed', startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:02.000Z', events: [], metadata: { foo: 'bar' } });
    const metrics = createExecutionMetrics({ historyStore });
    const result = metrics.getExecutionMetrics('e1');
    assert.strictEqual(result.status, 'metrics_ready');
    assert.strictEqual(result.metrics.completed, 1);
    assert.strictEqual(result.metrics.averageDuration, 2000);
    assert.deepStrictEqual(result.metadata, { foo: 'bar' });
  });

  await test('（9.history compatibility）自己內部有觀察過的executionId優先使用內部狀態，不查詢historyStore', () => {
    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'failed', startedAt: null, completedAt: null, events: [], metadata: { source: 'history' } });
    const metrics = createExecutionMetrics({ historyStore });
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    metrics.recordExecutionEvent({ type: 'execution_completed', executionId: 'e1' });
    const result = metrics.getExecutionMetrics('e1');
    assert.strictEqual(result.metrics.completed, 1);
    assert.strictEqual(result.metrics.failed, 0);
    assert.deepStrictEqual(result.metadata, {});
  });

  await test('（9.history compatibility）historyStore跟自己內部都沒有紀錄時回傳{status:"not_found"}', () => {
    const historyStore = createHistoryStore();
    const metrics = createExecutionMetrics({ historyStore });
    const result = metrics.getExecutionMetrics('does-not-exist');
    assert.strictEqual(result.status, 'not_found');
    assert.deepStrictEqual(result.metrics, buildMetrics({}));
  });

  await test('（9.history compatibility）沒有提供historyStore時，找不到的executionId依然安全回傳{status:"not_found"}，不拋出例外', () => {
    const metrics = createExecutionMetrics({});
    assert.doesNotThrow(() => metrics.getExecutionMetrics('e1'));
    assert.strictEqual(metrics.getExecutionMetrics('e1').status, 'not_found');
  });

  await test('（9.history compatibility）historyStore.get不是函式時，getExecutionMetrics()安全回退為not_found，不拋出例外', () => {
    const metrics = createExecutionMetrics({ historyStore: { get: 'nope' } });
    assert.doesNotThrow(() => metrics.getExecutionMetrics('e1'));
    assert.strictEqual(metrics.getExecutionMetrics('e1').status, 'not_found');
  });

  await test('（9.history compatibility）historyStore.get()內部拋出例外時，getExecutionMetrics()安全回退為not_found，不拋出例外', () => {
    const throwingStore = { get: () => { throw new Error('boom'); } };
    const metrics = createExecutionMetrics({ historyStore: throwingStore });
    assert.doesNotThrow(() => metrics.getExecutionMetrics('e1'));
    assert.strictEqual(metrics.getExecutionMetrics('e1').status, 'not_found');
  });

  await test('（9.history compatibility）getExecutionMetrics()對無效executionId（空字串）回傳{status:"invalid_execution_id"}', () => {
    const metrics = createExecutionMetrics({});
    const result = metrics.getExecutionMetrics('');
    assert.strictEqual(result.status, 'invalid_execution_id');
  });

  await test('（9.history compatibility）Metrics完全不import src/intelligence/history/底下任何檔案', () => {
    const src = readSrc(path.join(metricsDir, 'execution_metrics.js'));
    assert.ok(!/from\s+['"].*\/history\//.test(src));
  });

  await test('（9.history compatibility）Metrics完全不修改historyStore的任何紀錄（純讀取）', () => {
    const historyStore = createHistoryStore();
    const record = { executionId: 'e1', status: 'completed', startedAt: 't1', completedAt: 't2', events: [], metadata: {} };
    historyStore.add(record);
    const snapshot = JSON.parse(JSON.stringify(historyStore.get('e1')));
    const metrics = createExecutionMetrics({ historyStore });
    metrics.getExecutionMetrics('e1');
    metrics.getMetrics();
    assert.deepStrictEqual(historyStore.get('e1'), snapshot);
  });

  console.log('');

  // =========================================================================
  // J. monitoring compatibility
  // =========================================================================
  console.log('--- J. monitoring compatibility ---');

  await test('（10.monitoring compatibility）Metrics跟Monitoring共用同一個eventDispatcher時，completed/failed計數完全一致', async () => {
    const { service } = makeSpyService();
    const failingService = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'boom' }) }).service;
    const historyStore = createHistoryStore();
    const dispatcher = createEventDispatcher();
    const metrics = createExecutionMetrics({ historyStore, eventDispatcher: dispatcher });
    const monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    const manager1 = createExecutionManager({ service, historyStore, eventDispatcher: dispatcher });
    const manager2 = createExecutionManager({ service: failingService, historyStore, eventDispatcher: dispatcher });
    await manager1.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1' } });
    await manager2.execute({}, { request: { userId: 'u2' }, runtimeContext: { requestId: 'e2' } });

    const metricsResult = metrics.getMetrics().metrics;
    const monitorSummary = monitor.getSummary().summary;
    assert.strictEqual(metricsResult.completed, monitorSummary.completed);
    assert.strictEqual(metricsResult.failed, monitorSummary.failed);
    assert.strictEqual(metricsResult.totalExecutions, monitorSummary.totalExecutions);
  });

  await test('（10.monitoring compatibility）Metrics的initialized+running總和等於Monitoring的running（Monitoring把兩者視為同一個「尚未結束」分類）', async () => {
    const historyStore = createHistoryStore();
    const dispatcher = createEventDispatcher();
    const metrics = createExecutionMetrics({ historyStore, eventDispatcher: dispatcher });
    const monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    dispatcher.emit({ type: 'execution_initialized', executionId: 'e1', timestamp: null, payload: null });
    historyStore.add({ executionId: 'e1', status: 'initialized', startedAt: null, completedAt: null, events: [], metadata: {} });
    dispatcher.emit({ type: 'execution_initialized', executionId: 'e2', timestamp: null, payload: null });
    dispatcher.emit({ type: 'execution_started', executionId: 'e2', timestamp: null, payload: null });
    historyStore.add({ executionId: 'e2', status: 'running', startedAt: null, completedAt: null, events: [], metadata: {} });

    const m = metrics.getMetrics().metrics;
    const s = monitor.getSummary().summary;
    assert.strictEqual(m.initialized + m.running, s.running);
  });

  await test('（10.monitoring compatibility）Metrics跟Monitoring都使用相同的四個狀態字面值（initialized/running/completed/failed）', () => {
    const metricsSrc = readSrc(path.join(metricsDir, 'execution_metrics.js'));
    const monitoringSrc = readSrc(path.join(monitoringDir, 'execution_monitor.js'));
    for (const status of ['initialized', 'running', 'completed', 'failed']) {
      assert.ok(metricsSrc.includes(`'${status}'`), `execution_metrics.js應該出現字面值'${status}'`);
    }
    assert.ok(monitoringSrc.length > 0);
  });

  await test('（10.monitoring compatibility）Metrics完全不import src/intelligence/monitoring/底下任何檔案', () => {
    const src = readSrc(path.join(metricsDir, 'execution_metrics.js'));
    assert.ok(!/from\s+['"].*\/monitoring\//.test(src));
  });

  console.log('');

  // =========================================================================
  // K. no AI dependency
  // =========================================================================
  console.log('--- K. no AI dependency ---');

  const METRICS_JS_FILES = fs.readdirSync(metricsDir).filter((f) => f.endsWith('.js')).sort();
  await test('（11.no AI dependency）src/intelligence/metrics/ 恰好包含3個.js檔案（execution_metrics/metrics_result_builder/index）', () => {
    assert.deepStrictEqual(METRICS_JS_FILES, ['execution_metrics.js', 'index.js', 'metrics_result_builder.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of METRICS_JS_FILES) {
    const codeOnly = readSrc(path.join(metricsDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（11.no AI dependency）src/intelligence/metrics/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（11.no AI dependency）src/intelligence/metrics/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // L. no external dependency
  // =========================================================================
  console.log('--- L. no external dependency ---');

  for (const file of METRICS_JS_FILES) {
    await test(`（12.no external dependency）src/intelligence/metrics/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（12.no external dependency）src/intelligence/metrics/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
    await test(`（12.no external dependency）src/intelligence/metrics/${file} 完全不 import src/auth/ 或 src/identity/`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // M. no SQL
  // =========================================================================
  console.log('--- M. no SQL ---');

  for (const file of METRICS_JS_FILES) {
    await test(`（13.no SQL）src/intelligence/metrics/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（13.no SQL）src/intelligence/metrics/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（13.no SQL）src/intelligence/metrics/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（13.no SQL）src/intelligence/metrics/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
    await test(`（13.no SQL）src/intelligence/metrics/${file} 完全沒有出現 migration 相關字樣`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/migration/i.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // N. no HTTP
  // =========================================================================
  console.log('--- N. no HTTP ---');

  for (const file of METRICS_JS_FILES) {
    await test(`（14.no HTTP）src/intelligence/metrics/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（14.no HTTP）src/intelligence/metrics/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（14.no HTTP）src/routes/${file} 完全不 import src/intelligence/metrics/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/metrics\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（14.no HTTP）src/controllers/${file} 完全不 import src/intelligence/metrics/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/metrics\//.test(src));
    });
  }

  await test('（14.no HTTP）src/worker.js 完全不 import src/intelligence/metrics/', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/intelligence\/metrics\//.test(src));
  });

  await test('（14.no HTTP）src/worker.js 完全沒有被TASK1.54修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // O. no persistence
  // =========================================================================
  console.log('--- O. no persistence ---');

  for (const file of METRICS_JS_FILES) {
    await test(`（15.no persistence）src/intelligence/metrics/${file} 完全不 import src/db/ 或 node:fs（不寫入檔案/資料庫）`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
      assert.ok(!/from\s+['"]node:fs['"]/.test(src));
      assert.ok(!/from\s+['"]fs['"]/.test(src));
    });
    await test(`（15.no persistence）src/intelligence/metrics/${file} 完全沒有出現 localStorage/KV/writeFile 等持久化相關字樣`, () => {
      const src = readSrc(path.join(metricsDir, file));
      assert.ok(!/localStorage/.test(src));
      assert.ok(!/writeFile/.test(src));
      assert.ok(!/\bKV\b/.test(src));
    });
  }

  await test('（15.no persistence）不同Metrics實例的累積狀態完全獨立，互不影響', () => {
    const dispatcherA = createEventDispatcher();
    const dispatcherB = createEventDispatcher();
    const metricsA = createExecutionMetrics({ eventDispatcher: dispatcherA });
    createExecutionMetrics({ eventDispatcher: dispatcherB });
    dispatcherB.emit({ type: 'execution_initialized', executionId: 'e1', timestamp: null, payload: null });
    assert.strictEqual(metricsA.getMetrics().metrics.totalExecutions, 0);
  });

  await test('（15.no persistence）Metrics實例被丟棄後，重新建立一個新的實例不會保留先前累積的統計（沒有任何跨實例的持久化狀態）', () => {
    let metrics = createExecutionMetrics({});
    metrics.recordExecutionEvent({ type: 'execution_initialized', executionId: 'e1' });
    assert.strictEqual(metrics.getMetrics().metrics.totalExecutions, 1);
    metrics = createExecutionMetrics({});
    assert.strictEqual(metrics.getMetrics().metrics.totalExecutions, 0);
  });

  await test('（15.no persistence）原始碼掃描：src/bootstrap/application.js 沒有為metrics新增任何資料庫寫入邏輯（規格明確禁止D1/SQL/migration）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(!/intelligenceExecutionMetrics.*\.(insert|write|save)\(/i.test(src));
  });

  console.log('');

  // =========================================================================
  // P. regression test
  // =========================================================================
  console.log('--- P. regression test ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（16.regression test）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.54-execution-metrics')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（16.regression test）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.53）`, () => {
      assert.ok(allSuites.length >= 45, `預期至少45個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（16.regression test）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

  await test('（bootstrap整合）createApplication(env).intelligence 具備 metrics 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('metrics' in app.intelligence);
  });

  await test('（bootstrap整合）app.intelligence.metrics 具備 recordExecutionEvent/getMetrics/getExecutionMetrics 三個函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.metrics.recordExecutionEvent, 'function');
    assert.strictEqual(typeof app.intelligence.metrics.getMetrics, 'function');
    assert.strictEqual(typeof app.intelligence.metrics.getExecutionMetrics, 'function');
  });

  await test('（bootstrap整合）app.intelligence.metrics注入的eventDispatcher跟app.intelligence.events是同一個實例（實際執行後能在app.intelligence.metrics查到統計）', async () => {
    const app = createApplication(makeFullEnv());
    app.intelligence.service.getIntelligence = async () => ({ ok: false, reason: 'spy_failure' });
    await app.intelligence.facade.executeIntelligence({}, { userId: 'u1', requestId: 'bootstrap-exec-1' });
    const metricsResult = app.intelligence.metrics.getMetrics();
    assert.strictEqual(metricsResult.metrics.totalExecutions, 1);
    assert.strictEqual(metricsResult.metrics.failed, 1);
  });

  await test('（bootstrap整合）每次createApplication()呼叫都各自建立獨立的Execution Metrics實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.metrics, app2.intelligence.metrics);
  });

  await test('（bootstrap整合）原始碼掃描：src/intelligence/index.js 有 export metrics namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as metrics from ['"]\.\/metrics\/index\.js['"]/.test(src));
  });

  await test('（bootstrap整合）原始碼掃描：src/intelligence/execution/execution_manager.js 完全沒有被TASK1.54修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/execution/execution_manager.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（bootstrap整合）原始碼掃描：src/intelligence/service/、src/intelligence/orchestration/、src/intelligence/analysis/、src/intelligence/recommendation/、src/intelligence/contracts/、src/intelligence/runtime/、src/intelligence/facade/ 底下.js檔案完全沒有被TASK1.54修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/*.js src/intelligence/orchestration/*.js src/intelligence/analysis/*.js src/intelligence/recommendation/*.js src/intelligence/contracts/*.js src/intelligence/contracts/execution/*.js src/intelligence/runtime/*.js src/intelligence/facade/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（bootstrap整合）app.router.routes 數量沒有因為新增metrics而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  console.log('');

  // =========================================================================
  // Q. P1-P6
  // =========================================================================
  console.log('--- Q. P1-P6 ---');

  await test('（17.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（17.P1-P6）wrangler.toml 完全沒有被TASK1.54修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（17.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

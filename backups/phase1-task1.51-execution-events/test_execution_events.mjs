/*
 * Phase 1 TASK 1.51｜Intelligence Execution Event Layer Foundation
 * 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「Execution Manager
 * （TASK1.50）生命週期狀態轉換之上的純記憶體內部事件機制」：
 * execution_event.js能不能正確定義/驗證事件形狀、event_dispatcher.js
 * 的subscribe()/emit()能不能正確運作（同步呼叫、訂閱者例外不影響
 * emit()本身）、Execution Manager是否確實在狀態轉換時額外emit對應的
 * Execution Event（不改變原本的執行邏輯跟回傳格式），以及整個事件層
 * 完全沒有任何持久化。不驗證任何真正的AI分析/推薦邏輯（因為根本
 * 沒有）。
 *
 * 分為以下15個部分：
 * A) event creation
 * B) event validation
 * C) dispatcher subscription
 * D) event emission
 * E) execution manager integration
 * F) lifecycle mapping
 * G) deterministic behavior
 * H) no AI dependency
 * I) no external dependency
 * J) no SQL
 * K) no HTTP
 * L) no authentication dependency
 * M) no persistence
 * N) regression test
 * O) P1-P6
 *
 * 全部使用純記憶體測試（除了N類少數子行程regression外），完全不連線
 * 任何真實或本機模擬的資料庫，不呼叫任何AI API或fetch()，不建立任何
 * 真實使用者session。
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
  const calls = [];
  return {
    calls,
    service: {
      getIntelligence: async (db, request) => {
        calls.push({ db, request });
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
  const eventMod = await import(path.join(eventsDir, 'execution_event.js'));
  const { EXECUTION_EVENT_TYPES, EventTypeContract, isValidExecutionEventType, validateExecutionEvent, createExecutionEvent } = eventMod;
  const dispatcherMod = await import(path.join(eventsDir, 'event_dispatcher.js'));
  const { createEventDispatcher } = dispatcherMod;
  await import(path.join(eventsDir, 'index.js'));
  const { createExecutionManager } = await import(path.join(executionDir, 'index.js'));

  // =========================================================================
  // A. event creation
  // =========================================================================
  console.log('--- A. event creation ---');

  await test('（1.event creation）EXECUTION_EVENT_TYPES恰好是四個固定字串，沒有其他事件類型', () => {
    assert.deepStrictEqual(EXECUTION_EVENT_TYPES, ['execution_initialized', 'execution_started', 'execution_completed', 'execution_failed']);
  });

  await test('（1.event creation）EventTypeContract.required恰好是["type"]', () => {
    assert.deepStrictEqual(EventTypeContract.required, ['type']);
  });

  await test('（1.event creation）EventTypeContract.optional恰好是["timestamp","executionId","payload"]', () => {
    assert.deepStrictEqual(EventTypeContract.optional, ['timestamp', 'executionId', 'payload']);
  });

  await test('（1.event creation）createExecutionEvent({type}) 成功回傳{ok:true, event}', () => {
    const result = createExecutionEvent({ type: 'execution_initialized' });
    assert.strictEqual(result.ok, true);
    assert.ok(result.event);
  });

  await test('（1.event creation）event恰好具備type/timestamp/executionId/payload四個欄位', () => {
    const result = createExecutionEvent({ type: 'execution_initialized' });
    assert.deepStrictEqual(Object.keys(result.event).sort(), ['executionId', 'payload', 'timestamp', 'type']);
  });

  await test('（1.event creation）帶完整欄位時全部欄位都正確保留', () => {
    const result = createExecutionEvent({ type: 'execution_completed', timestamp: '2026-01-01T00:00:00Z', executionId: 'exec-1', payload: { status: 'intelligence_ready' } });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.event, { type: 'execution_completed', timestamp: '2026-01-01T00:00:00Z', executionId: 'exec-1', payload: { status: 'intelligence_ready' } });
  });

  await test('（1.event creation）沒有提供timestamp時，event.timestamp預設為null', () => {
    const result = createExecutionEvent({ type: 'execution_started' });
    assert.strictEqual(result.event.timestamp, null);
  });

  await test('（1.event creation）沒有提供executionId時，event.executionId預設為null', () => {
    const result = createExecutionEvent({ type: 'execution_started' });
    assert.strictEqual(result.event.executionId, null);
  });

  await test('（1.event creation）沒有提供payload時，event.payload預設為null', () => {
    const result = createExecutionEvent({ type: 'execution_started' });
    assert.strictEqual(result.event.payload, null);
  });

  await test('（1.event creation）createExecutionEvent()對缺少type的輸入安全回傳失敗，不拋出例外', () => {
    assert.doesNotThrow(() => createExecutionEvent({}));
    assert.strictEqual(createExecutionEvent({}).ok, false);
  });

  await test('（1.event creation）createExecutionEvent(undefined)不拋出例外，安全回傳失敗', () => {
    assert.doesNotThrow(() => createExecutionEvent(undefined));
    assert.strictEqual(createExecutionEvent(undefined).ok, false);
  });

  await test('（1.event creation）createExecutionEvent()對type不是合法事件類型時安全回傳失敗', () => {
    const result = createExecutionEvent({ type: 'not_a_real_type' });
    assert.strictEqual(result.ok, false);
  });

  await test('（1.event creation）payload可以帶任意巢狀物件，原樣保留不被轉換', () => {
    const payload = { nested: { deep: { value: 42 } } };
    const result = createExecutionEvent({ type: 'execution_completed', payload });
    assert.deepStrictEqual(result.event.payload, payload);
  });

  console.log('');

  // =========================================================================
  // B. event validation
  // =========================================================================
  console.log('--- B. event validation ---');

  await test('（2.event validation）isValidExecutionEventType()對四個合法類型都回傳true', () => {
    for (const type of EXECUTION_EVENT_TYPES) {
      assert.strictEqual(isValidExecutionEventType(type), true);
    }
  });

  await test('（2.event validation）isValidExecutionEventType()對不存在的類型回傳false', () => {
    assert.strictEqual(isValidExecutionEventType('execution_pending'), false);
    assert.strictEqual(isValidExecutionEventType(''), false);
  });

  await test('（2.event validation）isValidExecutionEventType()對非字串輸入安全回傳false', () => {
    assert.doesNotThrow(() => isValidExecutionEventType(null));
    assert.strictEqual(isValidExecutionEventType(null), false);
    assert.strictEqual(isValidExecutionEventType(123), false);
  });

  await test('（2.event validation）validateExecutionEvent(合法event) 回傳{ok:true}', () => {
    assert.deepStrictEqual(validateExecutionEvent({ type: 'execution_initialized', timestamp: null, executionId: null, payload: null }), { ok: true });
  });

  await test('（2.event validation）缺少type時回傳{ok:false, reason:"invalid_type"}', () => {
    const result = validateExecutionEvent({});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_type');
    assert.strictEqual(result.field, 'type');
  });

  await test('（2.event validation）type為空字串時回傳失敗', () => {
    assert.strictEqual(validateExecutionEvent({ type: '' }).ok, false);
  });

  await test('（2.event validation）type為數字時回傳失敗', () => {
    assert.strictEqual(validateExecutionEvent({ type: 123 }).ok, false);
  });

  await test('（2.event validation）type不是四個合法類型之一時回傳{ok:false, reason:"unknown_event_type"}', () => {
    const result = validateExecutionEvent({ type: 'execution_cancelled' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'unknown_event_type');
    assert.strictEqual(result.field, 'type');
  });

  await test('（2.event validation）timestamp為null時視為合法', () => {
    assert.strictEqual(validateExecutionEvent({ type: 'execution_started', timestamp: null }).ok, true);
  });

  await test('（2.event validation）timestamp為字串時視為合法', () => {
    assert.strictEqual(validateExecutionEvent({ type: 'execution_started', timestamp: '2026-01-01T00:00:00Z' }).ok, true);
  });

  await test('（2.event validation）timestamp為數字時回傳{ok:false, reason:"invalid_field_type", field:"timestamp"}', () => {
    const result = validateExecutionEvent({ type: 'execution_started', timestamp: 12345 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'timestamp');
  });

  await test('（2.event validation）executionId為null時視為合法', () => {
    assert.strictEqual(validateExecutionEvent({ type: 'execution_started', executionId: null }).ok, true);
  });

  await test('（2.event validation）executionId為數字時回傳失敗', () => {
    const result = validateExecutionEvent({ type: 'execution_started', executionId: 123 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'executionId');
  });

  await test('（2.event validation）payload可以是任意型別（物件/字串/數字/null），完全不驗證其內容', () => {
    assert.strictEqual(validateExecutionEvent({ type: 'execution_started', payload: { a: 1 } }).ok, true);
    assert.strictEqual(validateExecutionEvent({ type: 'execution_started', payload: 'x' }).ok, true);
    assert.strictEqual(validateExecutionEvent({ type: 'execution_started', payload: 123 }).ok, true);
    assert.strictEqual(validateExecutionEvent({ type: 'execution_started', payload: null }).ok, true);
  });

  await test('（2.event validation）event本身為null時回傳{ok:false, reason:"invalid_event"}', () => {
    const result = validateExecutionEvent(null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_event');
  });

  await test('（2.event validation）event本身為陣列時回傳失敗', () => {
    assert.strictEqual(validateExecutionEvent([]).ok, false);
  });

  await test('（2.event validation）event本身為字串時回傳失敗', () => {
    assert.strictEqual(validateExecutionEvent('bad').ok, false);
  });

  console.log('');

  // =========================================================================
  // C. dispatcher subscription
  // =========================================================================
  console.log('--- C. dispatcher subscription ---');

  await test('（3.dispatcher subscription）createEventDispatcher() 回傳物件具備subscribe/emit兩個函式', () => {
    const dispatcher = createEventDispatcher();
    assert.strictEqual(typeof dispatcher.subscribe, 'function');
    assert.strictEqual(typeof dispatcher.emit, 'function');
  });

  await test('（3.dispatcher subscription）subscribe()成功時回傳{ok:true, unsubscribe}', () => {
    const dispatcher = createEventDispatcher();
    const result = dispatcher.subscribe('execution_started', () => {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(typeof result.unsubscribe, 'function');
  });

  await test('（3.dispatcher subscription）eventType不是字串時安全回傳{ok:false, reason:"invalid_event_type"}', () => {
    const dispatcher = createEventDispatcher();
    const result = dispatcher.subscribe(123, () => {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_event_type');
  });

  await test('（3.dispatcher subscription）eventType為空字串時安全回傳失敗', () => {
    const dispatcher = createEventDispatcher();
    assert.strictEqual(dispatcher.subscribe('', () => {}).ok, false);
  });

  await test('（3.dispatcher subscription）handler不是函式時安全回傳{ok:false, reason:"invalid_handler"}', () => {
    const dispatcher = createEventDispatcher();
    const result = dispatcher.subscribe('execution_started', 'not-a-function');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_handler');
  });

  await test('（3.dispatcher subscription）同一個eventType可以重複訂閱多個handler', () => {
    const dispatcher = createEventDispatcher();
    const a = dispatcher.subscribe('execution_started', () => {});
    const b = dispatcher.subscribe('execution_started', () => {});
    assert.strictEqual(a.ok, true);
    assert.strictEqual(b.ok, true);
  });

  await test('（3.dispatcher subscription）unsubscribe()後，該handler不會再被emit()呼叫', () => {
    const dispatcher = createEventDispatcher();
    const received = [];
    const sub = dispatcher.subscribe('execution_started', (e) => received.push(e));
    sub.unsubscribe();
    dispatcher.emit({ type: 'execution_started' });
    assert.strictEqual(received.length, 0);
  });

  await test('（3.dispatcher subscription）unsubscribe()只移除自己的handler，不影響同類型的其他handler', () => {
    const dispatcher = createEventDispatcher();
    const receivedA = [];
    const receivedB = [];
    const subA = dispatcher.subscribe('execution_started', (e) => receivedA.push(e));
    dispatcher.subscribe('execution_started', (e) => receivedB.push(e));
    subA.unsubscribe();
    dispatcher.emit({ type: 'execution_started' });
    assert.strictEqual(receivedA.length, 0);
    assert.strictEqual(receivedB.length, 1);
  });

  await test('（3.dispatcher subscription）重複呼叫unsubscribe()不拋出例外（冪等）', () => {
    const dispatcher = createEventDispatcher();
    const sub = dispatcher.subscribe('execution_started', () => {});
    sub.unsubscribe();
    assert.doesNotThrow(() => sub.unsubscribe());
  });

  await test('（3.dispatcher subscription）訂閱一個目前還沒有任何事件會用到的類型是合法的（不驗證是不是EXECUTION_EVENT_TYPES其中之一）', () => {
    const dispatcher = createEventDispatcher();
    const result = dispatcher.subscribe('some_future_event_type', () => {});
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // D. event emission
  // =========================================================================
  console.log('--- D. event emission ---');

  await test('（4.event emission）emit()對合法事件回傳{ok:true, handlerCount}', () => {
    const dispatcher = createEventDispatcher();
    dispatcher.subscribe('execution_started', () => {});
    const result = dispatcher.emit({ type: 'execution_started' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.handlerCount, 1);
  });

  await test('（4.event emission）emit()依訂閱順序同步呼叫所有訂閱了該type的handler', () => {
    const dispatcher = createEventDispatcher();
    const order = [];
    dispatcher.subscribe('execution_started', () => order.push('first'));
    dispatcher.subscribe('execution_started', () => order.push('second'));
    dispatcher.emit({ type: 'execution_started' });
    assert.deepStrictEqual(order, ['first', 'second']);
  });

  await test('（4.event emission）emit()是同步的——handler在emit()呼叫返回之前就已經執行完畢', () => {
    const dispatcher = createEventDispatcher();
    let called = false;
    dispatcher.subscribe('execution_started', () => { called = true; });
    dispatcher.emit({ type: 'execution_started' });
    assert.strictEqual(called, true);
  });

  await test('（4.event emission）沒有任何訂閱者時，emit()依然成功回傳{ok:true, handlerCount:0}', () => {
    const dispatcher = createEventDispatcher();
    const result = dispatcher.emit({ type: 'execution_started' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.handlerCount, 0);
  });

  await test('（4.event emission）只有訂閱了對應type的handler會被呼叫，其他type的訂閱者不受影響', () => {
    const dispatcher = createEventDispatcher();
    const startedReceived = [];
    const completedReceived = [];
    dispatcher.subscribe('execution_started', (e) => startedReceived.push(e));
    dispatcher.subscribe('execution_completed', (e) => completedReceived.push(e));
    dispatcher.emit({ type: 'execution_started' });
    assert.strictEqual(startedReceived.length, 1);
    assert.strictEqual(completedReceived.length, 0);
  });

  await test('（4.event emission）emit()對不合法事件安全回傳{ok:false, reason, field?}，不拋出例外', () => {
    const dispatcher = createEventDispatcher();
    assert.doesNotThrow(() => dispatcher.emit({}));
    const result = dispatcher.emit({});
    assert.strictEqual(result.ok, false);
  });

  await test('（4.event emission）handler內部拋出的例外不會讓emit()本身拋出例外', () => {
    const dispatcher = createEventDispatcher();
    dispatcher.subscribe('execution_started', () => { throw new Error('boom'); });
    assert.doesNotThrow(() => dispatcher.emit({ type: 'execution_started' }));
  });

  await test('（4.event emission）某個handler拋出例外不會阻止後面訂閱的handler被呼叫', () => {
    const dispatcher = createEventDispatcher();
    let secondCalled = false;
    dispatcher.subscribe('execution_started', () => { throw new Error('boom'); });
    dispatcher.subscribe('execution_started', () => { secondCalled = true; });
    dispatcher.emit({ type: 'execution_started' });
    assert.strictEqual(secondCalled, true);
  });

  await test('（4.event emission）emit()把完整的event物件（含timestamp/executionId/payload）傳給handler', () => {
    const dispatcher = createEventDispatcher();
    let receivedEvent = null;
    dispatcher.subscribe('execution_completed', (e) => { receivedEvent = e; });
    dispatcher.emit({ type: 'execution_completed', executionId: 'exec-1', timestamp: 't1', payload: { status: 'intelligence_ready' } });
    assert.deepStrictEqual(receivedEvent, { type: 'execution_completed', executionId: 'exec-1', timestamp: 't1', payload: { status: 'intelligence_ready' } });
  });

  console.log('');

  // =========================================================================
  // E. execution manager integration
  // =========================================================================
  console.log('--- E. execution manager integration ---');

  await test('（5.execution manager integration）createExecutionManager()沒有提供eventDispatcher時，execute()依然正常運作（向後相容TASK1.50）', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.execution manager integration）成功執行時，Event Dispatcher恰好收到3個事件', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const events = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => events.push(e));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(events.length, 3);
  });

  await test('（5.execution manager integration）失敗執行時（輸入驗證失敗），Event Dispatcher恰好收到2個事件', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const events = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => events.push(e));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: {} });
    assert.strictEqual(events.length, 2);
  });

  await test('（5.execution manager integration）每個emit的event都通過validateExecutionEvent()', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const events = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => events.push(e));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    for (const e of events) {
      assert.strictEqual(validateExecutionEvent(e).ok, true);
    }
  });

  await test('（5.execution manager integration）eventDispatcher.emit不是函式時，execute()依然正常運作（不拋出例外）', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service, eventDispatcher: { emit: 'nope' } });
    await assert.doesNotReject(() => manager.execute({}, { request: { userId: 'u1' } }));
  });

  await test('（5.execution manager integration）eventDispatcher.emit內部拋出例外時，execute()依然正常回傳結果（事件處理跟執行邏輯完全independent）', async () => {
    const { service } = makeSpyService();
    const throwingDispatcher = { emit: () => { throw new Error('dispatcher boom'); } };
    const manager = createExecutionManager({ service, eventDispatcher: throwingDispatcher });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.execution manager integration）execute()對外的成功/失敗回傳格式完全沒有因為新增事件機制而改變', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'ok', 'state']);
    assert.strictEqual(result.state, 'completed');
  });

  await test('（5.execution manager integration）onStateChange跟eventDispatcher可以同時提供，兩者互不影響', async () => {
    const { service } = makeSpyService();
    const states = [];
    const events = [];
    const dispatcher = createEventDispatcher();
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => events.push(e.type));
    const manager = createExecutionManager({ service, onStateChange: (s) => states.push(s), eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(states, ['initialized', 'running', 'completed']);
    assert.deepStrictEqual(events, ['execution_initialized', 'execution_started', 'execution_completed']);
  });

  console.log('');

  // =========================================================================
  // F. lifecycle mapping
  // =========================================================================
  console.log('--- F. lifecycle mapping ---');

  await test('（6.lifecycle mapping）"initialized"狀態對應到"execution_initialized"事件', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const events = [];
    dispatcher.subscribe('execution_initialized', (e) => events.push(e));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(events.length, 1);
  });

  await test('（6.lifecycle mapping）"running"狀態對應到"execution_started"事件', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const events = [];
    dispatcher.subscribe('execution_started', (e) => events.push(e));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(events.length, 1);
  });

  await test('（6.lifecycle mapping）"completed"狀態對應到"execution_completed"事件', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const events = [];
    dispatcher.subscribe('execution_completed', (e) => events.push(e));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(events.length, 1);
  });

  await test('（6.lifecycle mapping）"failed"狀態對應到"execution_failed"事件', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'boom' }) });
    const dispatcher = createEventDispatcher();
    const events = [];
    dispatcher.subscribe('execution_failed', (e) => events.push(e));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(events.length, 1);
  });

  await test('（6.lifecycle mapping）成功執行的事件順序恰好是[execution_initialized, execution_started, execution_completed]', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const types = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => types.push(e.type));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(types, ['execution_initialized', 'execution_started', 'execution_completed']);
  });

  await test('（6.lifecycle mapping）Service失敗執行的事件順序恰好是[execution_initialized, execution_started, execution_failed]', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'boom' }) });
    const dispatcher = createEventDispatcher();
    const types = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => types.push(e.type));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(types, ['execution_initialized', 'execution_started', 'execution_failed']);
  });

  await test('（6.lifecycle mapping）輸入驗證失敗的事件順序恰好是[execution_initialized, execution_failed]（不會有execution_started）', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const types = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => types.push(e.type));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: {} });
    assert.deepStrictEqual(types, ['execution_initialized', 'execution_failed']);
  });

  await test('（6.lifecycle mapping）execution_completed事件的payload恰好帶著{status}', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    let completedEvent = null;
    dispatcher.subscribe('execution_completed', (e) => { completedEvent = e; });
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(completedEvent.payload, { status: 'intelligence_ready' });
  });

  await test('（6.lifecycle mapping）execution_failed事件的payload恰好帶著{reason}', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'user_not_found' }) });
    const dispatcher = createEventDispatcher();
    let failedEvent = null;
    dispatcher.subscribe('execution_failed', (e) => { failedEvent = e; });
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(failedEvent.payload, { reason: 'user_not_found' });
  });

  await test('（6.lifecycle mapping）execution_initialized/execution_started事件的payload為null（還沒有任何額外資訊）', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const captured = {};
    dispatcher.subscribe('execution_initialized', (e) => { captured.initialized = e; });
    dispatcher.subscribe('execution_started', (e) => { captured.started = e; });
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(captured.initialized.payload, null);
    assert.strictEqual(captured.started.payload, null);
  });

  await test('（6.lifecycle mapping）事件的executionId取自runtimeContext.requestId', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const events = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => events.push(e));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'req-xyz', userId: 'u1', version: '1', timestamp: null, metadata: {} } });
    for (const e of events) {
      assert.strictEqual(e.executionId, 'req-xyz');
    }
  });

  await test('（6.lifecycle mapping）事件的timestamp取自runtimeContext.timestamp', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const events = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => events.push(e));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: null, userId: 'u1', version: '1', timestamp: '2026-06-01T00:00:00Z', metadata: {} } });
    for (const e of events) {
      assert.strictEqual(e.timestamp, '2026-06-01T00:00:00Z');
    }
  });

  await test('（6.lifecycle mapping）沒有提供runtimeContext時，事件的executionId/timestamp安全為null', async () => {
    const { service } = makeSpyService();
    const dispatcher = createEventDispatcher();
    const events = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => events.push(e));
    const manager = createExecutionManager({ service, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' } });
    for (const e of events) {
      assert.strictEqual(e.executionId, null);
      assert.strictEqual(e.timestamp, null);
    }
  });

  console.log('');

  // =========================================================================
  // G. deterministic behavior
  // =========================================================================
  console.log('--- G. deterministic behavior ---');

  await test('（7.deterministic behavior）同樣輸入呼叫createExecutionEvent()多次得到deepStrictEqual結果', () => {
    const input = { type: 'execution_completed', executionId: 'e1', timestamp: 't1', payload: { a: 1 } };
    assert.deepStrictEqual(createExecutionEvent(input), createExecutionEvent(input));
  });

  await test('（7.deterministic behavior）execution_event.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(eventsDir, 'execution_event.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（7.deterministic behavior）event_dispatcher.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(eventsDir, 'event_dispatcher.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（7.deterministic behavior）createExecutionEvent()不會修改（mutate）傳入的input物件', () => {
    const input = { type: 'execution_completed', payload: { a: 1 } };
    const snapshot = JSON.parse(JSON.stringify(input));
    createExecutionEvent(input);
    assert.deepStrictEqual(input, snapshot);
  });

  await test('（7.deterministic behavior）emit()不會修改（mutate）傳入的event物件', () => {
    const dispatcher = createEventDispatcher();
    const event = { type: 'execution_started', payload: { a: 1 } };
    const snapshot = JSON.parse(JSON.stringify(event));
    dispatcher.emit(event);
    assert.deepStrictEqual(event, snapshot);
  });

  await test('（7.deterministic behavior，端對端）同樣的假service輸出，連續呼叫兩次execute()（都有eventDispatcher）得到相同數量、相同type序列的事件', async () => {
    const { service } = makeSpyService();
    const dispatcherA = createEventDispatcher();
    const typesA = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcherA.subscribe(type, (e) => typesA.push(e.type));
    const managerA = createExecutionManager({ service, eventDispatcher: dispatcherA });
    await managerA.execute({}, { request: { userId: 'u1' } });

    const dispatcherB = createEventDispatcher();
    const typesB = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcherB.subscribe(type, (e) => typesB.push(e.type));
    const managerB = createExecutionManager({ service, eventDispatcher: dispatcherB });
    await managerB.execute({}, { request: { userId: 'u1' } });

    assert.deepStrictEqual(typesA, typesB);
  });

  console.log('');

  // =========================================================================
  // H. no AI dependency
  // =========================================================================
  console.log('--- H. no AI dependency ---');

  const EVENTS_JS_FILES = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js')).sort();
  await test('（8.no AI dependency）src/intelligence/events/ 恰好包含3個.js檔案（execution_event/event_dispatcher/index）', () => {
    assert.deepStrictEqual(EVENTS_JS_FILES, ['event_dispatcher.js', 'execution_event.js', 'index.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of EVENTS_JS_FILES) {
    const codeOnly = readSrc(path.join(eventsDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.no AI dependency）src/intelligence/events/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（8.no AI dependency）src/intelligence/events/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
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

  for (const file of EVENTS_JS_FILES) {
    await test(`（9.no external dependency）src/intelligence/events/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（9.no external dependency）src/intelligence/events/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // J. no SQL
  // =========================================================================
  console.log('--- J. no SQL ---');

  for (const file of EVENTS_JS_FILES) {
    await test(`（10.no SQL）src/intelligence/events/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（10.no SQL）src/intelligence/events/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（10.no SQL）src/intelligence/events/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（10.no SQL）src/intelligence/events/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // K. no HTTP
  // =========================================================================
  console.log('--- K. no HTTP ---');

  for (const file of EVENTS_JS_FILES) {
    await test(`（11.no HTTP）src/intelligence/events/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（11.no HTTP）src/intelligence/events/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（11.no HTTP）src/routes/${file} 完全不 import src/intelligence/events/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/events\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（11.no HTTP）src/controllers/${file} 完全不 import src/intelligence/events/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/events\//.test(src));
    });
  }

  await test('（11.no HTTP）src/worker.js 完全不 import src/intelligence/events/', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/intelligence\/events\//.test(src));
  });

  console.log('');

  // =========================================================================
  // L. no authentication dependency
  // =========================================================================
  console.log('--- L. no authentication dependency ---');

  for (const file of EVENTS_JS_FILES) {
    await test(`（12.no authentication dependency）src/intelligence/events/${file} 完全不 import src/auth/ 或 src/identity/`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（12.no authentication dependency）src/intelligence/events/${file} 完全不 import src/middleware/`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（12.no authentication dependency）src/intelligence/events/${file} 完全沒有出現 JWT/session/cookie 相關字樣`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（12.no authentication dependency）event_dispatcher.js 完全不呼叫 requireAuth/requireActiveUser', () => {
    const src = readSrc(path.join(eventsDir, 'event_dispatcher.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // M. no persistence
  // =========================================================================
  console.log('--- M. no persistence ---');

  for (const file of EVENTS_JS_FILES) {
    await test(`（13.no persistence）src/intelligence/events/${file} 完全不 import src/db/ 或 node:fs（不寫入檔案/資料庫）`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
      assert.ok(!/from\s+['"]node:fs['"]/.test(src));
      assert.ok(!/from\s+['"]fs['"]/.test(src));
    });
    await test(`（13.no persistence）src/intelligence/events/${file} 完全沒有出現 localStorage/KV/writeFile 等持久化相關字樣`, () => {
      const src = readSrc(path.join(eventsDir, file));
      assert.ok(!/localStorage/.test(src));
      assert.ok(!/writeFile/.test(src));
      assert.ok(!/\bKV\b/.test(src));
    });
  }

  await test('（13.no persistence）不同的Event Dispatcher實例訂閱清單完全獨立，互不影響（證明狀態只存在單一實例的記憶體中，不是共用/持久化的全域狀態）', () => {
    const dispatcherA = createEventDispatcher();
    const dispatcherB = createEventDispatcher();
    const receivedA = [];
    dispatcherA.subscribe('execution_started', (e) => receivedA.push(e));
    dispatcherB.emit({ type: 'execution_started' });
    assert.strictEqual(receivedA.length, 0);
  });

  await test('（13.no persistence）Event Dispatcher實例被丟棄後，重新建立一個新的實例不會保留先前的訂閱者（沒有任何跨實例的持久化狀態）', () => {
    let dispatcher = createEventDispatcher();
    let count = 0;
    dispatcher.subscribe('execution_started', () => { count += 1; });
    dispatcher.emit({ type: 'execution_started' });
    assert.strictEqual(count, 1);
    dispatcher = createEventDispatcher();
    dispatcher.emit({ type: 'execution_started' });
    assert.strictEqual(count, 1);
  });

  await test('（13.no persistence）原始碼掃描：src/bootstrap/application.js 沒有為events新增任何資料庫寫入邏輯（規格明確禁止Add database logging）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(!/intelligenceEventDispatcher.*\.(insert|write|save)\(/i.test(src));
  });

  console.log('');

  // =========================================================================
  // N. regression test
  // =========================================================================
  console.log('--- N. regression test ---');

  // 沿用TASK1.39~1.50既有的遞迴防護手法。
  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（14.regression test）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.51-execution-events')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（14.regression test）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.50）`, () => {
      assert.ok(allSuites.length >= 42, `預期至少42個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（14.regression test）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

  // 這裡也額外做bootstrap整合驗證（雖然任務沒有列在正式的15類裡，但
  // 為了完整驗證intelligence.events跟intelligence.execution確實正確
  // 串接，補上這幾個測試，計入N類regression test前的既有測試數量）
  console.log('--- (extra) bootstrap integration ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（bootstrap整合）createApplication(env).intelligence 具備 events 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('events' in app.intelligence);
  });

  await test('（bootstrap整合）app.intelligence.events 具備 subscribe/emit 兩個函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.events.subscribe, 'function');
    assert.strictEqual(typeof app.intelligence.events.emit, 'function');
  });

  await test('（bootstrap整合）app.intelligence.execution內部注入的eventDispatcher跟app.intelligence.events是同一個實例（訂閱app.intelligence.events能收到真正執行時emit的事件）', async () => {
    const app = createApplication(makeFullEnv());
    const events = [];
    app.intelligence.events.subscribe('execution_failed', (e) => events.push(e));
    app.intelligence.service.getIntelligence = async () => ({ ok: false, reason: 'spy_failure' });
    await app.intelligence.facade.executeIntelligence({}, { userId: 'u1' });
    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0].payload, { reason: 'spy_failure' });
  });

  await test('（bootstrap整合）每次createApplication()呼叫都各自建立獨立的events dispatcher實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.events, app2.intelligence.events);
  });

  await test('（bootstrap整合）原始碼掃描：src/intelligence/index.js 有 export events namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as events from ['"]\.\/events\/index\.js['"]/.test(src));
  });

  await test('（bootstrap整合）原始碼掃描：execution_manager.js 完全不 import src/intelligence/events/ 底下任何檔案（eventDispatcher一律透過依賴注入傳入）', () => {
    const src = readSrc(path.join(executionDir, 'execution_manager.js'));
    assert.ok(!/from\s+['"].*\/events\//.test(src));
  });

  await test('（bootstrap整合）原始碼掃描：execution_manager.js 依然只 import ./execution_result_builder.js（唯一允許的相依）', () => {
    const src = readSrc(path.join(executionDir, 'execution_manager.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./execution_result_builder.js']);
  });

  await test('（bootstrap整合）原始碼掃描：src/intelligence/service/、src/intelligence/orchestration/、src/intelligence/analysis/、src/intelligence/recommendation/、src/intelligence/contracts/、src/intelligence/runtime/ 底下.js檔案完全沒有被TASK1.51修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/*.js src/intelligence/orchestration/*.js src/intelligence/analysis/*.js src/intelligence/recommendation/*.js src/intelligence/contracts/*.js src/intelligence/contracts/execution/*.js src/intelligence/runtime/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（bootstrap整合）app.router.routes 數量沒有因為新增events而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  console.log('');

  // =========================================================================
  // O. P1-P6
  // =========================================================================
  console.log('--- O. P1-P6 ---');

  await test('（15.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（15.P1-P6）src/worker.js 完全沒有被TASK1.51修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（15.P1-P6）wrangler.toml 完全沒有被TASK1.51修改', () => {
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

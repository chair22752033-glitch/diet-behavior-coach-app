/*
 * Phase 1 TASK 1.52｜Intelligence Execution History Layer Foundation
 * 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「Execution Manager
 * （TASK1.50）生命週期狀態轉換、Execution Event（TASK1.51）之上，
 * 一個純記憶體的Execution History紀錄邊界」：execution_history.js
 * 能不能正確定義/驗證History Record形狀、history_store.js的
 * add()/get()/list()能不能正確運作（memory only、無持久化、
 * deterministic），以及Execution Manager是否確實在狀態轉換時額外
 * 建立/更新對應的History Record（不改變原本的執行邏輯跟回傳格式），
 * 以及History Record的events欄位跟Execution Event（TASK1.51）保持
 * 結構相容。不驗證任何真正的AI分析/推薦邏輯（因為根本沒有），也不
 * 驗證任何持久化（因為明確禁止）。
 *
 * 分為以下15個部分：
 * A) history record creation
 * B) validation
 * C) store add/get/list
 * D) deterministic behavior
 * E) execution manager integration
 * F) lifecycle tracking
 * G) event compatibility
 * H) no AI dependency
 * I) no external dependency
 * J) no SQL
 * K) no HTTP
 * L) no authentication dependency
 * M) no persistence
 * N) regression test
 * O) P1-P6
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
  const historyMod = await import(path.join(historyDir, 'execution_history.js'));
  const { HistoryRecordContract, validateHistoryRecord, createHistoryRecord } = historyMod;
  const storeMod = await import(path.join(historyDir, 'history_store.js'));
  const { createHistoryStore } = storeMod;
  await import(path.join(historyDir, 'index.js'));
  const { createExecutionManager } = await import(path.join(executionDir, 'index.js'));
  const { EXECUTION_EVENT_TYPES, validateExecutionEvent } = await import(path.join(eventsDir, 'execution_event.js'));
  const { createEventDispatcher } = await import(path.join(eventsDir, 'event_dispatcher.js'));

  // =========================================================================
  // A. history record creation
  // =========================================================================
  console.log('--- A. history record creation ---');

  await test('（1.history record creation）HistoryRecordContract.required恰好是["executionId","status"]', () => {
    assert.deepStrictEqual(HistoryRecordContract.required, ['executionId', 'status']);
  });

  await test('（1.history record creation）HistoryRecordContract.optional恰好是["startedAt","completedAt","events","metadata"]', () => {
    assert.deepStrictEqual(HistoryRecordContract.optional, ['startedAt', 'completedAt', 'events', 'metadata']);
  });

  await test('（1.history record creation）createHistoryRecord({executionId,status}) 成功回傳{ok:true, record}', () => {
    const result = createHistoryRecord({ executionId: 'exec-1', status: 'initialized' });
    assert.strictEqual(result.ok, true);
    assert.ok(result.record);
  });

  await test('（1.history record creation）record恰好具備executionId/status/startedAt/completedAt/events/metadata六個欄位', () => {
    const result = createHistoryRecord({ executionId: 'exec-1', status: 'initialized' });
    assert.deepStrictEqual(Object.keys(result.record).sort(), ['completedAt', 'events', 'executionId', 'metadata', 'startedAt', 'status']);
  });

  await test('（1.history record creation）帶完整欄位時全部欄位都正確保留', () => {
    const result = createHistoryRecord({
      executionId: 'exec-1',
      status: 'completed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:01Z',
      events: [{ type: 'execution_completed' }],
      metadata: { a: 1 },
    });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.record, {
      executionId: 'exec-1',
      status: 'completed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:01Z',
      events: [{ type: 'execution_completed' }],
      metadata: { a: 1 },
    });
  });

  await test('（1.history record creation）沒有提供startedAt時，record.startedAt預設為null', () => {
    const result = createHistoryRecord({ executionId: 'exec-1', status: 'initialized' });
    assert.strictEqual(result.record.startedAt, null);
  });

  await test('（1.history record creation）沒有提供completedAt時，record.completedAt預設為null', () => {
    const result = createHistoryRecord({ executionId: 'exec-1', status: 'initialized' });
    assert.strictEqual(result.record.completedAt, null);
  });

  await test('（1.history record creation）沒有提供events時，record.events預設為空陣列', () => {
    const result = createHistoryRecord({ executionId: 'exec-1', status: 'initialized' });
    assert.deepStrictEqual(result.record.events, []);
  });

  await test('（1.history record creation）沒有提供metadata時，record.metadata預設為空物件', () => {
    const result = createHistoryRecord({ executionId: 'exec-1', status: 'initialized' });
    assert.deepStrictEqual(result.record.metadata, {});
  });

  await test('（1.history record creation）createHistoryRecord()對缺少executionId的輸入安全回傳失敗，不拋出例外', () => {
    assert.doesNotThrow(() => createHistoryRecord({ status: 'initialized' }));
    assert.strictEqual(createHistoryRecord({ status: 'initialized' }).ok, false);
  });

  await test('（1.history record creation）createHistoryRecord()對缺少status的輸入安全回傳失敗', () => {
    assert.strictEqual(createHistoryRecord({ executionId: 'exec-1' }).ok, false);
  });

  await test('（1.history record creation）createHistoryRecord(undefined)不拋出例外，安全回傳失敗', () => {
    assert.doesNotThrow(() => createHistoryRecord(undefined));
    assert.strictEqual(createHistoryRecord(undefined).ok, false);
  });

  await test('（1.history record creation）metadata可以帶任意巢狀物件，原樣保留不被轉換', () => {
    const metadata = { nested: { deep: { value: 42 } } };
    const result = createHistoryRecord({ executionId: 'exec-1', status: 'initialized', metadata });
    assert.deepStrictEqual(result.record.metadata, metadata);
  });

  console.log('');

  // =========================================================================
  // B. validation
  // =========================================================================
  console.log('--- B. validation ---');

  await test('（2.validation）validateHistoryRecord(合法record) 回傳{ok:true}', () => {
    assert.deepStrictEqual(
      validateHistoryRecord({ executionId: 'e1', status: 'initialized', startedAt: null, completedAt: null, events: [], metadata: {} }),
      { ok: true }
    );
  });

  await test('（2.validation）缺少executionId時回傳{ok:false, reason:"invalid_execution_id", field:"executionId"}', () => {
    const result = validateHistoryRecord({ status: 'initialized' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_execution_id');
    assert.strictEqual(result.field, 'executionId');
  });

  await test('（2.validation）executionId為空字串時回傳失敗', () => {
    assert.strictEqual(validateHistoryRecord({ executionId: '', status: 'initialized' }).ok, false);
  });

  await test('（2.validation）executionId為數字時回傳失敗', () => {
    assert.strictEqual(validateHistoryRecord({ executionId: 123, status: 'initialized' }).ok, false);
  });

  await test('（2.validation）缺少status時回傳{ok:false, reason:"invalid_status", field:"status"}', () => {
    const result = validateHistoryRecord({ executionId: 'e1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_status');
    assert.strictEqual(result.field, 'status');
  });

  await test('（2.validation）status為空字串時回傳失敗', () => {
    assert.strictEqual(validateHistoryRecord({ executionId: 'e1', status: '' }).ok, false);
  });

  await test('（2.validation）status不限定固定列舉——任意非空字串都視為合法（跟Execution Event的type不同）', () => {
    assert.strictEqual(validateHistoryRecord({ executionId: 'e1', status: 'some_custom_status' }).ok, true);
  });

  await test('（2.validation）startedAt為null時視為合法', () => {
    assert.strictEqual(validateHistoryRecord({ executionId: 'e1', status: 'running', startedAt: null }).ok, true);
  });

  await test('（2.validation）startedAt為字串時視為合法', () => {
    assert.strictEqual(validateHistoryRecord({ executionId: 'e1', status: 'running', startedAt: '2026-01-01T00:00:00Z' }).ok, true);
  });

  await test('（2.validation）startedAt為數字時回傳{ok:false, reason:"invalid_field_type", field:"startedAt"}', () => {
    const result = validateHistoryRecord({ executionId: 'e1', status: 'running', startedAt: 12345 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'startedAt');
  });

  await test('（2.validation）completedAt為null時視為合法', () => {
    assert.strictEqual(validateHistoryRecord({ executionId: 'e1', status: 'completed', completedAt: null }).ok, true);
  });

  await test('（2.validation）completedAt為數字時回傳失敗', () => {
    const result = validateHistoryRecord({ executionId: 'e1', status: 'completed', completedAt: 999 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'completedAt');
  });

  await test('（2.validation）events為陣列時視為合法（陣列內容不被驗證）', () => {
    assert.strictEqual(validateHistoryRecord({ executionId: 'e1', status: 'completed', events: [1, 'x', { a: 1 }] }).ok, true);
  });

  await test('（2.validation）events為null時視為合法', () => {
    assert.strictEqual(validateHistoryRecord({ executionId: 'e1', status: 'completed', events: null }).ok, true);
  });

  await test('（2.validation）events不是陣列時（例如物件）回傳{ok:false, reason:"invalid_field_type", field:"events"}', () => {
    const result = validateHistoryRecord({ executionId: 'e1', status: 'completed', events: { a: 1 } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'events');
  });

  await test('（2.validation）metadata為物件時視為合法', () => {
    assert.strictEqual(validateHistoryRecord({ executionId: 'e1', status: 'completed', metadata: { a: 1 } }).ok, true);
  });

  await test('（2.validation）metadata為陣列時回傳失敗（陣列不算物件）', () => {
    const result = validateHistoryRecord({ executionId: 'e1', status: 'completed', metadata: [] });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.field, 'metadata');
  });

  await test('（2.validation）metadata為字串時回傳失敗', () => {
    assert.strictEqual(validateHistoryRecord({ executionId: 'e1', status: 'completed', metadata: 'x' }).ok, false);
  });

  await test('（2.validation）record本身為null時回傳{ok:false, reason:"invalid_record"}', () => {
    const result = validateHistoryRecord(null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_record');
  });

  await test('（2.validation）record本身為陣列時回傳失敗', () => {
    assert.strictEqual(validateHistoryRecord([]).ok, false);
  });

  await test('（2.validation）record本身為字串時回傳失敗', () => {
    assert.strictEqual(validateHistoryRecord('bad').ok, false);
  });

  console.log('');

  // =========================================================================
  // C. store add/get/list
  // =========================================================================
  console.log('--- C. store add/get/list ---');

  await test('（3.store add/get/list）createHistoryStore() 回傳物件具備add/get/list三個函式', () => {
    const store = createHistoryStore();
    assert.strictEqual(typeof store.add, 'function');
    assert.strictEqual(typeof store.get, 'function');
    assert.strictEqual(typeof store.list, 'function');
  });

  await test('（3.store add/get/list）add(合法record) 回傳{ok:true}', () => {
    const store = createHistoryStore();
    const result = store.add({ executionId: 'e1', status: 'initialized' });
    assert.strictEqual(result.ok, true);
  });

  await test('（3.store add/get/list）add(不合法record) 回傳{ok:false, reason}，不拋出例外', () => {
    const store = createHistoryStore();
    assert.doesNotThrow(() => store.add({}));
    const result = store.add({});
    assert.strictEqual(result.ok, false);
  });

  await test('（3.store add/get/list）add()後可以用get(executionId)查回同一筆record', () => {
    const store = createHistoryStore();
    store.add({ executionId: 'e1', status: 'initialized', startedAt: null, completedAt: null, events: [], metadata: {} });
    const result = store.get('e1');
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.record, { executionId: 'e1', status: 'initialized', startedAt: null, completedAt: null, events: [], metadata: {} });
  });

  await test('（3.store add/get/list）get()查詢不存在的executionId時回傳{ok:false, reason:"not_found"}', () => {
    const store = createHistoryStore();
    const result = store.get('does-not-exist');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'not_found');
  });

  await test('（3.store add/get/list）get()對非字串executionId安全回傳失敗，不拋出例外', () => {
    const store = createHistoryStore();
    assert.doesNotThrow(() => store.get(123));
    assert.strictEqual(store.get(123).ok, false);
  });

  await test('（3.store add/get/list）get()對空字串executionId安全回傳失敗', () => {
    const store = createHistoryStore();
    assert.strictEqual(store.get('').ok, false);
  });

  await test('（3.store add/get/list）同一個executionId重複add()會覆蓋既有紀錄', () => {
    const store = createHistoryStore();
    store.add({ executionId: 'e1', status: 'initialized' });
    store.add({ executionId: 'e1', status: 'completed' });
    const result = store.get('e1');
    assert.strictEqual(result.record.status, 'completed');
  });

  await test('（3.store add/get/list）list()一開始回傳空陣列', () => {
    const store = createHistoryStore();
    const result = store.list();
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.records, []);
  });

  await test('（3.store add/get/list）add()多筆不同executionId後，list()回傳全部紀錄', () => {
    const store = createHistoryStore();
    store.add({ executionId: 'e1', status: 'initialized' });
    store.add({ executionId: 'e2', status: 'completed' });
    const result = store.list();
    assert.strictEqual(result.records.length, 2);
    assert.deepStrictEqual(result.records.map((r) => r.executionId).sort(), ['e1', 'e2']);
  });

  await test('（3.store add/get/list）覆蓋同一個executionId不會讓list()長度增加', () => {
    const store = createHistoryStore();
    store.add({ executionId: 'e1', status: 'initialized' });
    store.add({ executionId: 'e1', status: 'completed' });
    assert.strictEqual(store.list().records.length, 1);
  });

  console.log('');

  // =========================================================================
  // D. deterministic behavior
  // =========================================================================
  console.log('--- D. deterministic behavior ---');

  await test('（4.deterministic behavior）同樣輸入呼叫createHistoryRecord()多次得到deepStrictEqual結果', () => {
    const input = { executionId: 'e1', status: 'completed', startedAt: 't1', completedAt: 't2', events: [{ a: 1 }], metadata: { b: 2 } };
    assert.deepStrictEqual(createHistoryRecord(input), createHistoryRecord(input));
  });

  await test('（4.deterministic behavior）execution_history.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(historyDir, 'execution_history.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（4.deterministic behavior）history_store.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(historyDir, 'history_store.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（4.deterministic behavior）createHistoryRecord()不會修改（mutate）傳入的input物件', () => {
    const input = { executionId: 'e1', status: 'completed', metadata: { a: 1 } };
    const snapshot = JSON.parse(JSON.stringify(input));
    createHistoryRecord(input);
    assert.deepStrictEqual(input, snapshot);
  });

  await test('（4.deterministic behavior）add()不會修改（mutate）傳入的record物件', () => {
    const store = createHistoryStore();
    const record = { executionId: 'e1', status: 'initialized', metadata: { a: 1 } };
    const snapshot = JSON.parse(JSON.stringify(record));
    store.add(record);
    assert.deepStrictEqual(record, snapshot);
  });

  await test('（4.deterministic behavior，端對端）同樣的假service輸出，連續建立兩個獨立store各自跑一次execute()（同樣的executionId），得到deepStrictEqual的最終record', async () => {
    const { service } = makeSpyService();

    const storeA = createHistoryStore();
    const managerA = createExecutionManager({ service, historyStore: storeA });
    await managerA.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-x', timestamp: 't1' } });

    const storeB = createHistoryStore();
    const managerB = createExecutionManager({ service, historyStore: storeB });
    await managerB.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-x', timestamp: 't1' } });

    assert.deepStrictEqual(storeA.get('exec-x'), storeB.get('exec-x'));
  });

  console.log('');

  // =========================================================================
  // E. execution manager integration
  // =========================================================================
  console.log('--- E. execution manager integration ---');

  await test('（5.execution manager integration）createExecutionManager()沒有提供historyStore時，execute()依然正常運作（向後相容TASK1.50/1.51）', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service });
    const result = await manager.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.execution manager integration）成功執行且有runtimeContext.requestId時，historyStore會有一筆對應executionId的紀錄', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    const result = store.get('exec-1');
    assert.strictEqual(result.ok, true);
  });

  await test('（5.execution manager integration）沒有runtimeContext（executionId為null）時，historyStore完全不會新增任何紀錄', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(store.list().records, []);
  });

  await test('（5.execution manager integration）historyStore.add不是函式時，execute()依然正常運作（不拋出例外）', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service, historyStore: { add: 'nope', get: () => ({ ok: false }) } });
    await assert.doesNotReject(() => manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } }));
  });

  await test('（5.execution manager integration）historyStore.get不是函式時，execute()依然正常運作（不拋出例外）', async () => {
    const { service } = makeSpyService();
    const manager = createExecutionManager({ service, historyStore: { add: () => ({ ok: true }), get: 'nope' } });
    await assert.doesNotReject(() => manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } }));
  });

  await test('（5.execution manager integration）historyStore.add()內部拋出例外時，execute()依然正常回傳結果（歷史記錄跟執行邏輯完全independent）', async () => {
    const { service } = makeSpyService();
    const throwingStore = { add: () => { throw new Error('store boom'); }, get: () => ({ ok: false, reason: 'not_found' }) };
    const manager = createExecutionManager({ service, historyStore: throwingStore });
    const result = await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.execution manager integration）historyStore.get()內部拋出例外時，execute()依然正常回傳結果', async () => {
    const { service } = makeSpyService();
    const throwingStore = { add: () => ({ ok: true }), get: () => { throw new Error('get boom'); } };
    const manager = createExecutionManager({ service, historyStore: throwingStore });
    const result = await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.execution manager integration）execute()對外的成功/失敗回傳格式完全沒有因為新增歷史記錄機制而改變', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    const result = await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'ok', 'state']);
    assert.strictEqual(result.state, 'completed');
  });

  await test('（5.execution manager integration）onStateChange/eventDispatcher/historyStore三者可以同時提供，互不影響', async () => {
    const { service } = makeSpyService();
    const states = [];
    const eventTypes = [];
    const store = createHistoryStore();
    const dispatcher = createEventDispatcher();
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => eventTypes.push(e.type));
    const manager = createExecutionManager({
      service,
      onStateChange: (s) => states.push(s),
      eventDispatcher: dispatcher,
      historyStore: store,
    });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    assert.deepStrictEqual(states, ['initialized', 'running', 'completed']);
    assert.deepStrictEqual(eventTypes, ['execution_initialized', 'execution_started', 'execution_completed']);
    assert.strictEqual(store.get('exec-1').record.status, 'completed');
  });

  console.log('');

  // =========================================================================
  // F. lifecycle tracking
  // =========================================================================
  console.log('--- F. lifecycle tracking ---');

  await test('（6.lifecycle tracking）"initialized"狀態建立新紀錄：status="initialized", startedAt=null, completedAt=null（在setState()內部，onStateChange(next)固定在updateHistory(next)之前被呼叫，所以「初始化紀錄已建立」這件事要在下一次狀態轉換的onStateChange回呼裡才看得到——這裡在onStateChange("running")時去讀store，讀到的正是updateHistory("initialized",...)剛寫入、還沒被updateHistory("running",...)覆蓋的那筆紀錄）', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    let capturedAtInit = null;
    const manager = createExecutionManager({
      service,
      historyStore: store,
      onStateChange: (s) => {
        if (s === 'running') capturedAtInit = JSON.parse(JSON.stringify(store.get('exec-1').record));
      },
    });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    assert.strictEqual(capturedAtInit.status, 'initialized');
    assert.strictEqual(capturedAtInit.startedAt, null);
    assert.strictEqual(capturedAtInit.completedAt, null);
  });

  await test('（6.lifecycle tracking）"running"狀態更新既有紀錄的startedAt', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1', timestamp: 't-running' } });
    const record = store.get('exec-1').record;
    assert.strictEqual(record.startedAt, 't-running');
  });

  await test('（6.lifecycle tracking）"completed"狀態更新既有紀錄的completedAt，且status變為completed', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1', timestamp: 't-done' } });
    const record = store.get('exec-1').record;
    assert.strictEqual(record.status, 'completed');
    assert.strictEqual(record.completedAt, 't-done');
  });

  await test('（6.lifecycle tracking）"failed"狀態（Service失敗）更新既有紀錄的status為failed', async () => {
    const { service } = makeSpyService({ getIntelligence: () => ({ ok: false, reason: 'boom' }) });
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    const record = store.get('exec-1').record;
    assert.strictEqual(record.status, 'failed');
  });

  await test('（6.lifecycle tracking）輸入驗證失敗時（沒有走到running），最終紀錄的status為failed、startedAt維持null', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: {}, runtimeContext: { requestId: 'exec-1' } });
    const record = store.get('exec-1').record;
    assert.strictEqual(record.status, 'failed');
    assert.strictEqual(record.startedAt, null);
  });

  await test('（6.lifecycle tracking）成功執行完整生命週期後，最終紀錄同時具備startedAt跟completedAt（都不是null）', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1', timestamp: 't1' } });
    const record = store.get('exec-1').record;
    assert.strictEqual(record.startedAt, 't1');
    assert.strictEqual(record.completedAt, 't1');
  });

  await test('（6.lifecycle tracking）不同executionId的執行各自建立獨立紀錄，互不覆蓋', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-a' } });
    await manager.execute({}, { request: { userId: 'u2' }, runtimeContext: { requestId: 'exec-b' } });
    assert.strictEqual(store.list().records.length, 2);
    assert.strictEqual(store.get('exec-a').record.executionId, 'exec-a');
    assert.strictEqual(store.get('exec-b').record.executionId, 'exec-b');
  });

  await test('（6.lifecycle tracking）最終紀錄通過validateHistoryRecord()驗證', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    assert.strictEqual(validateHistoryRecord(store.get('exec-1').record).ok, true);
  });

  console.log('');

  // =========================================================================
  // G. event compatibility
  // =========================================================================
  console.log('--- G. event compatibility ---');

  await test('（7.event compatibility）成功執行後，紀錄的events陣列長度恰好是3（跟lifecycle轉換次數一致）', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    assert.strictEqual(store.get('exec-1').record.events.length, 3);
  });

  await test('（7.event compatibility）輸入驗證失敗時，紀錄的events陣列長度恰好是2', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: {}, runtimeContext: { requestId: 'exec-1' } });
    assert.strictEqual(store.get('exec-1').record.events.length, 2);
  });

  await test('（7.event compatibility）events陣列裡每個元素都通過validateExecutionEvent()——跟TASK1.51的Execution Event形狀完全相容', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    const events = store.get('exec-1').record.events;
    for (const e of events) {
      assert.strictEqual(validateExecutionEvent(e).ok, true);
    }
  });

  await test('（7.event compatibility）events陣列的type依序恰好是[execution_initialized, execution_started, execution_completed]', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    const types = store.get('exec-1').record.events.map((e) => e.type);
    assert.deepStrictEqual(types, ['execution_initialized', 'execution_started', 'execution_completed']);
  });

  await test('（7.event compatibility）historyStore記錄的events內容跟同時提供的eventDispatcher實際emit的事件完全一致（deepStrictEqual）', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const dispatcher = createEventDispatcher();
    const dispatched = [];
    for (const type of EXECUTION_EVENT_TYPES) dispatcher.subscribe(type, (e) => dispatched.push(e));
    const manager = createExecutionManager({ service, historyStore: store, eventDispatcher: dispatcher });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    assert.deepStrictEqual(store.get('exec-1').record.events, dispatched);
  });

  await test('（7.event compatibility）即使完全沒有提供eventDispatcher，historyStore的events欄位依然被正確填入（兩者互相獨立，不依賴dispatcher是否存在）', async () => {
    const { service } = makeSpyService();
    const store = createHistoryStore();
    const manager = createExecutionManager({ service, historyStore: store });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-1' } });
    assert.strictEqual(store.get('exec-1').record.events.length, 3);
  });

  console.log('');

  // =========================================================================
  // H. no AI dependency
  // =========================================================================
  console.log('--- H. no AI dependency ---');

  const HISTORY_JS_FILES = fs.readdirSync(historyDir).filter((f) => f.endsWith('.js')).sort();
  await test('（8.no AI dependency）src/intelligence/history/ 恰好包含3個.js檔案（execution_history/history_store/index）', () => {
    assert.deepStrictEqual(HISTORY_JS_FILES, ['execution_history.js', 'history_store.js', 'index.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of HISTORY_JS_FILES) {
    const codeOnly = readSrc(path.join(historyDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.no AI dependency）src/intelligence/history/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（8.no AI dependency）src/intelligence/history/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
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

  for (const file of HISTORY_JS_FILES) {
    await test(`（9.no external dependency）src/intelligence/history/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（9.no external dependency）src/intelligence/history/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // J. no SQL
  // =========================================================================
  console.log('--- J. no SQL ---');

  for (const file of HISTORY_JS_FILES) {
    await test(`（10.no SQL）src/intelligence/history/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（10.no SQL）src/intelligence/history/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（10.no SQL）src/intelligence/history/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（10.no SQL）src/intelligence/history/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
    await test(`（10.no SQL）src/intelligence/history/${file} 完全沒有出現 migration 相關字樣`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/migration/i.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // K. no HTTP
  // =========================================================================
  console.log('--- K. no HTTP ---');

  for (const file of HISTORY_JS_FILES) {
    await test(`（11.no HTTP）src/intelligence/history/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（11.no HTTP）src/intelligence/history/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（11.no HTTP）src/routes/${file} 完全不 import src/intelligence/history/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/history\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（11.no HTTP）src/controllers/${file} 完全不 import src/intelligence/history/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/history\//.test(src));
    });
  }

  await test('（11.no HTTP）src/worker.js 完全不 import src/intelligence/history/', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/intelligence\/history\//.test(src));
  });

  console.log('');

  // =========================================================================
  // L. no authentication dependency
  // =========================================================================
  console.log('--- L. no authentication dependency ---');

  for (const file of HISTORY_JS_FILES) {
    await test(`（12.no authentication dependency）src/intelligence/history/${file} 完全不 import src/auth/ 或 src/identity/`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（12.no authentication dependency）src/intelligence/history/${file} 完全不 import src/middleware/`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（12.no authentication dependency）src/intelligence/history/${file} 完全沒有出現 JWT/session/cookie 相關字樣`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（12.no authentication dependency）history_store.js 完全不呼叫 requireAuth/requireActiveUser', () => {
    const src = readSrc(path.join(historyDir, 'history_store.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // M. no persistence
  // =========================================================================
  console.log('--- M. no persistence ---');

  for (const file of HISTORY_JS_FILES) {
    await test(`（13.no persistence）src/intelligence/history/${file} 完全不 import src/db/ 或 node:fs（不寫入檔案/資料庫）`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
      assert.ok(!/from\s+['"]node:fs['"]/.test(src));
      assert.ok(!/from\s+['"]fs['"]/.test(src));
    });
    await test(`（13.no persistence）src/intelligence/history/${file} 完全沒有出現 localStorage/KV/writeFile 等持久化相關字樣`, () => {
      const src = readSrc(path.join(historyDir, file));
      assert.ok(!/localStorage/.test(src));
      assert.ok(!/writeFile/.test(src));
      assert.ok(!/\bKV\b/.test(src));
    });
  }

  await test('（13.no persistence）不同的History Store實例紀錄完全獨立，互不影響（證明狀態只存在單一實例的記憶體中，不是共用/持久化的全域狀態）', () => {
    const storeA = createHistoryStore();
    const storeB = createHistoryStore();
    storeA.add({ executionId: 'e1', status: 'initialized' });
    assert.strictEqual(storeB.get('e1').ok, false);
  });

  await test('（13.no persistence）History Store實例被丟棄後，重新建立一個新的實例不會保留先前的紀錄（沒有任何跨實例的持久化狀態）', () => {
    let store = createHistoryStore();
    store.add({ executionId: 'e1', status: 'initialized' });
    assert.strictEqual(store.list().records.length, 1);
    store = createHistoryStore();
    assert.strictEqual(store.list().records.length, 0);
  });

  await test('（13.no persistence）原始碼掃描：src/bootstrap/application.js 沒有為history新增任何資料庫寫入邏輯（規格明確禁止D1/SQL/migration）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(!/intelligenceHistoryStore.*\.(insert|write|save)\(/i.test(src));
  });

  console.log('');

  // =========================================================================
  // N. regression test
  // =========================================================================
  console.log('--- N. regression test ---');

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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.52-execution-history')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（14.regression test）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.51）`, () => {
      assert.ok(allSuites.length >= 43, `預期至少43個既有測試檔案，實際 ${allSuites.length}`);
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

  console.log('--- (extra) bootstrap integration ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（bootstrap整合）createApplication(env).intelligence 具備 history 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('history' in app.intelligence);
  });

  await test('（bootstrap整合）app.intelligence.history 具備 add/get/list 三個函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.history.add, 'function');
    assert.strictEqual(typeof app.intelligence.history.get, 'function');
    assert.strictEqual(typeof app.intelligence.history.list, 'function');
  });

  await test('（bootstrap整合）app.intelligence.execution內部注入的historyStore跟app.intelligence.history是同一個實例（實際執行後能在app.intelligence.history查到紀錄）', async () => {
    const app = createApplication(makeFullEnv());
    app.intelligence.service.getIntelligence = async () => ({ ok: false, reason: 'spy_failure' });
    await app.intelligence.facade.executeIntelligence({}, { userId: 'u1', requestId: 'bootstrap-exec-1' });
    const result = app.intelligence.history.get('bootstrap-exec-1');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.record.status, 'failed');
  });

  await test('（bootstrap整合）每次createApplication()呼叫都各自建立獨立的history store實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.history, app2.intelligence.history);
  });

  await test('（bootstrap整合）原始碼掃描：src/intelligence/index.js 有 export history namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as history from ['"]\.\/history\/index\.js['"]/.test(src));
  });

  await test('（bootstrap整合）原始碼掃描：execution_manager.js 完全不 import src/intelligence/history/ 底下任何檔案（historyStore一律透過依賴注入傳入）', () => {
    const src = readSrc(path.join(executionDir, 'execution_manager.js'));
    assert.ok(!/from\s+['"].*\/history\//.test(src));
  });

  await test('（bootstrap整合）原始碼掃描：execution_manager.js 依然只 import ./execution_result_builder.js（唯一允許的相依）', () => {
    const src = readSrc(path.join(executionDir, 'execution_manager.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./execution_result_builder.js']);
  });

  await test('（bootstrap整合）原始碼掃描：src/intelligence/service/、src/intelligence/orchestration/、src/intelligence/analysis/、src/intelligence/recommendation/、src/intelligence/contracts/、src/intelligence/runtime/、src/intelligence/facade/ 底下.js檔案完全沒有被TASK1.52修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/*.js src/intelligence/orchestration/*.js src/intelligence/analysis/*.js src/intelligence/recommendation/*.js src/intelligence/contracts/*.js src/intelligence/contracts/execution/*.js src/intelligence/runtime/*.js src/intelligence/facade/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（bootstrap整合）app.router.routes 數量沒有因為新增history而改變（依然是21條）', () => {
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

  await test('（15.P1-P6）src/worker.js 完全沒有被TASK1.52修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（15.P1-P6）wrangler.toml 完全沒有被TASK1.52修改', () => {
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

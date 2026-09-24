/*
 * Phase 1 TASK 1.50｜Intelligence Execution Lifecycle Manager Foundation
 * （TASK1.51 起額外支援選填的eventDispatcher依賴，狀態轉換時額外
 * emit對應的Execution Event；TASK1.52 起額外支援選填的historyStore
 * 依賴，狀態轉換時額外記錄/更新對應的Execution History Record，
 * 皆不改變原本的執行邏輯）
 * - Intelligence Execution Manager
 *
 * 責任：在 Intelligence Facade（TASK1.48）跟 Intelligence Service
 * （TASK1.46）之間建立一個「執行生命週期管理」邊界——追蹤單次執行從
 * 開始到結束的狀態（initialized → running → completed/failed），
 * 把Service的呼叫細節、狀態轉換、成功/失敗結果標準化，全部封裝在這
 * 一層，Facade完全不需要知道底下是Service在跑、更不需要知道Service
 * 底下還有Execution Contract/Orchestrator/Pipeline。架構位置：
 *
 *   Intelligence Facade（TASK1.48）
 *     ↓
 *   Intelligence Execution Manager（這裡）── 管理執行生命週期狀態
 *     ↓
 *   Intelligence Service（TASK1.46）── 內部已用Execution Contract驗證
 *     ↓
 *   Intelligence Orchestrator（TASK1.45）
 *     ↓
 *   Intelligence Pipeline（Data Preparation/Analysis/Recommendation）
 *
 * 明確要求（Execution Manager may call / must NOT call）：
 * - ✅ 只能呼叫 Intelligence Service（透過依賴注入拿到的
 *   `service.getIntelligence()`）
 * - ❌ 不 import src/intelligence/orchestration/（不直接呼叫
 *   Orchestrator）
 * - ❌ 不 import src/intelligence/analysis/（不直接呼叫Analysis）
 * - ❌ 不 import src/intelligence/recommendation/（不直接呼叫
 *   Recommendation）
 * - ❌ 不 import src/intelligence/data_preparation/（不直接呼叫
 *   Data Preparation）
 * - ❌ 不 import src/db/ 底下任何檔案（不直接存取Database），這個
 *   檔案甚至不知道db的內部結構——db只是原樣轉交給
 *   service.getIntelligence()的不透明參數
 * - ❌ 不 import src/auth/ 或 src/identity/（不做任何身份驗證，
 *   userId一律由呼叫端當作request的欄位傳入）
 *
 * 生命週期狀態（見execution_state.js，固定四個，沒有其他狀態）：
 * 1. state = "initialized" —— execute()剛開始
 * 2. state = "running" —— 驗證輸入通過後，準備呼叫Service
 * 3. Service成功 → state = "completed"，回傳
 *    {ok:true, state:"completed", data:{status, result}}
 * 4. Service失敗（或依賴缺漏/輸入驗證失敗）→ state = "failed"，回傳
 *    {ok:false, state:"failed", reason}
 *
 * 每次`execute()`呼叫都是獨立的一次性生命週期，不跨呼叫共用狀態。
 * 狀態轉換本身透過選填的`dependencies.onStateChange(state)`依賴注入
 * 鉤子對外可觀察（供測試驗證轉換順序），不提供時完全不影響行為——
 * 這不是一個可以被外部輪詢的持久化狀態機，只是讓「這一次execute()
 * 呼叫依序經過了哪些狀態」變得可驗證。
 *
 * TASK1.51新增：額外支援選填的`dependencies.eventDispatcher`——每次
 * 狀態轉換除了呼叫既有的`onStateChange(state)`之外，如果有提供
 * eventDispatcher，還會額外呼叫`eventDispatcher.emit()`發送對應的
 * Execution Event（見src/intelligence/events/）。Lifecycle Mapping
 * （規格原文，寫死在這個檔案自己的常數對照表，完全不import
 * src/intelligence/events/底下任何檔案）：
 *
 *   "initialized" → "execution_initialized"
 *   "running"     → "execution_started"
 *   "completed"   → "execution_completed"
 *   "failed"      → "execution_failed"
 *
 * 事件的`executionId`/`timestamp`取自Facade建立的Runtime Context
 * （`runtimeContext.requestId`/`runtimeContext.timestamp`，沒有提供
 * 時安全為null），`payload`在completed/failed狀態時分別帶上
 * `{status}`/`{reason}`，initialized/running狀態的payload為null。
 * 這是純粹新增的旁路行為——`eventDispatcher`是選填依賴，不提供時
 * 完全不影響`execute()`的行為；就算提供了，emit()呼叫失敗或訂閱者
 * 拋出例外也完全不影響execute()的回傳結果（見
 * event_dispatcher.js的emit()實作），確保「事件處理跟執行邏輯完全
 * independent」。
 *
 * TASK1.52新增：額外支援選填的`dependencies.historyStore`——每次
 * 狀態轉換除了既有的`onStateChange(state)`/`eventDispatcher.emit()`
 * 之外，如果有提供historyStore，還會額外呼叫其`add()`/`get()`建立/
 * 更新一筆以`executionId`為key的Execution History Record（見
 * src/intelligence/history/）。Lifecycle Mapping（規格原文，寫死在
 * 這個檔案自己的`updateHistory()`函式，完全不import
 * src/intelligence/history/底下任何檔案）：
 *
 *   "initialized" → 建立新的history record
 *   "running"     → 更新既有record的startedAt
 *   "completed"   → 更新既有record的completedAt
 *   "failed"      → 更新既有record的status為failed
 *
 * 每次狀態轉換都會把當下（跟eventDispatcher送出的）同一份Execution
 * Event形狀的物件附加進record.events陣列，讓History Record的events
 * 欄位跟Execution Event（TASK1.51）保持結構相容，但這裡完全不import
 * execution_event.js，這個形狀物件是這個檔案自己組出來的字面值。
 * `historyStore`是選填依賴，不提供時、或執行過程中沒有可用的
 * executionId時，完全不影響`execute()`的行為；就算提供了，
 * add()/get()呼叫失敗也完全不影響execute()的回傳結果——跟
 * eventDispatcher一樣用try/catch隔絕，確保「歷史記錄跟執行邏輯完全
 * independent」。
 */
import { createExecutionResultBuilder } from './execution_result_builder.js';

const STATE_TO_EVENT_TYPE = Object.freeze({
  initialized: 'execution_initialized',
  running: 'execution_started',
  completed: 'execution_completed',
  failed: 'execution_failed',
});

/**
 * 從execute()的input裡（在還沒驗證input是否合法之前）安全取出
 * Runtime Context的requestId/timestamp，供事件的executionId/
 * timestamp欄位使用。input格式不正確時安全回傳null，不拋出例外——
 * 這裡完全不解讀runtimeContext的其他內容，也不驗證其格式，那是
 * Runtime Context Layer（TASK1.49）的責任。
 *
 * @param {*} input
 * @returns {{executionId:string|null, timestamp:string|null}}
 */
function extractEventMeta(input) {
  const runtimeContext = input && typeof input === 'object' && !Array.isArray(input) ? input.runtimeContext : undefined;
  const executionId = runtimeContext && typeof runtimeContext === 'object' && typeof runtimeContext.requestId === 'string' ? runtimeContext.requestId : null;
  const timestamp = runtimeContext && typeof runtimeContext === 'object' && typeof runtimeContext.timestamp === 'string' ? runtimeContext.timestamp : null;
  return { executionId, timestamp };
}

/**
 * 驗證 execute() 的輸入——只檢查這一層自己需要知道的最小欄位
 * （input.request是否存在、request.userId是否為非空字串、
 * request.options存在時是否為物件），不解讀options的業務內容（那是
 * 更底層Service/Execution Contract的責任），也不解讀runtimeContext的
 * 內容（那是Runtime Context Layer/TASK1.49的責任，這裡只是原樣轉交）。
 *
 * @param {*} input
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateExecuteInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'invalid_input' };
  }
  const { request } = input;
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_request' };
  }
  if (typeof request.userId !== 'string' || request.userId.length === 0) {
    return { ok: false, reason: 'invalid_user_id' };
  }
  if (request.options !== undefined && (request.options === null || typeof request.options !== 'object' || Array.isArray(request.options))) {
    return { ok: false, reason: 'invalid_options_type' };
  }
  return { ok: true };
}

/**
 * @param {object} dependencies
 * @param {{getIntelligence: (db:object, request:{userId:string, options?:object}) => Promise<{ok:boolean, data?:object, reason?:string}>}} dependencies.service
 * @param {{buildCompletedResult: Function, buildFailedResult: Function}} [dependencies.resultBuilder]
 * @param {(state:string) => void} [dependencies.onStateChange] - 選填的
 *   狀態轉換觀察鉤子，每次狀態轉換（initialized/running/completed/
 *   failed）都會被呼叫一次，純粹用於觀察，不影響任何回傳值；不提供時
 *   完全不影響行為
 * @param {{emit: (event:object) => {ok:boolean, handlerCount?:number, reason?:string}}} [dependencies.eventDispatcher] - 選填的
 *   Execution Event Dispatcher（TASK1.51，見
 *   src/intelligence/events/event_dispatcher.js），每次狀態轉換時
 *   額外emit對應的Execution Event；不提供時完全不影響行為
 * @param {{add: (record:object) => {ok:boolean, reason?:string}, get: (executionId:string) => {ok:boolean, record?:object, reason?:string}}} [dependencies.historyStore] - 選填的
 *   Execution History Store（TASK1.52，見
 *   src/intelligence/history/history_store.js），每次狀態轉換時
 *   額外建立/更新對應的Execution History Record；不提供時完全不影響
 *   行為
 * @returns {{execute: (db:object, input:{request:{userId:string, options?:object}, runtimeContext?:object}) => Promise<{ok:true, state:"completed", data:{status:*, result:object}}|{ok:false, state:"failed", reason:string}>}}
 */
export function createExecutionManager(dependencies) {
  dependencies = dependencies || {};
  const { service, onStateChange, eventDispatcher, historyStore } = dependencies;
  const resultBuilder = dependencies.resultBuilder || createExecutionResultBuilder();

  /**
   * 建立/更新一筆以`meta.executionId`為key的Execution History
   * Record。跟`setState()`的eventDispatcher呼叫一樣，完全不影響
   * `execute()`的回傳值——任何例外都被吞掉，`historyStore`不可用或
   * `meta.executionId`不是非空字串時安全跳過整個記錄行為。
   *
   * @param {string} state - 目標狀態（initialized/running/completed/failed）
   * @param {{executionId:string|null, timestamp:string|null}} meta
   * @param {object} event - 跟eventDispatcher送出的同一份Execution
   *   Event形狀物件，附加進record.events陣列
   */
  function updateHistory(state, meta, event) {
    if (!historyStore || typeof historyStore.add !== 'function' || typeof historyStore.get !== 'function') {
      return;
    }
    if (!meta || typeof meta.executionId !== 'string' || meta.executionId.length === 0) {
      return;
    }
    try {
      if (state === 'initialized') {
        historyStore.add({
          executionId: meta.executionId,
          status: 'initialized',
          startedAt: null,
          completedAt: null,
          events: [event],
          metadata: {},
        });
        return;
      }
      const existingResult = historyStore.get(meta.executionId);
      if (!existingResult || !existingResult.ok) {
        return;
      }
      const existing = existingResult.record;
      const events = Array.isArray(existing.events) ? existing.events.concat([event]) : [event];
      let record;
      if (state === 'running') {
        record = Object.assign({}, existing, { status: 'running', startedAt: meta.timestamp, events });
      } else if (state === 'completed') {
        record = Object.assign({}, existing, { status: 'completed', completedAt: meta.timestamp, events });
      } else if (state === 'failed') {
        record = Object.assign({}, existing, { status: 'failed', events });
      } else {
        return;
      }
      historyStore.add(record);
    } catch (_error) {
      // 歷史記錄失敗（或store實作拋出例外）完全不應該影響Execution
      // Manager本身的執行邏輯，這裡刻意用try/catch隔絕，維持「歷史
      // 記錄跟執行邏輯完全independent」。
    }
  }

  /**
   * @param {string} next - 目標狀態（initialized/running/completed/failed）
   * @param {{executionId:string|null, timestamp:string|null}} meta
   * @param {*} [payload] - 選填，completed/failed狀態時分別帶
   *   {status}/{reason}，其餘狀態為null
   */
  function setState(next, meta, payload) {
    if (typeof onStateChange === 'function') {
      onStateChange(next);
    }
    const event = {
      type: STATE_TO_EVENT_TYPE[next],
      timestamp: meta ? meta.timestamp : null,
      executionId: meta ? meta.executionId : null,
      payload: payload !== undefined ? payload : null,
    };
    if (eventDispatcher && typeof eventDispatcher.emit === 'function') {
      try {
        eventDispatcher.emit(event);
      } catch (_error) {
        // 事件發送失敗（或訂閱者拋出未被event_dispatcher.js吞掉的
        // 例外）完全不應該影響Execution Manager本身的執行邏輯，這裡
        // 刻意用try/catch隔絕，維持「事件處理跟執行邏輯完全
        // independent」。
      }
    }
    updateHistory(next, meta, event);
    return next;
  }

  /**
   * 管理單次Intelligence執行的生命週期：initialized → running →
   * （Service呼叫）→ completed/failed。任何一步失敗都立刻回傳
   * {ok:false, state:"failed", reason}，不會用不完整的資料頂替繼續
   * 執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給service.getIntelligence()
   * @param {{request:{userId:string, options?:object}, runtimeContext?:object}} input -
   *   `request`是業務請求（userId必填、options選填），`runtimeContext`
   *   （選填）是Facade建立的Runtime Context（TASK1.49），這裡完全不
   *   解讀其內容，只負責合併進轉交給Service的options.runtimeContext
   *   欄位，跟（TASK1.51新增）供事件的executionId/timestamp欄位使用
   * @returns {Promise<{ok:true, state:"completed", data:{status:string, result:{context:object, analysis:object, recommendation:object, metadata:object}}}|{ok:false, state:"failed", reason:string}>}
   */
  async function execute(db, input) {
    const meta = extractEventMeta(input);

    setState('initialized', meta);

    const validation = validateExecuteInput(input);
    if (!validation.ok) {
      setState('failed', meta, { reason: validation.reason });
      return resultBuilder.buildFailedResult(validation.reason);
    }

    const { request, runtimeContext } = input;

    setState('running', meta);

    if (!service || typeof service.getIntelligence !== 'function') {
      setState('failed', meta, { reason: 'service_unavailable' });
      return resultBuilder.buildFailedResult('service_unavailable');
    }

    const options = Object.assign({}, request.options, runtimeContext !== undefined ? { runtimeContext } : {});
    const outcome = await service.getIntelligence(db, { userId: request.userId, options });

    if (!outcome.ok) {
      setState('failed', meta, { reason: outcome.reason });
      return resultBuilder.buildFailedResult(outcome.reason);
    }

    setState('completed', meta, { status: outcome.data.status });
    return resultBuilder.buildCompletedResult(outcome.data);
  }

  return { execute };
}

/*
 * Phase 1 TASK 1.51｜Intelligence Execution Event Layer Foundation
 * - Event Dispatcher
 *
 * 責任：提供一個純記憶體的內部事件訂閱/發送機制——`subscribe()`/
 * `emit()`，讓Execution Manager（TASK1.50）的生命週期狀態轉換可以被
 * 任何訂閱者觀察到，而完全不需要Execution Manager跟訂閱者互相知道
 * 對方的存在（訂閱者透過`subscribe(eventType, handler)`註冊，
 * Execution Manager只需要呼叫`emit(event)`，兩者之間完全靠這個
 * dispatcher轉發）。
 *
 * 明確要求：
 * - deterministic behavior：同樣的訂閱者清單、同樣的event，任何時候
 *   `emit()`都會依照訂閱順序呼叫同一組handler，不讀取
 *   Date.now()/Math.random()/任何外部狀態
 * - synchronous execution allowed：`emit()`同步依序呼叫每個handler，
 *   不使用Promise/setTimeout/microtask排隊（跟Node.js
 *   EventEmitter.emit()同樣的同步語意）
 * - no external dependency：完全不 import 任何非相對路徑的外部套件，
 *   不呼叫fetch()、不connect任何服務
 * - no persistence：不寫入任何檔案/資料庫/KV，訂閱清單只存在於
 *   dispatcher實例的記憶體中（一個JS closure裡的Map），dispatcher
 *   實例被丟棄後，訂閱清單也跟著消失，不做任何持久化
 *
 * 這個檔案完全不知道Execution Event的業務語意（不知道
 * "execution_initialized"代表什麼），只負責機械式的「event.type →
 * 對應的handler清單」轉發，實際的事件形狀驗證交給
 * execution_event.js的validateExecutionEvent()。
 */
import { validateExecutionEvent } from './execution_event.js';

/**
 * @returns {{
 *   subscribe: (eventType:string, handler:(event:object) => void) => {ok:true, unsubscribe:() => void}|{ok:false, reason:string},
 *   emit: (event:object) => {ok:true, handlerCount:number}|{ok:false, reason:string, field?:string}
 * }}
 */
export function createEventDispatcher() {
  /** @type {Map<string, Array<(event:object) => void>>} */
  const handlersByType = new Map();

  /**
   * 註冊一個特定事件類型的handler。同一個eventType可以重複訂閱多次
   * （多個handler依訂閱順序依序被呼叫）。
   *
   * @param {*} eventType - 必須是非空字串，這裡不驗證是不是
   *   EXECUTION_EVENT_TYPES其中之一——訂閱一個目前還沒有任何事件會用到
   *   的類型是合法的（純粹還沒有對應的emit()而已）
   * @param {*} handler - 必須是函式
   * @returns {{ok:true, unsubscribe:() => void}|{ok:false, reason:string}}
   */
  function subscribe(eventType, handler) {
    if (typeof eventType !== 'string' || eventType.length === 0) {
      return { ok: false, reason: 'invalid_event_type' };
    }
    if (typeof handler !== 'function') {
      return { ok: false, reason: 'invalid_handler' };
    }

    if (!handlersByType.has(eventType)) {
      handlersByType.set(eventType, []);
    }
    const handlers = handlersByType.get(eventType);
    handlers.push(handler);

    function unsubscribe() {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) {
        handlers.splice(idx, 1);
      }
    }

    return { ok: true, unsubscribe };
  }

  /**
   * 驗證event形狀後，依訂閱順序同步呼叫所有訂閱了`event.type`的
   * handler。任何一個handler內部拋出的例外都不會影響其他handler被
   * 呼叫，也不會讓emit()本身拋出例外——事件處理必須跟Execution
   * Manager的實際執行邏輯完全independent，一個訂閱者的bug不應該
   * 影響Intelligence執行本身。
   *
   * @param {*} event - {type, timestamp?, executionId?, payload?}
   * @returns {{ok:true, handlerCount:number}|{ok:false, reason:string, field?:string}}
   */
  function emit(event) {
    const validation = validateExecutionEvent(event);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason, field: validation.field };
    }

    const handlers = handlersByType.get(event.type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (_error) {
        // 刻意吞掉訂閱者拋出的例外：事件處理必須跟Execution Manager
        // 的執行邏輯完全independent，一個訂閱者的bug不應該讓emit()
        // 拋出例外進而影響呼叫端（Execution Manager）的正常流程。
      }
    }

    return { ok: true, handlerCount: handlers.length };
  }

  return { subscribe, emit };
}

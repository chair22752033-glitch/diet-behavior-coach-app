/*
 * Phase 1 TASK 1.53｜Intelligence Execution Monitoring Layer Foundation
 * - Intelligence Execution Monitor
 *
 * 責任：在Execution Manager（TASK1.50）、Execution Event（TASK1.51）、
 * Execution History（TASK1.52）之上，建立一個純讀取、純觀察的監控
 * 邊界——`createExecutionMonitor({historyStore, eventDispatcher})`
 * 完全不呼叫、不修改、也不知道Execution Manager本身，只透過依賴
 * 注入拿到的`historyStore`（TASK1.52的History Store，提供
 * `get()`/`list()`）跟`eventDispatcher`（TASK1.51的Event Dispatcher，
 * 提供`subscribe()`）觀察執行生命週期，這是刻意的邊界決策——
 * `keep monitoring separated from execution logic`：這個檔案完全不
 * import src/intelligence/history/或src/intelligence/events/底下
 * 任何檔案，`historyStore`/`eventDispatcher`一律是透過依賴注入傳入
 * 的、符合最小介面（`{get, list}`/`{subscribe}`）的不透明物件。
 *
 * 架構位置：
 *
 *   Intelligence Facade（TASK1.48）
 *     ↓
 *   Intelligence Execution Manager（TASK1.50）── 生命週期狀態轉換時
 *     ↓                          ↘                    ↘
 *   Intelligence Service      Event Dispatcher      History Store
 *   （TASK1.46）                （TASK1.51）           （TASK1.52）
 *                                    ↑                    ↑
 *                                    └── 訂閱 ──┐  ┌── 讀取 ──┘
 *                                               ↓  ↓
 *                                        Execution Monitor（這裡）
 *
 * 事件觀察方式：建立時（如果有提供合法的`eventDispatcher`），對固定
 * 四個生命週期事件類型（跟TASK1.51的EXECUTION_EVENT_TYPES一致，
 * 但這裡刻意寫死自己的字面值常數，不import該檔案，維持「每一層只
 * 認識自己需要的最小形狀」的既有慣例）各自呼叫一次
 * `eventDispatcher.subscribe(type, handler)`，訂閱到的事件依
 * `event.executionId`分組累積在Monitor自己的記憶體`Map`裡——這是
 * Monitor自己獨立的一份觀察紀錄，不讀取、也不依賴History Record裡
 * 自己的`events`欄位（TASK1.52的History Record雖然也有一份events
 * 拷貝，但那是History Store的內部細節，Monitor刻意透過Event
 * Dispatcher直接觀察，維持跟Execution Event系統的直接對應關係）。
 *
 * 提供三個介面（規格明確列出，這裡刻意不多也不少）：
 * - getExecutionStatus(executionId)：合併History（status/metadata）
 *   跟Monitor自己觀察到的events，組成單一Execution Status。History
 *   查詢失敗（找不到/無效executionId/historyStore未提供）時整個
 *   查詢失敗，不用不完整的資料頂替。
 * - getExecutionHistory(executionId)：單純轉發`historyStore.get()`，
 *   `historyStore`未提供或executionId不合法時安全回傳失敗，不拋出
 *   例外。
 * - getSummary()：讀取`historyStore.list()`全部紀錄，依status分類
 *   統計出`{totalExecutions, completed, failed, running}`——
 *   `completed`/`failed`各自對應History Record的`completed`/
 *   `failed`狀態，其餘所有狀態（`initialized`/`running`/未知狀態）
 *   一律歸類為`running`（尚未結束的執行），確保
 *   `totalExecutions = completed + failed + running`恆成立。
 *
 * 全部三個介面都是純讀取（不修改historyStore/eventDispatcher的任何
 * 狀態），`historyStore`/`eventDispatcher`未提供時安全回傳預設值/
 * 失敗結果，不拋出例外——這是純粹的觀察層，不會、也不能影響
 * Execution Manager本身的執行邏輯。
 */
import { buildExecutionStatus, buildSummary } from './monitoring_result_builder.js';

const MONITORED_EVENT_TYPES = Object.freeze([
  'execution_initialized',
  'execution_started',
  'execution_completed',
  'execution_failed',
]);

/**
 * @param {{historyStore?:{get:Function, list:Function}, eventDispatcher?:{subscribe:Function}}} options
 * @returns {{
 *   getExecutionStatus: (executionId:string) => {ok:true, status:object}|{ok:false, reason:string},
 *   getExecutionHistory: (executionId:string) => {ok:true, record:object}|{ok:false, reason:string},
 *   getSummary: () => {ok:true, summary:{totalExecutions:number, completed:number, failed:number, running:number}}
 * }}
 */
export function createExecutionMonitor(options) {
  options = options || {};
  const { historyStore, eventDispatcher } = options;
  const eventsByExecutionId = new Map();

  function recordEvent(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return;
    }
    if (typeof event.executionId !== 'string' || event.executionId.length === 0) {
      return;
    }
    const list = eventsByExecutionId.get(event.executionId) || [];
    list.push(event);
    eventsByExecutionId.set(event.executionId, list);
  }

  if (eventDispatcher && typeof eventDispatcher.subscribe === 'function') {
    for (const type of MONITORED_EVENT_TYPES) {
      try {
        eventDispatcher.subscribe(type, recordEvent);
      } catch (_error) {
        // 訂閱失敗完全不應該影響Monitor本身的建立，這裡刻意用
        // try/catch隔絕，維持「監控跟執行邏輯完全independent」。
      }
    }
  }

  /**
   * @param {string} executionId
   * @returns {{ok:true, record:object}|{ok:false, reason:string}}
   */
  function getExecutionHistory(executionId) {
    if (typeof executionId !== 'string' || executionId.length === 0) {
      return { ok: false, reason: 'invalid_execution_id' };
    }
    if (!historyStore || typeof historyStore.get !== 'function') {
      return { ok: false, reason: 'history_unavailable' };
    }
    return historyStore.get(executionId);
  }

  /**
   * @param {string} executionId
   * @returns {{ok:true, status:object}|{ok:false, reason:string}}
   */
  function getExecutionStatus(executionId) {
    if (typeof executionId !== 'string' || executionId.length === 0) {
      return { ok: false, reason: 'invalid_execution_id' };
    }
    const historyResult = getExecutionHistory(executionId);
    if (!historyResult.ok) {
      return { ok: false, reason: historyResult.reason };
    }
    const events = eventsByExecutionId.get(executionId) || [];
    const status = buildExecutionStatus({
      status: historyResult.record.status,
      executionId,
      history: historyResult.record,
      events,
      metadata: historyResult.record.metadata,
    });
    return { ok: true, status };
  }

  /**
   * @returns {{ok:true, summary:{totalExecutions:number, completed:number, failed:number, running:number}}}
   */
  function getSummary() {
    let records = [];
    if (historyStore && typeof historyStore.list === 'function') {
      const listResult = historyStore.list();
      if (listResult && listResult.ok && Array.isArray(listResult.records)) {
        records = listResult.records;
      }
    }
    let completed = 0;
    let failed = 0;
    let running = 0;
    for (const record of records) {
      if (record && record.status === 'completed') {
        completed += 1;
      } else if (record && record.status === 'failed') {
        failed += 1;
      } else {
        running += 1;
      }
    }
    const summary = buildSummary({ totalExecutions: records.length, completed, failed, running });
    return { ok: true, summary };
  }

  return { getExecutionStatus, getExecutionHistory, getSummary };
}

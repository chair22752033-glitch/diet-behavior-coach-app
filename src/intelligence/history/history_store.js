/*
 * Phase 1 TASK 1.52｜Intelligence Execution History Layer Foundation
 * - In-Memory History Store
 *
 * 責任：提供一個純記憶體的Execution History紀錄集合，跟TASK1.51的
 * event_dispatcher.js是同一種角色（純記憶體、instance-scoped、完全
 * 沒有任何持久化）。`createHistoryStore()`回傳的實例把紀錄存在單一
 * closure裡的Map（key為executionId），沒有任何檔案/資料庫/KV寫入——
 * 實例被丟棄後，全部歷史紀錄一併消失。
 *
 * 提供三個操作：
 * - add(record)：驗證record形狀（透過execution_history.js的
 *   validateHistoryRecord()）後，以record.executionId為key存入/覆蓋
 *   Map。同一個executionId重複呼叫add()會覆蓋既有紀錄——這是刻意的
 *   設計，讓Execution Manager可以在同一次執行的不同生命週期階段
 *   （initialized/running/completed/failed）重複呼叫add()來更新同一筆
 *   紀錄，不需要額外提供update()介面。
 * - get(executionId)：依executionId查詢單筆紀錄，找不到時回傳
 *   {ok:false, reason:'not_found'}，不拋出例外。
 * - list()：回傳目前store裡全部紀錄的陣列（依插入/覆蓋順序，Map本身
 *   保證插入順序的迭代順序）。
 */
import { validateHistoryRecord } from './execution_history.js';

/**
 * @returns {{
 *   add: (record:object) => {ok:true}|{ok:false, reason:string, field?:string},
 *   get: (executionId:string) => {ok:true, record:object}|{ok:false, reason:string},
 *   list: () => {ok:true, records:object[]}
 * }}
 */
export function createHistoryStore() {
  const recordsById = new Map();

  function add(record) {
    const validation = validateHistoryRecord(record);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason, field: validation.field };
    }
    recordsById.set(record.executionId, record);
    return { ok: true };
  }

  function get(executionId) {
    if (typeof executionId !== 'string' || executionId.length === 0) {
      return { ok: false, reason: 'invalid_execution_id' };
    }
    if (!recordsById.has(executionId)) {
      return { ok: false, reason: 'not_found' };
    }
    return { ok: true, record: recordsById.get(executionId) };
  }

  function list() {
    return { ok: true, records: Array.from(recordsById.values()) };
  }

  return { add, get, list };
}

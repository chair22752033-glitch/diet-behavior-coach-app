/*
 * Phase 1 TASK 1.52｜Intelligence Execution History Layer Foundation
 * - Execution History Record 定義
 *
 * 責任：定義單次Intelligence執行的歷史紀錄形狀，跟TASK1.51的
 * execution_event.js是同一種角色（純資料定義 + 純函式驗證/建構），
 * 完全不做任何持久化——這裡只負責「一筆歷史紀錄長什麼樣子」，
 * 紀錄實際存在哪裡是history_store.js的責任。
 *
 * Shape:
 *   { executionId, status, startedAt, completedAt, events, metadata }
 *
 * 必填：executionId（非空字串）、status（非空字串，不限定固定列舉——
 * 跟execution_event.js的`type`不同，這裡的status反映的是Execution
 * Manager既有的生命週期狀態字面值（initialized/running/completed/
 * failed，見execution_state.js），但這個檔案刻意不import
 * execution_state.js也不驗證status是否為那四個字之一，維持「每一層
 * 只認識自己需要的最小形狀」的既有慣例）。
 * 選填：startedAt/completedAt（字串或null）、events（陣列，預設空
 * 陣列，用來存放跟這次執行相關的Execution Event——形狀跟TASK1.51的
 * execution_event.js相容，但這裡完全不import該檔案，也不驗證陣列裡
 * 每個元素的形狀，只確認events本身是陣列）、metadata（物件，預設
 * 空物件）。
 *
 * 全部函式都是純函式，不讀取Date.now()/Math.random()——
 * startedAt/completedAt一律由呼叫端明確傳入，未提供時安全預設為
 * null，維持TASK1.43起建立的「確定性輸出」既有慣例。
 */

export const HistoryRecordContract = {
  name: 'ExecutionHistoryRecord',
  required: ['executionId', 'status'],
  optional: ['startedAt', 'completedAt', 'events', 'metadata'],
};

/**
 * @param {*} record
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
export function validateHistoryRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, reason: 'invalid_record' };
  }
  if (typeof record.executionId !== 'string' || record.executionId.length === 0) {
    return { ok: false, reason: 'invalid_execution_id', field: 'executionId' };
  }
  if (typeof record.status !== 'string' || record.status.length === 0) {
    return { ok: false, reason: 'invalid_status', field: 'status' };
  }
  if (record.startedAt !== undefined && record.startedAt !== null && typeof record.startedAt !== 'string') {
    return { ok: false, reason: 'invalid_field_type', field: 'startedAt' };
  }
  if (record.completedAt !== undefined && record.completedAt !== null && typeof record.completedAt !== 'string') {
    return { ok: false, reason: 'invalid_field_type', field: 'completedAt' };
  }
  if (record.events !== undefined && record.events !== null && !Array.isArray(record.events)) {
    return { ok: false, reason: 'invalid_field_type', field: 'events' };
  }
  if (
    record.metadata !== undefined &&
    record.metadata !== null &&
    (typeof record.metadata !== 'object' || Array.isArray(record.metadata))
  ) {
    return { ok: false, reason: 'invalid_field_type', field: 'metadata' };
  }
  return { ok: true };
}

/**
 * 把（可能不完整的）輸入套上固定預設值後組成通過驗證的歷史紀錄。
 *
 * @param {*} input
 * @returns {{ok:true, record:object}|{ok:false, reason:string, field?:string}}
 */
export function createHistoryRecord(input) {
  input = input && typeof input === 'object' ? input : {};
  const record = {
    executionId: input.executionId,
    status: input.status,
    startedAt: input.startedAt !== undefined ? input.startedAt : null,
    completedAt: input.completedAt !== undefined ? input.completedAt : null,
    events: input.events !== undefined ? input.events : [],
    metadata: input.metadata !== undefined ? input.metadata : {},
  };
  const validation = validateHistoryRecord(record);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason, field: validation.field };
  }
  return { ok: true, record };
}

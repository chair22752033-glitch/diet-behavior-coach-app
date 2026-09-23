/*
 * Phase 1 TASK 1.20｜Response Format 統一
 *
 * 所有 controller 一律用這兩個函式包裝回傳值，確保未來任何一條
 * API route（本次不建立）呼叫任何 controller 時，都拿到同一種形狀的
 * 回應物件，不需要對每個 controller 各自記一套回傳格式。
 */

/**
 * @param {*} [data] 成功時要回傳的資料主體，省略時預設為空物件
 * @returns {{ok:true, data:*}}
 */
export function success(data) {
  return { ok: true, data: data === undefined ? {} : data };
}

/**
 * @param {string} [reason] 失敗原因（延用 application/identity/session 各層已經在用的 reason 字串）
 * @param {number} [status] 選填，供未來真正接上 HTTP route 時決定回應的狀態碼；
 *   這裡只是把它帶在回傳物件上，不代表這個檔案本身有任何 HTTP 相關邏輯
 * @returns {{ok:false, reason:string, status?:number}}
 */
export function failure(reason, status) {
  const result = { ok: false, reason: reason || 'unknown_error' };
  if (typeof status === 'number') result.status = status;
  return result;
}

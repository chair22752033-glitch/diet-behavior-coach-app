/*
 * Phase 1 TASK 1.28｜Response Contract
 *
 * success(data) / failure(reason, status) 是整個 API 回應格式的唯一權威
 * 定義。TASK1.20 的 src/controllers/response.js 原本自己定義這兩個函式，
 * 現在改成從這裡 re-export（見該檔案），維持既有的 import 路徑向下相容，
 * 同時把「回應形狀該長怎樣」的定義權集中到 Contract Layer——未來任何
 * API層（controller/router/middleware）都應該從這裡取得，不再各自定義。
 *
 * 內容跟 TASK1.20 的版本完全一致，這裡只是搬家、統一權威來源，不改變
 * 任何一行行為。
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
 * @param {number} [status] 選填，供接上 HTTP route 時決定回應的狀態碼；
 *   這裡只是把它帶在回傳物件上，不代表這個檔案本身有任何 HTTP 相關邏輯
 * @returns {{ok:false, reason:string, status?:number}}
 */
export function failure(reason, status) {
  const result = { ok: false, reason: reason || 'unknown_error' };
  if (typeof status === 'number') result.status = status;
  return result;
}

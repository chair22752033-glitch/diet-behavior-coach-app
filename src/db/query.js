/*
 * Phase 1 TASK 1.12｜D1 Database Access Layer - Query Wrapper
 *
 * 純粹包裝 D1 PreparedStatement API（prepare/bind/run/all/first），
 * 統一錯誤處理與回傳格式，不含任何業務邏輯，也不知道任何一張表的欄位長怎樣。
 *
 * 重要：本檔案（以及整個 src/db/ 目錄）本次完全不會被 src/worker.js 引用。
 * 只是先把「將來要接上 D1 時該長怎樣」的基礎層準備好，本次不接入現有功能。
 */

export function prepareStatement(db, sql, params) {
  let stmt = db.prepare(sql);
  if (params && params.length) stmt = stmt.bind(...params);
  return stmt;
}

/**
 * 執行一個不需要回傳資料列的 SQL（INSERT/UPDATE/DELETE）
 * @returns {Promise<{ok:boolean, meta?:object, error?:string}>}
 */
export async function run(db, sql, params) {
  try {
    const result = await prepareStatement(db, sql, params).run();
    return { ok: true, meta: result.meta || {} };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

/**
 * 執行一個回傳多筆資料列的 SQL（SELECT）
 * @returns {Promise<{ok:boolean, results:Array, meta?:object, error?:string}>}
 */
export async function all(db, sql, params) {
  try {
    const result = await prepareStatement(db, sql, params).all();
    return { ok: true, results: result.results || [], meta: result.meta || {} };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), results: [] };
  }
}

/**
 * 執行一個只需要回傳單筆資料列（或 null）的 SQL
 * @returns {Promise<{ok:boolean, row:object|null, error?:string}>}
 */
export async function first(db, sql, params) {
  try {
    const row = await prepareStatement(db, sql, params).first();
    return { ok: true, row: row || null };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), row: null };
  }
}

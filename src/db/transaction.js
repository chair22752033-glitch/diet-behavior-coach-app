/*
 * Phase 1 TASK 1.12｜D1 Database Access Layer - Transaction 基礎架構
 *
 * D1 沒有傳統資料庫的 BEGIN/COMMIT 交易語法，而是用 `db.batch([...])`：
 * 把多個 prepared statement 一次送進去，D1 保證「全部成功才提交，任何一個失敗全部回滾」。
 * 這裡提供兩種用法：低階的 batch()，以及高階、可讀性較好的 withTransaction()。
 */
import { prepareStatement } from './query.js';

/**
 * 低階 batch：statements 是 [{sql, params}, ...]，用 D1 原生 batch 執行
 * @returns {Promise<{ok:boolean, results?:Array, error?:string}>}
 */
export async function batch(db, statements) {
  if (!statements || statements.length === 0) return { ok: true, results: [] };
  try {
    const prepared = statements.map((s) => prepareStatement(db, s.sql, s.params));
    const results = await db.batch(prepared);
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

/**
 * 高階輔助：呼叫端用 `addStatement(sql, params)` 累積要執行的陳述式，
 * builderFn 執行完後統一送進 batch()。方便未來遷移多筆關聯資料時
 * （例如同時寫入 users + food_events + emotion_records）用可讀的方式組交易。
 *
 * @param {object} db - env.DIET_COACH_DB
 * @param {(addStatement: (sql:string, params?:Array) => void) => (void|Promise<void>)} builderFn
 * @returns {Promise<{ok:boolean, results?:Array, error?:string}>}
 */
export async function withTransaction(db, builderFn) {
  const statements = [];
  const addStatement = (sql, params) => { statements.push({ sql, params: params || [] }); };
  await builderFn(addStatement);
  return batch(db, statements);
}

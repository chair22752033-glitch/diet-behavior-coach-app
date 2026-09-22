/*
 * Phase 1 TASK 1.16｜Import Transaction
 *
 * 提供 runImportTransaction(db, callback)：讓一次 legacy import（建立user +
 * 寫入exploration/food/emotion/behavior紀錄）在邏輯上「要嘛全部成功、要嘛
 * 全部復原」，任何一步失敗就把這次流程裡已經寫入的資料全部刪除。
 *
 * ---- 重要的技術限制說明（誠實揭露，不是實作疏漏）----
 * Cloudflare D1 的原生 binding 目前只提供 `db.batch([...])` 做「多個statement
 * 一次送出、要嘛全部成功要嘛全部失敗」的原子性，但 batch() 要求「所有statement
 * 事先準備好」，不支援「先執行一個INSERT、用它RETURNING回來的id去組下一個
 * statement」這種依序依賴的寫法。而本次 legacy import 剛好就需要這種依賴
 * （food_events 的自增id要拿來設定 emotion_records.linked_food_event_id），
 * 所以無法直接用 db.batch() 包住整個流程。
 *
 * 因此這裡採用「補償式回滾（compensating rollback / saga pattern）」：
 * 依序執行每一步、記錄每一筆成功寫入的 (table, id)，若中途任何一步失敗，
 * 就反向依序把已經寫入的資料一筆筆 DELETE 掉。這是 D1 應用在這類場景下
 * 業界常見的作法，雖然嚴格來說不是資料庫層級的 ACID 交易，但能達到
 * 「這次 import 沒有全部成功，就不該留下任何一筆半成品資料」的實務目標。
 *
 * 這裡使用的 db.run() 是 TASK1.12 db access layer 已經公開的底層方法
 * （src/db/query.js 的 run()，透過 src/db/index.js 的 createDb() 暴露），
 * 不是繞過 db access layer 直接接觸 D1 binding。
 */

const DELETE_SQL = {
  users: 'DELETE FROM users WHERE id = ?',
  exploration_records: 'DELETE FROM exploration_records WHERE id = ?',
  food_events: 'DELETE FROM food_events WHERE id = ?',
  emotion_records: 'DELETE FROM emotion_records WHERE id = ?',
  behavior_patterns: 'DELETE FROM behavior_patterns WHERE id = ?',
  ai_reports: 'DELETE FROM ai_reports WHERE id = ?',
};

/**
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {(trackWrite: (table:string, id:*) => void) => Promise<{ok:boolean, error?:string, reason?:string}>} callback
 *   callback 會拿到一個 trackWrite(table, id) function，每成功寫入一筆就呼叫它登記；
 *   callback 回傳 {ok:false,...} 或拋出例外都會觸發回滾。
 * @returns {Promise<{ok:boolean, error?:string, reason?:string, rolledBack?:boolean}>}
 */
export async function runImportTransaction(db, callback) {
  const written = []; // [{table, id}, ...]，依寫入順序
  const trackWrite = (table, id) => {
    if (id !== undefined && id !== null) written.push({ table, id });
  };

  let result;
  try {
    result = await callback(trackWrite);
  } catch (e) {
    await rollback(db, written);
    return { ok: false, error: e && e.message ? e.message : String(e), rolledBack: written.length > 0 };
  }

  if (!result || result.ok !== true) {
    await rollback(db, written);
    return {
      ok: false,
      error: (result && result.error) || 'import_transaction_failed',
      reason: result && result.reason,
      rolledBack: written.length > 0,
    };
  }

  return result;
}

async function rollback(db, written) {
  // 反向刪除（後寫入的先刪），盡力而為：單筆刪除失敗不中斷整個回滾流程，
  // 但仍會嘗試刪除其餘已記錄的資料列。
  for (let i = written.length - 1; i >= 0; i--) {
    const { table, id } = written[i];
    const sql = DELETE_SQL[table];
    if (!sql) continue;
    try {
      await db.run(sql, [id]);
    } catch (e) {
      // 忽略單筆回滾失敗，不讓回滾過程本身拋出例外
    }
  }
}

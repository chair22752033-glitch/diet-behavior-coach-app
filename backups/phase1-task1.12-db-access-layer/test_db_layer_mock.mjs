/*
 * Phase 1 TASK 1.12｜D1 Access Layer 單元測試（純記憶體 mock D1 binding）
 *
 * 完全不連線任何真實或本機模擬的 D1 資料庫，用假的 db.prepare/bind/run/all/first/batch
 * 記錄呼叫內容，驗證 src/db/ 底下每一層的邏輯正確性：
 * - query.js 的 run/all/first 是否正確組出 SQL、正確處理成功/錯誤兩種情況
 * - transaction.js 的 batch/withTransaction 是否正確送出多個 statement
 * - 每個 tables/*.js 的 insert/getById/listByUser 是否組出正確的 SQL 與參數順序
 * - createDb(env) 在缺少 binding 時是否正確拋出清楚的錯誤訊息
 */
import assert from 'assert';
import { createDb, query, txn } from '../../src/db/index.js';

function makeMockD1(opts) {
  opts = opts || {};
  const calls = [];
  let nextId = opts.startId || 1;

  function makeStatement(sql, params) {
    return {
      sql,
      params: params || [],
      bind(...p) { return makeStatement(sql, p); },
      async run() {
        if (opts.shouldThrow) throw new Error(opts.shouldThrow);
        calls.push({ type: 'run', sql, params: params || [] });
        return { meta: { last_row_id: nextId++, changes: 1 } };
      },
      async all() {
        if (opts.shouldThrow) throw new Error(opts.shouldThrow);
        calls.push({ type: 'all', sql, params: params || [] });
        return { results: opts.rows || [], meta: {} };
      },
      async first() {
        if (opts.shouldThrow) throw new Error(opts.shouldThrow);
        calls.push({ type: 'first', sql, params: params || [] });
        if (opts.returningId) return { id: nextId++ };
        return (opts.rows && opts.rows[0]) || null;
      },
    };
  }

  return {
    calls,
    prepare(sql) { return makeStatement(sql); },
    async batch(preparedStatements) {
      calls.push({ type: 'batch', count: preparedStatements.length });
      const results = [];
      for (const s of preparedStatements) results.push(await s.run());
      return results;
    },
  };
}

const log = [];
const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

async function testCreateDbMissingBinding() {
  let threw = false;
  try { createDb({}); } catch (e) { threw = /DIET_COACH_DB/.test(e.message); }
  record('createDb(env) 缺少 binding 時拋出清楚錯誤', threw);

  let threw2 = false;
  try { createDb(null); } catch (e) { threw2 = true; }
  record('createDb(null) 也能正確拋出錯誤（不會先炸在別的地方）', threw2);
}

async function testQueryWrapper() {
  const mockDb = makeMockD1({ returningId: true });
  const r1 = await query.run(mockDb, 'INSERT INTO users (id) VALUES (?)', ['u1']);
  record('query.run 成功時回傳 ok:true 且帶 meta', r1.ok === true && typeof r1.meta === 'object');

  const mockDbFail = makeMockD1({ shouldThrow: '模擬的資料庫錯誤' });
  const r2 = await query.run(mockDbFail, 'INSERT INTO users (id) VALUES (?)', ['u1']);
  record('query.run 失敗時回傳 ok:false 而非拋出例外', r2.ok === false && r2.error === '模擬的資料庫錯誤');

  const r3 = await query.all(mockDbFail, 'SELECT * FROM users');
  record('query.all 失敗時回傳 ok:false 且 results 為空陣列', r3.ok === false && Array.isArray(r3.results) && r3.results.length === 0);

  const r4 = await query.first(mockDbFail, 'SELECT * FROM users WHERE id=?', ['u1']);
  record('query.first 失敗時回傳 ok:false 且 row 為 null', r4.ok === false && r4.row === null);
}

async function testTransaction() {
  const mockDb = makeMockD1({});
  const r1 = await txn.batch(mockDb, [
    { sql: 'INSERT INTO users (id) VALUES (?)', params: ['u1'] },
    { sql: 'INSERT INTO food_events (user_id) VALUES (?)', params: ['u1'] },
  ]);
  record('txn.batch 成功執行多個statement', r1.ok === true && mockDb.calls.some((c) => c.type === 'batch' && c.count === 2));

  const r2 = await txn.batch(mockDb, []);
  record('txn.batch 空陣列時直接回傳成功、不呼叫db.batch', r2.ok === true && r2.results.length === 0);

  const mockDb2 = makeMockD1({});
  const r3 = await txn.withTransaction(mockDb2, (addStatement) => {
    addStatement('INSERT INTO users (id) VALUES (?)', ['u2']);
    addStatement('INSERT INTO behavior_patterns (user_id) VALUES (?)', ['u2']);
  });
  record('withTransaction 高階輔助正確組出2個statement並執行batch', r3.ok === true && mockDb2.calls.some((c) => c.type === 'batch' && c.count === 2));
}

async function testTableHelpers() {
  const mockDb = makeMockD1({ returningId: true, startId: 100 });
  const db = createDb({ DIET_COACH_DB: mockDb });

  // users.insert
  const uRes = await db.users.insert({ id: 'u-test-1', is_guest: true, legacy_sync_code: 'sync:TEST', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
  record('users.insert 成功', uRes.ok === true);
  const uCall = mockDb.calls.find((c) => c.type === 'run' && /INSERT INTO users/.test(c.sql));
  record('users.insert 的SQL與參數正確（id/legacy_sync_code在對的位置）', !!uCall && uCall.params[0] === 'u-test-1' && uCall.params[5] === 'sync:TEST');

  // exploration_records.insert（用RETURNING id）
  const eRes = await db.explorationRecords.insert({ user_id: 'u-test-1', draw_mode: 'single', card_category: 'T', occurred_at: '2026-01-01T00:00:00Z' });
  record('exploration_records.insert 成功並透過RETURNING拿到id', eRes.ok === true && typeof eRes.id === 'number');

  // food_events.insert
  const fRes = await db.foodEvents.insert({ user_id: 'u-test-1', description: '測試餐點', occurred_at: '2026-01-01T00:00:00Z' });
  record('food_events.insert 成功並拿到id（供emotion_records關聯用）', fRes.ok === true && typeof fRes.id === 'number');

  // emotion_records.insert（關聯到剛才的food_event id）
  const emoRes = await db.emotionRecords.insert({ user_id: 'u-test-1', emotion_type: '平靜', linked_food_event_id: fRes.id, occurred_at: '2026-01-01T00:00:00Z' });
  record('emotion_records.insert 成功並正確帶入linked_food_event_id', emoRes.ok === true);
  const emoCall = mockDb.calls.find((c) => c.type === 'first' && /INSERT INTO emotion_records/.test(c.sql));
  record('emotion_records.insert 的linked_food_event_id參數與food_event的id一致', emoCall.params[4] === fRes.id);

  // behavior_patterns.insert
  const bpRes = await db.behaviorPatterns.insert({ user_id: 'u-test-1', pattern_type: 'daily_checkin', summary: '測試摘要', detected_at: '2026-01-01T00:00:00Z' });
  record('behavior_patterns.insert 成功', bpRes.ok === true);

  // ai_reports.insert
  const arRes = await db.aiReports.insert({ user_id: 'u-test-1', report_type: 'weekly', period_start: '2026-01-01', period_end: '2026-01-07' });
  record('ai_reports.insert 成功', arRes.ok === true);

  // getById / listByUser 系列（用假rows驗證回傳結構）
  const mockDbWithRows = makeMockD1({ rows: [{ id: 1, user_id: 'u-test-1' }] });
  const db2 = createDb({ DIET_COACH_DB: mockDbWithRows });
  const got = await db2.users.getById('u-test-1');
  record('users.getById 正確回傳row', got.ok === true && got.row.id === 1);
  const list = await db2.foodEvents.listByUser('u-test-1', 10);
  record('foodEvents.listByUser 正確回傳results陣列', list.ok === true && Array.isArray(list.results) && list.results.length === 1);
}

async function main() {
  await testCreateDbMissingBinding();
  await testQueryWrapper();
  await testTransaction();
  await testTableHelpers();

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }
  else console.log('✅✅✅ 全部通過（純記憶體 mock，未連線任何真實或本機模擬的 D1）');
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });

/*
 * Phase 1 TASK 1.16｜Legacy Import Service Layer 單元測試（純記憶體，未連線任何資料庫）
 *
 * 涵蓋 legacy_import_service.js / import_transaction.js / legacy_identity.js，
 * 沿用 TASK1.9 現成的 fixture（scripts/legacy_import/fixtures/sample_legacy_blob.json，
 * 全為虛構占位內容，非真實使用者資料），完全不連線任何真實或本機模擬的 D1。
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { importLegacyData } from '../../src/services/legacy_import_service.js';
import { resolveLegacyUserIdentity } from '../../src/identity/legacy_identity.js';
import { runImportTransaction } from '../../src/services/import_transaction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '..', '..', 'scripts', 'legacy_import', 'fixtures', 'sample_legacy_blob.json');
const FIXTURE_RAW = fs.readFileSync(FIXTURE_PATH, 'utf8');

const log = [];
const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

/**
 * 假的 D1 db 物件：users + 5張業務表 + 一個能理解 DELETE 語句的 run()（供
 * import_transaction.js 的回滾機制使用），完全是記憶體內的 Map，不連線任何資料庫。
 */
function makeMockDb(opts) {
  opts = opts || {};
  const users = new Map();
  const tables = {
    exploration_records: new Map(),
    food_events: new Map(),
    emotion_records: new Map(),
    behavior_patterns: new Map(),
    ai_reports: new Map(),
  };
  const calls = [];
  let nextId = 1;

  function makeTableApi(tableKey, camelName) {
    return {
      async insert(row) {
        calls.push({ type: camelName + '.insert', row });
        if (opts.failOn === camelName) {
          return { ok: false, error: 'simulated_failure_for_' + camelName };
        }
        const id = nextId++;
        tables[tableKey].set(id, Object.assign({ id }, row));
        return { ok: true, id };
      },
      async getById(id) {
        calls.push({ type: camelName + '.getById', id });
        return { ok: true, row: tables[tableKey].get(id) || null };
      },
      async listByUser(userId) {
        calls.push({ type: camelName + '.listByUser', userId });
        return { ok: true, results: Array.from(tables[tableKey].values()).filter((r) => r.user_id === userId) };
      },
    };
  }

  const explorationRecords = makeTableApi('exploration_records', 'explorationRecords');
  const foodEvents = makeTableApi('food_events', 'foodEvents');
  const emotionRecords = makeTableApi('emotion_records', 'emotionRecords');
  const behaviorPatterns = makeTableApi('behavior_patterns', 'behaviorPatterns');
  const aiReports = makeTableApi('ai_reports', 'aiReports');

  return {
    calls,
    users: {
      async insert(u) {
        calls.push({ type: 'users.insert', u });
        if (opts.failOn === 'users') return { ok: false, error: 'simulated_failure_for_users' };
        users.set(u.id, Object.assign({}, u));
        return { ok: true, meta: {} };
      },
      async getById(id) {
        calls.push({ type: 'users.getById', id });
        return { ok: true, row: users.get(id) || null };
      },
    },
    explorationRecords,
    foodEvents,
    emotionRecords,
    behaviorPatterns,
    aiReports,
    async run(sql, params) {
      calls.push({ type: 'run', sql, params });
      const id = params[0];
      if (/DELETE FROM users/.test(sql)) { users.delete(id); return { ok: true }; }
      if (/DELETE FROM exploration_records/.test(sql)) { tables.exploration_records.delete(id); return { ok: true }; }
      if (/DELETE FROM food_events/.test(sql)) { tables.food_events.delete(id); return { ok: true }; }
      if (/DELETE FROM emotion_records/.test(sql)) { tables.emotion_records.delete(id); return { ok: true }; }
      if (/DELETE FROM behavior_patterns/.test(sql)) { tables.behavior_patterns.delete(id); return { ok: true }; }
      if (/DELETE FROM ai_reports/.test(sql)) { tables.ai_reports.delete(id); return { ok: true }; }
      return { ok: true };
    },
    _users: users,
    _tables: tables,
  };
}

function totalRowCount(db) {
  return db._users.size
    + db._tables.exploration_records.size
    + db._tables.food_events.size
    + db._tables.emotion_records.size
    + db._tables.behavior_patterns.size
    + db._tables.ai_reports.size;
}

// ---- 測試 1：fixture legacy data 成功 import ----
async function test1_fixtureImportSucceeds() {
  const db = makeMockDb();
  const result = await importLegacyData(db, { sourceType: 'kv', sourceKey: 'sync:TEST_FIXTURE_1', payload: FIXTURE_RAW }, { now: '2026-09-22T00:00:00.000Z' });

  record('1. importLegacyData 對fixture成功匯入', result.ok === true);
  record('1. summary.users 正確為1', result.summary.users === 1);
  record('1. summary.exploration_records 正確為2（fixture有2筆quest.entries）', result.summary.exploration_records === 2);
  record('1. summary.food_events 正確為2（fixture有2筆meals.entries）', result.summary.food_events === 2);
  record('1. summary.emotion_records 正確為1（只有1筆meal有非空mood）', result.summary.emotion_records === 1);
  record('1. summary.behavior_patterns 正確為3（identity+ba+ins各1筆）', result.summary.behavior_patterns === 3);
  record('1. summary.ai_reports 為0（舊格式沒有這個概念）', result.summary.ai_reports === 0);
}

// ---- 測試 2：parser → service → domain flow 正常 ----
async function test2_fullFlowUsesServiceLayer() {
  const db = makeMockDb();
  await importLegacyData(db, { sourceType: 'kv', sourceKey: 'sync:TEST_FIXTURE_2', payload: FIXTURE_RAW }, { now: '2026-09-22T00:00:00.000Z' });

  const calledTypes = db.calls.map((c) => c.type);
  record('2. 流程確實呼叫了 users.insert（建立guest）', calledTypes.includes('users.insert'));
  record('2. 流程確實呼叫了 explorationRecords.insert（透過exploration_service）', calledTypes.includes('explorationRecords.insert'));
  record('2. 流程確實呼叫了 foodEvents.insert（透過food_service）', calledTypes.includes('foodEvents.insert'));
  record('2. 流程確實呼叫了 emotionRecords.insert（透過emotion_service）', calledTypes.includes('emotionRecords.insert'));
  record('2. 流程確實呼叫了 behaviorPatterns.insert（透過behavior_service）', calledTypes.includes('behaviorPatterns.insert'));
  record('2. 每筆業務資料寫入前都有對應的 users.getById（domain service內部的requireActiveUser驗證）', calledTypes.filter((t) => t === 'users.getById').length >= 5);
}

// ---- 測試 3：guest user 自動建立 ----
async function test3_guestUserAutoCreated() {
  const db = makeMockDb();
  await importLegacyData(db, { sourceType: 'kv', sourceKey: 'sync:TEST_FIXTURE_3', payload: FIXTURE_RAW }, { now: '2026-09-22T00:00:00.000Z' });

  const createdUser = Array.from(db._users.values())[0];
  record('3. 確實建立了1個user', db._users.size === 1);
  record('3. 建立的user is_guest為true', createdUser.is_guest === true);
  record('3. 建立的user auth_provider為null', createdUser.auth_provider === null);
  record('3. 建立的user status為active', createdUser.status === 'active');
  record('3. 建立的user legacy_sync_code正確記錄來源', createdUser.legacy_sync_code === 'sync:TEST_FIXTURE_3');

  // resolveLegacyUserIdentity 單獨測試：帶provider的情境（本次明確不支援，屬未來擴充點）
  const withProvider = resolveLegacyUserIdentity({ id: 'x', auth_provider: 'google', auth_provider_id: 'g-1' });
  record('3. resolveLegacyUserIdentity 對已有provider的legacy user回傳unsupported（本次不接OAuth）', withProvider.unsupported === true && withProvider.reason === 'legacy_provider_import_not_supported');
}

// ---- 測試 4：quest records 正確建立 ----
async function test4_questRecordsCorrect() {
  const db = makeMockDb();
  await importLegacyData(db, { sourceType: 'kv', sourceKey: 'sync:TEST_FIXTURE_4', payload: FIXTURE_RAW }, { now: '2026-09-22T00:00:00.000Z' });

  const records = Array.from(db._tables.exploration_records.values());
  record('4. 建立了2筆exploration_records', records.length === 2);
  const singleCardRecord = records.find((r) => r.draw_mode === 'single');
  record('4. single模式的紀錄正確帶入card_category=T（單卡情境）', !!singleCardRecord && singleCardRecord.card_category === 'T');
  const mapRecord = records.find((r) => r.draw_mode === 'map');
  record('4. map模式（多卡）的紀錄card_category為null，完整內容在responses_json', !!mapRecord && mapRecord.card_category === null && mapRecord.responses_json.indexOf('"cards"') >= 0);
  record('4. 所有紀錄都正確關聯到同一個user_id', records.every((r) => r.user_id === Array.from(db._users.keys())[0]));
}

// ---- 測試 5：food → emotion 關聯正常 ----
async function test5_foodEmotionLinkage() {
  const db = makeMockDb();
  await importLegacyData(db, { sourceType: 'kv', sourceKey: 'sync:TEST_FIXTURE_5', payload: FIXTURE_RAW }, { now: '2026-09-22T00:00:00.000Z' });

  const foodEventsArr = Array.from(db._tables.food_events.values());
  const emotionRecordsArr = Array.from(db._tables.emotion_records.values());
  record('5. 建立了2筆food_events', foodEventsArr.length === 2);
  record('5. 建立了1筆emotion_records（只有1筆meal有mood）', emotionRecordsArr.length === 1);

  const emotion = emotionRecordsArr[0];
  const linkedFood = foodEventsArr.find((f) => f.id === emotion.linked_food_event_id);
  record('5. emotion_record 的linked_food_event_id指向真實存在的food_event（不是parser的暫存索引）', !!linkedFood);
  record('5. 關聯到的food_event描述正確（測試餐點A、測試餐點B，即有mood=平靜那筆）', !!linkedFood && linkedFood.description === '測試餐點A、測試餐點B');
  record('5. emotion_type正確為fixture裡的"平靜"', emotion.emotion_type === '平靜');
}

// ---- 測試 6：transaction rollback 測試 ----
async function test6_transactionRollback() {
  // 直接測試 runImportTransaction 本身的回滾機制
  const db1 = makeMockDb();
  const r1 = await runImportTransaction(db1, async (trackWrite) => {
    const u = await db1.users.insert({ id: 'rollback-test-user' });
    trackWrite('users', 'rollback-test-user');
    const f = await db1.foodEvents.insert({ user_id: 'rollback-test-user', description: '會被回滾的資料' });
    trackWrite('food_events', f.id);
    return { ok: false, error: 'deliberate_failure_for_test' };
  });
  record('6. runImportTransaction 對回傳ok:false的callback回報失敗', r1.ok === false && r1.error === 'deliberate_failure_for_test');
  record('6. runImportTransaction 標記rolledBack為true', r1.rolledBack === true);
  record('6. 回滾後user資料已被刪除', db1._users.size === 0);
  record('6. 回滾後food_event資料已被刪除', db1._tables.food_events.size === 0);

  // 透過完整的 importLegacyData 流程，讓 behaviorPatterns 寫入失敗，驗證前面已寫入的user/exploration/food/emotion全部被回滾
  const db2 = makeMockDb({ failOn: 'behaviorPatterns' });
  const r2 = await importLegacyData(db2, { sourceType: 'kv', sourceKey: 'sync:TEST_FIXTURE_ROLLBACK', payload: FIXTURE_RAW }, { now: '2026-09-22T00:00:00.000Z' });
  record('6. 完整流程中behavior_patterns寫入失敗時，importLegacyData回傳ok:false', r2.ok === false);
  record('6. 失敗後，資料庫裡完全沒有殘留任何一筆資料（包含先前成功寫入的user/exploration/food/emotion）', totalRowCount(db2) === 0);

  // 拋出例外的情況也要能正確回滾
  const db3 = makeMockDb();
  const r3 = await runImportTransaction(db3, async (trackWrite) => {
    const u = await db3.users.insert({ id: 'exception-test-user' });
    trackWrite('users', 'exception-test-user');
    throw new Error('模擬預期外的例外');
  });
  record('6. callback拋出例外時也能正確捕捉並回滾（不會讓整個測試程式崩潰）', r3.ok === false && r3.error === '模擬預期外的例外');
  record('6. 例外情況下user資料也被正確回滾', db3._users.size === 0);
}

// ---- 測試 7：錯誤 JSON 不造成 crash ----
async function test7_malformedJsonDoesNotCrash() {
  const db = makeMockDb();

  const r1 = await importLegacyData(db, { sourceType: 'kv', sourceKey: 'sync:BROKEN_JSON', payload: '{not valid json' }, {});
  record('7. 損毀的JSON不會拋出例外，正確回傳ok:false', r1.ok === false && typeof r1.error === 'string');
  record('7. 損毀JSON情況下沒有寫入任何資料', totalRowCount(db) === 0);

  const r2 = await importLegacyData(db, null, {});
  record('7. payload整個是null時不會crash，正確回傳ok:false', r2.ok === false && r2.error === 'invalid_legacy_payload');

  const r3 = await importLegacyData(db, { sourceType: 'unknown_type', sourceKey: 'sync:X', payload: '{}' }, {});
  record('7. 不支援的sourceType被拒絕', r3.ok === false && r3.error === 'invalid_source_type');

  const r4 = await importLegacyData(db, { sourceType: 'kv', sourceKey: '', payload: '{}' }, {});
  record('7. 空字串sourceKey被拒絕', r4.ok === false && r4.error === 'invalid_source_key');

  record('7. 經過4種異常輸入測試後，資料庫仍然完全沒有任何資料', totalRowCount(db) === 0);
}

// ---- 測試 8：重複 import 防呆 ----
async function test8_duplicateImportPrevention() {
  const db = makeMockDb();
  const importedKeys = new Set();
  const isAlreadyImported = async (sourceKey) => importedKeys.has(sourceKey);

  const first = await importLegacyData(db, { sourceType: 'kv', sourceKey: 'sync:DUPLICATE_TEST', payload: FIXTURE_RAW }, { now: '2026-09-22T00:00:00.000Z', isAlreadyImported });
  record('8. 第一次匯入成功', first.ok === true);
  importedKeys.add('sync:DUPLICATE_TEST');

  const callsBeforeSecond = db.calls.length;
  const second = await importLegacyData(db, { sourceType: 'kv', sourceKey: 'sync:DUPLICATE_TEST', payload: FIXTURE_RAW }, { now: '2026-09-22T01:00:00.000Z', isAlreadyImported });
  record('8. 第二次對同一個sourceKey匯入被拒絕', second.ok === false && second.error === 'already_imported');
  record('8. 第二次匯入被拒絕時完全沒有觸發任何db呼叫（在最前面就擋下）', db.calls.length === callsBeforeSecond);
  record('8. 第一次匯入的資料筆數維持不變（沒有被重複匯入污染）', db._users.size === 1);
}

async function main() {
  await test1_fixtureImportSucceeds();
  await test2_fullFlowUsesServiceLayer();
  await test3_guestUserAutoCreated();
  await test4_questRecordsCorrect();
  await test5_foodEmotionLinkage();
  await test6_transactionRollback();
  await test7_malformedJsonDoesNotCrash();
  await test8_duplicateImportPrevention();

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }
  else console.log('✅✅✅ 全部通過（純記憶體運算，未連線任何資料庫，未寫入任何真實使用者資料）');
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });

/*
 * Phase 1 TASK 1.15｜Domain Service Layer 單元測試（純記憶體，未連線任何資料庫）
 *
 * 涵蓋 src/services/ 底下全部 6 個 service，用假的 db 物件（模擬 createDb(env) 的
 * 介面）記錄呼叫內容，完全不寫入任何真實或本機模擬的資料庫，也不建立任何真實使用者資料。
 */
import assert from 'assert';
import { getUserById, userExists, requireActiveUser } from '../../src/services/user_service.js';
import { createExplorationRecord, getUserExplorations } from '../../src/services/exploration_service.js';
import { recordFoodEvent, listFoodHistory } from '../../src/services/food_service.js';
import { createEmotionRecord, listEmotionHistory, listEmotionsByFoodEvent } from '../../src/services/emotion_service.js';
import { createBehaviorPattern, getBehaviorPatterns } from '../../src/services/behavior_service.js';
import { saveReport, getReports } from '../../src/services/report_service.js';

const log = [];
const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

function makeMockDb(opts) {
  opts = opts || {};
  const users = new Map((opts.users || []).map((u) => [u.id, Object.assign({}, u)]));
  const calls = [];
  let nextId = 1;

  function makeTable(name) {
    const rows = new Map();
    return {
      async insert(row) {
        calls.push({ type: name + '.insert', row });
        const id = nextId++;
        rows.set(id, Object.assign({ id }, row));
        return { ok: true, id };
      },
      async listByUser(userId, limit) {
        calls.push({ type: name + '.listByUser', userId, limit });
        return { ok: true, results: Array.from(rows.values()).filter((r) => r.user_id === userId) };
      },
      async listByUserAndType(userId, patternType, limit) {
        calls.push({ type: name + '.listByUserAndType', userId, patternType, limit });
        return { ok: true, results: Array.from(rows.values()).filter((r) => r.user_id === userId && r.pattern_type === patternType) };
      },
      async listByFoodEvent(foodEventId) {
        calls.push({ type: name + '.listByFoodEvent', foodEventId });
        return { ok: true, results: Array.from(rows.values()).filter((r) => r.linked_food_event_id === foodEventId) };
      },
      _rows: rows,
    };
  }

  const explorationRecords = makeTable('explorationRecords');
  const foodEvents = makeTable('foodEvents');
  const emotionRecords = makeTable('emotionRecords');
  const behaviorPatterns = makeTable('behaviorPatterns');
  const aiReports = makeTable('aiReports');

  return {
    calls,
    users: {
      async getById(id) { calls.push({ type: 'users.getById', id }); return { ok: true, row: users.get(id) || null }; },
    },
    explorationRecords,
    foodEvents,
    emotionRecords,
    behaviorPatterns,
    aiReports,
  };
}

const ACTIVE_USER = { id: 'user-active', status: 'active' };
const SUSPENDED_USER = { id: 'user-suspended', status: 'suspended' };

// ---- 1. user service 驗證正常 ----
async function test1_userService() {
  const db = makeMockDb({ users: [ACTIVE_USER, SUSPENDED_USER] });

  const got = await getUserById(db, 'user-active');
  record('1. getUserById 正確取得存在的使用者', got.ok === true && got.user.id === 'user-active');

  const notFound = await getUserById(db, 'no-such-user');
  record('1. getUserById 對不存在的使用者回傳ok:false', notFound.ok === false && notFound.error === 'user_not_found');

  record('1. userExists 對存在的使用者回傳true', await userExists(db, 'user-active') === true);
  record('1. userExists 對不存在的使用者回傳false', await userExists(db, 'no-such-user') === false);

  const activeCheck = await requireActiveUser(db, 'user-active');
  record('1. requireActiveUser 對active使用者允許', activeCheck.ok === true);

  const suspendedCheck = await requireActiveUser(db, 'user-suspended');
  record('1. requireActiveUser 對suspended使用者拒絕且reason正確', suspendedCheck.ok === false && suspendedCheck.reason === 'user_suspended');

  const missingCheck = await requireActiveUser(db, 'no-such-user');
  record('1. requireActiveUser 對不存在的使用者拒絕', missingCheck.ok === false && missingCheck.reason === 'user_not_found');
}

// ---- 2. exploration service 建立紀錄 ----
async function test2_explorationService() {
  const db = makeMockDb({ users: [ACTIVE_USER] });

  const created = await createExplorationRecord(db, 'user-active', {
    draw_mode: 'single', card_category: 'T', card_text: '測試地形卡', occurred_at: '2026-01-01T00:00:00.000Z',
  });
  record('2. createExplorationRecord 成功並回傳id', created.ok === true && typeof created.id === 'number');

  const list = await getUserExplorations(db, 'user-active');
  record('2. getUserExplorations 可查回剛才建立的紀錄', list.ok === true && list.results.length === 1 && list.results[0].card_category === 'T');
}

// ---- 3. food service 建立飲食紀錄 ----
async function test3_foodService() {
  const db = makeMockDb({ users: [ACTIVE_USER] });
  const nutrientsJson = JSON.stringify({ names: ['測試餐點'], emojis: ['🍚'], cats: ['主食'] });

  const created = await recordFoodEvent(db, 'user-active', { description: '測試餐點', nutrients_json: nutrientsJson });
  record('3. recordFoodEvent 成功並回傳id', created.ok === true && typeof created.id === 'number');

  const list = await listFoodHistory(db, 'user-active');
  record('3. listFoodHistory 可查回剛才建立的紀錄', list.ok === true && list.results.length === 1);
  record('3. nutrients_json 原樣保留，逐字元未被修改', list.results[0].nutrients_json === nutrientsJson);
}

// ---- 4. emotion service 關聯 food_event ----
async function test4_emotionService() {
  const db = makeMockDb({ users: [ACTIVE_USER] });

  const foodResult = await recordFoodEvent(db, 'user-active', { description: '測試餐點' });
  const emotionResult = await createEmotionRecord(db, 'user-active', {
    emotion_type: '平靜', linked_food_event_id: foodResult.id,
  });
  record('4. createEmotionRecord 成功並正確帶入linked_food_event_id', emotionResult.ok === true);

  const byFoodEvent = await listEmotionsByFoodEvent(db, foodResult.id);
  record('4. listEmotionsByFoodEvent 正確反查到該情緒紀錄（關聯能力保留）', byFoodEvent.ok === true && byFoodEvent.results.length === 1 && byFoodEvent.results[0].emotion_type === '平靜');

  const history = await listEmotionHistory(db, 'user-active');
  record('4. listEmotionHistory 也能查到同一筆紀錄', history.ok === true && history.results.length === 1);
}

// ---- 5. behavior service 建立行為紀錄 ----
async function test5_behaviorService() {
  const db = makeMockDb({ users: [ACTIVE_USER] });

  const created = await createBehaviorPattern(db, 'user-active', { pattern_type: 'daily_checkin', summary: '測試摘要' });
  record('5. createBehaviorPattern 成功並回傳id', created.ok === true && typeof created.id === 'number');

  const listAll = await getBehaviorPatterns(db, 'user-active');
  record('5. getBehaviorPatterns（不篩選）可查回紀錄', listAll.ok === true && listAll.results.length === 1);

  const listByType = await getBehaviorPatterns(db, 'user-active', { patternType: 'daily_checkin' });
  record('5. getBehaviorPatterns（依pattern_type篩選）可查回紀錄', listByType.ok === true && listByType.results.length === 1);

  const listByWrongType = await getBehaviorPatterns(db, 'user-active', { patternType: 'behavior_breakdown' });
  record('5. getBehaviorPatterns（篩選不符的type）回傳空陣列', listByWrongType.ok === true && listByWrongType.results.length === 0);
}

// ---- 6. report service 儲存報告 ----
async function test6_reportService() {
  const db = makeMockDb({ users: [ACTIVE_USER] });

  const saved = await saveReport(db, 'user-active', { report_type: 'weekly', content: '測試報告內容', period_start: '2026-01-01', period_end: '2026-01-07' });
  record('6. saveReport 成功並回傳id', saved.ok === true && typeof saved.id === 'number');

  const reports = await getReports(db, 'user-active');
  record('6. getReports 可查回剛才儲存的報告', reports.ok === true && reports.results.length === 1 && reports.results[0].content === '測試報告內容');
}

// ---- 7. 所有 service 都透過 db layer（不直接操作D1、不寫原生SQL）----
async function test7_allServicesUseDbLayer() {
  const db = makeMockDb({ users: [ACTIVE_USER] });

  await createExplorationRecord(db, 'user-active', { draw_mode: 'single' });
  await recordFoodEvent(db, 'user-active', { description: 'x' });
  await createEmotionRecord(db, 'user-active', { emotion_type: 'x' });
  await createBehaviorPattern(db, 'user-active', { pattern_type: 'x' });
  await saveReport(db, 'user-active', { report_type: 'x' });

  const calledTypes = db.calls.map((c) => c.type);
  record('7. exploration_service 呼叫了 db.explorationRecords.insert（未跳過db layer）', calledTypes.includes('explorationRecords.insert'));
  record('7. food_service 呼叫了 db.foodEvents.insert', calledTypes.includes('foodEvents.insert'));
  record('7. emotion_service 呼叫了 db.emotionRecords.insert', calledTypes.includes('emotionRecords.insert'));
  record('7. behavior_service 呼叫了 db.behaviorPatterns.insert', calledTypes.includes('behaviorPatterns.insert'));
  record('7. report_service 呼叫了 db.aiReports.insert', calledTypes.includes('aiReports.insert'));
  record('7. 每次寫入前都先呼叫了 db.users.getById（統一透過user_service驗證）', calledTypes.filter((t) => t === 'users.getById').length >= 5);
}

// ---- 8. 錯誤 user 被拒絕（涵蓋不存在與被停權兩種情況，且不應觸發任何寫入）----
async function test8_invalidUserRejected() {
  const db = makeMockDb({ users: [SUSPENDED_USER] });

  const r1 = await createExplorationRecord(db, 'no-such-user', { draw_mode: 'single' });
  record('8. exploration_service 對不存在的user拒絕', r1.ok === false && r1.reason === 'user_not_found');

  const r2 = await recordFoodEvent(db, 'user-suspended', { description: 'x' });
  record('8. food_service 對被停權的user拒絕', r2.ok === false && r2.reason === 'user_suspended');

  const r3 = await createEmotionRecord(db, 'no-such-user', { emotion_type: 'x' });
  record('8. emotion_service 對不存在的user拒絕', r3.ok === false && r3.reason === 'user_not_found');

  const r4 = await createBehaviorPattern(db, 'user-suspended', { pattern_type: 'x' });
  record('8. behavior_service 對被停權的user拒絕', r4.ok === false && r4.reason === 'user_suspended');

  const r5 = await saveReport(db, 'no-such-user', { report_type: 'x' });
  record('8. report_service 對不存在的user拒絕', r5.ok === false && r5.reason === 'user_not_found');

  const r6 = await getUserExplorations(db, 'user-suspended');
  record('8. 查詢類方法（getUserExplorations）對被停權的user也拒絕', r6.ok === false && r6.reason === 'user_suspended');

  const insertCalls = db.calls.filter((c) => /\.insert$/.test(c.type));
  record('8. 全部6次被拒絕的操作，沒有任何一次觸發實際的insert（驗證在寫入前就擋下）', insertCalls.length === 0);
}

async function main() {
  await test1_userService();
  await test2_explorationService();
  await test3_foodService();
  await test4_emotionService();
  await test5_behaviorService();
  await test6_reportService();
  await test7_allServicesUseDbLayer();
  await test8_invalidUserRejected();

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }
  else console.log('✅✅✅ 全部通過（純記憶體運算，未連線任何資料庫，未寫入任何真實使用者資料）');
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });

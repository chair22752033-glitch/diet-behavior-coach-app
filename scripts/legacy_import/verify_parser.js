/*
 * Phase 1 TASK 1.9｜Legacy Import 基礎架構 - Parser 驗證腳本
 *
 * 用途：對合成測試資料（fixtures/sample_legacy_blob.json，全為虛構占位內容，非真實使用者資料）
 * 執行 parseLegacyBlob()，並用斷言確認轉換結果符合預期。
 *
 * 重要：本腳本完全不連線任何資料庫（本地或正式）、不呼叫任何 API、不讀取正式 KV 資料，
 * 純粹是對「純函式」的單元測試，執行方式：node scripts/legacy_import/verify_parser.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseLegacyBlob } = require('./parse_legacy_blob');

const FIXED_NOW = '2026-09-22T00:00:00.000Z';

function testMainFixture() {
  const fixturePath = path.join(__dirname, 'fixtures', 'sample_legacy_blob.json');
  const raw = fs.readFileSync(fixturePath, 'utf8');
  const result = parseLegacyBlob('sync:TEST_FIXTURE', raw, { now: FIXED_NOW, userId: 'test-user-uuid-0000' });

  assert.strictEqual(result.ok, true, 'parser 應成功解析fixture');
  assert.strictEqual(result.user.legacy_sync_code, 'sync:TEST_FIXTURE');
  assert.strictEqual(result.user.is_guest, 1);
  assert.strictEqual(result.user.id, 'test-user-uuid-0000');

  const identityPatterns = result.behavior_patterns.filter((p) => p.pattern_type === 'identity_quiz');
  assert.strictEqual(identityPatterns.length, 1, 'identity 應轉出 1 筆 behavior_patterns');
  assert.ok(identityPatterns[0].summary.indexOf('行動派') >= 0, 'identity key=active 應對照到「行動派」');

  assert.strictEqual(result.exploration_records.length, 2, 'quest.entries 應轉出 2 筆 exploration_records');
  assert.strictEqual(result.exploration_records[0].card_category, 'T', '單張卡片時應填入 card_category');
  assert.strictEqual(result.exploration_records[1].card_category, null, '多張卡片時 card_category 應為 null（完整內容保留在 responses_json）');

  assert.strictEqual(result.food_events.length, 2, 'meals.entries 應轉出 2 筆 food_events');
  assert.strictEqual(result.food_events[0].description, '測試餐點A、測試餐點B');

  assert.strictEqual(result.emotion_records.length, 1, '只有 1 筆 meal 有非空 mood，應轉出 1 筆 emotion_records');
  assert.strictEqual(result.emotion_records[0].linked_food_event_local_index, 0, 'emotion_record 應正確關聯到第 0 筆 food_event');

  const baPatterns = result.behavior_patterns.filter((p) => p.pattern_type === 'behavior_breakdown');
  assert.strictEqual(baPatterns.length, 1, 'ba.entries 應轉出 1 筆 behavior_patterns');

  const checkinPatterns = result.behavior_patterns.filter((p) => p.pattern_type === 'daily_checkin');
  assert.strictEqual(checkinPatterns.length, 1, 'ins 應轉出 1 筆 behavior_patterns');

  assert.strictEqual(result.behavior_patterns.length, 3, 'behavior_patterns 合計應為 3 筆（identity+ba+ins）');
  assert.ok(result.warnings.some((w) => w.indexOf('ft 欄位') >= 0), '應該有 ft 欄位不遷移的警告');

  console.log('✅ 主要 fixture 驗證通過，統計：', JSON.stringify(result.stats));
  console.log('   警告：', JSON.stringify(result.warnings));
}

function testEmptyObject() {
  const result = parseLegacyBlob('sync:EMPTY_TEST', '{}', { now: FIXED_NOW });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.exploration_records.length, 0);
  assert.strictEqual(result.food_events.length, 0);
  assert.strictEqual(result.emotion_records.length, 0);
  assert.strictEqual(result.behavior_patterns.length, 0);
  console.log('✅ 空物件邊界測試通過（不應報錯，也不應產生任何資料列）');
}

function testBrokenJson() {
  const result = parseLegacyBlob('sync:BROKEN', '{not valid json', {});
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.indexOf('JSON_PARSE_ERROR') === 0);
  console.log('✅ 損毀 JSON 邊界測試通過（正確回報 ok:false，不會拋出例外中斷程式）');
}

function testNonObjectRoot() {
  const result = parseLegacyBlob('sync:ARRAY_ROOT', '[1,2,3]', {});
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.indexOf('INVALID_ROOT_SHAPE') === 0);
  console.log('✅ 頂層非物件（陣列）邊界測試通過');
}

function testMissingOptionalFields() {
  // 只給identity，缺quest/meals/ba/ins，確認不會因為缺欄位而報錯
  const result = parseLegacyBlob('sync:PARTIAL', JSON.stringify({ identity: { key: 'unknown_key_not_in_id_types', ts: 1700000000000 } }), { now: FIXED_NOW });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.behavior_patterns.length, 1);
  assert.ok(result.behavior_patterns[0].summary.indexOf('unknown_key_not_in_id_types') >= 0, '找不到對照表時應直接使用原始key當作顯示文字，而非報錯');
  console.log('✅ 部分欄位缺漏／未知identity key 測試通過');
}

testMainFixture();
testEmptyObject();
testBrokenJson();
testNonObjectRoot();
testMissingOptionalFields();

console.log('\n✅✅✅ 全部驗證通過（純記憶體運算，未連線任何資料庫或API）');

/*
 * Phase 1 TASK 1.12｜用 EXPLAIN 對真實（本機模擬）D1 schema 驗證 SQL 語法
 *
 * EXPLAIN <sql> 只會把 SQL 編譯成 SQLite 虛擬機bytecode並印出來，完全不會真的執行、
 * 不會寫入任何資料列，是零副作用的語法/欄位名稱正確性檢查方式。
 * 這裡把 src/db/tables/*.js 裡實際用到的 SQL 字串抽出來，逐一送去驗證，
 * 確保欄位名稱、資料表名稱都跟 TASK1.7 建立的真實 schema 對得上。
 *
 * 執行方式：node backups/phase1-task1.12-db-access-layer/validate_sql_against_schema.mjs
 * （內部呼叫 wrangler d1 execute diet-coach-db --local，只讀不寫）
 */
import { execFileSync } from 'child_process';

const SQL_STATEMENTS = [
  ['users.insert', `INSERT INTO users (id, auth_provider, auth_provider_id, display_name, is_guest, legacy_sync_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`],
  ['users.getById', `SELECT * FROM users WHERE id = ?`],
  ['users.getByLegacySyncCode', `SELECT * FROM users WHERE legacy_sync_code = ?`],
  ['users.listRecent', `SELECT * FROM users ORDER BY created_at DESC LIMIT ?`],

  ['exploration_records.insert', `INSERT INTO exploration_records (user_id, draw_mode, card_category, card_object_key, card_text, photo_idx, responses_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`],
  ['exploration_records.getById', `SELECT * FROM exploration_records WHERE id = ?`],
  ['exploration_records.listByUser', `SELECT * FROM exploration_records WHERE user_id = ? ORDER BY occurred_at DESC LIMIT ?`],

  ['food_events.insert', `INSERT INTO food_events (user_id, meal_type, description, nutrients_json, image_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`],
  ['food_events.getById', `SELECT * FROM food_events WHERE id = ?`],
  ['food_events.listByUser', `SELECT * FROM food_events WHERE user_id = ? ORDER BY occurred_at DESC LIMIT ?`],

  ['emotion_records.insert', `INSERT INTO emotion_records (user_id, emotion_type, intensity, trigger_note, linked_food_event_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`],
  ['emotion_records.getById', `SELECT * FROM emotion_records WHERE id = ?`],
  ['emotion_records.listByUser', `SELECT * FROM emotion_records WHERE user_id = ? ORDER BY occurred_at DESC LIMIT ?`],
  ['emotion_records.listByFoodEvent', `SELECT * FROM emotion_records WHERE linked_food_event_id = ?`],

  ['behavior_patterns.insert', `INSERT INTO behavior_patterns (user_id, pattern_type, summary, evidence_json, confidence_score, detected_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`],
  ['behavior_patterns.getById', `SELECT * FROM behavior_patterns WHERE id = ?`],
  ['behavior_patterns.listByUser', `SELECT * FROM behavior_patterns WHERE user_id = ? ORDER BY detected_at DESC LIMIT ?`],
  ['behavior_patterns.listByUserAndType', `SELECT * FROM behavior_patterns WHERE user_id = ? AND pattern_type = ? ORDER BY detected_at DESC LIMIT ?`],

  ['ai_reports.insert', `INSERT INTO ai_reports (user_id, report_type, period_start, period_end, content, model_used) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`],
  ['ai_reports.getById', `SELECT * FROM ai_reports WHERE id = ?`],
  ['ai_reports.listByUser', `SELECT * FROM ai_reports WHERE user_id = ? ORDER BY period_start DESC LIMIT ?`],
];

let pass = 0;
const results = [];
for (const [name, sql] of SQL_STATEMENTS) {
  // EXPLAIN 只驗證語法/欄位名稱是否正確，不會真的執行，所以用 NULL 取代 ? 佔位符即可
  // （wrangler 的 --command 不接受未綁定的 ?，必須是完整、可直接送進 D1 的 SQL 字串）
  const explainSql = 'EXPLAIN ' + sql.replace(/\?/g, 'NULL');
  try {
    const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'diet-coach-db', '--local', '--command', explainSql, '--json'], { encoding: 'utf8', cwd: process.cwd() });
    const json = JSON.parse(out);
    const ok = json[0] && json[0].success === true;
    results.push({ name, ok });
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
    if (ok) pass++;
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log('FAIL ' + name + ' — ' + e.message.slice(0, 200));
  }
}

console.log('\n---SUMMARY---');
console.log('PASS:', pass, '/', SQL_STATEMENTS.length);
if (pass !== SQL_STATEMENTS.length) process.exitCode = 1;
else console.log('✅✅✅ 全部 SQL 陳述式皆通過 EXPLAIN 語法驗證（零副作用，未寫入任何資料）');

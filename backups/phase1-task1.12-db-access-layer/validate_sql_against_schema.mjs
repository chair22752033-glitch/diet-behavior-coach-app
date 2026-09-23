/*
 * Phase 1 TASK 1.12｜用 EXPLAIN 對真實（本機模擬）D1 schema 驗證 SQL 語法
 * （TASK1.39架構一致性檢查：補齊TASK1.13A~1.34新增的表與方法，更新
 * 已經因schema演進而過時的SQL字串——這個腳本原本只涵蓋TASK1.12當時
 * 存在的6張表，users.insert的欄位清單也還是TASK1.13B新增status欄位
 * 之前的舊版本，此次一併更新到跟src/db/tables/*.js目前的原始碼完全
 * 一致）
 *
 * EXPLAIN <sql> 只會把 SQL 編譯成 SQLite 虛擬機bytecode並印出來，完全不會真的執行、
 * 不會寫入任何資料列，是零副作用的語法/欄位名稱正確性檢查方式。
 * 這裡把 src/db/tables/*.js 裡實際用到的 SQL 字串抽出來，逐一送去驗證，
 * 確保欄位名稱、資料表名稱都跟目前 migrations/ 底下全部6個檔案累積起來的
 * 真實 schema 對得上。
 *
 * 執行方式：node backups/phase1-task1.12-db-access-layer/validate_sql_against_schema.mjs
 * （內部呼叫 wrangler d1 execute diet-coach-db --local，只讀不寫）
 */
import { execFileSync } from 'child_process';

const SQL_STATEMENTS = [
  // users（migrations/0001 + 0004，TASK1.39更新：insert()目前欄位清單含TASK1.13B新增的status）
  ['users.insert', `INSERT INTO users (id, auth_provider, auth_provider_id, display_name, is_guest, status, legacy_sync_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`],
  ['users.getById', `SELECT * FROM users WHERE id = ?`],
  ['users.getByLegacySyncCode', `SELECT * FROM users WHERE legacy_sync_code = ?`],
  ['users.getByProvider', `SELECT * FROM users WHERE auth_provider = ? AND auth_provider_id = ?`],
  ['users.listRecent', `SELECT * FROM users ORDER BY created_at DESC LIMIT ?`],
  ['users.updateStatus', `UPDATE users SET status = ?, updated_at = ? WHERE id = ?`],
  ['users.upgradeToProvider', `UPDATE users SET auth_provider = ?, auth_provider_id = ?, is_guest = 0, updated_at = ? WHERE id = ?`],
  ['users.touchLogin', `UPDATE users SET last_login_at = ? WHERE id = ?`],
  ['users.updateDisplayName', `UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`],

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

  // sessions（migrations/0003，TASK1.13A；TASK1.39新增到這個驗證腳本）
  ['sessions.insert', `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`],
  ['sessions.getById', `SELECT * FROM sessions WHERE id = ?`],
  ['sessions.listByUser', `SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC`],
  ['sessions.touch', `UPDATE sessions SET last_seen_at = ? WHERE id = ?`],
  ['sessions.revoke', `UPDATE sessions SET revoked_at = ? WHERE id = ?`],
  ['sessions.revokeAllForUser', `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`],
  ['sessions.deleteExpiredBefore', `DELETE FROM sessions WHERE expires_at < ?`],
  ['sessions.listExpiredBefore', `SELECT * FROM sessions WHERE expires_at < ? ORDER BY expires_at ASC LIMIT ?`],
  ['sessions.deleteByIds', `DELETE FROM sessions WHERE id IN (?)`],

  // legacy_import_logs（migrations/0005，TASK1.16；TASK1.39新增到這個驗證腳本）
  ['legacy_import_logs.insert', `INSERT INTO legacy_import_logs (id, source_type, source_key, status, imported_count, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`],
  ['legacy_import_logs.getById', `SELECT * FROM legacy_import_logs WHERE id = ?`],
  ['legacy_import_logs.getBySourceKey', `SELECT * FROM legacy_import_logs WHERE source_key = ? ORDER BY created_at DESC`],
  ['legacy_import_logs.hasSuccessfulImport', `SELECT id FROM legacy_import_logs WHERE source_key = ? AND status = 'success' LIMIT 1`],

  // auth_audit_logs（migrations/0006，TASK1.34；TASK1.39新增到這個驗證腳本）
  ['auth_audit_logs.insert', `INSERT INTO auth_audit_logs (id, user_id, event_type, provider, ip_hash, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`],
  ['auth_audit_logs.getById', `SELECT * FROM auth_audit_logs WHERE id = ?`],
  ['auth_audit_logs.listByUser', `SELECT * FROM auth_audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`],
  ['auth_audit_logs.listByEventType', `SELECT * FROM auth_audit_logs WHERE event_type = ? ORDER BY created_at DESC LIMIT ?`],
  ['auth_audit_logs.countByUser', `SELECT COUNT(*) as c FROM auth_audit_logs WHERE user_id = ?`],
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

/*
 * Phase 1 TASK 1.16｜用 EXPLAIN 對真實（本機模擬）D1 schema 驗證新增SQL語法
 * 零副作用：EXPLAIN 只編譯bytecode，不會真的執行、不會寫入任何資料。
 */
import { execFileSync } from 'child_process';

const SQL_STATEMENTS = [
  ['legacy_import_logs.insert', `INSERT INTO legacy_import_logs (id, source_type, source_key, status, imported_count, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`],
  ['legacy_import_logs.getById', `SELECT * FROM legacy_import_logs WHERE id = ?`],
  ['legacy_import_logs.getBySourceKey', `SELECT * FROM legacy_import_logs WHERE source_key = ? ORDER BY created_at DESC`],
  ['legacy_import_logs.hasSuccessfulImport', `SELECT id FROM legacy_import_logs WHERE source_key = ? AND status = 'success' LIMIT 1`],
  // import_transaction.js 回滾用的 DELETE 陳述式
  ['rollback.deleteUsers', `DELETE FROM users WHERE id = ?`],
  ['rollback.deleteExplorationRecords', `DELETE FROM exploration_records WHERE id = ?`],
  ['rollback.deleteFoodEvents', `DELETE FROM food_events WHERE id = ?`],
  ['rollback.deleteEmotionRecords', `DELETE FROM emotion_records WHERE id = ?`],
  ['rollback.deleteBehaviorPatterns', `DELETE FROM behavior_patterns WHERE id = ?`],
  ['rollback.deleteAiReports', `DELETE FROM ai_reports WHERE id = ?`],
];

let pass = 0;
for (const [name, sql] of SQL_STATEMENTS) {
  const explainSql = 'EXPLAIN ' + sql.replace(/\?/g, 'NULL');
  try {
    const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'diet-coach-db', '--local', '--command', explainSql, '--json'], { encoding: 'utf8', cwd: process.cwd() });
    const json = JSON.parse(out);
    const ok = json[0] && json[0].success === true;
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
    if (ok) pass++;
  } catch (e) {
    console.log('FAIL ' + name + ' — ' + e.message.slice(0, 300));
  }
}

console.log('\n---SUMMARY---');
console.log('PASS:', pass, '/', SQL_STATEMENTS.length);
if (pass !== SQL_STATEMENTS.length) process.exitCode = 1;
else console.log('✅✅✅ 全部 SQL 陳述式皆通過 EXPLAIN 語法驗證（零副作用，未寫入任何資料）');

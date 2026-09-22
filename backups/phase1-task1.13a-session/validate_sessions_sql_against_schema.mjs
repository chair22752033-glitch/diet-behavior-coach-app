/*
 * Phase 1 TASK 1.13A｜用 EXPLAIN 對真實（本機模擬）D1 schema 驗證 sessions 表 SQL 語法
 * 零副作用：EXPLAIN 只編譯bytecode，不會真的執行、不會寫入任何資料。
 */
import { execFileSync } from 'child_process';

const SQL_STATEMENTS = [
  ['sessions.insert', `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`],
  ['sessions.getById', `SELECT * FROM sessions WHERE id = ?`],
  ['sessions.listByUser', `SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC`],
  ['sessions.touch', `UPDATE sessions SET last_seen_at = ? WHERE id = ?`],
  ['sessions.revoke', `UPDATE sessions SET revoked_at = ? WHERE id = ?`],
  ['sessions.revokeAllForUser', `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`],
  ['sessions.deleteExpiredBefore', `DELETE FROM sessions WHERE expires_at < ?`],
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

/*
 * Phase 1 TASK 1.13B｜用 EXPLAIN 對真實（本機模擬）D1 schema 驗證 users 表新增SQL語法
 * 零副作用：EXPLAIN 只編譯bytecode，不會真的執行、不會寫入任何資料。
 */
import { execFileSync } from 'child_process';

const SQL_STATEMENTS = [
  ['users.insert（含status欄位）', `INSERT INTO users (id, auth_provider, auth_provider_id, display_name, is_guest, status, legacy_sync_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`],
  ['users.getByProvider', `SELECT * FROM users WHERE auth_provider = ? AND auth_provider_id = ?`],
  ['users.updateStatus', `UPDATE users SET status = ?, updated_at = ? WHERE id = ?`],
  ['users.upgradeToProvider', `UPDATE users SET auth_provider = ?, auth_provider_id = ?, is_guest = 0, updated_at = ? WHERE id = ?`],
  ['users.touchLogin', `UPDATE users SET last_login_at = ? WHERE id = ?`],
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

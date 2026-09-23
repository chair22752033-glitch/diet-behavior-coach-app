/*
 * Phase 1 TASK 1.30｜真實 Local D1 端對端驗證
 *
 * 跟TASK1.29的 real_d1_verify.mjs 同樣手法：用 Node 22 內建的 node:sqlite
 * 直接打開 wrangler 本機 D1 狀態實際使用的 SQLite 檔案，包成符合
 * src/db/query.js 期待的 D1 binding 介面，讓真正的 src/worker.js 透過
 * 真正的 Router → Contract Validation → Controller → Application
 * Service → Identity → Session → D1 這整條路徑操作「真的」本機 D1。
 *
 * 流程：
 * 1. 執行前：確認 users/sessions 都是 0
 * 2. POST /auth/guest 建立一個真正的guest+session
 * 3. GET /auth/me（帶上剛才的cookie）：確認 200、user資料正確
 * 4. POST /auth/logout（帶上同一個cookie）：確認 200、Set-Cookie清除、
 *    wasValid=true
 * 5. 直接查詢本機D1，確認該session的revoked_at已被設定
 * 6. 再次 GET /auth/me（帶上同一個已撤銷的cookie）：確認 401
 * 7. 清理：DELETE 掉這一筆測試資料
 * 8. 執行後：再次確認 users/sessions 都回到 0
 *
 * KV/R2 一律用純記憶體假binding，不動到任何真實資料。
 */
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const workerPath = path.join(repoRoot, 'src', 'worker.js');

function findLocalD1File() {
  const dir = path.join(repoRoot, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (files.length !== 1) {
    throw new Error(`預期只有一個 D1 sqlite 檔案，實際找到 ${files.length} 個: ${files.join(', ')}`);
  }
  return path.join(dir, files[0]);
}

function createRealD1Binding(sqlitePath) {
  const conn = new DatabaseSync(sqlitePath);

  function makeStatement(sql, boundParams) {
    return {
      bind(...params) {
        return makeStatement(sql, params);
      },
      async run() {
        const stmt = conn.prepare(sql);
        const info = stmt.run(...(boundParams || []));
        return { success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
      },
      async all() {
        const stmt = conn.prepare(sql);
        const results = stmt.all(...(boundParams || []));
        return { results, success: true };
      },
      async first() {
        const stmt = conn.prepare(sql);
        const row = stmt.get(...(boundParams || []));
        return row === undefined ? null : row;
      },
    };
  }

  return {
    prepare(sql) {
      return makeStatement(sql, []);
    },
    async batch(statements) {
      const results = [];
      for (const s of statements) results.push(await s.run());
      return results;
    },
    __raw: conn,
  };
}

function makeFakeKV() {
  const store = new Map();
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}
function makeFakeR2() {
  return { async get() { return null; } };
}

function countRows(conn, table) {
  const row = conn.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();
  return row.c;
}

async function main() {
  console.log('=== TASK1.30 真實 Local D1 端對端驗證（/auth/me、/auth/logout）===\n');

  const d1File = findLocalD1File();
  console.log('D1 sqlite 檔案:', d1File);

  const d1Binding = createRealD1Binding(d1File);
  const conn = d1Binding.__raw;

  const usersBefore = countRows(conn, 'users');
  const sessionsBefore = countRows(conn, 'sessions');
  console.log(`執行前： users=${usersBefore}, sessions=${sessionsBefore}`);
  assert.strictEqual(usersBefore, 0, '執行前 users 應為 0');
  assert.strictEqual(sessionsBefore, 0, '執行前 sessions 應為 0');

  const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
  const mod = await import(workerUrl);
  const worker = mod.default;

  const env = {
    SYNC_KV: makeFakeKV(),
    DIET_COACH_IMAGES: makeFakeR2(),
    DIET_COACH_DB: d1Binding,
  };

  console.log('\n--- 步驟1：POST /auth/guest ---');
  const loginRes = await worker.fetch(
    new Request('https://example.com/auth/guest', { method: 'POST', body: JSON.stringify({ metadata: { source: 'task1.30-real-d1-verify' } }) }),
    env,
    {}
  );
  assert.strictEqual(loginRes.status, 200);
  const loginBody = await loginRes.json();
  const userId = loginBody.data.user.id;
  const cookieValue = loginRes.headers.get('set-cookie').split(';')[0];
  console.log('guest login成功，user.id =', userId, ', cookie =', cookieValue);

  const usersAfterLogin = countRows(conn, 'users');
  const sessionsAfterLogin = countRows(conn, 'sessions');
  console.log(`guest login後： users=${usersAfterLogin}, sessions=${sessionsAfterLogin}`);
  assert.strictEqual(usersAfterLogin, 1);
  assert.strictEqual(sessionsAfterLogin, 1);

  console.log('\n--- 步驟2：GET /auth/me（帶上剛才的cookie）---');
  const meRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
  assert.strictEqual(meRes.status, 200, `預期200，實際${meRes.status}`);
  const meBody = await meRes.json();
  assert.strictEqual(meBody.ok, true);
  assert.strictEqual(meBody.data.user.id, userId);
  assert.strictEqual(meRes.headers.get('set-cookie'), null, 'GET /auth/me不應該產生Set-Cookie');
  console.log('GET /auth/me 成功，取回同一個user，且沒有意外建立新session');

  const sessionsAfterMe = countRows(conn, 'sessions');
  assert.strictEqual(sessionsAfterMe, 1, 'GET /auth/me之後sessions筆數應該不變（純讀取）');

  console.log('\n--- 步驟3：POST /auth/logout（帶上同一個cookie）---');
  const logoutRes = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', headers: { Cookie: cookieValue } }), env, {});
  assert.strictEqual(logoutRes.status, 200);
  const logoutBody = await logoutRes.json();
  assert.strictEqual(logoutBody.data.wasValid, true);
  const logoutSetCookie = logoutRes.headers.get('set-cookie');
  assert.ok(logoutSetCookie.startsWith('dbc_sid=;'));
  assert.ok(logoutSetCookie.includes('Max-Age=0'));
  assert.ok(logoutSetCookie.includes('HttpOnly'));
  assert.ok(logoutSetCookie.includes('Secure'));
  assert.ok(logoutSetCookie.includes('SameSite=Lax'));
  console.log('POST /auth/logout 成功，wasValid=true，Set-Cookie正確清除（Max-Age=0, HttpOnly, Secure, SameSite=Lax）');

  const sessionRow = conn.prepare('SELECT * FROM sessions WHERE user_id = ?').get(userId);
  assert.ok(sessionRow.revoked_at, '真實D1裡的session應該已被標記revoked_at');
  console.log('真實D1確認：sessions.revoked_at =', sessionRow.revoked_at);

  console.log('\n--- 步驟4：logout後再次 GET /auth/me（同一個已撤銷的cookie）---');
  const meAfterLogoutRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: cookieValue } }), env, {});
  assert.strictEqual(meAfterLogoutRes.status, 401, `預期401，實際${meAfterLogoutRes.status}`);
  const meAfterLogoutBody = await meAfterLogoutRes.json();
  assert.strictEqual(meAfterLogoutBody.reason, 'revoked');
  console.log('logout後 GET /auth/me 正確回401，reason=revoked（session不可再次使用）');

  console.log('\n=== 清理測試資料 ===');
  conn.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  conn.prepare('DELETE FROM users WHERE id = ?').run(userId);

  const usersFinal = countRows(conn, 'users');
  const sessionsFinal = countRows(conn, 'sessions');
  console.log(`清理後： users=${usersFinal}, sessions=${sessionsFinal}`);
  assert.strictEqual(usersFinal, 0, '清理後 users 應回到 0');
  assert.strictEqual(sessionsFinal, 0, '清理後 sessions 應回到 0');

  conn.close();

  console.log('\n✅✅✅ 真實 Local D1 端對端驗證全數通過（guest login → /auth/me → logout → /auth/me），測試資料已清理乾淨。');
}

main().catch((e) => {
  console.error('❌ 驗證失敗:', e);
  process.exitCode = 1;
});

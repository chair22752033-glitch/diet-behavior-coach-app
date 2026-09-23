/*
 * Phase 1 TASK 1.31｜真實 Local D1 端對端驗證
 *
 * 跟TASK1.29/1.30的 real_d1_verify.mjs 同樣手法：用 Node 22 內建的
 * node:sqlite 直接打開 wrangler 本機 D1 狀態實際使用的 SQLite 檔案，
 * 包成符合 src/db/query.js 期待的 D1 binding 介面，讓真正的
 * src/worker.js 透過真正的 Router → Contract Validation → Controller →
 * Application Service → Identity → Session → D1 這整條路徑操作
 * 「真的」本機 D1。
 *
 * 流程：
 * 1. 執行前：確認 users/sessions 都是 0
 * 2. POST /auth/guest 建立一個真正的guest+session
 * 3. POST /auth/provider/upgrade（帶上guest的cookie）：確認 200、
 *    user.auth_provider=google、is_guest=0、user_id不變
 * 4. 直接查詢本機D1，確認：
 *    - users 仍然只有 1 筆（原地升級，沒有建立新帳號）
 *    - 舊session的revoked_at已被設定
 *    - 新session存在且未撤銷（active）
 * 5. 清理：DELETE 掉這一筆測試資料（含新舊兩筆session）
 * 6. 執行後：再次確認 users/sessions 都回到 0
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
  console.log('=== TASK1.31 真實 Local D1 端對端驗證（guest → upgrade → provider帳號）===\n');

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
    new Request('https://example.com/auth/guest', { method: 'POST', body: JSON.stringify({ metadata: { source: 'task1.31-real-d1-verify' } }) }),
    env,
    {}
  );
  assert.strictEqual(loginRes.status, 200);
  const loginBody = await loginRes.json();
  const guestUserId = loginBody.data.user.id;
  const oldSessionToken = loginBody.data.session.token;
  const oldCookieValue = loginRes.headers.get('set-cookie').split(';')[0];
  console.log('guest login成功，user.id =', guestUserId, ', 舊session token =', oldSessionToken);

  const usersAfterLogin = countRows(conn, 'users');
  const sessionsAfterLogin = countRows(conn, 'sessions');
  console.log(`guest login後： users=${usersAfterLogin}, sessions=${sessionsAfterLogin}`);
  assert.strictEqual(usersAfterLogin, 1);
  assert.strictEqual(sessionsAfterLogin, 1);

  console.log('\n--- 步驟2：POST /auth/provider/upgrade（帶上guest的cookie）---');
  const upgradeRes = await worker.fetch(
    new Request('https://example.com/auth/provider/upgrade', {
      method: 'POST',
      headers: { Cookie: oldCookieValue },
      body: JSON.stringify({ provider: 'google', providerId: 'test-google-id-task1.31', email: 'test@example.com', displayName: 'Test User' }),
    }),
    env,
    {}
  );
  assert.strictEqual(upgradeRes.status, 200, `預期200，實際${upgradeRes.status}`);
  const upgradeBody = await upgradeRes.json();
  assert.strictEqual(upgradeBody.ok, true);
  const newCookieValue = upgradeRes.headers.get('set-cookie').split(';')[0];
  const newSessionToken = upgradeBody.data.session.token;
  console.log('升級成功，新session token =', newSessionToken);

  console.log('\n--- 步驟3：驗證user_id不變 + provider mapping正確 ---');
  assert.strictEqual(upgradeBody.data.user.id, guestUserId, 'user_id應該保持不變（原地升級）');
  assert.strictEqual(upgradeBody.data.user.auth_provider, 'google');
  assert.strictEqual(upgradeBody.data.user.auth_provider_id, 'test-google-id-task1.31');
  assert.ok(upgradeBody.data.user.is_guest === 0 || upgradeBody.data.user.is_guest === false);
  console.log('user_id不變確認：', guestUserId, '，auth_provider=google，is_guest=0');

  console.log('\n--- 步驟4：直接查詢本機D1，確認users仍只有1筆、舊session已revoked、新session active ---');
  const usersAfterUpgrade = countRows(conn, 'users');
  assert.strictEqual(usersAfterUpgrade, 1, 'users應該仍然只有1筆（原地升級，沒有建立新帳號）');

  const userRow = conn.prepare('SELECT * FROM users WHERE id = ?').get(guestUserId);
  assert.strictEqual(userRow.auth_provider, 'google');
  assert.strictEqual(userRow.is_guest, 0);

  const oldSessionRow = conn.prepare('SELECT * FROM sessions WHERE id = ?').get(oldSessionToken);
  assert.ok(oldSessionRow.revoked_at, '舊session應該已被撤銷');
  console.log('舊session (', oldSessionToken, ') revoked_at =', oldSessionRow.revoked_at);

  const newSessionRow = conn.prepare('SELECT * FROM sessions WHERE id = ?').get(newSessionToken);
  assert.strictEqual(newSessionRow.revoked_at, null, '新session應該是active（未撤銷）');
  assert.strictEqual(newSessionRow.user_id, guestUserId);
  console.log('新session (', newSessionToken, ') revoked_at =', newSessionRow.revoked_at, '（active）');

  const sessionsAfterUpgrade = countRows(conn, 'sessions');
  assert.strictEqual(sessionsAfterUpgrade, 2, 'sessions應該有2筆（舊的revoked + 新的active）');
  console.log('sessions總數 =', sessionsAfterUpgrade, '（1筆revoked + 1筆active）');

  console.log('\n--- 步驟5：驗證舊cookie失效、新cookie有效 ---');
  const meWithOldCookie = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: oldCookieValue } }), env, {});
  assert.strictEqual(meWithOldCookie.status, 401);
  const meWithNewCookie = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: newCookieValue } }), env, {});
  assert.strictEqual(meWithNewCookie.status, 200);
  console.log('舊cookie正確失效(401)，新cookie正確有效(200)');

  console.log('\n=== 清理測試資料 ===');
  conn.prepare('DELETE FROM sessions WHERE user_id = ?').run(guestUserId);
  conn.prepare('DELETE FROM users WHERE id = ?').run(guestUserId);

  const usersFinal = countRows(conn, 'users');
  const sessionsFinal = countRows(conn, 'sessions');
  console.log(`清理後： users=${usersFinal}, sessions=${sessionsFinal}`);
  assert.strictEqual(usersFinal, 0, '清理後 users 應回到 0');
  assert.strictEqual(sessionsFinal, 0, '清理後 sessions 應回到 0');

  conn.close();

  console.log('\n✅✅✅ 真實 Local D1 端對端驗證全數通過（guest → upgrade → provider帳號，user_id不變、session rotation正確），測試資料已清理乾淨。');
}

main().catch((e) => {
  console.error('❌ 驗證失敗:', e);
  process.exitCode = 1;
});

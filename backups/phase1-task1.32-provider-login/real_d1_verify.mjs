/*
 * Phase 1 TASK 1.32｜真實 Local D1 端對端驗證
 *
 * 跟TASK1.29/1.30/1.31的 real_d1_verify.mjs 同樣手法：用 Node 22 內建的
 * node:sqlite 直接打開 wrangler 本機 D1 狀態實際使用的 SQLite 檔案，
 * 包成符合 src/db/query.js 期待的 D1 binding 介面，讓真正的
 * src/worker.js 透過真正的 Router → Contract Validation → loginProviderController →
 * auth_application_service.loginWithProvider() → resolveLoginIdentity() →
 * createSession() 這整條路徑操作「真的」本機 D1。
 *
 * 流程：
 * 1. 執行前：確認 users/sessions 都是 0
 * 2. POST /auth/provider（第一次登入，全新的provider identity）：
 *    確認 200、created=true、users新增1筆、sessions新增1筆active session
 * 3. 直接查詢本機D1，確認新建立的user的auth_provider/auth_provider_id/
 *    is_guest/status正確
 * 4. POST /auth/provider（第二次，同一個provider identity）：
 *    確認 200、created=false、user.id與第一次相同（不是新建立第二筆）、
 *    users仍然只有1筆（唯一性保證：provider identity不可重複）
 * 5. 確認sessions變成2筆（每次登入都建立新session，都是active，互不撤銷
 *    ——這跟upgrade流程的「撤銷舊session」不同，provider login本來就允許
 *    同一個帳號多裝置/多次登入同時有效）
 * 6. 用第二次登入回傳的cookie呼叫/auth/me確認可用
 * 7. 清理：DELETE 掉這一筆測試資料（含兩筆session）
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
  console.log('=== TASK1.32 真實 Local D1 端對端驗證（provider login：existing/new user + 唯一性保證）===\n');

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

  const providerId = 'test-google-id-task1.32';

  console.log('\n--- 步驟1：POST /auth/provider（第一次登入，全新的provider identity）---');
  const firstRes = await worker.fetch(
    new Request('https://example.com/auth/provider', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', providerId, email: 'test@example.com', displayName: 'Test User' }),
    }),
    env,
    {}
  );
  assert.strictEqual(firstRes.status, 200, `預期200，實際${firstRes.status}`);
  const firstBody = await firstRes.json();
  assert.strictEqual(firstBody.ok, true);
  assert.strictEqual(firstBody.data.created, true, '第一次登入應該是新建立');
  const userId = firstBody.data.user.id;
  const firstSessionToken = firstBody.data.session.token;
  const firstCookieValue = firstRes.headers.get('set-cookie').split(';')[0];
  console.log('第一次登入成功（新建立），user.id =', userId, ', session token =', firstSessionToken);

  const usersAfterFirst = countRows(conn, 'users');
  const sessionsAfterFirst = countRows(conn, 'sessions');
  console.log(`第一次登入後： users=${usersAfterFirst}, sessions=${sessionsAfterFirst}`);
  assert.strictEqual(usersAfterFirst, 1);
  assert.strictEqual(sessionsAfterFirst, 1);

  console.log('\n--- 步驟2：直接查詢本機D1，確認新建立的user資料正確 ---');
  const userRowAfterFirst = conn.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  assert.strictEqual(userRowAfterFirst.auth_provider, 'google');
  assert.strictEqual(userRowAfterFirst.auth_provider_id, providerId);
  assert.strictEqual(userRowAfterFirst.is_guest, 0, '透過provider login建立的user不是guest');
  assert.strictEqual(userRowAfterFirst.status, 'active');
  console.log('user資料確認：auth_provider=google, auth_provider_id=' + providerId + ', is_guest=0, status=active');

  console.log('\n--- 步驟3：POST /auth/provider（第二次，同一個provider identity）---');
  const secondRes = await worker.fetch(
    new Request('https://example.com/auth/provider', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', providerId, email: 'test@example.com', displayName: 'Test User' }),
    }),
    env,
    {}
  );
  assert.strictEqual(secondRes.status, 200);
  const secondBody = await secondRes.json();
  assert.strictEqual(secondBody.data.created, false, '第二次登入應該找到既有user，不是新建立');
  assert.strictEqual(secondBody.data.user.id, userId, 'user_id應該與第一次登入完全相同');
  const secondSessionToken = secondBody.data.session.token;
  const secondCookieValue = secondRes.headers.get('set-cookie').split(';')[0];
  console.log('第二次登入成功（existing user），user.id =', secondBody.data.user.id, '（與第一次相同），session token =', secondSessionToken);

  console.log('\n--- 步驟4：驗證唯一性保證——users仍然只有1筆（provider identity不可重複建立第二筆帳號）---');
  const usersAfterSecond = countRows(conn, 'users');
  assert.strictEqual(usersAfterSecond, 1, 'users應該仍然只有1筆（同一個provider identity不會建立第二個帳號）');
  console.log('users總數 =', usersAfterSecond, '（唯一性保證成立）');

  console.log('\n--- 步驟5：驗證sessions變成2筆，且都是active（provider login允許多次/多裝置同時有效session）---');
  const sessionsAfterSecond = countRows(conn, 'sessions');
  assert.strictEqual(sessionsAfterSecond, 2, 'sessions應該有2筆（每次登入都建立新session）');
  const firstSessionRow = conn.prepare('SELECT * FROM sessions WHERE id = ?').get(firstSessionToken);
  const secondSessionRow = conn.prepare('SELECT * FROM sessions WHERE id = ?').get(secondSessionToken);
  assert.strictEqual(firstSessionRow.revoked_at, null, '第一次登入的session不應該被撤銷（provider login不做session rotation）');
  assert.strictEqual(secondSessionRow.revoked_at, null, '第二次登入的session應該是active');
  assert.strictEqual(firstSessionRow.user_id, userId);
  assert.strictEqual(secondSessionRow.user_id, userId);
  console.log('sessions總數 =', sessionsAfterSecond, '（2筆皆active，皆指向同一個user_id）');

  console.log('\n--- 步驟6：用兩個session各自的cookie呼叫/auth/me都應該成功 ---');
  const meWithFirstCookie = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: firstCookieValue } }), env, {});
  assert.strictEqual(meWithFirstCookie.status, 200);
  const meWithSecondCookie = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: secondCookieValue } }), env, {});
  assert.strictEqual(meWithSecondCookie.status, 200);
  console.log('兩個cookie都能正確驗證身份（皆回200）');

  console.log('\n=== 清理測試資料 ===');
  conn.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  conn.prepare('DELETE FROM users WHERE id = ?').run(userId);

  const usersFinal = countRows(conn, 'users');
  const sessionsFinal = countRows(conn, 'sessions');
  console.log(`清理後： users=${usersFinal}, sessions=${sessionsFinal}`);
  assert.strictEqual(usersFinal, 0, '清理後 users 應回到 0');
  assert.strictEqual(sessionsFinal, 0, '清理後 sessions 應回到 0');

  conn.close();

  console.log('\n✅✅✅ 真實 Local D1 端對端驗證全數通過（provider login：existing/new user建立正確、provider identity唯一性保證成立、session各自獨立），測試資料已清理乾淨。');
}

main().catch((e) => {
  console.error('❌ 驗證失敗:', e);
  process.exitCode = 1;
});

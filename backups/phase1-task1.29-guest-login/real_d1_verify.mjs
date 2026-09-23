/*
 * Phase 1 TASK 1.29｜真實 Local D1 端對端驗證
 *
 * 跟本目錄下 test_guest_login_mock.mjs（純記憶體mock）不同，這裡用
 * Node 22 內建的 node:sqlite 直接打開 wrangler 本機 D1 狀態實際使用的
 * SQLite 檔案，包成符合 src/db/query.js 期待的 D1 binding 介面
 * （prepare().bind().run()/all()/first()），讓真正的 src/worker.js
 * 透過真正的 Router → Contract Validation → Controller → Application
 * Service → Identity → Session → D1 這整條路徑寫入「真的」本機 D1，
 * 而不是mock。
 *
 * 流程：
 * 1. 執行前：確認 users/sessions 都是 0
 * 2. 呼叫一次真正的 worker.fetch(POST /auth/guest)
 * 3. 確認 Response 是 200、帶有正確的 Set-Cookie
 * 4. 直接查詢本機 D1，確認 users/sessions 各多了一筆，且欄位正確
 * 5. 清理：DELETE 掉這一筆測試資料
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
  console.log('=== TASK1.29 真實 Local D1 端對端驗證 ===\n');

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

  console.log('\n呼叫 POST /auth/guest（透過真正的 worker.fetch()，寫入真正的本機D1）...');
  const res = await worker.fetch(
    new Request('https://example.com/auth/guest', { method: 'POST', body: JSON.stringify({ metadata: { source: 'task1.29-real-d1-verify' } }) }),
    env,
    {}
  );

  assert.strictEqual(res.status, 200, `預期200，實際${res.status}`);
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, '應該有 Set-Cookie header');
  assert.ok(setCookie.startsWith('dbc_sid='));
  assert.ok(setCookie.includes('HttpOnly'));
  assert.ok(setCookie.includes('Secure'));
  assert.ok(setCookie.includes('SameSite=Lax'));
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  const userId = body.data.user.id;
  const sessionToken = body.data.session.token;
  console.log('回應 200，Set-Cookie正確，user.id =', userId);

  const usersAfter = countRows(conn, 'users');
  const sessionsAfter = countRows(conn, 'sessions');
  console.log(`\n呼叫後： users=${usersAfter}, sessions=${sessionsAfter}`);
  assert.strictEqual(usersAfter, 1, '呼叫後 users 應為 1（僅測試資料）');
  assert.strictEqual(sessionsAfter, 1, '呼叫後 sessions 應為 1（僅測試資料）');

  const userRow = conn.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  assert.ok(userRow, '應該能在真實D1查到剛建立的user');
  assert.strictEqual(userRow.is_guest, 1);
  assert.strictEqual(userRow.auth_provider, null);
  assert.strictEqual(userRow.status, 'active');
  console.log('users表資料正確：is_guest=1, auth_provider=null, status=active');

  const sessionRow = conn.prepare('SELECT * FROM sessions WHERE user_id = ?').get(userId);
  assert.ok(sessionRow, '應該能在真實D1查到剛建立的session');
  assert.strictEqual(sessionRow.revoked_at, null);
  const ttlSeconds = (new Date(sessionRow.expires_at).getTime() - new Date(sessionRow.created_at).getTime()) / 1000;
  assert.strictEqual(Math.round(ttlSeconds), 30 * 24 * 60 * 60);
  console.log('sessions表資料正確：revoked_at=null, TTL=30天');

  console.log('\n=== 清理測試資料 ===');
  conn.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  conn.prepare('DELETE FROM users WHERE id = ?').run(userId);

  const usersFinal = countRows(conn, 'users');
  const sessionsFinal = countRows(conn, 'sessions');
  console.log(`清理後： users=${usersFinal}, sessions=${sessionsFinal}`);
  assert.strictEqual(usersFinal, 0, '清理後 users 應回到 0');
  assert.strictEqual(sessionsFinal, 0, '清理後 sessions 應回到 0');

  conn.close();

  console.log('\n✅✅✅ 真實 Local D1 端對端驗證全數通過，測試資料已清理乾淨。');
}

main().catch((e) => {
  console.error('❌ 驗證失敗:', e);
  process.exitCode = 1;
});

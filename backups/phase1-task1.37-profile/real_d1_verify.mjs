/*
 * Phase 1 TASK 1.37｜真實 Local D1 端對端驗證
 *
 * 跟TASK1.29～1.36的 real_d1_verify.mjs 同樣手法：用 Node 22 內建的
 * node:sqlite 直接打開 wrangler 本機 D1 狀態實際使用的 SQLite 檔案，
 * 包成符合 src/db/query.js 期待的 D1 binding 介面，讓真正的
 * src/worker.js 透過真正的 Router → requireAuth() → Contract
 * Validation → Profile Controller → Profile Service → User Service /
 * DB Access Layer → D1 這整條路徑操作「真的」本機 D1。
 *
 * 流程：
 * 1. 執行前：確認 users/sessions 都是 0
 * 2. POST /auth/guest 建立 User A（真正的user + session）
 * 3. GET /api/profile，確認回傳的資料正確（id/isGuest/status等）
 * 4. PATCH /api/profile 更新 display_name
 * 5. GET /api/profile，確認更新成功、其餘欄位（id/authProvider/status/
 *    createdAt）完全沒有被改動
 * 6. 建立 User B，確認 User B 的session無法取得/影響 User A 的profile
 *    （cross-user isolation在真實D1上成立）
 * 7. 清理：DELETE 掉這次測試建立的所有資料（兩個user + 兩組session）
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
      bind(...params) { return makeStatement(sql, params); },
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
    prepare(sql) { return makeStatement(sql, []); },
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

async function guestLogin(worker, env) {
  const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), env, {});
  const body = await res.json();
  return { userId: body.data.user.id, cookie: res.headers.get('set-cookie').split(';')[0] };
}

async function main() {
  console.log('=== TASK1.37 真實 Local D1 端對端驗證（Profile：GET/PATCH + identity/system field protection + cross-user isolation）===\n');

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

  console.log('\n--- 步驟1：POST /auth/guest 建立 User A ---');
  const userA = await guestLogin(worker, env);
  console.log('userA.id =', userA.userId);
  assert.strictEqual(countRows(conn, 'users'), 1);
  assert.strictEqual(countRows(conn, 'sessions'), 1);

  console.log('\n--- 步驟2：GET /api/profile，確認初始資料正確 ---');
  const firstGetRes = await worker.fetch(new Request('https://example.com/api/profile', { headers: { Cookie: userA.cookie } }), env, {});
  assert.strictEqual(firstGetRes.status, 200);
  const firstProfile = await firstGetRes.json();
  assert.strictEqual(firstProfile.data.id, userA.userId);
  assert.strictEqual(firstProfile.data.isGuest, true);
  assert.strictEqual(firstProfile.data.status, 'active');
  assert.strictEqual(firstProfile.data.authProvider, null);
  console.log('GET profile正確：id=' + firstProfile.data.id + ', isGuest=true, status=active');

  console.log('\n--- 步驟3：PATCH /api/profile 更新 display_name ---');
  const patchRes = await worker.fetch(
    new Request('https://example.com/api/profile', { method: 'PATCH', headers: { Cookie: userA.cookie }, body: JSON.stringify({ displayName: 'Real D1 Verify User' }) }),
    env, {}
  );
  assert.strictEqual(patchRes.status, 200, `PATCH應該成功，實際${patchRes.status}`);
  const patchBody = await patchRes.json();
  assert.strictEqual(patchBody.data.displayName, 'Real D1 Verify User');
  console.log('PATCH成功，displayName更新為：', patchBody.data.displayName);

  console.log('\n--- 步驟4：直接查詢本機D1，確認display_name真的被寫入，其餘identity/system欄位完全沒被改動 ---');
  const userRow = conn.prepare('SELECT * FROM users WHERE id = ?').get(userA.userId);
  assert.strictEqual(userRow.display_name, 'Real D1 Verify User');
  assert.strictEqual(userRow.is_guest, 1);
  assert.strictEqual(userRow.status, 'active');
  assert.strictEqual(userRow.auth_provider, null);
  console.log('D1確認：display_name已更新，is_guest/status/auth_provider完全沒有被改動');

  console.log('\n--- 步驟5：再次 GET /api/profile，確認更新成功且其餘欄位不變 ---');
  const secondGetRes = await worker.fetch(new Request('https://example.com/api/profile', { headers: { Cookie: userA.cookie } }), env, {});
  const secondProfile = await secondGetRes.json();
  assert.strictEqual(secondProfile.data.displayName, 'Real D1 Verify User');
  assert.strictEqual(secondProfile.data.id, userA.userId);
  assert.strictEqual(secondProfile.data.isGuest, true);
  assert.strictEqual(secondProfile.data.status, 'active');
  console.log('GET profile確認更新成功，id/isGuest/status皆維持不變');

  console.log('\n--- 步驟6：嘗試PATCH身份/系統欄位（auth_provider/status/is_guest），確認被忽略 ---');
  const maliciousPatchRes = await worker.fetch(
    new Request('https://example.com/api/profile', {
      method: 'PATCH',
      headers: { Cookie: userA.cookie },
      body: JSON.stringify({ displayName: 'Still Valid Name', auth_provider: 'facebook', status: 'deleted', is_guest: false, user_id: 'someone-else' }),
    }),
    env, {}
  );
  assert.strictEqual(maliciousPatchRes.status, 200, 'displayName本身合法，更新應該成功');
  const maliciousBody = await maliciousPatchRes.json();
  assert.strictEqual(maliciousBody.data.displayName, 'Still Valid Name');
  assert.strictEqual(maliciousBody.data.authProvider, null, 'auth_provider應該完全沒有被改動（原本就是null，guest帳號）');
  assert.strictEqual(maliciousBody.data.status, 'active', 'status應該完全沒有被改動');
  assert.strictEqual(maliciousBody.data.isGuest, true, 'is_guest應該完全沒有被改動');
  const rowAfterMalicious = conn.prepare('SELECT * FROM users WHERE id = ?').get(userA.userId);
  assert.strictEqual(rowAfterMalicious.auth_provider, null);
  assert.strictEqual(rowAfterMalicious.status, 'active');
  assert.strictEqual(rowAfterMalicious.is_guest, 1);
  console.log('確認：payload夾帶的auth_provider/status/is_guest/user_id全部被忽略，只有displayName真的被更新');

  console.log('\n--- 步驟7：建立 User B，確認無法取得/影響 User A 的profile（cross-user isolation） ---');
  const userB = await guestLogin(worker, env);
  console.log('userB.id =', userB.userId);
  const userBProfileRes = await worker.fetch(new Request('https://example.com/api/profile', { headers: { Cookie: userB.cookie } }), env, {});
  const userBProfile = await userBProfileRes.json();
  assert.strictEqual(userBProfile.data.id, userB.userId);
  assert.notStrictEqual(userBProfile.data.id, userA.userId);
  assert.notStrictEqual(userBProfile.data.displayName, 'Still Valid Name');
  console.log('確認：userB的profile是自己的資料，跟userA完全不同');

  console.log('\n--- 步驟8：確認未登入（沒有cookie）無法存取profile ---');
  const noCookieRes = await worker.fetch(new Request('https://example.com/api/profile'), env, {});
  assert.strictEqual(noCookieRes.status, 401);
  console.log('未登入GET /api/profile正確回401');

  console.log('\n=== 清理測試資料 ===');
  conn.prepare('DELETE FROM sessions WHERE user_id IN (?, ?)').run(userA.userId, userB.userId);
  conn.prepare('DELETE FROM users WHERE id IN (?, ?)').run(userA.userId, userB.userId);

  const usersFinal = countRows(conn, 'users');
  const sessionsFinal = countRows(conn, 'sessions');
  console.log(`清理後： users=${usersFinal}, sessions=${sessionsFinal}`);
  assert.strictEqual(usersFinal, 0, '清理後 users 應回到 0');
  assert.strictEqual(sessionsFinal, 0, '清理後 sessions 應回到 0');

  conn.close();

  console.log('\n✅✅✅ 真實 Local D1 端對端驗證全數通過（GET/PATCH profile正確、identity/system欄位保護在真實D1上成立、cross-user isolation成立、未登入正確拒絕），測試資料已清理乾淨。');
}

main().catch((e) => {
  console.error('❌ 驗證失敗:', e);
  process.exitCode = 1;
});

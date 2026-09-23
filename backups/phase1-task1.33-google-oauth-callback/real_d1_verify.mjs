/*
 * Phase 1 TASK 1.33｜真實 Local D1 端對端驗證
 *
 * 跟TASK1.29～1.32的 real_d1_verify.mjs 同樣手法：用 Node 22 內建的
 * node:sqlite 直接打開 wrangler 本機 D1 狀態實際使用的 SQLite 檔案，
 * 包成符合 src/db/query.js 期待的 D1 binding 介面，讓真正的
 * src/worker.js 透過真正的 Router → Contract Validation →
 * googleOAuthCallbackController → auth_application_service.
 * loginWithGoogleCallback() → oauth_state驗證 → googleProvider.
 * exchangeCode()/getUserProfile()（這裡用假fetch mock，不連線真實
 * Google伺服器）→ provider_mapping → loginWithProvider() → createSession()
 * 這整條路徑操作「真的」本機 D1。
 *
 * 流程：
 * 1. 執行前：確認 users/sessions 都是 0
 * 2. 建立一組真正的oauth state（createOAuthState()），存進oauth_state
 *    cookie，模擬「登入前一步」已經完成
 * 3. GET /auth/google/callback（帶正確code+state+cookie，google端點用
 *    假fetch mock）：確認 302導回首頁、Set-Cookie帶新session
 * 4. 直接查詢本機D1，確認：
 *    - users新增1筆，auth_provider=google、is_guest=0、status=active
 *    - sessions新增1筆active session
 * 5. 清理：DELETE 掉這一筆測試資料
 * 6. 執行後：再次確認 users/sessions 都回到 0
 *
 * KV/R2 一律用純記憶體假binding，client_id/client_secret 一律是明顯的
 * 假值（沿用TASK1.17測試慣例），不使用任何真實 Google 憑證或帳號資料。
 */
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createOAuthState } from '../../src/oauth/oauth_state.js';
import { serializeCookie } from '../../src/auth/cookie.js';
import { OAUTH_STATE_COOKIE_NAME } from '../../src/services/auth_application_service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const workerPath = path.join(repoRoot, 'src', 'worker.js');

const FAKE_CONFIG = {
  client_id: 'test-client-id.apps.googleusercontent.com',
  client_secret: 'FAKE_CLIENT_SECRET_FOR_TEST_ONLY',
  redirect_uri: 'https://example.com/auth/google/callback',
};

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

// 假fetch：模擬Google的token端點與userinfo端點，完全不連線真實網路。
function makeFakeGoogleFetch() {
  return async (url) => {
    const u = String(url);
    if (u.indexOf('oauth2.googleapis.com/token') >= 0) {
      return { ok: true, json: async () => ({ access_token: 'FAKE_ACCESS_TOKEN_TASK1.33', token_type: 'Bearer', expires_in: 3600, id_token: 'FAKE_ID_TOKEN_SHOULD_NEVER_LAND' }) };
    }
    if (u.indexOf('googleapis.com/oauth2/v2/userinfo') >= 0) {
      return { ok: true, json: async () => ({ id: 'g-real-d1-verify-task1.33', email: 'real-d1-verify@example.com', name: 'Real D1 Verify User' }) };
    }
    throw new Error('unexpected fetch to ' + u);
  };
}

async function main() {
  console.log('=== TASK1.33 真實 Local D1 端對端驗證（Google OAuth callback：mock Google端點 + 真正D1）===\n');

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
    GOOGLE_CLIENT_ID: FAKE_CONFIG.client_id,
    GOOGLE_CLIENT_SECRET: FAKE_CONFIG.client_secret,
    GOOGLE_REDIRECT_URI: FAKE_CONFIG.redirect_uri,
  };

  console.log('\n--- 步驟1：建立oauth state，模擬「登入前一步」已存放state cookie ---');
  const stateRecord = createOAuthState();
  const stateCookie = serializeCookie(OAUTH_STATE_COOKIE_NAME, JSON.stringify(stateRecord), { secure: false }).split(';')[0];
  console.log('state =', stateRecord.state);

  console.log('\n--- 步驟2：GET /auth/google/callback（worker.js的real global fetch暫時替換成假Google端點）---');
  const originalGlobalFetch = globalThis.fetch;
  globalThis.fetch = makeFakeGoogleFetch();
  let callbackRes;
  try {
    callbackRes = await worker.fetch(
      new Request(`https://example.com/auth/google/callback?code=fake-authorization-code&state=${encodeURIComponent(stateRecord.state)}`, {
        headers: { Cookie: stateCookie },
      }),
      env,
      {}
    );
  } finally {
    globalThis.fetch = originalGlobalFetch;
  }
  assert.strictEqual(callbackRes.status, 302, `預期302，實際${callbackRes.status}`);
  assert.strictEqual(callbackRes.headers.get('Location'), '/');
  const newCookieValue = callbackRes.headers.getSetCookie().find((c) => c.startsWith('dbc_sid=')).split(';')[0];
  console.log('callback成功，302導回首頁，取得新session cookie');

  console.log('\n--- 步驟3：直接查詢本機D1，確認users/sessions各新增1筆 ---');
  const usersAfter = countRows(conn, 'users');
  const sessionsAfter = countRows(conn, 'sessions');
  console.log(`callback後： users=${usersAfter}, sessions=${sessionsAfter}`);
  assert.strictEqual(usersAfter, 1);
  assert.strictEqual(sessionsAfter, 1);

  const userRow = conn.prepare("SELECT * FROM users WHERE auth_provider = 'google' AND auth_provider_id = 'g-real-d1-verify-task1.33'").get();
  assert.ok(userRow, '應該找到剛建立的provider user');
  assert.strictEqual(userRow.is_guest, 0);
  assert.strictEqual(userRow.status, 'active');
  assert.strictEqual(userRow.display_name, 'Real D1 Verify User');
  console.log('user資料確認：auth_provider=google, auth_provider_id=g-real-d1-verify-task1.33, is_guest=0, status=active');

  const sessionRow = conn.prepare('SELECT * FROM sessions WHERE user_id = ?').get(userRow.id);
  assert.ok(sessionRow, '應該找到剛建立的session');
  assert.strictEqual(sessionRow.revoked_at, null, 'session應該是active');
  console.log('session資料確認：user_id=' + userRow.id + '，revoked_at=null（active）');

  console.log('\n--- 步驟4：確認D1資料列裡完全沒有access_token/id_token（token不落地） ---');
  const userRowSerialized = JSON.stringify(userRow);
  const sessionRowSerialized = JSON.stringify(sessionRow);
  assert.ok(userRowSerialized.indexOf('FAKE_ACCESS_TOKEN') < 0);
  assert.ok(userRowSerialized.indexOf('FAKE_ID_TOKEN') < 0);
  assert.ok(sessionRowSerialized.indexOf('FAKE_ACCESS_TOKEN') < 0);
  assert.ok(sessionRowSerialized.indexOf('FAKE_ID_TOKEN') < 0);
  console.log('確認：users/sessions資料列裡完全沒有token相關值');

  console.log('\n--- 步驟5：用新cookie呼叫/auth/me確認可用 ---');
  const meRes = await worker.fetch(new Request('https://example.com/auth/me', { headers: { Cookie: newCookieValue } }), env, {});
  assert.strictEqual(meRes.status, 200);
  const meBody = await meRes.json();
  assert.strictEqual(meBody.data.user.auth_provider, 'google');
  console.log('新cookie可以正確驗證身份（/auth/me回200，auth_provider=google）');

  console.log('\n=== 清理測試資料 ===');
  conn.prepare('DELETE FROM sessions WHERE user_id = ?').run(userRow.id);
  conn.prepare('DELETE FROM users WHERE id = ?').run(userRow.id);

  const usersFinal = countRows(conn, 'users');
  const sessionsFinal = countRows(conn, 'sessions');
  console.log(`清理後： users=${usersFinal}, sessions=${sessionsFinal}`);
  assert.strictEqual(usersFinal, 0, '清理後 users 應回到 0');
  assert.strictEqual(sessionsFinal, 0, '清理後 sessions 應回到 0');

  conn.close();

  console.log('\n✅✅✅ 真實 Local D1 端對端驗證全數通過（Google OAuth callback：state驗證、mock exchangeCode/getUserProfile、provider mapping、新user+session建立正確、token完全不落地），測試資料已清理乾淨。');
}

main().catch((e) => {
  console.error('❌ 驗證失敗:', e);
  process.exitCode = 1;
});

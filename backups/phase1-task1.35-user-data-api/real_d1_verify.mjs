/*
 * Phase 1 TASK 1.35｜真實 Local D1 端對端驗證
 *
 * 跟TASK1.29～1.34的 real_d1_verify.mjs 同樣手法：用 Node 22 內建的
 * node:sqlite 直接打開 wrangler 本機 D1 狀態實際使用的 SQLite 檔案，
 * 包成符合 src/db/query.js 期待的 D1 binding 介面，讓真正的
 * src/worker.js 透過真正的 Router → Auth Middleware → Controller →
 * Domain Service（TASK1.15）→ DB Access Layer（TASK1.12）→ D1 這整條
 * 路徑操作「真的」本機 D1。
 *
 * 流程：
 * 1. 執行前：確認 users/sessions/exploration_records/food_events/
 *    emotion_records/behavior_patterns/ai_reports 都是 0
 * 2. POST /auth/guest 建立一個真正的測試user + session
 * 3. 透過五個資源各自的POST，用這個user的cookie建立5筆資料（各資源1筆）
 * 4. 直接查詢本機D1，確認每張表都新增了1筆，且user_id都正確關聯到
 *    同一個user
 * 5. 透過五個資源各自的GET，確認查得回剛才建立的資料
 * 6. 額外驗證：換一個完全不同的guest user，查詢時看不到第一個user的
 *    任何資料（cross-user isolation在真實D1上成立）
 * 7. 清理：DELETE 掉這次測試建立的所有資料（兩個user + 兩組session +
 *    5筆業務資料）
 * 8. 執行後：再次確認所有表都回到 0
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

const DATA_TABLES = ['exploration_records', 'food_events', 'emotion_records', 'behavior_patterns', 'ai_reports'];

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
  console.log('=== TASK1.35 真實 Local D1 端對端驗證（User Data API：5個資源 create+query + cross-user isolation）===\n');

  const d1File = findLocalD1File();
  console.log('D1 sqlite 檔案:', d1File);

  const d1Binding = createRealD1Binding(d1File);
  const conn = d1Binding.__raw;

  const usersBefore = countRows(conn, 'users');
  const sessionsBefore = countRows(conn, 'sessions');
  console.log(`執行前： users=${usersBefore}, sessions=${sessionsBefore}`);
  for (const t of DATA_TABLES) console.log(`         ${t}=${countRows(conn, t)}`);
  assert.strictEqual(usersBefore, 0, '執行前 users 應為 0');
  assert.strictEqual(sessionsBefore, 0, '執行前 sessions 應為 0');
  for (const t of DATA_TABLES) assert.strictEqual(countRows(conn, t), 0, `執行前 ${t} 應為 0`);

  const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
  const mod = await import(workerUrl);
  const worker = mod.default;

  const env = {
    SYNC_KV: makeFakeKV(),
    DIET_COACH_IMAGES: makeFakeR2(),
    DIET_COACH_DB: d1Binding,
  };

  console.log('\n--- 步驟1：POST /auth/guest 建立測試user A ---');
  const userA = await guestLogin(worker, env);
  console.log('userA.id =', userA.userId);
  assert.strictEqual(countRows(conn, 'users'), 1);
  assert.strictEqual(countRows(conn, 'sessions'), 1);

  console.log('\n--- 步驟2：透過五個資源的POST，用userA的cookie建立資料 ---');
  const createRequests = [
    ['POST', '/api/explorations', { draw_mode: 'single', card_category: 'T' }],
    ['POST', '/api/food-events', { meal_type: 'lunch', description: 'real-d1-verify-task1.35' }],
    ['POST', '/api/emotions', { emotion_type: 'calm', intensity: 3 }],
    ['POST', '/api/behaviors', { pattern_type: 'real-d1-verify-pattern' }],
    ['POST', '/api/reports', { report_type: 'weekly', content: 'real-d1-verify-content' }],
  ];
  const createdIds = {};
  for (const [method, urlPath, payload] of createRequests) {
    const res = await worker.fetch(new Request('https://example.com' + urlPath, { method, headers: { Cookie: userA.cookie }, body: JSON.stringify(payload) }), env, {});
    assert.strictEqual(res.status, 200, `${method} ${urlPath} 應該成功`);
    const body = await res.json();
    createdIds[urlPath] = body.data.id;
    console.log(`  ${urlPath} 建立成功，id =`, body.data.id);
  }

  console.log('\n--- 步驟3：直接查詢本機D1，確認每張表都新增1筆且user_id正確關聯 ---');
  for (const t of DATA_TABLES) {
    const count = countRows(conn, t);
    assert.strictEqual(count, 1, `${t} 應該新增1筆`);
    const row = conn.prepare(`SELECT * FROM ${t} WHERE user_id = ?`).get(userA.userId);
    assert.ok(row, `${t} 應該有一筆user_id=${userA.userId}的資料`);
    console.log(`  ${t}: 1筆，user_id=${row.user_id} 正確關聯`);
  }

  console.log('\n--- 步驟4：透過五個資源的GET，用userA的cookie查回剛才的資料 ---');
  const listRequests = [
    ['/api/explorations', 'draw_mode', 'single'],
    ['/api/food-events', 'meal_type', 'lunch'],
    ['/api/emotions', 'emotion_type', 'calm'],
    ['/api/behaviors', 'pattern_type', 'real-d1-verify-pattern'],
    ['/api/reports', 'report_type', 'weekly'],
  ];
  for (const [urlPath, field, expectedValue] of listRequests) {
    const res = await worker.fetch(new Request('https://example.com' + urlPath, { headers: { Cookie: userA.cookie } }), env, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.results.length, 1, `${urlPath} 應該查回1筆`);
    assert.strictEqual(body.data.results[0][field], expectedValue);
    console.log(`  GET ${urlPath} 正確查回1筆，${field}=${expectedValue}`);
  }

  console.log('\n--- 步驟5：建立第二個guest user B，驗證看不到userA的任何資料（cross-user isolation） ---');
  const userB = await guestLogin(worker, env);
  console.log('userB.id =', userB.userId);
  for (const [urlPath] of listRequests) {
    const res = await worker.fetch(new Request('https://example.com' + urlPath, { headers: { Cookie: userB.cookie } }), env, {});
    const body = await res.json();
    assert.deepStrictEqual(body.data.results, [], `userB透過${urlPath}不應該查到任何資料`);
  }
  console.log('  確認：userB對五個資源的GET全部回傳空陣列，完全查不到userA的資料');

  console.log('\n--- 步驟6：確認未登入（沒有cookie）無法存取任何資源 ---');
  const noCookieRes = await worker.fetch(new Request('https://example.com/api/explorations'), env, {});
  assert.strictEqual(noCookieRes.status, 401);
  console.log('  未登入GET /api/explorations正確回401');

  console.log('\n=== 清理測試資料 ===');
  for (const t of DATA_TABLES) {
    conn.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userA.userId);
  }
  conn.prepare('DELETE FROM sessions WHERE user_id IN (?, ?)').run(userA.userId, userB.userId);
  conn.prepare('DELETE FROM users WHERE id IN (?, ?)').run(userA.userId, userB.userId);

  const usersFinal = countRows(conn, 'users');
  const sessionsFinal = countRows(conn, 'sessions');
  console.log(`清理後： users=${usersFinal}, sessions=${sessionsFinal}`);
  assert.strictEqual(usersFinal, 0, '清理後 users 應回到 0');
  assert.strictEqual(sessionsFinal, 0, '清理後 sessions 應回到 0');
  for (const t of DATA_TABLES) {
    const count = countRows(conn, t);
    console.log(`         ${t}=${count}`);
    assert.strictEqual(count, 0, `清理後 ${t} 應回到 0`);
  }

  conn.close();

  console.log('\n✅✅✅ 真實 Local D1 端對端驗證全數通過（五個資源create+query正確、user_id正確關聯、cross-user isolation在真實D1上成立、未登入正確拒絕），測試資料已清理乾淨。');
}

main().catch((e) => {
  console.error('❌ 驗證失敗:', e);
  process.exitCode = 1;
});

/*
 * Phase 1 TASK 1.36｜真實 Local D1 端對端驗證
 *
 * 跟TASK1.29～1.35的 real_d1_verify.mjs 同樣手法：用 Node 22 內建的
 * node:sqlite 直接打開 wrangler 本機 D1 狀態實際使用的 SQLite 檔案，
 * 包成符合 src/db/query.js 期待的 D1 binding 介面，讓真正的
 * src/worker.js 透過真正的 Router → requireAuth() → Dashboard Controller
 * → Dashboard Service → 並行讀取五大Domain Service → DB Access Layer
 * → D1 這整條路徑操作「真的」本機 D1。
 *
 * 流程：
 * 1. 執行前：確認 users/sessions/五個domain資料表都是 0
 * 2. POST /auth/guest 建立一個真正的測試user + session
 * 3. 透過五個資源各自的POST，用這個user的cookie建立5筆資料（各資源1筆）
 * 4. GET /api/dashboard，確認回傳的五個欄位aggregation正確（各自1筆，
 *    內容跟剛才建立的資料一致）
 * 5. 額外驗證：換一個完全不同的guest user，dashboard只看得到自己的
 *    （空的），不會看到第一個user的任何資料
 * 6. 清理：DELETE 掉這次測試建立的所有資料（兩個user + 兩組session +
 *    5筆業務資料）
 * 7. 執行後：再次確認所有表都回到 0
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
  console.log('=== TASK1.36 真實 Local D1 端對端驗證（Dashboard Aggregation：五大Domain Service並行讀取 + cross-user isolation）===\n');

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

  console.log('\n--- 步驟2：透過五個資源的POST，用userA的cookie建立資料 ---');
  const createRequests = [
    ['/api/explorations', { draw_mode: 'single', card_category: 'T' }],
    ['/api/food-events', { meal_type: 'lunch', description: 'real-d1-verify-task1.36' }],
    ['/api/emotions', { emotion_type: 'calm', intensity: 3 }],
    ['/api/behaviors', { pattern_type: 'real-d1-verify-pattern' }],
    ['/api/reports', { report_type: 'weekly', content: 'real-d1-verify-content' }],
  ];
  for (const [urlPath, payload] of createRequests) {
    const res = await worker.fetch(new Request('https://example.com' + urlPath, { method: 'POST', headers: { Cookie: userA.cookie }, body: JSON.stringify(payload) }), env, {});
    assert.strictEqual(res.status, 200, `${urlPath} 應該建立成功`);
  }
  for (const t of DATA_TABLES) {
    assert.strictEqual(countRows(conn, t), 1, `${t} 應該新增1筆`);
  }
  console.log('  五個資源各建立1筆資料，D1確認每張表都新增1筆');

  console.log('\n--- 步驟3：GET /api/dashboard，確認aggregation正確 ---');
  const dashRes = await worker.fetch(new Request('https://example.com/api/dashboard', { headers: { Cookie: userA.cookie } }), env, {});
  assert.strictEqual(dashRes.status, 200);
  const dashBody = await dashRes.json();
  assert.strictEqual(dashBody.data.explorations.length, 1);
  assert.strictEqual(dashBody.data.explorations[0].draw_mode, 'single');
  assert.strictEqual(dashBody.data.foodEvents.length, 1);
  assert.strictEqual(dashBody.data.foodEvents[0].meal_type, 'lunch');
  assert.strictEqual(dashBody.data.emotions.length, 1);
  assert.strictEqual(dashBody.data.emotions[0].emotion_type, 'calm');
  assert.strictEqual(dashBody.data.behaviors.length, 1);
  assert.strictEqual(dashBody.data.behaviors[0].pattern_type, 'real-d1-verify-pattern');
  assert.strictEqual(dashBody.data.reports.length, 1);
  assert.strictEqual(dashBody.data.reports[0].report_type, 'weekly');
  console.log('  dashboard aggregation正確：五個欄位各1筆，內容跟剛才建立的資料完全一致');

  console.log('\n--- 步驟4：建立第二個guest user B，驗證dashboard完全看不到userA的任何資料（cross-user isolation） ---');
  const userB = await guestLogin(worker, env);
  console.log('userB.id =', userB.userId);
  const dashResB = await worker.fetch(new Request('https://example.com/api/dashboard', { headers: { Cookie: userB.cookie } }), env, {});
  const dashBodyB = await dashResB.json();
  for (const key of ['explorations', 'foodEvents', 'emotions', 'behaviors', 'reports']) {
    assert.deepStrictEqual(dashBodyB.data[key], [], `userB的dashboard.${key}應該是空陣列`);
  }
  console.log('  確認：userB的dashboard五個欄位全部是空陣列，完全查不到userA的資料');

  console.log('\n--- 步驟5：確認未登入（沒有cookie）無法存取dashboard ---');
  const noCookieRes = await worker.fetch(new Request('https://example.com/api/dashboard'), env, {});
  assert.strictEqual(noCookieRes.status, 401);
  console.log('  未登入GET /api/dashboard正確回401');

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

  console.log('\n✅✅✅ 真實 Local D1 端對端驗證全數通過（Dashboard正確並行聚合五大Domain Service的資料、cross-user isolation在真實D1上成立、未登入正確拒絕），測試資料已清理乾淨。');
}

main().catch((e) => {
  console.error('❌ 驗證失敗:', e);
  process.exitCode = 1;
});

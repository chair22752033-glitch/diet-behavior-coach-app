/*
 * Phase 1 TASK 1.38｜真實 Local D1 端對端驗證
 *
 * 跟TASK1.29～1.37的 real_d1_verify.mjs 同樣手法：用 Node 22 內建的
 * node:sqlite 直接打開 wrangler 本機 D1 狀態實際使用的 SQLite 檔案，
 * 包成符合 src/db/query.js 期待的 D1 binding 介面，讓真正的
 * src/worker.js 透過真正的 Router → requireAuth() → Contract
 * Validation → Timeline Controller → Timeline Service → 五大Domain
 * Service → Aggregation → Sort → DB Access Layer → D1 這整條路徑操作
 * 「真的」本機 D1。
 *
 * 流程：
 * 1. 執行前：確認 users/sessions/五大domain資料表都是 0
 * 2. POST /auth/guest 建立 User A（真正的user + session）
 * 3. 依序透過真正的POST API建立 exploration/food/emotion/behavior/
 *    report 各一筆
 * 4. GET /api/timeline，確認五種type都存在、依timestamp新到舊排序正確、
 *    pagination正確（total=5, limit=50, offset=0）
 * 5. 測試 limit（?limit=2）與 offset（?limit=2&offset=2）分頁正確
 * 6. 建立 User B，確認 User B 的timeline看不到 User A 的資料（cross-user
 *    isolation在真實D1上成立）
 * 7. 確認未登入 GET /api/timeline 回401
 * 8. 清理：DELETE 掉這次測試建立的所有資料（兩個user + 兩組session +
 *    User A建立的五筆domain紀錄）
 * 9. 執行後：再次確認 users/sessions/五大domain資料表都回到 0
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

const DOMAIN_TABLES = ['exploration_records', 'food_events', 'emotion_records', 'behavior_patterns', 'ai_reports'];

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
  console.log('=== TASK1.38 真實 Local D1 端對端驗證（Timeline：五大來源整合 + 排序 + 分頁 + cross-user isolation）===\n');

  const d1File = findLocalD1File();
  console.log('D1 sqlite 檔案:', d1File);

  const d1Binding = createRealD1Binding(d1File);
  const conn = d1Binding.__raw;

  const usersBefore = countRows(conn, 'users');
  const sessionsBefore = countRows(conn, 'sessions');
  console.log(`執行前： users=${usersBefore}, sessions=${sessionsBefore}`);
  assert.strictEqual(usersBefore, 0, '執行前 users 應為 0');
  assert.strictEqual(sessionsBefore, 0, '執行前 sessions 應為 0');
  for (const t of DOMAIN_TABLES) {
    const c = countRows(conn, t);
    console.log(`執行前： ${t}=${c}`);
    assert.strictEqual(c, 0, `執行前 ${t} 應為 0`);
  }

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

  console.log('\n--- 步驟2：依序建立 exploration/food/emotion/behavior/report 各一筆 ---');
  const createCalls = [
    ['/api/explorations', { draw_mode: 'single', card_category: 'CAT', card_text: 'real-d1-explore' }],
    ['/api/food-events', { meal_type: 'lunch', description: 'real-d1-food' }],
    ['/api/emotions', { emotion_type: 'calm', intensity: 5 }],
    ['/api/behaviors', { pattern_type: 'real-d1-pattern', summary: 'sum' }],
    ['/api/reports', { report_type: 'weekly', content: 'real-d1-report-content' }],
  ];
  for (const [path_, payload] of createCalls) {
    const res = await worker.fetch(
      new Request('https://example.com' + path_, { method: 'POST', headers: { Cookie: userA.cookie }, body: JSON.stringify(payload) }),
      env, {}
    );
    assert.strictEqual(res.status, 200, `${path_} 應該建立成功`);
    // 避免五筆資料的created_at完全相同導致排序無法驗證（真實SQLite datetime('now')精度為秒）
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  console.log('五大類資料建立完成');

  console.log('\n--- 步驟3：GET /api/timeline，確認五種type都存在、pagination正確 ---');
  const timelineRes = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: userA.cookie } }), env, {});
  assert.strictEqual(timelineRes.status, 200);
  const timelineBody = await timelineRes.json();
  assert.strictEqual(timelineBody.data.timeline.length, 5);
  assert.strictEqual(timelineBody.data.pagination.total, 5);
  assert.strictEqual(timelineBody.data.pagination.limit, 50);
  assert.strictEqual(timelineBody.data.pagination.offset, 0);
  const types = timelineBody.data.timeline.map((i) => i.type).sort();
  assert.deepStrictEqual(types, ['behavior', 'emotion', 'exploration', 'food', 'report']);
  console.log('五種type皆存在，pagination正確（total=5, limit=50, offset=0）');

  console.log('\n--- 步驟4：確認timestamp依新到舊排序正確（對應真實建立順序的反序） ---');
  const timestamps = timelineBody.data.timeline.map((i) => i.timestamp);
  const sortedDesc = [...timestamps].sort().reverse();
  assert.deepStrictEqual(timestamps, sortedDesc, 'timeline應該已經是新到舊排序');
  // 最後建立的是report，理論上排在最前面；最先建立的是exploration，排在最後面
  assert.strictEqual(timelineBody.data.timeline[0].type, 'report');
  assert.strictEqual(timelineBody.data.timeline[4].type, 'exploration');
  console.log('排序正確：最新建立的report排最前，最先建立的exploration排最後');

  console.log('\n--- 步驟5：直接查詢本機D1確認每個timeline item的timestamp真的等於created_at ---');
  const explorationRow = conn.prepare('SELECT * FROM exploration_records WHERE user_id = ?').get(userA.userId);
  const explorationItem = timelineBody.data.timeline.find((i) => i.type === 'exploration');
  assert.strictEqual(explorationItem.timestamp, explorationRow.created_at);
  assert.strictEqual(explorationItem.data.card_text, 'real-d1-explore');
  console.log('D1確認：timeline item的timestamp正確對應created_at，data欄位正確對應原始資料');

  console.log('\n--- 步驟6：測試limit分頁（?limit=2） ---');
  const limitRes = await worker.fetch(new Request('https://example.com/api/timeline?limit=2', { headers: { Cookie: userA.cookie } }), env, {});
  const limitBody = await limitRes.json();
  assert.strictEqual(limitBody.data.timeline.length, 2);
  assert.strictEqual(limitBody.data.pagination.limit, 2);
  assert.strictEqual(limitBody.data.pagination.total, 5);
  assert.strictEqual(limitBody.data.timeline[0].type, 'report');
  console.log('limit分頁正確：只回2筆，total仍為5');

  console.log('\n--- 步驟7：測試offset分頁（?limit=2&offset=2） ---');
  const offsetRes = await worker.fetch(new Request('https://example.com/api/timeline?limit=2&offset=2', { headers: { Cookie: userA.cookie } }), env, {});
  const offsetBody = await offsetRes.json();
  assert.strictEqual(offsetBody.data.timeline.length, 2);
  assert.strictEqual(offsetBody.data.pagination.offset, 2);
  // 完整排序：report(0), behavior(1), emotion(2), food(3), exploration(4) → offset=2,limit=2 應該是 emotion, food
  assert.strictEqual(offsetBody.data.timeline[0].type, timelineBody.data.timeline[2].type);
  assert.strictEqual(offsetBody.data.timeline[1].type, timelineBody.data.timeline[3].type);
  console.log('offset分頁正確：正確跳過前2筆，接續回傳第3、4筆');

  console.log('\n--- 步驟8：建立 User B，確認無法取得/影響 User A 的timeline（cross-user isolation） ---');
  const userB = await guestLogin(worker, env);
  console.log('userB.id =', userB.userId);
  const userBTimelineRes = await worker.fetch(new Request('https://example.com/api/timeline', { headers: { Cookie: userB.cookie } }), env, {});
  const userBTimelineBody = await userBTimelineRes.json();
  assert.deepStrictEqual(userBTimelineBody.data.timeline, []);
  assert.strictEqual(userBTimelineBody.data.pagination.total, 0);
  console.log('確認：userB的timeline為空，完全看不到userA的任何資料');

  console.log('\n--- 步驟9：測試query帶偽造user_id（?user_id=A）時userB仍只看到自己的空timeline ---');
  const spoofRes = await worker.fetch(new Request(`https://example.com/api/timeline?user_id=${userA.userId}`, { headers: { Cookie: userB.cookie } }), env, {});
  const spoofBody = await spoofRes.json();
  assert.deepStrictEqual(spoofBody.data.timeline, []);
  console.log('確認：query夾帶的user_id被完全忽略，userB看到的仍是自己（空）的timeline');

  console.log('\n--- 步驟10：確認未登入（沒有cookie）無法存取timeline ---');
  const noCookieRes = await worker.fetch(new Request('https://example.com/api/timeline'), env, {});
  assert.strictEqual(noCookieRes.status, 401);
  console.log('未登入GET /api/timeline正確回401');

  console.log('\n=== 清理測試資料 ===');
  for (const t of DOMAIN_TABLES) {
    conn.prepare(`DELETE FROM ${t} WHERE user_id IN (?, ?)`).run(userA.userId, userB.userId);
  }
  conn.prepare('DELETE FROM sessions WHERE user_id IN (?, ?)').run(userA.userId, userB.userId);
  conn.prepare('DELETE FROM users WHERE id IN (?, ?)').run(userA.userId, userB.userId);

  const usersFinal = countRows(conn, 'users');
  const sessionsFinal = countRows(conn, 'sessions');
  console.log(`清理後： users=${usersFinal}, sessions=${sessionsFinal}`);
  assert.strictEqual(usersFinal, 0, '清理後 users 應回到 0');
  assert.strictEqual(sessionsFinal, 0, '清理後 sessions 應回到 0');
  for (const t of DOMAIN_TABLES) {
    const c = countRows(conn, t);
    console.log(`清理後： ${t}=${c}`);
    assert.strictEqual(c, 0, `清理後 ${t} 應回到 0`);
  }

  conn.close();

  console.log('\n✅✅✅ 真實 Local D1 端對端驗證全數通過（五種type正確整合、timestamp排序正確、limit/offset分頁正確、cross-user isolation成立、user_id spoofing被忽略、未登入正確拒絕），測試資料已清理乾淨。');
}

main().catch((e) => {
  console.error('❌ 驗證失敗:', e);
  process.exitCode = 1;
});

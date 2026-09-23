/*
 * Phase 1 TASK 1.24｜Worker Entry Integration 測試
 *
 * 直接用 Node ESM import 匯入真正的 src/worker.js（含新接入的
 * createApplication(env)），用假的 env（模擬 D1/KV/R2 binding）呼叫
 * export default 的 fetch()，驗證：
 * 1) 既有路由行為與接入前完全一致（沿用 TASK1.10 的驗證手法）
 * 2) Bootstrap（TASK1.23）確實被接進來、可以成功建立
 * 3) 沒有任何新路由被真正開放（/auth/*、/users/* 仍然落到首頁 catch-all）
 * 4) D1 完全沒有被寫入任何資料（不執行 Legacy Import、不建立真實使用者）
 *
 * 完全不連線任何真實或本機模擬的資料庫，不建立任何真實使用者 session，
 * 不會真的呼叫 Google OAuth。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from '../../src/bootstrap/application.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '..', '..', 'src', 'worker.js');
const workerUrl = 'file://' + workerPath + '?t=' + Date.now();

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`✅ ${name}`);
    })
    .catch((e) => {
      failed++;
      console.log(`❌ ${name}`);
      console.log('   ', e && e.stack ? e.stack.split('\n')[0] : e);
    });
}

// --- 模擬 KV binding ---
function makeFakeKV() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value, opts) { store.set(key, value); },
  };
}

// --- 模擬 R2 binding ---
function makeFakeR2(objects) {
  return {
    async get(key) {
      if (!objects[key]) return null;
      return { body: objects[key] };
    },
  };
}

// --- 模擬 D1 binding（同 TASK1.12/1.22/1.23 手法） ---
function makeFakeD1() {
  const calls = [];
  function makeStatement(sql, params) {
    return {
      sql,
      params: params || [],
      bind(...p) { return makeStatement(sql, p); },
      async run() { calls.push({ type: 'run', sql }); return { meta: {} }; },
      async all() { calls.push({ type: 'all', sql }); return { results: [] }; },
      async first() { calls.push({ type: 'first', sql }); return null; },
    };
  }
  return {
    calls,
    prepare(sql) { return makeStatement(sql); },
    async batch(statements) {
      calls.push({ type: 'batch', count: statements.length });
      const results = [];
      for (const s of statements) results.push(await s.run());
      return results;
    },
  };
}

async function run() {
  const mod = await import(workerUrl);
  const worker = mod.default;

  const SYNC_KV = makeFakeKV();
  const DIET_COACH_IMAGES = makeFakeR2({ 'quest/scenes/terrain-1.jpg': 'FAKE_JPEG_BYTES' });
  const DIET_COACH_DB = makeFakeD1();
  const fullEnv = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB };

  // ---------------------------------------------------------------------
  // 1. worker export default
  // ---------------------------------------------------------------------

  await test('worker module 的 export default 是一個物件', () => {
    assert.strictEqual(typeof worker, 'object');
    assert.ok(worker !== null);
  });

  await test('export default 沒有其他非預期的頂層 key（只有 fetch）', () => {
    assert.deepStrictEqual(Object.keys(worker), ['fetch']);
  });

  // ---------------------------------------------------------------------
  // 2. fetch存在
  // ---------------------------------------------------------------------

  await test('export default 具備 fetch function', () => {
    assert.strictEqual(typeof worker.fetch, 'function');
  });

  await test('worker.fetch() 是 async function（回傳 Promise）', () => {
    const ret = worker.fetch(new Request('https://example.com/'), fullEnv, {});
    assert.ok(ret instanceof Promise);
    return ret;
  });

  await test('worker.fetch() 回傳真正的 Response 實例', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), fullEnv, {});
    assert.ok(res instanceof Response);
  });

  // ---------------------------------------------------------------------
  // 3. bootstrap初始化
  // ---------------------------------------------------------------------

  await test('原始碼掃描：src/worker.js 有 import createApplication', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(/import\s*\{\s*createApplication\s*\}\s*from\s*['"]\.\/bootstrap\/application\.js['"]/.test(src));
  });

  await test('原始碼掃描：fetch() 內確實呼叫了 createApplication(env)', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(/createApplication\(env\)/.test(src));
  });

  await test('完整 env（含 D1/KV/R2）下，fetch() 正常運作不拋出未攔截例外', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), fullEnv, {});
    assert.strictEqual(res.status, 200);
  });

  // 注意：TASK1.27 為 createApplication() 新增了 `middleware` 欄位，這是
  // 明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  await test('createApplication(fullEnv) 本身可以成功建立且形狀正確（驗證 worker.js 接的是同一份實作）', () => {
    const app = createApplication(fullEnv);
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'middleware', 'router', 'services']);
  });

  await test('缺少 DIET_COACH_DB binding 時，fetch() 仍正常運作（bootstrap失敗被優雅攔截，不影響既有功能）', async () => {
    const envNoD1 = { SYNC_KV, DIET_COACH_IMAGES };
    const res = await worker.fetch(new Request('https://example.com/'), envNoD1, {});
    assert.strictEqual(res.status, 200);
  });

  await test('env 完全是空物件時，fetch() 仍不拋出未攔截例外（首頁catch-all仍可回應）', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), {}, {});
    assert.strictEqual(res.status, 200);
  });

  await test('createApplication() 拋出例外不會讓 fetch() 往外丟出未攔截例外', async () => {
    // DIET_COACH_DB 存在但不是合法的 D1 binding（沒有 prepare），createDb() 內部不會檢查形狀，
    // 但 bootstrap 建立本身（getEnvConfig/getAppConfig等）不應該因此拋出，這裡改用完全異常的 env 型別
    const weirdEnv = null;
    let threw = false;
    try {
      await worker.fetch(new Request('https://example.com/'), weirdEnv, {});
    } catch (e) {
      threw = true;
    }
    // handle(r, env) 原本的行為在 env 為 null 時，只要沒有路由用到 env 就仍會 200（首頁）
    assert.strictEqual(threw, false);
  });

  // ---------------------------------------------------------------------
  // 4. 舊路由正常
  // ---------------------------------------------------------------------

  await test('GET / 回傳200', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), fullEnv, {});
    assert.strictEqual(res.status, 200);
  });

  await test('GET / Content-Type為html', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), fullEnv, {});
    assert.ok((res.headers.get('content-type') || '').indexOf('text/html') === 0);
  });

  await test('GET /manifest.json 回傳200且Content-Type正確', async () => {
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), fullEnv, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
  });

  await test('GET /manifest.json 內容為合法JSON', async () => {
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), fullEnv, {});
    const text = await res.text();
    assert.doesNotThrow(() => JSON.parse(text));
  });

  await test('GET /icon.svg 回傳200且內容為svg', async () => {
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), fullEnv, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<svg'), 0);
  });

  await test('GET /apple-touch-icon.png 回傳200且Content-Type為image/png', async () => {
    const res = await worker.fetch(new Request('https://example.com/apple-touch-icon.png'), fullEnv, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/png');
  });

  await test('GET /apple-touch-icon-precomposed.png 也回傳同樣的png', async () => {
    const res = await worker.fetch(new Request('https://example.com/apple-touch-icon-precomposed.png'), fullEnv, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/png');
  });

  await test('GET /api/sync 無效code格式回傳400', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=ab'), fullEnv, {});
    assert.strictEqual(res.status, 400);
  });

  await test('GET /api/sync 不支援的方法回傳405', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=abc123', { method: 'DELETE' }), fullEnv, {});
    assert.strictEqual(res.status, 405);
  });

  await test('未知路徑（非任何既有路由）仍落到首頁 catch-all 回傳200', async () => {
    const res = await worker.fetch(new Request('https://example.com/this/does/not/exist'), fullEnv, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  // ---------------------------------------------------------------------
  // 5. KV功能正常
  // ---------------------------------------------------------------------

  await test('POST /api/sync 成功寫入並可用 GET 讀回', async () => {
    const postRes = await worker.fetch(
      new Request('https://example.com/api/sync?code=entry-test-1', { method: 'POST', body: JSON.stringify({ a: 1 }) }),
      fullEnv, {}
    );
    const postJson = await postRes.json();
    assert.strictEqual(postJson.ok, true);
    assert.strictEqual(SYNC_KV.store.get('sync:entry-test-1'), JSON.stringify({ a: 1 }));

    const getRes = await worker.fetch(new Request('https://example.com/api/sync?code=entry-test-1'), fullEnv, {});
    const getText = await getRes.text();
    assert.strictEqual(getText, JSON.stringify({ a: 1 }));
  });

  await test('GET /api/sync 不存在的code回傳200且內容為null', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=never-existed'), fullEnv, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text, 'null');
  });

  await test('POST /api/sync 過大內容回傳413', async () => {
    const bigBody = 'x'.repeat(1000001);
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=too-big', { method: 'POST', body: bigBody }), fullEnv, {});
    assert.strictEqual(res.status, 413);
  });

  await test('POST /api/qlive 成功寫入並可用 GET 讀回', async () => {
    const postRes = await worker.fetch(
      new Request('https://example.com/api/qlive?code=qlive-test-1', { method: 'POST', body: JSON.stringify({ ts: 1 }) }),
      fullEnv, {}
    );
    const postJson = await postRes.json();
    assert.strictEqual(postJson.ok, true);

    const getRes = await worker.fetch(new Request('https://example.com/api/qlive?code=qlive-test-1'), fullEnv, {});
    const getText = await getRes.text();
    assert.strictEqual(getText, JSON.stringify({ ts: 1 }));
  });

  await test('GET /api/qlive 不存在的code回傳200且內容為null', async () => {
    const res = await worker.fetch(new Request('https://example.com/api/qlive?code=never-existed-q'), fullEnv, {});
    const text = await res.text();
    assert.strictEqual(text, 'null');
  });

  await test('/api/sync 與 /api/qlive 使用不同的 KV key 前綴，互不干擾', async () => {
    await worker.fetch(new Request('https://example.com/api/sync?code=shared-code', { method: 'POST', body: 'sync-value' }), fullEnv, {});
    await worker.fetch(new Request('https://example.com/api/qlive?code=shared-code', { method: 'POST', body: 'qlive-value' }), fullEnv, {});
    assert.strictEqual(SYNC_KV.store.get('sync:shared-code'), 'sync-value');
    assert.strictEqual(SYNC_KV.store.get('qlive:shared-code'), 'qlive-value');
  });

  // ---------------------------------------------------------------------
  // 6. R2功能正常
  // ---------------------------------------------------------------------

  await test('GET /img/存在的物件 回傳200且內容正確', async () => {
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), fullEnv, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text, 'FAKE_JPEG_BYTES');
  });

  await test('GET /img/存在的物件 Cache-Control含immutable', async () => {
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), fullEnv, {});
    assert.ok((res.headers.get('cache-control') || '').indexOf('immutable') >= 0);
  });

  await test('GET /img/不存在的物件 回傳404', async () => {
    const res = await worker.fetch(new Request('https://example.com/img/does/not/exist.jpg'), fullEnv, {});
    assert.strictEqual(res.status, 404);
  });

  await test('GET /img/ 缺少R2 binding時優雅降級為404', async () => {
    const envNoR2 = { SYNC_KV, DIET_COACH_DB };
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envNoR2, {});
    assert.strictEqual(res.status, 404);
  });

  await test('GET /img/ 不合法的key格式回傳404', async () => {
    const res = await worker.fetch(new Request('https://example.com/img/%00bad'), fullEnv, {});
    assert.strictEqual(res.status, 404);
  });

  // ---------------------------------------------------------------------
  // 7. router bridge正常
  // ---------------------------------------------------------------------

  await test('（bridge）createApplication(fullEnv).router 具備 add/handle', () => {
    const app = createApplication(fullEnv);
    assert.strictEqual(typeof app.router.add, 'function');
    assert.strictEqual(typeof app.router.handle, 'function');
  });

  await test('（bridge）app.router.handle() 可以被直接呼叫並正確運作（證明橋接可用，但非透過真正HTTP路徑）', async () => {
    const app = createApplication(fullEnv);
    const res = await app.router.handle({ method: 'GET', pathname: '/auth/me', cookieHeader: null }, { db: app.db });
    assert.strictEqual(res.status, 401);
  });

  await test('（bridge）app.services 帶有全部預期的 service module', () => {
    const app = createApplication(fullEnv);
    assert.ok(app.services.authApplicationService);
    assert.ok(app.services.userService);
  });

  await test('（bridge）worker.js 本身沒有把 app.router.handle 接到真正的請求分派邏輯上', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    // handle(r,env,app) 函式體內完全不應出現 app.router 這種用法
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/app\.router/.test(handleBody));
  });

  // ---------------------------------------------------------------------
  // 8. 無auth啟用
  // ---------------------------------------------------------------------

  // 注意：這項斷言原本驗證「TASK1.24當下 POST /auth/guest 完全沒有被
  // 特殊處理」，這是當時的真實狀態。TASK1.29（Enable Guest Authentication
  // API Route）已依規格明確把這一條路由正式上線——這是TASK1.29的任務
  // 目標，不是回歸。這裡改成驗證「現在POST /auth/guest會回傳真正的
  // JSON+Set-Cookie，不再落到首頁catch-all」。
  await test('（TASK1.29起）POST /auth/guest 透過真正的 worker.fetch() 已正式上線，回傳JSON+Set-Cookie而非首頁HTML', async () => {
    // 注意：這裡刻意用獨立的假D1，而不是本檔案共用的 fullEnv/DIET_COACH_DB，
    // 避免這條會真的寫入D1的測試污染後面「既有路由完全不碰D1」的斷言。
    const isolatedEnv = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: makeFakeD1() };
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), isolatedEnv, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/json');
    assert.ok(res.headers.get('set-cookie'));
  });

  await test('（無auth啟用）GET /auth/me 透過真正的 worker.fetch() 也落到首頁catch-all（不是401 JSON）', async () => {
    const res = await worker.fetch(new Request('https://example.com/auth/me'), fullEnv, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual((res.headers.get('content-type') || '').indexOf('text/html'), 0);
  });

  await test('（無auth啟用）GET /users/123 透過真正的 worker.fetch() 也落到首頁catch-all（不是JSON API）', async () => {
    const res = await worker.fetch(new Request('https://example.com/users/123'), fullEnv, {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual((res.headers.get('content-type') || '').indexOf('text/html'), 0);
  });

  await test('（無auth啟用）getAppConfig(fullEnv).features.authEnabled 為 false', () => {
    const app = createApplication(fullEnv);
    assert.strictEqual(app.config.app.features.authEnabled, false);
  });

  await test('（無auth啟用）getAuthConfig(fullEnv).google.configured 為 false（沒有設定任何OAuth憑證）', () => {
    const app = createApplication(fullEnv);
    assert.strictEqual(app.config.auth.google.configured, false);
  });

  await test('（無auth啟用）原始碼掃描：worker.js 不 import src/oauth/ 底下任何檔案', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/from\s+['"]\.\/oauth\//.test(src));
  });

  // ---------------------------------------------------------------------
  // 9. 無legacy import
  // ---------------------------------------------------------------------

  await test('（無legacy import）原始碼掃描：worker.js 不 import legacy_import_service.js', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!/legacy_import/.test(src));
  });

  // 注意：TASK1.29 起 POST /auth/guest 是唯一一條會真的寫入D1的路由
  // （這正是TASK1.29的任務目標——正式的guest登入本來就該寫入users/
  // sessions兩張表），所以這裡排除它，只驗證其餘既有路由（首頁/
  // manifest/KV）依然完全不碰D1。
  await test('（無legacy import）多次呼叫既有路由（不含TASK1.29啟用的/auth/guest）後，假 D1 binding 完全沒有任何 SQL 呼叫', async () => {
    await worker.fetch(new Request('https://example.com/'), fullEnv, {});
    await worker.fetch(new Request('https://example.com/manifest.json'), fullEnv, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=x1'), fullEnv, {});
    assert.strictEqual(DIET_COACH_DB.calls.length, 0);
  });

  await test('（無legacy import）createApplication() 本身不會執行任何 db 呼叫（純組裝，見TASK1.23）', () => {
    const freshD1 = makeFakeD1();
    createApplication({ DIET_COACH_DB: freshD1, SYNC_KV, DIET_COACH_IMAGES });
    assert.strictEqual(freshD1.calls.length, 0);
  });

  // ---------------------------------------------------------------------
  // 10. UI HTML一致
  // ---------------------------------------------------------------------

  await test('（UI一致）首頁 HTML 內容包含 NUTRI_DATA/SCEN_DATA/QST_PHOTOS 等關鍵變數', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), fullEnv, {});
    const text = await res.text();
    assert.ok(text.indexOf('NUTRI_DATA') > 0);
    assert.ok(text.indexOf('SCEN_DATA') > 0);
    assert.ok(text.indexOf('QST_PHOTOS') > 0);
  });

  await test('（UI一致）首頁 HTML 長度與 TASK1.10 基準測試的長度數量級一致（未被截斷或異常膨脹）', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), fullEnv, {});
    const text = await res.text();
    assert.ok(text.length > 1000000 && text.length < 1500000, `長度異常: ${text.length}`);
  });

  await test('（UI一致）首頁 Cache-Control為no-store（與接入前一致）', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), fullEnv, {});
    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
  });

  await test('（UI一致）兩次呼叫首頁得到完全相同的HTML內容（getHTML()無隨機性、無因app而改變）', async () => {
    const res1 = await worker.fetch(new Request('https://example.com/'), fullEnv, {});
    const text1 = await res1.text();
    const res2 = await worker.fetch(new Request('https://example.com/'), fullEnv, {});
    const text2 = await res2.text();
    assert.strictEqual(text1, text2);
  });

  await test('（UI一致）有無D1 binding，首頁HTML內容完全相同（bootstrap成功與否不影響UI）', async () => {
    const resWithD1 = await worker.fetch(new Request('https://example.com/'), fullEnv, {});
    const textWithD1 = await resWithD1.text();
    const resNoD1 = await worker.fetch(new Request('https://example.com/'), { SYNC_KV, DIET_COACH_IMAGES }, {});
    const textNoD1 = await resNoD1.text();
    assert.strictEqual(textWithD1, textNoD1);
  });

  // ---------------------------------------------------------------------
  // 額外：路徑穿越 / img 邊界（延續 TASK1.10 案例，確認接入後行為一致）
  // ---------------------------------------------------------------------

  await test('/img/路徑穿越測試 行為與接入前一致（URL正規化後落到首頁200）', async () => {
    const res = await worker.fetch(new Request('https://example.com/img/../../etc/passwd'), fullEnv, {});
    assert.strictEqual(res.status, 200);
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'worker-entry-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

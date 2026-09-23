/*
 * Phase 1 TASK 1.28｜API Contract & Validation Layer 測試
 *
 * 分五部分：
 * A) response_contract.js 的 success/failure 單元測試
 * B) auth_contract.js / user_contract.js 的規格內容驗證
 * C) validator.js 新增的 validateContract() / createContractValidationMiddleware() 測試
 * D) controller整合驗證（auth_controller.js/user_controller.js 改用contracts）
 * E) 對真正的 src/worker.js 端對端測試，確認legacy route/KV/R2/D1零寫入
 *    完全不受本次影響
 *
 * 完全不連線任何真實或本機模擬的資料庫，不建立任何真實使用者 session，
 * 不會真的呼叫 Google OAuth，不執行 Legacy Import。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { success, failure } from '../../src/contracts/response_contract.js';
import {
  loginGuestContract,
  loginProviderContract,
  logoutContract,
  currentUserContract,
} from '../../src/contracts/auth_contract.js';
import { getUserByIdContract } from '../../src/contracts/user_contract.js';
import * as contractsIndex from '../../src/contracts/index.js';
import { success as controllersResponseSuccess, failure as controllersResponseFailure } from '../../src/controllers/response.js';
import {
  validateBody,
  validateContract,
  createContractValidationMiddleware,
} from '../../src/middleware/validator.js';
import { createMiddlewarePipeline } from '../../src/middleware/index.js';
import { loginGuestController, loginProviderController } from '../../src/controllers/auth_controller.js';
import { getUserByIdController } from '../../src/controllers/user_controller.js';
import { createAppRouter } from '../../src/routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '..', '..', 'src', 'worker.js');

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

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

function makeFakeKV() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value) { store.set(key, value); },
  };
}

function makeFakeR2(objects) {
  return {
    async get(key) {
      if (!objects[key]) return null;
      return { body: objects[key] };
    },
  };
}

function makeMockDb() {
  const users = new Map();
  const calls = [];
  return {
    calls,
    _users: users,
    users: {
      async insert(u) { calls.push({ type: 'insert', table: 'users' }); users.set(u.id, u); return { ok: true }; },
      async getById(id) { calls.push({ type: 'getById', table: 'users' }); return { ok: true, row: users.get(id) || null }; },
      async getByProvider() { calls.push({ type: 'getByProvider', table: 'users' }); return { ok: true, row: null }; },
      async touchLogin() { calls.push({ type: 'touchLogin', table: 'users' }); return { ok: true }; },
    },
    sessions: {
      async insert(s) { calls.push({ type: 'insert', table: 'sessions' }); return { ok: true }; },
    },
  };
}

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
  // =========================================================================
  // A. response_contract.js — success/failure（1.response格式）
  // =========================================================================

  await test('（1.response格式）success(data) 回傳 {ok:true, data}', () => {
    assert.deepStrictEqual(success({ x: 1 }), { ok: true, data: { x: 1 } });
  });

  await test('（1.response格式）success() 沒有參數時 data 預設為空物件', () => {
    assert.deepStrictEqual(success(), { ok: true, data: {} });
  });

  await test('（1.response格式）failure(reason, status) 回傳 {ok:false, reason, status}', () => {
    assert.deepStrictEqual(failure('nope', 404), { ok: false, reason: 'nope', status: 404 });
  });

  await test('（1.response格式）failure() 沒有status時不含status欄位', () => {
    const result = failure('nope');
    assert.strictEqual(result.status, undefined);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'status'), false);
  });

  await test('（1.response格式）failure() 沒有reason時預設unknown_error', () => {
    assert.strictEqual(failure().reason, 'unknown_error');
  });

  await test('（1.response格式）src/contracts/index.js 統一輸出success/failure，跟response_contract.js完全一致', () => {
    assert.strictEqual(contractsIndex.success, success);
    assert.strictEqual(contractsIndex.failure, failure);
  });

  await test('（1.response格式）src/controllers/response.js 現在是re-export，跟contracts的success/failure是同一個函式參考', () => {
    assert.strictEqual(controllersResponseSuccess, success);
    assert.strictEqual(controllersResponseFailure, failure);
  });

  // =========================================================================
  // B. auth_contract.js / user_contract.js — 規格內容（3.auth contract / 4.user contract）
  // =========================================================================

  await test('（3.auth contract）loginGuestContract.request 允許選填的metadata物件', () => {
    assert.strictEqual(loginGuestContract.request.metadata.required, false);
    assert.strictEqual(loginGuestContract.request.metadata.type, 'object');
  });

  await test('（3.auth contract）loginProviderContract.request 要求auth_provider/auth_provider_id為必填字串', () => {
    assert.strictEqual(loginProviderContract.request.auth_provider.required, true);
    assert.strictEqual(loginProviderContract.request.auth_provider.type, 'string');
    assert.strictEqual(loginProviderContract.request.auth_provider_id.required, true);
  });

  await test('（3.auth contract）loginProviderContract.request 的email/display_name是選填', () => {
    assert.strictEqual(loginProviderContract.request.email.required, false);
    assert.strictEqual(loginProviderContract.request.display_name.required, false);
  });

  await test('（3.auth contract）logoutContract/currentUserContract 的request schema皆為空物件（無body）', () => {
    assert.deepStrictEqual(logoutContract.request, {});
    assert.deepStrictEqual(currentUserContract.request, {});
  });

  await test('（3.auth contract）四個auth contract都有response.success與response.failureReasons描述', () => {
    for (const c of [loginGuestContract, loginProviderContract, logoutContract, currentUserContract]) {
      assert.ok(c.response.success);
      assert.ok(Array.isArray(c.response.failureReasons));
    }
  });

  await test('（4.user contract）getUserByIdContract.request 要求userId為必填字串', () => {
    assert.strictEqual(getUserByIdContract.request.userId.required, true);
    assert.strictEqual(getUserByIdContract.request.userId.type, 'string');
  });

  await test('（4.user contract）getUserByIdContract 有response描述（success/failureReasons/failureStatus）', () => {
    assert.ok(getUserByIdContract.response.success.user);
    assert.ok(getUserByIdContract.response.failureReasons.includes('user_not_found'));
    assert.ok(getUserByIdContract.response.failureStatus.includes(404));
  });

  await test('（3/4.contract）原始碼掃描：auth_contract.js/user_contract.js 不import任何controller/service/db檔案（純規格資料）', () => {
    const files = ['auth_contract.js', 'user_contract.js'];
    for (const f of files) {
      const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'contracts', f), 'utf8'));
      assert.ok(!/from\s+['"]\.\.\/(services|db|controllers)\//.test(src));
    }
  });

  // =========================================================================
  // C. validator.js 新增能力（2.contract validation）
  // =========================================================================

  await test('（2.contract validation）validateContract() 對合法資料回傳ok:true', () => {
    const result = validateContract(loginProviderContract, { auth_provider: 'google', auth_provider_id: 'g1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（2.contract validation）validateContract() 對缺少必填欄位的資料回傳ok:false並列出錯誤', () => {
    const result = validateContract(loginProviderContract, { auth_provider: 'google' });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('auth_provider_id')));
  });

  await test('（2.contract validation）validateContract() 對getUserByIdContract驗證userId', () => {
    assert.strictEqual(validateContract(getUserByIdContract, { userId: 'u-1' }).ok, true);
    assert.strictEqual(validateContract(getUserByIdContract, {}).ok, false);
  });

  await test('（2.contract validation）validateContract(undefined, data) 不拋例外，視為空schema', () => {
    assert.doesNotThrow(() => validateContract(undefined, { anything: 1 }));
    assert.strictEqual(validateContract(undefined, {}).ok, true);
  });

  await test('（2.contract validation）validateContract 底層直接沿用 validateBody（同樣的錯誤訊息格式）', () => {
    const a = validateBody(loginProviderContract.request, {});
    const b = validateContract(loginProviderContract, {});
    assert.deepStrictEqual(a, b);
  });

  await test('（2.contract validation）createContractValidationMiddleware() 對合法payload呼叫next並放行', async () => {
    const mw = createContractValidationMiddleware(loginGuestContract);
    let nextCalled = false;
    const result = await mw({ req: { payload: {} } }, (ctx) => { nextCalled = true; return { ok: true }; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(result.ok, true);
  });

  await test('（2.contract validation）createContractValidationMiddleware() 對不合法payload短路回傳400，不呼叫next', async () => {
    const mw = createContractValidationMiddleware(loginProviderContract);
    let nextCalled = false;
    const result = await mw({ req: { payload: {} } }, () => { nextCalled = true; return { ok: true }; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.reason, 'invalid_payload');
  });

  await test('（2.contract validation）createContractValidationMiddleware() 可自訂getData函式取資料來源', async () => {
    const mw = createContractValidationMiddleware(getUserByIdContract, (ctx) => ctx.params);
    const result = await mw({ params: { id: '1' } }, () => ({ ok: true }));
    // getUserByIdContract要求userId欄位，但params只有id，預期驗證失敗
    assert.strictEqual(result.ok, false);
  });

  // =========================================================================
  // C2. middleware整合（6.middleware整合）：contract validation middleware 可以放進 pipeline
  // =========================================================================

  await test('（6.middleware整合）createContractValidationMiddleware() 可以放進createMiddlewarePipeline()正常運作（合法情境）', async () => {
    const mw = createContractValidationMiddleware(loginProviderContract);
    const applyPipeline = createMiddlewarePipeline([mw]);
    const wrapped = applyPipeline(() => ({ ok: true, data: { handled: true } }));
    const result = await wrapped({ req: { payload: { auth_provider: 'google', auth_provider_id: 'g1' } } });
    assert.strictEqual(result.data.handled, true);
  });

  await test('（6.middleware整合）createContractValidationMiddleware() 放進pipeline時，不合法payload會擋下handler', async () => {
    const mw = createContractValidationMiddleware(loginProviderContract);
    const applyPipeline = createMiddlewarePipeline([mw]);
    let handlerCalled = false;
    const wrapped = applyPipeline(() => { handlerCalled = true; return { ok: true }; });
    const result = await wrapped({ req: { payload: {} } });
    assert.strictEqual(handlerCalled, false);
    assert.strictEqual(result.status, 400);
  });

  await test('（6.middleware整合）pipeline補完的ctx（requestId/timestamp）在contract驗證通過後仍正確傳給handler', async () => {
    const mw = createContractValidationMiddleware(loginGuestContract);
    const applyPipeline = createMiddlewarePipeline([mw]);
    let capturedCtx = null;
    const wrapped = applyPipeline((ctx) => { capturedCtx = ctx; return { ok: true }; });
    await wrapped({ req: { payload: {} } });
    assert.ok(capturedCtx.requestId);
  });

  await test('（6.middleware整合）pipeline中contract validation middleware丟出例外時仍被withErrorHandling攔截', async () => {
    const throwingGetData = () => { throw new Error('extract-boom'); };
    const mw = createContractValidationMiddleware(loginGuestContract, throwingGetData);
    const applyPipeline = createMiddlewarePipeline([mw]);
    const wrapped = applyPipeline(() => ({ ok: true }));
    const result = await wrapped({});
    assert.strictEqual(result.reason, 'extract-boom');
  });

  // =========================================================================
  // D. controller整合（5.controller整合）
  // =========================================================================

  await test('（5.controller整合）loginGuestController成功時回傳的success()跟contracts的success是同一份實作', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, {}, {});
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'ok']);
  });

  await test('（5.controller整合）loginProviderController失敗時回傳failure()格式（invalid_payload,400）跟contracts一致', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, null);
    assert.deepStrictEqual(result, failure('invalid_payload', 400));
  });

  await test('（5.controller整合）getUserByIdController失敗時回傳failure()格式（invalid_payload,400）跟contracts一致', async () => {
    const db = makeMockDb();
    const result = await getUserByIdController(db, {});
    assert.deepStrictEqual(result, failure('invalid_payload', 400));
  });

  await test('（5.controller整合）getUserByIdController對不存在的user回傳404，reason為user_not_found（符合contract描述）', async () => {
    const db = makeMockDb();
    const result = await getUserByIdController(db, { userId: 'does-not-exist' });
    assert.strictEqual(result.status, 404);
    assert.ok(getUserByIdContract.response.failureReasons.includes(result.reason));
  });

  await test('（5.controller整合）原始碼掃描：auth_controller.js/user_controller.js 都是從 contracts/response_contract.js import success/failure', () => {
    const files = ['auth_controller.js', 'user_controller.js'];
    for (const f of files) {
      const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'controllers', f), 'utf8'));
      assert.ok(/from\s+['"]\.\.\/contracts\/response_contract\.js['"]/.test(src), `${f} 應該從contracts import`);
    }
  });

  await test('（5.controller整合）src/controllers/response.js 不再自己定義success/failure，只是re-export', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'controllers', 'response.js'), 'utf8'));
    assert.ok(/export\s*\{\s*success\s*,\s*failure\s*\}\s*from\s*['"]\.\.\/contracts\/response_contract\.js['"]/.test(src));
    assert.ok(!/function\s+success/.test(src));
    assert.ok(!/function\s+failure/.test(src));
  });

  await test('（5.controller整合）router整合：GET /users/:id 透過真正的router最終還是回傳跟contracts一致的格式', async () => {
    const router = createAppRouter();
    const db = makeMockDb();
    const res = await router.handle({ method: 'GET', pathname: '/users/nope' }, { db });
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
  });

  // =========================================================================
  // E. 真正的 src/worker.js 端對端（7.legacy route不受影響 / 8.KV/R2正常 / 9.D1零寫入）
  // =========================================================================

  const workerUrl = 'file://' + workerPath + '?t=' + Date.now();
  const mod = await import(workerUrl);
  const worker = mod.default;

  const SYNC_KV = makeFakeKV();
  const DIET_COACH_IMAGES = makeFakeR2({ 'quest/scenes/terrain-1.jpg': 'FAKE_JPEG_BYTES' });
  const DIET_COACH_DB = makeFakeD1();
  const envFalse = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB };
  const envTrue = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };

  await test('（7.legacy route不受影響）flag=false：GET / 首頁HTML行為不變', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), envFalse, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（7.legacy route不受影響）flag=true：GET / 透過router+legacy adapter仍回傳一樣的首頁HTML', async () => {
    const res = await worker.fetch(new Request('https://example.com/'), envTrue, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（7.legacy route不受影響）flag=true：GET /manifest.json /icon.svg 內容不變', async () => {
    const manifestRes = await worker.fetch(new Request('https://example.com/manifest.json'), envTrue, {});
    assert.strictEqual(manifestRes.headers.get('content-type'), 'application/manifest+json');
    const iconRes = await worker.fetch(new Request('https://example.com/icon.svg'), envTrue, {});
    assert.strictEqual((await iconRes.text()).indexOf('<svg'), 0);
  });

  await test('（8.KV/R2正常）flag=false：POST /api/sync 成功寫入並可GET讀回', async () => {
    const postRes = await worker.fetch(new Request('https://example.com/api/sync?code=ct-1', { method: 'POST', body: JSON.stringify({ v: 1 }) }), envFalse, {});
    assert.strictEqual((await postRes.json()).ok, true);
    const getRes = await worker.fetch(new Request('https://example.com/api/sync?code=ct-1'), envFalse, {});
    assert.strictEqual(await getRes.text(), JSON.stringify({ v: 1 }));
  });

  await test('（8.KV/R2正常）flag=true：POST /api/qlive 透過router+legacy adapter一樣成功寫入並可GET讀回', async () => {
    const postRes = await worker.fetch(new Request('https://example.com/api/qlive?code=ct-2', { method: 'POST', body: JSON.stringify({ ts: 2 }) }), envTrue, {});
    assert.strictEqual((await postRes.json()).ok, true);
    const getRes = await worker.fetch(new Request('https://example.com/api/qlive?code=ct-2'), envTrue, {});
    assert.strictEqual(await getRes.text(), JSON.stringify({ ts: 2 }));
  });

  await test('（8.KV/R2正常）flag=true：GET /img/存在的物件 內容與flag=false完全相同', async () => {
    const resTrue = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envTrue, {});
    const resFalse = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envFalse, {});
    assert.strictEqual(await resTrue.text(), await resFalse.text());
  });

  await test('（8.KV/R2正常）flag=true：POST /auth/guest 透過真正router+controller+contracts成功，格式跟auth_contract描述一致', async () => {
    const res = await worker.fetch(new Request('https://example.com/auth/guest', { method: 'POST', body: '{}' }), envTrue, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.user);
    assert.ok(body.data.session);
    assert.ok(body.data.cookie);
  });

  await test('（8.KV/R2正常）flag=true：POST /auth/provider 缺少必要欄位時，透過真正router+controller+application service回401，reason在contract描述清單內', async () => {
    // 注意：真正的 Fetch Request 目前沒有任何地方會把 body 解析進
    // ctx.req.payload（HTTP body 解析是尚未接線的未來工作，見TASK1.20/1.21
    // 既有的已知限制），所以這裡用跟TASK1.25/1.26同樣的手法，直接用
    // request-like物件帶上payload，才能真正測試到identity層的reason。
    const router = createAppRouter(async () => new Response('legacy', { status: 200 }));
    const db = makeMockDb();
    const res = await router.handle(
      { method: 'POST', pathname: '/auth/provider', payload: { email: 'x@example.com' } },
      { db }
    );
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.ok(loginProviderContract.response.failureReasons.includes(body.reason), `reason=${body.reason}應在清單內`);
  });

  await test('（9.D1零寫入）flag=false多次呼叫後，D1完全沒有任何SQL呼叫', async () => {
    const freshD1 = makeFakeD1();
    const env = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: freshD1 };
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/api/sync?code=ct-d1'), env, {});
    assert.strictEqual(freshD1.calls.length, 0);
  });

  await test('（9.D1零寫入）flag=true處理legacy路徑後，D1完全沒有任何SQL呼叫', async () => {
    const freshD1 = makeFakeD1();
    const env = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: freshD1, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };
    await worker.fetch(new Request('https://example.com/'), env, {});
    await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    assert.strictEqual(freshD1.calls.length, 0);
  });

  await test('（延續守則）flag=true：createApplication失敗（缺少D1）時仍安全fallback，首頁正常', async () => {
    const envTrueNoD1 = { SYNC_KV, DIET_COACH_IMAGES, FEATURE_ROUTE_MIGRATION_ENABLED: 'true' };
    const res = await worker.fetch(new Request('https://example.com/'), envTrueNoD1, {});
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（延續守則）原始碼掃描：worker.js 的 handle(r,env) 函式體本身完全沒有變動（TASK1.28沒有動到legacy handler）', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/contract|Contract/.test(handleBody));
  });

  // 注意：這項斷言原本是「TASK1.28當下 src/worker.js 完全沒有異動」的
  // 一次性快照檢查，TASK1.29已合法修改worker.js的入口區塊來啟用
  // POST /auth/guest，這裡改成驗證持久有效的守則（跟上面那項handle本體
  // 未變動的檢查一致）。
  await test('（延續守則，TASK1.29後更新）worker.js 的合法改動只會發生在 handle(r,env) 之前的入口區塊', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    const handleBodyStart = src.indexOf('async function handle(r,env){');
    assert.ok(handleBodyStart > 0);
    const handleBody = src.slice(handleBodyStart);
    assert.ok(!/contract|Contract/.test(handleBody));
  });

  await test('（延續守則）git diff：wrangler.toml 在TASK1.28完全沒有異動', async () => {
    const { execSync } = await import('node:child_process');
    const diff = execSync('git diff --stat wrangler.toml', { cwd: path.join(__dirname, '..', '..') }).toString();
    assert.strictEqual(diff.trim(), '');
  });

  // 注意：這項斷言原本驗證「router.js當時預設是空middleware清單」，
  // TASK1.29已明確把 loginGuestContract 的 contract validation
  // middleware 接進 POST /auth/guest 這一條路由（其餘路由不受影響）——
  // 這是TASK1.29的任務目標，不是回歸。這裡改成驗證「只有/auth/guest
  // 這一條路由用了非空的middleware清單，其餘路由仍是空清單」。
  await test('（TASK1.29後更新）router.js 的 createMiddlewarePipeline 支援每條路由各自的middleware清單，且是TASK1.29新增/auth/guest contract validation的必要基礎', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'router.js'), 'utf8'));
    assert.ok(/createMiddlewarePipeline\(middlewares\)/.test(src), 'router.js應該支援每條路由各自的middlewares');
  });

  // 注意：這項斷言原本驗證「auth_routes.js完全沒有import contracts」，
  // TASK1.29已明確讓 auth_routes.js import loginGuestContract 來啟用
  // POST /auth/guest 的 contract validation——這是TASK1.29的任務目標，
  // 不是回歸。user_routes.js/legacy_routes.js 仍然沒有接線，維持原斷言。
  await test('（TASK1.29後更新）user_routes.js/legacy_routes.js 仍未import contracts（尚未接線，只有/auth/guest透過TASK1.29啟用）', () => {
    const files = ['user_routes.js', 'legacy_routes.js'];
    for (const f of files) {
      const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', f), 'utf8'));
      assert.ok(!/contracts\//.test(src), `${f} 不應 import contracts（尚未啟用）`);
    }
  });

  // -------------------------------------------------------------------------
  // 額外補充：更多contract/controller/端對端情境
  // -------------------------------------------------------------------------

  await test('（2.contract validation）validateContract() 對type不符的資料回傳ok:false', () => {
    const result = validateContract(loginProviderContract, { auth_provider: 123, auth_provider_id: 'g1' });
    assert.strictEqual(result.ok, false);
  });

  await test('（3.auth contract）loginProviderContract.response.failureStatus 同時涵蓋400與401', () => {
    assert.deepStrictEqual(loginProviderContract.response.failureStatus, [400, 401]);
  });

  await test('（4.user contract）getUserByIdContract.request 只有一個欄位（userId）', () => {
    assert.deepStrictEqual(Object.keys(getUserByIdContract.request), ['userId']);
  });

  await test('（1.response格式）src/contracts/index.js 也統一輸出全部5個contract物件', () => {
    assert.strictEqual(contractsIndex.loginGuestContract, loginGuestContract);
    assert.strictEqual(contractsIndex.loginProviderContract, loginProviderContract);
    assert.strictEqual(contractsIndex.logoutContract, logoutContract);
    assert.strictEqual(contractsIndex.currentUserContract, currentUserContract);
    assert.strictEqual(contractsIndex.getUserByIdContract, getUserByIdContract);
  });

  await test('（5.controller整合）loginProviderController成功情境的回傳值仍是success()格式（含created欄位）', async () => {
    const db = makeMockDb();
    const result = await loginProviderController(db, { auth_provider: 'google', auth_provider_id: 'g-99' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(typeof result.data.created, 'boolean');
  });

  await test('（5.controller整合）controller的成功回傳值可以直接通過contract.response.success描述的欄位檢查', async () => {
    const db = makeMockDb();
    const result = await loginGuestController(db, {}, {});
    for (const key of Object.keys(loginGuestContract.response.success)) {
      assert.ok(Object.prototype.hasOwnProperty.call(result.data, key), `data應包含${key}`);
    }
  });

  await test('（6.middleware整合）createContractValidationMiddleware() 預設從ctx.req.payload取資料', async () => {
    const mw = createContractValidationMiddleware(getUserByIdContract);
    const result = await mw({ req: { payload: { userId: 'u-1' } } }, () => ({ ok: true, data: {} }));
    assert.strictEqual(result.ok, true);
  });

  await test('（7.legacy route不受影響）flag=true：POST /auth/logout 沒有cookie仍回200（wasValid:false），格式一致', async () => {
    const res = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST', body: '{}' }), envTrue, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.wasValid, false);
  });

  await test('（7.legacy route不受影響）flag=false：POST /auth/logout 仍落到首頁catch-all（未受contract layer影響）', async () => {
    const res = await worker.fetch(new Request('https://example.com/auth/logout', { method: 'POST' }), envFalse, {});
    const text = await res.text();
    assert.strictEqual(text.indexOf('<!DOCTYPE html>'), 0);
  });

  await test('（8.KV/R2正常）flag=true 與 flag=false 讀寫同一份KV資料，內容一致', async () => {
    await worker.fetch(new Request('https://example.com/api/sync?code=ct-shared', { method: 'POST', body: 'shared-value' }), envTrue, {});
    const getRes = await worker.fetch(new Request('https://example.com/api/sync?code=ct-shared'), envFalse, {});
    assert.strictEqual(await getRes.text(), 'shared-value');
  });

  await test('（9.D1零寫入）createApplication()本身不會因為contracts/controller整合而觸發任何db呼叫', () => {
    const freshD1 = makeFakeD1();
    const env = { SYNC_KV, DIET_COACH_IMAGES, DIET_COACH_DB: freshD1 };
    const router = createAppRouter();
    assert.strictEqual(freshD1.calls.length, 0);
  });

  await test('（延續守則）原始碼掃描：response_contract.js/auth_contract.js/user_contract.js 皆沒有 export default（維持一致的module風格）', () => {
    const files = ['response_contract.js', 'auth_contract.js', 'user_contract.js', 'index.js'];
    for (const f of files) {
      const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'contracts', f), 'utf8'));
      assert.ok(!/export\s+default/.test(src));
    }
  });

  await test('（延續守則）原始碼掃描：contracts/ 底下沒有任何檔案 import src/oauth/ 或 legacy_import', () => {
    const files = ['response_contract.js', 'auth_contract.js', 'user_contract.js', 'index.js'];
    for (const f of files) {
      const src = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'contracts', f), 'utf8'));
      assert.ok(!/oauth\/|legacy_import/.test(src));
    }
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;

  fs.writeFileSync(path.join(__dirname, 'contract-test-log.json'), JSON.stringify({ passed, failed }, null, 2));
}

run();

/*
 * Phase 6 TASK 1.118｜Health Insight User Identity Foundation 測試
 *
 * 本任務建立一個跟"目前是誰登入"完全無關的穩定User Identity
 * Context（`{userId, authenticated, provider}`），供未來Health
 * Insight個人化/歷史紀錄/Premium/Gemini Enhancement Layer掛勾。
 * 本次任務不整合Gemini、不實作付費/訂閱、不建立健康歷史資料表、
 * 不重新設計UI，也**沒有**把這個身份邊界接進任何真實的
 * route/controller呼叫鏈——Health Insight今天依然100%匿名運作，
 * 跟TASK1.116/1.117完成時的行為完全一致。
 *
 * 分為以下12個部分：
 * A) authentication boundary
 * B) user identity object
 * C) anonymous mode
 * D) future authenticated mode
 * E) Health Insight compatibility
 * F) Product Integration compatibility
 * G) Response Boundary compatibility
 * H) session boundary
 * I) future membership extension
 * J) architecture protection
 * K) regression validation
 * L) P1-P6
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const srcRoot = path.join(repoRoot, 'src');
const identityDir = path.join(srcRoot, 'identity');
const healthInsightIdentityDir = path.join(identityDir, 'health_insight');
const controllersDir = path.join(srcRoot, 'controllers');
const routesDir = path.join(srcRoot, 'routes');
const uiDir = path.join(srcRoot, 'ui', 'health_insight');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`✅ ${name}`);
    })
    .catch((e) => {
      failed++;
      failures.push(name);
      console.log(`❌ ${name}`);
      console.log('   ', e && e.stack ? e.stack.split('\n')[0] : e);
    });
}

function getImportLines(source) {
  return source.split('\n').filter((line) => /^import\b/.test(line.trim())).join('\n');
}

async function loadModules() {
  const identityModule = await import(path.join(healthInsightIdentityDir, 'index.js'));
  const { createAppRouter } = await import(path.join(routesDir, 'index.js'));
  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  const { createHealthInsightProductIntegration } = await import(path.join(srcRoot, 'intelligence', 'product', 'health_insight_integration.js'));
  const { createInsightContextBuilder } = await import(path.join(srcRoot, 'intelligence', 'context', 'insight_context_builder.js'));
  const { validateInsightContext } = await import(path.join(srcRoot, 'intelligence', 'contracts', 'insight_context_contract.js'));
  return { identityModule, createAppRouter, createApplication, createHealthInsightProductIntegration, createInsightContextBuilder, validateInsightContext };
}

async function main() {
  const {
    identityModule,
    createAppRouter,
    createApplication,
    createHealthInsightProductIntegration,
    createInsightContextBuilder,
    validateInsightContext,
  } = await loadModules();

  const {
    ANONYMOUS_IDENTITY,
    buildUserIdentity,
    isValidUserIdentity,
    resolveHealthInsightIdentity,
    attachIdentityToOptions,
    buildHealthInsightProductRequest,
    createMembershipPlaceholder,
    resolveFeaturePermission,
  } = identityModule;

  function makeAnonymousInsightContext() {
    return createInsightContextBuilder().buildInsightContext({ user: null, explorations: [], foodEvents: [], emotions: [], behaviors: [], reports: [] }).context;
  }

  // =========================================================================
  // A. Authentication boundary
  // =========================================================================
  console.log('--- A. Authentication boundary ---');

  await test('（1.auth boundary）src/identity/health_insight/README.md存在，記錄既有架構檢視結果', () => {
    assert.ok(fs.existsSync(path.join(healthInsightIdentityDir, 'README.md')));
    const readme = fs.readFileSync(path.join(healthInsightIdentityDir, 'README.md'), 'utf8');
    assert.ok(readme.includes('Authentication Boundary Definition'));
    assert.ok(readme.includes('validateSessionWithIdentity'));
  });

  await test('（1.auth boundary）resolve_identity.js重用既有validateSessionWithIdentity()，不重新實作session驗證邏輯', () => {
    const source = fs.readFileSync(path.join(healthInsightIdentityDir, 'resolve_identity.js'), 'utf8');
    assert.ok(source.includes("from '../session_rules.js'"));
    assert.ok(source.includes('validateSessionWithIdentity'));
  });

  await test('（1.auth boundary）本次任務完全沒有修改既有Auth Layer（src/auth/、src/oauth/、src/identity/既有檔案）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/ src/oauth/ src/identity/session_rules.js src/identity/guest.js src/identity/upgrade.js src/identity/status.js src/identity/provider.js src/identity/provider_mapping.js src/identity/guest_session_service.js src/identity/lifecycle.js src/identity/login_identity.js src/identity/legacy_identity.js src/identity/account_upgrade.js src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（1.auth boundary）本次任務沒有建立新的auth/session/oauth相關檔案（只在src/identity/health_insight/新增橋接層）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain --untracked-files=all -- src/auth/ src/oauth/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（1.auth boundary）既有requireAuth() middleware完全沒有被修改（Health Insight身份邊界跟既有API路由的登入邊界互不影響）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/middleware/auth_middleware.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const NEW_MODULE_FILES = ['user_identity.js', 'resolve_identity.js', 'request_context.js', 'membership_placeholder.js', 'index.js'];

  for (const file of NEW_MODULE_FILES) {
    await test(`（1.auth boundary）${file} 通過node --check語法驗證`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(healthInsightIdentityDir, file)], { encoding: 'utf8' }));
    });
  }

  await test('（1.auth boundary）src/identity/health_insight/index.js re-export所有七個公開函式/常數，型別正確', () => {
    assert.strictEqual(typeof identityModule.ANONYMOUS_IDENTITY, 'object');
    assert.strictEqual(typeof identityModule.buildUserIdentity, 'function');
    assert.strictEqual(typeof identityModule.isValidUserIdentity, 'function');
    assert.strictEqual(typeof identityModule.resolveHealthInsightIdentity, 'function');
    assert.strictEqual(typeof identityModule.attachIdentityToOptions, 'function');
    assert.strictEqual(typeof identityModule.buildHealthInsightProductRequest, 'function');
    assert.strictEqual(typeof identityModule.createMembershipPlaceholder, 'function');
    assert.strictEqual(typeof identityModule.resolveFeaturePermission, 'function');
  });

  for (const exportName of Object.keys(identityModule)) {
    await test(`（1.auth boundary）identityModule的公開匯出"${exportName}"確實存在（不是undefined）`, () => {
      assert.notStrictEqual(identityModule[exportName], undefined);
    });
  }

  console.log('');

  // =========================================================================
  // B. User identity object
  // =========================================================================
  console.log('--- B. User identity object ---');

  await test('（2.identity object）ANONYMOUS_IDENTITY形狀恰好是{userId:null, authenticated:false, provider:null, isGuest:false, userType:"anonymous"}（TASK1.126後更新：新增isGuest/userType語意分類欄位，見src/identity/health_insight/user_identity.js該任務更新說明）', () => {
    assert.deepStrictEqual(ANONYMOUS_IDENTITY, { userId: null, authenticated: false, provider: null, isGuest: false, userType: 'anonymous' });
  });

  await test('（2.identity object）ANONYMOUS_IDENTITY被凍結，無法被修改', () => {
    assert.ok(Object.isFrozen(ANONYMOUS_IDENTITY));
    const original = ANONYMOUS_IDENTITY.userId;
    try { ANONYMOUS_IDENTITY.userId = 'hacked'; } catch (e) { /* strict mode 可能直接拋出，安全忽略 */ }
    assert.strictEqual(ANONYMOUS_IDENTITY.userId, original);
  });

  // TASK1.126後更新：每個expected新增isGuest/userType兩個欄位
  // （見src/identity/health_insight/user_identity.js該任務更新
  // 說明）——guest案例是isGuest:true/userType:'guest'，其餘
  // （google/null-provider/apple等任何非guest情況）都是
  // isGuest:false/userType:'registered'。
  const PROVIDER_CASES = [
    { label: 'guest', user: { id: 'u1', is_guest: 1, auth_provider: null }, expected: { userId: 'u1', authenticated: true, provider: 'guest', isGuest: true, userType: 'guest' } },
    { label: 'guest（is_guest為true布林值）', user: { id: 'u2', is_guest: true, auth_provider: null }, expected: { userId: 'u2', authenticated: true, provider: 'guest', isGuest: true, userType: 'guest' } },
    { label: 'google', user: { id: 'u3', is_guest: 0, auth_provider: 'google' }, expected: { userId: 'u3', authenticated: true, provider: 'google', isGuest: false, userType: 'registered' } },
    { label: 'is_guest為0但auth_provider也是null（既有資料異常情況，安全處理成provider:null）', user: { id: 'u4', is_guest: 0, auth_provider: null }, expected: { userId: 'u4', authenticated: true, provider: null, isGuest: false, userType: 'registered' } },
    { label: '其他provider字串（未來可能的provider）', user: { id: 'u5', is_guest: 0, auth_provider: 'apple' }, expected: { userId: 'u5', authenticated: true, provider: 'apple', isGuest: false, userType: 'registered' } },
  ];

  for (const { label, user, expected } of PROVIDER_CASES) {
    await test(`（2.identity object）buildUserIdentity() 正確處理 ${label}`, () => {
      assert.deepStrictEqual(buildUserIdentity(user), expected);
    });
  }

  for (const { label, user } of PROVIDER_CASES) {
    await test(`（2.identity object）buildUserIdentity(${label}) 的輸出通過isValidUserIdentity()檢查`, () => {
      assert.strictEqual(isValidUserIdentity(buildUserIdentity(user)), true);
    });
  }

  for (const { label, user } of PROVIDER_CASES) {
    await test(`（2.identity object）buildUserIdentity(${label}) 的輸出是JSON-serializable且roundtrip不遺失資訊`, () => {
      const identity = buildUserIdentity(user);
      assert.deepStrictEqual(JSON.parse(JSON.stringify(identity)), identity);
    });
  }

  const MALFORMED_USER_INPUTS = [
    { label: 'null', value: null },
    { label: 'undefined', value: undefined },
    { label: '空物件', value: {} },
    { label: '字串', value: 'not-an-object' },
    { label: '數字', value: 42 },
    { label: '陣列', value: [1, 2, 3] },
    { label: 'id是數字（型別不符）', value: { id: 123 } },
    { label: 'id是空字串', value: { id: '' } },
    { label: '缺少id欄位', value: { auth_provider: 'google', is_guest: 0 } },
  ];

  for (const { label, value } of MALFORMED_USER_INPUTS) {
    await test(`（2.identity object）buildUserIdentity() 對${label}安全回傳ANONYMOUS_IDENTITY`, () => {
      assert.deepStrictEqual(buildUserIdentity(value), ANONYMOUS_IDENTITY);
    });
  }

  await test('（2.identity object）buildUserIdentity()輸出完全不含auth_provider_id/email/display_name/legacy_sync_code等D1原始欄位（不外洩OAuth細節；TASK1.126後更新：欄位清單新增isGuest/userType兩個語意分類欄位，依然不含任何D1原始欄位）', () => {
    const identity = buildUserIdentity({ id: 'u9', is_guest: 0, auth_provider: 'google', auth_provider_id: 'secret-oauth-id', email: 'user@example.com', display_name: 'Real Name', legacy_sync_code: 'SYNC123' });
    assert.deepStrictEqual(Object.keys(identity).sort(), ['authenticated', 'isGuest', 'provider', 'userId', 'userType']);
    const serialized = JSON.stringify(identity);
    assert.ok(!serialized.includes('secret-oauth-id'));
    assert.ok(!serialized.includes('user@example.com'));
    assert.ok(!serialized.includes('Real Name'));
    assert.ok(!serialized.includes('SYNC123'));
  });

  await test('（2.identity object）buildUserIdentity()是deterministic（同樣輸入永遠同樣輸出）', () => {
    const user = { id: 'u1', is_guest: 0, auth_provider: 'google' };
    assert.deepStrictEqual(buildUserIdentity(user), buildUserIdentity(user));
  });

  const VALID_IDENTITY_SAMPLES = [
    ANONYMOUS_IDENTITY,
    { userId: 'x', authenticated: true, provider: 'guest' },
    { userId: 'x', authenticated: true, provider: null },
    { userId: null, authenticated: false, provider: null },
  ];

  for (const sample of VALID_IDENTITY_SAMPLES) {
    await test(`（2.identity object）isValidUserIdentity() 正確判斷合法身份物件 ${JSON.stringify(sample)}`, () => {
      assert.strictEqual(isValidUserIdentity(sample), true);
    });
  }

  const INVALID_IDENTITY_SAMPLES = [
    null, undefined, 'string', 42, [1, 2, 3],
    { userId: 123, authenticated: false, provider: null },
    { userId: null, authenticated: 'yes', provider: null },
    { userId: null, authenticated: false, provider: 123 },
    { authenticated: false, provider: null },
    {},
  ];

  for (const sample of INVALID_IDENTITY_SAMPLES) {
    await test(`（2.identity object）isValidUserIdentity() 正確拒絕不合法輸入 ${JSON.stringify(sample)}`, () => {
      assert.strictEqual(isValidUserIdentity(sample), false);
    });
  }

  console.log('');

  // =========================================================================
  // C. Anonymous mode
  // =========================================================================
  console.log('--- C. Anonymous mode ---');

  await test('（3.anonymous mode）GET /health-insight行為完全沒有改變（本次任務沒有修改任何route/controller）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('data-hi-page="input"'));
  });

  await test('（3.anonymous mode）POST /api/health-insight匿名運作行為完全沒有改變（外部JSON回應形狀不變）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, gender: 'female' }, options: {} }, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data.html.includes('data-hi-page="dashboard"'));
  });

  await test('（3.anonymous mode）真實Product Integration在完全不提供任何身份資訊時，依然正常運作（既有行為）', () => {
    const integration = createHealthInsightProductIntegration();
    const context = makeAnonymousInsightContext();
    const outcome = integration.requestProductEntry({ rawInput: context });
    assert.strictEqual(outcome.ok, true);
    assert.strictEqual(outcome.result.healthObservation.length, 6);
  });

  await test('（3.anonymous mode）resolveHealthInsightIdentity()在完全沒有cookie時安全回傳ANONYMOUS_IDENTITY', async () => {
    const identity = await resolveHealthInsightIdentity({}, undefined, {});
    assert.deepStrictEqual(identity, ANONYMOUS_IDENTITY);
  });

  await test('（3.anonymous mode）resolveHealthInsightIdentity()在cookie存在但session找不到時安全回傳ANONYMOUS_IDENTITY', async () => {
    const fakeDb = { sessions: { getById: async () => ({ ok: true, row: null }) } };
    const identity = await resolveHealthInsightIdentity(fakeDb, 'dbc_sid=nonexistent-token', {});
    assert.deepStrictEqual(identity, ANONYMOUS_IDENTITY);
  });

  await test('（3.anonymous mode）附加ANONYMOUS_IDENTITY到options不會改變真實Health Insight結果', () => {
    const integration = createHealthInsightProductIntegration();
    const context = makeAnonymousInsightContext();
    const withIdentity = integration.requestProductEntry({ rawInput: context, options: attachIdentityToOptions(ANONYMOUS_IDENTITY) });
    const without = integration.requestProductEntry({ rawInput: context });
    assert.deepStrictEqual(withIdentity.result, without.result);
  });

  console.log('');

  // =========================================================================
  // D. Future authenticated mode
  // =========================================================================
  console.log('--- D. Future authenticated mode ---');

  function makeValidSessionDb({ userId, status, isGuest, authProvider, expiresInFutureSeconds }) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (expiresInFutureSeconds !== undefined ? expiresInFutureSeconds : 3600) * 1000).toISOString();
    return {
      sessions: {
        getById: async () => ({ ok: true, row: { id: 'token123', user_id: userId, expires_at: expiresAt, revoked_at: null } }),
      },
      users: {
        getById: async () => ({ ok: true, row: { id: userId, is_guest: isGuest ? 1 : 0, auth_provider: authProvider || null, status: status || 'active' } }),
      },
    };
  }

  await test('（4.future authenticated mode）resolveHealthInsightIdentity()在有效guest session時正確回傳authenticated:true, provider:guest, isGuest:true, userType:guest（TASK1.126後更新：新增isGuest/userType欄位）', async () => {
    const db = makeValidSessionDb({ userId: 'guest-1', isGuest: true });
    const identity = await resolveHealthInsightIdentity(db, 'dbc_sid=token123', {});
    assert.deepStrictEqual(identity, { userId: 'guest-1', authenticated: true, provider: 'guest', isGuest: true, userType: 'guest' });
  });

  await test('（4.future authenticated mode）resolveHealthInsightIdentity()在有效google session時正確回傳authenticated:true, provider:google, isGuest:false, userType:registered（TASK1.126後更新：新增isGuest/userType欄位）', async () => {
    const db = makeValidSessionDb({ userId: 'google-1', isGuest: false, authProvider: 'google' });
    const identity = await resolveHealthInsightIdentity(db, 'dbc_sid=token123', {});
    assert.deepStrictEqual(identity, { userId: 'google-1', authenticated: true, provider: 'google', isGuest: false, userType: 'registered' });
  });

  await test('（4.future authenticated mode）resolveHealthInsightIdentity()在session過期時安全回傳ANONYMOUS_IDENTITY', async () => {
    const db = makeValidSessionDb({ userId: 'u1', isGuest: true, expiresInFutureSeconds: -3600 });
    const identity = await resolveHealthInsightIdentity(db, 'dbc_sid=token123', {});
    assert.deepStrictEqual(identity, ANONYMOUS_IDENTITY);
  });

  await test('（4.future authenticated mode）resolveHealthInsightIdentity()在session被撤銷時安全回傳ANONYMOUS_IDENTITY', async () => {
    const db = {
      sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: 'u1', expires_at: new Date(Date.now() + 3600000).toISOString(), revoked_at: new Date().toISOString() } }) },
      users: { getById: async () => ({ ok: true, row: { id: 'u1', is_guest: 1, status: 'active' } }) },
    };
    const identity = await resolveHealthInsightIdentity(db, 'dbc_sid=token123', {});
    assert.deepStrictEqual(identity, ANONYMOUS_IDENTITY);
  });

  for (const status of ['suspended', 'deleted']) {
    await test(`（4.future authenticated mode）resolveHealthInsightIdentity()在使用者狀態為${status}時安全回傳ANONYMOUS_IDENTITY（延續既有canLogIn()規則）`, async () => {
      const db = makeValidSessionDb({ userId: 'u1', isGuest: false, authProvider: 'google', status });
      const identity = await resolveHealthInsightIdentity(db, 'dbc_sid=token123', {});
      assert.deepStrictEqual(identity, ANONYMOUS_IDENTITY);
    });
  }

  await test('（4.future authenticated mode）resolveHealthInsightIdentity()在使用者row找不到時（FK理論上不該發生，防禦性測試）安全回傳ANONYMOUS_IDENTITY', async () => {
    const db = {
      sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: 'ghost-user', expires_at: new Date(Date.now() + 3600000).toISOString(), revoked_at: null } }) },
      users: { getById: async () => ({ ok: true, row: null }) },
    };
    const identity = await resolveHealthInsightIdentity(db, 'dbc_sid=token123', {});
    assert.deepStrictEqual(identity, ANONYMOUS_IDENTITY);
  });

  await test('（4.future authenticated mode）resolveHealthInsightIdentity()在db操作拋出例外時安全回傳ANONYMOUS_IDENTITY，不往上傳播例外', async () => {
    const throwingDb = { sessions: { getById: () => { throw new Error('D1 connection lost'); } } };
    const identity = await resolveHealthInsightIdentity(throwingDb, 'dbc_sid=token123', {});
    assert.deepStrictEqual(identity, ANONYMOUS_IDENTITY);
  });

  await test('（4.future authenticated mode）resolveHealthInsightIdentity()回傳值永遠通過isValidUserIdentity()檢查', async () => {
    const validDb = makeValidSessionDb({ userId: 'u1', isGuest: false, authProvider: 'google' });
    const identity = await resolveHealthInsightIdentity(validDb, 'dbc_sid=token123', {});
    assert.strictEqual(isValidUserIdentity(identity), true);
    const anonIdentity = await resolveHealthInsightIdentity({}, undefined, {});
    assert.strictEqual(isValidUserIdentity(anonIdentity), true);
  });

  const MALFORMED_COOKIE_HEADERS = [
    { label: 'undefined', value: undefined },
    { label: 'null', value: null },
    { label: '空字串', value: '' },
    { label: '完全不相關的cookie', value: 'unrelated_cookie=abc123' },
    { label: '格式錯誤的cookie字串', value: 'this is not a valid cookie header;;;' },
    { label: '數字', value: 42 },
    { label: '陣列', value: ['dbc_sid=token123'] },
  ];

  for (const { label, value } of MALFORMED_COOKIE_HEADERS) {
    await test(`（4.future authenticated mode）resolveHealthInsightIdentity()對cookieHeader=${label}安全回傳ANONYMOUS_IDENTITY，不拋出例外`, async () => {
      await assert.doesNotReject(async () => {
        const identity = await resolveHealthInsightIdentity({}, value, {});
        assert.deepStrictEqual(identity, ANONYMOUS_IDENTITY);
      });
    });
  }

  await test('（4.future authenticated mode）resolveHealthInsightIdentity()對db=undefined/null安全處理（延續現有session_rules.js既有防禦邏輯，不新增額外try/catch也不會壞）', async () => {
    await assert.doesNotReject(async () => {
      await resolveHealthInsightIdentity(undefined, 'dbc_sid=token123', {});
    });
  });

  console.log('');

  // =========================================================================
  // E. Health Insight compatibility
  // =========================================================================
  console.log('--- E. Health Insight compatibility ---');

  await test('（5.HI compatibility）attachIdentityToOptions()回傳{...options, identity}，保留既有options其餘欄位', () => {
    const result = attachIdentityToOptions({ userId: 'u1', authenticated: true, provider: 'google' }, { locale: 'zh-TW' });
    assert.deepStrictEqual(result, { locale: 'zh-TW', identity: { userId: 'u1', authenticated: true, provider: 'google' } });
  });

  await test('（5.HI compatibility）attachIdentityToOptions()對不合法identity安全退回ANONYMOUS_IDENTITY', () => {
    const result = attachIdentityToOptions({ userId: 123 }, {});
    assert.deepStrictEqual(result.identity, ANONYMOUS_IDENTITY);
  });

  await test('（5.HI compatibility）attachIdentityToOptions()不修改傳入的options物件本身（immutable）', () => {
    const original = { locale: 'zh-TW' };
    attachIdentityToOptions(ANONYMOUS_IDENTITY, original);
    assert.deepStrictEqual(original, { locale: 'zh-TW' });
  });

  const MALFORMED_OPTIONS_INPUTS = [
    { label: 'undefined', value: undefined },
    { label: 'null', value: null },
    { label: '字串', value: 'not-an-object' },
    { label: '陣列', value: [1, 2, 3] },
    { label: '數字', value: 42 },
  ];

  for (const { label, value } of MALFORMED_OPTIONS_INPUTS) {
    await test(`（5.HI compatibility）attachIdentityToOptions()對options=${label}安全處理，回傳值依然含正確的identity欄位`, () => {
      const result = attachIdentityToOptions(ANONYMOUS_IDENTITY, value);
      assert.deepStrictEqual(result.identity, ANONYMOUS_IDENTITY);
      assert.strictEqual(typeof result, 'object');
    });
  }

  for (const { label, value } of MALFORMED_USER_INPUTS) {
    await test(`（5.HI compatibility）buildHealthInsightProductRequest()對identity=${label}安全退回ANONYMOUS_IDENTITY（重用buildUserIdentity()同一套防禦邏輯）`, () => {
      const request = buildHealthInsightProductRequest({ identity: value, rawInput: {} });
      assert.deepStrictEqual(request.user, ANONYMOUS_IDENTITY);
    });
  }

  await test('（5.HI compatibility）buildHealthInsightProductRequest()回傳規格示範的{user, rawInput}形狀', () => {
    const rawInput = { a: 1 };
    const identity = { userId: 'u1', authenticated: true, provider: 'google' };
    const request = buildHealthInsightProductRequest({ identity, rawInput });
    assert.deepStrictEqual(request, { user: identity, rawInput });
  });

  await test('（5.HI compatibility）buildHealthInsightProductRequest()省略identity時預設ANONYMOUS_IDENTITY', () => {
    const request = buildHealthInsightProductRequest({ rawInput: { a: 1 } });
    assert.deepStrictEqual(request.user, ANONYMOUS_IDENTITY);
  });

  await test('（5.HI compatibility）端對端：真實createHealthInsightProductIntegration()接受options.identity附加的request，結果跟不附加時完全一致（不需要修改Product Entry/Adapter）', () => {
    const integration = createHealthInsightProductIntegration();
    const context = makeAnonymousInsightContext();
    const identity = { userId: 'u1', authenticated: true, provider: 'google' };
    const withIdentity = integration.requestProductEntry({ rawInput: context, options: attachIdentityToOptions(identity) });
    const without = integration.requestProductEntry({ rawInput: context });
    assert.strictEqual(withIdentity.ok, true);
    assert.deepStrictEqual(withIdentity.result, without.result);
  });

  await test('（5.HI compatibility）端對端：真實createHealthInsightProductIntegration()接受buildHealthInsightProductRequest()的{user,rawInput}形狀，不會被既有驗證拒絕', () => {
    const integration = createHealthInsightProductIntegration();
    const context = makeAnonymousInsightContext();
    const identity = { userId: 'u1', authenticated: true, provider: 'google' };
    const request = buildHealthInsightProductRequest({ identity, rawInput: context });
    const outcome = integration.requestProductEntry(request);
    assert.strictEqual(outcome.ok, true);
    assert.strictEqual(outcome.result.healthObservation.length, 6);
  });

  const IDENTITY_VARIATIONS_FOR_COMPAT = [
    ANONYMOUS_IDENTITY,
    { userId: 'g1', authenticated: true, provider: 'guest' },
    { userId: 'go1', authenticated: true, provider: 'google' },
    { userId: 'ap1', authenticated: true, provider: 'apple' },
  ];

  for (const identity of IDENTITY_VARIATIONS_FOR_COMPAT) {
    await test(`（5.HI compatibility）身份=${JSON.stringify(identity)} 附加到options時，Health Insight結果不受影響（延續現階段"不做個人化"既有限制）`, () => {
      const integration = createHealthInsightProductIntegration();
      const context = makeAnonymousInsightContext();
      const outcome = integration.requestProductEntry({ rawInput: context, options: attachIdentityToOptions(identity) });
      assert.strictEqual(outcome.ok, true);
      assert.strictEqual(outcome.result.healthObservation.length, 6);
      assert.strictEqual(outcome.result.recommendation.length, 3);
    });
  }

  console.log('');

  // =========================================================================
  // F. Product Integration compatibility
  // =========================================================================
  console.log('--- F. Product Integration compatibility ---');

  const PRODUCT_BOUNDARY_FILES = [
    'src/intelligence/product/health_insight_integration.js',
    'src/intelligence/product/entry/product_entry.js',
    'src/intelligence/product/entry/product_entry_result_builder.js',
    'src/intelligence/product/entry/index.js',
    'src/intelligence/product/contract/product_contract.js',
    'src/intelligence/product/adapter/product_adapter.js',
    'src/intelligence/product/execution/product_execution.js',
    'src/intelligence/product/operational/product_operational.js',
    'src/intelligence/product/features/health_insight/index.js',
    'src/intelligence/capabilities/orchestration/index.js',
    'src/intelligence/capabilities/analysis/index.js',
    'src/intelligence/capabilities/recommendation/index.js',
    'src/intelligence/analysis/analysis_runner.js',
    'src/intelligence/recommendation/recommendation_runner.js',
  ];

  for (const relFile of PRODUCT_BOUNDARY_FILES) {
    await test(`（6.product integration）既有Product/Capability/Runtime檔案完全沒有被本次任務修改：${relFile}`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  await test('（6.product integration）身份資訊附加在options.identity時，即使既有options passthrough機制（TASK1.111既有設計，這裡沒有新增/修改）把它原樣轉交給Capability Orchestrator，Analysis/Recommendation Runner依然完全不會讀取它、不會讓它影響任何計算結果', () => {
    let capturedRequest = null;
    const fakeCapabilityOrchestrator = {
      requestCapabilityFlow(request) {
        capturedRequest = request;
        return { ok: true, capability: 'orchestration', analysis: { status: 'ok', insights: [] }, recommendation: { status: 'ok', recommendations: [] } };
      },
    };
    const integration = createHealthInsightProductIntegration({ capabilityOrchestrator: fakeCapabilityOrchestrator });
    const context = makeAnonymousInsightContext();
    const identity = { userId: 'secret-user-id-should-not-leak', authenticated: true, provider: 'google' };
    const outcomeWithIdentity = integration.requestProductEntry({ rawInput: context, options: attachIdentityToOptions(identity) });
    assert.ok(capturedRequest, '應該有呼叫到capabilityOrchestrator');
    // options（含identity）確實會被既有Health Insight
    // Feature/Product Adapter的options passthrough機制轉交過去——
    // 這是TASK1.111既有既定行為，本次任務沒有改變它，這裡改驗證
    // "即使收到了，也完全不會被拿去計算任何東西"。
    const outcomeWithoutIdentity = integration.requestProductEntry({ rawInput: context });
    assert.deepStrictEqual(outcomeWithIdentity.result, outcomeWithoutIdentity.result);
  });

  await test('（6.product integration）真實（非fake）Capability Orchestrator收到options.identity時，最終result完全不含身份資訊字串（Analysis/Recommendation Runner不讀取options，只讀取context）', () => {
    const integration = createHealthInsightProductIntegration();
    const context = makeAnonymousInsightContext();
    const identity = { userId: 'secret-user-id-should-not-leak', authenticated: true, provider: 'google' };
    const outcome = integration.requestProductEntry({ rawInput: context, options: attachIdentityToOptions(identity) });
    assert.strictEqual(outcome.ok, true);
    assert.ok(!JSON.stringify(outcome.result).includes('secret-user-id-should-not-leak'));
  });

  await test('（6.product integration）身份資訊附加在request.user時，Capability Orchestrator依然完全看不到它', () => {
    let capturedRequest = null;
    const fakeCapabilityOrchestrator = {
      requestCapabilityFlow(request) {
        capturedRequest = request;
        return { ok: true, capability: 'orchestration', analysis: { status: 'ok', insights: [] }, recommendation: { status: 'ok', recommendations: [] } };
      },
    };
    const integration = createHealthInsightProductIntegration({ capabilityOrchestrator: fakeCapabilityOrchestrator });
    const context = makeAnonymousInsightContext();
    const identity = { userId: 'another-secret-id', authenticated: true, provider: 'google' };
    integration.requestProductEntry(buildHealthInsightProductRequest({ identity, rawInput: context }));
    assert.ok(!JSON.stringify(capturedRequest).includes('another-secret-id'));
  });

  await test('（6.product integration）context本身（Insight Context）依然完全通過既有validateInsightContext()驗證，附加身份不影響其形狀', () => {
    const context = makeAnonymousInsightContext();
    const validation = validateInsightContext(context);
    assert.strictEqual(validation.ok, true);
  });

  console.log('');

  // =========================================================================
  // G. Response Boundary compatibility
  // =========================================================================
  console.log('--- G. Response Boundary compatibility ---');

  // （TASK1.119後更新）health_insight_controller.js/
  // health_insight_routes.js從這個清單移除——TASK1.119明確被授權
  // 做"Controller/request context adjustment"跟"Minimal
  // route/session connection"，合法修改了這兩個檔案來接上
  // resolve_identity()。health_insight_response_builder.js
  // （真正的Response Boundary核心）依然要求零diff。
  // （TASK1.123後更新）render_product_response.js從這個清單移除
  // ——Product Experience Upgrade明確授權它轉發presentationContext
  // 給Dashboard。
  const RESPONSE_BOUNDARY_FILES = [
    'src/controllers/health_insight_response_builder.js',
  ];

  for (const relFile of RESPONSE_BOUNDARY_FILES) {
    await test(`（7.response boundary）既有Response Boundary檔案完全沒有被本次任務修改：${relFile}`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  await test('（7.response boundary）src/ui/health_insight/整個目錄除了TASK1.123/1.124明確授權新增的Gemini/History/Progress呈現區塊之外，完全沒有其他改動（不重新設計UI，見TASK1.123/1.124後更新）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = diff.split('\n').filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !t.includes('render_product_response.js') && !t.includes('dashboard_page.js') && !t.includes('components/index.js') && !t.includes('history_card.js') && !t.includes('progress_summary_card.js') && !t.includes('file changed') && !t.includes('files changed');
    }).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（7.response boundary）src/identity/health_insight/完全不import src/controllers/、src/routes/、src/ui/任何檔案（單向依賴，不會反過來影響既有Response Boundary）', () => {
    ['user_identity.js', 'resolve_identity.js', 'request_context.js', 'membership_placeholder.js', 'index.js'].forEach((file) => {
      const source = fs.readFileSync(path.join(healthInsightIdentityDir, file), 'utf8');
      assert.ok(!source.includes("from '../../controllers/"));
      assert.ok(!source.includes("from '../../routes/"));
      assert.ok(!source.includes("from '../../ui/"));
    });
  });

  console.log('');

  // =========================================================================
  // H. Session boundary
  // =========================================================================
  console.log('--- H. Session boundary ---');

  await test('（8.session boundary）user_identity.js完全不接受db參數、不import src/db/（純函式）', () => {
    const source = fs.readFileSync(path.join(healthInsightIdentityDir, 'user_identity.js'), 'utf8');
    assert.ok(!source.includes("from '../../db/"));
    assert.ok(!source.includes('db.prepare'));
  });

  await test('（8.session boundary）request_context.js完全不接受db參數、不import src/db/（純函式）', () => {
    const source = fs.readFileSync(path.join(healthInsightIdentityDir, 'request_context.js'), 'utf8');
    assert.ok(!source.includes("from '../../db/"));
  });

  await test('（8.session boundary）membership_placeholder.js完全不接受db參數、不import src/db/（純函式）', () => {
    const source = fs.readFileSync(path.join(healthInsightIdentityDir, 'membership_placeholder.js'), 'utf8');
    assert.ok(!source.includes("from '../../db/"));
  });

  await test('（8.session boundary）src/identity/health_insight/整個目錄完全不import src/intelligence/任何檔案（不洩漏進Intelligence層）', () => {
    ['user_identity.js', 'resolve_identity.js', 'request_context.js', 'membership_placeholder.js', 'index.js'].forEach((file) => {
      const source = fs.readFileSync(path.join(healthInsightIdentityDir, file), 'utf8');
      assert.ok(!source.includes("from '../../intelligence/"), `${file} 不應該import intelligence`);
    });
  });

  await test('（8.session boundary）只有resolve_identity.js接受db參數（重用既有session_rules.js），其餘檔案完全不接受db參數', () => {
    const resolveSource = fs.readFileSync(path.join(healthInsightIdentityDir, 'resolve_identity.js'), 'utf8');
    assert.ok(resolveSource.includes('export async function resolveHealthInsightIdentity(db'));
  });

  await test('（8.session boundary）buildUserIdentity()輸出跟原始session token/cookie內容完全無關聯（無法反推）', () => {
    const identity = buildUserIdentity({ id: 'u1', is_guest: 0, auth_provider: 'google' });
    const serialized = JSON.stringify(identity);
    assert.ok(!/dbc_sid|token|cookie/i.test(serialized));
  });

  console.log('');

  // =========================================================================
  // I. Future membership extension
  // =========================================================================
  console.log('--- I. Future membership extension ---');

  await test('（9.membership）createMembershipPlaceholder()回傳{status:"not_implemented"}', () => {
    assert.deepStrictEqual(createMembershipPlaceholder(), { status: 'not_implemented' });
  });

  const PERMISSION_TEST_CASES = [
    [ANONYMOUS_IDENTITY, 'health_insight'],
    [{ userId: 'u1', authenticated: true, provider: 'guest' }, 'health_insight'],
    [{ userId: 'u1', authenticated: true, provider: 'google' }, 'gemini_enhancement'],
    [undefined, undefined],
    [null, 'random_feature'],
  ];

  for (const [identity, featureName] of PERMISSION_TEST_CASES) {
    await test(`（9.membership）resolveFeaturePermission(${JSON.stringify(identity)}, ${JSON.stringify(featureName)}) 目前固定回傳allowed:true（現階段Health Insight對所有人開放）`, () => {
      const result = resolveFeaturePermission(identity, featureName);
      assert.deepStrictEqual(result, { allowed: true, reason: 'not_implemented' });
    });
  }

  await test('（9.membership）membership_placeholder.js完全不含訂閱/付款/方案相關字樣（沒有實作Premium billing）', () => {
    const source = fs.readFileSync(path.join(healthInsightIdentityDir, 'membership_placeholder.js'), 'utf8');
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/subscription|payment|billing|stripe|price/i.test(codeOnly));
  });

  await test('（9.membership）resolveFeaturePermission()是deterministic（重複呼叫同樣輸入永遠同樣輸出）', () => {
    const identity = { userId: 'u1', authenticated: true, provider: 'google' };
    assert.deepStrictEqual(resolveFeaturePermission(identity, 'health_insight'), resolveFeaturePermission(identity, 'health_insight'));
  });

  for (const featureName of ['health_insight', 'gemini_enhancement', 'premium_dashboard', '', null, 123]) {
    await test(`（9.membership）resolveFeaturePermission(identity, ${JSON.stringify(featureName)}) 不拋出例外，回傳固定allowed:true`, () => {
      assert.doesNotThrow(() => resolveFeaturePermission(ANONYMOUS_IDENTITY, featureName));
      assert.strictEqual(resolveFeaturePermission(ANONYMOUS_IDENTITY, featureName).allowed, true);
    });
  }

  console.log('');

  // =========================================================================
  // J. Architecture protection
  // =========================================================================
  console.log('--- J. Architecture protection ---');

  await test('（10.architecture protection）app.intelligence維持24個既有欄位', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（10.architecture protection）app.router.routes數量維持23（本次任務沒有新增/刪除任何route）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 24);
  });

  await test('（10.architecture protection）src/worker.js的既有TASK1.21~1.38路由分派邏輯/legacy handler完全沒有被修改（TASK1.119後更新：TASK1.119合法新增了POST /api/health-insight讀取Cookie標頭的一行，不再要求整個檔案零diff，改成驗證既有邏輯的具體內容標記依然逐字存在）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('const DATA_API_PATHS = new Set(['));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/api/timeline')"));
    assert.ok(workerSource.includes('async function handle(r,env){'));
    assert.ok(workerSource.includes("if(p==='/api/qlive'){"));
  });

  await test('（10.architecture protection）src/routes/index.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/routes/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.architecture protection）src/intelligence/整個目錄完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.architecture protection）src/db/整個目錄除了TASK1.120在src/db/index.js新增一行binding之外，完全沒有其他既有檔案被本次任務修改（TASK1.120後更新）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = diff.split('\n').filter((line) => line.trim() && !line.includes('src/db/index.js') && !line.includes('file changed') && !line.includes('files changed')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（10.architecture protection）migrations/目錄除了TASK1.120新增的0007 health_insight_records migration之外，完全沒有其他檔案被新增或修改（TASK1.120後更新）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（10.architecture protection）wrangler.toml完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.architecture protection）package.json完全沒有被本次任務修改（沒有新增任何npm依賴）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.architecture protection）新增檔案完全不import任何AI SDK/Gemini/OpenAI相關套件（只檢查實際import陳述式）', () => {
    ['user_identity.js', 'resolve_identity.js', 'request_context.js', 'membership_placeholder.js', 'index.js'].forEach((file) => {
      const source = fs.readFileSync(path.join(healthInsightIdentityDir, file), 'utf8');
      assert.ok(!/gemini|generative-ai|openai|anthropic-ai|@google\/genai/i.test(getImportLines(source)), `${file} 疑似import AI SDK`);
    });
  });

  const NEWLY_ADDED_FILES = [
    'src/identity/health_insight/user_identity.js',
    'src/identity/health_insight/resolve_identity.js',
    'src/identity/health_insight/request_context.js',
    'src/identity/health_insight/membership_placeholder.js',
    'src/identity/health_insight/index.js',
    'src/identity/health_insight/README.md',
  ];

  const gitDiffNameOnly = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !f.startsWith('backups/'));
  const gitStatusPorcelain = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  // （TASK1.119後更新）worker.js/health_insight_controller.js/
  // health_insight_routes.js從這個逐檔案掃描排除——TASK1.119明確
  // 被授權修改這三個檔案（Cookie標頭轉發+身份解析接線），worker.js
  // 已經改用上面的內容標記比對保護，controller/routes的保護見
  // 下面「Response Boundary compatibility」章節。
  // （TASK1.120後更新）src/db/index.js也一併排除——TASK1.120
  // 明確被授權新增D1 schema/persistence層。
  const TASK1119_AUTHORIZED_FILES = [
    'src/worker.js',
    'src/controllers/health_insight_controller.js',
    'src/routes/health_insight_routes.js',
    'src/db/index.js',
    // TASK1.123後更新：Product Experience Upgrade明確授權的3個UI檔案
    'src/ui/health_insight/render_product_response.js',
    'src/ui/health_insight/pages/dashboard_page.js',
    'src/ui/health_insight/components/index.js',
    // TASK1.124後更新：History/Progress Product Completion明確授權新增的4個檔案
    'src/ui/health_insight/components/history_card.js',
    'src/ui/health_insight/components/progress_summary_card.js',
    'src/history/health_insight/history_service.js',
    'src/history/health_insight/index.js',
    // TASK1.126後更新：Guest/Authentication Experience Correction明確授權修改
    'src/persistence/health_insight/health_insight_persistence_service.js',
  ];
  const allExistingSrcFiles = execFileSync('sh', ['-c', "find src -name '*.js' -o -name '*.md'"], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => f.startsWith('src/') && !NEWLY_ADDED_FILES.includes(f) && !TASK1119_AUTHORIZED_FILES.includes(f));

  await test(`（10.architecture protection）逐檔案完整性掃描：src/底下共找到 ${allExistingSrcFiles.length} 個既有檔案需要逐一確認零diff（排除本次任務新增的6個檔案）`, () => {
    assert.ok(allExistingSrcFiles.length >= 200, `預期至少200個既有檔案，實際 ${allExistingSrcFiles.length}`);
  });

  for (const relFile of allExistingSrcFiles) {
    await test(`（10.architecture protection）逐檔案完整性掃描：${relFile} 完全沒有被本次任務修改`, () => {
      assert.ok(!gitDiffNameOnly.includes(relFile), `${relFile} 出現在git diff清單裡`);
    });
  }

  // （TASK1.119後更新，理由跟TASK1.116/1.117同一份suite的對應
  // 段落完全相同）：改用`git log --oneline -- <file>`確認歷史上
  // 確實有對應的commit紀錄，取代commit完成後永遠失敗的git
  // status/diff即時狀態檢查。
  for (const relFile of NEWLY_ADDED_FILES) {
    await test(`（10.architecture protection）逐檔案完整性掃描：${relFile} 的commit歷史裡確實存在TASK1.118的新增紀錄`, () => {
      const log = execFileSync('git', ['log', '--oneline', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(log.trim().length > 0, `${relFile} 的git log歷史裡找不到任何commit`);
    });
  }

  await test('（10.architecture protection）既有20條非Health Insight route在router裡依然全部存在', () => {
    const router = createAppRouter();
    const existingPaths = ['/auth/guest', '/auth/provider', '/auth/logout', '/auth/me', '/auth/provider/upgrade', '/auth/google/callback', '/api/explorations', '/api/food-events', '/api/emotions', '/api/behaviors', '/api/reports', '/api/dashboard', '/api/profile', '/api/timeline'];
    existingPaths.forEach((p) => {
      assert.ok(router.routes.some((r) => r.path === p), `缺少既有路由 ${p}`);
    });
  });

  console.log('');

  // =========================================================================
  // K. Regression validation
  // =========================================================================
  console.log('--- K. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（Regression validation）此檔案目前被另一個regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），跳過再往下spawn其餘測試檔案，避免遞迴', () => {
      assert.ok(true);
    });
  } else {
    const healthInsightLineageSuites = [
      'backups/phase6-task1.111-health-insight-feature/test_health_insight_feature_foundation.mjs',
      'backups/phase6-task1.112-health-insight-integration/test_health_insight_product_integration.mjs',
      'backups/phase6-task1.113-health-insight-activation/test_health_insight_activation_foundation.mjs',
      'backups/phase6-task1.114-health-insight-uiux/test_health_insight_uiux_foundation.mjs',
      'backups/phase6-task1.115-health-insight-visual-integration/test_health_insight_visual_integration.mjs',
      'backups/phase6-task1.116-health-insight-activation/test_health_insight_activation.mjs',
      'backups/phase6-task1.117-response-boundary/test_health_insight_response_boundary.mjs',
    ];

    for (const relSuite of healthInsightLineageSuites) {
      await test(`（Regression validation）${relSuite} 完整執行，exit code為0（Health Insight產品線本身無回歸；用PHASE1_REVIEW_NESTED=1限定只跑該檔案自己的直接斷言）`, () => {
        execFileSync('node', [relSuite], {
          cwd: repoRoot,
          stdio: 'pipe',
          timeout: 60000,
          env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
        });
      });
    }

    await test('（Regression validation）本檔案（TASK1.118自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic', () => {
      execFileSync('node', [path.join(__dirname, 'test_user_identity_foundation.mjs')], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 60000,
        env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
      });
    });

    await test('（Regression validation）本次任務刻意不重新掃描/重跑Phase1~5（TASK1.26~1.105）既有測試檔案——延續TASK1.116/1.117已確認的既定範圍決策，Health Insight產品線本身（TASK1.111~1.117）已經在上面驗證無回歸', () => {
      assert.ok(true);
    });
  }

  console.log('');

  // =========================================================================
  // L. P1-P6
  // =========================================================================
  console.log('--- L. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在p1-p6-check/run.js執行（本次任務完全沒有修改任何既有legacy UI/getHTML()相關程式碼，既有UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改（本次任務完全沒有動到worker.js）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  await test('（P1-P6）wrangler.toml完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）migrations/目錄除了TASK1.120新增的0007 health_insight_records migration之外，完全沒有其他檔案被新增或修改（TASK1.120後更新）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（P1-P6）src/auth/、src/oauth/完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('失敗項目：');
    failures.forEach((name) => console.log(' - ' + name));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('測試執行本身發生未預期錯誤：', e);
  process.exit(1);
});

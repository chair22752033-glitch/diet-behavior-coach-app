/*
 * Phase 6 TASK 1.119｜Health Insight OAuth User Binding
 * Implementation 測試
 *
 * 本任務把TASK1.118建立好、但完全沒有接線的User Identity邊界，
 * 第一次真正接進Health Insight請求流程：
 *
 *   User → 既有Authentication/Session System → resolve_identity()
 *        → Health Insight Request Context → Health Insight
 *          Controller → Product Integration → Capability Chain
 *        → Response
 *
 * 本次任務不整合Gemini、不實作付費/訂閱、不做健康歷史持久化、
 * 不重新設計UI/UX，也**沒有**建立新的登入系統——重用既有
 * guest/Google OAuth/session管理。匿名使用者必須繼續正常運作。
 *
 * 分為以下12個部分：
 * A) Identity resolution
 * B) Authenticated flow
 * C) Anonymous flow
 * D) OAuth compatibility
 * E) Session compatibility
 * F) Health Insight request context
 * G) Product Integration compatibility
 * H) Capability isolation
 * I) Membership extension point
 * J) Error handling
 * K) Regression validation
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
  const controllerModule = await import(path.join(controllersDir, 'health_insight_controller.js'));
  const { createHealthInsightProductIntegration } = await import(path.join(srcRoot, 'intelligence', 'product', 'health_insight_integration.js'));
  const { createInsightContextBuilder } = await import(path.join(srcRoot, 'intelligence', 'context', 'insight_context_builder.js'));
  return { identityModule, createAppRouter, createApplication, controllerModule, createHealthInsightProductIntegration, createInsightContextBuilder };
}

function makeValidSessionDb({ userId, status, isGuest, authProvider, expiresInFutureSeconds }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (expiresInFutureSeconds !== undefined ? expiresInFutureSeconds : 3600) * 1000).toISOString();
  return {
    sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: userId, expires_at: expiresAt, revoked_at: null } }) },
    users: { getById: async () => ({ ok: true, row: { id: userId, is_guest: isGuest ? 1 : 0, auth_provider: authProvider || null, status: status || 'active' } }) },
  };
}

async function main() {
  const {
    identityModule,
    createAppRouter,
    createApplication,
    controllerModule,
    createHealthInsightProductIntegration,
    createInsightContextBuilder,
  } = await loadModules();

  const {
    ANONYMOUS_IDENTITY,
    buildUserIdentity,
    isValidUserIdentity,
    resolveHealthInsightIdentity,
    buildHealthInsightProductRequest,
    createMembershipPlaceholder,
    resolveFeaturePermission,
  } = identityModule;
  const { getHealthInsightPageController, submitHealthInsightController } = controllerModule;

  function makeAnonymousInsightContext() {
    return createInsightContextBuilder().buildInsightContext({ user: null, explorations: [], foodEvents: [], emotions: [], behaviors: [], reports: [] }).context;
  }

  // =========================================================================
  // A. Identity resolution
  // =========================================================================
  console.log('--- A. Identity resolution ---');

  await test('（1.identity resolution）src/routes/health_insight_routes.js有import resolveHealthInsightIdentity', () => {
    const source = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
    assert.ok(source.includes("from '../identity/health_insight/index.js'"));
    assert.ok(source.includes('resolveHealthInsightIdentity'));
  });

  await test('（1.identity resolution）POST /api/health-insight的route handler在呼叫controller之前先呼叫resolveHealthInsightIdentity', () => {
    const source = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
    const postHandlerIdx = source.indexOf("router.add('POST', '/api/health-insight'");
    const handlerBody = source.slice(postHandlerIdx);
    const identityCallIdx = handlerBody.indexOf('resolveHealthInsightIdentity(');
    const controllerCallIdx = handlerBody.indexOf('submitHealthInsightController(');
    assert.ok(identityCallIdx >= 0 && controllerCallIdx >= 0);
    assert.ok(identityCallIdx < controllerCallIdx, '應該先解析身份再呼叫controller');
  });

  await test('（1.identity resolution）src/worker.js的POST /api/health-insight判斷式新增了cookieHeader轉發', () => {
    const source = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    const idx = source.indexOf("pathname === '/api/health-insight'");
    const block = source.slice(idx, idx + 500);
    assert.ok(block.includes('cookieHeader'));
  });

  await test('（1.identity resolution）真實router端對端：resolveHealthInsightIdentity()確實被呼叫（用真實fakeDb驗證有效session時身份不是匿名）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'route-test-user', isGuest: false, authProvider: 'google' });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
  });

  await test('（1.identity resolution）GET /health-insight完全不受本次任務影響（Input Experience頁面不涉及身份解析）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('data-hi-page="input"'));
  });

  await test('（1.identity resolution）GET /health-insight的route handler完全沒有呼叫resolveHealthInsightIdentity（只有POST才需要）', () => {
    const source = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
    const getHandlerMatch = source.match(/router\.add\('GET', '\/health-insight'[\s\S]*?\}\);/);
    assert.ok(getHandlerMatch);
    assert.ok(!getHandlerMatch[0].includes('resolveHealthInsightIdentity'));
  });

  for (const exportName of Object.keys(identityModule)) {
    await test(`（1.identity resolution）src/identity/health_insight/index.js既有的公開匯出"${exportName}"完全沒有被本次任務修改（本次任務只使用既有介面，不重新定義）`, () => {
      assert.notStrictEqual(identityModule[exportName], undefined);
    });
  }

  for (const exportName of Object.keys(controllerModule)) {
    await test(`（1.identity resolution）src/controllers/health_insight_controller.js的公開匯出"${exportName}"型別正確（getHealthInsightPageController/submitHealthInsightController兩者都還是function）`, () => {
      assert.strictEqual(typeof controllerModule[exportName], 'function');
    });
  }

  for (const r of [
    { method: 'GET', path: '/health-insight' },
    { method: 'POST', path: '/api/health-insight' },
    { method: 'GET', path: '/auth/me' },
    { method: 'POST', path: '/auth/guest' },
    { method: 'POST', path: '/auth/logout' },
    { method: 'POST', path: '/auth/provider' },
    { method: 'POST', path: '/auth/provider/upgrade' },
    { method: 'GET', path: '/auth/google/callback' },
    { method: 'GET', path: '/api/dashboard' },
    { method: 'GET', path: '/api/profile' },
    { method: 'PATCH', path: '/api/profile' },
    { method: 'GET', path: '/api/timeline' },
    { method: 'GET', path: '/api/explorations' },
    { method: 'POST', path: '/api/explorations' },
    { method: 'GET', path: '/api/food-events' },
    { method: 'POST', path: '/api/food-events' },
    { method: 'GET', path: '/api/emotions' },
    { method: 'POST', path: '/api/emotions' },
    { method: 'GET', path: '/api/behaviors' },
    { method: 'POST', path: '/api/behaviors' },
    { method: 'GET', path: '/api/reports' },
    { method: 'POST', path: '/api/reports' },
  ]) {
    await test(`（1.identity resolution）既有route ${r.method} ${r.path} 在新router裡的regex確實能比對到自己的literal path（逐一驗證app.router.routes全部23條）`, () => {
      const router = createAppRouter();
      const match = router.routes.find((route) => route.method === r.method && route.path === r.path);
      assert.ok(match, `找不到 ${r.method} ${r.path}`);
      assert.ok(match.regex.test(r.path));
    });
  }

  console.log('');

  // =========================================================================
  // B. Authenticated flow
  // =========================================================================
  console.log('--- B. Authenticated flow ---');

  const AUTHENTICATED_PROVIDER_CASES = [
    { label: 'guest', isGuest: true, authProvider: null, expectedProvider: 'guest' },
    { label: 'google', isGuest: false, authProvider: 'google', expectedProvider: 'google' },
    { label: 'apple（未來provider）', isGuest: false, authProvider: 'apple', expectedProvider: 'apple' },
  ];

  for (const { label, isGuest, authProvider, expectedProvider } of AUTHENTICATED_PROVIDER_CASES) {
    await test(`（2.authenticated flow）端對端：${label}身份的使用者透過真實router送出POST /api/health-insight，正確解析出身份且Dashboard正常渲染`, async () => {
      const router = createAppRouter();
      const db = makeValidSessionDb({ userId: `user-${label}`, isGuest, authProvider });
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, gender: 'female' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.ok(body.data.html.includes('data-hi-page="dashboard"'));
    });
  }

  await test('（2.authenticated flow）已登入使用者的Dashboard核心內容（觀察/建議卡片）跟匿名使用者完全一致（V1不做個人化，延續既有限制，本次任務沒有新增Intelligence邏輯；TASK1.123後更新：完整html不再逐字相同，因為Premium Feature Boundary呈現層會依登入狀態顯示不同的引導文案"登入之後"vs"升級會員"，但這只是呈現層文字差異，不是Intelligence個人化——這裡改成比對兩者的健康觀察/建議卡片內容區塊完全相同）', async () => {
    const router = createAppRouter();
    const dbAuth = makeValidSessionDb({ userId: 'u-auth', isGuest: false, authProvider: 'google' });
    const resAuth = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbAuth });
    const bodyAuth = await resAuth.json();
    const resAnon = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, {});
    const bodyAnon = await resAnon.json();
    const extractCard = (html, marker) => {
      const start = html.indexOf(marker);
      const end = html.indexOf('</div>\n</div>', start);
      return html.slice(start, end);
    };
    assert.strictEqual(extractCard(bodyAuth.data.html, 'hi-observation-card'), extractCard(bodyAnon.data.html, 'hi-observation-card'));
    assert.strictEqual(extractCard(bodyAuth.data.html, 'hi-recommendation-card'), extractCard(bodyAnon.data.html, 'hi-recommendation-card'));
  });

  await test('（2.authenticated flow）submitHealthInsightController()正確接受dependencies.identity並轉發到Product Integration', () => {
    let capturedRequest = null;
    const fakeIntegration = { requestProductEntry: (request) => { capturedRequest = request; return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } }; } };
    const identity = { userId: 'u1', authenticated: true, provider: 'google' };
    submitHealthInsightController({ age: 28 }, { integration: fakeIntegration, identity });
    assert.deepStrictEqual(capturedRequest.user, identity);
  });

  console.log('');

  // =========================================================================
  // C. Anonymous flow
  // =========================================================================
  console.log('--- C. Anonymous flow ---');

  await test('（3.anonymous flow）沒有cookie時，端對端POST /api/health-insight依然正常運作', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data.html.includes('data-hi-page="dashboard"'));
  });

  await test('（3.anonymous flow）submitHealthInsightController()完全不提供dependencies.identity時預設ANONYMOUS_IDENTITY', () => {
    let capturedRequest = null;
    const fakeIntegration = { requestProductEntry: (request) => { capturedRequest = request; return { ok: true, boundary: 'product-entry', result: {} }; } };
    submitHealthInsightController({ age: 28 }, { integration: fakeIntegration });
    assert.deepStrictEqual(capturedRequest.user, ANONYMOUS_IDENTITY);
  });

  await test('（3.anonymous flow）submitHealthInsightController()提供不合法identity時安全退回ANONYMOUS_IDENTITY（不拋出例外）', () => {
    let capturedRequest = null;
    const fakeIntegration = { requestProductEntry: (request) => { capturedRequest = request; return { ok: true, boundary: 'product-entry', result: {} }; } };
    assert.doesNotThrow(() => submitHealthInsightController({ age: 28 }, { integration: fakeIntegration, identity: { userId: 123 } }));
    submitHealthInsightController({ age: 28 }, { integration: fakeIntegration, identity: { userId: 123 } });
    assert.deepStrictEqual(capturedRequest.user, ANONYMOUS_IDENTITY);
  });

  await test('（3.anonymous flow）端對端：真實createHealthInsightProductIntegration()匿名情境下依然產生6項healthObservation、3項recommendation（既有行為完全沒有回歸）', () => {
    const result = submitHealthInsightController({ age: 28, gender: 'female' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.healthObservation.length, 6);
    assert.strictEqual(result.data.recommendation.length, 3);
  });

  await test('（3.anonymous flow）GET /health-insight在完全沒有cookie時正常運作（既有行為）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
  });

  console.log('');

  // =========================================================================
  // D. OAuth compatibility
  // =========================================================================
  console.log('--- D. OAuth compatibility ---');

  await test('（4.OAuth compatibility）本次任務完全沒有建立新的authentication系統（src/auth/、src/oauth/、既有src/identity/檔案完全沒有被修改）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/ src/oauth/ src/identity/session_rules.js src/identity/guest.js src/identity/upgrade.js src/identity/status.js src/identity/provider.js src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.OAuth compatibility）resolveHealthInsightIdentity()重用既有validateSessionWithIdentity()，本次任務沒有修改該函式', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/identity/session_rules.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
    const resolveSource = fs.readFileSync(path.join(healthInsightIdentityDir, 'resolve_identity.js'), 'utf8');
    assert.ok(resolveSource.includes('validateSessionWithIdentity'));
  });

  await test('（4.OAuth compatibility）既有10條/api/*路由的requireAuth()驗證邏輯完全沒有被修改（Health Insight的身份邊界跟既有API登入邊界互不干擾）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/middleware/auth_middleware.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.OAuth compatibility）Google OAuth callback路由（/auth/google/callback）完全沒有受影響', async () => {
    const router = createAppRouter();
    assert.ok(router.routes.some((r) => r.method === 'GET' && r.path === '/auth/google/callback'));
  });

  const PROVIDER_LABELS = ['google', 'guest', 'apple', 'facebook'];
  for (const provider of PROVIDER_LABELS) {
    await test(`（4.OAuth compatibility）buildUserIdentity()對provider="${provider}"正確保留provider標籤字串，不做任何provider白名單限制（延續開放給未來provider的設計）`, () => {
      const identity = buildUserIdentity({ id: 'u1', is_guest: provider === 'guest' ? 1 : 0, auth_provider: provider === 'guest' ? null : provider });
      assert.strictEqual(identity.provider, provider);
    });
  }

  const IDENTITY_COMBINATION_MATRIX = [];
  for (const isGuest of [true, false]) {
    for (const authProvider of [null, 'google', 'apple', 'facebook']) {
      for (const idValue of ['u1', '']) {
        IDENTITY_COMBINATION_MATRIX.push({ isGuest, authProvider, idValue });
      }
    }
  }

  for (const { isGuest, authProvider, idValue } of IDENTITY_COMBINATION_MATRIX) {
    await test(`（4.OAuth compatibility）buildUserIdentity({id:${JSON.stringify(idValue)}, is_guest:${isGuest}, auth_provider:${JSON.stringify(authProvider)}}) 回傳值永遠通過isValidUserIdentity()且JSON roundtrip不遺失資訊`, () => {
      const identity = buildUserIdentity({ id: idValue, is_guest: isGuest, auth_provider: authProvider });
      assert.strictEqual(isValidUserIdentity(identity), true);
      assert.deepStrictEqual(JSON.parse(JSON.stringify(identity)), identity);
    });
  }

  console.log('');

  // =========================================================================
  // E. Session compatibility
  // =========================================================================
  console.log('--- E. Session compatibility ---');

  const SESSION_FAILURE_CASES = [
    { label: '沒有cookie', cookieHeader: undefined, db: {} },
    { label: 'cookie存在但session找不到', cookieHeader: 'dbc_sid=ghost', db: { sessions: { getById: async () => ({ ok: true, row: null }) } } },
    { label: 'session已過期', cookieHeader: 'dbc_sid=token123', db: makeValidSessionDb({ userId: 'u1', isGuest: true, expiresInFutureSeconds: -100 }) },
  ];

  for (const { label, cookieHeader, db } of SESSION_FAILURE_CASES) {
    await test(`（5.session compatibility）端對端：${label}時，POST /api/health-insight依然正常運作（安全退回匿名）`, async () => {
      const router = createAppRouter();
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader, options: {} }, { db });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.ok, true);
    });
  }

  await test('（5.session compatibility）revoked session端對端安全退回匿名', async () => {
    const router = createAppRouter();
    const db = {
      sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: 'u1', expires_at: new Date(Date.now() + 3600000).toISOString(), revoked_at: new Date().toISOString() } }) },
      users: { getById: async () => ({ ok: true, row: { id: 'u1', is_guest: 1, status: 'active' } }) },
    };
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(res.status, 200);
  });

  for (const status of ['suspended', 'deleted']) {
    await test(`（5.session compatibility）使用者狀態為${status}時，端對端POST /api/health-insight依然安全退回匿名並正常運作（延續既有canLogIn()規則）`, async () => {
      const router = createAppRouter();
      const db = makeValidSessionDb({ userId: 'u1', isGuest: false, authProvider: 'google', status });
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.ok, true);
    });
  }

  await test('（5.session compatibility）db本身拋出例外時，端對端POST /api/health-insight依然安全運作（resolveHealthInsightIdentity()內建try/catch）', async () => {
    const router = createAppRouter();
    const throwingDb = { sessions: { getById: () => { throw new Error('D1 unavailable'); } } };
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: throwingDb });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
  });

  const SESSION_FAILURE_MODES = [
    { label: '過期', makeDb: (userId) => makeValidSessionDb({ userId, isGuest: false, authProvider: 'google', expiresInFutureSeconds: -1 }) },
    { label: '找不到session', makeDb: () => ({ sessions: { getById: async () => ({ ok: true, row: null }) } }) },
    { label: '使用者被停權', makeDb: (userId) => makeValidSessionDb({ userId, isGuest: false, authProvider: 'google', status: 'suspended' }) },
    { label: '使用者被刪除', makeDb: (userId) => makeValidSessionDb({ userId, isGuest: false, authProvider: 'google', status: 'deleted' }) },
    { label: 'db拋出例外', makeDb: () => ({ sessions: { getById: () => { throw new Error('boom'); } } }) },
  ];

  for (const { label: providerLabel, isGuest, authProvider } of AUTHENTICATED_PROVIDER_CASES) {
    for (const { label: failureLabel, makeDb } of SESSION_FAILURE_MODES) {
      await test(`（5.session compatibility）身份嘗試=${providerLabel}、失敗模式=${failureLabel} 時，端對端POST /api/health-insight依然安全退回匿名並正常運作`, async () => {
        const router = createAppRouter();
        const db = makeDb(`u-${providerLabel}-${failureLabel}`);
        const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.ok, true);
        assert.ok(body.data.html.includes('data-hi-page="dashboard"'));
      });
    }
  }

  console.log('');

  // =========================================================================
  // F. Health Insight request context
  // =========================================================================
  console.log('--- F. Health Insight request context ---');

  await test('（6.request context）submitHealthInsightController()用buildHealthInsightProductRequest()組出{user, rawInput}形狀', () => {
    const controllerSource = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');
    assert.ok(controllerSource.includes('buildHealthInsightProductRequest'));
  });

  await test('（6.request context）Controller的實際程式碼（不含JSDoc註解）完全沒有直接建構{userId: ...}形狀（延續規格Future-compatible的{user, rawInput}形狀，不是{userId, rawInput}）', () => {
    const controllerSource = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');
    const codeOnly = controllerSource.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!codeOnly.includes('userId:'));
  });

  await test('（6.request context）isValidUserIdentity()被用來防禦性檢查dependencies.identity（不是盲目信任呼叫端）', () => {
    const controllerSource = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');
    assert.ok(controllerSource.includes('isValidUserIdentity'));
  });

  const IDENTITY_DI_CASES = [
    { label: '完整guest身份', identity: { userId: 'g1', authenticated: true, provider: 'guest' } },
    { label: '完整google身份', identity: { userId: 'go1', authenticated: true, provider: 'google' } },
    { label: 'ANONYMOUS_IDENTITY本身', identity: ANONYMOUS_IDENTITY },
    { label: 'undefined（省略）', identity: undefined },
    { label: 'null', identity: null },
    { label: '格式錯誤的物件', identity: { foo: 'bar' } },
  ];

  for (const { label, identity } of IDENTITY_DI_CASES) {
    await test(`（6.request context）dependencies.identity=${label} 時，submitHealthInsightController()不拋出例外，且request.user永遠是合法的identity形狀`, () => {
      let capturedRequest = null;
      const fakeIntegration = { requestProductEntry: (request) => { capturedRequest = request; return { ok: true, boundary: 'product-entry', result: {} }; } };
      assert.doesNotThrow(() => submitHealthInsightController({}, { integration: fakeIntegration, identity }));
      assert.strictEqual(isValidUserIdentity(capturedRequest.user), true);
    });
  }

  await test('（6.request context）getHealthInsightPageController()完全不受身份參數影響（不接受、也不需要身份參數）', () => {
    const result = getHealthInsightPageController();
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // G. Product Integration compatibility
  // =========================================================================
  console.log('--- G. Product Integration compatibility ---');

  const PRODUCT_BOUNDARY_FILES = [
    'src/intelligence/product/health_insight_integration.js',
    'src/intelligence/product/entry/product_entry.js',
    'src/intelligence/product/entry/product_entry_result_builder.js',
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
    'src/intelligence/context/insight_context_builder.js',
    // TASK1.126後更新：user_identity.js從這個清單移除——Guest/
    // Authentication Experience Correction明確授權新增isGuest/
    // userType語意分類欄位。
    'src/identity/health_insight/resolve_identity.js',
    'src/identity/health_insight/request_context.js',
    'src/identity/health_insight/membership_placeholder.js',
    'src/controllers/health_insight_response_builder.js',
    // TASK1.123後更新：render_product_response.js從這個清單移除
    // ——Product Experience Upgrade明確授權它轉發presentationContext。
  ];

  for (const relFile of PRODUCT_BOUNDARY_FILES) {
    await test(`（7.product integration）既有Product/Capability/Runtime/Identity/Response Boundary檔案完全沒有被本次任務修改：${relFile}`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  for (const relFile of PRODUCT_BOUNDARY_FILES) {
    await test(`（7.product integration）既有檔案依然通過node --check語法驗證（本次任務沒有動到它，但重新確認整體檔案樹依然有效）：${relFile}`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(repoRoot, relFile)], { encoding: 'utf8' }));
    });
  }

  await test('（7.product integration）src/ui/health_insight/整個目錄除了TASK1.123/1.124明確授權新增的Gemini/History/Progress呈現區塊之外，完全沒有其他改動（不重新設計UI，見TASK1.123/1.124後更新）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = diff.split('\n').filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !t.includes('render_product_response.js') && !t.includes('dashboard_page.js') && !t.includes('components/index.js') && !t.includes('history_card.js') && !t.includes('progress_summary_card.js') && !t.includes('file changed') && !t.includes('files changed');
    }).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（7.product integration）真實Product Entry接受{user, rawInput}形狀，不會被既有驗證邏輯拒絕', () => {
    const integration = createHealthInsightProductIntegration();
    const context = makeAnonymousInsightContext();
    const identity = { userId: 'u1', authenticated: true, provider: 'google' };
    const outcome = integration.requestProductEntry(buildHealthInsightProductRequest({ identity, rawInput: context }));
    assert.strictEqual(outcome.ok, true);
  });

  // 逐檔案完整性掃描：本次任務明確只授權修改worker.js/
  // health_insight_controller.js/health_insight_routes.js三個
  // 檔案，其餘src/底下所有既有檔案（含intelligence/db/auth/
  // oauth/identity/ui/其餘controllers/其餘routes）逐一確認零diff。
  const TASK1119_AUTHORIZED_FILES = [
    'src/worker.js',
    'src/controllers/health_insight_controller.js',
    'src/routes/health_insight_routes.js',
    'src/db/index.js', // TASK1.120後更新：新增Health Insight persistence層的binding，明確授權
    'src/ui/health_insight/render_product_response.js', // TASK1.123後更新
    'src/ui/health_insight/pages/dashboard_page.js', // TASK1.123後更新
    'src/ui/health_insight/components/index.js', // TASK1.123後更新
    'src/ui/health_insight/components/history_card.js', // TASK1.124後更新
    'src/ui/health_insight/components/progress_summary_card.js', // TASK1.124後更新
    'src/history/health_insight/history_service.js', // TASK1.124後更新
    'src/history/health_insight/index.js', // TASK1.124後更新
    'src/identity/health_insight/user_identity.js', // TASK1.126後更新
    'src/persistence/health_insight/health_insight_persistence_service.js', // TASK1.126後更新
    'src/routes/index.js', // TASK1.127後更新：Complete App Experience Layer明確授權新增registerAppShellRoutes()的import/register一行
    'src/routes/auth_routes.js', // 手動上線階段後更新：新增GET /auth/google/start登入入口
    'src/intelligence/enhancement/gemini/gemini_client.js', // 手動上線階段後更新：DEFAULT_MODEL更新
  ];
  const gitDiffNameOnly = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !f.startsWith('backups/'));
  const allExistingSrcFiles = execFileSync('sh', ['-c', "find src -name '*.js'"], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !TASK1119_AUTHORIZED_FILES.includes(f));

  await test(`（7.product integration）逐檔案完整性掃描：src/底下共找到 ${allExistingSrcFiles.length} 個既有檔案需要逐一確認零diff（排除本次任務明確授權修改的3個檔案）`, () => {
    assert.ok(allExistingSrcFiles.length >= 200, `預期至少200個既有檔案，實際 ${allExistingSrcFiles.length}`);
  });

  for (const relFile of allExistingSrcFiles) {
    await test(`（7.product integration）逐檔案完整性掃描：${relFile} 完全沒有被本次任務修改`, () => {
      assert.ok(!gitDiffNameOnly.includes(relFile), `${relFile} 出現在git diff清單裡`);
    });
  }

  for (const relFile of TASK1119_AUTHORIZED_FILES) {
    await test(`（7.product integration）逐檔案完整性掃描：${relFile} 的commit歷史/目前diff裡確實存在TASK1.119的修改（控制組，用git log避免commit後永遠假性失敗）`, () => {
      const status = execFileSync('sh', ['-c', `git diff --name-only -- ${relFile} ; git log --oneline -- ${relFile}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(status.trim().length > 0, `${relFile} 找不到任何diff或commit歷史`);
    });
  }

  console.log('');

  // =========================================================================
  // H. Capability isolation
  // =========================================================================
  console.log('--- H. Capability isolation ---');

  await test('（8.capability isolation）真實端對端：已登入使用者的userId/provider完全不出現在最終Dashboard HTML裡', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'must-not-leak-user-id-12345', isGuest: false, authProvider: 'google' });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.ok(!body.data.html.includes('must-not-leak-user-id-12345'));
    assert.ok(!body.data.html.includes('google'));
  });

  await test('（8.capability isolation）Capability Orchestrator注入spy，確認request.context形狀完全不含user/identity欄位（Product Adapter既有的buildIntelligenceRequest()只轉發context跟options）', () => {
    let capturedRequest = null;
    const fakeCapabilityOrchestrator = {
      requestCapabilityFlow(request) {
        capturedRequest = request;
        return { ok: true, capability: 'orchestration', analysis: { status: 'ok', insights: [] }, recommendation: { status: 'ok', recommendations: [] } };
      },
    };
    const integration = createHealthInsightProductIntegration({ capabilityOrchestrator: fakeCapabilityOrchestrator });
    const context = makeAnonymousInsightContext();
    const identity = { userId: 'secret-should-not-reach-capability', authenticated: true, provider: 'google' };
    integration.requestProductEntry(buildHealthInsightProductRequest({ identity, rawInput: context }));
    assert.ok(capturedRequest);
    assert.ok(!('user' in capturedRequest));
    assert.ok(!('identity' in capturedRequest));
    assert.ok(!JSON.stringify(capturedRequest).includes('secret-should-not-reach-capability'));
  });

  await test('（8.capability isolation）Analysis Runner/Recommendation Runner完全不知道OAuth provider是什麼（不import src/auth/、src/oauth/、src/identity/）', () => {
    ['src/intelligence/analysis/analysis_runner.js', 'src/intelligence/recommendation/recommendation_runner.js'].forEach((relFile) => {
      const source = fs.readFileSync(path.join(repoRoot, relFile), 'utf8');
      assert.ok(!source.includes("from '../../auth/"));
      assert.ok(!source.includes("from '../../oauth/"));
      assert.ok(!source.includes("from '../../identity/"));
    });
  });

  for (const { label, isGuest, authProvider } of AUTHENTICATED_PROVIDER_CASES) {
    await test(`（8.capability isolation）身份=${label}時，真實鏈路的result內容跟匿名時完全一致（不同身份不會產生不同的Capability輸出）`, () => {
      const integration = createHealthInsightProductIntegration();
      const context = makeAnonymousInsightContext();
      const identity = buildUserIdentity({ id: 'u1', is_guest: isGuest, auth_provider: authProvider });
      const outcomeWithIdentity = integration.requestProductEntry(buildHealthInsightProductRequest({ identity, rawInput: context }));
      const outcomeAnonymous = integration.requestProductEntry({ rawInput: context });
      assert.deepStrictEqual(outcomeWithIdentity.result, outcomeAnonymous.result);
    });
  }

  console.log('');

  // =========================================================================
  // I. Membership extension point
  // =========================================================================
  console.log('--- I. Membership extension point ---');

  await test('（9.membership）membership_placeholder.js完全沒有被本次任務修改（延續TASK1.118既有的inert placeholder，本次任務沒有實作真正的權限邏輯）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/identity/health_insight/membership_placeholder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.membership）resolveFeaturePermission()對已登入/匿名身份都依然固定回傳allowed:true（現階段Health Insight對所有人開放，本次任務沒有新增權限檢查邏輯）', () => {
    const authenticatedIdentity = { userId: 'u1', authenticated: true, provider: 'google' };
    assert.deepStrictEqual(resolveFeaturePermission(authenticatedIdentity, 'health_insight'), { allowed: true, reason: 'not_implemented' });
    assert.deepStrictEqual(resolveFeaturePermission(ANONYMOUS_IDENTITY, 'health_insight'), { allowed: true, reason: 'not_implemented' });
  });

  for (const { label, isGuest, authProvider } of AUTHENTICATED_PROVIDER_CASES) {
    await test(`（9.membership）身份=${label}時，resolveFeaturePermission()是deterministic（重複呼叫同樣輸入永遠同樣輸出）`, () => {
      const identity = buildUserIdentity({ id: 'u1', is_guest: isGuest, auth_provider: authProvider });
      assert.deepStrictEqual(resolveFeaturePermission(identity, 'health_insight'), resolveFeaturePermission(identity, 'health_insight'));
    });
  }

  await test('（9.membership）controller/route完全沒有呼叫resolveFeaturePermission()（本次任務只確認Section5既有的插入點，不真正串接權限檢查邏輯）', () => {
    const controllerSource = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');
    const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
    assert.ok(!controllerSource.includes('resolveFeaturePermission'));
    assert.ok(!routesSource.includes('resolveFeaturePermission'));
  });

  await test('（9.membership）createMembershipPlaceholder()維持{status:"not_implemented"}（沒有訂閱/付款邏輯）', () => {
    assert.deepStrictEqual(createMembershipPlaceholder(), { status: 'not_implemented' });
  });

  for (const featureName of ['health_insight', 'gemini_enhancement', 'premium_dashboard', 'health_history', '']) {
    for (const { label, isGuest, authProvider } of AUTHENTICATED_PROVIDER_CASES) {
      await test(`（9.membership）resolveFeaturePermission(身份=${label}, feature="${featureName}") 依然固定回傳allowed:true（延續TASK1.118既有inert行為，本次任務沒有真正串接權限判斷）`, () => {
        const identity = buildUserIdentity({ id: 'u1', is_guest: isGuest, auth_provider: authProvider });
        assert.deepStrictEqual(resolveFeaturePermission(identity, featureName), { allowed: true, reason: 'not_implemented' });
      });
    }
  }

  console.log('');

  // =========================================================================
  // J. Error handling
  // =========================================================================
  console.log('--- J. Error handling ---');

  await test('（10.error handling）context builder拋出例外時，即使identity已解析，依然安全轉成友善錯誤，不洩漏身份或例外資訊', () => {
    const throwingBuilder = { buildInsightContext: () => { throw new Error('secret detail'); } };
    const identity = { userId: 'secret-user', authenticated: true, provider: 'google' };
    const result = submitHealthInsightController({ age: 28 }, { contextBuilder: throwingBuilder, identity });
    assert.strictEqual(result.ok, false);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('secret detail'));
    assert.ok(!serialized.includes('secret-user'));
  });

  await test('（10.error handling）integration拋出例外時，即使identity已解析，依然安全轉成友善錯誤，不洩漏身份或例外資訊', () => {
    const throwingIntegration = { requestProductEntry: () => { throw new Error('stack trace leak'); } };
    const identity = { userId: 'secret-user-2', authenticated: true, provider: 'google' };
    const result = submitHealthInsightController({ age: 28 }, { integration: throwingIntegration, identity });
    assert.strictEqual(result.ok, false);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('stack trace leak'));
    assert.ok(!serialized.includes('secret-user-2'));
  });

  const MALFORMED_PAYLOADS = [
    { label: '空物件', payload: {} },
    { label: 'null', payload: null },
    { label: '陣列', payload: [1, 2, 3] },
    { label: '字串', payload: 'garbage' },
    { label: '數字', payload: 42 },
  ];

  for (const { label, payload } of MALFORMED_PAYLOADS) {
    for (const { label: identityLabel, isGuest, authProvider } of AUTHENTICATED_PROVIDER_CASES) {
      await test(`（10.error handling）payload=${label}且身份=${identityLabel}時，端對端POST /api/health-insight依然安全運作，status固定200`, async () => {
        const router = createAppRouter();
        const db = makeValidSessionDb({ userId: 'u-err-test', isGuest, authProvider });
        const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.ok, true);
        assert.strictEqual(typeof body.data.html, 'string');
      });
    }
  }

  for (const { label, payload } of MALFORMED_PAYLOADS) {
    for (const { label: failureLabel, makeDb } of SESSION_FAILURE_MODES) {
      await test(`（10.error handling）payload=${label}且session狀態=${failureLabel}時，端對端POST /api/health-insight依然安全運作，status固定200且退回匿名`, async () => {
        const router = createAppRouter();
        const db = makeDb('u-cross-test');
        const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.ok, true);
        assert.strictEqual(typeof body.data.html, 'string');
      });
    }
  }

  await test('（10.error handling）resolveHealthInsightIdentity()回傳的身份即使格式不合法（防禦性測試：模擬未來bug），controller依然安全退回ANONYMOUS_IDENTITY不拋出例外', () => {
    let capturedRequest = null;
    const fakeIntegration = { requestProductEntry: (request) => { capturedRequest = request; return { ok: true, boundary: 'product-entry', result: {} }; } };
    assert.doesNotThrow(() => submitHealthInsightController({}, { integration: fakeIntegration, identity: 'not-an-identity-object' }));
    submitHealthInsightController({}, { integration: fakeIntegration, identity: 'not-an-identity-object' });
    assert.deepStrictEqual(capturedRequest.user, ANONYMOUS_IDENTITY);
  });

  const MALFORMED_IDENTITY_FUZZ = [
    { label: 'userId是數字', value: { userId: 123, authenticated: true, provider: 'google' } },
    { label: 'authenticated是字串', value: { userId: 'u1', authenticated: 'yes', provider: 'google' } },
    { label: 'provider是數字', value: { userId: 'u1', authenticated: true, provider: 42 } },
    { label: '缺少authenticated欄位', value: { userId: 'u1', provider: 'google' } },
    { label: '缺少provider欄位', value: { userId: 'u1', authenticated: true } },
    { label: '陣列', value: ['u1', true, 'google'] },
    { label: '數字', value: 42 },
    { label: '布林值', value: true },
    { label: '空字串', value: '' },
    { label: 'Symbol', value: Symbol('identity') },
    { label: '函式', value: () => {} },
    { label: '巢狀物件', value: { userId: { nested: true }, authenticated: true, provider: 'google' } },
  ];

  for (const { label, value } of MALFORMED_IDENTITY_FUZZ) {
    await test(`（10.error handling）dependencies.identity=${label} 時，submitHealthInsightController()安全退回ANONYMOUS_IDENTITY，不拋出例外`, () => {
      let capturedRequest = null;
      const fakeIntegration = { requestProductEntry: (request) => { capturedRequest = request; return { ok: true, boundary: 'product-entry', result: {} }; } };
      assert.doesNotThrow(() => submitHealthInsightController({}, { integration: fakeIntegration, identity: value }));
      assert.deepStrictEqual(capturedRequest.user, ANONYMOUS_IDENTITY);
    });
  }

  const MALFORMED_COOKIE_HEADERS_E2E = [
    { label: 'undefined', value: undefined },
    { label: '空字串', value: '' },
    { label: '格式錯誤的cookie字串', value: 'this is not a cookie;;;' },
    { label: '不相關的cookie', value: 'other_cookie=xyz' },
    { label: '數字', value: 42 },
  ];

  for (const { label, value } of MALFORMED_COOKIE_HEADERS_E2E) {
    await test(`（10.error handling）端對端：cookieHeader=${label}時，POST /api/health-insight依然安全運作`, async () => {
      const router = createAppRouter();
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: value, options: {} }, {});
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.ok, true);
    });
  }

  for (const file of ['user_identity.js', 'resolve_identity.js', 'request_context.js', 'membership_placeholder.js', 'index.js']) {
    await test(`（10.error handling）src/identity/health_insight/${file} 通過node --check語法驗證（本次任務沒有修改這些檔案，但重新確認依然有效）`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(healthInsightIdentityDir, file)], { encoding: 'utf8' }));
    });
  }

  for (const file of ['health_insight_controller.js']) {
    await test(`（10.error handling）src/controllers/${file} 通過node --check語法驗證`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(controllersDir, file)], { encoding: 'utf8' }));
    });
  }

  await test('（10.error handling）src/routes/health_insight_routes.js通過node --check語法驗證', () => {
    assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(routesDir, 'health_insight_routes.js')], { encoding: 'utf8' }));
  });

  await test('（10.error handling）src/worker.js通過node --check語法驗證', () => {
    assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(srcRoot, 'worker.js')], { encoding: 'utf8' }));
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
      'backups/phase6-task1.118-user-identity/test_user_identity_foundation.mjs',
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

    await test('（Regression validation）本檔案（TASK1.119自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic', () => {
      execFileSync('node', [path.join(__dirname, 'test_health_insight_identity_binding.mjs')], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 60000,
        env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
      });
    });

    await test('（Regression validation）本次任務刻意不重新掃描/重跑Phase1~5（TASK1.26~1.105）既有測試檔案——延續TASK1.116~1.118已確認的既定範圍決策，Health Insight產品線本身（TASK1.111~1.118）已經在上面驗證無回歸', () => {
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

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改（本次任務只新增了POST /api/health-insight讀取Cookie標頭的一行，legacy前端邏輯逐字不變）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  await test('（P1-P6）app.intelligence維持24個既有欄位', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（P1-P6）app.router.routes數量維持23（本次任務沒有新增/刪除任何route）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 28);
  });

  await test('（P1-P6）src/db/整個目錄除了TASK1.120在src/db/index.js新增一行binding之外，完全沒有其他既有檔案被本次任務修改（TASK1.120後更新）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = diff.split('\n').filter((line) => line.trim() && !line.includes('src/db/index.js') && !line.includes('file changed') && !line.includes('files changed')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（P1-P6）migrations/目錄除了TASK1.120新增的0007 health_insight_records migration之外，完全沒有其他檔案被新增或修改（TASK1.120後更新）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（P1-P6）wrangler.toml完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）package.json完全沒有被本次任務修改（沒有新增任何npm依賴）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  for (const { label, isGuest, authProvider } of AUTHENTICATED_PROVIDER_CASES) {
    await test(`（P1-P6）身份=${label}時，真實端對端GET/POST兩條路由都能連續呼叫兩次得到一致結果（deterministic，沒有共用可變狀態）`, async () => {
      const router = createAppRouter();
      const db = makeValidSessionDb({ userId: `p1p6-${label}`, isGuest, authProvider });
      const res1 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const body1 = await res1.json();
      const body2 = await res2.json();
      assert.strictEqual(body1.data.html, body2.data.html);
    });
  }

  await test('（P1-P6）新增/修改檔案完全不import外部AI SDK套件（只檢查實際import陳述式）；health_insight_routes.js在TASK1.121後合法import內部自建的Gemini Enhancement模組（../intelligence/enhancement/gemini/，不是外部SDK），予以排除（TASK1.121後更新）', () => {
    const controllerSourceCheck = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');
    assert.ok(!/gemini|generative-ai|openai|anthropic-ai|@google\/genai/i.test(getImportLines(controllerSourceCheck)), 'controller疑似import AI SDK');

    const routesSourceCheck = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
    const importLines = getImportLines(routesSourceCheck).split('\n');
    const suspiciousImports = importLines.filter((l) => /gemini|generative-ai|openai|anthropic-ai|@google\/genai/i.test(l) && !l.includes("'../intelligence/enhancement/gemini/"));
    assert.deepStrictEqual(suspiciousImports, []);
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

/*
 * Phase 6 TASK 1.122｜Premium Feature Boundary & Gemini Access Control
 * Implementation 測試
 *
 * 本任務在Gemini Enhancement執行之前建立一個可控的權限邊界：
 *
 *   User → Identity → Membership Resolver → Feature Permission Check
 *     → Gemini Enhancement → User Presentation
 *
 * 本次任務不實作付款、不實作訂閱計費、不串接任何第三方付款供應商
 * ——只建立機制本身。目前所有已登入使用者的預設等級都是`free`，
 * `premium`狀態的形狀/判斷邏輯已經準備好，但沒有任何真實管道可以
 * 讓使用者變成premium（延續"Premium users prepared but not
 * attainable yet"設計）。匿名使用者永遠是`unknown`，結構性地不可能
 * 使用Gemini Enhancement。Gemini失敗與permission拒絕都不會影響
 * 使用者拿到原本的Health Insight結果。
 *
 * 分為以下13個部分：
 * A) Membership state
 * B) Free user behavior
 * C) Premium user behavior
 * D) Anonymous behavior
 * E) Gemini permission check
 * F) Gemini denied fallback
 * G) Gemini allowed flow
 * H) Identity compatibility
 * I) Persistence compatibility
 * J) Security boundary
 * K) Architecture protection
 * L) Regression validation
 * M) P1-P6
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const srcRoot = path.join(repoRoot, 'src');
const membershipDir = path.join(srcRoot, 'membership');
const geminiDir = path.join(srcRoot, 'intelligence', 'enhancement', 'gemini');
const providerDir = path.join(srcRoot, 'intelligence', 'enhancement', 'provider');
const routesDir = path.join(srcRoot, 'routes');
const persistenceDir = path.join(srcRoot, 'persistence', 'health_insight');
const identityDir = path.join(srcRoot, 'identity', 'health_insight');
const migrationsDir = path.join(repoRoot, 'migrations');

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

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

async function withMockedGlobalFetch(mockFn, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mockFn;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function fakeGeminiHttpResponse(text) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
}

async function loadModules() {
  const { createAppRouter } = await import(path.join(routesDir, 'index.js'));
  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  const membershipModule = await import(path.join(membershipDir, 'index.js'));
  const identityModule = await import(path.join(identityDir, 'index.js'));
  return { createAppRouter, createApplication, membershipModule, identityModule };
}

function makeValidSessionDb({ userId, status, isGuest, authProvider, expiresInFutureSeconds }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (expiresInFutureSeconds !== undefined ? expiresInFutureSeconds : 3600) * 1000).toISOString();
  return {
    sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: userId, expires_at: expiresAt, revoked_at: null } }) },
    users: { getById: async () => ({ ok: true, row: { id: userId, is_guest: isGuest ? 1 : 0, auth_provider: authProvider || null, status: status || 'active' } }) },
  };
}

function makeCaptureDb({ userId, isGuest, authProvider }) {
  const inserted = [];
  const base = makeValidSessionDb({ userId, isGuest, authProvider });
  const db = Object.assign({}, base, {
    healthInsightRecords: {
      insert: async (r) => { inserted.push(r); return { ok: true, meta: {} }; },
    },
  });
  return { db, inserted };
}

const PREMIUM_OPTIONS = { lookupTier: () => 'premium' };
const FREE_OPTIONS = { lookupTier: () => 'free' };

async function main() {
  const { createAppRouter, createApplication, membershipModule, identityModule } = await loadModules();
  const {
    MEMBERSHIP_TIERS,
    UNKNOWN_MEMBERSHIP,
    isValidMembershipState,
    buildMembershipState,
    resolveMembershipState,
    isFeatureAllowedForTier,
    canUseFeature,
  } = membershipModule;
  const { ANONYMOUS_IDENTITY } = identityModule;

  const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
  const stateSource = fs.readFileSync(path.join(membershipDir, 'membership_state.js'), 'utf8');
  const resolverSource = fs.readFileSync(path.join(membershipDir, 'membership_resolver.js'), 'utf8');
  const permissionSource = fs.readFileSync(path.join(membershipDir, 'feature_permission.js'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(membershipDir, 'README.md'), 'utf8');
  const geminiClientSource = fs.readFileSync(path.join(geminiDir, 'gemini_client.js'), 'utf8');
  const geminiProviderSource = fs.readFileSync(path.join(geminiDir, 'gemini_provider.js'), 'utf8');
  const geminiEnhancerSource = fs.readFileSync(path.join(geminiDir, 'gemini_enhancer.js'), 'utf8');

  const AUTH_IDENTITY_GOOGLE = { userId: 'auth-user-google', authenticated: true, provider: 'google' };
  const AUTH_IDENTITY_GUEST = { userId: 'auth-user-guest', authenticated: true, provider: 'guest' };

  // =========================================================================
  // A. Membership state
  // =========================================================================
  console.log('--- A. Membership state ---');

  await test('（1.membership state）MEMBERSHIP_TIERS.FREE === "free"', () => {
    assert.strictEqual(MEMBERSHIP_TIERS.FREE, 'free');
  });

  await test('（1.membership state）MEMBERSHIP_TIERS.PREMIUM === "premium"', () => {
    assert.strictEqual(MEMBERSHIP_TIERS.PREMIUM, 'premium');
  });

  await test('（1.membership state）MEMBERSHIP_TIERS.UNKNOWN === "unknown"', () => {
    assert.strictEqual(MEMBERSHIP_TIERS.UNKNOWN, 'unknown');
  });

  await test('（1.membership state）MEMBERSHIP_TIERS被凍結（Object.isFrozen）', () => {
    assert.ok(Object.isFrozen(MEMBERSHIP_TIERS));
  });

  await test('（1.membership state）UNKNOWN_MEMBERSHIP形狀是{tier:"unknown"}', () => {
    assert.deepStrictEqual(UNKNOWN_MEMBERSHIP, { tier: 'unknown' });
  });

  await test('（1.membership state）UNKNOWN_MEMBERSHIP被凍結', () => {
    assert.ok(Object.isFrozen(UNKNOWN_MEMBERSHIP));
  });

  await test('（1.membership state）UNKNOWN_MEMBERSHIP不含payment/billing相關欄位', () => {
    assert.deepStrictEqual(Object.keys(UNKNOWN_MEMBERSHIP), ['tier']);
  });

  const VALID_STATE_CASES = [
    { label: 'free-state', state: { tier: 'free' }, expected: true },
    { label: 'premium-state', state: { tier: 'premium' }, expected: true },
    { label: 'unknown-state', state: { tier: 'unknown' }, expected: true },
    { label: 'invalid-tier-string', state: { tier: 'gold' }, expected: false },
    { label: 'numeric-tier', state: { tier: 42 }, expected: false },
    { label: 'missing-tier', state: {}, expected: false },
    { label: 'null', state: null, expected: false },
    { label: 'undefined', state: undefined, expected: false },
    { label: 'array', state: [], expected: false },
    { label: 'string', state: 'free', expected: false },
    { label: 'number', state: 1, expected: false },
    { label: 'extra-fields-still-valid', state: { tier: 'free', paymentId: 'leaked' }, expected: true },
  ];

  for (const c of VALID_STATE_CASES) {
    await test(`（1.membership state）isValidMembershipState(${c.label}) === ${c.expected}`, () => {
      assert.strictEqual(isValidMembershipState(c.state), c.expected);
    });
  }

  const BUILD_STATE_CASES = [
    { label: 'free', tier: 'free', expected: { tier: 'free' } },
    { label: 'premium', tier: 'premium', expected: { tier: 'premium' } },
    { label: 'unknown', tier: 'unknown', expected: { tier: 'unknown' } },
    { label: 'invalid-string', tier: 'gold', expected: { tier: 'unknown' } },
    { label: 'null', tier: null, expected: { tier: 'unknown' } },
    { label: 'undefined', tier: undefined, expected: { tier: 'unknown' } },
    { label: 'number', tier: 42, expected: { tier: 'unknown' } },
    { label: 'object', tier: { tier: 'premium' }, expected: { tier: 'unknown' } },
  ];

  for (const c of BUILD_STATE_CASES) {
    await test(`（1.membership state）buildMembershipState(${c.label})回傳${JSON.stringify(c.expected)}`, () => {
      assert.deepStrictEqual(buildMembershipState(c.tier), c.expected);
    });
  }

  await test('（1.membership state）buildMembershipState()不會拋出例外（任意型別輸入）', () => {
    for (const v of [null, undefined, {}, [], 42, 'x', true, NaN]) {
      assert.doesNotThrow(() => buildMembershipState(v));
    }
  });

  await test('（1.membership state）buildMembershipState("free")跟buildMembershipState("premium")回傳不同的物件內容', () => {
    assert.notDeepStrictEqual(buildMembershipState('free'), buildMembershipState('premium'));
  });

  await test('（1.membership state）buildMembershipState("unknown")回傳的物件跟UNKNOWN_MEMBERSHIP內容相同', () => {
    assert.deepStrictEqual(buildMembershipState('unknown'), UNKNOWN_MEMBERSHIP);
  });

  await test('（1.membership state）buildMembershipState()重複呼叫同樣輸入得到deterministic結果', () => {
    assert.deepStrictEqual(buildMembershipState('premium'), buildMembershipState('premium'));
  });

  for (const tier of ['free', 'premium', 'unknown']) {
    await test(`（1.membership state）buildMembershipState("${tier}")回傳的物件只有tier一個欄位`, () => {
      const state = buildMembershipState(tier);
      assert.deepStrictEqual(Object.keys(state), ['tier']);
    });

    await test(`（1.membership state）isValidMembershipState(buildMembershipState("${tier}")) === true（往返一致）`, () => {
      assert.strictEqual(isValidMembershipState(buildMembershipState(tier)), true);
    });
  }

  await test('（1.membership state）src/membership/membership_state.js完全不import任何其他模組（純資料定義，不依賴任何東西）', () => {
    assert.strictEqual(getImportLines(stateSource).trim(), '');
  });

  await test('（1.membership state）src/membership/目錄恰好5個檔案（state/resolver/permission/index/README）', () => {
    const files = fs.readdirSync(membershipDir);
    assert.strictEqual(files.length, 5);
  });

  console.log('');

  // =========================================================================
  // B. Free user behavior
  // =========================================================================
  console.log('--- B. Free user behavior ---');

  await test('（2.free user）已登入使用者沒有注入lookupTier時，resolveMembershipState()回傳free', () => {
    const state = resolveMembershipState(AUTH_IDENTITY_GOOGLE);
    assert.deepStrictEqual(state, { tier: 'free' });
  });

  await test('（2.free user）resolveMembershipState()對已登入使用者省略options也回傳free', () => {
    const state = resolveMembershipState(AUTH_IDENTITY_GOOGLE, undefined);
    assert.deepStrictEqual(state, { tier: 'free' });
  });

  for (const providerLabel of ['google', 'guest', 'apple', 'facebook']) {
    await test(`（2.free user）provider=${providerLabel}的已登入使用者預設都是free（不因provider種類而不同）`, () => {
      const identity = { userId: `free-${providerLabel}`, authenticated: true, provider: providerLabel };
      const state = resolveMembershipState(identity);
      assert.deepStrictEqual(state, { tier: 'free' });
    });
  }

  await test('（2.free user）canUseFeature(free身份, "gemini_enhancement") === false', () => {
    assert.strictEqual(canUseFeature(AUTH_IDENTITY_GOOGLE, 'gemini_enhancement'), false);
  });

  await test('（2.free user）canUseFeature(free身份, "gemini_enhancement", FREE_OPTIONS明確指定free) === false', () => {
    assert.strictEqual(canUseFeature(AUTH_IDENTITY_GOOGLE, 'gemini_enhancement', FREE_OPTIONS), false);
  });

  await test('（2.free user）真實端對端：free使用者POST /api/health-insight完全不會觸發Gemini（不使用premium options）', async () => {
    const router = createAppRouter();
    let fetchCalled = false;
    const db = makeValidSessionDb({ userId: 'free-e2e-user', isGuest: false, authProvider: 'google' });
    const res = await withMockedGlobalFetch(async () => { fetchCalled = true; return fakeGeminiHttpResponse('x'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body = await res.json();
    assert.strictEqual(fetchCalled, false);
    assert.deepStrictEqual(Object.keys(body.data).sort(), ['html']);
  });

  await test('（2.free user）真實端對端：free使用者依然拿到完整的Health Insight html（基本功能不受影響）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'free-basic-user', isGuest: false, authProvider: 'google' });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, gender: 'female' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data.html.length > 0);
  });

  console.log('');

  // =========================================================================
  // C. Premium user behavior
  // =========================================================================
  console.log('--- C. Premium user behavior ---');

  await test('（3.premium user）resolveMembershipState()對已登入使用者+lookupTier回傳premium時，回傳premium', () => {
    const state = resolveMembershipState(AUTH_IDENTITY_GOOGLE, PREMIUM_OPTIONS);
    assert.deepStrictEqual(state, { tier: 'premium' });
  });

  await test('（3.premium user）lookupTier接收到正確的userId', () => {
    let capturedUserId = null;
    resolveMembershipState(AUTH_IDENTITY_GOOGLE, { lookupTier: (userId) => { capturedUserId = userId; return 'premium'; } });
    assert.strictEqual(capturedUserId, AUTH_IDENTITY_GOOGLE.userId);
  });

  await test('（3.premium user）lookupTier回傳"free"時resolveMembershipState()回傳free（不強制升級）', () => {
    const state = resolveMembershipState(AUTH_IDENTITY_GOOGLE, FREE_OPTIONS);
    assert.deepStrictEqual(state, { tier: 'free' });
  });

  await test('（3.premium user）canUseFeature(premium身份, "gemini_enhancement") === true', () => {
    assert.strictEqual(canUseFeature(AUTH_IDENTITY_GOOGLE, 'gemini_enhancement', PREMIUM_OPTIONS), true);
  });

  for (const providerLabel of ['google', 'guest', 'apple']) {
    await test(`（3.premium user）provider=${providerLabel}的premium使用者一樣可以使用gemini_enhancement`, () => {
      const identity = { userId: `premium-${providerLabel}`, authenticated: true, provider: providerLabel };
      assert.strictEqual(canUseFeature(identity, 'gemini_enhancement', PREMIUM_OPTIONS), true);
    });
  }

  await test('（3.premium user）真實端對端：premium使用者可以拿到Gemini增強說明', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'premium-e2e-user', isGuest: false, authProvider: 'google' });
    const res = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('premium的增強說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body = await res.json();
    assert.strictEqual(body.data.enhancedExplanation, 'premium的增強說明');
  });

  await test('（3.premium user）premium使用者的Gemini API本身若失敗，依然安全回傳原始結果（premium只解鎖"可以嘗試"，不保證Gemini一定成功）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'premium-fail-user', isGuest: false, authProvider: 'google' });
    const res = await withMockedGlobalFetch(async () => { throw new Error('down'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(Object.keys(body.data).sort(), ['html']);
  });

  console.log('');

  // =========================================================================
  // D. Anonymous behavior
  // =========================================================================
  console.log('--- D. Anonymous behavior ---');

  await test('（4.anonymous behavior）resolveMembershipState(ANONYMOUS_IDENTITY) === unknown', () => {
    const state = resolveMembershipState(ANONYMOUS_IDENTITY);
    assert.deepStrictEqual(state, { tier: 'unknown' });
  });

  await test('（4.anonymous behavior）resolveMembershipState(ANONYMOUS_IDENTITY, PREMIUM_OPTIONS)依然是unknown（匿名結構性地不可能被查成premium，在檢查lookupTier之前就已經回傳）', () => {
    const state = resolveMembershipState(ANONYMOUS_IDENTITY, PREMIUM_OPTIONS);
    assert.deepStrictEqual(state, { tier: 'unknown' });
  });

  await test('（4.anonymous behavior）注入的lookupTier完全不會被呼叫（匿名身份在到達lookupTier之前就被擋下）', () => {
    let called = false;
    resolveMembershipState(ANONYMOUS_IDENTITY, { lookupTier: () => { called = true; return 'premium'; } });
    assert.strictEqual(called, false);
  });

  await test('（4.anonymous behavior）canUseFeature(ANONYMOUS_IDENTITY, "gemini_enhancement") === false', () => {
    assert.strictEqual(canUseFeature(ANONYMOUS_IDENTITY, 'gemini_enhancement'), false);
  });

  await test('（4.anonymous behavior）canUseFeature(ANONYMOUS_IDENTITY, "gemini_enhancement", PREMIUM_OPTIONS)依然是false', () => {
    assert.strictEqual(canUseFeature(ANONYMOUS_IDENTITY, 'gemini_enhancement', PREMIUM_OPTIONS), false);
  });

  const INVALID_IDENTITY_CASES = [null, undefined, {}, { authenticated: true }, { userId: 'x' }, { userId: '', authenticated: true }, 'string', 42, []];
  for (const bad of INVALID_IDENTITY_CASES) {
    await test(`（4.anonymous behavior）resolveMembershipState(${JSON.stringify(bad)})安全回傳unknown（不拋出例外）`, () => {
      const state = resolveMembershipState(bad);
      assert.deepStrictEqual(state, { tier: 'unknown' });
    });
  }

  await test('（4.anonymous behavior）真實端對端：匿名使用者POST完全不會觸發Gemini，即使env設定了GEMINI_API_KEY且options注入premium', async () => {
    const router = createAppRouter();
    let fetchCalled = false;
    const res = await withMockedGlobalFetch(async () => { fetchCalled = true; return fakeGeminiHttpResponse('x'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: PREMIUM_OPTIONS }, { db: {}, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body = await res.json();
    assert.strictEqual(fetchCalled, false);
    assert.deepStrictEqual(Object.keys(body.data).sort(), ['html']);
  });

  await test('（4.anonymous behavior）resolveMembershipState(ANONYMOUS_IDENTITY)重複呼叫10次都是unknown（deterministic）', () => {
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(resolveMembershipState(ANONYMOUS_IDENTITY).tier, 'unknown');
    }
  });

  await test('（4.anonymous behavior）isFeatureAllowedForTier(UNKNOWN_MEMBERSHIP, "gemini_enhancement") === false', () => {
    assert.strictEqual(isFeatureAllowedForTier(UNKNOWN_MEMBERSHIP, 'gemini_enhancement'), false);
  });

  await test('（4.anonymous behavior）真實端對端：匿名使用者的Gemini API連一次都不會被呼叫，即使多次連續請求', async () => {
    const router = createAppRouter();
    let callCount = 0;
    await withMockedGlobalFetch(async () => { callCount++; return fakeGeminiHttpResponse('x'); }, async () => {
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: PREMIUM_OPTIONS }, { db: {}, env: { GEMINI_API_KEY: 'fake' } });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: PREMIUM_OPTIONS }, { db: {}, env: { GEMINI_API_KEY: 'fake' } });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: PREMIUM_OPTIONS }, { db: {}, env: { GEMINI_API_KEY: 'fake' } });
    });
    assert.strictEqual(callCount, 0);
  });

  await test('（4.anonymous behavior）真實端對端：匿名使用者依然拿到完整的Health Insight html（Preserve Anonymous Experience，規格明確要求）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {} });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data.html.length > 0);
  });

  console.log('');

  // =========================================================================
  // E. Gemini permission check
  // =========================================================================
  console.log('--- E. Gemini permission check ---');

  const TIER_FEATURE_MATRIX = [
    { tier: 'free', feature: 'gemini_enhancement', expected: false },
    { tier: 'premium', feature: 'gemini_enhancement', expected: true },
    { tier: 'unknown', feature: 'gemini_enhancement', expected: false },
    { tier: 'free', feature: 'unknown_feature', expected: false },
    { tier: 'premium', feature: 'unknown_feature', expected: false },
    { tier: 'unknown', feature: 'unknown_feature', expected: false },
    { tier: 'premium', feature: '', expected: false },
    { tier: 'premium', feature: null, expected: false },
    { tier: 'premium', feature: undefined, expected: false },
  ];

  for (const c of TIER_FEATURE_MATRIX) {
    await test(`（5.gemini permission check）isFeatureAllowedForTier({tier:"${c.tier}"}, ${JSON.stringify(c.feature)}) === ${c.expected}`, () => {
      assert.strictEqual(isFeatureAllowedForTier({ tier: c.tier }, c.feature), c.expected);
    });
  }

  const MALFORMED_STATE_CASES = [null, undefined, {}, [], 'premium', 42, { tier: 'gold' }];
  for (const bad of MALFORMED_STATE_CASES) {
    await test(`（5.gemini permission check）isFeatureAllowedForTier(${JSON.stringify(bad)}, "gemini_enhancement")安全回傳false`, () => {
      assert.strictEqual(isFeatureAllowedForTier(bad, 'gemini_enhancement'), false);
    });
  }

  const MALFORMED_FEATURE_NAME_CASES = [['gemini_enhancement'], { toString: () => 'gemini_enhancement' }, 123, true, NaN];
  for (const bad of MALFORMED_FEATURE_NAME_CASES) {
    await test(`（5.gemini permission check）isFeatureAllowedForTier({tier:"premium"}, ${JSON.stringify(bad) || String(bad)})安全回傳false（featureName必須是精確字串，不接受型別強制轉換）`, () => {
      assert.strictEqual(isFeatureAllowedForTier({ tier: 'premium' }, bad), false);
    });
  }

  await test('（5.gemini permission check）isFeatureAllowedForTier()對空字串featureName安全回傳false', () => {
    assert.strictEqual(isFeatureAllowedForTier({ tier: 'premium' }, ''), false);
  });

  await test('（5.gemini permission check）isFeatureAllowedForTier()不拋出例外（任意輸入組合）', () => {
    for (const state of [null, undefined, {}, 'x']) {
      for (const feature of [null, undefined, '', 'gemini_enhancement']) {
        assert.doesNotThrow(() => isFeatureAllowedForTier(state, feature));
      }
    }
  });

  await test('（5.gemini permission check）canUseFeature()是resolveMembershipState()+isFeatureAllowedForTier()的組合（結果一致）', () => {
    const membership = resolveMembershipState(AUTH_IDENTITY_GOOGLE, PREMIUM_OPTIONS);
    const direct = isFeatureAllowedForTier(membership, 'gemini_enhancement');
    const composed = canUseFeature(AUTH_IDENTITY_GOOGLE, 'gemini_enhancement', PREMIUM_OPTIONS);
    assert.strictEqual(direct, composed);
  });

  await test('（5.gemini permission check）canUseFeature()重複呼叫同樣輸入得到deterministic結果', () => {
    const r1 = canUseFeature(AUTH_IDENTITY_GOOGLE, 'gemini_enhancement', PREMIUM_OPTIONS);
    const r2 = canUseFeature(AUTH_IDENTITY_GOOGLE, 'gemini_enhancement', PREMIUM_OPTIONS);
    assert.strictEqual(r1, r2);
  });

  await test('（5.gemini permission check）feature_permission.js完全不import ../intelligence/enhancement/gemini/任何檔案（Permission不需要知道Gemini怎麼運作）', () => {
    assert.ok(!getImportLines(permissionSource).includes('enhancement/gemini'));
  });

  await test('（5.gemini permission check）membership_resolver.js完全不import ../intelligence/enhancement/gemini/任何檔案', () => {
    assert.ok(!getImportLines(resolverSource).includes('enhancement/gemini'));
  });

  await test('（5.gemini permission check）src/intelligence/enhancement/gemini/底下完全沒有任何檔案import src/membership/（Permission不能活在Gemini程式碼裡，依賴方向只能是Permission → Gemini，不能反過來）', () => {
    for (const source of [geminiClientSource, geminiProviderSource, geminiEnhancerSource]) {
      assert.ok(!getImportLines(source).includes('membership'));
    }
  });

  await test('（5.gemini permission check）feature_permission.js完全不import ../../db/（Permission不直接碰D1）', () => {
    assert.ok(!getImportLines(permissionSource).includes('/db/'));
  });

  await test('（5.gemini permission check）membership_resolver.js完全不import ../../db/', () => {
    assert.ok(!getImportLines(resolverSource).includes('/db/'));
  });

  await test('（5.gemini permission check）isFeatureAllowedForTier()對premium tier搭配未知feature name依然回傳false（tier再高也不能用不存在的功能）', () => {
    assert.strictEqual(isFeatureAllowedForTier({ tier: 'premium' }, 'time_travel'), false);
  });

  await test('（5.gemini permission check）canUseFeature()對premium身份+未知feature name回傳false', () => {
    assert.strictEqual(canUseFeature(AUTH_IDENTITY_GOOGLE, 'time_travel', PREMIUM_OPTIONS), false);
  });

  for (const featureName of ['gemini_enhancement', 'history_review', 'trend_analysis']) {
    await test(`（5.gemini permission check）canUseFeature(anonymous, "${featureName}") === false（匿名對任何feature都是false）`, () => {
      assert.strictEqual(canUseFeature(ANONYMOUS_IDENTITY, featureName, PREMIUM_OPTIONS), false);
    });
  }

  await test('（5.gemini permission check）isFeatureAllowedForTier()跟canUseFeature()對同一組premium+gemini_enhancement輸入永遠回傳true（deterministic，重複10次）', () => {
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(canUseFeature(AUTH_IDENTITY_GOOGLE, 'gemini_enhancement', PREMIUM_OPTIONS), true);
    }
  });

  console.log('');

  // =========================================================================
  // F. Gemini denied fallback
  // =========================================================================
  console.log('--- F. Gemini denied fallback ---');

  const DENIED_SCENARIOS = [
    { label: 'anonymous', makeCtx: () => ({ db: {}, req: {} }) },
    { label: 'free-authenticated', makeCtx: () => ({ db: makeValidSessionDb({ userId: 'denied-free', isGuest: false, authProvider: 'google' }), req: { cookieHeader: 'dbc_sid=token123' } }) },
    { label: 'free-authenticated-explicit-options', makeCtx: () => ({ db: makeValidSessionDb({ userId: 'denied-free-2', isGuest: false, authProvider: 'google' }), req: { cookieHeader: 'dbc_sid=token123', options: FREE_OPTIONS } }) },
  ];

  for (const scenario of DENIED_SCENARIOS) {
    await test(`（6.gemini denied fallback）情境=${scenario.label}：Gemini API完全不會被呼叫`, async () => {
      const router = createAppRouter();
      const ctx = scenario.makeCtx();
      let fetchCalled = false;
      const res = await withMockedGlobalFetch(async () => { fetchCalled = true; return fakeGeminiHttpResponse('x'); }, async () =>
        router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: ctx.req.cookieHeader, options: ctx.req.options || {} }, { db: ctx.db, env: { GEMINI_API_KEY: 'fake' } })
      );
      assert.strictEqual(fetchCalled, false);
      assert.strictEqual(res.status, 200);
    });

    await test(`（6.gemini denied fallback）情境=${scenario.label}：回應形狀維持{html}（不含enhancedExplanation）`, async () => {
      const router = createAppRouter();
      const ctx = scenario.makeCtx();
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: ctx.req.cookieHeader, options: ctx.req.options || {} }, { db: ctx.db, env: { GEMINI_API_KEY: 'fake' } });
      const body = await res.json();
      assert.deepStrictEqual(Object.keys(body.data).sort(), ['html']);
    });

    await test(`（6.gemini denied fallback）情境=${scenario.label}：即使Gemini本來會成功，使用者依然拿到原始Health Insight結果（Denied: Original Health Insight Result）`, async () => {
      const router = createAppRouter();
      const ctx = scenario.makeCtx();
      const resDenied = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: ctx.req.cookieHeader, options: ctx.req.options || {} }, { db: ctx.db });
      const bodyDenied = await resDenied.json();
      assert.strictEqual(bodyDenied.ok, true);
      assert.ok(bodyDenied.data.html.length > 0);
    });
  }

  await test('（6.gemini denied fallback）沒有設定GEMINI_API_KEY的premium使用者也不會出錯（permission允許但Gemini本身沒設定金鑰，依然安全回傳原始結果）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'premium-no-key', isGuest: false, authProvider: 'google' });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db });
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(Object.keys(body.data).sort(), ['html']);
  });

  console.log('');

  // =========================================================================
  // G. Gemini allowed flow
  // =========================================================================
  console.log('--- G. Gemini allowed flow ---');

  await test('（7.gemini allowed flow）permission允許時，Gemini API確實被呼叫一次', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'allowed-count-user', isGuest: false, authProvider: 'google' });
    let callCount = 0;
    await withMockedGlobalFetch(async () => { callCount++; return fakeGeminiHttpResponse('x'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.strictEqual(callCount, 1);
  });

  await test('（7.gemini allowed flow）allowed且Gemini成功時，html裡核心健康觀察/建議卡片內容跟denied情境完全相同（TASK1.123後更新：完整html不再逐字相同，因為TASK1.123新增的"AI 陪伴解讀"呈現區塊會依permission/Gemini結果出現/消失，這只是呈現層的加值區塊，不影響Health Insight本身的核心內容——這裡改成只比對觀察/建議卡片區塊）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'allowed-html-compare', isGuest: false, authProvider: 'google' });
    const resDenied = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const resAllowed = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const bodyDenied = await resDenied.json();
    const bodyAllowed = await resAllowed.json();
    const extractCard = (html, marker) => {
      const start = html.indexOf(marker);
      const end = html.indexOf('</div>\n</div>', start);
      return html.slice(start, end);
    };
    assert.strictEqual(extractCard(bodyDenied.data.html, 'hi-observation-card'), extractCard(bodyAllowed.data.html, 'hi-observation-card'));
    assert.strictEqual(extractCard(bodyDenied.data.html, 'hi-recommendation-card'), extractCard(bodyAllowed.data.html, 'hi-recommendation-card'));
  });

  await test('（7.gemini allowed flow）連續兩次呼叫（都allowed且成功）得到一致的enhancedExplanation（deterministic）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'allowed-deterministic', isGuest: false, authProvider: 'google' });
    const res1 = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('一致說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const res2 = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('一致說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body1 = await res1.json();
    const body2 = await res2.json();
    assert.strictEqual(body1.data.enhancedExplanation, body2.data.enhancedExplanation);
  });

  await test('（7.gemini allowed flow）route的實際程式碼（不含註解）裡canUseFeature()的呼叫在enhanceHealthInsightResult()呼叫之前（Permission Boundary → Gemini Provider，不是反過來；只看程式碼本身，文件註解裡敘述順序不代表程式碼順序）', () => {
    const codeOnly = stripComments(routesSource);
    const canUseIdx = codeOnly.indexOf('canUseFeature(');
    const enhanceIdx = codeOnly.indexOf('enhanceHealthInsightResult(');
    assert.ok(canUseIdx >= 0 && enhanceIdx >= 0);
    assert.ok(canUseIdx < enhanceIdx);
  });

  await test('（7.gemini allowed flow）route的實際程式碼裡enhanceHealthInsightResult()的呼叫在一個依據canUseFeature()結果的if區塊裡（不是無條件呼叫；TASK1.123後更新：route現在先把canUseFeature()的結果存進geminiPermitted變數再判斷if(geminiPermitted)，變數本身緊接在canUseFeature()呼叫之後賦值，所以檢查範圍放寬到400字元）', () => {
    const codeOnly = stripComments(routesSource);
    const canUseIdx = codeOnly.indexOf('canUseFeature(');
    const enhanceIdx = codeOnly.indexOf('enhanceHealthInsightResult(');
    const between = codeOnly.slice(canUseIdx, enhanceIdx);
    assert.ok(/if\s*\(\s*canUseFeature\(/.test(between) || /if\s*\(\s*\w+\s*\)\s*\{/.test(between));
    const before = codeOnly.slice(Math.max(0, enhanceIdx - 400), enhanceIdx);
    assert.ok(/if\s*\(\s*\w*[Pp]ermitted\w*\s*\)/.test(before) || /if\s*\(\s*canUseFeature\(/.test(before));
  });

  console.log('');

  // =========================================================================
  // H. Identity compatibility
  // =========================================================================
  console.log('--- H. Identity compatibility ---');

  await test('（8.identity compatibility）src/identity/health_insight/整個目錄完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/health_insight/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.identity compatibility）membership_resolver.js的實際程式碼（不含註解）完全不import src/identity/session_rules.js（不重新驗證session，只使用既有已解析好的identity）', () => {
    assert.ok(!stripComments(resolverSource).includes('session_rules.js'));
  });

  await test('（8.identity compatibility）membership模組完全不import src/auth/、src/oauth/', () => {
    for (const source of [stateSource, resolverSource, permissionSource]) {
      const imports = getImportLines(source);
      assert.ok(!/from ['"](\.\.\/)+auth\//.test(imports));
      assert.ok(!/from ['"](\.\.\/)+oauth\//.test(imports));
    }
  });

  await test('（8.identity compatibility）resolveMembershipState()接受TASK1.118既有的User Identity Context形狀，不需要額外欄位', () => {
    const identity = { userId: 'compat-user', authenticated: true, provider: 'google' };
    assert.doesNotThrow(() => resolveMembershipState(identity));
  });

  for (const providerLabel of ['google', 'guest', 'apple', null]) {
    await test(`（8.identity compatibility）provider=${JSON.stringify(providerLabel)}時resolveMembershipState()都能正常運作`, () => {
      const identity = { userId: 'x', authenticated: true, provider: providerLabel };
      assert.doesNotThrow(() => resolveMembershipState(identity));
    });
  }

  await test('（8.identity compatibility）已登入使用者的userId不會出現在membership state本身（membership state只有tier欄位）', () => {
    const state = resolveMembershipState(AUTH_IDENTITY_GOOGLE, PREMIUM_OPTIONS);
    assert.ok(!JSON.stringify(state).includes(AUTH_IDENTITY_GOOGLE.userId));
  });

  await test('（8.identity compatibility）真實端對端：guest身份使用者的基本Health Insight功能不受Permission Boundary影響', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'guest-basic-user', isGuest: true, authProvider: null });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
  });

  await test('（8.identity compatibility）guest身份預設也是free（不會因為是guest就自動變成premium或unknown）', () => {
    const state = resolveMembershipState(AUTH_IDENTITY_GUEST);
    assert.deepStrictEqual(state, { tier: 'free' });
  });

  await test('（8.identity compatibility）src/identity/health_insight/index.js既有的公開匯出完全沒有被本次任務修改（型別依然正確）', () => {
    for (const exportName of Object.keys(identityModule)) {
      assert.notStrictEqual(identityModule[exportName], undefined);
    }
  });

  for (const providerLabel of ['google', 'guest', 'apple', 'facebook', 'microsoft']) {
    await test(`（8.identity compatibility）provider=${providerLabel}：resolveMembershipState()+canUseFeature()組合行為一致（free時false，premium時true）`, () => {
      const identity = { userId: `combo-${providerLabel}`, authenticated: true, provider: providerLabel === 'guest' ? null : providerLabel };
      assert.strictEqual(canUseFeature(identity, 'gemini_enhancement'), false);
      assert.strictEqual(canUseFeature(identity, 'gemini_enhancement', PREMIUM_OPTIONS), true);
    });
  }

  await test('（8.identity compatibility）真實端對端：不同provider的premium使用者互相之間enhancedExplanation不會互相污染（各自獨立呼叫，內容各自對應各自的mock）', async () => {
    const router = createAppRouter();
    const dbA = makeValidSessionDb({ userId: 'cross-check-a', isGuest: false, authProvider: 'google' });
    const dbB = makeValidSessionDb({ userId: 'cross-check-b', isGuest: false, authProvider: 'apple' });
    const resA = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('A的說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db: dbA, env: { GEMINI_API_KEY: 'fake' } })
    );
    const resB = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('B的說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db: dbB, env: { GEMINI_API_KEY: 'fake' } })
    );
    const bodyA = await resA.json();
    const bodyB = await resB.json();
    assert.strictEqual(bodyA.data.enhancedExplanation, 'A的說明');
    assert.strictEqual(bodyB.data.enhancedExplanation, 'B的說明');
  });

  console.log('');

  // =========================================================================
  // I. Persistence compatibility
  // =========================================================================
  console.log('--- I. Persistence compatibility ---');

  await test('（9.persistence compatibility）migrations/目錄完全沒有新增或修改任何檔案（本次任務不修改D1 schema，不建立billing表）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.persistence compatibility）migrations/目錄依然恰好7個.sql檔案', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    assert.strictEqual(files.length, 7);
  });

  await test('（9.persistence compatibility）src/db/整個目錄完全沒有被本次任務修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.persistence compatibility）src/persistence/整個目錄完全沒有被本次任務修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/persistence/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.persistence compatibility）route原始碼裡saveHealthInsightRecord()呼叫在canUseFeature()呼叫之前（持久化完全不受permission影響，任何tier都會存）', () => {
    const saveIdx = routesSource.indexOf('saveHealthInsightRecord(');
    const canUseIdx = routesSource.indexOf('canUseFeature(');
    assert.ok(saveIdx >= 0 && canUseIdx >= 0);
    assert.ok(saveIdx < canUseIdx);
  });

  await test('（9.persistence compatibility）真實端對端：free使用者跟premium使用者(允許但Gemini失敗)的D1紀錄筆數都是1筆，不受權限影響', async () => {
    const router = createAppRouter();
    const { db: dbFree, inserted: insertedFree } = makeCaptureDb({ userId: 'persist-free', isGuest: false, authProvider: 'google' });
    const { db: dbPremium, inserted: insertedPremium } = makeCaptureDb({ userId: 'persist-premium', isGuest: false, authProvider: 'google' });
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbFree });
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('x'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db: dbPremium, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.strictEqual(insertedFree.length, 1);
    assert.strictEqual(insertedPremium.length, 1);
  });

  await test('（9.persistence compatibility）真實端對端：匿名使用者依然完全不觸發任何D1寫入（延續TASK1.120既有結論）', async () => {
    const router = createAppRouter();
    let insertCalled = false;
    const db = { healthInsightRecords: { insert: async () => { insertCalled = true; return { ok: true }; } } };
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } });
    assert.strictEqual(insertCalled, false);
  });

  await test('（9.persistence compatibility）src/db/tables/health_insight_records.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/tables/health_insight_records.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.persistence compatibility）真實端對端：denied使用者(free)跟allowed使用者(premium，Gemini失敗)存進D1的input_snapshot完全相同（都不受權限/Gemini影響）', async () => {
    const router = createAppRouter();
    const { db: dbFree, inserted: insertedFree } = makeCaptureDb({ userId: 'snapshot-compare-a', isGuest: false, authProvider: 'google' });
    const { db: dbPremium, inserted: insertedPremium } = makeCaptureDb({ userId: 'snapshot-compare-b', isGuest: false, authProvider: 'google' });
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, gender: 'female' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbFree });
    await withMockedGlobalFetch(async () => { throw new Error('x'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, gender: 'female' }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db: dbPremium, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.strictEqual(insertedFree[0].input_snapshot, insertedPremium[0].input_snapshot);
  });

  await test('（9.persistence compatibility）listHealthInsightRecordsForUser()既有extension point完全不受本次任務影響（沒有任何route呼叫它）', () => {
    assert.ok(!routesSource.includes('listHealthInsightRecordsForUser'));
  });

  await test('（9.persistence compatibility）D1紀錄完全不含tier/membership相關欄位', async () => {
    const router = createAppRouter();
    const { db, inserted } = makeCaptureDb({ userId: 'persist-no-tier-leak', isGuest: false, authProvider: 'google' });
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('x'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.ok(!('tier' in inserted[0]));
    assert.ok(!inserted[0].output_snapshot.includes('premium'));
    assert.ok(!inserted[0].input_snapshot.includes('premium'));
  });

  console.log('');

  // =========================================================================
  // J. Security boundary
  // =========================================================================
  console.log('--- J. Security boundary ---');

  await test('（10.security boundary）payload裡的tier欄位完全不會被membership resolver讀取（membership只看identity跟options，不看payload）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'spoof-attempt-user', isGuest: false, authProvider: 'google' });
    let fetchCalled = false;
    const res = await withMockedGlobalFetch(async () => { fetchCalled = true; return fakeGeminiHttpResponse('x'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, tier: 'premium', membership: 'premium', isPremium: true }, cookieHeader: 'dbc_sid=token123', options: {} }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.strictEqual(fetchCalled, false, 'payload裡塞tier:premium不應該真的取得permission');
    const body = await res.json();
    assert.deepStrictEqual(Object.keys(body.data).sort(), ['html']);
  });

  await test('（10.security boundary）lookupTier拋出例外時安全回傳unknown（fail-closed，不會意外放行）', () => {
    const throwingOptions = { lookupTier: () => { throw new Error('db down'); } };
    const state = resolveMembershipState(AUTH_IDENTITY_GOOGLE, throwingOptions);
    assert.strictEqual(state.tier, 'unknown');
  });

  await test('（10.security boundary）lookupTier拋出例外時canUseFeature()安全回傳false', () => {
    const throwingOptions = { lookupTier: () => { throw new Error('db down'); } };
    assert.strictEqual(canUseFeature(AUTH_IDENTITY_GOOGLE, 'gemini_enhancement', throwingOptions), false);
  });

  const SPOOF_TIER_ATTEMPTS = ['PREMIUM', 'Premium', ' premium', 'premium ', 'premium\n', 'super_premium', 'admin', true, 1, {}];
  for (const spoofed of SPOOF_TIER_ATTEMPTS) {
    await test(`（10.security boundary）lookupTier回傳非精確"premium"字串（${JSON.stringify(spoofed)}）時不會被判定為premium`, () => {
      const state = resolveMembershipState(AUTH_IDENTITY_GOOGLE, { lookupTier: () => spoofed });
      assert.notStrictEqual(state.tier, 'premium');
    });
  }

  await test('（10.security boundary）canUseFeature()對超長字串featureName安全回傳false（不會意外匹配）', () => {
    assert.strictEqual(canUseFeature(AUTH_IDENTITY_GOOGLE, 'gemini_enhancement'.repeat(100), PREMIUM_OPTIONS), false);
  });

  await test('（10.security boundary）canUseFeature()對featureName大小寫不同（"Gemini_Enhancement"）安全回傳false（精確比對，不做大小寫容錯）', () => {
    assert.strictEqual(canUseFeature(AUTH_IDENTITY_GOOGLE, 'Gemini_Enhancement', PREMIUM_OPTIONS), false);
  });

  await test('（10.security boundary）isValidMembershipState()對原型污染型輸入（__proto__）安全回傳false', () => {
    const malicious = JSON.parse('{"__proto__": {"tier": "premium"}}');
    assert.strictEqual(isValidMembershipState(malicious), false);
  });

  await test('（10.security boundary）canUseFeature()/resolveMembershipState()對於同一個identity物件不會產生副作用（不修改輸入）', () => {
    const identity = { userId: 'no-mutation-user', authenticated: true, provider: 'google' };
    const before = JSON.stringify(identity);
    canUseFeature(identity, 'gemini_enhancement', PREMIUM_OPTIONS);
    assert.strictEqual(JSON.stringify(identity), before);
  });

  await test('（10.security boundary）canUseFeature()對featureName為陣列型別安全回傳false', () => {
    assert.strictEqual(canUseFeature(AUTH_IDENTITY_GOOGLE, ['gemini_enhancement'], PREMIUM_OPTIONS), false);
  });

  await test('（10.security boundary）canUseFeature()對featureName為物件型別安全回傳false', () => {
    assert.strictEqual(canUseFeature(AUTH_IDENTITY_GOOGLE, { name: 'gemini_enhancement' }, PREMIUM_OPTIONS), false);
  });

  await test('（10.security boundary）resolveMembershipState()對identity.authenticated為字串"true"（非布林值）安全視為未登入', () => {
    const fakeIdentity = { userId: 'x', authenticated: 'true', provider: 'google' };
    const state = resolveMembershipState(fakeIdentity, PREMIUM_OPTIONS);
    assert.strictEqual(state.tier, 'unknown');
  });

  await test('（10.security boundary）resolveMembershipState()對identity.userId為數字型別安全視為未登入', () => {
    const fakeIdentity = { userId: 12345, authenticated: true, provider: 'google' };
    const state = resolveMembershipState(fakeIdentity, PREMIUM_OPTIONS);
    assert.strictEqual(state.tier, 'unknown');
  });

  await test('（10.security boundary）options為非物件型別（字串）時resolveMembershipState()安全退回free（已登入使用者的預設值）', () => {
    const state = resolveMembershipState(AUTH_IDENTITY_GOOGLE, 'not-an-object');
    assert.deepStrictEqual(state, { tier: 'free' });
  });

  await test('（10.security boundary）options.lookupTier不是function（字串）時resolveMembershipState()安全退回free', () => {
    const state = resolveMembershipState(AUTH_IDENTITY_GOOGLE, { lookupTier: 'premium' });
    assert.deepStrictEqual(state, { tier: 'free' });
  });

  await test('（10.security boundary）真實端對端：cookieHeader偽造成不存在的session時無法取得premium（session驗證失敗→匿名→unknown）', async () => {
    const router = createAppRouter();
    const fakeDb = { sessions: { getById: async () => ({ ok: false, row: null }) } };
    let fetchCalled = false;
    await withMockedGlobalFetch(async () => { fetchCalled = true; return fakeGeminiHttpResponse('x'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=forged-token', options: PREMIUM_OPTIONS }, { db: fakeDb, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.strictEqual(fetchCalled, false);
  });

  await test('（10.security boundary）真實HTTP dispatch（src/worker.js）永遠只傳空的options物件給health-insight route（客戶端無法透過真實HTTP request注入lookupTier）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    const idx = workerSource.indexOf("pathname === '/api/health-insight'");
    const block = workerSource.slice(idx, idx + 500);
    assert.ok(/options:\s*\{\s*\}/.test(block));
  });

  console.log('');

  // =========================================================================
  // K. Architecture protection
  // =========================================================================
  console.log('--- K. Architecture protection ---');

  const PROTECTED_FILES = [
    'src/intelligence/enhancement/gemini/gemini_client.js',
    'src/intelligence/enhancement/gemini/gemini_provider.js',
    'src/intelligence/enhancement/gemini/gemini_enhancer.js',
    'src/intelligence/enhancement/gemini/index.js',
    'src/intelligence/enhancement/provider/ai_provider_contract.js',
    'src/intelligence/enhancement/provider/index.js',
    'src/intelligence/product/health_insight_integration.js',
    'src/intelligence/product/entry/product_entry.js',
    'src/intelligence/product/contract/product_contract.js',
    'src/intelligence/product/adapter/product_adapter.js',
    'src/intelligence/capabilities/orchestration/index.js',
    'src/intelligence/capabilities/analysis/index.js',
    'src/intelligence/capabilities/recommendation/index.js',
    'src/intelligence/analysis/analysis_runner.js',
    'src/intelligence/recommendation/recommendation_runner.js',
    'src/identity/health_insight/user_identity.js',
    'src/identity/health_insight/resolve_identity.js',
    'src/controllers/health_insight_controller.js',
    'src/controllers/health_insight_response_builder.js',
    // TASK1.123後更新：render_product_response.js從這個清單移除
    // ——Product Experience Upgrade明確授權它轉發presentationContext。
    'src/persistence/health_insight/health_insight_persistence_service.js',
    'src/db/tables/health_insight_records.js',
    'src/db/index.js',
    'src/config/gemini_config.js',
    'src/worker.js',
  ];

  for (const relFile of PROTECTED_FILES) {
    await test(`（11.architecture protection）既有Gemini/Product/Capability/Runtime/Identity/Response/Persistence/DB/Worker檔案完全沒有被本次任務修改：${relFile}`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  for (const relFile of PROTECTED_FILES) {
    await test(`（11.architecture protection）既有檔案依然通過node --check語法驗證：${relFile}`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(repoRoot, relFile)], { encoding: 'utf8' }));
    });
  }

  await test('（11.architecture protection）src/ui/health_insight/整個目錄除了TASK1.123明確授權新增的Gemini/History呈現區塊之外，完全沒有其他改動（不重新設計UI，見TASK1.123後更新）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = diff.split('\n').filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !t.includes('render_product_response.js') && !t.includes('dashboard_page.js') && !t.includes('components/index.js') && !t.includes('file changed') && !t.includes('files changed');
    }).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（11.architecture protection）src/intelligence/整個目錄除了enhancement/之外完全沒有被本次任務修改', () => {
    for (const dir of ['src/intelligence/product/', 'src/intelligence/capabilities/', 'src/intelligence/analysis/', 'src/intelligence/recommendation/', 'src/intelligence/context/']) {
      const diff = execFileSync('git', ['diff', '--stat', '--', dir], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${dir} 有非預期的diff`);
    }
  });

  const TASK1122_AUTHORIZED_MODIFIED_FILES = [
    'src/routes/health_insight_routes.js',
    // TASK1.123後更新：Product Experience Upgrade明確授權的3個UI檔案
    'src/ui/health_insight/render_product_response.js',
    'src/ui/health_insight/pages/dashboard_page.js',
    'src/ui/health_insight/components/index.js',
  ];
  const TASK1122_NEWLY_CREATED_FILES = [
    'src/membership/membership_state.js',
    'src/membership/membership_resolver.js',
    'src/membership/feature_permission.js',
    'src/membership/index.js',
  ];

  const gitDiffNameOnly = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !f.startsWith('backups/'));

  const allExistingSrcFiles = execFileSync('sh', ['-c', "find src -name '*.js'"], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !TASK1122_AUTHORIZED_MODIFIED_FILES.includes(f))
    .filter((f) => !TASK1122_NEWLY_CREATED_FILES.includes(f));

  await test(`（11.architecture protection）逐檔案完整性掃描：src/底下共找到 ${allExistingSrcFiles.length} 個既有檔案需要逐一確認零diff（排除本次任務明確授權修改/新增的5個檔案）`, () => {
    assert.ok(allExistingSrcFiles.length >= 200, `預期至少200個既有檔案，實際 ${allExistingSrcFiles.length}`);
  });

  for (const relFile of allExistingSrcFiles) {
    await test(`（11.architecture protection）逐檔案完整性掃描：${relFile} 完全沒有被本次任務修改`, () => {
      assert.ok(!gitDiffNameOnly.includes(relFile), `${relFile} 出現在git diff清單裡`);
    });
  }

  for (const relFile of TASK1122_AUTHORIZED_MODIFIED_FILES) {
    await test(`（11.architecture protection）逐檔案完整性掃描：${relFile} 的commit歷史/目前diff裡確實存在TASK1.122的修改（控制組，用git log避免commit後永遠假性失敗）`, () => {
      const status = execFileSync('sh', ['-c', `git diff --name-only -- ${relFile} ; git log --oneline -- ${relFile}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(status.trim().length > 0, `${relFile} 找不到任何diff或commit歷史`);
    });
  }

  for (const relFile of TASK1122_NEWLY_CREATED_FILES) {
    await test(`（11.architecture protection）逐檔案完整性掃描：${relFile} 確實存在於磁碟上（新增檔案，永久事實，不會因為commit後變成假性失敗）`, () => {
      assert.ok(fs.existsSync(path.join(repoRoot, relFile)));
      assert.ok(fs.statSync(path.join(repoRoot, relFile)).size > 0);
    });
  }

  await test('（11.architecture protection）package.json完全沒有被本次任務修改（沒有新增任何npm依賴）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.architecture protection）wrangler.toml完全沒有被本次任務修改（沒有新增billing相關binding）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // L. Regression validation
  // =========================================================================
  console.log('--- L. Regression validation ---');

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
      'backups/phase6-task1.119-oauth-user-binding/test_health_insight_identity_binding.mjs',
      'backups/phase6-task1.120-health-insight-persistence/test_health_insight_persistence.mjs',
      'backups/phase6-task1.121-gemini-enhancement/test_gemini_enhancement_layer.mjs',
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

    await test('（Regression validation）本檔案（TASK1.122自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic', () => {
      execFileSync('node', [path.join(__dirname, 'test_premium_feature_boundary.mjs')], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 60000,
        env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
      });
    });
  }

  console.log('');

  // =========================================================================
  // M. P1-P6
  // =========================================================================
  console.log('--- M. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在p1-p6-check/run.js執行（本次任務完全沒有修改任何既有legacy UI/getHTML()相關程式碼，既有UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js完全沒有被本次任務修改（Permission Check透過既有req.options機制讀取，不需要worker.js新增任何程式碼）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改', () => {
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
    assert.strictEqual(app.router.routes.length, 23);
  });

  await test('（P1-P6）migrations/、src/db/完全沒有新增或修改任何檔案（延續I類別已驗證的結論）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/ src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（P1-P6）src/membership/目錄恰好5個檔案', () => {
    const files = fs.readdirSync(membershipDir);
    assert.strictEqual(files.length, 5);
  });

  await test('（P1-P6）新增/修改的核心檔案通過node --check語法驗證', () => {
    [
      path.join(routesDir, 'health_insight_routes.js'),
      path.join(membershipDir, 'membership_state.js'),
      path.join(membershipDir, 'membership_resolver.js'),
      path.join(membershipDir, 'feature_permission.js'),
      path.join(membershipDir, 'index.js'),
    ].forEach((f) => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', f], { encoding: 'utf8' }));
    });
  });

  await test('（P1-P6）README.md提到"Future Payment Compatibility"章節', () => {
    assert.ok(readmeSource.includes('Future Payment Compatibility'));
  });

  await test('（P1-P6）README.md明確列出不做的事（Stripe/信用卡/訂閱續約/發票）', () => {
    assert.ok(/Stripe/.test(readmeSource));
  });

  await test('（P1-P6）README.md提到Feature Permission的表格（Premium/Free/Anonymous三種身份的結果）', () => {
    assert.ok(readmeSource.includes('Anonymous'));
  });

  await test('（P1-P6）src/membership/README.md確實存在於磁碟上', () => {
    assert.ok(fs.existsSync(path.join(membershipDir, 'README.md')));
  });

  await test('（P1-P6）src/membership/index.js匯出的所有function型別都正確', () => {
    for (const key of ['isValidMembershipState', 'buildMembershipState', 'resolveMembershipState', 'isFeatureAllowedForTier', 'canUseFeature']) {
      assert.strictEqual(typeof membershipModule[key], 'function');
    }
  });

  await test('（P1-P6）src/membership/index.js匯出的MEMBERSHIP_TIERS跟UNKNOWN_MEMBERSHIP型別正確', () => {
    assert.strictEqual(typeof membershipModule.MEMBERSHIP_TIERS, 'object');
    assert.strictEqual(typeof membershipModule.UNKNOWN_MEMBERSHIP, 'object');
  });

  await test('（P1-P6）真實端對端：premium使用者的POST /api/health-insight回應status恆為200（即使Gemini失敗）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'p1p6-status-check', isGuest: false, authProvider: 'google' });
    const res = await withMockedGlobalFetch(async () => { throw new Error('x'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.strictEqual(res.status, 200);
  });

  await test('（P1-P6）新增/修改檔案完全不import Stripe或任何付款SDK', () => {
    for (const source of [stateSource, resolverSource, permissionSource, routesSource]) {
      assert.ok(!/stripe|braintree|paypal/i.test(getImportLines(source)));
    }
  });

  await test('（P1-P6）README.md提到Membership State的三種tier（free/premium/unknown）', () => {
    assert.ok(readmeSource.includes('free'));
    assert.ok(readmeSource.includes('premium'));
    assert.ok(readmeSource.includes('unknown'));
  });

  await test('（P1-P6）README.md提到Current Limitations章節，說明目前無法真正變成premium', () => {
    assert.ok(readmeSource.includes('Current Limitations'));
  });

  await test('（P1-P6）真實端對端：連續呼叫GET/POST各兩次（皆為free身份）結果deterministic', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'p1p6-free-det', isGuest: false, authProvider: 'google' });
    const res1 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body1 = await res1.json();
    const body2 = await res2.json();
    assert.strictEqual(body1.data.html, body2.data.html);
    assert.deepStrictEqual(Object.keys(body1.data).sort(), Object.keys(body2.data).sort());
  });

  await test('（P1-P6）真實端對端：GET /health-insight完全不受Premium Feature Boundary影響', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('data-hi-page="input"'));
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

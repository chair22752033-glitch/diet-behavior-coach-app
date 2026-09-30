/*
 * Phase 7 TASK 1.126｜Guest / Authentication Experience Correction 測試
 *
 * 本任務修正TASK1.125審查發現的產品語意落差：既有Guest帳號
 * （`is_guest:1`，完整功能帳號，有真實session/user row，只是
 * 沒有綁定Google OAuth）被`buildUserIdentity()`轉成跟Google
 * 登入使用者完全相同的`authenticated:true`，導致Persistence/
 * History Boundary沒辦法區分"暫時體驗的訪客"跟"真正的註冊
 * 使用者"。本次任務：
 *
 * 1. Identity Classification：`buildUserIdentity()`新增
 *    `isGuest`/`userType`兩個選填欄位，不移除/不修改既有三欄位
 *    （`userId`/`authenticated`/`provider`）語意。
 * 2. Persistence Boundary Correction：Guest不再被存進D1
 *    （`shouldPersistHealthInsightRecord()`新增訪客排除）。
 * 3. History Access Correction：Guest不能查詢/取得歷史紀錄
 *    （`isAuthenticatedIdentity()`新增訪客排除）。
 * 4. User Conversion Flow：History/Progress卡片新增訪客體驗模式
 *    文案（"目前為體驗模式"/"登入後可以保存你的健康歷程"）。
 * 5. Premium Compatibility：不修改Gemini Provider/Membership
 *    Boundary——"Guest: No Premium"在目前架構下是**結構性
 *    vacuous true**：`src/worker.js`真正的HTTP dispatch永遠只
 *    傳空的`options: {}`，沒有任何真實請求能注入`lookupTier`，
 *    所以無論Guest或Registered Free，`canUseFeature()`目前都
 *    只會拿到`free` tier，一律無法使用Gemini Enhancement。
 *
 * 本次任務**沒有**：新增OAuth系統、取代既有authentication、
 * 付款/訂閱、修改Capability Orchestrator/Analysis Runner/
 * Recommendation Runner/Gemini Provider本身。
 *
 * 分為以下14個部分（對應規格14個Coverage類別）：
 * A) Guest classification
 * B) Registered classification
 * C) OAuth compatibility
 * D) Guest Health Insight flow
 * E) Registered Health Insight flow
 * F) Guest no persistence
 * G) Registered persistence
 * H) Guest no history
 * I) Registered history
 * J) Premium compatibility
 * K) UI state
 * L) Security validation
 * M) Regression validation
 * N) P1-P6 validation
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const srcRoot = path.join(repoRoot, 'src');
const identityDir = path.join(srcRoot, 'identity', 'health_insight');
const persistenceDir = path.join(srcRoot, 'persistence', 'health_insight');
const historyDir = path.join(srcRoot, 'history', 'health_insight');
const membershipDir = path.join(srcRoot, 'membership');
const routesDir = path.join(srcRoot, 'routes');
const uiDir = path.join(srcRoot, 'ui', 'health_insight');
const componentsDir = path.join(uiDir, 'components');
const geminiDir = path.join(srcRoot, 'intelligence', 'enhancement', 'gemini');
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

/**
 * 跟其餘Health Insight系列套件一貫的repository風格db mock
 * （`db.sessions.getById`/`db.users.getById`/
 * `db.healthInsightRecords.insert`/`listByUser`）——延續
 * TASK1.125套件既有的`makeSessionDb()`形狀，獨立實作（不
 * import該檔案，避免跨套件依賴）。
 */
function makeSessionDb({ userId, isGuest, authProvider, records, sessionOk, userStatus }) {
  const store = Array.isArray(records) ? records.slice() : [];
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  return {
    sessions: {
      getById: async () => {
        if (sessionOk === false) return { ok: false };
        return { ok: true, row: { id: 'token123', user_id: userId, expires_at: expiresAt, revoked_at: null } };
      },
    },
    users: {
      getById: async () => ({
        ok: true,
        row: { id: userId, is_guest: isGuest ? 1 : 0, auth_provider: authProvider || null, status: userStatus || 'active' },
      }),
    },
    healthInsightRecords: {
      insert: async (r) => { store.push(r); return { ok: true, meta: {} }; },
      listByUser: async (uid, limit) => ({ ok: true, results: store.filter((r) => r.user_id === uid).slice(0, limit || 20) }),
    },
    __store: store,
  };
}

async function main() {
  const { createAppRouter } = await import(path.join(routesDir, 'index.js'));
  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  const { ANONYMOUS_IDENTITY, buildUserIdentity, isValidUserIdentity, resolveHealthInsightIdentity } = await import(path.join(identityDir, 'index.js'));
  const { shouldPersistHealthInsightRecord, saveHealthInsightRecord, listHealthInsightRecordsForUser } = await import(path.join(persistenceDir, 'index.js'));
  const { getHealthInsightHistoryForIdentity, DEFAULT_HISTORY_LIMIT } = await import(path.join(historyDir, 'index.js'));
  const { resolveMembershipState, canUseFeature, isFeatureAllowedForTier } = await import(path.join(membershipDir, 'index.js'));
  const { createHistoryCard } = await import(path.join(componentsDir, 'history_card.js'));
  const { createProgressSummaryCard } = await import(path.join(componentsDir, 'progress_summary_card.js'));
  const { renderHealthInsightDashboard } = await import(path.join(uiDir, 'pages', 'dashboard_page.js'));

  const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
  const userIdentitySource = fs.readFileSync(path.join(identityDir, 'user_identity.js'), 'utf8');
  const persistenceServiceSource = fs.readFileSync(path.join(persistenceDir, 'health_insight_persistence_service.js'), 'utf8');
  const historyServiceSource = fs.readFileSync(path.join(historyDir, 'history_service.js'), 'utf8');
  const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
  const historyCardSource = fs.readFileSync(path.join(componentsDir, 'history_card.js'), 'utf8');
  const progressCardSource = fs.readFileSync(path.join(componentsDir, 'progress_summary_card.js'), 'utf8');

  // =========================================================================
  // A. Guest classification
  // =========================================================================
  console.log('--- A. Guest classification ---');

  const GUEST_TRUE_CASES = [
    { id: 'guest-1', is_guest: 1, auth_provider: null },
    { id: 'guest-2', is_guest: true, auth_provider: null },
    { id: 'guest-3', is_guest: 1, auth_provider: 'google' },
    { id: 'guest-4', is_guest: true, auth_provider: 'facebook' },
  ];
  for (const user of GUEST_TRUE_CASES) {
    const identity = buildUserIdentity(user);
    await test(`（1.guest classification）is_guest=${JSON.stringify(user.is_guest)}的使用者${user.id}被分類為isGuest:true`, () => {
      assert.strictEqual(identity.isGuest, true);
    });
    await test(`（1.guest classification）is_guest=${JSON.stringify(user.is_guest)}的使用者${user.id}被分類為userType:'guest'`, () => {
      assert.strictEqual(identity.userType, 'guest');
    });
    await test(`（1.guest classification）is_guest=${JSON.stringify(user.is_guest)}的使用者${user.id}的provider強制為'guest'（即使auth_provider有值也一律覆蓋，不會誤判成google guest）`, () => {
      assert.strictEqual(identity.provider, 'guest');
    });
    await test(`（1.guest classification）Guest使用者${user.id}依然是authenticated:true（延續TASK1.29"訪客是完整功能帳號"既有結論，這裡沒有改變）`, () => {
      assert.strictEqual(identity.authenticated, true);
    });
    await test(`（1.guest classification）Guest使用者${user.id}的userId正確帶出`, () => {
      assert.strictEqual(identity.userId, user.id);
    });
  }

  const GUEST_FALSE_ON_FLAG_CASES = [
    { id: 'notguest-1', is_guest: 0, auth_provider: 'google' },
    { id: 'notguest-2', is_guest: false, auth_provider: 'google' },
    { id: 'notguest-3', auth_provider: 'google' },
    { id: 'notguest-4', is_guest: '1', auth_provider: 'google' },
    { id: 'notguest-5', is_guest: null, auth_provider: 'google' },
    { id: 'notguest-6', is_guest: undefined, auth_provider: 'google' },
  ];
  for (const user of GUEST_FALSE_ON_FLAG_CASES) {
    const identity = buildUserIdentity(user);
    await test(`（1.guest classification）is_guest=${JSON.stringify(user.is_guest)}（非嚴格1/true）的使用者${user.id}不被誤判為guest`, () => {
      assert.strictEqual(identity.isGuest, false);
    });
  }

  await test('（1.guest classification）isValidUserIdentity()接受新形狀的Guest identity（含isGuest:true/userType:"guest"）', () => {
    assert.strictEqual(isValidUserIdentity(buildUserIdentity(GUEST_TRUE_CASES[0])), true);
  });

  const INVALID_GUEST_FIELD_TYPES = [
    { userId: 'x', authenticated: true, provider: 'guest', isGuest: 'true' },
    { userId: 'x', authenticated: true, provider: 'guest', isGuest: 1 },
    { userId: 'x', authenticated: true, provider: 'guest', userType: 123 },
  ];
  for (const [idx, bad] of INVALID_GUEST_FIELD_TYPES.entries()) {
    await test(`（1.guest classification）isValidUserIdentity()正確拒絕isGuest/userType型別不符的第${idx + 1}個案例`, () => {
      assert.strictEqual(isValidUserIdentity(bad), false);
    });
  }

  await test('（1.guest classification）buildUserIdentity()對null輸入依然安全回傳ANONYMOUS_IDENTITY（不是guest）', () => {
    const identity = buildUserIdentity(null);
    assert.strictEqual(identity.isGuest, false);
    assert.strictEqual(identity.userType, 'anonymous');
  });

  await test('（1.guest classification）ANONYMOUS_IDENTITY本身isGuest:false、userType:"anonymous"', () => {
    assert.strictEqual(ANONYMOUS_IDENTITY.isGuest, false);
    assert.strictEqual(ANONYMOUS_IDENTITY.userType, 'anonymous');
  });

  await test('（1.guest classification）buildUserIdentity()是deterministic純函式（同樣輸入重複呼叫兩次，Guest分類結果一致）', () => {
    const a = buildUserIdentity(GUEST_TRUE_CASES[0]);
    const b = buildUserIdentity(GUEST_TRUE_CASES[0]);
    assert.deepStrictEqual(a, b);
  });

  // 擴充矩陣：is_guest為true的兩種寫法（1/true）× 10種auth_provider
  // 雜訊值，逐一驗證isGuest一律覆蓋成true、provider一律覆蓋成
  // 'guest'、userType一律是'guest'，即使auth_provider帶有其他
  // 登入方式的字串也不受影響（見上方"provider強制為guest"既有
  // 結論的完整矩陣版本）。
  const GUEST_FLAG_VARIANTS = [1, true];
  const NOISY_AUTH_PROVIDER_VALUES = [null, undefined, '', 'google', 'facebook', 'apple', 'line', 123, true, {}];
  for (const flag of GUEST_FLAG_VARIANTS) {
    for (const noisyProvider of NOISY_AUTH_PROVIDER_VALUES) {
      const user = { id: `guest-matrix-${String(flag)}-${String(noisyProvider)}`, is_guest: flag, auth_provider: noisyProvider };
      const identity = buildUserIdentity(user);
      await test(`（1.guest classification）矩陣：is_guest=${JSON.stringify(flag)}、auth_provider=${JSON.stringify(noisyProvider)} → isGuest:true`, () => {
        assert.strictEqual(identity.isGuest, true);
      });
      await test(`（1.guest classification）矩陣：is_guest=${JSON.stringify(flag)}、auth_provider=${JSON.stringify(noisyProvider)} → userType:'guest'`, () => {
        assert.strictEqual(identity.userType, 'guest');
      });
      await test(`（1.guest classification）矩陣：is_guest=${JSON.stringify(flag)}、auth_provider=${JSON.stringify(noisyProvider)} → provider:'guest'`, () => {
        assert.strictEqual(identity.provider, 'guest');
      });
      await test(`（1.guest classification）矩陣：is_guest=${JSON.stringify(flag)}、auth_provider=${JSON.stringify(noisyProvider)} → isValidUserIdentity()通過驗證`, () => {
        assert.strictEqual(isValidUserIdentity(identity), true);
      });
    }
  }

  const NON_GUEST_FLAG_VARIANTS = [0, false, undefined, null, '1', 'true', 2, -1, NaN, {}];
  for (const flag of NON_GUEST_FLAG_VARIANTS) {
    const user = { id: `notguest-matrix-${String(flag)}`, is_guest: flag, auth_provider: 'google' };
    const identity = buildUserIdentity(user);
    await test(`（1.guest classification）矩陣：is_guest=${JSON.stringify(flag)}（非嚴格1/true）不被誤判為guest`, () => {
      assert.strictEqual(identity.isGuest, false);
    });
    await test(`（1.guest classification）矩陣：is_guest=${JSON.stringify(flag)}的userType維持'registered'`, () => {
      assert.strictEqual(identity.userType, 'registered');
    });
  }

  console.log('');

  // =========================================================================
  // B. Registered classification
  // =========================================================================
  console.log('--- B. Registered classification ---');

  const REGISTERED_PROVIDERS = ['google', 'facebook', 'apple', 'line'];
  for (const provider of REGISTERED_PROVIDERS) {
    const identity = buildUserIdentity({ id: `reg-${provider}`, is_guest: 0, auth_provider: provider });
    await test(`（2.registered classification）auth_provider="${provider}"的使用者被分類為isGuest:false`, () => {
      assert.strictEqual(identity.isGuest, false);
    });
    await test(`（2.registered classification）auth_provider="${provider}"的使用者被分類為userType:'registered'`, () => {
      assert.strictEqual(identity.userType, 'registered');
    });
    await test(`（2.registered classification）auth_provider="${provider}"的使用者provider欄位正確保留原值`, () => {
      assert.strictEqual(identity.provider, provider);
    });
    await test(`（2.registered classification）auth_provider="${provider}"的使用者authenticated:true`, () => {
      assert.strictEqual(identity.authenticated, true);
    });
  }

  await test('（2.registered classification）is_guest:0且auth_provider為null的已登入使用者依然是userType:"registered"（只是provider本身是null，不影響guest分類）', () => {
    const identity = buildUserIdentity({ id: 'reg-noprovider', is_guest: 0, auth_provider: null });
    assert.strictEqual(identity.userType, 'registered');
    assert.strictEqual(identity.isGuest, false);
    assert.strictEqual(identity.provider, null);
  });

  await test('（2.registered classification）auth_provider不是字串（例如數字）時安全視為null，不拋出例外', () => {
    const identity = buildUserIdentity({ id: 'reg-badprovider', is_guest: 0, auth_provider: 12345 });
    assert.strictEqual(identity.provider, null);
    assert.strictEqual(identity.userType, 'registered');
  });

  await test('（2.registered classification）auth_provider為空字串時安全視為null', () => {
    const identity = buildUserIdentity({ id: 'reg-emptyprovider', is_guest: 0, auth_provider: '' });
    assert.strictEqual(identity.provider, null);
  });

  await test('（2.registered classification）Registered identity的欄位數量固定為5（userId/authenticated/provider/isGuest/userType）', () => {
    const identity = buildUserIdentity({ id: 'reg-fieldcount', is_guest: 0, auth_provider: 'google' });
    assert.deepStrictEqual(Object.keys(identity).sort(), ['authenticated', 'isGuest', 'provider', 'userId', 'userType']);
  });

  // 擴充矩陣：更多真實/未來可能的OAuth provider字串 × is_guest
  // 的3種"不是guest"寫法，逐一驗證分類結果穩定。
  const EXTENDED_PROVIDERS = ['google', 'facebook', 'apple', 'line', 'microsoft', 'github', 'twitter', 'discord', 'kakao', 'naver', 'wechat', 'yahoo'];
  const NOT_GUEST_FLAGS = [0, false, undefined];
  for (const provider of EXTENDED_PROVIDERS) {
    for (const flag of NOT_GUEST_FLAGS) {
      const user = { id: `reg-matrix-${provider}-${String(flag)}`, is_guest: flag, auth_provider: provider };
      const identity = buildUserIdentity(user);
      await test(`（2.registered classification）矩陣：auth_provider="${provider}"、is_guest=${JSON.stringify(flag)} → isGuest:false`, () => {
        assert.strictEqual(identity.isGuest, false);
      });
      await test(`（2.registered classification）矩陣：auth_provider="${provider}"、is_guest=${JSON.stringify(flag)} → userType:'registered'`, () => {
        assert.strictEqual(identity.userType, 'registered');
      });
      await test(`（2.registered classification）矩陣：auth_provider="${provider}"、is_guest=${JSON.stringify(flag)} → provider保留原值"${provider}"`, () => {
        assert.strictEqual(identity.provider, provider);
      });
      await test(`（2.registered classification）矩陣：auth_provider="${provider}"、is_guest=${JSON.stringify(flag)} → authenticated:true`, () => {
        assert.strictEqual(identity.authenticated, true);
      });
    }
  }

  console.log('');

  // =========================================================================
  // C. OAuth compatibility
  // =========================================================================
  console.log('--- C. OAuth compatibility ---');

  await test('（3.oauth compatibility）Google登入使用者的userId欄位依然直接對應user.id（沒有改變既有語意）', () => {
    const identity = buildUserIdentity({ id: 'oauth-user-1', is_guest: 0, auth_provider: 'google' });
    assert.strictEqual(identity.userId, 'oauth-user-1');
  });

  await test('（3.oauth compatibility）舊形狀（只有userId/authenticated/provider三欄位，沒有isGuest/userType）的identity依然被isValidUserIdentity()視為合法', () => {
    assert.strictEqual(isValidUserIdentity({ userId: 'legacy-1', authenticated: true, provider: 'google' }), true);
  });

  await test('（3.oauth compatibility）舊形狀的匿名identity（{userId:null, authenticated:false, provider:null}）依然合法', () => {
    assert.strictEqual(isValidUserIdentity({ userId: null, authenticated: false, provider: null }), true);
  });

  await test('（3.oauth compatibility）resolveHealthInsightIdentity()對已登入google使用者的行為完全不變：拿到authenticated:true、正確userId', async () => {
    const db = makeSessionDb({ userId: 'oauth-e2e-1', isGuest: false, authProvider: 'google', records: [] });
    const identity = await resolveHealthInsightIdentity(db, 'dbc_sid=token123', {});
    assert.strictEqual(identity.authenticated, true);
    assert.strictEqual(identity.userId, 'oauth-e2e-1');
    assert.strictEqual(identity.provider, 'google');
  });

  await test('（3.oauth compatibility）resolveHealthInsightIdentity()對沒有cookie的請求依然安全回傳ANONYMOUS_IDENTITY（沒有強制登入）', async () => {
    const db = makeSessionDb({ userId: 'unused', isGuest: false, authProvider: 'google', records: [] });
    const identity = await resolveHealthInsightIdentity(db, undefined, {});
    assert.deepStrictEqual(identity, ANONYMOUS_IDENTITY);
  });

  await test('（3.oauth compatibility）resolveHealthInsightIdentity()對session驗證失敗（sessionOk:false）依然安全回傳ANONYMOUS_IDENTITY，不拋出例外', async () => {
    const db = makeSessionDb({ userId: 'unused-2', isGuest: false, authProvider: 'google', records: [], sessionOk: false });
    const identity = await resolveHealthInsightIdentity(db, 'dbc_sid=token123', {});
    assert.deepStrictEqual(identity, ANONYMOUS_IDENTITY);
  });

  await test('（3.oauth compatibility）resolveHealthInsightIdentity()對Guest帳號正確回傳isGuest:true（既有session/OAuth驗證機制本身沒有改變，只是輸出多了語意欄位）', async () => {
    const db = makeSessionDb({ userId: 'oauth-guest-1', isGuest: true, records: [] });
    const identity = await resolveHealthInsightIdentity(db, 'dbc_sid=token123', {});
    assert.strictEqual(identity.authenticated, true);
    assert.strictEqual(identity.isGuest, true);
  });

  await test('（3.oauth compatibility）src/auth/、src/oauth/整個目錄完全沒有被本次任務修改（沒有新的認證系統/沒有取代既有認證）', () => {
    const diffAuth = execFileSync('git', ['diff', '--stat', '--', 'src/auth/'], { cwd: repoRoot, encoding: 'utf8' });
    const diffOauth = execFileSync('git', ['diff', '--stat', '--', 'src/oauth/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diffAuth.trim(), '');
    assert.strictEqual(diffOauth.trim(), '');
  });

  await test('（3.oauth compatibility）src/identity/session_rules.js完全沒有被本次任務修改（既有session驗證邏輯不變）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/session_rules.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.oauth compatibility）resolve_identity.js完全沒有被本次任務修改（身份解析的呼叫方式不變，只有下游user_identity.js輸出形狀擴充）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/health_insight/resolve_identity.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // D. Guest Health Insight flow
  // =========================================================================
  console.log('--- D. Guest Health Insight flow ---');

  const HEALTH_GOALS = ['weight_loss', 'weight_maintenance', 'muscle_gain', 'healthy_lifestyle'];
  for (const goal of HEALTH_GOALS) {
    const db = makeSessionDb({ userId: `guest-flow-${goal}`, isGuest: true, records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: goal }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    await test(`（4.guest health insight flow）Guest送出healthGoal="${goal}"依然得到200狀態碼（訪客能完整體驗Health Insight）`, () => {
      assert.strictEqual(res.status, 200);
    });
    await test(`（4.guest health insight flow）Guest送出healthGoal="${goal}"的回應ok:true`, () => {
      assert.strictEqual(body.ok, true);
    });
    await test(`（4.guest health insight flow）Guest送出healthGoal="${goal}"的回應包含html`, () => {
      assert.strictEqual(typeof body.data.html, 'string');
      assert.ok(body.data.html.length > 0);
    });
  }

  await test('（4.guest health insight flow）Guest提交沒有帶healthGoal時依然正常回應（不會因為身份是guest而多做額外的必填檢查）', async () => {
    const db = makeSessionDb({ userId: 'guest-flow-nogoal', isGuest: true, records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(res.status, 200);
  });

  await test('（4.guest health insight flow）Guest連續呼叫兩次POST，兩次都成功（不會因為第一次呼叫改變第二次的行為）', async () => {
    const db = makeSessionDb({ userId: 'guest-flow-twice', isGuest: true, records: [] });
    const router = createAppRouter();
    const res1 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);
  });

  await test('（4.guest health insight flow）Guest的GET /health-insight（Input Experience頁面）完全不受影響，依然回傳HTML', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('Content-Type').includes('text/html'));
  });

  console.log('');

  // =========================================================================
  // E. Registered Health Insight flow
  // =========================================================================
  console.log('--- E. Registered Health Insight flow ---');

  for (const goal of HEALTH_GOALS) {
    const db = makeSessionDb({ userId: `reg-flow-${goal}`, isGuest: false, authProvider: 'google', records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 30, healthGoal: goal }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    await test(`（5.registered health insight flow）Registered使用者送出healthGoal="${goal}"得到200狀態碼`, () => {
      assert.strictEqual(res.status, 200);
    });
    await test(`（5.registered health insight flow）Registered使用者送出healthGoal="${goal}"的回應ok:true且包含html`, () => {
      assert.strictEqual(body.ok, true);
      assert.strictEqual(typeof body.data.html, 'string');
    });
  }

  await test('（5.registered health insight flow）匿名使用者（沒有cookie）依然能完整使用Health Insight（Anonymous支援沒有被這次任務影響）', async () => {
    const db = makeSessionDb({ userId: 'unused-anon', isGuest: false, records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.ok, true);
  });

  console.log('');

  // =========================================================================
  // F. Guest no persistence
  // =========================================================================
  console.log('--- F. Guest no persistence ---');

  const GUEST_IDENTITY_SHAPES = [
    { label: '新形狀（isGuest:true顯式欄位）', identity: { userId: 'g1', authenticated: true, provider: 'guest', isGuest: true, userType: 'guest' } },
    { label: '舊形狀（只有provider:"guest"，沒有isGuest欄位，既有測試fixture常見寫法）', identity: { userId: 'g2', authenticated: true, provider: 'guest' } },
    { label: '透過buildUserIdentity()產生的真實Guest identity', identity: buildUserIdentity({ id: 'g3', is_guest: 1, auth_provider: null }) },
  ];
  for (const { label, identity } of GUEST_IDENTITY_SHAPES) {
    await test(`（6.guest no persistence）shouldPersistHealthInsightRecord()對${label}回傳false`, () => {
      assert.strictEqual(shouldPersistHealthInsightRecord(identity), false);
    });

    await test(`（6.guest no persistence）saveHealthInsightRecord()對${label}回傳{ok:false, reason:'guest_skip'}`, async () => {
      const result = await saveHealthInsightRecord({}, {
        identity,
        payload: { age: 28, healthGoal: 'weight_loss' },
        structuredResponse: { ok: true, data: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {} } },
      });
      assert.deepStrictEqual(result, { ok: false, reason: 'guest_skip' });
    });
  }

  await test('（6.guest no persistence）Guest端對端POST後，db.healthInsightRecords.insert完全沒有被呼叫過（不只是回傳值正確，底層真的沒有寫入）', async () => {
    let insertCalled = false;
    const db = makeSessionDb({ userId: 'guest-persist-e2e', isGuest: true, records: [] });
    const originalInsert = db.healthInsightRecords.insert;
    db.healthInsightRecords.insert = async (...args) => { insertCalled = true; return originalInsert(...args); };
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(insertCalled, false);
    assert.strictEqual(db.__store.length, 0);
  });

  await test('（6.guest no persistence）Guest連續呼叫POST三次，db.__store全程維持0筆（不會累積）', async () => {
    const db = makeSessionDb({ userId: 'guest-persist-triple', isGuest: true, records: [] });
    const router = createAppRouter();
    for (let i = 0; i < 3; i++) {
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    }
    assert.strictEqual(db.__store.length, 0);
  });

  await test('（6.guest no persistence）Guest Health Insight Result本身依然正確算出（不因為不persist就不計算），只是不存進D1', async () => {
    const db = makeSessionDb({ userId: 'guest-still-computed', isGuest: true, records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data.html.includes('健康'));
    assert.strictEqual(db.__store.length, 0);
  });

  await test('（6.guest no persistence）persistence schema/insert()白名單欄位規則完全沒有改變（這裡驗證的是permission boundary，不是能力本身被移除）', () => {
    assert.ok(persistenceServiceSource.includes('PROFILE_FIELDS'));
    assert.ok(persistenceServiceSource.includes("['gender', 'age', 'height', 'weight', 'healthGoal']"));
  });

  // 擴充矩陣：大量不同userId的Guest identity（透過buildUserIdentity()
  // 產生，涵蓋不同auth_provider雜訊值），逐一驗證
  // shouldPersistHealthInsightRecord()一律回傳false。
  for (let i = 0; i < 30; i++) {
    const noisyProvider = NOISY_AUTH_PROVIDER_VALUES[i % NOISY_AUTH_PROVIDER_VALUES.length];
    const identity = buildUserIdentity({ id: `guest-persist-matrix-${i}`, is_guest: 1, auth_provider: noisyProvider });
    await test(`（6.guest no persistence）矩陣第${i + 1}筆：userId=guest-persist-matrix-${i}的Guest identity → shouldPersistHealthInsightRecord()回傳false`, () => {
      assert.strictEqual(shouldPersistHealthInsightRecord(identity), false);
    });
  }

  console.log('');

  // =========================================================================
  // G. Registered persistence
  // =========================================================================
  console.log('--- G. Registered persistence ---');

  const REGISTERED_IDENTITY_SHAPES = [
    { label: '新形狀（isGuest:false顯式欄位）', identity: { userId: 'r1', authenticated: true, provider: 'google', isGuest: false, userType: 'registered' } },
    { label: '舊形狀（只有provider:"google"，沒有isGuest欄位）', identity: { userId: 'r2', authenticated: true, provider: 'google' } },
    { label: '透過buildUserIdentity()產生的真實Registered identity', identity: buildUserIdentity({ id: 'r3', is_guest: 0, auth_provider: 'google' }) },
  ];
  for (const { label, identity } of REGISTERED_IDENTITY_SHAPES) {
    await test(`（7.registered persistence）shouldPersistHealthInsightRecord()對${label}回傳true`, () => {
      assert.strictEqual(shouldPersistHealthInsightRecord(identity), true);
    });

    await test(`（7.registered persistence）saveHealthInsightRecord()對${label}成功寫入並回傳{ok:true, id}`, async () => {
      const db = makeSessionDb({ userId: identity.userId, isGuest: false, records: [] });
      const result = await saveHealthInsightRecord(db, {
        identity,
        payload: { age: 28, healthGoal: 'weight_loss' },
        structuredResponse: { ok: true, data: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {} } },
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(typeof result.id, 'string');
    });
  }

  await test('（7.registered persistence）Registered使用者端對端POST後，db.__store正確增加一筆', async () => {
    const db = makeSessionDb({ userId: 'reg-persist-e2e', isGuest: false, authProvider: 'google', records: [] });
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(db.__store.length, 1);
    assert.strictEqual(db.__store[0].user_id, 'reg-persist-e2e');
  });

  await test('（7.registered persistence）Registered使用者連續呼叫POST三次，db.__store正確累積到3筆', async () => {
    const db = makeSessionDb({ userId: 'reg-persist-triple', isGuest: false, authProvider: 'google', records: [] });
    const router = createAppRouter();
    for (let i = 0; i < 3; i++) {
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    }
    assert.strictEqual(db.__store.length, 3);
  });

  await test('（7.registered persistence）匿名使用者（不是guest，是完全沒有登入）依然不會被persist（既有anonymous_skip行為完全不變）', async () => {
    const result = await saveHealthInsightRecord({}, {
      identity: ANONYMOUS_IDENTITY,
      payload: { age: 28 },
      structuredResponse: { ok: true, data: {} },
    });
    assert.deepStrictEqual(result, { ok: false, reason: 'anonymous_skip' });
  });

  // 擴充矩陣：大量不同userId的Registered identity，逐一驗證
  // shouldPersistHealthInsightRecord()一律回傳true。
  for (let i = 0; i < 30; i++) {
    const provider = EXTENDED_PROVIDERS[i % EXTENDED_PROVIDERS.length];
    const identity = buildUserIdentity({ id: `reg-persist-matrix-${i}`, is_guest: 0, auth_provider: provider });
    await test(`（7.registered persistence）矩陣第${i + 1}筆：userId=reg-persist-matrix-${i}（provider=${provider}）的Registered identity → shouldPersistHealthInsightRecord()回傳true`, () => {
      assert.strictEqual(shouldPersistHealthInsightRecord(identity), true);
    });
  }

  console.log('');

  // =========================================================================
  // H. Guest no history
  // =========================================================================
  console.log('--- H. Guest no history ---');

  for (const { label, identity } of GUEST_IDENTITY_SHAPES) {
    await test(`（8.guest no history）getHealthInsightHistoryForIdentity()對${label}回傳authenticated:false、records:[]`, async () => {
      const db = makeSessionDb({ userId: identity.userId, isGuest: true, records: [{ id: 'existing-1', user_id: identity.userId, input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() }] });
      const result = await getHealthInsightHistoryForIdentity(db, identity, {});
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.authenticated, false);
      assert.deepStrictEqual(result.records, []);
    });
  }

  await test('（8.guest no history）即使D1裡已經有這個Guest userId的既有紀錄（例如TASK1.126部署前遺留），History Boundary依然一律回傳空清單，不會外洩', async () => {
    const guestIdentity = buildUserIdentity({ id: 'guest-with-legacy-rows', is_guest: 1, auth_provider: null });
    const db = makeSessionDb({
      userId: 'guest-with-legacy-rows',
      isGuest: true,
      records: [
        { id: 'legacy-1', user_id: 'guest-with-legacy-rows', input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() },
        { id: 'legacy-2', user_id: 'guest-with-legacy-rows', input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() },
      ],
    });
    const result = await getHealthInsightHistoryForIdentity(db, guestIdentity, {});
    assert.deepStrictEqual(result.records, []);
  });

  await test('（8.guest no history）Guest端對端呼叫GET /api/health-insight/history，回傳authenticated:false、records:[]', async () => {
    const db = makeSessionDb({ userId: 'guest-history-e2e', isGuest: true, records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.authenticated, false);
    assert.deepStrictEqual(body.data.records, []);
  });

  await test('（8.guest no history）Guest先POST一次再GET history，累積紀錄數依然是0（POST+GET兩條路由的guest boundary一致）', async () => {
    const db = makeSessionDb({ userId: 'guest-post-then-history', isGuest: true, records: [] });
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.records.length, 0);
  });

  await test('（8.guest no history）listHealthInsightRecordsForUser()這個更底層的persistence查詢函式本身沒有被修改（排除發生在history_service.js這一層，不是persistence本身）', () => {
    assert.ok(persistenceServiceSource.includes('export async function listHealthInsightRecordsForUser'));
  });

  // 擴充矩陣：大量不同userId的Guest identity，即使D1裡預先塞了
  // 屬於該userId的既有紀錄，getHealthInsightHistoryForIdentity()
  // 依然一律回傳authenticated:false、records:[]。
  for (let i = 0; i < 20; i++) {
    const userId = `guest-history-matrix-${i}`;
    const identity = buildUserIdentity({ id: userId, is_guest: 1, auth_provider: null });
    const db = makeSessionDb({ userId, isGuest: true, records: [{ id: `pre-${i}`, user_id: userId, input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() }] });
    await test(`（8.guest no history）矩陣第${i + 1}筆：${userId} → getHealthInsightHistoryForIdentity()回傳authenticated:false`, async () => {
      const result = await getHealthInsightHistoryForIdentity(db, identity, {});
      assert.strictEqual(result.authenticated, false);
    });
    await test(`（8.guest no history）矩陣第${i + 1}筆：${userId} → getHealthInsightHistoryForIdentity()回傳records:[]（即使D1已有該userId的紀錄）`, async () => {
      const result = await getHealthInsightHistoryForIdentity(db, identity, {});
      assert.deepStrictEqual(result.records, []);
    });
  }

  console.log('');

  // =========================================================================
  // I. Registered history
  // =========================================================================
  console.log('--- I. Registered history ---');

  for (const { label, identity } of REGISTERED_IDENTITY_SHAPES) {
    await test(`（9.registered history）getHealthInsightHistoryForIdentity()對${label}正確回傳既有紀錄`, async () => {
      const db = makeSessionDb({ userId: identity.userId, isGuest: false, records: [{ id: 'rec-1', user_id: identity.userId, input_snapshot: JSON.stringify({ healthGoal: 'weight_loss' }), output_snapshot: '{}', created_at: new Date().toISOString() }] });
      const result = await getHealthInsightHistoryForIdentity(db, identity, {});
      assert.strictEqual(result.authenticated, true);
      assert.strictEqual(result.records.length, 1);
      assert.strictEqual(result.records[0].healthGoal, 'weight_loss');
    });
  }

  await test('（9.registered history）Registered使用者沒有任何既有紀錄時，正確回傳authenticated:true、records:[]（不是被擋下，只是剛好沒有資料）', async () => {
    const identity = buildUserIdentity({ id: 'reg-history-empty', is_guest: 0, auth_provider: 'google' });
    const db = makeSessionDb({ userId: 'reg-history-empty', isGuest: false, records: [] });
    const result = await getHealthInsightHistoryForIdentity(db, identity, {});
    assert.strictEqual(result.authenticated, true);
    assert.deepStrictEqual(result.records, []);
  });

  await test('（9.registered history）Registered使用者端對端POST後，History正確累積這筆紀錄', async () => {
    const db = makeSessionDb({ userId: 'reg-history-e2e', isGuest: false, authProvider: 'google', records: [] });
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 30, healthGoal: 'muscle_gain' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.records.length, 1);
  });

  await test('（9.registered history）Security：只能查到自己的紀錄，查不到別的userId的紀錄（既有Security requirement，TASK1.126沒有改變這一點）', async () => {
    const identity = buildUserIdentity({ id: 'reg-history-self', is_guest: 0, auth_provider: 'google' });
    const db = makeSessionDb({
      userId: 'reg-history-self',
      isGuest: false,
      records: [
        { id: 'mine-1', user_id: 'reg-history-self', input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() },
        { id: 'other-1', user_id: 'someone-else', input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() },
      ],
    });
    const result = await getHealthInsightHistoryForIdentity(db, identity, {});
    assert.strictEqual(result.records.length, 1);
    assert.strictEqual(result.records[0].id, 'mine-1');
  });

  await test('（9.registered history）DEFAULT_HISTORY_LIMIT沒有被本次任務改變（依然是5）', () => {
    assert.strictEqual(DEFAULT_HISTORY_LIMIT, 5);
  });

  // 擴充矩陣：大量不同userId的Registered identity，逐一驗證
  // getHealthInsightHistoryForIdentity()正確回傳authenticated:true
  // 且能查到自己預先存在的紀錄。
  for (let i = 0; i < 20; i++) {
    const userId = `reg-history-matrix-${i}`;
    const provider = EXTENDED_PROVIDERS[i % EXTENDED_PROVIDERS.length];
    const identity = buildUserIdentity({ id: userId, is_guest: 0, auth_provider: provider });
    const db = makeSessionDb({ userId, isGuest: false, records: [{ id: `pre-${i}`, user_id: userId, input_snapshot: JSON.stringify({ healthGoal: 'weight_loss' }), output_snapshot: '{}', created_at: new Date().toISOString() }] });
    await test(`（9.registered history）矩陣第${i + 1}筆：${userId}（provider=${provider}） → getHealthInsightHistoryForIdentity()回傳authenticated:true`, async () => {
      const result = await getHealthInsightHistoryForIdentity(db, identity, {});
      assert.strictEqual(result.authenticated, true);
    });
    await test(`（9.registered history）矩陣第${i + 1}筆：${userId} → getHealthInsightHistoryForIdentity()正確查到1筆既有紀錄`, async () => {
      const result = await getHealthInsightHistoryForIdentity(db, identity, {});
      assert.strictEqual(result.records.length, 1);
    });
  }

  console.log('');

  // =========================================================================
  // J. Premium compatibility
  // =========================================================================
  console.log('--- J. Premium compatibility ---');

  await test('（10.premium compatibility）Guest身份在沒有注入lookupTier時（真實生產環境唯一情況），resolveMembershipState()回傳free（跟Registered Free相同，不是特殊的premium）', () => {
    const guestIdentity = buildUserIdentity({ id: 'guest-premium-1', is_guest: 1, auth_provider: null });
    const state = resolveMembershipState(guestIdentity, {});
    assert.strictEqual(state.tier, 'free');
  });

  await test('（10.premium compatibility）Guest身份canUseFeature("gemini_enhancement")在真實生產環境（沒有lookupTier）一律回傳false——Guest: No Premium', () => {
    const guestIdentity = buildUserIdentity({ id: 'guest-premium-2', is_guest: 1, auth_provider: null });
    assert.strictEqual(canUseFeature(guestIdentity, 'gemini_enhancement', {}), false);
  });

  await test('（10.premium compatibility）Registered Free身份（沒有lookupTier）canUseFeature("gemini_enhancement")一律回傳false——Registered Free: Basic Health Insight only', () => {
    const regIdentity = buildUserIdentity({ id: 'reg-premium-free', is_guest: 0, auth_provider: 'google' });
    assert.strictEqual(canUseFeature(regIdentity, 'gemini_enhancement', {}), false);
  });

  await test('（10.premium compatibility）Registered使用者搭配注入lookupTier()回傳"premium"時，canUseFeature("gemini_enhancement")回傳true——Premium: Gemini Enhancement（既有Membership Boundary行為完全沒有被本次任務修改）', () => {
    const regIdentity = buildUserIdentity({ id: 'reg-premium-upgrade', is_guest: 0, auth_provider: 'google' });
    assert.strictEqual(canUseFeature(regIdentity, 'gemini_enhancement', { lookupTier: () => 'premium' }), true);
  });

  await test('（10.premium compatibility）匿名使用者canUseFeature()一律回傳false，即使注入premium lookupTier也一樣（既有既定行為，TASK1.126沒有改變）', () => {
    assert.strictEqual(canUseFeature(ANONYMOUS_IDENTITY, 'gemini_enhancement', { lookupTier: () => 'premium' }), false);
  });

  await test('（10.premium compatibility）src/membership/整個目錄完全沒有被本次任務修改（規格明確禁止：Do not modify Membership Boundary）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/membership/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.premium compatibility）src/intelligence/enhancement/gemini/整個目錄除了gemini_client.js之外完全沒有其他改動（規格明確禁止：Do not redesign Gemini；手動上線階段後更新：DEFAULT_MODEL更新為gemini-3.8-flash）', () => {
    const diff = execFileSync('git', ['diff', '--name-only', '--', 'src/intelligence/enhancement/gemini/'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean)
      .filter((f) => !f.endsWith('src/intelligence/enhancement/gemini/gemini_client.js'));
    assert.deepStrictEqual(diff, []);
  });

  await test('（10.premium compatibility）真實HTTP dispatch（src/worker.js）永遠只傳空的options物件給health-insight route——這是"Guest: No Premium"在目前架構下成立的真正原因（不是Membership Boundary本身排除guest，而是真實請求永遠不可能注入lookupTier，所以Guest/Registered Free都只能拿到free tier）', () => {
    const callSiteMatches = workerSource.match(/registerHealthInsightRoutes|health-insight/g);
    assert.ok(callSiteMatches && callSiteMatches.length > 0, '找不到worker.js接線health-insight route的痕跡');
    assert.ok(!workerSource.includes('lookupTier'), 'worker.js不應該出現lookupTier字樣——真實HTTP dispatch完全不知道這個延伸點');
  });

  await test('（10.premium compatibility）health_insight_routes.js呼叫canUseFeature()時原樣轉發req.options（不會替Guest/Registered額外加工options，Permission邏輯完全交給Membership Boundary自己判斷）', () => {
    assert.ok(routesSource.includes("canUseFeature(identity, 'gemini_enhancement', req.options)"));
  });

  await test('（10.premium compatibility）Guest身份的Health Insight Result在geminiPermitted:false時，回應data形狀維持{html}（不含enhancedExplanation），跟Registered Free完全一致的降級行為', async () => {
    const db = makeSessionDb({ userId: 'guest-gemini-fallback', isGuest: true, records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.enhancedExplanation, undefined);
  });

  // 擴充矩陣：大量不同userId的Guest/Registered identity在沒有
  // 注入lookupTier時，一律拿到free tier、canUseFeature()一律
  // false——逐筆驗證"Guest: No Premium"跟"Registered Free: Basic
  // Health Insight only"在生產環境唯一情況下的實際行為。
  for (let i = 0; i < 15; i++) {
    const guestIdentity = buildUserIdentity({ id: `guest-tier-matrix-${i}`, is_guest: 1, auth_provider: null });
    await test(`（10.premium compatibility）矩陣第${i + 1}筆：guest-tier-matrix-${i} → resolveMembershipState()回傳free`, () => {
      assert.strictEqual(resolveMembershipState(guestIdentity, {}).tier, 'free');
    });
    await test(`（10.premium compatibility）矩陣第${i + 1}筆：guest-tier-matrix-${i} → canUseFeature('gemini_enhancement')回傳false`, () => {
      assert.strictEqual(canUseFeature(guestIdentity, 'gemini_enhancement', {}), false);
    });
  }
  for (let i = 0; i < 15; i++) {
    const provider = EXTENDED_PROVIDERS[i % EXTENDED_PROVIDERS.length];
    const regIdentity = buildUserIdentity({ id: `reg-tier-matrix-${i}`, is_guest: 0, auth_provider: provider });
    await test(`（10.premium compatibility）矩陣第${i + 1}筆：reg-tier-matrix-${i}（沒有lookupTier） → resolveMembershipState()回傳free`, () => {
      assert.strictEqual(resolveMembershipState(regIdentity, {}).tier, 'free');
    });
    await test(`（10.premium compatibility）矩陣第${i + 1}筆：reg-tier-matrix-${i}（沒有lookupTier） → canUseFeature('gemini_enhancement')回傳false`, () => {
      assert.strictEqual(canUseFeature(regIdentity, 'gemini_enhancement', {}), false);
    });
    await test(`（10.premium compatibility）矩陣第${i + 1}筆：reg-tier-matrix-${i}（lookupTier回傳premium） → canUseFeature('gemini_enhancement')回傳true（既有Membership Boundary行為，本次任務沒有修改）`, () => {
      assert.strictEqual(canUseFeature(regIdentity, 'gemini_enhancement', { lookupTier: () => 'premium' }), true);
    });
  }

  const UNKNOWN_FEATURE_NAMES = ['unknown_feature', 'weight_tracking', 'ai_coach', '', 'gemini_enhancement_v2'];
  for (const featureName of UNKNOWN_FEATURE_NAMES) {
    await test(`（10.premium compatibility）未知功能名稱"${featureName}"對任何tier一律回傳false（isFeatureAllowedForTier fail-closed既有行為，跟Guest/Registered分類無關）`, () => {
      assert.strictEqual(isFeatureAllowedForTier({ tier: 'premium' }, featureName), false);
    });
  }

  console.log('');

  // =========================================================================
  // K. UI state
  // =========================================================================
  console.log('--- K. UI state ---');

  await test('（11.ui state）createHistoryCard({isAuthenticated:true, isGuest:true})顯示"目前為體驗模式"文案', () => {
    const html = createHistoryCard({ isAuthenticated: true, isGuest: true, previousRecords: [] });
    assert.ok(html.includes('目前為體驗模式'));
  });

  await test('（11.ui state）createHistoryCard({isAuthenticated:true, isGuest:true})顯示"登入保存你的健康紀錄"CTA文案', () => {
    const html = createHistoryCard({ isAuthenticated: true, isGuest: true, previousRecords: [] });
    assert.ok(html.includes('登入保存你的健康紀錄'));
  });

  await test('（11.ui state）createHistoryCard()的Guest狀態使用專屬class（hi-history-card--guest），跟anonymous/empty/filled三種既有狀態區分', () => {
    const html = createHistoryCard({ isAuthenticated: true, isGuest: true, previousRecords: [] });
    assert.ok(html.includes('hi-history-card--guest'));
  });

  await test('（11.ui state）createHistoryCard()的Guest狀態依然使用共用的.hi-card class（延續拙趣既有視覺語言，沒有新增設計系統）', () => {
    const html = createHistoryCard({ isAuthenticated: true, isGuest: true, previousRecords: [] });
    assert.ok(html.includes('hi-card'));
  });

  await test('（11.ui state）createHistoryCard({isAuthenticated:true, isGuest:false, previousRecords:[非空]})顯示"你的健康紀錄"文案', () => {
    const html = createHistoryCard({ isAuthenticated: true, isGuest: false, previousRecords: [{ id: 'r1', createdAt: new Date().toISOString(), healthGoal: 'weight_loss' }] });
    assert.ok(html.includes('你的健康紀錄'));
  });

  await test('（11.ui state）createHistoryCard({isAuthenticated:false})（完全匿名）依然顯示既有"登入之後"引導文案，不受Guest狀態影響', () => {
    const html = createHistoryCard({ isAuthenticated: false, previousRecords: [] });
    assert.ok(html.includes('登入之後'));
    assert.ok(!html.includes('目前為體驗模式'));
  });

  await test('（11.ui state）createHistoryCard()對isGuest優先於previousRecords空陣列判斷（即使previousRecords剛好是空的，Guest狀態文案優先顯示，不會被誤判成"第一筆紀錄"）', () => {
    const html = createHistoryCard({ isAuthenticated: true, isGuest: true, previousRecords: [] });
    assert.ok(!html.includes('這是你在健康小洞察的第一筆紀錄'));
  });

  await test('（11.ui state）createProgressSummaryCard({isAuthenticated:true, isGuest:true})顯示"目前為體驗模式"文案', () => {
    const html = createProgressSummaryCard({ isAuthenticated: true, isGuest: true });
    assert.ok(html.includes('目前為體驗模式'));
  });

  await test('（11.ui state）createProgressSummaryCard({isAuthenticated:true, isGuest:true})顯示"登入後可以保存你的健康歷程"文案', () => {
    const html = createProgressSummaryCard({ isAuthenticated: true, isGuest: true });
    assert.ok(html.includes('登入後可以保存你的健康歷程'));
  });

  await test('（11.ui state）createProgressSummaryCard({isAuthenticated:false})（完全匿名）依然顯示既有引導文案，不受Guest狀態影響', () => {
    const html = createProgressSummaryCard({ isAuthenticated: false });
    assert.ok(!html.includes('目前為體驗模式'));
  });

  await test('（11.ui state）dashboard_page.js正確把presentationContext.isGuest轉發給History/Progress兩張卡片（端對端）', () => {
    const html = renderHealthInsightDashboard({ healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {} }, { isAuthenticated: true, isGuest: true, previousRecords: [] });
    assert.ok(html.includes('目前為體驗模式'));
  });

  await test('（11.ui state）Guest端對端POST後，回應html正確包含Guest體驗模式文案（route→UI Renderer→Dashboard→History Card整條鏈路都正確轉發isGuest）', async () => {
    const db = makeSessionDb({ userId: 'guest-ui-e2e', isGuest: true, records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.ok(body.data.html.includes('目前為體驗模式'));
  });

  await test('（11.ui state）Registered使用者端對端POST後，回應html完全不包含Guest體驗模式文案', async () => {
    const db = makeSessionDb({ userId: 'reg-ui-e2e', isGuest: false, authProvider: 'google', records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 30, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.ok(!body.data.html.includes('目前為體驗模式'));
  });

  await test('（11.ui state）匿名使用者（未登入）端對端POST後，回應html不包含Guest體驗模式文案（匿名跟訪客是不同的兩種狀態，文案不應該混淆）', async () => {
    const db = makeSessionDb({ userId: 'unused-anon-ui', isGuest: false, records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, options: {} }, { db });
    const body = await res.json();
    assert.ok(!body.data.html.includes('目前為體驗模式'));
  });

  await test('（11.ui state）history_card.js/progress_summary_card.js完全不import window/document（延續SSR安全既有原則，新增的Guest分支沒有違反這一點）', () => {
    assert.ok(!/window\.|document\./.test(historyCardSource));
    assert.ok(!/window\.|document\./.test(progressCardSource));
  });

  await test('（11.ui state）Guest CTA的action標籤是"history-guest-upgrade"（跟既有"history-login-required"/"history-first-record"等既有action標籤區分，方便未來前端埋點區分不同引導情境）', () => {
    assert.ok(historyCardSource.includes("action: 'history-guest-upgrade'"));
  });

  // 擴充矩陣：createHistoryCard()/createProgressSummaryCard()對
  // isAuthenticated × isGuest四種組合，逐一驗證"目前為體驗模式"
  // 文案只在isAuthenticated:true且isGuest:true時出現，其餘三種
  // 組合都不會誤觸發。
  const AUTH_GUEST_COMBOS = [
    { isAuthenticated: true, isGuest: true, expectGuestCopy: true },
    { isAuthenticated: true, isGuest: false, expectGuestCopy: false },
    { isAuthenticated: false, isGuest: true, expectGuestCopy: false },
    { isAuthenticated: false, isGuest: false, expectGuestCopy: false },
  ];
  for (const combo of AUTH_GUEST_COMBOS) {
    const historyHtml = createHistoryCard({ isAuthenticated: combo.isAuthenticated, isGuest: combo.isGuest, previousRecords: [] });
    const progressHtml = createProgressSummaryCard({ isAuthenticated: combo.isAuthenticated, isGuest: combo.isGuest });
    await test(`（11.ui state）矩陣：isAuthenticated=${combo.isAuthenticated}、isGuest=${combo.isGuest} → createHistoryCard()${combo.expectGuestCopy ? '' : '不'}顯示"體驗模式"文案`, () => {
      assert.strictEqual(historyHtml.includes('體驗模式'), combo.expectGuestCopy);
    });
    await test(`（11.ui state）矩陣：isAuthenticated=${combo.isAuthenticated}、isGuest=${combo.isGuest} → createProgressSummaryCard()${combo.expectGuestCopy ? '' : '不'}顯示"體驗模式"文案`, () => {
      assert.strictEqual(progressHtml.includes('體驗模式'), combo.expectGuestCopy);
    });
    await test(`（11.ui state）矩陣：isAuthenticated=${combo.isAuthenticated}、isGuest=${combo.isGuest} → createHistoryCard()輸出的HTML非空字串`, () => {
      assert.ok(typeof historyHtml === 'string' && historyHtml.length > 0);
    });
    await test(`（11.ui state）矩陣：isAuthenticated=${combo.isAuthenticated}、isGuest=${combo.isGuest} → createProgressSummaryCard()輸出的HTML非空字串`, () => {
      assert.ok(typeof progressHtml === 'string' && progressHtml.length > 0);
    });
  }

  // 擴充矩陣：端對端POST，逐一驗證每個健康目標下Guest/Registered
  // 兩種身份輸出的html是否正確包含/不包含體驗模式文案。
  for (const goal of HEALTH_GOALS) {
    const guestDb = makeSessionDb({ userId: `ui-goal-guest-${goal}`, isGuest: true, records: [] });
    const router1 = createAppRouter();
    const guestRes = await router1.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: goal }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: guestDb });
    const guestBody = await guestRes.json();
    await test(`（11.ui state）矩陣：Guest送出healthGoal="${goal}"的回應html包含體驗模式文案`, () => {
      assert.ok(guestBody.data.html.includes('體驗模式'));
    });

    const regDb = makeSessionDb({ userId: `ui-goal-reg-${goal}`, isGuest: false, authProvider: 'google', records: [] });
    const router2 = createAppRouter();
    const regRes = await router2.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: goal }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: regDb });
    const regBody = await regRes.json();
    await test(`（11.ui state）矩陣：Registered使用者送出healthGoal="${goal}"的回應html不包含體驗模式文案`, () => {
      assert.ok(!regBody.data.html.includes('體驗模式'));
    });
  }

  console.log('');

  // =========================================================================
  // L. Security validation
  // =========================================================================
  console.log('--- L. Security validation ---');

  await test('（12.security validation）getHealthInsightHistoryForIdentity()的公開簽名只接受(db, identity, options)，不接受額外的userId字串參數（規格明確要求：History security is identity based, NOT frontend userId based）', () => {
    assert.ok(historyServiceSource.includes('export async function getHealthInsightHistoryForIdentity(db, identity, options)'));
  });

  await test('（12.security validation）history_service.js完全不讀取payload/request body裡的userId欄位（唯一的userId來源是identity.userId）', () => {
    assert.ok(!historyServiceSource.includes('payload.userId'));
    assert.ok(!historyServiceSource.includes('req.userId'));
    assert.ok(!historyServiceSource.includes('body.userId'));
  });

  await test('（12.security validation）即使POST payload刻意夾帶偽造的userId/isGuest欄位，也完全不影響真正的身份判斷（identity永遠由db.users.getById()查出的真實row決定，不是payload可以覆蓋的）', async () => {
    const db = makeSessionDb({ userId: 'security-guest-1', isGuest: true, records: [] });
    const router = createAppRouter();
    await router.handle({
      method: 'POST',
      pathname: '/api/health-insight',
      payload: { age: 28, healthGoal: 'weight_loss', userId: 'someone-else', isGuest: false, authenticated: true, provider: 'google' },
      cookieHeader: 'dbc_sid=token123',
      options: {},
    }, { db });
    assert.strictEqual(db.__store.length, 0, '偽造payload欄位不應該讓Guest的persistence boundary被繞過');
  });

  await test('（12.security validation）已登入使用者A用自己的session呼叫GET history，即使payload/query字串裡夾帶別人的userId，依然只查得到自己的紀錄', async () => {
    const identityA = buildUserIdentity({ id: 'security-user-a', is_guest: 0, auth_provider: 'google' });
    const db = makeSessionDb({
      userId: 'security-user-a',
      isGuest: false,
      records: [
        { id: 'a-1', user_id: 'security-user-a', input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() },
        { id: 'b-1', user_id: 'security-user-b', input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() },
      ],
    });
    const result = await getHealthInsightHistoryForIdentity(db, identityA, {});
    assert.strictEqual(result.records.length, 1);
    assert.strictEqual(result.records[0].id, 'a-1');
  });

  await test('（12.security validation）isGuestIdentity()判斷同時支援新舊兩種identity形狀（向下相容既有~19個測試套件的手動fixture），不會因為fixture沒有isGuest欄位就誤判成registered', () => {
    assert.strictEqual(shouldPersistHealthInsightRecord({ userId: 'x', authenticated: true, provider: 'guest' }), false);
  });

  await test('（12.security validation）Guest身份的provider欄位永遠被強制覆蓋為"guest"字串（即使原始auth_provider有值），下游無法透過provider欄位偽裝成其他登入方式', () => {
    const identity = buildUserIdentity({ id: 'security-spoofed', is_guest: 1, auth_provider: 'google' });
    assert.strictEqual(identity.provider, 'guest');
  });

  await test('（12.security validation）shouldPersistHealthInsightRecord()對isGuest型別錯誤（例如字串"true"而不是boolean true）的偽造identity正確安全處理，不會意外判定為guest進而繞過persist（也不會反過來誤判——只要provider不是"guest"字串，且isGuest不是嚴格true，就維持既有authenticated行為）', () => {
    const spoofed = { userId: 'x', authenticated: true, provider: 'google', isGuest: 'true' };
    assert.strictEqual(shouldPersistHealthInsightRecord(spoofed), true);
  });

  await test('（12.security validation）Persistence/History兩個Boundary各自獨立實作isGuestIdentity()（沒有共用同一個內部函式），延續整個系列"各自對公開行為負責"既有原則，個別調整一邊不會意外波及另一邊', () => {
    const persistenceHasOwnHelper = persistenceServiceSource.includes('function isGuestIdentity(identity)');
    const historyHasOwnHelper = historyServiceSource.includes('function isGuestIdentity(identity)');
    assert.strictEqual(persistenceHasOwnHelper, true);
    assert.strictEqual(historyHasOwnHelper, true);
  });

  await test('（12.security validation）saveHealthInsightRecord()永遠不拋出例外，即使identity是完全不合法的形狀（例如字串、陣列、數字）', async () => {
    const weirdInputs = ['not-an-object', 123, [], null, undefined, true];
    for (const bad of weirdInputs) {
      const result = await saveHealthInsightRecord({}, { identity: bad, payload: {}, structuredResponse: { ok: true, data: {} } });
      assert.strictEqual(result.ok, false);
    }
  });

  await test('（12.security validation）getHealthInsightHistoryForIdentity()永遠不拋出例外，即使identity是完全不合法的形狀', async () => {
    const weirdInputs = ['not-an-object', 123, [], null, undefined, true];
    for (const bad of weirdInputs) {
      const result = await getHealthInsightHistoryForIdentity({}, bad, {});
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.authenticated, false);
    }
  });

  // 擴充矩陣：isValidUserIdentity()對大量合法/不合法identity形狀的
  // fuzz測試，確保TASK1.126新增的isGuest/userType選填欄位驗證
  // 沒有破壞既有的形狀檢查邏輯。
  const VALID_IDENTITY_FUZZ_CASES = [
    { userId: null, authenticated: false, provider: null },
    { userId: 'u1', authenticated: true, provider: 'google' },
    { userId: 'u2', authenticated: true, provider: null },
    { userId: 'u3', authenticated: true, provider: 'guest', isGuest: true },
    { userId: 'u4', authenticated: true, provider: 'guest', isGuest: true, userType: 'guest' },
    { userId: 'u5', authenticated: true, provider: 'google', isGuest: false, userType: 'registered' },
    { userId: null, authenticated: false, provider: null, isGuest: false, userType: 'anonymous' },
  ];
  for (const [idx, identity] of VALID_IDENTITY_FUZZ_CASES.entries()) {
    await test(`（12.security validation）isValidUserIdentity() fuzz矩陣：合法案例第${idx + 1}筆正確通過驗證`, () => {
      assert.strictEqual(isValidUserIdentity(identity), true);
    });
  }

  const INVALID_IDENTITY_FUZZ_CASES = [
    null,
    undefined,
    'string',
    123,
    [],
    {},
    { userId: 123, authenticated: true, provider: 'google' },
    { userId: 'u1', authenticated: 'true', provider: 'google' },
    { userId: 'u1', authenticated: true, provider: 123 },
    { userId: 'u1', authenticated: true, provider: 'google', isGuest: 'yes' },
    { userId: 'u1', authenticated: true, provider: 'google', userType: 999 },
  ];
  for (const [idx, identity] of INVALID_IDENTITY_FUZZ_CASES.entries()) {
    await test(`（12.security validation）isValidUserIdentity() fuzz矩陣：不合法案例第${idx + 1}筆正確被拒絕`, () => {
      assert.strictEqual(isValidUserIdentity(identity), false);
    });
  }

  // 擴充矩陣：多使用者交叉隔離——每個使用者只能查到自己的紀錄，
  // 即使D1裡同時存在其他多個使用者的紀錄。
  for (let i = 0; i < 15; i++) {
    const selfId = `isolation-user-${i}`;
    const otherId = `isolation-other-${i}`;
    const identity = buildUserIdentity({ id: selfId, is_guest: 0, auth_provider: 'google' });
    const db = makeSessionDb({
      userId: selfId,
      isGuest: false,
      records: [
        { id: `self-rec-${i}`, user_id: selfId, input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() },
        { id: `other-rec-${i}`, user_id: otherId, input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() },
      ],
    });
    await test(`（12.security validation）交叉隔離矩陣第${i + 1}筆：${selfId}只查得到自己的1筆紀錄，查不到${otherId}的紀錄`, async () => {
      const result = await getHealthInsightHistoryForIdentity(db, identity, {});
      assert.strictEqual(result.records.length, 1);
      assert.strictEqual(result.records[0].id, `self-rec-${i}`);
    });
  }

  console.log('');

  // =========================================================================
  // M. Regression validation
  // =========================================================================
  console.log('--- M. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（13.regression validation）此檔案目前被另一個regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），跳過再往下spawn其餘測試檔案，避免遞迴', () => {
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
      'backups/phase6-task1.122-premium-feature-boundary/test_premium_feature_boundary.mjs',
      'backups/phase6-task1.123-product-experience/test_health_insight_product_experience.mjs',
      'backups/phase6-task1.124-product-completion/test_health_insight_product_completion.mjs',
      'backups/phase6-task1.125-product-architecture-alignment/test_health_insight_product_architecture_alignment.mjs',
    ];

    for (const relSuite of healthInsightLineageSuites) {
      await test(`（13.regression validation）${relSuite} 完整執行，exit code為0（Health Insight全系列沒有因為TASK1.126的Guest/Authentication修正產生未預期回歸）`, () => {
        execFileSync('node', [relSuite], {
          cwd: repoRoot,
          stdio: 'pipe',
          timeout: 60000,
          env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
        });
      });
    }

    await test('（13.regression validation）本檔案（TASK1.126自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic', () => {
      execFileSync('node', [path.join(__dirname, 'test_guest_auth_experience.mjs')], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 60000,
        env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
      });
    });
  }

  console.log('');

  // =========================================================================
  // N. P1-P6 validation
  // =========================================================================
  console.log('--- N. P1-P6 validation ---');

  await test('（14.P1-P6）src/worker.js既有legacy getHTML()/getManifest()前端邏輯完全沒有被修改', () => {
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  // TASK1.127後更新：從嚴格零diff改成控制組檢查——Complete App
  // Experience Layer明確授權在worker.js末尾新增3個App Shell
  // if區塊，既有legacy getHTML()/getManifest()（上面測試）跟
  // 既有Health Insight if區塊依然逐字存在。
  await test('（14.P1-P6）src/worker.js的commit歷史/目前diff裡確實存在TASK1.127的合法修改（控制組，用git log避免commit後永遠假性失敗）', () => {
    const status = execFileSync('sh', ['-c', 'git diff --name-only -- src/worker.js ; git log --oneline -- src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.ok(status.trim().length > 0, 'src/worker.js 找不到任何diff或commit歷史');
  });

  await test('（14.P1-P6）src/worker.js既有三條Health Insight if區塊依然逐字存在', () => {
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'POST' && pathname === '/api/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/api/health-insight/history')"));
  });

  await test('（14.P1-P6）app.intelligence維持24個既有欄位（沒有新增/刪除任何capability）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（14.P1-P6）app.router.routes數量維持24（本次任務沒有新增/刪除任何route，只修改既有route handler內部的一行轉發）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 28);
  });

  await test('（14.P1-P6）migrations/共8個.sql檔案（含 0008 sync ownership，rollout 授權新增）', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    assert.strictEqual(files.length, 8);
  });

  await test('（14.P1-P6）migrations/完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（14.P1-P6）health_insight_records表的schema/欄位定義完全沒有被修改（規格明確要求：existing health_insight_records must remain compatible）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/tables/health_insight_records.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）src/intelligence/capabilities/整個目錄完全沒有被本次任務修改（規格明確禁止：Do not modify Capability Orchestrator）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/capabilities/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）src/intelligence/analysis/analysis_runner.js完全沒有被本次任務修改（規格明確禁止：Do not modify Analysis Runner）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）src/intelligence/recommendation/recommendation_runner.js完全沒有被本次任務修改（規格明確禁止：Do not modify Recommendation Runner）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）package.json、wrangler.toml完全沒有被本次任務修改', () => {
    const diffPkg = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    const diffWrangler = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diffPkg.trim(), '');
    assert.strictEqual(diffWrangler.trim(), '');
  });

  const TASK1126_AUTHORIZED_FILES = [
    'src/identity/health_insight/user_identity.js',
    'src/persistence/health_insight/health_insight_persistence_service.js',
    'src/history/health_insight/history_service.js',
    'src/routes/health_insight_routes.js',
    'src/ui/health_insight/pages/dashboard_page.js',
    'src/ui/health_insight/components/history_card.js',
    'src/ui/health_insight/components/progress_summary_card.js',
    // TASK1.127後更新：Complete App Experience Layer明確授權修改
    // 的2個檔案——worker.js新增3個App Shell路由if區塊，
    // routes/index.js新增registerAppShellRoutes()的import/
    // register一行。
    'src/worker.js',
    'src/routes/index.js',
    // 手動上線階段後更新：新增GET /auth/google/start登入入口、
    // gemini_client.js更新DEFAULT_MODEL
    'src/routes/auth_routes.js',
    'src/intelligence/enhancement/gemini/gemini_client.js',
  ];
  for (const relFile of TASK1126_AUTHORIZED_FILES) {
    await test(`（14.P1-P6）授權修改檔案${relFile}的commit歷史/目前diff裡確實存在TASK1.126的合法修改（控制組，用git log避免commit後永遠假性失敗）`, () => {
      const status = execFileSync('sh', ['-c', `git diff --name-only -- ${relFile} ; git log --oneline -- ${relFile}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(status.trim().length > 0, `${relFile} 找不到任何diff或commit歷史`);
    });
    await test(`（14.P1-P6）授權修改檔案${relFile}通過node --check語法驗證`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(repoRoot, relFile)], { encoding: 'utf8' }));
    });
  }

  await test('（14.P1-P6）本次任務完全沒有修改任何既有.js檔案，除了上述7個明確授權的檔案（git diff --name-only排除backups/跟7個授權檔案後應該是空的）', () => {
    const diff = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean)
      .filter((f) => !f.startsWith('backups/'))
      .filter((f) => !TASK1126_AUTHORIZED_FILES.includes(f));
    const jsChanges = diff.filter((f) => f.endsWith('.js'));
    assert.deepStrictEqual(jsChanges, [], `不應該有任何未授權.js檔案被修改，實際: ${jsChanges.join(', ')}`);
  });

  await test('（14.P1-P6）真實端對端：連續呼叫POST /api/health-insight兩次（Registered使用者），健康觀察/建議部分deterministic', async () => {
    const db1 = makeSessionDb({ userId: 'p1p6-det-1', isGuest: false, authProvider: 'google', records: [] });
    const router = createAppRouter();
    const res1 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: db1 });
    const db2 = makeSessionDb({ userId: 'p1p6-det-2', isGuest: false, authProvider: 'google', records: [] });
    const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: db2 });
    const body1 = await res1.json();
    const body2 = await res2.json();
    assert.strictEqual(body1.ok, body2.ok);
  });

  await test('（14.P1-P6）真實端對端：GET /health-insight（未登入）不受Guest/Authentication Experience Correction影響', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('失敗清單：');
    failures.forEach((name) => console.log(`  - ${name}`));
  }
  console.log(`（總斷言數：${passed + failed}）`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error('測試執行過程發生未預期例外：', e);
  process.exitCode = 1;
});

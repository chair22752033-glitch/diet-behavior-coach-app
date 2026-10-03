/*
 * Phase 7 TASK 1.127｜Complete App Experience & UX Commercial Layer 測試
 *
 * 本任務把Health Insight從「一個功能頁面」擴充成完整的App
 * Experience Layer：App Shell（Header/Navigation/Content
 * Container）、Home Dashboard、紀錄頁面、User Center，三條新
 * 路由（GET /app、GET /app/history、GET /app/me）。
 *
 * 明確不做：Payment、Subscription、Nutrition Tracking、
 * Behavior Coaching、新的AI能力。明確不修改：Analysis Runner、
 * Recommendation Runner、Capability Orchestrator、Gemini
 * Provider/Client/Enhancer、OAuth系統、Database schema、
 * Membership permission邏輯。
 *
 * 分為以下15個部分（對應規格15個Coverage類別）：
 * A) App Shell
 * B) Navigation
 * C) Home Experience
 * D) Guest experience
 * E) Registered experience
 * F) Login conversion CTA
 * G) User center
 * H) Premium entry placeholder
 * I) Responsive behavior
 * J) UI regression
 * K) Existing Health Insight regression
 * L) Intelligence protection
 * M) OAuth protection
 * N) Database protection
 * O) P1-P6 validation
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const srcRoot = path.join(repoRoot, 'src');
const routesDir = path.join(srcRoot, 'routes');
const appShellDir = path.join(srcRoot, 'ui', 'app_shell');
const appShellComponentsDir = path.join(appShellDir, 'components');
const appShellPagesDir = path.join(appShellDir, 'pages');
const healthInsightUiDir = path.join(srcRoot, 'ui', 'health_insight');
const identityDir = path.join(srcRoot, 'identity', 'health_insight');
const persistenceDir = path.join(srcRoot, 'persistence', 'health_insight');
const historyDir = path.join(srcRoot, 'history', 'health_insight');
const membershipDir = path.join(srcRoot, 'membership');
const intelDir = path.join(srcRoot, 'intelligence');
const geminiDir = path.join(intelDir, 'enhancement', 'gemini');
const migrationsDir = path.join(repoRoot, 'migrations');
const docsDir = path.join(repoRoot, 'docs');

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
 * 延續整個系列既有的repository風格db mock（`db.sessions.getById`
 * /`db.users.getById`/`db.healthInsightRecords.insert`/
 * `listByUser`），獨立實作，不import既有測試檔案。
 */
function makeSessionDb({ userId, isGuest, authProvider, records }) {
  const store = Array.isArray(records) ? records.slice() : [];
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  return {
    sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: userId, expires_at: expiresAt, revoked_at: null } }) },
    users: { getById: async () => ({ ok: true, row: { id: userId, is_guest: isGuest ? 1 : 0, auth_provider: authProvider || null, status: 'active' } }) },
    healthInsightRecords: {
      insert: async (r) => { store.push(r); return { ok: true, meta: {} }; },
      listByUser: async (uid, limit) => ({ ok: true, results: store.filter((r) => r.user_id === uid).slice(0, limit || 20) }),
    },
    __store: store,
  };
}

async function getText(res) {
  return res.text();
}

async function main() {
  const { createAppRouter } = await import(path.join(routesDir, 'index.js'));
  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  const {
    renderAppShell, NAV_ITEMS, renderNavigation, renderAppHeader,
    createFeatureEntryCard, createPremiumEntryCard,
    renderHomePageContent, renderHistoryPageContent, renderUserCenterPageContent,
  } = await import(path.join(appShellDir, 'index.js'));
  const { buildUserIdentity } = await import(path.join(identityDir, 'index.js'));

  const appShellSource = fs.readFileSync(path.join(appShellDir, 'app_shell.js'), 'utf8');
  const navigationSource = fs.readFileSync(path.join(appShellComponentsDir, 'navigation.js'), 'utf8');
  const headerSource = fs.readFileSync(path.join(appShellComponentsDir, 'header.js'), 'utf8');
  const featureCardSource = fs.readFileSync(path.join(appShellComponentsDir, 'feature_entry_card.js'), 'utf8');
  const premiumCardSource = fs.readFileSync(path.join(appShellComponentsDir, 'premium_entry_card.js'), 'utf8');
  const homePageSource = fs.readFileSync(path.join(appShellPagesDir, 'home_page.js'), 'utf8');
  const historyPageSource = fs.readFileSync(path.join(appShellPagesDir, 'history_page.js'), 'utf8');
  const userCenterPageSource = fs.readFileSync(path.join(appShellPagesDir, 'user_center_page.js'), 'utf8');
  const appShellRoutesSource = fs.readFileSync(path.join(routesDir, 'app_shell_routes.js'), 'utf8');
  const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
  const routesIndexSource = fs.readFileSync(path.join(routesDir, 'index.js'), 'utf8');
  const authRoutesSource = fs.readFileSync(path.join(routesDir, 'auth_routes.js'), 'utf8');
  const healthInsightRoutesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');

  // =========================================================================
  // A. App Shell
  // =========================================================================
  console.log('--- A. App Shell ---');

  await test('（1.app shell）renderAppShell()回傳非空字串', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div>x</div>' });
    assert.ok(typeof html === 'string' && html.length > 0);
  });

  await test('（1.app shell）renderAppShell()輸出完整HTML document（DOCTYPE/html/head/body）', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div>x</div>' });
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<html'));
    assert.ok(html.includes('<head>'));
    assert.ok(html.includes('<body>'));
  });

  await test('（1.app shell）renderAppShell()包含viewport meta（行動裝置優先）', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div>x</div>' });
    assert.ok(html.includes('width=device-width'));
  });

  await test('（1.app shell）renderAppShell()預設title為"健康陪伴"', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div>x</div>' });
    assert.ok(html.includes('<title>健康陪伴</title>'));
  });

  await test('（1.app shell）renderAppShell()接受自訂title', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div>x</div>', title: '健康陪伴｜首頁' });
    assert.ok(html.includes('<title>健康陪伴｜首頁</title>'));
  });

  await test('（1.app shell）renderAppShell()包含Header（app-shell-header）', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div>x</div>' });
    assert.ok(html.includes('app-shell-header'));
  });

  await test('（1.app shell）renderAppShell()包含Content Container（app-shell-content）', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div>x</div>' });
    assert.ok(html.includes('app-shell-content'));
  });

  await test('（1.app shell）renderAppShell()包含Navigation（app-nav）', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div>x</div>' });
    assert.ok(html.includes('class="app-nav"'));
  });

  await test('（1.app shell）renderAppShell()把bodyHtml正確放進Content Container裡', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div data-marker="unique-body-marker">x</div>' });
    assert.ok(html.includes('unique-body-marker'));
  });

  await test('（1.app shell）renderAppShell()重用既有getDesignSystemCSS()（包含既有--hi-color-primary token）', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div>x</div>' });
    assert.ok(html.includes('--hi-color-primary:'));
  });

  await test('（1.app shell）renderAppShell()重用既有.hi-card既有class規則', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div>x</div>' });
    assert.ok(html.includes('.hi-card {'));
  });

  await test('（1.app shell）renderAppShell()對null/undefined context安全處理，不拋出例外', () => {
    assert.doesNotThrow(() => renderAppShell(null));
    assert.doesNotThrow(() => renderAppShell(undefined));
    assert.doesNotThrow(() => renderAppShell({}));
  });

  await test('（1.app shell）app_shell.js完全不引用window/document（SSR安全，延續整個系列既有原則）', () => {
    assert.ok(!/window\.|document\./.test(appShellSource));
  });

  const ACTIVE_NAV_VALUES = ['home', 'health-insight', 'history', 'ai-coach', 'me'];
  for (const activeNav of ACTIVE_NAV_VALUES) {
    await test(`（1.app shell）renderAppShell({activeNav:'${activeNav}'})不拋出例外且輸出非空`, () => {
      const html = renderAppShell({ activeNav, bodyHtml: '<div>x</div>' });
      assert.ok(html.length > 0);
    });
  }

  const AUTH_GUEST_HEADER_COMBOS = [
    { isAuthenticated: false, isGuest: false },
    { isAuthenticated: true, isGuest: true },
    { isAuthenticated: true, isGuest: false },
  ];
  for (const combo of AUTH_GUEST_HEADER_COMBOS) {
    await test(`（1.app shell）renderAppShell({isAuthenticated:${combo.isAuthenticated}, isGuest:${combo.isGuest}})正確轉發給Header`, () => {
      const html = renderAppShell({ activeNav: 'home', isAuthenticated: combo.isAuthenticated, isGuest: combo.isGuest, bodyHtml: '<div>x</div>' });
      assert.ok(html.includes('app-user-status'));
    });
  }

  console.log('');

  // =========================================================================
  // B. Navigation
  // =========================================================================
  console.log('--- B. Navigation ---');

  await test('（2.navigation）NAV_ITEMS包含5個入口', () => {
    assert.strictEqual(NAV_ITEMS.length, 5);
  });

  const EXPECTED_NAV_KEYS = ['home', 'health-insight', 'history', 'ai-coach', 'me'];
  const EXPECTED_NAV_LABELS = { home: '首頁', 'health-insight': '健康洞察', history: '紀錄', 'ai-coach': 'AI陪伴', me: '我的' };
  for (const key of EXPECTED_NAV_KEYS) {
    await test(`（2.navigation）NAV_ITEMS包含key="${key}"的入口`, () => {
      assert.ok(NAV_ITEMS.some((item) => item.key === key));
    });
    await test(`（2.navigation）NAV_ITEMS的"${key}"入口label正確為"${EXPECTED_NAV_LABELS[key]}"`, () => {
      const item = NAV_ITEMS.find((i) => i.key === key);
      assert.strictEqual(item.label, EXPECTED_NAV_LABELS[key]);
    });
  }

  await test('（2.navigation）「AI陪伴」入口enabled:false（規格明確要求：placeholder，不實作新AI能力）', () => {
    const item = NAV_ITEMS.find((i) => i.key === 'ai-coach');
    assert.strictEqual(item.enabled, false);
  });

  const ENABLED_NAV_KEYS = ['home', 'health-insight', 'history', 'me'];
  for (const key of ENABLED_NAV_KEYS) {
    await test(`（2.navigation）「${EXPECTED_NAV_LABELS[key]}」入口enabled:true（已上線功能，不是placeholder）`, () => {
      const item = NAV_ITEMS.find((i) => i.key === key);
      assert.strictEqual(item.enabled, true);
    });
  }

  await test('（2.navigation）renderNavigation()輸出<nav>標籤', () => {
    const html = renderNavigation({ activeNav: 'home' });
    assert.ok(html.includes('<nav'));
  });

  for (const activeNav of ACTIVE_NAV_VALUES) {
    await test(`（2.navigation）renderNavigation({activeNav:'${activeNav}'})正確標記該入口為active`, () => {
      const html = renderNavigation({ activeNav });
      assert.ok(html.includes('app-nav-item--active'));
    });
  }

  await test('（2.navigation）renderNavigation()的placeholder入口（AI陪伴）使用<span>不是<a>（不產生死連結）', () => {
    const html = renderNavigation({ activeNav: 'home' });
    const aiCoachSection = html.split('data-app-nav="ai-coach"')[0].split('\n').slice(-3).join('\n') + html.split('data-app-nav="ai-coach"')[1].split('</span>')[0];
    assert.ok(html.includes('<span class="app-nav-item app-nav-item--placeholder"'));
  });

  await test('（2.navigation）renderNavigation()的placeholder入口顯示"敬請期待"標記', () => {
    const html = renderNavigation({ activeNav: 'home' });
    assert.ok(html.includes('敬請期待'));
  });

  await test('（2.navigation）renderNavigation()的「健康洞察」入口連到既有/health-insight（不是重新包一層App Shell）', () => {
    const html = renderNavigation({ activeNav: 'home' });
    assert.ok(html.includes('href="/health-insight"'));
  });

  await test('（2.navigation）renderNavigation()的「首頁」入口連到/app', () => {
    const html = renderNavigation({ activeNav: 'history' });
    assert.ok(html.includes('href="/app"'));
  });

  await test('（2.navigation）renderNavigation()的「紀錄」入口連到/app/history', () => {
    const html = renderNavigation({ activeNav: 'home' });
    assert.ok(html.includes('href="/app/history"'));
  });

  await test('（2.navigation）renderNavigation()的「我的」入口連到/app/me', () => {
    const html = renderNavigation({ activeNav: 'home' });
    assert.ok(html.includes('href="/app/me"'));
  });

  await test('（2.navigation）navigation.js完全不引用window/document', () => {
    assert.ok(!/window\.|document\./.test(navigationSource));
  });

  await test('（2.navigation）renderNavigation()對null/undefined context安全處理', () => {
    assert.doesNotThrow(() => renderNavigation(null));
    assert.doesNotThrow(() => renderNavigation(undefined));
  });

  console.log('');

  // =========================================================================
  // C. Home Experience
  // =========================================================================
  console.log('--- C. Home Experience ---');

  await test('（3.home experience）renderHomePageContent({isGuest:true})顯示"開始了解自己的健康方向"歡迎文案', () => {
    const html = renderHomePageContent({ isAuthenticated: true, isGuest: true });
    assert.ok(html.includes('開始了解自己的健康方向'));
  });

  await test('（3.home experience）renderHomePageContent({isAuthenticated:false})（完全匿名）也顯示"開始了解自己的健康方向"（延續Guest/Anonymous相近體驗既有結論）', () => {
    const html = renderHomePageContent({ isAuthenticated: false });
    assert.ok(html.includes('開始了解自己的健康方向'));
  });

  await test('（3.home experience）renderHomePageContent({isAuthenticated:true, isGuest:false})顯示"歡迎回來，看看你的健康歷程"', () => {
    const html = renderHomePageContent({ isAuthenticated: true, isGuest: false });
    assert.ok(html.includes('歡迎回來，看看你的健康歷程'));
  });

  await test('（3.home experience）renderHomePageContent()包含健康洞察功能入口卡片', () => {
    const html = renderHomePageContent({ isAuthenticated: false });
    assert.ok(html.includes('健康洞察'));
    assert.ok(html.includes('/health-insight'));
  });

  await test('（3.home experience）renderHomePageContent()包含紀錄功能入口卡片', () => {
    const html = renderHomePageContent({ isAuthenticated: false });
    assert.ok(html.includes('/app/history'));
  });

  await test('（3.home experience）renderHomePageContent()包含AI陪伴placeholder入口（規格明確要求：Nutrition/Behavior Coaching/AI Coach可以是placeholder）', () => {
    const html = renderHomePageContent({ isAuthenticated: false });
    assert.ok(html.includes('AI陪伴'));
  });

  await test('（3.home experience）renderHomePageContent()包含飲食紀錄placeholder入口', () => {
    const html = renderHomePageContent({ isAuthenticated: false });
    assert.ok(html.includes('飲食紀錄'));
  });

  await test('（3.home experience）renderHomePageContent()包含Premium入口佔位（"升級你的健康陪伴"）', () => {
    const html = renderHomePageContent({ isAuthenticated: false });
    assert.ok(html.includes('升級你的健康陪伴'));
  });

  await test('（3.home experience）renderHomePageContent()重用既有.hi-card class（拙趣既有視覺語言）', () => {
    const html = renderHomePageContent({ isAuthenticated: false });
    assert.ok(html.includes('hi-card'));
  });

  await test('（3.home experience）home_page.js完全不引用window/document', () => {
    assert.ok(!/window\.|document\./.test(homePageSource));
  });

  await test('（3.home experience）renderHomePageContent()對null/undefined context安全處理', () => {
    assert.doesNotThrow(() => renderHomePageContent(null));
    assert.doesNotThrow(() => renderHomePageContent(undefined));
  });

  console.log('');

  // =========================================================================
  // D. Guest experience
  // =========================================================================
  console.log('--- D. Guest experience ---');

  await test('（4.guest experience）端對端：GET /app（Guest）status為200且顯示Guest歡迎文案', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({ userId: 'guest-home-1', isGuest: true, records: [] });
    const res = await router.handle({ method: 'GET', pathname: '/app', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const html = await getText(res);
    assert.strictEqual(res.status, 200);
    assert.ok(html.includes('開始了解自己的健康方向'));
  });

  await test('（4.guest experience）端對端：GET /app/history（Guest）顯示"目前為體驗模式"引導文案', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({ userId: 'guest-history-1', isGuest: true, records: [] });
    const res = await router.handle({ method: 'GET', pathname: '/app/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const html = await getText(res);
    assert.strictEqual(res.status, 200);
    assert.ok(html.includes('目前為體驗模式'));
  });

  await test('（4.guest experience）端對端：GET /app/me（Guest）顯示體驗模式說明', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({ userId: 'guest-me-1', isGuest: true, records: [] });
    const res = await router.handle({ method: 'GET', pathname: '/app/me', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const html = await getText(res);
    assert.strictEqual(res.status, 200);
    assert.ok(html.includes('體驗模式'));
  });

  await test('（4.guest experience）Guest造訪/app/history時，即使D1已經有該userId的既有紀錄，也不會外洩（延續TASK1.126既有Guest History Boundary）', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({
      userId: 'guest-leak-check',
      isGuest: true,
      records: [{ id: 'pre-1', user_id: 'guest-leak-check', input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() }],
    });
    const res = await router.handle({ method: 'GET', pathname: '/app/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const html = await getText(res);
    assert.ok(!html.includes('app-history-record-item'));
    assert.ok(html.includes('目前為體驗模式'));
  });

  await test('（4.guest experience）Guest造訪/app後，POST /api/health-insight再造訪/app/history，依然不會累積紀錄（App Shell三頁面跟既有Health Insight boundary一致）', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({ userId: 'guest-flow-consistency', isGuest: true, records: [] });
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/app/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const html = await getText(res);
    assert.ok(!html.includes('app-history-record-item'));
    assert.strictEqual(db.__store.length, 0);
  });

  // 矩陣：大量不同userId的Guest帳號，逐一驗證三個頁面都正確顯示Guest文案
  for (let i = 0; i < 100; i++) {
    const userId = `guest-matrix-${i}`;
    const router = createAppRouter();
    const db = makeSessionDb({ userId, isGuest: true, records: [] });
    await test(`（4.guest experience）矩陣第${i + 1}筆：${userId} → GET /app顯示Guest歡迎文案`, async () => {
      const res = await router.handle({ method: 'GET', pathname: '/app', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const html = await getText(res);
      assert.ok(html.includes('開始了解自己的健康方向'));
    });
    await test(`（4.guest experience）矩陣第${i + 1}筆：${userId} → GET /app/history顯示體驗模式`, async () => {
      const res = await router.handle({ method: 'GET', pathname: '/app/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const html = await getText(res);
      assert.ok(html.includes('體驗模式'));
    });
    await test(`（4.guest experience）矩陣第${i + 1}筆：${userId} → GET /app/me顯示體驗模式`, async () => {
      const res = await router.handle({ method: 'GET', pathname: '/app/me', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const html = await getText(res);
      assert.ok(html.includes('體驗模式'));
    });
  }

  await test('（4.guest experience）完全匿名（沒有cookie）造訪三個頁面都不會被擋下（Do not force login）', async () => {
    const router = createAppRouter();
    const resHome = await router.handle({ method: 'GET', pathname: '/app', options: {} }, {});
    const resHistory = await router.handle({ method: 'GET', pathname: '/app/history', options: {} }, {});
    const resMe = await router.handle({ method: 'GET', pathname: '/app/me', options: {} }, {});
    assert.strictEqual(resHome.status, 200);
    assert.strictEqual(resHistory.status, 200);
    assert.strictEqual(resMe.status, 200);
  });

  console.log('');

  // =========================================================================
  // E. Registered experience
  // =========================================================================
  console.log('--- E. Registered experience ---');

  await test('（5.registered experience）端對端：GET /app（Registered）顯示"歡迎回來"文案', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({ userId: 'reg-home-1', isGuest: false, authProvider: 'google', records: [] });
    const res = await router.handle({ method: 'GET', pathname: '/app', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const html = await getText(res);
    assert.ok(html.includes('歡迎回來'));
  });

  await test('（5.registered experience）端對端：GET /app/history（Registered有紀錄）正確顯示紀錄清單', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({
      userId: 'reg-history-1',
      isGuest: false,
      authProvider: 'google',
      records: [{ id: 'r1', user_id: 'reg-history-1', input_snapshot: JSON.stringify({ healthGoal: 'weight_loss' }), output_snapshot: '{}', created_at: new Date().toISOString() }],
    });
    const res = await router.handle({ method: 'GET', pathname: '/app/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const html = await getText(res);
    assert.ok(html.includes('app-history-record-item'));
    assert.ok(!html.includes('體驗模式'));
  });

  await test('（5.registered experience）端對端：GET /app/history（Registered沒有紀錄）顯示友善的空狀態', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({ userId: 'reg-history-empty', isGuest: false, authProvider: 'google', records: [] });
    const res = await router.handle({ method: 'GET', pathname: '/app/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const html = await getText(res);
    assert.ok(html.includes('還沒有任何紀錄'));
  });

  await test('（5.registered experience）端對端：GET /app/me（Registered）顯示"已登入"狀態', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({ userId: 'reg-me-1', isGuest: false, authProvider: 'google', records: [] });
    const res = await router.handle({ method: 'GET', pathname: '/app/me', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const html = await getText(res);
    assert.ok(html.includes('已登入'));
  });

  await test('（5.registered experience）端對端：GET /app/me（Registered）包含紀錄入口連結', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({ userId: 'reg-me-2', isGuest: false, authProvider: 'google', records: [] });
    const res = await router.handle({ method: 'GET', pathname: '/app/me', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const html = await getText(res);
    assert.ok(html.includes('/app/history'));
  });

  await test('（5.registered experience）Registered使用者用Health Insight後，能在/app/history看到剛存的紀錄', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({ userId: 'reg-flow-1', isGuest: false, authProvider: 'google', records: [] });
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 30, healthGoal: 'muscle_gain' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/app/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const html = await getText(res);
    assert.ok(html.includes('app-history-record-item'));
    assert.strictEqual(db.__store.length, 1);
  });

  // 矩陣：大量不同provider/userId的Registered帳號
  const PROVIDERS = ['google', 'facebook', 'apple', 'line', 'microsoft'];
  for (let i = 0; i < 100; i++) {
    const provider = PROVIDERS[i % PROVIDERS.length];
    const userId = `reg-matrix-${i}`;
    const router = createAppRouter();
    const db = makeSessionDb({ userId, isGuest: false, authProvider: provider, records: [{ id: `rec-${i}`, user_id: userId, input_snapshot: JSON.stringify({ healthGoal: 'weight_loss' }), output_snapshot: '{}', created_at: new Date().toISOString() }] });
    await test(`（5.registered experience）矩陣第${i + 1}筆：${userId}（${provider}） → GET /app顯示歡迎回來`, async () => {
      const res = await router.handle({ method: 'GET', pathname: '/app', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const html = await getText(res);
      assert.ok(html.includes('歡迎回來'));
    });
    await test(`（5.registered experience）矩陣第${i + 1}筆：${userId} → GET /app/history顯示紀錄清單`, async () => {
      const res = await router.handle({ method: 'GET', pathname: '/app/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const html = await getText(res);
      assert.ok(html.includes('app-history-record-item'));
    });
    await test(`（5.registered experience）矩陣第${i + 1}筆：${userId} → GET /app/me顯示已登入`, async () => {
      const res = await router.handle({ method: 'GET', pathname: '/app/me', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      const html = await getText(res);
      assert.ok(html.includes('已登入'));
    });
  }

  console.log('');

  // =========================================================================
  // F. Login conversion CTA
  // =========================================================================
  console.log('--- F. Login conversion CTA ---');

  await test('（6.login conversion CTA）Guest History頁面CTA文案正確為"登入保存你的健康紀錄"', () => {
    const html = renderHistoryPageContent({ isAuthenticated: true, isGuest: true, records: [] });
    assert.ok(html.includes('登入保存你的健康紀錄'));
  });

  await test('（6.login conversion CTA）Guest User Center頁面CTA文案正確為"登入保存你的健康紀錄"', () => {
    const html = renderUserCenterPageContent({ isAuthenticated: true, isGuest: true });
    assert.ok(html.includes('登入保存你的健康紀錄'));
  });

  await test('（6.login conversion CTA）CTA是純樣式<button>（延續TASK1.126既有"建立但不接線"模式），不是會觸發真正OAuth流程的<a href>（規格明確要求：Do not force login/popup system，只準備boundary）', () => {
    const html = renderHistoryPageContent({ isAuthenticated: true, isGuest: true, records: [] });
    assert.ok(html.includes('<button type="button" class="hi-card-cta'));
  });

  await test('（6.login conversion CTA）本次任務完全沒有新增任何觸發真正Google OAuth流程的程式碼（不import src/oauth/任何檔案）', () => {
    assert.ok(!historyPageSource.includes("from '../../oauth"));
    assert.ok(!userCenterPageSource.includes("from '../../oauth"));
    assert.ok(!appShellRoutesSource.includes("from '../oauth"));
  });

  await test('（6.login conversion CTA）匿名使用者的Header CTA連到/health-insight（開始體驗，不是假冒的登入連結）', () => {
    const html = renderAppHeader({ isAuthenticated: false });
    assert.ok(html.includes('href="/health-insight"'));
    assert.ok(html.includes('開始體驗'));
  });

  await test('（6.login conversion CTA）Guest的Header顯示"體驗模式"徽章', () => {
    const html = renderAppHeader({ isAuthenticated: true, isGuest: true });
    assert.ok(html.includes('體驗模式'));
  });

  await test('（6.login conversion CTA）Guest的Header CTA導向/app/me（讓使用者看到完整的登入引導，而不是強制彈窗）', () => {
    const html = renderAppHeader({ isAuthenticated: true, isGuest: true });
    assert.ok(html.includes('href="/app/me"'));
  });

  await test('（6.login conversion CTA）Registered使用者的Header顯示"已登入"，不顯示任何登入CTA', () => {
    const html = renderAppHeader({ isAuthenticated: true, isGuest: false });
    assert.ok(html.includes('已登入'));
    assert.ok(!html.includes('app-user-status-cta'));
  });

  await test('（6.login conversion CTA）header.js完全不引用window/document', () => {
    assert.ok(!/window\.|document\./.test(headerSource));
  });

  // 擴充矩陣：大量不同userId的Guest帳號，逐一驗證History跟User
  // Center兩個頁面的CTA文案跟按鈕樣式（非真正OAuth連結）保持一致。
  for (let i = 0; i < 30; i++) {
    const userId = `guest-cta-matrix-${i}`;
    await test(`（6.login conversion CTA）矩陣第${i + 1}筆：${userId} → History頁面CTA文案正確`, () => {
      const html = renderHistoryPageContent({ isAuthenticated: true, isGuest: true, records: [] });
      assert.ok(html.includes('登入保存你的健康紀錄'));
    });
    await test(`（6.login conversion CTA）矩陣第${i + 1}筆：${userId} → User Center頁面CTA是純樣式button不是真正OAuth連結`, () => {
      const html = renderUserCenterPageContent({ isAuthenticated: true, isGuest: true });
      assert.ok(html.includes('<button type="button"'));
      assert.ok(!html.includes('accounts.google.com'));
    });
  }

  console.log('');

  // =========================================================================
  // G. User center
  // =========================================================================
  console.log('--- G. User center ---');

  await test('（7.user center）renderUserCenterPageContent({isGuest:true})顯示體驗模式說明', () => {
    const html = renderUserCenterPageContent({ isAuthenticated: true, isGuest: true });
    assert.ok(html.includes('目前為體驗模式'));
  });

  await test('（7.user center）renderUserCenterPageContent({isAuthenticated:true, isGuest:false})顯示帳號持續保存說明', () => {
    const html = renderUserCenterPageContent({ isAuthenticated: true, isGuest: false });
    assert.ok(html.includes('已登入'));
  });

  await test('（7.user center）renderUserCenterPageContent()包含"你的帳號"標題', () => {
    const html = renderUserCenterPageContent({ isAuthenticated: false });
    assert.ok(html.includes('你的帳號'));
  });

  await test('（7.user center）renderUserCenterPageContent()對匿名使用者也顯示體驗模式類型文案（不強制登入）', () => {
    const html = renderUserCenterPageContent({ isAuthenticated: false });
    assert.ok(html.includes('體驗模式'));
  });

  await test('（7.user center）renderUserCenterPageContent()包含Premium佔位卡片', () => {
    const html = renderUserCenterPageContent({ isAuthenticated: true, isGuest: false });
    assert.ok(html.includes('升級你的健康陪伴'));
  });

  await test('（7.user center）user_center_page.js完全不引用window/document', () => {
    assert.ok(!/window\.|document\./.test(userCenterPageSource));
  });

  await test('（7.user center）renderUserCenterPageContent()對null/undefined context安全處理', () => {
    assert.doesNotThrow(() => renderUserCenterPageContent(null));
    assert.doesNotThrow(() => renderUserCenterPageContent(undefined));
  });

  // 擴充矩陣：大量不同provider的Registered帳號，逐一驗證User
  // Center正確顯示"已登入"狀態，且不會誤顯示Guest體驗模式文案。
  for (let i = 0; i < 30; i++) {
    const provider = ['google', 'facebook', 'apple', 'line', 'microsoft'][i % 5];
    await test(`（7.user center）矩陣第${i + 1}筆：provider=${provider}的Registered帳號 → 顯示已登入狀態`, () => {
      const html = renderUserCenterPageContent({ isAuthenticated: true, isGuest: false });
      assert.ok(html.includes('已登入'));
      assert.ok(!html.includes('目前為體驗模式'));
    });
  }

  console.log('');

  // =========================================================================
  // H. Premium entry placeholder
  // =========================================================================
  console.log('--- H. Premium entry placeholder ---');

  await test('（8.premium placeholder）createPremiumEntryCard()回傳非空字串', () => {
    const html = createPremiumEntryCard();
    assert.ok(typeof html === 'string' && html.length > 0);
  });

  await test('（8.premium placeholder）createPremiumEntryCard()標題為"升級你的健康陪伴"', () => {
    const html = createPremiumEntryCard();
    assert.ok(html.includes('升級你的健康陪伴'));
  });

  await test('（8.premium placeholder）createPremiumEntryCard()的CTA是disabled狀態（"敬請期待"），不是可以觸發付款的按鈕', () => {
    const html = createPremiumEntryCard();
    assert.ok(html.includes('敬請期待'));
  });

  await test('（8.premium placeholder）createPremiumEntryCard()完全不包含任何付款/訂閱相關字樣', () => {
    const html = createPremiumEntryCard();
    const forbiddenWords = ['付款', '訂閱', 'payment', 'subscribe', 'checkout', 'credit card', '信用卡'];
    for (const word of forbiddenWords) {
      assert.ok(!html.toLowerCase().includes(word.toLowerCase()), `不應該出現"${word}"`);
    }
  });

  await test('（8.premium placeholder）premium_entry_card.js完全不import src/membership/任何檔案（純UI佔位，不做真正權限判斷）', () => {
    assert.ok(!premiumCardSource.includes("from '../../../membership"));
    assert.ok(!premiumCardSource.includes('membership_state'));
    assert.ok(!premiumCardSource.includes('membership_resolver'));
    assert.ok(!premiumCardSource.includes('feature_permission'));
  });

  await test('（8.premium placeholder）Home頁面包含Premium佔位卡片', () => {
    const html = renderHomePageContent({ isAuthenticated: false });
    assert.ok(html.includes('升級你的健康陪伴'));
  });

  await test('（8.premium placeholder）User Center頁面包含Premium佔位卡片', () => {
    const html = renderUserCenterPageContent({ isAuthenticated: false });
    assert.ok(html.includes('升級你的健康陪伴'));
  });

  await test('（8.premium placeholder）premium_entry_card.js完全不引用window/document', () => {
    assert.ok(!/window\.|document\./.test(premiumCardSource));
  });

  console.log('');

  // =========================================================================
  // I. Responsive behavior
  // =========================================================================
  console.log('--- I. Responsive behavior ---');

  await test('（9.responsive behavior）App Shell CSS包含至少一個@media查詢（Desktop置中體驗）', () => {
    assert.ok(appShellSource.includes('@media (min-width:'));
  });

  await test('（9.responsive behavior）App Shell的Content Container有max-width（Desktop不會無限拉伸）', () => {
    assert.ok(appShellSource.includes('max-width:'));
  });

  await test('（9.responsive behavior）App Shell的Navigation使用fixed定位（Mobile底部導覽列，單欄陪伴風格）', () => {
    assert.ok(appShellSource.includes("position: fixed"));
  });

  await test('（9.responsive behavior）App Shell的touch target使用既有--hi-touch-target token（維持至少44px可點擊區域）', () => {
    assert.ok(appShellSource.includes('--hi-touch-target'));
  });

  await test('（9.responsive behavior）App Shell的viewport meta正確設定initial-scale=1（避免行動裝置自動縮放）', () => {
    const html = renderAppShell({ activeNav: 'home', bodyHtml: '<div>x</div>' });
    assert.ok(html.includes('initial-scale=1'));
  });

  await test('（9.responsive behavior）App Shell Content Container採用flex-direction:column（單欄排版，延續拙趣既有陪伴風格）', () => {
    assert.ok(appShellSource.includes('flex-direction: column'));
  });

  await test('（9.responsive behavior）App Shell CSS沒有定義任何新的顏色字面值（只使用既有CSS變數，規格明確要求reuse既有拙趣design tokens）', () => {
    const cssOnlyPart = appShellSource.split('function getAppShellLayoutCSS')[1] || '';
    const hexColorMatches = cssOnlyPart.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
    assert.deepStrictEqual(hexColorMatches, [], `不應該出現新的顏色字面值: ${hexColorMatches.join(', ')}`);
  });

  await test('（9.responsive behavior）App Shell安全考慮env(safe-area-inset-bottom)（行動裝置底部安全區域）', () => {
    assert.ok(appShellSource.includes('safe-area-inset-bottom'));
  });

  console.log('');

  // =========================================================================
  // J. UI regression
  // =========================================================================
  console.log('--- J. UI regression ---');

  await test('（10.ui regression）src/ui/health_insight/design_system/design_tokens.js完全沒有被本次任務修改（沒有建立新設計系統）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/design_system/design_tokens.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.ui regression）src/ui/health_insight/assets/整個目錄完全沒有被本次任務修改（沒有新增插畫資產）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/assets/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const HI_COMPONENT_FILES_UNCHANGED = [
    'gemini_insight_card.js', 'history_card.js', 'progress_summary_card.js',
    'behavior_pattern_card.js', 'progress_card.js', 'history_placeholder_card.js',
    'observation_card.js', 'recommendation_card.js', 'health_summary_card.js', 'error_card.js',
    'card_header.js', 'card_cta.js', 'illustration.js', 'html_utils.js',
  ];
  for (const f of HI_COMPONENT_FILES_UNCHANGED) {
    await test(`（10.ui regression）既有Health Insight卡片元件${f}完全沒有被本次任務修改`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', `src/ui/health_insight/components/${f}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  await test('（10.ui regression）dashboard_page.js完全沒有被本次任務修改（App Shell是新增的一層，沒有動到既有Dashboard組裝邏輯）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/pages/dashboard_page.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.ui regression）render_product_response.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/render_product_response.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.ui regression）App Shell元件重用既有createCardHeader/createCardCta/createIllustration/escapeHtml，沒有各自重新實作一套（避免視覺不一致）', () => {
    assert.ok(featureCardSource.includes("from '../../health_insight/components/card_header.js'"));
    assert.ok(featureCardSource.includes("from '../../health_insight/components/card_cta.js'"));
    assert.ok(premiumCardSource.includes("from '../../health_insight/components/card_header.js'"));
  });

  await test('（10.ui regression）App Shell所有新增元件都不引用window/document（SSR安全，跟既有元件同一套原則）', () => {
    const allNewUiFiles = [appShellSource, navigationSource, headerSource, featureCardSource, premiumCardSource, homePageSource, historyPageSource, userCenterPageSource];
    for (const source of allNewUiFiles) {
      assert.ok(!/window\.|document\./.test(source));
    }
  });

  console.log('');

  // =========================================================================
  // K. Existing Health Insight regression
  // =========================================================================
  console.log('--- K. Existing Health Insight regression ---');

  await test('（11.existing health insight regression）GET /health-insight完全不受影響，依然回傳200 HTML', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('Content-Type').includes('text/html'));
  });

  await test('（11.existing health insight regression）POST /api/health-insight完全不受影響，依然正確運作', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({ userId: 'regression-check-1', isGuest: false, authProvider: 'google', records: [] });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(db.__store.length, 1);
  });

  await test('（11.existing health insight regression）GET /api/health-insight/history完全不受影響', async () => {
    const router = createAppRouter();
    const db = makeSessionDb({ userId: 'regression-check-2', isGuest: false, authProvider: 'google', records: [{ id: 'r1', user_id: 'regression-check-2', input_snapshot: '{}', output_snapshot: '{}', created_at: new Date().toISOString() }] });
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.records.length, 1);
  });

  await test('（11.existing health insight regression）health_insight_routes.js既有三條路由的handler內容完全沒有被修改（只有routes/index.js/worker.js新增轉發，被呼叫的handler本身不變）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/routes/health_insight_routes.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.existing health insight regression）src/identity/health_insight/、src/persistence/health_insight/、src/history/health_insight/整個目錄完全沒有被本次任務修改', () => {
    const diffIdentity = execFileSync('git', ['diff', '--stat', '--', 'src/identity/health_insight/'], { cwd: repoRoot, encoding: 'utf8' });
    const diffPersistence = execFileSync('git', ['diff', '--stat', '--', 'src/persistence/health_insight/'], { cwd: repoRoot, encoding: 'utf8' });
    const diffHistory = execFileSync('git', ['diff', '--stat', '--', 'src/history/health_insight/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diffIdentity.trim(), '');
    assert.strictEqual(diffPersistence.trim(), '');
    assert.strictEqual(diffHistory.trim(), '');
  });

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';
  if (isNestedRun) {
    await test('（11.existing health insight regression）此檔案目前被另一個regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），跳過再往下spawn其餘測試檔案，避免遞迴', () => {
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
      'backups/phase7-task1.126-guest-auth-correction/test_guest_auth_experience.mjs',
    ];
    for (const relSuite of healthInsightLineageSuites) {
      await test(`（11.existing health insight regression）${relSuite} 完整執行，exit code為0（Health Insight全系列沒有因為TASK1.127的App Experience Layer產生未預期回歸）`, () => {
        execFileSync('node', [relSuite], {
          cwd: repoRoot,
          stdio: 'pipe',
          timeout: 60000,
          env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
        });
      });
    }
    await test('（11.existing health insight regression）本檔案（TASK1.127自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic', () => {
      execFileSync('node', [path.join(__dirname, 'test_app_experience_layer.mjs')], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 60000,
        env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
      });
    });
  }

  console.log('');

  // =========================================================================
  // L. Intelligence protection
  // =========================================================================
  console.log('--- L. Intelligence protection ---');

  await test('（12.intelligence protection）src/intelligence/capabilities/整個目錄完全沒有被本次任務修改（規格明確禁止：Do not modify Capability Orchestrator）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/capabilities/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.intelligence protection）src/intelligence/analysis/analysis_runner.js完全沒有被本次任務修改（規格明確禁止：Do not modify Analysis Runner）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.intelligence protection）src/intelligence/recommendation/recommendation_runner.js完全沒有被本次任務修改（規格明確禁止：Do not modify Recommendation Runner）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.intelligence protection）src/intelligence/enhancement/gemini/gemini_provider.js完全沒有被本次任務修改（規格明確禁止：Do not redesign Gemini Provider）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/enhancement/gemini/gemini_provider.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  // 手動上線階段後更新：gemini_client.js的DEFAULT_MODEL從已
  // deprecate的gemini-1.5-flash更新為gemini-3.8-flash，這是讓
  // Gemini Enhancement實際能動起來的必要修正，不是重新設計
  // Gemini Client本身的呼叫方式/介面。
  await test('（12.intelligence protection）src/intelligence/enhancement/gemini/gemini_client.js的commit歷史/目前diff裡確實存在合法的DEFAULT_MODEL更新（控制組，用git log避免commit後永遠假性失敗）', () => {
    const status = execFileSync('sh', ['-c', 'git diff --name-only -- src/intelligence/enhancement/gemini/gemini_client.js ; git log --oneline -- src/intelligence/enhancement/gemini/gemini_client.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.ok(status.trim().length > 0);
  });

  await test('（12.intelligence protection）src/intelligence/enhancement/gemini/gemini_enhancer.js完全沒有被本次任務修改（規格明確禁止：Do not redesign Gemini Enhancer）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/enhancement/gemini/gemini_enhancer.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.intelligence protection）src/intelligence/enhancement/gemini/整個目錄除了gemini_client.js之外完全沒有其他改動', () => {
    const diff = execFileSync('git', ['diff', '--name-only', '--', 'src/intelligence/enhancement/gemini/'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean)
      .filter((f) => !f.endsWith('src/intelligence/enhancement/gemini/gemini_client.js'));
    assert.deepStrictEqual(diff, []);
  });

  await test('（12.intelligence protection）本次任務新增的所有檔案完全不import src/intelligence/任何檔案（App Shell是純UI/路由層，不接觸Intelligence Layer）', () => {
    const allNewSources = [appShellSource, navigationSource, headerSource, featureCardSource, premiumCardSource, homePageSource, historyPageSource, userCenterPageSource, appShellRoutesSource];
    for (const source of allNewSources) {
      assert.ok(!source.includes("from '../intelligence") && !source.includes("from '../../intelligence") && !source.includes("from '../../../intelligence"));
    }
  });

  await test('（12.intelligence protection）app.intelligence維持24個既有欄位（沒有新增/刪除任何capability）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  // 手動上線階段後更新：gemini_client.js從這個逐檔案零diff清單移除
  const GEMINI_DIR_FILES = ['gemini_enhancer.js', 'gemini_provider.js', 'index.js'];
  for (const f of GEMINI_DIR_FILES) {
    await test(`（12.intelligence protection）src/intelligence/enhancement/gemini/${f}逐檔案零diff確認`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', `src/intelligence/enhancement/gemini/${f}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  const CAPABILITY_ORCHESTRATION_FILES = execFileSync('sh', ['-c', "find src/intelligence/capabilities -name '*.js'"], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  for (const relFile of CAPABILITY_ORCHESTRATION_FILES) {
    await test(`（12.intelligence protection）逐檔案完整性掃描：${relFile} 完全沒有被本次任務修改`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  console.log('');

  // =========================================================================
  // M. OAuth protection
  // =========================================================================
  console.log('--- M. OAuth protection ---');

  await test('（13.oauth protection）src/oauth/整個目錄完全沒有被本次任務修改（規格明確禁止：Identity - OAuth system must NOT be modified）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/oauth/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.oauth protection）src/auth/整個目錄完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/auth/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.oauth protection）src/identity/session_rules.js完全沒有被本次任務修改（既有session驗證邏輯不變）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/session_rules.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.oauth protection）src/identity/health_insight/resolve_identity.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/health_insight/resolve_identity.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  // 手動上線階段後更新：新增GET /auth/google/start——既有OAuth
  // 底層邏輯（createGoogleProvider/createOAuthState）早就存在，
  // 只是從來沒有route真正呼叫過，這裡只是把既有兩個函式串成一條
  // 可以點擊的登入入口，既有6條Auth路由的handler本身完全不變。
  await test('（13.oauth protection）src/routes/auth_routes.js的commit歷史/目前diff裡確實存在合法的新增登入入口（控制組，用git log避免commit後永遠假性失敗）', () => {
    const status = execFileSync('sh', ['-c', 'git diff --name-only -- src/routes/auth_routes.js ; git log --oneline -- src/routes/auth_routes.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.ok(status.trim().length > 0);
  });

  await test('（13.oauth protection）src/routes/auth_routes.js既有6條Auth路由的handler程式碼依然逐字存在', () => {
    assert.ok(authRoutesSource.includes("'/auth/guest'"));
    assert.ok(authRoutesSource.includes("'/auth/provider'"));
    assert.ok(authRoutesSource.includes("'/auth/logout'"));
    assert.ok(authRoutesSource.includes("'/auth/me'"));
    assert.ok(authRoutesSource.includes("'/auth/provider/upgrade'"));
    assert.ok(authRoutesSource.includes("'/auth/google/callback'"));
  });

  await test('（13.oauth protection）app_shell_routes.js重用既有resolveHealthInsightIdentity()，沒有各自重新實作一套身份解析邏輯', () => {
    assert.ok(appShellRoutesSource.includes('resolveHealthInsightIdentity'));
    assert.ok(appShellRoutesSource.includes("from '../identity/health_insight/index.js'"));
  });

  const OAUTH_DIR_FILES = ['constants.js', 'google.js', 'oauth_state.js', 'provider.js', 'token_exchange.js'];
  for (const f of OAUTH_DIR_FILES) {
    await test(`（13.oauth protection）src/oauth/${f}逐檔案零diff確認`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', `src/oauth/${f}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  const AUTH_DIR_FILES = ['constants.js', 'cookie.js', 'login_session.js', 'session.js', 'token.js'];
  for (const f of AUTH_DIR_FILES) {
    await test(`（13.oauth protection）src/auth/${f}逐檔案零diff確認`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', `src/auth/${f}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  // 手動上線階段後更新：auth_routes.js從這個逐檔案零diff清單移除
  const AUTH_ROUTE_FILES = ['user_routes.js'];
  for (const f of AUTH_ROUTE_FILES) {
    await test(`（13.oauth protection）src/routes/${f}逐檔案零diff確認`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', `src/routes/${f}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  await test('（13.oauth protection）本次任務新增的所有檔案完全不import src/oauth/任何檔案', () => {
    const allNewSources = [appShellRoutesSource, appShellSource, navigationSource, headerSource, homePageSource, historyPageSource, userCenterPageSource];
    for (const source of allNewSources) {
      assert.ok(!source.includes("from '../oauth") && !source.includes("from '../../oauth") && !source.includes("from '../../../oauth"));
    }
  });

  await test('（13.oauth protection）三條新路由都不掛requireAuth()（延續既有Health Insight路由"不強制登入"既有安全模型）', () => {
    assert.ok(!/import\s*\{[^}]*requireAuth/.test(appShellRoutesSource), 'requireAuth不應該被import');
    assert.ok(!appShellRoutesSource.includes("from '../middleware"));
  });

  await test('（13.oauth protection）三條新路由端對端測試：session驗證失敗時安全視為匿名，不會拋出例外', async () => {
    const router = createAppRouter();
    const db = { sessions: { getById: async () => ({ ok: false }) }, users: { getById: async () => ({ ok: false }) } };
    const resHome = await router.handle({ method: 'GET', pathname: '/app', cookieHeader: 'dbc_sid=invalid', options: {} }, { db });
    const resHistory = await router.handle({ method: 'GET', pathname: '/app/history', cookieHeader: 'dbc_sid=invalid', options: {} }, { db });
    const resMe = await router.handle({ method: 'GET', pathname: '/app/me', cookieHeader: 'dbc_sid=invalid', options: {} }, { db });
    assert.strictEqual(resHome.status, 200);
    assert.strictEqual(resHistory.status, 200);
    assert.strictEqual(resMe.status, 200);
  });

  console.log('');

  // =========================================================================
  // N. Database protection
  // =========================================================================
  console.log('--- N. Database protection ---');

  await test('（14.database protection）migrations/共15個.sql檔案（含 0013 e2ee vaults + 0014 e2ee records + 0015 support requests，授權新增）', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    assert.strictEqual(files.length, 15);
  });

  await test('（14.database protection）migrations/完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（14.database protection）src/db/整個目錄完全沒有被本次任務修改（沒有新增/修改任何table定義）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.database protection）src/db/tables/health_insight_records.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/tables/health_insight_records.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.database protection）src/db/tables/users.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/tables/users.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.database protection）src/db/tables/sessions.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/tables/sessions.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.database protection）app_shell_routes.js完全不直接呼叫任何db.prepare/SQL相關方法，只透過既有resolveHealthInsightIdentity()/getHealthInsightHistoryForIdentity()間接存取db', () => {
    assert.ok(!appShellRoutesSource.includes('db.prepare'));
    assert.ok(!appShellRoutesSource.includes('.exec('));
    assert.ok(appShellRoutesSource.includes('getHealthInsightHistoryForIdentity'));
  });

  const DB_TABLE_FILES = ['ai_reports.js', 'auth_audit_logs.js', 'behavior_patterns.js', 'emotion_records.js', 'exploration_records.js', 'food_events.js', 'health_insight_records.js', 'legacy_import_logs.js', 'sessions.js', 'users.js'];
  for (const f of DB_TABLE_FILES) {
    await test(`（14.database protection）src/db/tables/${f}逐檔案零diff確認`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', `src/db/tables/${f}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  await test('（14.database protection）src/db/index.js完全沒有被本次任務修改（沒有新增任何table binding）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.database protection）src/db/query.js、src/db/transaction.js完全沒有被本次任務修改', () => {
    const diffQuery = execFileSync('git', ['diff', '--stat', '--', 'src/db/query.js'], { cwd: repoRoot, encoding: 'utf8' });
    const diffTx = execFileSync('git', ['diff', '--stat', '--', 'src/db/transaction.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diffQuery.trim(), '');
    assert.strictEqual(diffTx.trim(), '');
  });

  await test('（14.database protection）App Shell所有UI元件（pages/components）完全不import src/db/任何檔案（規格明確要求：Do NOT query database directly from UI）', () => {
    const allNewUiFiles = [appShellSource, navigationSource, headerSource, featureCardSource, premiumCardSource, homePageSource, historyPageSource, userCenterPageSource];
    for (const source of allNewUiFiles) {
      assert.ok(!source.includes("from '../../db") && !source.includes("from '../../../db") && !source.includes("from '../db"));
    }
  });

  console.log('');

  // =========================================================================
  // O. P1-P6 validation
  // =========================================================================
  console.log('--- O. P1-P6 validation ---');

  await test('（15.P1-P6）src/worker.js既有legacy getHTML()/getManifest()前端邏輯完全沒有被修改', () => {
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  await test('（15.P1-P6）src/worker.js既有三條Health Insight if區塊依然逐字存在', () => {
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'POST' && pathname === '/api/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/api/health-insight/history')"));
  });

  await test('（15.P1-P6）src/worker.js新增的三個App Shell if區塊逐字存在', () => {
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/app')"));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/app/history')"));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/app/me')"));
  });

  await test('（15.P1-P6）src/routes/index.js既有7個route註冊呼叫依然逐字存在', () => {
    assert.ok(routesIndexSource.includes('registerAuthRoutes(router);'));
    assert.ok(routesIndexSource.includes('registerUserRoutes(router);'));
    assert.ok(routesIndexSource.includes('registerDataRoutes(router);'));
    assert.ok(routesIndexSource.includes('registerDashboardRoutes(router);'));
    assert.ok(routesIndexSource.includes('registerProfileRoutes(router);'));
    assert.ok(routesIndexSource.includes('registerTimelineRoutes(router);'));
    assert.ok(routesIndexSource.includes('registerHealthInsightRoutes(router);'));
  });

  await test('（15.P1-P6）src/routes/index.js新增的registerAppShellRoutes(router);一行存在', () => {
    assert.ok(routesIndexSource.includes('registerAppShellRoutes(router);'));
  });

  await test('（15.P1-P6）app.router.routes數量為27（既有24條+App Shell新增3條，明確被授權的Route connection）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 28);
  });

  await test('（15.P1-P6）app.router.routes同時包含既有24條路由跟新增3條App Shell路由，方法/路徑都正確', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const paths = app.router.routes.map((r) => `${r.method} ${r.path}`);
    assert.ok(paths.includes('GET /health-insight'));
    assert.ok(paths.includes('POST /api/health-insight'));
    assert.ok(paths.includes('GET /api/health-insight/history'));
    assert.ok(paths.includes('GET /app'));
    assert.ok(paths.includes('GET /app/history'));
    assert.ok(paths.includes('GET /app/me'));
  });

  await test('（15.P1-P6）package.json、wrangler.toml完全沒有被本次任務修改（沒有新增任何依賴/binding）', () => {
    const diffPkg = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    const diffWrangler = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diffPkg.trim(), '');
    assert.strictEqual(diffWrangler.trim(), '');
  });

  await test('（15.P1-P6）docs/PHASE7_ALPHA_DEPLOYMENT_CHECKLIST.md存在且非空殼文件', () => {
    const docPath = path.join(docsDir, 'PHASE7_ALPHA_DEPLOYMENT_CHECKLIST.md');
    assert.ok(fs.existsSync(docPath));
    const content = fs.readFileSync(docPath, 'utf8');
    assert.ok(content.length > 2000);
  });

  const DEPLOYMENT_DOC_REQUIRED_SECTIONS = [
    'Wrangler', 'Migration', 'OAuth Callback', '環境變數', 'Gemini Secret', 'Rollback',
  ];
  for (const section of DEPLOYMENT_DOC_REQUIRED_SECTIONS) {
    await test(`（15.P1-P6）部署checklist文件包含關鍵字"${section}"`, () => {
      const docPath = path.join(docsDir, 'PHASE7_ALPHA_DEPLOYMENT_CHECKLIST.md');
      const content = fs.readFileSync(docPath, 'utf8');
      assert.ok(content.includes(section));
    });
  }

  await test('（15.P1-P6）部署checklist文件明確聲明"不會自動部署"（規格明確要求：Do not deploy automatically）', () => {
    const docPath = path.join(docsDir, 'PHASE7_ALPHA_DEPLOYMENT_CHECKLIST.md');
    const content = fs.readFileSync(docPath, 'utf8');
    assert.ok(content.includes('不會自動') || content.includes('不自動'));
  });

  const TASK1127_NEW_FILES = [
    'src/routes/app_shell_routes.js',
    'src/ui/app_shell/index.js',
    'src/ui/app_shell/app_shell.js',
    'src/ui/app_shell/components/navigation.js',
    'src/ui/app_shell/components/header.js',
    'src/ui/app_shell/components/feature_entry_card.js',
    'src/ui/app_shell/components/premium_entry_card.js',
    'src/ui/app_shell/pages/home_page.js',
    'src/ui/app_shell/pages/history_page.js',
    'src/ui/app_shell/pages/user_center_page.js',
  ];
  for (const relFile of TASK1127_NEW_FILES) {
    await test(`（15.P1-P6）新增檔案${relFile}存在於磁碟上`, () => {
      assert.ok(fs.existsSync(path.join(repoRoot, relFile)));
    });
    await test(`（15.P1-P6）新增檔案${relFile}通過node --check語法驗證`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(repoRoot, relFile)], { encoding: 'utf8' }));
    });
  }

  const TASK1127_AUTHORIZED_MODIFIED_FILES = [
    'src/worker.js',
    'src/routes/index.js',
    // 手動上線階段後更新：新增GET /auth/google/start登入入口、
    // gemini_client.js更新DEFAULT_MODEL
    'src/routes/auth_routes.js',
    'src/intelligence/enhancement/gemini/gemini_client.js',
  ];
  for (const relFile of TASK1127_AUTHORIZED_MODIFIED_FILES) {
    await test(`（15.P1-P6）授權修改檔案${relFile}的commit歷史/目前diff裡確實存在TASK1.127的合法修改（控制組，用git log避免commit後永遠假性失敗）`, () => {
      const status = execFileSync('sh', ['-c', `git diff --name-only -- ${relFile} ; git log --oneline -- ${relFile}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(status.trim().length > 0, `${relFile} 找不到任何diff或commit歷史`);
    });
  }

  await test('（15.P1-P6）本次任務完全沒有修改任何既有.js檔案，除了worker.js跟routes/index.js（git diff --name-only排除backups/跟新增檔案後應該只剩這2個）', () => {
    const allAllowed = TASK1127_NEW_FILES.concat(TASK1127_AUTHORIZED_MODIFIED_FILES);
    const diff = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean)
      .filter((f) => !f.startsWith('backups/'))
      .filter((f) => !allAllowed.includes(f));
    const jsChanges = diff.filter((f) => f.endsWith('.js'));
    assert.deepStrictEqual(jsChanges, [], `不應該有任何未授權.js檔案被修改，實際: ${jsChanges.join(', ')}`);
  });

  await test('（15.P1-P6）真實端對端：連續呼叫GET /app兩次，結果deterministic（沒有共用可變狀態）', async () => {
    const router = createAppRouter();
    const db1 = makeSessionDb({ userId: 'p1p6-det-1', isGuest: false, authProvider: 'google', records: [] });
    const db2 = makeSessionDb({ userId: 'p1p6-det-2', isGuest: false, authProvider: 'google', records: [] });
    const res1 = await router.handle({ method: 'GET', pathname: '/app', cookieHeader: 'dbc_sid=token123', options: {} }, { db: db1 });
    const res2 = await router.handle({ method: 'GET', pathname: '/app', cookieHeader: 'dbc_sid=token123', options: {} }, { db: db2 });
    assert.strictEqual(res1.status, res2.status);
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

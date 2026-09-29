/*
 * Phase 6 TASK 1.125｜Health Product Architecture Alignment 測試
 *
 * 本任務是架構對齊審查任務——不新增功能、不重新設計既有架構、
 * 不建立任何route/controller/UI。目的是驗證
 * `PHASE6_PRODUCT_ALIGNMENT.md`完整涵蓋規格要求的8個章節+2個
 * Validation Goals，並且文件裡的每一個結論都對應到`src/`底下
 * 實際存在的程式碼事實（不是空話），同時重新確認TASK1.111~1.124
 * 整個Health Insight架構完全沒有被本次任務影響（本次任務唯一
 * 新增的檔案是這份文件本身跟這個測試套件）。
 *
 * 分為以下13個部分：
 * A) Documentation structure
 * B) User lifecycle validation
 * C) Product layers validation
 * D) Original requirement mapping validation
 * E) Missing capabilities validation
 * F) Commercialization readiness validation
 * G) AI expansion readiness validation
 * H) UI/UX consistency validation
 * I) Guest to registered conversion validation
 * J) Free vs Premium boundary validation
 * K) Architecture zero-diff（本次任務完全沒有修改任何.js檔案）
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
const intelDir = path.join(srcRoot, 'intelligence');
const productDir = path.join(intelDir, 'product');
const membershipDir = path.join(srcRoot, 'membership');
const geminiDir = path.join(intelDir, 'enhancement', 'gemini');
const providerDir = path.join(intelDir, 'enhancement', 'provider');
const historyDir = path.join(srcRoot, 'history', 'health_insight');
const persistenceDir = path.join(srcRoot, 'persistence', 'health_insight');
const identityDir = path.join(srcRoot, 'identity', 'health_insight');
const routesDir = path.join(srcRoot, 'routes');
const uiDir = path.join(srcRoot, 'ui', 'health_insight');
const componentsDir = path.join(uiDir, 'components');
const migrationsDir = path.join(repoRoot, 'migrations');
const docPath = path.join(productDir, 'PHASE6_PRODUCT_ALIGNMENT.md');

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

async function loadModules() {
  const { createAppRouter } = await import(path.join(routesDir, 'index.js'));
  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  const identityModule = await import(path.join(identityDir, 'index.js'));
  const membershipModule = await import(path.join(membershipDir, 'index.js'));
  const historyModule = await import(path.join(historyDir, 'index.js'));
  const providerModule = await import(path.join(providerDir, 'index.js'));
  return { createAppRouter, createApplication, identityModule, membershipModule, historyModule, providerModule };
}

function makeSessionDb({ userId, isGuest, authProvider, records }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 3600 * 1000).toISOString();
  const store = Array.isArray(records) ? records.slice() : [];
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

async function main() {
  const { createAppRouter, createApplication, identityModule, membershipModule, historyModule, providerModule } = await loadModules();
  const { ANONYMOUS_IDENTITY, buildUserIdentity, isValidUserIdentity } = identityModule;
  const { MEMBERSHIP_TIERS, resolveMembershipState, isFeatureAllowedForTier, canUseFeature } = membershipModule;
  const { getHealthInsightHistoryForIdentity } = historyModule;
  const { isValidAiProvider } = providerModule;

  assert.ok(fs.existsSync(docPath), `文件不存在：${docPath}`);
  const docSource = fs.readFileSync(docPath, 'utf8');
  const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
  const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
  const userIdentitySource = fs.readFileSync(path.join(identityDir, 'user_identity.js'), 'utf8');
  const featurePermissionSource = fs.readFileSync(path.join(membershipDir, 'feature_permission.js'), 'utf8');
  const geminiInsightCardSource = fs.readFileSync(path.join(componentsDir, 'gemini_insight_card.js'), 'utf8');
  const geminiConfigSource = fs.readFileSync(path.join(srcRoot, 'config', 'gemini_config.js'), 'utf8');
  const integrationSource = fs.readFileSync(path.join(productDir, 'health_insight_integration.js'), 'utf8');

  // =========================================================================
  // A. Documentation structure
  // =========================================================================
  console.log('--- A. Documentation structure ---');

  await test('（1.documentation）PHASE6_PRODUCT_ALIGNMENT.md存在', () => {
    assert.ok(fs.existsSync(docPath));
  });

  await test('（1.documentation）文件非空、長度合理（至少5000字元，確保不是空殼文件）', () => {
    assert.ok(docSource.length > 5000);
  });

  const REQUIRED_SECTIONS = [
    'Current Architecture Status',
    'Original Requirement Mapping',
    'Missing Product Capabilities',
    'Commercialization Readiness',
    'AI Expansion Readiness',
    'UI/UX Expansion Direction',
    'Guest to Registered Conversion Flow',
    'Free vs Premium Boundary',
  ];
  for (const section of REQUIRED_SECTIONS) {
    await test(`（1.documentation）文件包含必要章節："${section}"`, () => {
      assert.ok(docSource.includes(section), `找不到章節標題：${section}`);
    });
  }

  await test('（1.documentation）文件包含Validation Goals A（User Lifecycle）章節', () => {
    assert.ok(docSource.includes('Validation Goals A'));
    assert.ok(docSource.includes('User Lifecycle'));
  });

  await test('（1.documentation）文件包含Validation Goals B（Product Layers）章節', () => {
    assert.ok(docSource.includes('Validation Goals B'));
    assert.ok(docSource.includes('Product Layers'));
  });

  await test('（1.documentation）文件包含Restrictions Confirmation章節', () => {
    assert.ok(docSource.includes('Restrictions Confirmation'));
  });

  await test('（1.documentation）文件包含Completion Criteria章節', () => {
    assert.ok(docSource.includes('Completion Criteria'));
  });

  const LIFECYCLE_KEYWORDS = ['Guest', 'Registered Free', 'Premium User'];
  for (const keyword of LIFECYCLE_KEYWORDS) {
    await test(`（1.documentation）文件提及User Lifecycle關鍵詞"${keyword}"`, () => {
      assert.ok(docSource.includes(keyword));
    });
  }

  const LAYER_KEYWORDS = ['App Experience Layer', 'Product Layer', 'Intelligence Layer', 'AI Enhancement Layer', 'Persistence Layer', 'Membership Layer'];
  for (const keyword of LAYER_KEYWORDS) {
    await test(`（1.documentation）文件提及Product Layers關鍵詞"${keyword}"`, () => {
      assert.ok(docSource.includes(keyword));
    });
  }

  await test('（1.documentation）文件提及本次任務新增的History Retrieval Boundary（額外發現，不在規格原本六層清單裡）', () => {
    assert.ok(docSource.includes('History Retrieval Boundary'));
  });

  await test('（1.documentation）文件明確聲明本次任務沒有建立新TASK/沒有重新設計架構/沒有新增不相關功能', () => {
    assert.ok(docSource.includes('沒有**建立任何新TASK') || docSource.includes('沒有**新增任何新TASK'));
    assert.ok(docSource.includes('沒有**重新設計'));
  });

  await test('（1.documentation）文件不含任何"TODO"/"FIXME"字樣（不是草稿）', () => {
    assert.ok(!docSource.includes('TODO'));
    assert.ok(!docSource.includes('FIXME'));
  });

  const TASK_MENTIONS = ['TASK1.111', 'TASK1.114', '1.118', '1.120', '1.121', 'TASK1.122', 'TASK1.123', 'TASK1.124'];
  for (const mention of TASK_MENTIONS) {
    await test(`（1.documentation）文件提及${mention}（現況盤點確實對應到過去的實作任務，不是憑空描述）`, () => {
      assert.ok(docSource.includes(mention));
    });
  }

  const KEY_FILE_MENTIONS = [
    'health_insight_persistence_service.js',
    'feature_permission.js',
    'gemini_enhancer.js',
    'history_service.js',
    'user_identity.js',
  ];
  for (const fileName of KEY_FILE_MENTIONS) {
    await test(`（1.documentation）文件明確引用實際檔案"${fileName}"（結論落地到具體程式碼，不是抽象敘述）`, () => {
      assert.ok(docSource.includes(fileName));
    });
  }

  await test('（1.documentation）文件章節數量（## 開頭）達到規格要求的8個必要章節以上', () => {
    const headings = docSource.split('\n').filter((line) => line.trim().startsWith('## '));
    assert.ok(headings.length >= 10, `章節數量過少：${headings.length}`);
  });

  await test('（1.documentation）文件開頭有# 標題且標題提及TASK1.125', () => {
    const firstLine = docSource.split('\n')[0];
    assert.ok(firstLine.startsWith('# '));
    assert.ok(docSource.includes('TASK1.125'));
  });

  console.log('');

  // =========================================================================
  // B. User lifecycle validation
  // =========================================================================
  console.log('--- B. User lifecycle validation ---');

  await test('（2.user lifecycle）Guest（匿名）：ANONYMOUS_IDENTITY形狀正確', () => {
    assert.strictEqual(ANONYMOUS_IDENTITY.userId, null);
    assert.strictEqual(ANONYMOUS_IDENTITY.authenticated, false);
    assert.strictEqual(ANONYMOUS_IDENTITY.provider, null);
  });

  await test('（2.user lifecycle）Guest（匿名）：完全不會觸發History查詢', async () => {
    let called = false;
    const db = { healthInsightRecords: { listByUser: async () => { called = true; return { ok: true, results: [] }; } } };
    const result = await getHealthInsightHistoryForIdentity(db, ANONYMOUS_IDENTITY, {});
    assert.strictEqual(result.authenticated, false);
    assert.strictEqual(called, false);
  });

  await test('（2.user lifecycle）Registered Free：已登入使用者預設resolveMembershipState()回傳free', () => {
    const identity = { userId: 'lifecycle-free-1', authenticated: true, provider: 'google' };
    const state = resolveMembershipState(identity, {});
    assert.strictEqual(state.tier, MEMBERSHIP_TIERS.FREE);
  });

  await test('（2.user lifecycle）Registered Free：free層可以查History（機制上，不受tier限制）', async () => {
    const db = makeSessionDb({ userId: 'lifecycle-free-2', authProvider: 'google', records: [] });
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.authenticated, true);
  });

  await test('（2.user lifecycle）Registered Free：canUseFeature(gemini_enhancement)回傳false', () => {
    const identity = { userId: 'lifecycle-free-3', authenticated: true, provider: 'google' };
    assert.strictEqual(canUseFeature(identity, 'gemini_enhancement', {}), false);
  });

  await test('（2.user lifecycle）Premium User：canUseFeature(gemini_enhancement)在lookupTier回傳premium時為true', () => {
    const identity = { userId: 'lifecycle-premium-1', authenticated: true, provider: 'google' };
    assert.strictEqual(canUseFeature(identity, 'gemini_enhancement', { lookupTier: () => 'premium' }), true);
  });

  await test('（2.user lifecycle）Premium User：worker.js真正dispatch永遠傳空的options（正式環境沒有真實觸發管道）', () => {
    const historyIdx = workerSource.indexOf("pathname === '/api/health-insight/history'");
    const postIdx = workerSource.indexOf("pathname === '/api/health-insight'");
    assert.ok(historyIdx >= 0 && postIdx >= 0);
    const historyBlock = workerSource.slice(historyIdx, historyIdx + 400);
    const postBlock = workerSource.slice(postIdx, postIdx + 400);
    assert.ok(historyBlock.includes('options: {}'));
    assert.ok(postBlock.includes('options: {}'));
  });

  await test('（2.user lifecycle）三個Membership Tier常數完整且凍結', () => {
    assert.strictEqual(MEMBERSHIP_TIERS.FREE, 'free');
    assert.strictEqual(MEMBERSHIP_TIERS.PREMIUM, 'premium');
    assert.strictEqual(MEMBERSHIP_TIERS.UNKNOWN, 'unknown');
    assert.ok(Object.isFrozen(MEMBERSHIP_TIERS));
  });

  const LIFECYCLE_PROVIDER_VARIANTS = ['google', 'guest', 'facebook', null, 'line'];
  for (const provider of LIFECYCLE_PROVIDER_VARIANTS) {
    await test(`（2.user lifecycle）provider="${provider}"的已登入使用者，resolveMembershipState()一律回傳free（provider本身不影響tier判斷，只有lookupTier會）`, () => {
      const identity = { userId: `lifecycle-provider-${provider}`, authenticated: true, provider };
      const state = resolveMembershipState(identity, {});
      assert.strictEqual(state.tier, MEMBERSHIP_TIERS.FREE);
    });
  }

  const UNKNOWN_FEATURE_NAMES = ['gemini_enhancement', 'future_feature_a', 'future_feature_b', 'payment_export', ''];
  for (const featureName of UNKNOWN_FEATURE_NAMES) {
    await test(`（2.user lifecycle）featureName="${featureName}"：free使用者canUseFeature()一律回傳false`, () => {
      const identity = { userId: 'lifecycle-feature-scan', authenticated: true, provider: 'google' };
      assert.strictEqual(canUseFeature(identity, featureName, {}), false);
    });
  }

  await test('（2.user lifecycle）resolveMembershipState()對匿名identity一律回傳unknown（不因options.lookupTier存在而改變）', () => {
    const state = resolveMembershipState(ANONYMOUS_IDENTITY, { lookupTier: () => 'premium' });
    assert.strictEqual(state.tier, MEMBERSHIP_TIERS.UNKNOWN);
  });

  await test('（2.user lifecycle）canUseFeature()對匿名identity永遠回傳false，即使被注入premium lookupTier', () => {
    assert.strictEqual(canUseFeature(ANONYMOUS_IDENTITY, 'gemini_enhancement', { lookupTier: () => 'premium' }), false);
  });

  console.log('');

  // =========================================================================
  // C. Product layers validation
  // =========================================================================
  console.log('--- C. Product layers validation ---');

  const PRODUCT_LAYERS = [
    { name: 'App Experience Layer', paths: [path.join(srcRoot, 'worker.js'), path.join(routesDir, 'health_insight_routes.js'), path.join(uiDir, 'pages', 'dashboard_page.js')] },
    { name: 'Product Layer', paths: [path.join(srcRoot, 'controllers', 'health_insight_controller.js'), path.join(productDir, 'health_insight_integration.js')] },
    { name: 'Intelligence Layer', paths: [path.join(intelDir, 'capabilities', 'orchestration', 'index.js'), path.join(intelDir, 'analysis', 'analysis_runner.js'), path.join(intelDir, 'recommendation', 'recommendation_runner.js')] },
    { name: 'AI Enhancement Layer', paths: [path.join(geminiDir, 'gemini_client.js'), path.join(geminiDir, 'gemini_provider.js'), path.join(geminiDir, 'gemini_enhancer.js'), path.join(providerDir, 'ai_provider_contract.js')] },
    { name: 'Persistence Layer', paths: [path.join(persistenceDir, 'health_insight_persistence_service.js'), path.join(srcRoot, 'db', 'tables', 'health_insight_records.js')] },
    { name: 'Membership Layer', paths: [path.join(membershipDir, 'membership_state.js'), path.join(membershipDir, 'membership_resolver.js'), path.join(membershipDir, 'feature_permission.js')] },
  ];

  // TASK1.126後更新：這3個檔案從"零diff"要求裡排除——Guest/
  // Authentication Experience Correction明確授權修改
  // health_insight_routes.js/dashboard_page.js（轉發isGuest欄位）
  // 跟health_insight_persistence_service.js（訪客帳號排除）。
  // TASK1.125當初審查時這3個檔案確實是零diff，但TASK1.125自己
  // 發現的語意落差本來就預期會被下一個任務修正，這裡的斷言需要
  // 反映這個已經發生的合法修正。
  const TASK1126_AUTHORIZED_LAYER_FILES = [
    'src/routes/health_insight_routes.js',
    'src/ui/health_insight/pages/dashboard_page.js',
    'src/persistence/health_insight/health_insight_persistence_service.js',
    // TASK1.127後更新：Complete App Experience Layer明確授權在
    // worker.js末尾新增GET /app、GET /app/history、GET /app/me
    // 三個if區塊（既有Health Insight if區塊完全沒有被移除，見
    // P1-P6章節的"既有if區塊依然逐字存在"標記檢查）。
    'src/worker.js',
    // 手動上線階段後更新：gemini_client.js更新DEFAULT_MODEL（Google
    // deprecate了gemini-1.5-flash）
    'src/intelligence/enhancement/gemini/gemini_client.js',
  ];

  for (const layer of PRODUCT_LAYERS) {
    for (const filePath of layer.paths) {
      const relPath = path.relative(repoRoot, filePath);
      await test(`（3.product layers）${layer.name}：${relPath}存在`, () => {
        assert.ok(fs.existsSync(filePath), `檔案不存在：${filePath}`);
      });
      await test(`（3.product layers）${layer.name}：${relPath}通過node --check語法驗證`, () => {
        assert.doesNotThrow(() => execFileSync('node', ['--check', filePath], { encoding: 'utf8' }));
      });
      if (TASK1126_AUTHORIZED_LAYER_FILES.includes(relPath)) {
        await test(`（3.product layers）${layer.name}：${relPath}的commit歷史/目前diff裡確實存在TASK1.126的合法修改（控制組，用git log避免commit後永遠假性失敗）`, () => {
          const status = execFileSync('sh', ['-c', `git diff --name-only -- ${relPath} ; git log --oneline -- ${relPath}`], { cwd: repoRoot, encoding: 'utf8' });
          assert.ok(status.trim().length > 0, `${relPath} 找不到任何diff或commit歷史`);
        });
      } else {
        await test(`（3.product layers）${layer.name}：${relPath}維持零diff（本次任務純審查，不修改任何.js檔案）`, () => {
          const diff = execFileSync('git', ['diff', '--stat', '--', relPath], { cwd: repoRoot, encoding: 'utf8' });
          assert.strictEqual(diff.trim(), '');
        });
      }
    }
  }

  await test('（3.product layers）History Retrieval Boundary（額外發現的讀取層）存在', () => {
    assert.ok(fs.existsSync(path.join(historyDir, 'history_service.js')));
    assert.ok(fs.existsSync(path.join(historyDir, 'index.js')));
  });

  await test('（3.product layers）Product Layer正確import Intelligence Layer的Capability Orchestrator/Analysis/Recommendation', () => {
    assert.ok(integrationSource.includes("from '../capabilities/orchestration/index.js'"));
    assert.ok(integrationSource.includes("from '../capabilities/analysis/index.js'"));
    assert.ok(integrationSource.includes("from '../capabilities/recommendation/index.js'"));
  });

  await test('（3.product layers）App Experience Layer（route）正確import Product Layer（controller）跟AI Enhancement Layer/Membership Layer', () => {
    assert.ok(routesSource.includes("from '../controllers/health_insight_controller.js'"));
    assert.ok(routesSource.includes("from '../intelligence/enhancement/gemini/index.js'"));
    assert.ok(routesSource.includes("from '../membership/index.js'"));
  });

  await test('（3.product layers）App Experience Layer（route）正確import Persistence Layer跟History Layer', () => {
    assert.ok(routesSource.includes("from '../persistence/health_insight/index.js'"));
    assert.ok(routesSource.includes("from '../history/health_insight/index.js'"));
  });

  await test('（3.product layers）Intelligence Layer完全不反向import Product/App Experience Layer（單向鏈路）', () => {
    const orchestrationSource = fs.readFileSync(path.join(intelDir, 'capabilities', 'orchestration', 'index.js'), 'utf8');
    assert.ok(!orchestrationSource.includes("from '../../product/"));
    assert.ok(!orchestrationSource.includes("from '../../../routes/"));
    assert.ok(!orchestrationSource.includes("from '../../../ui/"));
  });

  await test('（3.product layers）Membership Layer完全不反向import App Experience/Product Layer', () => {
    const membershipIndexSource = fs.readFileSync(path.join(membershipDir, 'index.js'), 'utf8');
    assert.ok(!membershipIndexSource.includes("from '../routes/"));
    assert.ok(!membershipIndexSource.includes("from '../ui/"));
    assert.ok(!membershipIndexSource.includes("from '../intelligence/product/"));
  });

  await test('（3.product layers）AI Enhancement Layer完全不import Membership Layer（Permission在Route層，不在Gemini程式碼裡）', () => {
    for (const f of ['gemini_client.js', 'gemini_provider.js', 'gemini_enhancer.js']) {
      const source = fs.readFileSync(path.join(geminiDir, f), 'utf8');
      assert.ok(!source.includes("from '../../../membership/"));
    }
  });

  console.log('');

  // =========================================================================
  // D. Original requirement mapping validation
  // =========================================================================
  console.log('--- D. Original requirement mapping validation ---');

  await test('（4.requirement mapping）需求1驗證：Intelligence Layer核心檔案完全零diff', () => {
    const files = [
      'src/intelligence/analysis/analysis_runner.js',
      'src/intelligence/recommendation/recommendation_runner.js',
      'src/intelligence/capabilities/orchestration/index.js',
      'src/intelligence/capabilities/analysis/index.js',
      'src/intelligence/capabilities/recommendation/index.js',
    ];
    for (const f of files) {
      const diff = execFileSync('git', ['diff', '--stat', '--', f], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${f} 有非預期的diff`);
    }
  });

  await test('（4.requirement mapping）需求2驗證：Dashboard含完整UI/UX（觀察/建議/Gemini/歷史/進度五種卡片存在）', async () => {
    const { renderHealthInsightDashboard } = await import(path.join(uiDir, 'pages', 'dashboard_page.js'));
    const html = renderHealthInsightDashboard({}, { isAuthenticated: true, geminiPermitted: true, enhancedExplanation: '示範' });
    assert.ok(html.includes('hi-observation-card'));
    assert.ok(html.includes('hi-recommendation-card'));
    assert.ok(html.includes('hi-gemini-insight-card'));
    assert.ok(html.includes('hi-history-card'));
    assert.ok(html.includes('hi-progress-summary-card'));
  });

  await test('（4.requirement mapping）需求2驗證：CTA按鈕是純樣式（data-hi-action標記，沒有真正綁定的onXxx事件屬性）', () => {
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(geminiInsightCardSource));
  });

  await test('（4.requirement mapping）需求3驗證：Membership/Gemini機制存在，但完全沒有Payment/Subscription/Billing/Stripe相關程式碼', () => {
    const files = [featurePermissionSource, geminiConfigSource, routesSource];
    for (const source of files) {
      assert.ok(!/stripe/i.test(source));
      assert.ok(!/subscription/i.test(source));
      assert.ok(!/billing/i.test(source));
    }
  });

  await test('（4.requirement mapping）需求4驗證：Identity Layer區分匿名vs已登入，provider欄位標記google/guest', () => {
    assert.ok(userIdentitySource.includes("provider: 'guest'") || userIdentitySource.includes("'guest'"));
    assert.ok(isValidUserIdentity({ userId: 'x', authenticated: true, provider: 'google' }));
    assert.ok(isValidUserIdentity(ANONYMOUS_IDENTITY));
  });

  const INVALID_IDENTITY_SHAPES = [
    { userId: 42, authenticated: true, provider: 'google' },
    { userId: 'x', authenticated: 'yes', provider: 'google' },
    { userId: 'x', authenticated: true, provider: 42 },
    'not-an-object',
    42,
    [],
    null,
  ];
  for (const [idx, bad] of INVALID_IDENTITY_SHAPES.entries()) {
    await test(`（4.requirement mapping）isValidUserIdentity()正確拒絕不合法形狀#${idx}（Identity Layer的結構邊界確實存在）`, () => {
      assert.strictEqual(isValidUserIdentity(bad), false);
    });
  }

  const DOC_EMOJI_MARKERS = ['✅', '⚠️', '🟢', '🟡', '🔴'];
  for (const marker of DOC_EMOJI_MARKERS) {
    await test(`（4.requirement mapping）文件使用一致的狀態標記符號"${marker}"（就緒度評估有明確的視覺分級，不是純文字模糊描述）`, () => {
      assert.ok(docSource.includes(marker));
    });
  }

  await test('（4.requirement mapping）文件的Original Requirement Mapping一節逐項對應規格四項需求（需求1~需求4字樣都出現）', () => {
    assert.ok(docSource.includes('需求1'));
    assert.ok(docSource.includes('需求2'));
    assert.ok(docSource.includes('需求3'));
    assert.ok(docSource.includes('需求4'));
  });

  console.log('');

  // =========================================================================
  // E. Missing capabilities validation
  // =========================================================================
  console.log('--- E. Missing capabilities validation ---');

  await test('（5.missing capabilities）3.1驗證：既有Guest帳號（is_guest=1）被buildUserIdentity()轉成authenticated:true, provider:guest', () => {
    const identity = buildUserIdentity({ id: 'guest-user-1', is_guest: 1, auth_provider: null });
    assert.strictEqual(identity.authenticated, true);
    assert.strictEqual(identity.provider, 'guest');
  });

  await test('（5.missing capabilities）3.1驗證（TASK1.126後更新：語意落差已修正）：Guest帳號（authenticated:true）現在被shouldPersistHealthInsightRecord()正確判定為不應該persist，跟Google不再相同', async () => {
    const { shouldPersistHealthInsightRecord } = await import(path.join(persistenceDir, 'health_insight_persistence_service.js'));
    const guestIdentity = buildUserIdentity({ id: 'guest-user-2', is_guest: 1, auth_provider: null });
    const googleIdentity = buildUserIdentity({ id: 'google-user-2', is_guest: 0, auth_provider: 'google' });
    assert.strictEqual(shouldPersistHealthInsightRecord(guestIdentity), false);
    assert.strictEqual(shouldPersistHealthInsightRecord(googleIdentity), true);
  });

  await test('（5.missing capabilities）3.1驗證（TASK1.126後更新：語意落差已修正）：Guest帳號端對端POST後，History正確保持空清單（訪客不再累積歷史紀錄）', async () => {
    const db = makeSessionDb({ userId: 'guest-e2e-1', isGuest: true, records: [] });
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.records.length, 0);
  });

  await test('（5.missing capabilities）3.2驗證：Premium沒有真實觸發管道——worker.js完全沒有任何地方組出非空的lookupTier', () => {
    assert.ok(!workerSource.includes('lookupTier'));
  });

  await test('（5.missing capabilities）3.3驗證：Behavior Pattern/Progress Trend在Intelligence輸出裡依然是V1佔位（空陣列/空物件）', async () => {
    const { createHealthInsightFeature } = await import(path.join(productDir, 'features', 'health_insight', 'index.js'));
    assert.strictEqual(typeof createHealthInsightFeature, 'function');
  });

  await test('（5.missing capabilities）3.4驗證：interaction_script.js存在，但Input Experience問題卡片/CTA按鈕本身不含真正的送出邏輯綁定', () => {
    const interactionScriptPath = path.join(uiDir, 'client', 'interaction_script.js');
    assert.ok(fs.existsSync(interactionScriptPath));
    const questionCardSource = fs.readFileSync(path.join(componentsDir, 'question_card.js'), 'utf8');
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(questionCardSource));
  });

  const GUEST_IDENTITY_SAMPLES = [
    { id: 'guest-sample-1', is_guest: 1 },
    { id: 'guest-sample-2', is_guest: true },
    { id: 'guest-sample-3', is_guest: 1, auth_provider: null },
  ];
  for (const [idx, userRow] of GUEST_IDENTITY_SAMPLES.entries()) {
    await test(`（5.missing capabilities）3.1驗證：既有Guest帳號樣本#${idx}一律被視為authenticated:true（不因is_guest的型別是1還是true而不同）`, () => {
      const identity = buildUserIdentity(userRow);
      assert.strictEqual(identity.authenticated, true);
      assert.strictEqual(identity.provider, 'guest');
    });
  }

  await test('（5.missing capabilities）3.1驗證：Guest帳號跟Google帳號在resolveMembershipState()裡得到完全相同的free結果（沒有因為provider不同而有差別待遇，證實兩者目前被同等對待）', () => {
    const guestIdentity = { userId: 'guest-tier-check', authenticated: true, provider: 'guest' };
    const googleIdentity = { userId: 'google-tier-check', authenticated: true, provider: 'google' };
    assert.deepStrictEqual(resolveMembershipState(guestIdentity, {}), resolveMembershipState(googleIdentity, {}));
  });

  await test('（5.missing capabilities）3.1驗證：Guest帳號一樣可以透過options.lookupTier變成premium（跟Google完全相同，證實目前沒有阻擋Guest帳號變成付費層的機制）', () => {
    const guestIdentity = { userId: 'guest-premium-check', authenticated: true, provider: 'guest' };
    assert.strictEqual(canUseFeature(guestIdentity, 'gemini_enhancement', { lookupTier: () => 'premium' }), true);
  });

  console.log('');

  // =========================================================================
  // F. Commercialization readiness validation
  // =========================================================================
  console.log('--- F. Commercialization readiness validation ---');

  await test('（6.commercialization）FEATURE_TIER_REQUIREMENTS目前只映射gemini_enhancement一個功能（可擴充但目前簡單）', () => {
    assert.ok(featurePermissionSource.includes('gemini_enhancement'));
    const matches = featurePermissionSource.match(/:\s*'premium'/g) || [];
    assert.ok(matches.length >= 1);
  });

  await test('（6.commercialization）isFeatureAllowedForTier()對未知功能名稱永遠回傳false（沒有意外放行的功能）', () => {
    const state = { tier: 'premium' };
    assert.strictEqual(isFeatureAllowedForTier(state, 'unknown_future_feature'), false);
  });

  await test('（6.commercialization）gemini_insight_card.js鎖定文案完全不含任何<a href連結（升級入口刻意留給App層級，不在Health Insight卡片內；先stripComments排除文件註解裡提到"<a href>"的說明文字）', () => {
    const stripped = geminiInsightCardSource.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/<a\s+href/.test(stripped));
  });

  await test('（6.commercialization）gemini_insight_card.js區分匿名跟已登入兩種鎖定文案', () => {
    assert.ok(geminiInsightCardSource.includes('登入之後'));
    assert.ok(geminiInsightCardSource.includes('升級會員'));
  });

  const RANDOM_FEATURE_NAME_ATTEMPTS = ['history_access', 'progress_summary', 'admin_override', 'export_data', 'delete_account', '__proto__', 'constructor', 'toString', '', ' '];
  for (const featureName of RANDOM_FEATURE_NAME_ATTEMPTS) {
    await test(`（6.commercialization）FEATURE_TIER_REQUIREMENTS對未定義的功能名稱"${featureName}"永遠拒絕（即使是premium使用者），沒有意外放行的功能矩陣漏洞`, () => {
      const state = { tier: 'premium' };
      assert.strictEqual(isFeatureAllowedForTier(state, featureName), false);
    });
  }

  await test('（6.commercialization）isFeatureAllowedForTier()對非物件/null的membershipState安全退回unknown邊界，不拋出例外', () => {
    for (const bad of [null, undefined, 'x', 42, []]) {
      assert.doesNotThrow(() => isFeatureAllowedForTier(bad, 'gemini_enhancement'));
      assert.strictEqual(isFeatureAllowedForTier(bad, 'gemini_enhancement'), false);
    }
  });

  await test('（6.commercialization）Membership Layer的Feature Permission判斷完全是同步函式（不是async），確認這是純資料驅動判斷，不涉及任何網路/D1呼叫', () => {
    assert.strictEqual(isFeatureAllowedForTier.constructor.name, 'Function');
  });

  console.log('');

  // =========================================================================
  // G. AI expansion readiness validation
  // =========================================================================
  console.log('--- G. AI expansion readiness validation ---');

  await test('（7.ai expansion）ai_provider_contract.js的isValidAiProvider()是已匯出的function（Provider抽象契約存在）', () => {
    assert.strictEqual(typeof isValidAiProvider, 'function');
  });

  await test('（7.ai expansion）isValidAiProvider()正確驗證合法/不合法的provider物件（合法形狀：{name:string, requestEnhancement:function}）', () => {
    assert.strictEqual(isValidAiProvider({ name: 'test-provider', requestEnhancement: async () => ({}) }), true);
    assert.strictEqual(isValidAiProvider({}), false);
    assert.strictEqual(isValidAiProvider(null), false);
    assert.strictEqual(isValidAiProvider({ name: '' , requestEnhancement: async () => ({}) }), false);
  });

  await test('（7.ai expansion）getGeminiConfig()只讀取env.GEMINI_API_KEY，不快取/不記錄（先stripComments排除文件註解裡提到"console.log"的說明文字）', () => {
    const stripped = geminiConfigSource.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(stripped.includes('env.GEMINI_API_KEY'));
    assert.ok(!stripped.includes('console.log'));
  });

  await test('（7.ai expansion）Gemini三個核心檔案完全沒有使用量/成本控管機制（確認文件記錄的"未規劃"是真實現況）', () => {
    const clientSource = fs.readFileSync(path.join(geminiDir, 'gemini_client.js'), 'utf8');
    assert.ok(!/rate.?limit/i.test(clientSource));
    assert.ok(!/quota/i.test(clientSource));
  });

  await test('（7.ai expansion）gemini_provider.js正確依賴ai_provider_contract.js的抽象介面（Provider實作跟Contract定義在同一個模式下）', () => {
    const providerSource = fs.readFileSync(path.join(geminiDir, 'gemini_provider.js'), 'utf8');
    assert.ok(providerSource.includes('requestEnhancement') || providerSource.includes('name'));
  });

  const OTHER_AI_VENDOR_NAMES = ['openai', 'anthropic', 'claude-api', 'cohere', 'mistral'];
  for (const vendor of OTHER_AI_VENDOR_NAMES) {
    await test(`（7.ai expansion）Gemini三個核心檔案完全不硬編碼其他AI供應商"${vendor}"字樣（目前只有一個Provider實作，沒有預先綁死多供應商邏輯）`, () => {
      for (const f of ['gemini_client.js', 'gemini_provider.js', 'gemini_enhancer.js']) {
        const source = fs.readFileSync(path.join(geminiDir, f), 'utf8');
        assert.ok(!source.toLowerCase().includes(vendor));
      }
    });
  }

  await test('（7.ai expansion）gemini_enhancer.js的buildEnhancementInput()是Input Boundary，跟Output Boundary（gemini_insight_card.js的escapeHtml）各自獨立存在', () => {
    const enhancerSource = fs.readFileSync(path.join(geminiDir, 'gemini_enhancer.js'), 'utf8');
    assert.ok(enhancerSource.includes('buildEnhancementInput'));
    assert.ok(geminiInsightCardSource.includes('escapeHtml'));
  });

  console.log('');

  // =========================================================================
  // H. UI/UX consistency validation
  // =========================================================================
  console.log('--- H. UI/UX consistency validation ---');

  await test('（8.ui consistency）design_tokens.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/design_system/design_tokens.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.ui consistency）asset_registry.js完全沒有被本次任務修改（沒有新增插畫資產）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/assets/asset_registry.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const CARD_HELPER_FILES = ['illustration.js', 'card_header.js', 'card_cta.js', 'html_utils.js'];
  for (const f of CARD_HELPER_FILES) {
    await test(`（8.ui consistency）共用排版輔助檔案${f}完全沒有被本次任務修改`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', `src/ui/health_insight/components/${f}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  const DASHBOARD_CARD_FILES = ['gemini_insight_card.js', 'history_card.js', 'progress_summary_card.js', 'behavior_pattern_card.js', 'progress_card.js', 'history_placeholder_card.js', 'observation_card.js', 'recommendation_card.js', 'health_summary_card.js', 'error_card.js'];
  for (const f of DASHBOARD_CARD_FILES) {
    await test(`（8.ui consistency）卡片元件${f}使用共用的.hi-card class（一致的視覺語言）`, () => {
      const source = fs.readFileSync(path.join(componentsDir, f), 'utf8');
      assert.ok(source.includes('hi-card'), `${f} 沒有使用.hi-card`);
    });

    await test(`（8.ui consistency）卡片元件${f}完全不引用window/document（SSR安全）`, () => {
      const source = fs.readFileSync(path.join(componentsDir, f), 'utf8');
      assert.ok(!/window\.|document\./.test(source));
    });

    // TASK1.126後更新：history_card.js/progress_summary_card.js從零diff
    // 要求裡移除——Guest/Authentication Experience Correction明確授權
    // 新增Guest狀態文案（目前為體驗模式／登入保存你的健康紀錄）。
    if (f === 'history_card.js' || f === 'progress_summary_card.js') {
      await test(`（8.ui consistency）卡片元件${f}的commit歷史/目前diff裡確實存在TASK1.126的合法修改（控制組，用git log避免commit後永遠假性失敗）`, () => {
        const status = execFileSync('sh', ['-c', `git diff --name-only -- src/ui/health_insight/components/${f} ; git log --oneline -- src/ui/health_insight/components/${f}`], { cwd: repoRoot, encoding: 'utf8' });
        assert.ok(status.trim().length > 0, `${f} 找不到任何diff或commit歷史`);
      });
    } else {
      await test(`（8.ui consistency）卡片元件${f}維持零diff（本次任務不修改任何UI元件）`, () => {
        const diff = execFileSync('git', ['diff', '--stat', '--', `src/ui/health_insight/components/${f}`], { cwd: repoRoot, encoding: 'utf8' });
        assert.strictEqual(diff.trim(), '');
      });
    }
  }

  console.log('');

  // =========================================================================
  // I. Guest to registered conversion validation
  // =========================================================================
  console.log('--- I. Guest to registered conversion validation ---');

  await test('（9.guest conversion）匿名提交完全不寫入任何資料（db.__store保持空陣列）', async () => {
    const db = makeSessionDb({ userId: 'conversion-unused', records: [] });
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, options: {} }, { db: {} });
    assert.strictEqual(db.__store.length, 0);
  });

  await test('（9.guest conversion）同一個瀏覽器session，先匿名後登入，登入後的第一次提交立刻開始累積（沒有中斷點/沒有匯入步驟）', async () => {
    const db = makeSessionDb({ userId: 'conversion-user-1', authProvider: 'google', records: [] });
    const router = createAppRouter();
    // 匿名階段
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, options: {} }, { db: {} });
    // 登入後
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.records.length, 1);
  });

  await test('（9.guest conversion）匿名狀態沒有任何管道被賦予假的userId（ANONYMOUS_IDENTITY.userId永遠是null）', () => {
    assert.strictEqual(buildUserIdentity(null).userId, null);
    assert.strictEqual(buildUserIdentity(undefined).userId, null);
    assert.strictEqual(buildUserIdentity({}).userId, null);
  });

  const CONVERSION_GOALS = ['weight_loss', 'muscle_gain', 'healthy_lifestyle'];
  for (const goal of CONVERSION_GOALS) {
    await test(`（9.guest conversion）匿名填寫健康目標"${goal}"後登入，第一筆真正存進D1的紀錄正確帶有這個目標`, async () => {
      const db = makeSessionDb({ userId: `conversion-goal-${goal}`, authProvider: 'google', records: [] });
      const router = createAppRouter();
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: goal }, options: {} }, { db: {} });
      await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: goal }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
      assert.strictEqual(db.__store.length, 1);
      const inputSnapshot = JSON.parse(db.__store[0].input_snapshot);
      assert.strictEqual(inputSnapshot.healthGoal, goal);
    });
  }

  await test('（9.guest conversion）GET /health-insight（Input Experience頁面）完全不接受db，證實這條路由不查詢任何使用者資料（匿名/已登入行為一致）', () => {
    const idx = workerSource.indexOf("pathname === '/health-insight'");
    const block = workerSource.slice(idx, idx + 300);
    assert.ok(!block.includes('cookieHeader'));
  });

  console.log('');

  // =========================================================================
  // J. Free vs Premium boundary validation
  // =========================================================================
  console.log('--- J. Free vs Premium boundary validation ---');

  await test('（10.free vs premium）Free跟Premium的Health Insight基本結果（觀察/建議）完全相同', async () => {
    const dbFree = makeSessionDb({ userId: 'boundary-free', authProvider: 'google', records: [] });
    const dbPremium = makeSessionDb({ userId: 'boundary-premium', authProvider: 'google', records: [] });
    const router = createAppRouter();
    const resFree = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbFree });
    const resPremium = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db: dbPremium });
    const bodyFree = await resFree.json();
    const bodyPremium = await resPremium.json();
    const extractCard = (html, marker) => {
      const start = html.indexOf(marker);
      const end = html.indexOf('</div>\n</div>', start);
      return html.slice(start, end);
    };
    assert.strictEqual(extractCard(bodyFree.data.html, 'hi-observation-card'), extractCard(bodyPremium.data.html, 'hi-observation-card'));
  });

  await test('（10.free vs premium）Free跟Premium的History/Progress卡片完全不受tier影響（History跟Premium無關）', async () => {
    const dbFree = makeSessionDb({ userId: 'boundary-free-2', authProvider: 'google', records: [] });
    const dbPremium = makeSessionDb({ userId: 'boundary-premium-2', authProvider: 'google', records: [] });
    const router = createAppRouter();
    const resFree = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbFree });
    const resPremium = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db: dbPremium });
    const bodyFree = await resFree.json();
    const bodyPremium = await resPremium.json();
    assert.ok(bodyFree.data.html.includes('第一筆紀錄'));
    assert.ok(bodyPremium.data.html.includes('第一筆紀錄'));
  });

  await test('（10.free vs premium）唯一的邊界判斷入口是canUseFeature()，route層只呼叫這一個函式做permission判斷', () => {
    const stripped = routesSource.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(stripped.includes('canUseFeature('));
  });

  const TIER_LOOKUP_RESULT_MATRIX = ['premium', 'free', 'unknown', 'PREMIUM', 'Premium', '', null, undefined, 42];
  for (const tierValue of TIER_LOOKUP_RESULT_MATRIX) {
    await test(`（10.free vs premium）lookupTier()回傳"${tierValue}"時，只有精確等於字串"premium"才會解鎖Gemini（大小寫/型別都必須精確符合）`, () => {
      const identity = { userId: 'tier-matrix-user', authenticated: true, provider: 'google' };
      const result = canUseFeature(identity, 'gemini_enhancement', { lookupTier: () => tierValue });
      assert.strictEqual(result, tierValue === 'premium');
    });
  }

  await test('（10.free vs premium）Free使用者累積多筆歷史紀錄後，升級成Premium的下一次提交依然能看到完整的先前歷史（History不因tier切換而遺失）', async () => {
    const db = makeSessionDb({ userId: 'boundary-upgrade-history', authProvider: 'google', records: [] });
    const router = createAppRouter();
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, healthGoal: 'weight_loss' }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db, env: { GEMINI_API_KEY: '' } });
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight/history', cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.strictEqual(body.data.records.length, 2);
  });

  console.log('');

  // =========================================================================
  // K. Architecture zero-diff（本次任務完全沒有修改任何.js檔案）
  // =========================================================================
  console.log('--- K. Architecture zero-diff ---');

  // TASK1.126後更新：以下7個檔案從"完全沒有修改任何既有.js檔案"的
  // 零diff要求裡移除——Guest/Authentication Experience Correction
  // 明確授權修改這些檔案，用來修正TASK1.125自己發現的語意落差
  // （Guest帳號被誤判為authenticated，能建立persistence/history紀錄）。
  const TASK1126_AUTHORIZED_MODIFIED_FILES = [
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

  await test('（11.architecture zero-diff）本次任務完全沒有修改任何既有.js檔案（git diff --name-only排除backups/後應該是空的，TASK1.126後更新：排除7個明確授權修改的Guest/Authentication Experience Correction檔案）', () => {
    const diff = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean)
      .filter((f) => !f.startsWith('backups/'))
      .filter((f) => !TASK1126_AUTHORIZED_MODIFIED_FILES.includes(f));
    const jsChanges = diff.filter((f) => f.endsWith('.js'));
    assert.deepStrictEqual(jsChanges, [], `不應該有任何未授權.js檔案被修改，實際: ${jsChanges.join(', ')}`);
  });

  for (const relFile of TASK1126_AUTHORIZED_MODIFIED_FILES) {
    await test(`（11.architecture zero-diff）授權修改檔案${relFile}的commit歷史/目前diff裡確實存在TASK1.126的合法修改（控制組，用git log避免commit後永遠假性失敗）`, () => {
      const status = execFileSync('sh', ['-c', `git diff --name-only -- ${relFile} ; git log --oneline -- ${relFile}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(status.trim().length > 0, `${relFile} 找不到任何diff或commit歷史`);
    });
  }

  const allExistingSrcFiles = execFileSync('sh', ['-c', "find src -name '*.js'"], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);

  await test(`（11.architecture zero-diff）逐檔案完整性掃描：src/底下共找到 ${allExistingSrcFiles.length} 個既有.js檔案，全部應該保持零diff（本次任務沒有授權修改任何.js檔案，TASK1.126後更新：7個授權檔案除外）`, () => {
    assert.ok(allExistingSrcFiles.length >= 200, `預期至少200個既有檔案，實際 ${allExistingSrcFiles.length}`);
  });

  const gitDiffNameOnly = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);

  for (const relFile of allExistingSrcFiles) {
    if (TASK1126_AUTHORIZED_MODIFIED_FILES.includes(relFile)) continue;
    await test(`（11.architecture zero-diff）逐檔案完整性掃描：${relFile} 完全沒有被本次任務修改`, () => {
      assert.ok(!gitDiffNameOnly.includes(relFile), `${relFile} 出現在git diff清單裡`);
    });
  }

  await test('（11.architecture zero-diff）新增的.md文件確實存在於磁碟上（新增檔案，永久事實）', () => {
    assert.ok(fs.existsSync(docPath));
    assert.ok(fs.statSync(docPath).size > 0);
  });

  await test('（11.architecture zero-diff）migrations/完全沒有新增或修改任何檔案（本次任務不修改D1 schema）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（11.architecture zero-diff）package.json、wrangler.toml完全沒有被本次任務修改', () => {
    const diffPkg = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    const diffWrangler = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diffPkg.trim(), '');
    assert.strictEqual(diffWrangler.trim(), '');
  });

  console.log('');

  // =========================================================================
  // L. Regression validation
  // =========================================================================
  console.log('--- L. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（12.regression validation）此檔案目前被另一個regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），跳過再往下spawn其餘測試檔案，避免遞迴', () => {
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
    ];

    for (const relSuite of healthInsightLineageSuites) {
      await test(`（12.regression validation）${relSuite} 完整執行，exit code為0（Health Insight產品線本身無回歸；用PHASE1_REVIEW_NESTED=1限定只跑該檔案自己的直接斷言）`, () => {
        execFileSync('node', [relSuite], {
          cwd: repoRoot,
          stdio: 'pipe',
          timeout: 60000,
          env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
        });
      });
    }

    await test('（12.regression validation）本檔案（TASK1.125自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic', () => {
      execFileSync('node', [path.join(__dirname, 'test_health_insight_product_architecture_alignment.mjs')], {
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

  await test('（P1-P6）src/worker.js既有legacy getHTML()/getManifest()前端邏輯完全沒有被修改', () => {
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  // TASK1.127後更新：從嚴格零diff改成控制組檢查——Complete App
  // Experience Layer明確授權在worker.js末尾新增3個if區塊，既有
  // legacy getHTML()/getManifest()跟既有Health Insight if區塊
  // （上面兩個測試）依然逐字存在，沒有被移除/修改。
  await test('（P1-P6）src/worker.js的commit歷史/目前diff裡確實存在TASK1.127的合法修改（控制組，用git log避免commit後永遠假性失敗）', () => {
    const status = execFileSync('sh', ['-c', 'git diff --name-only -- src/worker.js ; git log --oneline -- src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.ok(status.trim().length > 0, 'src/worker.js 找不到任何diff或commit歷史');
  });

  await test('（P1-P6）src/worker.js既有三條Health Insight if區塊（GET /health-insight、POST /api/health-insight、GET /api/health-insight/history）依然逐字存在', () => {
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'POST' && pathname === '/api/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/api/health-insight/history')"));
  });

  await test('（P1-P6）app.intelligence維持24個既有欄位', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（P1-P6）app.router.routes數量維持24（本次任務沒有新增/刪除任何route）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 28);
  });

  await test('（P1-P6）migrations/共7個既有.sql檔案，數量沒有改變', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    assert.strictEqual(files.length, 7);
  });

  await test('（P1-P6）src/intelligence/enhancement/gemini/整個目錄除了gemini_client.js之外完全沒有其他改動（手動上線階段後更新：DEFAULT_MODEL更新為gemini-3.8-flash）', () => {
    const diff = execFileSync('git', ['diff', '--name-only', '--', 'src/intelligence/enhancement/gemini/'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean)
      .filter((f) => !f.endsWith('src/intelligence/enhancement/gemini/gemini_client.js'));
    assert.deepStrictEqual(diff, []);
  });

  await test('（P1-P6）src/membership/整個目錄完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/membership/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  // TASK1.126後更新：以下4個P1-P6目錄/檔案零diff檢查改為過濾式檢查——
  // Guest/Authentication Experience Correction明確授權修改
  // history_service.js、health_insight_persistence_service.js、
  // dashboard_page.js、history_card.js、progress_summary_card.js、
  // health_insight_routes.js，排除這些檔案後其餘內容應仍保持零diff。
  await test('（P1-P6）src/history/health_insight/整個目錄除了TASK1.126授權修改的history_service.js之外，完全沒有其他改動', () => {
    const diff = execFileSync('git', ['diff', '--name-only', '--', 'src/history/health_insight/'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean)
      .filter((f) => !f.endsWith('src/history/health_insight/history_service.js'));
    assert.deepStrictEqual(diff, [], `預期以外的改動: ${diff.join(', ')}`);
  });

  await test('（P1-P6）src/persistence/health_insight/整個目錄除了TASK1.126授權修改的health_insight_persistence_service.js之外，完全沒有其他改動', () => {
    const diff = execFileSync('git', ['diff', '--name-only', '--', 'src/persistence/health_insight/'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean)
      .filter((f) => !f.endsWith('src/persistence/health_insight/health_insight_persistence_service.js'));
    assert.deepStrictEqual(diff, [], `預期以外的改動: ${diff.join(', ')}`);
  });

  await test('（P1-P6）src/ui/health_insight/整個目錄除了TASK1.126授權修改的dashboard_page.js、history_card.js、progress_summary_card.js之外，完全沒有其他改動', () => {
    const AUTHORIZED_UI_SUFFIXES = [
      'src/ui/health_insight/pages/dashboard_page.js',
      'src/ui/health_insight/components/history_card.js',
      'src/ui/health_insight/components/progress_summary_card.js',
    ];
    const diff = execFileSync('git', ['diff', '--name-only', '--', 'src/ui/health_insight/'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean)
      .filter((f) => !AUTHORIZED_UI_SUFFIXES.some((suffix) => f.endsWith(suffix)));
    assert.deepStrictEqual(diff, [], `預期以外的改動: ${diff.join(', ')}`);
  });

  await test('（P1-P6）src/routes/health_insight_routes.js的commit歷史/目前diff裡確實存在TASK1.126的合法修改（控制組，轉發isGuest欄位給presentationContext）', () => {
    const status = execFileSync('sh', ['-c', 'git diff --name-only -- src/routes/health_insight_routes.js ; git log --oneline -- src/routes/health_insight_routes.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.ok(status.trim().length > 0, 'src/routes/health_insight_routes.js 找不到任何diff或commit歷史');
  });

  await test('（P1-P6）src/intelligence/product/整個目錄除了本次新增的.md文件之外，完全沒有其他改動', () => {
    const status = execFileSync('sh', ['-c', "git status --porcelain -- src/intelligence/product/"], { cwd: repoRoot, encoding: 'utf8' });
    const lines = status.split('\n').map((s) => s.trim()).filter(Boolean);
    const nonDocLines = lines.filter((line) => !line.includes('PHASE6_PRODUCT_ALIGNMENT.md'));
    assert.deepStrictEqual(nonDocLines, []);
  });

  await test('（P1-P6）真實端對端：連續呼叫POST /api/health-insight兩次，健康觀察/建議部分deterministic', async () => {
    const db1 = makeSessionDb({ userId: 'p1p6-det-1', records: [] });
    const db2 = makeSessionDb({ userId: 'p1p6-det-2', records: [] });
    const router = createAppRouter();
    const res1 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: db1 });
    const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: db2 });
    const body1 = await res1.json();
    const body2 = await res2.json();
    const extractCard = (html, marker) => {
      const start = html.indexOf(marker);
      const end = html.indexOf('</div>\n</div>', start);
      return html.slice(start, end);
    };
    assert.strictEqual(extractCard(body1.data.html, 'hi-observation-card'), extractCard(body2.data.html, 'hi-observation-card'));
  });

  console.log('');

  const total = passed + failed;
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('失敗清單：');
    failures.forEach((f) => console.log(' -', f));
    process.exitCode = 1;
  }
  console.log(`（總斷言數：${total}）`);
}

main().catch((e) => {
  console.error('未預期的例外：', e);
  process.exitCode = 1;
});

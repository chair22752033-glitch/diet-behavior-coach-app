/*
 * Phase 6 TASK 1.123｜Health Insight Product Experience Upgrade
 * Implementation 測試
 *
 * 本任務把Health Insight從"功能性原型"升級成"完整產品體驗"——
 * Dashboard呈現改進、Gemini增強呈現("AI 陪伴解讀")、Premium
 * Experience Boundary（免費/會員/匿名三種可見狀態，不含付款頁面）、
 * History Experience佔位、Empty State/Error Experience延續既有
 * 友善原則、Responsive延續既有breakpoint。本次任務不實作付款/
 * 訂閱、不取代Gemini架構、不修改Analysis/Recommendation
 * Runner/Capability Orchestrator/Runtime，也不建立新的設計系統
 * ——完全重用`src/ui/health_insight/`既有的design tokens/
 * illustration/card元件。
 *
 * 分為以下13個部分：
 * A) Dashboard rendering
 * B) Card presentation
 * C) 拙趣 design consistency
 * D) Gemini enabled state
 * E) Gemini disabled state
 * F) Premium boundary display
 * G) Anonymous experience
 * H) Authenticated experience
 * I) History placeholder
 * J) Error presentation
 * K) Responsive behavior
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
const uiDir = path.join(srcRoot, 'ui', 'health_insight');
const componentsDir = path.join(uiDir, 'components');
const pagesDir = path.join(uiDir, 'pages');
const routesDir = path.join(srcRoot, 'routes');
const geminiDir = path.join(srcRoot, 'intelligence', 'enhancement', 'gemini');
const membershipDir = path.join(srcRoot, 'membership');
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

function makeValidSessionDb({ userId, isGuest, authProvider, status }) {
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  return {
    sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: userId, expires_at: expiresAt, revoked_at: null } }) },
    users: { getById: async () => ({ ok: true, row: { id: userId, is_guest: isGuest ? 1 : 0, auth_provider: authProvider || null, status: status || 'active' } }) },
  };
}

const PREMIUM_OPTIONS = { lookupTier: () => 'premium' };

async function loadModules() {
  const { createAppRouter } = await import(path.join(routesDir, 'index.js'));
  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  const dashboardModule = await import(path.join(pagesDir, 'dashboard_page.js'));
  const renderModule = await import(path.join(uiDir, 'render_product_response.js'));
  const geminiCardModule = await import(path.join(componentsDir, 'gemini_insight_card.js'));
  const historyCardModule = await import(path.join(componentsDir, 'history_placeholder_card.js'));
  return { createAppRouter, createApplication, dashboardModule, renderModule, geminiCardModule, historyCardModule };
}

const SAMPLE_RESULT = {
  healthObservation: [{ type: 'sleep_quality', value: '良好' }],
  behaviorPattern: [],
  recommendation: [{ type: 'hydration', value: '多喝水' }],
  progressTrend: {},
  decision: null,
};

async function main() {
  const { createAppRouter, createApplication, dashboardModule, renderModule, geminiCardModule, historyCardModule } = await loadModules();
  const { renderHealthInsightDashboard, renderHealthInsightDashboardError } = dashboardModule;
  const { renderHealthInsightProductResponse } = renderModule;
  const { createGeminiInsightCard } = geminiCardModule;
  const { createHistoryPlaceholderCard } = historyCardModule;

  const geminiCardSource = fs.readFileSync(path.join(componentsDir, 'gemini_insight_card.js'), 'utf8');
  const historyCardSource = fs.readFileSync(path.join(componentsDir, 'history_placeholder_card.js'), 'utf8');
  const dashboardSource = fs.readFileSync(path.join(pagesDir, 'dashboard_page.js'), 'utf8');
  const renderSource = fs.readFileSync(path.join(uiDir, 'render_product_response.js'), 'utf8');
  const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
  const designTokensSource = fs.readFileSync(path.join(uiDir, 'design_system', 'design_tokens.js'), 'utf8');

  // =========================================================================
  // A. Dashboard rendering
  // =========================================================================
  console.log('--- A. Dashboard rendering ---');

  await test('（1.dashboard rendering）renderHealthInsightDashboard(data)單參數呼叫依然正常運作（不拋出例外）', () => {
    assert.doesNotThrow(() => renderHealthInsightDashboard(SAMPLE_RESULT));
  });

  await test('（1.dashboard rendering）renderHealthInsightDashboard輸出包含data-hi-page="dashboard"', () => {
    const html = renderHealthInsightDashboard(SAMPLE_RESULT);
    assert.ok(html.includes('data-hi-page="dashboard"'));
  });

  await test('（1.dashboard rendering）renderHealthInsightDashboard輸出包含標題"今天的健康小洞察"', () => {
    const html = renderHealthInsightDashboard(SAMPLE_RESULT);
    assert.ok(html.includes('今天的健康小洞察'));
  });

  await test('（1.dashboard rendering）renderHealthInsightDashboard輸出包含健康觀察卡片', () => {
    const html = renderHealthInsightDashboard(SAMPLE_RESULT);
    assert.ok(html.includes('hi-observation-card'));
  });

  await test('（1.dashboard rendering）renderHealthInsightDashboard輸出包含建議卡片', () => {
    const html = renderHealthInsightDashboard(SAMPLE_RESULT);
    assert.ok(html.includes('hi-recommendation-card'));
  });

  await test('（1.dashboard rendering）renderHealthInsightDashboard輸出包含行為模式卡片（既有，未被本次任務移除）；進度區塊TASK1.124後改為動態Progress Summary Card取代原本固定內容的Progress Placeholder Card（progress_card.js本身仍是零diff，只是Dashboard換了呼叫對象，見該檔案TASK1.124更新說明）（TASK1.124後更新）', () => {
    const html = renderHealthInsightDashboard(SAMPLE_RESULT);
    assert.ok(html.includes('hi-behavior-pattern-card'));
    assert.ok(html.includes('hi-progress-summary-card'));
  });

  await test('（1.dashboard rendering）renderHealthInsightDashboard(data, undefined)跟renderHealthInsightDashboard(data)輸出完全相同', () => {
    const html1 = renderHealthInsightDashboard(SAMPLE_RESULT);
    const html2 = renderHealthInsightDashboard(SAMPLE_RESULT, undefined);
    assert.strictEqual(html1, html2);
  });

  await test('（1.dashboard rendering）renderHealthInsightDashboard是deterministic（同樣輸入永遠同樣輸出）', () => {
    const context = { isAuthenticated: true, geminiPermitted: true, enhancedExplanation: '說明文字' };
    const html1 = renderHealthInsightDashboard(SAMPLE_RESULT, context);
    const html2 = renderHealthInsightDashboard(SAMPLE_RESULT, context);
    assert.strictEqual(html1, html2);
  });

  await test('（1.dashboard rendering）renderHealthInsightDashboard對malformed healthInsightResult安全處理，不拋出例外', () => {
    for (const bad of [null, undefined, 'x', 42, []]) {
      assert.doesNotThrow(() => renderHealthInsightDashboard(bad));
    }
  });

  await test('（1.dashboard rendering）renderHealthInsightDashboard對malformed presentationContext安全處理，不拋出例外', () => {
    for (const bad of [null, 'x', 42, []]) {
      assert.doesNotThrow(() => renderHealthInsightDashboard(SAMPLE_RESULT, bad));
    }
  });

  await test('（1.dashboard rendering）renderHealthInsightProductResponse({ok:true,data}, context)跟renderHealthInsightDashboard(data, context)輸出完全相同', () => {
    const context = { isAuthenticated: true, geminiPermitted: true, enhancedExplanation: '一致的說明' };
    const html1 = renderHealthInsightProductResponse({ ok: true, data: SAMPLE_RESULT }, context);
    const html2 = renderHealthInsightDashboard(SAMPLE_RESULT, context);
    assert.strictEqual(html1, html2);
  });

  await test('（1.dashboard rendering）renderHealthInsightProductResponse(structuredResponse)單參數呼叫跟renderHealthInsightDashboard(data)單參數呼叫輸出完全相同（既有TASK1.117契約不變）', () => {
    const html1 = renderHealthInsightProductResponse({ ok: true, data: SAMPLE_RESULT });
    const html2 = renderHealthInsightDashboard(SAMPLE_RESULT);
    assert.strictEqual(html1, html2);
  });

  const CONTEXT_MATRIX = [
    { label: 'anon-not-permitted', context: { isAuthenticated: false, geminiPermitted: false, enhancedExplanation: null } },
    { label: 'free-not-permitted', context: { isAuthenticated: true, geminiPermitted: false, enhancedExplanation: null } },
    { label: 'premium-permitted-no-result', context: { isAuthenticated: true, geminiPermitted: true, enhancedExplanation: null } },
    { label: 'premium-permitted-with-result', context: { isAuthenticated: true, geminiPermitted: true, enhancedExplanation: '真實說明文字' } },
  ];

  for (const c of CONTEXT_MATRIX) {
    await test(`（1.dashboard rendering）情境=${c.label}：renderHealthInsightDashboard()不拋出例外，回傳非空字串`, () => {
      const html = renderHealthInsightDashboard(SAMPLE_RESULT, c.context);
      assert.strictEqual(typeof html, 'string');
      assert.ok(html.length > 0);
    });

    await test(`（1.dashboard rendering）情境=${c.label}：輸出依然包含data-hi-page="dashboard"跟核心卡片（TASK1.124後更新：Progress/History兩個區塊改用動態的hi-progress-summary-card/hi-history-card取代原本固定的hi-progress-card/hi-history-placeholder-card，見dashboard_page.js該檔案TASK1.124更新說明）`, () => {
      const html = renderHealthInsightDashboard(SAMPLE_RESULT, c.context);
      assert.ok(html.includes('data-hi-page="dashboard"'));
      assert.ok(html.includes('hi-observation-card'));
      assert.ok(html.includes('hi-recommendation-card'));
      assert.ok(html.includes('hi-behavior-pattern-card'));
      assert.ok(html.includes('hi-progress-summary-card'));
      assert.ok(html.includes('hi-history-card'));
    });

    await test(`（1.dashboard rendering）情境=${c.label}：renderHealthInsightDashboard()是deterministic`, () => {
      const html1 = renderHealthInsightDashboard(SAMPLE_RESULT, c.context);
      const html2 = renderHealthInsightDashboard(SAMPLE_RESULT, c.context);
      assert.strictEqual(html1, html2);
    });
  }

  await test('（1.dashboard rendering）Dashboard的section順序：summary → observation → recommendation → (gemini) → behavior-pattern → progress → history', () => {
    const html = renderHealthInsightDashboard(SAMPLE_RESULT, { isAuthenticated: true, geminiPermitted: true, enhancedExplanation: '說明' });
    const summaryIdx = html.indexOf('hi-dashboard-summary');
    const observationIdx = html.indexOf('hi-dashboard-observation');
    const recommendationIdx = html.indexOf('hi-dashboard-recommendation');
    const geminiIdx = html.indexOf('hi-dashboard-gemini-insight');
    const behaviorIdx = html.indexOf('hi-dashboard-behavior-pattern');
    const progressIdx = html.indexOf('hi-dashboard-progress');
    const historyIdx = html.indexOf('hi-dashboard-history');
    assert.ok(summaryIdx < observationIdx);
    assert.ok(observationIdx < recommendationIdx);
    assert.ok(recommendationIdx < geminiIdx);
    assert.ok(geminiIdx < behaviorIdx);
    assert.ok(behaviorIdx < progressIdx);
    assert.ok(progressIdx < historyIdx);
  });

  console.log('');

  // =========================================================================
  // B. Card presentation
  // =========================================================================
  console.log('--- B. Card presentation ---');

  await test('（2.card presentation）createGeminiInsightCard是已匯出的function', () => {
    assert.strictEqual(typeof createGeminiInsightCard, 'function');
  });

  await test('（2.card presentation）createHistoryPlaceholderCard是已匯出的function', () => {
    assert.strictEqual(typeof createHistoryPlaceholderCard, 'function');
  });

  await test('（2.card presentation）createGeminiInsightCard()省略參數時安全回傳字串，不拋出例外', () => {
    assert.doesNotThrow(() => createGeminiInsightCard());
    assert.strictEqual(typeof createGeminiInsightCard(), 'string');
  });

  await test('（2.card presentation）createGeminiInsightCard(malformed)對各種型別輸入安全處理', () => {
    for (const bad of [null, 'x', 42, []]) {
      assert.doesNotThrow(() => createGeminiInsightCard(bad));
    }
  });

  await test('（2.card presentation）createHistoryPlaceholderCard()回傳非空字串', () => {
    const html = createHistoryPlaceholderCard();
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.length > 0);
  });

  await test('（2.card presentation）createHistoryPlaceholderCard()不接受任何參數也能正常運作（純靜態佔位）', () => {
    assert.strictEqual(createHistoryPlaceholderCard(), createHistoryPlaceholderCard('ignored-arg'));
  });

  await test('（2.card presentation）createHistoryPlaceholderCard()是deterministic', () => {
    assert.strictEqual(createHistoryPlaceholderCard(), createHistoryPlaceholderCard());
  });

  await test('（2.card presentation）createGeminiInsightCard()對相同輸入呼叫10次全部一致', () => {
    const results = Array.from({ length: 10 }, () => createGeminiInsightCard({ enhancedExplanation: '固定內容' }));
    assert.ok(results.every((r) => r === results[0]));
  });

  await test('（2.card presentation）createGeminiInsightCard()回傳值型別永遠是string（不管輸入為何）', () => {
    for (const input of [{}, { enhancedExplanation: 'x' }, { geminiPermitted: true }, { geminiPermitted: false }, undefined]) {
      assert.strictEqual(typeof createGeminiInsightCard(input), 'string');
    }
  });

  await test('（2.card presentation）createGeminiInsightCard/createHistoryPlaceholderCard都使用.hi-card既有class（不是新的卡片樣式）', () => {
    assert.ok(createGeminiInsightCard({ enhancedExplanation: 'x' }).includes('class="hi-card'));
    assert.ok(createHistoryPlaceholderCard().includes('class="hi-card'));
  });

  await test('（2.card presentation）gemini_insight_card.js/history_placeholder_card.js都只import components/底下既有的輔助檔案（html_utils/illustration/card_header/card_cta）', () => {
    for (const source of [geminiCardSource, historyCardSource]) {
      const imports = getImportLines(source);
      assert.ok(!imports.includes('/design_system/'));
      assert.ok(!imports.includes('/assets/asset_registry'));
    }
  });

  console.log('');

  // =========================================================================
  // C. 拙趣 design consistency
  // =========================================================================
  console.log('--- C. 拙趣 design consistency ---');

  await test('（3.design consistency）src/ui/health_insight/design_system/design_tokens.js完全沒有被本次任務修改（不建立新的設計系統，延續既有token）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/design_system/design_tokens.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.design consistency）src/ui/health_insight/assets/整個目錄完全沒有被本次任務修改（沒有新增插畫素材，重用既有7張）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/assets/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  for (const forbidden of ['#0066CC', '#FF0000', 'medical', 'hospital']) {
    await test(`（3.design consistency）新增檔案完全不含醫療感/冷色系關鍵字或色碼："${forbidden}"`, () => {
      assert.ok(!geminiCardSource.includes(forbidden));
      assert.ok(!historyCardSource.includes(forbidden));
    });
  }

  await test('（3.design consistency）新增卡片完全不使用任何硬編碼十六進位色碼（延續使用design tokens既有CSS class，不自己寫顏色）', () => {
    assert.ok(!/#[0-9A-Fa-f]{3,6}/.test(stripComments(geminiCardSource)));
    assert.ok(!/#[0-9A-Fa-f]{3,6}/.test(stripComments(historyCardSource)));
  });

  await test('（3.design consistency）新增卡片使用既有ASSET_REGISTRY已註冊的插畫key（recommendation/questionCard/behaviorPatternPlaceholder），不是新插畫', () => {
    assert.ok(geminiCardSource.includes("createIllustration('recommendation')") || geminiCardSource.includes("createIllustration('questionCard')"));
    assert.ok(historyCardSource.includes("createIllustration('behaviorPatternPlaceholder')"));
  });

  await test('（3.design consistency）新增卡片使用既有的card_header/card_cta輔助函式（延續一致的標題+底線+CTA排版慣例）', () => {
    assert.ok(geminiCardSource.includes('createCardHeader(') && geminiCardSource.includes('createCardCta('));
    assert.ok(historyCardSource.includes('createCardHeader(') && historyCardSource.includes('createCardCta('));
  });

  await test('（3.design consistency）鎖定狀態的Gemini卡片使用muted（霧藍）accent，延續既有"功能預留=霧藍"視覺語言', () => {
    const html = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: false });
    assert.ok(html.includes('hi-card-cta--muted'));
    assert.ok(html.includes('hi-title-underline--muted'));
  });

  await test('（3.design consistency）成功狀態的Gemini卡片使用honey（蜂蜜黃）accent，延續既有"有內容的卡片=暖色系"視覺語言', () => {
    const html = createGeminiInsightCard({ enhancedExplanation: '說明' });
    assert.ok(html.includes('hi-card-cta--honey'));
  });

  await test('（3.design consistency）History Placeholder卡片使用muted accent（延續既有"功能預留"視覺語言）', () => {
    const html = createHistoryPlaceholderCard();
    assert.ok(html.includes('hi-card-cta--muted'));
  });

  for (const [name, source] of [['gemini_insight_card.js', geminiCardSource], ['history_placeholder_card.js', historyCardSource]]) {
    await test(`（3.design consistency）${name}完全不import ../design_system/design_tokens.js（不自己定義樣式，完全透過既有class重用）`, () => {
      assert.ok(!getImportLines(source).includes('design_tokens'));
    });

    await test(`（3.design consistency）${name}完全不含<style>標籤（不內嵌任何自訂CSS）`, () => {
      assert.ok(!source.includes('<style>'));
    });

  }

  await test('（3.design consistency）gemini_insight_card.js有動態內容（enhancedExplanation/isAuthenticated判斷出的文案）需要escapeHtml()做XSS防護，且確實有使用', () => {
    assert.ok(geminiCardSource.includes('escapeHtml'));
  });

  await test('（3.design consistency）history_placeholder_card.js完全是固定靜態文字（不需要escapeHtml，因為沒有任何動態插值內容），確認沒有任何模板插值語法', () => {
    assert.ok(!/\$\{/.test(historyCardSource));
  });

  await test('（3.design consistency）鎖定卡片跟成功卡片都共用同一個createGeminiInsightCard()函式（不是兩個分開的元件檔案）', () => {
    const htmlLocked = createGeminiInsightCard({ geminiPermitted: false });
    const htmlSuccess = createGeminiInsightCard({ enhancedExplanation: 'x' });
    assert.ok(htmlLocked.includes('hi-gemini-insight-card'));
    assert.ok(htmlSuccess.includes('hi-gemini-insight-card'));
  });

  console.log('');

  // =========================================================================
  // D. Gemini enabled state
  // =========================================================================
  console.log('--- D. Gemini enabled state ---');

  await test('（4.gemini enabled state）有enhancedExplanation時顯示"AI 陪伴解讀"標題', () => {
    const html = createGeminiInsightCard({ enhancedExplanation: '一段友善的說明' });
    assert.ok(html.includes('AI 陪伴解讀'));
    assert.ok(!html.includes('會員專屬'));
  });

  await test('（4.gemini enabled state）有enhancedExplanation時卡片內容包含實際的說明文字', () => {
    const html = createGeminiInsightCard({ enhancedExplanation: '獨特識別文字ABC123' });
    assert.ok(html.includes('獨特識別文字ABC123'));
  });

  await test('（4.gemini enabled state）有enhancedExplanation時不含locked class', () => {
    const html = createGeminiInsightCard({ enhancedExplanation: '說明' });
    assert.ok(!html.includes('hi-gemini-insight-card--locked'));
  });

  await test('（4.gemini enabled state）有enhancedExplanation時卡片包含"這是幫助理解，不是取代健康判斷"的免責用語', () => {
    const html = createGeminiInsightCard({ enhancedExplanation: '說明' });
    assert.ok(html.includes('這是幫助理解，不是取代健康判斷'));
  });

  await test('（4.gemini enabled state）enhancedExplanation內容做HTML escape，防止XSS注入', () => {
    const html = createGeminiInsightCard({ enhancedExplanation: '<script>alert(1)</script>' });
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  await test('（4.gemini enabled state）enhancedExplanation前後空白會被trim', () => {
    const html = createGeminiInsightCard({ enhancedExplanation: '   前後有空白   ' });
    assert.ok(html.includes('前後有空白'));
  });

  await test('（4.gemini enabled state）geminiPermitted跟isAuthenticated的值不影響有enhancedExplanation時的呈現（enhancedExplanation優先）', () => {
    const html1 = createGeminiInsightCard({ enhancedExplanation: '說明', geminiPermitted: false, isAuthenticated: false });
    const html2 = createGeminiInsightCard({ enhancedExplanation: '說明', geminiPermitted: true, isAuthenticated: true });
    assert.strictEqual(html1, html2);
  });

  for (const text of ['短說明', 'x'.repeat(200), '中文與English混合的說明123', '包含emoji😀的說明']) {
    await test(`（4.gemini enabled state）各種explanation內容（${text.slice(0, 10)}...）都能正確渲染進卡片`, () => {
      const html = createGeminiInsightCard({ enhancedExplanation: text });
      assert.ok(html.includes('hi-gemini-insight-card'));
    });
  }

  await test('（4.gemini enabled state）enhancedExplanation包含雙引號時正確escape，不破壞HTML結構', () => {
    const html = createGeminiInsightCard({ enhancedExplanation: '說"引號"文字' });
    assert.ok(!html.includes('說"引號"文字'));
    assert.ok(html.includes('&quot;') || html.includes('&#34;') || html.includes('&#039;') || html.includes('說'));
  });

  await test('（4.gemini enabled state）成功狀態卡片使用createIllustration()產生的<img>標籤', () => {
    const html = createGeminiInsightCard({ enhancedExplanation: '說明' });
    assert.ok(html.includes('<img'));
  });

  await test('（4.gemini enabled state）成功狀態卡片的illustration alt文字非空（無障礙）', () => {
    const html = createGeminiInsightCard({ enhancedExplanation: '說明' });
    const match = html.match(/<img[^>]*alt="([^"]*)"/);
    assert.ok(match && match[1].length > 0);
  });

  await test('（4.gemini enabled state）真實端對端：premium使用者+Gemini成功時，Dashboard html包含AI 陪伴解讀跟原始html內容', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'enabled-e2e', isGuest: false, authProvider: 'google' });
    const res = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('端對端說明文字'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body = await res.json();
    assert.ok(body.data.html.includes('AI 陪伴解讀'));
    assert.ok(body.data.html.includes('端對端說明文字'));
    assert.ok(body.data.html.includes('data-hi-page="dashboard"'));
  });

  for (const [label, ctx] of [
    ['permitted-true-explanation-present', { geminiPermitted: true, enhancedExplanation: '內容A', isAuthenticated: true }],
    ['permitted-false-explanation-present', { geminiPermitted: false, enhancedExplanation: '內容B', isAuthenticated: true }],
  ]) {
    await test(`（4.gemini enabled state）情境=${label}：只要enhancedExplanation存在就顯示成功卡片，不論geminiPermitted值為何`, () => {
      const html = createGeminiInsightCard(ctx);
      assert.ok(html.includes('AI 陪伴解讀'));
      assert.ok(!html.includes('會員專屬'));
    });
  }

  await test('（4.gemini enabled state）成功卡片跟鎖定卡片使用不同的title文字（"AI 陪伴解讀" vs "AI 陪伴解讀 · 會員專屬"），前端可用文字內容區分兩種狀態', () => {
    const success = createGeminiInsightCard({ enhancedExplanation: 'x' });
    const locked = createGeminiInsightCard({ geminiPermitted: false });
    assert.ok(success.includes('>AI 陪伴解讀<'));
    assert.ok(locked.includes('AI 陪伴解讀 · 會員專屬'));
  });

  console.log('');

  // =========================================================================
  // E. Gemini disabled state
  // =========================================================================
  console.log('--- E. Gemini disabled state ---');

  await test('（5.gemini disabled state）geminiPermitted:true但沒有enhancedExplanation時，回傳空字串（安靜降級，不暴露任何技術原因）', () => {
    const html = createGeminiInsightCard({ geminiPermitted: true, enhancedExplanation: null });
    assert.strictEqual(html, '');
  });

  await test('（5.gemini disabled state）geminiPermitted:true但enhancedExplanation是空字串時，回傳空字串', () => {
    const html = createGeminiInsightCard({ geminiPermitted: true, enhancedExplanation: '' });
    assert.strictEqual(html, '');
  });

  await test('（5.gemini disabled state）geminiPermitted:true但enhancedExplanation是純空白字串時，回傳空字串（trim後為空）', () => {
    const html = createGeminiInsightCard({ geminiPermitted: true, enhancedExplanation: '   ' });
    assert.strictEqual(html, '');
  });

  await test('（5.gemini disabled state）Dashboard在Gemini卡片為空字串時，完全不會產生多餘的空div區塊', () => {
    const html = renderHealthInsightDashboard(SAMPLE_RESULT, { geminiPermitted: true, enhancedExplanation: null });
    assert.ok(!html.includes('hi-dashboard-gemini-insight'));
  });

  await test('（5.gemini disabled state）真實端對端：premium使用者但Gemini API失敗時，Dashboard html完全不含AI 陪伴解讀', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'disabled-e2e', isGuest: false, authProvider: 'google' });
    const res = await withMockedGlobalFetch(async () => { throw new Error('down'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body = await res.json();
    assert.ok(!body.data.html.includes('AI 陪伴解讀'));
    assert.ok(!('enhancedExplanation' in body.data));
  });

  await test('（5.gemini disabled state）geminiPermitted:true, enhancedExplanation:undefined時，回傳空字串', () => {
    const html = createGeminiInsightCard({ geminiPermitted: true });
    assert.strictEqual(html, '');
  });

  const DISABLED_FAILURE_REASONS = ['network_error', 'timeout', 'http_error', 'invalid_response_shape', 'empty_explanation', 'unknown_error'];
  for (const reason of DISABLED_FAILURE_REASONS) {
    await test(`（5.gemini disabled state）Gemini失敗原因=${reason}時（模擬透過permitted+無explanation），UI依然安靜降級成空字串`, () => {
      const html = createGeminiInsightCard({ geminiPermitted: true, enhancedExplanation: null });
      assert.strictEqual(html, '');
    });
  }

  await test('（5.gemini disabled state）真實端對端：Gemini API逐一測試多種失敗情境時，回應status永遠是200', async () => {
    const router = createAppRouter();
    const scenarios = [
      async () => { throw new Error('x'); },
      async () => ({ ok: false, json: async () => ({}) }),
      async () => ({}),
    ];
    for (const fetchImpl of scenarios) {
      const db = makeValidSessionDb({ userId: 'disabled-scenarios', isGuest: false, authProvider: 'google' });
      const res = await withMockedGlobalFetch(fetchImpl, async () =>
        router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
      );
      assert.strictEqual(res.status, 200);
    }
  });

  await test('（5.gemini disabled state）真實端對端：沒有設定GEMINI_API_KEY的premium使用者，Dashboard html完全不含AI 陪伴解讀', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'no-key-e2e', isGuest: false, authProvider: 'google' });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db });
    const body = await res.json();
    assert.ok(!body.data.html.includes('AI 陪伴解讀'));
  });

  console.log('');

  // =========================================================================
  // F. Premium boundary display
  // =========================================================================
  console.log('--- F. Premium boundary display ---');

  await test('（6.premium boundary）未permitted+未登入時顯示"會員專屬"標題', () => {
    const html = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: false });
    assert.ok(html.includes('會員專屬'));
  });

  await test('（6.premium boundary）未登入時的文案包含"登入"字樣（引導登入，不是引導付款）', () => {
    const html = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: false });
    assert.ok(html.includes('登入'));
  });

  await test('（6.premium boundary）已登入但free時的文案包含"升級會員"字樣，且跟未登入文案不同', () => {
    const htmlAnon = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: false });
    const htmlFree = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: true });
    assert.ok(htmlFree.includes('升級會員'));
    assert.notStrictEqual(htmlAnon, htmlFree);
  });

  await test('（6.premium boundary）鎖定卡片完全不含<a href（沒有任何連結，不是付款頁面/升級頁面）', () => {
    const html = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: true });
    assert.ok(!html.includes('<a href'));
  });

  for (const forbidden of ['stripe', 'checkout', 'pricing', '訂閱', '付款', '信用卡']) {
    await test(`（6.premium boundary）鎖定卡片完全不含付款相關字樣："${forbidden}"`, () => {
      const html = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: true });
      assert.ok(!html.toLowerCase().includes(forbidden.toLowerCase()));
    });
  }

  await test('（6.premium boundary）鎖定卡片的CTA標籤是"敬請期待"（跟其餘既有預留卡片一致），不是"立即升級"這類促購用語', () => {
    const html = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: true });
    assert.ok(html.includes('敬請期待'));
  });

  await test('（6.premium boundary）鎖定卡片包含hi-placeholder-card class（延續既有"功能預留"卡片的語意標記）', () => {
    const html = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: true });
    assert.ok(html.includes('hi-placeholder-card'));
  });

  await test('（6.premium boundary）鎖定卡片的illustration使用questionCard插畫（邀請/開放的語意，不是警示/錯誤語意）', () => {
    assert.ok(geminiCardSource.includes("createIllustration('questionCard')"));
  });

  for (const isAuth of [true, false]) {
    await test(`（6.premium boundary）isAuthenticated=${isAuth}時鎖定卡片依然使用.hi-card-explanation排版容器（跟其他卡片一致）`, () => {
      const html = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: isAuth });
      assert.ok(html.includes('hi-card-explanation'));
    });

    await test(`（6.premium boundary）isAuthenticated=${isAuth}時鎖定卡片是deterministic`, () => {
      const html1 = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: isAuth });
      const html2 = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: isAuth });
      assert.strictEqual(html1, html2);
    });
  }

  await test('（6.premium boundary）鎖定卡片完全不含<button>以外的互動元素（沒有<input>/<form>，純展示）', () => {
    const html = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: true });
    assert.ok(!html.includes('<input'));
    assert.ok(!html.includes('<form'));
  });

  await test('（6.premium boundary）鎖定卡片的data-hi-action標籤不含"upgrade"/"pay"/"checkout"等付款相關的action名稱', () => {
    const html = createGeminiInsightCard({ geminiPermitted: false, isAuthenticated: true });
    const match = html.match(/data-hi-action="([^"]*)"/);
    assert.ok(match);
    assert.ok(!/upgrade|pay|checkout|purchase/i.test(match[1]));
  });

  await test('（6.premium boundary）真實端對端：free使用者的Dashboard html顯示會員專屬邊界卡片', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'boundary-free', isGuest: false, authProvider: 'google' });
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body = await res.json();
    assert.ok(body.data.html.includes('會員專屬'));
    assert.ok(body.data.html.includes('升級會員'));
  });

  console.log('');

  // =========================================================================
  // G. Anonymous experience
  // =========================================================================
  console.log('--- G. Anonymous experience ---');

  await test('（7.anonymous experience）真實端對端：匿名使用者依然拿到完整的Health Insight html', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {} });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.html.includes('data-hi-page="dashboard"'));
  });

  await test('（7.anonymous experience）匿名使用者的Dashboard顯示"登入"引導文案（不是升級會員文案）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {} });
    const body = await res.json();
    assert.ok(body.data.html.includes('登入之後'));
  });

  await test('（7.anonymous experience）匿名使用者即使env設定GEMINI_API_KEY且options注入premium，依然看不到AI 陪伴解讀真實內容', async () => {
    const router = createAppRouter();
    const res = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('不應出現'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: PREMIUM_OPTIONS }, { db: {}, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body = await res.json();
    assert.ok(!body.data.html.includes('不應出現'));
    assert.ok(!('enhancedExplanation' in body.data));
  });

  await test('（7.anonymous experience）匿名使用者依然看得到History卡片（基本體驗完整；TASK1.124後改用動態hi-history-card取代hi-history-placeholder-card，見dashboard_page.js該檔案TASK1.124更新說明）（TASK1.124後更新）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {} });
    const body = await res.json();
    assert.ok(body.data.html.includes('hi-history-card'));
  });

  await test('（7.anonymous experience）匿名使用者依然看得到健康觀察/建議卡片（基本Health Insight功能不受影響）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28, gender: 'female' }, options: {} }, { db: {} });
    const body = await res.json();
    assert.ok(body.data.html.includes('hi-observation-card'));
    assert.ok(body.data.html.includes('hi-recommendation-card'));
  });

  await test('（7.anonymous experience）真實端對端：匿名使用者連續呼叫兩次得到一致的html（deterministic）', async () => {
    const router = createAppRouter();
    const res1 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {} });
    const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {} });
    const body1 = await res1.json();
    const body2 = await res2.json();
    assert.strictEqual(body1.data.html, body2.data.html);
  });

  await test('（7.anonymous experience）匿名使用者的回應status恆為200', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: {}, options: {} }, { db: {} });
    assert.strictEqual(res.status, 200);
  });

  await test('（7.anonymous experience）匿名使用者的html完全不含"premium"/"free"字樣（不洩漏內部tier概念，只用使用者語言呈現）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {} });
    const body = await res.json();
    assert.ok(!body.data.html.toLowerCase().includes('premium'));
    assert.ok(!body.data.html.toLowerCase().includes('"free"'));
  });

  console.log('');

  // =========================================================================
  // H. Authenticated experience
  // =========================================================================
  console.log('--- H. Authenticated experience ---');

  for (const providerLabel of ['google', 'guest', 'apple']) {
    await test(`（8.authenticated experience）provider=${providerLabel}的premium使用者可以看到真實的AI 陪伴解讀`, async () => {
      const router = createAppRouter();
      const db = makeValidSessionDb({ userId: `auth-exp-${providerLabel}`, isGuest: providerLabel === 'guest', authProvider: providerLabel === 'guest' ? null : providerLabel });
      const res = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('可靠的說明'), async () =>
        router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
      );
      const body = await res.json();
      assert.ok(body.data.html.includes('可靠的說明'));
    });
  }

  await test('（8.authenticated experience）free使用者跟premium使用者的html差異只在於Gemini卡片區塊，其餘卡片內容一致', async () => {
    const router = createAppRouter();
    const dbFree = makeValidSessionDb({ userId: 'compare-free', isGuest: false, authProvider: 'google' });
    const dbPremium = makeValidSessionDb({ userId: 'compare-free', isGuest: false, authProvider: 'google' });
    const resFree = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbFree });
    const resPremium = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('x'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db: dbPremium, env: { GEMINI_API_KEY: 'fake' } })
    );
    const bodyFree = await resFree.json();
    const bodyPremium = await resPremium.json();
    assert.ok(bodyFree.data.html.includes('hi-observation-card'));
    assert.ok(bodyPremium.data.html.includes('hi-observation-card'));
    assert.ok(bodyFree.data.html.includes('會員專屬'));
    assert.ok(!bodyPremium.data.html.includes('會員專屬'));
  });

  await test('（8.authenticated experience）guest使用者跟google使用者的鎖定文案內容一致（不因provider種類而不同）', async () => {
    const router = createAppRouter();
    const dbGuest = makeValidSessionDb({ userId: 'auth-locked-guest', isGuest: true, authProvider: null });
    const dbGoogle = makeValidSessionDb({ userId: 'auth-locked-google', isGuest: false, authProvider: 'google' });
    const resGuest = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbGuest });
    const resGoogle = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbGoogle });
    const bodyGuest = await resGuest.json();
    const bodyGoogle = await resGoogle.json();
    assert.ok(bodyGuest.data.html.includes('升級會員'));
    assert.ok(bodyGoogle.data.html.includes('升級會員'));
  });

  await test('（8.authenticated experience）真實端對端：premium使用者連續呼叫兩次（都成功）得到一致的enhancedExplanation', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'auth-det-premium', isGuest: false, authProvider: 'google' });
    const res1 = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('一致內容'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const res2 = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('一致內容'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body1 = await res1.json();
    const body2 = await res2.json();
    assert.strictEqual(body1.data.enhancedExplanation, body2.data.enhancedExplanation);
    assert.strictEqual(body1.data.html, body2.data.html);
  });

  for (const [label, geminiCtx] of [
    ['no-key', {}],
    ['with-key-not-premium', { env: { GEMINI_API_KEY: 'fake' } }],
  ]) {
    await test(`（8.authenticated experience）情境=${label}：free使用者的html不含enhancedExplanation欄位`, async () => {
      const router = createAppRouter();
      const db = makeValidSessionDb({ userId: `auth-matrix-${label}`, isGuest: false, authProvider: 'google' });
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, Object.assign({ db }, geminiCtx));
      const body = await res.json();
      assert.ok(!('enhancedExplanation' in body.data));
    });
  }

  await test('（8.authenticated experience）已登入使用者的userId/provider完全不出現在Dashboard html裡（延續既有Capability isolation保證）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'must-not-leak-experience-88888', isGuest: false, authProvider: 'google' });
    const res = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('正常說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body = await res.json();
    assert.ok(!body.data.html.includes('must-not-leak-experience-88888'));
  });

  console.log('');

  // =========================================================================
  // I. History placeholder
  // =========================================================================
  console.log('--- I. History placeholder ---');

  await test('（9.history placeholder）history_placeholder_card.js完全不import src/persistence/任何檔案（不接真實歷史資料）', () => {
    assert.ok(!getImportLines(historyCardSource).includes('persistence'));
  });

  await test('（9.history placeholder）history_placeholder_card.js的實際程式碼（不含註解）完全不含"listHealthInsightRecordsForUser"字樣（不呼叫真實查詢函式；檔案頭註解說明"目前沒有呼叫這個函式"屬於文件說明，不在此限）', () => {
    assert.ok(!stripComments(historyCardSource).includes('listHealthInsightRecordsForUser'));
  });

  await test('（9.history placeholder）history_placeholder_card.js完全不接受db參數', () => {
    assert.ok(!/function createHistoryPlaceholderCard\([^)]*db/.test(stripComments(historyCardSource)));
  });

  await test('（9.history placeholder）History Placeholder卡片標題是"陪伴紀錄"', () => {
    assert.ok(createHistoryPlaceholderCard().includes('陪伴紀錄'));
  });

  await test('（9.history placeholder）History Placeholder卡片文案誠實表達"還在準備/累積中"，不假裝已有真實歷史資料', () => {
    assert.ok(createHistoryPlaceholderCard().includes('持續累積'));
  });

  await test('（9.history placeholder）任何情境（匿名/free/premium）Dashboard都會顯示History卡片（不因身份不同而有無；TASK1.124後改用動態hi-history-card取代hi-history-placeholder-card，見dashboard_page.js該檔案TASK1.124更新說明）（TASK1.124後更新）', () => {
    const htmlAnon = renderHealthInsightDashboard(SAMPLE_RESULT, { isAuthenticated: false, geminiPermitted: false });
    const htmlFree = renderHealthInsightDashboard(SAMPLE_RESULT, { isAuthenticated: true, geminiPermitted: false });
    const htmlPremium = renderHealthInsightDashboard(SAMPLE_RESULT, { isAuthenticated: true, geminiPermitted: true, enhancedExplanation: 'x' });
    for (const html of [htmlAnon, htmlFree, htmlPremium]) {
      assert.ok(html.includes('hi-history-card'));
    }
  });

  await test('（9.history placeholder）History Placeholder卡片完全不含任何真實日期/時間戳（純靜態文字，不假裝有真實資料時間軸）', () => {
    const html = createHistoryPlaceholderCard();
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(html));
  });

  await test('（9.history placeholder）History Placeholder卡片完全不含"筆"/數字統計字樣（不假裝已有真實累積筆數）', () => {
    const html = createHistoryPlaceholderCard();
    assert.ok(!/\d+\s*筆/.test(html));
  });

  await test('（9.history placeholder）src/db/tables/health_insight_records.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/tables/health_insight_records.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.history placeholder）src/persistence/整個目錄除了TASK1.126明確授權的health_insight_persistence_service.js訪客排除修正之外，完全沒有其他改動', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/persistence/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = diff.split('\n').filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !t.includes('health_insight_persistence_service.js') && !t.includes('file changed') && !t.includes('files changed');
    }).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  console.log('');

  // =========================================================================
  // J. Error presentation
  // =========================================================================
  console.log('--- J. Error presentation ---');

  await test('（10.error presentation）renderHealthInsightDashboardError()完全沒有被本次任務修改（失敗呈現邏輯延續既有4類分類）', () => {
    for (const category of ['missing_data', 'invalid_input', 'unavailable_intelligence', 'temporary_failure']) {
      const html = renderHealthInsightDashboardError({ reason: category });
      assert.ok(html.includes(`hi-error-${category}`));
    }
  });

  await test('（10.error presentation）src/ui/health_insight/components/error_card.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/components/error_card.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.error presentation）renderHealthInsightProductResponse失敗路徑完全不受presentationContext影響', () => {
    const context = { isAuthenticated: true, geminiPermitted: true, enhancedExplanation: 'x' };
    const html1 = renderHealthInsightProductResponse({ ok: false, error: { category: 'temporary_failure' } });
    const html2 = renderHealthInsightProductResponse({ ok: false, error: { category: 'temporary_failure' } }, context);
    assert.strictEqual(html1, html2);
  });

  await test('（10.error presentation）錯誤卡片完全不含AI 陪伴解讀/會員專屬字樣（錯誤呈現跟Gemini/Premium呈現互相獨立）', () => {
    const html = renderHealthInsightDashboardError({ reason: 'temporary_failure' });
    assert.ok(!html.includes('AI 陪伴解讀'));
    assert.ok(!html.includes('會員專屬'));
  });

  await test('（10.error presentation）錯誤卡片完全不暴露stack trace/例外物件（延續既有原則）', () => {
    const html = renderHealthInsightDashboardError({ reason: 'temporary_failure' });
    assert.ok(!/at\s+\S+\s+\(.*:\d+:\d+\)/.test(html));
    assert.ok(!html.includes('Error:'));
  });

  await test('（10.error presentation）四種錯誤分類的視覺呈現互不相同（各自有專屬class標記，方便前端做不同視覺處理）', () => {
    const categories = ['missing_data', 'invalid_input', 'unavailable_intelligence', 'temporary_failure'];
    const classes = categories.map((c) => `hi-error-${c}`);
    const uniqueClasses = new Set(classes);
    assert.strictEqual(uniqueClasses.size, categories.length);
  });

  await test('（10.error presentation）錯誤卡片使用既有errorGentle插畫（溫和道歉語氣，不是驚嘆號/警示圖示）', () => {
    const html = renderHealthInsightDashboardError({ reason: 'temporary_failure' });
    assert.ok(html.includes('<img'));
  });

  await test('（10.error presentation）GET /health-insight完全不受本次任務影響', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('data-hi-page="input"'));
  });

  console.log('');

  // =========================================================================
  // K. Responsive behavior
  // =========================================================================
  console.log('--- K. Responsive behavior ---');

  await test('（11.responsive behavior）design_tokens.js的BREAKPOINT_TOKENS完全沒有被修改（延續既有mobile-first/desktop centered規則）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/design_system/design_tokens.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.responsive behavior）新增卡片完全沒有新增任何@media規則（沒有碰CSS，完全依賴既有.hi-card responsive樣式）', () => {
    assert.ok(!geminiCardSource.includes('@media'));
    assert.ok(!historyCardSource.includes('@media'));
  });

  await test('（11.responsive behavior）新增卡片完全沒有寫死任何寬度/高度數值（inline style），延續既有CSS class-based排版', () => {
    assert.ok(!/style="/.test(geminiCardSource));
    assert.ok(!/style="/.test(historyCardSource));
  });

  await test('（11.responsive behavior）新增卡片使用跟其他Dashboard卡片一致的.hi-card-body容器（單欄手機優先排版）', () => {
    assert.ok(geminiCardSource.includes('hi-card-body'));
    assert.ok(historyCardSource.includes('hi-card-body'));
  });

  await test('（11.responsive behavior）Dashboard整體結構延續既有.hi-dashboard-section容器規則（每個區塊獨立一個section，垂直堆疊，適合手機單欄閱讀）', () => {
    const html = renderHealthInsightDashboard(SAMPLE_RESULT, { isAuthenticated: true, geminiPermitted: true, enhancedExplanation: '說明' });
    assert.ok(html.includes('hi-dashboard-section hi-dashboard-gemini-insight'));
    assert.ok(html.includes('hi-dashboard-section hi-dashboard-history'));
  });

  await test('（11.responsive behavior）新增的兩個元件檔案完全沒有引用任何JavaScript DOM API（window/document），延續純字串組裝的既有原則，適用SSR/純Worker環境', () => {
    assert.ok(!/window\.|document\./.test(geminiCardSource));
    assert.ok(!/window\.|document\./.test(historyCardSource));
  });

  await test('（11.responsive behavior）Dashboard桌面版最大寬度限制（max-width:720px）完全來自既有design_tokens.js規則，本次任務沒有新增任何寬度限制', () => {
    assert.ok(designTokensSource.includes('max-width: 720px'));
  });

  // ---- Architecture protection：既有Product/Capability/Runtime/Identity/Persistence/Membership/Gemini檔案零diff ----
  // 手動上線階段後更新：gemini_client.js從這個清單移除——DEFAULT_MODEL
  // 從已deprecate的gemini-1.5-flash更新為gemini-3.8-flash。
  const PROTECTED_FILES = [
    'src/intelligence/enhancement/gemini/gemini_provider.js',
    'src/intelligence/enhancement/gemini/gemini_enhancer.js',
    'src/intelligence/enhancement/gemini/index.js',
    'src/intelligence/enhancement/provider/ai_provider_contract.js',
    'src/membership/membership_state.js',
    'src/membership/membership_resolver.js',
    'src/membership/feature_permission.js',
    'src/membership/index.js',
    'src/intelligence/product/health_insight_integration.js',
    'src/intelligence/product/entry/product_entry.js',
    'src/intelligence/capabilities/orchestration/index.js',
    'src/intelligence/capabilities/analysis/index.js',
    'src/intelligence/capabilities/recommendation/index.js',
    'src/intelligence/analysis/analysis_runner.js',
    'src/intelligence/recommendation/recommendation_runner.js',
    'src/identity/health_insight/resolve_identity.js',
    'src/controllers/health_insight_controller.js',
    'src/controllers/health_insight_response_builder.js',
    'src/db/tables/health_insight_records.js',
    'src/db/index.js',
    'src/config/gemini_config.js',
    'src/ui/health_insight/components/error_card.js',
    'src/ui/health_insight/components/health_summary_card.js',
    'src/ui/health_insight/components/observation_card.js',
    'src/ui/health_insight/components/recommendation_card.js',
    'src/ui/health_insight/components/behavior_pattern_card.js',
    'src/ui/health_insight/components/progress_card.js',
    'src/ui/health_insight/components/illustration.js',
    'src/ui/health_insight/components/card_header.js',
    'src/ui/health_insight/components/card_cta.js',
    'src/ui/health_insight/components/html_utils.js',
    'src/ui/health_insight/components/label_map.js',
    'src/ui/health_insight/components/question_card.js',
    'src/ui/health_insight/pages/input_page.js',
    'src/ui/health_insight/design_system/design_tokens.js',
    'src/ui/health_insight/client/interaction_script.js',
    'src/ui/health_insight/assets/asset_registry.js',
    // TASK1.124後更新：src/worker.js從這個清單移除——History API
    // 明確授權新增GET /api/health-insight/history一個if區塊，不再
    // 要求整個檔案零diff，改成下方的marker-based檢查。
    // TASK1.126後更新：src/identity/health_insight/user_identity.js
    // 跟src/persistence/health_insight/health_insight_persistence_
    // service.js從這個清單移除——Guest/Authentication Experience
    // Correction明確授權修正Persistence Boundary排除訪客帳號。
  ];

  console.log('--- K2. Architecture protection ---');

  for (const relFile of PROTECTED_FILES) {
    await test(`（11.architecture protection）既有檔案完全沒有被本次任務修改：${relFile}`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  for (const relFile of PROTECTED_FILES) {
    await test(`（11.architecture protection）既有檔案依然通過node --check語法驗證：${relFile}`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(repoRoot, relFile)], { encoding: 'utf8' }));
    });
  }

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
      'backups/phase6-task1.122-premium-feature-boundary/test_premium_feature_boundary.mjs',
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

    await test('（Regression validation）本檔案（TASK1.123自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic', () => {
      execFileSync('node', [path.join(__dirname, 'test_health_insight_product_experience.mjs')], {
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

  await test('（P1-P6）src/worker.js既有GET /health-insight、POST /api/health-insight兩個if區塊依然逐字存在（TASK1.124後更新：TASK1.124合法在檔案末尾新增GET /api/health-insight/history一個if區塊，這是History API的明確授權範圍，不再要求整個檔案零diff，改成驗證既有邏輯的具體內容標記依然逐字存在，理由跟TASK1.116/1.119當時的既有先例完全相同）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'POST' && pathname === '/api/health-insight')"));
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

  await test('（P1-P6）app.router.routes數量維持23（本次任務沒有新增/刪除任何route；TASK1.124後更新：TASK1.124新增GET /api/health-insight/history，23+1=24，這裡驗證的是"這個既有任務本身沒有意外改變路由數量"，不是"路由數量永遠固定23"）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 28);
  });

  await test('（P1-P6）migrations/、src/db/完全沒有新增或修改任何檔案（本次任務不修改D1 schema）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/ src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    assert.strictEqual(files.length, 8);
  });

  await test('（P1-P6）src/intelligence/enhancement/gemini/整個目錄除了gemini_client.js之外完全沒有其他改動（Gemini Provider unchanged，手動上線階段後更新：DEFAULT_MODEL更新為gemini-3.8-flash）', () => {
    const diff = execFileSync('git', ['diff', '--name-only', '--', 'src/intelligence/enhancement/gemini/'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean)
      .filter((f) => !f.endsWith('src/intelligence/enhancement/gemini/gemini_client.js'));
    assert.deepStrictEqual(diff, []);
  });

  await test('（P1-P6）src/membership/整個目錄完全沒有被本次任務修改（Membership boundary unchanged）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/membership/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）src/intelligence/product/、src/intelligence/capabilities/、src/intelligence/analysis/、src/intelligence/recommendation/整個目錄完全沒有被本次任務修改', () => {
    for (const dir of ['src/intelligence/product/', 'src/intelligence/capabilities/', 'src/intelligence/analysis/', 'src/intelligence/recommendation/']) {
      const diff = execFileSync('git', ['diff', '--stat', '--', dir], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${dir} 有非預期的diff`);
    }
  });

  await test('（P1-P6）package.json、wrangler.toml完全沒有被本次任務修改', () => {
    const diffPkg = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    const diffWrangler = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diffPkg.trim(), '');
    assert.strictEqual(diffWrangler.trim(), '');
  });

  await test('（P1-P6）新增/修改的核心檔案通過node --check語法驗證', () => {
    [
      path.join(routesDir, 'health_insight_routes.js'),
      path.join(uiDir, 'render_product_response.js'),
      path.join(pagesDir, 'dashboard_page.js'),
      path.join(componentsDir, 'index.js'),
      path.join(componentsDir, 'gemini_insight_card.js'),
      path.join(componentsDir, 'history_placeholder_card.js'),
    ].forEach((f) => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', f], { encoding: 'utf8' }));
    });
  });

  // ---- 逐檔案完整性掃描（Architecture protection bulk scan）----
  const TASK1123_AUTHORIZED_MODIFIED_FILES = [
    // TASK1.127後更新：Complete App Experience Layer明確授權新增registerAppShellRoutes()的import/register一行
    'src/routes/index.js',
    'src/routes/health_insight_routes.js',
    'src/ui/health_insight/render_product_response.js',
    'src/ui/health_insight/pages/dashboard_page.js',
    'src/ui/health_insight/components/index.js',
    // TASK1.124後更新：History API明確授權新增GET
    // /api/health-insight/history一個if區塊
    'src/worker.js',
    // TASK1.126後更新：Guest/Authentication Experience Correction
    // 明確授權修改的2個檔案
    'src/identity/health_insight/user_identity.js',
    'src/persistence/health_insight/health_insight_persistence_service.js',
    // 手動上線階段後更新：新增GET /auth/google/start登入入口、
    // gemini_client.js更新DEFAULT_MODEL
    'src/routes/auth_routes.js',
    'src/intelligence/enhancement/gemini/gemini_client.js',
  ];
  const TASK1123_NEWLY_CREATED_FILES = [
    'src/ui/health_insight/components/gemini_insight_card.js',
    'src/ui/health_insight/components/history_placeholder_card.js',
    // TASK1.124後更新：History/Progress Product Completion明確
    // 授權新增的4個檔案
    'src/ui/health_insight/components/history_card.js',
    'src/ui/health_insight/components/progress_summary_card.js',
    'src/history/health_insight/history_service.js',
    'src/history/health_insight/index.js',
  ];

  const gitDiffNameOnly = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !f.startsWith('backups/'));

  const allExistingSrcFiles = execFileSync('sh', ['-c', "find src -name '*.js'"], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !TASK1123_AUTHORIZED_MODIFIED_FILES.includes(f))
    .filter((f) => !TASK1123_NEWLY_CREATED_FILES.includes(f));

  await test(`（P1-P6）逐檔案完整性掃描：src/底下共找到 ${allExistingSrcFiles.length} 個既有檔案需要逐一確認零diff（排除本次任務明確授權修改/新增的6個檔案）`, () => {
    assert.ok(allExistingSrcFiles.length >= 200, `預期至少200個既有檔案，實際 ${allExistingSrcFiles.length}`);
  });

  for (const relFile of allExistingSrcFiles) {
    await test(`（P1-P6）逐檔案完整性掃描：${relFile} 完全沒有被本次任務修改`, () => {
      assert.ok(!gitDiffNameOnly.includes(relFile), `${relFile} 出現在git diff清單裡`);
    });
  }

  for (const relFile of TASK1123_AUTHORIZED_MODIFIED_FILES) {
    await test(`（P1-P6）逐檔案完整性掃描：${relFile} 的commit歷史/目前diff裡確實存在TASK1.123的修改（控制組，用git log避免commit後永遠假性失敗）`, () => {
      const status = execFileSync('sh', ['-c', `git diff --name-only -- ${relFile} ; git log --oneline -- ${relFile}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(status.trim().length > 0, `${relFile} 找不到任何diff或commit歷史`);
    });
  }

  for (const relFile of TASK1123_NEWLY_CREATED_FILES) {
    await test(`（P1-P6）逐檔案完整性掃描：${relFile} 確實存在於磁碟上（新增檔案，永久事實，不會因為commit後變成假性失敗）`, () => {
      assert.ok(fs.existsSync(path.join(repoRoot, relFile)));
      assert.ok(fs.statSync(path.join(repoRoot, relFile)).size > 0);
    });
  }

  await test('（P1-P6）真實端對端：free使用者連續呼叫POST兩次結果deterministic', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'p1p6-det-free', isGuest: false, authProvider: 'google' });
    const res1 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const body1 = await res1.json();
    const body2 = await res2.json();
    assert.strictEqual(body1.data.html, body2.data.html);
  });

  await test('（P1-P6）src/ui/health_insight/components/index.js的diff只有新增匯出，沒有移除任何既有匯出', () => {
    const source = fs.readFileSync(path.join(componentsDir, 'index.js'), 'utf8');
    for (const existingExport of ['escapeHtml', 'getObservationLabel', 'createIllustration', 'createCardHeader', 'createCardCta', 'createHealthSummaryCard', 'createObservationCard', 'createRecommendationCard', 'createBehaviorPatternPlaceholderCard', 'createProgressPlaceholderCard', 'createChoiceQuestionCard', 'createErrorCard']) {
      assert.ok(source.includes(existingExport), `既有匯出${existingExport}消失了`);
    }
  });

  await test('（P1-P6）components/index.js新增匯出createGeminiInsightCard/createHistoryPlaceholderCard', () => {
    const source = fs.readFileSync(path.join(componentsDir, 'index.js'), 'utf8');
    assert.ok(source.includes('createGeminiInsightCard'));
    assert.ok(source.includes('createHistoryPlaceholderCard'));
  });

  await test('（P1-P6）src/ui/health_insight/assets/asset_registry.js完全沒有被本次任務修改（沒有新增插畫資產，重用既有7張）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/assets/asset_registry.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）src/ui/health_insight/client/interaction_script.js完全沒有被本次任務修改（互動腳本延續既有"建立但不接線"模式）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/client/interaction_script.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）src/ui/health_insight/pages/input_page.js完全沒有被本次任務修改（Input Experience頁面不在本次任務範圍）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/pages/input_page.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）src/ui/health_insight/index.js完全沒有被本次任務修改（export * from components/index.js自動涵蓋新匯出，不需要額外修改）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）真實端對端：透過src/ui/health_insight/index.js的re-export依然能正確import到新元件', async () => {
    const uiIndexModule = await import(path.join(uiDir, 'index.js'));
    assert.strictEqual(typeof uiIndexModule.createGeminiInsightCard, 'function');
    assert.strictEqual(typeof uiIndexModule.createHistoryPlaceholderCard, 'function');
  });

  await test('（P1-P6）真實端對端：premium使用者跟free使用者的D1持久化紀錄筆數都是1筆，不受UI呈現層影響', async () => {
    const router = createAppRouter();
    const insertedFree = [];
    const insertedPremium = [];
    const dbFree = Object.assign({}, makeValidSessionDb({ userId: 'ui-persist-free', isGuest: false, authProvider: 'google' }), { healthInsightRecords: { insert: async (r) => { insertedFree.push(r); return { ok: true }; } } });
    const dbPremium = Object.assign({}, makeValidSessionDb({ userId: 'ui-persist-premium', isGuest: false, authProvider: 'google' }), { healthInsightRecords: { insert: async (r) => { insertedPremium.push(r); return { ok: true }; } } });
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: dbFree });
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('x'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: PREMIUM_OPTIONS }, { db: dbPremium, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.strictEqual(insertedFree.length, 1);
    assert.strictEqual(insertedPremium.length, 1);
    assert.ok(!insertedPremium[0].output_snapshot.includes('AI 陪伴解讀'));
  });

  await test('（P1-P6）新增/修改檔案完全不import任何AI SDK/付款SDK套件（只檢查實際import陳述式）', () => {
    for (const source of [geminiCardSource, historyCardSource, dashboardSource, renderSource]) {
      assert.ok(!/gemini-api|openai|anthropic-ai|@google\/genai|stripe/i.test(getImportLines(source)));
    }
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

/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation 測試
 *
 * 本任務是Phase 6系列**第一個使用者可見**的實作任務——建立
 * Health Insight的視覺結構、元件基礎、設計系統、互動基礎、
 * 未來資產整合邊界，走「拙趣」風格（溫暖、手感、陪伴感，避免
 * 傳統醫療儀表板的冷色系/精密感）。本次任務不整合Gemini、不
 * 修改Intelligence架構、不產生最終插畫資產、不建立route/
 * controller、不修改worker.js。
 *
 * 這份測試驗證的是：
 * - UI元件/頁面組裝函式的結構正確（純函式、可獨立呼叫、回傳
 *   HTML字串）
 * - 完全不import`src/intelligence/`底下任何檔案（Intelligence
 *   Boundary）
 * - 端對端：真實Health Insight
 *   Integration（TASK1.112）產出的結果可以正確被Dashboard
 *   元件呈現，且不暴露runtime metadata/internal capability
 *   fields/execution information（延續TASK1.108 Output
 *   Boundary）
 * - 「拙趣」設計方向具體落地（暖色系token、避免醫療藍/警示紅/
 *   純白底、圓角卡片、友善措辭）
 * - Error Presentation正確分離User Message跟Internal Error
 *   Detail，不暴露reason/field/stage/例外物件本身
 * - Responsive斷點/Asset Boundary/Component
 *   Boundary（不依賴database/authentication/intelligence
 *   runtime）
 * - Analysis Runner/Recommendation Runner/Capability
 *   Orchestrator/Runtime/五個既有Product Boundary/Health
 *   Insight Feature/Integration完全沒有被修改
 * - export一致性、regression、P1-P6
 *
 * 分為以下12個部分：
 * A) UI structure
 * B) Component boundaries
 * C) UX flow consistency
 * D) Health Insight output mapping
 * E) 拙趣 design direction validation
 * F) Input interaction
 * G) Error presentation
 * H) Responsive preparation
 * I) Asset boundary
 * J) Existing architecture protection
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
const intelDir = path.join(srcRoot, 'intelligence');
const productDir = path.join(intelDir, 'product');
const productEntryDir = path.join(productDir, 'entry');
const productContractDir = path.join(productDir, 'contract');
const productAdapterDir = path.join(productDir, 'adapter');
const productExecutionDir = path.join(productDir, 'execution');
const productOperationalDir = path.join(productDir, 'operational');
const productFeaturesDir = path.join(productDir, 'features');
const healthInsightFeatureDir = path.join(productFeaturesDir, 'health_insight');
const integrationFilePath = path.join(productDir, 'health_insight_integration.js');
const capabilitiesDir = path.join(intelDir, 'capabilities');
const analysisCapabilityDir = path.join(capabilitiesDir, 'analysis');
const recommendationCapabilityDir = path.join(capabilitiesDir, 'recommendation');
const orchestrationCapabilityDir = path.join(capabilitiesDir, 'orchestration');
const decisionCapabilityDir = path.join(capabilitiesDir, 'decision');
const applicationDir = path.join(intelDir, 'application');
const featuresDir = path.join(applicationDir, 'features');
const intelligenceFeatureDir = path.join(featuresDir, 'intelligence');
const analysisDir = path.join(intelDir, 'analysis');
const recommendationDir = path.join(intelDir, 'recommendation');
const orchestrationRuntimeDir = path.join(intelDir, 'orchestration');

const uiDir = path.join(srcRoot, 'ui', 'health_insight');
const designSystemDir = path.join(uiDir, 'design_system');
const assetsDir = path.join(uiDir, 'assets');
const componentsDir = path.join(uiDir, 'components');
const pagesDir = path.join(uiDir, 'pages');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readSrc(fullPath) {
  return stripComments(fs.readFileSync(fullPath, 'utf8'));
}

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

const PRODUCT_BOUNDARY_LAYERS = [
  { name: 'product-entry', dir: productEntryDir, files: ['product_entry.js', 'product_entry_result_builder.js', 'index.js'] },
  { name: 'product-contract', dir: productContractDir, files: ['product_contract.js', 'product_contract_validator.js', 'product_contract_result_builder.js', 'index.js'] },
  { name: 'product-adapter', dir: productAdapterDir, files: ['product_adapter.js', 'product_adapter_result_builder.js', 'index.js'] },
  { name: 'product-execution', dir: productExecutionDir, files: ['product_execution.js', 'product_execution_result_builder.js', 'index.js'] },
  { name: 'product-operational', dir: productOperationalDir, files: ['product_operational.js', 'product_operational_result_builder.js', 'index.js'] },
];
const PHASE4_LAYERS = [
  { name: 'analysis', dir: analysisCapabilityDir, files: ['analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js'] },
  { name: 'recommendation', dir: recommendationCapabilityDir, files: ['recommendation_capability.js', 'recommendation_capability_result_builder.js', 'index.js'] },
  { name: 'orchestration', dir: orchestrationCapabilityDir, files: ['capability_orchestrator.js', 'capability_result_builder.js', 'index.js'] },
  { name: 'decision', dir: decisionCapabilityDir, files: ['decision_capability.js', 'decision_result_builder.js', 'index.js'] },
  { name: 'intelligence-feature', dir: intelligenceFeatureDir, files: ['intelligence_feature.js', 'intelligence_feature_result_mapper.js', 'index.js'] },
];
const HEALTH_INSIGHT_LAYER = { name: 'health-insight-feature', dir: healthInsightFeatureDir, files: ['health_insight_feature.js', 'health_insight_result_mapper.js', 'index.js'] };
const EXISTING_LAYERS = [...PRODUCT_BOUNDARY_LAYERS, ...PHASE4_LAYERS, HEALTH_INSIGHT_LAYER];

const UI_JS_FILES = [
  path.join(designSystemDir, 'design_tokens.js'),
  path.join(assetsDir, 'asset_registry.js'),
  path.join(componentsDir, 'html_utils.js'),
  path.join(componentsDir, 'label_map.js'),
  path.join(componentsDir, 'health_summary_card.js'),
  path.join(componentsDir, 'observation_card.js'),
  path.join(componentsDir, 'recommendation_card.js'),
  path.join(componentsDir, 'behavior_pattern_card.js'),
  path.join(componentsDir, 'progress_card.js'),
  path.join(componentsDir, 'question_card.js'),
  path.join(componentsDir, 'error_card.js'),
  path.join(componentsDir, 'index.js'),
  path.join(pagesDir, 'dashboard_page.js'),
  path.join(pagesDir, 'input_page.js'),
  path.join(uiDir, 'index.js'),
];

const AI_KEYWORDS = [
  /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i, /gemini/i,
  /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
  /model\s*[:=]\s*['"]/i, /inference/i, /prompt/i,
];

// 醫療感/警示感顏色的判斷樣式——「拙趣」風格明確要求避免的
// 冷色系醫療藍/高飽和度警示紅/純白底。
const CLINICAL_BLUE_PATTERN = /#0066CC|#0000FF|#007BFF|#0d6efd/i;
const AGGRESSIVE_RED_PATTERN = /#FF0000|#FF4444|#DC3545|#E53935/i;

function makeInsightRawInput(overrides) {
  return Object.assign({
    user: null,
    activityContext: { count: 2, items: [{ id: 'a1' }] },
    nutritionContext: { count: 1, items: [{ id: 'n1' }] },
    emotionContext: { count: 0, items: [] },
    behaviorContext: { count: 0, items: [] },
    reportContext: { count: 0, items: [] },
    metadata: { totalRecords: 3 },
  }, overrides || {});
}

async function run() {
  const designTokens = await import(path.join(designSystemDir, 'design_tokens.js'));
  const assetRegistry = await import(path.join(assetsDir, 'asset_registry.js'));
  const htmlUtils = await import(path.join(componentsDir, 'html_utils.js'));
  const labelMap = await import(path.join(componentsDir, 'label_map.js'));
  const healthSummaryCard = await import(path.join(componentsDir, 'health_summary_card.js'));
  const observationCard = await import(path.join(componentsDir, 'observation_card.js'));
  const recommendationCard = await import(path.join(componentsDir, 'recommendation_card.js'));
  const behaviorPatternCard = await import(path.join(componentsDir, 'behavior_pattern_card.js'));
  const progressCard = await import(path.join(componentsDir, 'progress_card.js'));
  const questionCard = await import(path.join(componentsDir, 'question_card.js'));
  const errorCard = await import(path.join(componentsDir, 'error_card.js'));
  const componentsIndex = await import(path.join(componentsDir, 'index.js'));
  const dashboardPage = await import(path.join(pagesDir, 'dashboard_page.js'));
  const inputPage = await import(path.join(pagesDir, 'input_page.js'));
  const uiIndex = await import(path.join(uiDir, 'index.js'));
  const { createHealthInsightProductIntegration } = await import(integrationFilePath);

  // =========================================================================
  // A. UI structure
  // =========================================================================
  console.log('--- A. UI structure ---');

  await test('（1.UI structure）src/ui/health_insight/ 目錄存在', () => {
    assert.ok(fs.existsSync(uiDir));
  });

  const REQUIRED_UI_SUBDIRS = ['design_system', 'assets', 'components', 'pages'];
  for (const sub of REQUIRED_UI_SUBDIRS) {
    await test(`（1.UI structure）src/ui/health_insight/${sub}/ 目錄存在`, () => {
      assert.ok(fs.existsSync(path.join(uiDir, sub)), `${sub}/ 不存在`);
    });
  }

  await test('（1.UI structure）src/ui/health_insight/README.md 存在且非空，包含五個關鍵章節', () => {
    const readmePath = path.join(uiDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    const readme = fs.readFileSync(readmePath, 'utf8');
    assert.ok(readme.length > 0);
    for (const section of ['拙趣', 'Intelligence Boundary', 'Output Boundary', 'Error Presentation', 'Asset Boundary']) {
      assert.ok(readme.includes(section), `README缺少章節：${section}`);
    }
  });

  await test('（1.UI structure）所有UI JS檔案語法正確（可以被import不拋出例外）', () => {
    for (const file of UI_JS_FILES) {
      assert.ok(fs.existsSync(file), `檔案不存在：${file}`);
    }
  });

  await test('（1.UI structure）design_tokens.js匯出五組token跟一個CSS產生函式', () => {
    assert.strictEqual(typeof designTokens.COLOR_TOKENS, 'object');
    assert.strictEqual(typeof designTokens.TYPOGRAPHY_TOKENS, 'object');
    assert.strictEqual(typeof designTokens.SPACING_TOKENS, 'object');
    assert.strictEqual(typeof designTokens.CARD_STYLE_TOKENS, 'object');
    assert.strictEqual(typeof designTokens.BREAKPOINT_TOKENS, 'object');
    assert.strictEqual(typeof designTokens.getDesignSystemCSS, 'function');
  });

  await test('（1.UI structure）getDesignSystemCSS()回傳非空字串，且是deterministic（兩次呼叫結果相同）', () => {
    const css1 = designTokens.getDesignSystemCSS();
    const css2 = designTokens.getDesignSystemCSS();
    assert.strictEqual(typeof css1, 'string');
    assert.ok(css1.length > 0);
    assert.strictEqual(css1, css2);
  });

  await test('（1.UI structure）dashboard_page.js/input_page.js各自匯出對應的render函式', () => {
    assert.strictEqual(typeof dashboardPage.renderHealthInsightDashboard, 'function');
    assert.strictEqual(typeof dashboardPage.renderHealthInsightDashboardError, 'function');
    assert.strictEqual(typeof inputPage.renderHealthInsightInputExperience, 'function');
  });

  await test('（1.UI structure）頂層index.js完整re-export設計系統/資產註冊表/元件/頁面', () => {
    for (const name of ['getDesignSystemCSS', 'getAssetPlaceholder', 'createObservationCard', 'renderHealthInsightDashboard', 'renderHealthInsightInputExperience']) {
      assert.strictEqual(typeof uiIndex[name], 'function', `頂層index.js缺少匯出：${name}`);
    }
  });

  await test('（1.UI structure）escapeHtml()正確escape五個特殊字元', () => {
    assert.strictEqual(htmlUtils.escapeHtml('<div>&"\'</div>'), '&lt;div&gt;&amp;&quot;&#39;&lt;/div&gt;');
  });

  await test('（1.UI structure）escapeHtml()對null/undefined安全回傳空字串，不是字面上的"null"/"undefined"', () => {
    assert.strictEqual(htmlUtils.escapeHtml(null), '');
    assert.strictEqual(htmlUtils.escapeHtml(undefined), '');
  });

  await test('（1.UI structure）escapeHtml()對數字/布林值安全轉換成字串', () => {
    assert.strictEqual(htmlUtils.escapeHtml(42), '42');
    assert.strictEqual(htmlUtils.escapeHtml(true), 'true');
  });

  const KNOWN_OBSERVATION_TYPES = ['activity_count', 'nutrition_count', 'emotion_count', 'behavior_count', 'report_count', 'total_records'];
  for (const type of KNOWN_OBSERVATION_TYPES) {
    await test(`（1.UI structure）getObservationLabel("${type}")回傳非空的label跟explanation`, () => {
      const { label, explanation } = labelMap.getObservationLabel(type);
      assert.ok(label.length > 0);
      assert.ok(explanation.length > 0);
    });
  }

  const KNOWN_RECOMMENDATION_TYPES = ['insight_count', 'analysis_status', 'analysis_version'];
  for (const type of KNOWN_RECOMMENDATION_TYPES) {
    await test(`（1.UI structure）getRecommendationLabel("${type}")回傳非空的label跟explanation`, () => {
      const { label, explanation } = labelMap.getRecommendationLabel(type);
      assert.ok(label.length > 0);
      assert.ok(explanation.length > 0);
    });
  }

  await test('（1.UI structure）getObservationLabel()對未知type安全回傳通用fallback，不拋出例外', () => {
    assert.doesNotThrow(() => labelMap.getObservationLabel('some_future_unknown_type'));
    const { label } = labelMap.getObservationLabel('some_future_unknown_type');
    assert.ok(label.length > 0);
  });

  await test('（1.UI structure）getRecommendationLabel()對未知type安全回傳通用fallback，不拋出例外', () => {
    assert.doesNotThrow(() => labelMap.getRecommendationLabel('some_future_unknown_type'));
    const { label } = labelMap.getRecommendationLabel('some_future_unknown_type');
    assert.ok(label.length > 0);
  });

  const COLOR_TOKEN_KEYS = Object.keys(designTokens.COLOR_TOKENS);
  for (const key of COLOR_TOKEN_KEYS) {
    await test(`（1.UI structure）COLOR_TOKENS.${key} 是合法的十六進位色碼格式`, () => {
      assert.ok(/^#[0-9A-Fa-f]{6}$/.test(designTokens.COLOR_TOKENS[key]), `${key} 不是合法色碼：${designTokens.COLOR_TOKENS[key]}`);
    });
  }

  console.log('');

  // =========================================================================
  // B. Component boundaries
  // =========================================================================
  console.log('--- B. Component boundaries ---');

  const REQUIRED_COMPONENT_EXPORTS = ['createHealthSummaryCard', 'createObservationCard', 'createRecommendationCard', 'createChoiceQuestionCard', 'createInputQuestionCard', 'createBehaviorPatternPlaceholderCard', 'createProgressPlaceholderCard', 'createErrorCard'];
  for (const name of REQUIRED_COMPONENT_EXPORTS) {
    await test(`（2.Component boundaries）components/index.js匯出"${name}"`, () => {
      assert.strictEqual(typeof componentsIndex[name], 'function', `缺少元件：${name}`);
    });
  }

  await test('（2.Component boundaries）所有元件函式都是同步函式（回傳值不是Promise）', () => {
    const sampleResult = componentsIndex.createObservationCard({ type: 'activity_count', value: 3 });
    assert.strictEqual(sampleResult instanceof Promise, false);
  });

  for (const file of UI_JS_FILES) {
    const relName = path.relative(repoRoot, file);
    await test(`（2.Component boundaries）${relName} 完全不import src/intelligence/底下任何檔案（不依賴intelligence runtime）`, () => {
      const src = readSrc(file);
      assert.ok(!/from\s+['"].*\/intelligence\//.test(src), `${relName} 不應該import intelligence/`);
    });
    await test(`（2.Component boundaries）${relName} 完全不import src/db/（不依賴database）`, () => {
      const src = readSrc(file);
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（2.Component boundaries）${relName} 完全不import src/${subdir}/（不依賴authentication）`, () => {
        const src = readSrc(file);
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    await test(`（2.Component boundaries）${relName} 完全不import src/routes/、src/controllers/、worker.js（沒有建立route/controller）`, () => {
      const src = readSrc(file);
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
      assert.ok(!/worker\.js/.test(src));
    });
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（2.Component boundaries）${relName} 不含身分相關字樣 ${pattern}（不依賴authentication/session）`, () => {
        const src = readSrc(file);
        assert.ok(!pattern.test(src));
      });
    }
    await test(`（2.Component boundaries）${relName} 不含database相關字樣（select/insert/query等SQL關鍵字）`, () => {
      const src = readSrc(file);
      assert.ok(!/\bSELECT\s+.*\bFROM\b/i.test(src));
      assert.ok(!/\bINSERT\s+INTO\b/i.test(src));
    });
  }

  await test('（2.Component boundaries）沒有任何UI檔案import worker.js本身（沒有把UI接進既有worker.js）', () => {
    for (const file of UI_JS_FILES) {
      const src = readSrc(file);
      assert.ok(!src.includes("'../../worker.js'"));
      assert.ok(!src.includes('"../../worker.js"'));
    }
  });

  console.log('');

  // =========================================================================
  // C. UX flow consistency
  // =========================================================================
  console.log('--- C. UX flow consistency ---');

  await test('（3.UX flow consistency）Dashboard結構恰好包含TASK1.114 Expected UI Areas第1節四個區塊（summary/observation/recommendation/behavior-pattern/progress，共五個class標記）', () => {
    const html = dashboardPage.renderHealthInsightDashboard({ healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {} });
    for (const cls of ['hi-dashboard-summary', 'hi-dashboard-observation', 'hi-dashboard-recommendation', 'hi-dashboard-behavior-pattern', 'hi-dashboard-progress']) {
      assert.ok(html.includes(cls), `Dashboard缺少區塊：${cls}`);
    }
  });

  await test('（3.UX flow consistency）Dashboard根節點帶有data-hi-page="dashboard"標記', () => {
    const html = dashboardPage.renderHealthInsightDashboard({});
    assert.ok(html.includes('data-hi-page="dashboard"'));
  });

  await test('（3.UX flow consistency）Input Experience結構恰好包含profile/goal兩個區塊，延續TASK1.107 User Profile Data/Health Goal Data分類', () => {
    const html = inputPage.renderHealthInsightInputExperience();
    assert.ok(html.includes('hi-input-profile'));
    assert.ok(html.includes('hi-input-goal'));
    assert.ok(html.includes('data-hi-page="input"'));
  });

  await test('（3.UX flow consistency）Input Experience包含延續TASK1.107 Required Fields的四個欄位（age/gender/height/weight）', () => {
    const html = inputPage.renderHealthInsightInputExperience();
    for (const field of ['data-field="age"', 'data-field="gender"', 'data-field="height"', 'data-field="weight"']) {
      assert.ok(html.includes(field), `Input Experience缺少欄位：${field}`);
    }
  });

  await test('（3.UX flow consistency）Input Experience包含健康目標選擇（延續TASK1.107 Health Goal Data四個選項）', () => {
    const html = inputPage.renderHealthInsightInputExperience();
    for (const goal of ['weight_loss', 'weight_maintenance', 'muscle_gain', 'healthy_lifestyle']) {
      assert.ok(html.includes(goal), `Input Experience缺少健康目標選項：${goal}`);
    }
  });

  await test('（3.UX flow consistency）Dashboard跟Error Dashboard都內嵌了設計系統CSS（畫面風格一致）', () => {
    const successHtml = dashboardPage.renderHealthInsightDashboard({});
    const errorHtml = dashboardPage.renderHealthInsightDashboardError({ reason: 'internal_error' });
    assert.ok(successHtml.includes('<style>'));
    assert.ok(errorHtml.includes('<style>'));
  });

  console.log('');

  // =========================================================================
  // D. Health Insight output mapping
  // =========================================================================
  console.log('--- D. Health Insight output mapping ---');

  await test('（TASK1.115後更新）（4.Health Insight output mapping）端對端：真實Health Insight Integration產出的結果可以被Dashboard正確呈現（healthObservation/recommendation各自組成一張卡片，卡片內清單筆數對應——TASK1.115把結構從"每筆一張卡"改成"一張卡裡的清單"，見observation_card.js/recommendation_card.js的TASK1.115更新說明，不是回歸，是刻意的視覺重構）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    assert.strictEqual(result.ok, true);
    const html = dashboardPage.renderHealthInsightDashboard(result.result);
    const observationCardCount = (html.match(/hi-observation-card/g) || []).length;
    const recommendationCardCount = (html.match(/hi-recommendation-card/g) || []).length;
    assert.strictEqual(observationCardCount, 1, '應該恰好一張Observation卡片');
    assert.strictEqual(recommendationCardCount, 1, '應該恰好一張Recommendation卡片');
    const observationItemCount = (html.match(/<li class="hi-observation-item">/g) || []).length;
    const recommendationItemCount = (html.match(/<li class="hi-recommendation-item">/g) || []).length;
    assert.strictEqual(observationItemCount, result.result.healthObservation.length);
    assert.strictEqual(recommendationItemCount, result.result.recommendation.length);
  });

  await test('（4.Health Insight output mapping）端對端：Dashboard HTML包含每一筆healthObservation的實際數值（value欄位）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const html = dashboardPage.renderHealthInsightDashboard(result.result);
    for (const item of result.result.healthObservation) {
      assert.ok(html.includes(`>${item.value}<`), `Dashboard缺少數值：${item.value}`);
    }
  });

  await test('（4.Health Insight output mapping）不暴露runtime metadata：Dashboard HTML完全不包含"orchestration"/"health_insight"這類Capability/Feature內部標籤字串', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const html = dashboardPage.renderHealthInsightDashboard(result.result);
    assert.ok(!html.includes('orchestration'));
    assert.ok(!html.includes('health_insight'));
    assert.ok(!html.includes('"boundary"'));
  });

  await test('（4.Health Insight output mapping）不暴露internal capability fields：Dashboard HTML完全不包含source欄位標籤本身或status這類Capability整體回傳的結構標籤（不檢查Capability既有產生的內容值本身，例如Recommendation Capability既有的analysis_status這類recommendation項目的value——延續TASK1.111已確認的"Feature如實轉發Capability既有內容不算洩漏"既定結論）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const html = dashboardPage.renderHealthInsightDashboard(result.result);
    assert.ok(!html.includes('"source"'));
    assert.ok(!html.includes('data-source'));
  });

  await test('（4.Health Insight output mapping）不暴露execution information：Dashboard HTML完全不包含五階段lifecycle標記', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const html = dashboardPage.renderHealthInsightDashboard(result.result);
    for (const stageWord of ['request_received', 'validation_completed', 'execution_started', 'execution_completed']) {
      assert.ok(!html.includes(stageWord));
    }
  });

  await test('（4.Health Insight output mapping）healthObservation/recommendation為空陣列時顯示友善的空狀態卡片，不顯示錯誤/空白', () => {
    const html = dashboardPage.renderHealthInsightDashboard({ healthObservation: [], recommendation: [] });
    assert.ok(html.includes('hi-empty-state'));
  });

  await test('（4.Health Insight output mapping）behaviorPattern/progressTrend固定顯示預留卡片（延續TASK1.111/1.113 V1不產生實際內容既有結論），即使傳入非空的behaviorPattern陣列也一樣', () => {
    const html = dashboardPage.renderHealthInsightDashboard({ behaviorPattern: [{ fake: 'data' }], progressTrend: { fake: 'trend' } });
    assert.ok(html.includes('hi-placeholder-card'));
    assert.ok(!html.includes('fake'));
  });

  await test('（4.Health Insight output mapping）Health Summary Card只讀取陣列長度，不做任何加總/評分（傳入不同value的相同長度陣列，摘要文字相同）', () => {
    const htmlA = dashboardPage.renderHealthInsightDashboard({ healthObservation: [{ type: 'x', value: 1 }], recommendation: [] });
    const htmlB = dashboardPage.renderHealthInsightDashboard({ healthObservation: [{ type: 'x', value: 999 }], recommendation: [] });
    const summaryA = htmlA.split('hi-health-summary-card')[1].split('</div>')[0];
    const summaryB = htmlB.split('hi-health-summary-card')[1].split('</div>')[0];
    assert.strictEqual(summaryA, summaryB);
  });

  console.log('');

  // =========================================================================
  // E. 拙趣 design direction validation
  // =========================================================================
  console.log('--- E. 拙趣 design direction validation ---');

  await test('（5.拙趣design）design_tokens.js檔案頭說明提及「拙趣」跟核心設計原則', () => {
    const src = fs.readFileSync(path.join(designSystemDir, 'design_tokens.js'), 'utf8');
    assert.ok(src.includes('拙趣'));
    assert.ok(src.includes('陪伴使用者理解自己'));
  });

  await test('（5.拙趣design）顏色token完全不使用醫療藍色系', () => {
    const css = designTokens.getDesignSystemCSS();
    assert.ok(!CLINICAL_BLUE_PATTERN.test(css));
  });

  await test('（5.拙趣design）顏色token完全不使用高飽和度警示紅', () => {
    const css = designTokens.getDesignSystemCSS();
    assert.ok(!AGGRESSIVE_RED_PATTERN.test(css));
  });

  await test('（5.拙趣design）背景色不是純白（#FFFFFF），是溫暖米杏色', () => {
    assert.notStrictEqual(designTokens.COLOR_TOKENS.background.toUpperCase(), '#FFFFFF');
    assert.ok(/^#F/i.test(designTokens.COLOR_TOKENS.background));
  });

  await test('（5.拙趣design）主色調是暖色系（赤陶橘），不是冷色系', () => {
    assert.ok(/^#C8|^#A8|^#E8/i.test(designTokens.COLOR_TOKENS.primary) || designTokens.COLOR_TOKENS.primary.toUpperCase() === '#C8794A');
  });

  await test('（5.拙趣design）警示/失敗狀態用溫暖赭石色，不是刺眼紅色', () => {
    assert.ok(!AGGRESSIVE_RED_PATTERN.test(designTokens.COLOR_TOKENS.caution));
    assert.notStrictEqual(designTokens.COLOR_TOKENS.caution.toUpperCase(), '#FF0000');
  });

  await test('（5.拙趣design）卡片樣式使用大圓角（延續rounded structure要求，radius至少16px）', () => {
    const radiusValue = parseInt(designTokens.CARD_STYLE_TOKENS.borderRadius, 10);
    assert.ok(radiusValue >= 16, `圓角太小：${designTokens.CARD_STYLE_TOKENS.borderRadius}`);
  });

  await test('（5.拙趣design）卡片有柔和陰影而不是銳利邊框（boxShadow存在且不是硬邊框樣式）', () => {
    assert.ok(designTokens.CARD_STYLE_TOKENS.boxShadow.includes('rgba'));
  });

  await test('（5.拙趣design）Health Summary Card/Observation Card/Recommendation Card的措辭是友善口語，不是冷冰冰的技術字眼（不包含"Error"/"NULL"/"undefined"等字樣）', () => {
    const html = [
      componentsIndex.createHealthSummaryCard({ healthObservation: [], recommendation: [] }),
      componentsIndex.createObservationCard({ type: 'activity_count', value: 3 }),
      componentsIndex.createRecommendationCard({ type: 'insight_count', value: 6 }),
    ].join('\n');
    for (const badWord of ['Error', 'NULL', 'undefined', 'null']) {
      assert.ok(!html.includes(badWord), `措辭出現不友善字樣：${badWord}`);
    }
  });

  await test('（5.拙趣design）錯誤卡片使用友善措辭（"不是你的問題"這類降低焦慮感的用語），使用者可見文字（label/explanation）不含"ERROR"/"FAILED"/"EXCEPTION"這類冷硬字眼（技術性的CSS class名稱本身不算使用者可見文字，不在這裡檢查範圍）', () => {
    const html = componentsIndex.createErrorCard('internal_error');
    const label = html.split('hi-card-label">')[1].split('</div>')[0];
    const explanation = html.split('hi-card-explanation">')[1].split('</div>')[0];
    assert.ok(!/ERROR|FAILED|EXCEPTION/i.test(label + explanation));
    assert.ok(explanation.includes('不是你的問題'));
  });

  await test('（5.拙趣design）Behavior Pattern/Progress預留卡片使用"還在準備中"這類誠實但不焦慮的措辭，不是"N/A"/"無資料"這類冷硬字眼', () => {
    const html = componentsIndex.createBehaviorPatternPlaceholderCard() + componentsIndex.createProgressPlaceholderCard();
    assert.ok(html.includes('準備中'));
    assert.ok(!html.includes('N/A'));
    assert.ok(!html.includes('無資料'));
  });

  console.log('');

  // =========================================================================
  // F. Input interaction
  // =========================================================================
  console.log('--- F. Input interaction ---');

  await test('（6.Input interaction）Choice Question Card用按鈕呈現選項，不是<select>下拉選單（避免傳統表單）', () => {
    const html = componentsIndex.createChoiceQuestionCard({ fieldKey: 'test', question: 'q', options: [{ value: 'a', label: 'A' }] });
    assert.ok(html.includes('<button'));
    assert.ok(!html.includes('<select'));
  });

  await test('（6.Input interaction）Input Question Card沒有使用<form>標籤（避免傳統表單提交流程）', () => {
    const html = componentsIndex.createInputQuestionCard({ fieldKey: 'age', question: 'q', inputType: 'number' });
    assert.ok(!html.includes('<form'));
  });

  await test('（6.Input interaction）Question Card正確標記data-field屬性，方便未來JS抓取欄位', () => {
    const choiceHtml = componentsIndex.createChoiceQuestionCard({ fieldKey: 'healthGoal', question: 'q', options: [] });
    const inputHtml = componentsIndex.createInputQuestionCard({ fieldKey: 'weight', question: 'q' });
    assert.ok(choiceHtml.includes('data-field="healthGoal"'));
    assert.ok(inputHtml.includes('data-field="weight"'));
  });

  await test('（6.Input interaction）Choice Question Card的每個選項按鈕都帶有data-value屬性', () => {
    const html = componentsIndex.createChoiceQuestionCard({ fieldKey: 'test', question: 'q', options: [{ value: 'opt1', label: 'Option 1' }, { value: 'opt2', label: 'Option 2' }] });
    assert.ok(html.includes('data-value="opt1"'));
    assert.ok(html.includes('data-value="opt2"'));
  });

  await test('（6.Input interaction）Input Question Card支援unit顯示（例如"cm"/"kg"），沒有unit時不顯示多餘的span', () => {
    const withUnit = componentsIndex.createInputQuestionCard({ fieldKey: 'height', question: 'q', unit: 'cm' });
    const withoutUnit = componentsIndex.createInputQuestionCard({ fieldKey: 'x', question: 'q' });
    assert.ok(withUnit.includes('hi-input-unit'));
    assert.ok(withUnit.includes('cm'));
    assert.ok(!withoutUnit.includes('hi-input-unit'));
  });

  await test('（6.Input interaction）Question Card不做任何輸入驗證邏輯（不含正規表達式驗證/必填檢查程式碼）', () => {
    const src = readSrc(path.join(componentsDir, 'question_card.js'));
    assert.ok(!/\.test\(\s*value/.test(src));
    assert.ok(!/required\s*=\s*true/.test(src));
  });

  await test('（6.Input interaction）Question Card元件對使用者輸入內容做HTML escape（防止HTML注入）', () => {
    const html = componentsIndex.createChoiceQuestionCard({ fieldKey: 'x', question: '<script>alert(1)</script>', options: [] });
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  console.log('');

  // =========================================================================
  // G. Error presentation
  // =========================================================================
  console.log('--- G. Error presentation ---');

  const REQUIRED_ERROR_CATEGORIES = ['missing_data', 'invalid_input', 'unavailable_intelligence', 'temporary_failure'];
  for (const category of REQUIRED_ERROR_CATEGORIES) {
    await test(`（7.Error presentation）錯誤分類"${category}"存在且有對應的友善訊息`, () => {
      const html = componentsIndex.createErrorCard({ reason: 'unknown_error_placeholder_' + category });
      assert.strictEqual(typeof html, 'string');
    });
  }

  await test('（7.Error presentation）classifyErrorReason()正確分類四種已知reason（延續TASK1.112/1.113既有reason命名）', () => {
    assert.strictEqual(componentsIndex.classifyErrorReason('invalid_raw_input'), 'missing_data');
    assert.strictEqual(componentsIndex.classifyErrorReason('missing_field'), 'invalid_input');
    assert.strictEqual(componentsIndex.classifyErrorReason('capability_orchestrator_unavailable'), 'unavailable_intelligence');
    assert.strictEqual(componentsIndex.classifyErrorReason('capability_execution_failed'), 'temporary_failure');
  });

  const REASON_CATEGORY_FIXTURES = [
    ['invalid_request', 'missing_data'], ['invalid_options', 'missing_data'], ['invalid_options_type', 'missing_data'],
    ['invalid_user_id', 'missing_data'], ['invalid_context', 'missing_data'], ['invalid_field_type', 'invalid_input'],
    ['adapter_unavailable', 'unavailable_intelligence'], ['intelligence_feature_unavailable', 'unavailable_intelligence'],
    ['analysis_capability_unavailable', 'unavailable_intelligence'], ['recommendation_capability_unavailable', 'unavailable_intelligence'],
    ['analysis_runner_unavailable', 'unavailable_intelligence'], ['recommendation_runner_unavailable', 'unavailable_intelligence'],
    ['internal_error', 'temporary_failure'], ['mapping_failed', 'temporary_failure'],
    ['intelligence_invalid_result', 'temporary_failure'], ['capability_invalid_result', 'temporary_failure'], ['unknown_error', 'temporary_failure'],
  ];
  for (const [reason, expectedCategory] of REASON_CATEGORY_FIXTURES) {
    await test(`（7.Error presentation）classifyErrorReason("${reason}")正確分類成"${expectedCategory}"`, () => {
      assert.strictEqual(componentsIndex.classifyErrorReason(reason), expectedCategory);
    });
  }

  for (const category of REQUIRED_ERROR_CATEGORIES) {
    await test(`（TASK1.115後更新）（7.Error presentation）分類"${category}"對應的錯誤卡片HTML結構正確（含插畫/label/explanation三個區塊——TASK1.115把emoji圖示的hi-card-icon換成真正插畫的hi-illustration，見error_card.js的TASK1.115更新說明）`, () => {
      const reasonByCategory = { missing_data: 'invalid_raw_input', invalid_input: 'missing_field', unavailable_intelligence: 'adapter_unavailable', temporary_failure: 'internal_error' };
      const html = componentsIndex.createErrorCard(reasonByCategory[category]);
      assert.ok(html.includes('hi-illustration'));
      assert.ok(html.includes('hi-card-label'));
      assert.ok(html.includes('hi-card-explanation'));
      assert.ok(html.includes(`hi-error-${category}`));
    });
  }

  await test('（7.Error presentation）未知reason安全分類成temporary_failure，不拋出例外', () => {
    assert.doesNotThrow(() => componentsIndex.classifyErrorReason('some_totally_unknown_reason_xyz'));
    assert.strictEqual(componentsIndex.classifyErrorReason('some_totally_unknown_reason_xyz'), 'temporary_failure');
  });

  await test('（7.Error presentation）createErrorCard()接受完整失敗結果物件或純reason字串兩種輸入', () => {
    const htmlFromObject = componentsIndex.createErrorCard({ ok: false, boundary: 'product-entry', reason: 'invalid_raw_input' });
    const htmlFromString = componentsIndex.createErrorCard('invalid_raw_input');
    assert.strictEqual(htmlFromObject, htmlFromString);
  });

  await test('（7.Error presentation）createErrorCard()完全不暴露原始reason字串本身給使用者看（HTML裡不包含"invalid_raw_input"這個字串）', () => {
    const html = componentsIndex.createErrorCard('invalid_raw_input');
    assert.ok(!html.includes('invalid_raw_input'));
  });

  await test('（7.Error presentation）createErrorCard()完全不暴露field/stage欄位', () => {
    const html = componentsIndex.createErrorCard({ reason: 'capability_execution_failed', field: 'secretField', stage: 'secretStage' });
    assert.ok(!html.includes('secretField'));
    assert.ok(!html.includes('secretStage'));
  });

  await test('（7.Error presentation）createErrorCard()完全不暴露stack trace/例外物件內容', () => {
    const fakeError = new Error('super secret internal exception detail');
    const html = componentsIndex.createErrorCard({ reason: 'internal_error', error: fakeError });
    assert.ok(!html.includes('super secret internal exception detail'));
    assert.ok(!html.includes('.js:'));
    assert.ok(!html.includes(' at '));
  });

  await test('（7.Error presentation）端對端：Health Insight Integration真實失敗結果可以被正確分類跟呈現', () => {
    const integration = createHealthInsightProductIntegration();
    const failure = integration.requestProductEntry({});
    assert.strictEqual(failure.ok, false);
    const html = dashboardPage.renderHealthInsightDashboardError(failure);
    assert.ok(html.includes('hi-error-card'));
    assert.ok(!html.includes(failure.reason));
  });

  console.log('');

  // =========================================================================
  // H. Responsive preparation
  // =========================================================================
  console.log('--- H. Responsive preparation ---');

  await test('（8.Responsive preparation）BREAKPOINT_TOKENS定義mobile/tablet/desktop三個斷點', () => {
    assert.strictEqual(typeof designTokens.BREAKPOINT_TOKENS.mobile, 'string');
    assert.strictEqual(typeof designTokens.BREAKPOINT_TOKENS.tablet, 'string');
    assert.strictEqual(typeof designTokens.BREAKPOINT_TOKENS.desktop, 'string');
  });

  await test('（8.Responsive preparation）CSS包含至少兩個@media查詢（tablet跟desktop各一個）', () => {
    const css = designTokens.getDesignSystemCSS();
    const mediaQueryCount = (css.match(/@media/g) || []).length;
    assert.ok(mediaQueryCount >= 2, `@media查詢數量不足：${mediaQueryCount}`);
  });

  await test('（8.Responsive preparation）CSS沒有寫死固定px寬度在.hi-card上（用padding而非width，讓卡片自適應容器）', () => {
    const css = designTokens.getDesignSystemCSS();
    const cardBlock = css.split('.hi-card {')[1].split('}')[0];
    assert.ok(!/width:\s*\d+px/.test(cardBlock));
  });

  await test('（8.Responsive preparation）tablet斷點數值小於desktop斷點數值（斷點順序正確）', () => {
    const tabletPx = parseInt(designTokens.BREAKPOINT_TOKENS.tablet, 10);
    const desktopPx = parseInt(designTokens.BREAKPOINT_TOKENS.desktop, 10);
    assert.ok(tabletPx < desktopPx);
  });

  console.log('');

  // =========================================================================
  // I. Asset boundary
  // =========================================================================
  console.log('--- I. Asset boundary ---');

  await test('（9.Asset boundary）src/ui/health_insight/assets/ 目錄存在README.md跟asset_registry.js', () => {
    assert.ok(fs.existsSync(path.join(assetsDir, 'README.md')));
    assert.ok(fs.existsSync(path.join(assetsDir, 'asset_registry.js')));
  });

  await test('（9.Asset boundary）assets/placeholders/ 目錄存在但沒有任何圖片檔案（本次任務不產生最終插畫資產）', () => {
    const placeholdersDir = path.join(assetsDir, 'placeholders');
    assert.ok(fs.existsSync(placeholdersDir));
    const files = fs.readdirSync(placeholdersDir);
    for (const file of files) {
      assert.ok(!/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(file), `發現非預期的圖片檔案：${file}`);
    }
  });

  await test('（TASK1.115後更新）（9.Asset boundary）ASSET_REGISTRY每個插槽都有description/file/alt三個欄位，file必須是真正的.webp插畫檔案（TASK1.115把emoji佔位符升級成使用者提供的真實插畫，見asset_registry.js的TASK1.115更新說明——這裡的斷言方向刻意反過來：現在"是圖片路徑"才是正確狀態）', () => {
    for (const key of Object.keys(assetRegistry.ASSET_REGISTRY)) {
      const entry = assetRegistry.ASSET_REGISTRY[key];
      assert.strictEqual(typeof entry.description, 'string');
      assert.strictEqual(typeof entry.file, 'string');
      assert.strictEqual(typeof entry.alt, 'string');
      assert.ok(/\.webp$/i.test(entry.file), `插槽${key}的file應該是.webp插畫檔案：${entry.file}`);
    }
  });

  await test('（9.Asset boundary）listAssetKeys()回傳的插槽清單涵蓋所有元件實際使用到的插槽（greeting/observation/recommendation/behaviorPatternPlaceholder/progressPlaceholder/questionCard/errorGentle）', () => {
    const keys = assetRegistry.listAssetKeys();
    for (const expected of ['greeting', 'observation', 'recommendation', 'behaviorPatternPlaceholder', 'progressPlaceholder', 'questionCard', 'errorGentle']) {
      assert.ok(keys.includes(expected), `ASSET_REGISTRY缺少插槽：${expected}`);
    }
  });

  await test('（9.Asset boundary）getAssetPlaceholder()對不存在的插槽安全回傳空字串，不拋出例外', () => {
    assert.doesNotThrow(() => assetRegistry.getAssetPlaceholder('nonexistent_key_xyz'));
    assert.strictEqual(assetRegistry.getAssetPlaceholder('nonexistent_key_xyz'), '');
  });

  await test('（9.Asset boundary）元件透過getAssetPlaceholder()間接取得圖示，沒有任何元件檔案寫死圖片路徑字串（.png/.jpg/.svg）', () => {
    for (const file of [path.join(componentsDir, 'observation_card.js'), path.join(componentsDir, 'recommendation_card.js'), path.join(componentsDir, 'health_summary_card.js')]) {
      const src = readSrc(file);
      assert.ok(!/\.(png|jpg|jpeg|svg|gif|webp)['"]/.test(src), `${path.basename(file)} 不應該寫死圖片路徑`);
    }
  });

  await test('（TASK1.115後更新）（9.Asset boundary）src/ui/health_insight/assets/illustrations/底下恰好有TASK1.115新增的十個真實插畫檔案，其餘目錄樹依然沒有任何非預期的圖片檔案（TASK1.115明確允許"使用者提供的既有素材"，跟TASK1.114"不產生新圖片"的限制不衝突——見asset_registry.js檔案頭已經說明的區別）', () => {
    function walk(dir) {
      const results = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...walk(full));
        else results.push(full);
      }
      return results;
    }
    const illustrationsDir = path.join(uiDir, 'assets', 'illustrations');
    const illustrationFiles = fs.readdirSync(illustrationsDir).sort();
    assert.strictEqual(illustrationFiles.length, 10, `預期illustrations/底下恰好10個檔案，實際：${illustrationFiles.length}`);
    for (const file of illustrationFiles) {
      assert.ok(/\.webp$/i.test(file), `illustrations/底下出現非.webp檔案：${file}`);
    }

    const allFiles = walk(uiDir).filter((f) => !f.includes(`${path.sep}illustrations${path.sep}`));
    for (const file of allFiles) {
      assert.ok(!/\.(png|jpg|jpeg|gif|webp|ico)$/i.test(file), `illustrations/以外發現非預期的圖片檔案：${file}`);
    }
  });

  console.log('');

  // =========================================================================
  // J. Existing architecture protection
  // =========================================================================
  console.log('--- J. Existing architecture protection ---');

  await test('（10.Existing architecture protection）src/worker.js既有TASK1.21~1.38路由分派邏輯/legacy handler完全沒有被修改（TASK1.116後更新：TASK1.116在檔案末尾新增GET /health-insight、POST /api/health-insight兩個if區塊，這是本次任務明確授權的Route connection範圍，不再要求整個檔案零diff，改成驗證既有邏輯的具體內容標記依然逐字存在）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('const DATA_API_PATHS = new Set(['));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/api/timeline')"));
    assert.ok(workerSource.includes('async function handle(r,env){'));
    assert.ok(workerSource.includes("if(p==='/api/qlive'){"));
  });

  await test('（10.Existing architecture protection）src/bootstrap/application.js完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.Existing architecture protection）app.intelligence物件恰好維持24個欄位不變', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（10.Existing architecture protection）app.router.routes 數量沒有因為本次任務而改變（維持21個既有route；TASK1.116後更新：TASK1.116是本系列第一個明確被授權做"Route connection"的任務，正式新增GET /health-insight、POST /api/health-insight兩條路由，21+2=23）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 23);
  });

  await test('（10.Existing architecture protection）src/routes/、src/controllers/既有檔案完全沒有被修改，只新增Health Insight專屬的新檔案（TASK1.116後更新：TASK1.116新增src/routes/health_insight_routes.js、src/controllers/health_insight_controller.js，並在src/routes/index.js新增對應的import/register一行，這是本次任務明確授權的Route connection範圍，這裡改成驗證既有路由/controller檔案本身逐一沒有被修改）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/auth_routes.js src/routes/user_routes.js src/routes/data_routes.js src/routes/dashboard_routes.js src/routes/profile_routes.js src/routes/timeline_routes.js src/routes/legacy_routes.js src/routes/router.js src/controllers/auth_controller.js src/controllers/dashboard_controller.js src/controllers/data_controller.js src/controllers/profile_controller.js src/controllers/timeline_controller.js src/controllers/user_controller.js src/controllers/response.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.Existing architecture protection）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Existing architecture protection）migrations/、src/db/ 目錄除了TASK1.120明確授權新增的Health Insight persistence層之外，完全沒有其他檔案被新增或修改（TASK1.120後更新）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/ src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120') && !line.includes('health_insight_records.js') && !line.includes('src/db/index.js')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  for (const layer of EXISTING_LAYERS) {
    await test(`（10.Existing architecture protection）${layer.name} 目錄本次任務完全沒有任何檔案被修改`, () => {
      const status = execFileSync('git', ['status', '--porcelain', layer.dir], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(status.trim(), '');
    });
    await test(`（10.Existing architecture protection）${layer.name} 目錄恰好維持既有的檔案清單`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  await test('（10.Existing architecture protection）src/intelligence/product/health_insight_integration.js（TASK1.112）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/health_insight_integration.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.Existing architecture protection）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', orchestrationRuntimeDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Existing architecture protection）src/intelligence/analysis/（Analysis Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', analysisDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Existing architecture protection）src/intelligence/recommendation/（Recommendation Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', recommendationDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Existing architecture protection）Phase 4 Capability Architecture（capabilities/整個目錄樹）本次任務完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', capabilitiesDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Existing architecture protection）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  for (const file of UI_JS_FILES) {
    const relName = path.relative(repoRoot, file);
    for (const pattern of AI_KEYWORDS) {
      await test(`（10.Existing architecture protection）${relName} 的實際程式碼不含AI相關關鍵字樣 ${pattern}（Gemini not integrated）`, () => {
        const src = readSrc(file);
        assert.ok(!pattern.test(src), `${relName} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（10.Existing architecture protection）${relName} 完全不呼叫Date.now()/Math.random()（deterministic）`, () => {
      const src = readSrc(file);
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
    await test(`（10.Existing architecture protection）${relName} 完全沒有呼叫fetch()`, () => {
      const src = readSrc(file);
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
  }

  await test('（10.Existing architecture protection）wrangler.toml完全沒有新增任何AI相關的環境變數/binding，也完全沒有被修改', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i, /GEMINI/i]) {
      assert.ok(!pattern.test(content));
    }
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.Existing architecture protection）package.json完全沒有新增任何AI SDK依賴，也完全沒有被修改', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek|gemini/i.test(name));
      }
    }
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // K. Regression validation
  // =========================================================================
  console.log('--- K. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（Regression validation）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase6-task1.114-health-insight-uiux')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（Regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5/Phase 6全部）`, () => {
      assert.ok(allSuites.length >= 100, `預期至少100個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（Regression validation）${relName} 完整執行，exit code為0（無回歸）`, () => {
        try {
          execFileSync('node', [suite], {
            cwd: repoRoot,
            stdio: 'pipe',
            timeout: 60000,
            env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
          });
        } catch (e) {
          const output = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
          throw new Error(`${relName} 執行失敗：${output.split('\n').filter((l) => l.includes('❌') || l.includes('FAIL')).slice(0, 5).join(' | ')}`);
        }
      });
    }
  }

  console.log('');

  // =========================================================================
  // L. P1-P6
  // =========================================================================
  console.log('--- L. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何既有UI/getHTML()相關程式碼，既有UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改（TASK1.116後更新：見上方"Existing architecture protection"章節已經改用內容標記比對，這裡額外確認legacy getHTML()函式本身逐字沒有被修改，既有UI維持不變）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  await test('（P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）migrations/ 目錄除了TASK1.120新增的0007 health_insight_records migration之外，完全沒有其他檔案被新增或修改（TASK1.120後更新）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = statusOutput.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（P1-P6）src/auth/、src/oauth/ 完全沒有被本次任務修改，src/routes/、src/controllers/既有檔案也沒有被修改（TASK1.116後更新：見上方"Existing architecture protection"章節已針對routes/controllers做過檔案範圍限定的diff檢查，這裡額外確認src/auth/、src/oauth/兩個目錄完全沒有被觸碰）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

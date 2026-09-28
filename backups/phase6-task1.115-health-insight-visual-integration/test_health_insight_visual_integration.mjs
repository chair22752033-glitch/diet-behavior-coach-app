/*
 * Phase 6 TASK 1.115｜Health Insight Visual Asset Integration &
 * UI Refinement 測試
 *
 * 本任務把使用者親自提供的八張「拙趣風格」Health
 * Insight參考圖，整合進TASK1.114建立的UI Foundation——用
 * `sharp`函式庫做純粹的影像裁切/去背/壓縮（不是AI生成），把
 * 七張角色插畫+三張手繪底線放進`assets/illustrations/`，取代
 * TASK1.114原本的emoji佔位符，同時重構設計系統（新增鼠尾草綠/
 * 霧藍色token、邊框式卡片變體、選項Chip四色循環規則）跟七個
 * 元件的視覺呈現。本次任務不整合Gemini、不修改Intelligence
 * 架構、不修改worker.js/routes/controllers/auth/oauth/
 * session/database/migrations。
 *
 * 這份測試驗證的是：
 * - 使用者提供的參考圖確實被檢視並轉換成真實的插畫資產檔案
 *   （不是空談分析）
 * - 設計系統新增的token/CSS類別一致、deterministic
 * - 七個元件正確使用新的插畫/底線/CTA共用輔助函式
 * - 完全消除emoji佔位符呈現（除了Input Experience選項前綴的
 *   極簡辨識符號，這是刻意保留、跟"emoji佔位插畫"性質不同的
 *   既定設計）
 * - Intelligence Boundary/Output Boundary在新結構下依然成立
 * - 端對端：真實Health Insight Integration產出的結果可以正確
 *   被新版Dashboard呈現
 * - Responsive基礎（box-sizing/斷點）正確
 * - 既有Product/Capability/Runtime架構完全沒有被修改
 * - export一致性、regression、P1-P6
 *
 * 分為以下11個部分：
 * A) reference image usage
 * B) design-system consistency
 * C) component refinement
 * D) non-emoji presentation
 * E) visual-boundary consistency
 * F) UX-flow consistency
 * G) asset integration
 * H) responsive behavior
 * I) existing architecture protection
 * J) regression validation
 * K) P1-P6
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
const illustrationsDir = path.join(assetsDir, 'illustrations');
const componentsDir = path.join(uiDir, 'components');
const pagesDir = path.join(uiDir, 'pages');
const designSpecPath = path.join(uiDir, 'DESIGN_SPECIFICATION.md');

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
  path.join(componentsDir, 'illustration.js'),
  path.join(componentsDir, 'card_header.js'),
  path.join(componentsDir, 'card_cta.js'),
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

const EXPECTED_ILLUSTRATION_FILES = [
  'companion-apologetic.webp', 'companion-greeting.webp', 'companion-inviting.webp', 'companion-observing.webp',
  'companion-progressing.webp', 'companion-recommending.webp', 'companion-reflecting.webp',
  'underline-honey.webp', 'underline-sage.webp', 'underline-terracotta.webp',
];

const ASSET_SLOT_TO_FILE = {
  greeting: 'companion-greeting.webp',
  observation: 'companion-observing.webp',
  recommendation: 'companion-recommending.webp',
  behaviorPatternPlaceholder: 'companion-reflecting.webp',
  progressPlaceholder: 'companion-progressing.webp',
  questionCard: 'companion-inviting.webp',
  errorGentle: 'companion-apologetic.webp',
};

// emoji偵測正則——用來確認"non-emoji presentation"這個規格要求
// 在Dashboard/Error Card輸出裡成立（Input Experience選項前綴
// 的極簡符號是刻意保留的例外，見question_card.js/input_page.js
// 的TASK1.115更新說明，這裡的測試會分開檢查兩種情境）。
const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

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
  const illustrationHelper = await import(path.join(componentsDir, 'illustration.js'));
  const cardHeaderHelper = await import(path.join(componentsDir, 'card_header.js'));
  const cardCtaHelper = await import(path.join(componentsDir, 'card_cta.js'));
  const componentsIndex = await import(path.join(componentsDir, 'index.js'));
  const dashboardPage = await import(path.join(pagesDir, 'dashboard_page.js'));
  const inputPage = await import(path.join(pagesDir, 'input_page.js'));
  const uiIndex = await import(path.join(uiDir, 'index.js'));
  const { createHealthInsightProductIntegration } = await import(integrationFilePath);
  const designSpec = fs.readFileSync(designSpecPath, 'utf8');

  // =========================================================================
  // A. reference image usage
  // =========================================================================
  console.log('--- A. reference image usage ---');

  await test('（1.reference image usage）src/ui/health_insight/assets/illustrations/ 目錄存在', () => {
    assert.ok(fs.existsSync(illustrationsDir));
  });

  await test('（1.reference image usage）illustrations/ 底下恰好有10個檔案，跟預期清單完全一致', () => {
    const files = fs.readdirSync(illustrationsDir).sort();
    assert.deepStrictEqual(files, [...EXPECTED_ILLUSTRATION_FILES].sort());
  });

  for (const file of EXPECTED_ILLUSTRATION_FILES) {
    await test(`（1.reference image usage）${file} 存在且檔案大小合理（非空、非過大，介於1KB~500KB）`, () => {
      const stat = fs.statSync(path.join(illustrationsDir, file));
      assert.ok(stat.size > 1024, `${file} 太小，可能是空檔案：${stat.size} bytes`);
      assert.ok(stat.size < 500 * 1024, `${file} 太大：${stat.size} bytes`);
    });
    await test(`${file} 是合法的WebP格式（RIFF...WEBP檔頭）`, () => {
      const buffer = fs.readFileSync(path.join(illustrationsDir, file));
      assert.strictEqual(buffer.slice(0, 4).toString('ascii'), 'RIFF');
      assert.strictEqual(buffer.slice(8, 12).toString('ascii'), 'WEBP');
    });
  }

  await test('（1.reference image usage）七張角色插畫每一張都對應ASSET_REGISTRY其中一個插槽（逐一比對檔名）', () => {
    for (const [slot, file] of Object.entries(ASSET_SLOT_TO_FILE)) {
      assert.strictEqual(assetRegistry.ASSET_REGISTRY[slot].file, file, `插槽${slot}對應的檔案不符`);
    }
  });

  await test('（1.reference image usage）三張手繪底線分別對應UNDERLINE_REGISTRY的terracotta/sage/honey三個顏色', () => {
    assert.strictEqual(assetRegistry.UNDERLINE_REGISTRY.terracotta.file, 'underline-terracotta.webp');
    assert.strictEqual(assetRegistry.UNDERLINE_REGISTRY.sage.file, 'underline-sage.webp');
    assert.strictEqual(assetRegistry.UNDERLINE_REGISTRY.honey.file, 'underline-honey.webp');
  });

  await test('（1.reference image usage）DESIGN_SPECIFICATION.md存在，且新增了Implementation Status Update章節記錄TASK1.115的落地狀態', () => {
    assert.ok(fs.existsSync(designSpecPath));
    assert.ok(designSpec.includes('Implementation Status Update'));
    assert.ok(designSpec.includes('TASK1.115'));
  });

  await test('（1.reference image usage）DESIGN_SPECIFICATION.md記錄的既有分析內容（拙趣/角色設定圖/Dashboard手機畫面）依然存在，本次任務是附加更新不是重寫', () => {
    assert.ok(designSpec.includes('拙趣'));
    assert.ok(designSpec.includes('角色設定圖'));
    assert.ok(designSpec.includes('Dashboard手機畫面') || designSpec.includes('Dashboard'));
  });

  await test('（1.reference image usage）asset_registry.js檔案頭說明了base64 vs一般檔案路徑的技術決策', () => {
    const src = fs.readFileSync(path.join(assetsDir, 'asset_registry.js'), 'utf8');
    assert.ok(src.includes('base64'));
    assert.ok(src.includes('一般檔案路徑') || src.includes('檔案路徑'));
  });

  console.log('');

  // =========================================================================
  // B. design-system consistency
  // =========================================================================
  console.log('--- B. design-system consistency ---');

  await test('（2.design-system consistency）COLOR_TOKENS新增sage/sageDark/sageLight三個鼠尾草綠token', () => {
    for (const key of ['sage', 'sageDark', 'sageLight']) {
      assert.ok(/^#[0-9A-Fa-f]{6}$/.test(designTokens.COLOR_TOKENS[key]), `${key}不是合法色碼`);
    }
  });

  await test('（2.design-system consistency）COLOR_TOKENS新增mutedBlue/mutedBlueDark/mutedBlueLight三個霧藍色token', () => {
    for (const key of ['mutedBlue', 'mutedBlueDark', 'mutedBlueLight']) {
      assert.ok(/^#[0-9A-Fa-f]{6}$/.test(designTokens.COLOR_TOKENS[key]), `${key}不是合法色碼`);
    }
  });

  await test('（2.design-system consistency）COLOR_TOKENS新增四個選項Chip循環色（terracotta/honey/sage/rose）', () => {
    for (const key of ['chipTerracotta', 'chipHoney', 'chipSage', 'chipRose']) {
      assert.ok(/^#[0-9A-Fa-f]{6}$/.test(designTokens.COLOR_TOKENS[key]), `${key}不是合法色碼`);
    }
  });

  await test('（2.design-system consistency）COLOR_TOKENS.caution調整成霧玫瑰色系（不再是TASK1.114原本偏赭石橘的色碼）', () => {
    assert.strictEqual(designTokens.COLOR_TOKENS.caution, '#C68B76');
  });

  await test('（2.design-system consistency）CARD_STYLE_TOKENS新增borderedBorder/borderedBoxShadow（Question Card專用邊框式變體）', () => {
    assert.ok(typeof designTokens.CARD_STYLE_TOKENS.borderedBorder === 'string');
    assert.ok(typeof designTokens.CARD_STYLE_TOKENS.borderedBoxShadow === 'string');
    assert.ok(designTokens.CARD_STYLE_TOKENS.borderedBorder.includes('2px'));
  });

  await test('（2.design-system consistency）getDesignSystemCSS()是deterministic（兩次呼叫結果完全相同）', () => {
    const css1 = designTokens.getDesignSystemCSS();
    const css2 = designTokens.getDesignSystemCSS();
    assert.strictEqual(css1, css2);
  });

  await test('（2.design-system consistency）getDesignSystemCSS()包含box-sizing reset規則', () => {
    const css = designTokens.getDesignSystemCSS();
    assert.ok(css.includes('box-sizing: border-box'));
  });

  const REQUIRED_CSS_CLASSES = [
    '.hi-card--bordered', '.hi-card-body', '.hi-illustration', '.hi-illustration--small',
    '.hi-title-row', '.hi-title-underline', '.hi-title-underline--muted',
    '.hi-card-cta', '.hi-card-cta--terracotta', '.hi-card-cta--sage', '.hi-card-cta--honey', '.hi-card-cta--muted',
    '.hi-chip', '.hi-chip--terracotta', '.hi-chip--honey', '.hi-chip--sage', '.hi-chip--rose',
    '.hi-dashboard-header', '.hi-dashboard-title', '.hi-dashboard-subtitle',
    '.hi-observation-list', '.hi-recommendation-list', '.hi-card-question', '.hi-choice-options',
    '.hi-input-row', '.hi-friendly-input', '.hi-input-unit', '.hi-primary-button',
  ];
  for (const cls of REQUIRED_CSS_CLASSES) {
    await test(`（2.design-system consistency）getDesignSystemCSS()包含"${cls}"樣式規則`, () => {
      const css = designTokens.getDesignSystemCSS();
      assert.ok(css.includes(cls), `CSS缺少樣式規則：${cls}`);
    });
  }

  await test('（2.design-system consistency）.hi-friendly-input/.hi-input-row/.hi-input-unit都有min-width:0或white-space:nowrap的溢位防護規則', () => {
    const css = designTokens.getDesignSystemCSS();
    const inputBlock = css.split(".hi-friendly-input {")[1].split('}')[0];
    assert.ok(inputBlock.includes('min-width: 0'));
    const unitBlock = css.split(".hi-input-unit {")[1].split('}')[0];
    assert.ok(unitBlock.includes('white-space: nowrap'));
  });

  console.log('');

  // =========================================================================
  // C. component refinement
  // =========================================================================
  console.log('--- C. component refinement ---');

  await test('（3.component refinement）illustration.js匯出createIllustration()，對已知插槽回傳<img>標籤', () => {
    const html = illustrationHelper.createIllustration('greeting');
    assert.ok(html.startsWith('<img'));
    assert.ok(html.includes('class="hi-illustration"'));
    assert.ok(html.includes('loading="lazy"'));
  });

  await test('（3.component refinement）createIllustration()支援small選項，加上hi-illustration--small類別', () => {
    const html = illustrationHelper.createIllustration('questionCard', { small: true });
    assert.ok(html.includes('hi-illustration--small'));
  });

  await test('（3.component refinement）createIllustration()對不存在的插槽安全回傳空字串，不拋出例外', () => {
    assert.doesNotThrow(() => illustrationHelper.createIllustration('nonexistent'));
    assert.strictEqual(illustrationHelper.createIllustration('nonexistent'), '');
  });

  await test('（3.component refinement）card_header.js的createCardHeader()對三種顏色回傳<img>底線，對muted回傳<span>虛線', () => {
    for (const color of ['terracotta', 'sage', 'honey']) {
      const html = cardHeaderHelper.createCardHeader({ title: '測試', underline: color });
      assert.ok(html.includes('<img class="hi-title-underline"'));
    }
    const mutedHtml = cardHeaderHelper.createCardHeader({ title: '測試', underline: 'muted' });
    assert.ok(mutedHtml.includes('hi-title-underline--muted'));
    assert.ok(!mutedHtml.includes('<img'));
  });

  await test('（3.component refinement）card_cta.js的createCardCta()產生按鈕但不綁定任何連結（延續建立但不接線既有模式）', () => {
    const html = cardCtaHelper.createCardCta({ label: '測試按鈕', accent: 'terracotta', action: 'test-action' });
    assert.ok(html.includes('<button type="button"'));
    assert.ok(html.includes('data-hi-action="test-action"'));
    assert.ok(!/href=/.test(html));
    assert.ok(!/onclick=/.test(html));
  });

  await test('（3.component refinement）health_summary_card.js使用createIllustration/createCardHeader/createCardCta三個共用輔助函式', () => {
    const src = readSrc(path.join(componentsDir, 'health_summary_card.js'));
    assert.ok(src.includes("from './illustration.js'"));
    assert.ok(src.includes("from './card_header.js'"));
    assert.ok(src.includes("from './card_cta.js'"));
  });

  for (const file of ['observation_card.js', 'recommendation_card.js', 'behavior_pattern_card.js', 'progress_card.js']) {
    await test(`（3.component refinement）${file} 使用createIllustration/createCardHeader/createCardCta三個共用輔助函式`, () => {
      const src = readSrc(path.join(componentsDir, file));
      assert.ok(src.includes("from './illustration.js'"));
      assert.ok(src.includes("from './card_header.js'"));
      assert.ok(src.includes("from './card_cta.js'"));
    });
  }

  await test('（3.component refinement）question_card.js/error_card.js使用createIllustration（不需要card_header/card_cta，因為問題卡跟錯誤卡不是Dashboard五張卡片之一）', () => {
    for (const file of ['question_card.js', 'error_card.js']) {
      const src = readSrc(path.join(componentsDir, file));
      assert.ok(src.includes("from './illustration.js'"), `${file}應該使用createIllustration`);
    }
  });

  await test('（3.component refinement）observation_card.js/recommendation_card.js的公開函式改成接受完整陣列、回傳單一張卡片（不是每筆一張）', () => {
    const observationHtml = componentsIndex.createObservationCard([{ type: 'activity_count', value: 3 }, { type: 'nutrition_count', value: 5 }]);
    const recommendationHtml = componentsIndex.createRecommendationCard([{ type: 'insight_count', value: 6 }, { type: 'analysis_status', value: 'ok' }]);
    assert.strictEqual((observationHtml.match(/class="hi-card hi-observation-card/g) || []).length, 1);
    assert.strictEqual((recommendationHtml.match(/class="hi-card hi-recommendation-card/g) || []).length, 1);
  });

  await test('（3.component refinement）舊名稱createObservationCardList/createRecommendationCardList依然存在，作為向下相容轉發（deprecated但可用）', () => {
    const items = [{ type: 'activity_count', value: 3 }];
    assert.strictEqual(componentsIndex.createObservationCardList(items), componentsIndex.createObservationCard(items));
    assert.strictEqual(componentsIndex.createRecommendationCardList(items), componentsIndex.createRecommendationCard(items));
  });

  await test('（3.component refinement）question_card.js的選項Chip依位置循環使用四個顏色（terracotta/honey/sage/rose），不是依語意判斷', () => {
    const html = componentsIndex.createChoiceQuestionCard({
      fieldKey: 'test',
      question: 'q',
      options: [
        { value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }, { value: 'd', label: 'D' }, { value: 'e', label: 'E' },
      ],
    });
    assert.ok(html.includes('hi-chip--terracotta'));
    assert.ok(html.includes('hi-chip--honey'));
    assert.ok(html.includes('hi-chip--sage'));
    assert.ok(html.includes('hi-chip--rose'));
    // 第5個選項（index=4）應該循環回terracotta（4 % 4 === 0）
    const lines = html.split('\n').filter((l) => l.includes('hi-chip--'));
    assert.strictEqual(lines.length, 5);
    assert.ok(lines[0].includes('hi-chip--terracotta'));
    assert.ok(lines[4].includes('hi-chip--terracotta'));
  });

  await test('（3.component refinement）question_card.js的Choice/Input Question Card都使用.hi-card--bordered邊框式樣式（不是Dashboard的陰影式）', () => {
    const choiceHtml = componentsIndex.createChoiceQuestionCard({ fieldKey: 'x', question: 'q', options: [] });
    const inputHtml = componentsIndex.createInputQuestionCard({ fieldKey: 'y', question: 'q' });
    assert.ok(choiceHtml.includes('hi-card--bordered'));
    assert.ok(inputHtml.includes('hi-card--bordered'));
  });

  await test('（3.component refinement）behavior_pattern_card.js/progress_card.js都使用underline: "muted"（霧藍色虛線，不是三色手繪底線圖片）', () => {
    for (const file of ['behavior_pattern_card.js', 'progress_card.js']) {
      const src = readSrc(path.join(componentsDir, file));
      assert.ok(/underline:\s*['"]muted['"]/.test(src), `${file}應該使用muted底線`);
    }
  });

  console.log('');

  // =========================================================================
  // D. non-emoji presentation
  // =========================================================================
  console.log('--- D. non-emoji presentation ---');

  await test('（4.non-emoji presentation）Dashboard成功畫面完全不含emoji字元（除了<style>區塊，只檢查卡片內容）', () => {
    const html = dashboardPage.renderHealthInsightDashboard({ healthObservation: [{ type: 'activity_count', value: 3 }], recommendation: [{ type: 'insight_count', value: 1 }] });
    const bodyOnly = html.split('</style>')[1];
    assert.ok(!EMOJI_PATTERN.test(bodyOnly), 'Dashboard內容不應該包含emoji');
  });

  await test('（4.non-emoji presentation）Error Card完全不含emoji字元', () => {
    const html = componentsIndex.createErrorCard('internal_error');
    assert.ok(!EMOJI_PATTERN.test(html));
  });

  await test('（4.non-emoji presentation）Health Summary/Observation/Recommendation/Behavior/Progress五張卡片都改用<img class="hi-illustration">呈現插畫，不再有hi-card-icon這個TASK1.114舊版emoji容器類別', () => {
    const htmls = [
      componentsIndex.createHealthSummaryCard({}),
      componentsIndex.createObservationCard([]),
      componentsIndex.createRecommendationCard([]),
      componentsIndex.createBehaviorPatternPlaceholderCard(),
      componentsIndex.createProgressPlaceholderCard(),
    ];
    for (const html of htmls) {
      assert.ok(html.includes('<img class="hi-illustration"'), '應該包含真實插畫<img>標籤');
      assert.ok(!html.includes('hi-card-icon'), '不應該再有舊版emoji容器類別');
    }
  });

  await test('（4.non-emoji presentation）asset_registry.js的ASSET_REGISTRY不再包含emoji佔位符欄位（只有description/file/alt）', () => {
    for (const key of Object.keys(assetRegistry.ASSET_REGISTRY)) {
      const entry = assetRegistry.ASSET_REGISTRY[key];
      assert.deepStrictEqual(Object.keys(entry).sort(), ['alt', 'description', 'file']);
      assert.ok(!EMOJI_PATTERN.test(entry.file));
    }
  });

  await test('（4.non-emoji presentation）getAssetPlaceholder()（向下相容函式）不再回傳emoji，回傳的是文字描述（alt文字）', () => {
    for (const key of assetRegistry.listAssetKeys()) {
      const placeholder = assetRegistry.getAssetPlaceholder(key);
      assert.ok(!EMOJI_PATTERN.test(placeholder), `getAssetPlaceholder(${key})不應該回傳emoji：${placeholder}`);
      assert.strictEqual(placeholder, assetRegistry.getAssetAlt(key));
    }
  });

  await test('（4.non-emoji presentation）Input Experience選項前綴的極簡符號是刻意保留的例外（跟"emoji佔位插畫"性質不同），文件裡有明確說明這個區分', () => {
    const rawSrc = fs.readFileSync(path.join(componentsDir, 'question_card.js'), 'utf8');
    assert.ok(rawSrc.includes('non-emoji'));
    assert.ok(rawSrc.includes('選項前綴'));
  });

  console.log('');

  // =========================================================================
  // E. visual-boundary consistency
  // =========================================================================
  console.log('--- E. visual-boundary consistency ---');

  for (const file of UI_JS_FILES) {
    const relName = path.relative(repoRoot, file);
    await test(`（5.visual-boundary consistency）${relName} 完全不import src/intelligence/底下任何檔案（Intelligence Boundary重新確認）`, () => {
      const src = readSrc(file);
      assert.ok(!/from\s+['"].*\/intelligence\//.test(src), `${relName} 不應該import intelligence/`);
    });
    await test(`（5.visual-boundary consistency）${relName} 完全不import src/db/、src/auth/、src/oauth/、src/middleware/`, () => {
      const src = readSrc(file);
      for (const subdir of ['db', 'auth', 'oauth', 'middleware']) {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      }
    });
    await test(`（5.visual-boundary consistency）${relName} 完全不import src/routes/、src/controllers/、worker.js`, () => {
      const src = readSrc(file);
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
      assert.ok(!/worker\.js/.test(src));
    });
  }

  await test('（5.visual-boundary consistency）端對端：真實Health Insight Integration產出的結果被Dashboard呈現時，不暴露"orchestration"/"health_insight"這類Capability/Feature內部標籤字串', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const html = dashboardPage.renderHealthInsightDashboard(result.result);
    assert.ok(!html.includes('"orchestration"'));
    assert.ok(!html.includes('"health_insight"'));
    assert.ok(!html.includes('"boundary"'));
  });

  await test('（5.visual-boundary consistency）端對端：不暴露internal capability structure（source欄位標籤本身完全被過濾掉）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const html = dashboardPage.renderHealthInsightDashboard(result.result);
    assert.ok(!html.includes('"source"'));
    assert.ok(!html.includes('data-source'));
  });

  await test('（5.visual-boundary consistency）端對端：不暴露execution details（五階段lifecycle標記完全不出現）', () => {
    const integration = createHealthInsightProductIntegration();
    const result = integration.requestProductEntry({ rawInput: makeInsightRawInput() });
    const html = dashboardPage.renderHealthInsightDashboard(result.result);
    for (const stageWord of ['request_received', 'validation_completed', 'execution_started', 'execution_completed']) {
      assert.ok(!html.includes(stageWord));
    }
  });

  await test('（5.visual-boundary consistency）端對端：失敗結果被Error Card呈現時完全不暴露reason/field/stage原始字串', () => {
    const integration = createHealthInsightProductIntegration();
    const failure = integration.requestProductEntry({});
    const html = dashboardPage.renderHealthInsightDashboardError(failure);
    assert.ok(!html.includes(failure.reason));
  });

  console.log('');

  // =========================================================================
  // F. UX-flow consistency
  // =========================================================================
  console.log('--- F. UX-flow consistency ---');

  await test('（6.UX-flow consistency）Dashboard新增標題區塊，包含主標題/副標題/歡迎插畫', () => {
    const html = dashboardPage.renderHealthInsightDashboard({});
    assert.ok(html.includes('hi-dashboard-header'));
    assert.ok(html.includes('今天的健康小洞察'));
    assert.ok(html.includes('陪你慢慢理解自己'));
  });

  await test('（6.UX-flow consistency）Input Experience新增標題區塊，包含主標題/副標題/邀請插畫', () => {
    const html = inputPage.renderHealthInsightInputExperience();
    assert.ok(html.includes('hi-dashboard-header'));
    assert.ok(html.includes('今天想從哪裡開始？'));
  });

  await test('（6.UX-flow consistency）Input Experience底部新增大型CTA送出按鈕，純樣式沒有綁定任何送出邏輯', () => {
    const html = inputPage.renderHealthInsightInputExperience();
    assert.ok(html.includes('hi-primary-button'));
    assert.ok(html.includes('開始記錄今天'));
    assert.ok(!/onclick=/.test(html));
  });

  const REQUIRED_CTA_LABELS = ['查看詳細紀錄', '查看更多分析', '我知道了', '敬請期待'];
  for (const label of REQUIRED_CTA_LABELS) {
    await test(`（6.UX-flow consistency）Dashboard包含CTA標籤"${label}"`, () => {
      const html = dashboardPage.renderHealthInsightDashboard({ healthObservation: [], recommendation: [] });
      assert.ok(html.includes(label), `Dashboard缺少CTA：${label}`);
    });
  }

  await test('（6.UX-flow consistency）五張Dashboard卡片各自使用正確的底線顏色（Summary=terracotta/Observation=sage/Recommendation=honey/BehaviorPattern與Progress=muted）', () => {
    const summarySrc = readSrc(path.join(componentsDir, 'health_summary_card.js'));
    const observationSrc = readSrc(path.join(componentsDir, 'observation_card.js'));
    const recommendationSrc = readSrc(path.join(componentsDir, 'recommendation_card.js'));
    assert.ok(/underline:\s*['"]terracotta['"]/.test(summarySrc));
    assert.ok(/underline:\s*['"]sage['"]/.test(observationSrc));
    assert.ok(/underline:\s*['"]honey['"]/.test(recommendationSrc));
  });

  await test('（6.UX-flow consistency）五張Dashboard卡片各自使用正確的CTA強調色（跟底線顏色一致）', () => {
    const summarySrc = readSrc(path.join(componentsDir, 'health_summary_card.js'));
    const observationSrc = readSrc(path.join(componentsDir, 'observation_card.js'));
    const recommendationSrc = readSrc(path.join(componentsDir, 'recommendation_card.js'));
    const behaviorSrc = readSrc(path.join(componentsDir, 'behavior_pattern_card.js'));
    const progressSrc = readSrc(path.join(componentsDir, 'progress_card.js'));
    assert.ok(/accent:\s*['"]terracotta['"]/.test(summarySrc));
    assert.ok(/accent:\s*['"]sage['"]/.test(observationSrc));
    assert.ok(/accent:\s*['"]honey['"]/.test(recommendationSrc));
    assert.ok(/accent:\s*['"]muted['"]/.test(behaviorSrc));
    assert.ok(/accent:\s*['"]muted['"]/.test(progressSrc));
  });

  await test('（6.UX-flow consistency）Input Experience的Gender/Health Goal選擇問題各自的選項數量符合TASK1.107既有定義（gender 3個，healthGoal 4個）', () => {
    const html = inputPage.renderHealthInsightInputExperience();
    assert.strictEqual((html.match(/data-field="gender"/g) || []).length >= 1, true);
    assert.strictEqual((html.match(/data-value="weight_loss"/g) || []).length, 1);
    assert.strictEqual((html.match(/data-value="weight_maintenance"/g) || []).length, 1);
    assert.strictEqual((html.match(/data-value="muscle_gain"/g) || []).length, 1);
    assert.strictEqual((html.match(/data-value="healthy_lifestyle"/g) || []).length, 1);
  });

  console.log('');

  // =========================================================================
  // G. asset integration
  // =========================================================================
  console.log('--- G. asset integration ---');

  await test('（7.asset integration）ASSET_BASE_PATH是字串常數，以斜線開頭跟結尾', () => {
    assert.strictEqual(typeof assetRegistry.ASSET_BASE_PATH, 'string');
    assert.ok(assetRegistry.ASSET_BASE_PATH.startsWith('/'));
    assert.ok(assetRegistry.ASSET_BASE_PATH.endsWith('/'));
  });

  for (const key of Object.keys(ASSET_SLOT_TO_FILE)) {
    await test(`（7.asset integration）getAssetUrl("${key}")回傳ASSET_BASE_PATH+對應檔名的完整路徑`, () => {
      const url = assetRegistry.getAssetUrl(key);
      assert.strictEqual(url, assetRegistry.ASSET_BASE_PATH + ASSET_SLOT_TO_FILE[key]);
    });
    await test(`（7.asset integration）getAssetAlt("${key}")回傳非空的無障礙替代文字`, () => {
      const alt = assetRegistry.getAssetAlt(key);
      assert.ok(typeof alt === 'string' && alt.length > 0);
    });
  }

  for (const color of ['terracotta', 'sage', 'honey']) {
    await test(`（7.asset integration）getUnderlineUrl("${color}")回傳正確的完整路徑`, () => {
      const url = assetRegistry.getUnderlineUrl(color);
      assert.strictEqual(url, assetRegistry.ASSET_BASE_PATH + assetRegistry.UNDERLINE_REGISTRY[color].file);
    });
  }

  await test('（7.asset integration）getAssetUrl()/getUnderlineUrl()對不存在的key安全回傳空字串，不拋出例外', () => {
    assert.doesNotThrow(() => assetRegistry.getAssetUrl('nonexistent'));
    assert.strictEqual(assetRegistry.getAssetUrl('nonexistent'), '');
    assert.doesNotThrow(() => assetRegistry.getUnderlineUrl('nonexistent'));
    assert.strictEqual(assetRegistry.getUnderlineUrl('nonexistent'), '');
  });

  await test('（7.asset integration）listUnderlineKeys()回傳恰好三個顏色名稱', () => {
    assert.deepStrictEqual(assetRegistry.listUnderlineKeys().sort(), ['honey', 'sage', 'terracotta']);
  });

  await test('（7.asset integration）每一個ASSET_REGISTRY插槽對應的檔案實際存在於illustrations/目錄', () => {
    for (const key of assetRegistry.listAssetKeys()) {
      const filePath = path.join(illustrationsDir, assetRegistry.ASSET_REGISTRY[key].file);
      assert.ok(fs.existsSync(filePath), `插槽${key}對應的檔案不存在：${filePath}`);
    }
  });

  await test('（7.asset integration）每一個UNDERLINE_REGISTRY顏色對應的檔案實際存在於illustrations/目錄', () => {
    for (const key of assetRegistry.listUnderlineKeys()) {
      const filePath = path.join(illustrationsDir, assetRegistry.UNDERLINE_REGISTRY[key].file);
      assert.ok(fs.existsSync(filePath), `顏色${key}對應的檔案不存在：${filePath}`);
    }
  });

  await test('（7.asset integration）頂層index.js正確re-export ASSET_BASE_PATH/UNDERLINE_REGISTRY/getAssetUrl/getUnderlineUrl', () => {
    assert.strictEqual(typeof uiIndex.ASSET_BASE_PATH, 'string');
    assert.strictEqual(typeof uiIndex.UNDERLINE_REGISTRY, 'object');
    assert.strictEqual(typeof uiIndex.getAssetUrl, 'function');
    assert.strictEqual(typeof uiIndex.getUnderlineUrl, 'function');
  });

  console.log('');

  // =========================================================================
  // H. responsive behavior
  // =========================================================================
  console.log('--- H. responsive behavior ---');

  await test('（8.responsive behavior）BREAKPOINT_TOKENS維持mobile/tablet/desktop三個既有斷點', () => {
    assert.strictEqual(designTokens.BREAKPOINT_TOKENS.tablet, '680px');
    assert.strictEqual(designTokens.BREAKPOINT_TOKENS.desktop, '1024px');
  });

  await test('（8.responsive behavior）CSS在tablet斷點調整.hi-illustration尺寸變大（104px），確保插畫在更大螢幕上保持適當比例', () => {
    const css = designTokens.getDesignSystemCSS();
    const afterTabletQuery = css.split(`@media (min-width: ${designTokens.BREAKPOINT_TOKENS.tablet}) {`)[1];
    const tabletBlock = afterTabletQuery.split(`@media (min-width: ${designTokens.BREAKPOINT_TOKENS.desktop})`)[0];
    assert.ok(tabletBlock.includes('104px'));
  });

  await test('（8.responsive behavior）desktop斷點同時限制.hi-dashboard跟.hi-input-experience的max-width，維持單欄置中（不是多欄網格）', () => {
    const css = designTokens.getDesignSystemCSS();
    const desktopBlock = css.split(`@media (min-width: ${designTokens.BREAKPOINT_TOKENS.desktop}) {`)[1];
    assert.ok(desktopBlock.includes('.hi-dashboard { max-width: 720px'));
    assert.ok(desktopBlock.includes('.hi-input-experience { max-width: 720px'));
  });

  await test('（8.responsive behavior）.hi-illustration使用object-fit:contain，確保圖片在不同尺寸下不變形', () => {
    const css = designTokens.getDesignSystemCSS();
    const block = css.split('.hi-illustration {')[1].split('}')[0];
    assert.ok(block.includes('object-fit: contain'));
  });

  await test('（8.responsive behavior）.hi-card使用flex排版，插畫跟文字區塊可以在不同寬度下正確換行對齊', () => {
    const css = designTokens.getDesignSystemCSS();
    const block = css.split('.hi-card {')[1].split('}')[0];
    assert.ok(block.includes('display: flex'));
  });

  console.log('');

  // =========================================================================
  // I. existing architecture protection
  // =========================================================================
  console.log('--- I. existing architecture protection ---');

  await test('（9.existing architecture protection）src/worker.js既有TASK1.21~1.38路由分派邏輯/legacy handler完全沒有被修改（TASK1.116後更新：TASK1.116在檔案末尾新增GET /health-insight、POST /api/health-insight兩個if區塊，這是本次任務明確授權的Route connection範圍，不再要求整個檔案零diff，改成驗證既有邏輯的具體內容標記依然逐字存在）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('const DATA_API_PATHS = new Set(['));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/api/timeline')"));
    assert.ok(workerSource.includes('async function handle(r,env){'));
    assert.ok(workerSource.includes("if(p==='/api/qlive'){"));
  });

  await test('（9.existing architecture protection）src/bootstrap/application.js完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.existing architecture protection）app.intelligence物件恰好維持24個欄位不變', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（9.existing architecture protection）app.router.routes 數量沒有因為本次任務而改變（維持21個既有route；TASK1.116後更新：TASK1.116是本系列第一個明確被授權做"Route connection"的任務，正式新增GET /health-insight、POST /api/health-insight兩條路由，21+2=23）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 23);
  });

  await test('（9.existing architecture protection）src/routes/、src/controllers/既有檔案完全沒有被修改，只新增Health Insight專屬的新檔案（TASK1.116後更新：TASK1.116新增src/routes/health_insight_routes.js、src/controllers/health_insight_controller.js，並在src/routes/index.js新增對應的import/register一行，這是本次任務明確授權的Route connection範圍，這裡改成驗證既有路由/controller檔案本身逐一沒有被修改）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/auth_routes.js src/routes/user_routes.js src/routes/data_routes.js src/routes/dashboard_routes.js src/routes/profile_routes.js src/routes/timeline_routes.js src/routes/legacy_routes.js src/routes/router.js src/controllers/auth_controller.js src/controllers/dashboard_controller.js src/controllers/data_controller.js src/controllers/profile_controller.js src/controllers/timeline_controller.js src/controllers/user_controller.js src/controllers/response.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.existing architecture protection）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.existing architecture protection）migrations/、src/db/ 目錄除了TASK1.120明確授權新增的Health Insight persistence層之外，完全沒有其他檔案被新增或修改（TASK1.120後更新）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/ src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('0007_phase6_task1_120') && !line.includes('health_insight_records.js') && !line.includes('src/db/index.js')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  for (const layer of EXISTING_LAYERS) {
    await test(`（9.existing architecture protection）${layer.name} 目錄本次任務完全沒有任何檔案被修改`, () => {
      const status = execFileSync('git', ['status', '--porcelain', layer.dir], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(status.trim(), '');
    });
    await test(`（9.existing architecture protection）${layer.name} 目錄恰好維持既有的檔案清單`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  // 逐檔案重新確認：五個Product Boundary + Phase 4五層Capability +
  // Health Insight Feature，合計34個既有production程式碼檔案，
  // 本次視覺整合任務完全沒有修改過其中任何一個位元組，也重新
  // 確認這些既有檔案本身依然遵守Phase 1~6系列反覆確認的邊界
  // 規則（跟UI檔案完全無關，UI只讀取這些邊界產出的最終結果）。
  const EXISTING_SCANNED_FILES = EXISTING_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));
  for (const { layer, file, full } of EXISTING_SCANNED_FILES) {
    await test(`（9.existing architecture protection）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });

    const src = readSrc(full);

    await test(`（9.existing architecture protection）${layer}/${file} 完全不import src/db/（重新確認既有邊界）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });

    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（9.existing architecture protection）${layer}/${file} 完全不import src/${subdir}/（重新確認既有邊界）`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }

    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（9.existing architecture protection）${layer}/${file} 不含身分相關字樣 ${pattern}（重新確認既有邊界）`, () => {
        assert.ok(!pattern.test(src));
      });
    }

    await test(`（9.existing architecture protection）${layer}/${file} 完全沒有呼叫fetch()（重新確認既有邊界）`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });

    await test(`（9.existing architecture protection）${layer}/${file} 完全不呼叫Date.now()/Math.random()（重新確認既有邊界，deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });

    for (const pattern of AI_KEYWORDS) {
      await test(`（9.existing architecture protection）${layer}/${file} 的實際程式碼不含AI相關關鍵字樣 ${pattern}（重新確認既有邊界）`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
  }

  await test('（9.existing architecture protection）src/intelligence/product/health_insight_integration.js（TASK1.112）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/health_insight_integration.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.existing architecture protection）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', orchestrationRuntimeDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.existing architecture protection）src/intelligence/analysis/（Analysis Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', analysisDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.existing architecture protection）src/intelligence/recommendation/（Recommendation Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', recommendationDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.existing architecture protection）Phase 4 Capability Architecture（capabilities/整個目錄樹）本次任務完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', capabilitiesDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.existing architecture protection）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  for (const file of UI_JS_FILES) {
    const relName = path.relative(repoRoot, file);
    for (const pattern of AI_KEYWORDS) {
      await test(`（9.existing architecture protection）${relName} 的實際程式碼不含AI相關關鍵字樣 ${pattern}（Gemini not integrated）`, () => {
        const src = readSrc(file);
        assert.ok(!pattern.test(src), `${relName} 出現疑似AI相關字樣：${pattern}`);
      });
    }
  }

  await test('（9.existing architecture protection）wrangler.toml完全沒有新增任何AI相關的環境變數/binding，也完全沒有被修改', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i, /GEMINI/i]) {
      assert.ok(!pattern.test(content));
    }
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.existing architecture protection）package.json完全沒有新增任何AI SDK依賴，也完全沒有被修改', () => {
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
  // J. regression validation
  // =========================================================================
  console.log('--- J. regression validation ---');

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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase6-task1.115-health-insight-visual-integration')) {
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
  // K. P1-P6
  // =========================================================================
  console.log('--- K. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何既有UI/getHTML()相關程式碼，既有UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改（TASK1.116後更新：見上方"existing architecture protection"章節已經改用內容標記比對，這裡額外確認legacy getHTML()函式本身逐字沒有被修改，既有UI維持不變）', () => {
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

  await test('（P1-P6）src/auth/、src/oauth/ 完全沒有被本次任務修改，src/routes/、src/controllers/既有檔案也沒有被修改（TASK1.116後更新：見上方"existing architecture protection"章節已針對routes/controllers做過檔案範圍限定的diff檢查，這裡額外確認src/auth/、src/oauth/兩個目錄完全沒有被觸碰）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

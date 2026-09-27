/*
 * Phase 6 TASK 1.107｜Health Insight Data Input Boundary
 * Definition 測試
 *
 * 本任務是產品架構定義任務——不實作任何production功能、不
 * 建立database schema、不建立UI、不整合任何AI。目的是驗證
 * `PHASE6_HEALTH_INSIGHT_INPUT_BOUNDARY_PLAN.md`完整涵蓋規格
 * 要求的9個章節，並重新確認Phase 1~5既有架構（五個Product
 * Boundary、Phase 4 Capability Chain、app.intelligence/
 * router/worker.js/database）完全沒有被本次任務影響。
 *
 * 分為以下13個部分：
 * A) Input boundary definition
 * B) User profile data
 * C) Health goal data
 * D) Daily behavior data
 * E) Measurement data
 * F) Required/optional classification
 * G) Validation responsibility
 * H) Privacy boundary
 * I) Intelligence mapping
 * J) Future extension
 * K) Gemini boundary
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
const productEntryDir = path.join(productDir, 'entry');
const productContractDir = path.join(productDir, 'contract');
const productAdapterDir = path.join(productDir, 'adapter');
const productExecutionDir = path.join(productDir, 'execution');
const productOperationalDir = path.join(productDir, 'operational');
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
const productPlanDocPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_PRODUCT_PLAN.md');
const docPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_INPUT_BOUNDARY_PLAN.md');

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

const PRODUCT_LAYERS = [
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
const ALL_LAYERS = [...PRODUCT_LAYERS, ...PHASE4_LAYERS];
const ALL_SCANNED_FILES = ALL_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));
const PRODUCT_LAYER_NAMES = PRODUCT_LAYERS.map((l) => l.name);
const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution', 'capabilities', 'analysis', 'recommendation', 'application'];
const AI_KEYWORDS = [
  /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i, /gemini/i,
  /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
  /model\s*[:=]\s*['"]/i, /inference/i, /prompt/i,
];

async function run() {
  const doc = fs.readFileSync(docPath, 'utf8');
  const flatDoc = doc.replace(/\n/g, ' ');

  // =========================================================================
  // A. Input boundary definition
  // =========================================================================
  console.log('--- A. Input boundary definition ---');

  await test('（1.Input boundary definition）文件存在且非空', () => {
    const stat = fs.statSync(docPath);
    assert.ok(stat.isFile());
    assert.ok(stat.size > 0);
  });

  const REQUIRED_DOC_SECTIONS = [
    'Input Boundary Goal', 'Input Data Categories', 'Required vs Optional Data Boundary', 'Input Validation Responsibility',
    'Data Privacy Boundary', 'Intelligence Mapping', 'Future Extension Boundary', 'Free vs Premium Input Direction', 'Gemini Future Boundary',
  ];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.Input boundary definition）文件包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.Input boundary definition）文件記錄"為什麼Health Insight需要輸入資料"（沒有輸入資料就沒有東西可以分析）', () => {
    assert.ok(/沒有輸入資料/.test(doc) || /沒有\s*輸入資料/.test(flatDoc));
  });

  await test('（1.Input boundary definition）文件記錄使用者資料是Analysis Capability的原料，不是Intelligence Analysis本身', () => {
    assert.ok(/原料/.test(doc));
  });

  await test('（1.Input boundary definition）文件明確區分Raw Data跟Intelligence Input的差異', () => {
    assert.ok(doc.includes('Raw Data'));
    assert.ok(doc.includes('Intelligence Input'));
  });

  await test('（1.Input boundary definition）文件確認Raw Data→Intelligence Input轉換歸屬Product Feature層，不歸屬Phase 5既有五個Boundary', () => {
    assert.ok(/歸屬\s*\*{0,2}Product\s*Feature層/.test(flatDoc));
    assert.ok(/不歸屬\*{0,2}Phase\s*5既有的五個\s*Product\s*Boundary/.test(flatDoc));
  });

  await test('（1.Input boundary definition）文件記錄跟TASK1.106的關係（延伸TASK1.106第7節的九個欄位）', () => {
    assert.ok(doc.includes('TASK1.106'));
  });

  console.log('');

  // =========================================================================
  // B. User profile data
  // =========================================================================
  console.log('--- B. User profile data ---');

  await test('（2.User profile data）文件包含「A. User Profile Data」小節', () => {
    assert.ok(doc.includes('User Profile Data'));
  });

  const REQUIRED_PROFILE_FIELDS = ['age', 'gender', 'height', 'weight'];
  for (const field of REQUIRED_PROFILE_FIELDS) {
    await test(`（2.User profile data）Required欄位包含"${field}"`, () => {
      const section = (doc.split('### A. User Profile Data')[1] || '').split('### B. Health Goal Data')[0];
      const requiredSection = section.split('**Required Fields')[1].split('**Optional Fields')[0];
      assert.ok(requiredSection.includes(`\`${field}\``), `Required欄位缺少：${field}`);
    });
  }

  await test('（2.User profile data）Optional欄位包含body information（bodyInformation）', () => {
    const section = (doc.split('### A. User Profile Data')[1] || '').split('### B. Health Goal Data')[0];
    const optionalSection = section.split('**Optional Fields')[1].split('**Future Extension Fields')[0];
    assert.ok(optionalSection.includes('bodyInformation'));
  });

  await test('（2.User profile data）文件記錄Future Extension Fields的存在（病史/過敏/用藥等，但不具體列出強制清單）', () => {
    const section = (doc.split('### A. User Profile Data')[1] || '').split('### B. Health Goal Data')[0];
    assert.ok(section.includes('Future Extension Fields'));
    assert.ok(section.includes('病史'));
  });

  await test('（2.User profile data）文件解釋age/gender/height/weight歸屬Required的理由（計算基礎健康指標的必要輸入）', () => {
    const section = (doc.split('### A. User Profile Data')[1] || '').split('### B. Health Goal Data')[0];
    assert.ok(section.includes('BMI') || section.includes('基礎代謝率'));
  });

  console.log('');

  // =========================================================================
  // C. Health goal data
  // =========================================================================
  console.log('--- C. Health goal data ---');

  await test('（3.Health goal data）文件包含「B. Health Goal Data」小節', () => {
    assert.ok(doc.includes('Health Goal Data'));
  });

  const REQUIRED_GOALS = ['weight loss', 'weight maintenance', 'muscle gain', 'healthy lifestyle'];
  for (const goal of REQUIRED_GOALS) {
    await test(`（3.Health goal data）Possible Goals包含"${goal}"`, () => {
      const section = (doc.split('### B. Health Goal Data')[1] || '').split('### C. Daily Behavior Data')[0];
      assert.ok(section.includes(goal), `Goals清單缺少：${goal}`);
    });
  }

  await test('（3.Health goal data）文件記錄Goal Ownership：目標由使用者自己設定，系統不替使用者決定', () => {
    const section = (doc.split('### B. Health Goal Data')[1] || '').split('### C. Daily Behavior Data')[0];
    assert.ok(section.includes('Goal Ownership'));
    assert.ok(/由使用者自己設定/.test(section.replace(/\n/g, ' ')));
  });

  await test('（3.Health goal data）文件記錄Goal Impact on Recommendation：不同Goal影響Recommendation解讀方向，但不修改Recommendation Runner', () => {
    const section = (doc.split('### B. Health Goal Data')[1] || '').split('### C. Daily Behavior Data')[0];
    assert.ok(section.includes('Goal Impact on Recommendation'));
    assert.ok(section.includes('Recommendation Runner'));
  });

  console.log('');

  // =========================================================================
  // D. Daily behavior data
  // =========================================================================
  console.log('--- D. Daily behavior data ---');

  await test('（4.Daily behavior data）文件包含「C. Daily Behavior Data」小節', () => {
    assert.ok(doc.includes('Daily Behavior Data'));
  });

  const REQUIRED_FOOD_FIELDS = ['breakfast', 'lunch', 'dinner', 'snacks'];
  for (const field of REQUIRED_FOOD_FIELDS) {
    await test(`（4.Daily behavior data）Food欄位包含"${field}"`, () => {
      const section = (doc.split('### C. Daily Behavior Data')[1] || '').split('### D. Measurement Data')[0];
      const foodSection = section.split('**Food')[1].split('**Activity')[0];
      assert.ok(foodSection.includes(`\`${field}\``), `Food欄位缺少：${field}`);
    });
  }

  await test('（4.Daily behavior data）Activity欄位包含exercise跟walking/activityLevel', () => {
    const section = (doc.split('### C. Daily Behavior Data')[1] || '').split('### D. Measurement Data')[0];
    const activitySection = section.split('**Activity')[1].split('**Lifestyle')[0];
    assert.ok(activitySection.includes('exercise'));
    assert.ok(activitySection.includes('walking'));
  });

  await test('（4.Daily behavior data）Lifestyle欄位包含sleep跟waterIntake', () => {
    const section = (doc.split('### C. Daily Behavior Data')[1] || '').split('### D. Measurement Data')[0];
    const lifestyleSection = section.split('**Lifestyle')[1] || '';
    assert.ok(lifestyleSection.includes('sleep'));
    assert.ok(lifestyleSection.includes('waterIntake'));
  });

  await test('（4.Daily behavior data）文件明確聲明本次任務不建立任何database表', () => {
    const section = (doc.split('### C. Daily Behavior Data')[1] || '').split('### D. Measurement Data')[0].replace(/\n/g, ' ');
    assert.ok(/不建立任何\s*database表/.test(section) || /不\*{0,2}建立任何\s*database表/.test(section));
  });

  console.log('');

  // =========================================================================
  // E. Measurement data
  // =========================================================================
  console.log('--- E. Measurement data ---');

  await test('（5.Measurement data）文件包含「D. Measurement Data」小節', () => {
    assert.ok(doc.includes('Measurement Data'));
  });

  const REQUIRED_MEASUREMENTS = ['weightTrend', 'bodyMeasurement', 'progressTracking'];
  for (const m of REQUIRED_MEASUREMENTS) {
    await test(`（5.Measurement data）Possible Measurements包含"${m}"`, () => {
      const section = (doc.split('### D. Measurement Data')[1] || '').split('## 3.')[0];
      assert.ok(section.includes(m), `Measurements清單缺少：${m}`);
    });
  }

  await test('（5.Measurement data）文件明確區分V1 Requirement（只需要weightTrend）跟Future Extension（bodyMeasurement/progressTracking）', () => {
    const section = (doc.split('### D. Measurement Data')[1] || '').split('## 3.')[0];
    assert.ok(section.includes('Current V1 Requirement') || section.includes('V1需求'));
    assert.ok(section.includes('Future Extension'));
  });

  await test('（5.Measurement data）文件解釋weightTrend不需要額外輸入（衍生自User Profile Data既有的weight欄位）', () => {
    const section = (doc.split('### D. Measurement Data')[1] || '').split('## 3.')[0].replace(/\n/g, ' ');
    assert.ok(/weight.*既有\s*欄位/.test(section) || section.includes('不是一個全新的輸入項目'));
  });

  console.log('');

  // =========================================================================
  // F. Required/optional classification
  // =========================================================================
  console.log('--- F. Required/optional classification ---');

  await test('（6.Required/optional classification）文件包含「3. Required vs Optional Data Boundary」章節', () => {
    assert.ok(doc.includes('Required vs Optional Data Boundary'));
  });

  await test('（6.Required/optional classification）文件定義Required = 產生最小可用Health Insight所必須的資料', () => {
    assert.ok(/最小可用Health\s*Insight/.test(doc));
  });

  await test('（6.Required/optional classification）文件定義Optional = 能提升分析品質、但非必要的資料', () => {
    assert.ok(/能提升分析品質/.test(doc));
  });

  await test('（6.Required/optional classification）文件定義Future = 保留給未來擴充、V1完全不收集的資料', () => {
    assert.ok(/V1完全不收集/.test(doc) || /V1完全\s*不收集/.test(flatDoc));
  });

  await test('（6.Required/optional classification）文件包含歸屬理由的總結表格（含age/gender/height/weight等資料類別）', () => {
    const section = doc.split('## 3. Required vs Optional Data Boundary')[1] || '';
    assert.ok(section.includes('| 資料類別 | 層級 | 理由 |'));
    assert.ok(section.includes('age/gender/height/weight'));
  });

  await test('（6.Required/optional classification）文件解釋Daily Behavior Data歸類為Optional的理由：Analysis Capability既有設計允許部分資料缺席', () => {
    assert.ok(/允許部分資料缺席/.test(doc) || /允許\s*部分資料缺席/.test(flatDoc));
  });

  console.log('');

  // =========================================================================
  // G. Validation responsibility
  // =========================================================================
  console.log('--- G. Validation responsibility ---');

  await test('（7.Validation responsibility）文件包含「4. Input Validation Responsibility」章節', () => {
    assert.ok(doc.includes('Input Validation Responsibility'));
  });

  const VALIDATION_LAYERS = [
    { name: 'Product Layer', keyword: 'user input format' },
    { name: 'Contract Layer', keyword: 'request structure validation' },
    { name: 'Adapter Layer', keyword: 'product format conversion' },
    { name: 'Feature Layer', keyword: 'feature-specific requirement validation' },
    { name: 'Capability Layer', keyword: 'intelligence processing requirement' },
  ];
  for (const layer of VALIDATION_LAYERS) {
    await test(`（7.Validation responsibility）${layer.name}的責任是"${layer.keyword}"`, () => {
      assert.ok(doc.includes(layer.name), `文件缺少${layer.name}小節`);
      assert.ok(doc.includes(layer.keyword), `文件缺少關鍵字：${layer.keyword}`);
    });
  }

  await test('（7.Validation responsibility）文件包含五層驗證分工的Flow示意圖', () => {
    const section = doc.split('### 分工總結')[1] || '';
    assert.ok(section.includes('使用者原始輸入'));
    assert.ok(section.includes('Analysis/Recommendation結果'));
  });

  await test('（7.Validation responsibility）文件明確聲明本次任務不實作任何一層的驗證器', () => {
    assert.ok(/不實作任何一層的驗證器/.test(doc) || /不\*{0,2}實作任何一層的驗證器/.test(flatDoc));
  });

  await test('（7.Validation responsibility）文件確認Contract Layer的驗證邏輯延續TASK1.103既有的validateProductRequestShape()實作，不重新驗證Health Insight特定欄位', () => {
    const section = (doc.split('### Contract Layer')[1] || '').split('### Adapter Layer')[0];
    assert.ok(section.includes('TASK1.103'));
    assert.ok(section.includes('validateProductRequestShape'));
  });

  console.log('');

  // =========================================================================
  // H. Privacy boundary
  // =========================================================================
  console.log('--- H. Privacy boundary ---');

  await test('（8.Privacy boundary）文件包含「5. Data Privacy Boundary」章節', () => {
    assert.ok(doc.includes('Data Privacy Boundary'));
  });

  await test('（8.Privacy boundary）Allowed Usage包含intelligence analysis input', () => {
    const section = (doc.split('### Allowed Usage')[1] || '').split('### Forbidden')[0];
    assert.ok(section.includes('intelligence analysis input'));
  });

  const FORBIDDEN_ITEMS = ['unnecessary personal information', 'authentication data', 'private system data'];
  for (const item of FORBIDDEN_ITEMS) {
    await test(`（8.Privacy boundary）Forbidden清單包含"${item}"`, () => {
      const section = (doc.split('### Forbidden（禁止事項')[1] || '').split('### 確認')[0];
      assert.ok(section.includes(item), `Forbidden清單缺少：${item}`);
    });
  }

  await test('（8.Privacy boundary）文件明確確認Health Insight不直接存取auth/oauth/session/database層', () => {
    const section = doc.split('### 確認：Health Insight不直接存取')[1] || '';
    assert.ok(section.includes('src/auth/'));
    assert.ok(section.includes('src/oauth/'));
    assert.ok(section.includes('src/db/'));
  });

  await test('（8.Privacy boundary）文件確認userId由呼叫端（未來的route/controller）提供，Health Insight Feature不直接呼叫Auth模組', () => {
    const section = doc.split('### 確認：Health Insight不直接存取')[1] || '';
    assert.ok(section.includes('userId'));
  });

  console.log('');

  // =========================================================================
  // I. Intelligence mapping
  // =========================================================================
  console.log('--- I. Intelligence mapping ---');

  await test('（9.Intelligence mapping）文件包含「6. Intelligence Mapping」章節', () => {
    assert.ok(doc.includes('## 6. Intelligence Mapping'));
  });

  await test('（9.Intelligence mapping）文件記錄完整五層映射（User Input→Health Insight Feature→Analysis→Recommendation→Future Decision Capability）', () => {
    const section = (doc.split('## 6. Intelligence Mapping')[1] || '').split('### 各類資料被哪個Capability消費')[0];
    for (const kw of ['User Input', 'Health Insight Feature', 'Analysis Capability', 'Recommendation Capability', 'Future Decision Capability']) {
      assert.ok(section.includes(kw), `映射缺少層級：${kw}`);
    }
  });

  await test('（9.Intelligence mapping）文件記錄User Profile Data跟metadata欄位的對應', () => {
    const section = (doc.split('### 各類資料被哪個Capability消費')[1] || '').split('## 7.')[0];
    assert.ok(section.includes('metadata'));
  });

  await test('（9.Intelligence mapping）文件記錄Daily Behavior Data對應既有Insight Context欄位（nutritionContext/activityContext/behaviorContext）', () => {
    const section = (doc.split('### 各類資料被哪個Capability消費')[1] || '').split('## 7.')[0];
    for (const field of ['nutritionContext', 'activityContext', 'behaviorContext']) {
      assert.ok(section.includes(field), `映射缺少欄位：${field}`);
    }
  });

  await test('（9.Intelligence mapping）文件記錄Health Goal Data不直接被Analysis Capability消費，而是影響Recommendation方向性', () => {
    const section = (doc.split('### 各類資料被哪個Capability消費')[1] || '').split('## 7.')[0];
    assert.ok(section.includes('不直接被Analysis'));
  });

  await test('（9.Intelligence mapping）文件確認V1完全不使用Decision Capability（延續TASK1.106 Feature Scope的Exclude範圍）', () => {
    const section = (doc.split('### 各類資料被哪個Capability消費')[1] || '').split('## 7.')[0];
    assert.ok(section.includes('V1完全不使用') || /V1完全\s*不使用/.test(section.replace(/\n/g, ' ')));
    assert.ok(section.includes('TASK1.106'));
  });

  console.log('');

  // =========================================================================
  // J. Future extension
  // =========================================================================
  console.log('--- J. Future extension ---');

  await test('（10.Future extension）文件包含「7. Future Extension Boundary」章節', () => {
    assert.ok(doc.includes('## 7. Future Extension Boundary'));
  });

  const REQUIRED_FUTURE_ITEMS = ['wearable devices', 'health devices', 'medical records', 'nutrition database', 'activity tracking'];
  for (const item of REQUIRED_FUTURE_ITEMS) {
    await test(`（10.Future extension）Future Extension清單包含"${item}"`, () => {
      const section = (doc.split('## 7. Future Extension Boundary')[1] || '').split('## 8.')[0];
      assert.ok(section.includes(item), `Future Extension清單缺少：${item}`);
    });
  }

  await test('（10.Future extension）文件明確聲明第7節內容"只記錄可能性、不實作"', () => {
    const section = (doc.split('## 7. Future Extension Boundary')[1] || '').split('## 8.')[0].replace(/\n/g, ' ');
    assert.ok(/只\s*記錄可能性、不實作/.test(section) || section.includes('只**記錄可能性、不實作**'));
  });

  await test('（10.Future extension）文件包含「8. Free vs Premium Input Direction」章節', () => {
    assert.ok(doc.includes('Free vs Premium Input Direction'));
  });

  await test('（10.Future extension）Free層級包含basic profile跟manual daily input', () => {
    const section = (doc.split('### Free（免費層級）')[1] || '').split('### Premium')[0];
    assert.ok(section.includes('basic profile'));
    assert.ok(section.includes('manual daily input'));
  });

  const REQUIRED_PREMIUM_INPUT_ITEMS = ['richer history', 'connected devices', 'advanced analysis'];
  for (const item of REQUIRED_PREMIUM_INPUT_ITEMS) {
    await test(`（10.Future extension）Premium層級包含"${item}"`, () => {
      const section = (doc.split('### Premium（付費層級')[1] || '').split('### 明確的範圍限制')[0];
      assert.ok(section.includes(item), `Premium清單缺少：${item}`);
    });
  }

  await test('（10.Future extension）文件明確聲明本次任務不實作任何會員機制', () => {
    const section = (doc.split('## 8. Free vs Premium Input Direction')[1] || '').split('## 9.')[0].replace(/\n/g, ' ');
    assert.ok(/不實作任何\s*會員機制/.test(section) || /不\*{0,2}實作任何\s*會員機制/.test(section));
  });

  console.log('');

  // =========================================================================
  // K. Gemini boundary
  // =========================================================================
  console.log('--- K. Gemini boundary ---');

  await test('（11.Gemini boundary）文件包含「9. Gemini Future Boundary」章節', () => {
    assert.ok(doc.includes('Gemini Future Boundary'));
  });

  await test('（11.Gemini boundary）文件明確確認Gemini不會收到未經限制的原始使用者資料', () => {
    assert.ok(doc.includes('不會收到未經限制的原始使用者資料') || /不會\s*收到未經限制的原始使用者資料/.test(flatDoc));
  });

  await test('（11.Gemini boundary）文件記錄未來Flow：Validated Intelligence Input→Analysis Capability→Gemini Enhancement Layer', () => {
    const section = (doc.split('### 未來的Flow')[1] || '').split('### Gemini依然只是Enhancement Layer')[0];
    assert.ok(section.includes('Validated Intelligence Input'));
    assert.ok(section.includes('Analysis Capability'));
    assert.ok(section.includes('Gemini Enhancement Layer'));
  });

  await test('（11.Gemini boundary）文件重申Gemini依然只是Enhancement Layer，不取代Analysis/Recommendation Capability/Runtime', () => {
    const section = doc.split('### Gemini依然只是Enhancement Layer')[1] || '';
    assert.ok(/不會取代\*{0,2}\s*Analysis\s*Capability/.test(section.replace(/\n/g, ' ')));
    assert.ok(/不會取代\*{0,2}\s*Recommendation\s*Capability/.test(section.replace(/\n/g, ' ')));
    assert.ok(/不會取代\*{0,2}\s*Runtime/.test(section.replace(/\n/g, ' ')));
  });

  await test('（11.Gemini boundary）文件確認即使Gemini non-deterministic也不影響既有Intelligence Chain的正確性', () => {
    assert.ok(doc.includes('non-deterministic'));
    assert.ok(/不會影響既有\s*Intelligence\s*Chain/.test(flatDoc) || doc.includes('不會影響既有'));
  });

  await test('（11.Gemini boundary）TASK1.106建立的PHASE6_HEALTH_INSIGHT_PRODUCT_PLAN.md依然存在且本次任務完全沒有修改它', () => {
    assert.ok(fs.existsSync(productPlanDocPath));
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/PHASE6_HEALTH_INSIGHT_PRODUCT_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // L. Dependency direction (regression-adjacent structural checks)
  // =========================================================================
  console.log('--- L. Dependency direction ---');

  await test('（Dependency direction）Restrictions Confirmation章節存在', () => {
    assert.ok(doc.includes('Restrictions Confirmation'));
  });

  await test('（TASK1.108後更新）（Dependency direction）src/intelligence/product/PHASE6_HEALTH_INSIGHT_INPUT_BOUNDARY_PLAN.md是TASK1.107自己的commit（15053ef）新增的檔案（git show --name-status確認，而不是檢查即時git status——避免被後續任何時間點的執行誤判為失敗，延續TASK1.99~1.106測試套件同樣的修正模式）', () => {
    const nameStatus = execFileSync('git', ['show', '--name-status', '--pretty=format:', '15053ef'], { cwd: repoRoot, encoding: 'utf8' });
    const line = nameStatus.split('\n').find((l) => l.endsWith('\tsrc/intelligence/product/PHASE6_HEALTH_INSIGHT_INPUT_BOUNDARY_PLAN.md'));
    assert.ok(line && line.startsWith('A'), `預期該檔案在15053ef被新增，實際：${line}`);
  });

  for (const layer of ALL_LAYERS) {
    await test(`（Dependency direction）${layer.name} 目錄本次任務完全沒有任何檔案被修改`, () => {
      const status = execFileSync('git', ['status', '--porcelain', layer.dir], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(status.trim(), '');
    });
    await test(`（Dependency direction）${layer.name} 目錄恰好維持既有的檔案清單`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  await test('（Dependency direction）app.intelligence物件恰好維持24個欄位不變（Validation要求："app.intelligence unchanged"）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（Dependency direction）app.router.routes 數量沒有因為本次任務而改變（Validation要求："app.router.routes unchanged"）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（Dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（Dependency direction）src/worker.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（Dependency direction）src/routes/、src/controllers/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/routes/ src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（Dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（Dependency direction）migrations/ 目錄本次任務完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（Dependency direction）src/db/ 目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（Dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改（Validation要求："Phase 3 Application unchanged"）', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（Dependency direction）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改（Validation要求："Phase 2 Runtime unchanged"）', () => {
    const status = execFileSync('git', ['status', '--porcelain', orchestrationRuntimeDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（Dependency direction）src/intelligence/analysis/（Analysis Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', analysisDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（Dependency direction）src/intelligence/recommendation/（Recommendation Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', recommendationDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（Dependency direction）Phase 4 Capability Architecture（capabilities/整個目錄樹）本次任務完全沒有任何檔案被新增或修改（Validation要求："Phase 4 Capability unchanged"）', () => {
    const status = execFileSync('git', ['status', '--porcelain', capabilitiesDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（Dependency direction）沒有新增任何新的Product Boundary目錄', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    assert.deepStrictEqual(dirNames, ['adapter', 'contract', 'entry', 'execution', 'features', 'operational']); // TASK1.111後更新：新增features/目錄（Health Insight Feature），這是Feature層，不是第六個Product Boundary，本次任務不需要重跑舊有結論
  });

  // 逐檔案重新確認：五個Product Boundary + Phase 4五層Capability，
  // 合計16個既有production程式碼檔案，本次規劃任務完全沒有修改
  // 過其中任何一個位元組，也重新確認這些既有檔案本身依然遵守
  // Phase 1~5系列反覆確認的邊界規則。
  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    await test(`（Dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });

    const src = readSrc(full);

    await test(`（Dependency direction）${layer}/${file} 完全不import src/db/（重新確認既有邊界）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });

    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（Dependency direction）${layer}/${file} 完全不import src/${subdir}/（重新確認既有邊界）`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }

    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（Dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}（重新確認既有邊界）`, () => {
        assert.ok(!pattern.test(src));
      });
    }

    await test(`（Dependency direction）${layer}/${file} 完全沒有呼叫fetch()（重新確認既有邊界）`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });

    await test(`（Dependency direction）${layer}/${file} 完全不呼叫Date.now()/Math.random()（重新確認既有邊界，deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });

    for (const pattern of AI_KEYWORDS) {
      await test(`（Dependency direction）${layer}/${file} 的實際程式碼不含AI相關關鍵字樣 ${pattern}（重新確認Phase 5/Phase 4既有邊界）`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }

    if (PRODUCT_LAYER_NAMES.includes(layer) && file !== 'README.md' && file !== 'index.js') {
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（Dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/（重新確認Product Boundary不得繞過下一層）`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（Dependency direction）${layer}/${file} 完全不import src/routes/、src/controllers/、worker.js（重新確認No HTTP邊界）`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
      });
    }
  }

  await test('（AI boundary）文件不含實際的AI呼叫程式碼字樣（只有規劃性的Gemini字眼）', () => {
    for (const pattern of [/api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i]) {
      assert.ok(!pattern.test(doc));
    }
  });

  await test('（AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i, /GEMINI/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek|gemini/i.test(name));
      }
    }
  });

  await test('（AI boundary）package.json本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
    for (const envFile of ['.env', '.env.example']) {
      const envPath = path.join(repoRoot, envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        assert.ok(!/ANTHROPIC/i.test(content));
        assert.ok(!/OPENAI/i.test(content));
        assert.ok(!/DEEPSEEK/i.test(content));
        assert.ok(!/GEMINI/i.test(content));
      }
    }
  });

  console.log('');

  // =========================================================================
  // M. Regression validation
  // =========================================================================
  console.log('--- M. Regression validation ---');

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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase6-task1.107-health-insight-input-boundary')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（Regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5/Phase 6全部）`, () => {
      assert.ok(allSuites.length >= 98, `預期至少98個既有測試檔案，實際 ${allSuites.length}`);
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
  // N. P1-P6
  // =========================================================================
  console.log('--- N. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

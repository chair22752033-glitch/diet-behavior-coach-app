/*
 * Phase 6 TASK 1.113｜Health Insight User Product Activation
 * Foundation 測試
 *
 * 本任務是使用者活化規劃任務——不實作任何production功能、UI、
 * frontend元件、route/controller、database schema，也不整合
 * 任何AI。目的是驗證
 * `PHASE6_HEALTH_INSIGHT_ACTIVATION_PLAN.md`完整涵蓋規格要求的
 * 9個章節，並重新確認Phase 1~6既有架構（五個Product
 * Boundary、Health Insight Feature、Health Insight
 * Integration、Phase 4 Capability Chain、app.intelligence/
 * router/worker.js/database/既有UI）完全沒有被本次任務影響。
 *
 * 分為以下12個部分：
 * A) activation goal
 * B) user scenarios
 * C) request mapping
 * D) activation flow
 * E) value delivery
 * F) premium boundary
 * G) Gemini boundary
 * H) error boundary
 * I) future UI/API boundary
 * J) dependency direction
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
const intelDir = path.join(srcRoot, 'intelligence');
const productDir = path.join(intelDir, 'product');
const productEntryDir = path.join(productDir, 'entry');
const productContractDir = path.join(productDir, 'contract');
const productAdapterDir = path.join(productDir, 'adapter');
const productExecutionDir = path.join(productDir, 'execution');
const productOperationalDir = path.join(productDir, 'operational');
const productFeaturesDir = path.join(productDir, 'features');
const healthInsightDir = path.join(productFeaturesDir, 'health_insight');
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

const productPlanDocPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_PRODUCT_PLAN.md');
const inputBoundaryDocPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_INPUT_BOUNDARY_PLAN.md');
const outputBoundaryDocPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_OUTPUT_BOUNDARY_PLAN.md');
const uxFlowDocPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_UX_FLOW_PLAN.md');
const implementationArchDocPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_IMPLEMENTATION_ARCHITECTURE_PLAN.md');
const docPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_ACTIVATION_PLAN.md');

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
const HEALTH_INSIGHT_LAYER = { name: 'health-insight-feature', dir: healthInsightDir, files: ['health_insight_feature.js', 'health_insight_result_mapper.js', 'index.js'] };
const EXISTING_LAYERS = [...PRODUCT_BOUNDARY_LAYERS, ...PHASE4_LAYERS, HEALTH_INSIGHT_LAYER];
const EXISTING_SCANNED_FILES = EXISTING_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));
const PRODUCT_LAYER_NAMES = PRODUCT_BOUNDARY_LAYERS.map((l) => l.name);

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
  // A. activation goal
  // =========================================================================
  console.log('--- A. activation goal ---');

  await test('（1.activation goal）文件存在且非空', () => {
    const stat = fs.statSync(docPath);
    assert.ok(stat.isFile());
    assert.ok(stat.size > 0);
  });

  const REQUIRED_DOC_SECTIONS = [
    'Product Activation Goal', 'User Scenario Definition', 'Product Request Contract Mapping', 'Activation Flow',
    'User Value Delivery', 'Free / Premium Activation Boundary', 'Gemini Future Activation Boundary',
    'Error Experience Boundary', 'Future UI/API Preparation',
  ];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.activation goal）文件包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  const section1 = () => doc.split('## 1. Product Activation Goal')[1].split('## 2. User Scenario Definition')[0];

  await test('（1.activation goal）文件定義什麼會活化Health Insight（使用者提供足夠健康資料+表達想了解健康狀況的意圖）', () => {
    const section = section1().split('### User Intention')[0];
    assert.ok(section.includes('活化Health Insight的根本動作'));
  });

  await test('（1.activation goal）文件定義使用者意圖，並明確排除AI Chat', () => {
    const section = section1().split('### User Intention（使用者意圖）')[1].split('### Relationship Between')[0];
    assert.ok(section.includes('不是'));
    assert.ok(section.includes('AI Chat'));
  });

  await test('（1.activation goal）文件定義使用者動作跟智慧執行是一對一關係，沒有背景工作/非同步佇列/跨請求累積狀態', () => {
    const section = section1().split('### Relationship Between User Action and Intelligence Execution')[1].replace(/\n/g, ' ');
    assert.ok(section.includes('一對一'));
    assert.ok(section.includes('沒有'));
    assert.ok(section.includes('背景工作'));
  });

  await test('（1.activation goal）文件記錄跟TASK1.106~1.112的關係', () => {
    for (const t of ['TASK1.106', 'TASK1.107', 'TASK1.108', 'TASK1.109', 'TASK1.110', 'TASK1.111', 'TASK1.112']) {
      assert.ok(doc.includes(t), `文件缺少對${t}的引用`);
    }
  });

  console.log('');

  // =========================================================================
  // B. user scenarios
  // =========================================================================
  console.log('--- B. user scenarios ---');

  await test('（2.user scenarios）文件包含「2. User Scenario Definition」章節', () => {
    assert.ok(doc.includes('## 2. User Scenario Definition'));
  });

  const section2 = () => doc.split('## 2. User Scenario Definition')[1].split('## 3. Product Request Contract Mapping')[0];

  const REQUIRED_SCENARIOS = ['A. First Health Assessment', 'B. Daily Health Update', 'C. Progress Review'];
  for (const scenario of REQUIRED_SCENARIOS) {
    await test(`（2.user scenarios）情境"${scenario}"存在且包含User Action/Required Input/Expected Output三個小節`, () => {
      const marker = `### ${scenario}`;
      assert.ok(section2().includes(marker), `文件缺少情境：${scenario}`);
      const nextMarkerIndex = section2().indexOf(marker) + marker.length;
      const rest = section2().slice(nextMarkerIndex);
      const nextSectionIdx = rest.indexOf('### ', 1);
      const scenarioBody = nextSectionIdx === -1 ? rest : rest.slice(0, nextSectionIdx);
      assert.ok(scenarioBody.includes('User Action（使用者動作）'));
      assert.ok(scenarioBody.includes('Required Input（必要輸入）'));
      assert.ok(scenarioBody.includes('Expected Output（預期輸出）'));
    });
  }

  await test('（2.user scenarios）First Health Assessment情境引用TASK1.107 Required Fields（age/gender/height/weight）', () => {
    const section = section2().split('### A. First Health Assessment')[1].split('### B. Daily Health Update')[0];
    for (const field of ['age', 'gender', 'height', 'weight']) {
      assert.ok(section.includes(field), `情境A缺少欄位引用：${field}`);
    }
  });

  await test('（2.user scenarios）Daily Health Update情境引用TASK1.107 Daily Behavior Data', () => {
    const section = section2().split('### B. Daily Health Update')[1].split('### C. Progress Review')[0];
    assert.ok(section.includes('Daily Behavior Data'));
  });

  await test('（2.user scenarios）Progress Review情境引用TASK1.108 Progress Trend跟"看趨勢"的使用者意圖', () => {
    const section = section2().split('### C. Progress Review')[1];
    assert.ok(section.includes('Progress Trend'));
    assert.ok(section.includes('看趨勢'));
  });

  await test('（2.user scenarios）情境定義延續TASK1.109 First-Time/Returning User Journey，沒有發明新的獨立UX流程', () => {
    const section = section2();
    assert.ok(section.includes('First-Time User Journey') || section.includes('First-Time'));
    assert.ok(section.includes('Returning User Journey') || section.includes('Returning'));
  });

  console.log('');

  // =========================================================================
  // C. request mapping
  // =========================================================================
  console.log('--- C. request mapping ---');

  await test('（3.request mapping）文件包含「3. Product Request Contract Mapping」章節', () => {
    assert.ok(doc.includes('## 3. Product Request Contract Mapping'));
  });

  const section3 = () => doc.split('## 3. Product Request Contract Mapping')[1].split('## 4. Activation Flow')[0];

  await test('（3.request mapping）文件記錄完整三層映射（User Input→Product Request→Health Insight Integration）', () => {
    const section = section3().split('### Required Fields')[0];
    assert.ok(section.includes('User Input'));
    assert.ok(section.includes('Product Request'));
    assert.ok(section.includes('Health Insight Integration'));
  });

  await test('（3.request mapping）文件定義rawInput是唯一必要欄位', () => {
    const section = section3().split('### Required Fields（必要欄位）')[1].split('### Optional Fields')[0];
    assert.ok(section.includes('rawInput'));
    assert.ok(section.includes('唯一'));
  });

  await test('（3.request mapping）文件定義userId/options為選填欄位，並確認鏈路不讀取userId的值', () => {
    const section = section3().split('### Optional Fields（選填欄位）')[1].split('### Validation Responsibility')[0];
    assert.ok(section.includes('userId'));
    assert.ok(section.includes('options'));
    assert.ok(section.includes('不讀取'));
  });

  await test('（3.request mapping）文件記錄五層驗證責任分工（Entry/Contract/Adapter/Health Insight Feature/Analysis-Recommendation Capability），且明確聲明不新增任何驗證邏輯', () => {
    const section = section3().split('### Validation Responsibility（驗證責任）')[1];
    for (const layer of ['Product Entry', 'Product Contract', 'Product Adapter', 'Health Insight Feature']) {
      assert.ok(section.includes(layer), `驗證責任分工缺少：${layer}`);
    }
    assert.ok(/本次任務不新增任何一層的驗證邏輯/.test(section));
  });

  console.log('');

  // =========================================================================
  // D. activation flow
  // =========================================================================
  console.log('--- D. activation flow ---');

  await test('（4.activation flow）文件包含「4. Activation Flow」章節', () => {
    assert.ok(doc.includes('## 4. Activation Flow'));
  });

  await test('（4.activation flow）文件記錄完整六層流程（User Action→Product Feature→Product Entry→Health Insight Integration→Capability Execution→Product Output）', () => {
    const section = doc.split('### 完整流程（規格原文架構，具體展開六層）')[1].split('### 各層責任')[0];
    for (const kw of ['User Action', 'Product Feature', 'Product Entry', 'Health Insight Integration', 'Capability Execution', 'Product Output']) {
      assert.ok(section.includes(kw), `流程缺少層級：${kw}`);
    }
  });

  await test('（4.activation flow）文件說明各層責任，且明確標註Product Feature是規劃中、本次任務不建立', () => {
    const section = doc.split('### 各層責任')[1].split('---')[0];
    assert.ok(section.includes('Product Feature'));
    assert.ok(/規劃中/.test(section));
  });

  await test('（4.activation flow）文件確認Product Entry到Health Insight Integration這段純粹是呼叫轉發，延續No HTTP既有原則', () => {
    const section = doc.split('### 各層責任')[1].split('---')[0];
    assert.ok(section.includes('No HTTP'));
  });

  console.log('');

  // =========================================================================
  // E. value delivery
  // =========================================================================
  console.log('--- E. value delivery ---');

  await test('（5.value delivery）文件包含「5. User Value Delivery」章節', () => {
    assert.ok(doc.includes('## 5. User Value Delivery'));
  });

  const section5 = () => doc.split('## 5. User Value Delivery')[1].split('## 6. Free / Premium Activation Boundary')[0];

  const REQUIRED_VALUE_ITEMS = ['Observation（觀察）', 'Behavior Understanding（行為理解）', 'Recommendation（建議）', 'Progress Tracking（進度追蹤）'];
  for (const item of REQUIRED_VALUE_ITEMS) {
    await test(`（5.value delivery）價值交付清單包含"${item}"`, () => {
      assert.ok(section5().includes(item), `價值交付清單缺少：${item}`);
    });
  }

  await test('（5.value delivery）文件明確誠實邊界：V1實際能交付Observation跟Recommendation，Behavior Understanding跟Progress Tracking只確認形狀存在', () => {
    const section = section5().split('### 價值交付的誠實邊界')[1];
    assert.ok(section.includes('healthObservation'));
    assert.ok(section.includes('不承諾V1會有實際內容') || /不承諾\s*V1/.test(section.replace(/\n/g, ' ')));
  });

  console.log('');

  // =========================================================================
  // F. premium boundary
  // =========================================================================
  console.log('--- F. premium boundary ---');

  await test('（6.premium boundary）文件包含「6. Free / Premium Activation Boundary」章節', () => {
    assert.ok(doc.includes('## 6. Free / Premium Activation Boundary'));
  });

  const section6 = () => doc.split('## 6. Free / Premium Activation Boundary')[1].split('## 7. Gemini Future Activation Boundary')[0];

  await test('（6.premium boundary）Free小節包含Basic Health Insight，且確認三個情境全部屬於Free範圍', () => {
    const section = section6().split('### Free（規格原文）')[1].split('### Premium（規格原文，三項）')[0].replace(/\s+/g, ' ');
    assert.ok(section.includes('Basic Health Insight'));
    assert.ok(section.includes('First Health Assessment'));
  });

  const REQUIRED_PREMIUM_ITEMS = ['Advanced insight', 'Extended history', 'Gemini enhancement'];
  for (const item of REQUIRED_PREMIUM_ITEMS) {
    await test(`（6.premium boundary）Premium小節包含"${item}"`, () => {
      const section = section6().split('### Premium（規格原文，三項）')[1].split('### 明確的範圍限制')[0];
      assert.ok(section.includes(item), `Premium清單缺少：${item}`);
    });
  }

  await test('（6.premium boundary）文件明確聲明本次任務不實作任何會員機制', () => {
    const section = section6().split('### 明確的範圍限制（規格原文要求）')[1].replace(/\n/g, ' ');
    assert.ok(/本次任務不實作任何\s*會員機制/.test(section));
  });

  console.log('');

  // =========================================================================
  // G. Gemini boundary
  // =========================================================================
  console.log('--- G. Gemini boundary ---');

  await test('（7.Gemini boundary）文件包含「7. Gemini Future Activation Boundary」章節', () => {
    assert.ok(doc.includes('## 7. Gemini Future Activation Boundary'));
  });

  await test('（7.Gemini boundary）文件記錄未來Flow：Structured Health Insight→Gemini Enhancement→Explanation', () => {
    const section = doc.split('### 未來的Flow（規格原文架構）')[1].split('### 確認：Gemini不會取代既有鏈路')[0];
    assert.ok(section.includes('Structured Health Insight'));
    assert.ok(section.includes('Gemini Enhancement'));
    assert.ok(section.includes('Explanation'));
  });

  await test('（7.Gemini boundary）文件明確確認Gemini不會取代Product Boundary/Health Insight Feature/Capability Orchestrator/Runtime', () => {
    const section = doc.split('### 確認：Gemini不會取代既有鏈路')[1].split('---')[0];
    const flat = section.replace(/\n/g, ' ');
    assert.ok(/不會取代\*{0,2}Product\s*Entry/.test(flat));
    assert.ok(/不會取代\*{0,2}Health\s*Insight\s*Feature/.test(flat));
    assert.ok(/不會取代\*{0,2}Capability\s*Orchestrator/.test(flat));
    assert.ok(/不會取代\*{0,2}\s*Runtime/.test(flat));
  });

  await test('（7.Gemini boundary）文件明確限制Gemini的觸發時機必須在requestProductEntry()成功回傳之後，不能提前介入鏈路中間', () => {
    const section = doc.split('### 確認：Gemini不會取代既有鏈路')[1].split('---')[0];
    assert.ok(section.includes('requestProductEntry'));
    assert.ok(section.includes('成功回傳'));
    assert.ok(section.includes('不能'));
  });

  console.log('');

  // =========================================================================
  // H. error boundary
  // =========================================================================
  console.log('--- H. error boundary ---');

  await test('（8.error boundary）文件包含「8. Error Experience Boundary」章節', () => {
    assert.ok(doc.includes('## 8. Error Experience Boundary'));
  });

  const section8 = () => doc.split('## 8. Error Experience Boundary')[1].split('## 9. Future UI/API Preparation')[0];

  const REQUIRED_ERROR_CATEGORIES = ['Missing data（缺少資料）', 'Invalid input（無效輸入）', 'Unavailable intelligence（智慧服務不可用）', 'Temporary failure（暫時性失敗）'];
  for (const category of REQUIRED_ERROR_CATEGORIES) {
    await test(`（8.error boundary）錯誤分類包含"${category}"`, () => {
      const section = section8().split('### User-Facing Error Categories（規格原文列出的四類）')[1].split('### User Message跟Internal Error Detail的分離')[0];
      assert.ok(section.includes(category), `錯誤分類缺少：${category}`);
    });
  }

  await test('（8.error boundary）文件引用既有錯誤reason（capability_orchestrator_unavailable/analysis_runner_unavailable/recommendation_runner_unavailable/capability_execution_failed）', () => {
    const section = section8().split('### User-Facing Error Categories（規格原文列出的四類）')[1].split('### User Message跟Internal Error Detail的分離')[0];
    for (const reason of ['capability_orchestrator_unavailable', 'analysis_runner_unavailable', 'recommendation_runner_unavailable', 'capability_execution_failed']) {
      assert.ok(section.includes(reason), `文件缺少既有reason引用：${reason}`);
    }
  });

  await test('（8.error boundary）文件明確分離User Message跟Internal Error Detail', () => {
    const section = section8().split('### User Message跟Internal Error Detail的分離')[1].replace(/\n/g, ' ');
    assert.ok(section.includes('User Message（使用者訊息）'));
    assert.ok(/Internal Error Detail（內部錯誤\s*細節）/.test(section));
  });

  await test('（8.error boundary）文件重申TASK1.112已驗證的"所有失敗情境的結果都不含stack trace/例外訊息"既有保證', () => {
    const section = section8().split('### User Message跟Internal Error Detail的分離')[1];
    assert.ok(section.includes('TASK1.112'));
    assert.ok(section.includes('stack'));
  });

  console.log('');

  // =========================================================================
  // I. future UI/API boundary
  // =========================================================================
  console.log('--- I. future UI/API boundary ---');

  await test('（9.future UI/API boundary）文件包含「9. Future UI/API Preparation」章節', () => {
    assert.ok(doc.includes('## 9. Future UI/API Preparation'));
  });

  const section9 = () => doc.split('## 9. Future UI/API Preparation')[1].split('## Restrictions Confirmation')[0];

  await test('（9.future UI/API boundary）文件記錄未來Route/Controller→Product Feature→Product Entry→Health Insight Integration整合方向', () => {
    const section = section9().split('### 明確的範圍限制')[0];
    assert.ok(section.includes('Route'));
    assert.ok(section.includes('Controller'));
    assert.ok(section.includes('Product Entry'));
    assert.ok(section.includes('Health Insight Integration'));
  });

  await test('（9.future UI/API boundary）文件明確聲明本次任務不建立任何route/controller/frontend元件', () => {
    const section = section9().split('### 明確的範圍限制（規格原文要求）')[1].replace(/\n/g, ' ');
    assert.ok(/本次任務不建立\*{0,2}任何route/.test(section));
  });

  await test('（9.future UI/API boundary）文件確認未來UI/API落地完全不需要修改Health Insight Integration鏈路本身（TASK1.112組合根設計的價值）', () => {
    const section = section9().split('### 明確的範圍限制（規格原文要求）')[1];
    assert.ok(section.includes('不需要任何修改') || /不需要\s*任何修改/.test(section.replace(/\n/g, ' ')));
    assert.ok(section.includes('TASK1.112'));
  });

  console.log('');

  // =========================================================================
  // Dependency direction
  // =========================================================================
  console.log('--- J. Dependency direction ---');

  await test('（10.Dependency direction）Restrictions Confirmation章節存在', () => {
    assert.ok(doc.includes('Restrictions Confirmation'));
  });

  await test('（10.Dependency direction）Completion Criteria確認章節存在', () => {
    assert.ok(doc.includes('Completion Criteria'));
  });

  await test('（TASK1.114後更新）（10.Dependency direction）src/intelligence/product/PHASE6_HEALTH_INSIGHT_ACTIVATION_PLAN.md是TASK1.113自己的commit（19dd3c0）新增的檔案（git show --name-status確認，而不是檢查即時git status——避免被後續任何時間點的執行誤判為失敗，延續TASK1.99~1.112測試套件同樣的修正模式）', () => {
    const nameStatus = execFileSync('git', ['show', '--name-status', '--pretty=format:', '19dd3c0'], { cwd: repoRoot, encoding: 'utf8' });
    const line = nameStatus.split('\n').find((l) => l.endsWith('\tsrc/intelligence/product/PHASE6_HEALTH_INSIGHT_ACTIVATION_PLAN.md'));
    assert.ok(line && line.startsWith('A'), `預期該檔案在19dd3c0被新增，實際：${line}`);
  });

  await test('（10.Dependency direction）TASK1.106/1.107/1.108/1.109/1.110建立的五份文件依然存在且本次任務完全沒有修改它們', () => {
    assert.ok(fs.existsSync(productPlanDocPath));
    assert.ok(fs.existsSync(inputBoundaryDocPath));
    assert.ok(fs.existsSync(outputBoundaryDocPath));
    assert.ok(fs.existsSync(uxFlowDocPath));
    assert.ok(fs.existsSync(implementationArchDocPath));
    for (const p of [
      'src/intelligence/product/PHASE6_HEALTH_INSIGHT_PRODUCT_PLAN.md',
      'src/intelligence/product/PHASE6_HEALTH_INSIGHT_INPUT_BOUNDARY_PLAN.md',
      'src/intelligence/product/PHASE6_HEALTH_INSIGHT_OUTPUT_BOUNDARY_PLAN.md',
      'src/intelligence/product/PHASE6_HEALTH_INSIGHT_UX_FLOW_PLAN.md',
      'src/intelligence/product/PHASE6_HEALTH_INSIGHT_IMPLEMENTATION_ARCHITECTURE_PLAN.md',
    ]) {
      const diff = execFileSync('git', ['diff', '--stat', p], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${p} 不應該被本次任務修改`);
    }
  });

  await test('（10.Dependency direction）src/intelligence/product/health_insight_integration.js（TASK1.112）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/health_insight_integration.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.Dependency direction）沒有新增任何新的Product Boundary/Feature目錄（本次任務只新增一份文件）', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    assert.deepStrictEqual(dirNames, ['adapter', 'contract', 'entry', 'execution', 'features', 'operational']);
  });

  for (const layer of EXISTING_LAYERS) {
    await test(`（10.Dependency direction）${layer.name} 目錄本次任務完全沒有任何檔案被修改`, () => {
      const status = execFileSync('git', ['status', '--porcelain', layer.dir], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(status.trim(), '');
    });
    await test(`（10.Dependency direction）${layer.name} 目錄恰好維持既有的檔案清單`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  await test('（10.Dependency direction）app.intelligence物件恰好維持24個欄位不變（Validation要求："app.intelligence unchanged"）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（10.Dependency direction）app.router.routes 數量沒有因為本次任務而改變（Validation要求："app.router.routes unchanged"；TASK1.116後更新：TASK1.116是本系列第一個明確被授權做"Route connection"的任務，正式新增GET /health-insight、POST /api/health-insight兩條路由，21+2=23）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 23);
  });

  await test('（10.Dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.Dependency direction）src/worker.js既有TASK1.21~1.38路由分派邏輯/legacy handler完全沒有被修改（Validation要求："UI unchanged"；TASK1.116後更新：TASK1.116在檔案末尾新增GET /health-insight、POST /api/health-insight兩個if區塊，這是本次任務明確授權的Route connection範圍，不再要求整個檔案零diff，改成驗證既有邏輯的具體內容標記依然逐字存在）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('const DATA_API_PATHS = new Set(['));
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/api/timeline')"));
    assert.ok(workerSource.includes('async function handle(r,env){'));
    assert.ok(workerSource.includes("if(p==='/api/qlive'){"));
  });

  await test('（10.Dependency direction）src/routes/、src/controllers/既有檔案完全沒有被修改，只新增Health Insight專屬的新檔案（TASK1.116後更新：TASK1.116新增src/routes/health_insight_routes.js、src/controllers/health_insight_controller.js，並在src/routes/index.js新增對應的import/register一行，這是本次任務明確授權的Route connection範圍，這裡改成驗證既有路由/controller檔案本身逐一沒有被修改）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/auth_routes.js src/routes/user_routes.js src/routes/data_routes.js src/routes/dashboard_routes.js src/routes/profile_routes.js src/routes/timeline_routes.js src/routes/legacy_routes.js src/routes/router.js src/controllers/auth_controller.js src/controllers/dashboard_controller.js src/controllers/data_controller.js src/controllers/profile_controller.js src/controllers/timeline_controller.js src/controllers/user_controller.js src/controllers/response.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.Dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Dependency direction）migrations/ 目錄本次任務完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Dependency direction）src/db/ 目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Dependency direction）沒有新增任何CSS檔案/frontend元件（本次任務不實作UI）', () => {
    const status = execFileSync('sh', ['-c', "git status --porcelain -- '*.css' 'src/frontend/' 'src/components/' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改（Validation要求："Phase 3 unchanged"）', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（10.Dependency direction）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改（Validation要求："Phase 2 unchanged"）', () => {
    const status = execFileSync('git', ['status', '--porcelain', orchestrationRuntimeDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Dependency direction）src/intelligence/analysis/（Analysis Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', analysisDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Dependency direction）src/intelligence/recommendation/（Recommendation Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', recommendationDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.Dependency direction）Phase 4 Capability Architecture（capabilities/整個目錄樹）本次任務完全沒有任何檔案被新增或修改（Validation要求："Phase 4 unchanged"）', () => {
    const status = execFileSync('git', ['status', '--porcelain', capabilitiesDir], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  // 逐檔案重新確認：五個Product Boundary + Phase 4五層Capability +
  // Health Insight Feature，合計34個既有production程式碼檔案，
  // 本次規劃任務完全沒有修改過其中任何一個位元組，也重新確認這些
  // 既有檔案本身依然遵守Phase 1~6系列反覆確認的邊界規則。
  for (const { layer, file, full } of EXISTING_SCANNED_FILES) {
    await test(`（10.Dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });

    const src = readSrc(full);

    await test(`（10.Dependency direction）${layer}/${file} 完全不import src/db/（重新確認既有邊界）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });

    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（10.Dependency direction）${layer}/${file} 完全不import src/${subdir}/（重新確認既有邊界）`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }

    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（10.Dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}（重新確認既有邊界）`, () => {
        assert.ok(!pattern.test(src));
      });
    }

    await test(`（10.Dependency direction）${layer}/${file} 完全沒有呼叫fetch()（重新確認既有邊界）`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });

    await test(`（10.Dependency direction）${layer}/${file} 完全不呼叫Date.now()/Math.random()（重新確認既有邊界，deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });

    for (const pattern of AI_KEYWORDS) {
      await test(`（10.Dependency direction）${layer}/${file} 的實際程式碼不含AI相關關鍵字樣 ${pattern}（重新確認既有邊界）`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }

    if (PRODUCT_LAYER_NAMES.includes(layer) && file !== 'README.md' && file !== 'index.js') {
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（10.Dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/（重新確認Product Boundary不得繞過下一層）`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（10.Dependency direction）${layer}/${file} 完全不import src/routes/、src/controllers/、worker.js（重新確認No HTTP邊界）`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
      });
    }
  }

  await test('（10.Dependency direction）health_insight_integration.js本次任務完全沒有被修改，唯一相對路徑import依然是11個既定模組', () => {
    const src = readSrc(integrationFilePath);
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
    assert.strictEqual(imports.length, 11);
  });

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

  await test('（AI boundary）package.json完全沒有新增任何AI SDK依賴，也完全沒有被修改', () => {
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase6-task1.113-health-insight-activation')) {
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

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改（TASK1.116後更新：見上方"Dependency direction"章節已經改用內容標記比對，這裡額外確認legacy getHTML()函式本身逐字沒有被修改，既有UI維持不變）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  await test('（P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（P1-P6）src/auth/、src/oauth/ 完全沒有被本次任務修改，src/routes/、src/controllers/既有檔案也沒有被修改（TASK1.116後更新：見上方"Dependency direction"章節已針對routes/controllers做過檔案範圍限定的diff檢查，這裡額外確認src/auth/、src/oauth/兩個目錄完全沒有被觸碰）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

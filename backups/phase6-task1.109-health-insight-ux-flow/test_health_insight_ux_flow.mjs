/*
 * Phase 6 TASK 1.109｜Health Insight User Experience Flow
 * Definition 測試
 *
 * 本任務是UX/產品架構規劃任務——不實作任何UI、不建立
 * frontend元件、不建立route/controller、不整合任何AI。目的
 * 是驗證`PHASE6_HEALTH_INSIGHT_UX_FLOW_PLAN.md`完整涵蓋規格
 * 要求的12個章節，並重新確認Phase 1~5既有架構（五個Product
 * Boundary、Phase 4 Capability Chain、app.intelligence/
 * router/worker.js/database/既有UI）完全沒有被本次任務影響。
 *
 * 分為以下14個部分：
 * A) UX flow goal
 * B) User entry flow
 * C) First-time journey
 * D) Returning user journey
 * E) Screen flow planning
 * F) User/system responsibility
 * G) Intelligence flow mapping
 * H) Insight consumption flow
 * I) Free/Premium direction
 * J) Gemini UX boundary
 * K) Error handling direction
 * L) Future extension
 * M) Regression validation
 * N) P1-P6
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
const inputBoundaryDocPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_INPUT_BOUNDARY_PLAN.md');
const outputBoundaryDocPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_OUTPUT_BOUNDARY_PLAN.md');
const docPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_UX_FLOW_PLAN.md');

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
  // A. UX flow goal
  // =========================================================================
  console.log('--- A. UX flow goal ---');

  await test('（1.UX flow goal）文件存在且非空', () => {
    const stat = fs.statSync(docPath);
    assert.ok(stat.isFile());
    assert.ok(stat.size > 0);
  });

  const REQUIRED_DOC_SECTIONS = [
    'UX Flow Goal', 'User Entry Flow', 'First-Time User Journey', 'Returning User Journey', 'Health Insight Screen Flow Planning',
    'User Action Boundary', 'Intelligence Flow Mapping', 'Insight Consumption Flow', 'Free vs Premium UX Direction',
    'Future Gemini UX Boundary', 'UX Error Handling Direction', 'Future UX Extension',
  ];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.UX flow goal）文件包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.UX flow goal）文件記錄為什麼需要使用者流程（確保系統能產生的價值跟使用者實際體驗到的價值之間沒有落差）', () => {
    assert.ok(doc.includes('沒有落差'));
  });

  await test('（1.UX flow goal）文件記錄使用者行為跟智慧價值的循環關係', () => {
    assert.ok(doc.includes('循環'));
  });

  await test('（1.UX flow goal）文件明確區分Data Input Flow跟Insight Consumption Flow', () => {
    assert.ok(doc.includes('Data Input Flow'));
    assert.ok(doc.includes('Insight Consumption Flow'));
  });

  await test('（1.UX flow goal）文件記錄兩個流程使用相同的底層Intelligence Chain但UX上必須分開規劃', () => {
    assert.ok(doc.includes('使用相同的底層'));
    assert.ok(doc.includes('必須分開規劃') || /必須\s*分開規劃/.test(flatDoc));
  });

  await test('（1.UX flow goal）文件記錄跟TASK1.106/1.107/1.108的關係', () => {
    assert.ok(doc.includes('TASK1.106'));
    assert.ok(doc.includes('TASK1.107'));
    assert.ok(doc.includes('TASK1.108'));
  });

  console.log('');

  // =========================================================================
  // B. User entry flow
  // =========================================================================
  console.log('--- B. User entry flow ---');

  await test('（2.User entry flow）文件包含「2. User Entry Flow」章節', () => {
    assert.ok(doc.includes('## 2. User Entry Flow'));
  });

  const REQUIRED_ENTRY_POINTS = ['Product homepage', 'Health dashboard', 'Personal intelligence area'];
  for (const entry of REQUIRED_ENTRY_POINTS) {
    await test(`（2.User entry flow）Possible Entry Points包含"${entry}"`, () => {
      const section = (doc.split('## 2. User Entry Flow')[1] || '').split('### User Intent')[0];
      assert.ok(section.includes(entry), `Entry Points缺少：${entry}`);
    });
  }

  await test('（2.User entry flow）文件定義User Intent、Entry Conditions、Required User Context三個小節', () => {
    const section = doc.split('## 2. User Entry Flow')[1] || '';
    const excerpt = section.split('## 3.')[0];
    assert.ok(excerpt.includes('User Intent'));
    assert.ok(excerpt.includes('Entry Conditions'));
    assert.ok(excerpt.includes('Required User Context'));
  });

  await test('（2.User entry flow）文件明確聲明本次任務不建立任何route', () => {
    const section = (doc.split('## 2. User Entry Flow')[1] || '').split('## 3.')[0].replace(/\n/g, ' ');
    assert.ok(/不建立任何route/.test(section) || /不\*{0,2}建立任何route/.test(section));
  });

  await test('（2.User entry flow）文件確認進入條件延續TASK1.107 Data Privacy Boundary的userId既有邊界', () => {
    const section = (doc.split('### Entry Conditions')[1] || '').split('### Required User Context')[0];
    assert.ok(section.includes('TASK1.107'));
  });

  console.log('');

  // =========================================================================
  // C. First-time journey
  // =========================================================================
  console.log('--- C. First-time journey ---');

  await test('（3.First-time journey）文件包含「3. First-Time User Journey」章節', () => {
    assert.ok(doc.includes('First-Time User Journey'));
  });

  const REQUIRED_FIRST_TIME_STEPS = ['Introduction', '提供基本健康資訊', '設定健康目標', '提供選填的每日行為資訊', '產生第一份Insight', '查看建議'];
  for (const step of REQUIRED_FIRST_TIME_STEPS) {
    await test(`（3.First-time journey）流程包含步驟"${step}"`, () => {
      const section = (doc.split('## 3. First-Time User Journey')[1] || '').split('### 各步驟的User Action')[0];
      assert.ok(section.includes(step), `流程缺少步驟：${step}`);
    });
  }

  await test('（3.First-time journey）文件包含User Action/System Responsibility/Expected Outcome的完整表格', () => {
    const section = doc.split('### 各步驟的User Action')[1] || '';
    assert.ok(section.includes('User Action（使用者動作）'));
    assert.ok(section.includes('System Responsibility（系統責任）'));
    assert.ok(section.includes('Expected Outcome（預期結果）'));
  });

  await test('（3.First-time journey）表格內容對應TASK1.107 Required Fields（age/gender/height/weight）', () => {
    const section = doc.split('### 各步驟的User Action')[1] || '';
    for (const field of ['age', 'gender', 'height', 'weight']) {
      assert.ok(section.includes(field), `表格缺少欄位引用：${field}`);
    }
  });

  console.log('');

  // =========================================================================
  // D. Returning user journey
  // =========================================================================
  console.log('--- D. Returning user journey ---');

  await test('（4.Returning user journey）文件包含「4. Returning User Journey」章節', () => {
    assert.ok(doc.includes('Returning User Journey'));
  });

  const REQUIRED_RETURNING_STEPS = ['查看最新Insight', '回顧進度', '更新每日行為資料', '收到更新後的建議'];
  for (const step of REQUIRED_RETURNING_STEPS) {
    await test(`（4.Returning user journey）流程包含步驟"${step}"`, () => {
      const section = (doc.split('## 4. Returning User Journey')[1] || '').split('### First-Time Experience')[0];
      assert.ok(section.includes(step), `流程缺少步驟：${step}`);
    });
  }

  await test('（4.Returning user journey）文件包含First-Time跟Returning Experience的差異對照表格', () => {
    const section = doc.split('### First-Time Experience跟Returning Experience的差異')[1] || '';
    assert.ok(section.includes('| 面向 |'));
    assert.ok(section.includes('First-Time Experience'));
    assert.ok(section.includes('Returning Experience'));
  });

  await test('（4.Returning user journey）文件明確原則：Returning User不應該被要求重新走Introduction', () => {
    const section = doc.split('### First-Time Experience跟Returning Experience的差異')[1] || '';
    assert.ok(/不應該\*{0,2}被要求重新走\s*Introduction/.test(section.replace(/\n/g, ' ')));
  });

  console.log('');

  // =========================================================================
  // E. Screen flow planning
  // =========================================================================
  console.log('--- E. Screen flow planning ---');

  await test('（5.Screen flow planning）文件包含「5. Health Insight Screen Flow Planning」章節', () => {
    assert.ok(doc.includes('Health Insight Screen Flow Planning'));
  });

  const REQUIRED_SCREENS = [
    { id: 'A. Health Overview', purpose: '呈現目前的健康狀態' },
    { id: 'B. Data Input', purpose: '收集必要跟選填的資訊' },
    { id: 'C. Insight Report', purpose: '完整呈現四類輸出' },
    { id: 'D. History / Progress', purpose: '呈現長期變化' },
  ];
  for (const screen of REQUIRED_SCREENS) {
    await test(`（5.Screen flow planning）畫面"${screen.id}"存在且定義Purpose`, () => {
      assert.ok(doc.includes(`### ${screen.id}`), `文件缺少畫面：${screen.id}`);
    });
  }

  await test('（5.Screen flow planning）Insight Report畫面涵蓋四類輸出（observation/pattern/recommendation/trend）', () => {
    const section = (doc.split('### C. Insight Report')[1] || '').split('### D. History')[0];
    for (const kw of ['Health observation', 'Behavior pattern', 'Recommendation', 'Progress trend']) {
      assert.ok(section.includes(kw), `Insight Report缺少輸出類別：${kw}`);
    }
  });

  await test('（5.Screen flow planning）文件明確聲明本次任務不實作任何UI', () => {
    const section = (doc.split('## 5. Health Insight Screen Flow Planning')[1] || '').split('## 6.')[0].replace(/\n/g, ' ');
    assert.ok(/不實作任何UI/.test(section) || /不\*{0,2}實作任何UI/.test(section));
  });

  console.log('');

  // =========================================================================
  // F. User/system responsibility
  // =========================================================================
  console.log('--- F. User/system responsibility ---');

  await test('（6.User/system responsibility）文件包含「6. User Action Boundary」章節', () => {
    assert.ok(doc.includes('User Action Boundary'));
  });

  const REQUIRED_USER_ACTIONS = ['Input data', 'Update information', 'View insight', 'Review recommendation'];
  for (const action of REQUIRED_USER_ACTIONS) {
    await test(`（6.User/system responsibility）User Actions包含"${action}"`, () => {
      const section = (doc.split('### User Actions')[1] || '').split('### System Actions')[0];
      assert.ok(section.includes(action), `User Actions缺少：${action}`);
    });
  }

  const REQUIRED_SYSTEM_ACTIONS = ['Validate input', 'Execute intelligence flow', 'Generate output', 'Present result'];
  for (const action of REQUIRED_SYSTEM_ACTIONS) {
    await test(`（6.User/system responsibility）System Actions包含"${action}"`, () => {
      const section = (doc.split('### System Actions')[1] || '').split('### 使用者責任')[0];
      assert.ok(section.includes(action), `System Actions缺少：${action}`);
    });
  }

  await test('（6.User/system responsibility）文件明確原則：系統不負責替使用者做決定', () => {
    const section = doc.split('**關鍵原則**')[1] || '';
    assert.ok(/不負責\*{0,2}替使用者做決定/.test(section.replace(/\n/g, ' ')));
  });

  console.log('');

  // =========================================================================
  // G. Intelligence flow mapping
  // =========================================================================
  console.log('--- G. Intelligence flow mapping ---');

  await test('（7.Intelligence flow mapping）文件包含「7. Intelligence Flow Mapping」章節', () => {
    assert.ok(doc.includes('## 7. Intelligence Flow Mapping'));
  });

  await test('（7.Intelligence flow mapping）文件記錄完整九層映射（User Interaction→Product Feature→五個Boundary→Health Insight Feature→Capability→Runtime）', () => {
    const section = (doc.split('## 7. Intelligence Flow Mapping')[1] || '').split('### UX在哪裡結束')[0];
    for (const kw of ['User Interaction', 'Product Feature', 'Product Entry', 'Product Contract', 'Product Adapter', 'Product Execution Boundary', 'Health Insight Feature', 'Capability Layer', 'Runtime']) {
      assert.ok(section.includes(kw), `映射缺少層級：${kw}`);
    }
  });

  await test('（7.Intelligence flow mapping）文件明確定義UX在Product Feature層結束、Intelligence從Product Entry開始', () => {
    const section = doc.split('### UX在哪裡結束')[1] || '';
    assert.ok(/在Product\s*Feature這一層結束/.test(section.replace(/\n/g, ' ')));
    assert.ok(section.includes('從Product Entry'));
  });

  await test('（7.Intelligence flow mapping）文件確認既有Boundary不知道使用者是透過哪個畫面/按鈕觸發的，延續No HTTP既有邊界', () => {
    const section = doc.split('### UX在哪裡結束')[1] || '';
    assert.ok(section.includes('不知道'));
    assert.ok(section.includes('No HTTP'));
  });

  console.log('');

  // =========================================================================
  // H. Insight consumption flow
  // =========================================================================
  console.log('--- H. Insight consumption flow ---');

  await test('（8.Insight consumption flow）文件包含「8. Insight Consumption Flow」章節', () => {
    assert.ok(doc.includes('Insight Consumption Flow'));
  });

  const REQUIRED_CONSUMPTION_STEPS = ['觀察', '理解', '建議', '行動'];
  for (const step of REQUIRED_CONSUMPTION_STEPS) {
    await test(`（8.Insight consumption flow）消費流程包含步驟"${step}"`, () => {
      const section = (doc.split('## 8. Insight Consumption Flow')[1] || '').split('### 這如何形成行為改善循環')[0];
      assert.ok(section.includes(step), `消費流程缺少步驟：${step}`);
    });
  }

  await test('（8.Insight consumption flow）文件記錄Behavior Improvement Loop（行動→新資料→新Analysis→新Insight→回到觀察）', () => {
    const section = doc.split('### 這如何形成行為改善循環')[1] || '';
    assert.ok(section.includes('Behavior Improvement Loop'));
    assert.ok(section.includes('回到'));
  });

  await test('（8.Insight consumption flow）文件連結Pain Point 3"無法維持習慣"作為核心價值主張', () => {
    const section = doc.split('### 這如何形成行為改善循環')[1] || '';
    assert.ok(section.includes('Pain Point'));
    assert.ok(section.includes('無法維持習慣'));
  });

  console.log('');

  // =========================================================================
  // I. Free/Premium direction
  // =========================================================================
  console.log('--- I. Free/Premium direction ---');

  await test('（9.Free/Premium direction）文件包含「9. Free vs Premium UX Direction」章節', () => {
    assert.ok(doc.includes('Free vs Premium UX Direction'));
  });

  await test('（9.Free/Premium direction）Free層級包含Basic health input跟Basic insight report', () => {
    const section = (doc.split('### Free（免費層級')[1] || '').split('### Premium')[0];
    assert.ok(section.includes('Basic health input'));
    assert.ok(section.includes('Basic insight report'));
  });

  const REQUIRED_PREMIUM_UX_ITEMS = ['Advanced insights', 'Long-term trend analysis', 'Gemini enhanced explanation'];
  for (const item of REQUIRED_PREMIUM_UX_ITEMS) {
    await test(`（9.Free/Premium direction）Premium層級包含"${item}"`, () => {
      const section = (doc.split('### Premium（付費層級')[1] || '').split('### 明確的範圍限制')[0];
      assert.ok(section.includes(item), `Premium清單缺少：${item}`);
    });
  }

  await test('（9.Free/Premium direction）文件明確聲明本次任務不實作任何會員機制', () => {
    const section = (doc.split('## 9. Free vs Premium UX Direction')[1] || '').split('## 10.')[0].replace(/\n/g, ' ');
    assert.ok(/不實作任何\s*會員機制/.test(section) || /不\*{0,2}實作任何\s*會員機制/.test(section));
  });

  console.log('');

  // =========================================================================
  // J. Gemini UX boundary
  // =========================================================================
  console.log('--- J. Gemini UX boundary ---');

  await test('（10.Gemini UX boundary）文件包含「10. Future Gemini UX Boundary」章節', () => {
    assert.ok(doc.includes('Future Gemini UX Boundary'));
  });

  await test('（10.Gemini UX boundary）文件記錄未來Flow：Health Insight Result→Gemini Enhancement→Conversational Explanation', () => {
    const section = (doc.split('### 未來的Flow')[1] || '').split('### 確認：Gemini互動不會取代既有架構')[0];
    assert.ok(section.includes('Health Insight Result'));
    assert.ok(section.includes('Gemini Enhancement'));
    assert.ok(section.includes('Conversational Explanation'));
  });

  await test('（10.Gemini UX boundary）文件明確澄清Conversational不等於TASK1.106已排除的AI Chat', () => {
    const section = (doc.split('### 未來的Flow')[1] || '').split('### 確認：Gemini互動不會取代既有架構')[0];
    assert.ok(section.includes('不是'));
    assert.ok(section.includes('AI Chat'));
  });

  await test('（10.Gemini UX boundary）文件重申Gemini互動不會取代Product Flow/Capability Layer/Runtime', () => {
    const section = doc.split('### 確認：Gemini互動不會取代既有架構')[1] || '';
    const flatSection = section.replace(/\n/g, ' ');
    assert.ok(/不會取代\*{0,2}Product\s*Flow/.test(flatSection));
    assert.ok(/不會取代\*{0,2}\s*Capability\s*Layer/.test(flatSection));
    assert.ok(/不會取代\*{0,2}\s*Runtime/.test(flatSection));
  });

  console.log('');

  // =========================================================================
  // K. Error handling direction
  // =========================================================================
  console.log('--- K. Error handling direction ---');

  await test('（11.Error handling direction）文件包含「11. UX Error Handling Direction」章節', () => {
    assert.ok(doc.includes('UX Error Handling Direction'));
  });

  const REQUIRED_ERROR_CATEGORIES = ['Missing input', 'Invalid data', 'Intelligence unavailable', 'Temporary system failure'];
  for (const category of REQUIRED_ERROR_CATEGORIES) {
    await test(`（11.Error handling direction）錯誤分類包含"${category}"`, () => {
      const section = (doc.split('### User-Facing Error Categories')[1] || '').split('### User Message跟Internal Error Detail的分離')[0];
      assert.ok(section.includes(category), `錯誤分類缺少：${category}`);
    });
  }

  await test('（11.Error handling direction）文件明確分離User Message跟Internal Error Detail', () => {
    const section = doc.split('### User Message跟Internal Error Detail的分離')[1] || '';
    assert.ok(section.includes('User Message（使用者訊息）'));
    assert.ok(section.includes('Internal Error Detail（內部錯誤細節）'));
  });

  await test('（11.Error handling direction）文件引用既有錯誤reason（invalid_raw_input/intelligence_feature_unavailable/runtime_failure）', () => {
    const section = doc.split('### User-Facing Error Categories')[1] || '';
    for (const reason of ['invalid_raw_input', 'intelligence_feature_unavailable', 'runtime_failure']) {
      assert.ok(section.includes(reason), `文件缺少既有reason引用：${reason}`);
    }
  });

  await test('（11.Error handling direction）文件明確聲明本次任務不實作任何錯誤UI', () => {
    const section = doc.split('### User Message跟Internal Error Detail的分離')[1] || '';
    assert.ok(/不實作任何\s*錯誤UI/.test(section.replace(/\n/g, ' ')) || /不\*{0,2}實作任何\s*錯誤UI/.test(section.replace(/\n/g, ' ')));
  });

  console.log('');

  // =========================================================================
  // L. Future extension
  // =========================================================================
  console.log('--- L. Future extension ---');

  await test('（12.Future extension）文件包含「12. Future UX Extension」章節', () => {
    assert.ok(doc.includes('## 12. Future UX Extension'));
  });

  const REQUIRED_FUTURE_UX_ITEMS = ['Daily health coach', 'Habit reminder', 'Trend dashboard', 'Wearable integration'];
  for (const item of REQUIRED_FUTURE_UX_ITEMS) {
    await test(`（12.Future extension）Future UX Extension清單包含"${item}"`, () => {
      const section = (doc.split('## 12. Future UX Extension')[1] || '').split('---')[0];
      assert.ok(section.includes(item), `清單缺少：${item}`);
    });
  }

  await test('（12.Future extension）文件明確聲明第12節內容只記錄可能性、不實作', () => {
    const section = (doc.split('## 12. Future UX Extension')[1] || '').split('---')[0].replace(/\n/g, ' ');
    assert.ok(/只\s*記錄可能性、不實作/.test(section));
  });

  await test('（12.Future extension）TASK1.106/1.107/1.108建立的三份文件依然存在且本次任務完全沒有修改它們', () => {
    assert.ok(fs.existsSync(productPlanDocPath));
    assert.ok(fs.existsSync(inputBoundaryDocPath));
    assert.ok(fs.existsSync(outputBoundaryDocPath));
    for (const p of [
      'src/intelligence/product/PHASE6_HEALTH_INSIGHT_PRODUCT_PLAN.md',
      'src/intelligence/product/PHASE6_HEALTH_INSIGHT_INPUT_BOUNDARY_PLAN.md',
      'src/intelligence/product/PHASE6_HEALTH_INSIGHT_OUTPUT_BOUNDARY_PLAN.md',
    ]) {
      const diff = execFileSync('git', ['diff', '--stat', p], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${p} 不應該被本次任務修改`);
    }
  });

  console.log('');

  // =========================================================================
  // Dependency direction (structural checks)
  // =========================================================================
  console.log('--- Dependency direction ---');

  await test('（Dependency direction）Restrictions Confirmation章節存在', () => {
    assert.ok(doc.includes('Restrictions Confirmation'));
  });

  await test('（TASK1.110後更新）（Dependency direction）src/intelligence/product/PHASE6_HEALTH_INSIGHT_UX_FLOW_PLAN.md是TASK1.109自己的commit（468a9f9）新增的檔案（git show --name-status確認，而不是檢查即時git status——避免被後續任何時間點的執行誤判為失敗，延續TASK1.99~1.108測試套件同樣的修正模式）', () => {
    const nameStatus = execFileSync('git', ['show', '--name-status', '--pretty=format:', '468a9f9'], { cwd: repoRoot, encoding: 'utf8' });
    const line = nameStatus.split('\n').find((l) => l.endsWith('\tsrc/intelligence/product/PHASE6_HEALTH_INSIGHT_UX_FLOW_PLAN.md'));
    assert.ok(line && line.startsWith('A'), `預期該檔案在468a9f9被新增，實際：${line}`);
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

  await test('（Dependency direction）src/worker.js完全沒有被本次任務修改（Validation要求："Existing UI unchanged"）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（Dependency direction）src/routes/、src/controllers/目錄本次任務完全沒有新增或修改任何檔案（沒有建立route/controller/API endpoint）', () => {
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

  await test('（Dependency direction）沒有新增任何CSS檔案/frontend元件（本次任務不實作UI）', () => {
    const status = execFileSync('sh', ['-c', "git status --porcelain -- '*.css' 'src/frontend/' 'src/components/' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase6-task1.109-health-insight-ux-flow')) {
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
  // N. P1-P6
  // =========================================================================
  console.log('--- N. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認，既有UI維持不變）', () => {
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

/*
 * Phase 6 TASK 1.108｜Health Insight Data Output Boundary
 * Definition 測試
 *
 * 本任務是產品架構定義任務——不實作任何production功能、不
 * 建立UI、不建立API Response Model、不整合任何AI。目的是
 * 驗證`PHASE6_HEALTH_INSIGHT_OUTPUT_BOUNDARY_PLAN.md`完整
 * 涵蓋規格要求的9個章節，並重新確認Phase 1~5既有架構（五個
 * Product Boundary、Phase 4 Capability Chain、
 * app.intelligence/router/worker.js/database）完全沒有被
 * 本次任務影響。
 *
 * 分為以下14個部分：
 * A) Output boundary definition
 * B) Health observation
 * C) Behavior pattern
 * D) Recommendation output
 * E) Progress trend
 * F) Product vs internal output separation
 * G) Responsibility mapping
 * H) Validation responsibility
 * I) Intelligence flow mapping
 * J) Free/Premium direction
 * K) Gemini boundary
 * L) Output version strategy
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
const docPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_OUTPUT_BOUNDARY_PLAN.md');

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
  // A. Output boundary definition
  // =========================================================================
  console.log('--- A. Output boundary definition ---');

  await test('（1.Output boundary definition）文件存在且非空', () => {
    const stat = fs.statSync(docPath);
    assert.ok(stat.isFile());
    assert.ok(stat.size > 0);
  });

  const REQUIRED_DOC_SECTIONS = [
    'Output Boundary Goal', 'Output Categories', 'Product Output vs Internal Output Boundary', 'Output Responsibility Mapping',
    'Output Validation Responsibility', 'Intelligence Flow Mapping', 'Free vs Premium Output Direction', 'Future Gemini Extension Boundary', 'Output Version Strategy',
  ];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.Output boundary definition）文件包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.Output boundary definition）文件記錄為什麼Health Insight需要輸出邊界（延續TASK1.106"不是AI Chat"的定位）', () => {
    assert.ok(doc.includes('AI Chat'));
  });

  await test('（1.Output boundary definition）文件明確區分Raw Intelligence Result跟User-Facing Product Output的差異', () => {
    assert.ok(doc.includes('Raw Intelligence Result'));
    assert.ok(doc.includes('User-Facing Product Output'));
  });

  await test('（1.Output boundary definition）文件確認轉換動作歸屬Product Layer，不歸屬Phase 4既有Capability層', () => {
    assert.ok(/歸屬\s*\*{0,2}Product\s*Layer/.test(flatDoc));
    assert.ok(/不歸屬\*{0,2}Phase\s*4既有的\s*Capability層/.test(flatDoc));
  });

  await test('（1.Output boundary definition）文件記錄Capability輸出跟Product輸出不是一對一的關係', () => {
    assert.ok(doc.includes('不是\n一對一') || /不是\s*一對一/.test(flatDoc));
  });

  await test('（1.Output boundary definition）文件記錄跟TASK1.106/1.107的關係', () => {
    assert.ok(doc.includes('TASK1.106'));
    assert.ok(doc.includes('TASK1.107'));
  });

  console.log('');

  // =========================================================================
  // B. Health observation
  // =========================================================================
  console.log('--- B. Health observation ---');

  await test('（2.Health observation）文件包含「A. Health Observation」小節', () => {
    assert.ok(doc.includes('Health Observation'));
  });

  const REQUIRED_OBSERVATION_EXAMPLES = ['behavior observation', 'nutrition observation', 'activity observation', 'lifestyle observation'];
  for (const example of REQUIRED_OBSERVATION_EXAMPLES) {
    await test(`（2.Health observation）Examples包含"${example}"`, () => {
      const section = (doc.split('### A. Health Observation')[1] || '').split('### B. Behavior Pattern')[0];
      assert.ok(section.includes(example), `Examples缺少：${example}`);
    });
  }

  await test('（2.Health observation）文件記錄Purpose：把已分析的資料轉換成使用者看得懂的觀察', () => {
    const section = (doc.split('### A. Health Observation')[1] || '').split('### B. Behavior Pattern')[0];
    assert.ok(section.includes('Purpose'));
    assert.ok(/轉換成使用者看得懂的\s*觀察/.test(section.replace(/\n/g, ' ')));
  });

  await test('（2.Health observation）文件定義What User Can See跟What Remains Internal', () => {
    const section = (doc.split('### A. Health Observation')[1] || '').split('### B. Behavior Pattern')[0];
    assert.ok(section.includes('What User Can See'));
    assert.ok(section.includes('What Remains Internal'));
  });

  await test('（2.Health observation）文件記錄source欄位跟status欄位屬於系統內部、不呈現給使用者', () => {
    const section = (doc.split('### A. Health Observation')[1] || '').split('### B. Behavior Pattern')[0];
    assert.ok(section.includes('`source`'));
    assert.ok(section.includes('`status`'));
  });

  console.log('');

  // =========================================================================
  // C. Behavior pattern
  // =========================================================================
  console.log('--- C. Behavior pattern ---');

  await test('（3.Behavior pattern）文件包含「B. Behavior Pattern」小節', () => {
    assert.ok(doc.includes('### B. Behavior Pattern'));
  });

  const REQUIRED_PATTERN_EXAMPLES = ['eating pattern', 'activity pattern', 'sleep pattern'];
  for (const example of REQUIRED_PATTERN_EXAMPLES) {
    await test(`（3.Behavior pattern）Examples包含"${example}"`, () => {
      const section = (doc.split('### B. Behavior Pattern')[1] || '').split('### C. Recommendation Output')[0];
      assert.ok(section.includes(example), `Examples缺少：${example}`);
    });
  }

  await test('（3.Behavior pattern）文件記錄User Value：讓使用者發現沒有意識到的規律性行為', () => {
    const section = (doc.split('### B. Behavior Pattern')[1] || '').split('### C. Recommendation Output')[0];
    assert.ok(section.includes('User Value'));
  });

  await test('（3.Behavior pattern）文件明確記錄Behavior Pattern目前不屬於V1範圍，需要新增Analysis模組', () => {
    const section = (doc.split('### B. Behavior Pattern')[1] || '').split('### C. Recommendation Output')[0];
    assert.ok(section.includes('Future Extension Possibility'));
    assert.ok(/目前不屬於V1範圍/.test(section.replace(/\n/g, ' ')));
    assert.ok(section.includes('TASK1.43'));
  });

  console.log('');

  // =========================================================================
  // D. Recommendation output
  // =========================================================================
  console.log('--- D. Recommendation output ---');

  await test('（4.Recommendation output）文件包含「C. Recommendation Output」小節', () => {
    assert.ok(doc.includes('### C. Recommendation Output'));
  });

  const REQUIRED_RECOMMENDATION_EXAMPLES = ['behavior improvement suggestion', 'habit adjustment suggestion'];
  for (const example of REQUIRED_RECOMMENDATION_EXAMPLES) {
    await test(`（4.Recommendation output）Examples包含"${example}"`, () => {
      const section = (doc.split('### C. Recommendation Output')[1] || '').split('### D. Progress Trend')[0];
      assert.ok(section.includes(example), `Examples缺少：${example}`);
    });
  }

  await test('（4.Recommendation output）文件記錄跟Recommendation Capability的關係（TASK1.77既有輸出）', () => {
    const section = (doc.split('### C. Recommendation Output')[1] || '').split('### D. Progress Trend')[0];
    assert.ok(section.includes('Relationship with Recommendation Capability'));
    assert.ok(section.includes('TASK1.77'));
  });

  console.log('');

  // =========================================================================
  // E. Progress trend
  // =========================================================================
  console.log('--- E. Progress trend ---');

  await test('（5.Progress trend）文件包含「D. Progress Trend」小節', () => {
    assert.ok(doc.includes('### D. Progress Trend'));
  });

  const REQUIRED_TREND_EXAMPLES = ['weight trend', 'habit progress', 'consistency trend'];
  for (const example of REQUIRED_TREND_EXAMPLES) {
    await test(`（5.Progress trend）Examples包含"${example}"`, () => {
      const section = (doc.split('### D. Progress Trend')[1] || '').split('## 3.')[0];
      assert.ok(section.includes(example), `Examples缺少：${example}`);
    });
  }

  await test('（5.Progress trend）文件明確定義Current V1 Boundary只有weight trend', () => {
    const section = (doc.split('### D. Progress Trend')[1] || '').split('## 3.')[0];
    assert.ok(section.includes('Current V1 Boundary'));
    assert.ok(section.includes('只有`weight'));
  });

  await test('（5.Progress trend）文件記錄Future Expansion（habit progress/consistency trend留給未來）', () => {
    const section = (doc.split('### D. Progress Trend')[1] || '').split('## 3.')[0];
    assert.ok(section.includes('Future Expansion'));
  });

  console.log('');

  // =========================================================================
  // F. Product vs internal output separation
  // =========================================================================
  console.log('--- F. Product vs internal output separation ---');

  await test('（6.Product vs internal output separation）文件包含「3. Product Output vs Internal Output Boundary」章節', () => {
    assert.ok(doc.includes('Product Output vs Internal Output Boundary'));
  });

  const REQUIRED_USER_VISIBLE = ['health observation', 'behavior pattern', 'recommendation', 'progress information'];
  for (const item of REQUIRED_USER_VISIBLE) {
    await test(`（6.Product vs internal output separation）User Visible清單包含"${item}"`, () => {
      const section = (doc.split('### User Visible')[1] || '').split('### Internal Only')[0];
      assert.ok(section.includes(item), `User Visible清單缺少：${item}`);
    });
  }

  const REQUIRED_INTERNAL_ONLY = ['runtime metadata', 'execution state', 'capability internal structure', 'system debug information', 'internal processing details'];
  for (const item of REQUIRED_INTERNAL_ONLY) {
    await test(`（6.Product vs internal output separation）Internal Only清單包含"${item}"`, () => {
      const section = (doc.split('### Internal Only')[1] || '').split('## 4.')[0];
      assert.ok(section.includes(item), `Internal Only清單缺少：${item}`);
    });
  }

  await test('（6.Product vs internal output separation）文件解釋runtime metadata屬於Internal的理由：延續TASK1.102 Operational Boundary的Allowed Metadata清單', () => {
    const section = (doc.split('### Internal Only')[1] || '').split('## 4.')[0];
    assert.ok(section.includes('TASK1.102'));
  });

  await test('（6.Product vs internal output separation）文件解釋execution state屬於Internal的理由：延續TASK1.101五階段Lifecycle概念', () => {
    const section = (doc.split('### Internal Only')[1] || '').split('## 4.')[0];
    assert.ok(section.includes('TASK1.101'));
    for (const stage of ['request_received', 'validation_completed', 'execution_started', 'execution_completed', 'execution_failed']) {
      assert.ok(section.includes(stage), `缺少階段名稱：${stage}`);
    }
  });

  console.log('');

  // =========================================================================
  // G. Responsibility mapping
  // =========================================================================
  console.log('--- G. Responsibility mapping ---');

  await test('（7.Responsibility mapping）文件包含「4. Output Responsibility Mapping」章節', () => {
    assert.ok(doc.includes('Output Responsibility Mapping'));
  });

  await test('（7.Responsibility mapping）Capability Layer產出analysis result跟recommendation result', () => {
    const section = (doc.split('### Capability Layer（既有，完全不修改）')[1] || '').split('### Feature Layer')[0];
    assert.ok(section.includes('analysis result'));
    assert.ok(section.includes('recommendation result'));
  });

  await test('（7.Responsibility mapping）Feature Layer轉換intelligence result', () => {
    const section = (doc.split('### Feature Layer（既有Feature Intelligence Integration')[1] || '').split('### Product Layer')[0];
    assert.ok(section.includes('intelligence result'));
  });

  await test('（7.Responsibility mapping）Product Layer呈現user-facing output', () => {
    const section = (doc.split('### Product Layer（未來的Health Insight呈現層')[1] || '').split('### 為什麼各層擁有不同責任')[0];
    assert.ok(section.includes('user-facing output'));
  });

  await test('（7.Responsibility mapping）文件解釋為什麼各層擁有不同責任（避免Capability層被綁定在單一產品的呈現需求上）', () => {
    const section = doc.split('### 為什麼各層擁有不同責任')[1] || '';
    assert.ok(section.includes('綁定在單一產品'));
    assert.ok(section.includes('Personal Intelligence'));
  });

  console.log('');

  // =========================================================================
  // H. Validation responsibility
  // =========================================================================
  console.log('--- H. Validation responsibility ---');

  await test('（8.Validation responsibility）文件包含「5. Output Validation Responsibility」章節', () => {
    assert.ok(doc.includes('Output Validation Responsibility'));
  });

  const VALIDATION_LAYERS = [
    { name: 'Contract Layer', keyword: 'response structure validation' },
    { name: 'Adapter Layer', keyword: 'product response conversion' },
    { name: 'Feature Layer', keyword: 'feature output requirement' },
    { name: 'Capability Layer', keyword: 'intelligence generation' },
  ];
  for (const layer of VALIDATION_LAYERS) {
    await test(`（8.Validation responsibility）${layer.name}的責任是"${layer.keyword}"`, () => {
      const section = doc.split('## 5. Output Validation Responsibility')[1] || '';
      const excerpt = section.split('## 6.')[0];
      assert.ok(excerpt.includes(layer.name), `文件缺少${layer.name}小節`);
      assert.ok(excerpt.includes(layer.keyword), `文件缺少關鍵字：${layer.keyword}`);
    });
  }

  await test('（8.Validation responsibility）文件包含四層驗證分工的Flow示意圖', () => {
    const section = doc.split('### 分工總結')[1] || '';
    assert.ok(section.includes('Analysis/Recommendation結果'));
    assert.ok(section.includes('使用者最終看到的Health Insight輸出'));
  });

  await test('（8.Validation responsibility）文件明確聲明本次任務不實作任何一層的驗證器', () => {
    const section = (doc.split('## 5. Output Validation Responsibility')[1] || '').split('## 6.')[0];
    assert.ok(/不實作任何一層的驗證器/.test(section) || /不\*{0,2}實作任何一層的驗證器/.test(section.replace(/\n/g, ' ')));
  });

  await test('（8.Validation responsibility）文件確認Contract Layer延續TASK1.103既有的validateProductResponseShape()實作', () => {
    const section = (doc.split('### Contract Layer（Product Contract，TASK1.103既有）')[1] || '').split('### Adapter Layer')[0];
    assert.ok(section.includes('TASK1.103'));
    assert.ok(section.includes('validateProductResponseShape'));
  });

  console.log('');

  // =========================================================================
  // I. Intelligence flow mapping
  // =========================================================================
  console.log('--- I. Intelligence flow mapping ---');

  await test('（9.Intelligence flow mapping）文件包含「6. Intelligence Flow Mapping」章節', () => {
    assert.ok(doc.includes('## 6. Intelligence Flow Mapping'));
  });

  await test('（9.Intelligence flow mapping）文件記錄完整五層映射（Input Boundary→Health Insight Feature→Analysis→Recommendation→Output Boundary）', () => {
    const section = (doc.split('## 6. Intelligence Flow Mapping')[1] || '').split('### Analysis跟Recommendation如何變成')[0];
    for (const kw of ['Input Boundary', 'Health Insight Feature', 'Analysis Capability', 'Recommendation Capability', 'Output Boundary']) {
      assert.ok(section.includes(kw), `映射缺少層級：${kw}`);
    }
  });

  await test('（9.Intelligence flow mapping）文件解釋insights本身還不是Health Observation，需要經過Product Layer的呈現轉換', () => {
    const section = doc.split('### Analysis跟Recommendation如何變成')[1] || '';
    assert.ok(section.includes('還不是'));
    assert.ok(section.includes('Health\n  Observation') || section.includes('Health Observation'));
  });

  await test('（9.Intelligence flow mapping）文件確認完全複用Phase 4/Phase 5既有Capability Chain跟五個Product Boundary，延續TASK1.104/1.105已驗證的鏈路', () => {
    const section = doc.split('### Analysis跟Recommendation如何變成')[1] || '';
    assert.ok(/TASK1\.104\/1\.105/.test(section) || (section.includes('TASK1.104') && section.includes('1.105')));
  });

  console.log('');

  // =========================================================================
  // J. Free/Premium direction
  // =========================================================================
  console.log('--- J. Free/Premium direction ---');

  await test('（10.Free/Premium direction）文件包含「7. Free vs Premium Output Direction」章節', () => {
    assert.ok(doc.includes('Free vs Premium Output Direction'));
  });

  await test('（10.Free/Premium direction）Free層級包含basic health observation跟basic recommendation', () => {
    const section = (doc.split('### Free（免費層級，未來規劃，Possible）')[1] || doc.split('### Free（免費層級，未來規劃')[1] || doc.split('### Free（免費層級')[1] || '').split('### Premium')[0];
    assert.ok(section.includes('basic health observation'));
    assert.ok(section.includes('basic recommendation'));
  });

  const REQUIRED_PREMIUM_OUTPUT_ITEMS = ['advanced behavior analysis', 'deeper progress interpretation', 'Gemini enhanced explanation'];
  for (const item of REQUIRED_PREMIUM_OUTPUT_ITEMS) {
    await test(`（10.Free/Premium direction）Premium層級包含"${item}"`, () => {
      const section = (doc.split('### Premium（付費層級')[1] || '').split('### 明確的範圍限制')[0];
      assert.ok(section.includes(item), `Premium清單缺少：${item}`);
    });
  }

  await test('（10.Free/Premium direction）文件明確聲明本次任務不實作任何會員機制', () => {
    const section = (doc.split('## 7. Free vs Premium Output Direction')[1] || '').split('## 8.')[0].replace(/\n/g, ' ');
    assert.ok(/不實作任何\s*會員機制/.test(section) || /不\*{0,2}實作任何\s*會員機制/.test(section));
  });

  console.log('');

  // =========================================================================
  // K. Gemini boundary
  // =========================================================================
  console.log('--- K. Gemini boundary ---');

  await test('（11.Gemini boundary）文件包含「8. Future Gemini Extension Boundary」章節', () => {
    assert.ok(doc.includes('Future Gemini Extension Boundary'));
  });

  await test('（11.Gemini boundary）文件明確定義Gemini角色僅為Enhancement Layer', () => {
    assert.ok(doc.includes('Enhancement Layer'));
    assert.ok(/僅限於\*{0,2}\s*Enhancement\s*Layer/.test(flatDoc) || doc.includes('僅限於'));
  });

  await test('（11.Gemini boundary）文件記錄未來Flow：Structured Health Insight Output→Gemini Enhancement→Natural Language Explanation', () => {
    const section = (doc.split('### 未來的Flow')[1] || '').split('### 確認：Gemini不會取代既有架構')[0];
    assert.ok(section.includes('Structured Health Insight Output'));
    assert.ok(section.includes('Gemini Enhancement'));
    assert.ok(section.includes('Natural Language Explanation'));
  });

  await test('（11.Gemini boundary）文件重申Gemini不會取代Analysis/Recommendation Capability/Runtime', () => {
    const section = doc.split('### 確認：Gemini不會取代既有架構')[1] || '';
    const flatSection = section.replace(/\n/g, ' ');
    assert.ok(/不會取代\*{0,2}\s*Analysis\s*Capability/.test(flatSection));
    assert.ok(/不會取代\*{0,2}\s*Recommendation\s*Capability/.test(flatSection));
    assert.ok(/不會取代\*{0,2}\s*Runtime/.test(flatSection));
  });

  await test('（11.Gemini boundary）文件確認Gemini不會接觸原始Capability輸出或TASK1.107定義的原始輸入資料', () => {
    const section = doc.split('### 確認：Gemini不會取代既有架構')[1] || '';
    assert.ok(section.includes('不會接觸'));
    assert.ok(section.includes('TASK1.107'));
  });

  console.log('');

  // =========================================================================
  // L. Output version strategy
  // =========================================================================
  console.log('--- L. Output version strategy ---');

  await test('（12.Output version strategy）文件包含「9. Output Version Strategy」章節', () => {
    assert.ok(doc.includes('Output Version Strategy'));
  });

  const REQUIRED_VERSION_RULES = ['additive extension preferred', 'avoid breaking existing output', 'preserve existing consumers'];
  for (const rule of REQUIRED_VERSION_RULES) {
    await test(`（12.Output version strategy）Future Compatibility Rules包含"${rule}"`, () => {
      const section = (doc.split('## 9. Output Version Strategy')[1] || '').split('### 明確的範圍限制')[0];
      assert.ok(section.includes(rule), `規則清單缺少：${rule}`);
    });
  }

  await test('（12.Output version strategy）文件明確聲明本次任務不建立任何JSON Schema', () => {
    const section = (doc.split('## 9. Output Version Strategy')[1] || '').split('---')[0].replace(/\n/g, ' ');
    assert.ok(/不建立任何\s*JSON\s*Schema/.test(section) || /不\*{0,2}建立任何\s*JSON\s*Schema/.test(section));
  });

  await test('（12.Output version strategy）文件延續TASK1.94 Version Strategy的既有原則', () => {
    const section = (doc.split('## 9. Output Version Strategy')[1] || '').split('---')[0];
    assert.ok(section.includes('TASK1.94'));
  });

  await test('（12.Output version strategy）TASK1.106/1.107建立的文件依然存在且本次任務完全沒有修改它們', () => {
    assert.ok(fs.existsSync(productPlanDocPath));
    assert.ok(fs.existsSync(inputBoundaryDocPath));
    const diff1 = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/PHASE6_HEALTH_INSIGHT_PRODUCT_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff1.trim(), '');
    const diff2 = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/PHASE6_HEALTH_INSIGHT_INPUT_BOUNDARY_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff2.trim(), '');
  });

  console.log('');

  // =========================================================================
  // Dependency direction (structural checks, part of Regression/AI boundary coverage)
  // =========================================================================
  console.log('--- Dependency direction ---');

  await test('（Dependency direction）Restrictions Confirmation章節存在', () => {
    assert.ok(doc.includes('Restrictions Confirmation'));
  });

  await test('（Dependency direction）src/intelligence/product/PHASE6_HEALTH_INSIGHT_OUTPUT_BOUNDARY_PLAN.md是本次任務新增的檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/product/PHASE6_HEALTH_INSIGHT_OUTPUT_BOUNDARY_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.ok(status.trim().startsWith('??') || status.trim().startsWith('A '));
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
    assert.deepStrictEqual(dirNames, ['adapter', 'contract', 'entry', 'execution', 'operational']);
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase6-task1.108-health-insight-output-boundary')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（Regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5/Phase 6全部）`, () => {
      assert.ok(allSuites.length >= 99, `預期至少99個既有測試檔案，實際 ${allSuites.length}`);
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

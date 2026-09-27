/*
 * Phase 6 TASK 1.110｜Health Insight Product Implementation
 * Architecture Planning 測試
 *
 * 本任務是實作架構規劃任務——不實作任何production功能、UI、
 * frontend元件、route/controller、database schema，也不整合
 * 任何AI Provider。目的是驗證
 * `PHASE6_HEALTH_INSIGHT_IMPLEMENTATION_ARCHITECTURE_PLAN.md`
 * 完整涵蓋規格要求的12個章節，並重新確認Phase 1~5既有架構（五個
 * Product Boundary、Phase 4 Capability Chain、app.intelligence/
 * router/worker.js/database/既有UI）完全沒有被本次任務影響。
 *
 * 分為以下14個部分：
 * A) Implementation architecture goal
 * B) Existing architecture reuse
 * C) Health Insight flow
 * D) Component boundary
 * E) Protection boundary
 * F) Data flow planning
 * G) UI integration preparation
 * H) API preparation
 * I) Membership preparation
 * J) Gemini boundary
 * K) Implementation sequence
 * L) Risk assessment
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
const uxFlowDocPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_UX_FLOW_PLAN.md');
const docPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_IMPLEMENTATION_ARCHITECTURE_PLAN.md');

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
  // A. Implementation architecture goal
  // =========================================================================
  console.log('--- A. Implementation architecture goal ---');

  await test('（1.Implementation architecture goal）文件存在且非空', () => {
    const stat = fs.statSync(docPath);
    assert.ok(stat.isFile());
    assert.ok(stat.size > 0);
  });

  const REQUIRED_DOC_SECTIONS = [
    'Implementation Architecture Goal', 'Existing Architecture Reuse Analysis', 'Health Insight Implementation Flow',
    'New Component Boundary Planning', 'Existing Component Protection Boundary', 'Data Flow Implementation Planning',
    'UI Integration Preparation', 'API / Route Integration Preparation', 'Membership Integration Preparation',
    'Gemini Integration Preparation', 'Implementation Sequence Plan', 'Risk Assessment',
  ];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.Implementation architecture goal）文件包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.Implementation architecture goal）文件記錄為什麼需要實作規劃（避免重新實作既有能力/避免破壞既有邊界）', () => {
    const section = doc.split('### Why Implementation Planning Is Required')[1].split('### Relationship Between')[0];
    assert.ok(section.includes('重新實作'));
    assert.ok(section.includes('破壞'));
  });

  await test('（1.Implementation architecture goal）文件明確定義Product Definition跟Technical Implementation的關係（合約 vs 履行合約的方式）', () => {
    const section = doc.split('### Relationship Between Product Definition and Technical Implementation')[1].split('### Principles for Implementing')[0];
    assert.ok(section.includes('合約'));
  });

  await test('（1.Implementation architecture goal）文件定義三條實作原則（最大化重用/只認識下一層/新增優先於修改）', () => {
    const section = doc.split('### Principles for Implementing Health Insight Without Breaking Existing Architecture')[1].split('---')[0];
    assert.ok(section.includes('最大化重用'));
    assert.ok(section.includes('只認識下一層'));
    assert.ok(section.includes('新增優先於修改'));
  });

  await test('（1.Implementation architecture goal）文件記錄跟TASK1.106/1.107/1.108/1.109的關係', () => {
    for (const t of ['TASK1.106', 'TASK1.107', 'TASK1.108', 'TASK1.109']) {
      assert.ok(doc.includes(t), `文件缺少對${t}的引用`);
    }
  });

  await test('（1.Implementation architecture goal）文件記錄跟TASK1.98的類比關係', () => {
    assert.ok(doc.includes('TASK1.98'));
  });

  console.log('');

  // =========================================================================
  // B. Existing architecture reuse
  // =========================================================================
  console.log('--- B. Existing architecture reuse ---');

  await test('（2.Existing architecture reuse）文件包含「2. Existing Architecture Reuse Analysis」章節', () => {
    assert.ok(doc.includes('## 2. Existing Architecture Reuse Analysis'));
  });

  await test('（2.Existing architecture reuse）Product Layer小節列出五個既有Product Boundary且標記完全重用', () => {
    const section = doc.split('### Product Layer（Phase 5')[1].split('### Application/Feature Layer')[0];
    for (const boundary of ['Product Entry', 'Product Contract', 'Product Adapter', 'Product Execution', 'Product Operational']) {
      assert.ok(section.includes(boundary), `Product Layer小節缺少：${boundary}`);
    }
    assert.ok((section.match(/完全重用/g) || []).length >= 5);
  });

  await test('（2.Existing architecture reuse）Application/Feature Layer小節區分Health Insight Feature（需要新實作）跟既有Feature Pattern（不重用，平行路徑）', () => {
    const section = doc.split('### Application/Feature Layer')[1].split('### Capability Layer')[0];
    assert.ok(section.includes('需要新實作'));
    assert.ok(section.includes('平行'));
    assert.ok(section.includes('TASK1.79'));
  });

  await test('（2.Existing architecture reuse）Capability Layer小節確認Analysis/Recommendation完全重用、Decision保留選填不使用', () => {
    const section = doc.split('### Capability Layer（Phase 4')[1].split('### Runtime Layer')[0];
    assert.ok(section.includes('Analysis Capability'));
    assert.ok(section.includes('Recommendation Capability'));
    assert.ok(section.includes('Decision Capability'));
    assert.ok(section.includes('V1不使用') || section.includes('保留選填銜接點'));
  });

  await test('（2.Existing architecture reuse）Runtime Layer小節確認Analysis/Recommendation Runner完全重用、完全不修改', () => {
    const section = doc.split('### Runtime Layer（Phase 2')[1].split('### 重用分析總結表格')[0];
    assert.ok(section.includes('完全重用'));
    assert.ok(section.includes('完全不修改'));
  });

  await test('（2.Existing architecture reuse）文件包含重用分析總結表格，涵蓋Product/Feature/Capability/Runtime四層', () => {
    const section = doc.split('### 重用分析總結表格')[1].split('## 3. Health Insight Implementation Flow')[0];
    assert.ok(section.includes('| 層級 | 元件 | 重用狀態 |'));
    for (const kw of ['Product', 'Feature', 'Capability', 'Runtime']) {
      assert.ok(section.includes(kw), `總結表格缺少層級：${kw}`);
    }
  });

  console.log('');

  // =========================================================================
  // C. Health Insight flow
  // =========================================================================
  console.log('--- C. Health Insight flow ---');

  await test('（3.Health Insight flow）文件包含「3. Health Insight Implementation Flow」章節', () => {
    assert.ok(doc.includes('## 3. Health Insight Implementation Flow'));
  });

  await test('（3.Health Insight flow）文件記錄完整九層流程（User→Product Feature Entry→Product Contract→Product Adapter→Product Execution Boundary→Health Insight Feature→Analysis Capability→Recommendation Capability→Product Output）', () => {
    const section = doc.split('### 未來執行流程')[1].split('### 各層責任')[0];
    for (const kw of ['Product Feature Entry', 'Product Contract', 'Product Adapter', 'Product Execution Boundary', 'Health Insight Feature', 'Analysis Capability', 'Recommendation Capability', 'Product Output']) {
      assert.ok(section.includes(kw), `流程缺少層級：${kw}`);
    }
  });

  await test('（3.Health Insight flow）文件說明各層責任（Product Feature Entry/邊界層/Capability/Product Output）', () => {
    const section = doc.split('### 各層責任')[1].split('---')[0];
    assert.ok(section.includes('Product Feature Entry（Health Insight Feature）'));
    assert.ok(section.includes('透明代理'));
    assert.ok(section.includes('Product Output'));
  });

  console.log('');

  // =========================================================================
  // D. Component boundary
  // =========================================================================
  console.log('--- D. Component boundary ---');

  await test('（4.Component boundary）文件包含「4. New Component Boundary Planning」章節', () => {
    assert.ok(doc.includes('## 4. New Component Boundary Planning'));
  });

  const section4 = () => doc.split('## 4. New Component Boundary Planning')[1].split('## 5. Existing Component Protection Boundary')[0];

  await test('（4.Component boundary）Product小節提出Health Insight Product Feature並解釋為什麼歸屬Product層', () => {
    const section = section4().split('### Product（規格原文：Possible）')[1].split('### Feature（規格原文：Possible）')[0];
    assert.ok(section.includes('Health Insight Product Feature'));
    assert.ok(section.includes('為什麼歸屬Product層'));
  });

  await test('（4.Component boundary）Feature小節提出health_insight_feature並解釋為什麼歸屬Feature層', () => {
    const section = section4().split('### Feature（規格原文：Possible）')[1].split('### Capability（規格原文：Reuse）')[0];
    assert.ok(section.includes('health_insight_feature'));
    assert.ok(section.includes('為什麼歸屬Feature層'));
  });

  await test('（4.Component boundary）Capability小節明確標示Reuse，不新增任何Capability層元件', () => {
    const section = section4().split('### Capability（規格原文：Reuse）')[1].split('### 明確的範圍限制')[0];
    assert.ok(section.includes('不新增'));
  });

  await test('（4.Component boundary）文件明確聲明本次任務不實作上述任何新元件', () => {
    const section = section4().split('### 明確的範圍限制（規格原文要求）')[1];
    assert.ok(/不實作\*{0,2}上面列出的任何元件/.test(section.replace(/\n/g, ' ')));
  });

  console.log('');

  // =========================================================================
  // E. Protection boundary
  // =========================================================================
  console.log('--- E. Protection boundary ---');

  await test('（5.Protection boundary）文件包含「5. Existing Component Protection Boundary」章節', () => {
    assert.ok(doc.includes('## 5. Existing Component Protection Boundary'));
  });

  const REQUIRED_PROTECTED_COMPONENTS = ['Analysis Runner', 'Recommendation Runner', 'Phase 2 Runtime Orchestrator', 'Phase 3 Application Pattern', '既有Insight Feature', '既有Behavior Feature'];
  for (const comp of REQUIRED_PROTECTED_COMPONENTS) {
    await test(`（5.Protection boundary）確認不得修改的元件清單包含"${comp}"`, () => {
      const section = doc.split('### 確認不得修改的元件（規格原文列出的六項）')[1].split('### 為什麼保護這些元件')[0];
      assert.ok(section.includes(comp), `清單缺少：${comp}`);
    });
  }

  await test('（5.Protection boundary）文件解釋為什麼保護Analysis/Recommendation Runner（核心邏輯已反覆驗證，修改會影響所有依賴鏈路）', () => {
    const section = doc.split('### 為什麼保護這些元件（規格要求解釋理由）')[1].split('---')[0];
    assert.ok(section.includes('Analysis/Recommendation Runner'));
    assert.ok(section.includes('Personal Intelligence Platform'));
  });

  await test('（5.Protection boundary）文件解釋為什麼保護Phase 3 Application Pattern（跟Health Insight要用的路徑是平行、不同的鏈路）', () => {
    const section = doc.split('### 為什麼保護這些元件（規格要求解釋理由）')[1].split('---')[0];
    assert.ok(section.includes('Phase 3 Application Pattern'));
    assert.ok(section.includes('平行'));
  });

  await test('（5.Protection boundary）文件解釋為什麼保護既有Insight/Behavior Feature（服務不同情境，違反新增優先於修改原則）', () => {
    const section = doc.split('### 為什麼保護這些元件（規格要求解釋理由）')[1].split('---')[0];
    assert.ok(section.includes('既有Insight Feature/Behavior Feature'));
    assert.ok(section.includes('新增優先於修改'));
  });

  console.log('');

  // =========================================================================
  // F. Data flow planning
  // =========================================================================
  console.log('--- F. Data flow planning ---');

  await test('（6.Data flow planning）文件包含「6. Data Flow Implementation Planning」章節', () => {
    assert.ok(doc.includes('## 6. Data Flow Implementation Planning'));
  });

  await test('（6.Data flow planning）文件記錄完整五階段（Input→Validation→Transformation→Capability Execution→Output Mapping）', () => {
    const section = doc.split('### 完整映射')[1].split('### Where Validation Happens')[0];
    for (const kw of ['Input', 'Validation', 'Transformation', 'Capability Execution', 'Output Mapping']) {
      assert.ok(section.includes(kw), `映射缺少階段：${kw}`);
    }
  });

  await test('（6.Data flow planning）文件定義Validation發生在哪裡（延續TASK1.107五層分工）', () => {
    const section = doc.split('### Where Validation Happens（驗證發生在哪裡）')[1].split('### Where Transformation Happens')[0].replace(/\n/g, ' ');
    assert.ok(section.includes('TASK1.107'));
    assert.ok(section.includes('Product Layer'));
    assert.ok(section.includes('Contract Layer'));
  });

  await test('（6.Data flow planning）文件定義Transformation發生在哪裡（Health Insight Feature負責raw→rawInput，Adapter負責rawInput→context）', () => {
    const section = doc.split('### Where Transformation Happens（轉換發生在哪裡）')[1].split('### Where Output Formatting Happens')[0].replace(/\n/g, ' ');
    assert.ok(section.includes('Health Insight Feature'));
    assert.ok(section.includes('既有Product Adapter'));
  });

  await test('（6.Data flow planning）文件定義Output Formatting發生在哪裡（延續TASK1.108呈現邏輯留在Product Layer原則）', () => {
    const section = doc.split('### Where Output Formatting Happens（輸出格式化發生在哪裡）')[1].split('---')[0];
    assert.ok(section.includes('TASK1.108'));
    assert.ok(section.includes('Health Insight Feature'));
  });

  console.log('');

  // =========================================================================
  // G. UI integration preparation
  // =========================================================================
  console.log('--- G. UI integration preparation ---');

  await test('（7.UI integration preparation）文件包含「7. UI Integration Preparation」章節', () => {
    assert.ok(doc.includes('## 7. UI Integration Preparation'));
  });

  const section7 = () => doc.split('## 7. UI Integration Preparation')[1].split('## 8. API / Route Integration Preparation')[0];

  const REQUIRED_UI_RESPONSIBILITIES = ['collect input', 'display output', 'user interaction'];
  for (const item of REQUIRED_UI_RESPONSIBILITIES) {
    await test(`（7.UI integration preparation）UI Responsibility包含"${item}"`, () => {
      const section = section7().split('### UI Responsibility（UI責任，規格原文列出的三項）')[1].split('### Intelligence Responsibility')[0];
      assert.ok(section.includes(item), `UI Responsibility缺少：${item}`);
    });
  }

  const REQUIRED_INTEL_RESPONSIBILITIES = ['analysis', 'recommendation', 'insight generation'];
  for (const item of REQUIRED_INTEL_RESPONSIBILITIES) {
    await test(`（7.UI integration preparation）Intelligence Responsibility包含"${item}"`, () => {
      const section = section7().split('### Intelligence Responsibility（智慧責任，規格原文列出的三項）')[1].split('### UI跟Intelligence的邊界')[0];
      assert.ok(section.includes(item), `Intelligence Responsibility缺少：${item}`);
    });
  }

  await test('（7.UI integration preparation）文件明確聲明本次任務不建立任何UI', () => {
    const section = section7().split('### UI跟Intelligence的邊界')[1].replace(/\n/g, ' ');
    assert.ok(/本次任務不建立\*{0,2}\s*任何UI/.test(section));
  });

  console.log('');

  // =========================================================================
  // H. API preparation
  // =========================================================================
  console.log('--- H. API preparation ---');

  await test('（8.API preparation）文件包含「8. API / Route Integration Preparation」章節', () => {
    assert.ok(doc.includes('## 8. API / Route Integration Preparation'));
  });

  const section8 = () => doc.split('## 8. API / Route Integration Preparation')[1].split('## 9. Membership Integration Preparation')[0];

  await test('（8.API preparation）文件記錄Route→Controller→Product Entry整合方向', () => {
    const section = section8().split('### 未來的整合方向（規格原文架構）')[1].split('### 明確的範圍限制')[0];
    assert.ok(section.includes('Route'));
    assert.ok(section.includes('Controller'));
    assert.ok(section.includes('Product Entry'));
  });

  await test('（8.API preparation）文件明確聲明本次任務不建立任何routes/controllers/endpoints', () => {
    const section = section8().split('### 明確的範圍限制（規格原文要求）')[1].replace(/\n/g, ' ');
    assert.ok(/本次任務不建立\*{0,2}routes/.test(section));
  });

  await test('（8.API preparation）文件重申Entry層負責HTTP層級的事、不做業務轉換的既有原則（延續TASK1.91/TASK1.99）', () => {
    const section = section8().split('### 明確的範圍限制（規格原文要求）')[1];
    assert.ok(section.includes('TASK1.91'));
    assert.ok(section.includes('TASK1.99'));
  });

  console.log('');

  // =========================================================================
  // I. Membership preparation
  // =========================================================================
  console.log('--- I. Membership preparation ---');

  await test('（9.Membership preparation）文件包含「9. Membership Integration Preparation」章節', () => {
    assert.ok(doc.includes('## 9. Membership Integration Preparation'));
  });

  const section9 = () => doc.split('## 9. Membership Integration Preparation')[1].split('## 10. Gemini Integration Preparation')[0];

  await test('（9.Membership preparation）Free小節包含Basic Health Insight', () => {
    const section = section9().split('### Free（規格原文）')[1].split('### Premium（規格原文，三項）')[0];
    assert.ok(section.includes('Basic Health Insight'));
  });

  const REQUIRED_PREMIUM_ITEMS = ['Advanced analysis', 'Gemini enhancement', 'Extended history'];
  for (const item of REQUIRED_PREMIUM_ITEMS) {
    await test(`（9.Membership preparation）Premium小節包含"${item}"`, () => {
      const section = section9().split('### Premium（規格原文，三項）')[1].split('### 明確的範圍限制')[0];
      assert.ok(section.includes(item), `Premium清單缺少：${item}`);
    });
  }

  await test('（9.Membership preparation）文件明確聲明本次任務不實作任何付款機制', () => {
    const section = section9().split('### 明確的範圍限制（規格原文要求）')[1].replace(/\n/g, ' ');
    assert.ok(/本次任務不實作任何\s*付款機制/.test(section));
  });

  console.log('');

  // =========================================================================
  // J. Gemini boundary
  // =========================================================================
  console.log('--- J. Gemini boundary ---');

  await test('（10.Gemini boundary）文件包含「10. Gemini Integration Preparation」章節', () => {
    assert.ok(doc.includes('## 10. Gemini Integration Preparation'));
  });

  await test('（10.Gemini boundary）文件記錄未來位置：Health Insight Structured Output→Gemini Enhancement→User Explanation', () => {
    const section = doc.split('### 未來的Gemini位置（規格原文架構）')[1].split('### 確認：Gemini不會取代既有架構')[0];
    assert.ok(section.includes('Health Insight Structured Output'));
    assert.ok(section.includes('Gemini Enhancement'));
    assert.ok(section.includes('User Explanation'));
  });

  await test('（10.Gemini boundary）文件明確確認Gemini不會取代Feature/Capability/Runtime', () => {
    const section = doc.split('### 確認：Gemini不會取代既有架構（重申）')[1].split('---')[0];
    const flatSection = section.replace(/\n/g, ' ');
    assert.ok(/不會取代\*{0,2}Feature/.test(flatSection));
    assert.ok(/不會取代\*{0,2}\s*Capability/.test(flatSection));
    assert.ok(/不會取代\*{0,2}\s*Runtime/.test(flatSection));
  });

  await test('（10.Gemini boundary）文件明確限制Gemini Enhancement Layer的輸入必須是已整理完成的結構化輸出，不能是Insight Context或更底層原始資料', () => {
    const section = doc.split('### 確認：Gemini不會取代既有架構（重申）')[1].split('---')[0];
    assert.ok(section.includes('已經由'));
    assert.ok(/不能\*{0,2}是/.test(section.replace(/\n/g, ' ')));
  });

  console.log('');

  // =========================================================================
  // K. Implementation sequence
  // =========================================================================
  console.log('--- K. Implementation sequence ---');

  await test('（11.Implementation sequence）文件包含「11. Implementation Sequence Plan」章節', () => {
    assert.ok(doc.includes('## 11. Implementation Sequence Plan'));
  });

  const REQUIRED_SEQUENCE_STEPS = ['Product Feature foundation', 'Product Entry integration', 'UI integration', 'User testing', 'Gemini enhancement'];
  for (const step of REQUIRED_SEQUENCE_STEPS) {
    await test(`（11.Implementation sequence）實作順序包含步驟"${step}"`, () => {
      const section = doc.split('### 建議的實作順序（規格原文架構，五步驟）')[1].split('### 依賴關係說明')[0];
      assert.ok(section.includes(step), `實作順序缺少步驟：${step}`);
    });
  }

  await test('（11.Implementation sequence）文件說明依賴關係為嚴格循序、不建議跳步', () => {
    const section = doc.split('### 依賴關係說明（規格要求解釋）')[1].split('---')[0];
    assert.ok(section.includes('嚴格循序'));
    assert.ok(section.includes('不建議跳步'));
  });

  await test('（11.Implementation sequence）文件明確Gemini enhancement排在最後一步，只有前面步驟都驗證過才進行', () => {
    const section = doc.split('### 依賴關係說明（規格要求解釋）')[1].split('---')[0];
    assert.ok(section.includes('Step 5依賴Step'));
    assert.ok(section.includes('AI不是立刻要做的'));
  });

  console.log('');

  // =========================================================================
  // L. Risk assessment
  // =========================================================================
  console.log('--- L. Risk assessment ---');

  await test('（12.Risk assessment）文件包含「12. Risk Assessment」章節', () => {
    assert.ok(doc.includes('## 12. Risk Assessment'));
  });

  const section12 = () => doc.split('## 12. Risk Assessment')[1].split('## Restrictions Confirmation')[0];

  await test('（12.Risk assessment）Architecture Risks包含Unnecessary abstraction跟Duplicate logic兩項並各自附緩解方案', () => {
    const section = section12().split('### Architecture Risks（架構風險，規格原文列出的兩項）')[1].split('### Product Risks')[0];
    assert.ok(section.includes('Unnecessary abstraction'));
    assert.ok(section.includes('Duplicate logic'));
    assert.ok((section.match(/緩解方案/g) || []).length >= 2);
  });

  await test('（12.Risk assessment）Product Risks包含Unclear user value並附緩解方案（延續TASK1.109 Step 4 User testing）', () => {
    const section = section12().split('### Product Risks（產品風險，規格原文列出的一項）')[1].split('### AI Risks')[0];
    assert.ok(section.includes('Unclear user value'));
    assert.ok(section.includes('緩解方案'));
  });

  await test('（12.Risk assessment）AI Risks包含Premature AI dependency並附緩解方案', () => {
    const section = section12().split('### AI Risks（AI風險，規格原文列出的一項）')[1].split('### Data Risks')[0];
    assert.ok(section.includes('Premature AI dependency'));
    assert.ok(section.includes('緩解方案'));
  });

  await test('（12.Risk assessment）Data Risks包含Excessive personal data collection並附緩解方案（延續TASK1.107 Data Privacy Boundary）', () => {
    const section = section12().split('### Data Risks（資料風險，規格原文列出的一項）')[1].split('---')[0];
    assert.ok(section.includes('Excessive personal data collection'));
    assert.ok(section.includes('TASK1.107'));
  });

  await test('（12.Risk assessment）TASK1.106/1.107/1.108/1.109建立的四份文件依然存在且本次任務完全沒有修改它們', () => {
    assert.ok(fs.existsSync(productPlanDocPath));
    assert.ok(fs.existsSync(inputBoundaryDocPath));
    assert.ok(fs.existsSync(outputBoundaryDocPath));
    assert.ok(fs.existsSync(uxFlowDocPath));
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

  await test('（Dependency direction）Completion Criteria確認章節存在', () => {
    assert.ok(doc.includes('Completion Criteria'));
  });

  await test('（TASK1.111後更新）（Dependency direction）src/intelligence/product/PHASE6_HEALTH_INSIGHT_IMPLEMENTATION_ARCHITECTURE_PLAN.md是TASK1.110自己的commit（7094a56）新增的檔案（git show --name-status確認，而不是檢查即時git status——避免被後續任何時間點的執行誤判為失敗，延續TASK1.99~1.109測試套件同樣的修正模式）', () => {
    const nameStatus = execFileSync('git', ['show', '--name-status', '--pretty=format:', '7094a56'], { cwd: repoRoot, encoding: 'utf8' });
    const line = nameStatus.split('\n').find((l) => l.endsWith('\tsrc/intelligence/product/PHASE6_HEALTH_INSIGHT_IMPLEMENTATION_ARCHITECTURE_PLAN.md'));
    assert.ok(line && line.startsWith('A'), `預期該檔案在7094a56被新增，實際：${line}`);
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase6-task1.110-health-insight-implementation-plan')) {
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

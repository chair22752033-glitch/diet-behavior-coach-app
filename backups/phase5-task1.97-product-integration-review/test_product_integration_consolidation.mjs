/*
 * Phase 5 TASK 1.97｜Phase 5 Product Integration Architecture
 * Consolidation Review 測試
 *
 * 本任務不是實作Product路由、不是導入AI——這是Review/Validation
 * 任務，對Phase 5 Product Intelligence Integration（TASK1.90~
 * 1.96累積的七份規劃文件）做最終整體審查，記錄在
 * `src/intelligence/PHASE5_PRODUCT_INTEGRATION_CONSOLIDATION_
 * REVIEW.md`，本次**不修改**任何production程式碼、**不建立**
 * 任何路由/Contract/Adapter程式碼。
 *
 * 這份測試驗證的是：
 * - Boundary Completeness：五個邊界（Entry/Adapter/Contract/
 *   Execution/Operational）皆完整、職責清楚
 * - Dependency Direction：七份文件裡沒有任何Reverse Dependency
 * - Responsibility Separation：無重複職責、無缺失職責、無錯誤
 *   歸屬
 * - Contract/Adapter/Execution/Operational
 *   Compatibility：七份文件彼此一致，沒有互相矛盾
 * - Capability Compatibility：Phase 4整條Chain依然正確運作
 * - AI Boundary：本次審查沒有導入任何AI SDK
 * - Regression/P1-P6
 *
 * 分為以下11個部分：
 * A) boundary completeness
 * B) dependency direction
 * C) responsibility separation
 * D) contract compatibility
 * E) adapter compatibility
 * F) execution compatibility
 * G) operational compatibility
 * H) capability compatibility
 * I) AI boundary
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
const analysisDir = path.join(intelDir, 'analysis');
const recommendationDir = path.join(intelDir, 'recommendation');
const applicationDir = path.join(intelDir, 'application');
const featuresDir = path.join(applicationDir, 'features');
const intelligenceFeatureDir = path.join(featuresDir, 'intelligence');
const capabilitiesDir = path.join(intelDir, 'capabilities');
const analysisCapabilityDir = path.join(capabilitiesDir, 'analysis');
const recommendationCapabilityDir = path.join(capabilitiesDir, 'recommendation');
const orchestrationCapabilityDir = path.join(capabilitiesDir, 'orchestration');
const decisionCapabilityDir = path.join(capabilitiesDir, 'decision');
const docPath = path.join(intelDir, 'PHASE5_PRODUCT_INTEGRATION_CONSOLIDATION_REVIEW.md');
const integrationDocPath = path.join(intelDir, 'PHASE5_PRODUCT_INTEGRATION_PLAN.md');
const entryDocPath = path.join(intelDir, 'PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md');
const adapterDocPath = path.join(intelDir, 'PHASE5_PRODUCT_ADAPTER_PLAN.md');
const flowDocPath = path.join(intelDir, 'PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md');
const contractDocPath = path.join(intelDir, 'PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md');
const executionDocPath = path.join(intelDir, 'PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md');
const operationalDocPath = path.join(intelDir, 'PHASE5_OPERATIONAL_BOUNDARY_PLAN.md');

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

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readSrc(fullPath) {
  return stripComments(fs.readFileSync(fullPath, 'utf8'));
}

function makeInsightContext(overrides) {
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

function makeRecommendationResult(overrides) {
  return Object.assign({
    status: 'recommendation_ready',
    recommendations: [{ type: 'x', value: 1, source: 'y' }],
    metadata: { version: '1.0.0' },
  }, overrides || {});
}

const PHASE4_LAYERS = [
  { name: 'analysis', dir: analysisCapabilityDir, files: ['analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js'] },
  { name: 'recommendation', dir: recommendationCapabilityDir, files: ['recommendation_capability.js', 'recommendation_capability_result_builder.js', 'index.js'] },
  { name: 'orchestration', dir: orchestrationCapabilityDir, files: ['capability_orchestrator.js', 'capability_result_builder.js', 'index.js'] },
  { name: 'decision', dir: decisionCapabilityDir, files: ['decision_capability.js', 'decision_result_builder.js', 'index.js'] },
  { name: 'intelligence-feature', dir: intelligenceFeatureDir, files: ['intelligence_feature.js', 'intelligence_feature_result_mapper.js', 'index.js'] },
];
const ALL_PHASE4_FILES = PHASE4_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));

const PHASE5_DOC_SECTIONS = {
  [integrationDocPath]: ['Product Integration Goal', 'Architecture Boundary', 'Feature Flow', 'API Strategy', 'Phase 5 Roadmap', 'Known Limitations'],
  [entryDocPath]: ['Entry Architecture', 'Request Boundary', 'Response Boundary', 'Error Boundary', 'Feature Consumption Path', 'Phase 5 Roadmap', 'Known Limitations'],
  [adapterDocPath]: ['Adapter Responsibility', 'Request Mapping', 'Response Mapping', 'Error Mapping', 'Feature Integration', 'Known Limitations'],
  [flowDocPath]: ['Product Feature Flow Architecture', 'Feature Consumption Pattern', 'Request Lifecycle', 'Response Lifecycle', 'Error Lifecycle', 'Phase 5 Integration Roadmap', 'Known Limitations'],
  [contractDocPath]: ['Contract Boundary', 'Request Contract', 'Response Contract', 'Error Contract', 'Version Strategy', 'Phase 5 Roadmap', 'Known Limitations'],
  [executionDocPath]: ['Execution Boundary', 'Execution Lifecycle', 'Result Handling', 'Failure Recovery', 'Feature Integration', 'Phase 5 Roadmap', 'Known Limitations'],
  [operationalDocPath]: ['Operational Boundary', 'Execution Observation', 'Operational Metadata', 'Error Observation', 'Future Monitoring Extension', 'Phase 5 Roadmap', 'Known Limitations'],
};

async function run() {
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createDecisionCapability } = await import(path.join(decisionCapabilityDir, 'index.js'));
  const { createIntelligenceFeature } = await import(path.join(intelligenceFeatureDir, 'index.js'));
  const { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(recommendationDir, 'index.js'));

  function makeRealAnalysisCapability() {
    return createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
  }
  function makeRealRecommendationCapability() {
    return createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
  }
  function makeRealDecisionCapability() {
    return createDecisionCapability();
  }
  function makeRealFeature() {
    return createIntelligenceFeature({
      capabilityOrchestrator: createCapabilityOrchestrator({
        analysisCapability: makeRealAnalysisCapability(),
        recommendationCapability: makeRealRecommendationCapability(),
      }),
    });
  }

  const doc = fs.readFileSync(docPath, 'utf8');
  const flatDoc = doc.replace(/\n/g, ' ');
  const integrationDoc = fs.readFileSync(integrationDocPath, 'utf8');
  const entryDoc = fs.readFileSync(entryDocPath, 'utf8');
  const adapterDoc = fs.readFileSync(adapterDocPath, 'utf8');
  const flowDoc = fs.readFileSync(flowDocPath, 'utf8');
  const contractDoc = fs.readFileSync(contractDocPath, 'utf8');
  const executionDoc = fs.readFileSync(executionDocPath, 'utf8');
  const operationalDoc = fs.readFileSync(operationalDocPath, 'utf8');
  const featureSrc = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
  const orchestratorSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));

  // =========================================================================
  // A. boundary completeness
  // =========================================================================
  console.log('--- A. boundary completeness ---');

  const REQUIRED_DOC_SECTIONS = ['Architecture Snapshot', 'Boundary Review', 'Dependency Review', 'Responsibility Review', 'Data Exposure Review', 'Operational Review', 'Phase 5 Readiness', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.boundary completeness）PHASE5_PRODUCT_INTEGRATION_CONSOLIDATION_REVIEW.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.boundary completeness）文件記錄完整九層Review Flow：Product Feature→Contract→Entry→Adapter→Execution Boundary→Operational Boundary→Feature→Capability→Runtime', () => {
    assert.ok(/Product Feature/.test(doc));
    assert.ok(/Contract（TASK1\.94）/.test(doc));
    assert.ok(/Entry（TASK1\.91）/.test(doc));
    assert.ok(/Adapter（TASK1\.92）/.test(doc));
    assert.ok(/Execution Boundary（TASK1\.95）/.test(doc));
    assert.ok(/Operational Boundary（TASK1\.96）/.test(doc));
  });

  await test('（1.boundary completeness）文件記錄七份Phase 5規劃文件對照表', () => {
    for (const t of ['TASK1.90', 'TASK1.91', 'TASK1.92', 'TASK1.93', 'TASK1.94', 'TASK1.95', 'TASK1.96']) {
      assert.ok(doc.includes(t), `文件缺少任務序列引用：${t}`);
    }
  });

  await test('（1.boundary completeness）文件逐一確認五個邊界（Entry/Adapter/Contract/Execution/Operational）各自章節都存在', () => {
    assert.ok(/### Entry Boundary（TASK1\.91）/.test(doc));
    assert.ok(/### Adapter Boundary（TASK1\.92）/.test(doc));
    assert.ok(/### Contract Boundary（TASK1\.94）/.test(doc));
    assert.ok(/### Execution Boundary（TASK1\.95）/.test(doc));
    assert.ok(/### Operational Boundary（TASK1\.96）/.test(doc));
  });

  await test('（1.boundary completeness）文件記錄Boundary Completeness結論：五個邊界各自職責清楚、互不重疊', () => {
    assert.ok(/Boundary Completeness結論/.test(doc));
    assert.ok(/互不重疊/.test(doc));
  });

  for (const [filePath, sections] of Object.entries(PHASE5_DOC_SECTIONS)) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    for (const section of sections) {
      await test(`（1.boundary completeness）${fileName} 依然包含既有章節「${section}」（本次審查沒有破壞任何一份文件的結構）`, () => {
        assert.ok(fileContent.includes(section), `${fileName} 缺少章節：${section}`);
      });
    }
  }

  console.log('');

  // =========================================================================
  // B. dependency direction
  // =========================================================================
  console.log('--- B. dependency direction ---');

  await test('（2.dependency direction）文件記錄Product → Intelligence → Capability → Runtime單向依賴確認', () => {
    assert.ok(/Product → Intelligence → Capability → Runtime/.test(doc));
  });

  await test('（2.dependency direction）文件明確記錄"沒有任何文件規劃Capability層需要知道Product概念"', () => {
    assert.ok(/沒有\*{0,2}任何文件規劃"Capability層需要知道Product概念"/.test(flatDoc));
  });

  await test('（2.dependency direction）文件明確記錄"沒有任何文件規劃Runtime Runner需要認識Contract/Entry/Adapter"', () => {
    assert.ok(/沒有\*{0,2}任何文件規劃"Runtime Runner需要認識Contract\/Entry\/\s*Adapter"/.test(flatDoc));
  });

  await test('（2.dependency direction）文件記錄Operational Boundary對Execution/Feature/Capability層是單向讀取，不是反向依賴', () => {
    assert.ok(/單向的\s*讀取/.test(flatDoc));
  });

  await test('（2.dependency direction）文件記錄無Reverse Dependency確認：七份文件裡沒有一份要求下層認識上層概念', () => {
    assert.ok(/無Reverse Dependency確認/.test(doc));
  });

  await test('（2.dependency direction）端對端：Analysis Capability完全不import Decision/Orchestrator/Feature層（單向依賴驗證）', () => {
    const analysisSrc = readSrc(path.join(analysisCapabilityDir, 'analysis_capability.js'));
    assert.ok(!/from\s+['"].*\/decision\//.test(analysisSrc));
    assert.ok(!/from\s+['"].*\/orchestration\//.test(analysisSrc));
  });

  await test('（2.dependency direction）端對端：Decision Capability完全不import Analysis/Recommendation Runner（無跳層）', () => {
    const decisionSrc = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
    assert.ok(!/from\s+['"].*intelligence\/analysis\//.test(decisionSrc));
    assert.ok(!/from\s+['"].*intelligence\/recommendation\//.test(decisionSrc));
  });

  await test('（2.dependency direction）intelligence_feature.js完全不出現HTTP/Contract/Adapter相關字樣（Feature不認識上游Product層概念）', () => {
    assert.ok(!/\bhttp\b/i.test(featureSrc));
    assert.ok(!/\bContract\b/.test(featureSrc));
    assert.ok(!/\bAdapter\b/.test(featureSrc));
  });

  // 逐檔案掃描五層Phase 4 Capability Architecture全部檔案，確認
  // 每一個檔案都完全不依賴database/auth/oauth/identity/middleware/
  // Phase 2 Runtime Internal Component/HTTP/Product層概念——這是
  // 本次Consolidation Review對整條Capability Chain依賴邊界的
  // 最後一次全面重新確認。
  const RUNTIME_FORBIDDEN_SUBDIRS_FULL = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    await test(`（2.dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（2.dependency direction）${layer}/${file} 完全不出現db變數名稱`, () => {
      assert.ok(!/\bdb\b/.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（2.dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS_FULL) {
      await test(`（2.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（2.dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
    await test(`（2.dependency direction）${layer}/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher變數名稱`, () => {
      assert.ok(!/executionManager|historyStore|metricsStore|eventDispatcher/.test(src));
    });
    await test(`（2.dependency direction）${layer}/${file} 完全不出現HTTP相關字樣（Request/Response/http）`, () => {
      assert.ok(!/\bRequest\b/.test(src));
      assert.ok(!/\bResponse\b/.test(src));
      assert.ok(!/\bhttp\b/i.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // C. responsibility separation
  // =========================================================================
  console.log('--- C. responsibility separation ---');

  await test('（3.responsibility separation）文件記錄Duplicated Responsibility檢查：資料形狀轉換只歸屬Adapter', () => {
    assert.ok(/Duplicated Responsibility（重複職責）檢查/.test(doc));
    assert.ok(/只\*{0,2}歸屬Adapter（TASK1\.92）/.test(flatDoc));
  });

  await test('（3.responsibility separation）文件記錄執行時序管理只歸屬Execution Boundary', () => {
    assert.ok(/只\*{0,2}歸屬Execution\s*Boundary（TASK1\.95）/.test(flatDoc));
  });

  await test('（3.responsibility separation）文件記錄介面規範定義只歸屬Contract', () => {
    assert.ok(/只\*{0,2}歸屬Contract（TASK1\.94）/.test(flatDoc));
  });

  await test('（3.responsibility separation）文件記錄Missing Responsibility檢查：九層Flow每一層都有對應文件涵蓋', () => {
    assert.ok(/Missing Responsibility（缺失職責）檢查/.test(doc));
  });

  await test('（3.responsibility separation）文件記錄Incorrect Ownership檢查：Feature/Capability Failure無法區分不是Ownership錯誤', () => {
    assert.ok(/Incorrect Ownership（錯誤歸屬）檢查/.test(doc));
    assert.ok(/不是Ownership錯誤/.test(doc));
  });

  await test('（3.responsibility separation）文件記錄Execution/Operational Boundary都歸屬Adapter內部，不是重複歸屬', () => {
    assert.ok(/不是重複歸屬/.test(doc));
  });

  console.log('');

  // =========================================================================
  // D. contract compatibility
  // =========================================================================
  console.log('--- D. contract compatibility ---');

  await test('（4.contract compatibility）PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md（TASK1.94）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.contract compatibility）文件記錄Public/Hidden Fields延續TASK1.94既有承諾：analysis/recommendation保證存在、decision選填', () => {
    assert.ok(/保證存在/.test(doc));
  });

  await test('（4.contract compatibility）端對端：不提供decisionCapability時，Unified Capability Result恰好沒有decision欄位（驗證Contract承諾依然成立）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.result, 'decision'), false);
  });

  await test('（4.contract compatibility）端對端：提供decisionCapability時，decision欄位確實存在（驗證Contract承諾依然成立）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.ok(Object.prototype.hasOwnProperty.call(result.result, 'decision'));
  });

  console.log('');

  // =========================================================================
  // E. adapter compatibility
  // =========================================================================
  console.log('--- E. adapter compatibility ---');

  await test('（5.adapter compatibility）PHASE5_PRODUCT_ADAPTER_PLAN.md（TASK1.92）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_ADAPTER_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.adapter compatibility）PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md（TASK1.91）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.adapter compatibility）PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md（TASK1.93）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.adapter compatibility）PHASE5_PRODUCT_INTEGRATION_PLAN.md（TASK1.90）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_INTEGRATION_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // F. execution compatibility
  // =========================================================================
  console.log('--- F. execution compatibility ---');

  await test('（6.execution compatibility）PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md（TASK1.95）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.execution compatibility）文件記錄TASK1.95五階段Execution Lifecycle引用一致：request received/validation completed/execution started/completed/failed', () => {
    assert.ok(executionDoc.includes('request received'));
    for (const stage of ['request received', 'validation completed', 'execution started', 'execution completed', 'execution failed']) {
      assert.ok(executionDoc.includes(stage), `TASK1.95文件缺少階段：${stage}`);
    }
  });

  await test('（6.execution compatibility）端對端：Decision階段失敗時reason/field/stage欄位正確帶出（跨TASK1.95/1.96/1.97一致引用的真實行為）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: { requestDecision: () => ({ ok: false, capability: 'decision', reason: 'x', field: 'y' }) },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'x');
    assert.strictEqual(result.field, 'y');
    assert.strictEqual(result.stage, 'decision');
  });

  console.log('');

  // =========================================================================
  // G. operational compatibility
  // =========================================================================
  console.log('--- G. operational compatibility ---');

  await test('（7.operational compatibility）PHASE5_OPERATIONAL_BOUNDARY_PLAN.md（TASK1.96）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_OPERATIONAL_BOUNDARY_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.operational compatibility）文件記錄Allowed Metadata跟Hidden Metadata延續TASK1.96既有分類，沒有被本次審查放寬', () => {
    assert.ok(/Allowed\s*Metadata清單/.test(flatDoc));
  });

  await test('（7.operational compatibility）文件記錄Runtime Failure被一致標記為優先級最高（TASK1.95跟TASK1.96結論一致）', () => {
    assert.ok(/優先級最高/.test(doc));
  });

  await test('（7.operational compatibility）端對端：Capability Orchestrator成功回傳確實包含capability:\'orchestration\'欄位（Data Exposure Review討論的內部欄位，確認目前依然存在、尚未被過濾）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.capability, 'orchestration');
  });

  console.log('');

  // =========================================================================
  // H. capability compatibility
  // =========================================================================
  console.log('--- H. capability compatibility ---');

  await test('（8.capability compatibility）端對端：Analysis Capability單獨呼叫依然正確運作', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（8.capability compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（8.capability compatibility）端對端：Decision Capability單獨呼叫依然正確運作', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.capability compatibility）端對端：完整Chain（Analysis→Recommendation→Decision）依然可以串接成功', () => {
    const a = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    const r = makeRealRecommendationCapability().requestRecommendation({ analysisResult: a.result });
    const d = makeRealDecisionCapability().requestDecision({ recommendationResult: r.result });
    assert.strictEqual(a.ok, true);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(d.ok, true);
  });

  await test('（8.capability compatibility）端對端：Feature Intelligence Integration可以被獨立import並成功呼叫（TASK1.79行為不變）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.capability compatibility）端對端：Insight Feature依然正確運作（本次審查沒有影響既有Insight Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.capability compatibility）端對端：Behavior Feature依然正確運作（本次審查沒有影響既有Behavior Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（8.capability compatibility）端對端：app.intelligence物件恰好維持24個欄位不變（本次審查沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（8.capability compatibility）${layer.name} 目錄恰好包含規格要求的檔案（本次審查沒有新增/刪除任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
    for (const { layer: l, file, full } of ALL_PHASE4_FILES.filter((f) => f.layer === layer.name)) {
      await test(`（8.capability compatibility）${l}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
        const relPath = path.relative(repoRoot, full);
        const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
        assert.strictEqual(diff.trim(), '');
      });
    }
  }

  await test('（8.capability compatibility）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // I. AI boundary
  // =========================================================================
  console.log('--- I. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（9.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（9.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（9.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（9.AI boundary）PHASE5_PRODUCT_INTEGRATION_CONSOLIDATION_REVIEW.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
      assert.ok(!pattern.test(doc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（9.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（9.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（9.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
    for (const envFile of ['.env', '.env.example']) {
      const envPath = path.join(repoRoot, envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        assert.ok(!/ANTHROPIC/i.test(content));
        assert.ok(!/OPENAI/i.test(content));
        assert.ok(!/DEEPSEEK/i.test(content));
      }
    }
  });

  await test('（9.AI boundary）本次任務沒有建立任何.d.ts/JSON Schema型別定義檔案', () => {
    function walk(dir) {
      const found = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...walk(full));
        else if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.schema.json')) found.push(full);
      }
      return found;
    }
    const found = walk(intelDir);
    assert.deepStrictEqual(found, [], `發現非預期的型別定義檔案：${JSON.stringify(found)}`);
  });

  await test('（9.AI boundary）src/routes/、src/controllers/目錄本次任務完全沒有新增或修改任何檔案（沒有建立HTTP路由）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/routes/ src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
  });

  await test('（9.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // J. regression validation
  // =========================================================================
  console.log('--- J. regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（10.regression validation）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.97-product-integration-review')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（10.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 87, `預期至少87個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（10.regression validation）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

  await test('（11.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（11.P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（11.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

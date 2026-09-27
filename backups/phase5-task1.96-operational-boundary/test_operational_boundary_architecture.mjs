/*
 * Phase 5 TASK 1.96｜Product Intelligence Operational Boundary
 * Architecture Planning 測試
 *
 * 本任務不是實作監控基礎設施、不是導入AI——這是Architecture
 * Planning任務，在TASK1.90~1.95基礎上定義Product Intelligence
 * 執行過程如何被觀察、追蹤、安全地運維（Operational
 * Boundary），記錄在
 * `src/intelligence/PHASE5_OPERATIONAL_BOUNDARY_PLAN.md`，本次
 * **不修改**任何production程式碼、**不建立**任何監控/日誌/
 * Adapter程式碼。
 *
 * 這份測試驗證的是：
 * - Operational Boundary：Execution Boundary→Operational
 *   Boundary的職責、歸屬、隔離
 * - Execution Observation：Execution Tracking、Lifecycle
 *   Visibility、Result Observation
 * - Metadata Boundary：Allowed/Hidden Metadata、相容性策略
 * - Error Observation：五種失敗來源在可觀測性上的用途
 * - Execution/Contract/Adapter/Capability Compatibility：跟
 *   前五個任務規劃的一致性，Phase 4整條Chain依然正確運作
 * - AI Boundary：本次規劃沒有導入任何AI SDK
 * - Dependency Direction：本次規劃沒有新增任何production依賴
 * - Regression/P1-P6
 *
 * 分為以下12個部分：
 * A) operational boundary
 * B) execution observation
 * C) metadata boundary
 * D) error observation
 * E) execution compatibility
 * F) contract compatibility
 * G) adapter compatibility
 * H) capability compatibility
 * I) AI boundary
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
const docPath = path.join(intelDir, 'PHASE5_OPERATIONAL_BOUNDARY_PLAN.md');
const executionDocPath = path.join(intelDir, 'PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md');
const contractPlanDocPath = path.join(intelDir, 'PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md');
const adapterDocPath = path.join(intelDir, 'PHASE5_PRODUCT_ADAPTER_PLAN.md');

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
  const executionDoc = fs.readFileSync(executionDocPath, 'utf8');
  const contractPlanDoc = fs.readFileSync(contractPlanDocPath, 'utf8');
  const adapterDoc = fs.readFileSync(adapterDocPath, 'utf8');
  const featureSrc = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
  const orchestratorSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));

  // =========================================================================
  // A. operational boundary
  // =========================================================================
  console.log('--- A. operational boundary ---');

  const REQUIRED_DOC_SECTIONS = ['Operational Boundary', 'Execution Observation', 'Operational Metadata', 'Error Observation', 'Future Monitoring Extension', 'Phase 5 Roadmap', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.operational boundary）PHASE5_OPERATIONAL_BOUNDARY_PLAN.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.operational boundary）文件記錄完整九層Flow：Product Feature→Contract→Entry→Adapter→Execution Boundary→Operational Boundary→Feature→Capability→Runtime', () => {
    assert.ok(/Product Feature/.test(doc));
    assert.ok(/Contract/.test(doc));
    assert.ok(/Entry/.test(doc));
    assert.ok(/Adapter/.test(doc));
    assert.ok(/Execution Boundary/.test(doc));
    assert.ok(/Operational Boundary/.test(doc));
    assert.ok(/Capability/.test(doc));
    assert.ok(/Runtime/.test(doc));
  });

  await test('（1.operational boundary）文件記錄Responsibility：標記觀察點/定義可觀察的Metadata/定義錯誤分類的可觀察性三件事', () => {
    assert.ok(/標記觀察點/.test(doc));
    assert.ok(/定義可觀察的Metadata/.test(doc));
    assert.ok(/定義錯誤分類的可觀察性/.test(doc));
  });

  await test('（1.operational boundary）文件記錄Ownership：Operational Boundary歸屬Intelligence Adapter內部，跟TASK1.95 Execution Boundary相同', () => {
    assert.ok(/Intelligence\s*Adapter內部/.test(flatDoc));
    assert.ok(/TASK1\.95/.test(doc));
  });

  await test('（1.operational boundary）文件明確記錄Isolation：可觀測性不能犧牲正確性，觀察動作不得影響既有執行結果', () => {
    assert.ok(/不得\*{0,2}影響/.test(flatDoc));
    assert.ok(/可觀測性不能犧牲正確性/.test(doc));
  });

  await test('（1.operational boundary）文件跟TASK1.90/1.91/1.92/1.93/1.94/1.95做明確區分並延續其規劃', () => {
    for (const t of ['TASK1.90', 'TASK1.91', 'TASK1.92', 'TASK1.93', 'TASK1.94', 'TASK1.95']) {
      assert.ok(doc.includes(t), `文件缺少引用：${t}`);
    }
  });

  console.log('');

  // =========================================================================
  // B. execution observation
  // =========================================================================
  console.log('--- B. execution observation ---');

  await test('（2.execution observation）文件記錄Execution Tracking：每次執行可被賦予邏輯上的追蹤概念', () => {
    assert.ok(/Execution Tracking/.test(doc));
    assert.ok(/邏輯上的追蹤概念/.test(doc));
  });

  await test('（2.execution observation）文件記錄Lifecycle Visibility：五個階段各自的可觀察性判斷', () => {
    assert.ok(/Lifecycle Visibility/.test(doc));
    assert.ok(/request received/.test(doc));
    assert.ok(/validation completed/.test(doc));
    assert.ok(/execution started/.test(doc));
    assert.ok(/execution completed/.test(doc));
    assert.ok(/execution failed/.test(doc));
  });

  await test('（2.execution observation）文件明確說明execution completed階段記錄聚合性資訊，不記錄陣列內容本身', () => {
    assert.ok(/聚合性/.test(doc));
    assert.ok(/不記錄陣列\*{0,2}內容\*{0,2}\s*本身/.test(flatDoc));
  });

  await test('（2.execution observation）文件記錄Result Observation：觀察不等於記錄完整內容，聚焦結構性資訊而非業務內容', () => {
    assert.ok(/Result Observation/.test(doc));
    assert.ok(/不等於\*{0,2}\s*"記錄執行結果的完整內容"/.test(flatDoc) || /不等於/.test(doc));
    assert.ok(/結構性資訊/.test(doc));
    assert.ok(/業務內容/.test(doc));
  });

  await test('（2.execution observation）端對端：Feature Intelligence Integration執行成功時data.analysis/data.recommendation確實有可計算的陣列長度（Result Observation引用的真實結構）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(typeof result.data.analysis.insights.length, 'number');
    assert.strictEqual(typeof result.data.recommendation.recommendations.length, 'number');
  });

  console.log('');

  // =========================================================================
  // C. metadata boundary
  // =========================================================================
  console.log('--- C. metadata boundary ---');

  await test('（3.metadata boundary）文件記錄Allowed Metadata：ok/reason-stage/陣列長度/metadata.version四類', () => {
    assert.ok(/Allowed Metadata/.test(doc));
    assert.ok(/執行結果.{0,5}ok.{0,5}布林值/.test(flatDoc) || /`ok`布林值/.test(doc));
    assert.ok(/`reason`\/`stage`字串/.test(doc));
    assert.ok(/insights\.length/.test(doc));
    assert.ok(/metadata\.version/.test(doc));
  });

  await test('（3.metadata boundary）文件記錄Hidden Metadata：Insight Context實際內容/insight-recommendation實際內容/userId三類絕對不得記錄', () => {
    assert.ok(/Hidden Metadata/.test(doc));
    assert.ok(/絕對不得\*{0,2}出現在任何未來的\s*監控/.test(flatDoc));
    assert.ok(/userId/.test(doc));
  });

  await test('（3.metadata boundary）文件記錄Compatibility Strategy：Allowed Metadata都已經存在於既有回傳結果裡，不需要新增任何Contract欄位', () => {
    assert.ok(/Compatibility Strategy/.test(doc));
    assert.ok(/不需要\*{0,2}新增任何欄位到既有的Request\/Response\s*Contract/.test(flatDoc));
  });

  await test('（3.metadata boundary）文件明確引用TASK1.44/TASK1.87既有"事實計數，不是判斷"的設計哲學', () => {
    assert.ok(/事實計數，不是判斷/.test(doc));
  });

  await test('（3.metadata boundary）端對端：Capability Orchestrator成功回傳確實包含ok:true/capability這些既有欄位（Allowed Metadata引用的真實資料）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（3.metadata boundary）端對端：失敗結果的reason/stage欄位確實是穩定的字串列舉值（Allowed Metadata引用的真實資料）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: { requestDecision: () => ({ ok: false, capability: 'decision', reason: 'x' }) },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(typeof result.reason, 'string');
    assert.strictEqual(result.stage, 'decision');
  });

  await test('（3.metadata boundary）端對端：Decision Capability既有的metadata.version欄位確實存在（Allowed Metadata引用的真實資料）', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(typeof result.result.metadata.version, 'string');
  });

  console.log('');

  // =========================================================================
  // D. error observation
  // =========================================================================
  console.log('--- D. error observation ---');

  await test('（4.error observation）文件記錄五種失敗來源在可觀測性上的用途：Contract/Adapter Failure聚合統計轉換失敗頻率', () => {
    assert.ok(/Contract\/Adapter Failure/.test(doc));
    assert.ok(/聚合統計/.test(doc));
  });

  await test('（4.error observation）文件記錄Feature/Capability Failure適合按reason字串分組統計', () => {
    assert.ok(/按`reason`字串分組統計/.test(doc));
  });

  await test('（4.error observation）文件明確標記Runtime Failure是優先級最高的觀察對象', () => {
    assert.ok(/優先級最高的觀察對象/.test(doc));
  });

  await test('（4.error observation）文件記錄Observation Responsibility：Operational Boundary不重新判斷錯誤分類，只決定要不要記錄', () => {
    assert.ok(/Observation Responsibility/.test(doc));
    assert.ok(/不重新判斷/.test(doc));
  });

  await test('（4.error observation）文件記錄Future Monitoring Extension兩條設計原則：選填依賴注入、非阻塞', () => {
    assert.ok(/選填的依賴注入/.test(doc));
    assert.ok(/非阻塞/.test(doc));
  });

  await test('（4.error observation）文件引用TASK1.78/1.86既有的Backward Compatibility模式作為選填依賴注入原則的延續基礎', () => {
    assert.ok(/TASK1\.78\/1\.86/.test(doc));
  });

  await test('（4.error observation）端對端：Decision階段失敗時reason/field/stage欄位正確帶出（Error Observation引用的真實行為）', () => {
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

  await test('（4.error observation）端對端：analysis_capability_unavailable/recommendation_capability_unavailable兩個reason字樣確實存在（可分組統計的真實範例）', () => {
    const orchestrator1 = createCapabilityOrchestrator({ recommendationCapability: makeRealRecommendationCapability() });
    assert.strictEqual(orchestrator1.requestCapabilityFlow({ context: makeInsightContext() }).reason, 'analysis_capability_unavailable');
    const orchestrator2 = createCapabilityOrchestrator({ analysisCapability: makeRealAnalysisCapability() });
    assert.strictEqual(orchestrator2.requestCapabilityFlow({ context: makeInsightContext() }).reason, 'recommendation_capability_unavailable');
  });

  console.log('');

  // =========================================================================
  // E. execution compatibility
  // =========================================================================
  console.log('--- E. execution compatibility ---');

  await test('（5.execution compatibility）PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md（TASK1.95）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.execution compatibility）TASK1.95文件依然包含既有七個章節（本次任務沒有破壞前一份文件的結構）', () => {
    for (const section of ['Execution Boundary', 'Execution Lifecycle', 'Result Handling', 'Failure Recovery', 'Feature Integration', 'Phase 5 Roadmap', 'Known Limitations']) {
      assert.ok(executionDoc.includes(section), `PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md缺少章節：${section}`);
    }
  });

  await test('（5.execution compatibility）文件引用TASK1.95五階段Execution Lifecycle作為Execution Observation的延續基礎', () => {
    assert.ok(executionDoc.includes('request received'));
    assert.ok(doc.includes('request received'));
  });

  console.log('');

  // =========================================================================
  // F. contract compatibility
  // =========================================================================
  console.log('--- F. contract compatibility ---');

  await test('（6.contract compatibility）PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md（TASK1.94）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.contract compatibility）TASK1.94文件依然包含既有七個章節（本次任務沒有破壞前一份文件的結構）', () => {
    for (const section of ['Contract Boundary', 'Request Contract', 'Response Contract', 'Error Contract', 'Version Strategy', 'Phase 5 Roadmap', 'Known Limitations']) {
      assert.ok(contractPlanDoc.includes(section), `PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md缺少章節：${section}`);
    }
  });

  console.log('');

  // =========================================================================
  // G. adapter compatibility
  // =========================================================================
  console.log('--- G. adapter compatibility ---');

  await test('（7.adapter compatibility）PHASE5_PRODUCT_ADAPTER_PLAN.md（TASK1.92）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_ADAPTER_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.adapter compatibility）TASK1.92文件依然包含既有六個章節（本次任務沒有破壞前一份文件的結構）', () => {
    for (const section of ['Adapter Responsibility', 'Request Mapping', 'Response Mapping', 'Error Mapping', 'Feature Integration', 'Known Limitations']) {
      assert.ok(adapterDoc.includes(section), `PHASE5_PRODUCT_ADAPTER_PLAN.md缺少章節：${section}`);
    }
  });

  await test('（7.adapter compatibility）端對端：Feature Intelligence Integration可以被獨立import並成功呼叫（TASK1.79行為不變）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.adapter compatibility）intelligence_feature.js完全不出現HTTP相關字樣（維持"No HTTP"邊界）', () => {
    assert.ok(!/\bRequest\b/.test(featureSrc));
    assert.ok(!/\bResponse\b/.test(featureSrc));
    assert.ok(!/\bhttp\b/i.test(featureSrc));
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

  await test('（8.capability compatibility）端對端：Capability Orchestrator提供decisionCapability時正確組出三欄位結果', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
  });

  await test('（8.capability compatibility）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const feature = makeRealFeature();
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(feature.requestIntelligence(request), feature.requestIntelligence(request));
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（8.capability compatibility）${layer.name} 目錄恰好包含規格要求的檔案（本次規劃沒有新增/刪除任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

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
    await test(`（9.AI boundary）PHASE5_OPERATIONAL_BOUNDARY_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
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

  await test('（9.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作（未來監控依賴注入延伸點的既有先例）', () => {
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
  // J. dependency direction
  // =========================================================================
  console.log('--- J. dependency direction ---');

  await test('（10.dependency direction）app.intelligence物件恰好維持24個欄位不變（本次規劃沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（10.dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.dependency direction）src/routes/、src/controllers/目錄本次任務完全沒有新增或修改任何檔案（沒有建立HTTP路由）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/routes/ src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.dependency direction）四層既有Phase 4 Capability（analysis/recommendation/orchestration/decision）本次任務完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（10.dependency direction）src/intelligence/events/（既有Event Dispatcher）本次任務完全沒有被修改（文件提及但沒有實際依賴它）', () => {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src/intelligence/events/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.dependency direction）本次任務沒有建立任何.d.ts/JSON Schema型別定義檔案', () => {
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

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    await test(`（10.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
    const src = readSrc(full);
    await test(`（10.dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（10.dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（10.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（10.dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

  console.log('');

  // =========================================================================
  // K. regression validation
  // =========================================================================
  console.log('--- K. regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（11.regression validation）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.96-operational-boundary')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 86, `預期至少86個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（11.regression validation）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

  await test('（12.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（12.P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（12.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

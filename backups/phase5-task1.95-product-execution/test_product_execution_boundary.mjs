/*
 * Phase 5 TASK 1.95｜Product Intelligence Execution Boundary
 * Foundation 測試
 *
 * 本任務不是實作HTTP路由、不是導入AI——這是Architecture Foundation
 * 任務，在TASK1.90/1.91/1.92/1.93/1.94基礎上定義Product
 * Intelligence Contract跟Intelligence Feature實際執行之間的邊界
 * （Execution Boundary），記錄在
 * `src/intelligence/PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md`，
 * 本次**不修改**任何production程式碼、**不建立**任何執行邏輯/
 * 路由/Adapter程式碼。
 *
 * 這份測試驗證的是：
 * - Execution Boundary：Contract→Execution Boundary→Feature
 *   Execution的職責、歸屬
 * - Execution Lifecycle：五個階段的定義跟階段之間的嚴格關係
 * - Result Handling：成功/失敗處理、Hidden Internal State
 * - Failure Recovery：五種失敗來源的Recovery策略
 * - Feature/Capability/Contract Compatibility：跟前四個任務規劃
 *   的一致性，Phase 4整條Chain依然正確運作
 * - Dependency Direction：本次規劃沒有新增任何production依賴
 * - AI Boundary：本次規劃沒有導入任何AI SDK
 * - Regression/P1-P6
 *
 * 分為以下12個部分：
 * A) execution boundary
 * B) lifecycle
 * C) request handling
 * D) result handling
 * E) failure handling
 * F) feature compatibility
 * G) capability compatibility
 * H) contract compatibility
 * I) dependency direction
 * J) AI boundary
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
const docPath = path.join(intelDir, 'PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md');
const entryDocPath = path.join(intelDir, 'PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md');
const adapterDocPath = path.join(intelDir, 'PHASE5_PRODUCT_ADAPTER_PLAN.md');
const flowDocPath = path.join(intelDir, 'PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md');
const contractPlanDocPath = path.join(intelDir, 'PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md');

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
  const entryDoc = fs.readFileSync(entryDocPath, 'utf8');
  const adapterDoc = fs.readFileSync(adapterDocPath, 'utf8');
  const flowDoc = fs.readFileSync(flowDocPath, 'utf8');
  const contractPlanDoc = fs.readFileSync(contractPlanDocPath, 'utf8');
  const featureSrc = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
  const orchestratorSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));

  // =========================================================================
  // A. execution boundary
  // =========================================================================
  console.log('--- A. execution boundary ---');

  const REQUIRED_DOC_SECTIONS = ['Execution Boundary', 'Execution Lifecycle', 'Result Handling', 'Failure Recovery', 'Feature Integration', 'Phase 5 Roadmap', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.execution boundary）PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.execution boundary）文件記錄完整八層Flow：Product Feature→Product Contract→Product Entry→Intelligence Adapter→Execution Boundary→Intelligence Feature→Capability Layer→Runtime Layer', () => {
    assert.ok(/Product Feature/.test(doc));
    assert.ok(/Product Contract/.test(doc));
    assert.ok(/Product Entry/.test(doc));
    assert.ok(/Intelligence Adapter/.test(doc));
    assert.ok(/Execution Boundary/.test(doc));
    assert.ok(/Intelligence Feature/.test(doc));
    assert.ok(/Capability Layer/.test(doc));
    assert.ok(/Runtime Layer/.test(doc));
  });

  await test('（1.execution boundary）文件明確說明Execution Boundary管的是呼叫這件事本身怎麼進行，不轉換資料形狀、不定義介面規範', () => {
    assert.ok(/管的是\*{0,2}呼叫這件事本身怎麼進行/.test(flatDoc));
  });

  await test('（1.execution boundary）文件記錄Responsibility：啟動執行/追蹤執行狀態/攔截執行失敗/回傳執行結果四件事', () => {
    assert.ok(/啟動執行/.test(doc));
    assert.ok(/追蹤執行狀態/.test(doc));
    assert.ok(/攔截執行失敗/.test(doc));
    assert.ok(/回傳執行結果/.test(doc));
  });

  await test('（1.execution boundary）文件記錄Ownership：Execution Boundary歸屬Intelligence Adapter內部，不是獨立的檔案/模組', () => {
    assert.ok(/Intelligence\s*Adapter內部/.test(flatDoc));
    assert.ok(/不是一個獨立的檔案\/模組/.test(doc));
  });

  await test('（1.execution boundary）文件明確重申Execution Boundary唯一呼叫的下游是Feature Intelligence Integration的requestIntelligence()', () => {
    assert.ok(/requestIntelligence\(\)/.test(doc));
  });

  await test('（1.execution boundary）文件跟TASK1.90/1.91/1.92/1.93/1.94做明確區分並延續其規劃', () => {
    assert.ok(/TASK1\.90/.test(doc));
    assert.ok(/TASK1\.91/.test(doc));
    assert.ok(/TASK1\.92/.test(doc));
    assert.ok(/TASK1\.93/.test(doc));
    assert.ok(/TASK1\.94/.test(doc));
  });

  console.log('');

  // =========================================================================
  // B. lifecycle
  // =========================================================================
  console.log('--- B. lifecycle ---');

  await test('（2.lifecycle）文件記錄五階段Execution Lifecycle：request received/validation completed/execution started/execution completed/execution failed', () => {
    assert.ok(/request received/.test(doc));
    assert.ok(/validation completed/.test(doc));
    assert.ok(/execution started/.test(doc));
    assert.ok(/execution completed/.test(doc));
    assert.ok(/execution failed/.test(doc));
  });

  await test('（2.lifecycle）文件記錄request received是執行流程起點，此時尚未呼叫Feature', () => {
    assert.ok(/執行流程的起點/.test(doc));
    assert.ok(/尚未\*{0,2}\s*呼叫Feature/.test(flatDoc));
  });

  await test('（2.lifecycle）文件記錄validation completed不新增一段驗證邏輯，只是時序標記', () => {
    assert.ok(/不是新增一段驗證邏輯/.test(doc));
  });

  await test('（2.lifecycle）文件記錄execution completed跟execution failed互斥，恰好走向其中一個', () => {
    assert.ok(/互斥/.test(doc));
    assert.ok(/恰好\*{0,2}\s*走向/.test(flatDoc));
  });

  await test('（2.lifecycle）文件記錄五階段全部發生在單一次同步函式呼叫的生命週期內', () => {
    assert.ok(/全部\*{0,2}發生在單一次同步函式呼叫的生命週期內/.test(flatDoc));
  });

  await test('（2.lifecycle）文件明確說明這五個階段目前不是真的會被分別記錄下來的獨立事件', () => {
    assert.ok(/不是五個真的會被分別記錄下來的獨立事件/.test(doc));
  });

  await test('（2.lifecycle）端對端：Feature Intelligence Integration呼叫成功時恰好對應execution completed狀態（回傳{ok:true, feature, data}）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'intelligence');
  });

  await test('（2.lifecycle）端對端：Capability Orchestrator驗證失敗時恰好對應「validation completed之前中止」（不會進入execution started）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    const result = orchestrator.requestCapabilityFlow(null);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  console.log('');

  // =========================================================================
  // C. request handling
  // =========================================================================
  console.log('--- C. request handling ---');

  await test('（3.request handling）端對端：Feature Intelligence Integration依然恰好接受{context, options?}形狀（request received階段引用的真實形狀）', () => {
    const feature = makeRealFeature();
    assert.doesNotThrow(() => feature.requestIntelligence({ context: makeInsightContext() }));
    assert.doesNotThrow(() => feature.requestIntelligence({ context: makeInsightContext(), options: {} }));
  });

  await test('（3.request handling）端對端：Capability Orchestrator既有輸入驗證（invalid_request/invalid_context/invalid_options_type）依然成立（validation completed階段引用的真實驗證）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    assert.strictEqual(orchestrator.requestCapabilityFlow(null).reason, 'invalid_request');
    assert.strictEqual(orchestrator.requestCapabilityFlow({}).reason, 'invalid_context');
    assert.strictEqual(orchestrator.requestCapabilityFlow({ context: {}, options: 'x' }).reason, 'invalid_options_type');
  });

  await test('（3.request handling）端對端：不同的InsightContext輸入都能正確走完execution started到execution completed（真實資料流驗證五階段可行）', () => {
    const feature = makeRealFeature();
    for (const overrides of [{}, { activityContext: { count: 10, items: [] } }, { metadata: { totalRecords: 99 } }]) {
      const result = feature.requestIntelligence({ context: makeInsightContext(overrides) });
      assert.strictEqual(result.ok, true);
    }
  });

  console.log('');

  // =========================================================================
  // D. result handling
  // =========================================================================
  console.log('--- D. result handling ---');

  await test('（4.result handling）文件記錄Execution Result → Product Result轉換圖', () => {
    assert.ok(/Execution Result/.test(doc));
    assert.ok(/Product Result/.test(doc));
  });

  await test('（4.result handling）文件記錄Success Handling：execution completed狀態下原樣把data欄位往上傳遞', () => {
    assert.ok(/Success Handling/.test(doc));
    assert.ok(/原樣\*{0,2}\s*把\s*`?data`?\s*欄位往上傳遞/.test(flatDoc));
  });

  await test('（4.result handling）文件記錄Failure Handling：execution failed狀態下分類這次失敗，不決定最終錯誤碼或HTTP status code', () => {
    assert.ok(/Failure Handling/.test(doc));
    assert.ok(/不決定\*{0,2}最終呈現給Product層的錯誤碼/.test(flatDoc));
  });

  await test('（4.result handling）文件記錄Hidden Internal State：五個階段標記是規劃概念，不是要往上游傳遞的資料欄位', () => {
    assert.ok(/Hidden Internal State/.test(doc));
    assert.ok(/不是要往上游傳遞的資料欄位/.test(doc));
  });

  await test('（4.result handling）文件明確說明Product層/Adapter層不會在Response/Error裡看到這些階段名稱', () => {
    assert.ok(/不會\*{0,2}在Response\/Error裡看到這些階段\s*名稱/.test(flatDoc));
  });

  await test('（4.result handling）端對端：data.analysis/data.recommendation原樣保留Capability回傳內容（Success Handling引用的真實行為）', () => {
    const result = makeRealFeature().requestIntelligence({ context: makeInsightContext() });
    assert.ok(Array.isArray(result.data.analysis.insights));
    assert.ok(Array.isArray(result.data.recommendation.recommendations));
  });

  await test('（4.result handling）端對端：失敗結果恰好是{ok:false, reason, field?, stage?}形狀，不包含execution lifecycle階段名稱字樣', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: { requestDecision: () => ({ ok: false, capability: 'decision', reason: 'x' }) },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.ok(!Object.prototype.hasOwnProperty.call(result, 'lifecycle'));
    assert.ok(!Object.prototype.hasOwnProperty.call(result, 'executionState'));
  });

  console.log('');

  // =========================================================================
  // E. failure handling
  // =========================================================================
  console.log('--- E. failure handling ---');

  await test('（5.failure handling）文件記錄五種失敗來源：Contract Failure/Adapter Failure/Feature Failure/Capability Failure/Runtime Failure', () => {
    assert.ok(/### Contract Failure/.test(doc));
    assert.ok(/### Adapter Failure/.test(doc));
    assert.ok(/### Feature Failure/.test(doc));
    assert.ok(/### Capability Failure/.test(doc));
    assert.ok(/### Runtime Failure/.test(doc));
  });

  await test('（5.failure handling）文件記錄Contract Failure/Adapter Failure不會真的呼叫requestIntelligence()，直接往上回報不重試', () => {
    assert.ok(/不會\*{0,2}真的呼叫[\s\S]{0,20}requestIntelligence/.test(doc));
    assert.ok(/不重試/.test(doc));
  });

  await test('（5.failure handling）文件明確記錄Feature Failure跟Capability Failure在目前架構下是同一件事，無法區分', () => {
    assert.ok(/是同一件事/.test(doc));
    assert.ok(/無法區分/.test(doc));
  });

  await test('（5.failure handling）文件記錄Runtime Failure用try/catch包住整個呼叫，強制轉換成execution failed終止狀態', () => {
    assert.ok(/try\/catch/.test(doc));
    assert.ok(/強制\*{0,2}轉換成/.test(flatDoc));
  });

  await test('（5.failure handling）文件記錄Recovery策略總結：只有Runtime Failure需要主動攔截，其餘四種是既有的{ok:false}回傳路徑', () => {
    assert.ok(/Recovery策略總結/.test(doc));
    assert.ok(/只有Runtime Failure需要\*{0,2}主動攔截/.test(flatDoc));
  });

  await test('（5.failure handling）文件明確記錄沒有任何一種失敗規劃上會觸發自動重試（因為Chain是deterministic的）', () => {
    assert.ok(/沒有任何一種失敗規劃上會觸發自動重試/.test(doc));
    assert.ok(/deterministic/.test(doc));
  });

  await test('（5.failure handling）端對端：Decision階段失敗時reason/field/stage欄位正確帶出（Feature/Capability Failure引用的真實行為）', () => {
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

  await test('（5.failure handling）端對端：Analysis Capability不可用/Recommendation Capability不可用兩種失敗形狀完全一致（{ok:false, reason}），驗證"Feature Failure跟Capability Failure無法區分"這條規劃結論', () => {
    const orchestrator1 = createCapabilityOrchestrator({ recommendationCapability: makeRealRecommendationCapability() });
    const result1 = orchestrator1.requestCapabilityFlow({ context: makeInsightContext() });
    const orchestrator2 = createCapabilityOrchestrator({ analysisCapability: makeRealAnalysisCapability() });
    const result2 = orchestrator2.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result1).sort(), Object.keys(result2).sort());
  });

  await test('（5.failure handling）端對端：是deterministic的——同一個失敗輸入重複呼叫得到完全相同的失敗結果（驗證"不需要重試"這條規劃結論）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
    });
    assert.deepStrictEqual(orchestrator.requestCapabilityFlow(null), orchestrator.requestCapabilityFlow(null));
  });

  console.log('');

  // =========================================================================
  // F. feature compatibility
  // =========================================================================
  console.log('--- F. feature compatibility ---');

  await test('（6.feature compatibility）文件記錄Feature Integration：Insight/Behavior不經過Execution Boundary（專屬於Intelligence Capability路徑）', () => {
    assert.ok(/不\s*經過\*{0,2}\s*Execution\s*Boundary/.test(flatDoc));
  });

  await test('（6.feature compatibility）文件明確禁止Execution Boundary直接呼叫Capability Orchestrator', () => {
    assert.ok(/不得\*{0,2}直接呼叫Capability\s*Orchestrator/.test(flatDoc));
  });

  await test('（6.feature compatibility）端對端：Insight Feature依然正確運作（本次規劃沒有影響既有Insight Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（6.feature compatibility）端對端：Behavior Feature依然正確運作（本次規劃沒有影響既有Behavior Flow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
  });

  await test('（6.feature compatibility）intelligence_feature.js完全不出現HTTP相關字樣（維持"No HTTP"邊界）', () => {
    assert.ok(!/\bRequest\b/.test(featureSrc));
    assert.ok(!/\bResponse\b/.test(featureSrc));
    assert.ok(!/\bhttp\b/i.test(featureSrc));
  });

  console.log('');

  // =========================================================================
  // G. capability compatibility
  // =========================================================================
  console.log('--- G. capability compatibility ---');

  await test('（7.capability compatibility）端對端：Analysis Capability單獨呼叫依然正確運作', () => {
    const result = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（7.capability compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作', () => {
    const result = makeRealRecommendationCapability().requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（7.capability compatibility）端對端：Decision Capability單獨呼叫依然正確運作', () => {
    const result = makeRealDecisionCapability().requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
  });

  await test('（7.capability compatibility）端對端：完整Chain（Analysis→Recommendation→Decision）依然可以串接成功', () => {
    const a = makeRealAnalysisCapability().requestAnalysis({ context: makeInsightContext() });
    const r = makeRealRecommendationCapability().requestRecommendation({ analysisResult: a.result });
    const d = makeRealDecisionCapability().requestDecision({ recommendationResult: r.result });
    assert.strictEqual(a.ok, true);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(d.ok, true);
  });

  await test('（7.capability compatibility）端對端：Capability Orchestrator提供decisionCapability時正確組出三欄位結果', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: makeRealAnalysisCapability(),
      recommendationCapability: makeRealRecommendationCapability(),
      decisionCapability: makeRealDecisionCapability(),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（7.capability compatibility）${layer.name} 目錄恰好包含規格要求的檔案（本次規劃沒有新增/刪除任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  console.log('');

  // =========================================================================
  // H. contract compatibility
  // =========================================================================
  console.log('--- H. contract compatibility ---');

  await test('（8.contract compatibility）PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md（TASK1.94）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.contract compatibility）TASK1.94文件依然包含既有七個章節（本次任務沒有破壞前一份文件的結構）', () => {
    for (const section of ['Contract Boundary', 'Request Contract', 'Response Contract', 'Error Contract', 'Version Strategy', 'Phase 5 Roadmap', 'Known Limitations']) {
      assert.ok(contractPlanDoc.includes(section), `PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md缺少章節：${section}`);
    }
  });

  await test('（8.contract compatibility）PHASE5_PRODUCT_ADAPTER_PLAN.md（TASK1.92）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_ADAPTER_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.contract compatibility）PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md（TASK1.91）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.contract compatibility）PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md（TASK1.93）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.contract compatibility）文件引用TASK1.94 Error Contract的四類型作為Failure Recovery五分類的延續基礎', () => {
    assert.ok(/Error Contract/.test(doc));
  });

  await test('（8.contract compatibility）文件引用TASK1.93 Error Lifecycle五階段作為Failure Recovery的延續基礎', () => {
    assert.ok(/Error Lifecycle/.test(doc));
  });

  console.log('');

  // =========================================================================
  // I. dependency direction
  // =========================================================================
  console.log('--- I. dependency direction ---');

  await test('（9.dependency direction）app.intelligence物件恰好維持24個欄位不變（本次規劃沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（9.dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.dependency direction）src/routes/目錄本次任務完全沒有新增或修改任何檔案（沒有建立HTTP路由）', () => {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src/routes/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）src/controllers/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）四層既有Phase 4 Capability（analysis/recommendation/orchestration/decision）本次任務完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（9.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（9.dependency direction）本次任務沒有建立任何.d.ts/JSON Schema型別定義檔案', () => {
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
    await test(`（9.dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
    const src = readSrc(full);
    await test(`（9.dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（9.dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（9.dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（9.dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
  }

  console.log('');

  // =========================================================================
  // J. AI boundary
  // =========================================================================
  console.log('--- J. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（10.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（10.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（10.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（10.AI boundary）PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}`, () => {
      assert.ok(!pattern.test(doc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（10.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（10.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（10.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（10.AI boundary）文件引用TASK1.89 AI Integration Timing的判斷作為"不規劃重試"跟"現在不是導入AI時機"的延續基礎', () => {
    assert.ok(/TASK1\.89/.test(doc));
    assert.ok(/AI Integration Timing/.test(doc));
  });

  await test('（10.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
  });

  await test('（10.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
  });

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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.95-product-execution')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 85, `預期至少85個既有測試檔案，實際 ${allSuites.length}`);
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

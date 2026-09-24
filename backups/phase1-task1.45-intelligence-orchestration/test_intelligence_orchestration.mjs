/*
 * Phase 1 TASK 1.45｜Intelligence Orchestration Layer Foundation 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「單一協調邊界」：
 * intelligence_orchestrator.js能不能依照固定順序（Data Preparation →
 * Insight Context → Analysis Runner → Recommendation Runner）呼叫既有
 * 四個Phase 2子層、正確傳遞資料、任何一步失敗都正確短路，以及
 * orchestration_result_builder.js的輸出格式是否穩定可預測。不驗證任何
 * 真正的AI分析/推薦邏輯（因為根本沒有）。
 *
 * 分為以下15個部分：
 * A) pipeline execution order
 * B) data preparation integration
 * C) context integration
 * D) analysis integration
 * E) recommendation integration
 * F) result contract
 * G) deterministic output
 * H) no AI dependency
 * I) no external API
 * J) no SQL
 * K) no HTTP
 * L) no authentication dependency
 * M) bootstrap injection
 * N) regression test
 * O) P1-P6
 *
 * 全部使用純記憶體測試（除了M/N類少數呼叫真正的createApplication()跟
 * 子行程regression外），完全不連線任何真實或本機模擬的資料庫，不呼叫
 * 任何AI API或fetch()，不建立任何真實使用者session。
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
const orchDir = path.join(intelDir, 'orchestration');

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

// ---------------------------------------------------------------------------
// 測試用的樣本資料（跟TASK1.42/1.43/1.44既有測試檔案使用同樣形狀）
// ---------------------------------------------------------------------------

function sampleInsightContext(overrides) {
  return Object.assign(
    {
      user: { id: 'u1' },
      nutritionContext: { count: 1, items: [{ meal_type: 'lunch' }] },
      behaviorContext: { count: 0, items: [] },
      emotionContext: { count: 0, items: [] },
      activityContext: { count: 2, items: [{ a: 1 }, { a: 2 }] },
      reportContext: { count: 0, items: [] },
      metadata: { totalRecords: 3, sourceCounts: { nutrition: 1, behavior: 0, emotion: 0, activity: 2, report: 0 } },
    },
    overrides || {}
  );
}

function sampleAnalysisResult(overrides) {
  return Object.assign(
    {
      status: 'analysis_ready',
      insights: [
        { type: 'activity_count', value: 2, source: 'activityContext' },
        { type: 'nutrition_count', value: 1, source: 'nutritionContext' },
        { type: 'total_records', value: 3, source: 'metadata' },
      ],
      metadata: { generatedAt: null, version: '1.0.0' },
    },
    overrides || {}
  );
}

function sampleRecommendationResult(overrides) {
  return Object.assign(
    {
      status: 'recommendation_ready',
      recommendations: [
        { type: 'insight_count', value: 3, source: 'insights' },
        { type: 'analysis_status', value: 'analysis_ready', source: 'status' },
        { type: 'analysis_version', value: '1.0.0', source: 'metadata' },
      ],
      metadata: { version: '1.0.0' },
    },
    overrides || {}
  );
}

/**
 * 建立一組可控制回傳值、並記錄呼叫順序/參數的假依賴，供 pipeline
 * execution order / data preparation integration / context integration /
 * analysis integration / recommendation integration 各類測試共用。
 */
function makeSpyDeps(config) {
  config = config || {};
  const order = [];
  const calls = {};

  const dataPreparation = {
    prepare: async (db, userId, options) => {
      order.push('dataPreparation.prepare');
      calls.prepare = { db, userId, options };
      if (config.prepare) return config.prepare(db, userId, options);
      return { ok: true, context: { fake: 'prepared-context' } };
    },
  };

  const contextBuilder = {
    buildInsightContext: (preparedContext) => {
      order.push('contextBuilder.buildInsightContext');
      calls.buildInsightContext = { preparedContext };
      if (config.buildInsightContext) return config.buildInsightContext(preparedContext);
      return { context: sampleInsightContext(), validation: { ok: true } };
    },
  };

  const analysisRunner = {
    runAnalysis: (insightContext, options) => {
      order.push('analysisRunner.runAnalysis');
      calls.runAnalysis = { insightContext, options };
      if (config.runAnalysis) return config.runAnalysis(insightContext, options);
      return { ok: true, result: sampleAnalysisResult() };
    },
  };

  const recommendationRunner = {
    runRecommendation: (analysisResult) => {
      order.push('recommendationRunner.runRecommendation');
      calls.runRecommendation = { analysisResult };
      if (config.runRecommendation) return config.runRecommendation(analysisResult);
      return { ok: true, result: sampleRecommendationResult() };
    },
  };

  return { dataPreparation, contextBuilder, analysisRunner, recommendationRunner, order, calls };
}

async function run() {
  const orchestratorMod = await import(path.join(orchDir, 'intelligence_orchestrator.js'));
  const { createIntelligenceOrchestrator } = orchestratorMod;
  const resultBuilderMod = await import(path.join(orchDir, 'orchestration_result_builder.js'));
  const { createOrchestrationResultBuilder, ORCHESTRATION_RESULT_VERSION } = resultBuilderMod;
  await import(path.join(orchDir, 'index.js'));
  const { createDataPreparationService } = await import(path.join(intelDir, 'data_preparation', 'index.js'));
  const { createInsightContextBuilder } = await import(path.join(intelDir, 'context', 'index.js'));
  const { createAnalysisRunner } = await import(path.join(intelDir, 'analysis', 'index.js'));
  const { createRecommendationRunner } = await import(path.join(intelDir, 'recommendation', 'index.js'));

  // =========================================================================
  // A. pipeline execution order
  // =========================================================================
  console.log('--- A. pipeline execution order ---');

  await test('（1.pipeline execution order）createIntelligenceOrchestrator() 回傳物件具備 runIntelligencePipeline 函式', () => {
    const orchestrator = createIntelligenceOrchestrator({});
    assert.strictEqual(typeof orchestrator.runIntelligencePipeline, 'function');
  });

  await test('（1.pipeline execution order）成功路徑依序呼叫 dataPreparation→contextBuilder→analysisRunner→recommendationRunner（順序完全正確）', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(deps.order, [
      'dataPreparation.prepare',
      'contextBuilder.buildInsightContext',
      'analysisRunner.runAnalysis',
      'recommendationRunner.runRecommendation',
    ]);
  });

  await test('（1.pipeline execution order）dataPreparation失敗時，contextBuilder/analysisRunner/recommendationRunner完全不被呼叫', async () => {
    const deps = makeSpyDeps({ prepare: () => ({ ok: false, reason: 'user_not_found' }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'missing', {});
    assert.deepStrictEqual(deps.order, ['dataPreparation.prepare']);
  });

  await test('（1.pipeline execution order）contextBuilder驗證失敗時，analysisRunner/recommendationRunner完全不被呼叫', async () => {
    const deps = makeSpyDeps({ buildInsightContext: () => ({ context: {}, validation: { ok: false, reason: 'missing_field', field: 'user' } }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(deps.order, ['dataPreparation.prepare', 'contextBuilder.buildInsightContext']);
  });

  await test('（1.pipeline execution order）analysisRunner失敗時，recommendationRunner完全不被呼叫', async () => {
    const deps = makeSpyDeps({ runAnalysis: () => ({ ok: false, reason: 'invalid_context', field: 'user' }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(deps.order, ['dataPreparation.prepare', 'contextBuilder.buildInsightContext', 'analysisRunner.runAnalysis']);
  });

  await test('（1.pipeline execution order）recommendationRunner失敗時，前面三個階段依然各自恰好執行一次', async () => {
    const deps = makeSpyDeps({ runRecommendation: () => ({ ok: false, reason: 'invalid_analysis_result' }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(deps.order, ['dataPreparation.prepare', 'contextBuilder.buildInsightContext', 'analysisRunner.runAnalysis', 'recommendationRunner.runRecommendation']);
  });

  await test('（1.pipeline execution order）缺少dataPreparation依賴時，四個階段完全都不被呼叫（立刻短路）', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator({ contextBuilder: deps.contextBuilder, analysisRunner: deps.analysisRunner, recommendationRunner: deps.recommendationRunner });
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(deps.order, []);
  });

  await test('（1.pipeline execution order）缺少contextBuilder依賴時，只有dataPreparation被呼叫過', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation, analysisRunner: deps.analysisRunner, recommendationRunner: deps.recommendationRunner });
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(deps.order, ['dataPreparation.prepare']);
  });

  await test('（1.pipeline execution order）缺少analysisRunner依賴時，dataPreparation跟contextBuilder都被呼叫過，analysisRunner/recommendationRunner都沒有', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation, contextBuilder: deps.contextBuilder, recommendationRunner: deps.recommendationRunner });
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(deps.order, ['dataPreparation.prepare', 'contextBuilder.buildInsightContext']);
  });

  await test('（1.pipeline execution order）缺少recommendationRunner依賴時，前三個階段都被呼叫過，recommendationRunner沒有', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation, contextBuilder: deps.contextBuilder, analysisRunner: deps.analysisRunner });
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(deps.order, ['dataPreparation.prepare', 'contextBuilder.buildInsightContext', 'analysisRunner.runAnalysis']);
  });

  await test('（1.pipeline execution order）同一個orchestrator實例連續呼叫兩次，兩次的執行順序都完全正確（不受前一次呼叫影響）', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    await orchestrator.runIntelligencePipeline({}, 'u2', {});
    assert.deepStrictEqual(deps.order, [
      'dataPreparation.prepare', 'contextBuilder.buildInsightContext', 'analysisRunner.runAnalysis', 'recommendationRunner.runRecommendation',
      'dataPreparation.prepare', 'contextBuilder.buildInsightContext', 'analysisRunner.runAnalysis', 'recommendationRunner.runRecommendation',
    ]);
  });

  await test('（1.pipeline execution order，端對端）真正的四個子層（非假依賴）依然依照正確順序被串起來（用真正的contextBuilder/analysisRunner/recommendationRunner，只假造dataPreparation避免真的連線D1）', async () => {
    const realContextBuilder = createInsightContextBuilder();
    const realAnalysisRunner = createAnalysisRunner();
    const realRecommendationRunner = createRecommendationRunner();
    const fakeDataPreparation = { prepare: async () => ({ ok: true, context: { user: { id: 'u1' }, explorations: { count: 0, items: [] }, foodEvents: { count: 0, items: [] }, emotions: { count: 0, items: [] }, behaviors: { count: 0, items: [] }, reports: { count: 0, items: [] } } }) };
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: fakeDataPreparation, contextBuilder: realContextBuilder, analysisRunner: realAnalysisRunner, recommendationRunner: realRecommendationRunner });
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, true);
    assert.strictEqual(outcome.data.result.status, 'intelligence_ready');
  });

  console.log('');

  // =========================================================================
  // B. data preparation integration
  // =========================================================================
  console.log('--- B. data preparation integration ---');

  await test('（2.data preparation integration）db/userId/options 三個參數原樣轉交給dataPreparation.prepare()', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    const db = { marker: 'the-db' };
    const options = { limit: 10 };
    await orchestrator.runIntelligencePipeline(db, 'u1', options);
    assert.strictEqual(deps.calls.prepare.db, db);
    assert.strictEqual(deps.calls.prepare.userId, 'u1');
    assert.strictEqual(deps.calls.prepare.options, options);
  });

  await test('（2.data preparation integration）dataPreparation失敗且有reason時，orchestration回傳{ok:false, status:"orchestration_unavailable", reason}原樣轉發', async () => {
    const deps = makeSpyDeps({ prepare: () => ({ ok: false, reason: 'user_not_found' }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    const outcome = await orchestrator.runIntelligencePipeline({}, 'missing', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.status, 'orchestration_unavailable');
    assert.strictEqual(outcome.reason, 'user_not_found');
  });

  await test('（2.data preparation integration）dataPreparation失敗只有error欄位（沒有reason）時，改用error當作reason', async () => {
    const deps = makeSpyDeps({ prepare: () => ({ ok: false, error: 'boom' }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.reason, 'boom');
  });

  await test('（2.data preparation integration）dataPreparation失敗且reason/error都沒有時，安全預設為"context_build_failed"', async () => {
    const deps = makeSpyDeps({ prepare: () => ({ ok: false }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.reason, 'context_build_failed');
  });

  await test('（2.data preparation integration）dataPreparation依賴完全缺少時，安全回傳{ok:false, reason:"data_preparation_unavailable"}，不拋出例外', async () => {
    const orchestrator = createIntelligenceOrchestrator({});
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.reason, 'data_preparation_unavailable');
  });

  await test('（2.data preparation integration）dataPreparation.prepare不是函式時，安全回傳失敗，不拋出例外', async () => {
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: { prepare: 'not-a-function' } });
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.reason, 'data_preparation_unavailable');
  });

  await test('（2.data preparation integration）options為undefined時不拋出例外，安全轉交undefined', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    await assert.doesNotReject(() => orchestrator.runIntelligencePipeline({}, 'u1'));
    assert.strictEqual(deps.calls.prepare.options, undefined);
  });

  await test('（2.data preparation integration）連續呼叫兩次、不同userId，各自呼叫prepare()時帶著正確的userId', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(deps.calls.prepare.userId, 'u1');
    await orchestrator.runIntelligencePipeline({}, 'u2', {});
    assert.strictEqual(deps.calls.prepare.userId, 'u2');
  });

  await test('（2.data preparation integration，端對端）真正的createDataPreparationService()實例可以被當作依賴注入進orchestrator（形狀相容，不拋出例外）', () => {
    const realDataPreparation = createDataPreparationService();
    assert.doesNotThrow(() => createIntelligenceOrchestrator({ dataPreparation: realDataPreparation }));
  });

  console.log('');

  // =========================================================================
  // C. context integration
  // =========================================================================
  console.log('--- C. context integration ---');

  await test('（3.context integration）contextBuilder.buildInsightContext() 收到的是dataPreparation.prepare()回傳的context欄位（原樣，非重新複製的shallow copy）', async () => {
    const preparedContext = { marker: 'prepared' };
    const deps = makeSpyDeps({ prepare: () => ({ ok: true, context: preparedContext }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(deps.calls.buildInsightContext.preparedContext, preparedContext);
  });

  await test('（3.context integration）validation.ok為false時，orchestration回傳{ok:false, status:"orchestration_invalid", reason, field}', async () => {
    const deps = makeSpyDeps({ buildInsightContext: () => ({ context: {}, validation: { ok: false, reason: 'invalid_field_type', field: 'nutritionContext' } }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.status, 'orchestration_invalid');
    assert.strictEqual(outcome.reason, 'invalid_field_type');
    assert.strictEqual(outcome.field, 'nutritionContext');
  });

  await test('（3.context integration）validation.ok為true時，往下傳給analysisRunner的是contextBuilder回傳的context（不是prepared.context）', async () => {
    const builtContext = sampleInsightContext();
    const deps = makeSpyDeps({ buildInsightContext: () => ({ context: builtContext, validation: { ok: true } }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(deps.calls.runAnalysis.insightContext, builtContext);
  });

  await test('（3.context integration）contextBuilder依賴完全缺少時，安全回傳失敗，不拋出例外', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation });
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.reason, 'context_builder_unavailable');
  });

  await test('（3.context integration）contextBuilder.buildInsightContext不是函式時，安全回傳失敗', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation, contextBuilder: { buildInsightContext: null } });
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.reason, 'context_builder_unavailable');
  });

  await test('（3.context integration，端對端）真正的createInsightContextBuilder()把dataPreparation正規化後的形狀轉成通過驗證的Insight Context', async () => {
    const preparedContext = {
      user: { id: 'u1' },
      explorations: { count: 2, items: [{ a: 1 }, { a: 2 }] },
      foodEvents: { count: 1, items: [{ meal_type: 'lunch' }] },
      emotions: { count: 0, items: [] },
      behaviors: { count: 0, items: [] },
      reports: { count: 0, items: [] },
    };
    const deps = makeSpyDeps({ prepare: () => ({ ok: true, context: preparedContext }) });
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation, contextBuilder: createInsightContextBuilder(), analysisRunner: deps.analysisRunner, recommendationRunner: deps.recommendationRunner });
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    const passedContext = deps.calls.runAnalysis.insightContext;
    assert.strictEqual(passedContext.activityContext.count, 2);
    assert.strictEqual(passedContext.nutritionContext.count, 1);
    assert.strictEqual(passedContext.metadata.totalRecords, 3);
  });

  await test('（3.context integration）validation物件裡field不存在時（例如reason沒有field），orchestration的field欄位安全為undefined，不拋出例外', async () => {
    const deps = makeSpyDeps({ buildInsightContext: () => ({ context: {}, validation: { ok: false, reason: 'context_build_failed' } }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.field, undefined);
  });

  console.log('');

  // =========================================================================
  // D. analysis integration
  // =========================================================================
  console.log('--- D. analysis integration ---');

  await test('（4.analysis integration）analysisRunner.runAnalysis() 收到的第二個參數是orchestrator呼叫時傳入的options', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    const options = { generatedAt: '2026-01-01T00:00:00Z' };
    await orchestrator.runIntelligencePipeline({}, 'u1', options);
    assert.strictEqual(deps.calls.runAnalysis.options, options);
  });

  await test('（4.analysis integration）analysisRunner失敗時，orchestration回傳{ok:false, status:"orchestration_invalid", reason, field}', async () => {
    const deps = makeSpyDeps({ runAnalysis: () => ({ ok: false, reason: 'missing_field', field: 'metadata' }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.status, 'orchestration_invalid');
    assert.strictEqual(outcome.reason, 'missing_field');
    assert.strictEqual(outcome.field, 'metadata');
  });

  await test('（4.analysis integration）analysisRunner依賴完全缺少時，安全回傳失敗', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation, contextBuilder: deps.contextBuilder });
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.reason, 'analysis_runner_unavailable');
  });

  await test('（4.analysis integration）analysisRunner.runAnalysis不是函式時，安全回傳失敗', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation, contextBuilder: deps.contextBuilder, analysisRunner: {} });
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.reason, 'analysis_runner_unavailable');
  });

  await test('（4.analysis integration）analysisRunner每次pipeline執行恰好只被呼叫一次', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    const calls = deps.order.filter((n) => n === 'analysisRunner.runAnalysis');
    assert.strictEqual(calls.length, 1);
  });

  await test('（4.analysis integration，端對端）真正的createAnalysisRunner()對真正的Insight Context跑出analysis_ready結果', async () => {
    const realAnalysisRunner = createAnalysisRunner();
    const deps = makeSpyDeps({ runAnalysis: undefined });
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation, contextBuilder: deps.contextBuilder, analysisRunner: realAnalysisRunner, recommendationRunner: deps.recommendationRunner });
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(deps.calls.runRecommendation.analysisResult.status, 'analysis_ready');
  });

  await test('（4.analysis integration）recommendationRunner收到的正是analysisOutcome.result（同一個物件參考，不是重新建構）', async () => {
    const analysisResult = sampleAnalysisResult();
    const deps = makeSpyDeps({ runAnalysis: () => ({ ok: true, result: analysisResult }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(deps.calls.runRecommendation.analysisResult, analysisResult);
  });

  console.log('');

  // =========================================================================
  // E. recommendation integration
  // =========================================================================
  console.log('--- E. recommendation integration ---');

  await test('（5.recommendation integration）recommendationRunner失敗時，orchestration回傳{ok:false, status:"orchestration_invalid", reason, field}', async () => {
    const deps = makeSpyDeps({ runRecommendation: () => ({ ok: false, reason: 'invalid_analysis_result' }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.status, 'orchestration_invalid');
    assert.strictEqual(outcome.reason, 'invalid_analysis_result');
  });

  await test('（5.recommendation integration）recommendationRunner依賴完全缺少時，安全回傳失敗', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation, contextBuilder: deps.contextBuilder, analysisRunner: deps.analysisRunner });
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.reason, 'recommendation_runner_unavailable');
  });

  await test('（5.recommendation integration）recommendationRunner.runRecommendation不是函式時，安全回傳失敗', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation, contextBuilder: deps.contextBuilder, analysisRunner: deps.analysisRunner, recommendationRunner: { runRecommendation: 123 } });
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.reason, 'recommendation_runner_unavailable');
  });

  await test('（5.recommendation integration）recommendationRunner每次pipeline執行恰好只被呼叫一次', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    const calls = deps.order.filter((n) => n === 'recommendationRunner.runRecommendation');
    assert.strictEqual(calls.length, 1);
  });

  await test('（5.recommendation integration）成功時，最終Unified Result的recommendation欄位正是recommendationOutcome.result（同一個物件參考）', async () => {
    const recommendationResult = sampleRecommendationResult();
    const deps = makeSpyDeps({ runRecommendation: () => ({ ok: true, result: recommendationResult }) });
    const orchestrator = createIntelligenceOrchestrator(deps);
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.data.result.recommendation, recommendationResult);
  });

  await test('（5.recommendation integration，端對端）真正的createRecommendationRunner()對真正的Analysis Result跑出recommendation_ready結果', async () => {
    const realRecommendationRunner = createRecommendationRunner();
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: deps.dataPreparation, contextBuilder: deps.contextBuilder, analysisRunner: deps.analysisRunner, recommendationRunner: realRecommendationRunner });
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.data.result.recommendation.status, 'recommendation_ready');
  });

  await test('（5.recommendation integration）recommendationRunner收到的參數形狀是Analysis Result（有status/insights/metadata），不是Insight Context（不會誤把context當成analysisResult傳遞）', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    const arg = deps.calls.runRecommendation.analysisResult;
    assert.ok('status' in arg && 'insights' in arg && 'metadata' in arg);
    assert.ok(!('nutritionContext' in arg));
  });

  console.log('');

  // =========================================================================
  // F. result contract
  // =========================================================================
  console.log('--- F. result contract ---');

  await test('（6.result contract）buildOrchestrationResult() 回傳shape恰好是{status, context, analysis, recommendation, metadata}', () => {
    const builder = createOrchestrationResultBuilder();
    const result = builder.buildOrchestrationResult({});
    assert.deepStrictEqual(Object.keys(result).sort(), ['analysis', 'context', 'metadata', 'recommendation', 'status']);
  });

  await test('（6.result contract）status固定為"intelligence_ready"', () => {
    const builder = createOrchestrationResultBuilder();
    const result = builder.buildOrchestrationResult({});
    assert.strictEqual(result.status, 'intelligence_ready');
  });

  await test('（6.result contract）metadata恰好只有version一個欄位（規格範例沒有其他欄位）', () => {
    const builder = createOrchestrationResultBuilder();
    const result = builder.buildOrchestrationResult({});
    assert.deepStrictEqual(Object.keys(result.metadata), ['version']);
  });

  await test('（6.result contract）metadata.version === ORCHESTRATION_RESULT_VERSION', () => {
    const builder = createOrchestrationResultBuilder();
    const result = builder.buildOrchestrationResult({});
    assert.strictEqual(result.metadata.version, ORCHESTRATION_RESULT_VERSION);
  });

  await test('（6.result contract）context/analysis/recommendation欄位分別等於傳入的layers.context/analysis/recommendation（同一個物件參考，不重新複製）', () => {
    const builder = createOrchestrationResultBuilder();
    const context = { c: 1 };
    const analysis = { a: 1 };
    const recommendation = { r: 1 };
    const result = builder.buildOrchestrationResult({ context, analysis, recommendation });
    assert.strictEqual(result.context, context);
    assert.strictEqual(result.analysis, analysis);
    assert.strictEqual(result.recommendation, recommendation);
  });

  await test('（6.result contract）沒有傳入layers物件時，context/analysis/recommendation安全預設為null，不拋出例外', () => {
    const builder = createOrchestrationResultBuilder();
    assert.doesNotThrow(() => builder.buildOrchestrationResult());
    const result = builder.buildOrchestrationResult();
    assert.strictEqual(result.context, null);
    assert.strictEqual(result.analysis, null);
    assert.strictEqual(result.recommendation, null);
  });

  await test('（6.result contract）只傳入部分layers欄位（例如只有context）時，其餘欄位安全預設為null', () => {
    const builder = createOrchestrationResultBuilder();
    const result = builder.buildOrchestrationResult({ context: { c: 1 } });
    assert.deepStrictEqual(result.context, { c: 1 });
    assert.strictEqual(result.analysis, null);
    assert.strictEqual(result.recommendation, null);
  });

  await test('（6.result contract，端對端）runIntelligencePipeline()成功時回傳{ok:true, status:"intelligence_ready", data:{result}}，result本身符合規格範例形狀', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(outcome.ok, true);
    assert.strictEqual(outcome.status, 'intelligence_ready');
    assert.deepStrictEqual(Object.keys(outcome.data.result).sort(), ['analysis', 'context', 'metadata', 'recommendation', 'status']);
  });

  await test('（6.result contract，端對端）result.context/result.analysis/result.recommendation分別deepStrictEqual各階段的真正輸出', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(outcome.data.result.context, sampleInsightContext());
    assert.deepStrictEqual(outcome.data.result.analysis, sampleAnalysisResult());
    assert.deepStrictEqual(outcome.data.result.recommendation, sampleRecommendationResult());
  });

  await test('（6.result contract）JSON.stringify(result)不會拋出例外、也不會遺失任何頂層欄位（純資料結構，沒有循環參考/函式）', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    const outcome = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    const roundTripped = JSON.parse(JSON.stringify(outcome.data.result));
    assert.deepStrictEqual(Object.keys(roundTripped).sort(), Object.keys(outcome.data.result).sort());
  });

  console.log('');

  // =========================================================================
  // G. deterministic output
  // =========================================================================
  console.log('--- G. deterministic output ---');

  await test('（7.deterministic output）同樣的假依賴輸出，連續呼叫兩次runIntelligencePipeline()得到完全相同（deepStrictEqual）的outcome', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    const a = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    const b = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(a, b);
  });

  await test('（7.deterministic output）不同orchestrator實例對同樣輸入產生相同輸出（不依賴實例內部狀態）', async () => {
    const a = await createIntelligenceOrchestrator(makeSpyDeps()).runIntelligencePipeline({}, 'u1', {});
    const b = await createIntelligenceOrchestrator(makeSpyDeps()).runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(a, b);
  });

  await test('（7.deterministic output，端對端）真正的contextBuilder/analysisRunner/recommendationRunner三層（只假造dataPreparation）連續兩次呼叫得到相同結果', async () => {
    const preparedContext = { user: { id: 'u1' }, explorations: { count: 0, items: [] }, foodEvents: { count: 0, items: [] }, emotions: { count: 0, items: [] }, behaviors: { count: 0, items: [] }, reports: { count: 0, items: [] } };
    const fakeDataPreparation = { prepare: async () => ({ ok: true, context: preparedContext }) };
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation: fakeDataPreparation, contextBuilder: createInsightContextBuilder(), analysisRunner: createAnalysisRunner(), recommendationRunner: createRecommendationRunner() });
    const a = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    const b = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(a, b);
  });

  await test('（7.deterministic output）intelligence_orchestrator.js 不讀取Date.now()/Math.random()（原始碼掃描確認）', () => {
    const src = readSrc(path.join(orchDir, 'intelligence_orchestrator.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（7.deterministic output）orchestration_result_builder.js 不讀取Date.now()/Math.random()（原始碼掃描確認）', () => {
    const src = readSrc(path.join(orchDir, 'orchestration_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（7.deterministic output）buildOrchestrationResult() 只接受單一layers參數，不接受options（規格範例metadata只有version，天生不需要）', () => {
    const src = readSrc(path.join(orchDir, 'orchestration_result_builder.js'));
    assert.ok(/function buildOrchestrationResult\(layers\)/.test(src));
  });

  await test('（7.deterministic output）metadata.version固定不變，不因輸入內容改變', () => {
    const builder = createOrchestrationResultBuilder();
    const a = builder.buildOrchestrationResult({ context: { x: 1 } });
    const b = builder.buildOrchestrationResult({ context: { x: 2 }, analysis: { y: 1 } });
    assert.strictEqual(a.metadata.version, b.metadata.version);
  });

  await test('（7.deterministic output）runIntelligencePipeline()不會修改（mutate）任何一層回傳的原始物件', async () => {
    const preparedContext = { marker: 'p' };
    const builtContext = sampleInsightContext();
    const analysisResult = sampleAnalysisResult();
    const recommendationResult = sampleRecommendationResult();
    const snapshotContext = JSON.parse(JSON.stringify(builtContext));
    const snapshotAnalysis = JSON.parse(JSON.stringify(analysisResult));
    const snapshotRecommendation = JSON.parse(JSON.stringify(recommendationResult));
    const deps = makeSpyDeps({
      prepare: () => ({ ok: true, context: preparedContext }),
      buildInsightContext: () => ({ context: builtContext, validation: { ok: true } }),
      runAnalysis: () => ({ ok: true, result: analysisResult }),
      runRecommendation: () => ({ ok: true, result: recommendationResult }),
    });
    const orchestrator = createIntelligenceOrchestrator(deps);
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(builtContext, snapshotContext);
    assert.deepStrictEqual(analysisResult, snapshotAnalysis);
    assert.deepStrictEqual(recommendationResult, snapshotRecommendation);
  });

  await test('（7.deterministic output）連續三次呼叫（相同輸入）第一次跟第三次的outcome完全相同（不依賴呼叫次數/內部計數器）', async () => {
    const deps = makeSpyDeps();
    const orchestrator = createIntelligenceOrchestrator(deps);
    const first = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    await orchestrator.runIntelligencePipeline({}, 'u1', {});
    const third = await orchestrator.runIntelligencePipeline({}, 'u1', {});
    assert.deepStrictEqual(first, third);
  });

  console.log('');

  // =========================================================================
  // H. no AI dependency
  // =========================================================================
  console.log('--- H. no AI dependency ---');

  const ORCH_JS_FILES = fs.readdirSync(orchDir).filter((f) => f.endsWith('.js')).sort();
  await test('（8.no AI dependency）src/intelligence/orchestration/ 恰好包含3個.js檔案（intelligence_orchestrator/orchestration_result_builder/index）', () => {
    assert.deepStrictEqual(ORCH_JS_FILES, ['index.js', 'intelligence_orchestrator.js', 'orchestration_result_builder.js']);
  });

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of ORCH_JS_FILES) {
    const codeOnly = readSrc(path.join(orchDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.no AI dependency）src/intelligence/orchestration/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI API相關字樣：${pattern}`);
      });
    }
    await test(`（8.no AI dependency）src/intelligence/orchestration/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // I. no external API
  // =========================================================================
  console.log('--- I. no external API ---');

  for (const file of ORCH_JS_FILES) {
    await test(`（9.no external API）src/intelligence/orchestration/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(orchDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（9.no external API）src/intelligence/orchestration/${file} 完全沒有 import src/oauth/ 底下任何檔案`, () => {
      const src = readSrc(path.join(orchDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // J. no SQL
  // =========================================================================
  console.log('--- J. no SQL ---');

  for (const file of ORCH_JS_FILES) {
    await test(`（10.no SQL）src/intelligence/orchestration/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(orchDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（10.no SQL）src/intelligence/orchestration/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(orchDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（10.no SQL）src/intelligence/orchestration/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(orchDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（10.no SQL）src/intelligence/orchestration/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(orchDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（10.no SQL）intelligence_orchestrator.js 的db參數完全不被解構/存取任何屬性——db只是原樣轉交給dataPreparation.prepare()的不透明參數', () => {
    const src = readSrc(path.join(orchDir, 'intelligence_orchestrator.js'));
    assert.ok(!/\bdb\.\w/.test(src), 'db不應該被存取任何屬性，orchestrator不應該知道db的內部結構');
  });

  await test('（10.no SQL）intelligence_orchestrator.js 簽章確實是 runIntelligencePipeline(db, userId, options)', () => {
    const src = readSrc(path.join(orchDir, 'intelligence_orchestrator.js'));
    assert.ok(/async function runIntelligencePipeline\(db, userId, options\)/.test(src));
  });

  console.log('');

  // =========================================================================
  // K. no HTTP
  // =========================================================================
  console.log('--- K. no HTTP ---');

  for (const file of ORCH_JS_FILES) {
    await test(`（11.no HTTP）src/intelligence/orchestration/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(orchDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
    await test(`（11.no HTTP）src/intelligence/orchestration/${file} 完全沒有出現 Request/Response 字樣（不知道HTTP是什麼）`, () => {
      const src = readSrc(path.join(orchDir, file));
      assert.ok(!/\bnew Request\(/.test(src));
      assert.ok(!/\bnew Response\(/.test(src));
    });
  }

  const routeFiles = fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js'));
  for (const file of routeFiles) {
    await test(`（11.no HTTP）src/routes/${file} 完全不 import src/intelligence/orchestration/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/orchestration\//.test(src));
    });
  }
  const controllerFiles = fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js'));
  for (const file of controllerFiles) {
    await test(`（11.no HTTP）src/controllers/${file} 完全不 import src/intelligence/orchestration/`, () => {
      const src = stripComments(fs.readFileSync(path.join(srcRoot, 'controllers', file), 'utf8'));
      assert.ok(!/from\s+['"].*\/intelligence\/orchestration\//.test(src));
    });
  }

  console.log('');

  // =========================================================================
  // L. no authentication dependency
  // =========================================================================
  console.log('--- L. no authentication dependency ---');

  for (const file of ORCH_JS_FILES) {
    await test(`（12.no authentication dependency）src/intelligence/orchestration/${file} 完全不 import src/auth/ 或 src/identity/`, () => {
      const src = readSrc(path.join(orchDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（12.no authentication dependency）src/intelligence/orchestration/${file} 完全不 import src/middleware/（不做requireAuth等middleware邏輯）`, () => {
      const src = readSrc(path.join(orchDir, file));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（12.no authentication dependency）src/intelligence/orchestration/${file} 完全沒有出現 JWT/session/cookie/token 相關字樣`, () => {
      const src = readSrc(path.join(orchDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（12.no authentication dependency）intelligence_orchestrator.js 完全不呼叫 requireAuth/requireActiveUser（userId一律由呼叫端當作獨立參數傳入，不自己驗證身份）', () => {
    const src = readSrc(path.join(orchDir, 'intelligence_orchestrator.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // M. bootstrap injection
  // =========================================================================
  console.log('--- M. bootstrap injection ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（13.bootstrap injection）createApplication(env).intelligence 具備 orchestration 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('orchestration' in app.intelligence);
  });

  await test('（13.bootstrap injection）app.intelligence.orchestration 具備 runIntelligencePipeline 函式', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(typeof app.intelligence.orchestration.runIntelligencePipeline, 'function');
  });

  // 注意：TASK1.46 為 app.intelligence 新增了 `service` 欄位，這是
  // 明確要做的擴充，不是回歸，這裡的預期key清單已同步更新。
  await test('（TASK1.54後更新）app.intelligence 恰好具備 insightService/analysisEngine/recommendationEngine/dataPreparation/context/analysis/recommendation/orchestration/service/facade/execution/events/history/monitoring/metrics 十五個欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), ['analysis', 'analysisEngine', 'context', 'dataPreparation', 'events', 'execution', 'facade', 'history', 'insightService', 'metrics', 'monitoring', 'orchestration', 'recommendation', 'recommendationEngine', 'service']);
  });

  await test('（13.bootstrap injection）app.intelligence.orchestration內部注入的dataPreparation跟app.intelligence.dataPreparation是同一個實例（用spy覆寫prepare()驗證兩者共用同一個物件參考）', async () => {
    const app = createApplication(makeFullEnv());
    let called = false;
    app.intelligence.dataPreparation.prepare = async () => {
      called = true;
      return { ok: false, reason: 'spy_short_circuit' };
    };
    const outcome = await app.intelligence.orchestration.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(called, true);
    assert.strictEqual(outcome.reason, 'spy_short_circuit');
  });

  await test('（13.bootstrap injection）app.intelligence.orchestration內部注入的contextBuilder跟app.intelligence.context是同一個實例（用spy覆寫buildInsightContext()驗證）', async () => {
    const app = createApplication(makeFullEnv());
    app.intelligence.dataPreparation.prepare = async () => ({ ok: true, context: {} });
    let called = false;
    app.intelligence.context.buildInsightContext = () => {
      called = true;
      return { context: {}, validation: { ok: false, reason: 'spy_short_circuit' } };
    };
    const outcome = await app.intelligence.orchestration.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(called, true);
    assert.strictEqual(outcome.reason, 'spy_short_circuit');
  });

  await test('（13.bootstrap injection）app.intelligence.orchestration內部注入的analysisRunner跟app.intelligence.analysis是同一個實例（用spy覆寫runAnalysis()驗證）', async () => {
    const app = createApplication(makeFullEnv());
    app.intelligence.dataPreparation.prepare = async () => ({ ok: true, context: {} });
    app.intelligence.context.buildInsightContext = () => ({ context: {}, validation: { ok: true } });
    let called = false;
    app.intelligence.analysis.runAnalysis = () => {
      called = true;
      return { ok: false, reason: 'spy_short_circuit' };
    };
    const outcome = await app.intelligence.orchestration.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(called, true);
    assert.strictEqual(outcome.reason, 'spy_short_circuit');
  });

  await test('（13.bootstrap injection）app.intelligence.orchestration內部注入的recommendationRunner跟app.intelligence.recommendation是同一個實例（用spy覆寫runRecommendation()驗證）', async () => {
    const app = createApplication(makeFullEnv());
    app.intelligence.dataPreparation.prepare = async () => ({ ok: true, context: {} });
    app.intelligence.context.buildInsightContext = () => ({ context: {}, validation: { ok: true } });
    app.intelligence.analysis.runAnalysis = () => ({ ok: true, result: sampleAnalysisResult() });
    let called = false;
    app.intelligence.recommendation.runRecommendation = () => {
      called = true;
      return { ok: false, reason: 'spy_short_circuit' };
    };
    const outcome = await app.intelligence.orchestration.runIntelligencePipeline({}, 'u1', {});
    assert.strictEqual(called, true);
    assert.strictEqual(outcome.reason, 'spy_short_circuit');
  });

  await test('（13.bootstrap injection）每次createApplication()呼叫都各自建立獨立的orchestration實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.orchestration, app2.intelligence.orchestration);
  });

  await test('（13.bootstrap injection）createApplication() 完整回傳形狀依然是 {config, db, services, router, middleware, intelligence} 六個頂層欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'intelligence', 'middleware', 'router', 'services']);
  });

  await test('（13.bootstrap injection）app.intelligence.insightService 完全沒有被TASK1.45修改成會呼叫app.intelligence.orchestration（本次任務規格明確不要求串接insight_service.js）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/insight_service.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.bootstrap injection）原始碼掃描：src/bootstrap/application.js 有 import orchestration（來自 ../intelligence/index.js）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    assert.ok(/\borchestration\b.*from ['"]\.\.\/intelligence\/index\.js['"]/.test(src));
  });

  await test('（13.bootstrap injection）原始碼掃描：src/intelligence/index.js 有 export orchestration namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as orchestration from ['"]\.\/orchestration\/index\.js['"]/.test(src));
  });

  await test('（13.bootstrap injection）app.router.routes 數量沒有因為新增orchestration而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（13.bootstrap injection）原始碼掃描：src/bootstrap/application.js 呼叫createIntelligenceOrchestrator()時注入的是既有的dataPreparationService/insightContextBuilder/analysisRunner/recommendationRunner四個變數（不是各自新建第二份實例）', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'bootstrap', 'application.js'), 'utf8'));
    const match = src.match(/createIntelligenceOrchestrator\(\{([^}]*)\}\)/);
    assert.ok(match, '應該找得到createIntelligenceOrchestrator({...})呼叫');
    const body = match[1];
    assert.ok(/dataPreparation\s*:\s*dataPreparationService/.test(body));
    assert.ok(/contextBuilder\s*:\s*insightContextBuilder/.test(body));
    assert.ok(/analysisRunner\s*,|analysisRunner\s*:\s*analysisRunner/.test(body));
    assert.ok(/recommendationRunner\s*,|recommendationRunner\s*:\s*recommendationRunner/.test(body));
  });

  console.log('');

  // =========================================================================
  // N. regression test
  // =========================================================================
  console.log('--- N. regression test ---');

  // 沿用TASK1.39~1.44既有的遞迴防護手法。
  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（14.regression test）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.45-intelligence-orchestration')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（14.regression test）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.44）`, () => {
      assert.ok(allSuites.length >= 36, `預期至少36個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（14.regression test）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // O. P1-P6
  // =========================================================================
  console.log('--- O. P1-P6 ---');

  await test('（15.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（15.P1-P6）src/worker.js 完全沒有被TASK1.45修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（15.P1-P6）wrangler.toml 完全沒有被TASK1.45修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（15.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

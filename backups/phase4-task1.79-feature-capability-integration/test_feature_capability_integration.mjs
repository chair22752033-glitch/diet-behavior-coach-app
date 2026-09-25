/*
 * Phase 4 TASK 1.79｜Feature Intelligence Capability Integration
 * Foundation 測試
 *
 * 本任務不是導入AI、不是建立AI Provider、不是修改Feature
 * Pattern——這是Phase 4 Capability跟Phase 3 Feature Layer之間正式
 * 的整合邊界，讓Feature可以透過明確的Capability Boundary使用
 * TASK1.76 Analysis Capability + TASK1.77 Recommendation
 * Capability + TASK1.78 Capability Orchestration這一整套Phase 4
 * 能力。
 *
 * 這份測試驗證的是：
 * - intelligence_feature.js/intelligence_feature_result_mapper.js
 *   各自的boundary正確
 * - 端對端：Intelligence Feature透過真實的Capability
 *   Orchestrator（進而真實的Analysis Capability/Recommendation
 *   Capability）可以走完整條「Feature Request → Capability
 *   Orchestrator → Analysis Capability → Recommendation
 *   Capability → Output」流程
 * - Intelligence Feature完全不直接依賴database/auth/session/
 *   execution manager/history store/metrics store
 * - 完全不繞過Capability Orchestrator直接呼叫Analysis/
 *   Recommendation Capability，也完全不呼叫Workflow/Use
 *   Case/Application Service（跟Insight/Behavior Feature走的是
 *   完全不同、平行的路徑）
 * - Analysis Runner/Recommendation Runner/Phase 2 Runtime
 *   Orchestrator/三個Phase 4 Capability本身完全沒有被修改
 * - Insight/Behavior Feature本身完全沒有被修改，Phase 3
 *   Application Pattern（Workflow/UseCase/ApplicationService）
 *   維持不變
 * - export一致性、regression、P1-P6
 *
 * 分為以下10個部分：
 * A) feature capability integration
 * B) capability orchestration usage
 * C) analysis flow
 * D) recommendation flow
 * E) output mapping
 * F) runtime isolation
 * G) dependency scan
 * H) no AI dependency
 * I) regression check
 * J) P1-P6
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

function getNamedExports(fullPath) {
  const src = readSrc(fullPath);
  const names = new Set();
  for (const m of src.matchAll(/^export\s+const\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+function\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  return names;
}

function getReExportedNames(indexPath) {
  const src = readSrc(indexPath);
  const names = new Set();
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}\s*from/gm)) {
    for (const part of m[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const asMatch = trimmed.match(/^(\S+)\s+as\s+(\S+)$/);
      names.add(asMatch ? asMatch[1] : trimmed);
    }
  }
  return names;
}

function getReExportedNamespaces(indexPath) {
  const src = readSrc(indexPath);
  const names = new Set();
  for (const m of src.matchAll(/^export\s*\*\s*as\s+(\S+)\s+from/gm)) {
    names.add(m[1]);
  }
  return names;
}

const INTELLIGENCE_FEATURE_JS_FILES = ['intelligence_feature.js', 'intelligence_feature_result_mapper.js', 'index.js'];

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

async function run() {
  const { createIntelligenceFeature } = await import(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
  const { createIntelligenceFeatureResultMapper } = await import(path.join(intelligenceFeatureDir, 'intelligence_feature_result_mapper.js'));
  await import(path.join(intelligenceFeatureDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(recommendationDir, 'index.js'));

  function makeRealOrchestrator() {
    return createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
  }

  // =========================================================================
  // A. feature capability integration
  // =========================================================================
  console.log('--- A. feature capability integration ---');

  await test('（1.feature capability integration）src/intelligence/application/features/intelligence/ 恰好包含4個檔案（intelligence_feature/intelligence_feature_result_mapper/index/README）', () => {
    const files = fs.readdirSync(intelligenceFeatureDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'index.js', 'intelligence_feature.js', 'intelligence_feature_result_mapper.js']);
  });

  await test('（1.feature capability integration）features/intelligence/index.js完整re-export了兩個具名函式（createIntelligenceFeature/createIntelligenceFeatureResultMapper），沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(intelligenceFeatureDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createIntelligenceFeature', 'createIntelligenceFeatureResultMapper']);
  });

  await test('（1.feature capability integration）features/intelligence/index.js re-export的名稱在對應來源檔案裡確實存在', () => {
    const indexSrc = readSrc(path.join(intelligenceFeatureDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(intelligenceFeatureDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（1.feature capability integration）features/intelligence/index.js唯一的相對路徑import是./intelligence_feature.js跟./intelligence_feature_result_mapper.js', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'index.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports.sort(), ['./intelligence_feature.js', './intelligence_feature_result_mapper.js']);
  });

  await test('（1.feature capability integration）intelligence_feature.js唯一的相對路徑import是./intelligence_feature_result_mapper.js', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./intelligence_feature_result_mapper.js']);
  });

  await test('（1.feature capability integration）intelligence_feature_result_mapper.js完全零相依（沒有任何import）', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature_result_mapper.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（1.feature capability integration）src/intelligence/application/features/intelligence/README.md 存在且非空', () => {
    const readmePath = path.join(intelligenceFeatureDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.feature capability integration）createIntelligenceFeature()回傳物件恰好只有requestIntelligence一個公開介面', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    assert.deepStrictEqual(Object.keys(feature), ['requestIntelligence']);
  });

  await test('（1.feature capability integration）createIntelligenceFeatureResultMapper()回傳物件恰好只有mapSuccessResult/mapFailureResult兩個公開介面', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    assert.deepStrictEqual(Object.keys(mapper).sort(), ['mapFailureResult', 'mapSuccessResult']);
  });

  await test('（1.feature capability integration）requestIntelligence()是同步函式（跟Capability Orchestrator本身的同步簽名一致，回傳值不是Promise——不像Insight/Behavior Feature是async）', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => ({ ok: true, result: {} }) } });
    const returned = feature.requestIntelligence({ context: {} });
    assert.strictEqual(returned instanceof Promise, false);
  });

  await test('（1.feature capability integration）requestIntelligence()不接受db參數（整條鏈路完全不接觸database，跟behavior_feature.js的requestBehavior(db, request)簽名不同）', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
    assert.ok(!/function requestIntelligence\(\s*db\s*,/.test(src));
  });

  await test('（1.feature capability integration）requestIntelligence()缺少context時回傳{ok:false, feature:"intelligence", reason:"invalid_context"}，完全不呼叫capabilityOrchestrator', () => {
    let called = false;
    const feature = createIntelligenceFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => { called = true; } } });
    const result = feature.requestIntelligence({});
    assert.deepStrictEqual(result, { ok: false, feature: 'intelligence', reason: 'invalid_context' });
    assert.strictEqual(called, false);
  });

  await test('（1.feature capability integration）requestIntelligence()的context為null時回傳invalid_context', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    const result = feature.requestIntelligence({ context: null });
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（1.feature capability integration）requestIntelligence()的context為陣列時回傳invalid_context', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    const result = feature.requestIntelligence({ context: [] });
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（1.feature capability integration）requestIntelligence()的context為字串時回傳invalid_context', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    const result = feature.requestIntelligence({ context: 'not an object' });
    assert.strictEqual(result.reason, 'invalid_context');
  });

  await test('（1.feature capability integration）requestIntelligence()的context為Symbol/數字/布林等非預期型別時安全回傳invalid_context，不拋出例外', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    for (const bad of [42, true, 'x', Symbol('x')]) {
      assert.doesNotThrow(() => feature.requestIntelligence({ context: bad }));
      const result = feature.requestIntelligence({ context: bad });
      assert.strictEqual(result.reason, 'invalid_context');
    }
  });

  await test('（1.feature capability integration）requestIntelligence()的options為陣列時回傳invalid_options_type', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    const result = feature.requestIntelligence({ context: {}, options: [] });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.feature capability integration）requestIntelligence()的options為null時回傳invalid_options_type', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    const result = feature.requestIntelligence({ context: {}, options: null });
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.feature capability integration）requestIntelligence()的options為字串/數字時回傳invalid_options_type', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    assert.strictEqual(feature.requestIntelligence({ context: {}, options: 'x' }).reason, 'invalid_options_type');
    assert.strictEqual(feature.requestIntelligence({ context: {}, options: 42 }).reason, 'invalid_options_type');
  });

  await test('（1.feature capability integration）requestIntelligence()的options未提供時（undefined）通過驗證，正常呼叫capabilityOrchestrator（options為選填）', () => {
    let receivedOptions = 'not-called';
    const feature = createIntelligenceFeature({
      capabilityOrchestrator: { requestCapabilityFlow: (req) => { receivedOptions = req.options; return { ok: true, result: {} }; } },
    });
    feature.requestIntelligence({ context: {} });
    assert.strictEqual(receivedOptions, undefined);
  });

  await test('（1.feature capability integration）requestIntelligence(null)不拋出例外，回傳invalid_request', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    assert.doesNotThrow(() => feature.requestIntelligence(null));
    const result = feature.requestIntelligence(null);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.feature capability integration）requestIntelligence("not an object")回傳invalid_request', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    const result = feature.requestIntelligence('not an object');
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.feature capability integration）requestIntelligence([])回傳invalid_request（陣列不是合法request）', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    const result = feature.requestIntelligence([]);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.feature capability integration）requestIntelligence(undefined)回傳invalid_request', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    const result = feature.requestIntelligence(undefined);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.feature capability integration）capabilityOrchestrator缺失時回傳capability_orchestrator_unavailable', () => {
    const feature = createIntelligenceFeature({});
    const result = feature.requestIntelligence({ context: {} });
    assert.strictEqual(result.reason, 'capability_orchestrator_unavailable');
  });

  await test('（1.feature capability integration）capabilityOrchestrator.requestCapabilityFlow不是函式時回傳capability_orchestrator_unavailable', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: { requestCapabilityFlow: 'nope' } });
    const result = feature.requestIntelligence({ context: {} });
    assert.strictEqual(result.reason, 'capability_orchestrator_unavailable');
  });

  await test('（1.feature capability integration）不同的Intelligence Feature實例各自獨立（不是共用singleton）', () => {
    const featureA = createIntelligenceFeature({ capabilityOrchestrator: {} });
    const featureB = createIntelligenceFeature({ capabilityOrchestrator: {} });
    assert.notStrictEqual(featureA, featureB);
  });

  await test('（1.feature capability integration）createIntelligenceFeature()可以自訂resultMapper（依賴注入）', () => {
    let customCalled = false;
    const customMapper = { mapSuccessResult: () => ({}), mapFailureResult: (reason) => { customCalled = true; return { ok: false, feature: 'intelligence', reason: `custom:${reason}` }; } };
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {}, resultMapper: customMapper });
    const result = feature.requestIntelligence({});
    assert.strictEqual(customCalled, true);
    assert.strictEqual(result.reason, 'custom:invalid_context');
  });

  await test('（1.feature capability integration）createIntelligenceFeature()沒有提供resultMapper時，內部自動建立一個預設的（跟直接呼叫createIntelligenceFeatureResultMapper()行為一致）', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
    const result = feature.requestIntelligence({});
    const mapper = createIntelligenceFeatureResultMapper();
    assert.deepStrictEqual(result, mapper.mapFailureResult('invalid_context'));
  });

  await test('（1.feature capability integration）dependencies為undefined時不拋出例外，回傳capability_orchestrator_unavailable', () => {
    const feature = createIntelligenceFeature();
    assert.doesNotThrow(() => feature.requestIntelligence({ context: {} }));
    const result = feature.requestIntelligence({ context: {} });
    assert.strictEqual(result.reason, 'capability_orchestrator_unavailable');
  });

  await test('（1.feature capability integration）dependencies為{}時不拋出例外，回傳capability_orchestrator_unavailable', () => {
    const feature = createIntelligenceFeature({});
    const result = feature.requestIntelligence({ context: {} });
    assert.strictEqual(result.reason, 'capability_orchestrator_unavailable');
  });

  await test('（1.feature capability integration）requestIntelligence()的request物件不會被修改（沒有side effect）', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: makeRealOrchestrator() });
    const request = { context: makeInsightContext(), options: { b: 2 } };
    const requestCopy = JSON.parse(JSON.stringify(request));
    feature.requestIntelligence(request);
    assert.deepStrictEqual(request, requestCopy);
  });

  await test('（1.feature capability integration）requestIntelligence()呼叫capabilityOrchestrator.requestCapabilityFlow()恰好一次（不會重試或重複呼叫）', () => {
    let callCount = 0;
    const feature = createIntelligenceFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => { callCount++; return { ok: true, result: {} }; } } });
    feature.requestIntelligence({ context: {} });
    assert.strictEqual(callCount, 1);
  });

  await test('（1.feature capability integration）requestIntelligence()的options為合法空物件{}時通過驗證，正常呼叫capabilityOrchestrator', () => {
    let called = false;
    const feature = createIntelligenceFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => { called = true; return { ok: true, result: {} }; } } });
    feature.requestIntelligence({ context: {}, options: {} });
    assert.strictEqual(called, true);
  });

  for (const badRequest of [true, 3.14, () => {}]) {
    await test(`（1.feature capability integration）requestIntelligence(${String(badRequest)})這種非物件輸入安全回傳invalid_request，不拋出例外`, () => {
      const feature = createIntelligenceFeature({ capabilityOrchestrator: {} });
      assert.doesNotThrow(() => feature.requestIntelligence(badRequest));
      assert.strictEqual(feature.requestIntelligence(badRequest).reason, 'invalid_request');
    });
  }

  for (const badContext of [() => {}, new Date()]) {
    await test(`（1.feature capability integration）requestIntelligence()的context為${badContext instanceof Date ? 'Date實例' : '函式'}時，形狀檢查只認object typeof，${badContext instanceof Date ? '視為合法物件通過驗證' : '安全回傳invalid_context'}`, () => {
      const feature = createIntelligenceFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => ({ ok: true, result: {} }) } });
      const result = feature.requestIntelligence({ context: badContext });
      if (badContext instanceof Date) {
        assert.strictEqual(result.ok, true);
      } else {
        assert.strictEqual(result.reason, 'invalid_context');
      }
    });
  }

  console.log('');

  // =========================================================================
  // B. capability orchestration usage
  // =========================================================================
  console.log('--- B. capability orchestration usage ---');

  await test('（2.capability orchestration usage）端對端：真實的Capability Orchestrator確實有被Intelligence Feature觸發（透過spy驗證）', () => {
    let called = false;
    const real = makeRealOrchestrator();
    const spy = { requestCapabilityFlow: (...args) => { called = true; return real.requestCapabilityFlow(...args); } };
    const feature = createIntelligenceFeature({ capabilityOrchestrator: spy });
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(called, true);
    assert.strictEqual(result.ok, true);
  });

  await test('（2.capability orchestration usage）端對端：context跟options都正確原樣轉交給capabilityOrchestrator.requestCapabilityFlow()', () => {
    let received = null;
    const spy = { requestCapabilityFlow: (req) => { received = req; return { ok: true, result: {} }; } };
    const feature = createIntelligenceFeature({ capabilityOrchestrator: spy });
    const context = makeInsightContext();
    const options = { generatedAt: 'x' };
    feature.requestIntelligence({ context, options });
    assert.strictEqual(received.context, context);
    assert.strictEqual(received.options, options);
  });

  await test('（2.capability orchestration usage）端對端：真實Capability Orchestrator失敗時（例如context缺少必要欄位），Feature正確轉發reason/field/stage', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: makeRealOrchestrator() });
    const result = feature.requestIntelligence({ context: { user: null } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.feature, 'intelligence');
    assert.strictEqual(typeof result.reason, 'string');
    assert.strictEqual(result.stage, 'analysis');
  });

  // TASK1.86後更新：原本這裡有一個「Capability
  // Orchestrator本身完全沒有被修改」的斷言，比對即時的git diff
  // --stat。TASK1.86依照TASK1.85規劃結論，合法地為
  // capability_orchestrator.js/capability_result_builder.js新增了
  // 選填的decisionCapability整合（Backward Compatible，不提供
  // decisionCapability時行為完全不變）——這不是TASK1.79造成的
  // 回歸，而是斷言本身寫得過度嚴格，這裡移除這個斷言，改為驗證
  // 不提供decisionCapability時的既有行為依然成立。
  await test('（TASK1.86後更新）（2.capability orchestration usage）不提供decisionCapability時，Capability Orchestrator依然只回傳{analysis, recommendation}兩個欄位（TASK1.79建立當下的行為經TASK1.86擴充後依然成立）', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    const orchestrator = intelModule.capabilities.orchestration.createCapabilityOrchestrator({
      analysisCapability: intelModule.capabilities.analysis.createAnalysisCapability({ analysisRunner: intelModule.analysis.createAnalysisRunner() }),
      recommendationCapability: intelModule.capabilities.recommendation.createRecommendationCapability({ recommendationRunner: intelModule.recommendation.createRecommendationRunner() }),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.capability orchestration usage）Analysis Capability/Recommendation Capability本身完全沒有被修改（git diff確認，三個Capability互不影響）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.capability orchestration usage）端對端：透過src/intelligence/index.js的頂層namespace手動組裝出完整鏈路（application.features.intelligence + capabilities.orchestration + capabilities.analysis + capabilities.recommendation），可以正確運作端對端流程', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    const feature = intelModule.application.features.intelligence.createIntelligenceFeature({
      capabilityOrchestrator: intelModule.capabilities.orchestration.createCapabilityOrchestrator({
        analysisCapability: intelModule.capabilities.analysis.createAnalysisCapability({ analysisRunner: intelModule.analysis.createAnalysisRunner() }),
        recommendationCapability: intelModule.capabilities.recommendation.createRecommendationCapability({ recommendationRunner: intelModule.recommendation.createRecommendationRunner() }),
      }),
    });
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'intelligence');
  });

  await test('（2.capability orchestration usage）application/features/index.js有export * as intelligence from ./intelligence/index.js', () => {
    const src = readSrc(path.join(featuresDir, 'index.js'));
    assert.ok(/export \* as intelligence from ['"]\.\/intelligence\/index\.js['"]/.test(src));
  });

  await test('（2.capability orchestration usage）import後，featuresModule.intelligence跟featuresModule.insight/featuresModule.behavior互不污染（各自只有自己該有的函式）', async () => {
    const featuresModule = await import(path.join(featuresDir, 'index.js'));
    assert.strictEqual(typeof featuresModule.intelligence.createIntelligenceFeature, 'function');
    assert.strictEqual(typeof featuresModule.insight.createIntelligenceFeature, 'undefined');
    assert.strictEqual(typeof featuresModule.behavior.createIntelligenceFeature, 'undefined');
    assert.strictEqual(typeof featuresModule.intelligence.createBehaviorFeature, 'undefined');
  });

  await test('（2.capability orchestration usage）端對端：不同的Capability Orchestrator實例（各自注入獨立的Analysis/Recommendation Capability）互不干擾，各自得到正確的結果', () => {
    const orchestratorA = makeRealOrchestrator();
    const orchestratorB = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner({ modules: [() => ({ type: 'only-b', value: 1, source: 'b' })] }) }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
    const featureA = createIntelligenceFeature({ capabilityOrchestrator: orchestratorA });
    const featureB = createIntelligenceFeature({ capabilityOrchestrator: orchestratorB });
    const context = makeInsightContext();
    const resultA = featureA.requestIntelligence({ context });
    const resultB = featureB.requestIntelligence({ context });
    assert.strictEqual(resultA.data.analysis.insights.length, DEFAULT_ANALYSIS_MODULES.length);
    assert.deepStrictEqual(resultB.data.analysis.insights, [{ type: 'only-b', value: 1, source: 'b' }]);
  });

  console.log('');

  // =========================================================================
  // C. analysis flow
  // =========================================================================
  console.log('--- C. analysis flow ---');

  await test('（3.analysis flow）端對端：真實Analysis Capability成功時，Feature Output的data.analysis.insights陣列恰好6筆（DEFAULT_ANALYSIS_MODULES數量）', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: makeRealOrchestrator() });
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.analysis.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（3.analysis flow）Analysis Runner本身（analysis_runner.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.analysis flow）端對端：注入自訂modules的Analysis Runner（透過真實Analysis Capability/Capability Orchestrator），Feature依然正確運作（證明Feature層不關心底層Runner用哪組模組）', () => {
    const customOrchestrator = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner({ modules: [() => ({ type: 'custom', value: 1, source: 'x' })] }) }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
    const feature = createIntelligenceFeature({ capabilityOrchestrator: customOrchestrator });
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data.analysis.insights, [{ type: 'custom', value: 1, source: 'x' }]);
  });

  await test('（3.analysis flow）端對端：不同的InsightContext輸入都能正確走完Feature→Capability Orchestrator→Analysis Capability這一段', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: makeRealOrchestrator() });
    for (const overrides of [{}, { activityContext: { count: 10, items: [] } }, { metadata: { totalRecords: 99 } }]) {
      const result = feature.requestIntelligence({ context: makeInsightContext(overrides) });
      assert.strictEqual(result.ok, true);
    }
  });

  await test('（3.analysis flow）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: makeRealOrchestrator() });
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(feature.requestIntelligence(request), feature.requestIntelligence(request));
  });

  console.log('');

  // =========================================================================
  // D. recommendation flow
  // =========================================================================
  console.log('--- D. recommendation flow ---');

  await test('（4.recommendation flow）端對端：真實Recommendation Capability成功時，Feature Output的data.recommendation.recommendations陣列恰好3筆（DEFAULT_RECOMMENDATION_MODULES數量）', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: makeRealOrchestrator() });
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.recommendation.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（4.recommendation flow）Recommendation Runner本身（recommendation_runner.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.recommendation flow）端對端：recommendation的insight_count恰好反映analysis產生的insights陣列長度（Analysis→Recommendation兩段真的有串接到Feature Output）', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: makeRealOrchestrator() });
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    const insightCount = result.data.recommendation.recommendations.find((r) => r.type === 'insight_count');
    assert.strictEqual(insightCount.value, result.data.analysis.insights.length);
  });

  await test('（4.recommendation flow）端對端：真實Recommendation Capability失敗時（透過mock讓analysis回傳不合法的analysisResult形狀），Feature正確轉發reason/field並標記stage為recommendation', () => {
    const spyOrchestrator = createCapabilityOrchestrator({
      analysisCapability: { requestAnalysis: () => ({ ok: true, result: { status: 'x' } }) },
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
    const feature = createIntelligenceFeature({ capabilityOrchestrator: spyOrchestrator });
    const result = feature.requestIntelligence({ context: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stage, 'recommendation');
    assert.strictEqual(result.field, 'insights');
  });

  await test('（4.recommendation flow）端對端：注入自訂modules的Recommendation Runner（透過真實Recommendation Capability），Feature依然正確運作', () => {
    const customOrchestrator = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner({ modules: [() => ({ type: 'only-custom', value: 1, source: 'b' })] }) }),
    });
    const feature = createIntelligenceFeature({ capabilityOrchestrator: customOrchestrator });
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data.recommendation.recommendations, [{ type: 'only-custom', value: 1, source: 'b' }]);
  });

  console.log('');

  // =========================================================================
  // E. output mapping
  // =========================================================================
  console.log('--- E. output mapping ---');

  await test('（5.output mapping）mapSuccessResult()保留Analysis Result跟Recommendation Result原本的形狀，組成{analysis, recommendation}nested結構，不重新拆開組裝', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    const analysis = { status: 'analysis_ready', insights: [{ type: 'x', value: 1, source: 'y' }], metadata: { version: '1.0.0' } };
    const recommendation = { status: 'recommendation_ready', recommendations: [], metadata: { version: '1.0.0' } };
    const result = mapper.mapSuccessResult({ analysis, recommendation });
    assert.deepStrictEqual(result, { ok: true, feature: 'intelligence', data: { analysis, recommendation } });
  });

  await test('（5.output mapping）mapSuccessResult()的data.analysis/data.recommendation參照跟傳入的capabilityResult裡的對應欄位完全相同（不做深拷貝）', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    const analysis = { status: 'x', insights: [], metadata: {} };
    const recommendation = { status: 'y', recommendations: [], metadata: {} };
    const result = mapper.mapSuccessResult({ analysis, recommendation });
    assert.strictEqual(result.data.analysis, analysis);
    assert.strictEqual(result.data.recommendation, recommendation);
  });

  await test('（5.output mapping）mapSuccessResult(undefined)安全正規化為{analysis:{}, recommendation:{}}，不拋出例外', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    assert.doesNotThrow(() => mapper.mapSuccessResult(undefined));
    assert.deepStrictEqual(mapper.mapSuccessResult(undefined), { ok: true, feature: 'intelligence', data: { analysis: {}, recommendation: {} } });
  });

  await test('（5.output mapping）mapSuccessResult(null)安全正規化為{analysis:{}, recommendation:{}}', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    assert.deepStrictEqual(mapper.mapSuccessResult(null), { ok: true, feature: 'intelligence', data: { analysis: {}, recommendation: {} } });
  });

  await test('（5.output mapping）mapSuccessResult({})缺少analysis/recommendation欄位時安全正規化為{analysis:{}, recommendation:{}}', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    assert.deepStrictEqual(mapper.mapSuccessResult({}), { ok: true, feature: 'intelligence', data: { analysis: {}, recommendation: {} } });
  });

  await test('（5.output mapping）mapFailureResult(reason)不提供field/stage時，回傳物件不含field/stage欄位', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    const result = mapper.mapFailureResult('invalid_context');
    assert.deepStrictEqual(Object.keys(result).sort(), ['feature', 'ok', 'reason']);
  });

  await test('（5.output mapping）mapFailureResult(reason, field)提供field不提供stage時，回傳物件包含field但不含stage', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    const result = mapper.mapFailureResult('invalid_field_type', 'status');
    assert.deepStrictEqual(result, { ok: false, feature: 'intelligence', reason: 'invalid_field_type', field: 'status' });
  });

  await test('（5.output mapping）mapFailureResult(reason, field, stage)三者都提供時，回傳物件包含全部四個欄位', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    const result = mapper.mapFailureResult('invalid_field_type', 'insights', 'recommendation');
    assert.deepStrictEqual(result, { ok: false, feature: 'intelligence', reason: 'invalid_field_type', field: 'insights', stage: 'recommendation' });
  });

  await test('（5.output mapping）mapFailureResult(非字串reason)安全正規化為unknown_error', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    assert.deepStrictEqual(mapper.mapFailureResult(123), { ok: false, feature: 'intelligence', reason: 'unknown_error' });
    assert.deepStrictEqual(mapper.mapFailureResult(undefined), { ok: false, feature: 'intelligence', reason: 'unknown_error' });
  });

  await test('（5.output mapping）mapFailureResult(reason, 非字串field)忽略非法field，不加入field欄位', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    const result = mapper.mapFailureResult('x', 123);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'field'), false);
  });

  await test('（5.output mapping）mapFailureResult(reason, field, 非字串stage)忽略非法stage，不加入stage欄位', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    const result = mapper.mapFailureResult('x', 'y', 123);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'stage'), false);
  });

  await test('（5.output mapping）mapFailureResult(reason, 空字串field, 空字串stage)忽略空字串，不加入field/stage欄位', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    const result = mapper.mapFailureResult('x', '', '');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'field'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'stage'), false);
  });

  await test('（5.output mapping）是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    const analysis = { status: 'x', insights: [], metadata: {} };
    const recommendation = { status: 'y', recommendations: [], metadata: {} };
    assert.deepStrictEqual(mapper.mapSuccessResult({ analysis, recommendation }), mapper.mapSuccessResult({ analysis, recommendation }));
  });

  await test('（5.output mapping）intelligence_feature_result_mapper.js完全沒有呼叫Date.now()/Math.random()', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature_result_mapper.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（5.output mapping）不同的Intelligence Feature Result Mapper實例各自獨立（不是共用singleton）', () => {
    const mapperA = createIntelligenceFeatureResultMapper();
    const mapperB = createIntelligenceFeatureResultMapper();
    assert.notStrictEqual(mapperA, mapperB);
  });

  await test('（5.output mapping）result_mapper跟Analysis/Recommendation/Orchestration版本（TASK1.76/1.77/1.78）是完全獨立的四個模組（不共用同一份程式碼、不互相import）', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature_result_mapper.js'));
    assert.ok(!/analysis_capability_result_builder/.test(src));
    assert.ok(!/recommendation_capability_result_builder/.test(src));
    assert.ok(!/capability_result_builder/.test(src));
  });

  await test('（5.output mapping）成功結果一律恰好只有ok/feature/data三個欄位', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: makeRealOrchestrator() });
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'feature', 'ok']);
  });

  await test('（5.output mapping）成功/失敗結果的feature欄位固定為"intelligence"字面值', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: makeRealOrchestrator() });
    const success = feature.requestIntelligence({ context: makeInsightContext() });
    const failure = feature.requestIntelligence({});
    assert.strictEqual(success.feature, 'intelligence');
    assert.strictEqual(failure.feature, 'intelligence');
  });

  await test('（5.output mapping）mapSuccessResult()對analysis/recommendation欄位為非物件型別（字串/數字/null/undefined）時都安全正規化為{}（陣列typeof也是object，比照TASK1.76/1.77/1.78既有result builder同樣不特別排除陣列）', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    for (const bad of ['x', 42, null, undefined]) {
      const result = mapper.mapSuccessResult({ analysis: bad, recommendation: bad });
      assert.deepStrictEqual(result.data.analysis, {});
      assert.deepStrictEqual(result.data.recommendation, {});
    }
  });

  await test('（5.output mapping）mapSuccessResult()只保留analysis/recommendation兩個欄位，不會把capabilityResult裡多餘的欄位帶入data', () => {
    const mapper = createIntelligenceFeatureResultMapper();
    const result = mapper.mapSuccessResult({ analysis: { a: 1 }, recommendation: { b: 2 }, extra: 'should not appear' });
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  await test('（5.output mapping）createIntelligenceFeatureResultMapper(任何參數)都回傳相同介面（不接受依賴注入）', () => {
    const mapperA = createIntelligenceFeatureResultMapper();
    const mapperB = createIntelligenceFeatureResultMapper({ ignored: 'value' });
    assert.deepStrictEqual(Object.keys(mapperA), Object.keys(mapperB));
  });

  console.log('');

  // =========================================================================
  // F. runtime isolation
  // =========================================================================
  console.log('--- F. runtime isolation ---');

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring'];
  for (const file of INTELLIGENCE_FEATURE_JS_FILES) {
    await test(`（6.runtime isolation）features/intelligence/${file} 完全不import src/intelligence/execution/（Execution Manager）`, () => {
      const src = readSrc(path.join(intelligenceFeatureDir, file));
      const executionManagerDir = path.join(intelDir, 'execution');
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        const resolved = path.normalize(path.join(intelligenceFeatureDir, imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir);
      }
    });
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（6.runtime isolation）features/intelligence/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(readSrc(path.join(intelligenceFeatureDir, file))));
      });
    }
    for (const varName of ['executionManager', 'historyStore', 'metricsStore', 'eventDispatcher', 'governanceService']) {
      await test(`（6.runtime isolation）features/intelligence/${file} 完全不出現${varName}變數名稱`, () => {
        assert.ok(!new RegExp(varName).test(readSrc(path.join(intelligenceFeatureDir, file))));
      });
    }
    await test(`（6.runtime isolation）features/intelligence/${file} 完全不import application/workflows/、application/use_cases/、application/application_service.js`, () => {
      const src = readSrc(path.join(intelligenceFeatureDir, file));
      assert.ok(!/from\s+['"].*\/workflows\//.test(src));
      assert.ok(!/from\s+['"].*\/use_cases\//.test(src));
      assert.ok(!/application_service\.js/.test(src));
    });
    await test(`（6.runtime isolation）features/intelligence/${file} 完全不import src/intelligence/facade/`, () => {
      assert.ok(!/from\s+['"].*\/facade\//.test(readSrc(path.join(intelligenceFeatureDir, file))));
    });
    await test(`（6.runtime isolation）features/intelligence/${file} 完全不import ../insight/、../behavior/、../insight_feature.js（三個Feature domain完全平行、互不認識）`, () => {
      const src = readSrc(path.join(intelligenceFeatureDir, file));
      assert.ok(!/from\s+['"].*\/insight\//.test(src));
      assert.ok(!/from\s+['"].*\/behavior\//.test(src));
      assert.ok(!/insight_feature\.js/.test(src));
    });
    await test(`（6.runtime isolation）features/intelligence/${file} 完全不import capabilities/analysis/或capabilities/recommendation/（不繞過Capability Orchestrator直接呼叫底下的Capability）`, () => {
      const src = readSrc(path.join(intelligenceFeatureDir, file));
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(!imp.includes('capabilities/analysis'));
        assert.ok(!imp.includes('capabilities/recommendation'));
      }
    });
  }

  await test('（6.runtime isolation）Runtime Execution Layer（execution/、service/、orchestration/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/execution/ src/intelligence/service/ src/intelligence/orchestration/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Workflow Layer（application/workflows/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/workflows/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Use Case Layer（application/use_cases/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/use_cases/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Application Service（application/application_service.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/application/application_service.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Insight Feature（features/insight_feature.js、features/insight/整條樹）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/features/insight_feature.js src/intelligence/application/features/insight/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Behavior Feature（features/behavior/整條樹）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/features/behavior/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）src/bootstrap/application.js本次任務完全沒有被修改（Intelligence Feature沒有接進既有intelligence物件）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）app.intelligence物件恰好維持24個欄位不變（本次任務沒有新增任何bootstrap欄位，Intelligence Feature是獨立extension point）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（6.runtime isolation）端對端：Insight跟Behavior兩個既有Feature在本次任務後依然成功運作（未受Intelligence Feature新增影響）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  await test('（6.runtime isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/，TASK1.45）本次任務完全沒有被修改（規格明確禁止修改Phase 2 Orchestrator）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // G. dependency scan
  // =========================================================================
  console.log('--- G. dependency scan ---');

  for (const file of INTELLIGENCE_FEATURE_JS_FILES) {
    await test(`（7.dependency scan）features/intelligence/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(intelligenceFeatureDir, file))));
    });
    for (const pattern of [/db\.prepare\(/, /\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i, /DIET_COACH_DB/]) {
      await test(`（7.dependency scan）features/intelligence/${file} 不含資料庫關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(readSrc(path.join(intelligenceFeatureDir, file))));
      });
    }
    await test(`（7.dependency scan）features/intelligence/${file} 完全不出現db變數名稱（Intelligence Feature完全不知道db是什麼，甚至不接受db作為參數）`, () => {
      assert.ok(!/\bdb\b/.test(readSrc(path.join(intelligenceFeatureDir, file))));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（7.dependency scan）features/intelligence/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(readSrc(path.join(intelligenceFeatureDir, file))));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i, /\buserId\b/]) {
      await test(`（7.dependency scan）features/intelligence/${file} 不含身分相關字樣 ${pattern}（不接受身分相關參數）`, () => {
        assert.ok(!pattern.test(readSrc(path.join(intelligenceFeatureDir, file))));
      });
    }
    for (const fn of ['requireAuth(', 'requireActiveUser(', 'getCurrentUser(']) {
      await test(`（7.dependency scan）features/intelligence/${file} 完全不呼叫${fn.replace('(', '()')}`, () => {
        assert.ok(!readSrc(path.join(intelligenceFeatureDir, file)).includes(fn));
      });
    }
    await test(`（7.dependency scan）features/intelligence/${file} 裡所有相對路徑import都指向同目錄底下的檔案（不跨目錄import其他Feature/Capability的實作細節）`, () => {
      const imports = [...readSrc(path.join(intelligenceFeatureDir, file)).matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('./'), `${file}出現非同目錄的相對路徑import：${imp}`);
      }
    });
    await test(`（7.dependency scan）features/intelligence/${file} 完全不import src/services/（既有Domain Service）`, () => {
      assert.ok(!/from\s+['"].*\/services\//.test(readSrc(path.join(intelligenceFeatureDir, file))));
    });
    await test(`（7.dependency scan）features/intelligence/${file} 完全不呼叫setTimeout()/setInterval()（沒有非同步排程邏輯）`, () => {
      const src = readSrc(path.join(intelligenceFeatureDir, file));
      assert.ok(!/setTimeout\(/.test(src));
      assert.ok(!/setInterval\(/.test(src));
    });
  }

  await test('（7.dependency scan）features/intelligence/整個目錄樹沒有任何檔案import src/intelligence/runtime/', () => {
    for (const file of INTELLIGENCE_FEATURE_JS_FILES) {
      assert.ok(!/from\s+['"].*\/runtime\//.test(readSrc(path.join(intelligenceFeatureDir, file))));
    }
  });

  await test('（7.dependency scan）features/intelligence/整個目錄樹沒有任何檔案import src/intelligence/contracts.js或src/intelligence/contracts/', () => {
    for (const file of INTELLIGENCE_FEATURE_JS_FILES) {
      const src = readSrc(path.join(intelligenceFeatureDir, file));
      assert.ok(!/from\s+['"].*\/contracts/.test(src));
    }
  });

  console.log('');

  // =========================================================================
  // H. no AI dependency
  // =========================================================================
  console.log('--- H. no AI dependency ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of INTELLIGENCE_FEATURE_JS_FILES) {
    const codeOnly = readSrc(path.join(intelligenceFeatureDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.no AI dependency）features/intelligence/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（8.no AI dependency）features/intelligence/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
  }

  await test('（8.no AI dependency）wrangler.toml完全沒有新增任何AI相關的環境變數/binding（本次任務沒有啟用AI Provider）', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（8.no AI dependency）intelligence_feature.js完全不出現score/confidence相關的計算邏輯（不解讀分析結果的業務內容，也不計算任何新的分數）', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
    assert.ok(!/\.score\s*=/.test(src));
    assert.ok(!/\.confidence\s*=/.test(src));
  });

  await test('（8.no AI dependency）intelligence_feature.js完全不出現任何自然語言/教練語氣字樣（建議你/應該/推薦您）', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
    assert.ok(!/建議你/.test(src));
    assert.ok(!/應該/.test(src));
    assert.ok(!/推薦您/.test(src));
  });

  await test('（8.no AI dependency）intelligence_feature.js/intelligence_feature_result_mapper.js完全不呼叫Date.now()/Math.random()（deterministic）', () => {
    for (const file of ['intelligence_feature.js', 'intelligence_feature_result_mapper.js']) {
      const src = readSrc(path.join(intelligenceFeatureDir, file));
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    }
  });

  await test('（8.no AI dependency）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（8.no AI dependency）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  console.log('');

  // =========================================================================
  // I. regression check
  // =========================================================================
  console.log('--- I. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（9.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.79-feature-capability-integration')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 69, `預期至少69個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（9.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // J. P1-P6
  // =========================================================================
  console.log('--- J. P1-P6 ---');

  await test('（10.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（10.P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（10.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

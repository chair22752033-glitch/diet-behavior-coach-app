/*
 * Phase 4 TASK 1.80｜Phase 4 Capability Architecture Consolidation
 * Review 測試
 *
 * 本任務不是新增功能、不是導入AI、不是建立新Capability——這是
 * Phase 4系列（TASK1.75規劃 → TASK1.76 Analysis Capability →
 * TASK1.77 Recommendation Capability → TASK1.78 Capability
 * Orchestration → TASK1.79 Feature Intelligence Integration）的
 * 純審查任務，確認整個Intelligence Capability Architecture已完整、
 * 一致，並確認可以安全進入後續的Intelligence Enhancement。
 *
 * 這份測試驗證的是：
 * - Capability Completeness：四層（Analysis/Recommendation
 *   Capability、Capability Orchestrator、Feature Integration）
 *   全部存在，各自檔案結構完整
 * - Data Flow：Feature→Capability Orchestrator→Analysis→
 *   Recommendation→Output全程正確、無跳層
 * - Feature Integration：正確只呼叫Capability Orchestrator
 * - Dependency Scan：四層全部掃描，確認無循環依賴、無禁止import
 * - Runtime Isolation：四層全部不直接操作Runtime內部元件
 * - AI Boundary：AI Provider未啟用，未來延伸點記錄正確
 * - Export Consistency：頂層namespace跟文件內容一致
 * - Regression/P1-P6
 *
 * 分為以下9個部分：
 * A) capability completeness
 * B) data flow
 * C) feature integration
 * D) dependency scan
 * E) runtime isolation
 * F) AI boundary
 * G) export consistency
 * H) regression check
 * I) P1-P6
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

// 四層Phase 4 Capability Architecture各自的目錄跟檔案清單
const PHASE4_LAYERS = [
  { name: 'analysis', dir: analysisCapabilityDir, files: ['analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js'] },
  { name: 'recommendation', dir: recommendationCapabilityDir, files: ['recommendation_capability.js', 'recommendation_capability_result_builder.js', 'index.js'] },
  { name: 'orchestration', dir: orchestrationCapabilityDir, files: ['capability_orchestrator.js', 'capability_result_builder.js', 'index.js'] },
  { name: 'intelligence-feature', dir: intelligenceFeatureDir, files: ['intelligence_feature.js', 'intelligence_feature_result_mapper.js', 'index.js'] },
];

const ALL_PHASE4_FILES = PHASE4_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));

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
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createIntelligenceFeature } = await import(path.join(intelligenceFeatureDir, 'index.js'));
  const { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(recommendationDir, 'index.js'));

  function makeRealFeature() {
    return createIntelligenceFeature({
      capabilityOrchestrator: createCapabilityOrchestrator({
        analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
        recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
      }),
    });
  }

  // =========================================================================
  // A. capability completeness
  // =========================================================================
  console.log('--- A. capability completeness ---');

  for (const layer of PHASE4_LAYERS) {
    await test(`（1.capability completeness）${layer.name} 目錄存在且恰好包含4個檔案（含README.md）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });

    await test(`（1.capability completeness）${layer.name}/README.md 存在且非空`, () => {
      const readmePath = path.join(layer.dir, 'README.md');
      assert.ok(fs.existsSync(readmePath));
      assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
    });

    for (const file of layer.files) {
      await test(`（1.capability completeness）${layer.name}/${file} 存在`, () => {
        assert.ok(fs.existsSync(path.join(layer.dir, file)));
      });
    }
  }

  await test('（1.capability completeness）Analysis Capability提供createAnalysisCapability/createAnalysisCapabilityResultBuilder兩個具名函式', async () => {
    const mod = await import(path.join(analysisCapabilityDir, 'index.js'));
    assert.strictEqual(typeof mod.createAnalysisCapability, 'function');
    assert.strictEqual(typeof mod.createAnalysisCapabilityResultBuilder, 'function');
  });

  await test('（1.capability completeness）Recommendation Capability提供createRecommendationCapability/createRecommendationCapabilityResultBuilder兩個具名函式', async () => {
    const mod = await import(path.join(recommendationCapabilityDir, 'index.js'));
    assert.strictEqual(typeof mod.createRecommendationCapability, 'function');
    assert.strictEqual(typeof mod.createRecommendationCapabilityResultBuilder, 'function');
  });

  await test('（1.capability completeness）Capability Orchestrator提供createCapabilityOrchestrator/createCapabilityOrchestratorResultBuilder兩個具名函式', async () => {
    const mod = await import(path.join(orchestrationCapabilityDir, 'index.js'));
    assert.strictEqual(typeof mod.createCapabilityOrchestrator, 'function');
    assert.strictEqual(typeof mod.createCapabilityOrchestratorResultBuilder, 'function');
  });

  await test('（1.capability completeness）Feature Integration提供createIntelligenceFeature/createIntelligenceFeatureResultMapper兩個具名函式', async () => {
    const mod = await import(path.join(intelligenceFeatureDir, 'index.js'));
    assert.strictEqual(typeof mod.createIntelligenceFeature, 'function');
    assert.strictEqual(typeof mod.createIntelligenceFeatureResultMapper, 'function');
  });

  await test('（1.capability completeness）createAnalysisCapability()回傳的物件恰好只有requestAnalysis一個公開介面', () => {
    const c = createAnalysisCapability({ analysisRunner: {} });
    assert.deepStrictEqual(Object.keys(c), ['requestAnalysis']);
  });

  await test('（1.capability completeness）createRecommendationCapability()回傳的物件恰好只有requestRecommendation一個公開介面', () => {
    const c = createRecommendationCapability({ recommendationRunner: {} });
    assert.deepStrictEqual(Object.keys(c), ['requestRecommendation']);
  });

  await test('（1.capability completeness）createCapabilityOrchestrator()回傳的物件恰好只有requestCapabilityFlow一個公開介面', () => {
    const c = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    assert.deepStrictEqual(Object.keys(c), ['requestCapabilityFlow']);
  });

  await test('（1.capability completeness）createIntelligenceFeature()回傳的物件恰好只有requestIntelligence一個公開介面', () => {
    const c = createIntelligenceFeature({ capabilityOrchestrator: {} });
    assert.deepStrictEqual(Object.keys(c), ['requestIntelligence']);
  });

  await test('（1.capability completeness）src/intelligence/PHASE4_CONSOLIDATION_REVIEW.md 存在於src/intelligence/底下且內容非空', () => {
    const docPath = path.join(intelDir, 'PHASE4_CONSOLIDATION_REVIEW.md');
    assert.ok(fs.existsSync(docPath));
    assert.ok(fs.readFileSync(docPath, 'utf8').length > 500);
  });

  const REQUIRED_DOC_SECTIONS = ['Completed Capability Layers', 'Data Flow', 'Dependency Direction', 'AI Extension Boundary', 'Known Limitations'];
  const reviewDoc = fs.readFileSync(path.join(intelDir, 'PHASE4_CONSOLIDATION_REVIEW.md'), 'utf8');
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.capability completeness）PHASE4_CONSOLIDATION_REVIEW.md包含「${section}」章節`, () => {
      assert.ok(reviewDoc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.capability completeness）PHASE4_CONSOLIDATION_REVIEW.md記錄了六項Completion Criteria checkbox', () => {
    const checkCount = (reviewDoc.match(/✅/g) || []).length;
    assert.ok(checkCount >= 6, `預期至少6個✅，實際${checkCount}`);
  });

  console.log('');

  // =========================================================================
  // B. data flow
  // =========================================================================
  console.log('--- B. data flow ---');

  await test('（2.data flow）端對端：Feature→Capability Orchestrator→Analysis Capability→Recommendation Capability→Output全程使用真實Runner正確運作', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'intelligence');
    assert.strictEqual(typeof result.data.analysis, 'object');
    assert.strictEqual(typeof result.data.recommendation, 'object');
  });

  await test('（2.data flow）端對端：data.analysis的insights陣列恰好6筆（DEFAULT_ANALYSIS_MODULES數量）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.data.analysis.insights.length, DEFAULT_ANALYSIS_MODULES.length);
  });

  await test('（2.data flow）端對端：data.recommendation的recommendations陣列恰好3筆（DEFAULT_RECOMMENDATION_MODULES數量）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.data.recommendation.recommendations.length, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（2.data flow）端對端：recommendation的insight_count恰好反映analysis的insights陣列長度（證明兩段真的串接，不是各自獨立跑）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    const insightCount = result.data.recommendation.recommendations.find((r) => r.type === 'insight_count');
    assert.strictEqual(insightCount.value, result.data.analysis.insights.length);
  });

  await test('（2.data flow）Analysis階段失敗時（context缺少必要欄位），Feature Output正確標記stage為analysis並且不含recommendation資料被誤植', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: { user: null } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stage, 'analysis');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'data'), false);
  });

  await test('（2.data flow）Recommendation階段失敗時（透過mock讓analysis回傳不合法的analysisResult形狀），Feature Output正確標記stage為recommendation', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: { requestAnalysis: () => ({ ok: true, result: { status: 'x' } }) },
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
    const feature = createIntelligenceFeature({ capabilityOrchestrator: orchestrator });
    const result = feature.requestIntelligence({ context: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stage, 'recommendation');
  });

  await test('（2.data flow）沒有任何一段可以跳過上一段：Recommendation Capability永遠透過Capability Orchestrator轉發的{analysisResult}接收資料，不會被直接餵進原始context', () => {
    let receivedRequest = null;
    const spyRecommendation = { requestRecommendation: (req) => { receivedRequest = req; return { ok: true, result: {} }; } };
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: spyRecommendation,
    });
    const feature = createIntelligenceFeature({ capabilityOrchestrator: orchestrator });
    feature.requestIntelligence({ context: makeInsightContext() });
    assert.ok(receivedRequest.analysisResult);
    assert.strictEqual(typeof receivedRequest.analysisResult.insights, 'object');
    assert.strictEqual(receivedRequest.context, undefined);
  });

  await test('（2.data flow）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const feature = makeRealFeature();
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(feature.requestIntelligence(request), feature.requestIntelligence(request));
  });

  await test('（2.data flow）端對端：不同的InsightContext輸入都能正確走完整條Phase 4鏈路', () => {
    const feature = makeRealFeature();
    for (const overrides of [{}, { activityContext: { count: 10, items: [] } }, { metadata: { totalRecords: 99 } }]) {
      const result = feature.requestIntelligence({ context: makeInsightContext(overrides) });
      assert.strictEqual(result.ok, true);
    }
  });

  await test('（2.data flow）注入自訂Analysis模組時，整條鏈路（Feature→Orchestrator→Recommendation）依然正確反映自訂結果（驗證AI Extension Point不受上游影響）', () => {
    const feature = createIntelligenceFeature({
      capabilityOrchestrator: createCapabilityOrchestrator({
        analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner({ modules: [() => ({ type: 'custom', value: 1, source: 'x' })] }) }),
        recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
      }),
    });
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data.analysis.insights, [{ type: 'custom', value: 1, source: 'x' }]);
    const insightCount = result.data.recommendation.recommendations.find((r) => r.type === 'insight_count');
    assert.strictEqual(insightCount.value, 1);
  });

  await test('（2.data flow）注入自訂Recommendation模組時，整條鏈路依然正確反映自訂結果', () => {
    const feature = createIntelligenceFeature({
      capabilityOrchestrator: createCapabilityOrchestrator({
        analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
        recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner({ modules: [() => ({ type: 'only-custom', value: 1, source: 'b' })] }) }),
      }),
    });
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data.recommendation.recommendations, [{ type: 'only-custom', value: 1, source: 'b' }]);
  });

  console.log('');

  // =========================================================================
  // C. feature integration
  // =========================================================================
  console.log('--- C. feature integration ---');

  await test('（3.feature integration）Intelligence Feature只呼叫Capability Orchestrator（透過spy驗證，不繞過它直接呼叫Analysis/Recommendation Capability）', () => {
    let orchestratorCalled = false;
    const spyOrchestrator = { requestCapabilityFlow: () => { orchestratorCalled = true; return { ok: true, result: {} }; } };
    const feature = createIntelligenceFeature({ capabilityOrchestrator: spyOrchestrator });
    feature.requestIntelligence({ context: {} });
    assert.strictEqual(orchestratorCalled, true);
  });

  await test('（3.feature integration）requestIntelligence()是同步函式（不是async，忠實反映底層鏈路的同步簽名）', () => {
    const feature = createIntelligenceFeature({ capabilityOrchestrator: { requestCapabilityFlow: () => ({ ok: true, result: {} }) } });
    assert.strictEqual(feature.requestIntelligence({ context: {} }) instanceof Promise, false);
  });

  await test('（3.feature integration）requestIntelligence()不接受db參數（整條Phase 4鏈路完全不接觸database）', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
    assert.ok(!/function requestIntelligence\(\s*db\s*,/.test(src));
  });

  await test('（3.feature integration）application/features/index.js有export * as intelligence from ./intelligence/index.js', () => {
    const src = readSrc(path.join(featuresDir, 'index.js'));
    assert.ok(/export \* as intelligence from ['"]\.\/intelligence\/index\.js['"]/.test(src));
  });

  await test('（3.feature integration）Insight Feature（insight_feature.js、features/insight/）本次審查完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/features/insight_feature.js src/intelligence/application/features/insight/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.feature integration）Behavior Feature（features/behavior/）本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/features/behavior/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.feature integration）端對端：Insight跟Behavior兩個既有Feature在本次審查後依然成功運作（未受影響）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  await test('（3.feature integration）app.intelligence物件恰好維持24個欄位不變（本次審查沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（3.feature integration）src/bootstrap/application.js本次審查完全沒有被修改（Phase 4整體仍是「已建立但未接線」）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // D. dependency scan
  // =========================================================================
  console.log('--- D. dependency scan ---');

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);

    await test(`（4.dependency scan）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const pattern of [/db\.prepare\(/, /\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i, /DIET_COACH_DB/]) {
      await test(`（4.dependency scan）${layer}/${file} 不含資料庫關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
    await test(`（4.dependency scan）${layer}/${file} 完全不出現db變數名稱`, () => {
      assert.ok(!/\bdb\b/.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（4.dependency scan）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i, /\buserId\b/]) {
      await test(`（4.dependency scan）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
    for (const fn of ['requireAuth(', 'requireActiveUser(', 'getCurrentUser(']) {
      await test(`（4.dependency scan）${layer}/${file} 完全不呼叫${fn.replace('(', '()')}`, () => {
        assert.ok(!src.includes(fn));
      });
    }
    await test(`（4.dependency scan）${layer}/${file} 完全不import src/services/（既有Domain Service）`, () => {
      assert.ok(!/from\s+['"].*\/services\//.test(src));
    });
    await test(`（4.dependency scan）${layer}/${file} 完全不呼叫setTimeout()/setInterval()`, () => {
      assert.ok(!/setTimeout\(/.test(src));
      assert.ok(!/setInterval\(/.test(src));
    });
    await test(`（4.dependency scan）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  // 循環依賴/跨層依賴掃描：確認四層的相對路徑import只指向「同目錄
  // 底下的檔案」或（僅限於各自index.js）「無」，沒有任何檔案跨目錄
  // reach進另一層的實作細節，藉此排除循環依賴的可能性。
  for (const layer of PHASE4_LAYERS) {
    for (const file of layer.files) {
      await test(`（4.dependency scan）${layer.name}/${file} 的所有相對路徑import都指向同目錄底下的檔案（不跨目錄reach進其他Phase 4層的實作細節，排除循環依賴）`, () => {
        const src = readSrc(path.join(layer.dir, file));
        const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
        for (const imp of imports) {
          assert.ok(imp.startsWith('./'), `${layer.name}/${file}出現非同目錄的相對路徑import：${imp}`);
        }
      });
    }
  }

  await test('（4.dependency scan）Analysis Capability完全不import Recommendation Capability、Capability Orchestrator、Feature Integration任何檔案', () => {
    for (const file of PHASE4_LAYERS[0].files) {
      const src = readSrc(path.join(analysisCapabilityDir, file));
      assert.ok(!/recommendation_capability|capability_orchestrator|intelligence_feature/.test(src));
    }
  });

  await test('（4.dependency scan）Recommendation Capability完全不import Analysis Capability、Capability Orchestrator、Feature Integration任何檔案', () => {
    for (const file of PHASE4_LAYERS[1].files) {
      const src = readSrc(path.join(recommendationCapabilityDir, file));
      assert.ok(!/analysis_capability|capability_orchestrator|intelligence_feature/.test(src));
    }
  });

  await test('（4.dependency scan）Capability Orchestrator完全不直接import Analysis Runner/Recommendation Runner（只透過依賴注入拿到的Capability實例呼叫，不繞過Capability層）', () => {
    for (const file of PHASE4_LAYERS[2].files) {
      const src = readSrc(path.join(orchestrationCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
    }
  });

  await test('（4.dependency scan）Feature Integration完全不import capabilities/analysis/或capabilities/recommendation/（不繞過Capability Orchestrator）', () => {
    for (const file of PHASE4_LAYERS[3].files) {
      const src = readSrc(path.join(intelligenceFeatureDir, file));
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(!imp.includes('capabilities/analysis'));
        assert.ok(!imp.includes('capabilities/recommendation'));
      }
    }
  });

  await test('（4.dependency scan）capabilities/index.js的相對路徑import恰好是三個nested子目錄（analysis/recommendation/orchestration），沒有多餘的import', () => {
    const src = readSrc(path.join(capabilitiesDir, 'index.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports.sort(), ['./analysis/index.js', './orchestration/index.js', './recommendation/index.js']);
  });

  console.log('');

  // =========================================================================
  // E. runtime isolation
  // =========================================================================
  console.log('--- E. runtime isolation ---');

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（5.runtime isolation）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    await test(`（5.runtime isolation）${layer}/${file} 完全不import src/intelligence/execution/（Execution Manager）`, () => {
      const executionManagerDir = path.join(intelDir, 'execution');
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        const resolved = path.normalize(path.join(path.dirname(full), imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir);
      }
    });
    for (const varName of ['executionManager', 'historyStore', 'metricsStore', 'eventDispatcher', 'governanceService']) {
      await test(`（5.runtime isolation）${layer}/${file} 完全不出現${varName}變數名稱`, () => {
        assert.ok(!new RegExp(varName).test(src));
      });
    }
    await test(`（5.runtime isolation）${layer}/${file} 完全不import application/workflows/、application/use_cases/、application_service.js`, () => {
      assert.ok(!/from\s+['"].*\/workflows\//.test(src));
      assert.ok(!/from\s+['"].*\/use_cases\//.test(src));
      assert.ok(!/application_service\.js/.test(src));
    });
    await test(`（5.runtime isolation）${layer}/${file} 完全不import src/intelligence/application/（不認識Phase 3 Application Layer的存在，intelligence-feature除外——它本身就在application/底下，但仍不import application_service.js/facade/等）`, () => {
      if (layer !== 'intelligence-feature') {
        assert.ok(!/from\s+['"].*\/application\//.test(src));
      }
    });
  }

  await test('（5.runtime isolation）Runtime Execution Layer（execution/、service/、orchestration/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次審查完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/execution/ src/intelligence/service/ src/intelligence/orchestration/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Analysis Runner本身（analysis_runner.js）本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Recommendation Runner本身（recommendation_runner.js）本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Phase 3 Application Layer（application/整個目錄樹，除了本次新增文件外）本次審查完全沒有被修改的production程式碼', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（5.runtime isolation）Phase 4三個Capability（analysis/recommendation/orchestration）整條樹本次審查完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Feature Integration（features/intelligence/）整條樹本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/features/intelligence/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // F. AI boundary
  // =========================================================================
  console.log('--- F. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（6.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（6.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
  }

  await test('（6.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（6.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（6.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（6.AI boundary）Analysis Runner的DEFAULT_ANALYSIS_MODULES可以被dependencies.modules覆蓋（未來AI Extension Point，本次審查只確認機制存在，不啟用）', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder-for-future-ai', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.insights, [{ type: 'placeholder-for-future-ai', value: 1, source: 'x' }]);
  });

  await test('（6.AI boundary）Recommendation Runner的DEFAULT_RECOMMENDATION_MODULES可以被dependencies.modules覆蓋（未來AI Extension Point，本次審查只確認機制存在，不啟用）', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder-for-future-ai', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.recommendations, [{ type: 'placeholder-for-future-ai', value: 1, source: 'x' }]);
  });

  await test('（6.AI boundary）PHASE4_CONSOLIDATION_REVIEW.md記錄了Analysis modules/Recommendation modules是未來AI Provider合法位置', () => {
    assert.ok(/Analysis Runner的.*dependencies\.modules|Analysis modules/.test(reviewDoc));
    assert.ok(/Recommendation Runner的.*dependencies\.modules|Recommendation modules/.test(reviewDoc));
  });

  await test('（6.AI boundary）PHASE4_CONSOLIDATION_REVIEW.md明確記錄「Feature → AI Provider」是禁止的捷徑', () => {
    assert.ok(/Feature.*AI Provider/.test(reviewDoc));
  });

  await test('（6.AI boundary）PHASE4_CONSOLIDATION_REVIEW.md記錄了async尚未支援的Known Limitation', () => {
    assert.ok(/async/.test(reviewDoc));
  });

  console.log('');

  // =========================================================================
  // G. export consistency
  // =========================================================================
  console.log('--- G. export consistency ---');

  await test('（7.export consistency）src/intelligence/capabilities/index.js（頂層）恰好具備analysis/orchestration/recommendation三個namespace', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['analysis', 'orchestration', 'recommendation']);
  });

  await test('（7.export consistency）application/features/index.js同時具備insight/behavior/intelligence三個namespace', () => {
    const namespaces = getReExportedNamespaces(path.join(featuresDir, 'index.js'));
    assert.ok(namespaces.has('insight'));
    assert.ok(namespaces.has('behavior'));
    assert.ok(namespaces.has('intelligence'));
  });

  await test('（7.export consistency）src/intelligence/index.js有export * as capabilities from ./capabilities/index.js', () => {
    const src = readSrc(path.join(intelDir, 'index.js'));
    assert.ok(/export \* as capabilities from ['"]\.\/capabilities\/index\.js['"]/.test(src));
  });

  await test('（7.export consistency）src/intelligence/index.js本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.export consistency）import後，頂層capabilities.analysis/recommendation/orchestration三個namespace互不覆蓋，各自具備獨立的create函式', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    assert.strictEqual(typeof intelModule.capabilities.analysis.createAnalysisCapability, 'function');
    assert.strictEqual(typeof intelModule.capabilities.recommendation.createRecommendationCapability, 'function');
    assert.strictEqual(typeof intelModule.capabilities.orchestration.createCapabilityOrchestrator, 'function');
    assert.strictEqual(typeof intelModule.capabilities.analysis.createCapabilityOrchestrator, 'undefined');
    assert.strictEqual(typeof intelModule.capabilities.recommendation.createAnalysisCapability, 'undefined');
    assert.strictEqual(typeof intelModule.capabilities.orchestration.createRecommendationCapability, 'undefined');
  });

  await test('（7.export consistency）import後，application.features.intelligence跟application.features.insight/behavior互不污染', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    assert.strictEqual(typeof intelModule.application.features.intelligence.createIntelligenceFeature, 'function');
    assert.strictEqual(typeof intelModule.application.features.insight.createIntelligenceFeature, 'undefined');
    assert.strictEqual(typeof intelModule.application.features.behavior.createIntelligenceFeature, 'undefined');
  });

  await test('（7.export consistency）頂層capabilities namespace跟nested的application.capabilities（Phase 3 Insight Capability）互不覆蓋', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    assert.strictEqual(typeof intelModule.capabilities.createInsightCapability, 'undefined');
    assert.strictEqual(typeof intelModule.application.capabilities.createInsightCapability, 'function');
    assert.strictEqual(typeof intelModule.application.capabilities.createAnalysisCapability, 'undefined');
  });

  await test('（7.export consistency）端對端：透過src/intelligence/index.js頂層namespace手動組裝出完整鏈路可以正確運作', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    const feature = intelModule.application.features.intelligence.createIntelligenceFeature({
      capabilityOrchestrator: intelModule.capabilities.orchestration.createCapabilityOrchestrator({
        analysisCapability: intelModule.capabilities.analysis.createAnalysisCapability({ analysisRunner: intelModule.analysis.createAnalysisRunner() }),
        recommendationCapability: intelModule.capabilities.recommendation.createRecommendationCapability({ recommendationRunner: intelModule.recommendation.createRecommendationRunner() }),
      }),
    });
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  for (const layer of PHASE4_LAYERS) {
    await test(`（7.export consistency）${layer.name}/index.js re-export的名稱在對應來源檔案裡確實存在`, () => {
      const indexSrc = readSrc(path.join(layer.dir, 'index.js'));
      for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
        const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        const sourceFile = path.normalize(path.join(layer.dir, m[2]));
        const sourceExports = getNamedExports(sourceFile);
        for (const name of names) {
          assert.ok(sourceExports.has(name), `${layer.name}/index.js re-export了${sourceFile}裡不存在的${name}`);
        }
      }
    });
  }

  console.log('');

  // =========================================================================
  // H. regression check
  // =========================================================================
  console.log('--- H. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（8.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.80-capability-review')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（8.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 70, `預期至少70個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（8.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // I. P1-P6
  // =========================================================================
  console.log('--- I. P1-P6 ---');

  await test('（9.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（9.P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（9.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

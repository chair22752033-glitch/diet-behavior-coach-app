/*
 * Phase 4 TASK 1.82｜Decision Capability Boundary Architecture
 * Review 測試
 *
 * 本任務不是建立Decision Engine/Decision Algorithm/Decision
 * Model、不是導入AI——這是純審查任務，在TASK1.81 Intelligence
 * Decision Flow Architecture Planning基礎上，評估未來Decision
 * Layer在Intelligence Capability Architecture裡的合法位置
 * （Capability Orchestrator extension vs Independent Decision
 * Capability），記錄在
 * `src/intelligence/PHASE4_DECISION_CAPABILITY_REVIEW.md`。
 *
 * 這份測試驗證的是：
 * - Boundary Review：文件正確記錄Decision Boundary分析結論、
 *   Capability設計選項比較（選項A vs 選項B）、Contract評估結論
 * - Capability Compatibility：既有Phase 4 Capability
 *   Architecture（四層）完全沒有被修改，資料流依然正確運作
 * - Dependency Direction：本次審查沒有新增任何Decision相關的
 *   production程式碼
 * - Runtime Isolation：Analysis/Recommendation Runner、Phase 2
 *   Runtime Orchestrator完全沒有被修改
 * - AI Boundary：文件正確記錄AI Decision Module的未來合法位置、
 *   Feature direct AI usage仍然禁止
 * - Documentation Consistency：文件章節齊全、內容跟規格要求一致
 * - Regression/P1-P6
 *
 * 分為以下8個部分：
 * A) boundary review
 * B) capability compatibility
 * C) dependency direction
 * D) runtime isolation
 * E) AI boundary
 * F) documentation consistency
 * G) regression check
 * H) P1-P6
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
const reviewDocPath = path.join(intelDir, 'PHASE4_DECISION_CAPABILITY_REVIEW.md');

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

function getReExportedNamespaces(indexPath) {
  const src = readSrc(indexPath);
  const names = new Set();
  for (const m of src.matchAll(/^export\s*\*\s*as\s+(\S+)\s+from/gm)) {
    names.add(m[1]);
  }
  return names;
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

// 四層既有Phase 4 Capability Architecture各自的目錄跟檔案清單，
// 本次審查任務用來確認「既有架構完全沒有被觸碰」
const PHASE4_LAYERS = [
  { name: 'analysis', dir: analysisCapabilityDir, files: ['analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js'] },
  { name: 'recommendation', dir: recommendationCapabilityDir, files: ['recommendation_capability.js', 'recommendation_capability_result_builder.js', 'index.js'] },
  { name: 'orchestration', dir: orchestrationCapabilityDir, files: ['capability_orchestrator.js', 'capability_result_builder.js', 'index.js'] },
  { name: 'intelligence-feature', dir: intelligenceFeatureDir, files: ['intelligence_feature.js', 'intelligence_feature_result_mapper.js', 'index.js'] },
];
const ALL_PHASE4_FILES = PHASE4_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));

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

  const reviewDoc = fs.readFileSync(reviewDocPath, 'utf8');
  const planDoc = fs.readFileSync(path.join(intelDir, 'PHASE4_DECISION_FLOW_PLAN.md'), 'utf8');

  // =========================================================================
  // A. boundary review
  // =========================================================================
  console.log('--- A. boundary review ---');

  await test('（1.boundary review）src/intelligence/PHASE4_DECISION_CAPABILITY_REVIEW.md 存在且內容非空', () => {
    assert.ok(fs.existsSync(reviewDocPath));
    assert.ok(reviewDoc.length > 1000);
  });

  const REQUIRED_DOC_SECTIONS = ['Decision Boundary Analysis', 'Capability Design Options', 'Contract Consideration', 'Data Flow', 'AI Extension Strategy', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.boundary review）PHASE4_DECISION_CAPABILITY_REVIEW.md包含「${section}」章節`, () => {
      assert.ok(reviewDoc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.boundary review）文件記錄Recommendation Result → Decision Output需要獨立成一個Layer的結論', () => {
    assert.ok(/\*\*是\*\*/.test(reviewDoc) || /需要獨立成一個Layer/.test(reviewDoc));
  });

  await test('（1.boundary review）文件記錄選項A（Capability Orchestrator extension）跟選項B（Independent Decision Capability）兩個設計選項', () => {
    assert.ok(/選項A/.test(reviewDoc));
    assert.ok(/選項B/.test(reviewDoc));
    assert.ok(/Capability Orchestrator extension/.test(reviewDoc));
    assert.ok(/Independent Decision Capability/.test(reviewDoc));
  });

  await test('（1.boundary review）文件明確建議採用選項B（Independent Decision Capability）', () => {
    assert.ok(/建議選項B/.test(reviewDoc));
  });

  await test('（1.boundary review）文件包含選項A vs 選項B的評估比較表格（跨越一致性/獨立測試能力/彈性/可讀性四個面向）', () => {
    assert.ok(/跟既有Analysis\/Recommendation Capability的一致性/.test(reviewDoc));
    assert.ok(/獨立測試能力/.test(reviewDoc));
    assert.ok(/未來抽換\/停用的彈性/.test(reviewDoc));
  });

  await test('（1.boundary review）文件評估Decision Request/Response Contract是否需要建立，結論為「現階段不需要」', () => {
    assert.ok(/Decision Request/.test(reviewDoc));
    assert.ok(/Decision Response/.test(reviewDoc));
    assert.ok(/現階段不需要/.test(reviewDoc));
  });

  await test('（1.boundary review）文件說明既有Capability（Analysis/Recommendation/Orchestrator/Feature Integration）皆未使用Contract Layer的既有慣例作為評估依據', () => {
    assert.ok(/Contract Layer/.test(reviewDoc));
  });

  await test('（1.boundary review）文件記錄了六項Completion Criteria checkbox', () => {
    const checkCount = (reviewDoc.match(/✅/g) || []).length;
    assert.ok(checkCount >= 6, `預期至少6個✅，實際${checkCount}`);
  });

  console.log('');

  // =========================================================================
  // B. capability compatibility
  // =========================================================================
  console.log('--- B. capability compatibility ---');

  for (const layer of PHASE4_LAYERS) {
    await test(`（2.capability compatibility）${layer.name} 目錄依然恰好包含4個檔案（本次審查沒有新增任何檔案）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  // TASK1.83後更新：TASK1.82當時的斷言是「本次審查沒有新增decision
  // namespace」，這在TASK1.82當下是正確的（純審查任務）。TASK1.83
  // 依照本次審查結論正式建立了Decision Capability並新增了
  // `decision`namespace——這是審查系列預期的下一步、不是回歸，這裡
  // 放寬為「三個既有namespace依然存在」。
  await test('（TASK1.83後更新）（2.capability compatibility）src/intelligence/capabilities/index.js（頂層）依然包含analysis/orchestration/recommendation三個namespace（TASK1.83新增decision後，四者平行並存）', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.ok(namespaces.has('analysis'));
    assert.ok(namespaces.has('orchestration'));
    assert.ok(namespaces.has('recommendation'));
  });

  await test('（2.capability compatibility）application/features/index.js依然只有insight/behavior/intelligence三個namespace（本次沒有新增任何Feature）', () => {
    const namespaces = getReExportedNamespaces(path.join(featuresDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['behavior', 'insight', 'intelligence']);
  });

  await test('（2.capability compatibility）端對端：Analysis Capability單獨呼叫依然正確運作（TASK1.76行為不變）', () => {
    const capability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const result = capability.requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'analysis');
  });

  await test('（2.capability compatibility）端對端：Recommendation Capability單獨呼叫依然正確運作（TASK1.77行為不變）', () => {
    const capability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const result = capability.requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'recommendation');
  });

  await test('（2.capability compatibility）端對端：Capability Orchestrator依然正確運作（TASK1.78行為不變，本次審查沒有實際新增decisionCapability依賴注入）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'orchestration');
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.capability compatibility）端對端：Feature Integration依然正確運作（TASK1.79行為不變）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.feature, 'intelligence');
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  await test('（2.capability compatibility）Unified Capability Result依然只有{analysis, recommendation}兩個欄位（本次審查只是文件評估，沒有實際新增decision欄位）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.data, 'decision'), false);
  });

  await test('（2.capability compatibility）app.intelligence物件恰好維持24個欄位不變（本次審查沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（2.capability compatibility）src/bootstrap/application.js本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.capability compatibility）端對端：recommendation的insight_count恰好反映analysis的insights陣列長度（既有串接關係不受本次審查影響）', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    const insightCount = result.data.recommendation.recommendations.find((r) => r.type === 'insight_count');
    assert.strictEqual(insightCount.value, result.data.analysis.insights.length);
  });

  await test('（2.capability compatibility）端對端：是deterministic的——同樣的request重複呼叫得到完全相同的結果', () => {
    const feature = makeRealFeature();
    const request = { context: makeInsightContext() };
    assert.deepStrictEqual(feature.requestIntelligence(request), feature.requestIntelligence(request));
  });

  console.log('');

  // =========================================================================
  // C. dependency direction
  // =========================================================================
  console.log('--- C. dependency direction ---');

  // TASK1.83後更新：這兩個斷言在TASK1.82當下是正確的（純審查
  // 任務，不建立任何Decision相關production程式碼）。TASK1.83依照
  // TASK1.82的審查結論（選項B：Independent Decision Capability），
  // 正式建立了`src/intelligence/capabilities/decision/`——這是
  // 審查系列預期的下一步、不是回歸。這裡改為驗證這些檔案/目錄
  // 確實存在，紀錄審查到落地的演進過程。
  await test('（TASK1.83後更新）（3.dependency direction）TASK1.83已依照本次審查結論（選項B）建立capabilities/decision/目錄跟對應的.js production程式碼', () => {
    assert.ok(fs.existsSync(path.join(capabilitiesDir, 'decision', 'decision_capability.js')));
    assert.ok(fs.existsSync(path.join(capabilitiesDir, 'decision', 'decision_result_builder.js')));
  });

  await test('（TASK1.83後更新）（3.dependency direction）TASK1.83建立的capabilities/decision/沒有連帶新增src/intelligence/decision/（頂層Runtime子系統，本次審查/後續實作都沒有建立Decision Runner）', () => {
    assert.strictEqual(fs.existsSync(path.join(intelDir, 'decision')), false);
    assert.ok(fs.existsSync(path.join(capabilitiesDir, 'decision')));
  });

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    await test(`（3.dependency direction）${layer}/${file} 本次審查完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
    await test(`（3.dependency direction）${layer}/${file} 完全不出現Decision相關字樣（本次審查沒有偷偷埋入任何Decision實作）`, () => {
      const src = readSrc(full);
      assert.ok(!/Decision/.test(src), `${layer}/${file} 意外出現Decision字樣`);
    });
  }

  await test('（3.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次審查完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（3.dependency direction）PHASE4_DECISION_FLOW_PLAN.md（TASK1.81）本次審查完全沒有被修改（本次審查是延伸評估，不是重寫）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE4_DECISION_FLOW_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // D. runtime isolation
  // =========================================================================
  console.log('--- D. runtime isolation ---');

  await test('（4.runtime isolation）Analysis Runner本身（analysis_runner.js）本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.runtime isolation）Recommendation Runner本身（recommendation_runner.js）本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.runtime isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/，TASK1.45）本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.runtime isolation）Execution Manager（src/intelligence/execution/）本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/execution/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.runtime isolation）Runtime Execution Layer（service/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次審查完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.runtime isolation）src/intelligence/index.js本次審查完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring'];
  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（4.runtime isolation）${layer}/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    await test(`（4.runtime isolation）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（4.runtime isolation）${layer}/${file} 完全不出現db變數名稱`, () => {
      assert.ok(!/\bdb\b/.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（4.runtime isolation）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（4.runtime isolation）${layer}/${file} 不含身分相關字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src));
      });
    }
    await test(`（4.runtime isolation）${layer}/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher變數名稱`, () => {
      assert.ok(!/executionManager|historyStore|metricsStore|eventDispatcher/.test(src));
    });
  }

  await test('（4.runtime isolation）TASK1.81規劃文件（PHASE4_DECISION_FLOW_PLAN.md）已記錄的Security Boundary（不得操作database/auth/session）依然完整保留（本次審查沒有修改或弱化前一份文件的安全邊界）', () => {
    assert.ok(/database/.test(planDoc));
    assert.ok(/\bauth\b/.test(planDoc));
    assert.ok(/\bsession\b/.test(planDoc));
  });

  console.log('');

  // =========================================================================
  // E. AI boundary
  // =========================================================================
  console.log('--- E. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（5.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（5.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（5.AI boundary）${layer}/${file} 完全不呼叫Date.now()/Math.random()（deterministic，本次審查沒有破壞既有的deterministic性質）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（5.AI boundary）PHASE4_DECISION_CAPABILITY_REVIEW.md不含實際的AI呼叫程式碼字樣 ${pattern}（文件本身只是討論「未來AI可以在哪裡」，不是真的呼叫）`, () => {
      assert.ok(!pattern.test(reviewDoc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（5.AI boundary）文件記錄未來AI Decision Module合法位置比照Analysis Runner/Recommendation Runner既有的dependencies.modules延伸點', () => {
    assert.ok(/AI Decision Module|Decision Runner.{0,60}dependencies\.modules/.test(reviewDoc.replace(/\n/g, '')));
  });

  await test('（5.AI boundary）文件明確記錄「Feature → AI Provider」（Feature direct AI usage）是禁止的捷徑', () => {
    assert.ok(/Feature.*AI Provider/.test(reviewDoc));
    assert.ok(/Feature direct AI\s*usage/.test(reviewDoc.replace(/\n/g, ' ')));
  });

  await test('（5.AI boundary）文件記錄即使Decision Capability支援AI modules，Decision Capability/Capability Orchestrator/Feature都不應該知道AI是什麼', () => {
    assert.ok(/不應該知道.{0,10}AI|不知道.{0,10}AI/.test(reviewDoc.replace(/\n/g, '')));
  });

  await test('（5.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（5.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（5.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（5.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作（未來AI Extension Point機制未被破壞）', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.insights, [{ type: 'placeholder', value: 1, source: 'x' }]);
  });

  await test('（5.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.recommendations, [{ type: 'placeholder', value: 1, source: 'x' }]);
  });

  console.log('');

  // =========================================================================
  // F. documentation consistency
  // =========================================================================
  console.log('--- F. documentation consistency ---');

  await test('（6.documentation consistency）文件開頭明確聲明「不是建立Decision Engine/Decision Algorithm/Decision Model、不是導入AI」', () => {
    const flat = reviewDoc.replace(/\n/g, ' ');
    assert.ok(/不是.{0,15}建立Decision\s*Engine/.test(flat));
    assert.ok(/不是.{0,10}導入AI/.test(flat));
  });

  await test('（6.documentation consistency）文件記錄Output Evolution表格（Analysis/Recommendation已完成，Decision/Action規劃中）', () => {
    assert.ok(/Output Evolution/.test(reviewDoc));
  });

  await test('（6.documentation consistency）文件記錄的Data Flow採用Capability層級的資料流（Feature→Capability Orchestrator→Analysis Capability→Recommendation Capability→Decision Capability→Output），Decision Capability標記為「規劃中，未建立」', () => {
    assert.ok(/Decision Capability（規劃中，未建立/.test(reviewDoc));
  });

  await test('（6.documentation consistency）文件引用了TASK1.81的PHASE4_DECISION_FLOW_PLAN.md（確認審查延續既有規劃，不是重新發明）', () => {
    assert.ok(/PHASE4_DECISION_FLOW_PLAN\.md/.test(reviewDoc));
  });

  await test('（6.documentation consistency）文件引用了TASK1.75的PHASE4_CAPABILITY_PLAN.md（AI Extension Strategy延續既有結論）', () => {
    assert.ok(/PHASE4_CAPABILITY_PLAN|TASK1\.75/.test(reviewDoc));
  });

  await test('（6.documentation consistency）文件記錄async限制延續TASK1.75/1.81已記錄的Known Limitation', () => {
    assert.ok(/async/.test(reviewDoc));
  });

  await test('（6.documentation consistency）文件的Known Limitations章節明確指出選項B跟Capability Orchestrator擴充目前都沒有對應的production程式碼', () => {
    assert.ok(/Decision Capability完全不存在/.test(reviewDoc));
  });

  await test('（6.documentation consistency）TASK1.81規劃文件（PHASE4_DECISION_FLOW_PLAN.md）依然包含Decision Flow Goal等既有六個章節（本次審查沒有破壞前一份文件的結構）', () => {
    for (const section of ['Decision Flow Goal', 'Layer Responsibility', 'Data Flow', 'AI Extension Strategy', 'Security Boundary', 'Known Limitations']) {
      assert.ok(planDoc.includes(section), `PHASE4_DECISION_FLOW_PLAN.md缺少章節：${section}`);
    }
  });

  console.log('');

  // =========================================================================
  // G. regression check
  // =========================================================================
  console.log('--- G. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（7.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.82-decision-boundary-review')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（7.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 72, `預期至少72個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（7.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // H. P1-P6
  // =========================================================================
  console.log('--- H. P1-P6 ---');

  await test('（8.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（8.P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（8.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

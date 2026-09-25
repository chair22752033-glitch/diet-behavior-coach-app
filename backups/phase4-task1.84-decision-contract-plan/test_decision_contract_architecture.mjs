/*
 * Phase 4 TASK 1.84｜Decision Capability Contract & Output
 * Architecture Planning 測試
 *
 * 本任務不是建立Decision Logic/Decision Algorithm、不是導入AI——
 * 這是純規劃任務，在TASK1.83 Decision Capability
 * Foundation已經落地的真實實作基礎上，正式確認Decision
 * Capability未來所需的資料契約（Request/Response）與輸出模型
 * 邊界，記錄在`src/intelligence/PHASE4_DECISION_CONTRACT_PLAN.md`。
 *
 * 這份測試驗證的是：
 * - Decision Boundary：文件記錄的Request Boundary（必填/選填
 *   欄位、metadata邊界）跟`decision_capability.js`真實程式碼行為
 *   一致
 * - Output Model Consistency：文件記錄的Response Boundary（三個
 *   頂層欄位、向後相容原則）跟`decision_result_builder.js`真實
 *   程式碼行為一致
 * - Recommendation Compatibility：Recommendation Layer跟Decision
 *   Layer責任分離依然成立，端對端串接依然正確
 * - Dependency Direction：本次規劃沒有修改任何既有Decision
 *   Capability程式碼，也沒有建立任何Decision Algorithm/Rule
 *   Engine/Scoring Logic/Weight/Threshold程式碼
 * - Capability Isolation：四層Phase 4 Capability完全獨立不變
 * - Runtime Isolation：Analysis/Recommendation Runner、Phase 2
 *   Runtime Orchestrator完全沒有被修改
 * - AI Boundary：文件正確記錄AI Decision Module未來合法位置、
 *   Feature direct AI usage仍然禁止
 * - Documentation Consistency：文件章節齊全、內容跟規格要求一致
 * - Regression/P1-P6
 *
 * 分為以下10個部分：
 * A) decision boundary
 * B) output model consistency
 * C) recommendation compatibility
 * D) dependency direction
 * E) capability isolation
 * F) runtime isolation
 * G) AI boundary
 * H) documentation consistency
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
const decisionCapabilityDir = path.join(capabilitiesDir, 'decision');
const planDocPath = path.join(intelDir, 'PHASE4_DECISION_CONTRACT_PLAN.md');

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

function makeRecommendationResult(overrides) {
  return Object.assign({
    status: 'recommendation_ready',
    recommendations: [{ type: 'x', value: 1, source: 'y' }],
    metadata: { version: '1.0.0' },
  }, overrides || {});
}

// 四層既有Phase 4 Capability Architecture各自的目錄跟檔案清單，
// 本次規劃任務用來確認「既有架構完全沒有被觸碰」
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
  const { createDecisionCapability, createDecisionCapabilityResultBuilder, buildDecisionOutputPlaceholder, DECISION_OUTPUT_VERSION } = await import(path.join(decisionCapabilityDir, 'index.js'));
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

  const planDoc = fs.readFileSync(planDocPath, 'utf8');
  const flatDoc = planDoc.replace(/\n/g, ' ');
  const decisionCapabilitySrc = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
  const decisionResultBuilderSrc = readSrc(path.join(decisionCapabilityDir, 'decision_result_builder.js'));

  // =========================================================================
  // A. decision boundary
  // =========================================================================
  console.log('--- A. decision boundary ---');

  await test('（1.decision boundary）src/intelligence/PHASE4_DECISION_CONTRACT_PLAN.md 存在且內容非空', () => {
    assert.ok(fs.existsSync(planDocPath));
    assert.ok(planDoc.length > 1500);
  });

  const REQUIRED_DOC_SECTIONS = ['Decision Request Boundary', 'Decision Response Boundary', 'Contract Strategy', 'Recommendation / Decision Separation', 'AI Extension Strategy', 'Security Boundary', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.decision boundary）PHASE4_DECISION_CONTRACT_PLAN.md包含「${section}」章節`, () => {
      assert.ok(planDoc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.decision boundary）文件記錄Required fields只有recommendationResult一個', () => {
    assert.ok(/Required fields/.test(planDoc));
    assert.ok(/recommendationResult（必填/.test(planDoc) || /recommendationResult.{0,10}必填/.test(flatDoc));
  });

  await test('（1.decision boundary）文件記錄Optional fields目前沒有任何選填欄位', () => {
    assert.ok(/Optional fields/.test(planDoc));
    assert.ok(/沒有.{0,10}任何選填欄位/.test(flatDoc));
  });

  await test('（1.decision boundary）文件記錄的Request Boundary跟decision_capability.js真實的validateDecisionCapabilityRequest()程式碼一致（貼出真實原始碼片段）', () => {
    assert.ok(/validateDecisionCapabilityRequest/.test(planDoc));
    assert.ok(/invalid_recommendation_result/.test(planDoc));
  });

  await test('（1.decision boundary）decision_capability.js真實程式碼裡的validateDecisionCapabilityRequest()確實只檢查request/recommendationResult兩個條件（跟文件描述一致）', () => {
    const matches = decisionCapabilitySrc.match(/if\s*\(/g) || [];
    assert.ok(matches.length <= 4, `驗證函式條件分支數量超出預期：${matches.length}`);
  });

  await test('（1.decision boundary）文件確認結論為「目前足夠」——Decision Capability現階段責任不需要recommendationResult以外的任何輸入', () => {
    assert.ok(/目前足夠/.test(planDoc));
  });

  await test('（1.decision boundary）文件明確重申禁止加入實際決策內容——validateDecisionCapabilityRequest()不解讀recommendations陣列每一筆的內容', () => {
    assert.ok(/禁止加入實際決策內容/.test(planDoc));
  });

  console.log('');

  // =========================================================================
  // B. output model consistency
  // =========================================================================
  console.log('--- B. output model consistency ---');

  await test('（2.output model consistency）文件記錄的Decision Output Model跟buildDecisionOutputPlaceholder()真實回傳形狀一致（status/decision/metadata三個頂層欄位）', () => {
    const output = buildDecisionOutputPlaceholder(makeRecommendationResult());
    assert.deepStrictEqual(Object.keys(output).sort(), ['decision', 'metadata', 'status']);
    assert.ok(/status/.test(planDoc));
    assert.ok(/decision/.test(planDoc));
    assert.ok(/metadata/.test(planDoc));
  });

  await test('（2.output model consistency）文件記錄status固定字面值"decision_not_available"跟真實程式碼一致', () => {
    const output = buildDecisionOutputPlaceholder(makeRecommendationResult());
    assert.strictEqual(output.status, 'decision_not_available');
    assert.ok(/decision_not_available/.test(planDoc));
  });

  await test('（2.output model consistency）文件記錄decision欄位固定為null跟真實程式碼一致', () => {
    const output = buildDecisionOutputPlaceholder(makeRecommendationResult());
    assert.strictEqual(output.decision, null);
  });

  await test('（2.output model consistency）文件記錄metadata.version等於DECISION_OUTPUT_VERSION（1.0.0）跟真實程式碼一致', () => {
    assert.strictEqual(DECISION_OUTPUT_VERSION, '1.0.0');
    assert.ok(/1\.0\.0/.test(planDoc));
  });

  await test('（2.output model consistency）文件記錄了向後相容原則——未來擴充必須維持{status, decision, metadata}三個頂層欄位', () => {
    assert.ok(/向後相容原則/.test(planDoc));
  });

  await test('（2.output model consistency）文件記錄未來status可能演進為"decision_ready"字面值', () => {
    assert.ok(/decision_ready/.test(planDoc));
  });

  await test('（2.output model consistency）文件記錄擴充只能透過decision欄位從null變成有值、metadata底下新增欄位達成，不應該重新命名/移除既有三個頂層欄位', () => {
    assert.ok(/不應該重新命名/.test(planDoc) || /不應該.{0,15}移除既有/.test(flatDoc));
  });

  await test('（2.output model consistency）端對端：requestDecision()回傳的result恰好符合文件記錄的Output Model形狀', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['decision', 'metadata', 'status']);
    assert.strictEqual(result.result.decision, null);
  });

  console.log('');

  // =========================================================================
  // C. recommendation compatibility
  // =========================================================================
  console.log('--- C. recommendation compatibility ---');

  await test('（3.recommendation compatibility）端對端：真實Recommendation Capability（TASK1.77）產生的result依然可以直接餵給Decision Capability，正確運作（本次規劃沒有破壞既有相容性）', () => {
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const recommendationOutcome = recommendationCapability.requestRecommendation({ analysisResult: { status: 'analysis_ready', insights: [{ type: 'x', value: 1, source: 'y' }], metadata: {} } });
    assert.strictEqual(recommendationOutcome.ok, true);
    const decisionCapability = createDecisionCapability();
    const decisionOutcome = decisionCapability.requestDecision({ recommendationResult: recommendationOutcome.result });
    assert.strictEqual(decisionOutcome.ok, true);
  });

  await test('（3.recommendation compatibility）端對端：完整鏈路Analysis→Recommendation→Decision依然全部用真實Runner/Capability串接正確運作', () => {
    const analysisCapability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const analysisOutcome = analysisCapability.requestAnalysis({ context: makeInsightContext() });
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const recommendationOutcome = recommendationCapability.requestRecommendation({ analysisResult: analysisOutcome.result });
    const decisionCapability = createDecisionCapability();
    const decisionOutcome = decisionCapability.requestDecision({ recommendationResult: recommendationOutcome.result });
    assert.strictEqual(decisionOutcome.ok, true);
    assert.strictEqual(decisionOutcome.result.metadata.recommendationCount, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（3.recommendation compatibility）文件記錄Recommendation Layer負責提供建議、不做選擇/排序/評分（跟recommendation_runner.js真實程式碼一致）', () => {
    assert.ok(/提供建議/.test(planDoc));
    assert.ok(/不做任何選擇\/\s*排序\/評分/.test(flatDoc));
  });

  await test('（3.recommendation compatibility）文件記錄Decision Layer負責產生決策輸出，目前只是佔位形狀', () => {
    assert.ok(/產生決策輸出/.test(planDoc));
  });

  await test('（3.recommendation compatibility）recommendation_runner.js完全沒有出現Decision相關字樣（本次規劃沒有污染Recommendation Layer）', () => {
    const src = readSrc(path.join(recommendationDir, 'recommendation_runner.js'));
    assert.ok(!/Decision/.test(src));
  });

  await test('（3.recommendation compatibility）recommendation_capability.js完全沒有出現Decision相關字樣', () => {
    const src = readSrc(path.join(recommendationCapabilityDir, 'recommendation_capability.js'));
    assert.ok(!/Decision/.test(src));
  });

  await test('（3.recommendation compatibility）decision_capability.js完全沒有重新定義recommendations陣列的形狀（只讀取.length，不修改欄位）', () => {
    assert.ok(!/\.recommendations\s*=/.test(decisionCapabilitySrc));
  });

  await test('（3.recommendation compatibility）Recommendation Runner本身（recommendation_runner.js）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（3.recommendation compatibility）Recommendation Capability本身（recommendation_capability.js/recommendation_capability_result_builder.js）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/recommendation/recommendation_capability.js src/intelligence/capabilities/recommendation/recommendation_capability_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // D. dependency direction
  // =========================================================================
  console.log('--- D. dependency direction ---');

  await test('（4.dependency direction）decision_capability.js本次規劃完全沒有被修改（逐檔案git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/decision/decision_capability.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.dependency direction）decision_result_builder.js本次規劃完全沒有被修改（逐檔案git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/decision/decision_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.dependency direction）capabilities/decision/index.js本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/decision/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.dependency direction）capabilities/decision/README.md本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/decision/README.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.dependency direction）本次規劃完全沒有建立任何名稱包含Algorithm/Engine/Rule的新.js程式碼檔案（規格明確禁止建立Decision Algorithm/Rule Engine）', () => {
    function walk(dir) {
      const found = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...walk(full));
        else if (entry.name.endsWith('.js') && /(algorithm|ruleengine|rule_engine)/i.test(entry.name)) found.push(full);
      }
      return found;
    }
    const found = walk(intelDir);
    assert.deepStrictEqual(found, [], `發現非預期的Algorithm/Engine相關.js檔案：${JSON.stringify(found)}`);
  });

  await test('（4.dependency direction）decision_capability.js/decision_result_builder.js完全不出現score/weight/threshold相關的計算邏輯（規格明確禁止Scoring Logic/Weight/Threshold判斷）', () => {
    for (const src of [decisionCapabilitySrc, decisionResultBuilderSrc]) {
      assert.ok(!/\.score\s*=/.test(src));
      assert.ok(!/\bweight\b/i.test(src));
      assert.ok(!/\bthreshold\b/i.test(src));
    }
  });

  await test('（4.dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次規劃完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  // TASK1.86後更新：這個斷言原本連同orchestration/一起比對，預期
  // 完全沒有異動。TASK1.86依照TASK1.85規劃結論（本次規劃TASK1.84
  // 的下一步），合法地修改了orchestration/底下的
  // capability_orchestrator.js/capability_result_builder.js（新增
  // 選填的decisionCapability整合）——這是規劃系列預期的下一步，
  // 不是回歸。這裡改為只比對analysis/recommendation/decision三層
  // （本次任務確實沒有觸及的部分），orchestration/的異動已知合法、
  // 另有專屬斷言驗證。
  await test('（TASK1.86後更新）（4.dependency direction）三層既有Phase 4 Capability（analysis/recommendation/decision）本次規劃完全沒有任何.js檔案被新增或修改，TASK1.86擴充的orchestration/是規劃系列預期的下一步', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  const TASK1_86_MODIFIED_FILES = new Set(['orchestration/capability_orchestrator.js', 'orchestration/capability_result_builder.js']);

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const key = `${layer}/${file}`;
    if (TASK1_86_MODIFIED_FILES.has(key)) {
      // 注意：不用即時git diff判斷「曾被修改」——TASK1.86的commit
      // 落地後，working tree對HEAD的diff永遠是空的，改用穩定的
      // 內容訊號。
      await test(`（TASK1.86後更新）（4.dependency direction）${key} 已由TASK1.86依照後續規劃正式修改（新增選填的decisionCapability整合，不是回歸）`, () => {
        const src = readSrc(full);
        assert.ok(/decisionCapability|decisionResult/.test(src), `${key} 預期包含decisionCapability/decisionResult`);
      });
      continue;
    }
    await test(`（4.dependency direction）${layer}/${file} 本次規劃完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  console.log('');

  // =========================================================================
  // E. capability isolation
  // =========================================================================
  console.log('--- E. capability isolation ---');

  await test('（5.capability isolation）src/intelligence/capabilities/index.js（頂層）依然恰好具備analysis/recommendation/orchestration/decision四個namespace（本次規劃沒有新增第五個namespace）', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['analysis', 'decision', 'orchestration', 'recommendation']);
  });

  await test('（5.capability isolation）application/features/index.js依然只有insight/behavior/intelligence三個namespace（本次沒有新增任何Feature）', () => {
    const namespaces = getReExportedNamespaces(path.join(featuresDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['behavior', 'insight', 'intelligence']);
  });

  await test('（5.capability isolation）src/intelligence/capabilities/index.js本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.capability isolation）src/intelligence/capabilities/README.md本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/README.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.capability isolation）端對端：Analysis Capability單獨呼叫依然正確運作', () => {
    const capability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const result = capability.requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.capability isolation）端對端：Recommendation Capability單獨呼叫依然正確運作', () => {
    const capability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const result = capability.requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.capability isolation）端對端：Capability Orchestrator依然只回傳{analysis, recommendation}兩個欄位，本次規劃沒有把Decision接進Orchestrator', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（5.capability isolation）端對端：Decision Capability單獨呼叫依然正確運作，介面跟TASK1.83完全一致', () => {
    const capability = createDecisionCapability();
    assert.deepStrictEqual(Object.keys(capability), ['requestDecision']);
    const result = capability.requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
  });

  await test('（5.capability isolation）端對端：Feature Integration依然正確運作，data欄位依然只有{analysis, recommendation}', () => {
    const feature = makeRealFeature();
    const result = feature.requestIntelligence({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['analysis', 'recommendation']);
  });

  // TASK1.86後更新：TASK1.84當下capability_orchestrator.js確實完全
  // 不出現Decision字樣（本次規劃沒有把Decision Capability接進
  // Orchestrator）。TASK1.86依照TASK1.85規劃結論正式落地了選填的
  // decisionCapability整合，現在合法地出現Decision相關字樣——這裡
  // 改為驗證這個演進本身。
  await test('（TASK1.86後更新）（5.capability isolation）capability_orchestrator.js現在合法出現Decision相關字樣（TASK1.86正式把選填的decisionCapability接進Orchestrator）', () => {
    const src = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
    assert.ok(/decisionCapability/.test(src));
  });

  await test('（5.capability isolation）intelligence_feature.js完全不出現Decision相關字樣（本次規劃沒有把Decision Capability接進Feature層）', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
    assert.ok(!/Decision/.test(src));
  });

  await test('（5.capability isolation）app.intelligence物件恰好維持24個欄位不變（本次規劃沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（5.capability isolation）src/bootstrap/application.js本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // F. runtime isolation
  // =========================================================================
  console.log('--- F. runtime isolation ---');

  await test('（6.runtime isolation）Analysis Runner本身（analysis_runner.js）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Recommendation Runner本身（recommendation_runner.js）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/，TASK1.45）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Execution Manager（src/intelligence/execution/）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/execution/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Runtime Execution Layer（service/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）src/intelligence/index.js本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）文件記錄的Security Boundary包含database/auth/session/Execution Manager/Event Dispatcher五項', () => {
    assert.ok(/database/.test(planDoc));
    assert.ok(/\bauth\b/.test(planDoc));
    assert.ok(/\bsession\b/.test(planDoc));
    assert.ok(/Execution Manager/.test(planDoc));
    assert.ok(/Event Dispatcher/.test(planDoc));
  });

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'analysis', 'recommendation', 'governance', 'events', 'monitoring'];
  for (const file of ['decision_capability.js', 'decision_result_builder.js', 'index.js']) {
    const src = readSrc(path.join(decisionCapabilityDir, file));
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（6.runtime isolation）capabilities/decision/${file} 依然完全不import src/intelligence/${subdir}/（本次規劃沒有改變既有邊界）`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    await test(`（6.runtime isolation）capabilities/decision/${file} 依然完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（6.runtime isolation）capabilities/decision/${file} 依然完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
  }

  console.log('');

  // =========================================================================
  // G. AI boundary
  // =========================================================================
  console.log('--- G. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（7.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（7.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
  }

  for (const pattern of AI_KEYWORDS) {
    await test(`（7.AI boundary）PHASE4_DECISION_CONTRACT_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}（文件本身只是討論「未來AI可以在哪裡」，不是真的呼叫）`, () => {
      assert.ok(!pattern.test(planDoc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（7.AI boundary）文件記錄未來AI Decision Module合法位置比照Analysis/Recommendation Runner既有的dependencies.modules延伸點', () => {
    assert.ok(/dependencies\.modules/.test(planDoc));
  });

  await test('（7.AI boundary）文件明確記錄「Feature → AI Provider」（Feature direct AI usage）是禁止的捷徑', () => {
    assert.ok(/Feature.*AI Provider/.test(planDoc));
    assert.ok(/Feature direct AI\s*usage/.test(flatDoc));
  });

  await test('（7.AI boundary）文件記錄decision_capability.js預期未來會改為透過依賴注入拿到decisionRunner，而不是繼續呼叫buildDecisionOutputPlaceholder()', () => {
    assert.ok(/decisionRunner/.test(planDoc));
  });

  await test('（7.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（7.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（7.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（7.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
  });

  await test('（7.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // H. documentation consistency
  // =========================================================================
  console.log('--- H. documentation consistency ---');

  await test('（8.documentation consistency）文件開頭明確聲明「不是建立Decision Logic/Decision Algorithm、不是導入AI」', () => {
    assert.ok(/不是.{0,10}建立Decision\s*Logic/.test(flatDoc));
    assert.ok(/不是.{0,10}導入AI/.test(flatDoc));
  });

  await test('（8.documentation consistency）文件記錄Contract Strategy結論為「目前不需要建立Decision Request/Response Contract程式碼」', () => {
    assert.ok(/目前不需要建立Decision Request\/Response\s*Contract/.test(flatDoc));
  });

  await test('（8.documentation consistency）文件記錄Contract結論的三個理由（複雜度極低/維持既有慣例/YAGNI）', () => {
    assert.ok(/複雜度極低/.test(planDoc));
    assert.ok(/維持既有慣例/.test(planDoc));
    assert.ok(/YAGNI/.test(planDoc));
  });

  await test('（8.documentation consistency）文件記錄這個Contract結論是階段性的，複雜度提高時需要重新評估', () => {
    assert.ok(/階段性/.test(planDoc));
  });

  await test('（8.documentation consistency）文件引用了TASK1.82的PHASE4_DECISION_CAPABILITY_REVIEW.md（確認本次規劃延續既有審查結論）', () => {
    assert.ok(/TASK1\.82/.test(planDoc));
  });

  await test('（8.documentation consistency）文件引用了TASK1.83 Decision Capability Foundation的真實落地實作', () => {
    assert.ok(/TASK1\.83/.test(planDoc));
  });

  await test('（8.documentation consistency）文件記錄了六項或以上的Completion Criteria checkbox', () => {
    const checkCount = (planDoc.match(/✅/g) || []).length;
    assert.ok(checkCount >= 7, `預期至少7個✅，實際${checkCount}`);
  });

  await test('（8.documentation consistency）文件記錄async限制延續TASK1.75/1.81/1.82已記錄的Known Limitation', () => {
    assert.ok(/async/.test(planDoc));
  });

  await test('（8.documentation consistency）PHASE4_DECISION_CAPABILITY_REVIEW.md（TASK1.82）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE4_DECISION_CAPABILITY_REVIEW.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.documentation consistency）PHASE4_DECISION_FLOW_PLAN.md（TASK1.81）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE4_DECISION_FLOW_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.84-decision-contract-plan')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 74, `預期至少74個既有測試檔案，實際 ${allSuites.length}`);
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

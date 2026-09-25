/*
 * Phase 4 TASK 1.85｜Decision Capability Integration Architecture
 * 測試
 *
 * 本任務不是建立Decision Logic/Decision Algorithm、不是導入AI——
 * 這是純規劃任務，確認Independent Decision Capability（TASK1.83）
 * 未來如何安全接入既有的Capability Orchestrator
 * Flow（TASK1.78），記錄在
 * `src/intelligence/PHASE4_DECISION_INTEGRATION_PLAN.md`，本次
 * **不修改**`capability_orchestrator.js`本身（規格明確禁止
 * 「修改Existing Capability Logic」）。
 *
 * 這份測試驗證的是：
 * - Capability Flow：Analysis→Recommendation→Decision確實可以
 *   形成單向資料流，端對端串接正確、無循環依賴、無跳層
 * - Decision Compatibility：Decision Capability依然正確消費
 *   Recommendation Result，跟TASK1.83/1.84的行為完全一致
 * - Orchestrator Boundary：capability_orchestrator.js確認維持
 *   未接線狀態，Unified Capability Result依然只有兩個欄位
 * - Dependency Scan：本次規劃沒有建立任何Decision
 *   Algorithm/Rule Engine/Scoring Logic/Weight/Threshold程式碼
 * - Runtime Isolation：Analysis/Recommendation Runner、Phase 2
 *   Runtime Orchestrator完全沒有被修改
 * - AI Boundary：文件正確記錄AI Extension Strategy在Orchestrator
 *   整合情境下依然成立
 * - Documentation Consistency：文件章節齊全、內容跟規格要求一致
 * - Regression/P1-P6
 *
 * 分為以下9個部分：
 * A) capability flow
 * B) decision compatibility
 * C) orchestrator boundary
 * D) dependency scan
 * E) runtime isolation
 * F) AI boundary
 * G) documentation consistency
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
const decisionCapabilityDir = path.join(capabilitiesDir, 'decision');
const planDocPath = path.join(intelDir, 'PHASE4_DECISION_INTEGRATION_PLAN.md');

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
  const { createDecisionCapability, buildDecisionOutputPlaceholder } = await import(path.join(decisionCapabilityDir, 'index.js'));
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
  const orchestratorSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
  const decisionCapabilitySrc = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
  const decisionResultBuilderSrc = readSrc(path.join(decisionCapabilityDir, 'decision_result_builder.js'));

  // =========================================================================
  // A. capability flow
  // =========================================================================
  console.log('--- A. capability flow ---');

  await test('（1.capability flow）src/intelligence/PHASE4_DECISION_INTEGRATION_PLAN.md 存在且內容非空', () => {
    assert.ok(fs.existsSync(planDocPath));
    assert.ok(planDoc.length > 1500);
  });

  const REQUIRED_DOC_SECTIONS = ['Integration Flow', 'Orchestrator Boundary', 'Decision Output Integration', 'Dependency Direction', 'AI Extension Strategy', 'Known Limitations'];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.capability flow）PHASE4_DECISION_INTEGRATION_PLAN.md包含「${section}」章節`, () => {
      assert.ok(planDoc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.capability flow）端對端：Analysis→Recommendation→Decision三段Capability可以形成單向資料流，全部用真實Runner/Capability串接正確運作', () => {
    const analysisCapability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const analysisOutcome = analysisCapability.requestAnalysis({ context: makeInsightContext() });
    assert.strictEqual(analysisOutcome.ok, true);
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const recommendationOutcome = recommendationCapability.requestRecommendation({ analysisResult: analysisOutcome.result });
    assert.strictEqual(recommendationOutcome.ok, true);
    const decisionCapability = createDecisionCapability();
    const decisionOutcome = decisionCapability.requestDecision({ recommendationResult: recommendationOutcome.result });
    assert.strictEqual(decisionOutcome.ok, true);
    assert.strictEqual(decisionOutcome.result.metadata.recommendationCount, DEFAULT_RECOMMENDATION_MODULES.length);
  });

  await test('（1.capability flow）端對端：Recommendation Capability的request形狀{analysisResult}恰好吃Analysis Capability回傳的result（形狀互相咬合，無需轉接層）', () => {
    const analysisCapability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const analysisOutcome = analysisCapability.requestAnalysis({ context: makeInsightContext() });
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    assert.doesNotThrow(() => recommendationCapability.requestRecommendation({ analysisResult: analysisOutcome.result }));
  });

  await test('（1.capability flow）端對端：Decision Capability的request形狀{recommendationResult}恰好吃Recommendation Capability回傳的result（形狀互相咬合，無需轉接層）', () => {
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const recommendationOutcome = recommendationCapability.requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    const decisionCapability = createDecisionCapability();
    assert.doesNotThrow(() => decisionCapability.requestDecision({ recommendationResult: recommendationOutcome.result }));
  });

  await test('（1.capability flow）Decision Capability完全不認識Analysis Capability的存在（不import、不接收Analysis Result形狀）', () => {
    assert.ok(!/from\s+['"].*\/analysis\//.test(decisionCapabilitySrc));
    assert.ok(!/analysisResult/.test(decisionCapabilitySrc));
  });

  await test('（1.capability flow）Analysis Capability完全不認識Decision Capability的存在（不import、原始碼不出現Decision字樣）', () => {
    const src = readSrc(path.join(analysisCapabilityDir, 'analysis_capability.js'));
    assert.ok(!/from\s+['"].*\/decision\//.test(src));
    assert.ok(!/Decision/.test(src));
  });

  await test('（1.capability flow）這條資料流沒有循環依賴——Recommendation Capability不import Decision Capability', () => {
    const src = readSrc(path.join(recommendationCapabilityDir, 'recommendation_capability.js'));
    assert.ok(!/from\s+['"].*\/decision\//.test(src));
  });

  await test('（1.capability flow）這條資料流沒有跳層——Decision Capability不直接import Analysis Runner/Recommendation Runner', () => {
    assert.ok(!/from\s+['"].*\/analysis\//.test(decisionCapabilitySrc));
    assert.ok(!/from\s+['"].*\/recommendation\//.test(decisionCapabilitySrc));
  });

  await test('（1.capability flow）文件記錄的Integration Flow跟真實程式碼的Request/Response形狀一致（{analysisResult}/{recommendationResult}）', () => {
    assert.ok(/analysisResult/.test(planDoc));
    assert.ok(/recommendationResult/.test(planDoc));
  });

  await test('（1.capability flow）文件確認結論為「可以」形成單向資料流', () => {
    assert.ok(/\*\*可以\*\*/.test(planDoc) || /可以.{0,10}形成單向資料流/.test(flatDoc));
  });

  console.log('');

  // =========================================================================
  // B. decision compatibility
  // =========================================================================
  console.log('--- B. decision compatibility ---');

  await test('（2.decision compatibility）端對端：Decision Capability依然正確消費真實Recommendation Result（跟TASK1.83/1.84行為完全一致）', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.status, 'decision_not_available');
    assert.strictEqual(result.result.decision, null);
  });

  await test('（2.decision compatibility）decision_capability.js/decision_result_builder.js本次規劃完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/decision/decision_capability.js src/intelligence/capabilities/decision/decision_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.decision compatibility）buildDecisionOutputPlaceholder()對不同recommendationCount輸入依然正確計數（沒有被本次規劃影響）', () => {
    for (const count of [0, 1, 5]) {
      const recommendations = Array.from({ length: count }, (_, i) => ({ type: `t${i}` }));
      const output = buildDecisionOutputPlaceholder(makeRecommendationResult({ recommendations }));
      assert.strictEqual(output.metadata.recommendationCount, count);
    }
  });

  await test('（2.decision compatibility）Decision Capability的decision欄位依然恆為null（本次規劃沒有加入任何實際決策內容）', () => {
    const capability = createDecisionCapability();
    for (const overrides of [{}, { recommendations: [] }, { recommendations: [{ type: 'a' }, { type: 'b' }] }]) {
      const result = capability.requestDecision({ recommendationResult: makeRecommendationResult(overrides) });
      assert.strictEqual(result.result.decision, null);
    }
  });

  await test('（2.decision compatibility）Decision Capability回傳物件恰好只有requestDecision一個公開介面（介面沒有被本次規劃擴充）', () => {
    const capability = createDecisionCapability();
    assert.deepStrictEqual(Object.keys(capability), ['requestDecision']);
  });

  await test('（2.decision compatibility）端對端：不同的Decision Capability實例對同一個Recommendation Result得到一致的結果（deterministic不變）', () => {
    const recommendationResult = makeRecommendationResult({ recommendations: [{ type: 'a' }, { type: 'b' }] });
    const capabilityA = createDecisionCapability();
    const capabilityB = createDecisionCapability();
    assert.deepStrictEqual(capabilityA.requestDecision({ recommendationResult }), capabilityB.requestDecision({ recommendationResult }));
  });

  console.log('');

  // =========================================================================
  // C. orchestrator boundary
  // =========================================================================
  console.log('--- C. orchestrator boundary ---');

  // TASK1.86後更新：TASK1.85當下（純規劃任務，規格明確禁止「修改
  // Existing Capability Logic」）capability_orchestrator.js/
  // capability_result_builder.js確實完全沒有被修改，維持未接線
  // 狀態。TASK1.86的規格明確允許「Orchestrator extension」（跟
  // TASK1.85不同），依照本次規劃文件記錄的設計圖正式落地了選填的
  // decisionCapability整合——這是規劃系列預期的下一步，不是回歸。
  // 這裡改為驗證TASK1.86依照本次規劃文件的設計圖正式落地。
  await test('（TASK1.86後更新）（3.orchestrator boundary）capability_orchestrator.js已由TASK1.86依照本次規劃文件記錄的設計圖正式修改（逐檔案git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/orchestration/capability_orchestrator.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.ok(diff.trim().length > 0, '預期capability_orchestrator.js已被TASK1.86修改');
  });

  await test('（TASK1.86後更新）（3.orchestrator boundary）capability_result_builder.js（orchestration）已由TASK1.86依照本次規劃文件記錄的設計圖正式修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/orchestration/capability_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.ok(diff.trim().length > 0, '預期capability_result_builder.js已被TASK1.86修改');
  });

  await test('（TASK1.86後更新）（3.orchestrator boundary）capability_orchestrator.js現在合法出現Decision相關字樣（TASK1.86正式把選填的decisionCapability接進Orchestrator，結束了本次規劃記錄的「未接線狀態」）', () => {
    const freshSrc = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
    assert.ok(/decisionCapability/.test(freshSrc));
  });

  await test('（3.orchestrator boundary）capability_orchestrator.js完全不import capabilities/decision/', () => {
    assert.ok(!/from\s+['"].*\/decision\//.test(orchestratorSrc));
  });

  await test('（3.orchestrator boundary）端對端：Capability Orchestrator依然只呼叫Analysis跟Recommendation Capability，Unified Capability Result恰好只有{analysis, recommendation}兩個欄位', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（3.orchestrator boundary）createCapabilityOrchestrator()回傳物件恰好只有requestCapabilityFlow一個公開介面（介面沒有被本次規劃擴充）', () => {
    const orchestrator = createCapabilityOrchestrator({ analysisCapability: {}, recommendationCapability: {} });
    assert.deepStrictEqual(Object.keys(orchestrator), ['requestCapabilityFlow']);
  });

  // TASK1.86後更新：這個測試在TASK1.85當下驗證的是「即使傳入
  // decisionCapability，Orchestrator目前依然忽略它」，因為當時
  // 規格明確禁止修改Orchestrator。TASK1.86依照本次規劃文件記錄的
  // 設計圖，正式讓Orchestrator在Recommendation成功後選擇性呼叫
  // decisionCapability——這是規劃系列預期的下一步，這裡反轉為驗證
  // 「現在傳入decisionCapability時，Orchestrator會正確呼叫它」。
  await test('（TASK1.86後更新）（3.orchestrator boundary）現在傳入decisionCapability依賴時，Orchestrator會正確呼叫它，Unified Capability Result多出decision欄位（TASK1.86依照本次規劃文件正式落地）', () => {
    let decisionCalled = false;
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
      decisionCapability: { requestDecision: () => { decisionCalled = true; return { ok: true, result: { status: 'x', decision: null, metadata: {} } }; } },
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(decisionCalled, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'decision', 'recommendation']);
  });

  await test('（3.orchestrator boundary）文件記錄結論為「維持未來Extension Point」，本次任務不修改capability_orchestrator.js', () => {
    assert.ok(/維持未來Extension Point/.test(planDoc));
  });

  await test('（3.orchestrator boundary）文件記錄了具體的擴充設計圖（decisionCapability作為選填依賴，向後相容）', () => {
    assert.ok(/decisionCapability/.test(planDoc));
    assert.ok(/選填/.test(planDoc));
    assert.ok(/向後相容/.test(planDoc));
  });

  await test('（3.orchestrator boundary）文件記錄的擴充設計圖裡的程式碼片段提及requestDecision(', () => {
    assert.ok(/requestDecision\(/.test(planDoc));
  });

  await test('（3.orchestrator boundary）文件記錄的擴充設計圖裡明確標註「本次不執行」（避免誤解為已經落地的程式碼）', () => {
    assert.ok(/本次不執行|不執行\)/.test(planDoc));
  });

  await test('（3.orchestrator boundary）端對端：不提供decisionCapability依賴時，Orchestrator不會拋出例外，正常回傳既有兩欄位結果', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
    assert.doesNotThrow(() => orchestrator.requestCapabilityFlow({ context: makeInsightContext() }));
  });

  // TASK1.86後更新：TASK1.85當下capability_orchestrator.js原始碼
  // 行數確實前後一致（零異動）。TASK1.86依照本次規劃文件的設計圖
  // 正式擴充了這個檔案，行數已合法改變——這裡改為驗證git
  // diff --stat確實回報了異動（不再是空字串），紀錄從「零異動」到
  // 「TASK1.86正式落地」的演進。
  await test('（TASK1.86後更新）（3.orchestrator boundary）capability_orchestrator.js的原始碼行數已由TASK1.86合法變動（git diff --stat確認確實有異動，非零字串）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/orchestration/capability_orchestrator.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.notStrictEqual(diff, '');
  });

  console.log('');

  // =========================================================================
  // D. dependency scan
  // =========================================================================
  console.log('--- D. dependency scan ---');

  await test('（4.dependency scan）本次規劃完全沒有建立任何名稱包含Algorithm/Engine/Rule的新.js程式碼檔案', () => {
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

  await test('（4.dependency scan）decision_capability.js/decision_result_builder.js完全不出現score/weight/threshold相關的計算邏輯', () => {
    for (const src of [decisionCapabilitySrc, decisionResultBuilderSrc]) {
      assert.ok(!/\.score\s*=/.test(src));
      assert.ok(!/\bweight\b/i.test(src));
      assert.ok(!/\bthreshold\b/i.test(src));
    }
  });

  await test('（4.dependency scan）capability_orchestrator.js完全不出現score/weight/threshold相關的計算邏輯（本次規劃沒有把判斷邏輯埋進Orchestrator）', () => {
    assert.ok(!/\.score\s*=/.test(orchestratorSrc));
    assert.ok(!/\bweight\b/i.test(orchestratorSrc));
    assert.ok(!/\bthreshold\b/i.test(orchestratorSrc));
  });

  await test('（4.dependency scan）PHASE4_DECISION_INTEGRATION_PLAN.md裡的擴充設計程式碼片段（純文件展示，不是真實可執行檔案）不包含任何score/weight/threshold計算', () => {
    assert.ok(!/\.score\s*=/.test(planDoc));
    assert.ok(!/\bweight\s*[:=]/i.test(planDoc));
    assert.ok(!/\bthreshold\s*[:=]/i.test(planDoc));
  });

  await test('（4.dependency scan）Phase 3 Application Layer（application/整個目錄樹）本次規劃完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  // TASK1.86後更新：這個斷言原本連同orchestration/一起比對，預期
  // 完全沒有異動。TASK1.86依照本次規劃文件記錄的設計圖，合法地
  // 修改了orchestration/底下的capability_orchestrator.js/
  // capability_result_builder.js——這是規劃系列預期的下一步，不是
  // 回歸。這裡改為只比對analysis/recommendation/decision三層
  // （本次任務確實沒有觸及的部分），orchestration/的異動已知合法、
  // 另有專屬斷言驗證。
  await test('（TASK1.86後更新）（4.dependency scan）三層既有Phase 4 Capability（analysis/recommendation/decision）本次規劃完全沒有任何檔案被新增或修改，TASK1.86擴充的orchestration/是規劃系列預期的下一步', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  const TASK1_86_MODIFIED_FILES = new Set(['orchestration/capability_orchestrator.js', 'orchestration/capability_result_builder.js']);

  for (const { layer, file, full } of ALL_PHASE4_FILES) {
    const key = `${layer}/${file}`;
    if (TASK1_86_MODIFIED_FILES.has(key)) {
      await test(`（TASK1.86後更新）（4.dependency scan）${key} 已由TASK1.86依照本次規劃文件的設計圖正式修改（不是回歸）`, () => {
        const relPath = path.relative(repoRoot, full);
        const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
        assert.ok(diff.trim().length > 0, `${key} 預期已被TASK1.86修改，但git diff為空`);
      });
      continue;
    }
    await test(`（4.dependency scan）${layer}/${file} 本次規劃完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  console.log('');

  // =========================================================================
  // E. runtime isolation
  // =========================================================================
  console.log('--- E. runtime isolation ---');

  await test('（5.runtime isolation）Analysis Runner本身（analysis_runner.js）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Recommendation Runner本身（recommendation_runner.js）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/，TASK1.45）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Execution Manager（src/intelligence/execution/）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/execution/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）Runtime Execution Layer（service/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）src/intelligence/index.js本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）src/intelligence/capabilities/index.js本次規劃完全沒有被修改（依然恰好4個namespace）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/capabilities/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['analysis', 'decision', 'orchestration', 'recommendation']);
  });

  await test('（5.runtime isolation）app.intelligence物件恰好維持24個欄位不變（本次規劃沒有新增任何bootstrap欄位）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（5.runtime isolation）src/bootstrap/application.js本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（5.runtime isolation）端對端：Insight跟Behavior兩個既有Feature在本次規劃後依然成功運作', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'analysis', 'recommendation', 'governance', 'events', 'monitoring'];
  for (const file of ['decision_capability.js', 'decision_result_builder.js', 'index.js']) {
    const src = readSrc(path.join(decisionCapabilityDir, file));
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（5.runtime isolation）capabilities/decision/${file} 依然完全不import src/intelligence/${subdir}/（本次規劃沒有改變既有邊界）`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
    await test(`（5.runtime isolation）capabilities/decision/${file} 依然完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（5.runtime isolation）capabilities/decision/${file} 依然完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
  }

  console.log('');

  // =========================================================================
  // F. AI boundary
  // =========================================================================
  console.log('--- F. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
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

  for (const pattern of AI_KEYWORDS) {
    await test(`（6.AI boundary）PHASE4_DECISION_INTEGRATION_PLAN.md不含實際的AI呼叫程式碼字樣 ${pattern}（文件本身只是討論「未來AI可以在哪裡」，不是真的呼叫）`, () => {
      assert.ok(!pattern.test(planDoc), `文件出現疑似真實AI呼叫字樣：${pattern}`);
    });
  }

  await test('（6.AI boundary）文件明確記錄「Feature → AI Provider」（Feature direct AI usage）在Orchestrator整合後依然完全禁止', () => {
    assert.ok(/Feature.*AI\s*Provider/.test(flatDoc));
    assert.ok(/Feature direct AI\s*usage/.test(flatDoc));
  });

  await test('（6.AI boundary）文件記錄Orchestrator只認識decisionCapability.requestDecision()這一個介面，AI實作細節完全被封裝', () => {
    assert.ok(/requestDecision\(\)/.test(planDoc));
  });

  await test('（6.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
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

  await test('（6.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
  });

  await test('（6.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // G. documentation consistency
  // =========================================================================
  console.log('--- G. documentation consistency ---');

  await test('（7.documentation consistency）文件開頭明確聲明「不是建立Decision Logic/Decision Algorithm、不是導入AI」', () => {
    assert.ok(/不是.{0,10}建立Decision\s*Logic/.test(flatDoc));
    assert.ok(/不是.{0,10}導入AI/.test(flatDoc));
  });

  await test('（7.documentation consistency）文件記錄Decision Output Integration章節裡decision欄位原樣放入result，不重新拆開改寫', () => {
    assert.ok(/不重新拆開或改寫/.test(planDoc));
  });

  await test('（7.documentation consistency）文件明確重申禁止加入實際決策內容——即使未來執行擴充，decision欄位在Algorithm建立前依然是佔位形狀', () => {
    assert.ok(/明確禁止加入實際決策內容/.test(planDoc));
  });

  await test('（7.documentation consistency）文件記錄了七項或以上的Completion Criteria checkbox', () => {
    const checkCount = (planDoc.match(/✅/g) || []).length;
    assert.ok(checkCount >= 7, `預期至少7個✅，實際${checkCount}`);
  });

  await test('（7.documentation consistency）文件引用了TASK1.78 Capability Orchestrator的既有README內容（跟Phase 2 Runtime Orchestrator的差異）', () => {
    assert.ok(/TASK1\.78/.test(planDoc));
  });

  await test('（7.documentation consistency）文件引用了TASK1.83 Decision Capability Foundation的真實落地實作', () => {
    assert.ok(/TASK1\.83/.test(planDoc));
  });

  await test('（7.documentation consistency）文件引用了TASK1.84 Decision Contract Plan的Contract結論延續', () => {
    assert.ok(/TASK1\.84|PHASE4_DECISION_CONTRACT_PLAN/.test(planDoc));
  });

  await test('（7.documentation consistency）文件記錄async限制延續TASK1.75/1.81/1.82/1.84已記錄的Known Limitation', () => {
    assert.ok(/async/.test(planDoc));
  });

  await test('（7.documentation consistency）PHASE4_DECISION_CONTRACT_PLAN.md（TASK1.84）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE4_DECISION_CONTRACT_PLAN.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.documentation consistency）PHASE4_DECISION_CAPABILITY_REVIEW.md（TASK1.82）本次規劃完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/PHASE4_DECISION_CAPABILITY_REVIEW.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.85-decision-integration')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（8.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 75, `預期至少75個既有測試檔案，實際 ${allSuites.length}`);
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

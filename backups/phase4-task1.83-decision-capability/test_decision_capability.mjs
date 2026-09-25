/*
 * Phase 4 TASK 1.83｜Decision Capability Foundation 測試
 *
 * 本任務不是建立Decision Algorithm、不是導入AI、不是建立自動決策
 * 邏輯——依照TASK1.82審查結論（建議選項B：Independent Decision
 * Capability），建立Phase 4第四個獨立的Intelligence Capability
 * Boundary，接收Recommendation Result、驗證輸入結構、產生結構化
 * 的Decision Output佔位形狀（`decision`欄位固定為`null`，不含任何
 * 判斷/評分/AI推論）。
 *
 * 這份測試驗證的是：
 * - decision_capability.js/decision_result_builder.js各自的
 *   boundary正確
 * - 端對端：Decision Capability可以正確消費真實Recommendation
 *   Capability（TASK1.77）產生的Recommendation Result
 * - Decision Output的結構正確（status/decision/metadata三欄位，
 *   decision永遠是null，metadata.recommendationCount正確反映輸入
 *   長度）
 * - Decision Capability完全獨立，不import任何其他Phase 4
 *   Capability，也不被Capability Orchestrator呼叫（本次任務沒有
 *   修改capability_orchestrator.js）
 * - Decision Capability完全不直接依賴database/auth/session/
 *   execution manager/history store/metrics store
 * - Analysis Runner/Recommendation Runner/Phase 2 Runtime
 *   Orchestrator/既有三層Phase 4 Capability本身完全沒有被修改
 * - 沒有任何判斷邏輯/評分邏輯/AI推論
 * - export一致性、regression、P1-P6
 *
 * 分為以下9個部分：
 * A) decision boundary
 * B) recommendation input compatibility
 * C) output structure
 * D) capability isolation
 * E) dependency scan
 * F) runtime isolation
 * G) no AI dependency
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

const DECISION_CAPABILITY_JS_FILES = ['decision_capability.js', 'decision_result_builder.js', 'index.js'];

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

async function run() {
  const { createDecisionCapability } = await import(path.join(decisionCapabilityDir, 'decision_capability.js'));
  const { createDecisionCapabilityResultBuilder, buildDecisionOutputPlaceholder, DECISION_OUTPUT_VERSION } = await import(path.join(decisionCapabilityDir, 'decision_result_builder.js'));
  await import(path.join(decisionCapabilityDir, 'index.js'));
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createAnalysisRunner, DEFAULT_ANALYSIS_MODULES } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner, DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(recommendationDir, 'index.js'));

  // =========================================================================
  // A. decision boundary
  // =========================================================================
  console.log('--- A. decision boundary ---');

  await test('（1.decision boundary）src/intelligence/capabilities/decision/ 恰好包含4個檔案（decision_capability/decision_result_builder/index/README）', () => {
    const files = fs.readdirSync(decisionCapabilityDir).sort();
    assert.deepStrictEqual(files, ['README.md', 'decision_capability.js', 'decision_result_builder.js', 'index.js']);
  });

  await test('（1.decision boundary）src/intelligence/capabilities/decision/README.md 存在且非空', () => {
    const readmePath = path.join(decisionCapabilityDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.decision boundary）src/intelligence/capabilities/README.md（頂層）內容有提到decision子namespace（TASK1.83新增）', () => {
    const content = fs.readFileSync(path.join(capabilitiesDir, 'README.md'), 'utf8');
    assert.ok(/decision/.test(content));
  });

  await test('（1.decision boundary）createDecisionCapability()回傳物件恰好只有requestDecision一個公開介面', () => {
    const capability = createDecisionCapability();
    assert.deepStrictEqual(Object.keys(capability), ['requestDecision']);
  });

  await test('（1.decision boundary）createDecisionCapabilityResultBuilder()回傳物件恰好只有buildSuccessResult/buildFailureResult兩個公開介面', () => {
    const builder = createDecisionCapabilityResultBuilder();
    assert.deepStrictEqual(Object.keys(builder).sort(), ['buildFailureResult', 'buildSuccessResult']);
  });

  await test('（1.decision boundary）requestDecision()是同步函式（跟Analysis/Recommendation Capability本身的同步簽名一致，回傳值不是Promise）', () => {
    const capability = createDecisionCapability();
    const returned = capability.requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(returned instanceof Promise, false);
  });

  await test('（1.decision boundary）requestDecision()不接受db/userId參數（跟Analysis/Recommendation Capability一樣完全不接觸database/auth）', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
    assert.ok(!/function requestDecision\(\s*db\s*,/.test(src));
  });

  await test('（1.decision boundary）requestDecision()合法輸入時正確產生結構化Decision Output', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'decision');
  });

  await test('（1.decision boundary）decision_capability.js的CAPABILITY_NAME常數固定為字面值"decision"', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
    assert.ok(/CAPABILITY_NAME\s*=\s*['"]decision['"]/.test(src));
  });

  await test('（1.decision boundary）decision_result_builder.js的CAPABILITY_NAME常數固定為字面值"decision"', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_result_builder.js'));
    assert.ok(/CAPABILITY_NAME\s*=\s*['"]decision['"]/.test(src));
  });

  await test('（1.decision boundary）decision_capability.js匯出createDecisionCapability具名函式', () => {
    const exports = getNamedExports(path.join(decisionCapabilityDir, 'decision_capability.js'));
    assert.ok(exports.has('createDecisionCapability'));
  });

  await test('（1.decision boundary）decision_result_builder.js匯出createDecisionCapabilityResultBuilder/buildDecisionOutputPlaceholder/DECISION_OUTPUT_VERSION三個具名項目', () => {
    const exports = getNamedExports(path.join(decisionCapabilityDir, 'decision_result_builder.js'));
    assert.ok(exports.has('createDecisionCapabilityResultBuilder'));
    assert.ok(exports.has('buildDecisionOutputPlaceholder'));
    assert.ok(exports.has('DECISION_OUTPUT_VERSION'));
  });

  await test('（1.decision boundary）requestDecision()缺少recommendationResult時回傳{ok:false, capability:"decision", reason:"invalid_recommendation_result"}', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({});
    assert.deepStrictEqual(result, { ok: false, capability: 'decision', reason: 'invalid_recommendation_result' });
  });

  await test('（1.decision boundary）requestDecision()的recommendationResult為null時回傳invalid_recommendation_result', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({ recommendationResult: null });
    assert.strictEqual(result.reason, 'invalid_recommendation_result');
  });

  await test('（1.decision boundary）requestDecision()的recommendationResult為陣列時回傳invalid_recommendation_result', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({ recommendationResult: [] });
    assert.strictEqual(result.reason, 'invalid_recommendation_result');
  });

  await test('（1.decision boundary）requestDecision()的recommendationResult為字串時回傳invalid_recommendation_result', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({ recommendationResult: 'not an object' });
    assert.strictEqual(result.reason, 'invalid_recommendation_result');
  });

  for (const bad of [42, true, 'x', Symbol('x'), undefined]) {
    await test(`（1.decision boundary）requestDecision()的recommendationResult為${String(bad)}（${typeof bad}）時安全回傳invalid_recommendation_result，不拋出例外`, () => {
      const capability = createDecisionCapability();
      assert.doesNotThrow(() => capability.requestDecision({ recommendationResult: bad }));
      const result = capability.requestDecision({ recommendationResult: bad });
      assert.strictEqual(result.reason, 'invalid_recommendation_result');
    });
  }

  await test('（1.decision boundary）requestDecision(null)不拋出例外，回傳invalid_request', () => {
    const capability = createDecisionCapability();
    assert.doesNotThrow(() => capability.requestDecision(null));
    const result = capability.requestDecision(null);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.decision boundary）requestDecision("not an object")回傳invalid_request', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision('not an object');
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.decision boundary）requestDecision([])回傳invalid_request（陣列不是合法request）', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision([]);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.decision boundary）requestDecision(undefined)回傳invalid_request', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision(undefined);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.decision boundary）requestDecision(42)回傳invalid_request', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision(42);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.decision boundary）不同的Decision Capability實例各自獨立（不是共用singleton）', () => {
    const capabilityA = createDecisionCapability();
    const capabilityB = createDecisionCapability();
    assert.notStrictEqual(capabilityA, capabilityB);
  });

  await test('（1.decision boundary）createDecisionCapability()可以自訂resultBuilder（依賴注入）', () => {
    let customCalled = false;
    const customBuilder = { buildSuccessResult: () => ({}), buildFailureResult: (reason) => { customCalled = true; return { ok: false, capability: 'decision', reason: `custom:${reason}` }; } };
    const capability = createDecisionCapability({ resultBuilder: customBuilder });
    const result = capability.requestDecision({});
    assert.strictEqual(customCalled, true);
    assert.strictEqual(result.reason, 'custom:invalid_recommendation_result');
  });

  await test('（1.decision boundary）createDecisionCapability()沒有提供resultBuilder時，內部自動建立一個預設的（跟直接呼叫createDecisionCapabilityResultBuilder()行為一致）', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({});
    const builder = createDecisionCapabilityResultBuilder();
    assert.deepStrictEqual(result, builder.buildFailureResult('invalid_recommendation_result'));
  });

  await test('（1.decision boundary）dependencies為undefined時不拋出例外，正常運作（Decision Capability沒有必要的依賴，跟Analysis/Recommendation Capability需要runner不同）', () => {
    const capability = createDecisionCapability();
    assert.doesNotThrow(() => capability.requestDecision({ recommendationResult: makeRecommendationResult() }));
    const result = capability.requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
  });

  await test('（1.decision boundary）dependencies為{}時正常運作', () => {
    const capability = createDecisionCapability({});
    const result = capability.requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.ok, true);
  });

  await test('（1.decision boundary）失敗結果一律恰好只有ok/capability/reason（沒有field時）三個欄位', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({});
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'reason']);
  });

  await test('（1.decision boundary）成功結果一律恰好只有ok/capability/result三個欄位', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'result']);
  });

  await test('（1.decision boundary）失敗結果的capability欄位固定為"decision"字面值', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({});
    assert.strictEqual(result.capability, 'decision');
  });

  await test('（1.decision boundary）成功結果的capability欄位固定為"decision"字面值', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(result.capability, 'decision');
  });

  await test('（1.decision boundary）requestDecision()的request物件不會被修改（沒有side effect）', () => {
    const capability = createDecisionCapability();
    const request = { recommendationResult: makeRecommendationResult() };
    const requestCopy = JSON.parse(JSON.stringify(request));
    capability.requestDecision(request);
    assert.deepStrictEqual(request, requestCopy);
  });

  await test('（1.decision boundary）requestDecision()呼叫恰好一次不會重試或重複執行任何內部邏輯（純函式特性，多次呼叫互不影響）', () => {
    const capability = createDecisionCapability();
    const request = { recommendationResult: makeRecommendationResult() };
    const first = capability.requestDecision(request);
    const second = capability.requestDecision(request);
    assert.deepStrictEqual(first, second);
    assert.notStrictEqual(first, second);
  });

  await test('（1.decision boundary）requestDecision()額外多餘的欄位（例如request.extra）不影響驗證結果，仍然正常運作（多餘欄位被忽略）', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({ recommendationResult: makeRecommendationResult(), extra: 'ignored' });
    assert.strictEqual(result.ok, true);
  });

  for (const badValue of [() => {}, new Date(), new Map()]) {
    await test(`（1.decision boundary）requestDecision()的recommendationResult為${badValue.constructor.name}實例時，形狀檢查只認object typeof，Function類型回傳invalid_recommendation_result、其餘視為合法物件通過驗證`, () => {
      const capability = createDecisionCapability();
      const result = capability.requestDecision({ recommendationResult: badValue });
      if (typeof badValue === 'function') {
        assert.strictEqual(result.reason, 'invalid_recommendation_result');
      } else {
        assert.strictEqual(result.ok, true);
      }
    });
  }

  await test('（1.decision boundary）createDecisionCapability()回傳的requestDecision是一個函式', () => {
    const capability = createDecisionCapability();
    assert.strictEqual(typeof capability.requestDecision, 'function');
  });

  console.log('');

  // =========================================================================
  // B. recommendation input compatibility
  // =========================================================================
  console.log('--- B. recommendation input compatibility ---');

  await test('（2.recommendation input compatibility）端對端：真實Recommendation Capability（TASK1.77）產生的result可以直接餵給Decision Capability，正確運作', () => {
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
    const recommendationOutcome = recommendationCapability.requestRecommendation({ analysisResult: { status: 'analysis_ready', insights: [{ type: 'x', value: 1, source: 'y' }], metadata: {} } });
    assert.strictEqual(recommendationOutcome.ok, true);
    const decisionCapability = createDecisionCapability();
    const decisionOutcome = decisionCapability.requestDecision({ recommendationResult: recommendationOutcome.result });
    assert.strictEqual(decisionOutcome.ok, true);
    assert.strictEqual(decisionOutcome.result.status, 'decision_not_available');
  });

  await test('（2.recommendation input compatibility）端對端：完整鏈路Analysis→Recommendation→Decision全部用真實Runner/Capability串接，正確運作', () => {
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

  await test('（2.recommendation input compatibility）Recommendation Runner本身（recommendation_runner.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/recommendation/recommendation_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.recommendation input compatibility）Analysis Runner本身（analysis_runner.js）本次任務完全沒有被修改（規格明確禁止修改Analysis Runner）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/analysis/analysis_runner.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.recommendation input compatibility）Recommendation Capability本身（recommendation_capability.js/recommendation_capability_result_builder.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/recommendation/recommendation_capability.js src/intelligence/capabilities/recommendation/recommendation_capability_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const RECOMMENDATION_INPUT_VARIANTS = [
    { label: '預設', overrides: {} },
    { label: '空陣列', overrides: { recommendations: [] } },
    { label: '三筆候選項', overrides: { recommendations: [{ type: 'a' }, { type: 'b' }, { type: 'c' }] } },
    { label: '非標準status', overrides: { status: 'partial' } },
  ];
  for (const { label, overrides } of RECOMMENDATION_INPUT_VARIANTS) {
    await test(`（2.recommendation input compatibility）端對端：Recommendation Result輸入為「${label}」情況時，Decision Capability都能正確消費`, () => {
      const capability = createDecisionCapability();
      const result = capability.requestDecision({ recommendationResult: makeRecommendationResult(overrides) });
      assert.strictEqual(result.ok, true);
    });
  }

  await test('（2.recommendation input compatibility）端對端：recommendationResult.recommendations為空陣列時，Decision Capability依然正確運作，recommendationCount為0', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({ recommendationResult: makeRecommendationResult({ recommendations: [] }) });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.metadata.recommendationCount, 0);
  });

  await test('（2.recommendation input compatibility）端對端：recommendationResult.recommendations欄位缺失時（不是標準形狀），Decision Capability依然安全運作，recommendationCount正規化為0', () => {
    const capability = createDecisionCapability();
    const result = capability.requestDecision({ recommendationResult: { status: 'x', metadata: {} } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.metadata.recommendationCount, 0);
  });

  await test('（2.recommendation input compatibility）端對端：真實Analysis Capability失敗時（例如context缺少必要欄位），不會影響Decision Capability本身的獨立運作（Decision Capability完全不依賴上游是否成功，只依賴收到的recommendationResult形狀）', () => {
    const analysisCapability = createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
    const analysisOutcome = analysisCapability.requestAnalysis({ context: { user: null } });
    assert.strictEqual(analysisOutcome.ok, false);
    const decisionCapability = createDecisionCapability();
    const decisionOutcome = decisionCapability.requestDecision({ recommendationResult: makeRecommendationResult() });
    assert.strictEqual(decisionOutcome.ok, true);
  });

  await test('（2.recommendation input compatibility）端對端：多次獨立建立的Decision Capability實例對同一個Recommendation Result都得到一致的結果（deterministic、不共用狀態）', () => {
    const recommendationResult = makeRecommendationResult({ recommendations: [{ type: 'a' }, { type: 'b' }] });
    const capabilityA = createDecisionCapability();
    const capabilityB = createDecisionCapability();
    assert.deepStrictEqual(capabilityA.requestDecision({ recommendationResult }), capabilityB.requestDecision({ recommendationResult }));
  });

  await test('（2.recommendation input compatibility）端對端：透過src/intelligence/index.js的頂層capabilities.decision跟直接import capabilities/decision/index.js得到一致的行為', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    const directCapability = createDecisionCapability();
    const viaTopLevel = intelModule.capabilities.decision.createDecisionCapability();
    const recommendationResult = makeRecommendationResult();
    assert.deepStrictEqual(directCapability.requestDecision({ recommendationResult }), viaTopLevel.requestDecision({ recommendationResult }));
  });

  await test('（2.recommendation input compatibility）端對端：注入自訂Recommendation modules（未來AI Extension Point）產生的result，Decision Capability依然正確消費', () => {
    const recommendationCapability = createRecommendationCapability({ recommendationRunner: createRecommendationRunner({ modules: [() => ({ type: 'custom', value: 1, source: 'x' }), () => ({ type: 'custom2', value: 2, source: 'y' })] }) });
    const recommendationOutcome = recommendationCapability.requestRecommendation({ analysisResult: { status: 'x', insights: [], metadata: {} } });
    const decisionCapability = createDecisionCapability();
    const decisionOutcome = decisionCapability.requestDecision({ recommendationResult: recommendationOutcome.result });
    assert.strictEqual(decisionOutcome.ok, true);
    assert.strictEqual(decisionOutcome.result.metadata.recommendationCount, 2);
  });

  console.log('');

  // =========================================================================
  // C. output structure
  // =========================================================================
  console.log('--- C. output structure ---');

  await test('（3.output structure）buildDecisionOutputPlaceholder()回傳恰好三個欄位：status/decision/metadata', () => {
    const output = buildDecisionOutputPlaceholder(makeRecommendationResult());
    assert.deepStrictEqual(Object.keys(output).sort(), ['decision', 'metadata', 'status']);
  });

  await test('（3.output structure）buildDecisionOutputPlaceholder()的status固定為"decision_not_available"', () => {
    const output = buildDecisionOutputPlaceholder(makeRecommendationResult());
    assert.strictEqual(output.status, 'decision_not_available');
  });

  const DECISION_NULL_VARIANTS = [
    { label: '預設', overrides: {} },
    { label: '空recommendations', overrides: { recommendations: [] } },
    { label: '四筆candidate', overrides: { recommendations: [{ type: 'a' }, { type: 'b' }, { type: 'c' }, { type: 'd' }] } },
  ];
  for (const { label, overrides } of DECISION_NULL_VARIANTS) {
    await test(`（3.output structure）buildDecisionOutputPlaceholder()的decision欄位在「${label}」情況下依然永遠是null（沒有任何判斷/評分/AI推論產生實際決策）`, () => {
      const output = buildDecisionOutputPlaceholder(makeRecommendationResult(overrides));
      assert.strictEqual(output.decision, null);
    });
  }

  await test('（3.output structure）buildDecisionOutputPlaceholder()的metadata.version等於DECISION_OUTPUT_VERSION', () => {
    const output = buildDecisionOutputPlaceholder(makeRecommendationResult());
    assert.strictEqual(output.metadata.version, DECISION_OUTPUT_VERSION);
  });

  await test('（3.output structure）DECISION_OUTPUT_VERSION是字串且格式符合語意化版本（x.y.z）', () => {
    assert.strictEqual(typeof DECISION_OUTPUT_VERSION, 'string');
    assert.ok(/^\d+\.\d+\.\d+$/.test(DECISION_OUTPUT_VERSION));
  });

  for (const count of [0, 1, 2, 3, 5, 10, 50]) {
    await test(`（3.output structure）buildDecisionOutputPlaceholder()的metadata.recommendationCount正確反映輸入recommendations陣列長度為${count}時的情況`, () => {
      const recommendations = Array.from({ length: count }, (_, i) => ({ type: `t${i}`, value: i, source: 's' }));
      const output = buildDecisionOutputPlaceholder(makeRecommendationResult({ recommendations }));
      assert.strictEqual(output.metadata.recommendationCount, count);
    });
  }

  await test('（3.output structure）buildDecisionOutputPlaceholder(undefined)安全正規化，不拋出例外，recommendationCount為0', () => {
    assert.doesNotThrow(() => buildDecisionOutputPlaceholder(undefined));
    const output = buildDecisionOutputPlaceholder(undefined);
    assert.strictEqual(output.decision, null);
    assert.strictEqual(output.metadata.recommendationCount, 0);
  });

  await test('（3.output structure）buildDecisionOutputPlaceholder(null)安全正規化，recommendationCount為0', () => {
    const output = buildDecisionOutputPlaceholder(null);
    assert.strictEqual(output.metadata.recommendationCount, 0);
  });

  await test('（3.output structure）buildDecisionOutputPlaceholder()是deterministic的——同樣輸入永遠得到完全相同的輸出', () => {
    const input = makeRecommendationResult({ recommendations: [{ type: 'a', value: 1, source: 'x' }] });
    assert.deepStrictEqual(buildDecisionOutputPlaceholder(input), buildDecisionOutputPlaceholder(input));
  });

  await test('（3.output structure）buildDecisionOutputPlaceholder()完全不修改傳入的recommendationResult物件（沒有side effect）', () => {
    const input = makeRecommendationResult();
    const inputCopy = JSON.parse(JSON.stringify(input));
    buildDecisionOutputPlaceholder(input);
    assert.deepStrictEqual(input, inputCopy);
  });

  await test('（3.output structure）buildSuccessResult()保留Decision Output原本的{status,decision,metadata}形狀，不重新拆開組裝', () => {
    const builder = createDecisionCapabilityResultBuilder();
    const decisionOutput = { status: 'decision_not_available', decision: null, metadata: { version: '1.0.0', recommendationCount: 3 } };
    const result = builder.buildSuccessResult(decisionOutput);
    assert.deepStrictEqual(result, { ok: true, capability: 'decision', result: decisionOutput });
  });

  await test('（3.output structure）buildSuccessResult()的result參照跟傳入的decisionOutput完全相同（不做深拷貝）', () => {
    const builder = createDecisionCapabilityResultBuilder();
    const decisionOutput = { status: 'x', decision: null, metadata: {} };
    const result = builder.buildSuccessResult(decisionOutput);
    assert.strictEqual(result.result, decisionOutput);
  });

  await test('（3.output structure）buildSuccessResult(undefined)安全正規化為{}，不拋出例外', () => {
    const builder = createDecisionCapabilityResultBuilder();
    assert.doesNotThrow(() => builder.buildSuccessResult(undefined));
    assert.deepStrictEqual(builder.buildSuccessResult(undefined), { ok: true, capability: 'decision', result: {} });
  });

  await test('（3.output structure）buildFailureResult(reason)不提供field時，回傳物件不含field欄位', () => {
    const builder = createDecisionCapabilityResultBuilder();
    const result = builder.buildFailureResult('invalid_recommendation_result');
    assert.deepStrictEqual(Object.keys(result).sort(), ['capability', 'ok', 'reason']);
  });

  await test('（3.output structure）buildFailureResult(reason, field)提供field時，回傳物件包含field欄位', () => {
    const builder = createDecisionCapabilityResultBuilder();
    const result = builder.buildFailureResult('invalid_field_type', 'status');
    assert.deepStrictEqual(result, { ok: false, capability: 'decision', reason: 'invalid_field_type', field: 'status' });
  });

  await test('（3.output structure）buildFailureResult(非字串reason)安全正規化為unknown_error', () => {
    const builder = createDecisionCapabilityResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(123), { ok: false, capability: 'decision', reason: 'unknown_error' });
    assert.deepStrictEqual(builder.buildFailureResult(undefined), { ok: false, capability: 'decision', reason: 'unknown_error' });
  });

  await test('（3.output structure）buildFailureResult(reason, 非字串field)忽略非法field，不加入field欄位', () => {
    const builder = createDecisionCapabilityResultBuilder();
    const result = builder.buildFailureResult('x', 123);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'field'), false);
  });

  await test('（3.output structure）buildFailureResult(reason, 空字串field)忽略空字串field，不加入field欄位', () => {
    const builder = createDecisionCapabilityResultBuilder();
    const result = builder.buildFailureResult('x', '');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'field'), false);
  });

  await test('（3.output structure）不同的Decision Capability Result Builder實例各自獨立（不是共用singleton）', () => {
    const builderA = createDecisionCapabilityResultBuilder();
    const builderB = createDecisionCapabilityResultBuilder();
    assert.notStrictEqual(builderA, builderB);
  });

  await test('（3.output structure）createDecisionCapabilityResultBuilder(任何參數)都回傳相同介面（不接受依賴注入）', () => {
    const builderA = createDecisionCapabilityResultBuilder();
    const builderB = createDecisionCapabilityResultBuilder({ ignored: 'value' });
    assert.deepStrictEqual(Object.keys(builderA), Object.keys(builderB));
  });

  await test('（3.output structure）buildDecisionOutputPlaceholder()對已知的失敗reason（invalid_recommendation_result等）搭配buildFailureResult()都能正確轉發', () => {
    const builder = createDecisionCapabilityResultBuilder();
    for (const reason of ['invalid_recommendation_result', 'invalid_request', 'unknown_error']) {
      const result = builder.buildFailureResult(reason);
      assert.strictEqual(result.reason, reason);
    }
  });

  await test('（3.output structure）buildDecisionOutputPlaceholder()對recommendations陣列裡每一筆內容不做任何讀取（只讀取.length，不解讀type/value/source欄位），驗證不做判斷邏輯', () => {
    const proxyRecommendations = new Proxy([{ type: 'a' }, { type: 'b' }], {
      get(target, prop) {
        if (prop !== 'length' && typeof prop === 'string' && !Number.isNaN(Number(prop))) {
          throw new Error(`不應該讀取recommendations陣列的索引${prop}`);
        }
        return target[prop];
      },
    });
    assert.doesNotThrow(() => buildDecisionOutputPlaceholder({ recommendations: proxyRecommendations }));
  });

  await test('（3.output structure）requestDecision()回傳的result.decision欄位對多種recommendationResult輸入都恆為null（不因輸入內容不同而產生任何實際決策）', () => {
    const capability = createDecisionCapability();
    for (const overrides of [{ recommendations: [] }, { recommendations: [{ type: 'a', value: 999 }] }, { status: 'weird_status' }]) {
      const result = capability.requestDecision({ recommendationResult: makeRecommendationResult(overrides) });
      assert.strictEqual(result.result.decision, null);
    }
  });

  await test('（3.output structure）requestDecision()回傳的result.status恆為"decision_not_available"，不因輸入內容不同而改變', () => {
    const capability = createDecisionCapability();
    for (const overrides of [{ recommendations: [] }, { recommendations: [{ type: 'a' }, { type: 'b' }, { type: 'c' }] }]) {
      const result = capability.requestDecision({ recommendationResult: makeRecommendationResult(overrides) });
      assert.strictEqual(result.result.status, 'decision_not_available');
    }
  });

  console.log('');

  // =========================================================================
  // D. capability isolation
  // =========================================================================
  console.log('--- D. capability isolation ---');

  for (const file of DECISION_CAPABILITY_JS_FILES) {
    await test(`（4.capability isolation）capabilities/decision/${file} 完全不import capabilities/analysis/、capabilities/recommendation/、capabilities/orchestration/（四個Phase 4 Capability互不import）`, () => {
      const src = readSrc(path.join(decisionCapabilityDir, file));
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('./'), `${file}出現非同目錄的相對路徑import：${imp}`);
      }
    });
    await test(`（4.capability isolation）capabilities/decision/${file} 完全不import src/intelligence/application/（不認識Phase 3 Application Layer的存在）`, () => {
      assert.ok(!/from\s+['"].*\/application\//.test(readSrc(path.join(decisionCapabilityDir, file))));
    });
    await test(`（4.capability isolation）capabilities/decision/${file} 完全不出現INSIGHT_DOMAIN/BEHAVIOR_DOMAIN/insightFeature/behaviorFeature等既有Feature domain識別字樣`, () => {
      const src = readSrc(path.join(decisionCapabilityDir, file));
      assert.ok(!/INSIGHT_DOMAIN/.test(src));
      assert.ok(!/BEHAVIOR_DOMAIN/.test(src));
      assert.ok(!/insightFeature/.test(src));
      assert.ok(!/behaviorFeature/.test(src));
    });
    await test(`（4.capability isolation）capabilities/decision/${file} 完全不import features/insight/或features/behavior/或features/intelligence/`, () => {
      const src = readSrc(path.join(decisionCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/insight\//.test(src));
      assert.ok(!/from\s+['"].*\/behavior\//.test(src));
      assert.ok(!/from\s+['"].*\/intelligence_feature/.test(src));
    });
  }

  await test('（4.capability isolation）Analysis Capability（analysis_capability.js/analysis_capability_result_builder.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/analysis/analysis_capability.js src/intelligence/capabilities/analysis/analysis_capability_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.capability isolation）Recommendation Capability（recommendation_capability.js/recommendation_capability_result_builder.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/capabilities/recommendation/recommendation_capability.js src/intelligence/capabilities/recommendation/recommendation_capability_result_builder.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  // TASK1.86後更新：TASK1.83當下規格明確禁止「修改Existing
  // Capability Logic」，capability_orchestrator.js/capability_
  // result_builder.js確實完全沒有被修改，requestCapabilityFlow()
  // 當時只呼叫Analysis/Recommendation Capability。TASK1.86的規格
  // 明確允許「Orchestrator extension」（跟TASK1.83不同），依照
  // TASK1.85規劃結論正式把選填的decisionCapability整合進這兩個
  // 檔案——這是規劃系列預期的下一步，不是TASK1.83造成的回歸，也
  // 不代表TASK1.83自己違反了當時的規格（歷史上這條斷言在TASK1.83
  // 完成當下是逐字成立的）。這裡改為驗證TASK1.86依照後續規格正式
  // 落地了這個擴充。
  // 注意：不用即時git diff判斷「曾被修改」——TASK1.86的commit落地
  // 後，working tree對HEAD的diff永遠是空的，改用穩定的內容訊號。
  await test('（TASK1.86後更新）（4.capability isolation）Capability Orchestrator（capability_orchestrator.js/capability_result_builder.js）已由TASK1.86依照TASK1.86規格（明確允許Orchestrator extension，跟TASK1.83的規格不同）正式修改，新增選填的decisionCapability整合', () => {
    const orchestratorContent = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
    const resultBuilderContent = readSrc(path.join(orchestrationCapabilityDir, 'capability_result_builder.js'));
    assert.ok(/decisionCapability/.test(orchestratorContent), '預期capability_orchestrator.js包含decisionCapability依賴注入');
    assert.ok(/decisionResult/.test(resultBuilderContent), '預期capability_result_builder.js包含decisionResult參數');
  });

  await test('（TASK1.86後更新）（4.capability isolation）capability_orchestrator.js現在合法出現Decision相關字樣（TASK1.86正式把選填的decisionCapability接進Orchestrator）', () => {
    const src = readSrc(path.join(orchestrationCapabilityDir, 'capability_orchestrator.js'));
    assert.ok(/decisionCapability/.test(src));
  });

  await test('（4.capability isolation）Feature Integration（intelligence_feature.js/intelligence_feature_result_mapper.js）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/application/features/intelligence/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.capability isolation）intelligence_feature.js完全不出現Decision相關字樣（本次任務沒有把Decision Capability接進Feature層）', () => {
    const src = readSrc(path.join(intelligenceFeatureDir, 'intelligence_feature.js'));
    assert.ok(!/Decision/.test(src));
  });

  await test('（4.capability isolation）Insight/Behavior Feature本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/application/features/insight_feature.js src/intelligence/application/features/insight/ src/intelligence/application/features/behavior/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.capability isolation）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（4.capability isolation）src/bootstrap/application.js本次任務完全沒有被修改（Decision Capability沒有接進既有intelligence物件）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.capability isolation）app.intelligence物件恰好維持24個欄位不變（本次任務沒有新增任何bootstrap欄位，Decision Capability是獨立extension point）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（4.capability isolation）端對端：Insight跟Behavior兩個既有Feature在本次任務後依然成功運作（未受Decision Capability新增影響）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const insightResult = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const behaviorResult = await app.intelligence.behaviorFeature.requestBehavior({}, { userId: 'u1' });
    assert.strictEqual(insightResult.ok, true);
    assert.strictEqual(behaviorResult.ok, true);
  });

  await test('（4.capability isolation）端對端：Capability Orchestrator（TASK1.78）依然只回傳{analysis, recommendation}兩個欄位，本次任務沒有新增decision欄位（沒有修改Orchestrator）', () => {
    const orchestrator = createCapabilityOrchestrator({
      analysisCapability: createAnalysisCapability({ analysisRunner: createAnalysisRunner() }),
      recommendationCapability: createRecommendationCapability({ recommendationRunner: createRecommendationRunner() }),
    });
    const result = orchestrator.requestCapabilityFlow({ context: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（4.capability isolation）capabilities/decision/index.js完整re-export了createDecisionCapability/createDecisionCapabilityResultBuilder/buildDecisionOutputPlaceholder/DECISION_OUTPUT_VERSION，沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(decisionCapabilityDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['DECISION_OUTPUT_VERSION', 'buildDecisionOutputPlaceholder', 'createDecisionCapability', 'createDecisionCapabilityResultBuilder']);
  });

  await test('（4.capability isolation）capabilities/decision/index.js re-export的名稱在對應來源檔案裡確實存在', () => {
    const indexSrc = readSrc(path.join(decisionCapabilityDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(decisionCapabilityDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（4.capability isolation）src/intelligence/capabilities/index.js（頂層）恰好新增了decision namespace，跟既有analysis/recommendation/orchestration三個namespace並存，共四個', () => {
    const namespaces = getReExportedNamespaces(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...namespaces].sort(), ['analysis', 'decision', 'orchestration', 'recommendation']);
  });

  await test('（4.capability isolation）import後，capabilitiesModule.decision是非空物件，具備createDecisionCapability/createDecisionCapabilityResultBuilder', async () => {
    const capabilitiesModule = await import(path.join(capabilitiesDir, 'index.js'));
    assert.strictEqual(typeof capabilitiesModule.decision.createDecisionCapability, 'function');
    assert.strictEqual(typeof capabilitiesModule.decision.createDecisionCapabilityResultBuilder, 'function');
  });

  await test('（4.capability isolation）import後，capabilitiesModule.analysis/recommendation/orchestration依然完好（TASK1.76/1.77/1.78沒有被本次修改影響）', async () => {
    const capabilitiesModule = await import(path.join(capabilitiesDir, 'index.js'));
    assert.strictEqual(typeof capabilitiesModule.analysis.createAnalysisCapability, 'function');
    assert.strictEqual(typeof capabilitiesModule.recommendation.createRecommendationCapability, 'function');
    assert.strictEqual(typeof capabilitiesModule.orchestration.createCapabilityOrchestrator, 'function');
  });

  await test('（4.capability isolation）src/intelligence/index.js有export * as capabilities from ./capabilities/index.js（本次沒有新增/修改這一行，TASK1.76已建立）', () => {
    const src = readSrc(path.join(intelDir, 'index.js'));
    assert.ok(/export \* as capabilities from ['"]\.\/capabilities\/index\.js['"]/.test(src));
  });

  await test('（4.capability isolation）src/intelligence/index.js本次任務完全沒有被修改（頂層capabilities namespace是TASK1.76已建立的，本次只新增nested的decision子目錄）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/index.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（4.capability isolation）頂層capabilities.analysis/recommendation/orchestration/decision是四個完全不同、互不覆蓋的namespace（各自具備獨立的create函式）', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    assert.strictEqual(typeof intelModule.capabilities.analysis.createAnalysisCapability, 'function');
    assert.strictEqual(typeof intelModule.capabilities.recommendation.createRecommendationCapability, 'function');
    assert.strictEqual(typeof intelModule.capabilities.orchestration.createCapabilityOrchestrator, 'function');
    assert.strictEqual(typeof intelModule.capabilities.decision.createDecisionCapability, 'function');
    assert.strictEqual(typeof intelModule.capabilities.decision.createAnalysisCapability, 'undefined');
    assert.strictEqual(typeof intelModule.capabilities.decision.createRecommendationCapability, 'undefined');
    assert.strictEqual(typeof intelModule.capabilities.decision.createCapabilityOrchestrator, 'undefined');
    assert.strictEqual(typeof intelModule.capabilities.analysis.createDecisionCapability, 'undefined');
    assert.strictEqual(typeof intelModule.capabilities.recommendation.createDecisionCapability, 'undefined');
    assert.strictEqual(typeof intelModule.capabilities.orchestration.createDecisionCapability, 'undefined');
  });

  await test('（4.capability isolation）src/intelligence/index.js跟application/index.js各自的capabilities namespace互不污染（頂層capabilities.decision跟application.capabilities.createInsightCapability是不同的東西）', async () => {
    const intelModule = await import(path.join(intelDir, 'index.js'));
    assert.strictEqual(typeof intelModule.capabilities.createInsightCapability, 'undefined');
    assert.strictEqual(typeof intelModule.application.capabilities.createInsightCapability, 'function');
    assert.strictEqual(typeof intelModule.application.capabilities.createDecisionCapability, 'undefined');
  });

  await test('（4.capability isolation）decision_capability.js唯一的相對路徑import是./decision_result_builder.js', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./decision_result_builder.js']);
  });

  await test('（4.capability isolation）decision_result_builder.js完全零相依（沒有任何import）', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_result_builder.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（4.capability isolation）decision/README.md內容有描述架構位置（Feature → Capability Orchestrator → Recommendation Capability → Decision Capability → Decision Output）', () => {
    const content = fs.readFileSync(path.join(decisionCapabilityDir, 'README.md'), 'utf8');
    assert.ok(/Capability Orchestrator/.test(content));
    assert.ok(/Recommendation Capability/.test(content));
    assert.ok(/Decision Output/.test(content));
  });

  await test('（4.capability isolation）decision/README.md內容有引用TASK1.82審查結論（選項B）', () => {
    const content = fs.readFileSync(path.join(decisionCapabilityDir, 'README.md'), 'utf8');
    assert.ok(/選項B|TASK1\.82/.test(content));
  });

  await test('（4.capability isolation）src/intelligence/capabilities/README.md（頂層）沒有連帶記錄任何Decision Runner存在（本次任務沒有建立對應的Runtime Runner）', () => {
    const content = fs.readFileSync(path.join(capabilitiesDir, 'README.md'), 'utf8');
    assert.ok(!/decision_runner|DecisionRunner/i.test(content));
  });

  await test('（4.capability isolation）src/intelligence/decision/（頂層Runtime子系統目錄）不存在——本次任務只在capabilities/底下新增Decision Capability，沒有建立對應的Phase 2 Runtime層Decision Runner', () => {
    assert.strictEqual(fs.existsSync(path.join(intelDir, 'decision')), false);
  });

  await test('（4.capability isolation）decision_capability.js的檔案大小合理（薄邊界包裝，不應該過度膨脹成隱含的Decision Algorithm實作）', () => {
    const stat = fs.statSync(path.join(decisionCapabilityDir, 'decision_capability.js'));
    assert.ok(stat.size < 20000, `decision_capability.js檔案大小異常：${stat.size} bytes`);
  });

  await test('（4.capability isolation）decision_capability.js完全沒有if/else if組成的多分支判斷鏈（超過一層的條件分支可能意味著隱含的決策邏輯，規格明確禁止）', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
    assert.ok(!/else\s+if/.test(src));
  });

  await test('（4.capability isolation）decision_result_builder.js完全沒有if/else if組成的多分支判斷鏈', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_result_builder.js'));
    assert.ok(!/else\s+if/.test(src));
  });

  await test('（4.capability isolation）decision_capability.js完全不出現switch語句（沒有多分支決策邏輯）', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
    assert.ok(!/\bswitch\s*\(/.test(src));
  });

  await test('（4.capability isolation）src/intelligence/capabilities/index.js的相對路徑import包含./analysis/index.js、./recommendation/index.js、./orchestration/index.js、./decision/index.js四個', () => {
    const src = readSrc(path.join(capabilitiesDir, 'index.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports.sort(), ['./analysis/index.js', './decision/index.js', './orchestration/index.js', './recommendation/index.js']);
  });

  console.log('');

  // =========================================================================
  // E. dependency scan
  // =========================================================================
  console.log('--- E. dependency scan ---');

  for (const file of DECISION_CAPABILITY_JS_FILES) {
    await test(`（5.dependency scan）capabilities/decision/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(decisionCapabilityDir, file))));
    });
    for (const pattern of [/db\.prepare\(/, /\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i, /DIET_COACH_DB/]) {
      await test(`（5.dependency scan）capabilities/decision/${file} 不含資料庫關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(readSrc(path.join(decisionCapabilityDir, file))));
      });
    }
    await test(`（5.dependency scan）capabilities/decision/${file} 完全不出現db變數名稱（Decision Capability完全不知道db是什麼，甚至不接受db作為參數）`, () => {
      assert.ok(!/\bdb\b/.test(readSrc(path.join(decisionCapabilityDir, file))));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（5.dependency scan）capabilities/decision/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(readSrc(path.join(decisionCapabilityDir, file))));
      });
    }
    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i, /\buserId\b/]) {
      await test(`（5.dependency scan）capabilities/decision/${file} 不含身分相關字樣 ${pattern}（不接受身分相關參數）`, () => {
        assert.ok(!pattern.test(readSrc(path.join(decisionCapabilityDir, file))));
      });
    }
    for (const fn of ['requireAuth(', 'requireActiveUser(', 'getCurrentUser(']) {
      await test(`（5.dependency scan）capabilities/decision/${file} 完全不呼叫${fn.replace('(', '()')}`, () => {
        assert.ok(!readSrc(path.join(decisionCapabilityDir, file)).includes(fn));
      });
    }
    await test(`（5.dependency scan）capabilities/decision/${file} 裡所有import都是相對路徑（完全不import任何非相對路徑的外部套件）`, () => {
      const imports = [...readSrc(path.join(decisionCapabilityDir, file)).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file}import了非相對路徑的外部套件：${imp}`);
      }
    });
    await test(`（5.dependency scan）capabilities/decision/${file} 完全不import src/services/（既有Domain Service）`, () => {
      assert.ok(!/from\s+['"].*\/services\//.test(readSrc(path.join(decisionCapabilityDir, file))));
    });
    await test(`（5.dependency scan）capabilities/decision/${file} 完全不呼叫setTimeout()/setInterval()（沒有非同步排程邏輯）`, () => {
      const src = readSrc(path.join(decisionCapabilityDir, file));
      assert.ok(!/setTimeout\(/.test(src));
      assert.ok(!/setInterval\(/.test(src));
    });
  }

  await test('（5.dependency scan）capabilities/decision/整個目錄樹沒有任何檔案import src/intelligence/runtime/', () => {
    for (const file of DECISION_CAPABILITY_JS_FILES) {
      assert.ok(!/from\s+['"].*\/runtime\//.test(readSrc(path.join(decisionCapabilityDir, file))));
    }
  });

  await test('（5.dependency scan）capabilities/decision/整個目錄樹沒有任何檔案import src/intelligence/contracts.js或src/intelligence/contracts/', () => {
    for (const file of DECISION_CAPABILITY_JS_FILES) {
      const src = readSrc(path.join(decisionCapabilityDir, file));
      assert.ok(!/from\s+['"].*\/contracts/.test(src));
    }
  });

  console.log('');

  // =========================================================================
  // F. runtime isolation
  // =========================================================================
  console.log('--- F. runtime isolation ---');

  const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'recommendation', 'analysis', 'governance', 'events', 'monitoring'];
  for (const file of DECISION_CAPABILITY_JS_FILES) {
    await test(`（6.runtime isolation）capabilities/decision/${file} 完全不import src/intelligence/execution/（Execution Manager）`, () => {
      const src = readSrc(path.join(decisionCapabilityDir, file));
      const executionManagerDir = path.join(intelDir, 'execution');
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        const resolved = path.normalize(path.join(decisionCapabilityDir, imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir);
      }
    });
    for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
      await test(`（6.runtime isolation）capabilities/decision/${file} 完全不import src/intelligence/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(readSrc(path.join(decisionCapabilityDir, file))));
      });
    }
    for (const varName of ['executionManager', 'historyStore', 'metricsStore', 'eventDispatcher', 'governanceService']) {
      await test(`（6.runtime isolation）capabilities/decision/${file} 完全不出現${varName}變數名稱`, () => {
        assert.ok(!new RegExp(varName).test(readSrc(path.join(decisionCapabilityDir, file))));
      });
    }
  }

  await test('（6.runtime isolation）Runtime Execution Layer（execution/、service/、orchestration/、facade/、data_preparation/、history/、metrics/、events/、governance/）本次任務完全沒有被修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/execution/ src/intelligence/service/ src/intelligence/orchestration/ src/intelligence/facade/ src/intelligence/data_preparation/ src/intelligence/history/ src/intelligence/metrics/ src/intelligence/events/ src/intelligence/governance/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.runtime isolation）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/，TASK1.45）本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // G. no AI dependency
  // =========================================================================
  console.log('--- G. no AI dependency ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of DECISION_CAPABILITY_JS_FILES) {
    const codeOnly = readSrc(path.join(decisionCapabilityDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（7.no AI dependency）capabilities/decision/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（7.no AI dependency）capabilities/decision/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
  }

  await test('（7.no AI dependency）wrangler.toml完全沒有新增任何AI相關的環境變數/binding（本次任務沒有啟用AI Provider）', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（7.no AI dependency）decision_capability.js完全不出現score/confidence/rank/sort相關的計算邏輯（沒有判斷/評分邏輯，規格明確禁止）', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
    assert.ok(!/\.score\s*=/.test(src));
    assert.ok(!/\.confidence\s*=/.test(src));
    assert.ok(!/\.sort\(/.test(src));
    assert.ok(!/\brank\b/i.test(src));
  });

  await test('（7.no AI dependency）decision_result_builder.js的buildDecisionOutputPlaceholder()完全不出現score/confidence/rank/sort相關的計算邏輯', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_result_builder.js'));
    assert.ok(!/\.score\s*=/.test(src));
    assert.ok(!/\.confidence\s*=/.test(src));
    assert.ok(!/\.sort\(/.test(src));
  });

  for (const file of ['decision_capability.js', 'decision_result_builder.js']) {
    await test(`（7.no AI dependency）${file} 完全不呼叫Date.now()（deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(readSrc(path.join(decisionCapabilityDir, file))));
    });
    await test(`（7.no AI dependency）${file} 完全不呼叫Math.random()（deterministic）`, () => {
      assert.ok(!/Math\.random\(\)/.test(readSrc(path.join(decisionCapabilityDir, file))));
    });
  }

  await test('（7.no AI dependency）decision_capability.js完全不出現weight/threshold/priority等隱含判斷準則的變數名稱（規格明確禁止判斷邏輯）', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_capability.js'));
    assert.ok(!/\bweight\b/i.test(src));
    assert.ok(!/\bthreshold\b/i.test(src));
    assert.ok(!/\bpriority\b/i.test(src));
  });

  await test('（7.no AI dependency）decision_result_builder.js完全不出現weight/threshold/priority等隱含判斷準則的變數名稱', () => {
    const src = readSrc(path.join(decisionCapabilityDir, 'decision_result_builder.js'));
    assert.ok(!/\bweight\b/i.test(src));
    assert.ok(!/\bthreshold\b/i.test(src));
    assert.ok(!/\bpriority\b/i.test(src));
  });

  await test('（7.no AI dependency）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（7.no AI dependency）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（7.no AI dependency）decision_capability.js/decision_result_builder.js完全沒有建立任何名稱包含Algorithm/Engine/Rule的函式（規格明確禁止建立Decision Algorithm/Rule Engine）', () => {
    for (const file of ['decision_capability.js', 'decision_result_builder.js']) {
      const src = readSrc(path.join(decisionCapabilityDir, file));
      assert.ok(!/function\s+\w*Algorithm/i.test(src));
      assert.ok(!/function\s+\w*Engine/i.test(src));
      assert.ok(!/function\s+\w*RuleEngine/i.test(src));
    }
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase4-task1.83-decision-capability')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（8.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4全部）`, () => {
      assert.ok(allSuites.length >= 73, `預期至少73個既有測試檔案，實際 ${allSuites.length}`);
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

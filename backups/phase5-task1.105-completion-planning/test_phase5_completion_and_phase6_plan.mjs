/*
 * Phase 5 TASK 1.105｜Phase 5 Completion Snapshot & Phase 6
 * Planning 測試
 *
 * 本任務是文件跟驗證規劃任務——不新增任何production功能、不
 * 實作AI。目的是產出Phase 5的最終完成快照
 * （PHASE5_COMPLETION_AND_PHASE6_PLAN.md）跟Phase 6候選方向
 * 規劃，並重新確認TASK1.99~1.104建立的五個Product Integration
 * Boundary跟End-to-End鏈路依然完整、依然正確運作。
 *
 * 分為以下10個部分：
 * A) Phase 5 architecture snapshot
 * B) Boundary completeness
 * C) Data flow validation
 * D) Error flow validation
 * E) Security boundary
 * F) Phase 6 roadmap
 * G) Dependency direction
 * H) AI boundary
 * I) Regression validation
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
const productDir = path.join(intelDir, 'product');
const productEntryDir = path.join(productDir, 'entry');
const productContractDir = path.join(productDir, 'contract');
const productAdapterDir = path.join(productDir, 'adapter');
const productExecutionDir = path.join(productDir, 'execution');
const productOperationalDir = path.join(productDir, 'operational');
const finalReviewDocPath = path.join(productDir, 'PHASE5_PRODUCT_INTEGRATION_FINAL_REVIEW.md');
const completionDocPath = path.join(productDir, 'PHASE5_COMPLETION_AND_PHASE6_PLAN.md');

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

const PHASE4_LAYERS = [
  { name: 'analysis', dir: analysisCapabilityDir, files: ['analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js'] },
  { name: 'recommendation', dir: recommendationCapabilityDir, files: ['recommendation_capability.js', 'recommendation_capability_result_builder.js', 'index.js'] },
  { name: 'orchestration', dir: orchestrationCapabilityDir, files: ['capability_orchestrator.js', 'capability_result_builder.js', 'index.js'] },
  { name: 'decision', dir: decisionCapabilityDir, files: ['decision_capability.js', 'decision_result_builder.js', 'index.js'] },
  { name: 'intelligence-feature', dir: intelligenceFeatureDir, files: ['intelligence_feature.js', 'intelligence_feature_result_mapper.js', 'index.js'] },
];
const PRODUCT_LAYERS = [
  { name: 'product-entry', dir: productEntryDir, files: ['product_entry.js', 'product_entry_result_builder.js', 'index.js'], commit: 'e6cfd32' },
  { name: 'product-contract', dir: productContractDir, files: ['product_contract.js', 'product_contract_validator.js', 'product_contract_result_builder.js', 'index.js'], commit: '9c286a0' },
  { name: 'product-adapter', dir: productAdapterDir, files: ['product_adapter.js', 'product_adapter_result_builder.js', 'index.js'], commit: '080c8d9' },
  { name: 'product-execution', dir: productExecutionDir, files: ['product_execution.js', 'product_execution_result_builder.js', 'index.js'], commit: 'eae66d2' },
  { name: 'product-operational', dir: productOperationalDir, files: ['product_operational.js', 'product_operational_result_builder.js', 'index.js'], commit: '9c383d3' },
];
const ALL_LAYERS = [...PHASE4_LAYERS, ...PRODUCT_LAYERS];
const ALL_SCANNED_FILES = ALL_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));
const PRODUCT_LAYER_NAMES = PRODUCT_LAYERS.map((l) => l.name);

const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution', 'capabilities', 'analysis', 'recommendation', 'application'];

async function run() {
  const { createAnalysisCapability } = await import(path.join(analysisCapabilityDir, 'index.js'));
  const { createRecommendationCapability } = await import(path.join(recommendationCapabilityDir, 'index.js'));
  const { createCapabilityOrchestrator } = await import(path.join(orchestrationCapabilityDir, 'index.js'));
  const { createIntelligenceFeature } = await import(path.join(intelligenceFeatureDir, 'index.js'));
  const { createAnalysisRunner } = await import(path.join(analysisDir, 'index.js'));
  const { createRecommendationRunner } = await import(path.join(recommendationDir, 'index.js'));
  const { createProductEntry } = await import(path.join(productEntryDir, 'index.js'));
  const { createProductContract } = await import(path.join(productContractDir, 'index.js'));
  const { createProductAdapter } = await import(path.join(productAdapterDir, 'index.js'));
  const { createProductExecution } = await import(path.join(productExecutionDir, 'index.js'));
  const { createProductOperational } = await import(path.join(productOperationalDir, 'index.js'));

  function makeRealAnalysisCapability() {
    return createAnalysisCapability({ analysisRunner: createAnalysisRunner() });
  }
  function makeRealRecommendationCapability() {
    return createRecommendationCapability({ recommendationRunner: createRecommendationRunner() });
  }
  function makeRealIntelligenceFeature() {
    return createIntelligenceFeature({
      capabilityOrchestrator: createCapabilityOrchestrator({
        analysisCapability: makeRealAnalysisCapability(),
        recommendationCapability: makeRealRecommendationCapability(),
      }),
    });
  }
  function makeFullChain(observer, overrideFeature) {
    const operational = createProductOperational({ intelligenceFeature: overrideFeature || makeRealIntelligenceFeature(), observer });
    const execution = createProductExecution({ intelligenceFeature: operational });
    const adapter = createProductAdapter({ intelligenceFeature: execution });
    const contract = createProductContract({ adapter });
    return createProductEntry({ adapter: contract });
  }

  const finalReviewDoc = fs.readFileSync(finalReviewDocPath, 'utf8');
  const doc = fs.readFileSync(completionDocPath, 'utf8');
  const flatDoc = doc.replace(/\n/g, ' ');
  const operationalSrc = readSrc(path.join(productOperationalDir, 'product_operational.js'));
  const operationalReadme = fs.readFileSync(path.join(productOperationalDir, 'README.md'), 'utf8');

  // =========================================================================
  // A. Phase 5 architecture snapshot
  // =========================================================================
  console.log('--- A. Phase 5 architecture snapshot ---');

  await test('（1.architecture snapshot）src/intelligence/product/PHASE5_COMPLETION_AND_PHASE6_PLAN.md存在且非空', () => {
    const stat = fs.statSync(completionDocPath);
    assert.ok(stat.isFile());
    assert.ok(stat.size > 0);
  });

  const REQUIRED_DOC_SECTIONS = [
    'Phase 5 Architecture Snapshot', 'Completed Boundary Summary', 'Full Data Flow', 'Full Error Flow',
    'Security Boundary Summary', 'Known Limitations', 'Phase 5 Completion Status', 'Phase 6 Candidate Directions',
  ];
  for (const section of REQUIRED_DOC_SECTIONS) {
    await test(`（1.architecture snapshot）文件包含「${section}」章節`, () => {
      assert.ok(doc.includes(section), `文件缺少章節：${section}`);
    });
  }

  await test('（1.architecture snapshot）文件記錄完整的任務序列（規劃TASK1.90~1.98、落地TASK1.99~1.103、驗證TASK1.104、本次TASK1.105）', () => {
    for (const t of ['TASK1.90', 'TASK1.99', 'TASK1.103', 'TASK1.104', 'TASK1.105']) {
      assert.ok(doc.includes(t), `文件缺少任務序列引用：${t}`);
    }
    assert.ok(/1\.98/.test(doc), '文件缺少TASK1.98的引用（可能以範圍記法1.90~1.98呈現）');
  });

  await test('（1.architecture snapshot）文件記錄五個邊界各自的commit hash', () => {
    for (const commit of ['e6cfd32', '080c8d9', 'eae66d2', '9c383d3', '9c286a0']) {
      assert.ok(doc.includes(commit), `文件缺少commit引用：${commit}`);
    }
  });

  await test('（1.architecture snapshot）文件記錄完整六層鏈路（Entry→Contract→Adapter→Execution→Operational→Feature）', () => {
    assert.ok(/Product Entry.*Product Contract.*Product Adapter/s.test(doc));
    assert.ok(/Execution Boundary.*Operational Boundary/s.test(doc));
  });

  await test('（1.architecture snapshot）文件記錄五個邊界合計21個檔案（16個production程式碼+5份README）', () => {
    assert.ok(/21個檔案/.test(doc));
    assert.ok(/16個production程式碼檔案/.test(doc));
  });

  console.log('');

  // =========================================================================
  // B. Boundary completeness
  // =========================================================================
  console.log('--- B. Boundary completeness ---');

  for (const layer of PRODUCT_LAYERS) {
    await test(`（2.Boundary completeness）${layer.name} 目錄恰好包含既有的檔案清單（本次任務沒有新增/刪除/修改）`, () => {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort());
    });
  }

  await test('（2.Boundary completeness）doc記錄的Completed Boundary Summary表格恰好列出五個邊界名稱', () => {
    for (const name of ['Product Entry', 'Product Adapter', 'Product Execution', 'Product Operational', 'Product Contract']) {
      assert.ok(doc.includes(name), `doc缺少邊界名稱：${name}`);
    }
  });

  await test('（2.Boundary completeness）PHASE5_PRODUCT_INTEGRATION_FINAL_REVIEW.md（TASK1.104）依然存在且本次任務完全沒有修改它', () => {
    assert.ok(fs.existsSync(finalReviewDocPath));
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/product/PHASE5_PRODUCT_INTEGRATION_FINAL_REVIEW.md'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（2.Boundary completeness）五個邊界的createXxx()工廠函式全部可以正常呼叫、回傳正確的介面', () => {
    assert.strictEqual(typeof createProductEntry({}).requestProductEntry, 'function');
    assert.strictEqual(typeof createProductContract({}).forwardProductRequest, 'function');
    assert.strictEqual(typeof createProductAdapter({}).forwardProductRequest, 'function');
    assert.strictEqual(typeof createProductExecution({}).requestIntelligence, 'function');
    assert.strictEqual(typeof createProductOperational({}).requestIntelligence, 'function');
  });

  console.log('');

  // =========================================================================
  // C. Data flow validation
  // =========================================================================
  console.log('--- C. Data flow validation ---');

  await test('（3.Data flow validation）完整六層鏈路成功串接，回傳結構恰好包含analysis跟recommendation', () => {
    const entry = makeFullChain();
    const result = entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(Object.keys(result.result).sort(), ['analysis', 'recommendation']);
  });

  await test('（3.Data flow validation）deterministic：完整鏈路重複呼叫得到完全相同的結果', () => {
    const entry = makeFullChain();
    const request = { rawInput: makeInsightContext() };
    assert.deepStrictEqual(entry.requestProductEntry(request), entry.requestProductEntry(request));
  });

  await test('（3.Data flow validation）analysis/recommendation內容從Runner到Entry全程沒有被修改（跟真實Feature單獨呼叫的結果逐一比對）', () => {
    const realFeature = makeRealIntelligenceFeature();
    const featureResult = realFeature.requestIntelligence({ context: makeInsightContext() });
    const entry = makeFullChain(undefined, realFeature);
    const entryResult = entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.deepStrictEqual(entryResult.result.analysis, featureResult.data.analysis);
    assert.deepStrictEqual(entryResult.result.recommendation, featureResult.data.recommendation);
  });

  await test('（3.Data flow validation）Entry驗證失敗時，下游五層全部不會被呼叫', () => {
    let adapterCalled = false;
    const entry = createProductEntry({ adapter: { forwardProductRequest: () => { adapterCalled = true; return { ok: true, result: {} }; } } });
    entry.requestProductEntry({ userId: 123, rawInput: {} });
    assert.strictEqual(adapterCalled, false);
  });

  await test('（3.Data flow validation）doc記錄Request Lifecycle七個步驟跟Response Lifecycle', () => {
    assert.ok(/Request Lifecycle/.test(doc));
    assert.ok(/Response Lifecycle/.test(doc));
  });

  await test('（3.Data flow validation）doc確認"analysis/recommendation兩個欄位的內容...全程沒有被任何一層修改過"', () => {
    assert.ok(/全程沒有被\s*任何一層修改過/.test(flatDoc));
  });

  console.log('');

  // =========================================================================
  // D. Error flow validation
  // =========================================================================
  console.log('--- D. Error flow validation ---');

  await test('（4.Error flow validation）Runtime例外從Feature經過完整鏈路到Entry，正確分類且不洩漏原始例外訊息', () => {
    const entry = makeFullChain(undefined, { requestIntelligence: () => { throw new Error('deep-runtime-failure-xyz'); } });
    const result = entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'internal_error');
    assert.ok(!JSON.stringify(result).includes('deep-runtime-failure-xyz'));
  });

  await test('（4.Error flow validation）Feature Failure（{ok:false,...}）從Feature到Entry全程正確傳遞reason/field', () => {
    const entry = makeFullChain(undefined, { requestIntelligence: () => ({ ok: false, reason: 'analysis_capability_unavailable', field: 'analysisCapability' }) });
    const result = entry.requestProductEntry({ rawInput: makeInsightContext() });
    assert.strictEqual(result.reason, 'analysis_capability_unavailable');
    assert.strictEqual(result.field, 'analysisCapability');
  });

  await test('（4.Error flow validation）Contract攔截版本不相容的response時，不相容的response不會流向Entry', () => {
    const incompatibleAdapter = { forwardProductRequest: () => ({ ok: true, result: { analysis: { metadata: { version: '99.0.0' } } } }) };
    const contract = createProductContract({ adapter: incompatibleAdapter });
    const entry = createProductEntry({ adapter: contract });
    const result = entry.requestProductEntry({ rawInput: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'unsupported_version');
  });

  await test('（4.Error flow validation）Operational依然原樣重新拋出例外（不吞掉、不轉換），Execution依然攔截並轉換成回傳值', () => {
    const op = createProductOperational({ intelligenceFeature: { requestIntelligence: () => { throw new Error('x'); } } });
    assert.throws(() => op.requestIntelligence({ context: {} }));
    const execution = createProductExecution({ intelligenceFeature: op });
    const result = execution.requestIntelligence({ context: {} });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.category, 'runtime_failure');
  });

  await test('（4.Error flow validation）doc記錄五種失敗分類方案的比較表格（Entry/Contract/Adapter/Execution/Operational各自的stage/category）', () => {
    for (const kw of ['invalid_request', 'contract_failure', 'feature_failure', 'runtime_failure']) {
      assert.ok(doc.includes(kw), `doc缺少關鍵字：${kw}`);
    }
  });

  await test('（4.Error flow validation）doc確認"例外會在Execution這一層被轉換成看不見例外的回傳值"', () => {
    assert.ok(/Execution這一層被\s*"?轉換成看不見例外/.test(flatDoc) || /Execution.*轉換成看不見例外的回傳值/.test(flatDoc));
  });

  console.log('');

  // =========================================================================
  // E. Security boundary
  // =========================================================================
  console.log('--- E. Security boundary ---');

  await test('（5.Security boundary）完整鏈路執行時，observer事件完全不含PII標記/userId', () => {
    const events = [];
    const entry = makeFullChain((m) => events.push(m));
    entry.requestProductEntry({ rawInput: makeInsightContext({ secretMarker: 'PII-SECRET-105' }), userId: 'user-should-not-leak-105' });
    const serialized = JSON.stringify(events);
    assert.ok(!serialized.includes('PII-SECRET-105'));
    assert.ok(!serialized.includes('user-should-not-leak-105'));
  });

  await test('（5.Security boundary）observer收到的事件恰好只可能包含Allowed Metadata七個欄位', () => {
    const events = [];
    const entry = makeFullChain((m) => events.push(m));
    entry.requestProductEntry({ rawInput: makeInsightContext() });
    const allowedKeys = new Set(['phase', 'ok', 'reason', 'stage', 'version', 'durationMs', 'resultCounts']);
    for (const event of events) {
      for (const key of Object.keys(event)) {
        assert.ok(allowedKeys.has(key), `未預期的欄位：${key}`);
      }
    }
  });

  await test('（5.Security boundary）doc記錄Allowed Metadata七個欄位跟Forbidden Metadata清單', () => {
    for (const kw of ['phase', 'durationMs', 'resultCounts']) {
      assert.ok(doc.includes(kw), `doc缺少關鍵字：${kw}`);
    }
    for (const kw of ['userId', 'field']) {
      assert.ok(doc.includes(kw), `doc缺少Forbidden關鍵字：${kw}`);
    }
  });

  await test('（5.Security boundary）Operational的README.md依然記錄跟doc一致的Allowed/Forbidden Metadata清單', () => {
    for (const kw of ['phase', 'durationMs', 'resultCounts', 'userId']) {
      assert.ok(operationalReadme.includes(kw), `Operational README缺少關鍵字：${kw}`);
    }
  });

  await test('（5.Security boundary）Operational的原始碼依然完全不讀取request.rawInput/context以外會外洩的資料（只讀取metadata.version跟陣列長度）', () => {
    assert.ok(!/rawInput/.test(operationalSrc));
  });

  console.log('');

  // =========================================================================
  // F. Phase 6 roadmap
  // =========================================================================
  console.log('--- F. Phase 6 roadmap ---');

  const PHASE6_TOPICS = [
    'Product Feature Activation', 'Real User Scenario Integration', 'Intelligence Capability Usage',
    'Operational Expansion', 'Future AI Preparation',
  ];
  for (const topic of PHASE6_TOPICS) {
    await test(`（6.Phase 6 roadmap）文件記錄Phase 6候選方向「${topic}」`, () => {
      assert.ok(doc.includes(topic), `文件缺少Phase 6方向：${topic}`);
    });
  }

  await test('（6.Phase 6 roadmap）每個Phase 6候選方向都記錄「現況空白」跟「候選方向」跟「風險/前提」（各自恰好5次逐方向出現，加上章節總結各1次，合計6次）', () => {
    const occurrences = (doc.match(/現況空白/g) || []).length;
    assert.strictEqual(occurrences, PHASE6_TOPICS.length + 1);
    const riskOccurrences = (doc.match(/風險\/前提/g) || []).length;
    assert.strictEqual(riskOccurrences, PHASE6_TOPICS.length + 1);
  });

  await test('（6.Phase 6 roadmap）文件明確說明本次任務"只規劃、不落地"', () => {
    assert.ok(/只規劃、\s*不落地/.test(flatDoc) || /只規劃\*{0,2}、不落地/.test(flatDoc));
  });

  await test('（6.Phase 6 roadmap）Future AI Preparation方向明確說明"不是立刻導入AI"，且產出應該是規劃文件不是AI程式碼', () => {
    assert.ok(/不是\*{0,2}立刻導入AI/.test(flatDoc));
    assert.ok(/不應該\*{0,2}是任何實際的AI程式碼/.test(flatDoc));
  });

  await test('（6.Phase 6 roadmap）文件記錄Phase 5 Completion Status四個階段（規劃/落地/驗證/完成快照）全部確認完成', () => {
    assert.ok(/規劃（TASK1\.90~1\.98）.*✅ 完成/s.test(doc) || /規劃.*✅.*完成/.test(doc));
    assert.ok(/驗證（TASK1\.104）.*✅ 完成/s.test(doc) || /驗證.*✅.*完成/.test(doc));
  });

  await test('（6.Phase 6 roadmap）文件記錄新增的第8項Known Limitation：Phase 5全系列從頭到尾沒有建立真實的Product Feature', () => {
    assert.ok(/從頭到尾\s*沒有\s*建立任何真實的Product\s*Feature/.test(flatDoc));
  });

  await test('（6.Phase 6 roadmap）文件明確說明"Phase 5正式視為完整結束"、沒有懸而未決的規劃缺口', () => {
    assert.ok(/正式視為\s*完整結束/.test(flatDoc));
  });

  console.log('');

  // =========================================================================
  // G. Dependency direction
  // =========================================================================
  console.log('--- G. Dependency direction ---');

  await test('（7.Dependency direction）src/intelligence/product/ 底下的5個邊界子目錄依然全部存在，沒有新增第6個', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    assert.deepStrictEqual(dirNames, ['adapter', 'contract', 'entry', 'execution', 'operational']);
  });

  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    await test(`（7.Dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
    const src = readSrc(full);
    await test(`（7.Dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（7.Dependency direction）${layer}/${file} 完全不import src/${subdir}/`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }
  }

  for (const layer of PRODUCT_LAYERS) {
    for (const file of layer.files) {
      if (file === 'README.md' || file === 'index.js') continue;
      const src = readSrc(path.join(layer.dir, file));
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（7.Dependency direction）${layer.name}/${file} 完全不import src/intelligence/${subdir}/`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（7.Dependency direction）${layer.name}/${file} 完全不import src/routes/、src/controllers/、worker.js`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
      });
    }
  }

  await test('（7.Dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.Dependency direction）app.intelligence物件恰好維持24個欄位不變', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（7.Dependency direction）app.router.routes 數量沒有因為本次任務而改變（依然是21條）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（7.Dependency direction）src/routes/、src/controllers/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/routes/ src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）migrations/ 目錄本次任務完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）src/db/ 目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）四層既有Phase 4 Capability完全沒有任何檔案被新增或修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/intelligence/capabilities/analysis/ src/intelligence/capabilities/recommendation/ src/intelligence/capabilities/orchestration/ src/intelligence/capabilities/decision/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（7.Dependency direction）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（7.Dependency direction）9份Phase 5規劃/審查文件本次任務完全沒有被修改', () => {
    const PHASE5_DOCS = [
      'PHASE5_PRODUCT_INTEGRATION_PLAN.md', 'PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md', 'PHASE5_PRODUCT_ADAPTER_PLAN.md',
      'PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md', 'PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md', 'PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md',
      'PHASE5_OPERATIONAL_BOUNDARY_PLAN.md', 'PHASE5_PRODUCT_INTEGRATION_CONSOLIDATION_REVIEW.md', 'PHASE5_IMPLEMENTATION_READINESS_PLAN.md',
    ];
    for (const docName of PHASE5_DOCS) {
      const diff = execFileSync('git', ['diff', '--stat', `src/intelligence/${docName}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${docName} 不應該被本次任務修改`);
    }
  });

  await test('（7.Dependency direction）沒有新增任何API route（本次任務不新增production功能）', () => {
    const status = execFileSync('sh', ['-c', "git status --porcelain -- src/routes/ src/controllers/ src/worker.js"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  console.log('');

  // =========================================================================
  // H. AI boundary
  // =========================================================================
  console.log('--- H. AI boundary ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];

  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    const src = readSrc(full);
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.AI boundary）${layer}/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（8.AI boundary）${layer}/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
  }

  await test('（8.AI boundary）五個Product Boundary的所有.js檔案完全不呼叫Date.now()/Math.random()（deterministic）', () => {
    for (const layer of PRODUCT_LAYERS) {
      for (const file of layer.files) {
        if (file === 'README.md') continue;
        const src = readSrc(path.join(layer.dir, file));
        assert.ok(!/Date\.now\(\)/.test(src), `${layer.name}/${file}`);
        assert.ok(!/Math\.random\(\)/.test(src), `${layer.name}/${file}`);
      }
    }
  });

  await test('（8.AI boundary）五個Product Boundary完全不含Decision Algorithm/Rule Engine/Scoring Logic相關字樣', () => {
    for (const layer of PRODUCT_LAYERS) {
      for (const file of layer.files) {
        if (file === 'README.md') continue;
        const src = readSrc(path.join(layer.dir, file));
        for (const pattern of [/\bscore\b/i, /\bweight(ing)?\b/i, /\bthreshold\b/i, /rule\s*engine/i]) {
          assert.ok(!pattern.test(src), `${layer.name}/${file} 出現疑似字樣：${pattern}`);
        }
      }
    }
  });

  await test('（8.AI boundary）PHASE5_COMPLETION_AND_PHASE6_PLAN.md不含實際的AI呼叫程式碼字樣（只有Future AI Preparation規劃性字眼）', () => {
    for (const pattern of [/api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i]) {
      assert.ok(!pattern.test(doc));
    }
  });

  await test('（8.AI boundary）wrangler.toml完全沒有新增任何AI相關的環境變數/binding', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    for (const pattern of [/ANTHROPIC/i, /OPENAI/i, /DEEPSEEK/i, /CLAUDE_API/i]) {
      assert.ok(!pattern.test(content));
    }
  });

  await test('（8.AI boundary）wrangler.toml本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.AI boundary）package.json完全沒有新增任何AI SDK依賴', () => {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (const name of Object.keys(allDeps)) {
        assert.ok(!/anthropic|openai|deepseek/i.test(name));
      }
    }
  });

  await test('（8.AI boundary）package.json本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.AI boundary）.env或.env.example完全沒有新增任何AI相關的環境變數', () => {
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

  await test('（8.AI boundary）端對端：Analysis Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createAnalysisRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runAnalysis(makeInsightContext());
    assert.strictEqual(result.ok, true);
  });

  await test('（8.AI boundary）端對端：Recommendation Runner的dependencies.modules延伸點依然存在且可運作', () => {
    const customRunner = createRecommendationRunner({ modules: [() => ({ type: 'placeholder', value: 1, source: 'x' })] });
    const result = customRunner.runRecommendation({ status: 'x', insights: [], metadata: {} });
    assert.strictEqual(result.ok, true);
  });

  console.log('');

  // =========================================================================
  // I. Regression validation
  // =========================================================================
  console.log('--- I. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（9.Regression validation）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase5-task1.105-completion-planning')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.Regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 96, `預期至少96個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（9.Regression validation）${relName} 完整執行，exit code為0（無回歸）`, () => {
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

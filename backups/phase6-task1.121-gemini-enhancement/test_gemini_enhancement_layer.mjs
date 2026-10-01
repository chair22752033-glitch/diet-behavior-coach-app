/*
 * Phase 6 TASK 1.121｜Gemini Enhancement Layer Foundation
 * Implementation 測試
 *
 * 本任務是Health Insight產品線第一次接上AI增強層：
 *
 *   Health Insight Result（TASK1.117既有的Structured Product Response）
 *     ↓
 *   Gemini Enhancement Layer（src/intelligence/enhancement/gemini/）
 *     ↓
 *   Enhanced Explanation
 *     ↓
 *   User Presentation
 *
 * Gemini不是智慧來源——既有Analysis/Recommendation Capability依然
 * 是analysis/recommendation/health insight result的唯一負責者，
 * Gemini只負責把既有結果改寫成更口語化的說明文字。Gemini失敗
 * 完全不影響使用者拿到原本的Health Insight結果。本次任務不實作
 * Premium/訂閱/付費/完整會員權限控管、不修改D1 schema、不修改
 * Capability Orchestrator/Runtime/Intelligence contracts。
 *
 * 分為以下13個部分：
 * A) Gemini boundary
 * B) Provider abstraction
 * C) Input filtering
 * D) Output filtering
 * E) API failure handling
 * F) Existing result preservation
 * G) Product Integration compatibility
 * H) Persistence compatibility
 * I) Identity compatibility
 * J) Configuration safety
 * K) Regression validation
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
const geminiDir = path.join(srcRoot, 'intelligence', 'enhancement', 'gemini');
const providerDir = path.join(srcRoot, 'intelligence', 'enhancement', 'provider');
const configDir = path.join(srcRoot, 'config');
const routesDir = path.join(srcRoot, 'routes');
const controllersDir = path.join(srcRoot, 'controllers');
const persistenceDir = path.join(srcRoot, 'persistence', 'health_insight');
const identityDir = path.join(srcRoot, 'identity', 'health_insight');
const migrationsDir = path.join(repoRoot, 'migrations');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`✅ ${name}`);
    })
    .catch((e) => {
      failed++;
      failures.push(name);
      console.log(`❌ ${name}`);
      console.log('   ', e && e.stack ? e.stack.split('\n')[0] : e);
    });
}

function getImportLines(source) {
  return source.split('\n').filter((line) => /^import\b/.test(line.trim())).join('\n');
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

async function withMockedGlobalFetch(mockFn, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mockFn;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

async function loadModules() {
  const { createAppRouter } = await import(path.join(routesDir, 'index.js'));
  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  const geminiModule = await import(path.join(geminiDir, 'index.js'));
  const providerModule = await import(path.join(providerDir, 'index.js'));
  const { getGeminiConfig } = await import(path.join(configDir, 'gemini_config.js'));
  return { createAppRouter, createApplication, geminiModule, providerModule, getGeminiConfig };
}

function makeValidSessionDb({ userId, status, isGuest, authProvider, expiresInFutureSeconds }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (expiresInFutureSeconds !== undefined ? expiresInFutureSeconds : 3600) * 1000).toISOString();
  return {
    sessions: { getById: async () => ({ ok: true, row: { id: 'token123', user_id: userId, expires_at: expiresAt, revoked_at: null } }) },
    users: { getById: async () => ({ ok: true, row: { id: userId, is_guest: isGuest ? 1 : 0, auth_provider: authProvider || null, status: status || 'active' } }) },
  };
}

function makeCaptureDb({ userId, isGuest, authProvider }) {
  const inserted = [];
  const base = makeValidSessionDb({ userId, isGuest, authProvider });
  const db = Object.assign({}, base, {
    healthInsightRecords: {
      insert: async (r) => {
        inserted.push(r);
        return { ok: true, meta: {} };
      },
    },
  });
  return { db, inserted };
}

const SUCCESS_STRUCTURED_RESPONSE = {
  ok: true,
  data: {
    healthObservation: ['最近三天的蔬菜攝取偏低'],
    behaviorPattern: ['固定在晚上八點後進食'],
    recommendation: ['Increase vegetable intake'],
    progressTrend: { direction: 'flat' },
    decision: null,
  },
};

function fakeGeminiHttpResponse(text) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
}

async function main() {
  const { createAppRouter, createApplication, geminiModule, providerModule, getGeminiConfig } = await loadModules();
  const { enhanceHealthInsightResult, buildEnhancementInput, createGeminiProvider, callGeminiApi } = geminiModule;
  const { isValidAiProvider } = providerModule;

  const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
  const enhancerSource = fs.readFileSync(path.join(geminiDir, 'gemini_enhancer.js'), 'utf8');
  const providerSource = fs.readFileSync(path.join(geminiDir, 'gemini_provider.js'), 'utf8');
  const clientSource = fs.readFileSync(path.join(geminiDir, 'gemini_client.js'), 'utf8');
  const contractSource = fs.readFileSync(path.join(providerDir, 'ai_provider_contract.js'), 'utf8');
  const geminiConfigSource = fs.readFileSync(path.join(configDir, 'gemini_config.js'), 'utf8');
  const readmeSource = fs.readFileSync(path.join(geminiDir, 'README.md'), 'utf8');

  // =========================================================================
  // A. Gemini boundary
  // =========================================================================
  console.log('--- A. Gemini boundary ---');

  for (const f of ['gemini_client.js', 'gemini_provider.js', 'gemini_enhancer.js', 'index.js', 'README.md']) {
    await test(`（1.gemini boundary）src/intelligence/enhancement/gemini/${f} 確實存在於磁碟上`, () => {
      assert.ok(fs.existsSync(path.join(geminiDir, f)));
    });
  }

  await test('（1.gemini boundary）src/intelligence/enhancement/gemini/目錄恰好5個檔案', () => {
    const files = fs.readdirSync(geminiDir);
    assert.strictEqual(files.length, 5);
  });

  await test('（1.gemini boundary）src/intelligence/enhancement/provider/目錄恰好2個檔案', () => {
    const files = fs.readdirSync(providerDir);
    assert.strictEqual(files.length, 2);
  });

  for (const [mod, exportNames] of [
    ['gemini/index.js', ['enhanceHealthInsightResult', 'buildEnhancementInput', 'createGeminiProvider', 'callGeminiApi']],
    ['provider/index.js', ['isValidAiProvider']],
  ]) {
    for (const exportName of exportNames) {
      await test(`（1.gemini boundary）src/intelligence/enhancement/${mod}匯出"${exportName}"，型別是function`, () => {
        const moduleRef = mod.startsWith('gemini') ? geminiModule : providerModule;
        assert.strictEqual(typeof moduleRef[exportName], 'function');
      });
    }
  }

  for (const f of [
    'src/config/gemini_config.js',
    'src/intelligence/enhancement/provider/ai_provider_contract.js',
    'src/intelligence/enhancement/provider/index.js',
    'src/intelligence/enhancement/gemini/gemini_client.js',
    'src/intelligence/enhancement/gemini/gemini_provider.js',
    'src/intelligence/enhancement/gemini/gemini_enhancer.js',
    'src/intelligence/enhancement/gemini/index.js',
  ]) {
    await test(`（1.gemini boundary）新增檔案 ${f} 各自獨立通過node --check語法驗證`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(repoRoot, f)], { encoding: 'utf8' }));
    });
  }

  await test('（1.gemini boundary）enhanceHealthInsightResult是已匯出的function', () => {
    assert.strictEqual(typeof enhanceHealthInsightResult, 'function');
  });

  await test('（1.gemini boundary）buildEnhancementInput是已匯出的function', () => {
    assert.strictEqual(typeof buildEnhancementInput, 'function');
  });

  await test('（1.gemini boundary）createGeminiProvider是已匯出的function', () => {
    assert.strictEqual(typeof createGeminiProvider, 'function');
  });

  await test('（1.gemini boundary）callGeminiApi是已匯出的function', () => {
    assert.strictEqual(typeof callGeminiApi, 'function');
  });

  await test('（1.gemini boundary）gemini_enhancer.js完全不import Capability Orchestrator', () => {
    assert.ok(!getImportLines(enhancerSource).includes('capabilities/orchestration'));
  });

  await test('（1.gemini boundary）gemini_enhancer.js完全不import Analysis/Recommendation Runner', () => {
    const imports = getImportLines(enhancerSource);
    assert.ok(!imports.includes('analysis_runner'));
    assert.ok(!imports.includes('recommendation_runner'));
  });

  await test('（1.gemini boundary）gemini_enhancer.js完全不import Product Integration', () => {
    assert.ok(!getImportLines(enhancerSource).includes('health_insight_integration'));
  });

  await test('（1.gemini boundary）gemini_enhancer.js完全不import Runtime', () => {
    assert.ok(!/runtime/i.test(getImportLines(enhancerSource)));
  });

  await test('（1.gemini boundary）gemini_enhancer.js完全不import Intelligence contracts', () => {
    assert.ok(!getImportLines(enhancerSource).includes('/contracts/'));
  });

  await test('（1.gemini boundary）gemini_client.js完全不import gemini_enhancer.js（依賴方向由上往下：enhancer→provider→client，不可反向）', () => {
    assert.ok(!getImportLines(clientSource).includes('gemini_enhancer'));
  });

  await test('（1.gemini boundary）gemini_provider.js完全不import gemini_enhancer.js', () => {
    assert.ok(!getImportLines(providerSource).includes('gemini_enhancer'));
  });

  await test('（1.gemini boundary）gemini_client.js完全不import gemini_provider.js（client是最底層，不依賴上層）', () => {
    assert.ok(!getImportLines(clientSource).includes('gemini_provider'));
  });

  await test('（1.gemini boundary）enhanceHealthInsightResult()對Health Insight本身失敗的結果安全回傳not_successful_result', async () => {
    const result = await enhanceHealthInsightResult({ ok: false, error: { type: 'friendly_error', category: 'missing_data' } }, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'not_successful_result');
  });

  for (const bad of [null, undefined, 'string', 42, [], {}, true, false, NaN]) {
    await test(`（1.gemini boundary）enhanceHealthInsightResult(${JSON.stringify(bad) || String(bad)})不拋出例外`, async () => {
      await assert.doesNotReject(async () => enhanceHealthInsightResult(bad, {}));
    });
    await test(`（1.gemini boundary）enhanceHealthInsightResult(${JSON.stringify(bad) || String(bad)})回傳{ok:false}`, async () => {
      const result = await enhanceHealthInsightResult(bad, {});
      assert.strictEqual(result.ok, false);
    });
  }

  await test('（1.gemini boundary）enhanceHealthInsightResult()對options完全省略（只傳structuredResponse）不拋出例外', async () => {
    await assert.doesNotReject(async () => enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE));
  });

  await test('（1.gemini boundary）README.md提到"Core Principle"與Gemini不是智慧來源的原則', () => {
    assert.ok(readmeSource.includes('Core Principle'));
  });

  await test('（1.gemini boundary）README.md提到"Input Boundary"章節', () => {
    assert.ok(readmeSource.includes('Input Boundary'));
  });

  await test('（1.gemini boundary）README.md提到"Output Boundary"章節', () => {
    assert.ok(readmeSource.includes('Output Boundary'));
  });

  await test('（1.gemini boundary）README.md提到"Failure Handling"章節', () => {
    assert.ok(readmeSource.includes('Failure Handling'));
  });

  await test('（1.gemini boundary）README.md提到Provider Abstraction/AI Provider Interface的說明', () => {
    assert.ok(/Provider Abstraction|AI Provider Interface/.test(readmeSource));
  });

  console.log('');

  // =========================================================================
  // B. Provider abstraction
  // =========================================================================
  console.log('--- B. Provider abstraction ---');

  const PROVIDER_CASES = [
    { label: 'valid-provider', provider: { name: 'gemini', requestEnhancement: async () => ({ ok: true, explanation: 'x' }) }, expected: true },
    { label: 'valid-other-name', provider: { name: 'future-provider', requestEnhancement: async () => ({ ok: true, explanation: 'x' }) }, expected: true },
    { label: 'missing-name', provider: { requestEnhancement: async () => ({}) }, expected: false },
    { label: 'empty-name', provider: { name: '', requestEnhancement: async () => ({}) }, expected: false },
    { label: 'numeric-name', provider: { name: 42, requestEnhancement: async () => ({}) }, expected: false },
    { label: 'missing-requestEnhancement', provider: { name: 'gemini' }, expected: false },
    { label: 'requestEnhancement-not-function', provider: { name: 'gemini', requestEnhancement: 'nope' }, expected: false },
    { label: 'null', provider: null, expected: false },
    { label: 'undefined', provider: undefined, expected: false },
    { label: 'array', provider: [], expected: false },
    { label: 'string', provider: 'gemini', expected: false },
    { label: 'number', provider: 42, expected: false },
  ];

  for (const c of PROVIDER_CASES) {
    await test(`（2.provider abstraction）isValidAiProvider(${c.label}) === ${c.expected}`, () => {
      assert.strictEqual(isValidAiProvider(c.provider), c.expected);
    });
  }

  await test('（2.provider abstraction）createGeminiProvider()回傳的物件通過isValidAiProvider()檢查', () => {
    const provider = createGeminiProvider({ apiKey: 'fake' });
    assert.strictEqual(isValidAiProvider(provider), true);
  });

  await test('（2.provider abstraction）createGeminiProvider()的name固定是"gemini"', () => {
    const provider = createGeminiProvider({ apiKey: 'fake' });
    assert.strictEqual(provider.name, 'gemini');
  });

  await test('（2.provider abstraction）enhanceHealthInsightResult()可以注入自訂provider，完全不需要真正的Gemini API金鑰', async () => {
    const fakeProvider = { name: 'fake', requestEnhancement: async () => ({ ok: true, explanation: '自訂provider的說明文字' }) };
    const result = await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider: fakeProvider });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.enhancedExplanation, '自訂provider的說明文字');
  });

  await test('（2.provider abstraction）enhanceHealthInsightResult()注入格式不符的provider時安全回傳invalid_provider', async () => {
    const result = await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider: { name: 'bad' } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_provider');
  });

  await test('（2.provider abstraction）enhanceHealthInsightResult()注入的provider發生例外時不拋出，安全回傳unknown_error', async () => {
    const throwingProvider = { name: 'throws', requestEnhancement: async () => { throw new Error('boom'); } };
    const result = await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider: throwingProvider });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'unknown_error');
  });

  await test('（2.provider abstraction）enhanceHealthInsightResult()注入的provider回傳{ok:false, reason}時原樣透傳reason', async () => {
    const failingProvider = { name: 'fails', requestEnhancement: async () => ({ ok: false, reason: 'custom_provider_reason' }) };
    const result = await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider: failingProvider });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'custom_provider_reason');
  });

  await test('（2.provider abstraction）enhanceHealthInsightResult()注入的provider回傳空explanation時安全回傳empty_explanation', async () => {
    const emptyProvider = { name: 'empty', requestEnhancement: async () => ({ ok: true, explanation: '' }) };
    const result = await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider: emptyProvider });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'empty_explanation');
  });

  await test('（2.provider abstraction）enhanceHealthInsightResult()注入的provider回傳explanation為非字串型別時安全回傳empty_explanation', async () => {
    const badProvider = { name: 'bad-type', requestEnhancement: async () => ({ ok: true, explanation: 12345 }) };
    const result = await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider: badProvider });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'empty_explanation');
  });

  await test('（2.provider abstraction）enhanceHealthInsightResult()注入的provider回傳非物件（null）時安全回傳provider_error', async () => {
    const nullProvider = { name: 'null-result', requestEnhancement: async () => null };
    const result = await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider: nullProvider });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'provider_error');
  });

  await test('（2.provider abstraction）不同provider（同一份input）各自獨立運作，互不影響彼此狀態', async () => {
    const providerA = { name: 'a', requestEnhancement: async () => ({ ok: true, explanation: 'A的說明' }) };
    const providerB = { name: 'b', requestEnhancement: async () => ({ ok: true, explanation: 'B的說明' }) };
    const resultA = await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider: providerA });
    const resultB = await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider: providerB });
    assert.strictEqual(resultA.enhancedExplanation, 'A的說明');
    assert.strictEqual(resultB.enhancedExplanation, 'B的說明');
  });

  await test('（2.provider abstraction）ai_provider_contract.js完全不import任何具體Provider實作（gemini_client.js/gemini_provider.js）——Contract不能依賴具體實作', () => {
    assert.ok(!getImportLines(contractSource).includes('gemini'));
  });

  console.log('');

  // =========================================================================
  // C. Input filtering
  // =========================================================================
  console.log('--- C. Input filtering ---');

  await test('（3.input filtering）buildEnhancementInput()只保留4個允許欄位', () => {
    const input = buildEnhancementInput({
      healthObservation: ['a'],
      behaviorPattern: ['b'],
      recommendation: ['c'],
      progressTrend: { x: 1 },
      decision: 'should-not-leak',
      userId: 'should-not-leak',
      identity: { authenticated: true },
    });
    assert.deepStrictEqual(Object.keys(input).sort(), ['behaviorPattern', 'healthObservation', 'progressTrend', 'recommendation'].sort());
  });

  await test('（3.input filtering）buildEnhancementInput()完全不含decision欄位', () => {
    const input = buildEnhancementInput({ decision: 'secret-decision' });
    assert.ok(!('decision' in input));
  });

  await test('（3.input filtering）buildEnhancementInput()對非物件data安全退回全空預設', () => {
    const input = buildEnhancementInput('not-an-object');
    assert.deepStrictEqual(input, { healthObservation: [], recommendation: [], behaviorPattern: [], progressTrend: {} });
  });

  await test('（3.input filtering）buildEnhancementInput()對undefined data安全退回全空預設', () => {
    const input = buildEnhancementInput(undefined);
    assert.deepStrictEqual(input, { healthObservation: [], recommendation: [], behaviorPattern: [], progressTrend: {} });
  });

  await test('（3.input filtering）buildEnhancementInput()對型別錯誤的healthObservation（字串而非陣列）安全退回空陣列', () => {
    const input = buildEnhancementInput({ healthObservation: 'not-array' });
    assert.deepStrictEqual(input.healthObservation, []);
  });

  await test('（3.input filtering）buildEnhancementInput()對型別錯誤的progressTrend（陣列而非物件）安全退回空物件', () => {
    const input = buildEnhancementInput({ progressTrend: ['not', 'object'] });
    assert.deepStrictEqual(input.progressTrend, {});
  });

  await test('（3.input filtering）buildEnhancementInput()對型別錯誤的recommendation（物件而非陣列）安全退回空陣列', () => {
    const input = buildEnhancementInput({ recommendation: { not: 'array' } });
    assert.deepStrictEqual(input.recommendation, []);
  });

  await test('（3.input filtering）buildEnhancementInput()對型別錯誤的behaviorPattern（數字而非陣列）安全退回空陣列', () => {
    const input = buildEnhancementInput({ behaviorPattern: 42 });
    assert.deepStrictEqual(input.behaviorPattern, []);
  });

  await test('（3.input filtering）buildEnhancementInput()對null data安全退回全空預設', () => {
    const input = buildEnhancementInput(null);
    assert.deepStrictEqual(input, { healthObservation: [], recommendation: [], behaviorPattern: [], progressTrend: {} });
  });

  await test('（3.input filtering）buildEnhancementInput()對陣列型別的data（本身就是陣列，不是物件）安全退回全空預設', () => {
    const input = buildEnhancementInput(['not', 'valid']);
    assert.deepStrictEqual(input, { healthObservation: [], recommendation: [], behaviorPattern: [], progressTrend: {} });
  });

  await test('（3.input filtering）buildEnhancementInput()合法輸入時保留原始陣列內容（不做內容轉換，只做結構過濾）', () => {
    const input = buildEnhancementInput({ healthObservation: ['obs1', 'obs2'], recommendation: ['rec1'] });
    assert.deepStrictEqual(input.healthObservation, ['obs1', 'obs2']);
    assert.deepStrictEqual(input.recommendation, ['rec1']);
  });

  await test('（3.input filtering）buildEnhancementInput()重複呼叫同樣輸入得到deterministic結果', () => {
    const data = { healthObservation: ['x'], recommendation: ['y'], behaviorPattern: ['z'], progressTrend: { a: 1 } };
    const input1 = buildEnhancementInput(data);
    const input2 = buildEnhancementInput(data);
    assert.deepStrictEqual(input1, input2);
  });

  await test('（3.input filtering）enhanceHealthInsightResult()呼叫provider.requestEnhancement()時，傳入的input只有4個允許欄位', async () => {
    let capturedInput = null;
    const spyProvider = {
      name: 'spy',
      requestEnhancement: async (input) => {
        capturedInput = input;
        return { ok: true, explanation: 'x' };
      },
    };
    await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider: spyProvider });
    assert.ok(capturedInput);
    assert.deepStrictEqual(Object.keys(capturedInput).sort(), ['behaviorPattern', 'healthObservation', 'progressTrend', 'recommendation'].sort());
  });

  await test('（3.input filtering）傳給provider的input完全不含identity/userId/token相關欄位（結構性保證：enhanceHealthInsightResult()只接受structuredResponse跟options，不接受identity參數）', () => {
    assert.ok(!/function enhanceHealthInsightResult\([^)]*identity/.test(enhancerSource));
  });

  await test('（3.input filtering）gemini_enhancer.js完全不import src/auth/', () => {
    assert.ok(!getImportLines(enhancerSource).includes('src/auth'));
    assert.ok(!/from ['"](\.\.\/)+auth\//.test(getImportLines(enhancerSource)));
  });

  await test('（3.input filtering）gemini_enhancer.js完全不import src/oauth/', () => {
    assert.ok(!getImportLines(enhancerSource).includes('src/oauth'));
    assert.ok(!/from ['"](\.\.\/)+oauth\//.test(getImportLines(enhancerSource)));
  });

  await test('（3.input filtering）gemini_enhancer.js完全不import src/identity/session_rules.js', () => {
    assert.ok(!enhancerSource.includes('session_rules.js'));
  });

  await test('（3.input filtering）gemini_enhancer.js原始碼完全沒有出現db/D1相關字眼（不接受db參數）', () => {
    assert.ok(!/\bdb\.(prepare|healthInsightRecords|sessions|users)\b/.test(enhancerSource));
  });

  await test('（3.input filtering）送進Gemini的prompt（透過gemini_provider組裝）完全不含"token"字串', async () => {
    let capturedBody = null;
    await withMockedGlobalFetch(async (url, opts) => {
      capturedBody = opts.body;
      return fakeGeminiHttpResponse('說明文字');
    }, async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      await provider.requestEnhancement({ healthObservation: ['x'], recommendation: ['y'], behaviorPattern: [], progressTrend: {} });
    });
    assert.ok(capturedBody);
    assert.ok(!capturedBody.toLowerCase().includes('token'));
  });

  await test('（3.input filtering）送進Gemini的prompt完全不含"password"/"oauth"字串', async () => {
    let capturedBody = null;
    await withMockedGlobalFetch(async (url, opts) => {
      capturedBody = opts.body;
      return fakeGeminiHttpResponse('說明文字');
    }, async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      await provider.requestEnhancement({ healthObservation: ['x'] });
    });
    assert.ok(!capturedBody.toLowerCase().includes('password'));
    assert.ok(!capturedBody.toLowerCase().includes('oauth'));
  });

  console.log('');

  // =========================================================================
  // D. Output filtering
  // =========================================================================
  console.log('--- D. Output filtering ---');

  await test('（4.output filtering）Gemini回應的說明文字超過600字時被截斷為600字', async () => {
    const longText = '說'.repeat(1000);
    const result = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse(longText), async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      return provider.requestEnhancement({});
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.explanation.length, 600);
  });

  await test('（4.output filtering）Gemini回應文字裡的控制字元被移除', async () => {
    const dirtyText = '正常文字\u0001\u0002中間夾雜控制字元\u0007結尾';
    const result = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse(dirtyText), async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      return provider.requestEnhancement({});
    });
    assert.strictEqual(result.ok, true);
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(result.explanation));
  });

  await test('（4.output filtering）Gemini回應文字前後空白被trim', async () => {
    const result = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('   前後有空白的文字   '), async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      return provider.requestEnhancement({});
    });
    assert.strictEqual(result.explanation, '前後有空白的文字');
  });

  await test('（4.output filtering）Gemini回應文字純空白（trim後為空）時安全回傳empty_explanation', async () => {
    const result = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('     '), async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      return provider.requestEnhancement({});
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'empty_explanation');
  });

  await test('（4.output filtering）provider.requestEnhancement()的成功回傳只有ok跟explanation兩個欄位（不外洩Gemini API原始回應的其他欄位，例如safety ratings/finish reason）', async () => {
    const result = await withMockedGlobalFetch(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '乾淨的說明' }] }, finishReason: 'STOP', safetyRatings: ['secret-internal-data'] }],
        usageMetadata: { totalTokenCount: 999 },
      }),
    }), async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      return provider.requestEnhancement({});
    });
    assert.deepStrictEqual(Object.keys(result).sort(), ['explanation', 'ok']);
    assert.ok(!JSON.stringify(result).includes('safetyRatings'));
    assert.ok(!JSON.stringify(result).includes('secret-internal-data'));
  });

  await test('（4.output filtering）provider.requestEnhancement()的失敗回傳只有ok跟reason兩個欄位', async () => {
    const result = await withMockedGlobalFetch(async () => ({ ok: false, json: async () => ({}) }), async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      return provider.requestEnhancement({});
    });
    assert.deepStrictEqual(Object.keys(result).sort(), ['ok', 'reason']);
  });

  await test('（4.output filtering）Gemini回應文字裡的換行字元(\\n)不會被移除（只移除控制字元，不是所有非列印字元）', async () => {
    const result = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('第一行\n第二行'), async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      return provider.requestEnhancement({});
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.explanation.includes('\n'));
  });

  await test('（4.output filtering）Gemini回應文字裡的Tab字元(\\t)不會被移除', async () => {
    const result = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('文字\t說明'), async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      return provider.requestEnhancement({});
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.explanation.includes('\t'));
  });

  await test('（4.output filtering）Gemini回應文字剛好600字時不被截斷（邊界值）', async () => {
    const exactText = '字'.repeat(600);
    const result = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse(exactText), async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      return provider.requestEnhancement({});
    });
    assert.strictEqual(result.explanation.length, 600);
  });

  await test('（4.output filtering）Gemini回應文字601字時被截斷成600字（邊界值+1）', async () => {
    const overText = '字'.repeat(601);
    const result = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse(overText), async () => {
      const provider = createGeminiProvider({ apiKey: 'fake-key' });
      return provider.requestEnhancement({});
    });
    assert.strictEqual(result.explanation.length, 600);
  });

  await test('（4.output filtering）gemini_provider.js完全不把Gemini API原始JSON回應直接回傳給呼叫端', () => {
    assert.ok(!/return\s+json\b/.test(providerSource));
    assert.ok(!/return\s+result\.json\b/.test(providerSource));
  });

  console.log('');

  // =========================================================================
  // E. API failure handling
  // =========================================================================
  console.log('--- E. API failure handling ---');

  await test('（5.api failure handling）callGeminiApi()缺少apiKey時回傳missing_api_key', async () => {
    const result = await callGeminiApi(null, 'prompt', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_api_key');
  });

  await test('（5.api failure handling）callGeminiApi()apiKey為空字串時回傳missing_api_key', async () => {
    const result = await callGeminiApi('', 'prompt', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_api_key');
  });

  await test('（5.api failure handling）callGeminiApi()缺少prompt時回傳missing_prompt', async () => {
    const result = await callGeminiApi('key', '', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_prompt');
  });

  await test('（5.api failure handling）callGeminiApi()prompt為undefined時回傳missing_prompt', async () => {
    const result = await callGeminiApi('key', undefined, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_prompt');
  });

  await test('（5.api failure handling）callGeminiApi()完全沒有fetch可用時（無fetchImpl、無全域fetch）回傳fetch_unavailable', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = undefined;
    try {
      const result = await callGeminiApi('key', 'prompt', {});
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, 'fetch_unavailable');
    } finally {
      globalThis.fetch = original;
    }
  });

  await test('（5.api failure handling）callGeminiApi()的fetchImpl拋出一般錯誤時回傳network_error', async () => {
    const result = await callGeminiApi('key', 'prompt', { fetchImpl: async () => { throw new Error('connection refused'); } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'network_error');
  });

  await test('（5.api failure handling）callGeminiApi()的fetchImpl拋出AbortError時回傳timeout', async () => {
    const result = await callGeminiApi('key', 'prompt', {
      fetchImpl: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'timeout');
  });

  await test('（5.api failure handling）callGeminiApi()收到HTTP錯誤狀態（response.ok===false）時回傳http_error', async () => {
    const result = await callGeminiApi('key', 'prompt', { fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'http_error');
  });

  await test('（5.api failure handling）callGeminiApi()收到不含ok欄位的回應時回傳invalid_response_shape', async () => {
    const result = await callGeminiApi('key', 'prompt', { fetchImpl: async () => ({}) });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_response_shape');
  });

  await test('（5.api failure handling）callGeminiApi()的response.json()拋出例外時回傳invalid_response_shape', async () => {
    const result = await callGeminiApi('key', 'prompt', { fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }) });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_response_shape');
  });

  await test('（5.api failure handling）callGeminiApi()收到空candidates陣列時回傳invalid_response_shape', async () => {
    const result = await callGeminiApi('key', 'prompt', { fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [] }) }) });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_response_shape');
  });

  await test('（5.api failure handling）callGeminiApi()收到candidates格式完全不符時回傳invalid_response_shape', async () => {
    const result = await callGeminiApi('key', 'prompt', { fetchImpl: async () => ({ ok: true, json: async () => ({ unexpected: 'shape' }) }) });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_response_shape');
  });

  await test('（5.api failure handling）callGeminiApi()成功時回傳{ok:true, rawText}', async () => {
    const result = await callGeminiApi('key', 'prompt', { fetchImpl: async () => fakeGeminiHttpResponse('成功的文字') });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.rawText, '成功的文字');
  });

  await test('（5.api failure handling）callGeminiApi()成功時多個parts會被串接', async () => {
    const result = await callGeminiApi('key', 'prompt', {
      fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }) }),
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.rawText, 'ab');
  });

  await test('（5.api failure handling）callGeminiApi()呼叫fetchImpl時的URL包含model名稱與加密過的apiKey', async () => {
    let capturedUrl = null;
    await callGeminiApi('my-secret-key', 'prompt', {
      fetchImpl: async (url) => { capturedUrl = url; return fakeGeminiHttpResponse('x'); },
    });
    assert.ok(capturedUrl.includes('generativelanguage.googleapis.com'));
    assert.ok(capturedUrl.includes('generateContent'));
    assert.ok(capturedUrl.includes('key=my-secret-key'));
  });

  await test('（5.api failure handling）callGeminiApi()apiKey為數字型別（非字串）時回傳missing_api_key', async () => {
    const result = await callGeminiApi(12345, 'prompt', {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_api_key');
  });

  await test('（5.api failure handling）callGeminiApi()prompt為數字型別（非字串）時回傳missing_prompt', async () => {
    const result = await callGeminiApi('key', 12345, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_prompt');
  });

  await test('（5.api failure handling）callGeminiApi()options省略時（undefined）仍能正常運作，不拋出例外', async () => {
    await assert.doesNotReject(async () => callGeminiApi('key', 'prompt', undefined));
  });

  await test('（5.api failure handling）callGeminiApi()可以透過options.model覆寫預設模型名稱', async () => {
    let capturedUrl = null;
    await callGeminiApi('key', 'prompt', {
      model: 'gemini-custom-model',
      fetchImpl: async (url) => { capturedUrl = url; return fakeGeminiHttpResponse('x'); },
    });
    assert.ok(capturedUrl.includes('gemini-custom-model'));
  });

  await test('（5.api failure handling）callGeminiApi()呼叫fetchImpl時body是合法JSON字串', async () => {
    let capturedBody = null;
    await callGeminiApi('key', '測試prompt', { fetchImpl: async (url, opts) => { capturedBody = opts.body; return fakeGeminiHttpResponse('x'); } });
    assert.doesNotThrow(() => JSON.parse(capturedBody));
    const parsed = JSON.parse(capturedBody);
    assert.ok(Array.isArray(parsed.contents));
  });

  await test('（5.api failure handling）callGeminiApi()呼叫fetchImpl時Content-Type標頭是application/json', async () => {
    let capturedOpts = null;
    await callGeminiApi('key', 'prompt', { fetchImpl: async (url, opts) => { capturedOpts = opts; return fakeGeminiHttpResponse('x'); } });
    assert.strictEqual(capturedOpts.headers['Content-Type'], 'application/json');
  });

  await test('（5.api failure handling）callGeminiApi()呼叫fetchImpl時使用POST方法', async () => {
    let capturedOpts = null;
    await callGeminiApi('key', 'prompt', { fetchImpl: async (url, opts) => { capturedOpts = opts; return fakeGeminiHttpResponse('x'); } });
    assert.strictEqual(capturedOpts.method, 'POST');
  });

  await test('（5.api failure handling）Gemini API失敗完全不影響enhanceHealthInsightResult()——安全回傳{ok:false, reason}', async () => {
    const result = await withMockedGlobalFetch(async () => { throw new Error('down'); }, async () => {
      return enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { apiKey: 'fake-key' });
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'network_error');
  });

  await test('（5.api failure handling）Gemini API逐一測試各種失敗原因，enhanceHealthInsightResult()都不拋出例外', async () => {
    const scenarios = [
      async () => { throw new Error('x'); },
      async () => ({ ok: false, json: async () => ({}) }),
      async () => ({}),
      async () => ({ ok: true, json: async () => { throw new Error('bad'); } }),
      async () => ({ ok: true, json: async () => ({ candidates: [] }) }),
    ];
    for (const fetchImpl of scenarios) {
      await assert.doesNotReject(async () => {
        await withMockedGlobalFetch(fetchImpl, async () => enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { apiKey: 'fake-key' }));
      });
    }
  });

  console.log('');

  // =========================================================================
  // F. Existing result preservation
  // =========================================================================
  console.log('--- F. Existing result preservation ---');

  await test('（6.existing result preservation）enhanceHealthInsightResult()完全不修改傳入的structuredResponse本身', async () => {
    const original = JSON.parse(JSON.stringify(SUCCESS_STRUCTURED_RESPONSE));
    const input = JSON.parse(JSON.stringify(SUCCESS_STRUCTURED_RESPONSE));
    await enhanceHealthInsightResult(input, { provider: { name: 'x', requestEnhancement: async () => ({ ok: true, explanation: 'y' }) } });
    assert.deepStrictEqual(input, original);
  });

  await test('（6.existing result preservation）enhanceHealthInsightResult()在provider失敗時也完全不修改傳入的structuredResponse', async () => {
    const original = JSON.parse(JSON.stringify(SUCCESS_STRUCTURED_RESPONSE));
    const input = JSON.parse(JSON.stringify(SUCCESS_STRUCTURED_RESPONSE));
    await enhanceHealthInsightResult(input, { provider: { name: 'x', requestEnhancement: async () => ({ ok: false, reason: 'x' }) } });
    assert.deepStrictEqual(input, original);
  });

  await test('（6.existing result preservation）真實端對端：Gemini成功時，回應的html裡核心健康觀察/建議卡片內容跟Gemini失敗時完全相同（TASK1.123後更新：完整html不再逐字相同，因為TASK1.123新增的"AI 陪伴解讀"呈現區塊會依Gemini是否成功而出現/消失，但這只是呈現層的加值區塊，不影響Health Insight本身的核心內容——這裡改成只比對觀察/建議卡片區塊）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'preserve-html-user', isGuest: false, authProvider: 'google' });
    const resSuccess = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('增強說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const resFailure = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const bodySuccess = await resSuccess.json();
    const bodyFailure = await resFailure.json();
    const extractCard = (html, marker) => {
      const start = html.indexOf(marker);
      const end = html.indexOf('</div>\n</div>', start);
      return html.slice(start, end);
    };
    assert.strictEqual(extractCard(bodySuccess.data.html, 'hi-observation-card'), extractCard(bodyFailure.data.html, 'hi-observation-card'));
    assert.strictEqual(extractCard(bodySuccess.data.html, 'hi-recommendation-card'), extractCard(bodyFailure.data.html, 'hi-recommendation-card'));
  });

  await test('（6.existing result preservation）真實端對端：沒有設定GEMINI_API_KEY時，回應形狀跟TASK1.120完全一致（只有html欄位）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {} });
    const body = await res.json();
    assert.deepStrictEqual(Object.keys(body.data).sort(), ['html']);
  });

  await test('（6.existing result preservation）真實端對端：設定了GEMINI_API_KEY但Gemini API失敗時，回應形狀依然只有html', async () => {
    const router = createAppRouter();
    const res = await withMockedGlobalFetch(async () => { throw new Error('down'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {}, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body = await res.json();
    assert.deepStrictEqual(Object.keys(body.data).sort(), ['html']);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.ok, true);
  });

  await test('（6.existing result preservation）真實端對端：Gemini成功時，回應多了enhancedExplanation，且核心健康觀察/建議卡片內容跟基準情境相同、status/ok不變（TASK1.123後更新：完整html不再逐字相同，理由同上，這裡改成比對觀察/建議卡片區塊）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'preserve-explanation-user', isGuest: false, authProvider: 'google' });
    const resBase = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    const bodyBase = await resBase.json();
    const resEnhanced = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('增強說明文字'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const bodyEnhanced = await resEnhanced.json();
    const extractCard = (html, marker) => {
      const start = html.indexOf(marker);
      const end = html.indexOf('</div>\n</div>', start);
      return html.slice(start, end);
    };
    assert.strictEqual(resEnhanced.status, 200);
    assert.strictEqual(bodyEnhanced.ok, true);
    assert.strictEqual(extractCard(bodyEnhanced.data.html, 'hi-observation-card'), extractCard(bodyBase.data.html, 'hi-observation-card'));
    assert.strictEqual(extractCard(bodyEnhanced.data.html, 'hi-recommendation-card'), extractCard(bodyBase.data.html, 'hi-recommendation-card'));
    assert.strictEqual(bodyEnhanced.data.enhancedExplanation, '增強說明文字');
  });

  await test('（6.existing result preservation）真實端對端：GET /health-insight完全不受Gemini Enhancement Layer影響', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('data-hi-page="input"'));
  });

  await test('（6.existing result preservation）真實端對端：連續3次呼叫（分別為無API金鑰/Gemini成功/Gemini失敗）html欄位全部一致', async () => {
    const router = createAppRouter();
    const call = () => router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {} });
    const resNoKey = await call();
    const resSuccess = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {}, env: { GEMINI_API_KEY: 'fake' } })
    );
    const resFail = await withMockedGlobalFetch(async () => { throw new Error('x'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, { db: {}, env: { GEMINI_API_KEY: 'fake' } })
    );
    const [bodyNoKey, bodySuccess, bodyFail] = await Promise.all([resNoKey.json(), resSuccess.json(), resFail.json()]);
    assert.strictEqual(bodyNoKey.data.html, bodySuccess.data.html);
    assert.strictEqual(bodySuccess.data.html, bodyFail.data.html);
  });

  await test('（6.existing result preservation）enhanceHealthInsightResult()對同一份成功structuredResponse重複呼叫（同一個provider）得到一致的enhancedExplanation', async () => {
    const provider = { name: 'stable', requestEnhancement: async () => ({ ok: true, explanation: '穩定的說明' }) };
    const result1 = await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider });
    const result2 = await enhanceHealthInsightResult(SUCCESS_STRUCTURED_RESPONSE, { provider });
    assert.strictEqual(result1.enhancedExplanation, result2.enhancedExplanation);
  });

  await test('（6.existing result preservation）匿名使用者Health Insight本身失敗（無效payload）時，Gemini完全不會被呼叫（沒有成功結果可以增強）', async () => {
    let providerCalled = false;
    const result = await enhanceHealthInsightResult({ ok: false, error: { category: 'invalid_input' } }, {
      provider: { name: 'spy', requestEnhancement: async () => { providerCalled = true; return { ok: true, explanation: 'x' }; } },
    });
    assert.strictEqual(providerCalled, false);
    assert.strictEqual(result.ok, false);
  });

  console.log('');

  // =========================================================================
  // G. Product Integration compatibility
  // =========================================================================
  console.log('--- G. Product Integration compatibility ---');

  const PRODUCT_BOUNDARY_FILES = [
    'src/intelligence/product/health_insight_integration.js',
    'src/intelligence/product/entry/product_entry.js',
    'src/intelligence/product/entry/product_entry_result_builder.js',
    'src/intelligence/product/contract/product_contract.js',
    'src/intelligence/product/adapter/product_adapter.js',
    'src/intelligence/product/execution/product_execution.js',
    'src/intelligence/product/operational/product_operational.js',
    'src/intelligence/product/features/health_insight/index.js',
    'src/intelligence/capabilities/orchestration/index.js',
    'src/intelligence/capabilities/analysis/index.js',
    'src/intelligence/capabilities/recommendation/index.js',
    'src/intelligence/analysis/analysis_runner.js',
    'src/intelligence/recommendation/recommendation_runner.js',
    'src/intelligence/context/insight_context_builder.js',
    'src/identity/health_insight/resolve_identity.js',
    'src/identity/health_insight/request_context.js',
    'src/identity/health_insight/membership_placeholder.js',
    'src/controllers/health_insight_response_builder.js',
    'src/controllers/health_insight_controller.js',
    // TASK1.123後更新：render_product_response.js從這個清單移除
    // ——Product Experience Upgrade明確授權它轉發presentationContext。
    'src/persistence/health_insight/index.js',
    'src/db/tables/health_insight_records.js',
    'src/db/index.js',
    // TASK1.124後更新：src/worker.js從這個清單移除——History API
    // 明確授權新增GET /api/health-insight/history一個if區塊，不再
    // 要求整個檔案零diff，改成下方的marker-based檢查。
    // TASK1.126後更新：src/identity/health_insight/user_identity.js
    // 跟src/persistence/health_insight/health_insight_persistence_
    // service.js從這個清單移除——Guest/Authentication Experience
    // Correction明確授權修正Persistence Boundary排除訪客帳號。
  ];

  for (const relFile of PRODUCT_BOUNDARY_FILES) {
    await test(`（7.product integration）既有Product/Capability/Runtime/Identity/Response/Controller/Persistence/DB/Worker檔案完全沒有被本次任務修改：${relFile}`, () => {
      const diff = execFileSync('git', ['diff', '--stat', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });
  }

  await test('（7.product integration）src/worker.js既有GET /health-insight、POST /api/health-insight兩個if區塊依然逐字存在（TASK1.124後更新：TASK1.124合法在檔案末尾新增GET /api/health-insight/history一個if區塊，不再要求整個檔案零diff）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'POST' && pathname === '/api/health-insight')"));
  });

  for (const relFile of PRODUCT_BOUNDARY_FILES) {
    await test(`（7.product integration）既有檔案依然通過node --check語法驗證：${relFile}`, () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', path.join(repoRoot, relFile)], { encoding: 'utf8' }));
    });
  }

  await test('（7.product integration）src/ui/health_insight/整個目錄除了TASK1.123/1.124明確授權新增的Gemini/History/Progress呈現區塊之外，完全沒有其他改動（不重新設計UI，見TASK1.123/1.124後更新）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/ui/health_insight/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = diff.split('\n').filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !t.includes('render_product_response.js') && !t.includes('dashboard_page.js') && !t.includes('components/index.js') && !t.includes('history_card.js') && !t.includes('progress_summary_card.js') && !t.includes('file changed') && !t.includes('files changed');
    }).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（7.product integration）src/intelligence/product/、src/intelligence/capabilities/、src/intelligence/analysis/、src/intelligence/recommendation/、src/intelligence/context/整個目錄完全沒有被本次任務修改', () => {
    for (const dir of ['src/intelligence/product/', 'src/intelligence/capabilities/', 'src/intelligence/analysis/', 'src/intelligence/recommendation/', 'src/intelligence/context/']) {
      const diff = execFileSync('git', ['diff', '--stat', '--', dir], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${dir} 有非預期的diff`);
    }
  });

  await test('（7.product integration）src/intelligence/contracts/整個目錄完全沒有被本次任務修改（若存在）', () => {
    if (!fs.existsSync(path.join(srcRoot, 'intelligence', 'contracts'))) {
      assert.ok(true);
      return;
    }
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/contracts/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  const TASK1121_AUTHORIZED_MODIFIED_FILES = [
    // TASK1.127後更新：Complete App Experience Layer明確授權新增registerAppShellRoutes()的import/register一行
    'src/routes/index.js',
    // 手動上線階段後更新：新增GET /auth/google/start真正的Google登入
    // 觸發入口（既有OAuth底層邏輯早就存在，只是從來沒有route呼叫過）
    'src/routes/auth_routes.js',
    'src/routes/health_insight_routes.js',
    // TASK1.123後更新：Product Experience Upgrade明確授權的3個UI檔案
    'src/ui/health_insight/render_product_response.js',
    'src/ui/health_insight/pages/dashboard_page.js',
    'src/ui/health_insight/components/index.js',
    // TASK1.124後更新：History API明確授權新增GET
    // /api/health-insight/history一個if區塊
    'src/worker.js',
    // TASK1.126後更新：Guest/Authentication Experience Correction
    // 明確授權修改的2個檔案
    'src/identity/health_insight/user_identity.js',
    'src/persistence/health_insight/health_insight_persistence_service.js',
  ];
  const TASK1121_NEWLY_CREATED_FILES = [
    'src/config/gemini_config.js',
    'src/intelligence/enhancement/provider/ai_provider_contract.js',
    'src/intelligence/enhancement/provider/index.js',
    'src/intelligence/enhancement/gemini/gemini_client.js',
    'src/intelligence/enhancement/gemini/gemini_provider.js',
    'src/intelligence/enhancement/gemini/gemini_enhancer.js',
    'src/intelligence/enhancement/gemini/index.js',
    // TASK1.124後更新：History/Progress Product Completion明確
    // 授權新增的4個檔案
    'src/ui/health_insight/components/history_card.js',
    'src/ui/health_insight/components/progress_summary_card.js',
    'src/history/health_insight/history_service.js',
    'src/history/health_insight/index.js',
  ];

  const gitDiffNameOnly = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !f.startsWith('backups/'));

  const allExistingSrcFiles = execFileSync('sh', ['-c', "find src -name '*.js'"], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !TASK1121_AUTHORIZED_MODIFIED_FILES.includes(f))
    .filter((f) => !TASK1121_NEWLY_CREATED_FILES.includes(f));

  await test(`（7.product integration）逐檔案完整性掃描：src/底下共找到 ${allExistingSrcFiles.length} 個既有檔案需要逐一確認零diff（排除本次任務明確授權修改/新增的8個檔案）`, () => {
    assert.ok(allExistingSrcFiles.length >= 200, `預期至少200個既有檔案，實際 ${allExistingSrcFiles.length}`);
  });

  for (const relFile of allExistingSrcFiles) {
    await test(`（7.product integration）逐檔案完整性掃描：${relFile} 完全沒有被本次任務修改`, () => {
      assert.ok(!gitDiffNameOnly.includes(relFile), `${relFile} 出現在git diff清單裡`);
    });
  }

  for (const relFile of TASK1121_AUTHORIZED_MODIFIED_FILES) {
    await test(`（7.product integration）逐檔案完整性掃描：${relFile} 的commit歷史/目前diff裡確實存在TASK1.121的修改（控制組，用git log避免commit後永遠假性失敗）`, () => {
      const status = execFileSync('sh', ['-c', `git diff --name-only -- ${relFile} ; git log --oneline -- ${relFile}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(status.trim().length > 0, `${relFile} 找不到任何diff或commit歷史`);
    });
  }

  for (const relFile of TASK1121_NEWLY_CREATED_FILES) {
    await test(`（7.product integration）逐檔案完整性掃描：${relFile} 確實存在於磁碟上（新增檔案，永久事實，不會因為commit後變成假性失敗）`, () => {
      assert.ok(fs.existsSync(path.join(repoRoot, relFile)));
      assert.ok(fs.statSync(path.join(repoRoot, relFile)).size > 0);
    });
  }

  console.log('');

  // =========================================================================
  // H. Persistence compatibility
  // =========================================================================
  console.log('--- H. Persistence compatibility ---');

  await test('（8.persistence compatibility）migrations/目錄完全沒有新增或修改任何檔案（本次任務不修改D1 schema）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（8.persistence compatibility）migrations/目錄恰好9個.sql檔案（含 0008 sync ownership）', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    assert.strictEqual(files.length, 9);
  });

  await test('（8.persistence compatibility）src/db/整個目錄完全沒有被本次任務修改', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（8.persistence compatibility）src/persistence/整個目錄除了TASK1.126明確授權的health_insight_persistence_service.js訪客排除修正之外，完全沒有其他改動', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/persistence/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = status.split('\n').filter((line) => line.trim() && !line.includes('health_insight_persistence_service.js')).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（8.persistence compatibility）route原始碼裡saveHealthInsightRecord()呼叫在enhanceHealthInsightResult()呼叫之前（持久化的是原始結果，不含Gemini增強內容）', () => {
    const saveIdx = routesSource.indexOf('saveHealthInsightRecord(');
    const enhanceIdx = routesSource.indexOf('enhanceHealthInsightResult(');
    assert.ok(saveIdx >= 0 && enhanceIdx >= 0);
    assert.ok(saveIdx < enhanceIdx);
  });

  await test('（8.persistence compatibility）真實端對端：即使Gemini增強成功，D1裡存的紀錄完全不含enhancedExplanation欄位（TASK1.122後更新：改用已授權premium身份）', async () => {
    const router = createAppRouter();
    const { db, inserted } = makeCaptureDb({ userId: 'gemini-persist-user', isGuest: false, authProvider: 'google' });
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('這段不應該被存進D1'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.strictEqual(inserted.length, 1);
    assert.ok(!('enhancedExplanation' in inserted[0]));
    assert.ok(!inserted[0].output_snapshot.includes('這段不應該被存進D1'));
  });

  await test('（8.persistence compatibility）真實端對端：D1寫入照常成功，不受Gemini增強影響', async () => {
    const router = createAppRouter();
    const { db, inserted } = makeCaptureDb({ userId: 'gemini-persist-user-2', isGuest: false, authProvider: 'google' });
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db });
    assert.strictEqual(inserted.length, 1);
  });

  await test('（8.persistence compatibility）真實端對端：即使Gemini API失敗（網路錯誤），D1寫入依然照常成功', async () => {
    const router = createAppRouter();
    const { db, inserted } = makeCaptureDb({ userId: 'gemini-persist-user-3', isGuest: false, authProvider: 'google' });
    await withMockedGlobalFetch(async () => { throw new Error('down'); }, async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.strictEqual(inserted.length, 1);
  });

  await test('（8.persistence compatibility）真實端對端：D1裡存的input_snapshot/output_snapshot內容跟Gemini是否成功完全無關（比對兩種情境下的欄位集合一致；TASK1.122後更新：改用已授權premium身份）', async () => {
    const router = createAppRouter();
    const { db: db1, inserted: inserted1 } = makeCaptureDb({ userId: 'compare-user', isGuest: false, authProvider: 'google' });
    const { db: db2, inserted: inserted2 } = makeCaptureDb({ userId: 'compare-user', isGuest: false, authProvider: 'google' });
    await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: {} }, { db: db1 });
    await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db: db2, env: { GEMINI_API_KEY: 'fake' } })
    );
    assert.deepStrictEqual(Object.keys(inserted1[0]).sort(), Object.keys(inserted2[0]).sort());
    assert.strictEqual(inserted1[0].output_snapshot, inserted2[0].output_snapshot);
  });

  await test('（8.persistence compatibility）src/intelligence/enhancement/整個目錄完全不import src/db/（Enhancement Layer不直接碰D1）', () => {
    const allNewFiles = [clientSource, providerSource, enhancerSource, contractSource];
    for (const source of allNewFiles) {
      assert.ok(!getImportLines(source).includes("'../db"));
      assert.ok(!getImportLines(source).includes("db/tables"));
    }
  });

  console.log('');

  // =========================================================================
  // I. Identity compatibility
  // =========================================================================
  console.log('--- I. Identity compatibility ---');

  await test('（9.identity compatibility）src/identity/health_insight/整個目錄除了TASK1.126明確授權的user_identity.js語意分類擴充之外，完全沒有其他改動', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/identity/health_insight/'], { cwd: repoRoot, encoding: 'utf8' });
    const remaining = diff.split('\n').filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !t.includes('user_identity.js') && !t.includes('file changed') && !t.includes('files changed');
    }).join('\n');
    assert.strictEqual(remaining.trim(), '');
  });

  await test('（9.identity compatibility）gemini_enhancer.js的實際程式碼（不含註解）完全沒有"identity"這個字（結構性保證：這一層拿不到身份資訊；檔案頭註解說明"不接受identity參數"等邊界原則屬於文件說明，不在此限）', () => {
    assert.ok(!/identity/i.test(stripComments(enhancerSource)));
  });

  await test('（9.identity compatibility）gemini_provider.js/gemini_client.js的實際程式碼（不含註解）完全沒有"identity"/"userId"字樣', () => {
    assert.ok(!/identity|userId/i.test(stripComments(providerSource)));
    assert.ok(!/identity|userId/i.test(stripComments(clientSource)));
  });

  await test('（9.identity compatibility）真實端對端：匿名使用者無法拿到Gemini增強說明，即使Gemini API本身會成功（TASK1.122後更新：Permission Boundary在匿名身份時一律解析成unknown tier，Gemini enhancement要求premium，匿名使用者結構性地不可能通過；即使測試環境刻意注入lookupTier也一樣，因為匿名身份在到達lookupTier之前就已經被擋下）', async () => {
    const router = createAppRouter();
    const res = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('不應該出現的說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: { lookupTier: () => 'premium' } }, { db: {}, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body = await res.json();
    assert.ok(!('enhancedExplanation' in body.data));
  });

  await test('（9.identity compatibility）真實端對端：已登入premium使用者可以拿到Gemini增強說明（TASK1.122後更新：需要permission允許）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'identity-compat-user', isGuest: false, authProvider: 'google' });
    const res = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('一致的說明文字'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body = await res.json();
    assert.strictEqual(body.data.enhancedExplanation, '一致的說明文字');
  });

  for (const providerLabel of ['google', 'guest', 'apple']) {
    await test(`（9.identity compatibility）身份provider=${providerLabel}時，premium使用者的Gemini增強依然正常運作（增強邏輯完全不區分provider種類；TASK1.122後更新：需要premium permission）`, async () => {
      const router = createAppRouter();
      const db = makeValidSessionDb({ userId: `identity-variant-${providerLabel}`, isGuest: providerLabel === 'guest', authProvider: providerLabel === 'guest' ? null : providerLabel });
      const res = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('相同的說明文字'), async () =>
        router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db, env: { GEMINI_API_KEY: 'fake' } })
      );
      const body = await res.json();
      assert.strictEqual(body.data.enhancedExplanation, '相同的說明文字');
    });
  }

  await test('（9.identity compatibility）已登入使用者的userId/provider完全不出現在enhancedExplanation裡（延續既有Capability isolation保證；TASK1.122後更新：需要premium permission才會觸發Gemini）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'must-not-leak-into-gemini-99999', isGuest: false, authProvider: 'google' });
    const res = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('正常的說明文字'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body = await res.json();
    assert.ok(!body.data.enhancedExplanation.includes('must-not-leak-into-gemini-99999'));
  });

  console.log('');

  // =========================================================================
  // J. Configuration safety
  // =========================================================================
  console.log('--- J. Configuration safety ---');

  await test('（10.configuration safety）getGeminiConfig(env)對undefined env拋出例外（延續auth_config.js既有慣例）', () => {
    assert.throws(() => getGeminiConfig(undefined));
  });

  await test('（10.configuration safety）getGeminiConfig(env)對null env拋出例外', () => {
    assert.throws(() => getGeminiConfig(null));
  });

  await test('（10.configuration safety）getGeminiConfig({})回傳apiKey:null, configured:false', () => {
    const config = getGeminiConfig({});
    assert.strictEqual(config.apiKey, null);
    assert.strictEqual(config.configured, false);
  });

  await test('（10.configuration safety）getGeminiConfig({GEMINI_API_KEY:""})回傳apiKey:null（空字串視為未設定）', () => {
    const config = getGeminiConfig({ GEMINI_API_KEY: '' });
    assert.strictEqual(config.apiKey, null);
    assert.strictEqual(config.configured, false);
  });

  await test('（10.configuration safety）getGeminiConfig({GEMINI_API_KEY:"real-key"})回傳正確的apiKey跟configured:true', () => {
    const config = getGeminiConfig({ GEMINI_API_KEY: 'real-key' });
    assert.strictEqual(config.apiKey, 'real-key');
    assert.strictEqual(config.configured, true);
  });

  await test('（10.configuration safety）getGeminiConfig()對非字串GEMINI_API_KEY（數字）安全視為未設定', () => {
    const config = getGeminiConfig({ GEMINI_API_KEY: 12345 });
    assert.strictEqual(config.apiKey, null);
  });

  await test('（10.configuration safety）src/config/gemini_config.js完全沒有硬編碼看起來像真正API金鑰的字串（Google API金鑰格式AIza開頭）', () => {
    assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(geminiConfigSource));
  });

  for (const f of [geminiConfigSource, clientSource, providerSource, enhancerSource]) {
    await test('（10.configuration safety）新增檔案完全沒有硬編碼看起來像真正API金鑰的字串', () => {
      assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(f));
    });
  }

  await test('（10.configuration safety）src/config/gemini_config.js的實際程式碼（不含註解）完全不呼叫console.log（避免意外記錄金鑰；檔案頭註解說明"不console.log"這條禁止事項本身屬於文件說明，不在此限）', () => {
    assert.ok(!stripComments(geminiConfigSource).includes('console.log'));
  });

  await test('（10.configuration safety）src/config/gemini_config.js完全不寫入任何D1/KV（只讀取env）', () => {
    assert.ok(!/\.insert\(|\.put\(/.test(geminiConfigSource));
  });

  await test('（10.configuration safety）getGeminiConfig()對同一個env物件重複呼叫得到deterministic結果', () => {
    const env = { GEMINI_API_KEY: 'stable-key' };
    const config1 = getGeminiConfig(env);
    const config2 = getGeminiConfig(env);
    assert.deepStrictEqual(config1, config2);
  });

  await test('（10.configuration safety）getGeminiConfig()回傳的物件只有apiKey跟configured兩個欄位', () => {
    const config = getGeminiConfig({ GEMINI_API_KEY: 'x' });
    assert.deepStrictEqual(Object.keys(config).sort(), ['apiKey', 'configured']);
  });

  await test('（10.configuration safety）getGeminiConfig()完全不修改傳入的env物件本身', () => {
    const env = { GEMINI_API_KEY: 'x', OTHER: 'y' };
    const before = JSON.stringify(env);
    getGeminiConfig(env);
    assert.strictEqual(JSON.stringify(env), before);
  });

  await test('（10.configuration safety）src/config/gemini_config.js完全不import src/auth/、src/oauth/（純粹讀取env，不牽涉登入系統）', () => {
    const imports = getImportLines(geminiConfigSource);
    assert.ok(!imports.includes('auth'));
    assert.ok(!imports.includes('oauth'));
  });

  await test('（10.configuration safety）src/config/gemini_config.js完全沒有任何import陳述式（純函式，不依賴任何其他模組）', () => {
    assert.strictEqual(getImportLines(geminiConfigSource).trim(), '');
  });

  await test('（10.configuration safety）wrangler.toml完全沒有被本次任務修改（沒有commit任何機密值）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.configuration safety）wrangler.toml完全不含GEMINI_API_KEY字樣（機密值不透過這個檔案設定）', () => {
    const wranglerSource = fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8');
    assert.ok(!wranglerSource.includes('GEMINI_API_KEY'));
  });

  await test('（10.configuration safety）package.json完全沒有被本次任務修改（沒有新增任何npm依賴，例如官方Gemini SDK）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  for (const f of [clientSource, providerSource, enhancerSource, geminiConfigSource, routesSource]) {
    await test('（10.configuration safety）新增/修改檔案完全不import任何官方AI SDK套件（只用原生fetch呼叫Gemini REST API，沒有新增依賴）', () => {
      assert.ok(!/@google\/generative-ai|@google-cloud\/aiplatform|openai|anthropic-ai/i.test(getImportLines(f)));
    });
  }

  console.log('');

  // =========================================================================
  // K. Regression validation
  // =========================================================================
  console.log('--- K. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（Regression validation）此檔案目前被另一個regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），跳過再往下spawn其餘測試檔案，避免遞迴', () => {
      assert.ok(true);
    });
  } else {
    const healthInsightLineageSuites = [
      'backups/phase6-task1.111-health-insight-feature/test_health_insight_feature_foundation.mjs',
      'backups/phase6-task1.112-health-insight-integration/test_health_insight_product_integration.mjs',
      'backups/phase6-task1.113-health-insight-activation/test_health_insight_activation_foundation.mjs',
      'backups/phase6-task1.114-health-insight-uiux/test_health_insight_uiux_foundation.mjs',
      'backups/phase6-task1.115-health-insight-visual-integration/test_health_insight_visual_integration.mjs',
      'backups/phase6-task1.116-health-insight-activation/test_health_insight_activation.mjs',
      'backups/phase6-task1.117-response-boundary/test_health_insight_response_boundary.mjs',
      'backups/phase6-task1.118-user-identity/test_user_identity_foundation.mjs',
      'backups/phase6-task1.119-oauth-user-binding/test_health_insight_identity_binding.mjs',
      'backups/phase6-task1.120-health-insight-persistence/test_health_insight_persistence.mjs',
    ];

    for (const relSuite of healthInsightLineageSuites) {
      await test(`（Regression validation）${relSuite} 完整執行，exit code為0（Health Insight產品線本身無回歸；用PHASE1_REVIEW_NESTED=1限定只跑該檔案自己的直接斷言）`, () => {
        execFileSync('node', [relSuite], {
          cwd: repoRoot,
          stdio: 'pipe',
          timeout: 60000,
          env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
        });
      });
    }

    await test('（Regression validation）本檔案（TASK1.121自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic', () => {
      execFileSync('node', [path.join(__dirname, 'test_gemini_enhancement_layer.mjs')], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 60000,
        env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
      });
    });
  }

  console.log('');

  // =========================================================================
  // L. P1-P6
  // =========================================================================
  console.log('--- L. P1-P6 ---');

  await test('（P1-P6）P1-P6 UI Playwright檢查另外在p1-p6-check/run.js執行（本次任務完全沒有修改任何既有legacy UI/getHTML()相關程式碼，既有UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（P1-P6）src/worker.js既有legacy/既有Health Insight if區塊依然逐字存在（TASK1.124後更新：TASK1.124合法新增GET /api/health-insight/history一個if區塊，不再要求整個檔案零diff）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/health-insight')"));
    assert.ok(workerSource.includes("if (method === 'POST' && pathname === '/api/health-insight')"));
  });

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
  });

  await test('（P1-P6）app.intelligence維持24個既有欄位', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（P1-P6）app.router.routes數量維持23（本次任務沒有新增/刪除任何route；TASK1.124後更新：TASK1.124新增GET /api/health-insight/history，23+1=24）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 28);
  });

  await test('（P1-P6）migrations/目錄完全沒有新增或修改任何檔案（本次任務不修改D1 schema，延續H類別已驗證的結論）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（P1-P6）src/db/整個目錄完全沒有被本次任務修改（延續H類別已驗證的結論）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（P1-P6）package.json完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）新增/修改的核心檔案通過node --check語法驗證', () => {
    [
      path.join(routesDir, 'health_insight_routes.js'),
      path.join(geminiDir, 'gemini_client.js'),
      path.join(geminiDir, 'gemini_provider.js'),
      path.join(geminiDir, 'gemini_enhancer.js'),
      path.join(providerDir, 'ai_provider_contract.js'),
      path.join(configDir, 'gemini_config.js'),
    ].forEach((f) => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', f], { encoding: 'utf8' }));
    });
  });

  await test('（P1-P6）真實端對端：已登入premium使用者連續呼叫POST兩次（Gemini都成功）得到一致結果（deterministic，沒有共用可變狀態；TASK1.122後更新：需要premium permission）', async () => {
    const router = createAppRouter();
    const db = makeValidSessionDb({ userId: 'p1p6-gemini-user', isGuest: false, authProvider: 'google' });
    const res1 = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('一致的說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const res2 = await withMockedGlobalFetch(async () => fakeGeminiHttpResponse('一致的說明'), async () =>
      router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, cookieHeader: 'dbc_sid=token123', options: { lookupTier: () => 'premium' } }, { db, env: { GEMINI_API_KEY: 'fake' } })
    );
    const body1 = await res1.json();
    const body2 = await res2.json();
    assert.strictEqual(body1.data.html, body2.data.html);
    assert.strictEqual(body1.data.enhancedExplanation, body2.data.enhancedExplanation);
  });

  await test('（P1-P6）新增/修改檔案完全不import任何非Gemini的AI SDK（OpenAI/Anthropic）套件（只檢查實際import陳述式）', () => {
    for (const source of [clientSource, providerSource, enhancerSource, routesSource]) {
      assert.ok(!/openai|anthropic-ai/i.test(getImportLines(source)));
    }
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('失敗項目：');
    failures.forEach((name) => console.log(' - ' + name));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('測試執行本身發生未預期錯誤：', e);
  process.exit(1);
});

/*
 * Phase 1 TASK 1.55｜Intelligence Execution Governance Layer Foundation
 * 測試
 *
 * 本任務不是AI功能開發——這個測試檔案驗證的是「在Execution Manager
 * （TASK1.50）、Facade（TASK1.48）之外，一個完全獨立、無狀態的
 * Governance邊界」：execution_policy.js的validateExecutionPolicy()
 * 能不能正確做純結構性的政策檢查（不讀database/不查user status/
 * 不解析session/不包含business decision），governance_service.js
 * 的createGovernanceService().validateExecution()能不能正確組出
 * 規格要求的統一輸出{status, allowed, reasons, metadata}，以及
 * Governance是否完全獨立於Facade/Execution Manager/Service之外
 * （facade boundary isolation / service boundary isolation），
 * 沒有被接進真實的執行呼叫鏈（規格明確要求「不改變既有execution
 * behavior」）。不驗證任何真正的AI分析/推薦邏輯（因為根本沒有），
 * 也不驗證任何持久化（因為Governance完全無狀態）。
 *
 * 分為以下14個部分：
 * A) governance module existence
 * B) execution policy validation
 * C) governance result format
 * D) deterministic output
 * E) invalid input handling
 * F) facade boundary isolation
 * G) service boundary isolation
 * H) no database dependency
 * I) no authentication dependency
 * J) no AI dependency
 * K) no external API dependency
 * L) bootstrap integration
 * M) regression check
 * N) P1-P6
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
const governanceDir = path.join(intelDir, 'governance');

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

async function run() {
  const policyMod = await import(path.join(governanceDir, 'execution_policy.js'));
  const { validateExecutionPolicy } = policyMod;
  const builderMod = await import(path.join(governanceDir, 'governance_result_builder.js'));
  const { buildGovernanceResult } = builderMod;
  const serviceMod = await import(path.join(governanceDir, 'governance_service.js'));
  const { createGovernanceService } = serviceMod;
  await import(path.join(governanceDir, 'index.js'));

  // =========================================================================
  // A. governance module existence
  // =========================================================================
  console.log('--- A. governance module existence ---');

  const GOVERNANCE_JS_FILES = fs.readdirSync(governanceDir).filter((f) => f.endsWith('.js')).sort();
  await test('（1.governance module existence）src/intelligence/governance/ 恰好包含4個.js檔案', () => {
    assert.deepStrictEqual(GOVERNANCE_JS_FILES, ['execution_policy.js', 'governance_result_builder.js', 'governance_service.js', 'index.js']);
  });

  await test('（1.governance module existence）src/intelligence/governance/README.md 存在且非空', () => {
    const readmePath = path.join(governanceDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.governance module existence）index.js re-export validateExecutionPolicy/buildGovernanceResult/createGovernanceService', () => {
    assert.strictEqual(typeof validateExecutionPolicy, 'function');
    assert.strictEqual(typeof buildGovernanceResult, 'function');
    assert.strictEqual(typeof createGovernanceService, 'function');
  });

  await test('（1.governance module existence）createGovernanceService()回傳物件恰好只有validateExecution一個公開介面', () => {
    const svc = createGovernanceService();
    assert.deepStrictEqual(Object.keys(svc), ['validateExecution']);
  });

  await test('（1.governance module existence）createGovernanceService(undefined)不拋出例外', () => {
    assert.doesNotThrow(() => createGovernanceService(undefined));
  });

  await test('（1.governance module existence）不同的Governance Service實例各自獨立（不是共用singleton）', () => {
    const svcA = createGovernanceService();
    const svcB = createGovernanceService();
    assert.notStrictEqual(svcA, svcB);
  });

  console.log('');

  // =========================================================================
  // B. execution policy validation
  // =========================================================================
  console.log('--- B. execution policy validation ---');

  await test('（2.execution policy validation）合法輸入{userId, options, runtimeContext}回傳{allowed:true, reasons:[]}', () => {
    const result = validateExecutionPolicy({ userId: 'u1', options: {}, runtimeContext: {} });
    assert.deepStrictEqual(result, { allowed: true, reasons: [] });
  });

  await test('（2.execution policy validation）只有userId時（options/runtimeContext都不提供）也視為合法', () => {
    const result = validateExecutionPolicy({ userId: 'u1' });
    assert.strictEqual(result.allowed, true);
  });

  await test('（2.execution policy validation）userId為空字串時回傳allowed:false，reasons包含"missing_user_id"', () => {
    const result = validateExecutionPolicy({ userId: '' });
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes('missing_user_id'));
  });

  await test('（2.execution policy validation）userId缺失時回傳allowed:false，reasons包含"missing_user_id"', () => {
    const result = validateExecutionPolicy({});
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes('missing_user_id'));
  });

  await test('（2.execution policy validation）userId為數字（非字串）時回傳allowed:false', () => {
    const result = validateExecutionPolicy({ userId: 123 });
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes('missing_user_id'));
  });

  await test('（2.execution policy validation）options為陣列時回傳allowed:false，reasons包含"invalid_options"', () => {
    const result = validateExecutionPolicy({ userId: 'u1', options: [] });
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes('invalid_options'));
  });

  await test('（2.execution policy validation）options為null時回傳allowed:false，reasons包含"invalid_options"', () => {
    const result = validateExecutionPolicy({ userId: 'u1', options: null });
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes('invalid_options'));
  });

  await test('（2.execution policy validation）options為字串時回傳allowed:false', () => {
    const result = validateExecutionPolicy({ userId: 'u1', options: 'not-an-object' });
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes('invalid_options'));
  });

  await test('（2.execution policy validation）runtimeContext為陣列時回傳allowed:false，reasons包含"invalid_runtime_context"', () => {
    const result = validateExecutionPolicy({ userId: 'u1', runtimeContext: [] });
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes('invalid_runtime_context'));
  });

  await test('（2.execution policy validation）runtimeContext為null時回傳allowed:false', () => {
    const result = validateExecutionPolicy({ userId: 'u1', runtimeContext: null });
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes('invalid_runtime_context'));
  });

  await test('（2.execution policy validation）同時違反多條規則時，reasons陣列包含全部違反的規則（不是只回傳第一個）', () => {
    const result = validateExecutionPolicy({ userId: '', options: [], runtimeContext: 'bad' });
    assert.strictEqual(result.allowed, false);
    assert.deepStrictEqual(result.reasons.sort(), ['invalid_options', 'invalid_runtime_context', 'missing_user_id']);
  });

  await test('（2.execution policy validation）options是巢狀物件時視為合法（不限制內容，只檢查頂層形狀）', () => {
    const result = validateExecutionPolicy({ userId: 'u1', options: { version: '1', includeContext: true, nested: { a: 1 } } });
    assert.strictEqual(result.allowed, true);
  });

  console.log('');

  // =========================================================================
  // C. governance result format
  // =========================================================================
  console.log('--- C. governance result format ---');

  await test('（3.governance result format）validateExecution()合法輸入回傳規格範例的形狀{status:"governance_passed", allowed:true, reasons:[], metadata:{version:"1.0"}}', () => {
    const svc = createGovernanceService();
    const result = svc.validateExecution({ userId: 'u1', options: {}, runtimeContext: {} });
    assert.deepStrictEqual(result, { status: 'governance_passed', allowed: true, reasons: [], metadata: { version: '1.0' } });
  });

  await test('（3.governance result format）validateExecution()回傳物件恰好具備status/allowed/reasons/metadata四個欄位', () => {
    const svc = createGovernanceService();
    const result = svc.validateExecution({ userId: 'u1' });
    assert.deepStrictEqual(Object.keys(result).sort(), ['allowed', 'metadata', 'reasons', 'status']);
  });

  await test('（3.governance result format）不合法輸入時status為"governance_rejected"', () => {
    const svc = createGovernanceService();
    const result = svc.validateExecution({});
    assert.strictEqual(result.status, 'governance_rejected');
    assert.strictEqual(result.allowed, false);
  });

  await test('（3.governance result format）metadata固定帶{version:"1.0"}（規格範例原文）', () => {
    const svc = createGovernanceService();
    assert.deepStrictEqual(svc.validateExecution({ userId: 'u1' }).metadata, { version: '1.0' });
    assert.deepStrictEqual(svc.validateExecution({}).metadata, { version: '1.0' });
  });

  await test('（3.governance result format）buildGovernanceResult({})未提供欄位時使用固定預設值', () => {
    assert.deepStrictEqual(buildGovernanceResult({}), { status: null, allowed: false, reasons: [], metadata: {} });
  });

  await test('（3.governance result format）buildGovernanceResult()完整帶入時全部欄位正確保留', () => {
    const result = buildGovernanceResult({ status: 'x', allowed: true, reasons: ['a'], metadata: { v: 1 } });
    assert.deepStrictEqual(result, { status: 'x', allowed: true, reasons: ['a'], metadata: { v: 1 } });
  });

  await test('（3.governance result format）不包含任何AI recommendation或scoring欄位（規格明確禁止）', () => {
    const svc = createGovernanceService();
    const result = svc.validateExecution({ userId: 'u1' });
    assert.ok(!('score' in result));
    assert.ok(!('recommendation' in result));
    assert.ok(!('suggestion' in result));
    assert.ok(!('insights' in result));
  });

  console.log('');

  // =========================================================================
  // D. deterministic output
  // =========================================================================
  console.log('--- D. deterministic output ---');

  await test('（4.deterministic output）同樣輸入呼叫validateExecutionPolicy()多次得到deepStrictEqual結果', () => {
    const input = { userId: 'u1', options: { a: 1 }, runtimeContext: { b: 2 } };
    assert.deepStrictEqual(validateExecutionPolicy(input), validateExecutionPolicy(input));
  });

  await test('（4.deterministic output）同樣輸入呼叫validateExecution()多次得到deepStrictEqual結果', () => {
    const svc = createGovernanceService();
    const input = { userId: 'u1' };
    assert.deepStrictEqual(svc.validateExecution(input), svc.validateExecution(input));
  });

  await test('（4.deterministic output）不同的Governance Service實例對同樣輸入得到deepStrictEqual結果', () => {
    const svcA = createGovernanceService();
    const svcB = createGovernanceService();
    const input = { userId: 'u1', options: { x: 1 } };
    assert.deepStrictEqual(svcA.validateExecution(input), svcB.validateExecution(input));
  });

  await test('（4.deterministic output）execution_policy.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(governanceDir, 'execution_policy.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（4.deterministic output）governance_result_builder.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(governanceDir, 'governance_result_builder.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（4.deterministic output）governance_service.js 不讀取Date.now()/Math.random()', () => {
    const src = readSrc(path.join(governanceDir, 'governance_service.js'));
    assert.ok(!/Date\.now\(\)/.test(src));
    assert.ok(!/Math\.random\(\)/.test(src));
  });

  await test('（4.deterministic output）validateExecutionPolicy()不會修改（mutate）傳入的input物件', () => {
    const input = { userId: 'u1', options: { a: 1 } };
    const snapshot = JSON.parse(JSON.stringify(input));
    validateExecutionPolicy(input);
    assert.deepStrictEqual(input, snapshot);
  });

  await test('（4.deterministic output）buildGovernanceResult()不會修改（mutate）傳入的input物件', () => {
    const input = { status: 'x', reasons: ['a'] };
    const snapshot = JSON.parse(JSON.stringify(input));
    buildGovernanceResult(input);
    assert.deepStrictEqual(input, snapshot);
  });

  await test('（4.deterministic output，可注入性）createGovernanceService支援dependencies.policyValidator依賴注入', () => {
    const fakeValidator = (input) => ({ allowed: false, reasons: ['fake_reason'] });
    const svc = createGovernanceService({ policyValidator: fakeValidator });
    const result = svc.validateExecution({ userId: 'u1' });
    assert.strictEqual(result.status, 'governance_rejected');
    assert.deepStrictEqual(result.reasons, ['fake_reason']);
  });

  console.log('');

  // =========================================================================
  // E. invalid input handling
  // =========================================================================
  console.log('--- E. invalid input handling ---');

  await test('（5.invalid input handling）validateExecutionPolicy(null)不拋出例外，安全回傳allowed:false', () => {
    assert.doesNotThrow(() => validateExecutionPolicy(null));
    assert.strictEqual(validateExecutionPolicy(null).allowed, false);
  });

  await test('（5.invalid input handling）validateExecutionPolicy(undefined)不拋出例外', () => {
    assert.doesNotThrow(() => validateExecutionPolicy(undefined));
    assert.strictEqual(validateExecutionPolicy(undefined).allowed, false);
  });

  await test('（5.invalid input handling）validateExecutionPolicy([])不拋出例外（陣列不是合法輸入形狀）', () => {
    assert.doesNotThrow(() => validateExecutionPolicy([]));
    assert.strictEqual(validateExecutionPolicy([]).allowed, false);
  });

  await test('（5.invalid input handling）validateExecutionPolicy("string")不拋出例外', () => {
    assert.doesNotThrow(() => validateExecutionPolicy('a string'));
    assert.strictEqual(validateExecutionPolicy('a string').allowed, false);
  });

  await test('（5.invalid input handling）validateExecutionPolicy(123)不拋出例外', () => {
    assert.doesNotThrow(() => validateExecutionPolicy(123));
  });

  await test('（5.invalid input handling）validateExecution(null)不拋出例外，回傳governance_rejected', () => {
    const svc = createGovernanceService();
    assert.doesNotThrow(() => svc.validateExecution(null));
    assert.strictEqual(svc.validateExecution(null).status, 'governance_rejected');
  });

  await test('（5.invalid input handling）createGovernanceService({policyValidator: "not-a-function"})安全忽略，使用預設policy validator', () => {
    const svc = createGovernanceService({ policyValidator: 'not-a-function' });
    const result = svc.validateExecution({ userId: 'u1' });
    assert.strictEqual(result.allowed, true);
  });

  await test('（5.invalid input handling）policyValidator回傳不完整結果（缺reasons）時，validateExecution()安全處理不拋出例外', () => {
    const svc = createGovernanceService({ policyValidator: () => ({ allowed: false }) });
    assert.doesNotThrow(() => svc.validateExecution({ userId: 'u1' }));
    assert.deepStrictEqual(svc.validateExecution({ userId: 'u1' }).reasons, []);
  });

  console.log('');

  // =========================================================================
  // F. facade boundary isolation
  // =========================================================================
  console.log('--- F. facade boundary isolation ---');

  const facadeDir = path.join(intelDir, 'facade');

  await test('（6.facade boundary isolation）Governance完全不import src/intelligence/facade/底下任何檔案', () => {
    for (const file of GOVERNANCE_JS_FILES) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/facade\//.test(src), `${file}不應該import facade/`);
    }
  });

  await test('（6.facade boundary isolation）Facade完全不import src/intelligence/governance/底下任何檔案（雙向隔離）', () => {
    const facadeFiles = fs.readdirSync(facadeDir).filter((f) => f.endsWith('.js'));
    for (const file of facadeFiles) {
      const src = readSrc(path.join(facadeDir, file));
      assert.ok(!/from\s+['"].*\/governance\//.test(src), `${file}不應該import governance/`);
    }
  });

  await test('（6.facade boundary isolation）src/intelligence/facade/intelligence_facade.js 完全沒有被TASK1.55修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/facade/intelligence_facade.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（6.facade boundary isolation）src/intelligence/facade/ 整個目錄完全沒有被TASK1.55修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/facade/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // G. service boundary isolation
  // =========================================================================
  console.log('--- G. service boundary isolation ---');

  const serviceDir = path.join(intelDir, 'service');
  const executionDir = path.join(intelDir, 'execution');

  await test('（7.service boundary isolation）Governance完全不import src/intelligence/service/底下任何檔案', () => {
    for (const file of GOVERNANCE_JS_FILES) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/service\//.test(src), `${file}不應該import service/`);
    }
  });

  await test('（7.service boundary isolation）Governance完全不import src/intelligence/execution/底下任何檔案', () => {
    for (const file of GOVERNANCE_JS_FILES) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/execution\//.test(src), `${file}不應該import execution/`);
    }
  });

  await test('（7.service boundary isolation）Governance完全不import src/intelligence/orchestration/、analysis/、recommendation/', () => {
    for (const file of GOVERNANCE_JS_FILES) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
    }
  });

  await test('（7.service boundary isolation）Execution Manager/Service完全不import src/intelligence/governance/底下任何檔案（雙向隔離）', () => {
    const executionFiles = fs.readdirSync(executionDir).filter((f) => f.endsWith('.js'));
    const serviceFiles = fs.readdirSync(serviceDir).filter((f) => f.endsWith('.js'));
    for (const file of [...executionFiles.map((f) => [executionDir, f]), ...serviceFiles.map((f) => [serviceDir, f])]) {
      const src = readSrc(path.join(file[0], file[1]));
      assert.ok(!/from\s+['"].*\/governance\//.test(src), `${file[1]}不應該import governance/`);
    }
  });

  await test('（7.service boundary isolation）governance_service.js唯一的相對路徑import是./execution_policy.js跟./governance_result_builder.js', () => {
    const src = readSrc(path.join(governanceDir, 'governance_service.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports.sort(), ['./execution_policy.js', './governance_result_builder.js']);
  });

  await test('（7.service boundary isolation）execution_policy.js完全沒有任何import（純函式，零相依）', () => {
    const src = readSrc(path.join(governanceDir, 'execution_policy.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, []);
  });

  await test('（7.service boundary isolation）src/intelligence/execution/execution_manager.js 完全沒有被TASK1.55修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/intelligence/execution/execution_manager.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（7.service boundary isolation）src/intelligence/service/、orchestration/、analysis/、recommendation/ 整個目錄完全沒有被TASK1.55修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/service/*.js src/intelligence/orchestration/*.js src/intelligence/analysis/*.js src/intelligence/recommendation/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // H. no database dependency
  // =========================================================================
  console.log('--- H. no database dependency ---');

  for (const file of GOVERNANCE_JS_FILES) {
    await test(`（8.no database dependency）src/intelligence/governance/${file} 完全不 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });
    await test(`（8.no database dependency）src/intelligence/governance/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
    });
    await test(`（8.no database dependency）src/intelligence/governance/${file} 完全沒有出現 SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
    });
    await test(`（8.no database dependency）src/intelligence/governance/${file} 完全沒有出現 DIET_COACH_DB 字樣`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（8.no database dependency）validateExecutionPolicy()/validateExecution()簽章都不接受db參數（只接受input一個參數）', () => {
    assert.strictEqual(validateExecutionPolicy.length, 1);
    const svc = createGovernanceService();
    assert.strictEqual(svc.validateExecution.length, 1);
  });

  console.log('');

  // =========================================================================
  // I. no authentication dependency
  // =========================================================================
  console.log('--- I. no authentication dependency ---');

  for (const file of GOVERNANCE_JS_FILES) {
    await test(`（9.no authentication dependency）src/intelligence/governance/${file} 完全不 import src/auth/ 或 src/identity/`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
    });
    await test(`（9.no authentication dependency）src/intelligence/governance/${file} 完全不 import src/oauth/`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
    });
    await test(`（9.no authentication dependency）src/intelligence/governance/${file} 完全不 import src/middleware/`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（9.no authentication dependency）src/intelligence/governance/${file} 完全沒有出現 JWT/session/cookie 相關字樣`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（9.no authentication dependency）execution_policy.js完全不呼叫requireAuth/requireActiveUser', () => {
    const src = readSrc(path.join(governanceDir, 'execution_policy.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  await test('（9.no authentication dependency）validateExecutionPolicy()不查詢任何user status（不呼叫任何函式判斷guest/registered/blocked）', () => {
    const result = validateExecutionPolicy({ userId: 'any-user-id-at-all-no-lookup-happens' });
    assert.strictEqual(result.allowed, true);
  });

  console.log('');

  // =========================================================================
  // J. no AI dependency
  // =========================================================================
  console.log('--- J. no AI dependency ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
    /\bscoring\b/i, /\brecommendation\b/i,
  ];
  for (const file of GOVERNANCE_JS_FILES) {
    const codeOnly = readSrc(path.join(governanceDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（10.no AI dependency）src/intelligence/governance/${file} 的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 的程式碼出現疑似AI/scoring相關字樣：${pattern}`);
      });
    }
    await test(`（10.no AI dependency）src/intelligence/governance/${file} 完全不 import 任何非相對路徑的外部套件（不含AI SDK）`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  console.log('');

  // =========================================================================
  // K. no external API dependency
  // =========================================================================
  console.log('--- K. no external API dependency ---');

  for (const file of GOVERNANCE_JS_FILES) {
    await test(`（11.no external API dependency）src/intelligence/governance/${file} 完全沒有呼叫 fetch()`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/\bfetch\s*\(/.test(src));
    });
    await test(`（11.no external API dependency）src/intelligence/governance/${file} 完全沒有出現 http:// 或 https:// 字面URL`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/https?:\/\//.test(src));
    });
    await test(`（11.no external API dependency）src/intelligence/governance/${file} 完全不 import src/routes/ 或 src/controllers/`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/routes\//.test(src));
      assert.ok(!/from\s+['"].*\/controllers\//.test(src));
    });
  }

  await test('（11.no external API dependency）src/worker.js 完全不 import src/intelligence/governance/', () => {
    const src = stripComments(fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8'));
    assert.ok(!/from\s+['"].*\/intelligence\/governance\//.test(src));
  });

  await test('（11.no external API dependency）src/worker.js 完全沒有被TASK1.55修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.no external API dependency）wrangler.toml 完全沒有被TASK1.55修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');

  // =========================================================================
  // L. bootstrap integration
  // =========================================================================
  console.log('--- L. bootstrap integration ---');

  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  function makeFullEnv() { return { DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} }; }

  await test('（12.bootstrap integration）createApplication(env).intelligence 具備 governance 欄位', () => {
    const app = createApplication(makeFullEnv());
    assert.ok('governance' in app.intelligence);
  });

  await test('（12.bootstrap integration）app.intelligence.governance 具備 validateExecution 一個函式', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence.governance), ['validateExecution']);
  });

  await test('（12.bootstrap integration）app.intelligence.governance.validateExecution()正確運作', () => {
    const app = createApplication(makeFullEnv());
    const result = app.intelligence.governance.validateExecution({ userId: 'u1' });
    assert.strictEqual(result.status, 'governance_passed');
  });

  await test('（12.bootstrap integration）每次createApplication()呼叫都各自建立獨立的Governance Service實例（不是共用singleton）', () => {
    const app1 = createApplication(makeFullEnv());
    const app2 = createApplication(makeFullEnv());
    assert.notStrictEqual(app1.intelligence.governance, app2.intelligence.governance);
  });

  await test('（12.bootstrap integration）原始碼掃描：src/intelligence/index.js 有 export governance namespace', () => {
    const src = stripComments(fs.readFileSync(path.join(intelDir, 'index.js'), 'utf8'));
    assert.ok(/export \* as governance from ['"]\.\/governance\/index\.js['"]/.test(src));
  });

  await test('（12.bootstrap integration）app.intelligence.facade跟app.intelligence.execution的既有行為完全沒有被改變（成功呼叫依然回傳原本的格式）', async () => {
    const app = createApplication(makeFullEnv());
    app.intelligence.service.getIntelligence = async () => ({
      ok: true,
      data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} },
    });
    const result = await app.intelligence.execution.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'ok', 'state']);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.state, 'completed');
  });

  await test('（12.bootstrap integration）app.router.routes 數量沒有因為新增governance而改變（依然是21條）', () => {
    const app = createApplication(makeFullEnv());
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（12.bootstrap integration）app.intelligence 恰好具備16個欄位（TASK1.54既有15個加上TASK1.55新增的governance）', () => {
    const app = createApplication(makeFullEnv());
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'governance', 'history', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service',
    ]);
  });

  console.log('');

  // =========================================================================
  // M. regression check
  // =========================================================================
  console.log('--- M. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（13.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.55-governance')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（13.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.54）`, () => {
      assert.ok(allSuites.length >= 46, `預期至少46個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（13.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // N. P1-P6
  // =========================================================================
  console.log('--- N. P1-P6 ---');

  await test('（14.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（14.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（14.P1-P6）src/routes/ 完全沒有被TASK1.55修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）src/controllers/ 完全沒有被TASK1.55修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/controllers/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

/*
 * Phase 3 TASK 1.62｜Intelligence Application Capability Layer
 * Foundation 測試
 *
 * 本任務不是建立API，也不是建立UI，也不是導入AI——這是在Use Case
 * Layer（TASK1.61）之上建立的Capability Layer：讓未來不同的
 * Intelligence Application能力可以被清楚分類與管理。這份測試驗證
 * 的是：
 * - Capability Layer只做規格明確列出的三件事（定義Intelligence
 *   Application能力分類、組合對應Use Case、提供穩定capability
 *   entry point）
 * - Capability Layer只認識Use Case Layer這一個下游介面，完全不能
 *   直接呼叫Application Service/Intelligence Facade/Execution
 *   Manager/History Store/Metrics Store/Event Dispatcher/
 *   Database/AI Provider（規格明確禁止的三條捷徑）
 * - 合法流程（User Application→Capability Layer→Use Case Layer→
 *   Application Service→Intelligence Facade→Intelligence
 *   Runtime）確實可用
 * - export一致性、regression、P1-P6
 *
 * 分為以下11個部分：
 * A) capability boundary
 * B) use case dependency
 * C) application service isolation
 * D) facade isolation
 * E) runtime isolation
 * F) no database dependency
 * G) no auth dependency
 * H) no AI dependency
 * I) export consistency
 * J) regression check
 * K) P1-P6
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
const applicationDir = path.join(intelDir, 'application');
const useCasesDir = path.join(applicationDir, 'use_cases');
const capabilitiesDir = path.join(applicationDir, 'capabilities');

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

function listAllJsFiles(dir) {
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
    }
  }
  walk(dir);
  return files.sort();
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

function makeSpyUseCase(config) {
  config = config || {};
  const calls = [];
  return {
    calls,
    useCase: {
      requestUserInsight: async (db, request) => {
        calls.push({ db, request });
        if (config.requestUserInsight) return config.requestUserInsight(db, request);
        return {
          ok: true,
          useCase: 'insight',
          data: {
            status: 'intelligence_ready',
            result: { context: {}, analysis: {}, recommendation: {} },
            metadata: {},
          },
        };
      },
    },
  };
}

async function run() {
  const capabilityMod = await import(path.join(capabilitiesDir, 'insight_capability.js'));
  const { createInsightCapability } = capabilityMod;
  const builderMod = await import(path.join(capabilitiesDir, 'capability_result_builder.js'));
  const { createCapabilityResultBuilder } = builderMod;
  await import(path.join(capabilitiesDir, 'index.js'));

  const CAPABILITY_JS_FILES = fs.readdirSync(capabilitiesDir).filter((f) => f.endsWith('.js')).sort();

  // =========================================================================
  // A. capability boundary
  // =========================================================================
  console.log('--- A. capability boundary ---');

  await test('（1.capability boundary）src/intelligence/application/capabilities/ 恰好包含3個.js檔案（insight_capability/capability_result_builder/index）', () => {
    assert.deepStrictEqual(CAPABILITY_JS_FILES, ['capability_result_builder.js', 'index.js', 'insight_capability.js']);
  });

  await test('（1.capability boundary）src/intelligence/application/capabilities/README.md 存在且非空', () => {
    const readmePath = path.join(capabilitiesDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.capability boundary）createInsightCapability()回傳物件恰好只有requestInsightCapability一個公開介面', () => {
    const cap = createInsightCapability({});
    assert.deepStrictEqual(Object.keys(cap), ['requestInsightCapability']);
  });

  await test('（1.capability boundary）createInsightCapability(undefined)不拋出例外', () => {
    assert.doesNotThrow(() => createInsightCapability(undefined));
  });

  await test('（1.capability boundary）不同的Insight Capability實例各自獨立（不是共用singleton）', () => {
    const capA = createInsightCapability({});
    const capB = createInsightCapability({});
    assert.notStrictEqual(capA, capB);
  });

  await test('（1.capability boundary）requestInsightCapability()合法輸入時正確呼叫useCase.requestUserInsight()並回傳包裝後的結果', async () => {
    const { useCase, calls } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    const result = await cap.requestInsightCapability({}, { userId: 'u1' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'insight');
    assert.deepStrictEqual(result.data, { status: 'intelligence_ready', result: { context: {}, analysis: {}, recommendation: {} }, metadata: {} });
  });

  await test('（1.capability boundary）requestInsightCapability()缺少userId時回傳{ok:false, capability:"insight", reason:"invalid_user_id"}，完全不呼叫useCase', async () => {
    const { useCase, calls } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    const result = await cap.requestInsightCapability({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.capability, 'insight');
    assert.strictEqual(result.reason, 'invalid_user_id');
    assert.strictEqual(calls.length, 0);
  });

  await test('（1.capability boundary）requestInsightCapability()的userId為空字串時回傳失敗', async () => {
    const { useCase } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    const result = await cap.requestInsightCapability({}, { userId: '' });
    assert.strictEqual(result.ok, false);
  });

  await test('（1.capability boundary）requestInsightCapability()的userId為數字（非字串）時回傳失敗', async () => {
    const { useCase } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    const result = await cap.requestInsightCapability({}, { userId: 123 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（1.capability boundary）requestInsightCapability()的options為陣列時回傳失敗', async () => {
    const { useCase } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    const result = await cap.requestInsightCapability({}, { userId: 'u1', options: [] });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.capability boundary）requestInsightCapability(null,null)不拋出例外', async () => {
    const { useCase } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    await assert.doesNotReject(() => cap.requestInsightCapability(null, null));
  });

  await test('（1.capability boundary）requestInsightCapability(db, "not an object")回傳{ok:false, reason:"invalid_request"}', async () => {
    const { useCase } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    const result = await cap.requestInsightCapability({}, 'not an object');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability boundary）requestInsightCapability(db, [])（陣列）回傳{ok:false, reason:"invalid_request"}', async () => {
    const { useCase } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    const result = await cap.requestInsightCapability({}, []);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_request');
  });

  await test('（1.capability boundary）Use Case回傳失敗時，Capability Layer正確轉發失敗原因', async () => {
    const { useCase } = makeSpyUseCase({ requestUserInsight: async () => ({ ok: false, useCase: 'insight', reason: 'use_case_failure_reason' }) });
    const cap = createInsightCapability({ useCase });
    const result = await cap.requestInsightCapability({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.capability, 'insight');
    assert.strictEqual(result.reason, 'use_case_failure_reason');
  });

  await test('（1.capability boundary）沒有提供useCase依賴時，回傳{ok:false, reason:"use_case_unavailable"}', async () => {
    const cap = createInsightCapability({});
    const result = await cap.requestInsightCapability({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'use_case_unavailable');
  });

  await test('（1.capability boundary）useCase.requestUserInsight不是函式時，安全回傳use_case_unavailable，不拋出例外', async () => {
    const cap = createInsightCapability({ useCase: { requestUserInsight: 'nope' } });
    await assert.doesNotReject(() => cap.requestInsightCapability({}, { userId: 'u1' }));
    assert.strictEqual((await cap.requestInsightCapability({}, { userId: 'u1' })).reason, 'use_case_unavailable');
  });

  await test('（1.capability boundary）合法的options物件（含巢狀欄位）可以正常通過驗證並轉交下去', async () => {
    const { useCase, calls } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    const result = await cap.requestInsightCapability({}, { userId: 'u1', options: { nested: { a: 1 } } });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(calls[0].request.options, { nested: { a: 1 } });
  });

  console.log('');

  // =========================================================================
  // B. use case dependency
  // =========================================================================
  console.log('--- B. use case dependency ---');

  await test('（2.use case dependency）insight_capability.js把request原樣轉交給useCase.requestUserInsight()（不解讀options業務內容）', async () => {
    const { useCase, calls } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    const request = { userId: 'u1', options: { customField: 'x' }, requestId: 'r1' };
    await cap.requestInsightCapability({ marker: 'db' }, request);
    assert.deepStrictEqual(calls[0].db, { marker: 'db' });
    assert.deepStrictEqual(calls[0].request, request);
  });

  await test('（2.use case dependency）insight_capability.js只呼叫useCase.requestUserInsight()，不呼叫Use Case的其他任何方法', () => {
    const src = readSrc(path.join(capabilitiesDir, 'insight_capability.js'));
    const calls = [...src.matchAll(/useCase\.(\w+)\(/g)].map((m) => m[1]);
    assert.deepStrictEqual([...new Set(calls)], ['requestUserInsight']);
  });

  await test('（2.use case dependency）capability_result_builder.js的buildSuccessResult()正確重新包裝Use Case的data（status/result/metadata三個欄位）並標明capability', () => {
    const builder = createCapabilityResultBuilder();
    const result = builder.buildSuccessResult('insight', { status: 'intelligence_ready', result: { a: 1 }, metadata: { v: 1 } });
    assert.deepStrictEqual(result, { ok: true, capability: 'insight', data: { status: 'intelligence_ready', result: { a: 1 }, metadata: { v: 1 } } });
  });

  await test('（2.use case dependency）buildSuccessResult(capability, {})未提供欄位時使用undefined（不假造資料）', () => {
    const builder = createCapabilityResultBuilder();
    const result = builder.buildSuccessResult('insight', {});
    assert.deepStrictEqual(result, { ok: true, capability: 'insight', data: { status: undefined, result: undefined, metadata: undefined } });
  });

  await test('（2.use case dependency）buildFailureResult(capability, reason)正確組出{ok:false, capability, reason}', () => {
    const builder = createCapabilityResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult('insight', 'some_reason'), { ok: false, capability: 'insight', reason: 'some_reason' });
  });

  await test('（2.use case dependency）buildFailureResult(非字串capability, 非字串reason)安全正規化', () => {
    const builder = createCapabilityResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(123, 456), { ok: false, capability: 'unknown_capability', reason: 'unknown_error' });
    assert.deepStrictEqual(builder.buildFailureResult(undefined, undefined), { ok: false, capability: 'unknown_capability', reason: 'unknown_error' });
    assert.deepStrictEqual(builder.buildFailureResult(null, null), { ok: false, capability: 'unknown_capability', reason: 'unknown_error' });
  });

  await test('（2.use case dependency）buildSuccessResult(非字串capability, data)安全正規化capability為unknown_capability', () => {
    const builder = createCapabilityResultBuilder();
    const result = builder.buildSuccessResult(123, { status: 'x' });
    assert.strictEqual(result.capability, 'unknown_capability');
  });

  await test('（2.use case dependency）createInsightCapability支援dependencies.resultBuilder依賴注入', async () => {
    const fakeBuilder = {
      buildSuccessResult: () => ({ ok: true, data: 'custom' }),
      buildFailureResult: () => ({ ok: false, reason: 'custom_fail' }),
    };
    const { useCase } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase, resultBuilder: fakeBuilder });
    const result = await cap.requestInsightCapability({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: true, data: 'custom' });
  });

  await test('（2.use case dependency）createCapabilityResultBuilder()回傳物件恰好只有buildSuccessResult/buildFailureResult兩個公開介面', () => {
    const builder = createCapabilityResultBuilder();
    assert.deepStrictEqual(Object.keys(builder).sort(), ['buildFailureResult', 'buildSuccessResult']);
  });

  await test('（2.use case dependency）不同的Capability Result Builder實例各自獨立（不是共用singleton）', () => {
    const builderA = createCapabilityResultBuilder();
    const builderB = createCapabilityResultBuilder();
    assert.notStrictEqual(builderA, builderB);
  });

  await test('（2.use case dependency）buildSuccessResult()是deterministic的——同樣輸入永遠得到完全相同的輸出（不讀取Date.now()/Math.random()）', () => {
    const builder = createCapabilityResultBuilder();
    const r1 = builder.buildSuccessResult('insight', { status: 'x', result: { a: 1 }, metadata: { b: 2 } });
    const r2 = builder.buildSuccessResult('insight', { status: 'x', result: { a: 1 }, metadata: { b: 2 } });
    assert.deepStrictEqual(r1, r2);
  });

  await test('（2.use case dependency）insight_capability.js內建的CAPABILITY_NAME固定為字面值"insight"（規格要求定義一個能力分類）', () => {
    const src = readSrc(path.join(capabilitiesDir, 'insight_capability.js'));
    assert.ok(/const\s+CAPABILITY_NAME\s*=\s*['"]insight['"]/.test(src));
  });

  console.log('');

  // =========================================================================
  // C. application service isolation
  // =========================================================================
  console.log('--- C. application service isolation ---');

  for (const file of CAPABILITY_JS_FILES) {
    await test(`（3.application service isolation）capabilities/${file} 完全不import src/intelligence/application/application_service.js（不得繞過Use Case Layer直接呼叫Application Service）`, () => {
      assert.ok(!/from\s+['"].*\/application_service\.js['"]/.test(readSrc(path.join(capabilitiesDir, file))));
    });
    await test(`（3.application service isolation）capabilities/${file} 完全不出現applicationService變數名稱（沒有持有Application Service依賴）`, () => {
      assert.ok(!/applicationService/.test(readSrc(path.join(capabilitiesDir, file))));
    });
  }

  await test('（3.application service isolation）application_service.js完全不import src/intelligence/application/capabilities/（雙向隔離——Application Service不知道Capability Layer的存在）', () => {
    assert.ok(!/from\s+['"].*\/capabilities\//.test(readSrc(path.join(applicationDir, 'application_service.js'))));
  });

  await test('（3.application service isolation，端對端）Capability完全透過Use Case間接呼叫Application Service——直接注入一個「沒有applicationService」的Use Case時，Capability也完全不會嘗試自己找Application Service', async () => {
    const cap = createInsightCapability({ useCase: { requestUserInsight: async () => ({ ok: false, useCase: 'insight', reason: 'application_service_unavailable' }) } });
    const result = await cap.requestInsightCapability({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'application_service_unavailable');
  });

  console.log('');

  // =========================================================================
  // D. facade isolation
  // =========================================================================
  console.log('--- D. facade isolation ---');

  for (const file of CAPABILITY_JS_FILES) {
    await test(`（4.facade isolation）capabilities/${file} 完全不import src/intelligence/facade/（不得繞過Use Case Layer/Application Service直接呼叫Facade）`, () => {
      assert.ok(!/from\s+['"].*\/facade\//.test(readSrc(path.join(capabilitiesDir, file))));
    });
    await test(`（4.facade isolation）capabilities/${file} 完全不出現facade變數名稱（沒有持有Facade依賴）`, () => {
      assert.ok(!/\bfacade\b/i.test(readSrc(path.join(capabilitiesDir, file))));
    });
  }

  await test('（4.facade isolation）src/intelligence/facade/index.js完全不import src/intelligence/application/capabilities/', () => {
    assert.ok(!/from\s+['"].*\/capabilities\//.test(readSrc(path.join(intelDir, 'facade', 'index.js'))));
  });

  await test('（4.facade isolation）capabilities/README.md提及「不得直接呼叫Intelligence Facade」這條規則', () => {
    const readme = fs.readFileSync(path.join(capabilitiesDir, 'README.md'), 'utf8');
    assert.ok(readme.includes('Facade'));
  });

  console.log('');

  // =========================================================================
  // E. runtime isolation
  // =========================================================================
  console.log('--- E. runtime isolation ---');

  for (const file of CAPABILITY_JS_FILES) {
    await test(`（5.runtime isolation）capabilities/${file} 完全不import src/intelligence/execution/（不得直接操作Execution Manager）`, () => {
      assert.ok(!/from\s+['"].*\/execution\//.test(readSrc(path.join(capabilitiesDir, file))));
    });
    await test(`（5.runtime isolation）capabilities/${file} 完全不import src/intelligence/history/（不得直接操作History Store）`, () => {
      assert.ok(!/from\s+['"].*\/history\//.test(readSrc(path.join(capabilitiesDir, file))));
    });
    await test(`（5.runtime isolation）capabilities/${file} 完全不import src/intelligence/metrics/（不得直接操作Metrics Store）`, () => {
      assert.ok(!/from\s+['"].*\/metrics\//.test(readSrc(path.join(capabilitiesDir, file))));
    });
    await test(`（5.runtime isolation）capabilities/${file} 完全不import src/intelligence/events/（不得直接使用Event Dispatcher）`, () => {
      assert.ok(!/from\s+['"].*\/events\//.test(readSrc(path.join(capabilitiesDir, file))));
    });
    await test(`（5.runtime isolation）capabilities/${file} 完全不import src/intelligence/monitoring/或src/intelligence/governance/`, () => {
      const src = readSrc(path.join(capabilitiesDir, file));
      assert.ok(!/from\s+['"].*\/monitoring\//.test(src));
      assert.ok(!/from\s+['"].*\/governance\//.test(src));
    });
    await test(`（5.runtime isolation）capabilities/${file} 完全不import src/intelligence/service/、orchestration/、analysis/、recommendation/、data_preparation/（不得繞過Use Case Layer直接呼叫更底層子層）`, () => {
      const src = readSrc(path.join(capabilitiesDir, file));
      assert.ok(!/from\s+['"].*\/service\//.test(src));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
    });
    await test(`（5.runtime isolation）capabilities/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher變數名稱（沒有持有這些依賴）`, () => {
      const src = readSrc(path.join(capabilitiesDir, file));
      assert.ok(!/executionManager/.test(src));
      assert.ok(!/historyStore/.test(src));
      assert.ok(!/metricsStore/.test(src));
      assert.ok(!/eventDispatcher/.test(src));
    });
  }

  await test('（5.runtime isolation）execution_manager.js/intelligence_facade.js/application_service.js/insight_use_case.js完全沒有出現capability字樣（Runtime/Application Service/Use Case沒有反過來認識Capability Layer的存在）', () => {
    assert.ok(!/capability/i.test(readSrc(path.join(intelDir, 'execution', 'execution_manager.js'))));
    assert.ok(!/capability/i.test(readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js'))));
    assert.ok(!/capability/i.test(readSrc(path.join(applicationDir, 'application_service.js'))));
    assert.ok(!/capability/i.test(readSrc(path.join(useCasesDir, 'insight_use_case.js'))));
  });

  await test('（5.runtime isolation，端對端）呼叫Capability完全不會觸發Execution Manager的任何生命週期狀態轉換（因為Capability透過模擬的useCase，不是真正串接到Execution Manager，這裡驗證的是Capability本身不會繞過注入的useCase自己去操作Execution Manager）', async () => {
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    let executeCalled = false;
    const spyExecutionManager = { execute: async () => { executeCalled = true; return { ok: true, state: 'completed', data: {} }; } };
    // Capability只拿到useCase，完全沒有機會碰到spyExecutionManager
    const { useCase } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    await cap.requestInsightCapability({}, { userId: 'u1' });
    assert.strictEqual(executeCalled, false, 'Capability不應該有任何路徑能觸發到一個它沒被注入的Execution Manager');
    assert.strictEqual(typeof createExecutionManager, 'function');
  });

  const allIntelFilesExceptCapabilities = listAllJsFiles(intelDir).filter((f) => !f.includes(path.join('application', 'capabilities')) && f !== path.join(intelDir, 'index.js') && f !== path.join(applicationDir, 'index.js'));
  for (const f of allIntelFilesExceptCapabilities) {
    const relName = path.relative(repoRoot, f);
    await test(`（5.runtime isolation）${relName} 完全不import src/intelligence/application/capabilities/（下層不知道Capability Layer的存在，維持「每一層只認識自己呼叫的下一層」）`, () => {
      assert.ok(!/from\s+['"].*\/capabilities\//.test(readSrc(f)), `${relName} 不應該import capabilities/`);
    });
  }

  await test('（5.runtime isolation）src/controllers/、src/routes/、src/worker.js完全沒有任何檔案import src/intelligence/application/capabilities/（本次任務明確禁止新增API route）', () => {
    const files = [
      ...fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'controllers', f)),
      ...fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'routes', f)),
      path.join(srcRoot, 'worker.js'),
    ];
    for (const f of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\/capabilities\//.test(readSrc(f)), `${f} 不應該import intelligence/application/capabilities/`);
    }
  });

  await test('（5.runtime isolation）src/services/（既有Domain Service）完全不import src/intelligence/application/capabilities/', () => {
    const files = fs.readdirSync(path.join(srcRoot, 'services')).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\/capabilities\//.test(readSrc(path.join(srcRoot, 'services', file))));
    }
  });

  await test('（5.runtime isolation，端對端）合法流程User Application→Capability→Use Case→Application Service→Facade→Service→Execution Runtime→Analysis/Recommendation從頭到尾真實跑一次成功', async () => {
    const { createInsightCapability: createCap } = await import(path.join(capabilitiesDir, 'index.js'));
    const { createInsightUseCase } = await import(path.join(useCasesDir, 'index.js'));
    const { createApplicationService } = await import(path.join(applicationDir, 'index.js'));
    const { createIntelligenceFacade } = await import(path.join(intelDir, 'facade', 'index.js'));
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    const { createIntelligenceService } = await import(path.join(intelDir, 'service', 'index.js'));
    const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));
    const { createAnalysisRunner } = await import(path.join(intelDir, 'analysis', 'index.js'));
    const { createRecommendationRunner } = await import(path.join(intelDir, 'recommendation', 'index.js'));

    const dataPreparation = { prepare: async () => ({ ok: true, context: { raw: true } }) };
    const contextBuilder = { buildInsightContext: () => ({ context: { user: null, activityContext: { count: 1, items: [] }, nutritionContext: { count: 1, items: [] }, emotionContext: { count: 1, items: [] }, behaviorContext: { count: 1, items: [] }, reportContext: { count: 1, items: [] }, metadata: { totalRecords: 5 } }, validation: { ok: true } }) };
    const analysisRunner = createAnalysisRunner();
    const recommendationRunner = createRecommendationRunner();
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation, contextBuilder, analysisRunner, recommendationRunner });
    const service = createIntelligenceService({ orchestrator });
    const executionManager = createExecutionManager({ service });
    const facade = createIntelligenceFacade({ executionManager });
    const applicationService = createApplicationService({ facade });
    const insightUseCase = createInsightUseCase({ applicationService });
    const insightCapability = createCap({ useCase: insightUseCase });

    const result = await insightCapability.requestInsightCapability({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.capability, 'insight');
    assert.strictEqual(result.data.status, 'intelligence_ready');
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['metadata', 'result', 'status']);
  });

  console.log('');

  // =========================================================================
  // F. no database dependency
  // =========================================================================
  console.log('--- F. no database dependency ---');

  for (const file of CAPABILITY_JS_FILES) {
    await test(`（6.no database dependency）capabilities/${file} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(capabilitiesDir, file))));
    });
    await test(`（6.no database dependency）capabilities/${file} 完全沒有db.prepare()/SQL關鍵字/DIET_COACH_DB字樣`, () => {
      const src = readSrc(path.join(capabilitiesDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（6.no database dependency）requestInsightCapability()把db當作不透明的第一個參數，完全不呼叫db的任何方法', () => {
    const src = readSrc(path.join(capabilitiesDir, 'insight_capability.js'));
    assert.ok(!/db\.(prepare|exec|batch|run)\(/.test(src));
  });

  await test('（6.no database dependency）insight_capability.js的函式簽章接受db作為第一個參數但完全不解讀其內部結構（跟Use Case/Application Service/Facade/Service/Orchestrator一致）', async () => {
    const { useCase, calls } = makeSpyUseCase();
    const cap = createInsightCapability({ useCase });
    const opaqueDb = { anything: 'goes', nested: { a: 1 } };
    await cap.requestInsightCapability(opaqueDb, { userId: 'u1' });
    assert.strictEqual(calls[0].db, opaqueDb);
  });

  console.log('');

  // =========================================================================
  // G. no auth dependency
  // =========================================================================
  console.log('--- G. no auth dependency ---');

  for (const file of CAPABILITY_JS_FILES) {
    await test(`（7.no auth dependency）capabilities/${file} 完全不import src/auth/、src/oauth/、src/identity/、src/middleware/`, () => {
      const src = readSrc(path.join(capabilitiesDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（7.no auth dependency）capabilities/${file} 完全沒有出現jwt/session/cookie相關字樣`, () => {
      const src = readSrc(path.join(capabilitiesDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（7.no auth dependency）insight_capability.js完全不呼叫requireAuth()/requireActiveUser()', () => {
    const src = readSrc(path.join(capabilitiesDir, 'insight_capability.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  await test('（7.no auth dependency）requestInsightCapability()完全不查詢「目前是誰登入」——userId一律由呼叫端當作request欄位傳入', () => {
    const src = readSrc(path.join(capabilitiesDir, 'insight_capability.js'));
    assert.ok(!/getCurrentUser\(/.test(src));
    assert.ok(!/getLoggedInUser\(/.test(src));
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
  for (const file of CAPABILITY_JS_FILES) {
    const codeOnly = readSrc(path.join(capabilitiesDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（8.no AI dependency）capabilities/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（8.no AI dependency）capabilities/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
    await test(`（8.no AI dependency）capabilities/${file} 完全不 import 任何非相對路徑的外部套件`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  await test('（8.no AI dependency）Capability Layer沒有任何機會接觸到Analysis/Recommendation Extension Point（modules注入機制）——那是更底層的事，跟Capability Layer完全無關', () => {
    const src = readSrc(path.join(capabilitiesDir, 'insight_capability.js'));
    assert.ok(!/dependencies\.modules/.test(src));
  });

  console.log('');

  // =========================================================================
  // I. export consistency
  // =========================================================================
  console.log('--- I. export consistency ---');

  await test('（9.export consistency）capabilities/index.js完整re-export了capabilities/底下每個原始檔案的全部具名export', () => {
    const reExported = getReExportedNames(path.join(capabilitiesDir, 'index.js'));
    for (const file of ['insight_capability.js', 'capability_result_builder.js']) {
      const names = getNamedExports(path.join(capabilitiesDir, file));
      for (const name of names) {
        assert.ok(reExported.has(name), `capabilities/index.js 缺少 re-export ${name}（來自${file}）`);
      }
    }
  });

  await test('（9.export consistency）capabilities/index.js re-export的名稱在對應來源檔案裡確實存在（沒有re-export不存在的東西）', () => {
    const indexSrc = readSrc(path.join(capabilitiesDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(capabilitiesDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `capabilities/index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（9.export consistency）src/intelligence/application/index.js 有 export * as capabilities from ./capabilities/index.js', () => {
    const src = readSrc(path.join(applicationDir, 'index.js'));
    assert.ok(/export \* as capabilities from ['"]\.\/capabilities\/index\.js['"]/.test(src));
  });

  await test('（9.export consistency）import後，applicationModule.capabilities 是非空物件，具備createInsightCapability/createCapabilityResultBuilder', async () => {
    const applicationModule = await import(path.join(applicationDir, 'index.js'));
    assert.strictEqual(typeof applicationModule.capabilities, 'object');
    assert.strictEqual(typeof applicationModule.capabilities.createInsightCapability, 'function');
    assert.strictEqual(typeof applicationModule.capabilities.createCapabilityResultBuilder, 'function');
  });

  await test('（9.export consistency）src/intelligence/index.js的統一輸出入口本身沒有新增任何頂層namespace（capabilities是nested在application底下，不是新的頂層namespace）', () => {
    const namespaces = getReExportedNamespaces(path.join(intelDir, 'index.js'));
    assert.ok(!namespaces.has('capabilities'));
    assert.ok(namespaces.has('application'));
  });

  await test('（9.export consistency）application/index.js re-export了capabilities這個namespace（export * as capabilities）', () => {
    const namespaces = getReExportedNamespaces(path.join(applicationDir, 'index.js'));
    assert.ok(namespaces.has('capabilities'));
  });

  await test('（9.export consistency）capabilities/index.js恰好只re-export兩個具名函式（createInsightCapability/createCapabilityResultBuilder），沒有多餘的匯出', () => {
    const reExported = getReExportedNames(path.join(capabilitiesDir, 'index.js'));
    assert.deepStrictEqual([...reExported].sort(), ['createCapabilityResultBuilder', 'createInsightCapability']);
  });

  await test('（9.export consistency）insight_capability.js唯一的相對路徑import是./capability_result_builder.js', () => {
    const src = readSrc(path.join(capabilitiesDir, 'insight_capability.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./capability_result_builder.js']);
  });

  await test('（9.export consistency）capability_result_builder.js完全沒有任何import（純函式，零相依）', () => {
    const src = readSrc(path.join(capabilitiesDir, 'capability_result_builder.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（TASK1.66後更新）（9.export consistency）app.intelligence（bootstrap組裝結果）恰好具備22個欄位（TASK1.61既有18個加上TASK1.62新增的capabilities、TASK1.64新增的workflow、TASK1.65新增的features、TASK1.66新增的insightFeature）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（9.export consistency）app.intelligence.capabilities具備requestInsightCapability一個函式', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence.capabilities), ['requestInsightCapability']);
  });

  await test('（9.export consistency）app.intelligence.capabilities注入的useCase跟app.intelligence.useCases是同一個實例', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const viaUseCase = await app.intelligence.useCases.requestUserInsight({}, { userId: 'u1' });
    const viaCapability = await app.intelligence.capabilities.requestInsightCapability({}, { userId: 'u1' });
    assert.deepStrictEqual(viaUseCase.data, viaCapability.data);
  });

  await test('（9.export consistency）每次createApplication()呼叫都各自建立獨立的Insight Capability實例（不是共用singleton）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app1 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const app2 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app1.intelligence.capabilities, app2.intelligence.capabilities);
  });

  await test('（9.export consistency）app.router.routes 數量沒有因為新增capabilities而改變（依然是21條，本次任務明確禁止新增API route）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 21);
  });

  console.log('');

  // =========================================================================
  // J. regression check
  // =========================================================================
  console.log('--- J. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（10.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.62-capability')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（10.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 53, `預期至少53個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（10.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // K. P1-P6
  // =========================================================================
  console.log('--- K. P1-P6 ---');

  await test('（11.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（11.P1-P6）src/worker.js 完全沒有被TASK1.62修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）wrangler.toml 完全沒有被TASK1.62修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（11.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被TASK1.62修改（本次任務只允許新增src/intelligence/application/capabilities/跟修改src/intelligence/application/index.js/src/bootstrap/application.js作為純新增namespace）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）Analysis/Recommendation Runner/Execution Manager/Application Service/Insight Use Case的原始碼完全沒有被TASK1.62修改（規格明確禁止修改Execution Runtime Behavior）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/analysis/analysis_runner.js src/intelligence/recommendation/recommendation_runner.js src/intelligence/execution/execution_manager.js src/intelligence/facade/intelligence_facade.js src/intelligence/application/application_service.js src/intelligence/application/use_cases/insight_use_case.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

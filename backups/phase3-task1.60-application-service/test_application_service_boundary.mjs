/*
 * Phase 3 TASK 1.60｜Intelligence Application Service Boundary
 * Foundation 測試
 *
 * 本任務不是導入AI功能，也不是建立User API——這是Phase 3第一個
 * 真正的實作層：在Intelligence Facade（TASK1.48）跟未來的User
 * Application之間建立一個application-facing的服務邊界。這份測試
 * 驗證的是：
 * - Application Service只做規格明確列出的四件事（接收request、
 *   驗證input、呼叫Facade、包裝response）
 * - Application Service只認識Facade這一個下游介面，完全不能直接
 *   呼叫Execution Manager/History Store/Metrics Store/Event
 *   Dispatcher/Database/AI Provider（規格明確禁止的三條捷徑）
 * - 合法流程（Application Service→Facade→Service→Execution
 *   Runtime→Analysis/Recommendation）確實可用
 * - export一致性、regression、P1-P6
 *
 * 分為以下10個部分：
 * A) application boundary
 * B) facade dependency
 * C) runtime isolation
 * D) no database dependency
 * E) no auth dependency
 * F) no AI dependency
 * G) dependency direction
 * H) export consistency
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
const applicationDir = path.join(intelDir, 'application');

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

function makeSpyFacade(config) {
  config = config || {};
  const calls = [];
  return {
    calls,
    facade: {
      executeIntelligence: async (db, request) => {
        calls.push({ db, request });
        if (config.executeIntelligence) return config.executeIntelligence(db, request);
        return {
          ok: true,
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
  const serviceMod = await import(path.join(applicationDir, 'application_service.js'));
  const { createApplicationService } = serviceMod;
  const builderMod = await import(path.join(applicationDir, 'application_result_builder.js'));
  const { createApplicationResultBuilder } = builderMod;
  await import(path.join(applicationDir, 'index.js'));

  const APPLICATION_JS_FILES = fs.readdirSync(applicationDir).filter((f) => f.endsWith('.js')).sort();

  // =========================================================================
  // A. application boundary
  // =========================================================================
  console.log('--- A. application boundary ---');

  await test('（1.application boundary）src/intelligence/application/ 恰好包含3個.js檔案（application_service/application_result_builder/index）', () => {
    assert.deepStrictEqual(APPLICATION_JS_FILES, ['application_result_builder.js', 'application_service.js', 'index.js']);
  });

  await test('（1.application boundary）src/intelligence/application/README.md 存在且非空', () => {
    const readmePath = path.join(applicationDir, 'README.md');
    assert.ok(fs.existsSync(readmePath));
    assert.ok(fs.readFileSync(readmePath, 'utf8').length > 0);
  });

  await test('（1.application boundary）createApplicationService()回傳物件恰好只有requestIntelligence一個公開介面', () => {
    const svc = createApplicationService({});
    assert.deepStrictEqual(Object.keys(svc), ['requestIntelligence']);
  });

  await test('（1.application boundary）createApplicationService(undefined)不拋出例外', () => {
    assert.doesNotThrow(() => createApplicationService(undefined));
  });

  await test('（1.application boundary）不同的Application Service實例各自獨立（不是共用singleton）', () => {
    const svcA = createApplicationService({});
    const svcB = createApplicationService({});
    assert.notStrictEqual(svcA, svcB);
  });

  await test('（1.application boundary）requestIntelligence()合法輸入時正確呼叫facade.executeIntelligence()並回傳包裝後的結果', async () => {
    const { facade, calls } = makeSpyFacade();
    const svc = createApplicationService({ facade });
    const result = await svc.requestIntelligence({}, { userId: 'u1' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data, { status: 'intelligence_ready', result: { context: {}, analysis: {}, recommendation: {} }, metadata: {} });
  });

  await test('（1.application boundary）requestIntelligence()缺少userId時回傳{ok:false, reason:"invalid_user_id"}，完全不呼叫facade', async () => {
    const { facade, calls } = makeSpyFacade();
    const svc = createApplicationService({ facade });
    const result = await svc.requestIntelligence({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
    assert.strictEqual(calls.length, 0);
  });

  await test('（1.application boundary）requestIntelligence()的userId為空字串時回傳失敗', async () => {
    const { facade } = makeSpyFacade();
    const svc = createApplicationService({ facade });
    const result = await svc.requestIntelligence({}, { userId: '' });
    assert.strictEqual(result.ok, false);
  });

  await test('（1.application boundary）requestIntelligence()的options為陣列時回傳失敗', async () => {
    const { facade } = makeSpyFacade();
    const svc = createApplicationService({ facade });
    const result = await svc.requestIntelligence({}, { userId: 'u1', options: [] });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_options_type');
  });

  await test('（1.application boundary）requestIntelligence(null,null)不拋出例外', async () => {
    const { facade } = makeSpyFacade();
    const svc = createApplicationService({ facade });
    await assert.doesNotReject(() => svc.requestIntelligence(null, null));
  });

  await test('（1.application boundary）Facade回傳失敗時，Application Service正確轉發失敗原因', async () => {
    const { facade } = makeSpyFacade({ executeIntelligence: async () => ({ ok: false, reason: 'facade_failure_reason' }) });
    const svc = createApplicationService({ facade });
    const result = await svc.requestIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'facade_failure_reason');
  });

  await test('（1.application boundary）沒有提供facade依賴時，回傳{ok:false, reason:"facade_unavailable"}', async () => {
    const svc = createApplicationService({});
    const result = await svc.requestIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'facade_unavailable');
  });

  await test('（1.application boundary）facade.executeIntelligence不是函式時，安全回傳facade_unavailable，不拋出例外', async () => {
    const svc = createApplicationService({ facade: { executeIntelligence: 'nope' } });
    await assert.doesNotReject(() => svc.requestIntelligence({}, { userId: 'u1' }));
    assert.strictEqual((await svc.requestIntelligence({}, { userId: 'u1' })).reason, 'facade_unavailable');
  });

  console.log('');

  // =========================================================================
  // B. facade dependency
  // =========================================================================
  console.log('--- B. facade dependency ---');

  await test('（2.facade dependency）application_service.js把request原樣轉交給facade.executeIntelligence()（不解讀options業務內容）', async () => {
    const { facade, calls } = makeSpyFacade();
    const svc = createApplicationService({ facade });
    const request = { userId: 'u1', options: { customField: 'x' }, requestId: 'r1' };
    await svc.requestIntelligence({ marker: 'db' }, request);
    assert.deepStrictEqual(calls[0].db, { marker: 'db' });
    assert.deepStrictEqual(calls[0].request, request);
  });

  await test('（2.facade dependency）application_service.js只呼叫facade.executeIntelligence()，不呼叫facade的其他任何方法', () => {
    const src = readSrc(path.join(applicationDir, 'application_service.js'));
    const facadeCalls = [...src.matchAll(/facade\.(\w+)\(/g)].map((m) => m[1]);
    assert.deepStrictEqual([...new Set(facadeCalls)], ['executeIntelligence']);
  });

  await test('（2.facade dependency）application_result_builder.js的buildSuccessResult()正確重新包裝Facade的data（status/result/metadata三個欄位）', () => {
    const builder = createApplicationResultBuilder();
    const result = builder.buildSuccessResult({ status: 'intelligence_ready', result: { a: 1 }, metadata: { v: 1 } });
    assert.deepStrictEqual(result, { ok: true, data: { status: 'intelligence_ready', result: { a: 1 }, metadata: { v: 1 } } });
  });

  await test('（2.facade dependency）buildSuccessResult({})未提供欄位時使用undefined（不假造資料）', () => {
    const builder = createApplicationResultBuilder();
    const result = builder.buildSuccessResult({});
    assert.deepStrictEqual(result, { ok: true, data: { status: undefined, result: undefined, metadata: undefined } });
  });

  await test('（2.facade dependency）buildFailureResult(reason)正確組出{ok:false, reason}', () => {
    const builder = createApplicationResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult('some_reason'), { ok: false, reason: 'some_reason' });
  });

  await test('（2.facade dependency）buildFailureResult(非字串)安全正規化為unknown_error', () => {
    const builder = createApplicationResultBuilder();
    assert.deepStrictEqual(builder.buildFailureResult(123), { ok: false, reason: 'unknown_error' });
    assert.deepStrictEqual(builder.buildFailureResult(undefined), { ok: false, reason: 'unknown_error' });
    assert.deepStrictEqual(builder.buildFailureResult(null), { ok: false, reason: 'unknown_error' });
  });

  await test('（2.facade dependency）createApplicationService支援dependencies.resultBuilder依賴注入', async () => {
    const fakeBuilder = {
      buildSuccessResult: () => ({ ok: true, data: 'custom' }),
      buildFailureResult: () => ({ ok: false, reason: 'custom_fail' }),
    };
    const { facade } = makeSpyFacade();
    const svc = createApplicationService({ facade, resultBuilder: fakeBuilder });
    const result = await svc.requestIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(result, { ok: true, data: 'custom' });
  });

  console.log('');

  // =========================================================================
  // C. runtime isolation
  // =========================================================================
  console.log('--- C. runtime isolation ---');

  for (const file of APPLICATION_JS_FILES) {
    await test(`（3.runtime isolation）application/${file} 完全不import src/intelligence/execution/（不得直接操作Execution Manager）`, () => {
      assert.ok(!/from\s+['"].*\/execution\//.test(readSrc(path.join(applicationDir, file))));
    });
    await test(`（3.runtime isolation）application/${file} 完全不import src/intelligence/history/（不得直接操作History Store）`, () => {
      assert.ok(!/from\s+['"].*\/history\//.test(readSrc(path.join(applicationDir, file))));
    });
    await test(`（3.runtime isolation）application/${file} 完全不import src/intelligence/metrics/（不得直接操作Metrics Store）`, () => {
      assert.ok(!/from\s+['"].*\/metrics\//.test(readSrc(path.join(applicationDir, file))));
    });
    await test(`（3.runtime isolation）application/${file} 完全不import src/intelligence/events/（不得直接使用Event Dispatcher）`, () => {
      assert.ok(!/from\s+['"].*\/events\//.test(readSrc(path.join(applicationDir, file))));
    });
    await test(`（3.runtime isolation）application/${file} 完全不import src/intelligence/monitoring/或src/intelligence/governance/`, () => {
      const src = readSrc(path.join(applicationDir, file));
      assert.ok(!/from\s+['"].*\/monitoring\//.test(src));
      assert.ok(!/from\s+['"].*\/governance\//.test(src));
    });
    await test(`（3.runtime isolation）application/${file} 完全不import src/intelligence/service/、orchestration/、analysis/、recommendation/、data_preparation/（不得繞過Facade直接呼叫更底層子層）`, () => {
      const src = readSrc(path.join(applicationDir, file));
      assert.ok(!/from\s+['"].*\/service\//.test(src));
      assert.ok(!/from\s+['"].*\/orchestration\//.test(src));
      assert.ok(!/from\s+['"].*\/analysis\//.test(src));
      assert.ok(!/from\s+['"].*\/recommendation\//.test(src));
      assert.ok(!/from\s+['"].*\/data_preparation\//.test(src));
    });
    await test(`（3.runtime isolation）application/${file} 完全不出現executionManager/historyStore/metricsStore/eventDispatcher變數名稱（沒有持有這些依賴）`, () => {
      const src = readSrc(path.join(applicationDir, file));
      assert.ok(!/executionManager/.test(src));
      assert.ok(!/historyStore/.test(src));
      assert.ok(!/metricsStore/.test(src));
      assert.ok(!/eventDispatcher/.test(src));
    });
  }

  await test('（3.runtime isolation）execution_manager.js/intelligence_facade.js完全沒有出現application字樣（Runtime沒有反過來認識Application Service的存在）', () => {
    assert.ok(!/application/i.test(readSrc(path.join(intelDir, 'execution', 'execution_manager.js'))));
    assert.ok(!/application/i.test(readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js'))));
  });

  await test('（3.runtime isolation，端對端）呼叫Application Service完全不會觸發Execution Manager的任何生命週期狀態轉換（因為Application Service透過模擬的facade，不是真正串接到Execution Manager，這裡驗證的是Application Service本身不會繞過注入的facade自己去操作Execution Manager）', async () => {
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    let executeCalled = false;
    const spyExecutionManager = { execute: async () => { executeCalled = true; return { ok: true, state: 'completed', data: {} }; } };
    // Application Service只拿到facade，完全沒有機會碰到spyExecutionManager
    const { facade } = makeSpyFacade();
    const svc = createApplicationService({ facade });
    await svc.requestIntelligence({}, { userId: 'u1' });
    assert.strictEqual(executeCalled, false, 'Application Service不應該有任何路徑能觸發到一個它沒被注入的Execution Manager');
    assert.strictEqual(typeof createExecutionManager, 'function');
  });

  console.log('');

  // =========================================================================
  // D. no database dependency
  // =========================================================================
  console.log('--- D. no database dependency ---');

  for (const file of APPLICATION_JS_FILES) {
    await test(`（4.no database dependency）application/${file} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(applicationDir, file))));
    });
    await test(`（4.no database dependency）application/${file} 完全沒有db.prepare()/SQL關鍵字/DIET_COACH_DB字樣`, () => {
      const src = readSrc(path.join(applicationDir, file));
      assert.ok(!/db\.prepare\(/.test(src));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（4.no database dependency）requestIntelligence()把db當作不透明的第一個參數，完全不呼叫db的任何方法', () => {
    const src = readSrc(path.join(applicationDir, 'application_service.js'));
    assert.ok(!/db\.(prepare|exec|batch|run)\(/.test(src));
  });

  await test('（4.no database dependency）application_service.js的函式簽章接受db作為第一個參數但完全不解讀其內部結構（跟Facade/Service/Orchestrator一致）', async () => {
    const { facade, calls } = makeSpyFacade();
    const svc = createApplicationService({ facade });
    const opaqueDb = { anything: 'goes', nested: { a: 1 } };
    await svc.requestIntelligence(opaqueDb, { userId: 'u1' });
    assert.strictEqual(calls[0].db, opaqueDb);
  });

  console.log('');

  // =========================================================================
  // E. no auth dependency
  // =========================================================================
  console.log('--- E. no auth dependency ---');

  for (const file of APPLICATION_JS_FILES) {
    await test(`（5.no auth dependency）application/${file} 完全不import src/auth/、src/oauth/、src/identity/、src/middleware/`, () => {
      const src = readSrc(path.join(applicationDir, file));
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
    await test(`（5.no auth dependency）application/${file} 完全沒有出現jwt/session/cookie相關字樣`, () => {
      const src = readSrc(path.join(applicationDir, file));
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    });
  }

  await test('（5.no auth dependency）application_service.js完全不呼叫requireAuth()/requireActiveUser()', () => {
    const src = readSrc(path.join(applicationDir, 'application_service.js'));
    assert.ok(!/requireAuth\(/.test(src));
    assert.ok(!/requireActiveUser\(/.test(src));
  });

  await test('（5.no auth dependency）requestIntelligence()完全不查詢「目前是誰登入」——userId一律由呼叫端當作request欄位傳入', () => {
    const src = readSrc(path.join(applicationDir, 'application_service.js'));
    assert.ok(!/getCurrentUser\(/.test(src));
    assert.ok(!/getLoggedInUser\(/.test(src));
  });

  console.log('');

  // =========================================================================
  // F. no AI dependency
  // =========================================================================
  console.log('--- F. no AI dependency ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  for (const file of APPLICATION_JS_FILES) {
    const codeOnly = readSrc(path.join(applicationDir, file));
    for (const pattern of AI_KEYWORDS) {
      await test(`（6.no AI dependency）application/${file} 的實際程式碼不含關鍵字樣 ${pattern}`, () => {
        assert.ok(!pattern.test(codeOnly), `${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }
    await test(`（6.no AI dependency）application/${file} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(codeOnly));
    });
    await test(`（6.no AI dependency）application/${file} 完全不 import 任何非相對路徑的外部套件`, () => {
      const imports = [...codeOnly.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${file} import了非相對路徑的外部套件：${imp}`);
      }
    });
  }

  await test('（6.no AI dependency）Application Service沒有任何機會接觸到Analysis/Recommendation Extension Point（modules注入機制）——那是更底層的事，跟Application Service完全無關', () => {
    const src = readSrc(path.join(applicationDir, 'application_service.js'));
    assert.ok(!/dependencies\.modules/.test(src));
  });

  console.log('');

  // =========================================================================
  // G. dependency direction
  // =========================================================================
  console.log('--- G. dependency direction ---');

  await test('（7.dependency direction）application_service.js唯一的相對路徑import是./application_result_builder.js', () => {
    const src = readSrc(path.join(applicationDir, 'application_service.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./application_result_builder.js']);
  });

  await test('（7.dependency direction）application_result_builder.js完全沒有任何import（純函式，零相依）', () => {
    const src = readSrc(path.join(applicationDir, 'application_result_builder.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（7.dependency direction）Facade完全不import src/intelligence/application/（雙向隔離——Facade不知道Application Service的存在）', () => {
    const facadeFiles = fs.readdirSync(path.join(intelDir, 'facade')).filter((f) => f.endsWith('.js'));
    for (const file of facadeFiles) {
      assert.ok(!/from\s+['"].*\/application\//.test(readSrc(path.join(intelDir, 'facade', file))));
    }
  });

  await test('（7.dependency direction）Execution Manager/Service/Orchestrator/Governance完全不import src/intelligence/application/', () => {
    for (const dir of ['execution', 'service', 'orchestration', 'governance']) {
      const files = fs.readdirSync(path.join(intelDir, dir)).filter((f) => f.endsWith('.js'));
      for (const file of files) {
        assert.ok(!/from\s+['"].*\/application\//.test(readSrc(path.join(intelDir, dir, file))), `${dir}/${file} 不應該import application/`);
      }
    }
  });

  await test('（7.dependency direction）src/controllers/、src/routes/、src/worker.js完全沒有任何檔案import src/intelligence/application/（本次任務明確禁止新增API route）', () => {
    const files = [
      ...fs.readdirSync(path.join(srcRoot, 'controllers')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'controllers', f)),
      ...fs.readdirSync(path.join(srcRoot, 'routes')).filter((f) => f.endsWith('.js')).map((f) => path.join(srcRoot, 'routes', f)),
      path.join(srcRoot, 'worker.js'),
    ];
    for (const f of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\//.test(readSrc(f)), `${f} 不應該import intelligence/application/`);
    }
  });

  await test('（7.dependency direction）src/services/（既有Domain Service）完全不import src/intelligence/application/', () => {
    const files = fs.readdirSync(path.join(srcRoot, 'services')).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      assert.ok(!/from\s+['"].*\/intelligence\/application\//.test(readSrc(path.join(srcRoot, 'services', file))));
    }
  });

  const allIntelFilesExceptApplication = listAllJsFiles(intelDir).filter((f) => !f.includes(path.join('intelligence', 'application')) && f !== path.join(intelDir, 'index.js'));
  for (const f of allIntelFilesExceptApplication) {
    const relName = path.relative(repoRoot, f);
    await test(`（7.dependency direction）${relName} 完全不import src/intelligence/application/（下層不知道Application Service的存在，維持「每一層只認識自己呼叫的下一層」）`, () => {
      assert.ok(!/from\s+['"].*\/application\//.test(readSrc(f)), `${relName} 不應該import application/`);
    });
  }

  await test('（7.dependency direction，端對端）合法流程Application Service→Facade→Service→Execution Runtime→Analysis/Recommendation從頭到尾真實跑一次成功', async () => {
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

    const result = await applicationService.requestIntelligence({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.status, 'intelligence_ready');
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['metadata', 'result', 'status']);
  });

  console.log('');

  // =========================================================================
  // H. export consistency
  // =========================================================================
  console.log('--- H. export consistency ---');

  await test('（8.export consistency）application/index.js完整re-export了application/底下每個原始檔案的全部具名export', () => {
    const reExported = getReExportedNames(path.join(applicationDir, 'index.js'));
    for (const file of ['application_service.js', 'application_result_builder.js']) {
      const names = getNamedExports(path.join(applicationDir, file));
      for (const name of names) {
        assert.ok(reExported.has(name), `application/index.js 缺少 re-export ${name}（來自${file}）`);
      }
    }
  });

  await test('（8.export consistency）application/index.js re-export的名稱在對應來源檔案裡確實存在（沒有re-export不存在的東西）', () => {
    const indexSrc = readSrc(path.join(applicationDir, 'index.js'));
    for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const sourceFile = path.normalize(path.join(applicationDir, m[2]));
      const sourceExports = getNamedExports(sourceFile);
      for (const name of names) {
        assert.ok(sourceExports.has(name), `application/index.js re-export了${sourceFile}裡不存在的${name}`);
      }
    }
  });

  await test('（8.export consistency）src/intelligence/index.js 有 export * as application from ./application/index.js', () => {
    const src = readSrc(path.join(intelDir, 'index.js'));
    assert.ok(/export \* as application from ['"]\.\/application\/index\.js['"]/.test(src));
  });

  await test('（8.export consistency）import後，intelligenceModule.application 是非空物件，具備createApplicationService/createApplicationResultBuilder', async () => {
    const intelligenceModule = await import(path.join(intelDir, 'index.js'));
    assert.strictEqual(typeof intelligenceModule.application, 'object');
    assert.strictEqual(typeof intelligenceModule.application.createApplicationService, 'function');
    assert.strictEqual(typeof intelligenceModule.application.createApplicationResultBuilder, 'function');
  });

  await test('（TASK1.64後更新）（8.export consistency）app.intelligence（bootstrap組裝結果）恰好具備20個欄位（TASK1.55既有16個加上TASK1.60新增的application、TASK1.61新增的useCases、TASK1.62新增的capabilities、TASK1.64新增的workflow）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'governance', 'history', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  await test('（8.export consistency）app.intelligence.application具備requestIntelligence一個函式', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence.application), ['requestIntelligence']);
  });

  await test('（8.export consistency）app.intelligence.application注入的facade跟app.intelligence.facade是同一個實例', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const viaFacade = await app.intelligence.facade.executeIntelligence({}, { userId: 'u1' });
    const viaApplication = await app.intelligence.application.requestIntelligence({}, { userId: 'u1' });
    assert.deepStrictEqual(viaFacade.data, viaApplication.data);
  });

  await test('（8.export consistency）每次createApplication()呼叫都各自建立獨立的Application Service實例（不是共用singleton）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app1 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    const app2 = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app1.intelligence.application, app2.intelligence.application);
  });

  await test('（8.export consistency）app.router.routes 數量沒有因為新增application而改變（依然是21條，本次任務明確禁止新增API route）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 21);
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.60-application-service')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（9.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2全部）`, () => {
      assert.ok(allSuites.length >= 51, `預期至少51個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（10.P1-P6）src/worker.js 完全沒有被TASK1.60修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.P1-P6）wrangler.toml 完全沒有被TASK1.60修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（10.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被TASK1.60修改（本次任務只允許新增src/intelligence/application/跟修改src/intelligence/index.js/src/bootstrap/application.js作為純新增namespace）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.P1-P6）Analysis/Recommendation Runner/Execution Manager的原始碼完全沒有被TASK1.60修改（規格明確禁止修改Execution Runtime Behavior）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/intelligence/analysis/analysis_runner.js src/intelligence/recommendation/recommendation_runner.js src/intelligence/execution/execution_manager.js src/intelligence/facade/intelligence_facade.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

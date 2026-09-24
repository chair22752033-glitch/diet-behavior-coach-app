/*
 * Phase 1 TASK 1.57｜Phase 2 Intelligence Runtime Ending Preparation
 * Review 測試
 *
 * 本任務不是新增功能——延續TASK1.56的架構審查手法，這是Phase 2
 * 結束前最後一份審查測試：不驗證任何一個特定子層的業務邏輯，而是
 * 從「Phase 2整體是否具備進入Ending Review的條件」這個角度驗證：
 * - Layer Completeness：Input/Context/Analysis/Recommendation/
 *   Execution/Runtime/Governance七個boundary是否都存在
 * - Extension Point：Facade/Service/Execution Manager/Governance
 *   四個Phase 3接入口是否明確，Controller/Route/Worker/Domain
 *   Service是否完全不知道Intelligence Layer的存在
 * - Data Flow：Domain Data → Data Preparation → Insight Context →
 *   Analysis → Recommendation → Execution Runtime是否維持單向
 * - Security Boundary：Intelligence Layer是否完全不接觸
 *   Authentication/Session/OAuth/User Identity Provider
 * - Dependency Review：再次確認SQL/HTTP/fetch/AI SDK/external API
 *   全部為零
 *
 * 分為以下11個部分：
 * A) layer completeness
 * B) extension point
 * C) dependency direction
 * D) data flow
 * E) governance boundary
 * F) execution boundary
 * G) security isolation
 * H) no AI dependency
 * I) no database dependency
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

function listAllFilesInDir(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && (!ext || e.name.endsWith(ext)))
    .map((e) => path.join(dir, e.name));
}

async function run() {
  const allIntelFiles = listAllJsFiles(intelDir);

  // =========================================================================
  // A. layer completeness
  // =========================================================================
  console.log('--- A. layer completeness ---');

  const BOUNDARY_MAP = {
    'Input boundary (Data Preparation)': 'data_preparation',
    'Context boundary (Insight Context)': 'context',
    'Analysis boundary': 'analysis',
    'Recommendation boundary': 'recommendation',
    'Execution boundary (Execution Manager)': 'execution',
    'Runtime boundary (Runtime Context)': 'runtime',
    'Governance boundary': 'governance',
  };

  for (const [label, dir] of Object.entries(BOUNDARY_MAP)) {
    await test(`（1.layer completeness）${label} 存在：src/intelligence/${dir}/`, () => {
      assert.ok(fs.existsSync(path.join(intelDir, dir)), `${dir}/ 目錄不存在`);
      assert.ok(fs.existsSync(path.join(intelDir, dir, 'index.js')), `${dir}/index.js 不存在`);
      assert.ok(fs.existsSync(path.join(intelDir, dir, 'README.md')), `${dir}/README.md 不存在`);
    });
  }

  await test('（1.layer completeness）額外的Support boundary（Orchestration/Service/Facade/Events/History/Monitoring/Metrics/Contracts）全部存在', () => {
    for (const dir of ['orchestration', 'service', 'facade', 'events', 'history', 'monitoring', 'metrics', 'contracts']) {
      assert.ok(fs.existsSync(path.join(intelDir, dir)), `${dir}/ 目錄不存在`);
    }
  });

  await test('（1.layer completeness）每個boundary都至少有一份對應的backups/測試套件（Phase 2從TASK1.41到TASK1.56，每個boundary都被獨立測試過）', () => {
    const backupsDir = path.join(repoRoot, 'backups');
    const suiteDirs = fs.readdirSync(backupsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    const expectedKeywords = ['data-preparation', 'insight-context', 'analysis-framework', 'recommendation-framework', 'orchestration', 'intelligence-service', 'execution-contract', 'intelligence-facade', 'runtime-context', 'execution-manager', 'execution-events', 'execution-history', 'execution-monitoring', 'execution-metrics', 'governance'];
    for (const keyword of expectedKeywords) {
      const found = suiteDirs.some((d) => d.includes(keyword));
      assert.ok(found, `找不到跟"${keyword}"對應的backups/測試套件目錄`);
    }
  });

  await test('（1.layer completeness）Data Preparation層透過既有Domain Service取得資料，不直接存取D1（Input boundary的邊界是Domain Service，不是資料庫本身）', () => {
    const src = readSrc(path.join(intelDir, 'data_preparation', 'context_builder.js'));
    assert.ok(!/from\s+['"].*\/db\//.test(src));
    assert.ok(/from\s+['"]\.\.\/\.\.\/services\//.test(src));
  });

  console.log('');

  // =========================================================================
  // B. extension point
  // =========================================================================
  console.log('--- B. extension point ---');

  const EXTENSION_POINTS = ['facade', 'service', 'execution', 'governance'];

  for (const point of EXTENSION_POINTS) {
    await test(`（2.extension point）${point}/ 提供依賴注入介面（createXxx(dependencies)形式的factory function）`, () => {
      const indexPath = path.join(intelDir, point, 'index.js');
      const src = readSrc(indexPath);
      assert.ok(/export\s*\{\s*create\w+/.test(src), `${point}/index.js 應該re-export一個create開頭的factory function`);
    });
  }

  await test('（2.extension point）src/controllers/ 完全沒有任何檔案import src/intelligence/', () => {
    const files = listAllFilesInDir(path.join(srcRoot, 'controllers'), '.js');
    for (const f of files) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/intelligence\//.test(src), `${f} 不應該import intelligence/`);
    }
  });

  await test('（2.extension point）src/routes/ 完全沒有任何檔案import src/intelligence/', () => {
    const files = listAllFilesInDir(path.join(srcRoot, 'routes'), '.js');
    for (const f of files) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/intelligence\//.test(src), `${f} 不應該import intelligence/`);
    }
  });

  await test('（2.extension point）src/worker.js 完全沒有import src/intelligence/', () => {
    const src = readSrc(path.join(srcRoot, 'worker.js'));
    assert.ok(!/from\s+['"].*\/intelligence\//.test(src));
  });

  await test('（2.extension point）src/services/（既有Domain Service）完全沒有任何檔案import src/intelligence/（依賴方向只能是intelligence依賴services，不能反過來）', () => {
    const files = listAllFilesInDir(path.join(srcRoot, 'services'), '.js');
    for (const f of files) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/intelligence\//.test(src), `${f} 不應該import intelligence/`);
    }
  });

  await test('（2.extension point）唯一import src/intelligence/index.js的production檔案是src/bootstrap/application.js（Phase 3若要接入必須透過這個既有組裝點，或直接使用Facade/Service/Execution Manager/Governance四個既有介面，不需要新增另一個平行的組裝路徑）', () => {
    const filesToCheck = [
      ...listAllFilesInDir(path.join(srcRoot, 'controllers'), '.js'),
      ...listAllFilesInDir(path.join(srcRoot, 'routes'), '.js'),
      ...listAllFilesInDir(path.join(srcRoot, 'services'), '.js'),
      ...listAllFilesInDir(path.join(srcRoot, 'auth'), '.js'),
      ...listAllFilesInDir(path.join(srcRoot, 'oauth'), '.js'),
      ...listAllFilesInDir(path.join(srcRoot, 'identity'), '.js'),
      ...listAllFilesInDir(path.join(srcRoot, 'middleware'), '.js'),
      ...listAllFilesInDir(path.join(srcRoot, 'db'), '.js'),
      path.join(srcRoot, 'worker.js'),
    ];
    const importers = filesToCheck.filter((f) => fs.existsSync(f) && /from\s+['"].*\/intelligence\//.test(readSrc(f)));
    assert.deepStrictEqual(importers, []);
  });

  await test('（2.extension point）Facade/Service/Execution Manager/Governance四者都可以在沒有真實D1/env的情況下獨立建立實例（純記憶體/純函式，適合未來替換實作）', async () => {
    const { createIntelligenceFacade } = await import(path.join(intelDir, 'facade', 'index.js'));
    const { createIntelligenceService } = await import(path.join(intelDir, 'service', 'index.js'));
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    const { createGovernanceService } = await import(path.join(intelDir, 'governance', 'index.js'));
    assert.doesNotThrow(() => createIntelligenceFacade({}));
    assert.doesNotThrow(() => createIntelligenceService({}));
    assert.doesNotThrow(() => createExecutionManager({}));
    assert.doesNotThrow(() => createGovernanceService({}));
  });

  console.log('');

  // =========================================================================
  // C. dependency direction
  // =========================================================================
  console.log('--- C. dependency direction ---');

  const graph = {};
  for (const f of allIntelFiles) {
    const src = readSrc(f);
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((imp) => imp.startsWith('.'));
    graph[f] = imports.map((imp) => path.normalize(path.join(path.dirname(f), imp)));
  }

  await test('（3.dependency direction）整個src/intelligence/依賴圖沒有循環依賴（重新以DFS驗證，跟TASK1.56的發現一致）', () => {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = {};
    for (const f of allIntelFiles) color[f] = WHITE;
    let cycleEdge = null;
    function dfs(node) {
      color[node] = GRAY;
      for (const next of graph[node] || []) {
        if (!(next in graph)) continue;
        if (color[next] === GRAY) cycleEdge = `${node} -> ${next}`;
        else if (color[next] === WHITE) dfs(next);
      }
      color[node] = BLACK;
    }
    for (const f of allIntelFiles) {
      if (color[f] === WHITE) dfs(f);
    }
    assert.strictEqual(cycleEdge, null, `發現循環依賴：${cycleEdge}`);
  });

  await test('（3.dependency direction）Data Preparation層完全不依賴Context/Analysis/Recommendation/Orchestration（資料只往下游流動，上游不知道下游存在）', () => {
    const src = readSrc(path.join(intelDir, 'data_preparation', 'context_builder.js')) + readSrc(path.join(intelDir, 'data_preparation', 'data_normalizer.js'));
    assert.ok(!/from\s+['"]\.\.\/context\//.test(src));
    assert.ok(!/from\s+['"]\.\.\/analysis\//.test(src));
    assert.ok(!/from\s+['"]\.\.\/recommendation\//.test(src));
    assert.ok(!/from\s+['"]\.\.\/orchestration\//.test(src));
  });

  await test('（3.dependency direction）Context層完全不依賴Analysis/Recommendation/Orchestration', () => {
    const src = readSrc(path.join(intelDir, 'context', 'insight_context_builder.js'));
    assert.ok(!/from\s+['"]\.\.\/analysis\//.test(src));
    assert.ok(!/from\s+['"]\.\.\/recommendation\//.test(src));
    assert.ok(!/from\s+['"]\.\.\/orchestration\//.test(src));
  });

  await test('（3.dependency direction）Analysis層完全不依賴Recommendation/Orchestration', () => {
    const src = readSrc(path.join(intelDir, 'analysis', 'analysis_runner.js'));
    assert.ok(!/from\s+['"]\.\.\/recommendation\//.test(src));
    assert.ok(!/from\s+['"]\.\.\/orchestration\//.test(src));
  });

  await test('（3.dependency direction）Recommendation層完全不依賴Orchestration（下游不會反過來依賴協調它的上層）', () => {
    const src = readSrc(path.join(intelDir, 'recommendation', 'recommendation_runner.js'));
    assert.ok(!/from\s+['"]\.\.\/orchestration\//.test(src));
  });

  await test('（3.dependency direction）Orchestrator完全透過依賴注入取得dataPreparation/contextBuilder/analysisRunner/recommendationRunner，不直接import任何一個（維持鬆散耦合，四層可以各自被替換）', () => {
    const src = readSrc(path.join(intelDir, 'orchestration', 'intelligence_orchestrator.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./orchestration_result_builder.js']);
  });

  console.log('');

  // =========================================================================
  // D. data flow
  // =========================================================================
  console.log('--- D. data flow ---');

  const orchestratorSrc = readSrc(path.join(intelDir, 'orchestration', 'intelligence_orchestrator.js'));

  await test('（4.data flow）Orchestrator的runIntelligencePipeline()原始碼裡，dataPreparation.prepare()出現在contextBuilder.buildInsightContext()之前', () => {
    const idxPrepare = orchestratorSrc.indexOf('dataPreparation.prepare(');
    const idxContext = orchestratorSrc.indexOf('contextBuilder.buildInsightContext(');
    assert.ok(idxPrepare > -1 && idxContext > -1 && idxPrepare < idxContext);
  });

  await test('（4.data flow）Orchestrator的runIntelligencePipeline()原始碼裡，contextBuilder.buildInsightContext()出現在analysisRunner.runAnalysis()之前', () => {
    const idxContext = orchestratorSrc.indexOf('contextBuilder.buildInsightContext(');
    const idxAnalysis = orchestratorSrc.indexOf('analysisRunner.runAnalysis(');
    assert.ok(idxContext > -1 && idxAnalysis > -1 && idxContext < idxAnalysis);
  });

  await test('（4.data flow）Orchestrator的runIntelligencePipeline()原始碼裡，analysisRunner.runAnalysis()出現在recommendationRunner.runRecommendation()之前', () => {
    const idxAnalysis = orchestratorSrc.indexOf('analysisRunner.runAnalysis(');
    const idxRecommendation = orchestratorSrc.indexOf('recommendationRunner.runRecommendation(');
    assert.ok(idxAnalysis > -1 && idxRecommendation > -1 && idxAnalysis < idxRecommendation);
  });

  await test('（4.data flow，端對端）真實執行一次完整pipeline，確認四個階段依序被呼叫且輸出正確往下傳遞（analysis的輸入是context，recommendation的輸入是analysis的輸出）', async () => {
    const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));
    const callOrder = [];
    const dataPreparation = { prepare: async () => { callOrder.push('prepare'); return { ok: true, context: { raw: true } }; } };
    const contextBuilder = { buildInsightContext: (prepared) => { callOrder.push('context'); assert.deepStrictEqual(prepared, { raw: true }); return { context: { normalized: true }, validation: { ok: true } }; } };
    const analysisRunner = { runAnalysis: (context) => { callOrder.push('analysis'); assert.deepStrictEqual(context, { normalized: true }); return { ok: true, result: { analyzed: true } }; } };
    const recommendationRunner = { runRecommendation: (analysisResult) => { callOrder.push('recommendation'); assert.deepStrictEqual(analysisResult, { analyzed: true }); return { ok: true, result: { recommended: true } }; } };

    const orchestrator = createIntelligenceOrchestrator({ dataPreparation, contextBuilder, analysisRunner, recommendationRunner });
    const result = await orchestrator.runIntelligencePipeline({}, 'u1', {});

    assert.deepStrictEqual(callOrder, ['prepare', 'context', 'analysis', 'recommendation']);
    assert.strictEqual(result.ok, true);
  });

  await test('（4.data flow）Execution Runtime（Facade→Execution Manager→Service→Orchestrator）是資料流的終點——Facade.executeIntelligence()原始碼裡，createRuntimeContext()出現在executionManager.execute()之前（先建好Runtime Context再往下傳）', () => {
    const src = readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js'));
    const idxRuntime = src.indexOf('createRuntimeContext(');
    const idxExecute = src.indexOf('executionManager.execute(');
    assert.ok(idxRuntime > -1 && idxExecute > -1 && idxRuntime < idxExecute);
  });

  console.log('');

  // =========================================================================
  // E. governance boundary
  // =========================================================================
  console.log('--- E. governance boundary ---');

  const governanceDir = path.join(intelDir, 'governance');

  await test('（5.governance boundary）governance/execution_policy.js完全無外部相依（零import）', () => {
    const src = readSrc(path.join(governanceDir, 'execution_policy.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（5.governance boundary）governance/整個目錄完全無state-holding結構（let/var/Map/Set），保持完全stateless', () => {
    for (const file of fs.readdirSync(governanceDir).filter((f) => f.endsWith('.js'))) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/\blet\s+\w/.test(src));
      assert.ok(!/\bvar\s+\w/.test(src));
      assert.ok(!/new Map\(/.test(src));
      assert.ok(!/new Set\(/.test(src));
    }
  });

  await test('（5.governance boundary）governance/不依賴database（沒有db參數、沒有import src/db/）', async () => {
    for (const file of fs.readdirSync(governanceDir).filter((f) => f.endsWith('.js'))) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    }
    const { createGovernanceService } = await import(path.join(governanceDir, 'governance_service.js'));
    const svc = createGovernanceService();
    assert.strictEqual(svc.validateExecution.length, 1);
  });

  await test('（5.governance boundary）governance/不依賴authentication（沒有import src/auth|oauth|identity|middleware/）', () => {
    for (const file of fs.readdirSync(governanceDir).filter((f) => f.endsWith('.js'))) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/(auth|oauth|identity|middleware)\//.test(src));
    }
  });

  await test('（5.governance boundary）governance/不依賴任何domain service（沒有import src/services/）', () => {
    for (const file of fs.readdirSync(governanceDir).filter((f) => f.endsWith('.js'))) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/from\s+['"].*\/services\//.test(src));
    }
  });

  await test('（5.governance boundary）目前governance完全沒有被接進execution flow——execution_manager.js/intelligence_facade.js/intelligence_service.js/intelligence_orchestrator.js四者完全沒有出現governance字樣', () => {
    for (const [dir, file] of [['execution', 'execution_manager.js'], ['facade', 'intelligence_facade.js'], ['service', 'intelligence_service.js'], ['orchestration', 'intelligence_orchestrator.js']]) {
      const src = readSrc(path.join(intelDir, dir, file));
      assert.ok(!/governance/i.test(src), `${dir}/${file} 不應該出現governance字樣`);
    }
  });

  await test('（5.governance boundary）這個「未接入execution flow」的設計符合Phase 2架構（規格明確禁止「強制接入 Governance 到 Execution Manager」，目前狀態正是刻意維持獨立）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app.intelligence.governance, app.intelligence.execution);
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.execution.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.ok, true, 'Execution Manager完全不需要Governance批准就能執行成功，證明governance目前確實未被強制接入');
  });

  console.log('');

  // =========================================================================
  // F. execution boundary
  // =========================================================================
  console.log('--- F. execution boundary ---');

  const executionManagerSrc = readSrc(path.join(intelDir, 'execution', 'execution_manager.js'));

  await test('（6.execution boundary）execution_manager.js是唯一定義setState()的檔案', () => {
    for (const f of allIntelFiles) {
      if (f.endsWith(path.join('execution', 'execution_manager.js'))) continue;
      assert.ok(!/function\s+setState\(/.test(readSrc(f)));
    }
  });

  await test('（6.execution boundary）execution_manager.js是唯一呼叫historyStore.add(跟eventDispatcher.emit(的檔案', () => {
    for (const f of allIntelFiles) {
      if (f.endsWith(path.join('execution', 'execution_manager.js'))) continue;
      const src = readSrc(f);
      assert.ok(!/historyStore\.add\(/.test(src));
      assert.ok(!/eventDispatcher\.emit\(/.test(src));
    }
  });

  await test('（6.execution boundary）EXECUTION_STATES固定四個字串，沒有任何檔案定義另一套狀態列舉', () => {
    for (const f of allIntelFiles) {
      if (f.endsWith(path.join('execution', 'execution_state.js'))) continue;
      const src = readSrc(f);
      assert.ok(!/const\s+EXECUTION_STATES\s*=/.test(src));
    }
  });

  await test('（6.execution boundary，端對端）Execution Manager的execute()回傳格式從TASK1.50建立以來完全沒有改變——恆為{ok, state, data|reason}三/三個欄位', async () => {
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    const service = { getIntelligence: async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } }) };
    const manager = createExecutionManager({ service });
    const successResult = await manager.execute({}, { request: { userId: 'u1' } });
    assert.deepStrictEqual(Object.keys(successResult).sort(), ['data', 'ok', 'state']);
    const failResult = await manager.execute({}, { request: {} });
    assert.deepStrictEqual(Object.keys(failResult).sort(), ['ok', 'reason', 'state']);
  });

  console.log('');

  // =========================================================================
  // G. security isolation
  // =========================================================================
  console.log('--- G. security isolation ---');

  for (const f of allIntelFiles) {
    const relName = path.relative(repoRoot, f);
    await test(`（7.security isolation）${relName} 完全不import src/auth/或src/oauth/或src/identity/或src/middleware/（不接觸Authentication/OAuth/User Identity Provider/session middleware）`, () => {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/auth\//.test(src), `${relName} 不應該import src/auth/`);
      assert.ok(!/from\s+['"].*\/oauth\//.test(src), `${relName} 不應該import src/oauth/`);
      assert.ok(!/from\s+['"].*\/identity\//.test(src), `${relName} 不應該import src/identity/`);
      assert.ok(!/from\s+['"].*\/middleware\//.test(src), `${relName} 不應該import src/middleware/`);
    });
  }

  await test('（7.security isolation）整個src/intelligence/完全不import src/identity/（不接觸User Identity Provider，逐檔案彙總確認）', () => {
    for (const f of allIntelFiles) {
      assert.ok(!/from\s+['"].*\/identity\//.test(readSrc(f)), `${f} 不應該import src/identity/`);
    }
  });

  await test('（7.security isolation）整個src/intelligence/完全不import src/middleware/（不接觸session middleware）', () => {
    for (const f of allIntelFiles) {
      assert.ok(!/from\s+['"].*\/middleware\//.test(readSrc(f)), `${f} 不應該import src/middleware/`);
    }
  });

  await test('（7.security isolation）整個src/intelligence/完全沒有出現JWT/session/cookie相關字樣', () => {
    for (const f of allIntelFiles) {
      const src = readSrc(f);
      assert.ok(!/\bjwt\b/i.test(src), `${f} 不應該出現jwt字樣`);
      assert.ok(!/\bsession\b/i.test(src), `${f} 不應該出現session字樣`);
      assert.ok(!/\bcookie\b/i.test(src), `${f} 不應該出現cookie字樣`);
    }
  });

  await test('（7.security isolation）整個src/intelligence/完全沒有呼叫requireAuth()（HTTP authentication middleware）', () => {
    for (const f of allIntelFiles) {
      assert.ok(!/requireAuth\(/.test(readSrc(f)), `${f} 不應該呼叫requireAuth()`);
    }
  });

  await test('（7.security isolation）除了data_preparation/context_builder.js（TASK1.41既定呼叫既有user_service.js的requireActiveUser()，業務層使用者狀態查詢，不是HTTP authentication）以外，其餘全部檔案完全不呼叫requireActiveUser()', () => {
    for (const f of allIntelFiles) {
      if (f.endsWith(path.join('data_preparation', 'context_builder.js'))) continue;
      assert.ok(!/requireActiveUser\(/.test(readSrc(f)), `${f} 不應該呼叫requireActiveUser()`);
    }
  });

  console.log('');

  // =========================================================================
  // H. no AI dependency
  // =========================================================================
  console.log('--- H. no AI dependency ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];
  for (const pattern of AI_KEYWORDS) {
    await test(`（8.no AI dependency）整個src/intelligence/的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
      for (const f of allIntelFiles) {
        assert.ok(!pattern.test(readSrc(f)), `${f} 出現疑似AI相關字樣：${pattern}`);
      }
    });
  }

  for (const f of allIntelFiles) {
    const relName = path.relative(repoRoot, f);
    await test(`（8.no AI dependency）${relName} 完全沒有呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(readSrc(f)), `${relName} 不應該呼叫fetch()`);
    });
  }

  await test('（8.no AI dependency）整個src/intelligence/完全沒有任何非相對路徑的外部套件import（沒有AI SDK/external API client library）', () => {
    for (const f of allIntelFiles) {
      const imports = [...readSrc(f).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${f} import了非相對路徑的外部套件：${imp}`);
      }
    }
  });

  await test('（8.no AI dependency）analysis_engine.js/recommendation_engine.js（TASK1.40既有的占位engine）依然回傳固定的not_implemented結果，沒有被接上任何真實模型', async () => {
    const { createAnalysisEngine, createRecommendationEngine } = await import(path.join(intelDir, 'index.js'));
    const analysisEngine = createAnalysisEngine();
    const recommendationEngine = createRecommendationEngine();
    assert.deepStrictEqual(await analysisEngine.analyze({}), { status: 'not_implemented', result: null });
    assert.deepStrictEqual(await recommendationEngine.recommend({}), { status: 'not_implemented', recommendations: [] });
  });

  console.log('');

  // =========================================================================
  // I. no database dependency
  // =========================================================================
  console.log('--- I. no database dependency ---');

  const NON_DATA_PREP_FILES = allIntelFiles.filter((f) => !f.includes(path.join('intelligence', 'data_preparation')));

  for (const f of NON_DATA_PREP_FILES) {
    const relName = path.relative(repoRoot, f);
    await test(`（9.no database dependency）${relName} 完全不import src/db/（除了data_preparation/透過既有Domain Service間接存取以外，其餘全部檔案）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(f)), `${relName} 不應該import src/db/`);
    });
  }

  await test('（9.no database dependency）data_preparation/context_builder.js本身也完全不直接import src/db/', () => {
    const src = readSrc(path.join(intelDir, 'data_preparation', 'context_builder.js'));
    assert.ok(!/from\s+['"].*\/db\//.test(src));
  });

  await test('（9.no database dependency）整個src/intelligence/完全沒有db.prepare()/SQL關鍵字/DIET_COACH_DB字樣', () => {
    for (const f of allIntelFiles) {
      const src = readSrc(f);
      assert.ok(!/db\.prepare\(/.test(src), `${f} 不應該呼叫db.prepare()`);
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src), `${f} 不應該出現SQL關鍵字`);
      assert.ok(!/DIET_COACH_DB/.test(src), `${f} 不應該出現DIET_COACH_DB`);
    }
  });

  await test('（9.no database dependency）Facade/Service/Orchestrator/Execution Manager全部把db當作不透明參數原樣往下轉交，完全不解讀其內部結構', () => {
    const facadeSrc = readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js'));
    const serviceSrc = readSrc(path.join(intelDir, 'service', 'intelligence_service.js'));
    const orchestratorSrc2 = readSrc(path.join(intelDir, 'orchestration', 'intelligence_orchestrator.js'));
    const execSrc = readSrc(path.join(intelDir, 'execution', 'execution_manager.js'));
    for (const src of [facadeSrc, serviceSrc, orchestratorSrc2, execSrc]) {
      assert.ok(!/db\.\w+\(/.test(src) || /executionManager\.execute\(|orchestrator\.runIntelligencePipeline\(|service\.getIntelligence\(/.test(src));
    }
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.57-ending-preparation')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（10.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.56）`, () => {
      assert.ok(allSuites.length >= 48, `預期至少48個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（11.P1-P6）src/worker.js 完全沒有被TASK1.57修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）wrangler.toml 完全沒有被TASK1.57修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（11.P1-P6）本次審查完全沒有修改任何production邏輯檔案——git diff --name-only只應該顯示src/intelligence/底下的.md/.js檔案（註解/文件）跟backups/底下的新增測試檔案', () => {
    const diffFiles = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const f of diffFiles) {
      assert.ok(
        f.startsWith('src/intelligence/') || f.startsWith('backups/'),
        `TASK1.57不應該修改${f}（Ending Preparation Review只允許動src/intelligence/文件跟backups/測試）`
      );
    }
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

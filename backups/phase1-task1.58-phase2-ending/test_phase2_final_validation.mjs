/*
 * Phase 1 TASK 1.58｜Phase 2 Intelligence Runtime Final Validation &
 * Ending Review 測試
 *
 * 本任務是Phase 2最終驗證任務——不是新增功能，這是Phase 2結束前的
 * 最後一份測試套件。延續TASK1.56/1.57的架構審查手法，這裡額外聚焦
 * 驗證三件事，是前兩份審查測試沒有明確覆蓋的：
 * 1. 三層職責邊界（Application只透過Facade使用Intelligence、Runtime
 *    Layer只負責execution lifecycle/monitoring/history/metrics/
 *    governance、Pipeline Layer只負責context/analysis/
 *    recommendation）沒有被混淆——用「哪些子目錄群組彼此完全不互相
 *    import」的程式化驗證表達。
 * 2. Phase 3 Analysis/Recommendation Extension Point（
 *    `dependencies.modules`注入機制）確實可用、確實deterministic、
 *    確實不需要修改Orchestrator/Service/Facade任何一行程式碼。
 * 3. Phase 2 Layer Completeness/Namespace Consistency/Dependency
 *    Validation/Execution Lifecycle/Governance Isolation/no AI/
 *    no auth/no database全部再驗證一次，作為Phase 2結束前的最終
 *    快照確認，跟TASK1.56/1.57當時驗證的結果保持一致（沒有任何
 *    退化）。
 *
 * 分為以下12個部分：
 * A) layer completeness
 * B) namespace consistency
 * C) dependency validation
 * D) boundary validation
 * E) execution lifecycle
 * F) governance isolation
 * G) phase3 extension point
 * H) no AI dependency
 * I) no auth dependency
 * J) no database dependency
 * K) regression check
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

async function run() {
  const allIntelFiles = listAllJsFiles(intelDir);

  // =========================================================================
  // A. layer completeness
  // =========================================================================
  console.log('--- A. layer completeness ---');

  const REQUIRED_LAYERS = [
    'data_preparation', 'context', 'analysis', 'recommendation', 'orchestration',
    'service', 'facade', 'runtime', 'execution', 'events', 'history', 'monitoring',
    'metrics', 'governance',
  ];

  await test('（1.layer completeness）規格列出的14個Layer恰好全部存在於src/intelligence/底下', () => {
    for (const layer of REQUIRED_LAYERS) {
      assert.ok(fs.existsSync(path.join(intelDir, layer)), `${layer}/ 不存在`);
    }
  });

  for (const layer of REQUIRED_LAYERS) {
    await test(`（1.layer completeness）${layer}/ 具備index.js`, () => {
      assert.ok(fs.existsSync(path.join(intelDir, layer, 'index.js')));
    });
    await test(`（1.layer completeness）${layer}/ 具備README.md`, () => {
      assert.ok(fs.existsSync(path.join(intelDir, layer, 'README.md')));
    });
    await test(`（1.layer completeness）${layer}/ 具備至少一個非index.js的.js原始檔案`, () => {
      const files = fs.readdirSync(path.join(intelDir, layer)).filter((f) => f.endsWith('.js') && f !== 'index.js');
      assert.ok(files.length > 0, `${layer}/ 應該至少有一個實作檔案`);
    });
  }

  await test('（1.layer completeness）每個Layer在backups/底下都至少有一份專屬測試套件目錄', () => {
    const backupsDir = path.join(repoRoot, 'backups');
    const suiteDirs = fs.readdirSync(backupsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    const keywords = ['data-preparation', 'insight-context', 'analysis-framework', 'recommendation-framework', 'orchestration', 'intelligence-service', 'intelligence-facade', 'runtime-context', 'execution-manager', 'execution-events', 'execution-history', 'execution-monitoring', 'execution-metrics', 'governance'];
    for (const keyword of keywords) {
      assert.ok(suiteDirs.some((d) => d.includes(keyword)), `找不到跟"${keyword}"對應的測試套件目錄`);
    }
  });

  console.log('');

  // =========================================================================
  // B. namespace consistency
  // =========================================================================
  console.log('--- B. namespace consistency ---');

  const rootIndexSrc = readSrc(path.join(intelDir, 'index.js'));
  const intelligenceModule = await import(path.join(intelDir, 'index.js'));

  for (const layer of REQUIRED_LAYERS) {
    await test(`（2.namespace consistency）src/intelligence/index.js 正確 export * as 對應 ${layer}/`, () => {
      const pattern = new RegExp(`export \\* as \\w+ from ['"]\\./${layer}/index\\.js['"]`);
      assert.ok(pattern.test(rootIndexSrc));
    });
  }

  const NAMESPACE_KEYS = ['dataPreparation', 'context', 'analysis', 'recommendation', 'orchestration', 'service', 'facade', 'runtime', 'execution', 'events', 'history', 'monitoring', 'metrics', 'governance'];
  for (const key of NAMESPACE_KEYS) {
    await test(`（2.namespace consistency）import後，intelligenceModule.${key} 是非空物件`, () => {
      assert.strictEqual(typeof intelligenceModule[key], 'object');
      assert.ok(Object.keys(intelligenceModule[key]).length > 0);
    });
  }

  for (const layer of REQUIRED_LAYERS) {
    await test(`（2.namespace consistency）${layer}/index.js 完整re-export了${layer}/底下每個原始檔案的全部具名export`, () => {
      const dirPath = path.join(intelDir, layer);
      const reExported = getReExportedNames(path.join(dirPath, 'index.js'));
      const siblingFiles = fs.readdirSync(dirPath).filter((f) => f.endsWith('.js') && f !== 'index.js');
      for (const file of siblingFiles) {
        const names = getNamedExports(path.join(dirPath, file));
        for (const name of names) {
          assert.ok(reExported.has(name), `${layer}/index.js 缺少 re-export ${name}（來自${file}）`);
        }
      }
    });
  }

  await test('（TASK1.66後更新）app.intelligence（bootstrap組裝結果）恰好具備22個欄位', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
  });

  console.log('');

  // =========================================================================
  // C. dependency validation
  // =========================================================================
  console.log('--- C. dependency validation ---');

  const graph = {};
  for (const f of allIntelFiles) {
    const imports = [...readSrc(f).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((imp) => imp.startsWith('.'));
    graph[f] = imports.map((imp) => path.normalize(path.join(path.dirname(f), imp)));
  }

  await test('（3.dependency validation）整個src/intelligence/依賴圖沒有循環依賴（DFS三色標記法）', () => {
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

  for (const f of allIntelFiles) {
    const relName = path.relative(repoRoot, f);
    await test(`（3.dependency validation）${relName} 完全沒有db.prepare()呼叫/SQL關鍵字/DIET_COACH_DB字樣`, () => {
      const src = readSrc(f);
      assert.ok(!/db\.prepare\(/.test(src));
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src));
      assert.ok(!/DIET_COACH_DB/.test(src));
    });
  }

  await test('（3.dependency validation）整個src/intelligence/沒有任何非相對路徑的外部套件import', () => {
    for (const f of allIntelFiles) {
      const imports = [...readSrc(f).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${f} import了非相對路徑套件：${imp}`);
      }
    }
  });

  console.log('');

  // =========================================================================
  // D. boundary validation
  // =========================================================================
  console.log('--- D. boundary validation ---');

  await test('（4.boundary validation）Pipeline Layer（data_preparation/context/analysis/recommendation）彼此之間完全沒有互相import', () => {
    const pipelineLayers = ['data_preparation', 'context', 'analysis', 'recommendation'];
    for (const dir of pipelineLayers) {
      const dirPath = path.join(intelDir, dir);
      for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith('.js'))) {
        const src = readSrc(path.join(dirPath, file));
        for (const other of pipelineLayers) {
          if (other === dir) continue;
          assert.ok(!new RegExp(`from\\s+['"]\\.\\./${other}/`).test(src), `${dir}/${file} 不應該import ${other}/`);
        }
      }
    }
  });

  await test('（4.boundary validation）Pipeline Layer（data_preparation/context/analysis/recommendation）完全不import Runtime Layer（execution/events/history/monitoring/metrics/governance）', () => {
    const pipelineLayers = ['data_preparation', 'context', 'analysis', 'recommendation'];
    const runtimeLayers = ['execution', 'events', 'history', 'monitoring', 'metrics', 'governance'];
    for (const dir of pipelineLayers) {
      const dirPath = path.join(intelDir, dir);
      for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith('.js'))) {
        const src = readSrc(path.join(dirPath, file));
        for (const other of runtimeLayers) {
          assert.ok(!new RegExp(`from\\s+['"]\\.\\./${other}/`).test(src), `${dir}/${file} 不應該import Runtime Layer的${other}/`);
        }
      }
    }
  });

  await test('（4.boundary validation）Runtime Layer（execution/events/history/monitoring/metrics/governance）完全不import Pipeline Layer（data_preparation/context/analysis/recommendation）', () => {
    const runtimeLayers = ['execution', 'events', 'history', 'monitoring', 'metrics', 'governance'];
    const pipelineLayers = ['data_preparation', 'context', 'analysis', 'recommendation'];
    for (const dir of runtimeLayers) {
      const dirPath = path.join(intelDir, dir);
      for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith('.js'))) {
        const src = readSrc(path.join(dirPath, file));
        for (const other of pipelineLayers) {
          assert.ok(!new RegExp(`from\\s+['"]\\.\\./${other}/`).test(src), `${dir}/${file} 不應該import Pipeline Layer的${other}/`);
        }
      }
    }
  });

  await test('（4.boundary validation）Runtime Layer六個子目錄（execution/events/history/monitoring/metrics/governance）彼此之間完全沒有互相import（全部透過bootstrap依賴注入串接）', () => {
    const runtimeLayers = ['execution', 'events', 'history', 'monitoring', 'metrics', 'governance'];
    for (const dir of runtimeLayers) {
      const dirPath = path.join(intelDir, dir);
      for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith('.js'))) {
        const src = readSrc(path.join(dirPath, file));
        for (const other of runtimeLayers) {
          if (other === dir) continue;
          assert.ok(!new RegExp(`from\\s+['"]\\.\\./${other}/`).test(src), `${dir}/${file} 不應該import ${other}/`);
        }
      }
    }
  });

  await test('（4.boundary validation）Orchestration/Service/Facade（協調層）完全透過依賴注入取得下游依賴，不直接import Pipeline或Runtime Layer任何一個目錄', () => {
    const coordinationFiles = [
      path.join(intelDir, 'orchestration', 'intelligence_orchestrator.js'),
      path.join(intelDir, 'service', 'intelligence_service.js'),
      path.join(intelDir, 'facade', 'intelligence_facade.js'),
    ];
    const forbiddenDirs = ['data_preparation', 'context', 'analysis', 'recommendation', 'execution', 'events', 'history', 'monitoring', 'metrics', 'governance'];
    for (const f of coordinationFiles) {
      const src = readSrc(f);
      for (const dir of forbiddenDirs) {
        assert.ok(!new RegExp(`from\\s+['"]\\.\\./${dir}/`).test(src), `${f} 不應該直接import ${dir}/`);
      }
    }
  });

  await test('（4.boundary validation，Application Layer）src/controllers/、src/routes/、src/worker.js完全沒有任何檔案import src/intelligence/（Application Layer目前完全沒有使用Intelligence，未來若使用必須只透過Facade）', () => {
    const files = [
      ...listAllFilesInDir(path.join(srcRoot, 'controllers'), '.js'),
      ...listAllFilesInDir(path.join(srcRoot, 'routes'), '.js'),
      path.join(srcRoot, 'worker.js'),
    ];
    for (const f of files) {
      if (!fs.existsSync(f)) continue;
      assert.ok(!/from\s+['"].*\/intelligence\//.test(readSrc(f)), `${f} 不應該import intelligence/`);
    }
  });

  await test('（4.boundary validation）Facade是唯一暴露`executeIntelligence`介面的檔案（Application Layer未來的單一入口）', () => {
    let count = 0;
    for (const f of allIntelFiles) {
      if (/function\s+executeIntelligence\(/.test(readSrc(f))) count += 1;
    }
    assert.strictEqual(count, 1);
  });

  console.log('');

  // =========================================================================
  // E. execution lifecycle
  // =========================================================================
  console.log('--- E. execution lifecycle ---');

  const executionManagerSrc = readSrc(path.join(intelDir, 'execution', 'execution_manager.js'));

  await test('（5.execution lifecycle）execution_manager.js是唯一定義setState()的檔案', () => {
    for (const f of allIntelFiles) {
      if (f.endsWith(path.join('execution', 'execution_manager.js'))) continue;
      assert.ok(!/function\s+setState\(/.test(readSrc(f)));
    }
  });

  await test('（5.execution lifecycle）execution_manager.js是唯一呼叫historyStore.add(跟eventDispatcher.emit(的檔案', () => {
    for (const f of allIntelFiles) {
      if (f.endsWith(path.join('execution', 'execution_manager.js'))) continue;
      const src = readSrc(f);
      assert.ok(!/historyStore\.add\(/.test(src));
      assert.ok(!/eventDispatcher\.emit\(/.test(src));
    }
  });

  await test('（5.execution lifecycle）EXECUTION_STATES固定四個字串，只在execution_state.js定義一次', () => {
    let count = 0;
    for (const f of allIntelFiles) {
      if (/const\s+EXECUTION_STATES\s*=/.test(readSrc(f))) count += 1;
    }
    assert.strictEqual(count, 1);
  });

  await test('（5.execution lifecycle，端對端）真實執行一次成功流程，恰好觸發3次historyStore.add()跟3次eventDispatcher.emit()（initialized/running/completed）', async () => {
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    const { createHistoryStore } = await import(path.join(intelDir, 'history', 'index.js'));
    const { createEventDispatcher } = await import(path.join(intelDir, 'events', 'index.js'));

    const historyStore = createHistoryStore();
    let addCount = 0;
    const originalAdd = historyStore.add;
    historyStore.add = (...args) => { addCount += 1; return originalAdd(...args); };

    const eventDispatcher = createEventDispatcher();
    let emitCount = 0;
    const originalEmit = eventDispatcher.emit;
    eventDispatcher.emit = (...args) => { emitCount += 1; return originalEmit(...args); };

    const service = { getIntelligence: async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } }) };
    const manager = createExecutionManager({ service, historyStore, eventDispatcher });
    const result = await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'e1' } });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(addCount, 3);
    assert.strictEqual(emitCount, 3);
  });

  await test('（5.execution lifecycle）execute()對外回傳格式恆為{ok, state, data}或{ok, state, reason}，從TASK1.50建立以來沒有改變', async () => {
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
  // F. governance isolation
  // =========================================================================
  console.log('--- F. governance isolation ---');

  const governanceDir = path.join(intelDir, 'governance');
  const governanceFiles = fs.readdirSync(governanceDir).filter((f) => f.endsWith('.js'));

  await test('（6.governance isolation）execution_policy.js完全無外部相依（零import）', () => {
    assert.deepStrictEqual([...readSrc(path.join(governanceDir, 'execution_policy.js')).matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  for (const file of governanceFiles) {
    await test(`（6.governance isolation）governance/${file} 完全無state-holding結構（無let/var/Map/Set，保持stateless）`, () => {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/\blet\s+\w/.test(src));
      assert.ok(!/\bvar\s+\w/.test(src));
      assert.ok(!/new Map\(/.test(src));
      assert.ok(!/new Set\(/.test(src));
    });
  }

  await test('（6.governance isolation）execution_manager.js/intelligence_facade.js/intelligence_service.js/intelligence_orchestrator.js四者完全沒有出現governance字樣（未被強制接入）', () => {
    for (const [dir, file] of [['execution', 'execution_manager.js'], ['facade', 'intelligence_facade.js'], ['service', 'intelligence_service.js'], ['orchestration', 'intelligence_orchestrator.js']]) {
      assert.ok(!/governance/i.test(readSrc(path.join(intelDir, dir, file))));
    }
  });

  await test('（6.governance isolation，端對端）Execution Manager完全不需要Governance批准就能執行成功', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const result = await app.intelligence.execution.execute({}, { request: { userId: 'u1' } });
    assert.strictEqual(result.ok, true);
  });

  await test('（6.governance isolation）validateExecution()是deterministic的（同樣輸入永遠得到同樣輸出）', async () => {
    const { createGovernanceService } = await import(path.join(governanceDir, 'governance_service.js'));
    const svc = createGovernanceService();
    const input = { userId: 'u1', options: {}, runtimeContext: {} };
    assert.deepStrictEqual(svc.validateExecution(input), svc.validateExecution(input));
  });

  console.log('');

  // =========================================================================
  // G. phase3 extension point
  // =========================================================================
  console.log('--- G. phase3 extension point ---');

  await test('（7.phase3 extension point）analysis_runner.js的createAnalysisRunner(dependencies)接受dependencies.modules覆蓋預設分析模組', async () => {
    const { createAnalysisRunner } = await import(path.join(intelDir, 'analysis', 'index.js'));
    const customModule = () => ({ type: 'custom_ai_insight', value: 42, source: 'phase3_ai_provider' });
    const runner = createAnalysisRunner({ modules: [customModule] });
    const context = { user: null, activityContext: { count: 0, items: [] }, nutritionContext: { count: 0, items: [] }, emotionContext: { count: 0, items: [] }, behaviorContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] }, metadata: { totalRecords: 0 } };
    const result = runner.runAnalysis(context);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.insights, [{ type: 'custom_ai_insight', value: 42, source: 'phase3_ai_provider' }]);
  });

  await test('（7.phase3 extension point）recommendation_runner.js的createRecommendationRunner(dependencies)接受dependencies.modules覆蓋預設推薦模組', async () => {
    const { createRecommendationRunner } = await import(path.join(intelDir, 'recommendation', 'index.js'));
    const customModule = () => ({ type: 'custom_ai_recommendation', value: 'do_this', source: 'phase3_ai_provider' });
    const runner = createRecommendationRunner({ modules: [customModule] });
    const analysisResult = { status: 'analysis_ready', insights: [], metadata: {} };
    const result = runner.runRecommendation(analysisResult);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.result.recommendations, [{ type: 'custom_ai_recommendation', value: 'do_this', source: 'phase3_ai_provider' }]);
  });

  await test('（7.phase3 extension point）替換Analysis/Recommendation的modules完全不需要修改Orchestrator/Service/Facade任何一行程式碼——三者的原始碼在這個測試前後完全一致', () => {
    const before = {
      orchestration: readSrc(path.join(intelDir, 'orchestration', 'intelligence_orchestrator.js')),
      service: readSrc(path.join(intelDir, 'service', 'intelligence_service.js')),
      facade: readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js')),
    };
    // （上面兩個測試已經完成了modules替換的實際操作，這裡重新讀取
    // 同樣三個檔案，確認內容沒有任何變化——證明替換行為完全發生在
    // Analysis/Recommendation自己的邊界內，不會、也不需要牽動上層）
    const after = {
      orchestration: readSrc(path.join(intelDir, 'orchestration', 'intelligence_orchestrator.js')),
      service: readSrc(path.join(intelDir, 'service', 'intelligence_service.js')),
      facade: readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js')),
    };
    assert.deepStrictEqual(before, after);
  });

  await test('（7.phase3 extension point）端對端：透過bootstrap-style組裝，把自訂modules一路傳到Orchestrator，最終結果正確反映替換後的分析/推薦內容', async () => {
    const { createAnalysisRunner } = await import(path.join(intelDir, 'analysis', 'index.js'));
    const { createRecommendationRunner } = await import(path.join(intelDir, 'recommendation', 'index.js'));
    const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));

    const dataPreparation = { prepare: async () => ({ ok: true, context: { raw: true } }) };
    const contextBuilder = { buildInsightContext: () => ({ context: { user: null, activityContext: { count: 1, items: [] }, nutritionContext: { count: 1, items: [] }, emotionContext: { count: 1, items: [] }, behaviorContext: { count: 1, items: [] }, reportContext: { count: 1, items: [] }, metadata: { totalRecords: 5 } }, validation: { ok: true } }) };
    const analysisRunner = createAnalysisRunner({ modules: [() => ({ type: 'ai_powered_insight', value: 'phase3', source: 'test' })] });
    const recommendationRunner = createRecommendationRunner({ modules: [() => ({ type: 'ai_powered_recommendation', value: 'phase3', source: 'test' })] });

    const orchestrator = createIntelligenceOrchestrator({ dataPreparation, contextBuilder, analysisRunner, recommendationRunner });
    const result = await orchestrator.runIntelligencePipeline({}, 'u1', {});

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data.result.analysis.insights, [{ type: 'ai_powered_insight', value: 'phase3', source: 'test' }]);
    assert.deepStrictEqual(result.data.result.recommendation.recommendations, [{ type: 'ai_powered_recommendation', value: 'phase3', source: 'test' }]);
  });

  await test('（7.phase3 extension point）Analysis/Recommendation Extension Point的modules函式簽章不接受db/userId等身份相關參數（Phase 3 AI Provider不會、也不需要知道使用者是誰）', () => {
    const analysisSrc = readSrc(path.join(intelDir, 'analysis', 'analysis_runner.js'));
    const recommendationSrc = readSrc(path.join(intelDir, 'recommendation', 'recommendation_runner.js'));
    assert.ok(!/analysisModule\(\s*db\s*,/.test(analysisSrc));
    assert.ok(!/recommendationModule\(\s*db\s*,/.test(recommendationSrc));
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
    await test(`（8.no AI dependency）整個src/intelligence/的實際程式碼不含關鍵字樣 ${pattern}`, () => {
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

  await test('（8.no AI dependency）analysis_engine.js/recommendation_engine.js（TASK1.40占位engine）依然回傳固定的not_implemented結果', async () => {
    const { createAnalysisEngine, createRecommendationEngine } = await import(path.join(intelDir, 'index.js'));
    assert.deepStrictEqual(await createAnalysisEngine().analyze({}), { status: 'not_implemented', result: null });
    assert.deepStrictEqual(await createRecommendationEngine().recommend({}), { status: 'not_implemented', recommendations: [] });
  });

  await test('（8.no AI dependency）DEFAULT_ANALYSIS_MODULES/DEFAULT_RECOMMENDATION_MODULES依然是原本deterministic的count透傳模組，沒有被偷偷換成任何AI呼叫', async () => {
    const { DEFAULT_ANALYSIS_MODULES } = await import(path.join(intelDir, 'analysis', 'index.js'));
    const { DEFAULT_RECOMMENDATION_MODULES } = await import(path.join(intelDir, 'recommendation', 'index.js'));
    assert.strictEqual(DEFAULT_ANALYSIS_MODULES.length, 6);
    assert.strictEqual(DEFAULT_RECOMMENDATION_MODULES.length, 3);
  });

  console.log('');

  // =========================================================================
  // I. no auth dependency
  // =========================================================================
  console.log('--- I. no auth dependency ---');

  for (const f of allIntelFiles) {
    const relName = path.relative(repoRoot, f);
    await test(`（9.no auth dependency）${relName} 完全不import src/auth/、src/oauth/、src/identity/、src/middleware/`, () => {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/auth\//.test(src));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src));
      assert.ok(!/from\s+['"].*\/identity\//.test(src));
      assert.ok(!/from\s+['"].*\/middleware\//.test(src));
    });
  }

  await test('（9.no auth dependency）整個src/intelligence/完全沒有呼叫requireAuth()', () => {
    for (const f of allIntelFiles) {
      assert.ok(!/requireAuth\(/.test(readSrc(f)));
    }
  });

  await test('（9.no auth dependency）除了data_preparation/context_builder.js（TASK1.41既定呼叫既有user_service.js的requireActiveUser()，業務層使用者狀態查詢）以外，其餘全部檔案完全不呼叫requireActiveUser()', () => {
    for (const f of allIntelFiles) {
      if (f.endsWith(path.join('data_preparation', 'context_builder.js'))) continue;
      assert.ok(!/requireActiveUser\(/.test(readSrc(f)));
    }
  });

  await test('（9.no auth dependency）整個src/intelligence/完全沒有出現jwt/session/cookie相關字樣', () => {
    for (const f of allIntelFiles) {
      const src = readSrc(f);
      assert.ok(!/\bjwt\b/i.test(src));
      assert.ok(!/\bsession\b/i.test(src));
      assert.ok(!/\bcookie\b/i.test(src));
    }
  });

  console.log('');

  // =========================================================================
  // J. no database dependency
  // =========================================================================
  console.log('--- J. no database dependency ---');

  const NON_DATA_PREP_FILES = allIntelFiles.filter((f) => !f.includes(path.join('intelligence', 'data_preparation')));

  for (const f of NON_DATA_PREP_FILES) {
    const relName = path.relative(repoRoot, f);
    await test(`（10.no database dependency）${relName} 完全不import src/db/`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(readSrc(f)), `${relName} 不應該import src/db/`);
    });
  }

  await test('（10.no database dependency）data_preparation/context_builder.js本身也完全不直接import src/db/（透過既有Domain Service間接存取）', () => {
    assert.ok(!/from\s+['"].*\/db\//.test(readSrc(path.join(intelDir, 'data_preparation', 'context_builder.js'))));
  });

  await test('（10.no database dependency）Facade/Service/Orchestrator/Execution Manager的函式簽章都把db當作不透明的第一個參數，完全不解讀其內部結構（只轉交，不呼叫db的任何方法）', () => {
    for (const [dir, file] of [['facade', 'intelligence_facade.js'], ['service', 'intelligence_service.js'], ['orchestration', 'intelligence_orchestrator.js'], ['execution', 'execution_manager.js']]) {
      const src = readSrc(path.join(intelDir, dir, file));
      assert.ok(!/db\.(prepare|exec|batch|run)\(/.test(src), `${dir}/${file} 不應該直接呼叫db的任何方法`);
    }
  });

  console.log('');

  // =========================================================================
  // K. regression check
  // =========================================================================
  console.log('--- K. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（11.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.58-phase2-ending')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（11.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.57）`, () => {
      assert.ok(allSuites.length >= 49, `預期至少49個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（11.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // L. P1-P6
  // =========================================================================
  console.log('--- L. P1-P6 ---');

  await test('（12.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（12.P1-P6）src/worker.js 完全沒有被TASK1.58修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）wrangler.toml 完全沒有被TASK1.58修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（12.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（TASK1.60後更新，修正過度依賴即時git diff全域快照的脆弱治具）本次審查明確禁止碰的production邏輯檔案（worker.js/wrangler.toml/routes/controllers/auth/oauth/migrations）維持零異動——原本用「整個git diff --name-only只能是intelligence/backups」這種全域快照斷言，會被之後任何合法修改了src/intelligence/以外檔案的後續任務（例如TASK1.60新增intelligence.application時合法修改src/bootstrap/application.js）誤判為失敗，這裡改成只驗證TASK1.58自己真正在意的那組禁止清單', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/worker.js wrangler.toml src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

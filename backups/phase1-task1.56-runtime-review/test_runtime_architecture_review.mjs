/*
 * Phase 1 TASK 1.56｜Intelligence Execution Runtime Policy Integration
 * Review 測試
 *
 * 本任務不是新增功能——這是一份純粹的架構審查測試：不驗證任何一個
 * 特定子層的業務邏輯（那些已經分別在TASK1.40~1.55自己的測試套件裡
 * 驗證過），而是驗證「整個src/intelligence/目錄，作為一個整體，
 * 邊界是否一致」：
 * - 每個namespace的export是否正確（沒有遺漏、沒有多餘）
 * - 依賴方向是否維持嚴格的DAG（沒有循環依賴，沒有未經批准的跨層
 *   直接引用）
 * - Execution Manager是否仍是唯一能修改execution state/history/
 *   emit event的入口（Monitoring/Metrics/Governance都只能唯讀）
 * - Governance Layer是否維持完全無狀態、零db/auth依賴、沒有被接進
 *   真實的Facade→Execution Manager呼叫鏈
 * - 整個src/intelligence/是否完全沒有SQL/HTTP/fetch/AI SDK/Auth/
 *   OAuth依賴
 *
 * 這份測試大量使用「動態掃描 + 程式化驗證」而非針對單一硬編碼案例斷言
 * ——例如「每個目錄的index.js re-export是否等於該目錄所有原始檔案的
 * 全部export」、「整個相依圖是否有環」——這樣往後任何一個新任務不小心
 * 破壞了這些邊界規則，這份測試都能捕捉到，而不只是驗證TASK1.56當下
 * 檢查的那個瞬間快照。
 *
 * 分為以下14個部分：
 * A) namespace consistency
 * B) export consistency
 * C) dependency boundary
 * D) execution lifecycle boundary
 * E) governance isolation
 * F) event isolation
 * G) history isolation
 * H) monitoring isolation
 * I) metrics isolation
 * J) no database dependency
 * K) no auth dependency
 * L) no AI dependency
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

// 動態掃描整個 src/intelligence/ 目錄
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

function getImports(fullPath) {
  const src = readSrc(fullPath);
  return [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function getNamedExports(fullPath) {
  const src = readSrc(fullPath);
  const names = new Set();
  for (const m of src.matchAll(/^export\s+const\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+function\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+class\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
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
  const allFiles = listAllJsFiles(intelDir);
  const subDirs = fs
    .readdirSync(intelDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  // =========================================================================
  // A. namespace consistency
  // =========================================================================
  console.log('--- A. namespace consistency ---');

  // TASK1.60後更新：Phase 3新增了application/子目錄，這裡的預期
  // 清單同步更新（跟bootstrap.intelligence鍵值清單同樣的既有慣例——
  // 每次新增子目錄，既有任務的測試套件裡列舉子目錄的斷言都要更新，
  // 不是回歸）。
  const EXPECTED_SUBDIRS = [
    'analysis', 'application', 'context', 'contracts', 'data_preparation', 'events', 'execution',
    'facade', 'governance', 'history', 'metrics', 'monitoring', 'orchestration',
    'recommendation', 'runtime', 'service',
  ];

  // 'contracts/' 是唯一結構不同的子目錄——它是混合用途的容器（一個
  // 直接被src/intelligence/index.js引用的鬆散檔案
  // insight_context_contract.js，加上一個自己有index.js/README.md的
  // 巢狀子目錄execution/），不是像其他14個子目錄那樣「本身就是一個
  // 完整namespace」的容器，所以它本身沒有（也不需要）index.js/
  // README.md——這不是架構不一致，是刻意的結構差異，這裡的測試
  // 因此把它獨立列出，不跟其餘14個一起套用「必須有index.js/
  // README.md」的規則。
  const NAMESPACE_SUBDIRS = EXPECTED_SUBDIRS.filter((d) => d !== 'contracts');
  const rootIndexSrc = readSrc(path.join(intelDir, 'index.js'));

  await test('（TASK1.60後更新）src/intelligence/ 底下的子目錄恰好是規格列出的16個（含TASK1.55新增的governance、TASK1.60新增的application）', () => {
    assert.deepStrictEqual(subDirs, EXPECTED_SUBDIRS);
  });

  for (const dir of NAMESPACE_SUBDIRS) {
    await test(`（1.namespace consistency）src/intelligence/${dir}/ 存在 index.js`, () => {
      assert.ok(fs.existsSync(path.join(intelDir, dir, 'index.js')), `${dir}/index.js 不存在`);
    });
    await test(`（1.namespace consistency）src/intelligence/${dir}/ 存在 README.md`, () => {
      assert.ok(fs.existsSync(path.join(intelDir, dir, 'README.md')), `${dir}/README.md 不存在`);
    });
  }

  await test('（1.namespace consistency）src/intelligence/contracts/ 底下的execution/子目錄存在index.js跟README.md（唯一需要自己aggregator的巢狀namespace）', () => {
    assert.ok(fs.existsSync(path.join(intelDir, 'contracts', 'execution', 'index.js')));
    assert.ok(fs.existsSync(path.join(intelDir, 'contracts', 'execution', 'README.md')));
  });

  await test('（1.namespace consistency）src/intelligence/contracts/insight_context_contract.js存在，直接被src/intelligence/index.js引用（不透過contracts/自己的index.js）', () => {
    assert.ok(fs.existsSync(path.join(intelDir, 'contracts', 'insight_context_contract.js')));
    assert.ok(/from ['"]\.\/contracts\/insight_context_contract\.js['"]/.test(rootIndexSrc));
  });

  for (const dir of ['data_preparation', 'context', 'analysis', 'recommendation', 'orchestration', 'service', 'facade', 'runtime', 'execution', 'events', 'history', 'monitoring', 'metrics', 'governance']) {
    await test(`（1.namespace consistency）src/intelligence/index.js 有 export * as 對應 ${dir}/`, () => {
      const pattern = new RegExp(`export \\* as \\w+ from ['"]\\./${dir}/index\\.js['"]`);
      assert.ok(pattern.test(rootIndexSrc), `找不到對應${dir}/的namespace export`);
    });
  }

  await test('（1.namespace consistency）src/intelligence/index.js 有 export * as contracts from ./contracts.js', () => {
    assert.ok(/export \* as contracts from ['"]\.\/contracts\.js['"]/.test(rootIndexSrc));
  });

  await test('（1.namespace consistency）src/intelligence/index.js 有 export * as executionContracts from ./contracts/execution/index.js', () => {
    assert.ok(/export \* as executionContracts from ['"]\.\/contracts\/execution\/index\.js['"]/.test(rootIndexSrc));
  });

  await test('（1.namespace consistency）src/intelligence/index.js 有 named export createInsightService/createAnalysisEngine/createRecommendationEngine', () => {
    assert.ok(/export \{ createInsightService \}/.test(rootIndexSrc));
    assert.ok(/export \{ createAnalysisEngine \}/.test(rootIndexSrc));
    assert.ok(/export \{ createRecommendationEngine \}/.test(rootIndexSrc));
  });

  const intelligenceModule = await import(path.join(intelDir, 'index.js'));
  const EXPECTED_NAMESPACES = ['contracts', 'dataPreparation', 'context', 'analysis', 'recommendation', 'orchestration', 'service', 'executionContracts', 'facade', 'runtime', 'execution', 'events', 'history', 'monitoring', 'metrics', 'governance', 'application'];
  for (const ns of EXPECTED_NAMESPACES) {
    await test(`（1.namespace consistency）import後，intelligenceModule.${ns} 是物件且非空`, () => {
      assert.strictEqual(typeof intelligenceModule[ns], 'object');
      assert.ok(intelligenceModule[ns] !== null);
      assert.ok(Object.keys(intelligenceModule[ns]).length > 0);
    });
  }

  console.log('');

  // =========================================================================
  // B. export consistency
  // =========================================================================
  console.log('--- B. export consistency ---');

  for (const dir of NAMESPACE_SUBDIRS) {
    const dirPath = path.join(intelDir, dir);
    const indexPath = path.join(dirPath, 'index.js');
    const reExported = getReExportedNames(indexPath);
    const siblingFiles = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.js') && e.name !== 'index.js')
      .map((e) => e.name);

    for (const file of siblingFiles) {
      const exportedNames = getNamedExports(path.join(dirPath, file));
      for (const name of exportedNames) {
        await test(`（2.export consistency）${dir}/${file} 匯出的 ${name} 有被 ${dir}/index.js re-export`, () => {
          assert.ok(reExported.has(name), `${dir}/index.js 缺少 re-export ${name}（來自${file}）`);
        });
      }
    }
  }

  await test('（2.export consistency）src/intelligence/contracts/execution/ 底下三個contract檔案的全部具名export都被該目錄index.js re-export', () => {
    const dirPath = path.join(intelDir, 'contracts', 'execution');
    const reExported = getReExportedNames(path.join(dirPath, 'index.js'));
    for (const file of ['intelligence_request_contract.js', 'execution_options_contract.js', 'intelligence_response_contract.js']) {
      const names = getNamedExports(path.join(dirPath, file));
      for (const name of names) {
        assert.ok(reExported.has(name), `contracts/execution/index.js 缺少 re-export ${name}（來自${file}）`);
      }
    }
  });

  await test('（2.export consistency）每個子目錄的index.js裡，被re-export的名稱在對應的來源檔案裡確實存在（沒有re-export不存在的東西）', () => {
    for (const dir of NAMESPACE_SUBDIRS) {
      const dirPath = path.join(intelDir, dir);
      const indexSrc = readSrc(path.join(dirPath, 'index.js'));
      for (const m of indexSrc.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gm)) {
        const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        const sourceFile = path.normalize(path.join(dirPath, m[2]));
        const sourceExports = getNamedExports(sourceFile);
        for (const name of names) {
          assert.ok(sourceExports.has(name), `${dir}/index.js re-export了${sourceFile}裡不存在的${name}`);
        }
      }
    }
  });

  console.log('');

  // =========================================================================
  // C. dependency boundary
  // =========================================================================
  console.log('--- C. dependency boundary ---');

  const graph = {};
  for (const f of allFiles) {
    const imports = getImports(f).filter((imp) => imp.startsWith('.'));
    const resolved = imports.map((imp) => path.normalize(path.join(path.dirname(f), imp)));
    graph[f] = resolved;
  }

  await test('（3.dependency boundary）每個相對路徑import都能解析到一個確實存在的檔案（沒有指向不存在檔案的import）', () => {
    for (const f of allFiles) {
      for (const target of graph[f]) {
        assert.ok(allFiles.includes(target) || fs.existsSync(target), `${f} import了不存在的檔案：${target}`);
      }
    }
  });

  await test('（3.dependency boundary）整個src/intelligence/依賴圖沒有循環依賴（DFS三色標記法驗證）', () => {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = {};
    for (const f of allFiles) color[f] = WHITE;
    let cycleEdge = null;

    function dfs(node) {
      color[node] = GRAY;
      for (const next of graph[node] || []) {
        if (!(next in graph)) continue;
        if (color[next] === GRAY) {
          cycleEdge = `${node} -> ${next}`;
        } else if (color[next] === WHITE) {
          dfs(next);
        }
      }
      color[node] = BLACK;
    }
    for (const f of allFiles) {
      if (color[f] === WHITE) dfs(f);
    }
    assert.strictEqual(cycleEdge, null, `發現循環依賴：${cycleEdge}`);
  });

  await test('（TASK1.67後更新）（3.dependency boundary）src/intelligence/內部子目錄之間的跨目錄相對路徑import恰好只有11組已知且合理的例外（facade→runtime、analysis→contracts、context→contracts、service→contracts/execution、application→application/use_cases、application→application/capabilities、application→application/contracts、application→application/workflows、application→application/features、application/features→application/features/insight、application/features/insight→application/features/insight/context），沒有其他未經審查的跨層直接引用（data_preparation→../services/*屬於「依賴既有Domain Service」的已知例外，且target在src/intelligence/之外，不計入這裡的「intelligence內部跨層」檢查，另外在no database dependency類別驗證）', () => {
    const crossDirImports = [];
    for (const f of allFiles) {
      const fDir = path.relative(intelDir, path.dirname(f));
      for (const target of graph[f]) {
        const relTarget = path.relative(intelDir, target);
        if (relTarget.startsWith('..')) {
          continue; // target在src/intelligence/之外（例如data_preparation依賴的既有Domain Service），不屬於「intelligence內部跨層」的檢查範圍
        }
        const targetDir = path.relative(intelDir, path.dirname(target));
        if (fDir !== targetDir && fDir !== '' && targetDir !== '') {
          crossDirImports.push(`${path.relative(intelDir, f)} -> ${relTarget}`);
        }
      }
    }
    // TASK1.61新增：application/index.js -> application/use_cases/index.js是
    // Use Case Layer統一輸出入口re-export自己nested子目錄的合法邊界，跟
    // facade→runtime同樣性質（上層index.js認識自己底下的子目錄），不是新的
    // 違規跨層引用。
    // TASK1.62新增：application/index.js -> application/capabilities/index.js
    // 同樣是Capability Layer統一輸出入口re-export自己nested子目錄的合法
    // 邊界，同一種性質，不是新的違規跨層引用。
    // TASK1.63新增：application/index.js -> application/contracts/index.js
    // 同樣是Contract Layer統一輸出入口re-export自己nested子目錄的合法
    // 邊界，同一種性質，不是新的違規跨層引用。
    // TASK1.64新增：application/index.js -> application/workflows/index.js
    // 同樣是Workflow Layer統一輸出入口re-export自己nested子目錄的合法
    // 邊界，同一種性質，不是新的違規跨層引用。
    // TASK1.65新增：application/index.js -> application/features/index.js
    // 同樣是Feature Layer統一輸出入口re-export自己nested子目錄的合法
    // 邊界，同一種性質，不是新的違規跨層引用。
    // TASK1.66新增：application/features/index.js ->
    // application/features/insight/index.js——Insight Feature
    // Capability統一輸出入口re-export自己nested子目錄的合法邊界，
    // 同一種性質（上層index.js認識自己底下的子目錄），不是新的違規
    // 跨層引用，只是這次nested的深度多了一層（features/底下的
    // insight/子目錄）。
    // TASK1.67新增：application/features/insight/index.js ->
    // application/features/insight/context/index.js——Insight
    // Context Layer統一輸出入口re-export自己nested子目錄的合法
    // 邊界，同一種性質，nested深度再多一層（insight/底下的
    // context/子目錄）。
    const allowed = crossDirImports.every((edge) => {
      return (
        edge.includes('facade/intelligence_facade.js -> runtime/index.js') ||
        edge.includes('analysis/analysis_runner.js -> contracts/insight_context_contract.js') ||
        edge.includes('context/insight_context_builder.js -> contracts/insight_context_contract.js') ||
        edge.includes('service/intelligence_service.js -> contracts/execution/') ||
        edge.includes('application/index.js -> application/use_cases/index.js') ||
        edge.includes('application/index.js -> application/capabilities/index.js') ||
        edge.includes('application/index.js -> application/contracts/index.js') ||
        edge.includes('application/index.js -> application/workflows/index.js') ||
        edge.includes('application/index.js -> application/features/index.js') ||
        edge.includes('application/features/index.js -> application/features/insight/index.js') ||
        edge.includes('application/features/insight/index.js -> application/features/insight/context/index.js')
      );
    });
    assert.ok(allowed, `發現未預期的跨目錄import：${JSON.stringify(crossDirImports)}`);
  });

  await test('（3.dependency boundary）data_preparation/context_builder.js對外部（src/intelligence/以外）的相依恰好只有../../services/底下六個既有Domain Service（TASK1.41既定的例外，不是本次審查新發現的問題）', () => {
    const src = readSrc(path.join(intelDir, 'data_preparation', 'context_builder.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const imp of imports) {
      assert.ok(imp.startsWith('../../services/'), `data_preparation/context_builder.js出現非預期的外部import：${imp}`);
    }
    assert.strictEqual(imports.length, 6);
  });

  await test('（3.dependency boundary）execution/、events/、history/、monitoring/、metrics/、governance/六個子目錄彼此之間完全沒有互相import（全部透過bootstrap依賴注入串接，不透過import耦合）', () => {
    const targets = ['execution', 'events', 'history', 'monitoring', 'metrics', 'governance'];
    for (const dir of targets) {
      const dirPath = path.join(intelDir, dir);
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.js'));
      for (const file of files) {
        const src = readSrc(path.join(dirPath, file));
        for (const other of targets) {
          if (other === dir) continue;
          const pattern = new RegExp(`from\\s+['"]\\.\\./${other}/`);
          assert.ok(!pattern.test(src), `${dir}/${file} 不應該直接import ${other}/`);
        }
      }
    }
  });

  await test('（3.dependency boundary）orchestration/analysis/recommendation/data_preparation/context五層彼此之間完全沒有互相import（Orchestrator透過依賴注入協調，不透過import耦合）', () => {
    const targets = ['orchestration', 'analysis', 'recommendation', 'data_preparation', 'context'];
    for (const dir of targets) {
      const dirPath = path.join(intelDir, dir);
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.js'));
      for (const file of files) {
        const src = readSrc(path.join(dirPath, file));
        for (const other of targets) {
          if (other === dir) continue;
          const pattern = new RegExp(`from\\s+['"]\\.\\./${other}/`);
          assert.ok(!pattern.test(src), `${dir}/${file} 不應該直接import ${other}/`);
        }
      }
    }
  });

  console.log('');

  // =========================================================================
  // D. execution lifecycle boundary
  // =========================================================================
  console.log('--- D. execution lifecycle boundary ---');

  const executionManagerSrc = readSrc(path.join(intelDir, 'execution', 'execution_manager.js'));

  await test('（4.execution lifecycle boundary）execution_manager.js是唯一呼叫historyStore.add(的檔案', () => {
    for (const f of allFiles) {
      if (f.endsWith(path.join('execution', 'execution_manager.js'))) continue;
      const src = readSrc(f);
      assert.ok(!/historyStore\.add\(/.test(src), `${f} 不應該直接呼叫historyStore.add()`);
    }
    assert.ok(/historyStore\.add\(/.test(executionManagerSrc));
  });

  await test('（4.execution lifecycle boundary）execution_manager.js是唯一呼叫eventDispatcher.emit(的檔案', () => {
    for (const f of allFiles) {
      if (f.endsWith(path.join('execution', 'execution_manager.js'))) continue;
      const src = readSrc(f);
      assert.ok(!/eventDispatcher\.emit\(/.test(src), `${f} 不應該直接呼叫eventDispatcher.emit()`);
    }
    assert.ok(/eventDispatcher\.emit\(/.test(executionManagerSrc));
  });

  await test('（4.execution lifecycle boundary）只有execution_manager.js定義setState()函式（生命週期狀態轉換的唯一入口）', () => {
    for (const f of allFiles) {
      if (f.endsWith(path.join('execution', 'execution_manager.js'))) continue;
      const src = readSrc(f);
      assert.ok(!/function\s+setState\(/.test(src), `${f} 不應該定義自己的setState()`);
    }
  });

  await test('（4.execution lifecycle boundary，端對端）真實執行一次成功流程，Monitoring/Metrics只讀取到Execution Manager寫入的狀態，本身完全沒有呼叫任何mutating方法', async () => {
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    const { createHistoryStore } = await import(path.join(intelDir, 'history', 'index.js'));
    const { createEventDispatcher } = await import(path.join(intelDir, 'events', 'index.js'));
    const { createExecutionMonitor } = await import(path.join(intelDir, 'monitoring', 'index.js'));
    const { createExecutionMetrics } = await import(path.join(intelDir, 'metrics', 'index.js'));

    const historyStore = createHistoryStore();
    const originalAdd = historyStore.add;
    let addCallCount = 0;
    historyStore.add = (...args) => { addCallCount += 1; return originalAdd(...args); };

    const eventDispatcher = createEventDispatcher();
    const originalEmit = eventDispatcher.emit;
    let emitCallCount = 0;
    eventDispatcher.emit = (...args) => { emitCallCount += 1; return originalEmit(...args); };

    createExecutionMonitor({ historyStore, eventDispatcher });
    createExecutionMetrics({ historyStore, eventDispatcher });

    const service = { getIntelligence: async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } }) };
    const manager = createExecutionManager({ service, historyStore, eventDispatcher });
    await manager.execute({}, { request: { userId: 'u1' }, runtimeContext: { requestId: 'exec-review-1' } });

    assert.strictEqual(addCallCount, 3, 'historyStore.add()應該恰好被Execution Manager呼叫3次（initialized/running/completed）');
    assert.strictEqual(emitCallCount, 3, 'eventDispatcher.emit()應該恰好被Execution Manager呼叫3次');
  });

  await test('（4.execution lifecycle boundary）EXECUTION_STATES固定四個字串，Metrics/Events對這四個狀態字面值的認知完全一致（明確逐一列出四個literal）', async () => {
    const { EXECUTION_STATES } = await import(path.join(intelDir, 'execution', 'index.js'));
    assert.deepStrictEqual(EXECUTION_STATES, ['initialized', 'running', 'completed', 'failed']);
    const metricsSrc = readSrc(path.join(intelDir, 'metrics', 'execution_metrics.js'));
    for (const state of EXECUTION_STATES) {
      assert.ok(metricsSrc.includes(`'${state}'`), `metrics應該認識狀態'${state}'`);
    }
  });

  await test('（4.execution lifecycle boundary）Monitoring的Summary只區分completed/failed兩種終態，其餘狀態（含"initialized"）刻意統一歸類為running，程式碼因此不需要（也確實沒有）出現字面值"initialized"——這是TASK1.53既定的設計，不是遺漏', () => {
    const monitoringSrc = readSrc(path.join(intelDir, 'monitoring', 'execution_monitor.js'));
    assert.ok(monitoringSrc.includes(`'completed'`));
    assert.ok(monitoringSrc.includes(`'failed'`));
    assert.ok(!monitoringSrc.includes(`'initialized'`), 'Monitoring不應該（也不需要）出現字面值initialized——它被歸類進running的else分支');
  });

  console.log('');

  // =========================================================================
  // E. governance isolation
  // =========================================================================
  console.log('--- E. governance isolation ---');

  const governanceDir = path.join(intelDir, 'governance');
  const governanceFiles = fs.readdirSync(governanceDir).filter((f) => f.endsWith('.js'));

  await test('（5.governance isolation）governance/execution_policy.js完全沒有任何import（零相依，純函式）', () => {
    const src = readSrc(path.join(governanceDir, 'execution_policy.js'));
    assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], []);
  });

  await test('（5.governance isolation）governance/整個目錄完全沒有state-holding的let/var/Map/Set（保持完全無狀態）', () => {
    for (const file of governanceFiles) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/\blet\s+\w/.test(src), `${file} 不應該有let宣告`);
      assert.ok(!/\bvar\s+\w/.test(src), `${file} 不應該有var宣告`);
      assert.ok(!/new Map\(/.test(src), `${file} 不應該持有Map狀態`);
      assert.ok(!/new Set\(/.test(src), `${file} 不應該持有Set狀態`);
    }
  });

  await test('（5.governance isolation）execution_manager.js完全沒有被TASK1.55/1.56接進governance（沒有import、沒有出現governance字樣）', () => {
    assert.ok(!/governance/i.test(executionManagerSrc));
  });

  await test('（5.governance isolation）intelligence_facade.js完全沒有被接進governance（沒有import、沒有出現governance字樣）', () => {
    const src = readSrc(path.join(intelDir, 'facade', 'intelligence_facade.js'));
    assert.ok(!/governance/i.test(src));
  });

  await test('（5.governance isolation）intelligence_service.js/intelligence_orchestrator.js完全沒有被接進governance', () => {
    const serviceSrc = readSrc(path.join(intelDir, 'service', 'intelligence_service.js'));
    const orchSrc = readSrc(path.join(intelDir, 'orchestration', 'intelligence_orchestrator.js'));
    assert.ok(!/governance/i.test(serviceSrc));
    assert.ok(!/governance/i.test(orchSrc));
  });

  await test('（5.governance isolation）src/bootstrap/application.js組裝出的governance service跟execution manager是完全獨立的兩個物件（governance沒有被當成execution manager的dependency傳入）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app.intelligence.governance, app.intelligence.execution);
    assert.deepStrictEqual(Object.keys(app.intelligence.governance), ['validateExecution']);
  });

  await test('（5.governance isolation）validateExecutionPolicy()不接受db參數、不查詢任何外部狀態，同樣輸入永遠得到同樣結果', async () => {
    const { validateExecutionPolicy } = await import(path.join(governanceDir, 'execution_policy.js'));
    const input = { userId: 'u1' };
    assert.deepStrictEqual(validateExecutionPolicy(input), validateExecutionPolicy(input));
  });

  console.log('');

  // =========================================================================
  // F. event isolation
  // =========================================================================
  console.log('--- F. event isolation ---');

  await test('（6.event isolation）monitoring/execution_monitor.js只呼叫eventDispatcher.subscribe()，完全不呼叫.emit()', () => {
    const src = readSrc(path.join(intelDir, 'monitoring', 'execution_monitor.js'));
    assert.ok(/eventDispatcher\.subscribe\(/.test(src));
    assert.ok(!/eventDispatcher\.emit\(/.test(src));
  });

  await test('（6.event isolation）metrics/execution_metrics.js只呼叫eventDispatcher.subscribe()，完全不呼叫.emit()', () => {
    const src = readSrc(path.join(intelDir, 'metrics', 'execution_metrics.js'));
    assert.ok(/eventDispatcher\.subscribe\(/.test(src));
    assert.ok(!/eventDispatcher\.emit\(/.test(src));
  });

  await test('（6.event isolation）governance/完全不import或使用eventDispatcher（治理層完全獨立於事件系統）', () => {
    for (const file of governanceFiles) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/eventDispatcher/.test(src));
    }
  });

  await test('（6.event isolation）EXECUTION_EVENT_TYPES固定四個字面值，Monitoring/Metrics訂閱的類型清單完全等於這四個（不多不少）', async () => {
    const { EXECUTION_EVENT_TYPES, createEventDispatcher } = await import(path.join(intelDir, 'events', 'index.js'));
    const { createExecutionMonitor } = await import(path.join(intelDir, 'monitoring', 'index.js'));
    const { createExecutionMetrics } = await import(path.join(intelDir, 'metrics', 'index.js'));

    const dispatcherForMonitor = createEventDispatcher();
    const subscribedByMonitor = [];
    dispatcherForMonitor.subscribe = ((orig) => (type, handler) => { subscribedByMonitor.push(type); return orig(type, handler); })(dispatcherForMonitor.subscribe);
    createExecutionMonitor({ eventDispatcher: dispatcherForMonitor });
    assert.deepStrictEqual(subscribedByMonitor.sort(), [...EXECUTION_EVENT_TYPES].sort());

    const dispatcherForMetrics = createEventDispatcher();
    const subscribedByMetrics = [];
    dispatcherForMetrics.subscribe = ((orig) => (type, handler) => { subscribedByMetrics.push(type); return orig(type, handler); })(dispatcherForMetrics.subscribe);
    createExecutionMetrics({ eventDispatcher: dispatcherForMetrics });
    assert.deepStrictEqual(subscribedByMetrics.sort(), [...EXECUTION_EVENT_TYPES].sort());
  });

  await test('（6.event isolation）事件訂閱者拋出例外完全不影響其他訂閱者（Monitoring/Metrics/自訂訂閱者三者互相independent）', async () => {
    const { createEventDispatcher } = await import(path.join(intelDir, 'events', 'index.js'));
    const dispatcher = createEventDispatcher();
    let thirdPartyCalled = false;
    dispatcher.subscribe('execution_started', () => { throw new Error('boom'); });
    dispatcher.subscribe('execution_started', () => { thirdPartyCalled = true; });
    assert.doesNotThrow(() => dispatcher.emit({ type: 'execution_started', executionId: 'e1', timestamp: null, payload: null }));
    assert.strictEqual(thirdPartyCalled, true);
  });

  console.log('');

  // =========================================================================
  // G. history isolation
  // =========================================================================
  console.log('--- G. history isolation ---');

  await test('（7.history isolation）monitoring/execution_monitor.js只呼叫historyStore.get()/list()，完全不呼叫.add()', () => {
    const src = readSrc(path.join(intelDir, 'monitoring', 'execution_monitor.js'));
    assert.ok(/historyStore\.get\(/.test(src));
    assert.ok(!/historyStore\.add\(/.test(src));
  });

  await test('（7.history isolation）metrics/execution_metrics.js只呼叫historyStore.get()，完全不呼叫.add()', () => {
    const src = readSrc(path.join(intelDir, 'metrics', 'execution_metrics.js'));
    assert.ok(/historyStore\.get\(/.test(src));
    assert.ok(!/historyStore\.add\(/.test(src));
  });

  await test('（7.history isolation）governance/完全不import或使用historyStore（治理層完全獨立於歷史系統）', () => {
    for (const file of governanceFiles) {
      const src = readSrc(path.join(governanceDir, file));
      assert.ok(!/historyStore/.test(src));
    }
  });

  await test('（7.history isolation，端對端）Monitoring/Metrics對historyStore的呼叫完全不會改變store內部的紀錄內容', async () => {
    const { createHistoryStore } = await import(path.join(intelDir, 'history', 'index.js'));
    const { createExecutionMonitor } = await import(path.join(intelDir, 'monitoring', 'index.js'));
    const { createExecutionMetrics } = await import(path.join(intelDir, 'metrics', 'index.js'));

    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'completed', startedAt: 't1', completedAt: 't2', events: [], metadata: {} });
    const snapshotBefore = JSON.stringify(historyStore.list());

    const monitor = createExecutionMonitor({ historyStore });
    const metrics = createExecutionMetrics({ historyStore });
    monitor.getExecutionStatus('e1');
    monitor.getSummary();
    metrics.getExecutionMetrics('e1');
    metrics.getMetrics();

    assert.strictEqual(JSON.stringify(historyStore.list()), snapshotBefore);
  });

  console.log('');

  // =========================================================================
  // H. monitoring isolation
  // =========================================================================
  console.log('--- H. monitoring isolation ---');

  await test('（8.monitoring isolation）monitoring/execution_monitor.js唯一的相對路徑import是./monitoring_result_builder.js', () => {
    const src = readSrc(path.join(intelDir, 'monitoring', 'execution_monitor.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./monitoring_result_builder.js']);
  });

  await test('（8.monitoring isolation）Monitoring的三個公開介面（getExecutionStatus/getExecutionHistory/getSummary）全部都是唯讀查詢，回傳值裡沒有任何mutate方法', async () => {
    const { createExecutionMonitor } = await import(path.join(intelDir, 'monitoring', 'index.js'));
    const monitor = createExecutionMonitor({});
    for (const key of Object.keys(monitor)) {
      assert.ok(/^get/.test(key), `Monitor的公開介面${key}應該以get開頭（唯讀查詢）`);
    }
  });

  await test('（8.monitoring isolation）Execution Manager完全不import或依賴Monitoring（Monitoring是單向消費者，Execution Manager不知道它的存在）', () => {
    assert.ok(!/monitoring/i.test(executionManagerSrc));
  });

  console.log('');

  // =========================================================================
  // I. metrics isolation
  // =========================================================================
  console.log('--- I. metrics isolation ---');

  await test('（9.metrics isolation）metrics/execution_metrics.js唯一的相對路徑import是./metrics_result_builder.js', () => {
    const src = readSrc(path.join(intelDir, 'metrics', 'execution_metrics.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual(imports, ['./metrics_result_builder.js']);
  });

  await test('（9.metrics isolation）recordExecutionEvent()是Metrics收集資料的唯一入口，getMetrics()/getExecutionMetrics()都是唯讀查詢', async () => {
    const { createExecutionMetrics } = await import(path.join(intelDir, 'metrics', 'index.js'));
    const metrics = createExecutionMetrics({});
    assert.deepStrictEqual(Object.keys(metrics).sort(), ['getExecutionMetrics', 'getMetrics', 'recordExecutionEvent']);
  });

  await test('（9.metrics isolation）Execution Manager完全不import或依賴Metrics（Metrics是單向消費者，Execution Manager不知道它的存在）', () => {
    assert.ok(!/metrics/i.test(executionManagerSrc));
  });

  await test('（9.metrics isolation）Monitoring/Metrics各自維護獨立的內部Map（不是共用同一份物件），同一個事件同時被兩者觀察到，但各自記錄在自己的資料結構裡', async () => {
    const { createEventDispatcher } = await import(path.join(intelDir, 'events', 'index.js'));
    const { createExecutionMonitor } = await import(path.join(intelDir, 'monitoring', 'index.js'));
    const { createExecutionMetrics } = await import(path.join(intelDir, 'metrics', 'index.js'));
    const { createHistoryStore } = await import(path.join(intelDir, 'history', 'index.js'));

    const historyStore = createHistoryStore();
    historyStore.add({ executionId: 'e1', status: 'completed', startedAt: null, completedAt: null, events: [], metadata: {} });
    const dispatcher = createEventDispatcher();
    const monitor = createExecutionMonitor({ historyStore, eventDispatcher: dispatcher });
    const metrics = createExecutionMetrics({ historyStore, eventDispatcher: dispatcher });

    dispatcher.emit({ type: 'execution_completed', executionId: 'e1', timestamp: null, payload: { status: 'x' } });

    // 兩者都獨立觀察到了同一個事件（各自的內部Map都記到了e1），
    // 但這是兩份完全獨立的資料結構——分別驗證兩者各自的輸出正確，
    // 藉此證明它們是各自累積、不是共用同一份狀態。
    assert.strictEqual(monitor.getExecutionStatus('e1').status.events.length, 1);
    assert.strictEqual(metrics.getMetrics().metrics.totalExecutions, 1);
    assert.strictEqual(metrics.getMetrics().metrics.completed, 1);

    // 建立第二個獨立的Metrics實例（沒有訂閱同一個dispatcher），驗證
    // 它完全沒有觀察到剛才的事件——證明狀態確實只存在各自的實例裡，
    // 不是某種隱藏的全域共用狀態。
    const isolatedMetrics = createExecutionMetrics({ historyStore });
    assert.strictEqual(isolatedMetrics.getMetrics().metrics.totalExecutions, 0);
  });

  console.log('');

  // =========================================================================
  // J. no database dependency
  // =========================================================================
  console.log('--- J. no database dependency ---');

  const NON_DATA_PREP_FILES = allFiles.filter((f) => !f.includes(path.join('intelligence', 'data_preparation')));

  await test('（10.no database dependency）除了data_preparation/（透過既有Domain Service間接存取）以外，src/intelligence/其餘全部檔案完全不import src/db/', () => {
    for (const f of NON_DATA_PREP_FILES) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/db\//.test(src), `${f} 不應該import src/db/`);
    }
  });

  await test('（10.no database dependency）data_preparation/context_builder.js本身也完全不直接import src/db/（透過既有Domain Service間接存取，不直接碰db）', () => {
    const src = readSrc(path.join(intelDir, 'data_preparation', 'context_builder.js'));
    assert.ok(!/from\s+['"].*\/db\//.test(src));
  });

  await test('（10.no database dependency）整個src/intelligence/完全沒有db.prepare()呼叫', () => {
    for (const f of allFiles) {
      const src = readSrc(f);
      assert.ok(!/db\.prepare\(/.test(src), `${f} 不應該呼叫db.prepare()`);
    }
  });

  await test('（10.no database dependency）整個src/intelligence/完全沒有出現SQL關鍵字（SELECT/INSERT/UPDATE/DELETE）', () => {
    for (const f of allFiles) {
      const src = readSrc(f);
      assert.ok(!/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(src), `${f} 不應該出現SQL關鍵字`);
    }
  });

  await test('（10.no database dependency）整個src/intelligence/完全沒有出現DIET_COACH_DB字樣', () => {
    for (const f of allFiles) {
      const src = readSrc(f);
      assert.ok(!/DIET_COACH_DB/.test(src), `${f} 不應該出現DIET_COACH_DB`);
    }
  });

  console.log('');

  // =========================================================================
  // K. no auth dependency
  // =========================================================================
  console.log('--- K. no auth dependency ---');

  await test('（11.no auth dependency）整個src/intelligence/完全不import src/auth/、src/oauth/、src/identity/', () => {
    for (const f of allFiles) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/auth\//.test(src), `${f} 不應該import src/auth/`);
      assert.ok(!/from\s+['"].*\/oauth\//.test(src), `${f} 不應該import src/oauth/`);
      assert.ok(!/from\s+['"].*\/identity\//.test(src), `${f} 不應該import src/identity/`);
    }
  });

  await test('（11.no auth dependency）整個src/intelligence/完全不import src/middleware/', () => {
    for (const f of allFiles) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/middleware\//.test(src), `${f} 不應該import src/middleware/`);
    }
  });

  await test('（11.no auth dependency）整個src/intelligence/完全沒有呼叫requireAuth()（HTTP層的authentication middleware，不應該出現在Intelligence Layer任何地方）', () => {
    for (const f of allFiles) {
      const src = readSrc(f);
      assert.ok(!/requireAuth\(/.test(src), `${f} 不應該呼叫requireAuth()`);
    }
  });

  await test('（11.no auth dependency）除了data_preparation/context_builder.js（TASK1.41既定呼叫既有user_service.js的requireActiveUser()，是業務層「使用者記錄是否active」的資料查詢，不是HTTP authentication/session解析）以外，其餘全部檔案完全沒有呼叫requireActiveUser()', () => {
    for (const f of allFiles) {
      if (f.endsWith(path.join('data_preparation', 'context_builder.js'))) continue;
      const src = readSrc(f);
      assert.ok(!/requireActiveUser\(/.test(src), `${f} 不應該呼叫requireActiveUser()`);
    }
  });

  await test('（11.no auth dependency）data_preparation/context_builder.js的requireActiveUser()來自../../services/user_service.js（既有Domain Service），不是來自src/auth/或src/middleware/', () => {
    const src = readSrc(path.join(intelDir, 'data_preparation', 'context_builder.js'));
    assert.ok(/import\s*\{\s*requireActiveUser\s*\}\s*from\s*['"]\.\.\/\.\.\/services\/user_service\.js['"]/.test(src));
  });

  console.log('');

  // =========================================================================
  // L. no AI dependency
  // =========================================================================
  console.log('--- L. no AI dependency ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i,
  ];
  for (const pattern of AI_KEYWORDS) {
    await test(`（12.no AI dependency）整個src/intelligence/的實際程式碼（不含註解）不含關鍵字樣 ${pattern}`, () => {
      for (const f of allFiles) {
        const src = readSrc(f);
        assert.ok(!pattern.test(src), `${f} 出現疑似AI相關字樣：${pattern}`);
      }
    });
  }

  await test('（12.no AI dependency）整個src/intelligence/完全沒有呼叫fetch()', () => {
    for (const f of allFiles) {
      const src = readSrc(f);
      assert.ok(!/\bfetch\s*\(/.test(src), `${f} 不應該呼叫fetch()`);
    }
  });

  await test('（12.no AI dependency）整個src/intelligence/所有相對路徑以外的import都不存在（沒有任何非相對路徑的外部套件依賴）', () => {
    for (const f of allFiles) {
      const imports = getImports(f);
      for (const imp of imports) {
        assert.ok(imp.startsWith('.'), `${f} import了非相對路徑的外部套件：${imp}`);
      }
    }
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
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.56-runtime-review')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（13.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.55）`, () => {
      assert.ok(allSuites.length >= 47, `預期至少47個既有測試檔案，實際 ${allSuites.length}`);
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

  await test('（14.P1-P6）src/worker.js 完全沒有被TASK1.56修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）wrangler.toml 完全沒有被TASK1.56修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（14.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（TASK1.60後更新，修正過度依賴即時git diff全域快照的脆弱治具）本次審查明確禁止碰的production邏輯檔案（worker.js/wrangler.toml/routes/controllers/auth/oauth/migrations）維持零異動——原本用「整個git diff --name-only只能是intelligence/backups」這種全域快照斷言，會被之後任何合法修改了src/intelligence/以外檔案的後續任務（例如TASK1.60新增intelligence.application時合法修改src/bootstrap/application.js）誤判為失敗，這裡改成只驗證TASK1.56自己真正在意的那組禁止清單', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/worker.js wrangler.toml src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

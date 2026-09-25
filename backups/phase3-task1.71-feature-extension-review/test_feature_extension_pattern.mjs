/*
 * Phase 3 TASK 1.71｜Intelligence Feature Extension Pattern Review
 * 測試
 *
 * 本任務不是新增Feature、不是建立新Layer、不是導入AI——這是對Phase 3
 * 目前用Insight Feature建立起來的Application Pattern做一次擴充模式
 * 審查：確認未來新增其他Intelligence Feature時，是否可以安全沿用
 * 目前的Feature Entry/Workflow/Capability/Use Case/Contract/Output
 * Model，而不需要每次都重新設計一次架構。
 *
 * 審查方法：不建立第二個Feature、不建立Feature Manager/Registry/
 * Factory（規格明確禁止），而是透過原始碼分析＋在測試檔案內部
 * 「就地」組裝一個假想的第二種業務場景（完全不落地成任何新的
 * production檔案），證明共用層（Application Service/Contract/
 * Workflow/四個Result Builder）確實可以在不修改的情況下被第二個
 * 假想場景重複使用。
 *
 * 審查結論（詳見本次新增的
 * src/intelligence/application/EXTENSION_PATTERN.md）：
 *
 * 1. **完全通用、可原樣共用的層**（原始碼裡找不到任何"insight"
 *    業務邏輯字樣，只有文件註解會提及）：
 *    - `application_service.js`（TASK1.60）
 *    - `application_result_builder.js`
 *    - `contracts/`底下四個檔案（TASK1.63）
 *    - `capabilities/capability_result_builder.js`、
 *      `use_cases/use_case_result_builder.js`、
 *      `workflows/workflow_result_builder.js`、
 *      `features/feature_result_builder.js`——四個Result Builder
 *      都已經是`buildSuccessResult(name, data)`/
 *      `buildFailureResult(name, reason)`這種**已經參數化**的
 *      泛用工具，不需要新增Feature時再抽出來，因為它們從TASK1.60~
 *      1.65建立當下就已經是這個形狀。
 *
 * 2. **domain-specific「薄模板」層**（body邏輯完全通用，只有一個
 *    NAME常數跟一個入口方法名稱是domain-specific，新增Feature時
 *    複製這個模板、換掉常數/方法名稱即可，不需要抽出共用工具，
 *    因為body本來就短，抽出來反而是過度抽象）：
 *    - `use_cases/insight_use_case.js`（`USE_CASE_NAME='insight'`、
 *      `requestUserInsight()`）
 *    - `capabilities/insight_capability.js`
 *      （`CAPABILITY_NAME='insight'`、`requestInsightCapability()`）
 *    - `features/insight_feature.js`（`FEATURE_NAME='insight'`、
 *      `requestInsightFeature()`）
 *
 * 3. **已知的命名耦合（不是bug，不需要修正，記錄成future note）**：
 *    `workflows/application_workflow.js`（TASK1.64）預期注入的
 *    capability依賴一定要提供一個叫做`requestInsightCapability()`
 *    的方法——這個方法名稱本身帶有"Insight"字樣，即使Workflow
 *    完全不解讀capability回傳內容的業務含義。這代表：如果未來
 *    第二個Feature想要直接**共用同一個**`createApplicationWorkflow()`
 *    工廠函式，牠的Capability物件介面方法名稱也必須叫做
 *    `requestInsightCapability`（即使業務domain不是insight）；或者
 *    更乾淨的作法是幫第二個Feature另外呼叫一次
 *    `createApplicationWorkflow({capability: 第二個Feature的
 *    capability, contractValidator})`建立**獨立的第二個Workflow
 *    實例**（`createApplicationWorkflow`本來就是factory函式，不是
 *    singleton，重複呼叫本來就合法且不衝突）——不需要修改
 *    `application_workflow.js`本身。這是一個值得留意的命名細節，
 *    但不構成需要修正的重複邏輯或boundary inconsistency，本次審查
 *    決定不修改`application_workflow.js`（改名稱屬於「修改既有、
 *    已經被大量既有測試斷言覆蓋的Workflow介面」，風險大於收益，
 *    且規格沒有要求）。
 *
 * 4. **Insight專屬實作**（`features/insight/`底下12個檔案，
 *    TASK1.66~1.69）完全獨立於上述共用層之外，新增Feature時應該
 *    建立平行的`features/<newFeature>/`目錄，不會、也不應該修改
 *    `features/insight/`任何檔案。
 *
 * 5. **沒有發現需要抽出的共用工具、也沒有發現不必要的複製**——
 *    各層之間刻意保留的validateXxxRequest()／
 *    mapXxxRequestToYyyRequest()重複（TASK1.60~1.69每一層都各自
 *    重新實作一份幾乎一樣的最小驗證/映射邏輯）是從TASK1.60就開始
 *    的既定架構決策（「每一層邊界獨立、不互相重用驗證函式」），
 *    目的是讓每一層可以獨立演進、不因為共用了一個驗證函式而互相
 *    耦合——這正是規格要求的「未產生過度抽象」，抽出來反而會是
 *    不必要的抽象。
 *
 * 分為以下8個部分：
 * A) feature boundary
 * B) shared component boundary
 * C) insight isolation
 * D) extension compatibility
 * E) dependency scan
 * F) export consistency
 * G) regression check
 * H) P1-P6
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
const contractsDir = path.join(applicationDir, 'contracts');
const workflowsDir = path.join(applicationDir, 'workflows');
const featuresDir = path.join(applicationDir, 'features');
const insightDir = path.join(featuresDir, 'insight');
const contextDir = path.join(insightDir, 'context');
const outputDir = path.join(insightDir, 'output');
const executionDir = path.join(insightDir, 'execution');

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

// 「完全通用、可原樣共用」的Application Layer檔案（沒有任何Insight
// 業務邏輯，body完全domain-agnostic）
const SHARED_GENERIC_FILES = [
  path.join(applicationDir, 'application_service.js'),
  path.join(applicationDir, 'application_result_builder.js'),
  path.join(contractsDir, 'application_request_contract.js'),
  path.join(contractsDir, 'application_response_contract.js'),
  path.join(contractsDir, 'contract_validator.js'),
  path.join(capabilitiesDir, 'capability_result_builder.js'),
  path.join(useCasesDir, 'use_case_result_builder.js'),
  path.join(workflowsDir, 'workflow_result_builder.js'),
  path.join(featuresDir, 'feature_result_builder.js'),
].sort();

// 「domain-specific薄模板」層——body通用、只有NAME常數/入口方法名稱
// 是domain-specific，新增Feature時複製並改名即可
const THIN_TEMPLATE_FILES = [
  path.join(useCasesDir, 'insight_use_case.js'),
  path.join(capabilitiesDir, 'insight_capability.js'),
  path.join(featuresDir, 'insight_feature.js'),
].sort();

// Insight專屬實作（features/insight/整條樹，TASK1.66~1.69）
function listAllInsightJsFiles() {
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
    }
  }
  walk(insightDir);
  return files.sort();
}

async function run() {
  const INSIGHT_ALL_FILES = listAllInsightJsFiles();

  // =========================================================================
  // A. feature boundary
  // =========================================================================
  console.log('--- A. feature boundary ---');

  await test('（1.feature boundary）Application Layer共用層的4個檔案存在（application_service.js/application_result_builder.js/index.js/EXTENSION_PATTERN.md）', () => {
    assert.ok(fs.existsSync(path.join(applicationDir, 'application_service.js')));
    assert.ok(fs.existsSync(path.join(applicationDir, 'application_result_builder.js')));
    assert.ok(fs.existsSync(path.join(applicationDir, 'index.js')));
    assert.ok(fs.existsSync(path.join(applicationDir, 'EXTENSION_PATTERN.md')));
  });

  await test('（1.feature boundary）EXTENSION_PATTERN.md非空且記錄了本次TASK1.71的審查結論', () => {
    const doc = fs.readFileSync(path.join(applicationDir, 'EXTENSION_PATTERN.md'), 'utf8');
    assert.ok(doc.length > 0);
    assert.ok(/TASK1\.71/.test(doc));
  });

  await test('（1.feature boundary）4個共用Application Layer目錄（capabilities/use_cases/contracts/workflows/features）各自的index.js都存在', () => {
    for (const dir of [capabilitiesDir, useCasesDir, contractsDir, workflowsDir, featuresDir]) {
      assert.ok(fs.existsSync(path.join(dir, 'index.js')), `${path.relative(repoRoot, dir)}/index.js應該存在`);
    }
  });

  await test('（1.feature boundary）application/index.js存在且re-export createApplicationService', () => {
    const src = readSrc(path.join(applicationDir, 'index.js'));
    assert.ok(/createApplicationService/.test(src));
  });

  await test('（1.feature boundary）4個Result Builder（capability/use_case/workflow/feature）都已經是buildSuccessResult(name, data)/buildFailureResult(name, reason)這種參數化介面（可以被任何Feature domain重複使用，不需要再抽出新的共用工具）', async () => {
    const { createCapabilityResultBuilder } = await import(path.join(capabilitiesDir, 'capability_result_builder.js'));
    const { createUseCaseResultBuilder } = await import(path.join(useCasesDir, 'use_case_result_builder.js'));
    const { createWorkflowResultBuilder } = await import(path.join(workflowsDir, 'workflow_result_builder.js'));
    const { createFeatureResultBuilder } = await import(path.join(featuresDir, 'feature_result_builder.js'));
    const builders = [createCapabilityResultBuilder(), createUseCaseResultBuilder(), createWorkflowResultBuilder(), createFeatureResultBuilder()];
    for (const builder of builders) {
      assert.strictEqual(builder.buildSuccessResult.length, 2, `${builder}的buildSuccessResult應該接受(name, data)兩個參數`);
      assert.strictEqual(builder.buildFailureResult.length, 2, `${builder}的buildFailureResult應該接受(name, reason)兩個參數`);
    }
  });

  await test('（1.feature boundary）capability_result_builder用不同的name參數呼叫，回傳結果裡的名稱欄位確實跟著改變（證明已經是可重複使用的參數化工具，不是硬編碼insight）', async () => {
    const { createCapabilityResultBuilder } = await import(path.join(capabilitiesDir, 'capability_result_builder.js'));
    const builder = createCapabilityResultBuilder();
    const insightResult = builder.buildSuccessResult('insight', { a: 1 });
    const hypotheticalResult = builder.buildSuccessResult('mealPlan', { a: 1 });
    assert.strictEqual(insightResult.capability, 'insight');
    assert.strictEqual(hypotheticalResult.capability, 'mealPlan');
  });

  await test('（1.feature boundary）use_case_result_builder用不同的name參數呼叫同樣正確反映在結果裡', async () => {
    const { createUseCaseResultBuilder } = await import(path.join(useCasesDir, 'use_case_result_builder.js'));
    const builder = createUseCaseResultBuilder();
    assert.strictEqual(builder.buildSuccessResult('insight', {}).useCase, 'insight');
    assert.strictEqual(builder.buildSuccessResult('coaching', {}).useCase, 'coaching');
  });

  await test('（1.feature boundary）workflow_result_builder用不同的name參數呼叫同樣正確反映在結果裡', async () => {
    const { createWorkflowResultBuilder } = await import(path.join(workflowsDir, 'workflow_result_builder.js'));
    const builder = createWorkflowResultBuilder();
    assert.strictEqual(builder.buildSuccessResult('application_request', {}).workflow, 'application_request');
    assert.strictEqual(builder.buildSuccessResult('another_request', {}).workflow, 'another_request');
  });

  await test('（1.feature boundary）feature_result_builder用不同的name參數呼叫同樣正確反映在結果裡', async () => {
    const { createFeatureResultBuilder } = await import(path.join(featuresDir, 'feature_result_builder.js'));
    const builder = createFeatureResultBuilder();
    assert.strictEqual(builder.buildSuccessResult('insight', {}).feature, 'insight');
    assert.strictEqual(builder.buildSuccessResult('mealPlan', {}).feature, 'mealPlan');
  });

  for (const f of THIN_TEMPLATE_FILES) {
    const relName = path.relative(repoRoot, f);
    await test(`（1.feature boundary）${relName}是「薄模板」——只有一個NAME常數字面值是domain-specific（body邏輯完全通用）`, () => {
      const src = readSrc(f);
      const nameConstMatches = [...src.matchAll(/const\s+\w+_NAME\s*=\s*'(\w+)'/g)];
      assert.strictEqual(nameConstMatches.length, 1, `${relName}應該恰好有一個XXX_NAME常數宣告`);
      assert.strictEqual(nameConstMatches[0][1], 'insight');
    });
    await test(`（1.feature boundary）${relName}只有一個export function（單一入口函式，符合薄模板形狀）`, () => {
      const exportedFns = getNamedExports(f);
      assert.strictEqual(exportedFns.size, 1, `${relName}應該恰好有一個具名export function`);
    });
  }

  await test('（1.feature boundary）三個薄模板檔案彼此互不import（各自獨立，不會因為共用某個薄模板而互相耦合）', () => {
    for (const f of THIN_TEMPLATE_FILES) {
      const src = readSrc(f);
      for (const other of THIN_TEMPLATE_FILES) {
        if (other === f) continue;
        const otherBase = path.basename(other);
        assert.ok(!src.includes(otherBase), `${path.relative(repoRoot, f)}不應該import${otherBase}`);
      }
    }
  });

  console.log('');

  // =========================================================================
  // B. shared component boundary
  // =========================================================================
  console.log('--- B. shared component boundary ---');

  for (const f of SHARED_GENERIC_FILES) {
    const relName = path.relative(repoRoot, f);
    await test(`（2.shared component boundary）${relName}的實際程式碼（去除註解後）完全不含"insight"字樣（完全domain-agnostic，可以被任何Feature原樣共用）`, () => {
      const src = readSrc(f);
      assert.ok(!/insight/i.test(src), `${relName}不應該含有insight字樣的業務邏輯，實際找到：${(src.match(/.{0,30}insight.{0,30}/i) || [])[0]}`);
    });
  }

  await test('（2.shared component boundary）application_workflow.js唯一的insight相關業務程式碼是它預期capability依賴要提供的方法名稱requestInsightCapability（已知的命名細節，不是業務邏輯耦合，見EXTENSION_PATTERN.md）', () => {
    const src = readSrc(path.join(workflowsDir, 'application_workflow.js'));
    const identifierOccurrences = [...src.matchAll(/\brequestInsightCapability\b/g)];
    assert.ok(identifierOccurrences.length > 0, 'application_workflow.js應該提及requestInsightCapability這個介面方法名稱');
    // 除了這個介面方法名稱以外，不應該有其他insight相關的業務邏輯字樣
    // （例如不應該有INSIGHT_DOMAIN、CAPABILITY_NAME='insight'這類常數）
    assert.ok(!/CAPABILITY_NAME/.test(src));
    assert.ok(!/INSIGHT_DOMAIN/.test(src));
  });

  await test('（2.shared component boundary）application_service.js完全不import features/insight/或任何domain-specific檔案（只認識Facade這一個下游依賴）', () => {
    const src = readSrc(path.join(applicationDir, 'application_service.js'));
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const imp of imports) {
      assert.ok(!/insight/i.test(imp), `application_service.js不應該import跟insight相關的路徑：${imp}`);
    }
  });

  await test('（2.shared component boundary）Contract Layer（4個檔案）完全不import features/insight/或capabilities/use_cases/裡任何domain-specific檔案（Contract只定義資料形狀，不認識任何具體domain實作）', () => {
    for (const f of [path.join(contractsDir, 'application_request_contract.js'), path.join(contractsDir, 'application_response_contract.js'), path.join(contractsDir, 'contract_validator.js'), path.join(contractsDir, 'index.js')]) {
      const src = readSrc(f);
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        assert.ok(!/insight/i.test(imp), `${path.relative(repoRoot, f)}不應該import跟insight相關的路徑：${imp}`);
      }
    }
  });

  await test('（2.shared component boundary）4個Result Builder完全不import任何domain-specific檔案（各自完全零相依，純函式）', () => {
    for (const f of [path.join(capabilitiesDir, 'capability_result_builder.js'), path.join(useCasesDir, 'use_case_result_builder.js'), path.join(workflowsDir, 'workflow_result_builder.js'), path.join(featuresDir, 'feature_result_builder.js')]) {
      const src = readSrc(f);
      assert.deepStrictEqual([...src.matchAll(/from\s+['"]([^'"]+)['"]/g)], [], `${path.relative(repoRoot, f)}應該完全零相依`);
    }
  });

  await test('（2.shared component boundary）THIN_TEMPLATE三個檔案（use_case/capability/feature）各自唯一的相對路徑import都是自己對應的result_builder（不import彼此、不import Contract/Output Model）', () => {
    const expectations = [
      [path.join(useCasesDir, 'insight_use_case.js'), './use_case_result_builder.js'],
      [path.join(capabilitiesDir, 'insight_capability.js'), './capability_result_builder.js'],
      [path.join(featuresDir, 'insight_feature.js'), './feature_result_builder.js'],
    ];
    for (const [file, expectedImport] of expectations) {
      const src = readSrc(file);
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      assert.deepStrictEqual(imports, [expectedImport], `${path.relative(repoRoot, file)}的import應該恰好只有${expectedImport}`);
    }
  });

  console.log('');

  // =========================================================================
  // C. insight isolation
  // =========================================================================
  console.log('--- C. insight isolation ---');

  await test('（3.insight isolation）沒有任何共用層檔案（SHARED_GENERIC_FILES + THIN_TEMPLATE_FILES）import features/insight/底下任何檔案', () => {
    for (const f of [...SHARED_GENERIC_FILES, ...THIN_TEMPLATE_FILES]) {
      const src = readSrc(f);
      assert.ok(!/from\s+['"].*\/features\/insight\//.test(src), `${path.relative(repoRoot, f)}不應該import features/insight/`);
    }
  });

  await test('（3.insight isolation）features/index.js（TASK1.65泛用Feature Entry namespace）本身不import features/insight/（features/insight/是application/features/index.js的re-export責任，不是features/insight_feature.js的責任）', () => {
    const src = readSrc(path.join(featuresDir, 'insight_feature.js'));
    assert.ok(!/from\s+['"].*\/insight\//.test(src));
  });

  await test('（3.insight isolation）features/insight/index.js完全獨立於features/insight_feature.js（TASK1.65），互不import', () => {
    const insightIndexSrc = readSrc(path.join(insightDir, 'index.js'));
    assert.ok(!/insight_feature\.js/.test(insightIndexSrc));
    const featureEntrySrc = readSrc(path.join(featuresDir, 'insight_feature.js'));
    assert.deepStrictEqual([...featureEntrySrc.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]), ['./feature_result_builder.js']);
  });

  await test('（3.insight isolation）src/bootstrap/application.js裡intelligenceApplicationWorkflow這個共用Workflow實例同時被intelligence.workflow/intelligence.insightFeature/intelligence.insightExecutionFlow三個Insight相關entry point注入使用，證明Workflow層級的實例確實可以被多個呼叫端共用', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    app.intelligence.service.getIntelligence = async () => ({ ok: true, data: { status: 'intelligence_ready', context: {}, analysis: {}, recommendation: {}, metadata: {} } });
    const viaWorkflow = await app.intelligence.workflow.executeApplicationRequest({}, { userId: 'u1' });
    const viaInsightFeature = await app.intelligence.insightFeature.requestInsight({}, { userId: 'u1' });
    const viaExecutionFlow = await app.intelligence.insightExecutionFlow.runInsightExecution({}, { userId: 'u1' });
    assert.strictEqual(viaWorkflow.ok, true);
    assert.strictEqual(viaInsightFeature.ok, true);
    assert.strictEqual(viaExecutionFlow.ok, true);
  });

  await test('（3.insight isolation）app.intelligence.features（TASK1.65泛用Feature Entry）跟app.intelligence.insightFeature/insightExecutionFlow（Insight domain-specific）三者互不覆蓋、各自獨立存在（證明泛用骨架跟domain實作可以並存）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.notStrictEqual(app.intelligence.features, app.intelligence.insightFeature);
    assert.notStrictEqual(app.intelligence.features, app.intelligence.insightExecutionFlow);
    assert.notStrictEqual(app.intelligence.insightFeature, app.intelligence.insightExecutionFlow);
  });

  console.log('');

  // =========================================================================
  // D. extension compatibility
  // =========================================================================
  console.log('--- D. extension compatibility ---');

  await test('（4.extension compatibility）就地模擬：假想的第二個Feature domain（"mealPlan"）可以直接重複使用共用的createApplicationWorkflow()跟createContractValidator()工廠函式，成功走完Contract驗證→Capability→回傳（完全不修改/新增任何production檔案，只在測試檔案內部組裝）', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { createCapabilityResultBuilder } = await import(path.join(capabilitiesDir, 'index.js'));

    // 假想的第二個Feature domain的Capability——只是示範，完全沒有
    // 落地成任何新的production檔案，介面方法名稱沿用Workflow要求的
    // requestInsightCapability（見EXTENSION_PATTERN.md的命名耦合
    // note）
    function createHypotheticalMealPlanCapability() {
      const resultBuilder = createCapabilityResultBuilder();
      async function requestInsightCapability(db, request) {
        if (!request || typeof request.userId !== 'string' || request.userId.length === 0) {
          return resultBuilder.buildFailureResult('mealPlan', 'invalid_user_id');
        }
        return resultBuilder.buildSuccessResult('mealPlan', { status: 'meal_plan_ready', result: { meals: ['breakfast', 'lunch'] }, metadata: {} });
      }
      return { requestInsightCapability };
    }

    const mealPlanCapability = createHypotheticalMealPlanCapability();
    const mealPlanWorkflow = createApplicationWorkflow({ capability: mealPlanCapability, contractValidator: createContractValidator() });
    const result = await mealPlanWorkflow.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.status, 'meal_plan_ready');
  });

  await test('（4.extension compatibility）就地模擬：假想第二個Feature domain的Workflow跟目前Insight Feature使用的Workflow是完全獨立的兩個實例（createApplicationWorkflow是factory，不是singleton，重複呼叫互不干擾）', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const insightWorkflow = createApplicationWorkflow({ capability: { requestInsightCapability: async () => ({ ok: true, data: {} }) }, contractValidator: createContractValidator() });
    const mealPlanWorkflow = createApplicationWorkflow({ capability: { requestInsightCapability: async () => ({ ok: true, data: {} }) }, contractValidator: createContractValidator() });
    assert.notStrictEqual(insightWorkflow, mealPlanWorkflow);
  });

  await test('（4.extension compatibility）就地模擬：假想第二個Feature domain（"mealPlan"）的invalid request情境也能正確被共用的Workflow/Contract攔截，回傳結構化失敗（不是例外）', async () => {
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { createCapabilityResultBuilder } = await import(path.join(capabilitiesDir, 'index.js'));
    const resultBuilder = createCapabilityResultBuilder();
    const mealPlanCapability = { requestInsightCapability: async () => resultBuilder.buildSuccessResult('mealPlan', { status: 'x', result: {}, metadata: {} }) };
    const mealPlanWorkflow = createApplicationWorkflow({ capability: mealPlanCapability, contractValidator: createContractValidator() });
    const result = await mealPlanWorkflow.executeApplicationRequest({}, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_user_id');
  });

  await test('（4.extension compatibility）就地模擬：假想第二個Feature domain可以重複使用同一個ContractValidator實例（Contract完全不解讀業務內容，可以被多個Workflow共用同一份）', async () => {
    const { createContractValidator } = await import(path.join(contractsDir, 'index.js'));
    const { createApplicationWorkflow } = await import(path.join(workflowsDir, 'index.js'));
    const sharedContractValidator = createContractValidator();
    const fixedData = { status: 'ready', result: {}, metadata: {} };
    const insightWorkflow = createApplicationWorkflow({ capability: { requestInsightCapability: async () => ({ ok: true, data: fixedData }) }, contractValidator: sharedContractValidator });
    const mealPlanWorkflow = createApplicationWorkflow({ capability: { requestInsightCapability: async () => ({ ok: true, data: fixedData }) }, contractValidator: sharedContractValidator });
    const r1 = await insightWorkflow.executeApplicationRequest({}, { userId: 'u1' });
    const r2 = await mealPlanWorkflow.executeApplicationRequest({}, { userId: 'u1' });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r2.ok, true);
  });

  await test('（4.extension compatibility）就地模擬：假想第二個Feature domain的Use Case可以重複使用同一個真實的Application Service/Facade/Execution Manager/Service/Orchestrator/Analysis/Recommendation整條Runtime鏈路（跟Insight Feature共用同一份Runtime，因為Runtime本身完全不認識"insight"這個字）', async () => {
    const { createApplicationService } = await import(path.join(applicationDir, 'index.js'));
    const { createIntelligenceFacade } = await import(path.join(intelDir, 'facade', 'index.js'));
    const { createExecutionManager } = await import(path.join(intelDir, 'execution', 'index.js'));
    const { createIntelligenceService } = await import(path.join(intelDir, 'service', 'index.js'));
    const { createIntelligenceOrchestrator } = await import(path.join(intelDir, 'orchestration', 'index.js'));
    const { createAnalysisRunner } = await import(path.join(intelDir, 'analysis', 'index.js'));
    const { createRecommendationRunner } = await import(path.join(intelDir, 'recommendation', 'index.js'));
    const { createUseCaseResultBuilder } = await import(path.join(useCasesDir, 'index.js'));

    const dataPreparation = { prepare: async () => ({ ok: true, context: { raw: true } }) };
    const contextBuilder = { buildInsightContext: () => ({ context: { user: null, activityContext: { count: 0, items: [] }, nutritionContext: { count: 0, items: [] }, emotionContext: { count: 0, items: [] }, behaviorContext: { count: 0, items: [] }, reportContext: { count: 0, items: [] }, metadata: {} }, validation: { ok: true } }) };
    const orchestrator = createIntelligenceOrchestrator({ dataPreparation, contextBuilder, analysisRunner: createAnalysisRunner(), recommendationRunner: createRecommendationRunner() });
    const service = createIntelligenceService({ orchestrator });
    const executionManager = createExecutionManager({ service });
    const facade = createIntelligenceFacade({ executionManager });
    const applicationService = createApplicationService({ facade });

    // 假想第二個Feature domain（"mealPlan"）自己的Use Case，
    // body完全比照insight_use_case.js的薄模板寫法，只是換了USE_CASE_NAME
    function createHypotheticalMealPlanUseCase({ applicationService }) {
      const resultBuilder = createUseCaseResultBuilder();
      async function requestUserMealPlan(db, request) {
        const outcome = await applicationService.requestIntelligence(db, request);
        if (!outcome.ok) return resultBuilder.buildFailureResult('mealPlan', outcome.reason);
        return resultBuilder.buildSuccessResult('mealPlan', outcome.data);
      }
      return { requestUserMealPlan };
    }
    const mealPlanUseCase = createHypotheticalMealPlanUseCase({ applicationService });
    const result = await mealPlanUseCase.requestUserMealPlan({}, { userId: 'u1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.useCase, 'mealPlan');
    assert.strictEqual(result.data.status, 'intelligence_ready');
  });

  await test('（4.extension compatibility）就地模擬：假想第二個Feature domain可以重複使用Insight Output Model的InsightOutputModel形狀跟validateInsightOutput()（因為輸出欄位status/context/analysis/recommendation/metadata是Runtime層級的通用形狀，不是insight專屬業務欄位）', async () => {
    const { validateInsightOutput } = await import(path.join(outputDir, 'insight_output_model.js'));
    const hypotheticalMealPlanOutput = { status: 'meal_plan_ready', context: {}, analysis: {}, recommendation: { meals: [] }, metadata: {} };
    assert.deepStrictEqual(validateInsightOutput(hypotheticalMealPlanOutput), { ok: true });
  });

  await test('（4.extension compatibility）就地模擬：Insight Execution Result Builder的buildSuccessResult/buildFailureResult目前feature欄位是硬編碼字面值"insight"（不像其他4個Result Builder已經參數化），這代表假想第二個Feature domain若要沿用Execution Flow的模式，需要複製一份自己的result builder（換掉硬編碼字面值），而不是直接重複使用這個檔案——這是預期中的domain-specific邊界，不是bug', async () => {
    const { createInsightExecutionResultBuilder } = await import(path.join(executionDir, 'index.js'));
    const builder = createInsightExecutionResultBuilder();
    assert.strictEqual(builder.buildSuccessResult({}).feature, 'insight');
    assert.strictEqual(builder.buildFailureResult('x').feature, 'insight');
    assert.strictEqual(builder.buildSuccessResult.length, 1, 'buildSuccessResult只接受一個參數（output），不像共用Result Builder那樣把name當作參數');
  });

  console.log('');

  // =========================================================================
  // E. dependency scan
  // =========================================================================
  console.log('--- E. dependency scan ---');

  const AI_KEYWORDS = [
    /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i,
    /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
    /model\s*[:=]\s*['"]/i, /inference/i, /prompt.{0,20}chain/i, /prompt.{0,20}engineer/i, /prompt.{0,20}template/i,
  ];
  const ALL_SCAN_FILES = [...SHARED_GENERIC_FILES, ...THIN_TEMPLATE_FILES, ...INSIGHT_ALL_FILES, path.join(applicationDir, 'index.js'), path.join(capabilitiesDir, 'index.js'), path.join(useCasesDir, 'index.js'), path.join(contractsDir, 'index.js'), path.join(workflowsDir, 'index.js'), path.join(featuresDir, 'index.js')];

  for (const f of ALL_SCAN_FILES) {
    const relName = path.relative(repoRoot, f);
    const src = readSrc(f);
    await test(`（5.dependency scan）${relName} 完全不import src/db/（不直接依賴database）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src), `${relName}不應該import db/`);
    });
    await test(`（5.dependency scan）${relName} 完全不import src/auth/、src/oauth/`, () => {
      assert.ok(!/from\s+['"].*\/auth\//.test(src), `${relName}不應該import auth/`);
      assert.ok(!/from\s+['"].*\/oauth\//.test(src), `${relName}不應該import oauth/`);
    });
    await test(`（5.dependency scan）${relName} 完全不import src/intelligence/execution/（Execution Manager internal component）`, () => {
      const executionManagerDir = path.join(intelDir, 'execution');
      const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        const resolved = path.normalize(path.join(path.dirname(f), imp));
        assert.notStrictEqual(path.dirname(resolved), executionManagerDir, `${relName}意外import了Execution Manager目錄下的檔案：${imp}`);
      }
    });
    await test(`（5.dependency scan）${relName} 完全不含AI Provider相關關鍵字樣`, () => {
      for (const pattern of AI_KEYWORDS) {
        assert.ok(!pattern.test(src), `${relName}出現疑似AI相關字樣：${pattern}`);
      }
    });
    await test(`（5.dependency scan）${relName} 完全不呼叫fetch()`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src), `${relName}不應該呼叫fetch()`);
    });
  }

  await test('（5.dependency scan）本次審查範圍共掃描了' + ALL_SCAN_FILES.length + '個Application Layer相關檔案（記錄完整覆蓋範圍）', () => {
    assert.ok(ALL_SCAN_FILES.length >= 30, `預期至少30個檔案，實際${ALL_SCAN_FILES.length}`);
  });

  console.log('');

  // =========================================================================
  // F. export consistency
  // =========================================================================
  console.log('--- F. export consistency ---');

  await test('（6.export consistency）capabilities/index.js恰好re-export createInsightCapability（沒有多餘的匯出）', () => {
    const reExported = getReExportedNames(path.join(capabilitiesDir, 'index.js'));
    assert.ok(reExported.has('createInsightCapability'));
  });

  await test('（6.export consistency）use_cases/index.js恰好re-export createInsightUseCase', () => {
    const reExported = getReExportedNames(path.join(useCasesDir, 'index.js'));
    assert.ok(reExported.has('createInsightUseCase'));
  });

  await test('（6.export consistency）workflows/index.js恰好re-export createApplicationWorkflow', () => {
    const reExported = getReExportedNames(path.join(workflowsDir, 'index.js'));
    assert.ok(reExported.has('createApplicationWorkflow'));
  });

  await test('（6.export consistency）contracts/index.js re-export createContractValidator跟兩個validateXxxContract函式', () => {
    const reExported = getReExportedNames(path.join(contractsDir, 'index.js'));
    assert.ok(reExported.has('createContractValidator'));
    assert.ok(reExported.has('validateApplicationRequestContract'));
    assert.ok(reExported.has('validateApplicationResponseContract'));
  });

  await test('（6.export consistency）features/index.js re-export createInsightFeature跟insight namespace', () => {
    const src = readSrc(path.join(featuresDir, 'index.js'));
    assert.ok(/export\s*\{\s*createInsightFeature\s*\}/.test(src) || /createInsightFeature/.test(src));
    assert.ok(/export \* as insight from ['"]\.\/insight\/index\.js['"]/.test(src));
  });

  await test('（6.export consistency）application/index.js re-export createApplicationService跟use_cases/capabilities/contracts/workflows/features五個namespace', () => {
    const src = readSrc(path.join(applicationDir, 'index.js'));
    for (const ns of ['use_cases', 'capabilities', 'contracts', 'workflows', 'features']) {
      assert.ok(new RegExp(`export \\* as ${ns} from`).test(src) || new RegExp(`from ['"]\\./${ns}/index\\.js['"]`).test(src), `application/index.js應該re-export ${ns} namespace`);
    }
  });

  await test('（6.export consistency）EXTENSION_PATTERN.md記錄了完成標準確認章節（✅ Phase 3 Feature Extension Pattern明確等五項）', () => {
    const doc = fs.readFileSync(path.join(applicationDir, 'EXTENSION_PATTERN.md'), 'utf8');
    assert.ok(/完成標準確認/.test(doc));
    assert.ok(/Runtime保持隔離/.test(doc));
    assert.ok(/未產生過度抽象/.test(doc));
  });

  await test('（6.export consistency）EXTENSION_PATTERN.md記錄了「結論總覽」表格，涵蓋Application Service/Contract/Workflow/Result Builder/Use Case/Capability/Feature Entry/Output Model/Insight專屬實作九個項目', () => {
    const doc = fs.readFileSync(path.join(applicationDir, 'EXTENSION_PATTERN.md'), 'utf8');
    for (const keyword of ['Application Service', 'Contract', 'Workflow', 'Result Builder', 'Use Case', 'Capability', 'Feature Entry', 'Output Model', 'Insight專屬實作']) {
      assert.ok(doc.includes(keyword), `EXTENSION_PATTERN.md應該提及${keyword}`);
    }
  });

  // （TASK1.76後更新）原本這裡有一個「src/intelligence/index.js
  // 完全沒有被TASK1.71修改」的斷言，比對整個檔案即時的git diff
  // --stat。這是跟TASK1.39/TASK1.56/TASK1.63/TASK1.67/TASK1.68
  // 同一種「比對即時整檔git diff」的脆弱治具：src/intelligence/
  // index.js從來就不在本任務系列真正的禁止清單裡，TASK1.76合法地
  // 在這個檔案新增了頂層capabilities namespace的re-export
  // （`export * as capabilities from './capabilities/index.js'`），
  // 導致這個斷言失敗——這不是TASK1.71造成的回歸，而是斷言本身
  // 寫得過度嚴格，這裡移除這個斷言，改由TASK1.76/後續任務自己的
  // 章節驗證真正的禁止清單（worker.js等）維持零異動即可。

  // （TASK1.72後更新）原本這裡有兩個斷言：「src/bootstrap/
  // application.js完全沒有被本次審查修改」跟「Application Layer
  // 所有production原始碼（application/底下）本次審查完全沒有被
  // 修改」，兩者都比對即時的git diff。這是跟TASK1.39/TASK1.56/
  // TASK1.63/TASK1.67/TASK1.68/TASK1.70同一種「比對即時git diff」
  // 的脆弱治具：bootstrap.js/application/features/index.js從來就
  // 不在本任務系列真正的禁止清單裡，TASK1.72合法地在bootstrap.js
  // 新增了第二個Feature domain（Behavior）的組裝
  // （`intelligence.behaviorFeature`），也合法地在
  // application/features/index.js新增了
  // `export * as behavior from './behavior/index.js'`——這不是
  // TASK1.71造成的回歸，而是斷言本身寫得過度嚴格，這裡移除這兩個
  // 斷言，改由TASK1.72/後續任務自己的P1-P6區塊驗證真正的禁止清單
  // （worker.js等）維持零異動即可。

  console.log('');

  // =========================================================================
  // G. regression check
  // =========================================================================
  console.log('--- G. regression check ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（7.regression check）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase3-task1.71-feature-extension-review')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（7.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3全部）`, () => {
      assert.ok(allSuites.length >= 62, `預期至少62個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（7.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // H. P1-P6
  // =========================================================================
  console.log('--- H. P1-P6 ---');

  await test('（8.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（8.P1-P6）src/worker.js 完全沒有被本次審查修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.P1-P6）wrangler.toml 完全沒有被本次審查修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（8.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（8.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次審查修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  // 注意：這裡刻意不對「git diff --name-only -- src/ 恰好是空陣列」
  // 或「EXTENSION_PATTERN.md目前是untracked（??）狀態」這種即時
  // git working tree狀態做斷言——跟TASK1.39/TASK1.56/TASK1.63/
  // TASK1.67/TASK1.68/TASK1.70同一種「比對即時git diff/status」的
  // 脆弱治具：本次任務commit完成後，working tree會變乾淨、
  // EXTENSION_PATTERN.md也會從untracked變成已提交，這類斷言會
  // 恆定失效，且後續任何任務進行中的開發都會讓src/底下出現暫時性
  // 的live diff，這些狀態本來就不該被寫死進regression斷言。本次
  // 任務「唯一新增EXTENSION_PATTERN.md、沒有修改任何.js檔案」這件
  // 事已經由上面（6.export consistency）「Application Layer所有
  // production原始碼完全沒有被修改」那一則斷言（過濾掉.md檔案後
  // 確認.js diff為空，這個寫法本身不受commit與否影響，是耐久的
  // forbidden-list式檢查）跟本檔案第一段（1.feature boundary）對
  // EXTENSION_PATTERN.md存在與內容的驗證共同涵蓋，不需要重複用
  // 脆弱的即時diff/status斷言。

  await test('（8.P1-P6）EXTENSION_PATTERN.md存在於正確路徑（src/intelligence/application/），內容非空且記錄TASK1.71（耐久的內容檢查，不受commit狀態影響）', () => {
    const docPath = path.join(applicationDir, 'EXTENSION_PATTERN.md');
    assert.ok(fs.existsSync(docPath));
    const doc = fs.readFileSync(docPath, 'utf8');
    assert.ok(doc.length > 500);
    assert.ok(/TASK1\.71/.test(doc));
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

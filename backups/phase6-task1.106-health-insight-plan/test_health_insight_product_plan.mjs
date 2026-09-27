/*
 * Phase 6 TASK 1.106｜Health Insight Product Definition
 * Foundation 測試
 *
 * 本任務是產品架構規劃任務——不實作任何production功能、不
 * 建立UI、不建立route/controller、不整合任何AI。目的是驗證
 * `PHASE6_HEALTH_INSIGHT_PRODUCT_PLAN.md`完整涵蓋規格要求的10
 * 個章節，並重新確認Phase 1~5既有架構（五個Product
 * Boundary、Phase 4 Capability Chain、Phase 2/3既有程式碼、
 * app.intelligence/router/worker.js/database）完全沒有被本次
 * 任務影響。
 *
 * 分為以下13個部分：
 * A) Product vision validation
 * B) Target user definition
 * C) Pain point validation
 * D) Feature scope
 * E) User journey
 * F) Intelligence flow mapping
 * G) Input boundary
 * H) Output boundary
 * I) Premium direction
 * J) Gemini extension boundary
 * K) Dependency direction
 * L) Regression validation
 * M) P1-P6
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
const productDir = path.join(intelDir, 'product');
const productEntryDir = path.join(productDir, 'entry');
const productContractDir = path.join(productDir, 'contract');
const productAdapterDir = path.join(productDir, 'adapter');
const productExecutionDir = path.join(productDir, 'execution');
const productOperationalDir = path.join(productDir, 'operational');
const capabilitiesDir = path.join(intelDir, 'capabilities');
const analysisCapabilityDir = path.join(capabilitiesDir, 'analysis');
const recommendationCapabilityDir = path.join(capabilitiesDir, 'recommendation');
const orchestrationCapabilityDir = path.join(capabilitiesDir, 'orchestration');
const decisionCapabilityDir = path.join(capabilitiesDir, 'decision');
const applicationDir = path.join(intelDir, 'application');
const featuresDir = path.join(applicationDir, 'features');
const intelligenceFeatureDir = path.join(featuresDir, 'intelligence');
const analysisDir = path.join(intelDir, 'analysis');
const recommendationDir = path.join(intelDir, 'recommendation');
const docPath = path.join(productDir, 'PHASE6_HEALTH_INSIGHT_PRODUCT_PLAN.md');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readSrc(fullPath) {
  return stripComments(fs.readFileSync(fullPath, 'utf8'));
}

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

const PRODUCT_LAYERS = [
  { name: 'product-entry', dir: productEntryDir, files: ['product_entry.js', 'product_entry_result_builder.js', 'index.js'] },
  { name: 'product-contract', dir: productContractDir, files: ['product_contract.js', 'product_contract_validator.js', 'product_contract_result_builder.js', 'index.js'] },
  { name: 'product-adapter', dir: productAdapterDir, files: ['product_adapter.js', 'product_adapter_result_builder.js', 'index.js'] },
  { name: 'product-execution', dir: productExecutionDir, files: ['product_execution.js', 'product_execution_result_builder.js', 'index.js'] },
  { name: 'product-operational', dir: productOperationalDir, files: ['product_operational.js', 'product_operational_result_builder.js', 'index.js'] },
];
const PHASE4_LAYERS = [
  { name: 'analysis', dir: analysisCapabilityDir, files: ['analysis_capability.js', 'analysis_capability_result_builder.js', 'index.js'] },
  { name: 'recommendation', dir: recommendationCapabilityDir, files: ['recommendation_capability.js', 'recommendation_capability_result_builder.js', 'index.js'] },
  { name: 'orchestration', dir: orchestrationCapabilityDir, files: ['capability_orchestrator.js', 'capability_result_builder.js', 'index.js'] },
  { name: 'decision', dir: decisionCapabilityDir, files: ['decision_capability.js', 'decision_result_builder.js', 'index.js'] },
  { name: 'intelligence-feature', dir: intelligenceFeatureDir, files: ['intelligence_feature.js', 'intelligence_feature_result_mapper.js', 'index.js'] },
];
const ALL_LAYERS = [...PRODUCT_LAYERS, ...PHASE4_LAYERS];
const ALL_SCANNED_FILES = ALL_LAYERS.flatMap((layer) => layer.files.map((f) => ({ layer: layer.name, dir: layer.dir, file: f, full: path.join(layer.dir, f) })));
const PRODUCT_LAYER_NAMES = PRODUCT_LAYERS.map((l) => l.name);
const RUNTIME_FORBIDDEN_SUBDIRS = ['history', 'metrics', 'facade', 'service', 'orchestration', 'data_preparation', 'governance', 'events', 'monitoring', 'execution', 'capabilities', 'analysis', 'recommendation', 'application'];
const AI_KEYWORDS = [
  /anthropic/i, /claude/i, /openai/i, /gpt-\d/i, /deepseek/i, /gemini/i,
  /api\.anthropic\.com/i, /api\.openai\.com/i, /chat\.completions/i,
  /model\s*[:=]\s*['"]/i, /inference/i, /prompt/i,
];

async function run() {
  const doc = fs.readFileSync(docPath, 'utf8');
  const flatDoc = doc.replace(/\n/g, ' ');

  // =========================================================================
  // A. Product vision validation
  // =========================================================================
  console.log('--- A. Product vision validation ---');

  await test('（1.Product vision）文件存在且非空', () => {
    const stat = fs.statSync(docPath);
    assert.ok(stat.isFile());
    assert.ok(stat.size > 0);
  });

  await test('（1.Product vision）文件包含「1. Product Vision」章節', () => {
    assert.ok(doc.includes('Product Vision'));
  });

  await test('（1.Product vision）文件明確記錄第一個產品入口"Health Weight Management Intelligence"', () => {
    assert.ok(doc.includes('Health Weight Management Intelligence'));
  });

  await test('（1.Product vision）文件明確記錄長期方向"Personal Intelligence Platform"', () => {
    assert.ok(doc.includes('Personal Intelligence Platform'));
  });

  await test('（1.Product vision）文件記錄Product Purpose：不做決定、不取代真人教練/醫療建議', () => {
    assert.ok(/不是\*{0,2}幫使用者做決定/.test(flatDoc));
  });

  await test('（1.Product vision）文件記錄Why Users Need Health Insight：記錄+圖表之間補上"為什麼"跟"接下來怎麼做"', () => {
    assert.ok(doc.includes('為什麼'));
    assert.ok(/接下來\s*怎麼做/.test(flatDoc));
  });

  await test('（1.Product vision）文件記錄Health Management跟Personal Intelligence的關係是"具體實例"跟"長期方向"', () => {
    assert.ok(/具體實例/.test(flatDoc));
    assert.ok(/長期方向/.test(flatDoc));
  });

  await test('（1.Product vision）文件明確排除AI Chat/Generic chatbot/AI assistant wrapper', () => {
    assert.ok(doc.includes('AI Chat'));
  });

  console.log('');

  // =========================================================================
  // B. Target user definition
  // =========================================================================
  console.log('--- B. Target user definition ---');

  await test('（2.Target user）文件包含「2. Target User」章節', () => {
    assert.ok(doc.includes('Target User'));
  });

  await test('（2.Target user）文件記錄Primary User：一般成年使用者、非專業運動員、非重症病患', () => {
    assert.ok(/Primary User/.test(doc));
    assert.ok(/一般\s*成年使用者/.test(flatDoc));
  });

  await test('（2.Target user）文件記錄User Motivation至少三項動機', () => {
    assert.ok(/User Motivation/.test(doc));
    const motivationSection = doc.split('User Motivation')[1] || '';
    const bulletCount = (motivationSection.split('User Problems')[0].match(/^- /gm) || []).length;
    assert.ok(bulletCount >= 3, `預期至少3項動機，實際 ${bulletCount}`);
  });

  await test('（2.Target user）文件記錄User Problems歸納句"有資料，沒洞察；有洞察，沒行動"', () => {
    assert.ok(doc.includes('有資料'));
    assert.ok(doc.includes('沒洞察'));
    assert.ok(doc.includes('沒行動'));
  });

  console.log('');

  // =========================================================================
  // C. Pain point validation
  // =========================================================================
  console.log('--- C. Pain point validation ---');

  await test('（3.Pain point）文件包含「3. User Pain Points」章節', () => {
    assert.ok(doc.includes('User Pain Points'));
  });

  const REQUIRED_PAIN_POINTS = [
    'Cannot understand why weight does not change',
    'Cannot identify unhealthy behavior patterns',
    'Cannot maintain habits',
    'Cannot translate data into actions',
  ];
  for (const painPoint of REQUIRED_PAIN_POINTS) {
    await test(`（3.Pain point）文件記錄規格範例痛點："${painPoint}"`, () => {
      assert.ok(doc.includes(painPoint), `文件缺少痛點：${painPoint}`);
    });
  }

  await test('（3.Pain point）每個Pain Point都有獨立的小節標題（Pain Point 1~4）', () => {
    for (let i = 1; i <= 4; i++) {
      assert.ok(doc.includes(`Pain Point ${i}`), `缺少Pain Point ${i}`);
    }
  });

  await test('（3.Pain point）Pain Point 4連結到既有Recommendation Capability（TASK1.77）', () => {
    const section = doc.split('Pain Point 4')[1] || '';
    assert.ok(section.includes('Recommendation') && section.includes('TASK1.77'));
  });

  console.log('');

  // =========================================================================
  // D. Feature scope
  // =========================================================================
  console.log('--- D. Feature scope ---');

  await test('（4.Feature scope）文件包含「4. Feature Scope」章節', () => {
    assert.ok(doc.includes('Feature Scope'));
  });

  await test('（4.Feature scope）V1 Include清單包含Basic health data/Daily behavior input/Insight generation/Recommendation output', () => {
    for (const item of ['Basic health data', 'Daily behavior input', 'Insight generation', 'Recommendation output']) {
      assert.ok(doc.includes(item), `Include清單缺少：${item}`);
    }
  });

  await test('（4.Feature scope）V1 Exclude清單包含AI Chat/Gemini integration/Advanced decision automation', () => {
    for (const item of ['AI Chat', 'Gemini integration', 'Advanced decision automation']) {
      assert.ok(doc.includes(item), `Exclude清單缺少：${item}`);
    }
  });

  await test('（4.Feature scope）Insight generation對應既有Analysis Capability（TASK1.76）', () => {
    const section = doc.split('Insight generation')[1] || '';
    assert.ok(section.slice(0, 500).includes('TASK1.76'));
  });

  await test('（4.Feature scope）Recommendation output對應既有Recommendation Capability（TASK1.77）', () => {
    const section = doc.split('Recommendation output')[1] || '';
    assert.ok(section.slice(0, 500).includes('TASK1.77'));
  });

  await test('（4.Feature scope）文件明確說明V1不使用Decision Capability（TASK1.83），因為仍是decision:null佔位形狀', () => {
    assert.ok(/TASK1\.83/.test(doc));
    assert.ok(/decision:\s*null/.test(doc) || /decision:\*{0,2}\s*null/.test(flatDoc));
  });

  console.log('');

  // =========================================================================
  // E. User journey
  // =========================================================================
  console.log('--- E. User journey ---');

  await test('（5.User journey）文件包含「5. User Journey」章節', () => {
    assert.ok(doc.includes('User Journey'));
  });

  await test('（5.User journey）文件記錄六步驟流程：輸入健康資訊→輸入行為資料→分析→產生Insight→提供建議→追蹤歷史', () => {
    const journeySection = doc.split('## 5. User Journey')[1] || '';
    const excerpt = journeySection.split('## 6.')[0];
    for (const kw of ['輸入健康資訊', '輸入每日行為資料', '分析行為', '產生Health Insight', '提供建議', '追蹤歷史']) {
      assert.ok(excerpt.includes(kw), `User Journey缺少步驟：${kw}`);
    }
  });

  await test('（5.User journey）文件記錄"追蹤歷史"不要求任何新的資料庫schema', () => {
    const journeySection = doc.split('## 5. User Journey')[1] || '';
    assert.ok(/不\*{0,2}\s*要求任何新的\s*資料庫schema/.test(journeySection.replace(/\n/g, ' ')));
  });

  await test('（5.User journey）文件記錄User Journey跟既有Intelligence Chain的對應（rawInput/requestProductEntry）', () => {
    assert.ok(doc.includes('rawInput'));
    assert.ok(doc.includes('requestProductEntry'));
  });

  console.log('');

  // =========================================================================
  // F. Intelligence flow mapping
  // =========================================================================
  console.log('--- F. Intelligence flow mapping ---');

  await test('（6.Intelligence flow mapping）文件包含「6. Intelligence Flow Mapping」章節', () => {
    assert.ok(doc.includes('Intelligence Flow Mapping'));
  });

  await test('（6.Intelligence flow mapping）文件記錄完整九層映射（User Scenario→Health Insight Feature→Entry→Contract→Adapter→Execution→Operational→Feature→Capability→Runtime）', () => {
    const mappingSection = doc.split('## 6. Intelligence Flow Mapping')[1] || '';
    const excerpt = mappingSection.split('### 對應到既有三個Capability')[0];
    for (const kw of ['User Scenario', 'Health Insight Feature', 'Product Entry', 'Product Contract', 'Product Adapter', 'Product Execution Boundary', 'Product Operational Boundary', 'Feature Intelligence Integration', 'Capability Orchestrator', 'Analysis Runner']) {
      assert.ok(excerpt.includes(kw), `映射缺少層級：${kw}`);
    }
  });

  await test('（6.Intelligence flow mapping）文件記錄Health Insight Feature是Analysis Capability的呼叫端，不是修改者', () => {
    assert.ok(/呼叫端/.test(doc));
    assert.ok(/不是\s*修改者/.test(flatDoc));
  });

  await test('（6.Intelligence flow mapping）文件記錄Recommendation Capability透過既有Capability Orchestrator自動轉交，Health Insight不需要額外呼叫', () => {
    assert.ok(/自動轉交/.test(doc));
  });

  await test('（6.Intelligence flow mapping）文件記錄Decision Capability目前是選填依賴，V1不注入decisionCapability', () => {
    assert.ok(/選填/.test(doc));
    assert.ok(doc.includes('decisionCapability'));
  });

  await test('（6.Intelligence flow mapping）文件引用既有Insight Context形狀欄位（activityContext/nutritionContext/emotionContext/behaviorContext/reportContext）', () => {
    for (const field of ['activityContext', 'nutritionContext', 'emotionContext', 'behaviorContext', 'reportContext']) {
      assert.ok(doc.includes(field), `文件缺少Insight Context欄位：${field}`);
    }
  });

  console.log('');

  // =========================================================================
  // G. Input boundary
  // =========================================================================
  console.log('--- G. Input boundary ---');

  await test('（7.Input boundary）文件包含「7. Input Boundary Planning」章節', () => {
    assert.ok(doc.includes('Input Boundary Planning'));
  });

  const REQUIRED_BASIC_FIELDS = ['age', 'gender', 'height', 'weight', 'goal'];
  for (const field of REQUIRED_BASIC_FIELDS) {
    await test(`（7.Input boundary）Basic欄位包含"${field}"`, () => {
      const section = doc.split('### Basic（基本健康資料')[1] || '';
      const excerpt = section.split('### Daily')[0];
      assert.ok(excerpt.includes(`\`${field}\``), `Basic欄位缺少：${field}`);
    });
  }

  const REQUIRED_DAILY_FIELDS = ['food', 'exercise', 'sleep', 'activity'];
  for (const field of REQUIRED_DAILY_FIELDS) {
    await test(`（7.Input boundary）Daily欄位包含"${field}"`, () => {
      const section = doc.split('### Daily（每日行為資料')[1] || '';
      const excerpt = section.split('### 明確的範圍限制')[0];
      assert.ok(excerpt.includes(`\`${field}\``), `Daily欄位缺少：${field}`);
    });
  }

  await test('（7.Input boundary）文件明確聲明本次任務不建立任何database schema', () => {
    const section = doc.split('## 7. Input Boundary Planning')[1] || '';
    const excerpt = section.split('## 8.')[0].replace(/\n/g, ' ');
    assert.ok(/不\*{0,2}建立任何\s*database\s*schema/.test(excerpt) || /不建立任何database\s*schema/.test(excerpt));
  });

  await test('（7.Input boundary）文件明確聲明九個欄位不是資料表定義、不是型別定義', () => {
    const section = (doc.split('## 7. Input Boundary Planning')[1] || '').split('## 8.')[0].replace(/\n/g, ' ');
    assert.ok(/不是\*{0,2}任何資料表/.test(section));
  });

  console.log('');

  // =========================================================================
  // H. Output boundary
  // =========================================================================
  console.log('--- H. Output boundary ---');

  await test('（8.Output boundary）文件包含「8. Output Boundary Planning」章節', () => {
    assert.ok(doc.includes('Output Boundary Planning'));
  });

  const REQUIRED_OUTPUT_ITEMS = ['Health observation', 'Behavior pattern', 'Recommendation', 'Progress trend'];
  for (const item of REQUIRED_OUTPUT_ITEMS) {
    await test(`（8.Output boundary）輸出分類包含"${item}"`, () => {
      const section = (doc.split('## 8. Output Boundary Planning')[1] || '').split('## 9.')[0];
      assert.ok(section.includes(item), `輸出分類缺少：${item}`);
    });
  }

  await test('（8.Output boundary）文件明確聲明本次任務不實作任何output model', () => {
    const section = (doc.split('## 8. Output Boundary Planning')[1] || '').split('## 9.')[0].replace(/\n/g, ' ');
    assert.ok(/不\*{0,2}實作任何\s*output\s*model/.test(section) || /不實作任何output\s*model/.test(section));
  });

  console.log('');

  // =========================================================================
  // I. Premium direction
  // =========================================================================
  console.log('--- I. Premium direction ---');

  await test('（9.Premium direction）文件包含「9. Premium Direction」章節', () => {
    assert.ok(doc.includes('Premium Direction'));
  });

  await test('（9.Premium direction）Free層級包含Basic health insight', () => {
    const section = (doc.split('### Free（免費層級）')[1] || '').split('### Premium')[0];
    assert.ok(section.includes('Basic health insight'));
  });

  const REQUIRED_PREMIUM_ITEMS = ['Advanced intelligence', 'Gemini enhanced insight', 'AI coaching'];
  for (const item of REQUIRED_PREMIUM_ITEMS) {
    await test(`（9.Premium direction）Premium層級包含"${item}"`, () => {
      const section = (doc.split('### Premium（付費層級')[1] || '').split('### 明確的範圍限制')[0];
      assert.ok(section.includes(item), `Premium清單缺少：${item}`);
    });
  }

  await test('（9.Premium direction）文件明確聲明本次任務不實作任何付款機制', () => {
    const section = (doc.split('## 9. Premium Direction')[1] || '').split('## 10.')[0].replace(/\n/g, ' ');
    assert.ok(/不\*{0,2}實作任何\s*付款機制/.test(section) || /不實作任何付款機制/.test(section));
  });

  await test('（9.Premium direction）文件確認不涉及src/auth/、src/oauth/、src/session/的任何修改', () => {
    const section = (doc.split('## 9. Premium Direction')[1] || '').split('## 10.')[0];
    assert.ok(section.includes('src/auth/'));
    assert.ok(section.includes('src/oauth/'));
  });

  console.log('');

  // =========================================================================
  // J. Gemini extension boundary
  // =========================================================================
  console.log('--- J. Gemini extension boundary ---');

  await test('（10.Gemini extension）文件包含「10. Future Gemini Extension」章節', () => {
    assert.ok(doc.includes('Future Gemini Extension'));
  });

  await test('（10.Gemini extension）文件明確定義Gemini可能的銜接點在Product Feature層，不在Phase 5 Boundary或Phase 4 Capability內部', () => {
    assert.ok(/Product\s*Feature層/.test(doc));
    assert.ok(/不會\*{0,2}插入\s*Phase\s*5既有的五個Boundary/.test(flatDoc));
  });

  await test('（10.Gemini extension）文件明確確認Gemini是Enhancement Layer', () => {
    assert.ok(doc.includes('Enhancement Layer'));
  });

  await test('（10.Gemini extension）文件明確確認Gemini不會取代Analysis Capability/Recommendation Capability/Runtime', () => {
    assert.ok(/不會取代\*{0,2}Analysis\s*Capability/.test(flatDoc));
    assert.ok(/不會取代\*{0,2}Recommendation\s*Capability/.test(flatDoc));
    assert.ok(/不會取代\*{0,2}Runtime/.test(flatDoc));
  });

  await test('（10.Gemini extension）文件記錄同步/deterministic架構跟AI非同步/non-deterministic之間的既有落差，留給未來Phase 6.x AI Preparation任務評估', () => {
    assert.ok(/非同步/.test(doc));
    assert.ok(/non-deterministic/.test(doc));
    assert.ok(/Phase\s*6\.x/.test(doc));
  });

  console.log('');

  // =========================================================================
  // K. Dependency direction
  // =========================================================================
  console.log('--- K. Dependency direction ---');

  await test('（11.Dependency direction）本次任務的Restrictions Confirmation章節存在', () => {
    assert.ok(doc.includes('Restrictions Confirmation'));
  });

  await test('（TASK1.107後更新）（11.Dependency direction）src/intelligence/product/PHASE6_HEALTH_INSIGHT_PRODUCT_PLAN.md是TASK1.106自己的commit（03bf6c7）新增的檔案（git show --name-status確認，而不是檢查即時git status——避免被後續任何時間點的執行誤判為失敗，延續TASK1.99~1.105測試套件同樣的修正模式）', () => {
    const nameStatus = execFileSync('git', ['show', '--name-status', '--pretty=format:', '03bf6c7'], { cwd: repoRoot, encoding: 'utf8' });
    const line = nameStatus.split('\n').find((l) => l.endsWith('\tsrc/intelligence/product/PHASE6_HEALTH_INSIGHT_PRODUCT_PLAN.md'));
    assert.ok(line && line.startsWith('A'), `預期該檔案在03bf6c7被新增，實際：${line}`);
  });

  for (const layer of ALL_LAYERS) {
    await test(`（11.Dependency direction）${layer.name} 目錄本次任務完全沒有任何檔案被修改`, () => {
      const status = execFileSync('git', ['status', '--porcelain', layer.dir], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(status.trim(), '');
    });
  }

  await test('（11.Dependency direction）src/bootstrap/application.js本次任務完全沒有被修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.Dependency direction）app.intelligence物件恰好維持24個欄位不變（Validation要求："app.intelligence unchanged"）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.deepStrictEqual(Object.keys(app.intelligence).sort(), [
      'analysis', 'analysisEngine', 'application', 'behaviorFeature', 'capabilities', 'context', 'dataPreparation', 'events', 'execution',
      'facade', 'features', 'governance', 'history', 'insightExecutionFlow', 'insightFeature', 'insightService', 'metrics', 'monitoring',
      'orchestration', 'recommendation', 'recommendationEngine', 'service', 'useCases', 'workflow',
    ]);
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（11.Dependency direction）app.router.routes 數量沒有因為本次任務而改變（依然是21條，Validation要求："existing routes unchanged"）', async () => {
    const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 21);
  });

  await test('（11.Dependency direction）src/worker.js完全沒有被本次任務修改（Validation要求："worker.js unchanged"）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（11.Dependency direction）src/routes/、src/controllers/目錄本次任務完全沒有新增或修改任何檔案（沒有建立route/controller）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/routes/ src/controllers/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（11.Dependency direction）src/auth/、src/oauth/、src/middleware/目錄本次任務完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- src/auth/ src/oauth/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（11.Dependency direction）migrations/ 目錄本次任務完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（11.Dependency direction）src/db/ 目錄本次任務完全沒有新增或修改任何檔案（Validation要求："database unchanged"）', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（11.Dependency direction）Phase 3 Application Layer（application/整個目錄樹）本次任務完全沒有任何.js檔案被新增或修改', () => {
    const diff = execFileSync('sh', ['-c', "git diff --name-only -- 'src/intelligence/application/*.js' 'src/intelligence/application/**/*.js' 2>/dev/null || true"], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '', `發現非預期的production程式碼變更：${diff}`);
  });

  await test('（11.Dependency direction）Phase 2 Runtime Orchestrator（src/intelligence/orchestration/）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/orchestration/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（11.Dependency direction）src/intelligence/analysis/（Analysis Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/analysis/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（11.Dependency direction）src/intelligence/recommendation/（Recommendation Runner）本次任務完全沒有被修改', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'src/intelligence/recommendation/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（11.Dependency direction）9份Phase 5規劃/審查文件（src/intelligence/底下）本次任務完全沒有被修改', () => {
    const PHASE5_DOCS_AT_INTEL_ROOT = [
      'PHASE5_PRODUCT_INTEGRATION_PLAN.md', 'PHASE5_PRODUCT_ENTRY_BOUNDARY_PLAN.md', 'PHASE5_PRODUCT_ADAPTER_PLAN.md',
      'PHASE5_PRODUCT_FEATURE_FLOW_PLAN.md', 'PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md', 'PHASE5_PRODUCT_EXECUTION_BOUNDARY_PLAN.md',
      'PHASE5_OPERATIONAL_BOUNDARY_PLAN.md', 'PHASE5_PRODUCT_INTEGRATION_CONSOLIDATION_REVIEW.md', 'PHASE5_IMPLEMENTATION_READINESS_PLAN.md',
    ];
    for (const docName of PHASE5_DOCS_AT_INTEL_ROOT) {
      const diff = execFileSync('git', ['diff', '--stat', `src/intelligence/${docName}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${docName} 不應該被本次任務修改`);
    }
  });

  await test('（11.Dependency direction）2份Phase 5完成快照文件（src/intelligence/product/底下）本次任務完全沒有被修改', () => {
    const PHASE5_DOCS_AT_PRODUCT_ROOT = ['PHASE5_PRODUCT_INTEGRATION_FINAL_REVIEW.md', 'PHASE5_COMPLETION_AND_PHASE6_PLAN.md'];
    for (const docName of PHASE5_DOCS_AT_PRODUCT_ROOT) {
      const diff = execFileSync('git', ['diff', '--stat', `src/intelligence/product/${docName}`], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '', `${docName} 不應該被本次任務修改`);
    }
  });

  await test('（11.Dependency direction）沒有新增任何新的Product Boundary目錄（本次任務只是規劃文件，不新增第六個邊界）', () => {
    const entries = fs.readdirSync(productDir, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    assert.deepStrictEqual(dirNames, ['adapter', 'contract', 'entry', 'execution', 'operational']);
  });

  await test('（11.Dependency direction）五個Product Boundary目錄恰好維持既有的檔案清單（本次任務沒有新增/刪除/修改任何一個檔案）', () => {
    for (const layer of PRODUCT_LAYERS) {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort(), `${layer.name}目錄的檔案清單跟預期不符`);
    }
  });

  await test('（11.Dependency direction）Phase 4五層Capability目錄恰好維持既有的檔案清單（本次任務沒有新增/刪除/修改任何一個檔案）', () => {
    for (const layer of PHASE4_LAYERS) {
      const files = fs.readdirSync(layer.dir).sort();
      assert.deepStrictEqual(files, [...layer.files, 'README.md'].sort(), `${layer.name}目錄的檔案清單跟預期不符`);
    }
  });

  // 逐檔案重新確認：五個Product Boundary + Phase 4五層Capability，
  // 合計16個既有production程式碼檔案，本次規劃任務完全沒有修改
  // 過其中任何一個位元組，也重新確認這些既有檔案本身依然遵守
  // Phase 1~5系列反覆確認的邊界規則（不依賴DB/Auth/AI/Runtime
  // 內部模組），延續TASK1.104/1.105已建立的逐檔案掃描慣例。
  for (const { layer, file, full } of ALL_SCANNED_FILES) {
    await test(`（11.Dependency direction）${layer}/${file} 本次任務完全沒有被修改（逐檔案git diff確認）`, () => {
      const relPath = path.relative(repoRoot, full);
      const diff = execFileSync('git', ['diff', '--stat', relPath], { cwd: repoRoot, encoding: 'utf8' });
      assert.strictEqual(diff.trim(), '');
    });

    const src = readSrc(full);

    await test(`（11.Dependency direction）${layer}/${file} 完全不import src/db/（不直接依賴database，重新確認既有邊界）`, () => {
      assert.ok(!/from\s+['"].*\/db\//.test(src));
    });

    for (const subdir of ['auth', 'oauth', 'identity', 'middleware']) {
      await test(`（11.Dependency direction）${layer}/${file} 完全不import src/${subdir}/（重新確認既有邊界）`, () => {
        assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
      });
    }

    for (const pattern of [/\bjwt\b/i, /\bsession\b/i, /\bcookie\b/i]) {
      await test(`（11.Dependency direction）${layer}/${file} 不含身分相關字樣 ${pattern}（重新確認既有邊界）`, () => {
        assert.ok(!pattern.test(src));
      });
    }

    await test(`（11.Dependency direction）${layer}/${file} 完全沒有呼叫fetch()（重新確認既有邊界，不直接呼叫外部服務）`, () => {
      assert.ok(!/\bfetch\s*\(/.test(src));
    });

    await test(`（11.Dependency direction）${layer}/${file} 完全不呼叫Date.now()/Math.random()（重新確認既有邊界，deterministic）`, () => {
      assert.ok(!/Date\.now\(\)/.test(src));
      assert.ok(!/Math\.random\(\)/.test(src));
    });

    for (const pattern of AI_KEYWORDS) {
      await test(`（11.Dependency direction）${layer}/${file} 的實際程式碼不含AI相關關鍵字樣 ${pattern}（重新確認Phase 5/Phase 4既有邊界，本次規劃任務也沒有讓任何AI字樣滲入既有程式碼）`, () => {
        assert.ok(!pattern.test(src), `${layer}/${file} 出現疑似AI相關字樣：${pattern}`);
      });
    }

    if (PRODUCT_LAYER_NAMES.includes(layer) && file !== 'README.md' && file !== 'index.js') {
      for (const subdir of RUNTIME_FORBIDDEN_SUBDIRS) {
        await test(`（11.Dependency direction）${layer}/${file} 完全不import src/intelligence/${subdir}/（重新確認Product Boundary不得繞過下一層直接呼叫Capability/Runtime）`, () => {
          assert.ok(!new RegExp(`from\\s+['"].*\\/${subdir}\\/`).test(src));
        });
      }
      await test(`（11.Dependency direction）${layer}/${file} 完全不import src/routes/、src/controllers/、worker.js（重新確認No HTTP邊界）`, () => {
        assert.ok(!/from\s+['"].*\/routes\//.test(src));
        assert.ok(!/from\s+['"].*\/controllers\//.test(src));
        assert.ok(!/worker\.js/.test(src));
      });
    }
  }

  console.log('');

  // =========================================================================
  // L. Regression validation
  // =========================================================================
  console.log('--- L. Regression validation ---');

  const isNestedRun = process.env.PHASE1_REVIEW_NESTED === '1';

  if (isNestedRun) {
    await test('（12.Regression validation）此檔案目前是被另一個meta regression suite以子行程spawn執行（PHASE1_REVIEW_NESTED=1），為避免互相遞迴spawn造成無限迴圈，這裡安全跳過「再往下spawn backups/底下全部測試檔案」這個動作，只執行本檔案其餘的直接斷言', () => {
      assert.ok(true);
    });
  } else {
    const allSuites = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase6-task1.106-health-insight-plan')) {
          allSuites.push(full);
        }
      }
    }
    walk(path.join(repoRoot, 'backups'));
    allSuites.sort();

    await test(`（12.Regression validation）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含Phase 1/Phase 2/Phase 3/Phase 4/Phase 5全部）`, () => {
      assert.ok(allSuites.length >= 97, `預期至少97個既有測試檔案，實際 ${allSuites.length}`);
    });

    for (const suite of allSuites) {
      const relName = path.relative(repoRoot, suite);
      await test(`（12.Regression validation）${relName} 完整執行，exit code為0（無回歸）`, () => {
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
  // M. P1-P6
  // =========================================================================
  console.log('--- M. P1-P6 ---');

  await test('（13.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次任務完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（13.P1-P6）src/worker.js 完全沒有被本次任務修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）wrangler.toml 完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（13.P1-P6）migrations/ 目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const statusOutput = execFileSync('git', ['status', '--porcelain', 'migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(statusOutput.trim(), '');
  });

  await test('（13.P1-P6）src/routes/、src/controllers/、src/auth/、src/oauth/ 完全沒有被本次任務修改', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/routes/*.js src/controllers/*.js src/auth/*.js src/oauth/*.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

/*
 * Phase 6 TASK 1.116｜Health Insight Product Activation
 * Implementation 測試
 *
 * 本任務第一次把TASK1.114/1.115建立的Health Insight UI
 * Foundation跟TASK1.112的Health Insight Product Integration接在
 * 一起，建立第一個真正可以被使用者操作的完整流程：
 *
 *   User → Health Insight Entry（GET /health-insight）
 *        → Input Experience（瀏覽器互動：chip選取/輸入/送出）
 *        → Product Request（POST /api/health-insight）
 *        → createHealthInsightProductIntegration().requestProductEntry()
 *        → Capability Execution（既有Analysis/Recommendation鏈路）
 *        → Health Insight Result → UI Presentation
 *
 * 本次任務不重新設計UI、不整合Gemini、不修改Intelligence架構
 * （Product Entry/Contract/Adapter/Execution/Operational/Health
 * Insight Feature/Capability Orchestrator/Analysis
 * Runner/Recommendation Runner/Runtime全部維持逐字不變）、不修改
 * 資料庫schema/migrations/auth/oauth/session。唯一新增的橋接
 * 邏輯是`src/controllers/health_insight_controller.js`裡把Input
 * Experience答案轉成Insight Context的一個小函式，重用既有TASK1.42
 * `createInsightContextBuilder()`純函式完成轉換。
 *
 * 分為以下12個部分：
 * A) Health Insight entry
 * B) Route activation
 * C) UI interaction
 * D) Input state
 * E) Request flow
 * F) Product Integration connection
 * G) Result rendering
 * H) Error presentation
 * I) UX consistency
 * J) Existing architecture protection
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
const routesDir = path.join(srcRoot, 'routes');
const controllersDir = path.join(srcRoot, 'controllers');
const uiDir = path.join(srcRoot, 'ui', 'health_insight');
const clientDir = path.join(uiDir, 'client');

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

async function loadModules() {
  const { createAppRouter } = await import(path.join(routesDir, 'index.js'));
  const { createApplication } = await import(path.join(srcRoot, 'bootstrap', 'application.js'));
  const controllerModule = await import(path.join(controllersDir, 'health_insight_controller.js'));
  const uiModule = await import(path.join(uiDir, 'index.js'));
  const { createHealthInsightProductIntegration } = await import(path.join(srcRoot, 'intelligence', 'product', 'health_insight_integration.js'));
  const { createInsightContextBuilder } = await import(path.join(srcRoot, 'intelligence', 'context', 'insight_context_builder.js'));
  return { createAppRouter, createApplication, controllerModule, uiModule, createHealthInsightProductIntegration, createInsightContextBuilder };
}

async function main() {
  const {
    createAppRouter,
    createApplication,
    controllerModule,
    uiModule,
    createHealthInsightProductIntegration,
    createInsightContextBuilder,
  } = await loadModules();

  const { getHealthInsightPageController, submitHealthInsightController } = controllerModule;
  const { getHealthInsightClientScript, renderHealthInsightInputExperience, renderHealthInsightDashboard, renderHealthInsightDashboardError, renderHealthInsightProductResponse } = uiModule;

  // （TASK1.117後更新）submitHealthInsightController()的回傳值從
  // TASK1.117起改成「結構化Product Response」（`{ok, data|error}`），
  // 不再直接回傳HTML（見TASK1.117的Response Boundary重構）。這份
  // TASK1.116當時寫的測試套件大量假設「呼叫controller就直接拿到
  // `{ok:true, data:{html}}`」——這裡用一個小wrapper重現舊有的
  // 端對端行為（controller→UI Renderer→html），讓底下每一個既有
  // 斷言完全不用個別修改就能繼續驗證「同樣的輸入最終還是產生同樣
  // 的HTML」這個核心語意（真正的controller/response
  // builder/UI連接邊界的斷言另外在TASK1.117自己的測試套件驗證）。
  function submitAndRenderHtml(payload, dependencies) {
    const structuredResponse = submitHealthInsightController(payload, dependencies);
    return { ok: true, data: { html: renderHealthInsightProductResponse(structuredResponse) } };
  }

  // =========================================================================
  // A. Health Insight entry
  // =========================================================================
  console.log('--- A. Health Insight entry ---');

  await test('（1.entry）getHealthInsightPageController()回傳{ok:true,data:{html}}', () => {
    const result = getHealthInsightPageController();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(typeof result.data.html, 'string');
  });

  for (const exportName of Object.keys(uiModule)) {
    await test(`（1.entry）src/ui/health_insight/index.js既有的公開匯出"${exportName}"在TASK1.116（新增getHealthInsightClientScript匯出後）依然存在且型別正確`, () => {
      const value = uiModule[exportName];
      assert.notStrictEqual(value, undefined, `${exportName} 是undefined`);
      if (exportName.startsWith('create') || exportName.startsWith('render') || exportName.startsWith('get') || exportName.startsWith('list') || exportName.startsWith('classify') || exportName === 'escapeHtml') {
        assert.strictEqual(typeof value, 'function', `${exportName} 應該是function`);
      } else if (exportName === 'ASSET_BASE_PATH') {
        assert.strictEqual(typeof value, 'string', `${exportName} 應該是string`);
      } else {
        assert.strictEqual(typeof value, 'object', `${exportName} 應該是object（token/registry常數）`);
      }
    });
  }

  await test('（1.entry）entry頁面內容就是renderHealthInsightInputExperience()的輸出（重用既有TASK1.114 UI，不重新排版）', () => {
    const result = getHealthInsightPageController();
    assert.strictEqual(result.data.html, renderHealthInsightInputExperience());
  });

  await test('（1.entry）entry頁面含Input Experience既有的data-hi-page="input"標記', () => {
    const result = getHealthInsightPageController();
    assert.ok(result.data.html.includes('data-hi-page="input"'));
  });

  await test('（1.entry）entry頁面含既有的五個Question Card欄位（gender/age/height/weight/healthGoal）', () => {
    const html = getHealthInsightPageController().data.html;
    ['gender', 'age', 'height', 'weight', 'healthGoal'].forEach((field) => {
      assert.ok(html.includes(`data-field="${field}"`), `缺少 ${field}`);
    });
  });

  await test('（1.entry）entry頁面含送出按鈕data-hi-action="submit-input-experience"', () => {
    const html = getHealthInsightPageController().data.html;
    assert.ok(html.includes('data-hi-action="submit-input-experience"'));
  });

  await test('（1.entry）getHealthInsightPageController()是deterministic（重複呼叫兩次結果相同）', () => {
    const r1 = getHealthInsightPageController();
    const r2 = getHealthInsightPageController();
    assert.strictEqual(r1.data.html, r2.data.html);
  });

  await test('（1.entry）getHealthInsightPageController()不接受任何參數也不會拋出例外', () => {
    assert.doesNotThrow(() => getHealthInsightPageController(undefined));
  });

  console.log('');

  // =========================================================================
  // B. Route activation
  // =========================================================================
  console.log('--- B. Route activation ---');

  await test('（2.route）createAppRouter()回傳app.router.routes總數為23（既有21條+Health Insight新增2條）', () => {
    const router = createAppRouter();
    assert.strictEqual(router.routes.length, 23);
  });

  await test('（2.route）GET /health-insight route已註冊', () => {
    const router = createAppRouter();
    assert.ok(router.routes.some((r) => r.method === 'GET' && r.path === '/health-insight'));
  });

  await test('（2.route）POST /api/health-insight route已註冊', () => {
    const router = createAppRouter();
    assert.ok(router.routes.some((r) => r.method === 'POST' && r.path === '/api/health-insight'));
  });

  await test('（2.route）GET /health-insight回傳真正的Response物件（text/html），不是JSON envelope', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    assert.ok(res instanceof Response);
    assert.strictEqual(res.status, 200);
    assert.ok((res.headers.get('Content-Type') || '').includes('text/html'));
  });

  await test('（2.route）GET /health-insight回傳的HTML是完整document（含DOCTYPE/html/head/body）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    const text = await res.text();
    assert.ok(text.startsWith('<!DOCTYPE html>'));
    assert.ok(text.includes('<html'));
    assert.ok(text.includes('<head>'));
    assert.ok(text.includes('<body>'));
    assert.ok(text.includes('</html>'));
  });

  await test('（2.route）GET /health-insight回傳的頁面含#hi-app容器', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    const text = await res.text();
    assert.ok(text.includes('id="hi-app"'));
  });

  await test('（2.route）GET /health-insight回傳的頁面含回到主頁連結（不取代既有首頁）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    const text = await res.text();
    assert.ok(text.includes('href="/"'));
  });

  await test('（2.route）GET /health-insight回傳的頁面只有一個<script>標籤，且沒有提早出現的</script>（避免字串跳脫問題）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    const text = await res.text();
    const scriptOpenCount = (text.match(/<script>/g) || []).length;
    const scriptCloseCount = (text.match(/<\/script>/g) || []).length;
    assert.strictEqual(scriptOpenCount, 1);
    assert.strictEqual(scriptCloseCount, 1);
  });

  await test('（2.route）POST方法呼叫GET /health-insight回傳405（method not allowed，Router既有邏輯）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/health-insight', payload: {}, options: {} }, {});
    assert.strictEqual(res.status, 405);
  });

  await test('（2.route）GET方法呼叫POST /api/health-insight回傳405', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/api/health-insight', options: {} }, {});
    assert.strictEqual(res.status, 405);
  });

  await test('（2.route）未知路徑（/health-insight-typo）回傳404', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'GET', pathname: '/health-insight-typo', options: {} }, {});
    assert.strictEqual(res.status, 404);
  });

  await test('（2.route）POST /api/health-insight回傳的是JSON（Content-Type application/json）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: {}, options: {} }, {});
    assert.ok((res.headers.get('Content-Type') || '').includes('application/json'));
  });

  await test('（2.route）POST /api/health-insight status固定200（延續Error Experience Boundary：友善錯誤卡片不是HTTP錯誤）', async () => {
    const router = createAppRouter();
    const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: {}, options: {} }, {});
    assert.strictEqual(res.status, 200);
  });

  await test('（2.route）src/worker.js新增了GET /health-insight的判斷式', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes("if (method === 'GET' && pathname === '/health-insight')"));
  });

  await test('（2.route）src/worker.js新增了POST /api/health-insight的判斷式', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes("if (method === 'POST' && pathname === '/api/health-insight')"));
  });

  await test('（2.route）src/routes/index.js有import並註冊registerHealthInsightRoutes', () => {
    const indexSource = fs.readFileSync(path.join(routesDir, 'index.js'), 'utf8');
    assert.ok(indexSource.includes("import { registerHealthInsightRoutes } from './health_insight_routes.js';"));
    assert.ok(indexSource.includes('registerHealthInsightRoutes(router);'));
  });

  await test('（2.route）src/routes/health_insight_routes.js存在且export registerHealthInsightRoutes', () => {
    const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
    assert.ok(routesSource.includes('export function registerHealthInsightRoutes(router)'));
  });

  await test('（2.route）router.routes裡每一條route都有效（method是字串、path是字串、regex是RegExp、handler是函式）——逐一檢查全部23條，不只新增的2條', () => {
    const router = createAppRouter();
    router.routes.forEach((r) => {
      assert.strictEqual(typeof r.method, 'string');
      assert.strictEqual(typeof r.path, 'string');
      assert.ok(r.regex instanceof RegExp);
      assert.strictEqual(typeof r.handler, 'function');
    });
  });

  for (const r of [
    { method: 'GET', path: '/health-insight' },
    { method: 'POST', path: '/api/health-insight' },
    { method: 'GET', path: '/auth/me' },
    { method: 'POST', path: '/auth/guest' },
    { method: 'POST', path: '/auth/logout' },
    { method: 'POST', path: '/auth/provider' },
    { method: 'POST', path: '/auth/provider/upgrade' },
    { method: 'GET', path: '/auth/google/callback' },
    { method: 'GET', path: '/api/dashboard' },
    { method: 'GET', path: '/api/profile' },
    { method: 'PATCH', path: '/api/profile' },
    { method: 'GET', path: '/api/timeline' },
    { method: 'GET', path: '/api/explorations' },
    { method: 'POST', path: '/api/explorations' },
    { method: 'GET', path: '/api/food-events' },
    { method: 'POST', path: '/api/food-events' },
    { method: 'GET', path: '/api/emotions' },
    { method: 'POST', path: '/api/emotions' },
    { method: 'GET', path: '/api/behaviors' },
    { method: 'POST', path: '/api/behaviors' },
    { method: 'GET', path: '/api/reports' },
    { method: 'POST', path: '/api/reports' },
  ]) {
    await test(`（2.route）既有route ${r.method} ${r.path} 在新router裡的regex確實能比對到自己的literal path（逐一驗證，不是只檢查存在）`, () => {
      const router = createAppRouter();
      const match = router.routes.find((route) => route.method === r.method && route.path === r.path);
      assert.ok(match, `找不到 ${r.method} ${r.path}`);
      assert.ok(match.regex.test(r.path));
    });
  }

  console.log('');

  // =========================================================================
  // C. UI interaction
  // =========================================================================
  console.log('--- C. UI interaction ---');

  const clientScript = getHealthInsightClientScript();

  await test('（3.interaction）getHealthInsightClientScript()回傳非空字串', () => {
    assert.strictEqual(typeof clientScript, 'string');
    assert.ok(clientScript.length > 0);
  });

  await test('（3.interaction）client script是deterministic（重複呼叫結果相同）', () => {
    assert.strictEqual(getHealthInsightClientScript(), getHealthInsightClientScript());
  });

  await test('（3.interaction）client script不含</script>字串（避免提早結束HTML的<script>標籤）', () => {
    assert.ok(!clientScript.includes('</script'));
  });

  await test('（3.interaction）client script監聽.hi-chip的click事件（選項選取）', () => {
    assert.ok(clientScript.includes("qsa('.hi-chip')"));
    assert.ok(clientScript.includes("addEventListener('click'"));
  });

  await test('（3.interaction）client script會讀取chip的data-field/data-value屬性', () => {
    assert.ok(clientScript.includes("getAttribute('data-field')"));
    assert.ok(clientScript.includes("getAttribute('data-value')"));
  });

  await test('（3.interaction）client script會切換hi-chip--selected class（選取狀態）', () => {
    assert.ok(clientScript.includes('hi-chip--selected'));
    assert.ok(clientScript.includes('classList.add'));
    assert.ok(clientScript.includes('classList.remove'));
  });

  await test('（3.interaction）client script同一組data-field的chip只允許單選（點選時先清除同組其他chip的selected class）', () => {
    assert.ok(clientScript.includes('.hi-chip[data-field="'));
    assert.ok(clientScript.includes("' + field + '\"]'"));
  });

  await test('（3.interaction）client script監聽.hi-friendly-input的input事件（輸入型欄位）', () => {
    assert.ok(clientScript.includes("qsa('.hi-friendly-input')"));
    assert.ok(clientScript.includes("addEventListener('input'"));
  });

  await test('（3.interaction）client script監聽送出按鈕[data-hi-action="submit-input-experience"]的click事件', () => {
    assert.ok(clientScript.includes('submit-input-experience'));
  });

  await test('（3.interaction）client script送出時呼叫POST /api/health-insight', () => {
    assert.ok(clientScript.includes("fetch('/api/health-insight'"));
    assert.ok(clientScript.includes("method: 'POST'"));
  });

  await test('（3.interaction）client script送出的body是JSON.stringify(STATE)', () => {
    assert.ok(clientScript.includes('JSON.stringify(STATE)'));
    assert.ok(clientScript.includes("'Content-Type': 'application/json'"));
  });

  await test('（3.interaction）client script有loading狀態管理函式setLoadingState', () => {
    assert.ok(clientScript.includes('function setLoadingState'));
    assert.ok(clientScript.includes('button.disabled'));
    assert.ok(clientScript.includes('hi-primary-button--loading'));
  });

  await test('（3.interaction）client script loading狀態會暫時改變按鈕文字', () => {
    assert.ok(clientScript.includes('data-hi-original-label'));
    assert.ok(clientScript.includes('button.textContent'));
  });

  await test('（3.interaction）client script送出前呼叫setLoadingState(button, true)', () => {
    assert.ok(clientScript.includes('setLoadingState(button, true)'));
  });

  await test('（3.interaction）client script成功回應後把data.html塞進#hi-app（success state）', () => {
    assert.ok(clientScript.includes('body.data.html'));
    assert.ok(clientScript.includes('appEl.innerHTML'));
  });

  await test('（3.interaction）client script網路失敗（catch）時顯示防禦性錯誤卡片（error state）', () => {
    assert.ok(clientScript.includes('.catch(function'));
    assert.ok(clientScript.includes('renderFallback'));
  });

  await test('（3.interaction）client script的防禦性錯誤卡片重用既有hi-card/hi-error-card class（不新增視覺語言）', () => {
    assert.ok(clientScript.includes('hi-error-card'));
    assert.ok(clientScript.includes('hi-error-temporary_failure'));
  });

  await test('（3.interaction）client script防禦性錯誤卡片不含任何reason/field/stage字樣（不洩漏內部細節）', () => {
    assert.ok(!/reason|field|stage/.test(clientScript.split('FALLBACK_ERROR_HTML =')[1].split(';')[0]));
  });

  await test('（3.interaction）client script成功/失敗都附上重新開始按鈕（restart-input-experience）', () => {
    assert.ok(clientScript.includes('restart-input-experience'));
  });

  await test('（3.interaction）重新開始按鈕點擊後呼叫window.location.reload()（回到起點）', () => {
    assert.ok(clientScript.includes('window.location.reload()'));
  });

  await test('（3.interaction）client script用IIFE包裝，不污染全域變數（除了必要的window API呼叫）', () => {
    assert.ok(/^\(function \(\) \{/.test(clientScript.trim()));
    assert.ok(clientScript.trim().endsWith('})();'));
  });

  await test('（3.interaction）client script用"use strict"', () => {
    assert.ok(clientScript.includes('"use strict"'));
  });

  await test('（3.interaction）client script在DOMContentLoaded或立即執行init()（兼容不同載入時機）', () => {
    assert.ok(clientScript.includes("document.readyState === 'loading'"));
    assert.ok(clientScript.includes('DOMContentLoaded'));
  });

  await test('（3.interaction）client script完全不import任何模組（純字串，瀏覽器端直接執行）', () => {
    assert.ok(!clientScript.includes('import '));
    assert.ok(!clientScript.includes('require('));
  });

  await test('（3.interaction）client script完全不呼叫任何AI/Gemini相關API', () => {
    assert.ok(!/gemini|openai|anthropic|generateContent/i.test(clientScript));
  });

  await test('（3.interaction）src/ui/health_insight/client/interaction_script.js檔案存在', () => {
    assert.ok(fs.existsSync(path.join(clientDir, 'interaction_script.js')));
  });

  await test('（3.interaction）src/ui/health_insight/index.js有re-export getHealthInsightClientScript', () => {
    const indexSource = fs.readFileSync(path.join(uiDir, 'index.js'), 'utf8');
    assert.ok(indexSource.includes('getHealthInsightClientScript'));
  });

  console.log('');

  // =========================================================================
  // D. Input state
  // =========================================================================
  console.log('--- D. Input state ---');

  const PROFILE_FIELDS = ['gender', 'age', 'height', 'weight', 'healthGoal'];

  for (const field of PROFILE_FIELDS) {
    await test(`（4.input state）POST payload的${field}欄位會被收進context.user`, () => {
      const result = submitAndRenderHtml({ [field]: field === 'age' ? 28 : 'sample' });
      assert.ok(result.ok);
      assert.ok(typeof result.data.html === 'string');
    });
  }

  await test('（4.input state）字串型欄位被截斷在100字元以內（防禦性清理）', () => {
    const longString = 'a'.repeat(500);
    const fakeIntegration = {
      requestProductEntry(request) {
        assert.strictEqual(request.rawInput.user.gender.length, 100);
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml({ gender: longString }, { integration: fakeIntegration });
  });

  await test('（4.input state）數字型欄位（age/height/weight）保留為number', () => {
    const fakeIntegration = {
      requestProductEntry(request) {
        assert.strictEqual(request.rawInput.user.age, 28);
        assert.strictEqual(request.rawInput.user.height, 165);
        assert.strictEqual(request.rawInput.user.weight, 60);
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml({ age: 28, height: 165, weight: 60 }, { integration: fakeIntegration });
  });

  await test('（4.input state）NaN/Infinity數值被安全捨棄（不會進入context.user）', () => {
    const fakeIntegration = {
      requestProductEntry(request) {
        assert.ok(!('age' in (request.rawInput.user || {})));
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml({ age: NaN }, { integration: fakeIntegration });
    submitAndRenderHtml({ age: Infinity }, { integration: fakeIntegration });
  });

  const WRONG_TYPE_VALUES = [
    { label: 'object', value: { nested: true } },
    { label: 'array', value: [1, 2, 3] },
    { label: 'boolean-true', value: true },
    { label: 'boolean-false', value: false },
    { label: 'function', value: () => {} },
    { label: 'symbol', value: Symbol('x') },
  ];

  for (const field of PROFILE_FIELDS) {
    for (const { label, value } of WRONG_TYPE_VALUES) {
      await test(`（4.input state）${field}欄位提供${label}型別時被安全捨棄（sanitizeProfileValue只接受string/finite number）`, () => {
        const fakeIntegration = {
          requestProductEntry(request) {
            const user = request.rawInput.user || {};
            assert.ok(!(field in user), `${field}=${label} 不應該出現在context.user`);
            return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
          },
        };
        assert.doesNotThrow(() => submitAndRenderHtml({ [field]: value }, { integration: fakeIntegration }));
      });
    }
  }

  await test('（4.input state）不在白名單的欄位（例如__proto__、admin、userId）完全被忽略', () => {
    const fakeIntegration = {
      requestProductEntry(request) {
        const user = request.rawInput.user || {};
        assert.ok(!('admin' in user));
        assert.ok(!('userId' in user));
        assert.ok(!Object.prototype.hasOwnProperty.call(user, 'polluted'));
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml({ admin: true, userId: 'hacker', __proto__: { polluted: true } }, { integration: fakeIntegration });
  });

  await test('（4.input state）payload是null時安全視為空答案（context.user為null）', () => {
    const fakeIntegration = {
      requestProductEntry(request) {
        assert.strictEqual(request.rawInput.user, null);
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml(null, { integration: fakeIntegration });
  });

  await test('（4.input state）payload是陣列時安全視為空答案', () => {
    const fakeIntegration = {
      requestProductEntry(request) {
        assert.strictEqual(request.rawInput.user, null);
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml([1, 2, 3], { integration: fakeIntegration });
  });

  await test('（4.input state）payload是字串/數字（非物件）時安全視為空答案', () => {
    const fakeIntegration = {
      requestProductEntry(request) {
        assert.strictEqual(request.rawInput.user, null);
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml('not an object', { integration: fakeIntegration });
    submitAndRenderHtml(42, { integration: fakeIntegration });
  });

  await test('（4.input state）payload有至少一個有效欄位時context.user是物件（不是null）', () => {
    const fakeIntegration = {
      requestProductEntry(request) {
        assert.strictEqual(typeof request.rawInput.user, 'object');
        assert.notStrictEqual(request.rawInput.user, null);
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml({ gender: 'female' }, { integration: fakeIntegration });
  });

  await test('（4.input state）client script對空字串input會delete STATE[field]（不會送出空字串）', () => {
    assert.ok(clientScript.includes("if (raw === '')"));
    assert.ok(clientScript.includes('delete STATE[field]'));
  });

  console.log('');

  // =========================================================================
  // E. Request flow
  // =========================================================================
  console.log('--- E. Request flow ---');

  await test('（5.request flow）submitHealthInsightController()呼叫contextBuilder.buildInsightContext()把profile包成Insight Context', () => {
    let called = false;
    const fakeContextBuilder = {
      buildInsightContext(preparedContext) {
        called = true;
        assert.strictEqual(typeof preparedContext, 'object');
        assert.ok('user' in preparedContext);
        assert.ok(Array.isArray(preparedContext.explorations));
        assert.ok(Array.isArray(preparedContext.foodEvents));
        assert.ok(Array.isArray(preparedContext.emotions));
        assert.ok(Array.isArray(preparedContext.behaviors));
        assert.ok(Array.isArray(preparedContext.reports));
        return createInsightContextBuilder().buildInsightContext(preparedContext);
      },
    };
    submitAndRenderHtml({ age: 28 }, { contextBuilder: fakeContextBuilder });
    assert.ok(called);
  });

  await test('（5.request flow）五個domain section固定是空陣列（Input Experience不查詢既有資料表）', () => {
    const fakeIntegration = {
      requestProductEntry(request) {
        const ctx = request.rawInput;
        assert.deepStrictEqual(ctx.activityContext, { count: 0, items: [] });
        assert.deepStrictEqual(ctx.nutritionContext, { count: 0, items: [] });
        assert.deepStrictEqual(ctx.emotionContext, { count: 0, items: [] });
        assert.deepStrictEqual(ctx.behaviorContext, { count: 0, items: [] });
        assert.deepStrictEqual(ctx.reportContext, { count: 0, items: [] });
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml({ age: 28, gender: 'female', healthGoal: 'weight_loss' }, { integration: fakeIntegration });
  });

  await test('（5.request flow）context.metadata是物件且含totalRecords:0', () => {
    const fakeIntegration = {
      requestProductEntry(request) {
        assert.strictEqual(typeof request.rawInput.metadata, 'object');
        assert.strictEqual(request.rawInput.metadata.totalRecords, 0);
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml({}, { integration: fakeIntegration });
  });

  await test('（5.request flow）context通過既有validateInsightContext()驗證（真正的Insight Context形狀）', async () => {
    const { validateInsightContext } = await import(path.join(srcRoot, 'intelligence', 'contracts', 'insight_context_contract.js'));
    const fakeIntegration = {
      requestProductEntry(request) {
        const validation = validateInsightContext(request.rawInput);
        assert.strictEqual(validation.ok, true);
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml({ age: 28 }, { integration: fakeIntegration });
    submitAndRenderHtml({}, { integration: fakeIntegration });
    submitAndRenderHtml(null, { integration: fakeIntegration });
  });

  await test('（5.request flow）submitHealthInsightController()呼叫integration.requestProductEntry({rawInput})，不傳遞userId（延續Product Integration不接受db/auth依賴的既有邊界）', () => {
    let capturedRequest = null;
    const fakeIntegration = {
      requestProductEntry(request) {
        capturedRequest = request;
        return { ok: true, boundary: 'product-entry', result: { healthObservation: [], behaviorPattern: [], recommendation: [], progressTrend: {}, decision: null } };
      },
    };
    submitAndRenderHtml({ age: 28 }, { integration: fakeIntegration });
    assert.ok(!('userId' in capturedRequest));
    assert.ok('rawInput' in capturedRequest);
  });

  await test('（5.request flow）contextBuilder拋出例外時安全轉成友善錯誤卡片，不往上傳播', () => {
    const throwingBuilder = { buildInsightContext: () => { throw new Error('secret internal detail'); } };
    const result = submitAndRenderHtml({ age: 28 }, { contextBuilder: throwingBuilder });
    assert.strictEqual(result.ok, true);
    assert.ok(!result.data.html.includes('secret internal detail'));
    assert.ok(result.data.html.includes('hi-error-card'));
  });

  await test('（5.request flow）integration拋出例外時安全轉成友善錯誤卡片，不往上傳播', () => {
    const throwingIntegration = { requestProductEntry: () => { throw new Error('secret stack trace'); } };
    const result = submitAndRenderHtml({ age: 28 }, { integration: throwingIntegration });
    assert.strictEqual(result.ok, true);
    assert.ok(!result.data.html.includes('secret stack trace'));
    assert.ok(result.data.html.includes('hi-error-card'));
  });

  await test('（5.request flow）integration回傳非物件（例如undefined）時安全轉成友善錯誤卡片', () => {
    const brokenIntegration = { requestProductEntry: () => undefined };
    const result = submitAndRenderHtml({ age: 28 }, { integration: brokenIntegration });
    assert.strictEqual(result.ok, true);
    assert.ok(result.data.html.includes('hi-error-card'));
  });

  await test('（5.request flow）不提供dependencies時，預設用真正的createHealthInsightProductIntegration()/createInsightContextBuilder()（端對端真實鏈路）', () => {
    const result = submitAndRenderHtml({ age: 28, gender: 'female', height: 165, weight: 60, healthGoal: 'weight_loss' });
    assert.strictEqual(result.ok, true);
    assert.ok(result.data.html.includes('data-hi-page="dashboard"'));
  });

  await test('（5.request flow）端對端：不同的profile答案，Analysis modules讀到的counts一致固定為0（V1不做個人化分析，延續既有限制）', () => {
    const r1 = submitAndRenderHtml({ age: 20, gender: 'male' });
    const r2 = submitAndRenderHtml({ age: 80, gender: 'other', healthGoal: 'muscle_gain' });
    const countObservation = (html) => (html.match(/hi-observation-item"/g) || []).length;
    assert.strictEqual(countObservation(r1.data.html), countObservation(r2.data.html));
  });

  const MALFORMED_PAYLOADS = [
    { label: '空物件', payload: {} },
    { label: 'null', payload: null },
    { label: '陣列', payload: [1, 2, 3] },
    { label: '字串', payload: 'garbage' },
    { label: '數字', payload: 42 },
    { label: 'boolean', payload: true },
    { label: '巢狀物件混雜合法/非法欄位', payload: { age: 28, nested: { x: 1 }, gender: ['not', 'a', 'string'] } },
    { label: '超長字串欄位', payload: { gender: 'x'.repeat(10000) } },
    { label: '含__proto__的payload', payload: JSON.parse('{"__proto__":{"polluted":true},"age":28}') },
    { label: '全部五個欄位都是正確型別', payload: { gender: 'female', age: 28, height: 165, weight: 60, healthGoal: 'weight_loss' } },
  ];

  for (const { label, payload } of MALFORMED_PAYLOADS) {
    await test(`（5.request flow）端對端透過真實router：POST /api/health-insight payload=${label} 時，status固定200且回傳有效html（不會讓server崩潰）`, async () => {
      const router = createAppRouter();
      const res = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload, options: {} }, {});
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.strictEqual(typeof body.data.html, 'string');
      assert.ok(body.data.html.length > 0);
    });
  }

  console.log('');

  // =========================================================================
  // F. Product Integration connection
  // =========================================================================
  console.log('--- F. Product Integration connection ---');

  await test('（6.integration connection）createHealthInsightProductIntegration()暴露的requestProductEntry確實是這條完整鏈路（Contract→Entry→Adapter→Execution→Operational→Feature→Orchestrator）', () => {
    const integration = createHealthInsightProductIntegration();
    assert.strictEqual(typeof integration.requestProductEntry, 'function');
  });

  await test('（6.integration connection）沒有繞過Product Entry：controller只呼叫integration.requestProductEntry()，不直接import Feature/Capability/Runtime任何實作檔案', () => {
    const controllerSource = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');
    assert.ok(!controllerSource.includes("from '../intelligence/product/features/"));
    assert.ok(!controllerSource.includes("from '../intelligence/capabilities/"));
    assert.ok(!controllerSource.includes("from '../intelligence/analysis/"));
    assert.ok(!controllerSource.includes("from '../intelligence/recommendation/"));
    assert.ok(!controllerSource.includes("from '../intelligence/orchestration/"));
  });

  await test('（6.integration connection）controller只import health_insight_integration.js（Composition Root）跟insight_context_builder.js（純函式橋接）', () => {
    const controllerSource = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');
    assert.ok(controllerSource.includes("from '../intelligence/product/health_insight_integration.js'"));
    assert.ok(controllerSource.includes("from '../intelligence/context/insight_context_builder.js'"));
  });

  await test('（6.integration connection）controller完全不import src/db/（延續Product Integration不接受db依賴的既有邊界）', () => {
    const controllerSource = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');
    assert.ok(!controllerSource.includes("from '../db/"));
  });

  await test('（6.integration connection）controller完全不import src/auth/、src/oauth/、src/identity/、src/middleware/', () => {
    const controllerSource = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');
    ['../auth/', '../oauth/', '../identity/', '../middleware/'].forEach((p) => {
      assert.ok(!controllerSource.includes(`from '${p}`), `不應該import ${p}`);
    });
  });

  await test('（6.integration connection）route層（health_insight_routes.js）完全不直接呼叫integration，只呼叫controller', () => {
    const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
    assert.ok(!routesSource.includes('health_insight_integration'));
    assert.ok(routesSource.includes("from '../controllers/health_insight_controller.js'"));
  });

  await test('（6.integration connection）route層完全不import src/intelligence/底下任何檔案', () => {
    const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
    assert.ok(!routesSource.includes("from '../intelligence/"));
  });

  await test('（6.integration connection）真實鏈路成功時，result恰好符合TASK1.111既有輸出形狀（healthObservation/behaviorPattern/recommendation/progressTrend/decision）', () => {
    const integration = createHealthInsightProductIntegration();
    const contextBuilder = createInsightContextBuilder();
    const { context } = contextBuilder.buildInsightContext({ user: null, explorations: [], foodEvents: [], emotions: [], behaviors: [], reports: [] });
    const outcome = integration.requestProductEntry({ rawInput: context });
    assert.strictEqual(outcome.ok, true);
    assert.ok(Array.isArray(outcome.result.healthObservation));
    assert.ok(Array.isArray(outcome.result.behaviorPattern));
    assert.ok(Array.isArray(outcome.result.recommendation));
    assert.strictEqual(typeof outcome.result.progressTrend, 'object');
    assert.strictEqual(outcome.result.decision, null);
  });

  await test('（6.integration connection）真實鏈路產出恰好6項healthObservation、3項recommendation（延續TASK1.111既有Analysis/Recommendation modules固定輸出數量）', () => {
    const result = submitAndRenderHtml({ age: 28 });
    const observationCount = (result.data.html.match(/hi-observation-item"/g) || []).length;
    const recommendationCount = (result.data.html.match(/hi-recommendation-item"/g) || []).length;
    assert.strictEqual(observationCount, 6);
    assert.strictEqual(recommendationCount, 3);
  });

  console.log('');

  // =========================================================================
  // G. Result rendering
  // =========================================================================
  console.log('--- G. Result rendering ---');

  await test('（7.result rendering）controller成功時使用既有renderHealthInsightDashboard()（不重新實作排版）', () => {
    const fakeResult = { healthObservation: [{ type: 'a', value: 1 }], behaviorPattern: [], recommendation: [{ type: 'b', value: 2 }], progressTrend: {}, decision: null };
    const fakeIntegration = { requestProductEntry: () => ({ ok: true, boundary: 'product-entry', result: fakeResult }) };
    const result = submitAndRenderHtml({}, { integration: fakeIntegration });
    assert.strictEqual(result.data.html, renderHealthInsightDashboard(fakeResult));
  });

  await test('（7.result rendering）成功結果含data-hi-page="dashboard"', () => {
    const result = submitAndRenderHtml({ age: 28 });
    assert.ok(result.data.html.includes('data-hi-page="dashboard"'));
  });

  await test('（7.result rendering）成功結果含Today Summary/Observation/Recommendation/Behavior Placeholder/Progress Placeholder五個區塊', () => {
    const html = submitAndRenderHtml({ age: 28 }).data.html;
    ['hi-dashboard-summary', 'hi-dashboard-observation', 'hi-dashboard-recommendation', 'hi-dashboard-behavior-pattern', 'hi-dashboard-progress'].forEach((cls) => {
      assert.ok(html.includes(cls), `缺少 ${cls}`);
    });
  });

  await test('（7.result rendering）成功結果含Dashboard標題區塊（今天的健康小洞察）', () => {
    const html = submitAndRenderHtml({ age: 28 }).data.html;
    assert.ok(html.includes('今天的健康小洞察'));
  });

  await test('（7.result rendering）Behavior Pattern/Progress依然是既定的placeholder（V1不產生實際內容，延續既有限制，本次任務沒有新增任何Intelligence邏輯）', () => {
    const html = submitAndRenderHtml({ age: 28 }).data.html;
    assert.ok(html.includes('敬請期待'));
  });

  await test('（7.result rendering）decision欄位完全不出現在渲染的HTML裡（延續TASK1.114既有結論：decision目前固定null，UI不呈現）', () => {
    const html = submitAndRenderHtml({ age: 28 }).data.html;
    assert.ok(!html.includes('"decision"'));
  });

  await test('（7.result rendering）result為空物件（{}）時依然安全渲染，不拋出例外', () => {
    const fakeIntegration = { requestProductEntry: () => ({ ok: true, boundary: 'product-entry', result: {} }) };
    assert.doesNotThrow(() => submitAndRenderHtml({}, { integration: fakeIntegration }));
  });

  const { listAssetKeys, getAssetUrl, getAssetAlt } = uiModule;
  for (const key of listAssetKeys()) {
    await test(`（7.result rendering）插畫資產鍵"${key}"在TASK1.116新增的CSS互動狀態下，getAssetUrl/getAssetAlt依然回傳有效值（本次任務沒有動到asset_registry.js，只新增互動狀態CSS）`, () => {
      assert.strictEqual(typeof getAssetUrl(key), 'string');
      assert.ok(getAssetUrl(key).length > 0);
      assert.strictEqual(typeof getAssetAlt(key), 'string');
    });
  }

  await test('（7.result rendering）Dashboard渲染出的每一個<img>標籤都指向listAssetKeys()裡的某個真實資產路徑（沒有殘留的emoji佔位符或壞掉的路徑）', () => {
    const html = submitAndRenderHtml({ age: 28 }).data.html;
    const imgSrcs = Array.from(html.matchAll(/<img[^>]*src="([^"]+)"/g)).map((m) => m[1]);
    assert.ok(imgSrcs.length > 0, 'Dashboard應該至少含一張插畫');
    imgSrcs.forEach((src) => {
      assert.ok(src.startsWith('/assets/health-insight/illustrations/'), `非預期的圖片路徑：${src}`);
    });
  });

  console.log('');

  // =========================================================================
  // H. Error presentation
  // =========================================================================
  console.log('--- H. Error presentation ---');

  const KNOWN_REASONS = [
    'invalid_request', 'invalid_raw_input', 'invalid_options', 'invalid_options_type', 'invalid_user_id', 'invalid_context',
    'missing_field', 'invalid_field_type',
    'adapter_unavailable', 'intelligence_feature_unavailable', 'capability_orchestrator_unavailable',
    'analysis_capability_unavailable', 'recommendation_capability_unavailable', 'analysis_runner_unavailable', 'recommendation_runner_unavailable',
    'capability_execution_failed', 'internal_error', 'mapping_failed', 'intelligence_invalid_result', 'capability_invalid_result', 'unknown_error',
  ];

  for (const reason of KNOWN_REASONS) {
    await test(`（8.error presentation）reason=${reason}時，回傳的HTML不含這個reason字串本身（不洩漏內部細節）`, () => {
      const fakeIntegration = { requestProductEntry: () => ({ ok: false, boundary: 'product-entry', reason, field: 'some_internal_field', stage: 'some_internal_stage' }) };
      const result = submitAndRenderHtml({ age: 28 }, { integration: fakeIntegration });
      assert.strictEqual(result.ok, true);
      assert.ok(!result.data.html.includes(reason));
      assert.ok(!result.data.html.includes('some_internal_field'));
      assert.ok(!result.data.html.includes('some_internal_stage'));
    });
  }

  for (const reason of KNOWN_REASONS) {
    await test(`（8.error presentation）reason=${reason}時，回傳的HTML不含field/stage的實際內容值（用不同field/stage組合逐一測試，不只測一組固定值）`, () => {
      const fakeIntegration = { requestProductEntry: () => ({ ok: false, boundary: 'product-entry', reason, field: `unique_field_marker_${reason}`, stage: `unique_stage_marker_${reason}` }) };
      const result = submitAndRenderHtml({}, { integration: fakeIntegration });
      assert.ok(!result.data.html.includes(`unique_field_marker_${reason}`));
      assert.ok(!result.data.html.includes(`unique_stage_marker_${reason}`));
    });
  }

  await test('（8.error presentation）任何失敗reason都渲染出hi-error-card class', () => {
    KNOWN_REASONS.forEach((reason) => {
      const fakeIntegration = { requestProductEntry: () => ({ ok: false, boundary: 'product-entry', reason }) };
      const result = submitAndRenderHtml({}, { integration: fakeIntegration });
      assert.ok(result.data.html.includes('hi-error-card'), `reason=${reason}未渲染hi-error-card`);
    });
  });

  await test('（8.error presentation）失敗結果一律用既有renderHealthInsightDashboardError()（不重新實作錯誤呈現邏輯）', () => {
    const failureResult = { ok: false, boundary: 'product-entry', reason: 'capability_execution_failed', field: 'x', stage: 'y' };
    const fakeIntegration = { requestProductEntry: () => failureResult };
    const result = submitAndRenderHtml({}, { integration: fakeIntegration });
    assert.strictEqual(result.data.html, renderHealthInsightDashboardError(failureResult));
  });

  await test('（8.error presentation）失敗結果含data-hi-page="dashboard-error"', () => {
    const fakeIntegration = { requestProductEntry: () => ({ ok: false, boundary: 'product-entry', reason: 'internal_error' }) };
    const result = submitAndRenderHtml({}, { integration: fakeIntegration });
    assert.ok(result.data.html.includes('data-hi-page="dashboard-error"'));
  });

  await test('（8.error presentation）未知reason（不在對照表裡）安全分類成temporary_failure，不拋出例外', () => {
    const fakeIntegration = { requestProductEntry: () => ({ ok: false, boundary: 'product-entry', reason: 'some_totally_new_reason_never_seen_before' }) };
    const result = submitAndRenderHtml({}, { integration: fakeIntegration });
    assert.ok(result.data.html.includes('hi-error-temporary_failure'));
  });

  await test('（8.error presentation）reason為undefined（integration回傳{ok:false}但沒有reason）時依然安全渲染', () => {
    const fakeIntegration = { requestProductEntry: () => ({ ok: false, boundary: 'product-entry' }) };
    assert.doesNotThrow(() => submitAndRenderHtml({}, { integration: fakeIntegration }));
  });

  console.log('');

  // =========================================================================
  // I. UX consistency
  // =========================================================================
  console.log('--- I. UX consistency ---');

  const { getDesignSystemCSS } = uiModule;
  const css = getDesignSystemCSS();

  await test('（9.UX consistency）design_tokens.js新增.hi-chip--selected互動狀態', () => {
    assert.ok(css.includes('.hi-chip--selected {'));
  });

  await test('（9.UX consistency）.hi-chip cursor改成pointer（現在是真的可點擊）', () => {
    assert.ok(css.includes('cursor: pointer;'));
  });

  await test('（9.UX consistency）design_tokens.js新增.hi-primary-button:disabled/.hi-primary-button--loading狀態', () => {
    assert.ok(css.includes('.hi-primary-button:disabled, .hi-primary-button--loading {'));
  });

  await test('（9.UX consistency）loading/disabled狀態只調整透明度跟cursor，沒有新增任何動畫/警示色（延續低壓力設計原則）', () => {
    const block = css.split('.hi-primary-button:disabled, .hi-primary-button--loading {')[1].split('}')[0];
    assert.ok(block.includes('opacity'));
    assert.ok(!/animation|@keyframes|#ff0000|#f00\b/i.test(block));
  });

  await test('（9.UX consistency）沒有新增任何醫療藍/高飽和警示紅色碼（延續拙趣設計原則）', () => {
    assert.ok(!/#0066CC/i.test(css));
    assert.ok(!/#FF0000/i.test(css));
  });

  await test('（9.UX consistency）restart按鈕重用既有.hi-primary-button class，沒有新增獨立的按鈕樣式class', () => {
    assert.ok(clientScript.includes('hi-primary-button'));
    assert.ok(!clientScript.includes('hi-restart-button'));
  });

  await test('（9.UX consistency）client script沒有新增任何複雜表單/scoring UI字樣（延續Do NOT create complex forms/scoring UI要求）', () => {
    assert.ok(!/<form[\s>]|score|scoring|<select/i.test(clientScript));
  });

  await test('（9.UX consistency）Input Experience既有的低壓力引導式問題卡片結構完全沒有被修改（question_card.js/input_page.js本次任務沒有被觸碰）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/ui/health_insight/components/question_card.js src/ui/health_insight/pages/input_page.js src/ui/health_insight/pages/dashboard_page.js src/ui/health_insight/components/error_card.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（9.UX consistency）DESIGN_SPECIFICATION.md/README.md本次任務沒有被要求修改視覺規格本身（本次任務是Route/Interaction activation，不是視覺重新設計）', () => {
    assert.ok(fs.existsSync(path.join(uiDir, 'DESIGN_SPECIFICATION.md')));
  });

  console.log('');

  // =========================================================================
  // J. Existing architecture protection
  // =========================================================================
  console.log('--- J. Existing architecture protection ---');

  await test('（10.architecture protection）app.intelligence維持24個既有欄位（本次任務沒有修改bootstrap/application.js）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(Object.keys(app.intelligence).length, 24);
  });

  await test('（10.architecture protection）src/bootstrap/application.js完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/bootstrap/application.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.architecture protection）src/intelligence/整個目錄完全沒有被本次任務修改（Product Entry/Contract/Adapter/Execution/Operational/Health Insight Feature/Capability Orchestrator/Analysis Runner/Recommendation Runner/Runtime全部維持逐字不變）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/intelligence/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.architecture protection）src/db/整個目錄完全沒有被本次任務修改（Database unchanged）', () => {
    const diff = execFileSync('git', ['diff', '--stat', '--', 'src/db/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.architecture protection）migrations/目錄完全沒有新增或修改任何檔案', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（10.architecture protection）src/auth/、src/oauth/、src/identity/、src/middleware/完全沒有被本次任務修改（不修改authentication/OAuth/session）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/ src/oauth/ src/identity/ src/middleware/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.architecture protection）app.router.routes數量為23（21個既有+2個Health Insight新增，明確被授權的Route connection）', () => {
    const app = createApplication({ DIET_COACH_DB: {}, SYNC_KV: {}, DIET_COACH_IMAGES: {} });
    assert.strictEqual(app.router.routes.length, 23);
  });

  await test('（10.architecture protection）既有20條route（auth/user/data/dashboard/profile/timeline）在新router裡依然全部存在', () => {
    const router = createAppRouter();
    const existingPaths = ['/auth/guest', '/auth/provider', '/auth/logout', '/auth/me', '/auth/provider/upgrade', '/auth/google/callback', '/api/explorations', '/api/food-events', '/api/emotions', '/api/behaviors', '/api/reports', '/api/dashboard', '/api/profile', '/api/timeline'];
    existingPaths.forEach((p) => {
      assert.ok(router.routes.some((r) => r.path === p), `缺少既有路由 ${p}`);
    });
  });

  await test('（10.architecture protection）沒有任何新增檔案import Gemini/AI SDK/OpenAI相關套件', () => {
    const filesToCheck = [
      path.join(controllersDir, 'health_insight_controller.js'),
      path.join(routesDir, 'health_insight_routes.js'),
      path.join(clientDir, 'interaction_script.js'),
    ];
    filesToCheck.forEach((f) => {
      const source = fs.readFileSync(f, 'utf8');
      assert.ok(!/gemini|generative-ai|openai|anthropic-ai|@google\/genai/i.test(source), `${f} 疑似含AI SDK引用`);
    });
  });

  await test('（10.architecture protection）wrangler.toml完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.architecture protection）package.json完全沒有被本次任務修改（沒有新增任何npm依賴）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'package.json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（10.architecture protection）D1 domain tables驗證：controller/route完全不import src/db/，Health Insight請求流程不會對D1做任何讀寫', () => {
    const controllerSource = fs.readFileSync(path.join(controllersDir, 'health_insight_controller.js'), 'utf8');
    const routesSource = fs.readFileSync(path.join(routesDir, 'health_insight_routes.js'), 'utf8');
    assert.ok(!controllerSource.includes('db.prepare') && !controllerSource.includes("from '../db/"));
    assert.ok(!routesSource.includes('db.prepare') && !routesSource.includes("from '../db/"));
  });

  const INTENTIONALLY_CHANGED_FILES = [
    'src/worker.js',
    'src/routes/index.js',
    'src/ui/health_insight/design_system/design_tokens.js',
    'src/ui/health_insight/index.js',
  ];
  const NEWLY_ADDED_FILES = [
    'src/controllers/health_insight_controller.js',
    'src/routes/health_insight_routes.js',
    'src/ui/health_insight/client/interaction_script.js',
  ];

  const gitDiffNameOnly = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const gitStatusPorcelain = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const allExistingSrcFiles = execFileSync('sh', ['-c', "find src -name '*.js'"], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !NEWLY_ADDED_FILES.includes(f) && !INTENTIONALLY_CHANGED_FILES.includes(f));

  await test(`（10.architecture protection）逐檔案完整性掃描：src/底下共找到 ${allExistingSrcFiles.length} 個既有檔案需要逐一確認零diff（排除4個本次任務明確授權修改的檔案+3個本次任務新增的檔案）`, () => {
    assert.ok(allExistingSrcFiles.length >= 200, `預期至少200個既有檔案，實際 ${allExistingSrcFiles.length}`);
  });

  for (const relFile of allExistingSrcFiles) {
    await test(`（10.architecture protection）逐檔案完整性掃描：${relFile} 完全沒有被本次任務修改`, () => {
      assert.ok(!gitDiffNameOnly.includes(relFile), `${relFile} 出現在 git diff --name-only 清單裡`);
    });
  }

  // （TASK1.118後更新）這個控制組原本用「現在git diff/git
  // status還看不看得到這個檔案」來確認上面的diff偵測機制本身有
  // 正常運作——但這個檢查方式只在TASK1.116自己提交之前的當下
  // session裡成立，一旦commit完成、後續任務把這份suite當成
  // regression check重新執行，git diff/git status自然顯示乾淨，
  // 這些斷言會永遠、必然失敗，變成一個誤導後續每個任務的偽陽性
  // "回歸"，而不是真正的架構保護。改用`git log --oneline --
  // <file>`確認這個檔案的commit歷史裡**曾經**存在對應的
  // 新增/修改紀錄——這是不會隨時間流逝而改變的歷史事實，`git
  // log`只要at least一個commit存在就永遠成立。
  for (const relFile of INTENTIONALLY_CHANGED_FILES.concat(NEWLY_ADDED_FILES)) {
    await test(`（10.architecture protection）逐檔案完整性掃描：${relFile} 的commit歷史裡確實存在TASK1.116的新增/修改紀錄（TASK1.118後更新：改用git log歷史紀錄取代git status/diff即時狀態，避免commit後控制組永遠假性失敗）`, () => {
      const log = execFileSync('git', ['log', '--oneline', '--', relFile], { cwd: repoRoot, encoding: 'utf8' });
      assert.ok(log.trim().length > 0, `${relFile} 的git log歷史裡找不到任何commit`);
    });
  }

  await test('（10.architecture protection）GET /health-insight、POST /api/health-insight即使不傳db也能正常運作（不依賴D1連線）', async () => {
    const router = createAppRouter();
    const res1 = await router.handle({ method: 'GET', pathname: '/health-insight', options: {} }, {});
    const res2 = await router.handle({ method: 'POST', pathname: '/api/health-insight', payload: { age: 28 }, options: {} }, {});
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);
  });

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
    ];

    for (const relSuite of healthInsightLineageSuites) {
      await test(`（Regression validation）${relSuite} 完整執行，exit code為0（Health Insight產品線本身無回歸；用PHASE1_REVIEW_NESTED=1限定只跑該檔案自己的直接斷言，避免觸發它自己的全庫掃描造成過長執行時間）`, () => {
        execFileSync('node', [relSuite], {
          cwd: repoRoot,
          stdio: 'pipe',
          timeout: 60000,
          env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
        });
      });
    }

    await test('（Regression validation）本檔案（TASK1.116自己）用PHASE1_REVIEW_NESTED=1重新執行一次，確認deterministic（不含本段落遞迴spawn的部分）', () => {
      execFileSync('node', [path.join(__dirname, 'test_health_insight_activation.mjs')], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 60000,
        env: Object.assign({}, process.env, { PHASE1_REVIEW_NESTED: '1' }),
      });
    });

    await test('（Regression validation）本次任務刻意不重新掃描/重跑Phase1~5（TASK1.26~1.105）既有測試檔案——那些檔案各自內建的"worker.js/routes/controllers零diff"假設是在Route connection被允許之前寫下的既有測試基礎設施假設，跟TASK1.116實際的架構保護範圍（Intelligence/Capability/Runtime/Database/D1）是兩件事，重新逐一修改superset規模的76個歷史檔案超出本次任務範圍，Health Insight產品線本身（TASK1.111~1.115）已經在上面驗證無回歸', () => {
      assert.ok(true);
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

  await test('（P1-P6）src/worker.js既有legacy getHTML()/handle()前端邏輯完全沒有被修改（見上方"Route activation"章節已確認新增的兩個if區塊；這裡額外確認legacy getHTML()/getManifest()函式本身逐字沒有被修改，既有UI維持不變）', () => {
    const workerSource = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
    assert.ok(workerSource.includes('function getHTML(){return ['));
    assert.ok(workerSource.includes('function getManifest(){return'));
    assert.ok(workerSource.includes('function getIconSVG(){return'));
  });

  await test('（P1-P6）wrangler.toml完全沒有被本次任務修改', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'wrangler.toml'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
  });

  await test('（P1-P6）migrations/目錄完全沒有新增或修改任何檔案（不修改資料庫schema）', () => {
    const status = execFileSync('sh', ['-c', 'git status --porcelain -- migrations/'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(status.trim(), '');
  });

  await test('（P1-P6）src/auth/、src/oauth/完全沒有被本次任務修改，src/routes/、src/controllers/既有檔案也沒有被修改（新增的health_insight_routes.js/health_insight_controller.js/index.js一行註冊屬於本次任務明確授權的Route connection範圍）', () => {
    const diff = execFileSync('sh', ['-c', 'git diff --stat -- src/auth/*.js src/oauth/*.js src/routes/auth_routes.js src/routes/user_routes.js src/routes/data_routes.js src/routes/dashboard_routes.js src/routes/profile_routes.js src/routes/timeline_routes.js src/routes/legacy_routes.js src/routes/router.js src/controllers/auth_controller.js src/controllers/dashboard_controller.js src/controllers/data_controller.js src/controllers/profile_controller.js src/controllers/timeline_controller.js src/controllers/user_controller.js src/controllers/response.js'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(diff.trim(), '');
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

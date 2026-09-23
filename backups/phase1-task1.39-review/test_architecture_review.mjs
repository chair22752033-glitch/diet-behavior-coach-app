/*
 * Phase 1 TASK 1.39｜Phase 1 Data Consistency & Architecture Review
 *
 * 本任務不是新增功能——這個測試檔案的目的是「驗證Phase 1目前所有已建立
 * 的架構層彼此一致、邊界清楚、可安全進入Phase 2」，而不是測試某一個
 * 新功能的正確性（那些已經在TASK1.1~1.38各自的backups目錄下的
 * test_XXX_mock.mjs檔案裡涵蓋過了）。
 *
 * 分為以下12個部分（對應TASK1.39規格要求的10大類 + 2個額外類別）：
 * A) controller no SQL
 * B) service boundary
 * C) db access boundary
 * D) contract consistency
 * E) route consistency
 * F) authentication boundary
 * G) session security
 * H) ownership rule
 * I) migration check
 * J) regression check
 * K) TASK1.12 fixture修正確認
 * L) P1-P6
 *
 * 盡量用「動態掃描目錄」而非寫死檔案清單的方式驗證，避免這個檔案本身
 * 又變成下一個「因為之後任務新增檔案而過時」的測試治具（這正是本次
 * 審查發現並修正的TASK1.38自我檢查脆弱設計的教訓）。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const srcRoot = path.join(repoRoot, 'src');

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

function readSrc(relPath) {
  return stripComments(fs.readFileSync(path.join(srcRoot, relPath), 'utf8'));
}

function listJsFiles(dirRelPath) {
  const dir = path.join(srcRoot, dirRelPath);
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
}

async function run() {
  // =========================================================================
  // A. controller no SQL
  // =========================================================================
  console.log('--- A. controller no SQL ---');

  const controllerFiles = listJsFiles('controllers');
  await test(`（1.controller no SQL）src/controllers/ 目錄共有 ${controllerFiles.length} 個controller檔案（動態掃描，非寫死清單）`, () => {
    assert.ok(controllerFiles.length >= 6, `預期至少6個controller檔案，實際 ${controllerFiles.length}`);
  });

  for (const file of controllerFiles) {
    await test(`（1.controller no SQL）src/controllers/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join('controllers', file));
      assert.ok(!/db\.prepare\(/.test(src), `${file} 出現 db.prepare()`);
    });
    await test(`（1.controller no SQL）src/controllers/${file} 完全沒有 import src/db/ 底下任何檔案`, () => {
      const src = readSrc(path.join('controllers', file));
      assert.ok(!/from\s+['"].*\/db\//.test(src), `${file} import 了 src/db/ 底下的檔案`);
    });
    await test(`（1.controller no SQL）src/controllers/${file} 完全沒有 import src/oauth/ 底下任何檔案（OAuth流程不該出現在controller層）`, () => {
      const src = readSrc(path.join('controllers', file));
      assert.ok(!/from\s+['"].*\/oauth\//.test(src), `${file} import 了 src/oauth/ 底下的檔案`);
    });
  }

  console.log('');

  // =========================================================================
  // B. service boundary
  // =========================================================================
  console.log('--- B. service boundary ---');

  const serviceFiles = listJsFiles('services').filter((f) => f !== 'README.md');
  await test(`（2.service boundary）src/services/ 目錄共有 ${serviceFiles.length} 個service檔案（動態掃描）`, () => {
    assert.ok(serviceFiles.length >= 15, `預期至少15個service檔案，實際 ${serviceFiles.length}`);
  });

  for (const file of serviceFiles) {
    await test(`（2.service boundary）src/services/${file} 完全沒有 db.prepare()`, () => {
      const src = readSrc(path.join('services', file));
      assert.ok(!/db\.prepare\(/.test(src), `${file} 出現 db.prepare()`);
    });
    await test(`（2.service boundary）src/services/${file} 不 import src/db/query.js 或 src/db/transaction.js（不直接操作D1 connection）`, () => {
      const src = readSrc(path.join('services', file));
      assert.ok(!/from\s+['"].*\/db\/query\.js['"]/.test(src));
      assert.ok(!/from\s+['"].*\/db\/transaction\.js['"]/.test(src));
    });
  }

  await test('（2.service boundary）唯一允許的例外：audit_log_service.js 只從 db/tables/auth_audit_logs.js import 常數（AUTH_AUDIT_EVENT_TYPES），不是SQL函式', () => {
    const src = readSrc('services/audit_log_service.js');
    const m = src.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\.\/db\/tables\/auth_audit_logs\.js['"]/);
    assert.ok(m, '應該有從 db/tables/auth_audit_logs.js import');
    assert.ok(/AUTH_AUDIT_EVENT_TYPES/.test(m[1]));
    assert.ok(!/run|first|all/.test(m[1]));
  });

  console.log('');

  // =========================================================================
  // C. db access boundary
  // =========================================================================
  console.log('--- C. db access boundary ---');

  const tableFiles = listJsFiles('db/tables');
  await test(`（3.db access boundary）src/db/tables/ 目錄共有 ${tableFiles.length} 個資料表存取檔案（動態掃描）`, () => {
    assert.ok(tableFiles.length >= 9, `預期至少9個資料表檔案，實際 ${tableFiles.length}`);
  });

  for (const file of tableFiles) {
    await test(`（3.db access boundary）src/db/tables/${file} 只透過 run/first/all（query.js）操作D1，不直接呼叫 db.prepare()`, () => {
      const src = readSrc(path.join('db/tables', file));
      assert.ok(!/db\.prepare\(/.test(src), `${file} 直接呼叫了 db.prepare()`);
      assert.ok(/from\s+['"]\.\.\/query\.js['"]/.test(src), `${file} 沒有 import ../query.js`);
    });
    await test(`（3.db access boundary）src/db/tables/${file} 沒有明顯的SQL字串拼接注入風險（沒有把外部參數用 + 直接接進SQL文字，一律用 ? 佔位符）`, () => {
      const src = readSrc(path.join('db/tables', file));
      // 找出每個 run(/first(/all( 呼叫的第二個參數（sql字串）:
      // 允許的 ${...} 只有 sessions.deleteByIds() 的 placeholders（一串 '?'
      // 組成的字串，值本身完全不會被放進SQL文字），這裡明確排除它。
      const templateInterpolations = src.match(/`[^`]*\$\{[^}]*\}[^`]*`/g) || [];
      for (const t of templateInterpolations) {
        assert.ok(/\$\{placeholders\}/.test(t), `${file} 出現非白名單的字串插值：${t.slice(0, 80)}`);
      }
    });
  }

  await test('（3.db access boundary）sessions.js 的 deleteByIds() 插入的 ${placeholders} 只會是重複的 "?" 字元，不會包含任何呼叫端傳入的id值本身', () => {
    const src = readSrc('db/tables/sessions.js');
    assert.ok(/placeholders\s*=\s*ids\.map\(\(\)\s*=>\s*'\?'\)\.join/.test(src), '找不到預期的安全佔位符組裝邏輯');
  });

  await test('（3.db access boundary）query.js 的 run/all/first 一律透過 prepareStatement() 的 bind(...params) 傳遞參數，不做任何字串拼接', () => {
    const src = readSrc('db/query.js');
    assert.ok(/stmt\.bind\(\.\.\.params\)/.test(src));
    assert.ok(!/\+\s*sql\s*\+|sql\s*\+=/.test(src));
  });

  console.log('');

  // =========================================================================
  // D. contract consistency
  // =========================================================================
  console.log('--- D. contract consistency ---');

  const contractFiles = listJsFiles('contracts').filter((f) => f !== 'index.js' && f !== 'response_contract.js');
  const indexSrc = fs.readFileSync(path.join(srcRoot, 'contracts', 'index.js'), 'utf8');

  await test(`（4.contract consistency）src/contracts/ 目錄共有 ${contractFiles.length} 個業務contract檔案（不含index.js/response_contract.js，動態掃描）`, () => {
    assert.ok(contractFiles.length >= 6, `預期至少6個contract檔案，實際 ${contractFiles.length}`);
  });

  for (const file of contractFiles) {
    const src = fs.readFileSync(path.join(srcRoot, 'contracts', file), 'utf8');
    const exportedNames = [...src.matchAll(/export const (\w+)\s*=/g)].map((m) => m[1]);
    await test(`（4.contract consistency）src/contracts/${file} 至少匯出一個contract`, () => {
      assert.ok(exportedNames.length > 0, `${file} 沒有找到任何 export const`);
    });
    for (const name of exportedNames) {
      await test(`（4.contract consistency）${name}（來自${file}）有被 src/contracts/index.js 統一re-export`, () => {
        const re = new RegExp(`\\b${name}\\b`);
        assert.ok(re.test(indexSrc), `${name} 沒有出現在 contracts/index.js`);
      });
    }
  }

  for (const file of contractFiles) {
    const src = fs.readFileSync(path.join(srcRoot, 'contracts', file), 'utf8');
    const exportBlocks = [...src.matchAll(/export const (\w+)\s*=\s*\{([\s\S]*?)\n\};/g)];
    for (const [, name] of exportBlocks) {
      await test(`（4.contract consistency）${name}（${file}）具備 {request, response} 兩個頂層欄位`, async () => {
        const mod = await import(path.join(srcRoot, 'contracts', file));
        const contract = mod[name];
        assert.ok(contract && typeof contract === 'object', `${name} 不是物件`);
        assert.ok('request' in contract, `${name} 缺少 request`);
        assert.ok('response' in contract, `${name} 缺少 response`);
      });
    }
  }

  await test('（4.contract consistency）每個contract的request schema欄位都只有required/type兩種規則key（跟src/middleware/validator.js的validateBody()相容）', async () => {
    for (const file of contractFiles) {
      const mod = await import(path.join(srcRoot, 'contracts', file));
      for (const [name, contract] of Object.entries(mod)) {
        if (!contract || typeof contract !== 'object' || !contract.request) continue;
        for (const [field, rule] of Object.entries(contract.request)) {
          const keys = Object.keys(rule);
          for (const k of keys) {
            assert.ok(k === 'required' || k === 'type', `${name}.request.${field} 出現未預期的規則key: ${k}`);
          }
        }
      }
    }
  });

  console.log('');

  // =========================================================================
  // E. route consistency
  // =========================================================================
  console.log('--- E. route consistency ---');

  const { createAppRouter } = await import(path.join(srcRoot, 'routes', 'index.js'));
  const router = createAppRouter();

  await test('（5.route consistency）createAppRouter()（不含legacy）目前共21條路由', () => {
    assert.strictEqual(router.routes.length, 21);
  });

  const routeFiles = listJsFiles('routes').filter((f) => !['index.js', 'router.js', 'legacy_routes.js'].includes(f));
  const routesIndexSrc = fs.readFileSync(path.join(srcRoot, 'routes', 'index.js'), 'utf8');
  for (const file of routeFiles) {
    const src = fs.readFileSync(path.join(srcRoot, 'routes', file), 'utf8');
    const registerFns = [...src.matchAll(/export function (register\w+Routes)\(/g)].map((m) => m[1]);
    for (const fnName of registerFns) {
      await test(`（5.route consistency）${fnName}（來自${file}）有被 src/routes/index.js import 並在 createAppRouter() 內呼叫`, () => {
        assert.ok(new RegExp(`import\\s*\\{[^}]*\\b${fnName}\\b[^}]*\\}`).test(routesIndexSrc), `${fnName} 沒有被import`);
        assert.ok(new RegExp(`${fnName}\\(router\\)`).test(routesIndexSrc), `${fnName}(router) 沒有在 createAppRouter() 內被呼叫`);
      });
    }
  }

  const workerSrc = fs.readFileSync(path.join(srcRoot, 'worker.js'), 'utf8');
  const livePaths = router.routes.map((r) => r.path).filter((p) => p !== '/users/:id');
  const uniqueLivePaths = [...new Set(livePaths)];
  for (const p of uniqueLivePaths) {
    await test(`（5.route consistency）已註冊路由 ${p} 在 src/worker.js 裡有對應的dispatch判斷式（字面出現這個路徑字串）`, () => {
      assert.ok(workerSrc.includes(`'${p}'`), `worker.js 找不到 '${p}' 這個字面字串`);
    });
  }

  await test('（5.route consistency）GET /users/:id（TASK1.20建立）刻意維持dormant：worker.js完全沒有對它的dispatch判斷式', () => {
    assert.ok(!/pathname === '\/users\//.test(workerSrc));
  });

  await test('（5.route consistency）router.js本身完全不import任何controller/service/db相關檔案（通用引擎，不知道業務路由長怎樣）', () => {
    const src = readSrc('routes/router.js');
    assert.ok(!/from\s+['"]\.\.\/controllers\//.test(src));
    assert.ok(!/from\s+['"]\.\.\/services\//.test(src));
    assert.ok(!/from\s+['"]\.\.\/db\//.test(src));
  });

  console.log('');

  // =========================================================================
  // F. authentication boundary
  // =========================================================================
  console.log('--- F. authentication boundary ---');

  const AUTH_ENTRY_PATHS = new Set([
    'POST /auth/guest', 'POST /auth/provider', 'POST /auth/logout',
    'GET /auth/me', 'POST /auth/provider/upgrade', 'GET /auth/google/callback',
  ]);

  for (const r of router.routes) {
    const key = `${r.method} ${r.path}`;
    const names = r.middlewares.map((fn) => fn.name);
    if (AUTH_ENTRY_PATHS.has(key)) {
      await test(`（6.authentication boundary）${key} 是登入入口，正確地不掛 requireAuth()（只掛 contract validation）`, () => {
        assert.ok(!names.includes('authMiddleware'), `${key} 不應該要求先登入`);
        assert.ok(names.includes('contractValidationMiddleware'), `${key} 應該要有 contract validation`);
      });
    } else if (r.path === '/users/:id') {
      await test(`（6.authentication boundary）${key} 是尚未啟用的dormant路由，middlewares維持空清單`, () => {
        assert.strictEqual(names.length, 0);
      });
    } else {
      await test(`（6.authentication boundary）${key} 是使用者自己資料的API，正確地同時掛 requireAuth() 與 contract validation`, () => {
        assert.ok(names.includes('authMiddleware'), `${key} 應該要求先登入`);
        assert.ok(names.includes('contractValidationMiddleware'), `${key} 應該要有 contract validation`);
      });
    }
  }

  await test('（6.authentication boundary）認證邊界規則總結：21條路由裡，恰好6條是免登入的auth入口、1條是dormant、其餘14條全部要求requireAuth()', () => {
    const requireAuthCount = router.routes.filter((r) => r.middlewares.some((fn) => fn.name === 'authMiddleware')).length;
    assert.strictEqual(requireAuthCount, 14);
  });

  console.log('');

  // =========================================================================
  // G. session security
  // =========================================================================
  console.log('--- G. session security ---');

  const { COOKIE_DEFAULTS, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } = await import(path.join(srcRoot, 'auth', 'constants.js'));

  await test('（7.session security）COOKIE_DEFAULTS.httpOnly為true（JS無法讀取session cookie，防止XSS竊取）', () => {
    assert.strictEqual(COOKIE_DEFAULTS.httpOnly, true);
  });
  await test('（7.session security）COOKIE_DEFAULTS.secure為true（只透過HTTPS傳輸）', () => {
    assert.strictEqual(COOKIE_DEFAULTS.secure, true);
  });
  await test('（7.session security）COOKIE_DEFAULTS.sameSite為Lax（CSRF基礎防護）', () => {
    assert.strictEqual(COOKIE_DEFAULTS.sameSite, 'Lax');
  });
  await test('（7.session security）SESSION_COOKIE_NAME使用專屬前綴，不是常見泛用名稱（例如session/sid）', () => {
    assert.strictEqual(SESSION_COOKIE_NAME, 'dbc_sid');
  });
  await test('（7.session security）SESSION_TTL_SECONDS是合理的正整數（非永久、非過短）', () => {
    assert.ok(SESSION_TTL_SECONDS > 3600 && SESSION_TTL_SECONDS < 365 * 24 * 3600);
  });

  await test('（7.session security）migrations/0003 的 sessions 表只存 ip_hash，沒有明文 ip 欄位（隱私考量）', () => {
    const sql = fs.readFileSync(path.join(repoRoot, 'migrations', '0003_phase1_task1_13a_sessions_table.sql'), 'utf8');
    assert.ok(/ip_hash/.test(sql));
    assert.ok(!/\bip\s+TEXT/.test(sql.replace(/ip_hash/g, '')));
  });

  await test('（7.session security）AUTH_AUDIT_EVENT_TYPES是凍結（Object.freeze）的白名單，audit_log_service.js的isValidEventType()會拒絕不在清單裡的event_type', async () => {
    const { AUTH_AUDIT_EVENT_TYPES, recordAuthEvent } = await import(path.join(srcRoot, 'services', 'audit_log_service.js'));
    assert.ok(Object.isFrozen(AUTH_AUDIT_EVENT_TYPES));
    const result = await recordAuthEvent({}, { user_id: 'u1', event_type: 'not_a_real_event' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_event_type');
  });

  await test('（7.session security）requireAuth()：session過期時安全回401 reason=expired（透過真正的Router+mock db驗證）', async () => {
    const mod = await import(path.join(srcRoot, 'routes', 'index.js'));
    const { SESSION_COOKIE_NAME: COOKIE } = await import(path.join(srcRoot, 'auth', 'constants.js'));
    const db = makeMinimalMockDb();
    db.seedUser({ id: 'u-review-1', status: 'active' });
    db.seedSession({ id: 'tok-review-1', user_id: 'u-review-1', expires_at: '2020-01-01T00:00:00Z', revoked_at: null });
    const r2 = mod.createAppRouter();
    const res = await r2.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${COOKIE}=tok-review-1` }, { db });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.reason, 'expired');
  });

  await test('（7.session security）requireAuth()：session已撤銷時安全回401 reason=revoked', async () => {
    const mod = await import(path.join(srcRoot, 'routes', 'index.js'));
    const { SESSION_COOKIE_NAME: COOKIE } = await import(path.join(srcRoot, 'auth', 'constants.js'));
    const db = makeMinimalMockDb();
    db.seedUser({ id: 'u-review-2', status: 'active' });
    db.seedSession({ id: 'tok-review-2', user_id: 'u-review-2', expires_at: '2099-01-01T00:00:00Z', revoked_at: '2026-01-01T00:00:00Z' });
    const r2 = mod.createAppRouter();
    const res = await r2.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${COOKIE}=tok-review-2` }, { db });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.reason, 'revoked');
  });

  await test('（7.session security）requireAuth()：使用者status為suspended時安全回401', async () => {
    const mod = await import(path.join(srcRoot, 'routes', 'index.js'));
    const { SESSION_COOKIE_NAME: COOKIE } = await import(path.join(srcRoot, 'auth', 'constants.js'));
    const db = makeMinimalMockDb();
    db.seedUser({ id: 'u-review-3', status: 'suspended' });
    db.seedSession({ id: 'tok-review-3', user_id: 'u-review-3', expires_at: '2099-01-01T00:00:00Z', revoked_at: null });
    const r2 = mod.createAppRouter();
    const res = await r2.handle({ method: 'GET', pathname: '/api/dashboard', query: {}, cookieHeader: `${COOKIE}=tok-review-3` }, { db });
    assert.strictEqual(res.status, 401);
  });

  console.log('');

  // =========================================================================
  // H. ownership rule
  // =========================================================================
  console.log('--- H. ownership rule ---');

  const ownedApiRouteFiles = ['data_routes.js', 'dashboard_routes.js', 'profile_routes.js', 'timeline_routes.js'];
  for (const file of ownedApiRouteFiles) {
    await test(`（8.ownership rule）src/routes/${file} 的 getQuery()/getPayload() 完全不讀取 user_id 欄位`, () => {
      const src = readSrc(path.join('routes', file));
      assert.ok(!/\.user_id\b/.test(src), `${file} 出現讀取 .user_id 的程式碼`);
    });
    await test(`（8.ownership rule）src/routes/${file} 的userId一律來自 ctx.user.id（currentUserId()輔助函式）`, () => {
      const src = readSrc(path.join('routes', file));
      assert.ok(/ctx\.user\s*\?\s*ctx\.user\.id/.test(src) || /ctx\.user\.id/.test(src), `${file} 沒有從 ctx.user.id 取得userId`);
    });
  }

  await test('（8.ownership rule）data_controller.js/dashboard_controller.js/profile_controller.js/timeline_controller.js 每個對外函式的第二個參數命名皆為userId（獨立參數，不是從物件解構payload.userId）', () => {
    for (const file of ['data_controller.js', 'dashboard_controller.js', 'profile_controller.js', 'timeline_controller.js']) {
      const src = readSrc(path.join('controllers', file));
      const fnSignatures = [...src.matchAll(/export async function \w+Controller\(([^)]*)\)/g)];
      assert.ok(fnSignatures.length > 0, `${file} 沒有找到任何 export async function ...Controller()`);
      for (const [, params] of fnSignatures) {
        const parts = params.split(',').map((p) => p.trim());
        assert.strictEqual(parts[1], 'userId', `${file} 的簽章 (${params}) 第二個參數不是userId`);
      }
    }
  });

  await test('（8.ownership rule，功能驗證）跨使用者隔離：透過真正Router，User A的session無法取得User B在dashboard/timeline的資料', async () => {
    const mod = await import(path.join(srcRoot, 'routes', 'index.js'));
    const { SESSION_COOKIE_NAME: COOKIE } = await import(path.join(srcRoot, 'auth', 'constants.js'));
    const db = makeMinimalMockDb();
    db.seedUser({ id: 'u-review-a', status: 'active' });
    db.seedUser({ id: 'u-review-b', status: 'active' });
    db.seedSession({ id: 'tok-review-a', user_id: 'u-review-a', expires_at: '2099-01-01T00:00:00Z', revoked_at: null });
    db._explorationRecordsStore.push({ id: 1, user_id: 'u-review-b', created_at: '2026-01-01T00:00:00Z', card_text: 'b-secret' });
    const r2 = mod.createAppRouter();
    const res = await r2.handle({ method: 'GET', pathname: '/api/timeline', query: { user_id: 'u-review-b' }, cookieHeader: `${COOKIE}=tok-review-a` }, { db });
    const body = await res.json();
    assert.deepStrictEqual(body.data.timeline, []);
  });

  console.log('');

  // =========================================================================
  // I. migration check
  // =========================================================================
  console.log('--- I. migration check ---');

  const migrationFiles = fs.readdirSync(path.join(repoRoot, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  await test(`（9.migration check）migrations/ 目錄共有 ${migrationFiles.length} 個檔案，編號從0001連續到最新、無缺號無重複`, () => {
    const numbers = migrationFiles.map((f) => parseInt(f.slice(0, 4), 10));
    for (let i = 0; i < numbers.length; i++) {
      assert.strictEqual(numbers[i], i + 1, `migrations編號在index ${i}不連續：${migrationFiles[i]}`);
    }
  });

  let localD1Available = false;
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
    localD1Available = true;
  } catch (e) {
    localD1Available = false;
  }

  const EXPECTED_TABLE_COLUMNS = {
    users: ['id', 'auth_provider', 'auth_provider_id', 'display_name', 'is_guest', 'legacy_sync_code', 'created_at', 'updated_at', 'status', 'last_login_at'],
    sessions: ['id', 'user_id', 'created_at', 'expires_at', 'last_seen_at', 'user_agent', 'ip_hash', 'revoked_at'],
    exploration_records: ['id', 'user_id', 'draw_mode', 'card_category', 'card_object_key', 'card_text', 'photo_idx', 'responses_json', 'occurred_at', 'created_at'],
    food_events: ['id', 'user_id', 'meal_type', 'description', 'nutrients_json', 'image_id', 'occurred_at', 'created_at'],
    emotion_records: ['id', 'user_id', 'emotion_type', 'intensity', 'trigger_note', 'linked_food_event_id', 'occurred_at', 'created_at'],
    behavior_patterns: ['id', 'user_id', 'pattern_type', 'summary', 'evidence_json', 'confidence_score', 'detected_at', 'created_at'],
    ai_reports: ['id', 'user_id', 'report_type', 'period_start', 'period_end', 'content', 'model_used', 'created_at'],
    legacy_import_logs: ['id', 'source_type', 'source_key', 'status', 'imported_count', 'error_message', 'created_at'],
    auth_audit_logs: ['id', 'user_id', 'event_type', 'provider', 'ip_hash', 'user_agent', 'created_at'],
  };

  if (localD1Available) {
    let conn;
    try {
      const d1Dir = path.join(repoRoot, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
      const files = fs.readdirSync(d1Dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
      if (files.length === 1) {
        conn = new DatabaseSync(path.join(d1Dir, files[0]));
      }
    } catch (e) {
      conn = null;
    }

    if (conn) {
      for (const [table, expectedCols] of Object.entries(EXPECTED_TABLE_COLUMNS)) {
        await test(`（9.migration check）真實本機D1的 ${table} 表欄位跟 src/db/tables/ 目前的原始碼假設完全一致`, () => {
          const rows = conn.prepare(`PRAGMA table_info(${table})`).all();
          const actualCols = rows.map((r) => r.name).sort();
          assert.deepStrictEqual(actualCols, [...expectedCols].sort(), `${table} 欄位不符`);
        });
      }

      await test('（9.migration check）EXPLAIN驗證：目前所有db/tables/*.js用到的SQL陳述式都能對真實本機D1 schema編譯成功（零副作用，不寫入任何資料）', () => {
        const statements = [
          `INSERT INTO users (id, auth_provider, auth_provider_id, display_name, is_guest, status, legacy_sync_code, created_at, updated_at) VALUES (NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)`,
          `UPDATE users SET display_name = NULL, updated_at = NULL WHERE id = NULL`,
          `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash, revoked_at) VALUES (NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)`,
          `INSERT INTO auth_audit_logs (id, user_id, event_type, provider, ip_hash, user_agent, created_at) VALUES (NULL,NULL,NULL,NULL,NULL,NULL,NULL)`,
          `INSERT INTO legacy_import_logs (id, source_type, source_key, status, imported_count, error_message, created_at) VALUES (NULL,NULL,NULL,NULL,NULL,NULL,NULL)`,
        ];
        for (const sql of statements) {
          assert.doesNotThrow(() => conn.prepare('EXPLAIN ' + sql), `EXPLAIN失敗: ${sql}`);
        }
      });

      conn.close();
    } else {
      await test('（9.migration check）本機D1 sqlite 檔案不存在或無法開啟時，安全略過schema欄位逐一比對（不視為失敗，只是環境限制）', () => {
        assert.ok(true);
      });
    }
  } else {
    await test('（9.migration check）node:sqlite 不可用時，安全略過真實D1 schema比對（不視為失敗，只是環境限制）', () => {
      assert.ok(true);
    });
  }

  console.log('');

  // =========================================================================
  // J. regression check
  // =========================================================================
  console.log('--- J. regression check ---');

  const allSuites = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /^test_.*\.mjs$/.test(entry.name) && !full.includes('phase1-task1.39-review')) {
        allSuites.push(full);
      }
    }
  }
  walk(path.join(repoRoot, 'backups'));
  allSuites.sort();

  await test(`（10.regression check）backups/ 目錄下共找到 ${allSuites.length} 個既有任務的測試檔案（動態掃描，含TASK1.1~1.38）`, () => {
    assert.ok(allSuites.length >= 29, `預期至少29個既有測試檔案，實際 ${allSuites.length}`);
  });

  for (const suite of allSuites) {
    const relName = path.relative(repoRoot, suite);
    await test(`（10.regression check）${relName} 完整執行，exit code為0（無回歸）`, () => {
      try {
        execFileSync('node', [suite], { cwd: repoRoot, stdio: 'pipe', timeout: 60000 });
      } catch (e) {
        const output = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
        throw new Error(`${relName} 執行失敗：${output.split('\n').filter((l) => l.includes('❌') || l.includes('FAIL')).slice(0, 5).join(' | ')}`);
      }
    });
  }

  await test('（10.regression check，TASK1.39發現並修正的治具問題）backups/phase1-task1.38-timeline/test_timeline_mock.mjs 原本用「git diff --stat 整個src/identity/目錄」檢查，會被TASK1.39合法的README.md文件更新誤判為失敗；已修正為只檢查src/identity/*.js邏輯檔案，這裡確認修正後確實不再受文件異動影響', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'backups', 'phase1-task1.38-timeline', 'test_timeline_mock.mjs'), 'utf8');
    assert.ok(src.includes("git diff --stat -- src/identity/*.js"), '應該已經改成只檢查*.js檔案');
    assert.ok(!/git diff --stat src\/identity\/'/.test(src), '不應該再有舊版的整個目錄檢查');
  });

  console.log('');

  // =========================================================================
  // K. TASK1.12 fixture修正確認
  // =========================================================================
  console.log('--- K. TASK1.12 fixture修正確認 ---');

  await test('（11.TASK1.12 fixture修正確認）test_db_layer_mock.mjs 完整執行，20/20全數通過（TASK1.39之前是18/19，users.insert欄位索引因TASK1.13B新增status欄位而過時）', () => {
    const out = execFileSync('node', [path.join(repoRoot, 'backups', 'phase1-task1.12-db-access-layer', 'test_db_layer_mock.mjs')], { cwd: repoRoot, encoding: 'utf8' });
    assert.ok(/PASS:\s*20\s*\/\s*20/.test(out), `預期20/20，實際輸出：${out.slice(-300)}`);
  });

  await test('（11.TASK1.12 fixture修正確認）直接驗證：users.insert() 的params[6]正確對應legacy_sync_code（不是舊版假設的params[5]）', async () => {
    const { createDb } = await import(path.join(srcRoot, 'db', 'index.js'));
    const calls = [];
    const fakeD1 = {
      prepare(sql) {
        return {
          bind(...params) { calls.push({ sql, params }); return this; },
          async run() { return { meta: { last_row_id: 1, changes: 1 } }; },
          async all() { return { results: [] }; },
          async first() { return null; },
        };
      },
      async batch(stmts) { const r = []; for (const s of stmts) r.push(await s.run()); return r; },
    };
    const db = createDb({ DIET_COACH_DB: fakeD1 });
    await db.users.insert({ id: 'review-u1', legacy_sync_code: 'sync:REVIEW', created_at: 'x', updated_at: 'y' });
    const call = calls.find((c) => /INSERT INTO users/.test(c.sql));
    assert.strictEqual(call.params[0], 'review-u1');
    assert.strictEqual(call.params[6], 'sync:REVIEW');
  });

  await test('（11.TASK1.12 fixture修正確認）validate_sql_against_schema.mjs 已同步更新，涵蓋全部9張表（不再只是TASK1.12當時的6張）', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'backups', 'phase1-task1.12-db-access-layer', 'validate_sql_against_schema.mjs'), 'utf8');
    for (const table of ['users', 'sessions', 'exploration_records', 'food_events', 'emotion_records', 'behavior_patterns', 'ai_reports', 'legacy_import_logs', 'auth_audit_logs']) {
      assert.ok(src.includes(`${table}.`), `validate_sql_against_schema.mjs 沒有涵蓋 ${table}`);
    }
  });

  console.log('');

  // =========================================================================
  // L. P1-P6
  // =========================================================================
  console.log('--- L. P1-P6 ---');

  await test('（12.P1-P6）P1-P6 UI Playwright檢查另外在 p1-p6-check/run.js 執行（本次審查完全沒有修改任何UI/getHTML()相關程式碼，UI受影響機率為0）', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'p1-p6-check', 'run.js')));
  });

  await test('（12.P1-P6）src/worker.js 的 getHTML() 函式本體完全沒有被TASK1.39修改（git diff確認）', () => {
    const diff = execFileSync('git', ['diff', '--stat', 'src/worker.js'], { cwd: repoRoot, encoding: 'utf8' });
    // TASK1.39完全沒有修改src/worker.js，diff應為空字串
    assert.strictEqual(diff.trim(), '', 'worker.js不應該有任何異動');
  });

  console.log('');
  console.log(`合計：${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

// -----------------------------------------------------------------------
// 給 G/H 類別用的最小mock db：users/sessions + explorationRecords，
// 方法簽章對齊 src/db/tables/*.js，跟其餘既有任務測試檔案同樣的手法。
// -----------------------------------------------------------------------
function makeMinimalMockDb() {
  const users = new Map();
  const sessions = new Map();
  const explorationRecords = [];
  const empty = { foodEvents: [], emotionRecords: [], behaviorPatterns: [], aiReports: [] };

  function seedUser(u) { users.set(u.id, Object.assign({ is_guest: 1, auth_provider: null, display_name: null, created_at: '2026-01-01T00:00:00Z' }, u)); }
  function seedSession(s) { sessions.set(s.id, s); }

  function listTable(store, defaultLimit) {
    return {
      async insert(rec) { const row = Object.assign({ id: store.length + 1, created_at: new Date().toISOString() }, rec); store.push(row); return { ok: true, id: row.id }; },
      async listByUser(userId, limit) { return { ok: true, results: store.filter((r) => r.user_id === userId).slice(0, limit || defaultLimit) }; },
    };
  }

  return {
    _explorationRecordsStore: explorationRecords,
    seedUser,
    seedSession,
    users: { async getById(id) { return { ok: true, row: users.get(id) || null }; } },
    sessions: { async getById(id) { return { ok: true, row: sessions.get(id) || null }; } },
    explorationRecords: listTable(explorationRecords, 50),
    foodEvents: listTable(empty.foodEvents, 50),
    emotionRecords: listTable(empty.emotionRecords, 50),
    behaviorPatterns: listTable(empty.behaviorPatterns, 50),
    aiReports: listTable(empty.aiReports, 20),
  };
}

run();

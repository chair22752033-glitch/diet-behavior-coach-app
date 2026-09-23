/*
 * Phase 1 TASK 1.23｜Configuration + Bootstrap Layer 測試
 *
 * 純記憶體測試：假 D1 binding（同 TASK1.12/1.22 的手法），完全不連線
 * 任何真實或本機模擬的資料庫，不建立任何真實使用者 session，測試裡
 * 用的 Google client id/secret 全部是假值（例如 'fake-client-id'），
 * 不會真的呼叫 Google 任何端點。
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEnvConfig } from '../../src/config/env.js';
import { getAuthConfig } from '../../src/config/auth_config.js';
import { getAppConfig } from '../../src/config/app_config.js';
import { createApplication } from '../../src/bootstrap/application.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function makeMockD1() {
  return {
    prepare(sql) {
      return {
        sql,
        bind() { return this; },
        async run() { return { meta: {} }; },
        async all() { return { results: [] }; },
        async first() { return null; },
      };
    },
    async batch(statements) {
      const results = [];
      for (const s of statements) results.push(await s.run());
      return results;
    },
  };
}

function makeFullEnv(overrides) {
  return Object.assign(
    {
      DIET_COACH_DB: makeMockD1(),
      SYNC_KV: { get: async () => null, put: async () => {} },
      DIET_COACH_IMAGES: { get: async () => null, put: async () => {} },
    },
    overrides || {}
  );
}

async function run() {
  // ---------------------------------------------------------------------
  // 1. env config
  // ---------------------------------------------------------------------

  await test('getEnvConfig() 回傳 {environment, database, kv, r2}', () => {
    const env = makeFullEnv();
    const cfg = getEnvConfig(env);
    assert.deepStrictEqual(Object.keys(cfg).sort(), ['database', 'environment', 'kv', 'r2']);
  });

  await test('getEnvConfig() database/kv/r2 binding 都存在時 present=true', () => {
    const env = makeFullEnv();
    const cfg = getEnvConfig(env);
    assert.strictEqual(cfg.database.present, true);
    assert.strictEqual(cfg.kv.present, true);
    assert.strictEqual(cfg.r2.present, true);
  });

  await test('getEnvConfig() 正確回傳底層 binding 本身（同一參考）', () => {
    const env = makeFullEnv();
    const cfg = getEnvConfig(env);
    assert.strictEqual(cfg.database.binding, env.DIET_COACH_DB);
    assert.strictEqual(cfg.kv.binding, env.SYNC_KV);
    assert.strictEqual(cfg.r2.binding, env.DIET_COACH_IMAGES);
  });

  await test('getEnvConfig() environment 未設定時預設 unknown', () => {
    const env = makeFullEnv();
    const cfg = getEnvConfig(env);
    assert.strictEqual(cfg.environment, 'unknown');
  });

  await test('getEnvConfig() 有設定 env.ENVIRONMENT 時原樣回傳', () => {
    const env = makeFullEnv({ ENVIRONMENT: 'staging' });
    const cfg = getEnvConfig(env);
    assert.strictEqual(cfg.environment, 'staging');
  });

  await test('getEnvConfig() 不會散落回傳整個 env（不含非 D1/KV/R2/environment 以外的欄位）', () => {
    const env = makeFullEnv({ SOME_RANDOM_VAR: 'x' });
    const cfg = getEnvConfig(env);
    assert.strictEqual(cfg.SOME_RANDOM_VAR, undefined);
  });

  // ---------------------------------------------------------------------
  // 2. auth config
  // ---------------------------------------------------------------------

  await test('getAuthConfig() 回傳 {google, cookie}', () => {
    const env = makeFullEnv();
    const cfg = getAuthConfig(env);
    assert.deepStrictEqual(Object.keys(cfg).sort(), ['cookie', 'google']);
  });

  await test('getAuthConfig() 沒有設定 Google 變數時 configured=false，值皆為 null', () => {
    const env = makeFullEnv();
    const cfg = getAuthConfig(env);
    assert.strictEqual(cfg.google.configured, false);
    assert.strictEqual(cfg.google.clientId, null);
    assert.strictEqual(cfg.google.clientSecret, null);
    assert.strictEqual(cfg.google.redirectUri, null);
  });

  await test('getAuthConfig() 三個 Google 變數齊全時 configured=true 且值正確', () => {
    const env = makeFullEnv({
      GOOGLE_CLIENT_ID: 'fake-client-id',
      GOOGLE_CLIENT_SECRET: 'fake-client-secret',
      GOOGLE_REDIRECT_URI: 'https://example.com/callback',
    });
    const cfg = getAuthConfig(env);
    assert.strictEqual(cfg.google.configured, true);
    assert.strictEqual(cfg.google.clientId, 'fake-client-id');
    assert.strictEqual(cfg.google.clientSecret, 'fake-client-secret');
    assert.strictEqual(cfg.google.redirectUri, 'https://example.com/callback');
  });

  await test('getAuthConfig() 只有部分 Google 變數時仍是 configured=false', () => {
    const env = makeFullEnv({ GOOGLE_CLIENT_ID: 'only-id' });
    const cfg = getAuthConfig(env);
    assert.strictEqual(cfg.google.configured, false);
  });

  await test('getAuthConfig() cookie 設定沿用 TASK1.13A 的常數（name/ttl/secure/sameSite）', async () => {
    const { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, COOKIE_DEFAULTS } = await import('../../src/auth/constants.js');
    const env = makeFullEnv();
    const cfg = getAuthConfig(env);
    assert.strictEqual(cfg.cookie.name, SESSION_COOKIE_NAME);
    assert.strictEqual(cfg.cookie.ttl, SESSION_TTL_SECONDS);
    assert.strictEqual(cfg.cookie.secure, COOKIE_DEFAULTS.secure);
    assert.strictEqual(cfg.cookie.sameSite, COOKIE_DEFAULTS.sameSite);
  });

  // ---------------------------------------------------------------------
  // 9. feature flag（app_config）
  // ---------------------------------------------------------------------

  await test('getAppConfig() 回傳 {environment, version, features}', () => {
    const env = makeFullEnv();
    const cfg = getAppConfig(env);
    assert.deepStrictEqual(Object.keys(cfg).sort(), ['environment', 'features', 'version']);
  });

  await test('getAppConfig() 預設全部 feature flag 都是 false（尚未真正上線任何功能）', () => {
    const env = makeFullEnv();
    const cfg = getAppConfig(env);
    assert.strictEqual(cfg.features.d1Enabled, false);
    assert.strictEqual(cfg.features.authEnabled, false);
    assert.strictEqual(cfg.features.legacyImportEnabled, false);
  });

  await test('getAppConfig() 版本未設定時使用預設版本字串', () => {
    const env = makeFullEnv();
    const cfg = getAppConfig(env);
    assert.strictEqual(cfg.version, '1.0.0-phase1');
  });

  await test('getAppConfig() 可透過 env.APP_VERSION 覆寫版本', () => {
    const env = makeFullEnv({ APP_VERSION: '2.0.0-test' });
    const cfg = getAppConfig(env);
    assert.strictEqual(cfg.version, '2.0.0-test');
  });

  await test('getAppConfig() 可透過 FEATURE_D1_ENABLED="true" 覆寫 d1Enabled', () => {
    const env = makeFullEnv({ FEATURE_D1_ENABLED: 'true' });
    const cfg = getAppConfig(env);
    assert.strictEqual(cfg.features.d1Enabled, true);
  });

  await test('getAppConfig() 可透過布林值 true 覆寫 authEnabled', () => {
    const env = makeFullEnv({ FEATURE_AUTH_ENABLED: true });
    const cfg = getAppConfig(env);
    assert.strictEqual(cfg.features.authEnabled, true);
  });

  await test('getAppConfig() FEATURE_LEGACY_IMPORT_ENABLED="0" 視為 false', () => {
    const env = makeFullEnv({ FEATURE_LEGACY_IMPORT_ENABLED: '0' });
    const cfg = getAppConfig(env);
    assert.strictEqual(cfg.features.legacyImportEnabled, false);
  });

  // ---------------------------------------------------------------------
  // 3. missing env
  // ---------------------------------------------------------------------

  await test('getEnvConfig(undefined) 丟出明確錯誤', () => {
    assert.throws(() => getEnvConfig(undefined), /env 不可為空/);
  });

  await test('getAuthConfig(null) 丟出明確錯誤', () => {
    assert.throws(() => getAuthConfig(null), /env 不可為空/);
  });

  await test('getAppConfig(undefined) 丟出明確錯誤', () => {
    assert.throws(() => getAppConfig(undefined), /env 不可為空/);
  });

  await test('getEnvConfig() 缺少 DIET_COACH_DB 時 present=false 並帶明確 missingReason（不拋例外）', () => {
    const cfg = getEnvConfig({});
    assert.strictEqual(cfg.database.present, false);
    assert.ok(/DIET_COACH_DB/.test(cfg.database.missingReason));
  });

  await test('getEnvConfig() 缺少 SYNC_KV/DIET_COACH_IMAGES 時也各自明確回報', () => {
    const cfg = getEnvConfig({ DIET_COACH_DB: makeMockD1() });
    assert.strictEqual(cfg.kv.present, false);
    assert.strictEqual(cfg.r2.present, false);
    assert.ok(/SYNC_KV/.test(cfg.kv.missingReason));
    assert.ok(/DIET_COACH_IMAGES/.test(cfg.r2.missingReason));
  });

  await test('createApplication(undefined) 丟出明確錯誤', () => {
    assert.throws(() => createApplication(undefined), /env 不可為空/);
  });

  await test('createApplication({}) 因缺少 DIET_COACH_DB binding 而丟出明確錯誤（db層檢查生效）', () => {
    assert.throws(() => createApplication({}), /DIET_COACH_DB/);
  });

  // ---------------------------------------------------------------------
  // 4. bootstrap 建立
  // ---------------------------------------------------------------------

  // 注意：TASK1.27 為 createApplication() 新增了 `middleware` 欄位
  // （Middleware Pipeline 的組裝入口），這是明確要做的擴充，不是回歸，
  // 這裡的預期key清單已同步更新。
  await test('createApplication() 成功回傳 {config, db, services, router, middleware}', () => {
    const env = makeFullEnv();
    const app = createApplication(env);
    assert.deepStrictEqual(Object.keys(app).sort(), ['config', 'db', 'middleware', 'router', 'services']);
  });

  await test('createApplication().config 包含 env/auth/app 三個子設定', () => {
    const env = makeFullEnv();
    const app = createApplication(env);
    assert.deepStrictEqual(Object.keys(app.config).sort(), ['app', 'auth', 'env']);
    assert.strictEqual(app.config.env.database.present, true);
    assert.strictEqual(typeof app.config.auth.google.configured, 'boolean');
    assert.strictEqual(typeof app.config.app.version, 'string');
  });

  await test('createApplication() 每次呼叫都是獨立的物件（不共用同一個 router 實例）', () => {
    const env = makeFullEnv();
    const appA = createApplication(env);
    const appB = createApplication(env);
    assert.notStrictEqual(appA, appB);
    assert.notStrictEqual(appA.router, appB.router);
  });

  // ---------------------------------------------------------------------
  // 5. db injection
  // ---------------------------------------------------------------------

  await test('createApplication().db 是 TASK1.12 createDb() 的輸出（具備 users/sessions等）', () => {
    const env = makeFullEnv();
    const app = createApplication(env);
    assert.ok(app.db.users);
    assert.ok(app.db.sessions);
    assert.ok(app.db.explorationRecords);
  });

  await test('createApplication().db.raw 就是傳入的 D1 binding（同一參考）', () => {
    const env = makeFullEnv();
    const app = createApplication(env);
    assert.strictEqual(app.db.raw, env.DIET_COACH_DB);
  });

  // ---------------------------------------------------------------------
  // 6. router injection
  // ---------------------------------------------------------------------

  await test('createApplication().router 具備 add/handle（來自 TASK1.21 createAppRouter）', () => {
    const env = makeFullEnv();
    const app = createApplication(env);
    assert.strictEqual(typeof app.router.add, 'function');
    assert.strictEqual(typeof app.router.handle, 'function');
  });

  await test('createApplication().router 已註冊好 auth/user 路由（可直接 handle 一個請求）', async () => {
    const env = makeFullEnv();
    const app = createApplication(env);
    const res = await app.router.handle(
      { method: 'POST', pathname: '/auth/guest', payload: {} },
      { db: app.db }
    );
    assert.strictEqual(res.status, 200);
  });

  // ---------------------------------------------------------------------
  // 7. service injection
  // ---------------------------------------------------------------------

  await test('createApplication().services 帶有全部預期的 service module', () => {
    const env = makeFullEnv();
    const app = createApplication(env);
    const expectedKeys = [
      'authApplicationService',
      'userService',
      'explorationService',
      'foodService',
      'emotionService',
      'behaviorService',
      'reportService',
    ];
    for (const key of expectedKeys) {
      assert.ok(app.services[key], `services.${key} 應存在`);
    }
  });

  await test('createApplication().services.userService.getUserById 是函式', () => {
    const env = makeFullEnv();
    const app = createApplication(env);
    assert.strictEqual(typeof app.services.userService.getUserById, 'function');
  });

  await test('createApplication() 不會呼叫任何 service 函式或觸發任何 db 呼叫（純組裝）', () => {
    const calls = [];
    const env = makeFullEnv({
      DIET_COACH_DB: {
        prepare(sql) {
          calls.push(sql);
          return { bind() { return this; }, async run() { return { meta: {} }; }, async all() { return { results: [] }; }, async first() { return null; } };
        },
        async batch() { return []; },
      },
    });
    createApplication(env);
    assert.strictEqual(calls.length, 0);
  });

  // ---------------------------------------------------------------------
  // 8. secret 不外洩
  // ---------------------------------------------------------------------

  await test('（secret不外洩）createApplication() 拋出的錯誤訊息不包含任何機密值', () => {
    const env = makeFullEnv({ GOOGLE_CLIENT_SECRET: 'super-secret-value-should-not-leak' });
    delete env.DIET_COACH_DB;
    let threw = false;
    try {
      createApplication(env);
    } catch (e) {
      threw = true;
      assert.ok(!e.message.includes('super-secret-value-should-not-leak'));
    }
    assert.strictEqual(threw, true);
  });

  await test('（secret不外洩）getEnvConfig() 回傳值不含 GOOGLE_CLIENT_SECRET 等機密欄位', () => {
    const env = makeFullEnv({ GOOGLE_CLIENT_SECRET: 'super-secret-value' });
    const cfg = getEnvConfig(env);
    const serialized = JSON.stringify(cfg);
    assert.ok(!serialized.includes('super-secret-value'));
  });

  await test('（secret不外洩）getAppConfig() 回傳值不含任何機密欄位', () => {
    const env = makeFullEnv({ GOOGLE_CLIENT_SECRET: 'super-secret-value' });
    const cfg = getAppConfig(env);
    const serialized = JSON.stringify(cfg);
    assert.ok(!serialized.includes('super-secret-value'));
  });

  await test('（secret不外洩）原始碼掃描：auth_config.js 沒有 console.log/console.error', () => {
    const src = readSource('src/config/auth_config.js');
    assert.ok(!/console\.(log|error|warn|info)/.test(stripComments(src)));
  });

  await test('（secret不外洩）原始碼掃描：auth_config.js 不 import src/oauth/ 或呼叫 fetch', () => {
    const src = stripComments(readSource('src/config/auth_config.js'));
    assert.ok(!/from\s+['"].*src\/oauth\//.test(src));
    assert.ok(!/\bfetch\s*\(/.test(src));
  });

  await test('（secret不外洩）原始碼掃描：config/bootstrap 層皆沒有寫死的Google真實格式機密值', () => {
    const files = ['src/config/env.js', 'src/config/auth_config.js', 'src/config/app_config.js', 'src/bootstrap/application.js'];
    for (const f of files) {
      const src = readSource(f);
      assert.ok(!/GOCSPX-/.test(src), `${f} 不應含寫死的 client_secret 格式值`);
      assert.ok(!/ya29\./.test(src), `${f} 不應含寫死的 access_token 格式值`);
    }
  });

  // ---------------------------------------------------------------------
  // 其餘原始碼掃描：no export default worker / worker.js 未引用
  // ---------------------------------------------------------------------

  await test('原始碼掃描：bootstrap/application.js 沒有 export default', () => {
    const src = stripComments(readSource('src/bootstrap/application.js'));
    assert.ok(!/export\s+default/.test(src));
  });

  // 注意：這項斷言原本是「TASK1.23 當下 worker.js 完全不 import 這兩個
  // 目錄」，但 TASK1.24（Worker Entry Integration）已依規格正式把
  // createApplication()（src/bootstrap/application.js）接進 worker.js
  // 的 fetch()——這是 TASK1.24 明確要做的事，不是意外的回歸。這裡改成
  // 驗證「有接、但只接 bootstrap 這個單一入口，沒有繞過它直接 import
  // src/config/ 底下的個別檔案」，繼續守住分層原則。
  await test('原始碼掃描：src/worker.js 只透過 src/bootstrap/application.js 這個單一入口接入設定層，沒有直接 import src/config/ 底下的個別檔案（TASK1.24起）', () => {
    const workerSrc = readSource('src/worker.js');
    assert.ok(/from\s*['"]\.\/bootstrap\/application\.js['"]/.test(workerSrc));
    assert.ok(!/from\s*['"]\.\/config\//.test(workerSrc));
  });

  console.log('');
  console.log(`總計：${passed} 通過，${failed} 失敗`);
  if (failed > 0) process.exitCode = 1;
}

function readSource(relPath) {
  return readFileSync(path.join(__dirname, '..', '..', relPath), 'utf8');
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

run();

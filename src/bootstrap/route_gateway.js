/*
 * Phase 1 TASK 1.25｜Feature Flag & Route Migration Gateway
 * （TASK1.26 起：router 優先，router 沒有任何路由認得的路徑才 fallback legacy）
 *
 * createRouteGateway(options) 依 feature flag
 * （app.config.app.features.routeMigrationEnabled，見 TASK1.23/1.25 的
 * src/config/app_config.js）決定一個請求要走新架構的 Router（TASK1.21，
 * 現在也掛載了 TASK1.26 的 Legacy Route Adapter）還是舊的 legacy handler
 * （src/worker.js 完全沒有變動過的 handle()）。
 *
 * 設計原則：
 * - flag 預設 false（見 app_config.js），本次沒有在 wrangler.toml 加入
 *   任何 FEATURE_ROUTE_MIGRATION_ENABLED 變數，所以正式環境目前 100%
 *   繼續走 legacy handler，行為與接入前完全一致。
 * - flag=true 時，router 優先：先檢查 app.router 有沒有任何路由（不分
 *   method）認得這個 pathname——完全不認得（真正尚未遷移的路徑）才
 *   fallback legacy；只要 pathname 有被任何路由認得（不論是TASK1.21的
 *   auth/user路由、還是TASK1.26剛掛載的legacy路由），就交給
 *   router.handle() 全權處理（包含它自己判斷的404/405），不會半途
 *   再改道legacy——避免跟controller自己合法回傳的404搞混。
 * - TASK1.26：建構時就把 legacyHandler 透過 registerLegacyRoutes()
 *   掛進 app.router，讓 GET /、/manifest.json、/icon.svg、
 *   /apple-touch-icon.png、/img/:path*、GET+POST /api/sync、
 *   GET+POST /api/qlive 這9條路由「被router認得」，但實際處理仍然
 *   100% delegate 給legacyHandler，完全不重新實作任何業務邏輯。
 * - 這裡完全不知道 legacy handler 內部長怎樣（由呼叫端注入），也不知道
 *   Router 內部長怎樣——只做「該走哪一條路」的判斷，不執行任何業務邏輯。
 * - 任何意外狀況（app 建立失敗、router 缺失、掛載legacy路由失敗、
 *   router.handle() 拋出例外）一律安全退回 legacy handler，絕不讓請求
 *   整個掛掉。
 */
import { registerLegacyRoutes } from '../routes/legacy_routes.js';
import { resolvePathname } from '../routes/router.js';

/**
 * @param {object} options
 * @param {object|null} options.app - createApplication(env) 的輸出（見 TASK1.23）
 * @param {(request:object, env:object) => Promise<Response>} options.legacyHandler
 *   舊的 handle(r, env)，由呼叫端（worker.js）傳入，這裡完全不 import 它。
 * @returns {{handle: (request:object, env:object) => Promise<Response>}}
 */
export function createRouteGateway(options) {
  options = options || {};
  const { app, legacyHandler } = options;

  if (typeof legacyHandler !== 'function') {
    throw new Error('createRouteGateway(options)：options.legacyHandler 必須是函式');
  }

  // TASK1.26：把 legacy 路由掛進 app.router（掛載本身不等於「啟用」——
  // 是否真的走 router 仍然完全由下面的 feature flag 判斷決定）。掛載
  // 失敗（例如 app.router 形狀不符預期）不影響 gateway 本身繼續可用，
  // 之後一律安全 fallback legacy。
  if (app && app.router && typeof app.router.add === 'function') {
    try {
      registerLegacyRoutes(app.router, legacyHandler);
    } catch (e) {
      // 忽略：flag=true 時的 fallback 機制仍會確保功能正常運作。
    }
  }

  function isRouteMigrationEnabled() {
    return !!(
      app &&
      app.config &&
      app.config.app &&
      app.config.app.features &&
      app.config.app.features.routeMigrationEnabled
    );
  }

  function isPathKnownToRouter(request) {
    if (!app || !app.router || !Array.isArray(app.router.routes)) return false;
    try {
      const pathname = resolvePathname(request);
      return app.router.routes.some((route) => route.regex.test(pathname));
    } catch (e) {
      return false;
    }
  }

  async function handle(request, env) {
    if (!isRouteMigrationEnabled()) {
      return legacyHandler(request, env);
    }

    // flag 開啟了，但 app 建立失敗或沒有 router 可用時，安全退回 legacy，
    // 不讓一個基礎架構問題影響到本該正常運作的既有功能。
    if (!app || !app.router || typeof app.router.handle !== 'function') {
      return legacyHandler(request, env);
    }

    // router 完全不認得這個路徑（真正尚未遷移）→ 直接 fallback legacy，
    // 不要讓 router 自己的通用 404 JSON 蓋掉 legacy 原本該有的行為
    // （例如 legacy 的 catch-all 首頁）。
    if (!isPathKnownToRouter(request)) {
      return legacyHandler(request, env);
    }

    try {
      return await app.router.handle(request, {
        db: app.db,
        env,
        services: app.services,
      });
    } catch (e) {
      return legacyHandler(request, env);
    }
  }

  return { handle };
}

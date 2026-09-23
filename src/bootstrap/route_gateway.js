/*
 * Phase 1 TASK 1.25｜Feature Flag & Route Migration Gateway
 *
 * createRouteGateway(options) 依 feature flag
 * （app.config.app.features.routeMigrationEnabled，見 TASK1.23/1.25 的
 * src/config/app_config.js）決定一個請求要走新架構的 Router（TASK1.21）
 * 還是舊的 legacy handler（src/worker.js 完全沒有變動過的 handle()）。
 *
 * 設計原則：
 * - flag 預設 false（見 app_config.js），本次沒有在 wrangler.toml 加入
 *   任何 FEATURE_ROUTE_MIGRATION_ENABLED 變數，所以正式環境目前 100%
 *   繼續走 legacy handler，行為與接入前完全一致。
 * - 這裡完全不知道 legacy handler 內部長怎樣（由呼叫端注入），也不知道
 *   Router 內部長怎樣——只做「該走哪一條路」的判斷，不執行任何業務邏輯。
 * - 任何意外狀況（app 建立失敗、router 缺失、router.handle() 拋出例外）
 *   一律安全退回 legacy handler，絕不讓請求整個掛掉。
 */

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

  function isRouteMigrationEnabled() {
    return !!(
      app &&
      app.config &&
      app.config.app &&
      app.config.app.features &&
      app.config.app.features.routeMigrationEnabled
    );
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

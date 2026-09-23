/*
 * Phase 1 TASK 1.21｜Router 核心
 *
 * createRouter() 提供最小的 method + path 比對能力（含 :param 參數），
 * 完全不知道「auth」「user」這些具體業務路由是什麼——那是
 * auth_routes.js / user_routes.js 的責任，這裡只做通用的比對/派發引擎。
 *
 * 刻意不 import 任何 controller、service、db、oauth、session 相關檔案。
 * 唯一負責的「業務相關」邏輯是：把 controller 回傳的 { ok, data/reason, status }
 * 轉成一個 Response 物件（status code + JSON content-type header + body）——
 * 這是任務規格明確要求由 Router 統一處理的部分，controller 本身不知道
 * HTTP/Response 是什麼（TASK1.20 的設計就是刻意讓 controller 跟傳輸協定無關）。
 */

function compilePath(path) {
  const paramNames = [];
  const segments = path.split('/').map((seg) => {
    if (seg.startsWith(':')) {
      paramNames.push(seg.slice(1));
      return '([^/]+)';
    }
    // 逐字比對，避免路徑中的正規表示式特殊字元造成非預期比對
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  const regex = new RegExp('^' + segments.join('/') + '$');
  return { regex, paramNames };
}

function toResponseInit(result) {
  const status = typeof result.status === 'number' ? result.status : (result.ok ? 200 : 400);
  return { status, body: JSON.stringify(result) };
}

function makeResponse(result) {
  const { status, body } = toResponseInit(result);
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function resolvePathname(request) {
  if (request && typeof request.pathname === 'string') return request.pathname;
  if (request && typeof request.url === 'string') return new URL(request.url).pathname;
  throw new Error('router.handle(request, ...)：request 必須提供 pathname 或 url');
}

/**
 * @returns {{add: Function, handle: Function, routes: Array}}
 */
export function createRouter() {
  const routes = [];

  function add(method, path, handler) {
    if (!method || typeof method !== 'string') {
      throw new Error('router.add(method, path, handler)：method 必須是字串');
    }
    if (!path || typeof path !== 'string') {
      throw new Error('router.add(method, path, handler)：path 必須是字串');
    }
    if (typeof handler !== 'function') {
      throw new Error('router.add(method, path, handler)：handler 必須是函式');
    }
    const { regex, paramNames } = compilePath(path);
    routes.push({ method: method.toUpperCase(), path, regex, paramNames, handler });
  }

  /**
   * @param {object} request - {method, pathname} 或 {method, url}（刻意不強制要求真正的 Fetch Request）
   * @param {object} [context] - {db, env, services}，Router 會補上 req 與 params 後傳給 handler
   */
  async function handle(request, context) {
    const baseContext = context || {};
    const method = (request && request.method ? request.method : 'GET').toUpperCase();
    const pathname = resolvePathname(request || {});

    let pathMatchedOtherMethod = false;

    for (const route of routes) {
      const match = route.regex.exec(pathname);
      if (!match) continue;
      if (route.method !== method) {
        pathMatchedOtherMethod = true;
        continue;
      }
      const params = {};
      route.paramNames.forEach((name, idx) => {
        params[name] = decodeURIComponent(match[idx + 1]);
      });
      const routeContext = Object.assign({}, baseContext, { req: request, params });
      try {
        const result = await route.handler(routeContext);
        return makeResponse(result);
      } catch (e) {
        return makeResponse({ ok: false, reason: e && e.message ? e.message : String(e), status: 500 });
      }
    }

    if (pathMatchedOtherMethod) {
      return makeResponse({ ok: false, reason: 'method_not_allowed', status: 405 });
    }
    return makeResponse({ ok: false, reason: 'not_found', status: 404 });
  }

  return { add, handle, routes };
}

/*
 * Phase 7 TASK 1.127｜Complete App Experience & UX Commercial Layer
 * - App Shell Routes
 *
 * 建立三條新路由：GET /app（Home Dashboard）、GET /app/history
 * （紀錄頁面）、GET /app/me（User Center）——把Health Insight從
 * 「一個功能頁面」擴充成「一個完整的App Experience Layer」。
 *
 * 延續整個系列既有分工：route層只負責「解析身份、呼叫既有
 * Service、把結果交給UI Renderer」，完全不直接操作db、不重新
 * 實作任何身份/歷史查詢邏輯——這三條路由重用TASK1.118/1.119
 * 既有的`resolveHealthInsightIdentity()`跟TASK1.124既有的
 * `getHealthInsightHistoryForIdentity()`，完全沒有修改這兩個
 * 檔案本身。
 *
 * 三條路由跟既有三條Health Insight路由（`health_insight_
 * routes.js`）採用同一套安全模型：**都不**掛`requireAuth()`，
 * 匿名/訪客/註冊使用者都能造訪，差別只在頁面呈現的內容（規格
 * PART4明確要求"Do not force login"）。
 */
import { resolveHealthInsightIdentity } from '../identity/health_insight/index.js';
import { getHealthInsightHistoryForIdentity } from '../history/health_insight/index.js';
import { renderAppShell, renderHomePageContent, renderHistoryPageContent, renderUserCenterPageContent } from '../ui/app_shell/index.js';

const HISTORY_PAGE_LIMIT = 20;

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

export function registerAppShellRoutes(router) {
  router.add('GET', '/app', async (ctx) => {
    const req = ctx.req || {};
    const identity = await resolveHealthInsightIdentity(ctx.db, req.cookieHeader, {});
    const bodyHtml = renderHomePageContent({ isAuthenticated: identity.authenticated, isGuest: identity.isGuest });
    const html = renderAppShell({
      activeNav: 'home',
      isAuthenticated: identity.authenticated,
      isGuest: identity.isGuest,
      bodyHtml,
      title: '健康陪伴｜首頁',
    });
    return htmlResponse(html);
  });

  router.add('GET', '/app/history', async (ctx) => {
    const req = ctx.req || {};
    const identity = await resolveHealthInsightIdentity(ctx.db, req.cookieHeader, {});
    const historyResult = await getHealthInsightHistoryForIdentity(ctx.db, identity, { limit: HISTORY_PAGE_LIMIT });
    const bodyHtml = renderHistoryPageContent({
      isAuthenticated: identity.authenticated,
      isGuest: identity.isGuest,
      records: historyResult.records,
    });
    const html = renderAppShell({
      activeNav: 'history',
      isAuthenticated: identity.authenticated,
      isGuest: identity.isGuest,
      bodyHtml,
      title: '健康陪伴｜紀錄',
    });
    return htmlResponse(html);
  });

  router.add('GET', '/app/me', async (ctx) => {
    const req = ctx.req || {};
    const identity = await resolveHealthInsightIdentity(ctx.db, req.cookieHeader, {});
    const bodyHtml = renderUserCenterPageContent({ isAuthenticated: identity.authenticated, isGuest: identity.isGuest });
    const html = renderAppShell({
      activeNav: 'me',
      isAuthenticated: identity.authenticated,
      isGuest: identity.isGuest,
      bodyHtml,
      title: '健康陪伴｜我的',
    });
    return htmlResponse(html);
  });
}

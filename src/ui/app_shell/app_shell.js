/*
 * Phase 7 TASK 1.127｜Complete App Experience & UX Commercial Layer
 * - App Shell（application layout / page container / consistent
 *   product frame）
 *
 * 責任：規格PART1「App Shell Foundation」的具體落地——把
 * Header、Navigation、Content Container組成一個完整、一致的
 * HTML頁面框架，讓`/app`、`/app/history`、`/app/me`三個新頁面
 * 共用同一套「應用程式外殼」，而不是各自重複組裝`<!DOCTYPE
 * html>`/`<head>`/導覽列。
 *
 * ## Scope Decision：為什麼既有`/health-insight`頁面沒有被改成
 * 套用這個App Shell
 *
 * 規格要求「Reuse existing 拙趣 design tokens / Health Insight
 * visual language」，這裡確實重用了`getDesignSystemCSS()`跟
 * `.hi-card`既有樣式（見下方`<style>`組裝），但**沒有**把
 * `src/routes/health_insight_routes.js`既有的`buildHealthInsightPage()`
 * 改成呼叫這裡的`renderAppShell()`——那個頁面從TASK1.116起就是
 * 一個已經上線、經過15個任務、超過9000個斷言驗證的完整功能
 * 頁面，`navigation.js`的「健康洞察」入口直接連到既有
 * `/health-insight` URL（外部連結，不是套殼），延續整個系列
 * 「Reuse, don't rebuild」跟「Avoid unnecessary changes」的既有
 * 原則，把回歸風險降到最低。App Shell是**新增**的、圍繞
 * 「首頁/紀錄/我的」三個新頁面的產品框架，不是既有頁面的
 * 強制套殼。
 *
 * ## 新增的CSS只用既有token，不建立新設計系統
 *
 * 下方`<style>`區塊裡的`app-shell-*`/`app-nav-*`/
 * `app-user-status-*`規則**只使用**`getDesignSystemCSS()`已經
 * 定義好的CSS Custom Properties（`--hi-color-*`/`--hi-spacing-*`
 * /`--hi-card-*`），沒有任何新的顏色字面值/新的字體/新的間距
 * 系統——這些規則單純是App Shell特有的「排版結構」（sticky
 * header、水平導覽列、置中容器），不是新的視覺語言。
 */
import { getDesignSystemCSS } from '../health_insight/design_system/design_tokens.js';
import { renderAppHeader } from './components/header.js';
import { renderNavigation } from './components/navigation.js';

/**
 * App Shell專屬的排版CSS——刻意獨立於`getDesignSystemCSS()`
 * （延續整個系列「不共用內部實作細節，各自對公開行為負責」
 * 既有原則），只使用既有CSS變數，不定義任何新的顏色/字體
 * token。
 *
 * @returns {string}
 */
function getAppShellLayoutCSS() {
  return [
    '.app-shell-page {',
    '  min-height: 100vh;',
    '  background: var(--hi-color-background);',
    '  font-family: var(--hi-font-family);',
    '  display: flex;',
    '  flex-direction: column;',
    '}',
    '.app-shell-header {',
    '  position: sticky;',
    '  top: 0;',
    '  z-index: 10;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  gap: var(--hi-card-gap);',
    '  padding: 14px var(--hi-spacing-outer);',
    '  background: var(--hi-color-surface);',
    '  border-bottom: var(--hi-card-border);',
    '}',
    '.app-shell-brand {',
    '  font-weight: 700;',
    '  font-size: 18px;',
    '  color: var(--hi-color-primary-dark);',
    '  text-decoration: none;',
    '}',
    '.app-user-status {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '}',
    '.app-user-status-badge {',
    '  font-size: 12px;',
    '  color: var(--hi-color-text-secondary);',
    '  background: var(--hi-color-surface-alt);',
    '  border-radius: 999px;',
    '  padding: 4px 10px;',
    '}',
    '.app-user-status-cta {',
    '  font-size: 13px;',
    '  color: var(--hi-color-primary-dark);',
    '  text-decoration: none;',
    '}',
    '.app-shell-content {',
    '  flex: 1;',
    '  width: 100%;',
    '  max-width: 640px;',
    '  margin: 0 auto;',
    '  padding: var(--hi-spacing-outer);',
    '  padding-bottom: 88px;',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: var(--hi-spacing-section);',
    '}',
    '.app-nav {',
    '  position: fixed;',
    '  left: 0;',
    '  right: 0;',
    '  bottom: 0;',
    '  z-index: 10;',
    '  display: flex;',
    '  justify-content: space-around;',
    '  background: var(--hi-color-surface);',
    '  border-top: var(--hi-card-border);',
    '  padding: 8px 4px calc(8px + env(safe-area-inset-bottom, 0px));',
    '}',
    '.app-nav-item {',
    '  flex: 1;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  gap: 2px;',
    '  min-height: var(--hi-touch-target);',
    '  justify-content: center;',
    '  text-decoration: none;',
    '  color: var(--hi-color-text-secondary);',
    '  font-size: 12px;',
    '}',
    '.app-nav-item--active {',
    '  color: var(--hi-color-primary-dark);',
    '  font-weight: 600;',
    '}',
    '.app-nav-item--placeholder {',
    '  opacity: 0.5;',
    '}',
    '.app-nav-item-badge {',
    '  font-size: 10px;',
    '}',
    '.app-feature-entry-card {',
    '  text-decoration: none;',
    '  color: inherit;',
    '  cursor: pointer;',
    '}',
    '.app-feature-entry-card--placeholder {',
    '  opacity: 0.6;',
    '  cursor: default;',
    '}',
    '.app-premium-entry-card {',
    '  opacity: 0.85;',
    '}',
    '@media (min-width: 680px) {',
    '  .app-shell-content {',
    '    max-width: 720px;',
    '  }',
    '  .app-nav {',
    '    max-width: 720px;',
    '    left: 50%;',
    '    right: auto;',
    '    transform: translateX(-50%);',
    '    border-radius: 20px 20px 0 0;',
    '  }',
    '}',
  ].join('\n');
}

/**
 * @param {{activeNav?:string, isAuthenticated?:boolean, isGuest?:boolean, bodyHtml?:string, title?:string}} [context]
 * @returns {string}
 */
export function renderAppShell(context) {
  const safeContext = context && typeof context === 'object' ? context : {};
  const bodyHtml = typeof safeContext.bodyHtml === 'string' ? safeContext.bodyHtml : '';
  const title = typeof safeContext.title === 'string' && safeContext.title.length > 0 ? safeContext.title : '健康陪伴';

  return [
    '<!DOCTYPE html>',
    '<html lang="zh-Hant">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    `<style>${getDesignSystemCSS()}${getAppShellLayoutCSS()}</style>`,
    '</head>',
    '<body>',
    '<div class="app-shell-page" data-app-page="shell">',
    renderAppHeader({ isAuthenticated: safeContext.isAuthenticated, isGuest: safeContext.isGuest }),
    '<main class="app-shell-content">',
    bodyHtml,
    '</main>',
    renderNavigation({ activeNav: safeContext.activeNav }),
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');
}

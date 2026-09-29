/*
 * Phase 7 TASK 1.127｜Complete App Experience & UX Commercial Layer
 * - App Navigation（五個入口的導覽列）
 *
 * 責任：定義規格PART2「Product Navigation」要求的五個入口
 * （首頁／健康洞察／紀錄／AI陪伴／我的），並組出對應的導覽列
 * HTML。這是純呈現層——不查詢db、不判斷身份權限（那是各自
 * route/page content的責任），只負責把「目前在哪一頁」跟「哪些
 * 入口目前是placeholder」轉成一致的視覺結構。
 *
 * ## Placeholder原則（規格明確要求）
 *
 * 「AI陪伴」目前只是產品結構的預留位置（規格明確列出
 * Nutrition/Behavior Coaching/AI Coach可以是placeholder），這裡
 * 用`enabled:false`標記——導覽列上依然看得到這個入口（讓使用者
 * 知道未來會有這個功能），但點擊不會導向任何真正的頁面
 * （`href:'#'`，且沒有`<a>`標籤，改用`<span>`避免產生死連結），
 * 標示「敬請期待」，延續整個系列既有的Placeholder視覺語言
 * （例如`behavior_pattern_card.js`/`progress_card.js`）。
 *
 * 「健康洞察」入口刻意連到既有的`/health-insight`（TASK1.116起
 * 已經存在、經過完整驗證的頁面），這裡**不**重新包一層App
 * Shell——延續整個系列「Reuse, don't rebuild」的既有原則，也
 * 避免修改`health_insight_routes.js`造成不必要的回歸風險（見
 * `app_shell.js`檔案頭「Scope Decision」說明）。
 */
import { escapeHtml } from '../../health_insight/components/html_utils.js';

/**
 * 五個Navigation入口的靜態定義——刻意獨立於任何route/db狀態，
 * `key`對應`renderNavigation({activeNav})`的`activeNav`參數。
 */
export const NAV_ITEMS = [
  { key: 'home', label: '首頁', href: '/app', enabled: true },
  { key: 'health-insight', label: '健康洞察', href: '/health-insight', enabled: true },
  { key: 'history', label: '紀錄', href: '/app/history', enabled: true },
  { key: 'ai-coach', label: 'AI陪伴', href: '#', enabled: false },
  { key: 'me', label: '我的', href: '/app/me', enabled: true },
];

/**
 * @param {{activeNav?:string}} [context]
 * @returns {string}
 */
export function renderNavigation(context) {
  const safeContext = context && typeof context === 'object' ? context : {};
  const activeNav = typeof safeContext.activeNav === 'string' ? safeContext.activeNav : '';

  const items = NAV_ITEMS.map((item) => {
    const isActive = item.key === activeNav;
    const classNames = ['app-nav-item'];
    if (isActive) classNames.push('app-nav-item--active');
    if (!item.enabled) classNames.push('app-nav-item--placeholder');

    if (!item.enabled) {
      return [
        `<span class="${escapeHtml(classNames.join(' '))}" aria-disabled="true" data-app-nav="${escapeHtml(item.key)}">`,
        `  <span class="app-nav-item-label">${escapeHtml(item.label)}</span>`,
        '  <span class="app-nav-item-badge">敬請期待</span>',
        '</span>',
      ].join('\n');
    }

    return [
      `<a class="${escapeHtml(classNames.join(' '))}" href="${escapeHtml(item.href)}" data-app-nav="${escapeHtml(item.key)}"${isActive ? ' aria-current="page"' : ''}>`,
      `  <span class="app-nav-item-label">${escapeHtml(item.label)}</span>`,
      '</a>',
    ].join('\n');
  });

  return [
    '<nav class="app-nav" aria-label="主要導覽">',
    items.join('\n'),
    '</nav>',
  ].join('\n');
}

/*
 * Phase 7 TASK 1.127｜Complete App Experience & UX Commercial Layer
 * - 統一輸出入口
 *
 * 把 src/ui/app_shell/ 底下所有可對外使用的東西集中在這裡
 * re-export，跟`src/ui/health_insight/index.js`同樣的既有慣例。
 */
export { renderAppShell } from './app_shell.js';
export { NAV_ITEMS, renderNavigation } from './components/navigation.js';
export { renderAppHeader } from './components/header.js';
export { createFeatureEntryCard } from './components/feature_entry_card.js';
export { createPremiumEntryCard } from './components/premium_entry_card.js';
export { renderHomePageContent } from './pages/home_page.js';
export { renderHistoryPageContent } from './pages/history_page.js';
export { renderUserCenterPageContent } from './pages/user_center_page.js';

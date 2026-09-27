/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * （TASK1.115後更新：新增ASSET_BASE_PATH/UNDERLINE_REGISTRY/
 * getAssetUrl/getAssetAlt/getUnderlineUrl/listUnderlineKeys的
 * 匯出，見下方）
 * - 統一輸出入口
 *
 * 把 src/ui/health_insight/ 底下所有可對外使用的東西集中在這裡
 * re-export——設計系統、資產註冊表、元件、頁面組裝函式。
 *
 * 目前沒有任何route/controller/worker.js import這個目錄——這是
 * 純粹的UI Foundation extension
 * point，本次任務明確禁止建立任何route/controller/API
 * endpoint，也沒有把這些檔案接進worker.js的getHTML()或
 * src/bootstrap/application.js。實際的真實路由整合留給未來
 * 任務決定。
 */
export { COLOR_TOKENS, TYPOGRAPHY_TOKENS, SPACING_TOKENS, CARD_STYLE_TOKENS, BREAKPOINT_TOKENS, getDesignSystemCSS } from './design_system/design_tokens.js';
export {
  ASSET_BASE_PATH, ASSET_REGISTRY, UNDERLINE_REGISTRY,
  listAssetKeys, listUnderlineKeys, getAssetUrl, getAssetAlt, getUnderlineUrl, getAssetPlaceholder, getAssetDescription,
} from './assets/asset_registry.js';
export * from './components/index.js';
export { renderHealthInsightDashboard, renderHealthInsightDashboardError } from './pages/dashboard_page.js';
export { renderHealthInsightInputExperience } from './pages/input_page.js';

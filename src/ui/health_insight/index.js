/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * （TASK1.115後更新：新增ASSET_BASE_PATH/UNDERLINE_REGISTRY/
 * getAssetUrl/getAssetAlt/getUnderlineUrl/listUnderlineKeys的
 * 匯出，見下方；TASK1.116後更新：新增
 * getHealthInsightClientScript()的匯出，見下方）
 * - 統一輸出入口
 *
 * 把 src/ui/health_insight/ 底下所有可對外使用的東西集中在這裡
 * re-export——設計系統、資產註冊表、元件、頁面組裝函式、前端
 * 互動腳本。
 *
 * TASK1.116起：`src/controllers/health_insight_controller.js`
 * 開始import這個目錄（`renderHealthInsightInputExperience`/
 * `renderHealthInsightDashboard`/`renderHealthInsightDashboardError`/
 * `getHealthInsightClientScript`），第一次有真實的
 * route/controller使用這裡的元件——但這個目錄本身完全沒有反向
 * import任何route/controller/worker.js，依然是單向依賴。
 */
export { COLOR_TOKENS, TYPOGRAPHY_TOKENS, SPACING_TOKENS, CARD_STYLE_TOKENS, BREAKPOINT_TOKENS, getDesignSystemCSS } from './design_system/design_tokens.js';
export {
  ASSET_BASE_PATH, ASSET_REGISTRY, UNDERLINE_REGISTRY,
  listAssetKeys, listUnderlineKeys, getAssetUrl, getAssetAlt, getUnderlineUrl, getAssetPlaceholder, getAssetDescription,
} from './assets/asset_registry.js';
export * from './components/index.js';
export { renderHealthInsightDashboard, renderHealthInsightDashboardError } from './pages/dashboard_page.js';
export { renderHealthInsightInputExperience } from './pages/input_page.js';
export { getHealthInsightClientScript } from './client/interaction_script.js';

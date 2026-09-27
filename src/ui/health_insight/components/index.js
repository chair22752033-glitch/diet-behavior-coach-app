/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - 統一輸出入口
 *
 * 把 src/ui/health_insight/components/ 底下所有可對外使用的
 * 元件集中在這裡re-export，跟既有Product Boundary/Capability
 * 目錄同樣的角色（例如`../../intelligence/product/entry/
 * index.js`）。
 *
 * 目前沒有任何route/controller/worker.js import這個目錄——這是
 * 純粹的UI Foundation extension point，本次任務明確禁止建立
 * 任何route/controller，也沒有把這些元件接進worker.js的
 * getHTML()。
 */
export { escapeHtml } from './html_utils.js';
export { getObservationLabel, getRecommendationLabel } from './label_map.js';
export { createHealthSummaryCard } from './health_summary_card.js';
export { createObservationCard, createObservationCardList } from './observation_card.js';
export { createRecommendationCard, createRecommendationCardList } from './recommendation_card.js';
export { createBehaviorPatternPlaceholderCard } from './behavior_pattern_card.js';
export { createProgressPlaceholderCard } from './progress_card.js';
export { createChoiceQuestionCard, createInputQuestionCard } from './question_card.js';
export { classifyErrorReason, createErrorCard } from './error_card.js';

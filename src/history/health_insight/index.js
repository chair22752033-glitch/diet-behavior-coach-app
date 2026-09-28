/*
 * Phase 6 TASK 1.124｜Health Insight Product Completion
 * - 統一輸出入口
 *
 * 把 src/history/health_insight/ 底下所有可對外使用的東西集中在
 * 這裡re-export，跟整個系列既有的"統一輸出入口"慣例一致。
 */
export {
  DEFAULT_HISTORY_LIMIT,
  summarizeHealthInsightRecord,
  getHealthInsightHistoryForIdentity,
} from './history_service.js';

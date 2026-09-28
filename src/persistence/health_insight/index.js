/*
 * Phase 6 TASK 1.120｜Health Insight Data Persistence Foundation
 * - 統一輸出入口
 *
 * 把 src/persistence/health_insight/ 底下所有可對外使用的東西集中
 * 在這裡re-export，跟整個系列既有的"統一輸出入口"慣例一致。
 */
export {
  HEALTH_INSIGHT_SNAPSHOT_VERSION,
  shouldPersistHealthInsightRecord,
  saveHealthInsightRecord,
  listHealthInsightRecordsForUser,
} from './health_insight_persistence_service.js';

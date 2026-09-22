/*
 * Phase 1 TASK 1.12｜D1 Database Access Layer - 統一入口
 *
 * 提供 createDb(env)：供未來 src/worker.js 準備接入 D1 時呼叫的單一入口。
 *
 * 重要：本次任務範圍只建立這個基礎層本身，src/worker.js 完全沒有任何一行
 * import 這裡的任何檔案，現有功能（KV/R2/前端）不受影響、不讀取 D1、
 * 不寫入任何真實使用者資料。
 */
import * as query from './query.js';
import * as txn from './transaction.js';
import { bind as bindUsers } from './tables/users.js';
import { bind as bindExplorationRecords } from './tables/exploration_records.js';
import { bind as bindFoodEvents } from './tables/food_events.js';
import { bind as bindEmotionRecords } from './tables/emotion_records.js';
import { bind as bindBehaviorPatterns } from './tables/behavior_patterns.js';
import { bind as bindAiReports } from './tables/ai_reports.js';

/**
 * @param {object} env - Worker 的 env 物件（ES Module fetch handler 的第二個參數）
 * @returns {object} db access 物件，包含底層 query/transaction 方法與每張表的 helper
 */
export function createDb(env) {
  if (!env || !env.DIET_COACH_DB) {
    throw new Error('env.DIET_COACH_DB binding 不存在，請確認 wrangler.toml 已設定 D1 binding（見 TASK1.11）');
  }
  const db = env.DIET_COACH_DB;
  return {
    raw: db,
    run: (sql, params) => query.run(db, sql, params),
    all: (sql, params) => query.all(db, sql, params),
    first: (sql, params) => query.first(db, sql, params),
    batch: (statements) => txn.batch(db, statements),
    withTransaction: (builderFn) => txn.withTransaction(db, builderFn),
    users: bindUsers(db),
    explorationRecords: bindExplorationRecords(db),
    foodEvents: bindFoodEvents(db),
    emotionRecords: bindEmotionRecords(db),
    behaviorPatterns: bindBehaviorPatterns(db),
    aiReports: bindAiReports(db),
  };
}

export { query, txn };

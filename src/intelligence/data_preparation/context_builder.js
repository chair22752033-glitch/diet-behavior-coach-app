/*
 * Phase 1 TASK 1.41｜Intelligence Data Preparation Layer
 * - Context Builder
 *
 * 責任：從既有五大 Domain Service（TASK1.15）組合出「未來分析要用的
 * 原始 context」。這一層的架構位置：
 *
 *   User Data
 *     ↓
 *   Domain Services（TASK1.15，既有、不修改）
 *     ↓
 *   Intelligence Data Preparation Layer（這裡）
 *     ↓
 *   Insight Service（TASK1.40）
 *     ↓
 *   Analysis Engine / Recommendation Engine（TASK1.40）
 *
 * 完全沒有：
 * - SQL / db.prepare() / 任何直接的 D1 操作（不 import src/db/ 底下
 *   任何檔案）——一律透過既有的 exploration_service.js/food_service.js/
 *   emotion_service.js/behavior_service.js/report_service.js/
 *   user_service.js（TASK1.15既有函式，這裡完全不修改、不重新實作
 *   任何一行查詢邏輯）
 * - Session/Cookie 解析（不 import src/auth/ 或 src/identity/）——
 *   userId 一律由呼叫端（未來的Insight Service或更上層）當作獨立參數
 *   傳入，這裡完全不知道「目前是誰登入」這件事
 * - HTTP 處理（不知道 Request/Response 是什麼，不 import 任何路由/
 *   controller 檔案）
 * - 任何解讀/推論邏輯（不判斷「這筆資料代表什麼」，只負責「把資料
 *   原樣蒐集起來」）
 *
 * 失敗處理：跟 dashboard_service.js（TASK1.36）/timeline_service.js
 * （TASK1.38）同樣的哲學——Promise.all()平行送出五個查詢後，只要其中
 * 任何一個回傳{ok:false}，整個context視為建立失敗，不會用「部分資料
 * + 靜默省略」的方式回傳。
 */
import { getUserExplorations } from '../../services/exploration_service.js';
import { listFoodHistory } from '../../services/food_service.js';
import { listEmotionHistory } from '../../services/emotion_service.js';
import { getBehaviorPatterns } from '../../services/behavior_service.js';
import { getReports } from '../../services/report_service.js';
import { requireActiveUser } from '../../services/user_service.js';

/**
 * @returns {{buildContext: (db:object, userId:string, options?:{limit?:number}) => Promise<{ok:boolean, context?:object, reason?:string, error?:string}>}}
 */
export function createContextBuilder() {
  /**
   * @param {object} db - createDb(env) 回傳的 db 物件（TASK1.12），一律
   *   由呼叫端傳入，這裡不持有任何狀態、不快取
   * @param {string} userId - 一律是已經確認過的使用者id，由呼叫端
   *   （未來的Insight Service）當作獨立參數傳入，不會、也不能從
   *   session/payload/query推導
   * @param {object} [options] - {limit?}：五個子查詢共用同一個limit
   *   （選填，不提供時各自套用domain service自己的預設值），跟
   *   dashboard_service.js/timeline_service.js既有慣例一致
   * @returns {Promise<{ok:boolean, context?:{user:object, explorations:Array, foodEvents:Array, emotions:Array, behaviors:Array, reports:Array}, reason?:string, error?:string}>}
   */
  async function buildContext(db, userId, options) {
    options = options || {};
    const limit = options.limit;

    const userCheck = await requireActiveUser(db, userId);
    if (!userCheck.ok) {
      return { ok: false, reason: userCheck.reason };
    }

    const [explorationsResult, foodResult, emotionsResult, behaviorsResult, reportsResult] = await Promise.all([
      getUserExplorations(db, userId, limit),
      listFoodHistory(db, userId, limit),
      listEmotionHistory(db, userId, limit),
      getBehaviorPatterns(db, userId, { limit }),
      getReports(db, userId, limit),
    ]);

    const sections = [
      ['explorations', explorationsResult],
      ['foodEvents', foodResult],
      ['emotions', emotionsResult],
      ['behaviors', behaviorsResult],
      ['reports', reportsResult],
    ];

    const failedSection = sections.find(([, result]) => !result.ok);
    if (failedSection) {
      const [, result] = failedSection;
      return { ok: false, reason: result.reason || result.error || 'context_build_failed' };
    }

    return {
      ok: true,
      context: {
        user: userCheck.user,
        explorations: explorationsResult.results,
        foodEvents: foodResult.results,
        emotions: emotionsResult.results,
        behaviors: behaviorsResult.results,
        reports: reportsResult.results,
      },
    };
  }

  return { buildContext };
}

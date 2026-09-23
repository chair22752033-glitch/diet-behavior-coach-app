/*
 * Phase 1 TASK 1.36｜Dashboard Aggregation Service
 *
 * 整合 TASK1.15 五大 Domain Service（exploration/food/emotion/behavior/
 * report），提供登入後首頁需要的單一聚合入口。完全不重新實作任何一段
 * 已經測試過的查詢邏輯——五個子查詢一律呼叫既有的
 * getUserExplorations()/listFoodHistory()/listEmotionHistory()/
 * getBehaviorPatterns()/getReports()，這裡只負責「並行呼叫 + 組合結果」。
 *
 * 使用者存在/狀態檢查只做一次（requireActiveUser()），不需要讓五個子
 * service各自重複查一次users表——這裡先確認過user合法，才平行送出五個
 * 查詢；不合法就直接短路回傳，完全不會呼叫任何domain service。
 *
 * 安全設計：五個子查詢的userId來源都是這個函式收到的同一個userId參數，
 * 呼叫端（dashboard_controller.js）保證它只會是session驗證後的
 * ctx.user.id，不會是任何payload/query帶來的值——這裡完全信任呼叫端
 * 已經做過這件事，本身不重新驗證（跟 src/controllers/data_controller.js
 * 的既有信任模型一致）。
 *
 * 失敗處理：Promise.all()平行送出五個查詢後，只要其中任何一個回傳
 * {ok:false}，整個dashboard視為失敗（不會用「部分資料 + 靜默省略」的
 * 方式回傳，避免使用者誤以為某個分類「本來就沒有資料」，而不是「查詢
 * 失敗」），並在回傳值上標記是哪個區塊失敗（failedSection），方便除錯。
 */
import { getUserExplorations } from './exploration_service.js';
import { listFoodHistory } from './food_service.js';
import { listEmotionHistory } from './emotion_service.js';
import { getBehaviorPatterns } from './behavior_service.js';
import { getReports } from './report_service.js';
import { requireActiveUser } from './user_service.js';

/**
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {string} userId
 * @param {object} [options] - {limit}：五個子查詢共用同一個limit
 *   （選填，不提供時各自套用domain service自己的預設值）
 * @returns {Promise<{ok:boolean, explorations?:Array, foodEvents?:Array,
 *   emotions?:Array, behaviors?:Array, reports?:Array, reason?:string,
 *   error?:string, failedSection?:string}>}
 */
export async function getDashboard(db, userId, options) {
  options = options || {};

  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) {
    return { ok: false, reason: userCheck.reason };
  }

  const limit = options.limit;

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
    const [sectionName, result] = failedSection;
    return { ok: false, reason: result.reason || result.error || 'aggregation_failed', failedSection: sectionName };
  }

  return {
    ok: true,
    explorations: explorationsResult.results,
    foodEvents: foodResult.results,
    emotions: emotionsResult.results,
    behaviors: behaviorsResult.results,
    reports: reportsResult.results,
  };
}

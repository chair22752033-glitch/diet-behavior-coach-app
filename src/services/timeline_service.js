/*
 * Phase 1 TASK 1.38｜User Timeline & History Query Layer - Timeline Service
 *
 * 整合 TASK1.15 五大 Domain Service（exploration/food/emotion/behavior/
 * report）已經存在、測試過的查詢函式，依時間把使用者不同來源的歷史紀錄
 * 整合成單一時間軸。完全不重新實作任何一段查詢邏輯，也不修改任何一個
 * domain service的行為——五個子查詢一律呼叫既有的
 * getUserExplorations()/listFoodHistory()/listEmotionHistory()/
 * getBehaviorPatterns()/getReports()，這裡只負責「並行取得 + 整合格式 +
 * 排序 + 分頁」。
 *
 * 不直接操作SQL：這個檔案完全沒有 import src/db/ 底下任何檔案，也沒有
 * 任何 db.prepare()。userId 一律由呼叫端（timeline_controller.js）傳入
 * 的獨立參數，不會、也不能從其他地方取得。
 *
 * 使用者存在/狀態檢查只做一次（requireActiveUser()，跟
 * dashboard_service.js/profile_service.js同一套既有共用邏輯），不需要
 * 讓五個子service各自重複查一次users表——不合法就直接短路回傳，完全
 * 不會呼叫任何domain service。
 *
 * 失敗處理（呼應TASK1.38規格「任何子service失敗：整體安全返回錯誤，
 * 不可部分資料成功、部分資料靜默遺失」）：Promise.all()平行送出五個
 * 查詢後，只要其中任何一個回傳{ok:false}，整個timeline視為失敗，不會
 * 用「部分資料 + 靜默省略遺失的來源」的方式回傳。
 */
import { getUserExplorations } from './exploration_service.js';
import { listFoodHistory } from './food_service.js';
import { listEmotionHistory } from './emotion_service.js';
import { getBehaviorPatterns } from './behavior_service.js';
import { getReports } from './report_service.js';
import { requireActiveUser } from './user_service.js';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

// 大到足以取得該使用者在單一來源的「全部」歷史紀錄，用於merge後正確
// 計算跨來源的total、並做跨來源的整體排序/分頁。刻意重用五個既有domain
// service函式本來就有的limit參數（不新增、不修改任何一個domain
// service的簽章或行為），只是這裡傳入一個夠大的值，等同「這個來源目前
// 沒有分頁限制地全部取回」，真正的limit/offset分頁是在merge之後由這個
// service自己處理，不是每個來源各自分頁（各自分頁會讓「依timestamp
// 全域排序後再分頁」變得不正確）。
const SOURCE_FETCH_LIMIT = 10000;

/**
 * 把 query string 傳進來的原始值（字串、undefined、null…）安全轉成
 * 1～MAX_LIMIT 之間的正整數，格式不對或超出範圍一律回退到DEFAULT_LIMIT
 * （不拒絕、不噴錯——跟 data_controller.js 既有的 parseLimit() 同樣的
 * 「defensive normalize」哲學，避免一個不合法的limit值就讓整個查詢
 * 失敗）。
 */
export function normalizeLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * 同上，offset 沒有上限，只保證是 >=0 的整數，不合法一律回退到 0。
 */
export function normalizeOffset(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function toTimelineItem(type, row) {
  return {
    id: `${type}-${row.id}`,
    type,
    timestamp: row.created_at,
    data: row, // 原始資料，不做任何篩選/改寫（規格明確要求「原始xxx資料」）
  };
}

/**
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {string} userId - 一律是已經驗證過session的使用者id，由呼叫端
 *   （timeline_controller.js）傳入的獨立參數
 * @param {object} [options] - {limit?, offset?}（原始值，這個函式自己
 *   負責normalize）
 * @returns {Promise<{ok:boolean, timeline?:Array, pagination?:object,
 *   reason?:string, error?:string}>}
 */
export async function getTimeline(db, userId, options) {
  options = options || {};
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);

  const userCheck = await requireActiveUser(db, userId);
  if (!userCheck.ok) {
    return { ok: false, reason: userCheck.reason };
  }

  const [explorationResult, foodResult, emotionResult, behaviorResult, reportResult] = await Promise.all([
    getUserExplorations(db, userId, SOURCE_FETCH_LIMIT),
    listFoodHistory(db, userId, SOURCE_FETCH_LIMIT),
    listEmotionHistory(db, userId, SOURCE_FETCH_LIMIT),
    getBehaviorPatterns(db, userId, { limit: SOURCE_FETCH_LIMIT }),
    getReports(db, userId, SOURCE_FETCH_LIMIT),
  ]);

  const sections = [
    ['exploration', explorationResult],
    ['food', foodResult],
    ['emotion', emotionResult],
    ['behavior', behaviorResult],
    ['report', reportResult],
  ];

  // 任何一個來源失敗，整體視為失敗——不會用「部分資料成功、失敗的來源
  // 靜默省略」的方式回傳，避免使用者誤以為某個分類「本來就沒有資料」。
  const failedSection = sections.find(([, result]) => !result.ok);
  if (failedSection) {
    const [, result] = failedSection;
    return { ok: false, reason: result.reason || result.error || 'timeline_query_failed' };
  }

  const items = [];
  for (const [type, result] of sections) {
    for (const row of result.results) {
      items.push(toTimelineItem(type, row));
    }
  }

  // 依 timestamp 新到舊排序（DESC）。timestamp 一律是 created_at 的
  // ISO/SQLite datetime字串，字串比較即可正確反映時間先後。
  items.sort((a, b) => {
    if (a.timestamp === b.timestamp) return 0;
    return a.timestamp < b.timestamp ? 1 : -1;
  });

  const total = items.length;
  const page = items.slice(offset, offset + limit);

  return {
    ok: true,
    timeline: page,
    pagination: { limit, offset, total },
  };
}

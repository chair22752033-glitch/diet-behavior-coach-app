/*
 * Phase 1 TASK 1.41｜Intelligence Data Preparation Layer
 * - Data Normalizer
 *
 * 責任：把 context_builder.js 產生的原始 context（domain service的
 * 原始row資料）轉成穩定、可預期的「intelligence input格式」。
 *
 * 明確要求（規格原文）：
 * - deterministic output：同樣的輸入，任何時候呼叫都得到完全相同的
 *   輸出，不依賴 Date.now()/Math.random() 或任何外部狀態
 * - no AI logic：不做任何推論、分類、摘要
 * - no recommendation logic：不產生任何建議
 * - no scoring unless already existing domain data provides it：
 *   不自己計算任何新的分數/信心值——behavior_patterns裡既有的
 *   confidence_score欄位原樣保留（因為那是domain資料本來就有的
 *   欄位，不是這裡新算出來的），但這裡完全不會讀取它、加總它、或
 *   拿它做任何進一步計算
 *
 * 完全沒有：
 * - SQL / db.prepare() / 任何 D1 操作（這個檔案完全是純函式，甚至不
 *   接受db參數）
 * - Session/HTTP 相關邏輯
 * - 任何 AI API 呼叫
 */

/**
 * 把 requireActiveUser() 回傳的原始 users 表 row 轉成安全、穩定的欄位
 *子集——刻意排除 auth_provider_id/legacy_sync_code/updated_at/
 * last_login_at 等實作細節欄位，只保留分析情境下有意義、不涉及帳號
 * 安全的欄位（呼應profile_service.js既有的「白名單輸出」設計原則）。
 *
 * @param {object|null} user
 * @returns {object|null}
 */
function normalizeUser(user) {
  if (!user || typeof user !== 'object') return null;
  return {
    id: user.id,
    isGuest: user.is_guest === 1 || user.is_guest === true,
    authProvider: user.auth_provider || null,
    status: user.status || null,
    createdAt: user.created_at || null,
  };
}

/**
 * 把一組domain資料列陣列轉成 {count, items} 的穩定結構——items內容
 * 完全原樣保留（shallow copy，不篩選欄位、不新增欄位、不計算任何值），
 * 只是額外附上count方便未來Analysis Engine不用自己再算一次長度。
 * 非陣列或缺少的輸入一律安全視為空清單，不拋出例外。
 *
 * @param {Array|*} rows
 * @returns {{count:number, items:Array}}
 */
function normalizeList(rows) {
  const items = Array.isArray(rows) ? rows.map((row) => Object.assign({}, row)) : [];
  return { count: items.length, items };
}

/**
 * @returns {{normalize: (context:object) => object}}
 */
export function createDataNormalizer() {
  /**
   * @param {object} context - context_builder.js 的 buildContext() 產生
   *   的 {user, explorations, foodEvents, emotions, behaviors, reports}
   * @returns {{user:object|null, explorations:{count,items}, foodEvents:{count,items}, emotions:{count,items}, behaviors:{count,items}, reports:{count,items}}}
   */
  function normalize(context) {
    context = context && typeof context === 'object' ? context : {};
    return {
      user: normalizeUser(context.user),
      explorations: normalizeList(context.explorations),
      foodEvents: normalizeList(context.foodEvents),
      emotions: normalizeList(context.emotions),
      behaviors: normalizeList(context.behaviors),
      reports: normalizeList(context.reports),
    };
  }

  return { normalize };
}

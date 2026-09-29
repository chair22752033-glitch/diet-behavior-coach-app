/*
 * Phase 6 TASK 1.124｜Health Insight Product Completion
 * （Phase 7 TASK1.126後更新：`isAuthenticatedIdentity()`新增
 * 訪客帳號排除，見下方新增的`isGuestIdentity()`說明）
 * - History Retrieval Boundary（History Service）
 *
 * 責任：規格目標架構"User Identity → History Service → Persistence
 * Layer"這一步的具體落地——把TASK1.120既有的
 * `listHealthInsightRecordsForUser()`（存在但至今沒有任何
 * route/controller呼叫過）包成一層安全、對外的History存取邊界。
 *
 * ## 分工（規格明確要求："Do NOT query database directly from
 * UI"）
 *
 * User Identity（TASK1.118/1.119既有）
 *   ↓
 * History Service（這裡）
 *   ↓
 *  Persistence Layer（`src/persistence/health_insight/`，TASK1.120
 *   既有，本次任務不修改）
 *
 * 呼叫這個模組的只有`src/routes/health_insight_routes.js`——UI層
 * （`src/ui/health_insight/`底下所有檔案）完全不import這個模組，
 * 也不知道D1/persistence長什麼樣子，只接收這裡已經整理成安全
 * 摘要格式的`records`陣列。
 *
 * ## Security requirement（規格明確要求："A user must never access
 * another user's records"）
 *
 * 這個模組的公開函式**只接受`identity`物件，不接受任意的
 * `userId`字串參數**——實際拿去查詢的`userId`永遠只能來自
 * `identity.userId`（TASK1.118/1.119既有身份解析結果，由
 * session/OAuth驗證產生，不是使用者可以自由填寫的欄位）。呼叫端
 * 不可能、也沒有管道傳入「想查誰的紀錄」，結構性地排除了"使用者
 * 查到別人紀錄"的可能性。
 *
 * ## Anonymous behavior（規格明確要求："Anonymous user: no history
 * access"）
 *
 * 匿名使用者（`identity.authenticated !== true`）**完全不會**
 * 觸發任何D1查詢——直接安全回傳空紀錄清單，不嘗試查詢、不拋出
 * 例外、也不會因為查詢條件湊巧symmetry而不小心查到任何真實資料列。
 *
 * ## 安全摘要格式（規格明確要求：Progress must be based on
 * existing stored product data only；不做任何AI/評分判斷）
 *
 * `summarizeRecord()`把TASK1.120存的原始D1 row（`input_snapshot`/
 * `output_snapshot`兩個JSON字串欄位）解析、萃取成只有UI排版需要
 * 的最小安全欄位（`id`/`createdAt`/`healthGoal`/
 * `observationCount`/`recommendationCount`），純粹是既有已存
 * 資料的欄位挑選跟計數，不做任何健康評分/醫療判讀/AI生成文字。
 *
 * ## Failure isolation（延續整個系列既有慣例）
 *
 * `getHealthInsightHistoryForIdentity()`**永遠不會拋出例外**——
 * 任何查詢失敗都安全退回空紀錄清單，不影響呼叫端（POST
 * /api/health-insight主流程、GET /api/health-insight/history）繼續
 * 完成請求。
 */
import { listHealthInsightRecordsForUser } from '../../persistence/health_insight/index.js';

/**
 * History呈現層預設顯示的紀錄筆數上限——刻意獨立於
 * `src/persistence/health_insight/`任何常數（延續整個系列"不共用
 * 內部實作細節，各自對公開行為負責"的既有原則）。
 */
export const DEFAULT_HISTORY_LIMIT = 5;

/**
 * 判斷某個identity是不是訪客帳號（`is_guest:1`）——Phase 7
 * TASK1.126新增，獨立實作（不import `src/identity/`任何檔案，
 * 延續整個系列"不共用內部實作細節，各自對公開行為負責"既有
 * 原則）。同時接受`identity.isGuest === true`（TASK1.126新增的
 * 顯式欄位）跟`identity.provider === 'guest'`（既有欄位，向下
 * 相容既有只手動組出三欄位identity的呼叫端/測試fixture）兩種
 * 寫法。
 *
 * @param {*} identity
 * @returns {boolean}
 */
function isGuestIdentity(identity) {
  return !!(identity && typeof identity === 'object' && (identity.isGuest === true || identity.provider === 'guest'));
}

/**
 * TASK1.126更新：訪客帳號排除。規格原文"Guest: Cannot query
 * history, retrieve previous records"——訪客帳號即使
 * `authenticated:true`，History Retrieval Boundary也一律視為
 * 沒有查詢資格，安全回傳空紀錄清單（見
 * `getHealthInsightHistoryForIdentity()`），不會嘗試任何D1查詢。
 * Security規則依然是"identity based, not frontend userId
 * based"——這裡沒有改變"用什麼決定查誰的紀錄"，只是新增了
 * "誰有資格查"這一層額外判斷。
 */
function isAuthenticatedIdentity(identity) {
  return !!(
    identity &&
    typeof identity === 'object' &&
    identity.authenticated === true &&
    typeof identity.userId === 'string' &&
    identity.userId.length > 0 &&
    !isGuestIdentity(identity)
  );
}

function safeParseJsonObject(value) {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

/**
 * 把D1原始row轉成UI安全摘要——不外洩`input_snapshot`/
 * `output_snapshot`原始JSON字串本身，也不外洩`user_id`（呼叫端
 * 已經知道是自己的紀錄，不需要在每一筆裡重複帶出user_id）。
 *
 * @param {object} record
 * @returns {{id:string|null, createdAt:string|null, healthGoal:string|null, observationCount:number, recommendationCount:number}}
 */
export function summarizeHealthInsightRecord(record) {
  const safeRecord = record && typeof record === 'object' ? record : {};
  const inputSnapshot = safeParseJsonObject(safeRecord.input_snapshot);
  const outputSnapshot = safeParseJsonObject(safeRecord.output_snapshot);
  return {
    id: typeof safeRecord.id === 'string' ? safeRecord.id : null,
    createdAt: typeof safeRecord.created_at === 'string' ? safeRecord.created_at : null,
    healthGoal: typeof inputSnapshot.healthGoal === 'string' ? inputSnapshot.healthGoal : null,
    observationCount: Array.isArray(outputSnapshot.healthObservation) ? outputSnapshot.healthObservation.length : 0,
    recommendationCount: Array.isArray(outputSnapshot.recommendation) ? outputSnapshot.recommendation.length : 0,
  };
}

/**
 * 查詢某個身份的Health Insight歷史紀錄摘要——這是History
 * Retrieval Boundary唯一的對外入口。
 *
 * @param {object} db - createDb(env)（TASK1.12）回傳的db物件
 * @param {{userId:string|null, authenticated:boolean, provider:string|null}} identity - TASK1.118/1.119既有身份物件
 * @param {object} [options] - {limit}
 * @returns {Promise<{ok:true, authenticated:boolean, records:Array}>} 永遠回傳`ok:true`——查詢失敗時`records`安全退回空陣列，不把D1錯誤細節往上傳遞（延續"Failure to read history must NOT break the user's Health Insight experience"）
 */
export async function getHealthInsightHistoryForIdentity(db, identity, options) {
  if (!isAuthenticatedIdentity(identity)) {
    return { ok: true, authenticated: false, records: [] };
  }

  const safeOptions = options && typeof options === 'object' ? options : {};
  const limit = typeof safeOptions.limit === 'number' && safeOptions.limit > 0 ? safeOptions.limit : DEFAULT_HISTORY_LIMIT;

  try {
    const result = await listHealthInsightRecordsForUser(db, identity.userId, { limit });
    if (!result || !result.ok || !Array.isArray(result.records)) {
      return { ok: true, authenticated: true, records: [] };
    }
    return { ok: true, authenticated: true, records: result.records.map(summarizeHealthInsightRecord) };
  } catch (e) {
    return { ok: true, authenticated: true, records: [] };
  }
}

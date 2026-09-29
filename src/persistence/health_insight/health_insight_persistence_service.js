/*
 * Phase 6 TASK 1.120｜Health Insight Data Persistence Foundation
 * （Phase 7 TASK1.126後更新：`shouldPersistHealthInsightRecord()`
 * 新增訪客帳號排除，見下方"User Ownership"區塊更新說明）
 * - Health Insight Persistence Service
 *
 * 責任：把Health Insight流程成功產出的結構化Product
 * Response（TASK1.117既有形狀）安全地存進新的`health_insight_records`
 * 表——這是唯一允許出現SQL呼叫的地方（透過`db.healthInsightRecords`，
 * 見`src/db/tables/health_insight_records.js`），Controller/Route/
 * UI層完全不直接碰SQL。
 *
 * 架構位置（規格原文）：
 *
 *   Health Insight Result（成功的Structured Product Response）
 *     ↓
 *   Persistence Boundary（這裡）
 *     ↓
 *   D1 Database（health_insight_records表）
 *     ↓
 *   未來History/Trend/Personalization
 *
 * ## User Ownership（規格明確要求）
 *
 * 只有`identity.authenticated === true`且`identity.userId`是真正
 * 的字串、**且不是訪客帳號**時才會嘗試寫入——
 * `shouldPersistHealthInsightRecord()`是這個判斷的唯一入口。
 * 匿名使用者（`ANONYMOUS_IDENTITY`）**完全不會**觸發任何D1寫入，
 * 也**不會**被賦予任何假的user_id（延續"Anonymous users must
 * NOT create fake identities"的明確要求）。
 *
 * ## TASK1.126更新：訪客帳號（Guest）排除
 *
 * TASK1.125審查發現既有Guest帳號（`is_guest:1`，有真實D1 user
 * row/session的完整功能帳號）被`buildUserIdentity()`轉成跟
 * Google登入使用者完全相同的`authenticated:true`，導致這裡
 * 原本會把Guest帳號的Health Insight結果也存進D1——這跟規格
 * "Guest users: no persistent record"的原始設想有落差。這裡
 * 新增`isGuestIdentity()`判斷（同時接受TASK1.126新增的
 * `identity.isGuest`欄位，或既有的`identity.provider ===
 * 'guest'`），只要是訪客帳號就一律不寫入，即使`authenticated`
 * 是`true`。**這不影響既有的持久化能力本身**——`insert()`/
 * D1 schema/白名單欄位規則完全沒有改變，只是"誰有資格觸發寫入"
 * 這道permission boundary變嚴格了。
 *
 * ## Failure Isolation（規格明確要求）
 *
 * `saveHealthInsightRecord()`**永遠不會拋出例外**——任何失敗
 * （db.healthInsightRecords不存在、D1寫入失敗、輸入格式不符）
 * 都安全回傳`{ok:false, reason}`，呼叫端（`src/routes/
 * health_insight_routes.js`）即使完全不處理回傳值，也不會影響
 * 使用者原本已經算好的Health Insight結果（"Failure to save must
 * NOT break the user's Health Insight experience"在這裡是結構性
 * 保證，不是呼叫端自己要記得try/catch）。
 *
 * ## Stored Data Boundary（規格明確要求：只存這些，不多存）
 *
 * - `input_snapshot`：重新從原始payload套用**獨立的**白名單清理
 *   （gender/age/height/weight/healthGoal，跟
 *   `health_insight_controller.js`內部的`buildProfileFromPayload()`
 *   刻意各自獨立實作、不共用——Persistence Service不應該依賴
 *   Controller的內部實作細節，兩者各自對同一份公開白名單規則
 *   負責）
 * - `output_snapshot`：Response Builder（TASK1.117）產出的
 *   `data`欄位原樣序列化——這已經是既有的"對外安全"輸出（不含
 *   `reason`/`field`/`stage`/`boundary`/任何internal capability
 *   structure）
 * - 完全不存：OAuth token、session token、密碼、provider憑證、
 *   internal runtime state、execution lifecycle metadata、stack
 *   trace——這個檔案完全不import `src/auth/`、`src/oauth/`、
 *   `src/identity/session_rules.js`，也不接觸例外物件本身（只
 *   在catch區塊記錄固定的`'unknown_error'`字串）
 */

/**
 * Health Insight Persistence Boundary的snapshot schema版本——跟
 * Intelligence Feature/Capability本身的版本號完全無關，純粹標記
 * "這筆紀錄的input_snapshot/output_snapshot欄位是照哪一版規則
 * 存的"，供未來讀取歷史紀錄時知道要用哪一版規則解析。
 */
export const HEALTH_INSIGHT_SNAPSHOT_VERSION = '1.0.0';

/**
 * Input Experience目前收集的使用者輪廓欄位白名單——刻意獨立於
 * `health_insight_controller.js`的同名白名單（見上方檔案頭
 * "Stored Data Boundary"說明）。
 */
const PROFILE_FIELDS = ['gender', 'age', 'height', 'weight', 'healthGoal'];
const MAX_STRING_VALUE_LENGTH = 100;

function sanitizeProfileValue(value) {
  if (typeof value === 'string') {
    return value.slice(0, MAX_STRING_VALUE_LENGTH);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

/**
 * @param {*} payload
 * @returns {object}
 */
function buildInputSnapshot(payload) {
  const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const snapshot = {};
  PROFILE_FIELDS.forEach((field) => {
    const value = sanitizeProfileValue(safePayload[field]);
    if (value !== null) {
      snapshot[field] = value;
    }
  });
  return snapshot;
}

function toSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toSafeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * 把Response Builder（TASK1.117）的成功`data`欄位正規化成安全可
 * 儲存的物件——跟`health_insight_response_builder.js`的
 * `buildSuccessResponse()`刻意做一樣的防禦性正規化（獨立實作，
 * 理由同上），確保就算未來`data`形狀有任何非預期變化，這裡也
 * 不會把非預期的內容原樣存進D1。
 *
 * @param {*} data
 * @returns {object}
 */
function buildOutputSnapshot(data) {
  const safeData = toSafeObject(data);
  return {
    healthObservation: toSafeArray(safeData.healthObservation),
    behaviorPattern: toSafeArray(safeData.behaviorPattern),
    recommendation: toSafeArray(safeData.recommendation),
    progressTrend: toSafeObject(safeData.progressTrend),
    decision: safeData.decision !== undefined ? safeData.decision : null,
  };
}

/**
 * 判斷某個identity是不是訪客帳號（`is_guest:1`）——TASK1.126
 * 新增，獨立實作（不import `src/identity/`任何檔案，延續整個
 * 系列"不共用內部實作細節，各自對公開行為負責"既有原則）。同時
 * 接受`identity.isGuest === true`（TASK1.126新增的顯式欄位）
 * 跟`identity.provider === 'guest'`（既有欄位，向下相容既有
 * 只手動組出三欄位identity的呼叫端/測試fixture）兩種寫法。
 *
 * @param {*} identity
 * @returns {boolean}
 */
function isGuestIdentity(identity) {
  return !!(identity && typeof identity === 'object' && (identity.isGuest === true || identity.provider === 'guest'));
}

/**
 * 判斷這次請求是否應該嘗試持久化——判斷依據是
 * `identity.authenticated`跟`identity.userId`，**加上TASK1.126
 * 新增的訪客排除**：訪客帳號（`isGuestIdentity(identity)`為
 * true）即使`authenticated:true`也不應該被持久化。這是TASK1.125
 * 記錄的產品語意落差在這裡的具體修正——規格原文"Guest users:
 * no persistent record"——訪客能完整體驗Health Insight（Input→
 * Analysis→Recommendation→Dashboard），但不會留下任何歷史紀錄，
 * 只有真正的Google登入使用者（`userType:'registered'`）才會被
 * 存。這裡**不做**任何額外的業務判斷（例如是否訂閱、是否啟用
 * 某功能——那些是未來Membership/Feature Permission的職責，見
 * `src/membership/`，本次任務沒有修改）。
 *
 * @param {{userId:string|null, authenticated:boolean, provider:string|null, isGuest?:boolean, userType?:string}} identity
 * @returns {boolean}
 */
export function shouldPersistHealthInsightRecord(identity) {
  return !!(
    identity &&
    typeof identity === 'object' &&
    identity.authenticated === true &&
    typeof identity.userId === 'string' &&
    identity.userId.length > 0 &&
    !isGuestIdentity(identity)
  );
}

/**
 * 把一次成功的Health Insight請求存成一筆`health_insight_records`
 * 紀錄——**永遠不會拋出例外**，任何失敗都安全回傳
 * `{ok:false, reason}`。
 *
 * @param {object} db - createDb(env)（TASK1.12）回傳的db物件
 * @param {object} params
 * @param {{userId:string|null, authenticated:boolean, provider:string|null}} params.identity
 * @param {*} params.payload - 原始POST /api/health-insight的HTTP body
 * @param {{ok:boolean, data?:object}} params.structuredResponse - TASK1.117既有的結構化Product Response
 * @param {number|string|Date} [params.now] - 選填，測試用的時間覆寫
 * @returns {Promise<{ok:true, id:string}|{ok:false, reason:string}>}
 *   reason 可能是 'anonymous_skip'（匿名使用者，刻意不存）|
 *   'guest_skip'（TASK1.126新增：訪客帳號，刻意不存）|
 *   'not_successful_result'（Health Insight本身失敗，不存失敗結果）|
 *   'invalid_db'（db不可用）| 'db_error'（D1寫入失敗）|
 *   'unknown_error'（任何未預期例外，不外洩例外訊息本身）
 */
export async function saveHealthInsightRecord(db, params) {
  const safeParams = params && typeof params === 'object' ? params : {};

  if (!shouldPersistHealthInsightRecord(safeParams.identity)) {
    return { ok: false, reason: isGuestIdentity(safeParams.identity) ? 'guest_skip' : 'anonymous_skip' };
  }

  if (!safeParams.structuredResponse || typeof safeParams.structuredResponse !== 'object' || !safeParams.structuredResponse.ok) {
    return { ok: false, reason: 'not_successful_result' };
  }

  try {
    if (!db || !db.healthInsightRecords || typeof db.healthInsightRecords.insert !== 'function') {
      return { ok: false, reason: 'invalid_db' };
    }

    const now = (safeParams.now ? new Date(safeParams.now) : new Date()).toISOString();
    const record = {
      id: crypto.randomUUID(),
      user_id: safeParams.identity.userId,
      insight_version: HEALTH_INSIGHT_SNAPSHOT_VERSION,
      input_snapshot: JSON.stringify(buildInputSnapshot(safeParams.payload)),
      output_snapshot: JSON.stringify(buildOutputSnapshot(safeParams.structuredResponse.data)),
      created_at: now,
    };

    const result = await db.healthInsightRecords.insert(record);
    if (!result || !result.ok) {
      return { ok: false, reason: 'db_error' };
    }

    return { ok: true, id: record.id };
  } catch (e) {
    return { ok: false, reason: 'unknown_error' };
  }
}

/**
 * 查詢某使用者既有的Health Insight歷史紀錄——供未來History/Trend
 * /Personalization功能使用，本次任務沒有任何route/controller
 * 呼叫這個函式。
 *
 * @param {object} db
 * @param {string} userId
 * @param {object} [options] - {limit}
 * @returns {Promise<{ok:true, records:Array}|{ok:false, reason:string}>}
 */
export async function listHealthInsightRecordsForUser(db, userId, options) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  if (typeof userId !== 'string' || userId.length === 0) {
    return { ok: false, reason: 'missing_user_id' };
  }
  try {
    if (!db || !db.healthInsightRecords || typeof db.healthInsightRecords.listByUser !== 'function') {
      return { ok: false, reason: 'invalid_db' };
    }
    const result = await db.healthInsightRecords.listByUser(userId, safeOptions.limit);
    if (!result || !result.ok) {
      return { ok: false, reason: 'db_error' };
    }
    return { ok: true, records: result.results };
  } catch (e) {
    return { ok: false, reason: 'unknown_error' };
  }
}

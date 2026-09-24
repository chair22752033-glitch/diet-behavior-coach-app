/*
 * Phase 1 TASK 1.54｜Intelligence Execution Metrics Layer Foundation
 * - Intelligence Execution Metrics
 *
 * 責任：在Execution Manager（TASK1.50）、Execution Event（TASK1.51）、
 * Execution History（TASK1.52）、Execution Monitoring（TASK1.53）
 * 之上，建立一個獨立的統計/量測邊界——`createExecutionMetrics(
 * {historyStore, eventDispatcher})`透過依賴注入拿到的
 * `eventDispatcher`（TASK1.51，提供`subscribe()`）自動訂閱四個固定
 * 生命週期事件類型，把每個事件累積進自己的一份記憶體狀態
 * （`recordsByExecutionId`），並在需要時計算出`averageDuration`/
 * `successRate`等衍生統計數字。這個檔案完全不import
 * `src/intelligence/events/`或`src/intelligence/history/`底下任何
 * 檔案——`eventDispatcher`/`historyStore`一律是透過依賴注入傳入的、
 * 符合最小介面（`{subscribe}`/`{get}`）的不透明物件，這是刻意的
 * 邊界決策，維持「監控/統計跟執行邏輯完全independent」跟「每一層
 * 只認識自己需要的最小形狀」的既有慣例。
 *
 * 架構位置：
 *
 *   Intelligence Facade（TASK1.48）
 *     ↓
 *   Intelligence Execution Manager（TASK1.50）── 生命週期狀態轉換時
 *     ↓                          ↘
 *   Intelligence Service      Event Dispatcher（TASK1.51）
 *   （TASK1.46）                    ↑
 *                                   ├── 訂閱 ──→ Execution Monitoring（TASK1.53，唯讀觀察）
 *                                   └── 訂閱 ──→ Execution Metrics（這裡，累積統計）
 *
 * 提供三個介面（規格明確列出，這裡刻意不多也不少）：
 * - recordExecutionEvent(event)：把單一Execution Event（形狀跟
 *   TASK1.51的`{type, timestamp, executionId, payload}`一致）記錄
 *   進內部狀態——這是Metrics自己收集資料的唯一入口，建立時如果有
 *   提供合法的`eventDispatcher`，會自動把這個函式訂閱到四個固定
 *   事件類型上；也刻意公開成對外介面，讓呼叫端（或測試）可以在沒有
 *   Event Dispatcher的情況下直接餵事件進來。對不合法的事件安全
 *   回傳`{ok:false, reason}`，不拋出例外，不影響已記錄的狀態。
 * - getMetrics()：對內部累積的全部executionId計算出彙總統計，回傳
 *   `{status:'metrics_ready', metrics:{totalExecutions, initialized,
 *   running, completed, failed, averageDuration, successRate},
 *   metadata:{}}`。
 * - getExecutionMetrics(executionId)：對單一executionId計算出同樣
 *   形狀的統計（此時`totalExecutions`固定是0或1）。優先查詢自己內部
 *   累積的狀態；如果自己完全沒觀察過這個executionId的事件（例如這個
 *   Metrics實例是在該次執行結束後才建立的），且有提供
 *   `historyStore`，則退而查詢`historyStore.get(executionId)`當
 *   替代來源（並把History Record的`metadata`欄位一併帶出）——這是
 *   `historyStore`在這個檔案裡唯一的用途，純讀取，不修改。兩種來源
 *   都查不到時回傳`{status:'not_found', metrics:<全部為0>,
 *   metadata:{}}`；executionId不合法時回傳
 *   `{status:'invalid_execution_id', ...}`。
 *
 * 統計定義（規格要求的deterministic，全部從累積的原始狀態即時計算，
 * 不維護容易失準的累加計數器）：
 * - `totalExecutions`/`initialized`/`running`/`completed`/`failed`：
 *   依每個executionId目前最新的status分類計數，
 *   `totalExecutions = initialized+running+completed+failed`恆成立。
 * - `averageDuration`：只計算status為`completed`或`failed`、且
 *   `startedAt`/`completedAt`都存在且可被解析成數字時間戳
 *   （`typeof`是數字，或是可以被`Date.parse()`解析的字串）的
 *   executionId，取`completedAt-startedAt`的平均值；沒有任何符合
 *   條件的紀錄時為`0`（不是`NaN`）。
 * - `successRate`：`completed / (completed + failed)`——只計算
 *   已經跑完的執行（`initialized`/`running`中尚未有結果的不列入
 *   分母），沒有任何已結束的執行時為`0`（不是`NaN`）。
 *
 * 全部運算都是純函式的即時重新計算（不是逐次emit時累加的計數器），
 * `recordExecutionEvent()`只負責更新每個executionId的最新
 * `{status, startedAt, completedAt}`快照，`getMetrics()`/
 * `getExecutionMetrics()`每次呼叫時都重新掃描一次，確保「同樣的一組
 * 已記錄事件，任何時候呼叫都得到完全相同的統計結果」。
 */
import { buildMetrics, buildMetricsResult } from './metrics_result_builder.js';

const EVENT_TYPE_TO_STATUS = Object.freeze({
  execution_initialized: 'initialized',
  execution_started: 'running',
  execution_completed: 'completed',
  execution_failed: 'failed',
});

/**
 * 把（可能是字串或數字的）時間戳安全解析成毫秒數字，無法解析時
 * 回傳null——純函式，`Date.parse()`本身是對輸入字串的確定性解析，
 * 不讀取目前時間，不違反deterministic規則。
 *
 * @param {*} value
 * @returns {number|null}
 */
function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * 依一組`{status, startedAt, completedAt}`快照計算出Metrics物件。
 *
 * @param {Iterable<{status:string, startedAt:*, completedAt:*}>} records
 * @returns {object}
 */
function computeMetrics(records) {
  let initialized = 0;
  let running = 0;
  let completed = 0;
  let failed = 0;
  let durationSum = 0;
  let durationCount = 0;

  for (const record of records) {
    if (!record || typeof record !== 'object') {
      continue;
    }
    if (record.status === 'initialized') {
      initialized += 1;
    } else if (record.status === 'running') {
      running += 1;
    } else if (record.status === 'completed') {
      completed += 1;
    } else if (record.status === 'failed') {
      failed += 1;
    }

    if (record.status === 'completed' || record.status === 'failed') {
      const startedMs = parseTimestamp(record.startedAt);
      const completedMs = parseTimestamp(record.completedAt);
      if (startedMs !== null && completedMs !== null) {
        durationSum += completedMs - startedMs;
        durationCount += 1;
      }
    }
  }

  const totalExecutions = initialized + running + completed + failed;
  const averageDuration = durationCount > 0 ? durationSum / durationCount : 0;
  const finished = completed + failed;
  const successRate = finished > 0 ? completed / finished : 0;

  return buildMetrics({ totalExecutions, initialized, running, completed, failed, averageDuration, successRate });
}

/**
 * @param {{historyStore?:{get:Function}, eventDispatcher?:{subscribe:Function}}} options
 * @returns {{
 *   recordExecutionEvent: (event:object) => {ok:boolean, reason?:string},
 *   getMetrics: () => {status:string, metrics:object, metadata:object},
 *   getExecutionMetrics: (executionId:string) => {status:string, metrics:object, metadata:object}
 * }}
 */
export function createExecutionMetrics(options) {
  options = options || {};
  const { historyStore, eventDispatcher } = options;
  const recordsByExecutionId = new Map();

  /**
   * @param {*} event
   * @returns {{ok:true}|{ok:false, reason:string}}
   */
  function recordExecutionEvent(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return { ok: false, reason: 'invalid_event' };
    }
    if (typeof event.type !== 'string' || event.type.length === 0) {
      return { ok: false, reason: 'invalid_event' };
    }
    if (typeof event.executionId !== 'string' || event.executionId.length === 0) {
      return { ok: false, reason: 'invalid_execution_id' };
    }
    const status = EVENT_TYPE_TO_STATUS[event.type];
    if (!status) {
      return { ok: false, reason: 'unknown_event_type' };
    }

    const existing = recordsByExecutionId.get(event.executionId) || { status: null, startedAt: null, completedAt: null };
    existing.status = status;
    if (status === 'running') {
      existing.startedAt = event.timestamp !== undefined ? event.timestamp : existing.startedAt;
    } else if (status === 'completed' || status === 'failed') {
      existing.completedAt = event.timestamp !== undefined ? event.timestamp : existing.completedAt;
    }
    recordsByExecutionId.set(event.executionId, existing);
    return { ok: true };
  }

  if (eventDispatcher && typeof eventDispatcher.subscribe === 'function') {
    for (const type of Object.keys(EVENT_TYPE_TO_STATUS)) {
      try {
        eventDispatcher.subscribe(type, recordExecutionEvent);
      } catch (_error) {
        // 訂閱失敗完全不應該影響Metrics本身的建立，這裡刻意用
        // try/catch隔絕，維持「統計跟執行邏輯完全independent」。
      }
    }
  }

  /**
   * @returns {{status:string, metrics:object, metadata:object}}
   */
  function getMetrics() {
    const metrics = computeMetrics(recordsByExecutionId.values());
    return buildMetricsResult({ status: 'metrics_ready', metrics, metadata: {} });
  }

  /**
   * @param {string} executionId
   * @returns {{status:string, metrics:object, metadata:object}}
   */
  function getExecutionMetrics(executionId) {
    if (typeof executionId !== 'string' || executionId.length === 0) {
      return buildMetricsResult({ status: 'invalid_execution_id', metrics: buildMetrics({}), metadata: {} });
    }

    const ownRecord = recordsByExecutionId.get(executionId);
    if (ownRecord) {
      const metrics = computeMetrics([ownRecord]);
      return buildMetricsResult({ status: 'metrics_ready', metrics, metadata: {} });
    }

    if (historyStore && typeof historyStore.get === 'function') {
      try {
        const historyResult = historyStore.get(executionId);
        if (historyResult && historyResult.ok && historyResult.record) {
          const record = historyResult.record;
          const metrics = computeMetrics([{ status: record.status, startedAt: record.startedAt, completedAt: record.completedAt }]);
          const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
          return buildMetricsResult({ status: 'metrics_ready', metrics, metadata });
        }
      } catch (_error) {
        // historyStore查詢失敗完全不應該影響getExecutionMetrics()
        // 本身，這裡刻意用try/catch隔絕，安全落到下面的not_found。
      }
    }

    return buildMetricsResult({ status: 'not_found', metrics: buildMetrics({}), metadata: {} });
  }

  return { recordExecutionEvent, getMetrics, getExecutionMetrics };
}

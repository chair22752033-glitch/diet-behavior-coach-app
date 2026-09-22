/*
 * Phase 1 TASK 1.16｜Legacy Import Service Layer
 *
 * 目的：建立「KV/localStorage → Legacy Parser → Identity Mapping → Domain
 * Services → D1」的正式遷移通道基礎架構。本次只建立這條通道本身，
 * 不執行任何真實 sync:* 資料遷移（沒有任何呼叫端會拿正式KV資料餵給這個函式）。
 *
 * 資料流（對應 TASK1.16 規格圖）：
 *   legacy data
 *     ↓
 *   parseLegacyBlob()（沿用 TASK1.9，完全不重寫）
 *     ↓
 *   resolveLegacyUserIdentity()（TASK1.16 新增，判斷guest/provider）
 *     ↓
 *   runImportTransaction() 包住以下所有步驟（TASK1.16 新增，失敗就整批回滾）
 *     ↓
 *   createGuestIdentity() → exploration/food/emotion/behavior_service（TASK1.14/1.15 domain services）
 *     ↓
 *   db access layer（TASK1.12）
 *     ↓
 *   D1
 *
 * 禁止事項（已遵守）：這個檔案本身完全不 import src/db/query.js 或
 * transaction.js，也不直接呼叫 db.run/db.batch 做業務資料寫入——所有業務資料
 * 寫入都透過 src/services/ 底下已經測試過的 domain service 函式進行；
 * 唯一直接碰 db 的地方是「回傳結果給 domain service 的第一個參數 db」以及
 * 呼叫 runImportTransaction(db, ...)，兩者都是把 db 原封不動轉交給下一層，
 * 不在這裡自己組 SQL。
 */
import { parseLegacyBlob } from '../../scripts/legacy_import/parse_legacy_blob.js';
import { resolveLegacyUserIdentity } from '../identity/legacy_identity.js';
import { createGuestIdentity } from '../identity/lifecycle.js';
import { runImportTransaction } from './import_transaction.js';
import { createExplorationRecord } from './exploration_service.js';
import { recordFoodEvent } from './food_service.js';
import { createEmotionRecord } from './emotion_service.js';
import { createBehaviorPattern } from './behavior_service.js';

const ALLOWED_SOURCE_TYPES = ['kv', 'localStorage'];

function emptySummary() {
  return {
    users: 0,
    exploration_records: 0,
    food_events: 0,
    emotion_records: 0,
    behavior_patterns: 0,
    ai_reports: 0,
  };
}

/**
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {object} legacyPayload - {sourceType:'kv'|'localStorage', sourceKey:'sync:xxxx', payload:<舊格式資料物件或JSON字串>}
 * @param {object} [options] - {now, isAlreadyImported}
 *   isAlreadyImported(sourceKey) => Promise<boolean>｜boolean，選填，由呼叫端接
 *   legacy_import_logs 或其他機制決定是否跳過（本次不強制要求，防重複匯入的
 *   實際查詢邏輯留給未來真正執行遷移的呼叫端決定用哪張表、哪個判斷條件）
 * @returns {Promise<{ok:boolean, summary?:object, error?:string, reason?:string}>}
 */
export async function importLegacyData(db, legacyPayload, options) {
  options = options || {};

  if (!legacyPayload || typeof legacyPayload !== 'object') {
    return { ok: false, error: 'invalid_legacy_payload' };
  }

  const { sourceType, sourceKey, payload } = legacyPayload;

  if (ALLOWED_SOURCE_TYPES.indexOf(sourceType) === -1) {
    return { ok: false, error: 'invalid_source_type' };
  }
  if (!sourceKey || typeof sourceKey !== 'string') {
    return { ok: false, error: 'invalid_source_key' };
  }

  if (options.isAlreadyImported) {
    const already = await options.isAlreadyImported(sourceKey);
    if (already) return { ok: false, error: 'already_imported' };
  }

  // ---- 1. 沿用 TASK1.9 parser（完全不重寫）----
  const parseResult = parseLegacyBlob(sourceKey, payload, { now: options.now });
  if (!parseResult.ok) {
    return { ok: false, error: parseResult.error };
  }

  // ---- 2. Identity Mapping（guest 或 provider，本次一律guest）----
  const identity = resolveLegacyUserIdentity(parseResult.user, { now: options.now });
  if (identity.unsupported) {
    return { ok: false, error: identity.reason };
  }

  const summary = emptySummary();

  // ---- 3. 整批包在 import transaction 裡，任何一步失敗就整批回滾 ----
  const txResult = await runImportTransaction(db, async (trackWrite) => {
    // 3a. 建立 guest user（透過 TASK1.14 的 lifecycle service，不直接呼叫 db.users.insert）
    const userResult = await createGuestIdentity(db, {
      id: identity.user.id,
      legacySyncCode: identity.user.legacy_sync_code,
      now: options.now,
    });
    if (!userResult.ok) return { ok: false, error: userResult.error };
    trackWrite('users', userResult.user_id);
    summary.users = 1;
    const userId = userResult.user_id;

    // 3b. exploration_records（透過 exploration_service，不直接呼叫 db）
    for (const rec of parseResult.exploration_records) {
      const r = await createExplorationRecord(db, userId, rec);
      if (!r.ok) return { ok: false, error: r.error, reason: r.reason };
      trackWrite('exploration_records', r.id);
      summary.exploration_records++;
    }

    // 3c. food_events（透過 food_service），同時記錄 parser 給的本地index→真實id 對照，
    //     供下一步 emotion_records 解析 linked_food_event_local_index 使用
    const foodEventIdByLocalIndex = {};
    for (const rec of parseResult.food_events) {
      const r = await recordFoodEvent(db, userId, rec);
      if (!r.ok) return { ok: false, error: r.error, reason: r.reason };
      trackWrite('food_events', r.id);
      foodEventIdByLocalIndex[rec._localIndex] = r.id;
      summary.food_events++;
    }

    // 3d. emotion_records（透過 emotion_service），把 parser 的
    //     linked_food_event_local_index 換成上一步真正拿到的 food_events.id
    for (const rec of parseResult.emotion_records) {
      const linkedFoodEventId = Object.prototype.hasOwnProperty.call(foodEventIdByLocalIndex, rec.linked_food_event_local_index)
        ? foodEventIdByLocalIndex[rec.linked_food_event_local_index]
        : null;
      const r = await createEmotionRecord(db, userId, Object.assign({}, rec, { linked_food_event_id: linkedFoodEventId }));
      if (!r.ok) return { ok: false, error: r.error, reason: r.reason };
      trackWrite('emotion_records', r.id);
      summary.emotion_records++;
    }

    // 3e. behavior_patterns（透過 behavior_service）
    for (const rec of parseResult.behavior_patterns) {
      const r = await createBehaviorPattern(db, userId, rec);
      if (!r.ok) return { ok: false, error: r.error, reason: r.reason };
      trackWrite('behavior_patterns', r.id);
      summary.behavior_patterns++;
    }

    // ai_reports：TASK1.9 的 parser 目前不會從舊資料格式產生任何 ai_reports
    // （舊版 App 本來就沒有「AI報告」這個概念），summary 欄位保留是為了與
    // TASK1.15 report_service 的資料表對齊，此欄位目前恆為 0。

    return { ok: true };
  });

  if (!txResult.ok) {
    return { ok: false, error: txResult.error, reason: txResult.reason };
  }

  return { ok: true, summary };
}

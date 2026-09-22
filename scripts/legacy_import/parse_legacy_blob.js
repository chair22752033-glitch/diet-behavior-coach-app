/*
 * Phase 1 TASK 1.9｜Legacy Import 基礎架構 - Parser/Helper
 *
 * 用途：把舊資料來源（KV `sync:<code>` 或瀏覽器 localStorage `diet_app_v1`，
 * 兩者 JSON 結構完全相同）轉換成符合 D1 schema（TASK1.7 建立的11張表）的資料列物件。
 *
 * 重要限制（本次 TASK1.9 範圍）：
 * - 這裡只是「純函式轉換」：輸入一段 JSON 字串／物件，回傳轉換後的 JS 物件陣列
 * - 完全不做任何 I/O：不連線 KV、不連線 D1、不呼叫任何 API、不寫檔
 * - 不會、也不需要修改 src/worker.js
 * - 真正把回傳結果寫進 D1、把 emotion_records 的 linked_food_event_id 換成
 *   真正的資料庫自增 id，屬於未來執行「真實資料遷移」TASK 的範圍，本次不執行
 */
const crypto = require('crypto');
const { ID_TYPE_TITLES } = require('./field_mapping');

function tsToIso(ts) {
  if (typeof ts !== 'number' || !isFinite(ts)) return null;
  try { return new Date(ts).toISOString(); } catch (e) { return null; }
}

function safeJoin(arr, sep) {
  if (!Array.isArray(arr)) return null;
  const s = arr.filter(Boolean).join(sep);
  return s || null;
}

/**
 * @param {string} sourceKey 來源識別（例如 "sync:4741" 或 "localstorage:diet_app_v1"），只作為 legacy_sync_code 與紀錄追蹤用途
 * @param {string|object} raw 原始 JSON 字串或已解析物件（即 ld() 的回傳內容）
 * @param {object} [opts]
 * @param {string} [opts.now] 覆寫「現在時間」ISO字串，方便測試（不傳則用 new Date()）
 * @param {string} [opts.userId] 覆寫新建 user 的 id（不傳則自動產生 UUID v4）
 * @returns {object} { ok, sourceKey, user, exploration_records, food_events, emotion_records, behavior_patterns, warnings, stats }
 *                    或解析失敗時 { ok:false, error, sourceKey }
 */
function parseLegacyBlob(sourceKey, raw, opts) {
  opts = opts || {};
  const now = opts.now || new Date().toISOString();
  const newUserId = opts.userId || crypto.randomUUID();

  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return { ok: false, error: 'JSON_PARSE_ERROR: ' + e.message, sourceKey };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'INVALID_ROOT_SHAPE: 頂層必須是物件', sourceKey };
  }

  const warnings = [];

  const user = {
    id: newUserId,
    auth_provider: null,
    auth_provider_id: null,
    display_name: null,
    is_guest: 1,
    legacy_sync_code: sourceKey,
    created_at: now,
    updated_at: now,
  };

  const exploration_records = [];
  const food_events = [];
  const emotion_records = [];
  const behavior_patterns = [];

  // --- identity → behavior_patterns（pattern_type='identity_quiz'）---
  if (data.identity && typeof data.identity === 'object') {
    if (data.identity.key) {
      const title = ID_TYPE_TITLES[data.identity.key] || data.identity.key;
      behavior_patterns.push({
        user_id: newUserId,
        pattern_type: 'identity_quiz',
        summary: '身份測驗結果：' + title,
        evidence_json: JSON.stringify({ raw: data.identity, matched_title: title }),
        confidence_score: null,
        detected_at: tsToIso(data.identity.ts) || now,
      });
    } else {
      warnings.push('identity 欄位存在但缺少 key，已略過');
    }
  }

  // --- quest.entries[] → exploration_records（每筆entry對應一筆）---
  const questEntries = (data.quest && Array.isArray(data.quest.entries)) ? data.quest.entries : [];
  questEntries.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') { warnings.push('quest.entries[' + idx + '] 格式異常，已略過'); return; }
    const cards = Array.isArray(entry.cards) ? entry.cards : [];
    const singleCard = cards.length === 1 ? cards[0] : null;
    exploration_records.push({
      user_id: newUserId,
      draw_mode: entry.mode || null,
      card_category: singleCard ? (singleCard.c || null) : null,
      card_object_key: singleCard ? (singleCard.o || null) : null,
      card_text: singleCard ? (singleCard.t || null) : null,
      photo_idx: (singleCard && typeof singleCard.photoIdx === 'number') ? singleCard.photoIdx : null,
      responses_json: JSON.stringify({ cards: cards, note: entry.note || null, carry: !!entry.carry, insight: entry.insight || null }),
      occurred_at: tsToIso(entry.ts) || now,
    });
  });

  // --- meals.entries[] → food_events（+ 有 mood 時額外產生 emotion_records）---
  const mealEntries = (data.meals && Array.isArray(data.meals.entries)) ? data.meals.entries : [];
  mealEntries.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') { warnings.push('meals.entries[' + idx + '] 格式異常，已略過'); return; }
    const names = Array.isArray(entry.names) ? entry.names : [];
    food_events.push({
      _localIndex: idx, // 僅供本次解析結果內部關聯用，非D1欄位；實際INSERT後才有真正的 food_events.id
      user_id: newUserId,
      meal_type: null,
      description: safeJoin(names, '、'),
      nutrients_json: JSON.stringify({ names: names, emojis: entry.emojis || [], cats: entry.cats || [] }),
      image_id: null,
      occurred_at: tsToIso(entry.ts) || now,
    });
    if (entry.mood) {
      emotion_records.push({
        linked_food_event_local_index: idx, // 對應上面 food_events[].​_localIndex，實際匯入時換成真正的 food_events.id
        user_id: newUserId,
        emotion_type: entry.mood,
        intensity: null,
        trigger_note: Array.isArray(entry.reasons) ? safeJoin(entry.reasons, '、') : (entry.reasons || null),
        occurred_at: tsToIso(entry.ts) || now,
      });
    }
  });

  // --- ba.entries[]（行為拆解）→ behavior_patterns（pattern_type='behavior_breakdown'）---
  const baEntries = (data.ba && Array.isArray(data.ba.entries)) ? data.ba.entries : [];
  baEntries.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') { warnings.push('ba.entries[' + idx + '] 格式異常，已略過'); return; }
    behavior_patterns.push({
      user_id: newUserId,
      pattern_type: 'behavior_breakdown',
      summary: safeJoin([entry.food, entry.why], '｜'),
      evidence_json: JSON.stringify(entry),
      confidence_score: null,
      detected_at: tsToIso(entry.ts) || now,
    });
  });

  // --- ins[]（每日打卡）→ behavior_patterns（pattern_type='daily_checkin'）---
  const insEntries = Array.isArray(data.ins) ? data.ins : [];
  insEntries.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') { warnings.push('ins[' + idx + '] 格式異常，已略過'); return; }
    behavior_patterns.push({
      user_id: newUserId,
      pattern_type: 'daily_checkin',
      summary: safeJoin([entry.beh, entry.crave ? '有渴望感' : null], '｜'),
      evidence_json: JSON.stringify(entry),
      confidence_score: null,
      detected_at: tsToIso(entry.ts) || now,
    });
  });

  // ft（首次使用旗標）不在遷移範圍內，僅記錄警告方便追蹤，不產生任何資料列
  if (typeof data.ft !== 'undefined') {
    warnings.push('ft 欄位（首次使用旗標，前端 onboarding 狀態）不在遷移範圍內，已略過');
  }

  return {
    ok: true,
    sourceKey,
    user,
    exploration_records,
    food_events,
    emotion_records,
    behavior_patterns,
    warnings,
    stats: {
      exploration_records: exploration_records.length,
      food_events: food_events.length,
      emotion_records: emotion_records.length,
      behavior_patterns: behavior_patterns.length,
    },
  };
}

module.exports = { parseLegacyBlob, tsToIso };

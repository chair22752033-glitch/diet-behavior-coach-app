/*
 * Phase 1 TASK 1.9｜Legacy Import 基礎架構 - 共用對照表常數
 *
 * 這裡只放「純資料」常數，不做任何 I/O。
 * ID_TYPE_TITLES 是從 src/worker.js 的 ID_TYPES 唯讀擷取出來的 key→中文名稱對照
 * （只複製這 5 組固定文字，不會、也不需要修改 src/worker.js 本身）。
 */
const ID_TYPE_TITLES = {
  intuitive: '直覺派',
  active: '行動派',
  healing: '療癒派',
  connector: '連結派',
  discipline: '自律派',
};

// 支援的舊資料來源型態（對應 legacy_import_log.source_type）
const SUPPORTED_SOURCE_TYPES = {
  KV_SYNC: 'kv_sync', // Cloudflare KV，key 格式 sync:<code>，經 /api/sync 讀寫
  LOCAL_STORAGE: 'localstorage', // 瀏覽器 localStorage，key 固定為 diet_app_v1（即程式中的 SK 常數）
};

// 明確排除、不納入本次 mapping 範圍的舊資料
const EXCLUDED_SOURCES = {
  KV_QLIVE: {
    reason: '僅為 QUEST 即時同步用的暫存資料（1小時TTL），不是歷史紀錄，沒有遷移價值',
    keyPattern: 'qlive:<code>',
  },
};

module.exports = { ID_TYPE_TITLES, SUPPORTED_SOURCE_TYPES, EXCLUDED_SOURCES };

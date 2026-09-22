/*
 * Phase 1 TASK 1.9｜Legacy Import 基礎架構 - legacy_import_log 資料列建構輔助函式
 *
 * 純函式，不做任何 I/O。回傳的物件形狀對應 TASK1.7 建立的 legacy_import_log 表欄位，
 * 供未來真正執行匯入的 TASK 呼叫 D1 INSERT 時使用，本次不執行任何寫入。
 */

/**
 * @param {string} sourceType 'kv_sync' | 'localstorage'（見 field_mapping.js 的 SUPPORTED_SOURCE_TYPES）
 * @param {string} sourceKey 例如 "sync:4741"
 * @param {'pending'|'imported'|'failed'|'skipped'} status
 * @param {object} [detail] 任意可序列化物件，例如 { userId, stats, warnings, errorMessage }
 * @returns {object} 對應 legacy_import_log 表欄位的資料列物件
 */
function buildImportLogEntry(sourceType, sourceKey, status, detail) {
  status = status || 'pending';
  return {
    source_type: sourceType,
    source_key: sourceKey,
    target_user_id: (detail && detail.userId) || null,
    status: status,
    detail_json: detail ? JSON.stringify(detail) : null,
    imported_at: status === 'imported' ? new Date().toISOString() : null,
  };
}

module.exports = { buildImportLogEntry };

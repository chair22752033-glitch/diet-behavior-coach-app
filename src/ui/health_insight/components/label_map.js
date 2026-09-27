/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - Label Map（呈現層措辭對照表）
 *
 * 責任：把Analysis/Recommendation Capability既有輸出的`type`
 * 代碼（例如`activity_count`），轉換成使用者看得懂的簡短中文
 * 標籤——這是TASK1.108第2節C已經明確標註"本次任務不定義具體的
 * 轉換/措辭邏輯，留給未來的Product呈現層"的那個"未來"，現在
 * 由UI層（本次任務）接手。
 *
 * ## 這是呈現層的措辭對照，不是Intelligence邏輯
 *
 * 這個檔案**只做**"已知代碼 → 固定的中文短句"這種**靜態查表**
 * ——沒有任何計算、沒有任何推論、沒有任何判斷邏輯，符合本次
 * 任務"Do NOT place intelligence logic inside UI"的明確要求：
 * 真正的分析/建議內容（`value`欄位的實際數字）完全來自既有
 * Capability鏈路，這裡只是把"這是什麼類型的觀察/建議"翻譯成
 * 人話，不改變、不重新計算任何數值本身。
 *
 * 對於**未知**的type代碼（例如未來Capability新增的type），
 * 安全地回傳一個通用的中性描述，不會拋出例外、不會顯示原始
 * 代碼本身給使用者看（延續"不暴露internal capability
 * structure"的既有原則）。
 */

/**
 * Health Observation（延續TASK1.108第2節A，來源：Analysis
 * Capability既有的insights type）對照表。
 */
const OBSERVATION_LABELS = {
  activity_count: { label: '活動記錄', explanation: '這段期間記錄的活動次數' },
  nutrition_count: { label: '飲食記錄', explanation: '這段期間記錄的飲食次數' },
  emotion_count: { label: '情緒記錄', explanation: '這段期間記錄的情緒次數' },
  behavior_count: { label: '行為記錄', explanation: '這段期間記錄的行為次數' },
  report_count: { label: '報告記錄', explanation: '這段期間累積的報告數量' },
  total_records: { label: '整體記錄', explanation: '這段期間累積的所有記錄總數' },
};

/**
 * Recommendation（延續TASK1.108第2節C，來源：Recommendation
 * Capability既有的recommendations type）對照表。
 */
const RECOMMENDATION_LABELS = {
  insight_count: { label: '觀察數量建議', explanation: '根據你目前累積的觀察數量給的建議' },
  analysis_status: { label: '分析狀態建議', explanation: '根據目前的分析完整度給的建議' },
  analysis_version: { label: '分析版本說明', explanation: '目前使用的分析邏輯版本' },
};

const FALLBACK_OBSERVATION = { label: '其他觀察', explanation: '一項新的健康觀察' };
const FALLBACK_RECOMMENDATION = { label: '其他建議', explanation: '一項新的健康建議' };

/**
 * @param {string} type
 * @returns {{label:string, explanation:string}}
 */
export function getObservationLabel(type) {
  if (typeof type === 'string' && OBSERVATION_LABELS[type]) {
    return OBSERVATION_LABELS[type];
  }
  return FALLBACK_OBSERVATION;
}

/**
 * @param {string} type
 * @returns {{label:string, explanation:string}}
 */
export function getRecommendationLabel(type) {
  if (typeof type === 'string' && RECOMMENDATION_LABELS[type]) {
    return RECOMMENDATION_LABELS[type];
  }
  return FALLBACK_RECOMMENDATION;
}

/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - Recommendation Card
 *
 * 責任：把TASK1.108/1.111/1.112既有輸出`recommendation`陣列
 * 裡的**單一筆**`{type, value}`項目，呈現成一張"拙趣"風格的
 * 卡片——顯示下一步可以採取的行動建議（延續規格"Display: next
 * action suggestion"）。純函式，不呼叫任何Capability/Feature/
 * Integration程式碼，不做任何計算/推論。
 *
 * 跟`observation_card.js`同樣的Intelligence Boundary/Output
 * Boundary原則（見該檔案的詳細說明），這裡不重複贅述。
 */
import { escapeHtml } from './html_utils.js';
import { getRecommendationLabel } from './label_map.js';
import { getAssetPlaceholder } from '../assets/asset_registry.js';

/**
 * @param {{type:*, value:*}} item
 * @returns {string}
 */
export function createRecommendationCard(item) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const { label, explanation } = getRecommendationLabel(safeItem.type);
  const icon = getAssetPlaceholder('recommendation');
  return [
    '<div class="hi-card hi-recommendation-card">',
    `  <div class="hi-card-icon" aria-hidden="true">${escapeHtml(icon)}</div>`,
    `  <div class="hi-card-label">${escapeHtml(label)}</div>`,
    `  <div class="hi-card-value">${escapeHtml(safeItem.value)}</div>`,
    `  <div class="hi-card-explanation">${escapeHtml(explanation)}</div>`,
    '</div>',
  ].join('\n');
}

/**
 * @param {Array<{type:*, value:*}>} recommendation
 * @returns {string}
 */
export function createRecommendationCardList(recommendation) {
  const items = Array.isArray(recommendation) ? recommendation : [];
  if (items.length === 0) {
    return [
      '<div class="hi-card hi-recommendation-card hi-empty-state">',
      `  <div class="hi-card-icon" aria-hidden="true">${escapeHtml(getAssetPlaceholder('recommendation'))}</div>`,
      '  <div class="hi-card-explanation">目前還沒有建議，累積更多記錄後會有更貼近你的建議</div>',
      '</div>',
    ].join('\n');
  }
  return items.map((item) => createRecommendationCard(item)).join('\n');
}

/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - Progress Card Placeholder
 *
 * 責任：呈現"進度追蹤"這個輸出類別的**預留區**——延續
 * TASK1.107第2節D/TASK1.108第2節D/TASK1.111已經確認的既有
 * 結論"progressTrend V1固定回傳空物件，這個功能概念上存在但
 * V1不產生實際內容"，跟`behavior_pattern_card.js`同樣的處理
 * 原則：顯示誠實、友善的預留卡片，不假裝已經有趨勢資料。
 */
import { escapeHtml } from './html_utils.js';
import { getAssetPlaceholder } from '../assets/asset_registry.js';

/**
 * @returns {string}
 */
export function createProgressPlaceholderCard() {
  const icon = getAssetPlaceholder('progressPlaceholder');
  return [
    '<div class="hi-card hi-progress-card hi-placeholder-card">',
    `  <div class="hi-card-icon" aria-hidden="true">${escapeHtml(icon)}</div>`,
    '  <div class="hi-card-label">進度追蹤</div>',
    '  <div class="hi-card-explanation">這個功能還在準備中，之後會讓你看到自己隨時間的變化</div>',
    '</div>',
  ].join('\n');
}

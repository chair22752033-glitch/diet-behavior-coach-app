/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - Behavior Card Placeholder
 *
 * 責任：呈現"行為模式"這個輸出類別的**預留區**——延續
 * TASK1.108第2節B/TASK1.111已經確認的既有結論"Behavior
 * Pattern V1固定回傳空陣列，這個功能概念上存在但V1不產生實際
 * 內容"，UI層對應的處理方式是顯示一個誠實、友善的"敬請期待"
 * 卡片，而不是假裝已經有分析結果（延續本次任務規格"Do NOT
 * create fake intelligence logic. Use placeholder/mock
 * structure only where required"的明確要求）。
 *
 * 這個元件**不**接受`behaviorPattern`陣列的實際內容來決定要不
 * 要顯示（因為V1本來就永遠是空陣列），純粹是一個固定內容的
 * 預留卡片，方便未來Behavior Pattern真的有內容時，只需要替換
 * 這個元件的實作，不影響其他卡片。
 */
import { escapeHtml } from './html_utils.js';
import { getAssetPlaceholder } from '../assets/asset_registry.js';

/**
 * @returns {string}
 */
export function createBehaviorPatternPlaceholderCard() {
  const icon = getAssetPlaceholder('behaviorPatternPlaceholder');
  return [
    '<div class="hi-card hi-behavior-pattern-card hi-placeholder-card">',
    `  <div class="hi-card-icon" aria-hidden="true">${escapeHtml(icon)}</div>`,
    '  <div class="hi-card-label">行為模式</div>',
    '  <div class="hi-card-explanation">這個功能還在準備中，之後會幫你找出重複出現的生活習慣</div>',
    '</div>',
  ].join('\n');
}

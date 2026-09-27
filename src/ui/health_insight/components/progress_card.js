/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * （TASK1.115後更新：視覺重構，見下方"TASK1.115更新"區塊）
 * - Progress Card Placeholder
 *
 * 責任：呈現"進度追蹤"這個輸出類別的**預留區**——延續
 * TASK1.107第2節D/TASK1.108第2節D/TASK1.111已經確認的既有
 * 結論"progressTrend V1固定回傳空物件，這個功能概念上存在但
 * V1不產生實際內容"，跟`behavior_pattern_card.js`同樣的處理
 * 原則：顯示誠實、友善的預留卡片，不假裝已經有趨勢資料。
 *
 * ## TASK1.115更新：視覺重構
 *
 * emoji圖示（🌾）換成真正的插畫
 * （`companion-progressing.webp`，角色開心走在探索小徑上，
 * 隱喻"一步一步向前"），標題下方改用跟`behavior_pattern_
 * card.js`同樣的霧藍色CSS虛線（延續"功能預留卡片共用霧藍色"
 * 這個新規則），底部新增"敬請期待"行動小標籤。
 */
import { createIllustration } from './illustration.js';
import { createCardHeader } from './card_header.js';
import { createCardCta } from './card_cta.js';

/**
 * @returns {string}
 */
export function createProgressPlaceholderCard() {
  return [
    '<div class="hi-card hi-progress-card hi-placeholder-card">',
    createIllustration('progressPlaceholder'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: '進度追蹤', underline: 'muted' }),
    '    <div class="hi-card-explanation">這個功能還在準備中，之後會讓你看到自己隨時間的變化</div>',
    createCardCta({ label: '敬請期待', accent: 'muted', action: 'progress-coming-soon' }),
    '  </div>',
    '</div>',
  ].join('\n');
}

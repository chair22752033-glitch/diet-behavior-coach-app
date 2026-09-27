/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * （TASK1.115後更新：視覺重構，見下方"TASK1.115更新"區塊）
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
 *
 * ## TASK1.115更新：視覺重構
 *
 * emoji圖示（🧩）換成真正的插畫
 * （`companion-reflecting.webp`，角色安靜喝茶若有所思），標題
 * 下方改用純CSS虛線（霧藍色，延續使用者提供的v2 Dashboard
 * 參考圖觀察到的"功能預留卡片用霧藍色，區別於三張有內容的
 * 暖色系卡片"這個新規則，見`design_tokens.js`的
 * `.hi-title-underline--muted`跟`DESIGN_SPECIFICATION.md`
 * 色彩系統的對應調整），底部新增"敬請期待"行動小標籤。
 */
import { createIllustration } from './illustration.js';
import { createCardHeader } from './card_header.js';
import { createCardCta } from './card_cta.js';

/**
 * @returns {string}
 */
export function createBehaviorPatternPlaceholderCard() {
  return [
    '<div class="hi-card hi-behavior-pattern-card hi-placeholder-card">',
    createIllustration('behaviorPatternPlaceholder'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: '行為模式', underline: 'muted' }),
    '    <div class="hi-card-explanation">這個功能還在準備中，之後會幫你找出重複出現的生活習慣</div>',
    createCardCta({ label: '敬請期待', accent: 'muted', action: 'behavior-pattern-coming-soon' }),
    '  </div>',
    '</div>',
  ].join('\n');
}

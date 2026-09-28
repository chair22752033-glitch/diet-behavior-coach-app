/*
 * Phase 6 TASK 1.123｜Health Insight Product Experience Upgrade
 * - History Placeholder Card（陪伴紀錄預留卡片）
 *
 * 責任：延續TASK1.120已經建立的Persistence Boundary
 * （`health_insight_records`表/`listHealthInsightRecordsForUser()`），
 * 在Dashboard上先準備好"歷史紀錄/進度方向"這個未來功能的視覺
 * 佔位——這個檔案**不**呼叫`listHealthInsightRecordsForUser()`、
 * **不**import `src/persistence/`任何檔案、**不**接受db或真實
 * 歷史資料，純粹是固定內容的預留卡片，延續
 * `behavior_pattern_card.js`/`progress_card.js`已經確立的"誠實
 * 預留、不假裝有資料"既有模式（規格原文"If historical query API
 * does not exist: Create placeholder state only. Do not build
 * full history system."——目前沒有任何route/controller呼叫
 * `listHealthInsightRecordsForUser()`，從UI/API的角度來說，
 * 歷史查詢API確實不存在，所以這裡只做佔位）。
 */
import { createIllustration } from './illustration.js';
import { createCardHeader } from './card_header.js';
import { createCardCta } from './card_cta.js';

/**
 * @returns {string}
 */
export function createHistoryPlaceholderCard() {
  return [
    '<div class="hi-card hi-history-placeholder-card hi-placeholder-card">',
    createIllustration('behaviorPatternPlaceholder'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: '陪伴紀錄', underline: 'muted' }),
    '    <div class="hi-card-explanation">持續累積，才能看見自己的變化——這裡之後會顯示你過去的洞察跟前進的方向</div>',
    createCardCta({ label: '敬請期待', accent: 'muted', action: 'history-coming-soon' }),
    '  </div>',
    '</div>',
  ].join('\n');
}

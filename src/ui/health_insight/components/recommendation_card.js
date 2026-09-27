/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * （TASK1.115後更新：視覺重構+結構調整，見下方"TASK1.115
 * 更新"區塊）
 * - Recommendation Card
 *
 * 責任：把TASK1.108/1.111/1.112既有輸出`recommendation`陣列
 * 呈現成**一張**"拙趣"風格的卡片——顯示下一步可以採取的行動
 * 建議（延續規格"Display: next action suggestion"）。純函式，
 * 不呼叫任何Capability/Feature/Integration程式碼，不做任何
 * 計算/推論。
 *
 * 跟`observation_card.js`同樣的Intelligence Boundary/Output
 * Boundary原則（見該檔案的詳細說明），這裡不重複贅述。
 *
 * ## TASK1.115更新：視覺重構+結構調整
 *
 * 同`observation_card.js`——從"每一筆各自一張卡"改成"一張卡裡
 * 的一份清單"，emoji圖示（🌤️）換成真正的插畫
 * （`companion-recommending.webp`，角色開心喝溫飲比讚），標題
 * 下方新增蜂蜜黃手繪底線，底部新增"我知道了"行動小標籤。
 */
import { escapeHtml } from './html_utils.js';
import { getRecommendationLabel } from './label_map.js';
import { createIllustration } from './illustration.js';
import { createCardHeader } from './card_header.js';
import { createCardCta } from './card_cta.js';

/**
 * @param {{type:*, value:*}} item
 * @returns {string}
 */
function renderRecommendationItem(item) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const { label } = getRecommendationLabel(safeItem.type);
  return `    <li class="hi-recommendation-item"><span class="hi-recommendation-item-label">${escapeHtml(label)}</span><span class="hi-recommendation-item-value">${escapeHtml(safeItem.value)}</span></li>`;
}

/**
 * @param {Array<{type:*, value:*}>} recommendation
 * @returns {string}
 */
export function createRecommendationCard(recommendation) {
  const items = Array.isArray(recommendation) ? recommendation : [];

  const body = items.length === 0
    ? '    <div class="hi-card-explanation">目前還沒有建議，累積更多記錄後會有更貼近你的建議</div>'
    : ['    <ul class="hi-recommendation-list">', ...items.map((item) => renderRecommendationItem(item)), '    </ul>'].join('\n');

  return [
    `<div class="hi-card hi-recommendation-card${items.length === 0 ? ' hi-empty-state' : ''}">`,
    createIllustration('recommendation'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: '今日建議', underline: 'honey' }),
    body,
    createCardCta({ label: '我知道了', accent: 'honey', action: 'acknowledge-recommendation' }),
    '  </div>',
    '</div>',
  ].join('\n');
}

/**
 * @deprecated TASK1.115後：`createRecommendationCard()`本身
 * 已經接受完整陣列並組裝成一張卡片，這個函式只是保留舊名稱的
 * 轉發。新程式碼請直接呼叫`createRecommendationCard()`。
 *
 * @param {Array<{type:*, value:*}>} recommendation
 * @returns {string}
 */
export function createRecommendationCardList(recommendation) {
  return createRecommendationCard(recommendation);
}

/*
 * Phase 6 TASK 1.115｜Health Insight Visual Asset Integration &
 * UI Refinement
 * - Card CTA Helper（卡片底部行動小標籤）
 *
 * 責任：組裝Dashboard卡片底部的小型行動標籤——延續使用者提供
 * 的v2 Dashboard參考圖，每張卡片底部都有一個顏色對應的小
 * 按鈕（"查看詳細紀錄"/"查看更多分析"/"我知道了"/"敬請
 * 期待"）。這裡只產生**純樣式**的標籤（`<button
 * type="button">`但沒有綁定任何點擊事件/連結），延續整個
 * Health Insight UI Foundation"建立但不接線"的既有模式——
 * 真正的互動行為（例如導向詳細記錄畫面）留給未來接上路由的
 * 任務決定，這裡只先確立視覺跟排版基礎。
 */
import { escapeHtml } from './html_utils.js';

/**
 * @param {{label:string, accent:'terracotta'|'sage'|'honey'|'muted', action?:string}} config
 * @returns {string}
 */
export function createCardCta(config) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  const label = typeof safeConfig.label === 'string' ? safeConfig.label : '';
  const accent = typeof safeConfig.accent === 'string' ? safeConfig.accent : 'muted';
  const action = typeof safeConfig.action === 'string' ? safeConfig.action : '';

  return `<button type="button" class="hi-card-cta hi-card-cta--${escapeHtml(accent)}" data-hi-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

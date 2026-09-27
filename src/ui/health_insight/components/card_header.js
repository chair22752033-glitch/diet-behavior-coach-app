/*
 * Phase 6 TASK 1.115｜Health Insight Visual Asset Integration &
 * UI Refinement
 * - Card Header Helper（標題＋手繪底線）
 *
 * 責任：組裝Dashboard五張卡片共用的"標題＋手繪底線裝飾"這段
 * 樣板——延續使用者提供的v2 Dashboard參考圖觀察到的視覺規則：
 * 每張卡片標題下方都有一條顏色對應的手繪底線，Health
 * Summary/Recommendation用赤陶橘或蜂蜜黃、Observation用
 * 鼠尾草綠，Behavior Pattern/Progress兩張"功能預留"卡片改用
 * 純CSS虛線（見`design_tokens.js`的`.hi-title-underline--
 * muted`跟`assets/asset_registry.js`的`UNDERLINE_REGISTRY`
 * 說明）。
 *
 * 這是純呈現層的排版輔助，不做任何資料判斷/邏輯運算。
 */
import { escapeHtml } from './html_utils.js';
import { getUnderlineUrl } from '../assets/asset_registry.js';

/**
 * @param {{title:string, underline:'terracotta'|'sage'|'honey'|'muted'}} config
 * @returns {string}
 */
export function createCardHeader(config) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  const title = typeof safeConfig.title === 'string' ? safeConfig.title : '';
  const underline = typeof safeConfig.underline === 'string' ? safeConfig.underline : 'muted';

  const underlineMarkup = underline === 'muted'
    ? '<span class="hi-title-underline hi-title-underline--muted" aria-hidden="true"></span>'
    : (() => {
      const url = getUnderlineUrl(underline);
      return url ? `<img class="hi-title-underline" src="${escapeHtml(url)}" alt="" aria-hidden="true" />` : '';
    })();

  return [
    '<div class="hi-title-row">',
    `  <span class="hi-card-label">${escapeHtml(title)}</span>`,
    '</div>',
    underlineMarkup,
  ].filter((line) => line !== '').join('\n');
}

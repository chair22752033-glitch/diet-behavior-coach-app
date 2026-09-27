/*
 * Phase 6 TASK 1.115｜Health Insight Visual Asset Integration &
 * UI Refinement
 * - Illustration Helper（插畫標籤產生器）
 *
 * 責任：把`assets/asset_registry.js`裡的插畫插槽，轉換成
 * `<img>`標籤——這是七個卡片元件共用的最小組裝邏輯，避免
 * 每個元件檔案各自重複寫一次"讀取URL/alt文字/組HTML"的樣板
 * 程式碼。這個檔案完全不依賴DOM/瀏覽器API，是純字串處理，
 * deterministic，不讀取Date.now()/Math.random()。
 *
 * 這是TASK1.115新增的**唯一**共用元件輔助檔案——延續"每個
 * Feature/Capability/Boundary目錄自我完整"的既有慣例，這裡
 * 例外新增共用檔案的理由是：七個卡片元件都需要"插畫"這個
 * 概念，屬於真正的重複邏輯，不是巧合形狀相同。
 */
import { escapeHtml } from './html_utils.js';
import { getAssetUrl, getAssetAlt } from '../assets/asset_registry.js';

/**
 * 把插畫插槽轉換成`<img>`標籤——找不到對應資產URL時安全回傳
 * 空字串（不會產生`<img src="">`這種空src標籤），不拋出例外。
 *
 * @param {string} key - `ASSET_REGISTRY`裡的插槽名稱
 * @param {{className?:string, small?:boolean}} [options]
 * @returns {string}
 */
export function createIllustration(key, options) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const src = getAssetUrl(key);
  if (!src) {
    return '';
  }
  const alt = getAssetAlt(key);
  const classNames = ['hi-illustration'];
  if (safeOptions.small) {
    classNames.push('hi-illustration--small');
  }
  if (typeof safeOptions.className === 'string' && safeOptions.className.length > 0) {
    classNames.push(safeOptions.className);
  }
  return `<img class="${escapeHtml(classNames.join(' '))}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
}

/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - Observation Card（Health Observation Card / Insight Card）
 *
 * 責任：把TASK1.108/1.111/1.112既有輸出`healthObservation`
 * 陣列裡的**單一筆**`{type, value}`項目，呈現成一張"拙趣"風格
 * 的卡片——顯示health observation本身跟簡單的說明文字（延續
 * 規格"Display: health observation, simple explanation"）。
 * 這個元件是純函式：接收資料、回傳HTML字串，**不**呼叫任何
 * Capability/Feature/Integration程式碼，**不**做任何計算/
 * 推論，只做資料格式化跟排版。
 *
 * ## Intelligence Boundary（規格明確要求）
 *
 * 這個檔案完全不import`src/intelligence/`底下任何檔案——它
 * 只接受**已經**由Health Insight Integration（TASK1.112）
 * 產出、且已經通過`label_map.js`轉換過的資料，職責是"收集使用
 * 者互動、顯示產品輸出、處理使用者體驗"（規格原文UI
 * Responsibility），不是"分析、建議、產生洞察"（規格原文
 * Intelligence Responsibility）。
 *
 * ## Output Boundary（延續TASK1.108，規格要求"不暴露runtime
 * metadata/internal capability fields/execution
 * information"）
 *
 * 這個元件只讀取`item.type`跟`item.value`兩個欄位——這正好是
 * TASK1.111 Health Insight Feature Result Mapper已經過濾過的
 * 安全形狀（`source`/`status`/`capability`標籤已經在Feature
 * 層被拿掉，見TASK1.111/1.112既有結論），元件這裡**不會**、
 * 也**沒有能力**意外顯示這些內部欄位，因為它們根本不存在於
 * 傳入的資料形狀裡。
 */
import { escapeHtml } from './html_utils.js';
import { getObservationLabel } from './label_map.js';
import { getAssetPlaceholder } from '../assets/asset_registry.js';

/**
 * 把單一筆Health Observation項目轉換成一張卡片的HTML字串。
 *
 * @param {{type:*, value:*}} item
 * @returns {string}
 */
export function createObservationCard(item) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const { label, explanation } = getObservationLabel(safeItem.type);
  const icon = getAssetPlaceholder('observation');
  return [
    '<div class="hi-card hi-observation-card">',
    `  <div class="hi-card-icon" aria-hidden="true">${escapeHtml(icon)}</div>`,
    `  <div class="hi-card-label">${escapeHtml(label)}</div>`,
    `  <div class="hi-card-value">${escapeHtml(safeItem.value)}</div>`,
    `  <div class="hi-card-explanation">${escapeHtml(explanation)}</div>`,
    '</div>',
  ].join('\n');
}

/**
 * 把整個`healthObservation`陣列轉換成一組卡片HTML字串——陣列
 * 為空時回傳一個友善的空狀態卡片（延續"low pressure"設計
 * 原則，不是顯示冷冰冰的"No data"）。
 *
 * @param {Array<{type:*, value:*}>} healthObservation
 * @returns {string}
 */
export function createObservationCardList(healthObservation) {
  const items = Array.isArray(healthObservation) ? healthObservation : [];
  if (items.length === 0) {
    return [
      '<div class="hi-card hi-observation-card hi-empty-state">',
      `  <div class="hi-card-icon" aria-hidden="true">${escapeHtml(getAssetPlaceholder('greeting'))}</div>`,
      '  <div class="hi-card-explanation">還沒有足夠的記錄，先從今天開始累積一點點吧</div>',
      '</div>',
    ].join('\n');
  }
  return items.map((item) => createObservationCard(item)).join('\n');
}

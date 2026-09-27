/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - HTML Utilities
 *
 * 責任：提供元件共用的最小HTML組裝工具——目前只有一個HTML
 * escape函式，避免把使用者輸入/Health Insight輸出裡的內容
 * 原樣插入HTML字串時意外破壞結構或造成XSS類問題。這個檔案
 * 完全不依賴DOM/瀏覽器API，是純字串處理函式，deterministic，
 * 不讀取Date.now()/Math.random()。
 */

/**
 * 把任意值安全轉換成可以插入HTML文字節點的字串——escape
 * `&`/`<`/`>`/`"`/`'`五個字元，非字串型別先轉成字串（`null`/
 * `undefined`轉成空字串，不是字面上的"null"/"undefined"）。
 *
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

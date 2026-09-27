/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - Question Card（Input Experience：友善的問題卡片）
 *
 * 責任：呈現Input Experience要求的"引導式問題卡片"——延續
 * 規格Design direction"Avoid traditional forms. Prefer:
 * cards, selections, guided interaction"，這裡**不**產生
 * 傳統的`<form>`+`<input type="text">`+"submit"按鈕組合，而是
 * 用卡片式的選擇按鈕（chips）跟大字級的引導式輸入取代。
 *
 * 提供兩種問題卡片，對應規格列出的範例情境：
 * - `createChoiceQuestionCard()`：選擇型（例如"health goal
 *   selection"——使用者從幾個選項裡挑一個，例如減重/維持/
 *   增肌/健康生活型態）
 * - `createInputQuestionCard()`：輸入型（例如"simple health
 *   information input"——年齡/身高/體重這類需要使用者輸入
 *   數值的必要欄位，延續TASK1.107第2節A的Required Fields）
 *
 * 這兩個函式都只負責**排版跟呈現**——不做任何輸入驗證邏輯
 * （驗證留給既有Product Entry/Contract/Adapter/Health Insight
 * Feature，延續TASK1.112第3節已確認的既有驗證責任分工，UI層
 * 不重新實作驗證規則），也不知道使用者填寫的資料最終會怎麼
 * 被組裝成`rawInput`（那是規劃中的Product Feature層職責，
 * 延續TASK1.113第4節已確認的既定分工）。
 */
import { escapeHtml } from './html_utils.js';
import { getAssetPlaceholder } from '../assets/asset_registry.js';

/**
 * 選擇型問題卡片——例如health goal selection。`options`是
 * `{value, label}`陣列，每個選項用卡片式按鈕呈現，不是
 * `<select>`下拉選單。
 *
 * @param {{fieldKey:string, question:string, options:Array<{value:string, label:string}>}} config
 * @returns {string}
 */
export function createChoiceQuestionCard(config) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  const fieldKey = typeof safeConfig.fieldKey === 'string' ? safeConfig.fieldKey : '';
  const question = typeof safeConfig.question === 'string' ? safeConfig.question : '';
  const options = Array.isArray(safeConfig.options) ? safeConfig.options : [];
  const icon = getAssetPlaceholder('questionCard');

  const optionButtons = options.map((option) => {
    const safeOption = option && typeof option === 'object' ? option : {};
    return [
      `  <button type="button" class="hi-choice-option" data-field="${escapeHtml(fieldKey)}" data-value="${escapeHtml(safeOption.value)}">`,
      `    ${escapeHtml(safeOption.label)}`,
      '  </button>',
    ].join('\n');
  }).join('\n');

  return [
    `<div class="hi-card hi-question-card hi-choice-question-card" data-field="${escapeHtml(fieldKey)}">`,
    `  <div class="hi-card-icon" aria-hidden="true">${escapeHtml(icon)}</div>`,
    `  <div class="hi-card-question">${escapeHtml(question)}</div>`,
    '  <div class="hi-choice-options">',
    optionButtons,
    '  </div>',
    '</div>',
  ].join('\n');
}

/**
 * 輸入型問題卡片——例如年齡/身高/體重這類simple health
 * information input。用大字級、單一焦點的輸入框呈現，刻意跟
 * 傳統長表單的"一次塞很多欄位"風格不同（延續"guided
 * interaction"——一次只問一件事）。
 *
 * @param {{fieldKey:string, question:string, inputType?:string, unit?:string, placeholder?:string}} config
 * @returns {string}
 */
export function createInputQuestionCard(config) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  const fieldKey = typeof safeConfig.fieldKey === 'string' ? safeConfig.fieldKey : '';
  const question = typeof safeConfig.question === 'string' ? safeConfig.question : '';
  const inputType = typeof safeConfig.inputType === 'string' ? safeConfig.inputType : 'text';
  const unit = typeof safeConfig.unit === 'string' ? safeConfig.unit : '';
  const placeholder = typeof safeConfig.placeholder === 'string' ? safeConfig.placeholder : '';
  const icon = getAssetPlaceholder('questionCard');

  return [
    `<div class="hi-card hi-question-card hi-input-question-card" data-field="${escapeHtml(fieldKey)}">`,
    `  <div class="hi-card-icon" aria-hidden="true">${escapeHtml(icon)}</div>`,
    `  <div class="hi-card-question">${escapeHtml(question)}</div>`,
    '  <div class="hi-input-row">',
    `    <input type="${escapeHtml(inputType)}" class="hi-friendly-input" data-field="${escapeHtml(fieldKey)}" placeholder="${escapeHtml(placeholder)}" />`,
    unit ? `    <span class="hi-input-unit">${escapeHtml(unit)}</span>` : '',
    '  </div>',
    '</div>',
  ].filter((line) => line !== '').join('\n');
}

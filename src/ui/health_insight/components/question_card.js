/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * （TASK1.115後更新：視覺重構，見下方"TASK1.115更新"區塊）
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
 *
 * ## TASK1.115更新：視覺重構
 *
 * 延續使用者提供的Input Experience v2參考圖，問題卡改用
 * `.hi-card--bordered`邊框式樣式（不是Dashboard卡片的陰影式，
 * 見`design_tokens.js`的說明），加上真正的插畫
 * （`companion-inviting.webp`）取代emoji（💬）。選項按鈕
 * （chip）改用**依位置循環四色**的樣式規則——這是本次任務
 * 從參考圖觀察到的具體規律：每個問題的選項依照排列順序輪流
 * 使用赤陶橘/蜂蜜黃/鼠尾草綠/霧玫瑰四種顏色（`CHIP_PALETTE`），
 * **不是**依照"這個選項聽起來正不正向"去判斷顏色——刻意選擇
 * 位置循環而不是語意判斷，是為了避免在UI層引入任何形式的
 * "評估這個答案好不好"邏輯（延續"Do NOT place intelligence
 * logic inside UI"的既有邊界，位置循環純粹是呈現層的視覺
 * 節奏，不對使用者的回答做任何判斷）。
 */
import { escapeHtml } from './html_utils.js';
import { createIllustration } from './illustration.js';

/**
 * 選項Chip依位置循環使用的四個顏色——見上方檔案頭說明，純粹
 * 依陣列索引`index % 4`決定，不做任何語意判斷。
 */
const CHIP_PALETTE = ['terracotta', 'honey', 'sage', 'rose'];

/**
 * @param {number} index
 * @returns {string}
 */
function chipColorForIndex(index) {
  return CHIP_PALETTE[index % CHIP_PALETTE.length];
}

/**
 * 選擇型問題卡片——例如health goal selection。`options`是
 * `{value, label, icon?}`陣列，每個選項用卡片式按鈕呈現，不是
 * `<select>`下拉選單。`icon`是選填的小emoji/符號，只用來
 * 搭配選項文字（跟角色插畫本身是兩回事，這裡沿用參考圖裡每個
 * 選項前面搭配一個小圖示的排版習慣，不是本次任務"non-emoji"
 * 要消除的對象——角色/情境插畫才是本次任務要取代emoji的重點，
 * 選項前綴的小符號延續參考圖本身也保留類似的極簡符號用法）。
 *
 * @param {{fieldKey:string, question:string, options:Array<{value:string, label:string, icon?:string}>}} config
 * @returns {string}
 */
export function createChoiceQuestionCard(config) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  const fieldKey = typeof safeConfig.fieldKey === 'string' ? safeConfig.fieldKey : '';
  const question = typeof safeConfig.question === 'string' ? safeConfig.question : '';
  const options = Array.isArray(safeConfig.options) ? safeConfig.options : [];

  const optionButtons = options.map((option, index) => {
    const safeOption = option && typeof option === 'object' ? option : {};
    const chipColor = chipColorForIndex(index);
    const iconMarkup = typeof safeOption.icon === 'string' && safeOption.icon.length > 0
      ? `<span class="hi-chip-icon" aria-hidden="true">${escapeHtml(safeOption.icon)}</span>`
      : '';
    return [
      `  <button type="button" class="hi-chip hi-chip--${escapeHtml(chipColor)}" data-field="${escapeHtml(fieldKey)}" data-value="${escapeHtml(safeOption.value)}">`,
      `    ${iconMarkup}${escapeHtml(safeOption.label)}`,
      '  </button>',
    ].join('\n');
  }).join('\n');

  return [
    `<div class="hi-card hi-card--bordered hi-question-card hi-choice-question-card" data-field="${escapeHtml(fieldKey)}">`,
    createIllustration('questionCard'),
    '  <div class="hi-card-body">',
    `    <div class="hi-card-question">${escapeHtml(question)}</div>`,
    '    <div class="hi-choice-options">',
    optionButtons,
    '    </div>',
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

  return [
    `<div class="hi-card hi-card--bordered hi-question-card hi-input-question-card" data-field="${escapeHtml(fieldKey)}">`,
    createIllustration('questionCard', { small: true }),
    '  <div class="hi-card-body">',
    `    <div class="hi-card-question">${escapeHtml(question)}</div>`,
    '    <div class="hi-input-row">',
    `      <input type="${escapeHtml(inputType)}" class="hi-friendly-input" data-field="${escapeHtml(fieldKey)}" placeholder="${escapeHtml(placeholder)}" />`,
    unit ? `      <span class="hi-input-unit">${escapeHtml(unit)}</span>` : '',
    '    </div>',
    '  </div>',
    '</div>',
  ].filter((line) => line !== '').join('\n');
}

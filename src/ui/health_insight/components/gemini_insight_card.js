/*
 * Phase 6 TASK 1.123｜Health Insight Product Experience Upgrade
 * - Gemini Insight Card（"AI 陪伴解讀" 呈現）
 *
 * 責任：呈現Gemini Enhancement Layer（TASK1.121）+ Premium
 * Feature Boundary（TASK1.122）這兩層邏輯運算完的**結果**——這個
 * 元件是純呈現層，完全不呼叫Gemini、不判斷permission、不import
 * `src/intelligence/enhancement/gemini/`或`src/membership/`
 * 任何檔案，只接收呼叫端（`render_product_response.js`）已經
 * 算好的兩個旗標。
 *
 * ## 三種狀態（規格明確要求）
 *
 * - 有`enhancedExplanation`（Gemini這次成功且permission允許）→
 *   顯示"AI 陪伴解讀"卡片跟實際內容
 * - 沒有`enhancedExplanation`，但`geminiPermitted===true`（這個
 *   使用者的tier允許使用，只是這次Gemini技術性失敗/沒設定金鑰）
 *   → 完全不顯示任何東西（規格"When Gemini unavailable: Show
 *   original Health Insight result"——安靜降級，不暴露任何技術
 *   原因，回傳空字串）
 * - 沒有`enhancedExplanation`，且`geminiPermitted===false`
 *   （匿名或free）→ 顯示一張"會員專屬"邊界卡片，純粹是
 *   experience boundary展示，**不含任何付款/升級連結**（規格
 *   明確禁止"payment page"/"subscription page"，這裡只用文字
 *   說明，沒有任何`<a href>`/導向連結）
 *
 * 明確不呈現：AI reasoning、model名稱、任何技術資訊——`
 * enhancedExplanation`本身已經是Gemini Enhancement Layer Output
 * Boundary（TASK1.121既有）過濾過的安全字串，這個元件不做任何
 * 額外解讀，只負責排版。
 *
 * 延續"這是幫助理解，不是取代健康判斷"的規格原文——卡片底部
 * 用CTA標籤文字直接傳達這句話，不使用會製造焦慮感的醫療用語。
 */
import { escapeHtml } from './html_utils.js';
import { createIllustration } from './illustration.js';
import { createCardHeader } from './card_header.js';
import { createCardCta } from './card_cta.js';

/**
 * @param {{isAuthenticated?:boolean, geminiPermitted?:boolean, enhancedExplanation?:string|null}} [context]
 * @returns {string} 空字串代表這次不顯示任何東西（安靜降級，延續整個系列"Gemini failure must NOT break Health Insight"既有原則的UI落地）
 */
export function createGeminiInsightCard(context) {
  const safeContext = context && typeof context === 'object' ? context : {};
  const explanation = typeof safeContext.enhancedExplanation === 'string' ? safeContext.enhancedExplanation.trim() : '';

  if (explanation) {
    return [
      '<div class="hi-card hi-gemini-insight-card">',
      createIllustration('recommendation'),
      '  <div class="hi-card-body">',
      createCardHeader({ title: 'AI 陪伴解讀', underline: 'honey' }),
      `    <div class="hi-card-explanation">${escapeHtml(explanation)}</div>`,
      createCardCta({ label: '這是幫助理解，不是取代健康判斷', accent: 'honey', action: 'gemini-insight-disclaimer' }),
      '  </div>',
      '</div>',
    ].join('\n');
  }

  if (safeContext.geminiPermitted) {
    return '';
  }

  const lockedText = safeContext.isAuthenticated
    ? '升級會員即可解鎖，讓陪伴角色幫你把今天的洞察說得更貼心一點'
    : '登入之後，會員可以解鎖這個功能，讓陪伴角色幫你把今天的洞察說得更貼心一點';

  return [
    '<div class="hi-card hi-gemini-insight-card hi-gemini-insight-card--locked hi-placeholder-card">',
    createIllustration('questionCard'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: 'AI 陪伴解讀 · 會員專屬', underline: 'muted' }),
    `    <div class="hi-card-explanation">${escapeHtml(lockedText)}</div>`,
    createCardCta({ label: '敬請期待', accent: 'muted', action: 'gemini-insight-locked' }),
    '  </div>',
    '</div>',
  ].join('\n');
}

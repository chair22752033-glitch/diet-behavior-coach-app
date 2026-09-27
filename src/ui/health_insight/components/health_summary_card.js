/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * （TASK1.115後更新：視覺重構，見下方"TASK1.115更新"區塊）
 * - Health Summary Card（Today's Insight Summary）
 *
 * 責任：呈現Dashboard最上方的"今日摘要"——一段簡短、友善的
 * 整體概覽，延續規格"Show a simple overview of user's current
 * state"。這個元件**只讀取陣列長度**（`.length`），完全不讀取
 * 陣列元素的實際內容/數值，也不做任何加總、平均、比較、判斷
 * ——這是刻意的邊界，延續TASK1.44/1.87/1.111反覆確認的"只做
 * 事實計數，不做評分/判斷"既有哲學，確保這個UI元件不會不小心
 * 變成一個新的、UI層級的分析邏輯。
 *
 * ## Do NOT create fake intelligence logic（規格明確要求）
 *
 * 這個元件**不會**在沒有真實資料時編造一段"你今天表現得很好"
 * 這類聽起來像是分析結果、但實際上是憑空產生的文字——摘要文字
 * 只依據"陣列是否為空/有幾筆"這個結構性事實產生，空的時候顯示
 * 鼓勵但誠實的引導文字，不假裝有分析內容。
 *
 * ## TASK1.115更新：視覺重構
 *
 * 延續使用者提供的參考圖跟`DESIGN_SPECIFICATION.md`第7節既有
 * 對照結論——把emoji圖示（🌱）換成真正的插畫
 * （`companion-greeting.webp`，角色抱心歡迎），標題下方新增
 * 赤陶橘手繪底線裝飾，底部新增"查看詳細紀錄"行動小標籤（純
 * 樣式，未綁定任何互動邏輯）。文字/計數邏輯本身完全沒有改變。
 */
import { escapeHtml } from './html_utils.js';
import { createIllustration } from './illustration.js';
import { createCardHeader } from './card_header.js';
import { createCardCta } from './card_cta.js';

/**
 * @param {{healthObservation?:Array, recommendation?:Array}} healthInsightOutput - TASK1.108/1.111/1.112既有輸出形狀的其中兩個欄位，其餘欄位（behaviorPattern/progressTrend/decision）這個元件不需要
 * @returns {string}
 */
export function createHealthSummaryCard(healthInsightOutput) {
  const output = healthInsightOutput && typeof healthInsightOutput === 'object' ? healthInsightOutput : {};
  const observationCount = Array.isArray(output.healthObservation) ? output.healthObservation.length : 0;
  const recommendationCount = Array.isArray(output.recommendation) ? output.recommendation.length : 0;

  const summaryText = observationCount === 0
    ? '今天先從記錄一點點開始，我會陪你一起看看'
    : `今天幫你整理了 ${observationCount} 項觀察${recommendationCount > 0 ? `，還有 ${recommendationCount} 個小建議` : ''}`;

  return [
    '<div class="hi-card hi-health-summary-card">',
    createIllustration('greeting'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: '今日摘要', underline: 'terracotta' }),
    `    <div class="hi-card-explanation">${escapeHtml(summaryText)}</div>`,
    createCardCta({ label: '查看詳細紀錄', accent: 'terracotta', action: 'view-summary-details' }),
    '  </div>',
    '</div>',
  ].join('\n');
}
